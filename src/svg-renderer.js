/**
 * Isometric Contribution Graph SVG Renderer
 * Vector version of the PNG renderer. Cubes are placed by the same
 * layoutChart(), and text is drawn as bundled font glyph outlines, so the SVG
 * looks identical to the PNG on every viewer's machine without loading fonts.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import opentype from "opentype.js";
import { toRendererDays } from "./leetcode-stats.js";
import { LEETCODE_DARK_THEME } from "./leetcode-theme.js";
import {
  calculateStats,
  getCubeColor,
  getStyleConfig,
  layoutChart,
} from "./renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dirname, "..", "fonts");

function loadFont(file) {
  const buffer = readFileSync(join(fontsDir, file));
  return opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length),
  );
}

// The legacy SVG path uses the same redistributable fonts as the PNG renderer.
// Keep the LeetCode font set below unchanged so approved M2 SVGs stay identical.
const FONTS = {
  regular: loadFont("Selawik-Regular.ttf"),
  bold: loadFont("Selawik-Semibold.ttf"),
  symbol: loadFont("NotoSansSymbols.ttf"),
};
const LEETCODE_FONTS = {
  regular: loadFont("Selawik-Regular.ttf"),
  bold: loadFont("Selawik-Semibold.ttf"),
};
const LAYOUT = { kerning: true };

// Thin lines between tiles of equal height. In the PNG these are the side
// face of the tile behind showing through between the pixel-stepped tops.
const SEAM_WIDTH = 0.75;

const num = (n) => +n.toFixed(2);
const toHex = (argb) => `#${(argb & 0xffffff).toString(16).padStart(6, "0")}`;
const escapeXML = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Collects text as outlined glyphs. Each glyph's path is defined once in
 * <defs> and placed with <use>, which keeps repeated digits cheap.
 */
function createTextWriter(fonts = FONTS) {
  const glyphDefs = new Map();
  const fontKeys = new Map([[fonts.regular, "r"], [fonts.bold, "b"]]);
  if (fonts.symbol) fontKeys.set(fonts.symbol, "s");

  const fontFor = (weight) =>
    weight === "bold" || Number(weight) >= 600 ? fonts.bold : fonts.regular;

  // Split text into [font, text] runs by which font has each glyph
  function fontRuns(font, text) {
    const runs = [];
    for (const char of text) {
      const runFont = font.charToGlyphIndex(char) ? font : (fonts.symbol || fonts.regular);
      const last = runs.at(-1);
      if (last && last[0] === runFont) last[1] += char;
      else runs.push([runFont, char]);
    }
    return runs;
  }

  function measure(text, style) {
    let width = 0;
    for (const [font, run] of fontRuns(fontFor(style.fontWeight), text)) {
      width += font.getAdvanceWidth(run, style.fontSize, LAYOUT);
    }
    return width;
  }

  function draw(text, x, y, style) {
    let uses = "";
    let cursor = x;
    for (const [font, run] of fontRuns(fontFor(style.fontWeight), text)) {
      const unitsPerEm = font.unitsPerEm;
      const key = fontKeys.get(font);
      font.forEachGlyph(run, cursor, y, style.fontSize, LAYOUT, (glyph, gx, gy, size) => {
        const id = `iso-${key}${glyph.index}`;
        if (!glyphDefs.has(id)) {
          const d = glyph.getPath(0, 0, unitsPerEm).toPathData(0);
          glyphDefs.set(id, d ? `<path id="${id}" d="${d}"/>` : "");
        }
        if (glyphDefs.get(id)) {
          uses += `<use href="#${id}" transform="translate(${num(gx)} ${num(gy)}) scale(${+(size / unitsPerEm).toFixed(5)})"/>`;
        }
      });
      cursor += font.getAdvanceWidth(run, style.fontSize, LAYOUT);
    }
    return `<g aria-label="${escapeXML(text)}" fill="${escapeXML(style.color)}">${uses}</g>`;
  }

  /**
   * Write a line made of differently styled pieces
   * @param {Array} pieces - [{text, style, gap}], gap is space before the piece
   * @param {number} x - Left edge, or right edge when align is "end"
   * @param {number} y - Baseline
   * @param {string} align - "start" or "end"
   */
  function write(pieces, x, y, align = "start") {
    const widths = pieces.map((p) => measure(String(p.text), p.style));
    let cursor = x;
    if (align === "end" || align === "center") {
      cursor -= pieces.reduce((sum, p, i) => sum + (p.gap || 0) + widths[i], 0) / (align === "center" ? 2 : 1);
    }
    let out = "";
    pieces.forEach((piece, i) => {
      cursor += piece.gap || 0;
      out += draw(String(piece.text), cursor, y, piece.style);
      cursor += widths[i];
    });
    return out;
  }

  return { write, measure, defs: () => [...glyphDefs.values()].join("") };
}

