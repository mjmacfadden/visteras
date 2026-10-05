import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEl } from './helpers/fake-svg.mjs';
import { clipExportToRect } from '../js/visteras-export-clip.js';
function element(tag, attrs={}) {
  const el=fakeEl(tag,attrs);
  el.ownerDocument={createElementNS:(_,name)=>element(name)};
  el.append=(...nodes)=>{for(const node of nodes){if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);node.parentNode=el;el.children.push(node);}};
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
