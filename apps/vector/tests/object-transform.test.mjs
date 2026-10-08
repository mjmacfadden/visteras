// Node may lack DOMMatrix — minimal polyfill for matrix math tests.
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      if (typeof init === 'string') {
        // parse "matrix(a,b,c,d,e,f)" loosely
        const m = init.match(/matrix\(([^)]+)\)/);
        const v = m ? m[1].split(/[,\s]+/).map(Number) : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = v;
      } else if (Array.isArray(init)) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
    }
    multiply(n) {
      const m = this;
      return new DOMMatrix([
        m.a * n.a + m.c * n.b,
        m.b * n.a + m.d * n.b,
        m.a * n.c + m.c * n.d,
        m.b * n.c + m.d * n.d,
        m.a * n.e + m.c * n.f + m.e,
        m.b * n.e + m.d * n.f + m.f,
      ]);
    }
    translate(x, y) { return this.multiply(new DOMMatrix([1, 0, 0, 1, x, y])); }
    inverse() {
      const { a, b, c, d, e, f } = this;
      const k = a * d - b * c;
      return new DOMMatrix([d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k]);
    }
  };
  globalThis.DOMPoint = class DOMPoint {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    matrixTransform(m) {
      return { x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f };
    }
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveDeltaFromFields,
  scaleFactorsFromFields,
  matrixForTransform,
  setLastTransform,
  getLastTransform,
  clearLastTransform,
} from '../js/visteras-object-transform.js';

test('moveDeltaFromFields: rect and polar', () => {
  assert.deepEqual(moveDeltaFromFields({ mode: 'rect', horizontal: 10, vertical: -4 }), { dx: 10, dy: -4 });
  const p = moveDeltaFromFields({ mode: 'polar', distance: 100, angle: 0 });
  assert.ok(Math.abs(p.dx - 100) < 1e-6);
  assert.ok(Math.abs(p.dy) < 1e-6);
  const p90 = moveDeltaFromFields({ mode: 'polar', distance: 100, angle: 90 });
  assert.ok(Math.abs(p90.dx) < 1e-6);
  assert.ok(Math.abs(p90.dy - (-100)) < 1e-6);
});

test('scaleFactorsFromFields: uniform and non-uniform', () => {
  assert.deepEqual(scaleFactorsFromFields({ uniform: true, uniformPct: 200 }), { sx: 2, sy: 2 });
  assert.deepEqual(scaleFactorsFromFields({ uniform: false, scaleXPct: 50, scaleYPct: 150 }), { sx: 0.5, sy: 1.5 });
});

test('matrixForTransform: move / rotate 90 / reflect vertical around origin', () => {
  const origin = { x: 10, y: 20 };
  const move = matrixForTransform({ kind: 'move', dx: 5, dy: -3 }, origin);
  assert.equal(move.e, 5);
  assert.equal(move.f, -3);

  const rot = matrixForTransform({ kind: 'rotate', angle: 90 }, { x: 0, y: 0 });
  // 90° CCW: (1,0) → (0,1)
  const p = new DOMPoint(1, 0).matrixTransform(rot);
  assert.ok(Math.abs(p.x) < 1e-6);
  assert.ok(Math.abs(p.y - 1) < 1e-6);

  const refl = matrixForTransform({ kind: 'reflect', axis: 'vertical' }, { x: 0, y: 0 });
  const q = new DOMPoint(3, 4).matrixTransform(refl);
  assert.ok(Math.abs(q.x - (-3)) < 1e-6);
  assert.ok(Math.abs(q.y - 4) < 1e-6);
});

test('last transform session store', () => {
  clearLastTransform();
  assert.equal(getLastTransform(), null);
  setLastTransform({ kind: 'rotate', angle: 15, copy: true });
  assert.equal(getLastTransform().angle, 15);
  assert.equal(getLastTransform().copy, true);
  clearLastTransform();
});
