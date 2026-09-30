/**
 * Visteras Vector — OS clipboard payload (Illustrator-style copy).
 *
 *   single raster <image>   → image/png at the image's natural resolution
 *                              (cropped to a clipPath when there is one)
 *   vector / mixed          → image/png render + SVG as text/plain, and as
 *                              image/svg+xml where ClipboardItem.supports() says so
 *
 * The ClipboardItem is built synchronously inside the user gesture with
 * Promise<Blob> values (Safari's rule); rendering resolves later.
 * Pure helpers are exported for unit tests; DOM rendering lives at the end.
 */

export const PNG = 'image/png';
export const SVG = 'image/svg+xml';
export const TEXT = 'text/plain';

/** 'image' (exactly one raster <image>), 'vector', 'mixed', or 'empty'. */
export function classifySelection(elements) {
  const els = (elements || []).filter(Boolean);
  if (!els.length) return 'empty';
  const isImage = (el) => String(el.nodeName || el.tagName || '').toLowerCase() === 'image';
  const hasImage = (el) => isImage(el) || !!el.querySelector?.('image');
  if (els.length === 1 && isImage(els[0])) return 'image';
  return els.some(hasImage) ? 'mixed' : 'vector';
}

/** MIME types to write, in order of preference. */
export function planClipboardTypes(kind, supports = () => true) {
  if (kind === 'empty') return [];
  if (kind === 'image') return [PNG];
  const types = [PNG, TEXT];
  let svgOk = false;
  try { svgOk = !!supports(SVG); } catch { svgOk = false; }
  if (svgOk) types.push(SVG);
  return types;
}

/** ClipboardItem.supports when available; otherwise PNG/text only (spec-mandatory types). */
export function clipboardSupports(ClipboardItemCtor = (typeof ClipboardItem !== 'undefined' ? ClipboardItem : null)) {
  if (ClipboardItemCtor && typeof ClipboardItemCtor.supports === 'function') {
    return (type) => { try { return ClipboardItemCtor.supports(type); } catch { return false; } };
  }
  return (type) => type === PNG || type === TEXT || type === 'text/html';
}

/**
 * Item data for new ClipboardItem(...): every value is a Promise<Blob>.
 * @param {{kind:string, svgText?:string|null, png:()=>Promise<Blob>, supports?:(t:string)=>boolean, BlobCtor?:any}} o
 */
export function buildClipboardItems({ kind, svgText = null, png, supports = () => true, BlobCtor = Blob }) {
  const types = planClipboardTypes(kind, supports).filter((t) => t === PNG || svgText);
  const items = {};
  for (const t of types) {
    if (t === PNG) items[t] = Promise.resolve().then(png);
    else items[t] = Promise.resolve(new BlobCtor([svgText], { type: t }));
  }
  return { types, items };
}

/** Intersection of two {x,y,width,height} rects, or null when empty. */
export function intersectRect(a, b) {
  if (!a || !b) return a || b || null;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x, h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
}

/**
 * Output size of an image PNG: natural resolution, or the cropped part of it.
 * @param {{naturalWidth:number, naturalHeight:number}} natural
 * @param {{x:number,y:number,width:number,height:number}} box   the image's x/y/width/height
 * @param {null|{x:number,y:number,width:number,height:number}} crop  visible region (user units)
 */
export function imagePngSize(natural, box, crop = null) {
  const nw = Math.max(1, Math.round(natural.naturalWidth || 1)), nh = Math.max(1, Math.round(natural.naturalHeight || 1));
  if (!crop || !box?.width || !box?.height) return { width: nw, height: nh, scale: 1, crop: null };
  // preserveAspectRatio meet: the bitmap fits the box; pixels per user unit.
  const scale = Math.min(box.width / nw, box.height / nh);
  const ppu = 1 / (scale || 1);
  return { width: Math.max(1, Math.round(crop.width * ppu)), height: Math.max(1, Math.round(crop.height * ppu)), scale: ppu, crop };
}

/** ids referenced through url(#id) in an attribute/style string. */
export function collectUrlRefs(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g)) out.add(m[1]);
  return [...out];
}

