/**
 * Visteras Vector — Window ▸ Gradient panel (⌘F9), gradient swatches, and the
 * Tools-panel Color / Gradient / None buttons (, . /). Illustrator order:
 * thumbnail + swatch menu · Type · Stroke · Fill/Stroke + Reverse · Angle /
 * Aspect · gradient slider · Opacity / Location.
 * Panel edits preview live (no history) on `input` and commit ONE undo step on
 * `change` / mouse-up (core.beginSession).
 * Stop selection (Illustrator): a click on a stop (panel slider or annotator)
 * selects it without opening anything; while selected, the Color panel,
 * Swatches (click or ⌥-click), the Fill/Stroke well picker and the Eyedropper
 * recolour that stop via window.__visterasGradientStopRoute. Esc, a click on
 * empty canvas or another object, or a Fill/Stroke switch deselects it.
 */
import {
  GRADIENT_PRESETS, normalizeModel, defaultModel, fitLinear, fitRadial, decodeGradient,
  addStop, deleteStop, duplicateStop, swapStops, moveStop, reverseStops,
  cssGradient, swatchFromModel, normalizeSwatch, normalizeColor, MID_MIN, MID_MAX,
  recolorStop, stopSelectionLive,
} from './visteras-gradient-model.js?v=gradient-2';

