/**
 * Visteras Vector — Eyedropper Tool (I).
 * Adobe Illustrator-style colour sampler / style applicator:
 *
 * Behaviour
 * ─────────
 * • Press I to activate the tool.
 * • Click any object to SAMPLE its fill, stroke, stroke-width, opacity, etc.
 *   The cursor shows a small swatch of the sampled style.
 * • With objects selected BEFORE clicking: APPLY the sampled style to ALL
 *   selected objects (Illustrator behaviour — opposite of SVG-Edit default).
 * • Alt/Option+click always SAMPLES regardless of selection.
 * • Shift+click APPLIES without clearing the sampled style afterwards.
 * • Escape while the tool is active: clear sample and return to Select.
 *
 * Options Panel
 * ─────────────
 * A collapsible "Eyedropper Options" panel is injected into #sidepanels when
 * the eyedropper mode is active. The panel lets the user choose which style
 * attributes to sample / apply.
 */

const MODE = 'eyedropper';

// ─── Internal style state ────────────────────────────────────────────────────
/** @type {Record<string,string>} sampled style attributes */
let _sampledStyle = {};

/** Options: which attributes to include when sampling / applying */
let _options = {
  sampleFill: true,
  sampleStroke: true,
  sampleStrokeWidth: true,
  sampleOpacity: true,
  sampleStrokeDash: true,
  sampleStrokeCaps: true,
  applyFill: true,
  applyStroke: true,
  applyStrokeWidth: true,
  applyOpacity: true,
  applyStrokeDash: true,
  applyStrokeCaps: true,
};

// Load persisted options from localStorage
function _loadOptions() {
  try {
    const stored = localStorage.getItem('visteras_eyedropper_options');
    if (stored) Object.assign(_options, JSON.parse(stored));
  } catch (_) { /* ignore */ }
}

function _saveOptions() {
  try {
    localStorage.setItem('visteras_eyedropper_options', JSON.stringify(_options));
  } catch (_) { /* ignore */ }
}

// ─── Sampling ────────────────────────────────────────────────────────────────
/**
 * Sample style attributes from an SVG element according to current options.
 * @param {SVGElement} el
 * @returns {Record<string,string>} sampled attributes (raw SVG attribute names)
 */
export function sampleStyleFrom(el) {
  if (!el || ['svg', 'g', 'use', 'defs'].includes(el.nodeName)) return {};
  const s = {};
  const g = (attr) => el.getAttribute(attr) ?? null;
  if (_options.sampleFill) {
    const f = g('fill'); if (f !== null) s['fill'] = f;
    const fo = g('fill-opacity'); if (fo !== null) s['fill-opacity'] = fo;
  }
  if (_options.sampleStroke) {
    const st = g('stroke'); if (st !== null) s['stroke'] = st;
    const so = g('stroke-opacity'); if (so !== null) s['stroke-opacity'] = so;
  }
  if (_options.sampleStrokeWidth) {
    const sw = g('stroke-width'); if (sw !== null) s['stroke-width'] = sw;
  }
  if (_options.sampleOpacity) {
    const op = g('opacity'); if (op !== null) s['opacity'] = op;
  }
  if (_options.sampleStrokeDash) {
    const da = g('stroke-dasharray'); if (da !== null) s['stroke-dasharray'] = da;
  }
  if (_options.sampleStrokeCaps) {
    const lc = g('stroke-linecap'); if (lc !== null) s['stroke-linecap'] = lc;
    const lj = g('stroke-linejoin'); if (lj !== null) s['stroke-linejoin'] = lj;
  }
  return s;
}

/**
 * Apply previously sampled styles to an array of SVG elements, recording an
 * undo history entry.
 * @param {SVGElement[]} targets
 * @param {Record<string,string>} style
 * @param {{ChangeElementCommand:any, undoMgr:any}} history
 */
export function applyStyleToElements(targets, style, history) {
  if (!targets.length || !Object.keys(style).length) return;
  const { ChangeElementCommand } = history;
  const batch = [];

  // Determine which attrs to apply based on options
  const allowed = new Set();
  if (_options.applyFill) { allowed.add('fill'); allowed.add('fill-opacity'); }
  if (_options.applyStroke) { allowed.add('stroke'); allowed.add('stroke-opacity'); }
  if (_options.applyStrokeWidth) allowed.add('stroke-width');
  if (_options.applyOpacity) allowed.add('opacity');
  if (_options.applyStrokeDash) allowed.add('stroke-dasharray');
  if (_options.applyStrokeCaps) { allowed.add('stroke-linecap'); allowed.add('stroke-linejoin'); }

  for (const el of targets) {
    const changes = {};
    for (const [attr, val] of Object.entries(style)) {
      if (!allowed.has(attr)) continue;
      changes[attr] = el.getAttribute(attr) ?? '';
      if (val === null || val === 'none' && attr === 'stroke-dasharray') {
        el.removeAttribute(attr);
      } else {
        el.setAttribute(attr, val);
      }
    }
    if (Object.keys(changes).length) {
      batch.push(new ChangeElementCommand(el, changes));
    }
  }

  if (!batch.length) return;

  // Wrap in a BatchCommand if available, or add individually
  try {
    const { BatchCommand } = history;
    const cmd = new BatchCommand('Eyedropper Apply');
    batch.forEach(c => cmd.addSubCommand(c));
    history.undoMgr.addCommandToHistory(cmd);
  } catch (_) {
    // Fallback: add each individually (older SVG-Edit)
    batch.forEach(c => history.undoMgr.addCommandToHistory(c));
  }
}

