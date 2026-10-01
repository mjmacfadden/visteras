import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../js/visteras-path-text-bounds.js',import.meta.url),'utf8');
const {unionBounds,transformBounds}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('Upper and lower arc bounds use the complete path extents',()=>{
 assert.deepEqual(unionBounds([{x:0,y:0,width:600,height:300},{x:0,y:300,width:600,height:300}]),{x:0,y:0,width:600,height:600});
});
test('Group coordinates include translated and reversed path transforms',()=>{
 assert.deepEqual(transformBounds({x:0,y:0,width:600,height:300},{a:-1,b:0,c:0,d:1,e:650,f:25}),{x:50,y:25,width:600,height:300});
});
test('Native recalc preserves path text transforms instead of remapping text x/y',()=>{
 const source=fs.readFileSync(new URL('../Editor.js',import.meta.url),'utf8');
 assert.match(source,/e.tagName === "text" && e.querySelector\("textPath"\)/);
});
