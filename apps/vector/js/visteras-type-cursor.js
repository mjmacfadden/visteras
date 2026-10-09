/**
 * Visteras Vector — Illustrator Type tool cursors.
 * Over type (point, area, on-path) with the Type tool, and over the text being
 * edited: the I-beam ('text'). Elsewhere on the canvas with the Type tool (or
 * while editing): Illustrator's type cursor — an I-beam in a dashed box.
 * Applied with a stylesheet so SVG-Edit's inline cursors (select mode during
 * editing, selection box / grips) cannot win.
 */
const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
const BEAM = 'M9 4 h6 M12 4 v15 M9 19 h6';
export const TYPE_CURSOR = `${svg(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="2 2"/><path d="${BEAM}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="${BEAM}" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>`)} 12 15, text`;
export const IBEAM_CURSOR = 'text';

export const CANVAS_SELECTORS = ['#workarea', '#svgcanvas', '#svgroot', '#svgcontent', '#svgcontent *', '#selectorParentGroup', '#selectorParentGroup *'];
export const TEXT_SELECTORS = ['#svgcontent text', '#svgcontent text *'];
const scope = (prefix, sels) => sels.map((s) => `${prefix} ${s}`).join(',\n');

export function typeCursorCss() {
  const typeMode = 'body[data-mode="text"]:not(.visteras-top-mode-active)';
  const editing = 'body[data-vector-editing-text]';
  return `/* Type tool cursors (visteras-type-cursor.js) */
${scope(typeMode, CANVAS_SELECTORS)},
${scope(editing, CANVAS_SELECTORS)} { cursor: ${TYPE_CURSOR} !important; }
${scope(typeMode, TEXT_SELECTORS)},
${scope(editing, TEXT_SELECTORS)} { cursor: ${IBEAM_CURSOR} !important; }
`;
}

export function mountTypeCursor() {
  if (typeof document === 'undefined' || document.getElementById('visteras_type_cursor_css')) return;
  const style = document.createElement('style');
  style.id = 'visteras_type_cursor_css';
  style.textContent = typeCursorCss();
  document.head.append(style);
}
