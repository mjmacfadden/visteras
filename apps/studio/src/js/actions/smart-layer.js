import app from '../app.js';
import config from '../config.js';
import { Base_action } from './base.js';
import { validate_sources } from '../libs/smart-sources.js';

function refresh() {
	for (const layer of config.layers) app.Layers.notify_layer_data_changed(layer.id);
	app.Layers.invalidate({ document: true, preview: true, details: true });
	app.GUI.GUI_layers.render_layers();
	config.need_render = true;
}

/** Atomic structural change; preserve canvas objects instead of JSON-cloning DOM links. */
export class Smart_layer_action extends Base_action {
	constructor(description, layers, sources, selectedId) {
		super('smart_layer', description);
		validate_sources(sources, layers);
		this.next = { layers, sources, selectedId };
		this.memory_estimate = Object.values(sources).reduce((sum, s) => sum + s.width * s.height * 4 + s.preview.length * 2, 0);
	}
	apply(state) {
		config.layers = state.layers;
		// Keep sources available to inactive animation frames and undo records.
		// Native serialization emits only sources referenced by saved layers.
		config.smart_sources = state.sources;
		config.layer = config.layers.find(l => l.id === state.selectedId) || config.layers[0];
		config.selected_layer_ids = config.layer ? [config.layer.id] : [];
		config.mask_active = false;
		refresh();
	}
	async do() {
		super.do();
		this.previous = { layers: config.layers, sources: config.smart_sources, selectedId: config.layer?.id };
		this.apply(this.next);
	}
	async undo() { super.undo(); this.apply(this.previous); }
	free() { this.next = null; this.previous = null; }
}

/** A single source revision updates every instance, including on undo and redo. */
export class Smart_source_action extends Base_action {
	constructor(source) {
		super('smart_source', 'Update Smart Layer Contents'); this.source = source;
		validate_sources({ [source.id]: source }, [{ type: 'smart', smart_source_id: source.id }]);
		this.memory_estimate = source.width * source.height * 4 + source.preview.length * 2;
	}
	apply(source) {
		config.smart_sources = { ...config.smart_sources, [source.id]: source };
		for (const layer of config.layers) {
			if (layer.type !== 'smart' || layer.smart_source_id !== source.id) continue;
			layer.link = source.link;
			delete layer.link_canvas;
			layer.width_original = source.width;
			layer.height_original = source.height;
			delete layer._content_bounds_local;
		}
		refresh();
	}
	async do() { super.do(); this.previous = config.smart_sources[this.source.id]; this.apply(this.source); }
	async undo() { super.undo(); this.apply(this.previous); }
	free() { this.previous = null; this.source = null; }
}
