/**
 * Visteras Vector — Studio-Parity Font Management & Bridge
 * - Studio-parity Font Family Dropdown with (System), (Custom), (Google) badges
 * - Studio-parity "Search for Font" Modal Dialog:
 *     Chromium Local Font Access (window.queryLocalFonts), Font File Upload (.ttf, .otf, .woff, .woff2),
 *     Category/Weight/Width/Style/Sort filters, Checkbox selection, Preview cards
 * - Studio-parity Font Weight Dropdown: dynamically populated from Google cache & local font variants
 * - Bidirectional typography synchronization across text elements, type-on-path, and curText defaults
 */
import {
	DEFAULT_FONTS,
	DEFAULT_FONT_FAMILY,
	SYSTEM_FONT_FAMILIES,
	getGoogleFontsCache,
	isSystemFontFamily,
	listGoogleCacheFamilies,
	loadFontFamily,
	formatWeightLabel,
	registerLocalFontData,
	styleNameToCssWeight,
	weightLabelBase,
} from '../lib/visteras-fonts.js';

const SYSTEM_SET = new Set(SYSTEM_FONT_FAMILIES.map(f => f.toLowerCase()));
const STORAGE_KEY_ACTIVE_FONTS = 'visteras_active_fonts';
const STORAGE_KEY_LOCAL_FONTS = 'photochop_local_fonts';
const DB_NAME = 'photochop_fonts';
const DB_VERSION = 1;
const STORE_NAME = 'custom_fonts';

/* -------------------------------------------------------------------------
 * IndexedDB Custom Fonts Manager (parity with Studio)
 * ------------------------------------------------------------------------- */
let fontDbInstance = null;
const customFontsMap = new Map(); // name -> { family, fileName, date, source: 'user_uploaded' }
const systemFontVariantsMap = new Map(); // family -> Set<variantName>
const localFontsDataMap = new Map(); // familyLower -> Array of FontData
let cachedSystemFamilies = [];

function openFontDB() {
	if (fontDbInstance) return Promise.resolve(fontDbInstance);
	return new Promise((resolve) => {
		if (typeof window === 'undefined' || !window.indexedDB) {
			resolve(null);
			return;
		}
		try {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = (e) => {
				const db = e.target.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: 'name' });
				}
			};
			req.onsuccess = (e) => {
				fontDbInstance = e.target.result;
				resolve(fontDbInstance);
			};
			req.onerror = () => resolve(null);
		} catch (_) {
			resolve(null);
		}
	});
}

async function getAllCustomFontsFromDB() {
	const db = await openFontDB();
	if (!db) return [];
	return new Promise((resolve) => {
		try {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const req = store.getAll();
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => resolve([]);
		} catch (_) {
			resolve([]);
		}
	});
}

/**
 * Bytes of an uploaded font (File ▸ Export inlines them: an SVG rendered through <img>
 * can't see fonts added to document.fonts). { buffer, type } or null.
 */
async function getCustomFontBytes(family) {
	const want = String(family || '').trim().toLowerCase();
	if (!want) return null;
	const items = await getAllCustomFontsFromDB();
	const hit = items.find((i) => String(i?.name || '').toLowerCase() === want);
	return hit && hit.buffer ? { buffer: hit.buffer, type: String(hit.type || '').toLowerCase() } : null;
}
if (typeof window !== 'undefined') window.__visterasFontBytes = getCustomFontBytes;

async function saveCustomFontToDB(name, buffer, type, fileName) {
	const db = await openFontDB();
	if (!db) return false;
	return new Promise((resolve) => {
		try {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			const req = store.put({ name, buffer, type, fileName, date: Date.now() });
			req.onsuccess = () => resolve(true);
			req.onerror = () => resolve(false);
		} catch (_) {
			resolve(false);
		}
	});
}

async function addCustomFontFile(file) {
	const fileName = file.name || 'CustomFont.ttf';
	const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
	const ext = extMatch ? extMatch[1].toLowerCase() : '';
	if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
		throw new Error('Unsupported font format. Supported formats: .ttf, .otf, .woff, .woff2');
	}
	const familyName = fileName.replace(/\.[^/.]+$/, '').trim();
	const buffer = await file.arrayBuffer();
	const fontFace = new FontFace(familyName, buffer.slice(0));
	const loadedFace = await fontFace.load();
	if (typeof document !== 'undefined' && document.fonts) {
		document.fonts.add(loadedFace);
	}
	await saveCustomFontToDB(familyName, buffer.slice(0), ext, fileName);
	customFontsMap.set(familyName, { family: familyName, fileName, source: 'user_uploaded' });
	return familyName;
}

/* -------------------------------------------------------------------------
 * Chromium Local Font Access (System Fonts parity with Studio)
 * ------------------------------------------------------------------------- */
function isLocalFontAccessSupported() {
	return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
}

function getCachedSystemFonts() {
	if (cachedSystemFamilies && cachedSystemFamilies.length > 0) return cachedSystemFamilies;
	try {
		const raw = localStorage.getItem(STORAGE_KEY_LOCAL_FONTS);
		if (raw) {
			cachedSystemFamilies = JSON.parse(raw);
			return cachedSystemFamilies;
		}
	} catch (_) {}
	return [];
}

async function querySystemFonts(forceRefresh = false) {
	if (!isLocalFontAccessSupported()) {
		throw new Error('System font access requires a Chromium desktop browser (Chrome, Edge, Brave).');
	}
	if (!forceRefresh && cachedSystemFamilies.length > 0 && systemFontVariantsMap.size > 0) {
		return cachedSystemFamilies;
	}
	const localFonts = await window.queryLocalFonts();
	const familySet = new Set();
	systemFontVariantsMap.clear();
	localFontsDataMap.clear();
	for (const font of localFonts) {
		if (font && font.family) {
			const familyName = font.family.trim();
			familySet.add(familyName);
			if (!systemFontVariantsMap.has(familyName)) {
				systemFontVariantsMap.set(familyName, new Set());
			}
			const styleName = font.style && String(font.style).trim() ? String(font.style).trim() : 'Regular';
			systemFontVariantsMap.get(familyName).add(styleName);

			const key = familyName.toLowerCase();
			if (!localFontsDataMap.has(key)) {
				localFontsDataMap.set(key, []);
			}
			localFontsDataMap.get(key).push(font);
			try {
				registerLocalFontData(familyName, font);
			} catch (_) {}
		}
	}
	const unique = Array.from(familySet).filter(Boolean).sort((a, b) => a.localeCompare(b));
	cachedSystemFamilies = unique;
	try {
		localStorage.setItem(STORAGE_KEY_LOCAL_FONTS, JSON.stringify(unique));
	} catch (_) {}
	return unique;
}

