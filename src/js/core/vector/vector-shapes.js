/**
 * Vector Shape Generators for Visteras
 * 
 * Generates true Bézier Subpaths and Vector objects for standard shapes:
 * - Rectangles & Rounded Rectangles (4 or 8 editable Bézier anchors)
 * - Ellipses & Circles (4 cubic Bézier anchors with smooth tangent handles)
 * - Lines (2 editable anchor endpoints)
 * - Polygons & Stars
 * - Custom parametric shapes (Triangles, Arrows, Hearts, etc.)
 */

import { Vector, Subpath, Anchor } from './vector-model.js';

const KAPPA = 0.5522847498307936; // 4/3 * (sqrt(2) - 1) for cubic Bézier circles/arcs

/**
 * Generates a rectangle Subpath.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [radius=0]
 * @returns {Subpath}
 */
export function create_rectangle_subpath(x, y, width, height, radius = 0) {
	width = Math.max(0, width);
	height = Math.max(0, height);
	radius = Math.max(0, Math.min(radius, width / 2, height / 2));

	if (radius <= 0) {
		const anchors = [
			new Anchor({ point: { x: x, y: y }, type: 'corner' }),
			new Anchor({ point: { x: x + width, y: y }, type: 'corner' }),
			new Anchor({ point: { x: x + width, y: y + height }, type: 'corner' }),
			new Anchor({ point: { x: x, y: y + height }, type: 'corner' }),
		];
		return new Subpath({ closed: true, anchors });
	}

	// Rounded rectangle (8 anchors with Bézier arcs)
	const k = radius * KAPPA;
	const anchors = [
		// Top edge (left to right)
		new Anchor({
			point: { x: x + radius, y: y },
			handle_in: { x: x + radius - k, y: y },
			handle_out: null,
			type: 'corner'
		}),
		new Anchor({
			point: { x: x + width - radius, y: y },
			handle_in: null,
			handle_out: { x: x + width - radius + k, y: y },
			type: 'corner'
		}),
		// Right edge (top to bottom)
		new Anchor({
			point: { x: x + width, y: y + radius },
			handle_in: { x: x + width, y: y + radius - k },
			handle_out: null,
			type: 'corner'
		}),
		new Anchor({
			point: { x: x + width, y: y + height - radius },
			handle_in: null,
			handle_out: { x: x + width, y: y + height - radius + k },
			type: 'corner'
		}),
		// Bottom edge (right to left)
		new Anchor({
			point: { x: x + width - radius, y: y + height },
			handle_in: { x: x + width - radius + k, y: y + height },
			handle_out: null,
			type: 'corner'
		}),
		new Anchor({
			point: { x: x + radius, y: y + height },
			handle_in: null,
			handle_out: { x: x + radius - k, y: y + height },
			type: 'corner'
		}),
		// Left edge (bottom to top)
		new Anchor({
			point: { x: x, y: y + height - radius },
			handle_in: { x: x, y: y + height - radius + k },
			handle_out: null,
			type: 'corner'
		}),
		new Anchor({
			point: { x: x, y: y + radius },
			handle_in: null,
			handle_out: { x: x, y: y + radius - k },
			type: 'corner'
		}),
	];

	return new Subpath({ closed: true, anchors });
}

/**
 * Generates an ellipse Subpath with 4 smooth Bézier anchors.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Subpath}
 */
export function create_ellipse_subpath(x, y, width, height) {
	width = Math.max(0, width);
	height = Math.max(0, height);

	const rx = width / 2;
	const ry = height / 2;
	const cx = x + rx;
	const cy = y + ry;

	const kx = rx * KAPPA;
	const ky = ry * KAPPA;

	const anchors = [
		// Top anchor
		new Anchor({
			point: { x: cx, y: cy - ry },
			handle_in: { x: cx - kx, y: cy - ry },
			handle_out: { x: cx + kx, y: cy - ry },
			type: 'smooth'
		}),
		// Right anchor
		new Anchor({
			point: { x: cx + rx, y: cy },
			handle_in: { x: cx + rx, y: cy - ky },
			handle_out: { x: cx + rx, y: cy + ky },
			type: 'smooth'
		}),
		// Bottom anchor
		new Anchor({
			point: { x: cx, y: cy + ry },
			handle_in: { x: cx + kx, y: cy + ry },
			handle_out: { x: cx - kx, y: cy + ry },
			type: 'smooth'
		}),
		// Left anchor
		new Anchor({
			point: { x: cx - rx, y: cy },
			handle_in: { x: cx - rx, y: cy + ky },
			handle_out: { x: cx - rx, y: cy - ky },
			type: 'smooth'
		}),
	];

	return new Subpath({ closed: true, anchors });
}

