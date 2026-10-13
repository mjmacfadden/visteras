const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');
const read = file => fs.readFileSync(require.resolve('../src/js/' + file), 'utf8');
function runtime() {
 const config = { layers: [], WIDTH: 80, HEIGHT: 80 };
 const context = vm.createContext({ config, console, Helper_class: class {}, app: {}, resampleRaster: source => source, document: { createElement: () => createCanvas(1,1) } });
 for (const file of ['libs/quad-transform.js','libs/free-transform.js','libs/layer-tree.js','libs/layer-clip.js','libs/group-composite.js','core/base-layers.js','modules/mask/mask.js']) {
  vm.runInContext(read(file).replace(/^import .*;$/gm,'').replace(/export default \{[\s\S]*?\};/g,'').replace(/^export default .*;$/gm,'').replace(/\bexport /g,''),context);
 }
 const renderer=vm.runInContext('Object.create(Base_layers_class.prototype)',context);
 const mask=vm.runInContext('Object.create(Mask_class.prototype)',context);
 renderer.Mask=mask; renderer.Base_gui={modules:{}}; renderer.disabled_filter_id=[];
 return {config,context,renderer,mask};
}
function layer() {
 const link=createCanvas(20,20); const ctx=link.getContext('2d'); ctx.fillStyle='red'; ctx.fillRect(0,0,20,20);
 return {id:1,type:'image',visible:true,link,x:30,y:30,width:20,height:20,rotate:15,skew_x:30,skew_y:10,opacity:100,composition:'source-over',filters:[]};
}
const pixels=canvas=>Buffer.from(canvas.getContext('2d').getImageData(0,0,80,80).data);

test('document compositor used by export and merges draws rotation plus skew', () => {
 const {config,renderer}=runtime(); const l=layer(); config.layers=[l]; const actual=createCanvas(80,80);
 renderer.convert_layers_to_canvas(actual.getContext('2d'));
 const expected=createCanvas(80,80); const ctx=expected.getContext('2d');
 ctx.translate(40,40); ctx.rotate(15*Math.PI/180); ctx.transform(1,Math.tan(10*Math.PI/180),Math.tan(30*Math.PI/180),1,0,0); ctx.translate(-40,-40); ctx.drawImage(l.link,30,30,20,20);
 assert.deepEqual(pixels(actual),pixels(expected));
});

test('linked white mask follows skew and rotation; unlinked mask stays in document coordinates', () => {
 const {renderer,mask}=runtime(); const l=layer(); const white=createCanvas(20,20); white.getContext('2d').fillStyle='white'; white.getContext('2d').fillRect(0,0,20,20);
 l.mask={link:white,enabled:true,linked:true,x:30,y:30,width:20,height:20};
 const actual=createCanvas(80,80); actual.getContext('2d').fillStyle='red'; actual.getContext('2d').fillRect(0,0,80,80);
 mask.get_mask_alpha_canvas=()=>white; mask.get_mask_source=()=>white;
 mask.multiply_alpha_by_mask_world(actual.getContext('2d'),l);
 const expected=createCanvas(80,80); renderer._draw_layer_content(expected.getContext('2d'),l);
 assert.deepEqual(pixels(actual),pixels(expected));
 l.mask.linked=false; const fixed=createCanvas(80,80); fixed.getContext('2d').fillRect(0,0,80,80); mask.multiply_alpha_by_mask_world(fixed.getContext('2d'),l);
 assert.equal(fixed.getContext('2d').getImageData(30,30,1,1).data[3],255);
 assert.equal(fixed.getContext('2d').getImageData(25,30,1,1).data[3],0);
});

test('GPU eligibility rejects skew before rendering, including masked and text layers', () => {
 const source=read('core/renderer/webgl-renderer.js'); const start=source.indexOf('\tcan_render_layers('); const end=source.indexOf('\n\t/**',start);
 const context=vm.createContext({is_group:()=>false,is_effectively_visible:l=>l.visible!==false,get_render_composition:()=> 'source-over',is_layer_clipped:()=>false,GPU_BLEND_MODES:{'source-over':0}});
 vm.runInContext('this.renderer = {'+source.slice(start,end)+'};',context);
 context.renderer._layer_filters_gpu_ok=()=>true;
 for (const type of ['image','smart','text','vector']) assert.equal(context.renderer.can_render_layers([{type,skew_y:25}]),false);
 assert.equal(context.renderer.can_render_layers([{type:'image',visible:false,skew_y:25}]),true);
});

test('independent corner geometry reaches Canvas export and linked masks',()=>{
 const {config,renderer,mask}=runtime();const l=layer();l.rotate=0;l.skew_x=0;l.skew_y=0;
 l.transform_quad=[{x:0,y:0},{x:1,y:0},{x:1.4,y:.65},{x:0,y:1}];config.layers=[l];
 const out=createCanvas(80,80);renderer.convert_layers_to_canvas(out.getContext('2d'));
 assert.equal(out.getContext('2d').getImageData(54,42,1,1).data[3],255);
 assert.equal(out.getContext('2d').getImageData(49,49,1,1).data[3],0);
 const white=createCanvas(20,20);white.getContext('2d').fillStyle='white';white.getContext('2d').fillRect(0,0,20,20);
 l.mask={link:white,enabled:true,linked:true,x:30,y:30,width:20,height:20};
 mask.get_mask_source=()=>white;mask.get_mask_alpha_canvas=()=>white;
 const cover=createCanvas(80,80);cover.getContext('2d').fillStyle='red';cover.getContext('2d').fillRect(0,0,80,80);
 mask.multiply_alpha_by_mask_world(cover.getContext('2d'),l);
 assert.deepEqual(pixels(cover),pixels(out));
 const p=mask.world_to_mask(l,58,43);assert.ok(Math.abs(p.x-20)<1e-8);assert.ok(Math.abs(p.y-20)<1e-8);
});
