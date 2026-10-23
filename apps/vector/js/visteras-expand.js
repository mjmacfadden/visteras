/**
 * Visteras Vector — Object ▸ Expand… (Illustrator parity)
 *
 * Opens the Expand dialog (Object / Fill / Stroke). Checkboxes that don't apply to the selection
 * are disabled, as in Illustrator. OK expands as ONE undo step ('Expand'), reusing:
 * - Envelopes → Envelope Distort ▸ Expand (expandEnvelope), joined into this batch.
 * - Object: live text → Create Outlines (convertTextToOutlines); symbol instances → Break Link
 *   (breakLinkToSymbol).
 * - Stroke: Outline Stroke (outlineStrokeLeaves, the Object ▸ Path ▸ Outline Stroke engine).
 * - Fill: primitive shapes become <path> with the same paint (shapeToPathData).
 * Nothing hidden is left behind: originals are removed (and restored only by undo).
 */

import { convertTextToOutlines, isTextElement } from './visteras-text-outlines.js?v=character-styling-1';
import { outlineStrokeLeaves, collectLeaves } from './visteras-offset-path.js?v=expand-1';
import { breakLinkToSymbol } from './visteras-symbols-model.js?v=gap5-1';
import { isEnvelope } from './visteras-envelope-core.js?v=envelope-12';
import { ensureEnvelopeRendered } from './visteras-envelope-model.js?v=envelope-12';
import { expandEnvelope } from './visteras-envelope-actions.js?v=envelope-12';
import { shapeToPathData } from './visteras-envelope-warp.js?v=envelope-12';

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const LEAF_TAGS = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'];
const GEOMETRY = new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points']);

/** Checks if an element is a primitive SVG shape. */
export function isPrimitiveShape(el) {
  if (!el || el.nodeType !== 1) return false;
  return SHAPE_TAGS.has((el.tagName || el.localName || '').toLowerCase());
}

/** Checks if an element has a visible stroke. */
export function hasVisibleStroke(el) {
  if (!el || el.nodeType !== 1) return false;
  const stroke = el.getAttribute?.('stroke') || el.style?.stroke;
  if (!stroke || stroke === 'none') return false;
  const widthAttr = el.getAttribute?.('stroke-width') || el.style?.strokeWidth;
  if (widthAttr !== undefined && widthAttr !== null) {
    const w = parseFloat(widthAttr);
    if (!isNaN(w) && w <= 0) return false;
  }
  return true;
}

/** Visible fill (SVG's default fill is black, so a missing attribute counts). */
export function hasVisibleFill(el) {
  const f = el?.getAttribute?.('fill') ?? el?.style?.fill;
  return f == null || f === '' ? true : f !== 'none';
}

const inEnvelope = (el) => { for (let n = el?.parentNode; n && n.nodeType === 1; n = n.parentNode) if (isEnvelope(n)) return true; return false; };
const descendants = (el, tags) => (el.querySelectorAll ? [...el.querySelectorAll('*')] : []).filter((n) => tags.includes((n.localName || '').toLowerCase()) && (!inEnvelope(n) || inEnvelope(el)));
const live = (n) => !!n && (n.isConnected ?? !!n.parentNode);
const tagOf = (el) => (el?.localName || el?.tagName || '').toLowerCase();

/** Split the selection into what each Expand option would act on. */
export function expandTargets(elements) {
  const els = (elements || []).filter((el) => el && el.nodeType === 1);
  const envelopes = els.filter(isEnvelope);
  const rest = els.filter((el) => !isEnvelope(el));
  const texts = [], uses = [], leaves = [];
  const seen = new Set(), add = (list, n) => { if (!seen.has(n)) { seen.add(n); list.push(n); } };
  for (const el of rest) {
    if (isTextElement(el)) add(texts, el); else for (const t of descendants(el, ['text'])) add(texts, t);
    if (tagOf(el) === 'use') add(uses, el); else for (const u of descendants(el, ['use'])) add(uses, u);
    if (SHAPE_TAGS.has(tagOf(el)) || tagOf(el) === 'path') add(leaves, el);
    else if (tagOf(el) !== 'text' && tagOf(el) !== 'use') for (const l of descendants(el, LEAF_TAGS)) if (!l.closest?.('text')) add(leaves, l);
  }
  return { envelopes, texts, uses, leaves,
    stroked: leaves.filter(hasVisibleStroke),
    filled: leaves.filter((l) => isPrimitiveShape(l) && hasVisibleFill(l)) };
}

