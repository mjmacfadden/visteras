import { get_layer_content_bounds } from './../../libs/layer-bounds.js';
import { Subpath } from './../../core/vector/vector-model.js';
import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import {
	ref_point,
	scale_about,
	rotate_about,
	snap_angle,
	skew_from_drag,
	apply_numeric,
	create_transform_session,
	restore_transform_session,
	snapshot_transform_layer,
	TRANSFORM_FIELDS,
	local_point,
	resize_from_drag,
	transform_layer_geometry,
} from './../../libs/free-transform.js';

let instance = null;

export default class Transform_edit_class {
	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.session = null;
		this._updating_from_ui = false;
	}

	is_active() {
		return !!(this.session && this.session.active);
	}

	is_skew_mode() {
		return this.is_active() && this.session.mode === 'skew';
	}

	async free_transform(options = {}) {
		if (this.is_active()) {
			return;
		}

		if (!config.layer || !config.layers || config.layers.length === 0) {
			alertify.warning('No layer selected.');
			return;
		}

		// Check for group layer
		if (config.layer.type === 'group' || config.layer.status === 'group') {
			alertify.warning('Cannot transform a layer group.');
			return;
		}

		// Check for adjustment layer
		if (config.layer.type === 'adjustment') {
			alertify.warning('Cannot transform an adjustment layer.');
			return;
		}

		// Check for locked layer
		if (config.layer.locked || config.layer.is_locked) {
			alertify.warning('Cannot transform a locked layer.');
			return;
		}

		// Collect affected layers
		const ids = config.selected_layer_ids && config.selected_layer_ids.length ? config.selected_layer_ids : [config.layer.id];
		const layers = ids.map(id => app.Layers.get_layer(id, true)).filter(Boolean);

		// Validate all selected layers
		for (const l of layers) {
			if (l.type === 'group' || l.status === 'group') {
				alertify.warning('Cannot transform a layer group.');
				return;
			}
			if (l.type === 'adjustment') {
				alertify.warning('Cannot transform an adjustment layer.');
				return;
			}
			if (l.locked || l.is_locked) {
				alertify.warning('Cannot transform a locked layer.');
				return;
			}
		}

		if (layers.some(layer => !Number.isFinite(layer.width) || !Number.isFinite(layer.height) || layer.width <= 0 || layer.height <= 0)) {
			alertify.warning('Layer has no transformable content.');
			return;
		}

		// Switch to Move tool ('select')
		if (!config.TOOL || config.TOOL.name !== 'select') {
			if (app.GUI && app.GUI.GUI_tools) {
				await app.GUI.GUI_tools.activate_tool('select', { skip_history: true });
			}
		}

		// Create transform session
		const session = create_transform_session(layers);
		if (layers.length === 1 && layers[0].type === 'image') {
			const bounds = get_layer_content_bounds(layers[0]);
			if (bounds) {
				// Content bounds retain local coordinates; rotate the offset about the full layer center.
				const old = layers[0];
				const r = (old.rotate || 0) * Math.PI / 180;
				const localX = (bounds.local_min_x + bounds.local_width / 2) * old.width / (old.link_canvas?.width || old.link?.naturalWidth || old.width);
				const localY = (bounds.local_min_y + bounds.local_height / 2) * old.height / (old.link_canvas?.height || old.link?.naturalHeight || old.height);
				const dx = Number.isFinite(localX) ? localX - old.width / 2 : bounds.x + bounds.width / 2 - old.x - old.width / 2;
				const dy = Number.isFinite(localY) ? localY - old.height / 2 : bounds.y + bounds.height / 2 - old.y - old.height / 2;
				const tx = dx + Math.tan((old.skew_x || 0) * Math.PI / 180) * dy;
				const ty = dy + Math.tan((old.skew_y || 0) * Math.PI / 180) * dx;
				session.box = { ...bounds, x: old.x + old.width / 2 + tx*Math.cos(r)-ty*Math.sin(r)-bounds.width/2,
					y: old.y + old.height / 2 + tx*Math.sin(r)+ty*Math.cos(r)-bounds.height/2,
					rotate: old.rotate || 0, skew_x: old.skew_x || 0, skew_y: old.skew_y || 0 };

				session.snapshot.box = { ...session.box };
			}
		}
		for (const old of session.snapshot.layers) {
			const layer = app.Layers.get_layer(old.id, true);
			const vec = this.vector_for(layer);
			if (vec) old.vector_paths = JSON.parse(JSON.stringify(vec.paths));
		}
		session.mode = options?.mode || 'free';
		session.locator = 'c';
		session.ref = ref_point(session.box, 'c');
		session.w_pct = 100;
		session.h_pct = 100;
		session.aspect_locked = true;

		this.session = session;
		const select = app.GUI.GUI_tools.tools_modules?.select?.object;
		if (select?.Base_selection) {
			const settings = select.Base_selection.find_settings();
			if (settings) { session.previous_controls = settings.enable_controls; settings.enable_controls = true; }
		}

		this.render_options_bar();
		this.Base_layers.render();
	}

	skew() {
		this.free_transform({ mode: 'skew' });
	}

	async commit() {
		if (!this.is_active()) {
			return;
		}

		const session = this.session;
		this.drag = null;
		this.session = null;
		const settings = app.GUI.GUI_tools.tools_modules?.select?.object?.Base_selection?.find_settings();
		if (settings && session.previous_controls !== undefined) settings.enable_controls = session.previous_controls;
		document.getElementById('action_attributes')?.classList.remove('free-transform-options');

		const layers = session.snapshot.layers.map(s => app.Layers.get_layer(s.id, true)).filter(Boolean);
		const final = layers.map(layer => {
			const state = snapshot_transform_layer(layer);
			const vec = this.vector_for(layer);
			if (vec) state.vector_paths = JSON.parse(JSON.stringify(vec.paths));
			return state;
		});
		// Actions must capture the original geometry, not the live preview.
		restore_transform_session(session, layers);
		this.restore_vectors(session);
		const updateActions = [];
		for (const state of final) {
			const before = session.snapshot.layers.find(s => s.id === state.id);
			const changes = {};
			for (const key of TRANSFORM_FIELDS) {
				if (key === 'mask') continue; // Update_layer synchronizes linked geometry from the restored mask.
				const defaultZero = ['rotate', 'skew_x', 'skew_y'].includes(key);
				if (defaultZero ? (state[key] || 0) !== (before[key] || 0) : JSON.stringify(state[key]) !== JSON.stringify(before[key])) changes[key] = state[key];
			}
			if (JSON.stringify(state.vector_paths) !== JSON.stringify(before.vector_paths)) changes.vector_paths = state.vector_paths;
			if (Object.keys(changes).length) updateActions.push(new app.Actions.Update_layer_action(state.id, changes));
		}

		if (updateActions.length > 0) {
			await app.State.do_action(
				new app.Actions.Bundle_action('free_transform', 'Free Transform', updateActions)
			);
		}

		if (app.GUI && app.GUI.GUI_tools) {
			app.GUI.GUI_tools.show_action_attributes();
		}
		this.Base_layers.render();
	}

	cancel() {
		if (!this.is_active()) {
			return;
		}

		const session = this.session;
		this.drag = null;
		this.session = null;
		const settings = app.GUI.GUI_tools.tools_modules?.select?.object?.Base_selection?.find_settings();
		if (settings && session.previous_controls !== undefined) settings.enable_controls = session.previous_controls;
		document.getElementById('action_attributes')?.classList.remove('free-transform-options');

		restore_transform_session(session, session.snapshot.layers.map(s => app.Layers.get_layer(s.id, true)).filter(Boolean));
		this.restore_vectors(session);

		if (app.GUI && app.GUI.GUI_tools) {
			app.GUI.GUI_tools.show_action_attributes();
		}
		this.Base_layers.render();
	}

	nudge(dx, dy) {
		if (!this.is_active()) return;
		this.session.ref.x += dx;
		this.session.ref.y += dy;
		this.preview_box({ ...this.session.box, x: this.session.box.x + dx, y: this.session.box.y + dy });
	}

	preview_box(box) {
		const session = this.session;
		const initial = session.snapshot.box;
		const sx = box.width / initial.width, sy = box.height / initial.height;
		for (const old of session.snapshot.layers) {
			const layer = app.Layers.get_layer(old.id, true);
			if (!layer) continue;
			const next = transform_layer_geometry(old, initial, box);
			for (const key of ['x', 'y', 'width', 'height', 'rotate', 'skew_x', 'skew_y']) layer[key] = next[key] || 0;
			const vec = this.vector_for(layer);
			if (vec && old.vector_paths) {
				const paths = JSON.parse(JSON.stringify(old.vector_paths));
				for (const path of paths) for (const anchor of path.anchors) for (const p of [anchor.point, anchor.handle_in, anchor.handle_out]) {
					if (p) { p.x = layer.x + (p.x - old.x) * layer.width / old.width; p.y = layer.y + (p.y - old.y) * layer.height / old.height; }
				}
				vec.paths = paths.map(Subpath.fromJSON);
			}
			if (old.mask && old.mask.linked !== false) {
				const mx = layer.width / old.width, my = layer.height / old.height;
				layer.mask = { ...old.mask, x: layer.x + (old.mask.x - old.x) * mx, y: layer.y + (old.mask.y - old.y) * my,
					width: old.mask.width * mx, height: old.mask.height * my };
			}
			if (layer.type === 'text' && old.params) {
				layer.params = JSON.parse(JSON.stringify(old.params));
				if (layer.width !== old.width) layer.params.scale_x = (old.params.scale_x || 1) * layer.width / old.width;
				if (layer.height !== old.height) layer.params.scale_y = (old.params.scale_y || 1) * layer.height / old.height;
				if (old.params.anchor_x != null) layer.params.anchor_x = layer.x + (old.params.anchor_x - old.x) * sx;
				if (old.params.anchor_y != null) layer.params.anchor_y = layer.y + (old.params.anchor_y - old.y) * sy;
			}
		}
		session.box = box;
		session.w_pct = sx * 100; session.h_pct = sy * 100;
		if (session.locator) session.ref = ref_point(box, session.locator);
		this.sync_options_bar();
		this.Base_layers.render();
	}

	hit_handle(mouse) {
		const box = this.session.box;
		const locators = { tl: 5, tc: 1, tr: 9, ml: 4, mr: 8, bl: 6, bc: 2, br: 10 };
		let handle = null;
		const radius = 10 / config.ZOOM;
		if (Math.hypot(mouse.x - this.session.ref.x, mouse.y - this.session.ref.y) < radius) handle = 'ref';
		if (!handle) for (const [loc, id] of Object.entries(locators)) {
			const p = ref_point(box, loc);
			if (Math.hypot(mouse.x - p.x, mouse.y - p.y) < radius) { handle = id; break; }
		}
		if (!handle) {
			const p = local_point(box, mouse);
			if (Math.abs(p.x) <= box.width / 2 && Math.abs(p.y) <= box.height / 2) handle = 'move';
			else if (Math.abs(p.x) <= box.width / 2 + 46 / config.ZOOM && Math.abs(p.y) <= box.height / 2 + 46 / config.ZOOM) handle = 'rotate';
		}
		return handle;
	}

	pointer_down(mouse, event) {
		const box = this.session.box;
		const handle = this.hit_handle(mouse);
		this.drag = handle ? { handle, start: { x: mouse.x, y: mouse.y }, box: { ...box }, ref: { ...this.session.ref } } : null;
	}

	pointer_move(mouse, event) {
		const drag = this.drag;
		if (!drag) {
			const handle = this.hit_handle(mouse);
			const wrapper = document.getElementById('main_wrapper');
			if (wrapper) wrapper.style.cursor = handle === 'rotate' ? "url('images/icons/rotate.svg') 12 12, default"
				: handle === 'ref' || handle === 'move' ? 'move'
				: [1, 2].includes(handle) ? (event.metaKey || event.ctrlKey || this.is_skew_mode() ? 'ew-resize' : 'ns-resize')
				: [4, 8].includes(handle) ? (event.metaKey || event.ctrlKey || this.is_skew_mode() ? 'ns-resize' : 'ew-resize')
				: [5, 10].includes(handle) ? 'nwse-resize' : [6, 9].includes(handle) ? 'nesw-resize' : 'default';
			return;
		}
		const { box, start, ref, handle } = drag;
		if (handle === 'ref') {
			this.session.locator = null;
			this.session.ref = { x: mouse.x, y: mouse.y };
			for (const loc of ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']) {
				const p = ref_point(box, loc);
				if (Math.hypot(mouse.x - p.x, mouse.y - p.y) < 12 / config.ZOOM) { this.session.locator = loc; this.session.ref = p; break; }
			}
			this.sync_options_bar(); this.Base_layers.render(); return;
		}
		let next;
		if (handle === 'move') {
			const dx = mouse.x - start.x, dy = mouse.y - start.y;
			next = { ...box, x: box.x + dx, y: box.y + dy };
			this.session.ref = { x: ref.x + dx, y: ref.y + dy };
		} else if (handle === 'rotate') {
			let delta = (Math.atan2(mouse.y - ref.y, mouse.x - ref.x) - Math.atan2(start.y - ref.y, start.x - ref.x)) * 180 / Math.PI;
			if (event.shiftKey) delta = snap_angle((box.rotate || 0) + delta) - (box.rotate || 0);
			next = rotate_about(box, ref, delta);
		} else if ([1, 2, 4, 8].includes(handle) && (this.is_skew_mode() || event.metaKey || event.ctrlKey)) {
			const a = local_point(box, start), b = local_point(box, mouse);
			const side = { 1: 'top', 2: 'bottom', 4: 'left', 8: 'right' }[handle];
			const skew = skew_from_drag(side, b.x - a.x, b.y - a.y, box);
			const opposite = { 1: 'bc', 2: 'tc', 4: 'mr', 8: 'ml' }[handle];
			const fixed = ref_point(box, opposite);
			next = { ...box, skew_x: Math.max(-80, Math.min(80, skew.skew_x)), skew_y: Math.max(-80, Math.min(80, skew.skew_y)) };
			const moved = ref_point(next, opposite);
			next.x += fixed.x - moved.x; next.y += fixed.y - moved.y;
		} else {
			next = resize_from_drag(box, handle, start, mouse, this.session.aspect_locked !== !!event.shiftKey, event.altKey ? ref : null);
		}
		this.preview_box(next);
	}

	pointer_up() { this.drag = null; }

	vector_for(layer) {
		if (!layer || layer.type !== 'vector') return null;
		return (config.vectors || []).find(v => v.id === (layer.vector_id || layer.params?.vector_id));
	}

	restore_vectors(session) {
		for (const old of session.snapshot.layers) {
			const vec = this.vector_for(app.Layers.get_layer(old.id, true));
			if (vec && old.vector_paths) vec.paths = old.vector_paths.map(Subpath.fromJSON);
		}
	}

	set_locator(locator) {
		if (!this.is_active()) return;
		this.session.locator = locator;
		this.session.ref = ref_point(this.session.box, locator);
		this.sync_options_bar();
		this.Base_layers.render();
	}

	set_aspect_locked(locked) {
		if (!this.is_active()) return;
		this.session.aspect_locked = !!locked;
		const linkBtn = document.getElementById('ft_link');
		if (linkBtn) {
			linkBtn.classList.toggle('active', this.session.aspect_locked);
		}
	}

	render_options_bar() {
		const container = document.getElementById('action_attributes');
		if (!container || !this.is_active()) return;

		container.classList.add('free-transform-options');
		const session = this.session;
		const ref = session.ref || ref_point(session.box, session.locator || 'c');
		const xVal = Math.round(ref.x * 10) / 10;
		const yVal = Math.round(ref.y * 10) / 10;
		const wVal = Math.round(session.w_pct * 10) / 10;
		const hVal = Math.round(session.h_pct * 10) / 10;
		const angleVal = Math.round((session.box.rotate || 0) * 10) / 10;
		const skewXVal = Math.round((session.box.skew_x || 0) * 10) / 10;
		const skewYVal = Math.round((session.box.skew_y || 0) * 10) / 10;

		container.innerHTML = `
			<div class="item">
				<div class="transform_ref_locator" title="Reference point position" id="ft_locator_grid">
					<button type="button" aria-label="Reference point tl" class="transform_ref_cell ${session.locator === 'tl' ? 'active' : ''}" data-loc="tl"></button>
					<button type="button" aria-label="Reference point tc" class="transform_ref_cell ${session.locator === 'tc' ? 'active' : ''}" data-loc="tc"></button>
					<button type="button" aria-label="Reference point tr" class="transform_ref_cell ${session.locator === 'tr' ? 'active' : ''}" data-loc="tr"></button>
					<button type="button" aria-label="Reference point ml" class="transform_ref_cell ${session.locator === 'ml' ? 'active' : ''}" data-loc="ml"></button>
					<button type="button" aria-label="Reference point c" class="transform_ref_cell ${session.locator === 'c' ? 'active' : ''}" data-loc="c"></button>
					<button type="button" aria-label="Reference point mr" class="transform_ref_cell ${session.locator === 'mr' ? 'active' : ''}" data-loc="mr"></button>
					<button type="button" aria-label="Reference point bl" class="transform_ref_cell ${session.locator === 'bl' ? 'active' : ''}" data-loc="bl"></button>
					<button type="button" aria-label="Reference point bc" class="transform_ref_cell ${session.locator === 'bc' ? 'active' : ''}" data-loc="bc"></button>
					<button type="button" aria-label="Reference point br" class="transform_ref_cell ${session.locator === 'br' ? 'active' : ''}" data-loc="br"></button>
				</div>
			</div>
			<div class="item">
				<label for="ft_x">X:</label>
				<input type="number" id="ft_x" step="any" value="${xVal}" style="width:55px;"> px
			</div>
			<div class="item">
				<label for="ft_y">Y:</label>
				<input type="number" id="ft_y" step="any" value="${yVal}" style="width:55px;"> px
			</div>
			<div class="item">
				<label for="ft_w">W:</label>
				<input type="number" id="ft_w" step="any" value="${wVal}" style="width:55px;"> %
			</div>
			<div class="item" style="margin-right:10px;">
				<button type="button" class="transform_link_btn ${session.aspect_locked ? 'active' : ''}" id="ft_link" title="Maintain aspect ratio">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
					</svg>
				</button>
			</div>
			<div class="item">
				<label for="ft_h">H:</label>
				<input type="number" id="ft_h" step="any" value="${hVal}" style="width:55px;"> %
			</div>
			<div class="item">
				<label for="ft_angle">∠:</label>
				<input type="number" aria-label="Angle" id="ft_angle" step="any" value="${angleVal}" style="width:50px;"> °
			</div>
			<div class="item">
				<label for="ft_skew_x">H:</label>
				<input type="number" aria-label="Horizontal skew" id="ft_skew_x" step="any" value="${skewXVal}" style="width:50px;"> °
			</div>
			<div class="item">
				<label for="ft_skew_y">V:</label>
				<input type="number" aria-label="Vertical skew" id="ft_skew_y" step="any" value="${skewYVal}" style="width:50px;"> °
			</div>
			<div class="item" style="margin-left:auto; display:inline-flex;">
				<button type="button" class="transform_btn" id="ft_commit" title="Commit transform (Enter)">✓</button>
				<button type="button" class="transform_btn cancel" id="ft_cancel" title="Cancel transform (Esc)">⊘</button>
			</div>
		`;

		this.bind_options_bar_events();
	}

	bind_options_bar_events() {
		const grid = document.getElementById('ft_locator_grid');
		if (grid) {
			grid.addEventListener('click', (e) => {
				const cell = e.target.closest('.transform_ref_cell');
				if (cell && cell.dataset.loc) {
					this.set_locator(cell.dataset.loc);
				}
			});
		}

		const linkBtn = document.getElementById('ft_link');
		if (linkBtn) {
			linkBtn.addEventListener('click', () => {
				this.set_aspect_locked(!this.session.aspect_locked);
			});
		}

		const commitBtn = document.getElementById('ft_commit');
		if (commitBtn) {
			commitBtn.addEventListener('click', () => this.commit());
		}

		const cancelBtn = document.getElementById('ft_cancel');
		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => this.cancel());
		}

		const onNumericChange = (event) => {
			if (!this.is_active()) return;
			const id = event && event.target && event.target.id;
			const input = document.getElementById(id);
			if (!input || input.value === '') return;
			const value = Number(input.value);
			if (!Number.isFinite(value)) return;
			const session = this.session;
			let box = { ...session.box };
			const ref = session.ref;
			if (id === 'ft_x' || id === 'ft_y') {
				const axis = id === 'ft_x' ? 'x' : 'y';
				box[axis] += value - ref[axis];
				session.ref = { ...ref, [axis]: value };
			} else if (id === 'ft_w' || id === 'ft_h') {
				if (value <= 0) return;
				let sx = id === 'ft_w' ? value / session.w_pct : 1;
				let sy = id === 'ft_h' ? value / session.h_pct : 1;
				if (session.aspect_locked) sx = sy = id === 'ft_w' ? sx : sy;
				box = scale_about(box, ref, sx, sy);
			} else if (id === 'ft_angle') {
				box = rotate_about(box, ref, value - (box.rotate || 0));
			} else if (id === 'ft_skew_x' || id === 'ft_skew_y') {
				if (Math.abs(value) >= 85) return;
				box[id === 'ft_skew_x' ? 'skew_x' : 'skew_y'] = value;
			}
			this.preview_box(box);
		};

		const inputs = ['ft_x', 'ft_y', 'ft_w', 'ft_h', 'ft_angle', 'ft_skew_x', 'ft_skew_y'];
		for (const id of inputs) {
			const el = document.getElementById(id);
			if (el) {
				el.addEventListener('input', onNumericChange);
				el.addEventListener('change', onNumericChange);
				el.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onNumericChange({ target: el });
						this.commit();
					} else if (e.key === 'Escape') {
						e.preventDefault();
						this.cancel();
					}
				});
			}
		}
	}

	sync_options_bar() {
		if (this._updating_from_ui || !this.is_active()) return;

		const session = this.session;
		const ref = session.ref || ref_point(session.box, session.locator || 'c');

		const xInput = document.getElementById('ft_x');
		const yInput = document.getElementById('ft_y');
		const wInput = document.getElementById('ft_w');
		const hInput = document.getElementById('ft_h');
		const angleInput = document.getElementById('ft_angle');
		const skewXInput = document.getElementById('ft_skew_x');
		const skewYInput = document.getElementById('ft_skew_y');

		if (xInput && document.activeElement !== xInput) xInput.value = Math.round(ref.x * 10) / 10;
		if (yInput && document.activeElement !== yInput) yInput.value = Math.round(ref.y * 10) / 10;
		if (wInput && document.activeElement !== wInput) wInput.value = Math.round(session.w_pct * 10) / 10;
		if (hInput && document.activeElement !== hInput) hInput.value = Math.round(session.h_pct * 10) / 10;
		if (angleInput && document.activeElement !== angleInput) angleInput.value = Math.round((session.box.rotate || 0) * 10) / 10;
		if (skewXInput && document.activeElement !== skewXInput) skewXInput.value = Math.round((session.box.skew_x || 0) * 10) / 10;
		if (skewYInput && document.activeElement !== skewYInput) skewYInput.value = Math.round((session.box.skew_y || 0) * 10) / 10;

		const cells = document.querySelectorAll('#ft_locator_grid .transform_ref_cell');
		cells.forEach((cell) => {
			cell.classList.toggle('active', cell.dataset.loc === session.locator);
		});
	}
}
