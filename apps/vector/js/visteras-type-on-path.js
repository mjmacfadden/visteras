/**
 * Visteras Vector — Type on Path (Illustrator-style textPath).
 * Client-side: binds editable <text>/<textPath> to a selected path or shape.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const TOP_ATTR = 'data-visteras-type-on-path';
const TOP_CLASS = 'visteras-type-on-path';
const STUDIO_BLUE = '#3f8ff7';

function showToast(message, ms = 3000) {
  let el = document.getElementById('visteras_top_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_top_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'max-width:min(440px,90vw)', 'padding:9px 14px',
      'background:#1e1e1e', 'color:#eee', 'border:1px solid #3f8ff7',
      'border-radius:6px', 'font-size:12px', 'line-height:1.4',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(el._hide);
  el._hide = setTimeout(() => { el.style.display = 'none'; }, ms);
}

function isPathLike(el) {
  if (!el || !el.nodeName) return false;
  const n = el.nodeName.toLowerCase();
  return n === 'path' || n === 'line' || n === 'polyline' || n === 'polygon'
    || n === 'circle' || n === 'ellipse' || n === 'rect';
}

function findPathLike(el) {
  if (!el) return null;
  if (isPathLike(el)) return el;
  if (el.nodeName?.toLowerCase() === 'g') {
    const child = el.querySelector('path, line, polyline, polygon, circle, ellipse, rect');
    if (child) return child;
  }
  return el.closest?.('path, line, polyline, polygon, circle, ellipse, rect') || null;
}

function getSelected(svgEditor) {
  const sc = svgEditor?.svgCanvas;
  if (sc && typeof sc.getSelectedElements === 'function') {
    const elems = sc.getSelectedElements().filter(Boolean);
    if (elems.length) return elems[0];
  }
  return svgEditor?.selectedElement || null;
}

function readTextStyle(svgEditor) {
  const sc = svgEditor.svgCanvas;
  let family = 'sans-serif';
  let size = 24;
  let fill = '#000000';
  try { if (typeof sc.getFontFamily === 'function') family = sc.getFontFamily() || family; } catch (_) {}
  try { if (typeof sc.getFontSize === 'function') size = sc.getFontSize() || size; } catch (_) {}
  try { if (typeof sc.getColor === 'function') fill = sc.getColor('fill') || fill; } catch (_) {}
  const fs = document.getElementById('font_size');
  if (fs?.value) size = parseFloat(fs.value) || size;
  if (!fill || fill === 'none') fill = '#000000';
  return { family, size, fill };
}

function ensureId(sc, el) {
  let id = el.getAttribute('id');
  if (!id) {
    id = typeof sc.getNextId === 'function' ? sc.getNextId() : `svg_${Date.now()}`;
    el.setAttribute('id', id);
  }
  return id;
}

function getDefs(sc) {
  const root = (typeof sc.getContentElem === 'function' && sc.getContentElem())
    || document.getElementById('svgcontent');
  if (!root) return null;
  let defs = root.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    root.insertBefore(defs, root.firstChild);
  }
  return defs;
}

/**
 * Convert any SVG geometry element to a standard path "d" attribute.
 */
