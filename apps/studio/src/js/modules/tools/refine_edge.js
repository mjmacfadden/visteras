/**
 * Refine Edge / Select & Mask Module for Studio
 * Complete client-side parity with Photoshop's Select and Mask workspace:
 * - Refine Edge Brush (R) with color-aware guided matting for hair/fur/feathers
 * - Quick Selection (W), Brush (B), Lasso (L), Hand (H), Zoom (Z)
 * - 7 Photoshop View Modes (Onion Skin, Marching Ants, Overlay, On Black, On White, B&W, On Layers)
 * - Edge Detection with Smart Radius
 * - Global Refinements (Smooth, Feather, Contrast, Shift Edge, Invert)
 * - Color Decontamination
 * - Output To: Layer Mask, Selection, New Layer with Mask, New Layer
 */

import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import {
	refineStrokeMatting,
	applyEdgeDetection,
	applySmooth,
	applyFeather,
	applyContrast,
	applyShiftEdge,
	applyDecontaminateColors,
} from './../../libs/refine-edge/matting.js';

const VIEW_MODES = [
	{ id: 'on_black', name: 'On Black (B)' },
	{ id: 'on_white', name: 'On White (W)' },
	{ id: 'overlay', name: 'Overlay (V)' },
	{ id: 'onion_skin', name: 'Onion Skin (O)' },
	{ id: 'marching_ants', name: 'Marching Ants (M)' },
	{ id: 'black_and_white', name: 'Black & White (K)' },
	{ id: 'on_layers', name: 'On Layers (Y)' },
];

const PRESETS = {
	default: {
		radius: 0,
		smartRadius: false,
		smooth: 0,
		feather: 0,
		contrast: 0,
		shiftEdge: 0,
	},
	hair: {
		radius: 12,
		smartRadius: true,
		smooth: 1,
		feather: 0.5,
		contrast: 15,
		shiftEdge: 0,
	},
	high_contrast: {
		radius: 5,
		smartRadius: true,
		smooth: 2,
		feather: 0,
		contrast: 40,
		shiftEdge: -5,
	},
	soft_foliage: {
		radius: 16,
		smartRadius: false,
		smooth: 0,
		feather: 1.2,
		contrast: 10,
		shiftEdge: 5,
	},
};

