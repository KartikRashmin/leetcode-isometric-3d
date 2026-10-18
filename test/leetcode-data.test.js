import test from "node:test";
import assert from "node:assert/strict";
import { fetchLeetCodeProfile, parseLeetCodeProfile, validateLeetCodeUsername } from "../src/leetcode-data.js";
import { activityLevel, calculateActivityStats, normalizeActivity, toRendererDays } from "../src/leetcode-stats.js";

const timestamp = (date) => String(Date.parse(`${date}T00:00:00.000Z`) / 1000);
const counts = (all, easy, medium, hard) => [
  ["All", all], ["Easy", easy], ["Medium", medium], ["Hard", hard],
].map(([difficulty, count]) => ({ difficulty, count }));

function fixture(current = {}, previous = {}) {
  return { data: {
    matchedUser: {
      username: "example_user",
      current: { submissionCalendar: JSON.stringify(current) },
      previous: { submissionCalendar: JSON.stringify(previous) },
      submitStatsGlobal: { acSubmissionNum: counts(86, 34, 49, 3) },
    },
    allQuestionsCount: counts(4086, 972, 2130, 984),
    userProfileUserQuestionProgressV2: {
      numFailedQuestions: counts(4, 2, 1, 1).slice(1).map((row) => ({ ...row, difficulty: row.difficulty.toUpperCase() })),
      numUntouchedQuestions: counts(3996, 936, 2080, 980).slice(1)
        .map((row) => ({ ...row, difficulty: row.difficulty.toUpperCase() })),
    },
  } };
}

test("valid profile parses all-time solved counts separately from daily submissions", () => {
  const profile = parseLeetCodeProfile(fixture({ [timestamp("2026-10-19")]: 5 }),
    "example_user", new Date("2026-10-19T20:00:00Z"));
  assert.equal(profile.days.length, 365);
  assert.deepEqual(profile.solved, { total: 86, easy: 34, medium: 49, hard: 3 });
  assert.deepEqual(profile.available, { total: 4086, easy: 972, medium: 2130, hard: 984 });
  assert.equal(profile.activity.totalSubmissions, 5);
  assert.equal(profile.attempting, 4);
  assert.equal(profile.days.at(-1).date, "2026-10-19");
  assert.equal(profile.activity.currentStreak, 1);
  assert.equal(toRendererDays(profile.days).at(-1).date.toISOString(), "2026-10-19T00:00:00.000Z");
});

test("365-day UTC window fills gaps and crosses a leap day and year boundary", () => {
  const result = normalizeActivity([
    { [timestamp("2024-02-29")]: 3, [timestamp("2024-12-31")]: 4 },
    { [timestamp("2025-01-01")]: 2, [timestamp("2025-02-28")]: 1 },
  ], new Date("2025-02-28T23:59:59Z"));
  assert.equal(result.from, "2024-03-01");
  assert.equal(result.to, "2025-02-28");
  assert.equal(result.days.length, 365);
  assert.equal(result.days.find((d) => d.date === "2024-12-31").count, 4);
  assert.equal(result.days.find((d) => d.date === "2025-01-01").count, 2);
  assert.equal(result.days[0].week, 0);
  assert.equal(result.days[2].week, 1); // March 1, 2024 was Friday.
  const leap = normalizeActivity([{ [timestamp("2024-02-29")]: 3 }], new Date("2024-03-01"));
  assert.equal(leap.days.find((d) => d.date === "2024-02-29").count, 3);
  const localMidnight = normalizeActivity([{}], new Date("2026-10-19T00:30:00+05:30"));
  assert.equal(localMidnight.to, "2026-10-18");
  assert.equal(localMidnight.from, "2025-10-19");
});

