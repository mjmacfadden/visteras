/**
 * Visteras Vector — Gradient tool (G) and on-canvas Gradient Annotator, plus
 * flip support for per-object gradients.
 *  - drag: start = origin, direction + length = vector (Shift = 45°), Esc cancels;
 *    a multi-selection gets ONE vector in document space mapped into each
 *    object's local frame, so colour runs continuously across them;
 *  - annotator (G mode, View ▸ Hide/Show Gradient Annotator ⌥⌘G): linear bar
 *    origin ● → end ■, rotate just past the end; radial dashed ellipse (ring =
 *    radius, dot = aspect); stops under the bar (drag, drag off to delete,
 *    Alt-drag to duplicate, double-click for colour, click the bar to add).
 * Overlay lives in SVG-Edit's selectorParentGroup (Shape Builder pattern).
 */
import {
  GRADIENT_ATTR, normalizeModel, modelPoints, modelFromPoints, modelFromDocument, flipModel,
  direction, angleOf, snapAngle, addStop, deleteStop, duplicateStop, moveStop,
  multiply, invert, apply as applyM, translate, IDENTITY,
} from './visteras-gradient-model.js?v=gradient-1';

const NS = 'http://www.w3.org/2000/svg';
const MODE = 'gradient';
const DRAG_DELETE_PX = 20;
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M15 6a7 7 0 1 0 1.5 6" fill="none" stroke="#000" stroke-width="3"/><path d="M15 6a7 7 0 1 0 1.5 6" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M12.5 2.5 16 6l-4.2 1.4z" fill="#fff" stroke="#000" stroke-width=".8"/></svg>')}") 10 10, alias`;
const asM = (m) => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f });
const det = (m) => m.a * m.d - m.b * m.c;

