import app from '../app.js';
import config from '../config.js';

// Stored masks contain grayscale bytes only. Runtime paint canvases never enter JSON/history.
const runtime = new WeakMap();
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
 const filter=(layer.filters||[]).find(f=>String(f.id)===String(config.effect_mask_active));
 if (!filter?.params?._mask) return null;
 const mask=effectMaskRuntime(filter.params._mask);
 Object.assign(mask,{x:layer.x||0,y:layer.y||0,width:layer.width,height:layer.height,linked:true,enabled:true});
 return {...layer,mask,_effectOwner:layer,_effectFilter:filter};
}
export function effectMaskImageAction(canvas, target) {
 const owner=target._effectOwner, filter=target._effectFilter;
 if (!config.layers.includes(owner) || owner.locked || !owner.filters.includes(filter)) throw new Error('The effect mask target changed.');
 const mask=encodeEffectMask(canvas,filter.params._mask.enabled!==false);
 return new app.Actions.Update_layer_action(owner.id,{filters:owner.filters.map(f=>f===filter?{...f,params:{...f.params,_mask:mask}}:f)});
}
export function blendEffectMask(input, output, mask) {
 if (!mask || mask.enabled===false) return output;
 const state=effectMaskRuntime(mask), source=state.link_canvas||state.link;
 const c=document.createElement('canvas');c.width=output.width;c.height=output.height;
 const ctx=c.getContext('2d');ctx.drawImage(source,0,0,c.width,c.height);
 const weights=ctx.getImageData(0,0,c.width,c.height).data;
 ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(input,0,0,c.width,c.height);
 const before=ctx.getImageData(0,0,c.width,c.height), after=output.getContext('2d').getImageData(0,0,c.width,c.height);
 // Interpolate premultiplied colors so transparent pixels do not produce dark fringes.
 for(let i=0;i<before.data.length;i+=4) {
  const t=weights[i]/255, a=before.data[i+3]*(1-t), b=after.data[i+3]*t, alpha=a+b;
  for(let k=0;k<3;k++) before.data[i+k]=alpha?(before.data[i+k]*a+after.data[i+k]*b)/alpha:0;
  before.data[i+3]=alpha;
 }
 ctx.putImageData(before,0,0);return c;
}
