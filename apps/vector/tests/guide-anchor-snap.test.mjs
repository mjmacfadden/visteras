import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {segmentAnchors,transformAnchors,nearestGuideAnchor} from '../js/visteras-guide-anchor-snap.js';
import {GuideManager} from '../js/visteras-guides.js';
test('Guide targets are segment endpoints, never curve handles',()=>{
 assert.deepEqual(segmentAnchors([{type:2,x:10,y:20},{type:6,x1:80,y1:90,x2:100,y2:120,x:30,y:40},{type:1}]),[{x:10,y:20},{x:30,y:40}]);
});
test('Relative, horizontal, vertical and closed subpaths preserve anchor positions',()=>{
 assert.deepEqual(segmentAnchors([{type:2,x:10,y:20},{type:5,x:5,y:10},{type:13,x:4},{type:14,y:50},{type:1},{type:3,x:2,y:3}]),[{x:10,y:20},{x:15,y:30},{x:19,y:30},{x:19,y:50},{x:12,y:23}]);
});
test('Guide anchors include nested transforms in document coordinates',()=>{
 const anchors=transformAnchors([{x:10,y:20}],{a:0,b:2,c:-2,d:0,e:100,f:50});
 assert.deepEqual(anchors,[{x:60,y:70}]);
 assert.equal(nearestGuideAnchor({x:64,y:400},'v',anchors,8).x,60);
 assert.equal(nearestGuideAnchor({x:400,y:74},'h',anchors,8).y,70);
 assert.equal(nearestGuideAnchor({x:69,y:70},'v',anchors,8),null);
});
test('Guide drag uses zoom-aware snapping, preserves fractions and honors Smart Guides/Shift',()=>{
 const manager=new GuideManager({svgCanvas:{getZoom:()=>2}});
 manager.clientToSvg=(x,y)=>({x,y});manager.clearSmartGuides=()=>{};manager._createCrosshair=()=>null;
 const points=[{x:100.25,y:200.5}], event={clientX:103,clientY:203,shiftKey:false};
 assert.equal(manager._guideDragPosition('v',event,points),100.25);
 assert.equal(manager._guideDragPosition('h',event,points),200.5);
 assert.equal(manager._guideDragPosition('v',{...event,clientX:105},points),105);
 assert.equal(manager._guideDragPosition('v',{...event,shiftKey:true},points),100);
 manager.smartGuidesEnabled=false;assert.equal(manager._guideDragPosition('v',event,points),103);
});
test('Both new and existing ruler-guide drags snap previews and final placements',()=>{
 const source=fs.readFileSync(new URL('../js/visteras-guides.js',import.meta.url),'utf8');
 assert.equal((source.match(/const anchorTargets = this\._guideAnchorTargets\(\)/g)||[]).length,2);
 assert.equal((source.match(/this\._guideDragPosition\(isHorizontal/g)||[]).length,4);
 assert.ok(source.includes('rootMatrix.multiply'));
 assert.ok(source.includes("el.closest('defs,#canvasBackground,#visteras_ruler_guides,#visteras_smart_guides')"));
});
