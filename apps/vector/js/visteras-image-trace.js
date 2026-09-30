/**
 * Visteras Vector — Image Trace (Illustrator-style live trace).
 *
 * - Object > Image Trace > Make / Release / Expand, a docked non-modal Image
 *   Trace panel, and Properties-bar controls.
 * - The trace is previewed IN PLACE on the artboard: the source <image> is
 *   hidden while the live result shows, re-tracing (in a Web Worker running
 *   VisionCortex VTracer) after a slider is released.
 * - Live object model:
 *     <g class="visteras-live-trace" data-visteras-trace="1" data-trace-view="…" data-trace-settings='{…}'>
 *       <image data-trace-source="1" display="none" …/>
 *       <g data-trace-result="1" transform="…"> …paths in source-pixel coordinates… </g>
 *     </g>
 * - Make, Expand, Release and committed option edits ("Tracing Options") are
 *   one undo step each; preview re-traces stay out of history.
 *
 * Pure helpers live in visteras-image-trace-core.js (shared with the worker
 * and the Node tests).
 */
import {
  DEFAULT_SETTINGS,
  TRACE_PRESETS,
  TRACE_VIEWS,
  PREVIEW_MAX_PIXELS,
  COMMIT_MAX_PIXELS,
  presetSettings,
  normalizeSettings,
  mapSettingsToVtracer,
  transformSvgPathD,
  groupPathsForExpand,
  traceStats,
  buildTraceOptions,
  tracedataToColorGroups,
  optimizeTracedata,
  compositeOverWhite,
  makeScaleTransformer,
  applyIgnoreWhite,
  snapCurvesToLines,
  isNearWhiteFill,
  optimizeContourSegments,
  pathSampleToD,
  perpDist,
  rdp,
  parseVtracerSvg,
  quantizeMedianCut,
  remapToPalette,
  snapToGrays,
  binarize,
  runTracePipeline,
} from './visteras-image-trace-core.js?v=live-trace-1';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LIVE_CLASS = 'visteras-live-trace';
const WORKER_URL = new URL('./visteras-image-trace-worker.js?v=live-trace-1', import.meta.url);
const WASM_URL = new URL('../lib/vtracer/vtracer_wasm_bg.wasm', import.meta.url);
const DEBOUNCE_MS = 300;
const RESTART_AFTER_MS = 500;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function showToast(message, ms = 4500) {
  let el = document.getElementById('visteras_trace_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_trace_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'max-width:min(460px,90vw)', 'padding:10px 14px',
      'background:#1e1e1e', 'color:#eee', 'border:1px solid #fa7c1b',
      'border-radius:6px', 'font-size:12px', 'line-height:1.4',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.display = 'none';
  }, ms);
}

const now = () => performance.now();

function getImageHref(el, sc) {
  if (!el) return '';
  if (sc && typeof sc.getHref === 'function') {
    try {
      const h = sc.getHref(el);
      if (h) return h;
    } catch (_) { /* ignore */ }
  }
  return (
    el.getAttribute('href') ||
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
    el.getAttribute('xlink:href') ||
    ''
  );
}

function loadImageElement(src, useCors = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image for tracing'));
    if (useCors && !src.startsWith('data:') && !src.startsWith('blob:')) {
      try { img.crossOrigin = 'anonymous'; } catch (_) { /* ignore */ }
    }
    img.src = src;
  });
}

class TraceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const CROSS_ORIGIN_MESSAGE = 'This image comes from another website, so the browser won\'t let Vector read its pixels (cross-origin). Place the image from a file (File > Place…) or paste it, then trace again.';

/**
 * Decode the source. If the CORS request fails we retry without CORS: if that
 * loads, reading pixels throws a SecurityError that is reported in-panel (B9).
 */
async function loadSource(href) {
  try {
    return await loadImageElement(href, true);
  } catch (err) {
    if (href.startsWith('data:') || href.startsWith('blob:')) throw new TraceError('decode', err.message);
    try {
      return await loadImageElement(href, false);
    } catch (_) {
      throw new TraceError('decode', 'Could not load the image for tracing.');
    }
  }
}

/** Draw the source at ≤ maxPixels and read RGBA. */
function readPixels(img, maxPixels) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) throw new TraceError('decode', 'Image has no dimensions');
  const scale = Math.min(1, Math.sqrt(maxPixels / (W * H)));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  let imgd;
  try {
    imgd = ctx.getImageData(0, 0, w, h);
  } catch (err) {
    throw new TraceError('cross-origin', CROSS_ORIGIN_MESSAGE);
  }
  return { rgba: imgd.data, width: w, height: h, scale: w / W, srcW: W, srcH: H };
}

/**
 * Where an <image> renders its bitmap in its own user space
 * (honours x/y/width/height and preserveAspectRatio).
 */
function computeImageLayout(imageEl, srcW, srcH) {
  const attr = (n) => parseFloat(imageEl.getAttribute(n));
  let x = attr('x') || 0;
  let y = attr('y') || 0;
  let destW = attr('width');
  let destH = attr('height');
  if (!(destW > 0) || !(destH > 0)) {
    let bbox = null;
    try { bbox = imageEl.getBBox(); } catch (_) { /* ignore */ }
    if (bbox && bbox.width > 0) {
      x = bbox.x; y = bbox.y; destW = bbox.width; destH = bbox.height;
    } else {
      destW = srcW; destH = srcH;
    }
  }
  const par = (imageEl.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
  let renderX = x, renderY = y, renderW = destW, renderH = destH;
  if (par !== 'none' && srcW > 0 && srcH > 0) {
    const slice = /\bslice\b/.test(par);
    const scale = slice ? Math.max(destW / srcW, destH / srcH) : Math.min(destW / srcW, destH / srcH);
    renderW = srcW * scale;
    renderH = srcH * scale;
    if (par.includes('xMid')) renderX = x + (destW - renderW) / 2;
    else if (par.includes('xMax')) renderX = x + (destW - renderW);
    if (par.includes('YMid')) renderY = y + (destH - renderH) / 2;
    else if (par.includes('YMax')) renderY = y + (destH - renderH);
  }
  return { renderX, renderY, sx: renderW / srcW, sy: renderH / srcH };
}

function makePointTransformer(imageEl, srcW, srcH, roundcoords = 1) {
  const { renderX, renderY, sx, sy } = computeImageLayout(imageEl, srcW, srcH);
  let matrix = null;
  try {
    const tfList = imageEl.transform?.baseVal;
    if (tfList && tfList.numberOfItems > 0) {
      matrix = tfList.consolidate().matrix;
    }
  } catch (_) { /* ignore */ }

  const rnd = (v) => (roundcoords === -1 ? v : +Number(v).toFixed(roundcoords));

  return function transformPoint(px, py) {
    const lx = renderX + px * sx;
    const ly = renderY + py * sy;
    if (matrix) {
      return {
        x: rnd(matrix.a * lx + matrix.c * ly + matrix.e),
        y: rnd(matrix.b * lx + matrix.d * ly + matrix.f),
      };
    }
    return { x: rnd(lx), y: rnd(ly) };
  };
}

// ---------------------------------------------------------------------------
// Trace engine: one module worker, wasm compiled once, stale jobs dropped
// ---------------------------------------------------------------------------

let wasmModulePromise = null;
function compileWasm() {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      try {
        if (typeof WebAssembly.compileStreaming === 'function') {
          return await WebAssembly.compileStreaming(fetch(WASM_URL));
        }
      } catch (_) { /* wrong MIME type etc. — fall through */ }
      const resp = await fetch(WASM_URL);
      if (!resp.ok) throw new Error(`Could not load VTracer (${resp.status})`);
      return WebAssembly.compile(await resp.arrayBuffer());
    })();
    wasmModulePromise.catch(() => { wasmModulePromise = null; });
  }
  return wasmModulePromise;
}

