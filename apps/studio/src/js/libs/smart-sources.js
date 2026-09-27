/** Embedded, document-owned sources. Serialized previews are never the editable source. */
export function serialize_sources(layers, sources) {
	const result = Object.create(null);
	for (const layer of layers) {
		if (layer.type !== 'smart') continue;
		const source = sources[layer.smart_source_id];
		if (!source) throw new Error('Missing Smart Layer source: ' + layer.name);
		if (!result[source.id]) {
			result[source.id] = { id: source.id, revision: source.revision, width: source.width,
				height: source.height, document: source.document, preview: source.preview };
		}
	}
	return result;
}

export function validate_sources(sources, layers, depth = 0, ancestors = new Set()) {
	if (depth > 16) throw new Error('Smart Layers exceed the supported nesting depth (16).');
	for (const layer of layers || []) {
		if (layer.type !== 'smart') continue;
		const id = layer.smart_source_id;
		const s = Object.prototype.hasOwnProperty.call(sources, id) && sources[id];
		if (!s || s.id !== id || !s.document?.info || !Array.isArray(s.document.layers)
			|| !Number.isFinite(s.width) || !Number.isFinite(s.height) || s.width < 1 || s.height < 1
			|| typeof s.preview !== 'string' || !s.preview.startsWith('data:image/')) {
			throw new Error('Invalid or missing embedded Smart Layer source.');
		}
		if (ancestors.has(s)) throw new Error('Recursive Smart Layer source.');
		const next = new Set(ancestors); next.add(s);
		validate_sources(s.document.smart_sources || {}, s.document.layers, depth + 1, next);
	}
}

export function decode_preview(url) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Cannot decode embedded Smart Layer preview.'));
		image.src = url;
	});
}

export async function hydrate_sources(serialized, layers) {
	validate_sources(serialized, layers);
	const sources = Object.create(null);
	for (const layer of layers) {
		if (layer.type !== 'smart') continue;
		const id = layer.smart_source_id;
		if (!sources[id]) {
			const link = await decode_preview(serialized[id].preview);
			if (link.naturalWidth !== serialized[id].width || link.naturalHeight !== serialized[id].height)
				throw new Error('Smart Layer preview dimensions do not match its source.');
			sources[id] = { ...serialized[id], link };
		}
		layer.link = sources[id].link;
		layer.link_canvas = null;
		layer.data = null;
	}
	return sources;
}
