/**
 * Visteras Vector — Edit Symbol in isolation (gravit-gap-5).
 * Enter: double-click an instance, double-click a Symbols-panel thumbnail, or
 * context menu ▸ Edit Symbol. The symbol's children move into a temporary
 * <g data-v-symbol-edit> carrying the instance transform (ids, gradients and
 * vfx_ filters stay stable); an id-stripped placeholder clone stays in the
 * <symbol> so other instances keep rendering. setContext(group) dims the rest.
 * Exit: Esc, double-click empty canvas, or ◀ in the gray bar. The whole session
 * collapses to ONE undo step ("Edit Symbol"). Saving / exporting while editing
 * serializes the committed symbol (suspend → serialize → resume).
 */
import { ATTR, isPanelSymbol, symbolIdOfUse, readSymbolMeta, placeInstance } from './visteras-symbols-model.js?v=gap5-1';

export const EDIT_ALERT_KEY = 'visteras-vector-symbol-edit-alert';
const NS = 'http://www.w3.org/2000/svg';
const PLACEHOLDER = 'data-v-symbol-placeholder';

export const contentChildren = (sym) => [...sym.children].filter((c) => c.localName !== 'title');

export function stripIds(node) {
  node.removeAttribute?.('id');
  for (const c of node.querySelectorAll?.('[id]') || []) c.removeAttribute('id');
  return node;
}

export function snapshotChildren(sym) {
  return contentChildren(sym).map((c) => c.cloneNode(true));
}

export function serializeNodes(nodes) {
  if (typeof XMLSerializer === 'undefined') return nodes.map((n) => n.outerHTML || '').join('');
  const s = new XMLSerializer();
  return nodes.map((n) => s.serializeToString(n)).join('');
}

/** Replace a symbol's content children with clones of `nodes` (title kept). */
export function setSymbolChildren(sym, nodes) {
  for (const c of contentChildren(sym)) c.remove();
  for (const n of nodes) sym.appendChild(n.cloneNode(true));
}

/** One history step for a whole editing session. */
export class SymbolEditCommand {
  constructor(sc, symbol, before, after, revBefore, revAfter) {
    this.sc = sc;
    this.symbol = symbol;
    this.before = before;
    this.after = after;
    this.revBefore = revBefore;
    this.revAfter = revAfter;
    this.text = 'Edit Symbol';
  }
  getText() { return this.text; }
  type() { return 'SymbolEditCommand'; }
  elements() { return [this.symbol]; }
  isEmpty() { return false; }
  apply() {
    setSymbolChildren(this.symbol, this.after);
    if (this.revAfter != null) this.symbol.setAttribute(ATTR.rev, this.revAfter);
    this.sc?.call?.('changed', [this.symbol]);
  }
  unapply() {
    setSymbolChildren(this.symbol, this.before);
    if (this.revBefore != null) this.symbol.setAttribute(ATTR.rev, this.revBefore);
    this.sc?.call?.('changed', [this.symbol]);
  }
}

/**
 * Collapse every history entry pushed since `pointer` and push `cmd` (if any).
 * Clears redo entries correctly.
 */
export function collapseHistory(undoMgr, pointer, cmd) {
  if (!undoMgr) return;
  const keep = Math.max(0, Math.min(pointer, undoMgr.undoStackPointer));
  undoMgr.undoStack = undoMgr.undoStack.slice(0, keep);
  undoMgr.undoStackPointer = keep;
  if (cmd) undoMgr.addCommandToHistory(cmd);
}

