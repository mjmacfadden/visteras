/**
 * Vector Manager for Visteras
 * 
 * Central controller for managing persistent Vector objects in the active document.
 * Handles active vector selection, subpaths, anchors, hit-testing, and UI updates.
 */

import config from '../../config.js';
import app from '../../app.js';
import { Vector, Subpath, Anchor } from './vector-model.js';
import Vector_renderer from './vector-renderer.js';

class Vector_manager_class {
	constructor() {
		this.active_vector_id = null;
		this.active_subpath_index = null;
		this.active_anchor_index = null;
		this.selected_anchors = []; // [{ subpath_idx, anchor_idx }]
		this.hover_state = null; // { type: 'anchor'|'handle_in'|'handle_out'|'segment'|'body', subpath_idx, anchor_idx, point }
		this.hit_threshold = 7; // screen pixels
	}

	/**
	 * Returns all vectors for the current document.
	 * @returns {Vector[]}
	 */
	get_vectors() {
		if (!config.vectors || !Array.isArray(config.vectors)) {
			config.vectors = [];
		}
		return config.vectors;
	}

	/**
	 * Returns the currently active Vector object.
	 * @returns {Vector|null}
	 */
	get_active_vector() {
		const vectors = this.get_vectors();
		if (!this.active_vector_id && vectors.length > 0) {
			this.active_vector_id = vectors[0].id;
		}
		return vectors.find(v => v.id === this.active_vector_id) || null;
	}

	/**
	 * Sets the active vector by ID.
	 * @param {string|number|null} id 
	 */
	set_active_vector(id) {
		this.active_vector_id = id;
		config.active_vector_id = id;
		this.active_subpath_index = null;
		this.active_anchor_index = null;
		this.selected_anchors = [];
		this.hover_state = null;

		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		if (app.GUI && app.GUI.GUI_properties) {
			app.GUI.GUI_properties.render_properties();
		}
		config.need_render = true;
	}

	is_anchor_selected(sIdx, aIdx) {
		return this.selected_anchors.some(a => a.subpath_idx === sIdx && a.anchor_idx === aIdx);
	}

	select_anchor(sIdx, aIdx, addToSelection = false) {
		if (!addToSelection) {
			this.selected_anchors = [];
		}
		if (!this.is_anchor_selected(sIdx, aIdx)) {
			this.selected_anchors.push({ subpath_idx: sIdx, anchor_idx: aIdx });
		}
		this.active_subpath_index = sIdx;
		this.active_anchor_index = aIdx;
	}

	toggle_anchor_selection(sIdx, aIdx) {
		const idx = this.selected_anchors.findIndex(a => a.subpath_idx === sIdx && a.anchor_idx === aIdx);
		if (idx > -1) {
			this.selected_anchors.splice(idx, 1);
			if (this.selected_anchors.length > 0) {
				const last = this.selected_anchors[this.selected_anchors.length - 1];
				this.active_subpath_index = last.subpath_idx;
				this.active_anchor_index = last.anchor_idx;
			} else {
				this.active_anchor_index = null;
			}
		} else {
			this.selected_anchors.push({ subpath_idx: sIdx, anchor_idx: aIdx });
			this.active_subpath_index = sIdx;
			this.active_anchor_index = aIdx;
		}
	}

	select_all_anchors(targetVector = null) {
		const vec = targetVector || this.get_active_vector();
		if (!vec) return;
		this.selected_anchors = [];
		for (let s = 0; s < vec.paths.length; s++) {
			for (let a = 0; a < vec.paths[s].anchors.length; a++) {
				this.selected_anchors.push({ subpath_idx: s, anchor_idx: a });
			}
		}
		if (this.selected_anchors.length > 0) {
			this.active_subpath_index = 0;
			this.active_anchor_index = 0;
		}
	}

	clear_anchor_selection() {
		this.selected_anchors = [];
		this.active_subpath_index = null;
		this.active_anchor_index = null;
	}