class TraceEngine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.jobSeq = 0;
    this.pending = new Map(); // id → {resolve, reject}
    this.inflight = 0;
    this.busySince = 0;
    this.restarts = 0;
  }

  get busy() {
    return this.pending.size > 0;
  }

  _spawn() {
    const worker = new Worker(WORKER_URL, { type: 'module', name: 'visteras-image-trace' });
    this.worker = worker;
    this.inflight = 0;
    this.ready = (async () => {
      const module = await compileWasm();
      return new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          const m = e.data || {};
          if (m.type === 'ready') {
            worker.onmessage = (ev) => this._onMessage(worker, ev.data);
            resolve();
          } else if (m.type === 'init-error') {
            reject(new Error(m.message));
          }
        };
        worker.onerror = (e) => reject(new Error(e.message || 'Trace worker failed to start'));
        worker.postMessage({ type: 'init', module });
      });
    })();
    this.ready.catch(() => {
      if (this.worker === worker) this._terminate();
    });
    return this.ready;
  }

  _terminate() {
    if (this.worker) {
      try { this.worker.terminate(); } catch (_) { /* ignore */ }
    }
    this.worker = null;
    this.ready = null;
    this.inflight = 0;
  }

  _onMessage(worker, m) {
    if (worker !== this.worker || !m) return;
    if (m.type === 'result' || m.type === 'error') {
      this.inflight = Math.max(0, this.inflight - 1);
      if (this.inflight > 0) this.busySince = now();
      const job = this.pending.get(m.id);
      if (!job) return; // stale — dropped
      this.pending.delete(m.id);
      if (m.type === 'result') job.resolve(m);
      else job.reject(new TraceError('engine', m.message));
    }
  }

  /** Reject every pending job except `keepId`. */
  _supersede(keepId, reason = 'stale') {
    for (const [id, job] of this.pending) {
      if (id === keepId) continue;
      this.pending.delete(id);
      job.reject(new TraceError(reason, reason));
    }
  }

  /**
   * @param {{rgba: Uint8ClampedArray, width: number, height: number, settings: object, scale: number}} job
   *   rgba's buffer is transferred to the worker.
   */
  trace(job) {
    const id = ++this.jobSeq;
    // A job that has been running for > 500 ms is killed rather than waited for.
    if (this.worker && this.inflight > 0 && now() - this.busySince > RESTART_AFTER_MS) {
      this._terminate();
      this.restarts++;
    }
    this._supersede(id);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      (async () => {
        try {
          if (!this.worker) this._spawn();
          await this.ready;
        } catch (err) {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new TraceError('engine-unavailable', err.message || String(err)));
          }
          return;
        }
        if (!this.pending.has(id) || !this.worker) return; // superseded/aborted while starting
        if (this.inflight === 0) this.busySince = now();
        this.inflight++;
        this.worker.postMessage({
          type: 'trace', id, buffer: job.rgba.buffer, width: job.width, height: job.height,
          settings: job.settings, scale: job.scale,
        }, [job.rgba.buffer]);
      })();
    });
  }

  /** Esc: kill the running job. */
  abort() {
    const had = this.pending.size > 0;
    this._supersede(-1, 'aborted');
    if (had) this._terminate();
    return had;
  }

  /** After commit: free the worker (and its wasm memory). */
  dispose() {
    this._supersede(-1, 'aborted');
    this._terminate();
  }
}

/** Main-thread ImageTracer fallback, only used when the VTracer worker can't run. */
function traceWithImageTracer(rgba, width, height, settings, scale) {
  const IT = window.ImageTracer;
  if (!IT) throw new TraceError('engine-unavailable', 'The tracing engine could not start in this browser.');
  compositeOverWhite(rgba);
  const s = normalizeSettings(settings);
  const options = buildTraceOptions(s);
  const td = IT.imagedataToTracedata({ data: rgba, width, height }, options);
  if (options.simplifyTolerance > 0) optimizeTracedata(td, options.simplifyTolerance);
  const groups = tracedataToColorGroups(td, options, { ignoreWhite: s.ignoreWhite });
  const toSource = makeScaleTransformer(1 / scale, 2);
  let paths = [];
  for (const g of groups) for (const p of g.paths) paths.push({ fill: g.fill.toUpperCase(), d: transformSvgPathD(p.d, toSource) });
  if (s.snapCurves) paths = paths.map((p) => ({ fill: p.fill, d: snapCurvesToLines(p.d) }));
  return { paths, stats: traceStats(paths), hierarchical: 'cutout', traceMs: 0, totalMs: 0 };
}

// ---------------------------------------------------------------------------
// Live trace document model
// ---------------------------------------------------------------------------

function isLiveTrace(el) {
  return !!(el && el.nodeType === 1 && el.getAttribute?.('data-visteras-trace') === '1');
}

function liveParts(group) {
  if (!group) return { image: null, result: null };
  let image = null, result = null;
  for (const ch of group.children) {
    if (!image && ch.localName === 'image' && ch.getAttribute('data-trace-source') === '1') image = ch;
    else if (!result && ch.localName === 'g' && ch.getAttribute('data-trace-result') === '1') result = ch;
  }
  return { image, result };
}

function readSettings(group) {
  try {
    return normalizeSettings(JSON.parse(group.getAttribute('data-trace-settings') || '{}'));
  } catch (_) {
    return normalizeSettings({});
  }
}

function settingsJson(settings) {
  const s = normalizeSettings(settings);
  delete s.view;
  return JSON.stringify(s);
}

function readView(group) {
  const v = group?.getAttribute('data-trace-view');
  return TRACE_VIEWS.some((x) => x.id === v) ? v : 'result';
}

/**
 * Apply a View. Visibility is written as attributes (so export matches the
 * canvas); outline styling is editor-only CSS keyed on data-trace-view.
 */
function applyView(group, view = readView(group)) {
  const { image, result } = liveParts(group);
  group.setAttribute('data-trace-view', view);
  const showSource = view === 'source' || view === 'outlines-source';
  const showResult = view !== 'source';
  if (image) {
    if (showSource) image.removeAttribute('display');
    else image.setAttribute('display', 'none');
  }
  if (result) {
    if (showResult) result.removeAttribute('display');
    else result.setAttribute('display', 'none');
  }
}

/** Eye button: show the source while held (inline style only — not saved, not in history). */
function setPeek(group, on) {
  const { image, result } = liveParts(group);
  if (on) {
    group.setAttribute('data-trace-peek', '1');
    if (image) image.style.display = 'inline';
    if (result) result.style.display = 'none';
  } else {
    group.removeAttribute('data-trace-peek');
    if (image) image.style.removeProperty('display');
    if (result) result.style.removeProperty('display');
  }
}

function layoutTransform(image, srcW, srcH) {
  const { renderX, renderY, sx, sy } = computeImageLayout(image, srcW, srcH);
  const own = image.getAttribute('transform');
  const m = `matrix(${+sx.toFixed(8)} 0 0 ${+sy.toFixed(8)} ${+renderX.toFixed(4)} ${+renderY.toFixed(4)})`;
  return own ? `${own} ${m}` : m;
}

