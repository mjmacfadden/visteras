import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import ImageTracer from '../lib/imagetracer_v1.2.6.js';
import VTracer, { initVTracer, convertPixels } from '../lib/vtracer/vtracer.js';
import {
  optimizeContourSegments,
  optimizeTracedata,
  buildTraceOptions,
  pathSampleToD,
  tracedataToColorGroups,
  perpDist,
  rdp,
  parseVtracerSvg,
  transformSvgPathD,
  mapSettingsToVtracer,
  presetSettings,
  normalizeSettings,
  quantizeMedianCut,
  remapToPalette,
  snapToGrays,
  binarize,
  applyIgnoreWhite,
  snapCurvesToLines,
  groupPathsForExpand,
  traceStats,
  runTracePipeline,
  TRACE_PRESETS,
  computeDialogPosition,
  clampDialogPosition,
} from '../js/visteras-image-trace.js';

// Minimal zero-dependency PNG decoder for Node test runner
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error('Not a valid PNG file');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') break;
  }
  const idat = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(idat);
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bytesPerPixel;
  const out = new Uint8ClampedArray(width * height * 4);
  let srcPos = 0;
  const prevRow = new Uint8Array(stride);
  const currRow = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcPos++];
    for (let i = 0; i < stride; i++) {
      const raw = decompressed[srcPos++];
      const a = i >= bytesPerPixel ? currRow[i - bytesPerPixel] : 0;
      const b = prevRow[i];
      const c = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;
      let val = raw;
      if (filter === 1) val = (raw + a) & 0xff;
      else if (filter === 2) val = (raw + b) & 0xff;
      else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (raw + pr) & 0xff;
      }
      currRow[i] = val;
    }
    prevRow.set(currRow);
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      if (colorType === 6) {
        const a = currRow[x * 4 + 3];
        if (a < 128) {
          // Composite transparent pixels over white background (matching browser canvas behavior)
          out[dstIdx] = 255;
          out[dstIdx + 1] = 255;
          out[dstIdx + 2] = 255;
          out[dstIdx + 3] = 255;
        } else {
          out[dstIdx] = currRow[x * 4];
          out[dstIdx + 1] = currRow[x * 4 + 1];
          out[dstIdx + 2] = currRow[x * 4 + 2];
          out[dstIdx + 3] = 255;
        }
      } else if (colorType === 2) {
        out[dstIdx] = currRow[x * 3];
        out[dstIdx + 1] = currRow[x * 3 + 1];
        out[dstIdx + 2] = currRow[x * 3 + 2];
        out[dstIdx + 3] = 255;
      }
    }
  }
  return { width, height, data: out };
}

test('perpDist calculates accurate orthogonal point-to-segment distance', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  // Point on segment
  assert.equal(perpDist({ x: 5, y: 0 }, a, b), 0);

  // Perpendicular offset
  assert.equal(perpDist({ x: 5, y: 4 }, a, b), 4);

  // Clamped projection before start
  assert.equal(perpDist({ x: -3, y: 4 }, a, b), 5); // 3-4-5 triangle

  // Clamped projection after end
  assert.equal(perpDist({ x: 13, y: 4 }, a, b), 5);
});

test('rdp decimates collinear points within tolerance and preserves features', () => {
  // A straight horizontal run with subtle 0.2px wobble
  const straightRunWithNoise = [
    { x: 0, y: 10 },
    { x: 2, y: 10.15 },
    { x: 4, y: 9.85 },
    { x: 6, y: 10.1 },
    { x: 8, y: 9.9 },
    { x: 10, y: 10 },
  ];
  const simplified = rdp(straightRunWithNoise, 0.5);
  assert.equal(simplified.length, 2);
  assert.deepEqual(simplified[0], { x: 0, y: 10 });
  assert.deepEqual(simplified[1], { x: 10, y: 10 });

  // A polyline with a sharp corner
  const cornerPolyline = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 5 },
  ];
  const kept = rdp(cornerPolyline, 0.5);
  assert.equal(kept.length, 4);
});

