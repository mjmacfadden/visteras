/**
 * Photoshop Merge Down (Ctrl/⌘E) planning — pure, no DOM.
 *
 * - Active layer is a group → Merge Group (the group and everything in it
 *   become one layer in the group's place).
 * - Otherwise merge into the layer directly below **in the same group**
 *   (never into a group header, never across a group boundary).
 * - Refuse instead of losing data: layer below is a group, an adjustment,
 *   or either layer is hidden.
 * The result keeps the lower layer's name, opacity, blend mode, clipping and
 * parent group (Photoshop keeps the bottom layer's settings).
 */
import { is_group, get_parent_id, get_children, get_descendant_ids, is_effectively_visible } from './layer-tree.js';
import { is_layer_clipped, get_render_composition } from './layer-clip.js';

export const MERGE_MESSAGES = {
	none: 'Select a layer to merge.',
	bottom: 'There is no layer below this one in its group.',
	lowerGroup: 'The layer below is a group. Select the group and press Merge Down to merge the group first, or move this layer into the group.',
	lowerAdjustment: "Can't merge onto an adjustment layer.",
	hidden: 'Merge Down needs both layers visible.',
	emptyGroup: 'This group is empty.',
	locked: (name) => `"${name}" is locked. Unlock it to merge it.`,
};

/** A locked pixel layer (e.g. the Background) is merged *into* rather than replaced, as in Photoshop. */
export function merges_into(layer) {
	return !!(layer && layer.locked && layer.type === 'image');
}

export function merge_down_plan(layers, activeId) {
	const list = layers || [];
	const active = list.find((l) => l.id === activeId);
	if (!active) return { ok: false, error: MERGE_MESSAGES.none };
	if (is_group(active)) {
		const ids = get_descendant_ids(active.id, list);
		if (!ids.length) return { ok: false, error: MERGE_MESSAGES.emptyGroup };
		if (!is_effectively_visible(active, list)) return { ok: false, error: MERGE_MESSAGES.hidden };
		const descendants = list.filter((l) => ids.includes(l.id));
		return {
			ok: true,
			mode: 'group',
			group: active,
			descendants,
			result: {
				name: active.name || 'Group',
				parent_id: get_parent_id(active),
				order: active.order,
				opacity: 100,
				composition: 'source-over',
				clipped: is_layer_clipped(active),
			},
			deleteIds: [active.id],
		};
	}
	const siblings = get_children(get_parent_id(active), list).filter((l) => (l.order || 0) < (active.order || 0));
	const lower = siblings.length ? siblings[siblings.length - 1] : null;
	if (!lower) return { ok: false, error: MERGE_MESSAGES.bottom };
	if (is_group(lower)) return { ok: false, error: MERGE_MESSAGES.lowerGroup };
	if (lower.type === 'adjustment') return { ok: false, error: MERGE_MESSAGES.lowerAdjustment };
	if (active.visible === false || lower.visible === false) return { ok: false, error: MERGE_MESSAGES.hidden };
	if (active.locked) return { ok: false, error: MERGE_MESSAGES.locked(active.name || 'Layer') };
	if (lower.locked && !merges_into(lower)) return { ok: false, error: MERGE_MESSAGES.locked(lower.name || 'Layer') };
	const lowerClipped = is_layer_clipped(lower);
	return {
		ok: true,
		mode: 'pair',
		upper: active,
		lower,
		// Inside the merge canvas the lower layer is drawn plain (its opacity,
		// blend and clipping stay on the result); the upper keeps its own
		// opacity/blend and is clipped to the lower only if it was clipped to it.
		renderLower: { ...lower, opacity: 100, composition: 'source-over', clipped: false, parent_id: null },
		renderUpper: {
			...active,
			composition: get_render_composition(active),
			clipped: is_layer_clipped(active) && !lowerClipped,
			parent_id: null,
		},
		result: {
			name: lower.name || active.name || 'Layer',
			parent_id: get_parent_id(lower),
			order: lower.order,
			opacity: lower.opacity != null ? lower.opacity : 100,
			composition: get_render_composition(lower),
			clipped: lowerClipped,
		},
		into: merges_into(lower) ? lower.id : null,
		deleteIds: merges_into(lower) ? [active.id] : [active.id, lower.id],
	};
}

export const MERGE_VISIBLE_MESSAGES = {
	none: 'Merge Visible needs at least two visible layers.',
	locked: MERGE_MESSAGES.locked,
};

/**
 * Photoshop Merge Visible (Shift+Ctrl/⌘E) planning — pure, no DOM.
 * Every effectively visible pixel layer (adjustments included, they are baked
 * in) is composited into one layer that takes the bottom visible layer's
 * place and name. Hidden layers are kept untouched; a group is only removed
 * when nothing hidden is left inside it.
 */
export function merge_visible_plan(layers) {
	const list = layers || [];
	const leaves = list.filter((l) => l && l.type != null && !is_group(l) && is_effectively_visible(l, list));
	if (leaves.length < 2) return { ok: false, error: MERGE_VISIBLE_MESSAGES.none };
	const merged = new Set(leaves.map((l) => l.id));
	const groups = list.filter((g) => is_group(g) && is_effectively_visible(g, list))
		.filter((g) => get_descendant_ids(g.id, list).every((id) => merged.has(id) || is_group(list.find((l) => l.id === id))))
		.sort((a, b) => get_descendant_ids(a.id, list).length - get_descendant_ids(b.id, list).length);
	const groupIds = new Set(groups.map((g) => g.id));
	const bottom = leaves.reduce((m, l) => ((l.order || 0) < (m.order || 0) ? l : m), leaves[0]);
	const into = merges_into(bottom) ? bottom.id : null;
	const blocked = leaves.find((l) => l.locked && l.id !== into);
	if (blocked) return { ok: false, error: MERGE_VISIBLE_MESSAGES.locked(blocked.name || 'Layer') };
	// Keep the bottom layer's group unless that group itself is being removed.
	let parent = get_parent_id(bottom);
	while (parent && groupIds.has(parent)) {
		parent = get_parent_id(list.find((l) => l.id === parent));
	}
	return {
		ok: true,
		leaves,
		result: { name: bottom.name || 'Merged', parent_id: parent, order: bottom.order },
		into,
		deleteIds: [...leaves.filter((l) => l.id !== into).map((l) => l.id), ...groups.map((g) => g.id)],
	};
}

/**
 * Photoshop Flatten Image planning — pure, no DOM.
 * Discards all layers and produces a single locked Background layer.
 */
export function flatten_plan(layers) {
	const list = layers || [];
	if (!list.length) return { ok: false, error: 'No layers to flatten.' };
	const hasHidden = list.some((l) => l.visible === false);
	return {
		ok: true,
		hasHidden,
		deleteIds: list.map((l) => l.id),
		result: {
			name: 'Background',
			locked: true,
			type: 'image',
			order: 1,
			parent_id: null,
			opacity: 100,
			composition: 'source-over',
			mask: null,
			filters: [],
		},
	};
}
