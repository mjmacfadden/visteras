/**
 * Visteras Vector — Symbols data model (gravit-gap-5).
 * Panel symbols are <symbol data-v-symbol overflow="visible"> in defs; instances
 * are <use href="#…" data-v-instance transform="…">. No viewBox: registration is
 * (0,0) in symbol space. Persistence is entirely data-* on the SVG (survives the
 * sanitizer); .vvd needs no new fields. See reports/vector-symbols-spec-2026-10-08.md.
 */
export const ATTR = {
  symbol: 'data-v-symbol',
  uid: 'data-v-symbol-uid',
  name: 'data-v-symbol-name',
  type: 'data-v-symbol-type',       // dynamic | static
  exportType: 'data-v-symbol-export', // graphic | movieclip
  reg: 'data-v-symbol-reg',         // nw|n|ne|w|c|e|sw|s|se
  rev: 'data-v-symbol-rev',
  instance: 'data-v-instance',
  edit: 'data-v-symbol-edit',
};

export const REG_POINTS = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
export const REG_DEFAULT = 'c';

export const isPanelSymbol = (el) => el?.localName === 'symbol' && el.getAttribute?.(ATTR.symbol) === '1';
export const isInstance = (el) => el?.localName === 'use' && (el.getAttribute?.(ATTR.instance) === '1' || !!symbolIdOfUse(el));
export const isEditingGroup = (el) => el?.getAttribute?.(ATTR.edit) === '1';

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function symbolIdOfUse(use) {
  const href = use?.getAttribute?.('href') || use?.getAttribute?.('xlink:href') || '';
  return href.startsWith('#') ? href.slice(1) : null;
}

export function getPanelSymbols(content) {
  if (!content) return [];
  return [...content.querySelectorAll(`symbol[${ATTR.symbol}="1"]`)];
}

export function symbolById(content, id) {
  if (!content || !id) return null;
  const el = content.ownerDocument?.getElementById?.(id) || content.querySelector?.(`#${CSS.escape?.(id) || id}`);
  return isPanelSymbol(el) ? el : null;
}

export function instancesOf(content, symbolId) {
  if (!content || !symbolId) return [];
  return [...content.querySelectorAll('use')].filter((u) => symbolIdOfUse(u) === symbolId);
}

export function readSymbolMeta(sym) {
  if (!sym) return null;
  return {
    id: sym.id || '',
    uid: sym.getAttribute(ATTR.uid) || '',
    name: sym.getAttribute(ATTR.name) || sym.querySelector?.(':scope > title')?.textContent || 'Symbol',
    type: sym.getAttribute(ATTR.type) === 'static' ? 'static' : 'dynamic',
    exportType: sym.getAttribute(ATTR.exportType) === 'movieclip' ? 'movieclip' : 'graphic',
    reg: REG_POINTS.includes(sym.getAttribute(ATTR.reg)) ? sym.getAttribute(ATTR.reg) : REG_DEFAULT,
    rev: Number(sym.getAttribute(ATTR.rev)) || 1,
  };
}

export function writeSymbolMeta(sym, meta) {
  sym.setAttribute(ATTR.symbol, '1');
  sym.setAttribute('overflow', 'visible');
  if (meta.uid) sym.setAttribute(ATTR.uid, meta.uid);
  if (meta.name != null) {
    sym.setAttribute(ATTR.name, meta.name);
    let title = sym.querySelector?.(':scope > title');
    if (!title && typeof document !== 'undefined') {
      title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      sym.insertBefore(title, sym.firstChild);
    }
    if (title) title.textContent = meta.name;
  }
  if (meta.type) sym.setAttribute(ATTR.type, meta.type);
  if (meta.exportType) sym.setAttribute(ATTR.exportType, meta.exportType);
  if (meta.reg) sym.setAttribute(ATTR.reg, meta.reg);
  if (meta.rev != null) sym.setAttribute(ATTR.rev, String(meta.rev));
}

