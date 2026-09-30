import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorHtmlPath = path.resolve(__dirname, '../index.html');
const themeCssPath = path.resolve(__dirname, '../css/visteras-theme.css');
const topJsPath = path.resolve(__dirname, '../js/visteras-type-on-path.js');

test('Type on Path: HTML markup contains Left, Center, and Right align UI buttons', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  // Verify alignment group container exists
  assert.match(html, /<div class="top-align-group" id="top_align_group" role="group" aria-label="Type on path alignment">/);

  // Verify Left Align button
  assert.match(html, /id="top_align_start"[^>]*data-align="start"[^>]*title="Left Align"[^>]*aria-label="Left Align"/);

  // Verify Center Align button
  assert.match(html, /id="top_align_middle"[^>]*data-align="middle"[^>]*title="Center Align"[^>]*aria-label="Center Align"/);

  // Verify Right Align button
  assert.match(html, /id="top_align_end"[^>]*data-align="end"[^>]*title="Right Align"[^>]*aria-label="Right Align"/);

  // Verify hidden fallback #top_align input exists for compatibility
  assert.match(html, /<input type="hidden" id="top_align" value="start" \/>/);
});

test('Type on Path: theme CSS provides segmented control styling for align buttons', () => {
  const css = fs.readFileSync(themeCssPath, 'utf8');

  // Verify group styling
  assert.match(css, /\.top-align-group\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.top-align-group\s*\{[^}]*height:\s*26px/);

  // Verify button styling
  assert.match(css, /\.top-align-btn\s*\{[^}]*flex:\s*1/);
  assert.match(css, /\.top-align-btn\.active,\s*\.top-align-btn\[aria-pressed="true"\]\s*\{[^}]*color:\s*#fa7c1b/);
});

test('Type on Path: JS wires Left, Center, and Right align buttons to update text-anchor and startOffset', () => {
  const js = fs.readFileSync(topJsPath, 'utf8');

  // Verify updateOptionsPanel syncs .top-align-btn active states
  assert.match(js, /const alignBtns = panel\.querySelectorAll\('\.top-align-btn'\);/);
  assert.match(js, /const isActive = btn\.dataset\.align === normAlign;/);
  assert.match(js, /btn\.classList\.toggle\('active',\s*isActive\);/);

  // Verify wireOptionsPanel binds click events on .top-align-btn
  assert.match(js, /function setTypeOnPathAlign\(align\)/);
  assert.match(js, /alignBtns = panel\.querySelectorAll\('\.top-align-btn'\);/);
  assert.match(js, /btn\.addEventListener\('click',\s*\(e\)\s*=>\s*\{/);
  assert.match(js, /setTypeOnPathAlign\(btn\.dataset\.align\);/);

  // Verify alignment maps to correct text-anchor and startOffset
  assert.match(js, /if \(a === 'middle'\)\s*\{\s*tp\.setAttribute\('startOffset',\s*'50%'\);/);
  assert.match(js, /else if \(a === 'end'\)\s*\{\s*tp\.setAttribute\('startOffset',\s*'100%'\);/);
  assert.match(js, /else\s*\{\s*tp\.setAttribute\('startOffset',\s*'0%'\);/);
});

test('Type on Path: Align to Path updates dominant-baseline, alignment-baseline, and data attribute', () => {
  const js = fs.readFileSync(topJsPath, 'utf8');

  // Verify baselineMap in applyAlignToPath maps modes to valid SVG baselines
  assert.match(js, /const baselineMap = \{\s*baseline:\s*'alphabetic',\s*ascender:\s*'hanging',\s*center:\s*'middle',\s*descender:\s*'ideographic',?\s*\};/);

  // Verify applyAlignToPath sets dominant-baseline and alignment-baseline on both tp and textEl
  assert.match(js, /tp\.setAttribute\('dominant-baseline',\s*db\);/);
  assert.match(js, /tp\.setAttribute\('alignment-baseline',\s*db\);/);
  assert.match(js, /textEl\.setAttribute\('dominant-baseline',\s*db\);/);
  assert.match(js, /textEl\.setAttribute\('alignment-baseline',\s*db\);/);

  // Verify persistence and re-render triggers
  assert.match(js, /textEl\.setAttribute\('data-visteras-align-path',\s*mode\);/);
  assert.match(js, /setTextPathHref\(tp,\s*href\.replace\(\/\^#\/,\s*''\)\);/);

  // Verify createTypeOnPath initializes dominant-baseline and data-visteras-align-path
  assert.match(js, /text\.setAttribute\('data-visteras-align-path',\s*alignPath\);/);
  assert.match(js, /textPath\.setAttribute\('dominant-baseline',\s*db\);/);

  // Verify syncOptionsPanel reads data-visteras-align-path or falls back to dominant-baseline
  assert.match(js, /let mode = textEl\?\.getAttribute\('data-visteras-align-path'\);/);
  assert.match(js, /const db = tp\.getAttribute\('dominant-baseline'\) \|\| textEl\?\.getAttribute\('dominant-baseline'\)/);
});

