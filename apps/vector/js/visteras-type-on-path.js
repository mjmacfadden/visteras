/**
 * Visteras Vector — Type on Path (practical Illustrator-style textPath).
 * Client-side: binds editable <text>/<textPath> to a selected path-like shape.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const TOP_ATTR = 'data-visteras-type-on-path';
const TOP_CLASS = 'visteras-type-on-path';

function showToast(message, ms = 4000) {
  let el = document.getElementById('visteras_top_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_top_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'max-width:min(440px,90vw)', 'padding:10px 14px',
      'background:#1e1e1e', 'color:#eee', 'border:1px solid #fa7c1b',
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

function getSelected(svgEditor) {
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

/** Sample path length and rebuild reversed polyline (works for most shapes). */
function buildReversedPathD(pathEl) {
  try {
    const tmp = pathEl.cloneNode(true);
    // For non-path shapes, convert via getTotalLength if available after append
    if (tmp.nodeName.toLowerCase() !== 'path') {
      // Create a temporary path using stroke outline approx — skip if no d
      return null;
    }
    const holder = document.createElementNS(SVG_NS, 'svg');
    holder.setAttribute('width', '0');
    holder.setAttribute('height', '0');
    holder.style.cssText = 'position:absolute;left:-9999px;opacity:0;';
    document.body.appendChild(holder);
    holder.appendChild(tmp);
    const len = tmp.getTotalLength();
    if (!len || !isFinite(len)) {
      holder.remove();
      return null;
    }
    const steps = Math.max(24, Math.min(180, Math.round(len / 3)));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const p = tmp.getPointAtLength((i / steps) * len);
      pts.push([+p.x.toFixed(2), +p.y.toFixed(2)]);
    }
    holder.remove();
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
    // Fallback: clone as-is (reverse won't change direction)
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

function createTypeOnPath(svgEditor, pathEl, opts = {}) {
  const sc = svgEditor.svgCanvas;
  const { family, size, fill } = readTextStyle(svgEditor);
  const content = opts.content || 'Type on path';
  const align = opts.align || 'start';
  const reverse = !!opts.reverse;

  const pathId = ensureId(sc, pathEl);
  let hrefId = pathId;
  if (reverse) hrefId = ensureReversedClone(sc, pathEl, pathId);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('id', ensureId(sc, text) || sc.getNextId());
  if (!text.getAttribute('id') && typeof sc.getNextId === 'function') {
    text.setAttribute('id', sc.getNextId());
  }
  text.setAttribute('class', TOP_CLASS);
  text.setAttribute(TOP_ATTR, '1');
  text.setAttribute('fill', fill);
  text.setAttribute('stroke', 'none');
  text.setAttribute('font-family', family);
  text.setAttribute('font-size', String(size));
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

  const parent = pathEl.parentNode;
  if (pathEl.nextSibling) parent.insertBefore(text, pathEl.nextSibling);
  else parent.appendChild(text);

  if (sc.history?.InsertElementCommand && sc.addCommandToHistory) {
    try { sc.addCommandToHistory(new sc.history.InsertElementCommand(text)); } catch (_) {}
  } else if (typeof sc.addCommandToHistory === 'function' && sc.history?.InsertElementCommand) {
    try { sc.addCommandToHistory(new sc.history.InsertElementCommand(text)); } catch (_) {}
  }

  if (typeof sc.selectOnly === 'function') sc.selectOnly([text]);
  else if (typeof sc.selectOnly === 'function') sc.selectOnly([text]);
  svgEditor.topPanel?.updateContextPanel?.();
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
  return !!(text && text.getAttribute(TOP_ATTR) === '1');
}

function ensureOptionsPanel() {
  let panel = document.getElementById('visteras_top_options');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'visteras_top_options';
  panel.style.cssText = [
    'display:none', 'padding:8px 10px', 'border-top:1px solid #333',
    'background:#2a2a2a', 'font-size:11px', 'color:#ccc',
  ].join(';');
  panel.innerHTML = `
    <div style="font-size:11px;font-weight:600;color:#fa7c1b;margin-bottom:6px;">Type on Path</div>
    <label style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;">
      <span>Text</span>
      <input id="top_text_content" type="text" style="height:26px;background:#1e1e1e;border:1px solid #555;color:#eee;border-radius:4px;padding:0 8px;" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;">
      <span>Start offset <span id="top_offset_val">0%</span></span>
      <input id="top_offset" type="range" min="0" max="100" value="0" style="width:100%;accent-color:#fa7c1b;" />
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;">
      <span>Align</span>
      <select id="top_align" style="height:26px;background:#1e1e1e;border:1px solid #555;color:#eee;border-radius:4px;">
        <option value="start">Start</option>
        <option value="middle">Center</option>
        <option value="end">End</option>
      </select>
    </label>
    <label style="display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer;">
      <input type="checkbox" id="top_reverse" style="accent-color:#fa7c1b;" /> Reverse path direction
    </label>
    <p style="font-size:10px;color:#888;margin:6px 0 0;line-height:1.35;">
      Font family/size follow the Text tools. Double-click canvas text to edit when the host supports it.
    </p>
  `;
  const props = document.getElementById('prop_active_container')
    || document.querySelector('#properties_panel, .properties_panel, #panels');
  if (props) props.appendChild(panel);
  else document.body.appendChild(panel);
  return panel;
}

function syncOptionsPanel(svgEditor) {
  const panel = ensureOptionsPanel();
  const el = getSelected(svgEditor);
  const tp = findTextPath(el);
  const on = !!(tp && isTypeOnPathText(tp.parentElement || el));
  panel.style.display = on ? 'block' : 'none';
  if (!on || !tp) return;

  panel.querySelector('#top_text_content').value = tp.textContent || '';
  const so = tp.getAttribute('startOffset') || '0%';
  const pct = Math.max(0, Math.min(100, parseFloat(String(so).replace('%', '')) || 0));
  panel.querySelector('#top_offset').value = String(pct);
  panel.querySelector('#top_offset_val').textContent = `${pct}%`;
  const ta = tp.getAttribute('text-anchor') || 'start';
  panel.querySelector('#top_align').value = (ta === 'middle' || ta === 'end') ? ta : 'start';
  const href = (tp.getAttribute('href') || tp.getAttributeNS(XLINK_NS, 'href') || '').replace(/^#/, '');
  panel.querySelector('#top_reverse').checked = /_rev$/.test(href);
}

function wireOptionsPanel(svgEditor) {
  const panel = ensureOptionsPanel();
  if (panel.dataset.wired === '1') return;
  panel.dataset.wired = '1';

  const applyText = () => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    tp.textContent = panel.querySelector('#top_text_content').value;
  };
  panel.querySelector('#top_text_content').addEventListener('change', applyText);
  panel.querySelector('#top_text_content').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyText();
  });

  panel.querySelector('#top_offset').addEventListener('input', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const v = e.target.value;
    panel.querySelector('#top_offset_val').textContent = `${v}%`;
    tp.setAttribute('startOffset', `${v}%`);
  });

  panel.querySelector('#top_align').addEventListener('change', (e) => {
    const tp = findTextPath(getSelected(svgEditor));
    if (!tp) return;
    const align = e.target.value;
    tp.setAttribute('text-anchor', align);
    if (align === 'middle') tp.setAttribute('startOffset', '50%');
    else if (align === 'end') tp.setAttribute('startOffset', '100%');
    else tp.setAttribute('startOffset', `${panel.querySelector('#top_offset').value}%`);
    const pct = parseFloat(String(tp.getAttribute('startOffset')).replace('%', '')) || 0;
    panel.querySelector('#top_offset').value = String(pct);
    panel.querySelector('#top_offset_val').textContent = `${pct}%`;
  });

  panel.querySelector('#top_reverse').addEventListener('change', (e) => {
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
  });
}

