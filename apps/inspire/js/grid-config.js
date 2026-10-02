/**
 * Visteras Inspire — Shared background grid (dots / blueprint grid).
 *
 * ONE source of truth for both canvas modes so they can't drift apart:
 *   - Fixed artboard: the grid is painted on the artboard in board units (scale 1);
 *     the world transform (translate + scale(zoom)) scales it on screen.
 *   - Infinite canvas: the grid is painted on the viewport in screen pixels, so it is
 *     scaled by zoom here and offset by the pan so it stays locked to board coordinates.
 * Either way, at a given zoom the on-screen spacing and dot size are gridMetrics(zoom).
 */

export const GRID_CONFIG = Object.freeze({
  spacing: 24, // board units between dots / lines
  dotRadius: 1.5, // board units
  dotColor: 'rgba(0, 0, 0, 0.12)',
  lineWidth: 1, // board units
  lineColor: 'rgba(0, 0, 0, 0.06)'
});

const safeZoom = (zoom) => (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);

/** On-screen grid metrics (px) at a given zoom. Identical for both modes. */
export function gridMetrics(zoom = 1) {
  const z = safeZoom(zoom);
  return {
    spacing: GRID_CONFIG.spacing * z,
    dotRadius: GRID_CONFIG.dotRadius * z,
    lineWidth: GRID_CONFIG.lineWidth * z
  };
}

/**
 * CSS background for a pattern drawn at `scale` (1 = board units, zoom = screen px),
 * with the grid origin at (offsetX, offsetY).
 */
export function gridBackgroundStyle(pattern, scale = 1, offsetX = 0, offsetY = 0) {
  const { spacing, dotRadius, lineWidth } = gridMetrics(scale);
  const size = `${spacing}px ${spacing}px`;
  const position = `${offsetX}px ${offsetY}px`;
  if (pattern === 'dots') {
    return {
      backgroundImage: `radial-gradient(circle, ${GRID_CONFIG.dotColor} ${dotRadius}px, transparent ${dotRadius}px)`,
      backgroundSize: size,
      backgroundPosition: position
    };
  }
  if (pattern === 'grid') {
    return {
      backgroundImage: `linear-gradient(${GRID_CONFIG.lineColor} ${lineWidth}px, transparent ${lineWidth}px), linear-gradient(90deg, ${GRID_CONFIG.lineColor} ${lineWidth}px, transparent ${lineWidth}px)`,
      backgroundSize: size,
      backgroundPosition: position
    };
  }
  return { backgroundImage: 'none', backgroundSize: '', backgroundPosition: '' };
}

/** Grid style for a canvas: fixed mode paints the artboard, infinite mode paints the viewport. */
export function gridStylesForMode(mode, pattern, zoom = 1, panX = 0, panY = 0) {
  const clear = { backgroundImage: '', backgroundSize: '', backgroundPosition: '' };
  if (mode === 'infinite') {
    return { artboard: { ...clear, backgroundImage: 'none' }, viewport: gridBackgroundStyle(pattern, safeZoom(zoom), panX, panY) };
  }
  return { artboard: gridBackgroundStyle(pattern, 1, 0, 0), viewport: clear };
}
