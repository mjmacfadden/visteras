/**
 * Visteras Vector — Eyedropper raster sampling (Illustrator point sample).
 *
 * • Plain click on a placed <image>: the pixel under the cursor.
 * • Shift-click anywhere: the rendered pixel of the artwork under the cursor
 *   (the document is re-rendered off-screen for a 1-screen-pixel viewBox).
 *
 * Images are drawn once at their natural size into an offscreen canvas that is
 * cached per href (data:, blob:, same-origin and CORS-enabled URLs). A
 * cross-origin image without CORS taints the canvas; callers then fall back to
 * window.EyeDropper (Chromium) or a toast (see sampleWithFallback).
 *
 * Transparent pixels (alpha 0) yield null → the caller does nothing (the well
 * keeps its colour). Illustrator never produces "None" from a pixel sample.
 * Partially transparent pixels are composited over white (the artboard).
 */

export const TAINTED = 'SecurityError';

/** An Error flagged as a canvas-taint / security failure. */
export function taintError(message = 'The image is cross-origin and cannot be read.') {
  const err = new Error(message);
  err.name = TAINTED;
  err.tainted = true;
  return err;
}

export function isTaintError(err) {
  return !!(err && (err.tainted || err.name === TAINTED || err.code === 18));
}

// ─── Matrix helpers (DOMMatrix / SVGMatrix compatible {a..f}) ────────────────
export function invertMatrix(m) {
  const det = m.a * m.d - m.b * m.c;
  if (!det || !Number.isFinite(det)) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function applyMatrix(m, x, y) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

// ─── preserveAspectRatio ─────────────────────────────────────────────────────
const ALIGNS = new Set([
  'none', 'xMinYMin', 'xMidYMin', 'xMaxYMin', 'xMinYMid', 'xMidYMid',
  'xMaxYMid', 'xMinYMax', 'xMidYMax', 'xMaxYMax',
]);

/** Parse "[defer] <align> [meet|slice]" (defaults: xMidYMid meet). */
export function parsePreserveAspectRatio(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts[0] === 'defer') parts.shift();
  const align = ALIGNS.has(parts[0]) ? parts[0] : 'xMidYMid';
  const slice = align !== 'none' && parts[1] === 'slice';
  return { align, slice };
}

function alignFactor(align, axis) {
  const key = axis === 'x' ? align.slice(1, 4) : align.slice(5, 8);
  if (key === 'Min') return 0;
  if (key === 'Max') return 1;
  return 0.5;
}

/**
 * Map a point in the <image>'s user space to an integer pixel of the source
 * bitmap, honouring x/y/width/height and preserveAspectRatio.
 *
 * @param {number} ux
 * @param {number} uy
 * @param {{x:number,y:number,width:number,height:number}} geom
 * @param {{width:number,height:number}} natural bitmap size
 * @param {{align:string,slice:boolean}|string} [par]
 * @returns {{px:number,py:number}|null} null when the point misses the
 *   rendered image (outside the viewport, or in a "meet" letterbox bar)
 */
export function mapUserToImagePixel(ux, uy, geom, natural, par) {
  const { align, slice } = typeof par === 'string' || par == null ? parsePreserveAspectRatio(par) : par;
  const nw = Number(natural?.width) || 0;
  const nh = Number(natural?.height) || 0;
  const x = Number(geom?.x) || 0;
  const y = Number(geom?.y) || 0;
  const w = Number(geom?.width) > 0 ? Number(geom.width) : nw;
  const h = Number(geom?.height) > 0 ? Number(geom.height) : nh;
  if (!(nw > 0 && nh > 0 && w > 0 && h > 0)) return null;
  // The image is always clipped to its viewport (x, y, width, height).
  if (ux < x || uy < y || ux >= x + w || uy >= y + h) return null;

  let fx;
  let fy;
  if (align === 'none') {
    fx = ((ux - x) * nw) / w;
    fy = ((uy - y) * nh) / h;
  } else {
    const sx = w / nw;
    const sy = h / nh;
    const s = slice ? Math.max(sx, sy) : Math.min(sx, sy);
    const dw = nw * s;
    const dh = nh * s;
    const tx = x + (w - dw) * alignFactor(align, 'x');
    const ty = y + (h - dh) * alignFactor(align, 'y');
    fx = (ux - tx) / s;
    fy = (uy - ty) / s;
  }
  const px = Math.floor(fx);
  const py = Math.floor(fy);
  if (px < 0 || py < 0 || px >= nw || py >= nh) return null;
  return { px, py };
}