/** Registration point of a bbox as document-space (x,y). Default center. */
export function registrationPoint(bbox, reg = REG_DEFAULT) {
  const { x, y, width: w, height: h } = bbox;
  const hx = x + w / 2, hy = y + h / 2;
  switch (reg) {
    case 'nw': return { x, y };
    case 'n': return { x: hx, y };
    case 'ne': return { x: x + w, y };
    case 'w': return { x, y: hy };
    case 'e': return { x: x + w, y: hy };
    case 'sw': return { x, y: y + h };
    case 's': return { x: hx, y: y + h };
    case 'se': return { x: x + w, y: y + h };
    case 'c':
    default: return { x: hx, y: hy };
  }
}

/** Union bbox of elements (document space). Requires getBBox + optional transform. */
export function unionBBox(elements, getBBox = (el) => el.getBBox()) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of elements) {
    let b;
    try { b = getBBox(el); } catch { continue; }
    if (!b || !Number.isFinite(b.width)) continue;
    // Include simple translate from transform attr when getBBox is local (fake DOM).
    const t = parseTranslate(el.getAttribute?.('transform'));
    const x = b.x + t.x, y = b.y + t.y;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + b.width); y1 = Math.max(y1, y + b.height);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function parseTranslate(transform) {
  if (!transform) return { x: 0, y: 0 };
  const m = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
  if (m) return { x: Number(m[1]), y: Number(m[2]) };
  const mat = /matrix\(\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
  if (mat) return { x: Number(mat[5]), y: Number(mat[6]) };
  return { x: 0, y: 0 };
}

export function matrixString(a, b, c, d, e, f) {
  const r = (n) => Math.round(n * 1e6) / 1e6;
  return `matrix(${r(a)} ${r(b)} ${r(c)} ${r(d)} ${r(e)} ${r(f)})`;
}

export function translateString(x, y) {
  return matrixString(1, 0, 0, 1, x, y);
}

/**
 * Does `candidateId` (a symbol) appear in the descendant tree of `node`, walking
 * through nested uses? Used to reject cycles on create/redefine/edit.
 */
export function symbolReferencesId(content, node, candidateId, seen = new Set()) {
  if (!node || !candidateId) return false;
  if (node.localName === 'use') {
    const id = symbolIdOfUse(node);
    if (id === candidateId) return true;
    if (id && !seen.has(id)) {
      seen.add(id);
      const sym = content.querySelector?.(`#${CSS.escape?.(id) || id}`) || content.ownerDocument?.getElementById?.(id);
      if (sym && symbolReferencesId(content, sym, candidateId, seen)) return true;
    }
    return false;
  }
  for (const child of node.children || []) {
    if (symbolReferencesId(content, child, candidateId, seen)) return true;
  }
  return false;
}

export function wouldCreateCycle(content, symbolId, elements) {
  for (const el of elements) {
    if (symbolReferencesId(content, el, symbolId)) return true;
  }
  return false;
}

/** Shift every element's translate (or append one) by (dx,dy). */
export function shiftElement(el, dx, dy) {
  const t = el.getAttribute('transform');
  const tr = parseTranslate(t);
  const rest = t ? t.replace(/translate\([^)]*\)|matrix\([^)]*\)/, '').trim() : '';
  const next = translateString(tr.x + dx, tr.y + dy) + (rest ? ` ${rest}` : '');
  el.setAttribute('transform', next.trim());
  // Also shift x/y for shapes that use them without transform.
  for (const axis of ['x', 'y', 'cx', 'cy']) {
    if (!el.hasAttribute(axis)) continue;
    const v = Number(el.getAttribute(axis));
    if (!Number.isFinite(v)) continue;
    el.setAttribute(axis, String(v + (axis === 'x' || axis === 'cx' ? dx : dy)));
  }
}

/**
 * Pure create: given a list of elements (already detached or still in place),
 * build symbol + use descriptors. The caller applies DOM / history.
 *
 * Returns { symbolAttrs, children, useAttrs, regPoint, bbox } or { error }.
 */
