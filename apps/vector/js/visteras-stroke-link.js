/**
 * Visteras Vector — linked stroke colour and stroke weight (Illustrator rule).
 *
 * 1. Stroke colour → none (from any source) ⇒ stroke weight = 0, and the
 *    Inside/Outside stroke-align rendering (helper, clip/mask defs, wrap,
 *    data attributes) is removed completely.
 * 2. Stroke weight 0 → >0 while the stroke is none ⇒ stroke colour = #000000.
 *
 * Where it lives (implemented once, not per source):
 * • Objects: a MutationObserver on svgroot watches stroke / stroke-width /
 *   stroke-align attributes of artwork in #svgcontent. Every writer (colour
 *   system wells, swatches, picker, None buttons, stock svgCanvas.setColor /
 *   setStrokeWidth / changeSelectedAttribute, Eyedropper, Direct Selection
 *   DOM writes, live steppers/typing) ends up as attribute mutations, so the
 *   rule sees them all. Each record batch is diffed (value before the batch
 *   → now) per element, using the *effective* stroke (the stored paint for
 *   Inside/Outside bodies, whose own stroke attr is always none).
 * • Undo: undoMgr.addCommandToHistory is wrapped to remember the command
 *   added in the current task. If the triggering change was recorded, the
 *   paired change is merged into that same history entry (one undo/redo
 *   step). If it was a live/no-undo write (steppers, typing), one history
 *   entry covering both the change and the paired change is added.
 * • Defaults (nothing selected): accessors on svgCanvas.curShape / curText
 *   (stroke, stroke_width) batch writes per microtask and apply the same rule
 *   to the defaults, then refresh the wells and weight fields.
 * • Loop guard: the rule's own writes, undo/redo and history resyncs run with
 *   the guard up and their mutation records are discarded (takeRecords), and
 *   the rule is idempotent (its results never satisfy the other trigger).
 */

const STROKE_ALIGN_ATTR = 'data-visteras-stroke-align';
const STROKE_WEIGHT_ATTR = 'data-visteras-stroke-weight';
const STROKE_PAINT_ATTR = 'data-visteras-stroke-paint';
const STROKE_HELPER_ATTR = 'data-visteras-stroke-align-helper';
const STROKE_WRAP_ATTR = 'data-visteras-sa-wrap';
const STROKE_BODY_ATTR = 'data-visteras-sa-body';
const STROKE_CLIP_ATTR = 'data-visteras-sa-clip';
const STROKE_MASK_ATTR = 'data-visteras-sa-mask';

export const BLACK = '#000000';
/** Attributes the observer watches. */
export const WATCHED_ATTRS = ['stroke', 'stroke-width', STROKE_ALIGN_ATTR, STROKE_WEIGHT_ATTR, STROKE_PAINT_ATTR];
/** Everything stroke-align leaves on a body. */
export const ALIGN_STATE_ATTRS = [STROKE_ALIGN_ATTR, STROKE_WEIGHT_ATTR, STROKE_PAINT_ATTR, STROKE_BODY_ATTR, STROKE_CLIP_ATTR, STROKE_MASK_ATTR];
const ALIGN_RECORD = [...ALIGN_STATE_ATTRS, 'stroke', 'stroke-width', 'clip-path', 'mask', 'transform'];

const LEAF_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'tspan', 'textPath', 'use']);

