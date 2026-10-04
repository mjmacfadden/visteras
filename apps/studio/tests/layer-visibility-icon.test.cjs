const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');

test('Layer visibility icons: view-off.svg matches Vector eyeball off icon geometry', () => {
	const offIconPath = path.join(rootDir, 'apps/studio/images/icons/view-off.svg');
	assert.ok(fs.existsSync(offIconPath), 'view-off.svg must exist in apps/studio/images/icons/');

	const content = fs.readFileSync(offIconPath, 'utf8');
	assert.match(content, /d="M2 12s3\.5-7 10-7 10 7 10 7-3\.5 7-10 7S2 12 2 12Z"/, 'must have Vector eye outline');
	assert.match(content, /<circle\s+cx="12"\s+cy="12"\s+r="3"\s*\/>/, 'must have Vector pupil circle');
	assert.match(content, /d="m3 3 18 18"/, 'must have diagonal slash across the eye');
});

test('Layer visibility icons: view.svg matches Vector open eye icon geometry', () => {
	const onIconPath = path.join(rootDir, 'apps/studio/images/icons/view.svg');
	assert.ok(fs.existsSync(onIconPath), 'view.svg must exist in apps/studio/images/icons/');

	const content = fs.readFileSync(onIconPath, 'utf8');
	assert.match(content, /d="M2 12s3\.5-7 10-7 10 7 10 7-3\.5 7-10 7S2 12 2 12Z"/, 'must have Vector eye outline');
	assert.match(content, /<circle\s+cx="12"\s+cy="12"\s+r="3"\s*\/>/, 'must have Vector pupil circle');
	assert.doesNotMatch(content, /m3 3 18 18/, 'open eye must not have diagonal slash');
});

test('Layer visibility icons: layout.css shows view-off.svg on hidden layers instead of opacity 0', () => {
	const cssPath = path.join(rootDir, 'apps/studio/src/css/layout.css');
	const css = fs.readFileSync(cssPath, 'utf8');

	// Base .layers_list .visibility should use view-off.svg and have visible opacity (> 0)
	const baseVisibilityMatch = css.match(/\.layers_list \.visibility\s*\{([\s\S]*?)\}/);
	assert.ok(baseVisibilityMatch, '.layers_list .visibility rule must exist');
	const baseRules = baseVisibilityMatch[1];
	assert.match(baseRules, /opacity:\s*0\.[3-9]/, '.layers_list .visibility must be visible (not opacity: 0)');

	// Pseudo element after should use view-off.svg by default
	const afterMatch = css.match(/\.layers_list \.visibility:after\s*\{([\s\S]*?)\}/);
	assert.ok(afterMatch, '.layers_list .visibility:after rule must exist');
	assert.match(afterMatch[1], /view-off\.svg/, '.layers_list .visibility:after must reference view-off.svg');

	// Visible state overrides with view.svg
	const visibleAfterMatch = css.match(/\.layers_list \.visibility\.visible:after\s*\{([\s\S]*?)\}/);
	assert.ok(visibleAfterMatch, '.layers_list .visibility.visible:after rule must exist');
	assert.match(visibleAfterMatch[1], /view\.svg/, '.layers_list .visibility.visible:after must reference view.svg');
});
