/**
 * Visteras Vector — Clipping Masks (Object ▸ Clipping Mask ▸ Make ⌘7, Release ⌥⌘7).
 *
 * Illustrator / Gravit parity:
 * - Make (⌘7): Selected objects are grouped; the topmost object in stacking (DOM) order
 *   becomes the clipping mask shape (placed in <defs><clipPath id="...">), and the underlying
 *   objects become the clipped content inside the <g class="vclip-group" data-visteras-clip="..." clip-path="url(#...)">.
 * - Release (⌥⌘7): The clipping mask is unpacked; the clipping shape is restored back into
 *   the document above the clipped content, the content elements are un-grouped, and the
 *   <clipPath> in <defs> is removed.
 * - Single undo/redo step (BatchCommand).
 * - Survives save / reopen (.vvd and standard SVG).
 * - Supported by client-side SVG→Canvas export (Export for Screens ⌥⌘E, Export As).
 */

export const CLIP_ATTR = 'data-visteras-clip';
export const CLIP_PREFIX = 'vclip_';

export function isClipGroup(el) {
  if (!el || el.nodeType !== 1) return false;
  return el.hasAttribute(CLIP_ATTR) || (el.tagName?.toLowerCase() === 'g' && el.getAttribute('clip-path')?.includes(CLIP_PREFIX));
}

export function getClipId(el) {
  if (!el) return null;
  return el.getAttribute(CLIP_ATTR) || el.getAttribute('clip-path')?.match(/#([^)]+)/)?.[1] || null;
}

const isValidCandidate = (el) => {
  if (!el || el.nodeType !== 1) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'svg' || tag === 'defs' || tag === 'clippath') return false;
  if (el.classList?.contains('layer')) return false;
  return !!el.parentNode;
};

export function canMake(elements) {
  return (elements || []).filter(isValidCandidate).length >= 2;
}

export function canRelease(elements) {
  return (elements || []).some(isClipGroup);
}

/**
 * Creates a clipping mask from selected elements. Topmost element becomes the mask shape.
 * @param {object} sc svgCanvas instance
 * @param {Element[]} [selected] optional elements override
 * @returns {Element|null} the created clip group, or null
 */
export function makeClippingMask(sc, selected = null) {
  const elements = (selected || sc.getSelectedElements?.() || []).filter(isValidCandidate);
  if (elements.length < 2) {
    if (typeof window !== 'undefined' && window.showStudioToast) {
      window.showStudioToast('Please select two or more objects to make a clipping mask.', 'error', 3000);
    }
    return null;
  }

  // Sort by DOM order: the element appearing last in document order is topmost (rendered on top)
  const FOLLOWING = typeof Node !== 'undefined' ? (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY) : (4 | 16);
  const PRECEDING = typeof Node !== 'undefined' ? (Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_CONTAINS) : (2 | 8);
  const sorted = [...elements].sort((a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition ? a.compareDocumentPosition(b) : 0;
    if (pos & FOLLOWING) return -1;
    if (pos & PRECEDING) return 1;
    return 0;
  });

  const maskEl = sorted[sorted.length - 1];
  const contentEls = sorted.slice(0, sorted.length - 1);
  const parent = maskEl.parentNode;
  const nextSibling = maskEl.nextSibling;

  const doc = maskEl.ownerDocument || document;
  const NS = 'http://www.w3.org/2000/svg';
  const defs = sc.findDefs ? sc.findDefs() : (doc.querySelector('#svgcontent defs') || doc.querySelector('defs'));

  const nextId = sc.getNextId ? sc.getNextId() : ('c' + Math.random().toString(36).slice(2, 8));
  const clipId = `${CLIP_PREFIX}${nextId}`;
  const groupId = `${CLIP_PREFIX}grp_${nextId}`;

  // 1. Create <clipPath id="..." clipPathUnits="userSpaceOnUse">
  const clipPath = doc.createElementNS(NS, 'clipPath');
  clipPath.setAttribute('id', clipId);
  clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');

  // 2. Create wrapper <g class="vclip-group">
  const group = doc.createElementNS(NS, 'g');
  group.setAttribute('id', groupId);
  group.setAttribute('class', 'vclip-group');
  group.setAttribute(CLIP_ATTR, clipId);
  group.setAttribute('clip-path', `url(#${clipId})`);

  const { BatchCommand, InsertElementCommand, MoveElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Make Clipping Mask') : null;

  // Insert clipPath in defs
  defs.append(clipPath);
  if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(clipPath));

  // Move maskEl into clipPath (preserves geometry and original styling non-destructively)
  const maskOldNext = maskEl.nextSibling, maskOldParent = maskEl.parentNode;
  clipPath.append(maskEl);
  if (batch && MoveElementCommand) batch.addSubCommand(new MoveElementCommand(maskEl, maskOldNext, maskOldParent));

  // Insert group in parent where maskEl was
  parent.insertBefore(group, nextSibling);
  if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(group));

  // Move content elements into group (maintaining their internal relative order)
  for (const el of contentEls) {
    const elOldNext = el.nextSibling, elOldParent = el.parentNode;
    group.append(el);
    if (batch && MoveElementCommand) batch.addSubCommand(new MoveElementCommand(el, elOldNext, elOldParent));
  }

  if (batch) sc.addCommandToHistory(batch);

  sc.clearSelection?.();
  sc.addToSelection?.([group], true);
  sc.call?.('changed', [group]);
  return group;
}

