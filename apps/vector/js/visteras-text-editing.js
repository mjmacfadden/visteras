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

// Paragraph / character attributes (Illustrator Paragraph + Character panels).
// Data attributes survive the SVG-Edit sanitizer; tspans are regenerated from them.
export const PARA_ATTRS = {
  leading: 'data-visteras-leading', // px; absent = Auto (120% of size)
  align: 'data-visteras-align', // left | center | right | justify | justify-center | justify-right | justify-all
  spaceBefore: 'data-visteras-space-before', // px, not applied to the first paragraph
  spaceAfter: 'data-visteras-space-after', // px, not applied after the last paragraph
  indentLeft: 'data-visteras-indent-left', // px
  indentRight: 'data-visteras-indent-right', // px
  indentFirst: 'data-visteras-indent-first', // px first-line indent (Illustrator)
};
export const AUTO_LEADING = 1.2;
const ANCHOR_ALIGN = { start: 'left', middle: 'center', end: 'right' };
/** Justify variants → how the paragraph's last line sits (Illustrator Paragraph panel). */
export const JUSTIFY_LAST = { justify: 'left', 'justify-center': 'center', 'justify-right': 'right', 'justify-all': 'justify' };
export const PARAGRAPH_ALIGNS = ['left', 'center', 'right', ...Object.keys(JUSTIFY_LAST)];
const H_ANCHOR = { left: 'start', center: 'middle', right: 'end' };

export const LOREM_IPSUM = 'Lorem Ipsum';
export const LOREM_PARAGRAPH = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.';

/**
 * Returns as much Lorem Ipsum text as will fit in the given area text dimensions
 * without exceeding the box height (no overset).
 */
export function getLoremIpsumForBox(opts, measure) {
  const { width, height, size = 24, leading = size * AUTO_LEADING } = opts;
  const words = LOREM_PARAGRAPH.split(/\s+/);
  if (!words.length || width < 10 || height < 10) return LOREM_IPSUM;

  let m = measure;
  if (!m) {
    let font = `${size}px sans-serif`;
    if (opts.fontFamily) {
      font = `${opts.fontStyle || ''} ${opts.fontWeight || ''} ${size}px "${opts.fontFamily}"`.trim();
    }
    let ctx = null;
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
        if (ctx) ctx.font = font;
      } catch (_) {}
    }
    const spacing = Number(opts.letterSpacing) || 0;
    m = s => (ctx ? ctx.measureText(s).width : s.length * (size * 0.6)) + Math.max(0, s.length - 1) * spacing;
  }

  const getWords = (count) => {
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push(words[i % words.length]);
    }
    return list.join(' ');
  };

  const maxWords = Math.min(1000, Math.max(10, Math.ceil((width * height) / (size * size * 0.25))));
  let low = 1, high = maxWords, best = 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const testText = getWords(mid);
    const layout = computeParagraphLayout({
      value: testText,
      width,
      height,
      size,
      leading,
      spaceBefore: opts.spaceBefore || 0,
      spaceAfter: opts.spaceAfter || 0,
    }, m);

    if (!layout.overset && layout.length > 0) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return getWords(best) || LOREM_IPSUM;
}

/**
 * Pure paragraph layout. Returns one entry per visible line:
 * { text, start, x, y, wordSpacing } (wordSpacing only for justified lines).
 * Justify = Illustrator "Justify with last line aligned left": every wrapped line
 * except a paragraph's last gets extra word-spacing to fill the box width.
 * justify-center / justify-right place that last line centred / right;
 * justify-all justifies it too. Justify variants carry a per-line anchor.
 */
