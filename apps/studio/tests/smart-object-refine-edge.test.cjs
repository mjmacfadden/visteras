const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');

const rootDir = path.resolve(__dirname, '../../..');

test('refine-edge: source file imports renderSmart and Mask_class', () => {
	const refineEdgeSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/tools/refine_edge.js'), 'utf8');

	assert.ok(refineEdgeSource.includes("import Mask_class from './../mask/mask.js'"), 'must import Mask_class');
	assert.ok(refineEdgeSource.includes("import { renderSmart } from './../../libs/smart-effects.js'"), 'must import renderSmart');
});

test('refine-edge: open() sets up _imgCanvas and selection mask aligned at (0, 0) for smart objects with non-zero position and rotation', async () => {
	const refineEdgeSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/tools/refine_edge.js'), 'utf8');

	const mockSmartBitmap = createCanvas(200, 150);
	const sCtx = mockSmartBitmap.getContext('2d');
	sCtx.fillStyle = '#ff0000';
	sCtx.fillRect(0, 0, 200, 150);

	const layer = {
		id: 10,
		type: 'smart',
		name: 'Transformed Smart Object',
		smart_source_id: 'src-wolf',
		x: 350,
		y: 220,
		width: 200,
		height: 150,
		rotate: 45,
		mask: null,
	};

	const drawnImages = [];
	const createdCanvases = [];

	function createMockCanvas(w, h) {
		const c = createCanvas(w || 1, h || 1);
		const origGetContext = c.getContext.bind(c);
		c.getContext = function (type, options) {
			const ctx = origGetContext(type, options);
			const origDrawImage = ctx.drawImage.bind(ctx);
			ctx.drawImage = function (...args) {
				drawnImages.push({
					targetWidth: c.width,
					targetHeight: c.height,
					image: args[0],
					dx: args[1],
					dy: args[2],
					dw: args[3],
					dh: args[4]
				});
				return origDrawImage(...args);
			};
			return ctx;
		};
		createdCanvases.push(c);
		return c;
	}

	const mockSelectionCanvas = createCanvas(800, 600);
	const selCtx = mockSelectionCanvas.getContext('2d');
	selCtx.fillStyle = '#ffffff';
	selCtx.fillRect(350, 220, 200, 150);

	const config = {
		WIDTH: 800,
		HEIGHT: 600,
		layer,
		smart_sources: {
			'src-wolf': {
				link: mockSmartBitmap
			}
		}
	};

	const mockApp = {
		Layers: {
			get_layer: () => layer,
			Base_selection: {
				has_selection: true,
				mask_canvas: mockSelectionCanvas
			}
		},
		Actions: {
			Update_layer_mask_image_action: class {},
			Add_layer_mask_action: class {},
			Update_layer_image_action: class {},
			Insert_layer_action: class {},
			Reset_selection_action: class {},
			Bundle_action: class {}
		},
		State: {
			do_action: async () => ({ status: 'ok' })
		}
	};

	let renderedSmartLayer = null;
	const mockRenderSmart = (l) => {
		renderedSmartLayer = l;
		return config.smart_sources[l.smart_source_id].link;
	};

	class MockMaskClass {
		create_mask_from_selection(l, reveal) {
			const c = createMockCanvas(l.width, l.height);
			const ctx = c.getContext('2d');
			ctx.fillStyle = reveal ? '#ffffff' : '#000000';
			ctx.fillRect(0, 0, l.width, l.height);
			return {
				link: c,
				x: l.x,
				y: l.y,
				width: l.width,
				height: l.height,
				enabled: true,
				linked: true
			};
		}
	}

	const context = vm.createContext({
		app: mockApp,
		config,
		alertify: { error: () => {}, warning: () => {}, success: () => {} },
		Dialog_class: class {},
		Base_layers_class: class {},
		renderSmart: mockRenderSmart,
		Mask_class: MockMaskClass,
		document: {
			createElement: (tag) => {
				if (tag === 'canvas') return createMockCanvas(1, 1);
				return { addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } };
			}
		},
		window: {
			addEventListener: () => {},
			removeEventListener: () => {}
		},
		console,
		Object,
		Math,
		Error,
		Uint8ClampedArray,
		ImageData: globalThis.ImageData || class ImageData {
			constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
		},
		refineStrokeMatting: () => new Uint8ClampedArray(10),
		applyFeather: (m) => m,
		applyContrast: (m) => m,
		applyShiftEdge: (m) => m,
		applyDecontaminateColors: () => new Uint8ClampedArray(10),
		VIEW_MODES: [
			{ id: 'on_black', name: 'On Black (B)' },
			{ id: 'on_white', name: 'On White (W)' },
			{ id: 'overlay', name: 'Overlay (V)' },
			{ id: 'black_and_white', name: 'Black & White (K)' },
			{ id: 'onion_skin', name: 'Onion Skin (O)' },
		],
		escapeHtml: (s) => s,
		BRUSH_SIZE_STEPS: [40],
		BRUSH_HARDNESS_STEPS: [100],
		get_next_step: () => 40
	});

	// Extract Tools_refineEdge_class body
	const classMatch = refineEdgeSource.match(/class Tools_refineEdge_class\s*\{[\s\S]*?\n\}/);
	assert.ok(classMatch, 'Tools_refineEdge_class must be extractable');

	// Replace module-level imports with sandbox references
	const classCode = classMatch[0] + '\nglobalThis.Tools_refineEdge_class = Tools_refineEdge_class;';
	vm.runInContext(classCode, context);

	const RefineEdge = new context.Tools_refineEdge_class();
	RefineEdge.POP = {
		show: (opts) => {
			// Simulate on_load callback
			if (opts && opts.on_load) {
				// Don't bind DOM UI in unit test
			}
		},
		hide: () => {}
	};
	RefineEdge.Base_layers = {
		get_layer: () => layer,
		render_object: (ctx, l) => {
			ctx.drawImage(mockSmartBitmap, l.x, l.y, l.width, l.height);
		}
	};

	await RefineEdge.open(10);

	// Verify _width and _height match layer dimensions
	assert.equal(RefineEdge._width, 200);
	assert.equal(RefineEdge._height, 150);

	// Verify _imgCanvas is 200x150
	assert.equal(RefineEdge._imgCanvas.width, 200);
	assert.equal(RefineEdge._imgCanvas.height, 150);

	// Verify renderSmart was called for this smart layer
	assert.equal(renderedSmartLayer.id, 10);

	// Verify the smart object source image was drawn at (0, 0, 200, 150) in _imgCanvas, NOT at (350, 220)
	const imgCanvasDraw = drawnImages.find(d => d.targetWidth === 200 && d.targetHeight === 150 && d.image === mockSmartBitmap);
	assert.ok(imgCanvasDraw, 'smart bitmap must be drawn into _imgCanvas');
	assert.equal(imgCanvasDraw.dx, 0, '_imgCanvas draw must have dx = 0');
	assert.equal(imgCanvasDraw.dy, 0, '_imgCanvas draw must have dy = 0');
	assert.equal(imgCanvasDraw.dw, 200, '_imgCanvas draw must scale to layer width');
	assert.equal(imgCanvasDraw.dh, 150, '_imgCanvas draw must scale to layer height');

	// Verify _origMaskCanvas is 200x150 and drawn at (0, 0)
	assert.equal(RefineEdge._origMaskCanvas.width, 200);
	assert.equal(RefineEdge._origMaskCanvas.height, 150);
});

