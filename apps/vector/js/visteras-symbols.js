/**
 * Visteras Vector — Symbols panel + commands (gravit-gap-5).
 * Window ▸ Symbols (⇧⌘F11 / Ctrl+Shift+F11), New Symbol (F8), Place, Break Link,
 * Symbol Options, Delete (Expand / Delete Instances), Duplicate, Replace,
 * Redefine, Select All Instances. Ungroup and Object ▸ Expand on an instance
 * route to Break Link (Illustrator). Model: js/visteras-symbols-model.js.
 */
import {
  ATTR, REG_POINTS, REG_DEFAULT, isPanelSymbol, isInstance, symbolIdOfUse,
  getPanelSymbols, instancesOf, readSymbolMeta, writeSymbolMeta,
  createSymbol, placeInstance, breakLinks, duplicateSymbol, replaceSymbol,
  redefineSymbol, deleteSymbol, selectAllInstances,
} from './visteras-symbols-model.js?v=gap5-1';

export const VIEW_KEY = 'visteras-vector-symbols-view';
const NS = 'http://www.w3.org/2000/svg';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (msg) => (window.__visterasToast ? window.__visterasToast(msg) : console.warn(msg));

/** F8 = New Symbol (no modifiers). */
export function isNewSymbolShortcut(e) {
  return (e?.key === 'F8' || e?.code === 'F8') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
}

/** Selection → top-level, non-layer, non-defs elements. */
export function symbolizableSelection(elements) {
  return (elements || []).filter((el) => el && el.id && !el.classList?.contains?.('layer') && !el.closest?.('defs'));
}

export function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'thumbnails'; } catch { return 'thumbnails'; }
}
export function writeView(v) {
  try { localStorage.setItem(VIEW_KEY, v === 'list' ? 'list' : 'thumbnails'); } catch { /* private mode */ }
}

