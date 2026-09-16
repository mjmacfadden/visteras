/**
 * Visteras Vector — Studio-aligned font family picker overlay.
 * Mounts after svgEditor.init(); does not modify Editor.js.
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

const SYSTEM_SET = new Set(SYSTEM_FONT_FAMILIES);

function badgeFor(family) {
	if (SYSTEM_SET.has(family) || isSystemFontFamily(family)) return 'System';
	return 'Google';
}

function ensureStyles() {
	if (document.getElementById('visteras-font-bridge-styles')) return;
	const style = document.createElement('style');
	style.id = 'visteras-font-bridge-styles';
	style.textContent = `
#visteras_font_picker {
  position: relative;
  flex: 1;
  min-width: 0;
  font-family: var(--ui-font, "Segoe UI", Arial, sans-serif);
}
#visteras_font_picker .vfp-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  background: var(--input-color, #242424);
  color: var(--studio-text, #cccccc);
  border: 1px solid var(--studio-border-dark, #1a1a1a);
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
}
#visteras_font_picker .vfp-trigger:hover {
  border-color: var(--studio-border-light, #505050);
}
#visteras_font_picker .vfp-trigger:focus {
  outline: 1px solid var(--studio-orange, #fa7c1b);
  outline-offset: 0;
}
#visteras_font_picker .vfp-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: inherit;
}
#visteras_font_picker .vfp-caret {
  color: var(--studio-text-muted, #888);
  flex-shrink: 0;
}
#visteras_font_picker .vfp-menu {
  display: none;
  position: absolute;
  z-index: 10050;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  max-height: 260px;
  overflow: auto;
  background: var(--studio-panel-bg, #3c3c3c);
  border: 1px solid var(--studio-border-dark, #1a1a1a);
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
#visteras_font_picker.open .vfp-menu { display: block; }
#visteras_font_picker .vfp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--studio-text, #ccc);
  font-size: 12px;
}
#visteras_font_picker .vfp-item:hover,
#visteras_font_picker .vfp-item[aria-selected="true"] {
  background: var(--studio-blue-active, #2a6bb5);
  color: #fff;
}
#visteras_font_picker .vfp-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#visteras_font_picker .vfp-badge {
  flex-shrink: 0;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--studio-text-muted, #888);
  border: 1px solid var(--studio-border-light, #505050);
  border-radius: 2px;
  padding: 1px 4px;
}
#visteras_font_picker .vfp-item:hover .vfp-badge,
#visteras_font_picker .vfp-item[aria-selected="true"] .vfp-badge {
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.35);
}
#visteras_font_picker .vfp-item.add {
  border-top: 1px solid var(--studio-border-med, #2a2a2a);
  color: var(--studio-orange, #fa7c1b);
  font-weight: 600;
}
#visteras_font_picker .vfp-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10060;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
#visteras_font_picker .vfp-dialog {
  width: min(420px, 92vw);
  max-height: min(480px, 80vh);
  display: flex;
  flex-direction: column;
  background: var(--studio-panel-bg, #3c3c3c);
  border: 1px solid var(--studio-border-dark, #1a1a1a);
  border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  color: var(--studio-text, #ccc);
}
#visteras_font_picker .vfp-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--studio-border-med, #2a2a2a);
  font-weight: 600;
}
#visteras_font_picker .vfp-dialog-header button {
  background: transparent;
  border: none;
  color: var(--studio-text-muted, #888);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
#visteras_font_picker .vfp-dialog-search {
  margin: 8px 12px;
  padding: 6px 8px;
  background: var(--input-color, #242424);
  border: 1px solid var(--studio-border-dark, #1a1a1a);
  border-radius: 3px;
  color: var(--studio-text, #ccc);
  font-size: 12px;
}
#visteras_font_picker .vfp-dialog-list {
  flex: 1;
  overflow: auto;
  padding: 0 0 8px;
}
#visteras_font_picker .vfp-dialog-list .vfp-item { padding: 7px 12px; }
se-select#tool_font_family.visteras-font-hidden {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  position: absolute !important;
  pointer-events: none !important;
}
`;
	document.head.appendChild(style);
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasFontPicker({ svgEditor } = {}) {
	ensureStyles();

	const slot = document.getElementById('slot_font_family');
	const stock = document.getElementById('tool_font_family');
	if (!slot) {
		console.warn('[visteras-font-bridge] #slot_font_family missing');
		return;
	}

	if (stock) {
		stock.classList.add('visteras-font-hidden');
		// Clear stock options so they don't fight our picker
		try {
			if (typeof stock.setAttribute === 'function') {
				stock.setAttribute('options', '');
				stock.setAttribute('values', '');
			}
		} catch (e) { /* ignore */ }
	}

	let current = DEFAULT_FONT_FAMILY;
	/** @type {string[]} */
	let extras = [];

	const root = document.createElement('div');
	root.id = 'visteras_font_picker';
	root.innerHTML = `
		<button type="button" class="vfp-trigger" aria-haspopup="listbox" aria-expanded="false">
			<span class="vfp-trigger-label"></span>
			<span class="vfp-caret">▾</span>
		</button>
		<div class="vfp-menu" role="listbox"></div>
	`;
	slot.appendChild(root);

	const trigger = root.querySelector('.vfp-trigger');
	const labelEl = root.querySelector('.vfp-trigger-label');
	const menu = root.querySelector('.vfp-menu');

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
			item.className = 'vfp-item';
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', family === current ? 'true' : 'false');
			item.dataset.family = family;
			item.innerHTML = `<span class="vfp-item-name" style="font-family:'${family.replace(/'/g, "\\'")}',sans-serif">${family}</span><span class="vfp-badge">${badgeFor(family)}</span>`;
			item.addEventListener('click', () => {
				selectFamily(family);
				closeMenu();
			});
			menu.appendChild(item);
		}
		const add = document.createElement('div');
		add.className = 'vfp-item add';
		add.textContent = 'Add Font…';
		add.addEventListener('click', () => {
			closeMenu();
			openAddFontDialog();
		});
		menu.appendChild(add);
	}

	async function applyToCanvas(family) {
		const sc = svgEditor && (svgEditor.svgCanvas || svgEditor);
		if (sc && typeof sc.setFontFamily === 'function') {
			sc.setFontFamily(family);
		}
		if (stock) {
			try {
				stock.value = family;
				stock.dispatchEvent(new CustomEvent('change', { detail: { value: family }, bubbles: true }));
			} catch (e) { /* ignore */ }
		}
	}

	async function selectFamily(family) {
		current = family;
		setLabel(family);
		const source = isSystemFontFamily(family) ? 'system' : 'google';
		try {
			await loadFontFamily({ family, source });
		} catch (e) {
			console.warn('[visteras-font-bridge] loadFontFamily', family, e);
		}
		await applyToCanvas(family);
	}

	function openAddFontDialog() {
		const cache = getGoogleFontsCache();
		const families = listGoogleCacheFamilies(cache);
		const backdrop = document.createElement('div');
		backdrop.className = 'vfp-dialog-backdrop';
		backdrop.innerHTML = `
			<div class="vfp-dialog" role="dialog" aria-label="Add Font">
				<div class="vfp-dialog-header">
					<span>Add Font</span>
					<button type="button" class="vfp-dialog-close" aria-label="Close">×</button>
				</div>
				<input type="search" class="vfp-dialog-search" placeholder="Search Google fonts…" autocomplete="off" />
				<div class="vfp-dialog-list"></div>
			</div>
		`;
		root.appendChild(backdrop);
		const list = backdrop.querySelector('.vfp-dialog-list');
		const search = backdrop.querySelector('.vfp-dialog-search');
		const close = () => backdrop.remove();
		backdrop.querySelector('.vfp-dialog-close').addEventListener('click', close);
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) close();
		});

		function renderList(query) {
			const q = String(query || '').trim().toLowerCase();
			list.innerHTML = '';
			const matches = families.filter((f) => !q || f.toLowerCase().includes(q)).slice(0, 80);
			for (const family of matches) {
				const item = document.createElement('div');
				item.className = 'vfp-item';
				item.innerHTML = `<span class="vfp-item-name" style="font-family:'${family.replace(/'/g, "\\'")}',sans-serif">${family}</span><span class="vfp-badge">Google</span>`;
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
				empty.className = 'vfp-item';
				empty.textContent = 'No matches';
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

	// Sync label when SVG-Edit updates stock control (selection change)
	const syncFromSelection = () => {
		try {
			const sc = svgEditor && svgEditor.svgCanvas;
			const sel = sc && sc.getSelectedElements ? sc.getSelectedElements().filter(Boolean) : [];
			const el = sel[0];
			if (el && el.nodeName === 'text') {
				const ff = el.getAttribute('font-family');
				if (ff) {
					const primary = ff.split(',')[0].replace(/['"]/g, '').trim();
					if (primary && primary !== current) {
						current = primary;
						setLabel(primary);
					}
				}
			}
		} catch (e) { /* ignore */ }
	};

	if (svgEditor && svgEditor.svgCanvas && typeof svgEditor.svgCanvas.bind === 'function') {
		svgEditor.svgCanvas.bind('selectedChanged', syncFromSelection);
		svgEditor.svgCanvas.bind('elementChanged', syncFromSelection);
	}

	// Preload default + set UI
	setLabel(current);
	loadFontFamily({ family: current, source: 'google' }).catch(() => {});

	return {
		selectFamily,
		getCurrent: () => current,
	};
}

export default mountVisterasFontPicker;
