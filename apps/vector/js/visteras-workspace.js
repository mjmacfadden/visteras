/** Shared viewport gestures and object rows for the Vector workspace. */
export function mountVectorWorkspace(editor) {
  const sc = editor.svgCanvas, area = document.getElementById('workarea');
  function zoomAt(value, event) {
    const zoom = Math.max(.01, Math.min(50, value));
    const content = sc.getSvgContent();
    const before = content.getScreenCTM();
    if (!before) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(before.inverse());
    sc.setZoom(zoom);
    editor.updateCanvas(true);
    const after = point.matrixTransform(content.getScreenCTM());
    area.scrollLeft += after.x - event.clientX;
    area.scrollTop += after.y - event.clientY;
    const input = document.getElementById('zoom');
    if (input) input.value = (zoom * 100).toFixed(1);
    if (editor.configObj.curConfig.showRulers) editor.rulers?.updateRulers?.(document.getElementById('svgcanvas'), zoom);
    editor.zoomDone?.();
    sc.runExtensions('zoomChanged', zoom);
    sc.call('zoomed', { zoom });
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
  area.addEventListener('gesturestart', event => { event.preventDefault(); gestureZoom = sc.getZoom(); }, {passive:false});
  area.addEventListener('gesturechange', event => { event.preventDefault(); zoomAt(gestureZoom * event.scale, event); }, {passive:false});
  area.addEventListener('gestureend', event => event.preventDefault(), {passive:false});

  const list = document.getElementById('layerlist');
  let pending = false;
  let dragged = null;
  const collapsedLayers = new WeakSet();
  function renderObjects() {
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
          eye.setAttribute('aria-label', `${hidden ? 'Show' : 'Hide'} ${element.id || element.localName}`);
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
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = element.getAttribute('aria-label') || element.querySelector(':scope > title')?.textContent || element.id || element.localName;
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
  }
  function queue() { if (!pending && !dragged) { pending = true; requestAnimationFrame(renderObjects); } }
  const observer = new MutationObserver(queue);
  observer.observe(list,{childList:true,subtree:true});
  const contentObserver = new MutationObserver(queue);
  contentObserver.observe(sc.getSvgRoot(),{childList:true,subtree:true,attributes:true,attributeFilter:['display']});
  queue();
}
