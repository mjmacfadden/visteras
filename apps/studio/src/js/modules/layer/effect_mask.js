import app from '../../app.js';
import config from '../../config.js';
import Mask from '../mask/mask.js';
import { encodeEffectMask, effectMaskRuntime } from '../../libs/effect-masks.js';
import alertify from 'alertifyjs/build/alertify.min.js';

export default class EffectMask {
 async command(layerId, filterId, command) {
  try {
   await app.State._action_queue;
   const layer=app.Layers.get_layer(Number(layerId),true);
   const filter=layer?.filters?.find(f=>String(f.id)===String(filterId));
   if (!layer || layer.type!=='smart' || layer.locked || !filter?.name.startsWith('smart:')) throw new Error('Select an unlocked Smart Effect.');
   const old=filter.params._mask;
   let mask=old;
   if (command==='edit' && old) {
    await app.Layers.select(layer.id);
    config.mask_active=true;config.effect_mask_active=filter.id;
    new Mask().default_mask_colors();app.GUI.GUI_layers.render_layers();return;
   }
   if (command==='add' || (command==='edit' && !old)) {
    const source=config.smart_sources[layer.smart_source_id];
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    // A current selection becomes the initial effect mask in source coordinates.
    const proxy={...layer,mask:{link:canvas,x:layer.x||0,y:layer.y||0,width:layer.width,height:layer.height,linked:true}};
    const selection=new Mask().selection_alpha_for_mask(proxy);
    if(selection) {const p=selection.getContext('2d').getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<p.data.length;i+=4){p.data[i]=p.data[i+1]=p.data[i+2]=p.data[i+3];p.data[i+3]=255;}ctx.putImageData(p,0,0);}
    mask=encodeEffectMask(canvas);
   } else if(command==='toggle' && old) mask={...old,enabled:old.enabled===false};
   else if(command==='delete') mask=null;
   else if(command==='invert' && old) {
    const src=effectMaskRuntime(old).link, canvas=document.createElement('canvas');canvas.width=src.width;canvas.height=src.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(src,0,0);const p=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<p.data.length;i+=4)p.data[i]=p.data[i+1]=p.data[i+2]=255-p.data[i];ctx.putImageData(p,0,0);mask=encodeEffectMask(canvas,old.enabled!==false);
   } else return;
   const params={...filter.params};if(mask)params._mask=mask;else delete params._mask;
   const result=await app.State.do_action(new app.Actions.Update_layer_action(layer.id,{filters:layer.filters.map(f=>f===filter?{...f,params}:f)}));
   if(result.status!=='completed')throw result.reason;
   if(command==='add'||command==='edit')await this.command(layer.id,filter.id,'edit');
   else if(command==='delete' && String(config.effect_mask_active)===String(filter.id)){config.mask_active=false;config.effect_mask_active=null;app.GUI.GUI_layers.render_layers();}
  } catch(error) {alertify.error(error.message);}
 }
}
