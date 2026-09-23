/**
 * Visteras Vector — Color System
 *
 * Color + Swatches panels stacked above Properties (Studio parity layout),
 * Appearance fill/stroke wells (left-aligned), stroke alignment
 * (center/inside/outside), and a usable spectrum picker modal.
 * Swatch presets reuse Studio's SWATCH_CATEGORIES (copied to
 * ./visteras-swatches-data.js). Replaces jGraduate as the primary UX while
 * leaving SVG-Edit color pickers in the DOM for internal sync.
 *
 * APIs: svgCanvas.getColor / setColor / getPaintOpacity / setPaintOpacity /
 *       setStrokeWidth / getStrokeWidth
 *       svgEditor.bottomPanel.updateColorpickers
 */

import { SWATCH_CATEGORIES } from './visteras-swatches-data.js';

const STORAGE_SWATCHES = 'visteras-vector-swatches';
const STORAGE_RECENT = 'visteras-vector-recent-colors';
const MAX_RECENT = 10; // Studio parity
const DEFAULT_RECENT = [
  '#000000', '#ffffff', '#e74c3c', '#e67e22', '#f1c40f',
  '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#34495e',
];
const ACCENT = '#fa7c1b';

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeHex(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s || s === 'none' || s === 'transparent') return 'none';
  if (s.startsWith('url(') || s.startsWith('rgb')) return null;
  if (s[0] !== '#') s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h || h === 'none') return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const to = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uid(prefix = 'sw') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadUserSwatches() {
  try {
    const raw = localStorage.getItem(STORAGE_SWATCHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        id: s.id || uid(),
        name: String(s.name || s.hex || 'Swatch'),
        hex: normalizeHex(s.hex),
      }))
      .filter((s) => s.hex && s.hex !== 'none');
  } catch {
    return [];
  }
}

function saveUserSwatches(list) {
  try {
    localStorage.setItem(STORAGE_SWATCHES, JSON.stringify(list));
  } catch { /* ignore */ }
}

function loadRecent() {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeHex).filter((h) => h && h !== 'none').slice(0, MAX_RECENT);
      }
    }
  } catch {
    /* fall through to Studio defaults */
  }
  return [...DEFAULT_RECENT];
}

