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
      let previous = row;
      function append(parent, depth) {
        for (const element of [...parent.children].reverse()) {
          if (['title','desc','defs','metadata'].includes(element.localName)) continue;
          const child = document.createElement('tr');
          child.className = 'vector-object-row';
          const cell = document.createElement('td'); cell.colSpan = 2;
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = element.getAttribute('aria-label') || element.querySelector(':scope > title')?.textContent || element.id || element.localName;
          button.style.cssText = `width:100%;text-align:left;padding:5px 8px 5px ${24+depth*12}px;border:0;background:${selected.includes(element)?'#465366':'transparent'};color:inherit;font:inherit;cursor:pointer`;
          button.addEventListener('click', event => {
            sc.setCurrentLayer(name);
            if (!event.shiftKey) sc.clearSelection();
            sc.addToSelection([element]);
            queue();
          });
          cell.append(button); child.append(cell); previous.after(child); previous = child;
          if (element.localName === 'g') append(element, depth+1);
        }
      }
      append(layer,0);
    }
    observer.observe(list,{childList:true,subtree:true});
  }
  function queue() { if (!pending) { pending = true; requestAnimationFrame(renderObjects); } }
  const observer = new MutationObserver(queue);
  observer.observe(list,{childList:true,subtree:true});
  const contentObserver = new MutationObserver(queue);
  contentObserver.observe(sc.getSvgRoot(),{childList:true,subtree:true});
  queue();
}
