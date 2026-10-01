const shapes = 'path,rect,circle,ellipse,line,polygon,polyline,text,use';
export function strokeTargets(elements) {
  return [...new Set(elements.flatMap(el => el.matches(shapes) ? [el] : [...el.querySelectorAll(shapes)]))]
    .filter(el => !el.closest('defs,clipPath,mask') && !el.hasAttribute('data-visteras-top-source'));
}
export function mountScaleStrokes(editor) {
  const sc=editor.svgCanvas, menu=document.getElementById('action_scale_strokes');
  const targets=()=>strokeTargets(sc.getSelectedElements().filter(Boolean));
  const scales=el=>getComputedStyle(el).vectorEffect !== 'non-scaling-stroke';
  const sync=()=>{
    const list=targets(), count=list.filter(scales).length;
    menu.classList.toggle('disabled',!list.length);
    menu.setAttribute('aria-disabled',String(!list.length));
    menu.setAttribute('aria-checked',count && count<list.length?'mixed':String(!list.length || count===list.length));
  };
  menu.addEventListener('click',()=>{
    const list=targets(); if(!list.length)return;
    const enabled=!list.every(scales), batch=new sc.history.BatchCommand(enabled?'Enable stroke scaling':'Disable stroke scaling');
    for(const el of list) {
      const old={'vector-effect':el.getAttribute('vector-effect'),style:el.getAttribute('style')};
      const effect=enabled?'none':'non-scaling-stroke';
      el.setAttribute('vector-effect',effect);
      // Inline styles must not override the SVG presentation attribute.
      el.style.setProperty('vector-effect',effect);
      batch.addSubCommand(new sc.history.ChangeElementCommand(el,old));
    }
    sc.addCommandToHistory(batch);sc.call('changed',list);sync();
  });
  document.getElementById('menu_object').addEventListener('pointerdown',sync);
  const call=sc.call;
  sc.call=function(event,...args){const result=call.call(this,event,...args);if(event==='selected'||event==='changed')sync();return result;};
  sync();
}
