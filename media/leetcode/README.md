# Live LeetCode previews

These SVGs are real public profile snapshots for `KartikRashmin`, fetched at
**2026-10-18 UTC**. They are not synthetic examples.

| Metric | Value |
| --- | --- |
| Displayed UTC window | 2025-10-19 through 2026-10-18, inclusive (365 days) |
| Solved / available | 86 / 4086 |
| Easy | 34 / 972 |
| Medium | 49 / 2130 |
| Hard | 3 / 984 |
| Submissions in the window | 331 |
| Active days | 78 |
| Longest streak in the window | 54 days |

![Dark preview](leetcode-isometric-dark.svg)

![Light preview](leetcode-isometric-light.svg)

## Rendering implementation

`renderLeetCodeSVG(profile, options)` in `src/svg-renderer.js` wraps the existing
`renderSVG()` pipeline. `src/renderer.js` and the SVG `renderCubes()` function
are unchanged from upstream commit `e7bc4d3`. This preserves the original
1000 × 600 layout, cube size, projection, heights, face shading and seams.
The new overlay shares the original panel styling and glyph writer. Its
larger solved panel occupies the free upper-right area; the activity panel
stays at the original lower-left anchor.

The three orange ring segments correspond to Easy, Medium and Hard in order.
Each segment fills by `solved / available` for that difficulty, while the
headings use cyan, orange and red. The center shows the all-time total.
Submissions, active days and longest streak refer only to the displayed 365
days. The small top-left mark uses LeetCode's official vector paths. The SVG
title and description provide the displayed values.

Selawik glyph outlines make the new SVGs self-contained. See
[`fonts/README.md`](../../fonts/README.md) for provenance. The upstream MIT
license remains unchanged.

## Verification

- `npm test`: 30 offline tests passed.
- Both live SVGs parsed as XML and were rasterized for visual inspection.
- Synthetic zero activity, high activity, long headings, long usernames and
  seven-digit totals were inspected in dark and light themes.
- Equivalent synthetic data was rendered through the unmodified upstream
  SVG renderer and the LeetCode renderer. Cube geometry matches exactly.
- Automated tests check panel clearance, canvas bounds, ring fractions,
  actual displayed values, escaping, internal-only references, responsive
  viewBox behavior, deterministic output and rasterized panel visibility.
- No additional npm dependencies were introduced in M2.

The reusable CLI and Action generate fresh output for any public LeetCode
username with
`npm run generate -- --username NAME --output-dir DIR`.

## Programmatic use

```js
import { writeFileSync } from "node:fs";
import { fetchLeetCodeProfile } from "./src/leetcode-data.js";
import { renderLeetCodeSVG } from "./src/svg-renderer.js";
import { LEETCODE_THEMES } from "./src/leetcode-theme.js";

const profile = await fetchLeetCodeProfile("KartikRashmin");
for (const [name, theme] of Object.entries(LEETCODE_THEMES)) {
  writeFileSync(`leetcode-isometric-${name}.svg`, renderLeetCodeSVG(profile, { theme }));
}
```

Based on [Spectrewolf8's isometric contribution renderer](https://github.com/Spectrewolf8/GitHub-Contributions-Isometric-3D-Graphs-Embed).
The LeetCode data integration references
[shailesh-hacker/leetcode-calander-svg](https://github.com/shailesh-hacker/leetcode-calander-svg).
This is an independent fork, not an official LeetCode edition from the upstream author.
