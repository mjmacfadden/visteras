// Studio rotates text about its box center; PSD point text rotates about its
// baseline origin. Convert between the two without using the raster bounds.
export function point_text_origin(layer, baseline, width = layer.width, height = layer.height) {
	const align = layer.params.halign;
	const fraction = align === 'right' ? 1 : align === 'center' ? 0.5 : 0;
	const angle = (layer.rotate || 0) * Math.PI / 180;
	const dx = 1 + (width - 1) * fraction - width / 2;
	const dy = 1 + baseline - height / 2;
	return [layer.x + width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy,
		layer.y + height / 2 + Math.sin(angle) * dx + Math.cos(angle) * dy];
}

export function place_point_text(layer, width, height, baseline) {
	const previous = layer.params.psd_text_layout;
	// Repainting/moving does not change layout. Avoid even subpixel round-off:
	// the text edit history compares positions and must not see phantom edits.
	if (!layer.params.psd_point_origin && previous && previous.baseline === baseline &&
		layer.width === width && layer.height === height) return;
	const origin = layer.params.psd_point_origin || point_text_origin(layer, previous ? previous.baseline : baseline);
	const offset = point_text_origin({ ...layer, x: 0, y: 0 }, baseline, width, height);
	layer.x = origin[0] - offset[0];
	layer.y = origin[1] - offset[1];
	layer.width = width;
	layer.height = height;
	layer.params.psd_text_layout = { baseline };
	delete layer.params.psd_point_origin;
	const fraction = layer.params.halign === 'right' ? 1 : layer.params.halign === 'center' ? 0.5 : 0;
	layer.params.anchor_x = layer.x + width * fraction;
	layer.params.anchor_y = layer.y;
}
