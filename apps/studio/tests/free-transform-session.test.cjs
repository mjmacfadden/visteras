const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(require.resolve('../src/js/' + path), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness(layers = [{ id: 1, type: 'image', x: 10, y: 20, width: 100, height: 60 }], tool = 'select') {
 const history = [];
 const config = { layer: layers[0], layers, selected_layer_ids: layers.map(l => l.id), vectors: [], TOOL: { name: tool }, ZOOM: 1 };
 const app = { Layers: { get_layer: id => layers.find(l => l.id === id) }, GUI: { modules: {}, GUI_tools: { tools_modules: {}, show_action_attributes() {}, async activate_tool(name) { await Promise.resolve(); if (transform.is_active()) await transform.commit(); config.TOOL = { name }; } } }, Actions: {}, State: { async do_action(action) { for (const child of action.actions) child.do(); history.push(action); } } };
 app.Actions.Update_layer_action = class { constructor(id, changes) { this.id = id; this.changes = changes; } do() { this.old = { ...app.Layers.get_layer(this.id) }; Object.assign(app.Layers.get_layer(this.id), this.changes); } undo() { const l = app.Layers.get_layer(this.id); for (const key of Object.keys(this.changes)) { if (key in this.old) l[key] = this.old[key]; else delete l[key]; } } };
 app.Actions.Bundle_action = class { constructor(id, name, actions) { this.name = name; this.actions = actions; } };
 const context = vm.createContext({ app, config, document: { getElementById: () => null }, Base_layers_class: class { render() {} }, alertify: { warning() {} }, get_layer_content_bounds: () => null, Subpath: { fromJSON: p => p } });
 const math = read('libs/quad-transform.js').replace(/^export /gm,'') + '\n' + read('libs/free-transform.js').replace(/^import .*;$/gm,'').replace(/^export /gm, '');
 const module = read('modules/edit/transform.js').replace(/^import [\s\S]*?;\n/gm, '').replace('export default class', 'class');
 vm.runInContext(math + '\n' + module + '\nthis.Transform = Transform_edit_class; this.math = {ref_point,local_point,resize_from_drag,transform_layer_geometry,scale_about,rotate_about,skew_from_drag};', context);
 const selectionSource = read('core/base-selection.js').replace(/^import .*;$/gm, '').replace(/export default \w+;/, 'this.Selection = Base_selection_class;');
 vm.runInContext('(function(){' + selectionSource + '}).call(this);', context);
 const selection = Object.create(context.Selection.prototype);
 const transform = new context.Transform(); app.GUI.modules['edit/transform'] = transform;
 transform.render_options_bar = () => {}; transform.sync_options_bar = () => {};
 return { transform, config, app, history, selection, math: context.math, document: context.document };
}

test('menu null argument and asynchronous switch from Brush keep session open', async () => {
 const h = harness(undefined, 'brush');
 await h.transform.free_transform(null);
 assert.equal(h.config.TOOL.name, 'select'); assert.ok(h.transform.is_active()); assert.equal(h.history.length, 0);
});

test('cancel restores absent fields, nested params, and live mask bitmap identity without history', async () => {
 const bitmap = { getContext() {} };
 const layer = { id: 1, type: 'image', x: 10, y: 20, width: 100, height: 60, params: { nested: { n: 1 } }, mask: { x: 10, y: 20, width: 100, height: 60, link: bitmap } };
 const before = { ...layer, params: plain(layer.params), mask: { ...layer.mask } };
 const h = harness([layer]); await h.transform.free_transform();
 h.transform.preview_box({ ...h.transform.session.box, x: 40, width: 200, rotate: 45, skew_x: 20 });
 layer.params.nested.n = 2; h.transform.cancel();
 assert.deepEqual(plain(layer), plain(before)); assert.equal(layer.mask.link, bitmap); assert.equal(h.history.length, 0);
});

test('commit captures pre-preview values in one Free Transform action and undo restores geometry', async () => {
 const h = harness(); const before = plain(h.config.layer);
 await h.transform.free_transform(); h.transform.nudge(20, 30);
 h.transform.preview_box({ ...h.transform.session.box, width: 200, rotate: 45 });
 await h.transform.commit();
 assert.equal(h.history.length, 1); assert.equal(h.history[0].name, 'Free Transform');
 assert.equal(h.config.layer.rotate, 45); assert.equal(h.config.layer.width, 200);
 for (const action of h.history[0].actions) action.undo();
 assert.deepEqual(plain(h.config.layer), before);
});

test('unchanged session creates no history entry', async () => {
 const h = harness(); await h.transform.free_transform(); await h.transform.commit(); assert.equal(h.history.length, 0);
});

test('pointer move previews without history, Alt does not duplicate, and cancel restores', async () => {
 const h = harness(); const before = plain(h.config.layer); await h.transform.free_transform();
 h.transform.pointer_down({ x: 30, y: 30 }, { altKey: true });
 h.transform.pointer_move({ x: 40, y: 50 }, { altKey: true }); h.transform.pointer_up();
 assert.equal(h.config.layer.x, 20); assert.equal(h.config.layer.y, 40); assert.equal(h.config.layers.length, 1); assert.equal(h.history.length, 0);
 h.transform.cancel(); assert.deepEqual(plain(h.config.layer), before);
});

test('rotated skewed corner resize keeps opposite handle fixed; custom pivot remains fixed', () => {
 const { math } = harness(); const box = { x: 10, y: 20, width: 100, height: 60, rotate: 30, skew_x: 15 };
 const start = math.ref_point(box, 'br'); const opposite = math.ref_point(box, 'tl');
 const result = math.resize_from_drag(box, 10, start, { x: start.x + 20, y: start.y + 30 }, true);
 const fixed = math.ref_point(result, 'tl'); assert.ok(Math.hypot(fixed.x-opposite.x, fixed.y-opposite.y) < 1e-8);
 assert.ok(Math.abs(result.width/result.height-box.width/box.height) < 1e-8);
 const pivot = math.ref_point(box, 'c'); const scaled = math.resize_from_drag(box, 10, start, { x:start.x+20,y:start.y+30 }, false, pivot);
 assert.ok(Math.hypot(math.ref_point(scaled).x-pivot.x,math.ref_point(scaled).y-pivot.y) < 1e-8);
});

test('multi-selection affine transform preserves transformed corners for independently rotated layers', () => {
 const { math } = harness(); const from = { x:0,y:0,width:300,height:200 }; const to = { x:10,y:20,width:600,height:100,rotate:30,skew_x:10 };
 const layer = { x:50,y:50,width:40,height:30,rotate:45,skew_x:5 };
 const next = math.transform_layer_geometry(layer,from,to);
 for (const locator of ['tl','tr','bl','br']) {
  const old = math.ref_point(layer,locator); const local = math.local_point(from,old);
  // Map normalized point through destination axes by evaluating a tiny centered box.
  const dx = local.x*2, dy=local.y*0.5; const r=30*Math.PI/180, tx=dx+Math.tan(10*Math.PI/180)*dy;
  const expected={ x:to.x+to.width/2+tx*Math.cos(r)-dy*Math.sin(r), y:to.y+to.height/2+tx*Math.sin(r)+dy*Math.cos(r) };
  const actual=math.ref_point(next,locator); assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-8);
 }
});

