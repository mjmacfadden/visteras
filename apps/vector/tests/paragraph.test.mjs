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
  assert.deepEqual(P.readParagraph(el), { leading: null, autoLeading: 24, align: 'center', tracking: 50, spaceBefore: 0, spaceAfter: 0, indentLeft: 0, indentRight: 0, indentFirst: 0 });
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

test('Area text: layout reports overset instead of growing; frame size is never written by layout', () => {
  const fits = T.computeParagraphLayout({ value: 'aaa bbb', width: 40, size: 20, height: 100 }, mono);
  assert.equal(fits.overset, false);
  const over = T.computeParagraphLayout({ value: 'aaa bbb ccc ddd eee fff', width: 40, size: 20, height: 50 }, mono);
  assert.equal(over.overset, true);
  assert.equal(over.length, 2, 'only the lines that fit are laid out');
  // leading / justify / spacing change what fits, never the frame
  assert.equal(T.computeParagraphLayout({ value: 'aaa bbb', width: 40, size: 20, height: 50, leading: 40, align: 'justify' }, mono).overset, true);
  const src = fs.readFileSync(new URL('../js/visteras-text-editing.js', import.meta.url), 'utf8');
  const layoutBody = src.slice(src.indexOf('export function layoutParagraph'), src.indexOf('export function beginTextEdit'));
  // Frame size is snapshotted; layout may re-assert the same value but never grows from content.
  assert.match(layoutBody, /Frame size is fixed/);
  assert.match(src, /drawOversetMarker/);
  assert.match(src, /stroke: '#e5191a'/, 'red out-port');
});

test('Area text: selection bbox (SVG-Edit getBBox) and Transform panel use the frame, not the glyphs', () => {
  const ed = fs.readFileSync(new URL('../Editor.js', import.meta.url), 'utf8');
  assert.match(ed, /\/\/ Visteras: area \(paragraph\) text is bounded by its frame[\s\S]{0,300}Number\(t\.getAttribute\("data-text-width"\)\) > 0/);
  const tp = fs.readFileSync(new URL('../js/visteras-transform-panel.js', import.meta.url), 'utf8');
  assert.match(tp, /const frameBBox=el=>/);
  assert.match(tp, /const b=frameBBox\(el\)/);
});


test('Paragraph layout: left/right/first-line indents inset x and shrink the wrap band', () => {
  const left = T.computeParagraphLayout({ value: 'aaa bbb', width: 60, size: 10, x: 0, indentLeft: 10, indentRight: 0 }, mono);
  assert.equal(left[0].x, 10);
  // content width 50 → 'aaa ' (40) + 'bbb' (30) wrap
  assert.deepEqual(left.map((l) => l.text), ['aaa ', 'bbb']);
  const first = T.computeParagraphLayout({ value: 'aaa bbb ccc', width: 80, size: 10, x: 0, indentLeft: 0, indentFirst: 20 }, mono);
  // first line band 60 → 'aaa ' then body band 80 → rest
  assert.equal(first[0].x, 20);
  assert.ok(first[0].text.startsWith('aaa'));
  const hang = T.computeParagraphLayout({ value: 'aaa bbb ccc ddd', width: 80, size: 10, x: 0, indentFirst: -20 }, mono);
  // hanging: first line starts at 0 (no negative inset beyond left), body inset 20
  assert.equal(hang[0].x, 0);
});

test('Paragraph: applyParagraph writes indent attrs and panel/menu wiring', () => {
  const a = fakeEl('text', { id: 't1', 'font-size': '20', 'data-text-width': '200', 'data-text-height': '100' });
  const sc = fakeCanvas([a]);
  P.applyParagraph(sc, [a], { indentLeft: 12, indentRight: 8, indentFirst: 24 });
  assert.deepEqual(
    ['data-visteras-indent-left', 'data-visteras-indent-right', 'data-visteras-indent-first'].map((k) => a.getAttribute(k)),
    ['12', '8', '24']
  );
  const src = fs.readFileSync(new URL('../js/visteras-paragraph.js', import.meta.url), 'utf8');
  assert.match(src, /mountParagraphPanel/);
  assert.match(src, /action_window_paragraph/);
  assert.match(src, /visteras_paragraph_panel/);
  assert.match(src, /KeyT/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /mountParagraphPanel\(svgEditor\)/);
});