test('refine-edge: apply() preserves smart layer properties on new_layer_mask and avoids crashing on mask output', async () => {
	const refineEdgeSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/tools/refine_edge.js'), 'utf8');

	const smartLayer = {
		id: 55,
		type: 'smart',
		name: 'Smart Subject',
		smart_source_id: 'src-subj',
		smart_filter_mask: null,
		smart_filters_enabled: true,
		width_original: 600,
		height_original: 400,
		x: 100,
		y: 80,
		width: 300,
		height: 200,
		rotate: 25,
		filters: [{ id: 1, name: 'smart:vintage', params: { _version: 1 } }],
		mask: null
	};

	let capturedAction = null;
	const mockApp = {
		Layers: {
			get_layer: () => smartLayer,
			Base_selection: { has_selection: false }
		},
		Actions: {
			Update_layer_mask_image_action: class { constructor(m, id) { this.mask = m; this.id = id; } },
			Add_layer_mask_action: class { constructor(id, rev, sel) { this.id = id; } },
			Update_layer_image_action: class { constructor() { throw new Error('Should not call Update_layer_image_action on smart object'); } },
			Insert_layer_action: class { constructor(settings) { this.settings = settings; } },
			Reset_selection_action: class {},
			Bundle_action: class { constructor(name, desc, actions) { this.name = name; this.actions = actions; } }
		},
		State: {
			do_action: async (action) => {
				capturedAction = action;
				return { status: 'ok' };
			}
		}
	};

	let warningMessage = null;
	const context = vm.createContext({
		app: mockApp,
		config: { layer: smartLayer },
		alertify: {
			error: () => {},
			warning: (msg) => { warningMessage = msg; },
			success: () => {}
		},
		Dialog_class: class {},
		Base_layers_class: class {},
		renderSmart: () => createCanvas(600, 400),
		Mask_class: class {},
		document: {
			createElement: () => createCanvas(300, 200)
		},
		window: {
			addEventListener: () => {},
			removeEventListener: () => {}
		},
		console,
		Object,
		Math,
		Error,
		Uint8ClampedArray,
		ImageData: globalThis.ImageData || class ImageData {
			constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
		},
		refineStrokeMatting: () => new Uint8ClampedArray(10),
		applyFeather: (m) => m,
		applyContrast: (m) => m,
		applyShiftEdge: (m) => m,
		applyDecontaminateColors: () => new Uint8ClampedArray(300 * 200 * 4),
		BRUSH_SIZE_STEPS: [40],
		BRUSH_HARDNESS_STEPS: [100],
		get_next_step: () => 40
	});

	const classMatch = refineEdgeSource.match(/class Tools_refineEdge_class\s*\{[\s\S]*?\n\}/);
	const classCode = classMatch[0] + '\nglobalThis.Tools_refineEdge_class = Tools_refineEdge_class;';
	vm.runInContext(classCode, context);

	const RefineEdge = new context.Tools_refineEdge_class();
	RefineEdge.POP = { hide: () => {} };
	RefineEdge.Base_layers = { get_layer: () => smartLayer };
	RefineEdge._layerId = 55;
	RefineEdge._width = 300;
	RefineEdge._height = 200;
	RefineEdge._imgCanvas = createCanvas(300, 200);
	RefineEdge._workingMaskCanvas = createCanvas(300, 200);
	RefineEdge._origMaskCanvas = createCanvas(300, 200);

	// Case 1: Output to 'mask' with decontaminate=true on smart layer
	// Must warn and NOT try to run Update_layer_image_action on smart object
	RefineEdge._outputTo = 'mask';
	RefineEdge._decontaminate = true;
	await RefineEdge.apply();

	assert.ok(warningMessage, 'must warn that decontaminate colors cannot modify smart object pixels');
	assert.ok(capturedAction.actions.some(a => a instanceof mockApp.Actions.Add_layer_mask_action || a instanceof mockApp.Actions.Update_layer_mask_image_action));

	// Case 2: Output to 'new_layer_mask' with decontaminate=false on smart layer
	RefineEdge._outputTo = 'new_layer_mask';
	RefineEdge._decontaminate = false;
	await RefineEdge.apply();

	const insertAction = capturedAction.actions.find(a => a instanceof mockApp.Actions.Insert_layer_action);
	assert.ok(insertAction, 'Insert_layer_action must be created');
	assert.equal(insertAction.settings.type, 'smart', 'new layer must remain a smart object');
	assert.equal(insertAction.settings.smart_source_id, 'src-subj');
	assert.equal(insertAction.settings.rotate, 25, 'rotation must be preserved');
	assert.equal(insertAction.settings.width_original, 600);
	assert.equal(insertAction.settings.height_original, 400);
	assert.equal(insertAction.settings.width, 300);
	assert.equal(insertAction.settings.height, 200);
	assert.equal(insertAction.settings.filters.length, 1);
});