test('side skew preserves the opposite side', async () => {
 const h=harness(); await h.transform.free_transform(); const box={...h.transform.session.box}; const start=h.math.ref_point(box,'mr'); const fixed=h.math.ref_point(box,'ml');
 h.transform.pointer_down(start,{metaKey:true}); h.transform.pointer_move({x:start.x,y:start.y+30},{metaKey:true});
 const after=h.math.ref_point(h.transform.session.box,'ml'); assert.ok(Math.hypot(after.x-fixed.x,after.y-fixed.y)<1e-8); assert.ok(h.config.layer.skew_y>0);
});

test('vector resize previews actual path points and cancel restores paths without adding layer fields', async () => {
 const layer={id:1,type:'vector',vector_id:'v',x:10,y:20,width:100,height:60}; const before=plain(layer);
 const h=harness([layer]); const paths=[{anchors:[{point:{x:10,y:20},handle_in:{x:15,y:25},handle_out:null}]}];
 h.config.vectors=[{id:'v',paths:plain(paths)}]; await h.transform.free_transform();
 h.transform.preview_box({...h.transform.session.box,x:20,width:200});
 assert.equal(h.config.vectors[0].paths[0].anchors[0].point.x,20);
 assert.equal(h.config.vectors[0].paths[0].anchors[0].handle_in.x,30);
 h.transform.cancel(); assert.deepEqual(plain(h.config.vectors[0].paths),paths); assert.deepEqual(plain(layer),before);
});