function armTypeOnPathMode(svgEditor) {
  const el = getSelected(svgEditor);
  if (isPathLike(el) && !svgEditor.multiselected) {
    createTypeOnPath(svgEditor, el);
    showToast('Text on path created. Edit content in Properties; font uses Text tools.');
    return;
  }

  showToast('Click a path (line, polyline, polygon, circle…) to place text on it.');
  const sc = svgEditor.svgCanvas;
  const root = (typeof sc.getContentElem === 'function' && sc.getContentElem())
    || document.getElementById('svgcontent');
  if (!root) return;

  if (svgEditor._visterasTopClick) {
    root.removeEventListener('click', svgEditor._visterasTopClick, true);
  }
  const onClick = (evt) => {
    let t = evt.target;
    while (t && t !== root && !isPathLike(t)) t = t.parentNode;
    if (!isPathLike(t)) {
      showToast('Click a path-like shape.');
      return;
    }
    root.removeEventListener('click', onClick, true);
    svgEditor._visterasTopClick = null;
    createTypeOnPath(svgEditor, t);
    showToast('Text on path created. Edit content in Properties; font uses Text tools.');
  };
  svgEditor._visterasTopClick = onClick;
  root.addEventListener('click', onClick, true);
}

function injectTextMenu() {
  if (document.getElementById('menu_text')) return;
  const help = document.getElementById('menu_help');
  const entry = document.createElement('div');
  entry.className = 'menu_entry';
  entry.id = 'menu_text';
  entry.innerHTML = `
    <div class="menu_entry_title">Text</div>
    <div class="menu_dropdown_list">
      <div class="menu_dropdown_item" id="action_type_on_path" title="Place editable text along a path">Type on Path…</div>
    </div>
  `;
  if (help?.parentNode) help.parentNode.insertBefore(entry, help);
  else document.querySelector('.menu_bar, .menu_left, nav')?.appendChild(entry);
}

