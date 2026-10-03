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
  };
}

/** Normalize a user patch ({leading, align, tracking, spaceBefore, spaceAfter}). */
export function normalizeParagraphPatch(patch) {
  const out = {};
  if ('leading' in patch) { const n = Number(patch.leading); out.leading = patch.leading === '' || patch.leading == null || !(n > 0) ? null : round(clamp(n, 0.1, 5000), 2); }
  if ('align' in patch && ALIGN_TO_ANCHOR[patch.align]) out.align = patch.align;
  if ('tracking' in patch) out.tracking = Math.round(clamp(Number(patch.tracking) || 0, -1000, 10000));
  for (const k of ['spaceBefore', 'spaceAfter']) if (k in patch) out[k] = round(clamp(Number(patch[k]) || 0, 0, 5000), 2);
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
  if (changed.length) sc.call?.('changed', changed);
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

  const inputs = {
    leading: document.getElementById('vpara_leading'),
    tracking: document.getElementById('vpara_tracking'),
    spaceBefore: document.getElementById('vpara_space_before'),
    spaceAfter: document.getElementById('vpara_space_after'),
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
    for (const k of ['leading', 'spaceBefore', 'spaceAfter']) {
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
      const label = { leading: 'Leading', tracking: 'Tracking', spaceBefore: 'Space Before', spaceAfter: 'Space After' }[k];
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
  window.__visterasParagraph = { render, readParagraph, applyParagraph: (patch) => applyParagraph(sc, texts(), patch) };
  return window.__visterasParagraph;
}
