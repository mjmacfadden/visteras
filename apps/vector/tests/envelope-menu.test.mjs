import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENVELOPE_COMMANDS, WARP_CHORD, canMakeEnvelope } from '../js/visteras-envelope.js';
import { eventMatchesChord, formatBrowserSafeShortcut, isBrowserReservedChord } from '../js/visteras-browser-shortcuts.js';
const source = readFileSync(new URL('../js/visteras-envelope.js', import.meta.url), 'utf8');
test('AT1 Envelope Distort commands and platform shortcut labels', () => {
  assert.deepEqual(ENVELOPE_COMMANDS.map(x => x[1]), ['Make with Warp…','Make with Mesh…','Make with Top Object','Release','Envelope Options…','Expand','Edit Contents']);
  for (const mac of [true, false]) {
    const spec = {...WARP_CHORD, mac};
    assert.equal(isBrowserReservedChord(spec), false);
    assert.equal(formatBrowserSafeShortcut(spec), mac ? '⌥⇧⌘W' : 'Ctrl+Alt+Shift+W');
    assert.equal(eventMatchesChord({code:'KeyW', metaKey:mac, ctrlKey:!mac, altKey:true, shiftKey:true},spec),true);
    assert.equal(eventMatchesChord({code:'KeyW', metaKey:mac, ctrlKey:!mac, altKey:false, shiftKey:true},spec),false);
  }
  assert.match(source, /shortcut.textContent = formatBrowserSafeShortcut\(WARP_CHORD\)/);
  assert.match(source, /e.preventDefault\(\); e.stopImmediatePropagation\(\); openWarp\(\);\s*}, true\)/);
  assert.match(source, /__visterasIsTypingDirectly/);
  assert.match(source, /isContentEditable/);
  assert.match(source, /item.title = 'Coming later'/);
  const shell = readFileSync(new URL('../js/visteras-document-shell.js', import.meta.url),'utf8');
  assert.match(shell, /if \(!isCmdOrCtrl \|\| e.altKey\) return/);
});
test('Envelope module imports safely and mounts with versioned URL next to Expand', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url),'utf8');
  assert.match(html,/import \{ mountEnvelope \} from '.\/js\/visteras-envelope.js\?v=[^']+'/);
  assert.match(html,/mountExpand\(svgEditor\);\s*mountEnvelope\(svgEditor\)/);
});
test('Envelope Make excludes unsupported, hidden and existing envelopes', () => {
  const element = (localName, attr=null, blocked=false) => ({localName,getAttribute:key=>key==='data-visteras-envelope'?attr:key==='display'&&blocked?'none':null});
  assert.equal(canMakeEnvelope([]),false);
  assert.equal(canMakeEnvelope([element('rect'),element('text')]),true);
  assert.equal(canMakeEnvelope([element('g','warp')]),false);
  assert.equal(canMakeEnvelope([element('rect',null,true)]),false);
  assert.equal(canMakeEnvelope([element('use')]),false);
});
test('H3 Edit ▸ Select All uses the canvas Select All (selectAllElements does not exist on SVG-Edit 7)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /getElementById\('action_select_all'\)\?\.addEventListener\('click', \(\) => \{[\s\S]{0,260}sc\.selectAllInCurrentLayer\?\.\(\)/);
});
