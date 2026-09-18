/**
 * Visteras Collage — Font Engine Bridge.
 * Connects Collage to the shared @visteras/fonts package catalog and browser loader.
 */
import {
  DEFAULT_FONTS,
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_FAMILIES,
  getGoogleFontsCache,
  isSystemFontFamily,
  listGoogleCacheFamilies,
  loadFontFamily,
} from '../lib/visteras-fonts.js';

const SYSTEM_SET = new Set(SYSTEM_FONT_FAMILIES.map(f => f.toLowerCase()));

function badgeFor(family) {
  if (SYSTEM_SET.has(String(family).toLowerCase()) || isSystemFontFamily(family)) return 'System';
  return 'Google';
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
  width: min(440px, 92vw);
  max-height: min(500px, 82vh);
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
  padding: 12px 14px;
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
  margin: 10px 14px 6px;
  padding: 8px 10px;
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
  padding: 4px 6px 12px;
}
#collage_font_picker .cfp-dialog-list .cfp-item {
  padding: 8px 10px;
  border-radius: 4px;
}
`;
  document.head.appendChild(style);
}

/**
 * Mounts the shared Visteras font picker in Collage.
 * @param {Object} options
 * @param {HTMLElement} options.slotElement
 * @param {string} [options.initialFamily='Roboto']
 * @param {(family: string) => void} [options.onFontChange]
 */
export function mountCollageFontPicker({ slotElement, initialFamily = DEFAULT_FONT_FAMILY, onFontChange } = {}) {
  ensureStyles();

  if (!slotElement) {
    console.warn('[collage-font-bridge] slotElement missing');
    return null;
  }

  let current = initialFamily || DEFAULT_FONT_FAMILY;
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
      item.setAttribute('aria-selected', family === current ? 'true' : 'false');
      item.dataset.family = family;
      item.innerHTML = `
        <span class="cfp-item-name" style="font-family:'${family.replace(/'/g, "\\'")}',sans-serif">${family}</span>
        <span class="cfp-badge">${badgeFor(family)}</span>
      `;
      item.addEventListener('click', () => {
        selectFamily(family);
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

  async function selectFamily(family) {
    current = family;
    setLabel(family);
    const source = isSystemFontFamily(family) ? 'system' : 'google';
    try {
      await loadFontFamily({ family, source });
    } catch (e) {
      console.warn('[collage-font-bridge] loadFontFamily', family, e);
    }
    if (typeof onFontChange === 'function') {
      onFontChange(family);
    }
  }

  function openAddFontDialog() {
    const cache = getGoogleFontsCache();
    const families = listGoogleCacheFamilies(cache);
    const backdrop = document.createElement('div');
    backdrop.className = 'cfp-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="cfp-dialog" role="dialog" aria-label="Add Font">
        <div class="cfp-dialog-header">
          <span>Google Fonts Library (${families.length})</span>
          <button type="button" class="cfp-dialog-close" aria-label="Close">×</button>
        </div>
        <input type="search" class="cfp-dialog-search" placeholder="Search Google fonts…" autocomplete="off" />
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
      const matches = families.filter((f) => !q || f.toLowerCase().includes(q)).slice(0, 100);
      for (const family of matches) {
        const item = document.createElement('div');
        item.className = 'cfp-item';
        item.innerHTML = `
          <span class="cfp-item-name" style="font-family:'${family.replace(/'/g, "\\'")}',sans-serif">${family}</span>
          <span class="cfp-badge">Google</span>
        `;
        item.addEventListener('click', async () => {
          if (!extras.includes(family) && !DEFAULT_FONTS.includes(family)) {
            extras.push(family);
          }
          close();
          await selectFamily(family);
        });
        list.appendChild(item);
      }
      if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'cfp-item';
        empty.style.color = '#888888';
        empty.textContent = 'No matching Google fonts found';
        list.appendChild(empty);
      }
    }
    search.addEventListener('input', () => renderList(search.value));
    renderList('');
    search.focus();
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
  setLabel(current);
  loadFontFamily({ family: current, source: isSystemFontFamily(current) ? 'system' : 'google' }).catch(() => {});

  return {
    selectFamily,
    getCurrent: () => current,
  };
}

export {
  DEFAULT_FONTS,
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_FAMILIES,
  getGoogleFontsCache,
  listGoogleCacheFamilies,
  loadFontFamily,
  isSystemFontFamily,
};
