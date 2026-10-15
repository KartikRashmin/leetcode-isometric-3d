#!/usr/bin/env node

/**
 * Minimal and Fast Isometric Contributions API Server
 * Features:
 * - Daily caching per username (one generation per day) using Supabase Storage
 * - Multiple fetches served from cache
 * - Customizable query parameters for themes, dimensions, stats
 * - SVG image output by default, PNG with format=png
 */

import "dotenv/config";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  fetchContributions,
  parseContributionsData,
  fetchContributionSummary,
} from "./src/api-client.js";
import {
  renderIsometricChart,
  renderWithStats,
  exportToPNG,
} from "./src/renderer.js";
import { renderSVG } from "./src/svg-renderer.js";
import {
  THEMES,
  GITHUB_THEME,
  buildCustomTheme,
} from "./src/theme-config.js";
// Available themes mapping
const AVAILABLE_THEMES = THEMES;
const PORT = process.env.PORT || 3000;
const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || "isometric-cache";
const CONTENT_TYPES = {
  png: "image/png",
  svg: "image/svg+xml; charset=utf-8",
};
const __dirname = dirname(fileURLToPath(import.meta.url));
const documentationHTML = readFileSync(
  join(__dirname, "docs", "index.html"),
  "utf8",
);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

/**
 * Generate cache key for a request
 * @param {string} username
 * @param {Object} params
 * @returns {string}
 */
function getCacheKey(username, params) {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  // GitHub logins are case-insensitive, so normalize before building the key.
  // This dedupes the cache so e.g. "Riteshp2001" and "riteshp2001" resolve to
  // one stored PNG instead of generating and storing a copy per casing.
  // The username must also be normalized inside the hashed params, otherwise
  // the hash segment would still differ by case.
  const normalizedUsername = (username || "").toLowerCase();
  // The format is carried by the file extension and left out of the hash, so
  // the PNG and SVG of the same graph share a hash.
  const { format, ...rest } = params;
  const paramsStr = JSON.stringify({
    ...rest,
    ...themeKeyParams(params),
    username: normalizedUsername,
  });
  const hash = Buffer.from(paramsStr).toString("base64").replace(/[/+=]/g, "");
  return `daily/${date}/${normalizedUsername}/${hash}.${format}`;
}

/**
 * Theme params as they affect the rendered image, so requests that render the
 * same theme share a cache key: preset names are case-insensitive and unknown
 * names fall back to github, color params only matter for a custom theme, and
 * hex colors are case-insensitive.
 * @param {Object} params
 * @returns {Object} theme, colors, bg, border, accent and labelColor
 */
function themeKeyParams(params) {
  const lower = (v) => (v ? v.toLowerCase() : null);
  if (isCustomTheme(params)) {
    return {
      theme: "custom",
      colors: lower(params.colors),
      bg: lower(params.bg),
      border: lower(params.border),
      accent: lower(params.accent),
      labelColor: lower(params.labelColor),
    };
  }
  const name = (params.theme || "").toLowerCase();
  return {
    theme: Object.hasOwn(AVAILABLE_THEMES, name) ? name : "github",
    colors: null,
    bg: null,
    border: null,
    accent: null,
    labelColor: null,
  };
}

// Images generated or downloaded recently, so repeat requests skip the
// Supabase round trip. Keys carry the date, so the cache is cleared when the
// day changes. Map order is recency order (oldest first).
const MEMORY_CACHE_MAX_BYTES =
  Number(process.env.MEMORY_CACHE_MAX_MB || 100) * 1024 * 1024;
const memoryCache = new Map();
let memoryCacheBytes = 0;
let memoryCacheDate = "";

// Requests currently being served (Supabase lookup plus generation), so
// identical requests that arrive together share one generation instead of
// each missing the cache and generating their own copy.
const inFlight = new Map();

function memoryCacheGet(cacheKey) {
  const buffer = memoryCache.get(cacheKey);
  if (buffer) {
    memoryCache.delete(cacheKey);
    memoryCache.set(cacheKey, buffer);
  }
  return buffer ?? null;
}

