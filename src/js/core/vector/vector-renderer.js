/**
 * Vector System Renderer for Visteras
 * 
 * Handles rendering vector objects (fill, stroke, paths) onto canvas/WebGL
 * and drawing interactive overlays (anchors, Bézier control handles, direction lines,
 * preview lines, and hover states).
 */

import config from '../../config.js';
import zoomView from '../../libs/zoomView.js';

export class Vector_renderer_class {
	constructor() {
		this.anchor_screen_radius = 3.6;
		this.handle_screen_radius = 2.8;
	}

	/**
	 * Construct canvas path 2D commands for a vector object or single subpath.
	 * @param {CanvasRenderingContext2D} ctx 
	 * @param {import('./vector-model.js').Vector} vector 
	 */
	draw_vector_path(ctx, vector) {
		if (!vector || !vector.paths || vector.paths.length === 0) return;

		ctx.beginPath();
		for (const subpath of vector.paths) {
			this.draw_subpath(ctx, subpath);
		}
	}

	/**
	 * Construct path commands for a single subpath.
	 * @param {CanvasRenderingContext2D} ctx 
	 * @param {import('./vector-model.js').Subpath} subpath 
	 */
	draw_subpath(ctx, subpath) {
		const anchors = subpath.anchors;
		if (!anchors || anchors.length === 0) return;

		const start = anchors[0];
		ctx.moveTo(start.point.x, start.point.y);

		for (let i = 0; i < anchors.length - 1; i++) {
			const curr = anchors[i];
			const next = anchors[i + 1];
			this._draw_segment(ctx, curr, next);
		}

		if (subpath.closed && anchors.length > 1) {
			const last = anchors[anchors.length - 1];
			this._draw_segment(ctx, last, start);
			ctx.closePath();
		}
	}