if (typeof window !== 'undefined') {
	window.__visterasGetLocalFont = (family, weight = '400', style = 'normal') => {
		const list = localFontsDataMap.get(String(family || '').trim().toLowerCase());
		if (!list || list.length === 0) return null;
		if (weight === '700' || weight === '900') {
			const bold = list.find(f => /bold/i.test(f.style || ''));
			if (bold) return bold;
		}
		if (style === 'italic') {
			const ital = list.find(f => /italic|oblique/i.test(f.style || ''));
			if (ital) return ital;
		}
		return list[0];
	};
}

function getSystemFontVariants(family) {
	if (systemFontVariantsMap.has(family)) {
		return Array.from(systemFontVariantsMap.get(family));
	}
	return [];
}

/* -------------------------------------------------------------------------
 * Font Categories & Filtering Helpers (matching Studio text.js)
 * ------------------------------------------------------------------------- */
function detectCategory(font) {
	if (font.category && font.category !== 'other') {
		return String(font.category).toLowerCase();
	}
	const name = (font.family || '').toLowerCase();
	if (/\b(mono|code|console|typewriter|fixed)\b|mono/i.test(name)) return 'monospace';
	if (/script|hand|brush|calli|cursive|pen|marker|sketch|doodle/i.test(name)) return 'handwriting';
	if (/serif|roman|times|garamond|baskerville|palatino|bookman|century|georgia|didot|bodoni|caslon|cambria|cormorant/i.test(name)) return 'serif';
	if (/sans|gothic|arial|helvetica|calibri|verdana|trebuchet|segoe|ubuntu|roboto|inter|adwaita|grotesk|lato|poppins|nunito|work|rubik|prompt/i.test(name)) return 'sans-serif';
	if (/display|poster|black|ultra|fat|shadow|headline|stencil|impact|comic|bungee|chunk|alfa|bebas|bricolage/i.test(name)) return 'display';
	return 'sans-serif';
}

function matchesWeight(font, weight) {
	if (!weight || weight === 'all') return true;
	const variants = Array.isArray(font.variants) ? font.variants : [];
	const lower = variants.map(v => String(v).toLowerCase());
	if (lower.length === 0) return true;
	if (weight === 'thin') return lower.some(v => /100|200|300|thin|light|hairline/.test(v));
	if (weight === 'regular') return lower.some(v => /regular|normal|book|roman|400/.test(v));
	if (weight === 'medium') return lower.some(v => /500|600|medium|semi[- ]?bold|demi/.test(v));
	if (weight === 'bold') return lower.some(v => /700|800|900|bold|black|heavy|extra[- ]?bold/.test(v));
	return true;
}

function matchesWidth(font, width) {
	if (!width || width === 'all') return true;
	const name = (font.family || '').toLowerCase();
	const isCondensed = /condensed|narrow|compressed|compact/.test(name);
	const isExpanded = /expanded|extended|wide/.test(name);
	if (width === 'condensed') return isCondensed;
	if (width === 'expanded') return isExpanded;
	if (width === 'normal') return !isCondensed && !isExpanded;
	return true;
}

function matchesStyle(font, style) {
	if (!style || style === 'all') return true;
	const variants = Array.isArray(font.variants) ? font.variants : [];
	const lower = variants.map(v => String(v).toLowerCase());
	if (style === 'italic') return lower.some(v => /italic|oblique/.test(v));
	if (style === 'multiple') return lower.length >= 4;
	return true;
}

function sortFonts(list, sortOrder) {
	if (sortOrder === 'alpha_asc') return [...list].sort((a, b) => a.family.localeCompare(b.family));
	if (sortOrder === 'alpha_desc') return [...list].sort((a, b) => b.family.localeCompare(a.family));
	if (sortOrder === 'styles') {
		return [...list].sort((a, b) => {
			const countA = a.variants ? a.variants.length : 1;
			const countB = b.variants ? b.variants.length : 1;
			return countB - countA;
		});
	}
	return list;
}

function getFontWeightList(family) {
	const labels = [];
	const seen = new Set();
	const push = (raw) => {
		if (raw == null) return;
		const label = formatWeightLabel(raw);
		if (!label) return;
		const key = weightLabelBase(label).toLowerCase().replace(/[\s_-]+/g, '');
		if (seen.has(key)) return;
		seen.add(key);
		labels.push(label);
	};
	const pushVariant = (v) => {
		if (v == null) return;
		const s = String(v).trim();
		if (!s || /^italic$/i.test(s) || /^oblique$/i.test(s)) return;
		if (/italic|oblique/i.test(s)) {
			const base = s.replace(/italic|oblique/ig, '').trim();
			if (base) push(base);
			return;
		}
		push(s);
	};
	for (const v of getSystemFontVariants(family)) pushVariant(v);
	const custom = customFontsMap.get(family);
	if (custom && Array.isArray(custom.variants)) {
		for (const v of custom.variants) pushVariant(v);
	}
	const cache = getGoogleFontsCache();
	if (Array.isArray(cache)) {
		const entry = cache.find(f => f && f.family === family);
		if (entry && Array.isArray(entry.variants)) {
			for (const v of entry.variants) pushVariant(v);
		}
	}
	if (labels.length === 0) return ['Regular (400)', 'Bold (700)'];
	// Sort by numeric weight ascending
	return labels.sort((a, b) => parseInt(styleNameToCssWeight(a), 10) - parseInt(styleNameToCssWeight(b), 10));
}

function badgeFor(family) {
	if (customFontsMap.has(family)) return 'Custom';
	if (SYSTEM_SET.has(family.toLowerCase()) || isSystemFontFamily(family) || cachedSystemFamilies.includes(family)) {
		return 'System';
	}
	return 'Google';
}

