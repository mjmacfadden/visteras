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

	// Standardized File menu (49c010fb): plain Open... / Save / Save As..., format lives in the file code
	assert.match(vectorHtml, /id="action_open">Open\.\.\. </);
	assert.match(vectorHtml, /id="action_save">Save </);
	assert.match(vectorHtml, /id="action_save_as">Save As\.\.\. </);
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

	// Standardized File menu (49c010fb) and the .vpd file input
	assert.match(publishAstro, /id="action_open_edition">Open\.\.\. </);
	assert.match(publishAstro, /id="action_save_edition">Save </);
	assert.match(publishAstro, /id="action_save_as_edition">Save As\.\.\. </);
	assert.match(publishAstro, /accept="\.vpd,/);
});

test('File Types: Collage supports .vcd documents', () => {
	const collageHtml = fs.readFileSync(path.join(rootDir, 'apps/collage/index.html'), 'utf8');
	const collageAppJs = fs.readFileSync(path.join(rootDir, 'apps/collage/js/app.js'), 'utf8');

	// Standardized File menu (49c010fb)
	assert.match(collageHtml, /id="action_menu_open">Open\.\.\. </);
	assert.match(collageHtml, /id="action_save_set">Save </);
	assert.match(collageHtml, /id="action_save_as">Save As\.\.\. </);

	// Hidden input accepts .vcd
	assert.match(collageHtml, /accept="\.vcd,/);

	// app.js handles .vcd saving and opening
	assert.match(collageAppJs, /Visteras Collage Document \(\.vcd\)/);
	assert.match(collageAppJs, /\$\{slugify\(chosenTitle\)\}\.vcd/);
});

test('File Types: All formats support embedded PNG thumbnails for previews', () => {
	const saveJs = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/file/save.js'), 'utf8');
	const vectorHtml = fs.readFileSync(path.join(rootDir, 'apps/vector/index.html'), 'utf8');
	const docManagerTs = fs.readFileSync(path.join(rootDir, 'apps/publish/src/lib/publishDocumentManager.ts'), 'utf8');
	const collageAppJs = fs.readFileSync(path.join(rootDir, 'apps/collage/js/app.js'), 'utf8');

	// Studio .vsd embeds thumbnail in info and root
	assert.match(saveJs, /export_data\.info\.thumbnail\s*=\s*thumbDataUrl/);
	assert.match(saveJs, /export_data\.thumbnail\s*=\s*thumbDataUrl/);

	// Vector .vvd embeds thumbnail
	assert.match(vectorHtml, /thumbnail:\s*thumbUrl/);

	// Publish .vpd embeds thumbnail
	assert.match(docManagerTs, /thumbnail:\s*thumbUrl/);

	// Collage .vcd embeds thumbnail
	assert.match(collageAppJs, /thumbnail:\s*doc\.thumbnail/);
});
