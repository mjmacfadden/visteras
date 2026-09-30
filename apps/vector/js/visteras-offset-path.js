/**
 * Visteras Vector — Offset Path  (Object → Offset Path…, ⌥⌘O)
 *
 * Creates a parallel offset copy of each selected closed path, placing the
 * result on top of the original in the same layer.  Positive offset expands;
 * negative shrinks.
 *
 * Implementation detail
 * ─────────────────────
 * Paper.js does not expose a direct "stroke-expand" API the way Inkscape does,
 * but we can fake it reliably:
 *
 *   1. Import the source path into a Paper.js scope.
 *   2. Clone it and set stroke-width = |offset| × 2 on the clone.
 *   3. Unite the clone's stroke outline with the original:
 *        positive offset → unite(original, stroke-envelope)
 *        negative offset → subtract stroke-envelope from original
 *   4. Export the result back as an SVG <path>.
 *
 * For the join-type we set Paper.js's strokeJoin on the stroke clone before
 * expanding, which naturally propagates to the outline geometry.
 *
 * Keyboard: ⌥⌘O (wired up in setupMenuBar via action_offset_path)
 *
 * Exports
 * ───────
 *   mountOffsetPath(editor)          — registers menu item + dialog
 *   computeOffsetPath(scope, el, opts) — pure geometry (testable without DOM)
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// ─── Dialog HTML ─────────────────────────────────────────────────────────────
const DIALOG_ID = 'visteras-offset-path-dialog';

function buildDialog() {
  if (document.getElementById(DIALOG_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = DIALOG_ID;
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:100000',
    'display:none', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.55)',
  ].join(';');

  overlay.innerHTML = `
    <div id="${DIALOG_ID}-inner" style="
      background:#2a2a2e;
      border:1px solid rgba(255,255,255,0.12);
      border-radius:10px;
      box-shadow:0 12px 48px rgba(0,0,0,0.6);
      width:300px;
      font:13px/1.5 -apple-system,sans-serif;
      color:#ddd;
      overflow:hidden;
    ">
      <!-- Title bar -->
      <div style="
        background:#1e1e22;
        padding:12px 16px;
        border-bottom:1px solid rgba(255,255,255,0.08);
        font-weight:600;
        font-size:13px;
        color:#fff;
        display:flex;
        align-items:center;
        gap:8px;
      ">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="#7cb9ff" stroke-width="1.5" fill="none"/>
          <rect x="4.5" y="4.5" width="7" height="7" rx="1" stroke="#7cb9ff" stroke-width="1" stroke-dasharray="2 1.5" fill="none"/>
        </svg>
        Offset Path
      </div>

      <!-- Body -->
      <div style="padding:16px 16px 12px">
        <!-- Offset input -->
        <label style="display:block;margin-bottom:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin-bottom:5px">
            Offset Distance
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input id="${DIALOG_ID}-offset" type="number" value="10" step="0.5"
              style="
                flex:1;
                background:#18181b;
                border:1px solid rgba(255,255,255,0.15);
                border-radius:5px;
                color:#fff;
                padding:5px 8px;
                font:13px/1 -apple-system,sans-serif;
                outline:none;
              "
            >
            <span style="font-size:11px;color:#888;min-width:16px">px</span>
          </div>
          <div style="font-size:10px;color:#666;margin-top:4px">
            Positive = expand · Negative = shrink
          </div>
        </label>

        <!-- Join type -->
        <label style="display:block;margin-bottom:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin-bottom:5px">
            Joins
          </div>
          <select id="${DIALOG_ID}-joins" style="
            width:100%;
            background:#18181b;
            border:1px solid rgba(255,255,255,0.15);
            border-radius:5px;
            color:#fff;
            padding:5px 8px;
            font:13px/1 -apple-system,sans-serif;
            outline:none;
          ">
            <option value="miter">Miter</option>
            <option value="round" selected>Round</option>
            <option value="bevel">Bevel</option>
          </select>
        </label>

        <!-- Miter limit -->
        <label id="${DIALOG_ID}-miter-row" style="display:block;margin-bottom:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin-bottom:5px">
            Miter Limit
          </div>
          <input id="${DIALOG_ID}-miter" type="number" value="4" min="1" max="100" step="1"
            style="
              width:100%;
              box-sizing:border-box;
              background:#18181b;
              border:1px solid rgba(255,255,255,0.15);
              border-radius:5px;
              color:#fff;
              padding:5px 8px;
              font:13px/1 -apple-system,sans-serif;
              outline:none;
            "
          >
        </label>

        <!-- Options row -->
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;user-select:none">
          <input id="${DIALOG_ID}-copy" type="checkbox" checked
            style="accent-color:#7cb9ff;width:13px;height:13px;margin:0">
          <span style="font-size:12px">Create offset copy (keep original)</span>
        </label>
      </div>

      <!-- Buttons -->
      <div style="
        display:flex;
        gap:8px;
        padding:10px 16px 14px;
        border-top:1px solid rgba(255,255,255,0.07);
        justify-content:flex-end;
      ">
        <button id="${DIALOG_ID}-cancel" style="
          background:transparent;
          border:1px solid rgba(255,255,255,0.18);
          border-radius:6px;
          color:#ccc;
          padding:6px 16px;
          font:13px -apple-system,sans-serif;
          cursor:pointer;
        ">Cancel</button>
        <button id="${DIALOG_ID}-ok" style="
          background:#3a7bd5;
          border:none;
          border-radius:6px;
          color:#fff;
          padding:6px 18px;
          font:13px -apple-system,sans-serif;
          cursor:pointer;
          font-weight:500;
        ">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Show/hide miter limit based on join type
  const joinsEl = overlay.querySelector(`#${DIALOG_ID}-joins`);
  const miterRow = overlay.querySelector(`#${DIALOG_ID}-miter-row`);
  joinsEl.addEventListener('change', () => {
    miterRow.style.display = joinsEl.value === 'miter' ? 'block' : 'none';
  });
  miterRow.style.display = 'none'; // Round is default

  // Keyboard: Enter = OK, Escape = cancel
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.style.display = 'none';
    if (e.key === 'Enter') overlay.querySelector(`#${DIALOG_ID}-ok`)?.click();
  });

  // Click outside inner = cancel
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
}

function showDialog() {
  const overlay = document.getElementById(DIALOG_ID);
  if (!overlay) return;
  overlay.style.display = 'flex';
  setTimeout(() => overlay.querySelector(`#${DIALOG_ID}-offset`)?.focus(), 50);
}

function hideDialog() {
  const overlay = document.getElementById(DIALOG_ID);
  if (overlay) overlay.style.display = 'none';
}

function readDialogValues() {
  return {
    offset: parseFloat(document.getElementById(`${DIALOG_ID}-offset`)?.value) || 10,
    joins: document.getElementById(`${DIALOG_ID}-joins`)?.value || 'round',
    miterLimit: parseFloat(document.getElementById(`${DIALOG_ID}-miter`)?.value) || 4,
    copyOriginal: document.getElementById(`${DIALOG_ID}-copy`)?.checked ?? true,
  };
}

// ─── Core geometry ───────────────────────────────────────────────────────────
/**
 * Compute offset path geometry for a single SVG path element.
 *
 * Strategy:
 *   • Import the element into a Paper.js scope.
 *   • For POSITIVE offset: unite(original, stroked-clone) where stroke-width = offset*2.
 *   • For NEGATIVE offset: subtract(original, stroked-clone).
 *   • Export the result path data string.
 *
 * @param {object} scope         - A fresh paper.PaperScope() with canvas set up.
 * @param {SVGElement} sourceEl  - The source SVG element.
 * @param {{ offset: number, joins: string, miterLimit: number }} opts
 * @returns {{ d: string, fillRule: string|null } | null}
 */
