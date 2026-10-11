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
 const math = read('libs/free-transform.js').replace(/^export /gm, '');
 const module = read('modules/edit/transform.js').replace(/^import [\s\S]*?;\n/gm, '').replace('export default class', 'class');
 vm.runInContext(math + '\n' + module + '\nthis.Transform = Transform_edit_class; this.math = {ref_point,local_point,resize_from_drag,transform_layer_geometry,scale_about,rotate_about,skew_from_drag};', context);
 const transform = new context.Transform(); app.GUI.modules['edit/transform'] = transform;
 transform.render_options_bar = () => {}; transform.sync_options_bar = () => {};
 return { transform, config, app, history, math: context.math };
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
