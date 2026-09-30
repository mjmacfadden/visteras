import test from 'node:test';
import assert from 'node:assert/strict';
import { hitSegment, splitSegment, evaluateSegment, explicitClosing, deleteAnchorSmooth, mergeEdges } from '../js/visteras-pen-geometry.js';
import { resolvePenHover, PEN_CURSORS, PEN_PREF_KEY, getDisableAutoAddDelete, setDisableAutoAddDelete } from '../js/visteras-pen-auto.js';

const M=(x,y)=>({type:2,x,y}),L=(x,y)=>({type:4,x,y}),C=(x1,y1,x2,y2,x,y)=>({type:6,x1,y1,x2,y2,x,y}),Z={type:1};
const near=(a,b,eps=1e-9)=>Math.abs(a-b)<=eps;
const pts=segs=>segs.filter(s=>s.type!==1).map(s=>[s.x,s.y]);
// Max distance from samples of curve a to the densely sampled polyline of curve b.
function sample(segs,n=64){const out=[];let prev=null;for(const s of segs){if(s.type===2){prev=s;out.push({x:s.x,y:s.y});continue;}if(s.type===1||!prev)continue;for(let i=1;i<=n;i++)out.push(evaluateSegment(prev,s,i/n));prev=s;}return out;}
function hausdorff(a,b){const A=sample(a),B=sample(b,256);let m=0;for(const p of A){let d=Infinity;for(const q of B)d=Math.min(d,Math.hypot(p.x-q.x,p.y-q.y));m=Math.max(m,d);}return m;}

test('explicitClosing adds the closing L only when missing',()=>{
  const a=explicitClosing([M(0,0),L(10,0),L(10,10),Z]);
  assert.deepEqual(a.map(s=>s.type),[2,4,4,4,1]);assert.deepEqual([a[3].x,a[3].y],[0,0]);
  const b=explicitClosing([M(0,0),L(10,0),L(10,10),L(0,0),Z]);assert.equal(b.length,5);
  const c=explicitClosing([M(0,0),L(10,0)]);assert.equal(c.length,2);
});

test('straight-segment hit uses the exact projection t (no search error)',()=>{
  const h=hitSegment([M(0,0),L(800,0)],{x:400,y:3},p=>p);
  assert.equal(h.index,1);assert.equal(h.t,0.5);
  const s=splitSegment([M(0,0),L(800,0)],h.index,h.t);assert.deepEqual(pts(s),[[0,0],[400,0],[800,0]]);
});

test('split at t keeps the cubic exactly and adds one anchor',()=>{
  const p=M(10,20),c=C(60,180,190,-90,250,40);
  for(const t of [0.1,0.37,0.5,0.83]){
    const s=splitSegment([p,c],1,t);assert.equal(s.length,3);
    const at=evaluateSegment(p,c,t);assert.ok(near(s[1].x,at.x,1e-9)&&near(s[1].y,at.y,1e-9));
    for(let i=0;i<=50;i++){const u=i/50,e=evaluateSegment(p,c,u),a=u<=t?evaluateSegment(s[0],s[1],u/t):evaluateSegment(s[1],s[2],(u-t)/(1-t));assert.ok(Math.hypot(e.x-a.x,e.y-a.y)<1e-9);}
  }
});

test('delete: interior anchor between two lines becomes one straight line',()=>{
  const r=deleteAnchorSmooth([M(0,0),L(50,0),L(100,0),L(100,100)],1);
  assert.deepEqual(r.map(s=>s.type),[2,4,4]);assert.deepEqual(pts(r),[[0,0],[100,0],[100,100]]);
});

test('delete: rectangle corner leaves a closed triangle, including the start anchor',()=>{
  const rect=explicitClosing([M(0,0),L(100,0),L(100,100),L(0,100),Z]);
  const a=deleteAnchorSmooth(rect,2);
  assert.equal(a.at(-1).type,1);assert.deepEqual(pts(a),[[0,0],[100,0],[0,100],[0,0]]);
  const b=deleteAnchorSmooth(rect,0);
  assert.equal(b.at(-1).type,1);assert.deepEqual(pts(b),[[100,0],[100,100],[0,100],[100,0]]);
  // Closing-anchor index maps to the start anchor too.
  assert.deepEqual(pts(deleteAnchorSmooth(rect,4)),pts(b));
});