/** Which Expand checkboxes apply (Illustrator disables the rest). */
export function expandOptions(elements) {
  const t = expandTargets(elements);
  return {
    object: t.envelopes.length > 0 || t.texts.length > 0 || t.uses.length > 0,
    fill: t.filled.length > 0,
    stroke: t.stroked.length > 0,
  };
}

/** Expand… is enabled when at least one option applies. */
export function canExpand(elements) {
  const o = expandOptions(elements);
  return o.object || o.fill || o.stroke;
}

/** Primitive → <path> with the same paint and id, recorded in `batch`. */
function shapeToPath(sc, el, batch) {
  const H = sc.history || {};
  const attrs = {}; for (const a of [...(el.attributes || [])]) attrs[a.name] = a.value;
  const d = shapeToPathData(tagOf(el), attrs);
  if (!d) return null;
  const doc = el.ownerDocument || sc.doc;
  const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  for (const [k, v] of Object.entries(attrs)) if (!GEOMETRY.has(k)) p.setAttribute(k, v);
  p.setAttribute('d', d);
  const parent = el.parentNode, next = el.nextSibling;
  parent.insertBefore(p, el);
  el.remove();
  if (H.RemoveElementCommand) batch?.addSubCommand(new H.RemoveElementCommand(el, next, parent));
  if (H.InsertElementCommand) batch?.addSubCommand(new H.InsertElementCommand(p));
  return p;
}

const batchHasWork = (b) => !!b && ((b.sub_commands?.length || 0) + (b.stack?.length || 0) > 0 || (typeof b.isEmpty === 'function' && !b.isEmpty()));

/**
 * Expand the selection as ONE undo step.
 * @param {object} editor - SVG-Edit Editor instance
 * @param {Element[]} [targetElements] - defaults to the current selection
 * @param {{object?:boolean, fill?:boolean, stroke?:boolean}} [choice] - defaults to every option that applies
 */
export async function expandSelection(editor, targetElements = null, choice = null) {
  const sc = editor?.svgCanvas;
  if (!sc) return null;
  const elements = (targetElements || (sc.getSelectedElements ? sc.getSelectedElements() : [])).filter(Boolean);
  if (!elements.length) return null;
  const allowed = expandOptions(elements);
  const want = { ...allowed, ...(choice || {}) };
  for (const k of ['object', 'fill', 'stroke']) want[k] = !!(want[k] && allowed[k]);
  const t = expandTargets(elements);
  const doc = sc.doc || (typeof document !== 'undefined' ? document : null);
  const H = sc.history || {};
  const batch = H.BatchCommand ? new H.BatchCommand('Expand') : null;
  const results = [];
  const replaced = new Map(); // top-level selected element → its replacement
  const topOf = (n) => elements.find((el) => el === n || el.contains?.(n));
  const note = (orig, repl) => { const top = topOf(orig); if (top && (top === orig || !live(top))) replaced.set(top, repl); };

  if (want.object) {
    // Envelopes: exactly Envelope Distort ▸ Expand, inside this batch.
    for (const env of t.envelopes) {
      await ensureEnvelopeRendered(sc, env);
      if (!live(env)) continue;
      const g = expandEnvelope(sc, env, { batch });
      if (g) note(env, g);
    }
    // Live text → outlines (Create Outlines).
    for (const tEl of t.texts) {
      const parent = tEl.parentNode; if (!parent) continue;
      const next = tEl.nextSibling;
      const group = await convertTextToOutlines(tEl, doc);
      if (!group) continue;
      parent.insertBefore(group, next);
      tEl.remove();
      if (H.RemoveElementCommand) batch?.addSubCommand(new H.RemoveElementCommand(tEl, next, parent));
      if (H.InsertElementCommand) batch?.addSubCommand(new H.InsertElementCommand(group));
      note(tEl, group);
    }
    // Symbol instances: Object breaks the link (Illustrator).
    for (const u of t.uses) {
      if (!live(u)) continue;
      const r = breakLinkToSymbol(sc, u, { batch, select: false });
      if (!r?.group) continue;
      note(u, r.group);
      // The instance's artwork is now ordinary objects: Fill / Stroke apply to it too.
      const inner = expandTargets([r.group]);
      t.filled.push(...inner.filled); t.stroked.push(...inner.stroked);
    }
  }
  // Stroke → filled outline paths (Outline Stroke engine). Its output is already paths.
  const outlined = new Set();
  if (want.stroke) {
    for (const l of collectLeaves(t.stroked.filter(live))) {
      const [out] = outlineStrokeLeaves(sc, [l], batch);
      if (out) { outlined.add(l); note(l, out); }
    }
  }
  // Fill: primitive shapes become paths with the same paint.
  if (want.fill) {
    for (const l of t.filled) {
      if (!live(l) || outlined.has(l)) continue;
      const p = shapeToPath(sc, l, batch);
      if (p) note(l, p);
    }
  }

  if (batchHasWork(batch)) sc.addCommandToHistory(batch);
  for (const el of elements) {
    const r = replaced.get(el) || (live(el) ? el : null);
    if (r && live(r) && !results.includes(r)) results.push(r);
  }
  if (results.length) {
    sc.clearSelection?.();
    sc.addToSelection?.(results, true);
    sc.call?.('changed', results);
  }
  return results;
}

