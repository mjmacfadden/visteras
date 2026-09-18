import {
  mountCollageFontPicker,
  loadFontFamily,
  DEFAULT_FONT_FAMILY,
  isSystemFontFamily,
} from './visteras-font-bridge.js';

(function() {
  'use strict';

  // --- Available Pixabay Color Options ---
  const COLOR_OPTIONS = [
    { id: 'red', name: 'Red', hex: '#ef4444' },
    { id: 'orange', name: 'Orange', hex: '#f97316' },
    { id: 'yellow', name: 'Yellow', hex: '#eab308' },
    { id: 'green', name: 'Green', hex: '#22c55e' },
    { id: 'turquoise', name: 'Teal', hex: '#06b6d4' },
    { id: 'blue', name: 'Blue', hex: '#3b82f6' },
    { id: 'lilac', name: 'Lilac', hex: '#a855f7' },
    { id: 'pink', name: 'Pink', hex: '#ec4899' },
    { id: 'brown', name: 'Brown', hex: '#92400e' },
    { id: 'grayscale', name: 'Gray', hex: '#6b7280' },
    { id: 'black', name: 'Black', hex: '#18181b' },
    { id: 'white', name: 'White', hex: '#ffffff' },
  ];

  // --- Curated Theme Presets ---
  const THEME_PRESETS = [
    {
      id: 'autumn_mix',
      name: 'Autumn Mixed Fodder',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13C4 7 12 3 20 4c1 8-3 16-9 16z"></path><path d="M4 13l9-3"></path></svg>',
      q: 'autumn vintage leaves',
      colors: ['red', 'orange', 'yellow', 'brown'],
      style: 'illustration',
      source: 'both',
      category: ''
    },
    {
      id: 'vintage_news',
      name: 'Historic News & Headlines',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><path d="M18 14h-8"></path><path d="M15 18h-5"></path><path d="M10 6h8v4h-8V6z"></path></svg>',
      q: 'newspaper headlines news',
      colors: ['brown', 'grayscale', 'black'],
      style: 'all',
      source: 'loc',
      category: ''
    },
    {
      id: 'antique_ads',
      name: 'Antique Ads & Ephemera',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
      q: 'antique advertisement vintage paper label',
      colors: ['brown', 'yellow'],
      style: 'all',
      source: 'both',
      category: ''
    },
    {
      id: 'botanical',
      name: 'Botanical Herbarium',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-9"></path><path d="M9 7a3 3 0 0 1 6 0c0 3-3 6-3 6s-3-3-3-6z"></path><path d="M9 14c-3 0-5-2-5-5 3 0 5 2 5 5z"></path><path d="M15 14c3 0 5-2 5-5-3 0-5 2-5 5z"></path></svg>',
      q: 'botanical illustration flower vintage flora',
      colors: ['green', 'brown'],
      style: 'illustration',
      source: 'both',
      category: 'nature'
    },
    {
      id: 'wildlife',
      name: 'Victorian Wildlife & Birds',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h.01"></path><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L12 7"></path><path d="M6 18c0-3.3 2.7-6 6-6"></path><path d="M2 21l3-3"></path></svg>',
      q: 'vintage animal illustration bird wildlife',
      colors: [],
      style: 'illustration',
      source: 'both',
      category: 'animals'
    },
    {
      id: 'circus_theatre',
      name: 'Circus, Theatre & Playbills',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 22 22 22"></polygon><line x1="12" y1="2" x2="12" y2="22"></line><path d="M2 22a10 10 0 0 0 10-10"></path><path d="M22 22a10 10 0 0 1-10-10"></path></svg>',
      q: 'circus theatre entertainment broadside poster',
      colors: ['red', 'yellow'],
      style: 'all',
      source: 'both',
      category: ''
    },
    {
      id: 'retro_pop',
      name: 'Retro Pop & Comics',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
      q: 'retro comic vintage pop art poster',
      colors: ['yellow', 'pink', 'turquoise'],
      style: 'illustration',
      source: 'pixabay',
      category: ''
    },
    {
      id: 'textures',
      name: 'Textures & Old Paper',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>',
      q: 'grunge paper texture wood grain',
      colors: ['brown', 'grayscale'],
      style: 'photo',
      source: 'both',
      category: 'backgrounds'
    }
  ];

  // --- State Management ---
  const state = {
    activeTool: 'layout',
    activeLayoutId: 'grid-2x2',
    activePresetId: 'autumn_mix',
    
    // Search & Harmony Parameters
    imageSource: 'both', // 'both', 'pixabay', 'loc'
    searchQuery: 'autumn vintage leaves',
    selectedStyle: 'all',
    selectedCategory: '',
    selectedColors: ['red', 'orange', 'yellow', 'brown'], // Multi-select colors
    editorsChoice: false,
    
    // API Configuration
    apiEndpoint: localStorage.getItem('visteras_pixabay_endpoint') || '',
    directApiKey: localStorage.getItem('visteras_pixabay_key') || '8275657-8140dd6f1736f5e58a5c35ad4',
    apiCache: {},

    customImageUrl: '',
    
    // Viewport Zoom & Pan
    zoom: 1.0,
    panX: 0,
    panY: 0,
    spaceHeld: false,
    isPanning: false,
    dragStartX: 0,
    dragStartY: 0,

    // Text Overlay
    textOverlay: {
      content: '',
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: '400',
      fontSize: 28,
      fontColor: '#212529',
      bold: false,
      italic: false,
      underline: false,
      zIndex: 110,
      x: 0,
      y: 0
    },

    // SVG and Texture Effects
    selectedEffects: [],
    selectedOverlay: '',
    overlayOpacity: 100,
    overlayBlendMode: 'normal',

    // Paint Overlay
    paintEnabled: false,
    paintColor: '#F2B041',
    paintOpacity: 50,

    // Background Color
    backgroundColorEnabled: false,
    backgroundColor: '#E8D4B9',

    // Active collage items state
    items: [],
    onlinePool: [],
    assetsGenerated: false,
    savedCollages: []
  };

  // --- Layout Definitions ---
  const layouts = [
    { id: 'grid-2x2', name: '2 × 2 Equal Grid', count: 4, cols: 'repeat(2, 1fr)', rows: 'repeat(2, 1fr)', spans: [{c: 1, r: 1}, {c: 1, r: 1}, {c: 1, r: 1}, {c: 1, r: 1}] },
    { id: 'grid-3x3', name: '3 × 3 Mosaic', count: 9, cols: 'repeat(3, 1fr)', rows: 'repeat(3, 1fr)', spans: Array(9).fill({c: 1, r: 1}) },
    { id: 'grid-1-top-2-bot', name: '1 Top Feature + 2 Bottom', count: 3, cols: 'repeat(2, 1fr)', rows: 'repeat(2, 1fr)', spans: [{c: 2, r: 1}, {c: 1, r: 1}, {c: 1, r: 1}] },
    { id: 'grid-2-top-1-bot', name: '2 Top + 1 Bottom Feature', count: 3, cols: 'repeat(2, 1fr)', rows: 'repeat(2, 1fr)', spans: [{c: 1, r: 1}, {c: 1, r: 1}, {c: 2, r: 1}] },
    { id: 'grid-3-columns', name: '3 Tall Columns', count: 3, cols: 'repeat(3, 1fr)', rows: '1fr', spans: [{c: 1, r: 1}, {c: 1, r: 1}, {c: 1, r: 1}] },
    { id: 'grid-3-rows', name: '3 Wide Banners', count: 3, cols: '1fr', rows: 'repeat(3, 1fr)', spans: [{c: 1, r: 1}, {c: 1, r: 1}, {c: 1, r: 1}] },
    { id: 'grid-featured-left', name: '1 Left Hero + 2 Right Stack', count: 3, cols: 'repeat(2, 1fr)', rows: 'repeat(2, 1fr)', spans: [{c: 1, r: 2}, {c: 1, r: 1}, {c: 1, r: 1}] },
    { id: 'grid-featured-right', name: '2 Left Stack + 1 Right Hero', count: 3, cols: 'repeat(2, 1fr)', rows: 'repeat(2, 1fr)', spans: [{c: 1, r: 1}, {c: 1, r: 2}, {c: 1, r: 1}] },
    { id: 'grid-6-strip', name: '2 × 3 Magazine Sheet', count: 6, cols: 'repeat(2, 1fr)', rows: 'repeat(3, 1fr)', spans: Array(6).fill({c: 1, r: 1}) }
  ];

  // --- DOM Elements ---
  const el = {};

  function initElements() {
    el.workarea = document.getElementById('workarea');
    el.viewport = document.getElementById('canvas_viewport');
    el.letterPage = document.getElementById('letter-page');
    el.container = document.getElementById('collage-container');
    el.generateOverlay = document.getElementById('generate-overlay');
    el.textureLayer = document.getElementById('texture-overlay-layer');
    el.paintLayer = document.getElementById('paint-overlay-layer');
    el.textOverlay = document.getElementById('text-overlay');
    el.textContent = document.getElementById('text-content');
    el.statusBarStatus = document.getElementById('status-bar-text');
    el.statusLayout = document.getElementById('status-layout-text');
    el.statusZoomBtn = document.getElementById('status-zoom-btn');
    el.queryInput = document.getElementById('pixabayQueryInput');
    el.styleSelect = document.getElementById('pixabayStyleSelect');
    el.imageSourceSelect = document.getElementById('imageSourceSelect');
    el.editorsChoiceToggle = document.getElementById('editorsChoiceToggle');
  }

  // --- UI Toast / Feedback ---
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '32px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(20, 20, 20, 0.92)';
    toast.style.color = '#ffffff';
    toast.style.border = '1px solid #a855f7';
    toast.style.borderRadius = '3px';
    toast.style.padding = '6px 14px';
    toast.style.fontSize = '11px';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.2s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  // --- Viewport Zoom & Pan System ---
  function applyViewportTransform() {
    if (!el.viewport) return;
    el.viewport.style.transform = `translate(calc(-50% + ${state.panX}px), calc(-50% + ${state.panY}px)) scale(${state.zoom})`;
    if (el.statusZoomBtn) {
      el.statusZoomBtn.textContent = `${Math.round(state.zoom * 100)}%`;
    }
  }

  function fitToWorkspace() {
    if (!el.workarea) return;
    const availW = el.workarea.clientWidth - 48;
    const availH = el.workarea.clientHeight - 48;
    const scale = Math.min(availW / 816, availH / 1056);
    state.zoom = Math.max(0.15, Math.min(2.5, Math.round(scale * 100) / 100));
    state.panX = 0;
    state.panY = 0;
    applyViewportTransform();
  }

  function setZoom(newZoom) {
    state.zoom = Math.max(0.1, Math.min(4.0, Math.round(newZoom * 100) / 100));
    applyViewportTransform();
  }

  // --- Tool & Panel Switching ---
  function selectTool(toolName) {
    state.activeTool = toolName;
    document.querySelectorAll('.tool_btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    document.querySelectorAll('.sidepanel_pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `panel_${toolName}`);
    });
  }

  // --- Multi-Select Color Harmony Palette ---
  function renderColorChips() {
    const container = document.getElementById('color-chip-group');
    if (!container) return;
    container.innerHTML = '';

    COLOR_OPTIONS.forEach(col => {
      const chip = document.createElement('div');
      const isSelected = state.selectedColors.includes(col.id);
      chip.className = `color-chip ${isSelected ? 'active' : ''}`;
      chip.innerHTML = `
        <span class="color-chip-dot" style="background: ${col.hex}; ${col.id === 'white' ? 'border: 1px solid #666;' : ''}"></span>
        <span>${col.name}</span>
      `;
      chip.addEventListener('click', () => {
        if (state.selectedColors.includes(col.id)) {
          state.selectedColors = state.selectedColors.filter(c => c !== col.id);
        } else {
          state.selectedColors.push(col.id);
        }
        renderColorChips();
      });
      container.appendChild(chip);
    });
  }

  // --- Theme Presets Rendering ---
  function renderThemePresets() {
    const list = document.getElementById('theme-presets-list');
    if (!list) return;
    list.innerHTML = '';

    THEME_PRESETS.forEach(preset => {
      const card = document.createElement('div');
      card.className = `preset-card ${state.activePresetId === preset.id ? 'active' : ''}`;
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 7px; overflow: hidden;">
          <span style="color: var(--collage-purple); display: flex; align-items: center; flex-shrink: 0;">${preset.icon || ''}</span>
          <span style="font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${preset.name}</span>
        </div>
        <span style="font-size: 9px; color: #888888; margin-left: 6px; flex-shrink: 0;">${preset.colors.join(', ') || 'Any'}</span>
      `;
      card.addEventListener('click', () => {
        applyPreset(preset);
      });
      list.appendChild(card);
    });
  }

  function applyPreset(preset) {
    state.activePresetId = preset.id;
    state.searchQuery = preset.q;
    state.selectedStyle = preset.style || 'all';
    state.selectedCategory = preset.category || '';
    state.selectedColors = preset.colors ? [...preset.colors] : [];
    if (preset.source) {
      state.imageSource = preset.source;
      if (el.imageSourceSelect) el.imageSourceSelect.value = preset.source;
    }

    if (el.queryInput) el.queryInput.value = state.searchQuery;
    if (el.styleSelect) el.styleSelect.value = state.selectedStyle;

    renderThemePresets();
    renderColorChips();
    generateFodder();
  }

  // --- Layout Rendering in Panel ---
  function applyLayout(layoutId) {
    state.activeLayoutId = layoutId;
    const layout = layouts.find(l => l.id === layoutId) || layouts[0];
    renderLayoutList();

    if (!state.assetsGenerated || !state.items || state.items.length === 0) {
      generateFodder();
      return;
    }

    el.container.innerHTML = '';
    el.container.style.gridTemplateColumns = layout.cols;
    el.container.style.gridTemplateRows = layout.rows;

    const prevItems = [...state.items];
    state.items = [];

    const pool = (state.onlinePool && state.onlinePool.length > 0) ? state.onlinePool : [];

    for (let i = 0; i < layout.count; i++) {
      const span = layout.spans[i] || { c: 1, r: 1 };
      let chosenImg = null;
      let prevPanX = 0;
      let prevPanY = 0;
      let prevZoom = 1.0;
      let prevLocked = false;

      if (prevItems[i]) {
        if (prevItems[i].image) chosenImg = prevItems[i].image;
        if (prevItems[i].panX !== undefined) prevPanX = prevItems[i].panX;
        if (prevItems[i].panY !== undefined) prevPanY = prevItems[i].panY;
        if (prevItems[i].zoom !== undefined) prevZoom = prevItems[i].zoom;
        if (prevItems[i].locked !== undefined) prevLocked = prevItems[i].locked;
      }

      if (!chosenImg) {
        if (pool.length > 0) {
          chosenImg = pool[i % pool.length];
        } else {
          chosenImg = { path: '', largePath: '', attribution: 'None' };
        }
      }

      const itemData = {
        index: i,
        image: chosenImg,
        zoom: prevZoom,
        panX: prevPanX,
        panY: prevPanY,
        span: span,
        locked: prevLocked
      };
      state.items.push(itemData);

      const tile = createTileElement(itemData, i, pool);
      el.container.appendChild(tile);
    }

    applySvgEffectsToItems();
    applyTextureOverlay();
    applyPaintOverlay();
    updateTextOverlay();

    if (el.statusLayout) el.statusLayout.textContent = layout.name;
    if (el.statusBarStatus) el.statusBarStatus.textContent = `Ready (${layout.count} tiles)`;
  }

  function renderLayoutList() {
    const list = document.getElementById('layout-list');
    if (!list) return;
    list.innerHTML = '';

    layouts.forEach(layout => {
      const card = document.createElement('div');
      card.className = `layout-card ${state.activeLayoutId === layout.id ? 'active' : ''}`;
      card.innerHTML = `
        <span style="font-weight: 600;">${layout.name}</span>
        <span style="color: #888888; font-size: 10px;">${layout.count} tiles</span>
      `;
      card.addEventListener('click', () => {
        applyLayout(layout.id);
      });
      list.appendChild(card);
    });

    const quickSel = document.getElementById('quick-layout-select');
    if (quickSel) {
      quickSel.innerHTML = layouts.map(l => `<option value="${l.id}" ${l.id === state.activeLayoutId ? 'selected' : ''}>${l.name}</option>`).join('');
      quickSel.onchange = (e) => {
        applyLayout(e.target.value);
      };
    }
  }

  // --- Texture Overlay Rendering ---
  function renderOverlayList() {
    const list = document.getElementById('overlay-list');
    if (!list || typeof overlays === 'undefined') return;
    list.innerHTML = '';

    overlays.forEach(ov => {
      const row = document.createElement('label');
      row.className = 'panel_checkbox_row';
      row.innerHTML = `
        <input type="radio" name="texture_overlay" value="${ov.path}" ${state.selectedOverlay === ov.path ? 'checked' : ''}>
        <span>${ov.name}</span>
      `;
      row.querySelector('input').addEventListener('change', (e) => {
        state.selectedOverlay = e.target.value;
        applyTextureOverlay();
      });
      list.appendChild(row);
    });
  }

  function applyTextureOverlay() {
    if (!el.textureLayer) return;
    if (state.selectedOverlay) {
      el.textureLayer.style.display = 'block';
      el.textureLayer.style.backgroundImage = `url(${state.selectedOverlay})`;
      el.textureLayer.style.opacity = (state.overlayOpacity / 100).toString();
      el.textureLayer.style.mixBlendMode = state.overlayBlendMode;
    } else {
      el.textureLayer.style.display = 'none';
    }
  }

  function applyPaintOverlay() {
    if (!el.paintLayer) return;
    if (state.paintEnabled) {
      el.paintLayer.style.display = 'block';
      el.paintLayer.style.backgroundColor = state.paintColor;
      el.paintLayer.style.opacity = (state.paintOpacity / 100).toString();
      el.paintLayer.style.mixBlendMode = 'multiply';
    } else {
      el.paintLayer.style.display = 'none';
    }

    if (el.letterPage) {
      el.letterPage.style.backgroundColor = state.backgroundColorEnabled ? state.backgroundColor : '#ffffff';
    }
  }

  // --- SVG Filter Effects ---
  function applySvgEffectsToItems() {
    const effects = (state && Array.isArray(state.selectedEffects)) ? state.selectedEffects : [];
    const filterString = effects.map(eff => `url(#svg-${eff})`).join(' ');
    document.querySelectorAll('.collage-item img').forEach(img => {
      img.style.filter = filterString || 'none';
    });
  }

  // --- Text Overlay & Font Engine Handling ---
  let fontPickerInstance = null;

  function initFontPicker() {
    const slot = document.getElementById('slot_font_family');
    const weightSel = document.getElementById('fontWeight');
    if (slot && !fontPickerInstance) {
      fontPickerInstance = mountCollageFontPicker({
        slotElement: slot,
        weightSelectElement: weightSel,
        initialFamily: state.textOverlay.fontFamily || DEFAULT_FONT_FAMILY,
        initialWeight: state.textOverlay.fontWeight || '400',
        onFontChange: (family, weight) => {
          state.textOverlay.fontFamily = family;
          state.textOverlay.fontWeight = weight;
          updateTextOverlay();
        }
      });
    }
  }

  function updateTextOverlay() {
    if (!el.textOverlay || !el.textContent) return;
    const txt = state.textOverlay.content.trim();
    if (!txt) {
      el.textOverlay.style.display = 'none';
      return;
    }

    el.textOverlay.style.display = 'inline-block';
    el.textContent.textContent = txt;
    el.textOverlay.style.fontFamily = `"${state.textOverlay.fontFamily}", sans-serif`;
    el.textOverlay.style.fontSize = `${state.textOverlay.fontSize}px`;
    el.textOverlay.style.color = state.textOverlay.fontColor;
    el.textOverlay.style.fontWeight = state.textOverlay.fontWeight || (state.textOverlay.bold ? '700' : '400');
    el.textOverlay.style.fontStyle = state.textOverlay.italic ? 'italic' : 'normal';
    el.textOverlay.style.textDecoration = state.textOverlay.underline ? 'underline' : 'none';
    el.textOverlay.style.zIndex = state.textOverlay.zIndex;

    const fontBoldBtn = document.getElementById('fontBold');
    if (fontBoldBtn) {
      const isBold = parseInt(state.textOverlay.fontWeight || '400', 10) >= 700;
      fontBoldBtn.classList.toggle('active', isBold);
    }
  }

  function initTextInteract() {
    if (typeof interact === 'undefined' || !el.textOverlay) return;

    interact('#text-overlay').draggable({
      inertia: true,
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: '#letter-page',
          endOnly: true
        })
      ],
      listeners: {
        move(event) {
          state.textOverlay.x += event.dx;
          state.textOverlay.y += event.dy;
          event.target.style.transform = `translate(calc(-50% + ${state.textOverlay.x}px), calc(-50% + ${state.textOverlay.y}px))`;
        }
      }
    });
  }

  // --- Fast Pixabay Fetch Engine ---
  async function fetchSinglePixabayQuery(query, color, imageType, category, editorsChoice) {
    let url = '';
    if (state.apiEndpoint) {
      url = `${state.apiEndpoint}?q=${encodeURIComponent(query)}&image_type=${encodeURIComponent(imageType)}&safesearch=true&per_page=30`;
      if (color) url += `&colors=${encodeURIComponent(color)}`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (editorsChoice) url += `&editors_choice=true`;
    } else if (state.directApiKey) {
      url = `https://pixabay.com/api/?key=${state.directApiKey}&q=${encodeURIComponent(query)}&image_type=${encodeURIComponent(imageType)}&safesearch=true&per_page=30`;
      if (color) url += `&colors=${encodeURIComponent(color)}`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (editorsChoice) url += `&editors_choice=true`;
    }

    if (!url) return [];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000); // 4s timeout
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.hits)) {
          return data.hits.map(h => ({
            id: `pixabay-${h.id}`,
            path: h.webformatURL,
            largePath: h.largeImageURL || h.webformatURL,
            attribution: h.user ? `${h.user} (Pixabay)` : 'Pixabay',
            link: h.pageURL,
            source: 'pixabay'
          }));
        }
      }
    } catch (err) {
      console.warn('Pixabay query warning:', err);
    }
    return [];
  }

  async function fetchPixabayImagesFast() {
    const query = state.searchQuery || 'vintage';
    const colors = state.selectedColors || [];
    const imageType = state.selectedStyle || 'all';
    const category = state.selectedCategory || '';
    const editorsChoice = state.editorsChoice;

    const cacheKey = `pixabay|${query}|${colors.join(',')}|${imageType}|${category}|${editorsChoice}`;
    if (state.apiCache[cacheKey]) {
      return state.apiCache[cacheKey];
    }

    if (!state.apiEndpoint && !state.directApiKey) {
      return [];
    }

    let hits = [];
    if (colors.length > 0 && colors.length <= 2) {
      const promises = colors.map(col => fetchSinglePixabayQuery(query, col, imageType, category, editorsChoice));
      const res = await Promise.all(promises);
      hits = res.flat();
    } else {
      hits = await fetchSinglePixabayQuery(query, '', imageType, category, editorsChoice);
    }

    if (hits.length === 0 && query.includes(' ')) {
      const broadTerm = query.split(' ')[0];
      hits = await fetchSinglePixabayQuery(broadTerm, '', 'all', '', false);
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const h of hits) {
      if (!seen.has(h.id)) {
        seen.add(h.id);
        unique.push(h);
      }
    }

    if (unique.length > 0) {
      state.apiCache[cacheKey] = unique;
    }
    return unique;
  }

  // --- Fast Library of Congress API Engine with Strict Timeout ---
  async function fetchChroniclingAmericaImagesFast(query) {
    const q = query || 'newspaper vintage';
    const cacheKey = `loc|${q}`;
    if (state.apiCache[cacheKey]) {
      return state.apiCache[cacheKey];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500); // 2.5s max timeout to prevent UI lag

    const url = `https://www.loc.gov/collections/chronicling-america/?fo=json&q=${encodeURIComponent(q)}&c=20`;
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          const mapped = [];
          for (const item of data.results) {
            if (!item.image_url || !Array.isArray(item.image_url)) continue;
            const jpgs = item.image_url.filter(u => typeof u === 'string' && u.includes('.jpg'));
            if (jpgs.length === 0) continue;

            const preview = (jpgs[Math.min(1, jpgs.length - 1)] || jpgs[0]).split('#')[0];
            const large = preview.replace(/pct:\d+(\.\d+)?/, 'pct:25');

            mapped.push({
              id: `loc-${item.id || item.date || Math.random()}`,
              path: preview,
              largePath: large,
              attribution: item.title ? `${item.title.slice(0, 40)} (${item.date || 'LOC'})` : 'Chronicling America (LOC)',
              link: item.url || 'https://www.loc.gov/collections/chronicling-america/',
              source: 'loc'
            });
          }
          if (mapped.length > 0) {
            state.apiCache[cacheKey] = mapped;
            return mapped;
          }
        }
      }
    } catch (err) {
      clearTimeout(timer);
    }
    return [];
  }

  // --- Tile Dimension and Panning Clamp Helpers ---
  function getTileDimensions(tile, img) {
    const tw = (tile && tile.clientWidth) ? tile.clientWidth : 300;
    const th = (tile && tile.clientHeight) ? tile.clientHeight : 300;
    const nw = (img && img.naturalWidth) ? img.naturalWidth : tw;
    const nh = (img && img.naturalHeight) ? img.naturalHeight : th;
    const scaleCover = Math.max(tw / nw, th / nh);
    const baseWidth = nw * scaleCover;
    const baseHeight = nh * scaleCover;
    return { tw, th, nw, nh, baseWidth, baseHeight };
  }

  function clampTilePan(itemData, tile, img) {
    if (!img || !tile) return;
    const { tw, th, baseWidth, baseHeight } = getTileDimensions(tile, img);
    const zoom = Math.max(1.0, itemData.zoom || 1.0);
    const renderedW = baseWidth * zoom;
    const renderedH = baseHeight * zoom;

    const maxPanX = Math.max(0, (renderedW - tw) / 2);
    const maxPanY = Math.max(0, (renderedH - th) / 2);

    itemData.panX = Math.min(maxPanX, Math.max(-maxPanX, itemData.panX || 0));
    itemData.panY = Math.min(maxPanY, Math.max(-maxPanY, itemData.panY || 0));
  }

  // --- Tile Image Load & Spinner Binding ---
  function bindTileImageEvents(img, spinnerEl) {
    function markDone() {
      img.classList.add('loaded');
      if (spinnerEl) spinnerEl.classList.add('hidden');
      const tile = img.closest('.collage-item');
      if (tile) {
        const itemIdx = Array.from(tile.parentElement ? tile.parentElement.children : []).indexOf(tile);
        const itemData = state.items[itemIdx];
        if (itemData) {
          updateTileTransform(img, itemData, tile);
        }
      }
    }

    if (!img.src || img.src === window.location.href) {
      img.classList.remove('loaded');
      if (spinnerEl) spinnerEl.classList.remove('hidden');
      return;
    }

    if (img.complete && img.naturalWidth > 0) {
      markDone();
    } else {
      img.classList.remove('loaded');
      if (spinnerEl) spinnerEl.classList.remove('hidden');
      img.onload = markDone;
      img.onerror = function() {
        if (spinnerEl) spinnerEl.classList.add('hidden');
      };
    }
  }

  // --- Transform & Tile Element Helper ---
  function updateTileTransform(img, itemData, tile) {
    if (!img) return;
    const parentTile = tile || img.closest('.collage-item');
    if (parentTile && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const { baseWidth, baseHeight } = getTileDimensions(parentTile, img);
      img.style.width = `${baseWidth}px`;
      img.style.height = `${baseHeight}px`;
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.position = 'absolute';
      img.style.top = '50%';
      img.style.left = '50%';
      clampTilePan(itemData, parentTile, img);
    }
    const z = Math.max(1.0, itemData.zoom || 1.0);
    const px = itemData.panX || 0;
    const py = itemData.panY || 0;
    img.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px) scale(${z})`;
  }

  function createTileElement(itemData, i, availablePool) {
    const tile = document.createElement('div');
    tile.className = 'collage-item';
    tile.style.gridColumn = `span ${itemData.span ? itemData.span.c : 1}`;
    tile.style.gridRow = `span ${itemData.span ? itemData.span.r : 1}`;

    // Loading Spinner
    const spinner = document.createElement('div');
    spinner.className = 'tile-spinner';
    spinner.setAttribute('data-html2canvas-ignore', 'true');
    spinner.innerHTML = `
      <svg class="spinner-svg" viewBox="0 0 24 24" width="22" height="22">
        <circle cx="12" cy="12" r="9" stroke="rgba(168, 85, 247, 0.2)" stroke-width="2.5" fill="none"></circle>
        <circle cx="12" cy="12" r="9" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" fill="none" stroke-dasharray="28" stroke-dashoffset="10"></circle>
      </svg>
    `;

    // Tile Image
    const img = document.createElement('img');
    if (itemData.image && itemData.image.path) {
      img.src = itemData.image.path;
      img.dataset.largeSrc = itemData.image.largePath || itemData.image.path;
      img.alt = itemData.image.attribution || `Collage tile ${i + 1}`;
      bindTileImageEvents(img, spinner);
    } else {
      img.alt = `Loading tile ${i + 1}...`;
    }
    updateTileTransform(img, itemData, tile);

    // Zoom Popover (Minimalist & Granular)
    const zoomPopover = document.createElement('div');
    zoomPopover.className = 'tile-zoom-popover hidden';
    zoomPopover.setAttribute('data-html2canvas-ignore', 'true');
    zoomPopover.innerHTML = `
      <div class="tile-zoom-popover-header">
        <span>ZOOM</span>
        <span class="tile-zoom-val">${Math.round((itemData.zoom || 1) * 100)}%</span>
      </div>
      <input type="range" class="tile-zoom-slider" min="1.0" max="3.5" step="0.01" value="${itemData.zoom || 1}" />
    `;

    const zoomSlider = zoomPopover.querySelector('.tile-zoom-slider');
    const zoomValText = zoomPopover.querySelector('.tile-zoom-val');

    // Controls Toolbar
    const controls = document.createElement('div');
    controls.className = 'image-controls';
    controls.setAttribute('data-html2canvas-ignore', 'true');
    controls.innerHTML = `
      <button class="tile-icon-btn btn-replace" title="Replace tile">
        <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
      </button>
      <button class="tile-icon-btn btn-zoom" title="Zoom & Position">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
      </button>
    `;

    // Replace Button Event
    const btnReplace = controls.querySelector('.btn-replace');
    btnReplace.addEventListener('click', (e) => {
      e.stopPropagation();
      const pool = (state.onlinePool && state.onlinePool.length > 0) ? state.onlinePool : availablePool;
      if (pool && pool.length > 0) {
        const next = pool[Math.floor(Math.random() * pool.length)];
        if (next) {
          itemData.image = next;
          itemData.locked = true;
          img.src = next.path;
          img.dataset.largeSrc = next.largePath || next.path;
          img.alt = next.attribution || `Collage tile ${i + 1}`;
          bindTileImageEvents(img, spinner);
        }
      }
    });

    // Zoom Button Event (Toggles Popover)
    const btnZoom = controls.querySelector('.btn-zoom');
    btnZoom.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = zoomPopover.classList.contains('hidden');
      document.querySelectorAll('.tile-zoom-popover').forEach(pop => {
        if (pop !== zoomPopover) pop.classList.add('hidden');
      });
      if (isHidden) {
        zoomSlider.value = itemData.zoom || 1;
        zoomValText.textContent = `${Math.round((itemData.zoom || 1) * 100)}%`;
        zoomPopover.classList.remove('hidden');
      } else {
        zoomPopover.classList.add('hidden');
      }
    });

    // Slider Input Event (Granular Zooming)
    zoomSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      itemData.zoom = parseFloat(e.target.value);
      zoomValText.textContent = `${Math.round(itemData.zoom * 100)}%`;
      updateTileTransform(img, itemData, tile);
    });
    zoomSlider.addEventListener('click', (e) => e.stopPropagation());
    zoomSlider.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Prevent popover / control clicks from triggering tile dragging
    zoomPopover.addEventListener('pointerdown', (e) => e.stopPropagation());
    controls.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Freeform Tile Dragging / Repositioning with Boundary Clamp
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;

    tile.addEventListener('pointerdown', (e) => {
      if (state.spaceHeld || e.button !== 0) return;
      if (e.target.closest('.image-controls') || e.target.closest('.tile-zoom-popover')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = itemData.panX || 0;
      startPanY = itemData.panY || 0;

      tile.classList.add('is-panning');
      try {
        tile.setPointerCapture(e.pointerId);
      } catch (_) {}
    });

    tile.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const workspaceZoom = state.zoom || 1;
      const dx = (e.clientX - startX) / workspaceZoom;
      const dy = (e.clientY - startY) / workspaceZoom;

      itemData.panX = startPanX + dx;
      itemData.panY = startPanY + dy;
      updateTileTransform(img, itemData, tile);
    });

    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      tile.classList.remove('is-panning');
      try {
        tile.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    tile.addEventListener('pointerup', endDrag);
    tile.addEventListener('pointercancel', endDrag);

    tile.appendChild(spinner);
    tile.appendChild(img);
    tile.appendChild(zoomPopover);
    tile.appendChild(controls);

    return tile;
  }

  // --- Render Initial Empty Loading Skeletons ---
  function renderLoadingSkeletonTiles() {
    const layout = layouts.find(l => l.id === state.activeLayoutId) || layouts[0];
    if (!el.container) return;

    el.container.innerHTML = '';
    el.container.style.gridTemplateColumns = layout.cols;
    el.container.style.gridTemplateRows = layout.rows;
    state.items = [];

    for (let i = 0; i < layout.count; i++) {
      const span = layout.spans[i] || { c: 1, r: 1 };
      const itemData = {
        index: i,
        image: { path: '', largePath: '', attribution: '' },
        zoom: 1.0,
        panX: 0,
        panY: 0,
        span: span,
        locked: false
      };
      state.items.push(itemData);

      const tile = createTileElement(itemData, i, []);
      el.container.appendChild(tile);
    }
  }

  // --- Render Live API Images into Tiles ---
  function renderTilesWithPool(pool, isLiveUpdate = false) {
    const layout = layouts.find(l => l.id === state.activeLayoutId) || layouts[0];
    if (!el.container) return;

    if (!isLiveUpdate) {
      el.container.innerHTML = '';
      el.container.style.gridTemplateColumns = layout.cols;
      el.container.style.gridTemplateRows = layout.rows;
      state.items = [];
    }

    const availablePool = (pool && pool.length > 0) ? pool : [];
    const shuffledPool = [...availablePool].sort(() => 0.5 - Math.random());

    for (let i = 0; i < layout.count; i++) {
      const span = layout.spans[i] || { c: 1, r: 1 };
      let chosenImg = null;

      if (state.customImageUrl && i === 0) {
        chosenImg = { path: state.customImageUrl, largePath: state.customImageUrl, attribution: 'Custom URL' };
      } else if (shuffledPool.length > 0) {
        chosenImg = shuffledPool[i % shuffledPool.length];
      } else {
        chosenImg = { path: '', largePath: '', attribution: 'No API image' };
      }

      if (isLiveUpdate && state.items[i]) {
        if (!state.items[i].locked) {
          state.items[i].image = chosenImg;
          const tile = el.container.children[i];
          if (tile) {
            const img = tile.querySelector('img');
            const spinnerEl = tile.querySelector('.tile-spinner');
            if (img && spinnerEl) {
              img.src = chosenImg.path;
              img.dataset.largeSrc = chosenImg.largePath || chosenImg.path;
              img.alt = chosenImg.attribution || `Collage tile ${i + 1}`;
              bindTileImageEvents(img, spinnerEl);
              updateTileTransform(img, state.items[i]);
            }
          }
        }
        continue;
      }

      const itemData = {
        index: i,
        image: chosenImg,
        zoom: 1.0,
        panX: 0,
        panY: 0,
        span: span,
        locked: false
      };
      state.items.push(itemData);

      const tile = createTileElement(itemData, i, availablePool);
      el.container.appendChild(tile);
    }

    applySvgEffectsToItems();
    applyTextureOverlay();
    applyPaintOverlay();
    updateTextOverlay();

    if (el.statusLayout) el.statusLayout.textContent = layout.name;
  }

  // --- Generate Fodder Grid (Strictly API-Driven) ---
  let currentGenerationId = 0;

  async function generateFodder() {
    const genId = ++currentGenerationId;
    initElements();
    if (el.generateOverlay) el.generateOverlay.classList.add('hidden');
    state.assetsGenerated = true;

    const query = state.searchQuery || 'vintage';
    const src = state.imageSource || 'both';
    const masterCacheKey = `${src}|${query}|${state.selectedColors.join(',')}|${state.selectedStyle}|${state.selectedCategory}`;

    // If already in API cache from this session, render immediately
    const cachedHits = state.apiCache[masterCacheKey];
    if (cachedHits && cachedHits.length > 0) {
      state.onlinePool = cachedHits;
      renderTilesWithPool(cachedHits, false);
      if (el.statusBarStatus) el.statusBarStatus.textContent = `Ready (${cachedHits.length} live API images)`;
      return;
    }

    // Show active loading skeleton with spinning loaders
    renderLoadingSkeletonTiles();
    if (el.statusBarStatus) {
      el.statusBarStatus.textContent = `Searching API for "${query}"...`;
    }

    try {
      let liveHits = [];

      if (src === 'pixabay') {
        liveHits = await fetchPixabayImagesFast();
      } else if (src === 'loc') {
        liveHits = await fetchChroniclingAmericaImagesFast(query);
      } else {
        // Both: Pixabay + LOC
        const [pResult, lResult] = await Promise.allSettled([
          fetchPixabayImagesFast(),
          fetchChroniclingAmericaImagesFast(query)
        ]);

        const pHits = (pResult.status === 'fulfilled' && Array.isArray(pResult.value)) ? pResult.value : [];
        const lHits = (lResult.status === 'fulfilled' && Array.isArray(lResult.value)) ? lResult.value : [];

        // Interleave
        const maxLen = Math.max(pHits.length, lHits.length);
        for (let i = 0; i < maxLen; i++) {
          if (pHits[i]) liveHits.push(pHits[i]);
          if (lHits[i]) liveHits.push(lHits[i]);
        }
      }

      if (genId !== currentGenerationId) return;

      if (liveHits && liveHits.length > 0) {
        state.onlinePool = liveHits;
        state.apiCache[masterCacheKey] = liveHits;

        renderTilesWithPool(liveHits, false);
        if (el.statusBarStatus) {
          el.statusBarStatus.textContent = `Ready (${liveHits.length} live API images)`;
        }
      } else {
        state.onlinePool = [];
        showToast(`No images found on API for "${query}"`);
        if (el.statusBarStatus) {
          el.statusBarStatus.textContent = `No images found for "${query}" from API.`;
        }
        // Remove spinners on empty results
        el.container.querySelectorAll('.tile-spinner').forEach(s => s.classList.add('hidden'));
      }
    } catch (err) {
      console.warn('API fodder fetch error:', err);
      if (el.statusBarStatus) {
        el.statusBarStatus.textContent = `Error loading from API. Check connection.`;
      }
      el.container.querySelectorAll('.tile-spinner').forEach(s => s.classList.add('hidden'));
    }
  }

  // --- High-Resolution Download & Print ---
  async function downloadJpg() {
    if (!el.letterPage || typeof html2canvas === 'undefined') {
      showToast('Export engine loading...');
      return;
    }

    showToast('Rendering high-res 300 DPI sheet...');
    try {
      if (state.textOverlay && state.textOverlay.content && state.textOverlay.fontFamily) {
        try {
          await loadFontFamily({
            family: state.textOverlay.fontFamily,
            source: isSystemFontFamily(state.textOverlay.fontFamily) ? 'system' : 'google'
          });
        } catch (_) {}
      }

      // Temporarily swap images to high-res large URLs for pristine 300 DPI rasterization
      const imgs = el.container.querySelectorAll('img');
      const originalSrcs = [];
      imgs.forEach((img, idx) => {
        originalSrcs[idx] = img.src;
        if (img.dataset.largeSrc) img.src = img.dataset.largeSrc;
      });

      const savedTransform = el.viewport.style.transform;
      el.viewport.style.transform = 'none';

      const canvas = await html2canvas(el.letterPage, {
        scale: 3, // ~300 DPI Letter resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: state.backgroundColorEnabled ? state.backgroundColor : '#ffffff'
      });

      el.viewport.style.transform = savedTransform;
      imgs.forEach((img, idx) => { img.src = originalSrcs[idx]; });

      const link = document.createElement('a');
      link.download = `visteras-collage-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      showToast('Collage sheet exported successfully.');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Check console for details.');
    }
  }

  function printCollage() {
    window.print();
  }

  // --- Saved Collages Manager ---
  function saveCurrentCollage(name) {
    const saveObj = {
      id: Date.now(),
      name: name || `Collage ${new Date().toLocaleDateString()}`,
      layoutId: state.activeLayoutId,
      query: state.searchQuery,
      colors: state.selectedColors,
      style: state.selectedStyle,
      overlay: state.selectedOverlay,
      overlayOpacity: state.overlayOpacity,
      paintEnabled: state.paintEnabled,
      paintColor: state.paintColor,
      textOverlay: state.textOverlay,
      items: state.items.map(it => ({
        imagePath: it.image?.path,
        largePath: it.image?.largePath,
        zoom: it.zoom || 1.0,
        panX: it.panX || 0,
        panY: it.panY || 0
      }))
    };

    state.savedCollages.push(saveObj);
    localStorage.setItem('visteras_collage_saves', JSON.stringify(state.savedCollages));
    renderSavedList();
    showToast(`Saved "${saveObj.name}"`);
  }

  function loadSavedCollage(saveObj) {
    state.activeLayoutId = saveObj.layoutId || 'grid-2x2';
    state.searchQuery = saveObj.query || 'vintage';
    state.selectedColors = saveObj.colors || [];
    state.selectedStyle = saveObj.style || 'all';
    state.selectedOverlay = saveObj.overlay || '';
    state.overlayOpacity = saveObj.overlayOpacity || 100;
    state.paintEnabled = saveObj.paintEnabled || false;
    state.paintColor = saveObj.paintColor || '#F2B041';
    if (saveObj.textOverlay) {
      state.textOverlay = saveObj.textOverlay;
      if (fontPickerInstance && state.textOverlay.fontFamily) {
        fontPickerInstance.selectFamily(state.textOverlay.fontFamily, state.textOverlay.fontWeight || '400');
      }
    }

    renderLayoutList();
    renderThemePresets();
    renderColorChips();
    renderOverlayList();
    generateFodder();
    showToast(`Loaded "${saveObj.name}"`);
  }

  function renderSavedList() {
    const list = document.getElementById('saves-list');
    if (!list) return;
    list.innerHTML = '';

    if (state.savedCollages.length === 0) {
      list.innerHTML = '<div style="color: #888888; font-size: 11px; padding: 6px 0;">No saved collages yet.</div>';
      return;
    }

    state.savedCollages.forEach(save => {
      const row = document.createElement('div');
      row.className = 'layout-card';
      row.innerHTML = `
        <span style="font-weight: 600;">${save.name}</span>
        <button class="btn_visteras_secondary" style="padding: 2px 6px; font-size: 10px;">Load</button>
      `;
      row.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        loadSavedCollage(save);
      });
      list.appendChild(row);
    });
  }

  // --- Pan and Zoom Interactions ---
  function setupPanAndZoom() {
    if (!el.workarea) return;

    el.workarea.addEventListener('wheel', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom(state.zoom * factor);
      }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (!state.spaceHeld) {
          state.spaceHeld = true;
          if (!state.isPanning) el.workarea.style.cursor = 'grab';
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        state.spaceHeld = false;
        if (!state.isPanning) el.workarea.style.cursor = '';
      }
    });

    el.workarea.addEventListener('mousedown', (e) => {
      if (state.spaceHeld || e.button === 1) {
        e.preventDefault();
        state.isPanning = true;
        state.dragStartX = e.clientX - state.panX;
        state.dragStartY = e.clientY - state.panY;
        el.workarea.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (state.isPanning) {
        state.panX = e.clientX - state.dragStartX;
        state.panY = e.clientY - state.dragStartY;
        applyViewportTransform();
      }
    });

    window.addEventListener('mouseup', () => {
      if (state.isPanning) {
        state.isPanning = false;
        el.workarea.style.cursor = state.spaceHeld ? 'grab' : '';
      }
    });

    window.addEventListener('resize', () => {
      applyViewportTransform();
    });

    if (el.statusZoomBtn) {
      el.statusZoomBtn.addEventListener('click', () => {
        if (Math.abs(state.zoom - 1.0) < 0.05) {
          fitToWorkspace();
        } else {
          state.zoom = 1.0;
          state.panX = 0;
          state.panY = 0;
          applyViewportTransform();
        }
      });
    }

    const fitItem = document.getElementById('action_menu_fit');
    if (fitItem) fitItem.addEventListener('click', fitToWorkspace);
    const actualItem = document.getElementById('action_menu_100');
    if (actualItem) actualItem.addEventListener('click', () => {
      state.zoom = 1.0;
      state.panX = 0;
      state.panY = 0;
      applyViewportTransform();
    });
    const zoomInItem = document.getElementById('action_menu_zoomin');
    if (zoomInItem) zoomInItem.addEventListener('click', () => setZoom(state.zoom * 1.15));
    const zoomOutItem = document.getElementById('action_menu_zoomout');
    if (zoomOutItem) zoomOutItem.addEventListener('click', () => setZoom(state.zoom / 1.15));
  }

  // --- Event Wireup ---
  function setupEvents() {
    setupPanAndZoom();

    // Toolbar buttons
    document.querySelectorAll('.tool_btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool === 'generate') {
          generateFodder();
        } else {
          selectTool(tool);
        }
      });
    });

    // Generate buttons
    const genBtnTop = document.getElementById('action_generate_fodder');
    if (genBtnTop) genBtnTop.addEventListener('click', generateFodder);
    const genBtnOverlay = document.getElementById('generateBtn');
    if (genBtnOverlay) genBtnOverlay.addEventListener('click', generateFodder);
    const applyThemeBtn = document.getElementById('action_apply_theme_generate');
    if (applyThemeBtn) applyThemeBtn.addEventListener('click', () => {
      if (el.imageSourceSelect) state.imageSource = el.imageSourceSelect.value;
      if (el.queryInput) state.searchQuery = el.queryInput.value.trim();
      if (el.styleSelect) state.selectedStyle = el.styleSelect.value;
      if (el.editorsChoiceToggle) state.editorsChoice = el.editorsChoiceToggle.checked;
      generateFodder();
    });

    if (el.imageSourceSelect) {
      el.imageSourceSelect.value = state.imageSource;
      el.imageSourceSelect.addEventListener('change', (e) => {
        state.imageSource = e.target.value;
      });
    }

    // Clear Colors Button
    const clearColorsBtn = document.getElementById('clearColorsBtn');
    if (clearColorsBtn) {
      clearColorsBtn.addEventListener('click', () => {
        state.selectedColors = [];
        renderColorChips();
      });
    }

    // API Config toggle and save
    const toggleApiBtn = document.getElementById('toggleApiSettingsBtn');
    const apiConfigBox = document.getElementById('api-config-container');
    if (toggleApiBtn && apiConfigBox) {
      toggleApiBtn.addEventListener('click', () => {
        apiConfigBox.style.display = apiConfigBox.style.display === 'none' ? 'block' : 'none';
      });
    }

    const saveApiBtn = document.getElementById('saveApiConfigBtn');
    if (saveApiBtn) {
      const endpointInput = document.getElementById('apiEndpointInput');
      const directKeyInput = document.getElementById('pixabayDirectKeyInput');
      if (endpointInput) endpointInput.value = state.apiEndpoint;
      if (directKeyInput) directKeyInput.value = state.directApiKey;

      saveApiBtn.addEventListener('click', () => {
        state.apiEndpoint = endpointInput ? endpointInput.value.trim() : '';
        state.directApiKey = directKeyInput ? directKeyInput.value.trim() : '';
        localStorage.setItem('visteras_pixabay_endpoint', state.apiEndpoint);
        localStorage.setItem('visteras_pixabay_key', state.directApiKey);
        if (apiConfigBox) apiConfigBox.style.display = 'none';
        showToast('Saved API configuration.');
        generateFodder();
      });
    }

    // Print & Download buttons
    const printBtn = document.getElementById('action_print_sheet');
    if (printBtn) printBtn.addEventListener('click', printCollage);
    const dlBtn = document.getElementById('action_download_jpg');
    if (dlBtn) dlBtn.addEventListener('click', downloadJpg);

    // Texture Overlay controls
    const opacitySlider = document.getElementById('overlayOpacity');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        state.overlayOpacity = parseInt(e.target.value, 10);
        document.getElementById('opacityValue').textContent = `${state.overlayOpacity}%`;
        applyTextureOverlay();
      });
    }

    // Paint Overlay controls
    const paintToggle = document.getElementById('paintToggle');
    if (paintToggle) {
      paintToggle.addEventListener('change', (e) => {
        state.paintEnabled = e.target.checked;
        applyPaintOverlay();
      });
    }
    const paintColorInput = document.getElementById('paintColor');
    if (paintColorInput) {
      paintColorInput.addEventListener('input', (e) => {
        state.paintColor = e.target.value;
        document.getElementById('paintColorValue').textContent = e.target.value;
        applyPaintOverlay();
      });
    }
    const paintOpacitySlider = document.getElementById('paintOpacity');
    if (paintOpacitySlider) {
      paintOpacitySlider.addEventListener('input', (e) => {
        state.paintOpacity = parseInt(e.target.value, 10);
        document.getElementById('paintOpacityValue').textContent = `${state.paintOpacity}%`;
        applyPaintOverlay();
      });
    }

    // Background Color controls
    const bgToggle = document.getElementById('backgroundColorToggle');
    if (bgToggle) {
      bgToggle.addEventListener('change', (e) => {
        state.backgroundColorEnabled = e.target.checked;
        applyPaintOverlay();
      });
    }
    const bgColorInput = document.getElementById('backgroundColor');
    if (bgColorInput) {
      bgColorInput.addEventListener('input', (e) => {
        state.backgroundColor = e.target.value;
        document.getElementById('backgroundColorValue').textContent = e.target.value;
        applyPaintOverlay();
      });
    }

    // Text Overlay controls
    const textInput = document.getElementById('textInput');
    if (textInput) {
      textInput.addEventListener('input', (e) => {
        state.textOverlay.content = e.target.value;
        updateTextOverlay();
      });
    }
    const fontFamilySel = document.getElementById('fontFamily');
    if (fontFamilySel) {
      fontFamilySel.addEventListener('change', (e) => {
        state.textOverlay.fontFamily = e.target.value;
        updateTextOverlay();
      });
    }
    const fontSizeInput = document.getElementById('fontSize');
    if (fontSizeInput) {
      fontSizeInput.addEventListener('input', (e) => {
        state.textOverlay.fontSize = parseInt(e.target.value, 10) || 24;
        updateTextOverlay();
      });
    }
    const fontColorInput = document.getElementById('fontColor');
    if (fontColorInput) {
      fontColorInput.addEventListener('input', (e) => {
        state.textOverlay.fontColor = e.target.value;
        document.getElementById('fontColorValue').textContent = e.target.value;
        updateTextOverlay();
      });
    }
    const fontBoldBtn = document.getElementById('fontBold');
    if (fontBoldBtn) {
      fontBoldBtn.addEventListener('click', () => {
        const currentNum = parseInt(state.textOverlay.fontWeight || '400', 10);
        const newWeight = currentNum >= 700 ? '400' : '700';
        state.textOverlay.fontWeight = newWeight;
        state.textOverlay.bold = newWeight >= 700;
        if (fontPickerInstance) {
          fontPickerInstance.setWeight(newWeight);
        }
        updateTextOverlay();
      });
    }
    const fontItalicBtn = document.getElementById('fontItalic');
    if (fontItalicBtn) {
      fontItalicBtn.addEventListener('click', () => {
        state.textOverlay.italic = !state.textOverlay.italic;
        fontItalicBtn.classList.toggle('active', state.textOverlay.italic);
        updateTextOverlay();
      });
    }
    const fontUnderlineBtn = document.getElementById('fontUnderline');
    if (fontUnderlineBtn) {
      fontUnderlineBtn.addEventListener('click', () => {
        state.textOverlay.underline = !state.textOverlay.underline;
        fontUnderlineBtn.classList.toggle('active', state.textOverlay.underline);
        updateTextOverlay();
      });
    }

    // Custom Image URL
    const applyImgBtn = document.getElementById('applyImageBtn');
    if (applyImgBtn) {
      applyImgBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('imageUrlInput');
        state.customImageUrl = urlInput ? urlInput.value.trim() : '';
        generateFodder();
        showToast('Applied custom image URL to hero tile.');
      });
    }

    // Save collage button
    const saveCollageBtn = document.getElementById('action_save_set');
    if (saveCollageBtn) {
      saveCollageBtn.addEventListener('click', () => {
        const name = prompt('Name your collage fodder sheet:', `Collage ${state.savedCollages.length + 1}`);
        if (name) saveCurrentCollage(name);
      });
    }

    // Export saves JSON
    const exportBtn = document.getElementById('exportSavesBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state.savedCollages, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.download = `visteras-collage-library.json`;
        a.href = URL.createObjectURL(blob);
        a.click();
      });
    }

    // Menu Bar dropdown toggles
    document.querySelectorAll('.menu_entry').forEach(entry => {
      entry.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = entry.classList.contains('open');
        document.querySelectorAll('.menu_entry').forEach(en => en.classList.remove('open'));
        if (!isOpen) entry.classList.add('open');
      });
    });

    document.addEventListener('click', (e) => {
      document.querySelectorAll('.menu_entry').forEach(en => en.classList.remove('open'));
      if (!e.target.closest('.tile-zoom-popover') && !e.target.closest('.btn-zoom')) {
        document.querySelectorAll('.tile-zoom-popover').forEach(pop => pop.classList.add('hidden'));
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        printCollage();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveCurrentCollage();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        fitToWorkspace();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        state.zoom = 1.0;
        state.panX = 0;
        state.panY = 0;
        applyViewportTransform();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom(state.zoom * 1.15);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        setZoom(state.zoom / 1.15);
      }
    });
  }

  // --- App Initialization ---
  function init() {
    initElements();
    initFontPicker();
    try {
      const stored = localStorage.getItem('visteras_collage_saves');
      if (stored) state.savedCollages = JSON.parse(stored);
    } catch (_) {}

    renderLayoutList();
    renderThemePresets();
    renderColorChips();
    renderOverlayList();
    renderSavedList();
    initTextInteract();
    setupEvents();
    selectTool('layout');

    if (el.queryInput) el.queryInput.value = state.searchQuery;
    if (el.styleSelect) el.styleSelect.value = state.selectedStyle;

    if (el.statusBarStatus) {
      el.statusBarStatus.textContent = 'Ready • Click Generate to create collage fodder';
    }

    // Fit canvas to workspace by default
    setTimeout(() => {
      fitToWorkspace();
    }, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
