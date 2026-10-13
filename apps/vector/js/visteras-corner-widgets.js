import {CORNER_TYPES,eligibleCorners,buildCorners,maxRadius,parseCornerData,serializeCornerData,cornerRadiusScale} from './visteras-live-corners.js';
import {serializeSegments,anchors} from './visteras-anchor-model.js';
import {bindNumericField,readNumericField} from './visteras-numeric-field.js';
import {convertFromPixels,convertToPixels} from './visteras-document-presets.js';
const ATTR='data-visteras-corners';
const STORAGE_KEY_CORNER_WIDGET='visteras_corner_widget';
export function mountCornerWidgets(editor,{getRecords,readGeometry,write,schedule,point,matrix,stop}){
 const sc=editor.svgCanvas;
 let visible=true,drag=null;
 try{visible=localStorage.getItem(STORAGE_KEY_CORNER_WIDGET)!=='0';}catch{}
 const unit=()=>window.__visterasDocumentShell?.getBaseUnit?.()||'px';
 const menu=document.createElement('div');menu.className='menu_dropdown_item';menu.id='action_corner_widget';menu.textContent='Hide Corner Widget';
 const gradient=document.getElementById('action_toggle_gradient_annotator');gradient?.after?.(menu);
 function toggle(){visible=!visible;menu.textContent=visible?'Hide Corner Widget':'Show Corner Widget';try{localStorage.setItem(STORAGE_KEY_CORNER_WIDGET,visible?'1':'0');}catch{}schedule();}
 menu.textContent=visible?'Hide Corner Widget':'Show Corner Widget';menu.addEventListener('click',toggle);
 function model(rec){
   if(rec.el.localName==='rect'){
     const el=rec.el,x=Number(el.getAttribute('x'))||0,y=Number(el.getAttribute('y'))||0,w=Number(el.getAttribute('width')),h=Number(el.getAttribute('height'));
     const base=[{type:2,x,y},{type:4,x:x+w,y},{type:4,x:x+w,y:y+h},{type:4,x,y:y+h},{type:4,x,y},{type:1}];
     const r=Number(el.getAttribute('rx')||el.getAttribute('ry'))||0;
     return {base:serializeSegments(base),segments:base,corners:eligibleCorners(base).map(c=>({contour:c.contour,index:c.index,r,type:'round'})),rect:true};
   }
   const data=parseCornerData(rec.el.getAttribute(ATTR));
   return data?{...data,segments:readGeometry(rec.el,data.base)}:{base:sc.getPathDataForElement(rec.el),segments:readGeometry(rec.el),corners:[]};
 }
 function candidates(rec){
   const data=model(rec),built=buildCorners(data.segments,data.corners),list=anchors(rec.segments),all=!rec.selected.size||list.every(a=>rec.selected.has(a.index));
   const eligible=eligibleCorners(data.segments);
   return {data,all,corners:eligible.filter(c=>all||(built.map.get(c.index)||[c.index]).some(i=>rec.selected.has(i)))};
 }
 function render(create,records,zoom){
   if(sc.getMode()!=='pathedit')return;
   const rectangle=records.length===1&&records[0].el.localName==='rect'?records[0]:null;
   const row=document.getElementById('prop_row_radius');if(row)row.style.display=rectangle?'flex':'none';
   if(rectangle){const field=document.getElementById('rect_rx');if(field)field.value=Number(rectangle.el.getAttribute('rx'))||0;}
   if(!visible)return;
   for(const [i,rec]of records.entries()){
     if(!rec.el.isConnected)continue;
     const {data,corners}=candidates(rec);
     for(const c of corners){
       const r=data.corners.find(v=>v.index===c.index)?.r||0;
       const m=matrix(rec.el),p=point(c.p.x,c.p.y,m),b=point(c.p.x+c.basis.bisector.x,c.p.y+c.basis.bisector.y,m),length=Math.hypot(b.x-p.x,b.y-p.y)||1;
       const offset=Math.max(14/zoom,r/c.basis.sinHalf*length+8/zoom);
       const cx=(p.x+(b.x-p.x)/length*offset)*zoom,cy=(p.y+(b.y-p.y)/length*offset)*zoom;
       create('circle',{cx,cy,r:6.5,fill:'#fff',stroke:'#3f8ff7','stroke-width':1.5,'data-corner-record':i,'data-corner-index':c.index,'vector-effect':'non-scaling-stroke',style:'cursor:crosshair'});
       create('circle',{cx,cy,r:3,fill:'#3f8ff7','pointer-events':'none'});
     }
   }
 }
 function begin(rec,index){
   const {data,corners,all}=candidates(rec),target=corners.find(c=>c.index===index);if(!target)return null;
   return {rec,data,target,targets:corners,all,original:rec.el,selection:new Set(rec.selected),attrs:Object.fromEntries(['d',ATTR,'rx','ry'].map(a=>[a,rec.el.getAttribute(a)])),before:null,r:data.corners.find(c=>c.index===index)?.r||0,type:data.corners.find(c=>c.index===index)?.type||'round'};
 }
 function restore(g){
   g.original.removeAttribute('data-corner-limit');
   if(g.before?.conversion){g.rec.el.replaceWith(g.original);g.rec.el=g.original;}
   for(const [a,v]of Object.entries(g.attrs))v===null?g.original.removeAttribute(a):g.original.setAttribute(a,v);
   g.rec.selected=new Set(g.selection);g.before=null;
 }
 function preview(g,r,type){
   restore(g);g.r=Math.max(0,r);g.type=type;
   const selected=new Set(g.targets.map(c=>c.index));
   const specs=g.data.corners.filter(c=>!selected.has(c.index));
   specs.push(...g.targets.map(c=>({contour:c.contour,index:c.index,r:g.r,type})));
   const built=buildCorners(g.data.segments,specs);
   g.clamped=built.corners.some(c=>selected.has(c.index)&&c.r+1e-6<g.r);
   if(g.data.rect&&g.all&&type==='round'){
     const actual=Math.min(...g.targets.map(c=>maxRadius(c.prev,c.p,c.next)),g.r);
     g.rec.el.setAttribute('rx',actual);g.rec.el.setAttribute('ry',actual);
     g.clamped=actual+1e-6<g.r;
   }else{
     g.before={rec:g.rec};write(g.before,built.segments);
     g.rec.el.setAttribute(ATTR,serializeCornerData({base:g.data.base,gen:g.rec.el.getAttribute('d'),corners:built.corners}));
   }
   g.rec.segments=readGeometry(g.rec.el);
   g.rec.selected=g.all?new Set(anchors(g.rec.segments).map(a=>a.index)):new Set(g.targets.flatMap(c=>built.map.get(c.index)||[c.index]));
   schedule();
 }
 function commit(g){
   g.original.removeAttribute('data-corner-limit');g.rec.el.removeAttribute('data-corner-limit');
   const {BatchCommand,ChangeElementCommand,RemoveElementCommand,InsertElementCommand}=sc.history;
   const batch=new BatchCommand('Live Corners');
   if(g.before?.conversion){const c=g.before.conversion;batch.addSubCommand(new RemoveElementCommand(c.original,c.next,c.parent));batch.addSubCommand(new InsertElementCommand(c.path));}
   else{
     const changed=Object.fromEntries(Object.entries(g.attrs).filter(([a,v])=>g.rec.el.getAttribute(a)!==v));
     if(!Object.keys(changed).length)return;
     batch.addSubCommand(new ChangeElementCommand(g.rec.el,changed,'Live Corners'));
   }
   sc.addCommandToHistory(batch);sc.call('changed',[g.rec.el]);schedule();
 }
 function localPosition(e,g){const screen=g.rec.el.getScreenCTM();return new DOMPoint(e.clientX,e.clientY).matrixTransform(screen.inverse());}
 window.addEventListener('mousedown',e=>{
   const node=e.target.closest?.('[data-corner-index]');if(!node||e.button!==0||sc.getMode()!=='pathedit')return;
   stop(e);document.activeElement?.blur?.();
   const rec=getRecords()[Number(node.getAttribute('data-corner-record'))],g=begin(rec,Number(node.getAttribute('data-corner-index')));if(!g)return;
   const p=localPosition(e,g);g.startProjection=(p.x-g.target.p.x)*g.target.basis.bisector.x+(p.y-g.target.p.y)*g.target.basis.bisector.y;g.startR=g.r;g.start={x:e.clientX,y:e.clientY};g.alt=e.altKey;drag=g;
 },true);
 window.addEventListener('mousemove',e=>{
   if(!drag)return;stop(e);const g=drag;
   if(!g.moved&&Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)<2)return;
   g.moved=true;const p=localPosition(e,g),projection=(p.x-g.target.p.x)*g.target.basis.bisector.x+(p.y-g.target.p.y)*g.target.basis.bisector.y;
   preview(g,g.startR+(projection-g.startProjection)*g.target.basis.sinHalf,g.type);
   if(g.clamped)g.rec.el.setAttribute('data-corner-limit','');else g.rec.el.removeAttribute('data-corner-limit');
 },true);
 window.addEventListener('mouseup',e=>{
   if(!drag)return;stop(e);const g=drag;drag=null;
   if(!g.moved&&g.alt)preview(g,g.r,CORNER_TYPES[(CORNER_TYPES.indexOf(g.type)+1)%3]);
   commit(g);
 },true);
 window.addEventListener('keydown',e=>{
   if(!drag||e.isComposing||window.__visterasIsTypingDirectly||e.composedPath().some(el=>el?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el?.nodeName)))return;
   if(e.key==='Escape'){stop(e);restore(drag);drag.rec.el.removeAttribute('data-corner-limit');drag=null;schedule();}
   else if(['ArrowUp','ArrowDown'].includes(e.key)){stop(e);preview(drag,drag.r,CORNER_TYPES[(CORNER_TYPES.indexOf(drag.type)+(e.key==='ArrowUp'?1:2))%3]);}
 },true);
 window.addEventListener('blur',()=>{if(drag){restore(drag);drag.rec.el.removeAttribute('data-corner-limit');drag=null;schedule();}});
 window.addEventListener('dblclick',e=>{
   const node=e.target.closest?.('[data-corner-index]');if(!node)return;stop(e);
   const g=begin(getRecords()[Number(node.getAttribute('data-corner-record'))],Number(node.getAttribute('data-corner-index')));if(g)dialog(g);
 },true);
 function dialog(g){
   const scale=cornerRadiusScale(matrix(g.rec.el));
   const overlay=document.createElement('div');overlay.className='vui-overlay';
   overlay.innerHTML=`<div class="vui-dialog" role="dialog" aria-label="Corners"><div class="vui-dialog-header"><span class="vui-dialog-title">Corners</span></div><div class="vui-dialog-body"><div class="vui-field"><span>Corner</span><div class="corner-types"></div></div><label class="vui-field">Radius <input type="text" inputmode="decimal" aria-label="Radius" value="${convertFromPixels(g.r*scale,unit())}"> ${unit()}</label><fieldset><legend>Rounding</legend><label><input type="radio" name="rounding" checked> Absolute</label> <label title="Later"><input type="radio" name="rounding" disabled> Relative (Later)</label></fieldset></div><div class="vui-dialog-actions"><button class="vui-btn vui-btn-secondary" data-act="cancel">Cancel</button><button class="vui-btn vui-btn-accent" data-act="ok">OK</button></div></div>`;
   let type=g.type;
   for(const [value,label,d]of [['round','Round','M3 21V13C3 7 7 3 13 3H21'],['inverted','Inverted Round','M3 21V13C9 13 13 9 13 3H21'],['chamfer','Chamfer','M3 21V13L13 3H21']]){
     const button=document.createElement('button');button.type='button';button.className='vui-btn';button.setAttribute('aria-label',label);button.title=label;button.dataset.type=value;button.setAttribute('aria-pressed',String(type===value));button.innerHTML=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${d}"/></svg>`;
     button.addEventListener('click',()=>{type=value;overlay.querySelectorAll('[data-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===type)));});overlay.querySelector('.corner-types').append(button);
   }
   document.body.append(overlay);const input=overlay.querySelector('[aria-label=Radius]');bindNumericField(input,{unit});input.focus();input.select();
   const close=()=>overlay.remove();
   const ok=()=>{const radius=readNumericField(input,unit());if(radius===null||radius<0){input.value=String(convertFromPixels(g.r*scale,unit()));return;}preview(g,convertToPixels(radius,unit())/scale,type);commit(g);close();};
   overlay.querySelector('[data-act=ok]').addEventListener('click',ok);overlay.querySelector('[data-act=cancel]').addEventListener('click',close);
   overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){stop(e);close();}else if(e.key==='Enter'){stop(e);ok();}});
 }
 document.getElementById('rect_rx')?.addEventListener('change',e=>{
   if(sc.getMode()!=='pathedit')return;const records=getRecords();if(records.length!==1||records[0].el.localName!=='rect')return;
   stop(e);const rec=records[0],g=begin(rec,0);if(!g)return;g.all=true;g.targets=eligibleCorners(g.data.segments);preview(g,Number(e.target.value)||0,'round');commit(g);
 },true);
 const style=document.createElement('style');style.textContent=`[data-corner-limit]{stroke:red!important} .corner-types{display:flex;gap:8px;margin:8px 0}.corner-types [aria-pressed=true]{color:#3f8ff7;border-color:#3f8ff7}.vui-dialog[aria-label=Corners]{width:340px}.vui-dialog[aria-label=Corners] input{accent-color:#3f8ff7}`;document.head.append(style);
 return {render};
}
