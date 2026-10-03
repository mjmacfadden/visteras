/**
 * Visteras Vector — effective fill/stroke paint resolver.
 *
 * One place that answers "what colour does this object's fill/stroke actually
 * render with", used by every colour well (Properties/Appearance chips,
 * toolbar swatches, Color panel working colour).
 *
 * • Inside/Outside stroke-align bodies carry stroke="none" (their helper
 *   paints the ring); the real stroke is data-visteras-stroke-paint.
 * • Everything else uses the computed style, so a presentation attribute,
 *   style="stroke:…", a CSS class and paint inherited from a parent group all
 *   resolve the same way the renderer does. Attribute / inline style are the
 *   fallback when no computed style is available.
 * • Helpers and wraps are mapped to their body by the caller-supplied
 *   resolveBody (colour system), so a well never reads the 2× helper.
 * • Read-only: nothing here writes to the document.
 */

const STROKE_ALIGN_ATTR = 'data-visteras-stroke-align';
const STROKE_PAINT_ATTR = 'data-visteras-stroke-paint';

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');

/**
 * Parse a CSS/SVG paint value.
 * @param {string|null|undefined} v
 * @returns {{none:boolean, hex:string|null, gradient:boolean, ref?:string|null}|null} null = no information
 */
export function parseCssPaint(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'inherit' || s === 'currentcolor' || s === 'context-stroke' || s === 'context-fill') return null;
  if (s === 'none' || s === 'transparent') return { none: true, hex: null, gradient: false };
  if (s.startsWith('url(')) {
    // ref = the referenced id (computed style may expand to an absolute URL)
    const ref = String(v).match(/#([^"')\s]+)/);
    return { none: false, hex: null, gradient: true, ref: ref ? ref[1] : null };
  }
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return { none: false, hex: `#${h}`, gradient: false };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/);
  if (m) {
    if (m[4] != null) {
      const a = Number(m[4]) / (m[5] ? 100 : 1);
      if (a === 0) return { none: true, hex: null, gradient: false };
    }
    return { none: false, hex: `#${hex2(m[1])}${hex2(m[2])}${hex2(m[3])}`, gradient: false };
  }
  const named = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080' };
  if (named[s]) return { none: false, hex: named[s], gradient: false };
  return null;
}

function inlineStyle(el, prop) {
  try {
    const v = el?.style?.getPropertyValue?.(prop);
    if (v) return v;
  } catch { /* ignore */ }
  const raw = el?.getAttribute?.('style');
  if (!raw) return null;
  const m = raw.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;!]+)`, 'i'));
  return m ? m[1].trim() : null;
}

/**
 * Effective paint of one element.
 * @param {Element} el
 * @param {'fill'|'stroke'} which
 * @param {{getComputedStyle?:Function, resolveBody?:Function}} [opts]
 * @returns {{none:boolean, hex:string|null, gradient:boolean, source:string}|null}
 */
export function resolveElementPaint(el, which, opts = {}) {
  if (!el) return null;
  const body = (opts.resolveBody && opts.resolveBody(el)) || el;
  const get = (n) => (typeof body.getAttribute === 'function' ? body.getAttribute(n) : null);
  if (which === 'stroke') {
    const align = String(get(STROKE_ALIGN_ATTR) || '').toLowerCase();
    if (align === 'inside' || align === 'outside') {
      const stored = parseCssPaint(get(STROKE_PAINT_ATTR));
      if (stored) return { ...stored, source: 'align-paint' };
    }
  }
  const getCS = opts.getComputedStyle || (typeof getComputedStyle === 'function' ? getComputedStyle : null);
  if (getCS && body.isConnected !== false) {
    try {
      const cs = getCS(body);
      const v = cs?.getPropertyValue ? cs.getPropertyValue(which) : cs?.[which];
      const parsed = parseCssPaint(v);
      if (parsed) return { ...parsed, source: 'computed' };
    } catch { /* fall through */ }
  }
  const style = parseCssPaint(inlineStyle(body, which));
  if (style) return { ...style, source: 'style' };
  const attr = parseCssPaint(get(which));
  if (attr) return { ...attr, source: 'attribute' };
  return null;
}

/** Topmost first (reverse document order); elements without DOM order keep theirs. */
export function sortTopmostFirst(targets) {
  const list = [...(targets || [])].filter(Boolean);
  if (!list.every((el) => typeof el.compareDocumentPosition === 'function')) return list;
  // DOCUMENT_POSITION_FOLLOWING = 4: b follows a ⇒ b is above a ⇒ b first.
  return list.sort((a, b) => (a === b ? 0 : (a.compareDocumentPosition(b) & 4 ? 1 : -1)));
}

/**
 * Effective paint of a selection (already flattened to painted leaves).
 * Shows the TOPMOST object's paint (what you see on top; Illustrator shows
 * "?" for mixed) and `mixed` tells the well to flag it.
 * @param {Element[]} targets
 * @param {'fill'|'stroke'} which
 * @param {object} [opts] see resolveElementPaint
 * @returns {{none:boolean, hex:string|null, gradient:boolean, mixed:boolean, source:string}|null}
 */
export function resolveSelectionPaint(targets, which, opts = {}) {
  let first = null;
  let mixed = false;
  for (const el of sortTopmostFirst(targets)) {
    const p = resolveElementPaint(el, which, opts);
    if (!p) continue;
    if (!first) { first = p; continue; }
    if (p.none !== first.none || p.hex !== first.hex || p.gradient !== first.gradient) mixed = true;
  }
  return first ? { ...first, mixed } : null;
}
