import googleFontsCache from './libs/google-fonts-cache.json';
import { DEFAULT_FONTS as SHARED_DEFAULT_FONTS } from '@visteras/fonts';
//main config file

var config = {};

config.TRANSPARENCY = true;
config.TRANSPARENCY_TYPE = 'squares'; //squares, green, grey
config.LANG = 'en';
config.WIDTH = null;
config.HEIGHT = null;
config.visible_width = null;
config.visible_height = null;
config.COLOR = '#000000';
config.ALPHA = 255;
config.COLOR_BG = '#ffffff';
config.ALPHA_BG = 255;
config.ZOOM = 1;
config.SNAP = true;
// Third-party keys: window.__VP_KEYS__, then gitignored config.keys.local.js (see example).
// Never commit real keys in this file. GitHub Pages cannot keep client keys secret.
var _vpLocalKeys = (typeof window !== 'undefined' && window._vpLocalKeys)
	|| (typeof window !== 'undefined' && window.__VP_KEYS__)
	|| null;
config.pixabay_key = (typeof window !== 'undefined' && window.__VP_KEYS__ && window.__VP_KEYS__.pixabay_key)
	|| (_vpLocalKeys && _vpLocalKeys.pixabay_key)
	|| '';
config.pixabay_endpoint = (typeof window !== 'undefined' && window.__VP_KEYS__ && window.__VP_KEYS__.pixabay_endpoint)
	|| (_vpLocalKeys && _vpLocalKeys.pixabay_endpoint)
	|| 'https://us-central1-visteras-5a8b0.cloudfunctions.net/pixabaySearch';
config.safe_search_can_be_disabled = true;
config.google_webfonts_key = (typeof window !== 'undefined' && window.__VP_KEYS__ && window.__VP_KEYS__.google_webfonts_key)
	|| (_vpLocalKeys && _vpLocalKeys.google_webfonts_key)
	|| '';
config.layers = [];
config.layer = null;
config.vectors = [];
config.active_vector_id = null;
config.selected_layer_ids = []; // multi-select in Layers panel (primary remains config.layer)
config.layer_select_anchor_id = null; // Shift+click range anchor
var need_render = false;
Object.defineProperty(config, 'need_render', {
	get: function () {
		return need_render;
	},
	set: function (value) {
		need_render = value === true;
		if (need_render && window.Layers && typeof window.Layers.request_render === 'function') {
			window.Layers.request_render();
		}
	}
});
config.need_render_changed_params = false; // Set specifically when param change in layer details triggered render
config.mask_active = false; // True when the active layer's mask is the editing target
config._internal_clipboard = null; // {data_url, x, y, width, height} last copied selection/layer
config._clipboard_position = null;
config.mouse = {};
config.mouse_lock = null;
config.swatches = {
	default: [] // Only default used right now, object format for swatch swapping in future.
};
config.user_fonts = {};
config.guides_enabled = true;
config.guides = [];
config.ruler_active = false;
config.enable_autoresize_by_default = true;

//Screen-px margin around the document on the transform-controls overlay canvas,
//so selection/transform handles stay visible even when a layer extends past the canvas edge.
config.TRANSFORM_MARGIN = 300;

// Renderer selection: 'auto' | 'canvas2d' | 'webgl'
// 'auto' tries WebGL first, falls back to Canvas 2D
config.RENDERER = 'auto';

// Client-side background removal / Select Subject (ISNet via Transformers.js).
// ONE setting for model location: Hugging Face model id OR absolute base URL of a
// self-hosted mirror (e.g. Cloudflare R2). Weights are never shipped in the Pages tree.
// Examples:
//   'onnx-community/ISNet-ONNX'          (default — Hugging Face CDN)
//   'https://models.example.com/ISNet-ONNX'  (mirror root containing config.json + *.onnx)
config.BG_AUTO_MODEL_LOCATION = 'onnx-community/ISNet-ONNX';
// Pinned runtime CDN (must match apps/studio package.json / lockfile versions).
// jsDelivr /+esm rewrites bare `onnxruntime-web/webgpu` imports so module workers can load them.
config.BG_AUTO_TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';
config.BG_AUTO_ORT_VERSION = '1.31.0-dev.20260914-8d85527a0';
config.BG_AUTO_ORT_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';

