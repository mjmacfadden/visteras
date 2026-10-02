const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');

function setup(name = 'selection') {
  const config = { WIDTH: 200, HEIGHT: 160, mouse: {} };
  const app = { GUI: {}, State: { do_action() {} }, Actions: {
    Set_selection_action: class {}, Bundle_action: class {}
  } };
  const context = vm.createContext({ config, app, Base_tools_class: class {},
    document: { createElement: () => createCanvas(1, 1) } });
  const load = (file, symbol) => {
    const source = fs.readFileSync(require.resolve(file), 'utf8')
      .replace(/^import .*;$/gm, '').replace(/var instance = null;/g, '')
      .replace(/export default \w+;/, `globalThis.${symbol} = ${symbol};`);
    vm.runInContext(source, context);
    return context[symbol];
  };
  const Base = load('../src/js/core/base-selection.js', 'Base_selection_class');
  const mask = Object.create(Base.prototype);
  mask.mask_canvas = createCanvas(64, 64);
  mask.mask_ctx = mask.mask_canvas.getContext('2d');
  mask.has_selection = false;
  mask.start_marching_ants = () => {};
  mask.update_mask_state = () => {};
  const Tool = load(`../src/js/tools/${name}.js`, name === 'selection' ? 'Selection_class' : 'Lasso_tool_class');
  const tool = Object.create(Tool.prototype);
  tool.Base_selection = mask;
  tool.get_mouse_info = e => e;
  tool.get_shape = () => name === 'selection' ? 'rectangle' : 'lasso';
  tool.getParams = () => ({ anti_aliasing: false });
  return { tool, mask, config };
}
const point = (x, y, is_drag = true) => ({ x, y, is_drag, click_valid: true });
const alpha = (mask, x, y) => mask.mask_ctx.getImageData(x, y, 1, 1).data[3];

test('marquee commits at release beyond the original 64px mask, matching preview size', () => {
  const { tool, mask } = setup();
  tool.mousedown(point(20, 20));
  tool.mousemove(point(100, 90));
  tool.mouseup(point(150, 120, false));
  assert.equal(mask.mask_canvas.width, 200);
  assert.equal(alpha(mask, 149, 119), 255);
  assert.equal(alpha(mask, 150, 120), 0);
});

test('lasso preserves drawn edges beyond old mask boundaries and includes release point', () => {
  const { tool, mask } = setup('lasso');
  tool.mousedown(point(20, 20));
  tool.mousemove(point(170, 20));
  tool.mousemove(point(170, 130));
  tool.mouseup(point(20, 130, false));
  assert.equal(alpha(mask, 160, 120), 255);
  assert.equal(alpha(mask, 10, 100), 0);
});

test('Space translates an unfinished marquee; releasing Space resumes sizing', () => {
  const { tool, mask } = setup();
  tool.mousedown(point(10, 10));
  tool.mousemove(point(60, 50));
  tool.reposition_selection = true;
  tool.mousemove(point(80, 80));
  assert.equal(tool.selection_coords_from.x, 30);
  assert.equal(tool.selection_coords_from.y, 40);
  tool.reposition_selection = false;
  tool.mouseup(point(100, 100, false));
  assert.equal(alpha(mask, 30, 40), 255);
  assert.equal(alpha(mask, 99, 99), 255);
  assert.equal(alpha(mask, 29, 40), 0);
});

test('Space translates all lasso vertices without adding a connecting stroke', () => {
  const { tool, mask } = setup('lasso');
  tool.mousedown(point(10, 10));
  tool.mousemove(point(60, 10));
  tool.mousemove(point(60, 50));
  tool.reposition_selection = true;
  tool.mousemove(point(80, 80));
  assert.equal(tool.lasso_path.length, 3);
  assert.deepEqual(Array.from(tool.lasso_path[0]), [30, 40]);
  tool.reposition_selection = false;
  tool.mouseup(point(30, 80, false));
  assert.equal(alpha(mask, 40, 60), 255);
  assert.equal(alpha(mask, 20, 20), 0);
});

