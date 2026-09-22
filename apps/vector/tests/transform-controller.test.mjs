import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Matrix {
  constructor(v=[1,0,0,1,0,0]) { [this.a,this.b,this.c,this.d,this.e,this.f]=v; }
  multiply(n) { const m=this; return new Matrix([m.a*n.a+m.c*n.b,m.b*n.a+m.d*n.b,m.a*n.c+m.c*n.d,m.b*n.c+m.d*n.d,m.a*n.e+m.c*n.f+m.e,m.b*n.e+m.d*n.f+m.f]); }
  inverse() { const {a,b,c,d,e,f}=this,k=a*d-b*c; return new Matrix([d/k,-b/k,-c/k,a/k,(c*f-d*e)/k,(b*e-a*f)/k]); }
  translate(x,y) { return this.multiply(new Matrix([1,0,0,1,x,y])); }
  scale(x,y) { return this.multiply(new Matrix([x,0,0,y,0,0])); }
  rotate(deg) { const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return this.multiply(new Matrix([c,s,-s,c,0,0])); }
}
function setup(mode='select', count=1) {
  const events={}, frames=[], history=[];
  class Node {
    constructor() { this.attrs={};this.children=[];this.isConnected=true;this.transform={baseVal:{numberOfItems:0}}; }
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k]??null;}
    removeAttribute(k){delete this.attrs[k];}
    append(n){this.children.push(n);n.parentNode=this;}
    replaceChildren(){this.children=[];}
    getScreenCTM(){return new Matrix();}
    getBBox(){return {x:0,y:0,width:100,height:50};}
    addEventListener(){}
  }
  const root=new Node(), overlay=new Node(), grips=new Node(), native=new Node();
  const elements=Array.from({length:count},()=>{const n=new Node();root.append(n);return n;});
  const sc={getSelectedElements:()=>elements,getSvgContent:()=>root,getSvgRoot:()=>root,getMode:()=>mode,getStarted:()=>false,getZoom:()=>1,
    undoMgr:{getUndoStackSize:()=>history.length,getRedoStackSize:()=>0},
    selectorManager:{selectorParentGroup:overlay,selectorGripsGroup:grips,selectors:[{selectorGroup:native}]},call(){},
    addCommandToHistory:c=>history.push(c),history:{BatchCommand:class{constructor(){this.items=[];}addSubCommand(c){this.items.push(c);}},ChangeElementCommand:class{constructor(el,old){this.el=el;this.old=old;}}}};
  const document={head:new Node(),createElementNS:()=>new Node(),createElement:()=>new Node(),getElementById:()=>({}),addEventListener:(type,fn)=>(events[type]??=[]).push(fn)};
  const context=vm.createContext({document,window:{addEventListener(){}},mountDirectSelection(){},requestAnimationFrame:f=>(frames.push(f),frames.length),MutationObserver:class{observe(){}},DOMMatrix:Matrix,DOMPoint:class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(m){return {x:m.a*this.x+m.c*this.y+m.e,y:m.b*this.x+m.d*this.y+m.f};}}});
  context.sc = sc;
  vm.runInContext(fs.readFileSync(new URL('../js/visteras-selection.js',import.meta.url),'utf8').replace(/^import .*;$/m,'').replace('export function','function')+';mountSelectionTools({svgCanvas:sc});',context);
  const flush=()=>{while(frames.length)frames.shift()();};flush();
  const fire=(type,props={})=>{const e={button:0,clientX:100,clientY:50,preventDefault(){},stopImmediatePropagation(){this.stopped=true;},...props};for(const fn of events[type]||[]){fn(e);if(e.stopped)break;}};
  const handle=dir=>overlay.children[0].children.find(n=>n.attrs['data-selection-handle']===dir);
  return {elements,history,native,grips,fire,flush,handle,overlay};
}
for(const [mode,count] of [['select',1],['rect',1],['select',2]]) test(`${mode}: ${count} objects use one transform controller and history entry`,()=>{
  const s=setup(mode,count);
  assert.equal(s.native.attrs.display,'none');assert.equal(s.grips.attrs.display,'none');
  assert.equal(s.overlay.children[0].children.filter(n=>n.attrs['data-selection-handle']).length,12);
  assert.equal(s.overlay.children[0].children.filter(n=>n.attrs['data-selection-handle']==='rotate' && n.attrs.fill==='transparent').length,4);
  s.fire('mousedown',{target:s.handle('se')});s.fire('mousemove',{clientX:200,clientY:100});s.fire('mouseup');s.flush();
  assert.equal(s.history.length,1);assert.equal(s.history[0].items.length,count);
  for(const el of s.elements)assert.equal(el.attrs.transform,'matrix(2 0 0 2 0 0)');
  assert.equal(s.history[0].items[0].old.transform,null);
});
test('Alt resizes around the center; Escape restores the original transform',()=>{
  const s=setup();s.fire('mousedown',{target:s.handle('se')});s.fire('mousemove',{clientX:150,clientY:75,altKey:true});
  assert.equal(s.elements[0].attrs.transform,'matrix(2 0 0 2 -50 -25)');
  s.fire('keydown',{key:'Escape'});assert.equal(s.elements[0].getAttribute('transform'),null);assert.equal(s.history.length,0);
});
test('Shift constrains scale and rotation uses the same undo path',()=>{
  const s=setup();s.fire('mousedown',{target:s.handle('se')});s.fire('mousemove',{clientX:200,clientY:60,shiftKey:true});s.fire('mouseup');
  assert.equal(s.elements[0].attrs.transform,'matrix(2 0 0 2 0 0)');
  const r=setup();r.fire('mousedown',{target:r.handle('rotate'),clientX:50,clientY:0});r.fire('mousemove',{clientX:75,clientY:25,shiftKey:true});r.fire('mouseup');
  assert.equal(r.history.length,1);assert.match(r.elements[0].attrs.transform,/^matrix\(/);
});
test('bounding outline rotates with the object during rotation',()=>{
  const s=setup();
  s.fire('mousedown',{target:s.handle('rotate'),clientX:50,clientY:0});
  s.fire('mousemove',{clientX:75,clientY:25,shiftKey:true});s.flush();
  const points=s.overlay.children[0].children[0].attrs.points.split(' ').map(p=>p.split(',').map(Number));
  assert.ok(Math.abs(points[0][0]-points[1][0])<1e-9);
  assert.ok(Math.abs(Math.abs(points[0][1]-points[1][1])-100)<1e-9);
});
