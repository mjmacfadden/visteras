import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pdfPageSize, pdfPageSpecs, looksLikeVectorPdf, countPdfPages } from '../js/visteras-export-pdf.js';

test('pdfPageSize: page = artboard size in pt (1 px at 72 ppi)', () => {
  assert.deepEqual(pdfPageSize({ width: 800, height: 600 }), { width: 800, height: 600 });
  assert.deepEqual(pdfPageSize({ width: 1920.4, height: 1080.6 }), { width: 1920.4, height: 1080.6 });
  assert.deepEqual(pdfPageSize({ width: 0, height: -1 }), { width: 1, height: 1 });
});

test('pdfPageSpecs: one page per artboard, orientation from size', () => {
  const specs = pdfPageSpecs([
    { name: 'Cover', width: 612, height: 792 },
    { name: 'Wide', width: 1000, height: 500 },
  ]);
  assert.equal(specs.length, 2);
  assert.deepEqual(specs[0], { index: 0, name: 'Cover', width: 612, height: 792, orientation: 'portrait' });
  assert.equal(specs[1].orientation, 'landscape');
  assert.equal(specs[1].name, 'Wide');
});

test('looksLikeVectorPdf / countPdfPages: recognises vector content streams', () => {
  // Minimal synthetic PDF with a path operator and two page objects.
  const fake = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 5 0 R >>endobj
4 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 5 0 R >>endobj
5 0 obj<< /Length 20 >>stream
0 0 m 10 10 l S
endstream endobj
%%EOF`;
  assert.equal(countPdfPages(fake), 2);
  assert.equal(looksLikeVectorPdf(fake), true);
  assert.equal(looksLikeVectorPdf('%PDF-1.4\n/Subtype /Image\n'), false);
  assert.equal(looksLikeVectorPdf('not a pdf'), false);
});

test('export.js uses buildArtboardPdf (vector) and multi-page renderPdfDocument', () => {
  const src = fs.readFileSync(new URL('../js/visteras-export.js', import.meta.url), 'utf8');
  assert.match(src, /buildArtboardPdf/);
  assert.match(src, /renderPdfDocument/);
  assert.match(src, /one page per artboard/);
  assert.doesNotMatch(src, /PDF \(raster\)/);
  assert.match(src, /rasterFallback/, 'documents / keeps a raster fallback for unsupported filters');
});

test('vendored jspdf + svg2pdf are present for lazy load', () => {
  const root = new URL('../lib/', import.meta.url);
  assert.ok(fs.existsSync(new URL('jspdf.umd.min.js', root)));
  assert.ok(fs.existsSync(new URL('svg2pdf.umd.min.js', root)));
  assert.ok(fs.existsSync(new URL('README-pdf.md', root)));
});
