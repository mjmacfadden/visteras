/**
 * Visteras Vector — Collapsed Panel Dock & Flyout System
 *
 * Implements the Illustrator collapsed iconic panel dock pattern.
 * Dock groups top-to-bottom:
 *   1. Color (F6)
 *   2. Swatches
 *   3. Stroke (Cmd/Ctrl+F10) + Gradient (Cmd/Ctrl+F9) + Transparency (Shift+Cmd/Ctrl+F10)
 *   4. Layers (F7)
 *
 * Properties panel occupies the dedicated right column (#sidepanels).
 * Only one dock flyout is open at a time; auto-collapses on canvas click or Esc.
 */

const STORAGE_KEY = 'visteras-vector-dock';
const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 240;

/**
 * Illustrator panel shortcuts → panel id. Shift is significant:
 * F6 Color · ⇧F6 Appearance · F7 Layers · ⌘F10 Stroke · ⇧⌘F10 Transparency · ⌘F9 Gradient.
 */
export function panelForShortcut(e) {
  const key = e?.key === 'F6' || e?.code === 'F6' ? 'F6' : e?.key === 'F7' || e?.code === 'F7' ? 'F7'
    : e?.key === 'F9' || e?.code === 'F9' ? 'F9' : e?.key === 'F10' || e?.code === 'F10' ? 'F10' : null;
  if (!key || e.altKey) return null;
  const cmd = !!(e.metaKey || e.ctrlKey), shift = !!e.shiftKey;
  if (key === 'F6' && !cmd) return shift ? 'appearance' : 'color';
  if (key === 'F7' && !cmd && !shift) return 'layers';
  if (key === 'F10' && cmd) return shift ? 'transparency' : 'stroke';
  if (key === 'F9' && cmd && !shift) return 'gradient';
  return null;
}

/** Shared toast (bottom centre, orange). Also exposed as window.__visterasToast. */
export function showToast(msg, ms = 2600) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('visteras_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_toast';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:99999;padding:6px 12px;background:#1e1e1e;color:#fa7c1b;border:1px solid #fa7c1b;border-radius:4px;font-size:11px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.5);pointer-events:none;max-width:70vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { el.style.display = 'none'; }, ms);
}

