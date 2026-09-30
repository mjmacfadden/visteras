/**
 * Tests for visteras-shape-builder.js — pure geometry helper (getRegionsFromItems).
 * DOM-dependent functions (overlay, mount, toolbar) are not testable in Node.
 *
 * getRegionsFromItems requires a Paper.js PaperScope. We mock the Paper.js API
 * surface to test input validation and basic paths through the function.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Paper.js mock ────────────────────────────────────────────────────────────
class MockPathItem {
  constructor(d) {
    this._d = d || 'M0,0 Z';
    this.strokeWidth = 0;
  }
  clone() { return new MockPathItem(this._d); }
  unite(other) { return new MockPathItem('M0,0 L10,0 L10,10 Z'); }
  subtract(other) { return new MockPathItem('M1,1 Z'); }
  divide(other) { return new MockPathItem('M2,2 Z'); }
  exportSVG({ asString } = {}) {
    const d = this._d;
    return {
      tagName: 'path',
      getAttribute(a) { return a === 'd' ? d : null; },
      querySelectorAll() { return []; },
    };
  }
}

class MockShape {
  toPath(insert) { return new MockPathItem('M5,5 Z'); }
}

class MockGroup {
  constructor(children) { this.children = children; }
}

function makeMockScope(importResults) {
  let callIdx = 0;
  const scope = {
    PathItem: MockPathItem,
    Shape: MockShape,
    Group: MockGroup,
    project: {
      _results: Array.isArray(importResults) ? importResults : [importResults],
      importSVG(el) {
        const r = this._results[callIdx % this._results.length];
        callIdx++;
        if (r === 'throw') throw new Error('import failed');
        return r;
      },
      clear() {},
    },
  };
  return scope;
}

function makePathEl(d = 'M0,0 L10,0 L10,10 Z') {
  return {
    tagName: 'path',
    nodeName: 'path',
    getAttribute(a) { return a === 'd' ? d : null; },
  };
}

const { getRegionsFromItems } = await import('../js/visteras-shape-builder.js');

// ─── Tests ────────────────────────────────────────────────────────────────────
test('getRegionsFromItems — returns empty array for empty input', () => {
  const scope = makeMockScope(new MockPathItem('M0,0 Z'));
  const result = getRegionsFromItems(scope, []);
  assert.deepEqual(result, []);
});

test('getRegionsFromItems — returns regions for a single PathItem', () => {
  const scope = makeMockScope(new MockPathItem('M0,0 L10,0 L10,10 Z'));
  const result = getRegionsFromItems(scope, [makePathEl()]);
  assert.ok(Array.isArray(result), 'should return an array');
  assert.ok(result.length > 0, 'should return at least one region');
  assert.ok(result[0].d.length > 0, 'region should have path data');
});

test('getRegionsFromItems — converts Shape to PathItem', () => {
  const scope = makeMockScope(new MockShape());
  const result = getRegionsFromItems(scope, [makePathEl()]);
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0, 'Shape should produce at least one region');
});

test('getRegionsFromItems — handles Group with PathItem children', () => {
  const children = [new MockPathItem('M0,0 Z'), new MockPathItem('M5,5 Z')];
  const group = new MockGroup(children);
  const scope = makeMockScope(group);
  const result = getRegionsFromItems(scope, [makePathEl()]);
  assert.ok(Array.isArray(result));
});

test('getRegionsFromItems — gracefully skips failed imports', () => {
  // First import throws, second succeeds
  const scope = makeMockScope(['throw', new MockPathItem('M3,3 Z')]);
  const result = getRegionsFromItems(scope, [makePathEl(), makePathEl('M5,5 Z')]);
  assert.ok(Array.isArray(result), 'should return array even when some imports fail');
});

test('getRegionsFromItems — handles two overlapping PathItems', () => {
  const items = [new MockPathItem('M0,0 L10,0 L10,10 Z'), new MockPathItem('M5,0 L15,0 L15,10 Z')];
  const scope = makeMockScope(items);
  const result = getRegionsFromItems(scope, [makePathEl(), makePathEl('M5,0 Z')]);
  assert.ok(Array.isArray(result), 'should handle two items');
});

test('getRegionsFromItems — empty Group produces no regions', () => {
  const scope = makeMockScope(new MockGroup([]));
  const result = getRegionsFromItems(scope, [makePathEl()]);
  assert.ok(Array.isArray(result), 'should return array');
  // Empty group = no path item = no regions
  assert.equal(result.length, 0);
});