function injectObjectMenuItem(svgEditor) {
  if (document.getElementById('action_type_on_path_object')) return;
  const flip = document.getElementById('action_flip_v');
  if (!flip?.parentNode) return;
  const sep = document.createElement('div');
  sep.className = 'menu_dropdown_separator';
  const item = document.createElement('div');
  item.className = 'menu_dropdown_item';
  item.id = 'action_type_on_path_object';
  item.title = 'Place editable text along a path';
  item.textContent = 'Type on Path…';
  flip.parentNode.insertBefore(sep, flip.nextSibling);
  flip.parentNode.insertBefore(item, sep.nextSibling);
  item.addEventListener('click', () => armTypeOnPathMode(svgEditor));
}

function injectToolbarButton(svgEditor) {
  if (document.getElementById('tool_type_on_path')) return;
  const btn = document.createElement('div');
  btn.id = 'tool_type_on_path';
  btn.setAttribute('title', 'Type on Path');
  btn.setAttribute('role', 'button');
  btn.style.cssText = [
    'display:flex', 'align-items:center', 'justify-content:center',
    'width:28px', 'height:28px', 'margin:2px', 'cursor:pointer',
    'border-radius:4px', 'color:#ddd', 'font-size:10px', 'font-weight:700',
    'border:1px solid transparent', 'user-select:none',
  ].join(';');
  btn.innerHTML = '<span style="letter-spacing:-0.5px;">T╱</span>';
  btn.addEventListener('click', () => armTypeOnPathMode(svgEditor));
  const textTool = document.getElementById('tool_text');
  if (textTool?.parentNode) textTool.parentNode.insertBefore(btn, textTool.nextSibling);
  else document.getElementById('tools_left')?.appendChild(btn);
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasTypeOnPath(opts = {}) {
  const svgEditor = opts.svgEditor;
  if (!svgEditor) return;
  injectTextMenu();
  injectObjectMenuItem(svgEditor);
  // Toolbar buttons are created asynchronously by svg-edit
  const tryToolbar = () => injectToolbarButton(svgEditor);
  tryToolbar();
  setTimeout(tryToolbar, 0);
  setTimeout(tryToolbar, 400);
  wireOptionsPanel(svgEditor);

  document.getElementById('action_type_on_path')?.addEventListener('click', () => {
    armTypeOnPathMode(svgEditor);
  });

  window.__visterasTypeOnPath = () => armTypeOnPathMode(svgEditor);

  if (svgEditor.topPanel && typeof svgEditor.topPanel.updateContextPanel === 'function') {
    const prev = svgEditor.topPanel.updateContextPanel.bind(svgEditor.topPanel);
    svgEditor.topPanel.updateContextPanel = function wrappedUpdateContextPanel() {
      prev();
      syncOptionsPanel(svgEditor);
    };
  }
}

export default mountVisterasTypeOnPath;
