const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const load=()=>import('../src/js/libs/relight/math.js');
const pixels=(w,h)=>new Uint8ClampedArray(Array.from({length:w*h},()=>[100,120,140,255]).flat());
async function flat(w=5,h=5){const m=await load(),depth=new Float32Array(w*h).fill(.5);return {...m,geometry:{depth,normals:m.depth_normals(depth,w,h),width:w,height:h}};}
test('Relight defaults are independent and controls normalize invalid values',async()=>{
 const m=await load();assert.notEqual(m.default_light(),m.default_light());
 const l=m.normalize_light({x:-5,y:5,intensity:Infinity,diffusion:-2,distance:0,color:'not-a-color',type:'bad'});
 assert.equal(l.x,0);assert.equal(l.y,1);assert.equal(l.intensity,.5);assert.equal(l.diffusion,0);assert.equal(l.distance,.1);assert.equal(l.color,'#ffffff');assert.equal(l.type,'bulb');
});
test('Depth normalization handles constant, nonfinite and varied maps',async()=>{
 const m=await load();assert.deepEqual([...m.normalize_depth([4,6,8])],[0,.5,1]);assert.deepEqual([...m.normalize_depth([NaN,2,2])],[.5,.5,.5]);
});
test('Flat surface normals face the viewer and are normalized',async()=>{
 const {geometry}=await flat();for(let i=0;i<geometry.normals.length;i+=3){assert.equal(Math.abs(geometry.normals[i]),0);assert.equal(Math.abs(geometry.normals[i+1]),0);assert.equal(geometry.normals[i+2],1);}
});
test('Sloped surface normals tilt opposite the depth gradient',async()=>{
 const m=await load();const n=m.depth_normals(new Float32Array([0,.5,1,0,.5,1,0,.5,1]),3,3);assert.ok(n[12]<0);assert.equal(Math.abs(n[13]),0);assert.ok(Math.abs(Math.hypot(...n.slice(12,15))-1)<1e-6);
});
test('Grid interpolation clamps edges and supports vector channels',async()=>{
 const m=await load();assert.equal(m.sample_grid([0,10,20,30],2,2,.5,.5),15);assert.equal(m.sample_grid([0,10,20,30],2,2,-2,5),20);
 assert.equal(m.sample_grid([1,2,3,4,5,6],2,1,.5,0,3,1),3.5);
});
test('No lights plus full original is pixel-identical and does not mutate source',async()=>{
 const {geometry,render_relight}=await flat();const src=pixels(5,5),result=render_relight(src,5,5,geometry,{original:1,lights:[]});assert.deepEqual(result,src);assert.notEqual(result,src);
});
test('Disabled and zero-intensity lights preserve the original exactly',async()=>{
 const {geometry,render_relight,default_light}=await flat();const src=pixels(5,5);assert.deepEqual(render_relight(src,5,5,geometry,{original:1,lights:[{...default_light(),enabled:false},{...default_light(),intensity:0}]}),src);
});
test('Bulb placement lights the nearby side more than the far side',async()=>{
 const {geometry,render_relight,default_light}=await flat();const out=render_relight(pixels(5,5),5,5,geometry,{original:1,lights:[{...default_light(),x:0,y:.5,distance:.2,diffusion:0}]});assert.ok(out[2*5*4]>out[(2*5+4)*4]);
});
test('Directional Sun gives spatially uniform lighting on a flat surface',async()=>{
 const {geometry,render_relight,default_light}=await flat();const out=render_relight(pixels(5,5),5,5,geometry,{original:1,lights:[{...default_light(),type:'sun'}]});assert.deepEqual([...out.slice(0,4)],[...out.slice(-4)]);
});
test('Colored lights add only their color in linear space',async()=>{
 const {geometry,render_relight,default_light}=await flat();const src=pixels(5,5);const out=render_relight(src,5,5,geometry,{lights:[{...default_light(),color:'#ff0000'}]});assert.ok(out[0]>src[0]);assert.equal(out[1],src[1]);assert.equal(out[2],src[2]);
});
test('Transparent pixels and partial alpha are preserved',async()=>{
 const {geometry,render_relight,default_light}=await flat();const src=pixels(5,5);src[3]=0;src[7]=89;const out=render_relight(src,5,5,geometry,{original:0,lights:[default_light()]});assert.deepEqual([...out.slice(0,4)],[...src.slice(0,4)]);assert.equal(out[7],89);
});
test('Multiple lights add energy; reducing original lighting darkens existing light',async()=>{
 const {geometry,render_relight,default_light}=await flat();const src=pixels(5,5),light={...default_light(),intensity:.1};const a=render_relight(src,5,5,geometry,{lights:[light]}),b=render_relight(src,5,5,geometry,{lights:[light,light]});assert.ok(b[0]>a[0]);const dark=render_relight(src,5,5,geometry,{original:0,lights:[]});assert.ok(dark[0]<src[0]);
});
test('Geometry works at one-pixel sizes and rejects mismatched buffers',async()=>{
 const {geometry,render_relight,default_light}=await flat(1,1);assert.equal(render_relight(pixels(1,1),1,1,geometry,{lights:[default_light()]}).length,4);assert.throws(()=>render_relight(pixels(1,1),2,2,geometry),/dimensions/);
});
test('Depth changes the surface response even with identical source colors',async()=>{
 const m=await load(),w=5,h=5,depth=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)depth[y*w+x]=x/(w-1);
 const geometry={depth,normals:m.depth_normals(depth,w,h),width:w,height:h},src=pixels(w,h);
 const a=m.render_relight(src,w,h,geometry,{lights:[{...m.default_light(),type:'sun',x:0}]}),b=m.render_relight(src,w,h,geometry,{lights:[{...m.default_light(),type:'sun',x:1}]});assert.ok(a[0]>b[0]);
});
test('Runtime retries GPU initialization in a fresh CPU worker and cancels pending jobs',async()=>{
 let source=fs.readFileSync(require.resolve('../src/js/libs/relight/runtime.js'),'utf8').replace(/^import config.*$/m,'').replace('export class RelightRuntime','class RelightRuntime').replace(/new URL\([^)]*import.meta.url\)/g,"'worker.js'");
 const workers=[];class Worker{constructor(){workers.push(this);}postMessage(m){this.message=m;}terminate(){this.terminated=true;}}
 const ctx={Worker,Map,Set,Error,Promise,Uint8ClampedArray,config:{}};vm.createContext(ctx);vm.runInContext(source+';this.Runtime=RelightRuntime;',ctx);
 const runtime=new ctx.Runtime(),canvas={width:1,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(4)})})};
 const job=runtime.depth(canvas,()=>{});workers[0].onmessage({data:{type:'retry_wasm'}});assert.equal(workers[0].terminated,true);assert.equal(workers[1].message.device,'wasm');workers[1].onmessage({data:{type:'result',depth:new ArrayBuffer(4),width:1,height:1}});await job;
 const canceled=runtime.depth(canvas,()=>{});runtime.close();await assert.rejects(canceled,/canceled/);assert.ok(workers.every(w=>w.terminated));
});
function loadUI(globals={}) {
 const source=fs.readFileSync(require.resolve('../src/js/modules/image/relight.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export default class','class');
 const ctx={console,Number,Math,ResizeObserver:class{observe(){}disconnect(){}},Base_layers_class:class{},Dialog_class:class{},...globals};
 vm.createContext(ctx);vm.runInContext(source+';this.UI=Image_relight_class;',ctx);return new ctx.UI();
}
test('Light drag uses a stable captured host and updates normalized position until release',async()=>{
 const {default_light}=await load(),events={},host={addEventListener:(name,fn)=>events[name]=fn,setPointerCapture:id=>{host.pointer=id;},innerHTML:''};
 const canvas={width:100,height:50,getContext:()=>({putImageData(){}}),getBoundingClientRect:()=>({left:20,top:30,width:200,height:100})};
 const nodes={canvas,'.relight-handles':host,'.relight-stage':{getBoundingClientRect:()=>({width:500,height:300})},'.relight-image':{style:{}}};
 const root={querySelector:s=>nodes[s],addEventListener(){}};
 const ui=loadUI();ui.POP={el:{querySelector:s=>s==='.studio-relight'?root:{}}};ui.preview={width:100,height:50};ui.lights=[default_light()];ui.selected=1;
 let renders=0,redraws=0;ui.controls=()=>{};ui.handles=()=>redraws++;ui.schedule=()=>renders++;ui.startDepth=()=>{};
 ui.mount();events.pointerdown({target:{closest:()=>({dataset:{light:'1'}})},pointerId:4,preventDefault(){}});assert.equal(host.pointer,4);
 events.pointermove({pointerId:4,clientX:170,clientY:80});assert.equal(ui.lights[0].x,.75);assert.equal(ui.lights[0].y,.5);assert.equal(renders,1);assert.equal(redraws,1);
 events.pointermove({pointerId:4,clientX:500,clientY:0});assert.equal(ui.lights[0].x,1);assert.equal(ui.lights[0].y,0);
 events.pointerup();events.pointermove({pointerId:4,clientX:20,clientY:30});assert.equal(ui.lights[0].x,1,'released pointer does not move light');
});
test('Apply commits one image action and a closed or changed document commits none',async()=>{
 let actions=0;const layer={id:2},config={layers:[layer]},app={Documents:{active_id:1},Actions:{Update_layer_image_action:class{constructor(canvas,id){assert.equal(id,2);}}},State:{do_action:async()=>{actions++;}}};
 const document={createElement:()=>({getContext:()=>({putImageData(){}})})};
 const ui=loadUI({config,app,document,ImageData:class{},Uint8ClampedArray});
 const root={querySelector:()=>({}),querySelectorAll:()=>[]};Object.assign(ui,{root,ready:true,layer,documentId:1,source:{width:1,height:1},original:{},lights:[],originalStrength:1,POP:{},runtime:{render:async()=>({pixels:new ArrayBuffer(4)}),close(){}}});ui.status=()=>{};
 assert.equal(await ui.apply(),true);assert.equal(actions,1);assert.equal(ui.root,null);
 const changed=loadUI({config,app});Object.assign(changed,{root,ready:true,layer,documentId:0});changed.status=()=>{};assert.equal(await changed.apply(),false);assert.equal(actions,1);
 const canceled=loadUI({config,app,document,ImageData:class{},Uint8ClampedArray});let finish;const runtime={render:()=>new Promise(resolve=>finish=resolve),close(){}};
 Object.assign(canceled,{root,ready:true,layer,documentId:1,source:{width:1,height:1},original:{},lights:[],originalStrength:1,runtime});canceled.status=()=>{};
 const pending=canceled.apply();canceled.close();finish({pixels:new ArrayBuffer(4)});assert.equal(await pending,false);assert.equal(actions,1);
});
