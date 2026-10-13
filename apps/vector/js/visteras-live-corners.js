import {contours} from './visteras-anchor-model.js';
export const CORNER_TYPES=['round','inverted','chamfer'];
const EPS=1e-8;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function cornerBasis(prev,p,next){
 const a=distance(prev,p),b=distance(next,p);if(a<EPS||b<EPS)return null;
 const u={x:(prev.x-p.x)/a,y:(prev.y-p.y)/a},v={x:(next.x-p.x)/b,y:(next.y-p.y)/b};
 const angle=Math.acos(Math.max(-1,Math.min(1,u.x*v.x+u.y*v.y)));
 if(angle<EPS||Math.PI-angle<EPS)return null;
 const sum=Math.hypot(u.x+v.x,u.y+v.y);
 return {u,v,a,b,angle,turn:Math.PI-angle,sinHalf:Math.sin(angle/2),tanHalf:Math.tan(angle/2),bisector:{x:(u.x+v.x)/sum,y:(u.y+v.y)/sum}};
}
export function maxRadius(prev,p,next,neighbourUse=.5){
 const g=cornerBasis(prev,p,next);if(!g)return 0;
 const remaining=typeof neighbourUse==='number'?Math.min(g.a,g.b)*(1-neighbourUse):Math.min(g.a-(neighbourUse.prev||0),g.b-(neighbourUse.next||0));
 return Math.max(0,remaining*g.tanHalf);
}
export function cornerGeometry(prev,p,next,r,type='round'){
 const g=cornerBasis(prev,p,next);if(!g)return null;
 const radius=Math.max(0,Math.min(Number(r)||0,maxRadius(prev,p,next,0))),t=radius/g.tanHalf;
 const start={x:p.x+g.u.x*t,y:p.y+g.u.y*t},end={x:p.x+g.v.x*t,y:p.y+g.v.y*t};
 let segment={type:4,x:end.x,y:end.y};
 if(type!=='chamfer'&&radius>EPS){
   if(type==='inverted'){
     // Concave arc centered on the original corner. Its endpoints are shared with Round.
     const k=4/3*Math.tan(g.angle/4)*t,sign=Math.sign(g.u.x*g.v.y-g.u.y*g.v.x);
     segment={type:6,x1:start.x-sign*g.u.y*k,y1:start.y+sign*g.u.x*k,x2:end.x+sign*g.v.y*k,y2:end.y-sign*g.v.x*k,x:end.x,y:end.y};
   }else{
     const k=4/3*Math.tan(g.turn/4)*radius;
     segment={type:6,x1:start.x-g.u.x*k,y1:start.y-g.u.y*k,x2:end.x-g.v.x*k,y2:end.y-g.v.y*k,x:end.x,y:end.y};
   }
 }
 return {start,end,segment,r:radius,t,...g};
}
export function eligibleCorners(base){
 return contours(base).flatMap((c,contour)=>{
 const area=c.indices.reduce((sum,index,i)=>{const a=base[index],b=base[c.indices[(i+1)%c.indices.length]];return sum+a.x*b.y-b.x*a.y;},0);
 return c.indices.flatMap((index,i)=>{
   if(!c.closed&&(i===0||i===c.indices.length-1))return [];
   const prevIndex=c.indices[(i+c.indices.length-1)%c.indices.length],nextIndex=c.indices[(i+1)%c.indices.length];
   const incoming=i===0?(c.closing===null?4:base[c.closing].type):base[index].type;
   const outgoing=i===c.indices.length-1&&c.closed?(c.closing===null?4:base[c.closing].type):base[nextIndex].type;
   if(incoming!==4||outgoing!==4)return [];
   const prev=base[prevIndex],p=base[index],next=base[nextIndex],basis=cornerBasis(prev,p,next);
   if(basis&&c.closed){const turn=(p.x-prev.x)*(next.y-p.y)-(p.y-prev.y)*(next.x-p.x);if(turn*area<0)basis.bisector={x:-basis.bisector.x,y:-basis.bisector.y};}
   return basis?[{contour,index,prevIndex,nextIndex,prev,p,next,basis}]:[];
 });});
}
export function buildCorners(base,corners){
 const specs=new Map(corners.map(c=>[c.index,{...c}])),geometries=new Map();
 for(const c of eligibleCorners(base)){
   const spec=specs.get(c.index);if(spec?.r>EPS)geometries.set(c.index,cornerGeometry(c.prev,c.p,c.next,spec.r,spec.type));
 }
 // Every shared edge is bounded jointly, including unequal adjacent radii.
 for(const c of contours(base)){
   const indices=c.indices;
   for(let i=0;i<(c.closed?indices.length:indices.length-1);i++){
     const a=indices[i],b=indices[(i+1)%indices.length],ga=geometries.get(a),gb=geometries.get(b),used=(ga?.t||0)+(gb?.t||0),length=distance(base[a],base[b]);
     if(used>length&&used>EPS){const scale=length/used;for(const index of [a,b]){const g=geometries.get(index);if(!g)continue;const c=eligibleCorners(base).find(c=>c.index===index);geometries.set(index,cornerGeometry(c.prev,c.p,c.next,g.r*scale,specs.get(index).type));}}
   }
 }
 const validSpecs=eligibleCorners(base).filter(c=>specs.has(c.index)).map(c=>({...specs.get(c.index),r:geometries.get(c.index)?.r||0}));
 if(!geometries.size)return {segments:base.map(s=>({...s})),map:new Map(base.map((s,i)=>[i,[i]])),corners:validSpecs};
 const segments=[],map=new Map();
 for(const c of contours(base)){
   for(const [i,index]of c.indices.entries()){
     const g=geometries.get(index),s=base[index],p=g?.start||s;
     const first=segments.length;
     segments.push(i===0?{type:2,x:p.x,y:p.y}:{...s,x:p.x,y:p.y});
     if(g)segments.push(g.segment);
     map.set(index,g?[first,first+1]:[first]);
   }
   if(c.closed){const first=base[c.indices[0]],g=geometries.get(c.indices[0]);segments.push({type:4,x:g?.start.x??first.x,y:g?.start.y??first.y},{type:1});}
 }
 return {segments,map,corners:validSpecs};
}
export const applyCorners=(base,corners)=>buildCorners(base,corners).segments;
export function parseCornerData(str){
 try{const d=JSON.parse(str);return typeof d?.base==='string'&&typeof d.gen==='string'&&Array.isArray(d.corners)&&d.corners.every(c=>Number.isInteger(c.index)&&Number.isInteger(c.contour)&&Number.isFinite(c.r)&&c.r>=0&&CORNER_TYPES.includes(c.type))?d:null;}catch{return null;}
}
export function serializeCornerData(obj){return JSON.stringify(obj);}
export const cornerDataIsCurrent=(data,d)=>!!data&&data.gen===d;
