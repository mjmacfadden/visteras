/**
 * Visteras Vector — Eraser Tool (Shift+E).
 * Full Adobe Illustrator-style vector eraser:
 * - Circular brush carving with live canvas-scaled cursor.
 * - Bracket keys [ and ] to resize brush diameter (2px - 200px).
 * - Option/Alt drag for rectangular region slicing.
 * - Boolean path carving via Paper.js constructive solid geometry.
 * - Erases from selected objects (or all visible vector shapes if none selected).
 * - Splits cut shapes into independent closed vector paths with styles preserved.
 * - Full Undo / Redo history support via BatchCommand.
 */
import { normalizeEditablePath } from './visteras-path-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MODE = 'eraser';
const DEFAULT_RADIUS = 16;
const MIN_RADIUS = 2;
const MAX_RADIUS = 200;

export function clampEraserRadius(r) {
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(r)));
}

export function isEraserTarget(el) {
  if (!el || !el.parentNode) return false;
  const tag = (el.nodeName || el.tagName || '').toLowerCase();
  const validTags = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
  if (!validTags.has(tag)) return false;
  if (el.closest('defs, clipPath, mask')) return false;
  if (typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') {
      return false;
    }
  }
  return true;
}

/**
 * Geometric calculation of a capsule / stadium polygon (rectangle + round caps)
 * between p1 and p2 with radius r.
 */
export function createCapsulePath(scope, p1, p2, r) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) {
    return new scope.Path.Circle({
      center: [p1.x, p1.y],
      radius: r,
    });
  }

  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  const tx = (dx / len) * r;
  const ty = (dy / len) * r;

  const p = new scope.Path();
  p.moveTo(new scope.Point(p1.x + nx, p1.y + ny));
  p.lineTo(new scope.Point(p2.x + nx, p2.y + ny));
  p.arcTo(
    new scope.Point(p2.x + tx, p2.y + ty),
    new scope.Point(p2.x - nx, p2.y - ny)
  );
  p.lineTo(new scope.Point(p1.x - nx, p1.y - ny));
  p.arcTo(
    new scope.Point(p1.x - tx, p1.y - ty),
    new scope.Point(p1.x + nx, p1.y + ny)
  );
  p.closePath();
  return p;
}

export function copyPresentation(fromEl, toEl) {
  const skip = new Set([
    'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
    'x1', 'y1', 'x2', 'y2', 'points', 'id',
  ]);
  for (const a of fromEl.attributes) {
    if (skip.has(a.name)) continue;
    try { toEl.setAttributeNS(a.namespaceURI, a.name, a.value); } catch (_) { /* ignore */ }
  }
}

/**
 * Convert an SVG element into a closed Paper.js PathItem.
 */
export function elementToPaperItem(scope, el) {
  if (!el || !scope) return null;
  const item = scope.project.importSVG(el);
  return toClosedPathItem(scope, item);
}

export function toClosedPathItem(scope, item) {
  if (!item) return null;
  if (item instanceof scope.Shape) {
    const p = item.toPath(true);
    if (p) p.closed = true;
    return p;
  }
  if (item instanceof scope.PathItem) {
    item.closed = true;
    return item;
  }
  if (item instanceof scope.Group) {
    const children = [...item.children];
    let combined = null;
    for (const child of children) {
      const p = toClosedPathItem(scope, child);
      if (p) {
        combined = combined ? combined.unite(p) : p;
      }
    }
    return combined;
  }
  return null;
}

/**
 * Decompose a resulting Paper.js CompoundPath into separate independent islands
 * (so slicing an object creates two distinct selectable SVG paths).
 */
export function decomposeToIslands(scope, pathItem) {
  if (!pathItem) return [];
  if (pathItem instanceof scope.Path) {
    return [pathItem];
  }
  if (pathItem instanceof scope.CompoundPath) {
    const children = pathItem.children || [];
    if (children.length <= 1) return [pathItem];

    // Identify outermost containers vs internal holes
    const sorted = [...children].sort((a, b) => b.bounds.area - a.bounds.area);
    const islands = [];

    for (const child of sorted) {
      const testPt = child.interiorPoint || child.bounds.center;
      let parentIsland = null;
      for (const isl of islands) {
        if (isl.outer.contains(testPt)) {
          parentIsland = isl;
          break;
        }
      }
      if (parentIsland) {
        parentIsland.holes.push(child);
      } else {
        islands.push({ outer: child, holes: [] });
      }
    }

    return islands.map((isl) => {
      if (!isl.holes.length) return isl.outer;
      return new scope.CompoundPath({ children: [isl.outer, ...isl.holes] });
    });
  }
  return [pathItem];
}