	_draw_segment(ctx, curr, next) {
		const cp1 = curr.handle_out || curr.point;
		const cp2 = next.handle_in || next.point;

		const hasCurves = curr.handle_out !== null || next.handle_in !== null;
		if (hasCurves) {
			ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.point.x, next.point.y);
		} else {
			ctx.lineTo(next.point.x, next.point.y);
		}
	}

	/**
	 * Renders vector appearance (Fill + Stroke) onto target context.
	 * @param {CanvasRenderingContext2D} ctx 
	 * @param {import('./vector-model.js').Vector} vector 
	 */
	render_vector(ctx, vector) {
		if (!vector || !vector.visible || !vector.paths || vector.paths.length === 0) return;

		ctx.save();
		ctx.globalAlpha = Math.max(0, Math.min(1, (vector.opacity ?? 100) / 100));

		this.draw_vector_path(ctx, vector);

		// Fill
		if (vector.fill && vector.fill !== 'none') {
			ctx.fillStyle = vector.fill;
			ctx.fill(vector.fill_rule || 'nonzero');
		}

		// Stroke
		if (vector.stroke && vector.stroke !== 'none' && (vector.stroke_width || 0) > 0) {
			ctx.strokeStyle = vector.stroke;
			ctx.lineWidth = vector.stroke_width;
			ctx.lineCap = vector.stroke_cap || 'round';
			ctx.lineJoin = vector.stroke_join || 'round';
			ctx.stroke();
		}

		ctx.restore();
	}

	/**
	 * Renders interactive vector overlays (path outline, anchor squares, handle circles, lines).
	 * Coordinates are transformed by zoomView.
	 * 
	 * @param {CanvasRenderingContext2D} ctx 
	 * @param {Object} options
	 * @param {import('./vector-model.js').Vector} options.vector - Selected vector
	 * @param {number|null} [options.active_subpath_index] - Active subpath index
	 * @param {number|null} [options.active_anchor_index] - Selected anchor index
	 * @param {Object|null} [options.hover_state] - { type: 'anchor'|'handle_in'|'handle_out'|'segment', subpath_idx, anchor_idx }
	 * @param {Object|null} [options.preview_anchor] - Live preview next anchor/handle for rubber band
	 * @param {boolean} [options.is_closing_hover] - True when hovering start point to close
	 */
	render_overlay(ctx, options = {}) {
		const {
			vector,
			active_subpath_index = null,
			active_anchor_index = null,
			selected_anchors = null,
			hover_state = null,
			preview_anchor = null,
			is_closing_hover = false,
		} = options;

		if (!vector || !vector.paths || vector.paths.length === 0) {
			// If we are currently starting a preview path with no committed subpaths yet
			if (preview_anchor && preview_anchor.start_point) {
				this._render_preview_segment(ctx, preview_anchor.start_point, preview_anchor);
			}
			return;
		}

		ctx.save();
		zoomView.apply();

		const zoom = config.ZOOM || 1;
		const anchorRadius = this.anchor_screen_radius / zoom;
		const handleRadius = this.handle_screen_radius / zoom;
		const strokeWidth = 1.2 / zoom;

		// 1. Draw Path Outline Guide
		ctx.save();
		ctx.lineWidth = strokeWidth;
		ctx.strokeStyle = '#0084ff';
		ctx.setLineDash([4 / zoom, 3 / zoom]);
		this.draw_vector_path(ctx, vector);
		ctx.stroke();
		ctx.restore();

		// 2. Draw live preview / rubber-band segment if drawing
		if (preview_anchor && active_subpath_index !== null) {
			const subpath = vector.paths[active_subpath_index];
			if (subpath && subpath.anchors.length > 0) {
				const lastAnchor = subpath.anchors[subpath.anchors.length - 1];
				this._render_preview_segment(ctx, lastAnchor, preview_anchor, zoom);
			}
		}

		// 3. Draw Subpaths anchors and handles
		for (let sIdx = 0; sIdx < vector.paths.length; sIdx++) {
			const subpath = vector.paths[sIdx];
			const isSubpathActive = (sIdx === active_subpath_index);

			for (let aIdx = 0; aIdx < subpath.anchors.length; aIdx++) {
				const anchor = subpath.anchors[aIdx];
				const isAnchorActive = (selected_anchors && selected_anchors.some(a => a.subpath_idx === sIdx && a.anchor_idx === aIdx)) ||
					(isSubpathActive && (aIdx === active_anchor_index));

				// Draw handles for selected or hovered anchor (or all if active subpath)
				const shouldShowHandles = isAnchorActive || (hover_state && hover_state.subpath_idx === sIdx && hover_state.anchor_idx === aIdx);

				if (shouldShowHandles) {
					this._draw_handles(ctx, anchor, handleRadius, strokeWidth, hover_state, sIdx, aIdx);
				}

				// Draw anchor square
				const isHovered = hover_state && hover_state.type === 'anchor' && hover_state.subpath_idx === sIdx && hover_state.anchor_idx === aIdx;
				this._draw_anchor_point(ctx, anchor.point, anchorRadius, strokeWidth, isAnchorActive, isHovered, (aIdx === 0 && is_closing_hover && isSubpathActive));
			}
		}

		ctx.restore();
	}

	_render_preview_segment(ctx, fromAnchor, preview, zoom = 1) {
		const fromPt = fromAnchor.point ? fromAnchor.point : fromAnchor;
		const toPt = preview.point;
		if (!toPt) return;

		ctx.save();
		ctx.lineWidth = 1.2 / zoom;
		ctx.strokeStyle = 'rgba(0, 132, 255, 0.75)';
		ctx.setLineDash([3 / zoom, 3 / zoom]);

		ctx.beginPath();
		ctx.moveTo(fromPt.x, fromPt.y);

		const cp1 = fromAnchor.handle_out || fromPt;
		const cp2 = preview.handle_in || toPt;

		if (fromAnchor.handle_out || preview.handle_in) {
			ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, toPt.x, toPt.y);
		} else {
			ctx.lineTo(toPt.x, toPt.y);
		}
		ctx.stroke();
		ctx.restore();
	}

	_draw_handles(ctx, anchor, radius, strokeWidth, hover_state, sIdx, aIdx) {
		const pt = anchor.point;

		// Handle In
		if (anchor.handle_in) {
			const hIn = anchor.handle_in;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(pt.x, pt.y);
			ctx.lineTo(hIn.x, hIn.y);
			ctx.strokeStyle = '#0084ff';
			ctx.lineWidth = strokeWidth;
			ctx.setLineDash([]);
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(hIn.x, hIn.y, radius, 0, Math.PI * 2);
			const isHover = hover_state && hover_state.type === 'handle_in' && hover_state.subpath_idx === sIdx && hover_state.anchor_idx === aIdx;
			ctx.fillStyle = isHover ? '#ff9900' : '#ffffff';
			ctx.fill();
			ctx.strokeStyle = '#0084ff';
			ctx.lineWidth = strokeWidth;
			ctx.stroke();
			ctx.restore();
		}

		// Handle Out
		if (anchor.handle_out) {
			const hOut = anchor.handle_out;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(pt.x, pt.y);
			ctx.lineTo(hOut.x, hOut.y);
			ctx.strokeStyle = '#0084ff';
			ctx.lineWidth = strokeWidth;
			ctx.setLineDash([]);
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(hOut.x, hOut.y, radius, 0, Math.PI * 2);
			const isHover = hover_state && hover_state.type === 'handle_out' && hover_state.subpath_idx === sIdx && hover_state.anchor_idx === aIdx;
			ctx.fillStyle = isHover ? '#ff9900' : '#ffffff';
			ctx.fill();
			ctx.strokeStyle = '#0084ff';
			ctx.lineWidth = strokeWidth;
			ctx.stroke();
			ctx.restore();
		}
	}

	_draw_anchor_point(ctx, pt, radius, strokeWidth, isActive, isHovered, isClosing = false) {
		ctx.save();
		ctx.beginPath();
		const size = radius * 2;
		ctx.rect(pt.x - radius, pt.y - radius, size, size);

		if (isClosing) {
			ctx.fillStyle = '#ffcc00';
			ctx.fill();
			ctx.strokeStyle = '#0044cc';
			ctx.lineWidth = strokeWidth * 2;
			ctx.stroke();
			// Draw small closing circle badge
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, radius * 1.8, 0, Math.PI * 2);
			ctx.strokeStyle = '#ff9900';
			ctx.stroke();
		} else if (isActive) {
			ctx.fillStyle = '#0084ff';
			ctx.fill();
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = strokeWidth * 1.5;
			ctx.stroke();
		} else if (isHovered) {
			ctx.fillStyle = '#ff9900';
			ctx.fill();
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = strokeWidth * 1.5;
			ctx.stroke();
		} else {
			ctx.fillStyle = '#ffffff';
			ctx.fill();
			ctx.strokeStyle = '#0084ff';
			ctx.lineWidth = strokeWidth;
			ctx.stroke();
		}
		ctx.restore();
	}
}

export default new Vector_renderer_class();
