/**
 * Tests for visteras-offset-path.js — pure geometry helper (computeOffsetPath).
 * DOM-dependent functions (dialog, mount, menu) are not testable in Node.
 *
 * computeOffsetPath requires a Paper.js PaperScope instance. Since Paper.js
 * cannot run in Node, we test the function's input validation and edge cases
 * using a comprehensive mock of the Paper.js API.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Paper.js mock ───────────────────────────────────────────────────────────
// Minimal mock that mirrors the Paper.js API surface used by computeOffsetPath.
class MockPathItem {
  constructor(d) { this._d = d || 'M0,0'; this.strokeWidth = 0; this.strokeJoin = 'round'; this.miterLimit = 4; }
  clone() { return new MockPathItem(this._d); }
  unite(other) { return new MockPathItem('M0,0 Z'); }
  subtract(other) { return new MockPathItem('M1,1 Z'); }
  exportSVG({ asString } = {}) {
    const el = { tagName: 'path', getAttribute(a) { return a === 'd' ? this._d : null; }, _d: this._d };
    return el;
  }
}

class MockShape {
  toPath(insert) { return new MockPathItem('M5,5 Z'); }
}

class MockGroup {
  constructor(children) { this.children = children; }
}

class MockColor { constructor(...args) {} }

function makeMockScope(importResult) {
  const scope = {
    PathItem: MockPathItem,
    Shape: MockShape,
    Group: MockGroup,
    Color: MockColor,
    project: {
      _importResult: importResult,
      importSVG(el) {
        if (this._importResult === 'throw') throw new Error('import failed');
        return this._importResult;
      },
      clear() {},
    },
  };
  return scope;
}

// Build a minimal SVG element with a 'd' attribute
function makePathEl(d = 'M0,0 L10,10 Z') {
  return {
    tagName: 'path',
    nodeName: 'path',
    getAttribute(a) { return a === 'd' ? d : null; },
  };
}

const { computeOffsetPath } = await import('../js/visteras-offset-path.js');

// ─── Tests ─────────────────────────────────────────────────────────────────
test('computeOffsetPath — returns null for zero offset', () => {
  const scope = makeMockScope(new MockPathItem('M0,0 Z'));
  const result = computeOffsetPath(scope, makePathEl(), { offset: 0, joins: 'round', miterLimit: 4 });
  assert.equal(result, null);
});

test('computeOffsetPath — returns null for very small offset', () => {
  const scope = makeMockScope(new MockPathItem('M0,0 Z'));
  const result = computeOffsetPath(scope, makePathEl(), { offset: 0.0001, joins: 'round', miterLimit: 4 });
  assert.equal(result, null);
});

test('computeOffsetPath — returns geometry for positive offset from PathItem', () => {
  const scope = makeMockScope(new MockPathItem('M0,0 L10,10 Z'));
  const result = computeOffsetPath(scope, makePathEl(), { offset: 10, joins: 'round', miterLimit: 4 });
  // Mock always returns 'M0,0 Z' from unite
  assert.ok(result !== null, 'should return a result');
  assert.ok(result.d.length > 0, 'should have non-empty d attribute');
});

test('computeOffsetPath — returns geometry for negative offset (shrink)', () => {
  const scope = makeMockScope(new MockPathItem('M0,0 L10,10 Z'));
  const result = computeOffsetPath(scope, makePathEl(), { offset: -5, joins: 'round', miterLimit: 4 });
  // Mock subtract returns 'M1,1 Z'
  assert.ok(result !== null, 'should return a result for negative offset');
  assert.ok(result.d.length > 0, 'should have path data');
});

test('computeOffsetPath — handles Shape import gracefully', () => {
  const scope = makeMockScope(new MockShape());
  const result = computeOffsetPath(scope, makePathEl(), { offset: 5, joins: 'miter', miterLimit: 4 });
  assert.ok(result !== null, 'Shape should be converted to path item');
});

test('computeOffsetPath — returns null when importSVG throws', () => {
  const scope = makeMockScope('throw');
  const result = computeOffsetPath(scope, makePathEl(), { offset: 10, joins: 'round', miterLimit: 4 });
  assert.equal(result, null);
});

test('computeOffsetPath — returns null when Group has no children', () => {
  const scope = makeMockScope(new MockGroup([]));
  const result = computeOffsetPath(scope, makePathEl(), { offset: 10, joins: 'round', miterLimit: 4 });
  assert.equal(result, null);
});

test('computeOffsetPath — handles Group with PathItem children', () => {
  const children = [new MockPathItem('M0,0 Z'), new MockPathItem('M5,5 Z')];
  const scope = makeMockScope(new MockGroup(children));
  const result = computeOffsetPath(scope, makePathEl(), { offset: 10, joins: 'bevel', miterLimit: 4 });
  assert.ok(result !== null, 'Group with children should produce result');
});
