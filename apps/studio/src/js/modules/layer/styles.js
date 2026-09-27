import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Effects_shadow_class from '../effects/common/shadow.js';
import Effects_outer_glow_class from '../effects/common/outer_glow.js';
import Effects_inner_glow_class from '../effects/common/inner_glow.js';
import Effects_stroke_class from '../effects/common/stroke.js';
import Effects_color_overlay_class from '../effects/common/color_overlay.js';

const STYLE_FILTER_NAMES = ['stroke', 'color_overlay', 'inner_glow', 'outer_glow', 'shadow', 'drop-shadow'];

class Layer_styles_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();

		this.Effects_shadow = new Effects_shadow_class();
		this.Effects_outer_glow = new Effects_outer_glow_class();
		this.Effects_inner_glow = new Effects_inner_glow_class();
		this.Effects_stroke = new Effects_stroke_class();
		this.Effects_color_overlay = new Effects_color_overlay_class();

		this.activeTab = 'shadow';
		this.layer_id = null;
		this.styles = {};
		this._snapshot = null;
	}

	/**
	 * Photoshop-like light angle → shadow offset.
	 * Angle 0° = light from the right; shadow casts opposite.
	 * Canvas Y grows downward, so +sin pushes the shadow down.
	 */
	static offset_from_angle_distance(angleDeg, distance) {
		const rad = (Number(angleDeg) || 0) * Math.PI / 180;
		const d = Number(distance) || 0;
		return {
			x: Math.round(-Math.cos(rad) * d),
			y: Math.round(Math.sin(rad) * d),
		};
	}

	static angle_distance_from_offset(x, y) {
		const ox = Number(x) || 0;
		const oy = Number(y) || 0;
		const distance = Math.round(Math.sqrt(ox * ox + oy * oy));
		let angle = Math.round(Math.atan2(oy, -ox) * 180 / Math.PI);
		while (angle > 180) angle -= 360;
		while (angle < -180) angle += 360;
		return { angle, distance };
	}

	open(initialEffect = 'shadow', filter_id = null) {
		if (config.layer == null || config.layer.type == null) {
			alertify.error('Layer is empty.');
			return;
		}

		this.layer_id = config.layer.id;
		this.activeTab = initialEffect || 'shadow';

		// Snapshot for Cancel restore; OK restores then commits via undoable action
		try {
			this._snapshot = {
				filters: JSON.parse(JSON.stringify(config.layer.filters || [])),
			};
		} catch (e) {
			this._snapshot = {
				filters: (config.layer.filters || []).slice(),
			};
		}

		this.styles = {
			stroke: {
				name: 'Stroke',
				enabled: false,
				id: null,
				params: { size: 3, position: 'outside', opacity: 100, color: '#000000' }
			},
			color_overlay: {
				name: 'Color Overlay',
				enabled: false,
				id: null,
				params: { opacity: 100, color: '#ff0000', blendMode: 'source-over' }
			},
			inner_glow: {
				name: 'Inner Glow',
				enabled: false,
				id: null,
				params: { value: 10, opacity: 75, color: '#ffffff' }
			},
			outer_glow: {
				name: 'Outer Glow',
				enabled: false,
				id: null,
				params: { value: 10, opacity: 75, color: '#ffff00' }
			},
			shadow: {
				name: 'Drop Shadow',
				enabled: false,
				id: null,
				params: { angle: 135, distance: 7, x: 5, y: 5, value: 10, opacity: 25, color: '#000000' }
			}
		};

		if (config.layer.filters) {
			for (const f of config.layer.filters) {
				const filterName = f.name === 'drop-shadow' ? 'shadow' : f.name;
				if (this.styles[filterName]) {
					this.styles[filterName].enabled = !f.disabled;
					this.styles[filterName].id = f.id;
					let initialParams = { ...this.styles[filterName].params, ...f.params };
					if (filterName === 'shadow') {
						if (initialParams.angle == null || initialParams.distance == null) {
							const ad = Layer_styles_class.angle_distance_from_offset(initialParams.x ?? 5, initialParams.y ?? 5);
							initialParams.angle = ad.angle;
							initialParams.distance = ad.distance;
						}
					}
					this.styles[filterName].params = initialParams;
				}
			}
		}

		if (filter_id != null && config.layer.filters) {
			for (const f of config.layer.filters) {
				if (f.id == filter_id) {
					const filterName = f.name === 'drop-shadow' ? 'shadow' : f.name;
					if (this.styles[filterName]) {
						this.activeTab = filterName;
					}
					break;
				}
			}
		}
		if (this.styles[this.activeTab]) {
			this.styles[this.activeTab].enabled = true;
		}

		this.show_dialog();
	}

	show_dialog() {
		const _this = this;

		const settings = {
			title: 'Layer Style',
			// No mini pop_pre/pop_post pane — draft live on the main canvas only.
			preview: false,
			className: 'layer_style_dialog wide',
			params: [
				{
					html: this.generate_dialog_html()
				}
			],
			on_load: function() {
				_this.bind_dialog_events();
				_this.apply_live_canvas();
			},
			on_finish: function() {
				_this.commit_styles();
			},
			on_cancel: function() {
				_this.restore_snapshot();
				_this.request_render();
			}
		};

		this.POP.show(settings);
	}

	generate_dialog_html() {
		return `
			<div class="layer_style_container">
				<div class="layer_style_sidebar">
					<div class="layer_style_list">
						${this.generate_sidebar_items()}
					</div>
				</div>
				<div class="layer_style_main">
					<div class="layer_style_controls" id="layer_style_controls">
						${this.generate_controls_html(this.activeTab)}
					</div>
				</div>
			</div>
		`;
	}

	generate_sidebar_items() {
		const items = [
			{ key: 'stroke', title: 'Stroke' },
			{ key: 'color_overlay', title: 'Color Overlay' },
			{ key: 'inner_glow', title: 'Inner Glow' },
			{ key: 'outer_glow', title: 'Outer Glow' },
			{ key: 'shadow', title: 'Drop Shadow' }
		];

		let html = '';
		for (const item of items) {
			const isChecked = this.styles[item.key].enabled ? 'checked' : '';
			const isActive = this.activeTab === item.key ? 'active' : '';
			html += `
				<div class="layer_style_item ${isActive}" data-effect="${item.key}">
					<input type="checkbox" class="ls_chk" data-effect="${item.key}" id="ls_chk_${item.key}" ${isChecked} />
					<span class="ls_title" data-effect="${item.key}">${item.title}</span>
				</div>
			`;
		}
		return html;
	}

	generate_controls_html(effectKey) {
		const style = this.styles[effectKey];
		if (!style) return '';

		let fields = '';
		if (effectKey === 'stroke') {
			const pos = style.params.position || 'outside';
			const size = style.params.size || 3;
			const opacity = style.params.opacity ?? 100;
			fields = `
				<div class="ls_row">
					<span class="ls_label">Size:</span>
					<input type="range" class="ls_range" id="ls_stroke_size" min="1" max="100" value="${size}" step="1" data-default="3" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_stroke_size" min="1" max="100" value="${size}" step="1" data-default="3" title="Double-click to reset" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Position:</span>
					<select id="ls_stroke_position">
						<option value="outside" ${pos === 'outside' ? 'selected' : ''}>Outside</option>
						<option value="inside" ${pos === 'inside' ? 'selected' : ''}>Inside</option>
						<option value="center" ${pos === 'center' ? 'selected' : ''}>Center</option>
					</select>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_stroke_opacity" min="0" max="100" value="${opacity}" step="1" data-default="100" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_stroke_opacity" min="0" max="100" value="${opacity}" step="1" data-default="100" title="Double-click to reset" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_stroke_color" value="${style.params.color || '#000000'}" />
				</div>
			`;
		} else if (effectKey === 'color_overlay') {
			const opacity = style.params.opacity ?? 100;
			const blend = style.params.blendMode || 'source-over';
			const blendOpts = [
				{ value: 'source-over', label: 'Normal' },
				{ value: 'darken', label: 'Darken' },
				{ value: 'multiply', label: 'Multiply' },
				{ value: 'color-burn', label: 'Color Burn' },
				{ value: 'linear-burn', label: 'Linear Burn' },
				{ value: 'darker-color', label: 'Darker Color' },
				{ value: 'lighten', label: 'Lighten' },
				{ value: 'screen', label: 'Screen' },
				{ value: 'color-dodge', label: 'Color Dodge' },
				{ value: 'lighter', label: 'Linear Dodge (Add)' },
				{ value: 'lighter-color', label: 'Lighter Color' },
				{ value: 'overlay', label: 'Overlay' },
				{ value: 'soft-light', label: 'Soft Light' },
				{ value: 'hard-light', label: 'Hard Light' },
				{ value: 'vivid-light', label: 'Vivid Light' },
				{ value: 'linear-light', label: 'Linear Light' },
				{ value: 'pin-light', label: 'Pin Light' },
				{ value: 'hard-mix', label: 'Hard Mix' },
				{ value: 'difference', label: 'Difference' },
				{ value: 'exclusion', label: 'Exclusion' },
				{ value: 'subtract', label: 'Subtract' },
				{ value: 'divide', label: 'Divide' },
				{ value: 'hue', label: 'Hue' },
				{ value: 'saturation', label: 'Saturation' },
				{ value: 'color', label: 'Color' },
				{ value: 'luminosity', label: 'Luminosity' },
			];
			const blendOptionsHtml = blendOpts.map(o =>
				`<option value="${o.value}" ${blend === o.value ? 'selected' : ''}>${o.label}</option>`
			).join('');
			fields = `
				<div class="ls_row">
					<span class="ls_label">Blend Mode:</span>
					<select id="ls_color_overlay_blendMode">
						${blendOptionsHtml}
					</select>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_color_overlay_opacity" min="0" max="100" value="${opacity}" step="1" data-default="100" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_color_overlay_opacity" min="0" max="100" value="${opacity}" step="1" data-default="100" title="Double-click to reset" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_color_overlay_color" value="${style.params.color || '#ff0000'}" />
				</div>
			`;
		} else if (effectKey === 'inner_glow') {
			const val = style.params.value ?? 10;
			const opacity = style.params.opacity ?? 75;
			fields = `
				<div class="ls_row">
					<span class="ls_label">Size:</span>
					<input type="range" class="ls_range" id="ls_inner_glow_value" min="0" max="100" value="${val}" step="1" data-default="10" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_inner_glow_value" min="0" max="100" value="${val}" step="1" data-default="10" title="Double-click to reset" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_inner_glow_opacity" min="0" max="100" value="${opacity}" step="1" data-default="75" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_inner_glow_opacity" min="0" max="100" value="${opacity}" step="1" data-default="75" title="Double-click to reset" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_inner_glow_color" value="${style.params.color || '#ffffff'}" />
				</div>
			`;
		} else if (effectKey === 'outer_glow') {
			const val = style.params.value ?? 10;
			const opacity = style.params.opacity ?? 75;
			fields = `
				<div class="ls_row">
					<span class="ls_label">Size:</span>
					<input type="range" class="ls_range" id="ls_outer_glow_value" min="0" max="100" value="${val}" step="1" data-default="10" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_outer_glow_value" min="0" max="100" value="${val}" step="1" data-default="10" title="Double-click to reset" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_outer_glow_opacity" min="0" max="100" value="${opacity}" step="1" data-default="75" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_outer_glow_opacity" min="0" max="100" value="${opacity}" step="1" data-default="75" title="Double-click to reset" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_outer_glow_color" value="${style.params.color || '#ffff00'}" />
				</div>
			`;
		} else if (effectKey === 'shadow') {
			const x = style.params.x ?? 5;
			const y = style.params.y ?? 5;
			const ad = Layer_styles_class.angle_distance_from_offset(x, y);
			let angle = style.params.angle != null ? style.params.angle : ad.angle;
			while (angle > 180) angle -= 360;
			while (angle < -180) angle += 360;
			const distance = style.params.distance != null ? style.params.distance : ad.distance;
			const val = style.params.value ?? 10;
			const opacity = style.params.opacity ?? 25;

			const rad = (Number(angle) || 0) * Math.PI / 180;
			const needleX = (18 + Math.cos(rad) * 13.5).toFixed(1);
			const needleY = (18 - Math.sin(rad) * 13.5).toFixed(1);

			fields = `
				<div class="ls_row ls_row_angle">
					<span class="ls_label">Angle:</span>
					<div class="ls_angle_control">
						<svg class="ls_angle_dial" id="ls_shadow_angle_dial" width="36" height="36" viewBox="0 0 36 36" title="Click or drag to change angle (Shift for 15° steps), double-click to reset">
							<circle cx="18" cy="18" r="16" class="ls_angle_circle" />
							<line x1="18" y1="18" x2="${needleX}" y2="${needleY}" class="ls_angle_needle" />
							<circle cx="18" cy="18" r="2.2" class="ls_angle_center" />
						</svg>
						<input type="number" class="ls_num" id="ls_num_shadow_angle" min="-180" max="180" value="${angle}" step="1" data-default="135" title="Double-click to reset" />
						<span class="ls_unit">°</span>
					</div>
				</div>
				<div class="ls_row">
					<span class="ls_label">Distance:</span>
					<input type="range" class="ls_range" id="ls_shadow_distance" min="0" max="200" value="${distance}" step="1" data-default="7" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_shadow_distance" min="0" max="200" value="${distance}" step="1" data-default="7" title="Double-click to reset" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Radius:</span>
					<input type="range" class="ls_range" id="ls_shadow_value" min="0" max="100" value="${val}" step="1" data-default="10" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_shadow_value" min="0" max="100" value="${val}" step="1" data-default="10" title="Double-click to reset" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_shadow_opacity" min="0" max="100" value="${opacity}" step="1" data-default="25" title="Double-click to reset" />
					<input type="number" class="ls_num" id="ls_num_shadow_opacity" min="0" max="100" value="${opacity}" step="1" data-default="25" title="Double-click to reset" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_shadow_color" value="${style.params.color || '#000000'}" />
				</div>
			`;
		}

		return `
			<h3 class="ls_heading">${style.name}</h3>
			<div class="ls_fields">${fields}</div>
		`;
	}

	bind_dialog_events() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		const sidebarItems = popup.querySelectorAll('.layer_style_item');
		sidebarItems.forEach(item => {
			const effectKey = item.dataset.effect;
			const checkbox = item.querySelector('.ls_chk');

			item.addEventListener('click', (e) => {
				if (e.target === checkbox) return;
				this.read_current_controls();
				this.activeTab = effectKey;
				if (!this.styles[effectKey].enabled) {
					this.styles[effectKey].enabled = true;
				}
				this.refresh_tabs();
				this.apply_live_canvas();
			});

			if (checkbox) {
				checkbox.addEventListener('change', (e) => {
					e.stopPropagation();
					this.read_current_controls();
					this.styles[effectKey].enabled = checkbox.checked;
					this.activeTab = effectKey;
					this.refresh_tabs();
					this.apply_live_canvas();
				});
			}
		});

		this.bind_control_inputs();
	}

	bind_control_inputs() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		const controls = popup.querySelector('#layer_style_controls');
		if (!controls) return;

		const ranges = controls.querySelectorAll('input[type="range"]');
		const resetRangePair = (el) => {
			const defRaw = el.getAttribute('data-default');
			if (defRaw === null || defRaw === '') return;
			const defVal = parseFloat(defRaw);
			if (isNaN(defVal)) return;
			const isNum = el.classList.contains('ls_num');
			const key = isNum ? el.id.replace('ls_num_', '') : el.id.replace('ls_', '');
			const rangeInput = controls.querySelector('#ls_' + key);
			const numInput = controls.querySelector('#ls_num_' + key);
			if (rangeInput) rangeInput.value = defVal;
			if (numInput) numInput.value = defVal;
			if (key === 'shadow_angle') {
				this.update_angle_dial(defVal);
			}
			this.read_current_controls();
			this.apply_live_canvas();
		};

		ranges.forEach(range => {
			const key = range.id.replace('ls_', '');
			const numInput = controls.querySelector('#ls_num_' + key);
			const syncFromRange = () => {
				if (numInput) numInput.value = range.value;
				this.read_current_controls();
				this.apply_live_canvas();
			};

			range.addEventListener('input', syncFromRange);
			range.addEventListener('change', syncFromRange);
			range.addEventListener('dblclick', (e) => {
				e.preventDefault();
				resetRangePair(range);
			});
		});

		const numbers = controls.querySelectorAll('input[type="number"].ls_num');
		numbers.forEach(num => {
			const key = num.id.replace('ls_num_', '');
			const rangeInput = controls.querySelector('#ls_' + key);
			const syncFromNumber = () => {
				let val = parseFloat(num.value);
				if (isNaN(val)) return;

				if (rangeInput) {
					const min = parseFloat(rangeInput.min ?? 0);
					const max = parseFloat(rangeInput.max ?? 100);
					const clamped = Math.max(min, Math.min(max, val));
					rangeInput.value = clamped;
				}
				if (key === 'shadow_angle') {
					this.update_angle_dial(val);
				}
				this.read_current_controls();
				this.apply_live_canvas();
			};

			num.addEventListener('input', syncFromNumber);
			num.addEventListener('change', syncFromNumber);

			num.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					const step = parseFloat(num.step) || 1;
					const mult = e.shiftKey ? 10 : 1;
					const inc = e.key === 'ArrowUp' ? 1 : -1;
					const min = (num.min !== '') ? parseFloat(num.min) : -Infinity;
					const max = (num.max !== '') ? parseFloat(num.max) : Infinity;

					let cur = parseFloat(num.value);
					if (isNaN(cur)) cur = isFinite(min) ? min : 0;
					let nextVal = Math.round((cur + inc * step * mult) / step) * step;

					if (key === 'shadow_angle') {
						while (nextVal > 180) nextVal -= 360;
						while (nextVal < -180) nextVal += 360;
					} else {
						if (isFinite(min)) nextVal = Math.max(min, nextVal);
						if (isFinite(max)) nextVal = Math.min(max, nextVal);
					}

					num.value = nextVal;
					syncFromNumber();
				}
			});

			num.addEventListener('wheel', (e) => {
				if (document.activeElement === num) {
					e.preventDefault();
					const step = parseFloat(num.step) || 1;
					const mult = e.shiftKey ? 10 : 1;
					const inc = e.deltaY < 0 ? 1 : -1;
					const min = (num.min !== '') ? parseFloat(num.min) : -Infinity;
					const max = (num.max !== '') ? parseFloat(num.max) : Infinity;

					let cur = parseFloat(num.value);
					if (isNaN(cur)) cur = isFinite(min) ? min : 0;
					let nextVal = Math.round((cur + inc * step * mult) / step) * step;

					if (key === 'shadow_angle') {
						while (nextVal > 180) nextVal -= 360;
						while (nextVal < -180) nextVal += 360;
					} else {
						if (isFinite(min)) nextVal = Math.max(min, nextVal);
						if (isFinite(max)) nextVal = Math.min(max, nextVal);
					}

					num.value = nextVal;
					syncFromNumber();
				}
			}, { passive: false });

			num.addEventListener('dblclick', (e) => {
				e.preventDefault();
				resetRangePair(num);
			});
		});

		// Interactive Angle Dial controller
		const dial = controls.querySelector('#ls_shadow_angle_dial');
		const numAngleInput = controls.querySelector('#ls_num_shadow_angle');
		if (dial && numAngleInput) {
			let isDragging = false;
			const handlePointer = (e) => {
				const rect = dial.getBoundingClientRect();
				const cx = rect.left + rect.width / 2;
				const cy = rect.top + rect.height / 2;
				const dx = e.clientX - cx;
				const dy = e.clientY - cy;
				let deg = Math.round(Math.atan2(-dy, dx) * 180 / Math.PI);
				if (e.shiftKey) {
					deg = Math.round(deg / 15) * 15;
				}
				while (deg > 180) deg -= 360;
				while (deg < -180) deg += 360;
				numAngleInput.value = deg;
				this.update_angle_dial(deg);
				this.read_current_controls();
				this.apply_live_canvas();
			};

			dial.addEventListener('pointerdown', (e) => {
				if (e.button != null && e.button !== 0) return;
				try { dial.setPointerCapture(e.pointerId); } catch (_) {}
				isDragging = true;
				handlePointer(e);
			});
			dial.addEventListener('pointermove', (e) => {
				if (!isDragging) return;
				handlePointer(e);
			});
			const endDrag = (e) => {
				if (!isDragging) return;
				isDragging = false;
				try { dial.releasePointerCapture(e.pointerId); } catch (_) {}
			};
			dial.addEventListener('pointerup', endDrag);
			dial.addEventListener('pointercancel', endDrag);

			dial.addEventListener('dblclick', (e) => {
				e.preventDefault();
				const def = parseInt(numAngleInput.getAttribute('data-default') || '135', 10);
				numAngleInput.value = def;
				this.update_angle_dial(def);
				this.read_current_controls();
				this.apply_live_canvas();
			});
		}

		const otherInputs = controls.querySelectorAll('input[type="color"], select');
		otherInputs.forEach(el => {
			el.addEventListener('input', () => {
				this.read_current_controls();
				this.apply_live_canvas();
			});
			el.addEventListener('change', () => {
				this.read_current_controls();
				this.apply_live_canvas();
			});
		});
	}

	update_angle_dial(angleDeg) {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;
		const dial = popup.querySelector('#ls_shadow_angle_dial');
		if (!dial) return;
		const needle = dial.querySelector('.ls_angle_needle');
		if (!needle) return;
		const rad = (Number(angleDeg) || 0) * Math.PI / 180;
		needle.setAttribute('x2', (18 + Math.cos(rad) * 13.5).toFixed(1));
		needle.setAttribute('y2', (18 - Math.sin(rad) * 13.5).toFixed(1));
	}

	refresh_tabs() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		const items = popup.querySelectorAll('.layer_style_item');
		items.forEach(item => {
			const effectKey = item.dataset.effect;
			if (effectKey === this.activeTab) {
				item.classList.add('active');
			} else {
				item.classList.remove('active');
			}
			const checkbox = item.querySelector('.ls_chk');
			if (checkbox) {
				checkbox.checked = !!this.styles[effectKey].enabled;
			}
		});

		const controls = popup.querySelector('#layer_style_controls');
		if (controls) {
			controls.innerHTML = this.generate_controls_html(this.activeTab);
			this.bind_control_inputs();
		}
	}

	read_current_controls() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		const k = this.activeTab;
		const style = this.styles[k];
		if (!style) return;

		if (k === 'stroke') {
			const sizeEl = popup.querySelector('#ls_stroke_size');
			const numSizeEl = popup.querySelector('#ls_num_stroke_size');
			const posEl = popup.querySelector('#ls_stroke_position');
			const opacityEl = popup.querySelector('#ls_stroke_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_stroke_opacity');
			const colorEl = popup.querySelector('#ls_stroke_color');
			if (sizeEl || numSizeEl) {
				const size = parseInt((numSizeEl ? numSizeEl.value : sizeEl?.value) || 3);
				const position = posEl ? posEl.value : 'outside';
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 100);
				const color = colorEl?.value || '#000000';
				style.params = { size, position, opacity, color };
			}
		} else if (k === 'color_overlay') {
			const opacityEl = popup.querySelector('#ls_color_overlay_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_color_overlay_opacity');
			const colorEl = popup.querySelector('#ls_color_overlay_color');
			const blendEl = popup.querySelector('#ls_color_overlay_blendMode');
			if (opacityEl || numOpacityEl || colorEl || blendEl) {
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 100);
				const color = colorEl?.value || '#ff0000';
				const blendMode = blendEl?.value || 'source-over';
				style.params = { opacity, color, blendMode };
			}
		} else if (k === 'inner_glow') {
			const valueEl = popup.querySelector('#ls_inner_glow_value');
			const numValueEl = popup.querySelector('#ls_num_inner_glow_value');
			const opacityEl = popup.querySelector('#ls_inner_glow_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_inner_glow_opacity');
			const colorEl = popup.querySelector('#ls_inner_glow_color');
			if (valueEl || numValueEl) {
				const value = parseInt((numValueEl ? numValueEl.value : valueEl?.value) ?? 10);
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 75);
				const color = colorEl?.value || '#ffffff';
				style.params = { value, opacity, color };
			}
		} else if (k === 'outer_glow') {
			const valueEl = popup.querySelector('#ls_outer_glow_value');
			const numValueEl = popup.querySelector('#ls_num_outer_glow_value');
			const opacityEl = popup.querySelector('#ls_outer_glow_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_outer_glow_opacity');
			const colorEl = popup.querySelector('#ls_outer_glow_color');
			if (valueEl || numValueEl) {
				const value = parseInt((numValueEl ? numValueEl.value : valueEl?.value) ?? 10);
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 75);
				const color = colorEl?.value || '#ffff00';
				style.params = { value, opacity, color };
			}
		} else if (k === 'shadow') {
			const numAngleEl = popup.querySelector('#ls_num_shadow_angle');
			const distEl = popup.querySelector('#ls_shadow_distance');
			const numDistEl = popup.querySelector('#ls_num_shadow_distance');
			const valueEl = popup.querySelector('#ls_shadow_value');
			const numValueEl = popup.querySelector('#ls_num_shadow_value');
			const opacityEl = popup.querySelector('#ls_shadow_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_shadow_opacity');
			const colorEl = popup.querySelector('#ls_shadow_color');
			if (numAngleEl && (distEl || numDistEl) && (valueEl || numValueEl)) {
				let angle = parseInt(numAngleEl.value, 10);
				if (isNaN(angle)) angle = 135;
				while (angle > 180) angle -= 360;
				while (angle < -180) angle += 360;
				const distance = parseInt((numDistEl ? numDistEl.value : distEl?.value) ?? 7, 10);
				const offset = Layer_styles_class.offset_from_angle_distance(angle, distance);
				const value = parseInt((numValueEl ? numValueEl.value : valueEl?.value) ?? 10, 10);
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 25, 10);
				const color = colorEl?.value || '#000000';
				style.params = { x: offset.x, y: offset.y, angle, distance, value, opacity, color };
			}
		}
	}

	build_draft_filters(baseFilters) {
		const nonStyle = (baseFilters || []).filter((f) => {
			if (!f) return false;
			const n = f.name === 'drop-shadow' ? 'shadow' : f.name;
			return !STYLE_FILTER_NAMES.includes(n) && !STYLE_FILTER_NAMES.includes(f.name);
		});
		const draft = nonStyle.slice();
		for (const name of ['color_overlay', 'stroke', 'inner_glow', 'outer_glow', 'shadow']) {
			const style = this.styles[name];
			if (style && style.enabled) {
				draft.push({
					id: style.id || (Math.floor(Math.random() * 999999999) + 1),
					name: name,
					disabled: false,
					params: { ...style.params }
				});
			}
		}
		return draft;
	}

	restore_snapshot() {
		const layer = (this.layer_id != null)
			? this.Base_layers.get_layer(this.layer_id)
			: config.layer;
		if (!layer || !this._snapshot) return;
		try {
			layer.filters = JSON.parse(JSON.stringify(this._snapshot.filters || []));
		} catch (e) {
			layer.filters = (this._snapshot.filters || []).slice();
		}
	}

	request_render() {
		config.need_render = true;
		if (app.Layers && typeof app.Layers.render === 'function') {
			try {
				if (app.Layers.invalidate) {
					app.Layers.invalidate({ document: true, preview: true });
				}
				app.Layers.render(true);
			} catch (e) {
				// need_render is enough
			}
		}
	}

	/**
	 * Draft FX onto the real layer/canvas while the dialog is open.
	 * Mutates without State history — OK commits via Update_layer_action.
	 */
	apply_live_canvas() {
		const layer = (this.layer_id != null)
			? this.Base_layers.get_layer(this.layer_id)
			: config.layer;
		if (!layer) return;

		const base = this._snapshot ? this._snapshot.filters : (layer.filters || []);
		layer.filters = this.build_draft_filters(base);
		this.request_render();
	}

	/**
	 * OK: restore snapshot then commit draft via undoable Update_layer_action.
	 */
	commit_styles() {
		this.read_current_controls();
		var targetLayer = (this.layer_id != null) ? this.Base_layers.get_layer(this.layer_id) : config.layer;
		if (!targetLayer) {
			targetLayer = config.layer;
		}
		if (!targetLayer) return;

		const baseFilters = this._snapshot ? this._snapshot.filters : (targetLayer.filters || []);
		const newFilters = this.build_draft_filters(baseFilters);

		// Restore pre-dialog filters so Update_layer_action records correct undo delta
		this.restore_snapshot();

		app.State.do_action(
			new app.Actions.Update_layer_action(targetLayer.id, {
				filters: newFilters
			})
		);

		this._snapshot = null;
	}

	/** @deprecated use commit_styles */
	save_styles() {
		this.commit_styles();
	}

}

export default Layer_styles_class;