function shapeToPathD(el) {
  if (!el) return null;
  const tag = el.nodeName.toLowerCase();
  if (tag === 'path') return el.getAttribute('d');
  if (tag === 'line') {
    const x1 = el.getAttribute('x1') || 0;
    const y1 = el.getAttribute('y1') || 0;
    const x2 = el.getAttribute('x2') || 0;
    const y2 = el.getAttribute('y2') || 0;
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (tag === 'polyline') {
    const pts = (el.getAttribute('points') || '').trim();
    return pts ? `M ${pts}` : null;
  }
  if (tag === 'polygon') {
    const pts = (el.getAttribute('points') || '').trim();
    return pts ? `M ${pts} Z` : null;
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = parseFloat(el.getAttribute('cx')) || 0;
    const cy = parseFloat(el.getAttribute('cy')) || 0;
    const rx = tag === 'circle' ? (parseFloat(el.getAttribute('r')) || 0) : (parseFloat(el.getAttribute('rx')) || 0);
    const ry = tag === 'circle' ? rx : (parseFloat(el.getAttribute('ry')) || 0);
    if (rx <= 0 || ry <= 0) return null;
    return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry}`;
  }
  if (tag === 'rect') {
    const x = parseFloat(el.getAttribute('x')) || 0;
    const y = parseFloat(el.getAttribute('y')) || 0;
    const w = parseFloat(el.getAttribute('width')) || 0;
    const h = parseFloat(el.getAttribute('height')) || 0;
    const rx = parseFloat(el.getAttribute('rx')) || 0;
    const ry = parseFloat(el.getAttribute('ry')) || rx;
    if (w <= 0 || h <= 0) return null;
    if (rx <= 0 && ry <= 0) {
      return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    }
    const rX = Math.min(rx, w / 2);
    const rY = Math.min(ry, h / 2);
    return `M ${x + rX} ${y} H ${x + w - rX} A ${rX} ${rY} 0 0 1 ${x + w} ${y + rY} V ${y + h - rY} A ${rX} ${rY} 0 0 1 ${x + w - rX} ${y + h} H ${x + rX} A ${rX} ${rY} 0 0 1 ${x} ${y + h - rY} V ${y + rY} A ${rX} ${rY} 0 0 1 ${x + rX} ${y} Z`;
  }
  return null;
}

/** Sample path length and rebuild reversed polyline. */
function buildReversedPathD(pathEl) {
  try {
    let targetEl = pathEl;
    let tempEl = null;
    if (typeof targetEl.getTotalLength !== 'function' || targetEl.nodeName.toLowerCase() !== 'path') {
      const d = shapeToPathD(pathEl);
      if (!d) return null;
      tempEl = document.createElementNS(SVG_NS, 'path');
      tempEl.setAttribute('d', d);
      tempEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
      const root = pathEl.ownerSVGElement || document.getElementById('svgcontent') || document.querySelector('svg');
      if (!root) return null;
      root.appendChild(tempEl);
      targetEl = tempEl;
    }
    const len = targetEl.getTotalLength();
    if (!len || !isFinite(len)) {
      if (tempEl) tempEl.remove();
      return null;
    }
    const steps = Math.max(30, Math.min(200, Math.round(len / 2)));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const p = targetEl.getPointAtLength((i / steps) * len);
      pts.push([+p.x.toFixed(2), +p.y.toFixed(2)]);
    }
    if (tempEl) tempEl.remove();
    pts.reverse();
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
    return d;
  } catch (_) {
    return null;
  }
}

function ensureReversedClone(sc, pathEl, baseId) {
  const defs = getDefs(sc);
  if (!defs) return baseId;
  const cloneId = `${baseId}_rev`;
  let existing = defs.querySelector(`#${CSS.escape(cloneId)}`);
  if (existing) return cloneId;

  const revD = buildReversedPathD(pathEl);
  const clone = document.createElementNS(SVG_NS, 'path');
  clone.setAttribute('id', cloneId);
  clone.setAttribute('data-visteras-textpath-rev-of', baseId);
  if (revD) {
    clone.setAttribute('d', revD);
  } else {
    const raw = pathEl.cloneNode(true);
    raw.setAttribute('id', cloneId);
    raw.setAttribute('data-visteras-textpath-rev-of', baseId);
    defs.appendChild(raw);
    return cloneId;
  }
  defs.appendChild(clone);
  return cloneId;
}

function setTextPathHref(tp, id) {
  tp.setAttribute('href', `#${id}`);
  tp.setAttributeNS(XLINK_NS, 'xlink:href', `#${id}`);
}

function ensurePathElement(svgEditor, shapeEl) {
  const sc = svgEditor.svgCanvas;
  if (shapeEl.nodeName.toLowerCase() === 'path') {
    return shapeEl;
  }

  // 1. Try SVG-Edit's native convertToPath
  if (typeof sc.convertToPath === 'function') {
    try {
      const converted = sc.convertToPath(shapeEl);
      if (converted && converted.nodeName.toLowerCase() === 'path') {
        return converted;
      }
    } catch (_) {}
  }

  // 2. Fallback: Convert geometry and put path in <defs>
  const shapeD = shapeToPathD(shapeEl);
  if (shapeD) {
    const defs = getDefs(sc);
    const baseId = ensureId(sc, shapeEl);
    const defPathId = `${baseId}_path`;
    let defPath = defs.querySelector(`#${CSS.escape(defPathId)}`);
    if (!defPath) {
      defPath = document.createElementNS(SVG_NS, 'path');
      defPath.setAttribute('id', defPathId);
      defPath.setAttribute('d', shapeD);
      const tf = shapeEl.getAttribute('transform');
      if (tf) defPath.setAttribute('transform', tf);
      defs.appendChild(defPath);
    }
    return defPath;
  }

  return shapeEl;
}

/**
 * Attaches a getBBox proxy to the text element so its bounding box
 * matches the exact bounding box of the underlying path (never larger).
 */
function attachPathBBoxProxy(textEl, pathEl) {
  if (!textEl || !pathEl) return;
  const origGetBBox = textEl.getBBox.bind(textEl);
  textEl._origGetBBox = origGetBBox;
  textEl.getBBox = function() {
    try {
      if (pathEl && typeof pathEl.getBBox === 'function') {
        const pb = pathEl.getBBox();
        if (pb && pb.width > 0 && pb.height > 0) {
          return {
            x: pb.x,
            y: pb.y,
            width: pb.width,
            height: pb.height,
            top: pb.y,
            bottom: pb.y + pb.height,
            left: pb.x,
            right: pb.x + pb.width,
          };
        }
      }
    } catch (_) {}
    return origGetBBox();
  };
}

/**
 * Sets up hover styling on the path:
 * Path loses stroke and fill; when hovered (directly or via text hover),
 * it displays a thin 1px blue line (#3f8ff7, matching Studio's transform line).
 */
function setupPathHoverEffects(pathEl, textEl) {
  if (!pathEl) return;

  // Make the path unfilled and unstroked (transparent with 10px hit area for easy hover)
  pathEl.setAttribute('fill', 'none');
  pathEl.setAttribute('stroke', 'transparent');
  pathEl.setAttribute('stroke-width', '10');
  pathEl.setAttribute('pointer-events', 'stroke');
  pathEl.classList.add('visteras-type-on-path-source');
  pathEl.setAttribute('data-visteras-top-source', '1');

  const onEnter = () => {
    pathEl.classList.add('visteras-top-hovered');
    pathEl.setAttribute('stroke', STUDIO_BLUE);
    pathEl.setAttribute('stroke-width', '1');
  };

  const onLeave = () => {
    pathEl.classList.remove('visteras-top-hovered');
    pathEl.setAttribute('stroke', 'transparent');
    pathEl.setAttribute('stroke-width', '10');
  };

  pathEl.removeEventListener('pointerenter', pathEl._topEnter || onEnter);
  pathEl.removeEventListener('pointerleave', pathEl._topLeave || onLeave);
  pathEl._topEnter = onEnter;
  pathEl._topLeave = onLeave;
  pathEl.addEventListener('pointerenter', onEnter);
  pathEl.addEventListener('pointerleave', onLeave);

  if (textEl) {
    textEl.removeEventListener('pointerenter', textEl._topEnter || onEnter);
    textEl.removeEventListener('pointerleave', textEl._topLeave || onLeave);
    textEl._topEnter = onEnter;
    textEl._topLeave = onLeave;
    textEl.addEventListener('pointerenter', onEnter);
    textEl.addEventListener('pointerleave', onLeave);
  }
}

/**
 * Interactive Artboard Text Editor:
 * Allows inline editing directly on the artboard without properties panel inputs.
 */
export function openArtboardTextEditor(svgEditor, textEl) {
  const tp = textEl.querySelector('textPath');
  if (!tp) return;

  // Remove existing active editor if any
  let editor = document.getElementById('visteras_artboard_text_editor');
  if (editor) editor.remove();

  const workarea = svgEditor.workarea || document.getElementById('workarea');
  if (!workarea) return;

  const sc = svgEditor.svgCanvas;
  const zoom = (typeof sc.getZoom === 'function') ? sc.getZoom() : 1;
  const fontFam = textEl.getAttribute('font-family') || 'sans-serif';
  const fontSize = (parseFloat(textEl.getAttribute('font-size')) || 24) * zoom;
  const fillColor = textEl.getAttribute('fill') || '#ffffff';

  editor = document.createElement('input');
  editor.id = 'visteras_artboard_text_editor';
  editor.type = 'text';
  editor.value = tp.textContent || '';
  editor.placeholder = 'Type text…';
  editor.spellcheck = false;

  // Compute position on canvas
  const bbox = textEl.getBBox();
  const root = sc.getContentElem() || document.getElementById('svgcontent');
  const ctm = textEl.getScreenCTM ? textEl.getScreenCTM() : root.getScreenCTM();
  const workareaRect = workarea.getBoundingClientRect();

  let left = 60;
  let top = 60;
  if (ctm && bbox) {
    const pt = root.createSVGPoint ? root.createSVGPoint() : document.createElementNS(SVG_NS, 'svg').createSVGPoint();
    pt.x = bbox.x;
    pt.y = bbox.y;
    const screenPt = pt.matrixTransform(ctm);
    left = screenPt.x - workareaRect.left + workarea.scrollLeft;
    top = screenPt.y - workareaRect.top + workarea.scrollTop - fontSize - 14;
  }

  left = Math.max(12, left);
  top = Math.max(12, top);

  editor.style.cssText = [
    'position:absolute',
    `left:${Math.round(left)}px`,
    `top:${Math.round(top)}px`,
    'z-index:99999',
    'min-width:160px',
    'max-width:550px',
    `height:${Math.max(30, Math.round(fontSize + 10))}px`,
    `font-family:${fontFam}`,
    `font-size:${Math.round(fontSize)}px`,
    `color:${fillColor === '#000000' || fillColor === '#000' ? '#ffffff' : fillColor}`,
    'background:rgba(26, 26, 26, 0.94)',
    `border:1.5px solid ${STUDIO_BLUE}`,
    'border-radius:5px',
    'padding:2px 10px',
    'box-shadow:0 4px 20px rgba(0, 0, 0, 0.65)',
    'outline:none',
    'box-sizing:border-box',
  ].join(';');

  const commitAndClose = () => {
    if (!editor.parentNode) return;
    const finalVal = editor.value.trim() || 'Type on path';
    tp.textContent = finalVal;
    editor.remove();
    sc.call?.('changed', [textEl]);
    sc.clearSelection();
    sc.addToSelection([textEl], true);
    sc.call?.('selected', [textEl]);
  };

  editor.addEventListener('input', () => {
    tp.textContent = editor.value;
    editor.style.width = Math.max(160, Math.min(650, editor.value.length * (fontSize * 0.65) + 36)) + 'px';
  });

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      commitAndClose();
    }
  });

  editor.addEventListener('blur', () => {
    setTimeout(commitAndClose, 120);
  });

  workarea.appendChild(editor);
  editor.select();
  editor.focus();
}

