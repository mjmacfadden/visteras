// Item 1 (broken): PSD adjustment layers Studio can't render (Levels, Curves, …)
// used to become a silent Brightness 0 no-op. Now: recognisable placeholder,
// warning toast, Properties note, and unchanged PSD round-trip.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
	const src = fs.readFileSync(require.resolve('../src/js/libs/psd-unsupported.js'), 'utf8').replace(/\bexport /g, '');
	const ctx = vm.createContext({});
	vm.runInContext(src + '\nthis.api = { PSD_ADJUSTMENT_LABELS, psd_adjustment_label, unsupported_adjustment_fields, unsupported_labels, unsupported_import_message, unsupported_export_adjustment };', ctx);
	return ctx.api;
}
const api = load();

test('Levels becomes a recognisable "(unsupported)" placeholder that keeps the raw settings', () => {
	const levels = { type: 'levels', rgb: { shadowInput: 10, highlightInput: 240, midtoneInput: 1.2, shadowOutput: 0, highlightOutput: 255 } };
	const f = api.unsupported_adjustment_fields(levels, 'Levels 1');
	assert.equal(f.name, 'Levels 1 (unsupported)');
	assert.equal(f.adjustment_type, 'brightness');
	assert.deepEqual(JSON.parse(JSON.stringify(f.params)), { value: 0 });
	assert.equal(f.psd_unsupported.type, 'levels');
	assert.equal(f.psd_unsupported.label, 'Levels');
	assert.deepEqual(JSON.parse(JSON.stringify(f.psd_unsupported.raw)), levels);
	assert.equal(api.unsupported_adjustment_fields(levels, 'X (unsupported)').name, 'X (unsupported)', 'no double suffix');
	assert.equal(api.unsupported_adjustment_fields({ type: 'curves' }, '').name, 'Curves (unsupported)');
});

test('labels cover the common Photoshop adjustments; unknown types get a readable label', () => {
	for (const [k, v] of [['curves', 'Curves'], ['color balance', 'Color Balance'], ['gradient map', 'Gradient Map'], ['vibrance', 'Vibrance'], ['color lookup', 'Color Lookup'], ['selective color', 'Selective Color'], ['channel mixer', 'Channel Mixer'], ['posterize', 'Posterize']]) {
		assert.equal(api.psd_adjustment_label(k), v);
	}
	assert.equal(api.psd_adjustment_label('fancy thing'), 'Fancy Thing');
});

