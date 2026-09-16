/**
 * Direct Selection / Anchor Point Tool for Visteras
 * 
 * Allows precise vector node editing:
 * - Selecting individual anchors and subpaths
 * - Multi-anchor selection with Shift (click or marquee)
 * - Clicking inside vector body / fill activates ALL anchors and moves the whole shape
 * - Moving anchors and anchor groups together
 * - Adjusting incoming and outgoing Bézier handles
 * - Splitting handles with Alt/Option to create corner angles
 * - Converting anchors between smooth and corner modes
 * - Deleting individual or multiple selected anchors (Delete/Backspace)
 * - Nudging selected anchors with arrow keys
 * - Constraining handle/anchor movement with Shift
 */

import app from '../app.js';
import config from '../config.js';
import Base_tools_class from '../core/base-tools.js';
import Base_layers_class from '../core/base-layers.js';
import Helper_class from '../libs/helpers.js';
import Vector_manager from '../core/vector/vector-manager.js';
import Vector_renderer from '../core/vector/vector-renderer.js';
import { Modify_path_action } from '../actions/vector/modify-path.js';
import { Anchor } from '../core/vector/vector-model.js';

class Direct_select_tool_class extends Base_tools_class {
	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'direct_select';
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();

		// Interaction state
		this.drag_mode = null; // 'move_anchor' | 'move_handle' | 'marquee'
		this.drag_start_world = { x: 0, y: 0 };
		this.drag_target = null; // { type, subpath_idx, anchor_idx, ... }
		this.initial_paths_snapshot = null;
		this.hover_state = null;
		this.marquee_rect = null;
		this.marquee_is_shift = false;
	}

	load() {
		// Base_tools centralized event handling
	}

	on_activate() {
		if (config.layer && config.layer.type === 'vector') {
			const vecId = config.layer.vector_id || (config.layer.params && config.layer.params.vector_id);
			if (vecId) {
				Vector_manager.set_active_vector(vecId);
			}
		}
		const vec = Vector_manager.get_active_vector();
		if (!vec && config.vectors && config.vectors.length > 0) {
			Vector_manager.set_active_vector(config.vectors[0].id);
		}
		config.need_render = true;
	}

	on_leave() {
		this.drag_mode = null;
		this.drag_target = null;
		this.hover_state = null;
		this.marquee_rect = null;
		config.need_render = true;
	}

	keydown(e) {
		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		// Delete / Backspace: delete selected anchors
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (Vector_manager.selected_anchors.length > 0 || Vector_manager.active_anchor_index !== null) {
				this._delete_selected_anchors();
				e.preventDefault();
				return;
			}
		}

		// Escape: deselect all anchors
		if (e.code === 'Escape' || e.key === 'Escape') {
			Vector_manager.clear_anchor_selection();
			config.need_render = true;
			e.preventDefault();
			return;
		}

		// Arrow keys: nudge selected anchors
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			let selected = Vector_manager.selected_anchors;
			if (selected.length === 0 && Vector_manager.active_anchor_index !== null) {
				selected = [{ subpath_idx: Vector_manager.active_subpath_index, anchor_idx: Vector_manager.active_anchor_index }];
			}
			if (selected.length === 0) return;

			const delta = e.shiftKey ? 10 : 1;
			let dx = 0, dy = 0;
			if (e.key === 'ArrowUp') dy = -delta;
			if (e.key === 'ArrowDown') dy = delta;
			if (e.key === 'ArrowLeft') dx = -delta;
			if (e.key === 'ArrowRight') dx = delta;

			for (const item of selected) {
				const anchor = vec.paths[item.subpath_idx]?.anchors[item.anchor_idx];
				if (anchor) {
					anchor.point.x += dx;
					anchor.point.y += dy;
					if (anchor.handle_in) {
						anchor.handle_in.x += dx;
						anchor.handle_in.y += dy;
					}
					if (anchor.handle_out) {
						anchor.handle_out.x += dx;
						anchor.handle_out.y += dy;
					}
				}
			}
			this._commit_path_change('Nudge Anchors');
			e.preventDefault();
		}
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (!mouse.click_valid) return;

		const mouse_x = mouse.x;
		const mouse_y = mouse.y;
		this.drag_start_world = { x: mouse_x, y: mouse_y };

		let vec = Vector_manager.get_active_vector();
		if (!vec) return;

		this.initial_paths_snapshot = vec.paths.map(p => p.clone());
		const isShift = e.shiftKey;
		const isAlt = e.altKey;

		// 1. Hit test on active vector handles & anchors
		const hit = Vector_manager.hit_test({ x: mouse_x, y: mouse_y }, vec);

		// Handle Hit (moving Bézier control point)
		if (hit && (hit.type === 'handle_in' || hit.type === 'handle_out')) {
			this.drag_mode = 'move_handle';
			this.drag_target = hit;
			Vector_manager.active_subpath_index = hit.subpath_idx;
			Vector_manager.active_anchor_index = hit.anchor_idx;
			config.need_render = true;
			return;
		}

		// Anchor Hit
		if (hit && hit.type === 'anchor') {
			const subpath = vec.paths[hit.subpath_idx];
			const anchor = subpath?.anchors[hit.anchor_idx];

			// Alt + Click on anchor: toggle corner / smooth handles
			if (isAlt && anchor) {
				if (anchor.handle_in || anchor.handle_out) {
					anchor.handle_in = null;
					anchor.handle_out = null;
					anchor.type = 'corner';
				} else {
					anchor.handle_in = { x: anchor.point.x - 20, y: anchor.point.y };
					anchor.handle_out = { x: anchor.point.x + 20, y: anchor.point.y };
					anchor.type = 'smooth';
				}
				this._commit_path_change('Convert Anchor Point');
				return;
			}

			if (isShift) {
				// Shift-click toggles selection of this anchor
				Vector_manager.toggle_anchor_selection(hit.subpath_idx, hit.anchor_idx);
			} else {
				// Normal click: if not already part of multi-selection, select only this anchor
				if (!Vector_manager.is_anchor_selected(hit.subpath_idx, hit.anchor_idx)) {
					Vector_manager.select_anchor(hit.subpath_idx, hit.anchor_idx, false);
				}
			}

			this.drag_mode = 'move_anchor';
			this.drag_target = hit;
			config.need_render = true;
			return;
		}

		// 2. Click in the middle / body of vector object: activate ALL anchor points
		const hitBody = Vector_manager.hit_test_body({ x: mouse_x, y: mouse_y }, vec);
		if (hitBody) {
			Vector_manager.select_all_anchors(vec);
			this.drag_mode = 'move_anchor';
			this.drag_target = { type: 'all_anchors' };
			config.need_render = true;
			return;
		}

		// 3. Click on empty canvas: clear selection or start marquee
		if (!isShift) {
			Vector_manager.clear_anchor_selection();
		}
		this.drag_mode = 'marquee';
		this.marquee_is_shift = isShift;
		this.marquee_rect = { x1: mouse_x, y1: mouse_y, x2: mouse_x, y2: mouse_y };
		config.need_render = true;
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
		let mouse_x = mouse.x;
		let mouse_y = mouse.y;

		const vec = Vector_manager.get_active_vector();

		if (mouse.is_drag && this.drag_mode && vec) {
			const isShift = e.shiftKey;
			const isAlt = e.altKey;

			if (isShift && this.drag_mode !== 'marquee') {
				const constrained = this._constrain_angle(this.drag_start_world, { x: mouse_x, y: mouse_y });
				mouse_x = constrained.x;
				mouse_y = constrained.y;
			}

			if (this.drag_mode === 'move_handle' && this.drag_target) {
				const { subpath_idx, anchor_idx, type } = this.drag_target;
				const subpath = vec.paths[subpath_idx];
				const anchor = subpath?.anchors[anchor_idx];
				if (!anchor) return;

				const targetHandle = (type === 'handle_in') ? 'handle_in' : 'handle_out';
				const oppHandle = (type === 'handle_in') ? 'handle_out' : 'handle_in';

				anchor[targetHandle] = { x: mouse_x, y: mouse_y };

				// If smooth and not holding Alt, mirror opposite handle
				if (anchor.type === 'smooth' && !isAlt && anchor[oppHandle]) {
					const dx = mouse_x - anchor.point.x;
					const dy = mouse_y - anchor.point.y;
					anchor[oppHandle] = { x: anchor.point.x - dx, y: anchor.point.y - dy };
				} else if (isAlt) {
					anchor.type = 'corner';
				}

				config.need_render = true;
				return;
			}

			if (this.drag_mode === 'move_anchor') {
				const dx = mouse_x - this.drag_start_world.x;
				const dy = mouse_y - this.drag_start_world.y;

				let selected = Vector_manager.selected_anchors;
				if (!selected || selected.length === 0) {
					if (this.drag_target && this.drag_target.subpath_idx !== undefined) {
						selected = [{ subpath_idx: this.drag_target.subpath_idx, anchor_idx: this.drag_target.anchor_idx }];
					}
				}

				for (const item of selected) {
					const anchor = vec.paths[item.subpath_idx]?.anchors[item.anchor_idx];
					const initialAnchor = this.initial_paths_snapshot[item.subpath_idx]?.anchors[item.anchor_idx];
					if (anchor && initialAnchor) {
						anchor.point = { x: initialAnchor.point.x + dx, y: initialAnchor.point.y + dy };
						if (initialAnchor.handle_in) {
							anchor.handle_in = { x: initialAnchor.handle_in.x + dx, y: initialAnchor.handle_in.y + dy };
						}
						if (initialAnchor.handle_out) {
							anchor.handle_out = { x: initialAnchor.handle_out.x + dx, y: initialAnchor.handle_out.y + dy };
						}
					}
				}

				config.need_render = true;
				return;
			}

			if (this.drag_mode === 'marquee') {
				this.marquee_rect = {
					x1: this.drag_start_world.x,
					y1: this.drag_start_world.y,
					x2: mouse_x,
					y2: mouse_y
				};
				config.need_render = true;
				return;
			}
		}

		// Hover Detection
		if (vec) {
			const hit = Vector_manager.hit_test({ x: mouse_x, y: mouse_y }, vec);
			this.hover_state = hit;
			config.need_render = true;
		}
	}

	mouseup(e) {
		if (this.drag_mode) {
			if (this.drag_mode === 'move_anchor') {
				this._commit_path_change('Move Anchors');
			} else if (this.drag_mode === 'move_handle') {
				this._commit_path_change('Adjust Handle');
			} else if (this.drag_mode === 'marquee' && this.marquee_rect) {
				this._select_anchors_in_marquee(this.marquee_is_shift);
			}
		}

		this.drag_mode = null;
		this.drag_target = null;
		this.marquee_rect = null;
		config.need_render = true;
	}

	_select_anchors_in_marquee(isShift = false) {
		const vec = Vector_manager.get_active_vector();
		if (!vec || !this.marquee_rect) return;

		const minX = Math.min(this.marquee_rect.x1, this.marquee_rect.x2);
		const maxX = Math.max(this.marquee_rect.x1, this.marquee_rect.x2);
		const minY = Math.min(this.marquee_rect.y1, this.marquee_rect.y2);
		const maxY = Math.max(this.marquee_rect.y1, this.marquee_rect.y2);

		if (!isShift) {
			Vector_manager.clear_anchor_selection();
		}

		for (let sIdx = 0; sIdx < vec.paths.length; sIdx++) {
			const subpath = vec.paths[sIdx];
			for (let aIdx = 0; aIdx < subpath.anchors.length; aIdx++) {
				const pt = subpath.anchors[aIdx].point;
				if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
					Vector_manager.select_anchor(sIdx, aIdx, true);
				}
			}
		}
	}

	_delete_selected_anchors() {
		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		let selected = Vector_manager.selected_anchors.slice();
		if (selected.length === 0 && Vector_manager.active_anchor_index !== null) {
			selected = [{ subpath_idx: Vector_manager.active_subpath_index, anchor_idx: Vector_manager.active_anchor_index }];
		}
		if (selected.length === 0) return;

		// Sort in descending order of subpath_idx, then anchor_idx
		selected.sort((a, b) => {
			if (b.subpath_idx !== a.subpath_idx) return b.subpath_idx - a.subpath_idx;
			return b.anchor_idx - a.anchor_idx;
		});

		for (const item of selected) {
			const subpath = vec.paths[item.subpath_idx];
			if (subpath && subpath.anchors[item.anchor_idx]) {
				subpath.anchors.splice(item.anchor_idx, 1);
			}
		}

		// Remove any empty subpaths
		for (let s = vec.paths.length - 1; s >= 0; s--) {
			if (vec.paths[s].anchors.length === 0) {
				vec.paths.splice(s, 1);
			}
		}

		Vector_manager.clear_anchor_selection();
		this._commit_path_change('Delete Anchors');
	}

	_constrain_angle(origin, target) {
		const dx = target.x - origin.x;
		const dy = target.y - origin.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist === 0) return target;

		let angle = Math.atan2(dy, dx);
		const snap = Math.PI / 4;
		angle = Math.round(angle / snap) * snap;

		return {
			x: origin.x + Math.cos(angle) * dist,
			y: origin.y + Math.sin(angle) * dist
		};
	}

	_commit_path_change(description = 'Modify Path') {
		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		app.State.do_action(
			new Modify_path_action(vec.id, vec.paths, description, {
				active_subpath_index: Vector_manager.active_subpath_index,
				active_anchor_index: Vector_manager.active_anchor_index
			})
		);
	}

	render_overlay(ctx) {
		const vec = Vector_manager.get_active_vector();
		Vector_renderer.render_overlay(ctx, {
			vector: vec,
			active_subpath_index: Vector_manager.active_subpath_index,
			active_anchor_index: Vector_manager.active_anchor_index,
			selected_anchors: Vector_manager.selected_anchors,
			hover_state: this.hover_state
		});

		// Render Marquee Box if dragging
		if (this.marquee_rect) {
			ctx.save();
			ctx.strokeStyle = '#0084ff';
			ctx.lineWidth = 1 / (config.ZOOM || 1);
			ctx.setLineDash([3 / (config.ZOOM || 1), 3 / (config.ZOOM || 1)]);
			const minX = Math.min(this.marquee_rect.x1, this.marquee_rect.x2);
			const minY = Math.min(this.marquee_rect.y1, this.marquee_rect.y2);
			const w = Math.abs(this.marquee_rect.x2 - this.marquee_rect.x1);
			const h = Math.abs(this.marquee_rect.y2 - this.marquee_rect.y1);
			ctx.strokeRect(minX, minY, w, h);
			ctx.restore();
		}
	}
}

export default Direct_select_tool_class;