function saveRecent(list) {
  try {
    localStorage.setItem(STORAGE_RECENT, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

/**
 * Resolve elements that should receive fill/stroke/stroke-width.
 * Direct Selection clears SVG-Edit's selection, so fall back to DS paint targets
 * (and native path-edit elem) — same strategy for color and stroke weight.
 */
function resolvePaintTargets(sc) {
  if (!sc) return [];
  const selected = (typeof sc.getSelectedElements === 'function'
    ? sc.getSelectedElements()
    : [])?.filter(Boolean) || [];
  if (selected.length) return selected;
  const ds = sc.directSelection;
  if (ds?.active) {
    const els = (typeof ds.getPaintTargets === 'function'
      ? ds.getPaintTargets()
      : typeof ds.getSelectedElements === 'function'
        ? ds.getSelectedElements()
        : []) || [];
    if (els.length) return els;
  }
  const path = sc.getPathObj?.();
  if (path?.elem?.isConnected) return [path.elem];
  return [];
}

function flattenPaintTargets(elements, { attr = null } = {}) {
  const out = [];
  const skipFill = attr === 'fill';
  for (const el of elements) {
    if (!el) continue;
    if (el.getAttribute?.('data-visteras-stroke-align-helper')) continue;
    if (el.tagName === 'g') {
      for (const child of el.querySelectorAll('*')) {
        if (child.nodeName === 'g') continue;
        if (skipFill && (child.tagName === 'polyline' || child.tagName === 'line')) continue;
        out.push(child);
      }
    } else if (skipFill && (el.tagName === 'polyline' || el.tagName === 'line')) {
      continue;
    } else {
      out.push(el);
    }
  }
  return out;
}

/**
 * Apply fill/stroke/stroke-width/opacity to resolved targets.
 *
 * CRITICAL: Do NOT use svgCanvas.changeSelectedAttribute while mode is
 * "pathedit". SVG-Edit always calls pathActions.moveNode(attr, value) first;
 * Direct Selection keeps mode=pathedit but clears the native path object
 * (K=null), so moveNode throws (K.selected_pts) and aborts paint — and any
 * modal close() after setWorkingColor never runs. Stroke-width appeared to
 * "work" in some flows via curProperties fallbacks; fill/stroke did not.
 * Write attributes (and history) ourselves instead.
 */
function applyPaintAttribute(sc, attr, value, { noUndo = false } = {}) {
  if (!sc) return false;
  const elems = flattenPaintTargets(resolvePaintTargets(sc), { attr });
  if (!elems.length) return false;

  const next = (value == null || value === '') ? null : String(value);
  const inPathEdit = sc.getCurrentMode?.() === 'pathedit' || !!sc.directSelection?.active;
  const canUseStock = !inPathEdit
    && typeof sc.changeSelectedAttribute === 'function'
    && (noUndo ? typeof sc.changeSelectedAttributeNoUndo === 'function' : true);

  if (canUseStock) {
    if (noUndo) sc.changeSelectedAttributeNoUndo(attr, next, elems);
    else {
      sc.changeSelectedAttribute(attr, next, elems);
      sc.call?.('changed', elems);
    }
    if (attr === 'stroke' || attr === 'stroke-width' || attr === 'd' || attr === 'points') {
      for (const el of elems) {
        try { syncStrokeAlignRendering(el, sc); } catch { /* ignore */ }
      }
    }
    return true;
  }

  // Direct DOM write for Direct Selection / pathedit.
  const { ChangeElementCommand, BatchCommand } = sc.history || {};
  const batch = (!noUndo && BatchCommand && ChangeElementCommand)
    ? new BatchCommand(`Change ${attr}`)
    : null;
  const changed = [];

  for (const el of elems) {
    if (!el?.isConnected) continue;
    const prev = el.getAttribute(attr);
    const prevNorm = prev == null ? null : String(prev);
    if (prevNorm === next) continue;
    if (batch) batch.addSubCommand(new ChangeElementCommand(el, { [attr]: prev }));
    if (next == null) el.removeAttribute(attr);
    else el.setAttribute(attr, next);
    changed.push(el);
  }

  if (batch && changed.length) {
    try {
      if (typeof batch.isEmpty === 'function') {
        if (!batch.isEmpty()) sc.addCommandToHistory?.(batch);
      } else {
        sc.addCommandToHistory?.(batch);
      }
    } catch { /* ignore history failures */ }
  }
  if (changed.length) sc.call?.('changed', changed);
  // Keep inside/outside stroke alignment in sync when stroke paint or width changes.
  if (changed.length && (attr === 'stroke' || attr === 'stroke-width' || attr === 'd' || attr === 'points')) {
    for (const el of changed) {
      try { syncStrokeAlignRendering(el, sc); } catch { /* ignore */ }
    }
  }
  return changed.length > 0;
}

// ---------------------------------------------------------------------------
// Stroke alignment (Center / Inside / Outside)
// SVG has no native Illustrator-style stroke alignment. We approximate:
//   center  — default SVG stroke (centered on path)
//   inside  — 2× stroke-width + clipPath to the path geometry (closed shapes)
//   outside — 2× stroke on a non-selectable helper path + mask punching the
//             interior so the main element keeps its fill
// Open paths, lines, polylines, text, images: fall back to center rendering
// (attribute is still stored; UI may show the choice).
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const STROKE_ALIGN_ATTR = 'data-visteras-stroke-align';
const STROKE_WEIGHT_ATTR = 'data-visteras-stroke-weight';
const STROKE_CLIP_ATTR = 'data-visteras-sa-clip';
const STROKE_MASK_ATTR = 'data-visteras-sa-mask';
const STROKE_HELPER_ATTR = 'data-visteras-stroke-align-helper';
const STROKE_HELPER_FOR_ATTR = 'data-visteras-helper-for';
const STROKE_PAINT_ATTR = 'data-visteras-stroke-paint';

const STROKE_ALIGN_GEOM_ATTRS = {
  path: ['d', 'transform'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'transform'],
  circle: ['cx', 'cy', 'r', 'transform'],
  ellipse: ['cx', 'cy', 'rx', 'ry', 'transform'],
  polygon: ['points', 'transform'],
  polyline: ['points', 'transform'],
};

function getSvgContent(sc) {
  return (typeof sc?.getContentElem === 'function' && sc.getContentElem())
    || document.getElementById('svgcontent')
    || null;
}

function getSvgDefs(sc) {
  if (typeof sc?.findDefs === 'function') {
    try {
      const d = sc.findDefs();
      if (d) return d;
    } catch { /* fall through */ }
  }
  const root = getSvgContent(sc);
  if (!root) return null;
  let defs = root.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    root.insertBefore(defs, root.firstChild);
  }
  return defs;
}

function nextSvgId(sc, prefix) {
  if (typeof sc?.getNextId === 'function') {
    try { return sc.getNextId(); } catch { /* fall through */ }
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureElementId(el, sc) {
  if (el.id) return el.id;
  const id = nextSvgId(sc, 'svg_');
  el.setAttribute('id', id);
  return id;
}

function isStrokeAlignHelper(el) {
  return !!el?.getAttribute?.(STROKE_HELPER_ATTR);
}

function isClosedStrokeTarget(el) {
  if (!el || isStrokeAlignHelper(el)) return false;
  const tag = el.tagName?.toLowerCase?.() || '';
  if (tag === 'rect' || tag === 'circle' || tag === 'ellipse' || tag === 'polygon') return true;
  if (tag === 'path') {
    const d = (el.getAttribute('d') || '').trim();
    // Any closepath command — open subpaths still get best-effort clip.
    return /[zZ]/.test(d);
  }
  return false;
}

function cloneStrokeGeometry(el) {
  const tag = el.tagName.toLowerCase();
  const clone = document.createElementNS(el.namespaceURI || SVG_NS, tag);
  for (const a of (STROKE_ALIGN_GEOM_ATTRS[tag] || [])) {
    const v = el.getAttribute(a);
    if (v != null) clone.setAttribute(a, v);
  }
  return clone;
}

function findStrokeAlignHelper(el) {
  if (!el?.id) return null;
  const parent = el.parentNode;
  if (!parent) return null;
  for (const child of parent.children) {
    if (child.getAttribute?.(STROKE_HELPER_FOR_ATTR) === el.id) return child;
  }
  return null;
}

function removeStrokeAlignHelper(el) {
  const helper = findStrokeAlignHelper(el);
  if (helper?.parentNode) helper.parentNode.removeChild(helper);
}

function removeDefsResource(sc, attrName, el) {
  const id = el.getAttribute(attrName);
  if (!id) return;
  const defs = getSvgDefs(sc);
  const node = defs?.getElementById?.(id) || document.getElementById(id);
  if (node?.parentNode) node.parentNode.removeChild(node);
  el.removeAttribute(attrName);
}

function clearStrokeAlignRendering(el, sc) {
  if (!el) return;
  removeStrokeAlignHelper(el);
  // Clear clip/mask presentation attrs we own
  const clipId = el.getAttribute(STROKE_CLIP_ATTR);
  if (clipId) {
    el.removeAttribute('clip-path');
    removeDefsResource(sc, STROKE_CLIP_ATTR, el);
  } else if ((el.getAttribute('clip-path') || '').includes('visteras-sa-clip')) {
    el.removeAttribute('clip-path');
  }
  const maskId = el.getAttribute(STROKE_MASK_ATTR);
  if (maskId) {
    el.removeAttribute('mask');
    removeDefsResource(sc, STROKE_MASK_ATTR, el);
  }
  // Restore user stroke-width if we had doubled it
  const userW = el.getAttribute(STROKE_WEIGHT_ATTR);
  if (userW != null && userW !== '') {
    el.setAttribute('stroke-width', userW);
  }
  // Restore stroke paint if outside mode hid it on the main element
  const paint = el.getAttribute(STROKE_PAINT_ATTR);
  if (paint != null) {
    if (paint === '') el.removeAttribute('stroke');
    else el.setAttribute('stroke', paint);
    el.removeAttribute(STROKE_PAINT_ATTR);
  }
}

function ensureClipForInside(el, sc) {
  const defs = getSvgDefs(sc);
  if (!defs) return null;
  let clipId = el.getAttribute(STROKE_CLIP_ATTR);
  let clip = clipId ? (defs.getElementById?.(clipId) || document.getElementById(clipId)) : null;
  if (!clip) {
    clipId = nextSvgId(sc, 'visteras-sa-clip');
    clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    defs.appendChild(clip);
    el.setAttribute(STROKE_CLIP_ATTR, clipId);
  }
  while (clip.firstChild) clip.removeChild(clip.firstChild);
  clip.appendChild(cloneStrokeGeometry(el));
  el.setAttribute('clip-path', `url(#${clipId})`);
  return clipId;
}

function ensureMaskForOutsideHelper(helper, shapeEl, sc, pad) {
  const defs = getSvgDefs(sc);
  if (!defs) return null;
  let maskId = helper.getAttribute(STROKE_MASK_ATTR);
  let mask = maskId ? (defs.getElementById?.(maskId) || document.getElementById(maskId)) : null;
  if (!mask) {
    maskId = nextSvgId(sc, 'visteras-sa-mask');
    mask = document.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    defs.appendChild(mask);
    helper.setAttribute(STROKE_MASK_ATTR, maskId);
  }
  while (mask.firstChild) mask.removeChild(mask.firstChild);

  let bbox = null;
  try { bbox = shapeEl.getBBox(); } catch { bbox = null; }
  const p = Math.max(2, Number(pad) || 2);
  if (bbox && Number.isFinite(bbox.width) && Number.isFinite(bbox.height)) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(bbox.x - p));
    bg.setAttribute('y', String(bbox.y - p));
    bg.setAttribute('width', String(Math.max(1, bbox.width + p * 2)));
    bg.setAttribute('height', String(Math.max(1, bbox.height + p * 2)));
    bg.setAttribute('fill', '#ffffff');
    mask.appendChild(bg);
  } else {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '-50000');
    bg.setAttribute('y', '-50000');
    bg.setAttribute('width', '100000');
    bg.setAttribute('height', '100000');
    bg.setAttribute('fill', '#ffffff');
    mask.appendChild(bg);
  }
  const hole = cloneStrokeGeometry(shapeEl);
  hole.setAttribute('fill', '#000000');
  hole.setAttribute('stroke', 'none');
  mask.appendChild(hole);
  helper.setAttribute('mask', `url(#${maskId})`);
  return maskId;
}

function upsertOutsideHelper(el, sc, userWidth, strokePaint) {
  const id = ensureElementId(el, sc);
  let helper = findStrokeAlignHelper(el);
  const tag = el.tagName.toLowerCase();
  if (!helper) {
    helper = document.createElementNS(el.namespaceURI || SVG_NS, tag);
    helper.setAttribute(STROKE_HELPER_ATTR, '1');
    helper.setAttribute(STROKE_HELPER_FOR_ATTR, id);
    helper.setAttribute('pointer-events', 'none');
    helper.classList.add('visteras-stroke-align-helper');
    el.parentNode?.insertBefore(helper, el);
  }
  // Refresh geometry
  for (const a of (STROKE_ALIGN_GEOM_ATTRS[tag] || [])) {
    const v = el.getAttribute(a);
    if (v == null) helper.removeAttribute(a);
    else helper.setAttribute(a, v);
  }
  helper.setAttribute('fill', 'none');
  helper.setAttribute('stroke', strokePaint && strokePaint !== 'none' ? strokePaint : '#000000');
  helper.setAttribute('stroke-width', String(Math.max(0, userWidth) * 2));
  // Copy common stroke presentation
  for (const a of ['stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-opacity', 'opacity']) {
    const v = el.getAttribute(a);
    if (v == null) helper.removeAttribute(a);
    else helper.setAttribute(a, v);
  }
  ensureMaskForOutsideHelper(helper, el, sc, userWidth * 2 + 4);
  return helper;
}

/**
 * Apply or refresh stroke-align rendering for one element.
 * @param {Element} el
 * @param {object} sc svgCanvas
 * @param {{ align?: string, userWidth?: number }} [opts]
 */
function applyStrokeAlignToElement(el, sc, opts = {}) {
  if (!el || isStrokeAlignHelper(el)) return { applied: 'center', closed: false };

  const alignRaw = (opts.align ?? el.getAttribute(STROKE_ALIGN_ATTR) ?? 'center').toLowerCase();
  const align = (alignRaw === 'inside' || alignRaw === 'outside') ? alignRaw : 'center';
  const closed = isClosedStrokeTarget(el);

  // Resolve user-facing weight (never treat a doubled inside width as the user value).
  let userWidth = opts.userWidth;
  if (userWidth == null || Number.isNaN(Number(userWidth))) {
    userWidth = readElementStrokeWeight(el);
    if (userWidth == null) userWidth = 1;
  }
  userWidth = Math.max(0, Number(userWidth) || 0);

  // Always persist the requested align (even if we fall back visually).
  el.setAttribute(STROKE_ALIGN_ATTR, align);

  // Open / unsupported → center rendering, keep attribute for UI.
  if (!closed || align === 'center' || userWidth <= 0) {
    clearStrokeAlignRendering(el, sc);
    if (align === 'center') {
      el.setAttribute(STROKE_WEIGHT_ATTR, String(userWidth));
      el.setAttribute('stroke-width', String(userWidth));
    } else {
      // Requested inside/outside but unsupported: still store intent + center paint.
      el.setAttribute(STROKE_WEIGHT_ATTR, String(userWidth));
      el.setAttribute('stroke-width', String(userWidth));
    }
    return { applied: 'center', closed, requested: align };
  }

  if (align === 'inside') {
    removeStrokeAlignHelper(el);
    // Restore any paint hidden by a prior outside mode
    const paint = el.getAttribute(STROKE_PAINT_ATTR);
    if (paint != null) {
      if (paint === '') el.removeAttribute('stroke');
      else el.setAttribute('stroke', paint);
      el.removeAttribute(STROKE_PAINT_ATTR);
    }
    el.setAttribute(STROKE_WEIGHT_ATTR, String(userWidth));
    el.setAttribute('stroke-width', String(userWidth * 2));
    ensureClipForInside(el, sc);
    return { applied: 'inside', closed, requested: align };
  }

  // outside
  const currentStroke = el.getAttribute('stroke');
  // If paint just landed on the element (not yet hidden), capture it; otherwise
  // keep the stored outside paint used by the helper ring.
  let paint;
  if (currentStroke != null && currentStroke !== 'none') {
    paint = currentStroke;
    el.setAttribute(STROKE_PAINT_ATTR, currentStroke);
  } else {
    paint = el.getAttribute(STROKE_PAINT_ATTR) || '#000000';
    if (!el.hasAttribute(STROKE_PAINT_ATTR)) el.setAttribute(STROKE_PAINT_ATTR, paint);
  }
  // Hide stroke on main element so fill stays; helper draws the outside ring.
  el.setAttribute('stroke', 'none');
  el.setAttribute(STROKE_WEIGHT_ATTR, String(userWidth));
  // Keep stroke-width as user width for SVG-Edit inspectors / new ops.
  el.setAttribute('stroke-width', String(userWidth));
  // Drop inside clip if any
  if (el.getAttribute(STROKE_CLIP_ATTR) || el.getAttribute('clip-path')) {
    el.removeAttribute('clip-path');
    removeDefsResource(sc, STROKE_CLIP_ATTR, el);
  }
  upsertOutsideHelper(el, sc, userWidth, el.getAttribute(STROKE_PAINT_ATTR) || paint);
  return { applied: 'outside', closed, requested: align };
}

function syncStrokeAlignRendering(el, sc) {
  if (!el || isStrokeAlignHelper(el)) return;
  const align = (el.getAttribute(STROKE_ALIGN_ATTR) || 'center').toLowerCase();
  if (align === 'center' || !el.hasAttribute(STROKE_ALIGN_ATTR)) {
    // Still refresh helper cleanup if a stale helper exists
    if (findStrokeAlignHelper(el)) clearStrokeAlignRendering(el, sc);
    return;
  }
  applyStrokeAlignToElement(el, sc, { align });
}

function readElementStrokeAlign(el) {
  if (!el) return 'center';
  const a = (el.getAttribute(STROKE_ALIGN_ATTR) || 'center').toLowerCase();
  return (a === 'inside' || a === 'outside') ? a : 'center';
}

function readElementStrokeWeight(el) {
  if (!el) return null;
  const stored = el.getAttribute(STROKE_WEIGHT_ATTR);
  if (stored != null && stored !== '') {
    const n = Number(stored);
    if (!Number.isNaN(n)) return n;
  }
  const w = el.getAttribute('stroke-width');
  if (w != null && w !== '') {
    const n = Number(w);
    if (!Number.isNaN(n)) {
      // If inside align with doubled width and no stored weight, half it.
      if ((el.getAttribute(STROKE_ALIGN_ATTR) || '') === 'inside' && !el.hasAttribute(STROKE_WEIGHT_ATTR)) {
        return n / 2;
      }
      return n;
    }
  }
  return null;
}

function applyStrokeAlignToTargets(sc, align, { noUndo = false, userWidth = null } = {}) {
  if (!sc) return false;
  const elems = flattenPaintTargets(resolvePaintTargets(sc))
    .filter((el) => el && !isStrokeAlignHelper(el));
  if (!elems.length) {
    // Still store as current preference on canvas if possible
    try { sc.curShape && (sc.curShape._visterasStrokeAlign = align); } catch { /* ignore */ }
    return false;
  }

  const { ChangeElementCommand, BatchCommand } = sc.history || {};
  const batch = (!noUndo && BatchCommand && ChangeElementCommand)
    ? new BatchCommand(`Stroke align ${align}`)
    : null;

  for (const el of elems) {
    const before = {
      [STROKE_ALIGN_ATTR]: el.getAttribute(STROKE_ALIGN_ATTR),
      [STROKE_WEIGHT_ATTR]: el.getAttribute(STROKE_WEIGHT_ATTR),
      [STROKE_PAINT_ATTR]: el.getAttribute(STROKE_PAINT_ATTR),
      'stroke-width': el.getAttribute('stroke-width'),
      stroke: el.getAttribute('stroke'),
      'clip-path': el.getAttribute('clip-path'),
      mask: el.getAttribute('mask'),
    };
    const w = userWidth != null ? userWidth : (readElementStrokeWeight(el) ?? 1);
    applyStrokeAlignToElement(el, sc, { align, userWidth: w });
    if (batch) {
      batch.addSubCommand(new ChangeElementCommand(el, before));
    }
  }
  if (batch) {
    try {
      if (typeof batch.isEmpty === 'function') {
        if (!batch.isEmpty()) sc.addCommandToHistory?.(batch);
      } else {
        sc.addCommandToHistory?.(batch);
      }
    } catch { /* ignore */ }
  }
  sc.call?.('changed', elems);
  return true;
}

// ---------------------------------------------------------------------------
// Shared color controller
// ---------------------------------------------------------------------------

function createColorController(svgEditor) {
  const state = {
    activeTarget: 'fill', // 'fill' | 'stroke'
    workingHex: '#cccccc',
    workingNone: false,
    opacity: 1,
    userSwatches: loadUserSwatches(),
    recent: loadRecent(),
    listeners: new Set(),
    suppressSync: false,
  };

  const api = {
    getState: () => state,
    getActiveTarget: () => state.activeTarget,
    getWorkingHex: () => (state.workingNone ? 'none' : state.workingHex),

    subscribe(fn) {
      state.listeners.add(fn);
      return () => state.listeners.delete(fn);
    },

    emit() {
      window.__visterasColorTarget = state.activeTarget;
      for (const fn of state.listeners) {
        try { fn(state); } catch { /* ignore */ }
      }
      window.dispatchEvent(new CustomEvent('visteras:color-changed', {
        detail: {
          target: state.activeTarget,
          color: state.workingNone ? 'none' : state.workingHex,
          opacity: state.opacity,
        },
      }));
    },

    setActiveTarget(target, { syncColor = true } = {}) {
      if (target !== 'fill' && target !== 'stroke') return;
      state.activeTarget = target;
      window.__visterasColorTarget = target;
      if (syncColor) api.syncFromCanvas();
      else api.emit();
    },

    toggleTarget() {
      api.setActiveTarget(state.activeTarget === 'fill' ? 'stroke' : 'fill');
    },

    setWorkingColor(hexOrNone, { apply = true, recordRecent = true, noUndo = false } = {}) {
      const sc = svgEditor.svgCanvas;
      const paint = (val) => {
        if (!sc) return;
        state.suppressSync = true;
        try {
          // Update SVG-Edit "current style" only — avoid stock setColor's
          // changeSelectedAttribute under pathedit (throws when path K is null).
          if (typeof sc.setCurShape === 'function') sc.setCurShape(state.activeTarget, val);
          if (typeof sc.setCurProperties === 'function') {
            sc.setCurProperties(`${state.activeTarget}_paint`, { type: 'solidColor' });
          }
          if (sc.curProperties) sc.curProperties[state.activeTarget] = val;
          if (sc.curShape) sc.curShape[state.activeTarget] = val;
          // Paint Selection + Direct Selection targets via safe DOM write.
          applyPaintAttribute(sc, state.activeTarget, val, { noUndo });
          if (!noUndo) {
            try { svgEditor.bottomPanel?.updateColorpickers?.(true); } catch { /* ignore */ }
          }
        } finally {
          state.suppressSync = false;
        }
      };
      if (!hexOrNone || hexOrNone === 'none' || hexOrNone === 'transparent') {
        state.workingNone = true;
        if (apply) paint('none');
        api.emit();
        window.__visterasUpdateSwatches?.();
        return;
      }
      const hex = normalizeHex(hexOrNone);
      if (!hex) return;
      state.workingNone = false;
      state.workingHex = hex;
      if (apply) paint(hex);
      if (recordRecent && apply && !noUndo) api.pushRecent(hex);
      api.emit();
      window.__visterasUpdateSwatches?.();
    },

    setOpacity(value, { apply = true, noUndo = false } = {}) {
      const sc = svgEditor.svgCanvas;
      const op = clamp(Number(value), 0, 1);
      state.opacity = op;
      if (apply && sc && typeof sc.setPaintOpacity === 'function') {
        state.suppressSync = true;
        sc.setPaintOpacity(state.activeTarget, op, noUndo);
        state.suppressSync = false;
      }
      api.emit();
    },

    syncFromCanvas() {
      if (state.suppressSync) return;
      const sc = svgEditor.svgCanvas;
      if (!sc) return;
      const raw = (typeof sc.getColor === 'function')
        ? sc.getColor(state.activeTarget)
        : null;
      if (!raw || raw === 'none' || raw === 'transparent') {
        state.workingNone = true;
      } else {
        const hex = normalizeHex(raw);
        if (hex) {
          state.workingNone = false;
          state.workingHex = hex;
        } else {
          // gradients / paints — keep previous solid working color
          state.workingNone = false;
        }
      }
      if (typeof sc.getPaintOpacity === 'function') {
        const op = sc.getPaintOpacity(state.activeTarget);
        if (typeof op === 'number' && !Number.isNaN(op)) state.opacity = op;
      }
      api.emit();
    },

    pushRecent(hex) {
      const n = normalizeHex(hex);
      if (!n || n === 'none') return;
      state.recent = [n, ...state.recent.filter((c) => c !== n)].slice(0, MAX_RECENT);
      saveRecent(state.recent);
    },

    clearRecent() {
      state.recent = [];
      saveRecent(state.recent);
      api.emit();
    },

    addUserSwatch(hex, name) {
      const n = normalizeHex(hex);
      if (!n || n === 'none') return null;
      const sw = { id: uid(), name: name || n.toUpperCase(), hex: n };
      state.userSwatches = [...state.userSwatches, sw];
      saveUserSwatches(state.userSwatches);
      api.emit();
      return sw;
    },

    renameUserSwatch(id, name) {
      const sw = state.userSwatches.find((s) => s.id === id);
      if (!sw) return;
      sw.name = String(name || sw.hex).trim() || sw.hex;
      saveUserSwatches(state.userSwatches);
      api.emit();
    },

    deleteUserSwatch(id) {
      state.userSwatches = state.userSwatches.filter((s) => s.id !== id);
      saveUserSwatches(state.userSwatches);
      api.emit();
    },

    swapFillStroke() {
      const sc = svgEditor.svgCanvas;
      if (!sc) return;
      const curFill = sc.getColor('fill') || '#cccccc';
      const curStroke = sc.getColor('stroke') || '#000000';
      state.suppressSync = true;
      sc.setColor('fill', curStroke);
      sc.setColor('stroke', curFill);
      applyPaintAttribute(sc, 'fill', curStroke);
      applyPaintAttribute(sc, 'stroke', curFill);
      svgEditor.bottomPanel?.updateColorpickers?.(true);
      applyPaintAttribute(sc, 'fill', curStroke, { noUndo: true });
      applyPaintAttribute(sc, 'stroke', curFill, { noUndo: true });
      state.suppressSync = false;
      api.syncFromCanvas();
      window.__visterasUpdateSwatches?.();
    },

    applyDefaults() {
      const sc = svgEditor.svgCanvas;
      if (!sc) return;
      state.suppressSync = true;
      sc.setColor('fill', '#cccccc');
      sc.setColor('stroke', '#000000');
      applyPaintAttribute(sc, 'fill', '#cccccc');
      applyPaintAttribute(sc, 'stroke', '#000000');
      if (typeof sc.setStrokeWidth === 'function') sc.setStrokeWidth(1);
      applyPaintAttribute(sc, 'stroke-width', 1);
      const strokeWidthInput = document.getElementById('stroke_width');
      if (strokeWidthInput) strokeWidthInput.value = '1';
      svgEditor.bottomPanel?.updateColorpickers?.(true);
      applyPaintAttribute(sc, 'fill', '#cccccc', { noUndo: true });
      applyPaintAttribute(sc, 'stroke', '#000000', { noUndo: true });
      state.suppressSync = false;
      api.setActiveTarget('fill', { syncColor: true });
      window.__visterasUpdateSwatches?.();
    },

    openPicker(target) {
      if (target) api.setActiveTarget(target, { syncColor: true });
      window.__visterasOpenColorPicker?.(state.activeTarget);
    },
  };

  window.__visterasColorTarget = state.activeTarget;
  window.__visterasColorSystem = api;
  return api;
}

// ---------------------------------------------------------------------------
// Spectrum widget (SV square + hue strip)
// ---------------------------------------------------------------------------

function createSpectrumWidget({ size = 160, hueHeight = 14, onChange, onCommit } = {}) {
  const root = document.createElement('div');
  root.className = 'vcs-spectrum';

  const svWrap = document.createElement('div');
  svWrap.className = 'vcs-sv-wrap';
  const svCanvas = document.createElement('canvas');
  svCanvas.className = 'vcs-sv-canvas';
  svCanvas.width = size;
  svCanvas.height = size;
  const svCursor = document.createElement('div');
  svCursor.className = 'vcs-sv-cursor';
  svWrap.append(svCanvas, svCursor);

  const hueWrap = document.createElement('div');
  hueWrap.className = 'vcs-hue-wrap';
  const hueCanvas = document.createElement('canvas');
  hueCanvas.className = 'vcs-hue-canvas';
  hueCanvas.width = size;
  hueCanvas.height = hueHeight;
  const hueCursor = document.createElement('div');
  hueCursor.className = 'vcs-hue-cursor';
  hueWrap.append(hueCanvas, hueCursor);

  root.append(svWrap, hueWrap);

  let h = 30;
  let s = 80;
  let l = 55;
  let dragging = null; // 'sv' | 'hue' | null

  function drawHue() {
    const ctx = hueCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    for (let i = 0; i <= 6; i++) {
      const rgb = hslToRgb(i * 60, 100, 50);
      grad.addColorStop(i / 6, `rgb(${rgb.r},${rgb.g},${rgb.b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, hueHeight);
  }

  function drawSV() {
    const ctx = svCanvas.getContext('2d');
    const hueRgb = hslToRgb(h, 100, 50);
    const gradX = ctx.createLinearGradient(0, 0, size, 0);
    gradX.addColorStop(0, '#ffffff');
    gradX.addColorStop(1, `rgb(${hueRgb.r},${hueRgb.g},${hueRgb.b})`);
    ctx.fillStyle = gradX;
    ctx.fillRect(0, 0, size, size);
    const gradY = ctx.createLinearGradient(0, 0, 0, size);
    gradY.addColorStop(0, 'rgba(0,0,0,0)');
    gradY.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradY;
    ctx.fillRect(0, 0, size, size);
  }

  function svToHsl(sat, val) {
    const sHsv = sat / 100;
    const v = val / 100;
    const lHsl = v * (1 - sHsv / 2);
    let sHsl = 0;
    if (lHsl > 0 && lHsl < 1) {
      sHsl = (v - lHsl) / Math.min(lHsl, 1 - lHsl);
    }
    return { h, s: sHsl * 100, l: lHsl * 100 };
  }

  function hslToSv(hh, ss, ll) {
    const sHsl = ss / 100;
    const lHsl = ll / 100;
    const v = lHsl + sHsl * Math.min(lHsl, 1 - lHsl);
    const sHsv = v === 0 ? 0 : 2 * (1 - lHsl / v);
    return { s: clamp(sHsv * 100, 0, 100), v: clamp(v * 100, 0, 100) };
  }

  function updateCursors() {
    // Percentages so cursors track the CSS-scaled canvases (not raw canvas px).
    const sv = hslToSv(h, s, l);
    svCursor.style.left = `${sv.s}%`;
    svCursor.style.top = `${100 - sv.v}%`;
    hueCursor.style.left = `${(h / 360) * 100}%`;
  }

  function emit(commit) {
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    onChange?.({ hex, rgb, hsl: { h, s, l } });
    if (commit) onCommit?.({ hex, rgb, hsl: { h, s, l } });
  }

  function setFromHex(hex, { force = false } = {}) {
    // Never clobber in-progress drag (hex→HSL can lose hue on greys / round-trip).
    if (dragging && !force) return;
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    h = hsl.h; s = hsl.s; l = hsl.l;
    drawSV();
    updateCursors();
  }

  function pointerSV(clientX, clientY, commit) {
    const rect = svWrap.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    const y = clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
    const hsl = svToHsl(x * 100, (1 - y) * 100);
    s = hsl.s; l = hsl.l;
    updateCursors();
    emit(commit);
  }

  function pointerHue(clientX, commit) {
    const rect = hueWrap.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    h = x * 360;
    drawSV();
    updateCursors();
    emit(commit);
  }

  function onPointerDown(e, kind) {
    e.preventDefault();
    e.stopPropagation();
    dragging = kind;
    const pt = e.touches ? e.touches[0] : e;
    if (kind === 'sv') pointerSV(pt.clientX, pt.clientY, false);
    else pointerHue(pt.clientX, false);
    try {
      (kind === 'sv' ? svWrap : hueWrap).setPointerCapture?.(e.pointerId);
    } catch { /* ignore */ }
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    if (dragging === 'sv') pointerSV(pt.clientX, pt.clientY, false);
    else pointerHue(pt.clientX, false);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = null;
    emit(true);
    try {
      (e?.currentTarget)?.releasePointerCapture?.(e.pointerId);
    } catch { /* ignore */ }
  }

  // Prefer Pointer Events (tracks across the wrap, not just the canvas bitmap).
  const usePointer = typeof window.PointerEvent === 'function';
  if (usePointer) {
    svWrap.addEventListener('pointerdown', (e) => onPointerDown(e, 'sv'));
    hueWrap.addEventListener('pointerdown', (e) => onPointerDown(e, 'hue'));
    svWrap.addEventListener('pointermove', onPointerMove);
    hueWrap.addEventListener('pointermove', onPointerMove);
    svWrap.addEventListener('pointerup', onPointerUp);
    hueWrap.addEventListener('pointerup', onPointerUp);
    svWrap.addEventListener('pointercancel', onPointerUp);
    hueWrap.addEventListener('pointercancel', onPointerUp);
  } else {
    svWrap.addEventListener('mousedown', (e) => onPointerDown(e, 'sv'));
    hueWrap.addEventListener('mousedown', (e) => onPointerDown(e, 'hue'));
    svWrap.addEventListener('touchstart', (e) => onPointerDown(e, 'sv'), { passive: false });
    hueWrap.addEventListener('touchstart', (e) => onPointerDown(e, 'hue'), { passive: false });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);
  }

  drawHue();
  drawSV();
  updateCursors();

  return {
    el: root,
    setFromHex,
    getHsl: () => ({ h, s, l }),
    isDragging: () => !!dragging,
    destroy() {
      if (!usePointer) {
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchend', onPointerUp);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Toolbar fill/stroke swatches (extracted from type-on-path)
// ---------------------------------------------------------------------------

function mountToolbarColorSwatches(svgEditor, ctrl) {
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return false;

  if (!document.getElementById('tools_left_swatches')) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="tool_sep" id="tools_swatch_sep"></div>
      <div id="tools_left_swatches" class="tools-left-swatches" title="Fill & Stroke (X to toggle focus, Shift+X to swap, D for default, / for none)">
        <button id="swatch_swap_btn" class="swatch-swap-btn" title="Swap Fill and Stroke (Shift+X)" type="button">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
            <path d="M 3.5,3 A 5.5,5.5 0 0,1 9,8.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <polygon points="3.5,0.8 0.5,3 3.5,5.2"/>
            <polygon points="6.8,8.5 9,11.5 11.2,8.5"/>
          </svg>
        </button>
        <div class="swatches-cluster">
          <div id="swatch_fill_box" class="swatch-box swatch-fill active" title="Fill Color (Click to focus / double-click for picker)">
            <div id="swatch_fill_indicator" class="swatch-color-indicator"></div>
          </div>
          <div id="swatch_stroke_box" class="swatch-box swatch-stroke" title="Stroke Color (Click to focus / double-click for picker)">
            <div id="swatch_stroke_indicator" class="swatch-color-indicator">
              <div class="swatch-stroke-hole"></div>
            </div>
          </div>
        </div>
        <button id="swatch_default_btn" class="swatch-default-btn" title="Default Fill and Stroke (D)" type="button">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <rect x="1" y="1" width="8" height="8" fill="#cccccc" stroke="#111111" stroke-width="1"/>
            <rect x="6" y="6" width="8" height="8" fill="#2b2b36" stroke="#000000" stroke-width="1.8"/>
          </svg>
        </button>
      </div>
    `;
    while (wrapper.firstChild) toolsLeft.appendChild(wrapper.firstChild);
  }

  if (toolsLeft.dataset.vcsToolbarBound === '1') {
    // Still refresh paint indicators
    updateToolbarFromCanvas();
    return true;
  }
  toolsLeft.dataset.vcsToolbarBound = '1';

  const updateSwatches = () => {
    updateToolbarFromCanvas();
  };

  function updateToolbarFromCanvas() {
    const sc = svgEditor.svgCanvas;
    if (!sc) return;
    let fill = (typeof sc.getColor === 'function') ? (sc.getColor('fill') || '#cccccc') : '#cccccc';
    let stroke = (typeof sc.getColor === 'function') ? (sc.getColor('stroke') || '#000000') : '#000000';
    const fillInd = document.getElementById('swatch_fill_indicator');
    const strokeInd = document.getElementById('swatch_stroke_indicator');
    const fillBox = document.getElementById('swatch_fill_box');
    const strokeBox = document.getElementById('swatch_stroke_box');

    if (fillInd) {
      if (!fill || fill === 'none' || fill === 'transparent') {
        fillInd.classList.add('is-none');
        fillInd.style.backgroundColor = '';
      } else {
        fillInd.classList.remove('is-none');
        fillInd.style.backgroundColor = fill;
      }
    }
    if (strokeInd) {
      if (!stroke || stroke === 'none' || stroke === 'transparent') {
        strokeInd.classList.add('is-none');
        strokeInd.style.backgroundColor = '';
      } else {
        strokeInd.classList.remove('is-none');
        strokeInd.style.backgroundColor = stroke;
      }
    }
    const active = ctrl.getActiveTarget();
    if (fillBox && strokeBox) {
      fillBox.classList.toggle('active', active === 'fill');
      strokeBox.classList.toggle('active', active === 'stroke');
    }
  }

  const fillBox = document.getElementById('swatch_fill_box');
  const strokeBox = document.getElementById('swatch_stroke_box');
  const swapBtn = document.getElementById('swatch_swap_btn');
  const defaultBtn = document.getElementById('swatch_default_btn');

  fillBox?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctrl.getActiveTarget() === 'fill') ctrl.openPicker('fill');
    else ctrl.setActiveTarget('fill');
  });
  fillBox?.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    ctrl.openPicker('fill');
  });
  strokeBox?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctrl.getActiveTarget() === 'stroke') ctrl.openPicker('stroke');
    else ctrl.setActiveTarget('stroke');
  });
  strokeBox?.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    ctrl.openPicker('stroke');
  });
  swapBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    ctrl.swapFillStroke();
  });
  defaultBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    ctrl.applyDefaults();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.nodeName)) return;
    if (e.target?.isContentEditable) return;
    if (e.target?.shadowRoot?.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.shadowRoot.activeElement.nodeName)) return;
    if (window.__visterasIsTypingDirectly) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.getElementById('vcs_picker_modal')?.classList.contains('open')) return;

    if (e.key === 'x' || e.key === 'X') {
      if (e.shiftKey) ctrl.swapFillStroke();
      else ctrl.toggleTarget();
      e.preventDefault();
    } else if ((e.key === 'd' || e.key === 'D') && !e.shiftKey) {
      ctrl.applyDefaults();
      e.preventDefault();
    } else if (e.key === '/') {
      ctrl.setWorkingColor('none');
      e.preventDefault();
    }
  });

  const sc = svgEditor.svgCanvas;
  if (sc && typeof sc.bind === 'function') {
    sc.bind('selectedChanged', () => { ctrl.syncFromCanvas(); updateSwatches(); });
    sc.bind('elementChanged', () => { ctrl.syncFromCanvas(); updateSwatches(); });
    sc.bind('changed', () => { ctrl.syncFromCanvas(); updateSwatches(); });
    sc.bind('transition', updateSwatches);
  }
  document.getElementById('fill_color')?.addEventListener('change', () => { ctrl.syncFromCanvas(); updateSwatches(); });
  document.getElementById('stroke_color')?.addEventListener('change', () => { ctrl.syncFromCanvas(); updateSwatches(); });
  document.getElementById('palette')?.addEventListener('change', () => { ctrl.syncFromCanvas(); updateSwatches(); });

  window.__visterasUpdateSwatches = updateSwatches;
  ctrl.subscribe(() => updateSwatches());
  updateSwatches();
  setTimeout(updateSwatches, 200);
  setTimeout(updateSwatches, 800);
  return true;
}

