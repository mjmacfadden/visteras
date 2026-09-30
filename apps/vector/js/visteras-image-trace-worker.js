/**
 * Visteras Vector — Image Trace worker (module worker).
 *
 * Messages in:
 *   { type: 'init', module: WebAssembly.Module }   compiled once on the main thread
 *   { type: 'trace', id, buffer, width, height, settings, scale }   buffer is transferred
 * Messages out:
 *   { type: 'ready' } | { type: 'init-error', message }
 *   { type: 'result', id, paths, stats, hierarchical, palette, prepMs, traceMs, totalMs }
 *   { type: 'error', id, message }
 *
 * vtracer.js only touches `window` behind a typeof guard, and initVTracer()
 * accepts a precompiled WebAssembly.Module, so no fetch happens in here.
 */
import { initVTracer, convertPixels } from '../lib/vtracer/vtracer.js';
import { runTracePipeline } from './visteras-image-trace-core.js?v=trace-dialog-2';

let ready = null;

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === 'init') {
    ready = initVTracer(msg.module);
    try {
      await ready;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'init-error', message: String(err?.message || err) });
    }
    return;
  }
  if (msg.type === 'trace') {
    const t0 = performance.now();
    try {
      if (!ready) ready = initVTracer();
      await ready;
      const rgba = new Uint8ClampedArray(msg.buffer);
      const res = runTracePipeline(convertPixels, rgba, msg.width, msg.height, msg.settings, { scale: msg.scale });
      self.postMessage({
        type: 'result',
        id: msg.id,
        paths: res.paths,
        stats: res.stats,
        hierarchical: res.hierarchical,
        palette: res.palette,
        prepMs: res.prepMs,
        traceMs: res.traceMs,
        totalMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      self.postMessage({ type: 'error', id: msg.id, message: String(err?.message || err) });
    }
  }
};
