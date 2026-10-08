/**
 * Visteras Vector — Object ▸ Path ▸ Join (⌘J) and Simplify…
 *
 * Join: closes an open path, or merges two open endpoints (same path or two paths).
 * Simplify…: curve-precision slider, live Preview, original vs current point count.
 */
import { contours, anchors, readSegments, serializeSegments } from './visteras-anchor-model.js';
import { formatShortcut, detectMac } from './visteras-shortcut-label.js';
import { convertFromPixels, convertToPixels } from './visteras-document-presets.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const JOIN_TOL = 1.5; // px — endpoints closer than this are treated as coincident

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Endpoints of open contours: { contourIndex, end: 'start'|'end', index, x, y }. */
export function openEndpoints(segments) {
  const out = [];
  contours(segments).forEach((c, ci) => {
    if (c.closed || !c.indices.length) return;
    const first = c.indices[0], last = c.indices.at(-1);
    const a = segments[first], b = segments[last];
    out.push({ contourIndex: ci, end: 'start', index: first, x: a.x, y: a.y });
    out.push({ contourIndex: ci, end: 'end', index: last, x: b.x, y: b.y });
  });
  return out;
}

/** Close every open contour on a segment list (append Z). */
export function closeOpenContours(segments) {
  const result = segments.map((s) => ({ ...s }));
  // Walk reverse so inserts don't shift later indices wrongly — we append Z after each open contour's last point.
  const cs = contours(result);
  // Rebuild: for each contour, copy segs and add Z if open.
  const out = [];
  for (const c of cs) {
    for (const i of c.indices) out.push({ ...result[i] });
    if (c.closing != null) out.push({ ...result[c.closing] });
    if (!c.closed) out.push({ type: 1 }); // Z
  }
  return out.length ? out : result;
}

/**
 * Join two open endpoints on the same path (close that contour) or stitch two
 * open paths into one. Returns new segments for pathA, and optionally marks
 * pathB for removal when two elements were joined.
 */
export function joinEndpoints(segA, epA, segB, epB) {
  // Same path: close the contour(s) that contain the endpoints.
  if (segA === segB || (epA && epB && segB == null)) {
    return { segments: closeOpenContours(segA), removeB: false };
  }
  // Two paths: reverse/order so we append B onto A's end.
  let a = segA.map((s) => ({ ...s }));
  let b = segB.map((s) => ({ ...s }));
  const endsA = openEndpoints(a);
  const endsB = openEndpoints(b);
  if (!endsA.length || !endsB.length) return null;

  // Prefer the supplied endpoints; else closest pair.
  let ea = epA || endsA[0], eb = epB || endsB[0];
  if (!epA || !epB) {
    let best = Infinity;
    for (const x of endsA) for (const y of endsB) {
      const d = Math.hypot(x.x - y.x, x.y - y.y);
      if (d < best) { best = d; ea = x; eb = y; }
    }
  }

  // Orient A so we join at its end; B so we join at its start.
  if (ea.end === 'start') a = reverseOpenPath(a);
  if (eb.end === 'end') b = reverseOpenPath(b);

  // Drop B's initial M; append remaining onto A. Snap B's first point to A's end.
  const aLast = a.filter((s) => s.type !== 1).at(-1);
  const bRest = b.slice(1).map((s, i) => {
    if (i === 0 && aLast && (s.type === 4 || s.type === 6 || s.type === 8)) {
      // Keep control handles relative; endpoint already at join after snap of first M which we dropped.
      return { ...s };
    }
    return { ...s };
  });
  // If endpoints weren't coincident, insert a line to B's former start.
  const bStart = openEndpoints(segB).find((e) => e.end === 'start') || openEndpoints(b.length ? [{ type: 2, x: b[0]?.x, y: b[0]?.y }, ...b.slice(1)] : [])[0];
  // Simpler: concatenate A + (B without leading M), after optionally moving B's first point.
  const cleanedB = [];
  for (let i = 0; i < b.length; i++) {
    const s = b[i];
    if (i === 0 && s.type === 2) {
      if (aLast && (Math.hypot(s.x - aLast.x, s.y - aLast.y) > JOIN_TOL)) {
        cleanedB.push({ type: 4, x: s.x, y: s.y }); // bridge
      }
      continue;
    }
    cleanedB.push({ ...s });
  }
  return { segments: [...a, ...cleanedB], removeB: true };
}

