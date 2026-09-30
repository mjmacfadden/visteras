import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampEraserRadius,
  isEraserTarget,
  copyPresentation,
  decomposeToIslands,
} from '../js/visteras-eraser.js';

test('clampEraserRadius clamps values within allowed [2, 200] range', () => {
  assert.equal(clampEraserRadius(16), 16);
  assert.equal(clampEraserRadius(0), 2);
  assert.equal(clampEraserRadius(-10), 2);
  assert.equal(clampEraserRadius(1), 2);
  assert.equal(clampEraserRadius(2), 2);
  assert.equal(clampEraserRadius(200), 200);
  assert.equal(clampEraserRadius(350), 200);
  assert.equal(clampEraserRadius(24.4), 24);
});

test('isEraserTarget accepts vector elements and rejects non-renderable nodes', () => {
  const makeElem = (tag, parentTag = 'g') => {
    const parent = { nodeName: parentTag, tagName: parentTag, parentNode: true, closest: () => null };
    return {
      nodeName: tag,
      tagName: tag,
      parentNode: parent,
      closest: (sel) => (sel.includes(parentTag) ? parent : null),
    };
  };

  assert.equal(isEraserTarget(makeElem('path')), true, 'Paths must be valid eraser targets');
  assert.equal(isEraserTarget(makeElem('rect')), true, 'Rectangles must be valid eraser targets');
  assert.equal(isEraserTarget(makeElem('circle')), true, 'Circles must be valid eraser targets');
  assert.equal(isEraserTarget(makeElem('polygon')), true, 'Polygons must be valid eraser targets');

  // Should reject defs / clipPath / mask
  assert.equal(isEraserTarget(makeElem('path', 'clipPath')), false, 'ClipPath children must not be erased');
  assert.equal(isEraserTarget(makeElem('path', 'defs')), false, 'Defs children must not be erased');
  assert.equal(isEraserTarget(makeElem('g')), false, 'Group containers themselves must not be direct targets');
  assert.equal(isEraserTarget(null), false, 'Null must return false');
});

test('copyPresentation preserves visual styles and filters while omitting geometry/ID', () => {
  const fromEl = {
    attributes: [
      { name: 'id', value: 'svg_42' },
      { name: 'd', value: 'M 0 0 L 10 10' },
      { name: 'x', value: '10' },
      { name: 'y', value: '20' },
      { name: 'fill', value: '#fa7c1b' },
      { name: 'stroke', value: '#111111' },
      { name: 'stroke-width', value: '3' },
      { name: 'opacity', value: '0.85' },
      { name: 'filter', value: 'url(#drop-shadow)' },
    ],
  };

  const toAttrs = {};
  const toEl = {
    setAttributeNS: (_ns, name, val) => {
      toAttrs[name] = val;
    },
  };

  copyPresentation(fromEl, toEl);

  assert.equal(toAttrs.id, undefined, 'ID must not be copied');
  assert.equal(toAttrs.d, undefined, 'd must not be copied');
  assert.equal(toAttrs.x, undefined, 'x must not be copied');
  assert.equal(toAttrs.fill, '#fa7c1b');
  assert.equal(toAttrs.stroke, '#111111');
  assert.equal(toAttrs['stroke-width'], '3');
  assert.equal(toAttrs.opacity, '0.85');
  assert.equal(toAttrs.filter, 'url(#drop-shadow)');
});

test('decomposeToIslands returns single path directly', () => {
  const mockScope = {
    Path: class {},
    CompoundPath: class {},
  };
  const mockPath = new mockScope.Path();
  const islands = decomposeToIslands(mockScope, mockPath);
  assert.equal(islands.length, 1);
  assert.equal(islands[0], mockPath);
});

test('decomposeToIslands correctly separates two disjoint outer paths from CompoundPath', () => {
  class MockCompoundPath {
    constructor(props) {
      this.children = props?.children || [];
      this.bounds = { area: 100 };
    }
  }
  class MockPath {
    constructor(area, center) {
      this.bounds = { area, center };
      this.interiorPoint = center;
    }
    contains(pt) {
      // Circle at (10, 10) of radius 5, circle at (50, 50) of radius 5
      const dist = Math.hypot(pt.x - this.bounds.center.x, pt.y - this.bounds.center.y);
      return dist < 5;
    }
  }

  const mockScope = {
    Path: MockPath,
    CompoundPath: MockCompoundPath,
  };

  // Two independent halves of an apple at (10, 10) and (50, 50)
  const piece1 = new MockPath(100, { x: 10, y: 10 });
  const piece2 = new MockPath(100, { x: 50, y: 50 });
  const compound = new MockCompoundPath({ children: [piece1, piece2] });

  const islands = decomposeToIslands(mockScope, compound);
  assert.equal(islands.length, 2, 'Should separate into 2 independent islands');
  assert.ok(islands.includes(piece1));
  assert.ok(islands.includes(piece2));
});