// ---------------------------------------------------------------------------
// Side panels: Color | Swatches stacked ABOVE Properties (Studio parity)
// + Appearance fill/stroke wells in Properties
// ---------------------------------------------------------------------------

const VCS_TAB_STORAGE = 'visteras-vector-color-tab';

function readCanvasPaint(svgEditor, which) {
  const sc = svgEditor?.svgCanvas;
  const fallbackHex = which === 'fill' ? '#cccccc' : '#000000';

  // Prefer live DOM on the current paint targets (DS + outside-align helpers).
  try {
    const targets = flattenPaintTargets(resolvePaintTargets(sc));
    for (const el of targets) {
      if (!el) continue;
      let raw = el.getAttribute(which);
      if (which === 'stroke') {
        const align = (el.getAttribute(STROKE_ALIGN_ATTR) || '').toLowerCase();
        if (align === 'outside') {
          const stored = el.getAttribute(STROKE_PAINT_ATTR);
          if (stored != null) raw = stored;
        }
      }
      if (raw == null || raw === '') continue;
      if (raw === 'none' || raw === 'transparent') return { none: true, hex: fallbackHex };
      const hex = normalizeHex(raw);
      if (hex && hex !== 'none') return { none: false, hex };
    }
  } catch { /* fall through */ }

  if (!sc || typeof sc.getColor !== 'function') {
    return { none: false, hex: fallbackHex };
  }
  const raw = sc.getColor(which);
  if (!raw || raw === 'none' || raw === 'transparent') {
    return { none: true, hex: fallbackHex };
  }
  const hex = normalizeHex(raw);
  if (!hex || hex === 'none') return { none: true, hex: fallbackHex };
  return { none: false, hex };
}

