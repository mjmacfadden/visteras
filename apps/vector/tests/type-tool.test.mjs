import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorHtmlPath = path.resolve(__dirname, '../index.html');
const hygieneCssPath = path.resolve(__dirname, '../css/visteras-svgedit-hygiene.css');
const colorSystemPath = path.resolve(__dirname, '../js/visteras-color-system.js');

test('Type Tool: #text buffer is never display:none and is focusable', () => {
  const css = fs.readFileSync(hygieneCssPath, 'utf8');

  // Verify #text is removed from display:none list
  const orphanSection = css.match(/\/\*[\s\S]*?5\. Orphan options-bar tools[\s\S]*?display: none !important;\s*\}/);
  assert.ok(orphanSection, 'Orphan options-bar tools rule found');
  assert.equal(orphanSection[0].includes('#text'), false, '#text must NOT be hidden with display:none');

  // Verify #text has display:block and offscreen fixed positioning
  assert.match(css, /#text[\s\S]*?display:\s*block\s*!important/);
  assert.match(css, /#text[\s\S]*?position:\s*fixed\s*!important/);
});

test('Type Tool: #text buffer is wired for typing state and commit shortcuts', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  // Verify wireTextInputBuffer exists
  assert.match(html, /function wireTextInputBuffer\(\)/);
  assert.match(html, /window\.__visterasIsTypingDirectly\s*=\s*true/);
  assert.match(html, /window\.__visterasIsTypingDirectly\s*=\s*false/);

  // Verify Escape and Enter shortcuts commit to select mode
  assert.match(html, /if \(e\.key === 'Escape' \|\| \(e\.key === 'Enter' && !e\.shiftKey\)\)/);
  assert.match(html, /textActions\.toSelectMode\(true\)/);

  // Verify modeChange resets typing state when leaving textedit
  assert.match(html, /document\.addEventListener\('modeChange'/);
});

test('Type Tool: color system updates curText for new text creation', () => {
  const code = fs.readFileSync(colorSystemPath, 'utf8');

  // Verify curText receives the paint value
  assert.match(code, /if \(sc\.curText\) sc\.curText\[state\.activeTarget\] = val;/);
});