test('no-op pointer preview does not manufacture an undo step for absent skew fields', async () => {
 const h=harness(); await h.transform.free_transform(); h.transform.preview_box({...h.transform.session.box}); await h.transform.commit();
 assert.equal(h.history.length,0);
});

// The legacy selection listener and active tool receive the same document events.
// Exercise the listener before and after the session to cover registration order.
for (const legacyFirst of [true, false]) {
 test(`Command side drag has one geometry owner (legacy first: ${legacyFirst})`, async () => {
  const h = harness(); await h.transform.free_transform();
  let legacyReads = 0;
  h.selection.find_settings = () => { legacyReads++; throw new Error('legacy geometry must not run'); };
  const initial = {...h.transform.session.box};
  const start = h.math.ref_point(initial, 'mr');
  const fixed = h.math.ref_point(initial, 'ml');
  const dispatch = (type, point) => {
   const event = {type, metaKey:true, buttons:type === 'pointerup' ? 0 : 1};
   const session = () => type === 'pointerdown' ? h.transform.pointer_down(point,event) : type === 'pointermove' ? h.transform.pointer_move(point,event) : h.transform.pointer_up();
   if (legacyFirst) h.selection.selected_object_actions(event);
   session();
   if (!legacyFirst) h.selection.selected_object_actions(event);
  };
  dispatch('pointerdown',start); dispatch('pointermove',{x:start.x,y:start.y+30}); dispatch('pointerup',start);
  assert.equal(legacyReads,0); assert.ok(h.config.layer.skew_y>0);
  for (const locator of ['tl','tr','bl','br']) {
   const before=h.math.ref_point(initial,locator), after=h.math.ref_point(h.config.layer,locator);
   assert.ok(Math.abs(after.x-before.x)<1e-8);
   assert.ok(Math.abs(after.y-before.y-(locator.endsWith('r') ? 30 : 0))<(locator.endsWith('r') ? 0.15 : 1e-8)); // skew angles round to 0.1 degrees
  }
  const actual = h.math.ref_point(h.config.layer,'ml');
  assert.ok(Math.hypot(actual.x-fixed.x,actual.y-fixed.y)<1e-8);
  await h.transform.commit(); assert.equal(h.history.length,1);
 });
}

test('rotation around a moved custom pivot maps every layer corner and keeps pivot fixed', async () => {
 const h = harness([{id:1,type:'image',x:100,y:100,width:200,height:120}]);
 await h.transform.free_transform();
 h.selection.find_settings = () => { throw new Error('legacy rotation must not run'); };
 const original = {...h.config.layer}; const center=h.math.ref_point(original);
 const pivot={x:250,y:130};
 h.transform.pointer_down(center,{}); h.transform.pointer_move(pivot,{}); h.transform.pointer_up();
 assert.equal(h.transform.session.locator,null);
 const start={x:320,y:160}; // just beyond the right edge, outside every handle
 const end={x:pivot.x-(start.y-pivot.y),y:pivot.y+(start.x-pivot.x)};
 h.transform.pointer_down(start,{}); assert.equal(h.transform.drag.handle,'rotate');
 h.selection.selected_object_actions({type:'pointermove',buttons:1});
 h.transform.pointer_move(end,{}); h.transform.pointer_up();
 assert.deepEqual(plain(h.transform.session.ref),pivot);
 for(const locator of ['tl','tr','bl','br']) {
  const before=h.math.ref_point(original,locator); const after=h.math.ref_point(h.config.layer,locator);
  assert.ok(Math.hypot(after.x-(pivot.x-(before.y-pivot.y)),after.y-(pivot.y+(before.x-pivot.x)))<1e-8);
 }
 assert.equal(h.config.layer.rotate,90);
 h.transform.cancel(); assert.deepEqual(plain(h.config.layer),plain(original));
});

