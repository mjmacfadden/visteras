/** gravit-gap-4 item 6: Properties > Actions no longer shows SVG-Edit 'id' / 'class' inputs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/visteras-svgedit-hygiene.css', import.meta.url), 'utf8');

test('Actions section: only the action buttons flow, no id/class row (no empty gap)', () => {
  assert.match(html, /<div class="prop_section_body" id="sec_actions_body">\s*<div class="prop_actions_flow" id="slot_action_btns"><\/div>\s*<\/div>/);
  assert.doesNotMatch(html, /row_elem_id_class|slot_elem_id|slot_elem_class/);
  assert.doesNotMatch(html, /moveEl\('elem_(id|class)'/);
});

test('SVG-Edit originals stay hidden in #tools_top (Editor.js still binds them by id)', () => {
  assert.match(css, /#tools_top #elem_id,\n#tools_top #elem_class \{\n  display: none !important;/);
});