export function computeOffsetPath(scope, sourceEl, opts) {
  const { offset, joins, miterLimit } = opts;
  if (Math.abs(offset) < 0.001) return null;

  let item;
  try {
    item = scope.project.importSVG(sourceEl);
  } catch (_) {
    return null;
  }

  // Flatten groups to a single PathItem
  let pathItem = null;
  if (item instanceof scope.PathItem) {
    pathItem = item;
  } else if (item instanceof scope.Shape) {
    pathItem = item.toPath(true);
  } else if (item instanceof scope.Group) {
    // Unite all children
    const children = [...item.children];
    for (const child of children) {
      const p = child instanceof scope.Shape ? child.toPath(true) :
                child instanceof scope.PathItem ? child : null;
      if (p) pathItem = pathItem ? pathItem.unite(p) : p;
    }
  }

  if (!pathItem) return null;

  // Create the stroke-expanded envelope
  const strokeClone = pathItem.clone();
  strokeClone.strokeWidth = Math.abs(offset) * 2;
  strokeClone.strokeColor = new scope.Color(0, 0, 0);
  strokeClone.fillColor = new scope.Color(0, 0, 0);
  strokeClone.strokeJoin = joins;
  if (joins === 'miter') strokeClone.miterLimit = miterLimit;

  let result;
  if (offset > 0) {
    // Expand: union of original + stroke envelope
    result = pathItem.unite(strokeClone);
  } else {
    // Shrink: subtract stroke envelope from original
    result = pathItem.subtract(strokeClone);
  }

  if (!result) return null;

  const exported = result.exportSVG({ asString: false });
  let d = '';
  let fillRule = null;

  if (exported.tagName?.toLowerCase() === 'path') {
    d = exported.getAttribute('d') || '';
    fillRule = exported.getAttribute('fill-rule');
  } else {
    // Group of paths — join their d attributes
    const paths = exported.querySelectorAll('path');
    const parts = [];
    paths.forEach(p => {
      const pd = p.getAttribute('d');
      if (pd) parts.push(pd);
      if (!fillRule) fillRule = p.getAttribute('fill-rule');
    });
    d = parts.join(' ');
  }

  return d.trim() ? { d, fillRule } : null;
}

