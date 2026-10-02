import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { showToast, showConfirmDialog, showUnsavedChangesDialog, escapeHtml } from '../src/index.js';
import { fakeDom, clickAction } from './fake-dom.mjs';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const dialogOf = (doc) => doc.body.children.find((c) => c.classList.contains('vui-dialog'));
const overlayOf = (doc) => doc.body.children.find((c) => c.classList.contains('vui-overlay'));

test('toast: alertify-compatible markup, type fallback, auto + click dismiss', () => {
  const doc = fakeDom();
  const timers = [];
  const env = { doc, raf: (fn) => fn(), setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} };
  const el = showToast('Saved "A.vid"', 'success', 1500, env);
  const notifier = doc.getElementById('visteras_notifier');
  assert.ok(notifier, 'notifier created once');
  assert.equal(notifier.className, 'alertify-notifier ajs-top ajs-center');
  assert.equal(el.className, 'ajs-message ajs-success ajs-visible');
  assert.equal(el.textContent, 'Saved "A.vid"', 'text, never HTML');
  assert.equal(timers[0].ms, 1500);

  const el2 = showToast('x', 'bogus', 0, env);
  assert.ok(el2.classList.contains('ajs-info'), 'unknown type → info');
  assert.equal(timers.length, 1, 'duration 0 → sticky');
  assert.equal(doc.getElementById('visteras_notifier'), notifier, 'notifier reused');
  assert.equal(notifier.children.length, 2);

  timers[0].fn(); // auto-dismiss
  assert.ok(!el.classList.contains('ajs-visible'));
  timers.at(-1).fn(); // removal after fade
  assert.equal(notifier.children.length, 1);
  el2.fire('click'); // click dismiss
  timers.at(-1).fn();
  assert.equal(notifier.children.length, 0);
  assert.equal(showToast('no dom', 'info', 1, { doc: null }), null);
});

test('dialog: Unsaved Changes wording, escaping, Cancel focused by default', async () => {
  const doc = fakeDom();
  const p = showUnsavedChangesDialog('A <b>&', doc);
  const d = dialogOf(doc);
  assert.ok(d && overlayOf(doc), 'overlay + dialog mounted');
  assert.ok(d.classList.contains('vui-unsaved-dialog'));
  assert.equal(d.getAttribute('role'), 'alertdialog');
  assert.match(d.innerHTML, /<span class="vui-dialog-title">Unsaved Changes<\/span>/);
  assert.match(d.innerHTML, /Close <b>A &lt;b&gt;&amp;<\/b>\? Unsaved changes will be lost\./);
  assert.match(d.innerHTML, /data-action="cancel">Cancel</);
  assert.match(d.innerHTML, /data-action="confirm">Close</);
  assert.equal(doc.activeElement?.dataset?.action, 'cancel');
  doc.key('Enter');
  assert.equal(await p, false, 'Enter on focused Cancel keeps the document');
  assert.equal(doc.body.children.length, 0, 'cleaned up');
  assert.equal(doc.keyListeners(), 0, 'key listener removed');
});

test('dialog: confirm / Escape / backdrop / × and other keys', async () => {
  let doc = fakeDom();
  let p = showUnsavedChangesDialog('Poster', doc);
  dialogOf(doc).fire('click', clickAction('confirm'));
  assert.equal(await p, true, 'Close button confirms');

  doc = fakeDom();
  p = showUnsavedChangesDialog('Poster', doc);
  const ev = doc.key('Delete');
  assert.ok(ev.stopped, 'app shortcuts do not reach the editor behind the dialog');
  assert.equal(doc.body.children.length, 2, 'still open');
  doc.key('Escape');
  assert.equal(await p, false);

  doc = fakeDom();
  p = showUnsavedChangesDialog('Poster', doc);
  overlayOf(doc).fire('click', {});
  assert.equal(await p, false, 'backdrop cancels');

  doc = fakeDom();
  p = showConfirmDialog({ title: 'Replace?', message: '<i>plain</i>', confirmLabel: 'Replace', defaultFocus: 'confirm', doc });
  const d = dialogOf(doc);
  assert.match(d.innerHTML, /&lt;i&gt;plain&lt;\/i&gt;/, 'message is escaped');
  assert.equal(doc.activeElement?.dataset?.action, 'confirm');
  doc.key('Enter');
  assert.equal(await p, true);
  assert.equal(await showConfirmDialog({ title: 'x', doc: null }), true, 'no DOM → allow');
  assert.equal(escapeHtml(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
});

test('ui.css: accent only via app CSS variables, never a hardcoded accent', () => {
  const css = read('../src/ui.css');
  assert.match(css, /background-color: var\(--visteras-accent\);/);
  assert.doesNotMatch(css, /--visteras-accent\s*:/, 'the kit must not define the accent');
  for (const hex of ['#fa7c1b', '#f59e0b', '#a855f7', '#14b8a6', '#2a6bb5', '#2f6fae']) {
    assert.ok(!css.toLowerCase().includes(hex), `no app accent ${hex} in the kit`);
  }
});
