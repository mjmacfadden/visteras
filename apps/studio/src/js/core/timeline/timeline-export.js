/**
 * Timeline Exporters: Animated GIF and PNG Spritesheet
 */

import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import filesaver from './../../../../node_modules/file-saver/dist/FileSaver.min.js';

import { GIF_WORKER_CODE } from './gif-worker.js';

export class Timeline_export_class {

	constructor() {
		this.POP = new Dialog_class();
	}

	/**
	 * Export animation as an animated GIF.
	 */
	async export_gif(frameManager, fps = 12, transparent = true, filename = null) {
		frameManager.sync_active_frame();
		const framesCount = frameManager.frames.length;
		if (framesCount === 0) {
			alertify.error('No frames to export.');
			return;
		}

		alertify.success('Rendering GIF animation...');

		let workerScriptUrl = null;

		try {
			const { default: GIF } = await import(/* webpackChunkName: "gif-export" */ './../../../../node_modules/gif.js.optimized/');

			const workerBlob = new Blob([GIF_WORKER_CODE], { type: 'application/javascript' });
			workerScriptUrl = URL.createObjectURL(workerBlob);

			const delay = Math.max(20, Math.round(1000 / (fps || 12)));
			const gifSettings = {
				workers: 2,
				quality: 1,
				width: config.WIDTH || 800,
				height: config.HEIGHT || 600,
				workerScript: workerScriptUrl,
				repeat: 0,
				transparent: transparent ? true : null
			};

			const gif = new GIF(gifSettings);

			for (let i = 0; i < framesCount; i++) {
				const frameCanvas = frameManager.get_frame_canvas(i);
				if (frameCanvas) {
					let exportCanvas = frameCanvas;
					if (!transparent) {
						const bgCanvas = document.createElement('canvas');
						bgCanvas.width = frameCanvas.width;
						bgCanvas.height = frameCanvas.height;
						const bgCtx = bgCanvas.getContext('2d');
						bgCtx.fillStyle = config.COLOR_BG || '#ffffff';
						bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
						bgCtx.drawImage(frameCanvas, 0, 0);
						exportCanvas = bgCanvas;
					}
					const ctx = exportCanvas.getContext('2d');
					const imageData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
					gif.addFrame(imageData, { copy: true, delay: delay });
				}
			}

			gif.on('finished', (blob) => {
				if (workerScriptUrl) {
					URL.revokeObjectURL(workerScriptUrl);
					workerScriptUrl = null;
				}
				const name = filename || (config.SAVE_NAME || 'animation') + '.gif';
				filesaver.saveAs(blob, name);
				alertify.success('GIF exported successfully.');
			});

			gif.on('abort', () => {
				if (workerScriptUrl) {
					URL.revokeObjectURL(workerScriptUrl);
					workerScriptUrl = null;
				}
			});

			gif.render();
		} catch (err) {
			if (workerScriptUrl) {
				URL.revokeObjectURL(workerScriptUrl);
				workerScriptUrl = null;
			}
			console.error('GIF export failed:', err);
			alertify.error('GIF export failed: ' + (err.message || err));
		}
	}

