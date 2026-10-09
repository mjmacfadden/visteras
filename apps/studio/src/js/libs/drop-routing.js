/**
 * Photoshop-style drag & drop routing: dropping raster images onto an open,
 * non-empty document places them as embedded Smart Layers. Shift-drop, an
 * empty/pristine document, or non-image files (PSD, .vsd, JSON, fonts...)
 * keep the old behavior of opening each file as its own document.
 */
export const PLACEABLE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

export function is_placeable_image(file) {
	if (!file) return false;
	const type = String(file.type || '').toLowerCase();
	const name = String(file.name || '');
	if (type === 'image/svg+xml' || /\.svg$/i.test(name)) return false;
	if (type.includes('photoshop') || /\.psd$/i.test(name)) return false;
	if (type.startsWith('image/')) return true;
	return type === '' && PLACEABLE_EXT.test(name);
}

export function drop_mode({ files, shiftKey = false, hasDocument = true, documentEmpty = false } = {}) {
	const list = Array.from(files || []);
	if (!list.length || shiftKey || !hasDocument || documentEmpty) return 'open';
	return list.every(is_placeable_image) ? 'place' : 'open';
}

/**
 * Studio treats an untouched one-layer document as replaceable. An image that
 * was just opened looks the same (one layer, no history), but its tab carries
 * the file name, so it still counts as a real document to place into.
 */
export function is_blank_start_document(isEmpty, title) {
	return !!isEmpty && !/\.(png|jpe?g|webp|gif|avif|bmp|heic|heif|tiff?)$/i.test(String(title || ''));
}

/** Photoshop "Resize Image During Place": shrink to fit the canvas, never enlarge; centered. */
export function fit_place_rect(imgW, imgH, canvasW, canvasH) {
	const scale = Math.min(canvasW / imgW, canvasH / imgH, 1);
	const width = imgW * scale, height = imgH * scale;
	return { x: (canvasW - width) / 2, y: (canvasH - height) / 2, width, height, scale };
}