/**
 * Releases one or more clipping masks, restoring the mask shape and content elements.
 * @param {object} sc svgCanvas instance
 * @param {Element[]} [selected] optional elements override
 * @returns {Element[]|null} the released elements, or null
 */
export function releaseClippingMask(sc, selected = null) {
  const elements = (selected || sc.getSelectedElements?.() || []).filter(Boolean);
  const clipGroups = elements.filter(isClipGroup);
  if (!clipGroups.length) return null;

  const { BatchCommand, MoveElementCommand, RemoveElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Release Clipping Mask') : null;
  const allReleased = [];
  const defs = sc.findDefs ? sc.findDefs() : sc.getSvgContent?.()?.querySelector('defs');

  for (const group of clipGroups) {
    const clipId = getClipId(group);
    const clipPath = defs?.querySelector?.(`#${clipId}`) || group.ownerDocument?.getElementById(clipId);
    const parent = group.parentNode;
    if (!parent) continue;
    const nextSibling = group.nextSibling;

    const contentChildren = Array.from(group.children);
    const maskChildren = clipPath ? Array.from(clipPath.children) : [];

    // Push group transform down to children if present so elements stay visually where they were moved
    const groupTransform = group.getAttribute('transform');
    if (groupTransform) {
      for (const item of [...contentChildren, ...maskChildren]) {
        const existing = item.getAttribute('transform');
        item.setAttribute('transform', existing ? `${groupTransform} ${existing}` : groupTransform);
      }
    }

    // Move content children back to parent before group's nextSibling
    for (const el of contentChildren) {
      const oldNext = el.nextSibling;
      parent.insertBefore(el, nextSibling);
      if (batch && MoveElementCommand) batch.addSubCommand(new MoveElementCommand(el, oldNext, group));
    }

    // Move mask children back to parent (placed on top of content elements, matching Illustrator)
    for (const maskEl of maskChildren) {
      const oldNext = maskEl.nextSibling;
      parent.insertBefore(maskEl, nextSibling);
      if (batch && MoveElementCommand) batch.addSubCommand(new MoveElementCommand(maskEl, oldNext, clipPath));
    }

    // Remove the clip group
    group.remove();
    if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(group, nextSibling, parent));

    // Remove the <clipPath> from defs
    if (clipPath) {
      const cpNext = clipPath.nextSibling, cpParent = clipPath.parentNode;
      clipPath.remove();
      if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(clipPath, cpNext, cpParent));
    }

    allReleased.push(...contentChildren, ...maskChildren);
  }

  if (!allReleased.length) return null;

  if (batch) sc.addCommandToHistory(batch);

  sc.clearSelection?.();
  sc.addToSelection?.(allReleased, true);
  sc.call?.('changed', allReleased);
  return allReleased;
}

