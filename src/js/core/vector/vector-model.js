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
	 * Computes axis-aligned bounding box for this subpath.
	 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
	 */
	getBounds() {
		if (this.anchors.length === 0) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

		for (const anchor of this.anchors) {
			const pts = [anchor.point];
			if (anchor.handle_in) pts.push(anchor.handle_in);
			if (anchor.handle_out) pts.push(anchor.handle_out);
			for (const p of pts) {
				if (p.x < minX) minX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.x > maxX) maxX = p.x;
				if (p.y > maxY) maxY = p.y;
			}
		}

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
