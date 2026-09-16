import app from './../../app.js';
import config from './../../config.js';
import { Base_action } from './../base.js';

export class Delete_frame_action extends Base_action {
	/**
	 * Deletes a frame from the timeline.
	 *
	 * @param {number|null} targetIndex
	 */
	constructor(targetIndex = null) {
		super('delete_frame', 'Delete Frame');
		this.targetIndex = targetIndex;
		this.deletedIndex = null;
		this.previousActiveIndex = null;
		this.deletedFrameData = null;
		this.wasSingleFrame = false;
	}

	async do() {
		super.do();
		const frameManager = (app.GUI && app.GUI.GUI_timeline) ? app.GUI.GUI_timeline.Frame_manager : null;
		if (!frameManager) return;

		frameManager.sync_active_frame();

		this.previousActiveIndex = frameManager.active_frame_index;
		this.deletedIndex = (this.targetIndex !== null) ? this.targetIndex : this.previousActiveIndex;

		if (this.deletedIndex < 0 || this.deletedIndex >= frameManager.frames.length) {
			throw new Error('Frame to delete not found');
		}

		const targetFrame = frameManager.frames[this.deletedIndex];
		this.deletedFrameData = {
			id: targetFrame.id,
			layers: frameManager.clone_layers(targetFrame.layers),
			active_layer_id: targetFrame.active_layer_id
		};

		if (frameManager.frames.length <= 1) {
			this.wasSingleFrame = true;
			const blankCanvas = document.createElement('canvas');
			blankCanvas.width = config.WIDTH || 800;
			blankCanvas.height = config.HEIGHT || 600;
			config.layers = [
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
			config.layer = config.layers[0];
			frameManager.reset_to_current_layers();
			frameManager.set_active_frame(0, true);
			return;
		}

		this.wasSingleFrame = false;
		frameManager.frames.splice(this.deletedIndex, 1);
		frameManager.clear_composite_cache();

		let nextIndex = this.deletedIndex;
		if (nextIndex >= frameManager.frames.length) {
			nextIndex = frameManager.frames.length - 1;
		}
		frameManager.active_frame_index = -1;
		frameManager.set_active_frame(nextIndex, true);
	}

	async undo() {
		super.undo();
		const frameManager = (app.GUI && app.GUI.GUI_timeline) ? app.GUI.GUI_timeline.Frame_manager : null;
		if (!frameManager) return;

		frameManager.sync_active_frame();

		if (this.wasSingleFrame) {
			frameManager.frames[0] = {
				id: this.deletedFrameData.id,
				layers: frameManager.clone_layers(this.deletedFrameData.layers),
				active_layer_id: this.deletedFrameData.active_layer_id
			};
			frameManager.clear_composite_cache();
			frameManager.active_frame_index = -1;
			frameManager.set_active_frame(0, true);
			return;
		}

		const restoredFrame = {
			id: this.deletedFrameData.id,
			layers: frameManager.clone_layers(this.deletedFrameData.layers),
			active_layer_id: this.deletedFrameData.active_layer_id
		};

		frameManager.frames.splice(this.deletedIndex, 0, restoredFrame);
		frameManager.clear_composite_cache();
		frameManager.active_frame_index = -1;
		frameManager.set_active_frame(this.previousActiveIndex, true);
	}
}
