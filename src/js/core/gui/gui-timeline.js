/**
 * GUI Timeline Component (Horizontal Photoshop-style Panel)
 * Manages frame thumbnails, playback controls, onion skinning, drag & drop reordering, and export.
 */

import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import Frame_manager_class from './../timeline/frame-manager.js';
import Timeline_export_class from './../timeline/timeline-export.js';

var instance = null;

export class GUI_timeline_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Helper = new Helper_class();
		this.Frame_manager = new Frame_manager_class();
		this.Timeline_export = new Timeline_export_class();

		this.is_visible = false;
		this.is_playing = false;
		this.play_timer = null;
		this.dragged_frame_index = null;
		this._last_frame_time = 0;
		this._raf_id = null;

		this.set_events();
	}

	/**
	 * Toggle timeline panel open / closed
	 */
	toggle(forceState = null) {
		const targetState = (forceState !== null) ? forceState : !this.is_visible;
		this.is_visible = targetState;
		this.Frame_manager.is_timeline_active = targetState;

		const panel = document.getElementById('timeline_panel');
		const middleArea = document.getElementById('middle_area');

		if (this.is_visible) {
			this.Frame_manager.init();
			if (panel) panel.classList.remove('hidden');
			if (middleArea) middleArea.classList.add('has_timeline');

			// Activate and open the preview panel in looping animation mode
			if (app.GUI && app.GUI.GUI_preview && typeof app.GUI.GUI_preview.set_animation_mode === 'function') {
				app.GUI.GUI_preview.set_animation_mode(true);
			}

			this.render_timeline();
		} else {
			this.stop();
			if (panel) panel.classList.add('hidden');
			if (middleArea) middleArea.classList.remove('has_timeline');

			// Deactivate looping animation mode in preview
			if (app.GUI && app.GUI.GUI_preview && typeof app.GUI.GUI_preview.set_animation_mode === 'function') {
				app.GUI.GUI_preview.set_animation_mode(false);
			}
		}

		if (app.GUI && typeof app.GUI.prepare_canvas === 'function') {
			app.GUI.prepare_canvas();
		}
		if (app.GUI && app.GUI.Base_gui && typeof app.GUI.Base_gui.check_canvas_offset === 'function') {
			app.GUI.Base_gui.check_canvas_offset();
		}
		if (app.Layers && typeof app.Layers.invalidate === 'function') {
			app.Layers.invalidate({ document: true, preview: true, ruler: true, viewport: true });
		}
	}

	show() {
		this.toggle(true);
	}

	hide() {
		this.toggle(false);
	}

	/**
	 * Set up global keyboard shortcuts and UI event listeners
	 */
	set_events() {
		document.addEventListener('keydown', (e) => {
			if (!this.is_visible) return;
			if (this.Helper.is_input(e.target)) return;

			if (e.key === ',' || e.code === 'Comma') {
				e.preventDefault();
				this.step_prev();
			} else if (e.key === '.' || e.code === 'Period') {
				e.preventDefault();
				this.step_next();
			} else if (e.altKey && (e.key === 'o' || e.key === 'O')) {
				e.preventDefault();
				this.toggle_onion_skin();
			}
		});
	}

	/**
	 * Toggle playback state
	 */
	toggle_play() {
		if (this.is_playing) {
			this.stop();
		} else {
			this.play();
		}
	}

	play() {
		if (this.is_playing) return;
		this.is_playing = true;
		this._last_frame_time = performance.now();
		this.update_play_button();

		const playLoop = (time) => {
			if (!this.is_playing) return;
			const fps = Math.max(1, Math.min(30, this.Frame_manager.fps || 12));
			const interval = 1000 / fps;

			if (time - this._last_frame_time >= interval) {
				this._last_frame_time = time;
				const total = Math.max(1, this.Frame_manager.frames.length);
				const nextIndex = (this.Frame_manager.active_frame_index + 1) % total;
				this.playback_step(nextIndex);
			}

			this._raf_id = requestAnimationFrame(playLoop);
		};

		this._raf_id = requestAnimationFrame(playLoop);
	}

	playback_step(index) {
		const total = this.Frame_manager.frames.length;
		if (index < 0 || index >= total) return;

		this.Frame_manager.active_frame_index = index;
		const targetFrame = this.Frame_manager.frames[index];
		if (!targetFrame) return;

		// Mount target frame layers into config.layers
		config.layers = this.Frame_manager.clone_layers(targetFrame.layers);
		let activeLayer = null;
		if (targetFrame.active_layer_id != null) {
			activeLayer = config.layers.find(l => l.id === targetFrame.active_layer_id);
		}
		if (!activeLayer && config.layers.length > 0) {
			activeLayer = config.layers[0];
		}
		config.layer = activeLayer;

		// Fast canvas render
		if (this.Frame_manager.Base_layers) {
			if (typeof this.Frame_manager.Base_layers.notify_all_layers_changed === 'function') {
				this.Frame_manager.Base_layers.notify_all_layers_changed();
			} else {
				this.Frame_manager.Base_layers.invalidate({ document: true, full: true });
			}
			this.Frame_manager.Base_layers.render(true);
		}

		// Update UI highlight and frame counter without re-rendering DOM
		const counter = document.getElementById('timeline_frame_counter');
		if (counter) {
			counter.textContent = `${index + 1} / ${total}`;
		}

		const container = document.getElementById('timeline_frames_container');
		if (container) {
			const prevActive = container.querySelector('.timeline_frame_card.active');
			if (prevActive) prevActive.classList.remove('active');
			const nextActive = container.querySelector(`.timeline_frame_card[data-index="${index}"]`);
			if (nextActive) {
				nextActive.classList.add('active');
				nextActive.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
			}
		}
	}

	stop() {
		if (!this.is_playing) return;
		this.is_playing = false;
		if (this._raf_id) {
			cancelAnimationFrame(this._raf_id);
			this._raf_id = null;
		}
		this.update_play_button();

		// Resync full layer list for editing
		if (app.GUI && app.GUI.GUI_layers && typeof app.GUI.GUI_layers.render_layers === 'function') {
			app.GUI.GUI_layers.render_layers();
		}
	}

	step_prev() {
		this.stop();
		const total = this.Frame_manager.frames.length;
		if (total <= 1) return;
		let nextIndex = this.Frame_manager.active_frame_index - 1;
		if (nextIndex < 0) nextIndex = total - 1;
		this.Frame_manager.set_active_frame(nextIndex, true);
	}

	step_next() {
		this.stop();
		const total = this.Frame_manager.frames.length;
		if (total <= 1) return;
		const nextIndex = (this.Frame_manager.active_frame_index + 1) % total;
		this.Frame_manager.set_active_frame(nextIndex, true);
	}

	step_first() {
		this.stop();
		this.Frame_manager.set_active_frame(0, true);
	}

	toggle_onion_skin() {
		this.Frame_manager.onion_skin = !this.Frame_manager.onion_skin;
		this.update_onion_skin_button();
		if (app.Layers && typeof app.Layers.invalidate === 'function') {
			app.Layers.invalidate({ document: true });
		}
	}

	update_play_button() {
		const playBtn = document.getElementById('timeline_btn_play');
		if (!playBtn) return;
		if (this._last_rendered_playing === this.is_playing) return;
		this._last_rendered_playing = this.is_playing;

		if (this.is_playing) {
			playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
			playBtn.title = "Pause [Space]";
			playBtn.classList.add('playing');
		} else {
			playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
			playBtn.title = "Play [Space]";
			playBtn.classList.remove('playing');
		}
	}

	update_onion_skin_button() {
		const onionBtn = document.getElementById('timeline_btn_onion');
		if (!onionBtn) return;
		if (this.Frame_manager.onion_skin) {
			onionBtn.classList.add('active');
		} else {
			onionBtn.classList.remove('active');
		}
	}

	/**
	 * Main render function for the timeline panel UI and frame thumbnails
	 */
	render_timeline() {
		const panel = document.getElementById('timeline_panel');
		if (!panel || !this.is_visible) return;

		const totalFrames = this.Frame_manager.frames.length;
		const activeIndex = this.Frame_manager.active_frame_index;

		// Update frame counter
		const counter = document.getElementById('timeline_frame_counter');
		if (counter) {
			counter.textContent = `${activeIndex + 1} / ${totalFrames}`;
		}

		// Update FPS inputs
		const fpsSlider = document.getElementById('timeline_fps_slider');
		const fpsNumber = document.getElementById('timeline_fps_number');
		if (fpsSlider) fpsSlider.value = this.Frame_manager.fps;
		if (fpsNumber) fpsNumber.value = this.Frame_manager.fps;

		this.update_play_button();
		this.update_onion_skin_button();

		// Render frame thumbnails in strip
		const container = document.getElementById('timeline_frames_container');
		if (!container) return;

		container.innerHTML = '';

		for (let i = 0; i < totalFrames; i++) {
			const frame = this.Frame_manager.frames[i];
			const isCurrent = (i === activeIndex);

			const card = document.createElement('div');
			card.className = 'timeline_frame_card' + (isCurrent ? ' active' : '');
			card.dataset.index = i;
			card.draggable = true;

			// Header with frame number
			const header = document.createElement('div');
			header.className = 'frame_card_header';
			header.textContent = `${i + 1}`;
			card.appendChild(header);

			// Thumbnail Canvas
			const thumbWrapper = document.createElement('div');
			thumbWrapper.className = 'frame_card_thumb_wrapper';

			const thumbCanvas = document.createElement('canvas');
			const thumbW = 72;
			const thumbH = Math.max(20, Math.round(thumbW * ((config.HEIGHT || 600) / (config.WIDTH || 800))));
			thumbCanvas.width = thumbW;
			thumbCanvas.height = thumbH;
			thumbCanvas.className = 'frame_card_canvas';

			const tctx = thumbCanvas.getContext('2d');
			const composite = this.Frame_manager.get_frame_canvas(i, config.WIDTH, config.HEIGHT);
			if (composite) {
				tctx.drawImage(composite, 0, 0, thumbW, thumbH);
			}
			thumbWrapper.appendChild(thumbCanvas);
			card.appendChild(thumbWrapper);

			// Hover actions overlay (duplicate / delete)
			const actions = document.createElement('div');
			actions.className = 'frame_card_actions';

			const dupBtn = document.createElement('button');
			dupBtn.className = 'frame_mini_btn';
			dupBtn.title = 'Duplicate Frame';
			dupBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
			dupBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.stop();
				this.Frame_manager.duplicate_frame(i);
			});
			actions.appendChild(dupBtn);

			const delBtn = document.createElement('button');
			delBtn.className = 'frame_mini_btn del';
			delBtn.title = 'Delete Frame';
			delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
			delBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.stop();
				this.Frame_manager.delete_frame(i);
			});
			actions.appendChild(delBtn);

			card.appendChild(actions);

			// Frame Card Click -> Select Frame
			card.addEventListener('click', () => {
				this.stop();
				this.Frame_manager.set_active_frame(i, true);
			});

			// Drag and Drop Frame Reordering
			card.addEventListener('dragstart', (e) => {
				this.dragged_frame_index = i;
				e.dataTransfer.effectAllowed = 'move';
				card.classList.add('dragging');
			});

			card.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				card.classList.add('drag_over');
			});

			card.addEventListener('dragleave', () => {
				card.classList.remove('drag_over');
			});

			card.addEventListener('drop', (e) => {
				e.preventDefault();
				card.classList.remove('drag_over');
				if (this.dragged_frame_index !== null && this.dragged_frame_index !== i) {
					this.Frame_manager.reorder_frame(this.dragged_frame_index, i);
					this.dragged_frame_index = null;
				}
			});

			card.addEventListener('dragend', () => {
				card.classList.remove('dragging');
				this.dragged_frame_index = null;
			});

			container.appendChild(card);
		}

		// + Frame button next to thumbnails
		const addBtnCard = document.createElement('div');
		addBtnCard.className = 'timeline_add_frame_card';
		addBtnCard.title = 'Add New Blank Frame';
		addBtnCard.innerHTML = `
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="12" y1="5" x2="12" y2="19"/>
				<line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
			<span>Frame</span>
		`;
		addBtnCard.addEventListener('click', () => {
			this.stop();
			this.Frame_manager.add_frame();
		});
		container.appendChild(addBtnCard);

		// Scroll active frame into view if needed
		const activeCard = container.querySelector(`.timeline_frame_card[data-index="${activeIndex}"]`);
		if (activeCard) {
			activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
		}
	}

	/**
	 * Fast in-place update of the active frame thumbnail card
	 */
	update_active_thumbnail() {
		if (!this.is_visible) return;
		const activeIndex = this.Frame_manager.active_frame_index;
		const container = document.getElementById('timeline_frames_container');
		if (!container) return;
		const card = container.querySelector(`.timeline_frame_card[data-index="${activeIndex}"]`);
		if (!card) return;
		const canvas = card.querySelector('canvas.frame_card_canvas');
		if (!canvas) return;
		const tctx = canvas.getContext('2d');
		tctx.imageSmoothingEnabled = false;

		const baseLayers = this.Frame_manager.Base_layers;
		if (baseLayers && baseLayers.Composite_cache && baseLayers.Composite_cache.documentCanvas && !baseLayers.Composite_cache.documentDirty) {
			tctx.clearRect(0, 0, canvas.width, canvas.height);
			tctx.drawImage(baseLayers.Composite_cache.documentCanvas, 0, 0, canvas.width, canvas.height);
			return;
		}

		const composite = this.Frame_manager.get_frame_canvas(activeIndex);
		if (composite) {
			tctx.clearRect(0, 0, canvas.width, canvas.height);
			tctx.drawImage(composite, 0, 0, canvas.width, canvas.height);
		}
	}

	/**
	 * Mounts timeline UI markup into the page DOM
	 */
	init_dom() {
		let panel = document.getElementById('timeline_panel');
		if (panel) return;

		const middleArea = document.getElementById('middle_area');
		if (!middleArea) return;

		panel = document.createElement('div');
		panel.id = 'timeline_panel';
		panel.className = 'timeline_panel hidden';

		panel.innerHTML = `
			<div class="timeline_toolbar">
				<div class="timeline_controls">
					<button type="button" class="timeline_btn" id="timeline_btn_first" title="First Frame">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="3" height="16"/><polygon points="21 4 10 12 21 20 21 4"/></svg>
					</button>
					<button type="button" class="timeline_btn" id="timeline_btn_prev" title="Previous Frame [,]">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="18 4 7 12 18 20 18 4"/></svg>
					</button>
					<button type="button" class="timeline_btn play_btn" id="timeline_btn_play" title="Play / Pause [Space]">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
					</button>
					<button type="button" class="timeline_btn" id="timeline_btn_next" title="Next Frame [.]">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 17 12 6 20 6 4"/></svg>
					</button>
					<span class="timeline_frame_counter" id="timeline_frame_counter">1 / 1</span>
				</div>
				<div class="timeline_fps_group">
					<label for="timeline_fps_slider">FPS:</label>
					<input type="range" id="timeline_fps_slider" min="1" max="30" value="12" />
					<input type="number" id="timeline_fps_number" min="1" max="30" value="12" />
				</div>
				<div class="timeline_actions">
					<button type="button" class="timeline_tool_btn" id="timeline_btn_onion" title="Toggle Onion Skinning [Alt+O]">
						<span class="onion_emoji">🧅</span> Onion Skin
					</button>
					<button type="button" class="timeline_tool_btn primary" id="timeline_btn_export" title="Export Animation (GIF / Spritesheet)">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export
					</button>
					<button type="button" class="timeline_tool_btn close_btn" id="timeline_btn_close" title="Close Timeline">✕</button>
				</div>
			</div>
			<div class="timeline_track" id="timeline_track">
				<div class="timeline_frames_container" id="timeline_frames_container"></div>
			</div>
		`;

		middleArea.appendChild(panel);

		// Wire toolbar buttons
		document.getElementById('timeline_btn_first').addEventListener('click', () => this.step_first());
		document.getElementById('timeline_btn_prev').addEventListener('click', () => this.step_prev());
		document.getElementById('timeline_btn_play').addEventListener('click', () => this.toggle_play());
		document.getElementById('timeline_btn_next').addEventListener('click', () => this.step_next());
		document.getElementById('timeline_btn_onion').addEventListener('click', () => this.toggle_onion_skin());

		document.getElementById('timeline_btn_export').addEventListener('click', () => {
			this.stop();
			this.Timeline_export.show_export_dialog(this.Frame_manager);
		});

		document.getElementById('timeline_btn_close').addEventListener('click', () => {
			this.hide();
		});

		// Wire FPS slider and number input
		const fpsSlider = document.getElementById('timeline_fps_slider');
		const fpsNumber = document.getElementById('timeline_fps_number');

		const onFpsChange = (val) => {
			const fps = Math.max(1, Math.min(30, parseInt(val) || 12));
			this.Frame_manager.fps = fps;
			if (fpsSlider) fpsSlider.value = fps;
			if (fpsNumber) fpsNumber.value = fps;
		};

		if (fpsSlider) fpsSlider.addEventListener('input', (e) => onFpsChange(e.target.value));
		if (fpsNumber) fpsNumber.addEventListener('change', (e) => onFpsChange(e.target.value));
	}
}

export default GUI_timeline_class;
