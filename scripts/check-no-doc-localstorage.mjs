#!/usr/bin/env node
/**
 * Guard: documents are saved as files (.vsd/.vvd/.vid/.vcd/.vpd), never into browser storage.
 *
 * Fails if any app source calls `<x>.setItem(...)` (localStorage/sessionStorage or an alias)
 * or assigns `localStorage[...] = ...`, unless the call is in ALLOWLIST (small UI/preference
 * keys) or in KNOWN_DOCUMENT_STORES (real document/content stores that are scheduled for
 * removal; printed as warnings on every run so they never become invisible).
 *
 * Scope: git-tracked app sources under apps/, packages/, src/, functions/.
 * Excluded: node_modules, dist, archived, vendor, apps/<app>/lib (vendored), any /libs/,
 * *.min.js, apps/vector/iife-Editor.js (legacy generated bundle, not loaded), tests.
 *
 *   node scripts/check-no-doc-localstorage.mjs          check (exit 1 on violations)
 *   node scripts/check-no-doc-localstorage.mjs --list   print every storage write found
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Preference / UI-state keys. `key` is the first argument exactly as written in source. */
export const ALLOWLIST = [
  // Collage
  { file: 'apps/collage/js/app.js', key: "'visteras_pixabay_endpoint'", reason: 'Pixabay proxy endpoint setting' },
  { file: 'apps/collage/js/app.js', key: "'visteras_pixabay_key'", reason: 'user-supplied Pixabay API key setting' },
  // Publish
  { file: 'apps/publish/src/lib/settings.ts', key: 'COMIC_OPT_IN_KEY', reason: 'comic opt-in preferences' },
  { file: 'apps/publish/src/lib/settings.ts', key: 'SETTINGS_STORAGE_KEY', reason: 'edition settings (feeds, layout prefs)' },
  { file: 'apps/publish/src/pages/index.astro', key: 'LEAD_CUSTOM_URL_KEY', reason: 'lead-story image URL preference' },
  { file: 'apps/publish/src/pages/index.astro', key: 'LEAD_POS_Y_KEY', reason: 'lead-story image crop position' },
  // Studio
  { file: 'apps/studio/src/js/actions/store/image-store.js', key: "'history_tab_uuid'", reason: 'per-tab id for IndexedDB history housekeeping (sessionStorage)' },
  { file: 'apps/studio/src/js/actions/store/image-store.js', key: "'history_usage_ping'", reason: 'timestamp so other tabs know history DB is in use' },
  { file: 'apps/studio/src/js/core/base-gui.js', key: "'vantage_active_layers_tab'", reason: 'active panel tab' },
  { file: 'apps/studio/src/js/core/base-gui.js', key: "'vantage_active_color_tab'", reason: 'active panel tab' },
  { file: 'apps/studio/src/js/core/base-gui.js', key: "'vantage_active_adj_tab'", reason: 'active panel tab' },
  { file: 'apps/studio/src/js/core/font-manager.js', key: "'photochop_local_fonts'", reason: 'cached list of local font family names' },
  { file: 'apps/studio/src/js/core/font-manager.js', key: "'photochop_selected_local_fonts'", reason: 'chosen local font names' },
  { file: 'apps/studio/src/js/core/gui/gui-shortcuts.js', key: "'photochop_logo'", reason: 'logo variant preference' },
  { file: 'apps/studio/src/js/core/gui/gui-swatches.js', key: '"vantage_recent_colors"', reason: 'recent colours' },
  { file: 'apps/studio/src/js/core/gui/gui-swatches.js', key: '"vantage_swatch_collapsed"', reason: 'collapsed swatch groups' },
  { file: 'apps/studio/src/js/modules/file/new.js', key: 'RECENT_STORAGE_KEY', reason: 'recent New Document size presets' },
  // Vector
  { file: 'apps/vector/Editor.js', key: 'this.storageKey(', reason: 'tool flyout last-used tool' },
  { file: 'apps/vector/Editor.js', key: 'Y.getClipboardID(', reason: 'SVG-Edit cross-tab clipboard (sessionStorage, transient)' },
  { file: 'apps/vector/Editor.js', key: 'qI', reason: "SVG-Edit cross-tab clipboard 'svgedit_clipboard' (localStorage copy removed after 1 ms)" },
  { file: 'apps/vector/Editor.js', key: '`${qI}_startup`', reason: 'SVG-Edit clipboard startup handshake' },
  { file: 'apps/vector/index.html', key: "'visteras_vector_active_doc_title'", reason: 'active document title (name only, no content)' },
  { file: 'apps/vector/js/visteras-color-system.js', key: 'STORAGE_SWATCHES', reason: 'user swatches' },
  { file: 'apps/vector/js/visteras-color-system.js', key: 'STORAGE_RECENT', reason: 'recent colours' },
  { file: 'apps/vector/js/visteras-color-system.js', key: 'VCS_TAB_STORAGE', reason: 'active colour panel tab' },
  { file: 'apps/vector/js/visteras-color-system.js', key: 'collapsedKey', reason: 'collapsed swatch groups' },
  { file: 'apps/vector/js/visteras-document-shell.js', key: 'UNIT_KEY', reason: 'ruler units' },
  { file: 'apps/vector/js/visteras-document-shell.js', key: 'RULERS_KEY', reason: 'rulers on/off' },
  { file: 'apps/vector/js/visteras-document-shell.js', key: 'ACTIVE_TITLE_KEY', reason: 'active document title (name only, no content)' },
  { file: 'apps/vector/js/visteras-document-shell.js', key: 'RECENT_KEY', reason: 'recent New Document size presets' },
  { file: 'apps/vector/js/visteras-document-shell.js', key: 'LAST_PRESET_KEY', reason: 'last New Document preset' },
  { file: 'apps/vector/js/visteras-eraser.js', key: "'visteras_eraser_radius'", reason: 'eraser size' },
  { file: 'apps/vector/js/visteras-eyedropper.js', key: "'visteras_eyedropper_options'", reason: 'eyedropper options' },
  { file: 'apps/vector/js/visteras-font-bridge.js', key: 'STORAGE_KEY_LOCAL_FONTS', reason: 'cached list of local font family names' },
  { file: 'apps/vector/js/visteras-font-bridge.js', key: 'STORAGE_KEY_ACTIVE_FONTS', reason: 'activated font names' },
  { file: 'apps/vector/js/visteras-panel-dock.js', key: 'STORAGE_KEY', reason: 'panel dock layout' },
  { file: 'apps/vector/js/visteras-pen-auto.js', key: 'PEN_PREF_KEY', reason: 'Pen auto add/delete preference' },
  { file: 'apps/vector/js/visteras-pen-tools.js', key: "'visteras_vector_snap_points'", reason: 'snap-to-point toggle' },
  { file: 'apps/vector/js/visteras-shape-picker.js', key: 'STORE_KEY', reason: 'last shape-library category/shape' },
  { file: 'apps/vector/js/visteras-transform-panel.js', key: "'visteras-lock-proportions'", reason: 'lock proportions toggle' }
];

