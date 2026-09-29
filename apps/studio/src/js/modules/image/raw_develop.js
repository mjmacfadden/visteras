import { blendEffectMask } from '../../libs/effect-masks.js';
import { renderSmart, surface, recipe, saveEffect, seeded } from '../../libs/smart-effects.js';
/**
 * Visteras Studio — Raw Develop (Camera Raw–style modal).
 *
 * Develops the active raster layer (JPEG/PNG / any image layer) with ACR-like
 * collapsible panels in a nearly fullscreen preview modal. Not a camera-file
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
	exposure: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	temperature: 0,
	tint: 0,
	vibrance: 0,
	saturation: 0,
	hue: 0,
	clarity: 0,
	dehaze: 0,
	sharpen: 0,
	sharpen_radius: 1,
	sharpen_detail: 25,
	vignette: 0,
	fade: 0,
	denoise_luma: 0,
	denoise_color: 0,
	grain_amount: 0,
	grain_size: 25,
	mixer_enabled: true,
	mixer_hue_red: 0,
	mixer_hue_orange: 0,
	mixer_hue_yellow: 0,
	mixer_hue_green: 0,
	mixer_hue_aqua: 0,
	mixer_hue_blue: 0,
	mixer_hue_purple: 0,
	mixer_hue_magenta: 0,
	mixer_sat_red: 0,
	mixer_sat_orange: 0,
	mixer_sat_yellow: 0,
	mixer_sat_green: 0,
	mixer_sat_aqua: 0,
	mixer_sat_blue: 0,
	mixer_sat_purple: 0,
	mixer_sat_magenta: 0,
	mixer_lum_red: 0,
	mixer_lum_orange: 0,
	mixer_lum_yellow: 0,
	mixer_lum_green: 0,
	mixer_lum_aqua: 0,
	mixer_lum_blue: 0,
	mixer_lum_purple: 0,
	mixer_lum_magenta: 0,
};

var MIXER_BANDS = [
	{ id: 'red', name: 'Reds', center: 0, maxShift: 25, color: '#e03030' },
	{ id: 'orange', name: 'Oranges', center: 30, maxShift: 20, color: '#e27c2b' },
	{ id: 'yellow', name: 'Yellows', center: 60, maxShift: 30, color: '#d9d22b' },
	{ id: 'green', name: 'Greens', center: 120, maxShift: 35, color: '#3cdf3c' },
	{ id: 'aqua', name: 'Aquas', center: 180, maxShift: 30, color: '#2bd9d9' },
	{ id: 'blue', name: 'Blues', center: 240, maxShift: 25, color: '#3b5ce2' },
	{ id: 'purple', name: 'Purples', center: 280, maxShift: 25, color: '#8c3be2' },
	{ id: 'magenta', name: 'Magentas', center: 320, maxShift: 25, color: '#e23bc0' },
];

var PANELS = [
	{
		id: 'light',
		title: 'Light',
		open: true,
		sliders: [
			{ name: 'exposure', title: 'Exposure', min: -2, max: 2, step: 0.01 },
			{ name: 'contrast', title: 'Contrast', min: -100, max: 100, step: 1 },
			{ name: 'highlights', title: 'Highlights', min: -100, max: 100, step: 1 },
			{ name: 'shadows', title: 'Shadows', min: -100, max: 100, step: 1 },
			{ name: 'whites', title: 'Whites', min: -100, max: 100, step: 1 },
			{ name: 'blacks', title: 'Blacks', min: -100, max: 100, step: 1 },
		],
	},
	{
		id: 'color',
		title: 'Color',
		open: true,
		sliders: [
			{ name: 'temperature', title: 'Temp', min: -100, max: 100, step: 1 },
			{ name: 'tint', title: 'Tint', min: -100, max: 100, step: 1 },
			{ name: 'vibrance', title: 'Vibrance', min: -100, max: 100, step: 1 },
			{ name: 'saturation', title: 'Saturation', min: -100, max: 100, step: 1 },
			{ name: 'hue', title: 'Hue', min: -180, max: 180, step: 1 },
		],
	},
	{
		id: 'color_mixer',
		title: 'Color Mixer',
		open: true,
	},
	{
		id: 'presence',
		title: 'Presence',
		open: true,
		sliders: [
			{ name: 'clarity', title: 'Clarity', min: -100, max: 100, step: 1 },
			{ name: 'dehaze', title: 'Dehaze', min: -100, max: 100, step: 1 },
		],
	},
	{
		id: 'detail',
		title: 'Detail',
		open: false,
		sliders: [
			{ name: 'sharpen', title: 'Sharpen', min: 0, max: 150, step: 1 },
			{ name: 'sharpen_radius', title: 'Radius', min: 0.5, max: 3, step: 0.1 },
			{ name: 'sharpen_detail', title: 'Detail', min: 0, max: 100, step: 1 },
		],
	},
	{
		id: 'effects',
		title: 'Effects',
		open: false,
		sliders: [
			{ name: 'vignette', title: 'Vignette', min: 0, max: 100, step: 1 },
			{ name: 'fade', title: 'Fade', min: 0, max: 100, step: 1 },
		],
	},
	{
		id: 'denoise',
		title: 'Denoise',
		open: false,
		sliders: [
			{ name: 'denoise_luma', title: 'Luminance', min: 0, max: 100, step: 1 },
			{ name: 'denoise_color', title: 'Color', min: 0, max: 100, step: 1 },
		],
	},
	{
		id: 'grain',
		title: 'Grain',
		open: false,
		sliders: [
			{ name: 'grain_amount', title: 'Amount', min: 0, max: 100, step: 1 },
			{ name: 'grain_size', title: 'Size', min: 0, max: 100, step: 1 },
		],
	},
];

class Image_rawDevelop_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.ImageFilters = ImageFilters_class;
		this._params = Object.assign({}, DEFAULTS);
		this._source = null;
		this._layerId = null;
		this._previewCanvas = null;
		this._viewerResizeObserver = null;
		this._previewCtx = null;
		this._previewBuffer = null;
		this._previewSizeKey = '';
		this._raf = 0;
		this._root = null;
		this._applying = false;
		this._mixerAdjust = 'hsl';
		this._mixerSubtab = 'saturation';
		this._mixerColorChannel = 'red';
		this._mixerTatActive = false;
		this._mixerBypassed = false;
	}

	async raw_develop(filter_id) {
		if (config.layer.type != 'image' && config.layer.type !== 'smart') {
			alertify.error('This layer must contain an image. Convert it to raster to use Raw Develop.');
			return;
		}

		if (config.layer.locked) { alertify.error('Unlock the layer to use Raw Develop.'); return; }
		this._layerId = config.layer.id;
		this._smartLayer = config.layer.type === 'smart' ? config.layer : null;
		this._documentId = app.Documents.active_id;
		this._filterId = filter_id;
		const old = (config.layer.filters || []).find(f => String(f.id) === String(filter_id));

		try {
			if (this._smartLayer) {
				const c = surface(renderSmart(this._smartLayer, filter_id));
				this._source = {width:c.width, height:c.height, imageData:c.getContext('2d').getImageData(0, 0, c.width, c.height), label:config.layer.name};
			} else this._source = await Raw_source_registry.decode(config.layer, {Base_layers:this.Base_layers});
		}
		catch (err) {
			alertify.error((err && err.message) ? err.message : 'Could not load layer for Raw Develop.');
			return;
		}

		this._params = this._smartLayer ? recipe({...DEFAULTS, ...(old && old.params)}, old && old.params) : Object.assign({}, DEFAULTS);
		this._applying = false;
		var _this = this;

		this.POP.show({
			title: 'Raw Develop',
			className: 'raw_develop_popup',
			params: [
				{ html: this._build_html() },
			],
			on_load: function () {
				_this._bind_ui();
				// Let flex layout settle before measuring viewer size.
				requestAnimationFrame(function () {
					_this._schedule_preview();
				});
				setTimeout(function () {
					_this._schedule_preview();
				}, 80);
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

		var panels = PANELS.map((p) => this._panel_html(p)).join('');

		return '' +
			'<div class="raw-develop" id="raw_develop_root">' +
			'  <div class="raw-develop__header">' +
			'    <div><span class="raw-develop__title">Raw Develop</span>' +
			'      <span class="raw-develop__subtitle">' + escapeHtml(label) +
			(dims ? ' \u00b7 ' + dims : '') + (this._smartLayer ? ' \u00b7 Smart Effect' : ' \u00b7 JPEG/PNG raster') + '</span></div>' +
			'    <div class="raw-develop__header-actions">' +
			'      <button type="button" class="raw-develop__btn raw-develop__btn--ghost" data-raw-action="reset">Reset</button>' +
			'      <button type="button" class="raw-develop__btn" data-raw-action="cancel">Cancel</button>' +
			'      <button type="button" class="raw-develop__btn raw-develop__btn--primary" data-raw-action="apply">Apply</button>' +
			'    </div>' +
			'  </div>' +
			'  <div class="raw-develop__body">' +
			'    <div class="raw-develop__viewer"><canvas id="raw_develop_canvas"></canvas></div>' +
			'    <aside class="raw-develop__sidebar">' +
			'      <p class="raw-develop__hint">Double-click a slider to reset. Camera RAW decode (LibRaw) can plug in later.</p>' +
			panels +
			'    </aside>' +
			'  </div>' +
			'</div>';
	}

	_panel_html(panel) {
		if (panel.id === 'color_mixer') {
			return this._panel_color_mixer_html(panel);
		}

		var body = panel.sliders.map((s) => {
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

		var collapsed = panel.open ? '' : ' is-collapsed';
		return '' +
			'<section class="raw-develop__panel' + collapsed + '" data-raw-panel="' + panel.id + '">' +
			'  <button type="button" class="raw-develop__panel-toggle" data-raw-toggle="' + panel.id + '">' + panel.title + '</button>' +
			'  <div class="raw-develop__panel-body">' + body + '</div>' +
			'</section>';
	}

	_panel_color_mixer_html(panel) {
		var collapsed = panel.open ? '' : ' is-collapsed';
		var bypassed = this._mixerBypassed ? ' is-bypassed' : '';

		var renderRow = (type, channel) => {
			var paramName = 'mixer_' + type + '_' + channel.id;
			var val = this._params[paramName] || 0;
			return '' +
				'<div class="raw-develop__mixer-row" data-mixer-type="' + type + '" data-mixer-channel="' + channel.id + '">' +
				'  <div class="raw-develop__mixer-row-header">' +
				'    <span class="raw-develop__mixer-label">' + channel.name + '</span>' +
				'    <input type="number" class="raw-develop__mixer-num" data-raw-mixer-input="' + paramName + '"' +
				'      min="-100" max="100" step="1" value="' + val + '" />' +
				'  </div>' +
				'  <div class="raw-develop__mixer-slider-wrap">' +
				'    <input type="range" class="raw-develop__mixer-slider" name="' + paramName + '"' +
				'      min="-100" max="100" step="1" value="' + val + '" data-default="0" />' +
				'  </div>' +
				'</div>';
		};

		var hueRows = MIXER_BANDS.map(b => renderRow('hue', b)).join('');
		var satRows = MIXER_BANDS.map(b => renderRow('sat', b)).join('');
		var lumRows = MIXER_BANDS.map(b => renderRow('lum', b)).join('');

		var swatches = MIXER_BANDS.map(b => {
			var active = b.id === this._mixerColorChannel ? ' is-active' : '';
			return '<button type="button" class="raw-develop__mixer-swatch' + active + '" data-raw-mixer-swatch="' + b.id + '"' +
				' style="--swatch-color:' + b.color + ';" title="' + b.name + '"></button>';
		}).join('');

		var colorSets = MIXER_BANDS.map(b => {
			return '' +
				'<div class="raw-develop__mixer-color-set" data-channel="' + b.id + '">' +
				renderRow('hue', b) +
				renderRow('sat', b) +
				renderRow('lum', b) +
				'</div>';
		}).join('');

		return '' +
			'<section class="raw-develop__panel' + collapsed + bypassed + '" data-raw-panel="color_mixer">' +
			'  <div class="raw-develop__panel-header">' +
			'    <button type="button" class="raw-develop__panel-toggle" data-raw-toggle="color_mixer">' +
			'      <span class="raw-develop__panel-chevron"></span>' +
			'      Color Mixer' +
			'    </button>' +
			'    <button type="button" class="raw-develop__panel-eye" data-raw-panel-eye="color_mixer" title="Toggle Color Mixer">' +
			'      <svg class="raw-develop__eye-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
			'      <svg class="raw-develop__eye-off-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' +
			'    </button>' +
			'  </div>' +
			'  <div class="raw-develop__panel-body">' +
			'    <div class="raw-develop__mixer-mode-tabs">' +
			'      <button type="button" class="raw-develop__mixer-mode-tab is-active" data-mixer-mode="mixer">Mixer</button>' +
			'      <button type="button" class="raw-develop__mixer-mode-tab" data-mixer-mode="point_color" title="Point Color">Point Color</button>' +
			'    </div>' +
			'    <div class="raw-develop__mixer-mode-views" data-active-mode="mixer">' +
			'      <div class="raw-develop__mixer-view-mixer">' +
			'        <div class="raw-develop__mixer-adjust-row">' +
			'          <span class="raw-develop__mixer-adjust-label">Adjust</span>' +
			'          <div class="raw-develop__mixer-adjust-controls">' +
			'            <select class="raw-develop__mixer-adjust-select" data-raw-mixer-adjust>' +
			'              <option value="hsl"' + (this._mixerAdjust === 'hsl' ? ' selected' : '') + '>HSL</option>' +
			'              <option value="color"' + (this._mixerAdjust === 'color' ? ' selected' : '') + '>Color</option>' +
			'            </select>' +
			'            <button type="button" class="raw-develop__mixer-tat-btn' + (this._mixerTatActive ? ' is-active' : '') + '" data-raw-mixer-tat title="Targeted Adjustment Tool">' +
			'              <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="1.8"/></svg>' +
			'            </button>' +
			'          </div>' +
			'        </div>' +
			'        <div class="raw-develop__mixer-content" data-adjust="' + this._mixerAdjust + '" data-subtab="' + this._mixerSubtab + '" data-color-channel="' + this._mixerColorChannel + '">' +
			'          <div class="raw-develop__mixer-hsl-container">' +
			'            <div class="raw-develop__mixer-subtabs">' +
			'              <button type="button" class="raw-develop__mixer-subtab' + (this._mixerSubtab === 'hue' ? ' is-active' : '') + '" data-raw-subtab="hue">Hue</button>' +
			'              <button type="button" class="raw-develop__mixer-subtab' + (this._mixerSubtab === 'saturation' ? ' is-active' : '') + '" data-raw-subtab="saturation">Saturation</button>' +
			'              <button type="button" class="raw-develop__mixer-subtab' + (this._mixerSubtab === 'luminance' ? ' is-active' : '') + '" data-raw-subtab="luminance">Luminance</button>' +
			'              <button type="button" class="raw-develop__mixer-subtab' + (this._mixerSubtab === 'all' ? ' is-active' : '') + '" data-raw-subtab="all">All</button>' +
			'            </div>' +
			'            <div class="raw-develop__mixer-group" data-mixer-group="hue">' +
			'              <div class="raw-develop__mixer-group-title">Hue</div>' +
			hueRows +
			'            </div>' +
			'            <div class="raw-develop__mixer-group" data-mixer-group="saturation">' +
			'              <div class="raw-develop__mixer-group-title">Saturation</div>' +
			satRows +
			'            </div>' +
			'            <div class="raw-develop__mixer-group" data-mixer-group="luminance">' +
			'              <div class="raw-develop__mixer-group-title">Luminance</div>' +
			lumRows +
			'            </div>' +
			'          </div>' +
			'          <div class="raw-develop__mixer-color-container">' +
			'            <div class="raw-develop__mixer-color-swatches">' +
			swatches +
			'            </div>' +
			'            <div class="raw-develop__mixer-color-sliders">' +
			colorSets +
			'            </div>' +
			'          </div>' +
			'        </div>' +
			'      </div>' +
			'      <div class="raw-develop__mixer-view-point-color">' +
			'        <div class="raw-develop__point-color-notice">' +
			'          <p>Sample a color from the image with the Targeted Adjustment Tool, or use the 8 HSL Mixer channels.</p>' +
			'        </div>' +
			'      </div>' +
			'    </div>' +
			'  </div>' +
			'</section>';
	}

	_bind_ui() {
		this._root = document.getElementById('raw_develop_root');
		if (!this._root) return;

		this._previewCanvas = document.getElementById('raw_develop_canvas');
		this._previewCtx = this._previewCanvas.getContext('2d', { willReadFrequently: true });

		var viewerEl = this._previewCanvas && this._previewCanvas.parentElement;
		if (viewerEl && typeof ResizeObserver !== 'undefined') {
			if (this._viewerResizeObserver) {
				try { this._viewerResizeObserver.disconnect(); } catch (e) { /* ignore */ }
			}
			var self = this;
			this._viewerResizeObserver = new ResizeObserver(function () {
				self._previewSizeKey = '';
				self._schedule_preview();
			});
			this._viewerResizeObserver.observe(viewerEl);
		}

		this._root.querySelectorAll('input[type="range"]').forEach((input) => {
			input.addEventListener('input', () => {
				var name = input.name;
				var value = parseFloat(input.value);
				this._params[name] = value;
				var out = this._root.querySelector('[data-raw-output="' + name + '"]');
				if (out) out.textContent = formatVal(name, value);
				var pairedNum = this._root.querySelector('.raw-develop__mixer-num[data-raw-mixer-input="' + name + '"]');
				if (pairedNum) pairedNum.value = String(Math.round(value));
				this._schedule_preview();
			});
			input.addEventListener('dblclick', (e) => {
				e.preventDefault();
				var name = input.name;
				var def = DEFAULTS[name] !== undefined ? DEFAULTS[name] : 0;
				input.value = String(def);
				this._params[name] = def;
				var out = this._root.querySelector('[data-raw-output="' + name + '"]');
				if (out) out.textContent = formatVal(name, def);
				var pairedNum = this._root.querySelector('.raw-develop__mixer-num[data-raw-mixer-input="' + name + '"]');
				if (pairedNum) pairedNum.value = String(Math.round(def));
				this._schedule_preview();
			});
		});

		this._root.querySelectorAll('.raw-develop__mixer-num').forEach((num) => {
			num.addEventListener('input', () => {
				var name = num.getAttribute('data-raw-mixer-input');
				var val = Math.max(-100, Math.min(100, parseInt(num.value, 10) || 0));
				this._params[name] = val;
				var slider = this._root.querySelector('input[type="range"][name="' + name + '"]');
				if (slider) slider.value = String(val);
				this._schedule_preview();
			});
			num.addEventListener('dblclick', (e) => {
				e.preventDefault();
				var name = num.getAttribute('data-raw-mixer-input');
				num.value = '0';
				this._params[name] = 0;
				var slider = this._root.querySelector('input[type="range"][name="' + name + '"]');
				if (slider) slider.value = '0';
				this._schedule_preview();
			});
		});

		var eyeBtn = this._root.querySelector('[data-raw-panel-eye="color_mixer"]');
		if (eyeBtn) {
			eyeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this._mixerBypassed = !this._mixerBypassed;
				this._params.mixer_enabled = !this._mixerBypassed;
				var panel = eyeBtn.closest('.raw-develop__panel');
				if (panel) panel.classList.toggle('is-bypassed', this._mixerBypassed);
				this._schedule_preview();
			});
		}

		this._root.querySelectorAll('[data-mixer-mode]').forEach((btn) => {
			btn.addEventListener('click', () => {
				var mode = btn.getAttribute('data-mixer-mode');
				this._root.querySelectorAll('[data-mixer-mode]').forEach(b => b.classList.remove('is-active'));
				btn.classList.add('is-active');
				var views = this._root.querySelector('.raw-develop__mixer-mode-views');
				if (views) views.setAttribute('data-active-mode', mode);
			});
		});

		var adjustSelect = this._root.querySelector('[data-raw-mixer-adjust]');
		if (adjustSelect) {
			adjustSelect.addEventListener('change', () => {
				this._mixerAdjust = adjustSelect.value;
				var content = this._root.querySelector('.raw-develop__mixer-content');
				if (content) content.setAttribute('data-adjust', this._mixerAdjust);
			});
		}

		this._root.querySelectorAll('[data-raw-subtab]').forEach((btn) => {
			btn.addEventListener('click', () => {
				var subtab = btn.getAttribute('data-raw-subtab');
				this._mixerSubtab = subtab;
				this._root.querySelectorAll('[data-raw-subtab]').forEach(b => b.classList.remove('is-active'));
				btn.classList.add('is-active');
				var content = this._root.querySelector('.raw-develop__mixer-content');
				if (content) content.setAttribute('data-subtab', subtab);
			});
		});

		this._root.querySelectorAll('[data-raw-mixer-swatch]').forEach((btn) => {
			btn.addEventListener('click', () => {
				var ch = btn.getAttribute('data-raw-mixer-swatch');
				this._mixerColorChannel = ch;
				this._root.querySelectorAll('[data-raw-mixer-swatch]').forEach(b => b.classList.remove('is-active'));
				btn.classList.add('is-active');
				var content = this._root.querySelector('.raw-develop__mixer-content');
				if (content) content.setAttribute('data-color-channel', ch);
			});
		});

		var tatBtn = this._root.querySelector('[data-raw-mixer-tat]');
		if (tatBtn) {
			tatBtn.addEventListener('click', () => {
				this._mixerTatActive = !this._mixerTatActive;
				tatBtn.classList.toggle('is-active', this._mixerTatActive);
				if (this._previewCanvas) {
					this._previewCanvas.style.cursor = this._mixerTatActive ? 'crosshair' : 'default';
				}
			});
		}

		var isDraggingTat = false;
		var tatStartY = 0;
		var tatStartVal = 0;
		var tatParamName = '';

		if (this._previewCanvas) {
			this._previewCanvas.addEventListener('mousedown', (e) => {
				if (!this._mixerTatActive || !this._previewBuffer) return;
				e.preventDefault();
				var rect = this._previewCanvas.getBoundingClientRect();
				var x = Math.floor((e.clientX - rect.left) * (this._previewCanvas.width / rect.width));
				var y = Math.floor((e.clientY - rect.top) * (this._previewCanvas.height / rect.height));
				x = Math.max(0, Math.min(this._previewCanvas.width - 1, x));
				y = Math.max(0, Math.min(this._previewCanvas.height - 1, y));
				var idx = (y * this._previewCanvas.width + x) * 4;
				var r = this._previewBuffer.data[idx] / 255;
				var g = this._previewBuffer.data[idx + 1] / 255;
				var b = this._previewBuffer.data[idx + 2] / 255;
				var max = Math.max(r, g, b), min = Math.min(r, g, b);
				var delta = max - min;
				if (delta >= 0.01) {
					var h = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
					h = ((h * 60) % 360 + 360) % 360;
					var ch = getClosestMixerChannel(h);
					var type = (this._mixerSubtab === 'hue' || this._mixerSubtab === 'luminance') ? (this._mixerSubtab === 'hue' ? 'hue' : 'lum') : 'sat';
					tatParamName = 'mixer_' + type + '_' + ch;
					tatStartVal = this._params[tatParamName] || 0;
					tatStartY = e.clientY;
					isDraggingTat = true;
				}
			});
		}

		window.addEventListener('mousemove', (e) => {
			if (!isDraggingTat || !tatParamName) return;
			var dy = tatStartY - e.clientY;
			var nextVal = Math.max(-100, Math.min(100, Math.round(tatStartVal + dy)));
			this._params[tatParamName] = nextVal;
			var slider = this._root.querySelector('input[type="range"][name="' + tatParamName + '"]');
			if (slider) slider.value = String(nextVal);
			var num = this._root.querySelector('input.raw-develop__mixer-num[data-raw-mixer-input="' + tatParamName + '"]');
			if (num) num.value = String(nextVal);
			this._schedule_preview();
		});

		window.addEventListener('mouseup', () => {
			isDraggingTat = false;
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

		// Re-measure after the absolute-fill layout has applied.
		var self = this;
		requestAnimationFrame(function () {
			self._previewSizeKey = '';
			self._schedule_preview();
			setTimeout(function () {
				self._previewSizeKey = '';
				self._schedule_preview();
			}, 100);
		});
	}

	_reset_all() {
		this._params = this._smartLayer ? recipe(DEFAULTS, this._params) : Object.assign({}, DEFAULTS);
		if (!this._root) return;
		this._root.querySelectorAll('input[type="range"]').forEach((input) => {
			var def = DEFAULTS[input.name] !== undefined ? DEFAULTS[input.name] : 0;
			input.value = String(def);
			var out = this._root.querySelector('[data-raw-output="' + input.name + '"]');
			if (out) out.textContent = formatVal(input.name, def);
		});
		this._root.querySelectorAll('.raw-develop__mixer-num').forEach((num) => {
			var name = num.getAttribute('data-raw-mixer-input');
			var def = DEFAULTS[name] !== undefined ? DEFAULTS[name] : 0;
			num.value = String(def);
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
		if (!viewer) {
			this._schedule_preview();
			return;
		}

		// Prefer the viewer box; if the popup height chain is still settling /
		// collapsed, fall back to the visible viewport so the preview is usable.
		var maxW = (viewer.clientWidth || 0) - 24;
		var maxH = (viewer.clientHeight || 0) - 24;
		if (maxW < 120 || maxH < 120) {
			var fallbackW = Math.floor((window.innerWidth || 1200) - 280 - 48);
			var fallbackH = Math.floor((window.innerHeight || 800) - 72);
			if (maxW < 120) maxW = fallbackW;
			if (maxH < 120) maxH = fallbackH;
		}
		maxW = Math.max(64, maxW);
		maxH = Math.max(64, maxH);
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
		var developed = this.develop(working, this._params, seeded(this._params._seed || 0));
		if (!(developed instanceof ImageData)) {
			console.error('Raw Develop preview: develop() must return ImageData');
			return;
		}
		if (this._smartLayer && this._params._mask) {
			const input = document.createElement('canvas'), output = document.createElement('canvas');
			input.width = output.width = developed.width; input.height = output.height = developed.height;
			input.getContext('2d').putImageData(this._previewBuffer, 0, 0);
			output.getContext('2d').putImageData(developed, 0, 0);
			this._previewCtx.clearRect(0, 0, developed.width, developed.height);
			this._previewCtx.drawImage(blendEffectMask(input, output, this._params._mask), 0, 0);
		} else this._previewCtx.putImageData(developed, 0, 0);
	}

	async _apply() {
		if (!this._source || this._applying) return;
		if (this._smartLayer) {
			this._applying = true;
			try {
				const result = await saveEffect(this._smartLayer, 'image/raw_develop', {...this._params}, this._filterId, this._documentId);
				if (result.status !== 'completed') throw result.reason;
				this._teardown(); this.POP.hide(true);
			} catch (error) { alertify.error(error.message); this._applying = false; }
			return;
		}

		var working = cloneImageData(this._source.imageData);
		var developed = this.develop(working, this._params, seeded(this._params._seed || 0));
		if (!(developed instanceof ImageData)) {
			alertify.error('Raw Develop failed to produce image data.');
			return;
		}

		var layerId = this._layerId != null
			? this._layerId
			: (config.layer && config.layer.id);

		var applyBtn = this._root
			? this._root.querySelector('[data-raw-action="apply"]')
			: null;
		this._applying = true;
		if (applyBtn) {
			applyBtn.disabled = true;
			applyBtn.textContent = 'Applying…';
		}

		try {
			// Prefer layer-backed canvas (same pattern as auto_adjust / color_corrections),
			// then await Update_layer_image_action so IndexedDB/toBlob finishes before hide.
			var canvas = this.Base_layers.convert_layer_to_canvas(layerId, true);
			var ctx = canvas.getContext('2d');

			if (canvas.width === developed.width && canvas.height === developed.height) {
				ctx.putImageData(developed, 0, 0);
			}
			else {
				var tmp = document.createElement('canvas');
				tmp.width = developed.width;
				tmp.height = developed.height;
				tmp.getContext('2d').putImageData(developed, 0, 0);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
			}

			await app.State.do_action(
				new app.Actions.Update_layer_image_action(canvas, layerId)
			);

			this._teardown();
			try { this.POP.hide(true); } catch (e) { /* ignore */ }
		}
		catch (err) {
			console.error(err);
			alertify.error((err && err.message) ? err.message : 'Apply failed.');
			this._applying = false;
			if (applyBtn) {
				applyBtn.disabled = false;
				applyBtn.textContent = 'Apply';
			}
		}
	}

	_cancel() {
		if (this._applying) return;
		this._teardown();
		try { this.POP.hide(false); } catch (e) { /* ignore */ }
	}

	_teardown() {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = 0;
		if (this._viewerResizeObserver) {
			try { this._viewerResizeObserver.disconnect(); } catch (e) { /* ignore */ }
			this._viewerResizeObserver = null;
		}
		this._source = null;
		this._layerId = null;
		this._previewBuffer = null;
		this._previewSizeKey = '';
		this._previewCanvas = null;
		this._previewCtx = null;
		this._root = null;
		this._applying = false;
	}

	/**
	 * ACR-inspired develop. Always returns ImageData.
	 */
	develop(imageData, params, random = Math.random) {
		var exposure = parseFloat(params.exposure) || 0;
		var contrast = parseFloat(params.contrast) || 0;
		var highlights = parseFloat(params.highlights) || 0;
		var shadows = parseFloat(params.shadows) || 0;
		var whites = parseFloat(params.whites) || 0;
		var blacks = parseFloat(params.blacks) || 0;
		var temperature = parseFloat(params.temperature) || 0;
		var tint = parseFloat(params.tint) || 0;
		var vibrance = parseFloat(params.vibrance) || 0;
		var saturation = parseFloat(params.saturation) || 0;
		var hue = parseFloat(params.hue) || 0;
		var clarity = parseFloat(params.clarity) || 0;
		var dehaze = parseFloat(params.dehaze) || 0;
		var sharpen = parseFloat(params.sharpen) || 0;
		var sharpen_radius = parseFloat(params.sharpen_radius);
		if (isNaN(sharpen_radius)) sharpen_radius = 1;
		var sharpen_detail = parseFloat(params.sharpen_detail);
		if (isNaN(sharpen_detail)) sharpen_detail = 25;
		var vignette = parseFloat(params.vignette) || 0;
		var fade = parseFloat(params.fade) || 0;
		var denoise_luma = parseFloat(params.denoise_luma) || 0;
		var denoise_color = parseFloat(params.denoise_color) || 0;
		var grain_amount = parseFloat(params.grain_amount) || 0;
		var grain_size = parseFloat(params.grain_size);
		if (isNaN(grain_size)) grain_size = 25;

		var d = imageData.data;
		var w = imageData.width;
		var h = imageData.height;
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
		var dehazeAmt = dehaze / 100;
		var fadeAmt = fade / 100;
		var hueRad = (hue * Math.PI) / 180;
		var cosH = Math.cos(hueRad);
		var sinH = Math.sin(hueRad);

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
				var tone = 1 + hiW * (hiAmt * 0.55) + shW * (shAmt * 0.55);
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

			// Dehaze: lift/crush blacks + mid contrast (simple).
			if (dehazeAmt !== 0) {
				var dhBlack = dehazeAmt * 0.12;
				var dhContrast = 1 + dehazeAmt * 0.35;
				r = clamp01((r - dhBlack) * dhContrast);
				g = clamp01((g - dhBlack) * dhContrast);
				b = clamp01((b - dhBlack) * dhContrast);
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

			// Approximate RGB hue rotation (YIQ-style).
			if (hue !== 0) {
				var ry = 0.299 * r + 0.587 * g + 0.114 * b;
				var ri = 0.596 * r - 0.274 * g - 0.322 * b;
				var rq = 0.211 * r - 0.523 * g + 0.312 * b;
				var i2 = ri * cosH - rq * sinH;
				var q2 = ri * sinH + rq * cosH;
				r = clamp01(ry + 0.956 * i2 + 0.621 * q2);
				g = clamp01(ry - 0.272 * i2 - 0.647 * q2);
				b = clamp01(ry - 1.107 * i2 + 1.705 * q2);
			}

			// Fade: lift blacks toward mid-gray.
			if (fadeAmt > 0) {
				var lift = fadeAmt * 0.35;
				r = clamp01(r * (1 - lift) + lift * 0.5);
				g = clamp01(g * (1 - lift) + lift * 0.5);
				b = clamp01(b * (1 - lift) + lift * 0.5);
			}

			d[i] = Math.round(r * 255);
			d[i + 1] = Math.round(g * 255);
			d[i + 2] = Math.round(b * 255);
		}

		if (params.mixer_enabled !== false && !this._mixerBypassed && hasColorMixer(params)) {
			applyColorMixer(imageData, params);
		}

		var result = imageData;

		if (clarity !== 0) {
			result = applyClarity(result, clarity, this.ImageFilters);
		}

		if (sharpen > 0) {
			result = applySharpen(result, sharpen, sharpen_radius, sharpen_detail, this.ImageFilters);
		}

		if (denoise_luma > 0 || denoise_color > 0) {
			result = applyDenoise(result, denoise_luma, denoise_color, this.ImageFilters);
		}

		if (vignette > 0) {
			result = applyVignette(result, vignette);
		}

		if (grain_amount > 0) {
			result = applyGrain(result, grain_amount, grain_size, random);
		}

		return result;
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

function applySharpen(imageData, sharpen, radius, detail, ImageFilters) {
	if (!ImageFilters || typeof ImageFilters.GaussianBlur !== 'function') {
		return imageData;
	}
	var blurStrength = radius <= 1 ? 1 : (radius <= 2 ? 2 : 3);
	var soft = ImageFilters.GaussianBlur(cloneImageData(imageData), blurStrength);
	if (!(soft instanceof ImageData)) return imageData;

	var src = imageData.data;
	var blur = soft.data;
	var out = cloneImageData(imageData);
	var dst = out.data;
	var amp = (sharpen / 100) * (0.55 + (detail / 100) * 0.9);
	for (var i = 0; i < src.length; i += 4) {
		if (src[i + 3] === 0) continue;
		dst[i] = clampByte(src[i] + amp * (src[i] - blur[i]));
		dst[i + 1] = clampByte(src[i + 1] + amp * (src[i + 1] - blur[i + 1]));
		dst[i + 2] = clampByte(src[i + 2] + amp * (src[i + 2] - blur[i + 2]));
	}
	return out;
}

function applyDenoise(imageData, lumaAmt, colorAmt, ImageFilters) {
	if (!ImageFilters || typeof ImageFilters.GaussianBlur !== 'function') {
		return imageData;
	}
	var strength = Math.max(lumaAmt, colorAmt);
	if (strength <= 0) return imageData;
	var blurLevel = strength > 66 ? 3 : (strength > 33 ? 2 : 1);
	var soft = ImageFilters.GaussianBlur(cloneImageData(imageData), blurLevel);
	if (!(soft instanceof ImageData)) return imageData;

	var src = imageData.data;
	var blur = soft.data;
	var out = cloneImageData(imageData);
	var dst = out.data;
	var lumaMix = Math.min(1, lumaAmt / 100);
	var colorMix = Math.min(1, colorAmt / 100);

	for (var i = 0; i < src.length; i += 4) {
		if (src[i + 3] === 0) continue;
		var r0 = src[i], g0 = src[i + 1], b0 = src[i + 2];
		var r1 = blur[i], g1 = blur[i + 1], b1 = blur[i + 2];
		var y0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
		var y1 = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
		var y = y0 * (1 - lumaMix) + y1 * lumaMix;
		// Keep original chroma direction; blend toward blurred chroma for color denoise.
		var cr0 = r0 - y0, cg0 = g0 - y0, cb0 = b0 - y0;
		var cr1 = r1 - y1, cg1 = g1 - y1, cb1 = b1 - y1;
		var cr = cr0 * (1 - colorMix) + cr1 * colorMix;
		var cg = cg0 * (1 - colorMix) + cg1 * colorMix;
		var cb = cb0 * (1 - colorMix) + cb1 * colorMix;
		dst[i] = clampByte(y + cr);
		dst[i + 1] = clampByte(y + cg);
		dst[i + 2] = clampByte(y + cb);
	}
	return out;
}

function applyVignette(imageData, amount) {
	var w = imageData.width;
	var h = imageData.height;
	var cx = (w - 1) * 0.5;
	var cy = (h - 1) * 0.5;
	var maxR = Math.sqrt(cx * cx + cy * cy) || 1;
	var strength = amount / 100;
	var d = imageData.data;
	var out = cloneImageData(imageData);
	var dst = out.data;

	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var i = (y * w + x) * 4;
			if (d[i + 3] === 0) continue;
			var dx = (x - cx) / maxR;
			var dy = (y - cy) / maxR;
			var dist = Math.sqrt(dx * dx + dy * dy);
			var falloff = smoothstep(0.35, 1.05, dist);
			var mul = 1 - falloff * strength * 0.85;
			dst[i] = clampByte(d[i] * mul);
			dst[i + 1] = clampByte(d[i + 1] * mul);
			dst[i + 2] = clampByte(d[i + 2] * mul);
		}
	}
	return out;
}

function applyGrain(imageData, amount, size, random) {
	var d = imageData.data;
	var out = cloneImageData(imageData);
	var dst = out.data;
	var amp = (amount / 100) * 28;
	// Size scales noise spatial frequency via a cheap cell hash (v1: Math.random fine,
	// but a seeded cell look feels more film-like without copying ACR code).
	var cell = Math.max(1, Math.round(1 + (size / 100) * 4));
	var w = imageData.width;

	for (var i = 0; i < d.length; i += 4) {
		if (d[i + 3] === 0) continue;
		var px = (i / 4) % w;
		var py = Math.floor((i / 4) / w);
		var n;
		if (cell <= 1) {
			n = random() * 2 - 1;
		}
		else {
			var cx = Math.floor(px / cell);
			var cy = Math.floor(py / cell);
			// Deterministic-ish hash per cell
			var h = ((cx * 374761393 + cy * 668265263) ^ (cx * cy)) >>> 0;
			n = ((h % 1000) / 500) - 1;
		}
		var g = n * amp;
		dst[i] = clampByte(d[i] + g);
		dst[i + 1] = clampByte(d[i + 1] + g);
		dst[i + 2] = clampByte(d[i + 2] + g);
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
	if (name === 'exposure' || name === 'sharpen_radius') {
		return (Math.round(value * 100) / 100).toFixed(name === 'exposure' ? 2 : 1);
	}
	return String(Math.round(value * 100) / 100);
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function hasColorMixer(params) {
	if (!params || params.mixer_enabled === false) return false;
	for (var i = 0; i < MIXER_BANDS.length; i++) {
		var id = MIXER_BANDS[i].id;
		if ((parseFloat(params['mixer_hue_' + id]) || 0) !== 0 ||
		    (parseFloat(params['mixer_sat_' + id]) || 0) !== 0 ||
		    (parseFloat(params['mixer_lum_' + id]) || 0) !== 0) {
			return true;
		}
	}
	return false;
}

function getMixerWeights(H) {
	H = ((H % 360) + 360) % 360;
	var i1, i2, c1, c2;
	if (H < 30) {
		i1 = 0; i2 = 1; c1 = 0; c2 = 30;
	} else if (H < 60) {
		i1 = 1; i2 = 2; c1 = 30; c2 = 60;
	} else if (H < 120) {
		i1 = 2; i2 = 3; c1 = 60; c2 = 120;
	} else if (H < 180) {
		i1 = 3; i2 = 4; c1 = 120; c2 = 180;
	} else if (H < 240) {
		i1 = 4; i2 = 5; c1 = 180; c2 = 240;
	} else if (H < 280) {
		i1 = 5; i2 = 6; c1 = 240; c2 = 280;
	} else if (H < 320) {
		i1 = 6; i2 = 7; c1 = 280; c2 = 320;
	} else {
		i1 = 7; i2 = 0; c1 = 320; c2 = 360;
	}
	var t = (H - c1) / (c2 - c1);
	var w = t * t * (3 - 2 * t);
	return { i1: i1, i2: i2, w1: 1 - w, w2: w };
}

function getClosestMixerChannel(h) {
	h = ((h % 360) + 360) % 360;
	if (h < 15 || h >= 340) return 'red';
	if (h < 45) return 'orange';
	if (h < 90) return 'yellow';
	if (h < 150) return 'green';
	if (h < 210) return 'aqua';
	if (h < 260) return 'blue';
	if (h < 300) return 'purple';
	return 'magenta';
}

function hslToRgb(h, s, l) {
	if (s === 0) return [l, l, l];
	var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	var p = 2 * l - q;
	return [
		hueToRgb(p, q, h + 1/3),
		hueToRgb(p, q, h),
		hueToRgb(p, q, h - 1/3)
	];
}

function hueToRgb(p, q, t) {
	if (t < 0) t += 1;
	if (t > 1) t -= 1;
	if (t < 1/6) return p + (q - p) * 6 * t;
	if (t < 1/2) return q;
	if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
	return p;
}

function applyColorMixer(imageData, params) {
	var hueShifts = new Float32Array(8);
	var satShifts = new Float32Array(8);
	var lumShifts = new Float32Array(8);
	var any = false;

	for (var k = 0; k < 8; k++) {
		var id = MIXER_BANDS[k].id;
		var hVal = parseFloat(params['mixer_hue_' + id]) || 0;
		var sVal = parseFloat(params['mixer_sat_' + id]) || 0;
		var lVal = parseFloat(params['mixer_lum_' + id]) || 0;
		hueShifts[k] = (hVal / 100) * MIXER_BANDS[k].maxShift;
		satShifts[k] = sVal / 100;
		lumShifts[k] = lVal / 100;
		if (hVal !== 0 || sVal !== 0 || lVal !== 0) any = true;
	}
	if (!any) return imageData;

	var d = imageData.data;
	for (var i = 0; i < d.length; i += 4) {
		if (d[i + 3] === 0) continue;

		var r = d[i] / 255;
		var g = d[i + 1] / 255;
		var b = d[i + 2] / 255;

		var max = Math.max(r, g, b);
		var min = Math.min(r, g, b);
		var delta = max - min;
		if (delta < 0.002) continue; // Achromatic pixel

		var l = (max + min) * 0.5;
		var s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
		var h;
		if (max === r) {
			h = (g - b) / delta + (g < b ? 6 : 0);
		} else if (max === g) {
			h = (b - r) / delta + 2;
		} else {
			h = (r - g) / delta + 4;
		}
		h *= 60; // in [0, 360)

		var wInfo = getMixerWeights(h);
		var dH = wInfo.w1 * hueShifts[wInfo.i1] + wInfo.w2 * hueShifts[wInfo.i2];
		var dS = wInfo.w1 * satShifts[wInfo.i1] + wInfo.w2 * satShifts[wInfo.i2];
		var dL = wInfo.w1 * lumShifts[wInfo.i1] + wInfo.w2 * lumShifts[wInfo.i2];

		if (dH === 0 && dS === 0 && dL === 0) continue;

		var newH = ((h + dH) % 360 + 360) % 360 / 360;

		var newS = s;
		if (dS < 0) {
			newS = s * (1 + dS);
		} else if (dS > 0) {
			newS = s + (1 - s) * dS * 0.75;
		}
		if (newS < 0) newS = 0; else if (newS > 1) newS = 1;

		var newL = l;
		if (dL < 0) {
			newL = l * (1 + dL * 0.5);
		} else if (dL > 0) {
			newL = l + (1 - l) * dL * 0.5;
		}
		if (newL < 0) newL = 0; else if (newL > 1) newL = 1;

		var rgb = hslToRgb(newH, newS, newL);
		d[i] = Math.round(rgb[0] * 255);
		d[i + 1] = Math.round(rgb[1] * 255);
		d[i + 2] = Math.round(rgb[2] * 255);
	}

	return imageData;
}

export default Image_rawDevelop_class;
