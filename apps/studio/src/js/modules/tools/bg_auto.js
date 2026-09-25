/**
 * Studio client-side background removal / Select Subject (phase 1).
 * Model: onnx-community/ISNet-ONNX via @huggingface/transformers in a Web Worker.
 */
import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Mask_class from './../mask/mask.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { compute_matte } from './../../libs/bg-auto/index.js';

var instance = null;
var busy = false;

class Tools_bg_auto_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;
		this.Base_layers = new Base_layers_class();
		this.Mask = new Mask_class();
	}

	friendly_error(err) {
		var code = err && err.code;
		var message = (err && err.message) ? err.message : String(err || 'Unknown error');
		if (code === 'non_raster' || /must contain an image|convert it to raster/i.test(message)) {
			return 'Remove Background works on raster image layers. Convert the layer to raster and try again.';
		}
		if (code === 'download_failed' || /fetch|network|Failed to fetch|Load failed|HTTP/i.test(message)) {
			return 'Could not download the background-removal model. Check your connection and try again.';
		}
		if (code === 'oom' || /memory|out of memory|OOM|allocation/i.test(message)) {
			return 'Not enough memory to run background removal. Try a smaller image or close other tabs.';
		}
		if (code === 'no_image') {
			return 'This layer has no image data.';
		}
		if (code === 'busy') {
			return 'Background removal is already running.';
		}
		return 'Background removal failed: ' + message;
	}


	log_build_once() {
		if (Tools_bg_auto_class._logged_build)
			return;
		Tools_bg_auto_class._logged_build = true;
		console.info(
			'[bg-auto] build=' + (config.BG_AUTO_BUILD_ID || 'unknown'),
			'cdn=' + (config.BG_AUTO_TRANSFORMERS_CDN || ''),
		);
	}

	require_raster_layer() {
		if (config.layer == null) {
			alertify.error('No active layer.');
			return null;
		}
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return null;
		}
		if (!config.layer.link || !(config.layer.width > 0) || !(config.layer.height > 0)) {
			alertify.error('This layer has no image data.');
			return null;
		}
		return config.layer;
	}

	layer_source_canvas(layer) {
		// Prefer the layer's native bitmap (not document-composited) so the mask
		// aligns with layer-local coordinates used by create_mask / Update_layer_mask_image.
		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(layer.width));
		canvas.height = Math.max(1, Math.round(layer.height));
		var ctx = canvas.getContext('2d');
		var src = layer.link_canvas || layer.link;
		if (!src) {
			throw Object.assign(new Error('This layer has no image data.'), { code: 'no_image' });
		}
		ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
		return canvas;
	}

	get_layer_selection_mask(layer) {
		var baseSel = app.Layers && app.Layers.Base_selection;
		if (!baseSel || !baseSel.has_selection || !baseSel.mask_canvas) {
			return null;
		}

		var layerW = Math.max(1, Math.round(layer.width));
		var layerH = Math.max(1, Math.round(layer.height));
		var selCanvas = document.createElement('canvas');
		selCanvas.width = layerW;
		selCanvas.height = layerH;
		var selCtx = selCanvas.getContext('2d', { willReadFrequently: true });

		var layerX = Math.round(layer.x || 0);
		var layerY = Math.round(layer.y || 0);

		selCtx.save();
		if (layer.rotate) {
			var cx = layerW / 2;
			var cy = layerH / 2;
			selCtx.translate(cx, cy);
			selCtx.rotate(-layer.rotate * Math.PI / 180);
			selCtx.translate(-cx - layerX, -cy - layerY);
		} else {
			selCtx.translate(-layerX, -layerY);
		}
		selCtx.drawImage(baseSel.mask_canvas, 0, 0);
		selCtx.restore();

		var selData = selCtx.getImageData(0, 0, layerW, layerH).data;
		var minX = layerW, minY = layerH, maxX = -1, maxY = -1;
		var hasSelectedPixels = false;

		for (var y = 0; y < layerH; y++) {
			var row = y * layerW;
			for (var x = 0; x < layerW; x++) {
				var a = selData[(row + x) * 4 + 3];
				if (a > 5) {
					hasSelectedPixels = true;
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}
			}
		}

		return {
			canvas: selCanvas,
			pixels: selData,
			hasSelectedPixels: hasSelectedPixels,
			bounds: hasSelectedPixels ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY } : null
		};
	}

	/**
	 * Computes a layer-aligned alpha matte (Uint8Array of size layerW * layerH).
	 * If selInfo is present, focuses inference on the cropped selection bounding box
	 * with contextual margin and strictly zeros out everything outside the selection.
	 */
	async compute_focused_matte(layer, source, selInfo) {
		var layerW = Math.max(1, Math.round(layer.width));
		var layerH = Math.max(1, Math.round(layer.height));
		var alphaBuffer = new Uint8Array(layerW * layerH);
		var result = null;

		if (selInfo) {
			if (!selInfo.hasSelectedPixels) {
				return { alphaBuffer, width: layerW, height: layerH, result: null };
			}

			var bounds = selInfo.bounds;
			var selW = bounds.maxX - bounds.minX + 1;
			var selH = bounds.maxY - bounds.minY + 1;

			// Contextual padding (~12% of selection size, minimum 16px)
			var padX = Math.max(16, Math.round(selW * 0.12));
			var padY = Math.max(16, Math.round(selH * 0.12));

			var cropX = Math.max(0, bounds.minX - padX);
			var cropY = Math.max(0, bounds.minY - padY);
			var cropW = Math.min(layerW - cropX, bounds.maxX + padX - cropX + 1);
			var cropH = Math.min(layerH - cropY, bounds.maxY + padY - cropY + 1);

			var cropSource = document.createElement('canvas');
			cropSource.width = cropW;
			cropSource.height = cropH;
			var cropCtx = cropSource.getContext('2d');
			cropCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

			// Focus background removal / subject detection on the cropped object
			result = await compute_matte(cropSource, { device: config.BG_AUTO_DEVICE || 'auto' });
			var cropMaskCanvas = result.maskCanvas;
			var cropMaskData = cropMaskCanvas.getContext('2d').getImageData(0, 0, cropW, cropH).data;

			var selPixels = selInfo.pixels;

			// Populate alphaBuffer, strictly modulated by selection alpha (zero outside selection)
			for (var cy = 0; cy < cropH; cy++) {
				var ly = cropY + cy;
				var lRow = ly * layerW;
				var cRow = cy * cropW;
				for (var cx = 0; cx < cropW; cx++) {
					var lx = cropX + cx;
					var lIdx = lRow + lx;
					var cIdx = (cRow + cx) * 4;

					var selAlpha = selPixels[lIdx * 4 + 3];
					if (selAlpha > 0) {
						var matteAlpha = cropMaskData[cIdx];
						alphaBuffer[lIdx] = Math.round(matteAlpha * (selAlpha / 255));
					}
				}
			}
		} else {
			// No active selection: process entire layer
			result = await compute_matte(source, { device: config.BG_AUTO_DEVICE || 'auto' });
			var fullMaskCanvas = result.maskCanvas;
			var fullMaskData = fullMaskCanvas.getContext('2d').getImageData(0, 0, layerW, layerH).data;
			for (var i = 0; i < alphaBuffer.length; i++) {
				alphaBuffer[i] = fullMaskData[i * 4];
			}
		}

		return {
			alphaBuffer,
			width: layerW,
			height: layerH,
			result
		};
	}

	/**
	 * Select menu / Properties Quick Action: Remove Background → layer mask (nondestructive).
	 * If a selection is active, focuses on the object inside the selection and removes 100% outside.
	 */
	async remove_background() {
		var layer = this.require_raster_layer();
		if (!layer) return;
		if (busy) {
			alertify.error(this.friendly_error({ code: 'busy' }));
			return;
		}

		busy = true;
		try {
			this.log_build_once();
			var source = this.layer_source_canvas(layer);
			var selInfo = this.get_layer_selection_mask(layer);

			var { alphaBuffer, width: layerW, height: layerH, result } = await this.compute_focused_matte(layer, source, selInfo);

			var maskCanvas = document.createElement('canvas');
			maskCanvas.width = layerW;
			maskCanvas.height = layerH;
			var maskCtx = maskCanvas.getContext('2d');
			var maskImgData = maskCtx.createImageData(layerW, layerH);
			var maskData = maskImgData.data;

			for (var i = 0; i < alphaBuffer.length; i++) {
				var a = alphaBuffer[i];
				var idx = i * 4;
				maskData[idx] = a;
				maskData[idx + 1] = a;
				maskData[idx + 2] = a;
				maskData[idx + 3] = 255;
			}
			maskCtx.putImageData(maskImgData, 0, 0);

			var actions = [];
			if (layer.mask == null) {
				actions.push(new app.Actions.Add_layer_mask_action(layer.id, true, false));
			}
			actions.push(new app.Actions.Update_layer_mask_image_action(maskCanvas, layer.id));

			if (selInfo && app.Actions.Reset_selection_action) {
				actions.push(new app.Actions.Reset_selection_action());
			}

			await app.State.do_action(
				new app.Actions.Bundle_action('remove_background', 'Remove Background', actions)
			);

			if (result && result.device) {
				console.info('[bg-auto] Remove Background device=', result.device, 'timings=', result.timings);
			}
			alertify.success('Background removed (layer mask).');
		} catch (err) {
			console.error('[bg-auto] remove_background', err);
			alertify.error(this.friendly_error(err));
		} finally {
			busy = false;
		}
	}

	/**
	 * Select menu / options-bar button: write subject matte to the document selection.
	 * If a selection is active, focuses on the object inside the selection and removes 100% outside.
	 */
	async select_subject() {
		var layer = this.require_raster_layer();
		if (!layer) return;
		if (busy) {
			alertify.error(this.friendly_error({ code: 'busy' }));
			return;
		}

		busy = true;
		try {
			this.log_build_once();
			var source = this.layer_source_canvas(layer);
			var selInfo = this.get_layer_selection_mask(layer);

			if (selInfo && !selInfo.hasSelectedPixels) {
				alertify.warning('Selection does not overlap the active layer.');
				return;
			}

			var { alphaBuffer, width: layerW, height: layerH, result } = await this.compute_focused_matte(layer, source, selInfo);

			// Soft grayscale matte → selection RGBA (Base_selection reads both R and A).
			var placed = document.createElement('canvas');
			placed.width = layerW;
			placed.height = layerH;
			var pctx = placed.getContext('2d');
			var pImgData = pctx.createImageData(layerW, layerH);
			var pData = pImgData.data;

			for (var i = 0; i < alphaBuffer.length; i++) {
				var a = alphaBuffer[i];
				var idx = i * 4;
				pData[idx] = a;
				pData[idx + 1] = a;
				pData[idx + 2] = a;
				pData[idx + 3] = a;
			}
			pctx.putImageData(pImgData, 0, 0);

			// Build a document-sized selection mask with the subject placed at the layer position.
			var docW = Math.max(1, config.WIDTH || layerW);
			var docH = Math.max(1, config.HEIGHT || layerH);
			var selectionCanvas = document.createElement('canvas');
			selectionCanvas.width = docW;
			selectionCanvas.height = docH;
			var sctx = selectionCanvas.getContext('2d');
			sctx.clearRect(0, 0, docW, docH);

			var lx = (layer.x != null) ? layer.x : 0;
			var ly = (layer.y != null) ? layer.y : 0;

			sctx.save();
			if (layer.rotate) {
				var cx = layerW / 2;
				var cy = layerH / 2;
				sctx.translate(Math.round(lx) + cx, Math.round(ly) + cy);
				sctx.rotate(layer.rotate * Math.PI / 180);
				sctx.drawImage(placed, -cx, -cy);
			} else {
				sctx.drawImage(placed, Math.round(lx), Math.round(ly));
			}
			sctx.restore();

			var baseSel = app.Layers && app.Layers.Base_selection;
			if (selInfo && baseSel && baseSel.mask_canvas) {
				sctx.globalCompositeOperation = 'destination-in';
				sctx.drawImage(baseSel.mask_canvas, 0, 0);
				sctx.globalCompositeOperation = 'source-over';
			}

			var oldMask = null;
			if (baseSel && typeof baseSel.clone_mask_canvas === 'function') {
				if (baseSel.has_selection) {
					oldMask = baseSel.clone_mask_canvas();
				}
			}

			await app.State.do_action(
				new app.Actions.Bundle_action('select_subject', 'Select Subject', [
					new app.Actions.Set_selection_action(selectionCanvas, oldMask),
				])
			);

			if (result && result.device) {
				console.info('[bg-auto] Select Subject device=', result.device, 'timings=', result.timings);
			}
			alertify.success('Subject selected.');
		} catch (err) {
			console.error('[bg-auto] select_subject', err);
			alertify.error(this.friendly_error(err));
		} finally {
			busy = false;
		}
	}
}

export default Tools_bg_auto_class;
