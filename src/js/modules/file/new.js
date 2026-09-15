import app from './../../app.js';
import config from './../../config.js';
import Base_gui_class from './../../core/base-gui.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Dialog_class from './../../libs/popup.js';
import Tools_settings_class from './../tools/settings.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import {
	DOCUMENT_PRESETS,
	CATEGORIES,
	UNITS,
	RESOLUTION_PRESETS,
	convertToPixels,
	convertFromPixels,
	convertUnits,
	formatPresetDimensions,
} from './../../core/document-presets-data.js';

const RECENT_STORAGE_KEY = 'visteras_recent_document_presets';

/**
 * Manages File -> New Document with Photoshop-inspired Presets System
 */
class File_new_class {

	constructor() {
		this.Base_gui = new Base_gui_class();
		this.Base_layers = new Base_layers_class();
		this.POP = new Dialog_class();
		this.Helper = new Helper_class();
		this.Tools_settings = new Tools_settings_class();

		this.activeCategory = 'photo';
		this.currentPreset = null;
		this.currentUnit = 'in';
		this.currentResolution = 300;
		this.currentOrientation = 'portrait'; // 'portrait' | 'landscape'
		this.currentBackground = 'white'; // 'white' | 'transparent' | 'custom'
		this.customBgColor = '#ffffff';
	}

