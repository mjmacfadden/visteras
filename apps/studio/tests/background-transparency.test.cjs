const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');

test('Document model: creating document with White background preserves document transparency', () => {
	const baseDocsContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/core/base-documents.js'), 'utf8');

	// Verify _create_doc_model sets doc.transparency = true even when transparency: false (white background layer)
	assert.match(baseDocsContent, /transparency:\s*\(options\.doc_transparency\s*!==\s*undefined\)\s*\?\s*\(options\.doc_transparency\s*!==\s*false\)\s*:\s*true/);

	// Verify create_document keeps doc.transparency true
	assert.match(baseDocsContent, /doc\.transparency\s*=\s*\(options\.doc_transparency\s*!==\s*undefined\)\s*\?\s*\(options\.doc_transparency\s*!==\s*false\)\s*:\s*true/);
});

test('New file creation: white background creates Background layer without disabling canvas transparency', () => {
	const newJsContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/file/new.js'), 'utf8');

	// Verify Update_config_action sets TRANSPARENCY: true (not transparency)
	assert.match(newJsContent, /TRANSPARENCY:\s*true/);
	assert.doesNotMatch(newJsContent, /TRANSPARENCY:\s*transparency,/);

	// Verify doc.transparency is set to true (not transparency)
	assert.match(newJsContent, /doc\.transparency\s*=\s*true/);
	assert.doesNotMatch(newJsContent, /doc\.transparency\s*=\s*transparency;/);

	// Verify new file creation does not poison cookie with transparency = 0
	assert.doesNotMatch(newJsContent, /setCookie\('transparency',\s*0\)/);
});

test('Base GUI: transparency default and legacy cookie migration', () => {
	const baseGuiContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/core/base-gui.js'), 'utf8');

	// Verify load_default_values checks transparency_grid and migrates legacy 0 cookie
	assert.match(baseGuiContent, /getCookie\('transparency_grid'\)/);
	assert.match(baseGuiContent, /legacy_cookie\s*===\s*'0'/);
	assert.match(baseGuiContent, /config\.TRANSPARENCY\s*=\s*true/);

	// Verify render_canvas_background sets transparent-grid squares when config.TRANSPARENCY is true
	assert.match(baseGuiContent, /target\.className\s*=\s*'transparent-grid\s*'\s*\+\s*config\.TRANSPARENCY_TYPE/);
	assert.match(baseGuiContent, /target\.className\s*=\s*'transparent-grid white'/);
});

test('VSD Document import: imported documents keep transparency enabled', () => {
	const baseDocsContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/core/base-documents.js'), 'utf8');

	// Verify create_document_from_json sets docTransp = true
	assert.match(baseDocsContent, /const\s+docTransp\s*=\s*true;/);
});
