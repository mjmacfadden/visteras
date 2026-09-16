import app from './../../app.js';
import { Base_action } from './../base.js';

export class Reorder_frame_action extends Base_action {
	/**
	 * Reorders frames in the timeline.
	 *
	 * @param {number} fromIndex
	 * @param {number} toIndex
	 */
	constructor(fromIndex, toIndex) {
		super('reorder_frame', 'Reorder Frame');
		this.fromIndex = fromIndex;
		this.toIndex = toIndex;
		this.previousActiveIndex = null;
		this.activeFrameId = null;
	}

	async do() {
		super.do();
		const frameManager = (app.GUI && app.GUI.GUI_timeline) ? app.GUI.GUI_timeline.Frame_manager : null;
		if (!frameManager) return;

		frameManager.sync_active_frame();
		this.previousActiveIndex = frameManager.active_frame_index;
		const activeFrame = frameManager.frames[frameManager.active_frame_index];
		this.activeFrameId = activeFrame ? activeFrame.id : null;

		const [moved] = frameManager.frames.splice(this.fromIndex, 1);
		frameManager.frames.splice(this.toIndex, 0, moved);

		if (this.activeFrameId) {
			const newActiveIndex = frameManager.frames.findIndex(f => f.id === this.activeFrameId);
			if (newActiveIndex !== -1) {
				frameManager.active_frame_index = newActiveIndex;
			}
		}

		frameManager.clear_composite_cache();
		if (app.GUI && app.GUI.GUI_timeline && typeof app.GUI.GUI_timeline.render_timeline === 'function') {
			app.GUI.GUI_timeline.render_timeline();
		}
	}

	async undo() {
		super.undo();
		const frameManager = (app.GUI && app.GUI.GUI_timeline) ? app.GUI.GUI_timeline.Frame_manager : null;
		if (!frameManager) return;

		frameManager.sync_active_frame();

		const [moved] = frameManager.frames.splice(this.toIndex, 1);
		frameManager.frames.splice(this.fromIndex, 0, moved);

		frameManager.active_frame_index = this.previousActiveIndex;
		frameManager.clear_composite_cache();
		if (app.GUI && app.GUI.GUI_timeline && typeof app.GUI.GUI_timeline.render_timeline === 'function') {
			app.GUI.GUI_timeline.render_timeline();
		}
	}
}
