/**
 * Library of Congress / Chronicling America IIIF helpers for Collage print export.
 *
 * LoC image_url entries are typically:
 *   …/iiif/service:…/full/pct:6.25/0/default.jpg
 *   …/iiif/service:…/full/pct:12.5/0/default.jpg   ← used as "largePath" today
 * Full scans are ~5k×6k (see info.json). `full/max` returns 400 on tile.loc.gov;
 * use pct:100 or explicit w,/ ,h sizes. ACAO: * (safe with crossOrigin=anonymous).
 */

export const LOC_IIIF_HOST = /tile\.loc\.gov/i;
const DEFAULT_TIMEOUT_MS = 45000;
const MAX_EDGE_PX = 4000; // hard memory ceiling for a single request

/** Session cache: key → { info } or { objectUrl, revoke } */
export function createLocHiResCache() {
  return new Map();
}

/**
 * Parse an IIIF Image API 2.x URL into base + path parts.
 * Returns null if not a recognizable IIIF image URL.
 */
export function parseIiifImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.split('#')[0].trim();
  // …/{identifier}/{region}/{size}/{rotation}/{quality}.{format}
  const m = clean.match(/^(https?:\/\/[^?#]+\/iiif\/[^?#]+?)\/(full|pct:[0-9.]+|[0-9,\s]+)\/([^/]+)\/([^/]+)\/([^/.]+)\.(jpg|jpeg|png|webp|gif)\/?$/i);
  if (!m) {
    // Broader: base ends before /full/ or /pct:
    const m2 = clean.match(/^(https?:\/\/[^?#]+\/iiif\/.+?)\/(full|pct:[^/]+|\d+,\d+,\d+,\d+)\/(.+)$/i);
    if (!m2) return null;
    const rest = m2[3].split('/');
    if (rest.length < 3) return null;
    const [size, rotation, file] = [rest[0], rest[1], rest.slice(2).join('/')];
    const qm = file.match(/^([^/.]+)\.(jpg|jpeg|png|webp|gif)$/i);
    if (!qm) return null;
    return {
      base: m2[1],
      region: m2[2],
      size,
      rotation,
      quality: qm[1],
      format: qm[2].toLowerCase(),
      original: clean,
    };
  }
  return {
    base: m[1],
    region: m[2],
    size: m[3],
    rotation: m[4],
    quality: m[5],
    format: m[6].toLowerCase(),
    original: clean,
  };
}

export function isLocIiifUrl(url) {
  return !!(url && LOC_IIIF_HOST.test(url) && parseIiifImageUrl(url));
}

export function iiifInfoUrl(base) {
  return `${String(base).replace(/\/$/, '')}/info.json`;
}

export function buildIiifUrl({ base, region = 'full', size = 'pct:100', rotation = '0', quality = 'default', format = 'jpg' }) {
  const b = String(base).replace(/\/$/, '');
  return `${b}/${region}/${size}/${rotation}/${quality}.${format}`;
}

/** Cap a requested edge so we don't pull more pixels than print needs (or MAX_EDGE_PX). */
export function chooseIiifSize(regionW, regionH, targetW, targetH, { maxEdge = MAX_EDGE_PX } = {}) {
  const rw = Math.max(1, Number(regionW) || 1);
  const rh = Math.max(1, Number(regionH) || 1);
  let tw = Math.max(1, Math.ceil(Number(targetW) || 1));
  let th = Math.max(1, Math.ceil(Number(targetH) || 1));
  // Don't upscale past source region
  tw = Math.min(tw, rw);
  th = Math.min(th, rh);
  // Fit inside maxEdge while covering the target
  const scale = Math.min(1, maxEdge / Math.max(tw, th));
  tw = Math.max(1, Math.round(tw * scale));
  th = Math.max(1, Math.round(th * scale));
  // Prefer height constraint if portrait region, else width — IIIF ,h or w,
  if (rh >= rw) return `,${th}`;
  return `${tw},`;
}

/**
 * On-screen visible rectangle in *normalized* source coordinates (0–1).
 * Mirrors Collage updateTileTransform: cover-fit base size, then
 * translate(-50%,-50%) translate(pan) scale(zoom) with origin at center.
 * Rotation/flip: Collage tiles do not flip/rotate the img today; IIIF
 * rotation from the preview URL is preserved on the print request.
 */
export function normalizedVisibleRect({
  tileW, tileH, naturalW, naturalH, zoom = 1, panX = 0, panY = 0,
}) {
  const tw = Math.max(1, Number(tileW) || 1);
  const th = Math.max(1, Number(tileH) || 1);
  const nw = Math.max(1, Number(naturalW) || 1);
  const nh = Math.max(1, Number(naturalH) || 1);
  const z = Math.max(1, Number(zoom) || 1);
  const px = Number(panX) || 0;
  const py = Number(panY) || 0;
  const scaleCover = Math.max(tw / nw, th / nh);
  const baseW = nw * scaleCover;
  const baseH = nh * scaleCover;
  const renderedW = baseW * z;
  const renderedH = baseH * z;
  const imgOffsetX = tw / 2 + px - renderedW / 2;
  const imgOffsetY = th / 2 + py - renderedH / 2;
  const visLeft = Math.max(0, -imgOffsetX);
  const visTop = Math.max(0, -imgOffsetY);
  const visRight = Math.min(renderedW, tw - imgOffsetX);
  const visBottom = Math.min(renderedH, th - imgOffsetY);
  const visW = Math.max(0, visRight - visLeft);
  const visH = Math.max(0, visBottom - visTop);
  // Fraction of the *image* (not the tile) that is visible
  let x = visLeft / renderedW;
  let y = visTop / renderedH;
  let w = visW / renderedW;
  let h = visH / renderedH;
  // Clamp to unit square; keep a tiny epsilon so empty never slips through
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  w = Math.min(1 - x, Math.max(1e-6, w));
  h = Math.min(1 - y, Math.max(1e-6, h));
  return { x, y, w, h };
}

/** Map normalized 0–1 rect → integer source pixels (IIIF region). */
export function sourceRegionFromNormalized(norm, sourceW, sourceH) {
  const sw = Math.max(1, Number(sourceW) || 1);
  const sh = Math.max(1, Number(sourceH) || 1);
  let x = Math.floor((Number(norm.x) || 0) * sw);
  let y = Math.floor((Number(norm.y) || 0) * sh);
  let w = Math.ceil((Number(norm.w) || 0) * sw);
  let h = Math.ceil((Number(norm.h) || 0) * sh);
  x = Math.max(0, Math.min(x, sw - 1));
  y = Math.max(0, Math.min(y, sh - 1));
  w = Math.max(1, Math.min(w, sw - x));
  h = Math.max(1, Math.min(h, sh - y));
  return { x, y, w, h };
}

/**
 * Visible tile crop in *preview* image natural pixels (cover-fit + pan/zoom).
 * Derived from normalizedVisibleRect so preview and source stay in sync.
 */
export function visibleRegionInPreview(opts) {
  const nw = Math.max(1, Number(opts.naturalW) || 1);
  const nh = Math.max(1, Number(opts.naturalH) || 1);
  return sourceRegionFromNormalized(normalizedVisibleRect(opts), nw, nh);
}

/** Map preview-natural region → source IIIF region pixels. */
export function scaleRegionToSource(region, previewW, previewH, sourceW, sourceH) {
  const sx = (Number(sourceW) || 1) / Math.max(1, Number(previewW) || 1);
  const sy = (Number(sourceH) || 1) / Math.max(1, Number(previewH) || 1);
  let x = Math.floor(region.x * sx);
  let y = Math.floor(region.y * sy);
  let w = Math.ceil(region.w * sx);
  let h = Math.ceil(region.h * sy);
  x = Math.max(0, Math.min(x, sourceW - 1));
  y = Math.max(0, Math.min(y, sourceH - 1));
  w = Math.max(1, Math.min(w, sourceW - x));
  h = Math.max(1, Math.min(h, sourceH - y));
  return { x, y, w, h };
}

/**
 * Export framing mode after a hi-res swap:
 * - fill-tile: IIIF region *is* the visible crop → draw filling the tile with
 *   no further pan/zoom (avoids double-cropping the preview transform).
 * - cover-transform: full image → keep Collage cover + pan/zoom transform.
 */
export function exportFramingMode(plan) {
  if (plan?.framing === 'fill-tile' || (plan?.region && plan.region !== 'full')) {
    return 'fill-tile';
  }
  return 'cover-transform';
}

/** Snapshot inline framing styles so prepareImagesForPrintExport can restore. */
export function snapshotImgFraming(img) {
  if (!img) return null;
  return {
    src: img.src,
    width: img.style.width,
    height: img.style.height,
    maxWidth: img.style.maxWidth,
    maxHeight: img.style.maxHeight,
    position: img.style.position,
    top: img.style.top,
    left: img.style.left,
    transform: img.style.transform,
    objectFit: img.style.objectFit,
    onload: img.onload,
  };
}

export function restoreImgFraming(img, snap) {
  if (!img || !snap) return;
  img.style.width = snap.width;
  img.style.height = snap.height;
  img.style.maxWidth = snap.maxWidth;
  img.style.maxHeight = snap.maxHeight;
  img.style.position = snap.position;
  img.style.top = snap.top;
  img.style.left = snap.left;
  img.style.transform = snap.transform;
  img.style.objectFit = snap.objectFit;
  img.onload = snap.onload;
}

/**
 * Draw a region-cropped print image so it fills the tile box exactly.
 * No pan/zoom — those were already baked into the IIIF region.
 */
export function applyFillTileFraming(img, tileW, tileH) {
  const tw = Math.max(1, Math.round(Number(tileW) || 1));
  const th = Math.max(1, Math.round(Number(tileH) || 1));
  img.style.width = `${tw}px`;
  img.style.height = `${th}px`;
  img.style.maxWidth = 'none';
  img.style.maxHeight = 'none';
  img.style.position = 'absolute';
  img.style.top = '50%';
  img.style.left = '50%';
  img.style.objectFit = 'fill';
  img.style.transform = 'translate(-50%, -50%)';
  img.onload = null; // prevent Collage bindTileImageEvents from re-applying pan/zoom
}

export function regionToIiifPath({ x, y, w, h }) {
  return `${x},${y},${w},${h}`;
}

async function fetchWithTimeout(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await fetchImpl(url, { signal: ctrl.signal, mode: 'cors' });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function fetchIiifInfo(base, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, cache } = {}) {
  const key = `info:${base}`;
  if (cache?.has(key)) return cache.get(key);
  const res = await fetchWithTimeout(iiifInfoUrl(base), { fetchImpl, timeoutMs });
  if (!res.ok) throw new Error(`IIIF info.json HTTP ${res.status}`);
  const info = await res.json();
  const out = {
    width: Number(info.width) || 0,
    height: Number(info.height) || 0,
    id: info['@id'] || info.id || base,
  };
  if (!out.width || !out.height) throw new Error('IIIF info.json missing width/height');
  cache?.set(key, out);
  return out;
}

/**
 * Build the best print URL for a LoC IIIF image.
 * Prefers a cropped region when tile geometry is known; always size-caps.
 * Does not fetch the image bytes — only info.json (unless cache hit).
 */
export async function planLocPrintRequest({
  url,
  tileW,
  tileH,
  naturalW,
  naturalH,
  zoom = 1,
  panX = 0,
  panY = 0,
  exportScale = 3,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cache,
  maxEdge = MAX_EDGE_PX,
} = {}) {
  const parsed = parseIiifImageUrl(url);
  if (!parsed || !LOC_IIIF_HOST.test(url)) {
    return { upgraded: false, url, reason: 'not-loc-iiif' };
  }
  const info = await fetchIiifInfo(parsed.base, { fetchImpl, timeoutMs, cache });
  let region = 'full';
  let regionW = info.width;
  let regionH = info.height;

  let framing = 'cover-transform';
  let normalized = null;
  if (tileW > 0 && tileH > 0 && naturalW > 0 && naturalH > 0) {
    normalized = normalizedVisibleRect({
      tileW, tileH, naturalW, naturalH, zoom, panX, panY,
    });
    const srcRegion = sourceRegionFromNormalized(normalized, info.width, info.height);
    // Only use region if it's meaningfully cropped (< 98% of full)
    const areaRatio = (srcRegion.w * srcRegion.h) / (info.width * info.height);
    if (areaRatio < 0.98) {
      region = regionToIiifPath(srcRegion);
      regionW = srcRegion.w;
      regionH = srcRegion.h;
      framing = 'fill-tile';
    }
  }

  const targetW = Math.max(1, (Number(tileW) || regionW) * exportScale);
  const targetH = Math.max(1, (Number(tileH) || regionH) * exportScale);
  const size = chooseIiifSize(regionW, regionH, targetW, targetH, { maxEdge });
  // LoC rejects `max`; pct:100 works for full, but size-capped w,/ ,h is preferred.
  // Preserve preview URL rotation (Collage tiles do not apply CSS rotate/flip).
  const printUrl = buildIiifUrl({
    base: parsed.base,
    region,
    size,
    rotation: parsed.rotation || '0',
    quality: parsed.quality || 'default',
    format: parsed.format || 'jpg',
  });
  return {
    upgraded: true,
    url: printUrl,
    base: parsed.base,
    region,
    size,
    framing,
    normalized,
    sourceWidth: info.width,
    sourceHeight: info.height,
    regionWidth: regionW,
    regionHeight: regionH,
  };
}

/**
 * Fetch print pixels as a blob object URL (session-cached).
 * Falls back by throwing — caller shows toast and keeps the 12.5% src.
 */
export async function fetchLocPrintObjectUrl(plan, {
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cache,
} = {}) {
  if (!plan?.upgraded || !plan.url) throw new Error('no plan');
  const key = `blob:${plan.url}`;
  if (cache?.has(key)) return cache.get(key);
  const res = await fetchWithTimeout(plan.url, { fetchImpl, timeoutMs });
  if (!res.ok) throw new Error(`IIIF image HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob || !blob.size) throw new Error('empty IIIF image');
  const objectUrl = URL.createObjectURL(blob);
  const entry = { objectUrl, revoke: () => { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } } };
  cache?.set(key, entry);
  return entry;
}

/** Revoke all blob object URLs in the cache (keep info.json entries). */
export function releaseLocHiResBlobs(cache) {
  if (!cache) return 0;
  let n = 0;
  for (const [k, v] of cache.entries()) {
    if (k.startsWith('blob:') && v?.revoke) {
      v.revoke();
      cache.delete(k);
      n++;
    }
  }
  return n;
}