	/**
	 * Export animation frames as a PNG spritesheet.
	 */
	async export_spritesheet(frameManager, layout = 'horizontal', columns = 4, spacing = 0, filename = null) {
		frameManager.sync_active_frame();
		const framesCount = frameManager.frames.length;
		if (framesCount === 0) {
			alertify.error('No frames to export.');
			return;
		}

		const fw = config.WIDTH;
		const fh = config.HEIGHT;
		let totalCols = framesCount;
		let totalRows = 1;

		if (layout === 'vertical') {
			totalCols = 1;
			totalRows = framesCount;
		} else if (layout === 'grid') {
			totalCols = Math.min(framesCount, Math.max(1, columns || 4));
			totalRows = Math.ceil(framesCount / totalCols);
		}

		const sheetWidth = totalCols * fw + (totalCols - 1) * spacing;
		const sheetHeight = totalRows * fh + (totalRows - 1) * spacing;

		const canvas = document.createElement('canvas');
		canvas.width = sheetWidth;
		canvas.height = sheetHeight;
		const ctx = canvas.getContext('2d');

		for (let i = 0; i < framesCount; i++) {
			let col = i;
			let row = 0;
			if (layout === 'vertical') {
				col = 0;
				row = i;
			} else if (layout === 'grid') {
				col = i % totalCols;
				row = Math.floor(i / totalCols);
			}

			const destX = col * (fw + spacing);
			const destY = row * (fh + spacing);

			const frameCanvas = frameManager.get_frame_canvas(i, fw, fh);
			if (frameCanvas) {
				ctx.drawImage(frameCanvas, destX, destY);
			}
		}

		canvas.toBlob((blob) => {
			if (!blob) {
				alertify.error('Failed to generate spritesheet blob.');
				return;
			}
			const name = filename || (config.SAVE_NAME || 'spritesheet') + '.png';
			filesaver.saveAs(blob, name);
			alertify.success('PNG Spritesheet exported successfully.');
		}, 'image/png');
	}

	/**
	 * Show interactive modal dialog for exporting animation.
	 */
	show_export_dialog(frameManager) {
		const fps = frameManager.fps || 12;
		const totalFrames = frameManager.frames.length;

		const updateVisibility = (params) => {
			const isSpritesheet = (params && params.format === 'PNG Spritesheet');
			const isGrid = (params && params.layout === 'Grid');

			const trFps = document.getElementById('popup-tr-fps');
			const trTransparent = document.getElementById('popup-tr-transparent');
			const trLayout = document.getElementById('popup-tr-layout');
			const trColumns = document.getElementById('popup-tr-columns');

			if (trFps) trFps.style.display = isSpritesheet ? 'none' : '';
			if (trTransparent) trTransparent.style.display = isSpritesheet ? 'none' : '';
			if (trLayout) trLayout.style.display = isSpritesheet ? '' : 'none';
			if (trColumns) trColumns.style.display = (isSpritesheet && isGrid) ? '' : 'none';
		};

		const settings = {
			title: 'Export Animation',
			params: [
				{ name: 'format', title: 'Export Format:', type: 'select', values: ['Animated GIF', 'PNG Spritesheet'], value: 'Animated GIF' },
				{ name: 'fps', title: 'Frame Rate (FPS):', type: 'number', value: fps, range: [1, 30] },
				{ name: 'layout', title: 'Spritesheet Layout:', type: 'select', values: ['Horizontal Strip', 'Vertical Strip', 'Grid'], value: 'Horizontal Strip' },
				{ name: 'columns', title: 'Grid Columns:', type: 'number', value: Math.min(4, Math.max(1, totalFrames)) },
				{ name: 'transparent', title: 'Transparent BG:', type: 'checkbox', value: true },
				{ name: 'filename', title: 'File Name:', type: 'text', value: config.SAVE_NAME || 'animation' }
			],
			on_load: (params) => {
				updateVisibility(params);
			},
			on_change: (params) => {
				updateVisibility(params);
			},
			on_finish: (params) => {
				const chosenFps = parseInt(params.fps) || 12;
				const fname = params.filename ? params.filename.trim() : 'animation';

				if (params.format === 'Animated GIF') {
					this.export_gif(frameManager, chosenFps, params.transparent, fname.endsWith('.gif') ? fname : fname + '.gif');
				} else {
					let layoutKey = 'horizontal';
					if (params.layout === 'Vertical Strip') layoutKey = 'vertical';
					else if (params.layout === 'Grid') layoutKey = 'grid';

					const cols = parseInt(params.columns) || 4;
					this.export_spritesheet(frameManager, layoutKey, cols, 0, fname.endsWith('.png') ? fname : fname + '.png');
				}
			}
		};

		this.POP.show(settings);
	}
}

export default Timeline_export_class;
