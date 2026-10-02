/**
 * Visteras Inspire — PNG/JPG export geometry.
 *
 * - Fixed artboard: export the artboard rectangle.
 * - Infinite canvas: the artboard element is 0×0, so export the bounds of all elements plus
 *   padding, painted with the board background (and pattern).
 * - Output size is clamped to conservative browser canvas limits (Safari: 16,777,216 px area;
 *   8192 px per side is safe everywhere), downscaling instead of failing.
 */
import { gridBackgroundStyle } from './grid-config.js';

export const EXPORT_PADDING = 48;
export const EXPORT_DEFAULT_SCALE = 2;
export const EXPORT_LIMITS = Object.freeze({ maxSide: 8192, maxArea: 16_777_216 });

/** Axis-aligned bounds of the given elements (rotation aware), plus padding; null if empty. */
export function computeContentBounds(elements, padding = EXPORT_PADDING) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements || []) {
    if (!el || ![el.x, el.y].every(Number.isFinite)) continue;
    const w = Number.isFinite(el.width) ? el.width : 0;
    const h = Number.isFinite(el.height) ? el.height : 0;
    if (el.rotation) {
      const rad = el.rotation * (Math.PI / 180);
      const cx = el.x + w / 2, cy = el.y + h / 2;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
        const rx = cx + dx * cos - dy * sin, ry = cy + dx * sin + dy * cos;
        minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
      }
    } else {
      minX = Math.min(minX, el.x); maxX = Math.max(maxX, el.x + w);
      minY = Math.min(minY, el.y); maxY = Math.max(maxY, el.y + h);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const x = Math.floor(minX - padding), y = Math.floor(minY - padding);
  return { x, y, width: Math.max(1, Math.ceil(maxX + padding) - x), height: Math.max(1, Math.ceil(maxY + padding) - y) };
}

/**
 * Largest scale ≤ desired whose output (ceil(w*s) × ceil(h*s)) fits the limits.
 * Returns { scale, reduced, width, height }.
 */
export function computeSafeExportScale(width, height, desired = EXPORT_DEFAULT_SCALE, limits = EXPORT_LIMITS) {
  const w = Math.max(1, width), h = Math.max(1, height);
  let scale = Math.min(desired, limits.maxSide / w, limits.maxSide / h, Math.sqrt(limits.maxArea / (w * h)));
  scale = Math.floor(scale * 1000) / 1000;
  while (scale > 0.001 && (Math.ceil(w * scale) > limits.maxSide || Math.ceil(h * scale) > limits.maxSide
    || Math.ceil(w * scale) * Math.ceil(h * scale) > limits.maxArea)) {
    scale = Math.round((scale - 0.001) * 1000) / 1000;
  }
  scale = Math.max(0.001, scale);
  return { scale, reduced: scale < desired, width: Math.ceil(w * scale), height: Math.ceil(h * scale) };
}

/** The board-space rectangle to export, or null when an infinite board is empty. */
export function exportRegion(doc, elements) {
  if (doc?.mode === 'infinite') return computeContentBounds(elements);
  return { x: 0, y: 0, width: doc?.width || 1920, height: doc?.height || 1080 };
}

/**
 * html2canvas onclone hook: lays the cloned artboard out as a plain, untransformed rectangle
 * covering `region`, so the capture is exactly the board content at 1:1 before scaling.
 */
export function prepareExportClone(clonedDoc, { region, mode, background, pattern }) {
  const world = clonedDoc.querySelector('.inspire-canvas-world');
  if (world) { world.style.transform = 'none'; world.style.transition = 'none'; }
  const viewport = clonedDoc.querySelector('.inspire-viewport');
  if (viewport) viewport.style.overflow = 'visible';
  const artboard = clonedDoc.getElementById('inspire_artboard');
  if (!artboard) return;
  for (const sel of ['.inspire-guides-layer', '.inspire-selection-overlay', '.inspire-marquee-box']) {
    clonedDoc.querySelectorAll(sel).forEach((n) => { n.style.display = 'none'; });
  }
  if (mode !== 'infinite') return;
  artboard.className = 'inspire-artboard';
  Object.assign(artboard.style, {
    width: `${region.width}px`,
    height: `${region.height}px`,
    backgroundColor: background || '#ffffff',
    boxShadow: 'none',
    borderRadius: '0',
    overflow: 'hidden',
    ...gridBackgroundStyle(pattern || 'blank', 1, -region.x, -region.y)
  });
  const shift = `translate(${-region.x}px, ${-region.y}px)`;
  artboard.querySelectorAll('.inspire-elements-layer, .inspire-connectors-layer').forEach((layer) => {
    layer.style.transform = shift;
    layer.style.transformOrigin = '0 0';
    layer.style.overflow = 'visible';
  });
  artboard.querySelectorAll('svg.connectors-svg').forEach((svg) => { svg.style.overflow = 'visible'; });
}
