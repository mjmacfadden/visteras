/**
 * Visteras Inspire — Board Composer Engine
 * Manages board items, selection, transformations, history undo/redo, and rendering.
 */

export const LOREM_IPSUM = 'Lorem Ipsum';
export const LOREM_PARAGRAPH = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.';

export function getLoremIpsumForBox(width, height, { fontFamily = 'Montserrat', fontSize = 32, fontWeight = '700', letterSpacing = 0, lineHeight = 1.2 } = {}) {
  const lineH = Math.max(14, fontSize * (lineHeight || 1.2));
  const maxLines = Math.max(1, Math.floor(Math.max(20, height) / lineH));
  const maxW = Math.max(30, width - 16);
  const words = LOREM_PARAGRAPH.split(/\s+/);

  let ctx = null;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontWeight || '700'} ${fontSize || 32}px "${fontFamily || 'Montserrat'}", sans-serif`;
      }
    } catch (_) {}
  }

  const measureWordW = (str) => {
    if (ctx) {
      const m = ctx.measureText(str);
      const extraSpacing = (str.length > 1 && letterSpacing) ? (str.length - 1) * letterSpacing : 0;
      return (m.width || (fontSize * 0.6 * str.length)) + extraSpacing;
    }
    return str.length * (fontSize * 0.6);
  };

  const spaceW = measureWordW(' ');
  const lines = [];
  let currentLine = '';
  let currentLineW = 0;
  let wordIdx = 0;
  const maxWords = 500;
  let added = 0;

  while (added < maxWords && lines.length < maxLines) {
    const word = words[wordIdx % words.length];
    const wordW = measureWordW(word);

    if (!currentLine) {
      currentLine = word;
      currentLineW = wordW;
      wordIdx++;
      added++;
    } else if (currentLineW + spaceW + wordW <= maxW) {
      currentLine += ' ' + word;
      currentLineW += spaceW + wordW;
      wordIdx++;
      added++;
    } else {
      lines.push(currentLine);
      currentLine = '';
      currentLineW = 0;
      if (lines.length >= maxLines) break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines.length ? lines.join(' ') : LOREM_IPSUM;
}

export function measureTextBounds(text, { fontFamily = 'Montserrat', fontSize = 32, fontWeight = '700', letterSpacing = 0, lineHeight = 1.2 } = {}) {
  const str = text !== undefined && text !== null ? String(text) : '';
  const lines = str.length ? str.split('\n') : [' '];

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontWeight || '700'} ${fontSize || 32}px "${fontFamily || 'Montserrat'}", sans-serif`;
        let maxLineWidth = 0;
        for (const line of lines) {
          const metrics = ctx.measureText(line.length ? line : ' ');
          const extraSpacing = (line.length > 1 && letterSpacing) ? (line.length - 1) * letterSpacing : 0;
          const lineW = (metrics.width || (fontSize * 0.6 * (line.length || 1))) + extraSpacing;
          if (lineW > maxLineWidth) maxLineWidth = lineW;
        }
        const lineH = fontSize * (lineHeight || 1.2);
        const totalH = Math.max(lineH, lines.length * lineH);
        return {
          width: Math.ceil(Math.max(20, maxLineWidth + 4)),
          height: Math.ceil(Math.max(fontSize, totalH))
        };
      }
    } catch (_) {}
  }

  // Fallback measurement calculation
  let maxLen = 1;
  for (const line of lines) {
    if (line.length > maxLen) maxLen = line.length;
  }
  return {
    width: Math.ceil(Math.max(20, maxLen * (fontSize * 0.62) + 4)),
    height: Math.ceil(Math.max(fontSize, lines.length * (fontSize * (lineHeight || 1.2))))
  };
}

/** Embedded images large enough to be worth de-duplicating across undo snapshots. */
export const ASSET_MIN_LENGTH = 256;
export function isEmbeddedAsset(value) {
  return typeof value === 'string' && value.length >= ASSET_MIN_LENGTH && value.startsWith('data:');
}