/**
 * Convert a Paper.js PathItem back into SVG <path> element(s).
 */
export function paperItemToElements(scope, pathItem, sourceEl, sc) {
  if (!pathItem) return [];
  const islands = decomposeToIslands(scope, pathItem);
  const elements = [];

  for (const isl of islands) {
    if (isl.bounds.area < 1e-4) continue;
    const svgExport = isl.exportSVG({ asString: false });
    let d = '';
    let fillRule = null;
    if (svgExport.tagName.toLowerCase() === 'path') {
      d = svgExport.getAttribute('d');
      fillRule = svgExport.getAttribute('fill-rule');
    } else {
      const paths = svgExport.querySelectorAll('path');
      const dArr = [];
      paths.forEach((p) => {
        const pd = p.getAttribute('d');
        if (pd) dArr.push(pd);
        if (!fillRule) fillRule = p.getAttribute('fill-rule');
      });
      d = dArr.join(' ');
    }
    if (!d || !d.trim()) continue;

    const pathEl = document.createElementNS(SVG_NS, 'path');
    if (typeof sc?.getNextId === 'function') {
      pathEl.setAttribute('id', sc.getNextId());
    }
    pathEl.setAttribute('d', d);
    normalizeEditablePath(pathEl, (p) => sc?.pathActions?.convertPath?.(p));
    copyPresentation(sourceEl, pathEl);
    if (fillRule) pathEl.setAttribute('fill-rule', fillRule);
    elements.push(pathEl);
  }

  return elements;
}

/**
 * Execute boolean erase subtraction on candidate elements.
 */
export function performErase({
  scope,
  eraserItem,
  targets,
  sc,
  commandName = 'Eraser',
}) {
  if (!scope || !eraserItem || !targets || !targets.length) {
    return { modified: [], created: [], removed: [] };
  }

  const { BatchCommand, RemoveElementCommand, InsertElementCommand } = sc.history;
  const batchCmd = new BatchCommand(commandName);
  const createdElements = [];
  const removedElements = [];
  let modifiedAny = false;

  for (const targetEl of targets) {
    try {
      const targetItem = elementToPaperItem(scope, targetEl);
      if (!targetItem) continue;

      // Quick bounding box overlap test
      if (!targetItem.bounds.intersects(eraserItem.bounds)) continue;

      const doesIntersect = targetItem.intersects(eraserItem);
      const isContained = eraserItem.contains(targetItem.bounds.center);
      if (!doesIntersect && !isContained) continue;

      const subtracted = targetItem.subtract(eraserItem);
      const parent = targetEl.parentNode;
      const nextSibling = targetEl.nextSibling;

      if (!subtracted || subtracted.bounds.area < 1e-4) {
        // Completely erased
        batchCmd.addSubCommand(new RemoveElementCommand(targetEl, nextSibling, parent));
        targetEl.remove();
        removedElements.push(targetEl);
        modifiedAny = true;
      } else {
        // Partially erased — replace with remaining pieces
        const newPieces = paperItemToElements(scope, subtracted, targetEl, sc);
        if (!newPieces.length) {
          batchCmd.addSubCommand(new RemoveElementCommand(targetEl, nextSibling, parent));
          targetEl.remove();
          removedElements.push(targetEl);
          modifiedAny = true;
        } else {
          for (const piece of newPieces) {
            parent.insertBefore(piece, nextSibling);
            batchCmd.addSubCommand(new InsertElementCommand(piece));
            createdElements.push(piece);
          }
          batchCmd.addSubCommand(new RemoveElementCommand(targetEl, nextSibling, parent));
          targetEl.remove();
          removedElements.push(targetEl);
          modifiedAny = true;
        }
      }
    } catch (err) {
      console.warn('Erase failed on element', targetEl, err);
    }
  }

  if (modifiedAny) {
    sc.undoMgr?.addCommandToHistory(batchCmd);
    sc.clearSelection();
    if (createdElements.length) {
      sc.addToSelection(createdElements, true);
      sc.call('changed', createdElements);
    }
  }

  return {
    modified: createdElements,
    created: createdElements,
    removed: removedElements,
  };
}

