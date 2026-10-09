/** gravit-gap-4 item 5: Text menu → Type; Color Adjust → Edit > Edit Colors > Adjust Color Balance… */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Type menu: top-level title is "Type" (id menu_text kept stable) and no "Text" menu remains', () => {
  assert.match(html, /<div class="menu_entry" id="menu_text">\s*<div class="menu_entry_title">Type<\/div>/);
  assert.doesNotMatch(html, /<div class="menu_entry_title">Text<\/div>/);
});

test('Menu order: File, Edit, Object, Type, [Select injected after Type], Effect, View, Window, Help', () => {
  const ids = [...html.matchAll(/<div class="menu_entry" id="(menu_[a-z]+)">/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['menu_file', 'menu_edit', 'menu_object', 'menu_text', 'menu_effect', 'menu_view', 'menu_window', 'menu_help']);
  const sel = fs.readFileSync(new URL('../js/visteras-select-same.js', import.meta.url), 'utf8');
  assert.match(sel, /const textMenu = document\.getElementById\('menu_text'\)/);
  assert.match(sel, /const anchor = textMenu \|\| document\.getElementById\('menu_object'\)/);
  assert.match(sel, /anchor\.after\(entry\)|anchor\.parentNode\.insertBefore\(entry, anchor\.nextSibling\)/);
});

test('Adjust Color Balance… lives in Edit > Edit Colors and is gone from the Effect menu', async () => {
  const edit = html.slice(html.indexOf('id="menu_edit"'), html.indexOf('id="menu_object"'));
  assert.match(edit, /id="action_edit_colors_menu">Edit Colors<span class="menu_submenu_arrow"/);
  assert.match(edit, /id="action_adjust_color_balance" data-fx-type="colorAdjust">Adjust Color Balance…<\/div>/);
  const F = await import('../js/visteras-effects.js');
  assert.ok(!F.EFFECT_MENU.some((m) => m.items?.includes('colorAdjust')));
  assert.doesNotMatch(F.effectMenuHtml(), /colorAdjust/);
  assert.equal(F.FX_LABELS.colorAdjust, 'Adjust Color Balance');
  const src = fs.readFileSync(new URL('../js/visteras-effects.js', import.meta.url), 'utf8');
  assert.match(src, /getElementById\('action_adjust_color_balance'\)\?\.addEventListener\('click', \(e\) => runItem\(e\.currentTarget\)\)/);
});
