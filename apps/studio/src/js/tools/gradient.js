import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import Mask_class from './../modules/mask/mask.js';

/**
 * Gradient tool — editable gradient layers (Linear / Radial).
 * Click-drag sets angle + scale with live preview. Selection clips via mask.
 * Mask mode paints B/W or FG→transparent with live preview (no white wipe).
 */
class Gradient_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Mask = new Mask_class();
		this.ctx = ctx;
		this.name = 'gradient';
		this.layer = {};
		this.mouse_click = { x: null, y: null };
		this._editing_layer_id = null;
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	on_activate() {
		this.sync_colors_from_fg_bg({ rebuild: false });
		this.sync_options_from_layer(config.layer, { rebuild: true });
	}

	/**
	 * Options bar → layer params (undoable) when a gradient layer is selected.
	 */
	on_params_update(data = {}) {
		if (data && (data.key === 'color_1' || data.key === 'color_2')) {
			this.sync_fg_bg_from_colors();
		}
		if (data && data.key === 'style' && app.GUI && app.GUI.GUI_tools) {
			app.GUI.GUI_tools.show_action_attributes();
		}

		const layer = this._target_gradient_layer();
		if (!layer) {
			return;
		}

		const next_params = this._params_snapshot_for_layer();
		if (this._params_equal(layer.params, next_params)) {
			return;
		}

		app.State.do_action(
			new app.Actions.Update_layer_action(layer.id, {
				params: next_params,
				name: this._layer_name_for_params(next_params, layer),
				is_vector: true,
			})
		);
		this.Base_layers.render();
	}

	/**
	 * Keep Color 1/2 in sync with toolbar FG/BG (X / D).
	 */
	sync_colors_from_fg_bg(options = {}) {
		const tool = this._tool_config();
		if (!tool || !tool.attributes) return;

		const fg = config.COLOR || '#000000';
		const bg = config.COLOR_BG || '#ffffff';
		tool.attributes.color_1 = fg;
		tool.attributes.color_2 = bg;

		if (options.rebuild !== false && app.GUI && app.GUI.GUI_tools
			&& config.TOOL && config.TOOL.name === this.name) {
			app.GUI.GUI_tools.show_action_attributes();
		}

		const layer = this._target_gradient_layer();
		if (options.apply_to_layer && layer) {
			const next_params = this._params_snapshot_for_layer();
			if (!this._params_equal(layer.params, next_params)) {
				app.State.do_action(
					new app.Actions.Update_layer_action(layer.id, { params: next_params })
				);
				this.Base_layers.render();
			}
		}
	}

	sync_fg_bg_from_colors() {
		const params = this.getParams();
		const c1 = this._attr_color(params.color_1, config.COLOR || '#000000');
		const c2 = this._attr_color(params.color_2, config.COLOR_BG || '#ffffff');
		config.COLOR = c1;
		config.COLOR_BG = c2;
		if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_toolbar_swatches === 'function') {
			app.GUI.GUI_tools.update_toolbar_swatches();
		}
		if (app.GUI && app.GUI.GUI_colors && typeof app.GUI.GUI_colors.render_selected_color === 'function') {
			app.GUI.GUI_colors.render_selected_color();
		}
	}

	/**
	 * Selecting a gradient layer rebinds the options bar to its params.
	 */
	sync_options_from_layer(layer, options = {}) {
		if (!layer || layer.type !== 'gradient') {
			this._editing_layer_id = null;
			return false;
		}

		const tool = this._tool_config();
		if (!tool || !tool.attributes) return false;

		const p = layer.params || {};
		const radial = this._is_radial(p);
		tool.attributes.style = tool.attributes.style || { title: 'Style', value: 'Linear', values: ['Linear', 'Radial'] };
		tool.attributes.style.value = radial ? 'Radial' : 'Linear';
		tool.attributes.color_1 = p.color_1 || config.COLOR || '#000000';
		tool.attributes.color_2 = p.color_2 || config.COLOR_BG || '#ffffff';

		if (tool.attributes.alpha_1 && typeof tool.attributes.alpha_1 === 'object') {
			tool.attributes.alpha_1.value = this._opacity_value(p, 'alpha_1', 100);
		}
		if (tool.attributes.alpha_2 && typeof tool.attributes.alpha_2 === 'object') {
			tool.attributes.alpha_2.value = this._opacity_value(p, 'alpha_2', 100);
		}
		if (typeof tool.attributes.reverse === 'object') {
			tool.attributes.reverse.value = !!p.reverse;
		} else {
			tool.attributes.reverse = !!p.reverse;
		}
		if (tool.attributes.radial_power && typeof tool.attributes.radial_power === 'object') {
			tool.attributes.radial_power.value = this._number_value(p.radial_power, 50);
		}

		this._editing_layer_id = layer.id;

		if (options.rebuild !== false && app.GUI && app.GUI.GUI_tools
			&& config.TOOL && config.TOOL.name === this.name) {
			app.GUI.GUI_tools.show_action_attributes();
		}
		return true;
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.Mask.gradient_start(this, e);
			return;
		}

		const click = this._constrain_point(e, mouse.x, mouse.y, mouse.x, mouse.y);
		this.mouse_click = { x: click.x, y: click.y };

		const params = this._normalized_params();
		const name = params.radial ? 'Radial gradient' : 'gradient';

		// New editable gradient layer (draft) — live preview while dragging
		this.layer = {
			type: this.name,
			name: this.Helper.ucfirst(name) + ' #' + this.Base_layers.auto_increment,
			params: this.clone(params),
			status: 'draft',
			render_function: [this.name, 'render'],
			x: click.x,
			y: click.y,
			width: 0,
			height: 0,
			rotate: null,
			is_vector: true,
			color: null,
			mask: this.selection_clip_mask(),
			data: {
				x1: click.x,
				y1: click.y,
				x2: click.x,
				y2: click.y,
				center_x: click.x,
				center_y: click.y,
			},
		};
		app.State.do_action(
			new app.Actions.Bundle_action('new_gradient_layer', 'New Gradient Layer', [
				new app.Actions.Insert_layer_action(this.layer)
			])
		);
		this._editing_layer_id = config.layer ? config.layer.id : null;
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false)
			return;

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.Mask.gradient_move(this, e);
			return;
		}

		if (!config.layer || config.layer.type !== 'gradient')
			return;

		const geom = this._geometry_from_drag(e, mouse);
		config.layer.x = geom.x;
		config.layer.y = geom.y;
		config.layer.width = geom.width;
		config.layer.height = geom.height;
		config.layer.data = geom.data;
		config.layer.params = this.clone(this._normalized_params());

		this.Base_layers.render();
	}

	mouseup(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			if (config.layer) config.layer.status = null;
			return;
		}

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.Mask.gradient_end(this, e);
			return;
		}

		if (!config.layer || config.layer.type !== 'gradient')
			return;

		const geom = this._geometry_from_drag(e, mouse);
		if (geom.empty || (geom.width == 0 && geom.height == 0)) {
			app.State.scrap_last_action();
			return;
		}

		const params = this.clone(this._normalized_params());
		app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, {
				x: geom.x,
				y: geom.y,
				width: geom.width,
				height: geom.height,
				data: geom.data,
				params: params,
				status: null,
				is_vector: true,
				name: this._layer_name_for_params(params, config.layer),
			}),
			{ merge_with_history: 'new_gradient_layer' }
		);

		this._editing_layer_id = config.layer.id;
		this.Base_layers.render();
	}

	render(ctx, layer) {
		if (layer.width == 0 && layer.height == 0)
			return;

		const params = this._normalize_stored_params(layer.params || {});
		const stops = this._color_stops(params);
		const data = layer.data || {};

		let x1 = data.x1 != null ? data.x1 : layer.x;
		let y1 = data.y1 != null ? data.y1 : layer.y;
		let x2 = data.x2 != null ? data.x2 : (layer.x + layer.width);
		let y2 = data.y2 != null ? data.y2 : (layer.y + layer.height);

		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, config.WIDTH, config.HEIGHT);
		ctx.clip();

		if (!params.radial) {
			const grd = ctx.createLinearGradient(x1, y1, x2, y2);
			grd.addColorStop(0, stops.start);
			grd.addColorStop(1, stops.end);
			ctx.fillStyle = grd;
			ctx.fillRect(0, 0, config.WIDTH, config.HEIGHT);
		}
		else {
			const center_x = data.center_x != null ? data.center_x : (layer.x + layer.width / 2);
			const center_y = data.center_y != null ? data.center_y : (layer.y + layer.height / 2);
			const dist_x = x2 - center_x;
			const dist_y = y2 - center_y;
			const distance = Math.max(1, Math.sqrt(dist_x * dist_x + dist_y * dist_y));
			let power = this._number_value(params.radial_power, 50);
			if (power > 99) power = 99;
			if (power < 0) power = 0;

			const radgrad = ctx.createRadialGradient(
				center_x, center_y, distance * power / 100,
				center_x, center_y, distance
			);
			radgrad.addColorStop(0, stops.start);
			radgrad.addColorStop(1, stops.end);
			ctx.fillStyle = radgrad;
			ctx.fillRect(0, 0, config.WIDTH, config.HEIGHT);
		}
		ctx.restore();
	}

	// -------------------------------------------------------------------------
	// helpers
	// -------------------------------------------------------------------------

	_tool_config() {
		return (config.TOOLS || []).find(t => t.name === this.name) || config.TOOL;
	}

	_target_gradient_layer() {
		if (config.layer && config.layer.type === 'gradient') {
			return config.layer;
		}
		if (this._editing_layer_id != null) {
			return this.Base_layers.get_layer(this._editing_layer_id);
		}
		return null;
	}

	_attr_value(attr, fallback) {
		if (attr == null) return fallback;
		if (typeof attr === 'object' && attr.value != null) return attr.value;
		return attr;
	}

	_attr_color(attr, fallback) {
		const v = this._attr_value(attr, fallback);
		return (typeof v === 'string' && v[0] === '#') ? v : fallback;
	}

	_number_value(val, fallback) {
		if (val == null) return fallback;
		if (typeof val === 'object' && val.value != null) {
			const n = Number(val.value);
			return Number.isFinite(n) ? n : fallback;
		}
		const n = Number(val);
		return Number.isFinite(n) ? n : fallback;
	}

	_opacity_value(params, key, fallback) {
		if (params && params[key] != null) {
			return this._number_value(params[key], fallback);
		}
		// Legacy single `alpha` applied only to color_2
		if (key === 'alpha_2' && params && params.alpha != null) {
			return this._number_value(params.alpha, fallback);
		}
		return fallback;
	}

	_is_radial(params) {
		if (!params) return false;
		if (params.radial === true) return true;
		const style = this._attr_value(params.style, null);
		if (style != null && String(style).toLowerCase() === 'radial') return true;
		return false;
	}

	_normalized_params() {
		const raw = this.getParams();
		const style_val = this._attr_value(raw.style, 'Linear');
		const radial = String(style_val).toLowerCase() === 'radial' || raw.radial === true;
		return {
			style: radial ? 'Radial' : 'Linear',
			radial: radial,
			color_1: this._attr_color(raw.color_1, config.COLOR || '#000000'),
			color_2: this._attr_color(raw.color_2, config.COLOR_BG || '#ffffff'),
			alpha_1: this._number_value(raw.alpha_1, 100),
			alpha_2: this._number_value(raw.alpha_2, 100),
			reverse: !!this._attr_value(raw.reverse, false),
			radial_power: this._number_value(raw.radial_power, 50),
		};
	}

	_normalize_stored_params(params) {
		const radial = this._is_radial(params);
		return {
			style: radial ? 'Radial' : 'Linear',
			radial: radial,
			color_1: params.color_1 || '#000000',
			color_2: params.color_2 || '#ffffff',
			alpha_1: this._opacity_value(params, 'alpha_1', 100),
			alpha_2: this._opacity_value(params, 'alpha_2', 100),
			reverse: !!params.reverse,
			radial_power: this._number_value(params.radial_power, 50),
		};
	}

	_params_snapshot_for_layer() {
		return this.clone(this._normalized_params());
	}

	_params_equal(a, b) {
		try {
			return JSON.stringify(this._normalize_stored_params(a || {}))
				=== JSON.stringify(this._normalize_stored_params(b || {}));
		} catch (e) {
			return false;
		}
	}

	_layer_name_for_params(params, layer) {
		const radial = this._is_radial(params);
		const base = radial ? 'Radial gradient' : 'Gradient';
		if (layer && typeof layer.name === 'string') {
			const m = layer.name.match(/#\d+\s*$/);
			if (m) return this.Helper.ucfirst(base) + ' ' + m[0].trim();
		}
		return this.Helper.ucfirst(base);
	}

	_color_stops(params) {
		let c1 = params.color_1;
		let c2 = params.color_2;
		let a1 = Math.max(0, Math.min(100, this._number_value(params.alpha_1, 100))) / 100;
		let a2 = Math.max(0, Math.min(100, this._number_value(params.alpha_2, 100))) / 100;
		if (params.reverse) {
			const tc = c1; c1 = c2; c2 = tc;
			const ta = a1; a1 = a2; a2 = ta;
		}
		return {
			start: this._rgba_string(c1, a1),
			end: this._rgba_string(c2, a2),
		};
	}

	_rgba_string(hex, alpha) {
		const rgb = this.Helper.hexToRgb(hex || '#000000');
		return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
	}

	/**
	 * Shift → snap angle to 45°. Alt → expand from center (linear).
	 */
	_constrain_point(e, x, y, origin_x, origin_y) {
		let mx = x;
		let my = y;
		if (e && e.shiftKey) {
			const dx = mx - origin_x;
			const dy = my - origin_y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const snap = Math.PI / 4;
			const angle = Math.round(Math.atan2(dy, dx) / snap) * snap;
			mx = Math.round(origin_x + Math.cos(angle) * dist);
			my = Math.round(origin_y + Math.sin(angle) * dist);
		}
		return { x: mx, y: my };
	}

	_geometry_from_drag(e, mouse) {
		const params = this._normalized_params();
		const click_x = this.mouse_click.x;
		const click_y = this.mouse_click.y;
		const constrained = this._constrain_point(e, mouse.x, mouse.y, click_x, click_y);
		let x2 = constrained.x;
		let y2 = constrained.y;
		const isAlt = !!(e && e.altKey);

		let x1 = click_x;
		let y1 = click_y;
		let center_x = click_x;
		let center_y = click_y;

		if (params.radial) {
			// Start = center; drag = radius endpoint.
			center_x = click_x;
			center_y = click_y;
			x1 = click_x;
			y1 = click_y;
		}
		else if (isAlt) {
			// From-center: click is midpoint of the gradient vector
			const dx = x2 - click_x;
			const dy = y2 - click_y;
			x1 = click_x - dx;
			y1 = click_y - dy;
			center_x = click_x;
			center_y = click_y;
		}

		let box_x;
		let box_y;
		let box_w;
		let box_h;
		if (params.radial) {
			const radius = Math.sqrt((x2 - center_x) * (x2 - center_x) + (y2 - center_y) * (y2 - center_y));
			box_x = center_x - radius;
			box_y = center_y - radius;
			box_w = radius * 2;
			box_h = radius * 2;
		}
		else {
			box_x = Math.min(x1, x2);
			box_y = Math.min(y1, y2);
			box_w = Math.abs(x2 - x1);
			box_h = Math.abs(y2 - y1);
		}

		return {
			x: box_x,
			y: box_y,
			width: box_w,
			height: box_h,
			empty: (x1 === x2 && y1 === y2),
			data: {
				x1: x1,
				y1: y1,
				x2: x2,
				y2: y2,
				center_x: center_x,
				center_y: center_y,
			},
		};
	}
}

export default Gradient_class;
