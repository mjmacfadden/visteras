/**
 * Artboard extras (gravit-gap-4): size presets, Rearrange All, panel up/down,
 * Edit ▸ Paste on All Artboards (⌥⇧⌘V): pastes the clipboard on every artboard.
 */
import { DOCUMENT_PRESETS, convertToPixels } from './visteras-document-presets.js';
import { artboardState, associatedArtboard, ArtboardCommand } from './visteras-artboard-model.js';
import { formatShortcut, detectMac } from './visteras-shortcut-label.js';

/** The internal (⌘V) buffer: SVG-Edit element JSON array, or null when empty. */
export function parseClipboardBuffer(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
}

/**
 * One offset per artboard so the paste keeps the source's position relative
 * to the artboard it came from (the artboard it overlaps most; else the
 * active one). Boards are returned in document order.
 */
export function pasteOffsets(sourceBounds, boards, activeId = null) {
  const list = boards || [];
  const srcId = (sourceBounds && associatedArtboard(sourceBounds, list)) || activeId || list[0]?.id;
  const source = list.find((b) => b.id === srcId) || list[0] || { x: 0, y: 0 };
  return { source, offsets: list.map((b) => ({ board: b, dx: b.x - source.x, dy: b.y - source.y })) };
}

/** Fold every history entry since `pointer` into one batch. */
export function foldHistorySince(undoMgr, pointer, BatchCommand, label) {
  if (!undoMgr || !BatchCommand) return false;
  const end = undoMgr.undoStackPointer;
  if (end - pointer < 2) return false;
  const batch = new BatchCommand(label);
  for (const c of undoMgr.undoStack.slice(pointer, end)) batch.addSubCommand(c);
  undoMgr.undoStack = undoMgr.undoStack.slice(0, pointer);
  undoMgr.undoStack.push(batch);
  undoMgr.undoStackPointer = pointer + 1;
  return true;
}

/** Print + social presets for new artboards / Artboard Options. */
export function artboardSizePresets() {
  const print = [...(DOCUMENT_PRESETS.print || [])];
  const socialWanted = [
    'social_ig_post', 'social_ig_story', 'social_x_post',
    'social_fb_cover', 'social_yt_thumb', 'social_li_post',
  ];
  let social = (DOCUMENT_PRESETS.social || []).filter((p) => socialWanted.includes(p.id));
  const ensure = (id, name, width, height, unit = 'px') => {
    if (!social.some((p) => p.id === id)) {
      social.push({ id, name, width, height, unit, category: 'social', description: `${width} × ${height}` });
    }
  };
  ensure('social_ig_post', 'Instagram Post', 1080, 1080);
  ensure('social_ig_story', 'Instagram Story', 1080, 1920);
  ensure('social_x_post', 'X Post', 1600, 900);
  ensure('social_fb_cover', 'Facebook Cover', 820, 312);
  ensure('social_yt_thumb', 'YouTube Thumbnail', 1280, 720);
  ensure('social_li_post', 'LinkedIn Post', 1200, 627);
  // Stable order matching the wanted list
  social = socialWanted.map((id) => social.find((p) => p.id === id)).filter(Boolean);
  return { print, social, all: [...print, ...social] };
}

export function presetToPixels(preset) {
  const unit = preset.unit || 'px';
  return {
    width: Math.max(1, Math.round(convertToPixels(preset.width, unit))),
    height: Math.max(1, Math.round(convertToPixels(preset.height, unit))),
  };
}

/**
 * Illustrator Rearrange All Artboards: grid by row or column.
 * Returns boards with updated x/y (same ids/order).
 */
export function rearrangeArtboards(boards, {
  layout = 'row',
  columns = 1,
  spacing = 20,
} = {}) {
  const cols = Math.max(1, Math.floor(Number(columns) || 1));
  const gap = Math.max(0, Number(spacing) || 0);
  const out = boards.map((b) => ({ ...b }));
  if (layout === 'column') {
    const rows = Math.max(1, Math.ceil(out.length / cols));
    const colW = Array(cols).fill(0);
    const rowH = Array(rows).fill(0);
    out.forEach((b, i) => {
      const c = Math.min(cols - 1, Math.floor(i / rows));
      const r = i % rows;
      colW[c] = Math.max(colW[c], b.width);
      rowH[r] = Math.max(rowH[r], b.height);
    });
    const xs = [0];
    for (let c = 1; c < cols; c++) xs[c] = xs[c - 1] + colW[c - 1] + gap;
    const ys = [0];
    for (let r = 1; r < rows; r++) ys[r] = ys[r - 1] + rowH[r - 1] + gap;
    out.forEach((b, i) => {
      const c = Math.min(cols - 1, Math.floor(i / rows));
      const r = i % rows;
      b.x = xs[c];
      b.y = ys[r];
    });
  } else {
    const rows = Math.max(1, Math.ceil(out.length / cols));
    const colW = Array(cols).fill(0);
    const rowH = Array(rows).fill(0);
    out.forEach((b, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      colW[c] = Math.max(colW[c], b.width);
      rowH[r] = Math.max(rowH[r], b.height);
    });
    const xs = [0];
    for (let c = 1; c < cols; c++) xs[c] = xs[c - 1] + colW[c - 1] + gap;
    const ys = [0];
    for (let r = 1; r < rows; r++) ys[r] = ys[r - 1] + rowH[r - 1] + gap;
    out.forEach((b, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      b.x = xs[c];
      b.y = ys[r];
    });
  }
  return out;
}

