/**
 * Visteras Vector — Illustrator-style arrowheads in the Stroke panel.
 *
 * Start/End pickers, swap, scale (separate), align (tip beyond end vs tip at end).
 * Markers take the stroke color. Stored per-element via data-visteras-arrow-* and
 * SVG marker-start / marker-end. Native SVG markers render on canvas and in
 * SVG/PNG/PDF export (svg2pdf + rasterize via <img>).
 *
 * Retires the hidden SVG-Edit ext-markers UX (extension unloaded).
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const ATTR = {
  start: 'data-visteras-arrow-start',
  end: 'data-visteras-arrow-end',
  startScale: 'data-visteras-arrow-start-scale',
  endScale: 'data-visteras-arrow-end-scale',
  align: 'data-visteras-arrow-align', // 'extend' | 'end'
};

/** Illustrator-like arrowhead styles (viewBox 0 0 100 100; tip at x=100 for "forward"). */
export const ARROW_STYLES = {
  none: null,
  open: { d: 'M20 20 L90 50 L20 80', fill: 'none', strokeWidth: 12, strokeLinecap: 'round', strokeLinejoin: 'round' },
  open_round: { d: 'M15 15 L90 50 L15 85', fill: 'none', strokeWidth: 14, strokeLinecap: 'round', strokeLinejoin: 'round' },
  filled: { d: 'M10 20 L90 50 L10 80 Z' },
  filled_stealth: { d: 'M10 15 L95 50 L10 85 L30 50 Z' },
  triangle: { d: 'M15 15 L90 50 L15 85 Z' },
  triangle_wide: { d: 'M5 5 L95 50 L5 95 Z' },
  bar: { d: 'M70 15 L70 85 L90 85 L90 15 Z' },
  circle: { kind: 'circle', r: 28, cx: 70, cy: 50 },
  circle_open: { kind: 'circle', r: 26, cx: 70, cy: 50, fill: 'none', strokeWidth: 10 },
  diamond: { d: 'M50 15 L90 50 L50 85 L10 50 Z' },
  square: { d: 'M35 20 L85 20 L85 80 L35 80 Z' },
};

export const ARROW_STYLE_LABELS = {
  none: 'None',
  open: 'Open Arrow',
  open_round: 'Open Arrow Round',
  filled: 'Arrow',
  filled_stealth: 'Stealth',
  triangle: 'Triangle',
  triangle_wide: 'Triangle Wide',
  bar: 'Bar',
  circle: 'Circle',
  circle_open: 'Circle Outline',
  diamond: 'Diamond',
  square: 'Square',
};

const ELIGIBLE = new Set(['path', 'line', 'polyline', 'polygon']);

export function isArrowEligible(el) {
  return !!el && ELIGIBLE.has(el.localName);
}

export function readArrowheads(el) {
  return {
    start: el.getAttribute(ATTR.start) || 'none',
    end: el.getAttribute(ATTR.end) || 'none',
    startScale: Math.max(1, Number(el.getAttribute(ATTR.startScale)) || 100),
    endScale: Math.max(1, Number(el.getAttribute(ATTR.endScale)) || 100),
    align: el.getAttribute(ATTR.align) === 'end' ? 'end' : 'extend',
  };
}

function markerId(el, which) {
  const id = el.id || 'el';
  return `visteras_arrow_${which}_${id}`;
}

function ensureDefs(sc) {
  const root = sc.getSvgContent();
  let defs = root.querySelector(':scope > defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    root.insertBefore(defs, root.firstChild);
  }
  return defs;
}

function strokeColorOf(el) {
  const s = el.getAttribute('stroke');
  if (s && s !== 'none') return s;
  try {
    const cs = getComputedStyle(el).stroke;
    if (cs && cs !== 'none') return cs;
  } catch { /* ignore */ }
  return '#000000';
}

/**
 * Marker refX (viewBox units). Illustrator align:
 *  - extend: the tip extends past the path end (path end sits at the arrow base)
 *  - end: the tip is placed exactly at the path end
 * Start markers are mirrored, so their tip sits at 100 - tipX.
 */
