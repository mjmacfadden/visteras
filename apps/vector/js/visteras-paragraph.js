/**
 * Visteras Vector — Illustrator-style Character (Leading, Tracking) and Paragraph
 * (Align incl. Justify, Space Before/After) controls for text.
 *
 * Storage (all on the <text>, survives the SVG-Edit sanitizer and .vvd reopen):
 *   data-visteras-leading       px, absent = Auto (120 %)
 *   data-visteras-align         left | center | right | justify (+ text-anchor kept in sync)
 *   data-visteras-tracking      1/1000 em (Illustrator units) → letter-spacing (px) attribute
 *   data-visteras-space-before  px
 *   data-visteras-space-after   px
 * Area (paragraph) text re-lays out its tspans from these in visteras-text-editing.js.
 * Point text uses alignment + tracking; leading/spacing need area text (one line).
 */
export const PARA = {
  leading: 'data-visteras-leading',
  align: 'data-visteras-align',
  tracking: 'data-visteras-tracking',
  spaceBefore: 'data-visteras-space-before',
  spaceAfter: 'data-visteras-space-after',
  indentLeft: 'data-visteras-indent-left',
  indentRight: 'data-visteras-indent-right',
  indentFirst: 'data-visteras-indent-first',
};
export const ALIGN_TO_ANCHOR = { left: 'start', center: 'middle', right: 'end', justify: 'start' };
export const ANCHOR_TO_ALIGN = { start: 'left', middle: 'center', end: 'right' };
const BUTTON_ALIGN = { start: 'left', middle: 'center', end: 'right', justify: 'justify' };

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const isAreaText = (el) => !!el?.getAttribute?.('data-text-width');
export const isPathText = (el) => !!el?.querySelector?.('textPath');
export const isText = (el) => (el?.tagName || '').toLowerCase() === 'text';

export function fontSizeOf(el) {
  const v = Number.parseFloat(el?.getAttribute?.('font-size'));
  if (Number.isFinite(v) && v > 0) return v;
  try { return Number.parseFloat(getComputedStyle(el).fontSize) || 24; } catch { return 24; }
}

/** Tracking (1/1000 em) → letter-spacing px for a font size. */
export const trackingToLetterSpacing = (tracking, size) => round((Number(tracking) || 0) * size / 1000);
export const letterSpacingToTracking = (ls, size) => Math.round(((Number.parseFloat(ls) || 0) / (size || 24)) * 1000);

/** Current paragraph/character values of one text element. */
export function readParagraph(el) {
  const size = fontSizeOf(el);
  const numAttr = (name) => { const raw = el.getAttribute(name); if (raw == null || raw === '') return null; const n = Number(raw); return Number.isFinite(n) ? n : null; };
  const storedAlign = el.getAttribute(PARA.align);
  const align = ALIGN_TO_ANCHOR[storedAlign] ? storedAlign : ANCHOR_TO_ALIGN[el.getAttribute('text-anchor') || 'start'] || 'left';
  const t = numAttr(PARA.tracking);
  return {
    leading: numAttr(PARA.leading), // null = Auto
    autoLeading: round(size * 1.2, 2),
    align,
    tracking: t ?? letterSpacingToTracking(el.getAttribute('letter-spacing'), size),
    spaceBefore: numAttr(PARA.spaceBefore) || 0,
    spaceAfter: numAttr(PARA.spaceAfter) || 0,
    indentLeft: numAttr(PARA.indentLeft) || 0,
    indentRight: numAttr(PARA.indentRight) || 0,
    indentFirst: numAttr(PARA.indentFirst) || 0,
  };
}

/** Normalize a user patch ({leading, align, tracking, spaceBefore, spaceAfter}). */
export function normalizeParagraphPatch(patch) {
  const out = {};
  if ('leading' in patch) { const n = Number(patch.leading); out.leading = patch.leading === '' || patch.leading == null || !(n > 0) ? null : round(clamp(n, 0.1, 5000), 2); }
  if ('align' in patch && ALIGN_TO_ANCHOR[patch.align]) out.align = patch.align;
  if ('tracking' in patch) out.tracking = Math.round(clamp(Number(patch.tracking) || 0, -1000, 10000));
  for (const k of ['spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight']) if (k in patch) out[k] = round(clamp(Number(patch[k]) || 0, 0, 5000), 2);
  if ('indentFirst' in patch) out.indentFirst = round(clamp(Number(patch.indentFirst) || 0, -5000, 5000), 2);
  return out;
}

