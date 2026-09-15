/**
 * Vector System Data Model for Visteras
 * 
 * Represents true geometric vector data (Vector -> Subpaths -> Anchors -> Control Handles).
 * Operates strictly in unscaled document coordinates.
 */

export class Anchor {
	/**
	 * @param {Object} options
	 * @param {{x: number, y: number}} options.point - Anchor position in document coords
	 * @param {{x: number, y: number}|null} [options.handle_in] - Incoming Bézier handle
	 * @param {{x: number, y: number}|null} [options.handle_out] - Outgoing Bézier handle
	 * @param {'corner'|'smooth'|'symmetric'} [options.type] - Anchor point type
	 */
	constructor(options = {}) {
		this.point = options.point ? { x: Number(options.point.x), y: Number(options.point.y) } : { x: 0, y: 0 };
		this.handle_in = options.handle_in ? { x: Number(options.handle_in.x), y: Number(options.handle_in.y) } : null;
		this.handle_out = options.handle_out ? { x: Number(options.handle_out.x), y: Number(options.handle_out.y) } : null;
		this.type = options.type || 'corner';
	}

	translate(dx, dy) {
		if (dx === 0 && dy === 0) return;
		this.point.x += dx;
		this.point.y += dy;
		if (this.handle_in) {
			this.handle_in.x += dx;
			this.handle_in.y += dy;
		}
		if (this.handle_out) {
			this.handle_out.x += dx;
			this.handle_out.y += dy;
		}
	}

	clone() {
		return new Anchor({
			point: { ...this.point },
			handle_in: this.handle_in ? { ...this.handle_in } : null,
			handle_out: this.handle_out ? { ...this.handle_out } : null,
			type: this.type
		});
	}

	toJSON() {
		return {
			point: { x: this.point.x, y: this.point.y },
			handle_in: this.handle_in ? { x: this.handle_in.x, y: this.handle_in.y } : null,
			handle_out: this.handle_out ? { x: this.handle_out.x, y: this.handle_out.y } : null,
			type: this.type
		};
	}

	static fromJSON(data) {
		if (!data) return new Anchor();
		return new Anchor(data);
	}
}

export class Subpath {
	/**
	 * @param {Object} options
	 * @param {boolean} [options.closed=false]
	 * @param {Anchor[]} [options.anchors=[]]
	 */
	constructor(options = {}) {
		this.closed = options.closed === true;
		this.anchors = Array.isArray(options.anchors)
			? options.anchors.map(a => (a instanceof Anchor ? a.clone() : Anchor.fromJSON(a)))
			: [];
	}

	translate(dx, dy) {
		if (dx === 0 && dy === 0) return;
		for (const anchor of this.anchors) {
			anchor.translate(dx, dy);
		}
	}

	clone() {
		return new Subpath({
			closed: this.closed,
			anchors: this.anchors.map(a => a.clone())
		});
	}

	toJSON() {
		return {
			closed: this.closed,
			anchors: this.anchors.map(a => a.toJSON())
		};
	}

	static fromJSON(data) {
		if (!data) return new Subpath();
		return new Subpath({
			closed: data.closed === true,
			anchors: Array.isArray(data.anchors) ? data.anchors.map(Anchor.fromJSON) : []
		});
	}

	/**
	 * Computes exact geometric axis-aligned bounding box for this subpath.
	 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}|null}
	 */
	getBounds() {
		if (!this.anchors || this.anchors.length === 0) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

		const updateExtrema = (x, y) => {
			if (typeof x === 'number' && !isNaN(x)) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
			}
			if (typeof y === 'number' && !isNaN(y)) {
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		};

		const numAnchors = this.anchors.length;
		const numSegments = this.closed ? numAnchors : numAnchors - 1;

		if (numSegments <= 0) {
			// Single anchor
			const pt = this.anchors[0].point;
			return { minX: pt.x, minY: pt.y, maxX: pt.x, maxY: pt.y, width: 0, height: 0 };
		}

		const evalBezier = (p0, p1, p2, p3, t) => {
			const mt = 1 - t;
			return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
		};

		for (let i = 0; i < numSegments; i++) {
			const a0 = this.anchors[i];
			const a1 = this.anchors[(i + 1) % numAnchors];
			const p0 = a0.point;
			const p1 = a0.handle_out || a0.point;
			const p2 = a1.handle_in || a1.point;
			const p3 = a1.point;

			updateExtrema(p0.x, p0.y);
			updateExtrema(p3.x, p3.y);

			// Check intermediate extrema for curved segments
			if (a0.handle_out || a1.handle_in) {
				['x', 'y'].forEach(axis => {
					const v0 = p0[axis], v1 = p1[axis], v2 = p2[axis], v3 = p3[axis];
					const a = 3 * (-v0 + 3 * v1 - 3 * v2 + v3);
					const b = 6 * (v0 - 2 * v1 + v2);
					const c = 3 * (v1 - v0);

					if (Math.abs(a) < 1e-9) {
						if (Math.abs(b) > 1e-9) {
							const t = -c / b;
							if (t > 0 && t < 1) {
								const valX = evalBezier(p0.x, p1.x, p2.x, p3.x, t);
								const valY = evalBezier(p0.y, p1.y, p2.y, p3.y, t);
								updateExtrema(valX, valY);
							}
						}
					} else {
						const disc = b * b - 4 * a * c;
						if (disc >= 0) {
							const sqrtDisc = Math.sqrt(disc);
							const t1 = (-b + sqrtDisc) / (2 * a);
							const t2 = (-b - sqrtDisc) / (2 * a);
							if (t1 > 0 && t1 < 1) {
								updateExtrema(evalBezier(p0.x, p1.x, p2.x, p3.x, t1), evalBezier(p0.y, p1.y, p2.y, p3.y, t1));
							}
							if (t2 > 0 && t2 < 1) {
								updateExtrema(evalBezier(p0.x, p1.x, p2.x, p3.x, t2), evalBezier(p0.y, p1.y, p2.y, p3.y, t2));
							}
						}
					}
				});
			}
		}

		if (minX === Infinity || minY === Infinity) return null;
		return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
	}
}

