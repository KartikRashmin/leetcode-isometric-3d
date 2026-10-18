import { DARK_THEME, LIGHT_THEME } from "./theme-config.js";

// Retain the upstream typography, panel borders, shadows and corner radii.
function leetCodeTheme(base, { background, panel, text, muted, accent, colors, difficulty, difficultyLabel }) {
  const theme = structuredClone(base);
  for (const key of ["title", "value", "label", "subtext", "averageText", "averageValue", "averageUnit"]) {
    theme[key].fontFamily = "Selawik";
  }
  theme.title.color = theme.label.color = theme.averageText.color = text;
  theme.subtext.color = theme.averageUnit.color = muted;
  theme.value.color = theme.averageValue.color = accent;
  theme.box.backgroundColor = panel;
  theme.graph.colors = Object.fromEntries(colors.map((color, i) => [`level${i}`, color]));
  theme.background = background;
  theme.difficulty = difficulty;
  theme.difficultyLabel = difficultyLabel;
  return theme;
}

export const LEETCODE_DARK_THEME = leetCodeTheme(DARK_THEME, {
  background: "#0d1117", panel: "#161b22", text: "#c9d1d9", muted: "#8b949e", accent: "#ffa657",
  colors: ["#161b22", "#42230f", "#754012", "#bf651a", "#ffa657"],
  difficulty: ["#ffbd7a", "#ed963e", "#c77730"],
  difficultyLabel: ["#00b8a3", "#ffa116", "#ef4743"],
});

export const LEETCODE_LIGHT_THEME = leetCodeTheme(LIGHT_THEME, {
  background: "#ffffff", panel: "#ffffff", text: "#24292f", muted: "#656d76", accent: "#a94d08",
  colors: ["#ebedf0", "#ffdfb8", "#ffb86b", "#e88725", "#a94d08"],
  difficulty: ["#b65a12", "#a94d08", "#854014"],
  difficultyLabel: ["#087f8c", "#a95f00", "#c62828"],
});

export const LEETCODE_THEMES = { dark: LEETCODE_DARK_THEME, light: LEETCODE_LIGHT_THEME };
