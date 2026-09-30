import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorHtmlPath = path.resolve(__dirname, '../index.html');
const colorSystemPath = path.resolve(__dirname, '../js/visteras-color-system.js');

test('Appearance Colors: HTML markup tooltips indicate double-click to edit', () => {
  const html = fs.readFileSync(vectorHtmlPath, 'utf8');

  // Verify fillChip tooltip mentions double-click
  assert.match(
    html,
    /id="vcs_app_fill_chip"[^>]*title="Fill color \(double-click to edit\)"/,
    'fillChip tooltip should indicate double-click to edit'
  );

  // Verify strokeChip tooltip mentions double-click
  assert.match(
    html,
    /id="vcs_app_stroke_chip"[^>]*title="Stroke color \(double-click to edit\)"/,
    'strokeChip tooltip should indicate double-click to edit'
  );
});

test('Appearance Colors: single-clicking chip does not open swatches panel; double-clicking opens color picker', () => {
  const code = fs.readFileSync(colorSystemPath, 'utf8');

  // Verify handleChipClick has been removed and does not open swatches dock on chip click
  assert.equal(
    code.includes('handleChipClick'),
    false,
    'handleChipClick should be removed so single-clicking chips does not open swatches dock'
  );

  // Verify fillChip click only stops propagation and does not open dock/picker
  assert.match(
    code,
    /fillChip\.addEventListener\('click',\s*\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);\s*\}\);/,
    'fillChip single-click should only stop propagation'
  );

  // Verify fillChip dblclick sets active target and opens picker
  assert.match(
    code,
    /fillChip\.addEventListener\('dblclick',\s*\(e\)\s*=>\s*\{[\s\S]*?ctrl\.setActiveTarget\('fill'[\s\S]*?ctrl\.openPicker\('fill'\);[\s\S]*?\}\);/,
    'fillChip dblclick should open color picker popup'
  );

  // Verify strokeChip click only stops propagation
  assert.match(
    code,
    /strokeChip\.addEventListener\('click',\s*\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);\s*\}\);/,
    'strokeChip single-click should only stop propagation'
  );

  // Verify strokeChip dblclick sets active target and opens picker
  assert.match(
    code,
    /strokeChip\.addEventListener\('dblclick',\s*\(e\)\s*=>\s*\{[\s\S]*?ctrl\.setActiveTarget\('stroke'[\s\S]*?ctrl\.openPicker\('stroke'\);[\s\S]*?\}\);/,
    'strokeChip dblclick should open color picker popup'
  );

  // Verify word "Fill" (fillTarget) still opens Swatches flyout
  assert.match(
    code,
    /fillTarget\?\.addEventListener\('click',\s*\(e\)\s*=>\s*\{[\s\S]*?window\.__visterasDock\.open\([^)]*swatches[^)]*\);/,
    'fillTarget click should open Swatches flyout'
  );

  // Verify word "Stroke" (strokeTarget) still opens Stroke flyout
  assert.match(
    code,
    /strokeTarget\?\.addEventListener\('click',\s*\(e\)\s*=>\s*\{[\s\S]*?window\.__visterasDock\.open\('stroke'\);/,
    'strokeTarget click should open Stroke flyout'
  );
});