const setOrRemove = (el, k, v) => (v == null || v === '' ? el.removeAttribute(k) : el.setAttribute(k, String(v)));

/** Write a normalized patch onto one element. Returns previous attrs or null if unchanged. */
export function writeParagraph(el, patch) {
  const p = normalizeParagraphPatch(patch);
  const next = {};
  if ('leading' in p) next[PARA.leading] = p.leading;
  if ('align' in p) {
    next[PARA.align] = p.align === 'left' && !el.hasAttribute(PARA.align) ? null : p.align;
    if (!isPathText(el)) next['text-anchor'] = ALIGN_TO_ANCHOR[p.align];
  }
  if ('tracking' in p) {
    next[PARA.tracking] = p.tracking || null;
    next['letter-spacing'] = p.tracking ? trackingToLetterSpacing(p.tracking, fontSizeOf(el)) : null;
  }
  if ('spaceBefore' in p) next[PARA.spaceBefore] = p.spaceBefore || null;
  if ('spaceAfter' in p) next[PARA.spaceAfter] = p.spaceAfter || null;
  if ('indentLeft' in p) next[PARA.indentLeft] = p.indentLeft || null;
  if ('indentRight' in p) next[PARA.indentRight] = p.indentRight || null;
  if ('indentFirst' in p) next[PARA.indentFirst] = p.indentFirst || null;
  const before = {};
  let changed = false;
  for (const [k, v] of Object.entries(next)) {
    const old = el.getAttribute(k);
    before[k] = old;
    if ((old ?? null) !== (v == null ? null : String(v))) changed = true;
  }
  if (!changed) return null;
  for (const [k, v] of Object.entries(next)) setOrRemove(el, k, v);
  return before;
}

/** Apply to many text elements as one undo step. */
export function applyParagraph(sc, elements, patch, label = 'Paragraph') {
  const { BatchCommand, ChangeElementCommand } = sc?.history || {};
  const batch = BatchCommand ? new BatchCommand(label) : null;
  const changed = [];
  for (const el of (elements || []).filter(isText)) {
    const before = writeParagraph(el, patch);
    if (!before) continue;
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
    changed.push(el);
  }
  if (batch && changed.length) sc.addCommandToHistory?.(batch);
  if (changed.length) {
    // Relayout area text so indents / spacing render on canvas and in export.
    const win = typeof window !== 'undefined' ? window : undefined;
    for (const el of changed) {
      if (!isAreaText(el)) continue;
      if (typeof win?.__visterasLayoutParagraph === 'function') win.__visterasLayoutParagraph(el);
      else win?.__visterasTextEditing?.layoutParagraph?.(el);
    }
    sc.call?.('changed', changed);
  }
  return changed;
}

/** Keep letter-spacing proportional to font size when tracking is set (no history). */
export function syncTracking(el) {
  const t = Number(el.getAttribute(PARA.tracking));
  if (!t) return false;
  const want = String(trackingToLetterSpacing(t, fontSizeOf(el)));
  if (el.getAttribute('letter-spacing') === want) return false;
  el.setAttribute('letter-spacing', want);
  return true;
}

/* ───────────────────────────── UI ───────────────────────────── */

const ICON = {
  leading: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2h12v1H2zM2 13h12v1H2zM5.2 11 7.4 5h1.2l2.2 6H9.7l-.5-1.5H6.8L6.3 11zm1.9-2.4h1.8L8 6.1z"/></svg>',
  tracking: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.2 9 5.4 3h1.2l2.2 6H7.7l-.5-1.5H4.8L4.3 9zm1.9-2.4h1.8L6 4.1zM9.5 3h1v6h-1zM2 12h12v1H2zm0-1.5L.5 12.5 2 14.5zm12 0 1.5 2-1.5 2z"/></svg>',
  before: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 7h12v1H2zm0 3h12v1H2zm0 3h8v1H2zM8 1l3 3H9v1H7V4H5z"/></svg>',
  after: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2h12v1H2zm0 3h12v1H2zm0 3h8v1H2zm6 7-3-3h2v-1h2v1h2z"/></svg>',
  justify: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M2 12.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg>',
  indentLeft: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2h12v1H2zm6 3h6v1H8zm0 3h6v1H8zm0 3h6v1H8zM2 13h12v1H2zM6 5.5 2.5 8 6 10.5V9h1.5V7H6z"/></svg>',
  indentRight: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2h12v1H2zM2 5h6v1H2zm0 3h6v1H2zm0 3h6v1H2zm0 3h12v1H2zm8-7.5L13.5 8 10 10.5V9H8.5V7H10z"/></svg>',
  indentFirst: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2h12v1H2zm4 3h8v1H6zm0 3h8v1H6zM2 11h12v1H2zm0 3h12v1H2zM5 5.5 1.5 8 5 10.5V9h1V7H5z"/></svg>',
};

