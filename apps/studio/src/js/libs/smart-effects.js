import { blendEffectMask, effectMaskRuntime } from './effect-masks.js';
import app from '../app.js';
import config from '../config.js';
import alertify from 'alertifyjs/build/alertify.min.js';

// Versioned, serializable recipes; runtime surfaces live only in this weak cache.
const cache = new WeakMap();
const pixels = new Set(['black_and_white', 'box_blur', 'dither', 'edge', 'emboss', 'enrich', 'grains', 'heatmap', 'mosaic', 'oil', 'sharpen', 'solarize']);
export const isSmartEffect = f => f.name.startsWith('smart:');
export const isContentEffect = isSmartEffect;
export function surface(source) {
 const c = document.createElement('canvas');
 c.width = source.naturalWidth || source.width; c.height = source.naturalHeight || source.height;
 c.getContext('2d').drawImage(source, 0, 0); return c;
}
export function seeded(seed) {
 let state = seed >>> 0;
 return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function applyEffect(input, effect) {
 const c = surface(input), ctx = c.getContext('2d', {willReadFrequently: true});
 if (effect.params._version !== 1) throw new Error('Unsupported Smart Effect version.');
 const key = effect.name.slice(6), module = app.GUI.modules[key];
 if (!module) throw new Error('Unknown Smart Effect: ' + key);
 const name = key.split('/').pop(), params = effect.params;
 const random = seeded(params._seed);
 let result;
 if (module.render_pre) {
  ctx.clearRect(0, 0, c.width, c.height);
  const data = {...effect, name:key.split('/').pop()};
  const layer = {x:0, y:0, width:c.width, height:c.height, rotate:0};
  module.render_pre(ctx, data, layer); ctx.drawImage(input, 0, 0); module.render_post(ctx, data, layer);
 } else if (key === 'image/raw_develop') result = module.develop(ctx.getImageData(0, 0, c.width, c.height), params, random);
 else if (name === 'grains') result = module.change(ctx.getImageData(0, 0, c.width, c.height), params, random);
 else if (name === 'vintage') {
  // Vintage owns random scratch coordinates; reset them for each source size and seed.
  const previous = module.Vintage.random;
  try { module.Vintage.random = random; module.Vintage.reset_random_values(c.width, c.height); module.change(c, params); }
  finally { module.Vintage.random = previous; }
 } else if (pixels.has(name)) result = module.change(ctx.getImageData(0, 0, c.width, c.height), params);
 else if (module.change.length >= 3) result = module.change(c, c.width, c.height);
 else result = module.change(c, params);
 if (result instanceof ImageData) ctx.putImageData(result, 0, 0);
 else if (result && result !== c) { ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(result, 0, 0); }
 return blendEffectMask(input, c, effect.params._mask);
}
export function renderSmart(layer, stopId = null, disabled = null) {
 const source = config.smart_sources[layer.smart_source_id];
 const filters = [];
 for (const f of layer.filters || []) {
  if (stopId != null && String(f.id) === String(stopId)) break;
  if (!isContentEffect(f) || f.disabled || f.visible === false) continue;
  if (Array.isArray(disabled) ? disabled.includes(f.id) || disabled.includes(f.name) : disabled != null && (disabled === f.id || disabled === f.name)) continue;
  filters.push(f);
 }
 const link = source ? source.link : layer.link;
 if (!filters.length) return link;
 const key = JSON.stringify([source && source.revision, filters]);
 let entries = cache.get(link);
 if (!entries) { entries = new Map(); cache.set(link, entries); }
 const painting=filters.some(f=>f.params._mask && effectMaskRuntime(f.params._mask).link_canvas);
 if (!painting && entries.has(key)) { const hit = entries.get(key); entries.delete(key); entries.set(key, hit); return hit; }
 let canvas = link;
 for (const f of filters) canvas = applyEffect(canvas, f);
 if (!painting) entries.set(key, canvas);
 // Bound retained surfaces per shared source; undo/history never owns these buffers.
 while (entries.size > 4) entries.delete(entries.keys().next().value);
 return canvas;
}
export function saveEffect(layer, key, params, id, documentId) {
 if (app.Documents.active_id !== documentId || !config.layers.includes(layer) || layer.locked) throw new Error('The target layer changed or is locked.');
 // Validate/render before committing so unsupported GPU effects never silently enter the stack.
 applyEffect(renderSmart(layer, id), {name:'smart:' + key, params});
 return app.State.do_action(new app.Actions.Add_layer_filter_action(layer.id, 'smart:' + key, params, id));
}
export function recipe(params = {}, old) {
 return {...params, ...(old && old._mask ? {_mask:old._mask} : {}), _version:1, _seed:old ? old._seed : Math.floor(Math.random() * 4294967296)};
}
export function smartDialog(module, key, settings, id) {
 const layer = config.layer, documentId = app.Documents.active_id;
 if (layer.locked) { alertify.error('Unlock the layer to edit Smart Effects.'); return; }
 const old = (layer.filters || []).find(f => String(f.id) === String(id));
 const base = recipe({}, old && old.params);
 for (const p of settings.params || []) if (old && p.name in old.params) p.value = old.params[p.name];
 settings.comment = 'Smart Effect: editable settings applied to the entire source, before the layer mask and styles.';
 settings.preview_source = surface(renderSmart(layer, id));
 let previewError = false;
 settings.on_change = (params, ctx, w, h) => {
  try {
  const result = applyEffect(settings.preview_source, {name:'smart:' + key, params:{...params, ...base}});
  ctx.clearRect(0, 0, w, h); module.POP.drawImageContain(ctx, result, 0, 0, w, h);
  } catch (error) { if (!previewError) alertify.error(error.message); previewError = true; }
 };
 let saving = false;
 settings.on_finish = async params => {
  if (saving) return false;
  saving = true;
  try { const result = await saveEffect(layer, key, {...params, ...base}, id, documentId); if (result.status !== 'completed') throw result.reason; }
  catch (error) { alertify.error(error.message); return false; }
  finally { saving = false; }
 };
 module.POP.show(settings);
}
export function smartPreset(module, key, id) {
 smartDialog(module, key, {title:key.split('/').pop().replace(/_/g, ' '), preview:true, effects:true, params:[]}, id);
}