export class BoardComposer {
  constructor(initialElements = [], customLayoutSnapshot = null, docOrSlides = null) {
    this.elements = initialElements ? [...initialElements] : [];
    this.customLayoutSnapshot = customLayoutSnapshot ? [...customLayoutSnapshot] : null;
    this.activeLayout = 'custom';
    this.selectedIds = new Set();
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;
    this.listeners = new Set();
    // Undo asset store: each embedded image (data: URL) is kept once and snapshots hold a
    // small { $asset: id } reference instead of a full copy per undo step.
    this.assetIdByData = new Map();
    this.assetDataById = new Map();

    this.doc = null;
    this._slides = [];
    if (docOrSlides) {
      this.attachDoc(docOrSlides);
    } else {
      this.saveHistory('Initial state');
    }
  }

  attachDoc(docOrSlides) {
    if (docOrSlides && Array.isArray(docOrSlides.slides)) {
      this.doc = docOrSlides;
      this._slides = docOrSlides.slides;
    } else if (Array.isArray(docOrSlides)) {
      this._slides = [...docOrSlides];
    }
    // Refresh initial history snapshot if only initial state has been recorded
    if (this.history.length <= 1) {
      this.history = [];
      this.historyIndex = -1;
      this.saveHistory('Initial state');
    }
  }

  get slides() {
    if (this.doc && Array.isArray(this.doc.slides)) {
      return this.doc.slides;
    }
    return this._slides || [];
  }

  set slides(val) {
    const list = Array.isArray(val) ? val : [];
    if (this.doc) {
      this.doc.slides = list;
    }
    this._slides = list;
  }

  getSlidesSnapshot() {
    return (this.slides || []).map(s => ({ ...s }));
  }

  snapshotCustomLayout() {
    this.customLayoutSnapshot = this.elements.map(el => ({
      id: el.id,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation || 0,
      zIndex: el.zIndex
    }));
  }

  hasCustomLayout() {
    return Array.isArray(this.customLayoutSnapshot) && this.customLayoutSnapshot.length > 0;
  }

  revertToCustomLayout() {
    if (!this.hasCustomLayout()) return false;
    const updates = [];
    for (const snap of this.customLayoutSnapshot) {
      const el = this.getElementById(snap.id);
      if (el) {
        updates.push({
          id: snap.id,
          x: snap.x,
          y: snap.y,
          width: snap.width,
          height: snap.height,
          rotation: snap.rotation,
          zIndex: snap.zIndex
        });
      }
    }
    if (!updates.length) return false;
    this.applyLayoutUpdates(updates, 'Revert to Custom Layout');
    this.activeLayout = 'custom';
    return true;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event = { type: 'change' }) {
    for (const listener of this.listeners) {
      try {
        listener(event, this);
      } catch (err) {
        console.error('[BoardComposer] listener error', err);
      }
    }
  }

  saveHistory(label = '') {
    // Drop redo states
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    const snapshot = JSON.stringify({
      elements: this.elements,
      slides: this.getSlidesSnapshot()
    }, (key, value) => (isEmbeddedAsset(value) ? { $asset: this.internAsset(value) } : value));
    this.history.push({ snapshot, label });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
    this.notify({ type: 'history', label });
  }

  internAsset(dataUrl) {
    let id = this.assetIdByData.get(dataUrl);
    if (!id) {
      id = `a${this.assetIdByData.size + 1}`;
      this.assetIdByData.set(dataUrl, id);
      this.assetDataById.set(id, dataUrl);
    }
    return id;
  }

