/**
 * Document presets for Vector New Document modal (Studio-inspired, local copy).
 * Physical units convert at 96 CSS px / in (browser / SVG-edit).
 * Ruler/document units are independent of type/stroke units.
 */

export const PX_PER_INCH = 96;

export const DOCUMENT_PRESETS = {
  web: [
    { id: 'web_800x600', name: 'Web Compact', width: 800, height: 600, unit: 'px', category: 'web', description: '800 × 600' },
    { id: 'web_1280x720', name: 'Web Small', width: 1280, height: 720, unit: 'px', category: 'web', description: '1280 × 720 (HD 16:9)' },
    { id: 'web_1440x900', name: 'Web Medium', width: 1440, height: 900, unit: 'px', category: 'web', description: '1440 × 900 (16:10)' },
    { id: 'web_1920x1080', name: 'Web Large (Full HD)', width: 1920, height: 1080, unit: 'px', category: 'web', description: '1920 × 1080' },
    { id: 'web_2560x1440', name: 'Web 2K (QHD)', width: 2560, height: 1440, unit: 'px', category: 'web', description: '2560 × 1440' },
  ],
  print: [
    { id: 'print_letter', name: 'Letter', width: 8.5, height: 11, unit: 'in', category: 'print', description: '8.5 × 11 in' },
    { id: 'print_legal', name: 'Legal', width: 8.5, height: 14, unit: 'in', category: 'print', description: '8.5 × 14 in' },
    { id: 'print_tabloid', name: 'Tabloid', width: 11, height: 17, unit: 'in', category: 'print', description: '11 × 17 in' },
    { id: 'print_a5', name: 'A5', width: 148, height: 210, unit: 'mm', category: 'print', description: '148 × 210 mm' },
    { id: 'print_a4', name: 'A4', width: 210, height: 297, unit: 'mm', category: 'print', description: '210 × 297 mm' },
    { id: 'print_a3', name: 'A3', width: 297, height: 420, unit: 'mm', category: 'print', description: '297 × 420 mm' },
  ],
  social: [
    { id: 'social_ig_square', name: 'Instagram Square', width: 1080, height: 1080, unit: 'px', category: 'social', description: '1080 × 1080' },
    { id: 'social_ig_portrait', name: 'Instagram Portrait', width: 1080, height: 1350, unit: 'px', category: 'social', description: '1080 × 1350' },
    { id: 'social_ig_story', name: 'Instagram Story / Reel', width: 1080, height: 1920, unit: 'px', category: 'social', description: '1080 × 1920' },
    { id: 'social_yt_thumb', name: 'YouTube Thumbnail', width: 1280, height: 720, unit: 'px', category: 'social', description: '1280 × 720' },
    { id: 'social_x_post', name: 'X / Twitter Post', width: 1600, height: 900, unit: 'px', category: 'social', description: '1600 × 900' },
    { id: 'social_fb_post', name: 'Facebook Post', width: 1200, height: 630, unit: 'px', category: 'social', description: '1200 × 630' },
  ],
  mobile: [
    { id: 'mobile_iphone', name: 'iPhone 16 / 15 Pro', width: 1179, height: 2556, unit: 'px', category: 'mobile', description: '1179 × 2556' },
    { id: 'mobile_iphone_max', name: 'iPhone Pro Max', width: 1290, height: 2796, unit: 'px', category: 'mobile', description: '1290 × 2796' },
    { id: 'mobile_galaxy', name: 'Galaxy S24 Ultra', width: 1440, height: 3120, unit: 'px', category: 'mobile', description: '1440 × 3120' },
  ],
  misc: [
    { id: 'misc_512', name: 'Icon 512', width: 512, height: 512, unit: 'px', category: 'misc', description: '512 × 512' },
    { id: 'misc_1024', name: 'Icon 1024', width: 1024, height: 1024, unit: 'px', category: 'misc', description: '1024 × 1024' },
    { id: 'misc_custom', name: 'Custom Canvas', width: 1920, height: 1080, unit: 'px', category: 'misc', description: '1920 × 1080' },
  ],
};

export const CATEGORIES = [
  { id: 'recent', label: 'Recent' },
  { id: 'web', label: 'Web' },
  { id: 'print', label: 'Print' },
  { id: 'social', label: 'Social' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'misc', label: 'Misc' },
];

export const UNITS = [
  { id: 'px', label: 'Pixels (px)' },
  { id: 'in', label: 'Inches (in)' },
  { id: 'cm', label: 'Centimeters (cm)' },
  { id: 'mm', label: 'Millimeters (mm)' },
];

export function convertToPixels(val, unit, pxPerInch = PX_PER_INCH) {
  const num = parseFloat(val) || 0;
  const ppi = parseFloat(pxPerInch) || PX_PER_INCH;
  switch (unit) {
    case 'in': return num * ppi;
    case 'cm': return (num / 2.54) * ppi;
    case 'mm': return (num / 25.4) * ppi;
    case 'px':
    default: return num;
  }
}

export function convertFromPixels(pixels, targetUnit, pxPerInch = PX_PER_INCH) {
  const px = parseFloat(pixels) || 0;
  const ppi = parseFloat(pxPerInch) || PX_PER_INCH;
  switch (targetUnit) {
    case 'in': return parseFloat((px / ppi).toFixed(3));
    case 'cm': return parseFloat(((px / ppi) * 2.54).toFixed(2));
    case 'mm': return parseFloat(((px / ppi) * 25.4).toFixed(1));
    case 'px':
    default: return Math.round(px);
  }
}

export function convertUnits(val, sourceUnit, targetUnit, pxPerInch = PX_PER_INCH) {
  if (sourceUnit === targetUnit) return parseFloat(val) || 0;
  return convertFromPixels(convertToPixels(val, sourceUnit, pxPerInch), targetUnit, pxPerInch);
}

export function formatPresetDimensions(preset) {
  if (!preset) return '';
  return `${preset.width} × ${preset.height} ${preset.unit || 'px'}`;
}

export function formatSize(widthPx, heightPx, unit = 'px') {
  const w = convertFromPixels(widthPx, unit);
  const h = convertFromPixels(heightPx, unit);
  if (unit === 'px') return `${Math.round(w)} × ${Math.round(h)} px`;
  return `${w} × ${h} ${unit}`;
}
