import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';
import Vector_manager from './../vector/vector-manager.js';
import { Update_vector_action } from './../../actions/vector/update-vector.js';
import Tools_bg_auto_class from './../../modules/tools/bg_auto.js';
import { default_levels_params, auto_levels } from './../../libs/levels.js';

/**
 * GUI class responsible for the Properties panel.
 * Tab alongside Adjustments. Shows:
 *  - adjustment params for the selected adjustment layer
 *  - Type tool options-bar features for a selected text layer
 * Empty placeholder otherwise.
 *
 * Visibility: selecting a text layer does NOT auto-open this tab.
 * Type controls appear when Properties is already displaying / user opens it
 * with a text layer selected. Adjustments still auto-show via show_for_layer().
 */
class GUI_properties_class {

	constructor(GUI) {
		this.GUI = GUI;
		this.Helper = new Helper_class();
		this.Base_layers = new Base_layers_class();
		this.Tools_translate = new Tools_translate_class();
		this.bound_layer_id = null;
		this.bound_kind = null; // 'adjustment' | 'text' | 'image' | null
		this.params_at_interaction_start = null;
		this._events_bound = false;
		this._applying_text = false;
	}

	render_main_properties() {
		this.render_properties(true);
	}

	get_adjustment_module() {
		if (this.GUI && this.GUI.modules && this.GUI.modules['layer/adjustment']) {
			return this.GUI.modules['layer/adjustment'];
		}
		return null;
	}

	get_text_tool_config() {
		return (config.TOOLS || []).find((t) => t && t.name === 'text') || null;
	}

	get_text_tool_attributes() {
		const cfg = this.get_text_tool_config();
		return cfg && cfg.attributes ? cfg.attributes : null;
	}

	get_text_module() {
		if (this.GUI && this.GUI.GUI_tools && this.GUI.GUI_tools.tools_modules
			&& this.GUI.GUI_tools.tools_modules['text']) {
			return this.GUI.GUI_tools.tools_modules['text'].object;
		}
		return null;
	}

