import {eventMatchesChord} from './visteras-browser-shortcuts.js';
import {formatShortcut} from './visteras-shortcut-label.js';
export function pointInPolygon(point,polygon){
 if(polygon.length<3)return false;
 const origin=polygon[0],second=polygon.find(p=>Math.hypot(p.x-origin.x,p.y-origin.y)>1e-8);
 if(!second||!polygon.some(p=>Math.abs((second.x-origin.x)*(p.y-origin.y)-(second.y-origin.y)*(p.x-origin.x))>1e-8))return false;
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const a=polygon[j],b=polygon[i],dx=b.x-a.x,dy=b.y-a.y;
   if(Math.hypot(dx,dy)>1e-8&&Math.abs((point.x-a.x)*dy-(point.y-a.y)*dx)<1e-7&&point.x>=Math.min(a.x,b.x)&&point.x<=Math.max(a.x,b.x)&&point.y>=Math.min(a.y,b.y)&&point.y<=Math.max(a.y,b.y))return true;
   if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
export function anchorsInLasso(anchorList,polygon,mode='replace',previous=new Map()){
 const result=mode==='replace'?new Map():new Map([...previous].map(([el,set])=>[el,new Set(set)]));
 for(const a of anchorList){
   if(!pointInPolygon(a,polygon))continue;
   if(mode==='subtract')result.get(a.el)?.delete(a.index);
   else {if(!result.has(a.el))result.set(a.el,new Set());result.get(a.el).add(a.index);}
 }
 for(const [el,set]of result)if(!set.size)result.delete(el);
 return result;
}
const MODE='visteras-lasso';
const typing=e=>e.isComposing||window.__visterasIsTypingDirectly||e.composedPath().some(el=>el?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el?.nodeName));
export function mountLasso(editor){
 const sc=editor.svgCanvas,btn=document.createElement('se-button');
 btn.id='tool_lasso';btn.setAttribute('title',`Lasso Tool (${formatShortcut({key:'Q'})})`);btn.setAttribute('src','lasso.svg?v=illustrator-3');
 document.getElementById('tool_direct_select')?.after(btn);
 const activate=()=>{const selected=(sc.getSelectedElements?.()||[]).filter(Boolean);if(!sc.directSelection.active&&selected.length){sc.directSelection.showAnchors(selected,true);sc.clearSelection();}sc.setMode(MODE);editor.leftPanel?.updateLeftPanel?.('tool_lasso');btn.setAttribute('pressed','true');};
 btn.addEventListener('click',activate);
 let gesture=null,line=null;
 const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
 function clear(){line?.remove();line=null;gesture=null;}
 function draw(){
   if(!line){line=document.createElementNS('http://www.w3.org/2000/svg','path');line.id='visteras-lasso-overlay';line.setAttribute('fill','none');line.setAttribute('stroke','var(--visteras-accent)');line.setAttribute('stroke-width','1');line.setAttribute('stroke-dasharray','4 3');line.setAttribute('pointer-events','none');line.style.cssText='position:fixed;z-index:99999';
     const root=document.createElementNS('http://www.w3.org/2000/svg','svg');root.id='visteras-lasso-screen';root.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:99999';root.append(line);document.body.append(root);
   }
   line.setAttribute('d',gesture.points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '));
 }
 function cancel(){document.getElementById('visteras-lasso-screen')?.remove();clear();}
 document.addEventListener('modeChange',()=>{
   if(sc.getMode()===MODE){btn.setAttribute('pressed','true');editor.leftPanel?.updateLeftPanel?.('tool_lasso');}
   else{btn.removeAttribute('pressed');cancel();}
 });
 window.addEventListener('keydown',e=>{
   if(typing(e))return;
   if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&eventMatchesChord(e,{key:'Q'})){stop(e);activate();}
   else if(e.key==='Escape'&&gesture){stop(e);cancel();}
 },true);
 window.addEventListener('pointerdown',e=>{
   if(sc.getMode()!==MODE||e.button!==0||sc.spaceKey||!sc.getSvgRoot().contains(e.target))return;
   stop(e);gesture={points:[{x:e.clientX,y:e.clientY}],mode:e.altKey?'subtract':e.shiftKey?'add':'replace',previous:sc.directSelection.getAnchorSelection(),anchors:sc.directSelection.getAnchorCandidates(),pointer:e.pointerId};draw();
 },true);
 // Suppress SVG-Edit's legacy object drag even where compatibility mouse events fire.
 window.addEventListener('mousedown',e=>{if(sc.getMode()===MODE&&e.button===0&&sc.getSvgRoot().contains(e.target))stop(e);},true);
 window.addEventListener('pointermove',e=>{
   if(!gesture||gesture.pointer!==e.pointerId)return;stop(e);
   const p={x:e.clientX,y:e.clientY},last=gesture.points.at(-1);
   if(Math.hypot(p.x-last.x,p.y-last.y)>=2){gesture.points.push(p);draw();}
 },true);
 window.addEventListener('pointerup',e=>{
   if(!gesture||gesture.pointer!==e.pointerId)return;stop(e);
   const g=gesture;g.points.push({x:e.clientX,y:e.clientY});
   const selection=anchorsInLasso(g.anchors,g.points,g.mode,g.previous);cancel();sc.directSelection.selectAnchors(selection);
 },true);
 window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);
 const style=document.createElement('style');style.textContent=`body[data-mode="${MODE}"] #svgcanvas,body[data-mode="${MODE}"] #svgcanvas *{cursor:crosshair!important}`;document.head.append(style);
 return {activate,cancel};
}
