/**
 * Refine Edge Module for Studio
 * Streamlined, fast, client-side mask edge refinement:
 * - Refine Edge Brush (R) with color-aware guided matting for hair, fur, feathers
 * - Touch-up Brush Tool (B) for manual mask reveal / hide
 * - Hand (H) and Zoom (Z) viewport navigation
 * - View Modes: On Black (default), On White, Overlay, Black & White, Onion Skin
 * - Edge Adjustments: Feather, Shift Edge, Contrast
 * - Color Decontamination: Removes background color spill on hair/fur
 * - Output To: Layer Mask, New Layer with Mask
 */

import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import {
	refineStrokeMatting,
	applyFeather,
	applyContrast,
	applyShiftEdge,
	applyDecontaminateColors,
} from './../../libs/refine-edge/matting.js';

const VIEW_MODES = [
	{ id: 'on_black', name: 'On Black (B)' },
	{ id: 'on_white', name: 'On White (W)' },
	{ id: 'overlay', name: 'Overlay (V)' },
	{ id: 'black_and_white', name: 'Black & White (K)' },
	{ id: 'onion_skin', name: 'Onion Skin (O)' },
];

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
		this._origMaskCanvas = null;     // Initial mask before edits
		this._baseMaskCanvas = null;     // Base mask containing brush strokes
		this._workingMaskCanvas = null;  // Mask with global adjustments applied
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
		this._activeTool = 'refine_edge'; // 'refine_edge' | 'brush' | 'hand' | 'zoom'
		this._toolMode = 'add';           // 'add' | 'subtract'
		this._brushSize = 40;
		this._brushHardness = 100;

		// Properties Panel Parameters
		this._viewMode = 'on_black';
		this._viewOpacity = 100;
		this._showOriginal = false;
		this._feather = 0;
		this._shiftEdge = 0;
		this._contrast = 0;
		this._decontaminate = false;
		this._decontaminateAmount = 100;
		this._outputTo = 'mask';          // 'mask' | 'new_layer_mask'

		// Interaction tracking
		this._isDrawing = false;
		this._strokePoints = [];
		this._debounceFilterTimer = null;
		this._undoStack = [];
		this._redoStack = [];
		this._activeStrokeMaskSnapshot = null;
		this._activeStrokeSubtract = false;

		// Bound event listeners for cleanup
		this._onKeyDown = this._handle_keydown.bind(this);
		this._onKeyUp = this._handle_keyup.bind(this);
		this._onBlur = this._handle_blur.bind(this);
		this._onWheel = this._handle_wheel.bind(this);
		this._onResize = this._handle_resize.bind(this);
		this._onPointerMove = this._handle_pointer_move.bind(this);
		this._onPointerUp = this._handle_pointer_up.bind(this);
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

		// 5. Reset tools & sliders to clean initial defaults
		this._activeTool = 'refine_edge';
		this._toolMode = 'add';
		this._brushSize = 40;
		this._brushHardness = 100;
		this._viewMode = 'on_black';
		this._viewOpacity = 100;
		this._showOriginal = false;
		this._feather = 0;
		this._shiftEdge = 0;
		this._contrast = 0;
		this._decontaminate = false;
		this._decontaminateAmount = 100;
		this._outputTo = 'mask';
		this._undoStack = [];
		this._redoStack = [];
		this._activeStrokeMaskSnapshot = null;
		this._activeStrokeSubtract = false;

		this._recalculate_working_mask();

		// 6. Show dialog
		const _this = this;
		this.POP.show({
			title: 'Refine Edge',
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
						<span class="refine-edge__title">Refine Edge</span>
						<span class="refine-edge__subtitle">${escapeHtml(label)} \u00b7 ${dims}</span>
					</div>
					<div class="refine-edge__header-actions">
						<button type="button" class="refine-edge__btn refine-edge__btn--ghost" id="refine_undo_btn" data-action="undo" title="Undo (Cmd/Ctrl + Z)" disabled>
							<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: -2px; margin-right: 4px; fill: currentColor;"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C20.88 11.02 17.06 8 12.5 8z"/></svg>
							Undo
						</button>
						<button type="button" class="refine-edge__btn refine-edge__btn--ghost" id="refine_redo_btn" data-action="redo" title="Redo (Cmd/Ctrl + Shift + Z)" disabled>
							<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: -2px; margin-right: 4px; fill: currentColor;"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.56 0-8.38 3.02-9.57 7.22l2.37.78c1.05-3.19 4.06-5.5 7.6-5.5 1.96 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
							Redo
						</button>
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
							<button type="button" class="refine-edge__seg-btn ${this._toolMode === 'add' ? 'active' : ''}" data-mode="add" title="Refine / Add (+)">+</button>
							<button type="button" class="refine-edge__seg-btn ${this._toolMode === 'subtract' ? 'active' : ''}" data-mode="subtract" title="Erase / Subtract (-)">−</button>
						</div>
					</div>
					<div class="refine-edge__opt-group">
						<span class="refine-edge__opt-label">Size:</span>
						<input type="range" class="refine-edge__range-input" id="refine_brush_size_range" min="1" max="250" value="${this._brushSize}">
						<input type="number" class="refine-edge__num-input" id="refine_brush_size_num" min="1" max="500" value="${this._brushSize}"> px
					</div>
					<div class="refine-edge__opt-group" id="refine_brush_hardness_group" style="${this._activeTool === 'brush' ? '' : 'display: none;'}">
						<span class="refine-edge__opt-label">Hardness:</span>
						<input type="range" class="refine-edge__range-input" id="refine_brush_hardness_range" min="0" max="100" value="${this._brushHardness}">
						<input type="number" class="refine-edge__num-input" id="refine_brush_hardness_num" min="0" max="100" value="${this._brushHardness}"> %
					</div>
					<div class="refine-edge__opt-hint">
						<span>Hold <b>Option/Alt</b> to invert mode \u00b7 <b>[ ]</b> size \u00b7 <b>Shift [ ]</b> hardness \u00b7 <b>X</b> swap +/−</span>
					</div>
				</div>

				<!-- Main 3-Column Body -->
				<div class="refine-edge__body">
					<!-- Left Toolbar -->
					<div class="refine-edge__toolbar" id="refine_toolbar">
						<button type="button" class="refine-edge__tool-btn active" data-tool="refine_edge" title="Refine Edge Brush Tool (R)">
							<svg viewBox="0 0 24 24" width="24" height="24">
								<!-- Angled Brush Handle -->
								<path d="M15.5 9.5l4.8-4.8a1.6 1.6 0 0 0-2.3-2.3l-4.8 4.8 2.3 2.3z" fill="currentColor"/>
								<!-- Brush Bristle Tip -->
								<path d="M14.2 10.8c-.6 1.8-1.7 3.3-3.1 4.5-1.7 1.4-3.8 2-6 1.8.4-2.1 1.3-4.1 2.8-5.6 1.4-1.3 3.1-2.2 4.9-2.4l1.4 1.7z" fill="currentColor"/>
								<!-- 3 Whisker Strands Sweeping Arc -->
								<path d="M9.8 6.8c-.9 1-1.7 2.2-2.2 3.5l1.4 1.4c.4-.9.9-1.8 1.7-2.5l-.9-2.4zm-2.7 2.3c-.8 1.1-1.4 2.3-1.8 3.7l1.4 1.3c.3-1 .8-2 1.5-2.9l-1.1-2.1zm-2.3 3.1c-.5 1.2-.8 2.5-.9 3.9l1.4 1.1c.1-1.1.4-2.1.9-3.1l-1.4-1.9zm-1.1 4.3c-.2 1.7.2 3.5 1.1 4.9 1.4 1.9 3.6 3.1 6 3.1 1.7 0 3.5-.6 4.8-1.7l-.9-1.3c-1.1.9-2.5 1.4-3.9 1.4-1.9 0-3.6-.9-4.7-2.4-.7-1.1-.9-2.4-.8-3.7l-1.6-.3z" fill="currentColor"/>
							</svg>
						</button>
						<button type="button" class="refine-edge__tool-btn" data-tool="brush" title="Brush Tool (B) - Touch up mask">
							<svg viewBox="0 0 24 24" width="24" height="24">
								<path d="M19.7 4.3a2 2 0 0 0-2.8 0l-7.2 7.2 2.8 2.8 7.2-7.2a2 2 0 0 0 0-2.8z" fill="currentColor"/>
								<path d="M8.6 13.6l2.8 2.8c-.8.8-1.8 1.5-2.8 2-1.3.6-2.7.8-4 .6-.2-1.3 0-2.7.6-4 .5-1.1 1.2-2.1 2-2.8l1.4 1.4z" fill="currentColor"/>
							</svg>
						</button>
						<div class="refine-edge__tool-sep"></div>
						<button type="button" class="refine-edge__tool-btn" data-tool="hand" title="Hand Tool (H / Space)">
							<svg viewBox="0 0 24 24" width="24" height="24">
								<path d="M18 10V5a2 2 0 0 0-4 0v5h-1V2a2 2 0 0 0-4 0v8H8V4a2 2 0 0 0-4 0v11a7 7 0 0 0 14 0v-5z" fill="currentColor"/>
							</svg>
						</button>
						<button type="button" class="refine-edge__tool-btn" data-tool="zoom" title="Zoom Tool (Z / Alt-click to zoom out)">
							<svg viewBox="0 0 24 24" width="24" height="24">
								<path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm1-7H9v2h2v2h1v-2h2V9h-2V7z" fill="currentColor"/>
							</svg>
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
										<input type="checkbox" id="refine_show_original_cb" ${this._showOriginal ? 'checked' : ''}>
										<span>Show Original (P)</span>
									</label>
								</div>
							</div>
						</div>

						<!-- Edge Adjustments Section -->
						<div class="refine-edge__panel">
							<div class="refine-edge__panel-header" data-toggle="panel">
								<span>Edge Adjustments</span>
								<span class="refine-edge__panel-arrow">\u25be</span>
							</div>
							<div class="refine-edge__panel-content">
								<div class="refine-edge__row">
									<span class="refine-edge__row-label">Feather:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_feather_range" min="0" max="20" step="0.5" value="${this._feather}">
										<input type="number" id="refine_feather_num" min="0" max="20" step="0.5" value="${this._feather}"> px
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
									<span class="refine-edge__row-label">Contrast:</span>
									<div class="refine-edge__slider-row">
										<input type="range" id="refine_contrast_range" min="0" max="100" value="${this._contrast}">
										<input type="number" id="refine_contrast_num" min="0" max="100" value="${this._contrast}"> %
									</div>
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
										<option value="new_layer_mask" ${this._outputTo === 'new_layer_mask' ? 'selected' : ''}>New Layer with Mask</option>
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
		root.querySelectorAll('[data-action="undo"]').forEach(btn => {
			btn.addEventListener('click', () => this.undo());
		});
		root.querySelectorAll('[data-action="redo"]').forEach(btn => {
			btn.addEventListener('click', () => this.redo());
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
				this._update_cursor_ring();
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

		linkDual('refine_brush_hardness_range', 'refine_brush_hardness_num', val => {
			this._brushHardness = Math.max(0, Math.min(100, val));
		});

		linkDual('refine_view_opacity_range', 'refine_view_opacity_num', val => {
			this._viewOpacity = Math.max(0, Math.min(100, val));
			this._render_preview();
		});

		linkDual('refine_feather_range', 'refine_feather_num', val => {
			this._feather = Math.max(0, Math.min(20, val));
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

		const showOrigCb = document.getElementById('refine_show_original_cb');
		if (showOrigCb) {
			showOrigCb.addEventListener('change', () => {
				this._showOriginal = showOrigCb.checked;
				this._render_preview();
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

		// 7. Zoom Bar Buttons
		document.getElementById('refine_zoom_in')?.addEventListener('click', () => this._zoom_by(1.25));
		document.getElementById('refine_zoom_out')?.addEventListener('click', () => this._zoom_by(0.8));
		document.getElementById('refine_zoom_fit')?.addEventListener('click', () => this._fit_to_screen());
		document.getElementById('refine_zoom_100')?.addEventListener('click', () => this._set_zoom(1));

		// 8. Viewport Mouse & Pointer Events
		this._viewport.addEventListener('mousedown', this._handle_pointer_down.bind(this));
		window.addEventListener('mousemove', this._onPointerMove);
		window.addEventListener('mouseup', this._onPointerUp);
		this._viewport.addEventListener('wheel', this._onWheel, { passive: false });

		// 9. Global Keyboard & Window Listeners
		window.addEventListener('keydown', this._onKeyDown, true);
		window.addEventListener('keyup', this._onKeyUp, true);
		window.addEventListener('blur', this._onBlur);
		window.addEventListener('resize', this._onResize);

		this._update_cursor_ring();
		this._update_undo_redo_ui();
	}

	_update_ui_slider_values() {
		const setVal = (rangeId, numId, val) => {
			const r = document.getElementById(rangeId);
			const n = document.getElementById(numId);
			if (r) r.value = val;
			if (n) n.value = val;
		};
		setVal('refine_feather_range', 'refine_feather_num', this._feather);
		setVal('refine_contrast_range', 'refine_contrast_num', this._contrast);
		setVal('refine_shift_range', 'refine_shift_num', this._shiftEdge);
		setVal('refine_decontam_range', 'refine_decontam_num', this._decontaminateAmount);
		const dcb = document.getElementById('refine_decontam_cb');
		if (dcb) dcb.checked = this._decontaminate;
		const socb = document.getElementById('refine_show_original_cb');
		if (socb) socb.checked = this._showOriginal;
	}

	_set_active_tool(tool) {
		this._activeTool = tool;
		this._update_viewport_cursor();
		const hardGroup = document.getElementById('refine_brush_hardness_group');
		if (hardGroup) {
			hardGroup.style.display = (tool === 'brush') ? 'flex' : 'none';
		}
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

		if (this._is_subtract_mode()) {
			this._cursorRing.classList.add('is-subtract');
		} else {
			this._cursorRing.classList.remove('is-subtract');
		}

		if (e) {
			const rect = this._viewport.getBoundingClientRect();
			this._cursorRing.style.left = (e.clientX - rect.left) + 'px';
			this._cursorRing.style.top = (e.clientY - rect.top) + 'px';
		}
	}

	_update_undo_redo_ui() {
		const uBtn = document.getElementById('refine_undo_btn');
		const rBtn = document.getElementById('refine_redo_btn');
		if (uBtn) {
			uBtn.disabled = this._undoStack.length === 0;
		}
		if (rBtn) {
			rBtn.disabled = this._redoStack.length === 0;
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

		const isSubtract = (e.altKey || this._altHeld) ? (this._toolMode !== 'subtract') : (this._toolMode === 'subtract');
		this._activeStrokeSubtract = isSubtract;

		// Snapshot base mask for undo
		this._activeStrokeMaskSnapshot = document.createElement('canvas');
		this._activeStrokeMaskSnapshot.width = this._width;
		this._activeStrokeMaskSnapshot.height = this._height;
		this._activeStrokeMaskSnapshot.getContext('2d').drawImage(this._baseMaskCanvas, 0, 0);

		if (this._activeTool === 'refine_edge') {
			this._strokePoints = [pt];
			this._apply_refine_brush_dab(pt, null);
		} else if (this._activeTool === 'brush') {
			this._strokePoints = [pt];
			this._apply_standard_brush_dab(pt, null);
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
		}
	}

	_handle_pointer_up() {
		if (this._isPanning) {
			this._isPanning = false;
			this._update_viewport_cursor();
			return;
		}

		if (!this._isDrawing) return;
		this._isDrawing = false;

		if (this._activeTool === 'refine_edge') {
			this._finish_refine_brush_stroke();
		}

		// Commit stroke snapshot to undo stack
		if (this._activeStrokeMaskSnapshot) {
			this._undoStack.push(this._activeStrokeMaskSnapshot);
			if (this._undoStack.length > 30) {
				this._undoStack.shift();
			}
			this._redoStack = [];
			this._activeStrokeMaskSnapshot = null;
			this._update_undo_redo_ui();
		}

		this._strokePoints = [];
		this._recalculate_working_mask();
		this._render_preview();
	}

	// -------------------------------------------------------------------------
	// Brush & Matting Logic
	// -------------------------------------------------------------------------

	_is_subtract_mode() {
		if (this._isDrawing) {
			return this._activeStrokeSubtract;
		}
		return (this._toolMode === 'subtract') !== (this._altHeld);
	}

	_get_brush_dab(size, hardness, isSub) {
		const rad = size / 2;
		const d = Math.max(2, Math.ceil(size));
		const canvas = document.createElement('canvas');
		canvas.width = d;
		canvas.height = d;
		const ctx = canvas.getContext('2d');
		const cx = d / 2;
		const cy = d / 2;

		const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
		const innerStop = Math.max(0, Math.min(0.99, hardness / 100));
		const rgb = isSub ? '0, 0, 0' : '255, 255, 255';

		grad.addColorStop(0, `rgba(${rgb}, 1)`);
		grad.addColorStop(innerStop, `rgba(${rgb}, 1)`);
		grad.addColorStop(1, `rgba(${rgb}, 0)`);

		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(cx, cy, rad, 0, Math.PI * 2);
		ctx.fill();

		return canvas;
	}

	_apply_standard_brush_dab(pt, prevPt) {
		const ctx = this._baseMaskCanvas.getContext('2d');
		const rad = this._brushSize / 2;
		const isSub = this._is_subtract_mode();
		const color = isSub ? '#000000' : '#ffffff';

		if (this._brushHardness >= 98) {
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
		} else {
			const dab = this._get_brush_dab(this._brushSize, this._brushHardness, isSub);
			const d = dab.width;
			const r = d / 2;

			ctx.save();
			ctx.globalCompositeOperation = 'source-over';

			if (!prevPt) {
				ctx.drawImage(dab, pt.x - r, pt.y - r);
			} else {
				const dx = pt.x - prevPt.x;
				const dy = pt.y - prevPt.y;
				const dist = Math.hypot(dx, dy);
				const step = Math.max(1, rad * 0.25);
				const steps = Math.ceil(dist / step);
				for (let s = 1; s <= steps; s++) {
					const t = s / steps;
					const ix = prevPt.x + dx * t;
					const iy = prevPt.y + dy * t;
					ctx.drawImage(dab, ix - r, iy - r);
				}
			}
			ctx.restore();
		}

		this._recalculate_working_mask();
		this._render_preview();
	}

	_apply_refine_brush_dab(pt, prevPt) {
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
			isSub
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

	// -------------------------------------------------------------------------
	// Mask Recalculation Pipeline
	// -------------------------------------------------------------------------

	_schedule_recalculate() {
		if (this._debounceFilterTimer) {
			clearTimeout(this._debounceFilterTimer);
		}
		this._debounceFilterTimer = setTimeout(() => {
			this._recalculate_working_mask();
			this._render_preview();
		}, 30);
	}

	_recalculate_working_mask() {
		const baseCtx = this._baseMaskCanvas.getContext('2d');
		const baseData = baseCtx.getImageData(0, 0, this._width, this._height);
		const N = this._width * this._height;
		let mask = new Uint8ClampedArray(N);

		for (let i = 0; i < N; i++) {
			mask[i] = baseData.data[i * 4];
		}

		// 1. Feather
		if (this._feather > 0) {
			mask = applyFeather(mask, this._width, this._height, this._feather);
		}

		// 2. Shift Edge
		if (this._shiftEdge !== 0) {
			mask = applyShiftEdge(mask, this._width, this._height, this._shiftEdge);
		}

		// 3. Contrast
		if (this._contrast > 0) {
			mask = applyContrast(mask, this._width, this._height, this._contrast);
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
			case 'overlay': {
				// Photoshop Rubylith: image drawn normally, unselected area tinted red
				this._displayCtx.drawImage(effectiveImgCanvas, 0, 0);
				const rubylith = this._create_rubylith_overlay(activeMask, opacity);
				this._displayCtx.drawImage(rubylith, 0, 0);
				break;
			}
			case 'black_and_white': {
				// Pure mask view
				this._displayCtx.drawImage(activeMask, 0, 0);
				break;
			}
			case 'onion_skin': {
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
			const mVal = maskData[p];
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

	// -------------------------------------------------------------------------
	// Keyboard Shortcuts
	// -------------------------------------------------------------------------

	_handle_keydown(e) {
		if (e.target && ['input', 'select', 'textarea'].includes(e.target.tagName.toLowerCase())) {
			return;
		}

		const isMac = (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0) ||
			(navigator.userAgent && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
		const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

		// 1. Undo / Redo shortcuts
		if (cmdOrCtrl && !e.altKey && e.code === 'KeyZ') {
			e.preventDefault();
			e.stopPropagation();
			if (e.shiftKey) {
				this.redo();
			} else {
				this.undo();
			}
			return;
		} else if (cmdOrCtrl && !e.altKey && e.code === 'KeyY') {
			e.preventDefault();
			e.stopPropagation();
			this.redo();
			return;
		}

		// 2. Brush size ([ / ]) & Hardness (Shift + [ / ])
		if (e.code === 'BracketLeft') {
			e.preventDefault();
			if (e.shiftKey) {
				this._brushHardness = Math.max(0, this._brushHardness - 25);
				this._update_ui_brush_values();
			} else {
				this._brushSize = Math.max(1, this._brushSize - 5);
				this._update_ui_brush_values();
			}
		} else if (e.code === 'BracketRight') {
			e.preventDefault();
			if (e.shiftKey) {
				this._brushHardness = Math.min(100, this._brushHardness + 25);
				this._update_ui_brush_values();
			} else {
				this._brushSize = Math.min(500, this._brushSize + 5);
				this._update_ui_brush_values();
			}
		} else if (e.code === 'KeyX') {
			e.preventDefault();
			this._toolMode = this._toolMode === 'add' ? 'subtract' : 'add';
			this._update_tool_mode_ui();
			this._update_cursor_ring();
		} else if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
			if (!this._altHeld) {
				this._altHeld = true;
				this._update_tool_mode_ui();
				this._update_viewport_cursor();
				this._update_cursor_ring();
			}
		} else if (e.code === 'KeyP') {
			e.preventDefault();
			this._showOriginal = !this._showOriginal;
			const cb = document.getElementById('refine_show_original_cb');
			if (cb) cb.checked = this._showOriginal;
			this._render_preview();
		} else if (e.code === 'KeyR') {
			this._activate_tool_by_id('refine_edge');
		} else if (e.code === 'KeyB') {
			this._activate_tool_by_id('brush');
		} else if (e.code === 'KeyH') {
			this._activate_tool_by_id('hand');
		} else if (e.code === 'KeyZ' && !cmdOrCtrl) {
			this._activate_tool_by_id('zoom');
		} else if (e.code === 'Space') {
			e.preventDefault();
			this._spaceHeld = true;
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
		} else if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
			this._altHeld = false;
			this._update_tool_mode_ui();
			this._update_viewport_cursor();
			this._update_cursor_ring();
		}
	}

	_handle_blur() {
		this._altHeld = false;
		this._spaceHeld = false;
		this._update_tool_mode_ui();
		this._update_viewport_cursor();
		this._update_cursor_ring();
	}

	_update_ui_brush_values() {
		const r = document.getElementById('refine_brush_size_range');
		const n = document.getElementById('refine_brush_size_num');
		if (r) r.value = this._brushSize;
		if (n) n.value = this._brushSize;
		const hr = document.getElementById('refine_brush_hardness_range');
		const hn = document.getElementById('refine_brush_hardness_num');
		if (hr) hr.value = this._brushHardness;
		if (hn) hn.value = this._brushHardness;
		this._update_cursor_ring();
	}

	_update_tool_mode_ui() {
		const root = document.getElementById('refine_tool_mode_seg');
		if (!root) return;
		const isSub = this._is_subtract_mode();
		root.querySelectorAll('button').forEach(b => {
			const mode = b.getAttribute('data-mode');
			b.classList.toggle('active', isSub ? mode === 'subtract' : mode === 'add');
		});
	}

	_activate_tool_by_id(toolId) {
		const btn = document.querySelector(`#refine_toolbar [data-tool="${toolId}"]`);
		if (btn) btn.click();
	}

	// -------------------------------------------------------------------------
	// Undo / Redo
	// -------------------------------------------------------------------------

	undo() {
		if (this._undoStack.length === 0) return;

		const currentSnapshot = document.createElement('canvas');
		currentSnapshot.width = this._width;
		currentSnapshot.height = this._height;
		currentSnapshot.getContext('2d').drawImage(this._baseMaskCanvas, 0, 0);
		this._redoStack.push(currentSnapshot);

		const prevSnapshot = this._undoStack.pop();
		const ctx = this._baseMaskCanvas.getContext('2d');
		ctx.clearRect(0, 0, this._width, this._height);
		ctx.drawImage(prevSnapshot, 0, 0);

		this._recalculate_working_mask();
		this._render_preview();
		this._update_undo_redo_ui();
	}

	redo() {
		if (this._redoStack.length === 0) return;

		const currentSnapshot = document.createElement('canvas');
		currentSnapshot.width = this._width;
		currentSnapshot.height = this._height;
		currentSnapshot.getContext('2d').drawImage(this._baseMaskCanvas, 0, 0);
		this._undoStack.push(currentSnapshot);

		const nextSnapshot = this._redoStack.pop();
		const ctx = this._baseMaskCanvas.getContext('2d');
		ctx.clearRect(0, 0, this._width, this._height);
		ctx.drawImage(nextSnapshot, 0, 0);

		this._recalculate_working_mask();
		this._render_preview();
		this._update_undo_redo_ui();
	}

	// -------------------------------------------------------------------------
	// Teardown & Reset
	// -------------------------------------------------------------------------

	reset() {
		// Snapshot before reset so user can undo accidental reset
		const snapshot = document.createElement('canvas');
		snapshot.width = this._width;
		snapshot.height = this._height;
		snapshot.getContext('2d').drawImage(this._baseMaskCanvas, 0, 0);
		this._undoStack.push(snapshot);
		this._redoStack = [];
		this._update_undo_redo_ui();

		this._feather = 0;
		this._shiftEdge = 0;
		this._contrast = 0;
		this._decontaminate = false;
		this._decontaminateAmount = 100;
		this._showOriginal = false;

		// Re-initialize base mask from original
		this._baseMaskCanvas.getContext('2d').clearRect(0, 0, this._width, this._height);
		this._baseMaskCanvas.getContext('2d').drawImage(this._origMaskCanvas, 0, 0);

		this._update_ui_slider_values();
		this._recalculate_working_mask();
		this._render_preview();
	}

	_teardown() {
		if (this._debounceFilterTimer) {
			clearTimeout(this._debounceFilterTimer);
			this._debounceFilterTimer = null;
		}
		window.removeEventListener('mousemove', this._onPointerMove);
		window.removeEventListener('mouseup', this._onPointerUp);
		window.removeEventListener('keydown', this._onKeyDown, true);
		window.removeEventListener('keyup', this._onKeyUp, true);
		window.removeEventListener('blur', this._onBlur);
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
