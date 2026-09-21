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
    t=(lo+hi)/2;d=score(t);
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
