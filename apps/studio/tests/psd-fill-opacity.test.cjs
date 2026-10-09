// Audit fix #3 (second half): Photoshop Fill % survives PSD import and export.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/psd-fill.js'), 'utf8').replace(/\bexport /g, '') + '\nthis.api = { psd_fill_to_studio, studio_fill_to_psd };', ctx);
const { psd_fill_to_studio, studio_fill_to_psd } = ctx.api;

test('import: ag-psd 0–1 → Studio 0–100; full fill stays unset', () => {
	assert.equal(psd_fill_to_studio({ fillOpacity: 0 }), 0);
	assert.equal(psd_fill_to_studio({ fillOpacity: 0.35 }), 35);
	assert.equal(psd_fill_to_studio({ fillOpacity: 1 }), null);
	assert.equal(psd_fill_to_studio({}), null);
	assert.equal(psd_fill_to_studio({ fillOpacity: 'x' }), null);
});

test('export: Studio 0–100 → ag-psd 0–1; 100 or unset writes nothing', () => {
	assert.equal(studio_fill_to_psd({ fillOpacity: 35 }), 0.35);
	assert.equal(studio_fill_to_psd({ fillOpacity: 0 }), 0);
	assert.equal(studio_fill_to_psd({ fillOpacity: 100 }), null);
	assert.equal(studio_fill_to_psd({}), null);
});

test('psd.js applies Fill on import and export', () => {
	const src = fs.readFileSync(require.resolve('../src/js/libs/psd.js'), 'utf8');
	assert.match(src, /const fill = psd_fill_to_studio\(node\);\n\t+if \(fill != null\) convertedLayer\.fillOpacity = fill;/);
	assert.match(src, /const fill = studio_fill_to_psd\(layer\);\n\t+if \(psdLayer && fill != null\) psdLayer\.fillOpacity = fill;/);
});
