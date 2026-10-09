import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Base_layers_class from './../../core/base-layers.js';
import { merge_down_plan } from './../../libs/merge-plan.js';

/**
 * Layer ▸ Merge Down (Ctrl/⌘E), Photoshop-style. Composites through the same
 * renderer as the canvas (masks, effects, clipping, custom blend modes), keeps
 * the result in the lower layer's group, and never deletes a group by
 * accident. With a group selected it is Merge Group.
 */
class Layer_merge_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		document.addEventListener('keydown', (event) => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey || event.code !== 'KeyE') return;
			if (event.isComposing || event.repeat || event.target?.isContentEditable ||
				/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
			event.preventDefault();
			if (event.shiftKey) app.GUI?.modules?.['layer/flatten']?.merge_visible?.();
			else this.merge();
		});
	}

	render_pixels(layersTopFirst) {
		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d');
		const temp = this.Base_layers.create_new_canvas(ctx);
		this.Base_layers.render_objects(ctx, temp, layersTopFirst, () => ctx.save(), (l) => l.visible === false || l.type == null);
		ctx.restore();
		return canvas;
	}

	async merge() {
		if (this.merging) return false;
		const plan = merge_down_plan(config.layers, config.layer && config.layer.id);
		if (!plan.ok) {
			alertify.error(plan.error);
			return false;
		}
		this.merging = true;
		try {
			const byOrderDesc = (a, b) => (b.order || 0) - (a.order || 0);
			const layers = plan.mode === 'group'
				? [plan.group, ...plan.descendants].sort(byOrderDesc)
				: [plan.renderUpper, plan.renderLower];
			const canvas = this.render_pixels(layers);
			const r = plan.result;
			const params = {
				type: 'image',
				name: r.name,
				data: canvas.toDataURL('image/png'),
				x: 0, y: 0,
				width: canvas.width, height: canvas.height,
				width_original: canvas.width, height_original: canvas.height,
				parent_id: r.parent_id,
				order: r.order,
				opacity: r.opacity,
				composition: r.composition,
				clipped: r.clipped,
			};
			await app.State.do_action(
				new app.Actions.Bundle_action('merge_layers', plan.mode === 'group' ? 'Merge Group' : 'Merge Down', [
					new app.Actions.Insert_layer_action(params, false),
					...plan.deleteIds.map((id) => new app.Actions.Delete_layer_action(id)),
				])
			);
			canvas.width = 1;
			canvas.height = 1;
			return true;
		} finally {
			this.merging = false;
		}
	}

}

export default Layer_merge_class;
