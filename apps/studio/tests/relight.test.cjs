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
 assert.equal(l.x,0);assert.equal(l.y,1);assert.equal(l.intensity,.8);assert.equal(l.diffusion,0);assert.equal(l.distance,.1);assert.equal(l.color,'#ffffff');assert.equal(l.type,'bulb');
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
 const nodes={canvas,'.relight-handles':host,'.relight-stage':{getBoundingClientRect:()=>({width:500,height:300})},'.relight-image':{style:{}},'[data-role="pattern-file"]':{addEventListener(){}}};
 const root={querySelector:s=>nodes[s],querySelectorAll:()=>[],addEventListener(){}};
 const ui=loadUI();ui.POP={el:{querySelector:s=>s==='.studio-relight'?root:{}}};ui.preview={width:100,height:50};ui.lights=[default_light()];ui.selected=1;
 let renders=0,redraws=0;ui.controls=()=>{};ui.handles=()=>redraws++;ui.schedule=()=>renders++;ui.startDepth=()=>{};ui.layoutView=()=>{};ui.bindViewport=()=>{};
 ui.mount();events.pointerdown({target:{closest:()=>({dataset:{light:'1'}})},pointerId:4,preventDefault(){}});assert.equal(host.pointer,4);
 events.pointermove({pointerId:4,clientX:170,clientY:80});assert.equal(ui.lights[0].x,.75);assert.equal(ui.lights[0].y,.5);assert.equal(renders,1);assert.equal(redraws,1);
 events.pointermove({pointerId:4,clientX:500,clientY:0});assert.equal(ui.lights[0].x,1);assert.equal(ui.lights[0].y,0);
 events.pointerup();events.pointermove({pointerId:4,clientX:20,clientY:30});assert.equal(ui.lights[0].x,1,'released pointer does not move light');
 const start=(kind,x,y)=>events.pointerdown({target:{closest:()=>({dataset:{light:'1',gizmo:kind}})},pointerId:4,clientX:x,clientY:y,preventDefault(){}});
 start('move',20,30);events.pointermove({pointerId:4,clientX:70,clientY:55});events.pointerup();assert.equal(ui.lights[0].patternX,.75);assert.equal(ui.lights[0].patternY,.75);assert.equal(ui.lights[0].x,1);
 start('scale',190,125);events.pointermove({pointerId:4,clientX:210,clientY:145});events.pointerup();assert.ok(Math.abs(ui.lights[0].patternScale-2)<1e-6);
 start('rotate',170,85);events.pointermove({pointerId:4,clientX:190,clientY:105});events.pointerup();assert.equal(ui.lights[0].patternRotation,90);

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