/** Reverse an open path's segment list (best-effort for M/L/C). */
export function reverseOpenPath(segments) {
  const cs = contours(segments);
  if (cs.length !== 1 || cs[0].closed) return segments.map((s) => ({ ...s }));
  const pts = [];
  for (const i of cs[0].indices) {
    const s = segments[i];
    if (s.type === 2 || s.type === 4) pts.push({ x: s.x, y: s.y, kind: 'L' });
    else if (s.type === 6) pts.push({ x: s.x, y: s.y, kind: 'C', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, prev: pts.at(-1) });
    else pts.push({ x: s.x, y: s.y, kind: 'L' });
  }
  pts.reverse();
  const out = [{ type: 2, x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], prev = pts[i - 1];
    // When reversed, a cubic's controls swap and belong to the segment ending at p.
    if (prev.kind === 'C') {
      out.push({ type: 6, x1: prev.x2, y1: prev.y2, x2: prev.x1, y2: prev.y1, x: p.x, y: p.y });
    } else {
      out.push({ type: 4, x: p.x, y: p.y });
    }
  }
  return out;
}

/** Count editable anchor points. */
export function countPoints(segments) {
  return anchors(segments).length;
}

/** Sample a path into polyline points (for simplify). */
export function samplePathPoints(segments, stepsPerCurve = 8) {
  const pts = [];
  let cx = 0, cy = 0;
  for (const s of segments) {
    if (s.type === 1) continue;
    if (s.type === 2 || s.type === 4) {
      cx = s.x; cy = s.y; pts.push({ x: cx, y: cy });
    } else if (s.type === 6) {
      for (let i = 1; i <= stepsPerCurve; i++) {
        const t = i / stepsPerCurve;
        const x = cubic(cx, s.x1, s.x2, s.x, t);
        const y = cubic(cy, s.y1, s.y2, s.y, t);
        pts.push({ x, y });
      }
      cx = s.x; cy = s.y;
    } else if (s.type === 8) {
      for (let i = 1; i <= stepsPerCurve; i++) {
        const t = i / stepsPerCurve;
        const x = quad(cx, s.x1, s.x, t);
        const y = quad(cy, s.y1, s.y, t);
        pts.push({ x, y });
      }
      cx = s.x; cy = s.y;
    } else {
      cx = s.x; cy = s.y; pts.push({ x: cx, y: cy });
    }
  }
  return pts;
}

const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const quad = (a, b, c, t) => {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
};