const field = (id, icon, title, attrs) => `<label class="vpara_field" title="${title}"><span class="vpara_icon">${icon}</span><input id="${id}" class="vpara_input" type="number" aria-label="${title}" ${attrs}></label>`;

export function mountParagraph(editor) {
  const sc = editor.svgCanvas;
  const body = document.getElementById('sec_typography_body');
  const alignSlot = document.getElementById('slot_text_align');
  if (!body || !alignSlot) return null;

  // Character: Leading + Tracking (Tracking replaces the px letter-spacing input).
  const sizeRow = document.getElementById('slot_font_size')?.closest('.prop_row');
  const charRow = document.createElement('div');
  charRow.className = 'prop_row vpara_row';
  charRow.id = 'vpara_char_row';
  charRow.innerHTML = field('vpara_leading', ICON.leading, 'Leading (px) — empty = Auto', 'min="0" step="0.5" placeholder="Auto"')
    + field('vpara_tracking', ICON.tracking, 'Tracking (1/1000 em)', 'min="-1000" max="10000" step="10"');
  (sizeRow || body.firstElementChild)?.after(charRow);
  document.getElementById('slot_letter_spacing')?.classList.add('vpara_ls_replaced');

  // Paragraph: Justify button + Space Before / After.
  const justify = document.createElement('button');
  justify.type = 'button';
  justify.className = 'visteras_text_align_btn';
  justify.id = 'text_align_justify';
  justify.dataset.align = 'justify';
  justify.title = 'Justify with Last Line Aligned Left';
  justify.setAttribute('aria-label', 'Justify with Last Line Aligned Left');
  justify.setAttribute('aria-pressed', 'false');
  justify.innerHTML = ICON.justify;
  alignSlot.append(justify);
  const spaceRow = document.createElement('div');
  spaceRow.className = 'prop_row vpara_row';
  spaceRow.id = 'vpara_space_row';
  spaceRow.innerHTML = field('vpara_space_before', ICON.before, 'Space Before Paragraph (px)', 'min="0" step="1"')
    + field('vpara_space_after', ICON.after, 'Space After Paragraph (px)', 'min="0" step="1"');
  alignSlot.closest('.prop_row[style*="column"]')?.after(spaceRow) ?? alignSlot.after(spaceRow);

  const indentRow = document.createElement('div');
  indentRow.className = 'prop_row vpara_row';
  indentRow.id = 'vpara_indent_row';
  indentRow.innerHTML = field('vpara_indent_left', ICON.indentLeft, 'Left Indent (px)', 'min="0" step="1"')
    + field('vpara_indent_right', ICON.indentRight, 'Right Indent (px)', 'min="0" step="1"')
    + field('vpara_indent_first', ICON.indentFirst, 'First-Line Indent (px)', 'step="1"');
  spaceRow.after(indentRow);

  const inputs = {
    leading: document.getElementById('vpara_leading'),
    tracking: document.getElementById('vpara_tracking'),
    spaceBefore: document.getElementById('vpara_space_before'),
    spaceAfter: document.getElementById('vpara_space_after'),
    indentLeft: document.getElementById('vpara_indent_left'),
    indentRight: document.getElementById('vpara_indent_right'),
    indentFirst: document.getElementById('vpara_indent_first'),
  };
  const texts = () => (sc.getSelectedElements?.() || []).filter(isText);

  const setAlignButtons = (align) => {
    for (const btn of alignSlot.querySelectorAll('.visteras_text_align_btn')) {
      const on = BUTTON_ALIGN[btn.dataset.align] === align;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  const render = () => {
    const els = texts();
    if (!els.length) return;
    const v = readParagraph(els[0]);
    const area = els.some(isAreaText);
    for (const [k, input] of Object.entries(inputs)) {
      if (document.activeElement === input) continue;
      if (k === 'leading') { input.value = v.leading ?? ''; input.placeholder = `Auto (${v.autoLeading})`; }
      else input.value = v[k];
    }
    for (const k of ['leading', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'indentFirst']) {
      inputs[k].disabled = !area;
      inputs[k].closest('.vpara_field').title = area ? inputs[k].getAttribute('aria-label') : `${inputs[k].getAttribute('aria-label')} — needs area text (drag a text box)`;
    }
    justify.disabled = els.every(isPathText);
    setAlignButtons(v.align);
  };
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; setTimeout(() => { queued = false; render(); }, 0); } };

  for (const [k, input] of Object.entries(inputs)) {
    input.addEventListener('change', () => {
      const label = { leading: 'Leading', tracking: 'Tracking', spaceBefore: 'Space Before', spaceAfter: 'Space After', indentLeft: 'Left Indent', indentRight: 'Right Indent', indentFirst: 'First-Line Indent' }[k];
      const els = k === 'tracking' ? texts() : texts().filter(isAreaText);
      applyParagraph(sc, els, { [k]: input.value }, label);
      render();
    });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
  }

  // Alignment: own the click for text selections so justify/left/center/right are
  // one undo step and keep data-visteras-align and text-anchor in sync.
  alignSlot.addEventListener('click', (e) => {
    const btn = e.target.closest('.visteras_text_align_btn');
    if (!btn) return;
    const els = texts();
    const align = BUTTON_ALIGN[btn.dataset.align];
    const own = els.filter((el) => !isPathText(el));
    if (!own.length) { if (align === 'justify') e.stopImmediatePropagation(); return; } // type-on-path / defaults → legacy handler
    e.stopImmediatePropagation();
    e.preventDefault();
    applyParagraph(sc, own, { align }, align === 'justify' ? 'Justify' : `Align ${align[0].toUpperCase()}${align.slice(1)}`);
    document.getElementById('tool_text_anchor')?.setAttribute('value', ALIGN_TO_ANCHOR[align]);
    setAlignButtons(align);
  }, true);

  const content = () => sc.getSvgContent?.();
  const syncAll = () => { for (const el of content()?.querySelectorAll(`text[${PARA.tracking}]`) || []) syncTracking(el); };
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (event === 'changed') for (const el of args[0] || []) if (isText(el)) syncTracking(el);
    if (event === 'selected' || event === 'changed') schedule();
    return result;
  };
  const root = sc.getSvgRoot?.();
  if (root && typeof MutationObserver !== 'undefined') new MutationObserver(syncAll).observe(root, { childList: true });
  syncAll();
  const renderAll = () => { render(); window.__visterasParagraphPanel?.renderPanel?.(); };
  window.__visterasParagraph = { render: renderAll, readParagraph, applyParagraph: (patch) => applyParagraph(sc, texts(), patch), renderPanel: () => window.__visterasParagraphPanel?.renderPanel?.() };
  return window.__visterasParagraph;
}


