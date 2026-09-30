import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorHtmlPath = path.resolve(__dirname, '../index.html');

test('Window Menu: Pathfinder options moved from Object menu to Window menu', () => {
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

  // Verify Window menu exists
  const windowMenuMatch = html.match(/<div class="menu_entry" id="menu_window">([\s\S]*?)<\/div>\s*<!-- Help Menu -->/);
  assert.ok(windowMenuMatch, 'Window menu section found before Help menu');
  const windowMenuContent = windowMenuMatch[1];

  // Verify Window menu contains all Pathfinder actions
  assert.match(windowMenuContent, /<div class="menu_entry_title">Window<\/div>/);
  assert.match(windowMenuContent, /id="action_pathfinder_unite">Pathfinder: Unite<\/div>/);
  assert.match(windowMenuContent, /id="action_pathfinder_minus_front">Pathfinder: Minus Front<\/div>/);
  assert.match(windowMenuContent, /id="action_pathfinder_intersect">Pathfinder: Intersect<\/div>/);
  assert.match(windowMenuContent, /id="action_pathfinder_exclude">Pathfinder: Exclude<\/div>/);
  assert.match(windowMenuContent, /id="action_pathfinder_divide">Pathfinder: Divide<\/div>/);
});