test('Default lighting visibly follows the source across the image',async()=>{
 const {geometry,render_relight,default_light}=await flat(21,21),src=pixels(21,21);
 const left=render_relight(src,21,21,geometry,{original:.75,lights:[{...default_light(),x:.1,y:.5}]}),right=render_relight(src,21,21,geometry,{original:.75,lights:[{...default_light(),x:.9,y:.5}]});
 const a=(10*21+2)*4,b=(10*21+18)*4;
 assert.ok(left[a]-left[b]>=20,'near-side lighting must be clearly stronger');
 assert.ok(right[b]-right[a]>=20,'the lighting emphasis must move to the opposite side');
});
const patterns=()=>import('../src/js/libs/relight/patterns.js');
test('Every procedural mask is deterministic, bounded and invertible',async()=>{
 const m=await patterns(),{default_light}=await load();
 for(const name of m.PATTERNS.filter(n=>n!=='none'&&n!=='custom'))for(const [x,y] of [[.12,.26],[.5,.5],[.9,.77]]){
  const light={...default_light(),type:'sun',pattern:name},a=m.pattern_mask(x,y,.15,light);
  assert.ok(Number.isFinite(a)&&a>=0&&a<=1,name);assert.equal(a,m.pattern_mask(x,y,.15,light));
  assert.ok(Math.abs(a+m.pattern_mask(x,y,.15,{...light,patternInvert:true})-1)<1e-6,name);
 }
});
test('Sun projection warps mask coordinates with depth and direction',async()=>{
 const m=await patterns(),{default_light}=await load(),light={...default_light(),x:.9,y:.1};
 const near=m.pattern_coordinates(.5,.5,.3,light),far=m.pattern_coordinates(.5,.5,0,light);
 assert.ok(near.x<far.x);assert.ok(near.y>far.y);
});
test('Pattern translation, scale and rotation transform coordinates independently',async()=>{
 const m=await patterns(),{default_light}=await load(),l={...default_light(),x:.5,y:.5};
 assert.deepEqual(m.pattern_coordinates(.7,.5,0,l),{x:.7-.5,y:0});
 assert.ok(Math.abs(m.pattern_coordinates(.7,.5,0,{...l,patternScale:2}).x-.1)<1e-6);
 const r=m.pattern_coordinates(.7,.5,0,{...l,patternRotation:90});assert.ok(Math.abs(r.x)<1e-6);assert.ok(Math.abs(r.y+.2)<1e-6);
 assert.ok(Math.abs(m.pattern_coordinates(.7,.5,0,{...l,patternX:.7}).x)<1e-6);
});
test('Window and blinds produce spatial lighting variation on a flat image',async()=>{
 const {render_relight,default_light,geometry}=await flat(21,21),src=pixels(21,21);
 for(const pattern of ['window','blinds']){const result=render_relight(src,21,21,geometry,{original:.75,lights:[{...default_light(),type:'sun',pattern}]});const values=new Set();for(let i=0;i<result.length;i+=4)values.add(result[i]);assert.ok(values.size>2,pattern);}
});
test('Custom grayscale masks interpolate and remain bounded outside their footprint',async()=>{
 const m=await patterns(),{default_light}=await load(),l={...default_light(),pattern:'custom',x:.5,y:.5},custom={width:2,height:1,data:new Uint8Array([0,255])};
 assert.equal(m.pattern_mask(.5,.5,0,l,custom),.5);assert.equal(m.pattern_mask(1.2,.5,0,l,custom),0);assert.equal(m.pattern_mask(1.2,.5,0,{...l,patternInvert:true},custom),1);
});
test('Sun softness changes surface response independently of diffusion',async()=>{
 const {render_relight,default_light,geometry}=await flat(),src=pixels(5,5),l={...default_light(),type:'sun',x:0,y:0,diffusion:0};
 const hard=render_relight(src,5,5,geometry,{lights:[{...l,softness:0}]}),soft=render_relight(src,5,5,geometry,{lights:[{...l,softness:1}]});assert.ok(soft[0]>hard[0]);
});
test('Temperature presets include neutral and distinct warm/cool gels',async()=>{
 const m=await patterns();assert.equal(m.temperature_color(5500),'#ffffff');assert.notEqual(m.temperature_color(1000),m.temperature_color(10000));assert.equal(m.TEMPERATURES.length,9);
});
test('Zoom keeps the point under the cursor fixed and fit uses image dimensions',async()=>{
 const m=await import('../src/js/libs/relight/view.js');assert.equal(m.fit_zoom(464,264,800,400),.5);
 const before={scale:.5,x:20,y:-10},after=m.zoom_view(before,1,100,50);
 assert.equal((100-after.x)/after.scale,(100-before.x)/before.scale);assert.equal((50-after.y)/after.scale,(50-before.y)/before.scale);
 assert.equal(m.zoom_view(before,100).scale,4);
});
test('Pattern rotation accounts for non-square image pixels',async()=>{
 const m=await patterns(),{default_light}=await load(),l={...default_light(),x:.5,y:.5,patternRotation:90};
 const p=m.pattern_coordinates(.6,.5,0,l,2);assert.ok(Math.abs(p.x)<1e-6);assert.ok(Math.abs(p.y+.2)<1e-6);
});
test('Viewport pans only while held, wheel zoom anchors at the cursor and comparison releases',()=>{
 const stageEvents={},compareEvents={},rootEvents={};
 const stage={addEventListener:(n,f)=>stageEvents[n]=f,setPointerCapture(){},getBoundingClientRect:()=>({left:10,top:20,width:200,height:100})};
 const compare={addEventListener:(n,f)=>compareEvents[n]=f,setPointerCapture(){}};
 const ui=loadUI();ui.root={querySelector:s=>s==='.relight-stage'?stage:compare,addEventListener:(n,f)=>rootEvents[n]=f};ui.view={scale:.5,x:0,y:0};ui.layoutView=()=>{};
 const paints=[];ui.paint=()=>paints.push(Boolean(ui.holdingCompare));let zoom;ui.changeZoom=(...args)=>zoom=args;
 ui.bindViewport();rootEvents.keydown({code:'Space',target:{closest:()=>null},preventDefault(){}});
 stageEvents.pointerdown({button:0,pointerId:2,clientX:20,clientY:30,preventDefault(){}});stageEvents.pointermove({pointerId:2,clientX:70,clientY:60});assert.equal(ui.view.x,50);assert.equal(ui.view.y,30);
 stageEvents.pointerup();stageEvents.pointermove({pointerId:2,clientX:80,clientY:90});assert.equal(ui.view.x,50);
 stageEvents.wheel({ctrlKey:true,deltaY:-100,clientX:160,clientY:80,preventDefault(){}});assert.ok(zoom[0]>.5);assert.equal(zoom[1],50);assert.equal(zoom[2],10);
 compareEvents.pointerdown({pointerId:3});compareEvents.pointerup();assert.deepEqual(paints,[true,false]);
});
test('Temperature dropdown includes swatches, selection marker and retained custom color',async()=>{
 const {temperature_markup}=await import('../src/js/libs/relight/temperature-menu.js');
 const html=temperature_markup({temperature:5500,color:'#ffffff',customColor:'#cc3388'});
 assert.equal((html.match(/role="option"/g)||[]).length,10);assert.match(html,/background:#cc3388/);assert.match(html,/5500K: Neutral/);assert.match(html,/data-temperature="5500"/);assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);
});
test('Temperature dropdown keyboard chooses a preset, Escape closes only the open menu and listeners clean up',async()=>{
 const {mount_temperature_menu}=await import('../src/js/libs/relight/temperature-menu.js');
 function node(){return {events:{},style:{},attrs:{},addEventListener(n,fn){this.events[n]=fn;},removeEventListener(n){delete this.events[n];},setAttribute(n,v){this.attrs[n]=v;},getAttribute(n){return this.attrs[n];},focus(){this.focused=true;}};}
 const trigger=node(),menu=node(),control=node(),host=node();host.innerWidth=800;host.innerHeight=600;menu.hidden=true;menu.scrollTop=0;menu.clientHeight=340;
 const options=[0,1000,2000,3200,4300,5500,6500,7500,9000,10000].map((k,i)=>Object.assign(node(),{dataset:{temperature:String(k)},offsetTop:i*31,offsetHeight:31,attrs:{'aria-selected':String(k===5500)}}));
 trigger.getBoundingClientRect=()=>({left:500,top:200,bottom:232,width:248});menu.querySelectorAll=()=>options;control.querySelector=s=>s.includes('combobox')?trigger:menu;control.contains=target=>target===trigger||target===menu||options.includes(target);
 let value=null,stops=0;const binding=mount_temperature_menu(control,k=>value=k,host);
 const key=k=>control.events.keydown({key:k,preventDefault(){},stopImmediatePropagation(){stops++;}});
 key('ArrowDown');assert.equal(menu.hidden,false);assert.equal(trigger.attrs['aria-expanded'],'true');assert.equal(options[5].focused,true);
 key('ArrowDown');key('Enter');assert.equal(value,6500);assert.equal(menu.hidden,true);
 const oldStops=stops;key('Escape');assert.equal(stops,oldStops,'closed Escape passes through to the dialog');
 trigger.events.click();key('Escape');assert.equal(menu.hidden,true);assert.equal(trigger.focused,true);
 trigger.events.click();host.events.pointerdown({target:{}});assert.equal(menu.hidden,true);
 binding.destroy();assert.deepEqual(Object.keys(host.events),[]);assert.deepEqual(Object.keys(control.events),[]);
});
