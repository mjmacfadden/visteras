/**
 * Shared fit-on-screen math for full-workspace preview dialogs
 * (Relight, Raw Develop, Select and Mask). Mirrors the main canvas
 * "Fit on Screen" (GUI_preview.zoom_auto): a 32px margin on every side,
 * aspect preserved, no artificial upscale cap.
 */
export const PREVIEW_FIT_MARGIN = 32;

export function fit_preview_scale(viewWidth, viewHeight, imageWidth, imageHeight, margin = PREVIEW_FIT_MARGIN) {
	if (!(imageWidth > 0) || !(imageHeight > 0)) return 1;
	const availW = Math.max(1, (Number(viewWidth) || 0) - margin * 2);
	const availH = Math.max(1, (Number(viewHeight) || 0) - margin * 2);
	return Math.max(0.01, Math.min(availW / imageWidth, availH / imageHeight));
}