test('optimizeContourSegments flattens near-straight quadratic splines into lines', () => {
  // A Q segment with negligible curve deviation (h/2 <= 0.4px)
  const flatQ = [
    { type: 'Q', x1: 0, y1: 0, x2: 5, y2: 0.4, x3: 10, y3: 0 },
    { type: 'L', x1: 10, y1: 0, x2: 10, y2: 10 },
    { type: 'L', x1: 10, y1: 10, x2: 0, y2: 0 },
  ];
  const opt = optimizeContourSegments(flatQ, 1.0);
  assert.equal(opt[0].type, 'L');
  assert.equal(opt[0].x1, 0);
  assert.equal(opt[0].y1, 0);
  assert.equal(opt[0].x2, 10);
  assert.equal(opt[0].y2, 0);

  // A genuine curved Q segment (cp is high above chord)
  const curvedQ = [
    { type: 'Q', x1: 0, y1: 0, x2: 5, y2: 15, x3: 10, y3: 0 },
    { type: 'L', x1: 10, y1: 0, x2: 0, y2: 0 },
    { type: 'L', x1: 0, y1: 0, x2: 0, y2: 0 },
  ];
  const keptCurved = optimizeContourSegments(curvedQ, 1.0);
  assert.equal(keptCurved[0].type, 'Q');
  assert.equal(keptCurved[0].x2, 5);
  assert.equal(keptCurved[0].y2, 15);
});

test('optimizeContourSegments preserves sharp corners while eliminating diagonal staircases', () => {
  // Diamond polygon with 4 sharp corners and 5 staircase nodes along each diagonal edge
  const pts = [];
  // Corner 0: (50, 0)
  pts.push({ x: 50, y: 0 });
  // Diagonal 1: (50, 0) to (100, 50) with staircase
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    pts.push({ x: 50 + 50 * t, y: 50 * t + (i % 2 === 0 ? 0.3 : -0.3) });
  }
  // Corner 1: (100, 50)
  pts.push({ x: 100, y: 50 });
  // Diagonal 2: (100, 50) to (50, 100) with staircase
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    pts.push({ x: 100 - 50 * t, y: 50 + 50 * t + (i % 2 === 0 ? 0.3 : -0.3) });
  }
  // Corner 2: (50, 100)
  pts.push({ x: 50, y: 100 });
  // Diagonal 3: (50, 100) to (0, 50) with staircase
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    pts.push({ x: 50 - 50 * t, y: 100 - 50 * t + (i % 2 === 0 ? 0.3 : -0.3) });
  }
  // Corner 3: (0, 50)
  pts.push({ x: 0, y: 50 });
  // Diagonal 4: (0, 50) to (50, 0) with staircase
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    pts.push({ x: 50 * t, y: 50 - 50 * t + (i % 2 === 0 ? 0.3 : -0.3) });
  }

  // Turn into segments
  const segs = [];
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    segs.push({ type: 'L', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
  }

  assert.equal(segs.length, 20); // 20 segments before optimization
  const optimized = optimizeContourSegments(segs, 0.8);
  assert.equal(optimized.length, 4, 'Should decimate exactly to the 4 diamond sides');

  // Verify the 4 corners are preserved
  const cornerCoords = [
    { x: 50, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 50 },
  ];
  for (const c of cornerCoords) {
    const matched = optimized.some(
      (s) => Math.hypot(s.x1 - c.x, s.y1 - c.y) < 1e-3 || Math.hypot(s.x2 - c.x, s.y2 - c.y) < 1e-3,
    );
    assert.ok(matched, `Corner (${c.x}, ${c.y}) should be preserved`);
  }
});

test('ImageTracer perpendicular distance fix stops diagonal over-segmentation', () => {
  // Rasterize a polygon with a steep 10° diagonal (slope 0.18)
  const w = 150;
  const h = 150;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const inPoly = x >= 10 && x <= 140 && y >= 20 + (x - 10) * 0.18 && y <= 100;
      const c = inPoly ? 0 : 255;
      data[idx] = c;
      data[idx + 1] = c;
      data[idx + 2] = c;
      data[idx + 3] = 255;
    }
  }

  const td = ImageTracer.imagedataToTracedata(
    { width: w, height: h, data },
    {
      numberofcolors: 2,
      ltres: 0.8,
      qtres: 0.8,
      pathomit: 8,
      colorsampling: 0,
    },
  );

  // Find the polygon path (not the bounding box of the whole image)
  let polygonPath = null;
  for (const layer of td.layers) {
    for (const p of layer) {
      if (p.segments.length > 0 && p.segments.length < 10) {
        polygonPath = p;
        break;
      }
    }
  }

  assert.ok(polygonPath, 'Should find the traced polygon');
  // Previously this generated 22 segments due to the index parameterization bug.
  // With perpendicular distance, it produces exactly 4 segments!
  assert.equal(polygonPath.segments.length, 4, 'Diagonal polygon should produce 4 segments, not 22');
});

