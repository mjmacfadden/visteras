/**
 * Visteras Vector — Shape Builder Tool (Shift+M)
 *
 * Illustrator-style Shape Builder for the current selection of overlapping
 * closed shapes.
 *
 *  • Select 1+ closed shapes (rect / circle / ellipse / polygon / path), then
 *    press Shift+M or click the toolbar button. Selection is kept.
 *  • Hover: the atomic region under the cursor is highlighted.
 *  • Click or drag across regions: MERGE them into one path filled with the
 *    current fill colour.
 *  • Alt/Option-click or Alt-drag: DELETE the region(s).
 *  • Regions you don't touch are kept (grouped back by the topmost shape that
 *    painted them, split into separate objects where they're disconnected),
 *    exactly like Illustrator.
 *  • Every gesture is ONE undo step (BatchCommand). The tool stays active and
 *    the resulting pieces stay selected, so you can keep building.
 *  • Escape returns to the Selection tool.
 *
 * Geometry
 * ────────
 * All geometry lives in "document space" (#svgcontent user units). Each source
 * element is imported into Paper.js with its full CTM baked in (own transform
 * plus any ancestor transforms), so moved / rotated / scaled shapes work.
 * Regions are computed by iterative intersect/subtract partitioning, then
 * split into connected islands. Hit-testing uses Paper's contains() on the
 * document-space point under the mouse; the overlay is drawn in
 * selectorParentGroup with a doc→overlay matrix so it tracks zoom/pan.
 *
 * Exports (pure helpers are unit-tested in tests/shape-builder.test.mjs)
 */
import { normalizeEditablePath } from './visteras-path-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MODE = 'shape_builder';
const OVERLAY_ID = 'visteras-shape-builder-overlay';
// Cursor: the Selection tool's arrow (same geometry and hotspot as the
// #workarea cursor in css/visteras-theme.css) with a '+' badge (merge) that
// switches live to '−' while Alt/Option is held (delete).
export const CURSOR_HOTSPOT = [4, 4];
export const CURSOR_PLUS = './images/cursors/shape_builder_plus_cursor.svg';
export const CURSOR_MINUS = './images/cursors/shape_builder_minus_cursor.svg';
export const ALT_CLASS = 'visteras-shape-builder-alt';
const MIN_AREA = 0.25;

const HOVER_FILL = 'rgba(72,145,255,0.30)';
const HOVER_STROKE = 'rgba(72,145,255,0.95)';
const DELETE_FILL = 'rgba(255,70,70,0.30)';
const DELETE_STROKE = 'rgba(255,70,70,0.95)';
const OUTLINE_STROKE = 'rgba(72,145,255,0.85)';

const SOURCE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon']);

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Attributes never copied from a source onto a generated path. */
const SKIP_ATTRS = new Set([
  'id', 'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
  'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'clip-path', 'mask',
  'data-visteras-stroke-align', 'data-visteras-stroke-weight',
  'data-visteras-stroke-paint', 'data-visteras-stroke-align-helper',
  'data-visteras-helper-for',
]);

export function shouldCopyAttr(name) {
  if (!name) return false;
  if (SKIP_ATTRS.has(name)) return false;
  if (name.startsWith('data-visteras-sa-')) return false;
  return true;
}

export function isStrokeAlignWrap(el) {
  return !!el?.getAttribute?.('data-visteras-sa-wrap');
}

export function isStrokeAlignHelper(el) {
  return !!el?.getAttribute?.('data-visteras-stroke-align-helper');
}

/** Map a selected element (maybe a stroke-align wrap) to its geometry body. */
export function resolveSourceBody(el) {
  if (!el) return null;
  if (isStrokeAlignHelper(el)) return null;
  if (isStrokeAlignWrap(el)) {
    const kids = [...(el.children || [])];
    return kids.find((c) => c.getAttribute?.('data-visteras-sa-body'))
      || kids.find((c) => !isStrokeAlignHelper(c) && SOURCE_TAGS.has(tagOf(c)))
      || null;
  }
  return el;
}

function tagOf(el) {
  return String(el?.localName || el?.nodeName || '').toLowerCase();
}

export function isShapeBuilderSource(el) {
  if (!el || isStrokeAlignHelper(el)) return false;
  return SOURCE_TAGS.has(tagOf(el));
}

