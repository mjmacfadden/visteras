import {alignToKey,distributeSpacing} from './visteras-align-key.js';
import {bindNumericField,readNumericField} from './visteras-numeric-field.js';
import {convertToPixels,convertFromPixels} from './visteras-document-presets.js';
import {documentMatrix,localMatrix,selectionBounds} from './visteras-object-transform.js';

export function mountAlignKey(editor) {
  const sc=editor.svgCanvas, relative=document.getElementById('tool_align_relative');
  let key=null, previous='selected', signature=[], outline=null, gapPx=10;
  const selected=()=>sc.getSelectedElements().filter(Boolean);
  const unit=()=>window.__visterasDocumentShell?.getBaseUnit?.()||'px';
  const row=document.createElement('div');row.className='visteras-spacing-controls';
  row.innerHTML=`<button type="button" aria-label="Vertical Distribute Space" title="Vertical Distribute Space" data-axis="y"><svg viewBox="0 0 24 24"><path d="M4 4h16v4H4zM4 16h16v4H4zM2 10h20M2 14h20M12 10v4"/></svg></button><button type="button" aria-label="Horizontal Distribute Space" title="Horizontal Distribute Space" data-axis="x"><svg viewBox="0 0 24 24"><path d="M4 4h4v16H4zM16 4h4v16h-4zM10 2v20M14 2v20M10 12h4"/></svg></button><input type="text" inputmode="decimal" aria-label="Distribute spacing" value="10"><span class="spacing-unit"></span>`;
  document.getElementById('sec_align_body').append(row);
  const input=row.querySelector('input'), unitText=row.querySelector('.spacing-unit');
  bindNumericField(input,{unit,apply:value=>{gapPx=convertToPixels(value,unit());}});
  const style=document.createElement('style');style.textContent=`.visteras-spacing-controls{display:flex;align-items:center;gap:6px;margin-top:8px}.visteras-spacing-controls button{width:28px;height:28px;border:1px solid #555;background:#333;color:#ccc;border-radius:3px;padding:3px;cursor:pointer}.visteras-spacing-controls button:hover{color:var(--visteras-accent)}.visteras-spacing-controls button:disabled{opacity:.35;cursor:default}.visteras-spacing-controls svg{width:20px;height:20px;stroke:currentColor;stroke-width:1.5;fill:none}.visteras-spacing-controls input{width:70px;min-width:0;background:#333;color:#eee;border:1px solid #555;border-radius:3px;padding:5px}.visteras-spacing-controls input:disabled{opacity:.55}.spacing-unit{font-size:11px;color:#aaa}`;document.head.append(style);
  function sync() {
    const elements=selected();
    if(key && (!elements.includes(key)||!key.isConnected)) clear();
    input.disabled=!key;unitText.textContent=key?unit():'';
    if(document.activeElement!==input){ input.value=key?String(convertFromPixels(gapPx,unit())):'Auto';input.dataset.numericCurrent=String(convertFromPixels(gapPx,unit())); }
    row.querySelectorAll('button').forEach(b=>b.disabled=elements.length<2);
    const option=relative?.shadowRoot?.querySelector('option[value="key"]');
    if(option)option.textContent='Key Object';
    outline?.remove();outline=null;
    if(key){
      const b=selectionBounds(sc,[key]),zoom=sc.getZoom();
      if(b){outline=document.createElementNS('http://www.w3.org/2000/svg','rect');
        for(const [a,v]of Object.entries({id:'visteras-key-object',x:b.x*zoom,y:b.y*zoom,width:b.width*zoom,height:b.height*zoom,fill:'none',stroke:'var(--visteras-accent)','stroke-width':3,'pointer-events':'none','vector-effect':'non-scaling-stroke'}))outline.setAttribute(a,v);
        sc.selectorManager.selectorParentGroup.append(outline);
      }
    }
  }
  function clear(){if(key && relative?.value==='key')relative.value=previous;key=null;outline?.remove();outline=null;}
  function choose(el){
    const elements=selected();
    if(sc.getMode()!=='select'||elements.length<2||!elements.includes(el))return;
    if(key===el)clear();else{if(!key)previous=relative.value==='key'?'selected':relative.value||'selected';key=el;relative.value='key';}
    sync();
  }
  function apply(deltas,label){
    const elements=selected(), batch=new sc.history.BatchCommand(label),changed=[];
    elements.forEach((el,i)=>{
      const {dx,dy}=deltas[i];if(!dx&&!dy)return;
      const old=el.getAttribute('transform'),parent=documentMatrix(sc,el.parentNode);
      const m=parent.inverse().multiply(new DOMMatrix().translate(dx,dy)).multiply(parent).multiply(localMatrix(el));
      el.setAttribute('transform',m.toString());batch.addSubCommand(new sc.history.ChangeElementCommand(el,{transform:old},label));changed.push(el);
    });
    if(changed.length){window.__visterasLiveSyncStrokeAlign?.(changed,sc);sc.addCommandToHistory(batch);sc.call('changed',changed);elements.forEach(el=>sc.selectorManager.requestSelector(el)?.resize());window.__visterasSelectionController?.refresh();}
    sync();
  }
  function align(dir){
    const elements=selected();if(!key)return false;
    if(dir.startsWith('distrib'))apply(distributeSpacing(elements.map(el=>selectionBounds(sc,[el])),dir==='distrib_horiz'?'x':'y'), 'Distribute objects');
    else apply(alignToKey(elements.map(el=>selectionBounds(sc,[el])),elements.indexOf(key),dir),'Align to Key Object');
    return true;
  }
  row.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    const elements=selected();if(elements.length<2)return;
    const value=key?readNumericField(input,unit()):null;if(key&&value===null)return;
    if(key)gapPx=convertToPixels(value,unit());
    apply(distributeSpacing(elements.map(el=>selectionBounds(sc,[el])),button.dataset.axis,key?gapPx:null,key?elements.indexOf(key):null),'Distribute spacing');
  }));
  relative.addEventListener('change',()=>{if(relative.value!=='key'){clear();sync();}else if(!key){choose(selected().at(-1));}});
  window.__visterasOnClickSelected=choose;
  window.__visterasAlignKey={align,clear:()=>{clear();sync();}};
  const call=sc.call;
  sc.call=function(event,...args){
    const result=call.call(this,event,...args);
    if(event==='selected'){
      const elements=selected();if(elements.length!==signature.length||elements.some(el=>!signature.includes(el)))clear();signature=elements;
    }
    if(['selected','changed','zoomed','transition'].includes(event))sync();
    return result;
  };
  window.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||event.target?.closest?.('input,textarea,select,[contenteditable]')||window.__visterasIsTypingDirectly)return;
    if(key){event.preventDefault();event.stopImmediatePropagation();clear();sync();}
  },true);
  window.addEventListener('visteras:unit-changed',sync);
  new MutationObserver(()=>{if(key)sync();}).observe(sc.getSvgContent(),{attributes:true,subtree:true});
  sync();
  return window.__visterasAlignKey;
}
