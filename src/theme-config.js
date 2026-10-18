/** Base panel styles inherited by the LeetCode dark and light themes. */

/**
 * Dark Theme
 * High contrast dark mode design
 */
export const DARK_THEME = {
  title: {
    color: "#e6edf3",
    fontFamily: "Selawik",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  value: {
    color: "#3fb950",
    fontFamily: "Selawik",
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
  },
  label: {
    color: "#ffffff",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  subtext: {
    color: "#8b949e",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 18,
  },
  averageText: {
    color: "#c9d1d9",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "400",
  },
  averageValue: {
    color: "#3fb950",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "600",
  },
  averageUnit: {
    color: "#8b949e",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "400",
  },
  box: {
    backgroundColor: "rgb(13, 17, 23)",
    borderColor: "rgb(48, 54, 61)",
    borderWidth: 2,
    borderRadius: 8,
    shadowColor: "rgba(0, 0, 0, 0.6)",
    shadowBlur: 12,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
  },
  graph: {
    colors: {
      level0: "#0d1117",
      level1: "#0e4429",
      level2: "#006d32",
      level3: "#26a641",
      level4: "#39d353",
    },
  },
  dimensions: {
    contributionsBoxWidth: 316,
    contributionsBoxHeight: 84,
    streaksBoxWidth: 254,
    streaksBoxHeight: 80,
    titleHeight: 24,
    averageBottomMargin: 16,
  },
};

/**
 * Light Theme
 * Clean light mode design
 */
export const LIGHT_THEME = {
  title: {
    color: "#1f2328",
    fontFamily: "Selawik",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  value: {
    color: "#1a7f37",
    fontFamily: "Selawik",
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
  },
  label: {
    color: "#24292f",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  subtext: {
    color: "#656d76",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 18,
  },
  averageText: {
    color: "#1f2328",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "400",
  },
  averageValue: {
    color: "#1a7f37",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "600",
  },
  averageUnit: {
    color: "#656d76",
    fontFamily: "Selawik",
    fontSize: 12,
    fontWeight: "400",
  },
  box: {
    backgroundColor: "rgb(255, 255, 255)",
    borderColor: "rgb(208, 215, 222)",
    borderWidth: 2,
    borderRadius: 8,
    shadowColor: "rgba(31, 35, 40, 0.15)",
    shadowBlur: 8,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
  },
  graph: {
    colors: {
      level0: "#ebedf0",
      level1: "#9be9a8",
      level2: "#40c463",
      level3: "#30a14e",
      level4: "#216e39",
    },
  },
  dimensions: {
    contributionsBoxWidth: 316,
    contributionsBoxHeight: 84,
    streaksBoxWidth: 254,
    streaksBoxHeight: 80,
    titleHeight: 24,
    averageBottomMargin: 16,
  },
};
