/**
 * Visteras Vector — arrow-key nudge for the Selection tool (Illustrator).
 *
 * ←↑→↓ move the selected object(s) 1 pt (document units, independent of
 * zoom), Shift = 10 pt; with grid snapping on, the step is the snapping step.
 * Each press is one undo step. Direct Selection keeps its own anchor nudge.
 *
 * Why this exists: SVG-Edit's own arrow shortcut needs
 * svgEditor.selectedElement, which Vector never sets because index.html binds
 * the canvas 'selected' event to its properties sync (bind() replaces the
 * previous handler) — so the stock nudge silently did nothing.
 */

export const NUDGE_KEYS = Object.freeze({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] });

/** Delta for a key, or null when the key is not a plain/Shift arrow. */
export function nudgeDelta({ key, shiftKey = false, altKey = false, metaKey = false, ctrlKey = false } = {}, gridStep = 0) {
  const dir = NUDGE_KEYS[String(key || '').toLowerCase()];
  if (!dir || altKey || metaKey || ctrlKey) return null;
  const unit = gridStep > 0 ? gridStep : 1;
  const step = (shiftKey ? 10 : 1) * unit;
  return { dx: dir[0] * step, dy: dir[1] * step };
}

/** True when the key event belongs to a text field / editable (never nudge). */
export function isTypingTarget(e) {
  if (!e) return false;
  if (e.isComposing) return true;
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
  return path.some((el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.nodeName)));
}

const NUDGE_MODES = new Set(['select', 'multiselect']);

export function mountNudge(editor) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasNudgeMounted) return;
  window.__visterasNudgeMounted = true;
  const stats = { nudges: 0 };
  window.__visterasNudge = { stats, nudgeDelta };
  document.addEventListener('keydown', (e) => {
    if (window.__visterasIsTypingDirectly || isTypingTarget(e)) return;
    if (!NUDGE_MODES.has(String(sc.getMode?.()))) return;
    const cfg = sc.getCurConfig?.() || {};
    const delta = nudgeDelta(e, cfg.gridSnapping ? Number(cfg.snappingStep) || 0 : 0);
    if (!delta) return;
    const els = (sc.getSelectedElements?.() || []).filter((el) => el?.isConnected);
    if (!els.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // Arrays skip moveSelectedElements' division by zoom: document units.
    const n = els.length;
    // Inside/Outside rings follow their bodies, also on undo/redo.
    const syncRings = () => { try { window.__visterasLiveSyncStrokeAlign?.(els.filter((el) => el.isConnected), sc); } catch { /* ignore */ } };
    try {
      const batch = sc.moveSelectedElements(Array(n).fill(delta.dx), Array(n).fill(delta.dy), false);
      if (batch && !batch.isEmpty?.()) {
        const apply = batch.apply.bind(batch), unapply = batch.unapply.bind(batch);
        batch.apply = (h) => { apply(h); syncRings(); };
        batch.unapply = (h) => { unapply(h); syncRings(); };
        sc.addCommandToHistory(batch);
        stats.nudges++;
      }
    } catch (err) { console.warn('[Visteras] nudge failed', err); }
    syncRings();
    try { window.__updatePropertiesVisibility?.(); } catch { /* ignore */ }
  }, true);
}

export default mountNudge;
