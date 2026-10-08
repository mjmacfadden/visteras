/**
 * Visteras Vector — Window ▸ Appearance (⇧F6), Illustrator-style list for the
 * selection: Stroke, Fill, each effect, Opacity. Click a row to edit; effect
 * eyes toggle visibility. Gaps vs Illustrator are listed in the panel footer
 * and in the PR body (no fill/stroke stacking, no drag-reorder, no per-fill
 * effects, no Graphic Styles).
 *
 * Stroke row: inline weight field + Illustrator presets + steppers (reuses
 * color-system writeStrokeWidth). Underlined "Stroke" opens the Stroke dock
 * (cap/join/align/dash). Swatch opens the color picker; swatch ▾ opens Swatches.
 */
import { FX_ATTR, FX_ORDER, FX_LABELS, parseFx, summarizeEffect, applyFx } from './visteras-effects.js?v=appearance-1';
import { readOpacityPercent, selectionOpacity, applyOpacity } from './visteras-transparency.js?v=gravit-1';
import {
  ILLUSTRATOR_STROKE_WEIGHT_PRESETS,
  stepStrokeWeight,
  formatStrokeWeight,
} from './visteras-stroke-weight.js?v=1';

const EYE = (on) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${on ? '' : '<path d="m3 3 18 18" stroke-width="2"/>'}</svg>`;

export { ILLUSTRATOR_STROKE_WEIGHT_PRESETS, stepStrokeWeight, formatStrokeWeight };

/** Build the Appearance rows for a selection (pure; no DOM writes). */
export function appearanceRows(elements) {
  const els = (elements || []).filter((el) => el?.getAttribute);
  if (!els.length) return { empty: true, rows: [] };
  const fills = new Set(els.map((el) => el.getAttribute('fill') || 'none'));
  const strokes = new Set(els.map((el) => el.getAttribute('stroke') || 'none'));
  // Prefer data-visteras-stroke-weight (user weight) when present — same as Properties.
  const weights = new Set(els.map((el) => {
    const stored = el.getAttribute('data-visteras-stroke-weight');
    if (stored != null && stored !== '') return stored;
    return el.getAttribute('stroke-width') || '1';
  }));
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

function weightPresetOptions(current) {
  const cur = current === 'mixed' ? '' : String(current);
  const opts = ILLUSTRATOR_STROKE_WEIGHT_PRESETS.map((w) => {
    const s = formatStrokeWeight(w);
    return `<option value="${s}"${cur === s ? ' selected' : ''}>${s} pt</option>`;
  });
  // Include current value if not in the preset list (custom weight).
  if (cur && !ILLUSTRATOR_STROKE_WEIGHT_PRESETS.some((w) => formatStrokeWeight(w) === cur)) {
    opts.unshift(`<option value="${cur}" selected>${cur} pt</option>`);
  }
  return opts.join('');
}

function strokeWeightMarkup(weight) {
  const display = weight === 'mixed' ? '' : formatStrokeWeight(weight);
  const placeholder = weight === 'mixed' ? 'Mixed' : '';
  return `<span class="vapp_weight" data-kind="stroke-weight">
    <input type="number" class="vapp_weight_input" id="vapp_stroke_weight" min="0" max="999" step="any"
      value="${display}" placeholder="${placeholder}" aria-label="Stroke weight" title="Stroke weight" />
    <select class="vapp_weight_presets" id="vapp_stroke_weight_presets" aria-label="Stroke weight presets" title="Stroke weight presets">
      <option value="" disabled${weight === 'mixed' || !display ? ' selected' : ''}>pt</option>
      ${weightPresetOptions(weight)}
    </select>
    <span class="vapp_weight_spin" role="group" aria-label="Stroke weight steppers">
      <button type="button" class="vapp_weight_spin_btn" data-dir="1" tabindex="-1" title="Increase stroke weight" aria-label="Increase">▲</button>
      <button type="button" class="vapp_weight_spin_btn" data-dir="-1" tabindex="-1" title="Decrease stroke weight" aria-label="Decrease">▼</button>
    </span>
  </span>`;
}

function paintSwatchMarkup(kind, value, label) {
  const swatch = value === 'mixed' ? 'mixed' : (value === 'none' ? 'none' : value);
  const style = swatch !== 'none' && swatch !== 'mixed' ? `background:${swatch}` : '';
  return `<span class="vapp_swatch_wrap" data-kind="${kind}">
    <button type="button" class="vapp_swatch${swatch === 'none' ? ' is-none' : ''}${swatch === 'mixed' ? ' is-mixed' : ''}"
      data-kind="${kind}" data-act="swatch" style="${style}" aria-label="${label} color" title="${label} color"></button>
    <button type="button" class="vapp_swatch_menu" data-kind="${kind}" data-act="swatches"
      title="Swatches" aria-label="${label} swatches">▾</button>
  </span>`;
}

export function mountAppearance(editor) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasAppearance) return window.__visterasAppearance || null;

  const pane = document.getElementById('vdock_appearance_panel');
  if (!pane) return null;

  const targets = () => (sc.getSelectedElements?.() || []).filter((el) => el && el.getAttribute && el.id && !el.classList?.contains('layer'));

  const writeWeight = (value, { live = false } = {}) => {
    const cs = window.__visterasColorSystem;
    if (typeof cs?.writeStrokeWidth === 'function') {
      cs.writeStrokeWidth(value, { live });
      return;
    }
    // Fallback before color-system finishes mounting.
    const n = Math.max(0, Number(value));
    if (Number.isNaN(n)) return;
    if (typeof sc.setCurProperties === 'function') sc.setCurProperties('stroke_width', n);
    const els = targets();
    for (const el of els) {
      el.setAttribute('data-visteras-stroke-weight', String(n));
      el.setAttribute('stroke-width', String(n));
    }
    const appW = document.getElementById('vcs_app_stroke_weight');
    if (appW && document.activeElement !== appW) appW.value = formatStrokeWeight(n);
    const dkW = document.getElementById('vdock_stroke_weight_input');
    if (dkW && document.activeElement !== dkW) dkW.value = formatStrokeWeight(n);
    sc.call?.('changed', els);
  };

  const openStrokeOptions = () => {
    window.__visterasColorSystem?.setActiveTarget?.('stroke', { syncColor: true });
    if (window.__visterasDock) window.__visterasDock.open('stroke');
  };

  const openSwatches = (kind) => {
    window.__visterasColorSystem?.setActiveTarget?.(kind, { syncColor: true });
    if (window.__visterasDock) window.__visterasDock.open('swatches');
  };

  const openColor = (kind) => {
    window.__visterasOpenColorPicker?.(kind);
  };

  let lastWeight = 1;
  let wiringWeight = false;

  const wireWeightControls = () => {
    if (wiringWeight) return;
    const input = pane.querySelector('#vapp_stroke_weight');
    const presets = pane.querySelector('#vapp_stroke_weight_presets');
    if (!input) return;
    wiringWeight = true;
    lastWeight = Number(input.value) || lastWeight || 1;

    const applyCommit = () => {
      const n = Math.max(0, Number(input.value));
      if (Number.isNaN(n)) return;
      input.value = formatStrokeWeight(n);
      lastWeight = n;
      writeWeight(n, { live: false });
      if (presets) presets.value = formatStrokeWeight(n);
    };

    input.addEventListener('input', (e) => {
      const raw = Number(input.value);
      if (!Number.isFinite(raw)) return;
      const inputType = e instanceof InputEvent ? e.inputType : null;
      const isTyping = !!inputType && (
        inputType.startsWith('insert')
        || inputType.startsWith('delete')
        || inputType === 'historyUndo'
        || inputType === 'historyRedo'
      );
      if (isTyping) {
        lastWeight = raw;
        writeWeight(raw, { live: true });
        return;
      }
      const dir = raw > lastWeight + 1e-9 ? 1 : raw < lastWeight - 1e-9 ? -1 : 0;
      if (dir) {
        const next = stepStrokeWeight(lastWeight, dir);
        input.value = formatStrokeWeight(next);
        lastWeight = next;
        writeWeight(next, { live: false });
      } else {
        lastWeight = raw;
        writeWeight(raw, { live: true });
      }
    });
    input.addEventListener('change', applyCommit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const next = stepStrokeWeight(input.value || lastWeight, e.key === 'ArrowUp' ? 1 : -1);
        input.value = formatStrokeWeight(next);
        lastWeight = next;
        writeWeight(next, { live: false });
        if (presets) presets.value = formatStrokeWeight(next);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCommit();
        input.blur();
      }
    });

    presets?.addEventListener('change', () => {
      const v = presets.value;
      if (v === '' || v == null) return;
      input.value = formatStrokeWeight(v);
      lastWeight = Number(v);
      writeWeight(v, { live: false });
    });
    // Selecting the same preset again still fires on some browsers via input
    presets?.addEventListener('input', () => {
      const v = presets.value;
      if (v === '' || v == null) return;
      input.value = formatStrokeWeight(v);
      lastWeight = Number(v);
      writeWeight(v, { live: false });
    });

    for (const btn of pane.querySelectorAll('.vapp_weight_spin_btn')) {
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dir = Number(btn.dataset.dir) || 0;
        if (!dir) return;
        const next = stepStrokeWeight(input.value || lastWeight, dir);
        input.value = formatStrokeWeight(next);
        lastWeight = next;
        writeWeight(next, { live: false });
        if (presets) presets.value = formatStrokeWeight(next);
      });
    }
    wiringWeight = false;
  };

  const render = () => {
    const els = targets();
    const { empty, rows, count } = appearanceRows(els);
    const activeWeight = document.activeElement?.id === 'vapp_stroke_weight'
      || document.activeElement?.id === 'vapp_stroke_weight_presets';
    if (empty) {
      pane.innerHTML = `<div class="vapp_empty">Select an object to see its appearance.</div>
        <p class="vapp_gaps">Gaps vs Illustrator: one Fill and one Stroke (no stacking / reorder); effects are object-level only; no Graphic Styles; no arrowheads in Stroke options yet.</p>`;
      return;
    }
    // Don't clobber the weight field while the user is typing in it.
    if (activeWeight) {
      // Still update non-weight chrome via a light path — skip full rebuild.
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
          if (r.kind === 'stroke') {
            return `<div class="vapp_row vapp_row_stroke" role="listitem" data-kind="stroke">
              <span class="vapp_eye_spacer" aria-hidden="true"></span>
              ${paintSwatchMarkup('stroke', r.value, 'Stroke')}
              <button type="button" class="vapp_label vapp_label_link" data-kind="stroke" data-act="stroke-options" title="Stroke options">${r.label}</button>
              ${strokeWeightMarkup(r.weight)}
            </div>`;
          }
          // Fill
          return `<div class="vapp_row" role="listitem" data-kind="fill">
            <span class="vapp_eye_spacer" aria-hidden="true"></span>
            ${paintSwatchMarkup('fill', r.value, 'Fill')}
            <button type="button" class="vapp_label vapp_label_link" data-kind="fill" data-act="swatches" title="Fill swatches">${r.label}</button>
            <span class="vapp_summary">${r.value === 'none' ? 'None' : (r.value === 'mixed' ? 'Mixed' : r.value)}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="vapp_gaps">Gaps vs Illustrator: one Fill/Stroke (no stacking or drag-reorder); object-level effects only; no Graphic Styles; Stroke options reuse the Stroke dock (no arrowheads yet); Inner Shadow shown when present but not under fx Add.</p>`;
    wireWeightControls();
  };

  pane.addEventListener('click', (e) => {
    // Weight controls handle their own clicks.
    if (e.target.closest('.vapp_weight')) return;

    const actEl = e.target.closest('[data-act]');
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

    const act = actEl?.dataset?.act;
    if (act === 'swatch' && (kind === 'fill' || kind === 'stroke')) {
      e.preventDefault();
      e.stopPropagation();
      openColor(kind);
      return;
    }
    if (act === 'swatches' && (kind === 'fill' || kind === 'stroke')) {
      e.preventDefault();
      e.stopPropagation();
      openSwatches(kind);
      return;
    }
    if (act === 'stroke-options' || (kind === 'stroke' && e.target.closest('.vapp_label'))) {
      e.preventDefault();
      e.stopPropagation();
      openStrokeOptions();
      return;
    }
    if (kind === 'fill' && e.target.closest('.vapp_label')) {
      e.preventDefault();
      e.stopPropagation();
      openSwatches('fill');
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

  // Keep Appearance weight in sync when Properties / Stroke dock change weight.
  window.addEventListener('visteras:color-changed', () => {
    if (document.activeElement?.id === 'vapp_stroke_weight') return;
    render();
  });

  window.__visterasAppearance = {
    render,
    appearanceRows,
    writeWeight,
    openStrokeOptions,
    ILLUSTRATOR_STROKE_WEIGHT_PRESETS,
  };
  render();
  return window.__visterasAppearance;
}
