/**
 * Visteras Collage — Font Engine Bridge.
 * Connects Collage to the shared @visteras/fonts package catalog, variable weights, and browser loader.
 */
import {
  DEFAULT_FONTS,
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_FAMILIES,
  getGoogleFontsCache,
  findGoogleFontEntry,
  formatWeightLabel,
  styleNameToCssWeight,
  isSystemFontFamily,
  listGoogleCacheFamilies,
  loadFontFamily,
} from '../lib/visteras-fonts.js';

const SYSTEM_SET = new Set(SYSTEM_FONT_FAMILIES.map(f => f.toLowerCase()));

function badgeFor(family) {
  if (SYSTEM_SET.has(String(family).toLowerCase()) || isSystemFontFamily(family)) return 'System';
  return 'Google';
}

/**
 * Returns available weights for a font family from Google cache or fallback standard weights.
 * @param {string} family
 * @returns {{ variant: string, cssWeight: string, label: string }[]}
 */
export function getFontWeightsForFamily(family) {
  const entry = findGoogleFontEntry(family);
  if (entry && entry.variants && entry.variants.length > 0) {
    const weights = [];
    const seen = new Set();
    for (const v of entry.variants) {
      if (/italic|oblique/i.test(v)) continue;
      const cssWeight = styleNameToCssWeight(v);
      const label = formatWeightLabel(v) || `Weight (${cssWeight})`;
      if (!seen.has(cssWeight)) {
        seen.add(cssWeight);
        weights.push({ variant: v, cssWeight, label });
      }
    }
    if (weights.length > 0) {
      weights.sort((a, b) => parseInt(a.cssWeight, 10) - parseInt(b.cssWeight, 10));
      return weights;
    }
  }
  // Standard fallback weights for system fonts or unlisted fonts
  return [
    { variant: '100', cssWeight: '100', label: 'Thin (100)' },
    { variant: '300', cssWeight: '300', label: 'Light (300)' },
    { variant: 'regular', cssWeight: '400', label: 'Regular (400)' },
    { variant: '500', cssWeight: '500', label: 'Medium (500)' },
    { variant: '600', cssWeight: '600', label: 'SemiBold (600)' },
    { variant: '700', cssWeight: '700', label: 'Bold (700)' },
    { variant: '800', cssWeight: '800', label: 'ExtraBold (800)' },
    { variant: '900', cssWeight: '900', label: 'Black (900)' },
  ];
}

function ensureStyles() {
  if (document.getElementById('collage-font-bridge-styles')) return;
  const style = document.createElement('style');
  style.id = 'collage-font-bridge-styles';
  style.textContent = `
#collage_font_picker {
  position: relative;
  width: 100%;
  font-family: var(--ui-font, 'Roboto', sans-serif);
}
#collage_font_picker .cfp-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  background: #222222;
  color: #e0e0e0;
  border: 1px solid #383838;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.3;
  text-align: left;
  transition: border-color 0.15s, background-color 0.15s;
}
#collage_font_picker .cfp-trigger:hover {
  border-color: #555555;
  background: #282828;
}
#collage_font_picker .cfp-trigger:focus {
  outline: 1px solid var(--collage-purple, #795290);
  border-color: var(--collage-purple-light, #a855f7);
}
#collage_font_picker .cfp-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#collage_font_picker .cfp-caret {
  color: #888888;
  font-size: 10px;
  flex-shrink: 0;
}
#collage_font_picker .cfp-menu {
  display: none;
  position: absolute;
  z-index: 10050;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 260px;
  overflow-y: auto;
  background: #222222;
  border: 1px solid #383838;
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
#collage_font_picker.open .cfp-menu {
  display: block;
}
#collage_font_picker .cfp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: #cccccc;
  font-size: 12px;
  transition: background 0.1s;
}
#collage_font_picker .cfp-item:hover,
#collage_font_picker .cfp-item[aria-selected="true"] {
  background: var(--collage-purple, #795290);
  color: #ffffff;
}
#collage_font_picker .cfp-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#collage_font_picker .cfp-badge {
  flex-shrink: 0;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888888;
  border: 1px solid #444444;
  border-radius: 2px;
  padding: 1px 4px;
}
#collage_font_picker .cfp-item:hover .cfp-badge,
#collage_font_picker .cfp-item[aria-selected="true"] .cfp-badge {
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.4);
}
#collage_font_picker .cfp-item.add {
  border-top: 1px solid #333333;
  color: var(--collage-purple-light, #a855f7);
  font-weight: 600;
  padding: 8px 10px;
}
#collage_font_picker .cfp-item.add:hover {
  background: rgba(168, 85, 247, 0.15);
  color: #ffffff;
}
#collage_font_picker .cfp-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10060;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}
#collage_font_picker .cfp-dialog {
  width: min(500px, 94vw);
  max-height: min(540px, 84vh);
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border: 1px solid #383838;
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  color: #e0e0e0;
}
#collage_font_picker .cfp-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2d2d2d;
  font-weight: 600;
  font-size: 13px;
}
#collage_font_picker .cfp-dialog-header button {
  background: transparent;
  border: none;
  color: #888888;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
#collage_font_picker .cfp-dialog-header button:hover {
  color: #ffffff;
}
#collage_font_picker .cfp-dialog-search {
  margin: 10px 16px 6px;
  padding: 8px 12px;
  background: #141414;
  border: 1px solid #383838;
  border-radius: 4px;
  color: #ffffff;
  font-size: 12px;
}
#collage_font_picker .cfp-dialog-search:focus {
  outline: 1px solid var(--collage-purple-light, #a855f7);
}
#collage_font_picker .cfp-dialog-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
#collage_font_picker .cfp-dialog-list .cfp-dialog-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  background: #242424;
  border: 1px solid transparent;
  transition: all 0.12s;
}
#collage_font_picker .cfp-dialog-list .cfp-dialog-entry:hover {
  background: #2d2438;
  border-color: var(--collage-purple);
}
#collage_font_picker .cfp-entry-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
#collage_font_picker .cfp-entry-title {
  font-size: 14px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#collage_font_picker .cfp-entry-meta {
  font-size: 10px;
  color: #888888;
}
#collage_font_picker .cfp-entry-meta .highlight {
  color: var(--collage-purple-light, #a855f7);
  font-weight: 500;
}
`;
  document.head.appendChild(style);
}

