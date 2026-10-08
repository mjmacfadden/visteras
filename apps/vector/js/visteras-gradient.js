/**
 * Visteras Vector — Gradients (Illustrator UX): Window ▸ Gradient panel (⌘F9),
 * Gradient tool (G) with on-canvas annotator, Color / Gradient / None buttons
 * in the Tools panel, gradient swatches, flip support.
 *
 * Data model: visteras-gradient-model.js (objectBoundingBox + per-object
 * gradientTransform). Rules:
 *  - never edit a committed gradient in place: every committed gesture writes a
 *    FRESH <linearGradient|radialGradient> per target object and repoints the
 *    paint (shared references from duplicates / eyedropper stay safe);
 *  - one gesture = one BatchCommand('Gradient'): InsertElementCommand per new
 *    gradient + ChangeElementCommand per paint attribute (built after the write);
 *  - never sc.setGradient / sc.setPaint (their dedupe ignores gradientTransform).
 */
import {
  GRADIENT_ATTR, MID_STOP_ATTR, MIDPOINT_ATTR, GRADIENT_PRESETS,
  GRADIENT_SWATCHES_KEY, GRADIENT_LAST_KEY, GRADIENT_ANNOTATOR_KEY,
  normalizeModel, defaultModel, fitLinear, fitRadial, encodeGradient, decodeGradient,
  modelPoints, modelFromPoints, modelFromDocument, flipModel, direction, angleOf, snapAngle,
  addStop, deleteStop, duplicateStop, swapStops, moveStop, reverseStops,
  cssGradient, parseSwatchList, swatchFromModel, normalizeSwatch, normalizeColor,
  multiply, invert, apply as applyM, translate, IDENTITY, MID_MIN, MID_MAX,
} from './visteras-gradient-model.js?v=gradient-2';
import { mountGradientPanel } from './visteras-gradient-panel.js?v=gradient-2';
import { mountGradientTool } from './visteras-gradient-tool.js?v=gradient-2';

const NS = 'http://www.w3.org/2000/svg';
export const MODE = 'gradient';
const DRAG_DELETE_PX = 20;
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M15 6a7 7 0 1 0 1.5 6" fill="none" stroke="#000" stroke-width="3"/><path d="M15 6a7 7 0 1 0 1.5 6" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M12.5 2.5 16 6l-4.2 1.4z" fill="#fff" stroke="#000" stroke-width=".8"/></svg>')}") 10 10, alias`;
const DEFAULT_LAST = Object.freeze({ type: 'linear', angle: 0, aspect: 100, stops: GRADIENT_PRESETS[0].stops });

