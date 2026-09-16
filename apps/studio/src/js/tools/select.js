import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Base_selection_class from './../core/base-selection.js';
import Helper_class from './../libs/helpers.js';
import Mask_class from './../modules/mask/mask.js';
import Dialog_class from './../libs/popup.js';
import { is_box_text, is_point_text } from './text.js';
import { is_group, get_descendant_ids, get_ancestors } from './../libs/layer-tree.js';
import { get_layer_content_bounds, get_selection_content_bounds } from './../libs/layer-bounds.js';

class Select_tool_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.POP = new Dialog_class();
		this.Helper = new Helper_class();
		this.Mask = new Mask_class();
		this.ctx = ctx;
		this.name = 'select';
		this.saved = false;
		this.mousedown_dimensions = { x: null, y: null, width: null, height: null };
		this.mousedown_mask_dimensions = null;
		this.mousedown_multi_positions = null;
		this.mousedown_content_bounds = null;
		this.keyboard_move_start_position = null;
		this.keyboard_move_start_positions = null;
		this.moving = false;
		this.resizing = false;
		this.snap_line_info = {x: null, y: null};
		this.rotate_initial = null;

		var sel_config = {
			enable_background: false,
			enable_borders: true,
			enable_controls: true,
			keep_ratio: true,
			enable_rotation: true,
			enable_move: true,
			data_function: () => {
				const isParagraphText = is_box_text(config.layer);
				sel_config.border_style = isParagraphText ? 'dashed_black' : null;
				sel_config.handle_style = isParagraphText ? 'bw_square' : null;
				if (config.mask_active === true && config.layer && config.layer.mask && config.layer.mask.linked === false) {
					return config.layer.mask;
				}
				if (this.resizing && this.Base_selection && this.Base_selection.mouse_lock === 'selected_object_actions') {
					const s = this.Base_selection.find_settings();
					if (s && s.data) {
						return s.data;
					}
				}
				const movable_layers = this.get_movable_layers();
				const bounds = get_selection_content_bounds(movable_layers);
				if (!bounds) {
					return null;
				}
				return {
					...config.layer,
					x: bounds.x,
					y: bounds.y,
					width: bounds.width,
					height: bounds.height,
					rotate: bounds.rotate || (config.layer ? config.layer.rotate : 0)
				};
			},
		};
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
	}

	on_update(settings) {
		if (settings.key === 'show_transform_controls') {
			const sel = this.Base_selection.find_settings();
			sel.enable_borders = settings.value;
			sel.enable_controls = settings.value;
			sel.enable_rotation = settings.value;
			this.Base_layers.render_interactive_layer(config.layer.id);
		}
	}

	async dblclick(e) {
		const textTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text'])
			? app.GUI.GUI_tools.tools_modules['text'].object
			: null;
		if (!textTool) return;
		const targetLayer = textTool.get_text_layer_at_mouse(e) || (config.layer && config.layer.type === 'text' ? config.layer : null);
		if (targetLayer && targetLayer.type === 'text') {
			await app.GUI.GUI_tools.activate_tool('text');
			await textTool.enter_edit_mode(targetLayer, e);
		}
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	keydown(event) {
		var k = event.key;

		if (k == "ArrowUp") {
			this.move(0, -1, event);
		}
		else if (k == "ArrowDown") {
			this.move(0, 1, event);
		}
		else if (k == "ArrowRight") {
			this.move(1, 0, event);
		}
		else if (k == "ArrowLeft") {
			this.move(-1, 0, event);
		}
		if (k == "Delete" || k == "Backspace") {
			event.preventDefault();
			if (app.GUI && app.GUI.modules && app.GUI.modules['layer/delete']) {
				app.GUI.modules['layer/delete'].delete();
			}
		}
	}

	keyup(event) {
		var k = event.key;
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
			if (this.keyboard_move_start_positions && this.keyboard_move_start_positions.size > 0) {
				const movable_layers = this.get_movable_layers();
				let keyboard_actions = [];

				for (const l of movable_layers) {
					const start_pos = this.keyboard_move_start_positions.get(l.id);
					if (!start_pos) continue;

					let x = l.x;
					let y = l.y;
					l.x = start_pos.x;
					l.y = start_pos.y;

					if (l.type === 'vector') {
						const dx = start_pos.x - x;
						const dy = start_pos.y - y;
						const vecId = l.vector_id || (l.params && l.params.vector_id);
						const vec = (config.vectors || []).find(v => v.id === vecId);
						if (vec && typeof vec.translate === 'function') {
							vec.translate(dx, dy);
						}
					}

					if (x !== start_pos.x || y !== start_pos.y) {
						keyboard_actions.push(
							new app.Actions.Update_layer_action(l.id, { x, y })
						);
						keyboard_actions = keyboard_actions.concat(
							this.Mask.get_linked_mask_actions(l,
								{ x: start_pos.x, y: start_pos.y, width: start_pos.width, height: start_pos.height },
								{ x, y, width: start_pos.width, height: start_pos.height })
						);
					}
				}

				if (keyboard_actions.length > 0) {
					app.State.do_action(
						new app.Actions.Bundle_action('move_layers', 'Move Layers', keyboard_actions)
					);
				}
				this.keyboard_move_start_positions = null;
				this.keyboard_move_start_position = null;
			}
		}
	}

	dragStart(event) {
		var mouse = this.get_mouse_info(event);
		if (config.TOOL.name != this.name)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		this.mousedown(event);
	}

	dragMove(event) {
		var mouse = this.get_mouse_info(event);
		if (config.TOOL.name != this.name)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		this.mousemove(event);
	}

	async dragEnd(event) {
		var mouse = this.get_mouse_info(event);
		if (config.TOOL.name != this.name)
			return;
		// Same pointerup click_valid trap as mouseup — allow in-progress resize/move.
		if (mouse.click_valid == false && !this.resizing && !this.moving) {
			return;
		}

		await this.mouseup(event);
		this.Base_layers.render();
	}

	async mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false || config.mouse_lock === true) {
			return;
		}

		this.rotate_initial = config.layer ? config.layer.rotate : null;

		// Hit test selection handles and rotation zone first
		this.Base_selection.selected_object_actions(e);

		if (this.Base_selection.mouse_lock != null) {
			this.resizing = true;
			this.moving = false;
			const aspect_lock = (config.aspect_lock !== undefined) ? config.aspect_lock : true;
			this.Base_selection.find_settings().keep_ratio = aspect_lock;
			this.mousedown_content_bounds = this.Base_selection.click_details
				? { ...this.Base_selection.click_details }
				: null;
			// Point text stays dynamic — transform scales glyphs (Photoshop-like), not convert to box.
			// Box/paragraph: frame-only resize (never bake/scale fonts). Use shared is_box_text.
			if (config.layer && config.layer.type === 'text' && is_point_text(config.layer)) {
				this._resizing_point_text = true;
			} else {
				this._resizing_point_text = false;
			}
		}
		else {
			this.resizing = false;
			this.moving = true;
			await this.auto_select_object(e);
			const movable_layers = this.get_movable_layers();
			if (movable_layers.length === 0) {
				//locked layers can be selected but not moved or resized
				this.moving = false;
				return;
			}
			const aspect_lock = (config.aspect_lock !== undefined) ? config.aspect_lock : true;
			this.Base_selection.find_settings().keep_ratio = aspect_lock;
			this.saved = false;
		}

		if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_transform_indicators === 'function') {
			app.GUI.GUI_tools.update_transform_indicators();
		}

		const movable_layers = this.get_movable_layers();
		this.mousedown_multi_positions = new Map();
		for (const l of movable_layers) {
			this.mousedown_multi_positions.set(l.id, {
				x: Math.round(l.x),
				y: Math.round(l.y),
				width: l.width,
				height: l.height,
				anchor_x: (l.params && l.params.anchor_x != null) ? l.params.anchor_x : null,
				anchor_y: (l.params && l.params.anchor_y != null) ? l.params.anchor_y : null,
				mask: l.mask ? {
					x: l.mask.x,
					y: l.mask.y,
					width: l.mask.width,
					height: l.mask.height,
					linked: l.mask.linked !== false,
				} : null
			});
		}

		this.mousedown_dimensions = (config.layer && config.layer.x != null) ? {
			x: Math.round(config.layer.x),
			y: Math.round(config.layer.y),
			width: config.layer.width,
			height: config.layer.height,
			anchor_x: (config.layer.params && config.layer.params.anchor_x != null) ? config.layer.params.anchor_x : null,
			anchor_y: (config.layer.params && config.layer.params.anchor_y != null) ? config.layer.params.anchor_y : null,
			mask: config.layer.mask ? {
				x: config.layer.mask.x,
				y: config.layer.mask.y,
				width: config.layer.mask.width,
				height: config.layer.mask.height,
				linked: config.layer.mask.linked !== false,
			} : null
		} : { x: 0, y: 0, width: 0, height: 0, anchor_x: null, anchor_y: null, mask: null };

		this.mousedown_mask_dimensions = (config.layer && config.layer.mask) ? {
			x: config.layer.mask.x,
			y: config.layer.mask.y,
			width: config.layer.mask.width,
			height: config.layer.mask.height,
			linked: config.layer.mask.linked !== false,
		} : null;

		// Snapshot fonts after dimensions are frozen for this drag
		if (this._resizing_point_text && config.layer && config.layer.type === 'text') {
			try {
				const textTool = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
					&& app.GUI.GUI_tools.tools_modules['text']
					&& app.GUI.GUI_tools.tools_modules['text'].object;
				if (textTool && typeof textTool.begin_point_text_resize === 'function') {
					textTool.mousedownBounds = {
						x: this.mousedown_dimensions.x,
						y: this.mousedown_dimensions.y,
						width: this.mousedown_dimensions.width,
						height: this.mousedown_dimensions.height,
						boundary: (config.layer.params && config.layer.params.boundary) || 'dynamic'
					};
					textTool.begin_point_text_resize(config.layer);
				}
			} catch (e) { /* ignore */ }
		}

	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false || mouse.click_valid == false || config.mouse_lock === true) {
			return;
		}

		this.Base_selection.selected_object_actions(e);

		if (this.resizing) {

			//also handle rotation
			let rotate = this.Base_selection.current_angle;
			if(config.layer && config.layer.rotate != rotate && rotate !== null){
				config.layer.rotate = rotate;
			}

			if (this.Base_selection.selected_object_drag_type !== 'rotate') {
				const s = this.Base_selection.find_settings();
				if (s && s.data && this.mousedown_content_bounds && this.mousedown_content_bounds.width > 0 && this.mousedown_content_bounds.height > 0) {
					const origW = this.mousedown_content_bounds.width;
					const origH = this.mousedown_content_bounds.height;
					const scale_x = s.data.width / origW;
					const scale_y = s.data.height / origH;

					if (this.mousedown_multi_positions && this.mousedown_multi_positions.size > 0) {
						for (const [layer_id, init_pos] of this.mousedown_multi_positions.entries()) {
							const layer = app.Layers.get_layer(layer_id);
							if (!layer) continue;

							layer.width = Math.round(init_pos.width * scale_x);
							layer.height = Math.round(init_pos.height * scale_y);
							layer.x = Math.round(s.data.x + (init_pos.x - this.mousedown_content_bounds.x) * scale_x);
							layer.y = Math.round(s.data.y + (init_pos.y - this.mousedown_content_bounds.y) * scale_y);

							this.Mask.preview_linked_mask_transform(layer, init_pos, layer);
						}
					}
				}
			}

			// Point text: geometric scale_x/y from drag-start snapshot (do not bake font size)
			if (this._resizing_point_text && config.layer && config.layer.type === 'text') {
				try {
					const textTool = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
						&& app.GUI.GUI_tools.tools_modules['text']
						&& app.GUI.GUI_tools.tools_modules['text'].object;
					if (textTool && typeof textTool.apply_point_text_resize === 'function') {
						textTool.apply_point_text_resize(config.layer, config.layer.width, config.layer.height);
					}
				} catch (e) { /* ignore */ }
			}

			if (this.Base_layers.render_interactive_layer && config.layer) {
				this.Base_layers.render_interactive_layer(config.layer.id);
			}
			this.Base_layers.render();

			return;
		}
		else if (this.moving) {
			if (config.mask_active === true && config.layer && config.layer.mask && config.layer.mask.linked === false && this.mousedown_mask_dimensions) {
				// Move unlinked mask only
				config.layer.mask.x = Math.round(mouse.x - mouse.click_x + this.mousedown_mask_dimensions.x);
				config.layer.mask.y = Math.round(mouse.y - mouse.click_y + this.mousedown_mask_dimensions.y);
				delete config.layer.mask._alpha_canvas;
				delete config.layer.mask._alpha_source;
			} else if (this.mousedown_multi_positions && this.mousedown_multi_positions.size > 0) {
				let raw_delta_x = Math.round(mouse.x - mouse.click_x);
				let raw_delta_y = Math.round(mouse.y - mouse.click_y);

				let delta_x = raw_delta_x;
				let delta_y = raw_delta_y;

				const primary_pos = (config.layer && this.mousedown_multi_positions.has(config.layer.id))
					? this.mousedown_multi_positions.get(config.layer.id)
					: null;

				if (primary_pos && primary_pos.x != null && primary_pos.y != null) {
					const target_x = primary_pos.x + raw_delta_x;
					const target_y = primary_pos.y + raw_delta_y;
					const snap_info = this.calc_snap(e, target_x, target_y);
					if (snap_info != null) {
						if (snap_info.x != null) {
							delta_x = snap_info.x - primary_pos.x;
						}
						if (snap_info.y != null) {
							delta_y = snap_info.y - primary_pos.y;
						}
					}
				}

				for (const [layer_id, init_pos] of this.mousedown_multi_positions.entries()) {
					const layer = app.Layers.get_layer(layer_id);
					if (!layer) continue;

					const prevMoveX = layer.x;
					const prevMoveY = layer.y;
					layer.x = init_pos.x + delta_x;
					layer.y = init_pos.y + delta_y;
					this.Mask.preview_linked_mask_transform(layer, init_pos, layer);

					if (layer.type === 'text' && layer.params && layer.params.boundary === 'dynamic') {
						const dx = layer.x - prevMoveX;
						const dy = layer.y - prevMoveY;
						if (layer.params.anchor_x != null) layer.params.anchor_x += dx;
						if (layer.params.anchor_y != null) layer.params.anchor_y += dy;
					}

					if (layer.type === 'vector') {
						const dx = layer.x - prevMoveX;
						const dy = layer.y - prevMoveY;
						const vecId = layer.vector_id || (layer.params && layer.params.vector_id);
						const vec = (config.vectors || []).find(v => v.id === vecId);
						if (vec && typeof vec.translate === 'function') {
							vec.translate(dx, dy);
						}
					}
				}
			}

			if (this.Base_layers.render_interactive_layer && config.layer) {
				this.Base_layers.render_interactive_layer(config.layer.id);
			}
			this.Base_layers.render();
		}
	}

	async mouseup(e) {
		var mouse = this.get_mouse_info(e);
		// Base_tools set_mouse_info() clears config.mouse.click_valid on pointerup *before*
		// tools see mouseup. An in-progress Move resize/move was already validated on
		// mousedown — must still run commit (point-text bake via commit_point_text_resize).
		const in_progress = this.resizing || this.moving;
		if ((!in_progress && mouse.click_valid == false) || config.mouse_lock === true) {
			return;
		}

		this.Base_selection.selected_object_actions(e);

		if (this.resizing) {
			const resizingPointText = config.layer && config.layer.type === 'text'
				&& !is_box_text(config.layer)
				&& (!!this._resizing_point_text || is_point_text(config.layer));

			// Record final live sizes/positions
			const finalPositions = new Map();
			if (this.mousedown_multi_positions) {
				for (const [layer_id, init_pos] of this.mousedown_multi_positions.entries()) {
					const layer = app.Layers.get_layer(layer_id);
					if (layer) {
						finalPositions.set(layer_id, {
							x: layer.x,
							y: layer.y,
							width: layer.width,
							height: layer.height
						});
					}
				}
			}

			// Reset to mousedown values so Update_layer_action captures correct previous state
			if (this.mousedown_multi_positions) {
				for (const [layer_id, init_pos] of this.mousedown_multi_positions.entries()) {
					const layer = app.Layers.get_layer(layer_id);
					if (layer) {
						layer.x = init_pos.x;
						layer.y = init_pos.y;
						layer.width = init_pos.width;
						layer.height = init_pos.height;
						if (init_pos.mask && layer.mask) {
							Object.assign(layer.mask, init_pos.mask);
						}
					}
				}
			}

			this.resizing = false;
			this._resizing_point_text = false;

			let resize_actions = [];
			if (this.mousedown_multi_positions) {
				for (const [layer_id, init_pos] of this.mousedown_multi_positions.entries()) {
					const finalPos = finalPositions.get(layer_id);
					if (!finalPos) continue;

					if (init_pos.x !== finalPos.x || init_pos.y !== finalPos.y ||
						init_pos.width !== finalPos.width || init_pos.height !== finalPos.height
					) {
						const layer = app.Layers.get_layer(layer_id);
						let layerUpdate = {
							x: finalPos.x,
							y: finalPos.y,
							width: finalPos.width,
							height: finalPos.height
						};

						// Point text: bake font size into history
						if (resizingPointText && layer.id === config.layer?.id && init_pos.width > 0 && !is_box_text(layer)) {
							try {
								const textTool = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
									&& app.GUI.GUI_tools.tools_modules['text']
									&& app.GUI.GUI_tools.tools_modules['text'].object;
								if (textTool && typeof textTool.commit_point_text_resize === 'function') {
									const preData = layer.data ? JSON.parse(JSON.stringify(layer.data)) : null;
									const preParams = layer.params ? JSON.parse(JSON.stringify(layer.params)) : {};
									if (textTool._point_resize_base_scale_x != null) preParams.scale_x = textTool._point_resize_base_scale_x;
									if (textTool._point_resize_base_scale_y != null) preParams.scale_y = textTool._point_resize_base_scale_y;
									layer.x = init_pos.x;
									layer.y = init_pos.y;
									layer.width = init_pos.width;
									layer.height = init_pos.height;
									layer.params = JSON.parse(JSON.stringify(preParams));
									textTool.mousedownBounds = {
										x: init_pos.x,
										y: init_pos.y,
										width: init_pos.width,
										height: init_pos.height,
										boundary: preParams.boundary || 'dynamic'
									};
									const committed = textTool.commit_point_text_resize(layer, finalPos.width, finalPos.height);
									if (committed) {
										layerUpdate.x = committed.x;
										layerUpdate.y = committed.y;
										layerUpdate.width = committed.width;
										layerUpdate.height = committed.height;
										layerUpdate.params = committed.params;
										layerUpdate.data = committed.data;
									}
									layer.x = init_pos.x;
									layer.y = init_pos.y;
									layer.width = init_pos.width;
									layer.height = init_pos.height;
									layer.params = JSON.parse(JSON.stringify(preParams));
									if (preData) {
										layer.data = preData;
										if (typeof textTool.get_editor === 'function') {
											const ed = textTool.get_editor(layer);
											if (ed && ed.set_lines) {
												ed.set_lines(JSON.parse(JSON.stringify(preData)), true);
												ed.hasValueChanged = true;
											}
										}
									}
								}
							} catch (e) { console.warn('point text scale failed', e); }
						}

						resize_actions.push(
							new app.Actions.Update_layer_action(layer.id, layerUpdate)
						);
						resize_actions = resize_actions.concat(
							this.Mask.get_linked_mask_actions(layer, init_pos, layerUpdate)
						);
					}
				}
			}

			if (resize_actions.length > 0) {
				await app.State.do_action(
					new app.Actions.Bundle_action('resize_layer', 'Resize Layer', resize_actions)
				);
				if (resizingPointText && config.layer && config.layer.type === 'text') {
					try {
						const textTool = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
							&& app.GUI.GUI_tools.tools_modules['text']
							&& app.GUI.GUI_tools.tools_modules['text'].object;
						if (textTool && typeof textTool.sync_size_from_layer === 'function') {
							textTool.sync_size_from_layer(config.layer);
						}
					} catch (e) { /* ignore */ }
				}
			} else if (resizingPointText) {
				try {
					const textTool = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
						&& app.GUI.GUI_tools.tools_modules['text']
						&& app.GUI.GUI_tools.tools_modules['text'].object;
					if (textTool && typeof textTool.end_point_text_resize === 'function') {
						textTool.end_point_text_resize();
					}
				} catch (e) { /* ignore */ }
			}

			//also handle rotation
			let rotate = this.Base_selection.current_angle;
			if(this.rotate_initial != rotate && rotate !== null){
				config.layer.rotate = this.rotate_initial;
				await app.State.do_action(
					new app.Actions.Bundle_action('resize_layer', 'Resize Layer', [
						new app.Actions.Update_layer_action(config.layer.id, {
							rotate
						})
					])
				);
			}
			this.resizing = false;
		}
		else if (this.moving) {
			if (config.mask_active === true && config.layer && config.layer.mask && config.layer.mask.linked === false && this.mousedown_mask_dimensions) {
				var new_mask_x = Math.round(mouse.x - mouse.click_x + this.mousedown_mask_dimensions.x);
				var new_mask_y = Math.round(mouse.y - mouse.click_y + this.mousedown_mask_dimensions.y);
				config.layer.mask.x = this.mousedown_mask_dimensions.x;
				config.layer.mask.y = this.mousedown_mask_dimensions.y;

				if (this.mousedown_mask_dimensions.x !== new_mask_x || this.mousedown_mask_dimensions.y !== new_mask_y) {
					await app.State.do_action(
						new app.Actions.Update_layer_mask_action(config.layer.id, {
							x: new_mask_x,
							y: new_mask_y
						})
					);
				}
			} else if (this.mousedown_multi_positions && this.mousedown_multi_positions.size > 0) {
				let raw_delta_x = Math.round(mouse.x - mouse.click_x);
				let raw_delta_y = Math.round(mouse.y - mouse.click_y);

				let delta_x = raw_delta_x;
				let delta_y = raw_delta_y;

				const primary_pos = (config.layer && this.mousedown_multi_positions.has(config.layer.id))
					? this.mousedown_multi_positions.get(config.layer.id)
					: null;

				if (primary_pos && primary_pos.x != null && primary_pos.y != null) {
					const target_x = primary_pos.x + raw_delta_x;
					const target_y = primary_pos.y + raw_delta_y;
					const snap_info = this.calc_snap(e, target_x, target_y);
					if (snap_info != null) {
						if (snap_info.x != null) {
							delta_x = snap_info.x - primary_pos.x;
						}
						if (snap_info.y != null) {
							delta_y = snap_info.y - primary_pos.y;
						}
					}
				}

				for (const [layer_id, init_pos] of this.mousedown_multi_positions.entries()) {
					const layer = app.Layers.get_layer(layer_id);
					if (!layer) continue;

					layer.x = init_pos.x;
					layer.y = init_pos.y;
					if (layer.type === 'text' && layer.params) {
						if (init_pos.anchor_x != null) layer.params.anchor_x = init_pos.anchor_x;
						if (init_pos.anchor_y != null) layer.params.anchor_y = init_pos.anchor_y;
					}
					if (layer.type === 'vector') {
						const vecId = layer.vector_id || (layer.params && layer.params.vector_id);
						const vec = (config.vectors || []).find(v => v.id === vecId);
						if (vec && typeof vec.translate === 'function') {
							vec.translate(-delta_x, -delta_y);
						}
					}
					if (init_pos.mask != null && layer.mask) {
						Object.assign(layer.mask, init_pos.mask);
					}
				}

				if (delta_x !== 0 || delta_y !== 0) {
					let move_actions = [];
					for (const [layer_id, init_pos] of this.mousedown_multi_positions.entries()) {
						const layer = app.Layers.get_layer(layer_id);
						if (!layer) continue;

						const new_x = init_pos.x + delta_x;
						const new_y = init_pos.y + delta_y;

						move_actions.push(
							new app.Actions.Update_layer_action(layer.id, {
								x: new_x,
								y: new_y
							})
						);
						move_actions = move_actions.concat(
							this.Mask.get_linked_mask_actions(layer, init_pos, {
								x: new_x,
								y: new_y,
								width: init_pos.width,
								height: init_pos.height
							})
						);
					}

					if (move_actions.length > 0) {
						await app.State.do_action(
							new app.Actions.Bundle_action('move_layers', 'Move Layers', move_actions)
						);
					}
				}
			}
		}
		this.moving = false;
		this.resizing = false;
		this.mousedown_mask_dimensions = null;
		this.mousedown_multi_positions = null;

		if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_transform_indicators === 'function') {
			app.GUI.GUI_tools.update_transform_indicators();
		}
	}

	render_overlay(ctx){
		var ctx = this.Base_layers.ctx;
		var mouse = this.get_mouse_info(event);

		//maybe related tool have additional overlay render handlers?
		if(config.layer && config.layer.render_function != null) {
			var render_class = config.layer.render_function[0];
			var render_function = 'select';
			if (
				typeof this.Base_gui.GUI_tools.tools_modules[render_class].object[
					render_function
					] != "undefined"
			) {
				this.Base_gui.GUI_tools.tools_modules[render_class].object[
					render_function
					](this.ctx);
			}
		}

		if (mouse.is_drag == false)
			return;

		this.render_overlay_parent(ctx);
	}

	/**
	 * calculates current object snap coordinates and returns it. One of coordinates can be null.
	 *
	 * @param event
	 * @param pos_x
	 * @param pos_y
	 * @returns object|null
	 */
	calc_snap(event, pos_x, pos_y) {
		var snap_position = { x: null, y: null };
		var params = this.getParams();

		const contentBounds = get_layer_content_bounds(config.layer);
		const targetW = contentBounds ? contentBounds.width : config.layer?.width;
		const targetH = contentBounds ? contentBounds.height : config.layer?.height;

		if(config.SNAP === false || event.shiftKey == true || !config.layer || targetW == null || targetH == null){
			this.snap_line_info = {x: null, y: null};
			return null;
		}

		//settings
		var sensitivity = 0.01;
		var max_distance = (config.WIDTH + config.HEIGHT) / 2 * sensitivity / config.ZOOM;

		//collect snap positions
		var snap_positions = this.get_snap_positions(config.layer ? config.layer.id : null);

		//find closest snap positions
		var min_group = {
			x: {
				start: null,
				center: null,
				end: null,
			},
			y: {
				start: null,
				center: null,
				end: null,
			},
		};
		var min_group_distance = {
			x: {
				start: null,
				center: null,
				end: null,
			},
			y: {
				start: null,
				center: null,
				end: null,
			},
		};
		//x
		for(var i in snap_positions.x){
			var distance = Math.abs(pos_x - snap_positions.x[i]);
			if(distance < max_distance && (distance < min_group_distance.x.start || min_group_distance.x.start === null)){
				min_group_distance.x.start = distance;
				min_group.x.start = snap_positions.x[i];
			}

			var distance = Math.abs(pos_x + targetW/2 - snap_positions.x[i]);
			if(distance < max_distance && (distance < min_group_distance.x.center || min_group_distance.x.center === null)){
				min_group_distance.x.center = distance;
				min_group.x.center = snap_positions.x[i];
			}

			var distance = Math.abs(pos_x + targetW - snap_positions.x[i]);
			if(distance < max_distance && (distance < min_group_distance.x.end || min_group_distance.x.end === null)){
				min_group_distance.x.end = distance;
				min_group.x.end = snap_positions.x[i];
			}
		}
		//y
		for(var i in snap_positions.y){
			var distance = Math.abs(pos_y - snap_positions.y[i]);
			if(distance < max_distance && (distance < min_group_distance.y.start || min_group_distance.y.start === null)){
				min_group_distance.y.start = distance;
				min_group.y.start = snap_positions.y[i];
			}

			var distance = Math.abs(pos_y + targetH/2 - snap_positions.y[i]);
			if(distance < max_distance && (distance < min_group_distance.y.center || min_group_distance.y.center === null)){
				min_group_distance.y.center = distance;
				min_group.y.center = snap_positions.y[i];
			}

			var distance = Math.abs(pos_y + targetH - snap_positions.y[i]);
			if(distance < max_distance && (distance < min_group_distance.y.end || min_group_distance.y.end === null)){
				min_group_distance.y.end = distance;
				min_group.y.end = snap_positions.y[i];
			}
		}

		//find best begin, center, end
		var min_distance = {
			x: null,
			y: null,
		};
		//x
		if(min_group_distance.x.start != null)
			min_distance.x = min_group_distance.x.start;
		if(min_group_distance.x.center != null && (min_group_distance.x.center < min_distance.x || min_distance.x === null))
			min_distance.x = min_group_distance.x.center;
		if(min_group_distance.x.end != null && (min_group_distance.x.end < min_distance.x || min_distance.x === null))
			min_distance.x = min_group_distance.x.end;
		//y
		if(min_group_distance.y.start != null)
			min_distance.y = min_group_distance.y.start;
		if(min_group_distance.y.center != null && (min_group_distance.y.center < min_distance.y || min_distance.y === null))
			min_distance.y = min_group_distance.y.center;
		if(min_group_distance.y.end != null && (min_group_distance.y.end < min_distance.y || min_distance.y === null))
			min_distance.y = min_group_distance.y.end;

		//apply snap
		var success = false;
		//x
		if(min_group.x.center != null && min_group_distance.x.center == min_distance.x) {
			snap_position.x = Math.round(min_group.x.center - targetW / 2);
			success = true;
			this.snap_line_info.x = {
				start_x: min_group.x.center,
				start_y: 0,
				end_x: min_group.x.center,
				end_y: config.HEIGHT
			};
		}
		else if(min_group.x.start != null && min_group_distance.x.start == min_distance.x) {
			snap_position.x = Math.round(min_group.x.start);
			success = true;
			this.snap_line_info.x = {
				start_x: min_group.x.start,
				start_y: 0,
				end_x: min_group.x.start,
				end_y: config.HEIGHT
			};
		}
		else if(min_group.x.end != null && min_group_distance.x.end == min_distance.x) {
			snap_position.x = Math.round(min_group.x.end - targetW);
			success = true;
			this.snap_line_info.x = {
				start_x: min_group.x.end,
				start_y: 0,
				end_x: min_group.x.end,
				end_y: config.HEIGHT
			};
		}
		else{
			this.snap_line_info.x = null;
		}
		//y
		if(min_group.y.center != null && min_group_distance.y.center == min_distance.y) {
			snap_position.y = Math.round(min_group.y.center - targetH / 2);
			success = true;
			this.snap_line_info.y = {
				start_x: 0,
				start_y: min_group.y.center,
				end_x: config.WIDTH,
				end_y: min_group.y.center
			};
		}
		else if(min_group.y.start != null && min_group_distance.y.start == min_distance.y) {
			snap_position.y = Math.round(min_group.y.start);
			success = true;
			this.snap_line_info.y = {
				start_x: 0,
				start_y: min_group.y.start,
				end_x: config.WIDTH,
				end_y: min_group.y.start
			};
		}
		else if(min_group.y.end != null && min_group_distance.y.end == min_distance.y) {
			snap_position.y = Math.round(min_group.y.end - targetH);
			success = true;
			this.snap_line_info.y = {
				start_x: 0,
				start_y: min_group.y.end,
				end_x: config.WIDTH,
				end_y: min_group.y.end
			};
		}
		else{
			this.snap_line_info.y = null;
		}

		if(success) {
			return snap_position;
		}

		return null;
	}

	is_layer_locked(layer) {
		if (!layer || layer.locked === true) return true;
		const ancestors = get_ancestors(layer.id, config.layers);
		for (const a of ancestors) {
			if (a.locked === true) return true;
		}
		return false;
	}

	get_movable_layers() {
		const selected_ids = (Array.isArray(config.selected_layer_ids) && config.selected_layer_ids.length > 0)
			? config.selected_layer_ids
			: (config.layer ? [config.layer.id] : []);

		const movable_layers = [];
		const visited_ids = new Set();

		for (const raw_id of selected_ids) {
			const id = parseInt(raw_id, 10);
			const layer = app.Layers.get_layer(id);
			if (!layer) continue;

			if (is_group(layer)) {
				const desc_ids = get_descendant_ids(layer.id, config.layers);
				for (const desc_id of desc_ids) {
					if (visited_ids.has(desc_id)) continue;
					const child = app.Layers.get_layer(desc_id);
					if (child && !is_group(child)) {
						visited_ids.add(desc_id);
						if (!this.is_layer_locked(child)) {
							movable_layers.push(child);
						}
					}
				}
			} else {
				if (visited_ids.has(layer.id)) continue;
				visited_ids.add(layer.id);
				if (!this.is_layer_locked(layer)) {
					movable_layers.push(layer);
				}
			}
		}
		return movable_layers;
	}

	move(direction_x, direction_y, event) {
		const movable_layers = this.get_movable_layers();
		if (movable_layers.length === 0) {
			return;
		}
		if (!this.keyboard_move_start_positions) {
			this.keyboard_move_start_positions = new Map();
			for (const l of movable_layers) {
				this.keyboard_move_start_positions.set(l.id, {
					x: l.x,
					y: l.y,
					width: l.width,
					height: l.height
				});
			}
		}
		var power = 10;
		if (event.ctrlKey == true || event.metaKey)
			power = 50;
		if (event.shiftKey == true)
			power = 1;

		const offset_x = direction_x * power;
		const offset_y = direction_y * power;

		for (const l of movable_layers) {
			const prevX = l.x;
			const prevY = l.y;
			l.x += offset_x;
			l.y += offset_y;
			if (l.type === 'vector') {
				const dx = l.x - prevX;
				const dy = l.y - prevY;
				const vecId = l.vector_id || (l.params && l.params.vector_id);
				const vec = (config.vectors || []).find(v => v.id === vecId);
				if (vec && typeof vec.translate === 'function') {
					vec.translate(dx, dy);
				}
			}
			if (this.Base_layers.render_interactive_layer) {
				this.Base_layers.render_interactive_layer(l.id);
			}
		}
		this.Base_layers.render();
	}

	async auto_select_object(e) {
		var params = this.getParams();
		if (params.auto_select == false)
			return;

		var movable = this.get_movable_layers();
		var movable_id_set = new Set(movable.map(l => l.id));

		var selected_ids = (Array.isArray(config.selected_layer_ids) && config.selected_layer_ids.length > 0)
			? config.selected_layer_ids.map(id => parseInt(id, 10))
			: (config.layer ? [config.layer.id] : []);
		var selected_id_set = new Set(selected_ids);

		var layers_sorted = this.Base_layers.get_sorted_layers();

		//render main canvas
		for (var i = 0; i < layers_sorted.length; i++) {
			var value = layers_sorted[i];
			if (value.visible === false) continue;
			var canvas = this.Base_layers.convert_layer_to_canvas(value.id, null, false);

			if (this.check_hit_region(e, canvas.getContext("2d"), value) == true) {
				// If clicked layer is already part of the active selection (or inside a selected group),
				// do NOT change or collapse the selection!
				if (movable_id_set.has(value.id) || selected_id_set.has(value.id)) {
					return;
				}
				await app.State.do_action(
					new app.Actions.Select_layer_action(value.id)
				);
				break;
			}
		}
	}

	check_hit_region(e, ctx, layer) {
		var mouse = this.get_mouse_info(e);

		if(layer.type == 'image' && Math.abs(layer.width * layer.height / 1000000) > 5){
			//too big to check using getImageData - use simple way
			if (mouse.x > layer.x && mouse.x < layer.x + layer.width &&
				mouse.y > layer.y && mouse.y < layer.y + layer.height) {
				//hit
				return true;
			}

			return false;
		}

		var data = ctx.getImageData(mouse.x, mouse.y, 1, 1).data;
		var blank = [0, 0, 0, 0];
		if (config.TRANSPARENCY == false) {
			blank = [0, 0, 0, 0];
		}

		if (data[0] != blank[0] || data[1] != blank[1] || data[2] != blank[2]
			|| data[3] != blank[3]) {
			//hit
			return true;
		}

		return false;
	}

}

export default Select_tool_class;
