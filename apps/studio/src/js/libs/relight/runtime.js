import config from '../../config.js';
/** One dialog owns its workers and aborts inference/rendering when closed. */
export class RelightRuntime {
 constructor(){this.closed=false;this.pending=new Map();this.next=0;this.workers=new Set();}
 async depth(canvas,progress,device='auto') {
  if(this.closed)throw new Error('Relight canceled.');
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  const worker=new Worker(new URL('../../workers/relight-depth-worker.js',import.meta.url));this.workers.add(worker);
  return new Promise((resolve,reject)=>{
   const key=++this.next;this.pending.set(key,{reject});
   const done=()=>{this.pending.delete(key);worker.terminate();this.workers.delete(worker);};
   worker.onerror=e=>{done();reject(new Error(e.message||'Depth worker failed.'));};
   worker.onmessage=({data:m})=>{
    if(m.type==='progress'){progress(m.progress);return;}
    done();
    if(m.type==='retry_wasm')this.depth(canvas,progress,'wasm').then(resolve,reject);
    else if(m.type==='error')reject(new Error(m.message));else resolve(m);
   };
   worker.postMessage({pixels:pixels.buffer,width:canvas.width,height:canvas.height,device,
    transformersCdn:config.BG_AUTO_TRANSFORMERS_CDN,ortWasmCdn:config.BG_AUTO_ORT_WASM_CDN},[pixels.buffer]);
  });
 }
 async prepare(depth) {
  if(this.closed)throw new Error('Relight canceled.');
  this.renderer=new Worker(new URL('../../workers/relight-render-worker.js',import.meta.url));this.workers.add(this.renderer);
  this.renderer.onmessage=({data:m})=>{const entry=this.pending.get(m.id);if(!entry)return;this.pending.delete(m.id);if(m.type==='error')entry.reject(new Error(m.message));else entry.resolve(m);};
  this.renderer.onerror=e=>{this.pending.forEach(p=>p.reject(new Error(e.message||'Relight renderer failed.')));this.pending.clear();};
  return this.call({type:'geometry',depth:depth.depth,width:depth.width,height:depth.height},[depth.depth]);
 }
 call(payload,transfer=[]) {
  if(this.closed)return Promise.reject(new Error('Relight canceled.'));
  return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});this.renderer.postMessage({...payload,id},transfer);});
 }
 render(image,settings){const pixels=image.data.slice();return this.call({type:'render',pixels:pixels.buffer,width:image.width,height:image.height,settings},[pixels.buffer]);}
 close(){this.closed=true;this.workers.forEach(w=>w.terminate());this.workers.clear();this.pending.forEach(p=>p.reject(new Error('Relight canceled.')));this.pending.clear();}
}