/**
 * Flatten a selection into shape-builder sources.
 * @returns {{node: Element, body: Element}[]} node = element removed on apply,
 *   body = element whose geometry/style is used.
 */
export function collectSources(selected) {
  const out = [];
  const seen = new Set();
  const visit = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    if (isStrokeAlignWrap(el)) {
      const body = resolveSourceBody(el);
      if (body && isShapeBuilderSource(body)) out.push({ node: el, body });
      return;
    }
    if (tagOf(el) === 'g') {
      for (const c of [...el.children]) visit(c);
      return;
    }
    if (isShapeBuilderSource(el)) out.push({ node: el, body: el });
  };
  for (const el of selected || []) visit(el);
  return out;
}

export function matrixToString(m) {
  const f = (v) => (Math.abs(v) < 1e-12 ? 0 : +v.toFixed(10));
  return `matrix(${f(m.a)} ${f(m.b)} ${f(m.c)} ${f(m.d)} ${f(m.e)} ${f(m.f)})`;
}

export function absArea(item) {
  const a = item?.area;
  return typeof a === 'number' && Number.isFinite(a) ? Math.abs(a) : 0;
}

/**
 * Split a Paper PathItem into connected islands (outer contour + its holes).
 * Depth parity decides outer vs hole, so islands inside holes survive.
 */
export function splitIslands(scope, item) {
  if (!item) return [];
  const children = item.children && item.className === 'CompoundPath' ? [...item.children] : null;
  if (!children || children.length <= 1) return [item];
  const probe = (c) => c.interiorPoint || c.bounds.center;
  const info = children.map((c) => {
    const p = probe(c);
    const containers = children.filter((o) => o !== c && o.contains(p));
    return { c, depth: containers.length, containers };
  });
  const outers = info.filter((i) => i.depth % 2 === 0);
  const islands = outers.map((o) => ({ outer: o.c, holes: [] }));
  for (const h of info.filter((i) => i.depth % 2 === 1)) {
    // parent = the smallest even-depth container
    const candidates = islands.filter((isl) => h.containers.includes(isl.outer));
    candidates.sort((a, b) => absArea(a.outer) - absArea(b.outer));
    if (candidates[0]) candidates[0].holes.push(h.c);
  }
  return islands.map((isl) => {
    if (!isl.holes.length) return isl.outer.clone({ insert: false });
    return new scope.CompoundPath({
      children: [isl.outer.clone({ insert: false }), ...isl.holes.map((h) => h.clone({ insert: false }))],
      insert: false,
    });
  });
}

/**
 * Partition closed shapes into atomic regions.
 * @param {object} scope Paper scope
 * @param {{path: object, index: number}[]} items — z-order ascending
 * @returns {{item: object, members: number[], top: number}[]}
 */
export function partitionRegions(scope, items) {
  let regions = [];
  const opts = { insert: false };
  for (const { path, index } of items) {
    if (!path || absArea(path) < MIN_AREA) continue;
    const next = [];
    let remainder = path.clone(opts);
    for (const r of regions) {
      const inter = r.item.intersect(path, opts);
      const diff = r.item.subtract(path, opts);
      if (absArea(inter) >= MIN_AREA) next.push({ item: inter, members: [...r.members, index] });
      if (absArea(diff) >= MIN_AREA) next.push({ item: diff, members: r.members });
      remainder = remainder.subtract(r.item, opts);
    }
    if (absArea(remainder) >= MIN_AREA) next.push({ item: remainder, members: [index] });
    regions = next;
  }
  const out = [];
  for (const r of regions) {
    for (const island of splitIslands(scope, r.item)) {
      if (absArea(island) < MIN_AREA) continue;
      out.push({ item: island, members: r.members, top: Math.max(...r.members) });
    }
  }
  return out;
}

/**
 * Decide what the gesture produces.
 * @param {{top:number}[]} regions
 * @param {number[]} painted region indices
 * @param {'merge'|'delete'} kind
 * @returns {{merged: number[]|null, keptBySource: Map<number, number[]>}}
 */
export function planOperation(regions, painted, kind) {
  const paintedSet = new Set(painted);
  const keptBySource = new Map();
  regions.forEach((r, i) => {
    if (paintedSet.has(i)) return;
    if (!keptBySource.has(r.top)) keptBySource.set(r.top, []);
    keptBySource.get(r.top).push(i);
  });
  const merged = kind === 'merge' && paintedSet.size ? [...paintedSet].sort((a, b) => a - b) : null;
  return { merged, keptBySource };
}