/**
 * Screen (client) point → image pixel through the image element's screen CTM
 * (which includes its own transform, its ancestors' transforms and the zoom).
 */
export function clientToImagePixel(clientX, clientY, ctm, geom, natural, par) {
  const inv = ctm && invertMatrix(ctm);
  if (!inv) return null;
  const p = applyMatrix(inv, clientX, clientY);
  return mapUserToImagePixel(p.x, p.y, geom, natural, par);
}

// ─── Colour ──────────────────────────────────────────────────────────────────
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * RGBA (0-255) → "#rrggbb". Alpha 0 → null (nothing to sample). Partial alpha
 * is composited over white, which is what the artboard shows.
 */
export function rgbaToHex(r, g, b, a = 255) {
  if (!(a > 0)) return null;
  if (a < 255) {
    const k = a / 255;
    r = r * k + 255 * (1 - k);
    g = g * k + 255 * (1 - k);
    b = b * k + 255 * (1 - k);
  }
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

// ─── Image href / geometry ───────────────────────────────────────────────────
const XLINK = 'http://www.w3.org/1999/xlink';

export function imageHref(el) {
  if (!el?.getAttribute) return null;
  return el.getAttribute('href')
    || el.getAttributeNS?.(XLINK, 'href')
    || el.getAttribute('xlink:href')
    || null;
}

function lengthOf(el, name) {
  const anim = el?.[name]?.baseVal;
  if (anim && typeof anim.value === 'number' && Number.isFinite(anim.value)) return anim.value;
  const v = parseFloat(el?.getAttribute?.(name));
  return Number.isFinite(v) ? v : 0;
}

export function imageGeometry(el) {
  return { x: lengthOf(el, 'x'), y: lengthOf(el, 'y'), width: lengthOf(el, 'width'), height: lengthOf(el, 'height') };
}

/** Does loading this URL need crossOrigin='anonymous' to stay readable? */
export function needsCrossOrigin(href, origin) {
  const m = /^(https?:)\/\/[^/]+/i.exec(String(href || ''));
  if (!m) return false; // data:, blob:, relative
  if (!origin) return true;
  return m[0].toLowerCase() !== String(origin).toLowerCase();
}

// ─── Offscreen image cache ───────────────────────────────────────────────────
const MAX_CACHE = 12;

/**
 * Create a per-href sampler. All DOM factories are injectable for tests.
 * @param {{createImage?:Function, createCanvas?:Function, baseURI?:string, origin?:string}} [deps]
 */
export function createImageSampler(deps = {}) {
  const hasDoc = typeof document !== 'undefined';
  const createImage = deps.createImage || (() => new Image());
  const createCanvas = deps.createCanvas || ((w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  });
  const baseURI = deps.baseURI ?? (hasDoc ? document.baseURI : undefined);
  const origin = deps.origin ?? (typeof location !== 'undefined' ? location.origin : undefined);
  const cache = new Map(); // href → Promise<entry>

  const resolve = (href) => {
    if (!href) return href;
    if (/^(data|blob):/i.test(href) || !baseURI) return href;
    try { return new URL(href, baseURI).href; } catch { return href; }
  };

  const loadImg = (src, cors) => new Promise((ok, fail) => {
    const img = createImage();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error(`Could not load image ${String(src).slice(0, 64)}`));
    img.src = src;
  });

  async function build(href, sizeHint) {
    const cors = needsCrossOrigin(href, origin);
    let img;
    try {
      img = await loadImg(href, cors);
    } catch (err) {
      if (!cors) throw err;
      img = await loadImg(href, false); // no CORS headers: loads, but taints
    }
    const width = img.naturalWidth || img.width || Math.round(sizeHint?.width) || 0;
    const height = img.naturalHeight || img.height || Math.round(sizeHint?.height) || 0;
    if (!(width > 0 && height > 0)) throw new Error('Image has no size');
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    let tainted = false;
    try { ctx.getImageData(0, 0, 1, 1); } catch (err) {
      if (!isTaintError(err)) throw err;
      tainted = true;
    }
    return { href, width, height, canvas, ctx, tainted, dataUrl: null };
  }

  const api = {
    resolve,
    /** Load (once) and cache the offscreen canvas for href. */
    load(href, sizeHint) {
      const key = resolve(href);
      if (!key) return Promise.reject(new Error('Image has no href'));
      if (cache.has(key)) {
        const hit = cache.get(key);
        cache.delete(key); // LRU: re-insert as most recent
        cache.set(key, hit);
        return hit;
      }
      const p = build(key, sizeHint);
      cache.set(key, p);
      p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      return p;
    },
    /** 1px getImageData → [r,g,b,a]; throws a taint error when unreadable. */
    pixel(entry, px, py) {
      if (entry.tainted) throw taintError();
      try {
        const d = entry.ctx.getImageData(px, py, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      } catch (err) {
        if (isTaintError(err)) { entry.tainted = true; throw taintError(); }
        throw err;
      }
    },
    /** PNG data URL of the cached bitmap (used to inline blob:/http images). */
    dataUrl(entry) {
      if (entry.tainted) throw taintError();
      if (!entry.dataUrl) {
        try { entry.dataUrl = entry.canvas.toDataURL('image/png'); } catch (err) {
          if (isTaintError(err)) { entry.tainted = true; throw taintError(); }
          throw err;
        }
      }
      return entry.dataUrl;
    },
    has(href) { return cache.has(resolve(href)); },
    get size() { return cache.size; },
    clear() { cache.clear(); },
  };
  return api;
}

/**
 * Point-sample a placed <image> under the pointer.
 * @returns {Promise<{hex:string|null, rgba:number[], px:number, py:number}|null>}
 *   null when the pointer is outside the rendered bitmap. Rejects with a taint
 *   error for unreadable cross-origin images.
 */
export async function sampleImageElementAt(el, clientX, clientY, sampler) {
  const href = imageHref(el);
  if (!href) return null;
  const geom = imageGeometry(el);
  const entry = await sampler.load(href, geom);
  const ctm = el.getScreenCTM?.();
  const par = parsePreserveAspectRatio(el.getAttribute('preserveAspectRatio'));
  const hit = clientToImagePixel(clientX, clientY, ctm, geom, entry, par);
  if (!hit) return null;
  const rgba = sampler.pixel(entry, hit.px, hit.py);
  return { hex: rgbaToHex(...rgba), rgba, ...hit };
}

// ─── Rendered-pixel sampling (Shift-click) ───────────────────────────────────
const STRIP_SELECTOR = '[data-visteras-overlay], title, desc, script';

/**
 * Re-render #svgcontent for exactly the screen pixel under (clientX, clientY)
 * and read it back. <image> hrefs that are not data: URLs are inlined from the
 * offscreen cache (an SVG drawn as an image may only reference data: URLs).
 * @returns {Promise<{hex:string|null, rgba:number[]}>}
 */
export async function sampleRenderedAt(svgcontent, clientX, clientY, sampler, deps = {}) {
  const createImage = deps.createImage || (() => new Image());
  const createCanvas = deps.createCanvas || ((w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  });
  const Serializer = deps.XMLSerializer || globalThis.XMLSerializer;
  const ctm = svgcontent.getScreenCTM();
  const inv = ctm && invertMatrix(ctm);
  if (!inv) throw new Error('Canvas has no screen transform');
  const p = applyMatrix(inv, clientX, clientY);
  const scale = Math.hypot(inv.a, inv.b) || 1; // user units per screen pixel

  const clone = svgcontent.cloneNode(true);
  clone.querySelectorAll(STRIP_SELECTOR).forEach((n) => n.remove());
  const srcImages = [...svgcontent.querySelectorAll('image')];
  const dstImages = [...clone.querySelectorAll('image')];
  for (let i = 0; i < srcImages.length; i++) {
    const dst = dstImages[i];
    const href = imageHref(srcImages[i]);
    if (!dst || !href || /^data:/i.test(href)) continue;
    const entry = await sampler.load(href, imageGeometry(srcImages[i]));
    const url = sampler.dataUrl(entry); // throws a taint error if unreadable
    dst.setAttribute('href', url);
    dst.removeAttributeNS?.(XLINK, 'href');
  }
  clone.setAttribute('viewBox', `${p.x - scale / 2} ${p.y - scale / 2} ${scale} ${scale}`);
  clone.setAttribute('width', '1');
  clone.setAttribute('height', '1');
  clone.setAttribute('preserveAspectRatio', 'none');
  clone.removeAttribute('x');
  clone.removeAttribute('y');
  clone.removeAttribute('style');
  const xml = new Serializer().serializeToString(clone);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const img = await new Promise((ok, fail) => {
    const im = createImage();
    im.onload = () => ok(im);
    im.onerror = () => fail(new Error('Could not render the artwork'));
    im.src = src;
  });
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 1, 1);
  let d;
  try { d = ctx.getImageData(0, 0, 1, 1).data; } catch (err) {
    if (isTaintError(err)) throw taintError();
    throw err;
  }
  const rgba = [d[0], d[1], d[2], d[3]];
  return { hex: rgbaToHex(...rgba), rgba };
}

