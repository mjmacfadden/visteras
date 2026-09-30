/**
 * Visteras Vector — Image Trace core (pure, DOM-free).
 *
 * Shared by the main thread (visteras-image-trace.js), the trace worker
 * (visteras-image-trace-worker.js) and the Node tests. Nothing in here may
 * touch `window` or `document`.
 *
 * Pipeline: panel settings → JS pre-pass (composite / binarize / quantize /
 * grayscale) → VTracer options → VTracer SVG → ordered paths in source-pixel
 * coordinates → post-pass (Ignore White in cutout only, Snap Curves to Lines).
 *
 * KEY: VTracer's palette / maxColors snap AFTER clustering, so for Limited,
 * Grayscale and B&W-without-Ignore-White we quantize in JS first and hand
 * VTracer the exact palette with layerDifference 0 / colorPrecision 8.
 */

// ---------------------------------------------------------------------------
// Settings model (mirrors Illustrator's Image Trace panel)
// ---------------------------------------------------------------------------

/** Preview is capped at ~1 MP; commit traces at full resolution up to ~8 MP. */
export const PREVIEW_MAX_PIXELS = 1_000_000;
export const COMMIT_MAX_PIXELS = 8_000_000;

export const TRACE_VIEWS = [
  { id: 'result', label: 'Tracing Result' },
  { id: 'result-outlines', label: 'Tracing Result with Outlines' },
  { id: 'outlines', label: 'Outlines' },
  { id: 'outlines-source', label: 'Outlines with Source Image' },
  { id: 'source', label: 'Source Image' },
];

export const DEFAULT_SETTINGS = Object.freeze({
  preset: 'default',
  view: 'result',
  mode: 'bw', // 'color' | 'grayscale' | 'bw'
  palette: 'limited', // color mode: 'automatic' | 'limited' | 'fulltone'
  colors: 6, // Limited: 2–30
  fullTone: 50, // Full Tone / Automatic colors %: 0–100
  grays: 8, // Grayscale levels (Grays slider is LATER)
  threshold: 128, // B&W: 0–255
  paths: 50, // %
  corners: 75, // %
  noise: 25, // px
  method: 'abutting', // 'abutting' (cutout) | 'overlapping' (stacked)
  snapCurves: false,
  ignoreWhite: false,
});

const P = (label, over) => ({ label, settings: { ...DEFAULT_SETTINGS, ...over } });

/**
 * Presets expressed as panel values. The VTracer values the spec lists are what
 * these map to through mapSettingsToVtracer (e.g. noise 25 → filterSpeckle 5,
 * corners 75 → cornerThreshold 60, paths 50 → simplify 1.25).
 */
export const TRACE_PRESETS = {
  default: P('Default', { mode: 'bw', threshold: 128 }),
  'high-fidelity-photo': P('High Fidelity Photo', {
    mode: 'color', palette: 'fulltone', fullTone: 93, // ld 8, cp 8
    method: 'overlapping', noise: 4, corners: 25, paths: 90, // fs 2, ct 120, simp 0.25
  }),
  'low-fidelity-photo': P('Low Fidelity Photo', {
    mode: 'color', palette: 'fulltone', fullTone: 53, // ld 32 (cp 8: formula switches at 50%)
    method: 'overlapping', noise: 9, corners: 25, paths: 72, // fs 3, ct 120, simp 0.7
  }),
  '3-colors': P('3 Colors', { mode: 'color', palette: 'limited', colors: 3 }),
  '6-colors': P('6 Colors', { mode: 'color', palette: 'limited', colors: 6 }),
  '16-colors': P('16 Colors', { mode: 'color', palette: 'limited', colors: 16 }),
  'shades-of-gray': P('Shades of Gray', { mode: 'grayscale', grays: 8 }),
  'bw-logo': P('Black and White Logo', { mode: 'bw', threshold: 128, noise: 9, corners: 90, paths: 88 }),
  'sketched-art': P('Sketched Art', { mode: 'bw', threshold: 128, noise: 49, paths: 40, ignoreWhite: true }),
  silhouettes: P('Silhouettes', { mode: 'bw', threshold: 200, noise: 49 }),
  'line-art': P('Line Art', { mode: 'bw', threshold: 128, paths: 60, ignoreWhite: true }),
  'technical-drawing': P('Technical Drawing', { mode: 'bw', threshold: 128, paths: 80, corners: 90, noise: 9, snapCurves: true, ignoreWhite: true }),
};

export function presetSettings(id) {
  const p = TRACE_PRESETS[id] || TRACE_PRESETS.default;
  return { ...p.settings, preset: TRACE_PRESETS[id] ? id : 'default' };
}

function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/** Fill in / clamp a (possibly partial or JSON-parsed) settings object. */
export function normalizeSettings(s = {}) {
  const d = DEFAULT_SETTINGS;
  const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
  return {
    preset: typeof s.preset === 'string' ? s.preset : d.preset,
    view: pick(s.view, TRACE_VIEWS.map((v) => v.id), d.view),
    mode: pick(s.mode, ['color', 'grayscale', 'bw'], d.mode),
    palette: pick(s.palette, ['automatic', 'limited', 'fulltone'], d.palette),
    colors: Math.round(clampNum(s.colors, 2, 30, d.colors)),
    fullTone: Math.round(clampNum(s.fullTone, 0, 100, d.fullTone)),
    grays: Math.round(clampNum(s.grays, 2, 64, d.grays)),
    threshold: Math.round(clampNum(s.threshold, 0, 255, d.threshold)),
    paths: clampNum(s.paths, 0, 100, d.paths),
    corners: clampNum(s.corners, 0, 100, d.corners),
    noise: Math.round(clampNum(s.noise, 1, 100, d.noise)),
    method: pick(s.method, ['abutting', 'overlapping'], d.method),
    snapCurves: !!s.snapCurves,
    ignoreWhite: !!s.ignoreWhite,
  };
}