function activateVcsTab(tab) {
  const block = document.getElementById('vcs_colors_block');
  if (!block) return;
  const tabs = {
    color: document.getElementById('vcs_tab_btn_color'),
    swatches: document.getElementById('vcs_tab_btn_swatches'),
  };
  const panes = {
    color: document.getElementById('vcs_color_panel'),
    swatches: document.getElementById('vcs_swatches_panel'),
  };
  if (!tabs.color || !tabs.swatches || !panes.color || !panes.swatches) return;

  const next = tab === 'swatches' ? 'swatches' : 'color';
  for (const key of ['color', 'swatches']) {
    const selected = key === next;
    tabs[key].classList.toggle('active', selected);
    tabs[key].setAttribute('aria-selected', selected ? 'true' : 'false');
    tabs[key].tabIndex = selected ? 0 : -1;
    panes[key].classList.toggle('hidden', !selected);
    panes[key].classList.toggle('vcs-tab-pane-active', selected);
  }
  block.classList.remove('collapsed');
  try { localStorage.setItem(VCS_TAB_STORAGE, next); } catch { /* ignore */ }
}

/**
 * Ensure Color|Swatches sit in their own sidebar block ABOVE Properties
 * (not tabbed beside Properties). Restores a plain Properties header if an
 * older tabbed-props chrome was previously injected.
 */
