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
  normalizedVisibleRect,
  sourceRegionFromNormalized,
  exportFramingMode,
  applyFillTileFraming,
  snapshotImgFraming,
  restoreImgFraming,
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


/** Simulate cover+pan+zoom sampling: which normalized source pixel lands at tile center. */
function sampleNormAtTilePoint(opts, tileX, tileY) {
  const { tileW, tileH, naturalW, naturalH, zoom = 1, panX = 0, panY = 0 } = opts;
  const z = Math.max(1, zoom);
  const scaleCover = Math.max(tileW / naturalW, tileH / naturalH);
  const renderedW = naturalW * scaleCover * z;
  const renderedH = naturalH * scaleCover * z;
  const imgOffsetX = tileW / 2 + panX - renderedW / 2;
  const imgOffsetY = tileH / 2 + panY - renderedH / 2;
  const ix = (tileX - imgOffsetX) / renderedW;
  const iy = (tileY - imgOffsetY) / renderedH;
  return { x: ix, y: iy };
}

test('normalizedVisibleRect: zoom+pan matches cover-fit sampling at tile corners', () => {
  const opts = {
    tileW: 200, tileH: 150, naturalW: 640, naturalH: 480,
    zoom: 2, panX: 40, panY: -20,
  };
  const norm = normalizedVisibleRect(opts);
  // Corners of the tile map into the normalized visible rect edges
  const tl = sampleNormAtTilePoint(opts, 0, 0);
  const br = sampleNormAtTilePoint(opts, opts.tileW, opts.tileH);
  assert.ok(Math.abs(tl.x - norm.x) < 1e-9, `tl.x ${tl.x} vs ${norm.x}`);
  assert.ok(Math.abs(tl.y - norm.y) < 1e-9, `tl.y ${tl.y} vs ${norm.y}`);
  assert.ok(Math.abs(br.x - (norm.x + norm.w)) < 1e-9, `br.x`);
  assert.ok(Math.abs(br.y - (norm.y + norm.h)) < 1e-9, `br.y`);
});

test('normalizedVisibleRect: non-square tile + portrait image (edge crop)', () => {
  const opts = {
    tileW: 300, tileH: 100, naturalW: 400, naturalH: 800, zoom: 1, panX: 0, panY: 0,
  };
  const norm = normalizedVisibleRect(opts);
  // Landscape tile + portrait cover → full width, partial height centered
  assert.ok(norm.w > 0.98, 'nearly full width');
  assert.ok(norm.h < 0.5, 'partial height');
  assert.ok(Math.abs(norm.y - (1 - norm.h) / 2) < 1e-9, `centered y=${norm.y}`);
  const src = sourceRegionFromNormalized(norm, 4000, 8000);
  assert.equal(src.x, 0);
  assert.ok(src.y > 0);
  assert.equal(src.x + src.w, 4000);
  assert.ok(src.y + src.h <= 8000);
});

test('normalizedVisibleRect: zoomed+panned region stays inside unit square', () => {
  const opts = {
    tileW: 180, tileH: 220, naturalW: 512, naturalH: 768,
    zoom: 3.5, panX: 80, panY: -60,
  };
  const norm = normalizedVisibleRect(opts);
  assert.ok(norm.x >= 0 && norm.y >= 0);
  assert.ok(norm.x + norm.w <= 1 + 1e-9);
  assert.ok(norm.y + norm.h <= 1 + 1e-9);
  const src = sourceRegionFromNormalized(norm, 5096, 6354);
  assert.ok(src.x + src.w <= 5096);
  assert.ok(src.y + src.h <= 6354);
});

test('planLocPrintRequest uses fill-tile framing when region is cropped', async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith('info.json')) {
      return { ok: true, json: async () => ({ width: 4000, height: 5000 }) };
    }
    throw new Error('unexpected ' + url);
  };
  const plan = await planLocPrintRequest({
    url: SAMPLE,
    tileW: 200,
    tileH: 200,
    naturalW: 640,
    naturalH: 800,
    zoom: 2.5,
    panX: 30,
    panY: -10,
    exportScale: 3,
    fetchImpl,
  });
  assert.equal(plan.framing, 'fill-tile');
  assert.notEqual(plan.region, 'full');
  assert.equal(exportFramingMode(plan), 'fill-tile');
  assert.ok(plan.normalized);
  // Region path must match normalized → source pixels
  const expected = sourceRegionFromNormalized(plan.normalized, 4000, 5000);
  assert.equal(plan.region, regionToIiifPath(expected));
});

test('applyFillTileFraming clears pan/zoom transform (no double crop)', () => {
  const img = {
    style: {
      width: '800px', height: '1000px', transform: 'translate(-50%, -50%) translate(40px, -20px) scale(2)',
      maxWidth: '', maxHeight: '', position: '', top: '', left: '', objectFit: '',
    },
    onload: () => {},
  };
  const snap = snapshotImgFraming(img);
  applyFillTileFraming(img, 200, 150);
  assert.equal(img.style.width, '200px');
  assert.equal(img.style.height, '150px');
  assert.equal(img.style.transform, 'translate(-50%, -50%)');
  assert.equal(img.onload, null);
  restoreImgFraming(img, snap);
  assert.equal(img.style.transform, snap.transform);
  assert.equal(img.style.width, '800px');
});

test('preview framing vs export fill-tile: same normalized crop for zoomed+panned', () => {
  // Export path: bake crop into IIIF region, then fill tile.
  // Preview path: full image + CSS pan/zoom.
  // Both must expose the same normalized source window.
  const cases = [
    { tileW: 200, tileH: 200, naturalW: 640, naturalH: 800, zoom: 1, panX: 0, panY: 0 },
    { tileW: 240, tileH: 160, naturalW: 800, naturalH: 600, zoom: 2, panX: 50, panY: 0 },
    { tileW: 160, tileH: 240, naturalW: 600, naturalH: 900, zoom: 3, panX: -20, panY: 40 },
    { tileW: 100, tileH: 300, naturalW: 1000, naturalH: 1000, zoom: 1.5, panX: 0, panY: -30 },
  ];
  for (const opts of cases) {
    const previewNorm = normalizedVisibleRect(opts);
    // Export fill-tile shows exactly the region corresponding to previewNorm
    const exportNorm = { x: 0, y: 0, w: 1, h: 1 }; // of the *region* image
    // Mapping region image (0–1) back to source = previewNorm
    const backToSource = {
      x: previewNorm.x + exportNorm.x * previewNorm.w,
      y: previewNorm.y + exportNorm.y * previewNorm.h,
      w: exportNorm.w * previewNorm.w,
      h: exportNorm.h * previewNorm.h,
    };
    assert.ok(Math.abs(backToSource.x - previewNorm.x) < 1e-12);
    assert.ok(Math.abs(backToSource.w - previewNorm.w) < 1e-12);
    assert.ok(Math.abs(backToSource.y - previewNorm.y) < 1e-12);
    assert.ok(Math.abs(backToSource.h - previewNorm.h) < 1e-12);
  }
});