export function mountVisterasPanelDock({ svgEditor }) {
  if (typeof document === 'undefined') return null;
  if (document.getElementById('vdock')) return window.__visterasDock;

  const sc = svgEditor?.svgCanvas;
  const container = document.getElementById('container') || document.body;
  const svgEditorEl = container.querySelector('.svg_editor') || container;
  const sidepanels = document.getElementById('sidepanels');

  // Load saved dock state
  let state = {
    v: 1,
    mode: 'iconic',
    open: null,
    activeTab: { stroke: 'stroke' },
    width: DEFAULT_WIDTH,
    autoCollapse: true,
    hidden: false,
    propertiesHidden: false,
  };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        state = { ...state, ...parsed };
        if (typeof state.width !== 'number' || isNaN(state.width)) {
          state.width = DEFAULT_WIDTH;
        }
        state.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, state.width));
      }
    }
  } catch (e) {
    console.warn('[panel-dock] Could not read localStorage:', e);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // quota / privacy
    }
  }

  // ─── 1. Build Dock Strip (#vdock) ──────────────────────────────────────────
  const dock = document.createElement('nav');
  dock.id = 'vdock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Panels Dock');

  dock.innerHTML = `
    <!-- Group 1: Color -->
    <div class="vdock-group" id="vdock_grp_color">
      <button type="button" class="vdock-icon" data-panel="color" title="Color (F6)" aria-label="Color (F6)" aria-expanded="false" aria-controls="vdock_flyout">
        <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M10 2.5a7.5 7.5 0 0 0-7.5 7.5c0 .6.4 1 1 1h1.8a2 2 0 0 1 2 2v1.5c0 .8.7 1.5 1.5 1.5H10a7.5 7.5 0 0 0 0-15zm-4 6.5a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm3-3a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm4 1a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm-7 5a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z"/>
        </svg>
      </button>
    </div>

    <!-- Group 2: Swatches -->
    <div class="vdock-group" id="vdock_grp_swatches">
      <button type="button" class="vdock-icon" data-panel="swatches" title="Swatches" aria-label="Swatches" aria-expanded="false" aria-controls="vdock_flyout">
        <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="6" height="6" rx="1"/>
          <rect x="11" y="3" width="6" height="6" rx="1"/>
          <rect x="3" y="11" width="6" height="6" rx="1"/>
          <rect x="11" y="11" width="6" height="6" rx="1"/>
        </svg>
      </button>
    </div>

    <div class="vdock-separator"></div>

    <!-- Group 3: Stroke -->
    <div class="vdock-group" id="vdock_grp_stroke">
      <button type="button" class="vdock-icon" data-panel="stroke" title="Stroke (⌘F10 / Ctrl+F10)" aria-label="Stroke (⌘F10 / Ctrl+F10)" aria-expanded="false" aria-controls="vdock_flyout">
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" aria-hidden="true">
          <line x1="3" y1="4.5" x2="17" y2="4.5" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="3" y1="9.5" x2="17" y2="9.5" stroke-width="2.4" stroke-linecap="round"/>
          <line x1="3" y1="15" x2="17" y2="15" stroke-width="4" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Group 4: Gradient -->
    <div class="vdock-group" id="vdock_grp_gradient">
      <button type="button" class="vdock-icon" data-panel="gradient" title="Gradient (⌘F9 / Ctrl+F9)" aria-label="Gradient (⌘F9 / Ctrl+F9)" aria-expanded="false" aria-controls="vdock_flyout">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <defs>
            <linearGradient id="vdock_gradient_ramp_icon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="currentColor" stop-opacity="0"/>
              <stop offset="100%" stop-color="currentColor" stop-opacity="1"/>
            </linearGradient>
          </defs>
          <rect x="1.5" y="3.5" width="17" height="13" rx="1.5" fill="url(#vdock_gradient_ramp_icon)" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
    </div>

    <!-- Group 4b: Transparency -->
    <div class="vdock-group" id="vdock_grp_effects">
      <button type="button" class="vdock-icon" data-panel="effects" title="Effects" aria-label="Effects" aria-expanded="false" aria-controls="vdock_flyout"><em aria-hidden="true">fx</em></button>
    </div>
    <div class="vdock-group" id="vdock_grp_transparency">
      <button type="button" class="vdock-icon" data-panel="transparency" title="Transparency (⇧⌘F10 / Shift+Ctrl+F10)" aria-label="Transparency (⇧⌘F10 / Shift+Ctrl+F10)" aria-expanded="false" aria-controls="vdock_flyout">
        <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="7.5" cy="10" r="5.2" fill="none" stroke="currentColor" stroke-width="1.3"/>
          <circle cx="12.5" cy="10" r="5.2" opacity="0.55"/>
        </svg>
      </button>
    </div>

    <div class="vdock-separator"></div>

    <!-- Group 5: Layers -->
    <div class="vdock-group" id="vdock_grp_layers">
      <button type="button" class="vdock-icon" data-panel="layers" title="Layers (F7)" aria-label="Layers (F7)" aria-expanded="false" aria-controls="vdock_flyout">
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
          <path d="M10 2.5 17 6l-7 3.5L3 6z"/>
          <path d="M3 10.5 10 14l7-3.5"/>
          <path d="M3 14.5 10 18l7-3.5"/>
        </svg>
      </button>
    </div>
  `;

  // Insert #vdock before #sidepanels in .svg_editor
  if (sidepanels && sidepanels.parentNode) {
    sidepanels.parentNode.insertBefore(dock, sidepanels);
  } else {
    svgEditorEl.appendChild(dock);
  }

  // ─── 2. Build Flyout Container (#vdock_flyout) ─────────────────────────────
  const flyout = document.createElement('div');
  flyout.id = 'vdock_flyout';
  flyout.setAttribute('role', 'dialog');
  flyout.setAttribute('aria-label', 'Panel');
  flyout.style.display = 'none';
  flyout.style.width = `${state.width}px`;

  flyout.innerHTML = `
    <div class="vdock-resize-handle" id="vdock_resize_handle" title="Drag to resize panel"></div>
    <div class="vdock-flyout-header" id="vdock_flyout_header">
      <div id="vdock_header_title_slot">
        <span class="vdock-flyout-title" id="vdock_flyout_title">Panel</span>
      </div>
      <button type="button" class="vdock-collapse-btn" id="vdock_collapse_btn" title="Close panel" aria-label="Close panel">×</button>
    </div>
    <div class="vdock-flyout-body" id="vdock_flyout_body"></div>
  `;

  document.body.appendChild(flyout);

  const flyoutBody = flyout.querySelector('#vdock_flyout_body');
  const titleSlot = flyout.querySelector('#vdock_header_title_slot');

  // ─── 3. Move & Assemble Panels into Flyout Body ───────────────────────────

  // (A) Color Panel (#vcs_color_panel)
  let colorPane = document.getElementById('vcs_color_panel');
  if (!colorPane) {
    colorPane = document.createElement('div');
    colorPane.id = 'vcs_color_panel';
  }
  colorPane.classList.add('vdock-panel-pane');
  colorPane.classList.remove('hidden', 'vcs-tab-pane', 'panel_tab_pane');
  flyoutBody.appendChild(colorPane);

  // (B) Swatches Panel (#vcs_swatches_panel)
  let swatchesPane = document.getElementById('vcs_swatches_panel');
  if (!swatchesPane) {
    swatchesPane = document.createElement('div');
    swatchesPane.id = 'vcs_swatches_panel';
  }
  swatchesPane.classList.add('vdock-panel-pane');
  swatchesPane.classList.remove('hidden', 'vcs-tab-pane', 'panel_tab_pane');
  flyoutBody.appendChild(swatchesPane);

  // (C) Remove retired #vcs_colors_block container from #sidepanels
  const oldColorsBlock = document.getElementById('vcs_colors_block');
  if (oldColorsBlock) {
    oldColorsBlock.remove();
  }

  // Ensure Color & Swatches content is mounted into these flyout panes
  window.__visterasColorSystem?.mountTabs?.();

  // (D) Stroke Panel (#vdock_stroke_panel)
  const strokePane = document.createElement('div');
  strokePane.id = 'vdock_stroke_panel';
  strokePane.className = 'vdock-panel-pane';

  strokePane.innerHTML = `
    <div class="vdock-stroke-row">
      <span class="vdock-stroke-label">Weight</span>
      <div class="vdock-stroke-control">
        <div class="vdock-stroke-weight-box">
          <input type="number" id="vdock_stroke_weight_input" min="0" max="999" step="any" value="1" aria-label="Stroke weight" />
        </div>
        <span style="color:#888; font-size:10px;">px</span>
      </div>
    </div>

    <div class="vdock-stroke-row" id="vdock_stroke_align_row">
      <span class="vdock-stroke-label">Align</span>
      <div class="vdock-stroke-control" id="vdock_stroke_align_slot"></div>
    </div>

    <div class="vdock-stroke-row">
      <span class="vdock-stroke-label">Cap / Join</span>
      <div class="vdock-stroke-control" style="gap:10px;" id="vdock_stroke_caps_slot"></div>
    </div>

    <div class="vdock-stroke-row">
      <span class="vdock-stroke-label">Dashed</span>
      <div class="vdock-stroke-control" id="vdock_stroke_style_slot"></div>
    </div>
  `;

  // Move #vcs_app_stroke_align into Stroke panel
  const strokeAlignEl = document.getElementById('vcs_app_stroke_align');
  if (strokeAlignEl) {
    strokePane.querySelector('#vdock_stroke_align_slot')?.appendChild(strokeAlignEl);
  }

  // Move SVG-Edit's cap & join controls (#stroke_linecap, #stroke_linejoin)
  const linecapEl = document.getElementById('stroke_linecap');
  const linejoinEl = document.getElementById('stroke_linejoin');
  const capsSlot = strokePane.querySelector('#vdock_stroke_caps_slot');
  if (linecapEl && capsSlot) capsSlot.appendChild(linecapEl);
  if (linejoinEl && capsSlot) capsSlot.appendChild(linejoinEl);

  // Move SVG-Edit's stroke style (#stroke_style)
  const strokeStyleEl = document.getElementById('stroke_style');
  if (strokeStyleEl) {
    strokePane.querySelector('#vdock_stroke_style_slot')?.appendChild(strokeStyleEl);
  }

  flyoutBody.appendChild(strokePane);

  // Wire Stroke weight input sync with Appearance weight input
  const dkW = strokePane.querySelector('#vdock_stroke_weight_input');
  const appW = document.getElementById('vcs_app_stroke_weight');
  if (dkW && appW) {
    dkW.value = appW.value || '1';
    dkW.addEventListener('input', () => {
      appW.value = dkW.value;
      appW.dispatchEvent(new Event('input', { bubbles: true }));
    });
    dkW.addEventListener('change', () => {
      appW.value = dkW.value;
      appW.dispatchEvent(new Event('change', { bubbles: true }));
    });
    appW.addEventListener('input', () => {
      if (document.activeElement !== dkW) dkW.value = appW.value;
    });
    appW.addEventListener('change', () => {
      if (document.activeElement !== dkW) dkW.value = appW.value;
    });
  }

  // (E) Gradient Panel (#vdock_gradient_panel) — empty pane; filled by
  // js/visteras-gradient-panel.js (mounted from index.html via mountGradient).
  const gradPane = document.createElement('div');
  gradPane.id = 'vdock_gradient_panel';
  gradPane.className = 'vdock-panel-pane';
  flyoutBody.appendChild(gradPane);

  const effectsPane = document.createElement('div');
  effectsPane.id = 'vdock_effects_panel';
  effectsPane.className = 'vdock-panel-pane';
  flyoutBody.appendChild(effectsPane);

  // (E2) Transparency Panel (#vdock_transparency_panel) — filled by js/visteras-transparency.js
  const transparencyPane = document.createElement('div');
  transparencyPane.id = 'vdock_transparency_panel';
  transparencyPane.className = 'vdock-panel-pane';
  flyoutBody.appendChild(transparencyPane);

  // (F) Layers Panel (#layerpanel)
  const layerPanel = document.getElementById('layerpanel');
  if (layerPanel) {
    layerPanel.classList.add('vdock-panel-pane');
    flyoutBody.appendChild(layerPanel);
  }

  // ─── 4. Flyout Positioning & Visibility ────────────────────────────────────

  function updateFlyoutPosition(targetIcon) {
    const dockRect = dock.getBoundingClientRect();
    const flyoutWidth = state.width || DEFAULT_WIDTH;
    flyout.style.width = `${flyoutWidth}px`;
    flyout.style.right = `${window.innerWidth - dockRect.left}px`;
    flyout.style.left = 'auto';

    let top = 45; // Below top bar
    if (targetIcon) {
      const iconRect = targetIcon.getBoundingClientRect();
      top = iconRect.top;
    }

    const maxH = Math.max(200, window.innerHeight - 69);
    flyout.style.maxHeight = `${maxH}px`;

    // Clamp top position so flyout stays inside viewport
    const expectedBottom = top + Math.min(flyout.offsetHeight || 300, maxH);
    if (expectedBottom > window.innerHeight - 24) {
      top = Math.max(45, window.innerHeight - 24 - (flyout.offsetHeight || 300));
    }
    flyout.style.top = `${Math.max(45, top)}px`;
  }

  function setFlyoutHeader(panelId) {
    const slot = titleSlot || flyout.querySelector('#vdock_header_title_slot');
    if (!slot) return;
    const titles = {
      color: 'Color',
      swatches: 'Swatches',
      stroke: 'Stroke',
      gradient: 'Gradient',
      effects: 'Effects',
      transparency: 'Transparency',
      layers: 'Layers',
    };
    slot.innerHTML = `<span class="vdock-flyout-title">${titles[panelId] || panelId}</span>`;
  }

  function updateWindowMenuCheckmarks() {
    const panels = ['color', 'swatches', 'stroke', 'gradient', 'effects', 'transparency', 'layers'];
    panels.forEach(p => {
      const item = document.getElementById(`action_window_${p}`);
      if (item) {
        let chk = item.querySelector('.menu_check');
        if (!chk) {
          chk = document.createElement('span');
          chk.className = 'menu_check';
          item.appendChild(chk);
        }
        chk.textContent = (state.open === p) ? '✓' : '';
      }
    });

    // Properties checkmark
    const propItem = document.getElementById('action_window_properties');
    if (propItem) {
      let chk = propItem.querySelector('.menu_check');
      if (!chk) {
        chk = document.createElement('span');
        chk.className = 'menu_check';
        propItem.appendChild(chk);
      }
      chk.textContent = (!state.propertiesHidden && !state.hidden) ? '✓' : '';
    }

    // Pathfinder checkmark
    const pathItem = document.getElementById('action_window_pathfinder');
    if (pathItem) {
      const panel = document.getElementById('visteras_pathfinder_panel');
      let chk = pathItem.querySelector('.menu_check');
      if (!chk) {
        chk = document.createElement('span');
        chk.className = 'menu_check';
        pathItem.appendChild(chk);
      }
      chk.textContent = (panel && panel.style.display !== 'none') ? '✓' : '';
    }
  }

  function open(panelId, options = {}) {
    if (!panelId) return;

    state.open = panelId;
    saveState();

    const targetBtn = dock.querySelector(`.vdock-icon[data-panel="${panelId}"]`);

    // Update dock icon active states
    dock.querySelectorAll('.vdock-icon').forEach(btn => {
      const isTarget = btn === targetBtn;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-expanded', String(isTarget));
      if (isTarget) {
        btn.setAttribute('pressed', 'true');
      } else {
        btn.removeAttribute('pressed');
      }
    });

    // Set header
    setFlyoutHeader(panelId);

    // Show appropriate pane in body
    const paneMap = {
      color: colorPane,
      swatches: swatchesPane,
      stroke: strokePane,
      gradient: gradPane,
      effects: effectsPane,
      transparency: transparencyPane,
      layers: layerPanel,
    };

    Object.entries(paneMap).forEach(([k, pane]) => {
      if (pane) {
        const isActive = (k === panelId);
        pane.classList.toggle('active', isActive);
        pane.classList.remove('hidden');
        pane.style.display = isActive ? (k === 'stroke' || k === 'gradient' ? 'flex' : 'block') : 'none';
      }
    });

    // Synchronize stroke weight when stroke panel opens
    if (panelId === 'stroke' && dkW && appW) {
      dkW.value = appW.value || '1';
    }

    // Refresh color system views if opening color or swatches
    if (panelId === 'color' || panelId === 'swatches') {
      window.__visterasColorSystem?.mountTabs?.();
      window.__visterasColorSystem?.refresh?.();
    }

    flyout.style.display = 'flex';
    updateFlyoutPosition(options.anchor || targetBtn);

    updateWindowMenuCheckmarks();
  }

  function close() {
    state.open = null;
    saveState();

    flyout.style.display = 'none';
    flyout.querySelectorAll('.vdock-panel-pane').forEach(pane => {
      pane.classList.remove('active');
      pane.style.display = 'none';
    });

    dock.querySelectorAll('.vdock-icon').forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('pressed');
    });

    updateWindowMenuCheckmarks();
  }

  function toggle(panelId) {
    if (state.open === panelId) {
      close();
    } else {
      open(panelId);
    }
  }

  function isOpen(panelId) {
    return panelId ? (state.open === panelId) : !!state.open;
  }

  // ─── 5. Wire Dock Events & Resizing ───────────────────────────────────────

  // Dock icon clicks
  dock.querySelectorAll('.vdock-icon').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = btn.dataset.panel;
      toggle(p);
    });
  });

  // Close button in flyout header
  flyout.querySelector('#vdock_collapse_btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  // Flyout left-edge resizing
  const resizeHandle = flyout.querySelector('#vdock_resize_handle');
  if (resizeHandle) {
    let isResizing = false;
    let startX = 0;
    let startW = DEFAULT_WIDTH;

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startW = flyout.offsetWidth;
      resizeHandle.classList.add('active');
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const dx = startX - e.clientX;
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + dx));
      state.width = newW;
      flyout.style.width = `${newW}px`;
      updateFlyoutPosition();
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        saveState();
      }
    });
  }

  // ─── 6. Panel Toggling & Keyboard Shortcuts ───────────────────────────────

  function toggleProperties() {
    state.propertiesHidden = !state.propertiesHidden;
    svgEditorEl.classList.toggle('visteras-properties-hidden', state.propertiesHidden);
    saveState();
    updateWindowMenuCheckmarks();
    return !state.propertiesHidden;
  }

  function togglePanels() {
    state.hidden = !state.hidden;
    svgEditorEl.classList.toggle('visteras-panels-hidden', state.hidden);
    if (state.hidden && state.open) close();
    saveState();
    updateWindowMenuCheckmarks();
    return !state.hidden;
  }

  // Keyboard shortcuts (capture mode)
  document.addEventListener('keydown', (e) => {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const isTyping = ['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase());

    // Esc: close flyout
    if (e.key === 'Escape' && state.open) {
      e.preventDefault();
      const lastOpen = state.open;
      close();
      const targetBtn = dock.querySelector(`.vdock-icon[data-panel="${lastOpen === 'gradient' ? 'stroke' : lastOpen}"]`);
      targetBtn?.focus();
      return;
    }

    // Shortcuts below should not trigger while typing in an input
    if (isTyping) return;

    // F6 Color · ⇧F6 Appearance · F7 Layers · ⌘F10 Stroke · ⇧⌘F10 Transparency · ⌘F9 Gradient
    const shortcutPanel = panelForShortcut(e);
    if (shortcutPanel) {
      e.preventDefault();
      if (shortcutPanel === 'appearance') {
        // No Appearance panel yet: never fall through to Color.
        (window.__visterasToast || showToast)('Appearance panel coming');
        return;
      }
      toggle(shortcutPanel);
      return;
    }

    // Tab / Shift+Tab: Toggle all panels or Properties panel
    if (e.key === 'Tab' && !e.altKey && !isCmdOrCtrl) {
      e.preventDefault();
      if (e.shiftKey) {
        toggleProperties();
      } else {
        togglePanels();
      }
    }
  }, { capture: true });

  // Window resize handler: update position & responsive breakpoint
  window.addEventListener('resize', () => {
    if (state.open) {
      updateFlyoutPosition();
    }
    // Responsive < 900px
    if (window.innerWidth < 900) {
      svgEditorEl.classList.add('visteras-properties-hidden');
    } else if (!state.propertiesHidden) {
      svgEditorEl.classList.remove('visteras-properties-hidden');
    }
  });

  // Apply initial hidden states
  if (state.hidden) svgEditorEl.classList.add('visteras-panels-hidden');
  if (state.propertiesHidden || window.innerWidth < 900) {
    svgEditorEl.classList.add('visteras-properties-hidden');
  }

  // ─── 7. Expose window.__visterasDock API ───────────────────────────────────
  const dockApi = {
    open,
    close,
    toggle,
    isOpen,
    toggleProperties,
    togglePanels,
    getState: () => ({ ...state }),
    updateWindowMenuCheckmarks,
  };

  window.__visterasDock = dockApi;
  if (!window.__visterasToast) window.__visterasToast = showToast;

  // Initial checkmark sync
  updateWindowMenuCheckmarks();

  return dockApi;
}