test('one warning lists each unsupported type once; nothing when all are supported', () => {
	const layers = [{ psd_unsupported: { label: 'Levels' } }, { name: 'x' }, { psd_unsupported: { label: 'Curves' } }, { psd_unsupported: { label: 'Levels' } }];
	assert.deepEqual([...api.unsupported_labels(layers)], ['Levels', 'Curves']);
	const msg = api.unsupported_import_message(['Levels', 'Curves']);
	assert.match(msg, /can't apply yet \(Levels, Curves\)/);
	assert.match(msg, /placeholder/);
	assert.equal(api.unsupported_import_message([]), '');
});

test('PSD export writes the original adjustment back; ordinary layers are untouched', () => {
	const raw = { type: 'curves', rgb: [{ input: 0, output: 0 }, { input: 128, output: 150 }, { input: 255, output: 255 }] };
	const out = api.unsupported_export_adjustment({ psd_unsupported: { raw } });
	assert.deepEqual(JSON.parse(JSON.stringify(out)), raw);
	assert.notEqual(out, raw, 'a copy');
	assert.equal(api.unsupported_export_adjustment({ adjustment_type: 'brightness' }), null);
});

test('psd.js wiring: default branch uses the placeholder, warns once, and export passes it through', () => {
	const src = fs.readFileSync(require.resolve('../src/js/libs/psd.js'), 'utf8');
	const def = src.slice(src.indexOf('function convert_psd_adjustment'), src.indexOf('function parse_psd_color'));
	assert.match(def, /default: \{[\s\S]*unsupported = unsupported_adjustment_fields\(adj, name\);/);
	assert.match(def, /model\.psd_unsupported = unsupported\.psd_unsupported;/);
	assert.match(src, /const unsupportedMsg = unsupported_import_message\(unsupported_labels\(layers\)\);\n\tif \(unsupportedMsg\) alertify\.warning\(unsupportedMsg, 15\);/);
	assert.match(src, /const passthrough = unsupported_export_adjustment\(layer\);\n\t\tif \(passthrough\) adjObj = passthrough;/);
	const props = fs.readFileSync(require.resolve('../src/js/core/gui/gui-properties.js'), 'utf8');
	assert.match(props, /if \(layer\.psd_unsupported\) \{[\s\S]*id="properties_psd_unsupported"/);
});

test('end to end: a PSD with Levels imports as a placeholder, warns once, and exports Levels again', async () => {
	const { createCanvas } = require('@napi-rs/canvas');
	const warnings = [];
	const context = vm.createContext({ config: { layers: [] }, console: { log() {}, warn: (...a) => warnings.push('WARN ' + a.map(String).join(' ')) }, alertify: { success() {}, warning: (m) => warnings.push(m), error: (m) => warnings.push('ERR ' + m) }, document: { createElement: () => createCanvas(1, 1) }, performance, HTMLCanvasElement: createCanvas(1, 1).constructor, ImageData: require('@napi-rs/canvas').ImageData });
	const strip = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8').replace(/^import .*;$/gm, '').replace(/export default \{[\s\S]*?\};/g, '').replace(/^export default .*;$/gm, '').replace(/\bexport /g, '');
	vm.runInContext(['libs/layer-tree.js', 'libs/layer-clip.js', 'libs/text-geometry.js', 'libs/psd-fill.js', 'libs/psd-unsupported.js'].map(strip).join('\n')
		+ fs.readFileSync(require.resolve('../src/js/libs/psd.js'), 'utf8').replace(/^import .*;$/gm, '').replace(/\bexport (?=(?:async )?function)/g, ''), context);
	let imported;
	context.app = { Documents: { create_document_from_psd_data: (d) => { imported = d; } } };
	context.psdFixture = { width: 40, height: 24, children: [
		{ name: 'Levels 1', adjustment: { type: 'levels', rgb: { shadowInput: 12, highlightInput: 230, midtoneInput: 1.1, shadowOutput: 0, highlightOutput: 255 } } },
		{ name: 'Curves 1', adjustment: { type: 'curves', rgb: [{ input: 0, output: 0 }, { input: 255, output: 255 }] } },
		{ name: 'Hue/Saturation 1', adjustment: { type: 'hue/saturation', master: { hue: 10, saturation: 0, lightness: 0 } } },
		{ name: 'Faded', fillOpacity: 0.4, left: 0, top: 0, right: 4, bottom: 4, canvas: createCanvas(4, 4) },
	] };
	vm.runInContext('agPsdModulePromise = Promise.resolve({readPsd: () => psdFixture})', context);
	await context.load_psd(new ArrayBuffer(0), 'client.psd');
	assert.ok(imported, JSON.stringify(warnings));
	const [lv, cv, hs] = imported.layers;
	assert.equal(lv.name, 'Levels 1 (unsupported)');
	assert.equal(lv.psd_unsupported.label, 'Levels');
	assert.equal(cv.name, 'Curves 1 (unsupported)');
	assert.equal(hs.name, 'Hue/Saturation 1');
	assert.equal(hs.psd_unsupported, undefined);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /\(Levels, Curves\)/);
	context.exportLayers = imported.layers;
	const exported = vm.runInContext('build_psd_children_tree(exportLayers, 0, 40, 24)', context);
	const types = exported.map((l) => l.adjustment && l.adjustment.type);
	assert.ok(types.includes('levels') && types.includes('curves') && types.includes('hue/saturation'), JSON.stringify(types));
	const lvOut = exported.find((l) => l.adjustment && l.adjustment.type === 'levels');
	assert.equal(lvOut.adjustment.rgb.shadowInput, 12);
	const faded = imported.layers.find((l) => l.name === 'Faded');
	assert.equal(faded && faded.fillOpacity, 40, 'Fill % imported');
	const fadedOut = exported.find((l) => l.name === 'Faded');
	assert.equal(fadedOut && fadedOut.fillOpacity, 0.4, 'Fill % exported');
});
