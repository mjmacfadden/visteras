import { contours } from './visteras-anchor-model.js';
const mix = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function evaluateSegment(start,s,t) {
  if (s.type === 6) {
    const a=mix(start,{x:s.x1,y:s.y1},t), b=mix({x:s.x1,y:s.y1},{x:s.x2,y:s.y2},t), c=mix({x:s.x2,y:s.y2},s,t);
    return mix(mix(a,b,t),mix(b,c,t),t);
  }
  if (s.type === 8) return mix(mix(start,{x:s.x1,y:s.y1},t),mix({x:s.x1,y:s.y1},s,t),t);
  return mix(start,s,t);
}
export function splitSegment(segments,index,t) {
  const s=segments[index], p=segments[index-1];
  if (!p || ![4,6,8].includes(s?.type) || t<=0 || t>=1) return segments;
  let left,right;
  if (s.type===6) {
    const a=mix(p,{x:s.x1,y:s.y1},t),b=mix({x:s.x1,y:s.y1},{x:s.x2,y:s.y2},t),c=mix({x:s.x2,y:s.y2},s,t);
    const d=mix(a,b,t),e=mix(b,c,t),f=mix(d,e,t);
    left={type:6,x1:a.x,y1:a.y,x2:d.x,y2:d.y,...f};
    right={type:6,x1:e.x,y1:e.y,x2:c.x,y2:c.y,x:s.x,y:s.y};
  } else if(s.type===8) {
    const a=mix(p,{x:s.x1,y:s.y1},t),b=mix({x:s.x1,y:s.y1},s,t),f=mix(a,b,t);
    left={type:8,x1:a.x,y1:a.y,...f}; right={type:8,x1:b.x,y1:b.y,x:s.x,y:s.y};
  } else { left={type:4,...mix(p,s,t)}; right={...s}; }
  return [...segments.slice(0,index),left,right,...segments.slice(index+1)].map(s=>({...s}));
}
// Distances are measured in viewport pixels, including element/group transforms.
export function hitSegment(segments,point,transform,tolerance=6) {
  let best=null;
  for(let index=1;index<segments.length;index++) {
    const s=segments[index],p=segments[index-1];
    if(![4,6,8].includes(s.type)||p.x===undefined) continue;
    const score=t=>{const q=transform(evaluateSegment(p,s,t));return (q.x-point.x)**2+(q.y-point.y)**2;};
    let t=0,d=Infinity;
    for(let k=0;k<=80;k++){const v=k/80,dist=score(v);if(dist<d){d=dist;t=v;}}
    let lo=Math.max(0,t-1/80),hi=Math.min(1,t+1/80);
    for(let k=0;k<35;k++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(score(a)<score(b))hi=b;else lo=a;}
    t=(lo+hi)/2;
    if(s.type===4){
      // Straight segment: exact projection (the transform is affine, so t is shared).
      const A=transform(p),Bq=transform(s),vx=Bq.x-A.x,vy=Bq.y-A.y,len2=vx*vx+vy*vy;
      if(len2>0)t=Math.max(0,Math.min(1,((point.x-A.x)*vx+(point.y-A.y)*vy)/len2));
    }
    d=score(t);
    const q=transform(evaluateSegment(p,s,t)),a=transform(p),b=transform(s);
    if(Math.hypot(q.x-a.x,q.y-a.y)<1||Math.hypot(q.x-b.x,q.y-b.y)<1) continue;
    if(d<=tolerance*tolerance&&(!best||d<best.distance)) best={index,t,distance:d};
  }
  return best;
}
// Direct Selection deletion cuts away the incident edges, retaining surviving runs.
export function cutAnchors(segments,selected) {
  const result=[];
  for(const c of contours(segments)) {
    if(!c.indices.some(i=>selected.has(i))) {
      const end=c.closed?c.closing+2:c.indices.at(-1)+1;
      result.push(...segments.slice(c.indices[0],end).map(s=>({...s})));continue;
    }
    let order=[...c.indices];
    if(c.closed){const n=order.findIndex(i=>selected.has(i));order=[...order.slice(n+1),...order.slice(0,n+1)];}
    let start=true;
    for(const i of order){
      if(selected.has(i)){start=true;continue;}
      const s=segments[i];
      if(start){result.push({type:2,x:s.x,y:s.y});start=false;}
      else result.push({...segments[i===c.indices[0]&&c.closing!==null?c.closing:i]});
    }
  }
  return result;
}