// ---------------------------------------------------------------------------
// Panel → VTracer mapping
// ---------------------------------------------------------------------------

export function fullToneToParams(pct) {
  const p = clampNum(pct, 0, 100, 50);
  return {
    layerDifference: Math.max(4, Math.round(64 - 0.6 * p)),
    colorPrecision: p >= 50 ? 8 : 6,
  };
}

export function pathsToSimplify(paths) {
  const p = clampNum(paths, 0, 100, 50) / 100;
  return Math.max(0.2, 2.5 * (1 - p));
}

export function cornersToThreshold(corners) {
  return 150 - 1.2 * clampNum(corners, 0, 100, 75);
}

export function noiseToSpeckle(noise) {
  return Math.round(Math.sqrt(clampNum(noise, 0, 10000, 25)));
}

/**
 * Map panel settings to VTracer options + the JS pre/post passes.
 * @param {object} settings  panel settings (normalized)
 * @param {{scale?: number, autoColors?: number|null}} [opts]
 *   scale: trace-pixel / source-pixel ratio (preview < 1). Pixel-sized params
 *   (noise, simplify) are scaled so the preview matches the full-res commit.
 *   autoColors: distinct-color estimate for the Automatic palette.
 */
export function mapSettingsToVtracer(settings, { scale = 1, autoColors = null } = {}) {
  const s = normalizeSettings(settings);
  const k = scale > 0 ? scale : 1;
  const hierarchical = s.method === 'overlapping' ? 'stacked' : 'cutout';
  const vt = {
    mode: 'spline',
    hierarchical,
    filterSpeckle: Math.max(0, Math.round(Math.sqrt(s.noise) * k)),
    cornerThreshold: cornersToThreshold(s.corners),
    simplify: +(pathsToSimplify(s.paths) * k).toFixed(3),
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    pathPrecision: 2,
  };
  const prep = { kind: 'composite' };
  let resolvedPalette = null;

  if (s.mode === 'bw') {
    if (s.ignoreWhite) {
      vt.clustering = 'bw';
      vt.binaryThreshold = s.threshold;
    } else {
      // Binarize in JS, then trace in color mode so the white regions survive.
      prep.kind = 'binarize';
      prep.threshold = s.threshold;
      vt.clustering = 'color';
      vt.palette = ['#000000', '#FFFFFF'];
      vt.hierarchical = 'cutout';
      vt.layerDifference = 0;
      vt.colorPrecision = 8;
    }
  } else if (s.mode === 'grayscale') {
    prep.kind = 'grayscale';
    prep.levels = s.grays;
    vt.clustering = 'color';
    vt.layerDifference = 0;
    vt.colorPrecision = 8;
    // palette filled in after the pre-pass (only the grays actually present)
  } else {
    vt.clustering = 'color';
    let palette = s.palette;
    let limitedCount = s.colors;
    if (palette === 'automatic') {
      if (autoColors != null && autoColors <= 12) {
        palette = 'limited';
        limitedCount = Math.max(2, Math.min(30, autoColors));
      } else {
        palette = 'fulltone';
      }
    }
    resolvedPalette = palette;
    if (palette === 'limited') {
      prep.kind = 'quantize';
      prep.colors = limitedCount;
      vt.layerDifference = 0;
      vt.colorPrecision = 8;
    } else {
      Object.assign(vt, fullToneToParams(s.fullTone));
    }
  }

  const post = {
    ignoreWhite: s.ignoreWhite && vt.clustering !== 'bw' && vt.hierarchical === 'cutout',
    snapCurves: s.snapCurves,
  };
  return { vt, prep, post, resolvedPalette, settings: s };
}

// ---------------------------------------------------------------------------
// Pixel pre-passes
// ---------------------------------------------------------------------------