/* ── Dialog ─────────────────────────────────────────────────────────── */
let dialogs = null;
const loadDialogs = () => (dialogs ||= import('./visteras-envelope-dialogs.js?v=envelope-12'));

/** Object ▸ Expand… dialog: Object / Fill / Stroke (inapplicable ones disabled), OK / Cancel. */
export async function openExpandDialog(editor) {
  const sc = editor?.svgCanvas;
  const elements = (sc?.getSelectedElements?.() || []).filter(Boolean);
  if (!canExpand(elements) || document.getElementById('visteras_expand_dialog')) return null;
  const { ensureStyle, mountMovable } = await loadDialogs();
  ensureStyle();
  const opts = expandOptions(elements);
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'visteras_modal_overlay venv_modal'; overlay.id = 'visteras_expand_dialog';
  const row = (k, label) => `<label style="display:flex;align-items:center;gap:8px${opts[k] ? '' : ';opacity:.45'}"><input type="checkbox" id="vexpand_${k}"${opts[k] ? ' checked' : ' disabled'}> ${label}</label>`;
  overlay.innerHTML = `
  <div class="visteras_modal" role="dialog" aria-modal="true" aria-labelledby="vexpand_title" style="width:260px">
    <div class="visteras_modal_header"><span id="vexpand_title">Expand</span>
      <button type="button" class="floating_panel_close" id="vexpand_close" aria-label="Close">×</button></div>
    <div class="visteras_modal_body" style="padding:12px 14px;display:flex;flex-direction:column;gap:8px">
      <div style="color:#aaa;font-size:12px">Expand</div>
      ${row('object', 'Object')}${row('fill', 'Fill')}${row('stroke', 'Stroke')}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
        <button type="button" id="vexpand_cancel" class="vui-btn">Cancel</button>
        <button type="button" id="vexpand_ok" class="vui-btn vui-btn-primary">OK</button></div>
    </div></div>`;
  const $ = (s) => overlay.querySelector(s);
  return new Promise((resolve) => {
    let closed = false;
    const sync = () => { $('#vexpand_ok').disabled = !['object', 'fill', 'stroke'].some((k) => $(`#vexpand_${k}`).checked); };
    const close = async (commit) => {
      if (closed) return; closed = true;
      const choice = { object: $('#vexpand_object').checked, fill: $('#vexpand_fill').checked, stroke: $('#vexpand_stroke').checked };
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previous?.focus?.();
      resolve(commit ? await expandSelection(editor, elements, choice) : null);
    };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(false); }
      else if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); e.stopImmediatePropagation(); if (!$('#vexpand_ok').disabled) close(true); }
    };
    for (const k of ['object', 'fill', 'stroke']) $(`#vexpand_${k}`).onchange = sync;
    $('#vexpand_ok').onclick = () => close(true);
    $('#vexpand_cancel').onclick = () => close(false);
    $('#vexpand_close').onclick = () => close(false);
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    sync();
    mountMovable(overlay, sc, { targets: elements });
    $('#vexpand_ok').focus();
  });
}

/** Mounts Object ▸ Expand… and Expand Appearance. */
export function mountExpand(editor) {
  const expandBtn = document.getElementById('action_expand');
  const sc = editor?.svgCanvas;
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      updateMenuState();
      if (expandBtn.classList.contains('disabled')) return;
      openExpandDialog(editor);
    });
  }
  function updateMenuState() {
    if (!sc || !expandBtn) return;
    {
      const selected = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
      const enabled = canExpand(selected);
      expandBtn.classList.toggle('disabled', !enabled);
      expandBtn.setAttribute('aria-disabled', String(!enabled));
    }
  }
  if (sc && expandBtn) {
    // Selection events can be suppressed (addToSelection(…, true)); refresh when the menu opens too.
    expandBtn.closest('.menu_entry')?.addEventListener('pointerenter', updateMenuState);
    sc.bind?.('selectedChanged', updateMenuState);
    sc.bind?.('changed', updateMenuState);
    updateMenuState();
  }
}

export default mountExpand;
