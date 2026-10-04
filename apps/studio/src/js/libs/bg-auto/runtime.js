/**
 * Background-auto runtime (webpack chunk: bg-auto).
 * Spawns the Web Worker, handles progress UI, and returns grayscale mattes.
 */
import config from './../../config.js';
import { fastGuidedFilter } from '../refine-edge/matting.js';

var worker = null;
var reqId = 0;
var pending = new Map();
var progressEl = null;

var MAX_INPUT_MP = 8; // hard cap ~8 megapixels
var MODEL_MAX_SIDE = 1024;

function get_model_location() {
	return (config.BG_AUTO_MODEL_LOCATION != null && String(config.BG_AUTO_MODEL_LOCATION).trim() !== '')
		? String(config.BG_AUTO_MODEL_LOCATION).trim()
		: 'onnx-community/ISNet-ONNX';
}

function get_transformers_cdn() {
	return (config.BG_AUTO_TRANSFORMERS_CDN != null && String(config.BG_AUTO_TRANSFORMERS_CDN).trim() !== '')
		? String(config.BG_AUTO_TRANSFORMERS_CDN).trim()
		: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';
}

function get_ort_wasm_cdn() {
	return (config.BG_AUTO_ORT_WASM_CDN != null && String(config.BG_AUTO_ORT_WASM_CDN).trim() !== '')
		? String(config.BG_AUTO_ORT_WASM_CDN).trim()
		: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';
}

function ensure_worker() {
	if (worker) return worker;
	worker = new Worker(new URL(/* webpackChunkName: "bg-auto-worker" */ './../../workers/bg-auto-worker.js', import.meta.url));
	worker.onmessage = function (event) {
		var msg = event.data || {};
		var entry = pending.get(msg.id);
		if (!entry) return;

		if (msg.type === 'progress') {
			if (typeof entry.onProgress === 'function') {
				entry.onProgress(msg.data);
			}
			if (!entry.silent) {
				update_progress_ui(msg.data);
			}
			return;
		}
		if (msg.type === 'result' || msg.type === 'ready' || msg.type === 'pong') {
			pending.delete(msg.id);
			if (!entry.silent) {
				hide_progress_ui();
			}
			entry.resolve(msg);
			return;
		}
		if (msg.type === 'error') {
			pending.delete(msg.id);
			if (!entry.silent) {
				hide_progress_ui();
			}
			var err = new Error(msg.message || 'Background removal failed');
			err.code = msg.code || 'infer_failed';
			entry.reject(err);
		}
	};
	worker.onerror = function (event) {
		var message = (event && event.message) ? event.message : 'Background removal worker crashed';
		pending.forEach(function (entry) {
			entry.reject(new Error(message));
		});
		pending.clear();
		hide_progress_ui();
		try { worker.terminate(); } catch (e) { /* ignore */ }
		worker = null;
	};
	return worker;
}

function call_worker(payload, onProgress) {
	ensure_worker();
	var id = ++reqId;
	return new Promise(function (resolve, reject) {
		pending.set(id, {
			resolve: resolve,
			reject: reject,
			onProgress: onProgress,
			silent: !!payload.silent,
		});
		var transfer = [];
		if (payload.pixels && payload.pixels.buffer) {
			transfer.push(payload.pixels.buffer);
		}
		worker.postMessage(Object.assign({
			id: id,
			transformersCdn: get_transformers_cdn(),
			ortWasmCdn: get_ort_wasm_cdn(),
		}, payload), transfer);
	});
}

function format_progress(data) {
	if (!data) return 'Preparing model…';
	var status = data.status || '';
	var file = data.file || data.name || '';
	if (status === 'progress' && data.progress != null) {
		var pct = Math.max(0, Math.min(100, Math.round(data.progress)));
		return 'Downloading model… ' + pct + '%' + (file ? ' (' + file + ')' : '');
	}
	if (status === 'done' || status === 'ready') {
		return 'Model ready…';
	}
	if (status === 'initiate' || status === 'download') {
		return 'Downloading model…' + (file ? ' ' + file : '');
	}
	if (status) {
		return String(status) + (file ? ': ' + file : '');
	}
	return 'Working…';
}