/** Build a <g data-trace-result> for paths in source-pixel coordinates. */
function buildResultGroup(sc, image, srcW, srcH, paths, hierarchical, template = null) {
  const g = template ? template.cloneNode(false) : document.createElementNS(SVG_NS, 'g');
  g.setAttribute('id', sc.getNextId());
  g.setAttribute('data-trace-result', '1');
  g.setAttribute('data-trace-width', String(srcW));
  g.setAttribute('data-trace-height', String(srcH));
  g.setAttribute('data-trace-hierarchical', hierarchical || 'cutout');
  g.setAttribute('transform', layoutTransform(image, srcW, srcH));
  g.removeAttribute('display');
  g.style.removeProperty('display');
  // Bounds keep the live object's box equal to the image, like Illustrator.
  const bounds = document.createElementNS(SVG_NS, 'rect');
  bounds.setAttribute('data-trace-bounds', '1');
  bounds.setAttribute('x', '0');
  bounds.setAttribute('y', '0');
  bounds.setAttribute('width', String(srcW));
  bounds.setAttribute('height', String(srcH));
  bounds.setAttribute('fill', 'none');
  bounds.setAttribute('stroke', 'none');
  bounds.setAttribute('pointer-events', 'none');
  g.appendChild(bounds);
  const frag = document.createDocumentFragment();
  for (const p of paths) {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', p.d);
    el.setAttribute('fill', p.fill);
    el.setAttribute('fill-rule', 'evenodd');
    el.setAttribute('stroke', 'none');
    frag.appendChild(el);
  }
  g.appendChild(frag);
  return g;
}

function resultPaths(result) {
  if (!result) return [];
  return [...result.children]
    .filter((el) => el.localName === 'path')
    .map((el) => ({ d: el.getAttribute('d') || '', fill: el.getAttribute('fill') || '#000000' }));
}

function consolidatedMatrix(el) {
  const svg = el.ownerSVGElement || document.querySelector('svg');
  try {
    const list = el.transform?.baseVal;
    if (list && list.numberOfItems > 0) return list.consolidate().matrix;
  } catch (_) { /* ignore */ }
  return svg.createSVGMatrix();
}

