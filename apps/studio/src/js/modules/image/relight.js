import app from '../../app.js';
import config from '../../config.js';
import Base_layers_class from '../../core/base-layers.js';
import Dialog_class from '../../libs/popup.js';
import alertify from '../../../../node_modules/alertifyjs/build/alertify.min.js';
import {default_light,normalize_light} from '../../libs/relight/math.js';
import {PATTERNS,TEMPERATURES,temperature_color} from '../../libs/relight/patterns.js';
import {fit_zoom,zoom_view} from '../../libs/relight/view.js';
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
  this.lights=[default_light()];this.selected=1;this.nextId=2;this.originalStrength=.75;
  this.patterns={};this.hiddenGuides=false;this.view={scale:1,x:0,y:0};this.fitView=true;this.spaceDown=false;
  this.ready=false;this.applying=false;this.rendering=false;this.dirty=false;this.comparing=false;this.result=null;
  this.POP.show({title:'Relight',className:'raw_develop_popup relight-popup',params:[{html:this.html()}],
   on_load:()=>this.mount(),on_cancel:()=>this.close(),on_finish:()=>this.apply()});
 }
 html(){return `<div class="studio-relight raw-develop" role="region" aria-label="Relight controls">
  <div class="raw-develop__header"><div><span class="raw-develop__title">Relight</span><span class="raw-develop__subtitle">Local depth-guided lighting</span></div><div class="raw-develop__header-actions"><button type="button" class="raw-develop__btn raw-develop__btn--ghost" data-action="reset">Reset</button><button type="button" class="raw-develop__btn" data-action="cancel">Cancel</button><button type="button" class="raw-develop__btn raw-develop__btn--primary" data-action="apply" disabled>Apply</button></div></div>
  <div class="relight-view-tools"><button type="button" data-action="zoom-out" aria-label="Zoom out">−</button><input type="number" aria-label="Preview zoom" min="5" max="400" value="100"><span>%</span><button type="button" data-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-action="fit">Fit</button><button type="button" data-action="actual">1:1</button><button type="button" data-action="compare-hold">Hold to compare</button><button type="button" data-action="guides" aria-pressed="false">Hide light guides</button><span class="relight-hint">Space-drag to pan · Ctrl/⌘-scroll to zoom</span></div>
  <input type="file" accept="image/*" data-role="pattern-file" hidden>
  <div class="relight-workspace raw-develop__body"><div class="relight-stage raw-develop__viewer"><div class="relight-image"><canvas aria-label="Relight preview"></canvas><div class="relight-handles"></div></div></div>
  <aside class="raw-develop__sidebar"><p class="relight-hint">Drag a light on the photo. Processing stays on your device.</p>
  <div class="relight-toolbar"><button type="button" data-action="add">Add Light</button></div>
  <div class="relight-list" role="list" aria-label="Lights"></div><div class="relight-controls"></div>
  <label class="relight-global">Original lighting <input type="range" aria-label="Original lighting" min="0" max="100" value="75"><output>75%</output></label>
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
   if(action==='compare-hold')return;
   if(action==='guides'){this.hiddenGuides=!this.hiddenGuides;this.root.querySelector('[data-action="guides"]').setAttribute('aria-pressed',String(this.hiddenGuides));this.handles();return;}
   if(action==='zoom-in'||action==='zoom-out'){this.changeZoom(this.view.scale*(action==='zoom-in'?1.25:.8));return;}
   if(action==='fit'){this.fitView=true;this.view.x=this.view.y=0;this.layoutView();return;}
   if(action==='actual'){this.changeZoom(1);return;}
   if(action==='reset-light'){const l=this.lights.find(l=>l.id===this.selected);if(l){delete this.patterns['light-'+l.id];Object.assign(l,default_light(l.id-1));}}
   if(action==='pattern-file'){this.root.querySelector('[data-role="pattern-file"]').click();return;}
   if(action==='pattern-layer'){this.definePattern(this.source,this.selected);return;}
   if(action==='cancel'){this.POP.hide(false);return;}
   if(action==='apply'){this.POP.save();return;}
   if(action==='add' && this.lights.length<8){const light=default_light(this.nextId-1);light.x=.5;light.y=.5;this.nextId++;this.lights.push(light);this.selected=light.id;}
   if(action==='remove'){delete this.patterns['light-'+this.selected];this.lights=this.lights.filter(l=>l.id!==this.selected);this.selected=this.lights[0]?.id;}
   if(action==='reset'){this.patterns={};this.lights=[default_light()];this.selected=1;this.nextId=2;this.originalStrength=.75;this.root.querySelector('[aria-label="Original lighting"]').value=75;this.root.querySelector('output').textContent='75%';}
   if(action==='retry'){this.startDepth();return;}
   const choice=e.target.closest('[data-light]');if(choice)this.selected=Number(choice.dataset.light);
   if(action || choice){this.controls();this.schedule();}
  });
  this.root.addEventListener('input',e=>{
   if(e.target.getAttribute('aria-label')==='Preview zoom'){this.changeZoom(Number(e.target.value)/100);return;}
   if(e.target.dataset.role==='compare'){this.comparing=e.target.checked;this.paint();return;}
   if(e.target.getAttribute('aria-label')==='Original lighting'){this.originalStrength=Number(e.target.value)/100;e.target.nextElementSibling.textContent=e.target.value+'%';this.schedule();return;}
   const key=e.target.dataset.param;if(!key)return;
   let light=this.lights.find(l=>l.id===this.selected);if(!light)return;
   const value=['enabled','patternInvert'].includes(key)?e.target.checked:['color','type','pattern'].includes(key)?e.target.value:Number(e.target.value);
   const update={[key]:value};
   if(key==='temperature')update.color=temperature_color(value);
   if(key==='color')update.temperature=0;
   Object.assign(light,normalize_light({...light,...update}));
   if(['type','pattern','temperature','color'].includes(key))this.controls();
   this.root.querySelectorAll(`[data-param="${key}"]`).forEach(input=>{if(input!==e.target)input.value=light[key];});
   this.handles();this.schedule();
  });
  const handleHost=this.root.querySelector('.relight-handles');
  handleHost.addEventListener('pointerdown',e=>{
   const handle=e.target.closest('[data-light]');if(!handle || this.applying || this.spaceDown)return;
   e.preventDefault();this.selected=Number(handle.dataset.light);this.controls();
   // Capture on the stable host: rebuilding a handle must not lose the drag.
   handleHost.setPointerCapture(e.pointerId);this.drag=e.pointerId;
   const light=this.lights.find(l=>l.id===this.selected),box=this.canvas.getBoundingClientRect();
   this.gesture={kind:handle.dataset.gizmo||'light',light:{...light},x:e.clientX,y:e.clientY,box};
  });
  handleHost.addEventListener('pointermove',e=>{
   if(this.drag!==e.pointerId)return;
   const box=this.canvas.getBoundingClientRect(),light=this.lights.find(l=>l.id===this.selected);
   const g=this.gesture||{kind:'light'};
   if(g.kind==='light'){light.x=Math.max(0,Math.min(1,(e.clientX-box.left)/box.width));light.y=Math.max(0,Math.min(1,(e.clientY-box.top)/box.height));}
   else if(g.kind==='move'){light.patternX=Math.max(-1,Math.min(2,g.light.patternX+(e.clientX-g.x)/box.width));light.patternY=Math.max(-1,Math.min(2,g.light.patternY+(e.clientY-g.y)/box.height));}
   else {
    const cx=box.left+g.light.patternX*box.width,cy=box.top+g.light.patternY*box.height;
    if(g.kind==='scale')light.patternScale=Math.max(.1,Math.min(4,g.light.patternScale*Math.hypot(e.clientX-cx,e.clientY-cy)/Math.max(1,Math.hypot(g.x-cx,g.y-cy))));
    if(g.kind==='rotate')light.patternRotation=(g.light.patternRotation+(Math.atan2(e.clientY-cy,e.clientX-cx)-Math.atan2(g.y-cy,g.x-cx))*180/Math.PI+360)%360;
   }
   this.syncPosition(light);
   this.handles();this.schedule();
  });
  const end=()=>{if(this.drag!=null)this.root?.querySelector('.relight-stage').focus?.({preventScroll:true});this.drag=null;};handleHost.addEventListener('pointerup',end);handleHost.addEventListener('pointercancel',end);
  handleHost.addEventListener('keydown',e=>{
   if(e.key==='Delete'){const l=Number(e.target.dataset.light);delete this.patterns['light-'+l];this.lights=this.lights.filter(light=>light.id!==l);this.selected=this.lights[0]?.id;this.controls();this.schedule();e.preventDefault();return;}
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   const light=this.lights.find(l=>l.id===Number(e.target.dataset.light));if(!light)return;
   e.preventDefault();e.stopPropagation();const step=e.shiftKey?.05:.01;
   const gizmo=e.target.dataset.gizmo;
   if(gizmo){
    const sign=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
    if(gizmo==='scale')light.patternScale=Math.max(.1,Math.min(4,light.patternScale+sign*step));
    if(gizmo==='rotate')light.patternRotation=(light.patternRotation+sign*(e.shiftKey?10:1)+360)%360;
    if(gizmo==='move'){const key=['ArrowLeft','ArrowRight'].includes(e.key)?'patternX':'patternY';light[key]=Math.max(-1,Math.min(2,light[key]+sign*step));}
    this.syncPosition(light);this.handles();this.root.querySelector(`[data-light="${light.id}"][data-gizmo="${gizmo}"]`)?.focus();this.schedule();return;
   }
   if(e.key==='ArrowLeft')light.x=Math.max(0,light.x-step);if(e.key==='ArrowRight')light.x=Math.min(1,light.x+step);
   if(e.key==='ArrowUp')light.y=Math.max(0,light.y-step);if(e.key==='ArrowDown')light.y=Math.min(1,light.y+step);
   e.target.style.left=light.x*100+'%';e.target.style.top=light.y*100+'%';this.syncPosition(light);this.schedule();
  });
  this.resizeObserver=new ResizeObserver(()=>this.layoutView());this.resizeObserver.observe(this.root.querySelector('.relight-stage'));this.layoutView();
  this.bindViewport();
  this.root.querySelector('[data-role="pattern-file"]').addEventListener('change',async e=>{
   const file=e.target.files[0],id=this.selected;if(!file)return;
   try{const bitmap=await createImageBitmap(file);if(this.root)this.definePattern(bitmap,id);bitmap.close();}catch(err){this.status('Could not load pattern: '+err.message);}e.target.value='';
  });
  this.controls();this.startDepth();
 }
 controls(){
  if(!this.root)return;
  this.root.querySelector('.relight-list').innerHTML=this.lights.map(l=>`<button type="button" role="listitem" data-light="${l.id}" aria-pressed="${l.id===this.selected}">Light ${l.id}</button>`).join('');
  const light=this.lights.find(l=>l.id===this.selected);
  this.root.querySelector('[data-action="add"]').disabled=this.lights.length>=8;
  const field=([key,label,min,max,step])=>`<label>${label}<span class="relight-slider"><input type="range" aria-label="${label}" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${light[key]}"><input type="number" aria-label="${label} value" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${Number(light[key].toFixed(2))}"></span></label>`;
  const names={none:'None',blinds:'Blinds',window:'Window',strip:'Light Strip',foliage:'Foliage',palm:'Palm',branches:'Branches',checker:'Checkerboard',dots:'Polka Dots','lines-h':'Horizontal Lines','lines-d':'Diagonal Lines',grid:'Grid',weave:'Weave',noise:'Noise',crosshatch:'Crosshatch',custom:'Custom Pattern'};
  this.root.querySelector('.relight-controls').innerHTML=light?`<label>Type <select aria-label="Light type" data-param="type"><option value="bulb" ${light.type==='bulb'?'selected':''}>Bulb</option><option value="sun" ${light.type==='sun'?'selected':''}>Sun</option></select></label>
   <label>Color temperature <select aria-label="Color temperature" data-param="temperature"><option value="0">Custom color</option>${TEMPERATURES.map(k=>`<option value="${k}" ${light.temperature===k?'selected':''}>${k}K${k===5500?' · Neutral':''}</option>`).join('')}</select></label>
   <label>Color <input type="color" aria-label="Light color" data-param="color" value="${light.color}"></label>
   ${[['intensity','Intensity',0,3,.01],...(light.type==='sun'?[['softness','Softness',0,1,.01]]:[]),['diffusion','Diffusion',0,1,.01],...(light.type==='bulb'?[['distance','Distance',.1,3,.01]]:[])].map(field).join('')}
   ${light.type==='sun'?`<label>Pattern <select aria-label="Light pattern" data-param="pattern">${PATTERNS.map(p=>`<option value="${p}" ${light.pattern===p?'selected':''}>${names[p]}</option>`).join('')}</select></label><div class="relight-toolbar"><button type="button" data-action="pattern-file">Load Pattern…</button><button type="button" data-action="pattern-layer">Define from Layer</button></div>
    ${light.pattern!=='none'?[['patternScale','Pattern scale',.1,4,.01],['patternRotation','Pattern rotation',0,360,1],['patternX','Pattern horizontal position',-1,2,.01],['patternY','Pattern vertical position',-1,2,.01]].map(field).join('')+`<label><input type="checkbox" data-param="patternInvert" ${light.patternInvert?'checked':''}> Invert pattern</label>`:''}`:''}
   <label><input type="checkbox" data-param="enabled" ${light.enabled?'checked':''}> Light enabled</label><div class="relight-toolbar"><button type="button" data-action="reset-light">Reset Light</button><button type="button" data-action="remove">Remove Light</button></div>`:'<p>No lights. Add a light or adjust original lighting.</p>';
  this.handles();
 }
 handles(){
  const host=this.root.querySelector('.relight-handles');host.hidden=this.hiddenGuides;
  const light=this.lights.find(l=>l.id===this.selected);
  let gizmos='';
  if(light?.enabled && light.type==='sun' && light.pattern!=='none'){
   const x=light.patternX*100,y=light.patternY*100,r=18*light.patternScale;
   gizmos=`<div class="relight-pattern-frame" style="left:${x}%;top:${y}%;width:${r*2}%;height:${r*2}%;transform:translate(-50%,-50%) rotate(${light.patternRotation}deg)"></div>`;
   for(const [kind,label,px,py] of [['move','Move pattern',x-r,y-r],['scale','Scale pattern',x+r,y+r],['rotate','Rotate pattern',x,y-r-5]])gizmos+=`<button type="button" class="relight-pattern-handle" data-light="${light.id}" data-gizmo="${kind}" aria-label="${label}" style="left:${px}%;top:${py}%">${kind==='move'?'✥':kind==='scale'?'↗':'↻'}</button>`;
  }
  host.innerHTML=this.lights.filter(l=>l.enabled).map(l=>`<button type="button" data-light="${l.id}" aria-label="Move Light ${l.id}" aria-pressed="${l.id===this.selected}" style="left:${l.x*100}%;top:${l.y*100}%">${l.id}</button>`).join('')+gizmos;
 }
 syncPosition(light){for(const key of ['x','y','patternX','patternY','patternScale','patternRotation'])this.root.querySelectorAll(`[data-param="${key}"]`).forEach(input=>input.value=light[key]?.toFixed(2));}
 definePattern(source,id){
  const light=this.lights.find(l=>l.id===id);if(!light || !this.root)return;
  const c=document.createElement('canvas'),scale=Math.min(1,512/Math.max(source.width,source.height));c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));
  const ctx=c.getContext('2d');ctx.drawImage(source,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height).data,data=new Uint8Array(c.width*c.height);
  for(let i=0;i<data.length;i++)data[i]=Math.round((pixels[i*4]*.2126+pixels[i*4+1]*.7152+pixels[i*4+2]*.0722)*pixels[i*4+3]/255);
  const key='light-'+id;this.patterns[key]={data,width:c.width,height:c.height};light.pattern='custom';light.customPatternId=key;this.controls();this.schedule();
 }
 layoutView(){
  if(!this.root)return;const box=this.root.querySelector('.relight-stage').getBoundingClientRect();
  const width=this.source?.width||this.preview.width,height=this.source?.height||this.preview.height;
  if(this.fitView)this.view.scale=fit_zoom(box.width,box.height,width,height);
  const image=this.root.querySelector('.relight-image');image.style.width=Math.max(1,width*this.view.scale)+'px';image.style.height=Math.max(1,height*this.view.scale)+'px';image.style.transform=`translate(${this.view.x}px,${this.view.y}px)`;
  this.root.querySelector('[aria-label="Preview zoom"]').value=Math.round(this.view.scale*100);
 }
 changeZoom(scale,x=0,y=0){this.fitView=false;this.view=zoom_view(this.view,scale,x,y);this.layoutView();}
 bindViewport(){
  const stage=this.root.querySelector('.relight-stage'),compare=this.root.querySelector('[data-action="compare-hold"]');
  stage.tabIndex=0;
  this.root.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.closest('input,select,textarea,button')){e.preventDefault();this.spaceDown=true;}});
  this.root.addEventListener('keyup',e=>{if(e.code==='Space')this.spaceDown=false;});
  stage.addEventListener('pointerdown',e=>{if(!this.spaceDown&&e.button!==1)return;e.preventDefault();stage.setPointerCapture(e.pointerId);this.pan={id:e.pointerId,x:e.clientX,y:e.clientY,px:this.view.x,py:this.view.y};});
  stage.addEventListener('pointermove',e=>{if(this.pan?.id!==e.pointerId)return;this.view.x=this.pan.px+e.clientX-this.pan.x;this.view.y=this.pan.py+e.clientY-this.pan.y;this.layoutView();});
  const end=()=>{this.pan=null;this.spaceDown=false;};stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('blur',end);
  stage.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey&&!e.altKey)return;e.preventDefault();const box=stage.getBoundingClientRect();this.changeZoom(this.view.scale*Math.exp(-e.deltaY*.002),e.clientX-box.left-box.width/2,e.clientY-box.top-box.height/2);},{passive:false});
  compare.addEventListener('pointerdown',e=>{compare.setPointerCapture(e.pointerId);this.holdingCompare=true;this.paint();});
  const release=()=>{this.holdingCompare=false;this.paint();};compare.addEventListener('pointerup',release);compare.addEventListener('pointercancel',release);compare.addEventListener('blur',release);
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
 settings(){return {original:this.originalStrength,patterns:this.patterns,lights:this.lights.map(l=>({...l}))};}
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
 paint(){if(this.canvas)this.canvas.getContext('2d').putImageData((this.comparing||this.holdingCompare)?this.previewOriginal:(this.result||this.previewOriginal),0,0);}
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
 close(){this.resizeObserver?.disconnect();this.resizeObserver=null;this.runtime?.close();this.runtime=null;this.root=null;this.patterns=null;this.canvas=null;this.source=null;this.original=null;this.previewOriginal=null;this.preview=null;this.result=null;}
}
