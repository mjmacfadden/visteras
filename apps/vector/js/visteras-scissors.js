/**
 * Visteras Vector — Scissors tool (Illustrator-like).
 * Click a cuttable anchor point to split:
 * - Closed path → opens at the cut (one open path, coincident endpoints).
 * - Open path → becomes two separate path objects.
 * Mid-segment / empty-canvas clicks do nothing.
 */
import { readSegments, serializeSegments, anchors, contours } from './visteras-anchor-model.js';
import { normalizeEditablePath } from './visteras-path-geometry.js';
import { simplifyStraightSegments } from './visteras-pen-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MODE = 'scissors';

function geometry(sc, el) {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', sc.getPathDataForElement(el) || '');
  normalizeEditablePath(p, (path) => sc.pathActions.convertPath(path));
  return simplifyStraightSegments(readSegments(p));
}

function candidates(sc) {
  return [...sc.getSvgContent().querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline')]
    .filter((el) => !el.closest('defs,clipPath,mask')
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).pointerEvents !== 'none');
}

function copyPresentation(fromEl, toEl) {
  const skip = new Set([
    'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
    'x1', 'y1', 'x2', 'y2', 'points', 'id',
  ]);
  for (const a of fromEl.attributes) {
    if (skip.has(a.name)) continue;
    try { toEl.setAttributeNS(a.namespaceURI, a.name, a.value); } catch { /* ignore */ }
  }
}

/** Segment that arrives at `index` (closing seg when index is the contour M). */
function segmentArrivingAt(segments, contour, index) {
  if (contour.closing != null && index === contour.indices[0]) {
    return segments[contour.closing];
  }
  return segments[index];
}

/**
 * Copy the on-path segment for `index`, substituting the closing segment when
 * the original M appears mid-path so Bézier handles into the start are kept.
 */
function copyContourSegment(segments, contour, index) {
  const arriving = segmentArrivingAt(segments, contour, index);
  const seg = { ...arriving };
  const pt = segments[index];
  if (pt?.x !== undefined) {
    seg.x = pt.x;
    seg.y = pt.y;
  }
  if (seg.type === 2) seg.type = 4;
  return seg;
}

/**
 * After ensuring a vertex exists at cutIndex, open a closed contour or split an open one.
 * Returns an array of segment arrays (1 for open-closed, 2 for split-open).
 * Preserves in/out handle geometry on the cut node and neighbors.
 */
function breakContourAt(segments, cutIndex) {
  const cs = contours(segments);
  const target = cs.find((c) => c.indices.includes(cutIndex) || c.closing === cutIndex);
  if (!target) return [segments.map((s) => ({ ...s }))];

  const order = [...target.indices];
  let pos = order.indexOf(cutIndex);
  if (pos < 0 && target.closing === cutIndex) pos = 0;
  if (pos < 0) return [segments.map((s) => ({ ...s }))];

  const cutPt = segments[cutIndex];
  if (cutPt?.x === undefined) return [segments.map((s) => ({ ...s }))];

  // Preserve non-target contours (compound paths) on the first result piece.
  const otherPieces = [];
  for (const c of cs) {
    if (c === target) continue;
    const start = c.indices[0];
    let mIdx = start;
    while (mIdx > 0 && segments[mIdx].type !== 2) mIdx -= 1;
    let end = c.indices.at(-1) + 1;
    if (c.closed && c.closing != null) end = c.closing + 1;
    if (c.closed && segments[end]?.type === 1) end += 1;
    otherPieces.push(segments.slice(mIdx, Math.min(end, segments.length)).map((s) => ({ ...s })));
  }

  const attachOthers = (primary) => {
    if (!otherPieces.length) return [primary];
    return [[...primary, ...otherPieces.flat()]];
  };

  if (target.closed) {
    const rotated = [...order.slice(pos), ...order.slice(0, pos)];
    const open = [{ type: 2, x: cutPt.x, y: cutPt.y }];
    for (let i = 1; i < rotated.length; i++) {
      open.push(copyContourSegment(segments, target, rotated[i]));
    }
    // Final segment returns to the cut point with the same incoming handles.
    open.push(copyContourSegment(segments, target, cutIndex));
    return attachOthers(open);
  }

  const leftOrder = order.slice(0, pos + 1);
  const rightOrder = order.slice(pos);
  const left = [];
  if (leftOrder.length) {
    left.push({ type: 2, x: segments[leftOrder[0]].x, y: segments[leftOrder[0]].y });
    for (let i = 1; i < leftOrder.length; i++) {
      left.push(copyContourSegment(segments, target, leftOrder[i]));
    }
  }
  const right = [];
  if (rightOrder.length) {
    right.push({ type: 2, x: cutPt.x, y: cutPt.y });
    for (let i = 1; i < rightOrder.length; i++) {
      right.push(copyContourSegment(segments, target, rightOrder[i]));
    }
  }

  const parts = [];
  if (left.length >= 2) parts.push(...attachOthers(left));
  else if (otherPieces.length) parts.push(otherPieces.flat());
  if (right.length >= 2) parts.push(right);
  return parts.length ? parts : [segments.map((s) => ({ ...s }))];
}