test("activity levels use active-day quartiles and accept configured thresholds", () => {
  const entries = {};
  for (let i = 1; i <= 8; i++) entries[timestamp(`2026-10-${String(i).padStart(2, "0")}`)] = i;
  const result = normalizeActivity([entries], new Date("2026-10-19"));
  assert.deepEqual(result.thresholds, [2, 4, 6]);
  assert.deepEqual(result.days.filter((d) => d.count).map((d) => d.level), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(activityLevel(0, [1, 2, 3]), 0);
  assert.deepEqual(normalizeActivity([{}], new Date("2026-10-19")).thresholds, [0, 0, 0]);
  assert.equal(normalizeActivity([entries], new Date("2026-10-19"), { thresholds: [1, 3, 5] })
    .days.find((d) => d.count === 2).level, 2);
});

test("activity stats count days, streaks, best day and yesterday grace", () => {
  const entries = {
    [timestamp("2025-12-31")]: 2,
    [timestamp("2026-01-01")]: 3,
    [timestamp("2026-10-17")]: 1,
    [timestamp("2026-10-18")]: 4,
  };
  const { days } = normalizeActivity([entries], new Date("2026-10-19"));
  assert.deepEqual(calculateActivityStats(days), {
    totalSubmissions: 10, activeDays: 4, longestStreak: 2, currentStreak: 2,
    averagePerDay: 10 / 365, bestDay: { date: "2026-10-18", count: 4 },
  });
  assert.equal(calculateActivityStats(normalizeActivity([{}], new Date("2026-10-19")).days).currentStreak, 0);
  const stale = normalizeActivity([{ [timestamp("2026-10-17")]: 1 }], new Date("2026-10-19"));
  assert.equal(calculateActivityStats(stale.days).currentStreak, 0);
  assert.equal(calculateActivityStats([
    { date: "2026-10-18", count: 1 }, { date: "2026-10-16", count: 1 },
  ]).longestStreak, 1);
});

test("rejects missing, malformed and inconsistent public data", () => {
  assert.throws(() => validateLeetCodeUsername("bad name"), /username/);
  assert.throws(() => parseLeetCodeProfile({ data: { matchedUser: null } }, "missing"), /not found/);
  assert.throws(() => parseLeetCodeProfile({ errors: [{ message: "Denied" }] }, "x"), /Denied/);
  assert.throws(() => parseLeetCodeProfile({}, "x"), /GraphQL data/);
  const noCalendar = fixture();
  delete noCalendar.data.matchedUser.current;
  assert.throws(() => parseLeetCodeProfile(noCalendar, "x"), /calendar/);
  const badCalendar = fixture();
  badCalendar.data.matchedUser.current.submissionCalendar = "not JSON";
  assert.throws(() => parseLeetCodeProfile(badCalendar, "x"), /JSON/);
  const badCount = fixture({ [timestamp("2026-10-19")]: -1 });
  assert.throws(() => parseLeetCodeProfile(badCount, "x"), /invalid entry/);
  const badSolved = fixture();
  badSolved.data.matchedUser.submitStatsGlobal.acSubmissionNum = counts(2, 1, 0, 0);
  assert.throws(() => parseLeetCodeProfile(badSolved, "x"), /Incomplete solved/);
  const noProgress = fixture();
  delete noProgress.data.userProfileUserQuestionProgressV2;
  assert.equal(parseLeetCodeProfile(noProgress, "x").attempting, null);
  const badProgress = fixture();
  badProgress.data.userProfileUserQuestionProgressV2.numFailedQuestions[0].count = 999;
  assert.equal(parseLeetCodeProfile(badProgress, "x").attempting, null);
  badProgress.data.userProfileUserQuestionProgressV2.numFailedQuestions[0].difficulty = 42;
  assert.equal(parseLeetCodeProfile(badProgress, "x").attempting, null);
});

test("retries HTTP 429 and 5xx with exponential backoff", async () => {
  const statuses = [429, 503, 200];
  const delays = [];
  const profile = await fetchLeetCodeProfile("example_user", {
    now: new Date("2026-10-19"),
    sleep: async (ms) => delays.push(ms),
    fetchImpl: async (_url, request) => {
      assert.equal(request.method, "POST");
      assert.deepEqual(JSON.parse(request.body).variables, {
        username: "example_user", currentYear: 2026, previousYear: 2025,
      });
      const status = statuses.shift();
      return { status, ok: status === 200, json: async () => fixture() };
    },
  });
  assert.equal(profile.solved.total, 86);
  assert.deepEqual(delays, [500, 1000]);
});

test("persistent rate limits and non-retryable errors fail clearly", async () => {
  await assert.rejects(fetchLeetCodeProfile("example_user", {
    retries: 2, sleep: async () => {}, fetchImpl: async () => ({ status: 429, ok: false }),
  }), /HTTP 429 after 2 attempts/);
  await assert.rejects(fetchLeetCodeProfile("example_user", {
    fetchImpl: async () => ({ status: 403, ok: false }),
  }), /HTTP 403/);
});
