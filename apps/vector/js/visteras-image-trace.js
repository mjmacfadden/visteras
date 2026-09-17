/**
 * Visteras Vector — simple client-side raster → vector trace (flat logos/icons).
 * Uses vendored ImageTracer.js. Not for photos.
 */
const TRACE_GROUP_CLASS = 'visteras-traced';

function showToast(message, ms = 4500) {
  let el = document.getElementById('visteras_trace_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_trace_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'max-width:min(420px,90vw)', 'padding:10px 14px',
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
    // data: URLs don't need CORS; remote may taint canvas
    if (!src.startsWith('data:')) {
      try { img.crossOrigin = 'anonymous'; } catch (_) { /* ignore */ }
    }
    img.src = src;
  });
}

function imageToImageData(img, maxSide = 1200) {
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
  return { imgd: ctx.getImageData(0, 0, w, h), width: w, height: h };
}

function buildTraceOptions(ui) {
  const numberofcolors = ui.bw ? 2 : Math.max(2, Math.min(8, ui.colors | 0 || 5));
  const opts = {
    numberofcolors,
    colorsampling: 0,
    colorquantcycles: 3,
    pathomit: ui.simplify ? 12 : 4,
    ltres: ui.simplify ? 1.2 : 0.8,
    qtres: ui.simplify ? 1.2 : 0.8,
    blurradius: 0,
    blurdelta: 20,
    scale: 1,
    strokewidth: 0,
    linefilter: !!ui.simplify,
    roundcoords: 1,
    viewbox: false,
    desc: false,
  };
  if (ui.ignoreWhite) {
    // ImageTracer uses palette; white is often last — also strip after parse
    opts.blurradius = 0;
  }
  return opts;
}

function parseTracedSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Tracer returned invalid SVG');
  }
  const svg = doc.documentElement;
  const paths = [...svg.querySelectorAll('path')];
  return { svg, paths };
}