function show_progress_ui(text) {
	if (!progressEl) {
		progressEl = document.createElement('div');
		progressEl.id = 'bg_auto_progress';
		progressEl.setAttribute('role', 'status');
		progressEl.style.cssText = [
			'position:fixed', 'left:50%', 'top:72px', 'transform:translateX(-50%)',
			'z-index:100000', 'background:rgba(20,20,20,0.92)', 'color:#fff',
			'padding:10px 16px', 'border-radius:6px', 'font:13px/1.4 sans-serif',
			'box-shadow:0 4px 16px rgba(0,0,0,0.35)', 'pointer-events:none',
			'max-width:min(480px,90vw)', 'text-align:center',
		].join(';');
		document.body.appendChild(progressEl);
	}
	progressEl.textContent = text || 'Working…';
	progressEl.style.display = 'block';
}

function update_progress_ui(data) {
	show_progress_ui(format_progress(data));
}

function hide_progress_ui() {
	if (progressEl) {
		progressEl.style.display = 'none';
	}
}

/**
 * Downscale a source canvas so longest side <= MODEL_MAX_SIDE and total pixels <= MAX_INPUT_MP.
 * Returns { canvas, scaleX, scaleY } relative to the original source size.
 */
export function prepare_model_input(sourceCanvas) {
	var srcW = sourceCanvas.width;
	var srcH = sourceCanvas.height;
	if (!srcW || !srcH) {
		throw Object.assign(new Error('Layer has no image data.'), { code: 'no_image' });
	}

	var mp = (srcW * srcH) / 1e6;
	var scale = 1;
	if (mp > MAX_INPUT_MP) {
		scale = Math.sqrt(MAX_INPUT_MP / mp);
	}
	var maxSide = Math.max(srcW, srcH) * scale;
	if (maxSide > MODEL_MAX_SIDE) {
		scale *= MODEL_MAX_SIDE / maxSide;
	}

	var outW = Math.max(1, Math.round(srcW * scale));
	var outH = Math.max(1, Math.round(srcH * scale));

	if (outW === srcW && outH === srcH) {
		return { canvas: sourceCanvas, scaleX: 1, scaleY: 1, width: outW, height: outH };
	}

	var canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	var ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(sourceCanvas, 0, 0, outW, outH);
	return { canvas: canvas, scaleX: srcW / outW, scaleY: srcH / outH, width: outW, height: outH };
}

/**
 * Upscale a grayscale matte (Uint8ClampedArray) bilinearly to target size via canvas.
 */
export function upscale_matte(matteBuffer, srcW, srcH, dstW, dstH) {
	var src = document.createElement('canvas');
	src.width = srcW;
	src.height = srcH;
	var sctx = src.getContext('2d');
	var img = sctx.createImageData(srcW, srcH);
	var gray = new Uint8ClampedArray(matteBuffer);
	for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
		var v = gray[i];
		img.data[p] = v;
		img.data[p + 1] = v;
		img.data[p + 2] = v;
		img.data[p + 3] = 255;
	}
	sctx.putImageData(img, 0, 0);

	var dst = document.createElement('canvas');
	dst.width = dstW;
	dst.height = dstH;
	var dctx = dst.getContext('2d');
	dctx.imageSmoothingEnabled = true;
	dctx.imageSmoothingQuality = 'high';
	dctx.drawImage(src, 0, 0, dstW, dstH);
	return dst;
}

/**
 * Refines an upscaled grayscale matte using Fast Guided Filter against the original image.
 * Transfers high-frequency photographic edge gradients from the guide image to eliminate
 * bilinear upscaling blur and snap contours to hair, fur, and intricate boundaries.
 *
 * @param {HTMLCanvasElement} sourceCanvas original high-resolution layer/crop canvas
 * @param {HTMLCanvasElement} maskCanvas layer/crop-sized grayscale matte canvas (modified in-place)
 * @param {object} [options]
 * @returns {HTMLCanvasElement} maskCanvas
 */