test('pathSampleToD produces valid SVG path syntax with hole paths reversed', () => {
  const outer = {
    segments: [
      { type: 'L', x1: 0, y1: 0, x2: 100, y2: 0 },
      { type: 'L', x1: 100, y1: 0, x2: 100, y2: 100 },
      { type: 'L', x1: 100, y1: 100, x2: 0, y2: 100 },
      { type: 'L', x1: 0, y1: 100, x2: 0, y2: 0 },
    ],
  };
  const hole = {
    segments: [
      { type: 'L', x1: 20, y1: 20, x2: 80, y2: 20 },
      { type: 'L', x1: 80, y1: 20, x2: 80, y2: 80 },
      { type: 'L', x1: 80, y1: 80, x2: 20, y2: 80 },
      { type: 'L', x1: 20, y1: 80, x2: 20, y2: 20 },
    ],
  };

  const d = pathSampleToD(outer, [hole], 1);
  assert.ok(d.startsWith('M 0 0'));
  assert.ok(d.includes('Z'));
  // Subpath count should be 2 (outer + hole)
  const subpathCount = (d.match(/M\b/g) || []).length;
  assert.equal(subpathCount, 2);
  const closeCount = (d.match(/Z\b/g) || []).length;
  assert.equal(closeCount, 2);
});

test('End-to-end trace optimization on real asset (visteras_vector_logo.png)', () => {
  const logoPath = path.resolve(import.meta.dirname, '../images/visteras_vector_logo.png');
  const buf = fs.readFileSync(logoPath);
  const imgd = decodePng(buf);

  // Raw trace without post-optimization
  const options = buildTraceOptions({
    bw: true,
    colors: 2,
    ltres: 0.8,
    qtres: 0.8,
    pathomit: 8,
    simplifyTolerance: 0, // Bypass post-optimizer
  });
  const tdRaw = ImageTracer.imagedataToTracedata(imgd, options);
  const rawSegments = tdRaw.layers[0][0].segments.length;

  // Optimized with Balanced quality (tolerance = 1.0)
  const tdBalanced = ImageTracer.imagedataToTracedata(imgd, options);
  optimizeTracedata(tdBalanced, 1.0);
  const balancedSegments = tdBalanced.layers[0][0].segments.length;

  // Optimized with Smooth quality (tolerance = 1.8)
  const tdSmooth = ImageTracer.imagedataToTracedata(imgd, options);
  optimizeTracedata(tdSmooth, 1.8);
  const smoothSegments = tdSmooth.layers[0][0].segments.length;

  assert.ok(
    balancedSegments < rawSegments * 0.65,
    `Balanced optimization should reduce segments by >35% (raw: ${rawSegments}, balanced: ${balancedSegments})`,
  );
  assert.ok(
    smoothSegments <= 25,
    `Smooth optimization should decimate straight diagonal logo strokes to <= 25 segments (actual: ${smoothSegments})`,
  );

  // Color groups generate valid paths
  const colorGroups = tracedataToColorGroups(tdBalanced, options, { ignoreWhite: true });
  assert.ok(colorGroups.length > 0);
  assert.ok(colorGroups[0].paths.length > 0);
  assert.ok(colorGroups[0].paths[0].d.length > 20);
});

test('Stress test: multiple diagonal angles (15°, 30°, 45°, 60°, 75°) maintain low anchor counts', () => {
  const angles = [15, 30, 45, 60, 75];
  const size = 160;

  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180;
    const tan = Math.tan(rad);
    const data = new Uint8ClampedArray(size * size * 4);

    // Right triangle with hypotenuse at angle deg:
    // Corner at (20, 20), base extending horizontally to x=140,
    // and vertical height y = 20 + (x - 20) * tan clamped to 140
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        let inTri = false;
        if (deg <= 45) {
          // Angle with respect to horizontal
          inTri = x >= 20 && x <= 140 && y >= 20 && y <= Math.min(140, 20 + (x - 20) * tan);
        } else {
          // Steep angle
          inTri = y >= 20 && y <= 140 && x >= 20 && x <= Math.min(140, 20 + (y - 20) / tan);
        }
        const c = inTri ? 0 : 255;
        data[idx] = c;
        data[idx + 1] = c;
        data[idx + 2] = c;
        data[idx + 3] = 255;
      }
    }

    const options = buildTraceOptions({
      bw: true,
      colors: 2,
      ltres: 0.8,
      qtres: 0.8,
      pathomit: 8,
      simplifyTolerance: 1.0,
    });
    const td = ImageTracer.imagedataToTracedata({ width: size, height: size, data }, options);
    optimizeTracedata(td, options.simplifyTolerance);

    // Find the traced triangle (non-image-boundary path)
    let triPath = null;
    for (const layer of td.layers) {
      for (const p of layer) {
        if (p.segments.length >= 3 && p.segments.length <= 10) {
          triPath = p;
          break;
        }
      }
    }

    assert.ok(triPath, `Angle ${deg}° should produce a valid traced triangle path`);
    // Triangle should have 3 to 5 segments at most (3 true sides + at most 1-2 raster corner chamfers),
    // never 15-25 staircase micro-segments.
    assert.ok(
      triPath.segments.length <= 6,
      `Angle ${deg}° produced ${triPath.segments.length} segments; expected <= 6 without staircase bloat`,
    );
  }
});