function nearestAnchorHit(segments, clientX, clientY, transform, tolerance = 7) {
  let best = null;
  for (const a of anchors(segments)) {
    const p = transform(segments[a.index]);
    const distance = Math.hypot(p.x - clientX, p.y - clientY);
    if (distance <= tolerance && (!best || distance < best.distance)) {
      best = { index: a.index, t: 0, distance, atAnchor: true };
    }
  }
  return best;
}

function ensurePathElement(sc, el, command) {
  if (el.localName === 'path') return el;
  const path = document.createElementNS(SVG_NS, 'path');
  copyPresentation(el, path);
  const { RemoveElementCommand, InsertElementCommand } = sc.history;
  command.addSubCommand(new RemoveElementCommand(el, el.nextSibling, el.parentNode));
  el.replaceWith(path);
  command.addSubCommand(new InsertElementCommand(path));
  return path;
}

export function mountScissorsTool(editor) {
  const sc = editor.svgCanvas;
  if (!sc || window.__visterasScissorsMounted) return;
  window.__visterasScissorsMounted = true;

  injectToolbarButton(editor);
  injectCursorStyle();

  let hoverLayer = null;
  let consumed = false;

  function ensureHover() {
    if (hoverLayer?.isConnected) return hoverLayer;
    hoverLayer = document.createElementNS(SVG_NS, 'g');
    hoverLayer.id = 'visteras-scissors-hover';
    hoverLayer.setAttribute('pointer-events', 'none');
    sc.selectorManager?.selectorParentGroup?.append(hoverLayer);
    return hoverLayer;
  }

  function clearHover() {
    hoverLayer?.replaceChildren();
  }

  /** Pink "anchor" + black X — mirrors Type-on-Path / Add-Anchor "path" HUD. */
  function showAnchorHud(hit) {
    const layer = ensureHover();
    layer.replaceChildren();
    if (!hit || sc.getMode() !== MODE) return;
    const matrix = hit.el.getScreenCTM();
    if (!matrix) return;
    const point = hit.segments[hit.index];
    if (!point || point.x === undefined) return;
    const overlayMatrix = sc.selectorManager.selectorParentGroup.getScreenCTM().inverse();
    const p = new DOMPoint(point.x, point.y).matrixTransform(matrix).matrixTransform(overlayMatrix);
    const ring = document.createElementNS(SVG_NS, 'path');
    ring.setAttribute('d', `M${p.x - 4} ${p.y - 4}L${p.x + 4} ${p.y + 4}M${p.x + 4} ${p.y - 4}L${p.x - 4} ${p.y + 4}`);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#111');
    ring.setAttribute('stroke-width', '1.5');
    const label = document.createElementNS(SVG_NS, 'text');
    label.textContent = 'anchor';
    label.setAttribute('x', p.x + 7);
    label.setAttribute('y', p.y - 6);
    label.setAttribute('fill', '#ff2bb5');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-family', 'sans-serif');
    layer.append(ring, label);
  }

  /** Anchor-only hit test — never mid-segment or empty canvas. */
  function findBestHit(clientX, clientY) {
    let best = null;
    for (const el of candidates(sc).reverse()) {
      const matrix = el.getScreenCTM();
      if (!matrix) continue;
      const transform = (p) => new DOMPoint(p.x, p.y).matrixTransform(matrix);
      const segments = geometry(sc, el);
      const anchorHit = nearestAnchorHit(segments, clientX, clientY, transform);
      if (!anchorHit) continue;
      const hit = {
        el,
        segments,
        index: anchorHit.index,
        t: null,
        atAnchor: true,
        distance: anchorHit.distance,
      };
      if (!best || hit.distance < best.distance) best = hit;
    }
    return best;
  }

  function applyCut(hit) {
    const { BatchCommand, ChangeElementCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
    const command = new BatchCommand('Scissors cut');

    const segments = hit.segments.map((s) => ({ ...s }));
    const cutIndex = hit.index;

    const parts = breakContourAt(segments, cutIndex)
      .filter((part) => part.filter((s) => s.type !== 1).length >= 2);

    if (!parts.length) return;

    let el = ensurePathElement(sc, hit.el, command);
    const parent = el.parentNode;
    const before = el.getAttribute('d');
    const first = parts[0];
    el.setAttribute('d', serializeSegments(first));
    command.addSubCommand(new ChangeElementCommand(el, { d: before }));

    const created = [el];
    for (let i = 1; i < parts.length; i++) {
      const clone = document.createElementNS(SVG_NS, 'path');
      copyPresentation(el, clone);
      if (typeof sc.getNextId === 'function') clone.setAttribute('id', sc.getNextId());
      else clone.removeAttribute('id');
      clone.setAttribute('d', serializeSegments(parts[i]));
      parent.insertBefore(clone, el.nextSibling);
      command.addSubCommand(new InsertElementCommand(clone));
      created.push(clone);
    }

    sc.addCommandToHistory(command);
    sc.clearSelection();
    sc.addToSelection(created, true);
    sc.call('changed', created);
    clearHover();
  }

  window.addEventListener('mousemove', (e) => {
    if (sc.getMode() !== MODE) {
      clearHover();
      return;
    }
    const hit = findBestHit(e.clientX, e.clientY);
    if (hit) showAnchorHud(hit);
    else clearHover();
  }, true);

  window.addEventListener('mousedown', (e) => {
    if (sc.getMode() !== MODE || e.button !== 0) return;
    if (!sc.getSvgRoot?.().contains(e.target) && !document.getElementById('svgcanvas')?.contains(e.target)) return;
    if (e.target.closest?.('#sidepanels, #tools_left, #menu_bar, .menu_bar, #tools_top, #properties_panel')) return;

    const hit = findBestHit(e.clientX, e.clientY);
    if (!hit) return; // mid-segment / empty canvas — no cut
    e.preventDefault();
    e.stopImmediatePropagation();
    consumed = true;
    applyCut(hit);
  }, true);

  window.addEventListener('mouseup', (e) => {
    if (!consumed) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    consumed = false;
  }, true);

  document.addEventListener('modeChange', () => {
    const btn = document.getElementById('tool_scissors');
    if (sc.getMode() === MODE) {
      btn?.setAttribute('pressed', 'true');
      editor.leftPanel?.updateLeftPanel?.('tool_scissors');
    } else {
      btn?.removeAttribute('pressed');
      clearHover();
    }
  });

}

function injectCursorStyle() {
  if (document.getElementById('visteras-scissors-cursor-style')) return;
  const style = document.createElement('style');
  style.id = 'visteras-scissors-cursor-style';
  style.textContent = `
    body[data-mode="${MODE}"] #svgcanvas,
    body[data-mode="${MODE}"] #svgcanvas * {
      cursor: url("./images/scissors_cursor.svg") 4 4, crosshair !important;
    }
  `;
  document.head.append(style);
}

function injectToolbarButton(editor) {
  if (document.getElementById('tool_scissors')) return;
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return;

  const btn = document.createElement('se-button');
  btn.id = 'tool_scissors';
  btn.setAttribute('title', 'Scissors Tool (C)');
  btn.setAttribute('src', 'scissors.svg');
  btn.addEventListener('click', () => {
    editor.svgCanvas.setMode(MODE);
    editor.leftPanel?.updateLeftPanel?.('tool_scissors');
    btn.setAttribute('pressed', 'true');
  });

  const penFlyout = document.getElementById('visteras_pen_subtools');
  const pathTool = document.getElementById('tool_path');
  const anchor = penFlyout || pathTool;
  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  } else {
    toolsLeft.appendChild(btn);
  }
}

export default mountScissorsTool;
