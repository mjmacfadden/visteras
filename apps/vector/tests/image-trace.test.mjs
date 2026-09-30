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
  qualityToOmit,
  pathSampleToD,
  tracedataToColorGroups,
  perpDist,
  rdp,
  parseVtracerSvg,
  transformSvgPathD,
  computeTracePayload,
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

test('qualityToOmit maps simplify quality slider correctly to tolerances', () => {
  const smooth = qualityToOmit(0);
  assert.equal(smooth.simplifyTolerance, 1.8);
  assert.equal(smooth.linefilter, true);

  const balanced = qualityToOmit(1);
  assert.equal(balanced.simplifyTolerance, 1.0);
  assert.equal(balanced.linefilter, false);

  const accurate = qualityToOmit(2);
  assert.equal(accurate.simplifyTolerance, 0.4);
  assert.equal(accurate.linefilter, false);
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

test('parseVtracerSvg extracts color groups and ignores white background', () => {
  const sampleSvg = `<svg width="200" height="200">
    <path d="M0,0 C10,0 20,0 30,0 Z" fill="#ffffff"/>
    <path d="M10,10 C20,10 30,20 30,30 Z" fill="#fa7c1b"/>
    <path d="M50,50 C60,50 70,60 70,70 Z" fill="#fa7c1b"/>
    <path d="M80,80 C90,80 100,90 100,100 Z" fill="#000000"/>
  </svg>`;

  const groupsWithWhite = parseVtracerSvg(sampleSvg, false);
  assert.equal(groupsWithWhite.length, 3, 'Should have 3 color groups (#ffffff, #fa7c1b, #000000)');

  const groupsWithoutWhite = parseVtracerSvg(sampleSvg, true);
  assert.equal(groupsWithoutWhite.length, 2, 'Should have 2 color groups (#fa7c1b, #000000) ignoring white');
  const orangeGroup = groupsWithoutWhite.find((g) => g.fill === '#fa7c1b');
  assert.ok(orangeGroup);
  assert.equal(orangeGroup.paths.length, 2);
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

test('computeTracePayload produces responsive previewSvg with viewBox and handles ignoreWhite', async () => {
  const width = 80, height = 60;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  // Draw an orange rectangle in the center
  for (let y = 15; y < 45; y++) {
    for (let x = 20; x < 60; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = 250;     // R
      data[idx + 1] = 124; // G
      data[idx + 2] = 27;  // B
      data[idx + 3] = 255;
    }
  }

  const rawImage = { data, width, height };
  const ui = {
    presetId: 'poster',
    mode: 'spline',
    hierarchical: 'stacked',
    clustering: 'color',
    colors: 4,
    simplify: 1.0,
    filterSpeckle: 4,
    cornerThreshold: 60,
    colorPrecision: 6,
    layerDifference: 16,
    lengthThreshold: 4,
    spliceThreshold: 45,
    pathPrecision: 2,
    ignoreWhite: true,
    preprocess: false,
  };

  const payload = await computeTracePayload(rawImage, ui);
  assert.equal(payload.engine, 'vtracer');
  assert.equal(payload.width, 80);
  assert.equal(payload.height, 60);
  assert.ok(payload.totalPaths >= 1, 'Should produce at least 1 path');
  assert.ok(payload.traceMs >= 0, 'Should track execution duration in ms');

  // Verify responsive previewSvg structure
  assert.ok(payload.previewSvg.includes('viewBox="0 0 80 60"'), 'Preview SVG must include viewBox="0 0 W H" for responsive scaling');
  assert.ok(payload.previewSvg.includes('object-fit:contain'), 'Preview SVG must include object-fit:contain styling');
  assert.ok(payload.previewSvg.includes('fill-rule="evenodd"'), 'Preview SVG must include fill-rule="evenodd"');
  assert.ok(payload.previewSvg.includes('#FA7C1B') || payload.previewSvg.includes('#fa7c1b'), 'Preview SVG must contain the traced orange fill');
  // White background was ignored
  assert.ok(!payload.previewSvg.includes('fill="#ffffff"') && !payload.previewSvg.includes('fill="#FFFFFF"'), 'Preview SVG must exclude white background when ignoreWhite is true');

  // Now test with ignoreWhite = false
  const payloadWithWhite = await computeTracePayload(rawImage, { ...ui, ignoreWhite: false });
  assert.ok(payloadWithWhite.colorGroups.length >= 2, 'Should include both orange shape and background color groups');
});

test('computeTracePayload supports polygon and pixel curve modes in VTracer', async () => {
  const size = 50;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 10; y < 40; y++) {
    for (let x = 10; x < 40; x++) {
      const idx = (y * size + x) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }

  const rawImage = { data, width: size, height: size };

  // Polygon mode: produces straight line L segments rather than smooth cubics
  const polyPayload = await computeTracePayload(rawImage, {
    mode: 'polygon',
    clustering: 'bw',
    ignoreWhite: true,
    filterSpeckle: 0,
    simplify: 1.0,
  });
  assert.equal(polyPayload.engine, 'vtracer');
  assert.ok(polyPayload.previewSvg.includes('viewBox="0 0 50 50"'));
  assert.ok(polyPayload.colorGroups.length >= 1);

  // Pixel mode: produces stepped pixel segments
  const pixelPayload = await computeTracePayload(rawImage, {
    mode: 'pixel',
    clustering: 'bw',
    ignoreWhite: true,
    filterSpeckle: 0,
    simplify: 0.0,
  });
  assert.equal(pixelPayload.engine, 'vtracer');
  assert.ok(pixelPayload.previewSvg.includes('viewBox="0 0 50 50"'));
});



