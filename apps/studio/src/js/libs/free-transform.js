import { quad_matrix, inverse_matrix, map_point } from './quad-transform.js';
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
	if (b.transform_quad) {
		const q=b.transform_quad;
		const positions={tl:q[0],tr:q[1],br:q[2],bl:q[3],tc:{x:(q[0].x+q[1].x)/2,y:(q[0].y+q[1].y)/2},mr:{x:(q[1].x+q[2].x)/2,y:(q[1].y+q[2].y)/2},bc:{x:(q[2].x+q[3].x)/2,y:(q[2].y+q[3].y)/2},ml:{x:(q[3].x+q[0].x)/2,y:(q[3].y+q[0].y)/2},c:map_point(quad_matrix(q),{x:.5,y:.5})};
		const p=positions[locator]||positions.c;
		lx=b.x+p.x*b.width;ly=b.y+p.y*b.height;
	}
	const angle = ((b.rotate || 0) * Math.PI) / 180;
	const dx0 = lx - cx;
	const dy0 = ly - cy;
	const dx = dx0 + Math.tan((b.skew_x || 0) * Math.PI / 180) * dy0;
	const dy = dy0 + Math.tan((b.skew_y || 0) * Math.PI / 180) * dx0;
	return {
		x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
		y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
	};
}


/**
 * Scales a box about a reference point with scale factors sx and sy.
 */
export function scale_about(box, ref, sx, sy) {
	ref = ref || ref_point(box);
	const point = local_point(box, ref);
	const m = axes(box);
	const width = box.width * sx, height = box.height * sy;
	return { ...box, width, height,
		x: ref.x - m[0] * point.x * sx - m[2] * point.y * sy - width / 2,
		y: ref.y - m[1] * point.x * sx - m[3] * point.y * sy - height / 2 };

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

	const new_rot = (((box.rotate || 0) + deg) % 360 + 360) % 360;

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
	let initial_skew_x = (box && box.skew_x) || 0;
	let initial_skew_y = (box && box.skew_y) || 0;
	const w = (box && box.width) || 1;
	const h = (box && box.height) || 1;

	let skew_x = initial_skew_x;
	let skew_y = initial_skew_y;

	if (side === 'top' || side === 'tc') {
		const delta = (Math.atan(Math.tan(initial_skew_x * Math.PI / 180) - dx / h) * 180) / Math.PI;
		skew_x = Math.round(delta * 10) / 10;
	} else if (side === 'bottom' || side === 'bc') {
		const delta = (Math.atan(Math.tan(initial_skew_x * Math.PI / 180) + dx / h) * 180) / Math.PI;
		skew_x = Math.round(delta * 10) / 10;
	} else if (side === 'left' || side === 'ml') {
		const delta = (Math.atan(Math.tan(initial_skew_y * Math.PI / 180) - dy / w) * 180) / Math.PI;
		skew_y = Math.round(delta * 10) / 10;
	} else if (side === 'right' || side === 'mr') {
		const delta = (Math.atan(Math.tan(initial_skew_y * Math.PI / 180) + dy / w) * 180) / Math.PI;
		skew_y = Math.round(delta * 10) / 10;
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
	const layerSnapshots = list.map(snapshot_transform_layer);

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
			transform_quad: list[0].transform_quad ? list[0].transform_quad.map(p=>({...p})) : undefined,
		};
	} else if (list.length > 1) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const l of list) {
			for (const locator of ['tl', 'tr', 'bl', 'br']) {
				const point = ref_point(l, locator);
				minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
				maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
			}
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

	for (const layer of layers || []) {
		const snapshot = snapMap.get(layer.id);
		if (!snapshot) continue;
		for (const key of TRANSFORM_FIELDS) {
			if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
				layer[key] = clone_transform_value(key, snapshot[key]);
			} else {
				delete layer[key];
			}
		}
	}

	if (session.snapshot.box) {
		session.box = { ...session.snapshot.box };
	}
}


export const TRANSFORM_FIELDS = ['x', 'y', 'width', 'height', 'rotate', 'skew_x', 'skew_y', 'params', 'data', 'mask', 'transform_quad'];
function clone_transform_value(key, value) {
	// Mask bitmap/canvas references must retain their identity.
	if (key === 'mask') return value ? { ...value } : value;
	if ((key === 'params' || key === 'data' || key === 'vector_paths' || key === 'transform_quad') && value && typeof value === 'object') return JSON.parse(JSON.stringify(value));
	return value;
}
export function snapshot_transform_layer(layer) {
	const snapshot = { id: layer.id };
	for (const key of TRANSFORM_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(layer, key)) snapshot[key] = clone_transform_value(key, layer[key]);
	}
	return snapshot;
}

/** Convert a document point into coordinates relative to the untransformed center. */
export function local_point(box, point) {
	const r = (box.rotate || 0) * Math.PI / 180;
	const dx = point.x - box.x - box.width / 2, dy = point.y - box.y - box.height / 2;
	const x = dx * Math.cos(r) + dy * Math.sin(r), y = -dx * Math.sin(r) + dy * Math.cos(r);
	const sx = Math.tan((box.skew_x || 0) * Math.PI / 180), sy = Math.tan((box.skew_y || 0) * Math.PI / 180);
	const det = 1 - sx * sy;
	return { x: (x - sx * y) / det, y: (y - sy * x) / det };
}

