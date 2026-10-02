/**
 * Visteras Inspire — Moodboard Auto-Layout Generators
 * Canva & Pinterest style smart arrangement algorithms with universal auto-fit guarantees.
 */

import { hexToRgb } from './color-extractor.js';

function getHue(hex) {
  if (!hex) return 0;
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const d = max - min;
  if (d === 0) return 0;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
  }
  return h * 60;
}

/**
 * Universal auto-fit helper:
 * Scales and bounds-clamps element updates so that the entire layout strictly fits
 * within the specified artboard bounds without overflowing or clipping.
 */
function fitUpdatesToBounds(updates, bounds, padding = 0) {
  if (!updates || !updates.length) return updates;

  // Calculate overall bounding box accounting for element rotation
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const u of updates) {
    const rot = u.rotation || 0;
    const rad = (rot * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const bbW = u.width * cos + u.height * sin;
    const bbH = u.width * sin + u.height * cos;
    const cx = u.x + u.width / 2;
    const cy = u.y + u.height / 2;

    minX = Math.min(minX, cx - bbW / 2);
    minY = Math.min(minY, cy - bbH / 2);
    maxX = Math.max(maxX, cx + bbW / 2);
    maxY = Math.max(maxY, cy + bbH / 2);
  }

  const currentW = maxX - minX;
  const currentH = maxY - minY;
  if (currentW <= 0 || currentH <= 0) return updates;

  const targetW = bounds.width - 2 * padding;
  const targetH = bounds.height - 2 * padding;

  if (targetW <= 0 || targetH <= 0) return updates;

  const scaleX = targetW / currentW;
  const scaleY = targetH / currentH;
  // If the layout exceeds the bounds in width or height, scale it down to fit.
  const scale = Math.min(scaleX, scaleY, 1.0);

  // If already strictly inside bounds and no scale needed, perform a light safety clamp only
  if (scale >= 0.999 && minX >= bounds.x && minY >= bounds.y && maxX <= bounds.x + bounds.width && maxY <= bounds.y + bounds.height) {
    return updates;
  }

  const scaledW = currentW * scale;
  const scaledH = currentH * scale;

  // Center the scaled bounding box inside bounds
  const destMinX = bounds.x + padding + (targetW - scaledW) / 2;
  const destMinY = bounds.y + padding + (targetH - scaledH) / 2;

  return updates.map(u => {
    const rot = u.rotation || 0;
    const rad = (rot * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));

    const origCx = u.x + u.width / 2;
    const origCy = u.y + u.height / 2;
    const relCx = origCx - minX;
    const relCy = origCy - minY;

    const newW = Math.max(20, Math.round(u.width * scale));
    const newH = Math.max(20, Math.round(u.height * scale));
    const newCx = destMinX + relCx * scale;
    const newCy = destMinY + relCy * scale;

    const newBbW = newW * cos + newH * sin;
    const newBbH = newW * sin + newH * cos;
    const halfBbW = newBbW / 2;
    const halfBbH = newBbH / 2;

    let clampedCx = newCx;
    let clampedCy = newCy;

    if (clampedCx - halfBbW < bounds.x) {
      clampedCx = bounds.x + halfBbW;
    }
    if (clampedCx + halfBbW > bounds.x + bounds.width) {
      clampedCx = bounds.x + bounds.width - halfBbW;
    }
    if (clampedCy - halfBbH < bounds.y) {
      clampedCy = bounds.y + halfBbH;
    }
    if (clampedCy + halfBbH > bounds.y + bounds.height) {
      clampedCy = bounds.y + bounds.height - halfBbH;
    }

    return {
      ...u,
      x: Math.round(clampedCx - newW / 2),
      y: Math.round(clampedCy - newH / 2),
      width: newW,
      height: newH
    };
  });
}

