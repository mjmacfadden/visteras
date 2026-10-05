import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorRoot = path.resolve(__dirname, '..');

test('Outline Mode: visteras-theme.css sets hairline non-scaling stroke matching Illustrator', () => {
  const css = fs.readFileSync(path.resolve(vectorRoot, 'css/visteras-theme.css'), 'utf8');

  // Must enforce non-scaling-stroke so zoom does not blow up stroke weight
  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+\*[\s\S]*?vector-effect:\s*non-scaling-stroke\s*!important/i,
    'Theme CSS must set vector-effect: non-scaling-stroke for wireframe mode'
  );

  // Must set 0.75px hairline stroke weight
  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+\*[\s\S]*?stroke-width:\s*0\.75px\s*!important/i,
    'Theme CSS must set 0.75px hairline stroke-width for wireframe mode'
  );

  // Live text objects remain solid black filled in outline view matching Illustrator
  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+text[\s\S]*?fill:\s*#000000\s*!important/i,
    'Theme CSS must keep live text filled black in wireframe mode'
  );
  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+text[\s\S]*?stroke:\s*none\s*!important/i,
    'Theme CSS must keep live text stroke: none in wireframe mode'
  );

  // Converted text outlines (Create Outlines) render as hairline outlines
  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+\.visteras-text-outlines\s+path[\s\S]*?stroke-width:\s*0\.75px\s*!important/i,
    'Theme CSS must outline converted text glyph paths in wireframe mode'
  );
});

test('Outline Mode: svgedit.css enforces non-scaling hairline stroke and black filled text', () => {
  const css = fs.readFileSync(path.resolve(vectorRoot, 'svgedit.css'), 'utf8');

  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+\*[\s\S]*?vector-effect:\s*non-scaling-stroke\s*!important/i,
    'svgedit.css must enforce vector-effect: non-scaling-stroke'
  );

  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+\*[\s\S]*?stroke-width:\s*0\.75px\s*!important/i,
    'svgedit.css must set 0.75px stroke-width'
  );

  assert.match(
    css,
    /#workarea\.wireframe\s+#svgcontent\s+text[\s\S]*?fill:\s*#000000\s*!important/i,
    'svgedit.css must keep live text filled black'
  );
});

test('Outline Mode: Editor.js updateWireFrame generates non-scaling hairline stroke and text fill rules', () => {
  const js = fs.readFileSync(path.resolve(vectorRoot, 'Editor.js'), 'utf8');

  assert.match(
    js,
    /updateWireFrame\(\)\s*\{[\s\S]*?stroke-width:\s*0\.75px\s*!important;[\s\S]*?vector-effect:\s*non-scaling-stroke\s*!important;/i,
    'Editor.js updateWireFrame must set non-scaling-stroke and 0.75px hairline'
  );

  assert.match(
    js,
    /#workarea\.wireframe\s+#svgcontent\s+text[\s\S]*?fill:\s*#000000\s*!important;/i,
    'Editor.js updateWireFrame must preserve solid black fill for live text'
  );
});

test('Outline Mode: index.html wires Outline Mode menu item and shortcuts (F / ⌘Y)', () => {
  const html = fs.readFileSync(path.resolve(vectorRoot, 'index.html'), 'utf8');

  assert.match(
    html,
    /id="action_toggle_wireframe"[^>]*>Outline Mode\s+<span class="menu_dropdown_shortcut">F \/ ⌘Y<\/span>/,
    'View menu contains Outline Mode item with F / ⌘Y shortcut'
  );

  assert.match(html, /Command\/Ctrl \+ Y: Toggle Wireframe \/ Outline Mode/);
  assert.match(html, /!e\.shiftKey\s*&&\s*\(e\.key\s*===\s*'y'/);
});

test('Outline Mode: artboard outline is black (#000000) non-scaling stroke in outline view', () => {
  const themeCss = fs.readFileSync(path.resolve(vectorRoot, 'css/visteras-theme.css'), 'utf8');
  assert.match(
    themeCss,
    /#workarea\.wireframe\s+#canvasBackground\s+rect[\s\S]*?stroke:\s*#000000\s*!important/i,
    'Theme CSS must set black stroke for canvasBackground rect in outline mode'
  );
  assert.match(
    themeCss,
    /#workarea\.wireframe\s+#canvasBackground\s+rect[\s\S]*?vector-effect:\s*non-scaling-stroke\s*!important/i,
    'Theme CSS must set non-scaling-stroke for canvasBackground rect'
  );

  const svgeditCss = fs.readFileSync(path.resolve(vectorRoot, 'svgedit.css'), 'utf8');
  assert.match(
    svgeditCss,
    /#workarea\.wireframe\s+#canvasBackground>rect[\s\S]*?stroke:\s*#000\s*!important/i,
    'svgedit.css must set black stroke for canvasBackground>rect in outline mode'
  );
});

test('Outline Mode: clean non-overlapping bundled Roboto fonts are declared in CSS', () => {
  const themeCss = fs.readFileSync(path.resolve(vectorRoot, 'css/visteras-theme.css'), 'utf8');

  // Verify @font-face rules point to bundled static woff fonts (which have single merged contours per glyph)
  assert.match(themeCss, /@font-face\s*\{[\s\S]*?font-family:\s*'Roboto'[\s\S]*?roboto-400\.woff/);
  assert.match(themeCss, /@font-face\s*\{[\s\S]*?font-family:\s*'Roboto'[\s\S]*?roboto-700\.woff/);

  // Verify visteras-fonts.js bypasses Google variable font for Roboto
  const fontsJs = fs.readFileSync(path.resolve(vectorRoot, 'lib/visteras-fonts.js'), 'utf8');
  assert.match(fontsJs, /name\.toLowerCase\(\)\s*===\s*"roboto"/);
});

test('Outline Mode: live text remains filled black while converted outline paths render as stroke outlines', () => {
  const themeCss = fs.readFileSync(path.resolve(vectorRoot, 'css/visteras-theme.css'), 'utf8');

  // 1. Live text objects: fill: #000000 !important, stroke: none !important
  assert.match(
    themeCss,
    /#workarea\.wireframe\s+#svgcontent\s+text[\s\S]*?fill:\s*#000000\s*!important/i
  );
  assert.match(
    themeCss,
    /#workarea\.wireframe\s+#svgcontent\s+text[\s\S]*?stroke:\s*none\s*!important/i
  );

  // 2. Converted outline paths (.visteras-text-outlines path, path.visteras-glyph): fill: none !important, stroke: #000000 !important
  assert.match(
    themeCss,
    /#workarea\.wireframe\s+#svgcontent\s+\.visteras-text-outlines\s+path[\s\S]*?fill:\s*none\s*!important/i
  );
  assert.match(
    themeCss,
    /#workarea\.wireframe\s+#svgcontent\s+\.visteras-text-outlines\s+path[\s\S]*?stroke:\s*#000000\s*!important/i
  );
  assert.match(
    themeCss,
    /#workarea\.wireframe\s+#svgcontent\s+\.visteras-text-outlines\s+path[\s\S]*?stroke-width:\s*0\.75px\s*!important/i
  );
});


