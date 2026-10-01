import { installPathTextBounds } from './visteras-path-text-bounds.js';
import { beginTextEdit } from './visteras-text-editing.js';
/**
 * Visteras Vector — Type on Path (Illustrator-style textPath).
 * Client-side: binds editable <text>/<textPath> to a selected path or shape.
 * Illustrator-leaning controls: offset, align, reverse, align-to-path, tracking.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const TOP_ATTR = 'data-visteras-type-on-path';
const TOP_CLASS = 'visteras-type-on-path';
const CARET_CLASS = 'visteras-top-caret';
const STUDIO_BLUE = '#3f8ff7';

let activeEditingContext = null;

// Preserve element identity so selections and path references survive history replay.
function captureAttributes(elements) {
  return elements.map(el => ({ el, attrs: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])) }));
}
function recordAttributes(sc, before, title, inserted = []) {
  const batch = new sc.history.BatchCommand(title);
  for (const el of inserted) batch.addSubCommand(new sc.history.InsertElementCommand(el));
  for (const { el, attrs } of before) {
    const previous = {};
    for (const name of new Set([...Object.keys(attrs), ...[...el.attributes].map(a => a.name)])) {
      if ((attrs[name] ?? null) !== el.getAttribute(name)) previous[name] = attrs[name] ?? null;
    }
    if ('href' in previous || 'xlink:href' in previous) {
      previous['#href'] = attrs.href || attrs['xlink:href'] || null;
      delete previous.href;
      delete previous['xlink:href'];
    }
    if (Object.keys(previous).length) batch.addSubCommand(new sc.history.ChangeElementCommand(el, previous));
  }
  if (!batch.isEmpty()) sc.addCommandToHistory(batch);
}

// Use one baseline mechanism. SVG middle aligns the x-height, whereas central
// centers the font's em box on the path.
function applyPathBaseline(text, tp, mode) {
  const db = { baseline: 'alphabetic', ascender: 'text-before-edge', center: 'central', descender: 'text-after-edge' }[mode] || 'alphabetic';
  for (const el of [text, tp]) {
    el.removeAttribute('dy');
    el.style?.removeProperty('dominant-baseline');
    el.style?.removeProperty('alignment-baseline');
    el.setAttribute('dominant-baseline', db);
    el.setAttribute('alignment-baseline', db);
  }
  text.setAttribute('data-visteras-align-path', mode);
}

function showToast(message, ms = 2500) {
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
  let letterSpacing = null;
  let wordSpacing = null;
  let fontWeight = null;
  let fontStyle = null;
  try { if (typeof sc.getFontFamily === 'function') family = sc.getFontFamily() || family; } catch (_) {}
  try { if (typeof sc.getFontSize === 'function') size = sc.getFontSize() || size; } catch (_) {}
  try { if (typeof sc.getColor === 'function') fill = sc.getColor('fill') || fill; } catch (_) {}
  try {
    if (typeof sc.getCurText === 'function') {
      letterSpacing = sc.getCurText('letter_spacing') ?? sc.getCurText('letter-spacing');
      wordSpacing = sc.getCurText('word_spacing') ?? sc.getCurText('word-spacing');
      fontWeight = sc.getCurText('font_weight') ?? sc.getCurText('font-weight');
      fontStyle = sc.getCurText('font_style') ?? sc.getCurText('font-style');
    }
  } catch (_) {}
  const fs = document.getElementById('font_size');
  if (fs?.value) size = parseFloat(fs.value) || size;
  const lsInput = document.getElementById('tool_letter_spacing');
  if (lsInput?.value && (letterSpacing == null || letterSpacing === '')) letterSpacing = lsInput.value;
  const wsInput = document.getElementById('tool_word_spacing');
  if (wsInput?.value && (wordSpacing == null || wordSpacing === '')) wordSpacing = wsInput.value;
  if (!fill || fill === 'none') fill = '#000000';
  return { family, size, fill, letterSpacing, wordSpacing, fontWeight, fontStyle };
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
  installPathTextBounds(textEl.closest('#svgcontent') || textEl.ownerSVGElement);
}

/**
 * Sets up hover styling on the path:
 * Path loses stroke and fill; when hovered (directly or via text hover),
 * it displays a thin 1px blue line (#3f8ff7 with vector-effect: non-scaling-stroke).
 * When selected, the hover outline is suppressed so there is ONLY a single bounding box line.
 */
