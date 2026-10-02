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

function fakeDom() {
  const body = { children: [], appendChild(el) { this.children.push(el); el.parent = this; } };
  const docListeners = {};
  const doc = {
    body,
    activeElement: null,
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); },
    createElement() {
      const listeners = {};
      const el = {
        className: '', attrs: {}, innerHTML: '',
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        fire(type, evt) { (listeners[type] || []).forEach((fn) => fn(evt)); },
        remove() { body.children = body.children.filter((c) => c !== el); },
        querySelector(sel) {
          if (sel === '.vector_unsaved_btn_cancel') {
            return { dataset: { action: 'cancel' }, focus() { doc.activeElement = this; } };
          }
          return null;
        },
      };
      return el;
    },
    key(key) {
      const evt = { key, preventDefault() {}, stopPropagation() {} };
      (docListeners.keydown || []).forEach((fn) => fn(evt));
    },
    listenerCount: () => (docListeners.keydown || []).length,
  };
  return doc;
}

const clickAction = (action) => ({ target: { closest: () => ({ dataset: { action } }) } });

test('unsaved dialog: Studio wording, Cancel focused, Close/Cancel/Escape resolve and clean up', async () => {
  let doc = fakeDom();
  let p = showUnsavedChangesDialog('A <b>&', doc);
  const modal = doc.body.children.find((c) => c.className === 'vector_unsaved_dialog');
  assert.ok(modal, 'dialog mounted');
  assert.match(modal.innerHTML, /Unsaved Changes/);
  assert.match(modal.innerHTML, /Close <b>A &lt;b&gt;&amp;<\/b>\? Unsaved changes will be lost\./);
  assert.match(modal.innerHTML, />Cancel</);
  assert.match(modal.innerHTML, />Close</);
  assert.equal(doc.activeElement?.dataset?.action, 'cancel', 'Cancel is the default focus');
  doc.key('Enter'); // Enter on focused Cancel → keep the tab
  assert.equal(await p, false);
  assert.equal(doc.body.children.length, 0, 'overlay + dialog removed');
  assert.equal(doc.listenerCount(), 0, 'key listener removed');

  doc = fakeDom();
  p = showUnsavedChangesDialog('Poster', doc);
  doc.body.children.find((c) => c.className === 'vector_unsaved_dialog').fire('click', clickAction('close'));
  assert.equal(await p, true);

  doc = fakeDom();
  p = showUnsavedChangesDialog('Poster', doc);
  doc.key('Escape');
  assert.equal(await p, false);

  doc = fakeDom();
  p = showUnsavedChangesDialog('Poster', doc);
  doc.body.children.find((c) => c.className === 'vector_unsaved_overlay').fire('click', {});
  assert.equal(await p, false, 'backdrop click cancels');
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
