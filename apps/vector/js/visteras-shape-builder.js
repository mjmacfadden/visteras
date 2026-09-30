/**
 * Visteras Vector — Shape Builder Tool  (Shift+M)
 *
 * An Adobe Illustrator–style shape builder for combining, extracting, and
 * deleting regions formed by overlapping selected paths.
 *
 * ─── How it works ───────────────────────────────────────────────────────────
 *
 * 1. When the tool activates, it uses Paper.js to compute every closed region
 *    produced by all overlapping selected paths (via `divide()`).  The regions
 *    are stored in a hidden SVG overlay group so they can be highlighted on
 *    mouseover.
 *
 * 2. Hovering over the canvas highlights the region under the pointer with a
 *    light blue fill (non-destructive — just CSS/SVG overlay).
 *
 * 3. Drag (paint stroke) across multiple regions to MERGE: a union of all
 *    highlighted regions replaces the participating source shapes.
 *
 * 4. Alt+click OR Alt+drag → DELETE the region(s) the cursor passes over.
 *
 * 5. On deactivate the overlay is removed and the tool resets cleanly.
 *
 * ─── Keyboard / Toolbar ─────────────────────────────────────────────────────
 *   Shift+M  → activate (wired in visteras-selection.js)
 *   Escape   → deactivate, return to Select (V)
 *
 * ─── Exports ────────────────────────────────────────────────────────────────
 *   mountShapeBuilderTool(editor)   – DOM + event setup
 *   getRegionsFromItems(scope, els) – pure geometry (testable)
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const MODE = 'shape_builder';
const OVERLAY_ID = 'visteras-shape-builder-overlay';
const HIGHLIGHT_FILL = 'rgba(72,145,255,0.35)';
const HIGHLIGHT_STROKE = 'rgba(72,145,255,0.9)';
const DELETE_FILL = 'rgba(255,80,80,0.35)';
const DELETE_STROKE = 'rgba(255,80,80,0.9)';

// ─── Region geometry ─────────────────────────────────────────────────────────
/**
 * Decompose an array of SVG path elements into individual closed regions using
 * Paper.js Boolean divide.
 *
 * Returns an array of { d, bounds } objects where `d` is the SVG path data
 * for each region and `bounds` is a Paper.js Rectangle.
 *
 * @param {object} scope      – A configured paper.PaperScope
 * @param {SVGElement[]} els  – Source path elements
 * @returns {{ d: string, paperItem: object }[]}
 */
export function getRegionsFromItems(scope, els) {
  if (!els.length) return [];

  // Import all elements and unite them into one compound to work from
  const items = els.map(el => {
    try {
      const imp = scope.project.importSVG(el);
      if (imp instanceof scope.PathItem) return imp;
      if (imp instanceof scope.Shape) return imp.toPath(true);
      if (imp instanceof scope.Group) {
        const children = [...imp.children];
        let combined = null;
        for (const child of children) {
          const p = child instanceof scope.Shape ? child.toPath(true) :
                    child instanceof scope.PathItem ? child : null;
          if (p) combined = combined ? combined.unite(p) : p;
        }
        return combined;
      }
      return null;
    } catch (_) { return null; }
  }).filter(Boolean);

  if (!items.length) return [];

  // Use divide() on all pairs to produce atomic regions
  let regions = [items[0]];
  for (let i = 1; i < items.length; i++) {
    const next = items[i];
    const newRegions = [];
    for (const region of regions) {
      try {
        // Divide splits two paths at intersections
        const divided = region.divide(next);
        if (divided) newRegions.push(divided);
        else newRegions.push(region);
      } catch (_) {
        newRegions.push(region);
      }
    }
    // Also add the right-hand side regions
    for (const region of regions) {
      try {
        const rightSide = next.subtract(region);
        if (rightSide) {
          const exported = rightSide.exportSVG({ asString: false });
          const d = exported.tagName?.toLowerCase() === 'path' ? exported.getAttribute('d') : '';
          if (d?.trim()) newRegions.push(rightSide);
        }
      } catch (_) {}
    }
    regions = newRegions;
  }

  // Add any remaining parts of the last item not covered by previous regions
  const results = [];
  for (const r of regions) {
    try {
      const exported = r.exportSVG({ asString: false });
      let d = '';
      if (exported.tagName?.toLowerCase() === 'path') {
        d = exported.getAttribute('d') || '';
      } else {
        const paths = exported.querySelectorAll?.('path') || [];
        const parts = [];
        paths.forEach(p => { const pd = p.getAttribute('d'); if (pd) parts.push(pd); });
        d = parts.join(' ');
      }
      if (d.trim()) results.push({ d, paperItem: r });
    } catch (_) {}
  }
  return results;
}