export function mountGradientTool(editor, core, panel) {
  const { sc, cs, activeAttr, content } = core;
  let dragging = null;   // active canvas gesture
  let span = null;       // { ids:Set, model (document space) } after a multi-object drag
  let overlay = null;
  let renderedFrames = [];

  /* ───────────── toolbar button ───────────── */
  (function injectToolButton() {
    if (document.getElementById('tool_gradient')) return;
    const toolsLeft = document.getElementById('tools_left');
    if (!toolsLeft) return;
    const btn = document.createElement('se-button');
    btn.id = 'tool_gradient';
    btn.setAttribute('title', 'Gradient Tool (G)');
    btn.addEventListener('click', () => {
      if (editor.leftPanel?.updateLeftPanel?.('tool_gradient') === false) return;
      sc.setMode(MODE);
    });
    const eye = document.getElementById('tool_eyedropper');
    if (eye?.parentNode === toolsLeft) toolsLeft.insertBefore(btn, eye.nextSibling);
    else toolsLeft.appendChild(btn);
    // Shared currentColor icon (packages/icons/tools → images/tools). se-button
    // renders an <img>, so tint it to the toolbar grey.
    fetch('images/tools/gradient.svg').then((r) => (r.ok ? r.text() : Promise.reject(new Error('icon')))).then((svg) => {
      btn.setAttribute('src', `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/currentColor/g, '#CCCCCC'))}`);
    }).catch(() => btn.setAttribute('src', 'tools/gradient.svg'));
  })();
  const style = document.createElement('style');
  const M = `body[data-mode="${MODE}"]`;
  style.textContent = `${M} #svgcanvas, ${M} #svgcanvas * { cursor: crosshair !important; }
    ${M} #vgrad_annotator [data-vgrad-handle^="stop"] { cursor: default !important; }
    ${M} #vgrad_annotator [data-vgrad-handle="origin"], ${M} #vgrad_annotator [data-vgrad-handle="end"] { cursor: move !important; }
    ${M} #vgrad_annotator [data-vgrad-handle="rotate"] { cursor: ${ROTATE_CURSOR} !important; }
    ${M} #vgrad_annotator [data-vgrad-handle="ring"], ${M} #vgrad_annotator [data-vgrad-handle="aspect"] { cursor: pointer !important; }
    ${M} #vgrad_annotator [data-vgrad-handle="bar"] { cursor: copy !important; }`;
  document.head.append(style);

  const inCanvas = (e) => {
    const t = e.target, canvasEl = document.getElementById('svgcanvas');
    if (!canvasEl || !(t instanceof Node) || !canvasEl.contains(t)) return false;
    return !t.closest?.('#sidepanels, #tools_left, #tools_top, #rulers, .ruler, #properties_panel, #vdock, #vdock_flyout');
  };
  const topLevelOf = (node) => {
    const c = content();
    let n = node?.closest?.('#svgcontent *');
    if (!n || !c?.contains(n) || n.closest('defs')) return null;
    while (n.parentNode && n.parentNode !== c && !(n.parentNode.tagName === 'g' && n.parentNode.classList.contains('layer'))) n = n.parentNode;
    if (n.tagName === 'title' || n.classList?.contains('layer')) return null;
    return n;
  };

  /* ───────────── frames ───────────── */
  function frames() {
    const attr = activeAttr();
    const els = core.targets(attr).filter((el) => core.gradientNodeFor(el, attr));
    if (!els.length) return [];
    if (span && els.length > 1 && span.ids.size === els.length && els.every((el) => span.ids.has(el.id))) {
      return [{ els, attr, docFromFrame: IDENTITY, model: span.model, span: true }];
    }
    return els.slice(-12).map((el) => {
      const b = core.bboxOf(el);
      return { els: [el], attr, docFromFrame: multiply(core.docMatrix(el), translate(b.x, b.y)), model: core.readModel(el, attr), span: false };
    }).filter((f) => f.model);
  }
  const elModel = (frame, model, el) => (frame.span ? modelFromDocument(model, core.docMatrix(el), core.bboxOf(el)) : model);
  function frameSession(frame) {
    const s = core.beginSession(frame.els.map((el) => ({ el, attr: frame.attr })));
    const own = new Map(frame.els.map((el) => [el, core.readModel(el, frame.attr)]));
    return {
      update(model, { keepOwnStops = false } = {}) {
        frame.model = normalizeModel(model);
        s.update((item) => {
          const m = elModel(frame, frame.model, item.el);
          const o = own.get(item.el);
          return keepOwnStops && o ? { ...m, stops: o.stops } : m;
        });
        if (frame.span && span) span.model = frame.model;
      },
      commit: (label) => s.commit(label),
      cancel: () => s.cancel(),
    };
  }
  const frameFromClient = (frame) => invert(multiply(asM(content().getScreenCTM()), frame.docFromFrame)) || IDENTITY;
  const clientFromFrame = (frame) => multiply(asM(content().getScreenCTM()), frame.docFromFrame);

  /* ───────────── annotator ───────────── */
  function ensureOverlay() {
    const parent = sc.selectorManager?.selectorParentGroup;
    if (!parent) return null;
    if (overlay?.isConnected && overlay.parentNode === parent) return overlay;
    overlay?.remove();
    overlay = document.createElementNS(NS, 'g');
    overlay.setAttribute('id', 'vgrad_annotator');
    parent.append(overlay);
    return overlay;
  }
  const clearOverlay = () => { overlay?.remove(); overlay = null; renderedFrames = []; };
  const mk = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); parent?.append(n); return n; };

  function renderAnnotator() {
    if (sc.getMode() !== MODE || !core.getAnnotator()) { clearOverlay(); return; }
    const root = ensureOverlay();
    if (!root) return;
    root.replaceChildren();
    const rootCTM = root.getScreenCTM(), cCTM = content()?.getScreenCTM();
    if (!rootCTM || !cCTM) return;
    const rootFromDoc = multiply(invert(asM(rootCTM)) || IDENTITY, asM(cCTM));
    renderedFrames = dragging?.frames || frames();
    renderedFrames.forEach((f, fi) => {
      const toRoot = multiply(rootFromDoc, f.docFromFrame);
      const p = modelPoints(f.model);
      const O = applyM(toRoot, p.origin), E = applyM(toRoot, p.end), A = applyM(toRoot, p.aspectPoint);
      const g = mk('g', { 'data-vgrad-frame': fi }, root);
      if (f.model.type === 'radial') {
        const d = direction(f.model.angle), perp = { x: -d.y, y: d.x };
        const pts = [];
        for (let k = 0; k <= 48; k++) {
          const t = (k / 48) * Math.PI * 2;
          const lx = Math.cos(t) * f.model.length, ly = Math.sin(t) * f.model.length * f.model.aspect / 100;
          pts.push(applyM(toRoot, { x: f.model.ox + d.x * lx + perp.x * ly, y: f.model.oy + d.y * lx + perp.y * ly }));
        }
        const dpath = `${pts.map((q, k) => `${k ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`).join('')}Z`;
        mk('path', { d: dpath, fill: 'none', stroke: 'transparent', 'stroke-width': 9, 'pointer-events': 'stroke', 'data-vgrad-handle': 'ring' }, g);
        mk('path', { d: dpath, fill: 'none', stroke: '#000', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none', opacity: 0.7 }, g);
        mk('path', { d: dpath, fill: 'none', stroke: '#fff', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'stroke-dashoffset': 3.5, 'pointer-events': 'none' }, g);
        mk('circle', { cx: A.x, cy: A.y, r: 4, fill: '#000', stroke: '#fff', 'stroke-width': 1, 'pointer-events': 'all', 'data-vgrad-handle': 'aspect' }, g);
      }
      mk('line', { x1: O.x, y1: O.y, x2: E.x, y2: E.y, stroke: 'transparent', 'stroke-width': 12, 'pointer-events': 'stroke', 'data-vgrad-handle': 'bar' }, g);
      mk('line', { x1: O.x, y1: O.y, x2: E.x, y2: E.y, stroke: '#000', 'stroke-width': 3, 'pointer-events': 'none', opacity: 0.55 }, g);
      mk('line', { x1: O.x, y1: O.y, x2: E.x, y2: E.y, stroke: '#fff', 'stroke-width': 1.2, 'pointer-events': 'none' }, g);
      const len = Math.hypot(E.x - O.x, E.y - O.y) || 1, nx = -(E.y - O.y) / len, ny = (E.x - O.x) / len;
      f.model.stops.forEach((st, i) => {
        const cx = O.x + (E.x - O.x) * st.o + nx * 9, cy = O.y + (E.y - O.y) * st.o + ny * 9;
        mk('rect', { x: cx - 5.5, y: cy - 5.5, width: 11, height: 11, fill: 'none', stroke: '#000', 'stroke-width': 0.8, 'pointer-events': 'none', opacity: 0.6 }, g);
        mk('rect', { x: cx - 4.5, y: cy - 4.5, width: 9, height: 9, fill: st.c, stroke: '#fff', 'stroke-width': 1.2, 'pointer-events': 'all', 'data-vgrad-handle': `stop:${i}` }, g);
      });
      mk('circle', { cx: E.x, cy: E.y, r: 14, fill: 'transparent', 'pointer-events': 'all', 'data-vgrad-handle': 'rotate' }, g);
      mk('rect', { x: E.x - 4.5, y: E.y - 4.5, width: 9, height: 9, fill: '#fff', stroke: '#000', 'stroke-width': 1, 'pointer-events': 'all', 'data-vgrad-handle': 'end' }, g);
      mk('circle', { cx: O.x, cy: O.y, r: 5, fill: '#fff', stroke: '#000', 'stroke-width': 1, 'pointer-events': 'all', 'data-vgrad-handle': 'origin' }, g);
      mk('circle', { cx: O.x, cy: O.y, r: 2, fill: '#000', 'pointer-events': 'none' }, g);
    });
  }
  let rafQueued = false;
  const scheduleAnnotator = () => { if (rafQueued) return; rafQueued = true; requestAnimationFrame(() => { rafQueued = false; renderAnnotator(); }); };
  function setAnnotator(on) {
    core.setAnnotatorPref(on);
    const item = document.getElementById('action_toggle_gradient_annotator');
    if (item?.firstChild) item.firstChild.textContent = `${core.getAnnotator() ? 'Hide' : 'Show'} Gradient Annotator `;
    renderAnnotator();
  }
  setAnnotator(core.getAnnotator());
  document.getElementById('action_toggle_gradient_annotator')?.addEventListener('click', () => setAnnotator(!core.getAnnotator()));

  /* ───────────── gestures ───────────── */
  let lastStopClick = null;
  const begin = (d) => { dragging = d; core.busy = true; };
  const end = () => { dragging = null; core.busy = false; };

  function onDown(e) {
    if (sc.getMode() !== MODE || e.button !== 0 || !inCanvas(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const handle = e.target.closest?.('[data-vgrad-handle]');
    if (handle && renderedFrames.length) { startHandleDrag(e, handle); return; }
    // Clicking an unselected object selects it; the drag then sets the vector.
    const hit = topLevelOf(e.target);
    const selected = (sc.getSelectedElements?.() || []).filter(Boolean);
    if (hit && !selected.includes(hit)) { sc.selectOnly([hit], true); span = null; }
    else if (!hit && !selected.length) return;
    startVectorDrag(e);
  }

  function startVectorDrag(e) {
    const attr = activeAttr();
    const els = core.targets(attr);
    if (!els.length) { if (core.zeroAreaOnly(attr)) core.toastMsg('Gradients need an area — use Object ▸ Outline Stroke for lines'); return; }
    const p1 = core.clientToDoc(e.clientX, e.clientY);
    const top = [...els].reverse().map((el) => core.readModel(el, attr)).find(Boolean);
    const base = top || normalizeModel({ ...core.getLast() });
    const frame = { els, attr, docFromFrame: IDENTITY, model: normalizeModel({ ...base, ox: p1.x, oy: p1.y }), span: true };
    const fs = frameSession(frame);
    begin({ kind: 'vector', frames: null, moved: false, start: { x: e.clientX, y: e.clientY } });
    dragging.move = (ev) => {
      if (!dragging.moved && Math.hypot(ev.clientX - dragging.start.x, ev.clientY - dragging.start.y) < 3) return;
      dragging.moved = true;
      const p2 = core.clientToDoc(ev.clientX, ev.clientY);
      let ang = angleOf(p2.x - p1.x, p2.y - p1.y);
      if (ev.shiftKey) ang = snapAngle(ang);
      const L = Math.max(1e-3, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      fs.update({ ...base, ox: p1.x, oy: p1.y, angle: ang, length: L }, { keepOwnStops: true });
      dragging.frames = [frame];
      panel.setShown(frame.model);
      scheduleAnnotator();
    };
    dragging.up = () => {
      if (!dragging.moved) {
        fs.cancel();
        // A click on an object without a gradient applies the last-used one.
        const fresh = els.filter((el) => !core.gradientNodeFor(el, attr));
        if (fresh.length) core.applyModels(fresh, attr, (el) => core.seedModel(el, attr), 'Gradient');
        return;
      }
      fs.commit('Gradient');
      span = els.length > 1 ? { ids: new Set(els.map((el) => el.id)), model: frame.model } : null;
    };
    dragging.cancel = () => fs.cancel();
  }

  function startHandleDrag(e, handle) {
    const kind = handle.getAttribute('data-vgrad-handle');
    const fi = Number(handle.closest('[data-vgrad-frame]')?.getAttribute('data-vgrad-frame') || 0);
    const src = renderedFrames[fi];
    if (!src?.model) return;
    const frame = { ...src };
    const start = normalizeModel(frame.model);
    const fs = frameSession(frame);
    const toFrame = frameFromClient(frame), toClient = clientFromFrame(frame);
    const p0 = applyM(toFrame, { x: e.clientX, y: e.clientY });
    const pts = modelPoints(start);
    const alt = e.altKey;
    const stopIndex = kind.startsWith('stop:') ? Number(kind.slice(5)) : -1;
    begin({ kind, frames: [frame], moved: false, start: { x: e.clientX, y: e.clientY }, pendingDelete: false });
    if (stopIndex >= 0) { panel.setShown(start); panel.setSelectedStop(stopIndex); }
    const d = direction(start.angle), perp = { x: -d.y, y: d.x };
    dragging.move = (ev) => {
      if (!dragging.moved && Math.hypot(ev.clientX - dragging.start.x, ev.clientY - dragging.start.y) < 3) return;
      dragging.moved = true;
      const p = applyM(toFrame, { x: ev.clientX, y: ev.clientY });
      const rel = { x: p.x - start.ox, y: p.y - start.oy };
      let m = start;
      if (kind === 'origin') m = { ...start, ox: start.ox + (p.x - p0.x), oy: start.oy + (p.y - p0.y) };
      else if (kind === 'end') {
        let endPt = p;
        if (ev.shiftKey) { const dd = direction(snapAngle(angleOf(rel.x, rel.y))); const L = Math.hypot(rel.x, rel.y); endPt = { x: start.ox + dd.x * L, y: start.oy + dd.y * L }; }
        m = modelFromPoints(start, pts.origin, endPt);
      } else if (kind === 'rotate') {
        let ang = angleOf(rel.x, rel.y);
        if (ev.shiftKey) ang = snapAngle(ang);
        m = { ...start, angle: ang };
      } else if (kind === 'ring') {
        const px = rel.x * d.x + rel.y * d.y, py = rel.x * perp.x + rel.y * perp.y;
        m = { ...start, length: Math.max(1e-3, Math.sqrt(px * px + (py / (start.aspect / 100)) ** 2)) };
      } else if (kind === 'aspect') {
        m = { ...start, aspect: Math.max(1, (Math.abs(rel.x * perp.x + rel.y * perp.y) / start.length) * 100) };
      } else if (kind === 'bar') {
        return; // click adds a stop; dragging the bar does nothing
      } else if (stopIndex >= 0) {
        const t = (rel.x * d.x + rel.y * d.y) / start.length;
        const tc = Math.min(1, Math.max(0, t));
        const onBar = applyM(toClient, { x: start.ox + d.x * start.length * tc, y: start.oy + d.y * start.length * tc });
        dragging.pendingDelete = !alt && start.stops.length > 2 && Math.hypot(ev.clientX - onBar.x, ev.clientY - onBar.y) > DRAG_DELETE_PX + 9;
        let res;
        if (alt) res = duplicateStop(start.stops, stopIndex, t);
        else if (dragging.pendingDelete) res = { stops: deleteStop(start.stops, stopIndex), index: Math.max(0, stopIndex - 1) };
        else res = moveStop(start.stops, stopIndex, t);
        panel.setSelectedStop(res.index);
        m = { ...start, stops: res.stops };
      }
      fs.update(m);
      panel.setShown(frame.model);
      scheduleAnnotator();
    };
    dragging.up = (ev) => {
      if (kind === 'bar' && !dragging.moved) {
        const p = applyM(toFrame, { x: ev.clientX, y: ev.clientY });
        const t = ((p.x - start.ox) * d.x + (p.y - start.oy) * d.y) / start.length;
        const res = addStop(start.stops, t);
        fs.update({ ...start, stops: res.stops });
        fs.commit('Add Gradient Stop');
        panel.setSelectedStop(res.index);
        return;
      }
      if (!dragging.moved) {
        fs.cancel();
        if (stopIndex >= 0) {
          const rect = handle.getBoundingClientRect();
          const now = performance.now();
          const key = `${fi}:${stopIndex}`;
          panel.setSelectedStop(stopIndex);
          if (lastStopClick?.key === key && now - lastStopClick.time < 400) {
            dragging.openColor = () => openStopColor(frame, stopIndex, rect);
            lastStopClick = null;
          } else lastStopClick = { key, time: now };
        }
        return;
      }
      lastStopClick = null;
      const labels = { origin: 'Move Gradient', end: 'Gradient Vector', rotate: 'Rotate Gradient', ring: 'Gradient Radius', aspect: 'Gradient Aspect Ratio' };
      fs.commit(labels[kind] || (alt ? 'Duplicate Gradient Stop' : dragging.pendingDelete ? 'Delete Gradient Stop' : 'Move Gradient Stop'));
    };
    dragging.cancel = () => fs.cancel();
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault(); e.stopImmediatePropagation();
    dragging.move(e);
  }
  function onUp(e) {
    if (!dragging) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const d = dragging;
    try { d.up(e); } finally { end(); }
    d.openColor?.();
    panel.sync();
    scheduleAnnotator();
  }
  function openStopColor(frame, idx, rect) {
    panel.setShown(frame.model);
    panel.setSelectedStop(idx);
    let fs = null;
    core.busy = true;
    panel.openColorPopover(rect, {
      color: frame.model.stops[idx]?.c,
      onColor: (hex) => {
        fs ??= frameSession(frame);
        fs.update({ ...frame.model, stops: frame.model.stops.map((s, k) => (k === idx ? { ...s, c: hex } : s)) });
        panel.setShown(frame.model);
        scheduleAnnotator();
      },
      onDone: (commit) => { core.busy = false; if (fs) { if (commit) fs.commit('Gradient Stop Color'); else fs.cancel(); } scheduleAnnotator(); },
    });
  }
  window.addEventListener('mousedown', onDown, true);
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);

  window.addEventListener('click', (e) => { if (sc.getMode() === MODE && inCanvas(e)) e.stopImmediatePropagation(); }, true);
  window.addEventListener('keydown', (e) => {
    // ⌥⌘G: View ▸ Hide/Show Gradient Annotator (index.html's ⌘G group ignores Alt).
    if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === 'KeyG') {
      e.preventDefault(); e.stopImmediatePropagation();
      setAnnotator(!core.getAnnotator());
      return;
    }
    // Esc cancels an active drag only, so the dock's Esc still closes panels otherwise.
    if (e.key === 'Escape' && dragging) {
      e.preventDefault(); e.stopImmediatePropagation();
      const d = dragging; end();
      d.cancel?.();
      panel.sync(); scheduleAnnotator();
    }
  }, true);
  window.addEventListener('blur', () => { if (dragging) { const d = dragging; end(); d.cancel?.(); scheduleAnnotator(); } });
  document.getElementById('workarea')?.addEventListener('scroll', scheduleAnnotator, { passive: true });
  window.addEventListener('resize', scheduleAnnotator);
  document.addEventListener('modeChange', () => {
    const btn = document.getElementById('tool_gradient');
    if (sc.getMode() === MODE) { btn?.setAttribute('pressed', 'true'); renderAnnotator(); }
    else { btn?.removeAttribute('pressed'); if (dragging) { const d = dragging; end(); d.cancel?.(); } clearOverlay(); }
  });

  /* ───────────── flip (H/V) ───────────── */
  const origFlip = sc.flipSelectedElements?.bind(sc);
  if (origFlip && !sc.flipSelectedElements.__vgrad) {
    sc.flipSelectedElements = function (sx, sy, ...rest) {
      const captured = [];
      for (const attr of ['fill', 'stroke']) {
        for (const el of cs()?.paintTargets?.(attr) || []) {
          if (!core.gradientNodeFor(el, attr)?.hasAttribute(GRADIENT_ATTR)) continue;
          const model = core.readModel(el, attr);
          if (model) captured.push({ el, attr, model, det: det(core.docMatrix(el)) });
        }
      }
      const um = sc.undoMgr;
      const startPtr = um && Array.isArray(um.undoStack) ? um.undoStackPointer : null;
      const result = origFlip(sx, sy, ...rest);
      // Elements that kept a mirroring transform already mirror their OBB gradient.
      const todo = captured.filter((c) => c.el.isConnected && Math.sign(det(core.docMatrix(c.el))) === Math.sign(c.det));
      if (todo.length) {
        const s = core.beginSession(todo.map((c) => ({ el: c.el, attr: c.attr })));
        s.update((item) => {
          const c = todo.find((t) => t.el === item.el && t.attr === item.attr);
          const b = core.bboxOf(item.el);
          let m = c.model;
          if (sx < 0) m = flipModel(m, b, 'h');
          if (sy < 0) m = flipModel(m, b, 'v');
          return m;
        });
        s.commit('Flip gradient');
        try { // merge into the flip's own undo entry
          const { BatchCommand } = sc.history;
          const added = startPtr == null ? [] : um.undoStack.slice(startPtr, um.undoStackPointer);
          if (added.length > 1) {
            um.undoStack.splice(startPtr);
            um.undoStackPointer = startPtr;
            const batch = new BatchCommand('Flip');
            for (const c of added) batch.addSubCommand(c);
            um.addCommandToHistory(batch);
          }
        } catch { /* keep separate entries */ }
      }
      span = null;
      return result;
    };
    sc.flipSelectedElements.__vgrad = true;
  }

  /* ───────────── events ───────────── */
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (event === 'selected' && span) {
      const ids = (sc.getSelectedElements?.() || []).filter(Boolean).map((el) => el.id);
      if (!ids.every((id) => span.ids.has(id))) span = null;
    }
    if (event === 'selected' || event === 'changed' || event === 'zoomed') scheduleAnnotator();
    return result;
  };
  cs()?.subscribe?.(() => scheduleAnnotator());

  return {
    api: {
      annotator: () => renderedFrames.map((f) => {
        const toClient = clientFromFrame(f);
        const p = modelPoints(f.model);
        const stops = f.model.stops.map((s) => applyM(toClient, { x: p.origin.x + (p.end.x - p.origin.x) * s.o, y: p.origin.y + (p.end.y - p.origin.y) * s.o }));
        return { span: f.span, ids: f.els.map((el) => el.id), origin: applyM(toClient, p.origin), end: applyM(toClient, p.end), aspect: applyM(toClient, p.aspectPoint), stops, model: normalizeModel(f.model) };
      }),
      isAnnotatorOn: () => core.getAnnotator(),
      setAnnotator,
      renderAnnotator,
    },
  };
}