export const MoodboardLayouts = {
  /**
   * Masonry Layout: Packs elements into balanced columns (Pinterest / Canva style)
   * Auto-fits all elements strictly within the artboard bounds.
   */
  masonry(elements, { bounds = { x: 80, y: 80, width: 1760, height: 920 }, columns, gap = 24 } = {}) {
    if (!elements || !elements.length) return [];

    if (elements.length === 1) {
      const origAspect = (elements[0].width && elements[0].height) ? (elements[0].width / elements[0].height) : 4 / 3;
      let w = Math.round(bounds.width * 0.7);
      let h = Math.round(w / origAspect);
      if (h > bounds.height * 0.85) {
        h = Math.round(bounds.height * 0.85);
        w = Math.round(h * origAspect);
      }
      return [{
        id: elements[0].id,
        x: Math.round(bounds.x + (bounds.width - w) / 2),
        y: Math.round(bounds.y + (bounds.height - h) / 2),
        width: w,
        height: h,
        rotation: 0
      }];
    }

    // Auto-select optimal column count if not specified
    let count;
    if (columns) {
      count = Math.max(1, Math.min(columns, elements.length));
    } else {
      const boardAspect = bounds.width / Math.max(1, bounds.height);
      const ideal = Math.round(Math.sqrt(elements.length * boardAspect * 0.85));
      count = Math.max(1, Math.min(elements.length, Math.min(6, Math.max(2, ideal))));
    }

    const effectiveGap = Math.min(gap, Math.floor(bounds.width / (count * 8)));
    const totalGaps = (count - 1) * effectiveGap;
    const colWidth = Math.max(30, Math.floor((bounds.width - totalGaps) / count));

    const colHeights = new Array(count).fill(bounds.y);
    const updates = [];

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      // Distribute first `count` elements across distinct columns, then find shortest
      let minCol = 0;
      if (i < count) {
        minCol = i;
      } else {
        for (let c = 1; c < count; c++) {
          if (colHeights[c] < colHeights[minCol]) {
            minCol = c;
          }
        }
      }

      const x = bounds.x + minCol * (colWidth + effectiveGap);
      const y = colHeights[minCol];

      // Maintain aspect ratio or reasonable card height
      const origAspect = (el.width && el.height) ? (el.height / el.width) : 0.75;
      const h = Math.round(colWidth * Math.max(0.35, Math.min(1.8, origAspect)));

      updates.push({
        id: el.id,
        x,
        y,
        width: colWidth,
        height: h,
        rotation: 0
      });

      colHeights[minCol] += h + effectiveGap;
    }

    // Ensure all items auto-fit within board bounds
    return fitUpdatesToBounds(updates, bounds);
  },

  /**
   * Editorial Grid: Magazine spread with a dominant Hero element and balanced supporting tiles
   * Auto-fits all elements strictly within the artboard bounds.
   */
  editorial(elements, { bounds = { x: 80, y: 80, width: 1760, height: 920 }, gap = 24 } = {}) {
    if (!elements || !elements.length) return [];
    if (elements.length === 1) {
      const origAspect = (elements[0].width && elements[0].height) ? (elements[0].width / elements[0].height) : 4 / 3;
      let w = Math.round(bounds.width * 0.7);
      let h = Math.round(w / origAspect);
      if (h > bounds.height * 0.85) {
        h = Math.round(bounds.height * 0.85);
        w = Math.round(h * origAspect);
      }
      return [{
        id: elements[0].id,
        x: Math.round(bounds.x + (bounds.width - w) / 2),
        y: Math.round(bounds.y + (bounds.height - h) / 2),
        width: w,
        height: h,
        rotation: 0
      }];
    }

    const updates = [];
    const effectiveGap = Math.min(gap, Math.floor(bounds.width / 30));
    const heroRatio = elements.length === 2 ? 0.56 : 0.52;
    const heroWidth = Math.round((bounds.width - effectiveGap) * heroRatio);
    const heroHeight = bounds.height;

    // Element 0: Hero
    updates.push({
      id: elements[0].id,
      x: bounds.x,
      y: bounds.y,
      width: heroWidth,
      height: heroHeight,
      rotation: 0
    });

    // Remaining elements stacked in structured side grid
    const remaining = elements.slice(1);
    const sideX = bounds.x + heroWidth + effectiveGap;
    const sideWidth = bounds.width - heroWidth - effectiveGap;
    const sideHeight = bounds.height;

    // Calculate grid for remaining elements so all items get their own non-overlapping slot
    let sideCols = 1;
    if (remaining.length > 3) {
      const sideAspect = sideWidth / Math.max(1, sideHeight);
      sideCols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(remaining.length * sideAspect * 0.8))));
    }
    const sideRows = Math.ceil(remaining.length / sideCols);

    const sideGapsX = (sideCols - 1) * effectiveGap;
    const sideGapsY = (sideRows - 1) * effectiveGap;
    const itemW = Math.max(20, Math.floor((sideWidth - sideGapsX) / sideCols));
    const itemH = Math.max(20, Math.floor((sideHeight - sideGapsY) / sideRows));

    remaining.forEach((el, idx) => {
      const c = idx % sideCols;
      const r = Math.floor(idx / sideCols);
      updates.push({
        id: el.id,
        x: sideX + c * (itemW + effectiveGap),
        y: bounds.y + r * (itemH + effectiveGap),
        width: itemW,
        height: itemH,
        rotation: 0
      });
    });

    return fitUpdatesToBounds(updates, bounds);
  },

  /**
   * Color Flow: Orders elements by dominant chromatic hue and spreads them in a smooth spectrum
   * Auto-fits all elements strictly within the artboard bounds.
   */
  colorFlow(elements, { bounds = { x: 80, y: 80, width: 1760, height: 920 }, gap = 24 } = {}) {
    if (!elements || !elements.length) return [];

    // Sort elements by hue
    const sorted = [...elements].sort((a, b) => {
      const hueA = a.data?.colors?.[0] ? getHue(a.data.colors[0]) : (a.data?.hex ? getHue(a.data.hex) : 180);
      const hueB = b.data?.colors?.[0] ? getHue(b.data.colors[0]) : (b.data?.hex ? getHue(b.data.hex) : 180);
      return hueA - hueB;
    });

    const count = sorted.length;
    const boardAspect = bounds.width / Math.max(1, bounds.height);

    let cols = Math.max(1, Math.min(count, Math.ceil(Math.sqrt(count * boardAspect))));
    let rows = Math.ceil(count / cols);
    while (cols > 1 && (cols - 1) * rows >= count) {
      cols--;
    }

    const effectiveGap = Math.min(gap, Math.floor(Math.min(bounds.width / (cols * 8), bounds.height / (rows * 8))));
    const itemW = Math.max(20, Math.floor((bounds.width - (cols - 1) * effectiveGap) / cols));
    const itemH = Math.max(20, Math.floor((bounds.height - (rows - 1) * effectiveGap) / rows));

    const totalGridW = cols * itemW + (cols - 1) * effectiveGap;
    const totalGridH = rows * itemH + (rows - 1) * effectiveGap;
    const startX = bounds.x + Math.max(0, Math.floor((bounds.width - totalGridW) / 2));
    const startY = bounds.y + Math.max(0, Math.floor((bounds.height - totalGridH) / 2));

    const updates = sorted.map((el, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      return {
        id: el.id,
        x: startX + c * (itemW + effectiveGap),
        y: startY + r * (itemH + effectiveGap),
        width: itemW,
        height: itemH,
        rotation: 0
      };
    });

    return fitUpdatesToBounds(updates, bounds);
  },

  /**
   * Collage / Creative Cluster: Organic overlapping arrangement with subtle rotations & polaroid styling
   * Auto-fits all elements strictly within the artboard bounds.
   */
  collage(elements, { bounds = { x: 120, y: 120, width: 1680, height: 840 }, gap = 40 } = {}) {
    if (!elements || !elements.length) return [];
    const count = elements.length;
    const boardAspect = bounds.width / Math.max(1, bounds.height);
    let cols = Math.max(1, Math.min(count, Math.ceil(Math.sqrt(count * boardAspect * 1.1))));
    let rows = Math.ceil(count / cols);
    while (cols > 1 && (cols - 1) * rows >= count) {
      cols--;
    }

    const effectiveGap = Math.min(gap, Math.floor(Math.min(bounds.width / (cols * 6), bounds.height / (rows * 6))));
    const cellW = Math.max(30, (bounds.width - (cols - 1) * effectiveGap) / cols);
    const cellH = Math.max(30, (bounds.height - (rows - 1) * effectiveGap) / rows);

    const rotations = [-3, 2, -1.5, 3.5, -2.5, 1, -4, 2.5];

    const rawUpdates = elements.map((el, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);

      // Add a small playful jitter
      const jitterX = (Math.sin(i * 9.1) * effectiveGap * 0.35);
      const jitterY = (Math.cos(i * 7.3) * effectiveGap * 0.35);
      const rot = rotations[i % rotations.length];

      const w = Math.round(cellW * 0.92);
      const h = Math.round(cellH * 0.90);

      return {
        id: el.id,
        x: Math.round(bounds.x + c * (cellW + effectiveGap) + jitterX),
        y: Math.round(bounds.y + r * (cellH + effectiveGap) + jitterY),
        width: w,
        height: h,
        rotation: rot,
        data: {
          ...el.data,
          polaroid: el.type === 'image' ? true : el.data?.polaroid
        }
      };
    });

    // Auto-fit to bounds accounting for rotations and jitters
    return fitUpdatesToBounds(rawUpdates, bounds, 12);
  }
};
