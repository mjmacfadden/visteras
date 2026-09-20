import test from 'node:test';
import assert from 'node:assert/strict';
import { closeEditableContours, normalizeEditablePath } from '../js/visteras-path-geometry.js';
const M = (x, y) => ({type: 'M', values: [x,y]});
const L = (x, y) => ({type: 'L', values: [x,y]});
const Z = () => ({type: 'Z', values: []});

test('boolean contours retain the closing anchor and are idempotent', () => {
  const input = [M(10,20),L(80,20),L(80,60),Z()];
  const expected = [M(10,20),L(80,20),L(80,60),L(10,20),Z()];
  assert.deepEqual(closeEditableContours(input), expected);
  assert.deepEqual(closeEditableContours(expected), expected);
  assert.equal(input.length, 4);
});
test('disjoint contours and holes each close at their own start', () => {
  assert.deepEqual(closeEditableContours([M(0,0),L(100,0),L(100,100),Z(),M(20,20),L(30,40),Z()]),
    [M(0,0),L(100,0),L(100,100),L(0,0),Z(),M(20,20),L(30,40),L(20,20),Z()]);
});
test('open paths stay open and closing curves keep their handles', () => {
  const curve = {type:'C',values:[20,30,40,50,10,20]};
  const open = [M(10,20),L(60,70)];
  assert.deepEqual(closeEditableContours(open), open);
  assert.deepEqual(closeEditableContours([M(10,20),curve,Z()]), [M(10,20),curve,Z()]);
});
test('native path API normalizes relative / shorthand commands before editing', () => {
  let result;
  normalizeEditablePath({getPathData(options) { assert.deepEqual(options,{normalize:true}); return [M(10,20),L(30,40),Z()]; },setPathData(data) {result=data;} });
  assert.deepEqual(result,[M(10,20),L(30,40),L(10,20),Z()]);
});
test('SVGPathSeg fallback closes all subpaths, even before a browser refresh', () => {
  let converted = false;
  const items = [{pathSegType:2,x:10,y:20},{pathSegType:4,x:30,y:40},{pathSegType:1},{pathSegType:2,x:50,y:60},{pathSegType:4,x:70,y:80},{pathSegType:1}];
  const element = {
    setAttribute(name,value) { assert.equal(name,'d');assert.equal(value,'absolute geometry'); converted=true; },
    get pathSegList() { assert.ok(converted);return {get numberOfItems(){return items.length;},getItem(i){return items[i];},insertItemBefore(item,i){items.splice(i,0,item);} }; },
    createSVGPathSegLinetoAbs(x,y){return {pathSegType:4,x,y};}
  };
  normalizeEditablePath(element, () => 'absolute geometry');
  assert.equal(items.length,8);
  assert.deepEqual(items[2],{pathSegType:4,x:10,y:20});
  assert.deepEqual(items[6],{pathSegType:4,x:50,y:60});
  normalizeEditablePath(element, () => 'absolute geometry');
  assert.equal(items.length,8);
});
