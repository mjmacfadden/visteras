/**
 * Visteras Vector — high-performance raster → vector trace.
 * Powered by VisionCortex VTracer (WebAssembly) with fallback to ImageTracer.js.
 */
import VTracer, { initVTracer, convertPixels, isVTracerLoaded } from '../lib/vtracer/vtracer.js';

const TRACE_GROUP_CLASS = 'visteras-traced';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** @typedef {'poster'|'bw'|'photo'|'logo'|'icon'|'detailed'} TracePresetId */

const PRESETS = {
  poster: {
    id: 'poster',
    label: 'Poster',
    mode: 'spline',
    hierarchical: 'stacked',
    clustering: 'color',
    colors: 8,
    colorsMin: 2,
    colorsMax: 32,
    simplify: 1.5,
    filterSpeckle: 8,
    cornerThreshold: 60,
    colorPrecision: 6,
    layerDifference: 16,
    lengthThreshold: 4,
    spliceThreshold: 45,
    pathPrecision: 2,
    binaryThreshold: 128,
    adaptive: false,
    ignoreWhite: true,
    preprocess: true,
    contrast: 1.08,
    flattenWhite: true,
    whiteThresh: 245,
    pathomit: 8,
    ltres: 0.8,
    qtres: 0.8,
    colorquantcycles: 4,
    colorsampling: 0,
    linefilter: false,
  },
  bw: {
    id: 'bw',
    label: 'B/W',
    mode: 'spline',
    hierarchical: 'stacked',
    clustering: 'bw',
    colors: 2,
    colorsMin: 2,
    colorsMax: 2,
    simplify: 1.5,
    filterSpeckle: 8,
    cornerThreshold: 60,
    colorPrecision: 6,
    layerDifference: 16,
    lengthThreshold: 4,
    spliceThreshold: 45,
    pathPrecision: 2,
    binaryThreshold: 128,
    adaptive: false,
    ignoreWhite: true,
    preprocess: true,
    contrast: 1.15,
    flattenWhite: true,
    whiteThresh: 240,
    pathomit: 10,
    ltres: 0.6,
    qtres: 0.6,
    colorquantcycles: 3,
    colorsampling: 0,
    linefilter: true,
  },
  photo: {
    id: 'photo',
    label: 'Photo',
    mode: 'spline',
    hierarchical: 'stacked',
    clustering: 'color',
    colors: 16,
    colorsMin: 2,
    colorsMax: 32,
    simplify: 0.8,
    filterSpeckle: 4,
    cornerThreshold: 45,
    colorPrecision: 8,
    layerDifference: 12,
    lengthThreshold: 3,
    spliceThreshold: 30,
    pathPrecision: 2,
    binaryThreshold: 128,
    adaptive: false,
    ignoreWhite: false,
    preprocess: false,
    contrast: 1.0,
    flattenWhite: false,
    whiteThresh: 250,
    pathomit: 4,
    ltres: 0.5,
    qtres: 0.5,
    colorquantcycles: 5,
    colorsampling: 2,
    linefilter: false,
  },
};

// Aliases for backwards compatibility:
PRESETS.logo = PRESETS.poster;
PRESETS.icon = PRESETS.bw;
PRESETS.detailed = PRESETS.photo;

function showToast(message, ms = 4500) {
  let el = document.getElementById('visteras_trace_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_trace_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'max-width:min(460px,90vw)', 'padding:10px 14px',
      'background:#1e1e1e', 'color:#eee', 'border:1px solid #fa7c1b',
      'border-radius:6px', 'font-size:12px', 'line-height:1.4',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.display = 'none';
  }, ms);
}

function getImageHref(el, sc) {
  if (!el) return '';
  if (sc && typeof sc.getHref === 'function') {
    try {
      const h = sc.getHref(el);
      if (h) return h;
    } catch (_) { /* ignore */ }
  }
  return (
    el.getAttribute('href') ||
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
    el.getAttribute('xlink:href') ||
    ''
  );
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image for tracing'));
    if (!src.startsWith('data:')) {
      try { img.crossOrigin = 'anonymous'; } catch (_) { /* ignore */ }
    }
    img.src = src;
  });
}

/**
 * Draw + optional preprocess (contrast, flatten near-white) → ImageData.
 */
