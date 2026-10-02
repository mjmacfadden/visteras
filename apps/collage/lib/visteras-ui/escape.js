/* @visteras/ui — generated from packages/ui/src/escape.js by packages/ui/scripts/build-static.mjs — do not edit by hand */
/** HTML-escape text before it goes into innerHTML. */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