// ─── Overlay management ───────────────────────────────────────────────────────
let _overlayGroup = null;  // SVG <g> in the SVG canvas
let _regions = [];         // [{ d, pathEl, sourceEls }]
let _hoveredIdx = -1;
let _painting = false;
let _paintedIndices = new Set();
let _paintMode = 'merge'; // 'merge' | 'delete'
let _sourceEls = [];      // selected SVG elements at activation

function _getOrCreateOverlay(svgCanvas) {
  const existing = svgCanvas.querySelector(`#${OVERLAY_ID}`);
  if (existing) return existing;
  const g = document.createElementNS(SVG_NS, 'g');
  g.id = OVERLAY_ID;
  g.setAttribute('pointer-events', 'none');
  svgCanvas.appendChild(g);
  return g;
}

function _clearOverlay(svgCanvas) {
  const g = svgCanvas?.querySelector(`#${OVERLAY_ID}`);
  if (g) g.remove();
  _overlayGroup = null;
  _regions = [];
  _hoveredIdx = -1;
}

/**
 * Build the region overlay from the currently selected elements.
 * @param {SVGElement} svgCanvas   – The actual <svg> element
 * @param {SVGElement[]} selEls    – Source path elements
 */
function _buildRegions(svgCanvas, selEls) {
  if (!window.paper || !selEls.length) return;

  const scope = new window.paper.PaperScope();
  const canvas = document.createElement('canvas');
  scope.setup(canvas);

  try {
    const rawRegions = getRegionsFromItems(scope, selEls);

    _overlayGroup = _getOrCreateOverlay(svgCanvas);

    _regions = rawRegions.map(({ d }) => {
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('fill', 'transparent');
      pathEl.setAttribute('stroke', 'transparent');
      pathEl.setAttribute('stroke-width', '1');
      pathEl.setAttribute('pointer-events', 'all'); // allow hover detection
      pathEl.style.cursor = 'crosshair';
      _overlayGroup.appendChild(pathEl);
      return { d, pathEl };
    });
  } catch (err) {
    console.warn('[Shape Builder] Region computation error:', err);
  } finally {
    scope.project.clear();
  }
}

function _highlightRegion(idx, mode) {
  if (idx < 0 || idx >= _regions.length) return;
  const fill = mode === 'delete' ? DELETE_FILL : HIGHLIGHT_FILL;
  const stroke = mode === 'delete' ? DELETE_STROKE : HIGHLIGHT_STROKE;
  _regions[idx].pathEl.setAttribute('fill', fill);
  _regions[idx].pathEl.setAttribute('stroke', stroke);
}

function _unhighlightRegion(idx) {
  if (idx < 0 || idx >= _regions.length) return;
  if (_paintedIndices.has(idx)) return; // keep painted highlight
  _regions[idx].pathEl.setAttribute('fill', 'transparent');
  _regions[idx].pathEl.setAttribute('stroke', 'transparent');
}

function _findRegionAt(x, y) {
  // Use document.elementFromPoint but filter to overlay children only
  const el = document.elementFromPoint(x, y);
  if (!el || !_overlayGroup) return -1;
  const idx = _regions.findIndex(r => r.pathEl === el);
  return idx;
}

// ─── Merge / Delete apply ─────────────────────────────────────────────────────
function _applyMerge(editor, indices) {
  if (!indices.length || !_sourceEls.length) return;
  const sc = editor.svgCanvas;
  if (!window.paper) return;

  const scope = new window.paper.PaperScope();
  const canvas = document.createElement('canvas');
  scope.setup(canvas);

  try {
    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
    const batchCmd = new BatchCommand('Shape Builder Merge');

    // Build a Paper.js path from the selected regions
    const regionDs = indices.map(i => _regions[i]?.d).filter(Boolean);
    if (!regionDs.length) return;

    let merged = null;
    for (const d of regionDs) {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('d', d);
      const item = scope.project.importSVG(el);
      const pi = item instanceof scope.PathItem ? item :
                 item instanceof scope.Shape ? item.toPath(true) : null;
      if (pi) merged = merged ? merged.unite(pi) : pi;
    }

    if (!merged) return;

    const exported = merged.exportSVG({ asString: false });
    let newD = '';
    let fillRule = null;
    if (exported.tagName?.toLowerCase() === 'path') {
      newD = exported.getAttribute('d') || '';
      fillRule = exported.getAttribute('fill-rule');
    } else {
      const paths = exported.querySelectorAll('path');
      const parts = [];
      paths.forEach(p => { const pd = p.getAttribute('d'); if (pd) parts.push(pd); fillRule = fillRule || p.getAttribute('fill-rule'); });
      newD = parts.join(' ');
    }

    if (!newD.trim()) return;

    const newPath = document.createElementNS(SVG_NS, 'path');
    newPath.setAttribute('id', sc.getNextId());
    newPath.setAttribute('d', newD);
    if (fillRule) newPath.setAttribute('fill-rule', fillRule);

    // Inherit style from first source element
    const styleAttrs = ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'opacity'];
    for (const attr of styleAttrs) {
      const val = _sourceEls[0]?.getAttribute(attr);
      if (val !== null && val !== undefined) newPath.setAttribute(attr, val);
    }

    const parent = _sourceEls[0]?.parentNode || sc.getCurrentDrawing().getCurrentLayer();
    parent.appendChild(newPath);
    batchCmd.addSubCommand(new InsertElementCommand(newPath));

    // Remove original source elements
    for (const el of _sourceEls) {
      if (el.parentNode) {
        batchCmd.addSubCommand(new RemoveElementCommand(el, el.nextSibling, el.parentNode));
        el.remove();
      }
    }

    sc.undoMgr.addCommandToHistory(batchCmd);
    sc.clearSelection();
    sc.addToSelection([newPath], true);
    sc.call('changed', [newPath]);
    if (window.__updatePropertiesVisibility) window.__updatePropertiesVisibility();

    // Return to select tool after merge
    editor.leftPanel?.clickSelect?.();
  } catch (err) {
    console.error('[Shape Builder] Merge error:', err);
  } finally {
    scope.project.clear();
  }
}

