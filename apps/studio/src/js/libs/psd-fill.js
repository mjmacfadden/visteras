/**
 * Photoshop Fill % (fillOpacity) round-trip. Studio stores it as
 * layer.fillOpacity 0–100 (styles stay visible, content fades); ag-psd uses
 * fillOpacity 0–1. Full fill is left unset on both sides.
 */
export function psd_fill_to_studio(node) {
	const v = node && node.fillOpacity;
	if (v == null || !isFinite(Number(v))) return null;
	const pct = Math.round(Math.max(0, Math.min(1, Number(v))) * 100);
	return pct >= 100 ? null : pct;
}

export function studio_fill_to_psd(layer) {
	const v = layer && layer.fillOpacity;
	if (v == null || !isFinite(Number(v))) return null;
	const pct = Math.max(0, Math.min(100, Number(v)));
	return pct >= 100 ? null : Math.round(pct) / 100;
}
