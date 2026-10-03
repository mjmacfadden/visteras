import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALLOWLIST } from '../../../scripts/check-no-doc-localstorage.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../index.html');
const src = read('../js/visteras-export.js');
const editor = read('../Editor.js');

test('Export: File ▸ Export submenu (Export for Screens… ⌥⌘E, Export As…) with hidden legacy aliases', () => {
  assert.match(index, /id="action_export_menu">Export<span class="menu_submenu_arrow"[^>]*>▶<\/span><div class="menu_dropdown_list menu_submenu_list" role="menu">/);
  assert.ok(index.indexOf('id="action_export_screens"') < index.indexOf('id="action_export_as"'), 'Illustrator order');
  assert.match(index, /<span class="menu_label">Export for Screens…<\/span><span class="menu_dropdown_shortcut">⌥⌘E<\/span>/);
  for (const id of ['action_export_svg', 'action_export_png', 'action_export_pdf']) assert.match(index, new RegExp(`id="${id}" hidden`));
  assert.doesNotMatch(index, /sc\.rasterExport\('PNG'\)|a\.download = `\$\{title\}\.svg`/, 'old <a download> / popup paths removed');
  assert.match(index, /mountExport\(\{ editor: svgEditor, saveFile, downloadBlob,/);
});

test('Export: ⌥⌘E via e.code KeyE; settings key on the storage allowlist', () => {
  assert.match(src, /!e\.altKey \|\| e\.shiftKey \|\| e\.code !== 'KeyE'/);
  assert.match(src, /localStorage\.setItem\(X\.SETTINGS_KEY,/);
  assert.ok(ALLOWLIST.some((a) => a.file === 'apps/vector/js/visteras-export.js' && a.key === 'X.SETTINGS_KEY'));
});

test('Export: no popup window — exportHandler / exportedPDF delegate to the export module', () => {
  assert.match(editor, /exportHandler\(e, t\) \{\n\t\t\/\/ Visteras: no popup window[^\n]*\n[^\n]*\n\t\tif \(window\.__visterasExport\) \{ window\.__visterasExport\.legacyExported\?\.\(t\); return; \}/);
  assert.match(editor, /if \(window\.__visterasExport && t\.outputType === "blob"\) return;/);
  assert.match(src, /sc\.exportPDF\(`\$\{X\.safeBase\(title\(\)\)\}\.pdf`, 'blob'\)/);
});

test('Export: pipeline — clone, scope viewBox, background inside the SVG, fonts/images inlined, picker before render', () => {
  assert.match(src, /const clone = sc\.getSvgContent\(\)\.cloneNode\(true\);/);
  assert.match(src, /clone\.setAttribute\('viewBox', `\$\{rect\.x\} \$\{rect\.y\} \$\{rect\.width\} \$\{rect\.height\}`\);/);
  assert.match(src, /clone\.insertBefore\(bg, first \|\| null\);/, 'background is the first painted child, not a canvas fill');
  assert.match(src, /window\.__visterasEffects\?\.getVisualBounds\?\.\(el\)/, 'selection / full use effect-aware bounds');
  assert.match(src, /data: async \(\) => \{ const out = await renderJob\(job\);/, 'saveFile renders inside data() (after the picker)');
  assert.match(src, /window\.showDirectoryPicker\(\{ id: 'visteras-export', mode: 'readwrite' \}\)/);
  assert.match(src, /X\.zipStore\(files\)/);
  assert.match(src, /e\?\.name !== 'SecurityError'/, 'taint fallback retries without images');
  assert.match(src, /foreignObject/);
});