function createTypeOnPath(svgEditor, shapeEl, opts = {}) {
  const sc = svgEditor.svgCanvas;
  const pathEl = ensurePathElement(svgEditor, shapeEl);
  const { family, size, fill } = readTextStyle(svgEditor);
  const content = opts.content || 'Type on path';
  const align = opts.align || 'start';
  const reverse = !!opts.reverse;

  const pathId = ensureId(sc, pathEl);
  let hrefId = pathId;
  if (reverse) hrefId = ensureReversedClone(sc, pathEl, pathId);

  const text = document.createElementNS(SVG_NS, 'text');
  const textId = ensureId(sc, text) || (typeof sc.getNextId === 'function' ? sc.getNextId() : `svg_${Date.now()}`);
  text.setAttribute('id', textId);
  text.setAttribute('class', TOP_CLASS);
  text.setAttribute(TOP_ATTR, '1');
  text.setAttribute('fill', fill);
  text.setAttribute('stroke', 'none');
  text.setAttribute('font-family', family);
  text.setAttribute('font-size', String(size));
  text.setAttribute('text-anchor', align === 'middle' ? 'middle' : (align === 'end' ? 'end' : 'start'));
  text.setAttribute('xml:space', 'preserve');

  const textPath = document.createElementNS(SVG_NS, 'textPath');
  if (typeof sc.getNextId === 'function') textPath.setAttribute('id', sc.getNextId());
  setTextPathHref(textPath, hrefId);

  if (align === 'middle') {
    textPath.setAttribute('startOffset', '50%');
    textPath.setAttribute('text-anchor', 'middle');
  } else if (align === 'end') {
    textPath.setAttribute('startOffset', '100%');
    textPath.setAttribute('text-anchor', 'end');
  } else {
    textPath.setAttribute('startOffset', opts.startOffset != null ? String(opts.startOffset) : '0%');
    textPath.setAttribute('text-anchor', 'start');
  }
  textPath.textContent = content;
  text.appendChild(textPath);

  const parent = shapeEl.parentNode;
  if (shapeEl.nextSibling) parent.insertBefore(text, shapeEl.nextSibling);
  else parent.appendChild(text);

  // Requirement: The path loses its stroke and fill, and displays a thin blue line on hover
  setupPathHoverEffects(pathEl, text);

  // Requirement: Bounding box around text should be as large as the path itself, not larger
  attachPathBBoxProxy(text, pathEl);

  if (sc.history?.InsertElementCommand && typeof sc.addCommandToHistory === 'function') {
    try { sc.addCommandToHistory(new sc.history.InsertElementCommand(text)); } catch (_) {}
  }

  // Register selection in SVG-Edit
  sc.clearSelection();
  sc.addToSelection([text], true);
  if (typeof sc.call === 'function') {
    sc.call('selected', [text]);
    sc.call('changed', [text]);
  }
  if (typeof window.__updatePropertiesVisibility === 'function') {
    window.__updatePropertiesVisibility();
  }
  syncOptionsPanel(svgEditor);

  // Requirement: Editable directly on the artboard right after creation
  setTimeout(() => {
    openArtboardTextEditor(svgEditor, text);
  }, 50);

  return text;
}

