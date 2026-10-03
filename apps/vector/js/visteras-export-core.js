/**
 * Visteras Vector — export core (pure, no DOM, no imports).
 *
 * Scope rects, pixel sizes, per-browser canvas limits, file names, remembered
 * settings, Document Raster Effects Settings, PNG pHYs (DPI) chunk, CRC32, a
 * store-only ZIP writer/reader and @font-face parsing with unicode-range
 * filtering. Used by js/visteras-export.js (dialogs + rendering).
 */
export const SETTINGS_KEY = 'visteras-vector-export-settings';
export const PPI_PRESETS = [72, 150, 300];
export const SCALE_PRESETS = [0.5, 1, 1.5, 2, 3, 4];
export const SCREEN_FORMATS = ['png', 'jpg100', 'jpg85', 'jpg50', 'jpg25', 'svg'];
export const AS_FORMATS = ['png', 'jpg', 'svg', 'pdf'];
export const BACKGROUNDS = ['transparent', 'white', 'black', 'artboard', 'other'];
export const SCOPES = ['artboard', 'selection', 'full'];

const r4 = (n) => Math.round(n * 10000) / 10000;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi, d) => (isNum(Number(v)) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Number(v))) : d);
const hex6 = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);

/* ───────────── rects ───────────── */

export function unionRect(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

export const padRect = (rc, p = 0) => (rc ? { x: r4(rc.x - p), y: r4(rc.y - p), width: r4(rc.width + p * 2), height: r4(rc.height + p * 2) } : rc);

/**
 * Export scope in document units. `selection` / `full` are already-unioned visual
 * bounds (effects included). Full = union of the artboard and all visible art.
 * Padding (document px) is added before scaling. Returns null when empty.
 */
export function scopeRect({ scope = 'artboard', artboard, selection = null, full = null, padding = 0 } = {}) {
  let rc;
  if (scope === 'selection') rc = selection;
  else if (scope === 'full') rc = unionRect(artboard, full);
  else rc = artboard;
  if (!rc || !(rc.width > 0) || !(rc.height > 0)) return null;
  return padRect(rc, Math.max(0, Number(padding) || 0));
}

/** Target pixels for a rect at `scale` (vector rendered at that size, not upscaled). */
export function pixelSize(rc, scale = 1) {
  return { w: Math.max(1, Math.round(rc.width * scale)), h: Math.max(1, Math.round(rc.height * scale)) };
}

export const scaleForPpi = (ppi) => (Number(ppi) > 0 ? Number(ppi) / 72 : 1);

/* ───────────── canvas limits ───────────── */

export function isIOS(ua = '', maxTouchPoints = 0) {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/**
 * Conservative per-browser canvas caps (exact figures vary; checked at runtime too:
 * a null toBlob is reported as out of memory). iOS/iPadOS Safari: 16.7 MP.
 */
export function canvasLimits(ua = '', maxTouchPoints = 0) {
  return { maxSide: 16384, maxArea: isIOS(ua, maxTouchPoints) ? 16777216 : 268435456 };
}

/** Largest scale (2 decimals, rounded down) that fits `rc` in the limits. */
export function maxScaleFor(rc, limits) {
  const bySide = limits.maxSide / Math.max(rc.width, rc.height);
  const byArea = Math.sqrt(limits.maxArea / (rc.width * rc.height));
  return Math.floor(Math.min(bySide, byArea) * 100) / 100;
}

export function checkSize(w, h, limits) {
  return w <= limits.maxSide && h <= limits.maxSide && w * h <= limits.maxArea;
}

export const scaleLabel = (s) => `${Math.round(Number(s) * 100) / 100}×`;

export function tooLargeMessage(rc, scale, limits) {
  const { w, h } = pixelSize(rc, scale);
  return `Too large at ${scaleLabel(scale)} (${w}×${h} px; max ≈ ${maxScaleFor(rc, limits)}× for this browser)`;
}

/* ───────────── names ───────────── */

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;
export function safeBase(name, fallback = 'Untitled') {
  const base = String(name ?? '').replace(/\.(vvd|svg)$/i, '').replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
  return (base || fallback).slice(0, 120);
}

export function formatInfo(format) {
  const f = String(format || 'png').toLowerCase();
  if (f === 'svg') return { ext: 'svg', mime: 'image/svg+xml', raster: false, label: 'SVG' };
  if (f === 'pdf') return { ext: 'pdf', mime: 'application/pdf', raster: false, label: 'PDF' };
  const jm = /^jpe?g(\d{1,3})?$/.exec(f);
  if (jm) return { ext: 'jpg', mime: 'image/jpeg', raster: true, quality: jm[1] ? Math.min(100, Number(jm[1])) / 100 : 0.85, label: jm[1] ? `JPG ${jm[1]}%` : 'JPG', opaque: true };
  return { ext: 'png', mime: 'image/png', raster: true, label: 'PNG' };
}

/** Illustrator's JPEG Quality 0–10 → toBlob 0–1. */
export const jpegQuality = (q) => clamp(q, 0, 10, 8) / 10;

/** Illustrator Export for Screens sub-folders: by scale for bitmaps, by format otherwise. */
export function subfolderFor(row) {
  const info = formatInfo(row.format);
  return info.raster ? `${r4(Number(row.scale) || 1)}x` : info.label.split(' ')[0];
}

export const defaultSuffix = (scale) => (Number(scale) === 1 ? '' : `@${r4(Number(scale))}x`);

/** `${prefix}${title}${-selection}${suffix}.${ext}`, optionally under a sub-folder. */
export function exportFileName({ prefix = '', title = 'Untitled', scope = 'artboard', suffix = '', ext = 'png', subfolder = '' } = {}) {
  const name = `${safeBase(prefix, '')}${safeBase(title)}${scope === 'selection' ? '-selection' : ''}${safeBase(suffix, '')}.${ext}`;
  return subfolder ? `${safeBase(subfolder, 'export')}/${name}` : name;
}

/** Add " 2", " 3"… to duplicate paths (two rows with the same scale and suffix). */
export function uniquePaths(paths) {
  const seen = new Map();
  return paths.map((p) => {
    const n = seen.get(p) || 0;
    seen.set(p, n + 1);
    if (!n) return p;
    const i = p.lastIndexOf('.');
    return `${p.slice(0, i)} ${n + 1}${p.slice(i)}`;
  });
}

/* ───────────── settings ───────────── */

export const DEFAULT_ROWS = [
  { scale: 1, suffix: '', format: 'png' },
  { scale: 2, suffix: '@2x', format: 'png' },
  { scale: 3, suffix: '@3x', format: 'png' },
];

export const DEFAULT_SETTINGS = Object.freeze({
  v: 1, asFormat: 'png', asPpi: 72, asQuality: 8, asUseArtboard: true, asSelection: false,
  scope: 'artboard', rows: DEFAULT_ROWS, prefix: '', background: 'transparent', bgColor: '#ffffff', padding: 0, subfolders: true,
});

function normRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const scale = clamp(raw.scale, 0.1, 10, 1);
  const format = SCREEN_FORMATS.includes(raw.format) ? raw.format : 'png';
  const suffix = typeof raw.suffix === 'string' ? raw.suffix.slice(0, 40) : defaultSuffix(scale);
  return { scale, suffix, format };
}

/** Remembered settings with defaults; unknown fields dropped; bad values reset. */
export function normalizeSettings(raw) {
  let s = raw;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = null; } }
  if (!s || typeof s !== 'object') s = {};
  const d = DEFAULT_SETTINGS;
  const rows = Array.isArray(s.rows) ? s.rows.map(normRow).filter(Boolean).slice(0, 20) : null;
  return {
    v: 1,
    asFormat: AS_FORMATS.includes(s.asFormat) ? s.asFormat : d.asFormat,
    asPpi: clamp(s.asPpi, 1, 2400, d.asPpi),
    asQuality: clamp(s.asQuality, 0, 10, d.asQuality),
    asUseArtboard: typeof s.asUseArtboard === 'boolean' ? s.asUseArtboard : d.asUseArtboard,
    asSelection: typeof s.asSelection === 'boolean' ? s.asSelection : d.asSelection,
    scope: SCOPES.includes(s.scope) ? s.scope : d.scope,
    rows: rows && rows.length ? rows : DEFAULT_ROWS.map((x) => ({ ...x })),
    prefix: typeof s.prefix === 'string' ? s.prefix.slice(0, 60) : d.prefix,
    background: BACKGROUNDS.includes(s.background) ? s.background : d.background,
    bgColor: hex6(s.bgColor, d.bgColor),
    padding: clamp(s.padding, 0, 2000, d.padding),
    subfolders: typeof s.subfolders === 'boolean' ? s.subfolders : d.subfolders,
  };
}