export function planNewSymbol(elements, {
  name = 'Symbol',
  type = 'dynamic',
  exportType = 'graphic',
  reg = REG_DEFAULT,
  uid = null,
  getBBox,
} = {}) {
  if (!elements?.length) return { error: 'Nothing is selected' };
  const bbox = unionBBox(elements, getBBox);
  if (!bbox) return { error: 'Could not measure selection' };
  const rp = registrationPoint(bbox, reg);
  return {
    meta: {
      uid: uid || uuid(),
      name: String(name || 'Symbol').trim() || 'Symbol',
      type: type === 'static' ? 'static' : 'dynamic',
      exportType: exportType === 'movieclip' ? 'movieclip' : 'graphic',
      reg: REG_POINTS.includes(reg) ? reg : REG_DEFAULT,
      rev: 1,
    },
    bbox,
    regPoint: rp,
    // Offset to apply when moving content into symbol space (reg → origin).
    offset: { dx: -rp.x, dy: -rp.y },
    // Instance transform places the registration point back in document space.
    useTransform: translateString(rp.x, rp.y),
  };
}

/**
 * Apply New Symbol on a live svgCanvas. One BatchCommand.
 * Returns { symbol, use } or { error }.
 */
export function createSymbol(sc, elements, options = {}) {
  const content = sc.getSvgContent?.();
  const defs = sc.findDefs?.() || content?.querySelector?.('defs');
  if (!content || !defs) return { error: 'No document' };
  const els = (elements || sc.getSelectedElements?.() || []).filter(Boolean);
  if (!els.length) return { error: 'Nothing is selected' };
  // Reject if selection already includes an instance of a symbol we'd nest into itself via nesting later — N/A for create (new id).
  const plan = planNewSymbol(els, {
    ...options,
    getBBox: (el) => {
      try {
        // Prefer stroked / transformed bbox when the canvas can provide it.
        if (typeof sc.getStrokedBBox === 'function') {
          const b = sc.getStrokedBBox([el]);
          if (b && Number.isFinite(b.width)) return b;
        }
        return el.getBBox();
      } catch {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
    },
  });
  if (plan.error) return plan;

  const NS = 'http://www.w3.org/2000/svg';
  const { BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('New Symbol') : null;
  const id = sc.getNextId?.() || `symbol_${plan.meta.uid.slice(0, 8)}`;
  const sym = content.ownerDocument.createElementNS(NS, 'symbol');
  sym.id = id;
  writeSymbolMeta(sym, plan.meta);

  // Move in z-order (document order = bottom→top; keep as-is).
  const sorted = [...els].sort((a, b) => {
    const pos = a.compareDocumentPosition?.(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // Anchor: where the topmost element lived (same parent, after last).
  const top = sorted[sorted.length - 1];
  const parent = top.parentNode;
  const next = top.nextSibling;

  for (const el of sorted) {
    if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(el));
    // Bake a translate into symbol space. Prefer shifting via transform; also
    // shift x/y so primitives without a transform still land correctly.
    const before = {
      transform: el.getAttribute('transform'),
      x: el.getAttribute('x'), y: el.getAttribute('y'),
      cx: el.getAttribute('cx'), cy: el.getAttribute('cy'),
    };
    shiftElement(el, plan.offset.dx, plan.offset.dy);
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
    sym.appendChild(el);
  }
  defs.appendChild(sym);
  if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(sym));

  const use = content.ownerDocument.createElementNS(NS, 'use');
  use.id = sc.getNextId?.() || `use_${id}`;
  use.setAttribute('href', `#${id}`);
  use.setAttribute(ATTR.instance, '1');
  use.setAttribute('aria-label', plan.meta.name);
  use.setAttribute('transform', plan.useTransform);
  if (next) parent.insertBefore(use, next); else parent.appendChild(use);
  if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(use));

  if (batch && !batch.isEmpty?.()) sc.addCommandToHistory(batch);
  try {
    sc.clearSelection?.();
    sc.addToSelection?.([use], true);
    sc.call?.('selected', [use]);
    sc.call?.('changed', [use, sym]);
  } catch { /* ignore */ }
  // Refresh use caches if SVG-Edit exposes them.
  try { sc.setUseData?.(use); } catch { /* ignore */ }
  return { symbol: sym, use, meta: plan.meta };
}

/**
 * Place an instance of `symbol` at document point (x,y) — registration lands there.
 */
export function placeInstance(sc, symbol, { x = 0, y = 0, parent = null } = {}) {
  if (!isPanelSymbol(symbol)) return { error: 'Not a panel symbol' };
  const content = sc.getSvgContent?.();
  const layer = parent || [...(content?.querySelectorAll?.(':scope > g.layer') || [])].pop();
  if (!layer) return { error: 'No layer' };
  const meta = readSymbolMeta(symbol);
  const NS = 'http://www.w3.org/2000/svg';
  const { BatchCommand, InsertElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Place Symbol') : null;
  const use = content.ownerDocument.createElementNS(NS, 'use');
  use.id = sc.getNextId?.() || `use_${symbol.id}`;
  use.setAttribute('href', `#${symbol.id}`);
  use.setAttribute(ATTR.instance, '1');
  use.setAttribute('aria-label', meta.name);
  use.setAttribute('transform', translateString(x, y));
  layer.appendChild(use);
  if (batch && InsertElementCommand) {
    batch.addSubCommand(new InsertElementCommand(use));
    sc.addCommandToHistory(batch);
  }
  try {
    sc.clearSelection?.();
    sc.addToSelection?.([use], true);
    sc.call?.('selected', [use]);
    sc.setUseData?.(use);
  } catch { /* ignore */ }
  return { use };
}

/**
 * Break Link: expand one instance into a <g> with the full use→content matrix.
 * Keeps the symbol in the panel. One BatchCommand. Does NOT further ungroup.
 */
export function breakLinkToSymbol(sc, use) {
  if (!use || use.localName !== 'use') return { error: 'Not an instance' };
  const content = sc.getSvgContent?.();
  const sid = symbolIdOfUse(use);
  const sym = sid && (content.ownerDocument.getElementById(sid) || content.querySelector(`#${CSS.escape?.(sid) || sid}`));
  if (!sym) return { error: 'Symbol not found' };
  const NS = 'http://www.w3.org/2000/svg';
  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Break Link to Symbol') : null;

  const g = content.ownerDocument.createElementNS(NS, 'g');
  g.id = sc.getNextId?.() || `g_${use.id}`;
  const name = readSymbolMeta(sym).name;
  g.setAttribute('aria-label', name);
  // Full transform: instance transform only (symbol has no viewBox scale).
  const xf = use.getAttribute('transform');
  if (xf) g.setAttribute('transform', xf);

  // Deep-clone children (skip <title>), uniquify ids, rewrite internal hrefs.
  const idMap = new Map();
  const kids = [...sym.childNodes].filter((n) => n.nodeType === 1 && n.localName !== 'title');
  for (const child of kids) {
    const clone = child.cloneNode(true);
    uniquifyTree(clone, () => sc.getNextId?.() || `svg_${Math.random().toString(36).slice(2, 8)}`, idMap);
    g.appendChild(clone);
  }
  rewriteHrefs(g, idMap);

  const parent = use.parentNode;
  const next = use.nextSibling;
  if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(use));
  use.remove();
  if (next) parent.insertBefore(g, next); else parent.appendChild(g);
  if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(g));
  // Intentionally do NOT delete the symbol even if no instances remain.
  if (batch && !batch.isEmpty?.()) sc.addCommandToHistory(batch);
  try {
    sc.clearSelection?.();
    sc.addToSelection?.([g], true);
    sc.call?.('selected', [g]);
    sc.call?.('changed', [g]);
  } catch { /* ignore */ }
  return { group: g, symbol: sym };
}

function uniquifyTree(node, nextId, idMap) {
  if (node.nodeType !== 1) return;
  if (node.id) {
    const neu = nextId();
    idMap.set(node.id, neu);
    node.id = neu;
  }
  for (const c of [...node.children]) uniquifyTree(c, nextId, idMap);
}

function rewriteHrefs(root, idMap) {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...(el.attributes || [])]) {
      let v = attr.value;
      let changed = false;
      for (const [old, neu] of idMap) {
        if (v.includes(`#${old}`)) { v = v.split(`#${old}`).join(`#${neu}`); changed = true; }
      }
      if (changed) el.setAttribute(attr.name, v);
    }
  }
}

