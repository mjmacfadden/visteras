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
			var layerW = Math.max(1, Math.round(layer.width));
			var layerH = Math.max(1, Math.round(layer.height));

			var selInfo = this.get_layer_selection_mask(layer);
			var maskCanvas;
			var result = null;

			if (selInfo) {
				if (!selInfo.hasSelectedPixels) {
					// Selection does not overlap this layer: 100% of layer is outside selection
					maskCanvas = document.createElement('canvas');
					maskCanvas.width = layerW;
					maskCanvas.height = layerH;
					var mctx = maskCanvas.getContext('2d');
					mctx.fillStyle = '#000000';
					mctx.fillRect(0, 0, layerW, layerH);
				} else {
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

					// Focus background removal on the cropped object
					result = await compute_matte(cropSource, { device: config.BG_AUTO_DEVICE || 'auto' });
					var cropMaskCanvas = result.maskCanvas;
					var cropMaskData = cropMaskCanvas.getContext('2d').getImageData(0, 0, cropW, cropH).data;

					maskCanvas = document.createElement('canvas');
					maskCanvas.width = layerW;
					maskCanvas.height = layerH;
					var maskCtx = maskCanvas.getContext('2d');
					var maskImgData = maskCtx.createImageData(layerW, layerH);
					var maskData = maskImgData.data;

					// Initialize whole mask to black (0, 0, 0, 255) -> 100% removed outside selection
					for (var i = 0; i < maskData.length; i += 4) {
						maskData[i] = 0;
						maskData[i + 1] = 0;
						maskData[i + 2] = 0;
						maskData[i + 3] = 255;
					}

					var selPixels = selInfo.pixels;

					// Composite the focused matte into the layer mask, strictly modulated by selection alpha
					for (var cy = 0; cy < cropH; cy++) {
						var ly = cropY + cy;
						var lRow = ly * layerW;
						var cRow = cy * cropW;
						for (var cx = 0; cx < cropW; cx++) {
							var lx = cropX + cx;
							var lIdx = (lRow + lx) * 4;
							var cIdx = (cRow + cx) * 4;

							var selAlpha = selPixels[lIdx + 3];
							if (selAlpha > 0) {
								var matteAlpha = cropMaskData[cIdx];
								var finalAlpha = Math.round(matteAlpha * (selAlpha / 255));
								maskData[lIdx] = finalAlpha;
								maskData[lIdx + 1] = finalAlpha;
								maskData[lIdx + 2] = finalAlpha;
								maskData[lIdx + 3] = 255;
							}
						}
					}
					maskCtx.putImageData(maskImgData, 0, 0);
				}
			} else {
				// No active selection: process entire image as normal
				result = await compute_matte(source, { device: config.BG_AUTO_DEVICE || 'auto' });
				maskCanvas = result.maskCanvas;
			}

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
	 * Select > Subject / options-bar button: write subject matte to the document selection.
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
			var result = await compute_matte(source, { device: config.BG_AUTO_DEVICE || 'auto' });
			var layerMask = result.maskCanvas;

			// Build a document-sized selection mask with the subject placed at the layer origin.
			var docW = Math.max(1, config.WIDTH || layerMask.width);
			var docH = Math.max(1, config.HEIGHT || layerMask.height);
			var selectionCanvas = document.createElement('canvas');
			selectionCanvas.width = docW;
			selectionCanvas.height = docH;
			var sctx = selectionCanvas.getContext('2d');
			sctx.clearRect(0, 0, docW, docH);

			var lx = (layer.x != null) ? layer.x : 0;
			var ly = (layer.y != null) ? layer.y : 0;
			var lw = (layer.width != null && layer.width > 0) ? layer.width : layerMask.width;
			var lh = (layer.height != null && layer.height > 0) ? layer.height : layerMask.height;

			// Soft grayscale matte → selection alpha (Base_selection reads alpha).
			var placed = document.createElement('canvas');
			placed.width = Math.max(1, Math.round(lw));
			placed.height = Math.max(1, Math.round(lh));
			var pctx = placed.getContext('2d');
			pctx.imageSmoothingEnabled = true;
			pctx.drawImage(layerMask, 0, 0, layerMask.width, layerMask.height, 0, 0, placed.width, placed.height);
			var pixels = pctx.getImageData(0, 0, placed.width, placed.height);
			for (var i = 0; i < pixels.data.length; i += 4) {
				var a = pixels.data[i]; // grayscale R
				pixels.data[i] = 255;
				pixels.data[i + 1] = 255;
				pixels.data[i + 2] = 255;
				pixels.data[i + 3] = a;
			}
			pctx.putImageData(pixels, 0, 0);
			sctx.drawImage(placed, Math.round(lx), Math.round(ly));

			var oldMask = null;
			if (app.Layers && app.Layers.Base_selection && typeof app.Layers.Base_selection.clone_mask_canvas === 'function') {
				if (app.Layers.Base_selection.has_selection) {
					oldMask = app.Layers.Base_selection.clone_mask_canvas();
				}
			}

			await app.State.do_action(
				new app.Actions.Bundle_action('select_subject', 'Select Subject', [
					new app.Actions.Set_selection_action(selectionCanvas, oldMask),
				])
			);

			if (result.device) {
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
