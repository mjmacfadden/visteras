import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripExportGuides } from '../js/visteras-export-clip.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('export.js strips guides in every render path (SVG clone + artboard serializer)', () => {
  const src = read('../js/visteras-export.js');
  assert.match(src, /import \{[^}]*stripExportGuides[^}]*\} from '\.\/visteras-export-clip\.js'/);
  assert.match(src, /stripExportGuides\(clone\)/, 'buildExportSvg (SVG/PNG/JPG/PDF/Screens)');
  assert.match(src, /stripExportGuides\(root\)/, 'artboardSvgString fallback');
});

test('document-shell strips guides from the .vvd embedded SVG (guides live in rulerGuides)', () => {
  const src = read('../js/visteras-document-shell.js');
  assert.match(src, /stripExportGuides/);
  assert.match(src, /function captureSvg/);
});

test('stripExportGuides is exported for clipboard / other callers', () => {
  assert.equal(typeof stripExportGuides, 'function');
});
