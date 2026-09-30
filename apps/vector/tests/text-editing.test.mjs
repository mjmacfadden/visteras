import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../js/visteras-text-editing.js', import.meta.url),'utf8');
const { wrapText, isParagraphDrag, selectionQuad } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