// ─── Fallback chain ──────────────────────────────────────────────────────────
export const TAINT_TOAST = 'Eyedropper: this image is from another site and can\u2019t be sampled. Embed it (File \u203a Place) or use Chrome/Edge.';

/**
 * Run a sampler; if it fails because the canvas is tainted, try the
 * alternatives in order: `fallback()` (e.g. the vector paint at the point),
 * then window.EyeDropper (Chromium; must still be inside the user gesture's
 * transient activation), then a toast.
 *
 * @param {() => Promise<{hex:string|null}|null>} primary
 * @param {{fallback?:Function, EyeDropper?:any, toast?:Function, onError?:Function}} [opts]
 * @returns {Promise<{hex:string|null, via:string}|null>}
 */
export async function sampleWithFallback(primary, opts = {}) {
  let failure;
  try {
    const r = await primary();
    return r ? { hex: r.hex ?? null, via: 'canvas' } : null;
  } catch (err) {
    failure = err;
  }
  if (opts.fallback) {
    try {
      const hex = await opts.fallback();
      if (hex) return { hex, via: 'paint' };
    } catch { /* keep going */ }
  }
  if (!isTaintError(failure)) {
    opts.onError?.(failure);
    opts.toast?.('Eyedropper: could not read that image.');
    return null;
  }
  const ED = opts.EyeDropper === undefined
    ? (typeof window !== 'undefined' ? window.EyeDropper : undefined)
    : opts.EyeDropper;
  if (typeof ED === 'function') {
    opts.toast?.('Cross-origin image: click the colour again with the system eyedropper.');
    try {
      const res = await new ED().open();
      const hex = /^#[0-9a-f]{6}$/i.test(res?.sRGBHex || '') ? res.sRGBHex.toLowerCase() : null;
      return hex ? { hex, via: 'eyedropper' } : null;
    } catch {
      return null; // user pressed Esc / activation expired
    }
  }
  opts.toast?.(TAINT_TOAST);
  return null;
}
