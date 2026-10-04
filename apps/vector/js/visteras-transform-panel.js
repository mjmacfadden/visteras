import {convertToPixels,convertFromPixels} from './visteras-document-presets.js';
export function referencePosition(bounds, reference) {
  return {x:bounds.x+bounds.width*reference.x,y:bounds.y+bounds.height*reference.y};
}
export function dimensionScale(bounds, field, value, locked) {
  let sx=field==='w'?value/bounds.width:1, sy=field==='h'?value/bounds.height:1;
  if(locked) field==='w'?sy=sx:sx=sy;
  return {sx,sy};
}
export function mountTransformPanel(editor) {
  const sc=editor.svgCanvas, body=document.getElementById('sec_transform_body');
  let reference={x:0,y:0}, locked=false, pending;
  try {locked=localStorage.getItem('visteras-lock-proportions')==='1';}catch{}
  const panel=document.createElement('div');panel.className='visteras-transform-fields';
  const grid=document.createElement('div');grid.className='transform-reference';grid.setAttribute('role','group');grid.setAttribute('aria-label','Transform reference point');
  const names=['Top left','Top center','Top right','Middle left','Center','Middle right','Bottom left','Bottom center','Bottom right'];
  names.forEach((name,i)=>{
    const button=document.createElement('button');button.type='button';button.title=name+' reference point';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(i===0));
    button.addEventListener('click',()=>{reference={x:(i%3)/2,y:Math.floor(i/3)/2};[...grid.children].forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));sync();});grid.append(button);
  });
  panel.append(grid);
  const fields={};
  for(const key of ['x','w','y','h']) {
    const label=document.createElement('label');label.className='transform-'+key;label.textContent=key.toUpperCase()+':';
    const input=document.createElement('input');input.type='number';input.step='any';input.setAttribute('aria-label',({x:'X position',y:'Y position',w:'Width',h:'Height'})[key]);if(key==='w'||key==='h')input.min='0.001';
    label.append(input);panel.append(label);fields[key]=input;
    input.addEventListener('change',()=>change(key,Number(input.value)));
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}});
  }
  const lock=document.createElement('button');lock.type='button';lock.className='transform-lock';lock.title='Maintain width and height proportions';lock.setAttribute('aria-label',lock.title);
  const lockIcon=()=>{lock.setAttribute('aria-pressed',String(locked));lock.innerHTML='<svg width="18" height="24" viewBox="0 0 18 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 10V6a3 3 0 0 1 6 0v4M6 14v4a3 3 0 0 0 6 0v-4"/>'+(locked?'<path d="M9 8v8"/>':'<path d="M3 5l12 14"/>')+'</svg>'; };lockIcon();
  lock.addEventListener('click',()=>{locked=!locked;lockIcon();try{localStorage.setItem('visteras-lock-proportions',locked?'1':'0');}catch{}});panel.append(lock);body.prepend(panel);
  const style=document.createElement('style');style.textContent=`
    #sec_transform_body>.prop_group {display:none!important}
    .visteras-transform-fields {display:grid;grid-template-columns:26px minmax(0,1fr) minmax(0,1fr) 20px;gap:6px 5px;align-items:center;margin-bottom:6px}
    .transform-reference {grid-row:1/3;display:grid;grid-template-columns:repeat(3,7px);gap:2px}
    .transform-reference button {width:7px;height:7px;padding:0;border:1px solid #aaa;background:transparent;cursor:pointer}
    .transform-reference button[aria-pressed=true] {background:#fa7c1b;border-color:#fa7c1b}
    .visteras-transform-fields label {display:flex;align-items:center;gap:4px;color:#bbb;font-size:12px;min-width:0}
    .visteras-transform-fields input {width:100%;min-width:0;height:26px;box-sizing:border-box;background:#333;color:#eee;border:1px solid #555;border-radius:3px;padding:3px;font:12px Roboto,sans-serif;appearance:textfield}
    .visteras-transform-fields input::-webkit-inner-spin-button {appearance:none}
    .transform-x {grid-column:2;grid-row:1}.transform-w {grid-column:3;grid-row:1}.transform-y {grid-column:2;grid-row:2}.transform-h {grid-column:3;grid-row:2}
    .transform-lock {grid-column:4;grid-row:1/3;border:0;background:transparent;color:#aaa;padding:0;cursor:pointer;font-size:17px}
    .transform-lock[aria-pressed=true] {color:#fa7c1b}
    #prop_row_rotate_flip {display:grid!important;grid-template-columns:26px minmax(0,1fr) minmax(0,1fr) 20px;gap:5px;align-items:center}
    #slot_angle {grid-column:2;min-width:0}#slot_flip {grid-column:3;display:flex;justify-content:center;gap:8px}
  `;document.head.append(style);
  const selected=()=>sc.getSelectedElements().filter(el=>el?.isConnected);
  const matrix=m=>new DOMMatrix([m.a,m.b,m.c,m.d,m.e,m.f]);
  const documentMatrix=el=>matrix(sc.getSvgContent().getScreenCTM()).inverse().multiply(matrix(el.getScreenCTM()));
  const bounds=elements=>{
  // Area text reports its frame (data-text-width/height), not its glyphs — Illustrator area type.
  const frameBBox=el=>{const w=Number(el.getAttribute?.('data-text-width'));return el.tagName==='text'&&w>0?{x:Number(el.getAttribute('x'))||0,y:Number(el.getAttribute('y'))||0,width:w,height:Number(el.getAttribute('data-text-height'))||0}:el.getBBox();};
    const points=elements.flatMap(el=>{const b=frameBBox(el),m=documentMatrix(el);return [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));});
    const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
  };
  function sync(){
    pending=null;const elements=selected(),boards=window.__visterasArtboards,board=boards?.propertyMode()?boards.active():null;if(!elements.length&&!board)return;
    const b=board||bounds(elements),p=referencePosition(b,reference),values={x:p.x,y:p.y,w:b.width,h:b.height};
    for(const [key,input]of Object.entries(fields)){input.disabled=(key==='w'&&!b.width)||(key==='h'&&!b.height);if(document.activeElement!==input)input.value=String(Number((board?convertFromPixels(values[key],window.__visterasDocumentShell.getBaseUnit()):values[key]).toFixed(3)));}
  }
  function change(key,value){
    const elements=selected(),boards=window.__visterasArtboards,board=boards?.propertyMode()?boards.active():null;if((!elements.length&&!board)||!Number.isFinite(value)){sync();return;}
    if(board)value=convertToPixels(value,window.__visterasDocumentShell.getBaseUnit());
    const b=board||bounds(elements),p=referencePosition(b,reference);let transform=new DOMMatrix();
    if(key==='x'||key==='y')transform=transform.translate(key==='x'?value-p.x:0,key==='y'?value-p.y:0);
    else {if(value<=0||!b.width||!b.height){sync();return;}const {sx,sy}=dimensionScale(b,key,value,locked);transform=transform.translate(p.x,p.y).scale(sx,sy).translate(-p.x,-p.y);}
    if(board){boards.transformBounds(transform,key==='x'||key==='y');sync();return;}
    const batch=new sc.history.BatchCommand('Transform selection');
    for(const el of elements){const old=el.getAttribute('transform'),parent=documentMatrix(el.parentNode);let local=new DOMMatrix();for(let i=0;i<el.transform.baseVal.numberOfItems;i++)local=local.multiply(matrix(el.transform.baseVal.getItem(i).matrix));
      const result=parent.inverse().multiply(transform).multiply(parent).multiply(local);el.setAttribute('transform',result.toString());batch.addSubCommand(new sc.history.ChangeElementCommand(el,{transform:old}));}
    window.__visterasLiveSyncStrokeAlign?.(elements,sc);
    sc.addCommandToHistory(batch);sc.call('changed',elements);sync();
  }
  window.addEventListener('visteras:artboard-properties',sync);
  const call=sc.call;sc.call=function(event,...args){const result=call.call(this,event,...args);if(event==='selected'||event==='changed'||event==='sourcechanged')sync();return result;};
  new MutationObserver(records=>{if(records.some(r=>sc.getSvgContent().contains(r.target))&&!pending)pending=requestAnimationFrame(sync);}).observe(sc.getSvgRoot(),{subtree:true,attributes:true,childList:true});sync();
}
