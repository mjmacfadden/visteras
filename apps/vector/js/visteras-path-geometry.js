/** SVGEdit represents a closed contour with an explicit final segment at its M. */
export function closeEditableContours(data) {
  const result = [];
  let start, last;
  for (const segment of data) {
    if (segment.type === 'M') start = segment.values;
    if (segment.type.toUpperCase() === 'Z' && start && last && (start[0] !== last[0] || start[1] !== last[1])) {
      result.push({ type: 'L', values: [...start] });
    }
    result.push(segment);
    if (segment.values.length) last = segment.values.slice(-2);
  }
  return result;
}

export function normalizeEditablePath(element, toAbsolute) {
  if (element.getPathData && element.setPathData) {
    element.setPathData(closeEditableContours(element.getPathData({ normalize: true })));
    return;
  }
  // Safari / the SVGPathSeg polyfill: reread the list after replacing d.
  element.setAttribute('d', toAbsolute(element));
  const list = element.pathSegList;
  let start, last;
  for (let i = 0; i < list.numberOfItems; i++) {
    const segment = list.getItem(i);
    if (segment.pathSegType === 2) start = { x: segment.x, y: segment.y };
    if (segment.pathSegType === 1 && start && last && (start.x !== last.x || start.y !== last.y)) {
      list.insertItemBefore(element.createSVGPathSegLinetoAbs(start.x, start.y), i++);
    }
    if (segment.x !== undefined && segment.y !== undefined) last = segment;
  }
}