function imageToImageData(img, ui, maxSide = 1400) {
  if (img && img.data && img.width && img.height) {
    const imgd = {
      data: new Uint8ClampedArray(img.data),
      width: img.width,
      height: img.height,
    };
    preprocessImageData(imgd, ui);
    return { imgd, width: img.width, height: img.height, canvas: null };
  }
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Image has no dimensions');
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imgd = ctx.getImageData(0, 0, w, h);
  preprocessImageData(imgd, ui);
  ctx.putImageData(imgd, 0, 0);
  return { imgd, width: w, height: h, canvas };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function preprocessImageData(imgd, ui) {
  const d = imgd.data;
  const contrast = Number(ui.contrast) || 1;
  const flatten = !!ui.flattenWhite;
  const thresh = Number(ui.whiteThresh) || 245;
  const mid = 128;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (contrast !== 1) {
      r = clampByte((r - mid) * contrast + mid);
      g = clampByte((g - mid) * contrast + mid);
      b = clampByte((b - mid) * contrast + mid);
    }
    if (flatten && r >= thresh && g >= thresh && b >= thresh) {
      r = g = b = 255;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

function buildTraceOptions(ui) {
  const numberofcolors = ui.bw
    ? 2
    : Math.max(2, Math.min(16, ui.colors | 0 || 5));
  return {
    numberofcolors,
    colorsampling: ui.colorsampling != null ? ui.colorsampling : (ui.bw ? 0 : 0),
    colorquantcycles: ui.colorquantcycles != null ? ui.colorquantcycles : 4,
    pathomit: ui.pathomit != null ? ui.pathomit : (ui.filterSpeckle != null ? ui.filterSpeckle : 4),
    ltres: ui.ltres != null ? ui.ltres : 0.8,
    qtres: ui.qtres != null ? ui.qtres : 0.8,
    rightangleenhance: ui.rightangleenhance !== false,
    blurradius: 0,
    blurdelta: 20,
    scale: 1,
    strokewidth: 0,
    linefilter: !!ui.linefilter,
    roundcoords: ui.roundcoords != null ? ui.roundcoords : 1,
    simplifyTolerance: ui.simplifyTolerance != null ? ui.simplifyTolerance : (ui.simplify != null ? ui.simplify : 1.0),
    viewbox: false,
    desc: false,
    layering: 0,
  };
}

function rgbToHex(r, g, b) {
  const h = (n) => clampByte(n | 0).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function fillFromPalette(pal) {
  if (!pal) return '#000000';
  if (pal.a != null && pal.a < 8) return 'none';
  return rgbToHex(pal.r, pal.g, pal.b);
}

function isNearWhiteFill(hex, threshold = 245) {
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
 * Parse an SVG string produced by VTracer into color groups.
 */
function parseVtracerSvg(svgString, ignoreWhite = true, whiteThresh = 245) {
  if (!svgString) return [];
  const pathRegex = /<path\b([^>]*)\/?>/gi;
  const groupsMap = new Map();
  let match;

  while ((match = pathRegex.exec(svgString)) !== null) {
    const attrs = match[1];
    const dMatch = /d="([^"]+)"/i.exec(attrs);
    const fillMatch = /fill="([^"]+)"/i.exec(attrs);
    if (!dMatch) continue;
    const d = dMatch[1];
    const fill = fillMatch ? fillMatch[1] : '#000000';

    if (ignoreWhite && isNearWhiteFill(fill, whiteThresh)) continue;

    if (!groupsMap.has(fill)) groupsMap.set(fill, []);
    groupsMap.get(fill).push({ d, fill });
  }

  return Array.from(groupsMap.entries()).map(([fill, paths]) => ({ fill, paths }));
}

/**
 * Transform coordinates in an SVG path d string using a point transformer function,
 * normalizing relative commands to clean absolute M, C, L, Z commands.
 */
function transformSvgPathD(d, transformPoint) {
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

/**
 * Perpendicular distance from point p to segment ab.
 */
function perpDist(p, a, b) {
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
function rdp(pts, tol) {
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
function optimizeContourSegments(segments, tolerance = 1.0) {
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

/**
 * Optimize all path contours and hole contours in an ImageTracer tracedata object.
 */
function optimizeTracedata(tracedata, tolerance = 1.0) {
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
function pathSampleToD(smp, holeChildrenSamples, roundcoords = 1, transformPoint = null) {
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
 * Convert tracedata → nested groups: outer traced group, subgroup per palette color.
 */
function tracedataToColorGroups(tracedata, options, ui, transformPoint = null) {
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

function makePointTransformer(imageEl, srcW, srcH, roundcoords = 1) {
  let bbox = null;
  try {
    if (typeof imageEl.getBBox === 'function') bbox = imageEl.getBBox();
  } catch (_) { /* ignore */ }

  const x = (bbox && Number.isFinite(bbox.x)) ? bbox.x : (parseFloat(imageEl.getAttribute('x')) || 0);
  const y = (bbox && Number.isFinite(bbox.y)) ? bbox.y : (parseFloat(imageEl.getAttribute('y')) || 0);
  const destW = (bbox && bbox.width > 0) ? bbox.width : (parseFloat(imageEl.getAttribute('width')) || srcW);
  const destH = (bbox && bbox.height > 0) ? bbox.height : (parseFloat(imageEl.getAttribute('height')) || srcH);
  const par = (imageEl.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();

  let renderX = x;
  let renderY = y;
  let renderW = destW;
  let renderH = destH;

  if (par !== 'none' && srcW > 0 && srcH > 0) {
    const scale = Math.min(destW / srcW, destH / srcH);
    renderW = srcW * scale;
    renderH = srcH * scale;
    if (par.includes('xMid')) {
      renderX = x + (destW - renderW) / 2;
    } else if (par.includes('xMax')) {
      renderX = x + (destW - renderW);
    }
    if (par.includes('YMid')) {
      renderY = y + (destH - renderH) / 2;
    } else if (par.includes('YMax')) {
      renderY = y + (destH - renderH);
    }
  }

  const sx = renderW / srcW;
  const sy = renderH / srcH;

  let matrix = null;
  try {
    const tfList = imageEl.transform?.baseVal;
    if (tfList && tfList.numberOfItems > 0) {
      matrix = tfList.consolidate().matrix;
    }
  } catch (_) { /* ignore */ }

  const rnd = (v) => (roundcoords === -1 ? v : +Number(v).toFixed(roundcoords));

  return function transformPoint(px, py) {
    const lx = renderX + px * sx;
    const ly = renderY + py * sy;
    if (matrix) {
      return {
        x: rnd(matrix.a * lx + matrix.c * ly + matrix.e),
        y: rnd(matrix.b * lx + matrix.d * ly + matrix.f),
      };
    }
    return {
      x: rnd(lx),
      y: rnd(ly),
    };
  };
}

function ensureTraceDialog() {
  let dlg = document.getElementById('visteras_trace_dialog');
  if (dlg) return dlg;

  dlg = document.createElement('div');
  dlg.id = 'visteras_trace_dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', 'Trace Image');
  dlg.style.cssText = [
    'display:none', 'position:fixed', 'inset:0', 'z-index:100000',
    'background:rgba(0,0,0,0.55)', 'align-items:center', 'justify-content:center',
  ].join(';');

  dlg.innerHTML = `
    <div style="background:#252526;color:#ddd;border:1px solid #444;border-radius:10px;padding:16px 18px;width:min(560px,95vw);max-height:92vh;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,0.55);box-sizing:border-box;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:4px;">
        <div style="font-size:15px;font-weight:600;color:#fa7c1b;">Trace Image</div>
        <div style="font-size:10px;color:#888;background:#1a1a1a;padding:2px 6px;border-radius:3px;border:1px solid #333;">VisionCortex VTracer WASM</div>
      </div>
      <p style="font-size:11px;color:#aaa;margin:0 0 10px;line-height:1.4;">
        Convert raster graphics into clean, handle-based Bézier vector paths.
      </p>

      <!-- Presets -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;" id="trace_preset_row">
        <button type="button" data-preset="poster" class="trace_preset_btn" style="flex:1;min-width:85px;height:28px;border-radius:4px;border:1px solid #fa7c1b;background:#fa7c1b;color:#111;font-size:11px;font-weight:600;cursor:pointer;">Poster</button>
        <button type="button" data-preset="bw" class="trace_preset_btn" style="flex:1;min-width:85px;height:28px;border-radius:4px;border:1px solid #555;background:#333;color:#ddd;font-size:11px;cursor:pointer;">B/W</button>
        <button type="button" data-preset="photo" class="trace_preset_btn" style="flex:1;min-width:85px;height:28px;border-radius:4px;border:1px solid #555;background:#333;color:#ddd;font-size:11px;cursor:pointer;">Photo</button>
      </div>

      <!-- Preview container -->
      <div style="margin:8px 0 12px;background:repeating-conic-gradient(#2b2b2b 0% 25%, #202020 0% 50%) 50% / 14px 14px;border:1px solid #3a3a3a;border-radius:6px;height:190px;min-height:160px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">
        <div id="trace_preview_status" style="position:absolute;top:6px;left:8px;font-size:10px;color:#ccc;background:rgba(20,20,20,0.85);padding:2px 6px;border-radius:4px;pointer-events:none;z-index:2;border:1px solid #333;">Preview</div>
        <div id="trace_preview_host" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:6px;box-sizing:border-box;"></div>
      </div>

      <!-- Primary Controls -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-bottom:8px;">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
          <span>Curve Mode</span>
          <select id="trace_mode" style="background:#1e1e1e;color:#ddd;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;outline:none;">
            <option value="spline" selected>Spline (Smooth Bézier)</option>
            <option value="polygon">Polygon (Straight lines)</option>
            <option value="pixel">Pixel (Stepped)</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
          <span>Hierarchy</span>
          <select id="trace_hierarchy" style="background:#1e1e1e;color:#ddd;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;outline:none;">
            <option value="stacked" selected>Stacked (Layered)</option>
            <option value="cutout">Cutout (Nested holes)</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
          <span>Clustering</span>
          <select id="trace_clustering" style="background:#1e1e1e;color:#ddd;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;outline:none;">
            <option value="color" selected>Color Cluster</option>
            <option value="bw">B/W (Binary)</option>
            <option value="watershed">Watershed</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
          <span style="display:flex;justify-content:space-between;"><span>Max Colors</span><span id="trace_colors_val" style="color:#fa7c1b;">8</span></span>
          <input id="trace_colors" type="range" min="2" max="32" value="8" style="width:100%;accent-color:#fa7c1b;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
          <span style="display:flex;justify-content:space-between;"><span>Simplification</span><span id="trace_simplify_val" style="color:#fa7c1b;">1.5</span></span>
          <input id="trace_simplify" type="range" min="0.0" max="5.0" step="0.1" value="1.5" style="width:100%;accent-color:#fa7c1b;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
          <span style="display:flex;justify-content:space-between;"><span>Filter Speckle</span><span id="trace_speckle_val" style="color:#fa7c1b;">8 px</span></span>
          <input id="trace_speckle" type="range" min="0" max="64" value="8" style="width:100%;accent-color:#fa7c1b;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;grid-column:1 / -1;">
          <span style="display:flex;justify-content:space-between;"><span>Corner Threshold</span><span id="trace_corner_val" style="color:#fa7c1b;">60°</span></span>
          <input id="trace_corner" type="range" min="10" max="120" value="60" style="width:100%;accent-color:#fa7c1b;" />
        </label>
      </div>

      <!-- Toggles -->
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin:6px 0 10px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
          <input type="checkbox" id="trace_ignore_white" checked style="accent-color:#fa7c1b;" /> Ignore white background
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
          <input type="checkbox" id="trace_preprocess" checked style="accent-color:#fa7c1b;" /> Preprocess (contrast + flatten)
        </label>
      </div>

      <!-- Advanced Parameters Collapsible -->
      <details id="trace_advanced_details" style="margin:4px 0 12px;border:1px solid #3a3a3a;border-radius:6px;background:#1d1d1e;padding:6px 10px;">
        <summary style="font-size:11px;font-weight:600;color:#fa7c1b;cursor:pointer;user-select:none;outline:none;padding:2px 0;">
          Advanced Parameters
        </summary>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:10px;">
          <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
            <span style="display:flex;justify-content:space-between;"><span>Color Precision</span><span id="trace_color_prec_val" style="color:#fa7c1b;">6 bits</span></span>
            <input id="trace_color_prec" type="range" min="1" max="8" value="6" style="width:100%;accent-color:#fa7c1b;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
            <span style="display:flex;justify-content:space-between;"><span>Layer Difference</span><span id="trace_layer_diff_val" style="color:#fa7c1b;">16</span></span>
            <input id="trace_layer_diff" type="range" min="2" max="64" value="16" style="width:100%;accent-color:#fa7c1b;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
            <span style="display:flex;justify-content:space-between;"><span>Min Segment Length</span><span id="trace_length_val" style="color:#fa7c1b;">4 px</span></span>
            <input id="trace_length" type="range" min="2" max="16" value="4" style="width:100%;accent-color:#fa7c1b;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
            <span style="display:flex;justify-content:space-between;"><span>Splice Threshold</span><span id="trace_splice_val" style="color:#fa7c1b;">45°</span></span>
            <input id="trace_splice" type="range" min="10" max="90" value="45" style="width:100%;accent-color:#fa7c1b;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
            <span style="display:flex;justify-content:space-between;"><span>Path Precision</span><span id="trace_path_prec_val" style="color:#fa7c1b;">2</span></span>
            <input id="trace_path_prec" type="range" min="1" max="4" value="2" style="width:100%;accent-color:#fa7c1b;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#bbb;">
            <span style="display:flex;justify-content:space-between;"><span>Binary Threshold</span><span id="trace_binary_thresh_val" style="color:#fa7c1b;">128</span></span>
            <input id="trace_binary_thresh" type="range" min="0" max="255" value="128" disabled style="width:100%;accent-color:#fa7c1b;" />
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#bbb;grid-column:1 / -1;cursor:pointer;">
            <input type="checkbox" id="trace_adaptive" disabled style="accent-color:#fa7c1b;" /> Adaptive thresholding (B/W mode only)
          </label>
        </div>
      </details>

      <!-- Footer Buttons -->
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
        <button type="button" id="trace_cancel" style="height:30px;padding:0 14px;background:#333;border:1px solid #555;color:#ddd;border-radius:4px;cursor:pointer;font-size:12px;">Cancel</button>
        <button type="button" id="trace_apply" style="height:30px;padding:0 16px;background:#fa7c1b;border:1px solid #fa7c1b;color:#111;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;">Apply Trace</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeTraceDialog();
  });
  dlg.querySelector('#trace_cancel').addEventListener('click', () => closeTraceDialog());

  return dlg;
}

function closeTraceDialog() {
  const dlg = document.getElementById('visteras_trace_dialog');
  if (!dlg) return;
  dlg.style.display = 'none';
  if (dlg._previewTimer) clearTimeout(dlg._previewTimer);
  dlg._session = null;
  const host = dlg.querySelector('#trace_preview_host');
  if (host) host.innerHTML = '';
}

function crispLabel(v) {
  return ['Soft', 'Med', 'Sharp'][v] || 'Med';
}

function qualityLabel(v) {
  return ['Smooth', 'Balanced', 'Accurate'][v] || 'Balanced';
}

/** Map UI crispness 0–2 → ltres/qtres (lower = sharper corners / tighter fit). */
function crispToRes(v) {
  return [1.4, 0.8, 0.35][v] ?? 0.8;
}

/** Map simplify quality 0–2 → pathomit + linefilter + simplifyTolerance. */
function qualityToOmit(v) {
  return [
    { linefilter: true, roundcoords: 1, simplifyTolerance: 1.8 },
    { linefilter: false, roundcoords: 1, simplifyTolerance: 1.0 },
    { linefilter: false, roundcoords: 2, simplifyTolerance: 0.4 },
  ][v] || { linefilter: false, roundcoords: 1, simplifyTolerance: 1.0 };
}

function readUiFromDialog(dlg) {
  const presetId = dlg._presetId || 'poster';
  const base = { ...(PRESETS[presetId] || PRESETS.poster) };

  const mode = dlg.querySelector('#trace_mode')?.value || base.mode || 'spline';
  const hierarchical = dlg.querySelector('#trace_hierarchy')?.value || base.hierarchical || 'stacked';
  const clustering = dlg.querySelector('#trace_clustering')?.value || base.clustering || 'color';
  const isBw = clustering === 'bw';

  const colorsEl = dlg.querySelector('#trace_colors');
  const colors = isBw ? 2 : (colorsEl ? parseInt(colorsEl.value, 10) || base.colors : base.colors);

  const simplifyEl = dlg.querySelector('#trace_simplify');
  const simplify = simplifyEl ? (parseFloat(simplifyEl.value) ?? base.simplify) : base.simplify;

  const speckleEl = dlg.querySelector('#trace_speckle') || dlg.querySelector('#trace_despeckle');
  const filterSpeckle = speckleEl ? (parseInt(speckleEl.value, 10) ?? base.filterSpeckle) : base.filterSpeckle;

  const cornerEl = dlg.querySelector('#trace_corner');
  const cornerThreshold = cornerEl ? (parseInt(cornerEl.value, 10) ?? base.cornerThreshold) : base.cornerThreshold;

  const colorPrecEl = dlg.querySelector('#trace_color_prec');
  const colorPrecision = colorPrecEl ? (parseInt(colorPrecEl.value, 10) ?? base.colorPrecision) : base.colorPrecision;

  const layerDiffEl = dlg.querySelector('#trace_layer_diff');
  const layerDifference = layerDiffEl ? (parseInt(layerDiffEl.value, 10) ?? base.layerDifference) : base.layerDifference;

  const lengthEl = dlg.querySelector('#trace_length');
  const lengthThreshold = lengthEl ? (parseFloat(lengthEl.value) ?? base.lengthThreshold) : base.lengthThreshold;

  const spliceEl = dlg.querySelector('#trace_splice');
  const spliceThreshold = spliceEl ? (parseInt(spliceEl.value, 10) ?? base.spliceThreshold) : base.spliceThreshold;

  const pathPrecEl = dlg.querySelector('#trace_path_prec');
  const pathPrecision = pathPrecEl ? (parseInt(pathPrecEl.value, 10) ?? base.pathPrecision) : base.pathPrecision;

  const binaryThreshEl = dlg.querySelector('#trace_binary_thresh');
  const binaryThreshold = binaryThreshEl ? (parseInt(binaryThreshEl.value, 10) ?? base.binaryThreshold) : base.binaryThreshold;

  const adaptiveEl = dlg.querySelector('#trace_adaptive');
  const adaptive = !!adaptiveEl?.checked;

  const ignoreWhite = dlg.querySelector('#trace_ignore_white') ? dlg.querySelector('#trace_ignore_white').checked : !!base.ignoreWhite;
  const preprocess = dlg.querySelector('#trace_preprocess') ? dlg.querySelector('#trace_preprocess').checked : !!base.preprocess;

  return {
    presetId,
    mode,
    hierarchical,
    clustering,
    bw: isBw,
    colors,
    simplify,
    filterSpeckle,
    pathomit: filterSpeckle,
    cornerThreshold,
    colorPrecision,
    layerDifference,
    lengthThreshold,
    spliceThreshold,
    pathPrecision,
    binaryThreshold,
    adaptive,
    ignoreWhite,
    preprocess,
    contrast: preprocess ? (base.contrast || 1.08) : 1,
    flattenWhite: preprocess ? (base.flattenWhite !== false) : false,
    whiteThresh: base.whiteThresh || 245,
    simplifyTolerance: simplify,
    roundcoords: pathPrecision,
    maxIterations: 10,
    ltres: base.ltres || 0.8,
    qtres: base.qtres || 0.8,
    colorquantcycles: base.colorquantcycles || 4,
    colorsampling: isBw ? 0 : (base.colorsampling || 0),
    linefilter: !!base.linefilter,
    rightangleenhance: true,
  };
}

function stylePresetButtons(dlg, activeId) {
  const targetId = (activeId === 'logo') ? 'poster' : (activeId === 'icon') ? 'bw' : (activeId === 'detailed') ? 'photo' : activeId;
  dlg.querySelectorAll('.trace_preset_btn').forEach((btn) => {
    const pId = btn.getAttribute('data-preset');
    const normPId = (pId === 'logo') ? 'poster' : (pId === 'icon') ? 'bw' : (pId === 'detailed') ? 'photo' : pId;
    const on = normPId === targetId;
    btn.style.background = on ? '#fa7c1b' : '#333';
    btn.style.borderColor = on ? '#fa7c1b' : '#555';
    btn.style.color = on ? '#111' : '#ddd';
    btn.style.fontWeight = on ? '600' : '400';
  });
}

function applyPresetToControls(dlg, presetId) {
  const p = PRESETS[presetId] || PRESETS.poster;
  dlg._presetId = p.id;
  stylePresetButtons(dlg, p.id);

  const mode = dlg.querySelector('#trace_mode');
  if (mode) mode.value = p.mode;

  const hierarchy = dlg.querySelector('#trace_hierarchy');
  if (hierarchy) hierarchy.value = p.hierarchical;

  const clustering = dlg.querySelector('#trace_clustering');
  if (clustering) clustering.value = p.clustering;

  const colors = dlg.querySelector('#trace_colors');
  if (colors) {
    colors.min = String(p.colorsMin || 2);
    colors.max = String(p.colorsMax || 32);
    colors.value = String(p.colors);
    colors.disabled = (p.clustering === 'bw');
  }
  const colorsVal = dlg.querySelector('#trace_colors_val');
  if (colorsVal) colorsVal.textContent = String(p.colors);

  const simplify = dlg.querySelector('#trace_simplify');
  if (simplify) simplify.value = String(p.simplify);
  const simplifyVal = dlg.querySelector('#trace_simplify_val');
  if (simplifyVal) simplifyVal.textContent = Number(p.simplify).toFixed(1);

  const speckle = dlg.querySelector('#trace_speckle');
  if (speckle) speckle.value = String(p.filterSpeckle);
  const speckleVal = dlg.querySelector('#trace_speckle_val');
  if (speckleVal) speckleVal.textContent = `${p.filterSpeckle} px`;

  const corner = dlg.querySelector('#trace_corner');
  if (corner) corner.value = String(p.cornerThreshold);
  const cornerVal = dlg.querySelector('#trace_corner_val');
  if (cornerVal) cornerVal.textContent = `${p.cornerThreshold}°`;

  // Advanced controls
  const colorPrec = dlg.querySelector('#trace_color_prec');
  if (colorPrec) colorPrec.value = String(p.colorPrecision);
  const colorPrecVal = dlg.querySelector('#trace_color_prec_val');
  if (colorPrecVal) colorPrecVal.textContent = `${p.colorPrecision} bits`;

  const layerDiff = dlg.querySelector('#trace_layer_diff');
  if (layerDiff) layerDiff.value = String(p.layerDifference);
  const layerDiffVal = dlg.querySelector('#trace_layer_diff_val');
  if (layerDiffVal) layerDiffVal.textContent = String(p.layerDifference);

  const length = dlg.querySelector('#trace_length');
  if (length) length.value = String(p.lengthThreshold);
  const lengthVal = dlg.querySelector('#trace_length_val');
  if (lengthVal) lengthVal.textContent = `${p.lengthThreshold} px`;

  const splice = dlg.querySelector('#trace_splice');
  if (splice) splice.value = String(p.spliceThreshold);
  const spliceVal = dlg.querySelector('#trace_splice_val');
  if (spliceVal) spliceVal.textContent = `${p.spliceThreshold}°`;

  const pathPrec = dlg.querySelector('#trace_path_prec');
  if (pathPrec) pathPrec.value = String(p.pathPrecision);
  const pathPrecVal = dlg.querySelector('#trace_path_prec_val');
  if (pathPrecVal) pathPrecVal.textContent = String(p.pathPrecision);

  const binaryThresh = dlg.querySelector('#trace_binary_thresh');
  if (binaryThresh) {
    binaryThresh.value = String(p.binaryThreshold);
    binaryThresh.disabled = (p.clustering !== 'bw');
  }
  const binaryThreshVal = dlg.querySelector('#trace_binary_thresh_val');
  if (binaryThreshVal) binaryThreshVal.textContent = String(p.binaryThreshold);

  const adaptive = dlg.querySelector('#trace_adaptive');
  if (adaptive) {
    adaptive.checked = !!p.adaptive;
    adaptive.disabled = (p.clustering !== 'bw');
  }

  const ignoreWhite = dlg.querySelector('#trace_ignore_white');
  if (ignoreWhite) ignoreWhite.checked = !!p.ignoreWhite;

  const preprocess = dlg.querySelector('#trace_preprocess');
  if (preprocess) preprocess.checked = !!p.preprocess;
}

async function computeTracePayload(img, ui) {
  const { imgd, width, height } = imageToImageData(img, ui);

  // Try VTracer WebAssembly engine first for high-performance, handle-based curves
  try {
    await initVTracer();
    const isBw = ui.clustering === 'bw' || ui.bw;
    const vtracerOpts = {
      preset: ui.presetId || (isBw ? 'bw' : 'poster'),
      clustering: ui.clustering || (isBw ? 'bw' : 'color'),
      hierarchical: ui.hierarchical || 'stacked',
      mode: ui.mode || 'spline',
      filterSpeckle: Number.isFinite(ui.filterSpeckle) ? ui.filterSpeckle : (Number.isFinite(ui.pathomit) ? ui.pathomit : 4),
      colorPrecision: Number.isFinite(ui.colorPrecision) ? ui.colorPrecision : 6,
      layerDifference: Number.isFinite(ui.layerDifference) ? ui.layerDifference : 16,
      cornerThreshold: Number.isFinite(ui.cornerThreshold) ? ui.cornerThreshold : 60,
      lengthThreshold: Number.isFinite(ui.lengthThreshold) ? ui.lengthThreshold : 4,
      maxIterations: Number.isFinite(ui.maxIterations) ? ui.maxIterations : 10,
      spliceThreshold: Number.isFinite(ui.spliceThreshold) ? ui.spliceThreshold : 45,
      pathPrecision: Number.isFinite(ui.pathPrecision) ? ui.pathPrecision : 2,
      simplify: Number.isFinite(ui.simplify) ? ui.simplify : 1.5,
    };
    if (!isBw && ui.colors) {
      vtracerOpts.maxColors = Math.max(2, Math.min(32, ui.colors));
    }
    if (isBw) {
      vtracerOpts.binaryThreshold = Number.isFinite(ui.binaryThreshold) ? ui.binaryThreshold : 128;
      vtracerOpts.adaptive = !!ui.adaptive;
    }

    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const svgString = convertPixels(imgd.data, width, height, vtracerOpts);
    const traceMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);

    const colorGroups = parseVtracerSvg(svgString, ui.ignoreWhite, ui.whiteThresh || 245);
    if (!colorGroups.length) {
      throw new Error('No paths produced — try adjusting colors or uncheck Ignore white');
    }

    let totalPaths = 0;
    for (const cg of colorGroups) totalPaths += cg.paths.length;

    // Construct responsive preview SVG with viewBox attribute
    let previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;max-width:100%;max-height:180px;object-fit:contain;display:block;">`;
    for (const cg of colorGroups) {
      for (const p of cg.paths) {
        previewSvg += `<path d="${p.d}" fill="${p.fill}" fill-rule="evenodd"/>`;
      }
    }
    previewSvg += '</svg>';

    return {
      engine: 'vtracer',
      colorGroups,
      width,
      height,
      previewSvg,
      rawSvg: svgString,
      options: ui,
      traceMs,
      totalPaths,
    };
  } catch (wasmErr) {
    console.warn('VTracer Wasm trace unavailable or failed; falling back to ImageTracer', wasmErr);
  }

  // Fallback: ImageTracer.js
  if (!window.ImageTracer) throw new Error('ImageTracer library is not loaded');
  const options = buildTraceOptions(ui);
  const tracedata = window.ImageTracer.imagedataToTracedata(imgd, options);
  if (options.simplifyTolerance > 0) {
    optimizeTracedata(tracedata, options.simplifyTolerance);
  }
  const colorGroups = tracedataToColorGroups(tracedata, options, ui);
  if (!colorGroups.length) {
    throw new Error('No paths produced — try more colors or turn off Ignore white');
  }
  let totalPaths = 0;
  for (const cg of colorGroups) totalPaths += cg.paths.length;

  let previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;max-width:100%;max-height:180px;object-fit:contain;display:block;">`;
  for (const cg of colorGroups) {
    for (const p of cg.paths) {
      previewSvg += `<path d="${p.d}" fill="${p.fill}" fill-rule="evenodd"/>`;
    }
  }
  previewSvg += '</svg>';

  return { engine: 'imagetracer', colorGroups, width, height, previewSvg, tracedata, options, totalPaths, traceMs: 0 };
}

function renderPreview(dlg, payload) {
  const host = dlg.querySelector('#trace_preview_host');
  const status = dlg.querySelector('#trace_preview_status');
  if (!host) return;
  host.innerHTML = '';
  if (!payload) {
    if (status) status.textContent = 'No preview';
    return;
  }

  const svgContent = typeof payload === 'string' ? payload : payload.previewSvg;
  if (!svgContent) {
    if (status) status.textContent = 'No preview';
    return;
  }

  host.innerHTML = svgContent;
  if (status) {
    if (typeof payload === 'object' && payload.totalPaths != null) {
      const msStr = payload.traceMs != null ? ` · ${payload.traceMs}ms` : '';
      status.textContent = `Ready: ${payload.totalPaths} ${payload.totalPaths === 1 ? 'path' : 'paths'}${msStr}`;
    } else {
      status.textContent = 'Live preview';
    }
  }
}

function schedulePreview(dlg) {
  if (dlg._previewTimer) clearTimeout(dlg._previewTimer);
  const status = dlg.querySelector('#trace_preview_status');
  if (status) status.textContent = 'Updating…';
  dlg._previewTimer = setTimeout(async () => {
    const session = dlg._session;
    if (!session || !session.img) return;
    try {
      const ui = readUiFromDialog(dlg);
      const payload = await computeTracePayload(session.img, ui);
      session.lastPayload = payload;
      session.lastUi = ui;
      renderPreview(dlg, payload);
    } catch (err) {
      console.warn('Trace preview failed', err);
      if (status) status.textContent = err.message || 'Preview failed';
      const host = dlg.querySelector('#trace_preview_host');
      if (host) host.innerHTML = '';
    }
  }, 220);
}

function insertTracedGroups(svgEditor, imageEl, payload, ui = null) {
  const sc = svgEditor.svgCanvas;
  const { width: srcW, height: srcH } = payload;
  const activeUi = ui || (document.getElementById('visteras_trace_dialog') ? readUiFromDialog(document.getElementById('visteras_trace_dialog')) : {});
  const pointTransformer = makePointTransformer(imageEl, srcW, srcH, payload.options?.roundcoords ?? 1);

  let colorGroups;
  if (payload.engine === 'vtracer') {
    colorGroups = payload.colorGroups.map((cg) => ({
      fill: cg.fill,
      paths: cg.paths.map((p) => ({
        fill: p.fill,
        d: transformSvgPathD(p.d, pointTransformer),
      })),
    }));
  } else {
    colorGroups = tracedataToColorGroups(payload.tracedata, payload.options, activeUi, pointTransformer);
  }

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('id', sc.getNextId());
  g.setAttribute('class', TRACE_GROUP_CLASS);
  g.setAttribute('data-visteras-traced', '1');
  g.setAttribute('data-name', 'Traced');
  // inkscape-style label for layers panel if present
  try { g.setAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'inkscape:label', 'Traced'); } catch (_) { /* ignore */ }

  colorGroups.forEach((cg) => {
    const cgEl = document.createElementNS(SVG_NS, 'g');
    cgEl.setAttribute('id', sc.getNextId());
    cgEl.setAttribute('data-name', cg.fill);
    cgEl.setAttribute('data-visteras-trace-color', cg.fill);
    try { cgEl.setAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'inkscape:label', cg.fill); } catch (_) { /* ignore */ }

    cg.paths.forEach((p) => {
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('id', sc.getNextId());
      pathEl.setAttribute('d', p.d);
      pathEl.setAttribute('fill', p.fill);
      pathEl.setAttribute('stroke', 'none');
      pathEl.setAttribute('fill-rule', 'evenodd');
      cgEl.appendChild(pathEl);
    });
    g.appendChild(cgEl);
  });

  if (!g.childNodes.length) throw new Error('No usable path data after filtering');

  const parent = imageEl.parentNode;
  const next = imageEl.nextSibling;
  // Keep original raster; insert traced group above it
  if (next) parent.insertBefore(g, next);
  else parent.appendChild(g);

  if (sc.history?.InsertElementCommand && sc.addCommandToHistory) {
    try {
      const { InsertElementCommand } = sc.history;
      sc.addCommandToHistory(new InsertElementCommand(g));
    } catch (_) { /* history optional */ }
  }

  sc.selectOnly([g]);
  svgEditor.topPanel?.updateContextPanel?.();
  return g;
}

function wireDialogControls(dlg) {
  if (dlg._wired) return;
  dlg._wired = true;

  dlg.querySelectorAll('.trace_preset_btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyPresetToControls(dlg, btn.getAttribute('data-preset'));
      schedulePreview(dlg);
    });
  });

  const bindVal = (inputId, labelId, fmt) => {
    const input = dlg.querySelector(inputId);
    const label = dlg.querySelector(labelId);
    input?.addEventListener('input', () => {
      if (label) label.textContent = fmt(input.value);
      schedulePreview(dlg);
    });
  };

  bindVal('#trace_colors', '#trace_colors_val', (v) => String(v));
  bindVal('#trace_simplify', '#trace_simplify_val', (v) => Number(v).toFixed(1));
  bindVal('#trace_speckle', '#trace_speckle_val', (v) => `${v} px`);
  bindVal('#trace_corner', '#trace_corner_val', (v) => `${v}°`);
  bindVal('#trace_color_prec', '#trace_color_prec_val', (v) => `${v} bits`);
  bindVal('#trace_layer_diff', '#trace_layer_diff_val', (v) => String(v));
  bindVal('#trace_length', '#trace_length_val', (v) => `${v} px`);
  bindVal('#trace_splice', '#trace_splice_val', (v) => `${v}°`);
  bindVal('#trace_path_prec', '#trace_path_prec_val', (v) => String(v));
  bindVal('#trace_binary_thresh', '#trace_binary_thresh_val', (v) => String(v));

  // Mode and Hierarchy dropdowns
  dlg.querySelector('#trace_mode')?.addEventListener('change', () => schedulePreview(dlg));
  dlg.querySelector('#trace_hierarchy')?.addEventListener('change', () => schedulePreview(dlg));

  // Clustering dropdown toggle logic
  const clusteringSel = dlg.querySelector('#trace_clustering');
  clusteringSel?.addEventListener('change', () => {
    const isBw = clusteringSel.value === 'bw';
    const colors = dlg.querySelector('#trace_colors');
    const binThresh = dlg.querySelector('#trace_binary_thresh');
    const adaptive = dlg.querySelector('#trace_adaptive');
    if (colors) colors.disabled = isBw;
    if (binThresh) binThresh.disabled = !isBw;
    if (adaptive) adaptive.disabled = !isBw;
    schedulePreview(dlg);
  });

  dlg.querySelector('#trace_ignore_white')?.addEventListener('change', () => schedulePreview(dlg));
  dlg.querySelector('#trace_preprocess')?.addEventListener('change', () => schedulePreview(dlg));
  dlg.querySelector('#trace_adaptive')?.addEventListener('change', () => schedulePreview(dlg));

  dlg.querySelector('#trace_apply')?.addEventListener('click', async () => {
    const session = dlg._session;
    if (!session) return;
    const applyBtn = dlg.querySelector('#trace_apply');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Tracing…';
    try {
      const ui = readUiFromDialog(dlg);
      let payload = session.lastPayload;
      // Recompute if UI drifted
      if (!payload || JSON.stringify(session.lastUi) !== JSON.stringify(ui)) {
        payload = await computeTracePayload(session.img, ui);
      }
      insertTracedGroups(session.svgEditor, session.imageEl, payload, ui);
      closeTraceDialog();
      showToast('Traced paths inserted above the original (grouped by color).');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Trace failed');
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply Trace';
    }
  });
}

function getSelectedImage(svgEditor) {
  const sc = svgEditor?.svgCanvas;
  const sel = (sc && typeof sc.getSelectedElements === 'function')
    ? sc.getSelectedElements().filter(Boolean)
    : [];

  let el = svgEditor?.selectedElement || (sel.length === 1 ? sel[0] : null);
  if (!el && sel.length > 0) {
    el = sel[0];
  }
  if (!el && svgEditor?.selectedElements?.length > 0) {
    el = svgEditor.selectedElements[0];
  }

  if (sel.length > 1) {
    const images = sel.filter((item) => (item?.nodeName || item?.tagName || '').toLowerCase() === 'image');
    if (images.length === 1) {
      el = images[0];
    } else {
      return null;
    }
  }

  if (!el) return null;

  const tag = (el.nodeName || el.tagName || '').toLowerCase();
  if (tag === 'image') return el;
  if (el.querySelector) {
    const childImg = el.querySelector('image');
    if (childImg) return childImg;
  }
  return null;
}

async function openTraceDialog(svgEditor) {
  const el = getSelectedImage(svgEditor);
  if (!el) {
    alert('Select a single raster image to trace.');
    return;
  }
  const sc = svgEditor.svgCanvas;
  const href = getImageHref(el, sc);
  if (!href) {
    alert('Selected image has no embedded data to trace.');
    return;
  }
  if (!window.ImageTracer) {
    alert('ImageTracer library is not loaded.');
    return;
  }

  const dlg = ensureTraceDialog();
  wireDialogControls(dlg);
  applyPresetToControls(dlg, 'poster');
  dlg.style.display = 'flex';

  showToast('Image Trace: adjust parameters or choose a preset for best vector results.', 3000);

  try {
    const img = await loadImageElement(href);
    dlg._session = { svgEditor, imageEl: el, img, lastPayload: null, lastUi: null };
    schedulePreview(dlg);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Could not load image for tracing');
    closeTraceDialog();
  }
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasImageTrace({ svgEditor }) {
  if (!svgEditor) return;
  window.__visterasTraceSelectedImage = () => openTraceDialog(svgEditor);

  // Menu: Object → Trace Image… (id must match index.html)
  document.getElementById('action_trace_image')?.addEventListener('click', () => {
    openTraceDialog(svgEditor);
  });
}

export {
  optimizeContourSegments,
  optimizeTracedata,
  buildTraceOptions,
  qualityToOmit,
  pathSampleToD,
  tracedataToColorGroups,
  perpDist,
  rdp,
  parseVtracerSvg,
  transformSvgPathD,
  computeTracePayload,
};

