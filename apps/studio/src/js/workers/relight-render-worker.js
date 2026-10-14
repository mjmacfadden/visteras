import {normalize_depth,depth_normals,render_relight} from '../libs/relight/math.js';
let geometry=null;
self.onmessage=({data:msg})=>{
 try {
  if(msg.type==='geometry') {
   const depth=normalize_depth(new Float32Array(msg.depth));
   geometry={depth,normals:depth_normals(depth,msg.width,msg.height),width:msg.width,height:msg.height};
   self.postMessage({id:msg.id,type:'ready'});return;
  }
  const pixels=render_relight(new Uint8ClampedArray(msg.pixels),msg.width,msg.height,geometry,msg.settings);
  self.postMessage({id:msg.id,type:'result',pixels:pixels.buffer},[pixels.buffer]);
 }catch(e){self.postMessage({id:msg.id,type:'error',message:e.message});}
};
