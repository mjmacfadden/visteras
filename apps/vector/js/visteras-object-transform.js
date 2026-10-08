/**
 * Visteras Vector — Object ▸ Transform (Illustrator UX)
 *
 * Transform Again (⌘D) · Move… (⇧⌘M) · Rotate… · Reflect… · Scale… · Reset Bounding Box
 *
 * Dialogs: Preview live, Copy (duplicate then transform), Enter=OK, Esc=Cancel.
 * Default origin = selection center (effect-inclusive via getStrokedBBox when available).
 * Values shown in the document unit. Each OK is one undo BatchCommand.
 * Last transform (incl. Copy variant) is replayed by Transform Again.
 */

import { convertToPixels, convertFromPixels } from './visteras-document-presets.js';
import { formatShortcut, detectMac } from './visteras-shortcut-label.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DIALOG_HOST = 'visteras-transform-dialog-host';

/** @type {null | object} */
let lastTransform = null;

export function getLastTransform() {
  return lastTransform ? { ...lastTransform } : null;
}

export function setLastTransform(rec) {
  lastTransform = rec ? { ...rec } : null;
  return lastTransform;
}

export function clearLastTransform() {
  lastTransform = null;
}

function selected(sc) {
  return (sc?.getSelectedElements?.() || []).filter(Boolean);
}

function getBaseUnit() {
  try {
    return window.__visterasDocumentShell?.getBaseUnit?.() || 'px';
  } catch {
    return 'px';
  }
}

function toDoc(val) {
  return convertToPixels(Number(val) || 0, getBaseUnit());
}

function fromDoc(px) {
  return convertFromPixels(Number(px) || 0, getBaseUnit());
}

function unitLabel() {
  return getBaseUnit();
}

function matrixFromSVG(m) {
  return new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
}

function documentMatrix(sc, el) {
  const content = sc.getSvgContent?.() || el.ownerSVGElement;
  return matrixFromSVG(content.getScreenCTM()).inverse().multiply(matrixFromSVG(el.getScreenCTM()));
}

function localMatrix(el) {
  let local = new DOMMatrix();
  const list = el.transform?.baseVal;
  if (list) {
    for (let i = 0; i < list.numberOfItems; i++) {
      local = local.multiply(matrixFromSVG(list.getItem(i).matrix));
    }
  }
  return local;
}

/**
 * Effect-inclusive bounds in document space (Illustrator dialogs use visual bounds).
 */
