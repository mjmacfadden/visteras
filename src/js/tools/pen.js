/**
 * Professional Pen Tool for Visteras
 * 
 * Supports:
 * - Straight segment placement (click)
 * - True Bézier curve dragging (click + drag out tangent handles)
 * - Subpath closing with visual indicator
 * - Multiple subpaths within a single Vector object
 * - Live rubber-band preview segment
 * - Anchor deletion (click on existing anchor)
 * - Anchor addition (click on path segment)
 * - Handle dragging & independent angle splitting (Alt/Option)
 * - Angle constraints (0°, 45°, 90°) with Shift
 * - Temporary Direct Selection with Ctrl / Cmd
 * - Full Undo / Redo participation
 */

import app from '../app.js';
import config from '../config.js';
import Base_tools_class from '../core/base-tools.js';
import Base_layers_class from '../core/base-layers.js';
import Helper_class from '../libs/helpers.js';
import Vector_manager from '../core/vector/vector-manager.js';
import Vector_renderer from '../core/vector/vector-renderer.js';
import { Vector, Subpath, Anchor } from '../core/vector/vector-model.js';
import { Modify_path_action } from '../actions/vector/modify-path.js';
import { Insert_vector_action } from '../actions/vector/insert-vector.js';
import { Update_vector_action } from '../actions/vector/update-vector.js';

class Pen_tool_class extends Base_tools_class {
	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'pen';
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();