export function refine_matte_edges(sourceCanvas, maskCanvas, options) {
	options = options || {};
	var w = sourceCanvas.width;
	var h = sourceCanvas.height;
	var N = w * h;
	if (N === 0) return maskCanvas;

	var sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
	var sData = sctx.getImageData(0, 0, w, h).data;
	var guide = new Float32Array(N);

	for (var i = 0, p = 0; i < N; i++, p += 4) {
		// Rec. 709 luminance normalized to [0, 1] modulated by source alpha
		var a = sData[p + 3] / 255;
		var luma = (0.2126 * sData[p] + 0.7152 * sData[p + 1] + 0.0722 * sData[p + 2]) / 255;
		guide[i] = luma * a;
	}

	var mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
	var mImgData = mctx.getImageData(0, 0, w, h);
	var mData = mImgData.data;
	var srcAlpha = new Float32Array(N);

	for (var j = 0, q = 0; j < N; j++, q += 4) {
		srcAlpha[j] = mData[q] / 255;
	}

	var radius = (options.refineRadius != null) ? options.refineRadius : 4;
	var eps = (options.refineEps != null) ? options.refineEps : 0.001;

	var refined = fastGuidedFilter(guide, srcAlpha, w, h, radius, eps);

	for (var k = 0, r = 0; k < N; k++, r += 4) {
		var val = Math.round(Math.max(0, Math.min(1, refined[k])) * 255);
		// Never exceed source pixel alpha
		if (sData[r + 3] < 255) {
			val = Math.min(val, sData[r + 3]);
		}
		mData[r] = val;
		mData[r + 1] = val;
		mData[r + 2] = val;
		mData[r + 3] = 255;
	}

	mctx.putImageData(mImgData, 0, 0);
	return maskCanvas;
}

/**
 * Run ISNet and return a grayscale mask canvas at the original layer size.
 * Uses proxy inference and Fast Guided Filter edge refinement against the source image.
 *
 * @param {HTMLCanvasElement} sourceCanvas layer-sized RGB(A) pixels
 * @param {object} [options]
 * @returns {Promise<{maskCanvas: HTMLCanvasElement, device: string, modelId: string, dtype: string, timings: object}>}
 */
export async function compute_matte(sourceCanvas, options) {
	options = options || {};
	var isSilent = options.silent === true;
	if (!isSilent) {
		show_progress_ui('Preparing model…');
	}

	var prepared = prepare_model_input(sourceCanvas);
	var ctx = prepared.canvas.getContext('2d', { willReadFrequently: true });
	var imageData = ctx.getImageData(0, 0, prepared.width, prepared.height);

	var result = await call_worker({
		type: 'infer',
		modelLocation: get_model_location(),
		device: options.device || config.BG_AUTO_DEVICE || 'auto',
		dtype: options.dtype || config.BG_AUTO_DTYPE || null,
		width: prepared.width,
		height: prepared.height,
		pixels: imageData.data,
		silent: isSilent,
	}, isSilent ? null : options.onProgress);

	var maskCanvas = upscale_matte(
		result.matte,
		result.width,
		result.height,
		sourceCanvas.width,
		sourceCanvas.height
	);

	var shouldRefine = options.refineEdges !== false && (
		sourceCanvas.width > result.width ||
		sourceCanvas.height > result.height ||
		options.refineEdges === true
	);

	if (shouldRefine) {
		var tRefine0 = performance.now();
		refine_matte_edges(sourceCanvas, maskCanvas, options);
		var tRefine1 = performance.now();
		if (result.timings) {
			result.timings.refine_ms = Math.round(tRefine1 - tRefine0);
		}
	}

	return {
		maskCanvas: maskCanvas,
		device: result.device,
		modelId: result.modelId,
		dtype: result.dtype,
		timings: result.timings,
	};
}

export async function warm_model(options) {
	options = options || {};
	var isSilent = options.silent === true;
	if (!isSilent) {
		show_progress_ui('Downloading model…');
	}
	var result = await call_worker({
		type: 'load',
		modelLocation: get_model_location(),
		device: options.device || config.BG_AUTO_DEVICE || 'auto',
		dtype: options.dtype || config.BG_AUTO_DTYPE || null,
		silent: isSilent,
	}, isSilent ? null : options.onProgress);
	if (!isSilent) {
		hide_progress_ui();
	}
	return result;
}

export function get_model_location_setting() {
	return get_model_location();
}
