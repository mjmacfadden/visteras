import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { captureDocumentSnapshot, serializeDocumentSnapshot } from '../js/visteras-document-save.js';
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
  assert.match(src, /buildArtboardPdf|renderPdfDocument/, 'PDF uses vector buildArtboardPdf, not the raster sc.exportPDF path');
});

test('Export: pipeline — clone, scope viewBox, background inside the SVG, fonts/images inlined, picker before render', () => {
  assert.match(src, /const clone = (?:window\.__visterasSymbolEdit\?\.cloneCommitted\?\.\(\) \|\| )?sc\.getSvgContent\(\)\.cloneNode\(true\);/);
  assert.match(src, /clone\.setAttribute\('viewBox', `\$\{rect\.x\} \$\{rect\.y\} \$\{rect\.width\} \$\{rect\.height\}`\);/);
  assert.match(src, /clone\.insertBefore\(bg, first \|\| null\);/, 'background is the first painted child, not a canvas fill');
  assert.match(src, /window\.__visterasEffects\?\.getVisualBounds\?\.\(el\)/, 'selection / full use effect-aware bounds');
  assert.match(src, /data: async \(\) => \{ const out = await renderJob\(job\);/, 'saveFile renders inside data() (after the picker)');
  assert.match(src, /window\.showDirectoryPicker\(\{ id: 'visteras-export', mode: 'readwrite' \}\)/);
  assert.match(src, /X\.zipStore\(files\)/);
  assert.match(src, /e\?\.name !== 'SecurityError'/, 'taint fallback retries without images');
  assert.match(src, /foreignObject/);
});

test('Export: SVG artboard and full-document paths use the image-embedding clone pipeline', () => {
  assert.match(src, /if \(info\.ext === 'svg'\) \{[\s\S]*?buildExportSvg\(\{[\s\S]*?images: true,[\s\S]*?forSvgFile: true/);
  assert.doesNotMatch(src, /if \(job\.scope === 'artboard'\) return \{ blob: new Blob\(\[artboardSvgString/);
});

test('Export: Document Raster Effects Settings stored per document in .vvd', () => {
  const saved = captureDocumentSnapshot({ id: 'doc', rasterEffects: { ppi: 300, background: 'transparent' } }, { svg: '<svg/>', width: 100, height: 100, unit: 'px' });
  assert.deepEqual(JSON.parse(serializeDocumentSnapshot(saved, 'Poster', null)).rasterEffects, { ppi: 300, background: 'transparent' });
  assert.match(index, /if \(bundle\.rasterEffects && typeof bundle\.rasterEffects === 'object'\) docRaster = bundle\.rasterEffects;/);
  assert.match(index, /rasterEffects: docRaster,/);
  const shell = read('../js/visteras-document-shell.js');
  assert.match(shell, /targetDoc\.rasterEffects = rasterEffects && typeof rasterEffects === 'object' \? \{ \.\.\.rasterEffects \} : null;/);
  assert.match(src, /const ppi = docRaster \? raster\.ppi : s\.asPpi;/, 'Export As defaults to the document raster settings');
  const fonts = read('../js/visteras-font-bridge.js');
  assert.match(fonts, /window\.__visterasFontBytes = getCustomFontBytes;/, 'uploaded fonts can be inlined');
});
