/** Local inference only. Model/library downloads contain no document pixels. */
self.onmessage = async ({data:msg}) => {
 try {
  const {pipeline,env,RawImage}=await import(/* webpackIgnore: true */ msg.transformersCdn);
  env.allowLocalModels=false;env.useBrowserCache=true;env.useFS=false;env.useFSCache=false;
  env.backends.onnx.wasm.wasmPaths=msg.ortWasmCdn;
  env.backends.onnx.wasm.numThreads=1;
  let device='wasm';
  if(msg.device!=='wasm' && self.navigator.gpu) {
   try {if(await self.navigator.gpu.requestAdapter())device='webgpu';}catch(e){/* CPU */}
  }
  let pipe;
  try {
   pipe=await pipeline('depth-estimation','onnx-community/depth-anything-v2-small',{
    device,dtype:device==='webgpu'?'fp32':'q8',progress_callback:p=>self.postMessage({type:'progress',progress:p})
   });
  }catch(e){if(device==='webgpu'){self.postMessage({type:'retry_wasm'});return;}throw e;}
  self.postMessage({type:'progress',progress:{status:'inference'}});
  const result=await pipe(new RawImage(new Uint8ClampedArray(msg.pixels),msg.width,msg.height,4));
  const raw=result.depth;
  const depth=new Float32Array(raw.width*raw.height);
  for(let i=0;i<depth.length;i++)depth[i]=raw.data[i*(raw.channels||1)];
  self.postMessage({type:'result',depth:depth.buffer,width:raw.width,height:raw.height,device},[depth.buffer]);
  await pipe.dispose();
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
};
