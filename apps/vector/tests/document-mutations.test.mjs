import test from 'node:test';
import assert from 'node:assert/strict';
import { hasArtworkMutations } from '../js/visteras-document-mutations.js';
import { captureDocumentSnapshot, applyDocumentSave, recordDocumentChange } from '../js/visteras-document-save.js';
function fixture() {
  const root = { attrs:{}, contains:target=>target===root||target===shape, getAttribute(name){return this.attrs[name]??null;} };
  const shape = { attrs:{}, getAttribute:root.getAttribute };
  return { root, shape, attr(target,name,oldValue,value) {
    target.attrs[name]=value;
    return {type:'attributes',target,attributeName:name,oldValue};
  } };
}
test('viewport layout and no-op attributes do not prevent a completed save clearing dirty', () => {
  const f=fixture(), doc={id:'a',revision:1,dirty:true};
  const snapshot=captureDocumentSnapshot(doc,{svg:'<svg/>',width:100,height:100,unit:'px'});
  const records=[f.attr(f.root,'width','100','200'),f.attr(f.root,'x','0','400'),f.attr(f.root,'viewBox','0 0 100 100','0 0 100 100'),f.attr(f.shape,'fill','red','red')];
  if(hasArtworkMutations(records,f.root))recordDocumentChange(doc);
  applyDocumentSave([doc],snapshot,{},'Saved');
  assert.equal(doc.dirty,false);
});
test('real geometry, text, structure and document size edits remain detectable', () => {
  const f=fixture();
  for(const record of [f.attr(f.shape,'x','0','10'),f.attr(f.root,'viewBox','0 0 100 100','0 0 200 100'),{type:'childList',target:f.root},{type:'characterData',target:f.shape}]) {
    assert.equal(hasArtworkMutations([record],f.root),true);
  }
});
test('temporary changes restored within a batch and UI overlays are ignored', () => {
  const f=fixture();
  const records=[f.attr(f.shape,'fill','red','blue'),f.attr(f.shape,'fill','blue','red'),{type:'childList',target:{}}];
  assert.equal(hasArtworkMutations(records,f.root),false);
});
test('genuine edits during saving still retain the unsaved indicator', () => {
  const f=fixture(),doc={id:'a',revision:1,dirty:true};
  const snapshot=captureDocumentSnapshot(doc,{svg:'<svg/>',width:100,height:100,unit:'px'});
  if(hasArtworkMutations([f.attr(f.shape,'d','M0 0','M10 10')],f.root))recordDocumentChange(doc);
  applyDocumentSave([doc],snapshot,{},'Saved');
  assert.equal(doc.dirty,true);
});
