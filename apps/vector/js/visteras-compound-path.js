/**
 * Visteras Vector — Object ▸ Compound Path ▸ Make (⌘8) / Release (⌥⇧⌘8)
 *
 * Make: combine selected paths/shapes into one <path> with fill-rule evenodd
 * (Illustrator-style holes where overlap). Appearance from the top-most object.
 * Shapes (rect/ellipse/polygon/…) are converted to paths first.
 * Release: split compound path back into separate path elements (one per subpath).
 * One undo BatchCommand each.
 */

import { formatShortcut, detectMac } from './visteras-shortcut-label.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COMPOUND_ATTR = 'data-visteras-compound';

export function isCompoundPath(el) {
  return !!(el && el.tagName === 'path' && (el.getAttribute(COMPOUND_ATTR) === '1' || countSubpaths(el.getAttribute('d') || '') > 1));
}

export function countSubpaths(d) {
  if (!d) return 0;
  const matches = String(d).match(/[Mm]/g);
  return matches ? matches.length : 0;
}

/** Split a path `d` into subpath strings (each starting with M/m). */
export function splitSubpaths(d) {
  const s = String(d || '').trim();
  if (!s) return [];
  const parts = [];
  const re = /[Mm][^Mm]*/g;
  let m;
  while ((m = re.exec(s))) parts.push(m[0].trim());
  return parts.filter(Boolean);
}

function selected(sc) {
  return (sc?.getSelectedElements?.() || []).filter(Boolean);
}

function sortDomBottomToTop(elements) {
  return [...elements].sort((a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  });
}

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);

export function canMakeCompound(elements) {
  const els = (elements || []).filter((el) => el && SHAPE_TAGS.has(el.tagName) && el.getAttribute?.('data-visteras-locked') !== '1');
  return els.length >= 2;
}

export function canReleaseCompound(elements) {
  const els = elements || [];
  return els.length === 1 && els[0]?.tagName === 'path' && countSubpaths(els[0].getAttribute('d') || '') >= 2;
}

function copyAppearance(source, target) {
  const attrs = [
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
    'opacity', 'fill-opacity', 'stroke-opacity', 'filter', 'style',
    'data-visteras-stroke-align', 'data-visteras-stroke-weight', 'data-visteras-stroke-paint',
  ];
  for (const a of attrs) {
    const v = source.getAttribute?.(a);
    if (v != null) target.setAttribute(a, v);
  }
}

function elementToPathEl(sc, el) {
  if (el.tagName === 'path') return el;
  if (typeof sc.convertToPath === 'function') {
    try {
      const p = sc.convertToPath(el);
      if (p) return p;
    } catch { /* fall through */ }
  }
  // Paper.js fallback
  if (window.paper) {
    try {
      const scope = new window.paper.PaperScope();
      scope.setup(document.createElement('canvas'));
      const item = scope.project.importSVG(el, { insert: false });
      let pathItem = item;
      if (item instanceof scope.Shape) pathItem = item.toPath(true);
      const exported = pathItem.exportSVG({ asString: false });
      const d = exported.getAttribute?.('d') || [...(exported.querySelectorAll?.('path') || [])].map((p) => p.getAttribute('d')).join(' ');
      scope.project.clear();
      if (!d) return null;
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('d', d);
      copyAppearance(el, pathEl);
      const xf = el.getAttribute('transform');
      if (xf) pathEl.setAttribute('transform', xf);
      return pathEl;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Make compound path from selection. Returns the new path or null.
 */
export function makeCompoundPath(sc, elements = null) {
  let els = (elements || selected(sc)).filter((el) => SHAPE_TAGS.has(el?.tagName));
  if (!canMakeCompound(els)) {
    window.showStudioToast?.('Select two or more paths or shapes to make a compound path.', 'error', 3000);
    return null;
  }
  els = sortDomBottomToTop(els);
  const top = els[els.length - 1];
  const parent = top.parentNode;
  const nextSibling = top.nextSibling;

  const pathEls = [];
  for (const el of els) {
    const p = elementToPathEl(sc, el);
    if (!p) {
      window.showStudioToast?.('Unable to convert one of the shapes to a path.', 'error', 3000);
      return null;
    }
    pathEls.push({ original: el, path: p, wasConverted: p !== el });
  }

  // Combine `d` subpaths; fill-rule evenodd for holes (Illustrator default for Make Compound Path)
  const dParts = pathEls.map(({ path }) => path.getAttribute('d') || '').filter(Boolean);
  if (dParts.length < 2) return null;

  const { BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Make Compound Path') : null;

  const compound = document.createElementNS(SVG_NS, 'path');
  compound.setAttribute('id', sc.getNextId?.() || `compound_${Date.now()}`);
  compound.setAttribute('d', dParts.join(' '));
  compound.setAttribute('fill-rule', 'evenodd');
  compound.setAttribute(COMPOUND_ATTR, '1');
  copyAppearance(top, compound);
  // Prefer topmost transform only if single — otherwise bake is complex; leave transforms on sources removed
  // If top had transform and others don't share it, appearance still from top.

  parent.insertBefore(compound, nextSibling);
  if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(compound));

  for (const { original, path, wasConverted } of pathEls) {
    // If convertToPath replaced original already, it may be gone — remove whatever is still in DOM
    const toRemove = original.isConnected ? original : (path.isConnected && path !== compound ? path : null);
    if (toRemove?.parentNode) {
      const parentNode = toRemove.parentNode;
      const next = toRemove.nextSibling;
      parentNode.removeChild(toRemove);
      if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(toRemove, next, parentNode));
    } else if (wasConverted && path.isConnected && path !== compound && path.parentNode) {
      const parentNode = path.parentNode;
      const next = path.nextSibling;
      parentNode.removeChild(path);
      if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(path, next, parentNode));
    }
  }

  if (batch) sc.addCommandToHistory(batch);
  sc.clearSelection?.();
  sc.addToSelection?.([compound], true);
  sc.call?.('changed', [compound]);
  return compound;
}

/**
 * Release compound path into separate path elements (one per subpath).
 */
export function releaseCompoundPath(sc, elements = null) {
  const els = elements || selected(sc);
  if (!canReleaseCompound(els)) {
    window.showStudioToast?.('Select a compound path to release.', 'error', 2500);
    return null;
  }
  const src = els[0];
  const parts = splitSubpaths(src.getAttribute('d') || '');
  if (parts.length < 2) return null;

  const parent = src.parentNode;
  const nextSibling = src.nextSibling;
  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Release Compound Path') : null;
  const created = [];

  for (const d of parts) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('id', sc.getNextId?.() || `path_${Math.random().toString(36).slice(2, 8)}`);
    p.setAttribute('d', d);
    copyAppearance(src, p);
    const xf = src.getAttribute('transform');
    if (xf) p.setAttribute('transform', xf);
    p.removeAttribute(COMPOUND_ATTR);
    parent.insertBefore(p, nextSibling);
    if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(p));
    created.push(p);
  }

  parent.removeChild(src);
  if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(src, nextSibling, parent));
  if (batch) sc.addCommandToHistory(batch);

  sc.clearSelection?.();
  sc.addToSelection?.(created, true);
  sc.call?.('changed', created);
  return created;
}

