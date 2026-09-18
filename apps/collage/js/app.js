/**
 * Visteras Collage - Printable Collage Fodder Generator
 * Monorepo app for Visteras Suite
 */

(function() {
  'use strict';

  // --- State Management ---
  const state = {
    activeTool: 'layout',
    activeLayoutId: 'grid-2x2',
    selectedTags: [],
    selectedEffects: [],
    effectIntensity: { blur: 3, glitch: 10 },
    customImageUrl: '',
    
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

    // Texture Overlay
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
    el.container = document.getElementById('collage-container');
    el.letterPage = document.getElementById('letter-page');
    el.generateOverlay = document.getElementById('generate-overlay');
    el.textureLayer = document.getElementById('texture-overlay-layer');
    el.paintLayer = document.getElementById('paint-overlay-layer');
    el.textOverlay = document.getElementById('text-overlay');
    el.textContent = document.getElementById('text-content');
    el.statusBarStatus = document.getElementById('status-bar-text');
    el.statusLayout = document.getElementById('status-layout-text');
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
    toast.style.border = '1px solid #e11d48';
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

    // Also populate top quick dropdown if present
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

  // --- Tag Filter Rendering ---
  function renderTagFilters() {
    const container = document.getElementById('tag-filters-container');
    if (!container || typeof getTagsByCategory !== 'function') return;

    const categories = getTagsByCategory();
    container.innerHTML = '';

    Object.keys(categories).forEach(cat => {
      const sec = document.createElement('div');
      sec.className = 'panel_field';
      sec.innerHTML = `<span class="panel_label">${cat}</span>`;
      
      const badgeGroup = document.createElement('div');
      badgeGroup.className = 'tag-badge-group';

      categories[cat].forEach(tag => {
        const badge = document.createElement('div');
        badge.className = `tag-badge ${state.selectedTags.includes(tag) ? 'active' : ''}`;
        badge.textContent = tag;
        badge.addEventListener('click', () => {
          if (state.selectedTags.includes(tag)) {
            state.selectedTags = state.selectedTags.filter(t => t !== tag);
          } else {
            state.selectedTags.push(tag);
          }
          renderTagFilters();
          generateFodder();
        });
        badgeGroup.appendChild(badge);
      });

      sec.appendChild(badgeGroup);
      container.appendChild(sec);
    });
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
    const filterString = state.selectedEffects.map(eff => `url(#svg-${eff})`).join(' ');
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

  // --- Generate Fodder Grid ---
  function generateFodder() {
    initElements();
    if (el.generateOverlay) el.generateOverlay.classList.add('hidden');
    state.assetsGenerated = true;

    const layout = layouts.find(l => l.id === state.activeLayoutId) || layouts[0];
    const availableImages = filterImagesByTags(state.selectedTags);
    
    el.container.innerHTML = '';
    el.container.style.gridTemplateColumns = layout.cols;
    el.container.style.gridTemplateRows = layout.rows;

    state.items = [];

    for (let i = 0; i < layout.count; i++) {
      const span = layout.spans[i] || { c: 1, r: 1 };
      let chosenImg = null;

      if (state.customImageUrl && i === 0) {
        chosenImg = { path: state.customImageUrl, attribution: 'Custom URL' };
      } else if (availableImages.length > 0) {
        chosenImg = availableImages[Math.floor(Math.random() * availableImages.length)];
      } else {
        chosenImg = { path: '', attribution: 'None' };
      }

      const itemData = {
        index: i,
        image: chosenImg,
        zoom: 1,
        panX: 50,
        panY: 50,
        span: span
      };
      state.items.push(itemData);

      const tile = document.createElement('div');
      tile.className = 'collage-item';
      tile.style.gridColumn = `span ${span.c}`;
      tile.style.gridRow = `span ${span.r}`;

      const img = document.createElement('img');
      img.src = chosenImg.path;
      img.alt = chosenImg.attribution || `Collage tile ${i + 1}`;
      img.crossOrigin = 'anonymous';

      const controls = document.createElement('div');
      controls.className = 'image-controls';
      controls.innerHTML = `
        <button class="tile-icon-btn" title="Replace with random tile">↻</button>
        <button class="tile-icon-btn" title="Zoom tile">🔍</button>
      `;

      controls.children[0].addEventListener('click', (e) => {
        e.stopPropagation();
        const next = availableImages[Math.floor(Math.random() * availableImages.length)];
        if (next) {
          itemData.image = next;
          img.src = next.path;
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
    if (el.statusBarStatus) el.statusBarStatus.textContent = `Ready (${layout.count} tiles)`;
  }

  // --- High-Resolution Download & Print ---
  async function downloadJpg() {
    if (!el.letterPage || typeof html2canvas === 'undefined') {
      showToast('Export engine loading...');
      return;
    }

    showToast('Rendering high-res 300 DPI sheet...');
    try {
      const canvas = await html2canvas(el.letterPage, {
        scale: 3, // ~300 DPI Letter resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: state.backgroundColorEnabled ? state.backgroundColor : '#ffffff'
      });

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
      tags: state.selectedTags,
      effects: state.selectedEffects,
      overlay: state.selectedOverlay,
      overlayOpacity: state.overlayOpacity,
      paintEnabled: state.paintEnabled,
      paintColor: state.paintColor,
      textOverlay: state.textOverlay,
      items: state.items.map(it => ({ imagePath: it.image?.path, zoom: it.zoom }))
    };

    state.savedCollages.push(saveObj);
    localStorage.setItem('visteras_collage_saves', JSON.stringify(state.savedCollages));
    renderSavedList();
    showToast(`Saved "${saveObj.name}"`);
  }

  function loadSavedCollage(saveObj) {
    state.activeLayoutId = saveObj.layoutId || 'grid-2x2';
    state.selectedTags = saveObj.tags || [];
    state.selectedEffects = saveObj.effects || [];
    state.selectedOverlay = saveObj.overlay || '';
    state.overlayOpacity = saveObj.overlayOpacity || 100;
    state.paintEnabled = saveObj.paintEnabled || false;
    state.paintColor = saveObj.paintColor || '#F2B041';
    if (saveObj.textOverlay) state.textOverlay = saveObj.textOverlay;

    renderLayoutList();
    renderTagFilters();
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

  // --- Event Wireup ---
  function setupEvents() {
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

    // Export & Import saves JSON
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
    renderTagFilters();
    renderOverlayList();
    renderSavedList();
    initTextInteract();
    setupEvents();
    selectTool('layout');

    // Generate initial fodder automatically
    generateFodder();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
