/**
 * Studio background-auto Web Worker.
 * Loads onnx-community/ISNet-ONNX via @huggingface/transformers (WebGPU → WASM).
 * Transformers.js is imported from jsDelivr at runtime so the multi‑MB vendor
 * bundle (and false-positive secret scanners on model-name strings) never lands
 * in apps/studio/dist.
 */
var TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.web.min.js';

var pipe = null;
var loadedDevice = null;
var loadedModelId = null;
var transformersPromise = null;

function load_transformers() {
	if (!transformersPromise) {
		transformersPromise = import(/* webpackIgnore: true */ TRANSFORMERS_CDN).then(function (mod) {
			var env = mod.env;
			env.allowLocalModels = false;
			env.useBrowserCache = true;
			env.useFS = false;
			env.useFSCache = false;
			// Leave onnx.wasm.wasmPaths unset so Transformers.js picks jsDelivr ORT WASM.
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
		if (/fetch|network|Failed to fetch|Load failed|HTTP/i.test(message)) {
			code = 'download_failed';
		} else if (/memory|out of memory|OOM|allocation/i.test(message)) {
			code = 'oom';
		}
		self.postMessage({ id: id, type: 'error', code: code, message: message });
	}
};
