/**
 * Envelope renderer: builds `-out` from `-src`. The core (buildOutput) is
 * synchronous and DOM-light (attributes, children, createElementNS) so it is
 * unit-testable; text outlines and image rasters are prepared asynchronously
 * by renderEnvelope() and passed in.
 */
import { ENV, SRC, OUT, readEnvelope, normalizeOpts } from './visteras-envelope-core.js?v=envelope-5';
import {
  shapeToPathData, parsePathData, transformSegments, warpSegments, segmentsToPathData, parseTransform,
  multiply, IDENTITY, applyMatrix, warpedBoxPathData,
} from './visteras-envelope-warp.js?v=envelope-5';
import { buildMesh, meshSize, drawMesh } from './visteras-envelope-raster.js?v=envelope-5';

const NS = 'http://www.w3.org/2000/svg';
export const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['g', 'a', 'switch']);
const PASSIVE = new Set(['defs', 'title', 'desc', 'metadata', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'style', 'symbol', 'marker']);
export const GEOMETRY_ATTRS = new Set(['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'pathLength']);
const attrsOf = (el) => Object.fromEntries([...(el.attributes || [])].map((a) => [a.name, a.value]));
const det = (m) => Math.abs(m[0] * m[3] - m[1] * m[2]);

/** Leaf shape → warped path element (all non-geometry attributes kept). */
function warpShape(orig, clone, m, data, env) {
  const d = shapeToPathData(orig.localName, attrsOf(orig));
  const path = env.doc.createElementNS(NS, 'path');
  for (const [k, v] of Object.entries(attrsOf(clone))) if (!GEOMETRY_ATTRS.has(k)) path.setAttribute(k, v);
  const segs = transformSegments(parsePathData(d || ''), m);
  path.setAttribute('d', segmentsToPathData(warpSegments(segs, data.bbox, data.params, data.opts).segments));
  // Baking a scaled transform into the geometry would thin the stroke; keep its visual width uniform.
  const s = Math.sqrt(det(m));
  if (Math.abs(s - 1) > 1e-6) {
    const sw = parseFloat(env.strokeWidth?.(orig) ?? orig.getAttribute('stroke-width') ?? 1);
    if (Number.isFinite(sw)) path.setAttribute('stroke-width', String(Math.round(sw * s * 1000) / 1000));
  }
  return path;
}

/** Warp a <clipPath>'s shapes into the user space of an element whose transform was baked. */
function warpClip(id, m, data, env, defs) {
  const clip = env.findById?.(id);
  if (!clip || clip.localName !== 'clipPath' || clip.getAttribute('clipPathUnits') === 'objectBoundingBox') return null;
  const copy = env.doc.createElementNS(NS, 'clipPath'), newId = env.nextId();
  copy.setAttribute('id', newId);
  for (const child of [...clip.children]) {
    if (!SHAPES.has(child.localName)) continue;
    copy.appendChild(warpShape(child, child, multiply(m, parseTransform(child.getAttribute('transform'))), data, env));
  }
  defs.appendChild(copy);
  return newId;
}

function textOutputs(orig, clone, m, data, env) {
  const outline = env.outlines?.get(orig);
  if (!outline) {
    // Font unavailable: keep the live text, positioned but unwarped, and flag it.
    clone.setAttribute('transform', `matrix(${m.join(' ')})`);
    clone.setAttribute(`${ENV}-unwarped`, 'font');
    return clone;
  }
  const g = env.doc.createElementNS(NS, 'g');
  for (const [k, v] of Object.entries(attrsOf(outline))) if (k !== 'transform' && k !== 'id' && !k.startsWith('data-visteras-')) g.setAttribute(k, v);
  for (const [k, v] of Object.entries(attrsOf(clone))) if (!GEOMETRY_ATTRS.has(k) && !g.hasAttribute(k) && !/^(font|text-anchor|letter-spacing|xml:space|dominant-baseline)/.test(k)) g.setAttribute(k, v);
  g.setAttribute('id', clone.getAttribute('id') || env.nextId());
  const mt = multiply(m, parseTransform(outline.getAttribute('transform')));
  for (const glyph of [...outline.children]) {
    if (glyph.localName !== 'path') continue;
    const p = warpShape(glyph, glyph, mt, data, env);
    p.removeAttribute('id'); p.removeAttribute('class');
    g.appendChild(p);
  }
  return g;
}

function imageOutput(orig, clone, data, env, defs) {
  const r = env.rasters?.get(orig);
  if (!r) { clone.setAttribute(`${ENV}-unwarped`, 'image'); return clone; }
  const img = env.doc.createElementNS(NS, 'image');
  for (const [k, v] of Object.entries(attrsOf(clone))) if (!GEOMETRY_ATTRS.has(k) && k !== 'href' && k !== 'xlink:href' && k !== 'preserveAspectRatio') img.setAttribute(k, v);
  const [x, y, w, h] = r.bounds;
  img.setAttribute('x', x); img.setAttribute('y', y); img.setAttribute('width', w); img.setAttribute('height', h);
  img.setAttribute('preserveAspectRatio', 'none');
  img.setAttribute('href', r.href);
  if (data.opts.preserve === 'clip' && r.outline) {
    const clip = env.doc.createElementNS(NS, 'clipPath'), id = env.nextId();
    clip.setAttribute('id', id);
    const p = env.doc.createElementNS(NS, 'path'); p.setAttribute('d', r.outline); clip.appendChild(p);
    defs.appendChild(clip);
    img.setAttribute('clip-path', `url(#${id})`);
    img.setAttribute(`${ENV}-preserve`, 'clip');
  } else img.setAttribute(`${ENV}-preserve`, 'alpha');
  return img;
}

/**
 * Build a fresh `-out` group for an envelope. env: {doc, nextId, findById, outlines:Map, rasters:Map, strokeWidth}.
 * The source tree is walked in parallel with an id-remapped clone so paint servers inside the source follow.
 */
export function buildOutput(el, env, cloneFn) {
  const data = readEnvelope(el);
  if (!data?.src) return null;
  const out = cloneFn(data.src);
  out.removeAttribute(SRC); out.removeAttribute('display'); out.setAttribute(OUT, '1');
  const defs = env.doc.createElementNS(NS, 'defs');
  let usedDefs = false;
  const walk = (orig, clone, m) => {
    const origKids = [...orig.children], cloneKids = [...clone.children];
    origKids.forEach((o, i) => {
      const c = cloneKids[i]; if (!c) return;
      const tag = o.localName;
      if (PASSIVE.has(tag)) return;
      const mm = multiply(m, parseTransform(o.getAttribute('transform')));
      let replacement = null;
      if (CONTAINERS.has(tag)) { c.removeAttribute('transform'); walk(o, c, mm); }
      else if (SHAPES.has(tag)) replacement = warpShape(o, c, mm, data, env);
      else if (tag === 'text') replacement = textOutputs(o, c, mm, data, env);
      else if (tag === 'image') { replacement = imageOutput(o, c, data, env, defs); usedDefs = true; }
      else if (tag === 'use') { c.setAttribute('transform', `matrix(${mm.join(' ')})`); c.setAttribute(`${ENV}-unwarped`, 'use'); }
      const target = replacement || c;
      // Clip paths live in the clipped element's user space: warp them with the same matrix.
      const clipRef = /url\(#([^)]+)\)/.exec(o.getAttribute('clip-path') || '');
      if (clipRef) {
        const id = warpClip(clipRef[1], CONTAINERS.has(tag) ? mm : mm, data, env, defs);
        if (id) { target.setAttribute('clip-path', `url(#${id})`); usedDefs = true; }
      }
      if (replacement && replacement !== c) c.replaceWith(replacement);
    });
  };
  walk(data.src, out, [...IDENTITY]);
  if (usedDefs && defs.children.length) out.insertBefore(defs, out.children[0] || null);
  return out;
}

/* ── Async preparation (browser) ──────────────────────────────────── */

const loadImage = (href) => new Promise((resolve) => {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = href;
});

/** Image pixel space → envelope space matrix (x/y/width/height and preserveAspectRatio meet/slice). */
export function imageMatrix(attrs, nw, nh, m) {
  const x = +attrs.x || 0, y = +attrs.y || 0, w = +attrs.width || nw, h = +attrs.height || nh;
  const par = String(attrs.preserveAspectRatio || 'xMidYMid meet').trim();
  let sx = w / nw, sy = h / nh, tx = x, ty = y;
  if (!par.startsWith('none')) {
    const [align, mode] = par.split(/\s+/);
    const s = mode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const ax = /xMid/.test(align) ? 0.5 : /xMax/.test(align) ? 1 : 0, ay = /YMid/.test(align) ? 0.5 : /YMax/.test(align) ? 1 : 0;
    tx = x + (w - nw * s) * ax; ty = y + (h - nh * s) * ay; sx = sy = s;
  }
  return multiply(m, [sx, 0, 0, sy, tx, ty]);
}

/** io: {loadImage(href), createCanvas()} — injectable for tests (AT14). */
export async function rasterize(img, m, data, doc, io = {}) {
  const href = img.getAttribute('href') || img.getAttribute('xlink:href');
  if (!href) return null;
  const image = await (io.loadImage || loadImage)(href);
  if (!image || !image.naturalWidth) return null;
  const nw = image.naturalWidth, nh = image.naturalHeight;
  const mi = imageMatrix(attrsOf(img), nw, nh, m);
  const mesh = buildMesh(nw, nh, mi, data.bbox, data.params, meshSize(data.opts.fidelity));
  const [, , bw, bh] = mesh.bounds;
  // Raster at the source's own pixel density (capped) so the warp doesn't blur or bloat the file.
  const density = Math.min(4, Math.max(0.25, Math.sqrt((nw * nh) / Math.max(1, Math.abs((mi[0] * mi[3] - mi[1] * mi[2])) * nw * nh)) || 1));
  const scale = Math.min(density, 4096 / Math.max(bw, bh, 1));
  const canvas = io.createCanvas ? io.createCanvas() : doc.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(bw * scale)); canvas.height = Math.max(1, Math.ceil(bh * scale));
  drawMesh(canvas.getContext('2d'), image, mesh, scale, { antiAlias: data.opts.aa });
  // Warped outline of the image rectangle (for Preserve Shape: Clipping Mask).
  const corners = [[0, 0], [nw, 0], [nw, nh], [0, nh]].map(([px, py]) => applyMatrix(mi, px, py));
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  const outlineSegs = transformSegments(parsePathData(`M0 0H${nw}V${nh}H0Z`), mi);
  const outline = segmentsToPathData(warpSegments(outlineSegs, data.bbox, data.params, data.opts).segments);
  return { href: canvas.toDataURL('image/png'), bounds: mesh.bounds, outline, rect };
}

function matrixTo(src, node) {
  const chain = [];
  for (let n = node; n && n !== src; n = n.parentNode) chain.unshift(n);
  return chain.reduce((m, n) => multiply(m, parseTransform(n.getAttribute('transform'))), [...IDENTITY]);
}

/** Prepare outlines/rasters and build the output. Returns the new out group (not yet inserted). */
export async function prepareAndBuild(sc, el, cloneFn, deps = {}) {
  const data = readEnvelope(el);
  if (!data?.src) return null;
  const doc = el.ownerDocument;
  const outlines = new Map(), rasters = new Map();
  const texts = [...data.src.querySelectorAll('text')];
  let convert = deps.convertTextToOutlines;
  if (texts.length && !convert && deps.loadTextOutlines) { try { convert = await deps.loadTextOutlines(); } catch { convert = null; } }
  for (const t of texts) {
    try { const g = await convert?.(t, doc); if (g) outlines.set(t, g); } catch { /* keep live text */ }
  }
  for (const img of data.src.querySelectorAll('image')) {
    // Image matrix excludes the image's own transform from matrixTo's parent chain, then adds it.
    const m = matrixTo(data.src, img);
    try { const r = await rasterize(img, m, data, doc, deps); if (r) rasters.set(img, r); } catch { /* keep unwarped */ }
  }
  const svgRoot = sc.getSvgContent?.();
  return buildOutput(el, {
    doc, nextId: () => sc.getNextId(), outlines, rasters,
    findById: (id) => svgRoot?.querySelector?.(`[id="${String(id).replace(/"/g, '')}"]`) || doc.getElementById?.(id),
    strokeWidth: (node) => { try { return getComputedStyle(node).strokeWidth; } catch { return node.getAttribute('stroke-width'); } },
  }, cloneFn);
}

export { warpedBoxPathData, normalizeOpts };
