/**
 * PSD adjustment layers Studio can't render yet (Levels, Curves, …).
 *
 * Instead of silently turning them into a no-op Brightness layer, the import
 * keeps a recognisable placeholder: the original name plus "(unsupported)",
 * a `psd_unsupported` record with the Photoshop type and its raw settings
 * (so PSD export writes the adjustment back unchanged), a note in the
 * Properties panel, and one warning toast per file.
 */

export const PSD_ADJUSTMENT_LABELS = {
	'levels': 'Levels',
	'curves': 'Curves',
	'color balance': 'Color Balance',
	'gradient map': 'Gradient Map',
	'vibrance': 'Vibrance',
	'color lookup': 'Color Lookup',
	'selective color': 'Selective Color',
	'channel mixer': 'Channel Mixer',
	'posterize': 'Posterize',
	'photo filter': 'Photo Filter',
	'brightness/contrast': 'Brightness/Contrast',
	'hue/saturation': 'Hue/Saturation',
	'black & white': 'Black & White',
	'exposure': 'Exposure',
	'invert': 'Invert',
	'threshold': 'Threshold',
};

export function psd_adjustment_label(type) {
	const key = String(type || '').toLowerCase();
	if (PSD_ADJUSTMENT_LABELS[key]) return PSD_ADJUSTMENT_LABELS[key];
	if (!key) return 'Unknown adjustment';
	return key.replace(/(^|[\s/&-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}

function plain_copy(value) {
	try {
		return JSON.parse(JSON.stringify(value));
	} catch (e) {
		return null;
	}
}

/** Placeholder fields for an unsupported PSD adjustment (spread into the layer model). */
export function unsupported_adjustment_fields(adj, name) {
	const type = String((adj && adj.type) || 'unknown');
	const label = psd_adjustment_label(type);
	const base = name || label;
	return {
		name: /\(unsupported\)$/i.test(base) ? base : `${base} (unsupported)`,
		adjustment_type: 'brightness',
		params: { value: 0 },
		psd_unsupported: { type, label, raw: plain_copy(adj) },
	};
}

/** Distinct labels of unsupported adjustments in a list of imported layers. */
export function unsupported_labels(layers) {
	const seen = [];
	for (const l of layers || []) {
		const label = l && l.psd_unsupported && l.psd_unsupported.label;
		if (label && !seen.includes(label)) seen.push(label);
	}
	return seen;
}

export function unsupported_import_message(labels) {
	if (!labels || !labels.length) return '';
	const list = labels.join(', ');
	return `This PSD uses adjustment layers Studio can't apply yet (${list}). They were kept as "(unsupported)" placeholder layers with no effect, so the image may look different from Photoshop. Exporting to PSD writes them back unchanged.`;
}

/** PSD export: the original adjustment record for a placeholder, else null. */
export function unsupported_export_adjustment(layer) {
	const raw = layer && layer.psd_unsupported && layer.psd_unsupported.raw;
	return raw && raw.type ? plain_copy(raw) : null;
}
