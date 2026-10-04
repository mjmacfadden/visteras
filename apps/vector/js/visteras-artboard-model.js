/** Named bounds in document coordinates. Background is a Visteras extension;
 * artwork and layer ownership are deliberately absent from this model. */
export const artboardId = () => `artboard_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
export function nextArtboardName(boards) {
  const names = new Set(boards.map(b => b.name));
  let n = 1; while (names.has(`Artboard ${n}`)) n++;
  return `Artboard ${n}`;
}
export function normalizeBackgroundColor(color) {
  if (!color || color === 'transparent' || color === 'none') return 'none';
  if (typeof color === 'string') {
    const s = color.trim().toLowerCase();
    if (/^#[\da-f]{3,8}$/i.test(s)) return s;
    if (/^[a-z]+$/i.test(s)) return s;
    if (/^(rgb|hsl)a?\(.+\)$/i.test(s)) return s;
  }
  return '#ffffff';
}
export function normalizeArtboards(raw, width = 800, height = 600, background = '#ffffff') {
  const ids = new Set(), names=[];
  const boards = (Array.isArray(raw) ? raw : []).filter(b => b && [b.x,b.y,b.width,b.height].every(Number.isFinite) && b.width > 0 && b.height > 0).map(b => {
    const id = typeof b.id === 'string' && b.id && !ids.has(b.id) ? b.id : artboardId(); ids.add(id);
    const name=String(b.name||nextArtboardName(names));names.push({name});
    return { id, name, x:b.x, y:b.y, width:b.width, height:b.height,
      backgroundColor: normalizeBackgroundColor(b.backgroundColor) };
  });
  return boards.length ? boards : [{id:artboardId(),name:'Artboard 1',x:0,y:0,width:Math.max(1,Number(width)||800),height:Math.max(1,Number(height)||600),backgroundColor:normalizeBackgroundColor(background)}];
}
export function createMultipleArtboards(count = 1, width = 800, height = 600, spacing = 40, background = '#ffffff') {
  const n = Math.max(1, Math.min(100, Math.round(Number(count) || 1)));
  if (n === 1) return normalizeArtboards(null, width, height, background);
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n));
  const boards = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (width + spacing);
    const y = row * (height + spacing);
    boards.push({
      id: artboardId(),
      name: `Artboard ${i + 1}`,
      x,
      y,
      width: Math.max(1, Number(width) || 800),
      height: Math.max(1, Number(height) || 600),
      backgroundColor: normalizeBackgroundColor(background),
    });
  }
  return boards;
}
export function artboardState(doc) {
  return { artboards:doc.artboards.map(b=>({...b})), activeArtboardId:doc.activeArtboardId };
}
export function artboardUnion(boards) {
  if (!boards.length) return null;
  const x=Math.min(...boards.map(b=>b.x)),y=Math.min(...boards.map(b=>b.y));
  return {x,y,width:Math.max(...boards.map(b=>b.x+b.width))-x,height:Math.max(...boards.map(b=>b.y+b.height))-y};
}
export function intersectionArea(a,b) { return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)); }
/** Largest overlap wins; ties go to the first artboard in export order. Each
 * top-level artwork object (including groups) is associated at most once. */
export function associatedArtboard(bounds, boards) {
  // Give zero-width/height lines a tiny footprint for stable spatial ownership.
  bounds={...bounds,width:Math.max(bounds.width,1e-6),height:Math.max(bounds.height,1e-6)};
  let winner=null,area=0;
  for(const b of boards){const a=intersectionArea(bounds,b);if(a>area){area=a;winner=b.id;}}
  return winner;
}
export function nearbyArtboard(source, boards) {
  const next={...source,id:artboardId(),name:nextArtboardName(boards),x:source.x+source.width+40};
  while(boards.some(b=>intersectionArea(next,b)>0)) next.x=Math.max(...boards.filter(b=>intersectionArea(next,b)>0).map(b=>b.x+b.width))+40;
  return next;
}
export function artboardsForExport(boards, mode, {activeId, selectedIds=[], range=''}={}) {
  if(mode==='all')return boards;
  if(mode==='selected')return boards.filter(b=>selectedIds.includes(b.id));
  if(mode!=='range')return boards.filter(b=>b.id===activeId);
  const indices=new Set();
  for(const token of range.split(',')) {
    const m=/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(token);
    if(!m)throw new Error('Use artboard numbers such as 1-3, 6.');
    const a=Number(m[1]),b=Number(m[2]||m[1]);
    if(a<1||b<a||b>boards.length)throw new Error('Artboard range is outside this document.');
    for(let i=a;i<=b;i++)indices.add(i-1);
  }
  return boards.filter((_,i)=>indices.has(i));
}
/** Command implements SVG-Edit's history protocol and joins its existing stack. */
export class ArtboardCommand {
  constructor(doc,before,after,refresh,text='Artboard'){Object.assign(this,{doc,before,after,refresh,text});}
  getText(){return this.text;} type(){return 'ArtboardCommand';} elements(){return [];}
  restore(state){this.doc.artboards=state.artboards.map(b=>({...b}));this.doc.activeArtboardId=state.activeArtboardId;this.refresh();}
  apply(handler){handler?.handleHistoryEvent('before_apply',this);this.restore(this.after);handler?.handleHistoryEvent('after_apply',this);}
  unapply(handler){handler?.handleHistoryEvent('before_unapply',this);this.restore(this.before);handler?.handleHistoryEvent('after_unapply',this);}
}
