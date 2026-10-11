/**
 * Pure math and session state for Free Transform (Edit ▸ Free Transform).
 * No app or DOM dependencies.
 */

/**
 * Returns the coordinates of the reference point on the box.
 * Locator can be 'tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br'.
 */
export function ref_point(box, locator = 'c') {
	const b = box || { x: 0, y: 0, width: 0, height: 0 };
	const cx = (b.x || 0) + (b.width || 0) / 2;
	const cy = (b.y || 0) + (b.height || 0) / 2;
	let lx, ly;
	switch (locator) {
		case 'tl': lx = b.x || 0; ly = b.y || 0; break;
		case 'tc': lx = cx; ly = b.y || 0; break;
		case 'tr': lx = (b.x || 0) + (b.width || 0); ly = b.y || 0; break;
		case 'ml': lx = b.x || 0; ly = cy; break;
		case 'c':  lx = cx; ly = cy; break;
		case 'mr': lx = (b.x || 0) + (b.width || 0); ly = cy; break;
		case 'bl': lx = b.x || 0; ly = (b.y || 0) + (b.height || 0); break;
		case 'bc': lx = cx; ly = (b.y || 0) + (b.height || 0); break;
		case 'br': lx = (b.x || 0) + (b.width || 0); ly = (b.y || 0) + (b.height || 0); break;
		default:   lx = cx; ly = cy; break;
	}
	const angle = ((b.rotate || 0) * Math.PI) / 180;
	if (!angle) {
		return { x: lx, y: ly };
	}
	const dx = lx - cx;
	const dy = ly - cy;
	return {
		x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
		y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
	};
}


/**
 * Scales a box about a reference point with scale factors sx and sy.
 */
export function scale_about(box, ref, sx, sy) {
	const new_w = (box.width || 0) * sx;
	const new_h = (box.height || 0) * sy;
	const angle = ((box.rotate || 0) * Math.PI) / 180;

	const cx = (box.x || 0) + (box.width || 0) / 2;
	const cy = (box.y || 0) + (box.height || 0) / 2;
	const rx = ref.x !== undefined ? ref.x : cx;
	const ry = ref.y !== undefined ? ref.y : cy;

	// Vector from ref to center
	const vx = cx - rx;
	const vy = cy - ry;

	let new_cx, new_cy;
	if (!angle) {
		new_cx = rx + vx * sx;
		new_cy = ry + vy * sy;
	} else {
		// Rotate v into local box space, scale, and rotate back
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const local_vx = vx * cos + vy * sin;
		const local_vy = -vx * sin + vy * cos;
		const scaled_vx = local_vx * sx;
		const scaled_vy = local_vy * sy;
		new_cx = rx + scaled_vx * cos - scaled_vy * sin;
		new_cy = ry + scaled_vx * sin + scaled_vy * cos;
	}

	return {
		...box,
		x: new_cx - new_w / 2,
		y: new_cy - new_h / 2,
		width: new_w,
		height: new_h,
	};
}

/**
 * Rotates a box about a reference point by delta degrees.
 */
export function rotate_about(box, ref, deg) {
	const rad = (deg * Math.PI) / 180;
	const cx = (box.x || 0) + (box.width || 0) / 2;
	const cy = (box.y || 0) + (box.height || 0) / 2;
	const rx = ref.x !== undefined ? ref.x : cx;
	const ry = ref.y !== undefined ? ref.y : cy;

	const dx = cx - rx;
	const dy = cy - ry;

	const new_cx = rx + dx * Math.cos(rad) - dy * Math.sin(rad);
	const new_cy = ry + dx * Math.sin(rad) + dy * Math.cos(rad);

	const new_rot = Math.round((((box.rotate || 0) + deg) % 360 + 360) % 360);

	return {
		...box,
		x: new_cx - (box.width || 0) / 2,
		y: new_cy - (box.height || 0) / 2,
		rotate: new_rot,
	};
}

/**
 * Snaps angle in degrees to nearest step (default 15°).
 */
export function snap_angle(deg, step = 15) {
	return Math.round(deg / step) * step;
}

/**
 * Calculates skew angles from dragging a side handle.
 * side: 'top' | 'bottom' | 'left' | 'right' (or 'tc', 'bc', 'ml', 'mr').
 */
export function skew_from_drag(side, dx, dy, box) {
	let skew_x = box.skew_x || 0;
	let skew_y = box.skew_y || 0;
	const w = box.width || 1;
	const h = box.height || 1;

	if (side === 'top' || side === 'tc') {
		const deg = (Math.atan2(-dx, h) * 180) / Math.PI;
		skew_x = Math.round(deg * 10) / 10;
	} else if (side === 'bottom' || side === 'bc') {
		const deg = (Math.atan2(dx, h) * 180) / Math.PI;
		skew_x = Math.round(deg * 10) / 10;
	} else if (side === 'left' || side === 'ml') {
		const deg = (Math.atan2(-dy, w) * 180) / Math.PI;
		skew_y = Math.round(deg * 10) / 10;
	} else if (side === 'right' || side === 'mr') {
		const deg = (Math.atan2(dy, w) * 180) / Math.PI;
		skew_y = Math.round(deg * 10) / 10;
	}

	return { skew_x, skew_y };
}