// ─── Apply to selection ───────────────────────────────────────────────────────
function executeOffsetPath(editor, opts) {
  const sc = editor.svgCanvas;
  if (!sc) return;

  const selElems = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
  if (!selElems.length) {
    alert('Please select one or more paths to offset.');
    return;
  }

  if (!window.paper) {
    alert('Offset Path engine (Paper.js) is loading or unavailable.');
    return;
  }

  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
  const batchCmd = new BatchCommand('Offset Path');
  const newElements = [];

  const scope = new window.paper.PaperScope();
  const canvas = document.createElement('canvas');
  scope.setup(canvas);

  try {
    for (const el of selElems) {
      const geom = computeOffsetPath(scope, el, opts);
      if (!geom) continue;

      const newPath = document.createElementNS(SVG_NS, 'path');
      newPath.setAttribute('id', sc.getNextId());
      newPath.setAttribute('d', geom.d);
      if (geom.fillRule) newPath.setAttribute('fill-rule', geom.fillRule);

      // Copy style from original
      const styleAttrs = [
        'fill', 'fill-opacity', 'stroke', 'stroke-opacity',
        'stroke-width', 'stroke-linecap', 'stroke-linejoin',
        'stroke-dasharray', 'stroke-dashoffset', 'opacity',
      ];
      for (const attr of styleAttrs) {
        const val = el.getAttribute(attr);
        if (val !== null) newPath.setAttribute(attr, val);
      }

      // Place the new path after the original
      el.parentNode.insertBefore(newPath, el.nextSibling);
      batchCmd.addSubCommand(new InsertElementCommand(newPath));
      newElements.push(newPath);

      if (!opts.copyOriginal) {
        // Remove the original
        batchCmd.addSubCommand(new RemoveElementCommand(el, el.nextSibling, el.parentNode));
        el.remove();
      }
    }

    if (!newElements.length) {
      alert('Could not compute offset for the selected shape(s). Try a smaller offset value.');
      return;
    }

    sc.undoMgr.addCommandToHistory(batchCmd);
    sc.clearSelection();
    sc.addToSelection(newElements, true);
    sc.call('changed', newElements);
    if (window.__updatePropertiesVisibility) window.__updatePropertiesVisibility();
  } catch (err) {
    console.error('Offset Path error:', err);
    alert('Offset Path error: ' + (err.message || err));
  } finally {
    scope.project.clear();
  }
}

// ─── Outline Stroke helper ────────────────────────────────────────────────────
/**
 * Convert a stroked path to a filled shape (Object → Outline Stroke).
 * Uses Paper.js to expand the stroke into a filled region.
 */
