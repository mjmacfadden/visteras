/** Alignment/distribution in document coordinates; input order is preserved. */
export function alignToKey(boxes, keyIndex, dir) {
  const key = boxes[keyIndex];
  const deltas = boxes.map(()=>({dx:0,dy:0}));
  if (!key) return deltas;
  const axis = ['left','center','right'].includes(dir) ? 'x' : 'y';
  const size = axis === 'x' ? 'width' : 'height';
  const fraction = {left:0,center:0.5,right:1,top:0,middle:0.5,bottom:1}[dir];
  if (fraction === undefined) return deltas;
  const target = key[axis]+key[size]*fraction;
  boxes.forEach((b,i)=>{ if(i!==keyIndex) deltas[i][axis==='x'?'dx':'dy']=target-b[axis]-b[size]*fraction; });
  return deltas;
}
export function distributeSpacing(boxes, axis, gap = null, keyIndex = null) {
  const deltas = boxes.map(()=>({dx:0,dy:0}));
  if (boxes.length<2 || !['x','y'].includes(axis)) return deltas;
  const size = axis==='x'?'width':'height', delta = axis==='x'?'dx':'dy';
  const sorted = boxes.map((b,i)=>({...b,index:i})).sort((a,b)=>a[axis]-b[axis]);
  if (gap!==null && keyIndex!==null && boxes[keyIndex] && Number.isFinite(gap)) {
    const k=sorted.findIndex(b=>b.index===keyIndex);
    let position=sorted[k][axis];
    for(let i=k-1;i>=0;i--){ position-=gap+sorted[i][size]; deltas[sorted[i].index][delta]=position-sorted[i][axis]; }
    position=sorted[k][axis]+sorted[k][size];
    for(let i=k+1;i<sorted.length;i++){position+=gap; deltas[sorted[i].index][delta]=position-sorted[i][axis];position+=sorted[i][size];}
  } else if (sorted.length>2) {
    const first=sorted[0],last=sorted.at(-1);
    const occupied=sorted.slice(0,-1).reduce((sum,b)=>sum+b[size],0);
    const autoGap=(last[axis]-first[axis]-occupied)/(sorted.length-1);
    let position=first[axis]+first[size];
    for(let i=1;i<sorted.length-1;i++){position+=autoGap;deltas[sorted[i].index][delta]=position-sorted[i][axis];position+=sorted[i][size];}
  }
  return deltas;
}
