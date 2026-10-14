import {TEMPERATURES,temperature_color} from './patterns.js';
const safe_color=color=>/^#[0-9a-f]{6}$/i.test(color)?color:'#ffffff';
const label=k=>k?`${k}K${k===5500?': Neutral':''}`:'Custom color';
export function temperature_markup(light){
 const keys=[0,...TEMPERATURES],custom=safe_color(light.customColor||light.color),selected=Number(light.temperature)||0;
 return `<div class="relight-color-control"><span>Color</span><div class="relight-temperature-control">
  <button type="button" class="relight-temperature-trigger" role="combobox" aria-label="Color temperature" aria-haspopup="listbox" aria-expanded="false" aria-controls="relight-temperature-options" data-prevent-submission><span class="relight-temperature-swatch" style="background:${safe_color(light.color)}"></span><span>${label(selected)}</span><span class="relight-temperature-chevron" aria-hidden="true">▾</span></button>
  <div id="relight-temperature-options" class="relight-temperature-options" role="listbox" aria-label="Light color presets" hidden>${keys.map(k=>`<button type="button" role="option" aria-selected="${k===selected}" data-temperature="${k}" tabindex="-1" data-prevent-submission><span class="relight-temperature-swatch" style="background:${k?temperature_color(k):custom}"></span><span>${label(k)}</span><span class="relight-temperature-check" aria-hidden="true">${k===selected?'✓':''}</span></button>`).join('')}</div>
 </div></div><label class="relight-custom-color" ${selected?'hidden':''}>Custom color <input type="color" aria-label="Light color" data-param="color" value="${custom}"></label>`;
}
/** Scoped keyboard/selection handling; no global key bindings. */
export function mount_temperature_menu(control,onSelect,hostWindow=window){
 const trigger=control.querySelector('[role="combobox"]'),menu=control.querySelector('[role="listbox"]'),options=[...menu.querySelectorAll('[role="option"]')];
 let active=Math.max(0,options.findIndex(o=>o.getAttribute('aria-selected')==='true'));
 const focus=i=>{active=Math.max(0,Math.min(options.length-1,i));const option=options[active];option.focus({preventScroll:true});const top=option.offsetTop,bottom=top+option.offsetHeight;if(top<menu.scrollTop)menu.scrollTop=top;else if(bottom>menu.scrollTop+menu.clientHeight)menu.scrollTop=bottom-menu.clientHeight;};
 const close=(restore=false)=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();};
 const open=()=>{
  const box=trigger.getBoundingClientRect(),below=hostWindow.innerHeight-box.bottom-12,above=box.top-12,up=below<320&&above>below;
  const height=Math.max(60,Math.min(340,up?above:below)),width=Math.max(200,box.width);
  Object.assign(menu.style,{width:width+'px',maxHeight:height+'px',left:Math.max(8,Math.min(box.left,hostWindow.innerWidth-width-8))+'px',top:(up?Math.max(8,box.top-height-4):box.bottom+4)+'px'});
  menu.hidden=false;trigger.setAttribute('aria-expanded','true');focus(active);
 };
 const choose=o=>{const value=Number(o.dataset.temperature);close();onSelect(value);};
 const clickTrigger=()=>menu.hidden?open():close(true);
 const clickOption=e=>{const option=e.target.closest('[data-temperature]');if(option){e.preventDefault();e.stopPropagation();choose(option);}};
 const key=e=>{
  if(!['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape','Tab'].includes(e.key))return;
  if(menu.hidden&&e.key==='Escape')return;
  if(e.key==='Tab'){close();return;}
  e.preventDefault();e.stopImmediatePropagation();
  if(e.key==='Escape'){close(true);return;}
  if(menu.hidden){open();return;}
  if(e.key==='Enter'||e.key===' '){choose(options[active]);return;}
  focus(e.key==='Home'?0:e.key==='End'?options.length-1:active+(e.key==='ArrowDown'?1:-1));
 };
 const outside=e=>{if(!control.contains(e.target))close();};
 const scroll=e=>{if(e.target!==menu)close();};
 const resized=()=>close();
 trigger.addEventListener('click',clickTrigger);menu.addEventListener('click',clickOption);control.addEventListener('keydown',key,true);
 hostWindow.addEventListener('pointerdown',outside,true);hostWindow.addEventListener('scroll',scroll,true);hostWindow.addEventListener('resize',resized);
 return {trigger,close,destroy(){close();trigger.removeEventListener('click',clickTrigger);menu.removeEventListener('click',clickOption);control.removeEventListener('keydown',key,true);hostWindow.removeEventListener('pointerdown',outside,true);hostWindow.removeEventListener('scroll',scroll,true);hostWindow.removeEventListener('resize',resized);}};
}