const DRAG_DELETE_PX = 20;
const r1 = (n) => Math.round(n * 10) / 10;
const escName = (s) => String(s).replace(/[<&>"]/g, '');

const ICON = {
  linear: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><defs><linearGradient id="vgrad_ic_l"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs><rect x="1.5" y="3.5" width="13" height="9" fill="url(#vgrad_ic_l)" stroke="currentColor"/></svg>',
  radial: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><defs><radialGradient id="vgrad_ic_r"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset="1" stop-color="currentColor"/></radialGradient></defs><rect x="1.5" y="1.5" width="13" height="13" fill="url(#vgrad_ic_r)" stroke="currentColor"/></svg>',
  freeform: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor"/><circle cx="5" cy="5" r="1.6" fill="currentColor"/><circle cx="11" cy="7" r="1.6" fill="currentColor"/><circle cx="7" cy="11.5" r="1.6" fill="currentColor"/></svg>',
  reverse: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 5h10l-2.5-2.5M14 11H4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  trash: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  angle: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 13h12M2 13 11 4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 13a6 6 0 0 0-1.6-4.2" fill="none" stroke="currentColor"/></svg>',
  aspect: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><ellipse cx="8" cy="8" rx="6.5" ry="3.8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  within: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  along: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 8h12" stroke="currentColor" stroke-width="2.4"/></svg>',
  across: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2v12" stroke="currentColor" stroke-width="2.4"/></svg>',
};

export function mountGradientPanel(editor, core) {
  const { sc, cs, activeAttr } = core;
  const pane = document.getElementById('vdock_gradient_panel');
  let shown = normalizeModel({ ...core.getLast() }); // what the panel displays
  let shownHasGradient = false;
  let selStop = 0, selMid = -1;
  let stopActive = false, stopAttr = null, stopOwner = ''; // a clicked (selected) colour stop
  const stopListeners = new Set();
  let session = null;                                // live preview from the panel
  const $ = (id) => document.getElementById(id);

  if (pane) {
    pane.innerHTML = `
      <div class="vgrad" id="vgrad_panel">
        <div class="vgrad-row vgrad-head">
          <button type="button" class="vgrad-thumb" id="vgrad_thumb" title="Gradient Fill — click to apply, ⌘-click to reset to White, Black" aria-label="Apply gradient"></button>
          <button type="button" class="vgrad-iconbtn vgrad-menu-btn" id="vgrad_menu_btn" title="Gradient swatches" aria-haspopup="true" aria-expanded="false">▾</button>
          <div class="vgrad-seg" role="group" aria-label="Type">
            <button type="button" class="vgrad-iconbtn" data-type="linear" id="vgrad_type_linear" title="Linear Gradient" aria-pressed="false">${ICON.linear}</button>
            <button type="button" class="vgrad-iconbtn" data-type="radial" id="vgrad_type_radial" title="Radial Gradient" aria-pressed="false">${ICON.radial}</button>
            <button type="button" class="vgrad-iconbtn" title="Freeform Gradient (coming later)" disabled>${ICON.freeform}</button>
          </div>
          <button type="button" class="vgrad-btn" id="vgrad_edit" title="Edit Gradient — Gradient Tool (G)">Edit Gradient</button>
        </div>
        <div class="vgrad-menu" id="vgrad_menu" role="menu" hidden></div>
        <div class="vgrad-row vgrad-strokes" id="vgrad_stroke_row" hidden>
          <span class="vgrad-label">Stroke:</span>
          <div class="vgrad-seg" role="group" aria-label="Stroke gradient">
            <button type="button" class="vgrad-iconbtn active" aria-pressed="true" title="Apply gradient within stroke">${ICON.within}</button>
            <button type="button" class="vgrad-iconbtn" disabled title="Apply gradient along stroke (coming later)">${ICON.along}</button>
            <button type="button" class="vgrad-iconbtn" disabled title="Apply gradient across stroke (coming later)">${ICON.across}</button>
          </div>
        </div>
        <div class="vgrad-row vgrad-mid">
          <div class="vgrad-fs" role="group" aria-label="Fill or stroke">
            <button type="button" class="vgrad-fs-box vgrad-fs-fill" id="vgrad_fs_fill" title="Fill (X toggles)" aria-label="Fill"></button>
            <button type="button" class="vgrad-fs-box vgrad-fs-stroke" id="vgrad_fs_stroke" title="Stroke (X toggles)" aria-label="Stroke"></button>
          </div>
          <button type="button" class="vgrad-iconbtn" id="vgrad_reverse" title="Reverse Gradient">${ICON.reverse}</button>
          <label class="vgrad-field" title="Angle"><span class="vgrad-ic">${ICON.angle}</span><input id="vgrad_angle" class="vgrad-input" type="number" min="-180" max="180" step="1" list="vgrad_angle_list" aria-label="Angle"><em>°</em></label>
          <label class="vgrad-field" title="Aspect Ratio (radial)"><span class="vgrad-ic">${ICON.aspect}</span><input id="vgrad_aspect" class="vgrad-input" type="number" min="1" max="10000" step="1" aria-label="Aspect Ratio"><em>%</em></label>
          <datalist id="vgrad_angle_list">${[-180, -135, -90, -45, 0, 45, 90, 135, 180].map((a) => `<option value="${a}"></option>`).join('')}</datalist>
        </div>
        <div class="vgrad-slider" id="vgrad_slider" tabindex="0" title="Click below the ramp to add a stop · drag a stop down to delete · Alt-drag to duplicate (drop on a stop to swap) · double-click a stop to edit its colour">
          <div class="vgrad-mids" id="vgrad_mids"></div>
          <div class="vgrad-ramp" id="vgrad_ramp"></div>
          <div class="vgrad-stops" id="vgrad_stops"></div>
        </div>
        <div class="vgrad-row vgrad-bottom">
          <label class="vgrad-field" title="Opacity of the selected stop"><span class="vgrad-label">Opacity:</span><input id="vgrad_opacity" class="vgrad-input" type="number" min="0" max="100" step="1" aria-label="Stop opacity"><em>%</em></label>
          <label class="vgrad-field" title="Location of the selected stop or midpoint"><span class="vgrad-label">Location:</span><input id="vgrad_location" class="vgrad-input" type="number" min="0" max="100" step="0.5" aria-label="Location"><em>%</em></label>
          <button type="button" class="vgrad-iconbtn" id="vgrad_delete" title="Delete Stop">${ICON.trash}</button>
        </div>
        <div class="vgrad-note" id="vgrad_note" hidden></div>
      </div>`;
  }

  const readPrev = (item) => { const b = core.bboxOf(item.el); try { return b && item.prevNode ? decodeGradient(core.specOf(item.prevNode), b) : null; } catch { return null; } };
  const finish = (label) => { if (session) { session.commit(label); session = null; } };
  const abort = () => { if (session) { session.cancel(); session = null; } };

  /** Apply a model transform to every target (each rebased on its own geometry). */
  function apply(mutate, { live = false, label = 'Gradient', gradientOnly = false } = {}) {
    const attr = activeAttr();
    const els = gradientOnly ? core.targets(attr).filter((el) => core.gradientNodeFor(el, attr)) : core.targets(attr);
    if (!els.length && gradientOnly) return;
    if (!els.length) {
      // Nothing selected: edit the default (last-used) gradient, like Illustrator.
      shown = normalizeModel(mutate(normalizeModel(shown), null));
      shownHasGradient = false;
      if (!live) core.setLast(shown);
      render();
      return;
    }
    if (!session) session = core.beginSession(els.map((el) => ({ el, attr })));
    const keepStops = shownHasGradient ? shown.stops : undefined;
    session.update((item) => mutate(readPrev(item) || core.seedModel(item.el, attr, { type: shown.type, angle: shown.angle, aspect: shown.aspect, stops: keepStops }), item.el));
    const top = session.items.filter((i) => i.model).at(-1);
    if (top) { shown = top.model; shownHasGradient = true; }
    if (!live) finish(label);
    render();
  }
  const withStops = (stops) => (m) => ({ ...m, stops });
  const convertType = (type) => (m, el) => {
    if (m.type === type) return m;
    const bbox = el ? core.bboxOf(el) : { width: 100, height: 100 };
    const geo = type === 'radial' ? { ...fitRadial(bbox), angle: m.angle } : fitLinear(bbox, m.angle);
    return { ...m, type, ...geo };
  };

  function sync() {
    if (session || core.busy) return;
    const attr = activeAttr();
    const els = core.targets(attr);
    const withGrad = [...els].reverse().find((el) => core.gradientNodeFor(el, attr)); // topmost
    const m = withGrad ? core.readModel(withGrad, attr) : null;
    if (m) { shown = m; shownHasGradient = true; } else { shown = normalizeModel({ ...core.getLast() }); shownHasGradient = false; }
    if (selStop >= shown.stops.length) selStop = shown.stops.length - 1;
    if (selMid >= shown.stops.length - 1) selMid = -1;
    if (stopActive && (!m || attr !== stopAttr)) clearStopSelection({ quiet: true });
    render();
  }

  /* ───────────── stop selection (Illustrator) ───────────── */
  const selIds = () => (sc.getSelectedElements?.() || []).filter(Boolean).map((el) => el.id).join('|');
  const notifyStop = () => { for (const fn of stopListeners) { try { fn(); } catch { /* ignore */ } } };
  /** True while colour input should recolour the selected stop. */
  function stopLive() {
    if (!stopActive) return false;
    const attr = activeAttr();
    const hasGradient = shownHasGradient && core.targets(attr).some((el) => core.gradientNodeFor(el, attr));
    return stopSelectionLive({ active: stopActive, index: selStop, count: shown.stops.length, attr, stopAttr, hasGradient, midpoint: selMid });
  }
  /** Click on a stop: select it (orange) and show its colour in the Color panel; opens nothing. */
  function selectStop(i, { showColor = true } = {}) {
    if (!Number.isInteger(i) || i < 0) return;
    selStop = i; selMid = -1;
    stopActive = true; stopAttr = activeAttr(); stopOwner = selIds();
    render();
    const st = shown.stops[selStop];
    if (showColor && st) { try { cs()?.setWorkingColor?.(st.c, { apply: false, recordRecent: false }); } catch { /* ignore */ } }
    notifyStop();
  }
  function clearStopSelection({ quiet = false } = {}) {
    if (!stopActive) return false;
    stopActive = false; stopAttr = null; stopOwner = '';
    if (!quiet) render();
    notifyStop();
    return true;
  }
  /** Colour → selected stop on every selected object that has a gradient: fresh gradient per object, one undo step (live = preview only). */
  function recolorSelectedStop(hex, { live = false } = {}) {
    if (!stopLive()) return false;
    const c = normalizeColor(hex, null);
    if (!c) return false;
    const i = selStop;
    const attr = activeAttr();
    // Same colour again (e.g. the hex field's blur after Enter): no extra undo step.
    if (!live && !session && core.targets(attr).filter((el) => core.gradientNodeFor(el, attr)).every((el) => core.readModel(el, attr)?.stops[i]?.c === c)) return true;
    apply((m) => ({ ...m, stops: recolorStop(m.stops, i, c) }), { live, label: 'Gradient Stop Color', gradientOnly: true });
    return true;
  }

  function render() {
    if (!pane) return;
    const m = shown;
    const attr = activeAttr();
    $('vgrad_thumb').style.backgroundImage = cssGradient(m);
    for (const t of ['linear', 'radial']) {
      const b = $(`vgrad_type_${t}`);
      const on = shownHasGradient && m.type === t;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
    }
    $('vgrad_stroke_row').hidden = attr !== 'stroke';
    const copyWell = (dst, src) => { if (!dst) return; const cssBg = src ? getComputedStyle(src) : null; dst.style.backgroundColor = cssBg ? cssBg.backgroundColor : ''; dst.style.backgroundImage = cssBg ? cssBg.backgroundImage : ''; dst.classList.toggle('is-none', !!src?.classList.contains('is-none')); };
    copyWell($('vgrad_fs_fill'), document.getElementById('swatch_fill_indicator'));
    copyWell($('vgrad_fs_stroke'), document.getElementById('swatch_stroke_indicator'));
    $('vgrad_fs_fill').classList.toggle('active', attr === 'fill');
    $('vgrad_fs_stroke').classList.toggle('active', attr === 'stroke');
    const setVal = (id, v) => { const i = $(id); if (document.activeElement !== i) i.value = v; };
    setVal('vgrad_angle', r1(m.angle));
    setVal('vgrad_aspect', Math.round(m.aspect));
    $('vgrad_aspect').disabled = m.type !== 'radial';
    const st = m.stops[selStop] || m.stops[0];
    setVal('vgrad_opacity', Math.round((st?.a ?? 1) * 100));
    $('vgrad_opacity').disabled = selMid >= 0;
    setVal('vgrad_location', selMid >= 0 ? r1(m.stops[selMid].mid) : r1((st?.o ?? 0) * 100));
    $('vgrad_delete').disabled = selMid >= 0 || m.stops.length <= 2;
    $('vgrad_ramp').style.backgroundImage = `${cssGradient(m, { angle: 90 })}, linear-gradient(45deg, #bbb 25%, transparent 25%, transparent 75%, #bbb 75%), linear-gradient(45deg, #bbb 25%, #fff 25%, #fff 75%, #bbb 75%)`;
    $('vgrad_stops').innerHTML = m.stops.map((s, i) => `<button type="button" class="vgrad-stop${i === selStop && selMid < 0 && stopActive ? ' selected' : ''}" data-stop="${i}" aria-pressed="${i === selStop && selMid < 0 && stopActive}" style="left:${s.o * 100}%" title="Stop ${i + 1}: ${s.c.toUpperCase()} · ${Math.round(s.a * 100)}% · ${r1(s.o * 100)}%" aria-label="Stop ${i + 1}"><span style="background:${s.c}"></span></button>`).join('');
    $('vgrad_mids').innerHTML = m.stops.slice(0, -1).map((s, i) => { const nx = m.stops[i + 1]; const o = s.o + (nx.o - s.o) * s.mid / 100; return `<button type="button" class="vgrad-midpt${i === selMid ? ' selected' : ''}" data-mid="${i}" style="left:${o * 100}%" title="Midpoint ${r1(s.mid)}%" aria-label="Midpoint ${i + 1}"></button>`; }).join('');
    const note = $('vgrad_note');
    const zero = core.zeroAreaOnly(attr);
    note.hidden = !zero;
    if (zero) note.textContent = 'Gradients need an area. For lines, use Object ▸ Outline Stroke first.';
  }

  function deleteSelectedStop() {
    if (selMid >= 0 || shown.stops.length <= 2) return;
    const stops = deleteStop(shown.stops, selStop);
    selStop = Math.max(0, selStop - 1);
    clearStopSelection({ quiet: true });
    apply(withStops(stops), { label: 'Delete Gradient Stop' });
  }

  /* ───────────── slider ───────────── */
  function bindSlider() {
    const slider = $('vgrad_slider');
    let lastClick = null;
    const rampRect = () => $('vgrad_ramp').getBoundingClientRect();
    const offsetAt = (clientX) => { const r = rampRect(); return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width))); };
    slider.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const stopBtn = e.target.closest('[data-stop]');
      const midBtn = e.target.closest('[data-mid]');
      slider.focus({ preventScroll: true });
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let moved = false;
      if (midBtn) {
        selMid = Number(midBtn.dataset.mid); clearStopSelection({ quiet: true }); render();
        const k = selMid;
        const move = (ev) => {
          moved = true;
          const s = shown.stops, a = s[k], b = s[k + 1];
          const mid = Math.min(MID_MAX, Math.max(MID_MIN, ((offsetAt(ev.clientX) - a.o) / Math.max(1e-6, b.o - a.o)) * 100));
          apply((m) => ({ ...m, stops: m.stops.map((x, j) => (j === k ? { ...x, mid } : x)) }), { live: true });
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) finish('Gradient Midpoint'); render(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        return;
      }
      if (stopBtn) {
        const index = Number(stopBtn.dataset.stop);
        selectStop(index); // single click selects (no popover); double-click opens the colour picker
        const alt = e.altKey;
        const original = shown.stops.map((s) => ({ ...s }));
        let pendingDelete = false;
        const move = (ev) => {
          if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
          moved = true;
          const o = offsetAt(ev.clientX);
          pendingDelete = !alt && original.length > 2 && ev.clientY - startY > DRAG_DELETE_PX;
          let res;
          if (alt) res = duplicateStop(original, index, o);
          else if (pendingDelete) res = { stops: deleteStop(original, index), index: Math.max(0, index - 1) };
          else res = moveStop(original, index, o);
          selStop = res.index;
          apply(withStops(res.stops), { live: true });
          slider.classList.toggle('vgrad-deleting', pendingDelete);
        };
        const up = (ev) => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          slider.classList.remove('vgrad-deleting');
          if (!moved) {
            const now = performance.now();
            if (lastClick?.index === index && now - lastClick.time < 400) {
              lastClick = null;
              openColorPopover(slider.querySelector(`[data-stop="${selStop}"]`)?.getBoundingClientRect());
            } else lastClick = { index, time: now };
            return;
          }
          if (alt) {
            // Alt-drop onto another stop swaps them instead of duplicating.
            const r = rampRect();
            const target = original.findIndex((s, j) => j !== index && Math.abs((r.left + s.o * r.width) - ev.clientX) < 7);
            if (target >= 0) {
              abort();
              selStop = target;
              apply(withStops(swapStops(original, index, target)), { label: 'Swap Gradient Stops' });
              return;
            }
          }
          lastClick = null;
          if (pendingDelete) clearStopSelection({ quiet: true });
          finish(alt ? 'Duplicate Gradient Stop' : pendingDelete ? 'Delete Gradient Stop' : 'Move Gradient Stop');
          render();
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        return;
      }
      // Empty area (ramp or below it): click adds a stop with the interpolated colour.
      const up = (ev) => {
        window.removeEventListener('pointerup', up);
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) return;
        const res = addStop(shown.stops, offsetAt(ev.clientX));
        selStop = res.index; selMid = -1;
        apply(withStops(res.stops), { label: 'Add Gradient Stop' });
        selectStop(res.index); // Illustrator: the new stop is selected
      };
      window.addEventListener('pointerup', up);
    });
    slider.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); deleteSelectedStop(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selMid < 0) {
        e.preventDefault(); e.stopPropagation();
        const step = (e.shiftKey ? 0.1 : 0.01) * (e.key === 'ArrowLeft' ? -1 : 1);
        const res = moveStop(shown.stops, selStop, shown.stops[selStop].o + step);
        selStop = res.index;
        apply(withStops(res.stops), { label: 'Move Gradient Stop' });
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openColorPopover(slider.querySelector(`[data-stop="${selStop}"]`)?.getBoundingClientRect()); }
      else e.stopPropagation();
    });
  }

  /* ───────────── shared stop color picker ───────────── */
  /**
   * @param {DOMRect} rect anchor
   * @param {{color?: string, onColor?: Function, onDone?: Function}} [hooks] the annotator passes its own session
   */
  function openColorPopover(rect, hooks = {}, { gradientOnly = false } = {}) {
    const idx = selStop;
    const st = shown.stops[idx];
    if (!st) return;
    const original = normalizeModel(shown);
    const noTargets = !core.targets(activeAttr()).length;
    window.__visterasOpenColorPicker?.(null, {
      color: hooks.color || st.c,
      label: 'Gradient Stop',
      onColor: hooks.onColor || ((hex) => apply((m) => ({ ...m, stops: recolorStop(m.stops, idx, hex) }), { live: true, gradientOnly })),
      onDone: hooks.onDone || ((commit) => {
        if (noTargets) { shown = commit ? shown : original; core.setLast(shown); }
        if (commit) finish('Gradient Stop Color'); else abort();
        sync();
      }),
    });
  }

  /* ───────────── swatches ───────────── */
  const swatchItems = () => [...GRADIENT_PRESETS.map((p) => ({ ...p, preset: true })), ...core.loadSwatches()];
  function toggleMenu(force) {
    const menu = $('vgrad_menu');
    const open = force ?? menu.hidden;
    menu.hidden = !open;
    $('vgrad_menu_btn').setAttribute('aria-expanded', String(open));
    if (!open) return;
    menu.innerHTML = swatchItems().map((s) => `<div class="vgrad-menu-item" role="menuitem" tabindex="-1" data-swatch="${s.id}"><span class="vgrad-chip" style="background-image:${cssGradient(s, { angle: 90 })}"></span><span class="vgrad-menu-name">${escName(s.name)}</span>${s.preset ? '' : `<button type="button" class="vgrad-menu-del" data-del="${s.id}" title="Delete swatch" aria-label="Delete ${escName(s.name)}">×</button>`}</div>`).join('')
      + '<div class="vgrad-menu-sep"></div><div class="vgrad-menu-item vgrad-menu-add" role="menuitem" tabindex="-1" data-add="1" id="vgrad_add_swatch">Add to Swatches</div>';
  }
  function addCurrentToSwatches() {
    const list = core.loadSwatches();
    core.setSwatches([...list, swatchFromModel(shown, `Gradient ${list.length + 1}`)]);
    renderSwatchSection();
  }
  /** Apply a swatch/preset: a rebased copy per object (its own bbox). */
  function applyPreset(sw) {
    const s = normalizeSwatch(sw);
    const attr = activeAttr();
    const els = core.targets(attr);
    if (!els.length) { shown = normalizeModel({ ...s }); shownHasGradient = false; core.setLast(shown); render(); return; }
    core.applyModels(els, attr, (el) => defaultModel(core.bboxOf(el), s), 'Apply Gradient Swatch');
    sync();
  }
  /** "." — gradient fill mode: apply the last-used gradient where there is none. */
  function applyLastGradient() {
    const attr = activeAttr();
    const els = core.targets(attr).filter((el) => !core.gradientNodeFor(el, attr));
    if (!els.length) { if (core.zeroAreaOnly(attr)) core.toastMsg('Gradients need an area — use Object ▸ Outline Stroke for lines'); return; }
    core.applyModels(els, attr, (el) => core.seedModel(el, attr), 'Gradient');
    sync();
  }
  // , = Color mode: a flat colour replaces the gradient even while a stop is selected.
  const applyLastColor = () => { const st = cs()?.getState?.(); if (st) { clearStopSelection(); cs().setWorkingColor(st.workingHex || '#000000', { toStop: false }); } };

  function renderSwatchSection() {
    const host = document.querySelector('#vcs_swatches_panel .vcs-swatches-panel-content');
    if (!host) return;
    let sec = host.querySelector('#vgrad_swatch_section');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'vgrad_swatch_section';
      sec.innerHTML = '<div class="vcs-section-label">Gradients</div><div class="vgrad-swatch-grid" id="vgrad_swatch_grid"></div>';
      host.insertBefore(sec, host.querySelector('.swatches_schemes_wrapper'));
      sec.addEventListener('click', (e) => {
        const b = e.target.closest('[data-swatch]');
        const sw = b && swatchItems().find((s) => s.id === b.dataset.swatch);
        if (sw) applyPreset(sw);
      });
    }
    sec.querySelector('#vgrad_swatch_grid').innerHTML = swatchItems().map((s) => `<button type="button" class="vgrad-swatch" data-swatch="${s.id}" title="${escName(s.name)}" aria-label="${escName(s.name)}" style="background-image:${cssGradient(s, { angle: 90 })}"></button>`).join('');
  }
  const swPanel = document.getElementById('vcs_swatches_panel') || document.getElementById('vdock_flyout');
  if (swPanel && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      if (document.querySelector('#vcs_swatches_panel .vcs-swatches-panel-content') && !document.getElementById('vgrad_swatch_section')) renderSwatchSection();
    }).observe(swPanel, { childList: true, subtree: true });
  }
  renderSwatchSection();

  /* ───────────── Tools panel: Color / Gradient / None ───────────── */
  (function injectModeButtons() {
    const host = document.getElementById('tools_left_swatches');
    if (!host || document.getElementById('tool_paint_modes')) return;
    const row = document.createElement('div');
    row.id = 'tool_paint_modes';
    row.className = 'vgrad-paint-modes';
    row.innerHTML = `<button type="button" id="tool_paint_color" title="Color (,)" aria-label="Color"><span class="vgrad-pm-color"></span></button><button type="button" id="tool_paint_gradient" title="Gradient (.)" aria-label="Gradient"><span class="vgrad-pm-gradient"></span></button><button type="button" id="tool_paint_none" title="None (/)" aria-label="None"><span class="vgrad-pm-none"></span></button>`;
    host.after(row); // under the Fill/Stroke boxes, like Illustrator's Color · Gradient · None row
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.target.closest('button')?.id;
      if (id === 'tool_paint_color') applyLastColor();
      else if (id === 'tool_paint_gradient') applyLastGradient();
      else if (id === 'tool_paint_none') cs()?.setWorkingColor?.('none');
    });
  })();

  /* ───────────── wiring ───────────── */
  if (pane) {
    $('vgrad_thumb').addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) { selStop = 0; selMid = -1; applyPreset(GRADIENT_PRESETS[0]); return; }
      const keep = normalizeModel(shown);
      apply((m, el) => ({ ...convertType(keep.type)(m, el), stops: keep.stops }));
    });
    for (const t of ['linear', 'radial']) $(`vgrad_type_${t}`).addEventListener('click', () => apply(convertType(t), { label: 'Gradient Type' }));
    $('vgrad_edit').addEventListener('click', () => document.getElementById('tool_gradient')?.click());
    $('vgrad_reverse').addEventListener('click', () => { selStop = shown.stops.length - 1 - selStop; apply((m) => ({ ...m, stops: reverseStops(m.stops) }), { label: 'Reverse Gradient' }); });
    $('vgrad_fs_fill').addEventListener('click', () => cs()?.setActiveTarget?.('fill'));
    $('vgrad_fs_stroke').addEventListener('click', () => cs()?.setActiveTarget?.('stroke'));
    const numInput = (id, fn) => {
      const input = $(id);
      const val = () => (input.value !== '' && Number.isFinite(Number(input.value)) ? Number(input.value) : null);
      input.addEventListener('input', () => { if (val() != null) fn(val(), true); });
      input.addEventListener('change', () => { if (val() != null) fn(val(), false); else { finish(); render(); } });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { abort(); sync(); input.blur(); } });
    };
    numInput('vgrad_angle', (v, live) => apply((m, el) => (m.type === 'linear' ? { ...m, ...fitLinear(el ? core.bboxOf(el) : { width: 100, height: 100 }, v) } : { ...m, angle: v }), { live, label: 'Gradient Angle' }));
    numInput('vgrad_aspect', (v, live) => apply((m) => ({ ...m, aspect: Math.max(1, v) }), { live, label: 'Gradient Aspect Ratio' }));
    // Opacity / Location act on the selected stop; focusing them selects the current one so it is visible.
    for (const id of ['vgrad_opacity', 'vgrad_location']) $(id).addEventListener('focus', () => { if (!stopActive && selMid < 0 && shownHasGradient) selectStop(selStop, { showColor: false }); });
    numInput('vgrad_opacity', (v, live) => { const i = selStop; apply((m) => ({ ...m, stops: m.stops.map((s, k) => (k === i ? { ...s, a: Math.min(1, Math.max(0, v / 100)) } : s)) }), { live, label: 'Gradient Stop Opacity' }); });
    numInput('vgrad_location', (v, live) => {
      if (selMid >= 0) { const k = selMid; apply((m) => ({ ...m, stops: m.stops.map((s, j) => (j === k ? { ...s, mid: Math.min(MID_MAX, Math.max(MID_MIN, v)) } : s)) }), { live, label: 'Gradient Midpoint' }); return; }
      const res = moveStop(shown.stops, selStop, v / 100);
      selStop = res.index;
      apply(withStops(res.stops), { live, label: 'Gradient Stop Location' });
    });
    $('vgrad_delete').addEventListener('click', () => deleteSelectedStop());
    $('vgrad_menu_btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    $('vgrad_menu').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { core.setSwatches(core.loadSwatches().filter((s) => s.id !== del.dataset.del)); toggleMenu(true); renderSwatchSection(); return; }
      if (e.target.closest('[data-add]')) { addCurrentToSwatches(); toggleMenu(false); return; }
      const item = e.target.closest('[data-swatch]');
      const sw = item && swatchItems().find((s) => s.id === item.dataset.swatch);
      toggleMenu(false);
      if (sw) applyPreset(sw);
    });
    document.addEventListener('pointerdown', (e) => { if (!$('vgrad_menu').hidden && !e.target.closest('#vgrad_menu, #vgrad_menu_btn')) toggleMenu(false); }, true);
    bindSlider();
  }

  // Keys: . (gradient)  , (colour). / (None) stays in the colour system; G is a tool key.
  const typing = (e) => window.__visterasIsTypingDirectly || e.composedPath?.().some((n) => n?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n?.nodeName));
  document.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '.' || e.key === '>') { e.preventDefault(); e.stopImmediatePropagation(); applyLastGradient(); }
    else if (e.key === ',' || e.key === '<') { e.preventDefault(); e.stopImmediatePropagation(); applyLastColor(); }
  }, true);
  // Esc deselects a selected stop first (fields, dialogs, the colour picker and canvas drags keep their own Esc).
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !stopActive || session || core.busy || typing(e)) return;
    if (document.querySelector('#vcs_picker_modal.open, dialog[open]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    clearStopSelection();
  }, true);

  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    // A different object (or empty canvas) deselects the stop.
    if (event === 'selected' && stopActive && selIds() !== stopOwner) clearStopSelection();
    if ((event === 'selected' || event === 'changed') && !session && !core.busy) queueMicrotask(sync);
    return result;
  };
  cs()?.subscribe?.(() => { if (!session && !core.busy) sync(); });

  window.__visterasGradientStopRoute = {
    isActive: () => stopLive(),
    recolor: (hex, opts) => recolorSelectedStop(hex, opts),
    /** Fill/Stroke well picker while a stop is selected → the stop's colour picker (one undo step on OK). */
    openPicker: () => { if (!stopLive()) return false; openColorPopover($('vgrad_stops')?.querySelector(`[data-stop="${selStop}"]`)?.getBoundingClientRect(), {}, { gradientOnly: true }); return true; },
    clear: () => clearStopSelection(),
  };

  return {
    sync,
    render,
    openColorPopover,
    setShown: (m, has = true) => { shown = normalizeModel(m); shownHasGradient = has; render(); },
    getShown: () => normalizeModel(shown),
    setSelectedStop: (i) => { selStop = i; selMid = -1; render(); },
    getSelectedStop: () => selStop,
    selectStop,
    clearStopSelection,
    stopSelection: () => ({ active: stopLive(), index: selStop }),
    onStopSelection: (fn) => { stopListeners.add(fn); return () => stopListeners.delete(fn); },
    hasSession: () => !!session,
    api: {
      shown: () => normalizeModel(shown),
      selectedStop: () => selStop,
      setSelectedStop: (i) => { selStop = i; selMid = -1; render(); },
      selectStop: (i) => selectStop(i),
      clearStopSelection: () => clearStopSelection(),
      stopSelection: () => ({ active: stopLive(), index: selStop }),
      applyPreset,
      applyLastGradient,
      swatches: () => core.loadSwatches().map((s) => ({ ...s })),
      renderPanel: sync,
    },
  };
}