test('delete: open endpoints shorten the path',()=>{
  const open=[M(0,0),L(10,0),C(20,0,30,10,30,20)];
  assert.deepEqual(pts(deleteAnchorSmooth(open,0)),[[10,0],[30,20]]);
  const e=deleteAnchorSmooth(open,2);assert.deepEqual(pts(e),[[0,0],[10,0]]);
});

test('delete refuses to leave fewer than two anchors',()=>{
  assert.equal(deleteAnchorSmooth([M(0,0),L(10,0)],1),null);
  assert.equal(deleteAnchorSmooth([M(0,0),L(10,0)],0),null);
  assert.equal(deleteAnchorSmooth([M(0,0),L(10,0)],9),null);
});

test('delete of an inserted anchor recovers the original cubic (shape kept)',()=>{
  const p=M(0,0),c=C(40,120,110,-70,160,0);
  for(const t of [0.25,0.5,0.7]){
    const split=splitSegment([p,c],1,t);
    const back=deleteAnchorSmooth(split,1);
    assert.equal(back.length,2);assert.equal(back[1].type,6);
    assert.ok(hausdorff(back,[p,c])<0.05,`t=${t}`);
    assert.ok(Math.hypot(back[1].x1-40,back[1].y1-120)<0.05&&Math.hypot(back[1].x2-110,back[1].y2+70)<0.05);
  }
});

test('delete on a smooth circle-like contour stays close to the original',()=>{
  const k=0.5523*50,circle=[M(50,0),C(50,k,k,50,0,50),C(-k,50,-50,k,-50,0),C(-50,-k,-k,-50,0,-50),C(k,-50,50,-k,50,0),Z];
  const r=deleteAnchorSmooth(circle,2);
  assert.equal(r.filter(s=>s.type===6).length,3);assert.equal(r.at(-1).type,1);
  // Illustrator-like: the merged edge keeps the outer tangents and bulges outward.
  const mid=evaluateSegment(r[1],r[2],.5);assert.ok(mid.x<-45&&Math.abs(mid.y)<1e-6,'merged edge bulges out to the deleted anchor');
});

test('delete only touches the contour holding the anchor',()=>{
  const two=[M(0,0),L(50,0),L(100,0),M(0,50),L(50,50),L(100,50)];
  const r=deleteAnchorSmooth(two,1);
  assert.deepEqual(pts(r),[[0,0],[100,0],[0,50],[50,50],[100,50]]);
});

test('mergeEdges: line+line is a line, curves keep outer tangents',()=>{
  assert.equal(mergeEdges({x:0,y:0},{x:5,y:5},{x:10,y:0},L(5,5),L(10,0)).type,4);
  const m=mergeEdges({x:0,y:0},{x:50,y:50},{x:100,y:0},C(0,30,20,50,50,50),C(80,50,100,30,100,0));
  assert.equal(m.type,6);assert.ok(near(m.x1,0,1e-9)&&m.y1>0);assert.ok(near(m.x2,100,1e-9)&&m.y2>0);
});