/* ───────────────────── Window ▸ Type ▸ Paragraph (⌥⌘T) ───────────────────── */

function ensureParagraphPanel() {
  let panel = document.getElementById('visteras_paragraph_panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'visteras_paragraph_panel';
  panel.className = 'visteras_floating_panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Paragraph');
  panel.style.cssText = 'display:none;top:110px;right:300px;width:260px;';
  panel.innerHTML = `
    <div class="floating_panel_header" id="paragraph_panel_header">
      <span class="floating_panel_title">Paragraph</span>
      <button type="button" class="floating_panel_close" id="paragraph_panel_close" title="Close" aria-label="Close">×</button>
    </div>
    <div class="floating_panel_body" id="paragraph_panel_body">
      <div class="vpara_panel_align" id="vpara_panel_align" role="group" aria-label="Paragraph alignment">
        <button type="button" class="visteras_text_align_btn" data-align="start" title="Align Left" aria-label="Align Left" aria-pressed="false">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 3h12v1.2H2zm0 3h8v1.2H2zm0 3h12v1.2H2zm0 3h8v1.2H2z"/></svg>
        </button>
        <button type="button" class="visteras_text_align_btn" data-align="middle" title="Align Center" aria-label="Align Center" aria-pressed="false">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 3h12v1.2H2zm2 3h8v1.2H4zm-2 3h12v1.2H2zm2 3h8v1.2H4z"/></svg>
        </button>
        <button type="button" class="visteras_text_align_btn" data-align="end" title="Align Right" aria-label="Align Right" aria-pressed="false">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 3h12v1.2H2zm4 3h8v1.2H6zm-4 3h12v1.2H2zm4 3h8v1.2H6z"/></svg>
        </button>
        <button type="button" class="visteras_text_align_btn" data-align="justify" title="Justify with Last Line Aligned Left" aria-label="Justify with Last Line Aligned Left" aria-pressed="false">${ICON.justify}</button>
      </div>
      <div class="prop_row vpara_row" id="vpara_panel_indent_row">
        ${field('vpara_p_indent_left', ICON.indentLeft, 'Left Indent (px)', 'min="0" step="1"')}
        ${field('vpara_p_indent_right', ICON.indentRight, 'Right Indent (px)', 'min="0" step="1"')}
      </div>
      <div class="prop_row vpara_row" id="vpara_panel_first_row">
        ${field('vpara_p_indent_first', ICON.indentFirst, 'First-Line Indent (px)', 'step="1"')}
      </div>
      <div class="prop_row vpara_row" id="vpara_panel_space_row">
        ${field('vpara_p_space_before', ICON.before, 'Space Before Paragraph (px)', 'min="0" step="1"')}
        ${field('vpara_p_space_after', ICON.after, 'Space After Paragraph (px)', 'min="0" step="1"')}
      </div>
    </div>`;
  document.body.appendChild(panel);
  return panel;
}