function ensureColorSwatchesBlock() {
  const propPanel = document.getElementById('properties_panel');
  if (!propPanel) return null;

  // Undo prior Properties|Color|Swatches tab chrome from earlier PR revisions.
  if (propPanel.dataset.vcsTabs === '1') {
    const propsContent = document.getElementById('properties_content');
    const oldColor = document.getElementById('vcs_color_panel');
    const oldSwatches = document.getElementById('vcs_swatches_panel');
    oldColor?.remove();
    oldSwatches?.remove();
    propsContent?.classList.remove('panel_tab_pane', 'vcs-tab-pane', 'vcs-tab-pane-active', 'hidden');
    propsContent?.removeAttribute('role');
    const header = document.getElementById('properties_panel_header');
    if (header) {
      header.className = 'sidebar_block_header';
      header.title = 'Toggle Properties Panel';
      header.innerHTML = `
        <span class="sidebar_block_title">Properties</span>
        <span class="sidebar_block_arrow"></span>
      `;
    }
    propPanel.classList.remove('vcs-block', 'vcs-tabbed-props');
    delete propPanel.dataset.vcsTabs;
    delete propPanel.dataset.vcsColorsBlock;
  }

  let block = document.getElementById('vcs_colors_block');
  if (block?.dataset.vcsReady === '1') return block;

  if (!block) {
    block = document.createElement('div');
    block.id = 'vcs_colors_block';
    block.className = 'sidebar_block vcs-block vcs-colors-block';
    propPanel.parentNode?.insertBefore(block, propPanel);
  }

  block.innerHTML = `
    <div class="sidebar_block_header vcs-panel-tabs-header panel_tabs_header" id="vcs_colors_block_header" title="Color / Swatches">
      <span class="panel_tabs vcs-panel-tabs" role="tablist" aria-label="Color and Swatches">
        <button type="button" class="panel_tab_btn vcs-panel-tab-btn active" id="vcs_tab_btn_color" role="tab" aria-selected="true" aria-controls="vcs_color_panel">Color</button>
        <button type="button" class="panel_tab_btn vcs-panel-tab-btn" id="vcs_tab_btn_swatches" role="tab" aria-selected="false" aria-controls="vcs_swatches_panel">Swatches</button>
      </span>
      <span class="sidebar_block_arrow" id="vcs_colors_collapse_arrow" title="Collapse panel"></span>
    </div>
    <div id="vcs_color_panel" class="panel_tab_pane vcs-tab-pane vcs-block-content vcs-tab-pane-active" role="tabpanel" aria-labelledby="vcs_tab_btn_color"></div>
    <div id="vcs_swatches_panel" class="panel_tab_pane vcs-tab-pane vcs-block-content hidden" role="tabpanel" aria-labelledby="vcs_tab_btn_swatches"></div>
  `;
  block.dataset.vcsReady = '1';

  block.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('#vcs_tab_btn_color, #vcs_tab_btn_swatches');
    if (!btn || !block.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    activateVcsTab(btn.id === 'vcs_tab_btn_swatches' ? 'swatches' : 'color');
  });

  block.querySelector('#vcs_colors_collapse_arrow')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    block.classList.toggle('collapsed');
  });

  let saved = 'color';
  try { saved = localStorage.getItem(VCS_TAB_STORAGE) || 'color'; } catch { /* ignore */ }
  if (saved === 'properties') saved = 'color';
  activateVcsTab(saved);
  return block;
}