export function duplicateSymbol(sc, symbol) {
  if (!isPanelSymbol(symbol)) return { error: 'Not a panel symbol' };
  const content = sc.getSvgContent?.();
  const defs = sc.findDefs?.() || content.querySelector('defs');
  const meta = readSymbolMeta(symbol);
  const NS = 'http://www.w3.org/2000/svg';
  const { BatchCommand, InsertElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Duplicate Symbol') : null;
  const clone = symbol.cloneNode(true);
  const idMap = new Map();
  uniquifyTree(clone, () => sc.getNextId?.() || `svg_${Math.random().toString(36).slice(2, 8)}`, idMap);
  rewriteHrefs(clone, idMap);
  clone.id = sc.getNextId?.() || `symbol_${Math.random().toString(36).slice(2, 8)}`;
  writeSymbolMeta(clone, {
    ...meta,
    uid: uuid(),
    name: `${meta.name} copy`,
    rev: 1,
  });
  defs.appendChild(clone);
  if (batch && InsertElementCommand) {
    batch.addSubCommand(new InsertElementCommand(clone));
    sc.addCommandToHistory(batch);
  }
  return { symbol: clone };
}

export function replaceSymbol(sc, uses, newSymbol) {
  if (!isPanelSymbol(newSymbol)) return { error: 'Not a panel symbol' };
  const list = (uses || []).filter((u) => u?.localName === 'use');
  if (!list.length) return { error: 'No instances selected' };
  const { BatchCommand, ChangeElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Replace Symbol') : null;
  const meta = readSymbolMeta(newSymbol);
  for (const use of list) {
    const before = {
      href: use.getAttribute('href'),
      'xlink:href': use.getAttribute('xlink:href'),
      'aria-label': use.getAttribute('aria-label'),
      [ATTR.instance]: use.getAttribute(ATTR.instance),
    };
    use.setAttribute('href', `#${newSymbol.id}`);
    use.removeAttribute('xlink:href');
    use.setAttribute(ATTR.instance, '1');
    use.setAttribute('aria-label', meta.name);
    // Clear any Slice-3 overrides if present.
    use.removeAttribute('data-v-sym-ov');
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(use, before));
    try { sc.setUseData?.(use); } catch { /* ignore */ }
  }
  if (batch && !batch.isEmpty?.()) sc.addCommandToHistory(batch);
  sc.call?.('changed', list);
  return { uses: list };
}

export function redefineSymbol(sc, symbol, elements, { keepArtwork = false } = {}) {
  if (!isPanelSymbol(symbol)) return { error: 'Not a panel symbol' };
  const content = sc.getSvgContent?.();
  const els = (elements || []).filter(Boolean);
  if (!els.length) return { error: 'Nothing is selected' };
  if (wouldCreateCycle(content, symbol.id, els)) return { error: "A symbol can't contain itself" };
  const meta = readSymbolMeta(symbol);
  const plan = planNewSymbol(els, {
    ...meta,
    uid: meta.uid,
    getBBox: (el) => {
      try {
        if (typeof sc.getStrokedBBox === 'function') {
          const b = sc.getStrokedBBox([el]);
          if (b && Number.isFinite(b.width)) return b;
        }
        return el.getBBox();
      } catch { return { x: 0, y: 0, width: 0, height: 0 }; }
    },
  });
  if (plan.error) return plan;

  const NS = 'http://www.w3.org/2000/svg';
  const { BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Redefine Symbol') : null;

  // Remove old children (keep <title>).
  for (const child of [...symbol.childNodes]) {
    if (child.nodeType === 1 && child.localName === 'title') continue;
    if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(child));
    child.remove();
  }

  const sorted = [...els].sort((a, b) => {
    const pos = a.compareDocumentPosition?.(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  const top = sorted[sorted.length - 1];
  const parent = top.parentNode;
  const next = top.nextSibling;

  for (const el of sorted) {
    const src = keepArtwork ? el.cloneNode(true) : el;
    if (!keepArtwork) {
      if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(el));
    } else if (batch && InsertElementCommand) {
      // clone is new — recorded as insert into symbol below
    }
    const before = {
      transform: src.getAttribute('transform'),
      x: src.getAttribute('x'), y: src.getAttribute('y'),
      cx: src.getAttribute('cx'), cy: src.getAttribute('cy'),
    };
    shiftElement(src, plan.offset.dx, plan.offset.dy);
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(src, before));
    symbol.appendChild(src);
    if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(src));
  }

  writeSymbolMeta(symbol, { ...meta, rev: meta.rev + 1, reg: plan.meta.reg });

  let use = null;
  if (!keepArtwork) {
    use = content.ownerDocument.createElementNS(NS, 'use');
    use.id = sc.getNextId?.() || `use_${symbol.id}`;
    use.setAttribute('href', `#${symbol.id}`);
    use.setAttribute(ATTR.instance, '1');
    use.setAttribute('aria-label', meta.name);
    use.setAttribute('transform', plan.useTransform);
    if (next) parent.insertBefore(use, next); else parent.appendChild(use);
    if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(use));
  }

  if (batch && !batch.isEmpty?.()) sc.addCommandToHistory(batch);
  try {
    if (use) { sc.clearSelection?.(); sc.addToSelection?.([use], true); }
    sc.call?.('changed', [symbol, use].filter(Boolean));
  } catch { /* ignore */ }
  return { symbol, use };
}