function memoryCacheSet(cacheKey, buffer) {
  const date = cacheKey.split("/")[1];
  if (date !== memoryCacheDate) {
    memoryCache.clear();
    memoryCacheBytes = 0;
    memoryCacheDate = date;
  }
  if (buffer.length > MEMORY_CACHE_MAX_BYTES) return;
  memoryCacheBytes -= memoryCache.get(cacheKey)?.length ?? 0;
  memoryCache.delete(cacheKey);
  memoryCache.set(cacheKey, buffer);
  memoryCacheBytes += buffer.length;
  for (const [key, old] of memoryCache) {
    if (memoryCacheBytes <= MEMORY_CACHE_MAX_BYTES) break;
    memoryCache.delete(key);
    memoryCacheBytes -= old.length;
  }
}

/**
 * Get the image for a request, generating it at most once per cache key:
 * served from memory, then from an identical request already in progress,
 * then from Supabase Storage, and only then generated and stored.
 * @param {string} cacheKey
 * @param {Object} params
 * @returns {Promise<{buffer: Buffer, cacheHit: boolean, source: string}>}
 */
async function getOrCreateImage(cacheKey, params) {
  const cached = memoryCacheGet(cacheKey);
  if (cached) return { buffer: cached, cacheHit: true, source: "memory" };

  const pending = inFlight.get(cacheKey);
  if (pending) {
    const { buffer } = await pending;
    return { buffer, cacheHit: true, source: "in-flight request" };
  }

  const work = (async () => {
    const stored = await getCachedImage(cacheKey);
    if (stored) {
      memoryCacheSet(cacheKey, stored);
      return { buffer: stored, cacheHit: true, source: "Supabase" };
    }

    // fetchContributions() throws on persistently incomplete data, so a
    // returned buffer is always complete data and safe to cache.
    console.log(`[MISS]  ${params.username} — generating new graph`);
    const buffer = await generateGraph(params);
    memoryCacheSet(cacheKey, buffer);

    cacheImage(cacheKey, buffer, params.format)
      .then(() =>
        console.log(`[SAVE]  ${params.username} — cached to Supabase`),
      )
      .catch((err) =>
        console.error(
          `[ERROR] ${params.username} — cache save failed: ${err?.message ?? err}`,
        ),
      );

    return { buffer, cacheHit: false, source: "generated" };
  })();

  inFlight.set(cacheKey, work);
  try {
    return await work;
  } finally {
    inFlight.delete(cacheKey);
  }
}

/**
 * Get cached image from Supabase Storage
 * @param {string} cacheKey
 * @returns {Promise<Buffer|null>}
 */
async function getCachedImage(cacheKey) {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(cacheKey);

    if (error) {
      return null;
    }

    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("Cache retrieval error:", error);
    return null;
  }
}

/**
 * Store image in Supabase Storage
 * @param {string} cacheKey
 * @param {Buffer} imageBuffer
 * @param {string} format - "png" or "svg"
 * @returns {Promise<void>} Rejects if the upload failed, so callers can log
 *   the real outcome.
 */
async function cacheImage(cacheKey, imageBuffer, format) {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(cacheKey, imageBuffer, {
      contentType: CONTENT_TYPES[format],
      cacheControl: "86400", // 24 hours
      upsert: true, // Overwrite if exists
    });

  if (error) {
    throw error;
  }
}

/**
 * Track API usage analytics
 * @param {Object} params - Request parameters
 * @param {boolean} cacheHit - Whether request was served from cache
 * @returns {Promise<void>}
 */
async function trackAnalytics(params, cacheHit) {
  try {
    // Handle year parameter - convert "none" to null, otherwise to integer
    let year = null;
    if (params.year && params.year !== "none") {
      year = parseInt(params.year, 10);
    }

    // GitHub usernames are case-insensitive, so normalize to lowercase before
    // storing. This keeps analytics (unique users, top users) from counting
    // e.g. "Riteshp2001" and "riteshp2001" as two different people.
    const { error } = await supabase.from("api_analytics").insert({
      username: (params.username || "").toLowerCase(),
      theme: params.theme || "github",
      width: params.width || 1000,
      height: params.height || 600,
      stats: params.stats || false,
      credit: params.credit || false,
      year: year,
      cache_hit: cacheHit,
    });

    if (error) {
      console.error("Analytics tracking error:", error);
    }
  } catch (error) {
    console.error("Analytics tracking error:", error);
  }
}

/**
 * Parse query parameters from URL
 * @param {string} search
 * @returns {Object}
 */