export function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function rgbToHex(r, g, b) {
  const h = (n) => clampByte(Math.round(n)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Composite RGBA over white in place; alpha becomes 255. */
export function compositeOverWhite(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 255) continue;
    const f = a / 255;
    rgba[i] = Math.round(rgba[i] * f + 255 * (1 - f));
    rgba[i + 1] = Math.round(rgba[i + 1] * f + 255 * (1 - f));
    rgba[i + 2] = Math.round(rgba[i + 2] * f + 255 * (1 - f));
    rgba[i + 3] = 255;
  }
  return rgba;
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Hard threshold to pure #000 / #FFF (Illustrator: darker than threshold → black). */
export function binarize(rgba, threshold = 128) {
  for (let i = 0; i < rgba.length; i += 4) {
    const v = luma(rgba[i], rgba[i + 1], rgba[i + 2]) < threshold ? 0 : 255;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  return rgba;
}

/** Snap luminance to `levels` evenly spaced grays. Returns the palette actually used. */
export function snapToGrays(rgba, levels = 8) {
  const n = Math.max(2, levels | 0);
  const step = 255 / (n - 1);
  const used = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    const idx = Math.round(luma(rgba[i], rgba[i + 1], rgba[i + 2]) / step);
    const v = Math.round(idx * step);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    used.add(v);
  }
  return [...used].sort((a, b) => a - b).map((v) => rgbToHex(v, v, v));
}

/** 15-bit (5 bits / channel) histogram with per-bin color sums (exact bin means). */
function histogram15(rgba) {
  const hist = new Uint32Array(32768);
  const sums = new Float64Array(32768 * 3);
  for (let i = 0; i < rgba.length; i += 4) {
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    hist[key]++;
    sums[key * 3] += rgba[i];
    sums[key * 3 + 1] += rgba[i + 1];
    sums[key * 3 + 2] += rgba[i + 2];
  }
  return { hist, sums };
}

/**
 * Median-cut quantization (weighted, on a 15-bit histogram) refined with a few
 * k-means passes. Returns up to `n` colors as [[r,g,b], ...] (0–255).
 */
export function quantizeMedianCut(rgba, n) {
  const want = Math.max(1, n | 0);
  const { hist, sums } = histogram15(rgba);
  const bins = [];
  for (let key = 0; key < 32768; key++) {
    const c = hist[key];
    if (!c) continue;
    bins.push({ r: sums[key * 3] / c, g: sums[key * 3 + 1] / c, b: sums[key * 3 + 2] / c, c });
  }
  if (!bins.length) return [[255, 255, 255]];

  const boxStats = (items) => {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0, count = 0;
    for (const it of items) {
      if (it.r < rmin) rmin = it.r; if (it.r > rmax) rmax = it.r;
      if (it.g < gmin) gmin = it.g; if (it.g > gmax) gmax = it.g;
      if (it.b < bmin) bmin = it.b; if (it.b > bmax) bmax = it.b;
      count += it.c;
    }
    return { items, count, rr: rmax - rmin, gr: gmax - gmin, br: bmax - bmin };
  };
  let boxes = [boxStats(bins)];
  while (boxes.length < want) {
    // Split the box with the largest (range × population); stop if all are single-color.
    let best = -1, bestScore = 0;
    boxes.forEach((bx, i) => {
      if (bx.items.length < 2) return;
      const score = Math.max(bx.rr, bx.gr, bx.br) * Math.sqrt(bx.count);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best < 0) break;
    const bx = boxes[best];
    const ch = bx.rr >= bx.gr && bx.rr >= bx.br ? 'r' : bx.gr >= bx.br ? 'g' : 'b';
    const sorted = bx.items.slice().sort((a, b) => a[ch] - b[ch]);
    let acc = 0, cut = 1;
    const half = bx.count / 2;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i].c;
      if (acc >= half) { cut = i + 1; break; }
      cut = i + 1;
    }
    boxes.splice(best, 1, boxStats(sorted.slice(0, cut)), boxStats(sorted.slice(cut)));
  }
  let centers = boxes.map((bx) => {
    let r = 0, g = 0, b = 0;
    for (const it of bx.items) { r += it.r * it.c; g += it.g * it.c; b += it.b * it.c; }
    return [r / bx.count, g / bx.count, b / bx.count];
  });
  // k-means refinement on the histogram bins
  for (let iter = 0; iter < 4; iter++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (const it of bins) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const c = centers[j];
        const d = (it.r - c[0]) ** 2 + (it.g - c[1]) ** 2 + (it.b - c[2]) ** 2;
        if (d < bd) { bd = d; bi = j; }
      }
      const a = acc[bi];
      a[0] += it.r * it.c; a[1] += it.g * it.c; a[2] += it.b * it.c; a[3] += it.c;
    }
    centers = centers.map((c, j) => (acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c));
  }
  const seen = new Set();
  const out = [];
  for (const c of centers) {
    const rgb = c.map((v) => clampByte(Math.round(v)));
    const hex = rgbToHex(...rgb);
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(rgb);
  }
  return out;
}

/** Replace every pixel with its nearest palette color. Returns hex palette of colors actually used. */
export function remapToPalette(rgba, palette) {
  const cache = new Int16Array(32768).fill(-1);
  const used = new Uint8Array(palette.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let bi = cache[key];
    if (bi < 0) {
      let bd = Infinity;
      for (let j = 0; j < palette.length; j++) {
        const p = palette[j];
        const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
        if (d < bd) { bd = d; bi = j; }
      }
      cache[key] = bi;
    }
    const p = palette[bi];
    rgba[i] = p[0]; rgba[i + 1] = p[1]; rgba[i + 2] = p[2];
    used[bi] = 1;
  }
  return palette.filter((_, j) => used[j]).map((p) => rgbToHex(...p));
}

/** Rough count of distinct colors (4 bits / channel buckets holding ≥ 0.2% of pixels). */
export function estimateColorCount(rgba) {
  const hist = new Uint32Array(4096);
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    hist[((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4)]++;
    total++;
  }
  const min = Math.max(1, total * 0.002);
  let n = 0;
  for (let k = 0; k < 4096; k++) if (hist[k] >= min) n++;
  return n;
}

// ---------------------------------------------------------------------------
// SVG path helpers
// ---------------------------------------------------------------------------

