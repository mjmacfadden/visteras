/**
 * Visteras Collage - Printable Collage Fodder Generator
 * Monorepo app for Visteras Suite
 */

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
      name: '🍂 Autumn Mixed Fodder',
      q: 'autumn vintage leaves',
      colors: ['red', 'orange', 'yellow', 'brown'],
      style: 'illustration',
      source: 'both',
      category: ''
    },
    {
      id: 'vintage_news',
      name: '🗞️ Historic News & Headlines',
      q: 'newspaper headlines news',
      colors: ['brown', 'grayscale', 'black'],
      style: 'all',
      source: 'loc',
      category: ''
    },
    {
      id: 'antique_ads',
      name: '📜 Antique Ads & Ephemera',
      q: 'antique advertisement vintage paper label',
      colors: ['brown', 'yellow'],
      style: 'all',
      source: 'both',
      category: ''
    },
    {
      id: 'botanical',
      name: '🌿 Botanical Herbarium',
      q: 'botanical illustration flower vintage flora',
      colors: ['green', 'brown'],
      style: 'illustration',
      source: 'both',
      category: 'nature'
    },
    {
      id: 'wildlife',
      name: '🦋 Victorian Wildlife & Birds',
      q: 'vintage animal illustration bird wildlife',
      colors: [],
      style: 'illustration',
      source: 'both',
      category: 'animals'
    },
    {
      id: 'circus_theatre',
      name: '🎪 Circus, Theatre & Playbills',
      q: 'circus theatre entertainment broadside poster',
      colors: ['red', 'yellow'],
      style: 'all',
      source: 'both',
      category: ''
    },
    {
      id: 'retro_pop',
      name: '📻 Retro Pop & Comics',
      q: 'retro comic vintage pop art poster',
      colors: ['yellow', 'pink', 'turquoise'],
      style: 'illustration',
      source: 'pixabay',
      category: ''
    },
    {
      id: 'textures',
      name: '🎨 Textures & Old Paper',
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
      fontFamily: 'Arial, sans-serif',
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
        <span style="font-weight: 600;">${preset.name}</span>
        <span style="font-size: 9px; color: #888888;">${preset.colors.join(', ') || 'Any'}</span>
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
        state.activeLayoutId = layout.id;
        renderLayoutList();
        generateFodder();
      });
      list.appendChild(card);
    });

    const quickSel = document.getElementById('quick-layout-select');
    if (quickSel) {
      quickSel.innerHTML = layouts.map(l => `<option value="${l.id}" ${l.id === state.activeLayoutId ? 'selected' : ''}>${l.name}</option>`).join('');
      quickSel.onchange = (e) => {
        state.activeLayoutId = e.target.value;
        renderLayoutList();
        generateFodder();
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

  // --- Text Overlay Handling ---
  function updateTextOverlay() {
    if (!el.textOverlay || !el.textContent) return;
    const txt = state.textOverlay.content.trim();
    if (!txt) {
      el.textOverlay.style.display = 'none';
      return;
    }

    el.textOverlay.style.display = 'inline-block';
    el.textContent.textContent = txt;
    el.textOverlay.style.fontFamily = state.textOverlay.fontFamily;
    el.textOverlay.style.fontSize = `${state.textOverlay.fontSize}px`;
    el.textOverlay.style.color = state.textOverlay.fontColor;
    el.textOverlay.style.fontWeight = state.textOverlay.bold ? 'bold' : 'normal';
    el.textOverlay.style.fontStyle = state.textOverlay.italic ? 'italic' : 'normal';
    el.textOverlay.style.textDecoration = state.textOverlay.underline ? 'underline' : 'none';
    el.textOverlay.style.zIndex = state.textOverlay.zIndex;
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

  // --- Pixabay Fetch & Image Pool Engine ---
  async function fetchSinglePixabayQuery(query, color, imageType, category, editorsChoice) {
    let url = '';
    if (state.apiEndpoint) {
      url = `${state.apiEndpoint}?q=${encodeURIComponent(query)}&image_type=${encodeURIComponent(imageType)}&safesearch=true&per_page=20`;
      if (color) url += `&colors=${encodeURIComponent(color)}`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (editorsChoice) url += `&editors_choice=true`;
    } else if (state.directApiKey) {
      url = `https://pixabay.com/api/?key=${state.directApiKey}&q=${encodeURIComponent(query)}&image_type=${encodeURIComponent(imageType)}&safesearch=true&per_page=20`;
      if (color) url += `&colors=${encodeURIComponent(color)}`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (editorsChoice) url += `&editors_choice=true`;
    }

    if (!url) return [];

    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.hits)) {
          return data.hits.map(h => ({
            id: h.id,
            path: h.webformatURL,
            largePath: h.largeImageURL || h.webformatURL,
            attribution: h.user,
            link: h.pageURL
          }));
        }
      }
    } catch (err) {
      console.warn('Pixabay single query fetch error:', err);
    }
    return [];
  }

  async function fetchPixabayImages() {
    const query = state.searchQuery || 'vintage';
    const colors = state.selectedColors || [];
    const imageType = state.selectedStyle || 'all';
    const category = state.selectedCategory || '';
    const editorsChoice = state.editorsChoice;

    const cacheKey = `${query}|${colors.join(',')}|${imageType}|${category}|${editorsChoice}`;
    if (state.apiCache[cacheKey]) {
      return state.apiCache[cacheKey];
    }

    if (!state.apiEndpoint && !state.directApiKey) {
      if (typeof images !== 'undefined' && Array.isArray(images)) return images;
      return [];
    }

    let combinedHits = [];

    if (colors.length > 0) {
      // Query for each selected color in parallel to create a true multi-color harmony palette
      const colorPromises = colors.map(col => fetchSinglePixabayQuery(query, col, imageType, category, editorsChoice));
      const results = await Promise.all(colorPromises);
      
      // Interleave results from each color
      const maxLen = Math.max(...results.map(r => r.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const colResults of results) {
          if (colResults[i]) {
            combinedHits.push(colResults[i]);
          }
        }
      }
    } else {
      combinedHits = await fetchSinglePixabayQuery(query, '', imageType, category, editorsChoice);
    }

    // If 0 hits found, retry with relaxed parameters (e.g. without editorsChoice or simplified query)
    if (combinedHits.length === 0 && editorsChoice) {
      combinedHits = await fetchSinglePixabayQuery(query, colors.join(','), imageType, category, false);
    }
    if (combinedHits.length === 0 && query.includes(' ')) {
      const broadTerm = query.split(' ')[0];
      combinedHits = await fetchSinglePixabayQuery(broadTerm, '', 'all', '', false);
    }

    // Deduplicate by image id
    const seen = new Set();
    const unique = [];
    for (const item of combinedHits) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }

    if (unique.length > 0) {
      state.apiCache[cacheKey] = unique;
      showToast(`Loaded ${unique.length} live Pixabay assets for "${query}"`);
      return unique;
    }

    // Fallback to local curated image pool if offline or no hits
    if (typeof images !== 'undefined' && Array.isArray(images)) {
      return images;
    }
    return [];
  }

  // --- Library of Congress / Chronicling America API Engine ---
  async function fetchChroniclingAmericaImages(query) {
    const q = query || 'newspaper vintage';
    const cacheKey = `loc|${q}`;
    if (state.apiCache[cacheKey]) {
      return state.apiCache[cacheKey];
    }

    const url = `https://www.loc.gov/collections/chronicling-america/?fo=json&q=${encodeURIComponent(q)}&c=25`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
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
              attribution: item.title ? `${item.title.slice(0, 42)} (${item.date || 'LOC'})` : 'Chronicling America (LOC)',
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
      console.warn('Library of Congress search failed:', err);
    }
    return [];
  }

  // --- Combined Fodder Fetcher (Pixabay + Library of Congress) ---
  async function fetchFodderImages() {
    const src = state.imageSource || 'both';
    const query = state.searchQuery || 'vintage';

    if (src === 'pixabay') {
      return await fetchPixabayImages();
    }

    if (src === 'loc') {
      const locHits = await fetchChroniclingAmericaImages(query);
      if (locHits.length > 0) {
        showToast(`Loaded ${locHits.length} historic clippings from Library of Congress`);
        return locHits;
      }
      return typeof images !== 'undefined' ? images : [];
    }

    // Both / Mixed Source Mode (Pixabay + Library of Congress)
    const [pixabayHits, locHits] = await Promise.all([
      fetchPixabayImages(),
      fetchChroniclingAmericaImages(query)
    ]);

    let interleaved = [];
    const max = Math.max(pixabayHits.length, locHits.length);
    for (let i = 0; i < max; i++) {
      if (pixabayHits[i]) interleaved.push(pixabayHits[i]);
      if (locHits[i]) interleaved.push(locHits[i]);
    }

    if (interleaved.length > 0) {
      showToast(`Loaded ${interleaved.length} mixed assets (${pixabayHits.length} Pixabay + ${locHits.length} Historic LOC)`);
      return interleaved;
    }

    // Fallback to local curated image pool if offline
    if (typeof images !== 'undefined' && Array.isArray(images)) {
      return images;
    }
    return [];
  }

  // --- Generate Fodder Grid ---
  async function generateFodder() {
    initElements();
    if (el.generateOverlay) el.generateOverlay.classList.add('hidden');
    state.assetsGenerated = true;

    if (el.statusBarStatus) el.statusBarStatus.textContent = 'Fetching fodder...';

    const layout = layouts.find(l => l.id === state.activeLayoutId) || layouts[0];
    const pool = await fetchFodderImages();
    state.onlinePool = pool;
    
    el.container.innerHTML = '';
    el.container.style.gridTemplateColumns = layout.cols;
    el.container.style.gridTemplateRows = layout.rows;

    state.items = [];
    const shuffledPool = [...pool].sort(() => 0.5 - Math.random());

    for (let i = 0; i < layout.count; i++) {
      const span = layout.spans[i] || { c: 1, r: 1 };
      let chosenImg = null;

      if (state.customImageUrl && i === 0) {
        chosenImg = { path: state.customImageUrl, largePath: state.customImageUrl, attribution: 'Custom URL' };
      } else if (shuffledPool.length > 0) {
        chosenImg = shuffledPool[i % shuffledPool.length];
      } else {
        chosenImg = { path: '', largePath: '', attribution: 'None' };
      }

      const itemData = {
        index: i,
        image: chosenImg,
        zoom: 1,
        span: span
      };
      state.items.push(itemData);

      const tile = document.createElement('div');
      tile.className = 'collage-item';
      tile.style.gridColumn = `span ${span.c}`;
      tile.style.gridRow = `span ${span.r}`;

      const img = document.createElement('img');
      img.src = chosenImg.path;
      img.dataset.largeSrc = chosenImg.largePath || chosenImg.path;
      img.alt = chosenImg.attribution || `Collage tile ${i + 1}`;
      img.crossOrigin = 'anonymous';

      const controls = document.createElement('div');
      controls.className = 'image-controls';
      controls.innerHTML = `
        <button class="tile-icon-btn" title="Replace tile">↻</button>
        <button class="tile-icon-btn" title="Zoom tile">🔍</button>
      `;

      controls.children[0].addEventListener('click', (e) => {
        e.stopPropagation();
        const next = pool[Math.floor(Math.random() * pool.length)];
        if (next) {
          itemData.image = next;
          img.src = next.path;
          img.dataset.largeSrc = next.largePath || next.path;
        }
      });

      controls.children[1].addEventListener('click', (e) => {
        e.stopPropagation();
        itemData.zoom = itemData.zoom === 1 ? 1.4 : (itemData.zoom === 1.4 ? 1.8 : 1);
        img.style.transform = `scale(${itemData.zoom})`;
      });

      tile.appendChild(img);
      tile.appendChild(controls);
      el.container.appendChild(tile);
    }

    applySvgEffectsToItems();
    applyTextureOverlay();
    applyPaintOverlay();
    updateTextOverlay();

    if (el.statusLayout) el.statusLayout.textContent = layout.name;
    if (el.statusBarStatus) el.statusBarStatus.textContent = pool.length > 0 ? `Ready (${layout.count} tiles from Pixabay / ${pool.length} in pool)` : `Ready (${layout.count} tiles)`;
  }

  // --- High-Resolution Download & Print ---
  async function downloadJpg() {
    if (!el.letterPage || typeof html2canvas === 'undefined') {
      showToast('Export engine loading...');
      return;
    }

    showToast('Rendering high-res 300 DPI sheet...');
    try {
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
      items: state.items.map(it => ({ imagePath: it.image?.path, largePath: it.image?.largePath, zoom: it.zoom }))
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
    if (saveObj.textOverlay) state.textOverlay = saveObj.textOverlay;

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
        state.textOverlay.bold = !state.textOverlay.bold;
        fontBoldBtn.classList.toggle('active', state.textOverlay.bold);
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

    document.addEventListener('click', () => {
      document.querySelectorAll('.menu_entry').forEach(en => en.classList.remove('open'));
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

    // Generate initial fodder
    generateFodder();

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