test('Compound donut with inner hole preserves hole hierarchy and evenodd path syntax', () => {
  const size = 120;
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = 60, cy = 60;
  const rOuter = 45;
  const rInner = 20;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      const inDonut = d2 <= rOuter * rOuter && d2 >= rInner * rInner;
      const c = inDonut ? 0 : 255;
      data[idx] = c;
      data[idx + 1] = c;
      data[idx + 2] = c;
      data[idx + 3] = 255;
    }
  }

  const options = buildTraceOptions({
    bw: true,
    colors: 2,
    ltres: 0.8,
    qtres: 0.8,
    pathomit: 8,
    simplifyTolerance: 1.0,
  });
  const td = ImageTracer.imagedataToTracedata({ width: size, height: size, data }, options);
  optimizeTracedata(td, options.simplifyTolerance);

  const groups = tracedataToColorGroups(td, options, { ignoreWhite: true });
  assert.equal(groups.length, 1, 'Should produce 1 color group for the black donut');
  assert.equal(groups[0].paths.length, 1, 'Should produce 1 compound path for the donut with hole');

  const d = groups[0].paths[0].d;
  // A donut has 2 closed subpaths: outer boundary and hole boundary
  const mCount = (d.match(/M\b/g) || []).length;
  const zCount = (d.match(/Z\b/g) || []).length;
  assert.equal(mCount, 2, 'Donut SVG path should contain 2 M subpath commands (outer + hole)');
  assert.equal(zCount, 2, 'Donut SVG path should contain 2 Z closepath commands');
});

test('optimizeTracedata is idempotent', () => {
  const size = 80;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const inRect = x >= 15 && x <= 65 && y >= 15 && y <= 65;
      const c = inRect ? 0 : 255;
      data[idx] = c;
      data[idx + 1] = c;
      data[idx + 2] = c;
      data[idx + 3] = 255;
    }
  }

  const options = buildTraceOptions({ bw: true, colors: 2, simplifyTolerance: 1.0 });
  const td = ImageTracer.imagedataToTracedata({ width: size, height: size, data }, options);
  optimizeTracedata(td, 1.0);

  const segCount1 = td.layers[0][0].segments.length;
  const types1 = td.layers[0][0].segments.map((s) => s.type).join('');

  // Run second time
  optimizeTracedata(td, 1.0);
  const segCount2 = td.layers[0][0].segments.length;
  const types2 = td.layers[0][0].segments.map((s) => s.type).join('');

  assert.equal(segCount1, segCount2);
  assert.equal(types1, types2);
});

test('VTracer Wasm vectorizes circle into handle-based cubic Bezier curves', async () => {
  await initVTracer();
  const size = 60;
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = 30, cy = 30, r = 20;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const inside = Math.hypot(x - cx, y - cy) <= r;
      const c = inside ? 0 : 255;
      data[idx] = c;
      data[idx + 1] = c;
      data[idx + 2] = c;
      data[idx + 3] = 255;
    }
  }

  const svg = convertPixels(data, size, size, { preset: 'bw', mode: 'spline', simplify: 1.5 });
  assert.ok(svg.includes('<path'), 'Should contain path element');
  // Should contain cubic Bezier commands (c or C)
  const hasCubic = /[Cc][-\d.]/.test(svg);
  assert.ok(hasCubic, 'Circle outline should be formed from cubic Bezier curves with handles');

  // Should have very few paths (compact vectorization, not hundreds of micro-segments)
  const paths = svg.match(/<path[^>]+>/g) || [];
  assert.ok(paths.length >= 1 && paths.length <= 2, 'Circle should generate 1-2 clean paths');
});

test('parseVtracerSvg keeps VTracer paint order (B1) and applies translate transforms', () => {
  const sampleSvg = `<svg width="200" height="200">
    <path d="M0,0 C10,0 20,0 30,0 Z" fill="#ffffff"/>
    <path d="M10,10 C20,10 30,20 30,30 Z" fill="#fa7c1b"/>
    <path d="M50,50 C60,50 70,60 70,70 Z" fill="#000000"/>
    <path d="M80,80 C90,80 100,90 100,100 Z" fill="#fa7c1b" transform="translate(5,6)"/>
  </svg>`;
  const paths = parseVtracerSvg(sampleSvg);
  assert.deepEqual(paths.map((p) => p.fill), ['#FFFFFF', '#FA7C1B', '#000000', '#FA7C1B'], 'order must not be regrouped by fill');
  assert.ok(paths[3].d.startsWith('M 85 86'), `translate must be baked: ${paths[3].d}`);
});