function findTextPath(el) {
  if (!el) return null;
  if (el.nodeName === 'textPath') return el;
  if (el.nodeName === 'text') return el.querySelector('textPath');
  return el.closest?.('text')?.querySelector?.('textPath') || null;
}

function isTypeOnPathText(el) {
  const text = el?.nodeName === 'text' ? el : el?.closest?.('text');
  return !!(text && (text.getAttribute(TOP_ATTR) === '1' || text.querySelector('textPath')));
}

function ensureOptionsPanel() {
  return document.getElementById('sec_type_on_path');
}

function syncOptionsPanel(svgEditor) {
  const panel = ensureOptionsPanel();
  if (!panel) return;
  const el = getSelected(svgEditor);
  const tp = findTextPath(el);
  const on = !!(tp && isTypeOnPathText(tp.parentElement || el));

  panel.style.display = on ? 'block' : 'none';
  if (!on || !tp) return;

  const so = tp.getAttribute('startOffset') || '0%';
  const pct = Math.max(0, Math.min(100, parseFloat(String(so).replace('%', '')) || 0));
  const offsetSlider = panel.querySelector('#top_offset');
  const offsetVal = panel.querySelector('#top_offset_val');
  if (offsetSlider) offsetSlider.value = String(pct);
  if (offsetVal) offsetVal.textContent = `${pct}%`;

  const ta = tp.getAttribute('text-anchor') || 'start';
  const alignSelect = panel.querySelector('#top_align');
  if (alignSelect) {
    alignSelect.value = (ta === 'middle' || ta === 'end') ? ta : 'start';
  }

  const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
  const reverseCheck = panel.querySelector('#top_reverse');
  if (reverseCheck) {
    reverseCheck.checked = /_rev$/.test(href);
  }
}

