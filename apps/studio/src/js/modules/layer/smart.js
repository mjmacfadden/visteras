import { renderSmart, isContentEffect } from '../../libs/smart-effects.js';
import app from '../../app.js';
import config from '../../config.js';
import alertify from '../../../../node_modules/alertifyjs/build/alertify.min.js';
import { v4 as uuid } from 'uuid';
import project_store from '../../actions/store/project-store.js';
import { get_descendant_ids, is_group } from '../../libs/layer-tree.js';
import { Smart_layer_action, Smart_source_action } from '../../actions/smart-layer.js';
import { decode_preview, serialize_sources } from '../../libs/smart-sources.js';

/** Smart contents are ordinary isolated document tabs, committed explicitly to their parent. */
class Layer_smart_class {
	async run(task) {
		if (this.busy) return;
		this.busy = true;
		try { await app.State._action_queue; return await task(); }
		catch (e) { console.error('[Smart Layers]', e); alertify.error(e.message); return false; }
		finally { this.busy = false; }
	}
	layer(id) {
		const layer = typeof id === 'number' ? config.layers.find(l => l.id === id) : config.layer;
		if (!layer) throw new Error('Select a layer first.');
		return layer;
	}
	smart(id) {
		const layer = this.layer(id);
		if (layer.type !== 'smart') throw new Error('Select a Smart Layer first.');
		return layer;
	}
	assert_mutable(layer) {
		if (layer.locked) throw new Error('Unlock the layer first.');
	}
	async action(action) {
		const result = await app.State.do_action(action);
		if (result.status !== 'completed') throw result.reason;
	}
	canvas(width, height) {
		const canvas = document.createElement('canvas');
		canvas.width = width; canvas.height = height;
		return canvas;
	}
	// Use the authoritative compositor, without viewport scale or selection overlays.
	composite() {
		const canvas = this.canvas(config.WIDTH, config.HEIGHT);
		app.Layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
		return canvas;
	}
	convert(id) { return this.run(async () => {
		const layer = this.layer(id); this.assert_mutable(layer);
		if (layer.type === 'smart') return;
		if ((config.selected_layer_ids || []).length > 1 && typeof id !== 'number')
			throw new Error('Group the selected layers first, then convert the group to a Smart Layer.');
		if (layer.type === 'adjustment' || layer.type === 'vector')
			throw new Error('Convert an image, text layer, shape, or self-contained group.');
		const ids = new Set([layer.id, ...(is_group(layer) ? get_descendant_ids(layer.id, config.layers) : [])]);
		const originals = config.layers.filter(l => ids.has(l.id));
		if (originals.some(l => l.locked)) throw new Error('Unlock the layers inside this group first.');
		if (is_group(layer) && originals.some(l => l.type === 'adjustment' || l.type === 'vector' || l.clipped || (!is_group(l) && l.composition && l.composition !== 'source-over')))
			throw new Error('This group depends on adjustment, vector, clipping, or blend behavior. Use a self-contained group with Normal layers for conversion.');
		const json = JSON.parse(app.FileSave.export_as_json());
		json.layers = json.layers.filter(l => ids.has(l.id));
		json.data = json.data.filter(d => ids.has(d.id));
		json.smart_sources = serialize_sources(originals, config.smart_sources);
		json.vectors = [];
		json.info.layer_active = layer.id;
		json.info.guides = [];
		json.info.transparency = true;
		let width = config.WIDTH, height = config.HEIGHT;
		let preview, outer;
		if (layer.type === 'image') {
			const image = layer.link_canvas || layer.link;
			width = image.naturalWidth || image.width; height = image.naturalHeight || image.height;
			preview = this.canvas(width, height); preview.getContext('2d').drawImage(image, 0, 0);
			const inner = json.layers[0];
			Object.assign(inner, { x: 0, y: 0, width, height, width_original: width, height_original: height,
				rotate: 0, parent_id: 0, opacity: 100, fillOpacity: 100, composition: 'source-over', clipped: false,
				filters: [], mask: null, visible: true, locked: false });
			outer = { ...layer };
		} else {
			// A document-sized source preserves text layout and group coordinates exactly.
			// Keep nonlocal effects inside the source; reject geometry outside that source frame.
			if (originals.some(l => !is_group(l) && ((l.x || 0) < 0 || (l.y || 0) < 0 || (l.x || 0) + l.width > width || (l.y || 0) + l.height > height)))
				throw new Error('Move the contents inside the document bounds before converting this group or layer.');
			const root = json.layers.find(l => l.id === layer.id);
			root.parent_id = 0;
			root.visible = true;
			root.clipped = false;
			const oldLayers = config.layers;
			try {
				config.layers = originals.map(l => l.id === layer.id ? { ...l, visible: true, parent_id: 0, clipped: false } : l);
				preview = this.composite();
			} finally { config.layers = oldLayers; }
			outer = { ...layer, x: 0, y: 0, width, height, rotate: 0, filters: [], mask: null, opacity: 100, fillOpacity: 100, composition: 'source-over' };
		}
		json.info.width = width; json.info.height = height;
		const source = { id: uuid(), revision: 1, width, height, document: json, preview: preview.toDataURL('image/png'), link: preview };
		Object.assign(outer, { type: 'smart', smart_source_id: source.id, width_original: width, height_original: height,
			link: preview, link_canvas: null, data: null, render_function: null, is_vector: false, params: {} });
		for (const key of Object.keys(outer)) if (key.startsWith('_')) delete outer[key];
		const layers = config.layers.filter(l => !ids.has(l.id) || l.id === layer.id).map(l => l.id === layer.id ? outer : l);
		await this.action(new Smart_layer_action('Convert to Smart Layer', layers, { ...config.smart_sources, [source.id]: source }, outer.id));
	}); }
	edit_contents(id) { return this.run(async () => {
		const layer = this.smart(id);
		const parent = app.Documents.get_active_document();
		const source = config.smart_sources[layer.smart_source_id];
		const existing = app.Documents.documents.find(d => d.smart_edit?.parent_id === parent.id && d.smart_edit.source_id === source.id);
		if (existing) return app.Documents.activate_document(existing.id);
		await app.State.do_action(new app.Actions.Activate_tool_action('select'), { skip_history: true });
		app.Documents.save_current_state();
		if (!parent.smart_edit) await project_store.save(app.FileSave.export_as_json()).catch(e => console.warn('Recovery snapshot failed', e));
		if (app.Documents.active_id !== parent.id) throw new Error('Return to the parent document before opening contents.');
		const child = await app.Documents.create_document_from_json(JSON.parse(JSON.stringify(source.document)), layer.name + ' — Contents.json', { force_new: true });
		if (!child) throw new Error('Cannot open Smart Layer contents.');
		child.smart_edit = { parent_id: parent.id, source_id: source.id, revision: source.revision };
		child.is_dirty = false;
		app.Documents.render_tabs();
	}); }
	save_contents() { return this.run(async () => {
		const child = app.Documents.get_active_document();
		if (!child.smart_edit) throw new Error('Open a Smart Layer with Edit Contents first.');
		if (app.Documents.documents.some(d => d.smart_edit?.parent_id === child.id))
			throw new Error('Save and close nested contents first.');
		const context = child.smart_edit;
		const parent = app.Documents.documents.find(d => d.id === context.parent_id);
		const previous = parent?.smart_sources?.[context.source_id];
		if (!previous || previous.revision !== context.revision)
			throw new Error('The parent source changed. Close this contents tab and reopen it before saving.');
		await app.State.do_action(new app.Actions.Activate_tool_action('select'), { skip_history: true });
		const json = JSON.parse(app.FileSave.export_as_json());
		const preview = this.composite();
		const source = { id: previous.id, revision: uuid(), width: config.WIDTH, height: config.HEIGHT,
			document: json, preview: preview.toDataURL('image/png'), link: preview };
		await app.Documents.activate_document(parent.id);
		await this.action(new Smart_source_action(source));
		child.is_dirty = false;
		context.revision = source.revision;
		app.Documents.render_tabs();
		alertify.success('Smart Layer contents updated.');
	}); }
	make_independent(id) { return this.run(async () => {
		const layer = this.smart(id); this.assert_mutable(layer);
		const original = config.smart_sources[layer.smart_source_id];
		const source = { ...original, id: uuid(), document: JSON.parse(JSON.stringify(original.document)) };
		const layers = config.layers.map(l => l === layer ? { ...l, smart_source_id: source.id } : l);
		await this.action(new Smart_layer_action('Make Smart Layer Independent', layers, { ...config.smart_sources, [source.id]: source }, layer.id));
	}); }
	replace_contents(id) {
		let layer; try { layer = this.smart(id); this.assert_mutable(layer); } catch (e) { alertify.error(e.message); return; }
		const parentId = app.Documents.active_id;
		const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
		input.onchange = () => this.run(async () => {
			if (!input.files[0]) return;
			if (app.Documents.active_id !== parentId) throw new Error('Return to the original document before replacing contents.');
			const file = input.files[0];
			const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
			const image = await decode_preview(url);
			if (app.Documents.active_id !== parentId || !config.layers.includes(layer)) throw new Error('The target document or layer changed. Try Replace Contents again.');
			await this.replace_image(layer, image, url, file.name);
		});
		input.click();
	}
	async replace_image(layer, image, url, name) {
		const old = config.smart_sources[layer.smart_source_id];
		// Fit in the existing source frame, preserving aspect ratio and every instance transform.
		const scale = Math.min(old.width / image.width, old.height / image.height);
		const width = image.width * scale, height = image.height * scale;
		const x = (old.width - width) / 2, y = (old.height - height) / 2;
		const preview = this.canvas(old.width, old.height); preview.getContext('2d').drawImage(image, x, y, width, height);
		const json = { info: { ...old.document.info, width: old.width, height: old.height, layer_active: 1 }, user_fonts: {}, vectors: [], smart_sources: {},
			layers: [{ id: 1, name, type: 'image', x, y, width, height, width_original: image.width, height_original: image.height,
				parent_id: 0, order: 1, visible: true, opacity: 100, rotate: 0, filters: [], composition: 'source-over' }], data: [{ id: 1, data: url }] };
		await this.action(new Smart_source_action({ ...old, revision: uuid(), document: json, preview: preview.toDataURL('image/png'), link: preview }));
	}

	rasterize(id) { return this.run(async () => {
		const layer = this.smart(id); this.assert_mutable(layer);
		const image = renderSmart(layer);
		const canvas = this.canvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
		canvas.getContext('2d').drawImage(image, 0, 0);
		const raster = { ...layer, type: 'image', smart_source_id: null, link: canvas, link_canvas: null, filters: layer.filters.filter(f => !isContentEffect(f)), data: null };
		await this.action(new Smart_layer_action('Rasterize Smart Layer', config.layers.map(l => l === layer ? raster : l), config.smart_sources, layer.id));
	}); }
}
export default Layer_smart_class;