/** Document Raster Effects Settings (Illustrator: Resolution + Background), per document. */
export const RASTER_DEFAULTS = Object.freeze({ ppi: 72, background: 'white' });
export function normalizeRaster(raw) {
  if (!raw || typeof raw !== 'object') return { ...RASTER_DEFAULTS };
  return { ppi: PPI_PRESETS.includes(Number(raw.ppi)) ? Number(raw.ppi) : clamp(raw.ppi, 1, 2400, 72), background: raw.background === 'transparent' ? 'transparent' : 'white' };
}

/** Colour for a background choice (null = transparent). JPEG never stays transparent. */
export function backgroundColor(choice, { bgColor = '#ffffff', artboard = '#ffffff', opaque = false } = {}) {
  let c = null;
  if (choice === 'white') c = '#ffffff';
  else if (choice === 'black') c = '#000000';
  else if (choice === 'artboard') c = artboard || '#ffffff';
  else if (choice === 'other') c = hex6(bgColor, '#ffffff');
  if (!c && opaque) c = '#ffffff';
  return c;
}

/* ───────────── CRC32 + PNG pHYs ───────────── */

let CRC_TABLE = null;
export function crc32(bytes, crc = 0) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const ascii = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const readU32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

export const ppm = (ppi) => Math.round(Number(ppi) / 0.0254);