	get_recent_presets() {
		try {
			const raw = localStorage.getItem(RECENT_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed) && parsed.length > 0) {
					return parsed;
				}
			}
		} catch (e) { /* ignore */ }

		// Default initial recents if none saved
		return [
			DOCUMENT_PRESETS.photo[3], // 8x10
			DOCUMENT_PRESETS.print[0], // Letter
			DOCUMENT_PRESETS.web[3],   // Full HD
			DOCUMENT_PRESETS.social[0],// IG Square
		].filter(Boolean);
	}

	save_recent_preset(preset) {
		if (!preset || !preset.width || !preset.height) return;
		try {
			let recents = this.get_recent_presets();
			recents = recents.filter(p => !(p.name === preset.name && p.width === preset.width && p.height === preset.height && p.unit === preset.unit));
			recents.unshift({
				id: 'recent_' + Date.now(),
				name: preset.name || 'Custom',
				width: preset.width,
				height: preset.height,
				unit: preset.unit || 'px',
				resolution: preset.resolution || 72,
				category: 'recent',
				description: formatPresetDimensions(preset)
			});
			if (recents.length > 8) recents = recents.slice(0, 8);
			localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recents));
		} catch (e) { /* ignore */ }
	}

	async get_clipboard_dimensions() {
		if (config._internal_clipboard && config._internal_clipboard.width > 0 && config._internal_clipboard.height > 0) {
			return {
				width: config._internal_clipboard.width,
				height: config._internal_clipboard.height
			};
		}
		if (navigator.clipboard && navigator.clipboard.read) {
			try {
				const items = await navigator.clipboard.read();
				for (const item of items) {
					const imageType = item.types.find(t => t.startsWith('image/'));
					if (imageType) {
						const blob = await item.getType(imageType);
						const imgBitmap = await createImageBitmap(blob);
						return {
							width: imgBitmap.width,
							height: imgBitmap.height
						};
					}
				}
			} catch (err) { /* ignore */ }
		}
		return null;
	}

	calc_aspect_style(w, h) {
		const width = parseFloat(w) || 1;
		const height = parseFloat(h) || 1;
		const ratio = width / height;

		let boxW = 60;
		let boxH = 60;

		if (ratio >= 1) {
			boxW = 68;
			boxH = Math.max(16, Math.min(60, Math.round(68 / ratio)));
		} else {
			boxH = 60;
			boxW = Math.max(16, Math.min(68, Math.round(60 * ratio)));
		}

		return `width: ${boxW}px; height: ${boxH}px;`;
	}

	render_preset_cards(category) {
		let presets = [];
		if (category === 'recent') {
			presets = this.get_recent_presets();
		} else {
			presets = DOCUMENT_PRESETS[category] || [];
		}

		if (presets.length === 0) {
			return `<div class="text_muted" style="padding: 40px; text-align: center;">No presets available in this category.</div>`;
		}

		return presets.map((p, idx) => {
			const isSelected = this.currentPreset && (this.currentPreset.id === p.id || (this.currentPreset.name === p.name && this.currentPreset.width === p.width && this.currentPreset.height === p.height));
			const aspectStyle = this.calc_aspect_style(p.width, p.height);
			const dimsLabel = formatPresetDimensions(p);

			return `
				<div class="new_doc_card ${isSelected ? 'active' : ''}" data-id="${p.id || ('p_' + idx)}" data-category="${category}" data-index="${idx}">
					<div class="new_doc_card_preview_wrap">
						<div class="new_doc_card_aspect_box" style="${aspectStyle}"></div>
					</div>
					<div class="new_doc_card_name">${this.Helper.escapeHtml(p.name)}</div>
					<div class="new_doc_card_dims">${dimsLabel}</div>
				</div>
			`;
		}).join('');
	}

	generate_modal_html() {
		const categoriesHtml = CATEGORIES.map(cat => {
			const isActive = cat.id === this.activeCategory;
			return `<button type="button" class="new_doc_cat_btn ${isActive ? 'active' : ''}" data-cat="${cat.id}">${cat.label}</button>`;
		}).join('');

		const presetsGridHtml = this.render_preset_cards(this.activeCategory);

		const defaultName = app.Documents ? ('Untitled-' + app.Documents.auto_title_count) : 'Untitled-1';
		const initialWidth = this.currentPreset ? this.currentPreset.width : 8.5;
		const initialHeight = this.currentPreset ? this.currentPreset.height : 11;
		const initialUnit = this.currentPreset ? this.currentPreset.unit : 'in';
		const initialRes = this.currentPreset ? (this.currentPreset.resolution || 300) : 300;
		const initialOrientation = (initialWidth >= initialHeight) ? 'landscape' : 'portrait';
		this.currentOrientation = initialOrientation;

		const unitsOptions = UNITS.map(u => `<option value="${u.id}" ${u.id === initialUnit ? 'selected' : ''}>${u.label}</option>`).join('');

		return `
			<div class="new_doc_container">
				<div class="new_doc_header">
					<div class="new_doc_title">New Document</div>
					<button type="button" class="new_doc_close_btn" id="new_doc_btn_close" title="Close">&times;</button>
				</div>
				<div class="new_doc_categories" id="new_doc_categories_bar">
					${categoriesHtml}
				</div>
				<div class="new_doc_body">
					<div class="new_doc_presets_container" id="new_doc_presets_container">
						<div class="new_doc_presets_grid" id="new_doc_presets_grid">
							${presetsGridHtml}
						</div>
					</div>
					<div class="new_doc_details_sidebar">
						<div class="new_doc_details_content">
							<div class="new_doc_form_group">
								<label for="new_doc_name">Name</label>
								<input type="text" id="new_doc_name" class="new_doc_input" value="${defaultName}" spellcheck="false" />
							</div>

							<div class="new_doc_row">
								<div class="new_doc_form_group">
									<label for="new_doc_width">Width</label>
									<input type="number" step="any" min="1" id="new_doc_width" class="new_doc_input" value="${initialWidth}" />
								</div>
								<div class="new_doc_form_group">
									<label for="new_doc_height">Height</label>
									<input type="number" step="any" min="1" id="new_doc_height" class="new_doc_input" value="${initialHeight}" />
								</div>
							</div>

							<div class="new_doc_form_group">
								<label for="new_doc_unit">Units</label>
								<select id="new_doc_unit" class="new_doc_select">
									${unitsOptions}
								</select>
							</div>

							<div class="new_doc_row">
								<div class="new_doc_form_group">
									<label for="new_doc_resolution">Resolution</label>
									<input type="number" step="1" min="1" max="2400" id="new_doc_resolution" class="new_doc_input" value="${initialRes}" />
								</div>
								<div class="new_doc_form_group">
									<label for="new_doc_res_type">Preset</label>
									<select id="new_doc_res_type" class="new_doc_select">
										<option value="72" ${initialRes === 72 ? 'selected' : ''}>72 PPI (Screen)</option>
										<option value="96" ${initialRes === 96 ? 'selected' : ''}>96 PPI</option>
										<option value="150" ${initialRes === 150 ? 'selected' : ''}>150 PPI (Medium)</option>
										<option value="300" ${initialRes === 300 ? 'selected' : ''}>300 PPI (Print)</option>
										<option value="custom" ${![72, 96, 150, 300].includes(initialRes) ? 'selected' : ''}>Custom</option>
									</select>
								</div>
							</div>

							<div class="new_doc_form_group">
								<label>Orientation</label>
								<div class="new_doc_orient_group">
									<button type="button" class="new_doc_orient_btn ${initialOrientation === 'portrait' ? 'active' : ''}" id="new_doc_orient_portrait" title="Portrait">
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="2"/></svg>
										Portrait
									</button>
									<button type="button" class="new_doc_orient_btn ${initialOrientation === 'landscape' ? 'active' : ''}" id="new_doc_orient_landscape" title="Landscape">
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>
										Landscape
									</button>
								</div>
							</div>

							<div class="new_doc_form_group">
								<label for="new_doc_bg">Background</label>
								<div class="new_doc_bg_row">
									<select id="new_doc_bg" class="new_doc_select" style="flex: 1;">
										<option value="white" ${this.currentBackground === 'white' ? 'selected' : ''}>White</option>
										<option value="transparent" ${this.currentBackground === 'transparent' ? 'selected' : ''}>Transparent</option>
										<option value="custom" ${this.currentBackground === 'custom' ? 'selected' : ''}>Background Color</option>
									</select>
									<input type="color" id="new_doc_color_picker" class="new_doc_color_picker ${this.currentBackground === 'custom' ? '' : 'hidden'}" value="${this.customBgColor}" title="Select Color" />
								</div>
							</div>
						</div>

						<div class="new_doc_actions">
							<button type="button" class="new_doc_btn_cancel" id="new_doc_btn_cancel">Cancel</button>
							<button type="button" class="new_doc_btn_create" id="new_doc_btn_create">Create</button>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	async new() {
		// Default active preset
		if (!this.currentPreset) {
			this.currentPreset = DOCUMENT_PRESETS.photo[3]; // 8x10
			this.activeCategory = 'photo';
			this.currentUnit = 'in';
			this.currentResolution = 300;
		}

		const _this = this;

		const settings = {
			title: 'New Document',
			className: 'new_doc_popup',
			params: [
				{
					html: this.generate_modal_html()
				}
			],
			on_load: function () {
				_this.bind_modal_events();
			}
		};

		this.POP.show(settings);
	}

	bind_modal_events() {
		const modalEl = document.querySelector('#popups .popup.new_doc_popup');
		if (!modalEl) return;

		const catButtons = modalEl.querySelectorAll('.new_doc_cat_btn');
		const presetsGrid = modalEl.querySelector('#new_doc_presets_grid');
		const widthInput = modalEl.querySelector('#new_doc_width');
		const heightInput = modalEl.querySelector('#new_doc_height');
		const unitSelect = modalEl.querySelector('#new_doc_unit');
		const resInput = modalEl.querySelector('#new_doc_resolution');
		const resTypeSelect = modalEl.querySelector('#new_doc_res_type');
		const orientPortraitBtn = modalEl.querySelector('#new_doc_orient_portrait');
		const orientLandscapeBtn = modalEl.querySelector('#new_doc_orient_landscape');
		const bgSelect = modalEl.querySelector('#new_doc_bg');
		const colorPicker = modalEl.querySelector('#new_doc_color_picker');
		const createBtn = modalEl.querySelector('#new_doc_btn_create');
		const cancelBtn = modalEl.querySelector('#new_doc_btn_cancel');
		const closeBtn = modalEl.querySelector('#new_doc_btn_close');

		let currentUnitValue = unitSelect ? unitSelect.value : (this.currentPreset ? this.currentPreset.unit : 'in');

		const updateOrientationState = () => {
			const w = parseFloat(widthInput ? widthInput.value : 0) || 0;
			const h = parseFloat(heightInput ? heightInput.value : 0) || 0;
			if (w >= h) {
				this.currentOrientation = 'landscape';
				if (orientPortraitBtn) orientPortraitBtn.classList.remove('active');
				if (orientLandscapeBtn) orientLandscapeBtn.classList.add('active');
			} else {
				this.currentOrientation = 'portrait';
				if (orientPortraitBtn) orientPortraitBtn.classList.add('active');
				if (orientLandscapeBtn) orientLandscapeBtn.classList.remove('active');
			}
		};

		// Category navigation
		catButtons.forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				catButtons.forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				this.activeCategory = btn.getAttribute('data-cat');
				if (presetsGrid) {
					presetsGrid.innerHTML = this.render_preset_cards(this.activeCategory);
					this.bind_preset_card_events(presetsGrid, widthInput, heightInput, unitSelect, resInput, resTypeSelect, updateOrientationState, (u) => { currentUnitValue = u; });
				}
			});
		});

		this.bind_preset_card_events(presetsGrid, widthInput, heightInput, unitSelect, resInput, resTypeSelect, updateOrientationState, (u) => { currentUnitValue = u; });

		// Width and height manual input changes
		if (widthInput) widthInput.addEventListener('input', updateOrientationState);
		if (heightInput) heightInput.addEventListener('input', updateOrientationState);

		// Units conversion
		if (unitSelect) {
			unitSelect.addEventListener('change', () => {
				const targetUnit = unitSelect.value;
				const currentRes = parseFloat(resInput ? resInput.value : 72) || 72;
				const currentW = parseFloat(widthInput ? widthInput.value : 0) || 0;
				const currentH = parseFloat(heightInput ? heightInput.value : 0) || 0;

				const convertedW = convertUnits(currentW, currentUnitValue, targetUnit, currentRes);
				const convertedH = convertUnits(currentH, currentUnitValue, targetUnit, currentRes);

				if (widthInput) widthInput.value = convertedW;
				if (heightInput) heightInput.value = convertedH;
				currentUnitValue = targetUnit;
				this.currentUnit = targetUnit;
				updateOrientationState();
			});
		}

		// Resolution input changes
		if (resInput) {
			resInput.addEventListener('input', () => {
				const val = parseFloat(resInput.value) || 72;
				this.currentResolution = val;
				if (resTypeSelect) {
					if ([72, 96, 150, 300].includes(val)) {
						resTypeSelect.value = String(val);
					} else {
						resTypeSelect.value = 'custom';
					}
				}
			});
		}

		if (resTypeSelect) {
			resTypeSelect.addEventListener('change', () => {
				const val = resTypeSelect.value;
				if (val !== 'custom') {
					if (resInput) resInput.value = val;
					this.currentResolution = parseFloat(val);
				}
			});
		}

		// Orientation toggles
		if (orientPortraitBtn) {
			orientPortraitBtn.addEventListener('click', (e) => {
				e.preventDefault();
				const w = parseFloat(widthInput ? widthInput.value : 0) || 0;
				const h = parseFloat(heightInput ? heightInput.value : 0) || 0;
				if (w > h) {
					if (widthInput) widthInput.value = h;
					if (heightInput) heightInput.value = w;
				}
				this.currentOrientation = 'portrait';
				orientPortraitBtn.classList.add('active');
				if (orientLandscapeBtn) orientLandscapeBtn.classList.remove('active');
			});
		}

		if (orientLandscapeBtn) {
			orientLandscapeBtn.addEventListener('click', (e) => {
				e.preventDefault();
				const w = parseFloat(widthInput ? widthInput.value : 0) || 0;
				const h = parseFloat(heightInput ? heightInput.value : 0) || 0;
				if (h > w) {
					if (widthInput) widthInput.value = h;
					if (heightInput) heightInput.value = w;
				}
				this.currentOrientation = 'landscape';
				orientLandscapeBtn.classList.add('active');
				if (orientPortraitBtn) orientPortraitBtn.classList.remove('active');
			});
		}

		// Background selector
		if (bgSelect) {
			bgSelect.addEventListener('change', () => {
				this.currentBackground = bgSelect.value;
				if (colorPicker) {
					if (bgSelect.value === 'custom') {
						colorPicker.classList.remove('hidden');
					} else {
						colorPicker.classList.add('hidden');
					}
				}
			});
		}

		if (colorPicker) {
			colorPicker.addEventListener('input', () => {
				this.customBgColor = colorPicker.value;
			});
		}

		// Actions
		if (createBtn) {
			createBtn.addEventListener('click', (e) => {
				e.preventDefault();
				this.submit_create();
			});
		}

		const handleClose = (e) => {
			if (e) {
				e.preventDefault();
				e.stopPropagation();
			}
			if (this.POP && typeof this.POP.hide === 'function') {
				this.POP.hide(false);
			} else if (window.POP && typeof window.POP.hide === 'function') {
				window.POP.hide(false);
			} else {
				const popup = document.querySelector('#popups .popup.new_doc_popup');
				if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
			}
		};

		if (cancelBtn) {
			cancelBtn.addEventListener('click', handleClose);
		}

		if (closeBtn) {
			closeBtn.addEventListener('click', handleClose);
		}

		modalEl.querySelectorAll('#new_doc_btn_close, .new_doc_close_btn, [data-id="popup_close"]').forEach(btn => {
			btn.addEventListener('click', handleClose);
		});

		// Enter / Escape
		modalEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
				e.preventDefault();
				this.submit_create();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				handleClose(e);
			}
		});
	}

	bind_preset_card_events(presetsGrid, widthInput, heightInput, unitSelect, resInput, resTypeSelect, updateOrientationState, onUnitUpdate) {
		if (!presetsGrid) return;
		const cards = presetsGrid.querySelectorAll('.new_doc_card');

		cards.forEach(card => {
			card.addEventListener('click', (e) => {
				e.preventDefault();
				cards.forEach(c => c.classList.remove('active'));
				card.classList.add('active');

				const cat = card.getAttribute('data-category');
				const idx = parseInt(card.getAttribute('data-index'));
				let preset = null;
				if (cat === 'recent') {
					preset = this.get_recent_presets()[idx];
				} else if (DOCUMENT_PRESETS[cat]) {
					preset = DOCUMENT_PRESETS[cat][idx];
				}

				if (preset) {
					this.currentPreset = preset;
					if (widthInput) widthInput.value = preset.width;
					if (heightInput) heightInput.value = preset.height;
					if (unitSelect) {
						unitSelect.value = preset.unit || 'px';
						if (onUnitUpdate) onUnitUpdate(preset.unit || 'px');
					}
					if (resInput) resInput.value = preset.resolution || 72;
					if (resTypeSelect) {
						if ([72, 96, 150, 300].includes(preset.resolution)) {
							resTypeSelect.value = String(preset.resolution);
						} else {
							resTypeSelect.value = 'custom';
						}
					}
					const nameInput = document.querySelector('#new_doc_name');
					if (nameInput && (!nameInput.value || nameInput.value.startsWith('Untitled-'))) {
						nameInput.value = preset.name;
					}
					if (updateOrientationState) {
						updateOrientationState();
					}
				}
			});
		});
	}

	submit_create() {
		const modalEl = document.querySelector('#popups .popup.new_doc_popup');
		if (!modalEl) return;

		const nameInput = modalEl.querySelector('#new_doc_name');
		const widthInput = modalEl.querySelector('#new_doc_width');
		const heightInput = modalEl.querySelector('#new_doc_height');
		const unitSelect = modalEl.querySelector('#new_doc_unit');
		const resInput = modalEl.querySelector('#new_doc_resolution');
		const bgSelect = modalEl.querySelector('#new_doc_bg');
		const colorPicker = modalEl.querySelector('#new_doc_color_picker');

		const rawW = parseFloat(widthInput ? widthInput.value : 800) || 800;
		const rawH = parseFloat(heightInput ? heightInput.value : 600) || 600;
		const unit = unitSelect ? unitSelect.value : 'px';
		const ppi = parseFloat(resInput ? resInput.value : 72) || 72;
		const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Untitled';
		const bgType = bgSelect ? bgSelect.value : 'white';
		const customColor = (colorPicker && colorPicker.value) ? colorPicker.value : '#ffffff';

		const widthPx = Math.max(1, Math.round(convertToPixels(rawW, unit, ppi)));
		const heightPx = Math.max(1, Math.round(convertToPixels(rawH, unit, ppi)));

		this.save_recent_preset({
			name: name,
			width: rawW,
			height: rawH,
			unit: unit,
			resolution: ppi,
		});

		this.POP.hide(true);

		this.new_handler({
			name: name,
			width: widthPx,
			height: heightPx,
			transparency: bgType === 'transparent',
			backgroundColor: bgType === 'custom' ? customColor : (bgType === 'white' ? '#ffffff' : null),
			resolution: ppi,
			unit: unit,
		});
	}

	async new_handler(options) {
		const width = parseInt(options.width) || config.WIDTH || 800;
		const height = parseInt(options.height) || config.HEIGHT || 600;
		const transparency = !!options.transparency;
		const bgColor = options.backgroundColor || (transparency ? null : '#ffffff');
		const ppi = options.resolution || 72;
		const title = options.name || 'Untitled';

		if (this.Tools_settings && typeof this.Tools_settings.save_setting === 'function') {
			this.Tools_settings.save_setting('resolution', ppi);
		}
		config.resolution = ppi;

		if (app.Documents && !app.Documents.is_active_document_empty()) {
			await app.Documents.create_document({
				title: title,
				width: width,
				height: height,
				transparency: transparency,
				resolution: ppi,
				force_new: true
			});

			if (!transparency && bgColor) {
				const activeDoc = app.Documents.get_active_document();
				if (activeDoc && activeDoc.layers && activeDoc.layers[0]) {
					const firstLayer = activeDoc.layers[0];
					if (firstLayer.link && firstLayer.link instanceof HTMLCanvasElement) {
						const ctx = firstLayer.link.getContext('2d');
						ctx.fillStyle = bgColor;
						ctx.fillRect(0, 0, width, height);
					}
				}
			}
		} else {
			const bgCanvas = document.createElement('canvas');
			bgCanvas.width = width;
			bgCanvas.height = height;
			const bgCtx = bgCanvas.getContext('2d');
			if (!transparency && bgColor) {
				bgCtx.fillStyle = bgColor;
				bgCtx.fillRect(0, 0, width, height);
			}

			app.State.do_action(
				new app.Actions.Bundle_action('new_file', 'New File', [
					new app.Actions.Refresh_action_attributes_action('undo'),
					new app.Actions.Prepare_canvas_action('undo'),
					new app.Actions.Update_config_action({
						TRANSPARENCY: transparency,
						WIDTH: width,
						HEIGHT: height,
						ALPHA: 255,
						COLOR: '#000000',
						mouse: {},
						visible_width: null,
						visible_height: null,
						user_fonts: {}
					}),
					new app.Actions.Prepare_canvas_action('do'),
					new app.Actions.Refresh_action_attributes_action('do'),
					new app.Actions.Reset_layers_action(),
					new app.Actions.Init_canvas_zoom_action(),
					new app.Actions.Insert_layer_action(
						transparency
							? {
								name: 'Layer 1',
								locked: false,
								type: 'image',
								link: bgCanvas,
								data: '',
								width: width,
								height: height,
								width_original: width,
								height_original: height,
							}
							: {
								name: 'Background',
								locked: false,
								type: 'image',
								link: bgCanvas,
								data: bgCanvas.toDataURL(),
								width: width,
								height: height,
								width_original: width,
								height_original: height,
							}
					)
				])
			);

			if (app.Documents) {
				const doc = app.Documents.get_active_document();
				if (doc) {
					doc.title = title;
					doc.width = width;
					doc.height = height;
					doc.resolution = ppi;
					doc.transparency = transparency;
					doc.action_history = [];
					doc.action_history_index = 0;
					doc.is_dirty = false;
					doc.selection = null;
					app.Documents.render_tabs();
				}
				const selModule = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['selection'])
					? app.GUI.GUI_tools.tools_modules['selection'].object
					: null;
				if (selModule) {
					selModule.clear_selection();
				}
			}
		}

		await new Promise(r => setTimeout(r, 10));

		if (this.Base_gui && this.Base_gui.GUI_preview) {
			await this.Base_gui.GUI_preview.zoom_auto(true);
		}

		if (app.GUI && app.GUI.GUI_information) {
			if (typeof app.GUI.GUI_information.update_units === 'function') {
				app.GUI.GUI_information.update_units();
			}
			if (typeof app.GUI.GUI_information.show_size === 'function') {
				app.GUI.GUI_information.show_size(true);
			}
		}

		if (transparency) {
			this.Helper.setCookie('transparency', 1);
		} else {
			this.Helper.setCookie('transparency', 0);
		}
	}

	blob_to_data_url(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = (err) => reject(err);
			reader.readAsDataURL(blob);
		});
	}

	load_image_dimensions(data_url) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ width: img.width, height: img.height });
			img.onerror = (err) => reject(err);
			img.src = data_url;
		});
	}

	async paste_as_new() {
		let data_url = null;
		let img_w = null;
		let img_h = null;

		if (navigator.clipboard && navigator.clipboard.read) {
			try {
				const items = await navigator.clipboard.read();
				for (const item of items) {
					const imageType = item.types.find(t => t.startsWith('image/'));
					if (imageType) {
						const blob = await item.getType(imageType);
						data_url = await this.blob_to_data_url(blob);
						const dims = await this.load_image_dimensions(data_url);
						img_w = dims.width;
						img_h = dims.height;
						break;
					}
				}
			} catch (err) { /* ignore */ }
		}

		if (!data_url && config._internal_clipboard && config._internal_clipboard.data_url) {
			data_url = config._internal_clipboard.data_url;
			img_w = config._internal_clipboard.width;
			img_h = config._internal_clipboard.height;
		}

		if (!data_url) {
			alertify.error('Nothing to paste. Copy an image to the clipboard first.');
			return;
		}

		if (app.Documents && typeof app.Documents.create_document_from_image === 'function') {
			await app.Documents.create_document_from_image({
				name: 'Pasted Image',
				data: data_url,
			});
		} else {
			const img = new Image();
			img.onload = () => {
				const new_layer = {
					name: 'Pasted Image',
					type: 'image',
					link: img,
					width: img.width,
					height: img.height,
					width_original: img.width,
					height_original: img.height,
				};
				app.State.do_action(
					new app.Actions.Bundle_action('paste_as_new', 'Paste as New', [
						new app.Actions.Init_canvas_zoom_action(),
						new app.Actions.Reset_layers_action(),
						new app.Actions.Insert_layer_action(new_layer),
						new app.Actions.Autoresize_canvas_action(img.width, img.height, null, true, true)
					])
				);
			};
			img.src = data_url;
		}

		await new Promise(r => setTimeout(r, 20));
		if (this.Base_gui && this.Base_gui.GUI_preview) {
			this.Base_gui.GUI_preview.zoom_auto(true);
		}

		if (img_w && img_h) {
			alertify.success(`Created new document from clipboard (${img_w} × ${img_h}px).`);
		} else {
			alertify.success('Created new document from clipboard.');
		}
	}

	new_from_clipboard() {
		return this.paste_as_new();
	}
}

export default File_new_class;