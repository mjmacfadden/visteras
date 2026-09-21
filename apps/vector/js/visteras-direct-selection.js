import { normalizeEditablePath } from './visteras-path-geometry.js';
import { anchors, readSegments, serializeSegments, moveAnchors, deleteAnchors, moveControl } from './visteras-anchor-model.js';

const SHAPES = 'path,rect,circle,ellipse,line,polygon,polyline';
export function mountDirectSelection(editor) {
  const sc = editor.svgCanvas;
  let active = false, records = [], overlay, pending, gesture, switching = false;
  let renderParent, reusable = new Map(), renderIndex = 0;
  const svgNS = 'http://www.w3.org/2000/svg';
  const asMatrix = m => new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
  const matrix = el => asMatrix(sc.getSvgContent().getScreenCTM()).inverse().multiply(asMatrix(el.getScreenCTM()));
  const point = (x, y, m) => new DOMPoint(x, y).matrixTransform(m);
  const position = e => point(e.clientX, e.clientY, asMatrix(sc.getSvgContent().getScreenCTM()).inverse());
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const create = (tag, attrs, parent = renderParent || overlay) => {
    const key = attrs['data-direct-record'] !== undefined
      ? `handle:${attrs['data-direct-record']}:${attrs['data-direct-anchor']}:${attrs['data-direct-control'] || 'anchor'}`
      : `${tag}:${renderIndex++}`;
    const reuse = parent === renderParent && reusable.get(key);
    const el = reuse?.localName === tag ? reuse : document.createElementNS(svgNS, tag);
    for (const attr of [...el.attributes]) if (!(attr.name in attrs) && attr.name !== 'data-direct-key') el.removeAttribute(attr.name);
    for (const [name, value] of Object.entries(attrs)) if (el.getAttribute(name) !== String(value)) el.setAttribute(name, value);
    el.setAttribute('data-direct-key', key);
    parent.append(el);
    return el;
  };
  const style = document.createElement('style');
  style.textContent = 'body[data-direct-multi] #pathpointgrip_container,body[data-direct-multi] #sec_path_node,body[data-direct-multi] #prop_empty_state,body[data-direct-multi] #prop_active_container {display:none!important} #visteras-anchor-status {padding:12px;color:#ccc;font:12px sans-serif;min-height:52px;box-sizing:border-box}';
  document.head.append(style);
  const status = document.createElement('div');
  status.id = 'visteras-anchor-status';
  status.hidden = true;
  document.getElementById('properties_panel')?.append(status);

  function leaves(elements) {
    return [...new Set(elements.flatMap(el => el.matches?.(SHAPES) ? [el] : [...(el.querySelectorAll?.(SHAPES) || [])]))]
      .filter(el => el.isConnected && !el.closest('defs,clipPath,mask') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).pointerEvents !== 'none');
  }
  function readGeometry(el) {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', sc.getPathDataForElement(el) || '');
    normalizeEditablePath(path, p => sc.pathActions.convertPath(p));
    return readSegments(path);
  }
  function prepare(el) {
    let rec = records.find(r => r.el === el || r.id === el.id);
    if (rec) return rec;
    rec = { el, id: el.id, segments: readGeometry(el), selected: new Set() };
    records.push(rec);
    return rec;
  }
  function write(item, segments) {
    const rec = item.rec;
    if (rec.el.localName !== 'path') {
      const original = rec.el, path = document.createElementNS(svgNS, 'path');
      const geometry = new Set(['x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points']);
      for (const attr of original.attributes) if (!geometry.has(attr.name)) path.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      item.conversion = { original, path, parent: original.parentNode, next: original.nextSibling };
      original.replaceWith(path);
      rec.el = path;
    }
    rec.el.setAttribute('d', serializeSegments(segments));
  }
  function activate(elements, selectAll = true) {
    const targets = leaves(elements);
    // Finish native point editing before taking ownership of its canvas events.
    switching = true;
    sc.setMode('pathedit');
    sc.clearSelection();
    switching = false;
    active = true;
    document.body.setAttribute('data-direct-multi', '');
    records = [];
    for (const el of targets) {
      const rec = prepare(el);
      if (rec && selectAll) rec.selected = new Set(anchors(rec.segments).map(a => a.index));
    }
    sc.clearSelection();
    schedule();
    return true;
  }
  function selectedElements() {
    return records.filter(r => r.el.isConnected && r.selected.size).map(r => r.el);
  }
  function refresh() {
    pending = null;
    if (!overlay?.isConnected) overlay = create('g', { id: 'visteras-direct-selection' }, sc.selectorManager.selectorParentGroup);
    reusable = new Map([...overlay.children].map(el => [el.getAttribute('data-direct-key'), el]));
    renderParent = document.createDocumentFragment();
    renderIndex = 0;
    if (!status.isConnected) document.getElementById('properties_panel')?.append(status);
    status.hidden = !active;
    if (!active) { overlay.replaceChildren(); renderParent = null; reusable.clear(); return; }
    const zoom = sc.getZoom();
    let count = 0, paths = 0;
    for (const [recordIndex, rec] of records.entries()) {
      if (!rec.el.isConnected) {
        const replacement = document.getElementById(rec.id);
        if (replacement && sc.getSvgContent().contains(replacement)) rec.el = replacement;
      }
      if (!rec.el.isConnected) continue;
      rec.segments = readGeometry(rec.el);
      const list = anchors(rec.segments), valid = new Set(list.map(a => a.index));
      rec.selected = new Set([...rec.selected].filter(i => valid.has(i)));
      count += rec.selected.size;
      if (rec.selected.size) paths++;
      const m = matrix(rec.el), displayMatrix = new DOMMatrix().scale(zoom).multiply(m);
      create('path', { d: serializeSegments(rec.segments), transform: displayMatrix.toString(), fill: 'none', stroke: '#3f8ff7', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
      for (const anchor of list) {
        const s = rec.segments[anchor.index], p = point(s.x, s.y, m), selected = rec.selected.has(anchor.index);
        if (selected) {
          for (const [index, suffix] of [[anchor.incoming, '2'], [anchor.outgoing, '1']]) {
            const segment = rec.segments[index];
            if (!segment || segment['x' + suffix] === undefined) continue;
            const c = point(segment['x' + suffix], segment['y' + suffix], m);
            create('line', { x1: p.x*zoom, y1: p.y*zoom, x2: c.x*zoom, y2: c.y*zoom, stroke: '#3f8ff7', 'pointer-events': 'none' });
            create('circle', { cx: c.x*zoom, cy: c.y*zoom, r: 3.5, fill: '#fff', stroke: '#3f8ff7', 'data-direct-record': recordIndex, 'data-direct-control': `${index}:${suffix}`, 'data-direct-anchor': anchor.index, style: 'cursor:crosshair' });
          }
        }
        create('rect', { x: p.x*zoom-4, y: p.y*zoom-4, width: 8, height: 8, fill: selected ? '#3f8ff7' : '#fff', stroke: '#3f8ff7', 'data-direct-record': recordIndex, 'data-direct-anchor': anchor.index, style: 'cursor:move' });
      }
    }
    if (gesture?.type === 'marquee') {
      const a = gesture.start, b = gesture.current || a;
      create('rect', { x: Math.min(a.x,b.x)*zoom, y: Math.min(a.y,b.y)*zoom, width: Math.abs(a.x-b.x)*zoom, height: Math.abs(a.y-b.y)*zoom, fill: '#3f8ff710', stroke: '#3f8ff7', 'stroke-dasharray': '4 3', 'pointer-events': 'none' });
    }
    overlay.replaceChildren(renderParent);
    renderParent = null;
    reusable.clear();
    status.textContent = `${count} anchor${count === 1 ? '' : 's'} selected across ${paths} path${paths === 1 ? '' : 's'}`;
    document.getElementById('tool_undo').disabled = sc.undoMgr.getUndoStackSize() === 0;
    document.getElementById('tool_redo').disabled = sc.undoMgr.getRedoStackSize() === 0;
  }
  function schedule() { if (!pending) pending = requestAnimationFrame(refresh); }
  function clearPoints() { for (const rec of records) rec.selected.clear(); }
  function snapshot() {
    return records.filter(r => r.el.isConnected).map(rec => ({ rec, d: rec.el.getAttribute('d'), segments: readGeometry(rec.el), inverse: matrix(rec.el).inverse() }));
  }
  function commit(before, title) {
    const { BatchCommand, ChangeElementCommand, RemoveElementCommand, InsertElementCommand } = sc.history;
    const command = new BatchCommand(title), changed = [];
    for (const item of before) {
      const { rec, d, conversion, removed } = item;
      if (removed) {
        command.addSubCommand(new RemoveElementCommand(rec.el, removed.next, removed.parent));
      } else if (conversion) {
        command.addSubCommand(new RemoveElementCommand(conversion.original, conversion.next, conversion.parent));
        command.addSubCommand(new InsertElementCommand(conversion.path));
      } else if (rec.el.getAttribute('d') !== d) {
        command.addSubCommand(new ChangeElementCommand(rec.el, { d }));
      } else continue;
      changed.push(rec.el);
    }
    if (changed.length) { sc.addCommandToHistory(command); sc.call('changed', changed); }
    schedule();
  }
  function move(before, dx, dy) {
    for (const item of before) {
      if (!item.rec.selected.size) continue;
      const a = point(0,0,item.inverse), b = point(dx,dy,item.inverse);
      write(item, moveAnchors(item.segments, item.rec.selected, b.x-a.x, b.y-a.y));
    }
  }
  function finish(cancel = false) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (cancel) {
      if (g.before) for (const item of g.before) {
        if (item.conversion) { item.conversion.path.replaceWith(item.conversion.original); item.rec.el = item.conversion.original; }
        else if (item.d !== null) item.rec.el.setAttribute('d', item.d);
      }
      if (g.selection) records.forEach((r,i) => { r.selected = new Set(g.selection[i] || []); });
    } else if (g.type !== 'marquee') {
      if (g.moved) commit(g.before, g.type === 'control' ? 'Move direction handle' : 'Move anchors');
      else if (g.collapse) { clearPoints(); g.collapse.rec.selected.add(g.collapse.index); }
    }
    schedule();
  }
  function removeSelected() {
    const before = snapshot().filter(item => item.rec.selected.size);
    for (const item of before) {
      const { rec } = item, next = deleteAnchors(item.segments, rec.selected);
      if (!next.length) {
        item.removed = { parent: rec.el.parentNode, next: rec.el.nextSibling };
        rec.el.remove();
      } else write(item, next);
      rec.selected.clear();
    }
    commit(before, 'Delete anchors');
  }
  const setCurrentMode = sc.setCurrentMode;
  sc.setCurrentMode = function (mode) {
    // SVGEdit's history refresh exits its single-path editor. Keep the user's
    // multi-path tool active; explicit tool changes go through setMode below.
    return setCurrentMode.call(this, active && !switching && mode === 'select' ? 'pathedit' : mode);
  };
  const setMode = sc.setMode;
  sc.setMode = function (mode) {
    if (!active || switching || mode === 'pathedit' || mode === 'ext-panning') return setMode.call(this, mode);
    finish(true);
    const elements = selectedElements();
    active = false;
    document.body.removeAttribute('data-direct-multi');
    const result = setMode.call(this, mode);
    sc.selectOnly(elements, true);
    schedule();
    return result;
  };
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (active && ['changed','selected','zoomed','sourcechanged'].includes(event)) schedule();
    return result;
  };
  sc.directSelection = {
    get active() { return active; },
    tryActivate(elements) { return leaves(elements).length > 1 ? activate(elements) : false; },
    removeSelected
  };
  document.addEventListener('modeChange', schedule);
  new MutationObserver(schedule).observe(sc.getSvgContent(), { subtree: true, childList: true, attributes: true });
  document.addEventListener('mousedown', e => {
    if (sc.getMode() !== 'pathedit' || e.button !== 0 || sc.spaceKey || !sc.getSvgRoot().contains(e.target)) return;
    const el = e.target.closest?.(SHAPES), artwork = el && sc.getSvgContent().contains(el) ? el : null;
    const ownGrip = e.target.hasAttribute?.('data-direct-record');
    if (!active) {
      const native = sc.getPathObj?.();
      if (artwork && e.shiftKey && native?.elem.isConnected && native.elem !== artwork) {
        const previous = new Set(native.selected_pts);
        activate([native.elem, artwork], false);
        // Native SVGEdit represents the first anchor using the closing segment.
        const rec = records.find(r => r.el === native.elem);
        if (rec) rec.selected = new Set(anchors(rec.segments).filter(a => a.aliases.some(i => previous.has(i))).map(a => a.index));
      } else if (!artwork && !e.target.closest?.('#pathpointgrip_container')) {
        const previous = native?.elem.isConnected ? { elem: native.elem, points: [...native.selected_pts] } : null;
        activate(leaves([sc.getCurrentDrawing().getCurrentLayer()]), false);
        if (e.shiftKey && previous) {
          const rec = records.find(r => r.el === previous.elem);
          if (rec) rec.selected = new Set(anchors(rec.segments).filter(a => a.aliases.some(i => previous.points.includes(i))).map(a => a.index));
        }
      } else return;
    }
    stop(e);
    if (ownGrip) {
      const rec = records[Number(e.target.getAttribute('data-direct-record'))], index = Number(e.target.getAttribute('data-direct-anchor'));
      const control = e.target.getAttribute('data-direct-control');
      if (!control && e.shiftKey) {
        rec.selected.has(index) ? rec.selected.delete(index) : rec.selected.add(index);
        schedule(); return;
      }
      const collapse = !control && rec.selected.has(index) && !e.shiftKey ? { rec, index } : null;
      if (!rec.selected.has(index)) { clearPoints(); rec.selected.add(index); }
      gesture = { type: control ? 'control' : 'anchors', rec, index, control, start: position(e), before: snapshot(), collapse };
    } else if (artwork) {
      const rec = prepare(artwork);
      if (!rec) return;
      if (!e.shiftKey) clearPoints();
      const all = anchors(rec.segments).map(a => a.index);
      const deselect = e.shiftKey && all.every(i => rec.selected.has(i));
      for (const i of all) deselect ? rec.selected.delete(i) : rec.selected.add(i);
      gesture = { type: 'anchors', start: position(e), before: snapshot() };
    } else {
      for (const el of leaves([sc.getCurrentDrawing().getCurrentLayer()])) prepare(el);
      const selection = records.map(r => [...r.selected]);
      if (!e.shiftKey) clearPoints();
      gesture = { type: 'marquee', start: position(e), selection, additive: e.shiftKey };
    }
    schedule();
  }, true);
  document.addEventListener('mousemove', e => {
    if (!gesture) return;
    stop(e);
    const g = gesture, p = position(e);
    g.current = p;
    if (g.type === 'marquee') {
      for (const [i, rec] of records.entries()) {
        if (!rec.el.isConnected) continue;
        rec.selected = new Set(g.additive ? g.selection[i] : []);
        const m = matrix(rec.el);
        for (const a of anchors(rec.segments)) {
          const s = rec.segments[a.index], pt = point(s.x,s.y,m);
          if (pt.x >= Math.min(p.x,g.start.x) && pt.x <= Math.max(p.x,g.start.x) && pt.y >= Math.min(p.y,g.start.y) && pt.y <= Math.max(p.y,g.start.y)) rec.selected.add(a.index);
        }
      }
    } else {
      let dx = p.x-g.start.x, dy = p.y-g.start.y;
      if (Math.hypot(dx,dy)*sc.getZoom() < 2 && !g.moved) return;
      g.moved = true;
      if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? dy = 0 : dx = 0;
      if (g.type === 'anchors') move(g.before, dx, dy);
      else {
        const item = g.before.find(i => i.rec === g.rec);
        const [index,suffix] = g.control.split(':'), a = point(0,0,item.inverse), b = point(dx,dy,item.inverse);
        write(item, moveControl(item.segments, g.index, Number(index), suffix, b.x-a.x, b.y-a.y, e.altKey));
      }
    }
    schedule();
  }, true);
  document.addEventListener('mouseup', e => { if (gesture) { stop(e); finish(); } }, true);
  document.addEventListener('keydown', e => {
    if (e.isComposing || window.__visterasIsTypingDirectly || e.composedPath().some(el => el?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(el?.nodeName))) return;
    if (sc.getMode() !== 'pathedit') return;
    const key = e.key.toLowerCase(), command = e.metaKey || e.ctrlKey;
    if (command && key === 'a') {
      stop(e);
      if (e.shiftKey) { if (active) clearPoints(); else sc.getPathObj?.()?.clearSelection(); }
      else activate(leaves([sc.getCurrentDrawing().getCurrentLayer()]));
      schedule(); return;
    }
    if (!active) return;
    if (key === 'escape') { stop(e); if (gesture) finish(true); else clearPoints(); schedule(); }
    else if (!command && !e.altKey && ['backspace','delete'].includes(key)) { stop(e); removeSelected(); }
    else if (!command && !e.altKey && ['arrowleft','arrowright','arrowup','arrowdown'].includes(key)) {
      stop(e);
      const step = (e.shiftKey ? 10 : 1) * (sc.getCurConfig().gridSnapping ? sc.getCurConfig().snappingStep : 1);
      const before = snapshot();
      move(before, key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
      commit(before, 'Move anchors');
    }
  }, true);
  window.addEventListener('blur', () => finish(true));
}
