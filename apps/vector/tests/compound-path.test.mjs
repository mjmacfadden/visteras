import test from 'node:test';
import assert from 'node:assert/strict';
import { countSubpaths, splitSubpaths, canMakeCompound, canReleaseCompound } from '../js/visteras-compound-path.js';

test('countSubpaths / splitSubpaths', () => {
  assert.equal(countSubpaths('M0 0 H10 V10 Z'), 1);
  assert.equal(countSubpaths('M0 0 H10 Z M5 5 H8 Z'), 2);
  assert.deepEqual(splitSubpaths('M0 0 L10 0 Z M1 1 L2 2 Z'), ['M0 0 L10 0 Z', 'M1 1 L2 2 Z']);
});

test('canMakeCompound requires 2+ shapes', () => {
  assert.equal(canMakeCompound([{ tagName: 'rect' }]), false);
  assert.equal(canMakeCompound([{ tagName: 'rect' }, { tagName: 'circle' }]), true);
  assert.equal(canMakeCompound([{ tagName: 'rect' }, { tagName: 'text' }]), false);
});

test('canReleaseCompound requires multi-subpath path', () => {
  assert.equal(canReleaseCompound([{ tagName: 'path', getAttribute: () => 'M0 0 Z M1 1 Z' }]), true);
  assert.equal(canReleaseCompound([{ tagName: 'path', getAttribute: () => 'M0 0 Z' }]), false);
  assert.equal(canReleaseCompound([{ tagName: 'rect', getAttribute: () => null }]), false);
});