export function isNearWhiteFill(hex, threshold = 245) {
  const s = String(hex || '').trim();
  if (s.toLowerCase() === 'white') return true;
  const m6 = s.match(/^#([0-9a-f]{6})$/i);
  if (m6) {
    const r = parseInt(m6[1].slice(0, 2), 16);
    const g = parseInt(m6[1].slice(2, 4), 16);
    const b = parseInt(m6[1].slice(4, 6), 16);
    return r >= threshold && g >= threshold && b >= threshold;
  }
  const m3 = s.match(/^#([0-9a-f]{3})$/i);
  if (m3) {
    const r = parseInt(m3[1][0] + m3[1][0], 16);
    const g = parseInt(m3[1][1] + m3[1][1], 16);
    const b = parseInt(m3[1][2] + m3[1][2], 16);
    return r >= threshold && g >= threshold && b >= threshold;
  }
  const mRgb = s.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (mRgb) {
    const r = parseInt(mRgb[1], 10);
    const g = parseInt(mRgb[2], 10);
    const b = parseInt(mRgb[3], 10);
    return r >= threshold && g >= threshold && b >= threshold;
  }
  return false;
}

/**
 * Transform coordinates in an SVG path d string using a point transformer function,
 * normalizing relative commands to clean absolute M, C, L, Z commands.
 */
export function transformSvgPathD(d, transformPoint) {
  if (!d || !transformPoint) return d || '';
  const tokens = d.match(/([a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g) || [];
  let i = 0;
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;
  const out = [];

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (/^[a-zA-Z]$/.test(cmd)) {
      i++;
      if (cmd === 'M') {
        curX = parseFloat(tokens[i++]);
        curY = parseFloat(tokens[i++]);
        startX = curX;
        startY = curY;
        const tp = transformPoint(curX, curY);
        out.push(`M ${tp.x} ${tp.y}`);
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curX = parseFloat(tokens[i++]);
          curY = parseFloat(tokens[i++]);
          const tL = transformPoint(curX, curY);
          out.push(`L ${tL.x} ${tL.y}`);
        }
      } else if (cmd === 'm') {
        curX += parseFloat(tokens[i++]);
        curY += parseFloat(tokens[i++]);
        startX = curX;
        startY = curY;
        const tp = transformPoint(curX, curY);
        out.push(`M ${tp.x} ${tp.y}`);
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curX += parseFloat(tokens[i++]);
          curY += parseFloat(tokens[i++]);
          const tL = transformPoint(curX, curY);
          out.push(`L ${tL.x} ${tL.y}`);
        }
      } else if (cmd === 'C') {
        while (i + 5 < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const cp1 = transformPoint(parseFloat(tokens[i++]), parseFloat(tokens[i++]));
          const cp2 = transformPoint(parseFloat(tokens[i++]), parseFloat(tokens[i++]));
          curX = parseFloat(tokens[i++]);
          curY = parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`);
        }
      } else if (cmd === 'c') {
        while (i + 5 < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const cp1 = transformPoint(curX + parseFloat(tokens[i++]), curY + parseFloat(tokens[i++]));
          const cp2 = transformPoint(curX + parseFloat(tokens[i++]), curY + parseFloat(tokens[i++]));
          curX += parseFloat(tokens[i++]);
          curY += parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`);
        }
      } else if (cmd === 'L') {
        while (i + 1 < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curX = parseFloat(tokens[i++]);
          curY = parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`L ${end.x} ${end.y}`);
        }
      } else if (cmd === 'l') {
        while (i + 1 < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curX += parseFloat(tokens[i++]);
          curY += parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`L ${end.x} ${end.y}`);
        }
      } else if (cmd === 'H') {
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curX = parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`L ${end.x} ${end.y}`);
        }
      } else if (cmd === 'h') {
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curX += parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`L ${end.x} ${end.y}`);
        }
      } else if (cmd === 'V') {
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curY = parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`L ${end.x} ${end.y}`);
        }
      } else if (cmd === 'v') {
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          curY += parseFloat(tokens[i++]);
          const end = transformPoint(curX, curY);
          out.push(`L ${end.x} ${end.y}`);
        }
      } else if (cmd === 'Z' || cmd === 'z') {
        curX = startX;
        curY = startY;
        out.push('Z');
      }
    } else {
      i++;
    }
  }
  return out.join(' ');
}

/** Point transformer that scales by `k` and rounds to `digits` decimals. */
export function makeScaleTransformer(k = 1, digits = 2) {
  const f = 10 ** digits;
  return (x, y) => ({ x: Math.round(x * k * f) / f, y: Math.round(y * k * f) / f });
}

/** Parse a normalized absolute (M/L/C/Z) path into subpaths. */
function parseAbsolute(dAbs) {
  const tokens = dAbs.split(/\s+/).filter(Boolean);
  const subs = [];
  let cur = null;
  for (let i = 0; i < tokens.length;) {
    const t = tokens[i++];
    if (t === 'M') {
      cur = { start: { x: +tokens[i++], y: +tokens[i++] }, segs: [], closed: false };
      subs.push(cur);
    } else if (t === 'L') {
      cur.segs.push({ type: 'L', p: { x: +tokens[i++], y: +tokens[i++] } });
    } else if (t === 'C') {
      const c1 = { x: +tokens[i++], y: +tokens[i++] };
      const c2 = { x: +tokens[i++], y: +tokens[i++] };
      cur.segs.push({ type: 'C', c1, c2, p: { x: +tokens[i++], y: +tokens[i++] } });
    } else if (t === 'Z') {
      if (cur) cur.closed = true;
    }
  }
  return subs;
}

/**
 * Parse VTracer's SVG output into an ORDERED list of {d, fill} — the order is
 * the paint order, which must be kept (B1: grouping by fill broke z-order).
 * Handles an optional per-path transform="translate(x,y)".
 */
export function parseVtracerSvg(svgString) {
  if (!svgString) return [];
  const out = [];
  const pathRegex = /<path\b([^>]*?)\/?>/gi;
  let match;
  while ((match = pathRegex.exec(svgString)) !== null) {
    const attrs = match[1];
    const dMatch = /\bd="([^"]+)"/i.exec(attrs);
    if (!dMatch) continue;
    const fillMatch = /\bfill="([^"]+)"/i.exec(attrs);
    const tMatch = /\btransform="translate\(\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*\)"/i.exec(attrs);
    let d = dMatch[1];
    if (tMatch) {
      const tx = parseFloat(tMatch[1]);
      const ty = parseFloat(tMatch[2]);
      d = transformSvgPathD(d, (x, y) => ({ x: +(x + tx).toFixed(3), y: +(y + ty).toFixed(3) }));
    }
    out.push({ d, fill: (fillMatch ? fillMatch[1] : '#000000').toUpperCase() });
  }
  return out;
}

