import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../js/visteras-export-core.js';

const art = { x: 0, y: 0, width: 800, height: 600 };

test('Export core: scope rects (artboard / selection / full) with padding', () => {
  assert.deepEqual(X.scopeRect({ scope: 'artboard', artboard: art }), art);
  assert.deepEqual(X.scopeRect({ scope: 'artboard', artboard: art, padding: 10 }), { x: -10, y: -10, width: 820, height: 620 });
  const sel = { x: 92.5, y: 112.5, width: 215, height: 115 }; // outer-glow visual bounds
  assert.deepEqual(X.scopeRect({ scope: 'selection', artboard: art, selection: sel, padding: 4 }), { x: 88.5, y: 108.5, width: 223, height: 123 });
  assert.equal(X.scopeRect({ scope: 'selection', artboard: art, selection: null }), null);
  assert.deepEqual(X.scopeRect({ scope: 'full', artboard: art, full: { x: -50, y: 100, width: 100, height: 900 } }), { x: -50, y: 0, width: 850, height: 1000 });
  assert.deepEqual(X.scopeRect({ scope: 'full', artboard: art, full: null }), art);
});

test('Export core: pixel sizes per scale and ppi', () => {
  assert.deepEqual(X.pixelSize({ width: 100.4, height: 50.5 }, 1), { w: 100, h: 51 });
  assert.deepEqual(X.pixelSize({ width: 100, height: 50 }, 3), { w: 300, h: 150 });
  assert.deepEqual(X.pixelSize({ width: 0.1, height: 0.1 }, 1), { w: 1, h: 1 });
  assert.equal(X.scaleForPpi(300), 300 / 72);
  assert.equal(X.scaleForPpi(72), 1);
});

test('Export core: per-browser canvas limits and the max-scale message', () => {
  const ipad = X.canvasLimits('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5);
  const mac = X.canvasLimits('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130', 0);
  assert.equal(ipad.maxArea, 16777216);
  assert.equal(mac.maxArea, 268435456);
  assert.equal(mac.maxSide, 16384);
  const board = { x: 0, y: 0, width: 4000, height: 4000 };
  assert.equal(X.checkSize(16000, 16000, ipad), false);
  assert.equal(X.checkSize(4096, 4096, ipad), true);
  assert.equal(X.maxScaleFor(board, ipad), 1.02);
  assert.equal(X.maxScaleFor(board, mac), 4.09);
  assert.equal(X.tooLargeMessage(board, 4, ipad), 'Too large at 4× (16000×16000 px; max ≈ 1.02× for this browser)');
});

test('Export core: file names (prefix, suffix, selection, sub-folders, duplicates)', () => {
  assert.equal(X.exportFileName({ title: 'Logo.vvd', suffix: '@2x', ext: 'png' }), 'Logo@2x.png');
  assert.equal(X.exportFileName({ prefix: 'ic_', title: 'a/b:c', scope: 'selection', suffix: '', ext: 'jpg', subfolder: '1x' }), '1x/ic_a_b_c-selection.jpg');
  assert.equal(X.exportFileName({ title: '', ext: 'svg' }), 'Untitled.svg');
  assert.equal(X.subfolderFor({ scale: 2, format: 'png' }), '2x');
  assert.equal(X.subfolderFor({ scale: 0.5, format: 'jpg85' }), '0.5x');
  assert.equal(X.subfolderFor({ scale: 3, format: 'svg' }), 'SVG');
  assert.deepEqual(X.uniquePaths(['a.png', 'a.png', 'b.png', 'a.png']), ['a.png', 'a 2.png', 'b.png', 'a 3.png']);
  assert.equal(X.defaultSuffix(1), ''); assert.equal(X.defaultSuffix(2), '@2x'); assert.equal(X.defaultSuffix(1.5), '@1.5x');
  assert.deepEqual(X.formatInfo('jpg85'), { ext: 'jpg', mime: 'image/jpeg', raster: true, quality: 0.85, label: 'JPG 85%', opaque: true });
  assert.equal(X.jpegQuality(10), 1); assert.equal(X.jpegQuality(7), 0.7); assert.equal(X.jpegQuality('x'), 0.8);
});

test('Export core: PNG pHYs insertion parses back with a valid CRC', () => {
  // minimal PNG: signature + IHDR(1×1) + IEND (IDAT not needed for chunk tests)
  const chunk = (type, data) => { const body = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat([...data])); const len = data.length; const crc = X.crc32(body); return [len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body, crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255]; };
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0]), ...chunk('IEND', [])]);
  assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const out = X.insertPngPhys(png, 144);
  const phys = X.readPngPhys(out);
  assert.deepEqual({ ...phys }, { ppmX: 5669, ppmY: 5669, unit: 1, ppi: 143.99, crcOk: true });
  assert.equal(String.fromCharCode(...out.slice(37, 41)), 'pHYs', 'right after IHDR');
  const again = X.insertPngPhys(out, 300);
  assert.equal(again.length, out.length, 'replaces an existing pHYs');
  assert.equal(X.readPngPhys(again).ppmX, X.ppm(300));
  assert.deepEqual(X.pngSize(again), { w: 3, h: 2 });
});