function parseQueryParams(search) {
  const params = new URLSearchParams(search);
  const yearParam =
    params.get("year") ??
    params.get("y") ??
    params.get("Year") ??
    params.get("Y");

  // Default to "none" (365-day rolling window) if no year specified
  // Or explicitly set to "none" to use 365-day mode
  let year = "none";
  if (yearParam) {
    if (yearParam.toLowerCase() === "none") {
      year = "none";
    } else if (!Number.isNaN(Number.parseInt(yearParam, 10))) {
      year = Number.parseInt(yearParam, 10);
    }
  }

  return {
    username: params.get("username") || "",
    year: year,
    width: params.get("width") ? parseInt(params.get("width"), 10) : 1000,
    height: params.get("height") ? parseInt(params.get("height"), 10) : 600,
    stats: params.get("stats") === "true",
    credit: params.get("credit") === "true",
    theme: params.get("theme") || "github",
    // Custom theme colors (used when theme=custom or any color is supplied).
    // `colors` is 5 comma-separated hex values for the cube ramp (level0..4).
    colors: params.get("colors") || null,
    bg: params.get("bg") || null,
    border: params.get("border") || null,
    accent: params.get("accent") || null,
    labelColor: params.get("label") || null,
    // SVG unless PNG is asked for explicitly
    format: (params.get("format") || "").toLowerCase() === "png" ? "png" : "svg",
  };
}

/**
 * Whether a request asks for a custom theme: theme=custom, or any of the
 * color params that switch it on.
 * @param {Object} params
 * @returns {boolean}
 */
function isCustomTheme(params) {
  const { theme } = params;
  return Boolean(
    (theme && theme.toLowerCase() === "custom") ||
      params.colors ||
      params.bg ||
      params.border ||
      params.accent,
  );
}

/**
 * Resolve the theme object for a request. A custom theme (theme=custom, or
 * any color param present) is built from the user's colors; otherwise use a
 * named preset, falling back to github for unknown names.
 * @param {Object} params
 * @returns {Object} Theme configuration object
 */
function resolveTheme(params) {
  const { theme } = params;
  if (isCustomTheme(params)) {
    return buildCustomTheme({
      colors: params.colors ? params.colors.split(",") : [],
      bg: params.bg,
      border: params.border,
      accent: params.accent,
      label: params.labelColor,
    });
  }
  const name = (theme || "").toLowerCase();
  return Object.hasOwn(AVAILABLE_THEMES, name)
    ? AVAILABLE_THEMES[name]
    : GITHUB_THEME;
}

/**
 * Generate isometric contribution graph
 * @param {Object} params
 * @returns {Promise<Buffer>} PNG or SVG bytes, per params.format
 */
async function generateGraph(params) {
  const { username, year, width, height, stats, credit } = params;

  // The theme goes to the renderer per request instead of through the
  // renderer's module-level setTheme(): requests interleave at the await
  // below, so a shared theme could be replaced by another request's before
  // this one renders, and the wrong image would be cached for the day.
  const theme = resolveTheme(params);

  // Determine if using 365-day mode
  const use365Days = year === "none";
  const yearDisplay = use365Days ? "365-day history" : `year: ${year}`;

  const data = await fetchContributions(username, year);
  const days = parseContributionsData(data, use365Days);
  console.log(`[DATA]  ${username} — ${days.length} days (${yearDisplay})`);

  if (days.length === 0) {
    const periodText = use365Days ? "past 365 days" : `year ${year}`;
    throw new Error(
      `No contribution data found for ${username} in ${periodText}`,
    );
  }

  // Render options
  const renderOptions = {
    width,
    height,
    username: credit ? username : null,
    theme,
  };

  if (params.format === "svg") {
    return Buffer.from(renderSVG(days, { ...renderOptions, stats }), "utf8");
  }

  // Render chart
  const canvas = stats
    ? renderWithStats(days, renderOptions)
    : renderIsometricChart(days, renderOptions);

  // Export to PNG buffer.
  // Completeness is validated in fetchContributions(), which throws on
  // persistently incomplete data, so anything that reaches here is safe to
  // return and cache.
  const buffer = exportToPNG(canvas);

  return buffer;
}

/**
 * Send image response
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Buffer} imageBuffer
 * @param {string} format - "png" or "svg"
 * @param {boolean} fromCache
 */