// SVGEdit sometimes serializes straight lines as endpoint-collapsed cubics.
export function simplifyStraightSegments(segments) {
  return segments.map((s,i)=>{
    const p=segments[i-1];
    if(s.type===6&&p&&Math.hypot(s.x1-p.x,s.y1-p.y)<1e-7&&Math.hypot(s.x2-s.x,s.y2-s.y)<1e-7)return {type:4,x:s.x,y:s.y};
    return {...s};
  });
}
export function reverseOpenContour(data) {
  const out=[{type:2,x:data.at(-1).x,y:data.at(-1).y}];
  for(let i=data.length-1;i>0;i--){const s=data[i],p=data[i-1];out.push(s.type===6?{type:6,x1:s.x2,y1:s.y2,x2:s.x1,y2:s.y1,x:p.x,y:p.y}:{...s,x:p.x,y:p.y});}
  return out;
}

// ─── Pen Auto Add/Delete helpers ────────────────────────────────────────────

/** Make a closed contour's closing edge explicit (L back to its start before Z). */
export function explicitClosing(segments) {
  const out=[];let start=null;
  for(const s of segments){
    if(s.type===2)start=s;
    if(s.type===1&&start){
      const last=out[out.length-1];
      if(last&&last.type!==2&&(Math.abs(last.x-start.x)>1e-9||Math.abs(last.y-start.y)>1e-9))out.push({type:4,x:start.x,y:start.y});
    }
    out.push({...s});
  }
  return out;
}

const asCubic=(p,s)=>{
  if(s.type===6)return {x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2};
  if(s.type===8)return {x1:p.x+2/3*(s.x1-p.x),y1:p.y+2/3*(s.y1-p.y),x2:s.x+2/3*(s.x1-s.x),y2:s.y+2/3*(s.y1-s.y)};
  return null;
};
const unit=(x,y)=>{const l=Math.hypot(x,y);return l>1e-12?{x:x/l,y:y/l}:null;};

/**
 * Merge two consecutive edges A→B (e1) and B→C (e2) into one edge A→C that
 * follows the original shape as closely as possible (Illustrator's Delete
 * Anchor): two straight edges give a straight line; otherwise a cubic keeping
 * the outer tangents, with handle lengths least-squares fitted to samples of
 * the original two curves (Schneider).
 */
