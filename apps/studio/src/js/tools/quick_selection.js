/**
 * Quick Selection Tool for Visteras Studio
 * 
 * Photoshop-style intelligent brush selection:
 * - Samples color metrics directly under the brush core
 * - Edge-aware regional expansion constrained by gradients and color similarity
 * - Supports Add, Subtract, and New modes
 * - Dynamic Alt / Option key inversion to Subtract mode
 * - Live marching ants preview during strokes
 * - Full Undo / Redo history integration
 */

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Quick_selection_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'quick_selection';

		this.is_drawing = false;
		this.working = false;
		this.old_mask_snapshot = null;
		this.accumulated_stroke = null;
		this.effective_mode = 'add';
		this.srcData = null;
		this.srcWidth = 0;
		this.srcHeight = 0;
		this.last_pos = null;
		this.preview_raf = null;
		this.preview_canvas = null;
	}

	load() {
		// Event routing for keyboard shortcuts while Quick Selection is active
		document.addEventListener('keydown', (e) => {
			if (config.TOOL && config.TOOL.name !== this.name) return;
			if (this.Helper.is_input(e.target) || this.Helper.is_input(document.activeElement)) return;

			const code = e.keyCode;
			const key = e.key;

			// Escape or Ctrl+D / Cmd+D - Deselect
			if (code === 27 || key === 'Escape' || ((code === 68 || key === 'd' || key === 'D') && (e.ctrlKey || e.metaKey))) {
				if (app.Layers && app.Layers.Base_selection && app.Layers.Base_selection.has_selection) {
					e.preventDefault();
					this.clear_selection();
				}
				return;
			}

			// Alt/Option + Delete/Backspace - fill foreground
			if (e.altKey && !e.ctrlKey && !e.metaKey && (code === 46 || code === 8 || key === 'Delete' || key === 'Backspace')) {
				e.preventDefault();
				this.fill(config.COLOR || '#000000');
				return;
			}

			// Ctrl/Cmd + Delete/Backspace - fill background
			if ((e.ctrlKey || e.metaKey) && !e.altKey && (code === 46 || code === 8 || key === 'Delete' || key === 'Backspace')) {
				e.preventDefault();
				this.fill(config.COLOR_BG || '#ffffff');
				return;
			}

			// Delete / Backspace - delete selected pixels on active layer
			if (!e.altKey && !e.ctrlKey && !e.metaKey && (code === 46 || code === 8 || key === 'Delete' || key === 'Backspace')) {
				if (app.Layers && app.Layers.Base_selection && app.Layers.Base_selection.has_selection) {
					e.preventDefault();
					this.delete_selection();
				}
				return;
			}
		}, false);
	}

	on_leave() {
		if (this.is_drawing) {
			this.is_drawing = false;
			this.clear_preview();
		}
		this.srcData = null;
		this.accumulated_stroke = null;
		this.old_mask_snapshot = null;
	}

	get_effective_mode(event) {
		const shift = (event && event.shiftKey === true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down === true);
		const alt = (event && event.altKey === true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down === true);

		if (alt) {
			return 'subtract';
		}
		if (shift) {
			return 'add';
		}

		const params = this.getParams();
		const paramMode = String(params.mode?.value ?? params.mode ?? 'Add').toLowerCase();
		if (paramMode.includes('sub')) {
			return 'subtract';
		}
		if (paramMode.includes('new')) {
			return 'replace';
		}
		return 'add';
	}

	dragStart(event) {
		if (config.TOOL.name !== this.name) return;
		this.mousedown(event);
	}

	dragMove(event) {
		if (config.TOOL.name !== this.name) return;
		this.mousemove(event);
	}

	dragEnd(event) {
		if (config.TOOL.name !== this.name) return;
		this.mouseup(event);
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (mouse.click_valid === false) return;

		const W = Math.max(1, config.WIDTH || 800);
		const H = Math.max(1, config.HEIGHT || 600);
		const params = this.getParams();
		const allLayers = (params.all_layers?.value ?? params.all_layers) === true;

		// Retrieve source canvas
		let sourceCanvas = null;
		if (allLayers) {
			sourceCanvas = document.createElement('canvas');
			sourceCanvas.width = W;
			sourceCanvas.height = H;
			const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
			this.Base_layers.convert_layers_to_canvas(sctx, null, false);
		} else {
			if (!config.layer) {
				alertify.error('No layer selected. Please select a layer first.');
				return;
			}
			if (config.layer.visible === false) {
				alertify.error('The active layer is hidden.');
				return;
			}
			sourceCanvas = this.Base_layers.convert_layer_to_canvas(config.layer.id, false, false);
		}

		if (!sourceCanvas) return;

		const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
		const srcImageData = sctx.getImageData(0, 0, W, H);
		this.srcData = srcImageData.data;
		this.srcWidth = W;
		this.srcHeight = H;

		this.effective_mode = this.get_effective_mode(e);
		const baseSelection = app.Layers && app.Layers.Base_selection;
		this.old_mask_snapshot = (baseSelection && baseSelection.has_selection) ? baseSelection.clone_mask_canvas() : null;

		this.accumulated_stroke = new Uint8Array(W * H);
		this.is_drawing = true;
		this.last_pos = { x: mouse.x, y: mouse.y };

		this.apply_dab(mouse.x, mouse.y);
		this.schedule_preview();
	}

	mousemove(e) {
		if (!this.is_drawing) return;

		const mouse = this.get_mouse_info(e);
		if (mouse.x == null || mouse.y == null) return;

		const params = this.getParams();
		const size = Math.max(1, Math.min(300, parseInt(params.size?.value ?? params.size ?? 30, 10)));
		const radius = Math.max(2, Math.round(size / 2));
		const stepSize = Math.max(2, Math.round(radius * 0.35));

		const dx = mouse.x - this.last_pos.x;
		const dy = mouse.y - this.last_pos.y;
		const dist = Math.hypot(dx, dy);

		if (dist >= stepSize) {
			const steps = Math.ceil(dist / stepSize);
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				const ix = this.last_pos.x + dx * t;
				const iy = this.last_pos.y + dy * t;
				this.apply_dab(ix, iy);
			}
			this.last_pos = { x: mouse.x, y: mouse.y };
			this.schedule_preview();
		}
	}

	async mouseup(e) {
		if (!this.is_drawing) return;
		this.is_drawing = false;

		if (this.preview_raf != null) {
			cancelAnimationFrame(this.preview_raf);
			this.preview_raf = null;
		}

		const W = this.srcWidth;
		const H = this.srcHeight;
		const totalPixels = W * H;

		// Check if any pixels were selected in this stroke
		let strokePixelCount = 0;
		for (let i = 0; i < totalPixels; i++) {
			if (this.accumulated_stroke[i] > 0) {
				strokePixelCount++;
			}
		}

		if (strokePixelCount === 0) {
			this.clear_preview();
			this.cleanup();
			return;
		}

		const params = this.getParams();
		const antiAliasing = (params.anti_aliasing?.value ?? params.anti_aliasing) !== false;

		// Convert accumulated stroke to a mask canvas
		const strokeCanvas = document.createElement('canvas');
		strokeCanvas.width = W;
		strokeCanvas.height = H;
		const sctx = strokeCanvas.getContext('2d');
		const sImg = sctx.createImageData(W, H);
		const sBuf32 = new Uint32Array(sImg.data.buffer);

		for (let i = 0; i < totalPixels; i++) {
			const val = this.accumulated_stroke[i];
			if (val > 0) {
				// RGBA: (val, val, val, val)
				sBuf32[i] = (val << 24) | (val << 16) | (val << 8) | val;
			}
		}
		sctx.putImageData(sImg, 0, 0);

		// Optional anti-aliasing edge softening
		if (antiAliasing) {
			const blurCanvas = document.createElement('canvas');
			blurCanvas.width = W;
			blurCanvas.height = H;
			const bctx = blurCanvas.getContext('2d');
			bctx.filter = 'blur(0.8px)';
			bctx.drawImage(strokeCanvas, 0, 0);

			sctx.clearRect(0, 0, W, H);
			sctx.drawImage(blurCanvas, 0, 0);
		}

		// Composite with existing document mask
		const combinedCanvas = document.createElement('canvas');
		combinedCanvas.width = W;
		combinedCanvas.height = H;
		const cctx = combinedCanvas.getContext('2d');

		const mode = this.effective_mode;
		const hasOld = this.old_mask_snapshot != null;

		if (mode === 'replace' || !hasOld) {
			cctx.drawImage(strokeCanvas, 0, 0);
		} else if (mode === 'add') {
			cctx.drawImage(this.old_mask_snapshot, 0, 0);
			cctx.globalCompositeOperation = 'source-over';
			cctx.drawImage(strokeCanvas, 0, 0);
		} else if (mode === 'subtract') {
			cctx.drawImage(this.old_mask_snapshot, 0, 0);
			cctx.globalCompositeOperation = 'destination-out';
			cctx.drawImage(strokeCanvas, 0, 0);
		}

		this.clear_preview();

		try {
			await app.State.do_action(
				new app.Actions.Bundle_action('quick_selection', 'Quick Selection', [
					new app.Actions.Set_selection_action(combinedCanvas, this.old_mask_snapshot)
				])
			);
		} catch (err) {
			console.error('Quick Selection action error:', err);
		} finally {
			this.cleanup();
		}
	}

	cleanup() {
		this.srcData = null;
		this.accumulated_stroke = null;
		this.old_mask_snapshot = null;
		this.last_pos = null;
	}

	apply_dab(cx, cy) {
		if (!this.srcData) return;

		const W = this.srcWidth;
		const H = this.srcHeight;
		const params = this.getParams();
		const size = Math.max(1, Math.min(300, parseInt(params.size?.value ?? params.size ?? 30, 10)));
		const tolerance = Math.max(1, Math.min(100, parseInt(params.tolerance?.value ?? params.tolerance ?? 32, 10)));
		const radius = Math.max(2, Math.round(size / 2));
		const expRadius = Math.max(3, Math.round(radius * 1.35));
		const coreRadius = Math.max(1, Math.round(radius * 0.45));

		// Bounding box for local expansion
		const x0 = Math.max(0, Math.floor(cx - expRadius));
		const y0 = Math.max(0, Math.floor(cy - expRadius));
		const x1 = Math.min(W - 1, Math.ceil(cx + expRadius));
		const y1 = Math.min(H - 1, Math.ceil(cy + expRadius));
		const lw = x1 - x0 + 1;
		const lh = y1 - y0 + 1;

		if (lw <= 0 || lh <= 0) return;

		// Sample seed color at center pixel
		const centerPx = Math.max(0, Math.min(W - 1, Math.round(cx)));
		const centerPy = Math.max(0, Math.min(H - 1, Math.round(cy)));
		const centerIdx = (centerPy * W + centerPx) * 4;
		const cr = this.srcData[centerIdx];
		const cg = this.srcData[centerIdx + 1];
		const cb = this.srcData[centerIdx + 2];
		const ca = this.srcData[centerIdx + 3];

		let sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;
		const coreR2 = coreRadius * coreRadius;
		const tolSq = tolerance * tolerance * 3.5;

		for (let py = Math.max(0, Math.floor(cy - coreRadius)); py <= Math.min(H - 1, Math.ceil(cy + coreRadius)); py++) {
			const dy = py - cy;
			for (let px = Math.max(0, Math.floor(cx - coreRadius)); px <= Math.min(W - 1, Math.ceil(cx + coreRadius)); px++) {
				const dx = px - cx;
				if (dx * dx + dy * dy <= coreR2) {
					const idx = (py * W + px) * 4;
					const r = this.srcData[idx];
					const g = this.srcData[idx + 1];
					const b = this.srcData[idx + 2];
					const a = this.srcData[idx + 3];
					const cDiffSq = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2 + 2 * (a - ca) ** 2;
					if (cDiffSq <= tolSq) {
						sumR += r;
						sumG += g;
						sumB += b;
						sumA += a;
						count++;
					}
				}
			}
		}

		const avgR = count > 0 ? (sumR / count) : cr;
		const avgG = count > 0 ? (sumG / count) : cg;
		const avgB = count > 0 ? (sumB / count) : cb;
		const avgA = count > 0 ? (sumA / count) : ca;

		// Local BFS expansion within bounding box
		const totalLocal = lw * lh;
		const localVisited = new Uint8Array(totalLocal);
		const queue = new Int32Array(totalLocal);
		let head = 0, tail = 0;

		// Seed initial pixels inside core that match seed color
		for (let py = Math.max(0, Math.floor(cy - coreRadius)); py <= Math.min(H - 1, Math.ceil(cy + coreRadius)); py++) {
			const dy = py - cy;
			for (let px = Math.max(0, Math.floor(cx - coreRadius)); px <= Math.min(W - 1, Math.ceil(cx + coreRadius)); px++) {
				const dx = px - cx;
				if (dx * dx + dy * dy <= coreR2) {
					const idx = (py * W + px) * 4;
					const r = this.srcData[idx];
					const g = this.srcData[idx + 1];
					const b = this.srcData[idx + 2];
					const a = this.srcData[idx + 3];
					const diffSq = (r - avgR) ** 2 + (g - avgG) ** 2 + (b - avgB) ** 2 + 2 * (a - avgA) ** 2;
					if (diffSq <= tolSq) {
						const locX = px - x0;
						const locY = py - y0;
						const locIdx = locY * lw + locX;
						if (localVisited[locIdx] === 0) {
							localVisited[locIdx] = 1;
							queue[tail++] = locIdx;
							this.accumulated_stroke[py * W + px] = 255;
						}
					}
				}
			}
		}

		const r2 = radius * radius;
		const expR2 = expRadius * expRadius;

		while (head < tail) {
			const curLoc = queue[head++];
			const clocX = curLoc % lw;
			const clocY = (curLoc / lw) | 0;
			const cpx = x0 + clocX;
			const cpy = y0 + clocY;
			const cIdx = (cpy * W + cpx) * 4;
			const pr = this.srcData[cIdx];
			const pg = this.srcData[cIdx + 1];
			const pb = this.srcData[cIdx + 2];
			const pa = this.srcData[cIdx + 3];

			// 4-connected neighbors
			const neighbors = [
				[clocX - 1, clocY],
				[clocX + 1, clocY],
				[clocX, clocY - 1],
				[clocX, clocY + 1]
			];

			for (let n = 0; n < 4; n++) {
				const nlocX = neighbors[n][0];
				const nlocY = neighbors[n][1];

				if (nlocX < 0 || nlocX >= lw || nlocY < 0 || nlocY >= lh) continue;

				const nLocIdx = nlocY * lw + nlocX;
				if (localVisited[nLocIdx] === 1) continue;

				const npx = x0 + nlocX;
				const npy = y0 + nlocY;
				const ndx = npx - cx;
				const ndy = npy - cy;
				const distSq = ndx * ndx + ndy * ndy;

				if (distSq > expR2) continue;

				const nIdx = (npy * W + npx) * 4;
				const nr = this.srcData[nIdx];
				const ng = this.srcData[nIdx + 1];
				const nb = this.srcData[nIdx + 2];
				const na = this.srcData[nIdx + 3];

				// Color difference to seed
				const seedDiffSq = (nr - avgR) * (nr - avgR) +
					(ng - avgG) * (ng - avgG) +
					(nb - avgB) * (nb - avgB) +
					2 * (na - avgA) * (na - avgA);

				// Step difference across adjacent boundary
				const stepDiffSq = (nr - pr) * (nr - pr) +
					(ng - pg) * (ng - pg) +
					(nb - pb) * (nb - pb) +
					2 * (na - pa) * (na - pa);

				let accept = false;
				if (distSq <= r2) {
					accept = (seedDiffSq <= tolSq * 1.25);
				} else {
					accept = (seedDiffSq <= tolSq && stepDiffSq <= tolSq * 0.75);
				}

				if (accept) {
					localVisited[nLocIdx] = 1;
					queue[tail++] = nLocIdx;
					this.accumulated_stroke[npy * W + npx] = 255;
				}
			}
		}
	}

	schedule_preview() {
		if (this.preview_raf != null) return;
		this.preview_raf = requestAnimationFrame(() => {
			this.preview_raf = null;
			this.render_live_preview();
		});
	}

	render_live_preview() {
		if (!this.is_drawing || !this.accumulated_stroke) return;

		const W = this.srcWidth;
		const H = this.srcHeight;
		const totalPixels = W * H;

		if (!this.preview_canvas) {
			this.preview_canvas = document.createElement('canvas');
		}
		if (this.preview_canvas.width !== W || this.preview_canvas.height !== H) {
			this.preview_canvas.width = W;
			this.preview_canvas.height = H;
		}

		const pctx = this.preview_canvas.getContext('2d');
		pctx.clearRect(0, 0, W, H);

		// Build temporary stroke canvas
		const strokeImg = pctx.createImageData(W, H);
		const sBuf32 = new Uint32Array(strokeImg.data.buffer);
		for (let i = 0; i < totalPixels; i++) {
			if (this.accumulated_stroke[i] > 0) {
				sBuf32[i] = 0xFFFFFFFF;
			}
		}
		pctx.putImageData(strokeImg, 0, 0);

		// Composite with old mask
		const previewCombined = document.createElement('canvas');
		previewCombined.width = W;
		previewCombined.height = H;
		const pcctx = previewCombined.getContext('2d');

		const mode = this.effective_mode;
		const hasOld = this.old_mask_snapshot != null;

		if (mode === 'replace' || !hasOld) {
			pcctx.drawImage(this.preview_canvas, 0, 0);
		} else if (mode === 'add') {
			pcctx.drawImage(this.old_mask_snapshot, 0, 0);
			pcctx.globalCompositeOperation = 'source-over';
			pcctx.drawImage(this.preview_canvas, 0, 0);
		} else if (mode === 'subtract') {
			pcctx.drawImage(this.old_mask_snapshot, 0, 0);
			pcctx.globalCompositeOperation = 'destination-out';
			pcctx.drawImage(this.preview_canvas, 0, 0);
		}

		if (app.Layers && app.Layers.Base_selection && typeof app.Layers.Base_selection.set_preview_mask === 'function') {
			app.Layers.Base_selection.set_preview_mask(previewCombined);
		}
	}

	clear_preview() {
		if (app.Layers && app.Layers.Base_selection && typeof app.Layers.Base_selection.clear_preview_mask === 'function') {
			app.Layers.Base_selection.clear_preview_mask();
		}
	}

	/**
	 * Options-bar attribute update handler.
	 */
	async on_params_update(data) {
		const key = data && data.key;
		if (key === 'select_subject') {
			try {
				const BgMod = (await import(/* webpackChunkName: "bg-auto" */ './../modules/tools/bg_auto.js')).default;
				const Bg = new BgMod();
				await Bg.select_subject();
			} catch (err) {
				alertify.error('Could not load background-removal tools.');
				console.error(err);
			}
		}
	}

	clear_selection() {
		const selTool = app.GUI?.GUI_tools?.tools_modules['selection']?.object;
		if (selTool && typeof selTool.clear_selection === 'function') {
			selTool.clear_selection();
		} else if (app.Layers?.Base_selection) {
			app.Layers.Base_selection.clear_mask();
		}
	}

	delete_selection() {
		const selTool = app.GUI?.GUI_tools?.tools_modules['selection']?.object;
		if (selTool && typeof selTool.delete_selection === 'function') {
			selTool.delete_selection();
		}
	}

	fill(color) {
		const selTool = app.GUI?.GUI_tools?.tools_modules['selection']?.object;
		if (selTool && typeof selTool.fill === 'function') {
			selTool.fill(color);
		}
	}
}

export default Quick_selection_class;