function _applyDelete(editor, indices) {
  if (!indices.length || !_sourceEls.length) return;
  const sc = editor.svgCanvas;
  if (!window.paper) return;

  const scope = new window.paper.PaperScope();
  const canvas = document.createElement('canvas');
  scope.setup(canvas);

  try {
    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
    const batchCmd = new BatchCommand('Shape Builder Delete');

    // Build the union of regions to delete
    const deleteDs = indices.map(i => _regions[i]?.d).filter(Boolean);
    let deleteItem = null;
    for (const d of deleteDs) {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('d', d);
      const item = scope.project.importSVG(el);
      const pi = item instanceof scope.PathItem ? item :
                 item instanceof scope.Shape ? item.toPath(true) : null;
      if (pi) deleteItem = deleteItem ? deleteItem.unite(pi) : pi;
    }

    if (!deleteItem) return;

    const newElements = [];

    for (const srcEl of _sourceEls) {
      let srcItem;
      try {
        srcItem = scope.project.importSVG(srcEl);
        if (srcItem instanceof scope.Shape) srcItem = srcItem.toPath(true);
        if (!(srcItem instanceof scope.PathItem)) continue;
      } catch (_) { continue; }

      const result = srcItem.subtract(deleteItem);
      if (!result) {
        // Source completely removed by deletion
        batchCmd.addSubCommand(new RemoveElementCommand(srcEl, srcEl.nextSibling, srcEl.parentNode));
        srcEl.remove();
        continue;
      }

      const exported = result.exportSVG({ asString: false });
      let newD = '';
      let fillRule = null;
      if (exported.tagName?.toLowerCase() === 'path') {
        newD = exported.getAttribute('d') || '';
        fillRule = exported.getAttribute('fill-rule');
      } else {
        const paths = exported.querySelectorAll('path');
        const parts = [];
        paths.forEach(p => { const pd = p.getAttribute('d'); if (pd) parts.push(pd); fillRule = fillRule || p.getAttribute('fill-rule'); });
        newD = parts.join(' ');
      }

      if (!newD.trim()) {
        batchCmd.addSubCommand(new RemoveElementCommand(srcEl, srcEl.nextSibling, srcEl.parentNode));
        srcEl.remove();
        continue;
      }

      // Replace existing element's d attribute
      const newPath = document.createElementNS(SVG_NS, 'path');
      newPath.setAttribute('id', sc.getNextId());
      newPath.setAttribute('d', newD);
      if (fillRule) newPath.setAttribute('fill-rule', fillRule);
      const styleAttrs = ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'opacity'];
      for (const attr of styleAttrs) {
        const val = srcEl.getAttribute(attr);
        if (val !== null) newPath.setAttribute(attr, val);
      }
      srcEl.parentNode?.insertBefore(newPath, srcEl);
      batchCmd.addSubCommand(new InsertElementCommand(newPath));
      batchCmd.addSubCommand(new RemoveElementCommand(srcEl, srcEl.nextSibling, srcEl.parentNode));
      srcEl.remove();
      newElements.push(newPath);
    }

    sc.undoMgr.addCommandToHistory(batchCmd);
    if (newElements.length) {
      sc.clearSelection();
      sc.addToSelection(newElements, true);
      sc.call('changed', newElements);
    }
    if (window.__updatePropertiesVisibility) window.__updatePropertiesVisibility();

    // Return to select tool after delete
    editor.leftPanel?.clickSelect?.();
  } catch (err) {
    console.error('[Shape Builder] Delete error:', err);
  } finally {
    scope.project.clear();
  }
}