function wireOptionsPanel(svgEditor) {
  const panel = ensureOptionsPanel();
  if (!panel || panel.dataset.wired === '1') return;
  panel.dataset.wired = '1';

  const offsetSlider = panel.querySelector('#top_offset');
  const offsetVal = panel.querySelector('#top_offset_val');
  const alignSelect = panel.querySelector('#top_align');
  const reverseCheck = panel.querySelector('#top_reverse');

  offsetSlider?.addEventListener('input', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const v = e.target.value;
    if (offsetVal) offsetVal.textContent = `${v}%`;
    tp.setAttribute('startOffset', `${v}%`);
  });
  offsetSlider?.addEventListener('change', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    svgEditor.svgCanvas?.call?.('changed', [tp.parentElement]);
  });

  alignSelect?.addEventListener('change', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const align = e.target.value;
    tp.setAttribute('text-anchor', align);
    tp.parentElement?.setAttribute('text-anchor', align);
    if (align === 'middle') {
      tp.setAttribute('startOffset', '50%');
      if (offsetSlider) offsetSlider.value = '50';
      if (offsetVal) offsetVal.textContent = '50%';
    } else if (align === 'end') {
      tp.setAttribute('startOffset', '100%');
      if (offsetSlider) offsetSlider.value = '100';
      if (offsetVal) offsetVal.textContent = '100%';
    } else {
      tp.setAttribute('startOffset', '0%');
      if (offsetSlider) offsetSlider.value = '0';
      if (offsetVal) offsetVal.textContent = '0%';
    }
    svgEditor.svgCanvas?.call?.('changed', [tp.parentElement]);
  });

  reverseCheck?.addEventListener('change', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const sc = svgEditor.svgCanvas;
    const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
    const baseId = href.replace(/_rev$/, '');
    const pathEl = (typeof sc.getElement === 'function' && sc.getElement(baseId))
      || document.getElementById(baseId);
    if (!pathEl) {
      showToast('Could not find the bound path.');
      e.target.checked = !e.target.checked;
      return;
    }
    const newId = e.target.checked ? ensureReversedClone(sc, pathEl, baseId) : baseId;
    setTextPathHref(tp, newId);
    sc.call?.('changed', [tp.parentElement]);
  });
}