function executeOutlineStroke(editor) {
  const sc = editor.svgCanvas;
  if (!sc) return;

  const selElems = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
  if (!selElems.length) {
    alert('Please select one or more stroked paths to outline.');
    return;
  }

  if (!window.paper) {
    alert('Outline Stroke requires Paper.js.');
    return;
  }

  const { BatchCommand, InsertElementCommand, RemoveElementCommand } = sc.history;
  const batchCmd = new BatchCommand('Outline Stroke');
  const newElements = [];

  const scope = new window.paper.PaperScope();
  const canvas = document.createElement('canvas');
  scope.setup(canvas);

  try {
    for (const el of selElems) {
      const sw = parseFloat(el.getAttribute('stroke-width') || '0');
      if (!sw || sw <= 0) continue; // No visible stroke to outline

      let item;
      try {
        item = scope.project.importSVG(el);
      } catch (_) { continue; }

      let pathItem = item instanceof scope.PathItem ? item :
                     item instanceof scope.Shape ? item.toPath(true) : null;
      if (!pathItem) continue;

      // Create the stroked outline as a new path
      pathItem.strokeWidth = sw;
      pathItem.strokeColor = new scope.Color(0);

      // Get the stroke outline only (the "expand" of the stroke)
      const strokePath = pathItem.clone();
      const filled = pathItem.clone();
      filled.strokeWidth = 0;
      filled.strokeColor = null;

      const outline = strokePath.unite(filled).subtract(filled);

      const exported = outline.exportSVG({ asString: false });
      let d = '';
      if (exported.tagName?.toLowerCase() === 'path') {
        d = exported.getAttribute('d') || '';
      } else {
        const paths = exported.querySelectorAll('path');
        const parts = [];
        paths.forEach(p => { const pd = p.getAttribute('d'); if (pd) parts.push(pd); });
        d = parts.join(' ');
      }

      if (!d.trim()) continue;

      const newPath = document.createElementNS(SVG_NS, 'path');
      newPath.setAttribute('id', sc.getNextId());
      newPath.setAttribute('d', d);
      // Fill the outline with the original stroke color
      const strokeColor = el.getAttribute('stroke') || '#000';
      newPath.setAttribute('fill', strokeColor);
      newPath.setAttribute('stroke', 'none');

      el.parentNode.insertBefore(newPath, el.nextSibling);
      batchCmd.addSubCommand(new InsertElementCommand(newPath));

      // Remove original
      batchCmd.addSubCommand(new RemoveElementCommand(el, el.nextSibling, el.parentNode));
      el.remove();

      newElements.push(newPath);
    }

    if (!newElements.length) {
      alert('No stroked paths found. Make sure selected objects have a visible stroke.');
      return;
    }

    sc.undoMgr.addCommandToHistory(batchCmd);
    sc.clearSelection();
    sc.addToSelection(newElements, true);
    sc.call('changed', newElements);
    if (window.__updatePropertiesVisibility) window.__updatePropertiesVisibility();
  } catch (err) {
    console.error('Outline Stroke error:', err);
    alert('Outline Stroke error: ' + (err.message || err));
  } finally {
    scope.project.clear();
  }
}

// ─── Mount ───────────────────────────────────────────────────────────────────
/**
 * Register Offset Path with the Visteras menu system.
 * @param {object} editor - SVG-Edit Editor instance.
 */
export function mountOffsetPath(editor) {
  // Build the dialog once the DOM is ready
  buildDialog();

  // Wire dialog OK button
  document.getElementById(`${DIALOG_ID}-ok`)?.addEventListener('click', () => {
    const opts = readDialogValues();
    hideDialog();
    executeOffsetPath(editor, opts);
  });

  document.getElementById(`${DIALOG_ID}-cancel`)?.addEventListener('click', hideDialog);

  // Menu item: Object → Offset Path…
  document.getElementById('action_offset_path')?.addEventListener('click', () => {
    const sc = editor.svgCanvas;
    const selElems = (sc?.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
    if (!selElems.length) {
      alert('Please select one or more paths to offset.');
      return;
    }
    showDialog();
  });

  // Menu item: Object → Outline Stroke
  document.getElementById('action_outline_stroke')?.addEventListener('click', () => {
    executeOutlineStroke(editor);
  });

  // Keyboard: ⌥⌘O
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyO') {
      e.preventDefault();
      document.getElementById('action_offset_path')?.click();
    }
  }, true);
}

export default mountOffsetPath;
