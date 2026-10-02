import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scanSource, classify, isExcluded, ALLOWLIST, KNOWN_DOCUMENT_STORES } from './check-no-doc-localstorage.mjs';

test('storage check: flags new writes, aliases and assignments; allows listed preference keys', () => {
  const src = [
    "localStorage.setItem('visteras_eraser_radius', '4');",
    "localStorage.setItem('my_board', JSON.stringify(doc));",
    "const s = window.localStorage; s.setItem(KEY, svg);",
    "sessionStorage.setItem('x', 1);",
    "localStorage['doc'] = json;",
    "localStorage.lastDoc = json;",
    "if (localStorage.length === 0) {}"
  ].join('\n');
  const hits = scanSource('apps/vector/js/visteras-eraser.js', src);
  assert.deepEqual(hits.map((h) => [h.line, classify(h)]), [
    [1, 'allowed'], [2, 'violation'], [3, 'violation'], [4, 'violation'], [5, 'violation'], [6, 'violation']
  ]);
  // Same key in a different file is not allowed
  assert.equal(classify({ file: 'apps/inspire/js/app.js', key: "'visteras_eraser_radius'", kind: 'setItem' }), 'violation');
});

test('storage check: exclusions cover vendored/built code but not app sources', () => {
  for (const f of ['apps/vector/lib/paper-core.min.js', 'apps/studio/node_modules/x/index.js', 'apps/studio/dist/bundle.js',
    'apps/studio/src/js/libs/hokusai/engine.js', 'apps/inspire/tests/inspire.test.mjs']) assert.ok(isExcluded(f), f);
  for (const f of ['apps/publish/src/lib/settings.ts', 'apps/vector/Editor.js', 'apps/inspire/js/app.js']) assert.ok(!isExcluded(f), f);
});

test('storage check: Inspire stays storage-free and lists have no overlap', () => {
  for (const f of fs.readdirSync('apps/inspire/js')) {
    assert.equal(scanSource(f, fs.readFileSync(`apps/inspire/js/${f}`, 'utf8')).length, 0, f);
  }
  const allowKeys = new Set(ALLOWLIST.map((e) => `${e.file}|${e.key}`));
  for (const e of KNOWN_DOCUMENT_STORES) assert.ok(!allowKeys.has(`${e.file}|${e.key}`), 'a document store must never also be allowlisted');
});