function roughBBox(el) {
  try {
    const b = el.getBBox();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    return null;
  }
}

export function mountArtboardExtras(editor) {
  if (window.__visterasArtboardExtras) return window.__visterasArtboardExtras;
  const sc = editor.svgCanvas;
  const api = () => window.__visterasArtboards;
  const shell = () => window.__visterasDocumentShell;
  const doc = () => shell()?.getActiveDoc?.();
  const presets = artboardSizePresets();
  const mac = detectMac();
  const pasteLabel = formatShortcut({ meta: true, alt: true, shift: true, key: 'V', mac });

  const injectPresetSelect = () => {
    const props = document.getElementById('visteras-artboard-properties');
    const body = props?.querySelector('.prop_section_body');
    if (!body || document.getElementById('vab_size_preset')) return;
    const label = document.createElement('label');
    label.innerHTML = `Size preset
      <select id="vab_size_preset" aria-label="Artboard size preset">
        <option value="">Custom</option>
        <optgroup label="Print">${presets.print.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>
        <optgroup label="Social">${presets.social.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>
      </select>`;
    body.querySelector('#vab_name')?.closest('label')?.after(label);
    label.querySelector('select').addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id || !api()) return;
      const preset = presets.all.find((p) => p.id === id);
      if (!preset) return;
      const { width, height } = presetToPixels(preset);
      api().edit({ width, height }, `Artboard size: ${preset.name}`);
    });
  };

  const enhancePanel = () => {
    const pane = document.getElementById('vdock_artboards_panel');
    if (!pane) return;
    // The artboards module may rebuild the pane's innerHTML after we ran: re-inject
    // per content (buttons / preset select), bind the delegated click handler once.
    if (pane.dataset.extrasObserved !== '1' && typeof MutationObserver !== 'undefined') {
      pane.dataset.extrasObserved = '1';
      new MutationObserver(() => {
        const acts = pane.querySelector('.vab-actions');
        if ((acts && !acts.querySelector('[data-act="up"]')) || !pane.querySelector('#vab_new_preset')) enhancePanel();
      }).observe(pane, { childList: true });
    }
    const actions = pane.querySelector('.vab-actions');
    if (actions && !actions.querySelector('[data-act="up"]')) {
      for (const [act, title, text] of [
        ['up', 'Move artboard up in order', '↑'],
        ['down', 'Move artboard down in order', '↓'],
        ['rearrange', 'Rearrange All Artboards', 'Rearrange…'],
      ]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.act = act;
        b.title = title;
        b.textContent = text;
        actions.append(b);
      }
    }
    if (!pane.querySelector('#vab_new_preset')) {
      const sel = document.createElement('select');
      sel.id = 'vab_new_preset';
      sel.setAttribute('aria-label', 'New artboard size preset');
      sel.innerHTML = `<option value="">New size…</option>
        <optgroup label="Print">${presets.print.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>
        <optgroup label="Social">${presets.social.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>`;
      actions?.after(sel);
      sel.addEventListener('change', () => {
        const id = sel.value;
        sel.value = '';
        if (!id || !api()) return;
        const preset = presets.all.find((p) => p.id === id);
        if (!preset) return;
        const { width, height } = presetToPixels(preset);
        const active = api().active();
        api().create({
          x: (active?.x || 0) + (active?.width || 0) + 40,
          y: active?.y || 0,
          width,
          height,
          backgroundColor: active?.backgroundColor || '#ffffff',
        });
      });
    }
    if (pane.dataset.extras === '1') return;
    pane.dataset.extras = '1';
    pane.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      const a = api();
      const d = doc();
      if (!a || !d) return;
      if (act === 'up' || act === 'down') {
        const id = d.activeArtboardId;
        const i = d.artboards.findIndex((b) => b.id === id);
        const j = act === 'up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= d.artboards.length) return;
        a.reorder(id, j);
      }
      if (act === 'rearrange') openRearrangeDialog();
    });
  };

  function applyRearrange(opts) {
    const a = api();
    const d = doc();
    if (!a || !d) return;
    const before = artboardState(d);
    const next = rearrangeArtboards(d.artboards, opts);
    const deltas = new Map();
    d.artboards.forEach((old) => {
      const neu = next.find((b) => b.id === old.id);
      if (neu) deltas.set(old.id, { dx: neu.x - old.x, dy: neu.y - old.y });
    });
    const artBefore = [];
    if (opts.moveArtwork) {
      const layers = [...sc.getSvgContent().querySelectorAll(':scope > g.layer')]
        .filter((l) => l.getAttribute('display') !== 'none' && l.getAttribute('data-locked') !== 'true');
      for (const layer of layers) {
        for (const el of [...layer.children]) {
          if (['title', 'defs', 'desc', 'metadata'].includes(el.localName)) continue;
          const bb = roughBBox(el);
          if (!bb) continue;
          const aid = associatedArtboard(bb, before.artboards);
          artBefore.push({ el, transform: el.getAttribute('transform'), aid });
        }
      }
    }
    d.artboards = next.map((b) => {
      const prev = before.artboards.find((x) => x.id === b.id) || b;
      return { ...prev, x: b.x, y: b.y };
    });
    if (opts.moveArtwork) {
      for (const { el, aid } of artBefore) {
        if (!aid) continue;
        const { dx, dy } = deltas.get(aid) || { dx: 0, dy: 0 };
        if (!dx && !dy) continue;
        const prev = el.getAttribute('transform') || '';
        el.setAttribute('transform', `translate(${dx} ${dy})${prev ? ` ${prev}` : ''}`);
      }
    }
    const cmd = new ArtboardCommand(d, before, artboardState(d), () => {
      a.refresh();
      shell()?.updateStatusBar?.();
    }, 'Rearrange artboards');
    if (opts.moveArtwork && artBefore.length && sc.history?.ChangeElementCommand && sc.history?.BatchCommand) {
      const batch = new sc.history.BatchCommand('Rearrange artboards');
      batch.addSubCommand(cmd);
      for (const { el, transform } of artBefore) {
        if ((el.getAttribute('transform') || '') !== (transform || '')) {
          batch.addSubCommand(new sc.history.ChangeElementCommand(el, { transform }));
        }
      }
      sc.addCommandToHistory(batch);
    } else {
      sc.addCommandToHistory(cmd);
    }
    a.refresh();
    try { a.fit(true); } catch { /* ignore */ }
    shell()?.markDirty?.();
  }

  function openRearrangeDialog() {
    let dlg = document.getElementById('visteras_rearrange_artboards');
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'visteras_rearrange_artboards';
      dlg.innerHTML = `
        <div class="visteras_modal" role="dialog" aria-labelledby="vrearr_title" style="width:360px;background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#ddd;box-shadow:0 12px 40px rgba(0,0,0,.5);">
          <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #3a3a3a;font-size:13px;">
            <span id="vrearr_title">Rearrange All Artboards</span>
            <button type="button" class="floating_panel_close" id="vrearr_close" aria-label="Close">×</button>
          </div>
          <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;font-size:12px;">
            <label>Layout
              <select id="vrearr_layout"><option value="row">Grid by Row</option><option value="column">Grid by Column</option></select>
            </label>
            <label>Columns <input type="number" id="vrearr_cols" min="1" max="20" value="2" style="width:64px;"></label>
            <label>Spacing <input type="number" id="vrearr_spacing" min="0" max="2000" value="20" style="width:64px;"> px</label>
            <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="vrearr_move" checked> Move artwork with artboard</label>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
              <button type="button" id="vrearr_cancel" style="background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:4px;padding:4px 12px;">Cancel</button>
              <button type="button" id="vrearr_ok" style="background:var(--studio-orange,#fa7c1b);border:0;color:#111;border-radius:4px;padding:4px 12px;font-weight:600;">OK</button>
            </div>
          </div>
        </div>`;
      dlg.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(dlg);
    }
    dlg.style.display = 'flex';
    dlg.hidden = false;
    const close = () => { dlg.hidden = true; dlg.style.display = 'none'; };
    dlg.querySelector('#vrearr_close').onclick = close;
    dlg.querySelector('#vrearr_cancel').onclick = close;
    dlg.querySelector('#vrearr_ok').onclick = () => {
      applyRearrange({
        layout: dlg.querySelector('#vrearr_layout').value,
        columns: Number(dlg.querySelector('#vrearr_cols').value) || 1,
        spacing: Number(dlg.querySelector('#vrearr_spacing').value) || 0,
        moveArtwork: dlg.querySelector('#vrearr_move').checked,
      });
      close();
    };
  }

  /**
   * Illustrator Paste on All Artboards: pastes the CLIPBOARD (what ⌘V would
   * paste), one copy per artboard at the source's position relative to its
   * artboard, as one undo step. Internal buffer first (lossless; symbol
   * instances stay linked), then the system clipboard via the clipboard
   * bridge (same read/permission path as Edit ▸ Paste). Nothing → no-op.
   */
  let pasting = false;
  async function pasteOnAllArtboards() {
    if (pasting) return [];
    const a = api();
    const d = doc();
    if (!a || !d?.artboards?.length) return [];
    pasting = true;
    try {
      const clipId = typeof sc.getClipboardID === 'function' ? sc.getClipboardID() : 'svgedit_clipboard';
      let buffer = null;
      try { buffer = parseClipboardBuffer(sessionStorage.getItem(clipId)); } catch { buffer = null; }
      if (buffer) return pasteInternalOnAll(d.artboards, a.active());
      const svgText = await window.__visterasReadSystemSvg?.().catch?.(() => null);
      if (svgText) return pasteSystemOnAll(d.artboards, a.active(), svgText);
      return [];
    } finally {
      pasting = false;
    }
  }

  function boundsOf(els) {
    try {
      const b = sc.getStrokedBBox?.(els);
      if (b && Number.isFinite(b.x)) return b;
    } catch { /* ignore */ }
    return null;
  }

  function finish(p0, created) {
    if (!created.length) return [];
    foldHistorySince(sc.undoMgr, p0, sc.history?.BatchCommand, 'Paste on All Artboards');
    try { sc.clearSelection(); sc.addToSelection(created, true); } catch { /* ignore */ }
    sc.call?.('changed', created);
    return created;
  }

  function pasteInternalOnAll(boards, activeBoard) {
    const p0 = sc.undoMgr?.undoStackPointer ?? 0;
    const created = [];
    let plan = null;
    for (let i = 0; i < boards.length; i++) {
      sc.pasteElements('in_place');
      const els = (sc.getSelectedElements?.() || []).filter(Boolean);
      if (!els.length) break;
      if (!plan) plan = pasteOffsets(boundsOf(els), boards, activeBoard?.id);
      const { dx, dy } = plan.offsets[i];
      if (dx || dy) sc.moveSelectedElements(els.map(() => dx), els.map(() => dy), true);
      created.push(...els);
    }
    return finish(p0, created);
  }

  function pasteSystemOnAll(boards, activeBoard, svgText) {
    const p0 = sc.undoMgr?.undoStackPointer ?? 0;
    try { sc.importSvgString(svgText); } catch { return []; }
    if ((sc.undoMgr?.undoStackPointer ?? 0) === p0) return [];
    const placed = (sc.getSelectedElements?.() || []).filter(Boolean);
    if (!placed.length) return [];
    const plan = pasteOffsets(boundsOf(placed), boards, activeBoard?.id);
    const { BatchCommand, InsertElementCommand } = sc.history || {};
    const batch = BatchCommand ? new BatchCommand('Paste on All Artboards') : null;
    const created = [...placed];
    plan.offsets.forEach(({ dx, dy }) => {
      if (!dx && !dy) return;
      for (const el of placed) {
        const clone = el.cloneNode(true);
        for (const n of [clone, ...clone.querySelectorAll('[id]')]) if (n.id) n.id = sc.getNextId();
        const prev = clone.getAttribute('transform') || '';
        clone.setAttribute('transform', `translate(${dx} ${dy})${prev ? ` ${prev}` : ''}`);
        el.parentNode.insertBefore(clone, el.nextSibling);
        if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(clone));
        created.push(clone);
      }
    });
    if (batch && !batch.isEmpty?.()) sc.addCommandToHistory(batch);
    return finish(p0, created);
  }

  const editList = document.querySelector('#menu_edit .menu_dropdown_list');
  if (editList && !document.getElementById('action_paste_on_all_artboards')) {
    const pasteItem = [...editList.querySelectorAll('.menu_dropdown_item')]
      .find((n) => /^(paste)\b/i.test((n.textContent || '').trim()));
    const item = document.createElement('div');
    item.className = 'menu_dropdown_item';
    item.id = 'action_paste_on_all_artboards';
    item.innerHTML = `Paste on All Artboards <span class="menu_dropdown_shortcut">${pasteLabel}</span>`;
    if (pasteItem) pasteItem.after(item);
    else editList.append(item);
    item.addEventListener('click', () => pasteOnAllArtboards());
  }

  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.altKey || !e.shiftKey) return;
    if (e.code !== 'KeyV' && e.key !== 'v' && e.key !== 'V') return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    e.preventDefault();
    e.stopPropagation();
    pasteOnAllArtboards();
  }, true);

  const boot = () => { injectPresetSelect(); enhancePanel(); };
  boot();
  setTimeout(boot, 200);
  setTimeout(boot, 1000);

  window.__visterasArtboardExtras = {
    artboardSizePresets,
    rearrangeArtboards,
    pasteOnAllArtboards,
    openRearrangeDialog,
  };
  return window.__visterasArtboardExtras;
}