// ─── Toolbar button ───────────────────────────────────────────────────────────
function _injectToolbarButton(editor) {
  if (document.getElementById('tool_shape_builder')) return;
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return;

  const btn = document.createElement('se-button');
  btn.id = 'tool_shape_builder';
  btn.setAttribute('title', 'Shape Builder Tool (Shift+M)');
  btn.setAttribute('src', 'shape_builder.svg');
  btn.addEventListener('click', () => {
    editor.svgCanvas.setMode(MODE);
    editor.leftPanel?.updateLeftPanel?.('tool_shape_builder');
    btn.setAttribute('pressed', 'true');
  });

  // Insert after eraser button
  const eraserBtn = document.getElementById('tool_eraser');
  if (eraserBtn?.parentNode) {
    eraserBtn.parentNode.insertBefore(btn, eraserBtn.nextSibling);
  } else {
    toolsLeft.appendChild(btn);
  }
}

function _injectCursorStyle() {
  if (document.getElementById('visteras-shape-builder-cursor-style')) return;
  const style = document.createElement('style');
  style.id = 'visteras-shape-builder-cursor-style';
  style.textContent = `
    body[data-mode="${MODE}"] #svgcanvas,
    body[data-mode="${MODE}"] #svgcanvas * {
      cursor: crosshair !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── Mount ────────────────────────────────────────────────────────────────────
/**
 * @param {object} editor - SVG-Edit Editor instance
 */
export function mountShapeBuilderTool(editor) {
  const sc = editor.svgCanvas;

  _injectCursorStyle();
  _injectToolbarButton(editor);

  // ── Mode change ──────────────────────────────────────────────────────────
  document.addEventListener('modeChange', () => {
    const active = sc.getMode() === MODE;
    document.body.setAttribute('data-mode', active ? MODE : sc.getMode());

    const svgCanvasEl = document.getElementById('svgcanvas');
    if (!svgCanvasEl) return;

    if (active) {
      // Capture selected elements at activation time
      _sourceEls = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
      if (!_sourceEls.length) {
        // No selection: prompt user and return to select
        setTimeout(() => {
          editor.leftPanel?.clickSelect?.();
        }, 0);
        return;
      }
      // De-select visually but keep reference
      sc.clearSelection();
      _buildRegions(svgCanvasEl, _sourceEls);
    } else {
      _clearOverlay(svgCanvasEl);
      _sourceEls = [];
      _painting = false;
      _paintedIndices.clear();
    }
  });

  // ── Pointer events on SVG canvas ─────────────────────────────────────────
  const svgCanvasEl = document.getElementById('svgcanvas');
  if (!svgCanvasEl) return;

  svgCanvasEl.addEventListener('mousemove', (e) => {
    if (sc.getMode() !== MODE) return;
    const idx = _findRegionAt(e.clientX, e.clientY);

    // Unhighlight previous hover (if not painted)
    if (_hoveredIdx !== idx) {
      _unhighlightRegion(_hoveredIdx);
      _hoveredIdx = idx;
    }

    if (idx >= 0) {
      _highlightRegion(idx, _paintMode);
      if (_painting) {
        _paintedIndices.add(idx);
      }
    }
  });

  svgCanvasEl.addEventListener('mousedown', (e) => {
    if (sc.getMode() !== MODE) return;
    e.preventDefault();
    e.stopPropagation();

    _paintMode = e.altKey ? 'delete' : 'merge';
    _painting = true;
    _paintedIndices.clear();

    const idx = _findRegionAt(e.clientX, e.clientY);
    if (idx >= 0) {
      _highlightRegion(idx, _paintMode);
      _paintedIndices.add(idx);
    }
  }, true);

  svgCanvasEl.addEventListener('mouseup', (e) => {
    if (sc.getMode() !== MODE || !_painting) return;
    _painting = false;

    const finalIndices = [..._paintedIndices];
    _paintedIndices.clear();

    if (!finalIndices.length) return;

    // Clear overlay before applying (we'll rebuild if needed)
    _clearOverlay(svgCanvasEl);

    if (_paintMode === 'delete') {
      _applyDelete(editor, finalIndices);
    } else {
      _applyMerge(editor, finalIndices);
    }
  });

  // ── Escape → return to Select ─────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sc.getMode() === MODE) {
      _clearOverlay(svgCanvasEl);
      editor.leftPanel?.clickSelect?.();
    }
  });
}

export default mountShapeBuilderTool;
