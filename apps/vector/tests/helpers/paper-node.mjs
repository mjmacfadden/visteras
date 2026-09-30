/**
 * Load lib/paper-core.min.js in Node for geometry tests (booleans, flatten).
 * Paper expects a browser; this supplies just enough window/document/canvas
 * stubs for a PaperScope with a view. No rendering happens.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let cached = null;
export function loadPaper() {
  if (cached) return cached;
  const src = readFileSync(new URL('../../lib/paper-core.min.js', import.meta.url), 'utf8');
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'canvas' ? {} : () => ({ width: 0, data: [] }))), set: (t, k, v) => { t[k] = v; return true; } });
  class HTMLCanvasElement { constructor() { this.ownerDocument = globalThis.__pdoc; this.parentNode = null; this.style = {}; this.width = 1; this.height = 1; } getContext() { return ctx2d; } setAttribute() {} getAttribute() { return null; } hasAttribute() { return false; } removeAttribute() {} addEventListener() {} removeEventListener() {} getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; } }
  const doc = globalThis.__pdoc = { defaultView: null,  createElement: () => new HTMLCanvasElement(), addEventListener() {}, documentElement: { style: {}, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0 }, head: {}, body: { clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0 } };
  const win = { HTMLCanvasElement, HTMLElement: HTMLCanvasElement, Element: HTMLCanvasElement, navigator: { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36' }, document: doc, addEventListener() {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance: { now: () => Date.now() } };
  win.window = win; doc.defaultView = win; win.getComputedStyle = () => ({ getPropertyValue: () => '' }); win.self = win;
  const ctx = vm.createContext({ ...win, HTMLCanvasElement, window: win, self: win, console, Math, Date, Object, Array });
  const module = { exports: {} };
  ctx.module = module; ctx.exports = module.exports;
  vm.runInContext(src, ctx);
  cached = module.exports.PaperScope ? module.exports : (ctx.paper || win.paper);
  return cached;
}

export function newScope() {
  const paper = loadPaper();
  const s = new paper.PaperScope();
  s.setup(new s.Size(1000, 1000));
  return s;
}
