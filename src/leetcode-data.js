import { calculateActivityStats, normalizeActivity, utcDay } from "./leetcode-stats.js";

const ENDPOINT = "https://leetcode.com/graphql";
const QUERY = `query LeetCodeProfile($username: String!, $currentYear: Int, $previousYear: Int) {
  matchedUser(username: $username) {
    username
    current: userCalendar(year: $currentYear) { submissionCalendar }
    previous: userCalendar(year: $previousYear) { submissionCalendar }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
  }
  allQuestionsCount { difficulty count }
  userProfileUserQuestionProgressV2(userSlug: $username) {
    numFailedQuestions { difficulty count }
    numUntouchedQuestions { difficulty count }
  }
}`;

const DIFFICULTIES = ["All", "Easy", "Medium", "Hard"];

export function validateLeetCodeUsername(username) {
  if (typeof username !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(username)) {
    throw new Error("LeetCode username must be 1–64 letters, digits, underscores, dots or hyphens");
  }
  return username;
}

function parseCalendar(value, label) {
  if (typeof value !== "string") throw new Error(`Missing ${label} submission calendar`);
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`Invalid ${label} submission calendar JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${label} submission calendar structure`);
  }
  return parsed;
}

function parseCounts(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Missing ${label} counts`);
  const result = {};
  for (const row of rows) {
    if (!row || !DIFFICULTIES.includes(row.difficulty) ||
        !Number.isInteger(row.count) || row.count < 0 ||
        Object.hasOwn(result, row.difficulty)) {
      throw new Error(`Invalid ${label} counts`);
    }
    result[row.difficulty] = row.count;
  }
  if (DIFFICULTIES.some((difficulty) => !Object.hasOwn(result, difficulty)) ||
      result.All !== result.Easy + result.Medium + result.Hard) {
    throw new Error(`Incomplete ${label} counts`);
  }
  return {
    total: result.All,
    easy: result.Easy,
    medium: result.Medium,
    hard: result.Hard,
  };
}

function parseProgressRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 3) return null;
  const result = {};
  for (const row of rows) {
    const key = typeof row?.difficulty === "string" ? row.difficulty.toLowerCase() : null;
    if (!["easy", "medium", "hard"].includes(key) ||
        !Number.isInteger(row.count) || row.count < 0 || Object.hasOwn(result, key)) return null;
    result[key] = row.count;
  }
  return Object.keys(result).length === 3 ? result : null;
}

function parseAttempting(progress, solved, available) {
  const failed = parseProgressRows(progress?.numFailedQuestions);
  const untouched = parseProgressRows(progress?.numUntouchedQuestions);
  if (!failed || !untouched) return null;
  for (const key of ["easy", "medium", "hard"]) {
    if (solved[key] + failed[key] + untouched[key] !== available[key]) return null;
  }
  return failed.easy + failed.medium + failed.hard;
}

/** Validate the GraphQL payload and return renderer-independent profile data. */
export function parseLeetCodeProfile(payload, username, endDate = new Date(), options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid LeetCode GraphQL response");
  }
  if (Array.isArray(payload.errors) && payload.errors.length) {
    throw new Error(`LeetCode GraphQL error: ${payload.errors[0]?.message || "unknown error"}`);
  }
  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("Missing LeetCode GraphQL data");
  }
  const user = payload.data.matchedUser;
  if (user === null) throw new Error(`LeetCode user "${username}" was not found`);
  if (!user || typeof user.username !== "string" || !user.username) {
    throw new Error("Invalid LeetCode user profile");
  }
  const calendars = [
    parseCalendar(user.current?.submissionCalendar, "current-year"),
    parseCalendar(user.previous?.submissionCalendar, "previous-year"),
  ];
  const activity = normalizeActivity(calendars, endDate, options);
  const solved = parseCounts(user.submitStatsGlobal?.acSubmissionNum, "solved problem");
  const available = parseCounts(payload.data.allQuestionsCount, "available problem");
  for (const key of ["total", "easy", "medium", "hard"]) {
    if (solved[key] > available[key]) throw new Error(`Solved ${key} count exceeds available count`);
  }
  return {
    username: user.username,
    ...activity,
    activity: calculateActivityStats(activity.days),
    solved,
    available,
    // Public progress counts failed (attempted but unsolved) questions by difficulty.
    // Leave this unavailable if LeetCode omits or changes that optional response.
    attempting: parseAttempting(payload.data.userProfileUserQuestionProgressV2, solved, available),
  };
}

/** Fetch public data with bounded timeouts and exponential retry for transient failures. */
export async function fetchLeetCodeProfile(username, options = {}) {
  validateLeetCodeUsername(username);
  const { now = new Date(), fetchImpl = fetch, retries = 3, timeoutMs = 10_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), thresholds } = options;
  if (!Number.isInteger(retries) || retries < 1 || retries > 5) throw new Error("retries must be between 1 and 5");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be positive");
  const year = utcDay(now).getUTCFullYear();
  const body = JSON.stringify({ query: QUERY, variables: {
    username, currentYear: year, previousYear: year - 1,
  } });

  for (let attempt = 0; attempt < retries; attempt++) {
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Referer: "https://leetcode.com/" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt + 1 === retries) throw new Error(`LeetCode request failed: ${error.message}`, { cause: error });
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt + 1 === retries) throw new Error(`LeetCode HTTP ${response.status} after ${retries} attempts`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (!response.ok) throw new Error(`LeetCode HTTP ${response.status}`);
    let payload;
    try { payload = await response.json(); } catch { throw new Error("LeetCode returned invalid JSON"); }
    return parseLeetCodeProfile(payload, username, now, { thresholds });
  }
}
