import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GuideManager } from '../js/visteras-guides.js';
import { anchorGuideSnap } from '../js/visteras-anchor-snap.js';

function manager(zoom = 1) {
  const guides = new GuideManager({svgCanvas:{getZoom:()=>zoom,getResolution:()=>({w:800,h:600}),getSvgContent:()=>({querySelectorAll:()=>[]})}});
  guides._ensureLayers = () => {}; guides.clearSmartGuides = () => {};
  guides.drawSmartGuideLine = () => {}; guides._createCrosshair = () => null; guides._createLabel = () => null;
  guides.rulerGuides = [{type:'v',pos:123},{type:'h',pos:234}];
  return guides;
}
test('single dragged anchor snaps both coordinates to ruler guide intersection', () => {
  assert.deepEqual(anchorGuideSnap(manager(), {x:127,y:238}, []), {contentPt:{x:123,y:234}});
});
test('one guide changes only its axis, keeping the anchor offset on the other axis', () => {
  assert.deepEqual(anchorGuideSnap(manager(), {x:127,y:280}, []), {contentPt:{x:123,y:280}});
});
test('guide magnet radius stays eight screen pixels across zoom levels', () => {
  for (const zoom of [.5, 1, 2, 4]) {
    assert.equal(anchorGuideSnap(manager(zoom), {x:123 + 7/zoom,y:280}, []).contentPt.x, 123);
    assert.equal(anchorGuideSnap(manager(zoom), {x:123 + 9/zoom,y:280}, []), null);
  }
});
test('hidden guides and disabled Smart Guides do not attract anchors', () => {
  const guides = manager(); guides.showGuides = false;
  assert.equal(anchorGuideSnap(guides, {x:127,y:238}, []), null);
  guides.showGuides = true; guides.smartGuidesEnabled = false;
  assert.equal(anchorGuideSnap(guides, {x:127,y:238}, []), null);
});
test('Shift-constrained anchor movement snaps only the permitted axis', () => {
  assert.deepEqual(anchorGuideSnap(manager(), {x:127,y:238}, [], 'e'), {contentPt:{x:123,y:238}});
  assert.deepEqual(anchorGuideSnap(manager(), {x:127,y:238}, [], 'n'), {contentPt:{x:127,y:234}});
});
test('Direct Selection wires independent Smart Guides into its existing anchor gesture and cleanup', () => {
  const src = fs.readFileSync(new URL('../js/visteras-direct-selection.js',import.meta.url),'utf8');
  assert.match(src, /isSnapPointEnabled\(\) \|\| \(g.type === 'anchors' && guideManager\?\.smartGuidesEnabled\)/);
  assert.match(src, /anchorGuideSnap\(guideManager, proposedContent/);
  assert.match(src, /function finish\(cancel = false\) \{\s*window.__visterasGuideManager\?\.clearSmartGuides/);
});
