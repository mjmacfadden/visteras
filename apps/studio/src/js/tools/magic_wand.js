import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Magic_wand_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'magic_wand';
		this.working = false;
	}

	dragStart(event) {
		if (config.TOOL.name !== this.name) return;
		this.mousedown(event);
	}

	load() {
		// Event routing for selection keyboard commands while Magic Wand is active
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
				if (app.Layers && app.Layers.Base_selection && app.Layers.Base_selection.has_selection) {
					e.preventDefault();
					this.fill(config.COLOR || '#000000');
				}
				return;
			}

			// Ctrl/Cmd + Delete/Backspace - fill background
			if ((e.ctrlKey || e.metaKey) && !e.altKey && (code === 46 || code === 8 || key === 'Delete' || key === 'Backspace')) {
				if (app.Layers && app.Layers.Base_selection && app.Layers.Base_selection.has_selection) {
					e.preventDefault();
					this.fill(config.COLOR_BG || '#ffffff');
				}
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

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (mouse.click_valid === false) return;

		const shift = (e.shiftKey === true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down === true);
		const alt = (e.altKey === true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down === true);

		let mode = null;
		if (shift && alt) {
			mode = 'intersect';
		} else if (shift) {
			mode = 'add';
		} else if (alt) {
			mode = 'subtract';
		}

		this.magic_wand(mouse, mode);
	}

	async magic_wand(mouse, modeOverride = null) {
		if (this.working) return;

		const W = Math.max(1, config.WIDTH || 800);
		const H = Math.max(1, config.HEIGHT || 600);

		const clickX = Math.round(mouse.x);
		const clickY = Math.round(mouse.y);
		if (clickX < 0 || clickX >= W || clickY < 0 || clickY >= H) {
			return;
		}

		const params = this.getParams();
		const tolerance = Math.max(0, Math.min(255, parseInt(params.tolerance?.value ?? params.tolerance ?? 32, 10)));
		const contiguous = (params.contiguous?.value ?? params.contiguous) !== false;
		const antiAliasing = (params.anti_aliasing?.value ?? params.anti_aliasing) !== false;
		const allLayers = (params.all_layers?.value ?? params.all_layers) === true;

		// Determine effective mode: 'replace' | 'add' | 'subtract' | 'intersect'
		let mode = modeOverride;
		if (!mode) {
			const paramMode = String(params.mode?.value ?? params.mode ?? 'New').toLowerCase();
			if (paramMode.includes('add')) {
				mode = 'add';
			} else if (paramMode.includes('sub')) {
				mode = 'subtract';
			} else if (paramMode.includes('inter')) {
				mode = 'intersect';
			} else {
				mode = 'replace';
			}
		}

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
			// Render active layer in document coordinate space
			sourceCanvas = this.Base_layers.convert_layer_to_canvas(config.layer.id, false, false);
		}

		if (!sourceCanvas) return;

		this.working = true;
		try {
			const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
			const srcImageData = sctx.getImageData(0, 0, W, H);
			const srcData = srcImageData.data;

			const startIdx = (clickY * W + clickX) * 4;
			const targetR = srcData[startIdx];
			const targetG = srcData[startIdx + 1];
			const targetB = srcData[startIdx + 2];
			const targetA = srcData[startIdx + 3];

			const totalPixels = W * H;
			const visited = new Uint8Array(totalPixels);

			// Helper to test color match against sampled target pixel
			const isMatch = (pxIdx) => {
				const byteIdx = pxIdx * 4;
				const r = srcData[byteIdx];
				const g = srcData[byteIdx + 1];
				const b = srcData[byteIdx + 2];
				const a = srcData[byteIdx + 3];

				if (targetA === 0) {
					// Sampled fully transparent area: match other low-alpha pixels within tolerance
					return a <= tolerance;
				}

				if (a === 0) {
					return false;
				}

				return (
					Math.abs(r - targetR) <= tolerance &&
					Math.abs(g - targetG) <= tolerance &&
					Math.abs(b - targetB) <= tolerance &&
					Math.abs(a - targetA) <= tolerance
				);
			};

			if (contiguous) {
				// 4-way flood fill using a fast typed array queue
				const queue = new Int32Array(totalPixels);
				let head = 0;
				let tail = 0;

				const startPos = clickY * W + clickX;
				if (isMatch(startPos)) {
					visited[startPos] = 1;
					queue[tail++] = startPos;

					while (head < tail) {
						const pos = queue[head++];
						const cx = pos % W;
						const cy = (pos / W) | 0;

						// West
						if (cx > 0) {
							const next = pos - 1;
							if (visited[next] === 0 && isMatch(next)) {
								visited[next] = 1;
								queue[tail++] = next;
							}
						}
						// East
						if (cx < W - 1) {
							const next = pos + 1;
							if (visited[next] === 0 && isMatch(next)) {
								visited[next] = 1;
								queue[tail++] = next;
							}
						}
						// North
						if (cy > 0) {
							const next = pos - W;
							if (visited[next] === 0 && isMatch(next)) {
								visited[next] = 1;
								queue[tail++] = next;
							}
						}
						// South
						if (cy < H - 1) {
							const next = pos + W;
							if (visited[next] === 0 && isMatch(next)) {
								visited[next] = 1;
								queue[tail++] = next;
							}
						}
					}
				}
			} else {
				// Global matching across the entire canvas
				for (let i = 0; i < totalPixels; i++) {
					if (isMatch(i)) {
						visited[i] = 1;
					}
				}
			}

			// Generate the new wand selection mask canvas (RGBA white with 255 alpha)
			const wandCanvas = document.createElement('canvas');
			wandCanvas.width = W;
			wandCanvas.height = H;
			const wandCtx = wandCanvas.getContext('2d');
			const wandImg = wandCtx.createImageData(W, H);
			const wandBuf32 = new Uint32Array(wandImg.data.buffer);

			for (let i = 0; i < totalPixels; i++) {
				if (visited[i] === 1) {
					wandBuf32[i] = 0xFFFFFFFF; // White opaque
				}
			}
			wandCtx.putImageData(wandImg, 0, 0);

			// Optional edge anti-aliasing
			if (antiAliasing) {
				const blurCanvas = document.createElement('canvas');
				blurCanvas.width = W;
				blurCanvas.height = H;
				const bctx = blurCanvas.getContext('2d');
				bctx.filter = 'blur(1px)';
				bctx.drawImage(wandCanvas, 0, 0);

				wandCtx.clearRect(0, 0, W, H);
				wandCtx.drawImage(blurCanvas, 0, 0);
			}

			// Combine wand selection with existing document selection
			const baseSelection = app.Layers.Base_selection;
			const hasExisting = baseSelection && baseSelection.has_selection;
			const oldMask = hasExisting ? baseSelection.clone_mask_canvas() : null;

			const combinedCanvas = document.createElement('canvas');
			combinedCanvas.width = W;
			combinedCanvas.height = H;
			const cctx = combinedCanvas.getContext('2d');

			if (mode === 'replace' || !hasExisting) {
				cctx.drawImage(wandCanvas, 0, 0);
			} else if (mode === 'add') {
				cctx.drawImage(oldMask, 0, 0);
				cctx.globalCompositeOperation = 'source-over';
				cctx.drawImage(wandCanvas, 0, 0);
			} else if (mode === 'subtract') {
				cctx.drawImage(oldMask, 0, 0);
				cctx.globalCompositeOperation = 'destination-out';
				cctx.drawImage(wandCanvas, 0, 0);
			} else if (mode === 'intersect') {
				cctx.drawImage(oldMask, 0, 0);
				cctx.globalCompositeOperation = 'destination-in';
				cctx.drawImage(wandCanvas, 0, 0);
			}

			await app.State.do_action(
				new app.Actions.Bundle_action('magic_wand_selection', 'Magic Wand Selection', [
					new app.Actions.Set_selection_action(combinedCanvas, oldMask)
				])
			);

		} catch (err) {
			console.error('Magic Wand error:', err);
			alertify.error('Error applying magic wand selection.');
		} finally {
			this.working = false;
		}
	}

	/**
	 * Options-bar attribute update handler (e.g. Select Subject quick action).
	 */
	async on_params_update(data) {
		const key = data && data.key;
		if (key === 'select_subject') {
			var Bg = null;
			try {
				var BgMod = (await import(/* webpackChunkName: "bg-auto" */ './../modules/tools/bg_auto.js')).default;
				Bg = new BgMod();
			} catch (err) {
				alertify.error('Could not load background-removal tools.');
				console.error(err);
				return;
			}
			await Bg.select_subject();
		}
	}

	/**
	 * Clears the active selection.
	 */
	clear_selection() {
		const selTool = app.GUI?.GUI_tools?.tools_modules['selection']?.object;
		if (selTool && typeof selTool.clear_selection === 'function') {
			selTool.clear_selection();
		} else if (app.Layers?.Base_selection) {
			app.Layers.Base_selection.clear_mask();
		}
	}

	/**
	 * Deletes the pixels within the active selection on the current layer.
	 */
	delete_selection() {
		const selTool = app.GUI?.GUI_tools?.tools_modules['selection']?.object;
		if (selTool && typeof selTool.delete_selection === 'function') {
			selTool.delete_selection();
		}
	}

	/**
	 * Fills the selection with the specified color.
	 */
	fill(color) {
		const selTool = app.GUI?.GUI_tools?.tools_modules['selection']?.object;
		if (selTool && typeof selTool.fill === 'function') {
			selTool.fill(color);
		}
	}
}

export default Magic_wand_class;