test('resizing a mask preserves existing selection pixels for compound selections', () => {
  const { mask } = setup();
  mask.mask_ctx.fillStyle = 'white'; mask.mask_ctx.fillRect(4, 4, 10, 10);
  mask.ensure_mask_size();
  assert.equal(alpha(mask, 5, 5), 255);
  mask.apply_shape_to_mask('rectangle', 100, 100, 20, 20, null, 'add');
  assert.equal(alpha(mask, 5, 5), 255);
  assert.equal(alpha(mask, 110, 110), 255);
});

for (const name of ['lasso', 'selection']) {
  test(`${name} move restores the complete selection after dragging outside every canvas edge`, () => {
    const { tool, mask } = setup(name);
    mask.ensure_mask_size();
    mask.mask_ctx.fillStyle = 'white';
    mask.mask_ctx.fillRect(30, 30, 100, 90);
    mask.has_selection = true;
    mask.point_inside_selection = () => true;
    tool.mousedown(point(50, 50));
    // Cross all four edges; even a fully off-canvas intermediate mask must recover.
    for (const [x, y] of [[-300, 50], [400, 50], [50, -300], [50, 400]]) {
      tool.mousemove(point(x, y));
      mask.has_selection = false;
      tool.mousemove(point(50, 50));
      assert.equal(alpha(mask, 30, 30), 255);
      assert.equal(alpha(mask, 129, 119), 255);
    }
    tool.mouseup(point(70, 60, false));
    assert.equal(alpha(mask, 50, 40), 255);
    assert.equal(alpha(mask, 149, 129), 255);
    assert.equal(alpha(mask, 49, 40), 0);
  });
}

test('freehand lasso follows canvas edges during drawing and commits that outline', () => {
  const { tool, mask } = setup('lasso');
  tool.mousedown(point(20, 20));
  for (const [x, y, expected] of [
    [250, 20, [200, 20]], [250, 200, [200, 160]],
    [-30, 200, [0, 160]], [-30, -40, [0, 0]], [40, -40, [40, 0]],
  ]) {
    tool.mousemove(point(x, y));
    assert.deepEqual(Array.from(mask._preview_lasso_path.at(-1)), expected);
  }
  tool.mousemove(point(40, 20));
  const preview = tool.lasso_path.map(p => Array.from(p));
  let committed;
  const apply = mask.apply_shape_to_mask.bind(mask);
  mask.apply_shape_to_mask = (...args) => { committed = args[5].map(p => Array.from(p)); apply(...args); };
  tool.mouseup(point(40, 20, false));
  assert.deepEqual(committed, preview);
});

test('polygonal lasso clamps both the live endpoint and clicked vertices', () => {
  const { tool, mask } = setup('lasso');
  tool.get_shape = () => 'polygonal_lasso';
  tool.mousedown(point(30, 30));
  tool.mousemove(point(250, -10));
  assert.deepEqual(Array.from(mask._preview_lasso_path.at(-1)), [200, 0]);
  tool.mousedown(point(250, -10));
  assert.deepEqual(Array.from(tool.poly_path.at(-1)), [200, 0]);
});

test('Space repositioning keeps unfinished lasso inside canvas without changing its shape', () => {
  const { tool } = setup('lasso');
  tool.mousedown(point(10, 10));
  tool.mousemove(point(60, 10));
  tool.mousemove(point(60, 50));
  tool.reposition_selection = true;
  tool.mousemove(point(400, 400));
  assert.equal(tool.lasso_path.length, 3);
  assert.deepEqual(Array.from(tool.lasso_path[0]), [150, 120]);
  assert.deepEqual(Array.from(tool.lasso_path[2]), [200, 160]);
  tool.mousemove(point(390, 390));
  assert.deepEqual(Array.from(tool.lasso_path[0]), [140, 110]);
});
