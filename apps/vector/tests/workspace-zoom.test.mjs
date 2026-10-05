import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the viewport listeners independently of the unrelated layer panel.
const source = readFileSync(new URL('../js/visteras-workspace.js', import.meta.url), 'utf8');
function setup() {
  const handlers = {};
  const area = { scrollLeft: 150, scrollTop: 90, clientHeight: 600,
    addEventListener(name, fn) { handlers[name] = fn; } };
  let zoom = 1, originX = 400, originY = 300;
  class Point {
    constructor(x, y) { this.x = x; this.y = y; }
    matrixTransform(m) { return new Point(this.x * m.scale + m.x, this.y * m.scale + m.y); }
  }
  const content = { getScreenCTM() {
    const x = originX - area.scrollLeft, y = originY - area.scrollTop;
    return { scale: zoom, x, y, inverse: () => ({ scale: 1 / zoom, x: -x / zoom, y: -y / zoom }) };
  } };
  const editor = { svgCanvas: {
    getZoom: () => zoom, setZoom: value => { zoom = value; }, getSvgContent: () => content,
    runExtensions() { originX += 17; originY -= 9; }, call() {},
  }, updateCanvas() { originX = 400 * zoom; originY = 300 * zoom; area.scrollLeft = 100; area.scrollTop = 100; },
  configObj: { curConfig: { showRulers: false } } };
  const script = source.slice(0, source.indexOf("  const list =")) + '\n}';
  vm.runInNewContext(script.replace('export ', '') + '\nmountVectorWorkspace(editor);', {
    editor, DOMPoint: Point, document: { getElementById: id => id === 'workarea' ? area : null },
  });
  return {
    emit(name, props = {}) { handlers[name]({ preventDefault() {}, stopImmediatePropagation() {}, ...props }); },
    at(x, y) { return new Point(x, y).matrixTransform(content.getScreenCTM().inverse()); },
    screen(p) { return p.matrixTransform(content.getScreenCTM()); }, area,
  };
}
function anchored(h, p, x, y) {
  const result = h.screen(p);
  assert.ok(Math.abs(result.x - x) < 1e-8);
  assert.ok(Math.abs(result.y - y) < 1e-8);
}
test('trackpad wheel zoom stays under the cursor across zoom and layout updates', () => {
  const h = setup(), p = h.at(720, 420);
  for (const deltaY of [-12, -5, 10, 7]) {
    h.emit('wheel', { ctrlKey: true, deltaY, deltaX: 0, deltaMode: 0, clientX: 720, clientY: 420 });
    anchored(h, p, 720, 420);
  }
});
test('Safari pinch uses the mouse position even when gesture coordinates are zero', () => {
  const h = setup(), p = h.at(720, 420);
  h.emit('pointermove', { clientX: 720, clientY: 420 });
  h.emit('gesturestart', { clientX: 0, clientY: 0 });
  for (const scale of [1.1, 1.5, .8, 1]) {
    h.emit('gesturechange', { scale, clientX: 0, clientY: 0 });
    anchored(h, p, 720, 420);
  }
  h.emit('gestureend');
});
test('ordinary two-finger scrolling continues to pan', () => {
  const h = setup();
  h.emit('wheel', { deltaX: 12, deltaY: 24, deltaMode: 0 });
  assert.equal(h.area.scrollLeft, 162);
  assert.equal(h.area.scrollTop, 114);
});
