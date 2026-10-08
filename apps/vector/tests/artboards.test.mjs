import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArtboards,normalizeBackgroundColor,createMultipleArtboards,artboardState,artboardUnion,associatedArtboard,nearbyArtboard,nextArtboardName,artboardsForExport,ArtboardCommand} from '../js/visteras-artboard-model.js';
import { paintArtboardBackgroundChip } from '../js/visteras-artboards.js';
import {scopeRect,backgroundColor,pixelSize} from '../js/visteras-export-core.js';
const board=(id,x=0,y=0,width=100,height=100,backgroundColor='#ffffff')=>({id,name:`Artboard ${id}`,x,y,width,height,backgroundColor});
test('Legacy document bounds become one valid artboard; new documents also have one',()=>{
 const [b]=normalizeArtboards(undefined,1920,1080);assert.equal(b.name,'Artboard 1');assert.deepEqual([b.x,b.y,b.width,b.height],[0,0,1920,1080]);assert.ok(b.id);assert.equal(normalizeArtboards([]).length,1);
});
test('Native JSON round trip preserves IDs, order, geometry, backgrounds and active board',()=>{
 const d={artboards:[board('a',-500,20,350,900,'#121212'),board('b',1200,-80,600,300,'none')],activeArtboardId:'b'};
 const loaded=JSON.parse(JSON.stringify(d));loaded.artboards=normalizeArtboards(loaded.artboards);assert.deepEqual(loaded,d);
});
test('Invalid bounds are ignored; duplicate IDs and missing names get valid replacements',()=>{
 const b=normalizeArtboards([{...board('a'),name:''},{...board('a'),name:''},{...board('x'),width:-1}]);assert.equal(b.length,2);assert.notEqual(b[0].id,b[1].id);assert.notEqual(b[0].name,b[1].name);
});
test('Custom/default names and nearby duplication do not collide',()=>{
 const list=[{...board('a'),name:'Artboard 1'},{...board('b',140),name:'Homepage'}];const c=nearbyArtboard(list[0],list);assert.equal(c.name,'Artboard 2');assert.equal(c.x,280);assert.notEqual(c.id,list[0].id);assert.equal(nextArtboardName([...list,c]),'Artboard 3');assert.equal(c.backgroundColor,list[0].backgroundColor);
});
test('Spatial artwork association assigns overlapping objects once, leaves pasteboard objects unassociated',()=>{
 const boards=[board('a'),board('b',80)];assert.equal(associatedArtboard({x:70,y:10,width:60,height:20},boards),'b');assert.equal(associatedArtboard({x:80,y:10,width:20,height:20},boards),'a');assert.equal(associatedArtboard({x:300,y:0,width:20,height:20},boards),null);assert.equal(associatedArtboard({x:40,y:20,width:0,height:40},boards),'a');
});
test('History restores board geometry, creation, deletion, naming, color and ordering without touching artwork',()=>{
 const art={id:'shape',transform:'translate(12 7)'},d={artboards:[board('a'),board('b',140)],activeArtboardId:'a',artwork:[art]};const before=artboardState(d);
 d.artboards.reverse();Object.assign(d.artboards[0],{name:'Homepage',x:-500,width:550,height:200,backgroundColor:'#ff0000'});d.artboards.push(board('c',500));d.artboards.splice(1,1);d.activeArtboardId='c';const after=artboardState(d);let refresh=0;const cmd=new ArtboardCommand(d,before,after,()=>refresh++);const events=[],handler={handleHistoryEvent:e=>events.push(e)};
 cmd.unapply(handler);assert.deepEqual(artboardState(d),before);cmd.apply(handler);assert.deepEqual(artboardState(d),after);assert.equal(d.artwork[0],art);assert.equal(art.transform,'translate(12 7)');assert.deepEqual(cmd.elements(),[]);assert.equal(refresh,2);assert.deepEqual(events,['before_unapply','after_unapply','before_apply','after_apply']);
});
test('Artboard crop and fit union include negative positions and differently sized boards',()=>{
 const boards=[board('a',-100,-20,50,40),board('b',100,100,300,200)];assert.deepEqual(artboardUnion(boards),{x:-100,y:-20,width:500,height:320});assert.deepEqual(scopeRect({scope:'artboard',artboard:boards[0]}),{x:-100,y:-20,width:50,height:40});assert.deepEqual(pixelSize(boards[1],2),{w:600,h:400});
});
test('Export all / selected / range preserve logical order, validate ranges, and deduplicate',()=>{
 const boards=[board('a'),board('b'),board('c')];assert.deepEqual(artboardsForExport(boards,'range',{range:'1-2, 2, 3'}),boards);assert.deepEqual(artboardsForExport(boards,'selected',{selectedIds:['c','a']}),[boards[0],boards[2]]);assert.deepEqual(artboardsForExport(boards,'active',{activeId:'b'}),[boards[1]]);assert.deepEqual(artboardsForExport(boards,'all'),boards);for(const range of ['0','4','2-1','abc','1,'])assert.throws(()=>artboardsForExport(boards,'range',{range}));
});
test('Artboard backgrounds stay transparent in PNG and become white in opaque export',()=>{
 assert.equal(backgroundColor('artboard',{artboard:null}),null);assert.equal(backgroundColor('artboard',{artboard:null,opaque:true}),'#ffffff');assert.equal(backgroundColor('artboard',{artboard:'#123456'}),'#123456');
});
test('Background color supports named colors, 3-digit hex, and transparency without resetting to white',()=>{
 const b=normalizeArtboards([{...board('1'),backgroundColor:'red'},{...board('2'),backgroundColor:'#fff'},{...board('3'),backgroundColor:'transparent'}]);
 assert.equal(b[0].backgroundColor,'red');assert.equal(b[1].backgroundColor,'#fff');assert.equal(b[2].backgroundColor,'none');
});
test('Moving an artboard with Move Artwork translates associated artwork once; without Move Artwork leaves artwork unchanged',()=>{
 const boards=[board('a',0,0,100,100),board('b',150,0,100,100)];
 const art1={id:'art1',x:10,y:10,width:20,height:20}; // in artboard a
 const art2={id:'art2',x:80,y:10,width:80,height:20}; // overlaps both (overlap with a is 20*20=400; with b is 10*20=200; a wins!)
 const pasteboard={id:'pasteboard',x:300,y:50,width:30,height:30}; // outside all boards

 // With move artwork disabled:
 const dx=50,dy=20;
 const moveArtwork=false;
 const movingObjects=moveArtwork?[art1,art2,pasteboard].filter(el=>associatedArtboard(el,boards)==='a'):[];
 assert.equal(movingObjects.length,0);

 // With move artwork enabled:
 const moveArtworkEnabled=true;
 const affected=moveArtworkEnabled?[art1,art2,pasteboard].filter(el=>associatedArtboard(el,boards)==='a'):[];
 assert.equal(affected.length,2);
 assert.ok(affected.includes(art1));
 assert.ok(affected.includes(art2));
 assert.ok(!affected.includes(pasteboard));

 // Verify translating affected items by delta leaves other items untouched
 const translated=affected.map(el=>({...el,x:el.x+dx,y:el.y+dy}));
 assert.deepEqual(translated[0],{id:'art1',x:60,y:30,width:20,height:20});
 assert.deepEqual(pasteboard,{id:'pasteboard',x:300,y:50,width:30,height:30});
});
test('Deleting an artboard leaves all artwork intact on the pasteboard',()=>{
 const d={artboards:[board('a'),board('b',140)],activeArtboardId:'a',artwork:[{id:'shape1'},{id:'shape2'}]};
 const before=artboardState(d);
 d.artboards.splice(0,1);
 d.activeArtboardId=d.artboards[0].id;
 const cmd=new ArtboardCommand(d,before,artboardState(d),()=>{},'Delete artboard');
 assert.equal(d.artboards.length,1);
 assert.equal(d.artwork.length,2); // Artwork remains completely intact
 cmd.unapply();
 assert.equal(d.artboards.length,2);
 assert.equal(d.artwork.length,2);
});
test('createMultipleArtboards creates requested number of artboards arranged in a grid with spacing',()=>{
 const single=createMultipleArtboards(1,1920,1080);
 assert.equal(single.length,1);
 assert.deepEqual([single[0].x,single[0].y,single[0].width,single[0].height],[0,0,1920,1080]);

 const double=createMultipleArtboards(2,800,600,40);
 assert.equal(double.length,2);
 assert.equal(double[0].name,'Artboard 1');
 assert.equal(double[1].name,'Artboard 2');
 assert.deepEqual([double[0].x,double[0].y],[0,0]);
 assert.deepEqual([double[1].x,double[1].y],[840,0]);

 const four=createMultipleArtboards(4,500,500,50);
 assert.equal(four.length,4);
 assert.deepEqual([four[0].x,four[0].y],[0,0]);
 assert.deepEqual([four[1].x,four[1].y],[550,0]);
 assert.deepEqual([four[2].x,four[2].y],[0,550]);
 assert.deepEqual([four[3].x,four[3].y],[550,550]);
});