export function arrowTipX(styleKey) {
  const style = ARROW_STYLES[styleKey];
  if (!style) return 0;
  if (style.kind === 'circle') return style.cx + style.r;
  return 92;
}
export function arrowRefX(styleKey, { align = 'extend', which = 'end' } = {}) {
  const tip = arrowTipX(styleKey);
  const base = 20; // arrow base / back of the head
  const endRef = align === 'end' ? tip : base;
  return which === 'start' ? 100 - endRef : endRef;
}

/**
 * Build / refresh a <marker> for one end. Returns marker id or null for none.
 * align=extend → tip past end (refX near tip); align=end → tip at path end.
 */
export function buildMarkerElement(styleKey, {
  id,
  color = '#000',
  scale = 100,
  align = 'extend',
  which = 'end', // start markers flip
} = {}) {
  const style = ARROW_STYLES[styleKey];
  if (!style || styleKey === 'none') return null;
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('markerUnits', 'strokeWidth');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('overflow', 'visible');
  marker.setAttribute('data-visteras-arrow', styleKey);
  const size = 4 * (Math.max(1, scale) / 100);
  marker.setAttribute('markerWidth', String(size));
  marker.setAttribute('markerHeight', String(size));
  marker.setAttribute('viewBox', '0 0 100 100');
  marker.setAttribute('refX', String(arrowRefX(styleKey, { align, which })));
  marker.setAttribute('refY', '50');

  const g = document.createElementNS(SVG_NS, 'g');
  if (which === 'start') g.setAttribute('transform', 'translate(100 0) scale(-1 1)');

  if (style.kind === 'circle') {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(style.cx));
    c.setAttribute('cy', String(style.cy));
    c.setAttribute('r', String(style.r));
    if (style.fill === 'none') {
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-width', String(style.strokeWidth || 10));
    } else {
      c.setAttribute('fill', color);
      c.setAttribute('stroke', 'none');
    }
    g.append(c);
  } else {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', style.d);
    if (style.fill === 'none') {
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', String(style.strokeWidth || 12));
      if (style.strokeLinecap) p.setAttribute('stroke-linecap', style.strokeLinecap);
      if (style.strokeLinejoin) p.setAttribute('stroke-linejoin', style.strokeLinejoin);
    } else {
      p.setAttribute('fill', color);
      p.setAttribute('stroke', 'none');
    }
    g.append(p);
  }
  marker.append(g);
  return marker;
}

/** Apply arrowhead settings to one element (updates attrs + marker defs). */
export function applyArrowheads(sc, el, patch = {}) {
  if (!isArrowEligible(el)) return false;
  if (!el.id) el.setAttribute('id', sc.getNextId());
  const cur = readArrowheads(el);
  const next = {
    start: patch.start ?? cur.start,
    end: patch.end ?? cur.end,
    startScale: patch.startScale ?? cur.startScale,
    endScale: patch.endScale ?? cur.endScale,
    align: patch.align ?? cur.align,
  };
  if (!(next.start in ARROW_STYLES)) next.start = 'none';
  if (!(next.end in ARROW_STYLES)) next.end = 'none';
  next.startScale = Math.max(1, Math.min(1000, Number(next.startScale) || 100));
  next.endScale = Math.max(1, Math.min(1000, Number(next.endScale) || 100));
  next.align = next.align === 'end' ? 'end' : 'extend';

  const setOrClear = (name, val, empty) => {
    if (val == null || val === empty) el.removeAttribute(name);
    else el.setAttribute(name, String(val));
  };
  setOrClear(ATTR.start, next.start, 'none');
  setOrClear(ATTR.end, next.end, 'none');
  setOrClear(ATTR.startScale, next.startScale === 100 ? null : next.startScale, null);
  setOrClear(ATTR.endScale, next.endScale === 100 ? null : next.endScale, null);
  setOrClear(ATTR.align, next.align === 'extend' ? null : next.align, null);

  const defs = ensureDefs(sc);
  const color = strokeColorOf(el);
  const syncEnd = (which, styleKey, scale) => {
    const id = markerId(el, which);
    defs.querySelector(`#${CSS.escape(id)}`)?.remove();
    const attr = which === 'start' ? 'marker-start' : 'marker-end';
    if (!styleKey || styleKey === 'none') {
      el.removeAttribute(attr);
      return;
    }
    const marker = buildMarkerElement(styleKey, { id, color, scale, align: next.align, which });
    if (marker) {
      defs.append(marker);
      el.setAttribute(attr, `url(#${id})`);
    } else {
      el.removeAttribute(attr);
    }
  };
  syncEnd('start', next.start, next.startScale);
  syncEnd('end', next.end, next.endScale);
  return true;
}