const tgt=(o)=>({ref:o.ref||'p',selected:o.selected??true,anchors:o.anchors||[],segment:o.segment??null});
test('hover: drawing shows close over the start anchor and draw elsewhere',()=>{
  const drawing={start:{x:10,y:10},canClose:true};
  assert.equal(resolvePenHover({pointer:{x:13,y:12},drawing}).state,'close');
  assert.equal(resolvePenHover({pointer:{x:13,y:12},drawing}).cursor,'pen_close');
  assert.equal(resolvePenHover({pointer:{x:30,y:12},drawing}).state,'draw');
  assert.equal(resolvePenHover({pointer:{x:10,y:10},drawing:{start:{x:10,y:10},canClose:false}}).state,'draw');
  // Other paths never get add/delete while drawing.
  const targets=[tgt({anchors:[{index:1,x:30,y:12}],segment:{index:1,t:.5,distance:1}})];
  assert.equal(resolvePenHover({pointer:{x:30,y:12},drawing,targets}).state,'draw');
});
test('hover: anchors of selected paths delete, segments add, endpoints continue',()=>{
  const targets=[tgt({anchors:[{index:0,x:0,y:0,endpoint:true},{index:1,x:50,y:0},{index:2,x:100,y:0,endpoint:true}],segment:{index:1,t:.3,distance:4}})];
  const d=resolvePenHover({pointer:{x:52,y:1},targets});assert.deepEqual([d.state,d.cursor,d.index],['delete','pen_delete',1]);
  const c=resolvePenHover({pointer:{x:99,y:2},targets});assert.deepEqual([c.state,c.cursor,c.index],['continue','pen_continue',2]);
  const a=resolvePenHover({pointer:{x:30,y:2},targets});assert.deepEqual([a.state,a.cursor,a.index,a.t],['add','pen_add',1,.3]);
  assert.equal(resolvePenHover({pointer:{x:300,y:300},targets:[tgt({})]}).state,'new');
});
test('hover: Shift overrides auto add/delete and continue',()=>{
  const targets=[tgt({anchors:[{index:1,x:50,y:0},{index:2,x:100,y:0,endpoint:true}],segment:{index:1,t:.3,distance:4}})];
  for(const p of [{x:50,y:0},{x:100,y:0},{x:30,y:1}]){const h=resolvePenHover({pointer:p,shift:true,targets});assert.deepEqual([h.state,h.cursor],['new','pen']);}
});
test('hover: unselected paths get neither add nor delete',()=>{
  const targets=[tgt({selected:false,anchors:[{index:1,x:50,y:0},{index:0,x:0,y:0,endpoint:true}],segment:null})];
  assert.equal(resolvePenHover({pointer:{x:50,y:0},targets}).state,'new');
  assert.equal(resolvePenHover({pointer:{x:0,y:0},targets}).state,'continue');
});
test('hover: Disable Auto Add/Delete keeps continue only',()=>{
  const targets=[tgt({anchors:[{index:1,x:50,y:0},{index:2,x:100,y:0,endpoint:true}],segment:{index:1,t:.3,distance:4}})];
  assert.equal(resolvePenHover({pointer:{x:50,y:0},autoDisabled:true,targets}).state,'new');
  assert.equal(resolvePenHover({pointer:{x:30,y:1},autoDisabled:true,targets}).state,'new');
  assert.equal(resolvePenHover({pointer:{x:100,y:0},autoDisabled:true,targets}).state,'continue');
});
test('hover: nearest anchor wins, selected wins ties, nearest segment wins',()=>{
  const A=tgt({ref:'A',selected:false,anchors:[{index:3,x:10,y:0}]}),B=tgt({ref:'B',anchors:[{index:4,x:10,y:0}]});
  const h=resolvePenHover({pointer:{x:10,y:0},targets:[A,B]});assert.deepEqual([h.state,h.ref,h.index],['delete','B',4]);
  const near1=tgt({ref:'N',anchors:[{index:1,x:4,y:0}]}),far=tgt({ref:'F',anchors:[{index:2,x:7,y:0}]});
  assert.equal(resolvePenHover({pointer:{x:0,y:0},targets:[far,near1]}).ref,'N');
  const s1=tgt({ref:'S1',segment:{index:1,t:.1,distance:9}}),s2=tgt({ref:'S2',segment:{index:2,t:.2,distance:1}});
  assert.equal(resolvePenHover({pointer:{x:0,y:0},targets:[s1,s2]}).ref,'S2');
  // An anchor outside the radius does not block the segment.
  assert.equal(resolvePenHover({pointer:{x:0,y:0},targets:[tgt({anchors:[{index:1,x:20,y:0}],segment:{index:1,t:.5,distance:2}})]}).state,'add');
});
test('cursor map and preference API',()=>{
  assert.deepEqual({...PEN_CURSORS},{close:'pen_close',draw:'pen',continue:'pen_continue',delete:'pen_delete',add:'pen_add',new:'pen'});
  const m=new Map(),storage={getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))};
  assert.equal(getDisableAutoAddDelete(storage),false);
  assert.equal(setDisableAutoAddDelete(true,storage),true);assert.equal(m.get(PEN_PREF_KEY),'1');assert.equal(getDisableAutoAddDelete(storage),true);
  setDisableAutoAddDelete(false,storage);assert.equal(getDisableAutoAddDelete(storage),false);
  assert.equal(getDisableAutoAddDelete({getItem(){throw new Error('denied');}}),false);
  assert.equal(getDisableAutoAddDelete(null),false);
});
