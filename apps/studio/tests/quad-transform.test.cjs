const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createCanvas}=require('@napi-rs/canvas');
const read=f=>fs.readFileSync(require.resolve('../src/js/'+f),'utf8');
const context=vm.createContext({});
vm.runInContext(read('libs/quad-transform.js').replace(/^export /gm,'')+'\nthis.api={quad_matrix,inverse_matrix,map_point,valid_quad,draw_quad};',context);
const {quad_matrix,inverse_matrix,map_point,valid_quad,draw_quad}=context.api;
const q=[{x:10,y:10},{x:50,y:10},{x:65,y:35},{x:10,y:55}];
test('projective mapping moves one corner and maps its inverse back to source',()=>{
 const m=quad_matrix(q),inv=inverse_matrix(m);
 for(const [i,p] of [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}].entries()) {
  const result=map_point(m,p);assert.ok(Math.hypot(result.x-q[i].x,result.y-q[i].y)<1e-8);
  const back=map_point(inv,result);assert.ok(Math.hypot(back.x-p.x,back.y-p.y)<1e-8);
 }
 assert.equal(valid_quad(q),true);assert.equal(valid_quad([q[0],q[2],q[1],q[3]]),false);
});
test('inverse sampling fills the independent-corner outline with no triangle seams',()=>{
 const source=createCanvas(40,40);source.getContext('2d').fillStyle='cyan';source.getContext('2d').fillRect(0,0,40,40);
 const out=createCanvas(80,80);draw_quad(out.getContext('2d'),source,q,()=>createCanvas(1,1));
 const pixel=(x,y)=>out.getContext('2d').getImageData(x,y,1,1).data;
 assert.equal(pixel(60,34)[3],255); // added corner region outside the original rectangle
 assert.equal(pixel(48,48)[3],0); // removed region below the sloping bottom edge
 for(let y=18;y<35;y++) for(let x=18;x<45;x++) assert.equal(pixel(x,y)[3],255);
 assert.equal(pixel(20,20)[1],255);assert.equal(pixel(20,20)[2],255);
});
test('handle squares stay upright and eight screen pixels wide at different zooms',()=>{
 const c=vm.createContext({app:{},config:{TRANSFORM_MARGIN:0},zoomView:{matrix:[1,0,0,1,0,0]}});
 vm.runInContext(read('libs/quad-transform.js').replace(/^export /gm,'')+'\n'+read('libs/free-transform.js').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\n(function(){'+read('core/base-selection.js').replace(/^import .*;$/gm,'').replace(/export default \w+;/,'this.Selection=Base_selection_class;')+'}).call(this);',c);
 const selection=Object.create(c.Selection.prototype),rects=[];
 const ctx=new Proxy({fillRect:(...v)=>rects.push(v),strokeRect(){},setTransform:(...m)=>assert.deepEqual(m,[1,0,0,1,0,0])},{get:(o,k)=>o[k]||(()=>{})});
 for(const zoom of [1,2]) {
  c.zoomView.matrix=[zoom,0,0,zoom,0,0];rects.length=0;
  selection.draw_transform_controls(ctx,{x:10,y:10,width:40,height:30,rotate:25,skew_x:40},null,8);
  assert.equal(rects.length,8);for(const rect of rects) assert.deepEqual(rect.slice(2),[8,8]);
 }
});
