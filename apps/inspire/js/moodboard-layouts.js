/**
 * Visteras Inspire — Moodboard Auto-Layout Generators
 * Canva & Pinterest style smart arrangement algorithms.
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

export const MoodboardLayouts = {
  /**
   * Masonry Layout: Packs elements into 3 or 4 balanced columns (Pinterest / Canva style)
   */
  masonry(elements, { bounds = { x: 80, y: 80, width: 1760, height: 920 }, columns = 3, gap = 24 } = {}) {
    if (!elements || !elements.length) return [];
    const count = Math.max(1, Math.min(columns, elements.length));
    const totalGaps = (count - 1) * gap;
    const colWidth = Math.floor((bounds.width - totalGaps) / count);

    const colHeights = new Array(count).fill(bounds.y);
    const updates = [];

    for (const el of elements) {
      // Find shortest column
      let minCol = 0;
      for (let c = 1; c < count; c++) {
        if (colHeights[c] < colHeights[minCol]) {
          minCol = c;
        }
      }

      const x = bounds.x + minCol * (colWidth + gap);
      const y = colHeights[minCol];

      // Maintain aspect ratio or reasonable card height
      const origAspect = (el.width && el.height) ? (el.height / el.width) : 0.75;
      const h = Math.round(colWidth * Math.max(0.4, Math.min(1.8, origAspect)));

      updates.push({
        id: el.id,
        x,
        y,
        width: colWidth,
        height: h,
        rotation: 0
      });

      colHeights[minCol] += h + gap;
    }

    return updates;
  },

  /**
   * Editorial Grid: Magazine spread with a dominant Hero element and balanced supporting tiles
   */
  editorial(elements, { bounds = { x: 80, y: 80, width: 1760, height: 920 }, gap = 24 } = {}) {
    if (!elements || !elements.length) return [];
    if (elements.length === 1) {
      return [{
        id: elements[0].id,
        x: bounds.x + (bounds.width - 800) / 2,
        y: bounds.y + (bounds.height - 600) / 2,
        width: 800,
        height: 600,
        rotation: 0
      }];
    }

    const updates = [];
    const heroWidth = Math.round(bounds.width * 0.54);
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

    // Remaining elements stacked in side columns / grid
    const remaining = elements.slice(1);
    const sideX = bounds.x + heroWidth + gap;
    const sideWidth = bounds.width - heroWidth - gap;

    const rows = Math.min(remaining.length, 3);
    const sideItemHeight = Math.floor((heroHeight - (rows - 1) * gap) / rows);

    remaining.forEach((el, idx) => {
      if (idx < rows) {
        updates.push({
          id: el.id,
          x: sideX,
          y: bounds.y + idx * (sideItemHeight + gap),
          width: sideWidth,
          height: sideItemHeight,
          rotation: 0
        });
      } else {
        // Overflow wrapped underneath or tiled
        const colIdx = idx % 2;
        const subW = Math.floor((sideWidth - gap) / 2);
        updates.push({
          id: el.id,
          x: sideX + colIdx * (subW + gap),
          y: bounds.y + (idx % rows) * (sideItemHeight + gap),
          width: subW,
          height: sideItemHeight,
          rotation: 0
        });
      }
    });

    return updates;
  },

  /**
   * Color Flow: Orders elements by dominant chromatic hue and spreads them in a smooth spectrum
   */
  colorFlow(elements, { bounds = { x: 80, y: 80, width: 1760, height: 920 }, gap = 24 } = {}) {
    if (!elements || !elements.length) return [];

    // Sort elements by hue
    const sorted = [...elements].sort((a, b) => {
      const hueA = a.data?.colors?.[0] ? getHue(a.data.colors[0]) : (a.data?.hex ? getHue(a.data.hex) : 180);
      const hueB = b.data?.colors?.[0] ? getHue(b.data.colors[0]) : (b.data?.hex ? getHue(b.data.hex) : 180);
      return hueA - hueB;
    });

    const cols = Math.min(sorted.length, 4);
    const rows = Math.ceil(sorted.length / cols);
    const itemW = Math.floor((bounds.width - (cols - 1) * gap) / cols);
    const itemH = Math.floor((bounds.height - (rows - 1) * gap) / rows);

    return sorted.map((el, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      return {
        id: el.id,
        x: bounds.x + c * (itemW + gap),
        y: bounds.y + r * (itemH + gap),
        width: itemW,
        height: itemH,
        rotation: 0
      };
    });
  },

  /**
   * Collage / Creative Cluster: Organic overlapping arrangement with subtle rotations & polaroid styling
   */
  collage(elements, { bounds = { x: 120, y: 120, width: 1680, height: 840 }, gap = 40 } = {}) {
    if (!elements || !elements.length) return [];
    const count = elements.length;
    const cols = Math.ceil(Math.sqrt(count * 1.3));
    const rows = Math.ceil(count / cols);

    const cellW = (bounds.width - (cols - 1) * gap) / cols;
    const cellH = (bounds.height - (rows - 1) * gap) / rows;

    const rotations = [-3, 2, -1.5, 3.5, -2.5, 1, -4, 2.5];

    return elements.map((el, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);

      // Add a small playful jitter
      const jitterX = (Math.sin(i * 9.1) * gap * 0.4);
      const jitterY = (Math.cos(i * 7.3) * gap * 0.4);
      const rot = rotations[i % rotations.length];

      const w = Math.round(cellW * 0.94);
      const h = Math.round(cellH * 0.92);

      return {
        id: el.id,
        x: Math.round(bounds.x + c * (cellW + gap) + jitterX),
        y: Math.round(bounds.y + r * (cellH + gap) + jitterY),
        width: w,
        height: h,
        rotation: rot,
        data: {
          ...el.data,
          polaroid: el.type === 'image' ? true : el.data?.polaroid
        }
      };
    });
  }
};
