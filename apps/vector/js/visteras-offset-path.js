/**
 * Visteras Vector — Offset Path  (Object → Offset Path…, ⌥⌘O)
 *
 * Creates a parallel offset copy of each selected shape (closed or open,
 * groups expanded) in the same layer. Positive offset expands; negative
 * shrinks. Also Object → Outline Stroke.
 *
 * Implementation detail
 * ─────────────────────
 * Paper.js booleans only see fill geometry: a clone with a big strokeWidth
 * unites to the original outline unchanged (the original bug: an identical
 * copy, and an empty Outline Stroke). visteras-stroke-envelope.js builds the
 * stroke region as real polygons (per-edge quads + SVG joins/caps):
 *
 *   offset +d  = original ∪ envelope(d)   (placed behind the original)
 *   offset −d  = original − envelope(d)   (placed in front)
 *   outline(w) = envelope(w/2)  (∩ / − original for Inside / Outside strokes)
 *
 * Groups are expanded to their shapes; Inside/Outside wraps map to the body
 * and the offset copy keeps its stroke alignment. One undo step each, with
 * the selection restored on undo/redo.
 *
 * Keyboard: ⌥⌘O (wired up in setupMenuBar via action_offset_path)
 *
 * Exports
 * ───────
 *   mountOffsetPath(editor)          — registers menu item + dialog
 *   computeOffsetPath(scope, el, opts) — pure geometry (testable without DOM)
 */

import { offsetItem, outlineItem } from './visteras-stroke-envelope.js?v=envelope-1';
import { resolveElementPaint } from './visteras-paint-resolver.js?v=paint-resolver-2';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ─── Dialog HTML ─────────────────────────────────────────────────────────────
const DIALOG_ID = 'visteras-offset-path-dialog';

/**
 * Illustrator defaults: Miter joins, miter limit 4. The dialog is built once,
 * so later opens keep the last values used in this session; a reload starts
 * from these again.
 */
export const DEFAULT_OFFSET_OPTIONS = Object.freeze({ offset: 10, joins: 'miter', miterLimit: 4, copyOriginal: true });

