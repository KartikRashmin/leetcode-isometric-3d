import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createCanvas, loadImage } from "canvas";
import { renderSVG, renderLeetCodeSVG } from "../src/svg-renderer.js";
import { layoutChart, getCubeColor, renderWithStats } from "../src/renderer.js";
import { toRendererDays } from "../src/leetcode-stats.js";
import { LEETCODE_THEMES } from "../src/leetcode-theme.js";
import { DARK_THEME } from "../src/theme-config.js";
import { profileFixture } from "./fixtures/leetcode-profile.js";

const documentFor = (svg) => new JSDOM(svg, { contentType: "image/svg+xml" }).window.document;
const profile = profileFixture();

test("LeetCode shares the original renderer's cube geometry and projected SVG paths", () => {
  const days = toRendererDays(profile.days);
  const original = documentFor(renderSVG(days, { theme: DARK_THEME }));
  const leetcode = documentFor(renderLeetCodeSVG(profile));
  const paths = (doc) => [...doc.querySelectorAll(".iso-cubes path")].map((p) => [p.getAttribute("class"), p.getAttribute("d")]);
  assert.deepEqual(paths(leetcode), paths(original));
  assert.equal(leetcode.querySelectorAll('.iso-cubes path[class^="t"]').length, 365);
  const layout = layoutChart(days, { theme: LEETCODE_THEMES.dark });
  assert.equal(layout.cubeSize, 16);
  assert.equal(layout.offsetX, 130);
  for (const cube of layout.cubes) {
    assert.equal(cube.height, 3 + Math.round(100 * cube.day.count / 8));
    assert.equal(cube.color, LEETCODE_THEMES.dark.graph.colors[`level${cube.day.level}`]);
  }
});

test("dark and light themes use upstream face shading with orange palettes", () => {
  for (const theme of Object.values(LEETCODE_THEMES)) {
    const doc = documentFor(renderLeetCodeSVG(profile, { theme }));
    const style = doc.querySelector("style").textContent;
    assert.equal(doc.querySelector('svg > rect').getAttribute("fill"), theme.background);
    for (const color of Object.values(theme.graph.colors)) {
      const shade = getCubeColor(color);
      for (const face of [shade.horizontal, shade.left, shade.right]) {
        assert.ok(style.includes(`#${(face & 0xffffff).toString(16).padStart(6, "0")}`));
      }
    }
    assert.equal(doc.querySelector('#leetcode-solved-panel').getAttribute('rx'), '8');
    assert.equal(doc.querySelector('#leetcode-solved-panel').getAttribute('stroke-width'), '2');
    assert.equal(doc.querySelector('#leetcode-activity-panel').getAttribute('width'), '280');
    assert.equal(doc.querySelector('#leetcode-activity-panel').getAttribute('height'), '68');
    assert.equal(doc.querySelector('#leetcode-logo').querySelectorAll('path').length, 3);
    assert.equal(doc.querySelector('#leetcode-logo path').getAttribute('fill'), '#ffa116');
    assert.equal(doc.querySelector('#leetcode-logo path:last-child').getAttribute('fill'), theme.label.color);
    for (const [index, difficulty] of ["easy", "medium", "hard"].entries()) {
      const group = doc.querySelector(`[data-difficulty="${difficulty}"]`);
      const label = difficulty[0].toUpperCase() + difficulty.slice(1);
      assert.equal(group.querySelector(`[aria-label="${label}"]`).getAttribute("fill"), theme.difficultyLabel[index]);
      assert.equal(group.querySelector('[data-ring="track"]').getAttribute("stroke"), theme.difficulty[index]);
    }
  }
});

test("live-model fields drive labels and ring fractions, with distinct submissions and solves", () => {
  const doc = documentFor(renderLeetCodeSVG(profile));
  const labels = [...doc.querySelectorAll("[aria-label]")].map((n) => n.getAttribute("aria-label"));
  for (const value of [profile.solved.total, profile.activity.totalSubmissions, profile.activity.activeDays,
    profile.activity.longestStreak]) assert.ok(labels.includes(String(value)));
  assert.ok(labels.includes("Active Days"));
  assert.ok(labels.includes("Max Streak"));
  assert.equal(labels.includes("Current Streak"), false);
  assert.equal(labels.some((label) => label.includes("Attempting")), false);
  for (const key of ["easy", "medium", "hard"]) {
    const progress = doc.querySelector(`[data-difficulty="${key}"] [data-ring="progress"]`);
    assert.equal(Number(progress.getAttribute("data-progress")), profile.solved[key] / profile.available[key]);
  }
  assert.match(doc.querySelector("desc").textContent, /All-time solved: 1234 of 8000/);
  assert.ok(doc.querySelector("desc").textContent.includes(`${profile.activity.totalSubmissions} submissions`));
  assert.equal(doc.querySelector('[aria-label="86"]'), null);
});

