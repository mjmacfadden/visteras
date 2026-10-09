const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('levels_lut: identity LUT for defaults', async () => {
	const { levels_lut, default_levels_params } = await import('../src/js/libs/levels.js');
	const def = default_levels_params();
	const lut = levels_lut(def.rgb);

	assert.equal(lut.length, 256);
	for (let i = 0; i < 256; i++) {
		assert.equal(lut[i], i, `lut[${i}] should equal ${i}`);
	}
});

test('levels_lut: inBlack 50 / inWhite 200 -> lut[50] = 0, lut[200] = 255, lut[125] ≈ 128', async () => {
	const { levels_lut } = await import('../src/js/libs/levels.js');
	const lut = levels_lut({ inBlack: 50, inWhite: 200, gamma: 1, outBlack: 0, outWhite: 255 });

	assert.equal(lut[50], 0, 'lut[50] must be 0');
	assert.equal(lut[200], 255, 'lut[200] must be 255');
	assert.equal(lut[0], 0, 'values below inBlack are clamped to 0');
	assert.equal(lut[49], 0);
	assert.equal(lut[250], 255, 'values above inWhite are clamped to 255');
	assert.equal(lut[125], 128, 'midpoint lut[125] should be 128');
});

test('levels_lut: gamma 2 -> lut[128] > 128', async () => {
	const { levels_lut } = await import('../src/js/libs/levels.js');
	const lut = levels_lut({ inBlack: 0, inWhite: 255, gamma: 2, outBlack: 0, outWhite: 255 });

	assert.ok(lut[128] > 128, `lut[128] (${lut[128]}) should be greater than 128 for gamma 2`);
	// Math: (128/255)^(1/2) * 255 ≈ 181
	assert.ok(lut[128] >= 180 && lut[128] <= 182, `expected ~181, got ${lut[128]}`);
});

test('levels_lut: output levels 20-235 maps 0->20 and 255->235', async () => {
	const { levels_lut } = await import('../src/js/libs/levels.js');
	const lut = levels_lut({ inBlack: 0, inWhite: 255, gamma: 1, outBlack: 20, outWhite: 235 });

	assert.equal(lut[0], 20, '0 should map to outBlack (20)');
	assert.equal(lut[255], 235, '255 should map to outWhite (235)');
});

test('compose_levels: per-channel then RGB composition order', async () => {
	const { compose_levels, default_levels_params } = await import('../src/js/libs/levels.js');
	const params = default_levels_params();
	// Red channel: inverts (outBlack 255, outWhite 0) -> input 0 becomes 255
	params.red = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 255, outWhite: 0 };
	// RGB channel: maps 0..255 to 10..100 -> input 255 becomes 100, input 0 becomes 10
	params.rgb = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 10, outWhite: 100 };

	const { r, g, b } = compose_levels(params);
	// If per-channel first, then RGB:
	// input 0 -> redLut[0] = 255 -> rgbLut[255] = 100.
	// If RGB first, then per-channel:
	// input 0 -> rgbLut[0] = 10 -> redLut[10] = 245 != 100.
	assert.equal(r[0], 100, 'per-channel then RGB composition order applied to red');
	// Green was default, so greenLut[0] = 0 -> rgbLut[0] = 10
	assert.equal(g[0], 10, 'green channel follows default then RGB');
	assert.equal(b[0], 10, 'blue channel follows default then RGB');
});

test('apply_levels: applies LUT in-place on 2x1 RGBA array', async () => {
	const { apply_levels, default_levels_params } = await import('../src/js/libs/levels.js');
	const params = default_levels_params();
	// Scale RGB to 50..200
	params.rgb = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 50, outWhite: 200 };

	// 2 pixels: pixel 1 = [0, 0, 0, 255], pixel 2 = [255, 255, 255, 0] (transparent)
	const data = new Uint8ClampedArray([
		0, 0, 0, 255,
		255, 255, 255, 0
	]);

	apply_levels(data, params);

	// First pixel (opaque) should be adjusted: 0 -> 50
	assert.equal(data[0], 50);
	assert.equal(data[1], 50);
	assert.equal(data[2], 50);
	assert.equal(data[3], 255);

	// Second pixel has alpha 0: transparent pixels are skipped
	assert.equal(data[4], 255);
	assert.equal(data[5], 255);
	assert.equal(data[6], 255);
	assert.equal(data[7], 0);
});

test('auto_levels: clips 0.1% on synthetic histogram', async () => {
	const { auto_levels } = await import('../src/js/libs/levels.js');
	// Synthetic histogram with 10000 total pixels:
	// 5 pixels at 0..4 (less than 0.1% = 10 pixels)
	// bulk at 50..200
	// 5 pixels at 251..255
	const rHist = new Uint32Array(256);
	rHist[0] = 5;
	rHist[50] = 5000;
	rHist[200] = 4990;
	rHist[255] = 5;

	const gHist = new Uint32Array(256);
	gHist[30] = 5000;
	gHist[220] = 5000;

	const bHist = new Uint32Array(256);
	bHist[10] = 5000;
	bHist[240] = 5000;

	const auto = auto_levels({ red: rHist, green: gHist, blue: bHist }, 0.001);

	// In red: clipCount = 10 pixels. 5 at 0 is <= 10, so inBlack reaches 50.
	assert.equal(auto.red.inBlack, 50, 'red inBlack clipped low end');
	assert.equal(auto.red.inWhite, 200, 'red inWhite clipped high end');
	assert.equal(auto.green.inBlack, 30);
	assert.equal(auto.green.inWhite, 220);
	assert.equal(auto.blue.inBlack, 10);
	assert.equal(auto.blue.inWhite, 240);
	assert.equal(auto.rgb.inBlack, 0, 'composite RGB channel remains default');
	assert.equal(auto.rgb.inWhite, 255);
});