/**
 * Generates a line Subpath with 2 endpoints.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {Subpath}
 */
export function create_line_subpath(x1, y1, x2, y2) {
	const anchors = [
		new Anchor({ point: { x: x1, y: y1 }, type: 'corner' }),
		new Anchor({ point: { x: x2, y: y2 }, type: 'corner' }),
	];
	return new Subpath({ closed: false, anchors });
}

/**
 * Generates a regular polygon Subpath.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [sides=5]
 * @returns {Subpath}
 */
export function create_polygon_subpath(x, y, width, height, sides = 5) {
	sides = Math.max(3, sides || 5);
	const rx = width / 2;
	const ry = height / 2;
	const cx = x + rx;
	const cy = y + ry;

	const anchors = [];
	for (let i = 0; i < sides; i++) {
		const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
		anchors.push(new Anchor({
			point: {
				x: cx + rx * Math.cos(angle),
				y: cy + ry * Math.sin(angle)
			},
			type: 'corner'
		}));
	}

	return new Subpath({ closed: true, anchors });
}

/**
 * Generates a star Subpath.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [corners=5]
 * @param {number} [innerRadiusRatio=0.4]
 * @returns {Subpath}
 */
export function create_star_subpath(x, y, width, height, corners = 5, innerRadiusRatio = 0.4) {
	corners = Math.max(3, corners || 5);
	const rx = width / 2;
	const ry = height / 2;
	const cx = x + rx;
	const cy = y + ry;
	const inRx = rx * Math.max(0.05, Math.min(0.95, innerRadiusRatio));
	const inRy = ry * Math.max(0.05, Math.min(0.95, innerRadiusRatio));

	const totalPoints = corners * 2;
	const anchors = [];

	for (let i = 0; i < totalPoints; i++) {
		const angle = -Math.PI / 2 + (i * Math.PI) / corners;
		const isOuter = (i % 2 === 0);
		const curRx = isOuter ? rx : inRx;
		const curRy = isOuter ? ry : inRy;

		anchors.push(new Anchor({
			point: {
				x: cx + curRx * Math.cos(angle),
				y: cy + curRy * Math.sin(angle)
			},
			type: 'corner'
		}));
	}

	return new Subpath({ closed: true, anchors });
}

/**
 * Generates a heart Subpath with 4 Bézier anchors.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Subpath}
 */
export function create_heart_subpath(x, y, width, height) {
	const cx = x + width / 2;
	const anchors = [
		new Anchor({
			point: { x: cx, y: y + height * 0.2 },
			handle_in: { x: x + (9 / 14) * width, y: y },
			handle_out: { x: x + (5 / 14) * width, y: y },
			type: 'corner'
		}),
		new Anchor({
			point: { x: x + (1 / 28) * width, y: y + 0.4 * height },
			handle_in: { x: x, y: y + height / 15 },
			handle_out: { x: x + (1 / 14) * width, y: y + (2 / 3) * height },
			type: 'smooth'
		}),
		new Anchor({
			point: { x: cx, y: y + height },
			handle_in: { x: x + (3 / 7) * width, y: y + (5 / 6) * height },
			handle_out: { x: x + (4 / 7) * width, y: y + (5 / 6) * height },
			type: 'corner'
		}),
		new Anchor({
			point: { x: x + (27 / 28) * width, y: y + 0.4 * height },
			handle_in: { x: x + (13 / 14) * width, y: y + (2 / 3) * height },
			handle_out: { x: x + width, y: y + height / 15 },
			type: 'smooth'
		}),
	];
	return new Subpath({ closed: true, anchors });
}

