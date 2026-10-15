import { eventMatchesChord, formatBrowserSafeShortcut, browserSafeChord } from './visteras-browser-shortcuts.js';
import { isSublayer, isLayerContainer, createSublayer, rowPath, topmostSelected, selectableArtwork } from './visteras-sublayers.js?v=envelope-2';
import { displayName, cleanName, nextLayerName, layerNames, renameObject } from './visteras-layer-names.js?v=envelope-2';
import { ensureHost, documentMatrix, localMatrix } from './visteras-object-transform.js';
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
  const rowsByElement = new Map();
  let targeted = null;
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
      const selected = elements?.find?.(Boolean);
      for (let parent = selected?.parentNode; parent && parent !== sc.getSvgContent(); parent = parent.parentNode) {
        if (isLayerContainer(parent)) { targeted = parent; break; }
      }
      previousSelected?.(_window, elements);
      return;
    }
    rejectingLockedSelection = true;
    try { sc.clearSelection(); } finally { rejectingLockedSelection = false; }
  });
  const addToSelection = sc.addToSelection?.bind(sc);
  if (addToSelection) {
    sc.addToSelection = (elements, ...args) => addToSelection(
      selectableArtwork(elements || []).filter(element => !hasLockedAncestor(element)), ...args
    );
  }
  function captureLayerScroll() {
    const positions = [];
    for (let el = list.parentElement; el; el = el.parentElement) {
      positions.push([el, el.scrollTop, el.scrollLeft]);
    }
    return () => { for (const [el, top, left] of positions) { el.scrollTop = top; el.scrollLeft = left; } };
  }
  const objectLabel = displayName;
  let editing = null;
  function startRename(element, label) {
    if (editing) editing.blur();
    const layer = sc.isLayer(element), sublayer = isSublayer(element);
    const title = [...element.children].find(el => el.localName === 'title');
    const input = document.createElement('input');
    input.className = 'vector-layer-name-input';
    input.setAttribute('aria-label', 'Name');
    input.value = layer ? title?.textContent || '' : element.getAttribute('data-visteras-name') || '';
    if (!input.value && !layer && element.getAttribute('data-visteras-sublayer')) input.value = title?.textContent || '';
    const draggable = label.draggable; label.draggable = false;
    let finished = false;
    const finish = cancel => {
      if (finished) return;
      finished = true; editing = null;
      if (!cancel) {
        const name = cleanName(input.value);
        if (layer) {
          const next = name || nextLayerName(layerNames(sc.getSvgContent()));
          if (next !== title?.textContent && !sc.getCurrentDrawing().hasLayer(next)) {
            sc.setCurrentLayer(title.textContent);
            sc.renameCurrentLayer(next); // SVG-Edit records the title change in its undo manager.
          }
        } else if (sublayer) {
          const next = name || nextLayerName(layerNames(sc.getSvgContent()));
          const old = title.textContent;
          if (next !== old) {
            title.textContent = next;
            sc.addCommandToHistory(new sc.history.ChangeElementCommand(title, { '#text': old }, 'Rename sublayer'));
            sc.call('changed', [element]);
          }
        } else renameObject(sc, element, name);
      }
      label.draggable = draggable;
      label.textContent = displayName(element);
      queue();
    };
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'dragstart']) input.addEventListener(type, e => e.stopPropagation());
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(e.key === 'Escape'); }
    });
    input.addEventListener('blur', () => finish(false));
    label.replaceChildren(input); editing = input;
    input.focus(); input.select();
  }
  function layerOptions(defaultName, create) {
    const host = ensureHost();
    if (host.querySelector('.vtx-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'vtx-overlay';
    overlay.innerHTML = `<div class="vtx-dialog" role="dialog" aria-modal="true" aria-label="Layer Options">
      <div class="vtx-title">Layer Options</div><form class="vtx-body"><div class="vtx-row"><label for="vector_layer_options_name">Name:</label>
      <input id="vector_layer_options_name" type="text" /></div><div class="vtx-hint" role="status"></div></form>
      <div class="vtx-actions"><button type="button" data-act="cancel">Cancel</button><button type="button" class="primary" data-act="ok">OK</button></div></div>`;
    host.append(overlay);
    const input = overlay.querySelector('input'); input.value = defaultName;
    const close = () => overlay.remove();
    const submit = () => {
      const name = cleanName(input.value) || defaultName;
      if (layerNames(sc.getSvgContent()).includes(name)) { overlay.querySelector('[role="status"]').textContent = 'A layer already has that name.'; return; }
      close(); create(name);
    };
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-act="ok"]').addEventListener('click', submit);
    overlay.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    input.focus(); input.select();
  }
  function newLayer(options = false) {
    const create = name => {
      const drawing = sc.getCurrentDrawing(), index = drawing.indexCurrentLayer();
      const layer = drawing.createLayer(name);
      targeted = layer;
      if (index >= 0) drawing.setCurrentLayerPosition(index + 1);
      sc.addCommandToHistory(new sc.history.InsertElementCommand(layer, 'Create layer'));
      sc.clearSelection(); sc.call('changed', [layer]);
      editor.layersPanel.populateLayers();
    };
    const names = layerNames(sc.getSvgContent());
    const name = nextLayerName([...names, `Layer ${names.length}`]);
    if (options) layerOptions(name, create); else create(name);
  }
  function newSublayer(options = false) {
    const current = sc.getCurrentDrawing().getCurrentLayer();
    const parent = targeted && sc.getSvgContent().contains(targeted) && isLayerContainer(targeted) ? targeted : current;
    if (!parent || hasLockedAncestor(parent)) return;
    const names = layerNames(sc.getSvgContent()), name = nextLayerName([...names, `Layer ${names.length}`]);
    const create = name => {
      const layer = createSublayer(document, name, sc.getNextId());
      parent.appendChild(layer); // last SVG child paints first in the panel's reverse order
      sc.addCommandToHistory(new sc.history.InsertElementCommand(layer, 'Create sublayer'));
      for (const ancestor of rowPath(layer, sc.getSvgContent())) collapsedLayers.delete(ancestor);
      targeted = layer;
      sc.call('changed', [layer]); renderObjects();
      const label = rowsByElement.get(layer)?.querySelector('.vector-object-name');
      if (!options && label) startRename(layer, label);
    };
    if (options) layerOptions(name, create); else create(name);
  }
  function locateObject() {
    const element = topmostSelected(sc.getSelectedElements(), sc.getSvgContent());
    if (!element) return;
    window.__visterasDock?.open('layers');
    for (const parent of rowPath(element, sc.getSvgContent())) collapsedLayers.delete(parent);
    renderObjects();
    const row = rowsByElement.get(element);
    row?.scrollIntoView({ block: 'nearest' });
    row?.classList.add('vector-layer-located');
    setTimeout(() => row?.classList.remove('vector-layer-located'), 1100);
  }
  const buttons = document.getElementById('layerbuttons');
  function addPanelButton(id, title, icon, action) {
    const button = document.createElement('button');
    button.id = id; button.type = 'button'; button.title = title; button.setAttribute('aria-label', title);
    button.innerHTML = icon; button.addEventListener('click', action);
    return button;
  }
  const newSublayerButton = addPanelButton('layer_new_sublayer', 'Create New Sublayer',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 19V6h7l2 3h9v10H3Z M12 11v6M9 14h6"/></svg>', e => newSublayer(e.altKey));
  document.getElementById('layer_new')?.after(newSublayerButton);
  buttons?.append(addPanelButton('layer_locate', 'Locate Object', '<img src="./images/zoom.svg" alt=""/>', locateObject));
  const menu = document.createElement('div');
  menu.className = 'vector-layer-panel-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  const menuActions = [
    ['New Layer', () => newLayer(), 'new_layer'],
    ['New Layer…', () => newLayer(true), 'new_layer_options'],
    ['New Sublayer…', () => newSublayer(true), 'new_sublayer_options'],
    ['Locate Object', locateObject, 'locate_object'],
    ['Duplicate Layer', () => editor.layersPanel.cloneLayer(), 'duplicate_layer'],
    ['Delete Layer', () => editor.layersPanel.deleteLayer(), 'delete_layer'],
    ['Merge Down', () => editor.layersPanel.mergeLayer(), 'merge_down'],
    ['Merge All', () => { sc.mergeAllLayers(); editor.layersPanel.populateLayers(); }, 'merge_all'],
  ];
  for (const [label, action, id] of menuActions) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.layerCommand = id; button.setAttribute('role', 'menuitem');
    if (id === 'new_layer' || id === 'new_layer_options') {
      const spec = { meta: true, alt: id === 'new_layer_options', key: 'L' };
      const label = document.createElement('span'); label.className = 'menu_dropdown_shortcut';
      const mapped = browserSafeChord(spec);
      label.dataset.shortcut = [mapped.ctrl && 'Ctrl', mapped.alt && 'Alt', mapped.shift && 'Shift', mapped.meta && 'Meta', 'L'].filter(Boolean).join('+');
      label.textContent = formatBrowserSafeShortcut(spec); button.append(label);
    }
    button.addEventListener('click', () => { menu.hidden = true; action(); }); menu.append(button);
  }
  document.getElementById('layerpanel')?.append(menu);
  document.getElementById('layer_moreopts')?.addEventListener('click', e => {
    e.preventDefault(); e.stopImmediatePropagation(); menu.hidden = !menu.hidden;
  }, true);
  document.addEventListener('mousedown', e => {
    if (!menu.contains(e.target) && !e.target.closest?.('#layer_moreopts')) menu.hidden = true;
  });
  editor.__visterasLayers = {
    newLayer, newSublayer, locateObject,
    renameCurrent() {
      if (isSublayer(targeted) && sc.getSvgContent().contains(targeted)) {
        const label = rowsByElement.get(targeted)?.querySelector('.vector-object-name');
        if (label) startRename(targeted, label);
        return;
      }
      const layer = sc.getCurrentDrawing().getCurrentLayer();
      const row = [...list.querySelectorAll('tr.layer')].find(row => row.querySelector('.layername')?.textContent === displayName(layer));
      if (row) startRename(layer, row.querySelector('.vector-layer-name'));
    },
  };
  window.addEventListener('keydown', event => {
    const focus = document.activeElement;
    if (['input','textarea','select'].includes(focus?.tagName?.toLowerCase()) || focus?.isContentEditable
      || event.target?.isContentEditable || window.__visterasIsTypingDirectly) return;
    if (document.querySelector('#visteras-transform-dialog-host .vtx-overlay')) return;
    const options = eventMatchesChord(event, { meta: true, alt: true, key: 'L' });
    if (!options && !eventMatchesChord(event, { meta: true, key: 'L' })) return;
    event.preventDefault(); event.stopImmediatePropagation(); newLayer(options);
  }, true);
  document.getElementById('layer_new')?.addEventListener('click', e => {
    e.preventDefault(); e.stopImmediatePropagation(); newLayer(e.altKey);
  }, true);
  function renderObjects() {
    const restoreScroll = captureLayerScroll();
    pending = false;
    if (editing) return;
    observer.disconnect();
    list.querySelectorAll('.vector-object-row').forEach(row => row.remove());
    rowsByElement.clear();
    const drawing = sc.getCurrentDrawing();
    const selected = sc.getSelectedElements().filter(Boolean);
    for (const row of list.querySelectorAll('tr.layer')) {
      const name = row.querySelector('.layername')?.textContent;
      const layer = drawing.getLayerByName(name);
      if (!layer) continue;
      rowsByElement.set(layer, row);
      let nameCell = row.querySelector('.layername');
      // Native mouseup handlers rebuild the row between double-clicks. Own the
      // name cell so the inline editor remains mounted through selection.
      if (!nameCell.dataset.visterasNameCell) {
        const replacement = nameCell.cloneNode(false);
        replacement.dataset.visterasNameCell = '1';
        nameCell.replaceWith(replacement); nameCell = replacement;
        nameCell.addEventListener('click', event => {
          if (event.target.closest('input, .vector-layer-disclosure')) return;
          targeted = layer;
          sc.setCurrentLayer(displayName(layer));
          list.querySelectorAll('tr.layer').forEach(other => other.classList.toggle('layersel', other === row));
        });
      }
      let label = nameCell.querySelector('.vector-layer-name');
      if (!label) {
        nameCell.textContent = '';
        label = document.createElement('span');
        label.className = 'vector-layer-name'; label.textContent = name;
        label.addEventListener('dblclick', e => { e.stopPropagation(); startRename(layer, label); });
        nameCell.append(label);
      }
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
          if (isSublayer(element)) child.classList.add('vector-sublayer-row');
          if (targeted === element) child.classList.add('vector-layer-targeted');
          rowsByElement.set(element, child);
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
            if (!hidden && sc.getSelectedElements().some(selected => selected && (selected === element || element.contains(selected)))) sc.clearSelection();
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
          button.className = 'vector-object-name';
          button.textContent = objectLabel(element);
          let selectTimer;
          button.addEventListener('dblclick', e => { clearTimeout(selectTimer); e.stopPropagation(); startRename(element, button); });
          button.style.cssText = `width:100%;text-align:left;padding:5px 8px 5px ${30+depth*16}px;border:0;background:${selected.includes(element)?'color-mix(in srgb, var(--visteras-accent) 25%, transparent)':'transparent'};color:inherit;font:inherit;cursor:grab`;
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
            if (!dragged || dragged === element || dragged.contains(element) || (dragged.parentNode !== parent && !isSublayer(element)) || hasLockedAncestor(element)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('[data-drop]').forEach(row => row.removeAttribute('data-drop'));
            const rect = child.getBoundingClientRect();
            child.dataset.drop = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
          });
          child.addEventListener('drop', event => {
            if (!dragged || dragged === element || dragged.contains(element) || (dragged.parentNode !== parent && !isSublayer(element)) || hasLockedAncestor(element)) return;
            event.preventDefault();
            const moved = dragged, oldNext = moved.nextSibling, oldParent = moved.parentNode;
            const oldTransform = moved.getAttribute('transform');
            const world = isSublayer(element) && oldParent !== element ? documentMatrix(sc, oldParent).multiply(localMatrix(moved)) : null;
            // Panel order is the reverse of SVG paint order: the top row paints last.
            const rect = child.getBoundingClientRect();
            const above = event.clientY < rect.top + rect.height / 2;
            if (isSublayer(element)) { element.appendChild(moved); collapsedLayers.delete(element); }
            else parent.insertBefore(moved, above ? element.nextSibling : element);
            if (moved.parentNode !== oldParent || moved.nextSibling !== oldNext) {
              const batch = new sc.history.BatchCommand('Move object');
              batch.addSubCommand(new sc.history.MoveElementCommand(moved, oldNext, oldParent, 'Reorder object'));
              if (world) {
                moved.setAttribute('transform', documentMatrix(sc, moved.parentNode).inverse().multiply(world).toString());
                batch.addSubCommand(new sc.history.ChangeElementCommand(moved, { transform: oldTransform }, 'Preserve object position'));
              }
              sc.addCommandToHistory(batch);
              sc.call('changed', [moved]);
            }
            dragged = null;
            queue();
          });
          button.addEventListener('click', event => {
            clearTimeout(selectTimer);
            // Native selection can rebuild the table; defer a single click so
            // a double-click can open the name editor before its node is removed.
            selectTimer = setTimeout(() => {
              if (isLocked(element)) return;
              if (editing) return;
              targeted = isSublayer(element) ? element : parent;
              sc.setCurrentLayer(name);
              if (isSublayer(element)) { sc.clearSelection(); queue(); return; }
              if (!event.shiftKey) sc.clearSelection();
              sc.addToSelection([element]); queue();
            }, 280);
          });
          if (isSublayer(element)) {
            const disclosure = document.createElement('button'); disclosure.type = 'button'; disclosure.className = 'vector-layer-disclosure';
            disclosure.setAttribute('aria-expanded', String(!collapsedLayers.has(element)));
            disclosure.setAttribute('aria-label', `${collapsedLayers.has(element) ? 'Expand' : 'Collapse'} ${displayName(element)}`);
            disclosure.addEventListener('click', e => { e.stopPropagation();
              if (collapsedLayers.has(element)) collapsedLayers.delete(element); else collapsedLayers.add(element); queue(); });
            cell.append(disclosure);
          }
          cell.append(button); child.append(eyeCell, cell); previous.after(child); previous = child;
          if (element.getAttribute('data-visteras-envelope') === 'warp') {
            // Source is represented as a read-only Contents disclosure, never an artwork target.
            const contents = document.createElement('tr'); contents.className='vector-object-row';
            const contentCell=document.createElement('td'); contentCell.colSpan=2;
            const details=document.createElement('details'); const summary=document.createElement('summary'); summary.textContent='Contents';
            details.appendChild(summary);
            const source=[...element.children].find(el=>el.hasAttribute('data-visteras-envelope-src'));
            for(const original of source?.children || []) {
              const label=document.createElement('div'); label.textContent=displayName(original); details.appendChild(label);
            }
            contentCell.appendChild(details); contents.appendChild(contentCell); previous.after(contents); previous=contents;
          } else if (element.localName === 'g' && !collapsedLayers.has(element)) append(element, depth+1);
        }
      }
      append(layer,0);
    }
    observer.observe(list,{childList:true,subtree:true});
    restoreScroll();
  }
  function queue() { if (!pending && !dragged && !editing) { pending = true; requestAnimationFrame(renderObjects); } }
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
  contentObserver.observe(sc.getSvgRoot(),{childList:true,subtree:true,attributes:true,characterData:true,attributeFilter:['display', 'data-visteras-name', 'data-visteras-locked']});
  queue();
  editor.__visterasWorkspaceMounted = { refresh: queue };
  return editor.__visterasWorkspaceMounted;
}