  resolveAssetRef(value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.$asset === 'string' && Object.keys(value).length === 1) {
      const dataUrl = this.assetDataById.get(value.$asset);
      if (dataUrl !== undefined) return dataUrl;
    }
    return value;
  }

  restoreSnapshot(snapshotStr) {
    try {
      const data = JSON.parse(snapshotStr, (key, value) => this.resolveAssetRef(value));
      if (Array.isArray(data)) {
        this.elements = data;
      } else if (data && typeof data === 'object') {
        this.elements = Array.isArray(data.elements) ? data.elements : [];
        if (Array.isArray(data.slides)) {
          const restoredSlides = data.slides.map(s => ({ ...s }));
          if (this.doc) {
            this.doc.slides = restoredSlides;
          }
          this._slides = restoredSlides;
        }
      }
    } catch (err) {
      console.error('[BoardComposer] restoreSnapshot error', err);
    }

    // Prune selection of missing elements
    const validIds = new Set(this.elements.map(e => e.id));
    for (const id of this.selectedIds) {
      if (!validIds.has(id)) this.selectedIds.delete(id);
    }
  }

  canUndo() {
    return this.historyIndex > 0;
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  undo() {
    if (!this.canUndo()) return false;
    this.historyIndex--;
    const state = this.history[this.historyIndex];
    this.restoreSnapshot(state.snapshot);
    this.notify({ type: 'undo', label: state.label });
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this.historyIndex++;
    const state = this.history[this.historyIndex];
    this.restoreSnapshot(state.snapshot);
    this.notify({ type: 'redo', label: state.label });
    return true;
  }

  // Element factory helpers
  createElement({ type, x = 100, y = 100, width = 300, height = 200, rotation = 0, opacity = 1, data = {}, tags = [] }) {
    const id = 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const maxZ = this.elements.reduce((max, el) => Math.max(max, el.zIndex || 0), 0);

    const el = {
      id,
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      rotation: Math.round(rotation * 10) / 10,
      zIndex: maxZ + 1,
      opacity,
      data: { ...data },
      tags: [...tags]
    };

    this.elements.push(el);
    this.select(id, false);
    this.saveHistory(`Add ${type}`);
    this.notify({ type: 'add', element: el });
    return el;
  }

  addImageElement({ src, x, y, width = 360, height = 280, title = '', polaroid = false, radius = 6 }) {
    return this.createElement({
      type: 'image',
      x,
      y,
      width,
      height,
      data: {
        src,
        title,
        polaroid,
        radius,
        shadow: 'soft',
        filter: 'none',
        fit: 'cover',
        caption: title || ''
      },
      tags: ['photo']
    });
  }

  addQuoteElement({ quote, author = '', cite = '', x, y, width = 380, height = 220, fontFamily = 'Playfair Display', fontSize = 22, color = '#f8fafc', bg = 'rgba(26, 28, 35, 0.85)', quoteStyle = 'editorial', radius = 8, shadow = 'soft' }) {
    return this.createElement({
      type: 'quote',
      x,
      y,
      width,
      height,
      data: {
        quote: quote || 'Simplicity is about subtracting the obvious and adding the meaningful.',
        author: author !== undefined ? author : 'John Maeda',
        cite: cite !== undefined ? cite : 'The Laws of Simplicity',
        fontFamily,
        fontSize,
        color,
        bg,
        quoteStyle,
        radius,
        shadow
      },
      tags: ['quote', 'typography']
    });
  }

  addTextElement({ text = null, x = 100, y = 100, width = null, height = null, fontSize = 32, fontFamily = 'Montserrat', fontWeight = '700', color = '#111827', boundary = 'dynamic', align = 'left', letterSpacing = 0, lineHeight = 1.2 } = {}) {
    const isBox = boundary === 'box';
    let calcW = width;
    let calcH = height;

    let initialText = text;
    if (initialText === null || initialText === undefined) {
      if (isBox && calcW && calcH) {
        initialText = getLoremIpsumForBox(calcW, calcH, { fontFamily, fontSize, fontWeight, letterSpacing, lineHeight });
      } else {
        initialText = LOREM_IPSUM;
      }
    }

    if (!isBox || !calcW || !calcH) {
      const measured = measureTextBounds(initialText, { fontFamily, fontSize, fontWeight, letterSpacing, lineHeight });
      if (!calcW) calcW = measured.width;
      if (!calcH) calcH = measured.height;
    }

    return this.createElement({
      type: 'text',
      x,
      y,
      width: calcW,
      height: calcH,
      data: {
        text: initialText,
        fontFamily,
        fontSize,
        fontWeight,
        color: color || '#111827',
        boundary: isBox ? 'box' : 'dynamic',
        align,
        letterSpacing,
        lineHeight
      },
      tags: ['text', 'typography']
    });
  }

  addStickyElement({ text, x, y, width = 220, height = 220, color = '#fef08a', tape = true, pin = false }) {
    const tilt = (Math.random() * 4 - 2);
    return this.createElement({
      type: 'sticky',
      x,
      y,
      width,
      height,
      rotation: Math.round(tilt * 10) / 10,
      data: {
        text: text || 'Key Takeaway:\nFocus on texture and natural light.',
        color, // soft yellow, peach, mint, lavender, rose, dark
        tape,
        pin,
        font: 'handwriting'
      },
      tags: ['note']
    });
  }

  addSwatchElement({ hex = '#f59e0b', name = 'Amber Gold', label = 'Primary Accent', x, y, width = 180, height = 180 }) {
    return this.createElement({
      type: 'swatch',
      x,
      y,
      width,
      height,
      data: {
        hex,
        name,
        label,
        showRgb: true
      },
      tags: ['color']
    });
  }

  addConnectorElement({ x1 = 100, y1 = 100, x2 = 300, y2 = 250, color = '#f59e0b', strokeWidth = 2, strokeStyle = 'solid' }) {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.max(40, Math.abs(x2 - x1));
    const h = Math.max(40, Math.abs(y2 - y1));

    return this.createElement({
      type: 'connector',
      x: minX,
      y: minY,
      width: w,
      height: h,
      data: {
        start: { x: x1 - minX, y: y1 - minY },
        end: { x: x2 - minX, y: y2 - minY },
        color,
        strokeWidth,
        strokeStyle,
        arrow: true,
        curved: true
      },
      tags: ['connector']
    });
  }

  addShapeElement({ shapeType = 'rect', x, y, width = 200, height = 200, fill = 'rgba(245, 158, 11, 0.15)', stroke = '#f59e0b', strokeWidth = 2 }) {
    return this.createElement({
      type: 'shape',
      x,
      y,
      width,
      height,
      data: {
        shapeType,
        fill,
        stroke,
        strokeWidth,
        radius: 8
      },
      tags: ['shape']
    });
  }

  // Selection
  select(id, multi = false) {
    if (!multi) {
      this.selectedIds.clear();
    }
    if (id) {
      if (multi && this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
      }
    }
    this.notify({ type: 'selection' });
  }

  selectAll() {
    this.selectedIds = new Set(this.elements.map(e => e.id));
    this.notify({ type: 'selection' });
  }

  clearSelection() {
    if (this.selectedIds.size > 0) {
      this.selectedIds.clear();
      this.notify({ type: 'selection' });
    }
  }

  getSelectedElements() {
    return this.elements.filter(e => this.selectedIds.has(e.id));
  }

  getElementById(id) {
    return this.elements.find(e => e.id === id);
  }

  // Mutations
  updateElement(id, updates, commitHistory = true) {
    const el = this.getElementById(id);
    if (!el) return null;

    if (updates.data) {
      el.data = { ...el.data, ...updates.data };
      delete updates.data;
    }
    Object.assign(el, updates);

    if (commitHistory) {
      this.saveHistory(`Update ${el.type}`);
    }
    this.notify({ type: 'update', element: el });
    return el;
  }

  deleteSelected() {
    if (!this.selectedIds.size) return;
    this.elements = this.elements.filter(e => !this.selectedIds.has(e.id));
    this.selectedIds.clear();
    this.saveHistory('Delete selection');
    this.notify({ type: 'delete' });
  }

  duplicateSelected(offset = 30) {
    const selected = this.getSelectedElements();
    if (!selected.length) return;

    this.selectedIds.clear();
    const newItems = [];

    for (const el of selected) {
      const cloned = JSON.parse(JSON.stringify(el));
      cloned.id = 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      cloned.x += offset;
      cloned.y += offset;
      cloned.zIndex = this.elements.length + 1;
      this.elements.push(cloned);
      this.selectedIds.add(cloned.id);
      newItems.push(cloned);
    }

    this.saveHistory(`Duplicate ${newItems.length} items`);
    this.notify({ type: 'duplicate', elements: newItems });
  }

  // Z-Order
  bringToFront() {
    const selected = this.getSelectedElements();
    if (!selected.length) return;
    const maxZ = this.elements.reduce((m, e) => Math.max(m, e.zIndex || 0), 0);
    selected.forEach((el, i) => {
      el.zIndex = maxZ + 1 + i;
    });
    this.normalizeZIndex();
    this.saveHistory('Bring to Front');
    this.notify({ type: 'zorder' });
  }

  sendToBack() {
    const selected = this.getSelectedElements();
    if (!selected.length) return;
    const minZ = this.elements.reduce((m, e) => Math.min(m, e.zIndex || 0), 0);
    selected.forEach((el, i) => {
      el.zIndex = minZ - selected.length + i;
    });
    this.normalizeZIndex();
    this.saveHistory('Send to Back');
    this.notify({ type: 'zorder' });
  }

  bringForward() {
    const selected = this.getSelectedElements();
    if (!selected.length) return;
    for (const el of selected) {
      el.zIndex = (el.zIndex || 0) + 1.5;
    }
    this.normalizeZIndex();
    this.saveHistory('Bring Forward');
    this.notify({ type: 'zorder' });
  }

  sendBackward() {
    const selected = this.getSelectedElements();
    if (!selected.length) return;
    for (const el of selected) {
      el.zIndex = (el.zIndex || 0) - 1.5;
    }
    this.normalizeZIndex();
    this.saveHistory('Send Backward');
    this.notify({ type: 'zorder' });
  }

  normalizeZIndex() {
    this.elements.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    this.elements.forEach((el, idx) => {
      el.zIndex = idx + 1;
    });
  }

  // Alignment Tools
  alignSelected(alignment) {
    const selected = this.getSelectedElements();
    if (selected.length < 2) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    selected.forEach(el => {
      minX = Math.min(minX, el.x);
      maxX = Math.max(maxX, el.x + el.width);
      minY = Math.min(minY, el.y);
      maxY = Math.max(maxY, el.y + el.height);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    switch (alignment) {
      case 'left':
        selected.forEach(el => el.x = minX);
        break;
      case 'center':
        selected.forEach(el => el.x = Math.round(centerX - el.width / 2));
        break;
      case 'right':
        selected.forEach(el => el.x = Math.round(maxX - el.width));
        break;
      case 'top':
        selected.forEach(el => el.y = minY);
        break;
      case 'middle':
        selected.forEach(el => el.y = Math.round(centerY - el.height / 2));
        break;
      case 'bottom':
        selected.forEach(el => el.y = Math.round(maxY - el.height));
        break;
      case 'distribute-h':
        selected.sort((a, b) => a.x - b.x);
        const totalW = selected.reduce((sum, el) => sum + el.width, 0);
        const gapH = (maxX - minX - totalW) / (selected.length - 1);
        let curX = minX;
        selected.forEach(el => {
          el.x = Math.round(curX);
          curX += el.width + gapH;
        });
        break;
      case 'distribute-v':
        selected.sort((a, b) => a.y - b.y);
        const totalH = selected.reduce((sum, el) => sum + el.height, 0);
        const gapV = (maxY - minY - totalH) / (selected.length - 1);
        let curY = minY;
        selected.forEach(el => {
          el.y = Math.round(curY);
          curY += el.height + gapV;
        });
        break;
    }

    this.saveHistory(`Align ${alignment}`);
    this.notify({ type: 'align' });
  }

  applyLayoutUpdates(updates, label = 'Apply Moodboard Layout') {
    if (!updates || !updates.length) return;
    for (const u of updates) {
      const el = this.getElementById(u.id);
      if (el) {
        Object.assign(el, u);
      }
    }
    this.saveHistory(label);
    this.notify({ type: 'layout' });
  }

  clearBoard() {
    this.elements = [];
    this.selectedIds.clear();
    this.saveHistory('Clear board');
    this.notify({ type: 'clear' });
  }
}