export function mergeEdges(A,B,C,e1,e2){
  const c1=asCubic(A,e1),c2=asCubic(B,e2);
  if(!c1&&!c2)return {type:4,x:C.x,y:C.y};
  // Outer tangents.
  let t1=c1?(unit(c1.x1-A.x,c1.y1-A.y)||unit(c1.x2-A.x,c1.y2-A.y)):null;
  t1=t1||unit(B.x-A.x,B.y-A.y)||unit(C.x-A.x,C.y-A.y);
  let t2=c2?(unit(c2.x2-C.x,c2.y2-C.y)||unit(c2.x1-C.x,c2.y1-C.y)):null;
  t2=t2||unit(B.x-C.x,B.y-C.y)||unit(A.x-C.x,A.y-C.y);
  const chord=Math.hypot(C.x-A.x,C.y-A.y);
  if(!t1||!t2||chord<1e-9)return {type:4,x:C.x,y:C.y};
  // Samples of the original path with chord-length parameters.
  const pts=[];
  for(let i=0;i<=24;i++)pts.push(evaluateSegment(A,e1,i/24));
  for(let i=1;i<=24;i++)pts.push(evaluateSegment(B,e2,i/24));
  const u=[0];for(let i=1;i<pts.length;i++)u.push(u[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
  const total=u[u.length-1]||1;for(let i=0;i<u.length;i++)u[i]/=total;
  const eps=1e-6*chord;
  const solve=()=>{
    let C00=0,C01=0,C11=0,X0=0,X1=0;
    for(let i=0;i<pts.length;i++){
      const t=u[i],mt=1-t,b0=mt*mt*mt,b1=3*t*mt*mt,b2=3*t*t*mt,b3=t*t*t;
      const a1={x:t1.x*b1,y:t1.y*b1},a2={x:t2.x*b2,y:t2.y*b2};
      C00+=a1.x*a1.x+a1.y*a1.y;C01+=a1.x*a2.x+a1.y*a2.y;C11+=a2.x*a2.x+a2.y*a2.y;
      const tx=pts[i].x-(A.x*(b0+b1)+C.x*(b2+b3)),ty=pts[i].y-(A.y*(b0+b1)+C.y*(b2+b3));
      X0+=a1.x*tx+a1.y*ty;X1+=a2.x*tx+a2.y*ty;
    }
    const det=C00*C11-C01*C01;
    return Math.abs(det)>1e-12?[(X0*C11-X1*C01)/det,(C00*X1-C01*X0)/det]:[0,0];
  };
  let [alpha,beta]=solve();
  // Schneider: a few Newton reparameterisation passes so the fit converges
  // on the original shape (recovers an exactly split cubic).
  for(let pass=0;pass<8&&alpha>eps&&beta>eps&&alpha<=4*chord&&beta<=4*chord;pass++){
    const P1={x:A.x+t1.x*alpha,y:A.y+t1.y*alpha},P2={x:C.x+t2.x*beta,y:C.y+t2.y*beta};
    for(let i=1;i<pts.length-1;i++){
      const t=u[i],mt=1-t;
      const q={x:mt*mt*mt*A.x+3*mt*mt*t*P1.x+3*mt*t*t*P2.x+t*t*t*C.x,y:mt*mt*mt*A.y+3*mt*mt*t*P1.y+3*mt*t*t*P2.y+t*t*t*C.y};
      const d1={x:3*(mt*mt*(P1.x-A.x)+2*mt*t*(P2.x-P1.x)+t*t*(C.x-P2.x)),y:3*(mt*mt*(P1.y-A.y)+2*mt*t*(P2.y-P1.y)+t*t*(C.y-P2.y))};
      const d2={x:6*(mt*(P2.x-2*P1.x+A.x)+t*(C.x-2*P2.x+P1.x)),y:6*(mt*(P2.y-2*P1.y+A.y)+t*(C.y-2*P2.y+P1.y))};
      const num=(q.x-pts[i].x)*d1.x+(q.y-pts[i].y)*d1.y,den=d1.x*d1.x+d1.y*d1.y+(q.x-pts[i].x)*d2.x+(q.y-pts[i].y)*d2.y;
      if(Math.abs(den)>1e-12)u[i]=Math.min(1,Math.max(0,t-num/den));
    }
    [alpha,beta]=solve();
  }
  return {type:6,x1:A.x+t1.x*alpha,y1:A.y+t1.y*alpha,x2:C.x+t2.x*beta,y2:C.y+t2.y*beta,x:C.x,y:C.y};
}

/**
 * Delete one anchor and join its neighbours (Pen Auto Delete / Delete Anchor
 * Point). Open-path endpoints just shorten the path. Returns null when the
 * contour would be left with fewer than two anchors (nothing is deleted).
 */
export function deleteAnchorSmooth(segments,index){
  const data=explicitClosing(segments);
  const all=contours(data);
  const c=all.find(k=>k.indices.includes(index)||k.closing===index);
  if(!c)return null;
  const idx=c.closing===index?c.indices[0]:index;
  const P=c.indices.map(i=>({x:data[i].x,y:data[i].y}));
  const n=P.length;
  // Edges E[k]: P[k] → P[k+1] (closed: E[n-1] closes back to P[0]).
  const E=[];
  for(let k=0;k<n-1;k++)E.push({...data[c.indices[k+1]]});
  if(c.closed)E.push(c.closing!==null?{...data[c.closing]}:{type:4,x:P[0].x,y:P[0].y});
  const k=c.indices.indexOf(idx);
  if(n-1<2)return null;
  let nP,nE;
  if(!c.closed&&(k===0||k===n-1)){
    nP=k===0?P.slice(1):P.slice(0,-1);
    nE=k===0?E.slice(1):E.slice(0,-1);
  }else{
    const km=(k-1+n)%n,kp=(k+1)%n;
    const merged=mergeEdges(P[km],P[k],P[kp],E[km],E[k]);
    nP=P.filter((_,i)=>i!==k);
    nE=[];
    for(let i=0;i<E.length;i++){if(i===k)continue;nE.push(i===km?merged:E[i]);}
    // Closed, k = 0: P[1] becomes the start and the merged (old closing) edge ends at it.
  }
  // Rebuild this contour.
  const out=[{type:2,x:nP[0].x,y:nP[0].y}];
  const m=nP.length;
  for(let i=0;i<(c.closed?m:m-1);i++){
    const end=nP[(i+1)%m],e=nE[i];
    out.push({...e,x:end.x,y:end.y});
  }
  if(c.closed)out.push({type:1});
  // Splice into the full segment list.
  const first=c.indices[0];
  let last=c.closed?data.findIndex((s,i)=>i>(c.closing??c.indices.at(-1))&&s.type===1):c.indices.at(-1);
  if(last<0)last=c.indices.at(-1);
  return [...data.slice(0,first),...out,...data.slice(last+1)].map(s=>({...s}));
}