/** Points along a segment, so fast drags don't skip regions. */
export function sampleSegment(a, b, step = 2) {
  if (!a) return [b];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return pts;
}

/** Remove zero-area / sliver sub-paths left behind by boolean ops. */
export function cleanItem(item, minArea = MIN_AREA) {
  if (!item?.children || item.className !== 'CompoundPath') return item;
  for (const c of [...item.children]) {
    if (absArea(c) < minArea) c.remove();
  }
  return item;
}

/**
 * Visible part of source `top` (its outline minus every source stacked above
 * it) minus the painted regions it owns.
 */
export function keptGeometry(scope, sources, regions, top, painted) {
  const opts = { insert: false };
  const base = sources[top]?.path;
  if (!base) return null;
  let visible = base.clone(opts);
  for (let j = top + 1; j < sources.length; j++) {
    const above = sources[j]?.path;
    if (above && visible.bounds.intersects(above.bounds)) visible = visible.subtract(above, opts);
  }
  for (const i of painted) {
    const r = regions[i];
    if (r && r.top === top) visible = visible.subtract(r.item, opts);
  }
  return absArea(visible) >= MIN_AREA ? visible : null;
}

// ─── Paper import / export ───────────────────────────────────────────────────

function toPathItem(scope, item) {
  if (!item) return null;
  if (item instanceof scope.Shape) return item.toPath(false);
  if (item instanceof scope.CompoundPath) {
    item.children.forEach((c) => { c.closed = true; });
    return item;
  }
  if (item instanceof scope.Path) {
    item.closed = true;
    return item;
  }
  if (item.children) {
    let combined = null;
    for (const child of [...item.children]) {
      const p = toPathItem(scope, child);
      if (p) combined = combined ? combined.unite(p, { insert: false }) : p;
    }
    return combined;
  }
  return null;
}

