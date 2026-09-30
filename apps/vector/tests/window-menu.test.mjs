import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorHtmlPath = path.resolve(__dirname, '../index.html');

test('Window Menu: Pathfinder is a single option in Window menu', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  // Verify Object menu exists and DOES NOT contain pathfinder items
  const objectMenuMatch = html.match(/<div class="menu_entry" id="menu_object">([\s\S]*?)<\/div>\s*<!-- Text Menu -->/);
  assert.ok(objectMenuMatch, 'Object menu section found');
  const objectMenuContent = objectMenuMatch[1];
  assert.equal(objectMenuContent.includes('action_pathfinder_unite'), false, 'Pathfinder Unite should not be in Object menu');
  assert.equal(objectMenuContent.includes('action_pathfinder_minus_front'), false, 'Pathfinder Minus Front should not be in Object menu');
  assert.equal(objectMenuContent.includes('action_pathfinder_intersect'), false, 'Pathfinder Intersect should not be in Object menu');
  assert.equal(objectMenuContent.includes('action_pathfinder_exclude'), false, 'Pathfinder Exclude should not be in Object menu');
  assert.equal(objectMenuContent.includes('action_pathfinder_divide'), false, 'Pathfinder Divide should not be in Object menu');

  // Verify Window menu exists and contains single "Pathfinder" option
  const windowMenuMatch = html.match(/<div class="menu_entry" id="menu_window">([\s\S]*?)<\/div>\s*<!-- Help Menu -->/);
  assert.ok(windowMenuMatch, 'Window menu section found before Help menu');
  const windowMenuContent = windowMenuMatch[1];

  assert.match(windowMenuContent, /<div class="menu_entry_title">Window<\/div>/);
  assert.match(windowMenuContent, /<div class="menu_dropdown_item" id="action_window_pathfinder">Pathfinder<\/div>/);
  assert.equal(windowMenuContent.includes('id="action_pathfinder_unite"'), false, 'Individual actions should not be in dropdown');
});

test('Pathfinder Popup: contains the same 5 options matching the properties panel', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  // Verify popup element exists
  const panelMatch = html.match(/<div id="visteras_pathfinder_panel"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(panelMatch, 'Pathfinder floating popup panel found');
  const panelContent = panelMatch[0];

  // Verify header and close button
  assert.match(panelContent, /id="pathfinder_panel_header"/);
  assert.match(panelContent, /class="floating_panel_title">Pathfinder<\/span>/);
  assert.match(panelContent, /id="pathfinder_panel_close"/);

  // Verify all 5 popup buttons exist matching properties panel
  assert.match(panelContent, /id="popup_pathfinder_unite" title="Unite/);
  assert.match(panelContent, /id="popup_pathfinder_minus_front" title="Minus Front/);
  assert.match(panelContent, /id="popup_pathfinder_intersect" title="Intersect/);
  assert.match(panelContent, /id="popup_pathfinder_exclude" title="Exclude/);
  assert.match(panelContent, /id="popup_pathfinder_divide" title="Divide/);

  // Verify properties panel also still has the buttons
  assert.match(html, /id="btn_pathfinder_unite"/);
  assert.match(html, /id="btn_pathfinder_minus_front"/);
  assert.match(html, /id="btn_pathfinder_intersect"/);
  assert.match(html, /id="btn_pathfinder_exclude"/);
  assert.match(html, /id="btn_pathfinder_divide"/);
});
