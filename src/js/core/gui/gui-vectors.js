/**
 * GUI class responsible for rendering the Vectors panel in the right sidebar.
 * Sibling panel alongside Layers (tabbed navigation LAYERS | VECTORS).
 */

import app from '../../app.js';
import config from '../../config.js';
import Helper_class from '../../libs/helpers.js';
import Vector_manager from '../vector/vector-manager.js';
import Vector_renderer from '../vector/vector-renderer.js';
import { Vector } from '../vector/vector-model.js';
import { Insert_vector_action } from '../../actions/vector/insert-vector.js';
import { Delete_vector_action } from '../../actions/vector/delete-vector.js';
import { Update_vector_action } from '../../actions/vector/update-vector.js';
import { vector_to_selection } from '../vector/vector-to-selection.js';
import alertify from '../../../../node_modules/alertifyjs/build/alertify.min.js';

var template = `
	<div class="vectors_header" id="vectors_header">
		<div class="vectors_header_actions">
			<button type="button" class="vector_hdr_btn" id="vector_to_selection_btn" title="Convert Vector to Selection">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>
				</svg>
				<span class="trn">Selection</span>
			</button>
			<button type="button" class="vector_hdr_btn" id="vector_stroke_btn" title="Stroke Vector">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="8"/>
				</svg>
				<span class="trn">Stroke</span>
			</button>
			<button type="button" class="vector_hdr_btn" id="vector_fill_btn" title="Fill Vector">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					<circle cx="12" cy="12" r="8"/>
				</svg>
				<span class="trn">Fill</span>
			</button>
		</div>
	</div>
	<div class="vectors_list" id="vectors_list"></div>
	<div class="vectors_footer">
		<button type="button" class="status_btn" id="btn_new_vector" title="New Vector">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="12" y1="5" x2="12" y2="19"/>
				<line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
		</button>
		<button type="button" class="status_btn" id="btn_duplicate_vector" title="Duplicate Vector">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
				<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
			</svg>
		</button>
		<button type="button" class="status_btn" id="btn_delete_vector" title="Delete Vector">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="3 6 5 6 21 6"/>
				<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
			</svg>
		</button>
	</div>
`;

class GUI_vectors_class {
	constructor(GUI) {
		this.GUI = GUI;
		this.Helper = new Helper_class();
	}

	render_main_vectors() {
		const target = document.getElementById('vectors_base');
		if (!target) return;
		target.innerHTML = template;
		this.render_vectors();
		this.set_events();
	}

	render_vectors() {
		const container = document.getElementById('vectors_list');
		if (!container) return;

		const vectors = Vector_manager.get_vectors();
		if (vectors.length === 0) {
			container.innerHTML = '<div class="vectors_empty_msg">No vectors in this document.<br><small>Use Pen Tool (P) or Click "+" to create one.</small></div>';
			return;
		}

		let html = '';
		for (let i = vectors.length - 1; i >= 0; i--) {
			const vec = vectors[i];
			const isActive = (vec.id === Vector_manager.active_vector_id);
			const isVisible = vec.visible !== false;
			const isLocked = vec.locked === true;

			const subpathCount = vec.paths ? vec.paths.length : 0;
			const totalAnchors = vec.paths ? vec.paths.reduce((acc, p) => acc + (p.anchors ? p.anchors.length : 0), 0) : 0;

			html += `
				<div class="vector_row ${isActive ? 'active' : ''}" data-id="${this.Helper.escapeHtml(String(vec.id))}">
					<div class="vector_col_vis" data-id="${this.Helper.escapeHtml(String(vec.id))}" title="Toggle Visibility">
						<span class="vector_vis_icon ${isVisible ? 'visible' : 'hidden_eye'}"></span>
					</div>
					<div class="vector_col_thumb">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${vec.stroke || '#4a9eff'}" stroke-width="2">
							<path d="M12 19l7-7 3 3-7 7-3-3z"/>
							<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
						</svg>
					</div>
					<div class="vector_col_title" data-id="${this.Helper.escapeHtml(String(vec.id))}">
						<span class="vector_name_text">${this.Helper.escapeHtml(vec.name || 'Vector')}</span>
						<span class="vector_sub_info">${subpathCount} ${subpathCount === 1 ? 'path' : 'paths'} (${totalAnchors} ${totalAnchors === 1 ? 'pt' : 'pts'})</span>
					</div>
					<div class="vector_col_lock" data-id="${this.Helper.escapeHtml(String(vec.id))}" title="${isLocked ? 'Unlock Vector' : 'Lock Vector'}">
						<span class="vector_lock_icon ${isLocked ? 'locked' : ''}"></span>
					</div>
				</div>
			`;
		}

		container.innerHTML = html;
	}

