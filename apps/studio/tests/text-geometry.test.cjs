const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/text-geometry.js'),'utf8').replace(/export /g,''),context);
const {place_point_text,point_text_origin}=context;
for(const halign of ['left','center','right']) for(const rotate of [0,-15,33.5]) {
 test(`${halign} ${rotate}° preserves baseline through reflow and moves`,()=>{
 const origin=[937.3689320388347,1207.3611650485432];
 const l={x:639,y:1169,width:298,height:39,rotate,params:{halign,psd_point_origin:origin}};
 place_point_text(l,301,69,55);
 for(const [w,h,b] of [[350,80,60],[290,70,52],[587,116,92]]) {
  place_point_text(l,w,h,b);
  const actual=point_text_origin(l,b);
  actual.forEach((v,i)=>assert.ok(Math.abs(v-origin[i])<1e-9));
 }
 const before={...l};
 l.x+=40;l.y-=20;
 place_point_text(l,587,116,92);
 assert.equal(l.x,before.x+40);assert.equal(l.y,before.y-20);
 const moved=point_text_origin(l,92);
 assert.ok(Math.abs(moved[0]-origin[0]-40)<1e-9);
 assert.ok(Math.abs(moved[1]-origin[1]+20)<1e-9);
 });
}
test('unchanged layout is exactly idempotent for undo history',()=>{
 const l={x:0,y:0,width:1,height:1,rotate:-15,params:{halign:'right',psd_point_origin:[937.3689320388347,1207.3611650485432]}};
 place_point_text(l,301,69,55);const before=JSON.stringify(l);
 for(let i=0;i<1000;i++)place_point_text(l,301,69,55);
 assert.equal(JSON.stringify(l),before);
});
vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/psd-fill.js'),'utf8').replace(/\bexport /g,'')+fs.readFileSync(require.resolve('../src/js/libs/psd-unsupported.js'),'utf8').replace(/\bexport /g,'')+fs.readFileSync(require.resolve('../src/js/libs/psd.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),context);
test('wrapped paragraph keeps its declared font size despite tall pixel bounds',()=>{
 const l=context.convert_psd_text({left:20,top:30,right:179,bottom:107,canvas:{width:159,height:77},text:{text:'Words wrap across several lines.',shapeType:'box',transform:[1,0,0,1,20,30],boxBounds:[0,0,180,100],style:{font:{name:'ArialMT'},fontSize:24,fillColor:{r:0,g:0,b:0}}}},1,'Paragraph',100,true,'source-over');
 assert.equal(l.params.size,24);assert.equal(l.data[0][0].meta.size,24);
 assert.equal(l.width,180);assert.equal(l.height,100);
 const exported=context.build_psd_text_from_layer(l);assert.equal(exported.style.fontSize,24);
 l.data=[[{text:'Small ',meta:{size:12,family:'Arial'}},{text:'Large',meta:{size:36,family:'Arial'}}]];
 assert.deepEqual(Array.from(context.build_psd_text_from_layer(l).styleRuns,r=>r.style.fontSize),[12,36]);
});
test('scaled rotated PSD text preserves origin, fractional size and tracking on export',()=>{
 const scale=3.1333,angle=-15.25*Math.PI/180;
 const l=context.convert_psd_text({left:200,top:900,right:800,bottom:1200,text:{text:'Test heading',shapeType:'point',transform:[scale*Math.cos(angle),scale*Math.sin(angle),-scale*Math.sin(angle),scale*Math.cos(angle),259.68,1209.90],style:{font:{name:'Oswald-Regular'},fontSize:24.57739,tracking:25,fillColor:{r:255,g:255,b:255}}}},1,'Heading',100,true,'source-over');
 assert.ok(Math.abs(l.rotate+15.25)<1e-10);assert.equal(l.data[0][0].meta.size,24.57739*scale);
 place_point_text(l,587,116,92);
 const t=context.build_psd_text_from_layer(l);
 assert.ok(Math.abs(t.transform[4]-259.68)<1e-9);assert.ok(Math.abs(t.transform[5]-1209.90)<1e-9);
 assert.equal(t.style.tracking,25);
 assert.equal(t.style.font.name,'Oswald-Regular');
});
