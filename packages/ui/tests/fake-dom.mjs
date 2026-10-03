// Minimal DOM stand-in for @visteras/ui unit tests (no jsdom dependency).
export function fakeDom() {
  const listeners = {};
  const byId = new Map();
  const doc = {
    activeElement: null,
    cookie: '',
    body: null,
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    getElementById: (id) => byId.get(id) || null,
    createElement(tag) { return makeEl(tag); },
    key(key) {
      const evt = { key, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
      (listeners.keydown || []).slice().forEach((fn) => fn(evt));
      return evt;
    },
    keyListeners: () => (listeners.keydown || []).length,
  };
  function makeEl(tag) {
    const elListeners = {};
    const classes = new Set();
    const el = {
      tagName: String(tag).toUpperCase(), children: [], parent: null, attrs: {}, dataset: {}, textContent: '', _html: '',
      get id() { return this.attrs.id || ''; },
      set id(v) { this.attrs.id = v; byId.set(v, this); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = v; },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = v; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(c) { c.parent = this; this.children.push(c); return c; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; if (this.attrs.id) byId.delete(this.attrs.id); },
      addEventListener(t, fn) { (elListeners[t] ||= []).push(fn); },
      fire(t, evt = {}) { (elListeners[t] || []).forEach((fn) => fn(evt)); },
      click() { this.fire('click', { target: this }); },
      focus() { doc.activeElement = this; },
      // Buttons rendered via innerHTML: expose them by class for the dialog.
      querySelector(sel) {
        const m = /\.([\w-]+)/.exec(sel);
        if (!m || !this._html.includes(m[1])) return null;
        const action = m[1].includes('accent') ? 'confirm' : 'cancel';
        const cls = new Set([m[1]]); const ls = {};
        return { className: m[1], dataset: { action }, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
          addEventListener(t, fn) { (ls[t] ||= []).push(fn); }, fire(t) { (ls[t] || []).forEach((fn) => fn({})); }, focus() { doc.activeElement = this; } };
      },
    };
    return el;
  }
  doc.body = makeEl('body');
  return doc;
}
export const clickAction = (action) => ({ target: { closest: () => ({ dataset: { action } }) } });
