/**
 * Visteras Vector — Object ▸ Expand (Illustrator Parity)
 *
 * One-click command that expands selected elements into clean vector paths:
 * 1. Live <text> elements are converted to vector glyph outlines (via convertTextToOutlines).
 * 2. Stroked paths and shapes are outlined into filled vector paths (via executeOutlineStroke).
 * 3. Shape primitives (<rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>) are converted to <path>.
 *
 * All transformations are executed within a single undoable history BatchCommand('Expand').
 */

import { convertTextToOutlines, isTextElement } from './visteras-text-outlines.js';
import { executeOutlineStroke } from './visteras-offset-path.js';

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

/**
 * Checks if an element is a primitive SVG shape.
 */
export function isPrimitiveShape(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = (el.tagName || el.localName || '').toLowerCase();
  return SHAPE_TAGS.has(tag);
}

/**
 * Checks if an element has a visible stroke.
 */
export function hasVisibleStroke(el) {
  if (!el || el.nodeType !== 1) return false;
  const stroke = el.getAttribute?.('stroke') || el.style?.stroke;
  if (!stroke || stroke === 'none') return false;
  const widthAttr = el.getAttribute?.('stroke-width') || el.style?.strokeWidth;
  if (widthAttr !== undefined && widthAttr !== null) {
    const w = parseFloat(widthAttr);
    if (!isNaN(w) && w <= 0) return false;
  }
  return true;
}

/**
 * Determines whether any of the given elements can be expanded.
 */
export function canExpand(elements) {
  if (!elements || !elements.length) return false;
  for (const el of elements) {
    if (!el || el.nodeType !== 1) continue;
    if (isTextElement(el) || el.querySelector?.('text')) return true;
    if (hasVisibleStroke(el) || el.querySelector?.('[stroke]:not([stroke="none"])')) return true;
    if (isPrimitiveShape(el) || el.querySelector?.('rect, circle, ellipse, line, polyline, polygon')) return true;
  }
  return false;
}

/**
 * Expands all selected elements into pure vector paths in a single operation.
 *
 * @param {object} editor - SVG-Edit Editor instance
 * @param {Element[]} [targetElements] - Optional elements (defaults to current selection)
 * @returns {Promise<Element[]|null>} Array of expanded elements
 */
export async function expandSelection(editor, targetElements = null) {
  const sc = editor?.svgCanvas;
  if (!sc) return null;

  const elements = (targetElements || (sc.getSelectedElements ? sc.getSelectedElements() : [])).filter(Boolean);
  if (!elements.length) {
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Please select one or more objects to expand.', 'info');
    }
    return null;
  }

  const doc = sc.doc || (typeof document !== 'undefined' ? document : null);
  const { BatchCommand, RemoveElementCommand, InsertElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Expand') : null;

  const finalExpanded = [];
  const handled = new Set();

  // 1. First Pass: Expand all live <text> elements into vector paths
  const textElements = [];
  for (const el of elements) {
    if (isTextElement(el)) {
      textElements.push(el);
    } else if (el.querySelectorAll) {
      const nested = [...el.querySelectorAll('text')];
      textElements.push(...nested);
    }
  }

  for (const tEl of textElements) {
    if (handled.has(tEl)) continue;
    const parent = tEl.parentNode;
    if (!parent) continue;
    const nextSibling = tEl.nextSibling;

    const group = await convertTextToOutlines(tEl, doc);
    if (group) {
      tEl.remove();
      if (batch && RemoveElementCommand) {
        batch.addSubCommand(new RemoveElementCommand(tEl, nextSibling, parent));
      }
      parent.insertBefore(group, nextSibling);
      if (batch && InsertElementCommand) {
        batch.addSubCommand(new InsertElementCommand(group));
      }
      handled.add(tEl);
      finalExpanded.push(group);
    }
  }

  // 2. Second Pass: Convert primitive shapes (rect, circle, ellipse, line, polyline, polygon) to <path>
  const remaining = elements.filter(el => !handled.has(el) && el.isConnected);
  for (const el of remaining) {
    if (isPrimitiveShape(el) && typeof sc.convertToPath === 'function') {
      try {
        const pathEl = sc.convertToPath(el);
        if (pathEl) {
          handled.add(el);
          finalExpanded.push(pathEl);
        }
      } catch (_) {
        // Continue if path conversion fails on non-standard element
      }
    }
  }

  // 3. Third Pass: Outline visible strokes using executeOutlineStroke
  // Any element (including newly converted paths or remaining stroked elements) that has a visible stroke
  const strokedCandidates = [
    ...finalExpanded.filter(el => hasVisibleStroke(el)),
    ...elements.filter(el => !handled.has(el) && el.isConnected && hasVisibleStroke(el))
  ];

  if (strokedCandidates.length > 0 && typeof executeOutlineStroke === 'function') {
    try {
      // Set selection temporarily to the stroked candidates to run stroke outlining
      sc.clearSelection?.();
      sc.addToSelection?.(strokedCandidates, true);
      const strokeResult = executeOutlineStroke(editor);
      if (Array.isArray(strokeResult) && strokeResult.length > 0) {
        for (const res of strokeResult) {
          if (!finalExpanded.includes(res)) {
            finalExpanded.push(res);
          }
        }
      }
    } catch (err) {
      console.warn('[visteras-expand] stroke outline step failed:', err);
    }
  }

  // If batch had sub-commands, commit it
  if (batch && batch.sub_commands && batch.sub_commands.length > 0) {
    sc.addCommandToHistory(batch);
  }

  // Select all resulting expanded elements
  const validResults = finalExpanded.filter(el => el && el.isConnected);
  if (validResults.length > 0) {
    sc.clearSelection?.();
    sc.addToSelection?.(validResults, true);
    sc.call?.('changed', validResults);
    return validResults;
  }

  return elements;
}

/**
 * Mounts Object ▸ Expand command to UI and menus.
 */
export function mountExpand(editor) {
  const expandBtn = document.getElementById('action_expand');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      expandSelection(editor);
    });
  }

  // Update disabled state based on current selection
  const sc = editor?.svgCanvas;
  if (sc && expandBtn) {
    const updateMenuState = () => {
      const selected = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
      const enabled = canExpand(selected);
      expandBtn.classList.toggle('disabled', !enabled);
    };

    sc.bind?.('selectedChanged', updateMenuState);
    sc.bind?.('changed', updateMenuState);
    updateMenuState();
  }
}

export default mountExpand;
