const NS = 'http://www.w3.org/2000/svg';
let editing = null;
let selectionId = 0;

export function selectionQuad(a, b, angle, ascent, descent) {
  const radians = angle * Math.PI / 180;
  const nx = -Math.sin(radians), ny = Math.cos(radians);
  return [[a.x-nx*ascent,a.y-ny*ascent], [b.x-nx*ascent,b.y-ny*ascent],
    [b.x+nx*descent,b.y+ny*descent], [a.x+nx*descent,a.y+ny*descent]];
}

export const isParagraphDrag = (width, height) => width >= 8 && height >= 8;

export function wrapText(value, width, measure) {
  const lines = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.match(/\S+\s*|\s+/g) || ['']) {
      if (line && measure(line + word) > width) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && measure(line + char) > width) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function layoutParagraph(text) {
  const width = Number(text.getAttribute('data-text-width'));
  if (!width) return;
  const value = text.getAttribute('data-text-content') || '';
  const style = getComputedStyle(text), size = parseFloat(style.fontSize) || 24;
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
  const spacing = parseFloat(style.letterSpacing) || 0;
  const lines = wrapText(value, width, s => ctx.measureText(s).width + Math.max(0,s.length-1)*spacing);
  const x = Number(text.getAttribute('x')) || 0, y = Number(text.getAttribute('y')) || 0;
  const anchor = text.getAttribute('text-anchor') || 'start';
  const height = Number(text.getAttribute('data-text-height'));
  const fragment = document.createDocumentFragment();
  let sourceIndex = 0;
  lines.forEach((line, i) => {
    if ((i + 1) * size * 1.2 > height) return;
    const span = document.createElementNS(NS, 'tspan');
    span.setAttribute('x', x + (anchor === 'middle' ? width/2 : anchor === 'end' ? width : 0));
    span.setAttribute('y', y + size + i * size * 1.2);
    if (value[sourceIndex] === '\n') sourceIndex++;
    span.setAttribute('data-text-start', sourceIndex);
    sourceIndex += line.length;
    span.textContent = line || '\u200b';
    fragment.append(span);
  });
  if (text.innerHTML !== [...fragment.childNodes].map(n => n.outerHTML).join('')) text.replaceChildren(fragment);
}