function disarmTypeOnPathMode(svgEditor) {
  svgEditor._waitingForTypeOnPath = false;
  if (svgEditor._topPointerDownHandler) {
    window.removeEventListener('pointerdown', svgEditor._topPointerDownHandler, true);
    svgEditor._topPointerDownHandler = null;
  }
  const btn = document.getElementById('tool_type_on_path');
  if (btn) btn.removeAttribute('pressed');
}

function armTypeOnPathMode(svgEditor) {
  if (svgEditor._waitingForTypeOnPath) {
    disarmTypeOnPathMode(svgEditor);
    showToast('Type on Path cancelled.');
    return;
  }

  const selected = getSelected(svgEditor);
  if (selected && isPathLike(selected) && !svgEditor.multiselected) {
    createTypeOnPath(svgEditor, selected);
    return;
  }

  if (selected && isTypeOnPathText(selected)) {
    openArtboardTextEditor(svgEditor, selected);
    return;
  }

  svgEditor._waitingForTypeOnPath = true;
  const btn = document.getElementById('tool_type_on_path');
  if (btn) btn.setAttribute('pressed', 'true');
  showToast('Click a path or shape to place type on it.');

  const onPointerDown = (evt) => {
    if (!svgEditor._waitingForTypeOnPath) return;

    if (evt.target.closest?.('#sidepanels, #tools_left, #menu_bar, .menu_bar, #tools_top, #properties_panel')) {
      return;
    }

    let target = null;
    const elements = document.elementsFromPoint(evt.clientX, evt.clientY);
    for (const el of elements) {
      if (el.closest?.('#svgcontent')) {
        const p = findPathLike(el);
        if (p) {
          target = p;
          break;
        }
      }
    }

    if (!target) {
      target = findPathLike(evt.target);
    }

    if (target) {
      evt.preventDefault();
      evt.stopPropagation();
      disarmTypeOnPathMode(svgEditor);
      createTypeOnPath(svgEditor, target);
    }
  };

  svgEditor._topPointerDownHandler = onPointerDown;
  window.addEventListener('pointerdown', onPointerDown, true);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && svgEditor._waitingForTypeOnPath) {
      disarmTypeOnPathMode(svgEditor);
      showToast('Type on Path cancelled.');
      window.removeEventListener('keydown', onKeyDown);
    }
  };
  window.addEventListener('keydown', onKeyDown);
}