function* pngChunks(b) {
  let o = 8;
  while (o + 12 <= b.length) {
    const len = readU32(b, o), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    yield { o, len, type, end: o + 12 + len };
    o += 12 + len;
  }
}

/** Insert (or replace) a pHYs chunk right after IHDR. Returns new bytes. */
export function insertPngPhys(bytes, ppi) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!PNG_SIG.every((v, i) => b[i] === v)) return b;
  const parts = [b.slice(0, 8)];
  const p = ppm(ppi);
  const body = new Uint8Array([...ascii('pHYs'), ...u32(p), ...u32(p), 1]);
  const chunk = new Uint8Array([...u32(9), ...body, ...u32(crc32(body))]);
  for (const c of pngChunks(b)) {
    if (c.type === 'pHYs') continue;
    parts.push(b.slice(c.o, c.end));
    if (c.type === 'IHDR') parts.push(chunk);
  }
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}

/** {ppmX, ppmY, unit, ppi, crcOk} or null. */
export function readPngPhys(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const c of pngChunks(b)) {
    if (c.type !== 'pHYs') continue;
    const x = readU32(b, c.o + 8), y = readU32(b, c.o + 12), unit = b[c.o + 16];
    const crcOk = crc32(b.slice(c.o + 4, c.o + 8 + c.len)) === readU32(b, c.o + 8 + c.len);
    return { ppmX: x, ppmY: y, unit, ppi: Math.round(x * 0.0254 * 100) / 100, crcOk };
  }
  return null;
}

/** Width/height from IHDR. */
export function pngSize(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return { w: readU32(b, 16), h: readU32(b, 20) };
}

/* ───────────── store-only ZIP ───────────── */

const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const toBytes = (d) => (d instanceof Uint8Array ? d : typeof d === 'string' ? enc.encode(d) : new Uint8Array(d));

function dosDateTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(1980, 0, 1);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

/**
 * ZIP with every entry STORED (method 0): PNG/JPEG are already compressed. UTF-8 names
 * (general purpose bit 11). files: [{ name, data: Uint8Array|string, date? }].
 */
export function zipStore(files, now = new Date()) {
  const chunks = [], central = [];
  let offset = 0;
  const le16 = (v) => [v & 255, (v >>> 8) & 255];
  const le32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), data = toBytes(f.data), crc = crc32(data);
    const { time, day } = dosDateTime(f.date || now);
    const common = [...le16(20), ...le16(0x0800), ...le16(0), ...le16(time), ...le16(day), ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0)];
    const local = new Uint8Array([...le32(0x04034b50), ...common]);
    chunks.push(local, name, data);
    central.push(new Uint8Array([...le32(0x02014b50), ...le16(20), ...common, ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length), ...le32(cdSize), ...le32(offset), ...le16(0)]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}