test('transformSvgPathD accurately transforms and scales path coordinates', () => {
  const rawD = 'M10,20 C15,25 25,35 40,40 c5,5 10,10 20,10 l5,5 Z';
  const transformer = (x, y) => ({ x: x * 2 + 10, y: y * 2 + 20 });
  const transformed = transformSvgPathD(rawD, transformer);

  assert.ok(transformed.startsWith('M 30 60'), `Start point should transform to (30, 60): ${transformed}`);
  assert.ok(transformed.includes('C 40 70 60 90 90 100'), 'First cubic control points and end should be transformed');
  assert.ok(transformed.includes('Z'), 'Should preserve path close command');
});

test('Real-time zoom tracking hooks: setZoom schedules direct selection refresh', () => {
  let scheduled = false;
  const mockSchedule = () => { scheduled = true; };

  // Verify the hook pattern used in visteras-direct-selection.js and visteras-selection.js
  const sc = {
    _zoom: 1,
    setZoom(z) { this._zoom = z; return this._zoom; },
    call(event) { return event; },
  };

  const origSetZoom = sc.setZoom;
  let active = true;
  sc.setZoom = function (zoom) {
    const res = origSetZoom.call(this, zoom);
    if (active) mockSchedule();
    return res;
  };

  sc.setZoom(2.5);
  assert.equal(sc._zoom, 2.5);
  assert.equal(scheduled, true, 'setZoom must invoke schedule() in real time');
});

// ---------------------------------------------------------------------------
// Live Image Trace: mapping, quantize, z-order, Ignore White, snap, pipeline
// ---------------------------------------------------------------------------

function canvas(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = fn(x, y);
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return data;
}
const ringImage = (size = 120) => canvas(size, size, (x, y) => {
  const r = Math.hypot(x - size / 2, y - size / 2);
  return r < size * 0.375 && r > size * 0.17 ? [0, 0, 0] : [255, 255, 255];
});
// A blocky "B"-like glyph with two counters (holes) — stands in for text.
const glyphImage = () => canvas(90, 120, (x, y) => {
  const inStem = x >= 15 && x < 70 && y >= 10 && y < 110;
  const hole1 = x >= 32 && x < 55 && y >= 25 && y < 50;
  const hole2 = x >= 32 && x < 55 && y >= 68 && y < 95;
  return inStem && !hole1 && !hole2 ? [10, 10, 10] : [255, 255, 255];
});
const gradientImage = (w = 160, h = 60) => canvas(w, h, (x) => {
  const v = Math.round((x / (w - 1)) * 255);
  return [v, 90, 255 - v];
});
const subpaths = (d) => (d.match(/M/g) || []).length;

test('mapSettingsToVtracer: Default preset maps to bw 128 / cutout / fs 5 / ct 60 / simplify 1.25', () => {
  const { vt, prep, post } = mapSettingsToVtracer({ ...presetSettings('default'), ignoreWhite: true });
  assert.equal(vt.clustering, 'bw');
  assert.equal(vt.binaryThreshold, 128);
  assert.equal(vt.hierarchical, 'cutout');
  assert.equal(vt.filterSpeckle, 5);
  assert.equal(vt.cornerThreshold, 60);
  assert.equal(vt.simplify, 1.25);
  assert.equal(vt.lengthThreshold, 4);
  assert.equal(vt.maxIterations, 10);
  assert.equal(vt.spliceThreshold, 45);
  assert.equal(prep.kind, 'composite');
  assert.equal(post.ignoreWhite, false, 'bw clustering already drops white');
  assert.equal(vt.preset, undefined, 'B7: never pass a preset id to the wasm');
});

test('mapSettingsToVtracer: B&W without Ignore White binarizes in JS and traces [#000,#FFF] in cutout', () => {
  const { vt, prep } = mapSettingsToVtracer({ ...presetSettings('default'), method: 'overlapping', ignoreWhite: false });
  assert.equal(prep.kind, 'binarize');
  assert.equal(vt.clustering, 'color');
  assert.deepEqual(vt.palette, ['#000000', '#FFFFFF']);
  assert.equal(vt.hierarchical, 'cutout');
  assert.equal(vt.layerDifference, 0);
  assert.equal(vt.colorPrecision, 8);
});