/**
 * Scale a theme text style for the current image size
 * @param {Object} style - Theme text style {color, fontSize, fontWeight}
 * @param {number} scale - Scale factor
 */
const scaled = (style, scale) => ({
  color: style.color,
  fontWeight: style.fontWeight,
  fontSize: style.fontSize * scale,
});

// Shared by the original GitHub overlay and the LeetCode overlay.
function renderPanel(text, theme, title, x, y, width, height, scale, id) {
  const boxY = y + theme.dimensions.titleHeight * scale;
  const style = theme.box;
  const dx = style.shadowOffsetX * scale;
  const dy = style.shadowOffsetY * scale;
  const blur = ((style.shadowBlur * scale) / 2) * 1.1;
  const pad = 3 * blur + Math.max(Math.abs(dx), Math.abs(dy)) + style.borderWidth * scale;
  return text.write([{ text: title, style: scaled(theme.title, scale) }], x, y + 16 * scale) +
    `<filter id="${id}-shadow" filterUnits="userSpaceOnUse" x="${num(x - pad)}" y="${num(boxY - pad)}" width="${num(width + 2 * pad)}" height="${num(height + 2 * pad)}"><feGaussianBlur in="SourceAlpha" stdDeviation="${num(blur)}"/><feOffset dx="${num(dx)}" dy="${num(dy)}" result="shadow"/><feFlood flood-color="${escapeXML(style.shadowColor)}"/><feComposite in2="shadow" operator="in"/></filter>` +
    // SVG 1.1 shadow primitives work in browsers and librsvg. Keep the
    // visible panel outside the filter as a fallback for other rasterizers.
    `<rect x="${num(x)}" y="${num(boxY)}" width="${num(width)}" height="${num(height)}" rx="${num(style.borderRadius * scale)}" fill="${escapeXML(style.backgroundColor)}" filter="url(#${id}-shadow)"/>` +
    `<rect id="${id}-panel" x="${num(x)}" y="${num(boxY)}" width="${num(width)}" height="${num(height)}" rx="${num(style.borderRadius * scale)}" fill="${escapeXML(style.backgroundColor)}" stroke="${escapeXML(style.borderColor)}" stroke-width="${num(style.borderWidth * scale)}"/>`;
}

/**
 * Render the cubes as SVG paths, with seams between equal-height neighbours
 * @returns {Object} {css, markup}
 */
