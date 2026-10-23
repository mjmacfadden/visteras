import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fakeEl} from './helpers/fake-svg.mjs';
import {normalizeParams, normalizeOpts, readEnvelope, isEnvelopeSource, canEnvelope, envelopeHash, ENV, SRC, OUT} from '../js/visteras-envelope-core.js';
import {selectableArtwork} from '../js/visteras-sublayers.js';
import {isSelectableTarget} from '../js/visteras-select-same.js';
import {defaultObjectName} from '../js/visteras-layer-names.js';
function fixture() {
  const envelope=fakeEl('g',{[ENV]:'warp',[`${ENV}-params`]:JSON.stringify(normalizeParams()),[`${ENV}-opts`]:JSON.stringify(normalizeOpts()),[`${ENV}-bbox`]:'100 100 80 60'});
  const src=fakeEl('g',{[SRC]:'1',display:'none'}),out=fakeEl('g',{[OUT]:'1'});
  const original=fakeEl('rect',{x:'100',y:'100',width:'80',height:'60'}), visible=fakeEl('path',{d:'M400 400H480V460H400Z'});
  envelope.children=[src,out];src.parentNode=out.parentNode=envelope;
  src.children=[original];out.children=[visible];original.parentNode=src;visible.parentNode=out;
  for(const node of [envelope,src,out,original,visible]) { Object.defineProperty(node,'attributes',{get:()=>Object.entries(node.attrs).map(([name,value])=>({name,value}))});Object.defineProperty(node,'childNodes',{get:()=>node.children}); }
  return {envelope,src,out,original,visible};
}
test('AT2 normalized defaults and bounds preserve unknown future metadata',()=>{
 assert.deepEqual(normalizeParams(),{style:'arc',dir:'h',bend:50,dh:0,dv:0});
 assert.deepEqual(normalizeOpts(),{aa:true,preserve:'clip',fidelity:50,appearance:true,linGrad:false,pattern:false});
 assert.equal(normalizeParams({bend:Infinity}).bend,50);assert.equal(normalizeParams({bend:-200}).bend,-100);
 assert.equal(normalizeParams({future:42}).future,42);assert.equal(normalizeOpts({fidelity:200,future:42}).fidelity,100);
 const {envelope,src,out}=fixture(),data=readEnvelope(envelope);
 assert.equal(data.src,src);assert.equal(data.out,out);assert.deepEqual(data.bbox,[100,100,80,60]);
});
test('H1 hidden-source descendants cannot become Visteras selection targets',()=>{
 const {src,original,visible}=fixture();
 assert.equal(isEnvelopeSource(original),true);assert.equal(isEnvelopeSource(visible),false);
 assert.equal(isSelectableTarget(original),false);assert.deepEqual(selectableArtwork([src,original]),[]);
 assert.equal(canEnvelope([original]),false);
});
test('H3 Select All keeps the envelope atomic and excludes original descendants',()=>{
 const {envelope,original}=fixture();assert.deepEqual(selectableArtwork([envelope,original]),[envelope]);
 assert.equal(defaultObjectName(envelope),'<Envelope>');
});
test('AT11 SVG metadata round trip preserves editability without storage access',()=>{
 const {envelope,src}=fixture();const before=readEnvelope(envelope);
 const reopened=fakeEl('g',JSON.parse(JSON.stringify(envelope.attrs)));reopened.children=[src,fakeEl('g',{[OUT]:'1'})];
 assert.deepEqual(readEnvelope(reopened).params,before.params);assert.deepEqual(readEnvelope(reopened).opts,before.opts);
 const hash=envelopeHash(envelope);src.setAttribute('data-test-change','1');assert.notEqual(envelopeHash(envelope),hash);
 for(const name of ['core','model']) {
  const source=fs.readFileSync(new URL(`../js/visteras-envelope-${name}.js`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB/);
 }
});
test('AT11 load-time ids and pointer-events styles added by SVG-Edit do not make output stale',()=>{
 const {envelope,src,original}=fixture();const hash=envelopeHash(envelope);
 src.setAttribute('id','svg_3');original.setAttribute('style','pointer-events: inherit;');
 assert.equal(envelopeHash(envelope),hash);
 original.setAttribute('width','90');assert.notEqual(envelopeHash(envelope),hash);
});