function escapeHtml(str) {
	if (!str) return '';
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/* -------------------------------------------------------------------------
 * Stylesheet Injection
 * ------------------------------------------------------------------------- */
function ensureStyles() {
	if (document.getElementById('visteras-font-bridge-styles')) return;
	const style = document.createElement('style');
	style.id = 'visteras-font-bridge-styles';
	style.textContent = `
/* Font Family & Weight Pickers */
#visteras_font_picker,
#visteras_font_weight_picker {
  position: relative;
  width: 100%;
  font-family: var(--ui-font, "Segoe UI", Arial, sans-serif);
}
#visteras_font_picker .vfp-trigger,
#visteras_font_weight_picker .vfwp-trigger {
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
  height: 24px;
  line-height: 1.3;
  text-align: left;
}
#visteras_font_picker .vfp-trigger:hover,
#visteras_font_weight_picker .vfwp-trigger:hover {
  border-color: var(--studio-border-light, #505050);
}
#visteras_font_picker .vfp-trigger:focus,
#visteras_font_weight_picker .vfwp-trigger:focus {
  outline: 1px solid var(--studio-orange, #fa7c1b);
  outline-offset: 0;
}
#visteras_font_picker .vfp-trigger-label,
#visteras_font_weight_picker .vfwp-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
#visteras_font_picker .vfp-caret,
#visteras_font_weight_picker .vfwp-caret {
  color: var(--studio-text-muted, #888);
  flex-shrink: 0;
  font-size: 10px;
}
#visteras_font_picker .vfp-menu,
#visteras_font_weight_picker .vfwp-menu {
  display: none;
  position: absolute;
  z-index: 10050;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  max-height: 280px;
  overflow-y: auto;
  background: var(--studio-panel-bg, #3c3c3c);
  border: 1px solid var(--studio-border-dark, #1a1a1a);
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
#visteras_font_picker.open .vfp-menu,
#visteras_font_weight_picker.open .vfwp-menu {
  display: block;
}
#visteras_font_picker .vfp-item,
#visteras_font_weight_picker .vfwp-item {
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
#visteras_font_picker .vfp-item[aria-selected="true"],
#visteras_font_weight_picker .vfwp-item:hover,
#visteras_font_weight_picker .vfwp-item[aria-selected="true"] {
  background: var(--studio-blue-active, #2a6bb5);
  color: #fff;
}
#visteras_font_picker .vfp-item-name,
#visteras_font_weight_picker .vfwp-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
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
#visteras_font_picker .vfp-item.vfp-add-btn {
  border-bottom: 1px solid var(--studio-border-med, #2a2a2a);
  color: var(--studio-orange, #fa7c1b);
  font-weight: 600;
  background: rgba(250, 124, 27, 0.08);
}
#visteras_font_picker .vfp-item.vfp-add-btn:hover {
  background: var(--studio-orange, #fa7c1b);
  color: #fff;
}

/* Studio-Parity "Search for Font" Dialog */
.vfp-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ui-font, "Segoe UI", Arial, sans-serif);
}
.vfp-modal-dialog {
  width: min(780px, 94vw);
  max-height: min(650px, 90vh);
  display: flex;
  flex-direction: column;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.75);
  color: #e2e8f0;
  overflow: hidden;
}
.vfp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #222;
  border-bottom: 1px solid #383838;
}
.vfp-modal-title {
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
}
.vfp-modal-close {
  background: transparent;
  border: none;
  color: #888;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.vfp-modal-close:hover {
  color: #fff;
}
.vfp-modal-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.vfp-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.vfp-search-label {
  font-size: 13px;
  font-weight: 600;
  color: #ccc;
  width: 50px;
}
.vfp-search-input {
  flex: 1;
  padding: 6px 10px;
  background: #1c1c1c;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  outline: none;
}
.vfp-search-input:focus {
  border-color: #3b82f6;
}
.font_dialog_actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.font_dialog_actions .btn {
  padding: 5px 12px;
  font-size: 12px;
  background: #383838;
  color: #eee;
  border: 1px solid #505050;
  border-radius: 4px;
  cursor: pointer;
}
.font_dialog_actions .btn:hover {
  background: #484848;
  color: #fff;
}
.font_filter_tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.font_filter_tab {
  padding: 4px 10px;
  font-size: 12px;
  background: #23272e;
  color: #abb2bf;
  border: 1px solid #3e4451;
  border-radius: 4px;
  cursor: pointer;
}
.font_filter_tab:hover {
  background: #2c313a;
}
.font_filter_tab.active {
  background: #3e4451;
  color: #fff;
  font-weight: 600;
  border-color: #5c6370;
}
.font_filters_bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 12px;
  background: #202020;
  border: 1px solid #383838;
  border-radius: 6px;
  margin-bottom: 12px;
}
.font_filter_group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.font_filter_group label {
  font-size: 11px;
  font-weight: 600;
  color: #aaa;
}
.font_filter_select {
  font-size: 12px;
  padding: 3px 6px;
  background: #2a2a2a;
  color: #eee;
  border: 1px solid #484848;
  border-radius: 4px;
  outline: none;
}
.font_filter_reset_btn {
  margin-left: auto;
  padding: 3px 8px;
  font-size: 11px;
  background: transparent;
  color: #aaa;
  border: 1px solid #484848;
  border-radius: 4px;
  cursor: pointer;
}
.font_filter_reset_btn:hover {
  background: #383838;
  color: #fff;
}
.font_browser_wrapper {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #383838;
  border-radius: 4px;
  background: #1e1e1e;
  padding: 6px;
  min-height: 200px;
}
.selection_card_list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.selection_card {
  display: flex;
  align-items: center;
  background: #252525;
  border: 1px solid #383838;
  border-radius: 4px;
  padding: 8px 12px;
  gap: 12px;
  cursor: pointer;
  transition: background 0.1s;
}
.selection_card:hover {
  background: #2e2e2e;
  border-color: #484848;
}
.selection_card input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin: 0;
  cursor: pointer;
  accent-color: #2563eb;
  flex-shrink: 0;
}
.selection_card_content {
  flex: 1;
  min-width: 0;
}
.selection_card .font_preview {
  font-size: 20px;
  line-height: 1.3;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.selection_card_meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.selection_card_name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  margin-right: 4px;
}
.font_badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.font_badge_system { background: #2563eb; color: #ffffff; }
.font_badge_custom { background: #059669; color: #ffffff; }
.font_badge_google { background: #4b5563; color: #ffffff; }
.font_badge_category { background: #374151; color: #cbd5e1; }
.font_badge_styles {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.35);
}
.font_load_more_container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 6px;
  gap: 6px;
}
.font_load_more_btn {
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  background: #333;
  color: #eee;
  border: 1px solid #484848;
  border-radius: 4px;
  cursor: pointer;
}
.font_load_more_btn:hover { background: #444; color: #fff; }
.font_load_more_info { font-size: 11px; color: #888; }
.font_empty_state {
  padding: 30px 16px;
  text-align: center;
  color: #888;
  font-size: 13px;
}
.vfp-modal-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 16px;
  background: #222;
  border-top: 1px solid #383838;
}
.vfp-modal-footer .btn {
  min-width: 80px;
  padding: 6px 18px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
}
.vfp-modal-footer .btn-primary {
  background: #2a6bb5;
  color: #fff;
  border: 1px solid #1c5291;
}
.vfp-modal-footer .btn-primary:hover { background: #337ecf; }
.vfp-modal-footer .btn-secondary {
  background: #383838;
  color: #ccc;
  border: 1px solid #4a4a4a;
}
.vfp-modal-footer .btn-secondary:hover { background: #444; color: #fff; }
`;
	document.head.appendChild(style);
}

/* -------------------------------------------------------------------------
 * Studio-Parity "Search for Font" Modal Dialog Class
 * ------------------------------------------------------------------------- */
class FontSearchDialog {
	constructor({ onSelectFont, onFontsChanged } = {}) {
		this.onSelectFont = onSelectFont;
		this.onFontsChanged = onFontsChanged;
		this.searchQuery = '';
		this.activeFilter = 'all'; // 'all' | 'system' | 'custom' | 'google'
		this.selectedCategory = 'all';
		this.selectedWeight = 'all';
		this.selectedWidth = 'all';
		this.selectedStyle = 'all';
		this.selectedSort = 'popularity';
		this.batchSize = 25;
		this.renderedCount = 0;
		this.fontList = [];
		this.fontListFiltered = [];
		this.googleFontList = [];
		this.localFontList = [];
		this.customFontList = [];
		this.selectedFontsMap = {}; // family -> boolean | object
		this.backdrop = null;
	}

	show(activeFontsSet) {
		ensureStyles();
		this.activeFontsSet = activeFontsSet;
		this.selectedFontsMap = {};
		for (const f of activeFontsSet) {
			this.selectedFontsMap[f] = true;
		}

		const backdrop = document.createElement('div');
		backdrop.className = 'vfp-modal-backdrop';
		backdrop.innerHTML = `
			<div class="vfp-modal-dialog" role="dialog" aria-modal="true" aria-label="Search for Font">
				<div class="vfp-modal-header">
					<span class="vfp-modal-title">Search for Font</span>
					<button type="button" class="vfp-modal-close" aria-label="Close">×</button>
				</div>
				<div class="vfp-modal-body">
					<div class="vfp-search-row">
						<label class="vfp-search-label" for="font_search_input">Search:</label>
						<input type="search" id="font_search_input" class="vfp-search-input" placeholder="Type to filter fonts…" autocomplete="off" />
					</div>
					<div class="font_dialog_actions">
						<button type="button" class="btn" id="btn_upload_font">Upload Font File (.ttf, .otf, .woff)...</button>
						<button type="button" class="btn" id="btn_system_fonts">Use System Fonts</button>
					</div>
					<div class="font_filter_tabs">
						<button type="button" class="font_filter_tab active" data-tab="all">All</button>
						<button type="button" class="font_filter_tab" data-tab="system">System</button>
						<button type="button" class="font_filter_tab" data-tab="custom">Custom</button>
						<button type="button" class="font_filter_tab" data-tab="google">Google Fonts</button>
					</div>
					<div class="font_filters_bar">
						<div class="font_filter_group">
							<label for="font_sel_category">Category:</label>
							<select id="font_sel_category" class="font_filter_select">
								<option value="all">All Categories</option>
								<option value="sans-serif">Sans Serif</option>
								<option value="serif">Serif</option>
								<option value="display">Display</option>
								<option value="handwriting">Handwriting</option>
								<option value="monospace">Monospace</option>
							</select>
						</div>
						<div class="font_filter_group">
							<label for="font_sel_weight">Weight:</label>
							<select id="font_sel_weight" class="font_filter_select">
								<option value="all">Any Weight</option>
								<option value="thin">Thin / Light (100–300)</option>
								<option value="regular">Regular (400)</option>
								<option value="medium">Medium / Semi-Bold (500–600)</option>
								<option value="bold">Bold / Black (700+)</option>
							</select>
						</div>
						<div class="font_filter_group">
							<label for="font_sel_width">Width:</label>
							<select id="font_sel_width" class="font_filter_select">
								<option value="all">Any Width</option>
								<option value="condensed">Condensed / Narrow</option>
								<option value="normal">Normal</option>
								<option value="expanded">Expanded / Wide</option>
							</select>
						</div>
						<div class="font_filter_group">
							<label for="font_sel_style">Style:</label>
							<select id="font_sel_style" class="font_filter_select">
								<option value="all">Any Style</option>
								<option value="italic">Has Italic</option>
								<option value="multiple">4+ Styles</option>
							</select>
						</div>
						<div class="font_filter_group">
							<label for="font_sel_sort">Sort:</label>
							<select id="font_sel_sort" class="font_filter_select">
								<option value="popularity">Popularity</option>
								<option value="alpha_asc">Name (A–Z)</option>
								<option value="alpha_desc">Name (Z–A)</option>
								<option value="styles">Most Styles</option>
							</select>
						</div>
						<button type="button" id="btn_reset_filters" class="font_filter_reset_btn">Reset Filters</button>
					</div>
					<div class="font_browser_wrapper">
						<div class="selection_card_list" id="font_cards_list"></div>
						<div class="font_load_more_container" id="font_load_more_box">
							<button type="button" class="font_load_more_btn" id="btn_load_more">Load More Fonts</button>
							<div class="font_load_more_info" id="font_count_info"></div>
						</div>
					</div>
				</div>
				<div class="vfp-modal-footer">
					<button type="button" class="btn btn-primary" id="btn_dialog_ok">Ok</button>
					<button type="button" class="btn btn-secondary" id="btn_dialog_cancel">Cancel</button>
				</div>
			</div>
		`;
		document.body.appendChild(backdrop);
		this.backdrop = backdrop;

		const close = () => {
			backdrop.remove();
			this.backdrop = null;
		};
		backdrop.querySelector('.vfp-modal-close').addEventListener('click', close);
		backdrop.querySelector('#btn_dialog_cancel').addEventListener('click', close);
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) close();
		});

		// Local fonts button label
		const sysBtn = backdrop.querySelector('#btn_system_fonts');
		const cachedSys = getCachedSystemFonts();
		if (cachedSys.length > 0) {
			sysBtn.textContent = 'Refresh System Fonts';
			this.localFontList = cachedSys.map(family => ({
				family,
				source: 'local',
				variants: getSystemFontVariants(family),
				category: detectCategory({ family })
			}));
		} else {
			sysBtn.textContent = 'Use System Fonts';
		}
		sysBtn.addEventListener('click', async () => {
			await this.scanSystemFonts(true);
		});

		// Upload font button
		const uploadBtn = backdrop.querySelector('#btn_upload_font');
		uploadBtn.addEventListener('click', () => {
			const fileInput = document.createElement('input');
			fileInput.type = 'file';
			fileInput.accept = '.ttf,.otf,.woff,.woff2';
			fileInput.multiple = true;
			fileInput.style.display = 'none';
			document.body.appendChild(fileInput);
			fileInput.addEventListener('change', async () => {
				const files = Array.from(fileInput.files || []);
				fileInput.remove();
				if (!files.length) return;
				const added = [];
				for (const f of files) {
					try {
						const name = await addCustomFontFile(f);
						added.push(name);
						this.selectedFontsMap[name] = true;
					} catch (err) {
						if (window.showStudioToast) window.showStudioToast(err.message || String(err), 'error');
					}
				}
				if (added.length) {
					if (window.showStudioToast) window.showStudioToast(`Loaded ${added.length} custom font(s)`, 'success');
					this.rebuildFontList();
				}
			});
			fileInput.click();
		});

		// Search input with debounce
		let searchTimer = null;
		const searchInput = backdrop.querySelector('#font_search_input');
		searchInput.addEventListener('input', (e) => {
			clearTimeout(searchTimer);
			searchTimer = setTimeout(() => {
				this.searchQuery = e.target.value || '';
				this.applySearchFilter();
			}, 180);
		});

		// Tabs
		const tabBtns = backdrop.querySelectorAll('.font_filter_tab');
		tabBtns.forEach(btn => {
			btn.addEventListener('click', async () => {
				tabBtns.forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				this.activeFilter = btn.dataset.tab;
				if (this.activeFilter === 'system' && this.localFontList.length === 0 && isLocalFontAccessSupported()) {
					await this.scanSystemFonts();
				} else {
					this.rebuildFontList();
				}
			});
		});

		// Filter selects
		const catSel = backdrop.querySelector('#font_sel_category');
		const weightSel = backdrop.querySelector('#font_sel_weight');
		const widthSel = backdrop.querySelector('#font_sel_width');
		const styleSel = backdrop.querySelector('#font_sel_style');
		const sortSel = backdrop.querySelector('#font_sel_sort');
		const resetBtn = backdrop.querySelector('#btn_reset_filters');

		catSel.addEventListener('change', (e) => { this.selectedCategory = e.target.value; this.applySearchFilter(); });
		weightSel.addEventListener('change', (e) => { this.selectedWeight = e.target.value; this.applySearchFilter(); });
		widthSel.addEventListener('change', (e) => { this.selectedWidth = e.target.value; this.applySearchFilter(); });
		styleSel.addEventListener('change', (e) => { this.selectedStyle = e.target.value; this.applySearchFilter(); });
		sortSel.addEventListener('change', (e) => { this.selectedSort = e.target.value; this.applySearchFilter(); });
		resetBtn.addEventListener('click', () => {
			catSel.value = 'all'; weightSel.value = 'all'; widthSel.value = 'all'; styleSel.value = 'all'; sortSel.value = 'popularity';
			this.selectedCategory = 'all'; this.selectedWeight = 'all'; this.selectedWidth = 'all'; this.selectedStyle = 'all'; this.selectedSort = 'popularity';
			this.applySearchFilter();
		});

		// Load more button
		backdrop.querySelector('#btn_load_more').addEventListener('click', () => {
			this.appendBatch(this.batchSize);
		});

		// Checkbox delegation
		const cardsList = backdrop.querySelector('#font_cards_list');
		cardsList.addEventListener('change', (e) => {
			const cb = e.target.closest('input[type="checkbox"]');
			if (!cb) return;
			const fam = cb.value;
			this.selectedFontsMap[fam] = cb.checked;
		});

		// Ok button
		backdrop.querySelector('#btn_dialog_ok').addEventListener('click', () => {
			let firstSelected = null;
			for (const [name, checked] of Object.entries(this.selectedFontsMap)) {
				if (checked) {
					this.activeFontsSet.add(name);
					if (!firstSelected) firstSelected = name;
				} else {
					this.activeFontsSet.delete(name);
				}
			}
			close();
			if (typeof this.onFontsChanged === 'function') {
				this.onFontsChanged(this.activeFontsSet, firstSelected);
			}
		});

		// Initialize Google fonts from cache
		const cache = getGoogleFontsCache();
		this.googleFontList = cache.map(item => ({
			family: item.family,
			variants: item.variants || ['regular'],
			category: item.category || detectCategory(item),
			source: 'google'
		}));

		// Auto-scan system fonts silently if permission granted
		if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
			navigator.permissions.query({ name: 'local-fonts' }).then(status => {
				if (status.state === 'granted' && this.localFontList.length === 0 && isLocalFontAccessSupported()) {
					querySystemFonts().then(fonts => {
						if (fonts && fonts.length > 0) {
							this.localFontList = fonts.map(family => ({
								family,
								source: 'local',
								variants: getSystemFontVariants(family),
								category: detectCategory({ family })
							}));
							this.rebuildFontList();
						}
					}).catch(() => {});
				}
			}).catch(() => {});
		}

		this.rebuildFontList();
		searchInput.focus();
	}

	async scanSystemFonts(forceRefresh = false) {
		if (!isLocalFontAccessSupported()) {
			if (window.showStudioToast) {
				window.showStudioToast('System font access requires Chrome, Edge, or Brave.', 'error');
			}
			return;
		}
		const sysBtn = this.backdrop?.querySelector('#btn_system_fonts');
		if (sysBtn) {
			sysBtn.disabled = true;
			sysBtn.textContent = 'Scanning System Fonts...';
		}
		try {
			const families = await querySystemFonts(forceRefresh);
			this.localFontList = families.map(family => ({
				family,
				source: 'local',
				variants: getSystemFontVariants(family),
				category: detectCategory({ family })
			}));
			this.rebuildFontList();
			if (sysBtn) {
				sysBtn.disabled = false;
				sysBtn.textContent = 'Refresh System Fonts';
			}
			if (window.showStudioToast) {
				window.showStudioToast(`Loaded ${families.length} system font families.`, 'success');
			}
		} catch (err) {
			if (sysBtn) {
				sysBtn.disabled = false;
				sysBtn.textContent = 'Use System Fonts';
			}
			if (err.name !== 'AbortError' && window.showStudioToast) {
				window.showStudioToast('System font scan failed or permission denied: ' + (err.message || err), 'error');
			}
		}
	}

	rebuildFontList() {
		this.customFontList = Array.from(customFontsMap.keys()).map(name => ({
			family: name,
			source: 'user_uploaded',
			category: detectCategory({ family: name }),
			variants: ['regular']
		}));
		const customSet = new Set(this.customFontList.map(f => f.family));
		const localFiltered = this.localFontList.filter(f => !customSet.has(f.family));
		const localSet = new Set(this.localFontList.map(f => f.family));
		const googleFiltered = this.googleFontList.filter(f => !customSet.has(f.family) && !localSet.has(f.family));

		if (this.activeFilter === 'custom') {
			this.fontList = this.customFontList;
		} else if (this.activeFilter === 'system') {
			this.fontList = localFiltered;
		} else if (this.activeFilter === 'google') {
			this.fontList = googleFiltered;
		} else {
			this.fontList = [...this.customFontList, ...localFiltered, ...googleFiltered];
		}

		// Update tab counts
		if (this.backdrop) {
			const sysTab = this.backdrop.querySelector('.font_filter_tab[data-tab="system"]');
			if (sysTab) sysTab.textContent = this.localFontList.length > 0 ? `System (${this.localFontList.length})` : 'System';
			const custTab = this.backdrop.querySelector('.font_filter_tab[data-tab="custom"]');
			if (custTab) custTab.textContent = this.customFontList.length > 0 ? `Custom (${this.customFontList.length})` : 'Custom';
		}

		this.applySearchFilter();
	}

	applySearchFilter() {
		const query = (this.searchQuery || '').trim().toLowerCase();
		const cat = this.selectedCategory;
		const weight = this.selectedWeight;
		const width = this.selectedWidth;
		const style = this.selectedStyle;

		let filtered = this.fontList.filter(font => {
			if (query && !font.family.toLowerCase().includes(query)) return false;
			if (cat && cat !== 'all' && detectCategory(font) !== cat) return false;
			if (weight && weight !== 'all' && !matchesWeight(font, weight)) return false;
			if (width && width !== 'all' && !matchesWidth(font, width)) return false;
			if (style && style !== 'all' && !matchesStyle(font, style)) return false;
			return true;
		});

		this.fontListFiltered = sortFonts(filtered, this.selectedSort);
		this.resetAndRender();
	}

	resetAndRender() {
		this.renderedCount = 0;
		const cardsList = this.backdrop?.querySelector('#font_cards_list');
		if (!cardsList) return;
		cardsList.innerHTML = '';
		if (this.fontListFiltered.length === 0) {
			cardsList.innerHTML = `
				<div class="font_empty_state">
					<div>No fonts found matching your search & filter criteria.</div>
				</div>
			`;
			const loadMoreBox = this.backdrop.querySelector('#font_load_more_box');
			if (loadMoreBox) loadMoreBox.style.display = 'none';
			return;
		}
		this.appendBatch(this.batchSize);
	}

	appendBatch(count) {
		const cardsList = this.backdrop?.querySelector('#font_cards_list');
		const loadMoreBox = this.backdrop?.querySelector('#font_load_more_box');
		const countInfo = this.backdrop?.querySelector('#font_count_info');
		const loadMoreBtn = this.backdrop?.querySelector('#btn_load_more');
		if (!cardsList) return;

		const start = this.renderedCount;
		const end = Math.min(start + count, this.fontListFiltered.length);
		const batch = this.fontListFiltered.slice(start, end);

		for (let i = 0; i < batch.length; i++) {
			const font = batch[i];
			const card = this.createCardElement(font, start + i);
			cardsList.appendChild(card);
		}
		this.renderedCount = end;

		const total = this.fontListFiltered.length;
		if (loadMoreBox) {
			loadMoreBox.style.display = 'flex';
			if (end >= total) {
				if (loadMoreBtn) loadMoreBtn.style.display = 'none';
				if (countInfo) countInfo.textContent = `Showing all ${total} fonts`;
			} else {
				if (loadMoreBtn) loadMoreBtn.style.display = 'block';
				if (countInfo) countInfo.textContent = `Showing ${end} of ${total} fonts`;
			}
		}
	}

	createCardElement(font, idx) {
		const isChecked = !!this.selectedFontsMap[font.family];
		const source = font.source || 'google';
		let badgeClass = 'font_badge_google';
		let badgeText = 'Google';
		if (source === 'local') {
			badgeClass = 'font_badge_system';
			badgeText = 'System';
		} else if (source === 'user_uploaded') {
			badgeClass = 'font_badge_custom';
			badgeText = 'Custom';
		}

		const cat = detectCategory(font);
		const catNames = {
			'sans-serif': 'SANS SERIF',
			'serif': 'SERIF',
			'display': 'DISPLAY',
			'handwriting': 'HANDWRITING',
			'monospace': 'MONOSPACE'
		};
		const catLabel = catNames[cat] || cat.toUpperCase();
		const styleCount = font.variants && font.variants.length > 0 ? font.variants.length : 1;
		const styleLabel = `${styleCount} STYLE${styleCount === 1 ? '' : 'S'}`;

		// Preload font if Google font
		if (source === 'google') {
			loadFontFamily({ family: font.family, source: 'google' }).catch(() => {});
		}

		const card = document.createElement('div');
		card.className = 'selection_card';
		const inputId = `font_cb_${idx}_${encodeURIComponent(font.family).replace(/[^a-zA-Z0-9]/g, '_')}`;
		card.innerHTML = `
			<input type="checkbox" id="${inputId}" value="${escapeHtml(font.family)}" ${isChecked ? 'checked' : ''} />
			<label for="${inputId}" class="selection_card_content">
				<div class="font_preview" style="font-family: '${escapeHtml(font.family)}', sans-serif">
					The quick brown fox jumps over the lazy dog.
				</div>
				<div class="selection_card_meta">
					<span class="selection_card_name" style="font-family: '${escapeHtml(font.family)}', sans-serif">${escapeHtml(font.family)}</span>
					<span class="font_badge ${badgeClass}">${badgeText}</span>
					<span class="font_badge font_badge_category">${catLabel}</span>
					<span class="font_badge font_badge_styles">${styleLabel}</span>
				</div>
			</label>
		`;
		return card;
	}
}