function stripNearWhitePaths(pathEls, threshold = 245) {
  return pathEls.filter((p) => {
    const fill = (p.getAttribute('fill') || '').trim().toLowerCase();
    if (!fill || fill === 'none') return true;
    const m = fill.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) {
      const rgb = fill.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgb) {
        const r = +rgb[1], g = +rgb[2], b = +rgb[3];
        return !(r >= threshold && g >= threshold && b >= threshold);
      }
      return true;
    }
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return !(r >= threshold && g >= threshold && b >= threshold);
  });
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
    'background:rgba(0,0,0,0.45)', 'align-items:center', 'justify-content:center',
  ].join(';');
  dlg.innerHTML = `
    <div style="background:#252526;color:#ddd;border:1px solid #444;border-radius:8px;padding:16px 18px;min-width:280px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,0.5);">
      <div style="font-size:14px;font-weight:600;color:#fa7c1b;margin-bottom:6px;">Trace Image to Paths</div>
      <p style="font-size:11px;color:#aaa;margin:0 0 12px;line-height:1.4;">
        Best for flat logos and icons with few colors. Photos will look poor.
      </p>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;margin:8px 0;">
        <span>Colors</span>
        <input id="trace_colors" type="number" min="2" max="8" value="5" style="width:64px;background:#1e1e1e;border:1px solid #555;color:#eee;border-radius:4px;padding:4px 6px;" />
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0;cursor:pointer;">
        <input type="checkbox" id="trace_bw" /> Black &amp; white (2 colors)
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0;cursor:pointer;">
        <input type="checkbox" id="trace_ignore_white" checked /> Ignore near-white fills
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0;cursor:pointer;">
        <input type="checkbox" id="trace_simplify" checked /> Simplify paths
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button type="button" id="trace_cancel" style="height:28px;padding:0 12px;background:#333;border:1px solid #555;color:#ddd;border-radius:4px;cursor:pointer;">Cancel</button>
        <button type="button" id="trace_run" style="height:28px;padding:0 12px;background:#fa7c1b;border:1px solid #fa7c1b;color:#111;border-radius:4px;cursor:pointer;font-weight:600;">Trace</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.style.display = 'none';
  });
  dlg.querySelector('#trace_cancel').addEventListener('click', () => {
    dlg.style.display = 'none';
  });
  dlg.querySelector('#trace_bw').addEventListener('change', (e) => {
    const colors = dlg.querySelector('#trace_colors');
    colors.disabled = e.target.checked;
  });
  return dlg;
}

async function runTrace(svgEditor, imageEl, ui) {
  const sc = svgEditor.svgCanvas;
  if (!window.ImageTracer) {
    throw new Error('ImageTracer library is not loaded');
  }
  const href = getImageHref(imageEl, sc);
  if (!href) throw new Error('Selected image has no embedded data');

  const img = await loadImageElement(href);
  const { imgd, width: srcW, height: srcH } = imageToImageData(img);
  const options = buildTraceOptions(ui);
  const svgString = window.ImageTracer.imagedataToSVG(imgd, options);
  let { paths } = parseTracedSvg(svgString);
  if (ui.ignoreWhite) paths = stripNearWhitePaths(paths);
  if (!paths.length) throw new Error('No paths produced — try more colors or turn off Ignore white');

  const svgNS = 'http://www.w3.org/2000/svg';
  const x = parseFloat(imageEl.getAttribute('x')) || 0;
  const y = parseFloat(imageEl.getAttribute('y')) || 0;
  const destW = parseFloat(imageEl.getAttribute('width')) || srcW;
  const destH = parseFloat(imageEl.getAttribute('height')) || srcH;
  const sx = destW / srcW;
  const sy = destH / srcH;

  const g = document.createElementNS(svgNS, 'g');
  g.setAttribute('id', sc.getNextId());
  g.setAttribute('class', TRACE_GROUP_CLASS);
  g.setAttribute('data-visteras-traced', '1');
  g.setAttribute('transform', `translate(${x},${y}) scale(${sx},${sy})`);

  const parent = imageEl.parentNode;
  const next = imageEl.nextSibling;

  paths.forEach((srcPath) => {
    const pathEl = document.createElementNS(svgNS, 'path');
    pathEl.setAttribute('id', sc.getNextId());
    const d = srcPath.getAttribute('d');
    if (!d) return;
    pathEl.setAttribute('d', d);
    ['fill', 'stroke', 'stroke-width', 'fill-rule', 'opacity'].forEach((attr) => {
      const v = srcPath.getAttribute(attr);
      if (v != null) pathEl.setAttribute(attr, v);
    });
    if (!pathEl.getAttribute('stroke')) pathEl.setAttribute('stroke', 'none');
    g.appendChild(pathEl);
  });

  if (!g.childNodes.length) throw new Error('No usable path data after filtering');

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

function openTraceDialog(svgEditor) {
  const el = svgEditor.selectedElement;
  if (!el || el.nodeName !== 'image' || svgEditor.multiselected) {
    alert('Select a single raster image to trace.');
    return;
  }
  const dlg = ensureTraceDialog();
  dlg.style.display = 'flex';
  const runBtn = dlg.querySelector('#trace_run');
  const onRun = async () => {
    runBtn.removeEventListener('click', onRun);
    const ui = {
      colors: parseInt(dlg.querySelector('#trace_colors').value, 10) || 5,
      bw: dlg.querySelector('#trace_bw').checked,
      ignoreWhite: dlg.querySelector('#trace_ignore_white').checked,
      simplify: dlg.querySelector('#trace_simplify').checked,
    };
    dlg.style.display = 'none';
    showToast('Tracing logo… (flat logos/icons only, not photos)');
    try {
      await runTrace(svgEditor, el, ui);
      showToast('Traced paths inserted above the original image. Delete or hide the raster if you want.');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Trace failed');
    }
  };
  runBtn.addEventListener('click', onRun);
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasImageTrace({ svgEditor }) {
  if (!svgEditor) return;
  window.__visterasTraceSelectedImage = () => openTraceDialog(svgEditor);

  document.getElementById('action_trace_image')?.addEventListener('click', () => {
    openTraceDialog(svgEditor);
  });
}
