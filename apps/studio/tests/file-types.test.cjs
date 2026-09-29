const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');

test('File Types: Studio supports .vsd documents', () => {
	const saveJs = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/file/save.js'), 'utf8');
	const openJs = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/file/open.js'), 'utf8');
	const baseDocsJs = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/core/base-documents.js'), 'utf8');

	// VSD is defined in SAVE_TYPES and set as native format
	assert.match(saveJs, /VSD:\s*"Visteras Studio Document"/);
	assert.match(saveJs, /fname\s*\+\s*"\.vsd"/);
	assert.match(saveJs, /format:\s*'vsd'/);
	assert.match(saveJs, /'application\/x-visteras-studio':\s*\[\s*'\.vsd'\s*\]/);

	// openJs accepts and detects .vsd
	assert.match(openJs, /\.vsd/);
	assert.match(openJs, /isVsd\s*=\s*\(f\.name\s*&&\s*f\.name\.toLowerCase\(\)\.endsWith\('\.vsd'\)\)/);

	// base-documents sets default format to VSD
	assert.match(baseDocsJs, /save_format:\s*options\.save_format\s*\|\|\s*'VSD'/);
	assert.match(baseDocsJs, /endsWith\('\.vsd'\)/);
});

test('File Types: Vector supports .vvd documents', () => {
	const vectorHtml = fs.readFileSync(path.join(rootDir, 'apps/vector/index.html'), 'utf8');

	// Menu items reflect .vvd
	assert.match(vectorHtml, /Save Vector Document \(\.vvd\)/);
	assert.match(vectorHtml, /Open Vector Document \(\.vvd, \.svg\)\.\.\./);
	assert.match(vectorHtml, /Export SVG\.\.\./);

	// File input accepts .vvd
	assert.match(vectorHtml, /accept\s*=\s*['"]\.vvd,/);

	// Action save generates .vvd bundle with correct schema
	assert.match(vectorHtml, /visteras-vector-document-v1/);
	assert.match(vectorHtml, /app:\s*'visteras-vector'/);
	assert.match(vectorHtml, /\$\{title\}\.vvd/);
});

test('File Types: Publish supports .vpd documents', () => {
	const docManagerTs = fs.readFileSync(path.join(rootDir, 'apps/publish/src/lib/publishDocumentManager.ts'), 'utf8');
	const publishAstro = fs.readFileSync(path.join(rootDir, 'apps/publish/src/pages/index.astro'), 'utf8');

	// Document manager exports .vpd
	assert.match(docManagerTs, /\$\{safeName\}-\$\{dateStr\}\.vpd/);
	assert.match(docManagerTs, /Visteras Publish Document \(\.vpd\)/);

	// Menu and file input in Publish page
	assert.match(publishAstro, /Save Edition \(\.vpd\)/);
	assert.match(publishAstro, /Open Edition \(\.vpd\)\.\.\./);
	assert.match(publishAstro, /accept="\.vpd,/);
});

test('File Types: Collage supports .vcd documents', () => {
	const collageHtml = fs.readFileSync(path.join(rootDir, 'apps/collage/index.html'), 'utf8');
	const collageAppJs = fs.readFileSync(path.join(rootDir, 'apps/collage/js/app.js'), 'utf8');

	// Menu items in Collage reflect .vcd
	assert.match(collageHtml, /Save Collage \(\.vcd\)/);
	assert.match(collageHtml, /Open Collage \(\.vcd\)\.\.\./);
	assert.match(collageHtml, /Save As \(\.vcd\)\.\.\./);

	// Hidden input accepts .vcd
	assert.match(collageHtml, /accept="\.vcd,/);

	// app.js handles .vcd saving and opening
	assert.match(collageAppJs, /Visteras Collage Document \(\.vcd\)/);
	assert.match(collageAppJs, /\$\{slugify\(chosenTitle\)\}\.vcd/);
});
