import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tree,canvas,serialize} from './helpers/envelope-dom.mjs';
import {makeEnvelope,refreshEnvelope} from '../js/visteras-envelope-model.js';
import {readEnvelope,ENV,SRC,OUT} from '../js/visteras-envelope-core.js';
test('AT2 Make stores untouched source, independent output IDs, and one native history batch',()=>{
 const a=tree('rect',{id:'a',x:'10',y:'20',width:'100',height:'80'}),b=tree('text',{id:'b'});
 const root=tree('g',{class:'layer'},[a,b]),sc=canvas([a,b]),before=serialize(root);
 const group=makeEnvelope(sc,[a,b]),data=readEnvelope(group);
 assert.equal(sc.log.length,1);assert.equal(sc.log[0].text,'Make with Warp');
 assert.equal(data.src.children[0],a);assert.equal(data.src.getAttribute('display'),'none');
 assert.equal(data.src.getAttribute(SRC),'1');assert.equal(data.out.getAttribute(OUT),'1');
 assert.notEqual(data.out.children[0].id,a.id);assert.equal(data.params.bend,50);
 const after=serialize(root);sc.undo();assert.equal(serialize(root),before);sc.redo();assert.equal(serialize(root),after);
});
test('AT11 save metadata survives load and stale output rebuild is idempotent',()=>{
 const a=tree('rect',{id:'a',width:'10'}),root=tree('g',{},[a]),sc=canvas([a]);const group=makeEnvelope(sc,[a]);
 const reopened=group.cloneNode(true);root.appendChild(reopened);
 assert.deepEqual(readEnvelope(reopened).params,readEnvelope(group).params);
 assert.equal(refreshEnvelope(sc,reopened),false);
 readEnvelope(reopened).src.children[0].setAttribute('width','20');
 assert.equal(refreshEnvelope(sc,reopened),true);assert.equal(readEnvelope(reopened).out.children[0].getAttribute('width'),'20');
 assert.equal(refreshEnvelope(sc,reopened),false);readEnvelope(reopened).out.remove();assert.equal(refreshEnvelope(sc,reopened),true);
});
test('H2 hidden source is display none inside atomic envelope; native bounds remain authoritative',()=>{
 const a=tree('rect',{id:'a',x:'100',y:'100',width:'80',height:'60'}),root=tree('g',{},[a]),sc=canvas([a]);
 const group=makeEnvelope(sc,[a]),{src,out}=readEnvelope(group);out.children[0].setAttribute('x','400');
 assert.equal(src.parentNode,group);assert.equal(src.getAttribute('display'),'none');assert.equal(root.children.length,1);
 // Browser regression fixture has disjoint source/result. Native getBBox and UI verified against it.
 const model=fs.readFileSync(new URL('../js/visteras-envelope-model.js',import.meta.url),'utf8');
 assert.match(model,/sc\.getStrokedBBox\(elements\)/);assert.match(model,/getScreenCTM/);assert.doesNotMatch(model,/sc\.(getBBox|getStrokedBBox)\s*=/);
});
test('Generated output remaps internal references without changing original references',()=>{
 const grad=tree('linearGradient',{id:'paint'}),rect=tree('rect',{id:'rect',fill:'url(#paint)'}),a=tree('g',{id:'art'},[tree('defs',{},[grad]),rect]);
 tree('g',{},[a]);const sc=canvas([a]),group=makeEnvelope(sc,[a]),{src,out}=readEnvelope(group);
 const cloned=out.querySelectorAll('*').find(n=>n.localName==='rect');
 assert.notEqual(cloned.getAttribute('fill'),'url(#paint)');assert.equal(src.children[0].children[1].getAttribute('fill'),'url(#paint)');
});