function setupPathHoverEffects(pathEl, textEl) {
  if (!pathEl) return;

  // Path loses stroke and fill; thin 1px line for clean hover outline
  pathEl.setAttribute('fill', 'none');
  pathEl.style.setProperty('fill', 'none');
  pathEl.style.setProperty('stroke', 'none');
  pathEl.setAttribute('stroke', 'transparent');
  pathEl.setAttribute('stroke-width', '1');
  pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
  pathEl.setAttribute('pointer-events', 'stroke');
  pathEl.classList.add('visteras-type-on-path-source');
  pathEl.setAttribute('data-visteras-top-source', '1');

  const onEnter = () => {
    if (!pathEl.hasAttribute('data-visteras-top-source')) return;
    if (pathEl.classList.contains('visteras-top-selected')) return;
    pathEl.classList.add('visteras-top-hovered');
    pathEl.style.stroke = STUDIO_BLUE;
    pathEl.style.strokeWidth = '1px';
    pathEl.style.vectorEffect = 'non-scaling-stroke';
    pathEl.style.fill = 'none';
  };

  const onLeave = () => {
    if (!pathEl.hasAttribute('data-visteras-top-source')) return;
    pathEl.classList.remove('visteras-top-hovered');
    if (!pathEl.classList.contains('visteras-top-selected')) {
      pathEl.style.stroke = 'transparent';
      pathEl.style.strokeWidth = '1px';
      pathEl.style.fill = 'none';
    }
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
 * Direct In-Place Artboard Text Editing:
 * Captures typing directly on the path with a live blinking caret on the curve.
 */
export function startDirectInPlaceEdit(svgEditor, textEl) {
  beginTextEdit(svgEditor, textEl);
}

function createTypeOnPath(svgEditor, shapeEl, opts = {}) {
  const sc = svgEditor.svgCanvas;
  activeEditingContext?.commit();
  const existing = findExistingTypeOnPath(shapeEl);
  if (existing) {
    sc.clearSelection();
    sc.addToSelection([existing], true);
    startDirectInPlaceEdit(svgEditor, existing);
    return existing;
  }
  const batch = new sc.history.BatchCommand('Create type on path');
  let pathEl = shapeEl;
  if (shapeEl.localName !== 'path') {
    pathEl = document.createElementNS(SVG_NS, 'path');
    for (const attr of shapeEl.attributes) pathEl.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
    pathEl.setAttribute('d', shapeToPathD(shapeEl));
    const parent = shapeEl.parentNode, next = shapeEl.nextSibling;
    shapeEl.replaceWith(pathEl);
    batch.addSubCommand(new sc.history.RemoveElementCommand(shapeEl, next, parent));
    batch.addSubCommand(new sc.history.InsertElementCommand(pathEl));
  }
  const sourceBefore = captureAttributes([pathEl]);
  const { family, size, fill, letterSpacing, wordSpacing, fontWeight, fontStyle } = readTextStyle(svgEditor);
  const content = opts.content != null ? String(opts.content) : 'Lorem Ipsum';
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
  if (letterSpacing != null && letterSpacing !== '' && letterSpacing !== '0' && letterSpacing !== 0) {
    text.setAttribute('letter-spacing', String(letterSpacing));
  }
  if (wordSpacing != null && wordSpacing !== '' && wordSpacing !== '0' && wordSpacing !== 0) {
    text.setAttribute('word-spacing', String(wordSpacing));
  }
  if (fontWeight != null && fontWeight !== '') {
    text.setAttribute('font-weight', String(fontWeight));
  }
  if (fontStyle != null && fontStyle !== '') {
    text.setAttribute('font-style', String(fontStyle));
  }
  text.setAttribute('text-anchor', align === 'middle' ? 'middle' : (align === 'end' ? 'end' : 'start'));
  text.setAttribute('xml:space', 'preserve');

  const alignPath = opts.alignPath || 'baseline';
  const baselineMap = {
    baseline: 'alphabetic',
    ascender: 'hanging',
    center: 'middle',
    descender: 'ideographic',
  };
  const db = baselineMap[alignPath] || 'alphabetic';
  text.setAttribute('dominant-baseline', db);
  text.setAttribute('alignment-baseline', db);
  text.setAttribute('data-visteras-align-path', alignPath);

  const textPath = document.createElementNS(SVG_NS, 'textPath');
  if (typeof sc.getNextId === 'function') textPath.setAttribute('id', sc.getNextId());
  setTextPathHref(textPath, hrefId);
  textPath.setAttribute('dominant-baseline', db);
  textPath.setAttribute('alignment-baseline', db);

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

  applyPathBaseline(text, textPath, alignPath);
  const parent = pathEl.parentNode;
  if (pathEl.nextSibling) parent.insertBefore(text, pathEl.nextSibling);
  else parent.appendChild(text);

  // Path loses stroke and fill; thin 1px blue line on hover
  setupPathHoverEffects(pathEl, text);

  // Bounding box matches the underlying path itself, not larger
  attachPathBBoxProxy(text, pathEl);

  if (sc.history?.InsertElementCommand && typeof sc.addCommandToHistory === 'function') {
    const old = sourceBefore[0].attrs;
    const attrs = {};
    for (const name of new Set([...Object.keys(old), ...[...pathEl.attributes].map(a => a.name)])) attrs[name] = old[name] ?? null;
    batch.addSubCommand(new sc.history.ChangeElementCommand(pathEl, attrs));
    batch.addSubCommand(new sc.history.InsertElementCommand(text));
    sc.addCommandToHistory(batch);
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

  // Directly start in-place text editing on the artboard
  setTimeout(() => {
    if (text.isConnected) startDirectInPlaceEdit(svgEditor, text);
  }, 40);

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

export function findExistingTypeOnPath(el) {
  if (!el) return null;

  if (isTypeOnPathText(el)) {
    return el.nodeName === 'text' ? el : el.closest?.('text');
  }

  const id = el.id;
  if (id) {
    const root = el.ownerSVGElement || document.getElementById('svgcontent') || document;
    const textPaths = root.querySelectorAll ? root.querySelectorAll('textPath') : [];
    for (const tp of textPaths) {
      const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
      if (href === id || href === `${id}_rev` || href.replace(/_rev$/, '') === id.replace(/_rev$/, '')) {
        const text = tp.closest?.('text');
        if (text) return text;
      }
    }
  }

  if (el.hasAttribute?.('data-visteras-top-source') || el.classList?.contains?.('visteras-type-on-path-source')) {
    const root = el.ownerSVGElement || document.getElementById('svgcontent') || document;
    const allTopTexts = root.querySelectorAll ? root.querySelectorAll(`text.${TOP_CLASS}, text[${TOP_ATTR}]`) : [];
    for (const t of allTopTexts) {
      const tp = t.querySelector('textPath');
      if (tp) {
        const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
        const baseId = href.replace(/_rev$/, '');
        if (baseId && baseId === el.id) return t;
      }
    }
  }

  return null;
}

function ensureOptionsPanel() {
  return document.getElementById('sec_type_on_path');
}

function syncOptionsPanel(svgEditor) {
  const panel = ensureOptionsPanel();
  if (!panel) return;
  let el = getSelected(svgEditor);
  if (el && !isTypeOnPathText(el)) {
    const companion = findExistingTypeOnPath(el);
    if (companion) el = companion;
  }
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
  const normAlign = (ta === 'middle' || ta === 'end') ? ta : 'start';
  const alignSelect = panel.querySelector('#top_align');
  if (alignSelect) {
    alignSelect.value = normAlign;
  }
  const alignBtns = panel.querySelectorAll('.top-align-btn');
  for (const btn of alignBtns) {
    const isActive = btn.dataset.align === normAlign;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }

  const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
  const reverseCheck = panel.querySelector('#top_reverse');
  if (reverseCheck) {
    reverseCheck.checked = /_rev$/.test(href);
  }

  const textEl = tp.parentElement;
  const alignPath = panel.querySelector('#top_align_path');
  if (alignPath) {
    let mode = textEl?.getAttribute('data-visteras-align-path');
    if (!mode) {
      const db = tp.getAttribute('dominant-baseline') || textEl?.getAttribute('dominant-baseline') || '';
      if (db === 'hanging' || db === 'text-before-edge' || db === 'text-top') mode = 'ascender';
      else if (db === 'middle' || db === 'central') mode = 'center';
      else if (db === 'ideographic' || db === 'text-after-edge' || db === 'text-bottom') mode = 'descender';
      else {
        const dyRaw = tp.getAttribute('dy') || textEl?.getAttribute('dy') || '0';
        const dy = parseFloat(String(dyRaw)) || 0;
        const fontSize = parseFloat(textEl?.getAttribute('font-size') || '24') || 24;
        const ratio = dy / fontSize;
        if (Math.abs(ratio + 0.8) < 0.15) mode = 'ascender';
        else if (Math.abs(ratio + 0.35) < 0.15) mode = 'center';
        else if (Math.abs(ratio - 0.25) < 0.15) mode = 'descender';
        else mode = 'baseline';
      }
    }
    alignPath.value = mode;
  }

  const tracking = panel.querySelector('#top_tracking');
  const trackingVal = panel.querySelector('#top_tracking_val');
  const ls = parseFloat(textEl?.getAttribute('letter-spacing') || '0') || 0;
  if (tracking) tracking.value = String(Math.round(ls));
  if (trackingVal) trackingVal.textContent = String(Math.round(ls));
}

function wireOptionsPanel(svgEditor) {
  const panel = ensureOptionsPanel();
  if (!panel || panel.dataset.wired === '1') return;
  panel.dataset.wired = '1';

  const offsetSlider = panel.querySelector('#top_offset');
  const offsetVal = panel.querySelector('#top_offset_val');
  const alignSelect = panel.querySelector('#top_align');
  const reverseCheck = panel.querySelector('#top_reverse');
  const alignPath = panel.querySelector('#top_align_path');
  const tracking = panel.querySelector('#top_tracking');
  const trackingVal = panel.querySelector('#top_tracking_val');

  let offsetBefore, trackingBefore;
  offsetSlider?.addEventListener('input', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    offsetBefore ||= captureAttributes([tp]);
    const v = e.target.value;
    if (offsetVal) offsetVal.textContent = `${v}%`;
    tp.setAttribute('startOffset', `${v}%`);
  });
  offsetSlider?.addEventListener('change', (e) => {
    if (offsetBefore) recordAttributes(svgEditor.svgCanvas, offsetBefore, 'Offset path text');
    offsetBefore = null;
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    svgEditor.svgCanvas?.call?.('changed', [tp.parentElement]);
  });

  function setTypeOnPathAlign(align) {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const before = captureAttributes([tp, tp.parentElement]);
    const a = (align === 'middle' || align === 'center') ? 'middle' : (align === 'end' || align === 'right') ? 'end' : 'start';
    for (const el of [tp, tp.parentElement]) {
      for (const attr of ['x','y','dx']) el.removeAttribute(attr);
    }
    tp.setAttribute('text-anchor', a);
    tp.parentElement?.setAttribute('text-anchor', a);
    if (a === 'middle') {
      tp.setAttribute('startOffset', '50%');
      if (offsetSlider) offsetSlider.value = '50';
      if (offsetVal) offsetVal.textContent = '50%';
    } else if (a === 'end') {
      tp.setAttribute('startOffset', '100%');
      if (offsetSlider) offsetSlider.value = '100';
      if (offsetVal) offsetVal.textContent = '100%';
    } else {
      tp.setAttribute('startOffset', '0%');
      if (offsetSlider) offsetSlider.value = '0';
      if (offsetVal) offsetVal.textContent = '0%';
    }
    const alignBtns = panel.querySelectorAll('.top-align-btn');
    for (const btn of alignBtns) {
      const isActive = btn.dataset.align === a;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
    if (alignSelect) {
      alignSelect.value = a;
    }
    recordAttributes(svgEditor.svgCanvas, before, 'Align path text');
    svgEditor.svgCanvas?.call?.('changed', [tp.parentElement]);
  }

  const alignBtns = panel.querySelectorAll('.top-align-btn');
  for (const btn of alignBtns) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setTypeOnPathAlign(btn.dataset.align);
    });
  }

  alignSelect?.addEventListener('change', (e) => {
    setTypeOnPathAlign(e.target.value);
  });

  function applyAlignToPath(mode) {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const textEl = tp.parentElement;
    const before = captureAttributes([textEl, tp]);
    applyPathBaseline(textEl, tp, mode);
    recordAttributes(svgEditor.svgCanvas, before, 'Align text to path');

    svgEditor.svgCanvas?.call?.('changed', [textEl || tp]);
  }

  alignPath?.addEventListener('change', (e) => {
    applyAlignToPath(e.target.value);
  });

  tracking?.addEventListener('input', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const textEl = tp.parentElement;
    trackingBefore ||= captureAttributes([textEl]);
    const v = e.target.value;
    if (trackingVal) trackingVal.textContent = v;
    textEl?.setAttribute('letter-spacing', v);
    const lsInput = document.getElementById('tool_letter_spacing');
    if (lsInput) lsInput.value = v;
    svgEditor.svgCanvas?.setCurText?.('letter_spacing', v);
  });
  tracking?.addEventListener('change', () => {
    if (trackingBefore) recordAttributes(svgEditor.svgCanvas, trackingBefore, 'Track path text');
    trackingBefore = null;
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
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
    const before = captureAttributes([tp]);
    const existingReverse = document.getElementById(`${baseId}_rev`);
    const newId = e.target.checked ? ensureReversedClone(sc, pathEl, baseId) : baseId;
    setTextPathHref(tp, newId);
    recordAttributes(sc, before, 'Reverse path text', e.target.checked && !existingReverse ? [document.getElementById(newId)] : []);
    sc.call?.('changed', [tp.parentElement]);
  });
}

