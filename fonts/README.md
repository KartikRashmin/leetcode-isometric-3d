# Font provenance

The LeetCode SVG overlay uses **Selawik Regular and Semibold**, Microsoft's
open source replacement for Segoe UI. The font sizes, weights and hierarchy
follow the original renderer; the SVG embeds only the glyph outlines it uses.

- Source: https://github.com/microsoft/Selawik/releases/tag/1.01
- Archive: `Selawik_Release.zip`
- `selawk.ttf` is stored unmodified as `Selawik-Regular.ttf`.
- `selawksb.ttf` is stored unmodified as `Selawik-Semibold.ttf`.
- License: SIL Open Font License 1.1; see `Selawik-LICENSE.txt`.

The three pre-existing Segoe UI files are used only by the legacy GitHub
renderer. The upstream checkout includes no redistribution notice for them.
They are not used for the LeetCode SVG glyphs. Their replacement and legacy
renderer cleanup remain part of the M3 font/license audit before release.
