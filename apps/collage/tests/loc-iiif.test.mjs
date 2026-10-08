import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIiifImageUrl,
  isLocIiifUrl,
  iiifInfoUrl,
  buildIiifUrl,
  chooseIiifSize,
  visibleRegionInPreview,
  scaleRegionToSource,
  regionToIiifPath,
  planLocPrintRequest,
  fetchLocPrintObjectUrl,
  createLocHiResCache,
  releaseLocHiResBlobs,
} from '../js/loc-iiif.js';

const SAMPLE =
  'https://tile.loc.gov/image-services/iiif/service:ndnp:nn:batch_nn_quarterman_ver03:data:sn83030431:00212474502:1920010401:0064/full/pct:12.5/0/default.jpg';

test('parseIiifImageUrl extracts base before /full/ and path parts', () => {
  const p = parseIiifImageUrl(SAMPLE);
  assert.ok(p);
  assert.equal(
    p.base,
    'https://tile.loc.gov/image-services/iiif/service:ndnp:nn:batch_nn_quarterman_ver03:data:sn83030431:00212474502:1920010401:0064'
  );
  assert.equal(p.region, 'full');
  assert.equal(p.size, 'pct:12.5');
  assert.equal(p.rotation, '0');
  assert.equal(p.quality, 'default');
  assert.equal(p.format, 'jpg');
});

test('parseIiifImageUrl returns null for non-IIIF URLs', () => {
  assert.equal(parseIiifImageUrl('https://cdn.pixabay.com/photo/1.jpg'), null);
  assert.equal(parseIiifImageUrl(''), null);
  assert.equal(parseIiifImageUrl(null), null);
});

test('isLocIiifUrl requires tile.loc.gov IIIF', () => {
  assert.equal(isLocIiifUrl(SAMPLE), true);
  assert.equal(isLocIiifUrl(SAMPLE.replace('tile.loc.gov', 'example.com')), false);
  assert.equal(isLocIiifUrl('https://tile.loc.gov/other/path.jpg'), false);
});

test('iiifInfoUrl and buildIiifUrl compose correctly', () => {
  const base = parseIiifImageUrl(SAMPLE).base;
  assert.equal(iiifInfoUrl(base), `${base}/info.json`);
  assert.equal(
    buildIiifUrl({ base, region: '10,20,30,40', size: ',1200' }),
    `${base}/10,20,30,40/,1200/0/default.jpg`
  );
});

test('chooseIiifSize caps to target and maxEdge without upscaling past source', () => {
  assert.equal(chooseIiifSize(5096, 6354, 900, 1200, { maxEdge: 4000 }), ',1200');
  assert.equal(chooseIiifSize(5096, 6354, 8000, 9000, { maxEdge: 4000 }), ',4000');
  assert.equal(chooseIiifSize(2000, 1000, 800, 400, { maxEdge: 4000 }), '800,');
  // Target larger than region → clamp to region
  assert.equal(chooseIiifSize(500, 800, 2000, 3000, { maxEdge: 4000 }), ',800');
});

test('visibleRegionInPreview + scaleRegionToSource map cover-fit crop to source', () => {
  // Portrait image in square tile: cover crops left/right in preview space
  const prev = visibleRegionInPreview({
    tileW: 200, tileH: 200, naturalW: 640, naturalH: 800, zoom: 1, panX: 0, panY: 0,
  });
  // Portrait cover in a square tile crops top/bottom → full width, partial height
  assert.equal(prev.w, 640);
  assert.ok(prev.h < 800);
  const src = scaleRegionToSource(prev, 640, 800, 5096, 6354);
  assert.ok(src.w > 0 && src.h > 0);
  assert.ok(src.x + src.w <= 5096);
  assert.ok(src.y + src.h <= 6354);
  assert.equal(regionToIiifPath(src), `${src.x},${src.y},${src.w},${src.h}`);
});

