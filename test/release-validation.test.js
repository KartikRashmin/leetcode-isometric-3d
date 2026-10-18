import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderLeetCodeSVG } from "../src/svg-renderer.js";
import { LEETCODE_THEMES } from "../src/leetcode-theme.js";
import { validateGeneratedSvg } from "../scripts/validate-generated-svg.js";
import { profileFixture } from "./fixtures/leetcode-profile.js";

test("release validator accepts complete dark and light LeetCode SVGs", () => {
  const dir = mkdtempSync(join(tmpdir(), "leetcode-release-validation-"));
  try {
    const profile = profileFixture();
    const dark = join(dir, "dark.svg");
    const light = join(dir, "light.svg");
    writeFileSync(dark, renderLeetCodeSVG(profile, { theme: LEETCODE_THEMES.dark }));
    writeFileSync(light, renderLeetCodeSVG(profile, { theme: LEETCODE_THEMES.light }));
    const result = validateGeneratedSvg(dark, light, profile.username, new Date("2026-03-01T12:00:00Z"));
    assert.equal(result.totalSolved, 1234);
    assert.equal(result.activeDays, 324);
    assert.equal(result.username, "example-mixed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("release validator rejects a missing visual panel", () => {
  const dir = mkdtempSync(join(tmpdir(), "leetcode-release-invalid-"));
  try {
    const profile = profileFixture();
    const dark = join(dir, "dark.svg");
    const light = join(dir, "light.svg");
    writeFileSync(dark, renderLeetCodeSVG(profile, { theme: LEETCODE_THEMES.dark }));
    writeFileSync(light, renderLeetCodeSVG(profile, { theme: LEETCODE_THEMES.light }));
    writeFileSync(light, readFileSync(light, "utf8").replace('id="leetcode-solved-panel"', 'id="removed-panel"'));
    assert.throws(() => validateGeneratedSvg(dark, light, profile.username,
      new Date("2026-03-01T12:00:00Z")), /leetcode-solved-panel/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