function injectWindowTypeMenu(labelHtml) {
  const winList = document.querySelector('#menu_window .menu_dropdown_list');
  if (!winList || document.getElementById('menu_window_type')) return;
  const typeItem = document.createElement('div');
  typeItem.className = 'menu_dropdown_item menu_has_submenu';
  typeItem.id = 'menu_window_type';
  typeItem.setAttribute('role', 'menuitem');
  typeItem.setAttribute('aria-haspopup', 'true');
  typeItem.innerHTML = `Type<span class="menu_submenu_arrow" aria-hidden="true">▸</span>
    <div class="menu_dropdown_list menu_submenu_list" role="menu">
      <div class="menu_dropdown_item" id="action_window_paragraph" role="menuitem">Paragraph <span class="menu_dropdown_shortcut">${labelHtml}</span></div>
    </div>`;
  const props = document.getElementById('action_window_properties');
  if (props) props.before(typeItem);
  else winList.append(typeItem);
}

/** Open/close the floating Paragraph panel (Window ▸ Type ▸ Paragraph). */
export function toggleParagraphPanel(force) {
  const panel = ensureParagraphPanel();
  const show = force != null ? !!force : panel.style.display === 'none';
  panel.style.display = show ? 'block' : 'none';
  if (show) {
    const rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
      panel.style.top = '110px';
      panel.style.left = `${Math.max(20, window.innerWidth - 300)}px`;
      panel.style.right = 'auto';
    }
    window.__visterasParagraph?.renderPanel?.();
  }
  window.__visterasDock?.updateWindowMenuCheckmarks?.();
  return show;
}

/**
 * Wire Window ▸ Type ▸ Paragraph (⌥⌘T) floating panel. Shares applyParagraph /
 * readParagraph with the Properties typography section (no duplicated state).
 */
