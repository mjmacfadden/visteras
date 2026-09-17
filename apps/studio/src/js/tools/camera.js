import app from './../app.js';
import Base_tools_class from './../core/base-tools.js';
import File_open_class from './../modules/file/open.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Camera tool — capture a webcam frame and insert it as a new image layer
 * on the current document (does not resize the canvas / open a new doc).
 */
class Camera_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.File_open = new File_open_class();
		this.name = 'camera';
	}

	load() {
		// nothing
	}

	render(ctx, layer) {
		// nothing
	}

	on_activate() {
		this.capture();
	}

	async capture() {
		try {
			const frame = await this.File_open.capture_webcam_frame({
				mirrorPreview: true,
				title: 'Camera',
			});
			if (!frame) {
				return;
			}
			await this.File_open.insert_image_as_layer({
				name: 'Photo',
				data: frame.dataURL,
				width: frame.width,
				height: frame.height,
				fitIfHuge: true,
			});
		}
		catch (err) {
			var msg = (err && err.message) ? err.message : String(err || 'Camera unavailable');
			alertify.error(msg);
		}
		finally {
			new app.Actions.Activate_tool_action('select', true).do();
		}
	}
}

export default Camera_class;