function renderCubes(layout) {
  const { offsetX, offsetY, cubeSize, cubeScale, cubes } = layout;
  // A tenth of a pixel is plenty for cube corners and keeps the file small
  const point = (n) => +n.toFixed(1);
  const project = (x, y, z) =>
    `${point(offsetX + x - y)},${point(offsetY + (x + y) / 2 - z)}`;

  // One CSS class set per distinct color instead of inline fills. Faces are
  // stroked in their own color to hide anti-aliasing gaps between them.
  const palette = new Map();
  let css = "";
  const classFor = (color) => {
    if (!palette.has(color)) {
      const i = palette.size;
      const shade = getCubeColor(color);
      const top = toHex(shade.horizontal);
      const left = toHex(shade.left);
      const right = toHex(shade.right);
      const seam = num(SEAM_WIDTH * cubeScale);
      css +=
        `.t${i}{fill:${top};stroke:${top}}` +
        `.l${i}{fill:${left};stroke:${left}}` +
        `.r${i}{fill:${right};stroke:${right}}` +
        `.sl${i}{fill:none;stroke:${left};stroke-width:${seam}px}` +
        `.sr${i}{fill:none;stroke:${right};stroke-width:${seam}px}`;
      palette.set(color, i);
    }
    return palette.get(color);
  };

  const grid = [];
  for (const cube of cubes) {
    if (!grid[cube.weekIndex]) grid[cube.weekIndex] = [];
    grid[cube.weekIndex][cube.dayIndex] = cube;
  }

  let markup = "";
  for (const cube of cubes) {
    const { x, y, height: h } = cube;
    const X = x + cubeSize;
    const Y = y + cubeSize;
    const c = classFor(cube.color);
    markup +=
      `<path class="l${c}" d="M${project(x, Y, 0)} ${project(X, Y, 0)} ${project(X, Y, h)} ${project(x, Y, h)}z"/>` +
      `<path class="r${c}" d="M${project(X, y, 0)} ${project(X, Y, 0)} ${project(X, Y, h)} ${project(X, y, h)}z"/>` +
      `<path class="t${c}" d="M${project(x, y, h)} ${project(X, y, h)} ${project(X, Y, h)} ${project(x, Y, h)}z"/>`;

    // The previous week sits up-left: its right face shows along our x edge
    const prevWeek = grid[cube.weekIndex - 1]?.[cube.dayIndex];
    if (prevWeek && prevWeek.height === h) {
      markup += `<path class="sr${classFor(prevWeek.color)}" d="M${project(x, y, h)} ${project(x, Y, h)}"/>`;
    }
    // The previous day sits up-right: its left face shows along our y edge
    const prevDay = grid[cube.weekIndex][cube.dayIndex - 1];
    if (prevDay && prevDay.height === h) {
      markup += `<path class="sl${classFor(prevDay.color)}" d="M${project(x, y, h)} ${project(X, y, h)}"/>`;
    }
  }

  return { css, markup };
}

/**
 * Render the stats boxes, mirroring renderWithStats() in renderer.js
 */