/** Never take over copy/cut while an input, textarea, select, editable or text selection is active. */
export function isTextCopyContext(e, doc = (typeof document !== 'undefined' ? document : null)) {
  if (typeof window !== 'undefined' && window.__visterasIsTypingDirectly) return true;
  const path = e && typeof e.composedPath === 'function' ? e.composedPath() : (e?.target ? [e.target] : []);
  if (path.some((el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.nodeName)))) return true;
  const active = doc?.activeElement;
  if (active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.nodeName))) return true;
  try { const s = doc?.getSelection?.(); if (s && !s.isCollapsed && String(s).trim()) return true; } catch { /* ignore */ }
  return false;
}

// ─── DOM rendering ───────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';

/** <defs> markup for everything the elements reference (clip paths, masks, gradients…), recursively. */
export function referencedDefsMarkup(elements, doc = document) {
  const seen = new Set(), parts = [], ser = new XMLSerializer();
  const scan = (el) => {
    const nodes = [el, ...(el.querySelectorAll ? el.querySelectorAll('*') : [])];
    for (const n of nodes) {
      const texts = [...(n.attributes || [])].map((a) => a.value).join(' ');
      for (const id of collectUrlRefs(texts)) add(id);
      const href = n.getAttribute?.('href') || n.getAttribute?.('xlink:href');
      if (href && href.startsWith('#') && n.nodeName !== 'image') add(href.slice(1));
    }
  };
  const add = (id) => {
    if (seen.has(id)) return; seen.add(id);
    const ref = doc.getElementById(id);
    if (!ref || elements.some((e) => e === ref || e.contains?.(ref))) return;
    parts.push(ser.serializeToString(ref));
    scan(ref);
  };
  for (const el of elements) scan(el);
  return parts.length ? `<defs>${parts.join('')}</defs>` : '';
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('image load failed'));
  img.src = src;
});
const canvasBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), PNG));

async function svgToPng(svgMarkup, width, height) {
  const url = URL.createObjectURL(new Blob([svgMarkup], { type: SVG }));
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(width)); c.height = Math.max(1, Math.round(height));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await canvasBlob(c);
  } finally { URL.revokeObjectURL(url); }
}

/** Visible region of a clipped image (userSpaceOnUse clip paths), or null. */
function clipRegion(el) {
  const ref = collectUrlRefs(el.getAttribute('clip-path') || el.style?.clipPath || '')[0];
  if (!ref) return null;
  const cp = el.ownerDocument.getElementById(ref);
  if (!cp || (cp.getAttribute('clipPathUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') return null;
  let box = null;
  for (const c of cp.children) {
    try {
      const b = c.getBBox();
      box = box ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), width: Math.max(box.x + box.width, b.x + b.width) - Math.min(box.x, b.x), height: Math.max(box.y + box.height, b.y + b.height) - Math.min(box.y, b.y) } : { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* ignore */ }
  }
  return box;
}

/** PNG of one raster <image> at natural resolution (cropped by its clip path if any). */
export async function renderImagePng(el) {
  const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
  const img = await loadImage(href);
  const box = { x: +el.getAttribute('x') || 0, y: +el.getAttribute('y') || 0, width: +el.getAttribute('width') || img.naturalWidth, height: +el.getAttribute('height') || img.naturalHeight };
  const crop = intersectRect(box, clipRegion(el));
  const size = imagePngSize(img, box, crop && (crop.width < box.width - 1e-6 || crop.height < box.height - 1e-6) ? crop : null);
  if (!size.crop) {
    const c = document.createElement('canvas');
    c.width = size.width; c.height = size.height;
    c.getContext('2d').drawImage(img, 0, 0, size.width, size.height);
    return canvasBlob(c);
  }
  const clone = el.cloneNode(true);
  clone.removeAttribute('transform');
  const { x, y, width, height } = size.crop;
  const markup = `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${x} ${y} ${width} ${height}" width="${size.width}" height="${size.height}">${referencedDefsMarkup([el])}${new XMLSerializer().serializeToString(clone)}</svg>`;
  return svgToPng(markup, size.width, size.height);
}

/** PNG render of an SVG document string (the copied selection) at 1 px per user unit. */
export async function renderSvgTextPng(svgText, scale = 1) {
  const doc = new DOMParser().parseFromString(svgText, SVG);
  const root = doc.documentElement;
  const vb = String(root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const w = (vb[2] || +root.getAttribute('width') || 100) * scale, h = (vb[3] || +root.getAttribute('height') || 100) * scale;
  root.setAttribute('width', String(w)); root.setAttribute('height', String(h));
  return svgToPng(new XMLSerializer().serializeToString(root), w, h);
}
