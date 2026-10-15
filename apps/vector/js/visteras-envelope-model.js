import { ENV, SRC, OUT, normalizeParams, normalizeOpts, readEnvelope, canEnvelope, envelopeHash } from './visteras-envelope-core.js?v=envelope-2';
const NS='http://www.w3.org/2000/svg';
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
  return clone;
}
export function refreshEnvelope(sc, el) {
  const data=readEnvelope(el); if(!data?.src) return false;
  const hash=envelopeHash(el);
  if(data.out && el.getAttribute(`${ENV}-hash`)===hash) return false;
  const out=cloneEnvelopeOutput(data.src,sc);
  if(data.out) data.out.replaceWith(out); else el.appendChild(out);
  el.setAttribute(`${ENV}-hash`,hash);
  return true;
}
export function makeEnvelope(sc, elements, params={}, opts={}) {
  const chosen=[...new Set(elements)].filter(el=>!elements.some(other=>other!==el && other.contains(el)));
  if(!canEnvelope(chosen)) return null;
  // A shared parent keeps source attributes byte-identical, including transforms.
  // Mixed-layer/group selections require document-space normalization in the renderer.
  const parent=chosen[0].parentNode;
  if(!parent || chosen.some(el=>el.parentNode!==parent)) throw new Error('Select objects in the same layer or group.');
  const sorted=[...parent.children].filter(el=>chosen.includes(el));
  const bbox=sc.getStrokedBBox(sorted);
  if(!bbox || ![bbox.x,bbox.y,bbox.width,bbox.height].every(Number.isFinite)) return null;
  const doc=parent.ownerDocument, group=doc.createElementNS(NS,'g'), src=doc.createElementNS(NS,'g');
  group.setAttribute('id',sc.getNextId()); group.setAttribute(ENV,'warp');
  group.setAttribute(`${ENV}-params`,JSON.stringify(normalizeParams(params)));
  group.setAttribute(`${ENV}-opts`,JSON.stringify(normalizeOpts(opts)));
  group.setAttribute(`${ENV}-bbox`,[bbox.x,bbox.y,bbox.width,bbox.height].join(' '));
  src.setAttribute(SRC,'1'); src.setAttribute('display','none'); group.appendChild(src);
  const {BatchCommand,InsertElementCommand,MoveElementCommand}=sc.history;
  const batch=new BatchCommand('Make with Warp');
  parent.insertBefore(group,sorted.at(-1).nextSibling); batch.addSubCommand(new InsertElementCommand(group));
  for(const el of sorted) {
    const next=el.nextSibling; src.appendChild(el); batch.addSubCommand(new MoveElementCommand(el,next,parent));
  }
  refreshEnvelope(sc,group);
  sc.addCommandToHistory(batch); sc.clearSelection(); sc.addToSelection([group],true); sc.call('changed',[group]);
  return group;
}