	set_events() {
		const target = document.getElementById('vectors_base');
		if (!target) return;

		target.addEventListener('click', (e) => {
			const row = e.target.closest('.vector_row');
			const visBtn = e.target.closest('.vector_col_vis');
			const lockBtn = e.target.closest('.vector_col_lock');
			const nameCol = e.target.closest('.vector_col_title');

			// Visibility Toggle
			if (visBtn) {
				e.stopPropagation();
				const id = visBtn.dataset.id;
				const vec = config.vectors.find(v => v.id === id);
				if (vec) {
					app.State.do_action(new Update_vector_action(id, { visible: !vec.visible }));
				}
				return;
			}

			// Lock Toggle
			if (lockBtn) {
				e.stopPropagation();
				const id = lockBtn.dataset.id;
				const vec = config.vectors.find(v => v.id === id);
				if (vec) {
					app.State.do_action(new Update_vector_action(id, { locked: !vec.locked }));
				}
				return;
			}

			// Row Click / Active Selection
			if (row) {
				const id = row.dataset.id;
				Vector_manager.set_active_vector(id);
				this.render_vectors();
				return;
			}

			// New Vector Button
			if (e.target.closest('#btn_new_vector')) {
				const count = (config.vectors ? config.vectors.length : 0) + 1;
				const newVec = new Vector({
					name: 'Vector ' + count,
					mode: 'path',
					stroke: config.COLOR || '#008000'
				});
				app.State.do_action(new Insert_vector_action(newVec));
				return;
			}

			// Delete Vector Button
			if (e.target.closest('#btn_delete_vector')) {
				if (Vector_manager.active_vector_id) {
					app.State.do_action(new Delete_vector_action(Vector_manager.active_vector_id));
				}
				return;
			}

			// Duplicate Vector Button
			if (e.target.closest('#btn_duplicate_vector')) {
				const active = Vector_manager.get_active_vector();
				if (active) {
					const dup = active.clone();
					dup.id = 'vec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
					dup.name = active.name + ' Copy';
					app.State.do_action(new Insert_vector_action(dup));
				}
				return;
			}

			// Convert to Selection Button
			if (e.target.closest('#vector_to_selection_btn')) {
				const active = Vector_manager.get_active_vector();
				if (active) {
					vector_to_selection(active);
					alertify.success('Created selection from vector path.');
				} else {
					alertify.error('Please select a vector first.');
				}
				return;
			}

			// Stroke Vector Button
			if (e.target.closest('#vector_stroke_btn')) {
				this.stroke_active_vector();
				return;
			}

			// Fill Vector Button
			if (e.target.closest('#vector_fill_btn')) {
				this.fill_active_vector();
				return;
			}
		});

		// Double-click to rename vector
		target.addEventListener('dblclick', (e) => {
			const nameCol = e.target.closest('.vector_col_title');
			if (nameCol) {
				const id = nameCol.dataset.id;
				const vec = config.vectors.find(v => v.id === id);
				if (!vec) return;

				const nameSpan = nameCol.querySelector('.vector_name_text');
				if (!nameSpan) return;

				const currentName = vec.name || 'Vector';
				const input = document.createElement('input');
				input.type = 'text';
				input.className = 'vector_rename_input';
				input.value = currentName;

				const finishRename = () => {
					const newName = input.value.trim() || currentName;
					if (newName !== currentName) {
						app.State.do_action(new Update_vector_action(id, { name: newName }));
					} else {
						nameSpan.textContent = currentName;
						input.remove();
						nameSpan.style.display = '';
					}
				};

				input.addEventListener('blur', finishRename);
				input.addEventListener('keydown', (evt) => {
					if (evt.key === 'Enter') {
						finishRename();
					} else if (evt.key === 'Escape') {
						nameSpan.textContent = currentName;
						input.remove();
						nameSpan.style.display = '';
					}
				});

				nameSpan.style.display = 'none';
				nameCol.insertBefore(input, nameSpan);
				input.focus();
				input.select();
			}
		});
	}

	stroke_active_vector() {
		const vec = Vector_manager.get_active_vector();
		if (!vec) {
			alertify.error('Select a vector to stroke.');
			return;
		}
		if (!config.layer || config.layer.type !== 'image') {
			alertify.error('Active layer must be an image layer to stroke vector pixels.');
			return;
		}

		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d');

		if (config.layer.link) {
			ctx.drawImage(config.layer.link, config.layer.x || 0, config.layer.y || 0);
		}

		// Create a stroke-only clone vector for precise rendering with full anti-aliasing
		const strokeVec = vec.clone();
		strokeVec.fill = 'none';
		strokeVec.stroke = vec.stroke || config.COLOR || '#008000';
		strokeVec.stroke_width = vec.stroke_width || 2;
		strokeVec.stroke_align = vec.stroke_align || 'center';
		strokeVec.stroke_join = vec.stroke_join || 'round';
		strokeVec.stroke_cap = vec.stroke_cap || 'round';
		Vector_renderer.render_vector(ctx, strokeVec);

		app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas)
		);
		alertify.success('Stroked vector onto active layer.');
	}

	fill_active_vector() {
		const vec = Vector_manager.get_active_vector();
		if (!vec) {
			alertify.error('Select a vector to fill.');
			return;
		}
		if (!config.layer || config.layer.type !== 'image') {
			alertify.error('Active layer must be an image layer to fill vector pixels.');
			return;
		}

		const canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		const ctx = canvas.getContext('2d');

		if (config.layer.link) {
			ctx.drawImage(config.layer.link, config.layer.x || 0, config.layer.y || 0);
		}

		// Create a fill-only clone vector for precise rendering with full anti-aliasing
		const fillVec = vec.clone();
		fillVec.stroke = 'none';
		fillVec.fill = vec.fill || config.COLOR || '#008000';
		Vector_renderer.render_vector(ctx, fillVec);

		app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas)
		);
		alertify.success('Filled vector onto active layer.');
	}
}

export default GUI_vectors_class;