		// Interaction state
		this.drag_mode = null; // 'create_anchor' | 'move_anchor' | 'move_handle' | 'direct_select'
		this.drag_start_world = { x: 0, y: 0 };
		this.drag_target = null; // { type, subpath_idx, anchor_idx, ... }
		this.initial_paths_snapshot = null;
		this.hover_state = null;
		this.is_closing_hover = false;
		this.mouse_pos = { x: 0, y: 0 };
	}

	load() {
		// Base_tools handles centralized event dispatching
	}

	on_activate() {
		// When activating pen tool, ensure we have an active vector
		const vec = Vector_manager.get_active_vector();
		if (!vec && config.vectors && config.vectors.length > 0) {
			Vector_manager.set_active_vector(config.vectors[0].id);
		}
		this._sync_options_bar();
		config.need_render = true;
	}

	on_leave() {
		this.drag_mode = null;
		this.drag_target = null;
		this.hover_state = null;
		this.is_closing_hover = false;
		config.need_render = true;
	}

	on_params_update() {
		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		const params = this.getParams();
		const updates = {};
		if (params.mode) {
			updates.mode = (params.mode.value || params.mode).toLowerCase();
		}
		if (params.fill) {
			updates.fill = params.fill;
		}
		if (params.stroke) {
			updates.stroke = params.stroke;
		}
		if (params.stroke_width) {
			updates.stroke_width = Number(params.stroke_width.value || params.stroke_width);
		}

		if (Object.keys(updates).length > 0) {
			app.State.do_action(new Update_vector_action(vec.id, updates));
		}
	}

	_sync_options_bar() {
		const vec = Vector_manager.get_active_vector();
		if (!vec) return;
		const toolConfig = (config.TOOLS || []).find(t => t.name === 'pen');
		if (!toolConfig || !toolConfig.attributes) return;

		if (toolConfig.attributes.mode) {
			toolConfig.attributes.mode.value = vec.mode === 'shape' ? 'Shape' : 'Path';
		}
		if (vec.fill) toolConfig.attributes.fill = vec.fill;
		if (vec.stroke) toolConfig.attributes.stroke = vec.stroke;
		if (vec.stroke_width && toolConfig.attributes.stroke_width) {
			toolConfig.attributes.stroke_width.value = vec.stroke_width;
		}
	}

	keydown(e) {
		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		// Escape: finish current open subpath
		if (e.code === 'Escape' || e.key === 'Escape') {
			Vector_manager.active_subpath_index = null;
			Vector_manager.active_anchor_index = null;
			config.need_render = true;
			e.preventDefault();
			return;
		}

		// Delete / Backspace: delete selected anchor
		if ((e.key === 'Delete' || e.key === 'Backspace') && Vector_manager.active_anchor_index !== null) {
			this._delete_active_anchor();
			e.preventDefault();
			return;
		}
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (!mouse.click_valid) return;

		let mouse_x = mouse.x;
		let mouse_y = mouse.y;

		// Shift angle constraint when placing or dragging
		if (e.shiftKey && this._has_active_endpoint()) {
			const prevPt = this._get_active_endpoint();
			const constrained = this._constrain_angle(prevPt, { x: mouse_x, y: mouse_y });
			mouse_x = constrained.x;
			mouse_y = constrained.y;
		}

		this.drag_start_world = { x: mouse_x, y: mouse_y };
		const isCtrlCmd = e.ctrlKey || e.metaKey;
		const isAlt = e.altKey;

		// 1. Ensure active vector exists
		let vec = Vector_manager.get_active_vector();
		if (config.layer && config.layer.type === 'vector') {
			const vecId = config.layer.vector_id || (config.layer.params && config.layer.params.vector_id);
			if (vecId) {
				const layerVec = (config.vectors || []).find(v => v.id === vecId);
				if (layerVec) {
					vec = layerVec;
					Vector_manager.active_vector_id = vec.id;
				}
			}
		}
		if (!vec) {
			const params = this.getParams();
			const mode = (params.mode?.value || params.mode || 'Shape').toLowerCase();
			vec = new Vector({
				name: 'Vector ' + ((config.vectors ? config.vectors.length : 0) + 1),
				mode: mode,
				fill: mode === 'shape' ? (params.fill || '#cccccc') : null,
				stroke: params.stroke || '#000000',
				stroke_width: Number(params.stroke_width?.value || params.stroke_width || 2)
			});
			app.State.do_action(new Insert_vector_action(vec));
		}

		this.initial_paths_snapshot = vec.paths.map(p => p.clone());

		// 2. Direct selection mode with Ctrl/Cmd
		if (isCtrlCmd) {
			const hit = Vector_manager.hit_test({ x: mouse_x, y: mouse_y }, vec);
			if (hit) {
				Vector_manager.active_subpath_index = hit.subpath_idx;
				Vector_manager.active_anchor_index = hit.anchor_idx;
				this.drag_mode = (hit.type === 'anchor') ? 'move_anchor' : 'move_handle';
				this.drag_target = hit;
			}
			config.need_render = true;
			return;
		}

		// 3. Hit test anchors & handles
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
			const isStartAnchor = (hit.anchor_idx === 0);
			const isActiveSubpath = (hit.subpath_idx === Vector_manager.active_subpath_index);

			// Check for Closing Path (clicked start anchor of currently active open subpath)
			if (isStartAnchor && isActiveSubpath && !subpath.closed && subpath.anchors.length > 1) {
				subpath.closed = true;
				Vector_manager.active_subpath_index = null;
				Vector_manager.active_anchor_index = null;
				this.drag_mode = null;
				this._commit_path_change('Close Path');
				return;
			}

			// Alt + Click on anchor: toggle corner / smooth handles
			if (isAlt) {
				const anchor = subpath.anchors[hit.anchor_idx];
				if (anchor.handle_in || anchor.handle_out) {
					// Retract handles to make a sharp corner
					anchor.handle_in = null;
					anchor.handle_out = null;
					anchor.type = 'corner';
				} else {
					// Pull out initial smooth handles
					anchor.handle_in = { x: anchor.point.x - 20, y: anchor.point.y };
					anchor.handle_out = { x: anchor.point.x + 20, y: anchor.point.y };
					anchor.type = 'smooth';
				}
				Vector_manager.active_subpath_index = hit.subpath_idx;
				Vector_manager.active_anchor_index = hit.anchor_idx;
				this._commit_path_change('Convert Anchor Point');
				return;
			}

			// Click on existing anchor with auto_add_delete: delete anchor
			const params = this.getParams();
			if (params.auto_add_delete !== false && !isStartAnchor) {
				subpath.anchors.splice(hit.anchor_idx, 1);
				if (subpath.anchors.length === 0) {
					vec.paths.splice(hit.subpath_idx, 1);
					Vector_manager.active_subpath_index = null;
					Vector_manager.active_anchor_index = null;
				} else {
					Vector_manager.active_anchor_index = Math.min(hit.anchor_idx, subpath.anchors.length - 1);
				}
				this._commit_path_change('Delete Anchor');
				return;
			}

			// Otherwise, select and begin dragging anchor
			Vector_manager.active_subpath_index = hit.subpath_idx;
			Vector_manager.active_anchor_index = hit.anchor_idx;
			this.drag_mode = 'move_anchor';
			this.drag_target = hit;
			config.need_render = true;
			return;
		}

		// 4. Hit test on segment: split segment & insert anchor
		const params = this.getParams();
		if (params.auto_add_delete !== false) {
			const segmentHit = Vector_manager.hit_test_segment({ x: mouse_x, y: mouse_y }, vec);
			if (segmentHit) {
				const subpath = vec.paths[segmentHit.subpath_idx];
				const a1 = subpath.anchors[segmentHit.segment_idx];
				const a2 = subpath.anchors[(segmentHit.segment_idx + 1) % subpath.anchors.length];
				const cp1 = a1.handle_out || a1.point;
				const cp2 = a2.handle_in || a2.point;

				const split = Vector_manager.split_bezier_at(segmentHit.t, a1.point, cp1, cp2, a2.point);

				a1.handle_out = split.left_handle_out;
				a2.handle_in = split.right_handle_in;

				const newAnchor = new Anchor({
					point: split.split_point,
					handle_in: split.split_handle_in,
					handle_out: split.split_handle_out,
					type: 'smooth'
				});

				const insertIdx = segmentHit.segment_idx + 1;
				subpath.anchors.splice(insertIdx, 0, newAnchor);

				Vector_manager.active_subpath_index = segmentHit.subpath_idx;
				Vector_manager.active_anchor_index = insertIdx;

				this._commit_path_change('Add Anchor');
				return;
			}
		}

		// 5. Creating a new Anchor in active subpath or starting a new subpath
		let activeSubpath = (Vector_manager.active_subpath_index !== null && vec.paths[Vector_manager.active_subpath_index])
			? vec.paths[Vector_manager.active_subpath_index]
			: null;

		if (!activeSubpath || activeSubpath.closed) {
			activeSubpath = new Subpath({ closed: false, anchors: [] });
			vec.paths.push(activeSubpath);
			Vector_manager.active_subpath_index = vec.paths.length - 1;
		}

		const newAnchor = new Anchor({
			point: { x: mouse_x, y: mouse_y },
			handle_in: null,
			handle_out: null,
			type: 'corner'
		});

		activeSubpath.anchors.push(newAnchor);
		const newAnchorIdx = activeSubpath.anchors.length - 1;
		Vector_manager.active_anchor_index = newAnchorIdx;

		this.drag_mode = 'create_anchor';
		this.drag_target = {
			subpath_idx: Vector_manager.active_subpath_index,
			anchor_idx: newAnchorIdx,
			anchor: newAnchor
		};

		config.need_render = true;
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
		let mouse_x = mouse.x;
		let mouse_y = mouse.y;

		const vec = Vector_manager.get_active_vector();
		this.mouse_pos = { x: mouse_x, y: mouse_y };

		// Handle Active Pointer Drag
		if (mouse.is_drag && this.drag_mode && vec) {
			const isShift = e.shiftKey;
			const isAlt = e.altKey;

			if (isShift) {
				const constrained = this._constrain_angle(this.drag_start_world, { x: mouse_x, y: mouse_y });
				mouse_x = constrained.x;
				mouse_y = constrained.y;
			}

			if (this.drag_mode === 'create_anchor' && this.drag_target) {
				// Dragging tangent handles out from new anchor
				const anchor = this.drag_target.anchor;
				const dx = mouse_x - this.drag_start_world.x;
				const dy = mouse_y - this.drag_start_world.y;

				if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
					anchor.type = isAlt ? 'corner' : 'smooth';
					anchor.handle_out = { x: anchor.point.x + dx, y: anchor.point.y + dy };
					if (!isAlt) {
						anchor.handle_in = { x: anchor.point.x - dx, y: anchor.point.y - dy };
					}
				}
				config.need_render = true;
				return;
			}

			if (this.drag_mode === 'move_handle' && this.drag_target) {
				const { subpath_idx, anchor_idx, type } = this.drag_target;
				const subpath = vec.paths[subpath_idx];
				const anchor = subpath?.anchors[anchor_idx];
				if (!anchor) return;

				const targetHandle = (type === 'handle_in') ? 'handle_in' : 'handle_out';
				const oppHandle = (type === 'handle_in') ? 'handle_out' : 'handle_in';

				anchor[targetHandle] = { x: mouse_x, y: mouse_y };

				// If smooth and not holding Alt, keep opposite handle collinear and symmetric
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

			if (this.drag_mode === 'move_anchor' && this.drag_target) {
				const { subpath_idx, anchor_idx } = this.drag_target;
				const subpath = vec.paths[subpath_idx];
				const anchor = subpath?.anchors[anchor_idx];
				if (!anchor) return;

				const dx = mouse_x - this.drag_start_world.x;
				const dy = mouse_y - this.drag_start_world.y;

				const initialAnchor = this.initial_paths_snapshot[subpath_idx]?.anchors[anchor_idx];
				if (initialAnchor) {
					anchor.point = { x: initialAnchor.point.x + dx, y: initialAnchor.point.y + dy };
					if (initialAnchor.handle_in) {
						anchor.handle_in = { x: initialAnchor.handle_in.x + dx, y: initialAnchor.handle_in.y + dy };
					}
					if (initialAnchor.handle_out) {
						anchor.handle_out = { x: initialAnchor.handle_out.x + dx, y: initialAnchor.handle_out.y + dy };
					}
				}
				config.need_render = true;
				return;
			}
		}

		// Hover Detection when not dragging
		if (vec) {
			const hit = Vector_manager.hit_test({ x: mouse_x, y: mouse_y }, vec);
			this.hover_state = hit;

			// Closing indicator hover
			if (hit && hit.type === 'anchor' && hit.anchor_idx === 0 && Vector_manager.active_subpath_index === hit.subpath_idx) {
				const subpath = vec.paths[hit.subpath_idx];
				this.is_closing_hover = subpath && !subpath.closed && subpath.anchors.length > 1;
			} else {
				this.is_closing_hover = false;
			}

			config.need_render = true;
		}
	}

	mouseup(e) {
		if (this.drag_mode) {
			let actionDesc = 'Modify Path';
			if (this.drag_mode === 'create_anchor') actionDesc = 'Add Anchor';
			else if (this.drag_mode === 'move_anchor') actionDesc = 'Move Anchor';
			else if (this.drag_mode === 'move_handle') actionDesc = 'Adjust Handle';

			this._commit_path_change(actionDesc);
		}

		this.drag_mode = null;
		this.drag_target = null;
		config.need_render = true;
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

	_delete_active_anchor() {
		const vec = Vector_manager.get_active_vector();
		if (!vec || Vector_manager.active_subpath_index === null || Vector_manager.active_anchor_index === null) return;

		const sIdx = Vector_manager.active_subpath_index;
		const aIdx = Vector_manager.active_anchor_index;
		const subpath = vec.paths[sIdx];
		if (!subpath || !subpath.anchors[aIdx]) return;

		subpath.anchors.splice(aIdx, 1);
		if (subpath.anchors.length === 0) {
			vec.paths.splice(sIdx, 1);
			Vector_manager.active_subpath_index = null;
			Vector_manager.active_anchor_index = null;
		} else {
			Vector_manager.active_anchor_index = Math.min(aIdx, subpath.anchors.length - 1);
		}

		this._commit_path_change('Delete Anchor');
	}

	_has_active_endpoint() {
		const vec = Vector_manager.get_active_vector();
		if (!vec || Vector_manager.active_subpath_index === null) return false;
		const subpath = vec.paths[Vector_manager.active_subpath_index];
		return subpath && !subpath.closed && subpath.anchors.length > 0;
	}

	_get_active_endpoint() {
		const vec = Vector_manager.get_active_vector();
		const subpath = vec.paths[Vector_manager.active_subpath_index];
		return subpath.anchors[subpath.anchors.length - 1].point;
	}

	_constrain_angle(origin, target) {
		const dx = target.x - origin.x;
		const dy = target.y - origin.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist === 0) return target;

		let angle = Math.atan2(dy, dx);
		// Snap to nearest 45 degrees (PI / 4)
		const snap = Math.PI / 4;
		angle = Math.round(angle / snap) * snap;

		return {
			x: origin.x + Math.cos(angle) * dist,
			y: origin.y + Math.sin(angle) * dist
		};
	}

	render(ctx, layer, is_preview) {
		if (!layer || layer.visible === false) return;
		const vecId = layer.vector_id || (layer.params && layer.params.vector_id);
		const vec = (config.vectors && config.vectors.find(v => v.id === vecId)) || layer.vector;
		if (vec && vec.visible !== false) {
			Vector_renderer.render_vector(ctx, vec);
		}
	}

	render_overlay(ctx) {
		const vec = Vector_manager.get_active_vector();
		const params = this.getParams();
		const showRubberBand = params.rubber_band !== false && !this.drag_mode && this._has_active_endpoint();

		const previewAnchor = showRubberBand ? { point: this.mouse_pos } : null;

		Vector_renderer.render_overlay(ctx, {
			vector: vec,
			active_subpath_index: Vector_manager.active_subpath_index,
			active_anchor_index: Vector_manager.active_anchor_index,
			hover_state: this.hover_state,
			preview_anchor: previewAnchor,
			is_closing_hover: this.is_closing_hover
		});
	}
}

export default Pen_tool_class;