function buildDialog() {
  if (document.getElementById(DIALOG_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = DIALOG_ID;
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:100000',
    'display:none', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.55)',
  ].join(';');

  overlay.innerHTML = `
    <div id="${DIALOG_ID}-inner" style="
      background:#2a2a2e;
      border:1px solid rgba(255,255,255,0.12);
      border-radius:10px;
      box-shadow:0 12px 48px rgba(0,0,0,0.6);
      width:300px;
      font:13px/1.5 -apple-system,sans-serif;
      color:#ddd;
      overflow:hidden;
    ">
      <!-- Title bar -->
      <div style="
        background:#1e1e22;
        padding:12px 16px;
        border-bottom:1px solid rgba(255,255,255,0.08);
        font-weight:600;
        font-size:13px;
        color:#fff;
        display:flex;
        align-items:center;
        gap:8px;
      ">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="#7cb9ff" stroke-width="1.5" fill="none"/>
          <rect x="4.5" y="4.5" width="7" height="7" rx="1" stroke="#7cb9ff" stroke-width="1" stroke-dasharray="2 1.5" fill="none"/>
        </svg>
        Offset Path
      </div>

      <!-- Body -->
      <div style="padding:16px 16px 12px">
        <!-- Offset input -->
        <label style="display:block;margin-bottom:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin-bottom:5px">
            Offset Distance
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input id="${DIALOG_ID}-offset" type="number" value="${DEFAULT_OFFSET_OPTIONS.offset}" step="any" inputmode="decimal"
              style="
                flex:1;
                background:#18181b;
                border:1px solid rgba(255,255,255,0.15);
                border-radius:5px;
                color:#fff;
                padding:5px 8px;
                font:13px/1 -apple-system,sans-serif;
                outline:none;
              "
            >
            <span style="font-size:11px;color:#888;min-width:16px">px</span>
          </div>
          <div style="font-size:10px;color:#666;margin-top:4px">
            Positive = expand · Negative = shrink
          </div>
        </label>

        <!-- Join type -->
        <label style="display:block;margin-bottom:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin-bottom:5px">
            Joins
          </div>
          <select id="${DIALOG_ID}-joins" style="
            width:100%;
            background:#18181b;
            border:1px solid rgba(255,255,255,0.15);
            border-radius:5px;
            color:#fff;
            padding:5px 8px;
            font:13px/1 -apple-system,sans-serif;
            outline:none;
          ">
            <option value="miter"${DEFAULT_OFFSET_OPTIONS.joins === 'miter' ? ' selected' : ''}>Miter</option>
            <option value="round"${DEFAULT_OFFSET_OPTIONS.joins === 'round' ? ' selected' : ''}>Round</option>
            <option value="bevel"${DEFAULT_OFFSET_OPTIONS.joins === 'bevel' ? ' selected' : ''}>Bevel</option>
          </select>
        </label>

        <!-- Miter limit -->
        <label id="${DIALOG_ID}-miter-row" style="display:block;margin-bottom:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin-bottom:5px">
            Miter Limit
          </div>
          <input id="${DIALOG_ID}-miter" type="number" value="${DEFAULT_OFFSET_OPTIONS.miterLimit}" min="1" max="100" step="1"
            style="
              width:100%;
              box-sizing:border-box;
              background:#18181b;
              border:1px solid rgba(255,255,255,0.15);
              border-radius:5px;
              color:#fff;
              padding:5px 8px;
              font:13px/1 -apple-system,sans-serif;
              outline:none;
            "
          >
        </label>

        <!-- Options row -->
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;user-select:none">
          <input id="${DIALOG_ID}-copy" type="checkbox" checked
            style="accent-color:#7cb9ff;width:13px;height:13px;margin:0">
          <span style="font-size:12px">Create offset copy (keep original)</span>
        </label>
      </div>

      <!-- Buttons -->
      <div style="
        display:flex;
        gap:8px;
        padding:10px 16px 14px;
        border-top:1px solid rgba(255,255,255,0.07);
        justify-content:flex-end;
      ">
        <button id="${DIALOG_ID}-cancel" style="
          background:transparent;
          border:1px solid rgba(255,255,255,0.18);
          border-radius:6px;
          color:#ccc;
          padding:6px 16px;
          font:13px -apple-system,sans-serif;
          cursor:pointer;
        ">Cancel</button>
        <button id="${DIALOG_ID}-ok" style="
          background:#3a7bd5;
          border:none;
          border-radius:6px;
          color:#fff;
          padding:6px 18px;
          font:13px -apple-system,sans-serif;
          cursor:pointer;
          font-weight:500;
        ">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Show/hide miter limit based on join type
  const joinsEl = overlay.querySelector(`#${DIALOG_ID}-joins`);
  const miterRow = overlay.querySelector(`#${DIALOG_ID}-miter-row`);
  joinsEl.addEventListener('change', () => {
    miterRow.style.display = joinsEl.value === 'miter' ? 'block' : 'none';
  });
  miterRow.style.display = joinsEl.value === 'miter' ? 'block' : 'none'; // Miter is the default

  // Offset field: whole-number steps (↑/↓ = 1, Shift = 10) while typed
  // decimals stay valid (step="any", so 2.5 is never flagged as invalid).
  const offsetEl = overlay.querySelector(`#${DIALOG_ID}-offset`);
  offsetEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); e.stopPropagation();
    offsetEl.value = String(stepOffsetValue(offsetEl.value, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey));
    offsetEl.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Keyboard: Enter = OK, Escape = cancel
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.style.display = 'none';
    if (e.key === 'Enter') overlay.querySelector(`#${DIALOG_ID}-ok`)?.click();
  });

  // Click outside inner = cancel
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
}

/**
 * Offset stepper: whole-number increments (1, or 10 with Shift) from the
 * current value; a typed decimal keeps its fraction (2.5 → 3.5).
 */
export function stepOffsetValue(value, dir, shift = false) {
  const v = Number.parseFloat(value);
  const base = Number.isFinite(v) ? v : 0;
  return Math.round((base + (dir < 0 ? -1 : 1) * (shift ? 10 : 1)) * 1e6) / 1e6;
}

function showDialog() {
  const overlay = document.getElementById(DIALOG_ID);
  if (!overlay) return;
  overlay.style.display = 'flex';
  setTimeout(() => overlay.querySelector(`#${DIALOG_ID}-offset`)?.focus(), 50);
}

function hideDialog() {
  const overlay = document.getElementById(DIALOG_ID);
  if (overlay) overlay.style.display = 'none';
}

