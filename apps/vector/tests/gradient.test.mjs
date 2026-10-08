// Gradient milestone wiring (source-level; DOM behaviour is covered by the gravit smoke "grad" section).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(vectorRoot, '../..');
const read = (p) => fs.readFileSync(path.resolve(vectorRoot, p), 'utf8');
const html = read('index.html');
const gradientSources = ['js/visteras-gradient.js', 'js/visteras-gradient-panel.js', 'js/visteras-gradient-tool.js', 'js/visteras-gradient-model.js'].map((p) => [p, read(p)]);

test('index.html mounts gradients after the dock / colour system and links the stylesheet', () => {
  assert.match(html, /import \{ mountGradient \} from '\.\/js\/visteras-gradient\.js\?v=gradient-2';/);
  assert.match(html, /<link href="\.\/css\/visteras-gradient\.css\?v=gradient-2" rel="stylesheet"/);
  const dock = html.indexOf('mountVisterasPanelDock({ svgEditor });');
  const color = html.indexOf('mountVisterasColorSystem({ svgEditor });');
  const eye = html.indexOf('mountEyedropperTool(svgEditor);');
  const grad = html.indexOf('mountGradient(svgEditor);');
  assert.ok(dock > 0 && color > 0 && eye > 0 && grad > Math.max(dock, color, eye), 'mountGradient runs after dock, colour system and eyedropper');
});

test('View menu has the Gradient Annotator toggle (⌥⌘G) and ⌘G grouping ignores Alt', () => {
  assert.match(html, /id="action_toggle_gradient_annotator">Hide Gradient Annotator <span class="menu_dropdown_shortcut">⌥⌘G<\/span>/);
  assert.match(html, /if \(e\.shiftKey && !e\.altKey && \(e\.key === 'g' \|\| e\.key === 'G'\)\)/);
  assert.match(html, /if \(!e\.shiftKey && !e\.altKey && \(e\.key === 'g' \|\| e\.key === 'G'\)\)/);
  const tool = read('js/visteras-gradient-tool.js');
  assert.match(tool, /e\.altKey && !e\.shiftKey && e\.code === 'KeyG'/);
});

test('G selects the Gradient tool; button sits after the Eyedropper with the shared icon', () => {
  assert.match(read('js/visteras-selection.js'), /i: 'tool_eyedropper', g: 'tool_gradient'/);
  const tool = read('js/visteras-gradient-tool.js');
  assert.match(tool, /btn\.id = 'tool_gradient'/);
  assert.match(tool, /'Gradient Tool \(G\)'/);
  assert.match(tool, /getElementById\('tool_eyedropper'\)/);
  assert.match(tool, /images\/tools\/gradient\.svg/);
  for (const p of ['../../packages/icons/tools/gradient.svg', 'images/tools/gradient.svg', '../studio/images/tools/gradient.svg']) {
    const svg = read(p);
    assert.match(svg, /currentColor/, `${p} uses currentColor`);
  }
  assert.equal(read('images/tools/gradient.svg'), read('../../packages/icons/tools/gradient.svg'), 'copy is in sync (npm run build:icons)');
});

test('Window ▸ Gradient pane is empty in the dock (stub removed) and filled by the gradient panel', () => {
  const dock = read('js/visteras-panel-dock.js');
  assert.match(dock, /gradPane\.id = 'vdock_gradient_panel'/);
  assert.doesNotMatch(dock, /coming in a future update/);
  assert.doesNotMatch(read('css/visteras-panel-dock.css'), /vdock-gradient-stub-text|vdock-gradient-ramp-preview/);
  const panel = read('js/visteras-gradient-panel.js');
  assert.match(panel, /getElementById\('vdock_gradient_panel'\)/);
  // Illustrator order: type, stroke, fill/stroke + reverse + angle + aspect, slider, opacity + location
  const order = ['vgrad_type_linear', 'vgrad_type_radial', 'vgrad_stroke_row', 'vgrad_fs_fill', 'vgrad_reverse', 'vgrad_angle', 'vgrad_aspect', 'vgrad_slider', 'vgrad_opacity', 'vgrad_location', 'vgrad_delete'];
  const idx = order.map((id) => panel.indexOf(`id="${id}"`));
  assert.ok(idx.every((v) => v > 0), `all controls present ${idx}`);
  assert.deepEqual([...idx].sort((a, b) => a - b), idx, 'controls are in Illustrator order');
});

