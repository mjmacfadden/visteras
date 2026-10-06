import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const locCode = source.slice(source.indexOf('  // --- Library of Congress newspaper page search'), source.indexOf('  // --- Tile Dimension'));
const generateCode = source.slice(source.indexOf('  let currentGenerationId'), source.indexOf('  // --- High-Resolution'));
test('new documents use Historic News while explicit saved searches remain intact', () => {
  const presets = source.slice(source.indexOf('  const THEME_PRESETS'), source.indexOf('  // --- State Management'));
  const model = source.slice(source.indexOf('  class CollageDocument'), source.indexOf('  const docManager'));
  const context = vm.createContext({ DEFAULT_FONT_FAMILY: 'Roboto' });
  vm.runInContext(`${presets}\n${model}\nthis.Doc = CollageDocument;`, context);
  const fresh = new context.Doc();
  assert.equal(fresh.searchQuery, 'newspaper headlines news');
  assert.equal(fresh.imageSource, 'loc');
  assert.deepEqual([...fresh.selectedColors], ['brown', 'grayscale', 'black']);
  const saved = new context.Doc({ searchQuery: '', imageSource: 'pixabay', selectedColors: [] });
  assert.equal(saved.searchQuery, '');
  assert.equal(saved.imageSource, 'pixabay');
  assert.equal(saved.selectedColors.length, 0);
});
function locHarness(fetch) {
  const timers = [];
  const cleared = [];
  const context = vm.createContext({ state: { apiCache: {}, items: [] }, fetch, URLSearchParams, AbortController,
    Image: class { set src(value) { this.onload?.(); } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => cleared.push(id) });
  vm.runInContext(locCode, context);
  return { search: context.fetchChroniclingAmericaImagesFast, next: context.nextPoolImage, state: context.state, timers, cleared };
}

test('LOC searches exact entered words at page level and maps supplied image sizes', async () => {
  let url;
  const h = locHarness(async request => {
    url = new URL(request);
      return { ok: true, json: async () => ({ results: [{ id: 'page-1', title: 'Birds', url: 'https://www.loc.gov/resource/sn123456/1900-01-01/ed-1/', image_url: ['https://example.org/small.jpg', 'https://example.org/medium.jpg#xywh=1', 'https://example.org/large.jpg'] }] }) };
  });
  const hits = await h.search('  birds & flowers  ');
  assert.equal(url.searchParams.get('qs'), 'birds & flowers');
  assert.equal(url.searchParams.get('dl'), 'page');
  assert.equal(url.searchParams.get('c'), '100');
  assert.equal(url.searchParams.get('q'), null);
  assert.equal(hits[0].path, 'https://example.org/medium.jpg');
  assert.equal(hits[0].largePath, 'https://example.org/large.jpg');
  assert.equal(hits[0].sourceKey, 'sn123456');
  assert.equal(h.timers[0].ms, 15000);
  assert.equal(h.cleared[0], 1);
});

test('background preload and Generate share one request and reuse its result', async () => {
  let resolve;
  let calls = 0;
  const h = locHarness(() => { calls++; return new Promise(done => { resolve = done; }); });
  const background = h.search('birds');
  const foreground = h.search('birds');
  resolve({ ok: true, json: async () => ({ results: [{ id: 'one', image_url: ['https://example.org/one.jpg'] }] }) });
  const hits = await background;
  assert.equal(await foreground, hits);
  assert.equal(await h.search('birds'), hits);
  assert.equal(calls, 1);
});

test('cycling consumes the pool before repeating', () => {
  const h = locHarness(() => {});
  const pool = [{ path: 'one.jpg' }, { path: 'two.jpg' }, { path: 'three.jpg' }];
  assert.deepEqual([h.next(pool).path, h.next(pool).path, h.next(pool).path, h.next(pool).path],
    ['one.jpg', 'two.jpg', 'three.jpg', 'one.jpg']);
});

test('visible assets cannot be selected again, even under a different preview URL', () => {
  const h = locHarness(() => {});
  h.state.items = [{ image: { id: 'one', path: 'one.jpg' } }];
  const pool = [{ id: 'one', path: 'one-larger.jpg' }, { id: 'two', path: 'two.jpg' }];
  const next = h.next(pool);
  assert.equal(next.id, 'two');
  h.state.items.push({ image: next });
  assert.equal(h.next(pool), null);
  assert.equal(h.next([{ id: 'alias', path: 'one.jpg' }]), null);
});

test('blank search does not silently insert vintage', async () => {
  const h = locHarness(async request => {
    assert.equal(new URL(request).searchParams.has('qs'), false);
    assert.equal(request.includes('vintage'), false);
    return { ok: true, json: async () => ({ results: [] }) };
  });
  assert.equal((await h.search('')).length, 0);
});

test('HTTP and timeout errors are not reported as empty results', async () => {
  const failed = locHarness(async () => ({ ok: false, status: 429 }));
  await assert.rejects(failed.search('birds'), /HTTP 429/);
  assert.deepEqual(failed.cleared, [1]);
  const timed = locHarness(async () => { throw Object.assign(new Error(), { name: 'AbortError' }); });
  await assert.rejects(timed.search('birds'), /timed out/);
  assert.deepEqual(timed.cleared, [1]);
});

test('LOC source labels may be arrays without breaking search', async () => {
  const h = locHarness(async () => ({ ok: true, json: async () => ({ results: [{
    id: 'page-1', title: ['Sunday Star'], image_url: ['https://example.org/page.jpg']
  }] }) }));
  const hits = await h.search('mountains');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sourceKey, 'sunday star');
});

function generationHarness(search) {
  const state = { searchQuery: 'vintage', selectedColors: [], apiCache: {} };
  const el = { queryInput: { value: 'birds' }, imageSourceSelect: { value: 'loc' },
    styleSelect: { value: 'all' }, editorsChoiceToggle: { checked: false },
    statusBarStatus: {}, container: { querySelectorAll: () => [] } };
  const context = vm.createContext({ state, el, initElements() {}, renderLoadingSkeletonTiles() {},
    renderTilesWithPool() {}, showToast() {}, console: { warn() {} },
    fetchChroniclingAmericaImagesFast: search });
  vm.runInContext(generateCode, context);
  return { state, el, generate: context.generateFodder };
}

test('all generation entry points read the live query instead of stale vintage state', async () => {
  const h = generationHarness(async query => { assert.equal(query, 'birds'); return []; });
  await h.generate();
  assert.equal(h.state.searchQuery, 'birds');
  assert.match(h.el.statusBarStatus.textContent, /No images found for "birds"/);
});

test('an old failed request cannot overwrite a newer successful search', async () => {
  let rejectOld;
  const h = generationHarness(query => query === 'birds'
    ? new Promise((resolve, reject) => { rejectOld = reject; })
    : Promise.resolve([{ id: 'new' }]));
  const old = h.generate();
  h.el.queryInput.value = 'flowers';
  await h.generate();
  rejectOld(new Error('Library of Congress search timed out.'));
  await old;
  assert.equal(h.state.onlinePool[0].id, 'new');
  assert.match(h.el.statusBarStatus.textContent, /Ready/);
});
