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

test('Pathfinder Unite and Divide: support multi-selection (>= 2 objects) and sort bottom-to-top', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  // Verify executePathfinder allows selElems.length >= 2 for unite and divide
  assert.match(html, /if\s*\(operation\s*===\s*'unite'\s*\|\|\s*operation\s*===\s*'divide'\)\s*\{\s*if\s*\(selElems\.length\s*<\s*2\)/);

  // Verify other operations enforce exactly 2 objects
  assert.match(html, /if\s*\(selElems\.length\s*!==\s*2\)\s*\{\s*showStudioToast\('This Pathfinder operation requires exactly 2 selected objects\.'/);

  // Verify DOM document order sorting
  assert.match(html, /const\s+sortedElems\s*=\s*\[\.\.\.selElems\]\.sort/);
  assert.match(html, /Node\.DOCUMENT_POSITION_FOLLOWING/);

  // Verify iterative unite across paperItems
  assert.match(html, /let\s+united\s*=\s*paperItems\[0\];/);
  assert.match(html, /for\s*\(let\s+i\s*=\s*1;\s*i\s*<\s*paperItems\.length;\s*i\+\+\)\s*\{\s*united\s*=\s*united\.unite\(paperItems\[i\]\);/);

  // Verify divide uses partitionRegions
  assert.match(html, /const\s+regions\s*=\s*partitionRegions\(scope,\s*items\);/);
  assert.match(html, /const\s+hasOverlap\s*=\s*regions\.some\(r\s*=>\s*r\.members/);

  // Verify removal of all united or divided elements
  assert.match(html, /const\s+elemsToRemove\s*=\s*\(operation\s*===\s*'unite'\s*\|\|\s*operation\s*===\s*'divide'\)\s*\?\s*sortedElems\s*:\s*\[bottomElem,\s*topElem\];/);

  // Verify properties panel visibility shows for >= 2 objects
  assert.match(html, /pathfinderSec\.style\.display\s*=\s*\(selElems\.length\s*>=\s*2\s*&&\s*!isPathEdit\)\s*\?\s*'block'\s*:\s*'none';/);
});

test('Studio Toast: red toast system replaces standard browser alerts', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');
  const cssPath = path.resolve(__dirname, '../css/visteras-theme.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify showStudioToast is defined and mounted on window
  // Shared @visteras/ui toast, Vector default = red error toast for 3.5 s
  assert.match(html, /import \{ showToast \} from '\.\/lib\/visteras-ui\/toast\.js';/);
  assert.match(html, /const\s+showStudioToast\s*=\s*\(message,\s*type\s*=\s*'error',\s*duration\s*=\s*3500\)\s*=>\s*showToast\(message,\s*type,\s*duration\);/);
  assert.match(html, /window\.showStudioToast\s*=\s*showStudioToast;/);
  assert.match(html, /window\.showWarning\s*=\s*\(msg\)\s*=>\s*showStudioToast\(msg,\s*'error'\);/);

  // Verify window.alert redirection
  assert.match(html, /window\.alert\s*=\s*function\(msg\)\s*\{\s*showStudioToast\(String\(msg\),\s*'error'\);\s*\};/);

  // Verify executePathfinder uses showStudioToast instead of alert
  const execPathfinderBlock = html.match(/function\s+executePathfinder[\s\S]*?finally\s*\{[\s\S]*?\}/);
  assert.ok(execPathfinderBlock, 'executePathfinder block found');
  assert.equal(execPathfinderBlock[0].includes('alert('), false, 'executePathfinder must not contain raw alert() calls');
  assert.match(execPathfinderBlock[0], /showStudioToast\(/);

  // Verify Alertify CSS in visteras-theme.css matching Studio styling
  assert.match(css, /\.alertify-notifier/);
  assert.match(css, /\.ajs-message\.ajs-error\s*\{[^}]*background:\s*rgba\(217,\s*92,\s*92/);
  assert.match(css, /text-shadow:\s*-1px\s*-1px\s*0\s*rgba\(0,\s*0,\s*0,\s*0\.5\)/);
});

