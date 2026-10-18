# LeetCode Isometric 3D v1.0.0

Version: `v1.0.0`

Stable Action tag: `v1`

## Highlights

- Generate self-contained dark and light LeetCode activity SVGs for any public
  username through the CLI or reusable composite GitHub Action.
- Render a trailing 365-day UTC submission graph with the original 1000 × 600
  isometric cube geometry, projection, shading, and diagonal composition.
- Show distinct solved-problem totals and Easy, Medium, and Hard progress in a
  segmented solved ring, separate from submission activity.
- Show Active Days and Max Streak in a compact LeetCode-style activity panel.
- Use GitHub-compatible light and dark palettes with orange and brown graph
  levels and LeetCode-style difficulty heading colors.
- Preserve previous generated assets when a fetch or render fails.

## Automation

Use the stable major reference in caller workflows:

```yaml
- uses: KartikRashmin/leetcode-isometric-3d@v1
  with:
    username: YOUR_LEETCODE_USERNAME
    output-dir: assets
```

The Action requires no LeetCode credentials. Caller repositories grant write
permission only when their own workflow commits generated assets.

## Release validation

- Node.js 24 GitHub-hosted runner validation
- Offline unit, renderer, CLI, Action, and release-validation tests
- Dependency audit
- Live generation and XML/statistics validation for both SVG themes
- Generated SVG artifact upload for visual review

## Tag plan

After the release pull request is approved and merged into `main`, create
`v1.0.0` at the approved merge commit and create or update `v1` to the same
commit. Publish the GitHub release with the title **LeetCode Isometric 3D
v1.0.0** and these notes. Both tags must point to approved code on `main`.