function combinedTransformAttr(...els) {
  return els.map((el) => el?.getAttribute('transform')).filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Controller state
// ---------------------------------------------------------------------------

const ctl = {
  svgEditor: null,
  sc: null,
  engine: new TraceEngine(),
  panel: null,
  session: null,
  settings: presetSettings('default'), // panel state (last used)
  debounce: 0,
  overlay: null,
  overlayRaf: 0,
  timings: [],
};

function sc() {
  return ctl.sc;
}

function selectedElements() {
  try {
    return (sc().getSelectedElements?.() || []).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/** The single selected raster image (not a live source), or null. */
function selectedImage() {
  const sel = selectedElements();
  if (sel.length !== 1) return null;
  const el = sel[0];
  if (el.localName === 'image' && !el.closest('[data-visteras-trace]')) return el;
  return null;
}

function selectedLiveTrace() {
  const sel = selectedElements();
  if (sel.length !== 1) return null;
  const el = sel[0];
  if (isLiveTrace(el)) return el;
  return el.closest?.('[data-visteras-trace="1"]') || null;
}

function refreshUi() {
  try { ctl.svgEditor.topPanel?.updateContextPanel?.(); } catch (_) { /* ignore */ }
  try { window.__updatePropertiesVisibility?.(); } catch (_) { /* ignore */ }
  syncPanel();
  syncPropsControls();
}

function selectOnly(el) {
  // Our own re-selection must not look like "the user clicked away"
  // (that would commit the pending preview into history).
  ctl.selecting = true;
  try {
    sc().clearSelection();
    sc().addToSelection([el], true);
    sc().call?.('changed', [el]);
  } catch (_) { /* ignore */ } finally {
    ctl.selecting = false;
  }
}

// ---- Sessions ----------------------------------------------------------------
//
// A session is the in-progress edit of one target:
//   kind 'image': a raster image traced for the first time. The live group is
//                 created on the first preview (not in history);
//                 commit = "Make Image Trace", cancel restores the image.
//   kind 'live' : an existing live trace whose options are being edited.
//                 commit = "Tracing Options", cancel restores the old result.

function baseSession() {
  return {
    src: null, // {img, srcW, srcH}
    previewPixels: null,
    lastResult: null,
    stats: null,
    dirty: false,
    busy: false,
    status: null,
    error: null,
    warning: null,
  };
}

function newImageSession(image, settings) {
  return {
    ...baseSession(),
    kind: 'image',
    image,
    group: null,
    settings: normalizeSettings(settings),
    view: 'result',
    orig: null,
  };
}

function newLiveSession(group) {
  const { image, result } = liveParts(group);
  return {
    ...baseSession(),
    kind: 'live',
    image,
    group,
    settings: readSettings(group),
    view: readView(group),
    origResult: result,
    origSettingsJson: group.getAttribute('data-trace-settings') || settingsJson(readSettings(group)),
  };
}

async function ensureSource(session) {
  if (session.src) return session.src;
  const href = getImageHref(session.image, sc());
  if (!href) throw new TraceError('decode', 'The selected image has no image data to trace.');
  const img = await loadSource(href);
  session.src = { img, srcW: img.naturalWidth || img.width, srcH: img.naturalHeight || img.height };
  return session.src;
}

/** Image session: wrap the image in a (not-yet-historic) live group. */
function beginLiveGroup(session) {
  if (session.group) return session.group;
  const image = session.image;
  const parent = image.parentNode;
  session.orig = {
    parent,
    next: image.nextSibling,
    transform: image.getAttribute('transform'),
    display: image.getAttribute('display'),
  };
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('id', sc().getNextId());
  g.setAttribute('class', LIVE_CLASS);
  g.setAttribute('data-visteras-trace', '1');
  g.setAttribute('data-name', 'Image Tracing');
  g.setAttribute('data-trace-view', session.view || 'result');
  g.setAttribute('data-trace-settings', settingsJson(session.settings));
  if (session.orig.transform) g.setAttribute('transform', session.orig.transform);
  parent.insertBefore(g, image);
  image.removeAttribute('transform');
  image.setAttribute('data-trace-source', '1');
  g.appendChild(image);
  session.group = g;
  return g;
}

/** Cancel: put the image back exactly as it was. */
function endLiveGroup(session) {
  const { group, image, orig } = session;
  if (!group || !orig) return;
  const nextOk = orig.next && orig.next.parentNode === orig.parent ? orig.next : null;
  orig.parent.insertBefore(image, nextOk);
  if (orig.transform) image.setAttribute('transform', orig.transform);
  else image.removeAttribute('transform');
  if (orig.display) image.setAttribute('display', orig.display);
  else image.removeAttribute('display');
  image.removeAttribute('data-trace-source');
  image.style.removeProperty('display');
  group.remove();
  session.group = null;
}

/** Swap the result group shown in a session's live group (no history). */
function showResult(session, result) {
  const { group } = session;
  const { result: current } = liveParts(group);
  if (current) group.replaceChild(result, current);
  else group.appendChild(result);
  applyView(group, session.view);
}

function preparePixels(session, maxPixels) {
  const { img } = session.src;
  if (maxPixels === PREVIEW_MAX_PIXELS && session.previewPixels) {
    const p = session.previewPixels;
    return { ...p, rgba: new Uint8ClampedArray(p.rgba) };
  }
  const px = readPixels(img, maxPixels);
  if (maxPixels === PREVIEW_MAX_PIXELS) {
    session.previewPixels = { ...px, rgba: new Uint8ClampedArray(px.rgba) };
  }
  return px;
}

async function runTrace(session, { full = false } = {}) {
  const src = await ensureSource(session);
  const limit = full ? COMMIT_MAX_PIXELS : PREVIEW_MAX_PIXELS;
  const px = preparePixels(session, limit);
  const settings = normalizeSettings(session.settings);
  const t0 = now();
  let res;
  try {
    res = await ctl.engine.trace({ rgba: px.rgba, width: px.width, height: px.height, settings, scale: px.scale });
  } catch (err) {
    if (err.code === 'engine-unavailable' && window.ImageTracer) {
      const again = readPixels(src.img, limit);
      res = traceWithImageTracer(again.rgba, again.width, again.height, settings, again.scale);
    } else {
      throw err;
    }
  }
  const ms = Math.round(now() - t0);
  ctl.timings.push({
    kind: full ? 'commit' : 'preview',
    ms,
    workerMs: res.totalMs,
    traceMs: res.traceMs,
    width: px.width,
    height: px.height,
    srcW: src.srcW,
    srcH: src.srcH,
    paths: res.stats?.paths,
  });
  if (ctl.timings.length > 50) ctl.timings.shift();
  return {
    paths: res.paths,
    stats: res.stats,
    hierarchical: res.hierarchical,
    scale: px.scale,
    key: settingsJson(settings),
    srcW: src.srcW,
    srcH: src.srcH,
    megapixels: (src.srcW * src.srcH) / 1e6,
    ms,
  };
}

function setBusy(session, busy) {
  session.busy = busy;
  if (busy) showOverlay();
  else hideOverlay();
  syncPanel();
}

function noteTraceError(session, err) {
  if (err && err.code === 'aborted') {
    session.error = null;
    session.status = 'Tracing cancelled';
    return;
  }
  console.warn('[image-trace]', err);
  session.error = err?.message || String(err);
}

/** Preview re-trace (only while Preview is checked). Out of history. */
async function requestPreview() {
  const session = ctl.session;
  if (!session || !previewEnabled()) return;
  session.error = null;
  session.status = null;
  setBusy(session, true);
  try {
    await ensureSource(session);
    const res = await runTrace(session, { full: false });
    if (ctl.session !== session) return;
    if (session.kind === 'image') beginLiveGroup(session);
    const template = liveParts(session.group).result || session.origResult;
    const result = buildResultGroup(sc(), session.image, res.srcW, res.srcH, res.paths, res.hierarchical, template);
    session.group.setAttribute('data-trace-settings', settingsJson(session.settings));
    showResult(session, result);
    session.lastResult = res;
    session.stats = res.stats;
    session.dirty = true;
    session.status = `Preview · ${res.ms} ms${res.scale < 1 ? ` · ${Math.round(res.scale * 100)}% resolution` : ''}`;
    setBusy(session, false);
    selectOnly(session.group);
    refreshUi();
  } catch (err) {
    if (ctl.session !== session) return;
    if (err?.code === 'stale') return; // the newer job owns the busy state
    noteTraceError(session, err);
    setBusy(session, false);
    // Esc before the first result of a new trace: nothing to keep → restore.
    if (err?.code === 'aborted' && session.kind === 'image' && !session.lastResult) cancelSession();
    syncPanel();
  }
}

/**
 * Commit the session: full-resolution trace (≤ 8 MP) if the preview was
 * downscaled or is out of date, then ONE history step.
 */
async function commitSession({ select = true } = {}) {
  const session = ctl.session;
  if (!session) return null;
  session.error = null;
  let res = session.lastResult;
  const key = settingsJson(session.settings);
  try {
    if (!res || res.scale < 1 || res.key !== key) {
      setBusy(session, true);
      await ensureSource(session);
      res = await runTrace(session, { full: true });
      if (ctl.session !== session) return null;
    }
  } catch (err) {
    if (ctl.session !== session) return null;
    if (err?.code === 'stale') return null;
    noteTraceError(session, err);
    setBusy(session, false);
    if (err?.code === 'aborted' && session.kind === 'image' && !session.lastResult) cancelSession();
    syncPanel();
    return null;
  }
  const warning = res.scale < 1
    ? `This image is ${res.megapixels.toFixed(1)} MP; it was traced at ${(res.megapixels * res.scale * res.scale).toFixed(1)} MP (the 8 MP limit).`
    : null;
  setBusy(session, false);
  const canvas = sc();
  const { BatchCommand, ChangeElementCommand, MoveElementCommand, InsertElementCommand } = canvas.history;
  let group;
  if (session.kind === 'image') {
    const hadGroup = !!session.group;
    group = beginLiveGroup(session);
    const template = hadGroup ? liveParts(group).result : null;
    const result = buildResultGroup(canvas, session.image, res.srcW, res.srcH, res.paths, res.hierarchical, template);
    group.setAttribute('data-trace-settings', settingsJson(session.settings));
    showResult(session, result);
    const { image, orig } = session;
    // Make Image Trace = [image attrs, image → live group, insert live group]
    const batch = new BatchCommand('Make Image Trace');
    batch.addSubCommand(new ChangeElementCommand(image, {
      transform: orig.transform, display: orig.display, 'data-trace-source': null,
    }, 'Image Trace source'));
    batch.addSubCommand(new MoveElementCommand(image, orig.next && orig.next.parentNode === orig.parent ? orig.next : null, orig.parent));
    batch.addSubCommand(new InsertElementCommand(group));
    canvas.undoMgr.addCommandToHistory(batch);
  } else {
    group = session.group;
    const template = liveParts(group).result || session.origResult;
    const newResult = buildResultGroup(canvas, session.image, res.srcW, res.srcH, res.paths, res.hierarchical, template);
    const newJson = settingsJson(session.settings);
    showResult(session, newResult);
    group.setAttribute('data-trace-settings', newJson);
    const batch = new BatchCommand('Tracing Options');
    batch.addSubCommand(makeSwapResultCommand(canvas, group, session.origResult, newResult, session.origSettingsJson, newJson));
    canvas.undoMgr.addCommandToHistory(batch);
  }
  ctl.engine.dispose(); // terminate the worker after commit
  ctl.settings = normalizeSettings(session.settings);
  // Keep editing the (now committed) live object.
  const next = newLiveSession(group);
  next.stats = res.stats;
  next.status = `Traced · ${res.ms} ms`;
  next.warning = warning;
  next.src = session.src;
  next.previewPixels = session.previewPixels;
  ctl.session = next;
  if (select) selectOnly(group);
  refreshUi();
  return group;
}

/** Custom history command: swap one result group for another + the settings JSON. */
function makeSwapResultCommand(canvas, group, oldResult, newResult, oldJson, newJson) {
  const Base = canvas.history.Command;
  const swap = (from, to, json) => {
    if (from && from.parentNode === group) group.replaceChild(to, from);
    else if (!to.parentNode) group.appendChild(to);
    group.setAttribute('data-trace-settings', json);
    applyView(group);
  };
  class SwapTraceResultCommand extends Base {
    constructor() {
      super();
      this.elem = group;
      this.text = 'Tracing Options';
    }
    type() { return 'SwapTraceResultCommand'; }
    apply(handler) { super.apply(handler, () => swap(oldResult, newResult, newJson)); }
    unapply(handler) { super.unapply(handler, () => swap(newResult, oldResult, oldJson)); }
    elements() { return [group]; }
  }
  return new SwapTraceResultCommand();
}

/** Cancel restores the source (image session) or the last committed result (live). */
function cancelSession() {
  const session = ctl.session;
  if (!session) return;
  clearTimeout(ctl.debounce);
  ctl.engine.abort();
  hideOverlay();
  if (session.kind === 'image') {
    const image = session.image;
    endLiveGroup(session);
    ctl.session = newImageSession(image, session.settings);
    ctl.session.src = session.src;
    ctl.session.previewPixels = session.previewPixels;
    ctl.session.status = 'Cancelled';
    if (image.isConnected) selectOnly(image);
  } else {
    const { group, origResult, origSettingsJson } = session;
    const { result } = liveParts(group);
    if (result && origResult && result !== origResult) group.replaceChild(origResult, result);
    group.setAttribute('data-trace-settings', origSettingsJson);
    applyView(group, session.view);
    ctl.session = newLiveSession(group);
    ctl.session.status = 'Cancelled';
  }
  if (ctl.panel) writeControls(ctl.session.settings, ctl.session.view);
  refreshUi();
}

// ---------------------------------------------------------------------------
// Make / Expand / Release (menu, Properties bar)
// ---------------------------------------------------------------------------

async function settlePending() {
  const s = ctl.session;
  if (!s) return;
  if (s.dirty) await commitSession({ select: false });
  else if (s.busy) cancelSession();
}

async function makeTrace(image = selectedImage(), presetId = null) {
  if (!image) {
    showToast('Select a single raster image, then choose Object > Image Trace > Make.');
    return null;
  }
  await settlePending();
  const settings = presetId ? presetSettings(presetId) : normalizeSettings(ctl.settings);
  ctl.session = newImageSession(image, settings);
  if (ctl.panel) writeControls(settings, 'result');
  syncPanel();
  return commitSession();
}

async function applyPresetToLive(group, presetId) {
  await settlePending();
  ctl.session = newLiveSession(group);
  ctl.session.settings = presetSettings(presetId);
  if (ctl.panel) writeControls(ctl.session.settings, ctl.session.view);
  return commitSession();
}

async function expandTrace(group = selectedLiveTrace()) {
  if (!group) {
    showToast('Select a live Image Trace object to expand.');
    return null;
  }
  if (ctl.session?.group === group) {
    if (ctl.session.dirty) await commitSession({ select: false });
    else if (ctl.session.busy) cancelSession();
  }
  const canvas = sc();
  const { result } = liveParts(group);
  const hierarchical = result?.getAttribute('data-trace-hierarchical') || 'cutout';
  const gm = consolidatedMatrix(group);
  const m = result ? gm.multiply(consolidatedMatrix(result)) : gm;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const tp = (x, y) => ({ x: r3(m.a * x + m.c * y + m.e), y: r3(m.b * x + m.d * y + m.f) });
  const paths = resultPaths(result).map((p) => ({ fill: p.fill, d: transformSvgPathD(p.d, tp) }));
  const out = document.createElementNS(SVG_NS, 'g');
  out.setAttribute('id', canvas.getNextId());
  out.setAttribute('data-name', 'Image Trace');
  for (const cg of groupPathsForExpand(paths, hierarchical)) {
    const sub = document.createElementNS(SVG_NS, 'g');
    sub.setAttribute('id', canvas.getNextId());
    sub.setAttribute('data-name', cg.fill);
    for (const p of cg.paths) {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('id', canvas.getNextId());
      el.setAttribute('d', p.d);
      el.setAttribute('fill', p.fill);
      el.setAttribute('fill-rule', 'evenodd');
      el.setAttribute('stroke', 'none');
      sub.appendChild(el);
    }
    out.appendChild(sub);
  }
  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = canvas.history;
  const batch = new BatchCommand('Expand Image Trace');
  const parent = group.parentNode;
  parent.insertBefore(out, group);
  batch.addSubCommand(new InsertElementCommand(out));
  const next = group.nextSibling;
  group.remove();
  batch.addSubCommand(new RemoveElementCommand(group, next, parent));
  canvas.undoMgr.addCommandToHistory(batch);
  ctl.session = null;
  ctl.engine.dispose();
  selectOnly(out);
  refreshUi();
  return out;
}

async function releaseTrace(group = selectedLiveTrace()) {
  if (!group) {
    showToast('Select a live Image Trace object to release.');
    return null;
  }
  if (ctl.session?.group === group && (ctl.session.dirty || ctl.session.busy)) cancelSession();
  const canvas = sc();
  const { image } = liveParts(group);
  if (!image) return null;
  const { BatchCommand, ChangeElementCommand, MoveElementCommand, RemoveElementCommand } = canvas.history;
  const batch = new BatchCommand('Release Image Trace');
  const old = {
    transform: image.getAttribute('transform'),
    display: image.getAttribute('display'),
    'data-trace-source': image.getAttribute('data-trace-source'),
  };
  const t = combinedTransformAttr(group, image);
  if (t) image.setAttribute('transform', t);
  else image.removeAttribute('transform');
  image.removeAttribute('display');
  image.removeAttribute('data-trace-source');
  image.style.removeProperty('display');
  batch.addSubCommand(new ChangeElementCommand(image, old, 'Image Trace source'));
  const oldNext = image.nextSibling;
  const parent = group.parentNode;
  parent.insertBefore(image, group);
  batch.addSubCommand(new MoveElementCommand(image, oldNext, group));
  const next = group.nextSibling;
  group.remove();
  batch.addSubCommand(new RemoveElementCommand(group, next, parent));
  canvas.undoMgr.addCommandToHistory(batch);
  ctl.session = null;
  ctl.engine.dispose();
  selectOnly(image);
  refreshUi();
  return image;
}

// ---------------------------------------------------------------------------
// "Tracing…" overlay on the artboard
// ---------------------------------------------------------------------------

function overlayTarget(session) {
  if (!session) return null;
  if (session.group?.isConnected) return session.group;
  return session.image?.isConnected ? session.image : null;
}

function showOverlay() {
  if (!ctl.overlay) {
    const el = document.createElement('div');
    el.id = 'visteras_trace_overlay';
    el.className = 'vit-overlay';
    el.innerHTML = '<div class="vit-spinner"></div><div class="vit-overlay-label">Tracing…</div>';
    document.body.appendChild(el);
    ctl.overlay = el;
  }
  const tick = () => {
    const target = overlayTarget(ctl.session);
    if (!target || !ctl.session?.busy) { hideOverlay(); return; }
    const r = target.getBoundingClientRect();
    const o = ctl.overlay;
    if (r.width > 0 && r.height > 0) {
      o.style.display = 'flex';
      o.style.left = `${r.left}px`;
      o.style.top = `${r.top}px`;
      o.style.width = `${r.width}px`;
      o.style.height = `${r.height}px`;
    }
    ctl.overlayRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(ctl.overlayRaf);
  tick();
}

function hideOverlay() {
  cancelAnimationFrame(ctl.overlayRaf);
  if (ctl.overlay) ctl.overlay.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Docked Image Trace panel
// ---------------------------------------------------------------------------

// Eye icon: Studio's visibility eye (raw-develop panel eye), per "shared tools use Studio's icon".
const EYE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const PANEL_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M6 17c2.5-6 4.5-9 6-9s2 3 3.5 3S18 9 18 9"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/></svg>';

function presetOptionsHtml(selected, withCustom = true) {
  const opts = Object.entries(TRACE_PRESETS).map(([id, p]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${p.label}</option>`);
  if (withCustom) opts.push(`<option value="custom"${selected === 'custom' ? ' selected' : ''}>Custom</option>`);
  return opts.join('');
}

function viewOptionsHtml(selected) {
  return TRACE_VIEWS.map((v) => `<option value="${v.id}"${v.id === selected ? ' selected' : ''}>${v.label}</option>`).join('');
}

const $ = (id) => document.getElementById(id);

function ensurePanel() {
  if (ctl.panel && ctl.panel.isConnected) return ctl.panel;
  const panel = document.createElement('div');
  panel.id = 'image_trace_panel';
  panel.className = 'sidebar_block vit-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="sidebar_block_header vit-header">
      <span class="sidebar_block_title">Image Trace</span>
      <button type="button" class="vit-close" id="vit_close" title="Close panel" aria-label="Close Image Trace panel">×</button>
    </div>
    <div class="sidebar_block_content vit-body">
      <div class="vit-row"><label for="vit_preset">Preset</label>
        <select id="vit_preset">${presetOptionsHtml('default')}</select></div>
      <div class="vit-row"><label for="vit_view">View</label>
        <select id="vit_view">${viewOptionsHtml('result')}</select>
        <button type="button" class="vit-eye" id="vit_eye" title="Press and hold to view the source image" aria-label="Hold to view source image">${EYE_ICON}</button></div>
      <div class="vit-row"><label for="vit_mode">Mode</label>
        <select id="vit_mode">
          <option value="color">Color</option>
          <option value="grayscale">Grayscale</option>
          <option value="bw">Black and White</option>
        </select></div>
      <div class="vit-row" data-show="color"><label for="vit_palette">Palette</label>
        <select id="vit_palette">
          <option value="automatic">Automatic</option>
          <option value="limited">Limited</option>
          <option value="fulltone">Full Tone</option>
        </select></div>
      <div class="vit-slider" data-show="color-limited"><div class="vit-slider-head"><span>Colors</span><span id="vit_colors_val">6</span></div>
        <input type="range" id="vit_colors" min="2" max="30" step="1" value="6"></div>
      <div class="vit-slider" data-show="color-fulltone"><div class="vit-slider-head"><span>Colors</span><span id="vit_fulltone_val">50%</span></div>
        <input type="range" id="vit_fulltone" min="0" max="100" step="1" value="50"></div>
      <div class="vit-slider" data-show="bw"><div class="vit-slider-head"><span>Threshold</span><span id="vit_threshold_val">128</span></div>
        <input type="range" id="vit_threshold" min="0" max="255" step="1" value="128"></div>
      <details class="vit-advanced" id="vit_advanced">
        <summary>Advanced</summary>
        <div class="vit-slider"><div class="vit-slider-head"><span>Paths</span><span id="vit_paths_val">50%</span></div>
          <input type="range" id="vit_paths" min="0" max="100" step="1" value="50"></div>
        <div class="vit-slider"><div class="vit-slider-head"><span>Corners</span><span id="vit_corners_val">75%</span></div>
          <input type="range" id="vit_corners" min="0" max="100" step="1" value="75"></div>
        <div class="vit-slider"><div class="vit-slider-head"><span>Noise</span><span id="vit_noise_val">25 px</span></div>
          <input type="range" id="vit_noise" min="1" max="100" step="1" value="25"></div>
        <div class="vit-row"><label>Method</label>
          <div class="vit-seg" role="radiogroup" aria-label="Method">
            <label title="Abutting: paths are cut out of each other"><input type="radio" name="vit_method" value="abutting" checked> Abutting</label>
            <label title="Overlapping: paths are stacked"><input type="radio" name="vit_method" value="overlapping"> Overlapping</label>
          </div></div>
        <div class="vit-row"><label>Create</label>
          <div class="vit-checks">
            <label><input type="checkbox" id="vit_fills" checked disabled> Fills</label>
            <label title="Strokes are not available yet"><input type="checkbox" id="vit_strokes" disabled> Strokes</label>
          </div></div>
        <div class="vit-row vit-row-top"><label>Options</label>
          <div class="vit-checks vit-checks-col">
            <label><input type="checkbox" id="vit_snap"> Snap Curves To Lines</label>
            <label title="Removes white areas (Abutting method)"><input type="checkbox" id="vit_ignore_white"> Ignore White</label>
          </div></div>
      </details>
      <div class="vit-info" id="vit_info">
        <div class="vit-info-row"><span>Paths:</span><b id="vit_info_paths">–</b><span>Colors:</span><b id="vit_info_colors">–</b></div>
        <div class="vit-info-row"><span>Anchors:</span><b id="vit_info_anchors">–</b></div>
        <div class="vit-status" id="vit_status"></div>
        <div class="vit-warning" id="vit_warning" role="status"></div>
        <div class="vit-error" id="vit_error" role="alert"></div>
      </div>
      <div class="vit-footer">
        <label class="vit-preview"><input type="checkbox" id="vit_preview" checked> Preview</label>
        <div class="vit-buttons">
          <button type="button" id="vit_cancel" class="vit-btn">Cancel</button>
          <button type="button" id="vit_trace" class="vit-btn vit-btn-primary">Trace</button>
        </div>
      </div>
    </div>`;
  const props = document.getElementById('properties_panel');
  const host = document.getElementById('sidepanel_content');
  if (props && props.parentNode) props.parentNode.insertBefore(panel, props.nextSibling);
  else if (host) host.prepend(panel);
  else document.body.appendChild(panel);
  ctl.panel = panel;
  wirePanel(panel);
  return panel;
}

function previewEnabled() {
  const cb = $('vit_preview');
  return !cb || cb.checked;
}

function panelOpen() {
  return !!(ctl.panel && ctl.panel.style.display !== 'none');
}

function writeControls(s, view) {
  if (!ctl.panel) return;
  const set = (id, v) => { const el = $(id); if (el) el.value = String(v); };
  set('vit_preset', TRACE_PRESETS[s.preset] ? s.preset : 'custom');
  set('vit_view', view || 'result');
  set('vit_mode', s.mode);
  set('vit_palette', s.palette);
  set('vit_colors', s.colors);
  set('vit_fulltone', s.fullTone);
  set('vit_threshold', s.threshold);
  set('vit_paths', s.paths);
  set('vit_corners', s.corners);
  set('vit_noise', s.noise);
  ctl.panel.querySelectorAll('input[name="vit_method"]').forEach((r) => { r.checked = r.value === s.method; });
  $('vit_snap').checked = !!s.snapCurves;
  $('vit_ignore_white').checked = !!s.ignoreWhite;
  updateLabels();
  updateVisibility();
}

function readControls() {
  const v = (id) => $(id)?.value;
  const method = ctl.panel.querySelector('input[name="vit_method"]:checked')?.value || 'abutting';
  return normalizeSettings({
    preset: v('vit_preset'),
    mode: v('vit_mode'),
    palette: v('vit_palette'),
    colors: +v('vit_colors'),
    fullTone: +v('vit_fulltone'),
    grays: ctl.session?.settings?.grays ?? DEFAULT_SETTINGS.grays,
    threshold: +v('vit_threshold'),
    paths: +v('vit_paths'),
    corners: +v('vit_corners'),
    noise: +v('vit_noise'),
    method,
    snapCurves: $('vit_snap').checked,
    ignoreWhite: $('vit_ignore_white').checked,
  });
}

function updateLabels() {
  const t = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  t('vit_colors_val', $('vit_colors').value);
  t('vit_fulltone_val', `${$('vit_fulltone').value}%`);
  t('vit_threshold_val', $('vit_threshold').value);
  t('vit_paths_val', `${$('vit_paths').value}%`);
  t('vit_corners_val', `${$('vit_corners').value}%`);
  t('vit_noise_val', `${$('vit_noise').value} px`);
}

function updateVisibility() {
  const mode = $('vit_mode').value;
  const palette = $('vit_palette').value;
  ctl.panel.querySelectorAll('[data-show]').forEach((el) => {
    const want = el.getAttribute('data-show');
    let show = false;
    if (want === 'color') show = mode === 'color';
    else if (want === 'color-limited') show = mode === 'color' && palette === 'limited';
    else if (want === 'color-fulltone') show = mode === 'color' && palette !== 'limited';
    else if (want === 'bw') show = mode === 'bw';
    el.style.display = show ? '' : 'none';
  });
}

/** Re-trace ~300 ms after the last committed control change (slider release). */
function scheduleRetrace() {
  clearTimeout(ctl.debounce);
  ctl.debounce = setTimeout(() => {
    ctl.debounce = 0;
    if (ctl.session && previewEnabled()) requestPreview();
  }, DEBOUNCE_MS);
}

function onSettingsEdited({ fromPreset = false } = {}) {
  const session = ctl.session;
  const s = readControls();
  if (!fromPreset) {
    s.preset = 'custom';
    $('vit_preset').value = 'custom';
  }
  ctl.settings = s;
  updateVisibility();
  if (!session) return;
  session.settings = s;
  scheduleRetrace();
  syncPanel();
}

function wirePanel(panel) {
  // Sliders: `input` only updates the label; `change` (release) re-traces.
  panel.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', updateLabels);
    input.addEventListener('change', () => onSettingsEdited());
  });
  ['vit_mode', 'vit_palette', 'vit_snap', 'vit_ignore_white'].forEach((id) => {
    $(id).addEventListener('change', () => onSettingsEdited());
  });
  panel.querySelectorAll('input[name="vit_method"]').forEach((r) => r.addEventListener('change', () => onSettingsEdited()));
  $('vit_preset').addEventListener('change', () => {
    const id = $('vit_preset').value;
    if (!TRACE_PRESETS[id]) return;
    writeControls(presetSettings(id), $('vit_view').value);
    onSettingsEdited({ fromPreset: true });
  });
  $('vit_view').addEventListener('change', () => {
    const view = $('vit_view').value;
    if (ctl.session) ctl.session.view = view;
    const group = ctl.session?.group;
    if (group && group.isConnected) applyView(group, view);
    syncPropsControls();
  });
  const eye = $('vit_eye');
  const peekOn = (e) => {
    const group = ctl.session?.group;
    if (!group) return;
    e.preventDefault();
    try { eye.setPointerCapture?.(e.pointerId); } catch (_) { /* ignore */ }
    eye.classList.add('is-held');
    setPeek(group, true);
  };
  const peekOff = () => {
    eye.classList.remove('is-held');
    const group = ctl.session?.group;
    if (group) setPeek(group, false);
  };
  eye.addEventListener('pointerdown', peekOn);
  eye.addEventListener('pointerup', peekOff);
  eye.addEventListener('pointercancel', peekOff);
  eye.addEventListener('lostpointercapture', peekOff);
  $('vit_preview').addEventListener('change', () => {
    if (previewEnabled() && ctl.session) requestPreview();
  });
  $('vit_trace').addEventListener('click', () => {
    if (ctl.session) commitSession();
  });
  $('vit_cancel').addEventListener('click', () => cancelSession());
  $('vit_close').addEventListener('click', () => closePanel());
}

function syncPanel() {
  if (!ctl.panel) return;
  const session = ctl.session;
  const body = ctl.panel.querySelector('.vit-body');
  body.classList.toggle('is-disabled', !session);
  const info = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  if (session && !session.stats && session.group) {
    session.stats = traceStats(resultPaths(liveParts(session.group).result));
  }
  const stats = session?.stats;
  info('vit_info_paths', stats ? String(stats.paths) : '–');
  info('vit_info_anchors', stats ? String(stats.anchors) : '–');
  info('vit_info_colors', stats ? String(stats.colors) : '–');
  let status = '';
  if (!session) status = 'Select an image or a tracing object.';
  else if (session.busy) status = 'Tracing…';
  else if (session.status) status = session.status;
  else if (session.kind === 'image') status = 'Change an option to preview, or click Trace.';
  info('vit_status', status);
  $('vit_status').classList.toggle('is-busy', !!session?.busy);
  info('vit_warning', session?.warning || '');
  info('vit_error', session?.error || '');
  $('vit_error').style.display = session?.error ? 'block' : 'none';
  $('vit_warning').style.display = session?.warning ? 'block' : 'none';
  $('vit_cancel').disabled = !session || !(session.dirty || session.busy);
  $('vit_trace').disabled = !session || session.busy;
  $('vit_eye').disabled = !session?.group;
}

/** Bring the session/panel in line with the selection. */
function loadSessionForSelection() {
  if (ctl.selecting) return;
  const live = selectedLiveTrace();
  const image = live ? null : selectedImage();
  const cur = ctl.session;
  if (cur && ((live && cur.group === live) || (image && cur.kind === 'image' && cur.image === image))) return;
  if (cur && (cur.dirty || cur.busy)) {
    // Clicking away keeps what was previewed (like Illustrator).
    const pending = cur;
    if (!pending.dirty) {
      cancelSession();
    } else {
      commitSession({ select: false }).then(() => {
        if (ctl.session && ctl.session.group === pending.group) {
          ctl.session = null;
          loadSessionForSelection();
          syncPanel();
          syncPropsControls();
        }
      });
      return;
    }
  }
  if (live) ctl.session = newLiveSession(live);
  else if (image) ctl.session = newImageSession(image, ctl.settings);
  else ctl.session = null;
  writeControls(ctl.session ? ctl.session.settings : ctl.settings, ctl.session?.view || 'result');
}

function openPanel() {
  const panel = ensurePanel();
  panel.style.display = '';
  loadSessionForSelection();
  writeControls(ctl.session ? ctl.session.settings : ctl.settings, ctl.session?.view || 'result');
  syncPanel();
  const sp = document.getElementById('sidepanels');
  if (sp) sp.scrollTop = Math.max(0, panel.offsetTop - 8);
}

/** Closing keeps the live object (a pending preview is committed). */
async function closePanel() {
  if (ctl.session?.dirty) await commitSession({ select: false });
  else if (ctl.session?.busy) cancelSession();
  if (ctl.panel) ctl.panel.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Properties bar + menu
// ---------------------------------------------------------------------------

function injectPropsControls() {
  const imgGroup = document.getElementById('prop_image_group');
  if (imgGroup && !document.getElementById('prop_image_trace_row')) {
    const row = document.createElement('div');
    row.className = 'prop_row vit-prop-row';
    row.id = 'prop_image_trace_row';
    row.innerHTML = `
      <button type="button" class="vit-prop-btn" id="prop_image_trace_btn" title="Image Trace with the selected preset">Image Trace</button>
      <select id="prop_image_trace_preset" class="vit-prop-select" title="Tracing preset" aria-label="Tracing preset">${presetOptionsHtml('default', false)}</select>
      <button type="button" class="vit-prop-icon" id="prop_image_trace_panel" title="Open the Image Trace panel" aria-label="Open the Image Trace panel">${PANEL_ICON}</button>`;
    imgGroup.appendChild(row);
    $('prop_image_trace_btn').addEventListener('click', () => makeTrace(selectedImage(), $('prop_image_trace_preset').value));
    $('prop_image_trace_panel').addEventListener('click', () => openPanel());
  }
  const transformSec = document.getElementById('sec_transform');
  if (transformSec && !document.getElementById('prop_live_trace_group')) {
    const sec = document.createElement('div');
    sec.className = 'prop_section vit-prop-section';
    sec.id = 'prop_live_trace_group';
    sec.style.display = 'none';
    sec.innerHTML = `
      <div class="vit-prop-title">Image Trace</div>
      <div class="prop_row vit-prop-row">
        <label class="vit-prop-label" for="prop_live_trace_preset">Preset</label>
        <select id="prop_live_trace_preset" class="vit-prop-select">${presetOptionsHtml('default')}</select>
        <button type="button" class="vit-prop-icon" id="prop_live_trace_panel" title="Open the Image Trace panel" aria-label="Open the Image Trace panel">${PANEL_ICON}</button>
      </div>
      <div class="prop_row vit-prop-row">
        <label class="vit-prop-label" for="prop_live_trace_view">View</label>
        <select id="prop_live_trace_view" class="vit-prop-select">${viewOptionsHtml('result')}</select>
      </div>
      <div class="prop_row vit-prop-row">
        <button type="button" class="vit-prop-btn vit-prop-wide" id="prop_live_trace_expand" title="Convert the tracing to editable paths">Expand</button>
      </div>`;
    transformSec.parentNode.insertBefore(sec, transformSec.nextSibling);
    $('prop_live_trace_preset').addEventListener('change', () => {
      const id = $('prop_live_trace_preset').value;
      const group = selectedLiveTrace();
      if (group && TRACE_PRESETS[id]) applyPresetToLive(group, id);
    });
    $('prop_live_trace_view').addEventListener('change', () => {
      const group = selectedLiveTrace();
      if (!group) return;
      const view = $('prop_live_trace_view').value;
      applyView(group, view);
      if (ctl.session?.group === group) ctl.session.view = view;
      if (panelOpen()) $('vit_view').value = view;
    });
    $('prop_live_trace_panel').addEventListener('click', () => openPanel());
    $('prop_live_trace_expand').addEventListener('click', () => expandTrace());
  }
}

function syncPropsControls() {
  const live = selectedLiveTrace();
  const sec = document.getElementById('prop_live_trace_group');
  if (sec) sec.style.display = live ? 'block' : 'none';
  if (live) {
    const s = readSettings(live);
    const presetEl = $('prop_live_trace_preset');
    if (presetEl) presetEl.value = TRACE_PRESETS[s.preset] ? s.preset : 'custom';
    const viewEl = $('prop_live_trace_view');
    if (viewEl) viewEl.value = readView(live);
  }
  const row = document.getElementById('prop_image_trace_row');
  if (row) row.style.display = selectedImage() ? 'flex' : 'none';
}

function syncMenu() {
  const live = selectedLiveTrace();
  const image = selectedImage();
  $('action_image_trace_make')?.classList.toggle('disabled', !image);
  $('action_image_trace_release')?.classList.toggle('disabled', !live);
  $('action_image_trace_expand')?.classList.toggle('disabled', !live);
}

function wireMenu() {
  const item = (id, fn) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (el.classList.contains('disabled')) {
        e.stopPropagation();
        return;
      }
      fn();
    });
  };
  item('action_image_trace_make', () => makeTrace());
  item('action_image_trace_release', () => releaseTrace());
  item('action_image_trace_expand', () => expandTrace());
  item('action_image_trace_panel', () => openPanel());
  const obj = $('menu_object');
  obj?.addEventListener('mouseenter', syncMenu);
  obj?.querySelector('.menu_entry_title')?.addEventListener('click', syncMenu, true);
}

// ---------------------------------------------------------------------------
// Guards: no direct selection / isolation inside a live trace, undo, Esc
// ---------------------------------------------------------------------------

function installGuards() {
  const canvas = sc();
  // Double-click would enter the group; a live trace has no editable insides until expanded.
  document.addEventListener('dblclick', (e) => {
    const t = e.target;
    if (t && t.closest?.('[data-visteras-trace="1"]') && canvas.getSvgContent?.().contains(t)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  // Ungroup is unavailable for a live trace (Expand it first), like Illustrator.
  const ungroup = canvas.ungroupSelectedElement;
  if (typeof ungroup === 'function') {
    canvas.ungroupSelectedElement = function (...args) {
      if (selectedLiveTrace()) {
        showToast('Expand the tracing (Object > Image Trace > Expand) before ungrouping.');
        return undefined;
      }
      return ungroup.apply(this, args);
    };
  }
  // Undo / Redo: a pending preview is not in history, so resolve it first.
  const um = canvas.undoMgr;
  if (um && !um.__visterasTraceWrapped) {
    um.__visterasTraceWrapped = true;
    for (const name of ['undo', 'redo']) {
      const orig = um[name].bind(um);
      um[name] = function () {
        if (ctl.session && (ctl.session.dirty || ctl.session.busy)) cancelSession();
        const r = orig();
        ctl.session = null;
        setTimeout(() => { loadSessionForSelection(); syncPanel(); syncPropsControls(); }, 0);
        return r;
      };
    }
  }
  // Esc aborts a running trace.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !ctl.session?.busy) return;
    e.stopPropagation();
    e.preventDefault();
    ctl.engine.abort(); // the pending promise rejects with 'aborted' and cleans up
  }, true);
}

function onContextChanged() {
  injectPropsControls();
  syncPropsControls();
  if (panelOpen()) {
    loadSessionForSelection();
    syncPanel();
  } else if (ctl.session && !ctl.session.dirty && !ctl.session.busy) {
    const live = selectedLiveTrace();
    const image = selectedImage();
    if (ctl.session.group !== live && ctl.session.image !== image) ctl.session = null;
  }
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasImageTrace({ svgEditor }) {
  if (!svgEditor) return;
  ctl.svgEditor = svgEditor;
  ctl.sc = svgEditor.svgCanvas;
  window.__visterasTraceSelectedImage = () => openPanel();
  window.__visterasImageTrace = {
    make: makeTrace,
    expand: expandTrace,
    release: releaseTrace,
    openPanel,
    closePanel,
    cancel: cancelSession,
    commit: commitSession,
    get session() { return ctl.session; },
    get engine() { return ctl.engine; },
    timings: () => ctl.timings.slice(),
  };
  injectPropsControls();
  wireMenu();
  installGuards();
  const orig = window.__updatePropertiesVisibility;
  window.__updatePropertiesVisibility = function wrapped(...args) {
    const r = typeof orig === 'function' ? orig.apply(this, args) : undefined;
    onContextChanged();
    return r;
  };
  if (svgEditor.topPanel && typeof svgEditor.topPanel.updateContextPanel === 'function') {
    const prev = svgEditor.topPanel.updateContextPanel.bind(svgEditor.topPanel);
    svgEditor.topPanel.updateContextPanel = function (...args) {
      const r = prev(...args);
      onContextChanged();
      return r;
    };
  }
  setTimeout(() => { injectPropsControls(); syncPropsControls(); }, 0);
}

export {
  // live-trace helpers (browser)
  isLiveTrace,
  liveParts,
  applyView,
  computeImageLayout,
  makePointTransformer,
  getImageHref,
  loadImageElement,
  TraceEngine,
  // pure helpers re-exported from the core module (Node tests import them here)
  optimizeContourSegments,
  optimizeTracedata,
  buildTraceOptions,
  pathSampleToD,
  tracedataToColorGroups,
  perpDist,
  rdp,
  parseVtracerSvg,
  transformSvgPathD,
  isNearWhiteFill,
  mapSettingsToVtracer,
  presetSettings,
  normalizeSettings,
  quantizeMedianCut,
  remapToPalette,
  snapToGrays,
  binarize,
  applyIgnoreWhite,
  snapCurvesToLines,
  groupPathsForExpand,
  traceStats,
  runTracePipeline,
  TRACE_PRESETS,
};
