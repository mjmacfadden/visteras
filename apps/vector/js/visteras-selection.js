import { mountDirectSelection } from './visteras-direct-selection.js';
/** Selection overlays belong to the editor, never to the exported artwork. */
export function mountSelectionTools(editor) {
  mountDirectSelection(editor);
  const sc = editor.svgCanvas;
  const ns = 'http://www.w3.org/2000/svg';
  // SVGEdit still uses selectors internally for hit testing and geometry.
  // Their visual controls are retired; the shared overlay owns all handles.
  const style = document.createElement('style');
  style.textContent = '#selectorParentGroup > g[id^="selectorGroup"], #selectorParentGroup [id^="selectorGrip_"] { display:none !important; }';
  document.head.append(style);
  const shapeModes = new Set(['rect', 'square', 'ellipse', 'circle', 'line', 'fhrect', 'fhellipse', 'star', 'polygon', 'shapelib']);
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
  const rotationCursor = "url('../studio/images/icons/rotate.svg') 12 12, default";
  let compoundFrame;
  const selectionFrame = elements => {
    if (elements.length === 1) return { b: elements[0].getBBox(), m: matrix(elements[0]) };
    const signature = elements.map(el => el.getAttribute('transform'));
    if (compoundFrame && elements.every((el,i) => el === compoundFrame.elements[i] && signature[i] === compoundFrame.signature[i]) && elements.length === compoundFrame.elements.length) return compoundFrame;
    return { b: bounds(elements), m: new DOMMatrix() };
  };
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
    const shapeMode = shapeModes.has(mode);
    const show = ['select', 'resize', 'rotate', 'multiselect'].includes(mode) || (shapeMode && (!sc.getStarted() || drag));
    for (const selector of manager.selectors) {
      selector.selectorGroup.setAttribute('display', 'none');
    }
    if (!show || !elements.length) {
      manager.selectorGripsGroup.setAttribute('display', 'none');
      return;
    }
    manager.selectorGripsGroup.setAttribute('display', 'none');
    const {b,m} = drag?.visualFrame || selectionFrame(elements), zoom = sc.getZoom();
    const x = b.x, y = b.y, w = b.width, h = b.height;
    const screen = (x,y) => { const p = point(x,y,m); return [p.x*zoom,p.y*zoom]; };
    const corners = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>screen(...p));
    create('polygon', { points: corners.map(p=>p.join(',')).join(' '), fill: 'none', stroke: '#3f8ff7', 'stroke-width': 1, 'pointer-events': 'none' }, overlay);
    const grips = { nw: [x, y], n: [x+w/2, y], ne: [x+w, y], e: [x+w, y+h/2], se: [x+w, y+h], s: [x+w/2, y+h], sw: [x, y+h], w: [x, y+h/2] };
    const center = screen(x+w/2,y+h/2);
    for (const [cx,cy] of corners) {
      const dx=cx-center[0], dy=cy-center[1], length=Math.hypot(dx,dy)||1;
      create('circle', { cx:cx+dx/length*13, cy:cy+dy/length*13, r:10, fill:'transparent', 'pointer-events':'all', 'data-selection-handle':'rotate', style:`cursor:${rotationCursor}` }, overlay);
    }
    for (const [dir, p] of Object.entries(grips)) {
      const [cx,cy] = screen(...p);
      create('rect', { x: cx-4, y: cy-4, width: 8, height: 8, fill: 'white', stroke: '#3f8ff7', 'data-selection-handle': dir, style: `cursor:${dir}-resize` }, overlay);
    }
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
    if (!elements.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const {b,m} = selectionFrame(elements);
    drag = { dir, b, basis:m, start: position(e), moved: false, items: elements.map(el => ({ el, original: el.getAttribute('transform'), local: localMatrix(el), parent: matrix(el.parentNode) })) };
  }, true);
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const { dir, b, basis } = drag;
    let start = drag.start, p = position(e);
    let transform = new DOMMatrix();
    if (dir === 'rotate') {
      const {x:cx,y:cy} = point(b.x+b.width/2,b.y+b.height/2,basis);
      let angle = (Math.atan2(p.y-cy, p.x-cx) - Math.atan2(start.y-cy, start.x-cx)) * 180 / Math.PI;
      if (e.shiftKey) angle = Math.round(angle / 45) * 45;
      transform = transform.translate(cx, cy).rotate(angle).translate(-cx, -cy);
    } else {
      start = point(start.x,start.y,basis.inverse());
      p = point(p.x,p.y,basis.inverse());
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
      transform = basis.multiply(transform).multiply(basis.inverse());
    }
    for (const item of drag.items) {
      const m = item.parent.inverse().multiply(transform).multiply(item.parent).multiply(item.local);
      item.el.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
    }
    // Keep outside helper / inside clip coincident with body during live grip drag.
    try {
      window.__visterasLiveSyncStrokeAlign?.(drag.items.map((i) => i.el), sc);
    } catch { /* ignore */ }
    drag.moved = true;
    drag.visualFrame = {b,m:transform.multiply(basis)};
    schedule();
  }, true);
  function finish(cancel = false) {
    if (!drag) return;
    const { items, moved, visualFrame } = drag;
    drag = null;
    if (cancel || !moved) {
      for (const { el, original } of items) original === null ? el.removeAttribute('transform') : el.setAttribute('transform', original);
      try { window.__visterasLiveSyncStrokeAlign?.(items.map((i) => i.el), sc); } catch { /* ignore */ }
    } else {
      if (items.length > 1) compoundFrame = { ...visualFrame, elements:items.map(i=>i.el), signature:items.map(i=>i.el.getAttribute('transform')) };
      const { BatchCommand, ChangeElementCommand } = sc.history;
      const command = new BatchCommand('Transform selection');
      for (const { el, original } of items) command.addSubCommand(new ChangeElementCommand(el, { transform: original }));
      sc.addCommandToHistory(command);
      try { window.__visterasLiveSyncStrokeAlign?.(items.map((i) => i.el), sc); } catch { /* ignore */ }
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
  const toolKeys = { v: 'tool_select', a: 'tool_direct_select', m: 'tool_rect', l: 'tool_ellipse', p: 'tool_path', n: 'tool_fhpath', t: 'tool_text', z: 'tool_zoom', i: 'tool_eyedropper', h: 'ext-panning', c: 'tool_scissors', '\\': 'tool_line' };
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
