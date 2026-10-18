import { normalizeActivity, calculateActivityStats } from "../../src/leetcode-stats.js";

// Synthetic profiles for offline tests and explicitly labelled visual examples.
export function profileFixture(kind = "mixed") {
  const end = new Date("2026-03-01T00:00:00Z");
  const calendar = {};
  for (let i = 0; i < 365; i++) {
    const count = kind === "zero" ? 0 : kind === "high" ? 40 + i % 21 : i % 9;
    calendar[String((end.getTime() - (364 - i) * 86400000) / 1000)] = count;
  }
  const activity = normalizeActivity([calendar], end);
  return {
    username: `example-${kind}`,
    ...activity,
    activity: calculateActivityStats(activity.days),
    solved: kind === "zero" ? { total: 0, easy: 0, medium: 0, hard: 0 }
      : { total: 1234, easy: 321, medium: 800, hard: 113 },
    available: { total: 8000, easy: 2000, medium: 4000, hard: 2000 },
    attempting: kind === "zero" ? null : 7,
  };
}
