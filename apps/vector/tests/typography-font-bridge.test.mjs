import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorHtmlPath = path.resolve(__dirname, '../index.html');
const editorPath = path.resolve(__dirname, '../Editor.js');
const fontBridgePath = path.resolve(__dirname, '../js/visteras-font-bridge.js');
const typeOnPathPath = path.resolve(__dirname, '../js/visteras-type-on-path.js');

test('Typography: index.html defines #slot_font_weight in #sec_typography_body', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');
  assert.match(html, /id="slot_font_weight"/, '#slot_font_weight must exist in index.html');
  assert.match(html, /id="slot_font_family"[\s\S]*?id="slot_font_weight"[\s\S]*?id="slot_font_size"/, 'Font weight must be positioned beside font size in typography section');
});

test('Typography: Editor.js mouseDown case "text" seeds letter-spacing, word-spacing, font-weight from curText', () => {
  const editorCode = fs.readFileSync(editorPath, 'utf8');
  assert.match(editorCode, /let curLetterSpacing = q\.getCurText\("letter_spacing"\)/);
  assert.match(editorCode, /let curWordSpacing = q\.getCurText\("word_spacing"\)/);
  assert.match(editorCode, /let curFontWeight = q\.getCurText\("font_weight"\)/);
  assert.match(editorCode, /txtAttr\["letter-spacing"\]\s*=\s*String\(curLetterSpacing\)|textAttrs\["letter-spacing"\]\s*=\s*String\(curLetterSpacing\)/);
  assert.match(editorCode, /txtAttr\["word-spacing"\]\s*=\s*String\(curWordSpacing\)|textAttrs\["word-spacing"\]\s*=\s*String\(curWordSpacing\)/);
  assert.match(editorCode, /txtAttr\["font-weight"\]\s*=\s*String\(curFontWeight\)|textAttrs\["font-weight"\]\s*=\s*String\(curFontWeight\)/);
});

test('Typography: Editor.js cb and lb update curText for letter_spacing and word_spacing', () => {
  const editorCode = fs.readFileSync(editorPath, 'utf8');
  assert.match(editorCode, /cb = \(e\) => \{[\s\S]*?J\.setCurText\("letter_spacing", e\)/, 'cb must update curText letter_spacing');
  assert.match(editorCode, /lb = \(e\) => \{[\s\S]*?J\.setCurText\("word_spacing", e\)/, 'lb must update curText word_spacing');
});

test('Typography: Editor.js exposes setFontWeight and getFontWeight on svgCanvas', () => {
  const editorCode = fs.readFileSync(editorPath, 'utf8');
  assert.match(editorCode, /J\.getFontWeight = getFontWeight/);
  assert.match(editorCode, /J\.setFontWeight = setFontWeight/);
});

test('Typography: updateContextPanel triggers __visterasSyncTypography', () => {
  const editorCode = fs.readFileSync(editorPath, 'utf8');
  assert.ok(editorCode.includes('window.__visterasSyncTypography?.(e)'), 'Editor.js must call window.__visterasSyncTypography?.(e)');
});

test('Typography: updatePropertiesVisibility in index.html calls __visterasSyncTypography', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');
  assert.match(html, /window\.__visterasSyncTypography\(curElem\)/);
});

test('Type on Path: readTextStyle and createTypeOnPath inherit letter-spacing, word-spacing, font-weight', () => {
  const topCode = fs.readFileSync(typeOnPathPath, 'utf8');
  assert.match(topCode, /letterSpacing = sc\.getCurText\('letter_spacing'\)/);
  assert.match(topCode, /wordSpacing = sc\.getCurText\('word_spacing'\)/);
  assert.match(topCode, /text\.setAttribute\('letter-spacing', String\(letterSpacing\)\)/);
  assert.match(topCode, /text\.setAttribute\('word-spacing', String\(wordSpacing\)\)/);
  assert.match(topCode, /text\.setAttribute\('font-weight', String\(fontWeight\)\)/);
});

test('Font Bridge: provides Studio-parity Search for Font modal dialog with system fonts and filters', () => {
  const bridgeCode = fs.readFileSync(fontBridgePath, 'utf8');
  assert.match(bridgeCode, /class FontSearchDialog/);
  assert.match(bridgeCode, /Search for Font/);
  assert.match(bridgeCode, /Upload Font File \(\.ttf, \.otf, \.woff\)\.\.\./);
  assert.match(bridgeCode, /Refresh System Fonts|Use System Fonts/);
  assert.match(bridgeCode, /data-tab="system"/);
  assert.match(bridgeCode, /data-tab="custom"/);
  assert.match(bridgeCode, /data-tab="google"/);
  assert.match(bridgeCode, /id="font_sel_category"/);
  assert.match(bridgeCode, /id="font_sel_weight"/);
  assert.match(bridgeCode, /id="font_sel_width"/);
  assert.match(bridgeCode, /id="font_sel_style"/);
  assert.match(bridgeCode, /id="font_sel_sort"/);
  assert.match(bridgeCode, /font_badge_system/);
  assert.match(bridgeCode, /The quick brown fox jumps over the lazy dog\./);
  assert.match(bridgeCode, /btn_dialog_ok/);
  assert.match(bridgeCode, /btn_dialog_cancel/);
});

test('Font Bridge: mounts Font Weight picker in #slot_font_weight', () => {
  const bridgeCode = fs.readFileSync(fontBridgePath, 'utf8');
  assert.match(bridgeCode, /visteras_font_weight_picker/);
  assert.match(bridgeCode, /slotWeight/);
  assert.match(bridgeCode, /getFontWeightList/);
});

test('Font Bridge: exports bidirectional __visterasSyncTypography', () => {
  const bridgeCode = fs.readFileSync(fontBridgePath, 'utf8');
  assert.match(bridgeCode, /window\.__visterasSyncTypography = syncTypography/);
  assert.match(bridgeCode, /tool_letter_spacing/);
  assert.match(bridgeCode, /tool_word_spacing/);
  assert.match(bridgeCode, /tool_bold/);
});

test('Typography: font style buttons match Studio styling with active bottom underline and hide overline', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');
  assert.match(html, /0 -1px 0 0 #ffffff inset/, 'Must contain Studio active button inset white underline indicator');
  assert.match(html, /tool_text_decoration_overline[\s\S]*?display\s*=\s*'none'/, 'Must hide obsolete overline button');
  assert.match(html, /btn-box\.pressed img[\s\S]*?filter:\s*\$\{activeFilter\}/, 'Must turn active button glyphs white');
});

test('Font Loader: loads catalog font weights and updates document.fonts', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const loaderCode = fs.readFileSync(path.resolve(repoRoot, 'packages/fonts/src/loader.js'), 'utf8');
  assert.match(loaderCode, /document\.fonts\.load\(`\$\{style\} \$\{weight\} 16px "\$\{family\}"`\)/, 'Must load specific weight and style via document.fonts.load');
  assert.match(loaderCode, /findGoogleFontEntry\(family\)/, 'Must query catalog entry to include all available weights');
});

