import app from '../app.js';
import config from '../config.js';

// Stored masks contain grayscale bytes only. Runtime paint canvases never enter JSON/history.
const runtime = new WeakMap();
const blendSurfaces = new WeakMap();
export function encodeEffectMask(canvas, enabled = true) {
 const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
 let data = '';
 for (let i = 0; i < pixels.length; i += 4) {
  data += String.fromCharCode(Math.round((pixels[i] * .2126 + pixels[i+1] * .7152 + pixels[i+2] * .0722) * pixels[i+3] / 255));
 }
 return {width:canvas.width, height:canvas.height, data:btoa(data), enabled};
}
export function effectMaskRuntime(mask) {
 if (!mask) return null;
 if (!runtime.has(mask)) {
  const canvas = document.createElement('canvas'); canvas.width=mask.width; canvas.height=mask.height;
  const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(mask.width,mask.height), bytes=atob(mask.data);
  for(let i=0;i<bytes.length;i++) {pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=bytes.charCodeAt(i);pixels.data[i*4+3]=255;}
  ctx.putImageData(pixels,0,0); runtime.set(mask,{link:canvas});
 }
 return runtime.get(mask);
}
export function activeEffectTarget() {
 const layer=config.layer;
 if (!config.mask_active || !config.effect_mask_active || !layer || layer.type!=='smart') return null;
 if (!layer.smart_filter_mask) return null;
 const mask=effectMaskRuntime(layer.smart_filter_mask);
 Object.assign(mask,{x:layer.x||0,y:layer.y||0,width:layer.width,height:layer.height,linked:true,enabled:true});
 return {...layer,mask,_effectOwner:layer,_stackMask:layer.smart_filter_mask};
}
export function effectMaskImageAction(canvas, target) {
 const owner=target._effectOwner;
 if (!config.layers.includes(owner) || owner.locked || owner.smart_filter_mask!==target._stackMask) throw new Error('The Smart Filters mask target changed.');
 return new app.Actions.Update_layer_action(owner.id,{smart_filter_mask:encodeEffectMask(canvas,owner.smart_filter_mask.enabled!==false)});
}

export function blendEffectMask(input, output, mask) {
 if (!mask || mask.enabled===false) return output;
 const state=effectMaskRuntime(mask), source=state.link_canvas||state.link;
 // Convert grayscale coverage to alpha, then let Canvas composite premultiplied
 // pixels. This avoids reading both full-color images and blending them in JS.
 let surfaces=blendSurfaces.get(output);
 if (!surfaces) {
  const alpha=document.createElement('canvas'),filtered=document.createElement('canvas');
  alpha.width=filtered.width=output.width;alpha.height=filtered.height=output.height;
  surfaces={alpha,filtered};blendSurfaces.set(output,surfaces);
 }
 const {alpha,filtered}=surfaces;
 const alphaCtx=alpha.getContext('2d',{willReadFrequently:true});
 alphaCtx.clearRect(0,0,alpha.width,alpha.height);
 alphaCtx.drawImage(source,0,0,alpha.width,alpha.height);
 const coverage=alphaCtx.getImageData(0,0,alpha.width,alpha.height);
 for(let i=0;i<coverage.data.length;i+=4) coverage.data[i+3]=coverage.data[i];
 alphaCtx.putImageData(coverage,0,0);
 const c=document.createElement('canvas');c.width=output.width;c.height=output.height;
 const ctx=c.getContext('2d');ctx.drawImage(input,0,0,c.width,c.height);
 ctx.globalCompositeOperation='destination-out';ctx.drawImage(alpha,0,0);
 const filteredCtx=filtered.getContext('2d');
 filteredCtx.globalCompositeOperation='copy';filteredCtx.drawImage(output,0,0);
 filteredCtx.globalCompositeOperation='destination-in';filteredCtx.drawImage(alpha,0,0);
 ctx.globalCompositeOperation='lighter';ctx.drawImage(filtered,0,0);
 ctx.globalCompositeOperation='source-over';
 return c;
}