export function selectionBounds(sc, elements) {
  const els = elements || selected(sc);
  if (!els.length) return null;
  try {
    if (typeof sc.getStrokedBBox === 'function') {
      const b = sc.getStrokedBBox(els);
      if (b && Number.isFinite(b.x) && Number.isFinite(b.width)) {
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    }
  } catch { /* fall through */ }
  try {
    const points = els.flatMap((el) => {
      const b = el.getBBox();
      const m = documentMatrix(sc, el);
      return [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    });
    const x = Math.min(...points.map((p) => p.x));
    const y = Math.min(...points.map((p) => p.y));
    return {
      x,
      y,
      width: Math.max(...points.map((p) => p.x)) - x,
      height: Math.max(...points.map((p) => p.y)) - y,
    };
  } catch {
    return null;
  }
}

export function selectionCenter(sc, elements) {
  const b = selectionBounds(sc, elements);
  if (!b) return { x: 0, y: 0 };
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Pure: build a DOMMatrix in document space for a transform record around origin. */
export function matrixForTransform(rec, origin) {
  const ox = origin?.x || 0;
  const oy = origin?.y || 0;
  let m = new DOMMatrix().translate(ox, oy);
  switch (rec.kind) {
    case 'move':
      m = new DOMMatrix().translate(rec.dx || 0, rec.dy || 0);
      return m;
    case 'rotate': {
      const a = (Number(rec.angle) || 0) * Math.PI / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = m.multiply(new DOMMatrix([c, s, -s, c, 0, 0])).translate(-ox, -oy);
      return m;
    }
    case 'reflect': {
      let sx = 1;
      let sy = 1;
      let rot = 0;
      if (rec.axis === 'horizontal') sy = -1;
      else if (rec.axis === 'vertical') sx = -1;
      else {
        // Reflect across axis at `angle` degrees from horizontal through origin
        rot = Number(rec.axisAngle) || 0;
        const a = (rot * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        // R * scale(1,-1) * R^-1
        m = m
          .multiply(new DOMMatrix([c, s, -s, c, 0, 0]))
          .multiply(new DOMMatrix([1, 0, 0, -1, 0, 0]))
          .multiply(new DOMMatrix([c, -s, s, c, 0, 0]))
          .translate(-ox, -oy);
        return m;
      }
      m = m.multiply(new DOMMatrix([sx, 0, 0, sy, 0, 0])).translate(-ox, -oy);
      return m;
    }
    case 'scale': {
      const sx = Number(rec.sx);
      const sy = Number(rec.sy);
      m = m.multiply(new DOMMatrix([sx, 0, 0, sy, 0, 0])).translate(-ox, -oy);
      return m;
    }
    case 'flipH':
      return matrixForTransform({ kind: 'reflect', axis: 'vertical' }, origin);
    case 'flipV':
      return matrixForTransform({ kind: 'reflect', axis: 'horizontal' }, origin);
    default:
      return new DOMMatrix();
  }
}

/** Convert Move dialog fields to dx/dy in document pixels. */
export function moveDeltaFromFields({ mode, horizontal, vertical, distance, angle }) {
  if (mode === 'polar') {
    const dist = Number(distance) || 0;
    const a = ((Number(angle) || 0) * Math.PI) / 180;
    return { dx: dist * Math.cos(a), dy: -dist * Math.sin(a) }; // SVG y-down; Illustrator angle CCW from +x → negate dy for screen
  }
  return { dx: Number(horizontal) || 0, dy: Number(vertical) || 0 };
}

export function scaleFactorsFromFields({ uniform, uniformPct, scaleXPct, scaleYPct }) {
  if (uniform) {
    const s = (Number(uniformPct) || 100) / 100;
    return { sx: s, sy: s };
  }
  return {
    sx: (Number(scaleXPct) || 100) / 100,
    sy: (Number(scaleYPct) || 100) / 100,
  };
}

/**
 * Apply a document-space matrix to each element (local transform space), one undo batch.
 * Optionally scale stroke-width when rec.scaleStrokes and sx===sy.
 */
export function applyDocumentMatrix(sc, elements, docMatrix, label = 'Transform') {
  const els = (elements || selected(sc)).filter(Boolean);
  if (!els.length || !sc?.history?.BatchCommand) return false;
  const batch = new sc.history.BatchCommand(label);
  for (const el of els) {
    const old = el.getAttribute('transform');
    const parent = documentMatrix(sc, el.parentNode || sc.getSvgContent());
    const local = localMatrix(el);
    const result = parent.inverse().multiply(docMatrix).multiply(parent).multiply(local);
    el.setAttribute('transform', result.toString());
    batch.addSubCommand(new sc.history.ChangeElementCommand(el, { transform: old }));
  }
  window.__visterasLiveSyncStrokeAlign?.(els, sc);
  sc.addCommandToHistory(batch);
  sc.call?.('changed', els);
  return true;
}

function scaleStrokesOnElements(sc, elements, factor, batch) {
  if (!Number.isFinite(factor) || factor === 1) return;
  for (const el of elements) {
    const sw = parseFloat(el.getAttribute('stroke-width'));
    if (!Number.isFinite(sw)) continue;
    const old = { 'stroke-width': el.getAttribute('stroke-width') };
    el.setAttribute('stroke-width', String(sw * factor));
    const weight = el.getAttribute('data-visteras-stroke-weight');
    if (weight != null && Number.isFinite(parseFloat(weight))) {
      old['data-visteras-stroke-weight'] = weight;
      el.setAttribute('data-visteras-stroke-weight', String(parseFloat(weight) * factor));
    }
    batch?.addSubCommand?.(new sc.history.ChangeElementCommand(el, old));
  }
}

/**
 * Clone selection in place (no offset), leave clones selected. Returns new selection.
 */
export function duplicateSelectionInPlace(sc) {
  const before = new Set(selected(sc));
  if (!before.size) return [];
  // SVG-Edit cloneSelectedElements(dx,dy) offsets; use 0,0
  if (typeof sc.cloneSelectedElements === 'function') {
    sc.cloneSelectedElements(0, 0);
  }
  return selected(sc);
}

/**
 * Apply a transform record to the current selection (optionally as a Copy).
 * Records lastTransform for Transform Again.
 */
export function applyTransformRecord(sc, rec, { copy = false, record = true, elements = null } = {}) {
  let els = elements || selected(sc);
  if (!els.length) return false;
  if (copy) {
    els = duplicateSelectionInPlace(sc);
    if (!els.length) return false;
  }
  const origin = selectionCenter(sc, els);
  // Snapshot origin into record for Transform Again (absolute deltas already in rec)
  const matrix = matrixForTransform(rec, origin);
  const label = copy ? `${labelFor(rec)} Copy` : labelFor(rec);

  if (rec.kind === 'scale' && rec.scaleStrokes && Math.abs((rec.sx || 1) - (rec.sy || 1)) < 1e-9) {
    const batch = new sc.history.BatchCommand(label);
    // Apply matrix via sub-batch pattern: temporarily use apply then merge is hard;
    // apply matrix first then stroke as second history — better one batch:
    for (const el of els) {
      const old = el.getAttribute('transform');
      const parent = documentMatrix(sc, el.parentNode || sc.getSvgContent());
      const local = localMatrix(el);
      const result = parent.inverse().multiply(matrix).multiply(parent).multiply(local);
      el.setAttribute('transform', result.toString());
      batch.addSubCommand(new sc.history.ChangeElementCommand(el, { transform: old }));
    }
    scaleStrokesOnElements(sc, els, rec.sx || 1, batch);
    window.__visterasLiveSyncStrokeAlign?.(els, sc);
    sc.addCommandToHistory(batch);
    sc.call?.('changed', els);
  } else {
    applyDocumentMatrix(sc, els, matrix, label);
  }

  if (record) {
    setLastTransform({ ...rec, copy: !!copy, originSnapshot: origin });
  }
  return true;
}

function labelFor(rec) {
  switch (rec?.kind) {
    case 'move': return 'Move';
    case 'rotate': return 'Rotate';
    case 'reflect': return 'Reflect';
    case 'scale': return 'Scale';
    case 'flipH': return 'Flip Horizontal';
    case 'flipV': return 'Flip Vertical';
    default: return 'Transform';
  }
}

/**
 * Transform Again — replay last transform. If last was a Copy, duplicate first.
 */
export function transformAgain(sc) {
  const rec = getLastTransform();
  if (!rec) {
    if (typeof window !== 'undefined' && window.showStudioToast) {
      window.showStudioToast('Nothing to transform again.', 'info', 2500);
    }
    return false;
  }
  // Re-apply with same copy flag
  return applyTransformRecord(sc, rec, { copy: !!rec.copy, record: true });
}

/**
 * Reset Bounding Box — bake transform into path geometry, clear transform attr.
 * Uses Paper.js when available; falls back to convertToPath + leave transform if bake fails.
 */
export function resetBoundingBox(sc, elements = null) {
  const els = (elements || selected(sc)).filter(Boolean);
  if (!els.length) return false;
  const batch = new sc.history.BatchCommand('Reset Bounding Box');
  const next = [];

  for (const el of els) {
    const hasXf = !!(el.getAttribute('transform') || '').trim();
    if (!hasXf) {
      next.push(el);
      continue;
    }

    let target = el;
    // Convert primitives to path so we can bake
    if (typeof sc.convertToPath === 'function' && /^(rect|circle|ellipse|line|polyline|polygon)$/i.test(el.tagName)) {
      try {
        const pathEl = sc.convertToPath(el);
        if (pathEl) {
          // convertToPath typically replaces el and may push its own history — we still bake
          target = pathEl;
        }
      } catch { /* keep el */ }
    }

    if (window.paper && target.tagName === 'path') {
      try {
        const scope = new window.paper.PaperScope();
        scope.setup(document.createElement('canvas'));
        const imported = scope.project.importSVG(target, { insert: false });
        let item = imported;
        if (item?.className === 'Group' || item?.children) {
          // flatten
          let combined = null;
          const walk = (it) => {
            if (!it) return;
            if (it instanceof scope.PathItem) {
              combined = combined ? combined.unite(it) : it;
            } else if (it.children) {
              [...it.children].forEach(walk);
            }
          };
          walk(item);
          item = combined || item;
        }
        if (item instanceof scope.Shape) item = item.toPath(true);
        // importSVG already applied transform into item; export without SVG transform
        const exported = item.exportSVG({ asString: false });
        let d = '';
        if (exported.tagName?.toLowerCase() === 'path') d = exported.getAttribute('d') || '';
        else {
          const paths = exported.querySelectorAll?.('path') || [];
          d = [...paths].map((p) => p.getAttribute('d')).filter(Boolean).join(' ');
        }
        if (d) {
          const oldD = target.getAttribute('d');
          const oldT = target.getAttribute('transform');
          target.setAttribute('d', d);
          target.removeAttribute('transform');
          batch.addSubCommand(new sc.history.ChangeElementCommand(target, { d: oldD, transform: oldT }));
          next.push(target);
          scope.project.clear();
          continue;
        }
        scope.project.clear();
      } catch (err) {
        console.warn('Reset Bounding Box Paper bake failed', err);
      }
    }

    // Fallback: clear transform only if identity-ish bake unavailable — still try recalculate
    const oldT = target.getAttribute('transform');
    // Keep visual by not clearing if we couldn't bake — toast once
    next.push(target);
    if (oldT) {
      // As last resort leave transform (Illustrator always succeeds); try SVG-Edit recalculate
      try { sc.recalculateDimensions?.(target); } catch { /* ignore */ }
    }
  }

  if (batch.stack?.length || batch.items?.length || true) {
    // BatchCommand stores in .cmds or similar — always add if we made ChangeElementCommands
    try { sc.addCommandToHistory(batch); } catch { /* ignore */ }
  }
  sc.clearSelection?.();
  sc.addToSelection?.(next, true);
  sc.call?.('changed', next);
  setLastTransform(null);
  return true;
}

/* ─── Dialog UI ─────────────────────────────────────────────────────────── */

function ensureHost() {
  let host = document.getElementById(DIALOG_HOST);
  if (host) return host;
  host = document.createElement('div');
  host.id = DIALOG_HOST;
  document.body.append(host);
  if (!document.getElementById('visteras_transform_dialog_style')) {
    const st = document.createElement('style');
    st.id = 'visteras_transform_dialog_style';
    st.textContent = `
      .vtx-overlay{position:fixed;inset:0;z-index:100050;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
      .vtx-dialog{background:#2a2a2e;border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 12px 48px rgba(0,0,0,.55);width:340px;color:#ddd;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
      .vtx-title{background:#1e1e22;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08);font-weight:600;color:#fff}
      .vtx-body{padding:14px 16px;display:flex;flex-direction:column;gap:10px}
      .vtx-row{display:flex;align-items:center;gap:8px}
      .vtx-row label{min-width:88px;color:#bbb}
      .vtx-row input[type=number],.vtx-row input[type=text],.vtx-row select{flex:1;height:28px;background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 8px;font:12px Roboto,sans-serif}
      .vtx-unit{color:#888;font-size:11px;min-width:28px}
      .vtx-check{display:flex;align-items:center;gap:6px;color:#ccc}
      .vtx-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);background:#242428}
      .vtx-actions button{height:30px;padding:0 14px;border-radius:5px;border:1px solid #555;background:#3a3a40;color:#eee;cursor:pointer;font:12px/1 -apple-system,sans-serif}
      .vtx-actions button.primary{background:#fa7c1b;border-color:#fa7c1b;color:#111;font-weight:600}
      .vtx-actions button:hover{filter:brightness(1.08)}
      .vtx-hint{font-size:11px;color:#888}
    `;
    document.head.append(st);
  }
  return host;
}

function snapshotTransforms(elements) {
  return elements.map((el) => ({
    el,
    transform: el.getAttribute('transform'),
    strokeWidth: el.getAttribute('stroke-width'),
    strokeWeight: el.getAttribute('data-visteras-stroke-weight'),
  }));
}

function restoreSnapshots(snaps) {
  for (const s of snaps) {
    if (s.transform == null) s.el.removeAttribute('transform');
    else s.el.setAttribute('transform', s.transform);
    if (s.strokeWidth == null) s.el.removeAttribute('stroke-width');
    else s.el.setAttribute('stroke-width', s.strokeWidth);
    if (s.strokeWeight == null) s.el.removeAttribute('data-visteras-stroke-weight');
    else s.el.setAttribute('data-visteras-stroke-weight', s.strokeWeight);
  }
}

/**
 * Generic Illustrator-style transform dialog.
 * buildBody(form) → fills fields; readRecord(form) → transform record (doc px / ratios).
 */
function openTransformDialog(sc, {
  title,
  buildBody,
  readRecord,
  defaultRecord,
}) {
  return new Promise((resolve) => {
    const els = selected(sc);
    if (!els.length) {
      window.showStudioToast?.('Select one or more objects to transform.', 'error', 2500);
      resolve(false);
      return;
    }

    const host = ensureHost();
    host.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'vtx-overlay';
    overlay.innerHTML = `
      <div class="vtx-dialog" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="vtx-title">${title}</div>
        <form class="vtx-body" id="vtx_form"></form>
        <div class="vtx-actions">
          <button type="button" data-act="copy">Copy</button>
          <button type="button" data-act="cancel">Cancel</button>
          <button type="button" class="primary" data-act="ok">OK</button>
        </div>
      </div>`;
    host.append(overlay);
    const form = overlay.querySelector('#vtx_form');
    buildBody(form);

    // Preview checkbox
    const previewRow = document.createElement('div');
    previewRow.className = 'vtx-check';
    previewRow.innerHTML = `<input type="checkbox" id="vtx_preview" checked /><label for="vtx_preview">Preview</label>`;
    form.append(previewRow);
    const previewCb = form.querySelector('#vtx_preview');

    const snaps = snapshotTransforms(els);
    let previewActive = false;

    const clearPreview = () => {
      if (!previewActive) return;
      restoreSnapshots(snaps);
      previewActive = false;
      sc.call?.('changed', els);
    };

    const runPreview = () => {
      if (!previewCb.checked) {
        clearPreview();
        return;
      }
      restoreSnapshots(snaps);
      const rec = readRecord(form);
      if (!rec) return;
      const origin = selectionCenter(sc, els);
      const matrix = matrixForTransform(rec, origin);
      for (const el of els) {
        const parent = documentMatrix(sc, el.parentNode || sc.getSvgContent());
        const local = localMatrixFromSnap(snaps.find((s) => s.el === el));
        const result = parent.inverse().multiply(matrix).multiply(parent).multiply(local);
        el.setAttribute('transform', result.toString());
        if (rec.kind === 'scale' && rec.scaleStrokes && Math.abs((rec.sx || 1) - (rec.sy || 1)) < 1e-9) {
          const base = snaps.find((s) => s.el === el);
          const sw = parseFloat(base?.strokeWidth);
          if (Number.isFinite(sw)) el.setAttribute('stroke-width', String(sw * (rec.sx || 1)));
        }
      }
      previewActive = true;
      sc.call?.('changed', els);
    };

    function localMatrixFromSnap(snap) {
      if (!snap?.transform) return new DOMMatrix();
      try {
        return new DOMMatrix(snap.transform);
      } catch {
        return new DOMMatrix();
      }
    }

    form.addEventListener('input', runPreview);
    form.addEventListener('change', runPreview);
    previewCb.addEventListener('change', () => {
      if (!previewCb.checked) clearPreview();
      else runPreview();
    });

    const finish = (result) => {
      document.removeEventListener('keydown', onKey, true);
      clearPreview();
      host.innerHTML = '';
      resolve(result);
    };

    const commit = (copy) => {
      clearPreview();
      const rec = readRecord(form) || defaultRecord;
      if (!rec) {
        finish(false);
        return;
      }
      applyTransformRecord(sc, rec, { copy: !!copy, record: true, elements: copy ? null : els });
      finish(true);
    };

    overlay.querySelector('[data-act=ok]').addEventListener('click', () => commit(false));
    overlay.querySelector('[data-act=copy]').addEventListener('click', () => commit(true));
    overlay.querySelector('[data-act=cancel]').addEventListener('click', () => finish(false));
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(false);
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Enter' && e.target?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        e.stopPropagation();
        commit(false);
      }
    };
    document.addEventListener('keydown', onKey, true);

    // Focus first number input
    form.querySelector('input[type=number],input[type=text]')?.focus();
    form.querySelector('input[type=number],input[type=text]')?.select?.();
    runPreview();
  });
}

export function openMoveDialog(sc) {
  const u = unitLabel();
  return openTransformDialog(sc, {
    title: 'Move',
    defaultRecord: { kind: 'move', dx: 0, dy: 0 },
    buildBody(form) {
      form.innerHTML = `
        <div class="vtx-row"><label>Mode</label>
          <select name="mode"><option value="rect">Horizontal / Vertical</option><option value="polar">Distance / Angle</option></select>
        </div>
        <div class="vtx-row vtx-rect"><label>Horizontal</label><input name="h" type="number" step="any" value="0" /><span class="vtx-unit">${u}</span></div>
        <div class="vtx-row vtx-rect"><label>Vertical</label><input name="v" type="number" step="any" value="0" /><span class="vtx-unit">${u}</span></div>
        <div class="vtx-row vtx-polar" hidden><label>Distance</label><input name="dist" type="number" step="any" value="0" /><span class="vtx-unit">${u}</span></div>
        <div class="vtx-row vtx-polar" hidden><label>Angle</label><input name="ang" type="number" step="any" value="0" /><span class="vtx-unit">°</span></div>
        <div class="vtx-hint">Positive Horizontal moves right; positive Vertical moves down.</div>
      `;
      const mode = form.querySelector('[name=mode]');
      const sync = () => {
        const polar = mode.value === 'polar';
        form.querySelectorAll('.vtx-rect').forEach((n) => { n.hidden = polar; });
        form.querySelectorAll('.vtx-polar').forEach((n) => { n.hidden = !polar; });
      };
      mode.addEventListener('change', sync);
      sync();
    },
    readRecord(form) {
      const mode = form.querySelector('[name=mode]').value;
      const fields = mode === 'polar'
        ? { mode: 'polar', distance: toDoc(form.querySelector('[name=dist]').value), angle: Number(form.querySelector('[name=ang]').value) || 0 }
        : { mode: 'rect', horizontal: toDoc(form.querySelector('[name=h]').value), vertical: toDoc(form.querySelector('[name=v]').value) };
      const { dx, dy } = moveDeltaFromFields(fields);
      return { kind: 'move', dx, dy };
    },
  });
}

export function openRotateDialog(sc) {
  return openTransformDialog(sc, {
    title: 'Rotate',
    defaultRecord: { kind: 'rotate', angle: 0 },
    buildBody(form) {
      form.innerHTML = `
        <div class="vtx-row"><label>Angle</label><input name="angle" type="number" step="any" value="0" /><span class="vtx-unit">°</span></div>
        <div class="vtx-hint">Positive angles rotate counter-clockwise around the object center.</div>
      `;
    },
    readRecord(form) {
      return { kind: 'rotate', angle: Number(form.querySelector('[name=angle]').value) || 0 };
    },
  });
}

export function openReflectDialog(sc) {
  return openTransformDialog(sc, {
    title: 'Reflect',
    defaultRecord: { kind: 'reflect', axis: 'vertical' },
    buildBody(form) {
      form.innerHTML = `
        <div class="vtx-row"><label>Axis</label>
          <select name="axis">
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
            <option value="angle">Angle…</option>
          </select>
        </div>
        <div class="vtx-row vtx-ang" hidden><label>Angle</label><input name="axisAngle" type="number" step="any" value="0" /><span class="vtx-unit">°</span></div>
      `;
      const axis = form.querySelector('[name=axis]');
      const sync = () => {
        form.querySelector('.vtx-ang').hidden = axis.value !== 'angle';
      };
      axis.addEventListener('change', sync);
      sync();
    },
    readRecord(form) {
      const axis = form.querySelector('[name=axis]').value;
      if (axis === 'angle') {
        return { kind: 'reflect', axis: 'angle', axisAngle: Number(form.querySelector('[name=axisAngle]').value) || 0 };
      }
      return { kind: 'reflect', axis };
    },
  });
}

export function openScaleDialog(sc) {
  return openTransformDialog(sc, {
    title: 'Scale',
    defaultRecord: { kind: 'scale', sx: 1, sy: 1, scaleStrokes: true },
    buildBody(form) {
      form.innerHTML = `
        <div class="vtx-check"><input type="checkbox" name="uniform" id="vtx_uniform" checked /><label for="vtx_uniform">Uniform</label></div>
        <div class="vtx-row vtx-uni"><label>Scale</label><input name="uni" type="number" step="any" value="100" /><span class="vtx-unit">%</span></div>
        <div class="vtx-row vtx-nu" hidden><label>Horizontal</label><input name="sx" type="number" step="any" value="100" /><span class="vtx-unit">%</span></div>
        <div class="vtx-row vtx-nu" hidden><label>Vertical</label><input name="sy" type="number" step="any" value="100" /><span class="vtx-unit">%</span></div>
        <div class="vtx-check"><input type="checkbox" name="scaleStrokes" id="vtx_ss" checked /><label for="vtx_ss">Scale Strokes &amp; Effects</label></div>
      `;
      const uni = form.querySelector('[name=uniform]');
      const sync = () => {
        const on = uni.checked;
        form.querySelectorAll('.vtx-uni').forEach((n) => { n.hidden = !on; });
        form.querySelectorAll('.vtx-nu').forEach((n) => { n.hidden = on; });
      };
      uni.addEventListener('change', sync);
      sync();
    },
    readRecord(form) {
      const uniform = form.querySelector('[name=uniform]').checked;
      const { sx, sy } = scaleFactorsFromFields({
        uniform,
        uniformPct: form.querySelector('[name=uni]').value,
        scaleXPct: form.querySelector('[name=sx]').value,
        scaleYPct: form.querySelector('[name=sy]').value,
      });
      return {
        kind: 'scale',
        sx,
        sy,
        scaleStrokes: form.querySelector('[name=scaleStrokes]').checked,
      };
    },
  });
}

/* ─── Menu + shortcuts ──────────────────────────────────────────────────── */

function injectTransformMenu() {
  const objList = document.querySelector('#menu_object > .menu_dropdown_list');
  if (!objList || document.getElementById('menu_object_transform')) return;

  const mac = detectMac();
  const scAgain = formatShortcut({ meta: true, key: 'D', mac });
  const scMove = formatShortcut({ meta: true, shift: true, key: 'M', mac });

  const block = document.createElement('div');
  block.innerHTML = `
    <div class="menu_dropdown_item menu_has_submenu" role="menuitem" aria-haspopup="true" id="menu_object_transform">
      Transform<span class="menu_submenu_arrow" aria-hidden="true">▸</span>
      <div class="menu_dropdown_list menu_submenu_list" role="menu">
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_transform_again">Transform Again <span class="menu_dropdown_shortcut" data-shortcut="Meta+D">${scAgain}</span></div>
        <div class="menu_dropdown_separator"></div>
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_transform_move">Move… <span class="menu_dropdown_shortcut" data-shortcut="Shift+Meta+M">${scMove}</span></div>
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_transform_rotate">Rotate…</div>
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_transform_reflect">Reflect…</div>
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_transform_scale">Scale…</div>
        <div class="menu_dropdown_separator"></div>
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_reset_bounding_box">Reset Bounding Box</div>
      </div>
    </div>
    <div class="menu_dropdown_separator" data-vtx-sep="1"></div>
  `;

  // Place after Flip Vertical (Illustrator: Transform near arrange/flip)
  const flipV = document.getElementById('action_flip_v');
  if (flipV?.parentNode) {
    const sep = flipV.nextElementSibling?.classList?.contains('menu_dropdown_separator')
      ? flipV.nextElementSibling
      : flipV;
    sep.after(...block.childNodes);
  } else {
    objList.prepend(...block.childNodes);
  }
}

function syncTransformMenu(sc) {
  const n = selected(sc).length;
  const hasLast = !!getLastTransform();
  const again = document.getElementById('action_transform_again');
  if (again) again.classList.toggle('disabled', !hasLast || n < 1);
  for (const id of [
    'action_transform_move',
    'action_transform_rotate',
    'action_transform_reflect',
    'action_transform_scale',
    'action_reset_bounding_box',
  ]) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('disabled', n < 1);
  }
}

export function mountObjectTransform(editor) {
  const sc = editor?.svgCanvas;
  if (!sc) return null;
  if (window.__visterasObjectTransform) return window.__visterasObjectTransform;

  injectTransformMenu();

  const on = (id, fn) => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if (e.currentTarget.classList.contains('disabled')) return;
      fn();
      syncTransformMenu(sc);
    });
  };

  on('action_transform_again', () => transformAgain(sc));
  on('action_transform_move', () => openMoveDialog(sc));
  on('action_transform_rotate', () => openRotateDialog(sc));
  on('action_transform_reflect', () => openReflectDialog(sc));
  on('action_transform_scale', () => openScaleDialog(sc));
  on('action_reset_bounding_box', () => {
    resetBoundingBox(sc);
    syncTransformMenu(sc);
  });

  // Record Flip H/V from existing menu as last transform (so ⌘D works after flip)
  document.getElementById('action_flip_h')?.addEventListener('click', () => {
    setLastTransform({ kind: 'flipH', copy: false });
    syncTransformMenu(sc);
  });
  document.getElementById('action_flip_v')?.addEventListener('click', () => {
    setLastTransform({ kind: 'flipV', copy: false });
    syncTransformMenu(sc);
  });

  // Keyboard: ⌘D Transform Again; ⇧⌘M Move…
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    if (document.getElementById(DIALOG_HOST)?.querySelector('.vtx-overlay')) return;
    if (window.__visterasIsTypingDirectly) return;

    // Transform Again: Meta+D (no shift)
    if (!e.shiftKey && !e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      transformAgain(sc);
      syncTransformMenu(sc);
      return;
    }
    // Move…: Shift+Meta+M
    if (e.shiftKey && !e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openMoveDialog(sc);
      syncTransformMenu(sc);
    }
  }, true);

  const origCall = sc.call;
  sc.call = function (event, ...args) {
    const result = origCall.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') syncTransformMenu(sc);
    return result;
  };

  syncTransformMenu(sc);

  const api = {
    transformAgain: () => transformAgain(sc),
    openMoveDialog: () => openMoveDialog(sc),
    openRotateDialog: () => openRotateDialog(sc),
    openReflectDialog: () => openReflectDialog(sc),
    openScaleDialog: () => openScaleDialog(sc),
    resetBoundingBox: () => resetBoundingBox(sc),
    applyTransformRecord: (rec, opts) => applyTransformRecord(sc, rec, opts),
    getLastTransform,
    setLastTransform,
    selectionBounds: (els) => selectionBounds(sc, els),
    selectionCenter: (els) => selectionCenter(sc, els),
    matrixForTransform,
    moveDeltaFromFields,
    scaleFactorsFromFields,
    syncMenu: () => syncTransformMenu(sc),
  };
  window.__visterasObjectTransform = api;
  return api;
}

export default mountObjectTransform;