/**
 * Real document/content stores found in browser storage. NOT allowed long-term: each one is
 * reported as a warning on every run and should be removed (then deleted from this list).
 */
export const KNOWN_DOCUMENT_STORES = [
  { file: 'apps/vector/extensions/ext-storage/ext-storage.js', key: 'name', note: "SVG-Edit ext-storage saves the whole SVG ('svgedit-<canvas>') on unload when opted in (Phase 2 item B removes it)" },
  { file: 'apps/vector/extensions/ext-storage/ext-storage.js', key: '`title-${name}`', note: 'title saved alongside the SVG above (item B)' },
  { file: 'apps/vector/extensions/ext-storage/ext-storage.js', key: 'key', note: "SVG-Edit prefs ('svg-edit-*'); goes with ext-storage (item B)" },
  { file: 'apps/studio/src/js/modules/file/quicksave.js', key: "'quicksave_data'", note: 'Studio Quick Save writes the full document JSON (up to 5 MB) to localStorage' },
  { file: 'apps/collage/js/app.js', key: "'visteras_collage_saves'", note: 'Collage saved-collages library is stored in localStorage' },
  { file: 'apps/publish/src/lib/settings.ts', key: 'GROK_BRIEF_STORAGE_KEY', note: "Publish keeps the pasted Grok brief text (edition source content) in localStorage" }
];

