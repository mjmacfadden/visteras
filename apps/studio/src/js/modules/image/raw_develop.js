/**
 * Visteras Studio — Raw Develop (Camera Raw–style modal).
 *
 * Develops the active raster layer (JPEG/PNG / any image layer) with ACR-like
 * Basic + Presence controls in a large preview modal. Not a camera-file
 * decoder; decode goes through libs/raw-source.js so LibRaw (etc.) can plug in later.
 *
 * UX inspired by Photoshop Camera Raw and pg0/raw-viewer — no code copied
 * from raw-viewer (upstream has no LICENSE file as of this work).
 */
import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Dialog_class from './../../libs/popup.js';
import ImageFilters_class from './../../libs/imagefilters.js';
import Raw_source_registry from './../../libs/raw-source.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

var DEFAULTS = {
	temperature: 0,
	tint: 0,
	exposure: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	clarity: 0,
	vibrance: 0,
	saturation: 0,
};

var BASIC_SLIDERS = [
	{ name: 'temperature', title: 'Temperature', min: -100, max: 100, step: 1 },
	{ name: 'tint', title: 'Tint', min: -100, max: 100, step: 1 },
	{ name: 'exposure', title: 'Exposure', min: -2, max: 2, step: 0.01 },
	{ name: 'contrast', title: 'Contrast', min: -100, max: 100, step: 1 },
	{ name: 'highlights', title: 'Highlights', min: -100, max: 100, step: 1 },
	{ name: 'shadows', title: 'Shadows', min: -100, max: 100, step: 1 },
	{ name: 'whites', title: 'Whites', min: -100, max: 100, step: 1 },
	{ name: 'blacks', title: 'Blacks', min: -100, max: 100, step: 1 },
];

var PRESENCE_SLIDERS = [
	{ name: 'clarity', title: 'Clarity', min: -100, max: 100, step: 1 },
	{ name: 'vibrance', title: 'Vibrance', min: -100, max: 100, step: 1 },
	{ name: 'saturation', title: 'Saturation', min: -100, max: 100, step: 1 },
];

