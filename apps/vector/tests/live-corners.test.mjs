import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cornerGeometry,maxRadius,applyCorners,buildCorners,eligibleCorners,parseCornerData,serializeCornerData,cornerDataIsCurrent} from '../js/visteras-live-corners.js';
import {serializeSegments} from '../js/visteras-anchor-model.js';
const square=[{type:2,x:0,y:0},{type:4,x:100,y:0},{type:4,x:100,y:100},{type:4,x:0,y:100},{type:4,x:0,y:0},{type:1}];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const mid=(g)=>({x:(g.start.x+3*g.segment.x1+3*g.segment.x2+g.end.x)/8,y:(g.start.y+3*g.segment.y1+3*g.segment.y2+g.end.y)/8});
test('Round square tangents are ten from corner and cubic handles are 0.5523 r',()=>{
 const g=cornerGeometry({x:0,y:100},{x:0,y:0},{x:100,y:0},10);
 near(g.start.y,10);near(g.end.x,10);near(g.start.y-g.segment.y1,5.5228474983);near(g.segment.x2,4.4771525017);
});
test('Chamfer connects tangent points with one straight segment',()=>{
 const g=cornerGeometry({x:0,y:100},{x:0,y:0},{x:100,y:0},10,'chamfer');
 assert.equal(g.segment.type,4);near(g.segment.x,10);near(g.segment.y,0);
});
test('Inverted round is concave and centered on the original corner',()=>{
 const p={x:0,y:0},a={x:0,y:100},b={x:100,y:0};
 const inv=cornerGeometry(a,p,b,10,'inverted'),round=cornerGeometry(a,p,b,10);
 near(mid(inv).x,7.0710678119);near(mid(inv).y,7.0710678119);
 assert.ok(mid(inv).x>mid(round).x);near(Math.hypot(mid(inv).x,mid(inv).y),10);
});
test('20-high rectangle with both neighboring corners rounded has max radius 10',()=>{
 near(maxRadius({x:100,y:0},{x:0,y:0},{x:0,y:20}),10);
 const rectangle=square.map(s=>({...s,y:s.y===100?20:s.y}));
 const built=buildCorners(rectangle,eligibleCorners(rectangle).map(c=>({contour:0,index:c.index,r:100,type:'round'})));
 assert.ok(built.corners.every(c=>c.r<=10+1e-6));
});
test('One isolated corner can use the full edge with neighbor consumption deducted',()=>{
 near(maxRadius({x:100,y:0},{x:0,y:0},{x:0,y:20},{prev:0,next:5}),15);
});
test('Zero radius returns the unchanged base segments',()=>{
 assert.deepEqual(applyCorners(square,eligibleCorners(square).map(c=>({contour:0,index:c.index,r:0,type:'round'}))),square);
});
test('All four rounded corners rebuild from base rather than accumulate edits',()=>{
 const corners=eligibleCorners(square).map(c=>({contour:0,index:c.index,r:10,type:'round'}));
 const d=serializeSegments(applyCorners(square,corners));
 assert.equal((d.match(/C/g)||[]).length,4);assert.equal(d,serializeSegments(applyCorners(square,corners)));assert.equal(square[1].x,100);
});
test('Mixed straight and curved segments only expose eligible corners',()=>{
 const b=square.map(s=>({...s}));b[2]={type:6,x1:100,y1:30,x2:100,y2:70,x:100,y:100};
 assert.deepEqual(eligibleCorners(b).map(c=>c.index),[0,3]);
});
test('Open polyline only exposes interior corners',()=>{
 assert.deepEqual(eligibleCorners(square.slice(0,4)).map(c=>c.index),[1,2]);
});
test('Reflex corner widget points into the filled contour',()=>{
 const base=[{type:2,x:0,y:0},{type:4,x:50,y:40},{type:4,x:100,y:0},{type:4,x:100,y:100},{type:4,x:0,y:100},{type:1}];
 assert.ok(eligibleCorners(base).find(c=>c.index===1).basis.bisector.y>0);
});
test('Corner metadata round trips and detects roundness lost on a changed d',()=>{
 const data={base:'M0 0L10 0L10 10Z',gen:'M0 0L9 0C10 0 10 1 10 2Z',corners:[{contour:0,index:1,r:1,type:'round'}]};
 assert.deepEqual(parseCornerData(serializeCornerData(data)),data);assert.ok(cornerDataIsCurrent(data,data.gen));assert.equal(cornerDataIsCurrent(data,data.base),false);
});
test('Malformed corner metadata is ignored safely',()=>{
 for(const d of ['bad','{}','null',JSON.stringify({base:'x',gen:'x',corners:[{index:0,contour:0,r:-1,type:'round'}]})])assert.equal(parseCornerData(d),null);
});
test('Degenerate and collinear geometry has no corner radius',()=>{
 assert.equal(cornerGeometry({x:0,y:0},{x:0,y:0},{x:10,y:10},4),null);assert.equal(maxRadius({x:-10,y:0},{x:0,y:0},{x:10,y:0}),0);
});
test('Widgets, preference, history, numeric radius and export are wired',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
 const ui=read('../js/visteras-corner-widgets.js'),ds=read('../js/visteras-direct-selection.js');
 assert.ok(ds.includes('visteras-live-corners')&&ds.includes('cornerDataIsCurrent'));
 assert.ok(ui.includes('Hide Corner Widget')&&ui.includes('Show Corner Widget')&&ui.includes('new BatchCommand'));
 assert.ok(ui.includes('bindNumericField')&&ui.includes('Relative (Later)'));
 assert.ok(read('../../../scripts/check-no-doc-localstorage.mjs').includes('STORAGE_KEY_CORNER_WIDGET'));
 assert.ok(read('../js/visteras-export.js').includes("removeAttribute('data-visteras-corners')"));
});