/**
 * Generates a gear / cog Subpath with N teeth.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [teeth=8]
 * @returns {Subpath}
 */
export function create_gear_subpath(x, y, width, height, teeth = 8) {
	teeth = Math.max(4, teeth || 8);
	const rx = width / 2;
	const ry = height / 2;
	const cx = x + rx;
	const cy = y + ry;

	const outRx = rx;
	const outRy = ry;
	const rootRx = rx * 0.72;
	const rootRy = ry * 0.72;

	const anchors = [];
	const angleStep = (Math.PI * 2) / teeth;

	for (let i = 0; i < teeth; i++) {
		const baseAngle = -Math.PI / 2 + i * angleStep;

		// 1. Root start
		const a1 = baseAngle - angleStep * 0.32;
		anchors.push(new Anchor({
			point: { x: cx + rootRx * Math.cos(a1), y: cy + rootRy * Math.sin(a1) },
			type: 'corner'
		}));

		// 2. Tooth crest start
		const a2 = baseAngle - angleStep * 0.16;
		anchors.push(new Anchor({
			point: { x: cx + outRx * Math.cos(a2), y: cy + outRy * Math.sin(a2) },
			type: 'corner'
		}));

		// 3. Tooth crest end
		const a3 = baseAngle + angleStep * 0.16;
		anchors.push(new Anchor({
			point: { x: cx + outRx * Math.cos(a3), y: cy + outRy * Math.sin(a3) },
			type: 'corner'
		}));

		// 4. Root end
		const a4 = baseAngle + angleStep * 0.32;
		anchors.push(new Anchor({
			point: { x: cx + rootRx * Math.cos(a4), y: cy + rootRy * Math.sin(a4) },
			type: 'corner'
		}));
	}

	return new Subpath({ closed: true, anchors });
}

/**
 * Generates a teardrop / water drop Subpath.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Subpath}
 */
export function create_tear_subpath(x, y, width, height) {
	const cx = x + width / 2;
	const rx = width / 2;
	const ry = height / 2;
	const anchors = [
		new Anchor({
			point: { x: cx, y: y },
			handle_in: { x: cx + rx * 0.35, y: y + height * 0.35 },
			handle_out: { x: cx - rx * 0.35, y: y + height * 0.35 },
			type: 'corner'
		}),
		new Anchor({
			point: { x: x, y: y + height * 0.65 },
			handle_in: { x: x, y: y + height * 0.45 },
			handle_out: { x: x, y: y + height * 0.85 },
			type: 'smooth'
		}),
		new Anchor({
			point: { x: cx, y: y + height },
			handle_in: { x: cx - rx * 0.55, y: y + height },
			handle_out: { x: cx + rx * 0.55, y: y + height },
			type: 'smooth'
		}),
		new Anchor({
			point: { x: x + width, y: y + height * 0.65 },
			handle_in: { x: x + width, y: y + height * 0.85 },
			handle_out: { x: x + width, y: y + height * 0.45 },
			type: 'smooth'
		}),
	];
	return new Subpath({ closed: true, anchors });
}

/**
 * Standard coords dictionary for custom polygonal shapes in [0..100] box.
 */
export const CUSTOM_SHAPES_COORDS = {
	'triangle': [[50, 0], [100, 100], [0, 100]],
	'right triangle': [[0, 0], [100, 100], [0, 100]],
	'right_triangle': [[0, 0], [100, 100], [0, 100]],
	'diamond': [[50, 0], [100, 50], [50, 100], [0, 50]],
	'romb': [[50, 0], [100, 50], [50, 100], [0, 50]],
	'trapezoid': [[20, 0], [80, 0], [100, 100], [0, 100]],
	'parallelogram': [[25, 0], [100, 0], [75, 100], [0, 100]],
	'arrow': [[0, 35], [55, 35], [55, 10], [100, 50], [55, 90], [55, 65], [0, 65]],
	'plus': [[35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35]],
	'speech bubble': [[0, 0], [100, 0], [100, 60], [60, 60], [15, 100], [40, 60], [0, 60]],
	'callout': [[0, 0], [100, 0], [100, 60], [60, 60], [15, 100], [40, 60], [0, 60]],
	'cylinder': [[15, 15], [85, 15], [85, 85], [50, 100], [15, 85]],
	'human': [
		[45, 0], [55, 0], [60, 5], [60, 15], [55, 20], [45, 20], [40, 15], [40, 5],
		[45, 22], [70, 26], [85, 50], [78, 55], [68, 38], [68, 65], [72, 100], [60, 100],
		[54, 68], [46, 68], [40, 100], [28, 100], [32, 65], [32, 38], [22, 55], [15, 50],
		[30, 26], [55, 22]
	],
};

