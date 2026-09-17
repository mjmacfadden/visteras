/**
 * Visteras Vector — logo-grade client-side raster → vector trace.
 * Uses vendored ImageTracer.js. Tuned for flat logos/icons (not photos).
 */
const TRACE_GROUP_CLASS = 'visteras-traced';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** @typedef {'logo'|'icon'|'detailed'} TracePresetId */

const PRESETS = {
  logo: {
    id: 'logo',
    label: 'Logo',
    colors: 5,
    colorsMin: 2,
    colorsMax: 8,
    bw: false,
    ignoreWhite: true,
    pathomit: 8,
    ltres: 0.8,
    qtres: 0.8,
    colorquantcycles: 4,
    colorsampling: 0,
    linefilter: false,
    rightangleenhance: true,
    contrast: 1.08,
    flattenWhite: true,
    whiteThresh: 245,
  },
  icon: {
    id: 'icon',
    label: 'Icon (B/W)',
    colors: 2,
    colorsMin: 2,
    colorsMax: 2,
    bw: true,
    ignoreWhite: true,
    pathomit: 10,
    ltres: 0.6,
    qtres: 0.6,
    colorquantcycles: 3,
    colorsampling: 0,
    linefilter: true,
    rightangleenhance: true,
    contrast: 1.15,
    flattenWhite: true,
    whiteThresh: 240,
  },
  detailed: {
    id: 'detailed',
    label: 'Detailed logo',
    colors: 10,
    colorsMin: 2,
    colorsMax: 16,
    bw: false,
    ignoreWhite: false,
    pathomit: 4,
    ltres: 0.5,
    qtres: 0.5,
    colorquantcycles: 5,
    colorsampling: 2,
    linefilter: false,
    rightangleenhance: true,
    contrast: 1.04,
    flattenWhite: true,
    whiteThresh: 250,
  },
};

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

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image for tracing'));
    if (!src.startsWith('data:')) {
      try { img.crossOrigin = 'anonymous'; } catch (_) { /* ignore */ }
    }
    img.src = src;
  });
}

/**
 * Draw + optional preprocess (contrast, flatten near-white) → ImageData.
 */