	esc(text) {
		if (this.Helper && typeof this.Helper.escapeHtml === 'function') {
			return this.Helper.escapeHtml(String(text == null ? '' : text));
		}
		return String(text == null ? '' : text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	attr_value(item) {
		if (item == null) return '';
		if (typeof item === 'object' && item !== null && 'value' in item) {
			return item.value;
		}
		return item;
	}

	set_attr_value(attrs, key, value) {
		if (!attrs || !(key in attrs)) return;
		if (typeof attrs[key] === 'object' && attrs[key] !== null && 'value' in attrs[key]) {
			attrs[key].value = value;
		} else {
			attrs[key] = value;
		}
	}

	is_point_text(layer) {
		if (!layer || !layer.params) return true;
		const b = layer.params.boundary;
		const s = String(b == null ? 'dynamic' : b).toLowerCase();
		return !(s === 'box' || s === 'paragraph');
	}

	render_properties(bind_events = false) {
		const target = document.getElementById('toggle_properties');
		if (!target) return;

		const activeVec = Vector_manager.get_active_vector();
		const isVectorContext = activeVec && (
			(config.TOOL && config.TOOL.name === 'pen') ||
			(document.getElementById('tab_btn_vectors') && document.getElementById('tab_btn_vectors').classList.contains('active'))
		);

		if (isVectorContext) {
			this.render_vector_properties(target, activeVec, bind_events);
			return;
		}

		const layer = config.layer;
		if (layer && layer.type === 'adjustment') {
			this.render_adjustment_properties(target, layer, bind_events);
			return;
		}
		if (layer && layer.type === 'text') {
			this.render_text_properties(target, layer, bind_events);
			return;
		}

		if (activeVec) {
			this.render_vector_properties(target, activeVec, bind_events);
			return;
		}

		if (layer && (layer.type === 'image' || layer.type === 'smart')) {
			this.render_image_properties(target, layer, bind_events);
			return;
		}

		target.innerHTML = '<div class="properties_placeholder trn">Select a layer or vector</div>';
		this.bound_layer_id = null;
		this.bound_kind = null;
		this.params_at_interaction_start = null;
		delete target.dataset.adjType;
		delete target.dataset.textSig;
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}
	}

	render_vector_properties(target, vector, bind_events = false) {
		const bounds = vector.getBounds() || { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
		const subpathCount = vector.paths ? vector.paths.length : 0;
		const totalAnchors = vector.paths ? vector.paths.reduce((acc, p) => acc + (p.anchors ? p.anchors.length : 0), 0) : 0;

		const fillVal = vector.fill || '#555555';
		const hasFill = !!vector.fill && vector.fill !== 'none';
		const strokeVal = vector.stroke || '#008000';
		const hasStroke = !!vector.stroke && vector.stroke !== 'none';
		const strokeWidth = vector.stroke_width || 2;
		const strokeAlign = (vector.stroke_align || 'center').toLowerCase();
		const strokeJoin = (vector.stroke_join || 'miter').toLowerCase();
		const fillRule = vector.fill_rule || 'nonzero';
		const mode = vector.mode || 'path';

		target.innerHTML = `
			<div class="properties_vector_controls">
				<div class="properties_section_header trn">Vector: ${this.esc(vector.name)}</div>
				
				<div class="properties_group_title trn">Geometry</div>
				<div class="properties_row">
					<label class="properties_label">Position</label>
					<div class="properties_coord_pair">
						<span class="properties_val_pill">X: ${Math.round(bounds.minX)}</span>
						<span class="properties_val_pill">Y: ${Math.round(bounds.minY)}</span>
					</div>
				</div>
				<div class="properties_row">
					<label class="properties_label">Dimensions</label>
					<div class="properties_coord_pair">
						<span class="properties_val_pill">W: ${Math.round(bounds.width)}</span>
						<span class="properties_val_pill">H: ${Math.round(bounds.height)}</span>
					</div>
				</div>

				<div class="properties_group_title trn">Appearance</div>
				<div class="properties_row">
					<label class="properties_label trn">Mode</label>
					<select class="properties_select" id="prop_vector_mode">
						<option value="path" ${mode === 'path' ? 'selected' : ''}>Path (Work Vector)</option>
						<option value="shape" ${mode === 'shape' ? 'selected' : ''}>Shape (Fill / Stroke)</option>
					</select>
				</div>
				<div class="properties_row">
					<label class="properties_label trn">Fill</label>
					<div class="properties_input_group">
						<input type="checkbox" id="prop_vector_has_fill" ${hasFill ? 'checked' : ''} />
						<input type="color" class="properties_color_picker" id="prop_vector_fill_color" value="${fillVal}" ${!hasFill ? 'disabled' : ''} />
					</div>
				</div>
				<div class="properties_row">
					<label class="properties_label trn">Fill Rule</label>
					<select class="properties_select" id="prop_vector_fill_rule">
						<option value="nonzero" ${fillRule === 'nonzero' ? 'selected' : ''}>Non-Zero Winding</option>
						<option value="evenodd" ${fillRule === 'evenodd' ? 'selected' : ''}>Even-Odd</option>
					</select>
				</div>
				<div class="properties_row">
					<label class="properties_label trn">Stroke</label>
					<div class="properties_input_group">
						<input type="checkbox" id="prop_vector_has_stroke" ${hasStroke ? 'checked' : ''} />
						<input type="color" class="properties_color_picker" id="prop_vector_stroke_color" value="${strokeVal}" ${!hasStroke ? 'disabled' : ''} />
					</div>
				</div>
				<div class="properties_row">
					<label class="properties_label trn">Width</label>
					<input type="number" class="properties_number_input" id="prop_vector_stroke_width" min="1" max="100" value="${strokeWidth}" />
				</div>
				<div class="properties_row">
					<label class="properties_label trn">Align</label>
					<select class="properties_select" id="prop_vector_stroke_align">
						<option value="center" ${strokeAlign === 'center' ? 'selected' : ''}>Center</option>
						<option value="inside" ${strokeAlign === 'inside' ? 'selected' : ''}>Inside</option>
						<option value="outside" ${strokeAlign === 'outside' ? 'selected' : ''}>Outside</option>
					</select>
				</div>
				<div class="properties_row">
					<label class="properties_label trn">Corners</label>
					<select class="properties_select" id="prop_vector_stroke_corners">
						<option value="miter" ${strokeJoin === 'miter' ? 'selected' : ''}>Right Angle</option>
						<option value="round" ${strokeJoin === 'round' ? 'selected' : ''}>Rounded</option>
						<option value="bevel" ${strokeJoin === 'bevel' ? 'selected' : ''}>Capped</option>
					</select>
				</div>

				<div class="properties_group_title trn">Path Details</div>
				<div class="properties_row">
					<span class="properties_subinfo_text">${subpathCount} ${subpathCount === 1 ? 'subpath' : 'subpaths'}, ${totalAnchors} total anchors</span>
				</div>
			</div>
		`;

		this.bound_layer_id = vector.id;
		this.bound_kind = 'vector';

		const modeSel = target.querySelector('#prop_vector_mode');
		const hasFillCb = target.querySelector('#prop_vector_has_fill');
		const fillColorInput = target.querySelector('#prop_vector_fill_color');
		const fillRuleSel = target.querySelector('#prop_vector_fill_rule');
		const hasStrokeCb = target.querySelector('#prop_vector_has_stroke');
		const strokeColorInput = target.querySelector('#prop_vector_stroke_color');
		const strokeWidthInput = target.querySelector('#prop_vector_stroke_width');
		const strokeAlignSel = target.querySelector('#prop_vector_stroke_align');
		const strokeCornersSel = target.querySelector('#prop_vector_stroke_corners');

		if (modeSel) {
			modeSel.addEventListener('change', () => {
				app.State.do_action(new Update_vector_action(vector.id, { mode: modeSel.value }));
			});
		}
		if (hasFillCb && fillColorInput) {
			hasFillCb.addEventListener('change', () => {
				fillColorInput.disabled = !hasFillCb.checked;
				const fill = hasFillCb.checked ? fillColorInput.value : null;
				app.State.do_action(new Update_vector_action(vector.id, { fill }));
			});
			fillColorInput.addEventListener('change', () => {
				if (hasFillCb.checked) {
					app.State.do_action(new Update_vector_action(vector.id, { fill: fillColorInput.value }));
				}
			});
		}
		if (fillRuleSel) {
			fillRuleSel.addEventListener('change', () => {
				app.State.do_action(new Update_vector_action(vector.id, { fill_rule: fillRuleSel.value }));
			});
		}
		if (hasStrokeCb && strokeColorInput) {
			hasStrokeCb.addEventListener('change', () => {
				strokeColorInput.disabled = !hasStrokeCb.checked;
				const stroke = hasStrokeCb.checked ? strokeColorInput.value : null;
				app.State.do_action(new Update_vector_action(vector.id, { stroke }));
			});
			strokeColorInput.addEventListener('change', () => {
				if (hasStrokeCb.checked) {
					app.State.do_action(new Update_vector_action(vector.id, { stroke: strokeColorInput.value }));
				}
			});
		}
		if (strokeWidthInput) {
			strokeWidthInput.setAttribute('step', 'any');
			strokeWidthInput.addEventListener('change', () => {
				const stroke_width = Math.max(1, parseFloat(strokeWidthInput.value) || 1);
				app.State.do_action(new Update_vector_action(vector.id, { stroke_width }));
			});
			strokeWidthInput.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					let val = parseFloat(strokeWidthInput.value) || 1;
					const increasing = e.key === 'ArrowUp';
					val = Math.max(1, this.get_stepped_value(val, 1, increasing));
					strokeWidthInput.value = val;
					app.State.do_action(new Update_vector_action(vector.id, { stroke_width: val }));
				}
			});
			strokeWidthInput.addEventListener('wheel', (e) => {
				if (document.activeElement === strokeWidthInput) {
					e.preventDefault();
					const delta = e.deltaY < 0 ? 1 : (e.deltaY > 0 ? -1 : 0);
					if (delta !== 0) {
						let val = parseFloat(strokeWidthInput.value) || 1;
						const increasing = delta > 0;
						val = Math.max(1, this.get_stepped_value(val, 1, increasing));
						strokeWidthInput.value = val;
						app.State.do_action(new Update_vector_action(vector.id, { stroke_width: val }));
					}
				}
			});
		}
		if (strokeAlignSel) {
			strokeAlignSel.addEventListener('change', () => {
				app.State.do_action(new Update_vector_action(vector.id, { stroke_align: strokeAlignSel.value }));
			});
		}
		if (strokeCornersSel) {
			strokeCornersSel.addEventListener('change', () => {
				const val = strokeCornersSel.value;
				const stroke_join = val;
				const stroke_cap = val === 'round' ? 'round' : (val === 'bevel' ? 'square' : 'butt');
				app.State.do_action(new Update_vector_action(vector.id, { stroke_join, stroke_cap }));
			});
		}
	}

	// ─── Adjustment controls (unchanged behavior) ───────────────────────────

	render_adjustment_properties(target, layer, bind_events = false) {
		const adj = this.get_adjustment_module();
		if (!adj) {
			target.innerHTML = '<div class="properties_placeholder trn">Select an adjustment or text layer</div>';
			return;
		}

		const normType = adj.normalize_type(layer.adjustment_type);
		const conf = adj.get_config(normType);
		const params = layer.params || { ...conf.default_params };

		const sameLayer = this.bound_layer_id === layer.id
			&& this.bound_kind === 'adjustment'
			&& target.querySelector('.properties_controls')
			&& target.dataset.adjType === normType;

		if (sameLayer && !bind_events) {
			this.sync_control_values(target, conf, params);
			return;
		}

		let html = '<div class="properties_controls">';
		if (layer.psd_unsupported) {
			// PSD adjustment Studio can't apply yet: say so instead of showing
			// Brightness sliders for a placeholder.
			const label = this.esc(layer.psd_unsupported.label || 'Adjustment');
			html += `<div class="properties_title">${label} (from PSD)</div>`;
			html += `<div class="properties_notice" id="properties_psd_unsupported" role="note">Studio can't apply Photoshop ${label} adjustments yet. This layer is a placeholder with no effect; exporting to PSD writes the original ${label} settings back unchanged.</div>`;
			html += '</div>';
			target.innerHTML = html;
			target.dataset.adjType = 'psd-unsupported';
			delete target.dataset.textSig;
			this.bound_layer_id = layer.id;
			this.bound_kind = 'adjustment';
			return;
		}

		if (normType === 'levels') {
			this.render_levels_properties(target, layer, bind_events);
			return;
		}
		html += `<div class="properties_title trn">${this.esc(conf.title)}</div>`;

		for (const p of conf.params) {
			const val = (params[p.name] !== undefined) ? params[p.name] : p.value;
			const min = (p.range && p.range[0] !== undefined) ? p.range[0] : 0;
			const max = (p.range && p.range[1] !== undefined) ? p.range[1] : 100;
			const step = (p.step !== undefined) ? p.step : 1;
			const display = this.format_value(val, step);
			const defVal = (conf.default_params && conf.default_params[p.name] !== undefined)
				? conf.default_params[p.name]
				: p.value;
			html += `
				<div class="properties_row" data-param="${p.name}">
					<label class="trn properties_label" for="prop_${p.name}">${p.title}</label>
					<input type="range" class="properties_range" id="prop_range_${p.name}"
						name="${p.name}" min="${min}" max="${max}" step="${step}" value="${val}"
						data-default="${defVal}" title="Double-click to reset" />
					<input type="number" class="properties_number" id="prop_${p.name}"
						name="${p.name}" min="${min}" max="${max}" step="${step}" value="${display}"
						data-default="${defVal}" title="Double-click to reset" />
				</div>`;
		}
		html += '</div>';

		target.innerHTML = html;
		target.dataset.adjType = normType;
		delete target.dataset.textSig;
		this.bound_layer_id = layer.id;
		this.bound_kind = 'adjustment';
		this.params_at_interaction_start = null;

		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}

		this.bind_control_events(target, layer.id);
	}

	render_levels_properties(target, layer, bind_events = false) {
		const params = layer.params || default_levels_params();
		if (!layer.params) layer.params = params;
		const currentChannel = params.channel || 'rgb';
		const chParams = params[currentChannel] || { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 };

		const sameLayer = this.bound_layer_id === layer.id
			&& this.bound_kind === 'adjustment'
			&& target.querySelector('.levels_properties_controls')
			&& target.dataset.adjType === 'levels';

		if (sameLayer && !bind_events) {
			this.update_levels_histogram(target, layer);
			this.sync_levels_control_values(target, layer);
			return;
		}

		let html = '<div class="properties_controls levels_properties_controls">';
		html += `<div class="properties_title trn">Levels</div>`;

		html += `
			<div class="properties_row">
				<label class="properties_label" for="levels_channel_select">Channel:</label>
				<select class="properties_select" id="levels_channel_select">
					<option value="rgb"${currentChannel === 'rgb' ? ' selected' : ''}>RGB</option>
					<option value="red"${currentChannel === 'red' ? ' selected' : ''}>Red</option>
					<option value="green"${currentChannel === 'green' ? ' selected' : ''}>Green</option>
					<option value="blue"${currentChannel === 'blue' ? ' selected' : ''}>Blue</option>
				</select>
			</div>

			<div class="levels_section_title">Input Levels</div>
			<div class="levels_histogram_wrap">
				<canvas class="levels_histogram_canvas" width="256" height="70"></canvas>
			</div>

			<div class="levels_track_wrap levels_input_track" id="levels_input_track">
				<div class="levels_triangle levels_tri_black" id="levels_tri_in_black" data-handle="inBlack" title="Shadows" tabindex="0">
					<svg width="10" height="12" viewBox="0 0 10 12"><polygon points="5,0 10,12 0,12" fill="#000000" stroke="#888888" stroke-width="1"/></svg>
				</div>
				<div class="levels_triangle levels_tri_mid" id="levels_tri_gamma" data-handle="gamma" title="Midtones" tabindex="0">
					<svg width="10" height="12" viewBox="0 0 10 12"><polygon points="5,0 10,12 0,12" fill="#888888" stroke="#ffffff" stroke-width="1"/></svg>
				</div>
				<div class="levels_triangle levels_tri_white" id="levels_tri_in_white" data-handle="inWhite" title="Highlights" tabindex="0">
					<svg width="10" height="12" viewBox="0 0 10 12"><polygon points="5,0 10,12 0,12" fill="#ffffff" stroke="#888888" stroke-width="1"/></svg>
				</div>
			</div>

			<div class="levels_inputs_row">
				<input type="number" class="properties_number" id="levels_in_black" min="0" max="253" step="1" value="${chParams.inBlack}" title="Shadows input" />
				<input type="number" class="properties_number" id="levels_gamma" min="0.1" max="9.99" step="0.01" value="${parseFloat(Number(chParams.gamma).toFixed(2))}" title="Midtones input (gamma)" />
				<input type="number" class="properties_number" id="levels_in_white" min="2" max="255" step="1" value="${chParams.inWhite}" title="Highlights input" />
			</div>

			<div class="levels_section_title">Output Levels</div>
			<div class="levels_track_wrap levels_output_track" id="levels_output_track">
				<div class="levels_gradient_bar"></div>
				<div class="levels_triangle levels_tri_out_black" id="levels_tri_out_black" data-handle="outBlack" title="Shadows output" tabindex="0">
					<svg width="10" height="12" viewBox="0 0 10 12"><polygon points="5,0 10,12 0,12" fill="#000000" stroke="#888888" stroke-width="1"/></svg>
				</div>
				<div class="levels_triangle levels_tri_out_white" id="levels_tri_out_white" data-handle="outWhite" title="Highlights output" tabindex="0">
					<svg width="10" height="12" viewBox="0 0 10 12"><polygon points="5,0 10,12 0,12" fill="#ffffff" stroke="#888888" stroke-width="1"/></svg>
				</div>
			</div>

			<div class="levels_inputs_row">
				<input type="number" class="properties_number" id="levels_out_black" min="0" max="255" step="1" value="${chParams.outBlack}" title="Shadows output" />
				<input type="number" class="properties_number" id="levels_out_white" min="0" max="255" step="1" value="${chParams.outWhite}" title="Highlights output" />
			</div>

			<div class="levels_btn_row">
				<button type="button" class="levels_btn" id="levels_btn_auto">Auto</button>
				<button type="button" class="levels_btn" id="levels_btn_reset">Reset</button>
			</div>
		`;
		html += '</div>';

		target.innerHTML = html;
		target.dataset.adjType = 'levels';
		delete target.dataset.textSig;
		this.bound_layer_id = layer.id;
		this.bound_kind = 'adjustment';
		this.params_at_interaction_start = null;

		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}

		this.update_levels_histogram(target, layer);
		this.sync_levels_control_values(target, layer);
		this.bind_levels_events(target, layer.id);
	}

	compute_levels_histogram_data(layer) {
		const W = config.WIDTH || 800;
		const H = config.HEIGHT || 600;
		if (W === 0 || H === 0) return null;

		let scratchCanvas = null;
		if (this.Base_layers.adj_scratch_canvas && this.Base_layers.adj_scratch_canvas.width === W && this.Base_layers.adj_scratch_canvas.height === H) {
			scratchCanvas = this.Base_layers.adj_scratch_canvas;
		} else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
			scratchCanvas = document.createElement('canvas');
			scratchCanvas.width = W;
			scratchCanvas.height = H;
			const sCtx = scratchCanvas.getContext('2d');
			if (sCtx) {
				const sorted = this.Base_layers.get_sorted_layers ? this.Base_layers.get_sorted_layers() : (config.layers || []);
				const below = sorted.filter(l => l.order < layer.order && l.visible !== false && l.type != null);
				const temp = document.createElement('canvas');
				temp.width = W;
				temp.height = H;
				if (typeof this.Base_layers.render_objects === 'function') {
					this.Base_layers.render_objects(sCtx, temp, below, () => sCtx.save());
				}
			}
		}

		if (!scratchCanvas || typeof scratchCanvas.getContext !== 'function') return null;
		const ctx = scratchCanvas.getContext('2d');
		if (!ctx || typeof ctx.getImageData !== 'function') return null;
		let imgData = null;
		try {
			imgData = ctx.getImageData(0, 0, W, H);
		} catch (e) {
			return null;
		}
		const data = imgData ? imgData.data : null;
		if (!data) return null;

		const rHist = new Uint32Array(256);
		const gHist = new Uint32Array(256);
		const bHist = new Uint32Array(256);
		const rgbHist = new Uint32Array(256);

		const step = data.length > 2000000 ? Math.ceil(data.length / 2000000) * 4 : 4;
		for (let i = 0; i < data.length; i += step) {
			if (data[i + 3] === 0) continue;
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			rHist[r]++;
			gHist[g]++;
			bHist[b]++;
			const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
			rgbHist[lum]++;
		}

		return { rgb: rgbHist, red: rHist, green: gHist, blue: bHist };
	}

	update_levels_histogram(target, layer) {
		const canvas = target.querySelector('.levels_histogram_canvas');
		if (!canvas) return;
		const params = layer.params || default_levels_params();
		const ch = params.channel || 'rgb';
		const histData = this.compute_levels_histogram_data(layer);
		this.last_levels_hist_data = histData;
		if (histData) {
			this.draw_levels_histogram(canvas, histData, ch);
		}
	}

	draw_levels_histogram(canvas, histData, channel) {
		if (!canvas || !histData) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const W = canvas.width;
		const H = canvas.height;

		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = '#181818';
		ctx.fillRect(0, 0, W, H);

		const hist = histData[channel] || histData.rgb;
		if (!hist) return;

		let maxVal = 0;
		for (let i = 1; i < 255; i++) {
			if (hist[i] > maxVal) maxVal = hist[i];
		}
		if (maxVal === 0) {
			maxVal = Math.max(hist[0], hist[255], 1);
		}

		let strokeStyle = '#a0a0a0';
		let fillStyle = 'rgba(160, 160, 160, 0.4)';
		if (channel === 'red') {
			strokeStyle = '#e05555';
			fillStyle = 'rgba(224, 85, 85, 0.4)';
		} else if (channel === 'green') {
			strokeStyle = '#55c055';
			fillStyle = 'rgba(85, 192, 85, 0.4)';
		} else if (channel === 'blue') {
			strokeStyle = '#5588e0';
			fillStyle = 'rgba(85, 136, 224, 0.4)';
		}

		ctx.beginPath();
		ctx.moveTo(0, H);
		for (let i = 0; i < 256; i++) {
			const count = hist[i];
			const val = Math.min(count, maxVal * 1.5);
			const h = Math.min(H, (val / maxVal) * (H - 4));
			ctx.lineTo(i, H - h);
		}
		ctx.lineTo(255, H);
		ctx.closePath();
		ctx.fillStyle = fillStyle;
		ctx.fill();
		ctx.strokeStyle = strokeStyle;
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	sync_levels_control_values(target, layer) {
		const params = layer.params || default_levels_params();
		const ch = params.channel || 'rgb';
		const c = params[ch] || { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 };

		const inBlackEl = target.querySelector('#levels_in_black');
		const gammaEl = target.querySelector('#levels_gamma');
		const inWhiteEl = target.querySelector('#levels_in_white');
		const outBlackEl = target.querySelector('#levels_out_black');
		const outWhiteEl = target.querySelector('#levels_out_white');

		if (inBlackEl && document.activeElement !== inBlackEl) inBlackEl.value = c.inBlack;
		if (gammaEl && document.activeElement !== gammaEl) gammaEl.value = parseFloat(Number(c.gamma).toFixed(2));
		if (inWhiteEl && document.activeElement !== inWhiteEl) inWhiteEl.value = c.inWhite;
		if (outBlackEl && document.activeElement !== outBlackEl) outBlackEl.value = c.outBlack;
		if (outWhiteEl && document.activeElement !== outWhiteEl) outWhiteEl.value = c.outWhite;

		const inputTrack = target.querySelector('#levels_input_track');
		if (inputTrack) {
			const trackWidth = (inputTrack.getBoundingClientRect && inputTrack.getBoundingClientRect().width) || inputTrack.offsetWidth || 200;
			const triInBlack = target.querySelector('#levels_tri_in_black');
			const triGamma = target.querySelector('#levels_tri_gamma');
			const triInWhite = target.querySelector('#levels_tri_in_white');

			const xBlack = (c.inBlack / 255) * trackWidth;
			const xWhite = (c.inWhite / 255) * trackWidth;

			const g = Math.max(0.1, Math.min(9.99, Number(c.gamma) || 1));
			const pos = Math.max(0.01, Math.min(0.99, 0.5 - (Math.log10(g) / 2)));
			const xGamma = xBlack + pos * (xWhite - xBlack);

			if (triInBlack) triInBlack.style.left = `${xBlack}px`;
			if (triGamma) triGamma.style.left = `${xGamma}px`;
			if (triInWhite) triInWhite.style.left = `${xWhite}px`;
		}

		const outputTrack = target.querySelector('#levels_output_track');
		if (outputTrack) {
			const trackWidth = (outputTrack.getBoundingClientRect && outputTrack.getBoundingClientRect().width) || outputTrack.offsetWidth || 200;
			const triOutBlack = target.querySelector('#levels_tri_out_black');
			const triOutWhite = target.querySelector('#levels_tri_out_white');

			const xOutBlack = (c.outBlack / 255) * trackWidth;
			const xOutWhite = (c.outWhite / 255) * trackWidth;

			if (triOutBlack) triOutBlack.style.left = `${xOutBlack}px`;
			if (triOutWhite) triOutWhite.style.left = `${xOutWhite}px`;
		}
	}

	apply_live_levels(layer_id) {
		const layer = this.Base_layers.get_layer(layer_id, true);
		if (!layer || layer.type !== 'adjustment') return;
		this.Base_layers.invalidate({ document: true });
		this.Base_layers.render(true);
	}

	bind_levels_events(target, layer_id) {
		const select = target.querySelector('#levels_channel_select');
		if (select) {
			select.addEventListener('change', () => {
				const layer = this.Base_layers.get_layer(layer_id, true);
				if (!layer || !layer.params) return;
				layer.params.channel = select.value;
				this.update_levels_histogram(target, layer);
				this.sync_levels_control_values(target, layer);
			});
		}

		const inputTrack = target.querySelector('#levels_input_track');
		const outputTrack = target.querySelector('#levels_output_track');

		const setupTriangleDrag = (tri, track, handle) => {
			if (!tri || !track) return;
			tri.addEventListener('pointerdown', (e) => {
				e.preventDefault();
				if (typeof tri.setPointerCapture === 'function') {
					try { tri.setPointerCapture(e.pointerId); } catch (_) {}
				}
				this.snapshot_params(layer_id);
				tri.classList.add('active');

				const onPointerMove = (ev) => {
					const rect = track.getBoundingClientRect();
					const trackW = rect.width;
					if (trackW <= 0) return;
					const relX = Math.max(0, Math.min(trackW, ev.clientX - rect.left));
					const v = (relX / trackW) * 255;

					const layer = this.Base_layers.get_layer(layer_id, true);
					if (!layer || !layer.params) return;
					const ch = layer.params.channel || 'rgb';
					const c = layer.params[ch];
					if (!c) return;

					if (handle === 'inBlack') {
						c.inBlack = Math.max(0, Math.min(c.inWhite - 2, Math.round(v)));
					} else if (handle === 'inWhite') {
						c.inWhite = Math.max(c.inBlack + 2, Math.min(255, Math.round(v)));
					} else if (handle === 'gamma') {
						const denom = c.inWhite - c.inBlack;
						if (denom > 0) {
							const clampedV = Math.max(c.inBlack + 1, Math.min(c.inWhite - 1, v));
							const pos = (clampedV - c.inBlack) / denom;
							const clampedPos = Math.max(0.01, Math.min(0.99, pos));
							let g = Math.pow(10, (0.5 - clampedPos) * 2);
							c.gamma = Math.max(0.1, Math.min(9.99, parseFloat(g.toFixed(2))));
						}
					} else if (handle === 'outBlack') {
						c.outBlack = Math.max(0, Math.min(255, Math.round(v)));
					} else if (handle === 'outWhite') {
						c.outWhite = Math.max(0, Math.min(255, Math.round(v)));
					}

					this.sync_levels_control_values(target, layer);
					this.apply_live_levels(layer_id);
				};

				const onPointerUp = (ev) => {
					if (typeof tri.releasePointerCapture === 'function') {
						try { tri.releasePointerCapture(ev.pointerId); } catch (_) {}
					}
					tri.classList.remove('active');
					window.removeEventListener('pointermove', onPointerMove);
					window.removeEventListener('pointerup', onPointerUp);
					window.removeEventListener('pointercancel', onPointerUp);
					this.commit_params(layer_id);
				};

				window.addEventListener('pointermove', onPointerMove);
				window.addEventListener('pointerup', onPointerUp);
				window.addEventListener('pointercancel', onPointerUp);
			});
		};

		setupTriangleDrag(target.querySelector('#levels_tri_in_black'), inputTrack, 'inBlack');
		setupTriangleDrag(target.querySelector('#levels_tri_gamma'), inputTrack, 'gamma');
		setupTriangleDrag(target.querySelector('#levels_tri_in_white'), inputTrack, 'inWhite');
		setupTriangleDrag(target.querySelector('#levels_tri_out_black'), outputTrack, 'outBlack');
		setupTriangleDrag(target.querySelector('#levels_tri_out_white'), outputTrack, 'outWhite');

		const setupNumberInput = (id, handle, min, max, isFloat = false) => {
			const el = target.querySelector('#' + id);
			if (!el) return;

			el.addEventListener('focus', () => {
				this.snapshot_params(layer_id);
			});

			el.addEventListener('input', () => {
				const raw = parseFloat(el.value);
				if (isNaN(raw)) return;
				const layer = this.Base_layers.get_layer(layer_id, true);
				if (!layer || !layer.params) return;
				const ch = layer.params.channel || 'rgb';
				const c = layer.params[ch];
				if (!c) return;

				if (isFloat) {
					c[handle] = Math.max(min, Math.min(max, parseFloat(raw.toFixed(2))));
				} else {
					c[handle] = Math.max(min, Math.min(max, Math.round(raw)));
				}
				this.sync_levels_control_values(target, layer);
				this.apply_live_levels(layer_id);
			});

			el.addEventListener('change', () => {
				let raw = parseFloat(el.value);
				const layer = this.Base_layers.get_layer(layer_id, true);
				if (!layer || !layer.params) return;
				const ch = layer.params.channel || 'rgb';
				const c = layer.params[ch];
				if (!c) return;

				if (isNaN(raw)) {
					raw = c[handle];
				}
				if (handle === 'inBlack') {
					c.inBlack = Math.max(0, Math.min(c.inWhite - 2, Math.round(raw)));
				} else if (handle === 'inWhite') {
					c.inWhite = Math.max(c.inBlack + 2, Math.min(255, Math.round(raw)));
				} else if (isFloat) {
					c[handle] = Math.max(min, Math.min(max, parseFloat(raw.toFixed(2))));
				} else {
					c[handle] = Math.max(min, Math.min(max, Math.round(raw)));
				}
				el.value = isFloat ? parseFloat(Number(c[handle]).toFixed(2)) : c[handle];
				this.sync_levels_control_values(target, layer);
				this.apply_live_levels(layer_id);
				this.commit_params(layer_id);
			});

			el.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					const step = isFloat ? 0.05 : 1;
					const inc = e.key === 'ArrowUp';
					let raw = parseFloat(el.value) || 0;
					raw = inc ? (raw + step) : (raw - step);
					const layer = this.Base_layers.get_layer(layer_id, true);
					if (!layer || !layer.params) return;
					const ch = layer.params.channel || 'rgb';
					const c = layer.params[ch];
					if (!c) return;

					if (handle === 'inBlack') {
						c.inBlack = Math.max(0, Math.min(c.inWhite - 2, Math.round(raw)));
					} else if (handle === 'inWhite') {
						c.inWhite = Math.max(c.inBlack + 2, Math.min(255, Math.round(raw)));
					} else if (isFloat) {
						c[handle] = Math.max(min, Math.min(max, parseFloat(raw.toFixed(2))));
					} else {
						c[handle] = Math.max(min, Math.min(max, Math.round(raw)));
					}
					el.value = isFloat ? parseFloat(Number(c[handle]).toFixed(2)) : c[handle];
					this.sync_levels_control_values(target, layer);
					this.apply_live_levels(layer_id);
					this.commit_params(layer_id);
				}
			});
		};

		setupNumberInput('levels_in_black', 'inBlack', 0, 253, false);
		setupNumberInput('levels_gamma', 'gamma', 0.1, 9.99, true);
		setupNumberInput('levels_in_white', 'inWhite', 2, 255, false);
		setupNumberInput('levels_out_black', 'outBlack', 0, 255, false);
		setupNumberInput('levels_out_white', 'outWhite', 0, 255, false);

		const autoBtn = target.querySelector('#levels_btn_auto');
		if (autoBtn) {
			autoBtn.addEventListener('click', () => {
				const layer = this.Base_layers.get_layer(layer_id, true);
				if (!layer) return;
				this.snapshot_params(layer_id);
				const histData = this.last_levels_hist_data || this.compute_levels_histogram_data(layer);
				if (histData) {
					const newParams = auto_levels(histData);
					newParams.channel = layer.params ? (layer.params.channel || 'rgb') : 'rgb';
					layer.params = newParams;
					this.update_levels_histogram(target, layer);
					this.sync_levels_control_values(target, layer);
					this.apply_live_levels(layer_id);
					this.commit_params(layer_id);
				}
			});
		}

		const resetBtn = target.querySelector('#levels_btn_reset');
		if (resetBtn) {
			resetBtn.addEventListener('click', () => {
				const layer = this.Base_layers.get_layer(layer_id, true);
				if (!layer) return;
				this.snapshot_params(layer_id);
				const ch = layer.params ? (layer.params.channel || 'rgb') : 'rgb';
				layer.params = default_levels_params();
				layer.params.channel = ch;
				this.update_levels_histogram(target, layer);
				this.sync_levels_control_values(target, layer);
				this.apply_live_levels(layer_id);
				this.commit_params(layer_id);
			});
		}
	}

	format_value(val, step) {
		const n = Number(val);
		if (isNaN(n)) return val;
		if (step != null && step < 1) {
			const decimals = String(step).includes('.')
				? String(step).split('.')[1].length
				: 2;
			return parseFloat(n.toFixed(decimals));
		}
		return Math.round(n);
	}

	sync_control_values(target, conf, params) {
		for (const p of conf.params) {
			const val = (params[p.name] !== undefined) ? params[p.name] : p.value;
			const range = target.querySelector(`#prop_range_${p.name}`);
			const number = target.querySelector(`#prop_${p.name}`);
			if (document.activeElement === range || document.activeElement === number) {
				continue;
			}
			const display = this.format_value(val, p.step);
			if (range && String(range.value) !== String(val)) range.value = val;
			if (number && String(number.value) !== String(display)) number.value = display;
		}
	}

	bind_control_events(target, layer_id) {
		const ranges = target.querySelectorAll('.properties_range');
		const numbers = target.querySelectorAll('.properties_number');

		const reset_to_default = (el) => {
			const defRaw = el.getAttribute('data-default');
			if (defRaw === null || defRaw === '') return;
			const defVal = parseFloat(defRaw);
			if (isNaN(defVal)) return;
			const name = el.name;
			this.snapshot_params(layer_id);
			const range = target.querySelector(`#prop_range_${name}`);
			const number = target.querySelector(`#prop_${name}`);
			const step = parseFloat((range && range.step) || (number && number.step) || 1) || 1;
			if (range) range.value = defVal;
			if (number) number.value = this.format_value(defVal, step);
			this.apply_live(layer_id, name, defVal);
			this.commit_params(layer_id);
		};

		ranges.forEach((range) => {
			range.addEventListener('mousedown', () => {
				this.snapshot_params(layer_id);
			});
			range.addEventListener('touchstart', () => {
				this.snapshot_params(layer_id);
			}, { passive: true });
			range.addEventListener('input', () => {
				const name = range.name;
				const val = this.parse_input_value(range);
				const number = target.querySelector(`#prop_${name}`);
				if (number) number.value = this.format_value(val, parseFloat(range.step) || 1);
				this.apply_live(layer_id, name, val);
			});
			range.addEventListener('change', () => {
				this.commit_params(layer_id);
			});
			range.addEventListener('dblclick', (e) => {
				e.preventDefault();
				reset_to_default(range);
			});
		});

		numbers.forEach((number) => {
			number.addEventListener('focus', () => {
				this.snapshot_params(layer_id);
			});
			number.addEventListener('input', () => {
				const name = number.name;
				const val = this.parse_input_value(number);
				if (val === null) return;
				const range = target.querySelector(`#prop_range_${name}`);
				if (range) range.value = val;
				this.apply_live(layer_id, name, val);
			});
			number.addEventListener('change', () => {
				const name = number.name;
				let val = this.parse_input_value(number);
				if (val === null) {
					const layer = this.Base_layers.get_layer(layer_id, true);
					val = layer && layer.params ? layer.params[name] : 0;
				}
				const min = parseFloat(number.min);
				const max = parseFloat(number.max);
				if (!isNaN(min)) val = Math.max(min, val);
				if (!isNaN(max)) val = Math.min(max, val);
				number.value = this.format_value(val, parseFloat(number.step) || 1);
				const range = target.querySelector(`#prop_range_${name}`);
				if (range) range.value = val;
				this.apply_live(layer_id, name, val);
				this.commit_params(layer_id);
			});
			number.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					const name = number.name;
					let val = this.parse_input_value(number);
					if (val === null) {
						const layer = this.Base_layers.get_layer(layer_id, true);
						val = layer && layer.params ? layer.params[name] : 0;
					}
					const step = parseFloat(number.step) || 1;
					const increasing = e.key === 'ArrowUp';
					val = this.get_stepped_value(val, step, increasing);
					const min = parseFloat(number.min);
					const max = parseFloat(number.max);
					if (!isNaN(min)) val = Math.max(min, val);
					if (!isNaN(max)) val = Math.min(max, val);
					number.value = this.format_value(val, step);
					const range = target.querySelector(`#prop_range_${name}`);
					if (range) range.value = val;
					this.apply_live(layer_id, name, val);
					this.commit_params(layer_id);
				}
			});
			number.addEventListener('wheel', (e) => {
				if (document.activeElement === number) {
					e.preventDefault();
					const delta = e.deltaY < 0 ? 1 : (e.deltaY > 0 ? -1 : 0);
					if (delta !== 0) {
						const name = number.name;
						let val = this.parse_input_value(number);
						if (val === null) {
							const layer = this.Base_layers.get_layer(layer_id, true);
							val = layer && layer.params ? layer.params[name] : 0;
						}
						const step = parseFloat(number.step) || 1;
						const increasing = delta > 0;
						val = this.get_stepped_value(val, step, increasing);
						const min = parseFloat(number.min);
						const max = parseFloat(number.max);
						if (!isNaN(min)) val = Math.max(min, val);
						if (!isNaN(max)) val = Math.min(max, val);
						number.value = this.format_value(val, step);
						const range = target.querySelector(`#prop_range_${name}`);
						if (range) range.value = val;
						this.apply_live(layer_id, name, val);
						this.commit_params(layer_id);
					}
				}
			});
			number.addEventListener('dblclick', (e) => {
				e.preventDefault();
				reset_to_default(number);
			});
		});
	}

	get_stepped_value(currentVal, stepAmount = 1, increasing = true) {
		let val = isNaN(currentVal) ? 0 : Number(currentVal);
		const step = (stepAmount == null || isNaN(stepAmount) || stepAmount <= 0) ? 1 : Number(stepAmount);
		const eps = 1e-7;
		const ratio = val / step;
		const remainder = Math.abs(ratio % 1);
		const isMultiple = remainder < eps || Math.abs(remainder - 1) < eps;

		let nextVal;
		if (increasing) {
			if (isMultiple) {
				nextVal = (Math.round(ratio) + 1) * step;
			} else {
				nextVal = (Math.floor(ratio) + 1) * step;
			}
		} else {
			if (isMultiple) {
				nextVal = (Math.round(ratio) - 1) * step;
			} else {
				nextVal = (Math.ceil(ratio) - 1) * step;
			}
		}
		return parseFloat(nextVal.toFixed(6));
	}

	parse_input_value(el) {
		const raw = el.value;
		if (raw === '' || raw === '-' || raw === '.') return null;
		const n = parseFloat(raw);
		return isNaN(n) ? null : n;
	}

	snapshot_params(layer_id) {
		const layer = this.Base_layers.get_layer(layer_id, true);
		if (!layer) return;
		this.params_at_interaction_start = JSON.parse(JSON.stringify(layer.params || {}));
	}

	apply_live(layer_id, name, val) {
		const layer = this.Base_layers.get_layer(layer_id, true);
		if (!layer || layer.type !== 'adjustment') return;
		if (!layer.params) layer.params = {};
		layer.params[name] = val;
		this.Base_layers.invalidate({ document: true });
		this.Base_layers.render(true);
	}

	commit_params(layer_id) {
		const layer = this.Base_layers.get_layer(layer_id, true);
		if (!layer || layer.type !== 'adjustment') return;

		const next = JSON.parse(JSON.stringify(layer.params || {}));
		const prev = this.params_at_interaction_start;

		if (prev && JSON.stringify(prev) === JSON.stringify(next)) {
			this.params_at_interaction_start = null;
			return;
		}

		if (prev) {
			layer.params = JSON.parse(JSON.stringify(prev));
		}
		this.params_at_interaction_start = null;

		app.State.do_action(
			new app.Actions.Update_layer_action(layer.id, {
				params: next
			})
		);
	}

	/**
	 * Focus Properties tab and refresh controls for the given (or current) layer.
	 * Also unhides the Adjustments sidebar block / wrapper if collapsed.
	 * Used for adjustment create + edit/select only — NOT for text / Type tool.
	 */
	show_for_layer(layer_id) {
		if (layer_id != null && (!config.layer || config.layer.id !== layer_id)) {
			this.Base_layers.select(layer_id);
		}
		if (this.GUI && typeof this.GUI.activate_adjustments_tab === 'function') {
			this.GUI.activate_adjustments_tab('properties');
		}
		this.bound_layer_id = null;
		this.render_properties(true);
	}

	// ─── Text / Type tool controls ──────────────────────────────────────────

	text_signature(attrs, layer) {
		if (!attrs) return '';
		const keys = ['font', 'size', 'weight', 'bold', 'italic', 'underline', 'strikethrough', 'fill', 'halign', 'kerning', 'leading', 'boundary'];
		const parts = keys.map((k) => String(this.attr_value(attrs[k])));
		parts.push(this.is_point_text(layer) ? 'point' : 'box');
		return parts.join('|');
	}

	render_text_properties(target, layer, bind_events = false) {
		const attrs = this.get_text_tool_attributes();
		if (!attrs) {
			target.innerHTML = '<div class="properties_placeholder trn">Select an adjustment or text layer</div>';
			return;
		}

		// Keep TOOLS attrs aligned with layer Mode/align/size before painting UI
		const textMod = this.get_text_module();
		if (textMod && typeof textMod.sync_text_tool_attributes_from_layer === 'function') {
			try { textMod.sync_text_tool_attributes_from_layer(layer); } catch (e) { /* ignore */ }
		}

		const sig = this.text_signature(attrs, layer);
		const sameLayer = this.bound_layer_id === layer.id
			&& this.bound_kind === 'text'
			&& target.querySelector('.properties_text_controls')
			&& target.dataset.textSig === sig;

		if (sameLayer && !bind_events) {
			this.sync_text_control_values(target, attrs, layer);
			return;
		}

		// Rebuild when font/weight list changes (sig includes weight label; font change
		// also changes available weight options via values()).
		const fontVal = this.attr_value(attrs.font) || 'Roboto';
		const sizeVal = this.attr_value(attrs.size);
		const weightVal = this.attr_value(attrs.weight) || 'Regular (400)';
		const fillVal = this.attr_value(attrs.fill) || '#008000';
		const kerningVal = this.attr_value(attrs.kerning);
		const leadingVal = this.attr_value(attrs.leading);
		const halignVal = String(this.attr_value(attrs.halign) || 'Left');
		const modeVal = String(this.attr_value(attrs.boundary) || (this.is_point_text(layer) ? 'Point' : 'Paragraph'));
		const isPoint = this.is_point_text(layer);

		const fontOptions = (attrs.font && typeof attrs.font.values === 'function')
			? attrs.font.values()
			: (attrs.font && attrs.font.values) || ['Roboto'];
		const weightOptions = (attrs.weight && typeof attrs.weight.values === 'function')
			? attrs.weight.values()
			: (attrs.weight && attrs.weight.values) || ['Regular (400)', 'Bold (700)'];

		const sizeMin = (attrs.size && attrs.size.min != null) ? attrs.size.min : 1;
		const sizeMax = (attrs.size && attrs.size.max != null) ? attrs.size.max : 999;
		const sizeStep = (attrs.size && attrs.size.inputStep != null) ? attrs.size.inputStep
			: ((attrs.size && attrs.size.step != null) ? attrs.size.step : 1);
		const kernMin = (attrs.kerning && attrs.kerning.min != null) ? attrs.kerning.min : -999;
		const kernMax = (attrs.kerning && attrs.kerning.max != null) ? attrs.kerning.max : 999;
		const leadMin = (attrs.leading && attrs.leading.min != null) ? attrs.leading.min : -999;
		const leadMax = (attrs.leading && attrs.leading.max != null) ? attrs.leading.max : 999;

		const boolPressed = (key) => {
			const v = this.attr_value(attrs[key]);
			return v === true || v === 'true';
		};

		const alignIcons = {
			Left: 'align-left.svg',
			Center: 'align-center.svg',
			Right: 'align-right.svg',
			Justify: 'align-justify.svg',
		};
		const styleIcons = {
			bold: 'bold.svg',
			italic: 'italic.svg',
			underline: 'underline.svg',
			strikethrough: 'strikethrough.svg',
		};

		let html = '<div class="properties_controls properties_text_controls">';
		html += '<div class="properties_title trn">Type</div>';

		// Font
		html += `<div class="properties_row" data-prop="font">
			<select class="properties_select" id="prop_text_font" data-text-key="font">`;
		for (const f of fontOptions) {
			const sel = String(f) === String(fontVal) ? ' selected' : '';
			html += `<option value="${this.esc(f)}"${sel}>${this.esc(f)}</option>`;
		}
		html += `</select></div>`;

		// Size
		html += `<div class="properties_row" data-prop="size">
			<label class="trn properties_label" for="prop_text_size">Size</label>
			<input type="number" class="properties_number" id="prop_text_size" data-text-key="size"
				min="${sizeMin}" max="${sizeMax}" step="any"
				value="${sizeVal != null && sizeVal !== '' && !Number.isNaN(Number(sizeVal)) ? sizeVal : ''}" />
		</div>`;

		// Weight
		html += `<div class="properties_row" data-prop="weight">
			<label class="trn properties_label" for="prop_text_weight">Weight</label>
			<select class="properties_select" id="prop_text_weight" data-text-key="weight">`;
		for (const w of weightOptions) {
			const sel = String(w) === String(weightVal) ? ' selected' : '';
			html += `<option value="${this.esc(w)}"${sel}>${this.esc(w)}</option>`;
		}
		html += `</select></div>`;

		// Style toggles
		html += `<div class="properties_row" data-prop="style">
			<label class="trn properties_label">Style</label>
			<div class="properties_toggle_row ui_button_group no_wrap">`;
		for (const key of ['bold', 'italic', 'underline', 'strikethrough']) {
			const pressed = boolPressed(key);
			const icon = styleIcons[key];
			const title = key[0].toUpperCase() + key.slice(1);
			html += `<button type="button" class="trn ui_icon_button input_height properties_toggle"
				id="prop_text_${key}" data-text-key="${key}" title="${title}"
				aria-pressed="${pressed ? 'true' : 'false'}">
				<img style="width:16px;height:16px;" alt="${title}" src="images/icons/${icon}" />
			</button>`;
		}
		html += `</div></div>`;

		// Fill
		html += `<div class="properties_row" data-prop="fill">
			<label class="trn properties_label" for="prop_text_fill">Fill</label>
			<input type="color" class="properties_color" id="prop_text_fill" data-text-key="fill"
				value="${this.esc(fillVal)}" />
		</div>`;

		// Align
		html += `<div class="properties_row" data-prop="halign">
			<label class="trn properties_label">Align</label>
			<div class="properties_align_group ui_button_group no_wrap" id="prop_text_halign_group">`;
		for (const align of ['Left', 'Center', 'Right', 'Justify']) {
			const isSelected = halignVal.toLowerCase() === align.toLowerCase();
			const disabled = (align === 'Justify' && isPoint);
			html += `<button type="button" class="trn ui_icon_button input_height properties_align_btn"
				id="prop_text_halign_${align.toLowerCase()}" data-text-key="halign" data-align="${align}"
				title="${align} Align" aria-pressed="${isSelected ? 'true' : 'false'}"
				${disabled ? 'disabled aria-disabled="true" style="opacity:0.35;pointer-events:none"' : ''}>
				<img style="width:16px;height:16px;" alt="${align}" src="images/icons/${alignIcons[align]}" />
			</button>`;
		}
		html += `</div></div>`;

		// Kerning
		html += `<div class="properties_row" data-prop="kerning">
			<label class="trn properties_label" for="prop_text_kerning">Kerning</label>
			<input type="number" class="properties_number" id="prop_text_kerning" data-text-key="kerning"
				min="${kernMin}" max="${kernMax}" step="any"
				value="${kerningVal != null && kerningVal !== '' && !Number.isNaN(Number(kerningVal)) ? kerningVal : 0}" />
		</div>`;

		// Leading
		html += `<div class="properties_row" data-prop="leading">
			<label class="trn properties_label" for="prop_text_leading">Leading</label>
			<input type="number" class="properties_number" id="prop_text_leading" data-text-key="leading"
				min="${leadMin}" max="${leadMax}" step="any"
				value="${leadingVal != null && leadingVal !== '' && !Number.isNaN(Number(leadingVal)) ? leadingVal : 0}" />
		</div>`;

		// Mode
		html += `<div class="properties_row" data-prop="boundary">
			<label class="trn properties_label" for="prop_text_boundary">Mode</label>
			<select class="properties_select" id="prop_text_boundary" data-text-key="boundary">
				<option value="Point"${modeVal === 'Point' ? ' selected' : ''}>Point</option>
				<option value="Paragraph"${modeVal === 'Paragraph' ? ' selected' : ''}>Paragraph</option>
			</select>
		</div>`;

		html += '</div>';

		target.innerHTML = html;
		delete target.dataset.adjType;
		target.dataset.textSig = sig;
		this.bound_layer_id = layer.id;
		this.bound_kind = 'text';
		this.params_at_interaction_start = null;

		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}

		this.bind_text_control_events(target, layer.id);
	}

	sync_text_control_values(target, attrs, layer) {
		if (!attrs || !target) return;
		const active = document.activeElement;

		const setSelect = (id, value) => {
			const el = target.querySelector('#' + id);
			if (!el || active === el) return;
			if (String(el.value) !== String(value)) el.value = value;
		};
		const setNumber = (id, value) => {
			const el = target.querySelector('#' + id);
			if (!el || active === el) return;
			const display = (value == null || value === '' || Number.isNaN(Number(value))) ? '' : value;
			if (String(el.value) !== String(display)) el.value = display;
		};
		const setColor = (id, value) => {
			const el = target.querySelector('#' + id);
			if (!el || active === el) return;
			if (value && String(el.value).toLowerCase() !== String(value).toLowerCase()) {
				el.value = value;
			}
		};
		const setToggle = (id, pressed) => {
			const el = target.querySelector('#' + id);
			if (!el) return;
			el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
		};

		setSelect('prop_text_font', this.attr_value(attrs.font) || '');
		setNumber('prop_text_size', this.attr_value(attrs.size));
		// Weight options may change with font — rebuild option list if needed
		const weightEl = target.querySelector('#prop_text_weight');
		if (weightEl && active !== weightEl) {
			const weightOptions = (attrs.weight && typeof attrs.weight.values === 'function')
				? attrs.weight.values()
				: (attrs.weight && attrs.weight.values) || [];
			const want = String(this.attr_value(attrs.weight) || '');
			const currentOpts = Array.from(weightEl.options).map((o) => o.value);
			if (weightOptions.length && (currentOpts.length !== weightOptions.length
				|| weightOptions.some((w, i) => String(w) !== currentOpts[i]))) {
				weightEl.innerHTML = weightOptions.map((w) =>
					`<option value="${this.esc(w)}"${String(w) === want ? ' selected' : ''}>${this.esc(w)}</option>`
				).join('');
			} else if (String(weightEl.value) !== want) {
				weightEl.value = want;
			}
		}
		setToggle('prop_text_bold', this.attr_value(attrs.bold) === true);
		setToggle('prop_text_italic', this.attr_value(attrs.italic) === true);
		setToggle('prop_text_underline', this.attr_value(attrs.underline) === true);
		setToggle('prop_text_strikethrough', this.attr_value(attrs.strikethrough) === true);
		setColor('prop_text_fill', this.attr_value(attrs.fill) || '#000000');
		setNumber('prop_text_kerning', this.attr_value(attrs.kerning));
		setNumber('prop_text_leading', this.attr_value(attrs.leading));
		setSelect('prop_text_boundary', this.attr_value(attrs.boundary) || (this.is_point_text(layer) ? 'Point' : 'Paragraph'));

		const halignVal = String(this.attr_value(attrs.halign) || 'Left');
		const isPoint = this.is_point_text(layer);
		for (const align of ['Left', 'Center', 'Right', 'Justify']) {
			const btn = target.querySelector('#prop_text_halign_' + align.toLowerCase());
			if (!btn) continue;
			const selected = halignVal.toLowerCase() === align.toLowerCase();
			btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
			if (align === 'Justify') {
				if (isPoint) {
					btn.disabled = true;
					btn.setAttribute('aria-disabled', 'true');
					btn.style.opacity = '0.35';
					btn.style.pointerEvents = 'none';
					btn.title = 'Justify is only available for paragraph text';
				} else {
					btn.disabled = false;
					btn.removeAttribute('aria-disabled');
					btn.style.opacity = '';
					btn.style.pointerEvents = '';
					btn.title = 'Justify Align';
				}
			}
		}

		target.dataset.textSig = this.text_signature(attrs, layer);
	}

	bind_text_control_events(target, layer_id) {
		const selects = target.querySelectorAll('select[data-text-key]');
		selects.forEach((sel) => {
			sel.addEventListener('change', () => {
				const key = sel.getAttribute('data-text-key');
				this.apply_text_attr(key, sel.value, { rebuild: key === 'font' || key === 'boundary' || key === 'weight' });
			});
		});

		const numbers = target.querySelectorAll('input.properties_number[data-text-key]');
		numbers.forEach((input) => {
			input.addEventListener('change', () => {
				const key = input.getAttribute('data-text-key');
				let val = this.parse_input_value(input);
				if (val === null) return;
				const min = parseFloat(input.min);
				const max = parseFloat(input.max);
				if (!isNaN(min)) val = Math.max(min, val);
				if (!isNaN(max)) val = Math.min(max, val);
				input.value = val;
				this.apply_text_attr(key, val);
			});
			// Live-ish for size/kerning/leading while typing is committed on change;
			// also fire on input for smoother preview like the options bar number widgets.
			input.addEventListener('input', () => {
				const key = input.getAttribute('data-text-key');
				const val = this.parse_input_value(input);
				if (val === null) return;
				this.apply_text_attr(key, val, { skipBarRebuild: true });
			});
			input.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					const key = input.getAttribute('data-text-key');
					let val = this.parse_input_value(input);
					if (val === null) val = 0;
					const increasing = e.key === 'ArrowUp';
					val = this.get_stepped_value(val, 1, increasing);
					const min = parseFloat(input.min);
					const max = parseFloat(input.max);
					if (!isNaN(min)) val = Math.max(min, val);
					if (!isNaN(max)) val = Math.min(max, val);
					input.value = val;
					this.apply_text_attr(key, val);
				}
			});
			input.addEventListener('wheel', (e) => {
				if (document.activeElement === input) {
					e.preventDefault();
					const delta = e.deltaY < 0 ? 1 : (e.deltaY > 0 ? -1 : 0);
					if (delta !== 0) {
						const key = input.getAttribute('data-text-key');
						let val = this.parse_input_value(input);
						if (val === null) val = 0;
						const increasing = delta > 0;
						val = this.get_stepped_value(val, 1, increasing);
						const min = parseFloat(input.min);
						const max = parseFloat(input.max);
						if (!isNaN(min)) val = Math.max(min, val);
						if (!isNaN(max)) val = Math.min(max, val);
						input.value = val;
						this.apply_text_attr(key, val);
					}
				}
			});
		});

		const color = target.querySelector('#prop_text_fill');
		if (color) {
			color.addEventListener('input', () => {
				this.apply_text_attr('fill', color.value, { skipBarRebuild: true });
			});
			color.addEventListener('change', () => {
				this.apply_text_attr('fill', color.value);
			});
		}

		const toggles = target.querySelectorAll('button.properties_toggle[data-text-key]');
		toggles.forEach((btn) => {
			btn.addEventListener('click', () => {
				const key = btn.getAttribute('data-text-key');
				const next = btn.getAttribute('aria-pressed') !== 'true';
				btn.setAttribute('aria-pressed', next ? 'true' : 'false');
				this.apply_text_attr(key, next, { rebuild: key === 'bold' });
			});
		});

		const alignBtns = target.querySelectorAll('button.properties_align_btn');
		alignBtns.forEach((btn) => {
			btn.addEventListener('click', () => {
				if (btn.disabled) return;
				const align = btn.getAttribute('data-align');
				alignBtns.forEach((b) => {
					b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
				});
				this.apply_text_attr('halign', align, { skipBarRebuild: true });
			});
		});
	}

	/**
	 * Push a Type attribute change through the same path as the options bar:
	 * update config.TOOLS text attrs → text.on_params_update → refresh options bar.
	 */
	apply_text_attr(key, value, options = {}) {
		const attrs = this.get_text_tool_attributes();
		if (!attrs || !(key in attrs)) return;

		this._applying_text = true;
		try {
			this.set_attr_value(attrs, key, value);

			// Font change: keep weight list / selection valid even when Type isn't active
			// (on_params_update weight sync uses action_data(), which is the active tool).
			if (key === 'font' && value && !String(value).includes('...')) {
				if (attrs.weight) {
					const variants = (typeof attrs.weight.values === 'function')
						? attrs.weight.values()
						: (attrs.weight.values || ['Regular (400)']);
					const current = attrs.weight.value;
					const matched = variants.find((v) => String(v) === String(current)
						|| String(v).toLowerCase() === String(current).toLowerCase()
						|| (String(v).match(/\((\d+)\)/) && String(current).match(/\((\d+)\)/)
							&& String(v).match(/\((\d+)\)/)[1] === String(current).match(/\((\d+)\)/)[1]));
					attrs.weight.value = matched || variants[0] || 'Regular (400)';
					if (attrs.bold) {
						const w = String(attrs.weight.value);
						const m = w.match(/\((\d+)\)/);
						const n = m ? parseInt(m[1], 10) : (/bold/i.test(w) ? 700 : 400);
						attrs.bold.value = n >= 700;
					}
				}
			}

			const textMod = this.get_text_module();
			if (textMod && typeof textMod.on_params_update === 'function') {
				const result = textMod.on_params_update({ key, value });
				if (result && result.new_values) {
					for (const k in result.new_values) {
						this.set_attr_value(attrs, k, result.new_values[k]);
					}
				}
			}

			// Two-way: keep Type options bar in sync when Type tool is active
			if (!options.skipBarRebuild
				&& config.TOOL && config.TOOL.name === 'text'
				&& this.GUI && this.GUI.GUI_tools
				&& typeof this.GUI.GUI_tools.show_action_attributes === 'function') {
				this.GUI.GUI_tools.show_action_attributes();
			} else if (key === 'halign' && textMod
				&& typeof textMod.update_halign_justify_availability === 'function') {
				try {
					textMod.update_halign_justify_availability(this.is_point_text(config.layer));
				} catch (e) { /* ignore */ }
			}

			if (options.rebuild) {
				this.bound_layer_id = null;
				this.render_properties(true);
			} else {
				const target = document.getElementById('toggle_properties');
				if (target && target.querySelector('.properties_text_controls') && config.layer) {
					this.sync_text_control_values(target, attrs, config.layer);
				}
			}
		} finally {
			this._applying_text = false;
		}
	}

	/**
	 * Called from the Type options bar after attributes remount / change so
	 * Properties stays two-way bound. No-op while Properties is driving the change,
	 * or when Properties isn't showing text controls / text isn't selected.
	 */

	/**
	 * Raster image layer Properties: Quick Actions (Remove Background, etc.).
	 */
	render_image_properties(target, layer, bind_events = false) {
		const kind = layer.type || 'image';
		if (!bind_events && this.bound_kind === kind && this.bound_layer_id === layer.id
			&& target.querySelector('.properties_image_controls')) {
			return;
		}

		let html = '<div class="properties_controls properties_image_controls">';
		html += '<div class="properties_title trn">' + (layer.type === 'smart' ? 'Smart Object' : 'Layer') + '</div>';
		html += `<div class="properties_row"><span class="properties_subinfo_text">${this.esc(layer.name || (layer.type === 'smart' ? 'Smart Object' : 'Image'))}</span></div>`;
		html += '<div class="properties_group_title trn">Quick Actions</div>';
		html += `<div class="properties_row">
			<button type="button" class="button trn" id="prop_remove_background">Remove Background</button>
		</div>`;
		html += '<div class="properties_row"><span class="properties_subinfo_text trn">Writes a soft layer mask (nondestructive).</span></div>';
		html += '</div>';
		target.innerHTML = html;
		this.bound_layer_id = layer.id;
		this.bound_kind = kind;
		delete target.dataset.adjType;
		delete target.dataset.textSig;

		if (bind_events) {
			const btn = target.querySelector('#prop_remove_background');
			if (btn) {
				btn.addEventListener('click', () => {
					const Bg = new Tools_bg_auto_class();
					Bg.remove_background();
				});
			}
		}

		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}
	}

	on_text_attributes_changed() {
		if (this._applying_text) return;
		const layer = config.layer;
		if (!layer || layer.type !== 'text') return;
		const target = document.getElementById('toggle_properties');
		if (!target || !target.querySelector('.properties_text_controls')) return;
		const attrs = this.get_text_tool_attributes();
		if (!attrs) return;
		this.sync_text_control_values(target, attrs, layer);
	}
}

export default GUI_properties_class;