export function beginTextEdit(editor, text) {
  if (editing?.text === text) return;
  editing?.commit();
  const sc = editor.svgCanvas, tp = text.querySelector('textPath');
  const paragraph = text.hasAttribute('data-text-width');
  const target = tp || text;
  const original = paragraph ? text.getAttribute('data-text-content') || '' : target.textContent;
  // Native text editing must not rewrite a textPath into ordinary point text.
  sc.setMode('select');
  sc.clearSelection(); sc.addToSelection([text], true);
  sc.selectorManager?.requestSelector(text)?.showGrips(false);
  const input = document.createElement('textarea');
  input.setAttribute('aria-label', 'Edit text');
  input.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0';
  input.value = original;
  document.body.append(input);
  const overlay = document.createElementNS(NS, 'svg');
  overlay.setAttribute('data-text-edit-overlay','');
  overlay.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10000;overflow:visible';
  document.body.append(overlay);
  let done = false, dragStart = null;
  const chars = [];
  document.body.setAttribute('data-vector-editing-text','');
  const render = () => {
    if (done || !text.isConnected) return;
    if (paragraph) { text.setAttribute('data-text-content', input.value); layoutParagraph(text); }
    else target.textContent = input.value;
    overlay.replaceChildren(); chars.length = 0;
    const matrix = text.getScreenCTM();
    if (!matrix) return;
    const group = document.createElementNS(NS,'g');
    group.setAttribute('transform', `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
    overlay.append(group);
    if (paragraph) {
      const frame=document.createElementNS(NS,'rect');
      for(const [k,v] of Object.entries({x:text.getAttribute('x')||0,y:text.getAttribute('y')||0,width:text.getAttribute('data-text-width'),height:text.getAttribute('data-text-height'),fill:'none',stroke:'#1C79C4','stroke-width':1,'vector-effect':'non-scaling-stroke'}))frame.setAttribute(k,v);
      group.append(frame);
    }
    const sourceIndices = paragraph ? [...text.children].flatMap(span => [...span.textContent].map((_,i)=>Number(span.getAttribute('data-text-start'))+i)) : [...input.value].map((_,i)=>i);
    const start = input.selectionStart, end = input.selectionEnd;
    const count = text.getNumberOfChars();
    const selectedQuads = [];
    const font = getComputedStyle(text), fontSize = parseFloat(font.fontSize) || 24;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${font.fontStyle} ${font.fontWeight} ${fontSize}px ${font.fontFamily}`;
    const metrics = measure.measureText('Hg');
    const ascent = metrics.fontBoundingBoxAscent || fontSize * .8;
    const descent = metrics.fontBoundingBoxDescent || fontSize * .2;
    for (let i=0; i<count; i++) {
      try {
        const a = text.getStartPositionOfChar(i), b = text.getEndPositionOfChar(i);
        chars.push({index:sourceIndices[i],a:new DOMPoint(a.x,a.y).matrixTransform(matrix), b:new DOMPoint(b.x,b.y).matrixTransform(matrix)});
        if (sourceIndices[i] >= start && sourceIndices[i] < end) {
          selectedQuads.push(selectionQuad(a, b, text.getRotationOfChar(i), ascent, descent));
        }
        if (start === end && (sourceIndices[i] === start || start === input.value.length && i === count-1)) {
          const pos = start === input.value.length ? b : a;
          const line = document.createElementNS(NS,'line');
          const angle = text.getRotationOfChar(i)*Math.PI/180, size = parseFloat(getComputedStyle(text).fontSize)||24;
          for (const [k,v] of Object.entries({x1:pos.x,y1:pos.y,x2:pos.x+Math.sin(angle)*size,y2:pos.y-Math.cos(angle)*size,stroke:'#1C79C4','stroke-width':1,'vector-effect':'non-scaling-stroke'})) line.setAttribute(k,v);
          group.append(line);
        }
      } catch (_) { /* A glyph outside the path has no visible position. */ }
    }
    if (selectedQuads.length) {
      // One opaque ribbon avoids darker overlaps, and follows each glyph's
      // baseline instead of its axis-aligned bounding rectangle.
      const bridges = [];
      selectedQuads.forEach((q,i)=>{
        const previous=selectedQuads[i-1];
        if(previous && Math.hypot(q[0][0]-previous[1][0],q[0][1]-previous[1][1]) < fontSize*.75) bridges.push([previous[1],q[0],q[3],previous[2]]);
      });
      const d = [...selectedQuads,...bridges].map(q => `M${q.map(p=>p.join(',')).join('L')}Z`).join(' ');
      const ribbon = document.createElementNS(NS,'path');
      ribbon.setAttribute('d', d); ribbon.setAttribute('fill', '#000');
      group.append(ribbon);
      const clip = document.createElementNS(NS,'clipPath');
      const id = `visteras-text-highlight-${++selectionId}`;
      clip.setAttribute('id',id); clip.setAttribute('clipPathUnits','userSpaceOnUse');
      clip.append(ribbon.cloneNode(true)); group.append(clip);
      const selectedInk = text.cloneNode(true);
      selectedInk.removeAttribute('transform');
      for (const el of [selectedInk,...selectedInk.querySelectorAll('*')]) {
        el.removeAttribute('id');
        el.style.setProperty('fill','#fff','important');
        el.style.setProperty('stroke','none','important');
        el.style.setProperty('opacity','1','important');
        el.style.setProperty('fill-opacity','1','important');
      }
      for (const name of ['font-family','font-size','font-weight','font-style','letter-spacing','word-spacing']) selectedInk.style.setProperty(name,font.getPropertyValue(name));
      const inkGroup = document.createElementNS(NS,'g');
      inkGroup.setAttribute('clip-path',`url(#${id})`);
      inkGroup.append(selectedInk); group.append(inkGroup);
    }

  };
  const commit = () => {
    if (done) return;
    done = true;
    const final = input.value;
    input.remove(); overlay.remove();
    document.body.removeAttribute('data-vector-editing-text');
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('resize', render);
    window.removeEventListener('blur', commit);
    document.removeEventListener('selectionchange', render);
    window.__visterasIsTypingDirectly = false;
    editing = null;
    if (!text.isConnected) return;
    if (!final && !paragraph) {
      target.textContent = original;
      sc.clearSelection(); sc.addToSelection([text],true); sc.deleteSelectedElements();
      return;
    }
    if (final !== original) {
      const attrs = paragraph ? {'data-text-content':original} : {'#text':original};
      sc.addCommandToHistory(new sc.history.ChangeElementCommand(target, attrs, 'Edit text'));
    }
    sc.call('changed',[text]);
    sc.selectorManager?.requestSelector(text)?.showGrips(true);
  };
  const nearest = event => {
    let index=0, distance=Infinity;
    chars.forEach(({a,b,index:i}) => {
      for (const [p,n] of [[a,i],[b,i+1]]) {
        const d=Math.hypot(event.clientX-p.x,event.clientY-p.y);
        if(d<distance) {distance=d;index=n;}
      }
    });
    return index;
  };
  const down = e => {
    if (!text.contains(e.target) && e.target !== text) { commit(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    dragStart = nearest(e);
    input.focus({preventScroll:true}); input.setSelectionRange(dragStart,dragStart); render();
  };
  const move = e => {
    if(dragStart===null) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const end=nearest(e); input.setSelectionRange(Math.min(dragStart,end),Math.max(dragStart,end)); render();
  };
  const up = () => {dragStart=null;};
  const key = e => {
    if(e.key==='Escape' || (e.key==='Enter' && (!paragraph || e.metaKey || e.ctrlKey))) {
      e.preventDefault(); e.stopImmediatePropagation(); commit(); return;
    }
    // Keep canvas shortcuts away from native textarea selection/clipboard/IME.
    e.stopPropagation();
  };
  input.addEventListener('input',render); input.addEventListener('select',render); input.addEventListener('keyup',render);
  window.addEventListener('pointerdown',down,true); window.addEventListener('pointermove',move,true); window.addEventListener('pointerup',up,true);
  window.addEventListener('keydown',key,true); window.addEventListener('resize',render); window.addEventListener('blur',commit);
  document.addEventListener('selectionchange',render);
  window.__visterasIsTypingDirectly=true;
  editing={text,commit};
  input.focus({preventScroll:true}); input.select(); render();
}

export function mountTextEditing(editor) {
  const sc=editor.svgCanvas;
  let gesture;
  const css=document.createElement('style');
  css.textContent='body[data-vector-editing-text] #selectorParentGroup {visibility:hidden}';
  document.head.append(css);
  const panel=document.createElement('div');
  panel.style.cssText='padding:12px;display:none';
  panel.innerHTML='<b>Paragraph Text Box</b><label style="display:block;margin-top:8px">Width <input aria-label="Text box width" type="number" min="1" style="width:72px"></label><label style="display:block;margin-top:8px">Height <input aria-label="Text box height" type="number" min="1" style="width:72px"></label>';
  document.getElementById('properties_panel')?.append(panel);
  const fields=[...panel.querySelectorAll('input')];
  const syncPanel=()=>{
    const text=sc.getSelectedElements().filter(Boolean)[0];
    const show=text?.hasAttribute('data-text-width');
    panel.style.display=show?'block':'none';
    if(show) fields.forEach((f,i)=>{if(document.activeElement!==f)f.value=text.getAttribute(i?'data-text-height':'data-text-width');});
  };
  fields.forEach((field,i)=>field.addEventListener('change',()=>{
    const text=sc.getSelectedElements().filter(Boolean)[0];
    if(!text?.hasAttribute('data-text-width') || !(Number(field.value)>0))return;
    const attr=i?'data-text-height':'data-text-width', old=text.getAttribute(attr);
    text.setAttribute(attr,field.value);layoutParagraph(text);
    sc.addCommandToHistory(new sc.history.ChangeElementCommand(text,{[attr]:old},'Resize text box'));
    sc.call('changed',[text]);
  }));
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  const position=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(sc.getSvgContent().getScreenCTM().inverse());
  window.addEventListener('mousedown',e=>{
    const text=e.target.closest?.('text');
    if(editing?.text === text) {stop(e);return;}
    if(text && sc.getSvgContent().contains(text) && (e.detail===2 || sc.getMode()==='text')) {
      stop(e); beginTextEdit(editor,text);return;
    }
    if(sc.getMode()!=='text' || e.button!==0 || !sc.getSvgRoot().contains(e.target)) return;
    stop(e); const start=position(e);
    const frame=document.createElementNS(NS,'rect');
    for(const [k,v] of Object.entries({x:start.x,y:start.y,width:0,height:0,fill:'none',stroke:'#1C79C4','stroke-dasharray':'4 3','pointer-events':'none'})) frame.setAttribute(k,v);
    sc.getSvgContent().append(frame); gesture={start,screen:{x:e.clientX,y:e.clientY},frame};
  },true);
  window.addEventListener('mousemove',e=>{
    if(!gesture)return;stop(e);const p=position(e),a=gesture.start;
    for(const [k,v] of Object.entries({x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),width:Math.abs(a.x-p.x),height:Math.abs(a.y-p.y)}))gesture.frame.setAttribute(k,v);
  },true);
  window.addEventListener('mouseup',e=>{
    if(!gesture) {if(e.detail===2 && e.target.closest?.('text'))stop(e);return;}stop(e);const g=gesture;gesture=null;g.frame.remove();
    const p=position(e),box=isParagraphDrag(Math.abs(e.clientX-g.screen.x),Math.abs(e.clientY-g.screen.y));
    const text=document.createElementNS(NS,'text');
    const attrs={id:sc.getNextId(),x:box?Math.min(g.start.x,p.x):g.start.x,y:box?Math.min(g.start.y,p.y):g.start.y,'font-size':sc.getFontSize()||24,'font-family':sc.getFontFamily()||'Roboto',fill:sc.getColor('fill')==='none'?'#000':sc.getColor('fill')||'#000',stroke:'none','text-anchor':'start','xml:space':'preserve'};
    for(const [k,v] of Object.entries(attrs)) text.setAttribute(k,v);
    text.textContent='Lorem Ipsum';
    if(box) {text.setAttribute('data-text-width',Math.abs(p.x-g.start.x));text.setAttribute('data-text-height',Math.abs(p.y-g.start.y));text.setAttribute('data-text-content','Lorem Ipsum');}
    sc.getCurrentDrawing().getCurrentLayer().append(text);
    if(box)layoutParagraph(text);
    sc.addCommandToHistory(new sc.history.InsertElementCommand(text));sc.call('changed',[text]);beginTextEdit(editor,text);
  },true);
  window.addEventListener('dblclick',e=>{
    const text=e.target.closest?.('text');
    if(text && sc.getSvgContent().contains(text)){stop(e);beginTextEdit(editor,text);}
  },true);
  window.addEventListener('keydown',e=>{if(gesture && e.key==='Escape'){stop(e);gesture.frame.remove();gesture=null;}},true);
  window.addEventListener('blur',()=>{if(gesture){gesture.frame.remove();gesture=null;}});
  // Reflow after typography edits and history replay. Content remains SVG text.
  const originalCall=sc.call;
  sc.call=function(event,...args){const result=originalCall.call(this,event,...args);if(event==='selected'||event==='changed')syncPanel();return result;};
  const observer=new MutationObserver(()=>{
    for(const text of sc.getSvgContent().querySelectorAll('text[data-text-width]'))layoutParagraph(text);
  });
  observer.observe(sc.getSvgContent(),{subtree:true,attributes:true,childList:true});
}