const EXTS = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'astro', 'html', 'vue', 'svelte'];
const DIRS = ['apps', 'packages', 'src', 'functions'];

export function isExcluded(file) {
  return /(^|\/)(node_modules|dist|archived|vendor)\//.test(file)
    || /^apps\/[^/]+\/lib\//.test(file)
    || /\/libs\//.test(file)
    || /\.min\.js$/.test(file)
    || /(^|\/)iife-Editor\.js$/.test(file)
    || /(^|\/)tests?\//.test(file)
    || /\.test\.[cm]?[jt]s$/.test(file);
}

const SET_ITEM = /\.\s*setItem\s*\(\s*([^,)]*)/g;
const ASSIGN = /\b(?:localStorage|sessionStorage)\s*(?:\[[^\]]+\]|\.(?!setItem\b|getItem\b|removeItem\b|clear\b|key\b|length\b)[A-Za-z_$][\w$]*)\s*=(?!=)/g;

export function scanSource(file, text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    let m;
    SET_ITEM.lastIndex = 0;
    while ((m = SET_ITEM.exec(line))) hits.push({ file, line: i + 1, key: m[1].trim(), kind: 'setItem' });
    ASSIGN.lastIndex = 0;
    while ((m = ASSIGN.exec(line))) hits.push({ file, line: i + 1, key: m[0].trim(), kind: 'assign' });
  });
  return hits;
}

export function classify(hit) {
  const match = (e) => e.file === hit.file && e.key === hit.key;
  if (hit.kind === 'setItem' && ALLOWLIST.some(match)) return 'allowed';
  if (hit.kind === 'setItem' && KNOWN_DOCUMENT_STORES.some(match)) return 'known-document-store';
  return 'violation';
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', '--', ...DIRS.flatMap((d) => EXTS.map((e) => `${d}/**/*.${e}`))], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20
  });
  return out.split('\n').filter(Boolean).filter((f) => !isExcluded(f));
}

function main() {
  const listMode = process.argv.includes('--list');
  const files = listFiles();
  const hits = files.flatMap((f) => scanSource(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const byClass = { allowed: [], 'known-document-store': [], violation: [] };
  for (const h of hits) byClass[classify(h)].push(h);

  if (listMode) for (const h of hits) console.log(`${classify(h).padEnd(21)} ${h.file}:${h.line}  ${h.key}`);

  for (const h of byClass['known-document-store']) {
    const note = KNOWN_DOCUMENT_STORES.find((e) => e.file === h.file && e.key === h.key).note;
    console.warn(`WARN document stored in browser storage: ${h.file}:${h.line} (${h.key}) — ${note}`);
  }
  const usedAllow = new Set(byClass.allowed.map((h) => `${h.file}|${h.key}`));
  for (const e of ALLOWLIST) if (!usedAllow.has(`${e.file}|${e.key}`)) console.warn(`NOTE stale allowlist entry (no longer used): ${e.file} ${e.key}`);

  console.log(`storage check: ${files.length} files, ${hits.length} storage writes — ${byClass.allowed.length} allowed preference writes, ${byClass['known-document-store'].length} known document stores (warned), ${byClass.violation.length} violations`);
  if (byClass.violation.length) {
    console.error('\nUnapproved browser-storage writes (documents must be saved as files; add true preference keys to ALLOWLIST in scripts/check-no-doc-localstorage.mjs):');
    for (const h of byClass.violation) console.error(`  ${h.file}:${h.line}  ${h.kind === 'assign' ? h.key : `setItem(${h.key}, ...)`}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
