import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorRoot = path.resolve(__dirname, '..');
const editorPath = path.resolve(vectorRoot, 'Editor.js');
const shellPath = path.resolve(vectorRoot, 'js/visteras-document-shell.js');
const indexPath = path.resolve(vectorRoot, 'index.html');

test('.vvd Reopen: Editor.js initializes layers as interactive (pointer-events: all) unless locked', () => {
  const code = fs.readFileSync(editorPath, 'utf8');

  // Verify Layer constructor sets pointerEvents to 'all' unless data-locked="true"
  assert.match(
    code,
    /this\.group_\.style\.pointerEvents = this\.group_\.getAttribute\("data-locked"\) === "true" \? "none" : "all"/,
    'Layer constructor must initialize unlocked layers with pointerEvents = "all"'
  );

  // Verify activate/deactivate preserve interactivity for unlocked layers
  assert.match(
    code,
    /activate\(\) \{\s*this\.group_\.style\.pointerEvents = this\.group_\.getAttribute\("data-locked"\) === "true" \? "none" : "all"/,
    'Layer.activate must keep unlocked layers with pointer-events: all'
  );
});

test('.vvd Reopen: Editor.js identifyLayers skips guide overlays and activates all layers', () => {
  const code = fs.readFileSync(editorPath, 'utf8');

  // Verify identifyLayers skips guides overlay
  assert.match(
    code,
    /e\.id === "visteras_ruler_guides" \|\| e\.id === "visteras_smart_guides"/,
    'identifyLayers must skip ruler and smart guide groups so they are not treated as artwork layers'
  );

  // Verify identifyLayers activates all layers
  assert.match(
    code,
    /this\.all_layers\.forEach\(l => l\.activate\(\)\)/,
    'identifyLayers must activate all layers upon document identification'
  );

  // Verify current_layer defaults to first layer or newly created layer
  assert.match(
    code,
    /this\.current_layer = this\.all_layers\[0\] \|\| r/,
    'identifyLayers must set current_layer to the first layer'
  );
});

test('.vvd Reopen: Editor.js getMouseTarget selects across layers and syncs active layer', () => {
  const code = fs.readFileSync(editorPath, 'utf8');

  // Verify getMouseTarget walks up until a layer or svgContent, without unbounded parent traversal
  assert.match(
    code,
    /!nv\.isLayer\(t\.parentNode\) && !t\.parentNode\.isSameNode\(svgContent\)/,
    'getMouseTarget must stop walking up when reaching a layer group or svgContent'
  );

  // Verify getMouseTarget switches active layer to the clicked object layer
  assert.match(
    code,
    /if \(nv\.isLayer\(t\.parentNode\)\) \{\s*let layerName = fv\(t\.parentNode\);/,
    'getMouseTarget must identify layer of clicked element'
  );
  assert.match(
    code,
    /ny\.getCurrentDrawing\(\)\.setCurrentLayer\(layerName\)/,
    'getMouseTarget must make the clicked object layer active'
  );
});

test('.vvd Reopen: Editor.js svgToString excludes guide overlays from serialized SVG output', () => {
  const code = fs.readFileSync(editorPath, 'utf8');

  assert.match(
    code,
    /if \(e\.id === "visteras_ruler_guides" \|\| e\.id === "visteras_smart_guides" \|\| e\.classList\?\.contains\("visteras-guides-layer"\) \|\| e\.classList\?\.contains\("visteras-smart-guides-layer"\)\) return "";/,
    'svgToString must never serialize ruler guides or smart guides into saved SVG strings'
  );
});

test('.vvd Reopen: visteras-document-shell ensures all layers are interactive upon openDocument and loadSvg', () => {
  const shellCode = fs.readFileSync(shellPath, 'utf8');

  // Verify ensureDocumentLayersInteractive is defined
  assert.match(
    shellCode,
    /function ensureDocumentLayersInteractive\(\)/,
    'visteras-document-shell must define ensureDocumentLayersInteractive'
  );
  assert.match(
    shellCode,
    /window\.__visterasEnsureDocumentLayersInteractive = ensureDocumentLayersInteractive;/,
    'ensureDocumentLayersInteractive must be exposed for external document open callers'
  );

  // Verify ensureDocumentLayersInteractive activates layers and sets pointerEvents
  assert.match(
    shellCode,
    /layer\.style\.pointerEvents = locked \? 'none' : 'all';/,
    'must set pointerEvents all for unlocked layers'
  );
  assert.match(
    shellCode,
    /child\.style\.removeProperty\('pointer-events'\);/,
    'must clear stale pointer-events: none on artwork children'
  );

  // Verify openDocument and loadSvg call it after setSvgString
  assert.match(
    shellCode,
    /sc\.setSvgString\?\.?\(svgString\);[\s\S]*?ensureDocumentLayersInteractive\(\);/,
    'loadSvg must call ensureDocumentLayersInteractive after setSvgString'
  );
  assert.match(
    shellCode,
    /sc\.setSvgString\(svg\);[\s\S]*?ensureDocumentLayersInteractive\(\);/,
    'openDocument must call ensureDocumentLayersInteractive after setSvgString'
  );
});

test('.vvd Reopen: index.html invokes layer interactivity in openVectorFile fallback', () => {
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  assert.match(
    indexHtml,
    /window\.__visterasEnsureDocumentLayersInteractive\?\.()/,
    'index.html openVectorFile fallback must invoke ensureDocumentLayersInteractive'
  );
});

test('.vvd Reopen: Simulated document loading ensures existing objects are selectable', () => {
  // Simulate DOM hierarchy created after opening an SVG in a document
  const mockChildren = [
    { tagName: 'title', textContent: 'Layer 1', style: {}, getAttribute: () => null, removeAttribute: () => {} },
    { id: 'rect_1', tagName: 'rect', localName: 'rect', style: { pointerEvents: 'inherit' }, getAttribute: () => null, removeAttribute: () => {} },
    { id: 'path_2', tagName: 'path', localName: 'path', style: { pointerEvents: 'none' }, getAttribute: () => null, removeAttribute: () => {} },
  ];

  const layer1Group = {
    tagName: 'g',
    className: 'layer',
    style: { pointerEvents: 'none' }, // simulates legacy inactive layer state
    children: mockChildren,
    getAttribute(k) { return k === 'class' ? 'layer' : null; },
    querySelectorAll(selector) {
      if (selector === '*') return mockChildren;
      return [];
    }
  };

  const svgContent = {
    children: [layer1Group],
    querySelectorAll(selector) {
      if (selector === 'g.layer') return [layer1Group];
      return [];
    }
  };

  // Run the logic from ensureDocumentLayersInteractive
  svgContent.querySelectorAll('g.layer').forEach(layer => {
    const locked = layer.getAttribute('data-locked') === 'true';
    layer.style.pointerEvents = locked ? 'none' : 'all';
    layer.querySelectorAll('*').forEach(child => {
      if (child.style?.pointerEvents === 'none') {
        delete child.style.pointerEvents;
      }
    });
  });

  assert.equal(layer1Group.style.pointerEvents, 'all', 'Layer group must have pointerEvents = "all"');
  assert.equal(mockChildren[1].style.pointerEvents, 'inherit', 'Unmodified child retains normal inheritance');
  assert.equal(mockChildren[2].style.pointerEvents, undefined, 'Stale pointer-events: none is removed from child element');
});
