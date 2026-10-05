import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { penHandles } from '../js/visteras-pen-handles.js';

test('Option preserves incoming control while outgoing moves independently', () => {
  const anchor = {x:100,y:100};
  const smooth = penHandles(anchor,{x:140,y:100},null,false);
  assert.deepEqual(smooth.incoming,{x:60,y:100});
  const corner = penHandles(anchor,{x:100,y:160},smooth.incoming,true);
  assert.deepEqual(corner.incoming,{x:60,y:100});
  assert.deepEqual(corner.outgoing,{x:100,y:160});
  assert.deepEqual(penHandles(anchor,{x:120,y:140},corner.incoming,false).incoming,{x:80,y:60});
});

test('native pen keeps incoming geometry and uses outgoing control for next-segment preview', () => {
  const code = readFileSync(new URL('../Editor.js', import.meta.url),'utf8');
  const start = code.indexOf('\t\tmouseMove(e, t, event = {})');
  const end = code.indexOf('\n\t\tmouseUp(',start);
  const segments = [{pathSegType:2,x:0,y:0},{pathSegType:6,x:100,y:100,x1:20,y1:0,x2:60,y2:100}];
  const path = {pathSegList:{numberOfItems:2,getItem:i=>segments[i]}};
  const stretch = {};
  let preview;
  const p_ = {
    getZoom:()=>2,getDrawnPath:()=>path,getCurrentMode:()=> 'path',
    addCtrlGrip:()=>({setAttribute(){}}),getCtrlLine:()=>({}),
    replacePathSeg(type,index,values,target) {
      if (target===stretch) preview=values;
      else { const [x,y,x1,y1,x2,y2]=values; segments[index]={pathSegType:type,x,y,x1,y1,x2,y2}; }
    },
  };
  const Pen = vm.runInNewContext(`(class {
    #t=[100,100]; #n=null; #i=false;
    release(){this.#t=null;}
    ${code.slice(start,end)}
  })`,{p_,penHandles,kg:()=>{},Og:()=>stretch});
  const pen = new Pen();
  pen.mouseMove(200,320,{altKey:true});
  assert.deepEqual(segments[1],{pathSegType:6,x:100,y:100,x1:20,y1:0,x2:60,y2:100});
  pen.release(); pen.mouseMove(400,400);
  assert.deepEqual(Array.from(preview),[400,400,200,320,400,400]);
});