test("zero activity renders without removed metrics or invalid arcs", () => {
  const empty = profileFixture("zero");
  const svg = renderLeetCodeSVG(empty);
  const doc = documentFor(svg);
  assert.equal(doc.querySelectorAll('[data-ring="progress"]').length, 0);
  assert.equal(doc.querySelectorAll('[data-ring="track"]').length, 3);
  assert.doesNotMatch(svg, /Attempting|Current Streak|current streak/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.ok(layoutChart(toRendererDays(empty.days)).cubes.every((c) => c.height === 3));
});

test("all cubes stay inside the canvas and clear of statistics panels at maximum activity", () => {
  for (const kind of ["zero", "mixed", "high"]) {
    const data = profileFixture(kind);
    const doc = documentFor(renderLeetCodeSVG(data));
    const panels = [...doc.querySelectorAll('rect[id$="-panel"]')].map((n) => ({
      x: Number(n.getAttribute("x")), y: Number(n.getAttribute("y")),
      w: Number(n.getAttribute("width")), h: Number(n.getAttribute("height")),
    }));
    const { cubes, cubeSize: size, offsetX, offsetY } = layoutChart(toRendererDays(data.days));
    for (const { x, y, height } of cubes) {
      const box = { x: offsetX + x - y - size, y: offsetY + (x + y) / 2 - height, w: 2 * size, h: size + height };
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1000 && box.y + box.h <= 600);
      for (const p of panels) assert.ok(box.x + box.w <= p.x || box.x >= p.x + p.w || box.y + box.h <= p.y || box.y >= p.y + p.h);
    }
  }
});

test("SVG escapes user text and contains no scripts, external assets or invalid XML", () => {
  const svg = renderLeetCodeSVG({ ...profile, username: 'test<&"onload="bad' }, { heading: 'Solved <script>&"' });
  const doc = documentFor(svg);
  assert.equal(doc.querySelectorAll("script, image, foreignObject, parsererror").length, 0);
  for (const node of doc.querySelectorAll("[href]")) assert.ok(node.getAttribute("href").startsWith("#"));
  for (const node of doc.querySelectorAll("*")) {
    assert.ok([...node.attributes].every((a) => !a.name.startsWith("on")));
  }
  assert.ok(doc.querySelector("title").textContent.includes('test<&"onload="bad'));
});

test("fixed input produces deterministic SVGs and responsive dimensions preserve the viewBox", () => {
  assert.equal(renderLeetCodeSVG(profile), renderLeetCodeSVG(profile));
  const doc = documentFor(renderLeetCodeSVG(profile, { width: 640, height: 384 }));
  assert.equal(doc.documentElement.getAttribute("width"), "640");
  assert.equal(doc.documentElement.getAttribute("viewBox"), "0 0 1000 600");
  assert.throws(() => renderLeetCodeSVG(profile, { width: -1 }), /dimensions/);
  const bare = documentFor(renderLeetCodeSVG(profile, { stats: false, credit: false }));
  assert.equal(bare.querySelector("#leetcode-solved"), null);
  assert.ok(bare.querySelector("#leetcode-logo"));
  assert.equal(bare.querySelector('[aria-label="@example-mixed"]'), null);
  assert.equal(bare.querySelectorAll('.iso-cubes path[class^="t"]').length, 365);
});

test("panel backgrounds survive SVG rasterization in both themes", async () => {
  for (const [name, theme] of Object.entries(LEETCODE_THEMES)) {
    const canvas = createCanvas(1000, 600);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(await loadImage(Buffer.from(renderLeetCodeSVG(profileFixture("zero"), { theme }))), 0, 0);
    const expected = name === "dark" ? [22, 27, 34, 255] : [255, 255, 255, 255];
    assert.deepEqual([...ctx.getImageData(700, 60, 1, 1).data], expected);
    assert.deepEqual([...ctx.getImageData(35, 500, 1, 1).data], expected);
  }
});

test("large totals remain present and long headings are fitted without unsafe markup", () => {
  const large = { ...profile, solved: { total: 1234567, easy: 234567, medium: 800000, hard: 200000 },
    available: { total: 9999999, easy: 2000000, medium: 5999999, hard: 2000000 } };
  const heading = "A very long LeetCode project title used to verify clipping";
  const doc = documentFor(renderLeetCodeSVG(large, { heading }));
  assert.ok(doc.querySelector('[aria-label="1234567"]'));
  assert.ok(doc.querySelector('[aria-label="/ 9999999"]'));
  assert.equal(doc.querySelector('#leetcode-solved').getAttribute('aria-label'), heading);
  assert.ok([...doc.querySelectorAll('[aria-label]')].some((node) => node.getAttribute('aria-label').endsWith('…')));
});

test("retained base SVG and PNG renderers work with the licensed font replacements", () => {
  const days = toRendererDays(profile.days);
  const svg = renderSVG(days, { theme: DARK_THEME, stats: true });
  const doc = documentFor(svg);
  assert.ok(doc.querySelector('path[id^="iso-s"]'), "Noto Sans Symbols should outline date-range arrows");
  assert.equal(doc.querySelectorAll('.iso-cubes path[class^="t"]').length, 365);
  const canvas = renderWithStats(days, { theme: DARK_THEME });
  assert.equal(canvas.width, 1000);
  assert.equal(canvas.height, 600);
});
