import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clearLegacySvgEditStorage, isLegacySvgEditKey } from '../js/visteras-legacy-storage.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

function cookieDoc(initial) {
  const jar = new Map(initial ? [[initial.split('=')[0], initial]] : []);
  const writes = [];
  return {
    writes,
    get cookie() { return [...jar.values()].join('; '); },
    set cookie(v) {
      writes.push(v);
      const [pair] = v.split(';');
      const name = pair.split('=')[0];
      if (/max-age=0/.test(v)) jar.delete(name); else jar.set(name, pair);
    },
  };
}

test('legacy storage: removes ext-storage content/title/prefs keys, keeps clipboard and visteras prefs', () => {
  const storage = memStorage({
    'svgedit-default': '<svg>…whole drawing…</svg>',
    'title-svgedit-default': 'Poster',
    'svg-edit-bkgd_color': '#fff',
    'svg-edit-lang': 'en',
    svgedit_clipboard: '[]',
    svgedit_clipboard_startup: '0.1',
    visteras_vector_base_unit: 'px',
    visteras_vector_active_doc_title: 'Poster',
  });
  const res = clearLegacySvgEditStorage({ storage, doc: null, loc: null });
  assert.deepEqual(res.removedKeys.sort(), ['svg-edit-bkgd_color', 'svg-edit-lang', 'svgedit-default', 'title-svgedit-default']);
  assert.deepEqual(storage.keys(), ['svgedit_clipboard', 'svgedit_clipboard_startup', 'visteras_vector_active_doc_title', 'visteras_vector_base_unit']);
  // Idempotent: a second load finds nothing.
  assert.deepEqual(clearLegacySvgEditStorage({ storage, doc: null, loc: null }).removedKeys, []);
});

test('legacy storage: expires the svgeditstore cookie on / and the page directory', () => {
  const doc = cookieDoc('svgeditstore=prefsAndContent');
  const res = clearLegacySvgEditStorage({ storage: null, doc, loc: { pathname: '/vector/index.html' } });
  assert.equal(res.cookieCleared, true);
  assert.ok(!/svgeditstore=prefsAndContent/.test(doc.cookie));
  assert.ok(doc.writes.some((w) => /path=\/;/.test(w)));
  assert.ok(doc.writes.some((w) => /path=\/vector\/;/.test(w)));
  assert.ok(doc.writes.every((w) => /max-age=0/.test(w)));
  // No cookie → no writes.
  const clean = cookieDoc(null);
  assert.equal(clearLegacySvgEditStorage({ storage: null, doc: clean, loc: null }).cookieCleared, false);
  assert.equal(clean.writes.length, 0);
});

test('legacy storage: key matcher and storage failures', () => {
  assert.equal(isLegacySvgEditKey('svgedit-default'), true);
  assert.equal(isLegacySvgEditKey('svgedit_clipboard'), false);
  assert.equal(isLegacySvgEditKey('visteras_vector_flyout_tools_rect'), false);
  const broken = { get length() { throw new Error('denied'); } };
  assert.deepEqual(clearLegacySvgEditStorage({ storage: broken, doc: null, loc: null }).removedKeys, []);
});

test('legacy storage: index.html no longer opts into ext-storage', () => {
  const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.ok(!/svgeditstore=prefsAndContent/.test(html), 'cookie opt-in removed');
  assert.ok(!/forceStorage/.test(html), 'forceStorage removed');
  assert.ok(/noDefaultExtensions:\s*true/.test(html));
  assert.ok(!/'ext-storage'|'ext-opensave'/.test(html.replace(/\/\/.*$/gm, '')), 'not in the extension list');
  assert.ok(/clearLegacySvgEditStorage\(\)/.test(html), 'cleanup runs on load');
});