const asM = (m) => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f });
const r1 = (n) => Math.round(n * 10) / 10;
const escName = (s) => String(s).replace(/[<&>"]/g, '');

/** Shared core: reading, sessions (preview → one BatchCommand), storage. */
export function createGradientCore(editor) {
  const sc = editor.svgCanvas;
  const cs = () => window.__visterasColorSystem;
  const activeAttr = () => (cs()?.getActiveTarget?.() === 'stroke' ? 'stroke' : 'fill');
  const content = () => sc.getSvgContent?.() || document.getElementById('svgcontent');
  const defs = () => sc.findDefs?.();

  /* ───────────── storage ───────────── */
  const loadJSON = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  let userSwatches = parseSwatchList(localStorage.getItem(GRADIENT_SWATCHES_KEY));
  const saveSwatches = () => { try { localStorage.setItem(GRADIENT_SWATCHES_KEY, JSON.stringify(userSwatches)); } catch { /* ignore */ } };
  let last = normalizeSwatch({ id: 'last', ...(loadJSON(GRADIENT_LAST_KEY, null) || DEFAULT_LAST) }) || normalizeSwatch({ id: 'last', ...DEFAULT_LAST });
  const saveLast = (m) => {
    if (!m) return;
    last = normalizeSwatch({ id: 'last', type: m.type, angle: m.angle, aspect: m.aspect, stops: m.stops });
    try { localStorage.setItem(GRADIENT_LAST_KEY, JSON.stringify(last)); } catch { /* ignore */ }
  };
  let annotatorOn = localStorage.getItem(GRADIENT_ANNOTATOR_KEY) !== '0';

  /* ───────────── reading ───────────── */
  const bboxOf = (el) => { try { const b = el.getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; } catch { return null; } };
  const hasArea = (el) => { const b = bboxOf(el); return !!b && b.width > 1e-6 && b.height > 1e-6; };
  const paintKey = (el, attr) => cs()?.paintKeyFor?.(el, attr) || attr;
  const refOf = (v) => { const m = /url\(\s*["']?[^"')]*?#([^"')\s]+)["']?\s*\)/.exec(v || ''); return m ? m[1] : null; };
  const byId = (id) => (id ? (content()?.querySelector(`[id="${CSS.escape(id)}"]`) || document.getElementById(id)) : null);
  const isGradientNode = (n) => !!n && /^(linear|radial)gradient$/i.test(n.tagName || '');
  function gradientNodeFor(el, attr) {
    const n = byId(refOf(el?.getAttribute?.(paintKey(el, attr))));
    return isGradientNode(n) ? n : null;
  }
  function specOf(node) {
    if (!node) return null;
    const attrs = {};
    for (const a of node.attributes) attrs[a.name] = a.value;
    let stopNodes = [...node.children].filter((c) => (c.tagName || '').toLowerCase() === 'stop');
    if (!stopNodes.length) { // xlink:href template (SVG-Edit / third-party)
      const tpl = byId(String(node.getAttribute('href') || node.getAttribute('xlink:href') || '').replace(/^#/, ''));
      if (tpl) stopNodes = [...tpl.children].filter((c) => (c.tagName || '').toLowerCase() === 'stop');
    }
    const styleProp = (n, p) => { const m = new RegExp(`(?:^|;)\\s*${p}\\s*:\\s*([^;]+)`).exec(n.getAttribute('style') || ''); return m ? m[1].trim() : null; };
    const stops = stopNodes.map((s) => ({
      offset: s.getAttribute('offset'),
      color: s.getAttribute('stop-color') || styleProp(s, 'stop-color') || '#000000',
      opacity: s.getAttribute('stop-opacity') ?? styleProp(s, 'stop-opacity'),
      midpoint: s.getAttribute(MIDPOINT_ATTR),
      synthetic: s.hasAttribute(MID_STOP_ATTR),
    }));
    return { tag: node.tagName, attrs, stops };
  }
  function readModel(el, attr = activeAttr()) {
    const node = gradientNodeFor(el, attr);
    const bbox = bboxOf(el);
    if (!node || !bbox) return null;
    try { return decodeGradient(specOf(node), bbox); } catch { return null; }
  }
  const solidOf = (el, attr) => {
    const v = el?.getAttribute?.(paintKey(el, attr));
    if (!v || v === 'none' || v.startsWith('url(')) return null;
    return normalizeColor(v, null) || null;
  };
  /** Illustrator: choosing a gradient on a solid fill seeds the first stop with that colour. */
  function seedModel(el, attr, overrides = {}) {
    const bbox = bboxOf(el) || { x: 0, y: 0, width: 1, height: 1 };
    const base = { ...last, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) };
    const stops = (overrides.stops || last.stops).map((s) => ({ ...s }));
    const solid = overrides.stops ? null : solidOf(el, attr);
    if (solid && stops[0]) stops[0].c = solid;
    return defaultModel(bbox, { type: base.type, angle: base.angle, aspect: base.aspect, stops });
  }

  const docMatrix = (el) => {
    const c = content()?.getScreenCTM(), e = el.getScreenCTM?.();
    if (!c || !e) return IDENTITY;
    return multiply(invert(asM(c)) || IDENTITY, asM(e));
  };
  const clientToDoc = (x, y) => applyM(invert(asM(content().getScreenCTM())) || IDENTITY, { x, y });

  /* ───────────── targets ───────────── */
  function targets(attr = activeAttr()) {
    const all = cs()?.paintTargets?.(attr) || (sc.getSelectedElements?.() || []).filter(Boolean);
    return all.filter((el) => el?.isConnected && hasArea(el));
  }
  const zeroAreaOnly = (attr = activeAttr()) => {
    const all = cs()?.paintTargets?.(attr) || [];
    return all.length > 0 && !all.some(hasArea);
  };

  /* ───────────── writing (sessions) ───────────── */
  function buildNode(enc, id) {
    const node = document.createElementNS(NS, enc.tag);
    node.setAttribute('id', id);
    for (const [k, v] of Object.entries(enc.attrs)) node.setAttribute(k, String(v));
    for (const s of enc.stops) {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', String(s.offset));
      stop.setAttribute('stop-color', s.color);
      stop.setAttribute('stop-opacity', String(s.opacity));
      if (s.synthetic) stop.setAttribute(MID_STOP_ATTR, '1');
      if (s.midpoint != null) stop.setAttribute(MIDPOINT_ATTR, String(s.midpoint));
      node.append(stop);
    }
    return node;
  }
  const liveSyncAlign = (els) => { try { window.__visterasLiveSyncStrokeAlign?.(els, sc); } catch { /* ignore */ } };

  /**
   * A gesture. update() previews on fresh, uncommitted gradient nodes (no
   * history); commit() records one BatchCommand; cancel() restores.
   */
  function beginSession(entries) {
    const items = entries.map(({ el, attr }) => {
      const key = paintKey(el, attr);
      return { el, attr, key, prevValue: el.getAttribute(key), prevNode: gradientNodeFor(el, attr), node: null, id: null, model: null };
    });
    let done = false;
    return {
      items,
      update(modelFor) {
        if (done) return;
        const d = defs();
        for (const item of items) {
          const model = modelFor(item);
          const bbox = bboxOf(item.el);
          const enc = model && bbox ? encodeGradient(model, bbox) : null;
          if (!enc) continue;
          if (!item.id) item.id = sc.getNextId();
          const node = buildNode(enc, item.id);
          if (item.node?.isConnected) item.node.replaceWith(node); else d.append(node);
          item.node = node;
          item.model = normalizeModel(model);
          if (item.el.getAttribute(item.key) !== `url(#${item.id})`) item.el.setAttribute(item.key, `url(#${item.id})`);
        }
        liveSyncAlign(items.filter((i) => i.node).map((i) => i.el));
        window.__visterasUpdateSwatches?.();
      },
      commit(label = 'Gradient') {
        if (done) return null;
        done = true;
        const written = items.filter((i) => i.node);
        if (!written.length) return null;
        const { BatchCommand, InsertElementCommand } = sc.history;
        const batch = new BatchCommand(label);
        const d = defs();
        // Insert commands with nextSibling = null so redo never depends on other defs.
        for (const i of written) { i.node.remove(); if (i.prevValue == null) i.el.removeAttribute(i.key); else i.el.setAttribute(i.key, i.prevValue); }
        for (const i of written) { d.append(i.node); batch.addSubCommand(new InsertElementCommand(i.node, label)); }
        for (const attr of ['fill', 'stroke']) {
          const group = written.filter((i) => i.attr === attr);
          if (!group.length) continue;
          const map = new Map(group.map((i) => [i.el, `url(#${i.id})`]));
          cs()?.applyPaintToElements?.(attr, (el) => map.get(el), { batch, elements: group.map((i) => i.el) });
        }
        // removeUnusedDefElems purges unreferenced gradients on every save; put
        // whichever side is needed back into <defs> before re-pointing.
        const prevNodes = written.map((i) => i.prevNode).filter(Boolean);
        const newNodes = written.map((i) => i.node);
        const ensure = (nodes) => { const dd = defs(); for (const n of nodes) if (n && !n.isConnected && dd) dd.append(n); };
        const origApply = batch.apply.bind(batch), origUnapply = batch.unapply.bind(batch);
        batch.apply = (h) => { origApply(h); ensure(newNodes); };
        batch.unapply = (h) => { ensure(prevNodes); origUnapply(h); };
        if (!batch.isEmpty()) sc.addCommandToHistory(batch);
        saveLast(written[written.length - 1].model);
        sc.call('changed', written.map((i) => i.el));
        window.__visterasUpdateSwatches?.();
        return batch;
      },
      cancel() {
        if (done) return;
        done = true;
        for (const i of items) {
          if (!i.node) continue;
          i.node.remove();
          if (i.prevValue == null) i.el.removeAttribute(i.key); else i.el.setAttribute(i.key, i.prevValue);
        }
        liveSyncAlign(items.map((i) => i.el));
        window.__visterasUpdateSwatches?.();
      },
    };
  }

  /** One-shot write: model per element → one undo step. */
  function applyModels(els, attr, modelFor, label = 'Gradient') {
    if (!els.length) return null;
    const s = beginSession(els.map((el) => ({ el, attr })));
    s.update((item) => modelFor(item.el));
    return s.commit(label);
  }

  const toastMsg = (msg) => { try { window.__visterasToast?.(msg); } catch { /* ignore */ } if (!window.__visterasToast) console.info('[gradient]', msg); };
  return { sc, content, cs, activeAttr, targets, zeroAreaOnly, beginSession, applyModels, readModel, seedModel, bboxOf, docMatrix, clientToDoc, gradientNodeFor, specOf, byId, isGradientNode, saveLast, getLast: () => last, setLast: (m) => saveLast(m), loadSwatches: () => userSwatches, setSwatches: (l) => { userSwatches = l; saveSwatches(); }, getAnnotator: () => annotatorOn, setAnnotatorPref: (on) => { annotatorOn = !!on; try { localStorage.setItem(GRADIENT_ANNOTATOR_KEY, annotatorOn ? '1' : '0'); } catch { /* ignore */ } }, toastMsg };
}

/** Window ▸ Gradient panel, Gradient tool (G), Tools-panel paint modes, swatches, flip. */
export function mountGradient(editor) {
  if (window.__visterasGradient) return window.__visterasGradient;
  const core = createGradientCore(editor);
  const panel = mountGradientPanel(editor, core);
  const tool = mountGradientTool(editor, core, panel);
  window.__visterasGradientCss = (ref) => {
    const node = core.byId(ref);
    if (!core.isGradientNode(node)) return null;
    try {
      const m = decodeGradient(core.specOf(node), { x: 0, y: 0, width: 1, height: 1 });
      return m ? cssGradient(m) : null;
    } catch { return null; }
  };
  const api = { MODE, readModel: core.readModel, gradientNodeFor: core.gradientNodeFor, last: core.getLast, ...panel.api, ...tool.api };
  window.__visterasGradient = api;
  panel.sync();
  return api;
}