test('legacy selection resumes after the transform session ends', async () => {
 const h=harness(); await h.transform.free_transform(); h.transform.cancel();
 let reads=0; h.selection.find_settings=()=>{reads++;return null;};
 h.selection.selected_object_actions({type:'pointermove'});
 assert.equal(reads,1);
});

for (const type of ['image','rectangle']) for (const locator of ['tl','tr','bl','br']) for (const axis of ['x','y']) {
 test(`Command ${locator} ${axis}-drag moves one ${type} corner without resizing`, async () => {
  const layer={id:1,type,x:100,y:100,width:200,height:120,rotate:25};
  const h=harness([layer]); await h.transform.free_transform();
  const original={...h.config.layer}; const box={...h.transform.session.box};
  const start=h.math.ref_point(box,locator); const r=25*Math.PI/180;
  const dx=axis==='x' ? 40 : 0,dy=axis==='y' ? 40 : 0;
  const end={x:start.x+dx*Math.cos(r)-dy*Math.sin(r),y:start.y+dx*Math.sin(r)+dy*Math.cos(r)};
  h.transform.pointer_down(start,{metaKey:true});
  // Keep the modifier chosen at press even when later pointer events omit it.
  h.transform.pointer_move(end,{}); h.transform.pointer_up();
  assert.equal(layer.width,200); assert.equal(layer.height,120); assert.equal(layer.rotate,25);
  assert.ok(layer.transform_quad);
  for(const fixed of ['tl','tr','bl','br']) {
   const before=h.math.ref_point(original,fixed),after=h.math.ref_point(layer,fixed);
   const expected=fixed===locator?end:before;
   assert.ok(Math.hypot(expected.x-after.x,expected.y-after.y)<1e-8);
  }
  await h.transform.commit(); assert.equal(h.history.length,1);
  for(const action of h.history[0].actions) action.undo();
  assert.deepEqual(plain(layer),plain(original));
 });
}

test('unmodified corner drag remains proportional resize', async () => {
 const h=harness(); await h.transform.free_transform();
 const start=h.math.ref_point(h.transform.session.box,'br');
 h.transform.pointer_down(start,{}); h.transform.pointer_move({x:start.x+40,y:start.y+24},{});
 assert.ok(h.config.layer.width>100); assert.equal(h.config.layer.skew_x,0); assert.equal(h.config.layer.skew_y,0);
});

test('committed corner transform can reopen, move, and cancel without mutating its saved quad',async()=>{
 const h=harness([{id:1,type:'rectangle',x:100,y:100,width:200,height:120}]);await h.transform.free_transform();
 const start=h.math.ref_point(h.transform.session.box,'br');h.transform.pointer_down(start,{metaKey:true});h.transform.pointer_move({x:start.x+30,y:start.y-20},{});await h.transform.commit();
 const saved=plain(h.config.layer);await h.transform.free_transform();await h.transform.commit();assert.equal(h.history.length,1);
 await h.transform.free_transform();h.transform.nudge(5,10);h.transform.cancel();assert.deepEqual(plain(h.config.layer),saved);
});


test('transform cursors follow rotation and distinguish independent corner skew', async () => {
 const h = harness(); await h.transform.free_transform();
 assert.equal(h.transform.cursor_for_handle(5), 'nwse-resize');
 assert.equal(h.transform.cursor_for_handle(5, { ctrlKey: true }), 'crosshair');
 assert.equal(h.transform.cursor_for_handle(9, { metaKey: true }), 'crosshair');
 assert.equal(h.transform.cursor_for_handle(1, { ctrlKey: true }), 'ew-resize');
 h.transform.session.box.rotate = 90;
 assert.equal(h.transform.cursor_for_handle(1), 'ew-resize');
 assert.equal(h.transform.cursor_for_handle(1, { ctrlKey: true }), 'ns-resize');
 assert.equal(h.transform.cursor_for_handle(5), 'nesw-resize');
});

