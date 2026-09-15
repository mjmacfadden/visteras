/**
 * Document Presets and Measurement Units for New Document Modal
 * Centralized data architecture for all preset categories:
 * Photo, Print, Web, Mobile, Social, Film & Video, Misc, and Recent.
 */

export const DOCUMENT_PRESETS = {
	photo: [
		{
			id: 'photo_2x3',
			name: '2 × 3 in',
			width: 2,
			height: 3,
			unit: 'in',
			resolution: 300,
			category: 'photo',
			description: 'Standard Small Print',
		},
		{
			id: 'photo_4x6',
			name: '4 × 6 in',
			width: 4,
			height: 6,
			unit: 'in',
			resolution: 300,
			category: 'photo',
			description: 'Standard Postcard / Photo',
		},
		{
			id: 'photo_5x7',
			name: '5 × 7 in',
			width: 5,
			height: 7,
			unit: 'in',
			resolution: 300,
			category: 'photo',
			description: 'Framed Photo / Greeting',
		},
		{
			id: 'photo_8x10',
			name: '8 × 10 in',
			width: 8,
			height: 10,
			unit: 'in',
			resolution: 300,
			category: 'photo',
			description: 'Portrait Photo Print',
		},
		{
			id: 'photo_11x14',
			name: '11 × 14 in',
			width: 11,
			height: 14,
			unit: 'in',
			resolution: 300,
			category: 'photo',
			description: 'Large Wall Print',
		},
		{
			id: 'photo_16x20',
			name: '16 × 20 in',
			width: 16,
			height: 20,
			unit: 'in',
			resolution: 300,
			category: 'photo',
			description: 'Poster / Exhibition Print',
		},
	],

	print: [
		{
			id: 'print_letter',
			name: 'Letter',
			width: 8.5,
			height: 11,
			unit: 'in',
			resolution: 300,
			category: 'print',
			description: '8.5 × 11 in (US Standard)',
		},
		{
			id: 'print_legal',
			name: 'Legal',
			width: 8.5,
			height: 14,
			unit: 'in',
			resolution: 300,
			category: 'print',
			description: '8.5 × 14 in (US Legal)',
		},
		{
			id: 'print_tabloid',
			name: 'Tabloid',
			width: 11,
			height: 17,
			unit: 'in',
			resolution: 300,
			category: 'print',
			description: '11 × 17 in (Ledger)',
		},
		{
			id: 'print_a5',
			name: 'A5',
			width: 148,
			height: 210,
			unit: 'mm',
			resolution: 300,
			category: 'print',
			description: '148 × 210 mm (ISO)',
		},
		{
			id: 'print_a4',
			name: 'A4',
			width: 210,
			height: 297,
			unit: 'mm',
			resolution: 300,
			category: 'print',
			description: '210 × 297 mm (ISO Standard)',
		},
		{
			id: 'print_a3',
			name: 'A3',
			width: 297,
			height: 420,
			unit: 'mm',
			resolution: 300,
			category: 'print',
			description: '297 × 420 mm (ISO Double)',
		},
		{
			id: 'print_a2',
			name: 'A2',
			width: 420,
			height: 594,
			unit: 'mm',
			resolution: 300,
			category: 'print',
			description: '420 × 594 mm (ISO Poster)',
		},
	],

	web: [
		{
			id: 'web_1280x720',
			name: 'Web Small',
			width: 1280,
			height: 720,
			unit: 'px',
			resolution: 72,
			category: 'web',
			description: '1280 × 720 (HD 16:9)',
		},
		{
			id: 'web_1366x768',
			name: 'Web Laptop',
			width: 1366,
			height: 768,
			unit: 'px',
			resolution: 72,
			category: 'web',
			description: '1366 × 768 (Standard Laptop)',
		},
		{
			id: 'web_1440x900',
			name: 'Web Medium',
			width: 1440,
			height: 900,
			unit: 'px',
			resolution: 72,
			category: 'web',
			description: '1440 × 900 (16:10 Display)',
		},
		{
			id: 'web_1920x1080',
			name: 'Web Large (Full HD)',
			width: 1920,
			height: 1080,
			unit: 'px',
			resolution: 72,
			category: 'web',
			description: '1920 × 1080 (1080p Standard)',
		},
		{
			id: 'web_2560x1440',
			name: 'Web 2K (QHD)',
			width: 2560,
			height: 1440,
			unit: 'px',
			resolution: 72,
			category: 'web',
			description: '2560 × 1440 (1440p Monitor)',
		},
		{
			id: 'web_3840x2160',
			name: 'Web 4K (UHD)',
			width: 3840,
			height: 2160,
			unit: 'px',
			resolution: 72,
			category: 'web',
			description: '3840 × 2160 (4K Display)',
		},
	],

	mobile: [
		{
			id: 'mobile_iphone_16_pro',
			name: 'iPhone 16 / 15 Pro',
			width: 1179,
			height: 2556,
			unit: 'px',
			resolution: 72,
			category: 'mobile',
			description: '1179 × 2556 (19.5:9 Screen)',
		},
		{
			id: 'mobile_iphone_16_promax',
			name: 'iPhone 16 / 15 Pro Max',
			width: 1290,
			height: 2796,
			unit: 'px',
			resolution: 72,
			category: 'mobile',
			description: '1290 × 2796 (19.5:9 Screen)',
		},
		{
			id: 'mobile_galaxy_s24_ultra',
			name: 'Samsung Galaxy S24 Ultra',
			width: 1440,
			height: 3120,
			unit: 'px',
			resolution: 72,
			category: 'mobile',
			description: '1440 × 3120 (19.5:9 Screen)',
		},
		{
			id: 'mobile_pixel_9_pro',
			name: 'Google Pixel 9 Pro',
			width: 1280,
			height: 2856,
			unit: 'px',
			resolution: 72,
			category: 'mobile',
			description: '1280 × 2856 (20:9 Screen)',
		},
	],

	social: [
		{
			id: 'social_ig_square',
			name: 'Instagram Square',
			width: 1080,
			height: 1080,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1080 × 1080 (1:1 Feed Post)',
		},
		{
			id: 'social_ig_portrait',
			name: 'Instagram Portrait',
			width: 1080,
			height: 1350,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1080 × 1350 (4:5 Feed Post)',
		},
		{
			id: 'social_ig_landscape',
			name: 'Instagram Landscape',
			width: 1080,
			height: 566,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1080 × 566 (1.91:1 Post)',
		},
		{
			id: 'social_ig_story',
			name: 'Instagram Story / Reel',
			width: 1080,
			height: 1920,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1080 × 1920 (9:16 Fullscreen)',
		},
		{
			id: 'social_fb_cover',
			name: 'Facebook Cover',
			width: 1640,
			height: 856,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1640 × 856 (Header Banner)',
		},
		{
			id: 'social_fb_post',
			name: 'Facebook Post',
			width: 1200,
			height: 630,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1200 × 630 (Shared Image)',
		},
		{
			id: 'social_yt_thumb',
			name: 'YouTube Thumbnail',
			width: 1280,
			height: 720,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1280 × 720 (16:9 Video Cover)',
		},
		{
			id: 'social_yt_banner',
			name: 'YouTube Channel Banner',
			width: 2560,
			height: 1440,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '2560 × 1440 (Channel Art)',
		},
		{
			id: 'social_x_post',
			name: 'X / Twitter Post',
			width: 1600,
			height: 900,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1600 × 900 (16:9 In-stream)',
		},
		{
			id: 'social_x_header',
			name: 'X / Twitter Header',
			width: 1500,
			height: 500,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1500 × 500 (3:1 Banner)',
		},
		{
			id: 'social_li_post',
			name: 'LinkedIn Post',
			width: 1200,
			height: 627,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1200 × 627 (1.91:1 Feed Post)',
		},
		{
			id: 'social_li_cover',
			name: 'LinkedIn Banner',
			width: 1584,
			height: 396,
			unit: 'px',
			resolution: 72,
			category: 'social',
			description: '1584 × 396 (4:1 Profile Cover)',
		},
	],

	filmVideo: [
		{
			id: 'video_hd_720',
			name: 'HD 720p',
			width: 1280,
			height: 720,
			unit: 'px',
			resolution: 72,
			category: 'filmVideo',
			description: '1280 × 720 (16:9 Standard HD)',
		},
		{
			id: 'video_full_hd_1080',
			name: 'Full HD 1080p',
			width: 1920,
			height: 1080,
			unit: 'px',
			resolution: 72,
			category: 'filmVideo',
			description: '1920 × 1080 (16:9 Full HD)',
		},
		{
			id: 'video_2k_dci',
			name: '2K DCI Flat',
			width: 2048,
			height: 1080,
			unit: 'px',
			resolution: 72,
			category: 'filmVideo',
			description: '2048 × 1080 (1.89:1 Cinema)',
		},
		{
			id: 'video_4k_uhd',
			name: '4K UHD',
			width: 3840,
			height: 2160,
			unit: 'px',
			resolution: 72,
			category: 'filmVideo',
			description: '3840 × 2160 (16:9 Ultra HD)',
		},
		{
			id: 'video_4k_dci',
			name: 'DCI 4K',
			width: 4096,
			height: 2160,
			unit: 'px',
			resolution: 72,
			category: 'filmVideo',
			description: '4096 × 2160 (1.89:1 Cinema 4K)',
		},
	],

	misc: [
		{
			id: 'misc_pixel_16',
			name: 'Pixel Art 16',
			width: 16,
			height: 16,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '16 × 16 px (Sprite / Icon)',
		},
		{
			id: 'misc_pixel_32',
			name: 'Pixel Art 32',
			width: 32,
			height: 32,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '32 × 32 px (Retro Sprite)',
		},
		{
			id: 'misc_pixel_64',
			name: 'Pixel Art 64',
			width: 64,
			height: 64,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '64 × 64 px (Detailed Sprite)',
		},
		{
			id: 'misc_pixel_128',
			name: 'Pixel Art 128',
			width: 128,
			height: 128,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '128 × 128 px (Large Character)',
		},
		{
			id: 'misc_pixel_256',
			name: 'Pixel Art 256',
			width: 256,
			height: 256,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '256 × 256 px (Scene / Tilemap)',
		},
		{
			id: 'misc_pixel_320x180',
			name: 'Pixel Widescreen (180p)',
			width: 320,
			height: 180,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '320 × 180 (16:9 Retro Display)',
		},
		{
			id: 'misc_pixel_640x360',
			name: 'Pixel Widescreen (360p)',
			width: 640,
			height: 360,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '640 × 360 (16:9 Lo-Fi Screen)',
		},
		{
			id: 'misc_custom_1920',
			name: 'Custom Canvas',
			width: 1920,
			height: 1080,
			unit: 'px',
			resolution: 72,
			category: 'misc',
			description: '1920 × 1080 (Standard HD)',
		},
	],
};