export function mountParagraphPanel(editor) {
  if (window.__visterasParagraphPanel) return window.__visterasParagraphPanel;
  const sc = editor?.svgCanvas;
  let labelHtml = '⌥⌘T';
  try {
    // Dynamic: formatShortcut keeps Mac/Win labels consistent with the rest of Vector.
    // eslint-disable-next-line no-undef
    import('./visteras-shortcut-label.js').then((m) => {
      const lbl = m.formatShortcut({ meta: true, alt: true, key: 'T' });
      const el = document.querySelector('#action_window_paragraph .menu_dropdown_shortcut');
      if (el && lbl) el.textContent = lbl;
    }).catch(() => {});
  } catch { /* ignore */ }
  injectWindowTypeMenu(labelHtml);
  const panel = ensureParagraphPanel();

  const inputs = {
    indentLeft: document.getElementById('vpara_p_indent_left'),
    indentRight: document.getElementById('vpara_p_indent_right'),
    indentFirst: document.getElementById('vpara_p_indent_first'),
    spaceBefore: document.getElementById('vpara_p_space_before'),
    spaceAfter: document.getElementById('vpara_p_space_after'),
  };
  const alignSlot = document.getElementById('vpara_panel_align');
  const texts = () => (sc?.getSelectedElements?.() || []).filter(isText);

  const setAlignButtons = (align) => {
    for (const btn of alignSlot?.querySelectorAll('.visteras_text_align_btn') || []) {
      const on = BUTTON_ALIGN[btn.dataset.align] === align;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  const renderPanel = () => {
    const els = texts();
    if (!els.length) return;
    const v = readParagraph(els[0]);
    const area = els.some(isAreaText);
    for (const [k, input] of Object.entries(inputs)) {
      if (!input || document.activeElement === input) continue;
      input.value = v[k];
      input.disabled = !area;
    }
    setAlignButtons(v.align);
  };

  for (const [k, input] of Object.entries(inputs)) {
    if (!input) continue;
    input.addEventListener('change', () => {
      const label = { indentLeft: 'Left Indent', indentRight: 'Right Indent', indentFirst: 'First-Line Indent', spaceBefore: 'Space Before', spaceAfter: 'Space After' }[k];
      applyParagraph(sc, texts().filter(isAreaText), { [k]: input.value }, label);
      renderPanel();
      window.__visterasParagraph?.render?.();
    });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
  }

  alignSlot?.addEventListener('click', (e) => {
    const btn = e.target.closest('.visteras_text_align_btn');
    if (!btn) return;
    const align = BUTTON_ALIGN[btn.dataset.align];
    const own = texts().filter((el) => !isPathText(el));
    if (!own.length) return;
    applyParagraph(sc, own, { align }, align === 'justify' ? 'Justify' : `Align ${align[0].toUpperCase()}${align.slice(1)}`);
    setAlignButtons(align);
    window.__visterasParagraph?.render?.();
  });

  document.getElementById('action_window_paragraph')?.addEventListener('click', () => toggleParagraphPanel());
  document.getElementById('paragraph_panel_close')?.addEventListener('click', () => toggleParagraphPanel(false));

  // Drag by header
  const header = document.getElementById('paragraph_panel_header');
  if (header && panel) {
    let dragging = false, sx = 0, sy = 0, pl = 0, pt = 0;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.floating_panel_close')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect();
      pl = r.left; pt = r.top;
      panel.style.left = `${pl}px`; panel.style.top = `${pt}px`; panel.style.right = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = `${Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, pl + e.clientX - sx))}px`;
      panel.style.top = `${Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, pt + e.clientY - sy))}px`;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  // ⌥⌘T / Alt+Ctrl+T
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.shiftKey) return;
    if (e.code !== 'KeyT' && e.key !== 't' && e.key !== 'T') return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    e.preventDefault();
    e.stopPropagation();
    toggleParagraphPanel();
  }, true);

  // Keep panel in sync with selection
  const call = sc?.call;
  if (sc && call) {
    sc.call = function (event, ...args) {
      const result = call.call(this, event, ...args);
      if ((event === 'selected' || event === 'changed') && panel.style.display !== 'none') renderPanel();
      return result;
    };
  }

  // Hook checkmarks
  const dock = window.__visterasDock;
  if (dock && !dock.__paragraphCheckHooked) {
    const prev = dock.updateWindowMenuCheckmarks;
    dock.updateWindowMenuCheckmarks = function (...a) {
      const r = prev?.apply(this, a);
      const item = document.getElementById('action_window_paragraph');
      if (item) {
        const open = document.getElementById('visteras_paragraph_panel')?.style.display !== 'none';
        item.classList.toggle('checked', !!open);
        item.setAttribute('aria-checked', open ? 'true' : 'false');
      }
      return r;
    };
    dock.__paragraphCheckHooked = true;
  }

  window.__visterasParagraphPanel = { toggle: toggleParagraphPanel, renderPanel };
  if (window.__visterasParagraph) window.__visterasParagraph.renderPanel = renderPanel;
  return window.__visterasParagraphPanel;
}