export function computeParagraphLayout(opts, measure) {
  const { value = '', width, height = Infinity, size = 24, x = 0, y = 0 } = opts;
  const leading = Number(opts.leading) > 0 ? Number(opts.leading) : size * AUTO_LEADING;
  const align = PARAGRAPH_ALIGNS.includes(opts.align) ? opts.align : 'left';
  const before = Math.max(0, Number(opts.spaceBefore) || 0), after = Math.max(0, Number(opts.spaceAfter) || 0);
  const indentLeft = Math.max(0, Number(opts.indentLeft) || 0);
  const indentRight = Math.max(0, Number(opts.indentRight) || 0);
  const indentFirst = Number(opts.indentFirst) || 0;
  const contentWidth = Math.max(8, width - indentLeft - indentRight);
  const out = [];
  let baseline = size, sourceIndex = 0, first = true, full = false;
  value.split('\n').forEach((paragraph, pi) => {
    if (full) return;
    if (pi > 0) sourceIndex++; // the newline
    // First line wraps into a narrower (or wider for hanging) band.
    const firstExtra = Math.max(0, indentFirst);
    const hanging = Math.max(0, -indentFirst);
    const firstBand = Math.max(8, contentWidth - firstExtra + hanging);
    const bodyBand = Math.max(8, contentWidth);
    let lines = wrapText(paragraph, firstBand, measure);
    if (!lines.length) lines = [''];
    if (lines.length > 1 || (lines[0] && lines[0].length < paragraph.length)) {
      const used = lines[0].length;
      const rest = paragraph.slice(used);
      lines = [lines[0]];
      if (rest) lines.push(...wrapText(rest, bodyBand, measure));
    }
    lines.forEach((line, li) => {
      if (full) return;
      if (!first) baseline += leading + (li === 0 ? after + before : 0);
      first = false;
      if (baseline + size * (AUTO_LEADING - 1) > height + 1e-6) { full = true; return; }
      const band = li === 0 ? firstBand : bodyBand;
      const inset = indentLeft + (li === 0 ? firstExtra : hanging);
      const originX = x + inset;
      const isLast = li === lines.length - 1;
      const justified = align in JUSTIFY_LAST && (!isLast || align === 'justify-all');
      const h = justified ? 'left' : (JUSTIFY_LAST[align] || align);
      const lineX = originX + (h === 'center' ? band / 2 : h === 'right' ? band : 0);
      const entry = { text: line, start: sourceIndex, x: lineX, y: y + baseline, wordSpacing: null };
      if (align in JUSTIFY_LAST) entry.anchor = H_ANCHOR[h];
      if (justified) {
        const trimmed = line.replace(/\s+$/, '');
        const gaps = (trimmed.match(/ /g) || []).length;
        if (gaps) {
          const extra = (band - measure(trimmed)) / gaps;
          if (extra > 0) entry.wordSpacing = Math.round(extra * 1000) / 1000;
        }
      }
      out.push(entry);
      sourceIndex += line.length;
    });
  });
  // Overset (Illustrator's red + out-port): some text did not fit in the frame.
  out.overset = full;
  return out;
}

/** Paragraph settings stored on a text element (alignment falls back to text-anchor). */
export function readParagraphAttrs(text) {
  const num = (k) => { const v = Number(text.getAttribute(PARA_ATTRS[k])); return Number.isFinite(v) && text.getAttribute(PARA_ATTRS[k]) !== null && text.getAttribute(PARA_ATTRS[k]) !== '' ? v : null; };
  const stored = text.getAttribute(PARA_ATTRS.align);
  const align = PARAGRAPH_ALIGNS.includes(stored) ? stored : ANCHOR_ALIGN[text.getAttribute('text-anchor') || 'start'] || 'left';
  return {
    leading: num('leading'),
    align,
    spaceBefore: num('spaceBefore') || 0,
    spaceAfter: num('spaceAfter') || 0,
    indentLeft: num('indentLeft') || 0,
    indentRight: num('indentRight') || 0,
    indentFirst: num('indentFirst') || 0,
  };
}

/**
 * XML parsers normalise raw newlines inside attribute values to spaces, so area
 * text paragraphs (data-text-content) must be written as &#10; to survive a
 * save → reopen round trip.
 */