function disarmTypeOnPathMode(svgEditor) {
  svgEditor._waitingForTypeOnPath = false;
  document.body.classList.remove('visteras-top-mode-active');
  document.getElementById('visteras_app_container')?.classList.remove('visteras-top-mode-active');
  document.getElementById('workarea')?.classList.remove('visteras-top-mode-active');
  document.getElementById('svgcanvas')?.classList.remove('visteras-top-mode-active');

  const hovered = document.querySelectorAll('.visteras-top-mode-hover-target, .visteras-top-hovered');
  hovered.forEach(el => {
    el.classList.remove('visteras-top-mode-hover-target');
    if (!el.classList.contains('visteras-top-selected')) {
      el.classList.remove('visteras-top-hovered');
      if (el.classList.contains('visteras-type-on-path-source')) {
        el.style.stroke = 'transparent';
        el.style.strokeWidth = '1px';
      }
    }
  });

  if (svgEditor._topPointerDownHandler) {
    window.removeEventListener('pointerdown', svgEditor._topPointerDownHandler, true);
    svgEditor._topPointerDownHandler = null;
  }
  if (svgEditor._topPointerMoveHandler) {
    window.removeEventListener('pointermove', svgEditor._topPointerMoveHandler, true);
    svgEditor._topPointerMoveHandler = null;
  }
  if (svgEditor._topKeyDownHandler) {
    window.removeEventListener('keydown', svgEditor._topKeyDownHandler, true);
    svgEditor._topKeyDownHandler = null;
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

  svgEditor._waitingForTypeOnPath = true;
  document.body.classList.add('visteras-top-mode-active');
  document.getElementById('visteras_app_container')?.classList.add('visteras-top-mode-active');
  document.getElementById('workarea')?.classList.add('visteras-top-mode-active');
  document.getElementById('svgcanvas')?.classList.add('visteras-top-mode-active');

  const btn = document.getElementById('tool_type_on_path');
  if (btn) btn.setAttribute('pressed', 'true');
  showToast('Click a path or shape to place type on it.');

  let lastHovered = null;

  const onPointerMove = (evt) => {
    if (!svgEditor._waitingForTypeOnPath) return;

    if (evt.target.closest?.('#sidepanels, #tools_left, #menu_bar, .menu_bar, #tools_top, #properties_panel, #vdock, #vdock_flyout')) {
      if (lastHovered) {
        lastHovered.classList.remove('visteras-top-mode-hover-target');
        if (!lastHovered.classList.contains('visteras-top-selected')) {
          lastHovered.classList.remove('visteras-top-hovered');
          if (lastHovered.classList.contains('visteras-type-on-path-source')) {
            lastHovered.style.stroke = 'transparent';
            lastHovered.style.strokeWidth = '1px';
          }
        }
        lastHovered = null;
      }
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
    if (!target) target = findPathLike(evt.target);

    if (target !== lastHovered) {
      if (lastHovered) {
        lastHovered.classList.remove('visteras-top-mode-hover-target');
        if (!lastHovered.classList.contains('visteras-top-selected')) {
          lastHovered.classList.remove('visteras-top-hovered');
          if (lastHovered.classList.contains('visteras-type-on-path-source')) {
            lastHovered.style.stroke = 'transparent';
            lastHovered.style.strokeWidth = '1px';
          }
        }
      }
      lastHovered = target;
      if (target) {
        target.classList.add('visteras-top-mode-hover-target');
        if (target.classList.contains('visteras-type-on-path-source') && !target.classList.contains('visteras-top-selected')) {
          target.classList.add('visteras-top-hovered');
          target.style.stroke = STUDIO_BLUE;
          target.style.strokeWidth = '1px';
        }
      }
    }
  };

  const onPointerDown = (evt) => {
    if (!svgEditor._waitingForTypeOnPath) return;

    if (evt.target.closest?.('#sidepanels, #tools_left, #menu_bar, .menu_bar, #tools_top, #properties_panel, #vdock, #vdock_flyout')) {
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

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && svgEditor._waitingForTypeOnPath) {
      disarmTypeOnPathMode(svgEditor);
      showToast('Type on Path cancelled.');
    }
  };

  svgEditor._topPointerMoveHandler = onPointerMove;
  svgEditor._topPointerDownHandler = onPointerDown;
  svgEditor._topKeyDownHandler = onKeyDown;

  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
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
 * to enforce Studio-parity bounding box size matching the path itself,
 * single-line outline, and 8 square corner & midpoint handles.
 */
function hookSelectorManager(svgEditor) {
  const sc = svgEditor.svgCanvas;
  if (!sc) return;

  const sm = sc.selectorManager;
  const HANDLE_SIZE = 7; // Studio handle size in screen px

  const ROTATE_CURSOR_CSS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='%23ffffff' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round' d='M 17 5.9 A 8 8 0 1 0 18.9 17.1'/%3E%3Cpath fill='%23ffffff' stroke='%23ffffff' stroke-width='2.8' stroke-linejoin='round' d='M 19 18.5 L 21.6 13.6 L 16 16.1 Z'/%3E%3Cpath fill='none' stroke='%23000000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M 17 5.9 A 8 8 0 1 0 18.9 17.1'/%3E%3Cpath fill='%23000000' stroke='%23000000' stroke-width='0.9' stroke-linejoin='round' d='M 19 18.5 L 21.6 13.6 L 16 16.1 Z'/%3E%3C/svg%3E") 12 12, auto`;

  const transformGripsToSquares = () => {
    if (!sm || !sm.selectorGripsGroup) return;
    const gripKeys = ['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'];
    const cornerKeys = ['nw', 'ne', 'se', 'sw'];
    const dataStorage = (typeof sc.getDataStorage === 'function') ? sc.getDataStorage() : null;

    if (!sm.rotateCornerGrips) {
      sm.rotateCornerGrips = {};
    }

    const ROT_ZONE_SIZE = 26;

    cornerKeys.forEach((k) => {
      let rotGrip = sm.rotateCornerGrips[k];
      if (!rotGrip || !rotGrip.parentNode) {
        rotGrip = document.createElementNS(SVG_NS, 'rect');
        rotGrip.id = 'selectorGrip_rotate_corner_' + k;
        rotGrip.setAttribute('width', String(ROT_ZONE_SIZE));
        rotGrip.setAttribute('height', String(ROT_ZONE_SIZE));
        rotGrip.setAttribute('fill', 'transparent');
        rotGrip.setAttribute('stroke', 'none');
        rotGrip.setAttribute('style', `cursor:${ROTATE_CURSOR_CSS} !important; pointer-events:all;`);

        if (dataStorage) {
          dataStorage.put(rotGrip, 'dir', k);
          dataStorage.put(rotGrip, 'type', 'rotate');
        }

        // Insert before resize handles so direct corner square handles sit on top
        sm.selectorGripsGroup.insertBefore(rotGrip, sm.selectorGripsGroup.firstChild);
        sm.rotateCornerGrips[k] = rotGrip;
      }
    });

    const updateCornerRotatePos = (k, cx, cy) => {
      const rotGrip = sm.rotateCornerGrips && sm.rotateCornerGrips[k];
      if (!rotGrip) return;
      const offX = k.includes('w') ? -4 : 4;
      const offY = k.includes('n') ? -4 : 4;
      rotGrip.setAttribute('x', String(cx - ROT_ZONE_SIZE / 2 + offX));
      rotGrip.setAttribute('y', String(cy - ROT_ZONE_SIZE / 2 + offY));
    };

    gripKeys.forEach((k) => {
      let existingGrip = sm.selectorGrips[k];
      if (!existingGrip) return;

      let rect = existingGrip;
      if (existingGrip.nodeName.toLowerCase() !== 'rect') {
        rect = document.createElementNS(SVG_NS, 'rect');
        rect.id = existingGrip.id;
        rect.setAttribute('width', String(HANDLE_SIZE));
        rect.setAttribute('height', String(HANDLE_SIZE));
        rect.setAttribute('fill', '#ffffff');
        rect.setAttribute('stroke', '#3f8ff7');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        rect.setAttribute('style', `cursor:${k}-resize; pointer-events:all;`);

        if (dataStorage) {
          dataStorage.put(rect, 'dir', k);
          dataStorage.put(rect, 'type', 'resize');
        }

        existingGrip.replaceWith(rect);
        sm.selectorGrips[k] = rect;
      }

      if (!rect._visterasCenterHooked) {
        rect._visterasCenterHooked = true;
        const origSetAttr = rect.setAttribute.bind(rect);
        rect.setAttribute = function(name, val) {
          if (name === 'cx') {
            const num = parseFloat(val);
            origSetAttr('x', isNaN(num) ? val : String(num - HANDLE_SIZE / 2));
            if (cornerKeys.includes(k) && !isNaN(num)) {
              updateCornerRotatePos(k, num, parseFloat(rect.getAttribute('y') || 0) + HANDLE_SIZE / 2);
            }
          } else if (name === 'cy') {
            const num = parseFloat(val);
            origSetAttr('y', isNaN(num) ? val : String(num - HANDLE_SIZE / 2));
            if (cornerKeys.includes(k) && !isNaN(num)) {
              updateCornerRotatePos(k, parseFloat(rect.getAttribute('x') || 0) + HANDLE_SIZE / 2, num);
            }
          } else {
            origSetAttr(name, val);
          }
        };
      }
    });

    // Hide old rotate connector stem and rotate circle grip (Studio parity: square handles with corner hover rotation)
    if (sm.rotateGripConnector) {
      sm.rotateGripConnector.style.display = 'none';
      sm.rotateGripConnector.setAttribute('display', 'none');
    }
    if (sm.rotateGrip) {
      sm.rotateGrip.style.display = 'none';
      sm.rotateGrip.setAttribute('display', 'none');
    }
  };

  if (sm && typeof sm.requestSelector === 'function' && !sm._visterasHooked) {
    sm._visterasHooked = true;
    transformGripsToSquares();

    const origInitGroup = sm.initGroup ? sm.initGroup.bind(sm) : null;
    if (origInitGroup) {
      sm.initGroup = function() {
        origInitGroup();
        transformGripsToSquares();
      };
    }

    const origRequestSelector = sm.requestSelector.bind(sm);
    sm.requestSelector = function(elem, bbox) {
      transformGripsToSquares();
      if (elem?.querySelector?.('textPath')) {
        installPathTextBounds(sc.getSvgContent());
        bbox = elem.getBBox();
      }
      const sel = origRequestSelector(elem, bbox);
      if (sel && bbox) {
        sel.resize(bbox);
      }
      return sel;
    };
  }


}

/**
 * Hook into SVG-Edit dimension recalculation and transformation remapping
 * so that scaling and moving scale/move the underlying path and font-size proportionately.
 */
function hookRemapAndDimensions(svgEditor) {
  const sc = svgEditor.svgCanvas;
  if (!sc) return;

  // Text-on-path moves with its own transform. Rewriting source geometry here
  // applied movement twice and left changes outside the native undo command.
  // Hook deleteSelectedElements to clean up bound paths
  if (typeof sc.deleteSelectedElements === 'function' && !sc._topDeleteHooked) {
    sc._topDeleteHooked = true;
    const origDelete = sc.deleteSelectedElements.bind(sc);
    sc.deleteSelectedElements = function() {
      const selected = (typeof sc.getSelectedElements === 'function') ? sc.getSelectedElements().filter(Boolean) : [];
      const batch = new sc.history.BatchCommand('Delete path text');
      const bound = new Set();
      for (const el of selected) {
        const text = findExistingTypeOnPath(el);
        const tp = text?.querySelector('textPath');
        if (!tp) continue;
        bound.add(text);
        const id = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '').replace(/_rev$/, '');
        for (const nodeId of [id, `${id}_rev`]) {
          const node = document.getElementById(nodeId);
          if (node && (node.hasAttribute('data-visteras-top-source') || node.hasAttribute('data-visteras-textpath-rev-of'))) bound.add(node);
        }
      }
      for (const el of bound) {
        if (selected.includes(el)) continue;
        batch.addSubCommand(new sc.history.RemoveElementCommand(el, el.nextSibling, el.parentNode));
        el.remove();
      }
      // Include native deletion in the same undo step as its bound geometry.
      const addHistory = sc.addCommandToHistory;
      sc.addCommandToHistory = command => batch.addSubCommand(command);
      let res;
      try { res = origDelete(); }
      finally { sc.addCommandToHistory = addHistory; }
      if (!batch.isEmpty()) addHistory.call(sc, batch);
      if (typeof window.__updatePropertiesVisibility === 'function') {
        window.__updatePropertiesVisibility();
      }
      return res;
    };
  }

  // Global Backspace and Delete key listener for deleting selected canvas objects
  if (!window._visterasGlobalDeleteHooked) {
    window._visterasGlobalDeleteHooked = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (activeEditingContext) return;
        const target = e.target;
        if (target) {
          const tag = target.tagName?.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return;
          if (target.shadowRoot?.activeElement) {
            const shadowTag = target.shadowRoot.activeElement.tagName?.toLowerCase();
            if (shadowTag === 'input' || shadowTag === 'textarea' || shadowTag === 'select') return;
          }
        }
        const selected = (typeof sc.getSelectedElements === 'function') ? sc.getSelectedElements().filter(Boolean) : [];
        if (selected.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          sc.deleteSelectedElements();
        }
      }
    }, true);
  }
}

