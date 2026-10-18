# Bundled font provenance

The SVG renderer converts only used glyphs to vector paths. These font files
are retained for generating new images; the SVGs do not load external fonts.

| File | Source | License |
| --- | --- | --- |
| `Selawik-Regular.ttf`, `Selawik-Semibold.ttf` | [Microsoft Selawik 1.01](https://github.com/microsoft/Selawik/releases/tag/1.01), `selawk.ttf` and `selawksb.ttf`, unmodified | SIL Open Font License 1.1, [`Selawik-LICENSE.txt`](Selawik-LICENSE.txt) |
| `NotoSansSymbols.ttf` | [Noto Sans Symbols](https://github.com/notofonts/symbols), unmodified system-distributed variable font | SIL Open Font License 1.1, [`NotoSansSymbols-LICENSE.txt`](NotoSansSymbols-LICENSE.txt) |

Selawik retains the M2 LeetCode typography. Noto Sans Symbols supplies arrows
for the retained base renderer's date ranges. The Segoe UI binaries from the
original checkout were removed because their redistribution terms were not
documented.
