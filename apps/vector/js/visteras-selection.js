import { mountDirectSelection } from './visteras-direct-selection.js';
/** Selection overlays belong to the editor, never to the exported artwork. */
export function mountSelectionTools(editor) {
  mountDirectSelection(editor);
  const sc = editor.svgCanvas;
  const ns = 'http://www.w3.org/2000/svg';
  let overlay, frame, drag;
  const create = (name, attrs, parent) => {
    const el = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    parent?.append(el);
    return el;
  };
  const selected = () => sc.getSelectedElements().filter(el => el?.isConnected);
  const asMatrix = m => new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
  const matrix = el => asMatrix(sc.getSvgContent().getScreenCTM()).inverse().multiply(asMatrix(el.getScreenCTM()));
  const localMatrix = el => {
    let m = new DOMMatrix();
    const list = el.transform.baseVal;
    for (let i = 0; i < list.numberOfItems; i++) m = m.multiply(asMatrix(list.getItem(i).matrix));
    return m;
  };
  const point = (x, y, m) => new DOMPoint(x, y).matrixTransform(m);
  const bounds = elements => {
    const points = elements.flatMap(el => {
      const b = el.getBBox(), m = matrix(el);
      return [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => point(x, y, m));
    });
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
  };
  function refresh() {
    frame = null;
    document.getElementById('tool_undo').disabled = sc.undoMgr.getUndoStackSize() === 0;
    document.getElementById('tool_redo').disabled = sc.undoMgr.getRedoStackSize() === 0;
    const manager = sc.selectorManager;
    if (!overlay?.isConnected) overlay = create('g', { id: 'visteras-selection-box' }, manager.selectorParentGroup);
    overlay.replaceChildren();
    const elements = selected(), mode = sc.getMode();
    const show = ['select', 'resize', 'rotate', 'multiselect'].includes(mode);
    for (const selector of manager.selectors) {
      if (!selector.locked || !selector.selectedElement) continue;
      selector.selectorGroup.setAttribute('display', show ? 'inline' : 'none');
    }
    if (!show || !elements.length) {
      manager.selectorGripsGroup.setAttribute('display', 'none');
      return;
    }
    if (elements.length === 1) {
      const selector = manager.requestSelector(elements[0]);
      selector.resize();
      selector.showGrips(true);
      return;
    }
    manager.selectorGripsGroup.setAttribute('display', 'none');
    const b = bounds(elements), zoom = sc.getZoom();
    const x = b.x * zoom, y = b.y * zoom, w = b.width * zoom, h = b.height * zoom;
    create('rect', { x, y, width: w, height: h, fill: 'none', stroke: '#3f8ff7', 'stroke-width': 1, 'pointer-events': 'none' }, overlay);
    const grips = { nw: [x, y], n: [x+w/2, y], ne: [x+w, y], e: [x+w, y+h/2], se: [x+w, y+h], s: [x+w/2, y+h], sw: [x, y+h], w: [x, y+h/2] };
    create('line', { x1: x+w/2, y1: y, x2: x+w/2, y2: y-24, stroke: '#3f8ff7', 'pointer-events': 'none' }, overlay);
    for (const [dir, [cx, cy]] of Object.entries(grips)) {
      create('rect', { x: cx-4, y: cy-4, width: 8, height: 8, fill: 'white', stroke: '#3f8ff7', 'data-selection-handle': dir, style: `cursor:${dir}-resize` }, overlay);
    }
    create('circle', { cx: x+w/2, cy: y-24, r: 5, fill: 'white', stroke: '#3f8ff7', 'data-selection-handle': 'rotate', style: 'cursor:crosshair' }, overlay);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  // Preserve SVGEdit's event subscribers; render after all synchronous selection changes.
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (['selected', 'changed', 'transition', 'zoomed', 'sourcechanged'].includes(event)) schedule();
    return result;
  };
  document.addEventListener('modeChange', schedule);
  sc.getSvgRoot().addEventListener('mouseup', schedule);
  new MutationObserver(schedule).observe(sc.getSvgContent(), { attributes: true, childList: true, subtree: true });
  const position = e => point(e.clientX, e.clientY, sc.getSvgContent().getScreenCTM().inverse());
  document.addEventListener('mousedown', e => {
    const dir = e.target.getAttribute?.('data-selection-handle');
    if (!dir || e.button !== 0) return;
    const elements = selected();
    if (elements.length < 2) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const b = bounds(elements);
    drag = { dir, b, start: position(e), moved: false, items: elements.map(el => ({ el, original: el.getAttribute('transform'), local: localMatrix(el), parent: matrix(el.parentNode) })) };
  }, true);
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const { dir, b, start } = drag, p = position(e);
    let transform = new DOMMatrix();
    if (dir === 'rotate') {
      const cx = b.x + b.width/2, cy = b.y + b.height/2;
      let angle = (Math.atan2(p.y-cy, p.x-cx) - Math.atan2(start.y-cy, start.x-cx)) * 180 / Math.PI;
      if (e.shiftKey) angle = Math.round(angle / 45) * 45;
      transform = transform.translate(cx, cy).rotate(angle).translate(-cx, -cy);
    } else {
      const ax = e.altKey ? b.x+b.width/2 : dir.includes('w') ? b.x+b.width : b.x;
      const ay = e.altKey ? b.y+b.height/2 : dir.includes('n') ? b.y+b.height : b.y;
      let sx = /[ew]/.test(dir) && Math.abs(start.x-ax) > 1e-8 ? (p.x-ax)/(start.x-ax) : 1;
      let sy = /[ns]/.test(dir) && Math.abs(start.y-ay) > 1e-8 ? (p.y-ay)/(start.y-ay) : 1;
      if (e.shiftKey) {
        const scale = Math.abs(sx-1) > Math.abs(sy-1) ? sx : sy;
        sx = sy = scale;
      }
      // Avoid singular matrices while crossing the opposite edge.
      if (Math.abs(sx) < 1e-6) sx = 1e-6;
      if (Math.abs(sy) < 1e-6) sy = 1e-6;
      transform = transform.translate(ax, ay).scale(sx, sy).translate(-ax, -ay);
    }
    for (const item of drag.items) {
      const m = item.parent.inverse().multiply(transform).multiply(item.parent).multiply(item.local);
      item.el.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
    }
    drag.moved = true;
    schedule();
  }, true);
  function finish(cancel = false) {
    if (!drag) return;
    const { items, moved } = drag;
    drag = null;
    if (cancel || !moved) {
      for (const { el, original } of items) original === null ? el.removeAttribute('transform') : el.setAttribute('transform', original);
    } else {
      const { BatchCommand, ChangeElementCommand } = sc.history;
      const command = new BatchCommand('Transform selection');
      for (const { el, original } of items) command.addSubCommand(new ChangeElementCommand(el, { transform: original }));
      sc.addCommandToHistory(command);
      sc.call('changed', items.map(item => item.el));
    }
    schedule();
  }
  document.addEventListener('mouseup', e => {
    if (!drag) return;
    e.preventDefault(); e.stopImmediatePropagation(); finish();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopImmediatePropagation(); finish(true); }
  }, true);
  // One route for toolbar clicks and Illustrator tool keys. Capture prevents legacy
  // SVGEdit bindings (A=select all, D=duplicate, Ctrl-only Undo) from also firing.
  const toolKeys = { v: 'tool_select', a: 'tool_direct_select', m: 'tool_rect', l: 'tool_ellipse', p: 'tool_path', n: 'tool_fhpath', t: 'tool_text', z: 'tool_zoom', i: 'tool_eyedropper', h: 'ext-panning', '\\': 'tool_line' };
  document.addEventListener('keydown', e => {
    if (e.isComposing || window.__visterasIsTypingDirectly || e.composedPath().some(el => el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.nodeName))) return;
    const key = e.key.toLowerCase(), command = e.metaKey || e.ctrlKey;
    if (!command && !e.altKey && sc.getMode() === 'pathedit' && ['delete', 'backspace'].includes(key)) {
      e.preventDefault(); e.stopImmediatePropagation();
      const path = sc.getPathObj?.();
      if (path?.elem.isConnected && path.selected_pts.length) sc.pathActions.deletePathNode();
      if (sc.getMode() !== 'pathedit') sc.setMode('pathedit');
      return;
    }
    let id;
    if (command && !e.altKey && key === 'z') id = e.shiftKey ? 'tool_redo' : 'tool_undo';
    else if (!command && !e.altKey && !e.shiftKey) id = toolKeys[key] || (key === 'd' ? 'swatch_default_btn' : null);
    else if (!command && !e.altKey && e.shiftKey && key === 'x') id = 'swatch_swap_btn';
    const button = id && document.getElementById(id);
    if (button) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!button.disabled) button.click();
    }
  }, true);
  window.addEventListener('blur', () => finish(true));
  schedule();
}
