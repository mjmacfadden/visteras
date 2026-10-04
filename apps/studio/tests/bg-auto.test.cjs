const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const workerCode = fs.readFileSync(require.resolve('../src/js/workers/bg-auto-worker.js'), 'utf8');
const mattingCode = fs.readFileSync(require.resolve('../src/js/libs/refine-edge/matting.js'), 'utf8');
const runtimeCode = fs.readFileSync(require.resolve('../src/js/libs/bg-auto/runtime.js'), 'utf8');

test('bg-auto worker: get_pipeline_attempts orders WebGPU to try fp16, fp32, q8 with wasm fallback', () => {
	const sandbox = {
		Set,
	};
	const context = vm.createContext(sandbox);

	const fnCode = workerCode.slice(
		workerCode.indexOf('function get_pipeline_attempts('),
		workerCode.indexOf('async function ensure_pipeline(')
	);
	vm.runInContext(fnCode, context);

	// WebGPU default attempts
	const gpuAttempts = JSON.parse(JSON.stringify(context.get_pipeline_attempts('webgpu', null)));
	assert.deepEqual(gpuAttempts, [
		{ device: 'webgpu', dtype: 'fp16' },
		{ device: 'webgpu', dtype: 'fp32' },
		{ device: 'webgpu', dtype: 'q8' },
		{ device: 'wasm', dtype: 'q8' },
	]);

	// WASM default attempts
	const wasmAttempts = JSON.parse(JSON.stringify(context.get_pipeline_attempts('wasm', null)));
	assert.deepEqual(wasmAttempts, [
		{ device: 'wasm', dtype: 'q8' },
	]);

	// Auto default attempts
	const autoAttempts = JSON.parse(JSON.stringify(context.get_pipeline_attempts('auto', null)));
	assert.deepEqual(autoAttempts, [
		{ device: 'webgpu', dtype: 'fp16' },
		{ device: 'webgpu', dtype: 'fp32' },
		{ device: 'webgpu', dtype: 'q8' },
		{ device: 'wasm', dtype: 'q8' },
	]);

	// Custom preferDtype honored first
	const customAttempts = JSON.parse(JSON.stringify(context.get_pipeline_attempts('webgpu', 'fp32')));
	assert.equal(customAttempts[0].dtype, 'fp32');
	assert.equal(customAttempts[0].device, 'webgpu');
});

test('bg-auto runtime: prepare_model_input downscales images > 1024px to proxy resolution', () => {
	class MockCanvas {
		constructor(width, height) {
			this.width = width;
			this.height = height;
		}
		getContext() {
			return {
				imageSmoothingEnabled: false,
				imageSmoothingQuality: 'low',
				drawImage: () => {},
			};
		}
	}

	const sandbox = {
		document: {
			createElement: (tag) => {
				if (tag === 'canvas') return new MockCanvas(0, 0);
				return {};
			}
		},
		Math,
		MAX_INPUT_MP: 8,
		MODEL_MAX_SIDE: 1024,
	};
	const context = vm.createContext(sandbox);

	const fnCode = runtimeCode.slice(
		runtimeCode.indexOf('export function prepare_model_input('),
		runtimeCode.indexOf('export function upscale_matte(')
	).replace('export function prepare_model_input(', 'function prepare_model_input(');

	vm.runInContext(fnCode, context);

	// 1. Small image (800x600) stays unchanged
	const small = new MockCanvas(800, 600);
	const prepSmall = context.prepare_model_input(small);
	assert.equal(prepSmall.width, 800);
	assert.equal(prepSmall.height, 600);
	assert.equal(prepSmall.scaleX, 1);
	assert.equal(prepSmall.scaleY, 1);

	// 2. High-res image (4000x3000) downscaled to 1024x768
	const large = new MockCanvas(4000, 3000);
	const prepLarge = context.prepare_model_input(large);
	assert.equal(prepLarge.width, 1024);
	assert.equal(prepLarge.height, 768);
	assert.equal(Math.round(prepLarge.scaleX * 100) / 100, Math.round((4000 / 1024) * 100) / 100);

	// 3. Zero size throws error
	const empty = new MockCanvas(0, 0);
	assert.throws(() => context.prepare_model_input(empty), /no image/i);
});

test('bg-auto runtime: refine_matte_edges sharpens blurred mask edges against high-res photographic guide', () => {
	class MockImageData {
		constructor(data, width, height) {
			this.data = data;
			this.width = width;
			this.height = height;
		}
	}

	class MockCanvas {
		constructor(width, height, data) {
			this.width = width;
			this.height = height;
			this._data = data || new Uint8ClampedArray(width * height * 4);
		}
		getContext() {
			return {
				getImageData: (x, y, w, h) => new MockImageData(this._data, w, h),
				putImageData: (img) => { this._data = img.data; }
			};
		}
	}

	// Extract fastGuidedFilter and its box blur dependencies
	const filterCode = mattingCode.slice(
		mattingCode.indexOf('function boxBlurH('),
		mattingCode.indexOf('export function colorGuidedMatting(')
	).replace(/export /g, '');

	const refineCode = runtimeCode.slice(
		runtimeCode.indexOf('export function refine_matte_edges('),
		runtimeCode.indexOf('export async function compute_matte(')
	).replace('export function refine_matte_edges(', 'function refine_matte_edges(');

	const sandbox = {
		ImageData: MockImageData,
		Uint8ClampedArray,
		Float32Array,
		Math,
	};
	const context = vm.createContext(sandbox);
	vm.runInContext(filterCode + '\n' + refineCode, context);

	// Create a 16x16 2D step image: left half is dark (0), right half is bright (255)
	const W = 16;
	const H = 16;
	const guidePixels = new Uint8ClampedArray(W * H * 4);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const val = x < 8 ? 0 : 255;
			const idx = (y * W + x) * 4;
			guidePixels[idx] = val;
			guidePixels[idx + 1] = val;
			guidePixels[idx + 2] = val;
			guidePixels[idx + 3] = 255;
		}
	}
	const guideCanvas = new MockCanvas(W, H, guidePixels);

	// Bilinearly upscaled mask has blurry transition at x=6, 7, 8, 9
	const maskPixels = new Uint8ClampedArray(W * H * 4);
	const initialRow = [0, 0, 0, 0, 10, 30, 80, 128, 175, 220, 245, 255, 255, 255, 255, 255];
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const val = initialRow[x];
			const idx = (y * W + x) * 4;
			maskPixels[idx] = val;
			maskPixels[idx + 1] = val;
			maskPixels[idx + 2] = val;
			maskPixels[idx + 3] = 255;
		}
	}
	const maskCanvas = new MockCanvas(W, H, maskPixels);

	// Run edge refinement
	context.refine_matte_edges(guideCanvas, maskCanvas, { refineRadius: 2, refineEps: 0.001 });

	const result = maskCanvas.getContext().getImageData(0, 0, W, H).data;
	const midY = 8;
	const refinedAlphas = [];
	for (let x = 0; x < W; x++) {
		refinedAlphas.push(result[(midY * W + x) * 4]);
	}

	// Verify that the boundary contrast was heightened to follow the guide image edge:
	// Dark side (x=6, 7) should be suppressed lower than blurry initial
	// Bright side (x=8, 9) should be boosted higher than blurry initial
	assert.ok(refinedAlphas[7] < initialRow[7], `Expected refinedAlphas[7] (${refinedAlphas[7]}) < initialRow[7] (${initialRow[7]})`);
	assert.ok(refinedAlphas[8] > initialRow[8], `Expected refinedAlphas[8] (${refinedAlphas[8]}) > initialRow[8] (${initialRow[8]})`);
});
