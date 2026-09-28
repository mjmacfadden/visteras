const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const {createCanvas}=require('@napi-rs/canvas');
const context=vm.createContext({app:{},config:{},btoa,atob,document:{createElement:()=>createCanvas(1,1)}});
vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/effect-masks.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),context);
function canvas(color){const c=createCanvas(2,1);c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,2,1);return c;}
const pixel=c=>[...c.getContext('2d').getImageData(0,0,1,1).data];
test('white applies, black bypasses, gray mixes an effect without hiding the layer',()=>{
 const before=canvas('red'), after=canvas('blue');
 for(const [color,expected] of [['white',[0,0,255,255]],['black',[255,0,0,255]],['#808080',[127,0,128,255]]]){
  const mask=context.encodeEffectMask(canvas(color));
  assert.deepEqual(pixel(context.blendEffectMask(before,after,mask)),expected);
  assert.deepEqual(pixel(context.effectMaskRuntime(mask).link),pixel(canvas(color)));
 }
});
test('mask interpolation uses premultiplied alpha and disabling restores full effect',()=>{
 const before=canvas('transparent'),after=canvas('blue'),mask=context.encodeEffectMask(canvas('#808080'));
 assert.deepEqual(pixel(context.blendEffectMask(before,after,mask)),[0,0,255,128]);
 assert.deepEqual(pixel(context.blendEffectMask(before,after,{...mask,enabled:false})),[0,0,255,255]);
});
test('live mask preview does not mutate serialized data',()=>{
 const mask=context.encodeEffectMask(canvas('white')),data=mask.data;
 context.effectMaskRuntime(mask).link_canvas=canvas('black');
 assert.deepEqual(pixel(context.blendEffectMask(canvas('red'),canvas('blue'),mask)),[255,0,0,255]);
 assert.equal(mask.data,data);assert.equal(JSON.stringify(mask).includes('link_canvas'),false);
});

test('native compositing preserves fractional source and effect transparency',()=>{
 const before=canvas('rgba(240,60,20,0.4)'),after=canvas('rgba(20,80,240,0.7)');
 const a=pixel(before),b=pixel(after);
 for(const gray of [0,32,128,224,255]){
  const mask=context.encodeEffectMask(canvas(`rgb(${gray},${gray},${gray})`));
  const p=pixel(context.blendEffectMask(before,after,mask)),t=gray/255;
  const alpha=a[3]*(1-t)+b[3]*t;
  const expected=a.slice(0,3).map((v,i)=>(v*a[3]*(1-t)+b[i]*b[3]*t)/alpha).concat(alpha);
  // Canvas stores 8-bit premultiplied pixels; allow rounding at each composite.
  assert.ok(Math.abs(p[3]-alpha)<=1);
  for(let i=0;i<3;i++) assert.ok(Math.abs(p[i]*p[3]/255-expected[i]*alpha/255)<=1.5,`${gray}: channel ${i}`);
 }
});