test('Export core: store-only ZIP round trip (local headers, central directory, CRC)', () => {
  const files = [{ name: '1x/Logo.png', data: new Uint8Array([1, 2, 3, 250]) }, { name: 'SVG/Lögo.svg', data: '<svg/>' }];
  const zip = X.zipStore(files, new Date(2026, 9, 3, 8, 30, 10));
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const back = X.unzipStore(zip);
  assert.deepEqual(back.map((f) => f.name), ['1x/Logo.png', 'SVG/Lögo.svg']);
  assert.ok(back.every((f) => f.crcOk && f.method === 0));
  assert.deepEqual([...back[0].data], [1, 2, 3, 250]);
  assert.equal(new TextDecoder().decode(back[1].data), '<svg/>');
});

test('Export core: remembered settings defaults, migration and validation', () => {
  const d = X.normalizeSettings(null);
  assert.equal(d.scope, 'artboard'); assert.equal(d.background, 'transparent'); assert.equal(d.subfolders, true);
  assert.deepEqual(d.rows.map((r) => [r.scale, r.suffix, r.format]), [[1, '', 'png'], [2, '@2x', 'png'], [3, '@3x', 'png']]);
  const s = X.normalizeSettings(JSON.stringify({ v: 0, scope: 'selection', rows: [{ scale: 99, format: 'gif' }, null], background: 'pink', padding: -5, extra: 1, asPpi: 150 }));
  assert.equal(s.scope, 'selection'); assert.equal(s.background, 'transparent'); assert.equal(s.padding, 0); assert.equal(s.asPpi, 150);
  assert.deepEqual(s.rows, [{ scale: 10, suffix: '@10x', format: 'png' }]);
  assert.equal('extra' in s, false);
  assert.equal(X.normalizeSettings('{not json').prefix, '');
  assert.equal(X.SETTINGS_KEY, 'visteras-vector-export-settings');
  assert.deepEqual(X.normalizeRaster({ ppi: '300', background: 'transparent' }), { ppi: 300, background: 'transparent' });
  assert.deepEqual(X.normalizeRaster(null), { ppi: 72, background: 'white' });
  assert.equal(X.backgroundColor('transparent', { opaque: true }), '#ffffff', 'JPEG forced opaque');
  assert.equal(X.backgroundColor('transparent'), null);
  assert.equal(X.backgroundColor('artboard', { artboard: '#eeeeee' }), '#eeeeee');
  assert.equal(X.backgroundColor('other', { bgColor: '#12AB34' }), '#12ab34');
});

test('Export core: @font-face parse with unicode-range filtering', () => {
  const css = `/* latin-ext */
@font-face { font-family: 'Lobster'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/lobster/ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+1E00-1EFF; }
/* latin */
@font-face { font-family: 'Lobster'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/lobster/latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+02??; }
@font-face { font-family: 'Lobster'; font-style: italic; font-weight: 100 900; src: url(https://x/it.woff2) format('woff2'); }`;
  const faces = X.parseFontFaces(css);
  assert.equal(faces.length, 3);
  assert.deepEqual(faces[1].ranges, [[0, 255], [0x131, 0x131], [0x200, 0x2ff]]);
  assert.equal(faces[2].weightMax, 900);
  assert.deepEqual(X.pickFaces(faces, { text: 'Hello' }).map((f) => f.url), ['https://fonts.gstatic.com/s/lobster/latin.woff2']);
  assert.deepEqual(X.pickFaces(faces, { text: 'Łódź' }).map((f) => f.url).sort(), ['https://fonts.gstatic.com/s/lobster/ext.woff2', 'https://fonts.gstatic.com/s/lobster/latin.woff2']);
  assert.deepEqual(X.pickFaces(faces, { text: 'Hi', weight: 700, style: 'italic' }).map((f) => f.url), ['https://x/it.woff2']);
  assert.equal(X.firstFamily('"Open Sans", Arial, sans-serif'), 'Open Sans');
  assert.equal(X.googleCssUrl('Open Sans', { weight: 700, italic: true }), 'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@1,700&display=swap');
  assert.equal(X.bytesToBase64(new Uint8Array([104, 105])), 'aGk=');
  assert.match(X.fontFaceCss({ family: 'Lobster', base64: 'AA', ranges: [[0, 255]] }), /^@font-face\{font-family:"Lobster";font-style:normal;font-weight:400;src:url\(data:font\/woff2;base64,AA\) format\("woff2"\);unicode-range:U\+0-ff\}$/);
});