function sendImageResponse(req, res, imageBuffer, format, fromCache = false) {
  // SVG is text and gzips to about a fifth of its size. PNG is already
  // compressed, so it is sent as is.
  const gzip =
    format === "svg" && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  const body = gzip ? gzipSync(imageBuffer) : imageBuffer;

  // No client-side caching: browsers and GitHub's camo image proxy must fetch
  // a fresh image every time so README graphs never show stale data. Freshness
  // is handled server-side by the Supabase daily cache, not by the client.
  const headers = {
    "Content-Type": CONTENT_TYPES[format],
    "Content-Length": body.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "X-Cache": fromCache ? "HIT" : "MISS",
  };
  if (format === "svg") headers.Vary = "Accept-Encoding";
  if (gzip) headers["Content-Encoding"] = "gzip";

  res.writeHead(200, headers);
  res.end(body);
}

/**
 * Send error response
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {string} message
 */
function sendErrorResponse(res, statusCode, message) {
  const errorBody = JSON.stringify({ error: message });
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(errorBody),
  });
  res.end(errorBody);
}

/**
 * Send HTML documentation
 * @param {http.ServerResponse} res
 */
function sendDocumentation(res) {
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Content-Length": Buffer.byteLength(documentationHTML),
  });
  res.end(documentationHTML);
}

