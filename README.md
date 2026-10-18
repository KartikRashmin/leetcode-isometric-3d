# LeetCode Isometric 3D

Turn a public LeetCode profile into a 365-day isometric activity graph for your GitHub README. One run generates self-contained SVGs for both dark and light themes. No LeetCode login, token, or hosted image service is needed.

This project is a [fork of Spectrewolf8's GitHub Contributions Isometric 3D Graphs Embed](https://github.com/Spectrewolf8/GitHub-Contributions-Isometric-3D-Graphs-Embed). It keeps the original cube projection, shading, diagonal layout, and 1000 × 600 canvas, then adds LeetCode data, orange and brown graph colors, and a solved-problems dashboard.

See the [`v1.0.0` release notes](RELEASE_NOTES.md) for the first public release.

| Dark | Light |
| --- | --- |
| ![Dark LeetCode isometric preview](media/leetcode/leetcode-isometric-dark.svg) | ![Light LeetCode isometric preview](media/leetcode/leetcode-isometric-light.svg) |

The previews above are a [dated snapshot of `KartikRashmin`](media/leetcode/README.md); running the generator fetches fresh data for the username you choose.

## Add it to your GitHub profile

1. In your public profile repository, copy [`examples/workflows/update-leetcode.yml`](examples/workflows/update-leetcode.yml) to `.github/workflows/update-leetcode.yml` and replace `YOUR_LEETCODE_USERNAME` with your LeetCode username. The workflow uses the stable `KartikRashmin/leetcode-isometric-3d@v1` Action.
2. Commit that workflow to your profile repository's default branch. In **Actions → Refresh LeetCode isometric graphs**, choose **Run workflow** once. It generates both files in `assets/`, commits them when they change, and refreshes them daily.
3. Add these lines to that repository's root `README.md`:

   ```markdown
   ![LeetCode activity dark](assets/leetcode-isometric-dark.svg#gh-dark-mode-only)
   ![LeetCode activity light](assets/leetcode-isometric-light.svg#gh-light-mode-only)
   ```

GitHub selects the image that matches each visitor's theme. For detailed setup, permissions, customization, and troubleshooting, see the [profile README integration guide](docs/PROFILE_README.md). The generator does not edit your README for you.

## What the graph shows

| Element | Meaning |
| --- | --- |
| Isometric cubes | One cube per UTC day in the trailing 365 days; height and orange shade represent submission activity. |
| Solved ring | All-time distinct accepted problems, with Easy, Medium, and Hard solved-to-available progress. |
| Activity card | Active Days and Max Streak in the displayed 365-day window. |

Submission counts describe activity and can exceed distinct problems solved. If LeetCode returns an error, generation leaves your previous SVGs in place.

## Requirements and local use

- Node.js 22 or newer, npm, and network access to LeetCode's public GraphQL endpoint.
- No LeetCode account, cookie, API key, GitHub token, database, or server is required.

```bash
git clone https://github.com/KartikRashmin/leetcode-isometric-3d.git
cd leetcode-isometric-3d
npm ci
npm run generate -- --username YOUR_LEETCODE_USERNAME --output-dir ./assets
```

This writes `assets/leetcode-isometric-dark.svg` and `assets/leetcode-isometric-light.svg`. The same filenames are used for every username so profile README links stay stable.

The generator fetches once, renders both themes, and stages each file before replacing existing output. A fetch, parsing, or render error exits nonzero and leaves previous SVGs in place. The CLI never commits or pushes files.

### CLI options

```text
node generate.js --username <name> [--theme dark|light|both]
  [--output-dir <directory>] [--output <file.svg>]
  [--width <pixels> --height <pixels>] [--heading <text>]
  [--no-stats] [--no-credit]
```

`--theme both` is the default. Use `--output` only with one theme. The default display size is 1000 × 600; custom dimensions must retain the 5:3 ratio, for example `--width 500 --height 300`. The SVG keeps the 1000 × 600 viewBox and graph geometry. `--heading` changes the solved panel title. `--no-stats` hides the two statistics panels; `--no-credit` hides the small username credit. Run `npm run generate -- --help` for the complete option list.

Examples:

```bash
npm run generate -- --username KartikRashmin --theme light --output ./light.svg
npm run generate -- --username another.user --output-dir ./dist --width 500 --height 300
npm run generate -- --username another.user --no-credit --heading 'Problems Solved'
```

## Reusable GitHub Action

This repository's [`action.yml`](action.yml) is a composite Action. It installs the generator in the Action checkout and writes SVGs into the caller's workspace. It does not commit, push, or change the caller's README. The caller controls those steps.

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v7
  - uses: KartikRashmin/leetcode-isometric-3d@v1
    with:
      username: YOUR_LEETCODE_USERNAME
      output-dir: assets
```

`@v1` is the stable major Action reference and will track compatible v1 releases. Pin `@v1.0.0` to stay on the exact first release. The Action itself needs only read access; the [scheduled workflow example](examples/workflows/update-leetcode.yml) grants `contents: write` because it commits SVGs. The [integration guide](docs/PROFILE_README.md) explains setup in your own repository.

| Action input | Default | Purpose |
| --- | --- | --- |
| `username` | required | Public LeetCode username |
| `output-dir` | `assets` | Destination in caller workspace |
| `width`, `height` | `1000`, `600` | Display size at a 5:3 ratio |
| `heading` | `Problems Solved` | Solved panel heading |
| `show-stats` | `true` | Show solved and activity panels |
| `show-credit` | `true` | Show username credit |

The Action exposes `dark-svg` and `light-svg` outputs as absolute file paths. A generation failure makes the Action fail, so the example workflow cannot commit stale or partial output from that run. See [GitHub's composite Action documentation](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action) for Action execution details.

The five orange cube levels are chosen from active-day quartiles; zero submissions remain at level 0. The ring segments fill by solved divided by available questions for each difficulty, while their headings use cyan, orange, and red. The submission count appears below the solved panel. Statistics and palettes are implemented in [`src/leetcode-data.js`](src/leetcode-data.js), [`src/leetcode-stats.js`](src/leetcode-stats.js), and [`src/leetcode-theme.js`](src/leetcode-theme.js); the original projection and shading remain in [`src/renderer.js`](src/renderer.js) and [`src/svg-renderer.js`](src/svg-renderer.js).

## Development and release checks

```bash
npm ci
npm test
npm audit
```

The offline tests cover LeetCode parsing, UTC activity and streaks, unchanged cube geometry, SVG panel rendering, CLI error handling, multiple usernames, and the composite Action's actual generation step. A live CLI run needs LeetCode availability and may be rate limited; on a failure, the previous good assets remain available. The project ships a CLI and Action, not a hosted API.

Pushes to `main` and `feat/leetcode-isometric-mvp`, plus pull requests targeting `main`, run the [release validation workflow](.github/workflows/ci.yml) on a GitHub-hosted runner. It checks dependencies and offline tests, calls the Action with `uses: ./`, verifies live SVG statistics and visual elements, and uploads both themes as a downloadable artifact for review.

## Attribution and licenses

The isometric renderer is derived from [Spectrewolf8/GitHub-Contributions-Isometric-3D-Graphs-Embed](https://github.com/Spectrewolf8/GitHub-Contributions-Isometric-3D-Graphs-Embed), and its projection uses the bundled MIT-licensed Obelisk code. The LeetCode data integration was informed by [shailesh-hacker/leetcode-calander-svg](https://github.com/shailesh-hacker/leetcode-calander-svg). This is an independent fork, not an official edition from either author or LeetCode.

The repository's upstream MIT license is retained in [`LICENSE`](LICENSE). The bundled Selawik and Noto Sans Symbols fonts use SIL Open Font License 1.1; their source and license texts are documented in [`fonts/README.md`](fonts/README.md). Legacy Segoe binaries were removed before release preparation.

The small logo mark is embedded from [LeetCode's official SVG asset](https://assets.leetcode.com/static_assets/public/webpack_bundles/images/logo-dark.e99485d9b.svg), with its dark stroke adapted for each theme. The LeetCode name and logo belong to LeetCode, LLC and are excluded from this repository's MIT license. This project is not affiliated with or endorsed by LeetCode.

See [`NOTICE.md`](NOTICE.md) for consolidated third-party attribution and trademark notices.
