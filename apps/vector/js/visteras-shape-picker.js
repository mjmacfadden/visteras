/**
 * Visteras Vector: Shape library picker in the options bar.
 *
 * Mirrors Studio's Custom Shape tool, whose options bar shows a "Shape:" label and a
 * Studio-styled dropdown (apps/studio/src/js/core/gui/gui-tools.js, `.attributes .item`
 * + select). Vector's library is much larger (SVG-Edit shapelib: 14 categories, hundreds
 * of shapes), so the dropdown opens a body-attached popover (Studio font-picker pattern:
 * fixed position, closes on outside mousedown / Escape) with a category select and a
 * thumbnail grid. The trigger shows the selected shape's preview and name.
 *
 * The chosen path goes into #tool_shapelib's data-draw, which ext-shapes reads on
 * mouseDown. Shown only while the canvas is in "shapelib" mode.
 */

const STORE_KEY = 'visteras_vector_shapelib';

/** "dialog_balloon_1" / "raphael_1" -> "Dialog balloon 1" */
export function prettyShapeName(key) {
  const s = String(key || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Same framing SVG-Edit's explorer used: 5% padding around a size x size box. */
export function shapeViewBox(size = 300) {
  const pad = size * 0.05;
  return [-pad, -pad, size + pad * 2, size + pad * 2].join(' ');
}

/** Thumbnail markup for one shapelib path (UI glyph colour #CCCCCC, like the toolbar). */
export function shapeThumbMarkup(d, { size = 300, fill = false, px = 24 } = {}) {
  const esc = String(d || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const sw = fill ? 0 : size / 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${shapeViewBox(size)}"><path fill="${fill ? '#cccccc' : 'none'}" stroke="#cccccc" stroke-width="${sw}" d="${esc}"/></svg>`;
}

/** Restore {cat, shape} from storage, falling back to the first category / shape. */
export function pickInitial(saved, cats, shapesForCat) {
  const cat = saved && cats.includes(saved.cat) ? saved.cat : cats[0];
  const keys = shapesForCat && cat === (saved && saved.cat) ? Object.keys(shapesForCat) : null;
  const shape = keys && keys.includes(saved.shape) ? saved.shape : null;
  return { cat, shape };
}

const CSS = `
#visteras_shapelib_panel{display:none;align-items:center;margin:0 20px 0 12px;height:100%;font-size:12px;color:#cccccc;white-space:nowrap}
#visteras_shapelib_panel.visible{display:inline-flex}
/* visteras-theme.css forces #tools_top > * {display:flex !important}; out-rank it while inactive. */
#tools_top > #visteras_shapelib_panel:not(.visible),#visteras_shapelib_panel[hidden]{display:none !important}
#visteras_shapelib_panel > label{margin:0 .5rem 0 0;line-height:1;color:#cccccc}
#visteras_shapelib_panel .vsp-trigger{display:inline-flex;align-items:center;gap:6px;height:20px;min-width:130px;max-width:180px;padding:2px 4px;background:#1e1e1e;color:#cccccc;border:1px solid #4a4a4a;border-radius:2px;font:inherit;font-size:11px;cursor:pointer;text-align:left}
#visteras_shapelib_panel .vsp-trigger:hover{border-color:#5a5a5a}
#visteras_shapelib_panel .vsp-trigger[aria-expanded="true"]{border-color:#fa7c1b}
#visteras_shapelib_panel .vsp-preview{width:16px;height:16px;flex:0 0 16px;display:inline-flex}
#visteras_shapelib_panel .vsp-preview svg{width:16px;height:16px}
#visteras_shapelib_panel .vsp-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis}
#visteras_shapelib_panel .vsp-caret{flex:0 0 auto;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid #cccccc;margin-left:2px}
.vsp-menu{position:fixed;z-index:100000;width:292px;max-height:360px;display:flex;flex-direction:column;background:#23232b;border:1px solid #3c3c46;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.5);padding:6px;box-sizing:border-box;font-size:11px;color:#cccccc}
.vsp-menu .vsp-head{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.vsp-menu .vsp-head label{color:#cccccc}
.vsp-menu select{flex:1 1 auto;height:20px;background:#1e1e1e;color:#cccccc;border:1px solid #4a4a4a;border-radius:2px;font-size:11px;padding:2px 4px}
.vsp-menu .vsp-grid{display:grid;grid-template-columns:repeat(8,32px);gap:2px;overflow-y:auto;padding-right:2px}
.vsp-menu .vsp-cell{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:3px;background:transparent;padding:0;cursor:pointer}
.vsp-menu .vsp-cell:hover{background:#3d3d3d}
.vsp-menu .vsp-cell.active{border-color:#fa7c1b;background:#383838}
.vsp-menu .vsp-empty{padding:8px;color:#888}
`;

export function mountShapePicker({ svgEditor } = {}) {
  if (!svgEditor || document.getElementById('visteras_shapelib_panel')) return null;
  const sc = svgEditor.svgCanvas;
  const extPath = svgEditor.configObj?.curConfig?.extPath || './extensions';
  const libBase = () => document.getElementById('tool_shapelib')?.dataset.lib || `${extPath}/ext-shapes/shapelib/`;
  const catLabel = (cat) => {
    try {
      const t = svgEditor.i18next?.t(`shapes:categories.${cat}`);
      if (t && t !== `shapes:categories.${cat}` && t !== `categories.${cat}`) return t;
    } catch {}
    return prettyShapeName(cat);
  };

  const style = document.createElement('style');
  style.id = 'visteras-shape-picker-css';
  style.textContent = CSS;
  document.head.append(style);

  const panel = document.createElement('div');
  panel.id = 'visteras_shapelib_panel';
  panel.className = 'item shape';
  panel.hidden = true;
  panel.innerHTML = '<label for="visteras_shapelib_trigger">Shape:</label>'
    + '<button type="button" id="visteras_shapelib_trigger" class="vsp-trigger" aria-haspopup="listbox" aria-expanded="false" title="Shape library">'
    + '<span class="vsp-preview"></span><span class="vsp-name">Loading…</span><span class="vsp-caret"></span></button>';
  const trigger = panel.querySelector('.vsp-trigger');
  const preview = panel.querySelector('.vsp-preview');
  const nameEl = panel.querySelector('.vsp-name');

  const menu = document.createElement('div');
  menu.id = 'visteras_shapelib_menu';
  menu.className = 'vsp-menu';
  menu.setAttribute('role', 'listbox');
  menu.innerHTML = '<div class="vsp-head"><label for="visteras_shapelib_category">Set:</label><select id="visteras_shapelib_category"></select></div><div class="vsp-grid"></div>';
  const catSelect = menu.querySelector('select');
  const grid = menu.querySelector('.vsp-grid');

  const state = { cats: [], cache: new Map(), cat: null, shape: null, d: null, meta: { size: 300, fill: false } };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch {}

  const loadCat = async (cat) => {
    if (state.cache.has(cat)) return state.cache.get(cat);
    const json = await (await fetch(`${libBase()}${cat}.json`)).json();
    const entry = { data: json.data || {}, size: json.size ?? 300, fill: !!json.fill };
    state.cache.set(cat, entry);
    return entry;
  };
  const writeDraw = () => {
    const btn = document.getElementById('tool_shapelib');
    if (btn && state.d) {
      btn.dataset.draw = state.d;
      btn.dataset.shape = state.shape;
      btn.dataset.category = state.cat;
    }
  };
  const renderTrigger = () => {
    preview.innerHTML = state.d ? shapeThumbMarkup(state.d, { ...state.meta, px: 16 }) : '';
    nameEl.textContent = state.shape ? prettyShapeName(state.shape) : 'Choose shape';
    trigger.title = state.shape ? `${prettyShapeName(state.shape)} (${catLabel(state.cat)})` : 'Shape library';
  };
  const choose = async (cat, shape) => {
    const entry = await loadCat(cat);
    const keys = Object.keys(entry.data);
    if (!keys.length) return;
    const key = keys.includes(shape) ? shape : keys[0];
    Object.assign(state, { cat, shape: key, d: entry.data[key], meta: { size: entry.size, fill: entry.fill } });
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ cat, shape: key })); } catch {}
    writeDraw();
    renderTrigger();
  };
  const renderGrid = async (cat) => {
    grid.innerHTML = '<div class="vsp-empty">Loading…</div>';
    let entry;
    try { entry = await loadCat(cat); } catch { grid.innerHTML = '<div class="vsp-empty">Could not load shapes.</div>'; return; }
    grid.innerHTML = '';
    for (const [key, d] of Object.entries(entry.data)) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'vsp-cell' + (cat === state.cat && key === state.shape ? ' active' : '');
      cell.dataset.shape = key;
      cell.title = prettyShapeName(key);
      cell.setAttribute('role', 'option');
      cell.innerHTML = shapeThumbMarkup(d, { size: entry.size, fill: entry.fill, px: 24 });
      cell.addEventListener('click', async (e) => {
        e.stopPropagation();
        await choose(cat, key);
        close();
      });
      grid.append(cell);
    }
  };
  const onDocDown = (e) => {
    if (trigger.contains(e.target) || menu.contains(e.target)) return;
    close();
  };
  const onDocKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() {
    menu.remove();
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey, true);
  }
  function open() {
    const r = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - 300))}px`;
    menu.style.top = `${r.bottom + 4}px`;
    document.body.append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    catSelect.value = state.cat || state.cats[0] || '';
    renderGrid(catSelect.value);
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onDocKey, true);
  }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.isConnected) close(); else open();
  });
  catSelect.addEventListener('change', () => renderGrid(catSelect.value));
  menu.addEventListener('click', (e) => e.stopPropagation());

  const sync = () => {
    const on = sc.getMode() === 'shapelib';
    panel.classList.toggle('visible', on);
    panel.hidden = !on;
    if (!on && menu.isConnected) close();
    if (on) writeDraw();
  };
  const place = () => {
    const top = document.getElementById('tools_top');
    if (!top) return false;
    const anchor = document.getElementById('history_panel');
    if (anchor && anchor.parentElement === top) anchor.after(panel); else top.append(panel);
    return true;
  };
  place();
  document.addEventListener('modeChange', sync);
  document.addEventListener('visteras:shapelib-ready', writeDraw);

  (async () => {
    try {
      const idx = await (await fetch(`${libBase()}index.json`)).json();
      state.cats = idx.lib || [];
      catSelect.innerHTML = state.cats.map((c) => `<option value="${c}">${catLabel(c)}</option>`).join('');
      const first = pickInitial(saved, state.cats, null);
      const entry = await loadCat(first.cat);
      const init = pickInitial(saved, state.cats, entry.data);
      await choose(init.cat, init.shape);
    } catch (err) {
      console.warn('[shape picker] library failed to load', err);
      nameEl.textContent = 'Unavailable';
    }
    sync();
  })();

  const api = { panel, menu, open, close, choose, state, sync };
  window.__visterasShapePicker = api;
  return api;
}