let activeToastTimer = null;
function showEraserToast(message) {
  let el = document.getElementById('visteras_eraser_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_eraser_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'padding:6px 12px', 'background:#1e1e1e', 'color:#fa7c1b',
      'border:1px solid #fa7c1b', 'border-radius:4px', 'font-size:11px',
      'font-weight:600', 'box-shadow:0 4px 16px rgba(0,0,0,0.5)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(activeToastTimer);
  activeToastTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 1200);
}

export function mountEraserTool(editor) {
  const sc = editor.svgCanvas;
  if (!sc || window.__visterasEraserMounted) return;
  window.__visterasEraserMounted = true;

  let currentRadius = parseInt(localStorage.getItem('visteras_eraser_radius'), 10) || DEFAULT_RADIUS;
  currentRadius = clampEraserRadius(currentRadius);

  injectToolbarButton(editor);
  injectCursorStyle();

  let hudGroup = null;
  let cursorCircle = null;
  let previewPath = null;
  let previewRect = null;

  let isDragging = false;
  let dragPoints = [];
  let isAltMode = false;
  let altStartPoint = null;

  function ensureHud() {
    if (hudGroup?.isConnected) return hudGroup;
    hudGroup = document.createElementNS(SVG_NS, 'g');
    hudGroup.id = 'visteras-eraser-hud';
    hudGroup.setAttribute('pointer-events', 'none');

    cursorCircle = document.createElementNS(SVG_NS, 'circle');
    cursorCircle.setAttribute('fill', 'rgba(255, 43, 181, 0.15)');
    cursorCircle.setAttribute('stroke', '#ff2bb5');
    cursorCircle.setAttribute('stroke-width', '1.5');
    cursorCircle.style.display = 'none';

    previewPath = document.createElementNS(SVG_NS, 'path');
    previewPath.setAttribute('fill', 'none');
    previewPath.setAttribute('stroke', 'rgba(255, 43, 181, 0.45)');
    previewPath.setAttribute('stroke-linecap', 'round');
    previewPath.setAttribute('stroke-linejoin', 'round');
    previewPath.style.display = 'none';

    previewRect = document.createElementNS(SVG_NS, 'rect');
    previewRect.setAttribute('fill', 'rgba(255, 43, 181, 0.25)');
    previewRect.setAttribute('stroke', '#ff2bb5');
    previewRect.setAttribute('stroke-width', '1.5');
    previewRect.setAttribute('stroke-dasharray', '4 4');
    previewRect.style.display = 'none';

    hudGroup.append(previewPath, previewRect, cursorCircle);
    sc.selectorManager?.selectorParentGroup?.append(hudGroup);
    return hudGroup;
  }

  function hideHud() {
    if (cursorCircle) cursorCircle.style.display = 'none';
    if (previewPath) previewPath.style.display = 'none';
    if (previewRect) previewRect.style.display = 'none';
  }

  function getCanvasCoords(clientX, clientY) {
    const svgContent = sc.getSvgContent?.();
    if (!svgContent) return { x: clientX, y: clientY };
    const ctm = svgContent.getScreenCTM?.();
    if (!ctm) return { x: clientX, y: clientY };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function getOverlayCoords(clientX, clientY) {
    const overlayParent = sc.selectorManager?.selectorParentGroup;
    if (!overlayParent) return { x: clientX, y: clientY };
    const ctm = overlayParent.getScreenCTM?.();
    if (!ctm) return { x: clientX, y: clientY };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function updateCursorHud(e) {
    if (sc.getMode() !== MODE) {
      hideHud();
      return;
    }
    ensureHud();
    const ov = getOverlayCoords(e.clientX, e.clientY);
    const zoom = sc.getZoom?.() || 1;
    const scaledRadius = currentRadius * zoom;

    cursorCircle.setAttribute('cx', ov.x);
    cursorCircle.setAttribute('cy', ov.y);
    cursorCircle.setAttribute('r', scaledRadius);
    cursorCircle.style.display = e.altKey ? 'none' : 'block';
  }

  function setEraserRadius(r) {
    currentRadius = clampEraserRadius(r);
    localStorage.setItem('visteras_eraser_radius', String(currentRadius));
    showEraserToast(`Eraser: ${currentRadius * 2}px`);
  }

  // Keyboard shortcut listener for [ and ] brush resizing and Shift+E activation
  window.addEventListener('keydown', (e) => {
    if (e.isComposing || window.__visterasIsTypingDirectly) return;
    const target = e.target;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.nodeName))) return;

    const key = e.key;
    const isCmd = e.metaKey || e.ctrlKey;

    if (!isCmd && !e.altKey && e.shiftKey && key.toLowerCase() === 'e') {
      e.preventDefault();
      e.stopImmediatePropagation();
      sc.setMode(MODE);
      editor.leftPanel?.updateLeftPanel?.('tool_eraser');
      document.getElementById('tool_eraser')?.setAttribute('pressed', 'true');
      showEraserToast(`Eraser Tool (Shift+E)`);
      return;
    }

    if (sc.getMode() === MODE) {
      if (key === '[') {
        e.preventDefault();
        const step = currentRadius > 20 ? 4 : 2;
        setEraserRadius(currentRadius - step);
      } else if (key === ']') {
        e.preventDefault();
        const step = currentRadius >= 20 ? 4 : 2;
        setEraserRadius(currentRadius + step);
      }
    }
  }, true);

  window.addEventListener('mousemove', (e) => {
    if (sc.getMode() !== MODE) {
      hideHud();
      return;
    }
    updateCursorHud(e);

    if (!isDragging) return;

    const canvasPt = getCanvasCoords(e.clientX, e.clientY);
    const ov = getOverlayCoords(e.clientX, e.clientY);
    const zoom = sc.getZoom?.() || 1;

    if (isAltMode && altStartPoint) {
      const minX = Math.min(altStartPoint.ovX, ov.x);
      const minY = Math.min(altStartPoint.ovY, ov.y);
      const w = Math.abs(ov.x - altStartPoint.ovX);
      const h = Math.abs(ov.y - altStartPoint.ovY);
      previewRect.setAttribute('x', minX);
      previewRect.setAttribute('y', minY);
      previewRect.setAttribute('width', w);
      previewRect.setAttribute('height', h);
      previewRect.style.display = 'block';
    } else {
      const last = dragPoints[dragPoints.length - 1];
      const dist = last ? Math.hypot(canvasPt.x - last.x, canvasPt.y - last.y) : 999;
      if (dist >= 1.5) {
        dragPoints.push(canvasPt);
      }

      if (dragPoints.length > 1) {
        let d = `M ${dragPoints[0].x} ${dragPoints[0].y}`;
        for (let i = 1; i < dragPoints.length; i++) {
          d += ` L ${dragPoints[i].x} ${dragPoints[i].y}`;
        }
        previewPath.setAttribute('d', d);
        previewPath.setAttribute('stroke-width', currentRadius * 2 * zoom);
        previewPath.style.display = 'block';
      }
    }
  }, true);

  window.addEventListener('mousedown', (e) => {
    if (sc.getMode() !== MODE || e.button !== 0) return;
    const canvasContainer = document.getElementById('svgcanvas');
    if (!canvasContainer || (!canvasContainer.contains(e.target) && !sc.getSvgRoot?.().contains(e.target))) {
      return;
    }
    if (e.target.closest?.('#sidepanels, #tools_left, #menu_bar, .menu_bar, #tools_top, #properties_panel')) {
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    isDragging = true;
    isAltMode = !!e.altKey;
    const canvasPt = getCanvasCoords(e.clientX, e.clientY);
    const ov = getOverlayCoords(e.clientX, e.clientY);

    dragPoints = [canvasPt];
    altStartPoint = { x: canvasPt.x, y: canvasPt.y, ovX: ov.x, ovY: ov.y };

    ensureHud();
    if (isAltMode) {
      previewRect.setAttribute('x', ov.x);
      previewRect.setAttribute('y', ov.y);
      previewRect.setAttribute('width', 0);
      previewRect.setAttribute('height', 0);
      previewRect.style.display = 'block';
    } else {
      previewPath.style.display = 'none';
    }
  }, true);

  window.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    isDragging = false;

    hideHud();

    if (!window.paper) {
      console.warn('Paper.js is not loaded; cannot execute vector erase.');
      return;
    }

    const endCanvasPt = getCanvasCoords(e.clientX, e.clientY);
    const scope = new window.paper.PaperScope();
    const scratchCanvas = document.createElement('canvas');
    scope.setup(scratchCanvas);

    let eraserItem = null;
    try {
      if (isAltMode && altStartPoint) {
        const minX = Math.min(altStartPoint.x, endCanvasPt.x);
        const minY = Math.min(altStartPoint.y, endCanvasPt.y);
        const w = Math.abs(endCanvasPt.x - altStartPoint.x);
        const h = Math.abs(endCanvasPt.y - altStartPoint.y);
        if (w >= 1 && h >= 1) {
          eraserItem = new scope.Path.Rectangle(
            new scope.Point(minX, minY),
            new scope.Size(w, h)
          );
        }
      } else {
        if (dragPoints.length === 1) {
          eraserItem = new scope.Path.Circle({
            center: [dragPoints[0].x, dragPoints[0].y],
            radius: currentRadius,
          });
        } else if (dragPoints.length > 1) {
          for (let i = 0; i < dragPoints.length - 1; i++) {
            const cap = createCapsulePath(scope, dragPoints[i], dragPoints[i + 1], currentRadius);
            eraserItem = eraserItem ? eraserItem.unite(cap) : cap;
          }
        }
      }

      if (!eraserItem) {
        scope.project.clear();
        return;
      }

      // Determine target elements:
      // If elements are selected, only erase from selected elements (Illustrator behavior).
      // If none selected, erase from all visible vector elements on the canvas.
      let targets = (sc.getSelectedElements?.() || []).filter(isEraserTarget);
      if (!targets.length) {
        const all = [...(sc.getSvgContent?.().querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line') || [])];
        targets = all.filter(isEraserTarget);
      }

      performErase({
        scope,
        eraserItem,
        targets,
        sc,
        commandName: isAltMode ? 'Eraser (Marquee)' : 'Eraser Brush',
      });
    } catch (err) {
      console.error('Eraser operation error:', err);
    } finally {
      try { scope.project.clear(); } catch (_) { /* ignore */ }
    }
  }, true);

  document.addEventListener('modeChange', () => {
    const btn = document.getElementById('tool_eraser');
    if (sc.getMode() === MODE) {
      btn?.setAttribute('pressed', 'true');
      editor.leftPanel?.updateLeftPanel?.('tool_eraser');
    } else {
      btn?.removeAttribute('pressed');
      hideHud();
    }
  });
}

