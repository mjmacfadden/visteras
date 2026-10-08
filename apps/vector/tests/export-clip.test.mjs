import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEl } from './helpers/fake-svg.mjs';
import { clipExportToRect, stripExportGuides, EXPORT_GUIDE_SELECTORS } from '../js/visteras-export-clip.js';
function element(tag, attrs={}) {
  const el=fakeEl(tag,attrs);
  el.ownerDocument={createElementNS:(_,name)=>element(name)};
  el.append=(...nodes)=>{for(const node of nodes){if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);node.parentNode=el;el.children.push(node);}};
  el.remove=()=>{if(el.parentNode){const i=el.parentNode.children.indexOf(el);if(i>=0)el.parentNode.children.splice(i,1);el.parentNode=null;}};
  el.querySelectorAll=()=>el.children.flatMap(child=>[...(child.id?[child]:[]),...child.querySelectorAll()]);
  return el;
}
test('offset artboard clips all artwork while keeping definitions and unique ids',()=>{
  const root=element('svg'),defs=element('defs'),existing=element('clipPath',{id:'visteras-export-clip'});
  defs.append(existing);
  const board1=element('image',{x:'0',width:'100'}),board2=element('path',{d:'M200 0 L300 100'});
  root.append(defs,board1,board2);
  clipExportToRect(root,{x:200,y:-50,width:100,height:150});
  const group=root.children.at(-1),clip=root.children.at(-2).children[0];
  assert.equal(group.getAttribute('clip-path'),'url(#visteras-export-clip-1)');
  assert.deepEqual(group.children,[board1,board2]);
  assert.deepEqual(clip.children[0].attrs,{x:'200',y:'-50',width:'100',height:'150'});
  assert.equal(clip.getAttribute('clipPathUnits'),'userSpaceOnUse');
  assert.equal(root.children[0],defs);
  assert.equal(root.getAttribute('overflow'),'hidden');
});

test('stripExportGuides removes ruler and smart guide layers but keeps artwork', () => {
  const root = element('svg');
  const layer = element('g', { class: 'layer' });
  const art = element('rect', { id: 'art', width: '10', height: '10' });
  layer.append(art);
  const guides = element('g', { id: 'visteras_ruler_guides', class: 'visteras-guides-layer' });
  const wrap = element('g', { class: 'visteras-guide-wrap', 'data-guide-id': 'guide_1' });
  wrap.append(element('line', { class: 'visteras-ruler-guide visteras-ruler-guide-h', y1: '40', y2: '40' }));
  guides.append(wrap);
  const smart = element('g', { id: 'visteras_smart_guides', class: 'visteras-smart-guides-layer' });
  smart.append(element('line', { class: 'visteras-smart-guide' }));
  root.append(layer, guides, smart);
  root.getElementById = (id) => ({ visteras_ruler_guides: guides, visteras_smart_guides: smart }[id] || null);
  // querySelectorAll stub that understands our selectors roughly
  const all = () => {
    const out = [];
    const walk = (n) => {
      out.push(n);
      for (const c of n.children || []) walk(c);
    };
    for (const c of root.children) walk(c);
    return out;
  };
  root.querySelectorAll = (sel) => {
    const tokens = String(sel).split(',').map((s) => s.trim());
    return all().filter((n) => {
      const id = n.id || n.getAttribute?.('id');
      const cls = n.getAttribute?.('class') || '';
      const dg = n.getAttribute?.('data-guide-id');
      for (const t of tokens) {
        if (t.startsWith('#') && id === t.slice(1)) return true;
        if (t.startsWith('.') && cls.split(/\s+/).includes(t.slice(1))) return true;
        if (t === '[data-guide-id]' && dg) return true;
      }
      return false;
    });
  };
  const n = stripExportGuides(root);
  assert.ok(n >= 2, `removed guide nodes (got ${n})`);
  assert.equal(root.children.includes(guides), false);
  assert.equal(root.children.includes(smart), false);
  assert.equal(root.children.includes(layer), true);
  assert.equal(art.parentNode, layer);
  assert.match(EXPORT_GUIDE_SELECTORS, /visteras_ruler_guides/);
});

test('stripExportGuides is a no-op on clean artwork', () => {
  const root = element('svg');
  root.append(element('rect', { id: 'only' }));
  root.getElementById = () => null;
  root.querySelectorAll = () => [];
  assert.equal(stripExportGuides(root), 0);
  assert.equal(root.children.length, 1);
});

test('stripExportGuides tolerates null / missing querySelectorAll', () => {
  assert.equal(stripExportGuides(null), 0);
  assert.equal(stripExportGuides({}), 0);
});