function renderStats(text, theme, stats, width, height, scale) {
  const dims = theme.dimensions;
  const margin = 25 * scale;

  let boxCount = 0;
  const box = (title, x, y, boxWidth, boxHeight) =>
    renderPanel(text, theme, title, x, y, boxWidth, boxHeight, scale, `iso-${boxCount++}`);

  // Value, label and subtext stacked, like drawFlexStatItem()
  const item = (value, label, subtext, x, y) =>
    text.write([{ text: value, style: scaled(theme.value, scale) }], x, y + 22 * scale) +
    text.write([{ text: label, style: scaled(theme.label, scale) }], x, y + 38 * scale) +
    (subtext
      ? text.write([{ text: subtext, style: scaled(theme.subtext, scale) }], x, y + 54 * scale)
      : "");

  let out = "";

  // Contributions box (top right)
  const contribWidth = dims.contributionsBoxWidth * scale;
  const contribHeight = dims.contributionsBoxHeight * scale;
  const contribX = width - contribWidth - margin;
  const contribBoxY = margin + dims.titleHeight * scale;
  const contribItemY = contribBoxY + 12 * scale;
  out += box("Contributions", contribX, margin, contribWidth, contribHeight);
  out += item(stats.countTotal, "Total", stats.datesTotal, contribX + 16 * scale, contribItemY);
  out += item(stats.weekCountTotal, "This week", stats.weekDatesTotal, contribX + 130 * scale, contribItemY);
  const bestDayDate = stats.dateBest.includes(" ")
    ? stats.dateBest.split(" ").slice(0, 2).join(" ")
    : stats.dateBest;
  out += item(stats.maxCount, "Best day", bestDayDate, contribX + 250 * scale, contribItemY);

  // Average, below the box and right-aligned
  out += text.write(
    [
      { text: "Average:", style: scaled(theme.averageText, scale) },
      { text: stats.averageCount, style: scaled(theme.averageValue, scale), gap: 4 * scale },
      { text: "/ day", style: scaled(theme.averageUnit, scale), gap: 4 * scale },
    ],
    contribX + contribWidth,
    contribBoxY + contribHeight + dims.averageBottomMargin * scale,
    "end",
  );

  // Streaks box (bottom left)
  const streaksTotalHeight =
    dims.streaksBoxHeight + dims.titleHeight + dims.averageBottomMargin;
  const streaksY = height - streaksTotalHeight * scale - margin;
  const streaksItemY = streaksY + dims.titleHeight * scale + 12 * scale;
  out += box("Streaks", margin, streaksY, dims.streaksBoxWidth * scale, dims.streaksBoxHeight * scale);
  const longestDays = stats.streakLongest === 1 ? "day" : "days";
  out += item(`${stats.streakLongest} ${longestDays}`, "Longest", stats.datesLongest, margin + 16 * scale, streaksItemY);
  const currentDays = stats.streakCurrent === 1 ? "day" : "days";
  const currentValue =
    stats.streakCurrent === 0 ? "0 days" : `${stats.streakCurrent} ${currentDays}`;
  const currentSubtext =
    stats.streakCurrent === 0 ? "No current streak" : stats.datesCurrent;
  out += item(currentValue, "Current", currentSubtext, margin + 145 * scale, streaksItemY);

  return out;
}

