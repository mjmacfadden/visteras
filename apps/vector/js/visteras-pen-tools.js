import { readSegments, serializeSegments, anchors, contours, deleteAnchors } from './visteras-anchor-model.js';
import { normalizeEditablePath } from './visteras-path-geometry.js';
import { hitSegment, splitSegment, simplifyStraightSegments, reverseOpenContour, evaluateSegment } from './visteras-pen-geometry.js';

export function mountPenTools(editor) {
  const sc=editor.svgCanvas, ns='http://www.w3.org/2000/svg';
  document.querySelectorAll('#visteras-pen-anchors,#visteras-pen-path-hover,#visteras-pen-continuation-hover').forEach(node=>node.remove());
  const old=document.getElementById('tool_path');
  const flyout=document.createElement('se-flyingbutton');
  flyout.id='visteras_pen_subtools';flyout.title='Pen Tool';
  const definitions=[['tool_path','Pen Tool','pen_illustrator.svg','path'],['tool_add_anchor','Add Anchor Point Tool','pen_add_anchor.svg','add_anchor'],['tool_delete_anchor','Delete Anchor Point Tool','pen_delete_anchor.svg','delete_anchor']];
  for(const [id,title,src,mode] of definitions){
    const button=document.createElement('se-button');
    button.id=id;button.title=title;button.setAttribute('src',src);
    button.addEventListener('click',()=>{finishPath();sc.setMode(mode);sync();});
    flyout.append(button);
  }
  old.replaceWith(flyout);
  function sync(){
    const mode=sc.getMode(), definition=definitions.find(d=>d[3]===mode);
    if(!definition){continuation=null;extending=null;return;}
    const button=document.getElementById(definition[0]);
    editor.leftPanel.updateLeftPanel(button.id);
    flyout.activeSlot=button;
    flyout.$img?.setAttribute('src',`${flyout.imgPath}/${definition[2]}`);
    flyout.title=definition[1];
    flyout.opened=false;
  }
  document.addEventListener('modeChange',sync);
  const style=document.createElement('style');
  style.textContent=definitions.map(([, , , mode])=>`body[data-mode="${mode}"] #svgcanvas,body[data-mode="${mode}"] #svgcanvas * {cursor:url("./images/${mode==='path'?'pen':mode==='add_anchor'?'pen_add':'pen_delete'}_cursor.svg") 4 4, crosshair !important}`).join('\n');
  document.head.append(style);
  let continuation=null, extending=null;
  function finishPath(){
    continuation=null;extending=null;
    showAnchors(null);
    const path=sc.getDrawnPath?.();
    if(!path)return;
    sc.setDrawnPath(null);sc.setStarted(false);
    sc.pathActions.resetDrawingState();
    document.getElementById('path_stretch_line')?.remove();
    document.getElementById('pathpointgrip_container')?.remove();
    if(path.pathSegList.numberOfItems<2){path.remove();return;}
    path.setAttribute('opacity',sc.getStyle().opacity);
    path.setAttribute('style','pointer-events:inherit');
    sc.addCommandToHistory(new sc.history.InsertElementCommand(path));
    sc.call('changed',[path]);
    sc.setMode('path');
  }
  // Window capture runs before SVGEdit's document-level cancel/shortcut handlers.
  window.addEventListener('keydown',e=>{
    if(e.isComposing||e.composedPath().some(el=>el?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el?.nodeName)))return;
    if(sc.getMode()==='path'&&['Enter','Escape'].includes(e.key)){
      e.preventDefault();e.stopImmediatePropagation();finishPath();return;
    }
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    const id=e.key==='+'||e.key==='='?'tool_add_anchor':e.key==='-'?'tool_delete_anchor':null;
    if(id){e.preventDefault();e.stopImmediatePropagation();document.getElementById(id).click();}
  },true);
  function geometry(el){
    const p=document.createElementNS(ns,'path');
    p.setAttribute('d',sc.getPathDataForElement(el)||'');
    normalizeEditablePath(p,p=>sc.pathActions.convertPath(p));
    return simplifyStraightSegments(readSegments(p));
  }
  function candidates(){
    return [...sc.getSvgContent().querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline')].filter(el=>!el.closest('defs,clipPath,mask')&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).pointerEvents!=='none');
  }
  let consumed=false, markerLayer, markerElement=null, hoverLayer, continuationHoverLayer, activeAnchorIndex=null, hoverAnchorIndex=null, hoverAnchorElement=null;
  function showContinuationPreview(el, point, event) {
    if (!continuationHoverLayer?.isConnected) {
      continuationHoverLayer=document.createElement('div');
      continuationHoverLayer.id='visteras-pen-continuation-hover';
      Object.assign(continuationHoverLayer.style,{position:'fixed',height:'2px',background:'#3f8ff7',transformOrigin:'0 50%',pointerEvents:'none',zIndex:'99999'});
      document.body.append(continuationHoverLayer);
    }
    continuationHoverLayer.style.display='none';
    if (!el || sc.getMode()!=='path') return;
    const m=el.getScreenCTM(), x=m.a*point.x+m.c*point.y+m.e, y=m.b*point.x+m.d*point.y+m.f;
    const dx=event.clientX-x,dy=event.clientY-y,length=Math.hypot(dx,dy);
    Object.assign(continuationHoverLayer.style,{left:`${x}px`,top:`${y}px`,width:`${length}px`,transform:`rotate(${Math.atan2(dy,dx)}rad)`,display:'block'});
  }
  function showPathHover(el, event) {
    if (!hoverLayer?.isConnected) {
      hoverLayer=document.createElementNS(ns,'g');
      hoverLayer.id='visteras-pen-path-hover';
      hoverLayer.setAttribute('pointer-events','none');
      sc.selectorManager.selectorParentGroup.append(hoverLayer);
    }
    hoverLayer.replaceChildren();
    if (!el || sc.getMode()!=='add_anchor') return;
    const matrix=el.getScreenCTM();
    const hit=hitSegment(geometry(el),{x:event.clientX,y:event.clientY},p=>new DOMPoint(p.x,p.y).matrixTransform(matrix));
    if (!hit) return;
    const data=geometry(el), point=evaluateSegment(data[hit.index-1],data[hit.index],hit.t);
    const overlayMatrix=sc.selectorManager.selectorParentGroup.getScreenCTM().inverse();
    const p=new DOMPoint(point.x,point.y).matrixTransform(matrix).matrixTransform(overlayMatrix);
    const ring=document.createElementNS(ns,'path');
    ring.setAttribute('d',`M${p.x-4} ${p.y-4}L${p.x+4} ${p.y+4}M${p.x+4} ${p.y-4}L${p.x-4} ${p.y+4}`);ring.setAttribute('fill','none');ring.setAttribute('stroke','#111');ring.setAttribute('stroke-width','1.5');
    const label=document.createElementNS(ns,'text');
    label.textContent='path';label.setAttribute('x',p.x+7);label.setAttribute('y',p.y-6);label.setAttribute('fill','#ff2bb5');label.setAttribute('font-size','10');label.setAttribute('font-family','sans-serif');
    hoverLayer.append(ring,label);
  }
  function showAnchors(el) {
    if (!markerLayer?.isConnected) {
      markerLayer=document.createElementNS(ns,'g');
      markerLayer.id='visteras-pen-anchors';
      markerLayer.setAttribute('pointer-events','none');
      sc.selectorManager.selectorParentGroup.append(markerLayer);
    }
    markerLayer.replaceChildren();
    markerElement=el||null;
    if(!el)return;
    const matrix=sc.selectorManager.selectorParentGroup.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const data=geometry(el);
    for(const a of anchors(data)) {
      const p=new DOMPoint(data[a.index].x,data[a.index].y).matrixTransform(matrix);
      const square=document.createElementNS(ns,'rect');
      const hovering=sc.getMode()==='delete_anchor'&&hoverAnchorElement===el&&hoverAnchorIndex===a.index;
      for(const [k,v] of Object.entries({x:p.x-3,y:p.y-3,width:6,height:6,fill:a.index===activeAnchorIndex?'#3f8ff7':'#fff',stroke:'#3f8ff7','stroke-width':hovering?'3':'1'}))square.setAttribute(k,v);
      markerLayer.append(square);
    }
  }
  function clearEditOverlays(){
    showAnchors(null);
    sc.getPathObj?.()?.show(false);
    document.getElementById('pathpointgrip_container')?.setAttribute('display','none');
    document.querySelectorAll('#pathpointgrip_container, #path_stretch_line, .pathpointgrip').forEach(node=>{
      node.setAttribute('display','none');
      if(node.id==='path_stretch_line'||node.id==='pathpointgrip_container') node.remove();
    });
    document.querySelectorAll('[id*="pathpointgrip"], [class*="pathpointgrip"]').forEach(node=>node.remove());
    document.getElementById('visteras-direct-selection')?.replaceChildren();
  }
  document.addEventListener('selectedChanged',()=>{
    if (markerElement && !sc.getSelectedElements().includes(markerElement)) {
      activeAnchorIndex=null;
      hoverAnchorIndex=null;
      hoverAnchorElement=null;
      clearEditOverlays();
    }
  });
  const clearWhenSelectionChanges=()=>{
    // Selection transitions can briefly report the previous element. Clear
    // unconditionally so pen markers never survive onto the next object.
    activeAnchorIndex=null;
    hoverAnchorIndex=null;
    hoverAnchorElement=null;
    markerElement=null;
    clearEditOverlays();
  };
  sc.bind?.('selectedChanged',clearWhenSelectionChanges);
  sc.bind?.('elementChanged',clearWhenSelectionChanges);
  document.addEventListener('modeChange',()=>{
    activeAnchorIndex=null;
    hoverAnchorIndex=null;hoverAnchorElement=null;
    showAnchors(null);
    hoverLayer?.replaceChildren();
    continuationHoverLayer?.replaceChildren(); continuationHoverLayer?.style.setProperty('display','none');
    if(['add_anchor','delete_anchor','path'].includes(sc.getMode()))clearEditOverlays();
    if(sc.getMode()!=='path'){continuation=null;extending=null;}
  });
  sc.bind?.('modeChange',()=>{
    if (!['path','add_anchor','delete_anchor'].includes(sc.getMode())) {
      activeAnchorIndex=null;
      hoverAnchorIndex=null;
      hoverAnchorElement=null;
      continuation=null;
      extending=null;
      clearEditOverlays();
      hoverLayer?.replaceChildren();
      continuationHoverLayer?.replaceChildren(); continuationHoverLayer?.style.setProperty('display','none');
    }
  });
  const modeObserver=new MutationObserver(()=>{
    if(!['path','add_anchor','delete_anchor'].includes(sc.getMode())) clearEditOverlays();
  });
  modeObserver.observe(document.body,{attributes:true,attributeFilter:['data-mode']});

  window.addEventListener('mousemove',e=>{
    if(sc.getMode()==='path'&&!extending) {
      if (continuation) {
        const endpoint=continuation.data[continuation.end];
        showContinuationPreview(continuation.el,endpoint,e);
        return;
      }
      let found=null;
      for(const el of candidates().filter(el=>el.localName==='path').reverse()) {
        const data=geometry(el);
        for(const c of contours(data)) if(!c.closed&&c.indices.length>1) for(const index of [c.indices[0],c.indices.at(-1)]) {
          const p=new DOMPoint(data[index].x,data[index].y).matrixTransform(el.getScreenCTM());
          // Keep the reconnect target forgiving at zoom levels where the
          // endpoint marker is visually larger than the SVG hit area.
          if(Math.hypot(p.x-e.clientX,p.y-e.clientY)<24){found={el,point:data[index]};break;}
        }
        if(found)break;
      }
      showContinuationPreview(found?.el,found?.point,e);
    } else if(sc.getMode()!=='path') { continuationHoverLayer?.replaceChildren(); continuationHoverLayer?.style.setProperty('display','none'); }
  },true);
  window.addEventListener('mousemove',e=>{
    if(!['add_anchor','delete_anchor'].includes(sc.getMode()))return;
    const el=e.target.closest?.('path,rect,circle,ellipse,line,polygon,polyline');
    hoverAnchorIndex=null;hoverAnchorElement=null;
    if(el&&sc.getMode()==='delete_anchor'&&sc.getSvgContent().contains(el)) {
      const matrix=el.getScreenCTM(), data=geometry(el);
      for(const a of anchors(data)) {
        const p=new DOMPoint(data[a.index].x,data[a.index].y).matrixTransform(matrix);
        if(Math.hypot(p.x-e.clientX,p.y-e.clientY)<=8){hoverAnchorIndex=a.index;hoverAnchorElement=el;break;}
      }
    }
    showPathHover(el&&sc.getSvgContent().contains(el)?el:null,e);
    showAnchors(el&&sc.getSvgContent().contains(el)?el:null);
  },true);

  window.addEventListener('mousedown',e=>{
    if(sc.getMode()!=='path'||e.button!==0||!sc.getSvgRoot().contains(e.target)||sc.getDrawnPath())return;
    if(continuation){
      e.preventDefault();e.stopImmediatePropagation();consumed=true;
      const {el,data,start,end}=continuation;
      const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(el.getScreenCTM().inverse());
      const first=data[start],screen=new DOMPoint(first.x,first.y).matrixTransform(el.getScreenCTM());
      const close=Math.hypot(screen.x-e.clientX,screen.y-e.clientY)<7;
      const prev=data[end],target=close?first:p;
      const segment=prev.type===6?{type:6,x1:2*prev.x-prev.x2,y1:2*prev.y-prev.y2,x2:target.x,y2:target.y,x:target.x,y:target.y}:{type:4,x:target.x,y:target.y};
      const next=[...data.slice(0,end+1),segment,...(close?[{type:1}]:[]),...data.slice(end+1)];
      extending={el,before:el.getAttribute('d'),next,index:end+1,point:target,close};
      el.setAttribute('d',serializeSegments(next));
      showContinuationPreview(el,prev,e);
      showAnchors(el);return;
    }
    let hit;
    for(const el of candidates().filter(el=>el.localName==='path').reverse()){
      const data=geometry(el);
      for(const c of contours(data)){
        if(c.closed||c.indices.length<2)continue;
        for(const index of [c.indices[0],c.indices.at(-1)]){
          const p=new DOMPoint(data[index].x,data[index].y).matrixTransform(el.getScreenCTM());
          const distance=Math.hypot(p.x-e.clientX,p.y-e.clientY);
          if(distance<7&&(!hit||distance<hit.distance))hit={el,data,c,index,distance};
        }
      }
    }
    if(!hit)return;
    e.preventDefault();e.stopImmediatePropagation();consumed=true;
    const {el,data,c,index}=hit,start=c.indices[0],end=c.indices.at(-1);
    const oriented=index===start?[...data.slice(0,start),...reverseOpenContour(data.slice(start,end+1)),...data.slice(end+1)]:data;
    continuation={el,data:oriented,start,end};
    clearEditOverlays();showAnchors(el);
  },true);
  window.addEventListener('mousemove',e=>{
    if(!extending)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(extending.close)return;
    const {el,next,index,point}=extending,p=new DOMPoint(e.clientX,e.clientY).matrixTransform(el.getScreenCTM().inverse());
    showContinuationPreview(el,next[index-1],e);
    if(Math.hypot(p.x-point.x,p.y-point.y)<2)return;
    const prev=next[index-1],s=next[index];
    next[index]={type:6,x1:s.x1??prev.x,y1:s.y1??prev.y,x2:2*point.x-p.x,y2:2*point.y-p.y,x:point.x,y:point.y};
    el.setAttribute('d',serializeSegments(next));
  },true);
  window.addEventListener('mouseup',e=>{
    if(!extending)return;
    const {el,before,next,index,close}=extending;
    sc.addCommandToHistory(new sc.history.ChangeElementCommand(el,{d:before},'Continue path'));
    sc.call('changed',[el]);
    if(close)continuation=null;else continuation={...continuation,data:next,end:index};
    extending=null;showAnchors(el);
    continuationHoverLayer?.replaceChildren(); continuationHoverLayer?.style.setProperty('display','none');
  },true);
  window.addEventListener('mousedown',e=>{
    const mode=sc.getMode();
    if(!['add_anchor','delete_anchor'].includes(mode)||e.button!==0||!sc.getSvgRoot().contains(e.target))return;
    e.preventDefault();e.stopImmediatePropagation();consumed=true;
    let best;
    for(const el of candidates().reverse()){
      const matrix=el.getScreenCTM();if(!matrix)continue;
      const transform=p=>new DOMPoint(p.x,p.y).matrixTransform(matrix),segments=geometry(el);
      if(mode==='add_anchor'){
        const hit=hitSegment(segments,{x:e.clientX,y:e.clientY},transform);
        if(hit&&(!best||hit.distance<best.distance))best={el,segments,...hit};
      }else{
        for(const a of anchors(segments)){
          const p=transform(segments[a.index]),distance=(p.x-e.clientX)**2+(p.y-e.clientY)**2;
          if(distance<=64&&(!best||distance<best.distance))best={el,segments,index:a.index,distance};
        }
      }
    }
    if(!best)return;
    const next=mode==='add_anchor'?splitSegment(best.segments,best.index,best.t):deleteAnchors(best.segments,new Set([best.index]));
    // Do not destroy an entire contour by removing its final usable anchor.
    if(!next.length)return;
    const {BatchCommand,ChangeElementCommand,RemoveElementCommand,InsertElementCommand}=sc.history;
    const command=new BatchCommand(mode==='add_anchor'?'Add anchor point':'Delete anchor point');
    let el=best.el;
    if(el.localName!=='path'){
      const path=document.createElementNS(ns,'path');
      const geometryAttrs=new Set(['x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points']);
      for(const a of el.attributes)if(!geometryAttrs.has(a.name))path.setAttributeNS(a.namespaceURI,a.name,a.value);
      command.addSubCommand(new RemoveElementCommand(el,el.nextSibling,el.parentNode));
      el.replaceWith(path);el=path;
      el.setAttribute('d',serializeSegments(next));command.addSubCommand(new InsertElementCommand(el));
    }else{
      const d=el.getAttribute('d');el.setAttribute('d',serializeSegments(next));command.addSubCommand(new ChangeElementCommand(el,{d}));
    }
    activeAnchorIndex=mode==='add_anchor'?best.index:null;
    sc.addCommandToHistory(command);sc.clearSelection();sc.call('changed',[el]);
    // Keep Add/Delete active; the Visteras overlay displays the edited
    // object's hollow anchors without switching into Direct Selection.
    activeAnchorIndex=mode==='add_anchor'?best.index:null;
    sync();showAnchors(el);
  },true);
  window.addEventListener('mouseup',e=>{if(consumed){e.preventDefault();e.stopImmediatePropagation();consumed=false;}},true);
}
