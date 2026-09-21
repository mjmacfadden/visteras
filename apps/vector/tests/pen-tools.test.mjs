import test from 'node:test';
import assert from 'node:assert/strict';
import { hitSegment,splitSegment,evaluateSegment,cutAnchors } from '../js/visteras-pen-geometry.js';
import {deleteAnchors} from '../js/visteras-anchor-model.js';
const M=(x,y)=>({type:2,x,y}),L=(x,y)=>({type:4,x,y});
const rect=[M(0,0),L(100,0),L(100,100),L(0,100),L(0,0),{type:1}];
test('hit-testing ignores interiors and endpoints and finds clicked segment',()=>{
 assert.equal(hitSegment(rect,{x:50,y:50},p=>p),null);
 assert.equal(hitSegment(rect,{x:0,y:0},p=>p),null);
 const h=hitSegment(rect,{x:27,y:100},p=>p);assert.equal(h.index,3);assert.ok(Math.abs(h.t-.73)<1e-6);
});
test('cubic insertion preserves every sampled point of the original curve',()=>{
 const p=M(0,0),s={type:6,x1:40,y1:120,x2:110,y2:-70,x:160,y:0},t=.37;
 const a=splitSegment([p,s],1,t);
 for(let i=0;i<=100;i++){const u=i/100,expected=evaluateSegment(p,s,u),actual=u<=t?evaluateSegment(a[0],a[1],u/t):evaluateSegment(a[1],a[2],(u-t)/(1-t));assert.ok(Math.hypot(expected.x-actual.x,expected.y-actual.y)<1e-9);}
 const target=evaluateSegment(p,s,t),transform=p=>({x:2*p.x+30,y:3*p.y-20});
 const hit=hitSegment([p,s],transform(target),transform);assert.ok(Math.abs(hit.t-t)<1e-6);
});
test('deletion tool preserves closure, Direct Selection cuts incident edges',()=>{
 assert.equal(deleteAnchors(rect,new Set([1])).at(-1).type,1);
 assert.deepEqual(cutAnchors(rect,new Set([1])),[M(100,100),L(0,100),L(0,0)]);
 assert.deepEqual(cutAnchors(rect,new Set([0])),[M(100,0),L(100,100),L(0,100)]);
});
test('Direct Selection deletion preserves other compound contours',()=>{
 const other=rect.map(s=>s.x===undefined?{...s}:{...s,x:s.x+200});
 const result=cutAnchors([...rect,...other],new Set([0]));
 assert.deepEqual(result.slice(3),other);
});

test('straight endpoint cubics insert without handles and delete to a triangle',async()=>{
 const {simplifyStraightSegments}=await import('../js/visteras-pen-geometry.js');
 const square=[M(0,0),{type:6,x1:0,y1:0,x2:100,y2:0,x:100,y:0},{type:6,x1:100,y1:0,x2:100,y2:100,x:100,y:100},{type:6,x1:100,y1:100,x2:0,y2:100,x:0,y:100},{type:6,x1:0,y1:100,x2:0,y2:0,x:0,y:0},{type:1}];
 const simple=simplifyStraightSegments(square);
 assert.deepEqual(simple,rect);
 assert.ok(splitSegment(simple,1,.3).every(s=>s.type!==6));
 for(const i of [0,1,2,3]){
  const triangle=deleteAnchors(simple,new Set([i]));
  assert.equal(triangle.at(-1).type,1);
  assert.equal(triangle.filter(s=>s.type===4).length,3);
  assert.ok(triangle.every(s=>s.type!==6));
 }
});
test('reversing an open cubic preserves its geometry for continuing from the first endpoint',async()=>{
 const {reverseOpenContour}=await import('../js/visteras-pen-geometry.js');
 const data=[M(0,0),{type:6,x1:10,y1:50,x2:70,y2:90,x:100,y:0}],rev=reverseOpenContour(data);
 for(let i=0;i<=20;i++){
  const a=evaluateSegment(data[0],data[1],i/20),b=evaluateSegment(rev[0],rev[1],1-i/20);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-9);
 }
});
