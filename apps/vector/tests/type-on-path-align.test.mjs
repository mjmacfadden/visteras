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

test('Align to Path clears legacy double offsets and centers the font box', async () => {
  const { default: vm } = await import('node:vm');
  const js = fs.readFileSync(topJsPath, 'utf8');
  const context = vm.createContext({});
  vm.runInContext(js.slice(js.indexOf('function applyPathBaseline'), js.indexOf('function showToast')), context);
  const element = () => ({
    attrs: { dy: '-8' }, style: { removeProperty() {} },
    removeAttribute(key) { delete this.attrs[key]; },
    setAttribute(key, value) { this.attrs[key] = value; },
  });
  for (const [mode, baseline] of Object.entries({ baseline: 'alphabetic', ascender: 'text-before-edge', center: 'central', descender: 'text-after-edge' })) {
    const text = element(), tp = element();
    context.applyPathBaseline(text, tp, mode);
    assert.equal(text.attrs['data-visteras-align-path'], mode);
    for (const el of [text, tp]) {
      assert.equal(el.attrs.dy, undefined);
      assert.equal(el.attrs['dominant-baseline'], baseline);
      assert.equal(el.attrs['alignment-baseline'], baseline);
    }
  }
});