function injectMenu() {
  const objList = document.querySelector('#menu_object > .menu_dropdown_list');
  if (!objList || document.getElementById('menu_compound_path')) return;
  const mac = detectMac();
  const scMake = formatShortcut({ meta: true, key: '8', mac });
  const scRel = formatShortcut({ meta: true, alt: true, shift: true, key: '8', mac });

  const block = document.createElement('div');
  block.innerHTML = `
    <div class="menu_dropdown_item menu_has_submenu" role="menuitem" aria-haspopup="true" id="menu_compound_path">
      Compound Path<span class="menu_submenu_arrow" aria-hidden="true">▸</span>
      <div class="menu_dropdown_list menu_submenu_list" role="menu">
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_compound_make">Make <span class="menu_dropdown_shortcut" data-shortcut="Meta+8">${scMake}</span></div>
        <div class="menu_dropdown_item disabled" role="menuitem" id="action_compound_release">Release <span class="menu_dropdown_shortcut" data-shortcut="Alt+Shift+Meta+8">${scRel}</span></div>
      </div>
    </div>
    <div class="menu_dropdown_separator"></div>
  `;

  // After Clipping Mask if present, else after Ungroup
  const clip = document.getElementById('menu_clipping_mask');
  const ungroup = document.getElementById('action_ungroup');
  const anchor = clip || ungroup;
  if (anchor) {
    const after = anchor.nextElementSibling?.classList?.contains('menu_dropdown_separator')
      ? anchor.nextElementSibling
      : anchor;
    after.after(...block.childNodes);
  } else {
    objList.append(...block.childNodes);
  }
}

function syncMenu(sc) {
  const sel = selected(sc);
  document.getElementById('action_compound_make')?.classList.toggle('disabled', !canMakeCompound(sel));
  document.getElementById('action_compound_release')?.classList.toggle('disabled', !canReleaseCompound(sel));
}

export function mountCompoundPath(editor) {
  const sc = editor?.svgCanvas;
  if (!sc) return null;
  if (window.__visterasCompoundPath) return window.__visterasCompoundPath;

  injectMenu();

  document.getElementById('action_compound_make')?.addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled')) return;
    makeCompoundPath(sc);
    syncMenu(sc);
  });
  document.getElementById('action_compound_release')?.addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled')) return;
    releaseCompoundPath(sc);
    syncMenu(sc);
  });

  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    if (window.__visterasIsTypingDirectly) return;
    if (e.key !== '8') return;
    // ⌘8 Make; ⌥⇧⌘8 Release
    if (e.altKey && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      releaseCompoundPath(sc);
      syncMenu(sc);
    } else if (!e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      makeCompoundPath(sc);
      syncMenu(sc);
    }
  }, true);

  const origCall = sc.call;
  sc.call = function (event, ...args) {
    const result = origCall.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') syncMenu(sc);
    return result;
  };
  syncMenu(sc);

  const api = {
    make: (sel) => makeCompoundPath(sc, sel),
    release: (sel) => releaseCompoundPath(sc, sel),
    canMake: () => canMakeCompound(selected(sc)),
    canRelease: () => canReleaseCompound(selected(sc)),
    isCompoundPath,
    splitSubpaths,
    countSubpaths,
    syncMenu: () => syncMenu(sc),
  };
  window.__visterasCompoundPath = api;
  return api;
}

export default mountCompoundPath;