/** Ramer–Douglas–Peucker. precision 0–100 → tolerance (higher precision = lower tol). */
export function simplifyPolyline(points, precision = 80) {
  if (points.length < 3) return points.slice();
  const p = Math.max(0, Math.min(100, Number(precision) || 0));
  // At 100 keep almost everything; at 0 collapse aggressively.
  const bbox = points.reduce((b, q) => ({
    minX: Math.min(b.minX, q.x), maxX: Math.max(b.maxX, q.x),
    minY: Math.min(b.minY, q.y), maxY: Math.max(b.maxY, q.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const diag = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) || 1;
  const tol = diag * (0.0005 + (1 - p / 100) * 0.08);
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let maxD = 0, maxK = -1;
    const a = points[i], b = points[j];
    const lab = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
    for (let k = i + 1; k < j; k++) {
      const q = points[k];
      const d = Math.abs((b.y - a.y) * q.x - (b.x - a.x) * q.y + b.x * a.y - b.y * a.x) / lab;
      if (d > maxD) { maxD = d; maxK = k; }
    }
    if (maxD > tol && maxK >= 0) {
      keep[maxK] = true;
      stack.push([i, maxK], [maxK, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function pointsToSegments(points, closed = false) {
  if (!points.length) return [];
  const out = [{ type: 2, x: r3(points[0].x), y: r3(points[0].y) }];
  for (let i = 1; i < points.length; i++) out.push({ type: 4, x: r3(points[i].x), y: r3(points[i].y) });
  if (closed && points.length > 2) out.push({ type: 1 });
  return out;
}

export function simplifyPathSegments(segments, precision = 80) {
  const closed = contours(segments).some((c) => c.closed);
  const sampled = samplePathPoints(segments);
  const simplified = simplifyPolyline(sampled, precision);
  return pointsToSegments(simplified, closed);
}

function pathElements(sc) {
  return (sc.getSelectedElements?.() || []).filter((el) => el && ['path', 'polygon', 'polyline', 'line', 'rect', 'circle', 'ellipse'].includes(el.localName));
}

function toPathEl(sc, el) {
  if (el.localName === 'path') return el;
  try {
    sc.convertToPath?.(el);
  } catch { /* ignore */ }
  return (sc.getSelectedElements?.() || []).find((e) => e?.localName === 'path') || el;
}

function readPathSegs(sc, el) {
  const d = el.localName === 'path' ? el.getAttribute('d') : (sc.getPathDataForElement?.(el) || '');
  const tmp = document.createElementNS(SVG_NS, 'path');
  tmp.setAttribute('d', d || '');
  return readSegments(tmp);
}

/** Object ▸ Path ▸ Join (⌘J). */
export function joinSelectedPaths(sc) {
  const els = pathElements(sc);
  if (!els.length) return false;
  const { BatchCommand, ChangeElementCommand, RemoveElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Join') : null;

  if (els.length === 1) {
    const el = toPathEl(sc, els[0]);
    if (el.localName !== 'path') return false;
    const before = { d: el.getAttribute('d') };
    const segs = readPathSegs(sc, el);
    const ends = openEndpoints(segs);
    if (!ends.length) return false; // already closed
    // If two selected Direct Selection endpoints on this path, prefer closing.
    const next = closeOpenContours(segs);
    el.setAttribute('d', serializeSegments(next));
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
    if (batch) sc.addCommandToHistory?.(batch);
    sc.call?.('changed', [el]);
    return true;
  }

  if (els.length >= 2) {
    const a = toPathEl(sc, els[0]);
    const b = toPathEl(sc, els[1]);
    if (a.localName !== 'path' || b.localName !== 'path') return false;
    const segA = readPathSegs(sc, a);
    const segB = readPathSegs(sc, b);
    if (!openEndpoints(segA).length || !openEndpoints(segB).length) {
      // Fall back: close each open path individually.
      let any = false;
      for (const el of [a, b]) {
        const segs = readPathSegs(sc, el);
        if (!openEndpoints(segs).length) continue;
        const before = { d: el.getAttribute('d') };
        el.setAttribute('d', serializeSegments(closeOpenContours(segs)));
        if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
        any = true;
      }
      if (any && batch) sc.addCommandToHistory?.(batch);
      if (any) sc.call?.('changed', [a, b]);
      return any;
    }
    const joined = joinEndpoints(segA, null, segB, null);
    if (!joined) return false;
    const beforeA = { d: a.getAttribute('d') };
    a.setAttribute('d', serializeSegments(joined.segments));
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(a, beforeA));
    if (joined.removeB) {
      const parent = b.parentNode, next = b.nextSibling;
      b.remove();
      if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(b, next, parent));
    }
    if (batch) sc.addCommandToHistory?.(batch);
    sc.call?.('changed', [a]);
    try { sc.clearSelection(); sc.addToSelection([a], true); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function ensureSimplifyDialog() {
  let dlg = document.getElementById('visteras_simplify_dialog');
  if (dlg) return dlg;
  dlg = document.createElement('div');
  dlg.id = 'visteras_simplify_dialog';
  dlg.className = 'visteras_modal_overlay';
  dlg.hidden = true;
  dlg.innerHTML = `
    <div class="visteras_modal" role="dialog" aria-labelledby="vsimp_title" style="width:340px;">
      <div class="visteras_modal_header">
        <span id="vsimp_title">Simplify</span>
        <button type="button" class="floating_panel_close" id="vsimp_close" aria-label="Close">×</button>
      </div>
      <div class="visteras_modal_body" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
        <label style="display:flex;flex-direction:column;gap:4px;color:#ccc;font-size:12px;">
          Curve Precision
          <input type="range" id="vsimp_precision" min="0" max="100" step="1" value="80" aria-label="Curve Precision">
          <span id="vsimp_precision_val" style="align-self:flex-end;color:#aaa;">80</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;color:#ccc;font-size:12px;">
          <input type="checkbox" id="vsimp_preview" checked> Preview
        </label>
        <div id="vsimp_counts" style="color:#aaa;font-size:12px;">Original: — → Current: —</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
          <button type="button" id="vsimp_cancel" class="vui-btn">Cancel</button>
          <button type="button" id="vsimp_ok" class="vui-btn vui-btn-primary">OK</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  return dlg;
}

/** Apply simplify to selected paths. preview=true writes without history. */
export function applySimplify(sc, precision, { preview = false, originals = null } = {}) {
  const els = pathElements(sc).map((el) => toPathEl(sc, el)).filter((el) => el?.localName === 'path');
  if (!els.length) return { original: 0, current: 0 };
  let original = 0, current = 0;
  const { BatchCommand, ChangeElementCommand } = sc.history || {};
  const batch = (!preview && BatchCommand) ? new BatchCommand('Simplify') : null;
  for (const el of els) {
    const baseD = originals?.get(el) ?? el.getAttribute('d');
    const baseSegs = (() => {
      const t = document.createElementNS(SVG_NS, 'path');
      t.setAttribute('d', baseD || '');
      return readSegments(t);
    })();
    original += countPoints(baseSegs);
    const next = simplifyPathSegments(baseSegs, precision);
    current += countPoints(next);
    const d = serializeSegments(next);
    if (preview) {
      el.setAttribute('d', d);
    } else {
      const before = { d: el.getAttribute('d') };
      el.setAttribute('d', d);
      if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
    }
  }
  if (batch && batch.stack?.length !== 0) {
    // BatchCommand may use different internals; always try add.
    try { sc.addCommandToHistory?.(batch); } catch { /* ignore */ }
  }
  if (!preview) sc.call?.('changed', els);
  return { original, current, els };
}

export function openSimplifyDialog(editor) {
  const sc = editor.svgCanvas;
  const els = pathElements(sc);
  if (!els.length) {
    alert('Select one or more paths to simplify.');
    return;
  }
  // Snapshot originals for cancel / preview restore.
  const paths = els.map((el) => toPathEl(sc, el)).filter((el) => el?.localName === 'path');
  const originals = new Map(paths.map((el) => [el, el.getAttribute('d')]));
  const dlg = ensureSimplifyDialog();
  dlg.hidden = false;
  const slider = dlg.querySelector('#vsimp_precision');
  const valEl = dlg.querySelector('#vsimp_precision_val');
  const preview = dlg.querySelector('#vsimp_preview');
  const counts = dlg.querySelector('#vsimp_counts');
  const restore = () => {
    for (const [el, d] of originals) el.setAttribute('d', d);
    sc.call?.('changed', [...originals.keys()]);
  };
  const update = () => {
    const precision = Number(slider.value);
    valEl.textContent = String(precision);
    if (preview.checked) {
      const r = applySimplify(sc, precision, { preview: true, originals });
      counts.textContent = `Original: ${r.original} → Current: ${r.current}`;
    } else {
      restore();
      let original = 0;
      for (const [, d] of originals) {
        const t = document.createElementNS(SVG_NS, 'path');
        t.setAttribute('d', d || '');
        original += countPoints(readSegments(t));
      }
      counts.textContent = `Original: ${original} → Current: ${original}`;
    }
  };
  slider.oninput = update;
  preview.onchange = update;
  const close = (apply) => {
    if (apply) {
      restore(); // start from originals then commit once
      applySimplify(sc, Number(slider.value), { preview: false, originals });
    } else restore();
    dlg.hidden = true;
  };
  dlg.querySelector('#vsimp_ok').onclick = () => close(true);
  dlg.querySelector('#vsimp_cancel').onclick = () => close(false);
  dlg.querySelector('#vsimp_close').onclick = () => close(false);
  update();
}

export function mountPathOps(editor) {
  if (window.__visterasPathOps) return window.__visterasPathOps;
  const sc = editor.svgCanvas;
  const mac = detectMac();
  const joinLabel = formatShortcut({ meta: true, key: 'J', mac });

  // Object ▸ Path submenu
  const objList = document.querySelector('#menu_object .menu_dropdown_list');
  if (objList && !document.getElementById('menu_object_path')) {
    const item = document.createElement('div');
    item.className = 'menu_dropdown_item menu_has_submenu';
    item.id = 'menu_object_path';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-haspopup', 'true');
    item.innerHTML = `Path<span class="menu_submenu_arrow" aria-hidden="true">▸</span>
      <div class="menu_dropdown_list menu_submenu_list" role="menu">
        <div class="menu_dropdown_item" id="action_path_join" role="menuitem">Join <span class="menu_dropdown_shortcut">${joinLabel}</span></div>
        <div class="menu_dropdown_item" id="action_path_simplify" role="menuitem">Simplify…</div>
      </div>`;
    const offset = document.getElementById('action_offset_path');
    if (offset) offset.before(item);
    else objList.append(item);
  }

  document.getElementById('action_path_join')?.addEventListener('click', () => joinSelectedPaths(sc));
  document.getElementById('action_path_simplify')?.addEventListener('click', () => openSimplifyDialog(editor));

  // ⌘J — browser-safe: page can block this chord; keep as Illustrator has it.
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    if (e.code !== 'KeyJ' && e.key !== 'j' && e.key !== 'J') return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    e.preventDefault();
    e.stopPropagation();
    joinSelectedPaths(sc);
  }, true);

  // Minimal modal CSS if not present
  if (!document.getElementById('visteras_path_ops_css')) {
    const css = document.createElement('style');
    css.id = 'visteras_path_ops_css';
    css.textContent = `
      #visteras_simplify_dialog.visteras_modal_overlay {
        position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.45);
        display:flex;align-items:center;justify-content:center;
      }
      #visteras_simplify_dialog[hidden]{display:none!important}
      #visteras_simplify_dialog .visteras_modal{
        background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#ddd;
        box-shadow:0 12px 40px rgba(0,0,0,.5);
      }
      #visteras_simplify_dialog .visteras_modal_header{
        display:flex;align-items:center;justify-content:space-between;
        padding:8px 12px;border-bottom:1px solid #3a3a3a;font-size:13px;
      }
      #visteras_simplify_dialog .vui-btn{
        background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:4px;
        padding:4px 12px;cursor:pointer;font-size:12px;
      }
      #visteras_simplify_dialog .vui-btn-primary{
        background:var(--studio-orange,#fa7c1b);border-color:transparent;color:#111;font-weight:600;
      }
    `;
    document.head.appendChild(css);
  }

  window.__visterasPathOps = { joinSelectedPaths: () => joinSelectedPaths(sc), openSimplifyDialog: () => openSimplifyDialog(editor) };
  return window.__visterasPathOps;
}

/** Sync path_node_x/y for a single selected Direct Selection anchor (document units). */
export function syncAnchorXYFields(getSelection) {
  const xEl = document.getElementById('path_node_x');
  const yEl = document.getElementById('path_node_y');
  const row = document.getElementById('row_path_node_xy');
  if (!xEl || !yEl) return;
  const sel = getSelection?.() || null; // { x, y } in user px, or null
  const show = !!sel;
  if (row) row.style.display = show ? 'flex' : 'none';
  if (!show) return;
  if (document.activeElement === xEl || document.activeElement === yEl) return;
  const unit = window.__visterasDocumentShell?.getBaseUnit?.() || 'px';
  const toUnit = (v) => unit === 'px' ? r3(v) : r3(convertFromPixels(v, unit));
  xEl.value = toUnit(sel.x);
  yEl.value = toUnit(sel.y);
}

export function readAnchorXYFields() {
  const xEl = document.getElementById('path_node_x');
  const yEl = document.getElementById('path_node_y');
  if (!xEl || !yEl) return null;
  const unit = window.__visterasDocumentShell?.getBaseUnit?.() || 'px';
  const rawX = Number(xEl.value), rawY = Number(yEl.value);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
  const toPx = (v) => unit === 'px' ? v : convertToPixels(v, unit);
  return { x: toPx(rawX), y: toPx(rawY) };
}
