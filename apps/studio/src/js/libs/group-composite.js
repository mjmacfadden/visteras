import { is_group, get_ancestors, get_descendant_ids, is_effectively_visible } from './layer-tree.js';

/** Replace styled group subtrees with a document-sized bitmap before painting.
 * Input/output follow the compositor's top-to-bottom order. Unstyled folders
 * remain pass-through; nested styled folders are handled by the render callback.
 */
export function composite_group_layers(layers, tree, width, height, createCanvas, render) {
	const styled = layers.filter(layer => is_group(layer) &&
		(layer.filters || []).some(filter => filter && filter.disabled !== true && filter.visible !== false));
	const styledIds = new Set(styled.map(layer => layer.id));
	const roots = styled.filter(layer => !get_ancestors(layer.id, tree).some(parent => styledIds.has(parent.id)));
	if (!roots.length) return layers;
	const removed = new Set();
	const replacements = new Map();
	for (const group of roots) {
		const ids = new Set(get_descendant_ids(group.id, tree));
		const children = layers.filter(layer => ids.has(layer.id));
		const index = layers.findIndex(layer => layer.id === group.id || ids.has(layer.id));
		removed.add(group.id);
		for (const id of ids) removed.add(id);
		if (!is_effectively_visible(group, tree)) continue;
		const canvas = createCanvas(width, height);
		const temp = createCanvas(width, height);
		const ctx = canvas.getContext('2d');
		render(ctx, temp, children);
		ctx.restore();
		replacements.set(index, {
			...group, type: 'image', link: canvas, link_canvas: null,
			x: 0, y: 0, width, height, rotate: 0,
			composition: group.composition === 'pass-through' ? 'source-over' : group.composition,
		});
	}
	const result = [];
	for (let i = 0; i < layers.length; i++) {
		if (replacements.has(i)) result.push(replacements.get(i));
		if (!removed.has(layers[i].id)) result.push(layers[i]);
	}
	return result;
}
