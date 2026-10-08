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

		// Cross-app Vector clipboard listener
		try {
			if (typeof BroadcastChannel !== 'undefined') {
				const ch = new BroadcastChannel('visteras-vector-clip');
				ch.addEventListener('message', (ev) => {
					if (ev.data && ev.data.svg) {
						// Our own Studio copy echoes back here; internal storage already has it.
						var nonce = ev.data.nonce || (ev.data.meta && ev.data.meta.nonce) || null;
						if (nonce && config._internal_clipboard && config._internal_clipboard.nonce === nonce) return;
						window.__visteras_last_cross_app_svg = ev.data.svg;
						window.__visteras_last_cross_app_ts = ev.data.ts || Date.now();
						window.__visteras_last_cross_app_nonce = nonce;
					}
				});
			}
		} catch (e) { /* ignore */ }

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

	//default paste action: always paste the MOST RECENT copy (see Edit_paste_class.paste)
	paste_auto(e) {
		if (this.Helper.is_input(e.target))
			return;

		this.paste_mode = 'auto';
		if (!window.Clipboard && this.pasteCatcher) {
			this.pasteCatcher.innerHTML = '';
		}
		if (e.preventDefault) e.preventDefault();
		// Reads e.clipboardData synchronously, then decides between the system
		// clipboard, Studio's internal copy and the Vector cache.
		new Edit_paste_class().paste(e);
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