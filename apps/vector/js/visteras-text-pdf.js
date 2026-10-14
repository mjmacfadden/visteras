/** svg2pdf cannot use SVG @font-face resources. Outline styled text in the
 * export clone using the live element's glyph positions, leaving it editable.
 * Conversion is injected so this boundary can be tested without a browser. */
export async function outlineStyledTextForPdf(clone, content, convert) {
  let count = 0;
  for (const text of clone.querySelectorAll('text[data-text-runs]')) {
    if (text.querySelector('textPath')) continue;
    const source = [...content.querySelectorAll('text')].find(el => el.id === text.id) || text;
    const outlined = await convert(source, clone.ownerDocument);
    if (!outlined) throw new Error('A styled text font could not be outlined for PDF export');
    text.replaceWith(outlined);
    count++;
  }
  return count;
}