test('mapSettingsToVtracer: Limited / Grayscale quantize first (ld 0, cp 8); Full Tone formula; Method; sliders', () => {
  const lim = mapSettingsToVtracer(presetSettings('6-colors'));
  assert.equal(lim.prep.kind, 'quantize');
  assert.equal(lim.prep.colors, 6);
  assert.equal(lim.vt.layerDifference, 0);
  assert.equal(lim.vt.colorPrecision, 8);
  assert.equal(lim.vt.maxColors, undefined);

  const gray = mapSettingsToVtracer(presetSettings('shades-of-gray'));
  assert.equal(gray.prep.kind, 'grayscale');
  assert.equal(gray.vt.layerDifference, 0);

  const ft = (pct) => mapSettingsToVtracer({ mode: 'color', palette: 'fulltone', fullTone: pct }).vt;
  assert.equal(ft(0).layerDifference, 64);
  assert.equal(ft(0).colorPrecision, 6);
  assert.equal(ft(50).layerDifference, 34);
  assert.equal(ft(50).colorPrecision, 8);
  assert.equal(ft(100).layerDifference, 4, 'min 4');
  assert.equal(ft(93).layerDifference, 8, 'High Fidelity Photo ld 8');

  const hifi = mapSettingsToVtracer(presetSettings('high-fidelity-photo')).vt;
  assert.equal(hifi.hierarchical, 'stacked');
  assert.equal(hifi.filterSpeckle, 2);
  assert.equal(hifi.cornerThreshold, 120);
  assert.equal(hifi.simplify, 0.25);

  const s = { mode: 'color', palette: 'fulltone', paths: 100, corners: 0, noise: 100 };
  const m = mapSettingsToVtracer(s).vt;
  assert.equal(m.simplify, 0.2, 'simplify floor 0.2');
  assert.equal(m.cornerThreshold, 150);
  assert.equal(m.filterSpeckle, 10);

  const auto = (n) => mapSettingsToVtracer({ mode: 'color', palette: 'automatic' }, { autoColors: n });
  assert.equal(auto(4).prep.kind, 'quantize');
  assert.equal(auto(200).prep.kind, 'composite');
});

test('mapSettingsToVtracer: preview scale shrinks pixel-sized params (noise, simplify)', () => {
  const full = mapSettingsToVtracer(presetSettings('default'), { scale: 1 }).vt;
  const half = mapSettingsToVtracer(presetSettings('default'), { scale: 0.5 }).vt;
  assert.equal(half.filterSpeckle, Math.round(full.filterSpeckle * 0.5));
  assert.ok(Math.abs(half.simplify - full.simplify * 0.5) < 1e-6);
  assert.equal(half.cornerThreshold, full.cornerThreshold, 'angles are scale-free');
});

test('every preset normalizes and maps without throwing (B7)', () => {
  for (const id of Object.keys(TRACE_PRESETS)) {
    const s = presetSettings(id);
    assert.equal(s.preset, id);
    const { vt } = mapSettingsToVtracer(s);
    assert.ok(['bw', 'color'].includes(vt.clustering), id);
  }
  assert.deepEqual(normalizeSettings({ colors: 99, noise: -5 }).colors, 30);
});

