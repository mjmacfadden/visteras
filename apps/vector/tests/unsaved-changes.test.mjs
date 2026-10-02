import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  hasAnyDirty, handleBeforeUnload, confirmCloseIfDirty, showUnsavedChangesDialog,
} from '../js/visteras-unsaved-changes.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function unloadEvent() {
  return { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
}

test('unsaved: beforeunload only prompts when some tab is dirty', () => {
  const clean = [{ dirty: false }, { dirty: false }];
  const e1 = unloadEvent();
  assert.equal(handleBeforeUnload(e1, clean), undefined);
  assert.equal(e1.prevented, false);
  assert.equal(e1.returnValue, undefined);

  const mixed = [{ dirty: false }, { dirty: true }];
  const e2 = unloadEvent();
  assert.equal(handleBeforeUnload(e2, mixed), '');
  assert.equal(e2.prevented, true);
  assert.equal(e2.returnValue, '');

  // Saving clears dirty → no prompt.
  mixed[1].dirty = false;
  assert.equal(hasAnyDirty(mixed), false);
  assert.equal(hasAnyDirty([]), false);
  assert.equal(hasAnyDirty(null), false);
});

test('unsaved: closing a clean tab never asks; a dirty tab asks with its title', async () => {
  const asked = [];
  const ask = async (t) => { asked.push(t); return false; };
  assert.equal(await confirmCloseIfDirty({ title: 'Clean', dirty: false }, ask), true);
  assert.deepEqual(asked, []);
  assert.equal(await confirmCloseIfDirty({ title: 'Poster', dirty: true }, ask), false);
  assert.deepEqual(asked, ['Poster']);
  assert.equal(await confirmCloseIfDirty({ title: 'Poster', dirty: true }, async () => true), true);
  assert.equal(await confirmCloseIfDirty(null, ask), true);
});

test('unsaved dialog: Vector uses the shared @visteras/ui dialog with its orange accent', () => {
  // Behaviour (wording, Cancel focus, Enter/Escape/backdrop) is covered by packages/ui tests.
  assert.equal(typeof showUnsavedChangesDialog, 'function');
  const mod = read('../js/visteras-unsaved-changes.js');
  assert.match(mod, /import \{ showUnsavedChangesDialog \} from '\.\.\/lib\/visteras-ui\/dialog\.js';/);
  assert.ok(!/vector_unsaved_/.test(mod), 'local dialog copy removed');
  assert.ok(!/vector_unsaved_/.test(read('../css/visteras-document-shell.css')), 'local dialog CSS removed');
  assert.match(read('../css/visteras-theme.css'), /--visteras-accent: var\(--studio-orange\);/);
  assert.match(read('../index.html'), /href="\.\/lib\/visteras-ui\/ui\.css\?v=ui-1"/);
  assert.match(read('../lib/visteras-ui/dialog.js'), /title: 'Unsaved Changes'/);
});

test('unsaved: shell and index.html wiring', () => {
  const shell = read('../js/visteras-document-shell.js');
  assert.match(shell, /async function closeDocument\(id\)[\s\S]{0,400}confirmCloseIfDirty\(doc\)/);
  assert.ok(!/window\.confirm\(/.test(shell), 'no native confirm for tab close');
  assert.match(shell, /addEventListener\('beforeunload', \(e\) => handleBeforeUnload\(e, state\.documents\)\)/);
  const html = read('../index.html');
  assert.match(html, /no_save_warning:\s*true/, "SVG-Edit's undo-stack leave warning is off");
  // Every .vvd save path clears the active tab's dirty flag.
  const saveFn = html.slice(html.indexOf('buildVvdJson'));
  assert.ok((saveFn.match(/clearActiveDirty\?\.\(\)/g) || []).length >= 3);
});
