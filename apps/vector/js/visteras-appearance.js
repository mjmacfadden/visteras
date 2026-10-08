/**
 * Visteras Vector — Window ▸ Appearance (⇧F6), Illustrator-style list for the
 * selection: Stroke, Fill, each effect, Opacity. Click a row to edit; effect
 * eyes toggle visibility. Gaps vs Illustrator are listed in the panel footer
 * and in the PR body (no fill/stroke stacking, no drag-reorder, no per-fill
 * effects, no Graphic Styles).
 */
import { FX_ATTR, FX_ORDER, FX_LABELS, parseFx, summarizeEffect, applyFx } from './visteras-effects.js?v=appearance-1';
import { readOpacityPercent, selectionOpacity, applyOpacity } from './visteras-transparency.js?v=gravit-1';

const EYE = (on) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${on ? '' : '<path d="m3 3 18 18" stroke-width="2"/>'}</svg>`;

/** Build the Appearance rows for a selection (pure; no DOM writes). */
export function appearanceRows(elements) {
  const els = (elements || []).filter((el) => el?.getAttribute);
  if (!els.length) return { empty: true, rows: [] };
  const fills = new Set(els.map((el) => el.getAttribute('fill') || 'none'));
  const strokes = new Set(els.map((el) => el.getAttribute('stroke') || 'none'));
  const weights = new Set(els.map((el) => el.getAttribute('stroke-width') || '1'));
  const fill = fills.size === 1 ? [...fills][0] : 'mixed';
  const stroke = strokes.size === 1 ? [...strokes][0] : 'mixed';
  const weight = weights.size === 1 ? [...weights][0] : 'mixed';
  const opacity = selectionOpacity(els);
  const fx = els.length === 1 ? parseFx(els[0].getAttribute(FX_ATTR)) : {};
  // Illustrator lists Stroke above Fill (front → back), then object effects, then Opacity.
  const rows = [
    { kind: 'stroke', label: 'Stroke', value: stroke, weight, visible: stroke !== 'none' },
    { kind: 'fill', label: 'Fill', value: fill, visible: fill !== 'none' },
  ];
  for (const type of FX_ORDER) {
    if (!fx[type]) continue;
    // Inner Shadow is kept when present (legacy / Gravit) but not offered as "Add".
    rows.push({
      kind: 'effect',
      type,
      label: FX_LABELS[type] || type,
      summary: summarizeEffect(type, fx[type]),
      visible: !!fx[type].enabled,
    });
  }
  rows.push({ kind: 'opacity', label: 'Opacity', value: opacity === '' ? 'Mixed' : `${opacity}%`, visible: true });
  return { empty: false, rows, count: els.length };
}

export function mountAppearance(editor) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasAppearance) return window.__visterasAppearance || null;

  const pane = document.getElementById('vdock_appearance_panel');
  if (!pane) return null;

  const targets = () => (sc.getSelectedElements?.() || []).filter((el) => el && el.getAttribute && el.id && !el.classList?.contains('layer'));

  const render = () => {
    const els = targets();
    const { empty, rows, count } = appearanceRows(els);
    if (empty) {
      pane.innerHTML = `<div class="vapp_empty">Select an object to see its appearance.</div>
        <p class="vapp_gaps">Gaps vs Illustrator: one Fill and one Stroke (no stacking / reorder); effects are object-level only; no Graphic Styles.</p>`;
      return;
    }
    pane.innerHTML = `<div class="vapp_meta">${count} object${count === 1 ? '' : 's'}</div>
      <div class="vapp_list" role="list">
        ${rows.map((r) => {
          if (r.kind === 'effect') {
            return `<div class="vapp_row${r.visible ? '' : ' vapp_off'}" role="listitem" data-kind="effect" data-type="${r.type}">
              <button type="button" class="vapp_eye" aria-pressed="${r.visible}" aria-label="${r.visible ? 'Hide' : 'Show'} ${r.label}" title="${r.visible ? 'Hide' : 'Show'}">${EYE(r.visible)}</button>
              <button type="button" class="vapp_label" title="Edit ${r.label}…">${r.label}</button>
              <span class="vapp_summary">${r.summary || ''}</span>
            </div>`;
          }
          if (r.kind === 'opacity') {
            return `<div class="vapp_row" role="listitem" data-kind="opacity">
              <span class="vapp_eye_spacer" aria-hidden="true"></span>
              <button type="button" class="vapp_label" title="Edit opacity">Opacity</button>
              <span class="vapp_summary">${r.value}</span>
            </div>`;
          }
          const swatch = r.value === 'mixed' ? 'mixed' : (r.value === 'none' ? 'none' : r.value);
          const extra = r.kind === 'stroke' && r.weight !== 'mixed' ? ` · ${r.weight} px` : '';
          return `<div class="vapp_row" role="listitem" data-kind="${r.kind}">
            <span class="vapp_eye_spacer" aria-hidden="true"></span>
            <button type="button" class="vapp_swatch${swatch === 'none' ? ' is-none' : ''}${swatch === 'mixed' ? ' is-mixed' : ''}" data-kind="${r.kind}" style="${swatch !== 'none' && swatch !== 'mixed' ? `background:${swatch}` : ''}" aria-label="${r.label} color" title="${r.label}"></button>
            <button type="button" class="vapp_label" data-kind="${r.kind}">${r.label}</button>
            <span class="vapp_summary">${r.value === 'none' ? 'None' : (r.value === 'mixed' ? 'Mixed' : r.value)}${extra}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="vapp_gaps">Gaps vs Illustrator: one Fill/Stroke (no stacking or drag-reorder); object-level effects only; no Graphic Styles; Inner Shadow is shown when present but not offered under fx Add.</p>`;
  };

  pane.addEventListener('click', (e) => {
    const row = e.target.closest('.vapp_row');
    if (!row) return;
    const kind = row.dataset.kind;
    const els = targets();
    if (!els.length) return;
    if (e.target.closest('.vapp_eye') && kind === 'effect') {
      const type = row.dataset.type;
      const on = row.querySelector('.vapp_eye')?.getAttribute('aria-pressed') !== 'true';
      applyFx(sc, els, (fx) => (fx[type] ? { ...fx, [type]: { ...fx[type], enabled: on } } : fx), `${on ? 'Show' : 'Hide'} ${FX_LABELS[type]}`);
      render();
      return;
    }
    if (kind === 'fill' || kind === 'stroke') {
      window.__visterasOpenColorPicker?.(kind);
      return;
    }
    if (kind === 'effect') {
      window.__visterasEffects?.edit?.(row.dataset.type);
      return;
    }
    if (kind === 'opacity') {
      window.__visterasDock?.open?.('transparency');
    }
  });

  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') render();
    return result;
  };

  document.getElementById('action_window_appearance')?.addEventListener('click', () => {
    window.__visterasDock?.toggle?.('appearance');
  });

  window.__visterasAppearance = { render, appearanceRows };
  render();
  return window.__visterasAppearance;
}
