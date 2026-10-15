import { ENV, SRC, OUT, normalizeParams, normalizeOpts, readEnvelope, canEnvelope, envelopeHash } from './visteras-envelope-core.js?v=envelope-3';
import { prepareAndBuild } from './visteras-envelope-render.js?v=envelope-3';
import { multiply, invert, IDENTITY } from './visteras-envelope-warp.js?v=envelope-3';
const NS='http://www.w3.org/2000/svg';
export const WRAP=`${ENV}-wrap`;
let deps={};
/** Inject browser-only helpers (text outlines) without importing them into the pure test graph. */
export function setEnvelopeDeps(next) { deps={...deps,...next}; }

/** Generated clones never reuse source IDs; local paint/clip/text references follow the clone. */
export function cloneEnvelopeOutput(src, sc) {
  const clone=src.cloneNode(true), ids=new Map();
  clone.removeAttribute(SRC); clone.removeAttribute('display'); clone.setAttribute(OUT,'1');
  for(const node of [clone,...clone.querySelectorAll('[id]')]) if(node.id) {
    const id=sc.getNextId(); ids.set(node.id,id); node.setAttribute('id',id);
  }
  for(const node of [clone,...clone.querySelectorAll('*')]) for(const attr of [...node.attributes]) {
    let value=attr.value.replace(/url\(#([^)]+)\)/g,(all,id)=>ids.has(id)?`url(#${ids.get(id)})`:all);
    if(['href','xlink:href'].includes(attr.name) && value.startsWith('#') && ids.has(value.slice(1))) value=`#${ids.get(value.slice(1))}`;
    if(value!==attr.value) node.setAttribute(attr.name,value);
  }
  for(const node of [clone,...clone.querySelectorAll('*')]) node.removeAttribute?.(WRAP);
  return clone;
}

const pending=new WeakMap();
/**
 * Re-render `-out` asynchronously (text outlines and rasters are async). The latest request wins;
 * a render whose source/params changed meanwhile is discarded. Output is derived data, so the swap is
 * not an undo step (the step that changed params/source is).
 */
export function renderEnvelope(sc, el, {force=false}={}) {
  const data=readEnvelope(el); if(!data?.src) return Promise.resolve(false);
  const hash=envelopeHash(el);
  if(!force && data.out && el.getAttribute(`${ENV}-hash`)===hash && el.getAttribute(`${ENV}-rendered`)===hash) return Promise.resolve(false);
  const token={}; pending.set(el,token);
  return prepareAndBuild(sc,el,src=>cloneEnvelopeOutput(src,sc),deps).then(out=>{
    if(!out || pending.get(el)!==token || envelopeHash(el)!==hash) return false;
    const current=readEnvelope(el).out;
    if(current) current.replaceWith(out); else el.appendChild(out);
    el.setAttribute(`${ENV}-hash`,hash); el.setAttribute(`${ENV}-rendered`,hash);
    try {
      if(sc.getSelectedElements?.().includes(el)) sc.selectorManager?.requestSelector?.(el)?.resize?.();
      sc.call?.('changed',[el]);
    } catch { /* selection chrome refresh only */ }
    return true;
  });
}
/** Synchronous load check: true when `-out` is missing or stale (then a re-render is started). */
export function refreshEnvelope(sc, el) {
  const data=readEnvelope(el); if(!data?.src) return false;
  const hash=envelopeHash(el);
  if(data.out && el.getAttribute(`${ENV}-hash`)===hash) return false;
  // Immediate identity output so nothing disappears while the warp renders.
  const out=cloneEnvelopeOutput(data.src,sc);
  if(data.out) data.out.replaceWith(out); else el.appendChild(out);
  el.setAttribute(`${ENV}-hash`,hash); el.removeAttribute(`${ENV}-rendered`);
  if(typeof sc.getSvgContent==='function') renderEnvelope(sc,el,{force:true});
  return true;
}

const ctmTo=(node)=>{ try { const m=node.getScreenCTM?.(); return m?[m.a,m.b,m.c,m.d,m.e,m.f]:null; } catch { return null; } };
/** Geometric bounds of elements in `parent`'s user space (document axis). */
function boundsIn(sc, parent, elements) {
  const pm=ctmTo(parent), pinv=pm&&invert(pm);
  let box=null;
  if(pinv) {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const el of elements) {
      let b; try { b=el.getBBox(); } catch { b=null; }
      const em=ctmTo(el); if(!b||!em) { x0=NaN; break; }
      const m=multiply(pinv,em);
      for(const [x,y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]) {
        const px=m[0]*x+m[2]*y+m[4], py=m[1]*x+m[3]*y+m[5];
        x0=Math.min(x0,px);y0=Math.min(y0,py);x1=Math.max(x1,px);y1=Math.max(y1,py);
      }
    }
    if([x0,y0,x1,y1].every(Number.isFinite)) box={x:x0,y:y0,width:x1-x0,height:y1-y0};
  }
  return box || sc.getStrokedBBox(elements);
}

/**
 * Wrap the selection in an envelope as one undo step. Objects may come from different
 * layers/groups: the envelope goes where the topmost object was, and objects from other
 * parents keep their look through a wrapper carrying the parent-to-parent matrix.
 */
export function makeEnvelope(sc, elements, params={}, opts={}) {
  const chosen=[...new Set(elements)].filter(el=>!elements.some(other=>other!==el && other.contains(el)));
  if(!canEnvelope(chosen)) return null;
  let all=[...(sc.getSvgContent?.()?.querySelectorAll('*') || [])];
  if(!all.length) { // document order from the shared root (no live SVG content available)
    let root=chosen[0]; while(root.parentNode) root=root.parentNode;
    const walk=n=>{for(const c of n.children||[]){all.push(c);walk(c);}}; walk(root);
  }
  const order=el=>{const i=all.indexOf(el);return i<0?0:i;};
  const sorted=[...chosen].sort((a,b)=>order(a)-order(b));
  const top=sorted.at(-1), parent=top.parentNode;
  if(!parent) return null;
  const bbox=boundsIn(sc,parent,sorted);
  if(!bbox || ![bbox.x,bbox.y,bbox.width,bbox.height].every(Number.isFinite)) return null;
  const doc=parent.ownerDocument, group=doc.createElementNS(NS,'g'), src=doc.createElementNS(NS,'g');
  group.setAttribute('id',sc.getNextId()); group.setAttribute(ENV,'warp');
  group.setAttribute(`${ENV}-params`,JSON.stringify(normalizeParams(params)));
  group.setAttribute(`${ENV}-opts`,JSON.stringify(normalizeOpts(opts)));
  group.setAttribute(`${ENV}-bbox`,[bbox.x,bbox.y,bbox.width,bbox.height].map(v=>Math.round(v*1000)/1000).join(' '));
  src.setAttribute(SRC,'1'); src.setAttribute('display','none'); group.appendChild(src);
  const {BatchCommand,InsertElementCommand,MoveElementCommand}=sc.history;
  const batch=new BatchCommand('Make with Warp');
  const pm=ctmTo(parent), pinv=pm&&invert(pm);
  // Relative matrices are measured before anything moves.
  const rel=new Map(sorted.map(el=>{
    if(el.parentNode===parent || !pinv) return [el,null];
    const om=ctmTo(el.parentNode); if(!om) return [el,null];
    const m=multiply(pinv,om);
    return [el, m.every((v,i)=>Math.abs(v-IDENTITY[i])<1e-9)?null:m];
  }));
  parent.insertBefore(group,top.nextSibling); batch.addSubCommand(new InsertElementCommand(group));
  for(const el of sorted) {
    const oldParent=el.parentNode, next=el.nextSibling, m=rel.get(el);
    if(m) {
      const wrap=doc.createElementNS(NS,'g'); wrap.setAttribute(WRAP,'1'); wrap.setAttribute('transform',`matrix(${m.map(v=>Math.round(v*1e6)/1e6).join(' ')})`);
      src.appendChild(wrap); batch.addSubCommand(new InsertElementCommand(wrap));
      wrap.appendChild(el); batch.addSubCommand(new MoveElementCommand(el,next,oldParent));
    } else { src.appendChild(el); batch.addSubCommand(new MoveElementCommand(el,next,oldParent)); }
  }
  refreshEnvelope(sc,group);
  sc.addCommandToHistory(batch); sc.clearSelection(); sc.addToSelection([group],true); sc.call('changed',[group]);
  return group;
}
