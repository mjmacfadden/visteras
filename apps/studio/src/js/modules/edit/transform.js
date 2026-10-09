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

	free_transform(options = {}) {
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
		const selectedLayers = (app.Layers && typeof app.Layers.get_selected_layers === 'function')
			? app.Layers.get_selected_layers()
			: [config.layer];
		const layers = (selectedLayers && selectedLayers.length > 0) ? selectedLayers : [config.layer];

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

		// Switch to Move tool ('select')
		if (!config.TOOL || config.TOOL.name !== 'select') {
			if (app.GUI && app.GUI.GUI_tools) {
				app.GUI.GUI_tools.activate_tool('select');
			}
		}

		// Create transform session
		const session = create_transform_session(layers);
		session.mode = options.mode || 'free';
		session.locator = 'c';
		session.ref = ref_point(session.box, 'c');
		session.w_pct = 100;
		session.h_pct = 100;
		session.aspect_locked = true;

		this.session = session;

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
		this.session = null;

		const updateActions = [];
		for (const s of session.snapshot.layers) {
			const layer = app.Layers.get_layer(s.id, true);
			if (layer) {
				const changes = {};
				if (layer.x !== s.x) changes.x = layer.x;
				if (layer.y !== s.y) changes.y = layer.y;
				if (layer.width !== s.width) changes.width = layer.width;
				if (layer.height !== s.height) changes.height = layer.height;
				if ((layer.rotate || 0) !== (s.rotate || 0)) changes.rotate = layer.rotate || 0;
				if ((layer.skew_x || 0) !== (s.skew_x || 0)) changes.skew_x = layer.skew_x || 0;
				if ((layer.skew_y || 0) !== (s.skew_y || 0)) changes.skew_y = layer.skew_y || 0;
				if (layer.params && JSON.stringify(layer.params) !== JSON.stringify(s.params)) {
					changes.params = JSON.parse(JSON.stringify(layer.params));
				}

				if (Object.keys(changes).length > 0) {
					updateActions.push(new app.Actions.Update_layer_action(s.id, changes));
				}
			}
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
		this.session = null;

		restore_transform_session(session);

		if (app.GUI && app.GUI.GUI_tools) {
			app.GUI.GUI_tools.show_action_attributes();
		}
		this.Base_layers.render();
	}

	nudge(dx, dy) {
		if (!this.is_active()) return;
		for (const s of this.session.snapshot.layers) {
			const layer = app.Layers.get_layer(s.id, true);
			if (layer) {
				layer.x += dx;
				layer.y += dy;
			}
		}
		this.session.box.x += dx;
		this.session.box.y += dy;
		if (this.session.ref) {
			this.session.ref.x += dx;
			this.session.ref.y += dy;
		}
		this.sync_options_bar();
		this.Base_layers.render();
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
					<div class="transform_ref_cell ${session.locator === 'tl' ? 'active' : ''}" data-loc="tl"></div>
					<div class="transform_ref_cell ${session.locator === 'tc' ? 'active' : ''}" data-loc="tc"></div>
					<div class="transform_ref_cell ${session.locator === 'tr' ? 'active' : ''}" data-loc="tr"></div>
					<div class="transform_ref_cell ${session.locator === 'ml' ? 'active' : ''}" data-loc="ml"></div>
					<div class="transform_ref_cell ${session.locator === 'c' ? 'active' : ''}" data-loc="c"></div>
					<div class="transform_ref_cell ${session.locator === 'mr' ? 'active' : ''}" data-loc="mr"></div>
					<div class="transform_ref_cell ${session.locator === 'bl' ? 'active' : ''}" data-loc="bl"></div>
					<div class="transform_ref_cell ${session.locator === 'bc' ? 'active' : ''}" data-loc="bc"></div>
					<div class="transform_ref_cell ${session.locator === 'br' ? 'active' : ''}" data-loc="br"></div>
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
				<input type="number" id="ft_angle" step="any" value="${angleVal}" style="width:50px;"> °
			</div>
			<div class="item">
				<label for="ft_skew_x">H:</label>
				<input type="number" id="ft_skew_x" step="any" value="${skewXVal}" style="width:50px;"> °
			</div>
			<div class="item">
				<label for="ft_skew_y">V:</label>
				<input type="number" id="ft_skew_y" step="any" value="${skewYVal}" style="width:50px;"> °
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

		const onNumericChange = () => {
			if (this._updating_from_ui || !this.is_active()) return;
			this._updating_from_ui = true;

			const xInput = document.getElementById('ft_x');
			const yInput = document.getElementById('ft_y');
			const wInput = document.getElementById('ft_w');
			const hInput = document.getElementById('ft_h');
			const angleInput = document.getElementById('ft_angle');
			const skewXInput = document.getElementById('ft_skew_x');
			const skewYInput = document.getElementById('ft_skew_y');

			const newX = parseFloat(xInput.value);
			const newY = parseFloat(yInput.value);
			let newW = parseFloat(wInput.value);
			let newH = parseFloat(hInput.value);
			const newAngle = parseFloat(angleInput.value) || 0;
			const newSkewX = parseFloat(skewXInput.value) || 0;
			const newSkewY = parseFloat(skewYInput.value) || 0;

			const session = this.session;
			const ref = session.ref || ref_point(session.box, session.locator || 'c');

			// Translation
			if (!isNaN(newX) && !isNaN(newY)) {
				const dx = newX - ref.x;
				const dy = newY - ref.y;
				if (dx !== 0 || dy !== 0) {
					for (const s of session.snapshot.layers) {
						const l = app.Layers.get_layer(s.id, true);
						if (l) {
							l.x += dx;
							l.y += dy;
						}
					}
					session.box.x += dx;
					session.box.y += dy;
					ref.x += dx;
					ref.y += dy;
				}
			}

			// Scaling
			if (!isNaN(newW) && newW > 0 && !isNaN(newH) && newH > 0) {
				const oldW = session.w_pct;
				const oldH = session.h_pct;
				if (newW !== oldW || newH !== oldH) {
					if (session.aspect_locked) {
						if (newW !== oldW) {
							newH = newW;
							hInput.value = Math.round(newH * 10) / 10;
						} else if (newH !== oldH) {
							newW = newH;
							wInput.value = Math.round(newW * 10) / 10;
						}
					}
					const sx = newW / oldW;
					const sy = newH / oldH;
					session.box = scale_about(session.box, ref, sx, sy);
					for (const s of session.snapshot.layers) {
						const l = app.Layers.get_layer(s.id, true);
						if (l) {
							const scaled = scale_about(
								{ x: l.x, y: l.y, width: l.width, height: l.height, rotate: l.rotate },
								ref,
								sx,
								sy
							);
							l.x = Math.round(scaled.x);
							l.y = Math.round(scaled.y);
							l.width = Math.round(scaled.width);
							l.height = Math.round(scaled.height);
						}
					}
					session.w_pct = newW;
					session.h_pct = newH;
				}
			}

			// Rotation
			const deltaRot = newAngle - (session.box.rotate || 0);
			if (deltaRot !== 0) {
				session.box = rotate_about(session.box, ref, deltaRot);
				for (const s of session.snapshot.layers) {
					const l = app.Layers.get_layer(s.id, true);
					if (l) {
						const rotated = rotate_about(
							{ x: l.x, y: l.y, width: l.width, height: l.height, rotate: l.rotate || 0 },
							ref,
							deltaRot
						);
						l.x = Math.round(rotated.x);
						l.y = Math.round(rotated.y);
						l.rotate = rotated.rotate;
					}
				}
			}

			// Skew
			session.box.skew_x = newSkewX;
			session.box.skew_y = newSkewY;
			for (const s of session.snapshot.layers) {
				const l = app.Layers.get_layer(s.id, true);
				if (l) {
					l.skew_x = newSkewX;
					l.skew_y = newSkewY;
				}
			}

			this._updating_from_ui = false;
			this.Base_layers.render();
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
						onNumericChange();
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

		if (xInput) xInput.value = Math.round(ref.x * 10) / 10;
		if (yInput) yInput.value = Math.round(ref.y * 10) / 10;
		if (wInput) wInput.value = Math.round(session.w_pct * 10) / 10;
		if (hInput) hInput.value = Math.round(session.h_pct * 10) / 10;
		if (angleInput) angleInput.value = Math.round((session.box.rotate || 0) * 10) / 10;
		if (skewXInput) skewXInput.value = Math.round((session.box.skew_x || 0) * 10) / 10;
		if (skewYInput) skewYInput.value = Math.round((session.box.skew_y || 0) * 10) / 10;

		const cells = document.querySelectorAll('#ft_locator_grid .transform_ref_cell');
		cells.forEach((cell) => {
			cell.classList.toggle('active', cell.dataset.loc === session.locator);
		});
	}
}