/** Ignore White: drop near-white fills — only valid for cutout output (B2). */
export function applyIgnoreWhite(paths, hierarchical, whiteThresh = 245) {
  if (hierarchical !== 'cutout') return paths;
  return paths.filter((p) => !isNearWhiteFill(p.fill, whiteThresh));
}

// ---------------------------------------------------------------------------
// Contour simplification (kept from the original tracer)
// ---------------------------------------------------------------------------

/**
 * Perpendicular distance from point p to segment ab.
 */
export function perpDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const clampedU = Math.max(0, Math.min(1, u));
  return Math.hypot(p.x - (a.x + clampedU * dx), p.y - (a.y + clampedU * dy));
}

/**
 * Standard Ramer-Douglas-Peucker polyline decimation.
 */
export function rdp(pts, tol) {
  if (!pts || pts.length <= 2) return pts || [];
  let maxD = 0;
  let idx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tol) {
    const left = rdp(pts.slice(0, idx + 1), tol);
    const right = rdp(pts.slice(idx), tol);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [first, last];
}

/**
 * Post-optimize contour segments from ImageTracer:
 * 1. Flatten near-straight or tiny quadratic curves to lines.
 * 2. Remove redundant staircase nodes along straight runs while preserving sharp corners.
 */
export function optimizeContourSegments(segments, tolerance = 1.0) {
  if (!segments || segments.length <= 2 || tolerance <= 0) return segments;

  // Step 1: Flatten flat or tiny Q segments
  const pass1 = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.type === 'Q') {
      const chordLen = Math.hypot(s.x3 - s.x1, s.y3 - s.y1);
      const cpDist = perpDist({ x: s.x2, y: s.y2 }, { x: s.x1, y: s.y1 }, { x: s.x3, y: s.y3 });
      // Max deviation of quadratic curve from chord is cpDist / 2
      if (chordLen < 3.5 || cpDist * 0.5 <= Math.max(0.35, tolerance * 0.4)) {
        pass1.push({ type: 'L', x1: s.x1, y1: s.y1, x2: s.x3, y2: s.y3 });
        continue;
      }
    }
    pass1.push(s);
  }

  // Remove zero-length segments
  const cleaned = [];
  for (let i = 0; i < pass1.length; i++) {
    const s = pass1[i];
    const isQ = s.type === 'Q';
    const endX = isQ ? s.x3 : s.x2;
    const endY = isQ ? s.y3 : s.y2;
    const len = Math.hypot(endX - s.x1, endY - s.y1);
    if (len < 1e-4) continue;
    cleaned.push(s);
  }
  const n = cleaned.length;
  if (n <= 2) return cleaned.length > 0 ? cleaned : segments;

  // Step 2A: All segments are L (closed polygon)
  const allLines = cleaned.every((s) => s.type === 'L');
  if (allLines) {
    const pts = cleaned.map((s) => ({ x: s.x1, y: s.y1 }));
    // Identify sharp corners
    const corners = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const v1x = curr.x - prev.x;
      const v1y = curr.y - prev.y;
      const v2x = next.x - curr.x;
      const v2y = next.y - curr.y;
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 > 1e-4 && l2 > 1e-4) {
        const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
        const cross = Math.abs(v1x * v2y - v1y * v2x);
        const base = Math.hypot(next.x - prev.x, next.y - prev.y);
        const dPerp = base > 1e-4 ? cross / base : 0;
        // Turn angle > 23 deg (cos < 0.92) and perpendicular deviation > tol * 0.4
        if (dot < 0.92 && dPerp > Math.max(0.35, tolerance * 0.4)) {
          corners.push(i);
        }
      }
    }

    let simplifiedPts = [];
    if (corners.length >= 2) {
      for (let c = 0; c < corners.length; c++) {
        const startIdx = corners[c];
        const endIdx = corners[(c + 1) % corners.length];
        const chain = [];
        if (endIdx > startIdx) {
          for (let k = startIdx; k <= endIdx; k++) chain.push(pts[k]);
        } else {
          for (let k = startIdx; k < n; k++) chain.push(pts[k]);
          for (let k = 0; k <= endIdx; k++) chain.push(pts[k]);
        }
        const simp = rdp(chain, tolerance);
        for (let k = 0; k < simp.length - 1; k++) {
          simplifiedPts.push(simp[k]);
        }
      }
    } else {
      // 0 or 1 sharp corners: split at index 0 and n/2
      const mid = Math.floor(n / 2);
      const chain1 = pts.slice(0, mid + 1);
      const chain2 = pts.slice(mid).concat([pts[0]]);
      const simp1 = rdp(chain1, tolerance);
      const simp2 = rdp(chain2, tolerance);
      simplifiedPts = simp1.slice(0, -1).concat(simp2.slice(0, -1));
    }

    if (simplifiedPts.length < 3) return cleaned;

    const res = [];
    for (let k = 0; k < simplifiedPts.length; k++) {
      const pA = simplifiedPts[k];
      const pB = simplifiedPts[(k + 1) % simplifiedPts.length];
      res.push({ type: 'L', x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });
    }
    return res;
  }

  // Step 2B: Mixed segments (Q and L)
  const result = [];
  let i = 0;
  while (i < n) {
    if (cleaned[i].type !== 'L') {
      result.push(cleaned[i]);
      i++;
      continue;
    }
    const runStart = i;
    while (i < n && cleaned[i].type === 'L') i++;
    const runLength = i - runStart;
    if (runLength <= 1) {
      result.push(cleaned[runStart]);
    } else {
      const chain = [{ x: cleaned[runStart].x1, y: cleaned[runStart].y1 }];
      for (let k = runStart; k < i; k++) {
        chain.push({ x: cleaned[k].x2, y: cleaned[k].y2 });
      }
      const simp = rdp(chain, tolerance);
      for (let k = 0; k < simp.length - 1; k++) {
        result.push({ type: 'L', x1: simp[k].x, y1: simp[k].y, x2: simp[k + 1].x, y2: simp[k + 1].y });
      }
    }
  }

  // Merge closed-contour seam if both first and last segments are L and collinear
  if (result.length > 2 && result[0].type === 'L' && result[result.length - 1].type === 'L') {
    const first = result[0];
    const last = result[result.length - 1];
    const pA = { x: last.x1, y: last.y1 };
    const pB = { x: last.x2, y: last.y2 };
    const pC = { x: first.x2, y: first.y2 };
    if (perpDist(pB, pA, pC) <= tolerance) {
      last.x2 = pC.x;
      last.y2 = pC.y;
      result.shift();
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Snap Curves to Lines
// ---------------------------------------------------------------------------

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Snap Curves to Lines:
 *  1. cubic segments whose control points are within `curveTol` px of the chord
 *     become lines;
 *  2. collinear runs of lines are merged (rdp, same tolerance — the
 *     optimizeContourSegments approach);
 *  3. lines within ±`angleTol`° of horizontal / vertical snap to the axis
 *     (Bézier handles move with their anchors).
 */
export function snapCurvesToLines(d, { curveTol = 0.5, angleTol = 2 } = {}) {
  const abs = transformSvgPathD(d, (x, y) => ({ x, y }));
  const subs = parseAbsolute(abs);
  const tanTol = Math.tan((angleTol * Math.PI) / 180);
  const out = [];
  for (const sp of subs) {
    // 1. curves → lines
    let prev = sp.start;
    const segs = sp.segs.map((s) => {
      const from = prev;
      prev = s.p;
      if (s.type === 'C' && perpDist(s.c1, from, s.p) <= curveTol && perpDist(s.c2, from, s.p) <= curveTol) {
        return { type: 'L', p: s.p };
      }
      return s;
    });
    // 2. merge collinear line runs with rdp
    const merged = [];
    let cursor = sp.start;
    for (let i = 0; i < segs.length;) {
      if (segs[i].type !== 'L') {
        merged.push(segs[i]);
        cursor = segs[i].p;
        i++;
        continue;
      }
      const chain = [cursor];
      while (i < segs.length && segs[i].type === 'L') chain.push(segs[i++].p);
      const simp = rdp(chain, curveTol);
      for (let k = 1; k < simp.length; k++) merged.push({ type: 'L', p: simp[k] });
      cursor = chain[chain.length - 1];
    }
    // 3. axis snap. Vertices as shared objects; handles stored relative to anchors.
    const V = [{ x: sp.start.x, y: sp.start.y }];
    const S = [];
    for (const s of merged) {
      const a = V[V.length - 1];
      const b = { x: s.p.x, y: s.p.y };
      if (s.type === 'C') {
        S.push({ type: 'C', h1: { x: s.c1.x - a.x, y: s.c1.y - a.y }, h2: { x: s.c2.x - b.x, y: s.c2.y - b.y } });
      } else {
        S.push({ type: 'L' });
      }
      V.push(b);
    }
    const closedLoop = V.length > 2 && Math.hypot(V[0].x - V[V.length - 1].x, V[0].y - V[V.length - 1].y) < 1e-6;
    if (closedLoop) V[V.length - 1] = V[0];
    // runs of consecutive near-horizontal (or near-vertical) lines share one coordinate
    const snapAxis = (axis) => {
      const other = axis === 'y' ? 'x' : 'y';
      let i = 0;
      while (i < S.length) {
        const isAxis = (k) => {
          if (S[k].type !== 'L') return false;
          const a = V[k], b = V[k + 1];
          const dAlong = Math.abs(b[other] - a[other]);
          const dAcross = Math.abs(b[axis] - a[axis]);
          return dAlong > 1e-6 && dAcross > 0 && dAcross <= dAlong * tanTol;
        };
        if (!isAxis(i)) { i++; continue; }
        let j = i;
        while (j + 1 < S.length && isAxis(j + 1)) j++;
        const verts = [];
        for (let k = i; k <= j + 1; k++) if (!verts.includes(V[k])) verts.push(V[k]);
        const mean = verts.reduce((acc, v) => acc + v[axis], 0) / verts.length;
        for (const v of verts) v[axis] = mean;
        i = j + 1;
      }
    };
    snapAxis('y'); // horizontal lines
    snapAxis('x'); // vertical lines
    const parts = [`M ${r2(V[0].x)} ${r2(V[0].y)}`];
    S.forEach((s, k) => {
      const a = V[k], b = V[k + 1];
      if (s.type === 'C') {
        parts.push(`C ${r2(a.x + s.h1.x)} ${r2(a.y + s.h1.y)} ${r2(b.x + s.h2.x)} ${r2(b.y + s.h2.y)} ${r2(b.x)} ${r2(b.y)}`);
      } else {
        parts.push(`L ${r2(b.x)} ${r2(b.y)}`);
      }
    });
    if (sp.closed) parts.push('Z');
    out.push(parts.join(' '));
  }
  return out.join(' ');
}

// ---------------------------------------------------------------------------
// Stats / grouping
// ---------------------------------------------------------------------------

/** Illustrator's Info block: path, anchor and color counts. */
export function traceStats(paths) {
  let anchors = 0;
  const colors = new Set();
  for (const p of paths) {
    colors.add(String(p.fill).toUpperCase());
    const subs = parseAbsolute(transformSvgPathD(p.d, (x, y) => ({ x, y })));
    for (const sp of subs) {
      let n = 1 + sp.segs.length;
      const last = sp.segs[sp.segs.length - 1];
      if (last && Math.abs(last.p.x - sp.start.x) < 1e-6 && Math.abs(last.p.y - sp.start.y) < 1e-6) n--;
      anchors += n;
    }
  }
  return { paths: paths.length, anchors, colors: colors.size };
}

/**
 * Expand grouping: one subgroup per color while keeping paint order.
 * Cutout (abutting) regions never overlap, so all paths of a color can share a
 * subgroup (ordered by first appearance). Stacked (overlapping) output depends
 * on paint order, so a new subgroup starts whenever the color changes.
 */
export function groupPathsForExpand(paths, hierarchical = 'cutout') {
  const groups = [];
  if (hierarchical === 'cutout') {
    const byFill = new Map();
    for (const p of paths) {
      const key = String(p.fill).toUpperCase();
      if (!byFill.has(key)) {
        const g = { fill: key, paths: [] };
        byFill.set(key, g);
        groups.push(g);
      }
      byFill.get(key).paths.push(p);
    }
    return groups;
  }
  for (const p of paths) {
    const key = String(p.fill).toUpperCase();
    const last = groups[groups.length - 1];
    if (last && last.fill === key) last.paths.push(p);
    else groups.push({ fill: key, paths: [p] });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Full pipeline (runs in the worker; convertPixels is injected)
// ---------------------------------------------------------------------------

/**
 * @param {(rgba: Uint8Array|Uint8ClampedArray, w: number, h: number, opts: object) => string} convertPixels
 * @param {Uint8ClampedArray} rgba  trace-resolution pixels (mutated)
 * @param {number} width
 * @param {number} height
 * @param {object} settings  panel settings
 * @param {{scale?: number}} [opts]  trace-pixel / source-pixel ratio
 * @returns {{paths: {d: string, fill: string}[], stats: object, vt: object, hierarchical: string, palette: string[]|null, prepMs: number, traceMs: number}}
 */
export function runTracePipeline(convertPixels, rgba, width, height, settings, { scale = 1 } = {}) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  compositeOverWhite(rgba);
  const s = normalizeSettings(settings);
  const autoColors = s.mode === 'color' && s.palette === 'automatic' ? estimateColorCount(rgba) : null;
  const { vt, prep, post } = mapSettingsToVtracer(s, { scale, autoColors });
  let palette = null;
  if (prep.kind === 'binarize') {
    binarize(rgba, prep.threshold);
    palette = vt.palette;
  } else if (prep.kind === 'grayscale') {
    palette = snapToGrays(rgba, prep.levels);
    vt.palette = palette;
  } else if (prep.kind === 'quantize') {
    palette = remapToPalette(rgba, quantizeMedianCut(rgba, prep.colors));
    vt.palette = palette;
  }
  if (vt.palette && vt.palette.length < 2) {
    // A single-color palette would snap everything; VTracer needs ≥ 2 entries.
    vt.palette = vt.palette.concat(vt.palette[0] === '#FFFFFF' ? ['#000000'] : ['#FFFFFF']);
  }
  const t1 = now();
  const svg = convertPixels(rgba, width, height, vt);
  const t2 = now();
  const inv = scale > 0 ? 1 / scale : 1;
  const toSource = makeScaleTransformer(inv, 2);
  let paths = parseVtracerSvg(svg).map((p) => ({ fill: p.fill, d: transformSvgPathD(p.d, toSource) }));
  if (post.ignoreWhite) paths = applyIgnoreWhite(paths, vt.hierarchical);
  if (post.snapCurves) paths = paths.map((p) => ({ fill: p.fill, d: snapCurvesToLines(p.d, { curveTol: 0.5, angleTol: 2 }) }));
  paths = paths.filter((p) => p.d && /[LC]/.test(p.d));
  return {
    paths,
    stats: traceStats(paths),
    vt,
    hierarchical: vt.hierarchical,
    palette,
    prepMs: Math.round(t1 - t0),
    traceMs: Math.round(t2 - t1),
  };
}

// ---------------------------------------------------------------------------
// ImageTracer.js fallback helpers (used only if the VTracer worker fails)
// ---------------------------------------------------------------------------

/** ImageTracer options for the current panel settings (B6: honours mode + up to 30 colors). */
export function buildTraceOptions(ui = {}) {
  const s = normalizeSettings(ui);
  let numberofcolors;
  if (ui.bw === true || s.mode === 'bw') numberofcolors = 2;
  else if (s.mode === 'grayscale') numberofcolors = s.grays;
  else if (s.palette === 'limited') numberofcolors = s.colors;
  else numberofcolors = Math.max(2, Math.min(30, Math.round(2 + (s.fullTone / 100) * 28)));
  return {
    numberofcolors,
    colorsampling: ui.colorsampling != null ? ui.colorsampling : 0,
    colorquantcycles: ui.colorquantcycles != null ? ui.colorquantcycles : 4,
    pathomit: ui.pathomit != null ? ui.pathomit : noiseToSpeckle(s.noise),
    ltres: ui.ltres != null ? ui.ltres : 0.8,
    qtres: ui.qtres != null ? ui.qtres : 0.8,
    rightangleenhance: ui.rightangleenhance !== false,
    blurradius: 0,
    blurdelta: 20,
    scale: 1,
    strokewidth: 0,
    linefilter: !!ui.linefilter,
    roundcoords: ui.roundcoords != null ? ui.roundcoords : 1,
    simplifyTolerance: ui.simplifyTolerance != null ? ui.simplifyTolerance : pathsToSimplify(s.paths),
    viewbox: false,
    desc: false,
    layering: 0,
  };
}

function fillFromPalette(pal) {
  if (!pal) return '#000000';
  if (pal.a != null && pal.a < 8) return 'none';
  return rgbToHex(pal.r, pal.g, pal.b);
}

/**
 * Optimize all path contours and hole contours in an ImageTracer tracedata object.
 */
export function optimizeTracedata(tracedata, tolerance = 1.0) {
  if (!tracedata || !tracedata.layers || tolerance <= 0) return tracedata;
  if (tracedata._optimizedTolerance === tolerance) return tracedata;
  const layers = tracedata.layers;
  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l];
    if (!Array.isArray(layer)) continue;
    for (let p = 0; p < layer.length; p++) {
      const smp = layer[p];
      if (smp && Array.isArray(smp.segments) && smp.segments.length > 2) {
        smp.segments = optimizeContourSegments(smp.segments, tolerance);
      }
    }
  }
  tracedata._optimizedTolerance = tolerance;
  return tracedata;
}

/**
 * Build path `d` from an ImageTracer path sample (incl. holes, reversed).
 * Mirrors ImageTracer.svgpathstring hole handling so fill-rule evenodd works.
 */
export function pathSampleToD(smp, holeChildrenSamples, roundcoords = 1, transformPoint = null) {
  if (!smp || !smp.segments || !smp.segments.length) return '';
  const rnd = (v) => (roundcoords === -1 ? v : +Number(v).toFixed(roundcoords));
  const tf = transformPoint || ((x, y) => ({ x: rnd(x), y: rnd(y) }));

  let d = '';
  const segs = smp.segments;
  const p0 = tf(segs[0].x1, segs[0].y1);
  d += `M ${p0.x} ${p0.y} `;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.type === 'C') {
      const p2 = tf(s.x2, s.y2);
      const p3 = tf(s.x3, s.y3);
      const p4 = tf(s.x4, s.y4);
      d += `C ${p2.x} ${p2.y} ${p3.x} ${p3.y} ${p4.x} ${p4.y} `;
    } else {
      const p2 = tf(s.x2, s.y2);
      d += `${s.type} ${p2.x} ${p2.y} `;
      if (Object.prototype.hasOwnProperty.call(s, 'x3')) {
        const p3 = tf(s.x3, s.y3);
        d += `${p3.x} ${p3.y} `;
      }
    }
  }
  d += 'Z ';

  const holes = holeChildrenSamples || [];
  for (let h = 0; h < holes.length; h++) {
    const hsmp = holes[h];
    if (!hsmp || !hsmp.segments || !hsmp.segments.length) continue;
    const hsegs = hsmp.segments;
    const last = hsegs[hsegs.length - 1];
    if (last.type === 'C') {
      const plast = tf(last.x4, last.y4);
      d += `M ${plast.x} ${plast.y} `;
    } else if (Object.prototype.hasOwnProperty.call(last, 'x3')) {
      const plast = tf(last.x3, last.y3);
      d += `M ${plast.x} ${plast.y} `;
    } else {
      const plast = tf(last.x2, last.y2);
      d += `M ${plast.x} ${plast.y} `;
    }
    for (let pcnt = hsegs.length - 1; pcnt >= 0; pcnt--) {
      const s = hsegs[pcnt];
      if (s.type === 'C') {
        const p3 = tf(s.x3, s.y3);
        const p2 = tf(s.x2, s.y2);
        const p1 = tf(s.x1, s.y1);
        d += `C ${p3.x} ${p3.y} ${p2.x} ${p2.y} ${p1.x} ${p1.y} `;
      } else {
        d += `${s.type} `;
        if (Object.prototype.hasOwnProperty.call(s, 'x3')) {
          const p2 = tf(s.x2, s.y2);
          d += `${p2.x} ${p2.y} `;
        }
        const p1 = tf(s.x1, s.y1);
        d += `${p1.x} ${p1.y} `;
      }
    }
    d += 'Z ';
  }
  return d.trim();
}

