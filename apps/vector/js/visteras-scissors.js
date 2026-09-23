/**
 * Visteras Vector — Scissors tool (Illustrator-like).
 * Click a path/shape to split at that point:
 * - Closed path → opens at the cut (one open path, coincident endpoints).
 * - Open path → becomes two separate path objects.
 */
import { readSegments, serializeSegments, anchors, contours } from './visteras-anchor-model.js';
import { normalizeEditablePath } from './visteras-path-geometry.js';
import {
  hitSegment,
  splitSegment,
  simplifyStraightSegments,
  evaluateSegment,
} from './visteras-pen-geometry.js';

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

/**
 * After ensuring a vertex exists at cutIndex, open a closed contour or split an open one.
 * Returns an array of segment arrays (1 for open-closed, 2 for split-open).
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
      const seg = { ...segments[rotated[i]] };
      // Original contour M must become a line when it appears mid-path.
      if (seg.type === 2) seg.type = 4;
      open.push(seg);
    }
    // Final segment returns to the cut point (open path with coincident ends).
    const closingSeg = { ...segments[cutIndex] };
    if (closingSeg.type === 2) closingSeg.type = 4;
    closingSeg.x = cutPt.x;
    closingSeg.y = cutPt.y;
    open.push(closingSeg);
    return attachOthers(open);
  }

  const leftOrder = order.slice(0, pos + 1);
  const rightOrder = order.slice(pos);
  const left = [];
  if (leftOrder.length) {
    left.push({ type: 2, x: segments[leftOrder[0]].x, y: segments[leftOrder[0]].y });
    for (let i = 1; i < leftOrder.length; i++) {
      const seg = { ...segments[leftOrder[i]] };
      if (seg.type === 2) seg.type = 4;
      left.push(seg);
    }
  }
  const right = [];
  if (rightOrder.length) {
    right.push({ type: 2, x: cutPt.x, y: cutPt.y });
    for (let i = 1; i < rightOrder.length; i++) {
      const seg = { ...segments[rightOrder[i]] };
      if (seg.type === 2) seg.type = 4;
      right.push(seg);
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

  function showHover(el, event) {
    const layer = ensureHover();
    layer.replaceChildren();
    if (!el || sc.getMode() !== MODE) return;
    const matrix = el.getScreenCTM();
    if (!matrix) return;
    const transform = (p) => new DOMPoint(p.x, p.y).matrixTransform(matrix);
    const data = geometry(sc, el);
    const anchorHit = nearestAnchorHit(data, event.clientX, event.clientY, transform);
    const segHit = hitSegment(data, { x: event.clientX, y: event.clientY }, transform, 8);
    const hit = anchorHit && (!segHit || anchorHit.distance <= Math.sqrt(segHit.distance))
      ? { ...anchorHit, point: data[anchorHit.index] }
      : segHit
        ? { ...segHit, point: evaluateSegment(data[segHit.index - 1], data[segHit.index], segHit.t) }
        : null;
    if (!hit?.point) return;
    const overlayMatrix = sc.selectorManager.selectorParentGroup.getScreenCTM().inverse();
    const p = new DOMPoint(hit.point.x, hit.point.y).matrixTransform(matrix).matrixTransform(overlayMatrix);
    const mark = document.createElementNS(SVG_NS, 'circle');
    mark.setAttribute('cx', p.x);
    mark.setAttribute('cy', p.y);
    mark.setAttribute('r', '3.5');
    mark.setAttribute('fill', '#fff');
    mark.setAttribute('stroke', '#111');
    mark.setAttribute('stroke-width', '1.25');
    layer.append(mark);
  }

  function findBestHit(clientX, clientY) {
    let best = null;
    for (const el of candidates(sc).reverse()) {
      const matrix = el.getScreenCTM();
      if (!matrix) continue;
      const transform = (p) => new DOMPoint(p.x, p.y).matrixTransform(matrix);
      const segments = geometry(sc, el);
      const anchorHit = nearestAnchorHit(segments, clientX, clientY, transform);
      const segHit = hitSegment(segments, { x: clientX, y: clientY }, transform, 8);
      let hit = null;
      if (anchorHit && (!segHit || anchorHit.distance <= Math.sqrt(segHit.distance))) {
        hit = { el, segments, index: anchorHit.index, t: null, atAnchor: true, distance: anchorHit.distance ** 2 };
      } else if (segHit) {
        hit = { el, segments, index: segHit.index, t: segHit.t, atAnchor: false, distance: segHit.distance };
      }
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    return best;
  }

  function applyCut(hit) {
    const { BatchCommand, ChangeElementCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
    const command = new BatchCommand('Scissors cut');

    let segments = hit.segments.map((s) => ({ ...s }));
    let cutIndex = hit.index;

    if (!hit.atAnchor && hit.t != null) {
      segments = splitSegment(segments, hit.index, hit.t);
      cutIndex = hit.index; // left half ends at the new vertex
    }

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
    const el = e.target.closest?.('path,rect,circle,ellipse,line,polygon,polyline');
    if (el && sc.getSvgContent().contains(el)) showHover(el, e);
    else clearHover();
  }, true);

  window.addEventListener('mousedown', (e) => {
    if (sc.getMode() !== MODE || e.button !== 0) return;
    if (!sc.getSvgRoot?.().contains(e.target) && !document.getElementById('svgcanvas')?.contains(e.target)) return;
    if (e.target.closest?.('#sidepanels, #tools_left, #menu_bar, .menu_bar, #tools_top, #properties_panel')) return;

    const hit = findBestHit(e.clientX, e.clientY);
    if (!hit) return;
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