test('quantizeMedianCut + remapToPalette: exactly N colors, exact extremes preserved', () => {
  const data = gradientImage();
  const pal = quantizeMedianCut(data, 3);
  assert.equal(pal.length, 3);
  const used = remapToPalette(data, pal);
  assert.equal(used.length, 3);
  const distinct = new Set();
  for (let i = 0; i < data.length; i += 4) distinct.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  assert.equal(distinct.size, 3, 'every pixel now sits on one of the 3 palette colors');

  const bw = canvas(20, 20, (x) => (x < 10 ? [0, 0, 0] : [255, 255, 255]));
  const pal2 = quantizeMedianCut(bw, 2).map((c) => c.join(','));
  assert.ok(pal2.includes('0,0,0') && pal2.includes('255,255,255'), `pure black/white must survive: ${pal2}`);

  const g = gradientImage();
  const grays = snapToGrays(g, 4);
  assert.ok(grays.length <= 4);
  const bin = binarize(canvas(2, 1, (x) => (x ? [200, 200, 200] : [60, 60, 60])), 128);
  assert.deepEqual([...bin], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('Ignore White strips whites only in cutout output (B2)', () => {
  const paths = [
    { d: 'M0 0 L10 0 L10 10 Z', fill: '#FFFFFF' },
    { d: 'M1 1 L9 1 L9 9 Z', fill: '#000000' },
    { d: 'M3 3 L6 3 L6 6 Z', fill: '#FDFDFD' },
  ];
  assert.equal(applyIgnoreWhite(paths, 'cutout').length, 1);
  assert.equal(applyIgnoreWhite(paths, 'stacked').length, 3, 'stacked whites are the holes — keep them');
});

test('snapCurvesToLines: flat curves become lines, near-axis lines snap, real curves survive', () => {
  // A cubic whose handles sit 0.3px off the chord → line; then a 1° line → horizontal.
  const d = 'M 0 0 C 10 0.3 20 -0.3 30 0 L 60 0.5 L 60 30 C 60 50 20 50 0 30 Z';
  const out = snapCurvesToLines(d);
  const tokens = out.split(' ');
  assert.equal(tokens.filter((t) => t === 'C').length, 1, `the genuine curve stays: ${out}`);
  const m = out.match(/^M (\S+) (\S+) L (\S+) (\S+)/);
  assert.ok(m, out);
  assert.equal(+m[2], +m[4], `the near-horizontal run is exactly horizontal: ${out}`);
  // 3° is outside the ±2° window
  const steep = snapCurvesToLines('M 0 0 L 100 5.3 L 100 50 L 0 50 Z');
  assert.ok(/M 0 0 L 100 5.3/.test(steep), steep);
});

test('groupPathsForExpand keeps paint order: cutout groups per color, stacked by runs', () => {
  const paths = [{ fill: '#FFFFFF' }, { fill: '#000000' }, { fill: '#FFFFFF' }];
  assert.deepEqual(groupPathsForExpand(paths, 'cutout').map((g) => [g.fill, g.paths.length]), [['#FFFFFF', 2], ['#000000', 1]]);
  assert.deepEqual(groupPathsForExpand(paths, 'stacked').map((g) => [g.fill, g.paths.length]), [['#FFFFFF', 1], ['#000000', 1], ['#FFFFFF', 1]]);
});

test('traceStats counts paths, anchors and colors', () => {
  const st = traceStats([
    { d: 'M 0 0 L 10 0 L 10 10 L 0 0 Z', fill: '#000000' },
    { d: 'M 0 0 L 5 5 Z M 1 1 L 2 2 L 3 1 Z', fill: '#ff0000' },
  ]);
  assert.equal(st.paths, 2);
  assert.equal(st.colors, 2);
  assert.equal(st.anchors, 3 + 2 + 3);
});

test('pipeline: a black ring keeps its hole with Ignore White on and off', async () => {
  await initVTracer();
  const on = runTracePipeline(convertPixels, ringImage(), 120, 120, { ...presetSettings('default'), ignoreWhite: true });
  assert.equal(on.paths.length, 1);
  assert.equal(on.paths[0].fill, '#000000');
  assert.equal(subpaths(on.paths[0].d), 2, 'outer contour + hole');

  const off = runTracePipeline(convertPixels, ringImage(), 120, 120, { ...presetSettings('default'), ignoreWhite: false });
  const blackIdx = off.paths.findIndex((p) => p.fill === '#000000');
  assert.ok(blackIdx >= 0);
  assert.equal(subpaths(off.paths[blackIdx].d), 2, 'ring is still a compound path with a hole');
  const whites = off.paths.filter((p) => p.fill === '#FFFFFF');
  assert.ok(whites.length >= 2, 'background and hole whites are both present');
  assert.equal(off.hierarchical, 'cutout');
});

test('pipeline: text-like glyph keeps both counters (Ignore White on/off, Abutting and Overlapping)', async () => {
  await initVTracer();
  for (const ignoreWhite of [true, false]) {
    const r = runTracePipeline(convertPixels, glyphImage(), 90, 120, { ...presetSettings('bw-logo'), ignoreWhite });
    const dark = r.paths.find((p) => p.fill === '#000000');
    assert.equal(subpaths(dark.d), 3, `glyph outline + 2 holes (ignoreWhite ${ignoreWhite})`);
  }
  // Overlapping (stacked) + Ignore White must NOT delete the stacked hole fills.
  const st = runTracePipeline(convertPixels, glyphImage(), 90, 120, { ...presetSettings('3-colors'), method: 'overlapping', ignoreWhite: true });
  const lastDark = st.paths.map((p) => p.fill).lastIndexOf(st.paths.find((p) => !p.fill.startsWith('#F'))?.fill);
  assert.ok(st.paths.slice(lastDark + 1).some((p) => p.fill.startsWith('#F')), 'white counters stacked above the glyph are kept');
});

test('pipeline: 3 Colors on a gradient yields exactly 3 colors', async () => {
  await initVTracer();
  const r = runTracePipeline(convertPixels, gradientImage(), 160, 60, presetSettings('3-colors'));
  assert.equal(r.stats.colors, 3);
  assert.equal(new Set(r.paths.map((p) => p.fill)).size, 3);
  assert.equal(r.palette.length, 3);
});

test('pipeline: preview-scale output is returned in source-pixel coordinates', async () => {
  await initVTracer();
  // Trace a 60px ring as if it were a 120px source at 50% preview scale.
  const r = runTracePipeline(convertPixels, ringImage(60), 60, 60, { ...presetSettings('default'), ignoreWhite: true }, { scale: 0.5 });
  const nums = r.paths[0].d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.max(...nums) > 80 && Math.max(...nums) < 130, `coords (incl. Bézier handles) scaled back to the 120px source: max ${Math.max(...nums)}`);
});

test('pipeline: Snap Curves to Lines turns a traced square into 4 axis-aligned lines', async () => {
  await initVTracer();
  const sq = canvas(80, 80, (x, y) => (x >= 20 && x < 60 && y >= 20 && y < 60 ? [0, 0, 0] : [255, 255, 255]));
  const r = runTracePipeline(convertPixels, sq, 80, 80, { ...presetSettings('technical-drawing') });
  const d = r.paths[0].d;
  assert.ok(!/C/.test(d), `no curves remain: ${d}`);
  const pts = [...d.matchAll(/[ML] (\S+) (\S+)/g)].map((m) => [+m[1], +m[2]]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    assert.ok(ax === bx || ay === by, `segment ${i} is axis-aligned: ${d}`);
  }
});

// ---- Image Trace dialog (menu entry, placement) ------------------------------

test('Object menu has a single "Image Trace…" item (no Make/Release/Expand submenu), disabled by default', () => {
  const html = fs.readFileSync(path.resolve(import.meta.dirname, '../index.html'), 'utf8');
  const items = html.match(/id="action_image_trace[^"]*"/g) || [];
  assert.deepEqual(items, ['id="action_image_trace"']);
  assert.match(html, /<div class="menu_dropdown_item disabled" id="action_image_trace"[^>]*>Image Trace…<\/div>/);
  assert.ok(!/menu_image_trace|menu_submenu_list/.test(html), 'old submenu is gone');
  const js = fs.readFileSync(path.resolve(import.meta.dirname, '../js/visteras-image-trace.js'), 'utf8');
  assert.ok(!/image_trace_panel|action_image_trace_(make|release|expand|panel)|vit_trace\b/.test(js), 'old panel / submenu wiring is gone');
  assert.match(html, /visteras-image-trace\.js\?v=trace-dialog-1/);
  assert.match(html, /visteras-image-trace\.css\?v=trace-dialog-1/);
});

test('dialog placement docks right of the canvas area, beside the image', () => {
  const viewport = { width: 1440, height: 900 };
  const area = { left: 60, top: 80, right: 1180, bottom: 860 };
  const size = { width: 300, height: 520 };
  // Image on the left half: dock on the right.
  let p = computeDialogPosition({ area, target: { left: 200, top: 200, right: 600, bottom: 500 }, size, viewport });
  assert.deepEqual(p, { left: 1180 - 300 - 12, top: 92 });
  // Image under the right dock: move to the left side instead.
  p = computeDialogPosition({ area, target: { left: 800, top: 150, right: 1150, bottom: 600 }, size, viewport });
  assert.deepEqual(p, { left: 72, top: 92 });
  // Image covering the whole area: both overlap equally, keep the right dock.
  p = computeDialogPosition({ area, target: { left: 0, top: 0, right: 1440, bottom: 900 }, size, viewport });
  assert.equal(p.left, 868);
  // No target: right dock.
  assert.deepEqual(computeDialogPosition({ area, size, viewport }), { left: 868, top: 92 });
});

test('dialog placement and dragging stay inside the viewport', () => {
  const viewport = { width: 800, height: 600 };
  const size = { width: 300, height: 400 };
  assert.deepEqual(clampDialogPosition(-50, -20, size, viewport), { left: 8, top: 8 });
  assert.deepEqual(clampDialogPosition(900, 900, size, viewport), { left: 492, top: 192 });
  assert.deepEqual(clampDialogPosition(100.4, 50.6, size, viewport), { left: 100, top: 51 });
  // Taller than the viewport: pinned to the top margin.
  assert.deepEqual(clampDialogPosition(100, 300, { width: 300, height: 700 }, viewport), { left: 100, top: 8 });
  // A canvas area that runs off-screen still yields an on-screen dialog.
  const p = computeDialogPosition({ area: { left: 0, top: 0, right: 2000, bottom: 1500 }, size, viewport });
  assert.ok(p.left >= 8 && p.left + size.width <= viewport.width - 8 && p.top >= 8 && p.top + size.height <= viewport.height - 8);
});