// ─── Cursor HUD ──────────────────────────────────────────────────────────────
let _hudEl = null;
let _hudFillSwatch = null;
let _hudStrokeSwatch = null;
let _hudStatus = null;

function _buildHud() {
  if (_hudEl) return;

  _hudEl = document.createElement('div');
  _hudEl.id = 'visteras-eyedropper-hud';
  _hudEl.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:99999',
    'display:none',
    'align-items:center',
    'gap:4px',
    'background:rgba(30,30,30,0.85)',
    'border:1px solid rgba(255,255,255,0.18)',
    'border-radius:6px',
    'padding:5px 8px',
    'font:11px/1.4 -apple-system,sans-serif',
    'color:#fff',
    'white-space:nowrap',
    'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
    'transform:translate(14px,-50%)',
  ].join(';');

  // Fill swatch
  _hudFillSwatch = document.createElement('div');
  _hudFillSwatch.style.cssText = 'width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,0.3);background:#fff;flex-shrink:0';

  // Stroke ring
  _hudStrokeSwatch = document.createElement('div');
  _hudStrokeSwatch.style.cssText = 'width:14px;height:14px;border-radius:3px;border:2px solid #fff;background:transparent;flex-shrink:0';

  // Status label
  _hudStatus = document.createElement('span');
  _hudStatus.style.cssText = 'font-size:10px;opacity:0.8';

  _hudEl.style.display = 'flex';
  _hudEl.appendChild(_hudFillSwatch);
  _hudEl.appendChild(_hudStrokeSwatch);
  _hudEl.appendChild(_hudStatus);
  _hudEl.style.display = 'none';
  document.body.appendChild(_hudEl);
}

function _updateHud(hasSample) {
  if (!_hudEl) return;
  const fill = _sampledStyle['fill'] ?? 'transparent';
  const stroke = _sampledStyle['stroke'] ?? 'none';
  _hudFillSwatch.style.background = fill === 'none' ? 'transparent' : fill;
  _hudStrokeSwatch.style.borderColor = stroke === 'none' ? 'rgba(255,255,255,0.25)' : stroke;
  _hudStatus.textContent = hasSample ? 'click to apply' : 'click to sample';
}

function _showHud(x, y) {
  if (!_hudEl) return;
  _hudEl.style.display = 'flex';
  _hudEl.style.left = x + 'px';
  _hudEl.style.top = y + 'px';
}

function _hideHud() {
  if (_hudEl) _hudEl.style.display = 'none';
}

