/**
 * Vertical placement for menu dropdowns. Menus are as tall as their content
 * (like native / Photoshop menus); a height cap appears only when the menu
 * would really run past the bottom of the viewport.
 *
 * @param {object} o
 * @param {number} o.anchor   top-level: opener bottom; submenu: opener top
 * @param {number} o.height   natural (uncapped) height of the menu
 * @param {number} o.viewport viewport height
 * @param {number} o.margin   gap kept from the viewport edges
 * @param {boolean} o.submenu submenus shift up to stay on screen before capping
 * @returns {{ top: number, maxHeight: number|null }} maxHeight null = no cap, no scrolling
 */
export function fit_menu_vertically({ anchor, height, viewport, margin = 0, submenu = false }) {
	if (!submenu) {
		const space = Math.max(0, viewport - anchor - margin);
		return { top: anchor, maxHeight: height > space ? space : null };
	}
	const bottomLimit = viewport - margin;
	let top = anchor;
	if (top + height > bottomLimit) top = bottomLimit - height;
	if (top < margin) {
		top = Math.min(anchor, margin);
		const space = Math.max(0, bottomLimit - top);
		return { top, maxHeight: height > space ? space : null };
	}
	return { top, maxHeight: null };
}
