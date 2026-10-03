import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../js/visteras-text-editing.js', import.meta.url),'utf8');
const { wrapText, isParagraphDrag, selectionQuad, getLoremIpsumForBox, computeParagraphLayout, LOREM_IPSUM } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('Text creation uses Studio’s screen-space paragraph threshold',()=>{
  assert.equal(isParagraphDrag(7,100),false);
  assert.equal(isParagraphDrag(100,7),false);
  assert.equal(isParagraphDrag(8,8),true);
});
test('Paragraphs wrap at words and split words wider than the box',()=>{
  const measure = s=>s.length;
  assert.deepEqual(wrapText('One two three',8,measure),['One two ','three']);
  assert.deepEqual(wrapText('abcdefghij',4,measure),['abcd','efgh','ij']);
  assert.deepEqual(wrapText('First\n\nLast',20,measure),['First','','Last']);
  assert.equal(wrapText('  keep spaces  ',5,measure).join(''),'  keep spaces  ');
});

test('Selection follows the glyph baseline at any rotation',()=>{
  assert.deepEqual(selectionQuad({x:0,y:0},{x:10,y:0},0,8,2),[[0,-8],[10,-8],[10,2],[0,2]]);
  const quad=selectionQuad({x:0,y:0},{x:0,y:10},90,8,2);
  const expected=[[8,0],[8,10],[-2,10],[-2,0]];
  quad.forEach((p,i)=>p.forEach((v,j)=>assert.ok(Math.abs(v-expected[i][j])<1e-10)));
});

test('Area text: getLoremIpsumForBox fills with as much Lorem Ipsum as will fit without overset', () => {
  const charMeasure = s => s.length * 10; // 10px per character

  // 1. Text starts with Lorem ipsum
  const textSmall = getLoremIpsumForBox({ width: 100, height: 60, size: 20 }, charMeasure);
  assert.ok(textSmall.startsWith('Lorem ipsum'), 'Must start with Lorem ipsum');

  // 2. Larger box holds significantly more text than smaller box
  const textLarge = getLoremIpsumForBox({ width: 400, height: 300, size: 20 }, charMeasure);
  assert.ok(textLarge.length > textSmall.length * 2, 'Large box must hold more words than small box');

  // 3. Fitting text does not overset the box dimensions
  const layoutSmall = computeParagraphLayout({ value: textSmall, width: 100, height: 60, size: 20 }, charMeasure);
  assert.equal(layoutSmall.overset, false, 'Small box generated text must not overset');

  const layoutLarge = computeParagraphLayout({ value: textLarge, width: 400, height: 300, size: 20 }, charMeasure);
  assert.equal(layoutLarge.overset, false, 'Large box generated text must not overset');

  // 4. Tiny boundary box safely falls back
  const textTiny = getLoremIpsumForBox({ width: 5, height: 5, size: 20 }, charMeasure);
  assert.equal(textTiny, LOREM_IPSUM);
});

