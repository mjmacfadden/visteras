import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../js/visteras-scale-strokes.js',import.meta.url),'utf8');
const {mountScaleStrokes}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('Grouped stroke scaling toggle records reversible changes and a mixed state',()=>{
 const make=(effect='none')=>({attrs:{'vector-effect':effect},matches:()=>true,closest:()=>null,hasAttribute:()=>false,getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=v;},style:{setProperty(){}}});
 const a=make(),b=make('non-scaling-stroke'),handlers={},menu={attrs:{},setAttribute(k,v){this.attrs[k]=v;},classList:{toggle(){}},addEventListener(k,f){handlers[k]=f;}};
 globalThis.document={getElementById:()=>menu};
 globalThis.getComputedStyle=el=>({vectorEffect:el.attrs['vector-effect']});
 const history=[];const sc={getSelectedElements:()=>[{matches:()=>false,querySelectorAll:()=>[a,b]}],call(){},addCommandToHistory:c=>history.push(c),history:{BatchCommand:class{constructor(){this.items=[];}addSubCommand(c){this.items.push(c);}},ChangeElementCommand:class{constructor(el,old){this.el=el;this.old=old;}}}};
 mountScaleStrokes({svgCanvas:sc});assert.equal(menu.attrs['aria-checked'],'mixed');
 handlers.click();assert.equal(a.attrs['vector-effect'],'none');assert.equal(b.attrs['vector-effect'],'none');
 handlers.click();assert.equal(a.attrs['vector-effect'],'non-scaling-stroke');assert.equal(b.attrs['vector-effect'],'non-scaling-stroke');
 assert.equal(history.length,2);assert.equal(history[1].items.length,2);assert.equal(history[1].items[0].old['vector-effect'],'none');
 delete globalThis.document;delete globalThis.getComputedStyle;
});
