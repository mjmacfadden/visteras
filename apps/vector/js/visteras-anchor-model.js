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

export function insertAnchorAt(segments, segmentIndex, t, x, y) {
  const result = segments.map(s => ({ ...s }));
  const segment = result[segmentIndex];
  if (!segment || segment.type === 1 || segment.type === 2) return result;
  const previous = segmentIndex > 0 ? result[segmentIndex - 1] : null;
  const px = previous?.x ?? x, py = previous?.y ?? y;
  const u = Math.max(0, Math.min(1, t));
  if (segment.type === 6) {
    const q0x = px + (segment.x1 - px) * u, q0y = py + (segment.y1 - py) * u;
    const q1x = segment.x1 + (segment.x2 - segment.x1) * u, q1y = segment.y1 + (segment.y2 - segment.y1) * u;
    const q2x = segment.x2 + (segment.x - segment.x2) * u, q2y = segment.y2 + (segment.y - segment.y2) * u;
    const r0x = q0x + (q1x - q0x) * u, r0y = q0y + (q1y - q0y) * u;
    const r1x = q1x + (q2x - q1x) * u, r1y = q1y + (q2y - q1y) * u;
    const first = { type: 6, x1: q0x, y1: q0y, x2: r0x, y2: r0y, x, y };
    const second = { type: 6, x1: r1x, y1: r1y, x2: segment.x2, y2: segment.y2, x: segment.x, y: segment.y };
    result.splice(segmentIndex, 1, first, second);
  } else {
    result.splice(segmentIndex, 1, { type: 4, x, y }, { ...segment });
  }
  return result;
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
      // If the deleted node was the original first anchor, the closing
      // segment still connects the surviving contour. Otherwise the old
      // segment at `first` belonged to the deleted node and must not be
      // reused: doing so can turn a straight rectangle edge into a cubic.
      const incoming = remaining[0] === contour.indices[0] ? segments[contour.closing] : null;
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
  const anchor = anchors(segments).find(a => a.index === anchorIndex);
  if (!anchor) return result;
  const oppositeIndex = suffix === '1' ? anchor.incoming : anchor.outgoing;
  const oppositeSuffix = suffix === '1' ? '2' : '1';
  const opposite = result[oppositeIndex], original = segments[segmentIndex], center = segments[anchor.index];
  if (opposite?.['x' + oppositeSuffix] === undefined) return result;
  // Alt/Option-drag permanently breaks the linkage at this anchor. Preserve
  // the opposite handle exactly where it is and mark both sides independent.
  if (unlink) {
    result[segmentIndex]._unlinkedAnchor = anchorIndex;
    opposite._unlinkedAnchor = anchorIndex;
    return result;
  }
  if (original._unlinkedAnchor === anchorIndex || opposite._unlinkedAnchor === anchorIndex) return result;
  const originalLength = Math.hypot(original['x' + suffix] - center.x, original['y' + suffix] - center.y);
  const oppositeLength = Math.hypot(opposite['x' + oppositeSuffix] - center.x, opposite['y' + oppositeSuffix] - center.y);
  // Link paired handles when they are already opposite/collinear. Smooth
  // conversion establishes that relationship; corner handles remain free.
  if (!originalLength || !oppositeLength) return result;
  const ax = original['x' + suffix] - center.x, ay = original['y' + suffix] - center.y;
  const bx = opposite['x' + oppositeSuffix] - center.x, by = opposite['y' + oppositeSuffix] - center.y;
  if (ax * bx + ay * by >= 0 || Math.abs(ax * by - ay * bx) > originalLength * oppositeLength * 1e-2) return result;
  const vx = handle['x'+suffix]-center.x, vy = handle['y'+suffix]-center.y, length = Math.hypot(vx,vy);
  if (length) {
    opposite['x'+oppositeSuffix] = center.x-vx*oppositeLength/length;
    opposite['y'+oppositeSuffix] = center.y-vy*oppositeLength/length;
  }
  return result;
}

export function convertAnchors(segments, selected, mode) {
  const result = segments.map(s => ({ ...s }));
  const points = anchors(segments);
  for (const anchor of points) {
    if (!selected.has(anchor.index)) continue;
    const target = result[anchor.index], prev = segments[anchor.incoming], next = segments[anchor.outgoing];
    if (!target) continue;
    if (mode === 'corner') {
      // Collapse only this anchor's sides. Preserve the opposite control on
      // shared cubic segments so neighboring anchors keep their handles.
      const incoming = result[anchor.incoming], outgoing = result[anchor.outgoing];
      if (incoming && [6, 8, 16].includes(incoming.type)) {
        incoming.type = 6;
        incoming.x2 = target.x; incoming.y2 = target.y;
      }
      if (outgoing && [6, 8, 16].includes(outgoing.type)) {
        outgoing.type = 6;
        outgoing.x1 = target.x; outgoing.y1 = target.y;
      }
    } else if (mode === 'smooth') {
      const position = points.findIndex(point => point.index === anchor.index);
      const previousAnchor = position > 0
        ? points[position - 1]
        // A closed contour stores its closing segment after the last visible
        // anchor, so the first anchor's previous point wraps to the end.
        : (anchor.incoming !== null && anchor.incoming > anchor.index ? points[points.length - 1] : null);
      const nextAnchor = position >= 0 && position < points.length - 1 ? points[position + 1] : null;
      const previousSegment = previousAnchor ? segments[previousAnchor.index] : prev;
      const nextSegment = nextAnchor ? segments[nextAnchor.index] : next;
      const px = previousSegment?.x ?? target.x, py = previousSegment?.y ?? target.y;
      const nx = nextSegment?.x ?? target.x, ny = nextSegment?.y ?? target.y;
      const dx = nx - px, dy = ny - py, length = Math.hypot(dx, dy) || 1;
      const ux = dx / length, uy = dy / length;
      const inLength = Math.hypot(target.x - px, target.y - py) / 3;
      const outLength = Math.hypot(nx - target.x, ny - target.y) / 3;
      const incoming = result[anchor.incoming], outgoing = result[anchor.outgoing];
      // The handle arriving at this anchor is the incoming segment's x2/y2;
      // the handle leaving it is the outgoing segment's x1/y1. Keep the
      // neighboring controls at their endpoint positions so only the
      // selected anchor receives the new smooth handles.
      if (incoming && incoming.type !== 2 && incoming.type !== 1) Object.assign(incoming, {
        type: 6,
        x2: target.x - ux * inLength, y2: target.y - uy * inLength,
        x: target.x, y: target.y
      });
      if (incoming && incoming.type === 6 && incoming.x1 === undefined) {
        incoming.x1 = px; incoming.y1 = py;
      }
      if (outgoing && outgoing.type !== 1) Object.assign(outgoing, {
        type: 6,
        x1: target.x + ux * outLength, y1: target.y + uy * outLength,
        x: outgoing.x, y: outgoing.y
      });
      if (outgoing && outgoing.type === 6 && outgoing.x2 === undefined) {
        outgoing.x2 = nx; outgoing.y2 = ny;
      }
    }
  }
  return result;
}