test('corner cursor updates on modifiers and stays correct throughout a skew drag', async () => {
 const h = harness(); await h.transform.free_transform();
 const wrapper = { style: {} }; h.document.getElementById = id => id === 'main_wrapper' ? wrapper : null;
 const corner = h.math.ref_point(h.transform.session.box, 'tl');
 h.transform.pointer_move(corner, {}); assert.equal(wrapper.style.cursor, 'nwse-resize');
 h.transform.update_cursor({ ctrlKey: true }); assert.equal(wrapper.style.cursor, 'crosshair');
 h.transform.update_cursor({}); assert.equal(wrapper.style.cursor, 'nwse-resize');
 h.transform.pointer_down(corner, { ctrlKey: true }); assert.equal(wrapper.style.cursor, 'crosshair');
 h.transform.pointer_move({ x: corner.x - 20, y: corner.y + 5 }, {});
 assert.equal(wrapper.style.cursor, 'crosshair');
 h.transform.pointer_up(); assert.notEqual(wrapper.style.cursor, 'crosshair');
});


test('cancel clears a transform cursor so it cannot leak into the next tool', async () => {
 const h = harness(); await h.transform.free_transform();
 const wrapper = { style: {} }; h.document.getElementById = id => id === 'main_wrapper' ? wrapper : null;
 h.transform.pointer_move(h.math.ref_point(h.transform.session.box, 'tl'), { ctrlKey: true });
 assert.equal(wrapper.style.cursor, 'crosshair');
 h.transform.cancel(); assert.equal(wrapper.style.cursor, 'default'); assert.equal(h.transform.last_pointer, null);
});

test('Shift+click on a middle handle (no movement) changes nothing and adds no undo step', async () => {
 for (const [name, point] of [['top', { x: 60, y: 20 }], ['left', { x: 10, y: 50 }]]) {
  const layer = { id: 1, type: 'image', x: 10, y: 20, width: 100, height: 60 };
  const before = plain(layer);
  const h = harness([layer]); await h.transform.free_transform();
  h.transform.pointer_down(point, { shiftKey: true });
  assert.equal(typeof h.transform.drag.handle, 'number', name);
  h.transform.pointer_move({ ...point }, { shiftKey: true }); h.transform.pointer_up();
  assert.equal(!!layer.flip_x || !!layer.flip_y, false, name + ': no flip while held');
  await h.transform.commit('Transform');
  assert.deepEqual(plain(layer), before, name); assert.equal(h.history.length, 0, name + ': no undo step');
 }
});

test('Shift+drag of the top handle that stays above the bottom edge resizes without flipping', async () => {
 const layer = { id: 1, type: 'image', x: 10, y: 20, width: 100, height: 60 };
 const h = harness([layer]); await h.transform.free_transform();
 h.transform.pointer_down({ x: 60, y: 20 }, { shiftKey: true });
 h.transform.pointer_move({ x: 60, y: 40 }, { shiftKey: true }); h.transform.pointer_up();
 await h.transform.commit('Transform');
 assert.equal(!!layer.flip_y, false); assert.equal(!!layer.flip_x, false);
 const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≈ ' + b);
 near(layer.y, 40); near(layer.height, 40); near(layer.width, 100);
 assert.equal(h.history.length, 1);
 // Crossing the opposite edge (with or without Shift) is what flips.
 const l2 = { id: 1, type: 'image', x: 10, y: 20, width: 100, height: 60 };
 const h2 = harness([l2]); await h2.transform.free_transform();
 h2.transform.pointer_down({ x: 60, y: 20 }, { shiftKey: true });
 h2.transform.pointer_move({ x: 60, y: 110 }, { shiftKey: true }); h2.transform.pointer_up();
 await h2.transform.commit('Transform');
 assert.equal(l2.flip_y, true); near(l2.y, 80); near(l2.height, 30);
});
