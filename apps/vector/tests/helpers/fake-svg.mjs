// Tiny attribute-only element + svgCanvas stand-ins for appearance/effects/paragraph tests.
import fs from 'node:fs';
export const loadModule = async (rel) => {
  const source = fs.readFileSync(new URL(`../../js/${rel}`, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
export function fakeEl(tag = 'rect', attrs = {}) {
  const el = {
    tagName: tag, localName: tag, attrs: { ...attrs }, children: [], parentNode: null,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return k in this.attrs; },
    classList: { contains: () => false },
    get id() { return this.attrs.id || ''; },
  };
  return el;
}
export function fakeCanvas(selected = []) {
  const history = []; const events = [];
  class ChangeElementCommand {
    constructor(elem, oldValues) { this.elem = elem; this.oldValues = { ...oldValues }; this.newValues = {}; for (const k of Object.keys(oldValues)) this.newValues[k] = elem.getAttribute(k); }
    apply() { for (const [k, v] of Object.entries(this.newValues)) v == null ? this.elem.removeAttribute(k) : this.elem.setAttribute(k, v); }
    unapply() { for (const [k, v] of Object.entries(this.oldValues)) v == null ? this.elem.removeAttribute(k) : this.elem.setAttribute(k, v); }
  }
  class BatchCommand {
    constructor(text) { this.text = text; this.stack = []; }
    addSubCommand(c) { this.stack.push(c); }
    isEmpty() { return !this.stack.length; }
    apply() { this.stack.forEach((c) => c.apply()); }
    unapply() { [...this.stack].reverse().forEach((c) => c.unapply()); }
  }
  return {
    log: history, events, selected,
    getSelectedElements: () => selected,
    addCommandToHistory: (c) => history.push(c),
    call: (ev, els) => events.push([ev, els]),
    history: { ChangeElementCommand, BatchCommand },
    undo() { history.at(-1).unapply(); },
    redo() { history.at(-1).apply(); },
  };
}
