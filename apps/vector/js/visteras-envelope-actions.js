/**
 * Visteras Vector — Envelope Distort actions: Edit Contents / Edit Envelope, Release, Expand.
 * Every action is one BatchCommand. DOM-free at import time (tests use the fake SVG tree).
 */
import { ENV, SRC, OUT, EDITING, readEnvelope, isEnvelope } from './visteras-envelope-core.js?v=envelope-9';
import { cloneEnvelopeOutput, refreshEnvelope, boundsIn, WRAP } from './visteras-envelope-model.js?v=envelope-9';
import { parseTransform, multiply, IDENTITY, warpedBoxPathData } from './visteras-envelope-warp.js?v=envelope-9';

const NS = 'http://www.w3.org/2000/svg';
/** Release leaves the envelope shape as a grey object (Illustrator; exact grey [unverified] — decision). */
export const RELEASE_FILL = '#cccccc';
export const EXPAND_NAME = 'Envelope';

const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);
const matrixAttr = (m) => `matrix(${m.map((v) => Math.round(v * 1e6) / 1e6).join(' ')})`;
export const isEditingEnvelope = (el) => isEnvelope(el) && el.hasAttribute(EDITING);

/** Edit Contents: show `-src` instead of `-out` (CSS keyed on the editing flag) and isolate it. One undo step. */
export function editContents(sc, el) {
  if (!isEnvelope(el) || el.hasAttribute(EDITING)) return false;
  const { BatchCommand, ChangeElementCommand } = sc.history;
  const batch = new BatchCommand('Edit Contents');
  el.setAttribute(EDITING, '1');
  batch.addSubCommand(new ChangeElementCommand(el, { [EDITING]: null }));
  sc.addCommandToHistory(batch);
  const { src } = readEnvelope(el);
  sc.clearSelection?.();
  try { sc.setContext?.(src); } catch { /* isolation is best effort */ }
  sc.call?.('changed', [el]);
  return true;
}

/**
 * Edit Envelope: leave Edit Contents, refit the envelope to the edited contents and re-render.
 * One undo step (the flag and the refitted bbox).
 */
export function editEnvelope(sc, el) {
  if (!isEnvelope(el) || !el.hasAttribute(EDITING)) return false;
  const { src } = readEnvelope(el);
  try { if (sc.getCurrentGroup?.() === src) sc.leaveContext?.(); } catch { /* ignore */ }
  const before = { [EDITING]: el.getAttribute(EDITING), [`${ENV}-bbox`]: el.getAttribute(`${ENV}-bbox`) };
  const kids = [...src.children];
  let box = null;
  try { box = kids.length ? boundsIn(sc, el, kids) : null; } catch { box = null; }
  el.removeAttribute(EDITING);
  if (box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && typeof sc.getSvgContent === 'function') {
    el.setAttribute(`${ENV}-bbox`, [box.x, box.y, box.width, box.height].map((v) => Math.round(v * 1000) / 1000).join(' '));
  }
  const { BatchCommand, ChangeElementCommand } = sc.history;
  const batch = new BatchCommand('Edit Envelope');
  batch.addSubCommand(new ChangeElementCommand(el, before));
  sc.addCommandToHistory(batch);
  refreshEnvelope(sc, el);
  sc.clearSelection?.(); sc.addToSelection?.([el], true); sc.call?.('changed', [el]);
  return true;
}

/** Leave Edit Contents without history (load / document switch). */
export function clearEditingFlag(el) { el?.removeAttribute?.(EDITING); }

/**
 * Release: contents back where the envelope was (z-order kept), wrappers unwrapped into the
 * children's transforms, plus one grey path of the warped envelope shape. One undo step.
 */