test('planLocPrintRequest upgrades LoC URL with size-capped full region', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).endsWith('info.json')) {
      return {
        ok: true,
        json: async () => ({ width: 5096, height: 6354, '@id': 'x' }),
      };
    }
    throw new Error('unexpected ' + url);
  };
  const cache = createLocHiResCache();
  const plan = await planLocPrintRequest({
    url: SAMPLE,
    tileW: 300,
    tileH: 400,
    naturalW: 640,
    naturalH: 800,
    zoom: 1,
    exportScale: 3,
    fetchImpl,
    cache,
  });
  assert.equal(plan.upgraded, true);
  assert.equal(plan.sourceWidth, 5096);
  assert.equal(plan.sourceHeight, 6354);
  assert.match(plan.size, /^,|^\d+,/);
  assert.ok(!plan.url.includes('/max'));
  assert.ok(plan.url.includes('/0/default.jpg'));
  assert.equal(calls.length, 1);
  // Cached info — second plan does not re-fetch
  await planLocPrintRequest({ url: SAMPLE, tileW: 300, tileH: 400, naturalW: 640, naturalH: 800, fetchImpl, cache, exportScale: 3 });
  assert.equal(calls.length, 1);
});

test('planLocPrintRequest leaves non-LoC URLs unchanged', async () => {
  const plan = await planLocPrintRequest({
    url: 'https://cdn.pixabay.com/photo/large.jpg',
    fetchImpl: async () => { throw new Error('should not fetch'); },
  });
  assert.equal(plan.upgraded, false);
  assert.equal(plan.url, 'https://cdn.pixabay.com/photo/large.jpg');
});

test('planLocPrintRequest falls through on info.json failure (throws)', async () => {
  await assert.rejects(
    () => planLocPrintRequest({
      url: SAMPLE,
      fetchImpl: async () => ({ ok: false, status: 500 }),
      timeoutMs: 1000,
    }),
    /HTTP 500/
  );
});

test('fetchLocPrintObjectUrl caches blob and releaseLocHiResBlobs revokes', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const fetchImpl = async () => ({
    ok: true,
    blob: async () => new Blob([bytes], { type: 'image/jpeg' }),
  });
  const cache = createLocHiResCache();
  // Polyfill URL.createObjectURL / revoke for node
  const urls = [];
  const origCreate = globalThis.URL.createObjectURL;
  const origRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = (b) => {
    const u = `blob:mock-${urls.length}`;
    urls.push(u);
    return u;
  };
  let revoked = 0;
  globalThis.URL.revokeObjectURL = () => { revoked++; };
  try {
    const plan = { upgraded: true, url: 'https://tile.loc.gov/x/full/,100/0/default.jpg' };
    const a = await fetchLocPrintObjectUrl(plan, { fetchImpl, cache });
    const b = await fetchLocPrintObjectUrl(plan, { fetchImpl, cache });
    assert.equal(a.objectUrl, b.objectUrl);
    assert.equal(urls.length, 1);
    assert.equal(releaseLocHiResBlobs(cache), 1);
    assert.equal(revoked, 1);
  } finally {
    if (origCreate) globalThis.URL.createObjectURL = origCreate;
    else delete globalThis.URL.createObjectURL;
    if (origRevoke) globalThis.URL.revokeObjectURL = origRevoke;
    else delete globalThis.URL.revokeObjectURL;
  }
});

test('fetchLocPrintObjectUrl aborts on timeout', async () => {
  const fetchImpl = (_url, opts) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve({ ok: true, blob: async () => new Blob() }), 5000);
    opts.signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
  await assert.rejects(
    () => fetchLocPrintObjectUrl(
      { upgraded: true, url: 'https://tile.loc.gov/x/full/,100/0/default.jpg' },
      { fetchImpl, timeoutMs: 30, cache: createLocHiResCache() }
    ),
    (err) => err.name === 'AbortError' || /abort/i.test(String(err))
  );
});
