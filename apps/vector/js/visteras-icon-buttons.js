/**
 * Visteras Vector — one icon-button look for Properties and the panels.
 *
 * Tags every icon-button row with the shared @visteras/ui classes
 * (.vui-icon-group / .vui-icon-btn, sized by --vui-icon-btn-* tokens): fixed
 * cells, left-aligned, equal gaps, no stretched cells, one active state
 * (accent border). SVG-Edit <se-button> hosts keep their own shadow box
 * (24×24, margins, grey fill), so that inner box is neutralised here and the
 * host draws the shared button.
 */
export const ICON_GROUPS = Object.freeze([
  '#slot_flip',
  '#slot_align_btns',
  '#slot_distrib_btns',
  '#slot_action_btns',
  '#slot_text_styles',
  '#slot_text_align',
  '#top_align_group',
  '#vpara_panel_align',
  '.prop_pathfinder_grid',
  '#vcs_app_stroke_align',
  '.vsym_footer',
]);
/** Stretching grid classes these rows used before (4-col Actions, 6-col Align, 2-col Distribute). */
export const LEGACY_GRID_CLASSES = Object.freeze(['prop_grid_6col', 'prop_grid_2col_btns', 'prop_actions_flow']);

export const SE_BUTTON_SHADOW_CSS = `
:host(.vui-icon-btn) .btn-box { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
  background: transparent !important; justify-content: center !important; border-radius: inherit !important; animation: none !important; }
:host(.vui-icon-btn:hover) :not(.disabled) { animation: none !important; }
:host(.vui-icon-btn) .pressed { background: transparent !important; }
:host(.vui-icon-btn) .btn-box img { width: var(--vui-icon-btn-icon-size, 16px); height: var(--vui-icon-btn-icon-size, 16px); }
:host(.vui-icon-btn) .label-container { display: none !important; }
`;

const isIconButton = (el) => el.matches?.('button, se-button');

function neutraliseShadow(btn) {
  const root = btn.shadowRoot;
  if (!root || root.querySelector('style[data-vui-icon]')) return;
  const style = document.createElement('style');
  style.dataset.vuiIcon = '1';
  style.textContent = SE_BUTTON_SHADOW_CSS;
  root.append(style);
}

/** Tag groups and their buttons; idempotent. Returns how many buttons are styled. */
export function applyIconButtons(root = document) {
  let n = 0;
  for (const sel of ICON_GROUPS) {
    for (const group of root.querySelectorAll(sel)) {
      group.classList.add('vui-icon-group');
      for (const c of LEGACY_GRID_CLASSES) group.classList.remove(c);
      for (const btn of group.children) {
        if (!isIconButton(btn)) continue;
        btn.classList.add('vui-icon-btn');
        if (btn.localName === 'se-button') neutraliseShadow(btn);
        n++;
      }
    }
  }
  return n;
}

export function mountIconButtons() {
  if (typeof document === 'undefined') return null;
  if (window.__visterasIconButtons) return window.__visterasIconButtons;
  applyIconButtons();
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; applyIconButtons(); }); } };
  const content = () => document.getElementById('svgcontent');
  new MutationObserver((records) => {
    const svg = content();
    if (records.some((r) => !(svg && svg.contains(r.target)))) schedule();
  }).observe(document.body, { childList: true, subtree: true });
  window.__visterasIconButtons = { apply: applyIconButtons, groups: ICON_GROUPS };
  return window.__visterasIconButtons;
}