class Image_rawDevelop_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.ImageFilters = ImageFilters_class;
		this._params = Object.assign({}, DEFAULTS);
		this._source = null;
		this._previewCanvas = null;
		this._previewCtx = null;
		this._previewBuffer = null;
		this._previewSizeKey = '';
		this._raf = 0;
		this._root = null;
	}

	async raw_develop() {
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Convert it to raster to use Raw Develop.');
			return;
		}

		try {
			this._source = await Raw_source_registry.decode(config.layer, {
				Base_layers: this.Base_layers,
			});
		}
		catch (err) {
			alertify.error((err && err.message) ? err.message : 'Could not load layer for Raw Develop.');
			return;
		}

		this._params = Object.assign({}, DEFAULTS);
		var _this = this;

		this.POP.show({
			title: 'Raw Develop',
			className: 'raw_develop_popup',
			params: [
				{ html: this._build_html() },
			],
			on_load: function () {
				_this._bind_ui();
				_this._schedule_preview();
			},
			on_cancel: function () {
				_this._teardown();
			},
		});
	}

	_build_html() {
		var label = (this._source && this._source.label) ? this._source.label : 'Layer';
		var dims = this._source
			? (this._source.width + ' \u00d7 ' + this._source.height)
			: '';

		return '' +
			'<div class="raw-develop" id="raw_develop_root">' +
			'  <div class="raw-develop__header">' +
			'    <div><span class="raw-develop__title">Raw Develop</span>' +
			'      <span class="raw-develop__subtitle">' + escapeHtml(label) +
			(dims ? ' \u00b7 ' + dims : '') + ' \u00b7 JPEG/PNG raster</span></div>' +
			'    <div class="raw-develop__header-actions">' +
			'      <button type="button" class="raw-develop__btn raw-develop__btn--ghost" data-raw-action="reset">Reset</button>' +
			'      <button type="button" class="raw-develop__btn" data-raw-action="cancel">Cancel</button>' +
			'      <button type="button" class="raw-develop__btn raw-develop__btn--primary" data-raw-action="apply">Apply</button>' +
			'    </div>' +
			'  </div>' +
			'  <div class="raw-develop__body">' +
			'    <div class="raw-develop__viewer"><canvas id="raw_develop_canvas"></canvas></div>' +
			'    <aside class="raw-develop__sidebar">' +
			'      <p class="raw-develop__hint">Double-click a slider to reset it. Camera RAW decode (LibRaw) can plug in later via the source adapter.</p>' +
			this._panel_html('basic', 'Basic', BASIC_SLIDERS) +
			this._panel_html('presence', 'Presence', PRESENCE_SLIDERS) +
			'    </aside>' +
			'  </div>' +
			'</div>';
	}

	_panel_html(id, title, sliders) {
		var body = sliders.map((s) => {
			var val = this._params[s.name];
			return '' +
				'<div class="raw-develop__control" data-raw-control="' + s.name + '">' +
				'  <label for="raw_' + s.name + '">' + s.title + '</label>' +
				'  <input id="raw_' + s.name + '" type="range" name="' + s.name + '"' +
				'    min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + val + '"' +
				'    data-default="' + DEFAULTS[s.name] + '" />' +
				'  <output data-raw-output="' + s.name + '">' + formatVal(s.name, val) + '</output>' +
				'</div>';
		}).join('');

		return '' +
			'<section class="raw-develop__panel" data-raw-panel="' + id + '">' +
			'  <button type="button" class="raw-develop__panel-toggle" data-raw-toggle="' + id + '">' + title + '</button>' +
			'  <div class="raw-develop__panel-body">' + body + '</div>' +
			'</section>';
	}

	_bind_ui() {
		this._root = document.getElementById('raw_develop_root');
		if (!this._root) return;

		this._previewCanvas = document.getElementById('raw_develop_canvas');
		this._previewCtx = this._previewCanvas.getContext('2d', { willReadFrequently: true });

		this._root.querySelectorAll('input[type="range"]').forEach((input) => {
			input.addEventListener('input', () => {
				var name = input.name;
				var value = parseFloat(input.value);
				this._params[name] = value;
				var out = this._root.querySelector('[data-raw-output="' + name + '"]');
				if (out) out.textContent = formatVal(name, value);
				this._schedule_preview();
			});
			input.addEventListener('dblclick', (e) => {
				e.preventDefault();
				var name = input.name;
				var def = DEFAULTS[name];
				input.value = String(def);
				this._params[name] = def;
				var out = this._root.querySelector('[data-raw-output="' + name + '"]');
				if (out) out.textContent = formatVal(name, def);
				this._schedule_preview();
			});
		});

		this._root.querySelectorAll('[data-raw-toggle]').forEach((btn) => {
			btn.addEventListener('click', () => {
				var panel = btn.closest('.raw-develop__panel');
				if (panel) panel.classList.toggle('is-collapsed');
			});
		});

		this._root.querySelectorAll('[data-raw-action]').forEach((btn) => {
			btn.addEventListener('click', () => {
				var action = btn.getAttribute('data-raw-action');
				if (action === 'apply') this._apply();
				else if (action === 'cancel') this._cancel();
				else if (action === 'reset') this._reset_all();
			});
		});
	}

	_reset_all() {
		this._params = Object.assign({}, DEFAULTS);
		if (!this._root) return;
		this._root.querySelectorAll('input[type="range"]').forEach((input) => {
			var def = DEFAULTS[input.name];
			input.value = String(def);
			var out = this._root.querySelector('[data-raw-output="' + input.name + '"]');
			if (out) out.textContent = formatVal(input.name, def);
		});
		this._schedule_preview();
	}

	_schedule_preview() {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = requestAnimationFrame(() => {
			this._raf = 0;
			this._render_preview();
		});
	}

	_render_preview() {
		if (!this._source || !this._previewCanvas || !this._previewCtx) return;

		var viewer = this._previewCanvas.parentElement;
		var maxW = Math.max(320, (viewer && viewer.clientWidth) ? viewer.clientWidth - 24 : 800);
		var maxH = Math.max(240, (viewer && viewer.clientHeight) ? viewer.clientHeight - 24 : 560);
		var scale = Math.min(1, maxW / this._source.width, maxH / this._source.height);
		var pw = Math.max(1, Math.round(this._source.width * scale));
		var ph = Math.max(1, Math.round(this._source.height * scale));
		var sizeKey = pw + 'x' + ph;

		if (this._previewSizeKey !== sizeKey) {
			this._previewCanvas.width = pw;
			this._previewCanvas.height = ph;
			var tmp = document.createElement('canvas');
			tmp.width = pw;
			tmp.height = ph;
			var tctx = tmp.getContext('2d');
			var full = document.createElement('canvas');
			full.width = this._source.width;
			full.height = this._source.height;
			full.getContext('2d').putImageData(this._source.imageData, 0, 0);
			tctx.drawImage(full, 0, 0, pw, ph);
			this._previewBuffer = tctx.getImageData(0, 0, pw, ph);
			this._previewSizeKey = sizeKey;
		}

		var working = cloneImageData(this._previewBuffer);
		var developed = this.develop(working, this._params);
		if (!(developed instanceof ImageData)) {
			console.error('Raw Develop preview: develop() must return ImageData');
			return;
		}
		this._previewCtx.putImageData(developed, 0, 0);
	}

	_apply() {
		if (!this._source) return;

		var working = cloneImageData(this._source.imageData);
		var developed = this.develop(working, this._params);
		if (!(developed instanceof ImageData)) {
			alertify.error('Raw Develop failed to produce image data.');
			return;
		}

		// Preserve exact layer pixel dimensions (fixes prior resize-on-apply bug).
		var canvas = document.createElement('canvas');
		canvas.width = this._source.width;
		canvas.height = this._source.height;
		canvas.getContext('2d').putImageData(developed, 0, 0);

		app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas)
		);

		this._teardown();
		try { this.POP.hide(true); } catch (e) { /* ignore */ }
	}

	_cancel() {
		this._teardown();
		try { this.POP.hide(false); } catch (e) { /* ignore */ }
	}

	_teardown() {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = 0;
		this._source = null;
		this._previewBuffer = null;
		this._previewSizeKey = '';
		this._previewCanvas = null;
		this._previewCtx = null;
		this._root = null;
	}

	/**
	 * ACR-inspired develop. Always returns ImageData.
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

			r = clamp01(r * gainR);
			g = clamp01(g * gainG);
			b = clamp01(b * gainB);

			r = clamp01(r * expMul);
			g = clamp01(g * expMul);
			b = clamp01(b * expMul);

			if (contrast !== 0) {
				r = clamp01(contrastFactor * (r - 0.5) + 0.5);
				g = clamp01(contrastFactor * (g - 0.5) + 0.5);
				b = clamp01(contrastFactor * (b - 0.5) + 0.5);
			}

			var y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

			if (hiAmt !== 0 || shAmt !== 0) {
				var hiW = smoothstep(0.45, 1.0, y);
				var shW = 1 - smoothstep(0.0, 0.55, y);
				var tone = 1 + hiW * (-hiAmt * 0.55) + shW * (shAmt * 0.55);
				r = clamp01(r * tone);
				g = clamp01(g * tone);
				b = clamp01(b * tone);
				y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			}

			if (whAmt !== 0 || blAmt !== 0) {
				var whitePivot = 1 - whAmt * 0.25;
				var blackPivot = blAmt * 0.25;
				var span = Math.max(1e-4, whitePivot - blackPivot);
				r = clamp01((r - blackPivot) / span);
				g = clamp01((g - blackPivot) / span);
				b = clamp01((b - blackPivot) / span);
				y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			}

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

		if (clarity !== 0) {
			return applyClarity(imageData, clarity, this.ImageFilters);
		}

		return imageData;
	}
}

/**
 * Clarity without depending on the empty UnsharpMask stub in imagefilters.js.
 * Positive: unsharp via (original + amount * (original - blur)).
 * Negative: light Gaussian blur when available.
 */
