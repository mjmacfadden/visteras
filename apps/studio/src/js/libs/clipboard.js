import Helper_class from './helpers.js';
import config from './../config.js';
import Edit_paste_class from './../modules/edit/paste.js';

/**
 * image pasting into canvas
 * 
 * @param {string} canvas_id - canvas id
 * @param {boolean} autoresize - if canvas will be resized
 */
class Clipboard_class {

	constructor(on_paste) {
		var _self = this;

		this.Helper = new Helper_class();

		this.on_paste = on_paste;
		this.ctrl_pressed = false;
		this.command_pressed = false;
		this.pasteCatcher;
		this.paste_mode;

		//handlers
		document.addEventListener('keydown', function (e) {
			_self.on_keyboard_action(e);
		}, false); //firefox fix
		document.addEventListener('keyup', function (e) {
			_self.on_keyboardup_action(e);
		}, false); //firefox fix
		document.addEventListener('paste', function (e) {
			_self.paste_auto(e);
		}, false); //official paste handler

		this.init();
	}

	//constructor - prepare
	init() {
		var _self = this;

		//if using auto
		if (window.Clipboard)
			return true;

		this.pasteCatcher = document.createElement("div");
		this.pasteCatcher.setAttribute("id", "paste_ff");
		this.pasteCatcher.setAttribute("contenteditable", "");
		this.pasteCatcher.style.cssText = 'opacity:0;position:fixed;top:0px;left:0px;';
		this.pasteCatcher.style.marginLeft = "-20px";
		this.pasteCatcher.style.width = "10px";
		document.body.appendChild(this.pasteCatcher);

		// create an observer instance
		var observer = new MutationObserver(function (mutations) {
			mutations.forEach(function (mutation) {
				if (this.paste_mode == 'auto' || this.ctrl_pressed == false || mutation.type != 'childList')
					return true;

				//if paste handle failed - capture pasted object manually
				if (mutation.addedNodes.length == 1) {
					if (mutation.addedNodes[0].src != undefined) {
						//image
						_self.paste_createImage(mutation.addedNodes[0].src);
					}
					//register cleanup after some time.
					setTimeout(function () {
						this.pasteCatcher.innerHTML = '';
					}, 20);
				}
			});
		});
		var target = document.getElementById('paste_ff');
		var config = {attributes: true, childList: true, characterData: true};
		observer.observe(target, config);
	}

	//default paste action
	paste_auto(e) {
		if (this.Helper.is_input(e.target))
			return;

		this.paste_mode = '';
		if (!window.Clipboard) {
			this.pasteCatcher.innerHTML = '';
		}

		// If we have an in-app copy, prefer the internal clipboard so
		// non-rectangular shapes, positions, transparent alphas, and vectors are preserved
		if (config._internal_clipboard != null && config._internal_clipboard_fresh) {
			config._internal_clipboard_fresh = false;
			new Edit_paste_class().paste_internal();
			if (e.preventDefault) e.preventDefault();
			return;
		}

		// Cross-app / system SVG (Vector -> Studio) — check before raster image/*
		var paste_instance = new Edit_paste_class();
		var handled_svg = false;
		var maybe_handle_svg = function () {
			return paste_instance.paste_from_system_svg(e).then(function (ok) {
				if (ok) {
					handled_svg = true;
					if (e.preventDefault) e.preventDefault();
				}
				return ok;
			}).catch(function () { return false; });
		};

		if (e.clipboardData) {
			var items = e.clipboardData.items;
			var types = e.clipboardData.types ? Array.prototype.slice.call(e.clipboardData.types) : [];
			var has_svg_hint = false;
			if (items) {
				for (var si = 0; si < items.length; si++) {
					var t = items[si].type || '';
					if (t === 'image/svg+xml' || t === 'text/plain' || t === 'text/html' || t.indexOf('visteras-vector') !== -1) {
						has_svg_hint = true;
						break;
					}
				}
			}
			if (!has_svg_hint && types) {
				has_svg_hint = types.indexOf('image/svg+xml') !== -1 || types.indexOf('text/plain') !== -1;
			}

			if (has_svg_hint) {
				// Async SVG attempt; if it fails, fall through to image handling below via then()
				var _this = this;
				maybe_handle_svg().then(function (ok) {
					if (ok) return;
					_this._paste_raster_from_event(e);
				});
				// Prevent default eagerly when svg+xml is explicitly present
				for (var j = 0; j < (items ? items.length : 0); j++) {
					if ((items[j].type || '') === 'image/svg+xml') {
						if (e.preventDefault) e.preventDefault();
						return;
					}
				}
				// For text/plain we still prevent default after kicking off async parse
				if (e.preventDefault) e.preventDefault();
				return;
			}

			this._paste_raster_from_event(e);
		}
		else if (config._internal_clipboard != null) {
			new Edit_paste_class().paste_internal();
			if (e.preventDefault) e.preventDefault();
		}
	}

	_paste_raster_from_event(e) {
		if (e.clipboardData) {
			var items = e.clipboardData.items;
			if (items) {
				this.paste_mode = 'auto';
				var found_image = false;
				for (var i = 0; i < items.length; i++) {
					var type = items[i].type || '';
					// Skip SVG — handled by paste_from_system_svg
					if (type === 'image/svg+xml') continue;
					if (type.indexOf("image") !== -1) {
						found_image = true;
						var blob = items[i].getAsFile();
						var URLObj = window.URL || window.webkitURL;
						var source = URLObj.createObjectURL(blob);
						this.paste_createImage(source);
					}
				}
				if (e.preventDefault) e.preventDefault();
				if (!found_image && config._internal_clipboard != null) {
					new Edit_paste_class().paste_internal();
				}
			}
		}
	}

	//on keyboard press
	on_keyboard_action(event) {
		var k = event.keyCode;
		//ctrl
		if (k == 17 || event.metaKey || event.ctrlKey) {
			if (this.ctrl_pressed == false)
				this.ctrl_pressed = true;
		}
		//v
		if (k == 86) {
			if (this.Helper.is_input(document.activeElement)) {
				return false;
			}

			if (this.ctrl_pressed == true && !window.Clipboard)
				this.pasteCatcher.focus();
		}
	}

	//on kaybord release
	on_keyboardup_action(event) {
		//ctrl
		if (event.ctrlKey == false && this.ctrl_pressed == true) {
			this.ctrl_pressed = false;
		}
		//command
		else if (event.metaKey == false && this.command_pressed == true) {
			this.command_pressed = false;
			this.ctrl_pressed = false;
		}
	}

	//draw image
	paste_createImage(source) {
		var pastedImage = new Image();
		var _this = this;

		pastedImage.onload = function () {
			_this.on_paste(source, pastedImage.width, pastedImage.height);
		};
		pastedImage.src = source;
	}
}

export default Clipboard_class;