/** Re-color / rebuild markers when stroke paint changes. */
export function refreshArrowheadColors(sc, el) {
  if (!isArrowEligible(el)) return;
  const v = readArrowheads(el);
  if (v.start === 'none' && v.end === 'none') return;
  // Only rebuild when the stroke color actually changed (avoid churn on moves).
  const color = strokeColorOf(el);
  const defs = sc.getSvgContent().querySelector(':scope > defs');
  const stale = ['start', 'end'].some((which) => {
    if (v[which] === 'none') return false;
    const m = defs?.querySelector(`#${CSS.escape(markerId(el, which))}`);
    const shape = m?.children?.[0]?.children?.[0];
    if (!shape) return true;
    const paint = shape.getAttribute('fill') === 'none' ? shape.getAttribute('stroke') : shape.getAttribute('fill');
    return paint !== color;
  });
  if (stale) applyArrowheads(sc, el, v);
}

export function swapArrowheads(sc, el) {
  const v = readArrowheads(el);
  return applyArrowheads(sc, el, {
    start: v.end,
    end: v.start,
    startScale: v.endScale,
    endScale: v.startScale,
  });
}

/** Pure snapshot used by export-parity tests. */
export function arrowheadExportSnapshot(el) {
  const v = readArrowheads(el);
  return {
    ...v,
    markerStart: el.getAttribute('marker-start'),
    markerEnd: el.getAttribute('marker-end'),
    stroke: el.getAttribute('stroke'),
  };
}

function optionHtml() {
  return Object.entries(ARROW_STYLE_LABELS)
    .map(([k, label]) => `<option value="${k}">${label}</option>`)
    .join('');
}