/**
 * Applies numeric parameters to box:
 * { x, y, wPct, hPct, angle, skewX, skewY }
 * ref: locator string ('tl'..'br', 'c') or point { x, y }
 */
export function apply_numeric(box, params = {}, ref = 'c') {
	let res = { ...box };
	const rPoint = typeof ref === 'string' ? ref_point(res, ref) : (ref || ref_point(res, 'c'));

	// Scaling
	if (params.wPct !== undefined || params.hPct !== undefined) {
		const sx = params.wPct !== undefined ? params.wPct / 100 : 1;
		const sy = params.hPct !== undefined ? params.hPct / 100 : 1;
		res = scale_about(res, rPoint, sx, sy);
	}

	// Rotation
	if (params.angle !== undefined) {
		const delta = params.angle - (res.rotate || 0);
		if (delta !== 0) {
			res = rotate_about(res, rPoint, delta);
		}
	}

	// Skew
	if (params.skewX !== undefined) res.skew_x = params.skewX;
	if (params.skewY !== undefined) res.skew_y = params.skewY;

	// Position
	if (params.x !== undefined || params.y !== undefined) {
		const curRef = typeof ref === 'string' ? ref_point(res, ref) : rPoint;
		const shiftX = params.x !== undefined ? params.x - curRef.x : 0;
		const shiftY = params.y !== undefined ? params.y - curRef.y : 0;
		res.x = (res.x || 0) + shiftX;
		res.y = (res.y || 0) + shiftY;
	}

	return res;
}

/**
 * Pure session snapshot and restore helpers.
 */
export function create_transform_session(layers) {
	const list = (layers || []).filter(Boolean);
	const layerSnapshots = list.map((l) => ({
		id: l.id,
		x: l.x,
		y: l.y,
		width: l.width,
		height: l.height,
		rotate: l.rotate || 0,
		skew_x: l.skew_x || 0,
		skew_y: l.skew_y || 0,
		params: l.params ? JSON.parse(JSON.stringify(l.params)) : null,
		mask: l.mask ? JSON.parse(JSON.stringify(l.mask)) : null,
	}));

	let box;
	if (list.length === 1) {
		box = {
			x: list[0].x,
			y: list[0].y,
			width: list[0].width,
			height: list[0].height,
			rotate: list[0].rotate || 0,
			skew_x: list[0].skew_x || 0,
			skew_y: list[0].skew_y || 0,
		};
	} else if (list.length > 1) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const l of list) {
			minX = Math.min(minX, l.x);
			minY = Math.min(minY, l.y);
			maxX = Math.max(maxX, l.x + l.width);
			maxY = Math.max(maxY, l.y + l.height);
		}
		box = {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY,
			rotate: 0,
			skew_x: 0,
			skew_y: 0,
		};
	} else {
		box = { x: 0, y: 0, width: 0, height: 0, rotate: 0, skew_x: 0, skew_y: 0 };
	}

	return {
		active: true,
		box: { ...box },
		snapshot: {
			box: { ...box },
			layers: layerSnapshots,
		},
		reference_locator: 'c',
		locator: 'c',
		reference_point: null,
		aspect_locked: true,
	};
}

export function restore_transform_session(session, layers) {
	if (!session || !session.snapshot) return;
	const layerSnaps = session.snapshot.layers || (Array.isArray(session.snapshot) ? session.snapshot : []);
	const snapMap = new Map(layerSnaps.map((s) => [s.id, s]));

	let targetLayers = layers;
	if (!targetLayers && typeof app !== 'undefined' && app.Layers && typeof app.Layers.get_layer === 'function') {
		targetLayers = layerSnaps.map(s => app.Layers.get_layer(s.id, true)).filter(Boolean);
	}
	if (!targetLayers && Array.isArray(layers)) {
		targetLayers = layers;
	}
	if (targetLayers) {
		for (const l of targetLayers) {
			const s = snapMap.get(l.id);
			if (!s) continue;
			l.x = s.x;
			l.y = s.y;
			l.width = s.width;
			l.height = s.height;
			l.rotate = s.rotate;
			l.skew_x = s.skew_x;
			l.skew_y = s.skew_y;
			if (s.params) l.params = JSON.parse(JSON.stringify(s.params));
			if (s.mask) l.mask = JSON.parse(JSON.stringify(s.mask));
		}
	}
	if (session.snapshot.box) {
		session.box = { ...session.snapshot.box };
	}
}

