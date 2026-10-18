import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { JSDOM } from "jsdom";

const root = resolve(import.meta.dirname, "..");

test("composite Action metadata maps public inputs to the CLI and exposes both outputs", async () => {
  const action = YAML.parse(await readFile(join(root, "action.yml"), "utf8"));
  assert.equal(action.runs.using, "composite");
  assert.equal(action.inputs.username.required, true);
  assert.equal(action.inputs["output-dir"].default, "assets");
  assert.equal(action.outputs["dark-svg"].value, "${{ steps.generate.outputs.dark-svg }}");
  assert.equal(action.outputs["light-svg"].value, "${{ steps.generate.outputs.light-svg }}");
  const setup = action.runs.steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
  assert.equal(setup.with["node-version"], "24");
  assert.match(action.runs.steps.find((step) => step.name === "Install generator dependencies").run,
    /npm ci --prefix "\$GITHUB_ACTION_PATH"/);
  const generate = action.runs.steps.find((step) => step.id === "generate");
  assert.equal(generate.env.ACTION_USERNAME, "${{ inputs.username }}");
  assert.ok(generate.run.includes('node "$GITHUB_ACTION_PATH/generate.js" "${args[@]}"'));
  assert.ok(!generate.run.includes("${{ inputs."));
});

test("example workflow schedules safe refreshes and commits only changed SVGs", async () => {
  const workflow = YAML.parse(await readFile(join(root, "examples/workflows/update-leetcode.yml"), "utf8"));
  assert.ok(workflow.on.schedule[0].cron);
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.equal(workflow.permissions.contents, "write");
  const steps = workflow.jobs.refresh.steps;
  assert.ok(steps.some((step) => step.uses?.startsWith("actions/checkout@")));
  assert.ok(steps.some((step) => step.uses === "KartikRashmin/leetcode-isometric-3d@feat/leetcode-isometric-mvp"));
  const script = steps.at(-1).run;
  assert.match(script, /ET\.parse\(path\)/);
  assert.match(script, /git diff --cached --quiet/);
  assert.match(script, /git add -- assets\/leetcode-isometric-dark\.svg assets\/leetcode-isometric-light\.svg/);
});

test("Action generation step runs in a caller workspace with two verified SVG outputs", async () => {
  const action = YAML.parse(await readFile(join(root, "action.yml"), "utf8"));
  const script = action.runs.steps.find((step) => step.id === "generate").run;
  const workspace = await mkdtemp(join(tmpdir(), "leetcode-action-"));
  try {
    const preload = join(workspace, "mock-leetcode.mjs");
    const output = join(workspace, "github-output.txt");
    await writeFile(preload, `globalThis.fetch = async (_url, request) => {
      const { username } = JSON.parse(request.body).variables;
      const counts = (all, easy, medium, hard) => [
        ['All', all], ['Easy', easy], ['Medium', medium], ['Hard', hard]
      ].map(([difficulty, count]) => ({ difficulty, count }));
      return { status: 200, ok: true, json: async () => ({ data: {
        matchedUser: { username, current: { submissionCalendar: '{}' }, previous: { submissionCalendar: '{}' },
          submitStatsGlobal: { acSubmissionNum: counts(6, 3, 2, 1) } },
        allQuestionsCount: counts(100, 40, 40, 20)
      } }) };
    };`);
    await writeFile(output, "");
    const result = spawnSync("bash", ["-c", script], {
      encoding: "utf8", cwd: workspace,
      env: { ...process.env, NODE_OPTIONS: `--import=${preload}`, GITHUB_ACTION_PATH: root,
        GITHUB_WORKSPACE: workspace, GITHUB_OUTPUT: output, ACTION_USERNAME: "another_user",
        ACTION_OUTPUT_DIR: "assets", ACTION_WIDTH: "1000", ACTION_HEIGHT: "600",
        ACTION_HEADING: "Solved Today", ACTION_SHOW_STATS: "true", ACTION_SHOW_CREDIT: "false" },
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = (await readFile(output, "utf8")).trim().split("\n");
    assert.deepEqual(lines, [
      `dark-svg=${join(workspace, "assets/leetcode-isometric-dark.svg")}`,
      `light-svg=${join(workspace, "assets/leetcode-isometric-light.svg")}`,
    ]);
    for (const name of ["dark", "light"]) {
      const doc = new JSDOM(await readFile(join(workspace, `assets/leetcode-isometric-${name}.svg`), "utf8"),
        { contentType: "image/svg+xml" }).window.document;
      assert.equal(doc.documentElement.getAttribute("viewBox"), "0 0 1000 600");
      assert.match(doc.querySelector("title").textContent, /6 solved problems/);
      assert.equal(doc.querySelector('#leetcode-solved').getAttribute("aria-label"), "Solved Today");
      assert.equal(doc.querySelector('[aria-label="@another_user"]'), null);
    }
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
