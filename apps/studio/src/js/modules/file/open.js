import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Base_gui_class from './../../core/base-gui.js';
import Dialog_class from './../../libs/popup.js';
import Helper_class from './../../libs/helpers.js';
import Mask_class from './../../modules/mask/mask.js';
import Clipboard_class from './../../libs/clipboard.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import EXIF from './../../../../node_modules/exif-js/exif.js';
import GUI_tools_class from "../../core/gui/gui-tools";
import semver_compare from './../../../../node_modules/semver-compare/';
import { migrate_layer_clipping } from './../../libs/layer-clip.js';

var instance = null;

/** 
 * manages files / open
 * 
 * @author ViliusL
 */
class File_open_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		var _this = this;
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
		this.Helper = new Helper_class();
		this.GUI_tools = new GUI_tools_class();

		//clipboard class
		this.Clipboard_class = new Clipboard_class(function (data, w, h) {
			_this.on_paste(data, w, h);
		});

		this.events();

		this.maybe_file_open_url_handler();
	}

	events() {
		var _this = this;

		window.ondrop = function (e) {
			//drop
			e.preventDefault();
			_this.open_handler(e);
		};
		window.ondragover = function (e) {
			e.preventDefault();
		};
		document.addEventListener('keydown', (event) => {
			var code = event.key.toLowerCase();
			if (this.Helper.is_input(event.target))
				return;

			if (code == "o" && (event.ctrlKey || event.metaKey)) {
				//open
				this.open_file();
				event.preventDefault();
			}
		}, false);
	}

	on_paste(data, width, height) {
		var new_layer = {
			name: 'Paste',
			type: 'image',
			data: data,
		};

		//use stored clipboard position if available
		if (config._clipboard_position) {
			new_layer.x = config._clipboard_position.x;
			new_layer.y = config._clipboard_position.y;
			config._clipboard_position = null;
		}

		app.State.do_action(
			new app.Actions.Insert_layer_action(new_layer, false)
		);
	}

	/**
	 * opens file picker and adds selected image as a new layer
	 * without resizing the canvas (Place Embed / Open as Layer)
	 */
	open_file_as_layer() {
		var _this = this;

		alertify.success('Image will be added as a new layer.');

		document.getElementById("tmp").innerHTML = '';
		var a = document.createElement('input');
		a.setAttribute("id", "file_open_as_layer");
		a.type = 'file';
		a.multiple = 'multiple';
		a.accept = 'image/*,.psd,.piskel,.ttf,.otf,.woff,.woff2,image/vnd.adobe.photoshop,image/x-photoshop';
		document.getElementById("tmp").appendChild(a);
		document.getElementById('file_open_as_layer').addEventListener('change', function (e) {
			_this.open_handler_as_layer(e);
		}, false);

		//force click
		document.querySelector('#file_open_as_layer').click();
	}

	/**
	 * handler for opening files as new layers (no canvas resize)
	 */
	async open_handler_as_layer(e) {
		var _this = this;
		var files = e.target.files;

		var auto_increment = this.Base_layers.auto_increment;

		if (files == undefined) {
			files = e.dataTransfer.files;
		}

		//sort
		var orders = [];
		for (var i = 0, f; i < files.length; i++) {
			orders.push(files[i].name);
		}
		orders.sort();
		var order_map = [];
		for (var i in orders) {
			order_map[orders[i]] = parseInt(i);
		}

		for (var i = 0, f; i < files.length; i++) {
			f = files[i];
			var isFont = (f.name && f.name.match(/\.(ttf|otf|woff|woff2)$/i)) ||
				(f.type && (f.type.startsWith('font/') || f.type.includes('font') || f.type.includes('opentype')));
			if (isFont) {
				if (app.FontManager) {
					try {
						var loadedFamily = await app.FontManager.addFontFile(f);
						alertify.success('Font "' + loadedFamily + '" installed and saved.');
					} catch (err) {
						alertify.error('Failed to install font: ' + (err.message || err));
					}
				}
				continue;
			}
			var isPsd = (f.name && f.name.toLowerCase().endsWith('.psd')) ||
				f.type === 'image/vnd.adobe.photoshop' ||
				f.type === 'image/x-photoshop' ||
				f.type === 'application/x-photoshop' ||
				f.type === 'application/photoshop' ||
				f.type === 'application/psd';

			if (isPsd) {
				try {
					var readResult = await this.read_file_async(f, 'arrayBuffer');
					var psdMod = await import(/* webpackChunkName: "psd" */ './../../libs/psd.js');
					await psdMod.load_psd(readResult.result, f.name, { asLayers: true });
				} catch (err) {
					console.error('[PSD] Error importing as layer:', err);
					alertify.error('Failed to import PSD: ' + (err.message || err));
				}
				continue;
			}

			var isPiskel = (f.name && f.name.toLowerCase().endsWith('.piskel'));
			if (isPiskel) {
				try {
					var readResult = await this.read_file_async(f, 'text');
					var piskelMod = await import(/* webpackChunkName: "piskel" */ './../../core/timeline/piskel-importer.js');
					await piskelMod.default.load_piskel_file(readResult.result, f.name);
				} catch (err) {
					console.error('[Piskel] Error importing as layer:', err);
					alertify.error('Failed to import Piskel: ' + (err.message || err));
				}
				continue;
			}

			if (!f.type.match('image.*') && !isPiskel && !f.name.match(/\.(png|jpg|jpeg|webp|gif|avif|piskel)/i)) {
				alertify.error('Wrong file type, must be image, psd, piskel, or font.');
				continue;
			}

			var FR = new FileReader();
			FR.file = files[i];

			FR.onload = function (event) {
				var order = auto_increment + order_map[this.file.name];
				var new_layer = {
					name: this.file.name,
					type: 'image',
					data: event.target.result,
					order: order,
					_exif: _this.extract_exif(this.file),
				};
				// Insert as layer WITHOUT autoresize (can_automate = false)
				app.State.do_action(
					new app.Actions.Insert_layer_action(new_layer, false)
				);
			};
			FR.readAsDataURL(f);

			//sleep after last image import
			await new Promise(r => setTimeout(r, 10));
		}
	}

	open_file() {
		var _this = this;

		alertify.success('You can also drag and drop items into browser.');

		document.getElementById("tmp").innerHTML = '';
		var a = document.createElement('input');
		a.setAttribute("id", "file_open");
		a.type = 'file';
		a.multiple = 'multiple';
		a.accept = 'image/*,.json,.psd,.piskel,.ttf,.otf,.woff,.woff2,application/json,image/vnd.adobe.photoshop,image/x-photoshop';
		document.getElementById("tmp").appendChild(a);
		document.getElementById('file_open').addEventListener('change', function (e) {
			_this.open_handler(e);
		}, false);

		//force click
		document.querySelector('#file_open').click();
	}
	
	/**
	 * Stop all MediaStream tracks and tear down a preview <video>.
	 * @param {MediaStream|null} stream
	 * @param {HTMLVideoElement|null} video
	 */
	_stop_webcam(stream, video) {
		if (stream) {
			try {
				stream.getTracks().forEach(function (t) { t.stop(); });
			} catch (e) { /* ignore */ }
		}
		if (video) {
			try {
				video.pause();
				video.srcObject = null;
				video.removeAttribute('src');
				video.load();
			} catch (e) { /* ignore */ }
		}
	}

	/**
	 * Friendly message for getUserMedia failures.
	 * @param {Error|DOMException|string} error
	 * @returns {string}
	 */
	_webcam_error_message(error) {
		var name = (error && error.name) ? error.name : '';
		var raw = (error && error.message) ? error.message : String(error || '');
		if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
			return 'Camera permission denied. Allow camera access in the browser and try again.';
		}
		if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
			return 'No camera found. Connect a webcam and try again.';
		}
		if (name === 'NotReadableError' || name === 'TrackStartError') {
			return 'Camera is already in use by another application.';
		}
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			return 'Camera is not supported in this browser (requires HTTPS or localhost).';
		}
		return 'Could not open camera: ' + (raw || name || 'unknown error');
	}

	/**
	 * Open live webcam preview dialog and capture one frame.
	 * Preview is mirrored horizontally (selfie UX); captured pixels are NOT
	 * mirrored so editing matches the real scene / "how others see you".
	 *
	 * @param {object} [options]
	 * @param {boolean} [options.mirrorPreview=true]
	 * @param {string} [options.title='Webcam']
	 * @returns {Promise<{dataURL:string,width:number,height:number}|null>}
	 *   Resolves with frame data, or null if the user cancelled.
	 *   Rejects with Error on permission / device failure.
	 */
	capture_webcam_frame(options = {}) {
		var _this = this;
		var mirrorPreview = options.mirrorPreview !== false;
		var title = options.title || 'Webcam';

		return new Promise(function (resolve, reject) {
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				reject(new Error(_this._webcam_error_message({ name: 'NotSupportedError' })));
				return;
			}

			var video = document.createElement('video');
			video.autoplay = true;
			video.playsInline = true;
			video.muted = true;
			video.style.maxWidth = '100%';
			video.style.display = 'block';
			if (mirrorPreview) {
				video.style.transform = 'scaleX(-1)';
			}

			var stream = null;
			var settled = false;

			function cleanup() {
				_this._stop_webcam(stream, video);
				stream = null;
			}

			function handleSuccess(mediaStream) {
				stream = mediaStream;
				video.srcObject = mediaStream;
				video.play().catch(function () { /* autoplay may need mute — already muted */ });
			}

			function handleError(error) {
				cleanup();
				if (settled) return;
				settled = true;
				try { _this.POP.hide(); } catch (e) { /* ignore */ }
				reject(new Error(_this._webcam_error_message(error)));
			}

			var settings = {
				title: title,
				params: [
					{ title: 'Preview:', html: '<div id="webcam_container"></div>' },
				],
				on_load: function () {
					var container = document.getElementById('webcam_container');
					if (container) {
						container.appendChild(video);
					}
					var okBtn = _this.POP.el && _this.POP.el.querySelector('[data-id="popup_ok"]');
					if (okBtn) {
						okBtn.textContent = 'Capture';
					}
				},
				on_finish: function () {
					if (settled) return;
					var width = video.videoWidth;
					var height = video.videoHeight;
					if (!width || !height) {
						cleanup();
						settled = true;
						reject(new Error('Camera stream had no frames yet. Wait for the preview and try again.'));
						return;
					}
					// Capture un-mirrored (natural camera orientation) for editing.
					var tmpCanvas = document.createElement('canvas');
					tmpCanvas.width = width;
					tmpCanvas.height = height;
					var ctx = tmpCanvas.getContext('2d');
					ctx.drawImage(video, 0, 0);
					var dataURL = tmpCanvas.toDataURL('image/png');
					cleanup();
					settled = true;
					resolve({ dataURL: dataURL, width: width, height: height });
				},
				on_cancel: function () {
					cleanup();
					if (settled) return;
					settled = true;
					resolve(null);
				},
			};

			_this.POP.show(settings);

			navigator.mediaDevices.getUserMedia({ audio: false, video: true })
				.then(handleSuccess)
				.catch(handleError);
		});
	}

	/**
	 * Insert a raster image as a new layer on the current document.
	 * Does not resize the canvas (Place / Open-as-layer behavior).
	 * If fitIfHuge and the image is larger than the canvas, scales the layer
	 * display size to fit while preserving capture originals.
	 *
	 * @param {object} opts
	 * @param {string} opts.data - data URL or image source
	 * @param {number} [opts.width]
	 * @param {number} [opts.height]
	 * @param {string} [opts.name='Photo']
	 * @param {boolean} [opts.fitIfHuge=false]
	 */
	async insert_image_as_layer(opts) {
		var width = opts.width || 0;
		var height = opts.height || 0;
		var name = opts.name || 'Photo';
		var data = opts.data;
		var displayW = width;
		var displayH = height;

		if (opts.fitIfHuge && width > 0 && height > 0 && config.WIDTH > 0 && config.HEIGHT > 0) {
			if (width > config.WIDTH || height > config.HEIGHT) {
				var scale = Math.min(config.WIDTH / width, config.HEIGHT / height);
				displayW = Math.max(1, Math.round(width * scale));
				displayH = Math.max(1, Math.round(height * scale));
			}
		}

		var new_layer = {
			name: name,
			type: 'image',
			data: data,
			x: 0,
			y: 0,
		};
		if (displayW > 0) {
			new_layer.width = displayW;
			new_layer.width_original = width || displayW;
		}
		if (displayH > 0) {
			new_layer.height = displayH;
			new_layer.height_original = height || displayH;
		}

		await app.State.do_action(
			new app.Actions.Insert_layer_action(new_layer, false)
		);
		return new_layer;
	}

	/**
	 * File → Open from Webcam: capture a frame and open it as the document
	 * content (insert layer + autoresize canvas to the capture size).
	 * Toolbar Camera tool uses capture_webcam_frame + insert_image_as_layer instead.
	 */
	async open_webcam() {
		try {
			var frame = await this.capture_webcam_frame({
				mirrorPreview: true,
				title: 'Webcam',
			});
			if (!frame) {
				return;
			}
			var new_layer = {
				name: 'Webcam #' + this.Base_layers.auto_increment,
				type: 'image',
				data: frame.dataURL,
				width: frame.width,
				height: frame.height,
				width_original: frame.width,
				height_original: frame.height,
			};
			app.State.do_action(
				new app.Actions.Bundle_action('open_file_webcam', 'Open File Webcam', [
					new app.Actions.Insert_layer_action(new_layer),
					new app.Actions.Autoresize_canvas_action(frame.width, frame.height, null, true, true)
				])
			);
		}
		catch (err) {
			alertify.error((err && err.message) ? err.message : String(err));
		}
	}

	open_dir() {
		var _this = this;

		document.getElementById("tmp").innerHTML = '';
		var a = document.createElement('input');
		a.setAttribute("id", "file_open_dir");
		a.type = 'file';
		a.webkitdirectory = 'webkitdirectory';
		document.getElementById("tmp").appendChild(a);
		document.getElementById('file_open_dir').addEventListener('change', function (e) {
			_this.open_handler(e);
		}, false);

		//force click
		document.querySelector('#file_open_dir').click();
	}

	/**
	 * opens data URLs, like: "data:image/png;base64,xxxxxx"
	 * 
	 * data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVQYV2N89+7df0FBQQbG/////3///j0DAF9wCsg9spQfAAAAAElFTkSuQmCC
	 */
	open_data_url() {
		var _this = this;

		var settings = {
			title: 'Open data URL',
			params: [
				{name: "data", title: "Data URL:", type: "textarea", value: ""},
			],
			on_finish: function (params) {
				_this.file_open_data_url_handler(params.data);
			},
		};
		this.POP.show(settings);
	}

	file_open_data_url_handler(data) {
		var _this = this;
		if (data == '')
			return;

		var img = new Image();
		img.crossOrigin = "Anonymous";
		img.onload = async function () {
			if (app.Documents) {
				await app.Documents.create_document_from_image({
					name: "Data URL",
					data: data,
				});
			} else {
				var new_layer = {
					name: "Data URL",
					type: 'image',
					link: img,
					width: img.width,
					height: img.height,
					width_original: img.width,
					height_original: img.height,
				};
				app.State.do_action(
					new app.Actions.Bundle_action('open_file_data_url', 'Open File Data URL', [
						new app.Actions.Insert_layer_action(new_layer),
						new app.Actions.Autoresize_canvas_action(img.width, img.height, null, true, true)
					])
				);
			}
		};
		img.onerror = function (ex) {
			alertify.error('Sorry, image could not be loaded. Try copy image and paste it.');
		};
		img.src = data;
	}

	open_url() {
		var _this = this;

		var settings = {
			title: 'Open URL',
			params: [
				{name: "url", title: "URL:", value: ""},
			],
			on_finish: function (params) {
				_this.file_open_url_handler(params);
			},
		};
		this.POP.show(settings);
	}

	read_file_async(file, readAs = 'dataURL') {
		return new Promise((resolve, reject) => {
			var FR = new FileReader();
			FR.onload = (e) => resolve({ file: file, result: e.target.result });
			FR.onerror = (e) => reject(e);
			if (readAs === 'text') {
				FR.readAsText(file);
			} else if (readAs === 'arrayBuffer') {
				FR.readAsArrayBuffer(file);
			} else {
				FR.readAsDataURL(file);
			}
		});
	}

	async open_handler(e) {
		var _this = this;
		var files = e.target.files;

		var auto_increment = this.Base_layers.auto_increment;

		if (files == undefined) {
			//drag and drop
			files = e.dataTransfer.files;
		}

		//sort
		var orders = [];
		for (var i = 0, f; i < files.length; i++) {
			orders.push(files[i].name);
		}
		orders.sort();
		var order_map = [];
		for (var i in orders) {
			order_map[orders[i]] = parseInt(i);
		}

		//check if dropped directory
		var dir_opened = false;
		if (e.dataTransfer && e.dataTransfer.items)	{
			var items = e.dataTransfer.items;
			for (var i=0; i<items.length; i++) {
				var item = items[i].webkitGetAsEntry();
				if(item && item.isDirectory){
					dir_opened = true;
				}
			}
		}

		for (var i = 0; i < files.length; i++) {
			var f = files[i];
			var isFont = (f.name && f.name.match(/\.(ttf|otf|woff|woff2)$/i)) ||
				(f.type && (f.type.startsWith('font/') || f.type.includes('font') || f.type.includes('opentype')));
			if (isFont) {
				if (app.FontManager) {
					try {
						var loadedFamily = await app.FontManager.addFontFile(f);
						alertify.success('Font "' + loadedFamily + '" installed and saved.');
					} catch (err) {
						alertify.error('Failed to install font: ' + (err.message || err));
					}
				}
				continue;
			}
			var isPiskel = (f.name && f.name.toLowerCase().endsWith('.piskel'));
			var isJson = !isPiskel && (f.name.toLowerCase().endsWith('.json') || f.type === 'application/json' || f.type === 'text/json');
			var isPsd = (f.name && f.name.toLowerCase().endsWith('.psd')) ||
				f.type === 'image/vnd.adobe.photoshop' ||
				f.type === 'image/x-photoshop' ||
				f.type === 'application/x-photoshop' ||
				f.type === 'application/photoshop' ||
				f.type === 'application/psd';

			if (!f.type.match('image.*') && !isJson && !isPsd && !isPiskel && !f.name.match(/\.(png|jpg|jpeg|webp|gif|avif|psd|piskel)/i)) {
				if(dir_opened == false) {
					alertify.error('Wrong file type, must be image, json, psd, piskel, or font.');
				}
				continue;
			}
			if (files.length == 1) {
				this.SAVE_NAME = f.name.split('.')[f.name.split('.').length - 2];
			}

			var readAs = (isJson || isPiskel) ? 'text' : (isPsd ? 'arrayBuffer' : 'dataURL');
			try {
				var readResult = await this.read_file_async(f, readAs);
				if (isPiskel) {
					var content = readResult.result;
					if (typeof content === 'string' && content.startsWith('data:')) {
						try {
							content = atob(content.split(',')[1]);
						} catch (e) {}
					}
					var piskelMod = await import(/* webpackChunkName: "piskel" */ './../../core/timeline/piskel-importer.js');
					await piskelMod.default.load_piskel_file(content, f.name);
				} else if (isJson) {
					var content = readResult.result;
					if (typeof content === 'string' && content.startsWith('data:')) {
						try {
							content = atob(content.split(',')[1]);
						} catch (e) {}
					}
					let parsedJson = null;
					try {
						parsedJson = (typeof content === 'string') ? JSON.parse(content) : content;
					} catch (e) {}

					if (parsedJson && parsedJson.piskel && parsedJson.piskel.layers) {
						var piskelMod = await import(/* webpackChunkName: "piskel" */ './../../core/timeline/piskel-importer.js');
						await piskelMod.default.load_piskel_file(parsedJson, f.name);
					} else if (app.Documents) {
						await app.Documents.create_document_from_json(content, f.name);
					} else {
						await _this.load_json(content, f.name);
					}
				} else if (isPsd) {
					var psdMod = await import(/* webpackChunkName: "psd" */ './../../libs/psd.js');
					await psdMod.load_psd(readResult.result, f.name);
				} else if (f.type.match('image.*') || (f.type == '' && f.name.match(/\.(png|jpg|jpeg|webp|gif|avif)/i))) {
					if (app.Documents) {
						await app.Documents.create_document_from_image({
							name: f.name,
							data: readResult.result,
							exif: _this.extract_exif(f)
						});
					} else {
						var order = auto_increment + (order_map[f.name] || i);
						var new_layer = {
							name: f.name,
							type: 'image',
							data: readResult.result,
							order: order,
							_exif: _this.extract_exif(f)
						};
						app.State.do_action(
							new app.Actions.Bundle_action('open_image', 'Open Image', [
								new app.Actions.Insert_layer_action(new_layer)
							])
						);
					}
				}
			} catch (err) {
				console.error('Error reading file:', err);
			}
		}

		//try to open dropped directory
		if (e.dataTransfer && e.dataTransfer.items)	{
			var items = e.dataTransfer.items;
			for (var i=0; i<items.length; i++) {
				var item = items[i].webkitGetAsEntry();
				if (item && item.isDirectory == true) {
					this.traverseFileTree(item);
				}
			}
		}
	}

	traverseFileTree(item, path) {
		var _this = this;
		var auto_increment = this.Base_layers.auto_increment;

		path = path || "";
		if (item.isFile) {
			item.file(async function(file) {
				var FR = new FileReader();
				FR.file = file;

				FR.onload = async function (event) {
					if (this.file.type.match('image.*')
						//below is fix for firefox, it has empty type
						|| (this.file.type == '' && this.file.name.match(/\.(png|jpg|jpeg|webp|gif|avif)/g))) {
						if (app.Documents) {
							await app.Documents.create_document_from_image({
								name: this.file.name,
								data: event.target.result,
								exif: _this.extract_exif(this.file)
							});
						} else {
							var new_layer = {
								name: this.file.name,
								type: 'image',
								data: event.target.result,
								_exif: _this.extract_exif(this.file)
							};
							app.State.do_action(
								new app.Actions.Bundle_action('open_image', 'Open Image', [
									new app.Actions.Insert_layer_action(new_layer)
								])
							);
						}
					}
				};

				FR.readAsDataURL(file);

				//sleep after last image import, it maybe not be finished yet
				await new Promise(r => setTimeout(r, 10));

			});
		}
		else if (item.isDirectory) {
			// Get folder contents
			var dirReader = item.createReader();
			dirReader.readEntries(function(entries) {
				for (var i=0; i<entries.length; i++) {
					_this.traverseFileTree(entries[i], path + item.name + "/");
				}
			});
		}
	}
	
	open_template_test(){
		var _this = this;

		this.Base_layers.debug_rendering = true;
		
		window.fetch("images/test-collection.json").then(function(response) {
			return response.json();
		}).then(function(json) {
			_this.load_json(json, false);
		}).catch(function(ex) {
			alertify.error('Sorry, image could not be loaded.');
		});
	}

	/**
	 * Former auto-open from ?image=<url> query param.
	 * Disabled: automatic remote fetch from the query string is an SSRF / privacy risk
	 * (and can load arbitrary third-party images into the origin context).
	 * Use File -> Open URL for an explicit user-initiated remote open.
	 */
	maybe_file_open_url_handler() {
		// Intentionally no-op. Do not auto-fetch url_params.image.
		return;
	}

	/**
	 * includes provided resource (image or json)
	 *
	 * @param string resource_url
	 */
	open_resource(resource_url) {
		var _this = this;

		if(resource_url.toLowerCase().indexOf('.json') == resource_url.length - 5){
			//load json
			window.fetch(resource_url).then(function(response) {
				return response.json();
			}).then(function(json) {
				_this.load_json(json, false);
			}).catch(function(ex) {
				alertify.error('Sorry, image could not be loaded.');
			});
		}
		else{
			//load image
			var data = {
				url: resource_url,
			};
			this.file_open_url_handler(data);
		}
	}

	//handler for open url. Example url: http://i.imgur.com/ATda8Ae.jpg
	async file_open_url_handler(user_response, as_layer = false) {
		var _this = this;
		var url = user_response.url;
		if (!url)
			return;

		var layer_name = url.replace(/^.*[\\\/]/, '').split('?')[0] || 'Image';

		try {
			// Fetch as blob and convert to local data URL to prevent canvas CORS tainting
			const response = await fetch(url);
			if (!response.ok) throw new Error('Fetch failed with status ' + response.status);
			const blob = await response.blob();
			const reader = new FileReader();
			reader.onload = async function () {
				const dataUrl = reader.result;

				if (as_layer) {
					// Insert directly into the active document as a new layer without creating a new tab
					const new_layer = {
						name: layer_name,
						type: 'image',
						data: dataUrl,
					};
					app.State.do_action(
						new app.Actions.Insert_layer_action(new_layer, false)
					);
					alertify.success(`Added "${layer_name}" as layer.`);
				} else if (app.Documents) {
					await app.Documents.create_document_from_image({
						name: layer_name,
						data: dataUrl,
					});
				} else {
					const img = new Image();
					img.crossOrigin = "Anonymous";
					img.onload = function () {
						var new_layer = {
							name: layer_name,
							type: 'image',
							link: img,
							data: dataUrl,
							width: img.width,
							height: img.height,
							width_original: img.width,
							height_original: img.height,
						};
						app.State.do_action(
							new app.Actions.Bundle_action('open_file_url', 'Open File URL', [
								new app.Actions.Insert_layer_action(new_layer),
								new app.Actions.Autoresize_canvas_action(img.width, img.height, null, true, true)
							])
						);
					};
					img.src = dataUrl;
				}
			};
			reader.readAsDataURL(blob);
		} catch (err) {
			console.warn('Direct blob fetch failed, falling back to crossOrigin Image:', err);
			var img = new Image();
			img.crossOrigin = "Anonymous";
			img.onload = async function () {
				if (as_layer) {
					var new_layer = {
						name: layer_name,
						type: 'image',
						link: img,
						data: url,
						width: img.width,
						height: img.height,
						width_original: img.width,
						height_original: img.height,
					};
					app.State.do_action(
						new app.Actions.Insert_layer_action(new_layer, false)
					);
					alertify.success(`Added "${layer_name}" as layer.`);
				} else if (app.Documents) {
					await app.Documents.create_document_from_image({
						name: layer_name,
						data: url,
					});
				} else {
					var new_layer = {
						name: layer_name,
						type: 'image',
						link: img,
						width: img.width,
						height: img.height,
						width_original: img.width,
						height_original: img.height,
					};
					app.State.do_action(
						new app.Actions.Bundle_action('open_file_url', 'Open File URL', [
							new app.Actions.Insert_layer_action(new_layer),
							new app.Actions.Autoresize_canvas_action(img.width, img.height, null, true, true)
						])
					);
				}
			};
			img.onerror = function (ex) {
				alertify.error('Sorry, image could not be loaded. Try copy image and paste it.');
			};
			img.src = url;
		}
	}

	async load_json(data, filename) {
		if (app.Documents) {
			return await app.Documents.create_document_from_json(data, filename);
		}
		var json;
		if(typeof data == 'string')
			json = JSON.parse(data);
		else
			json = data;
		if (json.info.version == undefined) {
			json.info.version = "3.0.0";
		}

		const isLegacyMiniPaint = json.info.about && json.info.about.includes('miniPaint') && !json.info.about.includes('PhotoChop') && !json.info.about.includes('Vantage') && !json.info.about.includes('Visteras');

		//migration
		if(isLegacyMiniPaint && json.image_data && !json.data && semver_compare(json.info.version, '4.0.0') < 0) {
			//convert from v3 to v4
			for (var i in json.layers) {
				//layers data
				json.layers[i].id = (parseInt(i) + 1);
				json.layers[i].opacity = json.layers[i].opacity * 100 || 100;
				json.layers[i].type = "image";
				json.layers[i].width = json.info.width;
				json.layers[i].height = json.info.height;
				json.layers[i].visible = (json.layers[i].visible == true); //convert to boolean
				delete json.layers[i].title;
			}
			json.data = [];
			for (var i in json.image_data) {
				//image data
				var new_id = null;
				for (var j in json.layers) {
					if (json.layers[j].name == json.image_data[i].name) {
						new_id = json.layers[j].id;
					}
				}
				if (new_id == null)
					continue;
				json.data.push(
					{
						id: new_id,
						data: json.image_data[i].data,
					}
				);
			}
		}
		if(isLegacyMiniPaint && semver_compare(json.info.version, '4.5.0') < 0) {
			//migrate "rectangle", "circle" and "line" types to "shape"
			for (var i in json.layers) {
				var old_type = json.layers[i].type;

				if(old_type == 'line' && json.layers[i].params.type.value == "Arrow"){
					//migrate line (type=arrow) to arrow.
					json.layers[i].type = 'arrow';
					delete json.layers[i].params.type;
					json.layers[i].render_function = ["arrow", "render"];
				}
				if(old_type == 'rectangle' || old_type == 'circle'){
					//migrate params
					json.layers[i].params.border_size = json.layers[i].params.size;
					delete json.layers[i].params.size;

					if(json.layers[i].params.fill == true) {
						json.layers[i].params.border = false;
					}
					else{
						json.layers[i].params.border = true;
					}
					json.layers[i].params.border_color = json.layers[i].color;
					json.layers[i].params.fill_color = json.layers[i].color;

					json.layers[i].color = null;
				}
				if(old_type == 'circle'){
					//rename circle to ellipse
					json.layers[i].type = 'ellipse';
					json.layers[i].render_function = ["ellipse", "render"];
				}
			}
		}
		if(isLegacyMiniPaint && semver_compare(json.info.version, '4.8.0') < 0) {
			//migrate "borders" layer to rectangle
			for (var i in json.layers) {
				var old_type = json.layers[i].type;

				if(old_type == 'borders'){
					json.layers[i].type = 'rectangle';
					json.layers[i].name += ' (legacy)';
					json.layers[i].params = {
						radius: 0,
						fill: false,
						square: false,
						border_size: json.layers[i].params.size,
						border: true,
						border_color: json.layers[i].color,
						fill_color: "#000000",
					};
					json.layers[i].render_function = ["rectangle", "render"];
				}
			}
		}
		if(isLegacyMiniPaint && semver_compare(json.info.version, '4.11.0') < 0) {
			//migrate star and star24 objects
			for (var i in json.layers) {
				var old_type = json.layers[i].type;

				if(old_type == 'star' && typeof json.layers[i].params.corners == "undefined"){
					json.layers[i].params.corners = 5;
					json.layers[i].params.inner_radius = 40;
					json.layers[i].render_function = ["star", "render"];
				}
				else if(old_type == 'star24'){
					json.layers[i].type = 'star';
					json.layers[i].params.corners = 24;
					json.layers[i].params.inner_radius = 80;
					json.layers[i].render_function = ["star", "render"];
				}
			}
		}

		const actions = [];

		//reset zoom
		await this.Base_gui.GUI_preview.zoom(100); //reset zoom

		//set attributes
		actions.push(
			new app.Actions.Refresh_action_attributes_action('undo'),
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({
				ZOOM: 1,
				WIDTH: parseInt(json.info.width),
				HEIGHT: parseInt(json.info.height),
				user_fonts: Object.assign({}, app.FontManager ? app.FontManager.get_user_fonts() : {}, json.user_fonts || {})
			}),
			new app.Actions.Reset_layers_action(),
			new app.Actions.Prepare_canvas_action('do'),
			new app.Actions.Refresh_action_attributes_action('do')
		);

		var max_id_order = 0;
		for (var i in json.layers) {
			var value = json.layers[i];

			if(value.id > max_id_order)
				max_id_order = value.id;
			if(typeof value.order != undefined && value.order > max_id_order)
				max_id_order = value.order;

			if (value.type == 'image') {
				//add image data
				value.link = null;
				for (var j in json.data) {
					if (json.data[j].id == value.id) {
						value.data = json.data[j].data;
					}
				}
			}

			//restore the layer mask (data url -> canvas)
			if (value.mask != null && typeof value.mask == 'object') {
				value.mask = await new Mask_class().restore(value, value.mask);
			}

			actions.push(
				new app.Actions.Insert_layer_action(value, false)
			);
		}
		if (json.info.layer_active != undefined) {
			actions.push(
				new app.Actions.Select_layer_action(json.info.layer_active, true)
			);
		}
		if (json.info.guides != undefined) {
			config.guides = json.info.guides;
		}
		if (json.vectors && Array.isArray(json.vectors)) {
			for (var v of json.vectors) {
				actions.push(new app.Actions.Insert_vector_action(v));
			}
		}
		actions.push(
			new app.Actions.Set_object_property_action(this.Base_layers, 'auto_increment', max_id_order + 1),
			new app.Actions.Update_config_action({
				WIDTH: parseInt(json.info.width),
				HEIGHT: parseInt(json.info.height),
			}),
			new app.Actions.Prepare_canvas_action('do')
		);
		// Migrate legacy clipping-as-blend (composition source-atop) → layer.clipped
		if (json.layers) {
			for (var mi in json.layers) {
				migrate_layer_clipping(json.layers[mi]);
			}
		}
		await app.State.do_action(
			new app.Actions.Bundle_action('open_json_file', 'Open JSON File', actions)
		);
	}

	/**
	 * Returns an action that saves the exif data of the provided object to the current layer
	 */
	extract_exif(object) {
		var exif_data = {
			general: [],
			exif: [],
		};

		//exif data
		EXIF.getData(object, function () {
			exif_data.exif = this.exifdata;
			delete this.exifdata.thumbnail;
		});

		//general
		if (object.name != undefined)
			exif_data.general.Name = object.name;
		if (object.size != undefined)
			exif_data.general.Size = this.Helper.number_format(object.size / 1000, 2) + ' KB';
		if (object.type != undefined)
			exif_data.general.Type = object.type;
		if (object.lastModified != undefined)
			exif_data.general['Last modified'] = this.Helper.format_time(object.lastModified);

		return exif_data;
	}

	search(){
		this.GUI_tools.activate_tool('media');
	}
}

export default File_open_class;