function injectToolbarButton(svgEditor) {
  if (document.getElementById('tool_type_on_path')) return;
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return;

  const btn = document.createElement('se-button');
  btn.id = 'tool_type_on_path';
  btn.setAttribute('title', 'Type on Path');
  btn.setAttribute('src', 'type_on_path.svg');
  btn.addEventListener('click', () => armTypeOnPathMode(svgEditor));

  const textTool = document.getElementById('tool_text');
  if (textTool && textTool.parentNode) {
    textTool.parentNode.insertBefore(btn, textTool.nextSibling);
  } else {
    toolsLeft.appendChild(btn);
  }
}

/**
 * Global hooks into SVG-Edit selectorManager and bounding box calculations
 * to enforce Studio-parity bounding box size matching the path itself.
 */
function hookSelectorManager(svgEditor) {
  const sc = svgEditor.svgCanvas;
  if (!sc) return;

  const sm = sc.selectorManager;
  if (sm && typeof sm.requestSelector === 'function' && !sm._visterasHooked) {
    sm._visterasHooked = true;
    const origRequestSelector = sm.requestSelector.bind(sm);
    sm.requestSelector = function(elem, bbox) {
      if (elem && elem.nodeName === 'text' && (elem.hasAttribute(TOP_ATTR) || elem.querySelector('textPath'))) {
        const tp = elem.querySelector('textPath');
        if (tp) {
          const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
          const baseId = href.replace(/_rev$/, '');
          const pathEl = (typeof sc.getElement === 'function' && sc.getElement(baseId)) || document.getElementById(baseId);
          if (pathEl && typeof pathEl.getBBox === 'function') {
            const pb = pathEl.getBBox();
            if (pb && pb.width > 0 && pb.height > 0) {
              bbox = { x: pb.x, y: pb.y, width: pb.width, height: pb.height };
              attachPathBBoxProxy(elem, pathEl);
            }
          }
        }
      }
      return origRequestSelector(elem, bbox);
    };
  }

  // Intercept double-click on artboard to open on-artboard text editor
  window.addEventListener('dblclick', (evt) => {
    const target = evt.target;
    const textEl = target?.closest?.(`text.${TOP_CLASS}, text[${TOP_ATTR}]`);
    if (textEl) {
      evt.preventDefault();
      evt.stopPropagation();
      openArtboardTextEditor(svgEditor, textEl);
    }
  }, true);
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasTypeOnPath(opts = {}) {
  const svgEditor = opts.svgEditor;
  if (!svgEditor) return;

  // Toolbar button insertion
  const tryToolbar = () => injectToolbarButton(svgEditor);
  tryToolbar();
  setTimeout(tryToolbar, 100);
  setTimeout(tryToolbar, 500);

  wireOptionsPanel(svgEditor);
  hookSelectorManager(svgEditor);

  document.getElementById('action_type_on_path')?.addEventListener('click', () => {
    armTypeOnPathMode(svgEditor);
  });
  document.getElementById('action_type_on_path_object')?.addEventListener('click', () => {
    armTypeOnPathMode(svgEditor);
  });

  window.__visterasTypeOnPath = () => armTypeOnPathMode(svgEditor);
  window.__visterasSyncTypeOnPath = () => syncOptionsPanel(svgEditor);

  // Hook into SVG-Edit selection events
  const sc = svgEditor.svgCanvas;
  if (sc && typeof sc.bind === 'function') {
    sc.bind('selectedChanged', () => {
      if (svgEditor._waitingForTypeOnPath) {
        const sel = getSelected(svgEditor);
        if (sel && isPathLike(sel)) {
          disarmTypeOnPathMode(svgEditor);
          createTypeOnPath(svgEditor, sel);
          return;
        }
      }
      syncOptionsPanel(svgEditor);
    });
    sc.bind('elementChanged', () => syncOptionsPanel(svgEditor));
  }

  if (svgEditor.topPanel && typeof svgEditor.topPanel.updateContextPanel === 'function') {
    const prev = svgEditor.topPanel.updateContextPanel.bind(svgEditor.topPanel);
    svgEditor.topPanel.updateContextPanel = function wrappedUpdateContextPanel() {
      prev();
      syncOptionsPanel(svgEditor);
    };
  }
}

export default mountVisterasTypeOnPath;
