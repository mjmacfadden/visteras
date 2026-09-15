import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import Base_gui_class from './../../core/base-gui.js';
import Base_layers_class from './../../core/base-layers.js';
import Tools_settings_class from './../tools/settings.js';
import zoomView from './../../libs/zoomView.js';

const RULER_FONT = "300 9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const UNIT_MAP = {
	pixels: { label: 'Pixels', short: 'px', toWorldPx: (ppi) => 1 },
	inches: { label: 'Inches', short: 'in', toWorldPx: (ppi) => ppi },
	centimeters: { label: 'Centimeters', short: 'cm', toWorldPx: (ppi) => ppi / 2.54 },
	millimetres: { label: 'Millimeters', short: 'mm', toWorldPx: (ppi) => ppi / 25.4 },
};

var instance = null;

class View_ruler_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.GUI = new Base_gui_class();
		this.Base_layers = new Base_layers_class();
		this.Tools_settings = new Tools_settings_class();
		this.Helper = new Helper_class();

		this.set_events();
	}

	set_events() {
		var _this = this;

		window.addEventListener('resize', function () {
			_this.prepare_ruler();
			_this.render_ruler();
		}, false);

		document.addEventListener('keydown', (event) => {
			if (this.Helper.is_input(event.target))
				return;

			if (event.code == "KeyU" && event.ctrlKey != true && event.metaKey != true) {
				_this.ruler();
				event.preventDefault();
			}
		}, false);

		var ruler_top = document.getElementById('ruler_top');
		var ruler_left = document.getElementById('ruler_left');

		if (ruler_top) {
			ruler_top.addEventListener('mousedown', (e) => {
				if (e.button === 0) {
					_this.start_guide_drag('horizontal', e);
				}
			});
			ruler_top.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				_this.show_context_menu(e);
			});
		}
		if (ruler_left) {
			ruler_left.addEventListener('mousedown', (e) => {
				if (e.button === 0) {
					_this.start_guide_drag('vertical', e);
				}
			});
			ruler_left.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				_this.show_context_menu(e);
			});
		}
	}

	show_context_menu(e) {
		const existingMenu = document.getElementById('ruler_context_menu');
		if (existingMenu) existingMenu.remove();

		const currentUnit = this.Tools_settings.get_setting('default_units') || 'pixels';
		const menu = document.createElement('div');
		menu.id = 'ruler_context_menu';
		menu.style.position = 'fixed';
		menu.style.left = e.clientX + 'px';
		menu.style.top = e.clientY + 'px';
		menu.style.backgroundColor = '#262626';
		menu.style.color = '#e0e0e0';
		menu.style.border = '1px solid #444444';
		menu.style.borderRadius = '5px';
		menu.style.boxShadow = '0 6px 18px rgba(0,0,0,0.5)';
		menu.style.padding = '4px 0';
		menu.style.zIndex = '9999';
		menu.style.fontSize = '12px';
		menu.style.minWidth = '130px';
		menu.style.userSelect = 'none';

		const items = [
			{ id: 'pixels', label: 'Pixels (px)', short: 'px' },
			{ id: 'inches', label: 'Inches (in)', short: 'in' },
			{ id: 'centimeters', label: 'Centimeters (cm)', short: 'cm' },
			{ id: 'millimetres', label: 'Millimeters (mm)', short: 'mm' },
		];

		items.forEach(item => {
			const row = document.createElement('div');
			row.style.padding = '6px 14px';
			row.style.cursor = 'pointer';
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '8px';
			row.style.transition = 'background-color 0.1s';

			const isSelected = item.id === currentUnit;
			row.innerHTML = `<span style="width: 12px; font-weight: bold; color: #3b82f6;">${isSelected ? '✓' : ''}</span> <span>${item.label}</span>`;

			row.addEventListener('mouseenter', () => {
				row.style.backgroundColor = '#3b82f6';
				row.style.color = '#ffffff';
			});
			row.addEventListener('mouseleave', () => {
				row.style.backgroundColor = 'transparent';
				row.style.color = '#e0e0e0';
			});
			row.addEventListener('click', (ev) => {
				ev.stopPropagation();
				this.Tools_settings.save_setting('default_units', item.id);
				this.Tools_settings.save_setting('default_units_short', item.short);
				if (app.GUI && app.GUI.GUI_information) {
					app.GUI.GUI_information.update_units();
				}
				this.render_ruler();
				if (menu.parentNode) menu.parentNode.removeChild(menu);
			});

			menu.appendChild(row);
		});

		document.body.appendChild(menu);

		const closeMenu = (ev) => {
			if (!menu.contains(ev.target)) {
				if (menu.parentNode) menu.parentNode.removeChild(menu);
				window.removeEventListener('mousedown', closeMenu);
				window.removeEventListener('keydown', onKeyDown);
			}
		};
		const onKeyDown = (ev) => {
			if (ev.key === 'Escape') {
				if (menu.parentNode) menu.parentNode.removeChild(menu);
				window.removeEventListener('mousedown', closeMenu);
				window.removeEventListener('keydown', onKeyDown);
			}
		};

		setTimeout(() => {
			window.addEventListener('mousedown', closeMenu);
			window.addEventListener('keydown', onKeyDown);
		}, 10);
	}

	start_guide_drag(type, startEvent, existing_index = null) {
		startEvent.preventDefault();
		var is_vertical = type === 'vertical';
		var cursor = existing_index !== null
			? (is_vertical ? 'col-resize' : 'row-resize')
			: (is_vertical ? 'ew-resize' : 'ns-resize');
		document.body.style.cursor = cursor;

		var onMouseMove = (e) => {
			var mouse_x = e.pageX - this.GUI.canvas_offset.x;
			var mouse_y = e.pageY - this.GUI.canvas_offset.y;
			var world_pt = zoomView.toWorld(mouse_x, mouse_y);

			var val = is_vertical ? world_pt.x : world_pt.y;
			if (e.shiftKey) {
				val = Math.round(val / 5) * 5;
			} else {
				val = Math.round(val);
			}

			var active_guide = is_vertical
				? { x: val, y: null, index: existing_index }
				: { x: null, y: val, index: existing_index };

			this.GUI.draw_guides(active_guide);
		};

		var onMouseUp = (e) => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			document.body.style.cursor = '';

			var ruler_top = document.getElementById('ruler_top');
			var ruler_left = document.getElementById('ruler_left');
			var top_rect = ruler_top ? ruler_top.getBoundingClientRect() : { bottom: 48 };
			var left_rect = ruler_left ? ruler_left.getBoundingClientRect() : { right: 20 };

			var mouse_x = e.pageX - this.GUI.canvas_offset.x;
			var mouse_y = e.pageY - this.GUI.canvas_offset.y;
			var world_pt = zoomView.toWorld(mouse_x, mouse_y);

			var val = is_vertical ? world_pt.x : world_pt.y;
			if (e.shiftKey) {
				val = Math.round(val / 5) * 5;
			} else {
				val = Math.round(val);
			}

			var droppedOnRuler = is_vertical
				? (e.pageX <= left_rect.right)
				: (e.pageY <= top_rect.bottom);

			if (existing_index !== null) {
				if (droppedOnRuler) {
					// Delete existing guide
					config.guides.splice(existing_index, 1);
				} else {
					// Update existing guide
					if (is_vertical) {
						config.guides[existing_index].x = val;
						config.guides[existing_index].y = null;
					} else {
						config.guides[existing_index].x = null;
						config.guides[existing_index].y = val;
					}
				}
			} else {
				if (!droppedOnRuler) {
					// Add new guide
					if (!Array.isArray(config.guides)) {
						config.guides = [];
					}
					config.guides.push(is_vertical ? { x: val, y: null } : { x: null, y: val });
					config.guides_enabled = true;
				}
			}

			this.GUI.draw_guides();
			config.need_render = true;
		};

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	ruler() {
		var ruler_left = document.getElementById('ruler_left');
		var ruler_top = document.getElementById('ruler_top');

		if (config.ruler_active == false) {
			//activate
			config.ruler_active = true;
			document.getElementById('middle_area').classList.add('has-ruler');
			ruler_left.style.display = 'block';
			ruler_top.style.display = 'block';

			this.prepare_ruler();
			this.render_ruler();
		} else {
			//deactivate
			config.ruler_active = false;
			document.getElementById('middle_area').classList.remove('has-ruler');
			ruler_left.style.display = 'none';
			ruler_top.style.display = 'none';
		}

		this.GUI.prepare_canvas();
		config.need_render = true;
	}

	prepare_ruler() {
		if (config.ruler_active == false)
			return;

		var ruler_left = document.getElementById('ruler_left');
		var ruler_top = document.getElementById('ruler_top');
		var middle_area = document.getElementById('middle_area');

		if (!middle_area || !ruler_left || !ruler_top) return;

		var middle_area_width = middle_area.clientWidth;
		var middle_area_height = middle_area.clientHeight;

		ruler_left.width = 15;
		ruler_left.height = Math.max(10, middle_area_height - 20);

		ruler_top.width = Math.max(10, middle_area_width - 20);
		ruler_top.height = 15;
	}

	calculate_step(unit, pixelsPerUnit, zoom) {
		const screenPxPerUnit = pixelsPerUnit * zoom;
		const targetScreenSpacing = 70; // target px between major labels

		if (unit === 'inches') {
			const targetUnits = targetScreenSpacing / screenPxPerUnit;
			if (targetUnits >= 1) {
				const stepMultipliers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
				for (const s of stepMultipliers) {
					if (s * screenPxPerUnit >= 45) {
						return { majorStep: s, subdivisions: s === 1 ? 8 : (s === 2 ? 4 : 5) };
					}
				}
				return { majorStep: 1000, subdivisions: 5 };
			} else {
				const fractions = [1, 1/2, 1/4, 1/8, 1/16];
				for (let i = fractions.length - 1; i >= 0; i--) {
					if (fractions[i] * screenPxPerUnit >= 40) {
						return { majorStep: fractions[i], subdivisions: 2 };
					}
				}
				return { majorStep: 1/16, subdivisions: 1 };
			}
		}

		// Decimal units: pixels, centimeters, millimeters
		const targetUnits = targetScreenSpacing / screenPxPerUnit;
		const power = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, targetUnits))));
		const normalized = targetUnits / power;

		let stepMultiplier = 1;
		let subdivisions = 10;

		if (normalized <= 1) {
			stepMultiplier = 1;
			subdivisions = 10;
		} else if (normalized <= 2) {
			stepMultiplier = 2;
			subdivisions = 4;
		} else if (normalized <= 5) {
			stepMultiplier = 5;
			subdivisions = 5;
		} else {
			stepMultiplier = 10;
			subdivisions = 10;
		}

		const majorStep = stepMultiplier * power;
		return { majorStep, subdivisions };
	}

	format_label(val, unit, majorStep) {
		if (Math.abs(val) < 1e-9) return '0';
		if (unit === 'inches') {
			if (majorStep >= 1) {
				return String(Math.round(val));
			}
			// Fractional inch formatting
			if (Math.abs(val - 0.5) < 0.01) return '½';
			if (Math.abs(val - 0.25) < 0.01) return '¼';
			if (Math.abs(val - 0.75) < 0.01) return '¾';
			if (Math.abs(val - 0.125) < 0.01) return '⅛';
			if (Math.abs(val - 0.375) < 0.01) return '⅜';
			if (Math.abs(val - 0.625) < 0.01) return '⅝';
			if (Math.abs(val - 0.875) < 0.01) return '⅞';
			return (Math.round(val * 100) / 100).toString();
		}
		if (majorStep < 1) {
			return (Math.round(val * 100) / 100).toString();
		}
		return String(Math.round(val));
	}

	render_ruler() {
		if (config.ruler_active == false)
			return;

		var ruler_left = document.getElementById('ruler_left');
		var ruler_top = document.getElementById('ruler_top');
		if (!ruler_left || !ruler_top) return;

		const activeDoc = (app.Documents && typeof app.Documents.get_active_document === 'function')
			? app.Documents.get_active_document()
			: null;
		const resolution = (activeDoc && activeDoc.resolution)
			? activeDoc.resolution
			: (config.resolution || this.Tools_settings.get_setting('resolution') || 72);

		var unit = this.Tools_settings.get_setting('default_units') || 'pixels';
		if (!UNIT_MAP[unit]) unit = 'pixels';

		const pixelsPerUnit = UNIT_MAP[unit].toWorldPx(resolution);
		const zoom = config.ZOOM || 1;
		const { majorStep, subdivisions } = this.calculate_step(unit, pixelsPerUnit, zoom);

		var ctx_left = ruler_left.getContext("2d");
		var ctx_top = ruler_top.getContext("2d");

		var strokeColor = '#777777';
		var textColor = '#d0d0d0';
		var size = 15;

		ctx_left.clearRect(0, 0, ruler_left.width, ruler_left.height);
		ctx_top.clearRect(0, 0, ruler_top.width, ruler_top.height);

		// Compute world (0,0) screen offset on rulers
		const offset_x = (this.GUI.canvas_offset ? this.GUI.canvas_offset.x : 0) + (zoomView.matrix ? zoomView.matrix[4] : 0) - ruler_top.offsetLeft;
		const offset_y = (this.GUI.canvas_offset ? this.GUI.canvas_offset.y : 0) + (zoomView.matrix ? zoomView.matrix[5] : 0) - ruler_left.offsetTop;

		const minorStepUnits = majorStep / subdivisions;
		const minorStepScreen = minorStepUnits * pixelsPerUnit * zoom;

		// --- TOP RULER ---
		ctx_top.font = RULER_FONT;
		ctx_top.fillStyle = textColor;
		ctx_top.strokeStyle = strokeColor;
		ctx_top.lineWidth = 1;

		const min_u_x = Math.floor((-offset_x) / (pixelsPerUnit * zoom * majorStep)) * majorStep;
		const max_u_x = Math.ceil((ruler_top.width - offset_x) / (pixelsPerUnit * zoom * majorStep)) * majorStep;

		ctx_top.beginPath();
		for (let u = min_u_x; u <= max_u_x + 1e-6; u += majorStep) {
			const majorScreenX = offset_x + (u * pixelsPerUnit * zoom);
			const roundedX = Math.round(majorScreenX) + 0.5;

			if (roundedX >= 0 && roundedX <= ruler_top.width) {
				// Major tick line (full height)
				ctx_top.moveTo(roundedX, 0);
				ctx_top.lineTo(roundedX, size);

				// Label
				const label = this.format_label(u, unit, majorStep);
				ctx_top.fillText(label, roundedX + 3, 9);
			}

			// Minor & Medium ticks between major ticks
			for (let s = 1; s < subdivisions; s++) {
				const minorScreenX = majorScreenX + (s * minorStepScreen);
				const minorRoundedX = Math.round(minorScreenX) + 0.5;
				if (minorRoundedX >= 0 && minorRoundedX <= ruler_top.width) {
					const isHalf = (subdivisions % 2 === 0 && s === subdivisions / 2);
					const tickY = isHalf ? 6 : 10;
					ctx_top.moveTo(minorRoundedX, tickY);
					ctx_top.lineTo(minorRoundedX, size);
				}
			}
		}
		ctx_top.stroke();

		// --- LEFT RULER ---
		ctx_left.font = RULER_FONT;
		ctx_left.fillStyle = textColor;
		ctx_left.strokeStyle = strokeColor;
		ctx_left.lineWidth = 1;

		const min_u_y = Math.floor((-offset_y) / (pixelsPerUnit * zoom * majorStep)) * majorStep;
		const max_u_y = Math.ceil((ruler_left.height - offset_y) / (pixelsPerUnit * zoom * majorStep)) * majorStep;

		ctx_left.beginPath();
		for (let u = min_u_y; u <= max_u_y + 1e-6; u += majorStep) {
			const majorScreenY = offset_y + (u * pixelsPerUnit * zoom);
			const roundedY = Math.round(majorScreenY) + 0.5;

			if (roundedY >= 0 && roundedY <= ruler_left.height) {
				// Major tick line
				ctx_left.moveTo(0, roundedY);
				ctx_left.lineTo(size, roundedY);

				// Rotated label on left ruler
				const label = this.format_label(u, unit, majorStep);
				ctx_left.save();
				ctx_left.translate(10, roundedY - 2);
				ctx_left.rotate(-Math.PI / 2);
				ctx_left.fillText(label, 0, 0);
				ctx_left.restore();
			}

			// Minor & Medium ticks
			for (let s = 1; s < subdivisions; s++) {
				const minorScreenY = majorScreenY + (s * minorStepScreen);
				const minorRoundedY = Math.round(minorScreenY) + 0.5;
				if (minorRoundedY >= 0 && minorRoundedY <= ruler_left.height) {
					const isHalf = (subdivisions % 2 === 0 && s === subdivisions / 2);
					const tickX = isHalf ? 6 : 10;
					ctx_left.moveTo(tickX, minorRoundedY);
					ctx_left.lineTo(size, minorRoundedY);
				}
			}
		}
		ctx_left.stroke();
	}

}

export default View_ruler_class;