/** Resize in the box's local axes, keeping the opposite handle or custom pivot fixed. */
export function resize_from_drag(box, handle, start, point, proportional, pivot) {
	const a = local_point(box, start), b = local_point(box, point);
	const left = (handle & 4) !== 0, right = (handle & 8) !== 0;
	const top = (handle & 1) !== 0, bottom = (handle & 2) !== 0;
	const locator = (top ? 'b' : bottom ? 't' : 'm') + (left ? 'r' : right ? 'l' : 'c');
	const ref = pivot || ref_point(box, locator === 'mc' ? 'c' : locator);
	const localRef = local_point(box, ref);
	const xDen = (left ? -box.width / 2 : box.width / 2) - localRef.x;
	const yDen = (top ? -box.height / 2 : box.height / 2) - localRef.y;
	let sx = left || right ? 1 + (b.x - a.x) / xDen : 1;
	let sy = top || bottom ? 1 + (b.y - a.y) / yDen : 1;
	if (proportional) {
		const scale = !left && !right ? sy : !top && !bottom ? sx : Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
		sx = sy = scale;
	}
	sx = Math.max(1 / box.width, sx); sy = Math.max(1 / box.height, sy);
	const result = { ...box, width: box.width * sx, height: box.height * sy };
	// Keeping a fixed locator also accounts for existing skew.
	const u = (localRef.x / box.width) + 0.5, v = (localRef.y / box.height) + 0.5;
	const dx = (u - 0.5) * result.width, dy = (v - 0.5) * result.height;
	const skx = Math.tan((box.skew_x || 0) * Math.PI / 180), sky = Math.tan((box.skew_y || 0) * Math.PI / 180);
	const r = (box.rotate || 0) * Math.PI / 180;
	const tx = dx + skx * dy, ty = dy + sky * dx;
	result.x = ref.x - tx * Math.cos(r) + ty * Math.sin(r) - result.width / 2;
	result.y = ref.y - tx * Math.sin(r) - ty * Math.cos(r) - result.height / 2;
	return result;
}

function axes(box) {
	const r = (box.rotate || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
	const x = Math.tan((box.skew_x || 0) * Math.PI / 180), y = Math.tan((box.skew_y || 0) * Math.PI / 180);
	return [c - s * y, s + c * y, c * x - s, s * x + c];
}
function multiply(a, b) {
	return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3]];
}
/** Apply a common affine box change to a layer, including rotated multi-selections. */
export function transform_layer_geometry(layer, from, to) {
	if(['x','y','width','height','rotate','skew_x','skew_y'].every(k=>(from[k]||0)===(to[k]||0)) && JSON.stringify(from.transform_quad)===JSON.stringify(to.transform_quad)) return {...layer};
	if (from.transform_quad || to.transform_quad) {
		const locators=['tl','tr','br','bl'];
		const source=inverse_matrix(quad_matrix(locators.map(loc=>ref_point(from,loc))));
		const destination=quad_matrix(locators.map(loc=>ref_point(to,loc)));
		const cleanFrom={...from,transform_quad:undefined},cleanTo={...to,transform_quad:undefined};
		const next=transform_layer_geometry({...layer,transform_quad:undefined},cleanFrom,cleanTo);
		next.transform_quad=locators.map(loc=>{
			const p=map_point(destination,map_point(source,ref_point(layer,loc)));
			const local=local_point(next,p);
			return {x:local.x/next.width+.5,y:local.y/next.height+.5};
		});
		return next;
	}
	if (['x','y','width','height','rotate','skew_x','skew_y'].every(k => (from[k] || 0) === (to[k] || 0))) return { ...layer };
	const a = axes(from), b = axes(to), det = a[0]*a[3]-a[1]*a[2];
	const sx = to.width / from.width, sy = to.height / from.height;
	const map = multiply([b[0]*sx,b[1]*sx,b[2]*sy,b[3]*sy], [a[3]/det,-a[1]/det,-a[2]/det,a[0]/det]);
	const dx = layer.x + layer.width/2 - from.x - from.width/2;
	const dy = layer.y + layer.height/2 - from.y - from.height/2;
	const cx = to.x + to.width/2 + map[0]*dx + map[2]*dy;
	const cy = to.y + to.height/2 + map[1]*dx + map[3]*dy;
	// Aligned axes preserve both skew fields and the requested angle exactly.
	if ((layer.rotate || 0) === (from.rotate || 0) && (layer.skew_x || 0) === (from.skew_x || 0) && (layer.skew_y || 0) === (from.skew_y || 0)) {
		const width = layer.width*sx, height = layer.height*sy;
		return { ...layer, x: cx-width/2, y: cy-height/2, width, height, rotate: to.rotate || 0, skew_x: to.skew_x || 0, skew_y: to.skew_y || 0 };
	}
	const m = multiply(map, axes(layer));
	const scaleX = Math.hypot(m[0],m[1]);
	const scaleY = (m[0]*m[3]-m[1]*m[2])/scaleX;
	const width = layer.width*scaleX, height = layer.height*scaleY;
	return { ...layer, x: cx-width/2, y: cy-height/2, width, height,
		rotate: Math.atan2(m[1],m[0])*180/Math.PI,
		skew_x: Math.atan((m[0]*m[2]+m[1]*m[3])/(scaleX*scaleY))*180/Math.PI, skew_y: 0 };
}