export function encodeTextContentNewlines(svg) {
  return String(svg).replace(/(\sdata-text-content=")([^"]*)"/g, (_, head, v) => `${head}${v.replace(/\r\n|\r|\n/g, '&#10;').replace(/\t/g, '&#9;')}"`);
}

// Area text whose content overflows its frame (layout state only — never written to the document).
const oversetTexts = new WeakSet();
export const isOverset = (text) => oversetTexts.has(text);

/** Corner of the frame where Illustrator draws the out-port, in the text's user space. */
export function oversetPort(text) {
  const x = Number(text.getAttribute('x')) || 0, y = Number(text.getAttribute('y')) || 0;
  return { x: x + (Number(text.getAttribute('data-text-width')) || 0), y: y + (Number(text.getAttribute('data-text-height')) || 0) };
}

/** Draws the red + square (8px on screen) centred on the frame's bottom-right corner. */
export function drawOversetMarker(parent, point) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('data-text-overset', '');
  g.setAttribute('pointer-events', 'none');
  const r = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: point.x - 4.5, y: point.y - 4.5, width: 9, height: 9, fill: '#fff', stroke: '#e5191a', 'stroke-width': 1 })) r.setAttribute(k, v);
  const plus = document.createElementNS(NS, 'path');
  plus.setAttribute('d', `M${point.x - 2.5},${point.y}H${point.x + 2.5}M${point.x},${point.y - 2.5}V${point.y + 2.5}`);
  plus.setAttribute('stroke', '#e5191a'); plus.setAttribute('stroke-width', '1.4');
  g.append(r, plus); parent.append(g);
  return g;
}

export function layoutParagraph(text) {
  const width = Number(text.getAttribute('data-text-width'));
  if (!width) return;
  // Frame size is fixed (Illustrator area type). Never grow/shrink data-text-* from content.
  const frameW = text.getAttribute('data-text-width');
  const frameH = text.getAttribute('data-text-height');
  const value = text.getAttribute('data-text-content') || '';
  const style = getComputedStyle(text), size = parseFloat(style.fontSize) || 24;
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
  const spacing = parseFloat(style.letterSpacing) || 0;
  const measure = s => ctx.measureText(s).width + Math.max(0,s.length-1)*spacing;
  const para = readParagraphAttrs(text);
  const lines = computeParagraphLayout({
    value, width, height: Number(text.getAttribute('data-text-height')), size,
    x: Number(text.getAttribute('x')) || 0, y: Number(text.getAttribute('y')) || 0, ...para,
  }, measure);
  if (lines.overset) oversetTexts.add(text); else oversetTexts.delete(text);
  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const span = document.createElementNS(NS, 'tspan');
    span.setAttribute('x', line.x);
    span.setAttribute('y', line.y);
    span.setAttribute('data-text-start', line.start);
    if (line.wordSpacing != null) span.setAttribute('word-spacing', line.wordSpacing);
    if (line.anchor) span.setAttribute('text-anchor', line.anchor);
    span.textContent = line.text || '\u200b';
    fragment.append(span);
  }
  if (text.innerHTML !== [...fragment.childNodes].map(n => n.outerHTML).join('')) text.replaceChildren(fragment);
  // Re-assert fixed frame (guards against any SVG-Edit / observer side effect).
  if (frameW != null && text.getAttribute('data-text-width') !== frameW) text.setAttribute('data-text-width', frameW);
  if (frameH != null && text.getAttribute('data-text-height') !== frameH) text.setAttribute('data-text-height', frameH);
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
      if (isOverset(text)) {
        const p = new DOMPoint(oversetPort(text).x, oversetPort(text).y).matrixTransform(matrix);
        drawOversetMarker(overlay, p);
      }
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
    const width=Math.abs(p.x-g.start.x), height=Math.abs(p.y-g.start.y);
    const text=document.createElementNS(NS,'text');
    const textFill = sc.getCurText?.('fill') || sc.curText?.fill || (sc.getColor?.('fill') === 'none' ? '#000000' : sc.getColor?.('fill')) || '#000000';
    const attrs={id:sc.getNextId(),x:box?Math.min(g.start.x,p.x):g.start.x,y:box?Math.min(g.start.y,p.y):g.start.y,'font-size':sc.getFontSize()||24,'font-family':sc.getFontFamily()||'Roboto',fill:textFill,stroke:'none','text-anchor':'start','xml:space':'preserve'};
    for(const [k,v] of Object.entries(attrs)) text.setAttribute(k,v);
    if(box) {
      text.setAttribute('data-text-width', width);
      text.setAttribute('data-text-height', height);
      sc.getCurrentDrawing().getCurrentLayer().append(text);
      const style = typeof getComputedStyle !== 'undefined' ? getComputedStyle(text) : (text.style || {});
      const size = parseFloat(style.fontSize) || (sc.getFontSize() || 24);
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      if (ctx) ctx.font = `${style.fontStyle || ''} ${style.fontWeight || ''} ${size}px ${style.fontFamily || (sc.getFontFamily() || 'Roboto')}`.trim();
      const spacing = parseFloat(style.letterSpacing) || 0;
      const measure = s => (ctx ? ctx.measureText(s).width : s.length * (size * 0.6)) + Math.max(0, s.length - 1) * spacing;
      const content = getLoremIpsumForBox({ width, height, size, leading: size * AUTO_LEADING }, measure);
      text.setAttribute('data-text-content', content);
      layoutParagraph(text);
    } else {
      text.textContent = 'Lorem Ipsum';
      sc.getCurrentDrawing().getCurrentLayer().append(text);
    }
    sc.addCommandToHistory(new sc.history.InsertElementCommand(text));sc.call('changed',[text]);beginTextEdit(editor,text);
  },true);
  window.addEventListener('dblclick',e=>{
    const text=e.target.closest?.('text');
    if(text && sc.getSvgContent().contains(text)){stop(e);beginTextEdit(editor,text);}
  },true);
  window.addEventListener('keydown',e=>{if(gesture && e.key==='Escape'){stop(e);gesture.frame.remove();gesture=null;}},true);
  window.addEventListener('blur',()=>{if(gesture){gesture.frame.remove();gesture=null;}});
  if(typeof sc.svgCanvasToString==='function'&&!sc.svgCanvasToString.__visterasNewlines){
    const toString=sc.svgCanvasToString;
    sc.svgCanvasToString=function(...args){return encodeTextContentNewlines(toString.apply(this,args));};
    sc.svgCanvasToString.__visterasNewlines=true;
  }
  // Overset out-port for selected area text, drawn in the selector layer (screen-sized).
  const renderOverset=()=>{
    const parent=sc.selectorManager?.selectorParentGroup;if(!parent)return;
    parent.querySelector(':scope > [data-text-overset-layer]')?.remove();
    const texts=(sc.getSelectedElements?.()||[]).filter(t=>t?.tagName==='text'&&t.hasAttribute('data-text-width')&&isOverset(t));
    if(!texts.length)return;
    const layer=document.createElementNS(NS,'g');layer.setAttribute('data-text-overset-layer','');parent.append(layer);
    const rootInv=parent.getScreenCTM()?.inverse();if(!rootInv)return;
    for(const t of texts){const m=t.getScreenCTM();if(!m)continue;const port=oversetPort(t);drawOversetMarker(layer,new DOMPoint(port.x,port.y).matrixTransform(m).matrixTransform(rootInv));}
  };
  let oversetQueued=false;
  const queueOverset=()=>{if(oversetQueued)return;oversetQueued=true;requestAnimationFrame(()=>{oversetQueued=false;renderOverset();});};
  const call2=sc.call;
  sc.call=function(event,...args){const result=call2.call(this,event,...args);if(event==='selected'||event==='changed'||event==='zoomed')queueOverset();return result;};
  document.getElementById('workarea')?.addEventListener('scroll',queueOverset,{passive:true});
  const relayout=()=>{for(const text of sc.getSvgContent().querySelectorAll('text[data-text-width]'))layoutParagraph(text);queueOverset();};
  window.__visterasLayoutParagraph = layoutParagraph;
  window.__visterasTextEditing = { layoutParagraph, computeParagraphLayout, isOverset, oversetPort };
  const observer=new MutationObserver(relayout);
  // Opening a file (setSvgString) replaces #svgcontent: re-attach and reflow.
  let bound=null;
  const bind=()=>{const c=sc.getSvgContent();if(!c||c===bound)return;bound=c;observer.disconnect();observer.observe(c,{subtree:true,attributes:true,childList:true});relayout();};
  bind();
  const root=sc.getSvgRoot?.();
  if(root)new MutationObserver(bind).observe(root,{childList:true});
}
