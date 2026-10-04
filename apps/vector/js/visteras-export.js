import {artboardsForExport,artboardUnion} from './visteras-artboard-model.js';
/**
 * Visteras Vector — File ▸ Export (Export for Screens… ⌥⌘E, Export As…) and
 * Effect ▸ Document Raster Effects Settings….
 *
 * Rendering is client-side and matches the screen: the live #svgcontent is cloned,
 * its viewBox set to the scope (artboard / selection incl. effect extents / full
 * document) plus padding, the background is painted *inside* the SVG (so blend modes
 * composite like on screen), Google / uploaded fonts and external images are inlined,
 * and the SVG is drawn through an <img> onto a canvas at the target size (vector at
 * 2×/3×, never upscaled), then toBlob. PNGs get a pHYs (ppi) chunk.
 * Delivery: one file → saveFile (picker before rendering keeps user activation);
 * several → showDirectoryPicker (sub-folders) or a store-only ZIP.
 */
import * as X from './visteras-export-core.js?v=export-1';
import { isSystemFontFamily, findGoogleFontEntry } from '../lib/visteras-fonts.js';

const NS = 'http://www.w3.org/2000/svg';
const XL = 'http://www.w3.org/1999/xlink';
const NON_RENDER = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'pattern', 'filter', 'marker', 'symbol']);
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', '']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cssEsc = (s) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
const FONT_MIME = { woff2: ['font/woff2', 'woff2'], woff: ['font/woff', 'woff'], otf: ['font/otf', 'opentype'], ttf: ['font/ttf', 'truetype'] };

