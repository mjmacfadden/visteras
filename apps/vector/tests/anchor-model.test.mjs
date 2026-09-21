import test from 'node:test';
import assert from 'node:assert/strict';
import { anchors, moveAnchors, deleteAnchors, serializeSegments, moveControl, convertAnchors } from '../js/visteras-anchor-model.js';
const M=(x,y)=>({type:2,x,y}), L=(x,y)=>({type:4,x,y}), Z=()=>({type:1});
const rectangle=[M(10,20),L(50,20),L(50,60),L(10,60),L(10,20),Z()];
test('closed contour has one logical anchor for its initial and closing endpoints',()=>{
  const points=anchors(rectangle);
  assert.equal(points.length,4);
  assert.deepEqual(points[0],{index:0,aliases:[0,4],incoming:4,outgoing:1});
  const moved=moveAnchors(rectangle,new Set([0]),3,7);
  assert.deepEqual(moved[0],M(13,27));
  assert.deepEqual(moved[4],L(13,27));
  assert.deepEqual(moved[1],rectangle[1]);
  assert.deepEqual(rectangle[0],M(10,20));
});
test('compound contours keep separate closing aliases',()=>{
  const data=[...rectangle,...rectangle.map(s=>s.x===undefined?s:{...s,x:s.x+100})];
  assert.equal(anchors(data).length,8);
  const moved=moveAnchors(data,new Set([0,6]),5,0);
  assert.equal(moved[4].x,15);assert.equal(moved[10].x,115);
});
test('moving anchors carries attached cubic handles without moving the opposite handle',()=>{
  const data=[M(0,0),{type:6,x1:10,y1:0,x2:20,y2:20,x:30,y:30},{type:6,x1:40,y1:40,x2:50,y2:50,x:60,y:60}];
  const moved=moveAnchors(data,new Set([1]),5,7);
  assert.deepEqual(moved[1],{type:6,x1:10,y1:0,x2:25,y2:27,x:35,y:37});
  assert.deepEqual(moved[2],{type:6,x1:45,y1:47,x2:50,y2:50,x:60,y:60});
});
test('shared quadratic control is translated only once when both endpoints move',()=>{
  const data=[M(0,0),{type:8,x1:10,y1:20,x:30,y:40}];
  const moved=moveAnchors(data,new Set([0,1]),5,7);
  assert.equal(moved[1].x1,15);assert.equal(moved[1].y1,27);
});
test('delete closing anchor preserves a valid closed contour',()=>{
  const remaining=deleteAnchors(rectangle,new Set([0]));
  assert.deepEqual(remaining,[M(50,20),L(50,60),L(10,60),L(50,20),Z()]);
  assert.equal(anchors(remaining).length,3);
});
test('deleting one subpath preserves independent contours and deleting all empties the path',()=>{
  const data=[...rectangle,M(80,90),L(100,110)];
  assert.deepEqual(deleteAnchors(data,new Set([0,1,2,3])),[M(80,90),L(100,110)]);
  assert.deepEqual(deleteAnchors(rectangle,new Set([0,1,2,3])),[]);
});
test('serialization preserves cubic direction handles and closed contours',()=>{
  assert.equal(serializeSegments([M(0,0),{type:6,x1:1,y1:2,x2:3,y2:4,x:5,y:6},Z()]),'M0 0 C1 2 3 4 5 6 Z');
});

test('smooth direction handles stay tangent while retaining their independent lengths',()=>{
  const data=[M(0,0),{type:6,x1:0,y1:10,x2:10,y2:20,x:20,y:20},{type:6,x1:30,y1:20,x2:40,y2:30,x:50,y:30}];
  const moved=moveControl(data,1,1,'2',0,10);
  assert.equal(moved[1].x2,10);assert.equal(moved[1].y2,30);
  assert.ok(Math.abs(moved[2].x1-(20+Math.sqrt(50)))<1e-9);
  assert.ok(Math.abs(moved[2].y1-(20-Math.sqrt(50)))<1e-9);
  const unlinked=moveControl(data,1,1,'2',0,10,true);
  assert.equal(unlinked[2].x1,30);assert.equal(unlinked[2].y1,20);
});
test('corner direction handles remain independent',()=>{
  const data=[M(0,0),{type:6,x1:0,y1:10,x2:10,y2:20,x:20,y:20},{type:6,x1:20,y1:30,x2:40,y2:30,x:50,y:30}];
  const moved=moveControl(data,1,1,'2',0,10);
  assert.deepEqual(moved[2],data[2]);
});
test('Alt/Option control movement preserves and permanently unlinks the opposite handle',()=>{
  const data=[M(0,0),{type:6,x1:8,y1:0,x2:22,y2:0,x:30,y:0},{type:6,x1:38,y1:0,x2:48,y2:0,x:60,y:0}];
  const unlinked=moveControl(data,1,1,'2',0,10,true);
  assert.equal(unlinked[1].x2,22); assert.equal(unlinked[1].y2,10);
  assert.equal(unlinked[2].x1,38); assert.equal(unlinked[2].y1,0);
  const movedAgain=moveControl(unlinked,1,1,'2',0,10,false);
  assert.equal(movedAgain[2].x1,38); assert.equal(movedAgain[2].y1,0);
});
test('converting a selected line anchor to smooth creates tangent handles',()=>{
  const data=[M(0,0),L(30,0),L(30,30)];
  const smooth=convertAnchors(data,new Set([1]),'smooth');
  assert.equal(smooth[1].type,6);
  assert.ok(smooth[1].x2 < 30 && smooth[2].y1 > 0);
  assert.ok(smooth[1].y2 < 0); assert.ok(smooth[2].x1 > 30);
});
test('converting a selected cubic anchor to corner removes its direction handles',()=>{
  const data=[M(0,0),{type:6,x1:8,y1:0,x2:22,y2:4,x:30,y:0},L(30,30)];
  const corner=convertAnchors(data,new Set([1]),'corner');
  assert.equal(corner[1].type,6);
  assert.equal(corner[1].x2,30); assert.equal(corner[1].y2,0);
  assert.equal(corner[1].x1,8); assert.equal(corner[1].y1,0);
});
test('converting adjacent anchors preserves both sides of shared segments',()=>{
  const data=[M(0,0),L(30,0),L(60,0)];
  const smooth=convertAnchors(data,new Set([1,2]),'smooth');
  assert.equal(smooth[1].type,6); assert.equal(smooth[2].type,6);
  assert.notEqual(smooth[1].x2,smooth[1].x);
  assert.notEqual(smooth[2].x1,smooth[2].x);
});
