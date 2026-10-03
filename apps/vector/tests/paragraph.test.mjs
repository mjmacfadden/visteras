import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModule, fakeEl, fakeCanvas } from './helpers/fake-svg.mjs';
const P = await loadModule('visteras-paragraph.js');
const T = await loadModule('visteras-text-editing.js');
const mono = (s) => s.length * 10; // 10px per char

test('Paragraph layout: Auto leading matches the previous hardcoded 1.2', () => {
  const lines = T.computeParagraphLayout({ value: 'aaa bbb ccc', width: 40, size: 20, x: 5, y: 100 }, mono);
  assert.deepEqual(lines.map((l) => [l.text, l.y, l.x, l.start]), [['aaa ', 120, 5, 0], ['bbb ', 144, 5, 4], ['ccc', 168, 5, 8]]);
  // height clipping identical to the old (i + 1) * size * 1.2 > height rule
  assert.equal(T.computeParagraphLayout({ value: 'aaa bbb ccc', width: 40, size: 20, height: 48 }, mono).length, 2);
  assert.equal(T.computeParagraphLayout({ value: 'aaa bbb ccc', width: 40, size: 20, height: 47 }, mono).length, 1);
});

test('Paragraph layout: custom leading and space before/after between paragraphs only', () => {
  const lines = T.computeParagraphLayout({ value: 'aa bb\ncc\ndd', width: 30, size: 10, leading: 30, spaceBefore: 5, spaceAfter: 7 }, mono);
  assert.deepEqual(lines.map((l) => [l.text, l.y, l.start]), [['aa ', 10, 0], ['bb', 40, 3], ['cc', 82, 6], ['dd', 124, 9]]);
});

test('Paragraph layout: alignment x and justify (last line left)', () => {
  const c = T.computeParagraphLayout({ value: 'ab', width: 100, size: 10, x: 0, align: 'center' }, mono);
  assert.equal(c[0].x, 50);
  assert.equal(T.computeParagraphLayout({ value: 'ab', width: 100, size: 10, x: 0, align: 'right' }, mono)[0].x, 100);
  const j = T.computeParagraphLayout({ value: 'aa b cc dd eeee\nff gg', width: 100, size: 10, align: 'justify' }, mono);
  // 'aa b cc ' (trimmed 70px, 2 gaps) → +15px word spacing fills 100px
  assert.deepEqual(j.map((l) => [l.text, l.wordSpacing]), [['aa b cc ', 15], ['dd eeee', null], ['ff gg', null]]);
  // single-word line can't justify
  assert.equal(T.computeParagraphLayout({ value: 'aaaaaaaaaaaa b', width: 100, size: 10, align: 'justify' }, mono)[0].wordSpacing, null);
});

test('Paragraph: tracking ↔ letter-spacing and readParagraph defaults', () => {
  assert.equal(P.trackingToLetterSpacing(100, 24), 2.4);
  assert.equal(P.letterSpacingToTracking('2.4', 24), 100);
  const el = fakeEl('text', { 'font-size': '20', 'text-anchor': 'middle', 'letter-spacing': '1' });
  assert.deepEqual(P.readParagraph(el), { leading: null, autoLeading: 24, align: 'center', tracking: 50, spaceBefore: 0, spaceAfter: 0 });
  assert.deepEqual(P.normalizeParagraphPatch({ leading: '', tracking: '25.4', spaceBefore: -3, align: 'bogus' }), { leading: null, tracking: 25, spaceBefore: 0 });
});

test('Paragraph: applyParagraph is one undo step, syncs text-anchor and letter-spacing', () => {
  const a = fakeEl('text', { id: 't1', 'font-size': '20', 'data-text-width': '200' });
  const b = fakeEl('text', { id: 't2', 'font-size': '10' });
  const sc = fakeCanvas([a, b]);
  P.applyParagraph(sc, [a, b], { align: 'justify', tracking: 200 });
  assert.equal(a.getAttribute('data-visteras-align'), 'justify');
  assert.equal(a.getAttribute('text-anchor'), 'start');
  assert.equal(a.getAttribute('letter-spacing'), '4');
  assert.equal(b.getAttribute('letter-spacing'), '2');
  assert.equal(sc.log.length, 1);
  sc.undo();
  assert.equal(a.getAttribute('data-visteras-align'), null);
  assert.equal(a.getAttribute('letter-spacing'), null);
  sc.redo();
  P.applyParagraph(sc, [a], { leading: 30, spaceBefore: 6, spaceAfter: 4, align: 'right' });
  assert.deepEqual(['data-visteras-leading', 'data-visteras-space-before', 'data-visteras-space-after', 'text-anchor'].map((k) => a.getAttribute(k)), ['30', '6', '4', 'end']);
  P.applyParagraph(sc, [a], { leading: '' });
  assert.equal(a.getAttribute('data-visteras-leading'), null, 'empty = Auto');
  const n = sc.log.length;
  P.applyParagraph(sc, [a], { align: 'right' });
  assert.equal(sc.log.length, n, 'no-op adds no history');
  // font size change keeps tracking proportional
  a.setAttribute('font-size', '40');
  assert.equal(P.syncTracking(a), true);
  assert.equal(a.getAttribute('letter-spacing'), '8');
});

test('Paragraph: text layout reads the attributes; wiring and observers', () => {
  const src = fs.readFileSync(new URL('../js/visteras-text-editing.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /size \* 1\.2\b/, 'no hardcoded leading left');
  assert.match(src, /new MutationObserver\(bind\)\.observe\(root,\{childList:true\}\)/, 'reflow after open (svgcontent replaced)');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /mountParagraph\(svgEditor\);/);
  assert.match(html, /import \{ mountTextEditing \} from '\.\/js\/visteras-text-editing\.js';/, 'single module instance (type-on-path imports it too)');
});

test('Paragraph: newlines in data-text-content are encoded for save', () => {
  const svg = '<text data-text-content="one\ntwo\r\nthree" x="1">x</text><text data-text-content="solo">y</text>';
  assert.equal(T.encodeTextContentNewlines(svg), '<text data-text-content="one&#10;two&#10;three" x="1">x</text><text data-text-content="solo">y</text>');
  const src = fs.readFileSync(new URL('../js/visteras-text-editing.js', import.meta.url), 'utf8');
  assert.match(src, /sc\.svgCanvasToString=function\(\.\.\.args\)\{return encodeTextContentNewlines/);
});