	/**
	 * Finds or creates an active vector for drawing.
	 * @param {string} [name='Vector']
	 * @param {'path'|'shape'} [mode='path']
	 * @returns {Vector}
	 */
	ensure_active_vector(name = 'Vector', mode = 'path') {
		let vec = this.get_active_vector();
		if (!vec) {
			vec = new Vector({
				name: name,
				mode: mode,
				stroke: config.COLOR || '#008000',
				fill: mode === 'shape' ? '#555555' : null
			});
			this.add_vector(vec);
		}
		return vec;
	}

	/**
	 * Adds a vector to the collection.
	 * @param {Vector} vector 
	 */
	add_vector(vector) {
		if (!(vector instanceof Vector)) {
			vector = Vector.fromJSON(vector);
		}
		const vectors = this.get_vectors();
		vectors.push(vector);
		this.set_active_vector(vector.id);
	}

	/**
	 * Deletes a vector by ID.
	 * @param {string|number} id 
	 */
	delete_vector(id) {
		const vectors = this.get_vectors();
		const idx = vectors.findIndex(v => v.id === id);
		if (idx > -1) {
			vectors.splice(idx, 1);
			if (this.active_vector_id === id) {
				const nextVec = vectors[Math.max(0, idx - 1)] || null;
				this.set_active_vector(nextVec ? nextVec.id : null);
			} else {
				if (app.GUI && app.GUI.GUI_vectors) {
					app.GUI.GUI_vectors.render_vectors();
				}
				config.need_render = true;
			}
		}
	}

	/**
	 * Hit test on vector anchors and Bézier handles.
	 * @param {{x: number, y: number}} worldPos - Document coordinates
	 * @param {Vector} [targetVector=null]
	 * @returns {Object|null} { type: 'anchor'|'handle_in'|'handle_out', subpath_idx, anchor_idx, anchor, distance }
	 */
	hit_test(worldPos, targetVector = null) {
		const vector = targetVector || this.get_active_vector();
		if (!vector || !vector.paths || vector.paths.length === 0) return null;

		const zoom = config.ZOOM || 1;
		const threshold = this.hit_threshold / zoom;
		let closest = null;
		let minDistance = Infinity;

		for (let sIdx = 0; sIdx < vector.paths.length; sIdx++) {
			const subpath = vector.paths[sIdx];
			const isSubpathActive = (sIdx === this.active_subpath_index);

			for (let aIdx = 0; aIdx < subpath.anchors.length; aIdx++) {
				const anchor = subpath.anchors[aIdx];
				const isAnchorActive = isSubpathActive && (aIdx === this.active_anchor_index);

				// 1. Check handles if anchor is active / selected
				if (isAnchorActive || (this.hover_state && this.hover_state.anchor_idx === aIdx && this.hover_state.subpath_idx === sIdx)) {
					if (anchor.handle_in) {
						const dist = this._dist(worldPos, anchor.handle_in);
						if (dist <= threshold && dist < minDistance) {
							minDistance = dist;
							closest = {
								type: 'handle_in',
								subpath_idx: sIdx,
								anchor_idx: aIdx,
								anchor: anchor,
								point: anchor.handle_in,
								distance: dist
							};
						}
					}
					if (anchor.handle_out) {
						const dist = this._dist(worldPos, anchor.handle_out);
						if (dist <= threshold && dist < minDistance) {
							minDistance = dist;
							closest = {
								type: 'handle_out',
								subpath_idx: sIdx,
								anchor_idx: aIdx,
								anchor: anchor,
								point: anchor.handle_out,
								distance: dist
							};
						}
					}
				}

				// 2. Check anchor point (prioritized if closer)
				const dist = this._dist(worldPos, anchor.point);
				if (dist <= threshold && dist < minDistance) {
					minDistance = dist;
					closest = {
						type: 'anchor',
						subpath_idx: sIdx,
						anchor_idx: aIdx,
						anchor: anchor,
						point: anchor.point,
						distance: dist
					};
				}
			}
		}

		return closest;
	}

