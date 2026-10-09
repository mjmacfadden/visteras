import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ICON_GROUPS, LEGACY_GRID_CLASSES, SE_BUTTON_SHADOW_CSS } from '../js/visteras-icon-buttons.js';
import { TYPE_CURSOR, IBEAM_CURSOR, TEXT_SELECTORS, CANVAS_SELECTORS, typeCursorCss } from '../js/visteras-type-cursor.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');
const tokens = read('../../../packages/ui/src/tokens.css');
const ui = read('../../../packages/ui/src/ui.css');
const theme = read('../css/visteras-theme.css');

test('every Properties/panel icon row is a shared icon group', () => {
  for (const id of ['#slot_flip', '#slot_align_btns', '#slot_distrib_btns', '#slot_action_btns', '#slot_text_styles', '#slot_text_align', '#vpara_panel_align']) {
    assert.ok(ICON_GROUPS.includes(id), `${id} missing from ICON_GROUPS`);
  }
  for (const sel of ICON_GROUPS.filter((s) => s.startsWith('#') && s !== '#vpara_panel_align' && s !== '#vcs_app_stroke_align' && s !== '#top_align_group')) {
    assert.match(html, new RegExp(`id="${sel.slice(1)}"`), `${sel} not in index.html`);
  }
  assert.deepEqual([...LEGACY_GRID_CLASSES].sort(), ['prop_actions_flow', 'prop_grid_2col_btns', 'prop_grid_6col']);
});

test('icon-button metrics come from @visteras/ui tokens, accent from --visteras-accent', () => {
  for (const t of ['--vui-icon-btn-width', '--vui-icon-btn-height', '--vui-icon-btn-gap', '--vui-icon-btn-radius', '--vui-icon-btn-icon-size']) {
    assert.match(tokens, new RegExp(`${t}:`), `${t} token missing`);
    assert.match(ui, new RegExp(`var\\(${t}`), `${t} unused in ui.css`);
  }
  const groupRule = ui.match(/\.vui-icon-group\s*\{[^}]*\}/)[0];
  assert.match(groupRule, /justify-content:\s*flex-start/);
  assert.doesNotMatch(groupRule, /space-between|width:\s*100%/);
  const active = ui.match(/\.vui-icon-btn\.active[^{]*\{[^}]*\}/)[0];
  assert.match(active, /aria-pressed="?true"?\]/);
  assert.match(active, /var\(--visteras-accent/);
  assert.match(ui, /\.vui-icon-btn\[hidden\]/, 'hidden buttons must stay hidden (no empty Actions cell)');
});

test('se-button shadow box is neutralised so the host draws the button', () => {
  assert.match(SE_BUTTON_SHADOW_CSS, /:host\(\.vui-icon-btn\) \.btn-box \{[^}]*margin: 0 !important/);
  assert.match(SE_BUTTON_SHADOW_CSS, /background: transparent !important/);
  assert.match(SE_BUTTON_SHADOW_CSS, /justify-content: center/);
});

test('theme overrides no longer stretch shared icon rows or draw a second active style', () => {
  assert.doesNotMatch(theme, /#properties_panel se-button\s*\{[^}]*display:\s*inline-flex !important/, 'unscoped inline-flex rule un-hides hidden buttons');
  assert.match(theme, /\.prop_row:not\(\.vui-icon-group\)/);
  assert.match(html, /mountIconButtons\(\)/);
  assert.match(html, /mountTypeCursor\(\)/);
});

test('Type tool cursor: I-beam over type in Type mode and while editing, type cursor elsewhere', () => {
  const css = typeCursorCss();
  assert.equal(IBEAM_CURSOR, 'text');
  assert.match(TYPE_CURSOR, /^url\("data:image\/svg\+xml,.*\) \d+ \d+, text$/);
  for (const pre of ['body[data-mode="text"]:not(.visteras-top-mode-active)', 'body[data-vector-editing-text]']) {
    for (const t of TEXT_SELECTORS) assert.ok(css.includes(`${pre} ${t}`), `${pre} ${t}`);
    for (const c of CANVAS_SELECTORS) assert.ok(css.includes(`${pre} ${c}`), `${pre} ${c}`);
  }
  // text rule must come after the canvas rule so it wins at equal specificity
  assert.ok(css.lastIndexOf('cursor: text') > css.indexOf(TYPE_CURSOR));
});