/**
 * Delete a symbol. mode: 'expand' | 'delete' | 'unused'.
 * expand → break link every instance then remove symbol.
 * delete → remove every instance then remove symbol.
 * unused → remove only if no instances (no prompt path).
 */
export function deleteSymbol(sc, symbol, mode = 'delete') {
  if (!isPanelSymbol(symbol)) return { error: 'Not a panel symbol' };
  const content = sc.getSvgContent?.();
  const uses = instancesOf(content, symbol.id);
  const { BatchCommand, RemoveElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand(mode === 'expand' ? 'Expand Instances' : 'Delete Symbol') : null;

  if (mode === 'unused' && uses.length) return { error: 'Symbol still has instances' };

  if (mode === 'expand') {
    return expandAndDeleteSymbol(sc, symbol);
  } else if (mode === 'delete') {
    for (const u of uses) {
      if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(u));
      u.remove();
    }
  }

  if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(symbol));
  symbol.remove();
  if (batch && !batch.isEmpty?.()) sc.addCommandToHistory(batch);
  sc.call?.('changed', []);
  return { ok: true };
}

/** One-batch expand-and-delete (preferred over calling breakLink in a loop). */
export function expandAndDeleteSymbol(sc, symbol) {
  if (!isPanelSymbol(symbol)) return { error: 'Not a panel symbol' };
  const content = sc.getSvgContent?.();
  const uses = instancesOf(content, symbol.id);
  const NS = 'http://www.w3.org/2000/svg';
  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Expand Instances') : null;
  const groups = [];
  for (const use of uses) {
    const g = content.ownerDocument.createElementNS(NS, 'g');
    g.id = sc.getNextId?.() || `g_${use.id}`;
    g.setAttribute('aria-label', readSymbolMeta(symbol).name);
    const xf = use.getAttribute('transform');
    if (xf) g.setAttribute('transform', xf);
    const idMap = new Map();
    for (const child of [...symbol.childNodes].filter((n) => n.nodeType === 1 && n.localName !== 'title')) {
      const clone = child.cloneNode(true);
      uniquifyTree(clone, () => sc.getNextId?.() || `svg_${Math.random().toString(36).slice(2, 8)}`, idMap);
      g.appendChild(clone);
    }
    rewriteHrefs(g, idMap);
    const parent = use.parentNode, next = use.nextSibling;
    if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(use));
    use.remove();
    if (next) parent.insertBefore(g, next); else parent.appendChild(g);
    if (batch && InsertElementCommand) batch.addSubCommand(new InsertElementCommand(g));
    groups.push(g);
  }
  if (batch && RemoveElementCommand) batch.addSubCommand(new RemoveElementCommand(symbol));
  symbol.remove();
  if (batch && !batch.isEmpty?.()) sc.addCommandToHistory(batch);
  return { groups };
}