export function mountSymbolEdit(editor) {
  const sc = editor.svgCanvas;
  let state = null;

  const toast = (m) => window.__visterasToast?.(m);
  const isTyping = () => {
    const a = document.activeElement;
    const tag = a?.tagName?.toLowerCase();
    return ['input', 'textarea', 'select'].includes(tag) || a?.isContentEditable;
  };

  /* ── Gray bar ───────────────────────────────────────────────────────── */
  function showBar(name) {
    const host = document.getElementById('workarea') || document.body;
    let bar = document.getElementById('vsym_edit_bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'vsym_edit_bar';
      bar.setAttribute('role', 'toolbar');
      bar.innerHTML = '<button type="button" id="vsym_edit_back" aria-label="Exit Symbol Editing Mode" title="Exit Symbol Editing Mode (Esc)">◀</button><span id="vsym_edit_label"></span>';
      bar.querySelector('#vsym_edit_back').addEventListener('click', () => exit());
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.prepend(bar);
    }
    bar.querySelector('#vsym_edit_label').textContent = `Symbol Editing Mode: ${name}`;
    bar.hidden = false;
    document.body.classList.add('visteras-symbol-editing');
  }
  function hideBar() {
    const bar = document.getElementById('vsym_edit_bar');
    if (bar) bar.hidden = true;
    document.body.classList.remove('visteras-symbol-editing');
  }

  /* ── "Changes affect all instances" alert (Don't Show Again) ─────────── */
  function alertSuppressed() { try { return localStorage.getItem(EDIT_ALERT_KEY) === '1'; } catch { return false; } }
  function showEditAlert() {
    if (alertSuppressed()) return;
    document.getElementById('vsym_edit_alert')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'vsym_edit_alert';
    overlay.className = 'vui-overlay vsym_overlay';
    overlay.innerHTML = `
      <div class="vui-dialog vsym_dialog" role="alertdialog" aria-modal="true" aria-labelledby="vsym_edit_alert_msg">
        <p id="vsym_edit_alert_msg">You are about to edit the symbol definition. Any changes you make will be applied to all instances of the symbol.</p>
        <label style="display:flex;gap:6px;align-items:center;margin-top:8px;"><input type="checkbox" id="vsym_edit_alert_dontshow"> Don't Show Again</label>
        <div class="vsym_dlg_actions"><button type="button" class="vui-btn vui-btn-primary" id="vsym_edit_alert_ok">OK</button></div>
      </div>`;
    document.body.append(overlay);
    const close = () => {
      if (overlay.querySelector('#vsym_edit_alert_dontshow').checked) {
        try { localStorage.setItem(EDIT_ALERT_KEY, '1'); } catch { /* private mode */ }
      }
      overlay.remove();
    };
    overlay.querySelector('#vsym_edit_alert_ok').addEventListener('click', close);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); } });
    setTimeout(() => overlay.querySelector('#vsym_edit_alert_ok').focus(), 0);
  }

  /* ── Enter / exit ───────────────────────────────────────────────────── */
  function enter(use, { tempUse = false, pointer = null } = {}) {
    if (!use || use.localName !== 'use') return false;
    const sym = sc.getSvgContent().ownerDocument.getElementById(symbolIdOfUse(use));
    if (!isPanelSymbol(sym)) { toast('Only Symbols-panel symbols can be edited'); return false; }
    if (state) exit();
    const undoMgr = sc.undoMgr;
    const p0 = pointer != null ? pointer : (undoMgr?.undoStackPointer ?? 0);
    const before = snapshotChildren(sym);
    const revBefore = sym.getAttribute(ATTR.rev);

    const group = sc.getSvgContent().ownerDocument.createElementNS(NS, 'g');
    group.id = sc.getNextId?.() || `symedit_${sym.id}`;
    group.setAttribute(ATTR.edit, '1');
    group.setAttribute('data-v-symbol-edit-of', sym.id);
    const xf = use.getAttribute('transform');
    if (xf) group.setAttribute('transform', xf);
    use.parentNode.insertBefore(group, use.nextSibling);

    for (const child of contentChildren(sym)) group.appendChild(child);
    for (const child of [...group.children]) {
      const ph = stripIds(child.cloneNode(true));
      ph.setAttribute(PLACEHOLDER, '1');
      sym.appendChild(ph);
    }
    const prevVis = use.getAttribute('visibility');
    use.setAttribute('visibility', 'hidden');

    state = { use, sym, group, p0, before, revBefore, prevVis, tempUse, name: readSymbolMeta(sym).name };
    try { sc.clearSelection?.(); sc.setContext?.(group); } catch { /* ignore */ }
    showBar(state.name);
    showEditAlert();
    return true;
  }

  function detach() {
    // Placeholders out, real children back into the symbol, group out, instance visible.
    const { sym, group, use, prevVis } = state;
    for (const ph of [...sym.querySelectorAll(`[${PLACEHOLDER}]`)]) ph.remove();
    for (const child of [...group.children]) sym.appendChild(child);
    const parent = group.parentNode, next = group.nextSibling;
    group.remove();
    if (prevVis == null) use.removeAttribute('visibility'); else use.setAttribute('visibility', prevVis);
    return { parent, next };
  }
  function reattach({ parent, next }) {
    const { sym, group, use } = state;
    parent.insertBefore(group, next && next.parentNode === parent ? next : null);
    for (const child of contentChildren(sym)) group.appendChild(child);
    for (const child of [...group.children]) {
      const ph = stripIds(child.cloneNode(true));
      ph.setAttribute(PLACEHOLDER, '1');
      sym.appendChild(ph);
    }
    use.setAttribute('visibility', 'hidden');
    try { if (sc.getCurrentGroup?.() !== group) sc.setContext?.(group); } catch { /* ignore */ }
  }

  /** Run fn with the symbol temporarily committed (save / export while editing). */
  function withCommitted(fn) {
    if (!state) return fn();
    const pos = detach();
    try { return fn(); } finally { reattach(pos); }
  }

  function exit() {
    if (!state) return false;
    const s = state;
    try { sc.leaveContext?.(); } catch { /* ignore */ }
    detach();
    let after = snapshotChildren(s.sym);
    let cmd = null;
    if (serializeNodes(after) !== serializeNodes(s.before)) {
      const revAfter = String((Number(s.revBefore) || 1) + 1);
      s.sym.setAttribute(ATTR.rev, revAfter);
      cmd = new SymbolEditCommand(sc, s.sym, s.before, after, s.revBefore, revAfter);
    }
    if (s.tempUse) s.use.remove();
    collapseHistory(sc.undoMgr, s.p0, cmd);
    state = null;
    hideBar();
    try {
      sc.clearSelection?.();
      if (!s.tempUse && s.use.parentNode) sc.addToSelection?.([s.use], true);
      sc.call?.('changed', [s.sym]);
    } catch { /* ignore */ }
    window.__visterasSymbols?.render?.();
    return true;
  }

  /** Panel double-click: edit via the first instance, or a temporary one at view center. */
  function editSymbol(sym) {
    if (!isPanelSymbol(sym)) return false;
    const existing = [...sc.getSvgContent().querySelectorAll('use')].find((u) => symbolIdOfUse(u) === sym.id && u.getAttribute('visibility') !== 'hidden');
    if (existing) return enter(existing);
    const p0 = sc.undoMgr?.undoStackPointer ?? 0;
    const wa = document.getElementById('workarea');
    let at = { x: 0, y: 0 };
    if (wa) {
      const r = wa.getBoundingClientRect();
      const m = sc.getSvgContent().getScreenCTM?.();
      if (m) { const pt = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(m.inverse()); at = { x: pt.x, y: pt.y }; }
    }
    const r = placeInstance(sc, sym, at);
    if (!r.use) return false;
    return enter(r.use, { tempUse: true, pointer: p0 });
  }

  /* ── Triggers ───────────────────────────────────────────────────────── */
  const canvas = document.getElementById('svgcanvas') || document.getElementById('workarea');
  canvas?.addEventListener('dblclick', (e) => {
    const svg = sc.getSvgContent();
    const target = e.target;
    if (state) {
      if (!state.group.contains(target)) { e.preventDefault(); e.stopImmediatePropagation(); exit(); }
      return;
    }
    const use = target?.closest?.('use');
    if (use && svg.contains(use) && !use.closest('defs') && isPanelSymbol(svg.ownerDocument.getElementById(symbolIdOfUse(use)))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      enter(use);
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!state || e.key !== 'Escape' || isTyping()) return;
    if (document.querySelector('.vsym_overlay, .vui-overlay')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    exit();
  }, true);

  // Save while editing: serialize the committed symbol. SVG-Edit's serializer leaves
  // any context, so reattach() re-enters it.
  const getSvgString = sc.getSvgString?.bind(sc);
  if (getSvgString && !sc.getSvgString.__visterasSymbolEdit) {
    sc.getSvgString = function (...args) { return withCommitted(() => getSvgString(...args)); };
    sc.getSvgString.__visterasSymbolEdit = true;
  }
  // A document reset / open drops any session without touching history.
  window.addEventListener('visteras:canvas-reset', () => { if (state) { state = null; hideBar(); } });

  const api = {
    enter, exit, editSymbol, withCommitted,
    isEditing: () => !!state,
    current: () => (state ? { symbolId: state.sym.id, groupId: state.group.id, name: state.name } : null),
    cloneCommitted: () => withCommitted(() => sc.getSvgContent().cloneNode(true)),
  };
  window.__visterasSymbolEdit = api;
  return api;
}

export default mountSymbolEdit;
