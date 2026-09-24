/**
 * Studio background-auto Web Worker.
 * Loads onnx-community/ISNet-ONNX via @huggingface/transformers (WebGPU → WASM).
 *
 * Transformers.js is imported from jsDelivr `/+esm` (not the raw dist file) so bare
 * package imports like `onnxruntime-web/webgpu` are rewritten to absolute CDN URLs.
 * That is required in module workers (import maps do not apply). Versions are pinned
 * in config.js to match the npm dependency; the URLs are passed from the main thread.
 */
var DEFAULT_TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';
var DEFAULT_ORT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';

var pipe = null;
var loadedDevice = null;
var loadedModelId = null;
var transformersPromise = null;
var transformersCdn = DEFAULT_TRANSFORMERS_CDN;
var ortWasmCdn = DEFAULT_ORT_WASM_CDN;

function load_transformers() {
	if (!transformersPromise) {
		transformersPromise = import(/* webpackIgnore: true */ transformersCdn).then(function (mod) {
			var env = mod.env;
			env.allowLocalModels = false;
			env.useBrowserCache = true;
			env.useFS = false;
			env.useFSCache = false;
			// Pin ORT WASM/JSEP factory to the same onnxruntime-web version as npm.
			env.backends.onnx = env.backends.onnx || {};
			env.backends.onnx.wasm = env.backends.onnx.wasm || {};
			env.backends.onnx.wasm.wasmPaths = ortWasmCdn;
			return mod;
		});
	}
	return transformersPromise;
}

function apply_model_location(env, location) {
	location = (location || '').trim();
	if (!location) {
		return 'onnx-community/ISNet-ONNX';
	}
	if (/^https?:\/\//i.test(location)) {
		var base = location.replace(/\/+$/, '');
		env.remoteHost = base + '/';
		env.remotePathTemplate = '{file}';
		return 'ISNet-ONNX';
	}
	env.remoteHost = 'https://huggingface.co/';
	env.remotePathTemplate = '{model}/resolve/{revision}/';
	return location;
}

async function ensure_pipeline(modelLocation, preferDevice, progressPort) {
	var mod = await load_transformers();
	var pipeline = mod.pipeline;
	var env = mod.env;
	var modelId = apply_model_location(env, modelLocation);
	var devices = [];
	if (preferDevice === 'wasm') {
		devices = ['wasm'];
	} else if (preferDevice === 'webgpu') {
		devices = ['webgpu', 'wasm'];
	} else {
		devices = ['webgpu', 'wasm'];
	}

	if (pipe && loadedModelId === modelId && devices.indexOf(loadedDevice) >= 0) {
		return { device: loadedDevice, modelId: modelId };
	}

	if (pipe && typeof pipe.dispose === 'function') {
		try { await pipe.dispose(); } catch (e) { /* ignore */ }
		pipe = null;
		loadedDevice = null;
		loadedModelId = null;
	}

	var lastError = null;
	for (var i = 0; i < devices.length; i++) {
		var device = devices[i];
		try {
			pipe = await pipeline('background-removal', modelId, {
				device: device,
				dtype: 'q8',
				progress_callback: function (data) {
					if (progressPort) {
						progressPort.postMessage({ type: 'progress', data: data });
					}
				},
			});
			loadedDevice = device;
			loadedModelId = modelId;
			return { device: device, modelId: modelId };
		} catch (err) {
			lastError = err;
			pipe = null;
		}
	}
	throw lastError || new Error('Failed to load background-removal model');
}

function matte_from_raw_image(raw) {
	var w = raw.width;
	var h = raw.height;
	var src = raw.data;
	var channels = raw.channels || 4;
	var gray = new Uint8ClampedArray(w * h);

	if (channels === 4) {
		for (var i = 0, p = 0; i < src.length; i += 4, p++) {
			gray[p] = src[i + 3];
		}
	} else if (channels === 1) {
		gray.set(src);
	} else if (channels === 3) {
		for (var j = 0, q = 0; j < src.length; j += 3, q++) {
			gray[q] = Math.round(0.2126 * src[j] + 0.7152 * src[j + 1] + 0.0722 * src[j + 2]);
		}
	} else {
		throw new Error('Unexpected model output channels: ' + channels);
	}
	return { width: w, height: h, data: gray };
}

self.onmessage = async function (event) {
	var msg = event.data || {};
	var id = msg.id;
	try {
		if (msg.transformersCdn) {
			transformersCdn = String(msg.transformersCdn);
		}
		if (msg.ortWasmCdn) {
			ortWasmCdn = String(msg.ortWasmCdn);
			// Reset loader if CDN pin changes before first successful import.
			if (!pipe) {
				transformersPromise = null;
			}
		}
		if (msg.type === 'ping') {
			self.postMessage({ id: id, type: 'pong' });
			return;
		}
		if (msg.type === 'load') {
			var info = await ensure_pipeline(msg.modelLocation, msg.device, null);
			self.postMessage({ id: id, type: 'ready', device: info.device, modelId: info.modelId });
			return;
		}
		if (msg.type === 'infer') {
			var t0 = performance.now();
			var info2 = await ensure_pipeline(msg.modelLocation, msg.device, {
				postMessage: function (payload) {
					self.postMessage(Object.assign({ id: id }, payload));
				},
			});
			var tLoad = performance.now();

			var canvas = new OffscreenCanvas(msg.width, msg.height);
			var ctx = canvas.getContext('2d');
			var imageData = new ImageData(new Uint8ClampedArray(msg.pixels), msg.width, msg.height);
			ctx.putImageData(imageData, 0, 0);

			var output = await pipe(canvas);
			var raw = Array.isArray(output) ? output[0] : output;
			var matte = matte_from_raw_image(raw);
			var tInfer = performance.now();

			self.postMessage({
				id: id,
				type: 'result',
				width: matte.width,
				height: matte.height,
				matte: matte.data.buffer,
				device: info2.device,
				modelId: info2.modelId,
				timings: {
					ensure_ms: Math.round(tLoad - t0),
					infer_ms: Math.round(tInfer - tLoad),
					total_ms: Math.round(tInfer - t0),
				},
			}, [matte.data.buffer]);
			return;
		}
		throw new Error('Unknown worker message type: ' + msg.type);
	} catch (err) {
		var message = (err && err.message) ? err.message : String(err);
		var code = 'infer_failed';
		if (/fetch|network|Failed to fetch|Load failed|HTTP|Failed to resolve module/i.test(message)) {
			code = 'download_failed';
		} else if (/memory|out of memory|OOM|allocation/i.test(message)) {
			code = 'oom';
		}
		self.postMessage({ id: id, type: 'error', code: code, message: message });
	}
};