/**
 * Syncs selection state between textPath and attached source paths
 * so that when selected, hover outlines are suppressed (single-line bounding box).
 */
function syncSelectionState(svgEditor) {
  const sc = svgEditor.svgCanvas;
  if (!sc) return;
  const selectedElems = (typeof sc.getSelectedElements === 'function') ? sc.getSelectedElements() : [];
  const allSourcePaths = document.querySelectorAll('.visteras-type-on-path-source');
  allSourcePaths.forEach((path) => {
    path.classList.remove('visteras-top-selected', 'visteras-top-hovered');
    path.style.stroke = 'transparent';
    path.style.strokeWidth = '1px';
  });

  selectedElems.forEach((el) => {
    if (!el) return;
    const tp = el.querySelector ? el.querySelector('textPath') : null;
    if (tp) {
      const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
      const baseId = href.replace(/_rev$/, '');
      const pathEl = (typeof sc.getElement === 'function' && sc.getElement(baseId)) || document.getElementById(baseId);
      if (pathEl) {
        pathEl.classList.add('visteras-top-selected');
        pathEl.classList.remove('visteras-top-hovered');
        pathEl.style.stroke = 'transparent';
        pathEl.style.strokeWidth = '1px';
      }
    }
  });
}

/**
 * Mounts and manages the Illustrator-style Fill & Stroke toolbar color swatches
 */