class Tools_refineEdge_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();

		// State
		this._layerId = null;
		this._sourceLayer = null;
		this._width = 0;
		this._height = 0;

		// Canvases
		this._imgCanvas = null;          // Original RGB layer canvas
		this._origMaskCanvas = null;     // Unrefined initial mask
		this._baseMaskCanvas = null;     // Base mask containing brush strokes
		this._workingMaskCanvas = null;  // Mask with edge detection & global filters applied
		this._layersUnderCanvas = null;  // Flattened composite of layers underneath (for On Layers view)
		this._displayCanvas = null;      // Rendered viewport canvas
		this._displayCtx = null;

		// Viewport Navigation
		this._zoom = 1;
		this._panX = 0;
		this._panY = 0;
		this._isPanning = false;
		this._panStartX = 0;
		this._panStartY = 0;
		this._spaceHeld = false;
		this._altHeld = false;

		// Active Tool & Settings
		this._activeTool = 'refine_edge'; // 'quick_select' | 'refine_edge' | 'brush' | 'lasso' | 'hand' | 'zoom'
		this._toolMode = 'add';           // 'add' | 'subtract'
		this._brushSize = 35;
		this._brushHardness = 100;

		// Properties Panel Parameters
		this._viewMode = 'overlay';
		this._viewOpacity = 50;
		this._showEdge = false;
		this._showOriginal = false;
		this._refineMode = 'color';       // 'color' | 'object'
		this._radius = 0;
		this._smartRadius = false;
		this._smooth = 0;
		this._feather = 0;
		this._contrast = 0;
		this._shiftEdge = 0;
		this._invert = false;
		this._decontaminate = false;
		this._decontaminateAmount = 100;
		this._outputTo = 'mask';          // 'mask' | 'selection' | 'new_layer_mask' | 'new_layer'

		// Interaction tracking
		this._isDrawing = false;
		this._strokePoints = [];
		this._lassoPath = [];
		this._antsOffset = 0;
		this._antsTimer = null;
		this._debounceFilterTimer = null;

		// Bound event listeners for cleanup
		this._onKeyDown = this._handle_keydown.bind(this);
		this._onKeyUp = this._handle_keyup.bind(this);
		this._onWheel = this._handle_wheel.bind(this);
		this._onResize = this._handle_resize.bind(this);
	}

	async open(layer_id) {
		const targetId = layer_id ?? config.layer?.id;
		const layer = this.Base_layers.get_layer(targetId, true);
		if (!layer) {
			alertify.error('Please select a layer first.');
			return;
		}

		this._layerId = layer.id;
		this._sourceLayer = layer;

		// 1. Determine target canvas dimensions from mask (if present) or layer
		const maskSource = layer.mask ? (layer.mask.link_canvas || layer.mask.link) : null;
		if (maskSource && maskSource.width > 0 && maskSource.height > 0) {
			this._width = maskSource.width;
			this._height = maskSource.height;
		} else {
			this._width = Math.max(1, Math.round(layer.width || config.WIDTH));
			this._height = Math.max(1, Math.round(layer.height || config.HEIGHT));
		}

		// 2. Prepare original RGB image canvas
		this._imgCanvas = document.createElement('canvas');
		this._imgCanvas.width = this._width;
		this._imgCanvas.height = this._height;
		const imgCtx = this._imgCanvas.getContext('2d');

		const layerSrc = layer.link_canvas || layer.link;
		if (layer.type === 'image' && layerSrc) {
			imgCtx.drawImage(layerSrc, 0, 0, this._width, this._height);
		} else {
			const savedMask = layer.mask;
			layer.mask = null;
			this.Base_layers.render_object(imgCtx, layer);
			layer.mask = savedMask;
		}

		// 3. Prepare initial mask canvas
		this._origMaskCanvas = document.createElement('canvas');
		this._origMaskCanvas.width = this._width;
		this._origMaskCanvas.height = this._height;
		const origCtx = this._origMaskCanvas.getContext('2d');

		if (maskSource) {
			origCtx.drawImage(maskSource, 0, 0, this._width, this._height);
		} else if (app.Layers.Base_selection && app.Layers.Base_selection.has_selection) {
			const selMask = app.Layers.Base_selection.mask_canvas;
			const layerX = layer.x || 0;
			const layerY = layer.y || 0;
			origCtx.drawImage(selMask, -layerX, -layerY);
		} else {
			origCtx.fillStyle = '#ffffff';
			origCtx.fillRect(0, 0, this._width, this._height);
		}

		// 4. Clone for base editable mask and working filtered mask
		this._baseMaskCanvas = document.createElement('canvas');
		this._baseMaskCanvas.width = this._width;
		this._baseMaskCanvas.height = this._height;
		this._baseMaskCanvas.getContext('2d').drawImage(this._origMaskCanvas, 0, 0);

		this._workingMaskCanvas = document.createElement('canvas');
		this._workingMaskCanvas.width = this._width;
		this._workingMaskCanvas.height = this._height;

		// 5. Capture composite of layers underneath (for "On Layers" view mode)
		this._build_under_layers_canvas();

		// 6. Reset tools & sliders to clean initial defaults
		this._activeTool = 'refine_edge';
		this._toolMode = 'add';
		this._brushSize = 35;
		this._brushHardness = 100;
		this._viewMode = 'on_black';
		this._viewOpacity = 100;
		this._showEdge = false;
		this._showOriginal = false;
		this._refineMode = 'color';
		this._radius = 0;
		this._smartRadius = false;
		this._smooth = 0;
		this._feather = 0;
		this._contrast = 0;
		this._shiftEdge = 0;
		this._invert = false;
		this._decontaminate = false;
		this._decontaminateAmount = 100;
		this._outputTo = layer.mask ? 'mask' : (app.Layers.Base_selection?.has_selection ? 'mask' : 'new_layer_mask');

		this._recalculate_working_mask();

		// 6. Show dialog
		const _this = this;
		this.POP.show({
			title: 'Select and Mask',
			className: 'refine_edge_popup',
			params: [
				{ html: this._build_html() },
			],
			on_load: function () {
				_this._bind_ui();
				_this._fit_to_screen();
				_this._render_preview();
			},
			on_cancel: function () {
				_this._teardown();
			},
		});
	}

	_build_under_layers_canvas() {
		this._layersUnderCanvas = document.createElement('canvas');
		this._layersUnderCanvas.width = this._width;
		this._layersUnderCanvas.height = this._height;
		const ctx = this._layersUnderCanvas.getContext('2d');
		const layerX = this._sourceLayer.x || 0;
		const layerY = this._sourceLayer.y || 0;

		// Draw canvas background and all layers under target layer
		const docLayers = config.layers || [];
		const targetIndex = docLayers.findIndex(l => l.id === this._layerId);

		for (let i = 0; i < targetIndex; i++) {
			const lyr = docLayers[i];
			if (lyr && lyr.visible !== false) {
				const lyrCanvas = this.Base_layers.convert_layer_to_canvas(lyr.id, false);
				if (lyrCanvas) {
					ctx.drawImage(lyrCanvas, -layerX, -layerY);
				}
			}
		}
	}

	_build_html() {
		const label = this._sourceLayer?.name || 'Layer';
		const dims = `${this._width} \u00d7 ${this._height} px`;

		const viewOptionsHtml = VIEW_MODES.map(vm =>
			`<option value="${vm.id}" ${this._viewMode === vm.id ? 'selected' : ''}>${vm.name}</option>`
		).join('');

		return `
			<div class="refine-edge" id="refine_edge_root">
				<!-- Header -->
				<div class="refine-edge__header">
					<div class="refine-edge__title-area">
						<span class="refine-edge__title">Select and Mask</span>
						<span class="refine-edge__subtitle">${escapeHtml(label)} \u00b7 ${dims}</span>
					</div>
					<div class="refine-edge__header-actions">
						<button type="button" class="refine-edge__btn refine-edge__btn--ghost" data-action="reset">Reset</button>
						<button type="button" class="refine-edge__btn" data-action="cancel">Cancel</button>
						<button type="button" class="refine-edge__btn refine-edge__btn--primary" data-action="apply">OK</button>
					</div>
				</div>

				<!-- Options Bar -->
				<div class="refine-edge__options-bar">
					<div class="refine-edge__opt-group">
						<span class="refine-edge__opt-label">Mode:</span>
						<div class="refine-edge__segmented" id="refine_tool_mode_seg">
							<button type="button" class="refine-edge__seg-btn active" data-mode="add" title="Add to Selection (+)">+</button>
							<button type="button" class="refine-edge__seg-btn" data-mode="subtract" title="Subtract from Selection (-)">−</button>
						</div>
					</div>
					<div class="refine-edge__opt-group">
						<span class="refine-edge__opt-label">Size:</span>
						<input type="range" class="refine-edge__range-input" id="refine_brush_size_range" min="1" max="250" value="${this._brushSize}">
						<input type="number" class="refine-edge__num-input" id="refine_brush_size_num" min="1" max="500" value="${this._brushSize}"> px
					</div>
					<div class="refine-edge__opt-group">
						<span class="refine-edge__opt-label">Hardness:</span>
						<input type="range" class="refine-edge__range-input" id="refine_brush_hard_range" min="0" max="100" value="${this._brushHardness}">
						<input type="number" class="refine-edge__num-input" id="refine_brush_hard_num" min="0" max="100" value="${this._brushHardness}"> %
					</div>
				</div>

				<!-- Main 3-Column Body -->
				<div class="refine-edge__body">
					<!-- Left Toolbar -->
					<div class="refine-edge__toolbar" id="refine_toolbar">
						<button type="button" class="refine-edge__tool-btn" data-tool="quick_select" title="Quick Selection Tool (W)">
							<svg viewBox="0 0 24 24"><path d="M7 2v2H5v2H3v2H1v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2V8h-2V6h-2V4h-2V2H7zm11 11l-1.4 1.4 3 3L18.2 19l-3-3-1.4 1.4 3 3 1.4-1.4 3-3-1.4-1.4-1.8-1.6z"/></svg>
						</button>
						<button type="button" class="refine-edge__tool-btn active" data-tool="refine_edge" title="Refine Edge Brush Tool (R)">
							<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
								<path d="M15.4 3.6c-.4-.4-1.1-.4-1.5 0l-2.6 2.6 4.1 4.1 2.6-2.6c.4-.4.4-1.1 0-1.5l-2.6-2.6z"/>
								<path d="M10.5 7.5l4.3 4.3c-.8 1.6-2 2.8-3.6 3.7-1.3.7-2.8 1.1-4.3 1.2l-.2-.2c.1-1.5.5-3 1.2-4.3.9-1.6 2.1-2.8 3.7-3.6z"/>
								<path d="M12.2 18c-3.2.2-6.2-.9-8.2-3.2-1.9-2.2-2.6-5.2-1.8-8 .3-1.2.9-2.3 1.7-3.2l.6 1.4c-.6.8-1.1 1.7-1.3 2.7-.6 2.3-.1 4.8 1.4 6.6 1.6 1.9 4 2.8 6.4 2.6l-1.9-2.7 2.6 1.4-1.4-2.8 2.6 1.4-1.3-2.6c1.1 1.1 2.1 2.4 2.8 3.9l-2.1.5z"/>
							</svg>
						</button>
						<button type="button" class="refine-edge__tool-btn" data-tool="brush" title="Brush Tool (B)">
							<svg viewBox="0 0 24 24"><path d="M20.7 5.7c.4-.4.4-1 0-1.4l-2-2c-.4-.4-1-.4-1.4 0l-9.1 9.1L6 14.8V21h6.2l3.4-2.2 5.1-13.1zM11.5 19H8v-3.5l1.6-1.6 3.5 3.5-1.6 1.6z"/></svg>
						</button>
						<button type="button" class="refine-edge__tool-btn" data-tool="lasso" title="Lasso Tool (L)">
							<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 5.5 2 10c0 3.3 2.5 6.1 6.1 7.3L7 21h2l1.1-3.6c.6.1 1.3.2 1.9.2 5.5 0 10-3.5 10-8s-4.5-8-10-8zm0 14c-4.4 0-8-2.7-8-6s3.6-6 8-6 8 2.7 8 6-3.6 6-8 6z"/></svg>
						</button>
						<div class="refine-edge__tool-sep"></div>
						<button type="button" class="refine-edge__tool-btn" data-tool="hand" title="Hand Tool (H / Space)">
							<svg viewBox="0 0 24 24"><path d="M18 9V4a2 2 0 0 0-4 0v5h-1V2a2 2 0 0 0-4 0v7H8V5a2 2 0 0 0-4 0v10a7 7 0 0 0 14 0V9z"/></svg>
						</button>
						<button type="button" class="refine-edge__tool-btn" data-tool="zoom" title="Zoom Tool (Z / Alt-click to zoom out)">
							<svg viewBox="0 0 24 24"><path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm1-7H9v2h2v2h1v-2h2V9h-2V7z"/></svg>
						</button>
					</div>

					<!-- Center Viewport -->
					<div class="refine-edge__viewport" id="refine_viewport">
						<div class="refine-edge__canvas-container" id="refine_canvas_container">
							<canvas class="refine-edge__canvas" id="refine_display_canvas" width="${this._width}" height="${this._height}"></canvas>
						</div>
						<div class="refine-edge__cursor-ring" id="refine_cursor_ring"></div>
						
						<!-- Bottom Zoom Bar -->
						<div class="refine-edge__zoom-bar">
							<button type="button" class="refine-edge__zoom-btn" id="refine_zoom_out" title="Zoom Out">−</button>
							<span id="refine_zoom_level">100%</span>
							<button type="button" class="refine-edge__zoom-btn" id="refine_zoom_in" title="Zoom In">+</button>
							<button type="button" class="refine-edge__zoom-btn" id="refine_zoom_fit" title="Fit to Screen">Fit</button>
							<button type="button" class="refine-edge__zoom-btn" id="refine_zoom_100" title="100% View">100%</button>
						</div>
					</div>

					<!-- Right Properties Panel -->
					<div class="refine-edge__properties" id="refine_properties">
						<!-- View Mode Section -->
						<div class="refine-edge__panel">
							<div class="refine-edge__panel-header" data-toggle="panel">
								<span>View Mode</span>
								<span class="refine-edge__panel-arrow">\u25be</span>
							</div>
							<div class="refine-edge__panel-content">
								<div class="refine-edge__row refine-edge__row--stack">
									<span class="refine-edge__row-label">View:</span>
									<select class="refine-edge__select" id="refine_view_mode_select">
										${viewOptionsHtml}
									</select>
								</div>
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Opacity:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_view_opacity_range" min="0" max="100" value="${this._viewOpacity}">
										<input type="number" id="refine_view_opacity_num" min="0" max="100" value="${this._viewOpacity}"> %
									</div>
								</div>
								<div class="refine-edge__row">
									<label class="refine-edge__checkbox-label">
										<input type="checkbox" id="refine_show_edge_cb" ${this._showEdge ? 'checked' : ''}>
										<span>Show Edge (J)</span>
									</label>
								</div>
								<div class="refine-edge__row">
									<label class="refine-edge__checkbox-label">
										<input type="checkbox" id="refine_show_original_cb" ${this._showOriginal ? 'checked' : ''}>
										<span>Show Original (P)</span>
									</label>
								</div>
							</div>
						</div>

						<!-- Preset Section -->
						<div class="refine-edge__panel">
							<div class="refine-edge__panel-header" data-toggle="panel">
								<span>Preset</span>
								<span class="refine-edge__panel-arrow">\u25be</span>
							</div>
							<div class="refine-edge__panel-content">
								<select class="refine-edge__select" id="refine_preset_select">
									<option value="default">Default</option>
									<option value="hair">Hair / Fur / Feathers</option>
									<option value="high_contrast">High Contrast Object</option>
									<option value="soft_foliage">Soft Foliage</option>
								</select>
							</div>
						</div>

						<!-- Refine Mode Section -->
						<div class="refine-edge__panel">
							<div class="refine-edge__panel-header" data-toggle="panel">
								<span>Refine Mode</span>
								<span class="refine-edge__panel-arrow">\u25be</span>
							</div>
							<div class="refine-edge__panel-content">
								<div class="refine-edge__mode-group" id="refine_mode_seg">
									<button type="button" class="refine-edge__mode-btn active" data-mode="color">Color Aware</button>
									<button type="button" class="refine-edge__mode-btn" data-mode="object">Object Aware</button>
								</div>
							</div>
						</div>

						<!-- Edge Detection Section -->
						<div class="refine-edge__panel">
							<div class="refine-edge__panel-header" data-toggle="panel">
								<span>Edge Detection</span>
								<span class="refine-edge__panel-arrow">\u25be</span>
							</div>
							<div class="refine-edge__panel-content">
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Radius:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_radius_range" min="0" max="100" value="${this._radius}">
										<input type="number" id="refine_radius_num" min="0" max="100" value="${this._radius}"> px
									</div>
								</div>
								<div class="refine-edge__row">
									<label class="refine-edge__checkbox-label">
										<input type="checkbox" id="refine_smart_radius_cb" ${this._smartRadius ? 'checked' : ''}>
										<span>Smart Radius</span>
									</label>
								</div>
							</div>
						</div>

						<!-- Global Refinements Section -->
						<div class="refine-edge__panel">
							<div class="refine-edge__panel-header" data-toggle="panel">
								<span>Global Refinements</span>
								<span class="refine-edge__panel-arrow">\u25be</span>
							</div>
							<div class="refine-edge__panel-content">
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Smooth:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_smooth_range" min="0" max="100" value="${this._smooth}">
										<input type="number" id="refine_smooth_num" min="0" max="100" value="${this._smooth}">
									</div>
								</div>
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Feather:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_feather_range" min="0" max="100" step="0.5" value="${this._feather}">
										<input type="number" id="refine_feather_num" min="0" max="100" step="0.5" value="${this._feather}"> px
									</div>
								</div>
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Contrast:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_contrast_range" min="0" max="100" value="${this._contrast}">
										<input type="number" id="refine_contrast_num" min="0" max="100" value="${this._contrast}"> %
									</div>
								</div>
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Shift Edge:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_shift_range" min="-100" max="100" value="${this._shiftEdge}">
										<input type="number" id="refine_shift_num" min="-100" max="100" value="${this._shiftEdge}"> %
									</div>
								</div>
								<div class="refine-edge__row">
									<label class="refine-edge__checkbox-label">
										<input type="checkbox" id="refine_invert_cb" ${this._invert ? 'checked' : ''}>
										<span>Invert Mask</span>
									</label>
								</div>
								<div class="refine-edge__row">
									<button type="button" class="refine-edge__btn refine-edge__btn--ghost" id="refine_clear_btn" style="width: 100%;">Clear Mask</button>
								</div>
							</div>
						</div>

						<!-- Output Settings Section -->
						<div class="refine-edge__panel">
							<div class="refine-edge__panel-header" data-toggle="panel">
								<span>Output Settings</span>
								<span class="refine-edge__panel-arrow">\u25be</span>
							</div>
							<div class="refine-edge__panel-content">
								<div class="refine-edge__row">
									<label class="refine-edge__checkbox-label">
										<input type="checkbox" id="refine_decontam_cb" ${this._decontaminate ? 'checked' : ''}>
										<span>Decontaminate Colors</span>
									</label>
								</div>
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Amount:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_decontam_range" min="0" max="100" value="${this._decontaminateAmount}">
										<input type="number" id="refine_decontam_num" min="0" max="100" value="${this._decontaminateAmount}"> %
									</div>
								</div>
								<div class="refine-edge__row refine-edge__row--stack">
									<span class="refine-edge__row-label">Output To:</span>
									<select class="refine-edge__select" id="refine_output_to_select">
										<option value="mask" ${this._outputTo === 'mask' ? 'selected' : ''}>Layer Mask</option>
										<option value="selection" ${this._outputTo === 'selection' ? 'selected' : ''}>Selection</option>
										<option value="new_layer_mask" ${this._outputTo === 'new_layer_mask' ? 'selected' : ''}>New Layer with Layer Mask</option>
										<option value="new_layer" ${this._outputTo === 'new_layer' ? 'selected' : ''}>New Layer</option>
									</select>
								</div>
							</div>
						</div>

						<!-- Panel Footer -->
						<div class="refine-edge__panel-footer">
							<div class="refine-edge__footer-actions">
								<button type="button" class="refine-edge__btn refine-edge__btn--ghost" data-action="reset">Reset</button>
								<button type="button" class="refine-edge__btn" data-action="cancel">Cancel</button>
								<button type="button" class="refine-edge__btn refine-edge__btn--primary" data-action="apply">OK</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	_bind_ui() {
		const root = document.getElementById('refine_edge_root');
		if (!root) return;

		this._displayCanvas = document.getElementById('refine_display_canvas');
		this._displayCtx = this._displayCanvas.getContext('2d');
		this._cursorRing = document.getElementById('refine_cursor_ring');
		this._viewport = document.getElementById('refine_viewport');
		this._canvasContainer = document.getElementById('refine_canvas_container');

		// 1. Accordion panel toggling
		root.querySelectorAll('[data-toggle="panel"]').forEach(header => {
			header.addEventListener('click', () => {
				header.closest('.refine-edge__panel').classList.toggle('collapsed');
			});
		});

		// 2. Header & Footer action buttons
		root.querySelectorAll('[data-action="apply"]').forEach(btn => {
			btn.addEventListener('click', () => this.apply());
		});
		root.querySelectorAll('[data-action="cancel"]').forEach(btn => {
			btn.addEventListener('click', () => this.close());
		});
		root.querySelectorAll('[data-action="reset"]').forEach(btn => {
			btn.addEventListener('click', () => this.reset());
		});

		// 3. Toolbar tool selection
		root.querySelectorAll('#refine_toolbar [data-tool]').forEach(btn => {
			btn.addEventListener('click', () => {
				root.querySelectorAll('#refine_toolbar [data-tool]').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				this._set_active_tool(btn.dataset.tool);
			});
		});

		// 4. Mode toggle (+ / -)
		root.querySelectorAll('#refine_tool_mode_seg button').forEach(btn => {
			btn.addEventListener('click', () => {
				root.querySelectorAll('#refine_tool_mode_seg button').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				this._toolMode = btn.dataset.mode;
			});
		});

		// 5. Dual input binding (range + number)
		const linkDual = (rangeId, numId, onVal) => {
			const range = document.getElementById(rangeId);
			const num = document.getElementById(numId);
			if (!range || !num) return;
			range.addEventListener('input', () => {
				num.value = range.value;
				onVal(parseFloat(range.value));
			});
			num.addEventListener('input', () => {
				range.value = num.value;
				onVal(parseFloat(num.value));
			});
		};

		linkDual('refine_brush_size_range', 'refine_brush_size_num', val => {
			this._brushSize = Math.max(1, Math.min(500, val));
			this._update_cursor_ring();
		});

		linkDual('refine_brush_hard_range', 'refine_brush_hard_num', val => {
			this._brushHardness = Math.max(0, Math.min(100, val));
		});

		linkDual('refine_view_opacity_range', 'refine_view_opacity_num', val => {
			this._viewOpacity = Math.max(0, Math.min(100, val));
			this._render_preview();
		});

		linkDual('refine_radius_range', 'refine_radius_num', val => {
			this._radius = Math.max(0, Math.min(100, val));
			this._schedule_recalculate();
		});

		linkDual('refine_smooth_range', 'refine_smooth_num', val => {
			this._smooth = Math.max(0, Math.min(100, val));
			this._schedule_recalculate();
		});

		linkDual('refine_feather_range', 'refine_feather_num', val => {
			this._feather = Math.max(0, Math.min(100, val));
			this._schedule_recalculate();
		});

		linkDual('refine_contrast_range', 'refine_contrast_num', val => {
			this._contrast = Math.max(0, Math.min(100, val));
			this._schedule_recalculate();
		});

		linkDual('refine_shift_range', 'refine_shift_num', val => {
			this._shiftEdge = Math.max(-100, Math.min(100, val));
			this._schedule_recalculate();
		});

		linkDual('refine_decontam_range', 'refine_decontam_num', val => {
			this._decontaminateAmount = Math.max(0, Math.min(100, val));
			this._render_preview();
		});

		// 6. View Mode & Checkboxes
		const viewSelect = document.getElementById('refine_view_mode_select');
		if (viewSelect) {
			viewSelect.addEventListener('change', () => {
				this._viewMode = viewSelect.value;
				this._render_preview();
			});
		}

		const showEdgeCb = document.getElementById('refine_show_edge_cb');
		if (showEdgeCb) {
			showEdgeCb.addEventListener('change', () => {
				this._showEdge = showEdgeCb.checked;
				this._render_preview();
			});
		}

		const showOrigCb = document.getElementById('refine_show_original_cb');
		if (showOrigCb) {
			showOrigCb.addEventListener('change', () => {
				this._showOriginal = showOrigCb.checked;
				this._render_preview();
			});
		}

		const smartRadiusCb = document.getElementById('refine_smart_radius_cb');
		if (smartRadiusCb) {
			smartRadiusCb.addEventListener('change', () => {
				this._smartRadius = smartRadiusCb.checked;
				this._schedule_recalculate();
			});
		}

		const invertCb = document.getElementById('refine_invert_cb');
		if (invertCb) {
			invertCb.addEventListener('change', () => {
				this._invert = invertCb.checked;
				this._schedule_recalculate();
			});
		}

		const decontamCb = document.getElementById('refine_decontam_cb');
		if (decontamCb) {
			decontamCb.addEventListener('change', () => {
				this._decontaminate = decontamCb.checked;
				this._render_preview();
			});
		}

		const outSelect = document.getElementById('refine_output_to_select');
		if (outSelect) {
			outSelect.addEventListener('change', () => {
				this._outputTo = outSelect.value;
			});
		}

		const clearBtn = document.getElementById('refine_clear_btn');
		if (clearBtn) {
			clearBtn.addEventListener('click', () => {
				const ctx = this._baseMaskCanvas.getContext('2d');
				ctx.clearRect(0, 0, this._width, this._height);
				this._recalculate_working_mask();
				this._render_preview();
			});
		}

		// 7. Preset Selector
		const presetSelect = document.getElementById('refine_preset_select');
		if (presetSelect) {
			presetSelect.addEventListener('change', () => {
				const p = PRESETS[presetSelect.value];
				if (p) {
					this._radius = p.radius;
					this._smartRadius = p.smartRadius;
					this._smooth = p.smooth;
					this._feather = p.feather;
					this._contrast = p.contrast;
					this._shiftEdge = p.shiftEdge;
					this._update_ui_slider_values();
					this._recalculate_working_mask();
					this._render_preview();
				}
			});
		}

		// 8. Refine Mode (Color Aware / Object Aware)
		root.querySelectorAll('#refine_mode_seg button').forEach(btn => {
			btn.addEventListener('click', () => {
				root.querySelectorAll('#refine_mode_seg button').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				this._refineMode = btn.dataset.mode;
			});
		});

		// 9. Zoom Bar Buttons
		document.getElementById('refine_zoom_in')?.addEventListener('click', () => this._zoom_by(1.25));
		document.getElementById('refine_zoom_out')?.addEventListener('click', () => this._zoom_by(0.8));
		document.getElementById('refine_zoom_fit')?.addEventListener('click', () => this._fit_to_screen());
		document.getElementById('refine_zoom_100')?.addEventListener('click', () => this._set_zoom(1));

		// 10. Viewport Mouse & Pointer Events
		this._viewport.addEventListener('mousedown', this._handle_pointer_down.bind(this));
		window.addEventListener('mousemove', this._handle_pointer_move.bind(this));
		window.addEventListener('mouseup', this._handle_pointer_up.bind(this));
		this._viewport.addEventListener('wheel', this._onWheel, { passive: false });

		// 11. Global Keyboard Listeners
		window.addEventListener('keydown', this._onKeyDown, true);
		window.addEventListener('keyup', this._onKeyUp, true);
		window.addEventListener('resize', this._onResize);

		this._update_cursor_ring();
	}

	_update_ui_slider_values() {
		const setVal = (rangeId, numId, val) => {
			const r = document.getElementById(rangeId);
			const n = document.getElementById(numId);
			if (r) r.value = val;
			if (n) n.value = val;
		};
		setVal('refine_radius_range', 'refine_radius_num', this._radius);
		setVal('refine_smooth_range', 'refine_smooth_num', this._smooth);
		setVal('refine_feather_range', 'refine_feather_num', this._feather);
		setVal('refine_contrast_range', 'refine_contrast_num', this._contrast);
		setVal('refine_shift_range', 'refine_shift_num', this._shiftEdge);
		const sr = document.getElementById('refine_smart_radius_cb');
		if (sr) sr.checked = this._smartRadius;
	}

	_set_active_tool(tool) {
		this._activeTool = tool;
		this._update_viewport_cursor();
	}

	_update_viewport_cursor() {
		if (!this._viewport) return;
		this._viewport.className = 'refine-edge__viewport';
		if (this._isPanning || this._activeTool === 'hand' || this._spaceHeld) {
			this._viewport.classList.add(this._isPanning ? 'cursor-grabbing' : 'cursor-hand');
			if (this._cursorRing) this._cursorRing.style.display = 'none';
		} else if (this._activeTool === 'zoom') {
			this._viewport.classList.add(this._altHeld ? 'cursor-zoom-out' : 'cursor-zoom');
			if (this._cursorRing) this._cursorRing.style.display = 'none';
		} else {
			if (['refine_edge', 'brush'].includes(this._activeTool)) {
				if (this._cursorRing) this._cursorRing.style.display = 'block';
			} else {
				if (this._cursorRing) this._cursorRing.style.display = 'none';
			}
		}
	}

	_update_cursor_ring(e) {
		if (!this._cursorRing || !this._viewport) return;
		const diameter = Math.round(this._brushSize * this._zoom);
		this._cursorRing.style.width = diameter + 'px';
		this._cursorRing.style.height = diameter + 'px';

		if (e) {
			const rect = this._viewport.getBoundingClientRect();
			this._cursorRing.style.left = (e.clientX - rect.left) + 'px';
			this._cursorRing.style.top = (e.clientY - rect.top) + 'px';
		}
	}

	// -------------------------------------------------------------------------
	// Viewport Pan / Zoom Navigation
	// -------------------------------------------------------------------------

	_fit_to_screen() {
		if (!this._viewport || !this._canvasContainer) return;
		const vw = this._viewport.clientWidth - 40;
		const vh = this._viewport.clientHeight - 40;
		if (vw <= 0 || vh <= 0) return;

		const scaleX = vw / this._width;
		const scaleY = vh / this._height;
		this._zoom = Math.min(1.5, Math.max(0.05, Math.min(scaleX, scaleY)));
		this._panX = 0;
		this._panY = 0;
		this._apply_transform();
	}

	_set_zoom(newZoom, centerX, centerY) {
		newZoom = Math.min(32, Math.max(0.05, newZoom));
		if (centerX != null && centerY != null) {
			const ratio = newZoom / this._zoom;
			this._panX = centerX - (centerX - this._panX) * ratio;
			this._panY = centerY - (centerY - this._panY) * ratio;
		}
		this._zoom = newZoom;
		this._apply_transform();
	}

	_zoom_by(factor, centerX, centerY) {
		this._set_zoom(this._zoom * factor, centerX, centerY);
	}

	_apply_transform() {
		if (!this._canvasContainer) return;
		this._canvasContainer.style.transform = `translate(${Math.round(this._panX)}px, ${Math.round(this._panY)}px) scale(${this._zoom})`;
		const zoomLabel = document.getElementById('refine_zoom_level');
		if (zoomLabel) {
			zoomLabel.textContent = `${Math.round(this._zoom * 100)}%`;
		}
		this._update_cursor_ring();
	}

	_handle_wheel(e) {
		e.preventDefault();
		const rect = this._viewport.getBoundingClientRect();
		const mouseX = e.clientX - rect.left - rect.width / 2;
		const mouseY = e.clientY - rect.top - rect.height / 2;
		const factor = e.deltaY < 0 ? 1.15 : 0.85;
		this._zoom_by(factor, mouseX, mouseY);
	}

	_handle_resize() {
		this._apply_transform();
	}

	// -------------------------------------------------------------------------
	// Pointer & Tool Drawing Handlers
	// -------------------------------------------------------------------------

	_get_canvas_coords(e) {
		const rect = this._viewport.getBoundingClientRect();
		const vX = e.clientX - rect.left - rect.width / 2;
		const vY = e.clientY - rect.top - rect.height / 2;

		const docX = (vX - this._panX) / this._zoom + this._width / 2;
		const docY = (vY - this._panY) / this._zoom + this._height / 2;
		return { x: docX, y: docY };
	}

	_handle_pointer_down(e) {
		if (e.button === 1 || this._spaceHeld || this._activeTool === 'hand') {
			// Pan start
			this._isPanning = true;
			this._panStartX = e.clientX - this._panX;
			this._panStartY = e.clientY - this._panY;
			this._update_viewport_cursor();
			return;
		}

		if (e.button !== 0) return;

		if (this._activeTool === 'zoom') {
			const rect = this._viewport.getBoundingClientRect();
			const mouseX = e.clientX - rect.left - rect.width / 2;
			const mouseY = e.clientY - rect.top - rect.height / 2;
			const factor = (e.altKey || this._altHeld) ? 0.8 : 1.25;
			this._zoom_by(factor, mouseX, mouseY);
			return;
		}

		const pt = this._get_canvas_coords(e);
		this._isDrawing = true;

		if (this._activeTool === 'refine_edge') {
			this._strokePoints = [pt];
			this._apply_refine_brush_dab(pt, null);
		} else if (this._activeTool === 'brush') {
			this._strokePoints = [pt];
			this._apply_standard_brush_dab(pt, null);
		} else if (this._activeTool === 'lasso') {
			this._lassoPath = [pt];
		} else if (this._activeTool === 'quick_select') {
			this._apply_quick_select(pt);
		}
	}

	_handle_pointer_move(e) {
		this._update_cursor_ring(e);

		if (this._isPanning) {
			this._panX = e.clientX - this._panStartX;
			this._panY = e.clientY - this._panStartY;
			this._apply_transform();
			return;
		}

		if (!this._isDrawing) return;

		const pt = this._get_canvas_coords(e);
		const prevPt = this._strokePoints.length > 0 ? this._strokePoints[this._strokePoints.length - 1] : null;

		if (this._activeTool === 'refine_edge') {
			this._strokePoints.push(pt);
			this._apply_refine_brush_dab(pt, prevPt);
		} else if (this._activeTool === 'brush') {
			this._strokePoints.push(pt);
			this._apply_standard_brush_dab(pt, prevPt);
		} else if (this._activeTool === 'lasso') {
			this._lassoPath.push(pt);
			this._render_lasso_preview();
		}
	}

	_handle_pointer_up(e) {
		if (this._isPanning) {
			this._isPanning = false;
			this._update_viewport_cursor();
			return;
		}

		if (!this._isDrawing) return;
		this._isDrawing = false;

		if (this._activeTool === 'refine_edge') {
			// Apply comprehensive guided matting over the complete stroke
			this._finish_refine_brush_stroke();
		} else if (this._activeTool === 'lasso') {
			this._finish_lasso_selection();
		}

		this._strokePoints = [];
		this._lassoPath = [];
		this._recalculate_working_mask();
		this._render_preview();
	}

	// -------------------------------------------------------------------------
	// Brush & Matting Logic
	// -------------------------------------------------------------------------

	_is_subtract_mode() {
		return (this._toolMode === 'subtract') !== (this._altHeld);
	}

	_apply_standard_brush_dab(pt, prevPt) {
		const ctx = this._baseMaskCanvas.getContext('2d');
		const rad = this._brushSize / 2;
		const isSub = this._is_subtract_mode();
		const color = isSub ? '#000000' : '#ffffff';

		ctx.save();
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = color;
		ctx.strokeStyle = color;
		ctx.lineWidth = rad * 2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		if (prevPt) {
			ctx.beginPath();
			ctx.moveTo(prevPt.x, prevPt.y);
			ctx.lineTo(pt.x, pt.y);
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();

		this._recalculate_working_mask();
		this._render_preview();
	}

	_apply_refine_brush_dab(pt, prevPt) {
		// Live visual feedback dab while painting on preview
		if (!this._displayCtx) return;
		this._displayCtx.save();
		const color = this._is_subtract_mode() ? 'rgba(255, 60, 60, 0.45)' : 'rgba(0, 180, 255, 0.45)';
		this._displayCtx.strokeStyle = color;
		this._displayCtx.fillStyle = color;
		this._displayCtx.lineWidth = this._brushSize;
		this._displayCtx.lineCap = 'round';
		this._displayCtx.lineJoin = 'round';

		if (prevPt) {
			this._displayCtx.beginPath();
			this._displayCtx.moveTo(prevPt.x, prevPt.y);
			this._displayCtx.lineTo(pt.x, pt.y);
			this._displayCtx.stroke();
		} else {
			this._displayCtx.beginPath();
			this._displayCtx.arc(pt.x, pt.y, this._brushSize / 2, 0, Math.PI * 2);
			this._displayCtx.fill();
		}
		this._displayCtx.restore();
	}

	_finish_refine_brush_stroke() {
		if (this._strokePoints.length === 0) return;

		const imgCtx = this._imgCanvas.getContext('2d');
		const imgData = imgCtx.getImageData(0, 0, this._width, this._height);
		const maskCtx = this._baseMaskCanvas.getContext('2d');
		const maskData = maskCtx.getImageData(0, 0, this._width, this._height);

		// Extract grayscale alpha array from base mask
		const N = this._width * this._height;
		const maskGrayscale = new Uint8ClampedArray(N);
		for (let i = 0; i < N; i++) {
			maskGrayscale[i] = maskData.data[i * 4];
		}

		// Apply Color-Aware Guided Matting
		const isSub = this._is_subtract_mode();
		const refinedGrayscale = refineStrokeMatting(
			imgData.data,
			maskGrayscale,
			this._width,
			this._height,
			this._strokePoints,
			this._brushSize / 2,
			isSub,
			this._refineMode
		);

		// Write refined grayscale back into base mask canvas
		for (let i = 0; i < N; i++) {
			const idx = i * 4;
			const v = refinedGrayscale[i];
			maskData.data[idx] = v;
			maskData.data[idx + 1] = v;
			maskData.data[idx + 2] = v;
			maskData.data[idx + 3] = 255;
		}
		maskCtx.putImageData(maskData, 0, 0);
	}

	_finish_lasso_selection() {
		if (this._lassoPath.length < 3) return;
		const ctx = this._baseMaskCanvas.getContext('2d');
		const isSub = this._is_subtract_mode();

		ctx.save();
		ctx.beginPath();
		ctx.moveTo(this._lassoPath[0].x, this._lassoPath[0].y);
		for (let i = 1; i < this._lassoPath.length; i++) {
			ctx.lineTo(this._lassoPath[i].x, this._lassoPath[i].y);
		}
		ctx.closePath();

		if (isSub) {
			ctx.globalCompositeOperation = 'destination-out';
			ctx.fillStyle = '#000000';
		} else {
			ctx.globalCompositeOperation = 'source-over';
			ctx.fillStyle = '#ffffff';
		}
		ctx.fill();
		ctx.restore();
	}

	_render_lasso_preview() {
		this._render_preview();
		if (this._lassoPath.length < 2) return;
		this._displayCtx.save();
		this._displayCtx.strokeStyle = '#ffffff';
		this._displayCtx.lineWidth = 1.5;
		this._displayCtx.setLineDash([4, 4]);
		this._displayCtx.beginPath();
		this._displayCtx.moveTo(this._lassoPath[0].x, this._lassoPath[0].y);
		for (let i = 1; i < this._lassoPath.length; i++) {
			this._displayCtx.lineTo(this._lassoPath[i].x, this._lassoPath[i].y);
		}
		this._displayCtx.stroke();
		this._displayCtx.restore();
	}

	_apply_quick_select(pt) {
		const x0 = Math.round(pt.x);
		const y0 = Math.round(pt.y);
		if (x0 < 0 || x0 >= this._width || y0 < 0 || y0 >= this._height) return;

		const imgCtx = this._imgCanvas.getContext('2d');
		const imgData = imgCtx.getImageData(0, 0, this._width, this._height);
		const pixels = imgData.data;

		const targetIdx = (y0 * this._width + x0) * 4;
		const tr = pixels[targetIdx];
		const tg = pixels[targetIdx + 1];
		const tb = pixels[targetIdx + 2];

		// Flood fill BFS with tolerance within brush radius
		const radius = this._brushSize;
		const radSq = radius * radius;
		const tolerance = 35;
		const visited = new Uint8Array(this._width * this._height);
		const queue = [[x0, y0]];
		visited[y0 * this._width + x0] = 1;

		const maskCtx = this._baseMaskCanvas.getContext('2d');
		const maskData = maskCtx.getImageData(0, 0, this._width, this._height);
		const isSub = this._is_subtract_mode();
		const fillVal = isSub ? 0 : 255;

		while (queue.length > 0) {
			const [x, y] = queue.pop();
			const pIdx = (y * this._width + x) * 4;
			maskData.data[pIdx] = fillVal;
			maskData.data[pIdx + 1] = fillVal;
			maskData.data[pIdx + 2] = fillVal;
			maskData.data[pIdx + 3] = 255;

			const neighbors = [
				[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
			];
			for (let i = 0; i < neighbors.length; i++) {
				const [nx, ny] = neighbors[i];
				if (nx >= 0 && nx < this._width && ny >= 0 && ny < this._height) {
					const dx = nx - x0;
					const dy = ny - y0;
					if (dx * dx + dy * dy <= radSq) {
						const nIdx = ny * this._width + nx;
						if (visited[nIdx] === 0) {
							visited[nIdx] = 1;
							const npIdx = nIdx * 4;
							const diff = Math.hypot(pixels[npIdx] - tr, pixels[npIdx + 1] - tg, pixels[npIdx + 2] - tb);
							if (diff <= tolerance) {
								queue.push([nx, ny]);
							}
						}
					}
				}
			}
		}

		maskCtx.putImageData(maskData, 0, 0);
		this._recalculate_working_mask();
		this._render_preview();
	}

	// -------------------------------------------------------------------------
	// Mask Pipeline & Global Refinements
	// -------------------------------------------------------------------------

	_schedule_recalculate() {
		if (this._debounceFilterTimer) clearTimeout(this._debounceFilterTimer);
		this._debounceFilterTimer = setTimeout(() => {
			this._recalculate_working_mask();
			this._render_preview();
		}, 30);
	}

	_recalculate_working_mask() {
		const N = this._width * this._height;
		const baseCtx = this._baseMaskCanvas.getContext('2d');
		const baseData = baseCtx.getImageData(0, 0, this._width, this._height);

		let mask = new Uint8ClampedArray(N);
		for (let i = 0; i < N; i++) {
			mask[i] = baseData.data[i * 4];
		}

		// 1. Edge Detection
		if (this._radius > 0) {
			const imgCtx = this._imgCanvas.getContext('2d');
			const imgData = imgCtx.getImageData(0, 0, this._width, this._height);
			mask = applyEdgeDetection(imgData.data, mask, this._width, this._height, this._radius, this._smartRadius);
		}

		// 2. Smooth
		if (this._smooth > 0) {
			mask = applySmooth(mask, this._width, this._height, this._smooth);
		}

		// 3. Feather
		if (this._feather > 0) {
			mask = applyFeather(mask, this._width, this._height, this._feather);
		}

		// 4. Contrast
		if (this._contrast > 0) {
			mask = applyContrast(mask, this._width, this._height, this._contrast);
		}

		// 5. Shift Edge
		if (this._shiftEdge !== 0) {
			mask = applyShiftEdge(mask, this._width, this._height, this._shiftEdge);
		}

		// 6. Invert
		if (this._invert) {
			for (let i = 0; i < N; i++) {
				mask[i] = 255 - mask[i];
			}
		}

		// Write to working mask canvas
		const workCtx = this._workingMaskCanvas.getContext('2d');
		const workData = workCtx.createImageData(this._width, this._height);
		for (let i = 0; i < N; i++) {
			const idx = i * 4;
			const v = mask[i];
			workData.data[idx] = v;
			workData.data[idx + 1] = v;
			workData.data[idx + 2] = v;
			workData.data[idx + 3] = 255;
		}
		workCtx.putImageData(workData, 0, 0);
	}

	// -------------------------------------------------------------------------
	// View Modes Rendering
	// -------------------------------------------------------------------------

	_render_preview() {
		if (!this._displayCtx || !this._imgCanvas) return;

		const activeMask = this._showOriginal ? this._origMaskCanvas : this._workingMaskCanvas;
		const W = this._width;
		const H = this._height;
		const opacity = this._viewOpacity / 100;

		this._displayCtx.clearRect(0, 0, W, H);

		// Get matted image pixels (with color decontamination if enabled)
		let effectiveImgCanvas = this._imgCanvas;
		if (this._decontaminate) {
			const imgCtx = this._imgCanvas.getContext('2d');
			const imgPixels = imgCtx.getImageData(0, 0, W, H).data;
			const maskPixels = activeMask.getContext('2d').getImageData(0, 0, W, H).data;
			const mGrayscale = new Uint8ClampedArray(W * H);
			for (let i = 0; i < W * H; i++) mGrayscale[i] = maskPixels[i * 4];

			const decontamPixels = applyDecontaminateColors(imgPixels, mGrayscale, W, H, this._decontaminateAmount);
			effectiveImgCanvas = document.createElement('canvas');
			effectiveImgCanvas.width = W;
			effectiveImgCanvas.height = H;
			const dCtx = effectiveImgCanvas.getContext('2d');
			const dImgData = dCtx.createImageData(W, H);
			dImgData.data.set(decontamPixels);
			dCtx.putImageData(dImgData, 0, 0);
		}

		switch (this._viewMode) {
			case 'overlay': {
				// Photoshop Rubylith: image drawn normally, unselected area tinted red
				this._displayCtx.drawImage(effectiveImgCanvas, 0, 0);
				const rubylith = this._create_rubylith_overlay(activeMask, opacity);
				this._displayCtx.drawImage(rubylith, 0, 0);
				break;
			}
			case 'onion_skin': {
				// Draw faint unmasked image if opacity < 1, then masked subject on top
				if (opacity < 1) {
					this._displayCtx.save();
					this._displayCtx.globalAlpha = 1 - opacity;
					this._displayCtx.drawImage(effectiveImgCanvas, 0, 0);
					this._displayCtx.restore();
				}
				const matted = this._create_matted_canvas(effectiveImgCanvas, activeMask);
				this._displayCtx.drawImage(matted, 0, 0);
				break;
			}
			case 'on_black': {
				this._displayCtx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
				this._displayCtx.fillRect(0, 0, W, H);
				const matted = this._create_matted_canvas(effectiveImgCanvas, activeMask);
				this._displayCtx.drawImage(matted, 0, 0);
				break;
			}
			case 'on_white': {
				this._displayCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
				this._displayCtx.fillRect(0, 0, W, H);
				const matted = this._create_matted_canvas(effectiveImgCanvas, activeMask);
				this._displayCtx.drawImage(matted, 0, 0);
				break;
			}
			case 'black_and_white': {
				// Pure mask view
				this._displayCtx.drawImage(activeMask, 0, 0);
				break;
			}
			case 'on_layers': {
				if (this._layersUnderCanvas) {
					this._displayCtx.drawImage(this._layersUnderCanvas, 0, 0);
				}
				const matted = this._create_matted_canvas(effectiveImgCanvas, activeMask);
				this._displayCtx.drawImage(matted, 0, 0);
				break;
			}
			case 'marching_ants': {
				const matted = this._create_matted_canvas(effectiveImgCanvas, activeMask);
				this._displayCtx.drawImage(matted, 0, 0);
				this._draw_marching_ants(activeMask);
				break;
			}
		}

		// Overlay edge detection boundary if "Show Edge" is checked
		if (this._showEdge && this._radius > 0) {
			this._draw_edge_boundary(activeMask);
		}
	}

	_create_matted_canvas(imgCanvas, maskCanvas) {
		const c = document.createElement('canvas');
		c.width = this._width;
		c.height = this._height;
		const ctx = c.getContext('2d');
		
		const imgData = imgCanvas.getContext('2d').getImageData(0, 0, this._width, this._height);
		const maskData = maskCanvas.getContext('2d').getImageData(0, 0, this._width, this._height);
		const imgP = imgData.data;
		const maskP = maskData.data;
		const totalPixels = this._width * this._height;

		for (let i = 0; i < totalPixels; i++) {
			const p = i * 4;
			const mVal = maskP[p] / 255;
			imgP[p + 3] = Math.round(imgP[p + 3] * mVal);
		}

		ctx.putImageData(imgData, 0, 0);
		return c;
	}

	_create_rubylith_overlay(maskCanvas, opacity) {
		const c = document.createElement('canvas');
		c.width = this._width;
		c.height = this._height;
		const ctx = c.getContext('2d');
		const imgData = ctx.createImageData(this._width, this._height);
		const data = imgData.data;

		const maskData = maskCanvas.getContext('2d').getImageData(0, 0, this._width, this._height).data;
		const total = this._width * this._height;

		for (let i = 0; i < total; i++) {
			const p = i * 4;
			const mVal = maskData[p]; // 0 = hidden, 255 = revealed
			const hiddenAmount = (255 - mVal) / 255;
			if (hiddenAmount > 0) {
				data[p] = 255;
				data[p + 1] = 0;
				data[p + 2] = 0;
				data[p + 3] = Math.round(hiddenAmount * opacity * 255);
			}
		}

		ctx.putImageData(imgData, 0, 0);
		return c;
	}

	_draw_edge_boundary(maskCanvas) {
		const ctx = this._displayCtx;
		ctx.save();
		ctx.strokeStyle = '#00e5ff';
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 3]);

		// Quick contour around semi-transparent edges
		const maskPixels = maskCanvas.getContext('2d').getImageData(0, 0, this._width, this._height).data;
		ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
		for (let y = 0; y < this._height; y += 2) {
			const row = y * this._width;
			for (let x = 0; x < this._width; x += 2) {
				const m = maskPixels[(row + x) * 4];
				if (m > 15 && m < 240) {
					ctx.fillRect(x, y, 2, 2);
				}
			}
		}
		ctx.restore();
	}

	_draw_marching_ants(maskCanvas) {
		// Animated marching ants outline
		const ctx = this._displayCtx;
		ctx.save();
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 1;
		ctx.lineDashOffset = this._antsOffset;
		ctx.setLineDash([4, 4]);

		const maskPixels = maskCanvas.getContext('2d').getImageData(0, 0, this._width, this._height).data;
		for (let y = 1; y < this._height - 1; y += 3) {
			const row = y * this._width;
			for (let x = 1; x < this._width - 1; x += 3) {
				const m = maskPixels[(row + x) * 4];
				const mRight = maskPixels[(row + x + 1) * 4];
				const mDown = maskPixels[((y + 1) * this._width + x) * 4];
				if ((m >= 128 && mRight < 128) || (m < 128 && mRight >= 128) ||
					(m >= 128 && mDown < 128) || (m < 128 && mDown >= 128)) {
					ctx.strokeRect(x, y, 2, 2);
				}
			}
		}
		ctx.restore();

		if (!this._antsTimer) {
			this._antsTimer = setInterval(() => {
				this._antsOffset = (this._antsOffset + 1) % 8;
				if (this._viewMode === 'marching_ants') {
					this._render_preview();
				}
			}, 100);
		}
	}

	// -------------------------------------------------------------------------
	// Keyboard Shortcuts
	// -------------------------------------------------------------------------

	_handle_keydown(e) {
		if (e.target && ['input', 'select', 'textarea'].includes(e.target.tagName.toLowerCase())) {
			return;
		}

		if (e.code === 'BracketLeft') {
			e.preventDefault();
			this._brushSize = Math.max(1, this._brushSize - (e.shiftKey ? 10 : 5));
			this._update_ui_brush_values();
		} else if (e.code === 'BracketRight') {
			e.preventDefault();
			this._brushSize = Math.min(500, this._brushSize + (e.shiftKey ? 10 : 5));
			this._update_ui_brush_values();
		} else if (e.code === 'KeyX') {
			e.preventDefault();
			this._toolMode = this._toolMode === 'add' ? 'subtract' : 'add';
			this._update_tool_mode_ui();
		} else if (e.code === 'KeyP') {
			e.preventDefault();
			this._showOriginal = !this._showOriginal;
			const cb = document.getElementById('refine_show_original_cb');
			if (cb) cb.checked = this._showOriginal;
			this._render_preview();
		} else if (e.code === 'KeyJ') {
			e.preventDefault();
			this._showEdge = !this._showEdge;
			const cb = document.getElementById('refine_show_edge_cb');
			if (cb) cb.checked = this._showEdge;
			this._render_preview();
		} else if (e.code === 'KeyW') {
			this._activate_tool_by_id('quick_select');
		} else if (e.code === 'KeyR') {
			this._activate_tool_by_id('refine_edge');
		} else if (e.code === 'KeyB') {
			this._activate_tool_by_id('brush');
		} else if (e.code === 'KeyL') {
			this._activate_tool_by_id('lasso');
		} else if (e.code === 'KeyH') {
			this._activate_tool_by_id('hand');
		} else if (e.code === 'KeyZ') {
			this._activate_tool_by_id('zoom');
		} else if (e.code === 'Space') {
			e.preventDefault();
			this._spaceHeld = true;
			this._update_viewport_cursor();
		} else if (e.key === 'Alt') {
			this._altHeld = true;
			this._update_viewport_cursor();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			this.apply();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			this.close();
		}
	}

	_handle_keyup(e) {
		if (e.code === 'Space') {
			this._spaceHeld = false;
			this._update_viewport_cursor();
		} else if (e.key === 'Alt') {
			this._altHeld = false;
			this._update_viewport_cursor();
		}
	}

	_update_ui_brush_values() {
		const r = document.getElementById('refine_brush_size_range');
		const n = document.getElementById('refine_brush_size_num');
		if (r) r.value = this._brushSize;
		if (n) n.value = this._brushSize;
		this._update_cursor_ring();
	}

	_update_tool_mode_ui() {
		const root = document.getElementById('refine_tool_mode_seg');
		if (!root) return;
		root.querySelectorAll('button').forEach(b => {
			b.classList.toggle('active', b.dataset.mode === this._toolMode);
		});
	}

	_activate_tool_by_id(toolId) {
		const btn = document.querySelector(`#refine_toolbar [data-tool="${toolId}"]`);
		if (btn) btn.click();
	}

	// -------------------------------------------------------------------------
	// Teardown & Reset
	// -------------------------------------------------------------------------

	reset() {
		const p = PRESETS.default;
		this._radius = p.radius;
		this._smartRadius = p.smartRadius;
		this._smooth = p.smooth;
		this._feather = p.feather;
		this._contrast = p.contrast;
		this._shiftEdge = p.shiftEdge;
		this._invert = false;
		this._decontaminate = false;

		// Re-initialize base mask from original
		this._baseMaskCanvas.getContext('2d').clearRect(0, 0, this._width, this._height);
		this._baseMaskCanvas.getContext('2d').drawImage(this._origMaskCanvas, 0, 0);

		this._update_ui_slider_values();
		this._recalculate_working_mask();
		this._render_preview();
	}

	_teardown() {
		if (this._antsTimer) {
			clearInterval(this._antsTimer);
			this._antsTimer = null;
		}
		if (this._debounceFilterTimer) {
			clearTimeout(this._debounceFilterTimer);
			this._debounceFilterTimer = null;
		}
		window.removeEventListener('mousemove', this._handle_pointer_move);
		window.removeEventListener('mouseup', this._handle_pointer_up);
		window.removeEventListener('keydown', this._onKeyDown, true);
		window.removeEventListener('keyup', this._onKeyUp, true);
		window.removeEventListener('resize', this._onResize);
	}

	close() {
		this._teardown();
		this.POP.hide();
	}

	// -------------------------------------------------------------------------
	// Apply Output
	// -------------------------------------------------------------------------

	async apply() {
		const finalMask = this._workingMaskCanvas;
		const targetLayer = this.Base_layers.get_layer(this._layerId, true);
		if (!targetLayer) {
			this.close();
			return;
		}

		try {
			// If Decontaminate Colors is enabled, prepare decontaminated image canvas
			let finalImgCanvas = this._imgCanvas;
			if (this._decontaminate) {
				const imgCtx = this._imgCanvas.getContext('2d');
				const imgPixels = imgCtx.getImageData(0, 0, this._width, this._height).data;
				const maskPixels = finalMask.getContext('2d').getImageData(0, 0, this._width, this._height).data;
				const mGrayscale = new Uint8ClampedArray(this._width * this._height);
				for (let i = 0; i < this._width * this._height; i++) mGrayscale[i] = maskPixels[i * 4];

				const decontamPixels = applyDecontaminateColors(imgPixels, mGrayscale, this._width, this._height, this._decontaminateAmount);
				finalImgCanvas = document.createElement('canvas');
				finalImgCanvas.width = this._width;
				finalImgCanvas.height = this._height;
				const dCtx = finalImgCanvas.getContext('2d');
				const dImgData = dCtx.createImageData(this._width, this._height);
				dImgData.data.set(decontamPixels);
				dCtx.putImageData(dImgData, 0, 0);
			}

			if (this._outputTo === 'mask') {
				// Apply directly to layer mask
				const actions = [];
				if (this._decontaminate) {
					actions.push(new app.Actions.Update_layer_image_action(finalImgCanvas, this._layerId));
				}
				if (targetLayer.mask) {
					actions.push(new app.Actions.Update_layer_mask_image_action(finalMask, this._layerId));
				} else {
					actions.push(new app.Actions.Add_layer_mask_action(this._layerId, true, false));
					actions.push(new app.Actions.Update_layer_mask_image_action(finalMask, this._layerId));
				}
				await app.State.do_action(
					new app.Actions.Bundle_action('refine_edge_mask', 'Refine Edge Mask', actions)
				);
			} else if (this._outputTo === 'selection') {
				// Set document selection
				const selCanvas = document.createElement('canvas');
				selCanvas.width = config.WIDTH;
				selCanvas.height = config.HEIGHT;
				const sCtx = selCanvas.getContext('2d');
				const layerX = targetLayer.x || 0;
				const layerY = targetLayer.y || 0;
				sCtx.drawImage(finalMask, layerX, layerY);
				app.Layers.Base_selection.set_mask_canvas(selCanvas);
			} else if (this._outputTo === 'new_layer_mask') {
				// Duplicate layer and apply mask
				const newName = `${targetLayer.name} (Refined)`;
				const newLayerAction = new app.Actions.Insert_layer_action({
					name: newName,
					type: targetLayer.type,
					data: finalImgCanvas.toDataURL(),
					x: targetLayer.x,
					y: targetLayer.y,
					width: targetLayer.width,
					height: targetLayer.height,
				});
				await app.State.do_action(newLayerAction);
				const createdLayer = config.layer;
				if (createdLayer) {
					await app.State.do_action(
						new app.Actions.Bundle_action('refine_edge_new_mask', 'Refine Edge (New Layer with Mask)', [
							new app.Actions.Add_layer_mask_action(createdLayer.id, true, false),
							new app.Actions.Update_layer_mask_image_action(finalMask, createdLayer.id),
						])
					);
				}
			} else if (this._outputTo === 'new_layer') {
				// Mat layer image with mask and create new transparent layer
				const matted = this._create_matted_canvas(finalImgCanvas, finalMask);
				const newName = `${targetLayer.name} (Refined)`;
				await app.State.do_action(
					new app.Actions.Insert_layer_action({
						name: newName,
						type: 'image',
						data: matted.toDataURL(),
						x: targetLayer.x,
						y: targetLayer.y,
						width: targetLayer.width,
						height: targetLayer.height,
					})
				);
			}

			alertify.success('Refine edge applied successfully.');
		} catch (err) {
			console.error('Refine Edge Error:', err);
			alertify.error('Error applying refine edge: ' + (err?.message || err));
		}

		this.close();
	}
}

function escapeHtml(str) {
	return String(str || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export default Tools_refineEdge_class;