function fitLabel(text, value, style, maxWidth) {
  if (text.measure(value, style) <= maxWidth) return value;
  let fitted = value;
  while (fitted.length && text.measure(`${fitted}…`, style) > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted}…`;
}

function ringArc(cx, cy, radius, start, end) {
  const point = (degrees) => {
    const angle = degrees * Math.PI / 180;
    return `${num(cx + radius * Math.cos(angle))} ${num(cy + radius * Math.sin(angle))}`;
  };
  return `M${point(start)} A${num(radius)} ${num(radius)} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)}`;
}

function renderLeetCodeStats(text, theme, profile, width, height, scale, heading) {
  const margin = 25 * scale;
  const panelWidth = theme.dimensions.contributionsBoxWidth * scale;
  const x = width - panelWidth - margin;
  const y = margin + theme.dimensions.titleHeight * scale;
  const title = fitLabel(text, heading, scaled(theme.title, scale), panelWidth);
  let out = `<g id="leetcode-solved" aria-label="${escapeXML(heading)}">`;
  out += renderPanel(text, theme, title, x, margin, panelWidth, 176 * scale, scale, "leetcode-solved");

  const cx = x + 80 * scale;
  const cy = y + 88 * scale;
  const radius = 60 * scale;
  const difficulties = ["easy", "medium", "hard"];
  difficulties.forEach((key, i) => {
    const label = key[0].toUpperCase() + key.slice(1);
    const color = theme.difficulty[i];
    const solved = profile.solved[key];
    const available = profile.available[key];
    const progress = available > 0 ? Math.min(1, Math.max(0, solved / available)) : 0;
    const start = -85 + i * 120;
    const end = start + 110;
    out += `<g data-difficulty="${key}" aria-label="${label}: ${solved} of ${available} solved">`;
    out += `<path data-ring="track" d="${ringArc(cx, cy, radius, start, end)}" fill="none" stroke="${escapeXML(color)}" stroke-opacity=".18" style="stroke-width:${6 * scale}px" stroke-linecap="round"/>`;
    if (progress > 0) {
      out += `<path data-ring="progress" data-progress="${progress}" d="${ringArc(cx, cy, radius, start, start + 110 * progress)}" fill="none" stroke="${escapeXML(color)}" style="stroke-width:${6 * scale}px" stroke-linecap="round"/>`;
    }
    const rowX = x + 163 * scale;
    const rowY = y + (37 + i * 45) * scale;
    out += text.write([{ text: label, style: { ...scaled(theme.label, scale), color } }], rowX, rowY);
    out += text.write([
      { text: solved, style: { ...scaled(theme.label, scale), fontSize: 18 * scale } },
      { text: `/ ${available}`, gap: 5 * scale, style: scaled(theme.subtext, scale) },
    ], rowX, rowY + 22 * scale);
    out += "</g>";
  });

  // Keep larger totals inside the ring without changing its geometry.
  const countStyle = { ...scaled(theme.value, scale), fontSize: 28 * scale };
  const denominatorStyle = scaled(theme.subtext, scale);
  const countWidth = text.measure(String(profile.solved.total), countStyle);
  const denominatorWidth = text.measure(`/ ${profile.available.total}`, denominatorStyle) + 4 * scale;
  const stacked = countWidth + denominatorWidth > 100 * scale;
  if (stacked) {
    countStyle.fontSize *= Math.min(1, 100 * scale / countWidth);
    out += text.write([{ text: profile.solved.total, style: countStyle }], cx, cy - 18 * scale, "center");
    out += text.write([{ text: `/ ${profile.available.total}`, style: denominatorStyle }], cx, cy, "center");
  } else {
    out += text.write([
      { text: profile.solved.total, style: countStyle },
      { text: `/ ${profile.available.total}`, gap: 4 * scale, style: denominatorStyle },
    ], cx, cy - 6 * scale, "center");
  }
  out += text.write([{ text: "Solved", style: scaled(theme.label, scale) }], cx, cy + (stacked ? 18 : 13) * scale, "center");
  if (profile.attempting !== null && profile.attempting !== undefined) {
    out += text.write([{ text: `${profile.attempting} Attempting`, style: scaled(theme.subtext, scale) }], cx, cy + (stacked ? 36 : 32) * scale, "center");
  }
  out += "</g>";
  out += text.write([
    { text: profile.activity.totalSubmissions, style: scaled(theme.averageValue, scale) },
    { text: "submissions in 365 days", gap: 4 * scale, style: scaled(theme.averageUnit, scale) },
  ], x + panelWidth, y + 197 * scale, "end");

  const activityY = height - (80 + theme.dimensions.titleHeight + theme.dimensions.averageBottomMargin) * scale - margin;
  out += `<g id="leetcode-activity">`;
  out += renderPanel(text, theme, "Activity", margin, activityY, 348 * scale, 80 * scale, scale, "leetcode-activity");
  const rowY = activityY + theme.dimensions.titleHeight * scale;
  const metrics = [
    [profile.activity.activeDays, "Active Days", "Last 365 days"],
    [profile.activity.longestStreak, "Longest (365d)", "Consecutive days"],
    [profile.activity.currentStreak, "Current Streak", "Consecutive days"],
  ];
  metrics.forEach(([value, label, description], i) => {
    const itemX = margin + (16 + i * 111) * scale;
    out += text.write([{ text: value, style: scaled(theme.value, scale) }], itemX, rowY + 34 * scale);
    out += text.write([{ text: label, style: scaled(theme.label, scale) }], itemX, rowY + 50 * scale);
    out += text.write([{ text: description, style: scaled(theme.subtext, scale) }], itemX, rowY + 66 * scale);
  });
  return out + "</g>";
}

/**
 * Render isometric contribution graph as an SVG document
 * @param {Array} days - Array of day objects with {date, count, color, week}
 * @param {Object} options - Rendering options
 * @param {number} options.width - Image width (default: 1000)
 * @param {number} options.height - Image height (default: 600)
 * @param {boolean} options.stats - Include the stats overlay (default: false)
 * @param {string} options.username - Username to display as credit (optional)
 * @param {Object} options.theme - Theme to render with (default: the theme set by setTheme)
 * @returns {string} SVG markup
 */
export function renderSVG(days, options = {}) {
  const {
    width = 1000,
    height = 600,
    stats = false,
    username = null,
    theme = getStyleConfig(),
    profile = null,
    heading = "Problems Solved",
  } = options;
  const scale = Math.min(width / 1000, height / 600);
  const layout = layoutChart(days, { width, height, theme });
  const cubes = renderCubes(layout);
  const text = createTextWriter(profile ? LEETCODE_FONTS : FONTS);
  const summary = profile ? null : calculateStats(days);

  let overlay = stats ? (profile
    ? renderLeetCodeStats(text, theme, profile, width, height, scale, heading)
    : renderStats(text, theme, summary, width, height, scale)) : "";

  // Username credit, bottom right at half opacity like drawUsernameCredit()
  if (username) {
    const padding = 12 * scale;
    const style = {
      color: theme.subtext?.color || "#768390",
      fontWeight: "400",
      fontSize: 11 * scale,
    };
    const credit = profile ? fitLabel(text, `@${username}`, style, 340 * scale) : `@${username}`;
    overlay += `<g opacity="${profile ? ".8" : ".5"}">${text.write([{ text: credit, style }], width - padding, height - padding, "end")}</g>`;
  }

  const title = profile
    ? `LeetCode isometric activity${username ? ` for @${username}` : ""}: ${profile.solved.total} solved problems`
    : `Isometric activity graph${username ? ` for @${username}` : ""}: ${summary.countTotal} contributions`;
  const description = profile
    ? `UTC ${profile.from} to ${profile.to}. ${profile.activity.totalSubmissions} submissions, ${profile.activity.activeDays} active days. Longest streak in 365 days: ${profile.activity.longestStreak}; current streak: ${profile.activity.currentStreak}. All-time solved: ${profile.solved.total} of ${profile.available.total}. Easy: ${profile.solved.easy} of ${profile.available.easy}; Medium: ${profile.solved.medium} of ${profile.available.medium}; Hard: ${profile.solved.hard} of ${profile.available.hard}. Attempting: ${profile.attempting ?? "unavailable"}. Each ring segment shows solved / available for one difficulty. Based on Spectrewolf8's isometric renderer.`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="iso-title"${profile ? ' aria-describedby="iso-desc"' : ""}>` +
    `<title id="iso-title">${escapeXML(title)}</title>` +
    (profile ? `<desc id="iso-desc">${escapeXML(description)}</desc><rect width="100%" height="100%" fill="${escapeXML(theme.background)}"/>` : "") +
    `<defs><style>${cubes.css}path{stroke-width:.5px;stroke-linejoin:round}</style>${text.defs()}</defs>` +
    `<g class="iso-cubes">${cubes.markup}</g>` +
    overlay +
    "</svg>"
  );
}

/** LeetCode edition of the existing SVG renderer; cube geometry is shared verbatim. */
export function renderLeetCodeSVG(profile, options = {}) {
  const { width = 1000, height = 600, stats = true, credit = true, theme = LEETCODE_DARK_THEME,
    heading = "Problems Solved" } = options;
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 10000)) {
    throw new Error("SVG dimensions must be positive integers at most 10000");
  }
  // A fixed viewBox preserves the upstream projection at every embedding size.
  const svg = renderSVG(toRendererDays(profile.days), {
    width: 1000, height: 600, stats, username: credit ? profile.username : null, theme, profile, heading,
  });
  return svg.replace('width="1000" height="600"', `width="${width}" height="${height}"`);
}