function injectCursorStyle() {
  if (document.getElementById('visteras-eraser-cursor-style')) return;
  const style = document.createElement('style');
  style.id = 'visteras-eraser-cursor-style';
  style.textContent = `
    body[data-mode="${MODE}"] #svgcanvas,
    body[data-mode="${MODE}"] #svgcanvas * {
      cursor: crosshair !important;
    }
  `;
  document.head.append(style);
}

function injectToolbarButton(editor) {
  if (document.getElementById('tool_eraser')) return;
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return;

  const btn = document.createElement('se-button');
  btn.id = 'tool_eraser';
  btn.setAttribute('title', 'Eraser Tool (Shift+E)');
  btn.setAttribute('src', 'eraser.svg');
  btn.addEventListener('click', () => {
    editor.svgCanvas.setMode(MODE);
    editor.leftPanel?.updateLeftPanel?.('tool_eraser');
    btn.setAttribute('pressed', 'true');
  });

  const scissorsBtn = document.getElementById('tool_scissors');
  if (scissorsBtn?.parentNode) {
    scissorsBtn.parentNode.insertBefore(btn, scissorsBtn.nextSibling);
  } else {
    const penFlyout = document.getElementById('visteras_pen_subtools');
    const pathTool = document.getElementById('tool_path');
    const anchor = penFlyout || pathTool;
    if (anchor?.parentNode) {
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    } else {
      toolsLeft.appendChild(btn);
    }
  }
}

export default mountEraserTool;
