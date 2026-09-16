/**
 * Piskel (.piskel) File Importer and Processor
 * Decodes Piskel project JSON, parses chunked spritesheet layers, and reconstructs
 * multi-frame, multi-layer animations in Visteras.
 */

import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

export class Piskel_importer_class {

	/**
	 * Helper to load an image from a data URL asynchronously
	 */
	load_image_async(src) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'Anonymous';
			img.onload = () => resolve(img);
			img.onerror = (err) => reject(new Error('Failed to load Piskel chunk image: ' + err));
			img.src = src;
		});
	}

	/**
	 * Parses and validates raw .piskel content (string or parsed object).
	 */
	parse_piskel_data(rawContent) {
		let data = rawContent;
		if (typeof data === 'string') {
			try {
				data = JSON.parse(data);
			} catch (e) {
				throw new Error('Invalid JSON in .piskel file.');
			}
		}

		if (!data) {
			throw new Error('Empty .piskel file.');
		}

		const piskel = data.piskel || data;
		if (!piskel || !piskel.layers) {
			throw new Error('Unrecognized .piskel format: missing piskel.layers data.');
		}

		const width = parseInt(piskel.width) || 32;
		const height = parseInt(piskel.height) || 32;
		const fps = parseInt(piskel.fps) || 12;
		const name = piskel.name || 'Untitled';

		return {
			width,
			height,
			fps,
			name,
			rawLayers: piskel.layers
		};
	}

	/**
	 * Processes chunks and layers from Piskel data into frames and canvases.
	 */
	async process_piskel(rawContent, defaultFilename = null) {
		const parsed = this.parse_piskel_data(rawContent);
		const { width, height, fps, rawLayers } = parsed;
		const docName = (parsed.name && parsed.name !== 'New Piskel' && parsed.name !== 'Untitled')
			? parsed.name
			: (defaultFilename ? defaultFilename.replace(/\.piskel$/i, '') : 'Piskel Animation');

		// Array of layer frame maps: layerFrameCanvases[layerIdx][frameIdx] = canvas
		const layerFrameCanvases = [];
		const layerMetas = [];
		let maxFrames = 1;

		for (let l = 0; l < rawLayers.length; l++) {
			let layerObj = rawLayers[l];
			if (typeof layerObj === 'string') {
				try {
					layerObj = JSON.parse(layerObj);
				} catch (e) {
					console.warn('[Piskel] Failed to parse layer JSON at index ' + l, e);
					continue;
				}
			}

			const layerName = layerObj.name || ('Layer ' + (l + 1));
			const layerOpacity = (layerObj.opacity !== undefined) ? parseFloat(layerObj.opacity) : 1;
			const frameCount = parseInt(layerObj.frameCount) || 1;
			if (frameCount > maxFrames) maxFrames = frameCount;

			layerMetas.push({
				name: layerName,
				opacity: layerOpacity
			});

			const framesForThisLayer = {};

			// Backward compatibility: if layer has a single base64PNG and no chunks
			if ((!layerObj.chunks || layerObj.chunks.length === 0) && layerObj.base64PNG) {
				const layout = [];
				for (let i = 0; i < frameCount; i++) {
					layout.push([i]);
				}
				layerObj.chunks = [{
					base64PNG: layerObj.base64PNG,
					layout: layout
				}];
			}

			const chunks = layerObj.chunks || [];
			for (let c = 0; c < chunks.length; c++) {
				const chunk = chunks[c];
				const base64PNG = chunk.base64PNG;
				const layout = chunk.layout;

				if (!base64PNG || !layout || !Array.isArray(layout) || layout.length === 0) continue;

				let chunkImg = null;
				try {
					chunkImg = await this.load_image_async(base64PNG);
				} catch (err) {
					console.warn('[Piskel] Error loading chunk image:', err);
					continue;
				}

				const numCols = layout.length;
				const numRows = (layout[0] && Array.isArray(layout[0])) ? layout[0].length : 1;
				const chunkFrameW = (chunkImg.width && numCols > 0) ? (chunkImg.width / numCols) : width;
				const chunkFrameH = (chunkImg.height && numRows > 0) ? (chunkImg.height / numRows) : height;

				for (let col = 0; col < layout.length; col++) {
					const colEntries = layout[col];
					if (!Array.isArray(colEntries)) continue;

					for (let row = 0; row < colEntries.length; row++) {
						const frameIdx = parseInt(colEntries[row]);
						if (isNaN(frameIdx) || frameIdx < 0) continue;

						if (frameIdx + 1 > maxFrames) {
							maxFrames = frameIdx + 1;
						}

						const frameCanvas = document.createElement('canvas');
						frameCanvas.width = width;
						frameCanvas.height = height;
						const ctx = frameCanvas.getContext('2d');
						ctx.imageSmoothingEnabled = false;

						const sx = col * chunkFrameW;
						const sy = row * chunkFrameH;

						try {
							ctx.drawImage(chunkImg, sx, sy, chunkFrameW, chunkFrameH, 0, 0, width, height);
						} catch (e) {
							console.warn('[Piskel] Error drawing sub-frame:', e);
						}

						framesForThisLayer[frameIdx] = frameCanvas;
					}
				}
			}

			layerFrameCanvases.push(framesForThisLayer);
		}

		// Reconstruct frames
		const allFrames = [];
		for (let f = 0; f < maxFrames; f++) {
			const frameLayers = [];

			for (let l = 0; l < layerMetas.length; l++) {
				const meta = layerMetas[l];
				let canvas = layerFrameCanvases[l] ? layerFrameCanvases[l][f] : null;

				if (!canvas) {
					canvas = document.createElement('canvas');
					canvas.width = width;
					canvas.height = height;
				}

				const layer = {
					id: l + 1,
					name: meta.name,
					visible: true,
					locked: false,
					type: 'image',
					link: canvas,
					data: canvas.toDataURL(),
					x: 0,
					y: 0,
					width: width,
					height: height,
					width_original: width,
					height_original: height,
					opacity: Math.round(meta.opacity * 100),
					composition: 'source-over',
					rotate: 0,
					order: l + 1
				};

				frameLayers.push(layer);
			}

			if (frameLayers.length === 0) {
				const blankCanvas = document.createElement('canvas');
				blankCanvas.width = width;
				blankCanvas.height = height;
				frameLayers.push({
					id: 1,
					name: 'Layer 1',
					visible: true,
					locked: false,
					type: 'image',
					link: blankCanvas,
					data: '',
					x: 0,
					y: 0,
					width: width,
					height: height,
					width_original: width,
					height_original: height,
					opacity: 100,
					composition: 'source-over',
					rotate: 0,
					order: 1
				});
			}

			allFrames.push({
				id: 'frame_' + Date.now() + '_' + f + '_' + Math.random().toString(36).substr(2, 5),
				layers: frameLayers,
				active_layer_id: frameLayers[0] ? frameLayers[0].id : 1
			});
		}

		return {
			name: docName,
			width,
			height,
			fps,
			frames: allFrames
		};
	}

	/**
	 * Loads a .piskel file and opens it in Visteras.
	 */
	async load_piskel_file(content, filename = null) {
		try {
			alertify.success('Loading Piskel project...');
			const result = await this.process_piskel(content, filename);

			if (app.Documents && typeof app.Documents.create_document_from_piskel === 'function') {
				await app.Documents.create_document_from_piskel(result);
			} else {
				// Standalone fallback without multi-documents
				config.WIDTH = result.width;
				config.HEIGHT = result.height;
				config.SAVE_NAME = result.name;
				config.TRANSPARENCY = true;

				if (app.GUI && app.GUI.GUI_timeline && app.GUI.GUI_timeline.Frame_manager) {
					const fm = app.GUI.GUI_timeline.Frame_manager;
					fm.frames = result.frames;
					fm.fps = result.fps;
					fm.active_frame_index = 0;
					fm.clear_composite_cache();
					fm.set_active_frame(0, true);
					app.GUI.GUI_timeline.show();
				}

				if (app.GUI && app.GUI.GUI_preview) {
					await app.GUI.GUI_preview.zoom_auto();
				}
			}

			alertify.success(`Piskel "${result.name}" loaded (${result.frames.length} frames, ${result.fps} FPS).`);
			return result;
		} catch (err) {
			console.error('[Piskel] Failed to load file:', err);
			alertify.error('Failed to load Piskel file: ' + (err.message || err));
			throw err;
		}
	}
}

export const Piskel_importer = new Piskel_importer_class();
export default Piskel_importer;