/** Select every instance of a symbol across the document (skip locked/hidden). */
export function selectAllInstances(sc, symbol) {
  const content = sc.getSvgContent?.();
  const uses = instancesOf(content, symbol.id).filter((u) => {
    if (u.getAttribute('display') === 'none' || u.getAttribute('visibility') === 'hidden') return false;
    if (u.getAttribute('data-locked') === 'true' || u.closest?.('[data-locked="true"]')) return false;
    const layer = u.closest?.('g.layer');
    if (layer && (layer.getAttribute('display') === 'none' || layer.getAttribute('data-locked') === 'true')) return false;
    return true;
  });
  try {
    sc.clearSelection?.();
    if (uses.length) sc.addToSelection?.(uses, true);
    sc.call?.('selected', uses);
  } catch { /* ignore */ }
  return uses;
}

/** Deduplicate a pasted symbol against existing ones by uid; retarget uses. */
export function dedupeSymbolByUid(content, pastedSymbol) {
  if (!isPanelSymbol(pastedSymbol)) return pastedSymbol;
  const uid = pastedSymbol.getAttribute(ATTR.uid);
  if (!uid) return pastedSymbol;
  const existing = getPanelSymbols(content).find((s) => s !== pastedSymbol && s.getAttribute(ATTR.uid) === uid);
  if (!existing) return pastedSymbol;
  const oldId = pastedSymbol.id;
  for (const u of instancesOf(content, oldId)) {
    u.setAttribute('href', `#${existing.id}`);
  }
  pastedSymbol.remove();
  return existing;
}

