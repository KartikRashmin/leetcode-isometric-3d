import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fetchLeetCodeProfile, validateLeetCodeUsername } from "./leetcode-data.js";
import { LEETCODE_THEMES } from "./leetcode-theme.js";
import { renderLeetCodeSVG } from "./svg-renderer.js";

const HELP = `Usage: node generate.js --username <LeetCode username> [options]

Options:
  --theme <dark|light|both>   Themes to generate (default: both)
  --output-dir <directory>   Directory for SVGs (default: current directory)
  --output <file.svg>        File path when generating one theme
  --width <pixels>           SVG display width (default: 1000)
  --height <pixels>          SVG display height (default: 600)
  --heading <text>           Solved panel heading (default: Problems Solved)
  --no-stats                 Omit statistics panels
  --no-credit                Omit the username credit
  --help                     Show this help

Width and height must keep the 5:3 canvas ratio. Output names for --theme both
are leetcode-isometric-dark.svg and leetcode-isometric-light.svg.`;

function dimension(value, name) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 10000) {
    throw new Error(`${name} must be an integer from 1 to 10000`);
  }
  return Number(value);
}

export function parseArgs(args) {
  const options = {
    theme: "both", outputDir: ".", width: 1000, height: 600,
    heading: "Problems Solved", stats: true, credit: true,
  };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--no-stats" || arg === "--no-credit") {
      if (seen.has(arg)) throw new Error(`Duplicate option ${arg}`);
      seen.add(arg);
      options[arg === "--no-stats" ? "stats" : "credit"] = false;
      continue;
    }
    if (!arg.startsWith("--") && !seen.has("--username")) {
      options.username = arg;
      seen.add("--username");
      continue;
    }
    const fields = {
      "--username": "username", "--theme": "theme", "--output-dir": "outputDir",
      "--output": "output", "--width": "width", "--height": "height", "--heading": "heading",
    };
    const field = fields[arg];
    if (!field) throw new Error(`Unknown argument: ${arg}`);
    if (seen.has(arg)) throw new Error(`Duplicate option ${arg}`);
    seen.add(arg);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    options[field] = field === "width" || field === "height" ? dimension(value, arg) : value;
  }
  if (!options.username) throw new Error(`Missing LeetCode username\n${HELP}`);
  validateLeetCodeUsername(options.username);
  if (!["dark", "light", "both"].includes(options.theme)) throw new Error("theme must be dark, light or both");
  if (options.output && options.theme === "both") throw new Error("--output requires --theme dark or light");
  if (options.output && extname(options.output).toLowerCase() !== ".svg") throw new Error("--output must end in .svg");
  if ([options.output, options.outputDir].some((path) => path && /[\x00-\x1f\x7f]/.test(path))) {
    throw new Error("Output paths cannot contain control characters");
  }
  if (options.width * 3 !== options.height * 5) throw new Error("Width and height must keep the 5:3 canvas ratio");
  if (!options.heading.trim()) throw new Error("--heading cannot be empty");
  return options;
}

/** Fetch once, render every requested theme, then publish files. Fetch/render errors leave existing SVGs intact. */
export async function generate(options, { fetchProfile = fetchLeetCodeProfile, render = renderLeetCodeSVG } = {}) {
  const profile = await fetchProfile(options.username);
  const themes = options.theme === "both" ? ["dark", "light"] : [options.theme];
  const files = themes.map((name) => ({
    path: options.output ? resolve(options.output) : resolve(options.outputDir, `leetcode-isometric-${name}.svg`),
    svg: render(profile, {
      theme: LEETCODE_THEMES[name], width: options.width, height: options.height,
      heading: options.heading, stats: options.stats, credit: options.credit,
    }),
  }));
  const staged = [];
  try {
    for (const file of files) {
      await mkdir(dirname(file.path), { recursive: true });
      const temporary = resolve(dirname(file.path), `.${basename(file.path)}.${randomUUID()}.tmp`);
      await writeFile(temporary, file.svg, { flag: "wx" });
      staged.push({ temporary, path: file.path });
    }
    for (const file of staged) await rename(file.temporary, file.path);
  } finally {
    await Promise.all(staged.map((file) => rm(file.temporary, { force: true })));
  }
  return files.map(({ path }) => path);
}

export async function runCli(args, { log = console.log, ...dependencies } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return []; }
  const paths = await generate(options, dependencies);
  for (const path of paths) log(`Generated ${path}`);
  return paths;
}
