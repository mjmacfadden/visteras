/* Shared windowed, distraction-free workspace. Tab restores the controls. */
(() => {
  // Keep the compact app identity beside document tabs, not in the workspace.
  const appIcon = document.querySelector('link[rel="icon"]')?.href;
  if (appIcon) document.documentElement.style.setProperty('--visteras-tab-icon', `url(${JSON.stringify(appIcon)})`);
  const style = document.createElement('style');
  style.textContent = `
    body.visteras-tool-free .document_tabs::before {
      content: '';
      display: block;
      flex: 0 0 32px;
      align-self: stretch;
      min-height: 28px;
      background: var(--visteras-tab-icon) center / 18px 18px no-repeat;
      pointer-events: none;
    }
    /* Remove the options bar itself: child controls can override inherited visibility. */
    body.visteras-tool-free #tools_top,
    body.visteras-tool-free #tools_left,
    body.visteras-tool-free #vdock,
    body.visteras-tool-free #vdock_flyout { display: none !important; }
    body.visteras-tool-free #main_button,
    body.visteras-tool-free #visteras_options_logo,
    body.visteras-tool-free .logo,
    body.visteras-tool-free .visteras_vector_logo_wrap,
    body.visteras-tool-free .visteras_publish_logo_wrap,
    body.visteras-tool-free .visteras_collage_logo_wrap,
    body.visteras-tool-free .visteras_inspire_logo_wrap { display: none !important; }
    body.visteras-tool-free #main_menu,
    body.visteras-tool-free #visteras_menu_bar,
    body.visteras-tool-free #tools_top,
    body.visteras-tool-free #tools_left,
    body.visteras-tool-free #tools_bottom,
    body.visteras-tool-free #sidepanels,
    body.visteras-tool-free #sidepanel_content,
    body.visteras-tool-free .sidebar_left,
    body.visteras-tool-free .sidebar_right,
    body.visteras-tool-free .submenu,
    body.visteras-tool-free .status_bar,
    body.visteras-tool-free .mobile_menu,
    body.visteras-tool-free #ruler_x,
    body.visteras-tool-free #ruler_y,
    body.visteras-tool-free #ruler_corner { visibility: hidden !important; pointer-events: none !important; }
    body.visteras-tool-free .document_tabs { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; height: 28px !important; min-height: 28px !important; margin: 0 !important; z-index: 1000 !important; visibility: visible !important; pointer-events: auto !important; }
    body.visteras-tool-free #workarea { position: fixed !important; inset: 28px 0 0 !important; width: auto !important; height: auto !important; margin: 0 !important; }
    body.visteras-tool-free #workarea:has(.inspire-viewport.mode-infinite) { inset: 0 0 0 0 !important; }
    body.visteras-tool-free .wrapper { inset: 0 !important; }
    body.visteras-tool-free #middle_area { position: fixed !important; inset: 0 !important; }
    body.visteras-tool-free #main_wrapper { position: absolute !important; inset: 28px 0 0 !important; width: auto !important; height: auto !important; }
  `;
  document.head.append(style);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.repeat || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const editing = event.composedPath().some(node => node?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(node?.tagName) || node?.getAttribute?.('role') === 'textbox');
    // Preserve normal keyboard navigation while a dialog or menu is open.
    const dialog = [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')].some(node => node.getClientRects().length);
    if (editing || dialog || event.target.closest?.('[role="menu"], .menu_dropdown_list')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.body.classList.toggle('visteras-tool-free');
    if (document.body.classList.contains('visteras-tool-free')) document.activeElement?.blur?.();
    window.dispatchEvent(new Event('resize'));
  }, true);
})();