// ─── Options panel ───────────────────────────────────────────────────────────
function _buildOptionsPanel() {
  if (document.getElementById('visteras-eyedropper-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'visteras-eyedropper-panel';
  panel.style.cssText = 'display:none;padding:10px 12px;border-top:1px solid rgba(255,255,255,0.08);font:12px/1.5 -apple-system,sans-serif;color:#ccc';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;color:#fff;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em';
  title.textContent = 'Eyedropper Options';
  panel.appendChild(title);

  const ROWS = [
    { key: 'sampleFill',       label: 'Sample Fill' },
    { key: 'sampleStroke',     label: 'Sample Stroke' },
    { key: 'sampleStrokeWidth',label: 'Sample Stroke Width' },
    { key: 'sampleOpacity',    label: 'Sample Opacity' },
    { key: 'sampleStrokeDash', label: 'Sample Dash Array' },
    { key: 'sampleStrokeCaps', label: 'Sample Line Caps/Joins' },
    null, // divider
    { key: 'applyFill',        label: 'Apply Fill' },
    { key: 'applyStroke',      label: 'Apply Stroke' },
    { key: 'applyStrokeWidth', label: 'Apply Stroke Width' },
    { key: 'applyOpacity',     label: 'Apply Opacity' },
    { key: 'applyStrokeDash',  label: 'Apply Dash Array' },
    { key: 'applyStrokeCaps',  label: 'Apply Line Caps/Joins' },
  ];

  for (const row of ROWS) {
    if (row === null) {
      const div = document.createElement('div');
      div.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);margin:6px 0';
      panel.appendChild(div);
      continue;
    }
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:4px;user-select:none';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!_options[row.key];
    cb.style.cssText = 'accent-color:#7cb9ff;width:13px;height:13px;margin:0;cursor:pointer';
    cb.addEventListener('change', () => {
      _options[row.key] = cb.checked;
      _saveOptions();
    });
    const span = document.createElement('span');
    span.textContent = row.label;
    label.appendChild(cb);
    label.appendChild(span);
    panel.appendChild(label);
  }

  // Inject after the colour-system panel or at end of sidepanels
  const sidepanels = document.getElementById('sidepanels');
  if (sidepanels) sidepanels.appendChild(panel);
}

function _showOptionsPanel(show) {
  const panel = document.getElementById('visteras-eyedropper-panel');
  if (panel) panel.style.display = show ? 'block' : 'none';
}

// ─── Cursor style ────────────────────────────────────────────────────────────
function _injectCursorStyle() {
  if (document.getElementById('visteras-eyedropper-cursor-style')) return;
  const style = document.createElement('style');
  style.id = 'visteras-eyedropper-cursor-style';
  style.textContent = `
    body[data-mode="${MODE}"] #svgcanvas,
    body[data-mode="${MODE}"] #svgcanvas * {
      cursor: crosshair !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── Main mount ──────────────────────────────────────────────────────────────
/**
 * Mount the enhanced Visteras Eyedropper tool on top of the SVG-Edit
 * ext-eyedropper extension.
 *
 * @param {object} editor  - The SVG-Edit Editor instance.
 */
export function mountEyedropperTool(editor) {
  _loadOptions();
  _injectCursorStyle();
  _buildHud();

  const sc = editor.svgCanvas;
  const history = {
    ChangeElementCommand: sc.history.ChangeElementCommand,
    BatchCommand: sc.history.BatchCommand,
    undoMgr: sc.undoMgr,
  };

  // Build options panel once the DOM is ready (sidepanels exist after init)
  _buildOptionsPanel();

  // ── Mode change listener ──────────────────────────────────────────────────
  document.addEventListener('modeChange', () => {
    const active = sc.getMode() === MODE;
    _showOptionsPanel(active);
    if (!active) {
      _hideHud();
      _sampledStyle = {};
    }
    // Update body attribute so CSS cursor rule applies
    document.body.setAttribute('data-mode', active ? MODE : sc.getMode());
  });

  // ── Workarea mouse move ───────────────────────────────────────────────────
  const workarea = editor.workarea || document.getElementById('workarea');
  if (workarea) {
    workarea.addEventListener('mousemove', (e) => {
      if (sc.getMode() !== MODE) return;
      const hasSample = Object.keys(_sampledStyle).length > 0;
      _updateHud(hasSample);
      _showHud(e.clientX, e.clientY);
    });

    workarea.addEventListener('mouseleave', () => _hideHud());
  }

  // ── Override mouseDown to implement Illustrator-style sample/apply ────────
  // We listen at the capture phase on the SVG canvas element so we fire
  // before the ext-eyedropper's handler.
  const svgCanvasEl = document.getElementById('svgcanvas');
  if (svgCanvasEl) {
    svgCanvasEl.addEventListener('mousedown', (e) => {
      if (sc.getMode() !== MODE) return;

      // Find the actual SVG element under the pointer (may be deep in shadow
      // DOM or <g> wrappers). Walk up to find the first painted shape.
      let target = e.target;
      while (target && ['g', 'svg'].includes(target.nodeName)) {
        target = target.parentElement;
      }
      if (!target || ['svg', 'g', 'use', 'defs'].includes(target.nodeName)) return;

      e.stopPropagation(); // prevent ext-eyedropper from also running

      const altDown = e.altKey || e.metaKey;
      const selectedEls = (sc.getSelectedElements ? sc.getSelectedElements() : []).filter(Boolean);
      const hasSelection = selectedEls.length > 0;
      const hasSample = Object.keys(_sampledStyle).length > 0;

      if (altDown || !hasSample || !hasSelection) {
        // SAMPLE mode: record style from clicked element
        const sampled = sampleStyleFrom(target);
        if (Object.keys(sampled).length) {
          _sampledStyle = sampled;
          _updateHud(true);
        }
      } else {
        // APPLY mode: apply to all selected elements
        applyStyleToElements(selectedEls, _sampledStyle, history);
        // Notify SVG-Edit that elements changed so panels update
        sc.call('changed', selectedEls);
        if (window.__updatePropertiesVisibility) window.__updatePropertiesVisibility();
      }
    }, true /* capture */);
  }

  // ── Escape key: clear sample, return to Select ────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sc.getMode() === MODE) {
      if (Object.keys(_sampledStyle).length > 0) {
        _sampledStyle = {};
        _updateHud(false);
      } else {
        // Return to select tool
        editor.leftPanel?.clickSelect?.();
        _hideHud();
      }
    }
  });

  // ── Sync body data-mode on all mode changes ───────────────────────────────
  // (body[data-mode] is used by CSS cursor rule)
  sc.bind?.('modeChange', () => {
    document.body.setAttribute('data-mode', sc.getMode());
  });
}

export default mountEyedropperTool;