	/**
	 * Hit test to check if point is on an existing path segment (for adding anchors).
	 * @param {{x: number, y: number}} worldPos 
	 * @param {Vector} [targetVector=null]
	 * @returns {Object|null} { subpath_idx, segment_idx, t, point }
	 */
	hit_test_segment(worldPos, targetVector = null) {
		const vector = targetVector || this.get_active_vector();
		if (!vector || !vector.paths || vector.paths.length === 0) return null;

		const zoom = config.ZOOM || 1;
		const threshold = (this.hit_threshold - 1) / zoom;

		for (let sIdx = 0; sIdx < vector.paths.length; sIdx++) {
			const subpath = vector.paths[sIdx];
			const anchors = subpath.anchors;
			if (anchors.length < 2) continue;

			const segmentCount = subpath.closed ? anchors.length : anchors.length - 1;
			for (let i = 0; i < segmentCount; i++) {
				const a1 = anchors[i];
				const a2 = anchors[(i + 1) % anchors.length];
				const cp1 = a1.handle_out || a1.point;
				const cp2 = a2.handle_in || a2.point;

				const res = this._closest_point_on_bezier(worldPos, a1.point, cp1, cp2, a2.point);
				if (res && res.distance <= threshold) {
					return {
						subpath_idx: sIdx,
						segment_idx: i,
						t: res.t,
						point: res.point
					};
				}
			}
		}

		return null;
	}

	/**
	 * Hit test to check if point is inside the vector shape body/fill or on its stroke.
	 * @param {{x: number, y: number}} worldPos 
	 * @param {Vector} [targetVector=null]
	 * @returns {boolean}
	 */
	hit_test_body(worldPos, targetVector = null) {
		const vector = targetVector || this.get_active_vector();
		if (!vector || !vector.paths || vector.paths.length === 0) return false;

		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		Vector_renderer.draw_vector_path(ctx, vector);

		if (ctx.isPointInPath(worldPos.x, worldPos.y, vector.fill_rule || 'nonzero')) {
			return true;
		}

		const zoom = config.ZOOM || 1;
		const strokeWidth = Math.max(12 / zoom, (vector.stroke_width || 2) + 8 / zoom);
		ctx.lineWidth = strokeWidth;
		if (ctx.isPointInStroke && ctx.isPointInStroke(worldPos.x, worldPos.y)) {
			return true;
		}

		const seg = this.hit_test_segment(worldPos, vector);
		return !!seg;
	}

	_dist(p1, p2) {
		const dx = p1.x - p2.x;
		const dy = p1.y - p2.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	_closest_point_on_bezier(p, p0, p1, p2, p3, steps = 30) {
		let minDist = Infinity;
		let bestT = 0;
		let bestPoint = null;

		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const pt = this._eval_bezier(t, p0, p1, p2, p3);
			const dist = this._dist(p, pt);
			if (dist < minDist) {
				minDist = dist;
				bestT = t;
				bestPoint = pt;
			}
		}

		return { distance: minDist, t: bestT, point: bestPoint };
	}

	_eval_bezier(t, p0, p1, p2, p3) {
		const u = 1 - t;
		const tt = t * t;
		const uu = u * u;
		const uuu = uu * u;
		const ttt = tt * t;

		return {
			x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
			y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
		};
	}

	/**
	 * Subdivides a Bézier segment at parameter t (de Casteljau's algorithm).
	 */
	split_bezier_at(t, p0, p1, p2, p3) {
		const p01 = this._lerp(p0, p1, t);
		const p12 = this._lerp(p1, p2, t);
		const p23 = this._lerp(p2, p3, t);

		const p012 = this._lerp(p01, p12, t);
		const p123 = this._lerp(p12, p23, t);

		const splitPoint = this._lerp(p012, p123, t);

		return {
			split_point: splitPoint,
			left_handle_out: p01,
			split_handle_in: p012,
			split_handle_out: p123,
			right_handle_in: p23
		};
	}

	_lerp(p1, p2, t) {
		return {
			x: p1.x + (p2.x - p1.x) * t,
			y: p1.y + (p2.y - p1.y) * t
		};
	}
}

export default new Vector_manager_class();
