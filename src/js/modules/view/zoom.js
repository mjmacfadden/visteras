import GUI_preview_class from './../../core/gui/gui-preview.js';
import zoomView from './../../libs/zoomView.js';

class View_zoom_class {

	constructor() {
		this.GUI_preview = new GUI_preview_class();
	}

	in() {
		this.GUI_preview.zoom(1);
	}

	out() {
		this.GUI_preview.zoom(-1);
	}

	original() {
		if (zoomView && typeof zoomView.reset === 'function') {
			zoomView.reset(1);
		}
		if (this.GUI_preview && typeof this.GUI_preview.set_center_zoom === 'function') {
			this.GUI_preview.set_center_zoom();
		}
		if (this.GUI_preview.zoom_data) {
			this.GUI_preview.zoom_data.move_pos = null;
		}
		this.GUI_preview.zoom(100);
	}

	auto() {
		this.GUI_preview.zoom_auto();
	}
}

export default View_zoom_class;