function mountColorPanelContent(ctrl, svgEditor, content) {
  if (!content || content.dataset.vcsMounted === '1') return content;
  content.dataset.vcsMounted = '1';
  content.innerHTML = `
    <div class="recent_colors_bar vcs-recent-colors-bar" id="vcs_recent_colors_bar">
      <div class="recent_colors_header">
        <span class="recent_colors_title">Recent Colors</span>
        <button type="button" id="vcs_recent_clear_btn" class="recent_colors_clear_btn" title="Clear recent colors">Clear</button>
      </div>
      <div id="vcs_recent_colors_grid" class="recent_colors_grid"></div>
    </div>
    <div class="vcs-spectrum-slot" id="vcs_color_spectrum_slot"></div>
    <div class="vcs-preview-row">
      <div class="vcs-preview" id="vcs_color_preview" title="Current color"></div>
      <button type="button" class="vcs-btn-ghost vcs-none-swatch-btn" id="vcs_none_btn" title="No color (/)" aria-label="No color"></button>
    </div>
    <div class="vcs-fields">
      <label class="vcs-field"><span>Hex</span><input id="vcs_hex" type="text" spellcheck="false" maxlength="7" /></label>
    </div>
  `;

  let applying = false;
  const spectrum = createSpectrumWidget({
    size: 200,
    hueHeight: 14,
    onChange: ({ hex }) => {
      if (applying) return;
      applying = true;
      ctrl.setWorkingColor(hex, { apply: true, recordRecent: false, noUndo: true });
      applying = false;
    },
    onCommit: ({ hex }) => {
      ctrl.setWorkingColor(hex, { apply: true, recordRecent: true, noUndo: false });
    },
  });
  content.querySelector('#vcs_color_spectrum_slot').appendChild(spectrum.el);

  const hexInput = content.querySelector('#vcs_hex');
  const preview = content.querySelector('#vcs_color_preview');
  const recentGrid = content.querySelector('#vcs_recent_colors_grid');
  const block = content;

  function renderRecent(state) {
    if (!recentGrid) return;
    recentGrid.innerHTML = '';
    const recent = state.recent || [];
    if (!recent.length) {
      recentGrid.innerHTML = '<span class="recent_colors_empty">No recent colors</span>';
      return;
    }
    const active = state.workingNone ? null : state.workingHex?.toLowerCase();
    for (const hex of recent) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'recent_color_chip';
      chip.style.backgroundColor = hex;
      chip.dataset.hex = hex;
      chip.title = hex.toUpperCase();
      if (active && hex.toLowerCase() === active) chip.classList.add('active');
      chip.addEventListener('click', () => ctrl.setWorkingColor(hex));
      recentGrid.appendChild(chip);
    }
  }

  function refreshFields(state) {
    applying = true;
    block.dataset.target = state.activeTarget;

    if (state.workingNone) {
      preview.classList.add('is-none');
      preview.style.backgroundColor = '';
      hexInput.value = 'none';
    } else {
      preview.classList.remove('is-none');
      preview.style.backgroundColor = state.workingHex;
      hexInput.value = state.workingHex.toUpperCase();
      if (!spectrum.isDragging()) spectrum.setFromHex(state.workingHex);
    }
    renderRecent(state);
    applying = false;
  }

  content.querySelector('#vcs_none_btn').addEventListener('click', () => ctrl.setWorkingColor('none'));
  content.querySelector('#vcs_recent_clear_btn')?.addEventListener('click', () => {
    ctrl.clearRecent();
  });

  hexInput.addEventListener('change', () => {
    if (applying) return;
    const v = hexInput.value.trim();
    if (v.toLowerCase() === 'none') ctrl.setWorkingColor('none');
    else {
      const hex = normalizeHex(v);
      if (hex) ctrl.setWorkingColor(hex);
      else refreshFields(ctrl.getState());
    }
  });
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hexInput.dispatchEvent(new Event('change'));
  });

  ctrl.subscribe(refreshFields);
  refreshFields(ctrl.getState());
  return content;
}

function mountSwatchesPanelContent(ctrl, content) {
  if (!content || content.dataset.vcsMounted === '1') return content;
  content.dataset.vcsMounted = '1';
  content.innerHTML = `
    <div class="swatches_panel_content vcs-swatches-panel-content">
      <div class="swatches_toolbar">
        <div class="swatches_toolbar_row">
          <div class="swatches_search_box">
            <svg class="swatches_search_icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="vcs_swatches_search_input" class="swatches_search_input" placeholder="Search swatches..." />
            <button type="button" id="vcs_swatches_search_clear" class="swatches_search_clear hidden" title="Clear search">&times;</button>
          </div>
          <button type="button" id="vcs_swatches_toggle_all_btn" class="swatches_icon_btn" title="Expand/Collapse All Categories">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      <div class="vcs-section-label">User</div>
      <div class="vcs-swatch-grid" id="vcs_user_grid"></div>
      <div class="swatches_schemes_wrapper">
        <div id="vcs_swatches_folders_container" class="swatches_folders_container"></div>
      </div>
    </div>
  `;

  const userGrid = content.querySelector('#vcs_user_grid');
  const folders = content.querySelector('#vcs_swatches_folders_container');
  const searchInput = content.querySelector('#vcs_swatches_search_input');
  const searchClear = content.querySelector('#vcs_swatches_search_clear');
  let searchQuery = '';
  const collapsedKey = 'visteras-vector-swatch-collapsed';
  let collapsed = {};
  try {
    collapsed = JSON.parse(localStorage.getItem(collapsedKey) || '{}') || {};
  } catch { collapsed = {}; }
  // Default: collapse all but first category
  const catNames = Object.keys(SWATCH_CATEGORIES || {});
  catNames.forEach((name, idx) => {
    if (!(name in collapsed) && idx > 0) collapsed[name] = true;
  });

  function saveCollapsed() {
    try { localStorage.setItem(collapsedKey, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }

  function swatchEl(hex, name, { userId = null } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vcs-swatch';
    btn.style.backgroundColor = hex;
    btn.title = userId
      ? `${name}\n${hex.toUpperCase()}\nClick: apply · Right-click: rename · Shift+click: delete`
      : `${name}\n${hex.toUpperCase()}`;
    btn.dataset.hex = hex;
    if (userId) btn.dataset.userId = userId;
    if (hex.toLowerCase() === '#ffffff') btn.classList.add('is-light');
    btn.addEventListener('click', (e) => {
      if (e.shiftKey && userId) {
        ctrl.deleteUserSwatch(userId);
        return;
      }
      ctrl.setWorkingColor(hex);
    });
    if (userId) {
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const next = window.prompt('Rename swatch', name);
        if (next != null && next.trim()) ctrl.renameUserSwatch(userId, next.trim());
      });
    }
    return btn;
  }

  function renderUser(state) {
    userGrid.innerHTML = '';
    for (const s of state.userSwatches) {
      userGrid.appendChild(swatchEl(s.hex, s.name, { userId: s.id }));
    }
    const active = state.workingNone ? null : state.workingHex?.toLowerCase();
    content.querySelectorAll('.vcs-swatch').forEach((el) => {
      el.classList.toggle('active', active && el.dataset.hex?.toLowerCase() === active);
    });
  }

  function renderFolders(state) {
    folders.innerHTML = '';
    const query = searchQuery;
    let totalMatches = 0;
    const active = state.workingNone ? null : state.workingHex?.toLowerCase();

    catNames.forEach((catName) => {
      let palettes = SWATCH_CATEGORIES[catName] || [];
      if (query) {
        palettes = palettes.filter((p) => {
          if (p.name.toLowerCase().includes(query)) return true;
          return p.colors.some((c) => c.hex.toLowerCase().includes(query)
            || (c.name && c.name.toLowerCase().includes(query)));
        });
        if (!palettes.length) return;
      }
      totalMatches += palettes.length;
      const isSearching = !!query;
      const isCollapsed = isSearching ? false : !!collapsed[catName];

      const folderEl = document.createElement('div');
      folderEl.className = `swatches_folder ${isCollapsed ? 'collapsed' : 'expanded'}`;
      folderEl.dataset.category = catName;

      let previewColors = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'];
      if (palettes.length > 0 && palettes[0].colors?.length >= 4) {
        previewColors = palettes[0].colors.slice(0, 4).map((c) => c.hex);
      }
      const previewHtml = previewColors.map((c) => `<span class="folder_preview_bar_segment" style="background:${c}"></span>`).join('');

      const headerEl = document.createElement('div');
      headerEl.className = 'swatches_folder_header';
      headerEl.title = `Click to ${isCollapsed ? 'expand' : 'collapse'} ${catName}`;
      headerEl.innerHTML = `
        <div class="folder_header_left">
          <svg class="folder_chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span class="folder_title">${catName}</span>
          <span class="folder_count">(${palettes.length})</span>
        </div>
        <div class="folder_preview_bar">${previewHtml}</div>
      `;
      headerEl.addEventListener('click', () => {
        collapsed[catName] = !collapsed[catName];
        saveCollapsed();
        renderFolders(ctrl.getState());
      });
      folderEl.appendChild(headerEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'swatches_folder_body';
      palettes.forEach((palette) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'swatches_palette_row';
        const nameEl = document.createElement('div');
        nameEl.className = 'swatches_palette_name';
        nameEl.textContent = palette.name;
        nameEl.title = palette.name;
        const chipsEl = document.createElement('div');
        chipsEl.className = 'swatches_palette_chips';
        palette.colors.forEach((color) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'swatch_chip scheme_chip';
          chip.style.backgroundColor = color.hex;
          chip.dataset.hex = color.hex;
          chip.title = `${palette.name}\n${color.name ? `${color.name} ` : ''}${color.hex.toUpperCase()}`;
          if (active && color.hex.toLowerCase() === active) chip.classList.add('active');
          chip.addEventListener('click', () => ctrl.setWorkingColor(color.hex));
          chipsEl.appendChild(chip);
        });
        rowEl.append(nameEl, chipsEl);
        bodyEl.appendChild(rowEl);
      });
      folderEl.appendChild(bodyEl);
      folders.appendChild(folderEl);
    });

    if (totalMatches === 0 && query) {
      folders.innerHTML = `<div class="swatches_no_results"><span>No palettes match "${query}"</span></div>`;
    }
  }

  function render(state) {
    renderUser(state);
    renderFolders(state);
  }

  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    searchClear?.classList.toggle('hidden', !e.target.value.length);
    renderFolders(ctrl.getState());
  });
  searchClear?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    searchQuery = '';
    searchClear.classList.add('hidden');
    renderFolders(ctrl.getState());
  });
  content.querySelector('#vcs_swatches_toggle_all_btn')?.addEventListener('click', () => {
    const someOpen = catNames.some((name) => !collapsed[name]);
    catNames.forEach((name) => { collapsed[name] = someOpen; });
    saveCollapsed();
    renderFolders(ctrl.getState());
  });
  ctrl.subscribe(render);
  render(ctrl.getState());
  return content;
}

