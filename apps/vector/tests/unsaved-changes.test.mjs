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
  assert.match(read('../index.html'), /href="\.\/lib\/visteras-ui\/ui\.css\?v=ui-\d+"/);
  assert.match(read('../lib/visteras-ui/dialog.js'), /title: 'Unsaved Changes'/);
});

test('unsaved: shell and index.html wiring', () => {
  const shell = read('../js/visteras-document-shell.js');
  assert.match(shell, /async function closeDocument\(id\)[\s\S]{0,400}confirmCloseIfDirty\(doc\)/);
  assert.ok(!/window\.confirm\(/.test(shell), 'no native confirm for tab close');
  assert.match(shell, /addEventListener\('beforeunload', \(e\) => handleBeforeUnload\(e, state\.documents\)\)/);
  const html = read('../index.html');
  assert.match(html, /no_save_warning:\s*true/, "SVG-Edit's undo-stack leave warning is off");
  // Every .vvd save path (handle, picker, download) ends in the one saveFile result
  // handler, which clears the active tab's dirty flag.
  const saveFn = html.slice(html.indexOf('async function saveVectorDoc'), html.indexOf("getElementById('action_save')"));
  assert.match(saveFn, /const result = await saveFile\(\{[\s\S]*?if \(result\.cancelled\) return;[\s\S]*?shell\?\.clearActiveDirty\?\.\(\);/);
});

test('open/save: .vvd goes through the shared file helper with the FileHandle kept on the tab', () => {
  const html = read('../index.html');
  assert.match(html, /import \{ openFile, saveFile, safeFileName, fileBaseFromName, findBySameHandle \} from '\.\/lib\/visteras-ui\/file\.js/);
  assert.match(html, /const opened = await openFile\(\{\s*types: VVD_OPEN_TYPES,/);
  assert.match(html, /const handle = \/\\\.vvd\$\/i\.test\(opened\.name \|\| ''\) \? opened\.handle : null;/, 'only .vvd handles are kept');
  assert.match(html, /openVectorFile\(opened\.file, handle\);/);
  assert.match(html, /handle: forceSaveAs \? null : \(activeDoc\?\.fileHandle \|\| null\),/, 'Save reuses the handle; Save As always asks');
  assert.match(html, /activeDoc\.fileHandle = result\.handle \|\| null;/);
  assert.match(html, /showStudioToast\(`Saved "/);
  assert.ok(!/window\.showSaveFilePicker\(|window\.showOpenFilePicker\(/.test(html), 'no direct picker calls left');
  const shell = read('../js/visteras-document-shell.js');
  assert.match(shell, /getDocuments: \(\) => state\.documents\.slice\(\),/);
  assert.match(shell, /targetDoc\.fileHandle = fileHandle \|\| null;/);
});
