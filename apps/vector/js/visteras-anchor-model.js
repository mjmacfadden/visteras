// Pure path geometry shared by multi-object direct selection and its tests.
export function readSegments(path) {
  const list = path.pathSegList;
  return Array.from({ length: list.numberOfItems }, (_, i) => {
    const seg = list.getItem(i), result = { type: seg.pathSegType };
    for (const key of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'r1', 'r2', 'angle', 'largeArcFlag', 'sweepFlag']) {
      if (seg[key] !== undefined) result[key] = seg[key];
    }
    return result;
  });
}
export function serializeSegments(segments) {
  return segments.map(s => {
    switch (s.type) {
      case 1: return 'Z';
      case 2: return `M${s.x} ${s.y}`;
      case 4: return `L${s.x} ${s.y}`;
      case 6: return `C${s.x1} ${s.y1} ${s.x2} ${s.y2} ${s.x} ${s.y}`;
      case 8: return `Q${s.x1} ${s.y1} ${s.x} ${s.y}`;
      case 10: return `A${s.r1} ${s.r2} ${s.angle} ${+s.largeArcFlag} ${+s.sweepFlag} ${s.x} ${s.y}`;
      case 16: return `S${s.x2} ${s.y2} ${s.x} ${s.y}`;
      case 18: return `T${s.x} ${s.y}`;
      default: throw new Error(`Unsupported editable segment ${s.type}`);
    }
  }).join(' ');
}
export function contours(segments) {
  const result = [];
  let contour;
  segments.forEach((s, index) => {
    if (s.type === 2) { contour = { indices: [], closed: false, closing: null }; result.push(contour); }
    if (!contour) return;
    if (s.type === 1) {
      contour.closed = true;
      const first = segments[contour.indices[0]], lastIndex = contour.indices.at(-1), last = segments[lastIndex];
      if (contour.indices.length > 1 && first.x === last.x && first.y === last.y) {
        contour.closing = lastIndex;
        contour.indices.pop();
      }
    } else contour.indices.push(index);
  });
  return result;
}
export function anchors(segments) {
  return contours(segments).flatMap(c => c.indices.map((index, i) => ({
    index, aliases: i === 0 && c.closing !== null ? [index, c.closing] : [index],
    incoming: i === 0 && c.closed ? c.closing : index,
    outgoing: c.indices[i + 1] ?? (c.closed ? c.closing : null)
  })));
}
export function moveAnchors(segments, selected, dx, dy) {
  const result = segments.map(s => ({ ...s })), fields = new Set();
  const add = (index, suffix = '') => {
    if (index === null || index === undefined || result[index]?.['x' + suffix] === undefined) return;
    fields.add(`${index}:${suffix}`);
  };
  for (const anchor of anchors(segments)) {
    if (!selected.has(anchor.index)) continue;
    anchor.aliases.forEach(index => add(index));
    if ([6, 16].includes(segments[anchor.incoming]?.type)) add(anchor.incoming, '2');
    if (segments[anchor.incoming]?.type === 8) add(anchor.incoming, '1');
    if ([6, 8].includes(segments[anchor.outgoing]?.type)) add(anchor.outgoing, '1');
  }
  for (const field of fields) {
    const [index, suffix] = field.split(':');
    result[index]['x' + suffix] += dx;
    result[index]['y' + suffix] += dy;
  }
  return result;
}
export function deleteAnchors(segments, selected) {
  const result = [];
  for (const contour of contours(segments)) {
    const remaining = contour.indices.filter(i => !selected.has(i));
    if (!remaining.length) continue;
    const first = segments[remaining[0]];
    result.push({ type: 2, x: first.x, y: first.y });
    for (const index of remaining.slice(1)) result.push({ ...segments[index] });
    if (contour.closed && remaining.length > 1) {
      const incoming = remaining[0] === contour.indices[0] ? segments[contour.closing] : first;
      result.push(incoming && incoming.type !== 2 ? { ...incoming } : { type: 4, x: first.x, y: first.y });
      result.push({ type: 1 });
    }
  }
  return result;
}

export function moveControl(segments, anchorIndex, segmentIndex, suffix, dx, dy, unlink = false) {
  const result = segments.map(s => ({ ...s }));
  const handle = result[segmentIndex];
  handle['x' + suffix] += dx;
  handle['y' + suffix] += dy;
  if (unlink) return result;
  const anchor = anchors(segments).find(a => a.index === anchorIndex);
  if (!anchor) return result;
  const oppositeIndex = suffix === '1' ? anchor.incoming : anchor.outgoing;
  const oppositeSuffix = suffix === '1' ? '2' : '1';
  const opposite = result[oppositeIndex], original = segments[segmentIndex], center = segments[anchor.index];
  if (opposite?.['x' + oppositeSuffix] === undefined) return result;
  const ax = original['x' + suffix] - center.x, ay = original['y' + suffix] - center.y;
  const bx = opposite['x' + oppositeSuffix] - center.x, by = opposite['y' + oppositeSuffix] - center.y;
  const originalLength = Math.hypot(ax,ay), oppositeLength = Math.hypot(bx,by);
  // Link only already-smooth handles. Corner anchors retain independent handles.
  if (!originalLength || !oppositeLength || ax*bx+ay*by >= 0 || Math.abs(ax*by-ay*bx) > originalLength*oppositeLength*1e-4) return result;
  const vx = handle['x'+suffix]-center.x, vy = handle['y'+suffix]-center.y, length = Math.hypot(vx,vy);
  if (length) {
    opposite['x'+oppositeSuffix] = center.x-vx*oppositeLength/length;
    opposite['y'+oppositeSuffix] = center.y-vy*oppositeLength/length;
  }
  return result;
}