function mountColorSwatchesTabs(ctrl, svgEditor) {
  const block = ensureColorSwatchesBlock();
  if (!block) return null;
  const colorPane = document.getElementById('vcs_color_panel');
  const swatchesPane = document.getElementById('vcs_swatches_panel');
  mountColorPanelContent(ctrl, svgEditor, colorPane);
  mountSwatchesPanelContent(ctrl, swatchesPane);
  return block;
}

function mountAppearanceColors(ctrl, svgEditor) {
  const fillChip = document.getElementById('vcs_app_fill_chip');
  const strokeChip = document.getElementById('vcs_app_stroke_chip');
  if (!fillChip || !strokeChip) return;
  if (fillChip.dataset.vcsWired === '1') return;
  fillChip.dataset.vcsWired = '1';

  const fillTarget = document.getElementById('vcs_app_fill_target');
  const strokeTarget = document.getElementById('vcs_app_stroke_target');
  const fillNone = document.getElementById('vcs_app_fill_none');
  const weightInput = document.getElementById('vcs_app_stroke_weight');
  const alignGroup = document.getElementById('vcs_app_stroke_align');
  const alignBtns = alignGroup
    ? Array.from(alignGroup.querySelectorAll('.vcs-stroke-align-btn[data-align]'))
    : [];
  const rowFill = fillChip.closest('.vcs-appearance-row');
  const rowStroke = strokeChip.closest('.vcs-appearance-row');
  const sc = svgEditor?.svgCanvas;

  function paintChip(el, paint) {
    if (paint.none) {
      el.classList.add('is-none');
      el.style.backgroundColor = '';
    } else {
      el.classList.remove('is-none');
      el.style.backgroundColor = paint.hex;
    }
  }

  function readStrokeWidth() {
    const targets = flattenPaintTargets(resolvePaintTargets(sc));
    for (const el of targets) {
      const w = readElementStrokeWeight(el);
      if (w != null) return w;
    }
    if (typeof sc?.getStrokeWidth === 'function') {
      const w = sc.getStrokeWidth();
      if (w != null && w !== '') return Number(w);
    }
    const native = document.getElementById('stroke_width');
    if (native?.value != null && native.value !== '') return Number(native.value);
    return 1;
  }

  function readStrokeAlign() {
    const targets = flattenPaintTargets(resolvePaintTargets(sc));
    for (const el of targets) {
      if (el?.hasAttribute?.(STROKE_ALIGN_ATTR)) return readElementStrokeAlign(el);
    }
    return 'center';
  }

  function setAlignButtons(align) {
    const a = (align === 'inside' || align === 'outside') ? align : 'center';
    for (const btn of alignBtns) {
      const on = btn.dataset.align === a;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // Stepper sequence: 0 → 0.25 → 0.5 → 0.75 → 1 → 2 → 3 → 4 → …
  function stepStrokeWeight(value, dir) {
    const n = Math.max(0, Number(value) || 0);
    const quarters = [0, 0.25, 0.5, 0.75, 1];
    if (dir > 0) {
      for (const s of quarters) {
        if (n < s - 1e-9) return s;
      }
      return Math.floor(n + 1e-9) + 1;
    }
    if (n > 1 + 1e-9) {
      const floored = Math.floor(n + 1e-9);
      return Math.abs(n - floored) < 1e-9 ? floored - 1 : floored;
    }
    for (let i = quarters.length - 1; i >= 0; i--) {
      if (n > quarters[i] + 1e-9) return quarters[i];
    }
    return 0;
  }

  function formatStrokeWeight(n) {
    const v = Math.max(0, Number(n) || 0);
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return String(Math.round(v * 100) / 100);
  }

  function writeStrokeWidth(value, { live = false } = {}) {
    const n = Math.max(0, Number(value));
    if (Number.isNaN(n)) return;
    // Keep SVG-Edit "current style" in sync for newly drawn shapes.
    if (typeof sc?.setCurProperties === 'function') sc.setCurProperties('stroke_width', n);
    else if (sc?.curProperties) sc.curProperties.stroke_width = n;
    if (sc?.curShape) sc.curShape.stroke_width = n;

    const targets = flattenPaintTargets(resolvePaintTargets(sc));
    if (targets.length) {
      // Always store the user-facing weight on targets first.
      for (const el of targets) el.setAttribute(STROKE_WEIGHT_ATTR, String(n));

      const needsAlign = targets.some((el) => {
        const a = readElementStrokeAlign(el);
        return a === 'inside' || a === 'outside';
      });

      if (needsAlign) {
        for (const el of targets) {
          const align = readElementStrokeAlign(el);
          applyStrokeAlignToElement(el, sc, { align, userWidth: n });
        }
        sc.call?.('changed', targets);
      } else {
        const applied = applyPaintAttribute(sc, 'stroke-width', n, { noUndo: !!live });
        if (!applied && typeof sc?.setStrokeWidth === 'function') sc.setStrokeWidth(n);
      }
    } else {
      const applied = applyPaintAttribute(sc, 'stroke-width', n, { noUndo: !!live });
      if (!applied && typeof sc?.setStrokeWidth === 'function') {
        sc.setStrokeWidth(n);
      }
    }

    const native = document.getElementById('stroke_width');
    if (native && document.activeElement !== native) native.value = formatStrokeWeight(n);
    if (weightInput && document.activeElement !== weightInput) {
      weightInput.value = formatStrokeWeight(n);
    }
  }

  function writeStrokeAlign(align) {
    const a = (align === 'inside' || align === 'outside') ? align : 'center';
    const w = readStrokeWidth();
    applyStrokeAlignToTargets(sc, a, { userWidth: w, noUndo: false });
    setAlignButtons(a);
    // Keep SVG-Edit current style weight as user weight
    if (typeof sc?.setCurProperties === 'function') sc.setCurProperties('stroke_width', w);
    else if (sc?.curProperties) sc.curProperties.stroke_width = w;
  }

  function refresh() {
    const fill = readCanvasPaint(svgEditor, 'fill');
    const stroke = readCanvasPaint(svgEditor, 'stroke');
    paintChip(fillChip, fill);
    paintChip(strokeChip, stroke);
    const active = ctrl.getActiveTarget();
    rowFill?.classList.toggle('active', active === 'fill');
    rowStroke?.classList.toggle('active', active === 'stroke');
    fillTarget?.classList.toggle('active', active === 'fill');
    strokeTarget?.classList.toggle('active', active === 'stroke');
    if (weightInput && document.activeElement !== weightInput) {
      weightInput.value = formatStrokeWeight(readStrokeWidth());
    }
    setAlignButtons(readStrokeAlign());
  }

  const openFor = (target) => {
    ctrl.setActiveTarget(target, { syncColor: true });
    ctrl.openPicker(target);
  };

  fillChip.addEventListener('click', (e) => { e.stopPropagation(); openFor('fill'); });
  strokeChip.addEventListener('click', (e) => { e.stopPropagation(); openFor('stroke'); });
  // Words "Fill" / "Stroke" open the color picker modal (Illustrator-like).
  fillTarget?.addEventListener('click', (e) => { e.stopPropagation(); openFor('fill'); });
  strokeTarget?.addEventListener('click', (e) => { e.stopPropagation(); openFor('stroke'); });
  fillNone?.addEventListener('click', (e) => {
    e.stopPropagation();
    ctrl.setActiveTarget('fill', { syncColor: false });
    ctrl.setWorkingColor('none');
  });

  if (weightInput) {
    weightInput.setAttribute('step', 'any');
    weightInput.setAttribute('min', '0');
    let lastWeight = Number(weightInput.value) || readStrokeWidth() || 0;

    const applyCommit = () => {
      const n = Math.max(0, Number(weightInput.value));
      if (!Number.isNaN(n)) weightInput.value = formatStrokeWeight(n);
      lastWeight = Number(weightInput.value) || 0;
      writeStrokeWidth(weightInput.value, { live: false });
    };

    weightInput.addEventListener('input', (e) => {
      const raw = Number(weightInput.value);
      if (!Number.isFinite(raw)) return;
      const inputType = e instanceof InputEvent ? e.inputType : null;
      const isTyping = !!inputType && (
        inputType.startsWith('insert')
        || inputType.startsWith('delete')
        || inputType === 'historyUndo'
        || inputType === 'historyRedo'
      );
      if (isTyping) {
        lastWeight = raw;
        writeStrokeWidth(raw, { live: true });
        return;
      }
      // Spinner / non-typing step: map through 0→0.25→…→1→2→…
      const dir = raw > lastWeight + 1e-9 ? 1 : raw < lastWeight - 1e-9 ? -1 : 0;
      if (dir) {
        const next = stepStrokeWeight(lastWeight, dir);
        weightInput.value = formatStrokeWeight(next);
        lastWeight = next;
        writeStrokeWidth(next, { live: true });
      } else {
        lastWeight = raw;
        writeStrokeWidth(raw, { live: true });
      }
    });
    weightInput.addEventListener('change', applyCommit);
    weightInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = stepStrokeWeight(weightInput.value, e.key === 'ArrowUp' ? 1 : -1);
        weightInput.value = formatStrokeWeight(next);
        lastWeight = next;
        writeStrokeWidth(next, { live: true });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCommit();
        weightInput.blur();
      }
    });
    weightInput.addEventListener('wheel', (e) => {
      if (document.activeElement !== weightInput) return;
      e.preventDefault();
      const next = stepStrokeWeight(weightInput.value, e.deltaY < 0 ? 1 : -1);
      weightInput.value = formatStrokeWeight(next);
      lastWeight = next;
      writeStrokeWidth(next, { live: true });
    }, { passive: false });
  }

  for (const btn of alignBtns) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const align = btn.dataset.align || 'center';
      ctrl.setActiveTarget('stroke', { syncColor: false });
      writeStrokeAlign(align);
      refresh();
    });
  }

  ctrl.subscribe(refresh);
  document.getElementById('fill_color')?.addEventListener('change', refresh);
  document.getElementById('stroke_color')?.addEventListener('change', refresh);
  document.getElementById('stroke_width')?.addEventListener('change', refresh);
  // Re-sync alignment UI (and geometry clips) when selection changes.
  let alignSyncing = false;
  try {
    sc?.bind?.('selected', refresh);
    sc?.bind?.('changed', () => {
      if (alignSyncing) return;
      alignSyncing = true;
      try {
        const targets = flattenPaintTargets(resolvePaintTargets(sc));
        for (const el of targets) {
          try { syncStrokeAlignRendering(el, sc); } catch { /* ignore */ }
        }
        refresh();
      } finally {
        alignSyncing = false;
      }
    });
  } catch { /* ignore */ }
  refresh();
}