/**
 * Mounts the shared Visteras font picker in Collage with dynamic weight selection.
 * @param {Object} options
 * @param {HTMLElement} options.slotElement
 * @param {HTMLSelectElement} [options.weightSelectElement]
 * @param {string} [options.initialFamily='Roboto']
 * @param {string} [options.initialWeight='400']
 * @param {(family: string, weight: string) => void} [options.onFontChange]
 */
export function mountCollageFontPicker({
  slotElement,
  weightSelectElement,
  initialFamily = DEFAULT_FONT_FAMILY,
  initialWeight = '400',
  onFontChange
} = {}) {
  ensureStyles();

  if (!slotElement) {
    console.warn('[collage-font-bridge] slotElement missing');
    return null;
  }

  let currentFamily = initialFamily || DEFAULT_FONT_FAMILY;
  let currentWeight = initialWeight || '400';
  let extras = [];

  const root = document.createElement('div');
  root.id = 'collage_font_picker';
  root.innerHTML = `
    <button type="button" class="cfp-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="cfp-trigger-label"></span>
      <span class="cfp-caret">▾</span>
    </button>
    <div class="cfp-menu" role="listbox"></div>
  `;
  slotElement.appendChild(root);

  const trigger = root.querySelector('.cfp-trigger');
  const labelEl = root.querySelector('.cfp-trigger-label');
  const menu = root.querySelector('.cfp-menu');

  function allQuickFonts() {
    const seen = new Set();
    const out = [];
    for (const f of [...DEFAULT_FONTS, ...extras]) {
      if (!f || seen.has(f)) continue;
      seen.add(f);
      out.push(f);
    }
    return out;
  }

  function setLabel(family) {
    labelEl.textContent = family;
    labelEl.style.fontFamily = `"${family}", sans-serif`;
  }

  function updateWeightDropdown(family, preferredWeight) {
    if (!weightSelectElement) return currentWeight;
    const weights = getFontWeightsForFamily(family);
    weightSelectElement.innerHTML = '';

    let matched = false;
    let fallbackWeight = '400';

    weights.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.cssWeight;
      opt.textContent = w.label;
      if (w.cssWeight === preferredWeight) {
        opt.selected = true;
        matched = true;
      }
      weightSelectElement.appendChild(opt);
    });

    if (!matched && weights.length > 0) {
      // Find closest weight or select first
      const has400 = weights.find(w => w.cssWeight === '400');
      if (has400) {
        weightSelectElement.value = '400';
        fallbackWeight = '400';
      } else {
        weightSelectElement.value = weights[0].cssWeight;
        fallbackWeight = weights[0].cssWeight;
      }
    } else {
      fallbackWeight = preferredWeight;
    }

    currentWeight = weightSelectElement.value || fallbackWeight;
    return currentWeight;
  }

  function closeMenu() {
    root.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    renderMenu();
  }

  function renderMenu() {
    const fonts = allQuickFonts();
    menu.innerHTML = '';
    for (const family of fonts) {
      const item = document.createElement('div');
      item.className = 'cfp-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', family === currentFamily ? 'true' : 'false');
      item.dataset.family = family;
      item.innerHTML = `
        <span class="cfp-item-name" style="font-family:'${family.replace(/'/g, "\\'")}',sans-serif">${family}</span>
        <span class="cfp-badge">${badgeFor(family)}</span>
      `;
      item.addEventListener('click', () => {
        selectFamily(family, currentWeight);
        closeMenu();
      });
      menu.appendChild(item);
    }

    const add = document.createElement('div');
    add.className = 'cfp-item add';
    add.textContent = '+ Add Google Font…';
    add.addEventListener('click', () => {
      closeMenu();
      openAddFontDialog();
    });
    menu.appendChild(add);
  }

  async function selectFamily(family, weight) {
    currentFamily = family;
    setLabel(family);
    const resolvedWeight = updateWeightDropdown(family, weight || currentWeight);
    const source = isSystemFontFamily(family) ? 'system' : 'google';

    const weights = getFontWeightsForFamily(family);
    const variantKeys = weights.map(w => w.variant);

    try {
      await loadFontFamily({
        family,
        source,
        variants: variantKeys.length > 0 ? variantKeys : ['regular', '700']
      });
    } catch (e) {
      console.warn('[collage-font-bridge] loadFontFamily', family, e);
    }

    if (typeof onFontChange === 'function') {
      onFontChange(family, resolvedWeight);
    }
  }

  function openAddFontDialog() {
    const cache = getGoogleFontsCache();
    const backdrop = document.createElement('div');
    backdrop.className = 'cfp-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="cfp-dialog" role="dialog" aria-label="Add Google Font">
        <div class="cfp-dialog-header">
          <span>Google Fonts Library (${cache.length} typefaces)</span>
          <button type="button" class="cfp-dialog-close" aria-label="Close">×</button>
        </div>
        <input type="search" class="cfp-dialog-search" placeholder="Search by name, category (serif, display, sans-serif, handwriting)..." autocomplete="off" />
        <div class="cfp-dialog-list"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const list = backdrop.querySelector('.cfp-dialog-list');
    const search = backdrop.querySelector('.cfp-dialog-search');
    const close = () => backdrop.remove();
    backdrop.querySelector('.cfp-dialog-close').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    function renderList(query) {
      const q = String(query || '').trim().toLowerCase();
      list.innerHTML = '';
      const matches = cache.filter((f) => {
        if (!f || !f.family) return false;
        if (!q) return true;
        const name = f.family.toLowerCase();
        const cat = (f.category || '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      }).slice(0, 100);

      for (const entry of matches) {
        const family = entry.family;
        const weights = entry.variants ? entry.variants.filter(v => !/italic/i.test(v)) : ['regular'];
        const weightCount = weights.length;
        const cat = entry.category || 'sans-serif';

        const row = document.createElement('div');
        row.className = 'cfp-dialog-entry';
        row.innerHTML = `
          <div class="cfp-entry-info">
            <span class="cfp-entry-title" style="font-family:'${family.replace(/'/g, "\\'")}',sans-serif">${family}</span>
            <span class="cfp-entry-meta"><span class="highlight">${weightCount} weight${weightCount === 1 ? '' : 's'}</span> • ${cat}</span>
          </div>
          <span class="cfp-badge">Google</span>
        `;
        row.addEventListener('click', async () => {
          if (!extras.includes(family) && !DEFAULT_FONTS.includes(family)) {
            extras.push(family);
          }
          close();
          await selectFamily(family, currentWeight);
        });
        list.appendChild(row);
      }
      if (!matches.length) {
        const empty = document.createElement('div');
        empty.style.padding = '18px';
        empty.style.textAlign = 'center';
        empty.style.color = '#888888';
        empty.style.fontSize = '12px';
        empty.textContent = 'No matching Google fonts found.';
        list.appendChild(empty);
      }
    }
    search.addEventListener('input', () => renderList(search.value));
    renderList('');
    search.focus();
  }

  // Weight dropdown change listener
  if (weightSelectElement) {
    weightSelectElement.addEventListener('change', async (e) => {
      currentWeight = e.target.value;
      const source = isSystemFontFamily(currentFamily) ? 'system' : 'google';
      const weights = getFontWeightsForFamily(currentFamily);
      const match = weights.find(w => w.cssWeight === currentWeight);
      if (match) {
        try {
          await loadFontFamily({
            family: currentFamily,
            source,
            variants: [match.variant, 'regular', '700']
          });
        } catch (_) {}
      }
      if (typeof onFontChange === 'function') {
        onFontChange(currentFamily, currentWeight);
      }
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (root.classList.contains('open')) closeMenu();
    else openMenu();
  });

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) closeMenu();
  });

  // Initial preload and UI label
  setLabel(currentFamily);
  updateWeightDropdown(currentFamily, currentWeight);
  loadFontFamily({
    family: currentFamily,
    source: isSystemFontFamily(currentFamily) ? 'system' : 'google',
    variants: getFontWeightsForFamily(currentFamily).map(w => w.variant)
  }).catch(() => {});

  return {
    selectFamily,
    setWeight: (weight) => {
      currentWeight = weight;
      if (weightSelectElement) weightSelectElement.value = weight;
      if (typeof onFontChange === 'function') onFontChange(currentFamily, currentWeight);
    },
    getCurrentFamily: () => currentFamily,
    getCurrentWeight: () => currentWeight,
  };
}

export {
  DEFAULT_FONTS,
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_FAMILIES,
  getGoogleFontsCache,
  findGoogleFontEntry,
  formatWeightLabel,
  styleNameToCssWeight,
  listGoogleCacheFamilies,
  loadFontFamily,
  isSystemFontFamily,
};
