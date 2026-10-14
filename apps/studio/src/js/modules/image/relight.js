import app from '../../app.js';
import config from '../../config.js';
import Base_layers_class from '../../core/base-layers.js';
import Dialog_class from '../../libs/popup.js';
import alertify from '../../../../node_modules/alertifyjs/build/alertify.min.js';
import {default_light,normalize_light} from '../../libs/relight/math.js';
import {RelightRuntime} from '../../libs/relight/runtime.js';
import '../../../css/relight.css';

export default class Image_relight_class {
 constructor(){this.Base_layers=new Base_layers_class();this.POP=new Dialog_class();}
 relight(){
  const layer=config.layer;
  if(!layer || layer.type!=='image'){alertify.error('Select a raster image layer to use Relight.');return;}
  if(layer.locked || config.mask_active){alertify.error('Unlock the image layer and select its pixels to use Relight.');return;}
  if(this.root)return;
  this.layer=layer;this.documentId=app.Documents.active_id;
  // Capture source pixels rather than rendered opacity, masks, filters or transforms.
  const link=layer.link_canvas||layer.link;
  this.source=document.createElement('canvas');this.source.width=layer.width_original;this.source.height=layer.height_original;
  if(!link || !this.source.width || !this.source.height){alertify.error('This image layer is empty.');return;}
  this.source.getContext('2d').drawImage(link,0,0,this.source.width,this.source.height);
  this.original=this.source.getContext('2d').getImageData(0,0,this.source.width,this.source.height);
  if(!this.original.data.some((v,i)=>i%4===3 && v>0)){alertify.error('This image layer is empty.');return;}
  this.preview=document.createElement('canvas');
  const scale=Math.min(1,720/Math.max(this.source.width,this.source.height));
  this.preview.width=Math.max(1,Math.round(this.source.width*scale));this.preview.height=Math.max(1,Math.round(this.source.height*scale));
  this.preview.getContext('2d').drawImage(this.source,0,0,this.preview.width,this.preview.height);
  this.previewOriginal=this.preview.getContext('2d').getImageData(0,0,this.preview.width,this.preview.height);
  this.lights=[default_light()];this.selected=1;this.nextId=2;this.originalStrength=1;
  this.ready=false;this.applying=false;this.rendering=false;this.dirty=false;this.comparing=false;this.result=null;
  this.POP.show({title:'Relight',className:'raw_develop_popup relight-popup',params:[{html:this.html()}],
   on_load:()=>this.mount(),on_cancel:()=>this.close(),on_finish:()=>this.apply()});
 }
 html(){return `<div class="studio-relight raw-develop" role="region" aria-label="Relight controls">
  <div class="raw-develop__header"><div><span class="raw-develop__title">Relight</span><span class="raw-develop__subtitle">Local depth-guided lighting</span></div><div class="raw-develop__header-actions"><button type="button" class="raw-develop__btn raw-develop__btn--ghost" data-action="reset">Reset</button><button type="button" class="raw-develop__btn" data-action="cancel">Cancel</button><button type="button" class="raw-develop__btn raw-develop__btn--primary" data-action="apply" disabled>Apply</button></div></div>
  <div class="relight-workspace raw-develop__body"><div class="relight-stage raw-develop__viewer"><div class="relight-image"><canvas aria-label="Relight preview"></canvas><div class="relight-handles"></div></div></div>
  <aside class="raw-develop__sidebar"><p class="relight-hint">Drag a light on the photo. Processing stays on your device.</p>
  <div class="relight-toolbar"><button type="button" data-action="add">Add Light</button></div>
  <div class="relight-list" role="list" aria-label="Lights"></div><div class="relight-controls"></div>
  <label class="relight-global">Original lighting <input type="range" aria-label="Original lighting" min="0" max="100" value="100"><output>100%</output></label>
  <label><input type="checkbox" data-role="compare"> Show original</label>
  <p class="relight-hint">Apply changes the selected layer in one undo step.</p>
  </aside></div><p class="relight-status" role="status" aria-live="polite">Preparing local depth estimation…</p><button type="button" data-action="retry" hidden>Retry depth estimation</button></div>`;}
 mount(){
  this.root=this.POP.el.querySelector('.studio-relight');
  this.canvas=this.root.querySelector('canvas');this.canvas.width=this.preview.width;this.canvas.height=this.preview.height;
  this.canvas.getContext('2d').putImageData(this.previewOriginal,0,0);
  const ok=this.POP.el.querySelector('[data-id="popup_ok"]');ok.textContent='Apply';ok.disabled=true;
  this.root.addEventListener('click',e=>{
   const action=e.target.closest('[data-action]')?.dataset.action;
   if(action==='cancel'){this.POP.hide(false);return;}
   if(action==='apply'){this.POP.save();return;}
   if(action==='add' && this.lights.length<8){const light=default_light(this.nextId-1);light.x=.5;light.y=.5;this.nextId++;this.lights.push(light);this.selected=light.id;}
   if(action==='remove'){this.lights=this.lights.filter(l=>l.id!==this.selected);this.selected=this.lights[0]?.id;}
   if(action==='reset'){this.lights=[default_light()];this.selected=1;this.nextId=2;this.originalStrength=1;this.root.querySelector('[aria-label="Original lighting"]').value=100;this.root.querySelector('output').textContent='100%';}
   if(action==='retry'){this.startDepth();return;}
   const choice=e.target.closest('[data-light]');if(choice)this.selected=Number(choice.dataset.light);
   if(action || choice){this.controls();this.schedule();}
  });
  this.root.addEventListener('input',e=>{
   if(e.target.dataset.role==='compare'){this.comparing=e.target.checked;this.paint();return;}
   if(e.target.getAttribute('aria-label')==='Original lighting'){this.originalStrength=Number(e.target.value)/100;e.target.nextElementSibling.textContent=e.target.value+'%';this.schedule();return;}
   const key=e.target.dataset.param;if(!key)return;
   let light=this.lights.find(l=>l.id===this.selected);if(!light)return;
   const value=key==='enabled'?e.target.checked:['color','type'].includes(key)?e.target.value:Number(e.target.value);
   Object.assign(light,normalize_light({...light,[key]:value}));
   this.root.querySelectorAll(`[data-param="${key}"]`).forEach(input=>{if(input!==e.target)input.value=light[key];});
   this.handles();this.schedule();
  });
  const handleHost=this.root.querySelector('.relight-handles');
  handleHost.addEventListener('pointerdown',e=>{
   const handle=e.target.closest('[data-light]');if(!handle || this.applying)return;
   e.preventDefault();this.selected=Number(handle.dataset.light);this.controls();
   // Capture on the stable host: rebuilding a handle must not lose the drag.
   handleHost.setPointerCapture(e.pointerId);this.drag=e.pointerId;
  });
  handleHost.addEventListener('pointermove',e=>{
   if(this.drag!==e.pointerId)return;
   const box=this.canvas.getBoundingClientRect(),light=this.lights.find(l=>l.id===this.selected);
   light.x=Math.max(0,Math.min(1,(e.clientX-box.left)/box.width));light.y=Math.max(0,Math.min(1,(e.clientY-box.top)/box.height));
   this.handles();this.schedule();
  });
  const end=()=>{this.drag=null;};handleHost.addEventListener('pointerup',end);handleHost.addEventListener('pointercancel',end);
  handleHost.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   const light=this.lights.find(l=>l.id===Number(e.target.dataset.light));if(!light)return;
   e.preventDefault();e.stopPropagation();const step=e.shiftKey?.05:.01;
   if(e.key==='ArrowLeft')light.x=Math.max(0,light.x-step);if(e.key==='ArrowRight')light.x=Math.min(1,light.x+step);
   if(e.key==='ArrowUp')light.y=Math.max(0,light.y-step);if(e.key==='ArrowDown')light.y=Math.min(1,light.y+step);
   e.target.style.left=light.x*100+'%';e.target.style.top=light.y*100+'%';this.schedule();
  });
  const fit=()=>{if(!this.root)return;const stage=this.root.querySelector('.relight-stage'),image=this.root.querySelector('.relight-image');const box=stage.getBoundingClientRect(),scale=Math.min((box.width-32)/this.preview.width,(box.height-32)/this.preview.height);image.style.width=Math.max(1,this.preview.width*scale)+'px';image.style.height=Math.max(1,this.preview.height*scale)+'px';};
  this.resizeObserver=new ResizeObserver(fit);this.resizeObserver.observe(this.root.querySelector('.relight-stage'));fit();
  this.controls();this.startDepth();
 }
 controls(){
  if(!this.root)return;
  this.root.querySelector('.relight-list').innerHTML=this.lights.map(l=>`<button type="button" role="listitem" data-light="${l.id}" aria-pressed="${l.id===this.selected}">Light ${l.id}</button>`).join('');
  const light=this.lights.find(l=>l.id===this.selected);
  this.root.querySelector('[data-action="add"]').disabled=this.lights.length>=8;
  this.root.querySelector('.relight-controls').innerHTML=light?`<label>Type <select aria-label="Light type" data-param="type"><option value="bulb" ${light.type==='bulb'?'selected':''}>Bulb</option><option value="sun" ${light.type==='sun'?'selected':''}>Sun</option></select></label>
   <label>Color <input type="color" aria-label="Light color" data-param="color" value="${light.color}"></label>
   ${[['intensity','Intensity',0,3,.01],['diffusion','Diffusion',0,1,.01],['distance','Distance',.1,3,.01]].map(([key,label,min,max,step])=>`<label>${label}<span class="relight-slider"><input type="range" aria-label="${label}" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${light[key]}"><input type="number" aria-label="${label} value" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${light[key]}"></span></label>`).join('')}
   <label><input type="checkbox" data-param="enabled" ${light.enabled?'checked':''}> Light enabled</label><button type="button" data-action="remove">Remove Light</button>`:'<p>No lights. Add a light or adjust original lighting.</p>';
  this.handles();
 }
 handles(){
  this.root.querySelector('.relight-handles').innerHTML=this.lights.filter(l=>l.enabled).map(l=>`<button type="button" data-light="${l.id}" aria-label="Move Light ${l.id}" aria-pressed="${l.id===this.selected}" style="left:${l.x*100}%;top:${l.y*100}%">${l.id}</button>`).join('');
 }
 status(message){if(this.root)this.root.querySelector('[role="status"]').textContent=message;}
 async startDepth(){
  this.runtime?.close();const runtime=this.runtime=new RelightRuntime();this.ready=false;
  this.root.querySelector('[data-action="apply"]').disabled=true;this.root.querySelector('[data-action="retry"]').hidden=true;
  const input=document.createElement('canvas'),scale=Math.min(1,512/Math.max(this.source.width,this.source.height));
  input.width=Math.max(1,Math.round(this.source.width*scale));input.height=Math.max(1,Math.round(this.source.height*scale));
  const ctx=input.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,input.width,input.height);ctx.drawImage(this.source,0,0,input.width,input.height);
  try {
   const depth=await runtime.depth(input,p=>{
    if(runtime!==this.runtime)return;
    this.status(p.status==='inference'?'Estimating surface depth on your device…':p.status==='progress'?`Downloading depth model… ${Math.round(p.progress||0)}%`:'Loading local depth model…');
   });
   await runtime.prepare(depth);if(!this.root || runtime!==this.runtime)return;
   this.ready=true;this.root.querySelector('[data-action="apply"]').disabled=false;
   this.status('Depth ready · Drag lights to preview.');this.schedule();
  }catch(e){if(this.root && runtime===this.runtime){this.status('Depth estimation failed: '+e.message);this.root.querySelector('[data-action="retry"]').hidden=false;}}
 }
 settings(){return {original:this.originalStrength,lights:this.lights.map(l=>({...l}))};}
 schedule(){
  if(!this.ready || !this.root || this.applying)return;
  this.dirty=true;if(this.rendering)return;this.rendering=true;
  const runtime=this.runtime;
  (async()=>{try{
   while(this.dirty && this.root && runtime===this.runtime && !this.applying){
    this.dirty=false;const result=await runtime.render(this.previewOriginal,this.settings());
    if(this.root && runtime===this.runtime){this.result=new ImageData(new Uint8ClampedArray(result.pixels),this.preview.width,this.preview.height);this.paint();}
   }
  }catch(e){if(this.root && runtime===this.runtime)this.status(e.message);}finally{if(runtime===this.runtime)this.rendering=false;}})();
 }
 paint(){if(this.canvas)this.canvas.getContext('2d').putImageData(this.comparing?this.previewOriginal:(this.result||this.previewOriginal),0,0);}
 async apply(){
  if(!this.ready || this.applying)return false;
  if(app.Documents.active_id!==this.documentId || !config.layers.includes(this.layer) || this.layer.locked){this.status('The document or layer changed. Cancel and reopen Relight.');return false;}
  const root=this.root,runtime=this.runtime,settings=this.settings();this.applying=true;
  this.root.querySelectorAll('aside input,aside select,aside button,.relight-handles button').forEach(el=>el.disabled=true);
  this.root.querySelector('[data-action="apply"]').disabled=true;this.status('Applying full-resolution lighting…');
  try{
   const result=await runtime.render(this.original,settings);
   if(this.root!==root || app.Documents.active_id!==this.documentId || !config.layers.includes(this.layer) || this.layer.locked)return false;
   const canvas=document.createElement('canvas');canvas.width=this.source.width;canvas.height=this.source.height;
   canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.pixels),canvas.width,canvas.height),0,0);
   await app.State.do_action(new app.Actions.Update_layer_image_action(canvas,this.layer.id));
   this.close();return true;
  }catch(e){if(this.root){this.status(e.message);this.root.querySelector('[data-action="apply"]').disabled=false;this.root.querySelectorAll('aside input,aside select,aside button,.relight-handles button').forEach(el=>el.disabled=false);this.controls();}return false;}
  finally{this.applying=false;}
 }
 close(){this.resizeObserver?.disconnect();this.resizeObserver=null;this.runtime?.close();this.runtime=null;this.root=null;this.canvas=null;this.source=null;this.original=null;this.previewOriginal=null;this.preview=null;this.result=null;}
}
