/** SVG segment endpoints, excluding Bézier direction handles. No document mutation. */
export function segmentAnchors(segments) {
  let x=0,y=0,start={x:0,y:0};
  const points=[];
  for(const s of segments){
    const type=s.type;
    if(type===1){x=start.x;y=start.y;continue;}
    const relative=type%2===1;
    if(type===12||type===13)x=relative?x+s.x:s.x;
    else if(type===14||type===15)y=relative?y+s.y:s.y;
    else {x=relative?x+s.x:s.x;y=relative?y+s.y:s.y;}
    if(type===2||type===3)start={x,y};
    if(Number.isFinite(x)&&Number.isFinite(y))points.push({x,y});
  }
  return points;
}
export function transformAnchors(points,m){
  return points.map(p=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}));
}
export function nearestGuideAnchor(point,type,anchors,tolerance){
  const axis=type==='h'?'y':'x';
  let best=null,distance=tolerance;
  for(const anchor of anchors){
    const delta=Math.abs(anchor[axis]-point[axis]);
    if(delta<=distance&&Number.isFinite(delta)){best=anchor;distance=delta;}
  }
  return best;
}