function readDialogValues() {
  return {
    offset: (() => { const v = parseFloat(document.getElementById(`${DIALOG_ID}-offset`)?.value); return Number.isFinite(v) ? v : DEFAULT_OFFSET_OPTIONS.offset; })(),
    joins: document.getElementById(`${DIALOG_ID}-joins`)?.value || DEFAULT_OFFSET_OPTIONS.joins,
    miterLimit: Math.max(1, parseFloat(document.getElementById(`${DIALOG_ID}-miter`)?.value) || DEFAULT_OFFSET_OPTIONS.miterLimit),
    copyOriginal: document.getElementById(`${DIALOG_ID}-copy`)?.checked ?? true,
  };
}

// ─── Core geometry ───────────────────────────────────────────────────────────
// Root cause of "Offset Path does nothing": the old code set strokeWidth on a
// Paper clone and united it with the original, but Paper's booleans ignore
// strokes, so the result was the original outline (an identical copy on top).
// Outline Stroke's unite(filled).subtract(filled) was empty for the same
// reason. The stroke region is now built as real geometry
// (visteras-stroke-envelope.js).

const LEAF_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const STROKE_ALIGN_ATTR = 'data-visteras-stroke-align';
const STROKE_WEIGHT_ATTR = 'data-visteras-stroke-weight';
const STROKE_PAINT_ATTR = 'data-visteras-stroke-paint';
const HELPER_ATTR = 'data-visteras-stroke-align-helper';
const WRAP_ATTR = 'data-visteras-sa-wrap';
const APPEARANCE_ATTRS = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'stroke-dashoffset', 'opacity', 'class', 'mix-blend-mode',
];

const csApi = () => (typeof window !== 'undefined' ? window.__visterasColorSystem : null) || null;
const isWrap = (el) => !!el?.getAttribute?.(WRAP_ATTR);
const isHelper = (el) => !!el?.getAttribute?.(HELPER_ATTR);

/** Helper / wrap → the body that owns the appearance. */
function bodyOf(el) {
  if (!el) return null;
  const a = csApi();
  if ((isWrap(el) || isHelper(el)) && a?.resolveStrokeAlignBody) return a.resolveStrokeAlignBody(el) || null;
  if (isWrap(el)) return [...el.children].find((c) => c.getAttribute('data-visteras-sa-body')) || null;
  return el;
}

/** Top-level node that represents a body in the document (its wrap if any). */
function anchorOf(body) {
  return isWrap(body?.parentNode) ? body.parentNode : body;
}

