/**
 * Visteras Vector — symbol-instance guards for path operations (gravit-gap-5).
 *
 * Illustrator: Pathfinder, Offset Path, Outline Stroke, Create Outlines,
 * Compound Path and Image Trace don't work on a symbol instance. Instead of
 * silently skipping it (or a generic Pathfinder error) we toast
 * "Break link to symbol first" with a **Break Link & Continue** button that
 * breaks the link and re-runs the command; synchronous commands land as one
 * undo step.
 */
import { breakLinks } from './visteras-symbols-model.js';

export const GUARDED_ACTIONS = [
  'action_offset_path', 'action_outline_stroke', 'action_create_outlines', 'action_compound_make', 'action_image_trace',
  ...['unite', 'minus_front', 'intersect', 'exclude', 'divide'].flatMap((op) => [`btn_pathfinder_${op}`, `popup_pathfinder_${op}`]),
];
export const GUARD_MESSAGE = 'Break link to symbol first';

export function selectionInstances(elements) {
  return (elements || []).filter((el) => el?.localName === 'use');
}

export function guardedActionFor(target) {
  const el = target?.closest?.(GUARDED_ACTIONS.map((id) => `#${id}`).join(','));
  return el || null;
}

/** Fold every history entry since `pointer` into one batch (no-op for 0–1 entries). */
export function mergeHistorySince(undoMgr, pointer, BatchCommand, label) {
  if (!undoMgr || !BatchCommand) return false;
  const end = undoMgr.undoStackPointer;
  if (end - pointer < 2) return false;
  const cmds = undoMgr.undoStack.slice(pointer, end);
  const batch = new BatchCommand(label);
  for (const c of cmds) batch.addSubCommand(c);
  undoMgr.undoStack = undoMgr.undoStack.slice(0, pointer);
  undoMgr.undoStack.push(batch);
  undoMgr.undoStackPointer = pointer + 1;
  return true;
}

export function labelOf(el) {
  const t = (el?.getAttribute?.('title') || el?.textContent || '').replace(/\s+/g, ' ').trim();
  return t.replace(/\s*\(.*\)\s*$/, '').replace(/\s*[⇧⌘⌥⌃].*$/, '').replace(/…$/, '') || 'Continue';
}

export function mountSymbolGuards(editor) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasSymbolGuards) return window.__visterasSymbolGuards || null;
  let bypass = false;

  function hideToast() { document.getElementById('vsym_guard_toast')?.remove(); }
  function showToast(onContinue) {
    hideToast();
    const t = document.createElement('div');
    t.id = 'vsym_guard_toast';
    t.className = 'vsym_guard_toast';
    t.setAttribute('role', 'alert');
    t.innerHTML = `<span>${GUARD_MESSAGE}</span>
      <button type="button" class="vui-btn vui-btn-primary" id="vsym_guard_continue">Break Link &amp; Continue</button>
      <button type="button" class="vui-btn" id="vsym_guard_dismiss" aria-label="Dismiss">✕</button>`;
    document.body.append(t);
    t.querySelector('#vsym_guard_continue').addEventListener('click', () => { hideToast(); onContinue(); });
    t.querySelector('#vsym_guard_dismiss').addEventListener('click', hideToast);
    setTimeout(() => { if (t.isConnected) t.remove(); }, 10000);
  }

  function breakAndContinue(trigger) {
    const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
    const uses = selectionInstances(sel);
    const rest = sel.filter((el) => !uses.includes(el));
    const undoMgr = sc.undoMgr;
    const p0 = undoMgr?.undoStackPointer ?? 0;
    const r = breakLinks(sc, uses);
    if (r.error) return;
    sc.clearSelection?.();
    sc.addToSelection?.([...rest, ...r.groups], true);
    bypass = true;
    try { trigger.click(); } finally { bypass = false; }
    // Synchronous commands (Pathfinder, Compound Path, Outline Stroke, Create
    // Outlines) have pushed their step by now: fold both into one undo step.
    mergeHistorySince(undoMgr, p0, sc.history?.BatchCommand, `Break Link & ${labelOf(trigger)}`);
    sc.call?.('changed', sc.getSelectedElements?.() || []);
  }

  document.addEventListener('click', (e) => {
    if (bypass) return;
    const trigger = guardedActionFor(e.target);
    if (!trigger || trigger.classList.contains('disabled')) return;
    const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
    if (!selectionInstances(sel).length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showToast(() => breakAndContinue(trigger));
  }, true);

  window.__visterasSymbolGuards = { breakAndContinue, hideToast };
  return window.__visterasSymbolGuards;
}
