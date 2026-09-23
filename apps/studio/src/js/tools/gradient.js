import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import Mask_class from './../modules/mask/mask.js';
import { ensure_paint_layer } from './../libs/paint-target.js';

/**
 * Gradient tool — paints Linear / Radial onto the active raster layer
 * (Photoshop Gradient-tool model), not a new containing rect layer.
 * Click-drag sets the vector with live layer preview + on-canvas stop markers.
 * Selection clips via constrain_edit_to_selection; mask mode uses Mask.gradient_*.
 */
class Gradient_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Mask = new Mask_class();
		this.ctx = ctx;
		this.name = 'gradient';
		this.mouse_click = { x: null, y: null };
		this.started = false;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.baseCanvas = null;
		this.selection_snapshot = null;
		this._preview_line = null;
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	on_activate() {
		this.sync_colors_from_fg_bg({ rebuild: false });
		this.sync_options_from_layer(config.layer, { rebuild: true });
	}

	ensure_raster_layer() {
		return ensure_paint_layer({ verb: 'paint', toolName: 'Gradient' });
	}

	/**
	 * Options bar drives the next paint (and FG/BG sync). No longer updates a
	 * dedicated gradient vector layer — paint-on-layer model.
	 */
	on_params_update(data = {}) {
		if (data && (data.key === 'color_1' || data.key === 'color_2')) {
			this.sync_fg_bg_from_colors();
		}
		if (data && data.key === 'style' && app.GUI && app.GUI.GUI_tools) {
			app.GUI.GUI_tools.show_action_attributes();
		}
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
	}

	sync_fg_bg_from_colors() {
		const params = this.getParams();
		const c1 = this._attr_color(params.color_1, config.COLOR || '#000000');
		const c2 = this._attr_color(params.color_2, config.COLOR_BG || '#ffffff');
		// Do not push "none" into FG/BG (would snap other tools to black/white)
		if (!this._is_none_color(c1)) {
			config.COLOR = c1;
		}
		if (!this._is_none_color(c2)) {
			config.COLOR_BG = c2;
		}
		if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_toolbar_swatches === 'function') {
			app.GUI.GUI_tools.update_toolbar_swatches();
		}
		if (app.GUI && app.GUI.GUI_colors && typeof app.GUI.GUI_colors.render_selected_color === 'function') {
			app.GUI.GUI_colors.render_selected_color();
		}
	}

	/**
	 * Legacy: selecting an old type:'gradient' layer still rebinds the options bar.
	 * New paints do not create gradient layers, so this is usually a no-op.
	 */
	sync_options_from_layer(layer, options = {}) {
		if (!layer || layer.type !== 'gradient') {
			return false;
		}

		const tool = this._tool_config();
		if (!tool || !tool.attributes) return false;

		const p = layer.params || {};
		const radial = this._is_radial(p);
		tool.attributes.style = tool.attributes.style || { title: 'Style', value: 'Linear', values: ['Linear', 'Radial'] };
		tool.attributes.style.value = radial ? 'Radial' : 'Linear';
		tool.attributes.color_1 = this._is_none_color(p.color_1) ? 'none' : (p.color_1 || config.COLOR || '#000000');
		tool.attributes.color_2 = this._is_none_color(p.color_2) ? 'none' : (p.color_2 || config.COLOR_BG || '#ffffff');

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

		if (options.rebuild !== false && app.GUI && app.GUI.GUI_tools
			&& config.TOOL && config.TOOL.name === this.name) {
			app.GUI.GUI_tools.show_action_attributes();
		}
		return true;
	}

	get_layer_local_coords(world_x, world_y, layer) {
		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;
		var lw = (layer.width != null && layer.width > 0) ? layer.width : (config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (config.HEIGHT || 1);
		var lwo = layer.width_original || lw;
		var lho = layer.height_original || lh;
		var rot = layer.rotate || 0;

		var px = world_x;
		var py = world_y;

		if (rot !== 0) {
			var rad = -rot * Math.PI / 180;
			var cx = lx + lw / 2;
			var cy = ly + lh / 2;
			var cos = Math.cos(rad);
			var sin = Math.sin(rad);
			px = cx + (world_x - cx) * cos - (world_y - cy) * sin;
			py = cy + (world_x - cx) * sin + (world_y - cy) * cos;
		}

		return {
			x: ((px - lx) / lw) * lwo,
			y: ((py - ly) / lh) * lho,
		};
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.Mask.gradient_start(this, e);
			const click = this._constrain_point(e, mouse.x, mouse.y, mouse.x, mouse.y);
			this.mouse_click = { x: click.x, y: click.y };
			this.started = true;
			this._update_preview_line(e, mouse);
			return;
		}

		const layer = this.ensure_raster_layer();
		if (!layer || layer.type !== 'image') {
			return;
		}

		const click = this._constrain_point(e, mouse.x, mouse.y, mouse.x, mouse.y);
		this.mouse_click = { x: click.x, y: click.y };
		this.started = true;

		var lw = layer.width_original || layer.width || config.WIDTH;
		var lh = layer.height_original || layer.height || config.HEIGHT;

		this.baseCanvas = document.createElement('canvas');
		this.baseCanvas.width = lw;
		this.baseCanvas.height = lh;
		var baseCtx = this.baseCanvas.getContext('2d');

		var src = layer.link_canvas || layer.link;
		if (src) {
			if (typeof src.complete === 'boolean') {
				if (src.complete && src.naturalWidth > 0) {
					baseCtx.drawImage(src, 0, 0, lw, lh);
				}
			} else if (src.width > 0 && src.height > 0) {
				baseCtx.drawImage(src, 0, 0, lw, lh);
			}
		}

		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvas.width = lw;
		this.tmpCanvas.height = lh;
		this.tmpCanvasCtx = this.tmpCanvas.getContext('2d');
		this.tmpCanvasCtx.drawImage(this.baseCanvas, 0, 0);

		this.selection_snapshot = this.copy_layer_snapshot();
		if (this.selection_snapshot == null) {
			this.selection_snapshot = document.createElement('canvas');
			this.selection_snapshot.width = lw;
			this.selection_snapshot.height = lh;
			this.selection_snapshot.getContext('2d').drawImage(this.baseCanvas, 0, 0);
		}

		config.layer._link_apply_gen = (config.layer._link_apply_gen || 0) + 1;
		config.layer.link_canvas = this.tmpCanvas;

		this._update_preview_line(e, mouse);
		this.Base_layers.render();
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false)
			return;
		if (!this.started)
			return;

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.Mask.gradient_move(this, e);
			this._update_preview_line(e, mouse);
			this.Base_layers.render();
			return;
		}

		if (!this.tmpCanvas || !this.baseCanvas || !config.layer || config.layer.type !== 'image')
			return;

		this._paint_gradient_preview(e, mouse);
		this._update_preview_line(e, mouse);
		config.layer.link_canvas = this.tmpCanvas;
		if (typeof this.Base_layers.render_interactive_layer === 'function') {
			this.Base_layers.render_interactive_layer(config.layer.id);
		}
		this.Base_layers.render();
	}

	async mouseup(e) {
		var mouse = this.get_mouse_info(e);
		if (!this.started) {
			return;
		}

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			await this.Mask.gradient_end(this, e);
			this._clear_session({ keep_link: false });
			return;
		}

		// Base_tools set_mouse_info() clears click_valid on pointerup *before*
		// tools see mouseup. Paint was already validated on mousedown via
		// this.started — do not abort (that left preview discarded / no undo).
		const geom = this._geometry_from_drag(e, mouse);
		if (geom.empty) {
			this._abort_paint();
			return;
		}

		const layer = config.layer;
		const canvas = this.tmpCanvas;
		if (canvas && layer && layer.type === 'image') {
			this._paint_gradient_preview(e, mouse);
			const layer_id = layer.id;
			// Drop interactive refs before await; keep link_canvas bridge until
			// Update_layer_image_action clears it on Image.onload (same as brush).
			this.tmpCanvas = null;
			this.tmpCanvasCtx = null;
			this._clear_session({ keep_link: true });
			try {
				await app.State.do_action(
					new app.Actions.Bundle_action('gradient_tool', 'Gradient Tool', [
						new app.Actions.Update_layer_image_action(canvas, layer_id)
					])
				);
			} catch (err) {
				if (layer.link_canvas === canvas) {
					delete layer.link_canvas;
				}
				throw err;
			}
			this.Base_layers.render();
			return;
		}

		this._abort_paint();
	}

	/**
	 * On-canvas drag annotator: guide line + colored stop markers.
	 */
	render_overlay(ctx) {
		const line = this._preview_line;
		if (!line || !this.started)
			return;

		const x1 = line.x1;
		const y1 = line.y1;
		const x2 = line.x2;
		const y2 = line.y2;
		const dx = x2 - x1;
		const dy = y2 - y1;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 0.5)
			return;

		ctx.save();
		ctx.lineWidth = 1;
		ctx.setLineDash([]);

		ctx.strokeStyle = 'rgba(0,0,0,0.55)';
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.beginPath();
		ctx.moveTo(x1 + 0.5, y1 + 0.5);
		ctx.lineTo(x2 + 0.5, y2 + 0.5);
		ctx.stroke();

		const stops = line.stops || [];
		const r = 6;
		for (let i = 0; i < stops.length; i++) {
			const s = stops[i];
			const t = Math.max(0, Math.min(1, s.offset));
			const sx = x1 + dx * t;
			const sy = y1 + dy * t;

			ctx.beginPath();
			ctx.arc(sx, sy, r, 0, Math.PI * 2);
			ctx.fillStyle = this._rgba_string(s.color, s.alpha != null ? s.alpha : 1);
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = 'rgba(0,0,0,0.75)';
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.strokeStyle = 'rgba(255,255,255,0.95)';
			ctx.stroke();
		}

		ctx.restore();
	}

	/**
	 * Legacy render for type:'gradient' layers still present in older documents.
	 */
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
	// paint / preview helpers
	// -------------------------------------------------------------------------

	_paint_gradient_preview(e, mouse) {
		const layer = config.layer;
		if (!layer || !this.tmpCanvasCtx || !this.baseCanvas)
			return;

		const geom = this._geometry_from_drag(e, mouse);
		const params = this._normalized_params();
		const stops = this._color_stops(params);

		const p1 = this.get_layer_local_coords(geom.data.x1, geom.data.y1, layer);
		const p2 = this.get_layer_local_coords(geom.data.x2, geom.data.y2, layer);
		const center = this.get_layer_local_coords(geom.data.center_x, geom.data.center_y, layer);

		const ctx = this.tmpCanvasCtx;
		ctx.clearRect(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);
		ctx.drawImage(this.baseCanvas, 0, 0);

		let gradient;
		if (params.radial) {
			const dist_x = p2.x - center.x;
			const dist_y = p2.y - center.y;
			const distance = Math.max(1, Math.sqrt(dist_x * dist_x + dist_y * dist_y));
			let power = this._number_value(params.radial_power, 50);
			if (power > 99) power = 99;
			if (power < 0) power = 0;
			gradient = ctx.createRadialGradient(
				center.x, center.y, distance * power / 100,
				center.x, center.y, distance
			);
		}
		else {
			gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
		}

		gradient.addColorStop(0, stops.start);
		gradient.addColorStop(1, stops.end);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);

		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);
	}

	_update_preview_line(e, mouse) {
		const geom = this._geometry_from_drag(e, mouse);
		const params = this._normalized_params();
		this._preview_line = {
			x1: geom.data.x1,
			y1: geom.data.y1,
			x2: geom.data.x2,
			y2: geom.data.y2,
			radial: !!params.radial,
			stops: this._stop_markers(params),
		};
	}

	_stop_markers(params) {
		let c1 = params.color_1;
		let c2 = params.color_2;
		let a1 = Math.max(0, Math.min(100, this._number_value(params.alpha_1, 100))) / 100;
		let a2 = Math.max(0, Math.min(100, this._number_value(params.alpha_2, 100))) / 100;
		if (this._is_none_color(c1)) { c1 = 'none'; a1 = 0; }
		if (this._is_none_color(c2)) { c2 = 'none'; a2 = 0; }
		if (params.reverse) {
			const tc = c1; c1 = c2; c2 = tc;
			const ta = a1; a1 = a2; a2 = ta;
		}
		return [
			{ offset: 0, color: c1, alpha: a1 },
			{ offset: 1, color: c2, alpha: a2 },
		];
	}

	_abort_paint() {
		if (config.layer && this.tmpCanvas && config.layer.link_canvas === this.tmpCanvas) {
			delete config.layer.link_canvas;
		}
		this._clear_session({ keep_link: false });
		this.Base_layers.render();
	}

	_clear_session(options = {}) {
		this.started = false;
		this._preview_line = null;
		this.selection_snapshot = null;
		if (!options.keep_link && config.layer && this.tmpCanvas
			&& config.layer.link_canvas === this.tmpCanvas) {
			delete config.layer.link_canvas;
		}
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		if (this.baseCanvas) {
			this.baseCanvas.width = 1;
			this.baseCanvas.height = 1;
			this.baseCanvas = null;
		}
		this.mouse_click = { x: null, y: null };
	}

	// -------------------------------------------------------------------------
	// shared param / geometry helpers (Mask.gradient_* depends on these names)
	// -------------------------------------------------------------------------

	_tool_config() {
		return (config.TOOLS || []).find(t => t.name === this.name) || config.TOOL;
	}

	_attr_value(attr, fallback) {
		if (attr == null) return fallback;
		if (typeof attr === 'object' && attr.value != null) return attr.value;
		return attr;
	}

	_is_none_color(v) {
		if (v == null) return false;
		if (v === 'none' || v === 'transparent') return true;
		if (typeof v === 'string' && /^#[0-9A-Fa-f]{8}$/.test(v)
			&& v.slice(7, 9).toLowerCase() === '00') {
			return true;
		}
		return false;
	}

	_attr_color(attr, fallback) {
		const v = this._attr_value(attr, fallback);
		if (this._is_none_color(v)) {
			return 'none';
		}
		if (typeof v === 'string' && v[0] === '#') {
			// Prefer opaque #RRGGBB; strip alpha channel if present (alpha lives on alpha_1/2)
			return v.length >= 7 ? v.slice(0, 7) : v;
		}
		// Missing/invalid: keep fallback, but never invent a color when attr was explicitly empty
		if (v === '' || v === false) {
			return 'none';
		}
		return fallback;
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
			color_1: this._is_none_color(params.color_1) ? 'none' : (params.color_1 || '#000000'),
			color_2: this._is_none_color(params.color_2) ? 'none' : (params.color_2 || '#ffffff'),
			alpha_1: this._opacity_value(params, 'alpha_1', 100),
			alpha_2: this._opacity_value(params, 'alpha_2', 100),
			reverse: !!params.reverse,
			radial_power: this._number_value(params.radial_power, 50),
		};
	}

	_color_stops(params) {
		let c1 = params.color_1;
		let c2 = params.color_2;
		let a1 = Math.max(0, Math.min(100, this._number_value(params.alpha_1, 100))) / 100;
		let a2 = Math.max(0, Math.min(100, this._number_value(params.alpha_2, 100))) / 100;
		// Explicit "no color" → fully transparent stop (do not snap to opaque black/white)
		if (this._is_none_color(c1)) { c1 = 'none'; a1 = 0; }
		if (this._is_none_color(c2)) { c2 = 'none'; a2 = 0; }
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
		if (this._is_none_color(hex) || alpha <= 0) {
			return 'rgba(0, 0, 0, 0)';
		}
		const rgb = this.Helper.hexToRgb(hex || '#000000');
		return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
	}

	/**
	 * Shift → snap angle to 45°. Alt → expand from center (linear).
	 * Kept name `_constrain_point` for Mask.gradient_* compatibility.
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
			center_x = click_x;
			center_y = click_y;
			x1 = click_x;
			y1 = click_y;
		}
		else if (isAlt) {
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