// ---------------------------------------------------------------------------
// Picker modal
// ---------------------------------------------------------------------------

function mountPickerModal(ctrl) {
  if (document.getElementById('vcs_picker_modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'vcs_picker_overlay';
  overlay.className = 'vcs-picker-overlay';

  const modal = document.createElement('div');
  modal.id = 'vcs_picker_modal';
  modal.className = 'vcs-picker-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="vcs-picker-header">
      <span class="vcs-picker-title">Color Picker</span>
      <span class="vcs-picker-target-label" id="vcs_picker_target_label">Fill</span>
      <button type="button" class="vcs-picker-close" id="vcs_picker_close" title="Close">×</button>
    </div>
    <div class="vcs-picker-body">
      <div class="vcs-picker-spectrum" id="vcs_picker_spectrum_slot"></div>
      <div class="vcs-picker-side">
        <div class="vcs-preview-row">
          <div class="vcs-preview vcs-preview-lg" id="vcs_picker_preview"></div>
          <button type="button" class="vcs-btn-ghost vcs-none-swatch-btn" id="vcs_picker_none" title="No color" aria-label="No color"></button>
          <span class="vcs-none-label">None</span>
        </div>
        <div class="vcs-fields">
          <label class="vcs-field"><span>Hex</span><input id="vcs_picker_hex" type="text" spellcheck="false" maxlength="7" /></label>
        </div>
        <div class="vcs-picker-actions">
          <button type="button" class="vcs-btn" id="vcs_picker_apply">OK</button>
          <button type="button" class="vcs-btn vcs-btn-secondary" id="vcs_picker_cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.append(overlay, modal);

  let draftHex = '#cccccc';
  let draftNone = false;
  let openSnapshot = { hex: '#cccccc', none: false, target: 'fill' };
  let applying = false;
  let liveApply = true; // live apply while dragging; Cancel restores snapshot

  const spectrum = createSpectrumWidget({
    size: 260,
    hueHeight: 16,
    onChange: ({ hex }) => {
      draftNone = false;
      draftHex = hex;
      refreshDraft();
      if (liveApply) ctrl.setWorkingColor(hex, { apply: true, recordRecent: false, noUndo: true });
    },
    onCommit: ({ hex }) => {
      draftHex = hex;
      if (liveApply) {
        ctrl.setWorkingColor(hex, { apply: true, recordRecent: true, noUndo: false });
      }
    },
  });
  modal.querySelector('#vcs_picker_spectrum_slot').appendChild(spectrum.el);

  const hexInput = modal.querySelector('#vcs_picker_hex');
  const preview = modal.querySelector('#vcs_picker_preview');
  const targetLabel = modal.querySelector('#vcs_picker_target_label');

  function refreshDraft() {
    applying = true;
    const target = ctrl.getActiveTarget();
    targetLabel.textContent = target === 'fill' ? 'Fill' : 'Stroke';
    if (draftNone) {
      preview.classList.add('is-none');
      preview.style.backgroundColor = '';
      hexInput.value = 'none';
    } else {
      preview.classList.remove('is-none');
      preview.style.backgroundColor = draftHex;
      hexInput.value = draftHex.toUpperCase();
      if (!spectrum.isDragging()) spectrum.setFromHex(draftHex);
    }
    applying = false;
  }

  function close() {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  }

  function open(target) {
    if (target) ctrl.setActiveTarget(target, { syncColor: true });
    const st = ctrl.getState();
    openSnapshot = {
      hex: st.workingHex,
      none: st.workingNone,
      target: st.activeTarget,
    };
    draftHex = st.workingHex;
    draftNone = st.workingNone;
    refreshDraft();
    overlay.classList.add('open');
    modal.classList.add('open');
    hexInput.focus();
    hexInput.select();
  }

  function cancel() {
    try {
      // Restore snapshot
      ctrl.setActiveTarget(openSnapshot.target, { syncColor: false });
      if (openSnapshot.none) ctrl.setWorkingColor('none', { recordRecent: false });
      else ctrl.setWorkingColor(openSnapshot.hex, { recordRecent: false });
    } catch (err) {
      console.warn('[visteras-color-system] cancel restore failed', err);
    } finally {
      close();
    }
  }

  function applyAndClose() {
    try {
      if (draftNone) ctrl.setWorkingColor('none');
      else ctrl.setWorkingColor(draftHex, { recordRecent: true });
    } catch (err) {
      console.warn('[visteras-color-system] apply failed', err);
    } finally {
      close();
    }
  }

  modal.querySelector('#vcs_picker_none').addEventListener('click', () => {
    draftNone = true;
    refreshDraft();
    if (liveApply) ctrl.setWorkingColor('none');
  });
  modal.querySelector('#vcs_picker_close').addEventListener('click', applyAndClose);
  modal.querySelector('#vcs_picker_apply').addEventListener('click', applyAndClose);
  modal.querySelector('#vcs_picker_cancel').addEventListener('click', cancel);
  overlay.addEventListener('click', cancel);

  hexInput.addEventListener('change', () => {
    if (applying) return;
    const v = hexInput.value.trim();
    if (v.toLowerCase() === 'none') {
      draftNone = true;
    } else {
      const hex = normalizeHex(v);
      if (!hex) { refreshDraft(); return; }
      draftNone = false;
      draftHex = hex;
    }
    refreshDraft();
    if (liveApply) ctrl.setWorkingColor(draftNone ? 'none' : draftHex, { recordRecent: false });
  });

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel();
    } else if (e.key === 'Enter' && e.target?.id?.startsWith('vcs_picker_')) {
      e.preventDefault();
      applyAndClose();
    }
  }, true); // capture so we win over Direct Selection's Escape handler

  window.__visterasOpenColorPicker = open;
  ctrl.subscribe(() => {
    if (!modal.classList.contains('open')) return;
    // Keep target chrome in sync if changed externally
    targetLabel.textContent = ctrl.getActiveTarget() === 'fill' ? 'Fill' : 'Stroke';
  });
}

// ---------------------------------------------------------------------------
// Public mount
// ---------------------------------------------------------------------------

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasColorSystem({ svgEditor } = {}) {
  if (!svgEditor?.svgCanvas) {
    console.warn('[visteras-color-system] svgEditor not ready');
    return null;
  }
  if (window.__visterasColorSystemMounted) {
    return window.__visterasColorSystem;
  }

  const ctrl = createColorController(svgEditor);

  const tryMount = () => {
    mountToolbarColorSwatches(svgEditor, ctrl);
    mountColorSwatchesTabs(ctrl, svgEditor);
    mountAppearanceColors(ctrl, svgEditor);
    mountPickerModal(ctrl);
  };

  tryMount();
  setTimeout(tryMount, 100);
  setTimeout(tryMount, 500);
  setTimeout(() => {
    ctrl.syncFromCanvas();
  }, 600);

  window.__visterasColorSystemMounted = true;
  console.info('[visteras-color-system] mounted');
  return ctrl;
}

export default mountVisterasColorSystem;