export class Vector {
	/**
	 * @param {Object} options
	 * @param {string|number} [options.id]
	 * @param {string} [options.name='Vector']
	 * @param {boolean} [options.visible=true]
	 * @param {boolean} [options.locked=false]
	 * @param {number} [options.opacity=100]
	 * @param {'shape'|'path'} [options.mode='path']
	 * @param {string|null} [options.fill=null]
	 * @param {'nonzero'|'evenodd'} [options.fill_rule='nonzero']
	 * @param {string|null} [options.stroke='#008000']
	 * @param {number} [options.stroke_width=2]
	 * @param {'center'|'inside'|'outside'} [options.stroke_align='center']
	 * @param {'butt'|'round'|'square'} [options.stroke_cap='butt']
	 * @param {'miter'|'round'|'bevel'} [options.stroke_join='miter']
	 * @param {Subpath[]} [options.paths=[]]
	 */
	constructor(options = {}) {
		this.id = options.id || ('vec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
		this.name = options.name || 'Vector';
		this.visible = options.visible !== false;
		this.locked = options.locked === true;
		this.opacity = (typeof options.opacity === 'number') ? options.opacity : 100;
		this.mode = options.mode || 'path'; // 'path' = work vector path; 'shape' = rendered fill/stroke shape
		this.fill = options.fill !== undefined ? options.fill : null;
		this.fill_rule = options.fill_rule === 'evenodd' ? 'evenodd' : 'nonzero';
		this.stroke = options.stroke !== undefined ? options.stroke : '#008000';
		this.stroke_width = (typeof options.stroke_width === 'number') ? options.stroke_width : 2;
		this.stroke_align = options.stroke_align || 'center'; // 'center' | 'inside' | 'outside'
		this.stroke_cap = options.stroke_cap || 'butt';
		this.stroke_join = options.stroke_join || 'miter';
		this.paths = Array.isArray(options.paths)
			? options.paths.map(p => (p instanceof Subpath ? p.clone() : Subpath.fromJSON(p)))
			: [];
	}

	translate(dx, dy) {
		if (dx === 0 && dy === 0) return;
		for (const path of this.paths) {
			path.translate(dx, dy);
		}
	}

	clone() {
		return new Vector({
			id: this.id,
			name: this.name,
			visible: this.visible,
			locked: this.locked,
			opacity: this.opacity,
			mode: this.mode,
			fill: this.fill,
			fill_rule: this.fill_rule,
			stroke: this.stroke,
			stroke_width: this.stroke_width,
			stroke_align: this.stroke_align,
			stroke_cap: this.stroke_cap,
			stroke_join: this.stroke_join,
			paths: this.paths.map(p => p.clone())
		});
	}

	toJSON() {
		return {
			id: this.id,
			name: this.name,
			visible: this.visible,
			locked: this.locked,
			opacity: this.opacity,
			mode: this.mode,
			fill: this.fill,
			fill_rule: this.fill_rule,
			stroke: this.stroke,
			stroke_width: this.stroke_width,
			stroke_align: this.stroke_align,
			stroke_cap: this.stroke_cap,
			stroke_join: this.stroke_join,
			paths: this.paths.map(p => p.toJSON())
		};
	}

	static fromJSON(data) {
		if (!data) return new Vector();
		return new Vector({
			id: data.id,
			name: data.name,
			visible: data.visible !== false,
			locked: data.locked === true,
			opacity: data.opacity,
			mode: data.mode,
			fill: data.fill,
			fill_rule: data.fill_rule,
			stroke: data.stroke,
			stroke_width: data.stroke_width,
			stroke_align: data.stroke_align,
			stroke_cap: data.stroke_cap || 'butt',
			stroke_join: data.stroke_join || 'miter',
			paths: Array.isArray(data.paths) ? data.paths.map(Subpath.fromJSON) : []
		});
	}

	/**
	 * Computes total bounds of all subpaths.
	 */
	getBounds() {
		if (this.paths.length === 0) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		let hasPoints = false;

		for (const path of this.paths) {
			const b = path.getBounds();
			if (b) {
				hasPoints = true;
				if (b.minX < minX) minX = b.minX;
				if (b.minY < minY) minY = b.minY;
				if (b.maxX > maxX) maxX = b.maxX;
				if (b.maxY > maxY) maxY = b.maxY;
			}
		}

		if (!hasPoints) return null;
		return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
	}
}