export function mountSymbols(editor) {
  const sc = editor.svgCanvas;
  const content = () => sc.getSvgContent();
  let selectedId = null;

  /* ── Pane ─────────────────────────────────────────────────────────── */
  const ensurePane = () => {
    let pane = document.getElementById('vdock_symbols_panel');
    if (!pane) {
      const body = document.getElementById('vdock_flyout_body');
      if (!body) return null;
      pane = document.createElement('div');
      pane.id = 'vdock_symbols_panel';
      pane.className = 'vdock-panel-pane';
      pane.style.display = 'none';
      body.appendChild(pane);
    }
    if (!pane.querySelector('#vsym_list')) {
      pane.innerHTML = `
        <div class="vsym_toolbar">
          <button type="button" id="vsym_view" class="vsym_btn" title="Toggle thumbnail / list view" aria-label="Toggle view">☷</button>
          <span class="vsym_spacer"></span>
          <button type="button" id="vsym_menu_btn" class="vsym_btn" aria-haspopup="true" aria-expanded="false" title="Symbols panel menu" aria-label="Symbols panel menu">≡</button>
        </div>
        <div id="vsym_menu" class="vsym_menu" role="menu" hidden>
          <button type="button" role="menuitem" data-cmd="redefine">Redefine Symbol</button>
          <button type="button" role="menuitem" data-cmd="duplicate">Duplicate Symbol</button>
          <button type="button" role="menuitem" data-cmd="replace">Replace Symbol</button>
          <button type="button" role="menuitem" data-cmd="selectInstances">Select All Instances</button>
          <button type="button" role="menuitem" data-cmd="selectUnused">Select All Unused</button>
          <button type="button" role="menuitem" data-cmd="options">Symbol Options…</button>
        </div>
        <div id="vsym_list" class="vsym_list" role="listbox" aria-label="Symbols"></div>
        <div class="vsym_footer">
          <button type="button" id="vsym_place" class="vsym_btn" title="Place Symbol Instance" aria-label="Place Symbol Instance">${ICON.place}</button>
          <button type="button" id="vsym_break" class="vsym_btn" title="Break Link to Symbol" aria-label="Break Link to Symbol">${ICON.breakLink}</button>
          <button type="button" id="vsym_options" class="vsym_btn" title="Symbol Options" aria-label="Symbol Options">⚙</button>
          <button type="button" id="vsym_new" class="vsym_btn" title="New Symbol (F8) — ⌥-click skips the dialog" aria-label="New Symbol">＋</button>
          <button type="button" id="vsym_delete" class="vsym_btn" title="Delete Symbol" aria-label="Delete Symbol">🗑</button>
        </div>`;
      wirePane(pane);
    }
    return pane;
  };

  const ICON = {
    place: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="9" height="9" rx="1.2"/><path d="M14 14l6 6M20 14v6h-6"/></svg>',
    breakLink: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 12h8M7 8.5a3.5 3.5 0 1 1 0 7M17 8.5a3.5 3.5 0 1 0 0 7"/><path d="M11 10l2 4M13 10l-2 4"/></svg>',
  };

  const symbols = () => getPanelSymbols(content());
  const selectedSymbol = () => symbols().find((s) => s.id === selectedId) || null;
  const selectedInstances = () => (sc.getSelectedElements?.() || []).filter((el) => el && isInstance(el));

  function render() {
    const pane = ensurePane();
    if (!pane) return;
    const list = pane.querySelector('#vsym_list');
    const view = readView();
    list.classList.toggle('vsym_list_rows', view === 'list');
    const syms = symbols();
    if (selectedId && !syms.some((s) => s.id === selectedId)) selectedId = null;
    if (!selectedId) {
      const inst = selectedInstances()[0];
      if (inst) selectedId = symbolIdOfUse(inst);
    }
    list.replaceChildren();
    if (!syms.length) {
      const empty = document.createElement('div');
      empty.className = 'vsym_empty';
      empty.textContent = 'No symbols. Select artwork and press F8.';
      list.append(empty);
    }
    for (const sym of syms) {
      const meta = readSymbolMeta(sym);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'vsym_item';
      item.dataset.id = sym.id;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(sym.id === selectedId));
      item.title = meta.name;
      item.draggable = true;
      const thumb = document.createElementNS(NS, 'svg');
      thumb.setAttribute('class', 'vsym_thumb');
      thumb.setAttribute('width', '40');
      thumb.setAttribute('height', '40');
      thumb.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS(NS, 'use');
      use.setAttribute('href', `#${sym.id}`);
      thumb.append(use);
      item.append(thumb);
      const label = document.createElement('span');
      label.className = 'vsym_name';
      label.textContent = meta.name;
      item.append(label);
      if (meta.type === 'dynamic') {
        const badge = document.createElement('span');
        badge.className = 'vsym_badge';
        badge.textContent = '+';
        badge.title = 'Dynamic symbol';
        item.append(badge);
      }
      list.append(item);
      // Fit thumbnail viewBox to the symbol's rendered content.
      requestAnimationFrame(() => {
        try {
          const b = use.getBBox();
          if (b && b.width > 0 && b.height > 0) {
            const pad = Math.max(b.width, b.height) * 0.08;
            thumb.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
          }
        } catch { /* not rendered yet */ }
      });
    }
    const has = !!selectedSymbol();
    pane.querySelector('#vsym_place').disabled = !has;
    pane.querySelector('#vsym_options').disabled = !has;
    pane.querySelector('#vsym_delete').disabled = !has;
    pane.querySelector('#vsym_break').disabled = !selectedInstances().length;
  }

  function wirePane(pane) {
    const list = pane.querySelector('#vsym_list');
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.vsym_item');
      if (!item) return;
      selectedId = item.dataset.id;
      render();
    });
    list.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.vsym_item');
      if (!item) return;
      const sym = symbols().find((s) => s.id === item.dataset.id);
      if (sym) window.__visterasSymbolEdit?.editSymbol?.(sym);
    });
    list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.vsym_item');
      if (!item) return;
      e.dataTransfer.setData('application/x-visteras-symbol', item.dataset.id);
      e.dataTransfer.setData('text/plain', '');
      e.dataTransfer.effectAllowed = 'copy';
    });
    pane.querySelector('#vsym_view').addEventListener('click', () => { writeView(readView() === 'list' ? 'thumbnails' : 'list'); render(); });
    pane.querySelector('#vsym_place').addEventListener('click', () => api.place());
    pane.querySelector('#vsym_break').addEventListener('click', () => api.breakLink());
    pane.querySelector('#vsym_options').addEventListener('click', () => api.options());
    pane.querySelector('#vsym_new').addEventListener('click', (e) => api.newSymbol({ skipDialog: e.altKey }));
    pane.querySelector('#vsym_delete').addEventListener('click', () => api.remove());
    const menuBtn = pane.querySelector('#vsym_menu_btn');
    const menu = pane.querySelector('#vsym_menu');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    menu.addEventListener('click', (e) => {
      const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      if (!cmd) return;
      if (cmd === 'redefine') api.redefine({ keepArtwork: e.shiftKey });
      if (cmd === 'duplicate') api.duplicate();
      if (cmd === 'replace') api.replace();
      if (cmd === 'selectInstances') api.selectInstances();
      if (cmd === 'selectUnused') api.selectUnused();
      if (cmd === 'options') api.options();
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) menu.hidden = true; });
  }

  /* ── Drop a thumbnail on the canvas: registration point at the drop ── */
  const workarea = document.getElementById('workarea') || document.getElementById('svgcanvas');
  if (workarea) {
    workarea.addEventListener('dragover', (e) => {
      if ([...(e.dataTransfer?.types || [])].includes('application/x-visteras-symbol')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    });
    workarea.addEventListener('drop', (e) => {
      const id = e.dataTransfer?.getData('application/x-visteras-symbol');
      if (!id) return;
      e.preventDefault();
      const sym = symbols().find((s) => s.id === id);
      if (!sym) return;
      const p = clientToDoc(e.clientX, e.clientY);
      placeInstance(sc, sym, p);
      render();
    });
  }

  function clientToDoc(x, y) {
    const svg = content();
    const m = svg.getScreenCTM?.();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 };
  }

  function viewCenter() {
    const wa = document.getElementById('workarea');
    if (!wa) return { x: 0, y: 0 };
    const r = wa.getBoundingClientRect();
    return clientToDoc(r.left + r.width / 2, r.top + r.height / 2);
  }

  /* ── Symbol Options dialog (New Symbol / re-edit) ───────────────────── */
  function openOptionsDialog({ title = 'Symbol Options', meta = {}, allowRegistration = true } = {}) {
    return new Promise((resolve) => {
      document.getElementById('vsym_options_dialog')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'vsym_options_dialog';
      overlay.className = 'vui-overlay vsym_overlay';
      const m = { name: 'New Symbol', exportType: 'graphic', type: 'dynamic', reg: REG_DEFAULT, ...meta };
      overlay.innerHTML = `
        <div class="vui-dialog vsym_dialog" role="dialog" aria-modal="true" aria-labelledby="vsym_dlg_title">
          <h2 id="vsym_dlg_title" class="vsym_dlg_title">${esc(title)}</h2>
          <label class="vsym_field"><span>Name:</span><input type="text" id="vsym_name" value="${esc(m.name)}" autocomplete="off"></label>
          <label class="vsym_field"><span>Export Type:</span>
            <select id="vsym_export"><option value="graphic"${m.exportType === 'graphic' ? ' selected' : ''}>Graphic</option><option value="movieclip"${m.exportType === 'movieclip' ? ' selected' : ''}>Movie Clip</option></select>
          </label>
          <fieldset class="vsym_field vsym_radio"><legend>Symbol Type:</legend>
            <label><input type="radio" name="vsym_type" id="vsym_type_dynamic" value="dynamic"${m.type !== 'static' ? ' checked' : ''}> Dynamic Symbol</label>
            <label><input type="radio" name="vsym_type" id="vsym_type_static" value="static"${m.type === 'static' ? ' checked' : ''}> Static Symbol</label>
          </fieldset>
          <div class="vsym_field"><span>Registration:</span>
            <div class="vsym_reg_grid" role="radiogroup" aria-label="Registration point"${allowRegistration ? '' : ' aria-disabled="true"'}>
              ${REG_POINTS.map((r) => `<button type="button" class="vsym_reg${r === m.reg ? ' active' : ''}" data-reg="${r}" role="radio" aria-checked="${r === m.reg}" aria-label="${r}"${allowRegistration ? '' : ' disabled'}></button>`).join('')}
            </div>
          </div>
          <div class="vsym_dlg_actions">
            <button type="button" class="vui-btn" id="vsym_cancel">Cancel</button>
            <button type="button" class="vui-btn vui-btn-primary" id="vsym_ok">OK</button>
          </div>
        </div>`;
      document.body.append(overlay);
      let reg = m.reg;
      overlay.querySelectorAll('.vsym_reg').forEach((b) => b.addEventListener('click', () => {
        reg = b.dataset.reg;
        overlay.querySelectorAll('.vsym_reg').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
      }));
      const nameInput = overlay.querySelector('#vsym_name');
      const done = (val) => { overlay.remove(); resolve(val); };
      overlay.querySelector('#vsym_cancel').addEventListener('click', () => done(null));
      overlay.querySelector('#vsym_ok').addEventListener('click', () => done({
        name: nameInput.value.trim() || 'New Symbol',
        exportType: overlay.querySelector('#vsym_export').value,
        type: overlay.querySelector('input[name="vsym_type"]:checked')?.value || 'dynamic',
        reg,
      }));
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
        if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); overlay.querySelector('#vsym_ok').click(); }
      });
      setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
    });
  }

  function openDeletePrompt(name, count) {
    return new Promise((resolve) => {
      document.getElementById('vsym_delete_dialog')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'vsym_delete_dialog';
      overlay.className = 'vui-overlay vsym_overlay';
      overlay.innerHTML = `
        <div class="vui-dialog vsym_dialog" role="alertdialog" aria-modal="true" aria-labelledby="vsym_del_msg">
          <p id="vsym_del_msg">The symbol “${esc(name)}” has ${count} instance${count === 1 ? '' : 's'} in use. Expand the instances into artwork, or delete them?</p>
          <div class="vsym_dlg_actions">
            <button type="button" class="vui-btn" id="vsym_del_cancel">Cancel</button>
            <button type="button" class="vui-btn" id="vsym_del_delete">Delete Instances</button>
            <button type="button" class="vui-btn vui-btn-primary" id="vsym_del_expand">Expand Instances</button>
          </div>
        </div>`;
      document.body.append(overlay);
      const done = (v) => { overlay.remove(); resolve(v); };
      overlay.querySelector('#vsym_del_cancel').addEventListener('click', () => done(null));
      overlay.querySelector('#vsym_del_delete').addEventListener('click', () => done('delete'));
      overlay.querySelector('#vsym_del_expand').addEventListener('click', () => done('expand'));
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } });
      setTimeout(() => overlay.querySelector('#vsym_del_expand').focus(), 0);
    });
  }

  /* ── Commands ───────────────────────────────────────────────────────── */
  const api = {
    render,
    symbols,
    get selectedId() { return selectedId; },
    select(id) { selectedId = id; render(); },
    async newSymbol({ skipDialog = false, meta = null } = {}) {
      if (window.__visterasSymbolEdit?.isEditing?.()) { toast('Exit Symbol Editing Mode first'); return null; }
      const els = symbolizableSelection(sc.getSelectedElements?.());
      if (!els.length) { toast('Select artwork to make a symbol'); return null; }
      const n = symbols().length + 1;
      const opts = meta || (skipDialog
        ? { name: `New Symbol ${n}`, type: 'dynamic', exportType: 'graphic', reg: REG_DEFAULT }
        : await openOptionsDialog({ title: 'Symbol Options', meta: { name: `New Symbol ${n}` } }));
      if (!opts) return null;
      const r = createSymbol(sc, els, opts);
      if (r.error) { toast(r.error); return null; }
      selectedId = r.symbol.id;
      render();
      window.__visterasDock?.open?.('symbols');
      return r;
    },
    place(sym = selectedSymbol(), at = null) {
      if (!sym) return null;
      const r = placeInstance(sc, sym, at || viewCenter());
      render();
      return r;
    },
    breakLink(uses = selectedInstances()) {
      if (!uses.length) { toast('Select a symbol instance'); return null; }
      const r = breakLinks(sc, uses);
      render();
      return r;
    },
    async options(sym = selectedSymbol()) {
      if (!sym) return null;
      const meta = readSymbolMeta(sym);
      const next = await openOptionsDialog({ title: 'Symbol Options', meta, allowRegistration: false });
      if (!next) return null;
      const { BatchCommand, ChangeElementCommand } = sc.history || {};
      const before = {};
      for (const k of [ATTR.name, ATTR.type, ATTR.exportType]) before[k] = sym.getAttribute(k);
      writeSymbolMeta(sym, { name: next.name, type: next.type, exportType: next.exportType });
      if (BatchCommand && ChangeElementCommand) {
        const batch = new BatchCommand('Symbol Options');
        batch.addSubCommand(new ChangeElementCommand(sym, before));
        sc.addCommandToHistory(batch);
      }
      render();
      return next;
    },
    async remove(sym = selectedSymbol(), forceMode = null) {
      if (!sym) return null;
      const uses = instancesOf(content(), sym.id);
      let mode = forceMode || 'delete';
      if (uses.length && !forceMode) {
        mode = await openDeletePrompt(readSymbolMeta(sym).name, uses.length);
        if (!mode) return null;
      }
      const r = deleteSymbol(sc, sym, mode);
      if (r?.error) toast(r.error);
      selectedId = null;
      sc.clearSelection?.();
      render();
      return r;
    },
    duplicate(sym = selectedSymbol()) {
      if (!sym) return null;
      const r = duplicateSymbol(sc, sym);
      if (r.symbol) selectedId = r.symbol.id;
      render();
      return r;
    },
    replace(sym = selectedSymbol()) {
      const uses = selectedInstances();
      if (!sym || !uses.length) { toast('Select instances on the canvas and a symbol in the panel'); return null; }
      const r = replaceSymbol(sc, uses, sym);
      render();
      return r;
    },
    redefine({ keepArtwork = false } = {}, sym = selectedSymbol()) {
      const els = symbolizableSelection(sc.getSelectedElements?.()).filter((el) => !(el.localName === 'use' && symbolIdOfUse(el) === sym?.id));
      if (!sym || !els.length) { toast('Select artwork on the canvas and a symbol in the panel'); return null; }
      const r = redefineSymbol(sc, sym, els, { keepArtwork });
      if (r.error) toast(r.error);
      render();
      return r;
    },
    selectInstances(sym = selectedSymbol()) {
      if (!sym) return [];
      return selectAllInstances(sc, sym);
    },
    selectUnused() {
      const unused = symbols().filter((s) => !instancesOf(content(), s.id).length);
      selectedId = unused[0]?.id || null;
      render();
      if (!unused.length) toast('No unused symbols');
      return unused;
    },
  };

  /* ── Ungroup / Expand on an instance → Break Link (Illustrator) ───── */
  const ungroup = sc.ungroupSelectedElement?.bind(sc);
  if (ungroup && !sc.ungroupSelectedElement.__visterasSymbols) {
    sc.ungroupSelectedElement = function (...args) {
      const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
      if (sel.length && sel.every((el) => el.localName === 'use')) { api.breakLink(sel); return undefined; }
      return ungroup(...args);
    };
    sc.ungroupSelectedElement.__visterasSymbols = true;
  }
  document.getElementById('action_expand')?.addEventListener('click', (e) => {
    const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
    if (sel.length && sel.every((el) => el.localName === 'use')) {
      e.stopImmediatePropagation();
      e.preventDefault();
      api.breakLink(sel);
    }
  }, true);

  /* ── Menu items + shortcuts ─────────────────────────────────────────── */
  document.getElementById('action_window_symbols')?.addEventListener('click', () => window.__visterasDock?.toggle?.('symbols'));
  document.getElementById('action_symbol_new')?.addEventListener('click', () => api.newSymbol());
  document.getElementById('action_symbol_break_link')?.addEventListener('click', () => api.breakLink());
  document.getElementById('action_symbol_edit')?.addEventListener('click', () => {
    const inst = selectedInstances()[0];
    if (inst) window.__visterasSymbolEdit?.enter?.(inst);
  });
  document.addEventListener('keydown', (e) => {
    if (!isNewSymbolShortcut(e)) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    e.stopPropagation();
    api.newSymbol();
  }, true);

  /* ── Refresh on canvas events ───────────────────────────────────────── */
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') {
      const pane = document.getElementById('vdock_symbols_panel');
      if (pane && pane.style.display !== 'none') render();
      else {
        // keep buttons current cheaply
        const br = document.getElementById('vsym_break');
        if (br) br.disabled = !selectedInstances().length;
      }
    }
    return result;
  };

  ensurePane();
  render();
  setTimeout(() => { ensurePane(); render(); }, 300);
  window.__visterasSymbols = api;
  return api;
}

export default mountSymbols;