function imageToImageData(img, ui, maxSide = 1400) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Image has no dimensions');
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imgd = ctx.getImageData(0, 0, w, h);
  preprocessImageData(imgd, ui);
  ctx.putImageData(imgd, 0, 0);
  return { imgd, width: w, height: h, canvas };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function preprocessImageData(imgd, ui) {
  const d = imgd.data;
  const contrast = Number(ui.contrast) || 1;
  const flatten = !!ui.flattenWhite;
  const thresh = Number(ui.whiteThresh) || 245;
  const mid = 128;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (contrast !== 1) {
      r = clampByte((r - mid) * contrast + mid);
      g = clampByte((g - mid) * contrast + mid);
      b = clampByte((b - mid) * contrast + mid);
    }
    if (flatten && r >= thresh && g >= thresh && b >= thresh) {
      r = g = b = 255;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

function buildTraceOptions(ui) {
  const numberofcolors = ui.bw
    ? 2
    : Math.max(2, Math.min(16, ui.colors | 0 || 5));
  return {
    numberofcolors,
    colorsampling: ui.colorsampling != null ? ui.colorsampling : (ui.bw ? 0 : 0),
    colorquantcycles: ui.colorquantcycles != null ? ui.colorquantcycles : 4,
    pathomit: ui.pathomit != null ? ui.pathomit : (ui.simplify ? 12 : 4),
    ltres: ui.ltres != null ? ui.ltres : 0.8,
    qtres: ui.qtres != null ? ui.qtres : 0.8,
    rightangleenhance: ui.rightangleenhance !== false,
    blurradius: 0,
    blurdelta: 20,
    scale: 1,
    strokewidth: 0,
    linefilter: !!ui.linefilter,
    roundcoords: ui.roundcoords != null ? ui.roundcoords : 1,
    viewbox: false,
    desc: false,
    layering: 0,
  };
}

function rgbToHex(r, g, b) {
  const h = (n) => clampByte(n | 0).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function fillFromPalette(pal) {
  if (!pal) return '#000000';
  if (pal.a != null && pal.a < 8) return 'none';
  return rgbToHex(pal.r, pal.g, pal.b);
}

function isNearWhiteFill(hex, threshold = 245) {
  const m = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return r >= threshold && g >= threshold && b >= threshold;
}

/**
 * Build path `d` from an ImageTracer path sample (incl. holes, reversed).
 * Mirrors ImageTracer.svgpathstring hole handling so fill-rule evenodd works.
 */
function pathSampleToD(smp, holeChildrenSamples, roundcoords = 1, transformPoint = null) {
  if (!smp || !smp.segments || !smp.segments.length) return '';
  const rnd = (v) => (roundcoords === -1 ? v : +Number(v).toFixed(roundcoords));
  const tf = transformPoint || ((x, y) => ({ x: rnd(x), y: rnd(y) }));

  let d = '';
  const segs = smp.segments;
  const p0 = tf(segs[0].x1, segs[0].y1);
  d += `M ${p0.x} ${p0.y} `;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const p2 = tf(s.x2, s.y2);
    d += `${s.type} ${p2.x} ${p2.y} `;
    if (Object.prototype.hasOwnProperty.call(s, 'x3')) {
      const p3 = tf(s.x3, s.y3);
      d += `${p3.x} ${p3.y} `;
    }
  }
  d += 'Z ';

  const holes = holeChildrenSamples || [];
  for (let h = 0; h < holes.length; h++) {
    const hsmp = holes[h];
    if (!hsmp || !hsmp.segments || !hsmp.segments.length) continue;
    const hsegs = hsmp.segments;
    const last = hsegs[hsegs.length - 1];
    if (Object.prototype.hasOwnProperty.call(last, 'x3')) {
      const plast = tf(last.x3, last.y3);
      d += `M ${plast.x} ${plast.y} `;
    } else {
      const plast = tf(last.x2, last.y2);
      d += `M ${plast.x} ${plast.y} `;
    }
    for (let pcnt = hsegs.length - 1; pcnt >= 0; pcnt--) {
      const s = hsegs[pcnt];
      d += `${s.type} `;
      if (Object.prototype.hasOwnProperty.call(s, 'x3')) {
        const p2 = tf(s.x2, s.y2);
        d += `${p2.x} ${p2.y} `;
      }
      const p1 = tf(s.x1, s.y1);
      d += `${p1.x} ${p1.y} `;
    }
    d += 'Z ';
  }
  return d.trim();
}

/**
 * Convert tracedata → nested groups: outer traced group, subgroup per palette color.
 */
function tracedataToColorGroups(tracedata, options, ui, transformPoint = null) {
  const layers = tracedata.layers || [];
  const palette = tracedata.palette || [];
  const colorGroups = [];

  for (let lnum = 0; lnum < layers.length; lnum++) {
    const layer = layers[lnum];
    const fill = fillFromPalette(palette[lnum]);
    if (fill === 'none') continue;
    if (ui.ignoreWhite && isNearWhiteFill(fill, ui.whiteThresh || 245)) continue;

    const paths = [];
    for (let pnum = 0; pnum < layer.length; pnum++) {
      const smp = layer[pnum];
      if (!smp || smp.isholepath) continue;
      if (options.linefilter && smp.segments && smp.segments.length < 3) continue;
      const holeIdxs = smp.holechildren || [];
      const holeSamples = holeIdxs.map((idx) => layer[idx]).filter(Boolean);
      const d = pathSampleToD(smp, holeSamples, options.roundcoords, transformPoint);
      if (!d) continue;
      paths.push({ d, fill });
    }
    if (paths.length) {
      colorGroups.push({ fill, paths });
    }
  }
  return colorGroups;
}

function makePointTransformer(imageEl, srcW, srcH, roundcoords = 1) {
  let bbox = null;
  try {
    if (typeof imageEl.getBBox === 'function') bbox = imageEl.getBBox();
  } catch (_) { /* ignore */ }

  const x = (bbox && Number.isFinite(bbox.x)) ? bbox.x : (parseFloat(imageEl.getAttribute('x')) || 0);
  const y = (bbox && Number.isFinite(bbox.y)) ? bbox.y : (parseFloat(imageEl.getAttribute('y')) || 0);
  const destW = (bbox && bbox.width > 0) ? bbox.width : (parseFloat(imageEl.getAttribute('width')) || srcW);
  const destH = (bbox && bbox.height > 0) ? bbox.height : (parseFloat(imageEl.getAttribute('height')) || srcH);
  const par = (imageEl.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();

  let renderX = x;
  let renderY = y;
  let renderW = destW;
  let renderH = destH;

  if (par !== 'none' && srcW > 0 && srcH > 0) {
    const scale = Math.min(destW / srcW, destH / srcH);
    renderW = srcW * scale;
    renderH = srcH * scale;
    if (par.includes('xMid')) {
      renderX = x + (destW - renderW) / 2;
    } else if (par.includes('xMax')) {
      renderX = x + (destW - renderW);
    }
    if (par.includes('YMid')) {
      renderY = y + (destH - renderH) / 2;
    } else if (par.includes('YMax')) {
      renderY = y + (destH - renderH);
    }
  }

  const sx = renderW / srcW;
  const sy = renderH / srcH;

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
    return {
      x: rnd(lx),
      y: rnd(ly),
    };
  };
}

function ensureTraceDialog() {
  let dlg = document.getElementById('visteras_trace_dialog');
  if (dlg) return dlg;

  dlg = document.createElement('div');
  dlg.id = 'visteras_trace_dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', 'Trace Image');
  dlg.style.cssText = [
    'display:none', 'position:fixed', 'inset:0', 'z-index:100000',
    'background:rgba(0,0,0,0.5)', 'align-items:center', 'justify-content:center',
  ].join(';');

  dlg.innerHTML = `
    <div style="background:#252526;color:#ddd;border:1px solid #444;border-radius:10px;padding:16px 18px;width:min(520px,94vw);max-height:92vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,0.55);">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:4px;">
        <div style="font-size:15px;font-weight:600;color:#fa7c1b;">Trace Image</div>
        <div style="font-size:10px;color:#888;">Logo-grade · client-side</div>
      </div>
      <p style="font-size:11px;color:#aaa;margin:0 0 12px;line-height:1.45;">
        Best for <strong style="color:#ccc;font-weight:600;">flat logos and icons</strong> with few colors.
        Photos and soft gradients will look poor — use Studio for those.
      </p>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;" id="trace_preset_row">
        <button type="button" data-preset="logo" class="trace_preset_btn" style="flex:1;min-width:90px;height:28px;border-radius:4px;border:1px solid #fa7c1b;background:#fa7c1b;color:#111;font-size:11px;font-weight:600;cursor:pointer;">Logo</button>
        <button type="button" data-preset="icon" class="trace_preset_btn" style="flex:1;min-width:90px;height:28px;border-radius:4px;border:1px solid #555;background:#333;color:#ddd;font-size:11px;cursor:pointer;">Icon (B/W)</button>
        <button type="button" data-preset="detailed" class="trace_preset_btn" style="flex:1;min-width:90px;height:28px;border-radius:4px;border:1px solid #555;background:#333;color:#ddd;font-size:11px;cursor:pointer;">Detailed logo</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:10px;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#bbb;">
          <span>Colors <span id="trace_colors_val" style="color:#fa7c1b;">5</span></span>
          <input id="trace_colors" type="range" min="2" max="8" value="5" style="width:100%;accent-color:#fa7c1b;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#bbb;">
          <span>Despeckle <span id="trace_despeckle_val" style="color:#fa7c1b;">8</span></span>
          <input id="trace_despeckle" type="range" min="0" max="24" value="8" style="width:100%;accent-color:#fa7c1b;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#bbb;">
          <span>Corner crispness <span id="trace_crisp_val" style="color:#fa7c1b;">Med</span></span>
          <input id="trace_crisp" type="range" min="0" max="2" step="1" value="1" style="width:100%;accent-color:#fa7c1b;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#bbb;">
          <span>Simplify quality <span id="trace_quality_val" style="color:#fa7c1b;">Balanced</span></span>
          <input id="trace_quality" type="range" min="0" max="2" step="1" value="1" style="width:100%;accent-color:#fa7c1b;" />
        </label>
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0;cursor:pointer;">
        <input type="checkbox" id="trace_ignore_white" checked style="accent-color:#fa7c1b;" /> Ignore white / background
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0;cursor:pointer;">
        <input type="checkbox" id="trace_preprocess" checked style="accent-color:#fa7c1b;" /> Preprocess (contrast + flatten near-white)
      </label>

      <div style="margin:12px 0 8px;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:6px;min-height:140px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">
        <div id="trace_preview_status" style="position:absolute;top:6px;left:8px;font-size:10px;color:#888;">Preview</div>
        <div id="trace_preview_host" style="width:100%;height:180px;display:flex;align-items:center;justify-content:center;padding:8px;"></div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
        <button type="button" id="trace_cancel" style="height:30px;padding:0 14px;background:#333;border:1px solid #555;color:#ddd;border-radius:4px;cursor:pointer;">Cancel</button>
        <button type="button" id="trace_apply" style="height:30px;padding:0 14px;background:#fa7c1b;border:1px solid #fa7c1b;color:#111;border-radius:4px;cursor:pointer;font-weight:600;">Apply Trace</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeTraceDialog();
  });
  dlg.querySelector('#trace_cancel').addEventListener('click', () => closeTraceDialog());

  return dlg;
}

function closeTraceDialog() {
  const dlg = document.getElementById('visteras_trace_dialog');
  if (!dlg) return;
  dlg.style.display = 'none';
  if (dlg._previewTimer) clearTimeout(dlg._previewTimer);
  dlg._session = null;
  const host = dlg.querySelector('#trace_preview_host');
  if (host) host.innerHTML = '';
}

function crispLabel(v) {
  return ['Soft', 'Med', 'Sharp'][v] || 'Med';
}

function qualityLabel(v) {
  return ['Smooth', 'Balanced', 'Accurate'][v] || 'Balanced';
}

/** Map UI crispness 0–2 → ltres/qtres (lower = sharper corners / tighter fit). */
function crispToRes(v) {
  return [1.4, 0.8, 0.35][v] ?? 0.8;
}

/** Map simplify quality 0–2 → pathomit + linefilter. */
function qualityToOmit(v) {
  // Despeckle slider owns pathomit; quality mainly toggles linefilter + coord rounding.
  return [
    { linefilter: true, roundcoords: 1 },
    { linefilter: false, roundcoords: 1 },
    { linefilter: false, roundcoords: 2 },
  ][v] || { linefilter: false, roundcoords: 1 };
}

function readUiFromDialog(dlg) {
  const presetId = dlg._presetId || 'logo';
  const base = { ...PRESETS[presetId] };
  const colorsEl = dlg.querySelector('#trace_colors');
  const despeckle = parseInt(dlg.querySelector('#trace_despeckle').value, 10);
  const crisp = parseInt(dlg.querySelector('#trace_crisp').value, 10);
  const quality = parseInt(dlg.querySelector('#trace_quality').value, 10);
  const ignoreWhite = dlg.querySelector('#trace_ignore_white').checked;
  const preprocess = dlg.querySelector('#trace_preprocess').checked;
  const q = qualityToOmit(quality);
  const res = crispToRes(crisp);

  return {
    presetId,
    bw: !!base.bw,
    colors: base.bw ? 2 : (parseInt(colorsEl.value, 10) || base.colors),
    ignoreWhite,
    pathomit: Number.isFinite(despeckle) ? despeckle : base.pathomit,
    ltres: res,
    qtres: res,
    colorquantcycles: base.colorquantcycles,
    colorsampling: base.bw ? 0 : base.colorsampling,
    linefilter: q.linefilter,
    roundcoords: q.roundcoords,
    rightangleenhance: true,
    contrast: preprocess ? base.contrast : 1,
    flattenWhite: preprocess ? base.flattenWhite : false,
    whiteThresh: base.whiteThresh,
    simplify: quality < 2,
  };
}

function stylePresetButtons(dlg, activeId) {
  dlg.querySelectorAll('.trace_preset_btn').forEach((btn) => {
    const on = btn.getAttribute('data-preset') === activeId;
    btn.style.background = on ? '#fa7c1b' : '#333';
    btn.style.borderColor = on ? '#fa7c1b' : '#555';
    btn.style.color = on ? '#111' : '#ddd';
    btn.style.fontWeight = on ? '600' : '400';
  });
}

function applyPresetToControls(dlg, presetId) {
  const p = PRESETS[presetId] || PRESETS.logo;
  dlg._presetId = p.id;
  stylePresetButtons(dlg, p.id);
  const colors = dlg.querySelector('#trace_colors');
  colors.min = String(p.colorsMin);
  colors.max = String(p.colorsMax);
  colors.value = String(p.colors);
  colors.disabled = !!p.bw;
  dlg.querySelector('#trace_colors_val').textContent = String(p.colors);
  dlg.querySelector('#trace_despeckle').value = String(p.pathomit);
  dlg.querySelector('#trace_despeckle_val').textContent = String(p.pathomit);
  // Map ltres back to crisp slider roughly
  let crisp = 1;
  if (p.ltres <= 0.45) crisp = 2;
  else if (p.ltres >= 1.2) crisp = 0;
  dlg.querySelector('#trace_crisp').value = String(crisp);
  dlg.querySelector('#trace_crisp_val').textContent = crispLabel(crisp);
  let quality = 1;
  if (p.pathomit >= 14) quality = 0;
  else if (p.pathomit <= 3) quality = 2;
  dlg.querySelector('#trace_quality').value = String(quality);
  dlg.querySelector('#trace_quality_val').textContent = qualityLabel(quality);
  dlg.querySelector('#trace_ignore_white').checked = !!p.ignoreWhite;
  dlg.querySelector('#trace_preprocess').checked = true;
}

async function computeTracePayload(img, ui) {
  if (!window.ImageTracer) throw new Error('ImageTracer library is not loaded');
  const { imgd, width, height } = imageToImageData(img, ui);
  const options = buildTraceOptions(ui);
  const tracedata = window.ImageTracer.imagedataToTracedata(imgd, options);
  const colorGroups = tracedataToColorGroups(tracedata, options, ui);
  if (!colorGroups.length) {
    throw new Error('No paths produced — try more colors or turn off Ignore white');
  }
  // Preview SVG string (also validates)
  const previewSvg = window.ImageTracer.getsvgstring(tracedata, {
    ...options,
    strokewidth: 0,
    viewbox: true,
    scale: 1,
  });
  return { colorGroups, width, height, previewSvg, tracedata, options };
}

function renderPreview(dlg, previewSvg) {
  const host = dlg.querySelector('#trace_preview_host');
  const status = dlg.querySelector('#trace_preview_status');
  if (!host) return;
  host.innerHTML = '';
  if (!previewSvg) {
    if (status) status.textContent = 'No preview';
    return;
  }
  // Inline SVG thumbnail
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
  wrapper.innerHTML = previewSvg.replace(
    /<svg\b([^>]*)>/i,
    '<svg$1 style="max-width:100%;max-height:164px;width:auto;height:auto;background:repeating-conic-gradient(#333 0% 25%,#2a2a2a 0% 50%) 50%/12px 12px;">',
  );
  // Strip near-white paths from preview if ignore white (approx via CSS not perfect; full strip done on apply)
  host.appendChild(wrapper);
  if (status) status.textContent = 'Live preview';
}

function schedulePreview(dlg) {
  if (dlg._previewTimer) clearTimeout(dlg._previewTimer);
  const status = dlg.querySelector('#trace_preview_status');
  if (status) status.textContent = 'Updating…';
  dlg._previewTimer = setTimeout(async () => {
    const session = dlg._session;
    if (!session || !session.img) return;
    try {
      const ui = readUiFromDialog(dlg);
      const payload = await computeTracePayload(session.img, ui);
      session.lastPayload = payload;
      session.lastUi = ui;
      renderPreview(dlg, payload.previewSvg);
    } catch (err) {
      console.warn('Trace preview failed', err);
      if (status) status.textContent = err.message || 'Preview failed';
      const host = dlg.querySelector('#trace_preview_host');
      if (host) host.innerHTML = '';
    }
  }, 280);
}

function insertTracedGroups(svgEditor, imageEl, payload, ui = null) {
  const sc = svgEditor.svgCanvas;
  const { tracedata, width: srcW, height: srcH, options } = payload;
  const pointTransformer = makePointTransformer(imageEl, srcW, srcH, options.roundcoords);
  const activeUi = ui || (document.getElementById('visteras_trace_dialog') ? readUiFromDialog(document.getElementById('visteras_trace_dialog')) : {});
  // Bake translation, scale, and image transforms directly into path d coordinates
  // so pathedit anchor points line up 1:1 with 0 offset on canvas
  const colorGroups = tracedataToColorGroups(tracedata, options, activeUi, pointTransformer);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('id', sc.getNextId());
  g.setAttribute('class', TRACE_GROUP_CLASS);
  g.setAttribute('data-visteras-traced', '1');
  g.setAttribute('data-name', 'Traced');
  // inkscape-style label for layers panel if present
  try { g.setAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'inkscape:label', 'Traced'); } catch (_) { /* ignore */ }

  colorGroups.forEach((cg) => {
    const cgEl = document.createElementNS(SVG_NS, 'g');
    cgEl.setAttribute('id', sc.getNextId());
    cgEl.setAttribute('data-name', cg.fill);
    cgEl.setAttribute('data-visteras-trace-color', cg.fill);
    try { cgEl.setAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'inkscape:label', cg.fill); } catch (_) { /* ignore */ }

    cg.paths.forEach((p) => {
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('id', sc.getNextId());
      pathEl.setAttribute('d', p.d);
      pathEl.setAttribute('fill', p.fill);
      pathEl.setAttribute('stroke', 'none');
      pathEl.setAttribute('fill-rule', 'evenodd');
      cgEl.appendChild(pathEl);
    });
    g.appendChild(cgEl);
  });

  if (!g.childNodes.length) throw new Error('No usable path data after filtering');

  const parent = imageEl.parentNode;
  const next = imageEl.nextSibling;
  // Keep original raster; insert traced group above it
  if (next) parent.insertBefore(g, next);
  else parent.appendChild(g);

  if (sc.history?.InsertElementCommand && sc.addCommandToHistory) {
    try {
      const { InsertElementCommand } = sc.history;
      sc.addCommandToHistory(new InsertElementCommand(g));
    } catch (_) { /* history optional */ }
  }

  sc.selectOnly([g]);
  svgEditor.topPanel?.updateContextPanel?.();
  return g;
}

function wireDialogControls(dlg) {
  if (dlg._wired) return;
  dlg._wired = true;

  dlg.querySelectorAll('.trace_preset_btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyPresetToControls(dlg, btn.getAttribute('data-preset'));
      schedulePreview(dlg);
    });
  });

  const bindVal = (inputId, labelId, fmt) => {
    const input = dlg.querySelector(inputId);
    const label = dlg.querySelector(labelId);
    input?.addEventListener('input', () => {
      if (label) label.textContent = fmt(input.value);
      schedulePreview(dlg);
    });
  };
  bindVal('#trace_colors', '#trace_colors_val', (v) => String(v));
  bindVal('#trace_despeckle', '#trace_despeckle_val', (v) => String(v));
  bindVal('#trace_crisp', '#trace_crisp_val', (v) => crispLabel(parseInt(v, 10)));
  bindVal('#trace_quality', '#trace_quality_val', (v) => qualityLabel(parseInt(v, 10)));

  dlg.querySelector('#trace_ignore_white')?.addEventListener('change', () => schedulePreview(dlg));
  dlg.querySelector('#trace_preprocess')?.addEventListener('change', () => schedulePreview(dlg));

  dlg.querySelector('#trace_apply')?.addEventListener('click', async () => {
    const session = dlg._session;
    if (!session) return;
    const applyBtn = dlg.querySelector('#trace_apply');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Tracing…';
    try {
      const ui = readUiFromDialog(dlg);
      let payload = session.lastPayload;
      // Recompute if UI drifted
      if (!payload || JSON.stringify(session.lastUi) !== JSON.stringify(ui)) {
        payload = await computeTracePayload(session.img, ui);
      }
      insertTracedGroups(session.svgEditor, session.imageEl, payload, ui);
      closeTraceDialog();
      showToast('Traced paths inserted above the original (grouped by color). Flat logos/icons only — not photos.');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Trace failed');
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply Trace';
    }
  });
}

function getSelectedImage(svgEditor) {
  const sc = svgEditor?.svgCanvas;
  const sel = (sc && typeof sc.getSelectedElements === 'function')
    ? sc.getSelectedElements().filter(Boolean)
    : [];

  let el = svgEditor?.selectedElement || (sel.length === 1 ? sel[0] : null);
  if (!el && sel.length > 0) {
    el = sel[0];
  }
  if (!el && svgEditor?.selectedElements?.length > 0) {
    el = svgEditor.selectedElements[0];
  }

  if (sel.length > 1) {
    const images = sel.filter((item) => (item?.nodeName || item?.tagName || '').toLowerCase() === 'image');
    if (images.length === 1) {
      el = images[0];
    } else {
      return null;
    }
  }

  if (!el) return null;

  const tag = (el.nodeName || el.tagName || '').toLowerCase();
  if (tag === 'image') return el;
  if (el.querySelector) {
    const childImg = el.querySelector('image');
    if (childImg) return childImg;
  }
  return null;
}

async function openTraceDialog(svgEditor) {
  const el = getSelectedImage(svgEditor);
  if (!el) {
    alert('Select a single raster image to trace.');
    return;
  }
  const sc = svgEditor.svgCanvas;
  const href = getImageHref(el, sc);
  if (!href) {
    alert('Selected image has no embedded data to trace.');
    return;
  }
  if (!window.ImageTracer) {
    alert('ImageTracer library is not loaded.');
    return;
  }

  const dlg = ensureTraceDialog();
  wireDialogControls(dlg);
  applyPresetToControls(dlg, 'logo');
  dlg.style.display = 'flex';

  showToast('Tracing is for flat logos and icons — not photos.', 3200);

  try {
    const img = await loadImageElement(href);
    dlg._session = { svgEditor, imageEl: el, img, lastPayload: null, lastUi: null };
    schedulePreview(dlg);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Could not load image for tracing');
    closeTraceDialog();
  }
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasImageTrace({ svgEditor }) {
  if (!svgEditor) return;
  window.__visterasTraceSelectedImage = () => openTraceDialog(svgEditor);

  // Menu: Object → Trace Image… (id must match index.html)
  document.getElementById('action_trace_image')?.addEventListener('click', () => {
    openTraceDialog(svgEditor);
  });
}