function applyClarity(imageData, clarity, ImageFilters) {
	var amount = Math.abs(clarity) / 100;
	if (clarity < 0) {
		if (ImageFilters && typeof ImageFilters.GaussianBlur === 'function') {
			var strength = amount > 0.66 ? 3 : (amount > 0.33 ? 2 : 1);
			var blurred = ImageFilters.GaussianBlur(imageData, strength);
			if (blurred instanceof ImageData) return blurred;
		}
		return imageData;
	}

	if (!ImageFilters || typeof ImageFilters.GaussianBlur !== 'function') {
		return imageData;
	}
	var soft = ImageFilters.GaussianBlur(cloneImageData(imageData), 2);
	if (!(soft instanceof ImageData)) return imageData;

	var src = imageData.data;
	var blur = soft.data;
	var out = cloneImageData(imageData);
	var dst = out.data;
	var amp = amount * 1.35;
	for (var i = 0; i < src.length; i += 4) {
		if (src[i + 3] === 0) continue;
		dst[i] = clampByte(src[i] + amp * (src[i] - blur[i]));
		dst[i + 1] = clampByte(src[i + 1] + amp * (src[i + 1] - blur[i + 1]));
		dst[i + 2] = clampByte(src[i + 2] + amp * (src[i + 2] - blur[i + 2]));
	}
	return out;
}

function cloneImageData(src) {
	return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
}

function clamp01(v) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampByte(v) {
	return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function smoothstep(edge0, edge1, x) {
	var t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

function formatVal(name, value) {
	if (name === 'exposure') return (Math.round(value * 100) / 100).toFixed(2);
	return String(Math.round(value * 100) / 100);
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export default Image_rawDevelop_class;