export function mountArrowheads(editor) {
  if (window.__visterasArrowheads) return window.__visterasArrowheads;
  const sc = editor.svgCanvas;

  const injectUI = () => {
    const pane = document.getElementById('vdock_stroke_panel');
    if (!pane || document.getElementById('vdock_arrowheads')) return;
    const block = document.createElement('div');
    block.id = 'vdock_arrowheads';
    block.innerHTML = `
      <div class="vdock-stroke-row" style="align-items:flex-start;">
        <span class="vdock-stroke-label">Arrowheads</span>
        <div class="vdock-stroke-control" style="flex-direction:column;align-items:stretch;gap:6px;width:100%;">
          <div style="display:flex;gap:6px;align-items:center;">
            <label style="flex:1;font-size:11px;color:#aaa;">Start
              <select id="varr_start" aria-label="Start arrowhead" style="width:100%;">${optionHtml()}</select>
            </label>
            <button type="button" id="varr_swap" title="Swap start and end arrowheads" aria-label="Swap arrowheads" style="flex:none;padding:2px 6px;">⇄</button>
            <label style="flex:1;font-size:11px;color:#aaa;">End
              <select id="varr_end" aria-label="End arrowhead" style="width:100%;">${optionHtml()}</select>
            </label>
          </div>
          <div style="display:flex;gap:6px;">
            <label style="flex:1;font-size:11px;color:#aaa;">Start scale %
              <input type="number" id="varr_start_scale" min="1" max="1000" step="1" value="100" aria-label="Start arrowhead scale">
            </label>
            <label style="flex:1;font-size:11px;color:#aaa;">End scale %
              <input type="number" id="varr_end_scale" min="1" max="1000" step="1" value="100" aria-label="End arrowhead scale">
            </label>
          </div>
          <label style="font-size:11px;color:#aaa;">Align
            <select id="varr_align" aria-label="Arrowhead alignment" style="width:100%;">
              <option value="extend">Extend tip beyond end of path</option>
              <option value="end">Place tip at end of path</option>
            </select>
          </label>
        </div>
      </div>`;
    pane.append(block);

    const start = block.querySelector('#varr_start');
    const end = block.querySelector('#varr_end');
    const startScale = block.querySelector('#varr_start_scale');
    const endScale = block.querySelector('#varr_end_scale');
    const align = block.querySelector('#varr_align');

    const targets = () => (sc.getSelectedElements?.() || []).filter(isArrowEligible);

    const render = () => {
      const els = targets();
      const disabled = !els.length;
      for (const el of [start, end, startScale, endScale, align, block.querySelector('#varr_swap')]) {
        if (el) el.disabled = disabled;
      }
      if (!els.length) return;
      const v = readArrowheads(els[0]);
      if (document.activeElement !== start) start.value = v.start;
      if (document.activeElement !== end) end.value = v.end;
      if (document.activeElement !== startScale) startScale.value = String(v.startScale);
      if (document.activeElement !== endScale) endScale.value = String(v.endScale);
      if (document.activeElement !== align) align.value = v.align;
    };

    const commit = (patch, label = 'Arrowheads') => {
      const els = targets();
      if (!els.length) return;
      const { BatchCommand, ChangeElementCommand } = sc.history || {};
      const batch = BatchCommand ? new BatchCommand(label) : null;
      for (const el of els) {
        const before = {};
        for (const k of Object.values(ATTR)) before[k] = el.getAttribute(k);
        before['marker-start'] = el.getAttribute('marker-start');
        before['marker-end'] = el.getAttribute('marker-end');
        applyArrowheads(sc, el, patch);
        if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
      }
      if (batch) sc.addCommandToHistory?.(batch);
      sc.call?.('changed', els);
      render();
    };

    start.addEventListener('change', () => commit({ start: start.value }, 'Start arrowhead'));
    end.addEventListener('change', () => commit({ end: end.value }, 'End arrowhead'));
    startScale.addEventListener('change', () => commit({ startScale: Number(startScale.value) }, 'Start arrowhead scale'));
    endScale.addEventListener('change', () => commit({ endScale: Number(endScale.value) }, 'End arrowhead scale'));
    align.addEventListener('change', () => commit({ align: align.value }, 'Arrowhead alignment'));
    block.querySelector('#varr_swap').addEventListener('click', () => {
      const els = targets();
      if (!els.length) return;
      const { BatchCommand, ChangeElementCommand } = sc.history || {};
      const batch = BatchCommand ? new BatchCommand('Swap arrowheads') : null;
      for (const el of els) {
        const before = {};
        for (const k of Object.values(ATTR)) before[k] = el.getAttribute(k);
        before['marker-start'] = el.getAttribute('marker-start');
        before['marker-end'] = el.getAttribute('marker-end');
        swapArrowheads(sc, el);
        if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
      }
      if (batch) sc.addCommandToHistory?.(batch);
      sc.call?.('changed', els);
      render();
    });

    const call = sc.call;
    sc.call = function (event, ...args) {
      const result = call.call(this, event, ...args);
      if (event === 'selected' || event === 'changed') {
        render();
        // Keep marker fill in sync with stroke color changes.
        if (event === 'changed') {
          for (const el of args[0] || []) refreshArrowheadColors(sc, el);
        }
      }
      return result;
    };
    // Stroke color can change without a 'changed' event (e.g. changeSelectedAttribute,
    // Color panel, eyedropper): watch stroke/style on arrowed elements and resync.
    const root = sc.getSvgContent?.();
    if (root && typeof MutationObserver !== 'undefined' && !root.__visterasArrowObserver) {
      root.__visterasArrowObserver = new MutationObserver((records) => {
        const seen = new Set();
        for (const r of records) {
          const el = r.target;
          if (seen.has(el) || !el.hasAttribute?.(ATTR.start) && !el.hasAttribute?.(ATTR.end)) continue;
          seen.add(el);
          refreshArrowheadColors(sc, el);
        }
      });
      root.__visterasArrowObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ['stroke', 'style'] });
    }
    window.__visterasArrowheadsRender = render;
    render();
  };

  injectUI();
  setTimeout(injectUI, 200);
  setTimeout(injectUI, 1000);

  window.__visterasArrowheads = {
    apply: (patch) => {
      for (const el of (sc.getSelectedElements?.() || []).filter(isArrowEligible)) applyArrowheads(sc, el, patch);
    },
    read: readArrowheads,
    styles: ARROW_STYLES,
    refresh: () => window.__visterasArrowheadsRender?.(),
  };
  return window.__visterasArrowheads;
}
