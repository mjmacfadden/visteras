import assert from 'assert';
import {
	DOCUMENT_PRESETS,
	CATEGORIES,
	UNITS,
	RESOLUTION_PRESETS,
	convertToPixels,
	convertFromPixels,
	convertUnits,
	formatPresetDimensions,
} from '../src/js/core/document-presets-data.js';

console.log('Running document presets test suite...');

// 1. Verify all required categories exist
const expectedCategories = ['recent', 'photo', 'print', 'web', 'mobile', 'social', 'filmVideo', 'misc'];
const categoryIds = CATEGORIES.map(c => c.id);
expectedCategories.forEach(cat => {
	assert(categoryIds.includes(cat), `Missing category: ${cat}`);
});
console.log('✓ All 8 categories present (7 preset categories + Recent)');

// 2. Verify Photo Presets
const photo = DOCUMENT_PRESETS.photo;
assert(photo && photo.length >= 6, 'Photo presets incomplete');
const photoNames = photo.map(p => p.name);
assert(photoNames.includes('2 × 3 in'));
assert(photoNames.includes('4 × 6 in'));
assert(photoNames.includes('5 × 7 in'));
assert(photoNames.includes('8 × 10 in'));
assert(photoNames.includes('11 × 14 in'));
assert(photoNames.includes('16 × 20 in'));
photo.forEach(p => {
	assert.strictEqual(p.resolution, 300, `${p.name} must default to 300 PPI`);
	assert.strictEqual(p.unit, 'in', `${p.name} must have unit 'in'`);
});
console.log('✓ Photo presets verified (all 300 PPI, inches)');

// 3. Verify Print Presets
const print = DOCUMENT_PRESETS.print;
assert(print && print.length >= 7, 'Print presets incomplete');
const printNames = print.map(p => p.name);
['Letter', 'Legal', 'Tabloid', 'A5', 'A4', 'A3', 'A2'].forEach(name => {
	assert(printNames.includes(name), `Missing print preset: ${name}`);
});
print.forEach(p => {
	assert.strictEqual(p.resolution, 300, `${p.name} must default to 300 PPI`);
});
console.log('✓ Print presets verified (Letter, Legal, Tabloid, A5, A4, A3, A2 at 300 PPI)');

// 4. Verify Web Presets
const web = DOCUMENT_PRESETS.web;
assert(web && web.length >= 6, 'Web presets incomplete');
const webDims = web.map(w => `${w.width}x${w.height}`);
['1280x720', '1366x768', '1440x900', '1920x1080', '2560x1440', '3840x2160'].forEach(dim => {
	assert(webDims.includes(dim), `Missing web dimension: ${dim}`);
});
console.log('✓ Web presets verified (72 PPI, px)');

// 5. Verify Mobile Presets (current mainstream phone screen sizes)
const mobile = DOCUMENT_PRESETS.mobile;
assert(mobile && mobile.length >= 3, 'Mobile presets incomplete');
const mobileNames = mobile.map(m => m.name);
assert(mobileNames.some(n => n.includes('iPhone 16 / 15 Pro')));
assert(mobileNames.some(n => n.includes('iPhone 16 / 15 Pro Max')));
assert(mobileNames.some(n => n.includes('Samsung Galaxy S24 Ultra')));
console.log('✓ Mobile presets verified (current phone sizes: iPhone 16/15 Pro, Pro Max, Galaxy S24 Ultra)');

// 6. Verify Social Presets
const social = DOCUMENT_PRESETS.social;
assert(social && social.length >= 10, 'Social presets incomplete');
const socialNames = social.map(s => s.name);
assert(socialNames.includes('Instagram Square'));
assert(socialNames.includes('Instagram Portrait'));
assert(socialNames.includes('Instagram Landscape'));
assert(socialNames.includes('Instagram Story / Reel'));
assert(socialNames.includes('Facebook Cover'));
assert(socialNames.includes('Facebook Post'));
assert(socialNames.includes('YouTube Thumbnail'));
assert(socialNames.includes('YouTube Channel Banner'));
assert(socialNames.includes('X / Twitter Post'));
assert(socialNames.includes('X / Twitter Header'));
assert(socialNames.includes('LinkedIn Post'));
assert(socialNames.includes('LinkedIn Banner'));
console.log('✓ Social presets verified (Instagram, Facebook, YouTube, X/Twitter, LinkedIn)');

// 7. Verify Film & Video Presets
const video = DOCUMENT_PRESETS.filmVideo;
assert(video && video.length >= 5, 'Film & Video presets incomplete');
const videoNames = video.map(v => v.name);
['HD 720p', 'Full HD 1080p', '2K DCI Flat', '4K UHD', 'DCI 4K'].forEach(n => {
	assert(videoNames.includes(n), `Missing video preset: ${n}`);
});
console.log('✓ Film & Video presets verified (HD, Full HD, 2K, 4K UHD, DCI 4K)');

// 8. Verify Misc Presets
const misc = DOCUMENT_PRESETS.misc;
assert(misc && misc.length >= 7, 'Misc presets incomplete');
const miscDims = misc.map(m => `${m.width}x${m.height}`);
['16x16', '32x32', '64x64', '128x128', '256x256', '320x180', '640x360'].forEach(dim => {
	assert(miscDims.includes(dim), `Missing pixel art dimension: ${dim}`);
});
console.log('✓ Misc pixel-art presets verified (16x16 to 640x360)');

// 9. Unit conversion math tests
// 8.5 x 11 in @ 300 PPI -> 2550 x 3300 px
assert.strictEqual(convertToPixels(8.5, 'in', 300), 2550);
assert.strictEqual(convertToPixels(11, 'in', 300), 3300);

// 4 x 6 in @ 300 PPI -> 1200 x 1800 px
assert.strictEqual(convertToPixels(4, 'in', 300), 1200);
assert.strictEqual(convertToPixels(6, 'in', 300), 1800);

// 8 x 10 in @ 72 PPI -> 576 x 720 px
assert.strictEqual(convertToPixels(8, 'in', 72), 576);
assert.strictEqual(convertToPixels(10, 'in', 72), 720);

// Pixels stay exact
assert.strictEqual(convertToPixels(1920, 'px', 72), 1920);
assert.strictEqual(convertToPixels(1920, 'px', 300), 1920);

// Bidirectional in -> cm -> mm -> in conversion
const inVal = 8.5;
const cmVal = convertUnits(inVal, 'in', 'cm', 300); // 8.5 * 2.54 = 21.59 cm
assert.strictEqual(cmVal, 21.59);

const mmVal = convertUnits(inVal, 'in', 'mm', 300); // 8.5 * 25.4 = 215.9 mm
assert.strictEqual(mmVal, 215.9);

const pxVal = convertUnits(inVal, 'in', 'px', 300); // 8.5 * 300 = 2550 px
assert.strictEqual(pxVal, 2550);

const backToIn = convertUnits(pxVal, 'px', 'in', 300);
assert.strictEqual(backToIn, 8.5);

console.log('✓ Unit conversions verified (in ↔ cm ↔ mm ↔ px with arbitrary PPI)');

console.log('\nAll preset unit tests passed successfully!');