/**
 * Convert tracedata → color groups (fallback engine only).
 */
export function tracedataToColorGroups(tracedata, options, ui, transformPoint = null) {
  const tol = options?.simplifyTolerance ?? ui?.simplifyTolerance ?? 0;
  if (tol > 0) {
    optimizeTracedata(tracedata, tol);
  }
  const layers = tracedata.layers || [];
  const palette = tracedata.palette || [];
  const colorGroups = [];

  for (let lnum = 0; lnum < layers.length; lnum++) {
    const layer = layers[lnum];
    const fill = fillFromPalette(palette[lnum]);
    if (fill === 'none') continue;
    if (ui.ignoreWhite && isNearWhiteFill(fill, ui.whiteThresh || 245)) continue;

    const paths = [];
    for (let pnum = 0; pnum < layer.length; pnum++) {
      const smp = layer[pnum];
      if (!smp || smp.isholepath) continue;
      if (options.linefilter && smp.segments && smp.segments.length < 3) continue;
      const holeIdxs = smp.holechildren || [];
      const holeSamples = holeIdxs.map((idx) => layer[idx]).filter(Boolean);
      const d = pathSampleToD(smp, holeSamples, options.roundcoords, transformPoint);
      if (!d) continue;
      paths.push({ d, fill });
    }
    if (paths.length) {
      colorGroups.push({ fill, paths });
    }
  }
  return colorGroups;
}
