/**
 * Visteras Inspire — Dominant Color Palette Extractor
 * 100% client-side color clustering and color naming utility.
 */

const COLOR_NAMES_MAP = [
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Warm Cream', hex: '#fdfbf7' },
  { name: 'Soft Sand', hex: '#e2d9cc' },
  { name: 'Warm Taupe', hex: '#a89f91' },
  { name: 'Charcoal', hex: '#2b2b2b' },
  { name: 'Jet Black', hex: '#111111' },
  { name: 'Amber Gold', hex: '#f59e0b' },
  { name: 'Tuscan Ochre', hex: '#d97706' },
  { name: 'Burnt Terracotta', hex: '#c2410c' },
  { name: 'Rust Red', hex: '#b91c1c' },
  { name: 'Crimson Rose', hex: '#e11d48' },
  { name: 'Blush Pink', hex: '#f472b6' },
  { name: 'Lilac Mist', hex: '#c084fc' },
  { name: 'Deep Violet', hex: '#6b21a8' },
  { name: 'Midnight Navy', hex: '#1e1b4b' },
  { name: 'Cobalt Blue', hex: '#1d4ed8' },
  { name: 'Electric Cyan', hex: '#06b6d4' },
  { name: 'Muted Teal', hex: '#0f766e' },
  { name: 'Sage Green', hex: '#4d7c0f' },
  { name: 'Emerald Forest', hex: '#065f46' },
  { name: 'Olive Bronze', hex: '#854d0e' },
  { name: 'Slate Gray', hex: '#475569' },
  { name: 'Cool Slate', hex: '#64748b' }
];

export function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export function rgbToHex(r, g, b) {
  const h = (1 << 24) + (r << 16) + (g << 8) + b;
  return '#' + h.toString(16).slice(1);
}

export function colorDistance(rgb1, rgb2) {
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  // Weighted Euclidean distance for human perception
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

export function getNearestColorName(hex) {
  const rgb = hexToRgb(hex);
  let bestName = 'Custom Tone';
  let minDistance = Infinity;

  for (const item of COLOR_NAMES_MAP) {
    const itemRgb = hexToRgb(item.hex);
    const d = colorDistance(rgb, itemRgb);
    if (d < minDistance) {
      minDistance = d;
      bestName = item.name;
    }
  }
  return bestName;
}

export function isDarkColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  // HSP color model perception
  const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  return hsp < 127.5;
}

/**
 * Extracts dominant color palette from an image source
 * @param {HTMLImageElement|string} imgSource Image element or data URL
 * @param {number} maxColors Number of colors to return (default 5)
 * @returns {Promise<Array<{hex: string, rgb: string, name: string, isDark: boolean}>>}
 */
export async function extractPaletteFromImage(imgSource, maxColors = 5) {
  let img;
  if (typeof imgSource === 'string') {
    img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = imgSource;
    });
  } else {
    img = imgSource;
  }

  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size).data;

  // Quantize colors into 16x16x16 color cube buckets
  const buckets = new Map();
  for (let i = 0; i < imgData.length; i += 4) {
    const a = imgData[i + 3];
    if (a < 128) continue; // skip transparent

    const r = Math.round(imgData[i] / 16) * 16;
    const g = Math.round(imgData[i + 1] / 16) * 16;
    const b = Math.round(imgData[i + 2] / 16) * 16;
    const key = `${r},${g},${b}`;

    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  // Sort buckets by frequency
  const sorted = Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r: Math.min(255, r), g: Math.min(255, g), b: Math.min(255, b) };
    });

  // Filter distinct colors with minimal perceptual distance
  const distinct = [];
  const minThreshold = 65;

  for (const c of sorted) {
    if (distinct.length >= maxColors) break;
    const isTooClose = distinct.some(d => colorDistance(c, d) < minThreshold);
    if (!isTooClose) {
      distinct.push(c);
    }
  }

  // If not enough distinct colors, fill with remaining frequent
  if (distinct.length < maxColors) {
    for (const c of sorted) {
      if (distinct.length >= maxColors) break;
      if (!distinct.includes(c)) distinct.push(c);
    }
  }

  return distinct.map(c => {
    const hex = rgbToHex(c.r, c.g, c.b);
    return {
      hex,
      rgb: `rgb(${c.r}, ${c.g}, ${c.b})`,
      name: getNearestColorName(hex),
      isDark: isDarkColor(hex)
    };
  });
}