/**
 * Main request handler
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Documentation page
  if (url.pathname === "/" || url.pathname === "/docs") {
    return sendDocumentation(res);
  }

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  }

  // API endpoint
  if (url.pathname === "/api/graph") {
    try {
      const params = parseQueryParams(url.search);

      // Validate username
      if (!params.username) {
        return sendErrorResponse(
          res,
          400,
          "Missing required parameter: username",
        );
      }

      const { username, year, theme, width, height, stats, credit, format } =
        params;
      const paramsLog = `format=${format} theme=${theme} year=${year} size=${width}x${height} stats=${stats} credit=${credit}`;
      console.log(`[REQ]   ${username} — ${paramsLog}`);

      // Generate cache key
      const cacheKey = getCacheKey(params.username, params);

      const { buffer, cacheHit, source } = await getOrCreateImage(
        cacheKey,
        params,
      );
      if (cacheHit) {
        console.log(`[HIT]   ${username} — served from ${source}`);
      }

      // Track analytics (don't wait)
      trackAnalytics(params, cacheHit).catch((err) =>
        console.error("Analytics error:", err),
      );

      return sendImageResponse(req, res, buffer, params.format, cacheHit);
    } catch (error) {
      const isNotFound =
        error.message.includes("Could not resolve to a User") ||
        error.message.includes("not found");
      const statusCode = isNotFound ? 404 : 500;
      console.error(`[ERROR] ${statusCode} — ${error.message}`);
      return sendErrorResponse(res, statusCode, error.message);
    }
  }

  // Contribution summary for the docs' "Check my graph" tool. Reports what
  // GitHub counts for this user over the default 365-day window and how much
  // of it is private activity counted anonymously, i.e. exactly what the
  // public profile shows. GitHub doesn't report contributions hidden by an
  // organization's token policy, so this can explain a gap but not detect one.
  if (url.pathname === "/api/status") {
    const username = new URLSearchParams(url.search).get("username") || "";
    if (!username) {
      return sendErrorResponse(
        res,
        400,
        "Missing required parameter: username",
      );
    }

    try {
      const summary = await fetchContributionSummary(username);
      const fmt = (n) => n.toLocaleString();
      const privateNote =
        summary.restricted > 0
          ? `${fmt(summary.restricted)} of them are private contributions, counted anonymously because you display private contributions on your profile.`
          : "None are private. Either you have no private contributions in this window, or you don't display them on your profile (in which case your public profile hides them too).";
      const note =
        `${fmt(summary.total)} contributions counted from ${summary.from} to ${summary.to}. ${privateNote} ` +
        "This should match the number on your GitHub profile. If the graph shows less, an organization you contribute to is most likely restricting this service's token.";

      const body = JSON.stringify({
        username,
        from: summary.from,
        to: summary.to,
        total_contributions: summary.total,
        public_contributions: summary.public,
        private_contributions: summary.restricted,
        note,
      });

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // 5 minutes cache
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(body);
    } catch (error) {
      const statusCode = error.message.includes("not found") ? 404 : 500;
      console.error(`[ERROR] ${statusCode} — ${error.message}`);
      return sendErrorResponse(res, statusCode, error.message);
    }
  }

  // Analytics API endpoint
  if (url.pathname === "/api/analytics") {
    try {
      // Fetch all stats in parallel.
      // daily_stats (30 days) drives the Monthly view; daily_stats_lifetime
      // (full history since launch) drives the Lifetime chart.
      const [
        dailyResult,
        dailyLifetimeResult,
        lifetimeResult,
        dailyNewUsersResult,
      ] = await Promise.all([
        supabase.rpc("get_daily_stats", { days_back: 30 }),
        supabase.rpc("get_lifetime_daily_stats"),
        supabase.rpc("get_lifetime_stats"),
        supabase.rpc("get_daily_new_users"),
      ]);

      if (dailyResult.error) {
        console.error("Analytics fetch error:", dailyResult.error);
        return sendErrorResponse(res, 500, "Failed to fetch analytics");
      }

      const analyticsData = JSON.stringify({
        daily_stats: dailyResult.data || [],
        daily_stats_lifetime:
          dailyLifetimeResult.data || dailyResult.data || [],
        lifetime_stats: lifetimeResult.data?.[0] || null,
        daily_new_users: dailyNewUsersResult.data || [],
        updated_at: new Date().toISOString(),
      });

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // 5 minutes cache
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(analyticsData);
    } catch (error) {
      console.error("Analytics error:", error);
      return sendErrorResponse(res, 500, error.message);
    }
  }

  // Serve static media files
  if (url.pathname.startsWith("/media/")) {
    try {
      const filePath = join(process.cwd(), url.pathname.slice(1)); // Remove leading slash
      const fs = await import("node:fs");
      const stat = fs.statSync(filePath);

      // Browsers revalidate on every load and get a 304 while the file is
      // unchanged, so regenerated example images show up immediately.
      const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      const cacheHeaders = { "Cache-Control": "public, no-cache", ETag: etag };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, cacheHeaders);
        return res.end();
      }

      // Determine content type based on file extension
      const ext = url.pathname.toLowerCase().split(".").pop();
      const contentTypes = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
      };

      let body = fs.readFileSync(filePath);
      const headers = {
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        ...cacheHeaders,
      };
      if (ext === "svg") {
        headers.Vary = "Accept-Encoding";
        if (/\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
          body = gzipSync(body);
          headers["Content-Encoding"] = "gzip";
        }
      }

      res.writeHead(200, headers);
      return res.end(body);
    } catch (error) {
      return sendErrorResponse(res, 404, "File not found");
    }
  }

  // 404 for unknown routes
  return sendErrorResponse(res, 404, "Not Found");
}

// Create server
async function verifyGitHubAPI() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("  ✗ GITHUB_TOKEN not set — API will not work\n");
    return;
  }

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ viewer { login } }" }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);

    const login = json?.data?.viewer?.login ?? "unknown";
    console.log(`[GH]    GitHub authenticated as @${login}\n`);

    // Fine-grained tokens are subject to per-organization policies (lifetime
    // caps, approval) that silently hide that org's contributions, even in
    // public repos, for every user who contributes there. A classic token
    // (no scopes needed for public data) isn't affected. Warn here so an
    // operator finds out at startup, not from under-counted graphs.
    if (token.startsWith("github_pat_")) {
      console.warn(
        "[WARN]  GITHUB_TOKEN is a fine-grained PAT. Organization token policies can\n" +
          "        hide contributions from graphs. Prefer a classic token (no scopes needed).\n",
      );
    }
  } catch (err) {
    console.error(`[ERROR] GitHub API check failed: ${err.message}\n`);
  }
}

const server = createServer(handleRequest);

server.listen(PORT, async () => {
  console.log(`
  🎨 Isometric Contributions API Server                     
  Status:     Running                                       
  Port:       ${PORT.toString().padEnd(46)}
  Storage:    Supabase (${BUCKET_NAME})${" ".repeat(
    46 - 19 - BUCKET_NAME.length,
  )}
                                                            
  Documentation: http://localhost:${PORT}/                     
  API Endpoint:  http://localhost:${PORT}/api/graph            
  Health Check:  http://localhost:${PORT}/health               

  `);
  console.log("Press Ctrl+C to stop the server\n");
  await verifyGitHubAPI();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nShutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
