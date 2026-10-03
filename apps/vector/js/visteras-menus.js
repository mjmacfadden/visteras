/**
 * Visteras Vector — submenus + keyboard navigation for the menu bar and popup menus.
 *
 * Markup (any `.vmenu-root`, incl. #visteras_menu_bar and the Properties fx menu):
 *   <div class="menu_dropdown_item menu_has_submenu">Stylize<span class="menu_submenu_arrow">▸</span>
 *     <div class="menu_dropdown_list menu_submenu_list">…items…</div></div>
 *   <div class="menu_dropdown_header">Illustrator Effects</div>
 * Behaviour (event delegation, so menus built later work too):
 *  - hover opens a submenu after a short delay and closes its siblings; clicking
 *    the parent toggles it and keeps the menu open;
 *  - submenus flip to the left when they would leave the viewport;
 *  - with a menu open: ↑/↓ move, → opens a submenu, ← closes it (or moves to the
 *    previous top-level menu), Enter/Space activates, Esc closes. Keys are only
 *    taken while a menu is open, so canvas shortcuts are unaffected otherwise.
 */
const HOVER_MS = 120;

export const openLists = (doc = document) => [...doc.querySelectorAll('.menu_entry.open > .menu_dropdown_list, .vmenu-popup.open')];

function visibleItems(list) {
  return [...list.children].filter((n) => n.classList?.contains('menu_dropdown_item') && !n.classList.contains('disabled') && n.offsetParent !== null);
}

export function closeSubmenus(scope) {
  for (const n of scope.querySelectorAll('.menu_has_submenu.submenu-open')) n.classList.remove('submenu-open');
}

export function openSubmenu(item) {
  const parentList = item.parentElement;
  for (const sib of parentList.querySelectorAll(':scope > .menu_has_submenu.submenu-open')) if (sib !== item) { sib.classList.remove('submenu-open'); closeSubmenus(sib); }
  item.classList.add('submenu-open');
  const sub = item.querySelector(':scope > .menu_submenu_list');
  if (sub) {
    sub.classList.remove('flip-left');
    const r = sub.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) sub.classList.add('flip-left');
  }
  return sub;
}

function setFocus(list, item) {
  for (const n of list.querySelectorAll(':scope > .kb-focus')) n.classList.remove('kb-focus');
  if (item) item.classList.add('kb-focus');
}

export function mountMenus(doc = document) {
  if (doc.__visterasMenus) return doc.__visterasMenus;
  let hoverTimer = null;
  doc.addEventListener('mouseover', (e) => {
    const item = e.target.closest?.('.vmenu-root .menu_dropdown_item');
    if (!item) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const list = item.parentElement;
      for (const sib of list.querySelectorAll(':scope > .menu_has_submenu.submenu-open')) if (sib !== item) { sib.classList.remove('submenu-open'); closeSubmenus(sib); }
      if (item.classList.contains('menu_has_submenu') && !item.classList.contains('disabled')) openSubmenu(item);
    }, HOVER_MS);
  });
  doc.addEventListener('click', (e) => {
    const parent = e.target.closest?.('.vmenu-root .menu_has_submenu');
    if (!parent) return;
    // Clicks on the parent row itself (not on an item inside its submenu).
    if (parent.querySelector(':scope > .menu_submenu_list')?.contains(e.target)) return;
    e.stopPropagation();
    if (parent.classList.contains('disabled')) return;
    if (parent.classList.contains('submenu-open')) { parent.classList.remove('submenu-open'); closeSubmenus(parent); } else openSubmenu(parent);
  }, true);
  doc.addEventListener('click', (e) => {
    const title = e.target.closest?.('.vmenu-root .menu_entry_title');
    if (title) for (const n of title.parentElement.querySelectorAll('.kb-focus, .submenu-open')) n.classList.remove('kb-focus', 'submenu-open');
  }, true);
  // Any close of a top-level menu also resets its submenus.
  doc.addEventListener('click', () => { for (const r of doc.querySelectorAll('.vmenu-root')) closeSubmenus(r); for (const n of doc.querySelectorAll('.kb-focus')) n.classList.remove('kb-focus'); });

  // Window capture: runs before SVG-Edit's / Vector's document-level shortcuts (nudge, tools).
  (doc.defaultView || window).addEventListener('keydown', (e) => {
    const lists = openLists(doc);
    if (!lists.length) return;
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', ' ', 'Escape'];
    if (!keys.includes(e.key)) return;
    if (['input', 'textarea', 'select'].includes(doc.activeElement?.tagName?.toLowerCase())) return;
    const top = lists[0];
    // deepest open list (a submenu inside an open item)
    let list = top;
    for (;;) { const open = list.querySelector(':scope > .menu_has_submenu.submenu-open > .menu_submenu_list'); if (!open) break; list = open; }
    const items = visibleItems(list);
    const cur = items.find((n) => n.classList.contains('kb-focus'));
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      if (list !== top) { const p = list.parentElement; p.classList.remove('submenu-open'); setFocus(p.parentElement, p); return; }
      top.closest('.menu_entry')?.classList.remove('open');
      top.classList.contains('vmenu-popup') && top.classList.remove('open');
      closeSubmenus(top);
      for (const n of top.querySelectorAll('.kb-focus')) n.classList.remove('kb-focus');
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      const i = cur ? items.indexOf(cur) : -1;
      const next = e.key === 'ArrowDown' ? items[(i + 1) % items.length] : items[(i - 1 + items.length) % items.length];
      setFocus(list, next);
      return;
    }
    if (e.key === 'ArrowRight') {
      if (cur?.classList.contains('menu_has_submenu')) { const sub = openSubmenu(cur); const first = sub && visibleItems(sub)[0]; if (first) setFocus(sub, first); return; }
      const entry = top.closest('.menu_entry');
      const next = entry && [...entry.parentElement.querySelectorAll(':scope > .menu_entry')].at(([...entry.parentElement.querySelectorAll(':scope > .menu_entry')].indexOf(entry) + 1) % entry.parentElement.querySelectorAll(':scope > .menu_entry').length);
      if (next) { entry.classList.remove('open'); closeSubmenus(entry); next.classList.add('open'); }
      return;
    }
    if (e.key === 'ArrowLeft') {
      if (list !== top) { const p = list.parentElement; p.classList.remove('submenu-open'); setFocus(p.parentElement, p); return; }
      const entry = top.closest('.menu_entry');
      const all = entry ? [...entry.parentElement.querySelectorAll(':scope > .menu_entry')] : [];
      const prev = entry && all.at((all.indexOf(entry) - 1 + all.length) % all.length);
      if (prev) { entry.classList.remove('open'); closeSubmenus(entry); prev.classList.add('open'); }
      return;
    }
    // Enter / Space
    if (!cur) return;
    if (cur.classList.contains('menu_has_submenu')) { const sub = openSubmenu(cur); const first = sub && visibleItems(sub)[0]; if (first) setFocus(sub, first); return; }
    cur.click();
    doc.body.click();
  }, true);
  const api = { openSubmenu, closeSubmenus, openLists: () => openLists(doc) };
  doc.__visterasMenus = api;
  return api;
}
