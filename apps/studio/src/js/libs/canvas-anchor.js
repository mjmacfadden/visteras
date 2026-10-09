/**
 * Photoshop Canvas Size: 9-point anchor grid (centre by default) and the
 * Relative checkbox (width/height are amounts to add or remove).
 */
export const ANCHORS = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
export const DEFAULT_ANCHOR = 'c';

export function anchor_factors(anchor) {
	const i = ANCHORS.indexOf(anchor);
	const k = i < 0 ? 4 : i;
	return { fx: (k % 3) / 2, fy: Math.floor(k / 3) / 2 };
}

/** How far existing content moves when the canvas goes from old to new size. */
export function anchor_offset(anchor, oldW, oldH, newW, newH) {
	const { fx, fy } = anchor_factors(anchor);
	return { dx: Math.round((newW - oldW) * fx), dy: Math.round((newH - oldH) * fy) };
}

/** New size from the dialog values (Relative adds to the current size). */
export function resolve_canvas_size(oldW, oldH, w, h, relative) {
	if (!relative) return { width: w, height: h };
	return { width: oldW + (isFinite(w) ? w : 0), height: oldH + (isFinite(h) ? h : 0) };
}

/** Anchor grid HTML for the dialog (buttons + a hidden pop_data_anchor input). */
export function anchor_grid_html(selected = DEFAULT_ANCHOR) {
	const cells = ANCHORS.map((a) => `<button type="button" class="canvas_anchor_cell${a === selected ? ' active' : ''}" data-anchor="${a}" aria-label="Anchor ${a}" aria-pressed="${a === selected}"></button>`).join('');
	return `<div class="canvas_anchor" id="canvas_anchor_grid" role="group" aria-label="Anchor">${cells}</div><input type="hidden" id="pop_data_anchor" value="${selected}">`;
}
