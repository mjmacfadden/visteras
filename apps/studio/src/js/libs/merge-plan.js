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
};

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
		deleteIds: [active.id, lower.id],
	};
}