test('gradient modules never use SVG-Edit setGradient/setPaint (userSpaceOnUse conversion, shared defs)', () => {
  for (const [p, src] of gradientSources) {
    assert.doesNotMatch(src, /\.setGradient\(|\.setPaint\(/, p);
  }
  const core = read('js/visteras-gradient.js');
  assert.match(core, /getNextId\(\)/, 'fresh gradient ids per edit');
  assert.match(core, /BatchCommand/, 'one BatchCommand per gesture');
});

test('colour system exposes the per-object paint API used by gradients', () => {
  const src = read('js/visteras-color-system.js');
  assert.match(src, /function applyPaintToElements\(/);
  assert.match(src, /applyPaintToElements:/);
  assert.match(src, /paintTargets: \(attr\)/);
  assert.match(src, /__visterasGradientCss/);
  assert.match(src, /classList\.toggle\('is-gradient'/);
  assert.match(read('js/visteras-paint-resolver.js'), /ref/);
});

test('Editor.js keeps per-object gradients out of flip remap + reorient (wrapper handles flips)', () => {
  const ed = read('Editor.js');
  assert.ok((ed.match(/data-visteras-gradient/g) || []).length >= 2, 'two Visteras patches');
  assert.match(ed, /\/\/ Visteras:[^\n]*gradient/i);
  const tool = read('js/visteras-gradient-tool.js');
  assert.match(tool, /sc\.flipSelectedElements = function/);
  assert.match(tool, /new BatchCommand\('Flip'\)/);
  assert.match(tool, /flipModel\(/);
});

test('every gradient localStorage key is allowlisted and is app-level only', () => {
  const allow = fs.readFileSync(path.resolve(repoRoot, 'scripts/check-no-doc-localstorage.mjs'), 'utf8');
  for (const k of ['GRADIENT_SWATCHES_KEY', 'GRADIENT_LAST_KEY', 'GRADIENT_ANNOTATOR_KEY']) {
    assert.match(allow, new RegExp(`apps/vector/js/visteras-gradient\\.js[\\s\\S]{0,200}${k}`), k);
  }
  const model = read('js/visteras-gradient-model.js');
  assert.match(model, /GRADIENT_SWATCHES_KEY = 'visteras-vector-gradient-swatches'/);
  for (const [p, src] of gradientSources) {
    if (p === 'js/visteras-gradient.js') continue;
    assert.doesNotMatch(src, /localStorage\.setItem/, `${p}: storage writes live in the allowlisted core only`);
  }
});

test('gradient stylesheet keeps the orange accent', () => {
  const css = read('css/visteras-gradient.css');
  assert.match(css, /#fa7c1b/);
  assert.match(css, /\.vgrad-stop\.selected/);
  assert.match(css, /\.is-gradient/);
});

test('stop selection: click selects (no popover), double-click opens the picker, Esc / canvas / other object deselect', () => {
  const panel = read('js/visteras-gradient-panel.js');
  const tool = read('js/visteras-gradient-tool.js');
  // panel slider: pointerdown selects; the popover is behind the 400 ms double-click check only
  assert.match(panel, /selectStop\(index\); \/\/ single click selects/);
  assert.match(panel, /lastClick\?\.index === index && now - lastClick\.time < 400\) \{\s*lastClick = null;\s*openColorPopover\(/);
  assert.match(panel, /class="vgrad-stop\$\{i === selStop && selMid < 0 && stopActive \? ' selected' : ''\}"/, 'orange .selected only while a stop is selected');
  // deselect paths
  assert.match(panel, /event === 'selected' && stopActive && selIds\(\) !== stopOwner\) clearStopSelection\(\)/);
  assert.match(panel, /e\.key !== 'Escape' \|\| !stopActive/);
  assert.match(panel, /stopActive && \(!m \|\| attr !== stopAttr\)\) clearStopSelection/);
  // annotator: click selects with the orange accent; double-click opens the colour popover; empty canvas deselects
  assert.match(tool, /panel\.selectStop\(stopIndex\); \} \/\/ click = select/);
  assert.match(tool, /dragging\.openColor = \(\) => openStopColor\(frame, stopIndex, rect\)/);
  assert.match(tool, /const ACCENT = '#fa7c1b'/);
  assert.match(tool, /data-vgrad-selected/);
  assert.match(tool, /if \(emptyClick\) panel\.clearStopSelection/);
});

test('stop selection routes Color panel, Swatches (incl. ⌥-click), well picker and Eyedropper to the stop', () => {
  const panel = read('js/visteras-gradient-panel.js');
  const cs = read('js/visteras-color-system.js');
  const eye = read('js/visteras-eyedropper.js');
  assert.match(panel, /window\.__visterasGradientStopRoute = \{/);
  assert.match(panel, /recolorStop\(m\.stops, i, c\)/);
  assert.match(panel, /label: 'Gradient Stop Color', gradientOnly: true/, 'one undo step, only objects that have a gradient');
  assert.match(cs, /if \(apply && toStop && api\.routeToGradientStop\(hexOrNone, \{ noUndo, recordRecent \}\)\) return;/);
  assert.match(cs, /route\.recolor\(n, \{ live: noUndo \}\)/, 'live preview while dragging, one step on commit');
  assert.match(cs, /applySwatch\(hex, \{ alt = false \} = \{\}\) \{\s*if \(alt && api\.routeToGradientStop\(hex\)\) return;/);
  assert.ok((cs.match(/ctrl\.applySwatch\([^)]*\{ alt: e\.altKey \}\)/g) || []).length >= 3, 'user, palette and recent swatches pass ⌥');
  assert.match(cs, /__visterasGradientStopRoute\?\.isActive\?\.\(\) && window\.__visterasGradientStopRoute\.openPicker\(\)/);
  assert.match(eye, /ctrl\?\.routeToGradientStop\?\.\(hex\)/);
  assert.match(eye, /!e\.altKey && window\.__visterasGradientStopRoute\?\.isActive\?\.\(\)/);
  // , (Color mode) still sets a flat colour
  assert.match(panel, /setWorkingColor\(st\.workingHex \|\| '#000000', \{ toStop: false \}\)/);
});
