/**
 * Visteras Studio — Raw Develop (Camera Raw–style tone / white-balance panel).
 *
 * Not a RAW file decoder: develops the active raster layer with ACR-like
 * Temperature/Tint, Exposure, Contrast, Highlights/Shadows, Whites/Blacks,
 * Clarity, Vibrance, and Saturation. Client-side only with live preview.
 */
import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Dialog_class from './../../libs/popup.js';
import ImageFilters_class from './../../libs/imagefilters.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Image_rawDevelop_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.ImageFilters = ImageFilters_class;
	}

	raw_develop() {
		var _this = this;

		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Convert it to raster to use Raw Develop.');
			return;
		}

		var settings = {
			title: 'Raw Develop',
			preview: true,
			on_change: function (params, canvas_preview, w, h, canvas) {
				var img = this.layer_active_small_ctx.getImageData(0, 0, w, h);
				var data = _this.develop(img, params);
				canvas_preview.putImageData(data, 0, 0);
			},
			params: [
				{ name: 'temperature', title: 'Temperature:', value: '0', range: [-100, 100] },
				{ name: 'tint', title: 'Tint:', value: '0', range: [-100, 100] },
				{},
				{ name: 'exposure', title: 'Exposure:', value: '0', range: [-2, 2], step: 0.01 },
				{ name: 'contrast', title: 'Contrast:', value: '0', range: [-100, 100] },
				{ name: 'highlights', title: 'Highlights:', value: '0', range: [-100, 100] },
				{ name: 'shadows', title: 'Shadows:', value: '0', range: [-100, 100] },
				{ name: 'whites', title: 'Whites:', value: '0', range: [-100, 100] },
				{ name: 'blacks', title: 'Blacks:', value: '0', range: [-100, 100] },
				{},
				{ name: 'clarity', title: 'Clarity:', value: '0', range: [-100, 100] },
				{ name: 'vibrance', title: 'Vibrance:', value: '0', range: [-100, 100] },
				{ name: 'saturation', title: 'Saturation:', value: '0', range: [-100, 100] },
			],
			on_finish: function (params) {
				_this.save(params);
			},
		};
		this.POP.show(settings);
	}

	save(params) {
		var canvas = this.Base_layers.convert_layer_to_canvas(null, true);
		var ctx = canvas.getContext('2d');
		var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
		var data = this.develop(img, params);
		ctx.putImageData(data, 0, 0);

		app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas)
		);
	}

	/**
	 * ACR-inspired develop on ImageData. Returns the same buffer.
	 */
	develop(imageData, params) {
		var temperature = parseFloat(params.temperature) || 0;
		var tint = parseFloat(params.tint) || 0;
		var exposure = parseFloat(params.exposure) || 0;
		var contrast = parseFloat(params.contrast) || 0;
		var highlights = parseFloat(params.highlights) || 0;
		var shadows = parseFloat(params.shadows) || 0;
		var whites = parseFloat(params.whites) || 0;
		var blacks = parseFloat(params.blacks) || 0;
		var clarity = parseFloat(params.clarity) || 0;
		var vibrance = parseFloat(params.vibrance) || 0;
		var saturation = parseFloat(params.saturation) || 0;

		var d = imageData.data;
		var expMul = Math.pow(2, exposure);
		var contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

		var temp = temperature / 100;
		var tintN = tint / 100;
		var gainR = 1 + temp * 0.35 + tintN * -0.08;
		var gainG = 1 + tintN * 0.22;
		var gainB = 1 - temp * 0.35 + tintN * -0.08;

		var hiAmt = highlights / 100;
		var shAmt = shadows / 100;
		var whAmt = whites / 100;
		var blAmt = blacks / 100;

		for (var i = 0; i < d.length; i += 4) {
			if (d[i + 3] === 0) continue;

			var r = d[i] / 255;
			var g = d[i + 1] / 255;
			var b = d[i + 2] / 255;

			// White balance
			r = clamp01(r * gainR);
			g = clamp01(g * gainG);
			b = clamp01(b * gainB);

			// Exposure
			r = clamp01(r * expMul);
			g = clamp01(g * expMul);
			b = clamp01(b * expMul);

			// Contrast
			if (contrast !== 0) {
				r = clamp01(contrastFactor * (r - 0.5) + 0.5);
				g = clamp01(contrastFactor * (g - 0.5) + 0.5);
				b = clamp01(contrastFactor * (b - 0.5) + 0.5);
			}

			var y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

			// Highlights / Shadows
			if (hiAmt !== 0 || shAmt !== 0) {
				var hiW = smoothstep(0.45, 1.0, y);
				var shW = 1 - smoothstep(0.0, 0.55, y);
				var tone = 1 + hiW * (-hiAmt * 0.55) + shW * (shAmt * 0.55);
				r = clamp01(r * tone);
				g = clamp01(g * tone);
				b = clamp01(b * tone);
				y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			}

			// Whites / Blacks
			if (whAmt !== 0 || blAmt !== 0) {
				var whitePivot = 1 - whAmt * 0.25;
				var blackPivot = blAmt * 0.25;
				var span = Math.max(1e-4, whitePivot - blackPivot);
				r = clamp01((r - blackPivot) / span);
				g = clamp01((g - blackPivot) / span);
				b = clamp01((b - blackPivot) / span);
				y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			}

			// Vibrance + Saturation
			if (vibrance !== 0 || saturation !== 0) {
				var maxc = Math.max(r, g, b);
				var minc = Math.min(r, g, b);
				var sat = maxc - minc;
				var vibFactor = 1 + (vibrance / 100) * (1 - sat);
				var satFactor = 1 + saturation / 100;
				var factor = vibFactor * satFactor;
				r = clamp01(y + (r - y) * factor);
				g = clamp01(y + (g - y) * factor);
				b = clamp01(y + (b - y) * factor);
			}

			d[i] = Math.round(r * 255);
			d[i + 1] = Math.round(g * 255);
			d[i + 2] = Math.round(b * 255);
		}

		// Clarity ≈ unsharp (positive) or slight blur (negative)
		if (clarity !== 0) {
			var amount = Math.abs(clarity) / 100 * 1.2;
			if (clarity > 0) {
				return this.ImageFilters.UnsharpMask(imageData, amount);
			}
			if (typeof this.ImageFilters.GaussianBlur === 'function') {
				return this.ImageFilters.GaussianBlur(imageData, Math.max(0.5, amount * 1.5));
			}
		}

		return imageData;
	}

}

function clamp01(v) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
	var t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

export default Image_rawDevelop_class;
