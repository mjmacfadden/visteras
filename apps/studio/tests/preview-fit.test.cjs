const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/js/libs/preview-fit.js');

test('Preview fit leaves a 32px margin on the limiting side (portrait)',async()=>{
 const {fit_preview_scale}=await load();
 const s=fit_preview_scale(1100,650,600,800);
 assert.equal(s,(650-64)/800);
 assert.ok(600*s<=1100-64);
});
test('Preview fit uses width for wide landscape images',async()=>{
 const {fit_preview_scale}=await load();
 assert.equal(fit_preview_scale(1100,650,3000,1000),(1100-64)/3000);
});
test('Preview fit upscales tiny images like main canvas Fit on Screen',async()=>{
 const {fit_preview_scale}=await load();
 const s=fit_preview_scale(1100,650,100,130);
 assert.ok(s>1);assert.equal(Math.round(130*s),650-64);
});
test('Preview fit is safe for collapsed views and empty images',async()=>{
 const {fit_preview_scale}=await load();
 assert.ok(fit_preview_scale(0,0,600,800)>0);
 assert.equal(fit_preview_scale(500,500,0,0),1);
});
test('Relight fit_zoom shares the preview fit calculation',async()=>{
 const {fit_preview_scale}=await load();const {fit_zoom}=await import('../src/js/libs/relight/view.js');
 assert.equal(fit_zoom(1102,651,540,720),fit_preview_scale(1102,651,540,720));
});