export function releaseEnvelope(sc, el) {
  const data = readEnvelope(el); if (!data?.src) return null;
  const parent = el.parentNode, next = el.nextSibling;
  try { if (sc.getCurrentGroup?.() === data.src) sc.leaveContext?.(); } catch { /* ignore */ }
  const { BatchCommand, ChangeElementCommand, MoveElementCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
  const batch = new BatchCommand('Release');
  const T = parseTransform(el.getAttribute('transform'));
  const released = [];
  const place = (node, m) => {
    const full = multiply(m, parseTransform(node.getAttribute('transform')));
    const oldParent = node.parentNode, oldNext = node.nextSibling, before = { transform: node.getAttribute('transform') };
    parent.insertBefore(node, el);
    batch.addSubCommand(new MoveElementCommand(node, oldNext, oldParent));
    if (!isIdentity(m)) {
      if (isIdentity(full)) node.removeAttribute('transform'); else node.setAttribute('transform', matrixAttr(full));
      batch.addSubCommand(new ChangeElementCommand(node, before));
    }
    released.push(node);
  };
  for (const child of [...data.src.children]) {
    if (child.hasAttribute(WRAP)) {
      const wm = multiply(T, parseTransform(child.getAttribute('transform')));
      for (const inner of [...child.children]) place(inner, wm);
    } else place(child, T);
  }
  const doc = parent.ownerDocument;
  const shape = doc.createElementNS(NS, 'path');
  shape.setAttribute('id', sc.getNextId());
  shape.setAttribute('d', warpedBoxPathData(data.bbox, data.params, data.opts));
  shape.setAttribute('fill', RELEASE_FILL); shape.setAttribute('stroke', 'none');
  if (!isIdentity(T)) shape.setAttribute('transform', matrixAttr(T));
  parent.insertBefore(shape, el);
  batch.addSubCommand(new InsertElementCommand(shape));
  el.remove();
  batch.addSubCommand(new RemoveElementCommand(el, next, parent));
  sc.addCommandToHistory(batch);
  const all = [...released, shape];
  sc.clearSelection?.(); sc.addToSelection?.(all, true); sc.call?.('changed', all);
  return all;
}

/** Remove every data-visteras-envelope* attribute in a subtree. */
export function stripEnvelopeAttrs(node) {
  for (const n of [node, ...(node.querySelectorAll?.('*') || [])]) {
    for (const a of [...(n.attributes || [])]) if (a.name.startsWith(ENV)) n.removeAttribute(a.name);
  }
  return node;
}

/**
 * Expand: replace the envelope with its rendered output as plain artwork in a group named "Envelope"
 * (fresh ids, no envelope attributes). When `batch` is given the steps join it (Object ▸ Expand);
 * otherwise this is its own undo step.
 */
export function expandEnvelope(sc, el, { batch = null } = {}) {
  const data = readEnvelope(el); if (!data) return null;
  if (!data.out) refreshEnvelope(sc, el);
  const out = readEnvelope(el).out; if (!out) return null;
  try { if (sc.getCurrentGroup?.() === data.src) sc.leaveContext?.(); } catch { /* ignore */ }
  const parent = el.parentNode, next = el.nextSibling;
  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
  const own = !batch; if (own) batch = new BatchCommand('Expand');
  const clone = stripEnvelopeAttrs(cloneEnvelopeOutput(out, sc));
  clone.removeAttribute('display');
  const g = parent.ownerDocument.createElementNS(NS, 'g');
  g.setAttribute('id', sc.getNextId());
  g.setAttribute('data-visteras-name', EXPAND_NAME);
  if (el.getAttribute('transform')) g.setAttribute('transform', el.getAttribute('transform'));
  for (const k of ['opacity', 'style', 'class', 'mask', 'filter']) if (el.getAttribute(k)) g.setAttribute(k, el.getAttribute(k));
  for (const child of [...clone.children]) g.appendChild(child);
  sweepLocalClips(g);
  parent.insertBefore(g, el);
  batch.addSubCommand(new InsertElementCommand(g));
  el.remove();
  batch.addSubCommand(new RemoveElementCommand(el, next, parent));
  if (own) { sc.addCommandToHistory(batch); sc.clearSelection?.(); sc.addToSelection?.([g], true); sc.call?.('changed', [g]); }
  return g;
}

/** H6: drop clipPaths (and then-empty defs) inside `root` that nothing in `root` references. */
export function sweepLocalClips(root) {
  const all = root.querySelectorAll?.('*') || [];
  const refs = new Set();
  for (const n of all) for (const a of [...(n.attributes || [])]) for (const m of String(a.value).matchAll(/url\(#([^)]+)\)/g)) refs.add(m[1]);
  for (const n of all) if (n.localName === 'clipPath' && !refs.has(n.id)) n.remove();
  for (const n of root.querySelectorAll?.('*') || []) if (n.localName === 'defs' && !n.children.length) n.remove();
  return root;
}

export { SRC, OUT };