export function pruneUnusedPanelSymbols(cloneRoot) {
  // Used by export: drop panel symbols with no instance in the clone.
  const uses = [...(cloneRoot.querySelectorAll?.('use') || [])];
  const referenced = new Set(uses.map(symbolIdOfUse).filter(Boolean));
  for (const sym of [...(cloneRoot.querySelectorAll?.(`symbol[${ATTR.symbol}="1"]`) || [])]) {
    if (!referenced.has(sym.id)) sym.remove();
  }
}

export function expandInstancesInClone(cloneRoot) {
  const doc = cloneRoot.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const create = (tag) => (doc?.createElementNS
    ? doc.createElementNS('http://www.w3.org/2000/svg', tag)
    : null);
  for (const use of [...(cloneRoot.querySelectorAll?.('use') || [])]) {
    if (use.getAttribute(ATTR.instance) !== '1' && !symbolIdOfUse(use)) continue;
    const sid = symbolIdOfUse(use);
    if (!sid) continue;
    const all = [...(cloneRoot.querySelectorAll?.('*') || [])];
    const sym = all.find((n) => n.id === sid && n.localName === 'symbol')
      || cloneRoot.querySelector?.(`#${CSS.escape?.(sid) || sid}`);
    if (!sym) continue;
    const g = create('g');
    if (!g) continue;
    if (use.id) g.id = use.id;
    const xf = use.getAttribute('transform');
    if (xf) g.setAttribute('transform', xf);
    const label = use.getAttribute('aria-label');
    if (label) g.setAttribute('aria-label', label);
    for (const child of [...(sym.childNodes || sym.children || [])].filter((n) => n.nodeType === 1 && n.localName !== 'title')) {
      g.appendChild(child.cloneNode(true));
    }
    if (typeof use.replaceWith === 'function') use.replaceWith(g);
    else { use.parentNode?.insertBefore(g, use); use.remove(); }
  }
  pruneUnusedPanelSymbols(cloneRoot);
}
