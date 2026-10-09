/** Shared viewport gestures and object rows for the Vector workspace. */
export function mountVectorWorkspace(editor) {
  // The editor can be re-initialized by the document shell. Do not attach a
  // second set of DOM/event/history listeners to the same SVG editor.
  if (editor.__visterasWorkspaceMounted) return editor.__visterasWorkspaceMounted;
  const sc = editor.svgCanvas, area = document.getElementById('workarea');
  // Safari GestureEvents do not reliably carry the mouse's client coordinates.
  // Track the pointer separately and keep its position for the pinch sequence.
  let pointer = null, gesturePoint = null;
  area.addEventListener('pointermove', event => {
    pointer = { clientX: event.clientX, clientY: event.clientY };
  });
  area.addEventListener('pointerleave', () => { pointer = null; });
  function zoomAt(value, event) {
    const zoom = Math.max(.01, Math.min(50, value));
    const content = sc.getSvgContent();
    const before = content.getScreenCTM();
    if (!before) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(before.inverse());
    sc.setZoom(zoom);
    editor.updateCanvas(true);
    const input = document.getElementById('zoom');
    if (input) input.value = (zoom * 100).toFixed(1);
    if (editor.configObj.curConfig.showRulers) editor.rulers?.updateRulers?.(document.getElementById('svgcanvas'), zoom);
    editor.zoomDone?.();
    sc.runExtensions('zoomChanged', zoom);
    sc.call('zoomed', { zoom });
    // Apply the anchor after zoom listeners finish updating the canvas layout.
    const after = point.matrixTransform(content.getScreenCTM());
    area.scrollLeft += after.x - event.clientX;
    area.scrollTop += after.y - event.clientY;
  }
  area.addEventListener('wheel', event => {
    event.preventDefault(); event.stopImmediatePropagation();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1;
    if (event.ctrlKey || event.altKey) {
      zoomAt(sc.getZoom() * Math.exp(-event.deltaY * unit * .01), event);
    } else {
      area.scrollLeft += (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit;
      if (!(event.shiftKey && !event.deltaX)) area.scrollTop += event.deltaY * unit;
    }
  }, {capture:true, passive:false});
  let gestureZoom = 1;
  area.addEventListener('gesturestart', event => {
    event.preventDefault();
    gestureZoom = sc.getZoom();
    gesturePoint = pointer || { clientX: event.clientX, clientY: event.clientY };
  }, {passive:false});
  area.addEventListener('gesturechange', event => {
    event.preventDefault();
    if (gesturePoint) zoomAt(gestureZoom * event.scale, gesturePoint);
  }, {passive:false});
  area.addEventListener('gestureend', event => {
    event.preventDefault();
    gesturePoint = null;
  }, {passive:false});

  const list = document.getElementById('layerlist');
  let pending = false;
  let dragged = null;
  const collapsedLayers = new WeakSet();
  const LOCK_ATTR = 'data-visteras-locked';
  const isLocked = element => element?.getAttribute?.(LOCK_ATTR) === '1';
  const hasLockedAncestor = element => {
    for (let node = element; node && node !== sc.getSvgContent(); node = node.parentNode) {
      if (isLocked(node)) return true;
    }
    return false;
  };
  // Locked artwork stays visible but cannot be picked or dragged on the canvas.
  sc.getSvgContent()?.addEventListener('mousedown', event => {
    const target = event.target;
    if (hasLockedAncestor(target) && sc.getSvgContent().contains(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  let rejectingLockedSelection = false;
  let previousSelected;
  previousSelected = sc.bind?.('selected', (_window, elements) => {
    if (rejectingLockedSelection || !elements?.some?.(hasLockedAncestor)) {
      previousSelected?.(_window, elements);
      return;
    }
    rejectingLockedSelection = true;
    try { sc.clearSelection(); } finally { rejectingLockedSelection = false; }
  });
  const addToSelection = sc.addToSelection?.bind(sc);
  if (addToSelection) {
    sc.addToSelection = (elements, ...args) => addToSelection(
      (elements || []).filter(element => !hasLockedAncestor(element)), ...args
    );
  }
  function captureLayerScroll() {
    const positions = [];
    for (let el = list.parentElement; el; el = el.parentElement) {
      positions.push([el, el.scrollTop, el.scrollLeft]);
    }
    return () => { for (const [el, top, left] of positions) { el.scrollTop = top; el.scrollLeft = left; } };
  }
  function objectLabel(element) {
    const name = element.getAttribute('aria-label') || element.querySelector(':scope > title')?.textContent;
    if (name) return name;
    if (element.localName === 'use') {
      // Symbol instance: show the symbol's name (Illustrator Layers panel).
      const href = element.getAttribute('href') || element.getAttribute('xlink:href') || '';
      const sym = href.startsWith('#') ? element.ownerDocument.getElementById(href.slice(1)) : null;
      const symName = sym?.getAttribute('data-v-symbol-name') || sym?.querySelector(':scope > title')?.textContent;
      if (symName) return symName;
    }
    if (element.localName === 'image') return (element.id || 'raster').replace(/^svg_(\d+)$/, 'raster_$1');
    return element.id || element.localName;
  }
  function renderObjects() {
    const restoreScroll = captureLayerScroll();
    pending = false;
    observer.disconnect();
    list.querySelectorAll('.vector-object-row').forEach(row => row.remove());
    const drawing = sc.getCurrentDrawing();
    const selected = sc.getSelectedElements().filter(Boolean);
    for (const row of list.querySelectorAll('tr.layer')) {
      const name = row.querySelector('.layername')?.textContent;
      const layer = drawing.getLayerByName(name);
      if (!layer) continue;
      const nameCell = row.querySelector('.layername');
      nameCell.querySelector('.vector-layer-disclosure')?.remove();
      const disclosure = document.createElement('button');
      disclosure.type = 'button';
      disclosure.className = 'vector-layer-disclosure';
      const expanded = !collapsedLayers.has(layer);
      disclosure.setAttribute('aria-expanded', String(expanded));
      disclosure.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${name}`);
      // The native layer handlers use nameCell.textContent as the layer name.
      // Draw the triangle with CSS so that text remains unchanged.
      disclosure.addEventListener('mousedown', event => event.stopPropagation());
      disclosure.addEventListener('mouseup', event => event.stopPropagation());
      disclosure.addEventListener('click', event => {
        event.stopPropagation();
        if (collapsedLayers.has(layer)) collapsedLayers.delete(layer);
        else collapsedLayers.add(layer);
        queue();
      });
      nameCell.prepend(disclosure);
      if (!expanded) continue;
      let previous = row;
      function append(parent, depth) {
        for (const element of [...parent.children].reverse()) {
          if (['title','desc','defs','metadata'].includes(element.localName)) continue;
          const child = document.createElement('tr');
          child.className = 'vector-object-row';
          const cell = document.createElement('td');
          const eyeCell = document.createElement('td');
          const eye = document.createElement('button');
          const hidden = element.getAttribute('display') === 'none';
          eye.type = 'button';
          eye.className = 'vector-object-eye';
          eye.setAttribute('aria-label', `${hidden ? 'Show' : 'Hide'} ${objectLabel(element)}`);
          eye.setAttribute('aria-pressed', String(!hidden));
          const icon = document.createElement('img');
          icon.src = './images/eye.svg'; icon.alt = '';
          eye.append(icon);
          eye.addEventListener('click', () => {
            const old = element.getAttribute('display');
            if (hidden) element.removeAttribute('display');
            else element.setAttribute('display', 'none');
            sc.addCommandToHistory(new sc.history.ChangeElementCommand(element, {display: old}, 'Toggle object visibility'));
            if (!hidden && sc.getSelectedElements().includes(element)) sc.clearSelection();
            sc.call('changed', [element]);
            queue();
          });
          eyeCell.append(eye);
          const lock = document.createElement('button');
          const locked = isLocked(element);
          lock.type = 'button';
          lock.className = 'vector-object-lock';
          const lockIcon = document.createElement('img');
          lockIcon.src = locked ? './images/lock.svg' : './images/unlock.svg';
          lockIcon.alt = '';
          lock.append(lockIcon);
          lock.setAttribute('aria-label', `${locked ? 'Unlock' : 'Lock'} ${objectLabel(element)}`);
          lock.setAttribute('aria-pressed', String(locked));
          lock.addEventListener('click', event => {
            event.stopPropagation();
            const old = element.getAttribute(LOCK_ATTR);
            const oldPointerEvents = element.getAttribute('pointer-events');
            if (locked) {
              element.removeAttribute(LOCK_ATTR);
              const saved = element.getAttribute('data-visteras-pointer-events');
              if (saved == null) element.removeAttribute('pointer-events');
              else element.setAttribute('pointer-events', saved);
              element.removeAttribute('data-visteras-pointer-events');
            } else {
              if (oldPointerEvents != null) element.setAttribute('data-visteras-pointer-events', oldPointerEvents);
              element.setAttribute(LOCK_ATTR, '1');
              element.setAttribute('pointer-events', 'none');
              if (sc.getSelectedElements().some(selected => selected === element || hasLockedAncestor(selected))) sc.clearSelection();
            }
            sc.addCommandToHistory(new sc.history.ChangeElementCommand(element, {
              [LOCK_ATTR]: old,
              'pointer-events': oldPointerEvents,
              'data-visteras-pointer-events': element.getAttribute('data-visteras-pointer-events'),
            }, 'Toggle object lock'));
            sc.call('changed', [element]);
            queue();
          });
          eyeCell.append(lock);
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = objectLabel(element);
          button.style.cssText = `width:100%;text-align:left;padding:5px 8px 5px ${30+depth*16}px;border:0;background:${selected.includes(element)?'#465366':'transparent'};color:inherit;font:inherit;cursor:grab`;
          button.title = 'Drag to reorder within this layer or group';
          button.draggable = true;
          button.addEventListener('dragstart', event => {
            dragged = element;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', element.id);
          });
          button.addEventListener('dragend', () => {
            dragged = null;
            list.querySelectorAll('[data-drop]').forEach(row => row.removeAttribute('data-drop'));
            queue();
          });
          child.addEventListener('dragover', event => {
            if (!dragged || dragged === element || dragged.parentNode !== parent) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('[data-drop]').forEach(row => row.removeAttribute('data-drop'));
            const rect = child.getBoundingClientRect();
            child.dataset.drop = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
          });
          child.addEventListener('drop', event => {
            if (!dragged || dragged === element || dragged.parentNode !== parent) return;
            event.preventDefault();
            const moved = dragged, oldNext = moved.nextSibling;
            // Panel order is the reverse of SVG paint order: the top row paints last.
            const rect = child.getBoundingClientRect();
            const above = event.clientY < rect.top + rect.height / 2;
            parent.insertBefore(moved, above ? element.nextSibling : element);
            if (moved.nextSibling !== oldNext) {
              sc.addCommandToHistory(new sc.history.MoveElementCommand(moved, oldNext, parent, 'Reorder object'));
              sc.call('changed', [moved]);
            }
            dragged = null;
            queue();
          });
          button.addEventListener('click', event => {
            if (isLocked(element)) return;
            sc.setCurrentLayer(name);
            if (!event.shiftKey) sc.clearSelection();
            sc.addToSelection([element]);
            queue();
          });
          cell.append(button); child.append(eyeCell, cell); previous.after(child); previous = child;
          if (element.localName === 'g') append(element, depth+1);
        }
      }
      append(layer,0);
    }
    observer.observe(list,{childList:true,subtree:true});
    restoreScroll();
  }
  function queue() { if (!pending && !dragged) { pending = true; requestAnimationFrame(renderObjects); } }
  const observer = new MutationObserver(queue);
  observer.observe(list,{childList:true,subtree:true});
  // Native layer rebuilds remove all object rows first. Rebuild them before
  // restoring scroll, while the full scrollable height is available again.
  const populateLayers = editor.layersPanel.populateLayers;
  editor.layersPanel.populateLayers = function (...args) {
    const restoreScroll = captureLayerScroll();
    const result = populateLayers.apply(this, args);
    renderObjects();
    restoreScroll();
    return result;
  };
  const contentObserver = new MutationObserver(queue);
  contentObserver.observe(sc.getSvgRoot(),{childList:true,subtree:true,attributes:true,attributeFilter:['display']});
  queue();
  editor.__visterasWorkspaceMounted = { refresh: queue };
  return editor.__visterasWorkspaceMounted;
}