/* -------------------------------------------------------------------------
 * Mount & Bridge Main Function
 * ------------------------------------------------------------------------- */
export function mountVisterasFontPicker({ svgEditor } = {}) {
	ensureStyles();

	const slotFamily = document.getElementById('slot_font_family');
	const slotWeight = document.getElementById('slot_font_weight');
	const stockFamily = document.getElementById('tool_font_family');
	if (!slotFamily) {
		console.warn('[visteras-font-bridge] #slot_font_family missing');
		return;
	}

	if (stockFamily) {
		stockFamily.classList.add('visteras-font-hidden');
		try {
			stockFamily.setAttribute('options', '');
			stockFamily.setAttribute('values', '');
		} catch (_) {}
	}

	let currentFamily = DEFAULT_FONT_FAMILY;
	let currentWeight = 'Regular (400)';

	// Initialize active fonts set from storage or default
	const activeFontsSet = new Set(DEFAULT_FONTS);
	try {
		const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_FONTS);
		if (saved) {
			const parsed = JSON.parse(saved);
			if (Array.isArray(parsed)) {
				for (const f of parsed) if (f) activeFontsSet.add(f);
			}
		}
	} catch (_) {}

	// Pre-load custom fonts from IndexedDB
	getAllCustomFontsFromDB().then((stored) => {
		for (const item of stored) {
			try {
				const face = new FontFace(item.name, item.buffer.slice(0));
				face.load().then((loaded) => {
					document.fonts.add(loaded);
					customFontsMap.set(item.name, { family: item.name, fileName: item.fileName, source: 'user_uploaded' });
					activeFontsSet.add(item.name);
					renderFamilyMenu();
				});
			} catch (_) {}
		}
	});

	// Pre-load cached system fonts
	const cachedSys = getCachedSystemFonts();
	for (const f of cachedSys) {
		activeFontsSet.add(f);
	}

	/* ---------------------------------------------------------------------
	 * 1. Font Family Picker UI
	 * --------------------------------------------------------------------- */
	const familyRoot = document.createElement('div');
	familyRoot.id = 'visteras_font_picker';
	familyRoot.innerHTML = `
		<button type="button" class="vfp-trigger" aria-haspopup="listbox" aria-expanded="false" title="Font Family">
			<span class="vfp-trigger-label"></span>
			<span class="vfp-caret">▾</span>
		</button>
		<div class="vfp-menu" role="listbox"></div>
	`;
	slotFamily.appendChild(familyRoot);

	const familyTrigger = familyRoot.querySelector('.vfp-trigger');
	const familyLabel = familyRoot.querySelector('.vfp-trigger-label');
	const familyMenu = familyRoot.querySelector('.vfp-menu');

	function setFamilyLabel(family) {
		familyLabel.textContent = family;
		familyLabel.style.fontFamily = `"${family}", sans-serif`;
	}

	function closeFamilyMenu() {
		familyRoot.classList.remove('open');
		familyTrigger.setAttribute('aria-expanded', 'false');
	}

	function openFamilyMenu() {
		closeWeightMenu();
		familyRoot.classList.add('open');
		familyTrigger.setAttribute('aria-expanded', 'true');
		renderFamilyMenu();
	}

	function renderFamilyMenu() {
		familyMenu.innerHTML = '';

		// Add Font item at top matching Studio
		const addBtn = document.createElement('div');
		addBtn.className = 'vfp-item vfp-add-btn';
		addBtn.innerHTML = `<span>+ Add Font…</span>`;
		addBtn.addEventListener('click', () => {
			closeFamilyMenu();
			openSearchFontDialog();
		});
		familyMenu.appendChild(addBtn);

		const sorted = Array.from(activeFontsSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
		for (const family of sorted) {
			const item = document.createElement('div');
			item.className = 'vfp-item';
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', family === currentFamily ? 'true' : 'false');
			item.dataset.family = family;
			item.innerHTML = `
				<span class="vfp-item-name" style="font-family:'${family.replace(/'/g, "\\'")}',sans-serif">${escapeHtml(family)}</span>
				<span class="vfp-badge">${badgeFor(family)}</span>
			`;
			item.addEventListener('click', () => {
				selectFamily(family);
				closeFamilyMenu();
			});
			familyMenu.appendChild(item);
		}
	}

	familyTrigger.addEventListener('click', (e) => {
		e.stopPropagation();
		if (familyRoot.classList.contains('open')) closeFamilyMenu();
		else openFamilyMenu();
	});

	/* ---------------------------------------------------------------------
	 * 2. Font Weight Picker UI
	 * --------------------------------------------------------------------- */
	let weightRoot = null;
	let weightTrigger = null;
	let weightLabel = null;
	let weightMenu = null;

	if (slotWeight) {
		weightRoot = document.createElement('div');
		weightRoot.id = 'visteras_font_weight_picker';
		weightRoot.innerHTML = `
			<button type="button" class="vfwp-trigger" aria-haspopup="listbox" aria-expanded="false" title="Font Weight">
				<span class="vfwp-trigger-label">Regular (400)</span>
				<span class="vfwp-caret">▾</span>
			</button>
			<div class="vfwp-menu" role="listbox"></div>
		`;
		slotWeight.appendChild(weightRoot);

		weightTrigger = weightRoot.querySelector('.vfwp-trigger');
		weightLabel = weightRoot.querySelector('.vfwp-trigger-label');
		weightMenu = weightRoot.querySelector('.vfwp-menu');

		weightTrigger.addEventListener('click', (e) => {
			e.stopPropagation();
			if (weightRoot.classList.contains('open')) closeWeightMenu();
			else openWeightMenu();
		});
	}

	function closeWeightMenu() {
		if (weightRoot) {
			weightRoot.classList.remove('open');
			weightTrigger?.setAttribute('aria-expanded', 'false');
		}
	}

	function openWeightMenu() {
		closeFamilyMenu();
		if (!weightRoot) return;
		weightRoot.classList.add('open');
		weightTrigger?.setAttribute('aria-expanded', 'true');
		renderWeightMenu();
	}

	function renderWeightMenu() {
		if (!weightMenu) return;
		const weights = getFontWeightList(currentFamily);
		weightMenu.innerHTML = '';
		for (const w of weights) {
			const item = document.createElement('div');
			item.className = 'vfwp-item';
			item.setAttribute('role', 'option');
			const isSel = w === currentWeight || styleNameToCssWeight(w) === styleNameToCssWeight(currentWeight);
			item.setAttribute('aria-selected', isSel ? 'true' : 'false');
			item.innerHTML = `<span class="vfwp-item-name">${escapeHtml(w)}</span>`;
			item.addEventListener('click', () => {
				selectWeight(w);
				closeWeightMenu();
			});
			weightMenu.appendChild(item);
		}
	}

	function setWeightLabel(w) {
		currentWeight = w;
		if (weightLabel) weightLabel.textContent = w;
	}

	document.addEventListener('click', (e) => {
		if (familyRoot && !familyRoot.contains(e.target)) closeFamilyMenu();
		if (weightRoot && !weightRoot.contains(e.target)) closeWeightMenu();
	});

	/* ---------------------------------------------------------------------
	 * 3. Selection & Canvas Updates
	 * --------------------------------------------------------------------- */
	async function selectFamily(family) {
		currentFamily = family;
		setFamilyLabel(family);

		const sc = svgEditor && (svgEditor.svgCanvas || svgEditor);
		if (sc) {
			if (typeof sc.setFontFamily === 'function') {
				sc.setFontFamily(family);
			} else if (typeof sc.setCurText === 'function') {
				sc.setCurText('font_family', family);
			}
		}

		const source = isSystemFontFamily(family) || cachedSystemFamilies.includes(family) ? 'system' : (customFontsMap.has(family) ? 'custom' : 'google');
		if (source === 'google') {
			loadFontFamily({ family, source: 'google' }).catch(() => {});
		}

		// Re-evaluate weights for the newly chosen family
		const availableWeights = getFontWeightList(family);
		let targetWeight = availableWeights.find(w => styleNameToCssWeight(w) === styleNameToCssWeight(currentWeight));
		if (!targetWeight) {
			targetWeight = availableWeights.find(w => styleNameToCssWeight(w) === '400') || availableWeights[0] || 'Regular (400)';
		}
		setWeightLabel(targetWeight);
		await selectWeight(targetWeight, false);
	}

	async function selectWeight(weightLabelVal, applyToSelected = true) {
		setWeightLabel(weightLabelVal);
		const cssWeight = styleNameToCssWeight(weightLabelVal);
		const isBold = parseInt(cssWeight, 10) >= 700;

		const sc = svgEditor && (svgEditor.svgCanvas || svgEditor);
		if (sc) {
			if (typeof sc.setCurText === 'function') {
				sc.setCurText('font_weight', cssWeight);
			}
			if (typeof sc.setFontWeight === 'function') {
				sc.setFontWeight(cssWeight);
			}
			if (applyToSelected) {
				const sel = sc.getSelectedElements ? sc.getSelectedElements().filter(Boolean) : [];
				for (const el of sel) {
					const targetText = el.tagName === 'text' ? el : (el.querySelector ? el.querySelector('text') : null);
					if (targetText) {
						targetText.setAttribute('font-weight', cssWeight);
						if (targetText.style) targetText.style.fontWeight = cssWeight;
						const children = targetText.querySelectorAll ? targetText.querySelectorAll('tspan, textPath') : [];
						for (const c of children) {
							c.removeAttribute('font-weight');
							if (c.style) c.style.fontWeight = '';
						}
					}
				}
				sc.call?.('changed', sel);
			}
		}

		// Load weight variant if web font
		loadFontFamily({ family: currentFamily, variants: [cssWeight] }).then(() => {
			if (document.fonts && typeof document.fonts.load === 'function') {
				document.fonts.load(`${cssWeight} 16px "${currentFamily}"`).then(() => {
					if (sc && typeof sc.call === 'function') {
						sc.call('changed', sc.getSelectedElements ? sc.getSelectedElements() : []);
					}
				}).catch(() => {});
			}
		}).catch(() => {});

		// Sync Bold button state
		const boldBtn = document.getElementById('tool_bold');
		if (boldBtn) boldBtn.pressed = isBold;
	}

	function openSearchFontDialog() {
		const dialog = new FontSearchDialog({
			onFontsChanged: (updatedSet, selectedFont) => {
				try {
					localStorage.setItem(STORAGE_KEY_ACTIVE_FONTS, JSON.stringify(Array.from(updatedSet)));
				} catch (_) {}
				renderFamilyMenu();
				if (selectedFont) {
					selectFamily(selectedFont);
				}
			}
		});
		dialog.show(activeFontsSet);
	}

	/* ---------------------------------------------------------------------
	 * 4. Bidirectional Typography Synchronization
	 * --------------------------------------------------------------------- */
	function syncTypography(elem) {
		try {
			const sc = svgEditor && (svgEditor.svgCanvas || svgEditor);
			let target = elem;
			if (!target && sc?.getSelectedElements) {
				const sel = sc.getSelectedElements().filter(Boolean);
				target = sel[0];
			}
			let textEl = null;
			if (target) {
				if (target.tagName === 'text') textEl = target;
				else if (target.tagName === 'textPath') textEl = target.parentElement;
				else if (target.querySelector) textEl = target.querySelector('text, textPath')?.closest('text');
			}

			if (textEl) {
				// 1. Family
				const ff = textEl.getAttribute('font-family');
				if (ff) {
					const clean = ff.split(',')[0].replace(/['"]/g, '').trim();
					if (clean && clean !== currentFamily) {
						currentFamily = clean;
						setFamilyLabel(clean);
					}
				}

				// 2. Weight
				const fw = textEl.getAttribute('font-weight') || '400';
				const weights = getFontWeightList(currentFamily);
				const matched = weights.find(w => styleNameToCssWeight(w) === styleNameToCssWeight(fw))
					|| formatWeightLabel(fw)
					|| 'Regular (400)';
				setWeightLabel(matched);
				const boldBtn = document.getElementById('tool_bold');
				if (boldBtn) boldBtn.pressed = (fw === 'bold' || parseInt(fw, 10) >= 700);

				// 3. Size
				const fs = textEl.getAttribute('font-size');
				const sizeInput = document.getElementById('font_size');
				if (sizeInput && fs) {
					sizeInput.value = Math.round(parseFloat(fs) || 24);
				}

				// 4. Letter Spacing (Kerning)
				const ls = textEl.getAttribute('letter-spacing');
				const lsInput = document.getElementById('tool_letter_spacing');
				if (lsInput) {
					lsInput.value = (ls != null && ls !== '') ? (parseFloat(ls) || 0) : 0;
				}

				// 5. Word Spacing
				const ws = textEl.getAttribute('word-spacing');
				const wsInput = document.getElementById('tool_word_spacing');
				if (wsInput) {
					wsInput.value = (ws != null && ws !== '') ? (parseFloat(ws) || 0) : 0;
				}

				// 6. Style (Italic)
				const fstyle = textEl.getAttribute('font-style');
				const italicBtn = document.getElementById('tool_italic');
				if (italicBtn) italicBtn.pressed = (fstyle === 'italic');

				// 7. Anchor
				const anchor = textEl.getAttribute('text-anchor') || 'start';
				const anchorEl = document.getElementById('tool_text_anchor');
				if (anchorEl) anchorEl.setAttribute('value', anchor);
				const normAnchor = anchor.toLowerCase();
				['start', 'middle', 'end'].forEach((a) => {
					const btn = document.getElementById(`text_align_${a}`);
					if (btn) {
						const isMatch = (a === normAnchor);
						btn.classList.toggle('active', isMatch);
						btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
					}
				});
			} else if (sc && typeof sc.getCurText === 'function') {
				// No text element selected: show defaults from curText
				const ff = sc.getCurText('font_family') || DEFAULT_FONT_FAMILY;
				if (ff !== currentFamily) {
					currentFamily = ff;
					setFamilyLabel(ff);
				}
				const fw = sc.getCurText('font_weight') || '400';
				const weights = getFontWeightList(currentFamily);
				const matched = weights.find(w => styleNameToCssWeight(w) === styleNameToCssWeight(fw)) || 'Regular (400)';
				setWeightLabel(matched);
				const boldBtn = document.getElementById('tool_bold');
				if (boldBtn) boldBtn.pressed = (fw === 'bold' || parseInt(fw, 10) >= 700);

				const fs = sc.getCurText('font_size') || 24;
				const sizeInput = document.getElementById('font_size');
				if (sizeInput) sizeInput.value = Math.round(parseFloat(fs));

				const ls = sc.getCurText('letter_spacing') ?? sc.getCurText('letter-spacing') ?? 0;
				const lsInput = document.getElementById('tool_letter_spacing');
				if (lsInput) lsInput.value = parseFloat(ls) || 0;

				const ws = sc.getCurText('word_spacing') ?? sc.getCurText('word-spacing') ?? 0;
				const wsInput = document.getElementById('tool_word_spacing');
				if (wsInput) wsInput.value = parseFloat(ws) || 0;

				const defAnchor = (sc.getCurText('text_anchor') || 'start').toLowerCase();
				['start', 'middle', 'end'].forEach((a) => {
					const btn = document.getElementById(`text_align_${a}`);
					if (btn) {
						const isMatch = (a === defAnchor);
						btn.classList.toggle('active', isMatch);
						btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
					}
				});
			}
		} catch (e) {
			console.warn('[visteras-font-bridge] syncTypography error', e);
		}
	}

	window.__visterasSyncTypography = syncTypography;

	// Initial render & preloads
	setFamilyLabel(currentFamily);
	setWeightLabel(currentWeight);
	loadFontFamily({ family: currentFamily, source: 'google' }).catch(() => {});

	if (svgEditor) {
		const sc = svgEditor.svgCanvas || svgEditor;
		if (sc && typeof sc.setCurText === 'function') {
			sc.setCurText('font_family', currentFamily);
			sc.setCurText('font_weight', '400');
		}
		if (sc && typeof sc.bind === 'function') {
			sc.bind('selectedChanged', () => syncTypography());
			sc.bind('elementChanged', () => syncTypography());
			sc.bind('selected', (e, t) => syncTypography(t && t[0]));
		}
	}

	return {
		selectFamily,
		selectWeight,
		syncTypography,
		openSearchFontDialog,
		getCurrentFamily: () => currentFamily,
		getCurrentWeight: () => currentWeight,
	};
}

export default mountVisterasFontPicker;
