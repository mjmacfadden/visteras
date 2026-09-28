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
   const hasFilters=layer?.filters?.some(f=>f.name.startsWith('smart:'));
   if (!layer || layer.type!=='smart' || layer.locked || !hasFilters) throw new Error('Select an unlocked Smart Layer with filters.');
   const old=layer.smart_filter_mask;
   let mask=old;
   if (command==='edit' && old) {
    await app.Layers.select(layer.id);
    config.mask_active=true;config.effect_mask_active='stack';
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

   const result=await app.State.do_action(new app.Actions.Update_layer_action(layer.id,{smart_filter_mask:mask}));
   if(result.status!=='completed')throw result.reason;
   if(command==='add'||command==='edit')await this.command(layer.id,null,'edit');
   else if(command==='delete' && config.layer?.id===layer.id && config.effect_mask_active==='stack'){config.mask_active=false;config.effect_mask_active=null;app.GUI.GUI_layers.render_layers();}
  } catch(error) {alertify.error(error.message);}
 }
}
