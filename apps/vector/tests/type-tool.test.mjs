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

test('Type Tool: point text seeds Lorem Ipsum, start anchor, and default Roboto font', () => {
  const editorPath = path.resolve(__dirname, '../Editor.js');
  const editorCode = fs.readFileSync(editorPath, 'utf8');

  // Verify default text config uses Roboto
  assert.match(editorCode, /text:\s*\{\s*stroke_width:\s*0,\s*font_size:\s*24,\s*font_family:\s*"Roboto"\s*\}/);

  // Verify mouseDown case "text" seeds Lorem Ipsum, start anchor, and Roboto
  assert.match(editorCode, /case\s+"text":\s*\{\s*q\.setStarted\(!0\);/);
  assert.match(editorCode, /"text-anchor":\s*"start"/);
  assert.match(editorCode, /"font-family":\s*q\.getCurText\("font_family"\)\s*\|\|\s*"Roboto"/);
  assert.match(editorCode, /if\s*\(txtElem\)\s*txtElem\.textContent\s*=\s*"Lorem Ipsum";/);

  // Verify index.html config also sets text font_family to Roboto
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');
  assert.match(html, /font_family:\s*'Roboto'/);
});

test('Type Tool: textActions.start selects Lorem Ipsum and renders Studio accent highlight', () => {
  const editorPath = path.resolve(__dirname, '../Editor.js');
  const editorCode = fs.readFileSync(editorPath, 'utf8');

  // Verify textActions.start selects full text range
  assert.match(editorCode, /start\(e\)\s*\{\s*this\.#e\s*=\s*e;\s*let len\s*=\s*e\?\.textContent\?\.length/);
  assert.match(editorCode, /this\.#t\.setSelectionRange\(0,\s*len\);/);
  assert.match(editorCode, /this\.#p\(0,\s*len,\s*!0\);/);

  // Verify #text_selectblock uses Studio blue (#1C79C4) and 0.45 opacity
  assert.match(editorCode, /id:\s*"text_selectblock",\s*fill:\s*"#1C79C4",\s*opacity:\s*\.45/);

  const css = fs.readFileSync(hygieneCssPath, 'utf8');
  assert.match(css, /#text_selectblock\s*\{\s*fill:\s*#1C79C4\s*!important;\s*opacity:\s*0\.45\s*!important;\s*\}/);
});

