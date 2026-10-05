import test from 'node:test';
import assert from 'node:assert/strict';
import { snapToArtboard } from '../js/visteras-artboard-snap.js';
const board = { x:20, y:30, width:100, height:80 };
const identity = { a:1,b:0,c:0,d:1,e:0,f:0 };
test('each finite edge attracts nearby anchors without changing the free axis', () => {
  for (const [pointer, expected] of [
    [{x:23,y:70},{x:20,y:70}], [{x:117,y:70},{x:120,y:70}],
    [{x:60,y:34},{x:60,y:30}], [{x:60,y:106},{x:60,y:110}],
  ]) assert.deepEqual(snapToArtboard(pointer,board,identity).contentPt, expected);
  assert.equal(snapToArtboard({x:60,y:70},board,identity),null);
  assert.equal(snapToArtboard({x:20,y:130},board,identity),null);
});
test('corners capture both coordinates', () => {
  assert.deepEqual(snapToArtboard({x:24,y:34},board,identity).contentPt,{x:20,y:30});
});
test('magnetic radius stays eight screen pixels under zoom and pan', () => {
  const matrix = {a:2,b:0,c:0,d:2,e:100,f:50};
  assert.deepEqual(snapToArtboard({x:147,y:190},board,matrix).contentPt,{x:20,y:70});
  assert.equal(snapToArtboard({x:149,y:190},board,matrix),null);
});
test('rotated coordinate systems project onto the actual visible edge', () => {
  const matrix = {a:0,b:2,c:-2,d:0,e:300,f:100};
  assert.deepEqual(snapToArtboard({x:160,y:146},board,matrix).contentPt,{x:20,y:70});
});