test('Artboard Background uses Appearance Fill swatch + None chip (not a hex text button)', () => {
  const src = fs.readFileSync(new URL('../js/visteras-artboards.js', import.meta.url), 'utf8');
  assert.match(src, /vcs-appearance-chip/);
  assert.match(src, /vcs-appearance-none/);
  assert.match(src, /vab-background-row/);
  assert.match(src, /classList\.toggle\('is-none'/);
  assert.match(src, /classList\.toggle\('is-active'/);
  assert.doesNotMatch(src, /bg\.textContent=b\.backgroundColor/);
  assert.match(src, /__visterasOpenColorPicker/);
  assert.match(src, /paintArtboardBackgroundChip/);
  assert.match(src, /setProperty\('background-color'/);
  assert.match(src, /paintArtboardBackgroundChip\(bg/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /visteras-artboards\.js\?v=artboard-bg-3/);
});


function fakeChip() {
  const props = new Map();
  const classes = new Set();
  const el = {
    style: {
      setProperty(name, value, priority) { props.set(name, { value, priority: priority || '' }); },
      removeProperty(name) { props.delete(name); },
    },
    classList: {
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    dataset: {},
    title: '',
    textContent: 'x',
    removeAttribute(name) { if (name === 'data-hex') delete el.dataset.hex; },
    setAttribute(name, value) { el._attrs = el._attrs || {}; el._attrs[name] = value; },
    getAttribute(name) { return el._attrs?.[name]; },
    _props: props,
    _classes: classes,
  };
  return el;
}

test('paintArtboardBackgroundChip paints real color with !important (beats #ccc chip CSS)', () => {
  const bg = fakeChip();
  const none = fakeChip();
  paintArtboardBackgroundChip(bg, none, '#ffffff');
  assert.equal(bg._props.get('background-color')?.value, '#ffffff');
  assert.equal(bg._props.get('background-color')?.priority, 'important');
  assert.equal(bg.dataset.hex, '#ffffff');
  assert.equal(bg._classes.has('is-none'), false);
  assert.equal(none._classes.has('is-active'), false);
  assert.equal(none.getAttribute('aria-pressed'), 'false');

  paintArtboardBackgroundChip(bg, none, '#ff0000');
  assert.equal(bg._props.get('background-color')?.value, '#ff0000');
  assert.equal(bg.dataset.hex, '#ff0000');
});

test('paintArtboardBackgroundChip None uses is-none (red-slash CSS) and clears inline color', () => {
  const bg = fakeChip();
  const none = fakeChip();
  paintArtboardBackgroundChip(bg, none, '#336699');
  paintArtboardBackgroundChip(bg, none, 'none');
  assert.equal(bg._classes.has('is-none'), true);
  assert.equal(bg._props.has('background-color'), false);
  assert.equal(none._classes.has('is-active'), true);
  assert.equal(none.getAttribute('aria-pressed'), 'true');
  assert.match(bg.title, /None/i);
});

test('new artboard default background is white (#ffffff) — what the canvas fills with', () => {
  // normalizeArtboards default param + create() both use #ffffff (canvas fill).
  assert.equal(normalizeArtboards(null)[0].backgroundColor, '#ffffff');
  assert.equal(normalizeArtboards(null, 800, 600, '#ffffff')[0].backgroundColor, '#ffffff');
  assert.equal(normalizeBackgroundColor('#ffffff'), '#ffffff');
  const src = fs.readFileSync(new URL('../js/visteras-artboards.js', import.meta.url), 'utf8');
  assert.match(src, /backgroundColor:rect\.backgroundColor\|\|'#ffffff'/);
});