test('PSD round-trip: studio_levels_to_psd -> psd_levels_to_studio gives the same params', async () => {
	const { studio_levels_to_psd, psd_levels_to_studio, default_levels_params } = await import('../src/js/libs/levels.js');
	const original = default_levels_params();
	original.rgb = { inBlack: 25, gamma: 1.45, inWhite: 230, outBlack: 10, outWhite: 245 };
	original.red = { inBlack: 10, gamma: 0.9, inWhite: 240, outBlack: 5, outWhite: 250 };
	original.green = { inBlack: 5, gamma: 1.1, inWhite: 250, outBlack: 0, outWhite: 255 };
	original.blue = { inBlack: 15, gamma: 0.85, inWhite: 235, outBlack: 15, outWhite: 240 };

	const psdAdj = studio_levels_to_psd(original);
	assert.equal(psdAdj.type, 'levels');
	assert.equal(psdAdj.rgb.shadowInput, 25);
	assert.equal(psdAdj.rgb.highlightInput, 230);
	assert.equal(psdAdj.rgb.midtoneInput, 1.45);
	assert.equal(psdAdj.rgb.shadowOutput, 10);
	assert.equal(psdAdj.rgb.highlightOutput, 245);

	const roundTripped = psd_levels_to_studio(psdAdj);
	assert.deepEqual(roundTripped.rgb, original.rgb);
	assert.deepEqual(roundTripped.red, original.red);
	assert.deepEqual(roundTripped.green, original.green);
	assert.deepEqual(roundTripped.blue, original.blue);
});

test('migrate_psd_unsupported_levels: converts legacy placeholder to real Levels layer', async () => {
	const { migrate_psd_unsupported_levels } = await import('../src/js/libs/levels.js');
	const layer = {
		name: 'Levels 1 (unsupported)',
		type: 'adjustment',
		adjustment_type: 'brightness',
		params: { value: 0 },
		psd_unsupported: {
			type: 'levels',
			label: 'Levels',
			raw: {
				type: 'levels',
				rgb: { shadowInput: 18, highlightInput: 228, midtoneInput: 1.25, shadowOutput: 5, highlightOutput: 250 }
			}
		}
	};

	migrate_psd_unsupported_levels(layer);

	assert.equal(layer.name, 'Levels 1', 'strips (unsupported) suffix');
	assert.equal(layer.adjustment_type, 'levels');
	assert.equal(layer.psd_unsupported, undefined, 'removes psd_unsupported');
	assert.equal(layer.params.rgb.inBlack, 18);
	assert.equal(layer.params.rgb.inWhite, 228);
	assert.equal(layer.params.rgb.gamma, 1.25);
	assert.equal(layer.params.rgb.outBlack, 5);
	assert.equal(layer.params.rgb.outWhite, 250);
});

test('source assertions: menu, shortcuts, and Adjustments panel integration', () => {
	const menuSrc = fs.readFileSync(path.resolve(__dirname, '../src/js/config-menu.js'), 'utf8');
	assert.match(menuSrc, /name:\s*['"]Levels['"],\s*ellipsis:\s*true,\s*shortcut:\s*['"]Ctrl \+ Alt \+ L['"],\s*target:\s*['"]layer\/adjustment\.levels['"]/);

	const shortcutsSrc = fs.readFileSync(path.resolve(__dirname, '../src/js/core/gui/gui-shortcuts.js'), 'utf8');
	assert.match(shortcutsSrc, /eventMatchesChord\(event,\s*\{\s*meta:\s*true,\s*key:\s*['"]L['"]\s*\},/);
	assert.match(shortcutsSrc, /app\.GUI\.modules\['layer\/adjustment'\]\.create_or_edit\('levels'\)/);

	const adjustmentsSrc = fs.readFileSync(path.resolve(__dirname, '../src/js/core/gui/gui-adjustments.js'), 'utf8');
	assert.match(adjustmentsSrc, /\{\s*name:\s*['"]Levels['"],\s*target:\s*['"]layer\/adjustment\.levels['"],\s*type:\s*['"]levels['"]\s*\}/);

	const iconsSrc = fs.readFileSync(path.resolve(__dirname, '../src/js/core/gui/adjustment-icons.js'), 'utf8');
	assert.match(iconsSrc, /['"]levels['"]:\s*`<svg class="adj_icon"/);

	const helpShortcutsSrc = fs.readFileSync(path.resolve(__dirname, '../src/js/modules/help/shortcuts.js'), 'utf8');
	assert.match(helpShortcutsSrc, /format_shortcut\(['"]Ctrl \+ Alt \+ L['"]\)/);
});