/** Selected objects → painted leaf shapes (groups expanded, wraps → bodies). */
export function collectLeaves(selected) {
  const out = [];
  const seen = new Set();
  const push = (el) => { const b = bodyOf(el); if (b && !seen.has(b) && LEAF_TAGS.has(b.nodeName) && !isHelper(b)) { seen.add(b); out.push(b); } };
  for (const el of selected || []) {
    if (!el) continue;
    if (el.nodeName === 'g' && !isWrap(el)) {
      for (const c of el.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line')) if (!isHelper(c)) push(c);
    } else push(el);
  }
  return out;
}

/** Import an element as one PathItem (Shapes expanded, groups united). Transform baked. */
export function pathItemFromElement(scope, el) {
  let item;
  try { item = scope.project.importSVG(el, { expandShapes: true, insert: false }); } catch { return null; }
  if (!item) return null;
  const collect = (it) => {
    if (!it) return [];
    if (it instanceof scope.PathItem) return [it];
    if (it instanceof scope.Shape) return [it.toPath(false)];
    if (it.children) return [...it.children].flatMap(collect);
    return [];
  };
  const parts = collect(item);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return parts.slice(1).reduce((acc, p) => acc.unite(p, { insert: false }), parts[0]);
}

function exportD(item) {
  // pathData needs no DOM (exportSVG does) and covers Path + CompoundPath.
  const d = item?.pathData || '';
  const fillRule = item?.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
  return { d, fillRule };
}

/**
 * Offset geometry for one element.
 * @returns {{ d: string, fillRule: string|null } | null}
 */
export function computeOffsetPath(scope, sourceEl, opts) {
  const { offset, joins = DEFAULT_OFFSET_OPTIONS.joins, miterLimit = DEFAULT_OFFSET_OPTIONS.miterLimit } = opts || {};
  if (!Number.isFinite(offset) || Math.abs(offset) < 0.001) return null;
  const item = pathItemFromElement(scope, sourceEl);
  if (!item) return null;
  const res = offsetItem(scope, item, offset, { join: joins, miterLimit });
  if (!res) return null;
  const { d, fillRule } = exportD(res);
  return d.trim() ? { d, fillRule: fillRule || 'nonzero' } : null;
}

/**
 * How the offset copy keeps Inside/Outside stroke alignment.
 *
 * Root cause of "the offset copy gets a stroke weight": the copy re-rendered
 * alignment with `Number(weight) || Number(stroke-width) || 1`, so a stored
 * weight of 0 became 1, and stroke-align then painted the missing stroke
 * black (captureStrokePaint's fallback). Illustrator keeps the stroke exactly.
 * The copy only re-renders a ring when the original draws one (aligned,
 * weight > 0, a real paint) and uses the original's weight as-is; otherwise
 * the copied attributes stand verbatim.
 *
 * @param {(name:string)=>string|null} get source attribute getter
 * @returns {{align:'inside'|'outside', weight:number}|null}
 */
export function offsetCopyStrokeAlign(get) {
  const align = String(get(STROKE_ALIGN_ATTR) || 'center').toLowerCase();
  if (align !== 'inside' && align !== 'outside') return null;
  const num = (v) => { if (v == null || String(v).trim() === '') return null; const n = Number.parseFloat(v); return Number.isFinite(n) ? n : null; };
  const weight = num(get(STROKE_WEIGHT_ATTR)) ?? num(get('stroke-width'));
  if (weight == null || weight <= 0) return null;
  const paint = get(STROKE_PAINT_ATTR) ?? get('stroke');
  const none = (v) => v == null || ['', 'none', 'transparent'].includes(String(v).trim().toLowerCase());
  if (none(paint)) return null;
  return { align, weight };
}

// ─── Shared DOM helpers ──────────────────────────────────────────────────────
/**
 * Copy the original's appearance onto the offset copy verbatim: fill, the
 * whole stroke (paint, weight — also 0/none/absent —, joins, caps, miter,
 * dashes, opacity) and the Inside/Outside alignment state. Nothing is added.
 */
export function copyAppearance(src, dst) {
  for (const n of [...APPEARANCE_ATTRS, STROKE_ALIGN_ATTR, STROKE_WEIGHT_ATTR, STROKE_PAINT_ATTR]) {
    const v = src.getAttribute(n);
    if (v != null) dst.setAttribute(n, v);
  }
  const style = (src.getAttribute('style') || '').split(';').map((s) => s.trim())
    .filter((s) => s && !/^pointer-events\s*:/i.test(s)).join(';');
  if (style) dst.setAttribute('style', style);
}

function wrapTransform(body) {
  const w = isWrap(body?.parentNode) ? body.parentNode : null;
  return w?.getAttribute('transform') || null;
}

/** Select `els` after the current task (undo/redo also call this). */
function selectLater(sc, els) {
  setTimeout(() => {
    const live = els.filter((e) => e?.isConnected);
    if (!live.length) return;
    try { sc.clearSelection(); sc.addToSelection(live, true); } catch { /* ignore */ }
    try { window.__updatePropertiesVisibility?.(); } catch { /* ignore */ }
  }, 0);
}

/** One undo step that also restores the selection on undo/redo. */
function finishBatch(sc, batch, before, after) {
  const origApply = batch.apply.bind(batch);
  const origUnapply = batch.unapply.bind(batch);
  batch.apply = (h) => { origApply(h); selectLater(sc, after); };
  batch.unapply = (h) => { origUnapply(h); selectLater(sc, before); };
  sc.undoMgr.addCommandToHistory(batch);
  try { sc.clearSelection(); sc.addToSelection(after, true); } catch { /* ignore */ }
  try { sc.call?.('changed', after); } catch { /* ignore */ }
  try { window.__updatePropertiesVisibility?.(); } catch { /* ignore */ }
}

function newScope() {
  const scope = new window.paper.PaperScope();
  scope.setup(document.createElement('canvas'));
  return scope;
}

// ─── Apply to selection ───────────────────────────────────────────────────────
function executeOffsetPath(editor, opts) {
  const sc = editor.svgCanvas;
  if (!sc) return false;
  const selElems = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
  const leaves = collectLeaves(selElems);
  if (!leaves.length) { alert('Please select one or more paths or shapes to offset.'); return false; }
  if (!window.paper) { alert('Offset Path engine (Paper.js) is loading or unavailable.'); return false; }

  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
  const batchCmd = new BatchCommand('Offset Path');
  const created = [];
  const scope = newScope();
  try {
    for (const el of leaves) {
      const geom = computeOffsetPath(scope, el, opts);
      if (!geom) continue;
      const anchor = anchorOf(el);
      const newPath = document.createElementNS(SVG_NS, 'path');
      newPath.setAttribute('id', sc.getNextId());
      copyAppearance(el, newPath);
      newPath.setAttribute('d', geom.d);
      newPath.setAttribute('fill-rule', geom.fillRule || 'nonzero');
      const wt = wrapTransform(el);
      if (wt) newPath.setAttribute('transform', wt);
      // Expanded copies go behind the original (both stay visible); shrunk
      // copies go in front.
      anchor.parentNode.insertBefore(newPath, opts.offset > 0 ? anchor : anchor.nextSibling);
      // Keep the original's stroke exactly, Inside/Outside alignment included
      // (the alignment state is copied verbatim; the ring is re-rendered only
      // when the original draws one, with the original's own weight).
      const plan = offsetCopyStrokeAlign((n) => el.getAttribute(n));
      if (plan && csApi()?.applyStrokeAlignToElement) {
        const { align, weight: w } = plan;
        // The ring's clip/mask lives in <defs>: record those inserts too so
        // undo leaves nothing behind.
        const defsBefore = new Set(document.querySelectorAll('#svgcontent defs > *'));
        try { csApi().applyStrokeAlignToElement(newPath, sc, { align, userWidth: w }); } catch { /* ignore */ }
        for (const d of document.querySelectorAll('#svgcontent defs > *')) {
          if (!defsBefore.has(d)) batchCmd.addSubCommand(new InsertElementCommand(d));
        }
      }
      batchCmd.addSubCommand(new InsertElementCommand(anchorOf(newPath)));
      created.push(newPath);
      if (!opts.copyOriginal) {
        const next = anchor.nextSibling; const parent = anchor.parentNode;
        anchor.remove();
        batchCmd.addSubCommand(new RemoveElementCommand(anchor, next, parent));
      }
    }
    if (!created.length) {
      alert('Could not compute an offset for the selected shape(s). Try a smaller negative offset (open paths can only be expanded).');
      return false;
    }
    finishBatch(sc, batchCmd, opts.copyOriginal ? selElems : leaves, created);
    return true;
  } catch (err) {
    console.error('Offset Path error:', err);
    alert('Offset Path error: ' + (err.message || err));
    return false;
  } finally {
    scope.project?.clear();
    scope.remove?.();
  }
}

// ─── Outline Stroke ──────────────────────────────────────────────────────────
/** Effective stroke of an element: paint, width, joins, caps, alignment. */
export function readStrokeSpec(el, getCS = (e) => getComputedStyle(e)) {
  const cs = getCS(el);
  const get = (p) => (cs?.getPropertyValue ? cs.getPropertyValue(p) : cs?.[p]) || '';
  const align = String(el.getAttribute(STROKE_ALIGN_ATTR) || 'center').toLowerCase();
  const aligned = align === 'inside' || align === 'outside';
  const paint = resolveElementPaint(el, 'stroke', { getComputedStyle: getCS });
  if (!paint || paint.none) return null;
  let color = paint.hex;
  if (!color) color = aligned ? el.getAttribute(STROKE_PAINT_ATTR) : (get('stroke') || el.getAttribute('stroke'));
  if (!color || color === 'none') return null;
  const cw = parseFloat(get('stroke-width'));
  const aw = parseFloat(el.getAttribute('stroke-width'));
  const width = aligned
    ? (Number(el.getAttribute(STROKE_WEIGHT_ATTR)) || aw || 0)
    : (Number.isFinite(cw) ? cw : (Number.isFinite(aw) ? aw : 1));
  if (!(width > 0)) return null;
  const opacity = parseFloat(get('stroke-opacity'));
  const joinRaw = String(get('stroke-linejoin') || el.getAttribute('stroke-linejoin') || 'miter').toLowerCase();
  return {
    color: String(color).replace(/^url\((['"]?)(.*)\1\)$/, 'url($2)'),
    width,
    align: aligned ? align : 'center',
    join: joinRaw === 'round' ? 'round' : (joinRaw === 'bevel' ? 'bevel' : 'miter'),
    cap: (() => { const c = String(get('stroke-linecap') || el.getAttribute('stroke-linecap') || 'butt').toLowerCase(); return c === 'round' || c === 'square' ? c : 'butt'; })(),
    miterLimit: parseFloat(get('stroke-miterlimit') || el.getAttribute('stroke-miterlimit')) || 4,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    dashed: !!(get('stroke-dasharray') && get('stroke-dasharray') !== 'none'),
  };
}

function executeOutlineStroke(editor) {
  const sc = editor.svgCanvas;
  if (!sc) return false;
  const selElems = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
  const leaves = collectLeaves(selElems);
  if (!leaves.length) { alert('Please select one or more stroked paths to outline.'); return false; }
  if (!window.paper) { alert('Outline Stroke requires Paper.js.'); return false; }

  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
  const batchCmd = new BatchCommand('Outline Stroke');
  const created = [];
  const scope = newScope();
  try {
    for (const el of leaves) {
      const spec = readStrokeSpec(el);
      if (!spec) continue;
      const item = pathItemFromElement(scope, el);
      if (!item) continue;
      const outline = outlineItem(scope, item, spec.width, spec);
      if (!outline) continue;
      const { d } = exportD(outline);
      if (!d.trim()) continue;

      const anchor = anchorOf(el);
      const cs = getComputedStyle(el);
      const fillPaint = resolveElementPaint(el, 'fill', { getComputedStyle: (e) => getComputedStyle(e) });
      const hasFill = fillPaint && !fillPaint.none;
      const mk = (attrs) => { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('id', sc.getNextId()); for (const [k, v] of Object.entries(attrs)) if (v != null) p.setAttribute(k, v); return p; };
      const strokePath = mk({ d, fill: spec.color, 'fill-rule': 'nonzero', stroke: 'none', 'fill-opacity': spec.opacity < 1 ? String(spec.opacity) : null });
      let top = strokePath;
      if (hasFill) {
        // Illustrator: a group of the fill shape and the outlined stroke.
        const src = exportD(item);
        const fillOpacity = parseFloat(cs.getPropertyValue('fill-opacity'));
        const fillVal = fillPaint.hex || el.getAttribute('fill') || cs.getPropertyValue('fill');
        const fillPath = mk({ d: src.d, fill: fillVal, 'fill-rule': cs.getPropertyValue('fill-rule') || el.getAttribute('fill-rule') || 'nonzero', stroke: 'none', 'fill-opacity': Number.isFinite(fillOpacity) && fillOpacity < 1 ? String(fillOpacity) : null });
        top = document.createElementNS(SVG_NS, 'g');
        top.setAttribute('id', sc.getNextId());
        top.append(fillPath, strokePath);
      }
      const op = parseFloat(cs.getPropertyValue('opacity'));
      if (Number.isFinite(op) && op < 1) top.setAttribute('opacity', String(op));
      const wt = wrapTransform(el);
      if (wt) top.setAttribute('transform', wt);

      anchor.parentNode.insertBefore(top, anchor.nextSibling);
      batchCmd.addSubCommand(new InsertElementCommand(top));
      const next = anchor.nextSibling; const parent = anchor.parentNode;
      anchor.remove();
      batchCmd.addSubCommand(new RemoveElementCommand(anchor, next, parent));
      created.push(top);
    }
    if (!created.length) {
      alert('No stroked paths found. Make sure selected objects have a visible stroke.');
      return false;
    }
    finishBatch(sc, batchCmd, selElems, created);
    return true;
  } catch (err) {
    console.error('Outline Stroke error:', err);
    alert('Outline Stroke error: ' + (err.message || err));
    return false;
  } finally {
    scope.project?.clear();
    scope.remove?.();
  }
}

// ─── Mount ───────────────────────────────────────────────────────────────────
/**
 * Register Offset Path with the Visteras menu system.
 * @param {object} editor - SVG-Edit Editor instance.
 */
export function mountOffsetPath(editor) {
  // Build the dialog once the DOM is ready
  buildDialog();

  // Wire dialog OK button
  document.getElementById(`${DIALOG_ID}-ok`)?.addEventListener('click', () => {
    const opts = readDialogValues();
    hideDialog();
    executeOffsetPath(editor, opts);
  });

  document.getElementById(`${DIALOG_ID}-cancel`)?.addEventListener('click', hideDialog);

  // Menu item: Object → Offset Path…
  document.getElementById('action_offset_path')?.addEventListener('click', () => {
    const sc = editor.svgCanvas;
    const selElems = (sc?.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
    if (!selElems.length) {
      alert('Please select one or more paths to offset.');
      return;
    }
    showDialog();
  });

  // Menu item: Object → Outline Stroke
  document.getElementById('action_outline_stroke')?.addEventListener('click', () => {
    executeOutlineStroke(editor);
  });

  // Keyboard: ⌥⌘O
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyO') {
      e.preventDefault();
      document.getElementById('action_offset_path')?.click();
    }
  }, true);
}

export default mountOffsetPath;
