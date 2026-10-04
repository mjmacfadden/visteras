import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDocumentChange,replaceDocumentSession,captureDocumentSnapshot,serializeDocumentSnapshot,applyDocumentSave,createDocumentSaveQueue} from '../js/visteras-document-save.js';
const document = id => ({id,title:id,dirty:true,artboards:[{id:'board',x:0,width:100,backgroundColor:'#ffffff'}],activeArtboardId:'board',rasterEffects:{ppi:72}});
const snapshot = doc => captureDocumentSnapshot(doc,{svg:'<svg/>',width:100,height:50,unit:'px'});
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('Snapshot detaches nested metadata before asynchronous work and preserves VVD format',()=>{
 const doc=document('a'),saved=snapshot(doc);
 doc.artboards[0].x=200;doc.artboards.push({id:'second'});doc.rasterEffects.ppi=300;doc.activeArtboardId='second';
 const json=JSON.parse(serializeDocumentSnapshot(saved,'Poster','thumbnail'));
 assert.equal(json.title,'Poster');assert.equal(json.thumbnail,'thumbnail');assert.equal(json.svg,'<svg/>');
 assert.equal(json.artboards.length,1);assert.equal(json.artboards[0].x,0);assert.equal(json.rasterEffects.ppi,72);assert.equal(json.activeArtboardId,'board');
 assert.equal(json.$schema,'visteras-vector-document-v1');assert.equal(json.version,1);
 assert.equal(json.revision,undefined);assert.equal(json.generation,undefined);assert.equal(json.documentId,undefined);
});

test('Every change advances the revision even when a document is already dirty',()=>{
 const doc=document('a');recordDocumentChange(doc);recordDocumentChange(doc);
 assert.equal(doc.revision,2);assert.equal(doc.dirty,true);assert.equal(doc.isStartupDefault,false);
});

test('Saving the captured revision marks only that document clean',()=>{
 const a=document('a'),b=document('b'),saved=snapshot(a),handle={name:'Poster.vvd'};
 assert.equal(applyDocumentSave([a,b],saved,{handle},'Poster'),a);
 assert.equal(a.dirty,false);assert.equal(a.fileHandle,handle);assert.equal(a.title,'Poster');
 assert.equal(b.dirty,true);assert.equal(b.title,'b');
});

test('Edits while a write is pending remain unsaved; payload stays at captured revision',async()=>{
 const doc=document('a'),saved=snapshot(doc),gate=deferred(),queue=createDocumentSaveQueue();let output;
 const pending=queue.run(doc,async()=>{await gate.promise;output=serializeDocumentSnapshot(saved,'Poster',null);return {handle:{}};});
 doc.artboards[0].width=400;recordDocumentChange(doc);gate.resolve();
 applyDocumentSave([doc],saved,await pending,'Poster');
 assert.equal(JSON.parse(output).artboards[0].width,100);assert.equal(doc.artboards[0].width,400);assert.equal(doc.dirty,true);assert.ok(doc.fileHandle);
 const latest=snapshot(doc);applyDocumentSave([doc],latest,{handle:doc.fileHandle},'Poster');assert.equal(doc.dirty,false);
});

test('Closing or replacing a document prevents a late save from updating its replacement',()=>{
 const doc=document('a'),saved=snapshot(doc);
 assert.equal(applyDocumentSave([],saved,{handle:{}},'Old'),null);
 replaceDocumentSession(doc);doc.title='New';doc.dirty=false;
 assert.equal(applyDocumentSave([doc],saved,{handle:{}},'Old'),null);
 assert.equal(doc.title,'New');assert.equal(doc.fileHandle,undefined);assert.equal(doc.dirty,false);
});

test('Cancelled saves leave title, handle and dirty state untouched',()=>{
 const doc=document('a'),before=structuredClone(doc);
 assert.equal(applyDocumentSave([doc],snapshot(doc),{cancelled:true},'Ignored'),null);assert.deepEqual(doc,before);
});

test('Concurrent writes to one document are rejected, while another document may save',async()=>{
 const a=document('a'),b=document('b'),gate=deferred(),queue=createDocumentSaveQueue();let calls=0;
 const first=queue.run(a,()=>{calls++;return gate.promise;});
 assert.equal(calls,1,'writer is invoked synchronously to preserve picker activation');
 assert.deepEqual(await queue.run(a,()=>{calls++;}),{busy:true});
 assert.deepEqual(await queue.run(b,()=>({cancelled:true})),{cancelled:true});
 gate.resolve({handle:{}});await first;
 assert.equal(await queue.run(a,()=>42),42);assert.equal(calls,1);
});

test('Failed writes release the lock for retry without changing document state',async()=>{
 const doc=document('a'),queue=createDocumentSaveQueue(),before=structuredClone(doc);
 await assert.rejects(queue.run(doc,()=>{throw new Error('Disk unavailable');}),/Disk unavailable/);
 assert.deepEqual(doc,before);assert.equal(await queue.run(doc,()=>true),true);
});
