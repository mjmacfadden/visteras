const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Test the Color Mixer logic extracted from raw_develop.js
const code = fs.readFileSync(require.resolve('../src/js/modules/image/raw_develop.js'), 'utf8');

test('Color Mixer: DEFAULTS contain all 24 color mixer parameters plus mixer_enabled', () => {
	assert.match(code, /mixer_enabled:\s*true/);
	const bands = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
	for (const b of bands) {
		assert.match(code, new RegExp(`mixer_hue_${b}:\\s*0`));
		assert.match(code, new RegExp(`mixer_sat_${b}:\\s*0`));
		assert.match(code, new RegExp(`mixer_lum_${b}:\\s*0`));
	}
});

test('Color Mixer: PANELS list includes color_mixer right after color', () => {
	assert.match(code, /id:\s*'color'[\s\S]*?id:\s*'color_mixer'[\s\S]*?id:\s*'presence'/);
});

test('Color Mixer: algorithm accurately desaturates targeted color without affecting other colors', () => {
	// Setup ImageData mock
	class MockImageData {
		constructor(data, width, height) {
			this.data = data;
			this.width = width;
			this.height = height;
		}
	}
	const sandbox = {
		ImageData: MockImageData,
		Uint8ClampedArray,
		Float32Array,
		Math,
		console,
	};
	const context = vm.createContext(sandbox);

	// Extract helper functions and applyColorMixer
	const script = `
		${code.slice(code.indexOf('var MIXER_BANDS = ['))}
	`.replace(/export default[\s\S]*$/, '');

	vm.runInContext(script, context);

	// Create test image with 3 pixels: Pure Red, Pure Green, Pure Blue
	// Red: (255, 0, 0)
	// Green: (0, 255, 0)
	// Blue: (0, 0, 255)
	const raw = new Uint8ClampedArray([
		255, 0, 0, 255,
		0, 255, 0, 255,
		0, 0, 255, 255
	]);
	const img = new MockImageData(raw, 3, 1);

	// Case 1: All 0 -> hasColorMixer is false
	assert.equal(context.hasColorMixer({}), false);

	// Case 2: Desaturate Red (-100)
	const paramsRedDesat = {
		mixer_enabled: true,
		mixer_sat_red: -100
	};
	assert.equal(context.hasColorMixer(paramsRedDesat), true);

	context.applyColorMixer(img, paramsRedDesat);

	// Red pixel should now be gray (R ≈ G ≈ B)
	const r0 = img.data[0], g0 = img.data[1], b0 = img.data[2];
	assert.ok(Math.abs(r0 - g0) <= 2 && Math.abs(g0 - b0) <= 2, `Red was desaturated to gray: R=${r0}, G=${g0}, B=${b0}`);
	assert.ok(r0 > 50, `Luminance preserved on desaturated red: R=${r0}`);

	// Green pixel should remain pure green (R=0, G=255, B=0)
	assert.equal(img.data[4], 0);
	assert.equal(img.data[5], 255);
	assert.equal(img.data[6], 0);

	// Blue pixel should remain pure blue (R=0, G=0, B=255)
	assert.equal(img.data[8], 0);
	assert.equal(img.data[9], 0);
	assert.equal(img.data[10], 255);
});

test('Color Mixer: Hue shift shifts blue towards purple', () => {
	class MockImageData {
		constructor(data, width, height) {
			this.data = data;
			this.width = width;
			this.height = height;
		}
	}
	const sandbox = {
		ImageData: MockImageData,
		Uint8ClampedArray,
		Float32Array,
		Math,
		console,
	};
	const context = vm.createContext(sandbox);
	const script = `
		${code.slice(code.indexOf('var MIXER_BANDS = ['))}
	`.replace(/export default[\s\S]*$/, '');
	vm.runInContext(script, context);

	// Pure Blue pixel: (0, 0, 255)
	const raw = new Uint8ClampedArray([0, 0, 255, 255]);
	const img = new MockImageData(raw, 1, 1);

	// Shift blue hue +100 (towards purple/magenta -> adds red component)
	context.applyColorMixer(img, {
		mixer_enabled: true,
		mixer_hue_blue: 100
	});

	assert.ok(img.data[0] > 0, `Blue shifted towards purple gained red component: R=${img.data[0]}`);
	assert.equal(img.data[1], 0, `Green component stayed 0: G=${img.data[1]}`);
	assert.ok(img.data[2] > 200, `Blue component remains high: B=${img.data[2]}`);
});

test('Color Mixer: Luminance adjustment brightens targeted color', () => {
	class MockImageData {
		constructor(data, width, height) {
			this.data = data;
			this.width = width;
			this.height = height;
		}
	}
	const sandbox = {
		ImageData: MockImageData,
		Uint8ClampedArray,
		Float32Array,
		Math,
		console,
	};
	const context = vm.createContext(sandbox);
	const script = `
		${code.slice(code.indexOf('var MIXER_BANDS = ['))}
	`.replace(/export default[\s\S]*$/, '');
	vm.runInContext(script, context);

	// Mid Green pixel: (0, 150, 0)
	const raw = new Uint8ClampedArray([0, 150, 0, 255]);
	const img = new MockImageData(raw, 1, 1);

	context.applyColorMixer(img, {
		mixer_enabled: true,
		mixer_lum_green: 80
	});

	assert.ok(img.data[1] > 170, `Green pixel brightened: G=${img.data[1]}`);
});

test('Color Mixer: mixer_enabled=false bypasses adjustments', () => {
	class MockImageData {
		constructor(data, width, height) {
			this.data = data;
			this.width = width;
			this.height = height;
		}
	}
	const sandbox = {
		ImageData: MockImageData,
		Uint8ClampedArray,
		Float32Array,
		Math,
		console,
	};
	const context = vm.createContext(sandbox);
	const script = `
		${code.slice(code.indexOf('var MIXER_BANDS = ['))}
	`.replace(/export default[\s\S]*$/, '');
	vm.runInContext(script, context);

	const raw = new Uint8ClampedArray([255, 0, 0, 255]);
	const img = new MockImageData(raw, 1, 1);

	assert.equal(context.hasColorMixer({ mixer_enabled: false, mixer_sat_red: -100 }), false);
});