//requires styles in reset.css
config.themes = [
	'dark',
	'light',
	'green',
];

//no-translate BEGIN
// Shared with Vector via @visteras/fonts — keep a single catalog (do not fork this list).
config.FONTS = [...SHARED_DEFAULT_FONTS];
//no-translate END

config.TOOLS = [
	{
		name: 'select',
		title: 'Move Tool',
		attributes: {
			auto_select: true,
			show_transform_controls: true,
		},
		on_update: 'on_update',
	},
	{
		name: 'selection',
		title: 'Rectangular Marquee Tool',
		on_update: 'on_params_update',
		attributes: {
			select_subject: {
				title: 'Select Subject',
				value: true,
			},
		},
		on_leave: 'on_leave',
		tool_group: {
			label: 'Selection Tools',
			hidden: false,
			items: [
				{
					shape: 'rect',
					title: 'Rectangular Marquee Tool',
					icon: 'selection',
				},
				{
					shape: 'ellipse',
					title: 'Elliptical Marquee Tool',
					icon: 'selection_ellipse',
				},
				{
					shape: 'lasso',
					title: 'Lasso Tool',
					icon: 'lasso',
				},
			],
		},
	},
	{
		name: 'brush',
		on_leave: 'on_leave',
		attributes: {
			preset: {
				value: 'classic-round',
				ui: 'brush_library',
				values: [
					'classic-round', 'classic-soft',
					'paint-basic', 'paint-heavy',
					'pencil-sketch', 'pencil-soft',
					'ink-fineliner', 'ink-brush',
					'airbrush-soft', 'airbrush-spray',
					'marker-chisel', 'marker-felt',
					'Classic', 'Paint', 'Pencil', 'Ink'
				],
			},
			size: 13,
			opacity: {
				value: 100,
				min: 1,
				max: 100,
				step: 1,
				slider: true,
			},
			hardness: {
				value: 100,
				min: 0,
				max: 100,
				step: 1,
				slider: true,
			},
			pressure: false,
		},
		tool_group: {
			label: 'Brush Tools',
			hidden: false,
			items: [
				{
					shape: 'brush',
					title: 'Brush Tool',
					icon: 'brush',
				},
				{
					shape: 'pencil',
					title: 'Pencil Tool',
					icon: 'pencil',
					tool: 'pencil',
				},
			],
		},
	},
	{
		name: 'pencil',
		visible: false,
		attributes: {
			size: 1,
			opacity: {
				value: 100,
				min: 1,
				max: 100,
				step: 1,
				slider: true,
			},
			pressure: false,
		},
	},
	{
		name: 'pick_color',
		attributes: {
			global: false,
		},
	},
	{
		name: 'erase',
		attributes: {
			size: 30,
			opacity: {
				value: 100,
				min: 1,
				max: 100,
				step: 1,
				slider: true,
			},
			hardness: {
				value: 100,
				min: 0,
				max: 100,
				step: 1,
				slider: true,
			},
			erase_to: {
				value: 'Auto',
				values: ['Auto', 'Transparent', 'Background Color'],
			},
			pressure: false,
		},
	},
	{
		name: 'magic_erase',
		title: 'Magic Eraser Tool',
		attributes: {
			power: 15,
			anti_aliasing: true,
			contiguous: false,
		},
	},
	{
		name: 'rectangle',
		title: 'Rectangle Tool [U]',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		tool_group: {
			label: 'Shape Tools',
			hidden: false,
			items: [
				{
					shape: 'rectangle',
					title: 'Rectangle Tool',
					icon: 'rectangle',
					tool: 'rectangle',
				},
				{
					shape: 'ellipse',
					title: 'Ellipse Tool',
					icon: 'ellipse',
					tool: 'ellipse',
				},
				{
					shape: 'polygon',
					title: 'Polygon Tool',
					icon: 'polygon',
					tool: 'polygon',
				},
				{
					shape: 'star',
					title: 'Star Tool',
					icon: 'star',
					tool: 'star',
				},
				{
					shape: 'custom_shape',
					title: 'Custom Shape Tool',
					icon: 'custom_shape',
					tool: 'custom_shape',
				},
			],
		},
		attributes: {
			mode: {
				title: 'Mode',
				value: 'Shape',
				values: ['Shape', 'Path'],
			},
			fill: '#cccccc',
			stroke: '#000000',
			stroke_width: {
				title: 'Stroke Width',
				value: 2,
				min: 0,
				max: 100,
				step: 1,
			},
			stroke_align: {
				title: 'Align',
				value: 'Center',
				values: ['Center', 'Inside', 'Outside'],
			},
			stroke_corners: {
				title: 'Corners',
				value: 'Right Angle',
				values: ['Right Angle', 'Rounded', 'Capped'],
			},
			radius: {
				title: 'Corner Radius',
				value: 0,
				min: 0,
				max: 500,
				step: 1,
			},
		},
	},
	{
		name: 'ellipse',
		title: 'Ellipse Tool',
		visible: false,
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		attributes: {
			mode: {
				title: 'Mode',
				value: 'Shape',
				values: ['Shape', 'Path'],
			},
			fill: '#cccccc',
			stroke: '#000000',
			stroke_width: {
				title: 'Stroke Width',
				value: 2,
				min: 0,
				max: 100,
				step: 1,
			},
			stroke_align: {
				title: 'Align',
				value: 'Center',
				values: ['Center', 'Inside', 'Outside'],
			},
			stroke_corners: {
				title: 'Corners',
				value: 'Right Angle',
				values: ['Right Angle', 'Rounded', 'Capped'],
			},
		},
	},
	{
		name: 'polygon',
		title: 'Polygon Tool',
		visible: false,
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		attributes: {
			sides: {
				title: 'Sides',
				value: 5,
				min: 3,
				max: 100,
				step: 1,
			},
			mode: {
				title: 'Mode',
				value: 'Shape',
				values: ['Shape', 'Path'],
			},
			fill: '#cccccc',
			stroke: '#000000',
			stroke_width: {
				title: 'Stroke Width',
				value: 2,
				min: 0,
				max: 100,
				step: 1,
			},
			stroke_align: {
				title: 'Align',
				value: 'Center',
				values: ['Center', 'Inside', 'Outside'],
			},
			stroke_corners: {
				title: 'Corners',
				value: 'Right Angle',
				values: ['Right Angle', 'Rounded', 'Capped'],
			},
		},
	},
	{
		name: 'star',
		title: 'Star Tool',
		visible: false,
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		attributes: {
			corners: {
				title: 'Points',
				value: 5,
				min: 3,
				max: 100,
				step: 1,
			},
			inner_radius: {
				title: 'Inner Radius (%)',
				value: 40,
				min: 5,
				max: 95,
				step: 1,
			},
			mode: {
				title: 'Mode',
				value: 'Shape',
				values: ['Shape', 'Path'],
			},
			fill: '#cccccc',
			stroke: '#000000',
			stroke_width: {
				title: 'Stroke Width',
				value: 2,
				min: 0,
				max: 100,
				step: 1,
			},
			stroke_align: {
				title: 'Align',
				value: 'Center',
				values: ['Center', 'Inside', 'Outside'],
			},
			stroke_corners: {
				title: 'Corners',
				value: 'Right Angle',
				values: ['Right Angle', 'Rounded', 'Capped'],
			},
		},
	},
	{
		name: 'custom_shape',
		title: 'Custom Shape Tool',
		visible: false,
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		attributes: {
			shape: {
				title: 'Shape',
				value: 'Heart',
				values: [
					'Heart',
					'Triangle',
					'Right Triangle',
					'Arrow',
					'Plus',
					'Hexagon',
					'Pentagon',
					'Diamond',
					'Trapezoid',
					'Parallelogram',
					'Speech Bubble',
					'Moon',
					'Water Drop',
					'Gear'
				],
			},
			mode: {
				title: 'Mode',
				value: 'Shape',
				values: ['Shape', 'Path'],
			},
			fill: '#cccccc',
			stroke: '#000000',
			stroke_width: {
				title: 'Stroke Width',
				value: 2,
				min: 0,
				max: 100,
				step: 1,
			},
			stroke_align: {
				title: 'Align',
				value: 'Center',
				values: ['Center', 'Inside', 'Outside'],
			},
			stroke_corners: {
				title: 'Corners',
				value: 'Right Angle',
				values: ['Right Angle', 'Rounded', 'Capped'],
			},
		},
	},
	{
		name: 'pen',
		title: 'Pen Tool (P)',
		on_activate: 'on_activate',
		on_leave: 'on_leave',
		on_update: 'on_params_update',
		attributes: {
			mode: {
				title: 'Mode',
				value: 'Shape',
				values: ['Shape', 'Path'],
			},
			fill: '#cccccc',
			stroke: '#000000',
			stroke_width: {
				title: 'Stroke Width',
				value: 2,
				min: 1,
				max: 100,
				step: 1,
			},
			stroke_align: {
				title: 'Align',
				value: 'Center',
				values: ['Center', 'Inside', 'Outside'],
			},
			stroke_corners: {
				title: 'Corners',
				value: 'Right Angle',
				values: ['Right Angle', 'Rounded', 'Capped'],
			},
			rubber_band: true,
			auto_add_delete: true,
		},
	},
	{
		name: 'direct_select',
		title: 'Direct Selection Tool (A)',
		on_activate: 'on_activate',
		on_leave: 'on_leave',
		attributes: {},
	},
	{
		name: 'media',
		title: 'Search Images',
		on_activate: 'on_activate',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'camera',
		title: 'Camera',
		on_activate: 'on_activate',
		attributes: {},
	},
	{
		name: 'triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'right_triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'romb',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'parallelogram',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'trapezoid',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'plus',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'pentagon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'hexagon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'star',
		visible: false,
		attributes: {
			border_size: 4,
			corners: 5,
			inner_radius: 40,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'heart',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'cylinder',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'human',
		visible: false,
		attributes: {
			border_size: 4,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'tear',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'cog',
		visible: false,
		attributes: {
			fill_color: '#555555',
		},
	},
	{
		name: 'bezier_curve',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'moon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'callout',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'text',
		on_update: 'on_params_update',
		on_activate: 'on_activate',
		on_leave: 'on_leave',
		attributes: {
			font: {
				value: 'Roboto',
				values() {
					const user_font_names = Object.keys(config.user_fonts);
					const systemFonts = (typeof window !== 'undefined' && window.FontManager
						&& typeof window.FontManager.getCachedSystemFonts === 'function')
						? window.FontManager.getCachedSystemFonts()
						: [];
					return ['[Add Font...]', ...Array.from(new Set([...config.FONTS, ...user_font_names, ...systemFonts].sort()))];
				}
			},
			size: {
				value: 38,
				min: 1,
				max: 999,
				step: 1,
					inputStep: 0.01,
					inputType: 'text'
			},
			weight: {
				title: 'Weight',
				value: 'Regular (400)',
				values() {
					const textTool = (config.TOOLS || []).find((t) => t.name === 'text');
					const family = textTool && textTool.attributes && textTool.attributes.font
						? (textTool.attributes.font.value || 'Roboto')
						: 'Roboto';
					if (typeof window !== 'undefined' && window.FontManager
						&& typeof window.FontManager.getFontWeightList === 'function') {
						return window.FontManager.getFontWeightList(family, googleFontsCache);
					}
					// Fallback before FontManager init: Google cache + defaults
					const variants = [];
					const userFont = config.user_fonts && config.user_fonts[family];
					if (userFont && Array.isArray(userFont.variants)) {
						for (const v of userFont.variants) {
							if (v && !variants.includes(v)) variants.push(v);
						}
					}
					if (Array.isArray(googleFontsCache)) {
						const entry = googleFontsCache.find((f) => f && f.family === family);
						if (entry && Array.isArray(entry.variants)) {
							for (const v of entry.variants) {
								if (!v || /italic/i.test(String(v))) continue;
								const map = {
									'regular': 'Regular (400)', '400': 'Regular (400)',
									'100': 'Thin (100)', '200': 'ExtraLight (200)', '300': 'Light (300)',
									'500': 'Medium (500)', '600': 'SemiBold (600)',
									'700': 'Bold (700)', '800': 'ExtraBold (800)', '900': 'Black (900)',
									'thin': 'Thin (100)', 'light': 'Light (300)', 'medium': 'Medium (500)',
									'semibold': 'SemiBold (600)', 'bold': 'Bold (700)', 'black': 'Black (900)',
								};
								const key = String(v).toLowerCase();
								const label = map[key] || String(v);
								if (!variants.includes(label)) variants.push(label);
							}
						}
					}
					if (variants.length === 0) return ['Regular (400)', 'Bold (700)'];
					return variants;
				}
			},
			bold: {
				value: false,
				icon: `bold.svg`
			},
			italic: {
				value: false,
				icon: `italic.svg`
			},
			underline: {
				value: false,
				icon: `underline.svg`
			},
			strikethrough: {
				value: false,
				icon: `strikethrough.svg`
			},
			fill: '#000000',
			halign: {
				type: 'button_group',
				value: 'Left',
				values: ['Left', 'Center', 'Right', 'Justify'],
				icons: {
					Left: 'align-left.svg',
					Center: 'align-center.svg',
					Right: 'align-right.svg',
					Justify: 'align-justify.svg',
				}
			},
			kerning: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			},
			leading: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			},
			boundary: {
				title: 'Mode',
				value: 'Point',
				values: ['Point', 'Paragraph'],
			}
		},
	},
	{
		name: 'gradient',
		title: 'Gradient Tool',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		attributes: {
			style: {
				title: 'Style',
				value: 'Linear',
				values: ['Linear', 'Radial'],
			},
			color_1: '#000000',
			color_2: 'none',
			alpha_1: {
				title: 'Opacity 1',
				value: 100,
				min: 0,
				max: 100,
				step: 1,
				slider: true,
			},
			alpha_2: {
				title: 'Opacity 2',
				value: 100,
				min: 0,
				max: 100,
				step: 1,
				slider: true,
			},
			reverse: false,
			radial_power: {
				title: 'Radius',
				value: 50,
				min: 0,
				max: 99,
				step: 1,
				slider: true,
			},
		},
		// Paint Bucket nested under Gradient (Photoshop-style). Gradient is the
		// default face of the slot; Shift+G cycles. fill stays registered but hidden.
		tool_group: {
			label: 'Fill Tools',
			hidden: false,
			items: [
				{
					shape: 'gradient',
					title: 'Gradient Tool',
					icon: 'gradient',
				},
				{
					shape: 'fill',
					title: 'Paint Bucket Tool',
					icon: 'fill',
					tool: 'fill',
				},
			],
		},
	},
	{
		name: 'fill',
		title: 'Paint Bucket Tool',
		visible: false,
		attributes: {
			power: 5,
			anti_aliasing: false,
			contiguous: false,
		},
	},
	{
		name: 'clone',
		on_leave: 'on_leave',
		attributes: {
			size: 30,
			anti_aliasing: true,
			source_layer: {
				value: 'All Layers',
				values: ['All Layers', 'Current', 'Previous'],
			},
		},
	},
	{
		name: 'spot_heal',
		title: 'Spot Healing Brush',
		on_leave: 'on_leave',
		attributes: {
			size: 30,
			hardness: {
				value: 50,
				min: 0,
				max: 100,
				step: 1,
				slider: true,
			},
			strength: {
				value: 100,
				min: 1,
				max: 100,
				step: 1,
				slider: true,
			},
		},
	},
	{
		name: 'crop',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			aspect: {
				value: 'Free',
				values: ['Free', 'Original', '1:1', '4:5', '5:4', '16:9', '9:16', '3:2', '2:3', 'Custom'],
			},
			ratio_w: {
				title: 'W',
				value: 1,
				min: 1,
				visible: false,
			},
			ratio_h: {
				title: 'H',
				value: 1,
				min: 1,
				visible: false,
			},
			guides: {
				value: 'Rule of Thirds',
				values: ['Rule of Thirds', 'Grid', 'Diagonal', 'None'],
			},
			straighten: {
				value: false,
				icon: 'rotate.svg',
			},
			angle: {
				value: 0,
				min: -45,
				max: 45,
				step: 0.1,
			},
			commit_crop: true,
		},
	},
	{
		name: 'blur',
		attributes: {
			size: 30,
			strength: 1,
		},
	},
	{
		name: 'sharpen',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'desaturate',
		attributes: {
			size: 50,
			anti_aliasing: true,
		},
	},
	{
		name: 'bulge_pinch',
		title: 'Bulge/Pinch Tool',
		attributes: {
			radius: 80,
			power: 50,
			bulge: true,
		},
	},
	{
		name: 'animation',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			play: false,
			delay: 400,
		},
	},
	{
		name: 'pan',
		title: 'Pan Tool',
		attributes: {},
	},
];

//link to active tool
config.TOOL = config.TOOLS[2];
	
export default config;
