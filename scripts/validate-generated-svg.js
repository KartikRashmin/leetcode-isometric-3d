import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const NS = "http://www.w3.org/2000/svg";
const DIFFICULTIES = ["easy", "medium", "hard"];

function numberFrom(text, expression, label) {
  const match = text.match(expression);
  assert.ok(match, `Missing ${label} in SVG description`);
  return match.slice(1).map(Number);
}

/** Validate live output without pinning values that can change on LeetCode. */
export function validateGeneratedSvg(darkPath, lightPath, username = "KartikRashmin", now = new Date()) {
  const results = [];
  for (const [theme, path, background] of [
    ["dark", darkPath, "#0d1117"], ["light", lightPath, "#ffffff"],
  ]) {
    const doc = new JSDOM(readFileSync(path, "utf8"), { contentType: "image/svg+xml" }).window.document;
    const svg = doc.documentElement;
    assert.equal(svg.localName, "svg");
    assert.equal(svg.namespaceURI, NS);
    assert.equal(svg.getAttribute("width"), "1000");
    assert.equal(svg.getAttribute("height"), "600");
    assert.equal(svg.getAttribute("viewBox"), "0 0 1000 600");
    assert.equal(svg.querySelector(":scope > rect")?.getAttribute("fill"), background);
    assert.match(svg.querySelector("title")?.textContent || "", new RegExp(`@${username}: \\d+ solved problems`));
    const description = svg.querySelector("desc")?.textContent || "";
    const [from, to] = description.match(/UTC (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\./)?.slice(1) || [];
    assert.ok(from && to, "Missing UTC window");
    assert.equal((Date.parse(to) - Date.parse(from)) / 86400000, 364);
    const ageDays = (now.getTime() - Date.parse(to)) / 86400000;
    assert.ok(ageDays >= 0 && ageDays < 2, "Displayed window does not end on the current UTC day");

    const [submissions, activeDays] = numberFrom(description, /(\d+) submissions, (\d+) active days/, "activity totals");
    const [longestStreak, currentStreak] = numberFrom(description,
      /Longest streak in 365 days: (\d+); current streak: (\d+)/, "streaks");
    const [totalSolved, totalAvailable] = numberFrom(description,
      /All-time solved: (\d+) of (\d+)/, "all-time solved counts");
    assert.ok(totalSolved > 0 && totalSolved <= totalAvailable);
    assert.ok(submissions >= activeDays && activeDays <= 365);
    assert.ok(currentStreak <= longestStreak && longestStreak <= activeDays);
    assert.ok(svg.querySelector("#leetcode-solved-panel"), "Missing leetcode-solved-panel");
    assert.ok(svg.querySelector("#leetcode-activity-panel"), "Missing leetcode-activity-panel");
    assert.ok(svg.querySelector("#leetcode-solved"), "Missing solved ring section");
    assert.ok(svg.querySelector("#leetcode-activity"), "Missing activity section");
    assert.equal(svg.querySelectorAll('.iso-cubes path[class^="t"]').length, 365);

    let difficultySum = 0;
    for (const difficulty of DIFFICULTIES) {
      const title = difficulty[0].toUpperCase() + difficulty.slice(1);
      const [solved, available] = numberFrom(description,
        new RegExp(`${title}: (\\d+) of (\\d+)`), `${title} counts`);
      difficultySum += solved;
      assert.ok(solved <= available);
      const group = svg.querySelector(`[data-difficulty="${difficulty}"]`);
      assert.equal(group?.getAttribute("aria-label"), `${title}: ${solved} of ${available} solved`);
      assert.ok(group.querySelector('[data-ring="track"]'));
      const progress = group.querySelector('[data-ring="progress"]');
      if (solved > 0) {
        assert.ok(progress);
        assert.ok(Math.abs(Number(progress.getAttribute("data-progress")) - solved / available) < 1e-12);
      } else assert.equal(progress, null);
    }
    assert.equal(difficultySum, totalSolved);
    assert.equal(svg.querySelectorAll("script, image, foreignObject").length, 0);
    for (const node of svg.querySelectorAll("[href]")) assert.ok(node.getAttribute("href").startsWith("#"));
    results.push({ theme, description, submissions, activeDays, longestStreak, currentStreak,
      totalSolved, totalAvailable,
      cubePaths: [...svg.querySelectorAll('.iso-cubes path[class^="t"]')]
        .map((node) => [node.getAttribute("class"), node.getAttribute("d")]),
    });
  }
  assert.equal(results[0].description, results[1].description, "Themes disagree on profile statistics");
  assert.deepEqual(results[0].cubePaths, results[1].cubePaths, "Themes disagree on graph geometry");
  return { username, totalSolved: results[0].totalSolved, totalAvailable: results[0].totalAvailable,
    submissions: results[0].submissions, activeDays: results[0].activeDays,
    longestStreak: results[0].longestStreak, currentStreak: results[0].currentStreak };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 4, "Usage: node scripts/validate-generated-svg.js DARK.svg LIGHT.svg");
    console.log(JSON.stringify(validateGeneratedSvg(process.argv[2], process.argv[3])));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