/**
 * Toolbar fill/stroke swatches moved to visteras-color-system.js.
 * Kept as a no-op so older callers do not double-mount competing UI.
 * @param {any} _svgEditor
 */
function mountToolbarColorSwatches(_svgEditor) {
  // Color system mounts toolbar swatches + shared __visterasColorTarget.
  // If color system is unavailable, log once for diagnostics.
  if (!window.__visterasColorSystemMounted && !window.__visterasColorSystem) {
    console.info('[visteras-type-on-path] toolbar colors deferred to color-system mount');
  }
}

export function mountVisterasTypeOnPath(opts = {}) {
  const svgEditor = opts.svgEditor;
  if (!svgEditor) return;

  // Toolbar button insertion
  const tryToolbar = () => {
    injectToolbarButton(svgEditor);
    // Fill/Stroke toolbar swatches: owned by mountVisterasColorSystem
  };
  tryToolbar();
  setTimeout(tryToolbar, 100);
  setTimeout(tryToolbar, 500);

  wireOptionsPanel(svgEditor);
  hookSelectorManager(svgEditor);
  hookRemapAndDimensions(svgEditor);
  // Select All must not transform an invisible reference path alongside text.
  for (const method of ['selectOnly', 'addToSelection']) {
    const original = svgEditor.svgCanvas[method];
    svgEditor.svgCanvas[method] = function(elements, ...args) {
      return original.call(this, [...elements].filter(el => !el?.hasAttribute?.('data-visteras-top-source')), ...args);
    };
  }

  const root = svgEditor.svgCanvas.getSvgContent();
  installPathTextBounds(root);
  new MutationObserver(() => installPathTextBounds(root)).observe(root, {childList:true,subtree:true});


  // The main menu delegates to this callback in index.html.
  window.__visterasTypeOnPath = () => armTypeOnPathMode(svgEditor);
  window.__visterasSyncTypeOnPath = () => syncOptionsPanel(svgEditor);

  // Hook into SVG-Edit selection events
  const sc = svgEditor.svgCanvas;
  if (sc && typeof sc.bind === 'function') {
    sc.bind('selectedChanged', () => {
      syncSelectionState(svgEditor);
      syncOptionsPanel(svgEditor);
    });
    sc.bind('elementChanged', () => {
      syncSelectionState(svgEditor);
      syncOptionsPanel(svgEditor);
    });
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

