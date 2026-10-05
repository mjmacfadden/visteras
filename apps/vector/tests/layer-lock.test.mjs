import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workspace = fs.readFileSync(new URL('../js/visteras-workspace.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/visteras-theme.css', import.meta.url), 'utf8');

test('Layers panel exposes a per-object lock control and blocks locked canvas picking', () => {
  assert.match(workspace, /__visterasWorkspaceMounted/);
  assert.match(workspace, /data-visteras-locked/);
  assert.match(workspace, /className = 'vector-object-lock'/);
  assert.match(workspace, /lockIcon\.src = locked \? '\.\/images\/lock\.svg' : '\.\/images\/unlock\.svg'/);
  assert.doesNotMatch(workspace, /🔒|🔓/);
  assert.match(workspace, /Toggle object lock/);
  assert.match(workspace, /stopImmediatePropagation\(\)/);
  assert.match(workspace, /bind\?\.\('selected'/);
  assert.match(workspace, /filter\(element => !hasLockedAncestor\(element\)\)/);
  assert.match(workspace, /clearSelection\(\)/);
  assert.match(workspace, /pointer-events', 'none'/);
  assert.match(workspace, /data-visteras-pointer-events/);
  assert.match(css, /vector-object-lock\[aria-pressed="true"\] img/);
  assert.match(workspace, /if \(isLocked\(element\)\) return/);
  assert.match(css, /\.vector-object-lock/);
});
