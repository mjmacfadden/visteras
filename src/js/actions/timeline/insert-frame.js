import app from './../../app.js';
import config from './../../config.js';
import { Base_action } from './../base.js';

export class Insert_frame_action extends Base_action {
	/**
	 * Inserts a new or duplicated frame into the timeline.
	 *
	 * @param {number|null} targetIndex
	 * @param {boolean} duplicate
	 */
	constructor(targetIndex = null, duplicate = false) {
		super('insert_frame', duplicate ? 'Duplicate Frame' : 'Insert Frame');
		this.targetIndex = targetIndex;
		this.duplicate = duplicate;
		this.previousActiveIndex = null;
		this.insertedIndex = null;
		this.frameData = null;
	}

	async do() {
		super.do();
		const frameManager = (app.GUI && app.GUI.GUI_timeline) ? app.GUI.GUI_timeline.Frame_manager : null;
		if (!frameManager) return;

		frameManager.sync_active_frame();

		if (this.previousActiveIndex === null) {
			this.previousActiveIndex = frameManager.active_frame_index;
		}

		if (this.insertedIndex === null) {
			this.insertedIndex = (this.targetIndex !== null) ? this.targetIndex : (this.previousActiveIndex + 1);
		}

		if (this.frameData === null) {
			let newLayers = [];
			if (this.duplicate && frameManager.frames[this.previousActiveIndex]) {
				newLayers = frameManager.clone_layers(frameManager.frames[this.previousActiveIndex].layers);
			} else {
				const blankCanvas = document.createElement('canvas');
				blankCanvas.width = config.WIDTH || 800;
				blankCanvas.height = config.HEIGHT || 600;
				newLayers = [
					{
						id: 1,
						name: 'Layer 1',
						visible: true,
						locked: false,
						type: 'image',
						link: blankCanvas,
						data: '',
						x: 0,
						y: 0,
						width: config.WIDTH || 800,
						height: config.HEIGHT || 600,
						width_original: config.WIDTH || 800,
						height_original: config.HEIGHT || 600,
						opacity: 100,
						composition: 'source-over',
						rotate: 0,
						order: 1
					}
				];
			}

			this.frameData = {
				id: 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
				layers: newLayers,
				active_layer_id: newLayers[0] ? newLayers[0].id : 1
			};
		}

		const frameToInsert = {
			id: this.frameData.id,
			layers: frameManager.clone_layers(this.frameData.layers),
			active_layer_id: this.frameData.active_layer_id
		};

		frameManager.frames.splice(this.insertedIndex, 0, frameToInsert);
		frameManager.clear_composite_cache();
		frameManager.set_active_frame(this.insertedIndex, true);
	}

	async undo() {
		super.undo();
		const frameManager = (app.GUI && app.GUI.GUI_timeline) ? app.GUI.GUI_timeline.Frame_manager : null;
		if (!frameManager) return;

		frameManager.sync_active_frame();

		const currentFrame = frameManager.frames[this.insertedIndex];
		if (currentFrame) {
			this.frameData = {
				id: currentFrame.id,
				layers: frameManager.clone_layers(currentFrame.layers),
				active_layer_id: currentFrame.active_layer_id
			};
		}

		frameManager.frames.splice(this.insertedIndex, 1);
		frameManager.clear_composite_cache();

		let nextIndex = this.previousActiveIndex;
		if (nextIndex >= frameManager.frames.length) {
			nextIndex = frameManager.frames.length - 1;
		}
		if (nextIndex < 0) nextIndex = 0;

		frameManager.active_frame_index = -1;
		frameManager.set_active_frame(nextIndex, true);
	}
}