export function mountExport({ editor, saveFile, downloadBlob, toast = (m, t) => window.showStudioToast?.(m, t) } = {}) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasExport) return window.__visterasExport || null;
  const shell = () => window.__visterasDocumentShell;
  const activeDoc = () => shell()?.getActiveDoc?.() || null;
  const title = () => (activeDoc()?.title || editor.title || 'Untitled').replace(/\.(vvd|svg)$/i, '');
  const limits = () => X.canvasLimits(navigator.userAgent, navigator.maxTouchPoints || 0);

  /* ───────── settings ───────── */
  const loadSettings = () => { try { return X.normalizeSettings(localStorage.getItem(X.SETTINGS_KEY)); } catch { return X.normalizeSettings(null); } };
  const saveSettings = (s) => { try { localStorage.setItem(X.SETTINGS_KEY, JSON.stringify(X.normalizeSettings(s))); } catch { /* private mode */ } };
  const getRaster = () => X.normalizeRaster(activeDoc()?.rasterEffects);
  const hasDocRaster = () => !!activeDoc()?.rasterEffects;
  const setRaster = (v) => {
    const doc = activeDoc();
    if (!doc) return;
    doc.rasterEffects = X.normalizeRaster(v);
    try { shell()?.markDirty?.(); } catch { /* ignore */ }
  };
  const artboardColor = (board = artboard()) => {
    if(board.backgroundColor)return board.backgroundColor==='none'?null:board.backgroundColor;
    let c = String(editor.configObj?.pref?.('bkgd_color') || '#ffffff');
    if (/^#[0-9a-f]{3}$/i.test(c)) c = `#${c.slice(1).split('').map((x) => x + x).join('')}`;
    return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#ffffff';
  };

  /* ───────── bounds ───────── */
  const artboard = () => { const board=window.__visterasArtboards?.active();if(board)return board; const r = sc.getResolution(); return { x: 0, y: 0, width: Number(r.w) || 800, height: Number(r.h) || 600 }; };
  const selected = () => (sc.getSelectedElements?.() || []).filter((el) => el?.isConnected && el.id && !el.classList?.contains('layer'));
  const vb = (el) => {
    try { const b = window.__visterasEffects?.getVisualBounds?.(el); if (b && b.width >= 0) return b; } catch { /* fall through */ }
    try { return sc.getStrokedBBox([el]) || null; } catch { return null; }
  };
  const unionOf = (els) => els.reduce((acc, el) => { const b = vb(el); return b && (b.width > 0 || b.height > 0) ? X.unionRect(acc, b) : acc; }, null);
  const selectionBounds = () => unionOf(selected());
  const visibleTop = () => {
    const content = sc.getSvgContent();
    const out = [];
    for (const layer of content.querySelectorAll(':scope > g.layer')) {
      if (getComputedStyle(layer).display === 'none') continue;
      for (const c of layer.children) if (!NON_RENDER.has(c.tagName.toLowerCase()) && getComputedStyle(c).display !== 'none') out.push(c);
    }
    return out;
  };
  const fullBounds = () => unionOf(visibleTop());
  const scopeRect = (scope, padding, board) => X.scopeRect({ scope, padding, artboard: board || (scope==='full'?artboardUnion(activeDoc()?.artboards||[artboard()]):artboard()), selection: scope === 'selection' ? selectionBounds() : null, full: scope === 'full' ? fullBounds() : null });

  /* ───────── SVG building ───────── */
  function prune(root, ids) {
    const keep = new Set(ids.map((id) => root.querySelector(`[id="${cssEsc(id)}"]`)).filter(Boolean));
    const keepIds = new Set(ids);
    const anc = new Set();
    for (const k of keep) for (let p = k.parentNode; p && p !== root; p = p.parentNode) anc.add(p);
    const walk = (node) => {
      for (const c of [...node.children]) {
        if (NON_RENDER.has(c.tagName.toLowerCase()) || keep.has(c)) continue;
        if (keepIds.has(c.getAttribute('data-visteras-helper-for'))) continue; // stroke-align helper of a kept body
        if (anc.has(c)) { walk(c); continue; }
        c.remove();
      }
    };
    walk(root);
  }

  async function inlineImages(clone, warnings, drop = false) {
    await Promise.all([...clone.querySelectorAll('image')].map(async (img) => {
      const href = img.getAttribute('href') || img.getAttributeNS(XL, 'href') || '';
      if (drop) { img.remove(); return; }
      if (!href || href.startsWith('data:')) return;
      try {
        const res = await fetch(href, { mode: 'cors' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const url = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = bad; fr.readAsDataURL(blob); });
        img.setAttribute('href', url); img.removeAttributeNS(XL, 'href');
      } catch {
        warnings.push(`An image (${href.slice(0, 60)}) couldn't be embedded and was left out`);
        img.remove();
      }
    }));
  }

  const fetchCache = new Map();
  const fetchOnce = (url, kind) => {
    const key = `${kind}:${url}`;
    if (!fetchCache.has(key)) fetchCache.set(key, fetch(url, { mode: 'cors' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return kind === 'text' ? r.text() : r.arrayBuffer(); }).catch((e) => { fetchCache.delete(key); throw e; }));
    return fetchCache.get(key);
  };
  const isGoogle = (family) => !!findGoogleFontEntry(family) || !!document.querySelector(`link[data-visteras-font="${cssEsc(family)}"]`);

  /** Inline Google / uploaded fonts used by text in `clone`. Installed system fonts render natively. */
  async function embedFonts(clone, warnings) {
    const texts = [...clone.querySelectorAll('text')];
    if (!texts.length) return 0;
    const content = sc.getSvgContent();
    const groups = new Map();
    for (const t of texts) {
      const orig = t.id ? content.querySelector(`[id="${cssEsc(t.id)}"]`) : null;
      for (const n of orig ? [orig, ...orig.querySelectorAll('tspan, textPath')] : [t]) {
        let cs;
        try { cs = getComputedStyle(n); } catch { continue; }
        const family = X.firstFamily(cs.fontFamily || n.getAttribute('font-family'));
        if (GENERIC.has(family.toLowerCase())) continue;
        const weight = Number(cs.fontWeight) || 400, style = /italic|oblique/.test(cs.fontStyle) ? 'italic' : 'normal';
        const key = `${family}|${weight}|${style}`;
        const g = groups.get(key) || { family, weight, style, text: '' };
        g.text += n.textContent || '';
        groups.set(key, g);
      }
    }
    const css = [];
    const failed = new Set();
    for (const g of groups.values()) {
      try {
        const uploaded = await window.__visterasFontBytes?.(g.family);
        if (uploaded) {
          const [mime, format] = FONT_MIME[uploaded.type] || ['font/ttf', null];
          css.push(X.fontFaceCss({ family: g.family, weight: g.weight, style: g.style, mime, format, base64: X.bytesToBase64(new Uint8Array(uploaded.buffer)) }));
          continue;
        }
        if (isSystemFontFamily(g.family) || !isGoogle(g.family)) continue; // installed font: drawn natively
        let sheet;
        try { sheet = await fetchOnce(X.googleCssUrl(g.family, { weight: g.weight, italic: g.style === 'italic' }), 'text'); }
        catch { sheet = await fetchOnce(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(g.family).replace(/%20/g, '+')}&display=swap`, 'text'); }
        const faces = X.pickFaces(X.parseFontFaces(sheet), g);
        if (!faces.length) throw new Error('no faces');
        for (const f of faces) {
          const bytes = await fetchOnce(f.url, 'bytes');
          const [mime, format] = FONT_MIME[f.format === 'woff2' || /\.woff2/.test(f.url) ? 'woff2' : f.format === 'woff' ? 'woff' : 'ttf'];
          css.push(X.fontFaceCss({ family: g.family, weight: f.weight === f.weightMax ? f.weight : `${f.weight} ${f.weightMax}`, style: f.style, mime, format, base64: X.bytesToBase64(new Uint8Array(bytes)), ranges: f.ranges }));
        }
      } catch {
        failed.add(g.family);
      }
    }
    for (const f of failed) warnings.push(`${f} couldn't be embedded; text may use a fallback font`);
    if (!css.length) return 0;
    let defs = clone.querySelector(':scope > defs');
    if (!defs) { defs = document.createElementNS(NS, 'defs'); clone.insertBefore(defs, clone.firstChild); }
    const style = document.createElementNS(NS, 'style');
    style.setAttribute('data-visteras-export-fonts', '');
    style.textContent = [...new Set(css)].join('\n');
    defs.prepend(style);
    return css.length;
  }

  /**
   * Standalone SVG for a scope. background = CSS colour or null. Returns
   * { svg, rect, w, h, warnings, fonts }.
   */
  async function buildExportSvg({ board, scope = 'artboard', padding = 0, background = null, scale = 1, fonts = true, images = true, dropImages = false, forSvgFile = false } = {}) {
    const warnings = [];
    const rect = scopeRect(scope, padding, board);
    if (!rect) throw new Error(scope === 'selection' ? 'Nothing is selected' : 'There is nothing to export');
    const { w, h } = forSvgFile ? { w: X.pixelSize(rect, 1).w, h: X.pixelSize(rect, 1).h } : X.pixelSize(rect, scale);
    const clone = sc.getSvgContent().cloneNode(true);
    for (const a of ['x', 'y', 'style', 'id']) clone.removeAttribute(a);
    // XMLSerializer writes xmlns (and xmlns:xlink when used) itself; setting them as
    // plain attributes would duplicate them and make the SVG undecodable.
    clone.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
    clone.setAttribute('width', forSvgFile ? rect.width : w);
    clone.setAttribute('height', forSvgFile ? rect.height : h);
    clone.setAttribute('overflow', 'hidden');
    // Editor-only bits; foreignObject can taint the canvas in (older) Safari.
    for (const n of clone.querySelectorAll('[data-text-overset], [data-text-edit-overlay], foreignObject')) n.remove();
    if (scope === 'selection') prune(clone, selected().map((el) => el.id));
    if (background) {
      const bg = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, fill: background, 'data-visteras-export-bg': '' })) bg.setAttribute(k, v);
      const first = [...clone.children].find((c) => !NON_RENDER.has(c.tagName.toLowerCase()));
      clone.insertBefore(bg, first || null);
    }
    if (images || dropImages) await inlineImages(clone, warnings, dropImages);
    const nFonts = fonts ? await embedFonts(clone, warnings) : 0;
    let svg = new XMLSerializer().serializeToString(clone);
    if (forSvgFile) svg = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
    return { svg, rect, w, h, warnings, fonts: nFonts };
  }

  /* ───────── rasterizing ───────── */
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const debug = { fontRedrawChecks: 0, fontRedrawDiffered: 0 };

  async function rasterize(svg, w, h, mime = 'image/png', quality = undefined, { fonts = 0 } = {}) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Object.assign(new Error('oom'), { code: 'oom' });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      if (fonts) {
        // Inlined fonts normally apply before decode() resolves; redraw once after two
        // frames as a first-draw fallback (cheap; see report on font timing).
        const sample = window.__visterasExportDebug && w * h <= 4e6 ? ctx.getImageData(0, 0, w, h).data : null;
        await frame();
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        if (sample) {
          debug.fontRedrawChecks++;
          const now = ctx.getImageData(0, 0, w, h).data;
          for (let i = 0; i < now.length; i += 4) if (now[i + 3] !== sample[i + 3]) { debug.fontRedrawDiffered++; break; }
        }
      }
      const blob = await new Promise((ok, bad) => { try { canvas.toBlob(ok, mime, quality); } catch (e) { bad(e); } });
      canvas.width = 0; canvas.height = 0;
      if (!blob) throw Object.assign(new Error('oom'), { code: 'oom' });
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const artboardSvgString = (rect) => {
    // Artboard / Full keep SVG-Edit's own serializer (unused-defs cleanup).
    const str = sc.getSvgString();
    if (!rect) return str;
    const doc = new DOMParser().parseFromString(str, 'image/svg+xml');
    const root = doc.documentElement;
    root.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
    root.setAttribute('width', rect.width); root.setAttribute('height', rect.height);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
  };

  /**
   * Render one output. job: { scope, padding, scale, format, background (choice),
   * bgColor, ppi }. Returns { blob, warnings }.
   */
  async function renderJob(job) {
    const info = X.formatInfo(job.format);
    const warnings = [];
    if (info.ext === 'svg') {
      if (job.scope === 'artboard') return { blob: new Blob([artboardSvgString(scopeRect('artboard',job.padding,job.board))], { type: info.mime }), warnings };
      if (job.scope === 'full') return { blob: new Blob([artboardSvgString(scopeRect('full', job.padding))], { type: info.mime }), warnings };
      const out = await buildExportSvg({ scope: 'selection', padding: job.padding, fonts: false, images: false, forSvgFile: true });
      return { blob: new Blob([out.svg], { type: info.mime }), warnings };
    }
    if (info.ext === 'pdf') {
      if (job.scope !== 'artboard') warnings.push('PDF (raster) always exports the artboard');
      const built = await buildExportSvg({board:job.board,scope:'artboard',background:artboardColor(job.board)});
      const m = await sc.exportPDF(`${X.safeBase(title())}.pdf`, 'blob', {svg:built.svg,size:{w:built.w,h:built.h}});
      return { blob: m.output instanceof Blob ? m.output : new Blob([m.output], { type: info.mime }), warnings };
    }
    const scale = Number(job.scale) || X.scaleForPpi(job.ppi);
    const background = X.backgroundColor(job.background, { bgColor: job.bgColor, artboard: artboardColor(job.board), opaque: !!info.opaque });
    const quality = info.ext === 'jpg' ? (job.quality ?? info.quality) : undefined;
    const run = async (dropImages) => {
      const built = await buildExportSvg({ board:job.board, scope: job.scope, padding: job.padding, background, scale, dropImages });
      warnings.push(...built.warnings);
      if (!X.checkSize(built.w, built.h, limits())) throw Object.assign(new Error(X.tooLargeMessage(built.rect, scale, limits())), { code: 'size' });
      return rasterize(built.svg, built.w, built.h, info.mime, quality, { fonts: built.fonts });
    };
    let blob;
    try {
      blob = await run(false);
    } catch (e) {
      if (e?.name !== 'SecurityError') throw e;
      // Tainted canvas (e.g. Safari with some SVG images): retry without images.
      warnings.push('This browser blocked embedded images in the render; they were left out');
      blob = await run(true);
    }
    if (info.ext === 'png') {
      const ppi = job.ppi || 72 * scale;
      blob = new Blob([X.insertPngPhys(new Uint8Array(await blob.arrayBuffer()), ppi)], { type: 'image/png' });
    }
    return { blob, warnings };
  }

  const errorText = (e, scale) => (e?.code === 'oom' ? `Ran out of memory at ${X.scaleLabel(scale || 1)}` : e?.message || String(e));

  /** Pre-flight size check (before any picker). null = fine, else message. */
  function sizeProblem(job) {
    const info = X.formatInfo(job.format);
    if (!info.raster) return null;
    const rect = scopeRect(job.scope, job.padding, job.board);
    if (!rect) return job.scope === 'selection' ? 'Nothing is selected' : 'There is nothing to export';
    const scale = Number(job.scale) || X.scaleForPpi(job.ppi);
    const { w, h } = X.pixelSize(rect, scale);
    return X.checkSize(w, h, limits()) ? null : X.tooLargeMessage(rect, scale, limits());
  }

  const TYPES = {
    png: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
    jpg: [{ description: 'JPEG Image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }],
    svg: [{ description: 'SVG Image', accept: { 'image/svg+xml': ['.svg'] } }],
    pdf: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
    zip: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }],
  };

  const reportWarnings = (list) => { for (const w of [...new Set(list)]) toast(w, 'warning'); };

  /** Single file through the shared saveFile helper (picker first, then render). */
  async function deliverOne(job, fileName) {
    const info = X.formatInfo(job.format);
    const warnings = [];
    const res = await saveFile({
      data: async () => { const out = await renderJob(job); warnings.push(...out.warnings); return out.blob; },
      fileName, mimeType: info.mime, types: TYPES[info.ext],
    });
    if (res.cancelled) return { cancelled: true };
    reportWarnings(warnings);
    return { name: res.name, method: res.method };
  }

  async function writePath(dir, path, blob) {
    const parts = path.split('/');
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const fh = await d.getFileHandle(parts.at(-1), { create: true });
    const w = await fh.createWritable();
    try { await w.write(blob); } finally { await w.close(); }
  }

  /**
   * Export for Screens. jobs: [{ path, job }]. Folder (showDirectoryPicker) or ZIP.
   * onProgress(i, n, path); isCancelled() checked between files.
   */
  async function deliverMany(jobs, { onProgress = () => {}, isCancelled = () => false, forceZip = false } = {}) {
    const warnings = [], failed = [];
    let dir = null;
    if (!forceZip && typeof window.showDirectoryPicker === 'function') {
      try { dir = await window.showDirectoryPicker({ id: 'visteras-export', mode: 'readwrite' }); }
      catch (e) { if (e?.name === 'AbortError') return { cancelled: true }; dir = null; }
    }
    const files = [];
    let done = 0;
    for (let i = 0; i < jobs.length; i++) {
      if (isCancelled()) return { cancelled: true, done };
      const { path, job } = jobs[i];
      onProgress(i + 1, jobs.length, path);
      try {
        const out = await renderJob(job);
        warnings.push(...out.warnings);
        if (dir) await writePath(dir, path, out.blob);
        else files.push({ name: path, data: new Uint8Array(await out.blob.arrayBuffer()) });
        done++;
      } catch (e) {
        failed.push(`${path}: ${errorText(e, job.scale)}`);
      }
    }
    if (!dir && files.length) {
      const zipName = `${X.safeBase(title())}-export.zip`;
      const res = await saveFile({ data: () => new Blob([X.zipStore(files)], { type: 'application/zip' }), fileName: zipName, mimeType: 'application/zip', types: TYPES.zip });
      if (res.cancelled) return { cancelled: true, done: 0 };
    }
    reportWarnings(warnings);
    return { done, failed, method: dir ? 'folder' : 'zip' };
  }

  /* ───────── dialogs ───────── */
  let open = null;
  function dialog(cls, titleText, bodyHtml, { okLabel = 'Export' } = {}) {
    closeDialog();
    const overlay = document.createElement('div');
    overlay.className = 'vui-overlay vexp_overlay';
    const dlg = document.createElement('div');
    dlg.className = `vui-dialog vexp_dialog ${cls}`;
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-label', titleText);
    dlg.innerHTML = `<div class="vui-dialog-header"><span class="vui-dialog-title">${titleText}</span><button type="button" class="vui-dialog-close" data-act="cancel" aria-label="Cancel">×</button></div>
      <div class="vui-dialog-body vexp_body">${bodyHtml}</div>
      <div class="vexp_progress" hidden><div class="vexp_bar"><i></i></div><span class="vexp_progress_text"></span></div>
      <div class="vui-dialog-actions"><button type="button" class="vui-btn vui-btn-secondary" data-act="cancel">Cancel</button><button type="button" class="vui-btn vui-btn-accent" data-act="ok">${okLabel}</button></div>`;
    document.body.append(overlay, dlg);
    const state = { overlay, dlg, busy: false, cancelled: false, onOk: null };
    const onKey = (e) => {
      if (open !== state) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (state.busy) state.cancelled = true; else closeDialog(); }
      else if (e.key === 'Enter' && !['BUTTON', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && dlg.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); state.onOk?.(); }
      else if (dlg.contains(e.target)) e.stopPropagation();
    };
    state.onKey = onKey;
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', () => { if (!state.busy) closeDialog(); });
    dlg.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') { if (state.busy) state.cancelled = true; else closeDialog(); }
      else if (act === 'ok' && !state.busy) state.onOk?.();
    });
    open = state;
    return state;
  }
  function closeDialog() {
    if (!open) return;
    document.removeEventListener('keydown', open.onKey, true);
    open.overlay.remove(); open.dlg.remove();
    open = null;
  }
  const progress = (st, text, frac) => {
    const p = st.dlg.querySelector('.vexp_progress');
    p.hidden = false;
    p.querySelector('.vexp_progress_text').textContent = text;
    p.querySelector('i').style.width = `${Math.round((frac || 0) * 100)}%`;
  };
  const busy = (st, on) => { st.busy = on; st.dlg.classList.toggle('vexp_busy', on); st.dlg.querySelector('[data-act="ok"]').disabled = on; };

  const bgOptions = (v) => [['transparent', 'Transparent'], ['white', 'White'], ['black', 'Black'], ['artboard', 'Artboard'], ['other', 'Other…']]
    .map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('');

  /* Export As… */
  function openExportAs(preset = {}) {
    const s = loadSettings();
    const raster = getRaster();
    const docRaster = hasDocRaster();
    const fmt = preset.format || s.asFormat;
    const ppi = docRaster ? raster.ppi : s.asPpi;
    const bg = docRaster ? raster.background : s.background;
    const hasSel = selected().length > 0;
    const ppiSel = X.PPI_PRESETS.includes(ppi) ? String(ppi) : 'other';
    const st = dialog('vexp_as', 'Export As', `
      <label class="vexp_row"><span>Format:</span><select id="vexp_as_format">${[['png', 'PNG (png)'], ['jpg', 'JPEG (jpg)'], ['svg', 'SVG (svg)'], ['pdf', 'PDF (raster)']].map(([k, l]) => `<option value="${k}"${k === fmt ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="vexp_row vexp_checks"><label><input type="checkbox" id="vexp_as_artboard"${s.asUseArtboard ? ' checked' : ''}> Use Artboard</label>
        <label title="${hasSel ? '' : 'Select something first'}"><input type="checkbox" id="vexp_as_selection"${hasSel && s.asSelection ? ' checked' : ''}${hasSel ? '' : ' disabled'}> Selection Only</label></div>
      ${boardControls()}
      <fieldset class="vexp_raster"><legend>Options</legend>
        <label class="vexp_row"><span>Resolution:</span><select id="vexp_as_ppi"><option value="72"${ppiSel === '72' ? ' selected' : ''}>Screen (72 ppi)</option><option value="150"${ppiSel === '150' ? ' selected' : ''}>Medium (150 ppi)</option><option value="300"${ppiSel === '300' ? ' selected' : ''}>High (300 ppi)</option><option value="other"${ppiSel === 'other' ? ' selected' : ''}>Other</option></select>
          <input type="number" id="vexp_as_ppi_other" class="vpara_input" min="1" max="2400" step="1" value="${ppi}" aria-label="Resolution (ppi)"${ppiSel === 'other' ? '' : ' hidden'}><em>ppi</em></label>
        <label class="vexp_row"><span>Background:</span><select id="vexp_as_bg">${bgOptions(bg)}</select><input type="color" id="vexp_as_bgcolor" value="${s.bgColor}" aria-label="Background colour"${bg === 'other' ? '' : ' hidden'}></label>
        <label class="vexp_row vexp_jpeg"><span>Quality:</span><input type="range" id="vexp_as_quality" min="0" max="10" step="1" value="${s.asQuality}"><output id="vexp_as_quality_out">${s.asQuality}</output></label>
        <p class="vexp_note vexp_jpeg">JPEG has no transparency: Transparent exports white.</p>
      </fieldset>
      <p class="vexp_info" id="vexp_as_info"></p>`);
    const $ = (id) => st.dlg.querySelector(`#${id}`);
    const read = () => {
      const format = $('vexp_as_format').value;
      const ppiV = $('vexp_as_ppi').value === 'other' ? Number($('vexp_as_ppi_other').value) || 72 : Number($('vexp_as_ppi').value);
      const scope = $('vexp_as_selection').checked && selected().length ? 'selection' : ($('vexp_as_artboard').checked ? 'artboard' : 'full');
      return { format, ppi: ppiV, scope, background: $('vexp_as_bg').value, bgColor: $('vexp_as_bgcolor').value, quality: Number($('vexp_as_quality').value) };
    };
    const sync = () => {
      const v = read();
      syncBoardControls(st,v.scope);
      const raster = v.format === 'png' || v.format === 'jpg';
      st.dlg.querySelector('.vexp_raster').hidden = !raster;
      for (const n of st.dlg.querySelectorAll('.vexp_jpeg')) n.hidden = v.format !== 'jpg';
      $('vexp_as_ppi_other').hidden = $('vexp_as_ppi').value !== 'other';
      $('vexp_as_bgcolor').hidden = v.background !== 'other';
      $('vexp_as_quality_out').textContent = v.quality;
      $('vexp_as_artboard').disabled = v.format === 'pdf';
      const rect = scopeRect(v.scope, 0);
      const px = rect && X.pixelSize(rect, X.scaleForPpi(v.ppi));
      const problem = raster ? sizeProblem({ ...v, scale: 0 }) : null;
      $('vexp_as_info').textContent = !rect ? 'Nothing to export' : problem || (raster ? `${px.w} × ${px.h} px at ${v.ppi} ppi` : `${Math.round(rect.width)} × ${Math.round(rect.height)} px`);
      $('vexp_as_info').classList.toggle('vexp_error', !!problem || !rect);
    };
    st.dlg.addEventListener('input', sync);
    st.dlg.addEventListener('change', sync);
    sync();
    st.onOk = async () => {
      const v = read();
      saveSettings({ ...loadSettings(), asFormat: v.format, asPpi: v.ppi, asQuality: v.quality, asUseArtboard: $('vexp_as_artboard').checked, asSelection: $('vexp_as_selection').checked, background: v.background, bgColor: v.bgColor });
      const info = X.formatInfo(v.format);
      const job = { scope: v.scope, padding: 0, scale: 0, ppi: v.ppi, format: v.format, background: v.background, bgColor: v.bgColor, quality: v.format === 'jpg' ? X.jpegQuality(v.quality) : undefined };
      let boards;try{boards=exportBoards(st,v.format==='pdf'?'artboard':v.scope);}catch(e){toast(e.message,'error');return;}
      const problem = boards.map(board=>sizeProblem({...job,board})).find(Boolean);
      if (problem) { toast(problem, 'error'); return; }
      busy(st, true);
      progress(st, `Rendering ${X.exportFileName({ title: title(), scope: v.scope, ext: info.ext })}`, 0.5);
      try {
        const paths=X.uniquePaths(boards.map(board=>X.exportFileName({title:board?.name||title(),scope:v.scope,ext:info.ext})));
        const jobs=boards.map((board,i)=>({path:paths[i],job:{...job,board}}));
        const res = jobs.length===1?await deliverOne(jobs[0].job,jobs[0].path):await deliverMany(jobs,{isCancelled:()=>st.cancelled});
        if (res.cancelled) { busy(st, false); st.dlg.querySelector('.vexp_progress').hidden = true; return; }
        closeDialog();
        toast(res.name?`Exported "${res.name}"`:`Exported ${res.done} artboards`, 'success');
        for(const failure of res.failed||[])toast(failure,'error');
      } catch (e) {
        busy(st, false);
        toast(`Export failed: ${errorText(e, X.scaleForPpi(v.ppi))}`, 'error');
      }
    };
    return st;
  }

  function boardControls() {
    return `<label class="vexp_row"><span>Artboards:</span><select class="vexp_boards" aria-label="Artboards to export"><option value="active">Active Artboard</option><option value="all">All Artboards</option><option value="selected">Selected Artboards (panel)</option><option value="range">Range</option></select></label><label class="vexp_row"><span>Range:</span><input class="vexp_board_range" aria-label="Artboard range" placeholder="1-3, 6" disabled></label>`;
  }
  function exportBoards(st,scope) {
    if(scope!=='artboard')return [null];
    const boards=activeDoc()?.artboards||[artboard()], mode=st.dlg.querySelector('.vexp_boards').value;
    const result=artboardsForExport(boards,mode,{activeId:artboard().id,selectedIds:window.__visterasArtboards?.selectedIds()||[],range:st.dlg.querySelector('.vexp_board_range').value});
    if(!result.length)throw new Error('Select artboards in the Artboards panel before exporting.');
    return result.map(b=>({...b}));
  }
  function syncBoardControls(st,scope) {
    const mode=st.dlg.querySelector('.vexp_boards'); mode.disabled=scope!=='artboard';
    st.dlg.querySelector('.vexp_board_range').disabled=scope!=='artboard'||mode.value!=='range';
  }

  /* Export for Screens… */
  function openExportForScreens() {
    const s = loadSettings();
    const raster = getRaster();
    const bg = hasDocRaster() ? raster.background : s.background;
    const hasSel = selected().length > 0;
    const scope0 = s.scope === 'selection' && !hasSel ? 'artboard' : s.scope;
    const fmtOpts = (v) => [['png', 'PNG'], ['jpg100', 'JPG 100%'], ['jpg85', 'JPG 85%'], ['jpg50', 'JPG 50%'], ['jpg25', 'JPG 25%'], ['svg', 'SVG']].map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('');
    const scaleOpts = (v) => {
      const list = X.SCALE_PRESETS.includes(v) ? X.SCALE_PRESETS : [...X.SCALE_PRESETS, v].sort((a, b) => a - b);
      return list.map((k) => `<option value="${k}"${k === v ? ' selected' : ''}>${k}x</option>`).join('');
    };
    const rowHtml = (r) => `<div class="vexp_scale_row"><select class="vexp_scale" aria-label="Scale">${scaleOpts(r.scale)}</select><input class="vexp_suffix" type="text" value="${esc(r.suffix)}" placeholder="Suffix" aria-label="Suffix"><select class="vexp_format" aria-label="Format">${fmtOpts(r.format)}</select><button type="button" class="vexp_del" aria-label="Delete scale" title="Delete">✕</button></div>`;
    const picker = typeof window.showDirectoryPicker === 'function';
    const st = dialog('vexp_screens', 'Export for Screens', `
      <div class="vexp_cols">
        <div class="vexp_left">
          <div class="vexp_thumb"><img id="vexp_thumb" alt="Preview"></div>
          ${[['artboard', 'Artboard'], ['selection', 'Selection'], ['full', 'Full Document']].map(([k, l]) => `<label class="vexp_scope"><input type="radio" name="vexp_scope" value="${k}"${k === scope0 ? ' checked' : ''}${k === 'selection' && !hasSel ? ' disabled' : ''}> ${l}</label>`).join('')}
          ${boardControls()}
          <label class="vexp_row"><span>Padding:</span><input type="number" id="vexp_padding" class="vpara_input" min="0" max="2000" step="1" value="${s.padding}"><em>px</em></label>
          <p class="vexp_info" id="vexp_size"></p>
        </div>
        <div class="vexp_right">
          <div class="vexp_section_title">Formats</div>
          <div class="vexp_head"><span>Scale</span><span>Suffix</span><span>Format</span><span></span></div>
          <div id="vexp_rows">${s.rows.map(rowHtml).join('')}</div>
          <button type="button" class="vexp_add" id="vexp_add_scale">+ Add Scale</button>
          <label class="vexp_row"><span>Prefix:</span><input type="text" id="vexp_prefix" value="${esc(s.prefix)}" placeholder="e.g. icon_"></label>
          <label class="vexp_row"><span>Background:</span><select id="vexp_bg">${bgOptions(bg)}</select><input type="color" id="vexp_bgcolor" value="${s.bgColor}" aria-label="Background colour"${bg === 'other' ? '' : ' hidden'}></label>
          <label class="vexp_row"><input type="checkbox" id="vexp_subfolders"${s.subfolders ? ' checked' : ''}> Create Sub-folders</label>
          <p class="vexp_note">Export to: <b id="vexp_dest">${picker ? 'a folder you choose' : 'a ZIP download'}</b>. JPG rows are always opaque.</p>
        </div>
      </div>`, { okLabel: 'Export' });
    const $ = (id) => st.dlg.querySelector(`#${id}`);
    const rowsEl = $('vexp_rows');
    const read = () => ({
      scope: st.dlg.querySelector('input[name="vexp_scope"]:checked')?.value || 'artboard',
      padding: Math.max(0, Number($('vexp_padding').value) || 0),
      rows: [...rowsEl.querySelectorAll('.vexp_scale_row')].map((r) => ({ scale: Number(r.querySelector('.vexp_scale').value), suffix: r.querySelector('.vexp_suffix').value, format: r.querySelector('.vexp_format').value })),
      prefix: $('vexp_prefix').value, background: $('vexp_bg').value, bgColor: $('vexp_bgcolor').value, subfolders: $('vexp_subfolders').checked,
    });
    let thumbSeq = 0;
    const thumb = async () => {
      const v = read(), seq = ++thumbSeq;
      const rect = scopeRect(v.scope, v.padding);
      $('vexp_size').textContent = rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)} px at 1x` : 'Nothing to export';
      if (!rect) { $('vexp_thumb').removeAttribute('src'); return; }
      try {
        const scale = Math.min(1, 180 / Math.max(rect.width, rect.height));
        const built = await buildExportSvg({ scope: v.scope, padding: v.padding, background: X.backgroundColor(v.background, { bgColor: v.bgColor, artboard: artboardColor() }), scale, fonts: false, images: false });
        if (seq !== thumbSeq || !open) return;
        $('vexp_thumb').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.svg)}`;
      } catch { /* thumbnail is best effort */ }
    };
    const sync = () => { syncBoardControls(st,read().scope); $('vexp_bgcolor').hidden = $('vexp_bg').value !== 'other'; thumb(); };
    st.dlg.addEventListener('change', (e) => {
      if (e.target.classList.contains('vexp_scale')) {
        const row = e.target.closest('.vexp_scale_row'), suf = row.querySelector('.vexp_suffix');
        if (/^(@[\d.]+x)?$/.test(suf.value)) suf.value = X.defaultSuffix(e.target.value);
      }
      sync();
    });
    st.dlg.addEventListener('input', (e) => { if (e.target.id === 'vexp_padding') thumb(); });
    st.dlg.addEventListener('click', (e) => {
      if (e.target.closest('.vexp_del')) { if (rowsEl.children.length > 1) e.target.closest('.vexp_scale_row').remove(); }
      else if (e.target.id === 'vexp_add_scale') {
        const used = read().rows.map((r) => r.scale);
        const next = X.SCALE_PRESETS.find((k) => !used.includes(k)) || 1;
        rowsEl.insertAdjacentHTML('beforeend', rowHtml({ scale: next, suffix: X.defaultSuffix(next), format: 'png' }));
      }
    });
    sync();
    st.onOk = async () => {
      const v = read();
      saveSettings({ ...loadSettings(), ...v });
      let boards;try{boards=exportBoards(st,v.scope);}catch(e){toast(e.message,'error');return;}
      const requests=boards.flatMap(board=>v.rows.map(r=>({board,r})));
      const paths=X.uniquePaths(requests.map(({board,r})=>X.exportFileName({prefix:v.prefix,title:board?.name||title(),scope:v.scope,suffix:r.suffix,ext:X.formatInfo(r.format).ext,subfolder:v.subfolders&&v.rows.length>1?X.subfolderFor(r):''})));
      const jobs = [], skipped = [];
      requests.forEach(({board,r},i)=>{
        const info=X.formatInfo(r.format),job={board,scope:v.scope,padding:v.padding,scale:r.scale,ppi:72*r.scale,format:r.format,background:v.background,bgColor:v.bgColor,quality:info.quality};
        const problem=sizeProblem(job);if(problem)skipped.push(`${paths[i]}: ${problem}`);else jobs.push({path:paths[i],job});
      });
      if (!jobs.length) { toast(skipped[0] || 'Nothing to export', 'error'); return; }
      busy(st, true);
      try {
        let result;
        if (jobs.length === 1) {
          progress(st, `Rendering 1 of 1 — ${jobs[0].path}`, 0.5);
          result = await deliverOne(jobs[0].job, jobs[0].path.split('/').pop());
          if (!result.cancelled) result = { done: 1, failed: [] };
        } else {
          result = await deliverMany(jobs, { onProgress: (i, n, p) => progress(st, `Rendering ${i} of ${n} — ${p}`, (i - 1) / n), isCancelled: () => st.cancelled });
        }
        if (result.cancelled) { busy(st, false); st.cancelled = false; st.dlg.querySelector('.vexp_progress').hidden = true; return; }
        closeDialog();
        const failed = [...skipped, ...(result.failed || [])];
        if (result.done) toast(`Exported ${result.done} file${result.done === 1 ? '' : 's'}${result.method === 'zip' ? ' (ZIP)' : ''}`, 'success');
        for (const f of failed) toast(f, 'error');
      } catch (e) {
        busy(st, false);
        toast(`Export failed: ${errorText(e)}`, 'error');
      }
    };
    return st;
  }

  /* Effect ▸ Document Raster Effects Settings… */
  function openRasterSettings() {
    const r = getRaster();
    const st = dialog('vexp_raster_settings', 'Document Raster Effects Settings', `
      <fieldset><legend>Resolution</legend>
        ${[[72, 'Screen (72 ppi)'], [150, 'Medium (150 ppi)'], [300, 'High (300 ppi)']].map(([k, l]) => `<label class="vexp_scope"><input type="radio" name="vexp_rppi" value="${k}"${k === r.ppi ? ' checked' : ''}> ${l}</label>`).join('')}
      </fieldset>
      <fieldset><legend>Background</legend>
        <label class="vexp_scope"><input type="radio" name="vexp_rbg" value="white"${r.background === 'white' ? ' checked' : ''}> White</label>
        <label class="vexp_scope"><input type="radio" name="vexp_rbg" value="transparent"${r.background === 'transparent' ? ' checked' : ''}> Transparent</label>
      </fieldset>
      <p class="vexp_note">Saved with this document; File ▸ Export As uses it as the default resolution and background.</p>`, { okLabel: 'OK' });
    st.onOk = () => {
      const ppi = Number(st.dlg.querySelector('input[name="vexp_rppi"]:checked')?.value || 72);
      const background = st.dlg.querySelector('input[name="vexp_rbg"]:checked')?.value || 'white';
      setRaster({ ppi, background });
      closeDialog();
    };
    return st;
  }

  /* Legacy SVG-Edit "exported" event (no popup): deliver as a download. */
  function legacyExported(t) {
    try {
      if (!t) return;
      const ext = String(t.type || 'png').toLowerCase().replace('jpeg', 'jpg');
      if (t.bloburl) fetch(t.bloburl).then((r) => r.blob()).then((b) => downloadBlob(b, `${X.safeBase(title())}.${ext}`, { mimeType: t.mimeType }));
    } catch (e) { console.warn('[export] legacy export failed', e); }
  }

  /* ───────── menu + shortcut ───────── */
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', (e) => { if (e.currentTarget.classList.contains('disabled')) return; fn(); });
  on('action_export_screens', () => openExportForScreens());
  on('action_export_as', () => openExportAs());
  on('action_export_svg', () => openExportAs({ format: 'svg' }));
  on('action_export_png', () => openExportAs({ format: 'png' }));
  on('action_export_pdf', () => openExportAs({ format: 'pdf' }));
  // ⌥⌘E Export for Screens (Illustrator). e.code: Alt changes e.key on macOS.
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.shiftKey || e.code !== 'KeyE') return;
    if (open || ['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    e.preventDefault(); e.stopImmediatePropagation();
    openExportForScreens();
  }, true);

  const api = {
    buildExportSvg, rasterize, renderJob, deliverOne, deliverMany, sizeProblem, scopeRect,
    openExportAs, openExportForScreens, openRasterSettings, close: closeDialog,
    getRaster, setRaster, legacyExported, debug, core: X,
  };
  window.__visterasExport = api;
  return api;
}
