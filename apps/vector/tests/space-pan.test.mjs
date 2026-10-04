import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorPath = path.resolve(__dirname, '../Editor.js');
const themeCssPath = path.resolve(__dirname, '../css/visteras-theme.css');

test('Space Pan: Editor.js activates hand tool and grab cursor immediately on Space keydown', () => {
  const code = fs.readFileSync(editorPath, 'utf8');

  // Verify keydown checks for space and isEditingText
  assert.match(code, /e\.code\.toLowerCase\(\)\s*===\s*["']space["']\s*&&\s*!e\.ctrlKey\s*&&\s*!e\.metaKey\s*&&\s*!e\.altKey/);
  assert.match(code, /if\s*\(isEditingText\(e\)\)\s*return;/);

  // Verify immediate activation of ext-panning mode and cursor style without requiring click
  assert.match(code, /this\.svgCanvas\.setMode\(["']ext-panning["']\);/);
  assert.match(code, /this\.setCursorStyle\(["']ext-panning["']\);/);

  // Verify isEditingText guards text objects, typing, and input elements
  assert.match(code, /window\.__visterasIsTypingDirectly/);
  assert.match(code, /data-vector-editing-text/);
  assert.match(code, /this\.svgCanvas\.getMode\(\)\s*===\s*["']textedit["']/);
  assert.match(code, /closest\(["']input,\s*textarea,\s*select,\s*\[contenteditable=['"]true['"]\]["']\)/);
});

test('Space Pan: dragging updates cursor to grabbing and release restores grab / previous tool', () => {
  const code = fs.readFileSync(editorPath, 'utf8');

  // Verify mousedown sets grabbing and pan-dragging
  assert.match(code, /document\.body\?\.classList\.add\(["']pan-dragging["']\);/);
  assert.match(code, /this\.workarea\.style\.cursor\s*=\s*["']grabbing["'];/);

  // Verify onPanUp removes pan-dragging and returns to grab while space is held
  assert.match(code, /document\.body\?\.classList\.remove\(["']pan-dragging["']\);/);
  assert.match(code, /this\.workarea\.style\.cursor\s*=\s*["']grab["'];/);

  // Verify keyup restores previous tool mode
  assert.match(code, /const\s+restoreMode\s*=\s*\(u\s*===\s*["']ext-panning["']\s*\?\s*["']select["']\s*:\s*u\)\s*\|\|\s*["']select["'];/);
  assert.match(code, /this\.svgCanvas\.setMode\(restoreMode\);/);
  assert.match(code, /this\.setCursorStyle\(restoreMode\);/);

  // Verify window blur cleans up held space key
  assert.match(code, /window\.addEventListener\(["']blur["']/);
});

test('Space Pan: visteras-theme.css provides grab and grabbing cursor rules for ext-panning', () => {
  const css = fs.readFileSync(themeCssPath, 'utf8');

  // Verify grab cursor for ext-panning mode across workarea, svgcanvas, and canvas content
  assert.match(css, /\[data-mode="ext-panning"\]\s+#workarea[\s\S]*?cursor:\s*grab\s*!important/);
  assert.match(css, /\[data-mode="ext-panning"\]\s+#svgcanvas[\s\S]*?cursor:\s*grab\s*!important/);
  assert.match(css, /\[data-mode="ext-panning"\]\s+#svgcontent\s*\*[\s\S]*?cursor:\s*grab\s*!important/);

  // Verify grabbing cursor during drag
  assert.match(css, /body\.pan-dragging\s+#workarea[\s\S]*?cursor:\s*grabbing\s*!important/);
  assert.match(css, /body\.pan-dragging\s+#svgcanvas[\s\S]*?cursor:\s*grabbing\s*!important/);
  assert.match(css, /body\.pan-dragging\s+#svgcontent\s*\*[\s\S]*?cursor:\s*grabbing\s*!important/);
});