/** Read a stored ZIP via its central directory (tests / smoke). [{ name, data, crcOk }]. */
export function unzipStore(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const le16 = (o) => b[o] | (b[o + 1] << 8);
  const le32 = (o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  let e = b.length - 22;
  while (e >= 0 && le32(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a ZIP');
  const count = le16(e + 10);
  let p = le32(e + 16);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (le32(p) !== 0x02014b50) throw new Error('Bad central directory');
    const method = le16(p + 10), crc = le32(p + 16), size = le32(p + 20), nlen = le16(p + 28), xlen = le16(p + 30), clen = le16(p + 32), loc = le32(p + 42);
    const name = dec.decode(b.slice(p + 46, p + 46 + nlen));
    if (le32(loc) !== 0x04034b50) throw new Error('Bad local header');
    const start = loc + 30 + le16(loc + 26) + le16(loc + 28);
    const data = b.slice(start, start + size);
    out.push({ name, method, data, crcOk: crc32(data) === crc });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/* ───────────── fonts ───────────── */

/** "U+0000-00FF, U+0131, U+02??" → [[0, 255], [305, 305], [512, 767]]. */
export function parseUnicodeRange(str) {
  if (!str) return [[0, 0x10ffff]];
  return String(str).split(',').map((p) => p.trim().replace(/^u\+/i, '')).filter(Boolean).map((p) => {
    if (p.includes('?')) return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)];
    const [a, b2] = p.split('-');
    return [parseInt(a, 16), parseInt(b2 ?? a, 16)];
  }).filter(([a, b2]) => Number.isFinite(a) && Number.isFinite(b2));
}

export const rangesHit = (ranges, codepoints) => codepoints.some((cp) => ranges.some(([a, b]) => cp >= a && cp <= b));

/** @font-face blocks of a stylesheet: [{ family, weight, style, ranges, url, format }]. */
export function parseFontFaces(css) {
  const out = [];
  for (const m of String(css || '').matchAll(/@font-face\s*{([^}]*)}/g)) {
    const body = m[1];
    const prop = (k) => { const r = new RegExp(`${k}\\s*:\\s*([^;]+);?`, 'i').exec(body); return r ? r[1].trim() : null; };
    const family = (prop('font-family') || '').replace(/^['"]|['"]$/g, '');
    const src = prop('src') || '';
    const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(src)?.[1] || null;
    const format = /format\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(src)?.[1] || null;
    const weightRaw = (prop('font-weight') || '400').split(/\s+/);
    out.push({ family, style: (prop('font-style') || 'normal').toLowerCase(), weight: Number(weightRaw[0]) || 400, weightMax: Number(weightRaw[1] || weightRaw[0]) || 400, ranges: parseUnicodeRange(prop('unicode-range')), url, format });
  }
  return out;
}

/** Faces needed to draw `text` in weight/style (closest weight; variable ranges honoured). */
export function pickFaces(faces, { weight = 400, style = 'normal', text = '' } = {}) {
  const cps = [...new Set([...String(text)].map((ch) => ch.codePointAt(0)))];
  const wantItalic = /italic|oblique/.test(style);
  const sameStyle = faces.filter((f) => /italic|oblique/.test(f.style) === wantItalic);
  const pool = sameStyle.length ? sameStyle : faces;
  if (!pool.length) return [];
  const dist = (f) => (weight >= f.weight && weight <= f.weightMax ? 0 : Math.min(Math.abs(f.weight - weight), Math.abs(f.weightMax - weight)));
  const best = Math.min(...pool.map(dist));
  const chosen = pool.filter((f) => dist(f) === best);
  return cps.length ? chosen.filter((f) => rangesHit(f.ranges, cps)) : chosen;
}

/** First family of a CSS font-family list, unquoted. */
export const firstFamily = (list) => String(list || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');

/** css2 URL for one family/weight/style (same host as lib/visteras-fonts.js). */
export function googleCssUrl(family, { weight = 400, italic = false } = {}) {
  const fam = encodeURIComponent(family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${italic ? 1 : 0},${Math.round(weight)}&display=swap`;
}

/** base64 of bytes (chunked; no btoa limits on large fonts). */
export function bytesToBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== 'undefined') return Buffer.from(b).toString('base64');
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fontFaceCss({ family, weight = 400, style = 'normal', mime = 'font/woff2', format = 'woff2', base64, ranges = null }) {
  const range = ranges && !(ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === 0x10ffff)
    ? `;unicode-range:${ranges.map(([a, b]) => (a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`)).join(',')}` : '';
  return `@font-face{font-family:"${String(family).replace(/"/g, '')}";font-style:${style};font-weight:${weight};src:url(data:${mime};base64,${base64})${format ? ` format("${format}")` : ''}${range}}`;
}
