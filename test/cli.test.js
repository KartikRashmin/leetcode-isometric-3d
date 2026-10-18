import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";
import { generate, parseArgs, runCli } from "../src/cli.js";
import { profileFixture } from "./fixtures/leetcode-profile.js";

const documentFor = (svg) => new JSDOM(svg, { contentType: "image/svg+xml" }).window.document;

test("CLI parses defaults, dimensions and single-theme customization", () => {
  assert.deepEqual(parseArgs(["--username", "KartikRashmin"]), {
    username: "KartikRashmin", theme: "both", outputDir: ".", width: 1000, height: 600,
    heading: "Problems Solved", stats: true, credit: true,
  });
  const options = parseArgs(["sample.user", "--theme", "light", "--width", "500", "--height", "300",
    "--output", "out.svg", "--heading", "Practice", "--no-credit", "--no-stats"]);
  assert.equal(options.username, "sample.user");
  assert.equal(options.theme, "light");
  assert.equal(options.width, 500);
  assert.equal(options.height, 300);
  assert.equal(options.credit, false);
  assert.equal(options.stats, false);
  assert.equal(options.heading, "Practice");
  assert.equal(parseArgs(["--help"]).help, true);
});

test("CLI rejects unsafe or ambiguous options before fetching", () => {
  for (const [args, message] of [
    [[], /Missing LeetCode username/],
    [["bad name"], /username/],
    [["alpha", "--username", "beta"], /Duplicate/],
    [["alpha", "--theme", "sepia"], /theme/],
    [["alpha", "--theme", "both", "--output", "out.svg"], /requires/],
    [["alpha", "--width", "640"], /5:3/],
    [["alpha", "--output-dir", "assets\nmalicious"], /control characters/],
    [["alpha", "--bogus"], /Unknown/],
  ]) assert.throws(() => parseArgs(args), message);
});

test("multiple usernames generate both real SVG structures with their own data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "leetcode-cli-"));
  try {
    for (const username of ["Ada_17", "grace.hopper"]) {
      let fetches = 0;
      const options = parseArgs(["--username", username, "--output-dir", join(dir, username)]);
      const paths = await generate(options, { fetchProfile: async (name) => {
        fetches++;
        return { ...profileFixture("mixed"), username: name,
          solved: username === "Ada_17"
            ? { total: 3, easy: 1, medium: 1, hard: 1 }
            : { total: 8, easy: 3, medium: 4, hard: 1 } };
      } });
      assert.equal(fetches, 1);
      assert.equal(paths.length, 2);
      for (const path of paths) {
        const doc = documentFor(await readFile(path, "utf8"));
        assert.match(doc.querySelector("title").textContent, new RegExp(username.replace(".", "\\.")));
        assert.ok(doc.querySelector('[data-difficulty="easy"]'));
        assert.equal(doc.documentElement.getAttribute("viewBox"), "0 0 1000 600");
        assert.ok(doc.querySelectorAll('.iso-cubes path[class^="t"]').length >= 365);
        assert.equal(doc.querySelector("parsererror"), null);
      }
      const dark = await readFile(paths[0], "utf8");
      const light = await readFile(paths[1], "utf8");
      assert.match(dark, /fill="#0d1117"/);
      assert.match(light, /fill="#ffffff"/);
      assert.ok(dark.includes(username === "Ada_17" ? "3 solved problems" : "8 solved problems"));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("single-theme output and display options use the LeetCode renderer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "leetcode-cli-one-"));
  try {
    const file = join(dir, "custom.svg");
    const paths = await runCli(["alpha", "--theme", "light", "--output", file, "--width", "500",
      "--height", "300", "--heading", "Practice", "--no-stats", "--no-credit"], {
      fetchProfile: async () => ({ ...profileFixture(), username: "alpha" }), log: () => {},
    });
    assert.deepEqual(paths, [file]);
    const doc = documentFor(await readFile(file, "utf8"));
    assert.equal(doc.documentElement.getAttribute("width"), "500");
    assert.equal(doc.querySelector("#leetcode-solved"), null);
    assert.equal(doc.querySelector('[aria-label="@alpha"]'), null);
    assert.deepEqual(await readdir(dir), ["custom.svg"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fetch or render failures leave previously generated good SVGs untouched", async () => {
  const dir = await mkdtemp(join(tmpdir(), "leetcode-cli-fail-"));
  try {
    const dark = join(dir, "leetcode-isometric-dark.svg");
    const light = join(dir, "leetcode-isometric-light.svg");
    await writeFile(dark, "previous dark");
    await writeFile(light, "previous light");
    const options = parseArgs(["alpha", "--output-dir", dir]);
    await assert.rejects(generate(options, { fetchProfile: async () => { throw new Error("HTTP 429"); } }), /429/);
    await assert.rejects(generate(options, { fetchProfile: async () => profileFixture(),
      render: (_profile, opts) => { if (opts.theme.background === "#ffffff") throw new Error("render failed"); return "new"; },
    }), /render failed/);
    assert.equal(await readFile(dark, "utf8"), "previous dark");
    assert.equal(await readFile(light, "utf8"), "previous light");
    assert.deepEqual((await readdir(dir)).sort(), ["leetcode-isometric-dark.svg", "leetcode-isometric-light.svg"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("executable CLI exits cleanly for help and rejects invalid usernames", () => {
  const help = spawnSync(process.execPath, ["generate.js", "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: node generate.js/);
  const bad = spawnSync(process.execPath, ["generate.js", "bad name"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /LeetCode username/);
});