test('Area text: layout may re-assert the snapshotted frame but never invents a new size', () => {
  const src = fs.readFileSync(new URL('../js/visteras-text-editing.js', import.meta.url), 'utf8');
  const layoutBody = src.slice(src.indexOf('export function layoutParagraph'), src.indexOf('export function beginTextEdit'));
  assert.match(layoutBody, /const frameW = text\.getAttribute\('data-text-width'\)/);
  assert.match(layoutBody, /const frameH = text\.getAttribute\('data-text-height'\)/);
  assert.match(layoutBody, /if \(frameW != null && text\.getAttribute\('data-text-width'\) !== frameW\)/);
  assert.match(layoutBody, /setAttribute\('data-text-width', frameW\)/);
  assert.match(layoutBody, /setAttribute\('data-text-height', frameH\)/);
  // Only those two data-text-width/height writes exist in layoutParagraph.
  const writes = [...layoutBody.matchAll(/setAttribute\('data-text-(width|height)'/g)];
  assert.equal(writes.length, 2, 'layout only re-asserts the snapshotted frame');
});

test('Paragraph layout: justify last-line variants (center, right, all) and per-line anchors', () => {
  const v = 'aa b cc dd eeee\nff gg';
  const run = (align) => T.computeParagraphLayout({ value: v, width: 100, size: 10, x: 0, align }, mono);
  const jc = run('justify-center');
  assert.deepEqual(jc.map((l) => [l.text, l.x, l.anchor, l.wordSpacing]), [['aa b cc ', 0, 'start', 15], ['dd eeee', 50, 'middle', null], ['ff gg', 50, 'middle', null]]);
  const jr = run('justify-right');
  assert.deepEqual(jr.map((l) => [l.x, l.anchor]), [[0, 'start'], [100, 'end'], [100, 'end']]);
  const ja = run('justify-all');
  // 'dd eeee' (70px, 1 gap) and 'ff gg' (50px, 1 gap) are stretched too
  assert.deepEqual(ja.map((l) => [l.x, l.anchor, l.wordSpacing]), [[0, 'start', 15], [0, 'start', 30], [0, 'start', 50]]);
  // plain justify keeps the last line left; left/center/right add no anchor override
  assert.deepEqual(run('justify').map((l) => l.anchor), ['start', 'start', 'start']);
  assert.equal(run('center')[0].anchor, undefined);
});

test('Paragraph: justify variants stored on the text with a matching text-anchor; one-row button set', () => {
  assert.equal(P.ALIGN_TO_ANCHOR['justify-center'], 'middle');
  assert.equal(P.ALIGN_TO_ANCHOR['justify-right'], 'end');
  assert.equal(P.ALIGN_TO_ANCHOR['justify-all'], 'start');
  assert.deepEqual(P.ALIGN_BUTTONS.map((b) => b.align), ['left', 'center', 'right', 'justify', 'justify-center', 'justify-right', 'justify-all']);
  assert.equal(P.alignLabel('justify-center'), 'Justify, Last Line Center');
  assert.deepEqual(P.normalizeParagraphPatch({ align: 'justify-all' }), { align: 'justify-all' });
  assert.deepEqual(P.normalizeParagraphPatch({ align: 'justify-bogus' }), {});
  const css = fs.readFileSync(new URL('../css/visteras-appearance-fx.css', import.meta.url), 'utf8');
  assert.match(css, /\.vpara_panel_align \{ display: flex; flex-wrap: nowrap;/);
});