/**
 * Removes any <clipPath> in <defs> that is no longer referenced in the document.
 */
export function sweepOrphanClipPaths(sc) {
  const defs = sc.findDefs ? sc.findDefs() : sc.getSvgContent?.()?.querySelector('defs');
  if (!defs) return;
  const root = sc.getSvgContent?.();
  if (!root) return;
  const clips = defs.querySelectorAll?.(`clipPath[id^="${CLIP_PREFIX}"]`);
  if (!clips) return;
  for (const cp of clips) {
    const id = cp.id;
    const used = root.querySelector?.(`[${CLIP_ATTR}="${id}"], [clip-path*="#${id}"]`);
    if (!used) cp.remove();
  }
}

/**
 * Mounts Clipping Mask UI handlers and shortcuts on the editor instance.
 */
export function mountClippingMask(editor) {
  const sc = editor.svgCanvas;
  if (!sc) return null;

  const objList = document.querySelector?.('#menu_object > .menu_dropdown_list');
  let actionMake = document.getElementById?.('action_make_clipping_mask');
  let actionRelease = document.getElementById?.('action_release_clipping_mask');

  if (objList && !actionMake) {
    const ungroupItem = document.getElementById?.('action_ungroup');
    const submenu = document.createElement('div');
    submenu.className = 'menu_dropdown_item menu_has_submenu';
    submenu.id = 'menu_clipping_mask';
    submenu.innerHTML = `Clipping Mask<span class="menu_submenu_arrow">▸</span>
      <div class="menu_dropdown_list menu_submenu_list">
        <div class="menu_dropdown_item disabled" id="action_make_clipping_mask">Make <span class="menu_dropdown_shortcut">⌘7</span></div>
        <div class="menu_dropdown_item disabled" id="action_release_clipping_mask">Release <span class="menu_dropdown_shortcut">⌥⌘7</span></div>
      </div>`;
    const sep = document.createElement('div');
    sep.className = 'menu_dropdown_separator';
    if (ungroupItem && ungroupItem.nextElementSibling) {
      ungroupItem.after(submenu, sep);
    } else {
      objList.append(sep, submenu);
    }
    actionMake = document.getElementById?.('action_make_clipping_mask');
    actionRelease = document.getElementById?.('action_release_clipping_mask');
  }

  const syncMenu = () => {
    const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
    const canM = canMake(sel);
    const canR = canRelease(sel);
    if (actionMake) actionMake.classList.toggle('disabled', !canM);
    if (actionRelease) actionRelease.classList.toggle('disabled', !canR);
  };

  actionMake?.addEventListener('click', () => {
    makeClippingMask(sc);
    syncMenu();
  });

  actionRelease?.addEventListener('click', () => {
    releaseClippingMask(sc);
    syncMenu();
  });

  // Keep menu state in sync with selection
  const origCall = sc.call;
  sc.call = function (event, ...args) {
    const result = origCall.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') {
      syncMenu();
      sweepOrphanClipPaths(sc);
    }
    return result;
  };

  // Ungroup (⌘⇧G) on a clip group releases the clipping mask (Illustrator behavior)
  const origUngroup = sc.ungroupSelectedElement;
  if (origUngroup) {
    sc.ungroupSelectedElement = function (...args) {
      const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
      if (sel.length === 1 && isClipGroup(sel[0])) {
        return releaseClippingMask(sc, sel);
      }
      return origUngroup.apply(this, args);
    };
  }

  syncMenu();

  window.__visterasClippingMask = {
    make: (sel) => makeClippingMask(sc, sel),
    release: (sel) => releaseClippingMask(sc, sel),
    isClipGroup,
    canMake: () => canMake(sc.getSelectedElements?.() || []),
    canRelease: () => canRelease(sc.getSelectedElements?.() || []),
    sweep: () => sweepOrphanClipPaths(sc),
    syncMenu,
  };

  return window.__visterasClippingMask;
}
