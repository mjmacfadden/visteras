/**
 * Visteras Vector — Pen tool Auto Add/Delete (Illustrator behaviour).
 *
 * Pure hover-state resolver + the "Disable Auto Add/Delete" preference.
 *
 * States (and cursors):
 *   close     drawing, over the start anchor          pen_close   (o)
 *   draw      drawing, anywhere else                  pen
 *   continue  over an end anchor of an open path      pen_continue (/)
 *   delete    over an anchor of a SELECTED path       pen_delete  (−)
 *   add       over a segment of a SELECTED path       pen_add     (+)
 *   new       anywhere else (also: Shift held)        pen
 *
 * Shift disables Auto Add/Delete (and continue) so a new anchor can be placed
 * on top of an existing point or segment; the path being drawn never gets
 * add/delete, only close.
 */

export const PEN_PREF_KEY = 'visteras_vector_pen_disable_auto_add_delete';

const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

/** Preference: Disable Auto Add/Delete (default off). */
export function getDisableAutoAddDelete(storage = store()) {
  try { return storage?.getItem(PEN_PREF_KEY) === '1'; } catch { return false; }
}
export function setDisableAutoAddDelete(value, storage = store()) {
  try { storage?.setItem(PEN_PREF_KEY, value ? '1' : '0'); } catch { /* ignore */ }
  return !!value;
}

export const PEN_CURSORS = Object.freeze({
  close: 'pen_close', draw: 'pen', continue: 'pen_continue', delete: 'pen_delete', add: 'pen_add', new: 'pen',
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @param {object} input
 * @param {{x:number,y:number}} input.pointer screen point
 * @param {boolean} [input.shift]
 * @param {boolean} [input.autoDisabled] Disable Auto Add/Delete preference
 * @param {null|{start:{x:number,y:number}, canClose?:boolean}} [input.drawing]
 * @param {Array<{ref:any, selected:boolean, anchors:Array<{index:number,x:number,y:number,endpoint?:boolean}>, segment?:null|{index:number,t:number,distance:number}}>} [input.targets]
 *   screen-space anchors; `endpoint` marks the ends of open contours; `segment`
 *   is the nearest segment hit (distance squared, px²) for selected targets.
 * @param {number} [input.anchorRadius=8]
 * @param {number} [input.closeRadius=6] matches SVG-Edit's own close test
 * @returns {{state:string, cursor:string, ref?:any, index?:number, t?:number}}
 */
export function resolvePenHover(input) {
  const { pointer, shift = false, autoDisabled = false, drawing = null, targets = [], anchorRadius = 8, closeRadius = 6 } = input || {};
  const out = (state, extra = {}) => ({ state, cursor: PEN_CURSORS[state], ...extra });
  if (!pointer) return out(drawing ? 'draw' : 'new');
  if (drawing) {
    if (drawing.canClose !== false && drawing.start && dist(pointer, drawing.start) <= closeRadius) return out('close');
    return out('draw');
  }
  if (shift) return out('new');
  // Nearest anchor (selected targets win ties).
  let best = null;
  for (const t of targets) {
    for (const a of t.anchors || []) {
      const d = dist(pointer, a);
      if (d > anchorRadius) continue;
      if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && t.selected && !best.t.selected)) best = { d, t, a };
    }
  }
  if (best) {
    if (best.a.endpoint) return out('continue', { ref: best.t.ref, index: best.a.index });
    if (best.t.selected && !autoDisabled) return out('delete', { ref: best.t.ref, index: best.a.index });
  }
  if (!autoDisabled) {
    let seg = null;
    for (const t of targets) {
      if (!t.selected || !t.segment) continue;
      if (!seg || t.segment.distance < seg.s.distance) seg = { t, s: t.segment };
    }
    if (seg) return out('add', { ref: seg.t.ref, index: seg.s.index, t: seg.s.t });
  }
  return out('new');
}
