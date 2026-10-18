const DAY_MS = 86_400_000;

/** A UTC calendar day, independent of the machine's local timezone. */
export function utcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid calendar date");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Use the 25th, 50th and 75th percentiles of active-day counts. Ties stay at
 * the same level; zero is always level 0. Callers may provide three ascending
 * nonnegative integer thresholds instead.
 */
export function activityThresholds(counts, customThresholds) {
  if (customThresholds !== undefined) {
    if (!Array.isArray(customThresholds) || customThresholds.length !== 3 ||
        customThresholds.some((n) => !Number.isInteger(n) || n < 0) ||
        customThresholds.some((n, i) => i > 0 && n < customThresholds[i - 1])) {
      throw new Error("Activity thresholds must be three ascending nonnegative integers");
    }
    return [...customThresholds];
  }
  const active = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (!active.length) return [0, 0, 0];
  return [0.25, 0.5, 0.75].map((q) => active[Math.ceil(q * active.length) - 1]);
}

export function activityLevel(count, thresholds) {
  if (count === 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

/** Fill the inclusive 365-day UTC window ending on today. */
export function normalizeActivity(calendars, endDate = new Date(), options = {}) {
  const end = utcDay(endDate);
  const start = new Date(end.getTime() - 364 * DAY_MS);
  const counts = new Map();
  for (const calendar of calendars) {
    if (!calendar || typeof calendar !== "object" || Array.isArray(calendar)) {
      throw new Error("LeetCode submission calendar must be an object");
    }
    for (const [timestamp, count] of Object.entries(calendar)) {
      const seconds = Number(timestamp);
      if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(seconds) ||
          !Number.isInteger(count) || count < 0) {
        throw new Error("LeetCode submission calendar contains an invalid entry");
      }
      const date = new Date(seconds * 1000);
      if (Number.isNaN(date.getTime())) throw new Error("Invalid LeetCode calendar timestamp");
      const day = date.toISOString().slice(0, 10);
      if (counts.has(day) && counts.get(day) !== count) {
        throw new Error(`Conflicting LeetCode calendar counts for ${day}`);
      }
      counts.set(day, count);
    }
  }

  const windowCounts = Array.from({ length: 365 }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return counts.get(date) ?? 0;
  });
  const thresholds = activityThresholds(windowCounts, options.thresholds);
  const firstWeekday = start.getUTCDay();
  const days = windowCounts.map((count, i) => ({
    date: new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    count,
    level: activityLevel(count, thresholds),
    week: Math.floor((i + firstWeekday) / 7),
  }));
  return { days, thresholds, from: days[0].date, to: days.at(-1).date };
}

/** Convert the normalized ISO dates to the Date objects expected by layoutChart(). */
export function toRendererDays(days) {
  return days.map((day) => ({ ...day, date: new Date(`${day.date}T00:00:00.000Z`) }));
}

export function calculateActivityStats(days) {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let totalSubmissions = 0;
  let activeDays = 0;
  let longestStreak = 0;
  let streak = 0;
  let bestDay = null;
  let previousDate = null;
  for (const day of ordered) {
    totalSubmissions += day.count;
    if (day.count > 0) {
      activeDays++;
      streak = previousDate && Date.parse(`${day.date}T00:00:00Z`) -
        Date.parse(`${previousDate}T00:00:00Z`) === DAY_MS ? streak + 1 : 1;
      longestStreak = Math.max(longestStreak, streak);
      if (!bestDay || day.count > bestDay.count) bestDay = { date: day.date, count: day.count };
    } else {
      streak = 0;
    }
    previousDate = day.date;
  }
  // Today can be empty without ending yesterday's streak.
  let index = ordered.length - 1;
  if (index >= 0 && ordered[index].count === 0) index--;
  let currentStreak = 0;
  if (index >= 0 && index < ordered.length - 1 &&
      Date.parse(`${ordered[index + 1].date}T00:00:00Z`) -
        Date.parse(`${ordered[index].date}T00:00:00Z`) !== DAY_MS) index = -1;
  while (index >= 0 && ordered[index].count > 0) {
    currentStreak++;
    if (index > 0 && Date.parse(`${ordered[index].date}T00:00:00Z`) -
        Date.parse(`${ordered[index - 1].date}T00:00:00Z`) !== DAY_MS) break;
    index--;
  }
  return {
    totalSubmissions,
    activeDays,
    longestStreak,
    currentStreak,
    averagePerDay: ordered.length ? totalSubmissions / ordered.length : 0,
    bestDay,
  };
}