export const CATEGORIES = [
	{ id: 'recent', label: 'Recent' },
	{ id: 'photo', label: 'Photo' },
	{ id: 'print', label: 'Print' },
	{ id: 'web', label: 'Web' },
	{ id: 'mobile', label: 'Mobile' },
	{ id: 'social', label: 'Social' },
	{ id: 'filmVideo', label: 'Film & Video' },
	{ id: 'misc', label: 'Misc' },
];

export const RESOLUTION_PRESETS = [72, 96, 150, 300];

export const UNITS = [
	{ id: 'px', label: 'Pixels (px)' },
	{ id: 'in', label: 'Inches (in)' },
	{ id: 'cm', label: 'Centimeters (cm)' },
	{ id: 'mm', label: 'Millimeters (mm)' },
];

/**
 * Converts a measurement value in a given unit to pixels.
 */
export function convertToPixels(val, unit, ppi = 72) {
	const num = parseFloat(val) || 0;
	const res = parseFloat(ppi) || 72;
	switch (unit) {
		case 'in':
			return num * res;
		case 'cm':
			return (num / 2.54) * res;
		case 'mm':
			return (num / 25.4) * res;
		case 'px':
		default:
			return num;
	}
}

/**
 * Converts a pixel dimension to the target unit.
 */
export function convertFromPixels(pixels, targetUnit, ppi = 72) {
	const px = parseFloat(pixels) || 0;
	const res = parseFloat(ppi) || 72;
	switch (targetUnit) {
		case 'in':
			return parseFloat((px / res).toFixed(2));
		case 'cm':
			return parseFloat(((px / res) * 2.54).toFixed(2));
		case 'mm':
			return parseFloat(((px / res) * 25.4).toFixed(1));
		case 'px':
		default:
			return Math.round(px);
	}
}

/**
 * Converts a value directly from sourceUnit to targetUnit.
 */
export function convertUnits(val, sourceUnit, targetUnit, ppi = 72) {
	if (sourceUnit === targetUnit) return parseFloat(val) || 0;
	const pixels = convertToPixels(val, sourceUnit, ppi);
	return convertFromPixels(pixels, targetUnit, ppi);
}

/**
 * Formats a preset dimension summary string (e.g. "8.5 × 11 in @ 300 ppi").
 */
export function formatPresetDimensions(preset) {
	if (!preset) return '';
	const unitStr = preset.unit || 'px';
	return `${preset.width} × ${preset.height} ${unitStr} @ ${preset.resolution || 72} ppi`;
}