// ─── Pure helpers ────────────────────────────────────────────────────────────
export function isNonePaint(v) {
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return s === '' || s === 'none' || s === 'transparent';
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Effective stroke state from an attribute getter.
 * Inside/Outside bodies paint the stroke through a helper: their stroke attr
 * is none, the real paint is data-visteras-stroke-paint and the user weight
 * is data-visteras-stroke-weight.
 * @param {(name:string)=>string|null} get
 * @returns {{stroke:string|null, width:number|null, aligned:boolean}}
 */
export function effectiveStroke(get) {
  const align = String(get(STROKE_ALIGN_ATTR) || 'center').toLowerCase();
  const aligned = align === 'inside' || align === 'outside';
  const paint = get(STROKE_PAINT_ATTR);
  const stroke = aligned && paint != null && paint !== '' ? paint : get('stroke');
  const width = aligned && num(get(STROKE_WEIGHT_ATTR)) != null ? num(get(STROKE_WEIGHT_ATTR)) : num(get('stroke-width'));
  return { stroke: stroke == null ? null : String(stroke), width, aligned };
}

/**
 * The rule. prev/cur are effective states. prev.stroke === null means
 * "unknown/unset before" (never triggers rule 1); prev.width === null means
 * unknown (never triggers rule 2).
 * @returns {'stroke-none'|'weight-up'|null}
 */
export function decideStrokeLink(prev, cur) {
  if (!prev || !cur) return null;
  if (prev.stroke != null && !isNonePaint(prev.stroke) && isNonePaint(cur.stroke)) return 'stroke-none';
  if (prev.width === 0 && cur.width != null && cur.width > 0 && isNonePaint(cur.stroke)) return 'weight-up';
  return null;
}

/**
 * Reconstruct an element's attribute values as they were before a batch of
 * MutationRecords: the first oldValue seen per attribute wins.
 * @param {Array<{attributeName:string, oldValue:string|null}>} records (for one element, in order)
 * @returns {Map<string,string|null>}
 */
export function oldValuesFromRecords(records) {
  const m = new Map();
  for (const r of records) if (r.attributeName && !m.has(r.attributeName)) m.set(r.attributeName, r.oldValue);
  return m;
}

/** Defaults (curShape) rule: same decision on {stroke, stroke_width}. */
export function decideDefaults(prev, cur) {
  return decideStrokeLink(
    { stroke: prev.stroke == null ? null : String(prev.stroke), width: num(prev.stroke_width) },
    { stroke: cur.stroke == null ? 'none' : String(cur.stroke), width: num(cur.stroke_width) },
  );
}

/**
 * Paired defaults change for a decision.
 * @returns {object|null} properties to assign on curShape
 */
export function defaultsPatch(decision) {
  if (decision === 'stroke-none') return { stroke_width: 0, _visterasStrokeAlign: 'center' };
  if (decision === 'weight-up') return { stroke: BLACK };
  return null;
}

// ─── Mount ───────────────────────────────────────────────────────────────────
/**
 * @param {object} svgEditor
 * @param {object} [ctrl] colour controller (window.__visterasColorSystem)
 */
export function mountStrokeLink(svgEditor, ctrl = null) {
  const sc = svgEditor?.svgCanvas;
  if (!sc || window.__visterasStrokeLinkMounted) return window.__visterasStrokeLink || null;
  window.__visterasStrokeLinkMounted = true;
  const api = () => ctrl || window.__visterasColorSystem || null;
  const undoMgr = sc.undoMgr;
  const { BatchCommand, ChangeElementCommand } = sc.history || {};
  const root = sc.getSvgRoot?.() || document.getElementById('svgroot');
  if (!undoMgr || !BatchCommand || !ChangeElementCommand || !root) return null;

  let guard = 0;
  const stats = { objectRuns: 0, defaultRuns: 0, merged: 0, standalone: 0 };
  const content = () => sc.getSvgContent?.() || document.getElementById('svgcontent');

  const readAlign = (el) => {
    const a = String(el.getAttribute(STROKE_ALIGN_ATTR) || 'center').toLowerCase();
    return a === 'inside' || a === 'outside' ? a : 'center';
  };
  const readWeight = (el) => api()?.readElementStrokeWeight?.(el) ?? num(el.getAttribute(STROKE_WEIGHT_ATTR)) ?? num(el.getAttribute('stroke-width')) ?? 1;
  const hasAlignState = (el) => ALIGN_STATE_ATTRS.some((n) => el.hasAttribute(n))
    || !!el.parentNode?.getAttribute?.(STROKE_WRAP_ATTR);

  /** Re-render / clear stroke-align after undo or redo restored attributes. */
  const resyncAlign = (els) => {
    const a = api();
    if (!a?.applyStrokeAlignToElement) return;
    for (const el of els) {
      if (!el?.isConnected) continue;
      try {
        const align = readAlign(el);
        if (align !== 'center') {
          a.applyStrokeAlignToElement(el, sc, { align, userWidth: readWeight(el) });
        } else if (hasAlignState(el) || el.parentNode?.getAttribute?.(STROKE_WRAP_ATTR)) {
          const snap = {};
          ALIGN_RECORD.forEach((n) => { snap[n] = el.getAttribute(n); });
          a.applyStrokeAlignToElement(el, sc, { align: 'center', userWidth: readWeight(el) });
          for (const [n, v] of Object.entries(snap)) {
            if (v == null) el.removeAttribute(n); else el.setAttribute(n, v);
          }
        }
      } catch { /* ignore */ }
    }
  };

  class StrokeLinkCommand extends BatchCommand {
    constructor(text, alignEls = [], live = false) {
      super(text);
      this.alignEls = alignEls;
      this.live = live;
    }
    apply(handler) {
      guard++;
      try { super.apply(handler); resyncAlign(this.alignEls); this.syncUi(); } finally { discard(); guard--; }
    }
    unapply(handler) {
      guard++;
      try {
        // Live (no-undo) sources keep writing after the trigger (typing "2"
        // then "25", stepping on): redo should restore the latest values.
        if (this.live) {
          for (const c of this.stack) {
            if (c?.newValues && c.elem) for (const n of Object.keys(c.newValues)) c.newValues[n] = c.elem.getAttribute(n);
          }
        }
        super.unapply(handler);
        resyncAlign(this.alignEls);
        this.syncUi();
      } finally { discard(); guard--; }
    }
    syncUi() {
      const els = (() => { try { return this.elements().filter((el) => el?.isConnected); } catch { return []; } })();
      try { if (els.length) sc.call?.('changed', els); } catch { /* ignore */ }
      refreshUi();
      // Undo/redo repopulates layers and drops the selection: keep the
      // affected objects selected so the wells/weight show their values.
      setTimeout(() => {
        const live = els.filter((el) => el.isConnected);
        if (!live.length || (sc.getSelectedElements?.() || []).filter(Boolean).length) return;
        try { sc.addToSelection(live, true); } catch { /* ignore */ }
        refreshUi();
      }, 0);
    }
  }

  // ── History: remember the command added in this task ─────────────────────
  let fresh = null;
  const origAdd = undoMgr.addCommandToHistory.bind(undoMgr);
  undoMgr.addCommandToHistory = function (cmd) {
    origAdd(cmd);
    if (guard) return;
    fresh = cmd;
    setTimeout(() => { if (fresh === cmd) fresh = null; }, 0);
  };
  for (const name of ['undo', 'redo']) {
    const orig = undoMgr[name].bind(undoMgr);
    undoMgr[name] = function (...args) {
      // Undo/redo repopulates layers and drops the selection, so the wells
      // fell back to the defaults. Keep the selection that was active.
      const before = (sc.getSelectedElements?.() || []).filter((el) => el?.isConnected);
      guard++;
      try { return orig(...args); } finally {
        discard(); guard--; fresh = null;
        if (before.length) {
          setTimeout(() => {
            const live = before.filter((el) => el.isConnected && content()?.contains(el));
            const mode = String(sc.getMode?.() || 'select');
            if (mode !== 'select' && !/eyedrop/i.test(mode)) return;
            if (!live.length || (sc.getSelectedElements?.() || []).filter(Boolean).length) return;
            try { sc.addToSelection(live, true); } catch { /* ignore */ }
            refreshUi();
          }, 0);
        }
      }
    };
  }

  // ── Objects ───────────────────────────────────────────────────────────────
  const isArtwork = (el) => {
    const c = content();
    if (!el || el.nodeType !== 1 || !c || !c.contains(el) || el === c) return false;
    if (!LEAF_TAGS.has(el.nodeName)) return false;
    if (el.hasAttribute(STROKE_HELPER_ATTR)) return false;
    if (el.closest('defs, clipPath, mask, marker, pattern, symbol')) return false;
    return true;
  };
  const currentState = (el) => {
    const st = effectiveStroke((n) => el.getAttribute(n));
    if (st.stroke == null) {
      // Unset: resolve inheritance (group paint) from computed style.
      try { st.stroke = getComputedStyle(el).stroke || 'none'; } catch { st.stroke = 'none'; }
    }
    return st;
  };

  /** Apply the paired change to one element; returns the ChangeElementCommand. */
  const pairElement = (el, decision, olds, alignEls) => {
    const before = {};
    const rec = (n) => { if (!(n in before)) before[n] = olds.has(n) ? olds.get(n) : el.getAttribute(n); };
    // Record everything the triggering batch touched so a standalone entry
    // (live source) also reverts the trigger itself.
    for (const n of olds.keys()) rec(n);
    const a = api();
    if (decision === 'stroke-none') {
      if (hasAlignState(el)) {
        ALIGN_RECORD.forEach(rec);
        try { a?.applyStrokeAlignToElement?.(el, sc, { align: 'center', userWidth: readWeight(el) }); } catch { /* ignore */ }
        for (const n of ALIGN_STATE_ATTRS) el.removeAttribute(n);
        alignEls.push(el);
      }
      rec('stroke'); rec('stroke-width');
      el.setAttribute('stroke', 'none');
      el.setAttribute('stroke-width', '0');
    } else if (decision === 'weight-up') {
      const align = readAlign(el);
      if (align !== 'center' && a?.applyStrokeAlignToElement) {
        ALIGN_RECORD.forEach(rec);
        el.setAttribute(STROKE_PAINT_ATTR, BLACK);
        try { a.applyStrokeAlignToElement(el, sc, { align, userWidth: readWeight(el) }); } catch { /* ignore */ }
        alignEls.push(el);
      } else {
        rec('stroke');
        el.setAttribute('stroke', BLACK);
      }
    }
    return new ChangeElementCommand(el, before);
  };

  const processRecords = (records) => {
    if (guard || !records.length) return;
    // childList records are ignored: new elements have no "before" value
    // (null oldValue ⇒ unknown ⇒ never triggers), and re-inserted bodies
    // (stroke-align unwrap) must still be processed.
    const byEl = new Map();
    for (const r of records) {
      if (r.type !== 'attributes') continue;
      if (!byEl.has(r.target)) byEl.set(r.target, []);
      byEl.get(r.target).push(r);
    }
    const jobs = [];
    for (const [el, recs] of byEl) {
      if (!isArtwork(el)) continue;
      const olds = oldValuesFromRecords(recs);
      const prev = effectiveStroke((n) => (olds.has(n) ? olds.get(n) : el.getAttribute(n)));
      const cur = currentState(el);
      const decision = decideStrokeLink(prev, cur);
      if (!decision) continue;
      if (decision === 'stroke-none' && cur.width === 0 && !hasAlignState(el) && el.getAttribute('stroke') === 'none') continue;
      jobs.push({ el, decision, olds });
    }
    if (!jobs.length) return;
    guard++;
    try {
      const alignEls = [];
      const subs = jobs.map((j) => pairElement(j.el, j.decision, j.olds, alignEls));
      const els = jobs.map((j) => j.el);
      const top = undoMgr.undoStack?.[undoMgr.undoStackPointer - 1];
      const topEls = (() => { try { return fresh?.elements?.() || []; } catch { return []; } })();
      // Same task as a recorded command touching these objects ⇒ same user
      // action (e.g. a multi-selection where only some attrs were recorded).
      const mergeable = fresh && top === fresh && els.some((el) => topEls.includes(el) || topEls.some((t) => t?.contains?.(el)));
      if (mergeable) {
        const cmd = new StrokeLinkCommand(fresh.getText?.() || fresh.text || 'Change stroke', alignEls, false);
        cmd.addSubCommand(fresh);
        subs.forEach((s) => cmd.addSubCommand(s));
        undoMgr.undoStack[undoMgr.undoStackPointer - 1] = cmd;
        fresh = cmd;
        stats.merged++;
      } else {
        const text = jobs[0].decision === 'stroke-none' ? 'Stroke none (weight 0)' : 'Stroke weight (black stroke)';
        const cmd = new StrokeLinkCommand(text, alignEls, true);
        subs.forEach((s) => cmd.addSubCommand(s));
        origAdd(cmd);
        stats.standalone++;
      }
      stats.objectRuns++;
      window.__visterasLastStrokeLink = { decisions: jobs.map((j) => j.decision), ids: els.map((e) => e.id), merged: !!mergeable };
      try { sc.call?.('changed', els); } catch { /* ignore */ }
      refreshUi();
    } finally {
      discard();
      guard--;
    }
  };

  const observer = new MutationObserver(processRecords);
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: WATCHED_ATTRS });
  function discard() { try { observer.takeRecords(); } catch { /* ignore */ } }

  // ── UI refresh ─────────────────────────────────────────────────────────────
  function refreshUi() {
    try { svgEditor.bottomPanel?.updateColorpickers?.(true); } catch { /* ignore */ }
    try { api()?.syncFromCanvas?.(); } catch { /* ignore */ }
    try { window.__visterasUpdateSwatches?.(); } catch { /* ignore */ }
    try { window.__updatePropertiesVisibility?.(); } catch { /* ignore */ }
  }
  const setWeightFields = (w) => {
    const s = String(Math.round(Number(w) * 100) / 100);
    for (const id of ['stroke_width', 'vcs_app_stroke_weight']) {
      const input = document.getElementById(id);
      if (input) input.value = s;
    }
  };

  // ── Defaults (nothing selected) ──────────────────────────────────────────
  const hasSelection = () => {
    const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
    if (sel.length) return true;
    if (sc.directSelection?.active) return true;
    return !!sc.getPathObj?.()?.elem?.isConnected;
  };
  const pending = new Map(); // obj → prev snapshot
  const flushDefaults = () => {
    const entries = [...pending];
    pending.clear();
    if (guard) return;
    for (const [obj, prev] of entries) {
      if (hasSelection()) continue;
      const decision = decideDefaults(prev, { stroke: obj.stroke, stroke_width: obj.stroke_width });
      const patch = defaultsPatch(decision);
      if (!patch) continue;
      guard++;
      try {
        Object.assign(obj, patch);
        if (decision === 'weight-up') {
          obj.stroke_paint = { type: 'solidColor' };
          if (obj === sc.curProperties && sc.curShape && sc.curShape !== obj) sc.curShape.stroke = BLACK;
        }
        if (decision === 'stroke-none') setWeightFields(0);
        stats.defaultRuns++;
        window.__visterasLastStrokeLinkDefaults = { decision };
        refreshUi();
        if (decision === 'stroke-none') setWeightFields(0);
      } finally { guard--; }
    }
  };
  const hookDefaults = (obj) => {
    if (!obj || obj.__visterasStrokeLinkHooked) return;
    Object.defineProperty(obj, '__visterasStrokeLinkHooked', { value: true });
    for (const key of ['stroke', 'stroke_width']) {
      let value = obj[key];
      Object.defineProperty(obj, key, {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: (v) => {
          if (!guard && !pending.has(obj)) {
            pending.set(obj, { stroke: obj.stroke, stroke_width: obj.stroke_width });
            queueMicrotask(flushDefaults);
          }
          value = v;
        },
      });
    }
  };
  hookDefaults(sc.curShape);
  hookDefaults(sc.curText);

  const link = { stats, observer, flush: () => processRecords(observer.takeRecords()) };
  window.__visterasStrokeLink = link;
  return link;
}

export default mountStrokeLink;
