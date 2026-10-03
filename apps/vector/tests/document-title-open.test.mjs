import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorHtmlPath = path.resolve(__dirname, '../index.html');
const docShellPath = path.resolve(__dirname, '../js/visteras-document-shell.js');

test('Document Title: openVectorFile prioritizes filename over internal bundle title', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  // Verify fileBase is extracted and takes priority over bundle.title
  assert.match(html, /const fileBase = \(file\.name \|\| ''\)\.replace\(/);
  assert.match(html, /let base = fileBase;/);
  assert.match(html, /if \(!base \|\| \/\^untitled\(-\\d\+\)\?\$\/i\.test\(base\)\)/);
  assert.match(html, /if \(bundle\.title && !\/\^untitled\(-\\d\+\)\?\$\/i\.test\(bundle\.title\)\)/);

  // Test the title extraction logic directly
  function resolveTitle(file, bundle) {
    const fileBase = (file.name || '').replace(/\.(vvd|svg)$/i, '').trim();
    let base = fileBase;
    if (bundle) {
      if (!base || /^untitled(-\d+)?$/i.test(base)) {
        if (bundle.title && !/^untitled(-\d+)?$/i.test(bundle.title)) {
          base = bundle.title;
        }
      }
    }
    if (!base) base = (file.name || 'untitled').replace(/\.(vvd|svg)$/i, '') || 'untitled';
    return base;
  }

  // 1. flower.vvd saved previously when canvas was Untitled-1 -> must be 'flower'
  assert.equal(resolveTitle({ name: 'flower.vvd' }, { title: 'Untitled-1' }), 'flower');

  // 2. Untitled-1.vvd where user gave internal title 'Sunset' -> must use 'Sunset'
  assert.equal(resolveTitle({ name: 'Untitled-1.vvd' }, { title: 'Sunset' }), 'Sunset');

  // 3. Untitled-1.vvd with Untitled-1 title -> 'Untitled-1'
  assert.equal(resolveTitle({ name: 'Untitled-1.vvd' }, { title: 'Untitled-1' }), 'Untitled-1');

  // 4. artwork.svg (no bundle) -> 'artwork'
  assert.equal(resolveTitle({ name: 'artwork.svg' }, null), 'artwork');
});

test('Document Title: saveVectorDoc syncs internal title to saved handle base name', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  assert.match(html, /const buildVvdJson = \(docTitle, thumbUrl\) => JSON\.stringify/);
  // serialized after the picker resolves, with the name it is saved under
  assert.match(html, /data: async \(name\) => buildVvdJson\(baseOf\(name\), await makeThumbnail\(\)\),/);
  assert.match(html, /const savedBase = baseOf\(result\.name\);/);
});

test('Document Shell: openDocument and switchDocument sync active document title and storage', () => {
  const code = fs.readFileSync(docShellPath, 'utf8');

  // Verify openDocument updates svgEditor.title and ACTIVE_TITLE_KEY
  assert.match(code, /resolvedTitle/);
  assert.match(code, /targetDoc\.title = resolvedTitle/);
  assert.match(code, /if \(svgEditor\) svgEditor\.title = resolvedTitle/);
  assert.match(code, /localStorage\.setItem\(ACTIVE_TITLE_KEY, resolvedTitle\)/);

  // Verify switchDocument updates svgEditor.title and ACTIVE_TITLE_KEY
  assert.match(code, /function switchDocument\(id\)[\s\S]*?if \(svgEditor\) svgEditor\.title = next\.title;[\s\S]*?localStorage\.setItem\(ACTIVE_TITLE_KEY, next\.title\);/);

  // Verify closeDocument updates svgEditor.title and ACTIVE_TITLE_KEY
  assert.match(code, /if \(svgEditor\) svgEditor\.title = doc\.title;[\s\S]*?localStorage\.setItem\(ACTIVE_TITLE_KEY, doc\.title\);/);
});
