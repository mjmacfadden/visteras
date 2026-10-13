/** Equal gaps in document coordinates. Does not mutate boxes. */
export function findEqualSpacing(moving, others, tolerance = 8) {
  const matches = [];
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? 'width' : 'height';
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'height' : 'width';
    const start = moving[axis], end = start + moving[size];
    const row = others.filter(b => Math.min(b[cross]+b[crossSize], moving[cross]+moving[crossSize]) > Math.max(b[cross], moving[cross])).sort((a,b)=>a[axis]-b[axis]);
    const left = row.filter(b=>b[axis]+b[size]<=start).at(-1);
    const right = row.find(b=>b[axis]>=end);
    const candidates = [];
    const segment = (a,b) => ({start:a,end:b,at:moving[cross]+moving[crossSize]/2});
    if (left && right) {
      const gap = (right[axis]-left[axis]-left[size]-moving[size])/2;
      const delta = left[axis]+left[size]+gap-start;
      if (gap >= 0) candidates.push({axis,delta,gap,segments:[segment(left[axis]+left[size],start+delta),segment(end+delta,right[axis])]});
    }
    for (let i=1;i<row.length;i++) {
      const a=row[i-1],b=row[i], gap=b[axis]-a[axis]-a[size];
      if (gap<0 || !(b[axis]+b[size]<=start || a[axis]>=end)) continue;
      for (const neighbor of [left,right].filter(Boolean)) {
        const before = neighbor === right;
        const pos = before ? neighbor[axis]-gap-moving[size] : neighbor[axis]+neighbor[size]+gap;
        candidates.push({axis,delta:pos-start,gap,segments:[segment(a[axis]+a[size],b[axis]),before?segment(pos+moving[size],neighbor[axis]):segment(neighbor[axis]+neighbor[size],pos)]});
      }
    }
    const best=candidates.filter(m=>Math.abs(m.delta)<=tolerance).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0];
    if (best) matches.push(best);
  }
  return matches;
}
