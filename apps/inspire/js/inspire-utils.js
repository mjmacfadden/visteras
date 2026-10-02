/**
 * Visteras Inspire — small pure helpers shared by the app (kept DOM-free so they are unit-testable).
 */

/** Status-bar zoom % that never touches a canvas that hasn't been created yet. */
export function zoomPercent(extra = {}, canvas = null) {
  if (extra && Number.isFinite(extra.zoom)) return extra.zoom;
  if (canvas && Number.isFinite(canvas.zoom)) return Math.round(canvas.zoom * 100);
  return 100;
}
