import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pointInPolygon,anchorsInLasso,mountLasso} from '../js/visteras-lasso.js';
const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
test('Lasso convex loop includes interior/boundary and excludes exterior',()=>{
 assert.ok(pointInPolygon({x:5,y:5},square));assert.ok(pointInPolygon({x:0,y:5},square));assert.equal(pointInPolygon({x:11,y:5},square),false);
});
test('Lasso concave C loop excludes the open notch',()=>{
 const c=[{x:0,y:0},{x:10,y:0},{x:10,y:2},{x:2,y:2},{x:2,y:8},{x:10,y:8},{x:10,y:10},{x:0,y:10}];
 assert.ok(pointInPolygon({x:1,y:5},c));assert.equal(pointInPolygon({x:5,y:5},c),false);
});
test('Lasso self-intersecting loop uses even-odd fill',()=>{
 const bow=[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}];
 assert.ok(pointInPolygon({x:5,y:1},bow));assert.ok(pointInPolygon({x:5,y:9},bow));assert.equal(pointInPolygon({x:1,y:5},bow),false);
});
test('Empty and collinear lassos do not select anchors',()=>{
 for(const polygon of [[],square.slice(0,2),[{x:0,y:0},{x:5,y:0},{x:10,y:0}]])assert.equal(pointInPolygon({x:5,y:0},polygon),false);
});
const el={},other={},list=[{el,index:0,x:5,y:5},{el,index:1,x:20,y:20},{el:other,index:0,x:6,y:6}];
test('Replace selects only enclosed anchors across multiple objects',()=>{
 const result=anchorsInLasso(list,square,'replace',new Map([[el,new Set([1])]]));assert.deepEqual([...result.get(el)],[0]);assert.deepEqual([...result.get(other)],[0]);
});
test('Shift-add preserves previous anchors without mutating input',()=>{
 const previous=new Map([[el,new Set([1])]]),result=anchorsInLasso(list,square,'add',previous);assert.deepEqual([...result.get(el)],[1,0]);assert.deepEqual([...previous.get(el)],[1]);
});
test('Alt-subtract removes only enclosed points and drops empty selections',()=>{
 const result=anchorsInLasso(list,square,'subtract',new Map([[el,new Set([0,1])],[other,new Set([0])]]));assert.deepEqual([...result.get(el)],[1]);assert.equal(result.has(other),false);
});
test('Lasso tool wiring preserves editable Direct Selection anchors and intercepts object dragging',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
 assert.ok(read('../js/visteras-selection.js').includes("q: 'tool_lasso'"));
 const ds=read('../js/visteras-direct-selection.js'),ui=read('../js/visteras-lasso.js');
 assert.ok(ds.includes('selectAnchors(map)')&&ds.includes('getAnchorCandidates()')&&ds.includes("parent.getAttribute('data-visteras-locked')==='1'"));
 assert.ok(ui.includes("window.addEventListener('pointerdown'")&&ui.includes("window.addEventListener('mousedown'"));
 assert.ok(ui.includes('stopImmediatePropagation()')&&ui.includes('typing(e)'));
});
test('Shared lasso icons exactly reuse Studio geometry',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
 const geometry=svg=>[...svg.matchAll(/<(path|circle)\s+([^>]+)\/?\s*>/g)].map(m=>[m[1],Object.fromEntries([...m[2].matchAll(/(d|cx|cy|r)="([^"]*)"/g)].map(a=>[a[1],a[2]]))]);
 const studio=read('../../studio/images/icons/lasso.svg');
 for(const p of ['../../../packages/icons/tools/lasso.svg','../images/tools/lasso.svg','../../studio/images/tools/lasso.svg'])assert.deepEqual(geometry(read(p)),geometry(studio));
});
test('Lasso pointer gestures replace/add/subtract and Esc cancels without moving artwork',()=>{
 const oldDocument=global.document,oldWindow=global.window;
 const events={},nodes=new Map();
 function node(tag){const n={tagName:tag,attrs:{},children:[],style:{},setAttribute(a,v){this.attrs[a]=v;if(a==='id')nodes.set(v,this);},removeAttribute(a){delete this.attrs[a];},append(child){this.children.push(child);child.parent=this;},after(){},addEventListener(){},remove(){if(this.attrs.id)nodes.delete(this.attrs.id);},get id(){return this.attrs.id;},set id(v){this.setAttribute('id',v);}};return n;}
 global.document={createElement:node,createElementNS:(_,tag)=>node(tag),getElementById:id=>nodes.get(id)||null,body:node('body'),head:node('head'),addEventListener(){}};
 global.window={addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
 let mode='select',selection=new Map(),geometryMoves=0;
 const ds={active:false,getAnchorSelection:()=>selection,getAnchorCandidates:()=>list,selectAnchors:map=>{selection=map;}};
 const sc={directSelection:ds,getSelectedElements:()=>[],getMode:()=>mode,setMode:v=>{mode=v;},getSvgRoot:()=>({contains:()=>true}),moveSelectedElements(){geometryMoves++;}};
 const fire=(name,extra={})=>{for(const fn of events[name]||[])fn({button:0,pointerId:1,target:{},clientX:0,clientY:0,preventDefault(){},stopImmediatePropagation(){},composedPath:()=>[],...extra});};
 try{
   const tool=mountLasso({svgCanvas:sc});tool.activate();
   function loop(extra){fire('pointerdown',extra);fire('pointermove',{clientX:10,clientY:0});fire('pointermove',{clientX:10,clientY:10});fire('pointermove',{clientX:0,clientY:10});fire('pointerup');}
   fire('pointerdown');fire('pointermove',{clientX:10,clientY:0});fire('pointermove',{clientX:10,clientY:10});
   assert.equal(nodes.get('visteras-lasso-overlay').attrs.d,'M0 0 L10 0 L10 10');
   assert.equal(selection.size,0,'selection waits for release');fire('pointercancel');
   loop({});assert.deepEqual([...selection.get(el)],[0]);
   selection=new Map([[el,new Set([1])]]);loop({shiftKey:true});assert.deepEqual([...selection.get(el)],[1,0]);
   loop({altKey:true});assert.deepEqual([...selection.get(el)],[1]);
   fire('pointerdown');fire('keydown',{key:'Escape'});fire('pointerup');assert.deepEqual([...selection.get(el)],[1]);assert.equal(geometryMoves,0);assert.equal(nodes.has('visteras-lasso-screen'),false);
 }finally{global.document=oldDocument;global.window=oldWindow;}
});