/** Import an element with the given document-space matrix baked in. */
export function importBaked(scope, el, m) {
  const clone = el.cloneNode(false);
  clone.removeAttribute('transform');
  clone.removeAttribute('clip-path');
  clone.removeAttribute('mask');
  clone.removeAttribute('style');
  let item;
  try {
    item = scope.project.importSVG(clone, { insert: false, expandShapes: true, applyMatrix: true });
  } catch (err) {
    console.warn('[Shape Builder] import failed', el, err);
    return null;
  }
  const path = toPathItem(scope, item);
  if (!path) return null;
  if (m) path.transform(new scope.Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
  return path;
}

function exportD(item) {
  const exp = item.exportSVG({ asString: false, precision: 4 });
  if (!exp) return { d: '', fillRule: null };
  if (tagOf(exp) === 'path') return { d: exp.getAttribute('d') || '', fillRule: exp.getAttribute('fill-rule') };
  const parts = [];
  let fillRule = null;
  exp.querySelectorAll?.('path').forEach((p) => {
    const d = p.getAttribute('d');
    if (d) parts.push(d);
    fillRule = fillRule || p.getAttribute('fill-rule');
  });
  return { d: parts.join(' '), fillRule };
}

// ─── Tool ────────────────────────────────────────────────────────────────────

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('visteras_shape_builder_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_shape_builder_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'padding:6px 12px', 'background:#1e1e1e', 'color:#fa7c1b',
      'border:1px solid #fa7c1b', 'border-radius:4px', 'font-size:11px',
      'font-weight:600', 'box-shadow:0 4px 16px rgba(0,0,0,0.5)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 1600);
}

export function mountShapeBuilderTool(editor) {
  const sc = editor.svgCanvas;
  if (!sc || window.__visterasShapeBuilderMounted) return;
  window.__visterasShapeBuilderMounted = true;

  injectCursorStyle();
  injectToolbarButton(editor);

  let scope = null;
  let cache = null; // { key, sources, regions }
  let overlay = null; // { root, xform, outlines, hover, painted, trail }
  let hoverIdx = -1;
  let altDown = false;
  let paint = null; // { kind, indices:Set, points:[], last }
  let lastClient = null;

  // Live '+' / '−' cursor badge. Toggled on Alt keydown/keyup, on every
  // mousemove from e.altKey, and reset on blur / leaving the tool.
  function setAltCursor(on) {
    document.body?.classList.toggle(ALT_CLASS, !!on && sc.getMode() === MODE);
  }

  const content = () => sc.getSvgContent?.() || document.getElementById('svgcontent');
  const asMatrix = (m) => new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
  const docMatrix = (el) => asMatrix(content().getScreenCTM()).inverse().multiply(asMatrix(el.getScreenCTM()));
  const clientToDoc = (x, y) => new DOMPoint(x, y).matrixTransform(asMatrix(content().getScreenCTM()).inverse());

  function getScope() {
    if (!window.paper) return null;
    if (!scope) {
      scope = new window.paper.PaperScope();
      scope.setup(document.createElement('canvas'));
    }
    scope.activate();
    return scope;
  }

  function selectionKey(sources) {
    return sources.map(({ node, body }) => {
      let m = '';
      try { m = matrixToString(docMatrix(body)); } catch { /* detached */ }
      return `${node.id}|${body.outerHTML.length}|${body.getAttribute('d') || ''}|${[...body.attributes].map((a) => a.value).join(',')}|${m}`;
    }).join('#');
  }

  function currentSources() {
    const sel = (sc.getSelectedElements?.() || []).filter((el) => el?.isConnected);
    const sources = collectSources(sel);
    // z-order ascending (document order)
    sources.sort((a, b) => (a.body.compareDocumentPosition(b.body) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return sources;
  }

  function ensureRegions() {
    const sources = currentSources();
    if (!sources.length) { cache = null; return null; }
    const key = selectionKey(sources);
    if (cache && cache.key === key) return cache;
    const s = getScope();
    if (!s) return null;
    s.project.clear();
    const items = [];
    sources.forEach((src, index) => {
      const path = importBaked(s, src.body, docMatrix(src.body));
      if (path) {
        src.path = path;
        items.push({ path, index });
      }
    });
    let regions = [];
    try {
      regions = partitionRegions(s, items);
    } catch (err) {
      console.error('[Shape Builder] region computation failed:', err);
    }
    cache = { key, sources, regions };
    hoverIdx = -1;
    buildOverlay();
    return cache;
  }

  function invalidate() {
    cache = null;
    hoverIdx = -1;
  }

  // ── Overlay ──────────────────────────────────────────────────────────────
  function mk(name, attrs, parent) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent?.appendChild(el);
    return el;
  }

  function ensureOverlayRoot() {
    const parent = sc.selectorManager?.selectorParentGroup;
    if (!parent) return null;
    if (overlay?.root?.isConnected && overlay.root.parentNode === parent) return overlay;
    overlay?.root?.remove();
    const root = mk('g', { id: OVERLAY_ID, 'pointer-events': 'none' }, parent);
    const xform = mk('g', {}, root);
    overlay = {
      root,
      xform,
      outlines: mk('g', { fill: 'none', stroke: OUTLINE_STROKE, 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' }, xform),
      painted: mk('g', {}, xform),
      hover: mk('path', { d: '', 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke', display: 'none' }, xform),
      trail: mk('polyline', { points: '', fill: 'none', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', display: 'none' }, xform),
    };
    return overlay;
  }

  function syncOverlayTransform() {
    const ov = ensureOverlayRoot();
    if (!ov) return null;
    const m = asMatrix(ov.root.getScreenCTM()).inverse().multiply(asMatrix(content().getScreenCTM()));
    ov.xform.setAttribute('transform', matrixToString(m));
    return ov;
  }

  function buildOverlay() {
    const ov = ensureOverlayRoot();
    if (!ov) return;
    ov.outlines.replaceChildren();
    ov.painted.replaceChildren();
    if (!cache) return;
    for (const src of cache.sources) {
      if (!src.path) continue;
      mk('path', { d: src.path.pathData }, ov.outlines);
    }
    render();
  }

  function clearOverlay() {
    overlay?.root?.remove();
    overlay = null;
  }

  function render() {
    if (sc.getMode() !== MODE) return;
    const ov = syncOverlayTransform();
    if (!ov || !cache) return;
    const del = paint ? paint.kind === 'delete' : altDown;
    const fill = del ? DELETE_FILL : HOVER_FILL;
    const stroke = del ? DELETE_STROKE : HOVER_STROKE;
    // painted regions
    ov.painted.replaceChildren();
    if (paint) {
      for (const i of paint.indices) {
        const r = cache.regions[i];
        if (r) mk('path', { d: r.item.pathData, fill, stroke, 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke' }, ov.painted);
      }
      ov.trail.setAttribute('points', paint.points.map((p) => `${p.x},${p.y}`).join(' '));
      ov.trail.setAttribute('stroke', stroke);
      ov.trail.setAttribute('display', paint.points.length > 1 ? 'inline' : 'none');
    } else {
      ov.trail.setAttribute('display', 'none');
    }
    const r = cache.regions[hoverIdx];
    if (r && !(paint && paint.indices.has(hoverIdx))) {
      ov.hover.setAttribute('d', r.item.pathData);
      ov.hover.setAttribute('fill', fill);
      ov.hover.setAttribute('stroke', stroke);
      ov.hover.setAttribute('display', 'inline');
    } else {
      ov.hover.setAttribute('display', 'none');
    }
  }

  function regionAt(docPt) {
    if (!cache || !scope) return -1;
    const p = new scope.Point(docPt.x, docPt.y);
    return cache.regions.findIndex((r) => r.item.contains(p));
  }

  // ── Apply ────────────────────────────────────────────────────────────────
  function currentFill() {
    const f = sc.getColor?.('fill');
    return f == null || f === '' ? null : String(f);
  }

  function makePath(item, styleEl, parentInv) {
    const s = getScope();
    const it = item.clone({ insert: false });
    if (parentInv) it.transform(new s.Matrix(parentInv.a, parentInv.b, parentInv.c, parentInv.d, parentInv.e, parentInv.f));
    const { d, fillRule } = exportD(it);
    if (!d.trim()) return null;
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('id', sc.getNextId());
    el.setAttribute('d', d);
    try { normalizeEditablePath(el, (p) => sc.pathActions?.convertPath?.(p)); } catch { /* keep raw d */ }
    for (const a of [...styleEl.attributes]) {
      if (!shouldCopyAttr(a.name)) continue;
      try { el.setAttributeNS(a.namespaceURI, a.name, a.value); } catch { /* ignore */ }
    }
    const weight = styleEl.getAttribute('data-visteras-stroke-weight');
    if (weight != null && weight !== '') el.setAttribute('stroke-width', weight);
    // Inside/Outside aligned bodies render with stroke="none" (a helper draws
    // the ring); carry the real paint over so results keep their stroke.
    const align = (styleEl.getAttribute('data-visteras-stroke-align') || '').toLowerCase();
    const paint = styleEl.getAttribute('data-visteras-stroke-paint');
    if ((align === 'inside' || align === 'outside') && paint) el.setAttribute('stroke', paint);
    if (fillRule) el.setAttribute('fill-rule', fillRule);
    return el;
  }

  function applyGesture(kind, painted) {
    const c = cache;
    if (!c || !painted.length) return;
    const s = getScope();
    const { sources, regions } = c;
    const plan = planOperation(regions, painted, kind);
    const outputs = []; // { item, source, z, fill }
    if (plan.merged) {
      let merged = null;
      for (const i of plan.merged) {
        merged = merged ? merged.unite(regions[i].item, { insert: false }) : regions[i].item.clone({ insert: false });
      }
      const styleIdx = regions[painted[0]].top;
      const z = Math.max(...plan.merged.map((i) => regions[i].top));
      if (merged) cleanItem(merged);
      if (merged && absArea(merged) >= MIN_AREA) outputs.push({ item: merged, source: sources[styleIdx], z, fill: currentFill(), merged: true });
    }
    // Kept geometry is rebuilt from the clean source outlines rather than by
    // uniting adjacent regions (Paper's unite of edge-sharing fragments can
    // leave spikes/slivers): kept_i = visible_i − painted regions topped by i.
    for (const top of plan.keptBySource.keys()) {
      const u = keptGeometry(s, sources, regions, top, painted);
      if (!u) continue;
      for (const island of splitIslands(s, cleanItem(u))) {
        if (absArea(island) >= MIN_AREA) outputs.push({ item: island, source: sources[top], z: top });
      }
    }
    outputs.sort((a, b) => a.z - b.z);

    const topNode = sources[sources.length - 1].node;
    const parent = topNode.parentNode;
    const ref = topNode.nextSibling;
    let parentInv = null;
    try {
      parentInv = parent === content() ? null : docMatrix(parent).inverse();
    } catch { parentInv = null; }

    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
    const created = [];
    const removedNodes = sources.map((src) => src.node);
    // Restore a useful selection on undo/redo (Illustrator re-selects the
    // originals on undo) so the user can keep working in the tool.
    // Deferred: SVG-Edit's clickUndo/clickRedo call populateLayers() after
    // the command, which clears the selection.
    const reselect = (els) => setTimeout(() => {
      const live = els.filter((el) => el?.isConnected);
      invalidate();
      try {
        sc.clearSelection();
        if (live.length) sc.addToSelection(live, false);
        window.__updatePropertiesVisibility?.();
      } catch { /* ignore */ }
      refreshIfActive();
    }, 0);
    class ShapeBuilderCommand extends BatchCommand {
      unapply(handler) { super.unapply(handler); reselect(removedNodes); }
      apply(handler) { super.apply(handler); reselect(created); }
    }
    const batch = new ShapeBuilderCommand(kind === 'delete' ? 'Shape Builder Delete' : 'Shape Builder Merge');
    for (const out of outputs) {
      const el = makePath(out.item, out.source.body, parentInv);
      if (!el) continue;
      if (out.merged && out.fill) el.setAttribute('fill', out.fill);
      parent.insertBefore(el, ref);
      batch.addSubCommand(new InsertElementCommand(el));
      created.push(el);
    }
    for (const src of sources) {
      const n = src.node;
      if (!n.parentNode) continue;
      batch.addSubCommand(new RemoveElementCommand(n, n.nextSibling, n.parentNode));
      n.remove();
    }
    sc.undoMgr.addCommandToHistory(batch);
    invalidate();
    sc.clearSelection();
    if (created.length) {
      sc.addToSelection(created, false);
      sc.call('changed', created);
    }
    window.__updatePropertiesVisibility?.();
    ensureRegions();
    render();
  }

  // ── Events ───────────────────────────────────────────────────────────────
  function inCanvas(e) {
    const t = e.target;
    const canvasEl = document.getElementById('svgcanvas');
    if (!canvasEl || !(t instanceof Node) || !canvasEl.contains(t)) return false;
    if (t.closest?.('#sidepanels, #tools_left, #tools_top, #rulers, .ruler, #properties_panel, #vdock, #vdock_flyout')) return false;
    return true;
  }

  function onMove(e) {
    if (sc.getMode() !== MODE) return;
    lastClient = { x: e.clientX, y: e.clientY };
    altDown = e.altKey;
    setAltCursor(e.altKey);
    if (!paint && !inCanvas(e)) {
      if (hoverIdx !== -1) { hoverIdx = -1; render(); }
      return;
    }
    if (!ensureRegions()) return;
    const p = clientToDoc(e.clientX, e.clientY);
    hoverIdx = regionAt(p);
    if (paint) {
      e.preventDefault();
      e.stopImmediatePropagation();
      for (const q of sampleSegment(paint.last, p, 2 / (sc.getZoom?.() || 1))) {
        const i = regionAt(q);
        if (i >= 0) paint.indices.add(i);
      }
      paint.last = p;
      paint.points.push(p);
    }
    render();
  }

  function onDown(e) {
    if (sc.getMode() !== MODE || e.button !== 0 || !inCanvas(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const c = ensureRegions();
    if (!c || !c.regions.length) {
      toast('Shape Builder: select overlapping closed shapes first');
      return;
    }
    const p = clientToDoc(e.clientX, e.clientY);
    paint = { kind: e.altKey ? 'delete' : 'merge', indices: new Set(), points: [p], last: p };
    const i = regionAt(p);
    if (i >= 0) paint.indices.add(i);
    hoverIdx = i;
    render();
  }

  function onUp(e) {
    if (!paint) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const g = paint;
    paint = null;
    const indices = [...g.indices];
    if (!indices.length) { render(); return; }
    try {
      applyGesture(g.kind, indices);
    } catch (err) {
      console.error('[Shape Builder] operation failed:', err);
      invalidate();
      render();
    }
  }

  function swallow(e) {
    if (sc.getMode() === MODE && (paint || (e.type !== 'click' && inCanvas(e)))) {
      if (e.type === 'dblclick' || e.type === 'click') { e.stopImmediatePropagation(); e.preventDefault(); }
    }
  }

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mousedown', onDown, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('dblclick', swallow, true);

  const onKey = (e) => {
    if (sc.getMode() !== MODE) return;
    if (e.key === 'Alt') setAltCursor(e.type === 'keydown');
    if (e.key === 'Alt' && altDown !== (e.type === 'keydown')) {
      altDown = e.type === 'keydown';
      render();
    }
    if (e.type === 'keydown' && e.key === 'Escape') {
      if (paint) { paint = null; render(); return; }
      editor.leftPanel?.clickSelect?.();
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', () => {
    setAltCursor(false);
    if (altDown) { altDown = false; render(); }
  });

  // Scroll changes: re-sync the overlay transform (zoom re-syncs on the next
  // mousemove; sc.bind would clobber another module's single bind slot).
  document.getElementById('workarea')?.addEventListener('scroll', () => render(), { passive: true });

  document.addEventListener('modeChange', () => {
    const btn = document.getElementById('tool_shape_builder');
    if (sc.getMode() === MODE) {
      btn?.setAttribute('pressed', 'true');
      invalidate();
      const c = ensureRegions();
      if (!c) toast('Shape Builder: select overlapping closed shapes');
      render();
    } else {
      btn?.removeAttribute('pressed');
      setAltCursor(false);
      altDown = false;
      paint = null;
      invalidate();
      clearOverlay();
    }
  });

  // Undo/redo or other edits while in the tool: rebuild on next hover, and
  // redraw outlines now.
  const refreshIfActive = () => {
    if (sc.getMode() !== MODE || paint) return;
    requestAnimationFrame(() => {
      if (sc.getMode() !== MODE) return;
      const c = ensureRegions();
      if (!c) { clearOverlay(); return; }
      if (lastClient) hoverIdx = regionAt(clientToDoc(lastClient.x, lastClient.y));
      render();
    });
  };
  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('#tool_undo, #tool_redo, #action_undo, #action_redo')) refreshIfActive();
  }, true);
  window.addEventListener('keyup', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') refreshIfActive(); }, true);

  // Test/diagnostic hook (used by the browser smoke script).
  window.__visterasShapeBuilder = {
    regions: () => (ensureRegions()?.regions || []).map((r) => ({ top: r.top, members: r.members, area: absArea(r.item), d: r.item.pathData })),
    regionAtClient: (x, y) => (ensureRegions() ? regionAt(clientToDoc(x, y)) : -1),
    docToClient: (x, y) => new DOMPoint(x, y).matrixTransform(asMatrix(content().getScreenCTM())),
    hoverIndex: () => hoverIdx,
  };
}

function injectCursorStyle() {
  if (document.getElementById('visteras-shape-builder-cursor-style')) return;
  const style = document.createElement('style');
  style.id = 'visteras-shape-builder-cursor-style';
  style.textContent = `
    body[data-mode="${MODE}"] #svgcanvas,
    body[data-mode="${MODE}"] #svgcanvas * {
      cursor: url("${CURSOR_PLUS}") ${CURSOR_HOTSPOT.join(' ')}, auto !important;
    }
    body.${ALT_CLASS}[data-mode="${MODE}"] #svgcanvas,
    body.${ALT_CLASS}[data-mode="${MODE}"] #svgcanvas * {
      cursor: url("${CURSOR_MINUS}") ${CURSOR_HOTSPOT.join(' ')}, auto !important;
    }
  `;
  document.head.appendChild(style);
}

function injectToolbarButton(editor) {
  if (document.getElementById('tool_shape_builder')) return;
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return;
  const btn = document.createElement('se-button');
  btn.id = 'tool_shape_builder';
  btn.setAttribute('title', 'Shape Builder Tool (Shift+M)');
  btn.setAttribute('src', 'shape_builder.svg');
  btn.addEventListener('click', () => {
    if (editor.leftPanel?.updateLeftPanel?.('tool_shape_builder') === false) return;
    editor.svgCanvas.setMode(MODE);
  });
  const eraserBtn = document.getElementById('tool_eraser');
  if (eraserBtn?.parentNode) {
    eraserBtn.parentNode.insertBefore(btn, eraserBtn.nextSibling);
  } else {
    toolsLeft.appendChild(btn);
  }
}

export default mountShapeBuilderTool;