/**
 * Generates a custom shape Subpath by name.
 * @param {string} shapeName
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Subpath}
 */
export function create_custom_shape_subpath(shapeName, x, y, width, height) {
	let key = '';
	if (shapeName != null && typeof shapeName === 'object') {
		key = String(shapeName.value || shapeName.shape || shapeName.title || '').trim().toLowerCase();
	} else {
		key = String(shapeName || 'heart').trim().toLowerCase();
	}

	if (!key || key === 'heart') {
		return create_heart_subpath(x, y, width, height);
	}
	if (key === 'gear' || key === 'cog') {
		return create_gear_subpath(x, y, width, height, 8);
	}
	if (key === 'water drop' || key === 'water_drop' || key === 'tear') {
		return create_tear_subpath(x, y, width, height);
	}
	if (key === 'star') {
		return create_star_subpath(x, y, width, height, 5, 0.4);
	}
	if (key === 'pentagon') {
		return create_polygon_subpath(x, y, width, height, 5);
	}
	if (key === 'hexagon') {
		return create_polygon_subpath(x, y, width, height, 6);
	}
	if (key === 'moon' || key === 'crescent moon') {
		// Crescent moon Bézier subpath
		const rx = width / 2;
		const ry = height / 2;
		const cx = x + rx;
		const cy = y + ry;
		const anchors = [
			new Anchor({
				point: { x: cx + rx * 0.02, y: cy },
				handle_in: { x: cx + rx * 0.02, y: cy - ry * 0.43 },
				handle_out: { x: cx + rx * 0.02, y: cy + ry * 0.43 },
				type: 'smooth'
			}),
			new Anchor({
				point: { x: x + width, y: y + height * 0.94 },
				handle_in: { x: cx + rx * 0.43, y: y + height * 0.8 },
				handle_out: { x: cx + rx * 0.67, y: y + height * 0.98 },
				type: 'corner'
			}),
			new Anchor({
				point: { x: x, y: cy },
				handle_in: { x: x, y: y + height },
				handle_out: { x: x, y: y },
				type: 'smooth'
			}),
			new Anchor({
				point: { x: x + width, y: y + height * 0.06 },
				handle_in: { x: cx + rx * 0.67, y: y + height * 0.02 },
				handle_out: { x: cx + rx * 0.43, y: y + height * 0.2 },
				type: 'corner'
			}),
		];
		return new Subpath({ closed: true, anchors });
	}

	const coords = CUSTOM_SHAPES_COORDS[key] || CUSTOM_SHAPES_COORDS['triangle'];
	return create_coords_subpath(x, y, width, height, coords);
}

/**
 * Generates a subpath from a normalized [0..100] coordinate array.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {Array<[number, number]>} coords
 * @param {boolean} [closed=true]
 * @returns {Subpath}
 */
export function create_coords_subpath(x, y, width, height, coords, closed = true) {
	if (!coords || coords.length === 0) return new Subpath({ closed: true, anchors: [] });

	const anchors = [];
	for (const pt of coords) {
		if (!pt || pt.length < 2) continue;
		anchors.push(new Anchor({
			point: {
				x: x + (pt[0] / 100) * width,
				y: y + (pt[1] / 100) * height
			},
			type: 'corner'
		}));
	}

	return new Subpath({ closed: closed !== false, anchors });
}

