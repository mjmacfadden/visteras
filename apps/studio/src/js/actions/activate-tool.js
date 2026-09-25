import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import Vector_manager from './../core/vector/vector-manager.js';

export class Activate_tool_action extends Base_action {
	/**
	 * Groups multiple actions together in the undo/redo history, runs them all at once.
	 */
	constructor(key, ignore_same_tool, options = {}) {
		super('activate_tool', 'Activate Tool');
		this.ignore_same_tool = !!ignore_same_tool;
		if (key === 'magic_erase') {
			key = 'magic_wand';
		}
		this.key = key;
		this.old_key = null;
		this.tool_leave_actions = null;
		this.tool_activate_actions = null;
		// Hot-swap / temporary overrides (Alt eyedropper, Space pan): keep prior options bar.
		this.hot_swap = !!(options && (options.hot_swap || options.skip_options_bar));
	}

	async do() {
		super.do();
		const key = this.key;
		this.old_key = app.GUI.GUI_tools.active_tool;

		if (this.key !== this.old_key || this.ignore_same_tool) {
			if (key !== 'pick_color' && app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.alt_eyedropper_tool && app.GUI.GUI_shortcuts.alt_eyedropper_tool !== key) {
				app.GUI.GUI_shortcuts.alt_eyedropper_tool = null;
				app.GUI.GUI_shortcuts._restore_eyedropper_pending = false;
			}

			var oldOwner = app.GUI.GUI_tools.get_button_id_for_tool(this.old_key);

			//reset last
			document.querySelector('#tools_container .' + oldOwner).classList.remove("active");

			//send exit event to old previous tool
			if (config.TOOL.on_leave != undefined) {
				var moduleKey = config.TOOL.name;
				var functionName = config.TOOL.on_leave;
				this.tool_leave_actions = app.GUI.GUI_tools.tools_modules[moduleKey].object[functionName]();
				if (this.tool_leave_actions) {
					for (let action of this.tool_leave_actions) {
						await action.do();
					}
				}
			}

			//change active
			app.GUI.GUI_tools.active_tool = key;
			var newOwner = app.GUI.GUI_tools.get_button_id_for_tool(key);
			document.querySelector('#tools_container .' + newOwner)
				.classList.add("active");
			for (let i in config.TOOLS) {
				if (config.TOOLS[i].name == app.GUI.GUI_tools.active_tool) {
					config.TOOL = config.TOOLS[i];
				}
			}
			//sync the toolbar group button when a member tool (e.g. pencil) activates
			app.GUI.GUI_tools.sync_group_button_for_tool(key);

			if (key !== 'text') {
				const textTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text'])
					? app.GUI.GUI_tools.tools_modules['text'].object
					: null;
				if (textTool) {
					textTool.focused = false;
					textTool.selecting = false;
					textTool.creating = false;
					if (textTool.textarea) textTool.textarea.blur();
				}
			}

			//check module
			if (app.GUI.GUI_tools.tools_modules[key] == undefined) {
				alertify.error('Tools class not found: ' + key);
				return;
			}

			//set default cursor
			const mainWrapper = document.getElementById('main_wrapper');
			const middleArea = document.querySelector('.middle_area');
			const brushTools = ['brush', 'pencil', 'erase', 'clone', 'spot_heal', 'blur', 'sharpen', 'desaturate', 'bulge_pinch', 'quick_selection'];
			const crosshairTools = ['selection', 'lasso', 'gradient', 'crop'];

			let defaultCursor = 'default';
			if (config.TOOL && brushTools.includes(config.TOOL.name)) {
				defaultCursor = 'none';
			} else if (config.TOOL && config.TOOL.name === 'text') {
				defaultCursor = 'text';
			} else if (config.TOOL && config.TOOL.name === 'magic_wand') {
				defaultCursor = "url('images/icons/cursor-magic-wand.svg') 7 7, crosshair";
			} else if (config.TOOL && crosshairTools.includes(config.TOOL.name)) {
				defaultCursor = 'crosshair';
			} else if (config.TOOL && config.TOOL.name === 'pick_color') {
				defaultCursor = "url('images/icons/cursor-eyedropper.svg') 2 22, crosshair";
			} else if (config.TOOL && config.TOOL.name === 'pen') {
				defaultCursor = "url('images/icons/cursor-pen.svg') 4 4, crosshair";
			} else if (config.TOOL && config.TOOL.name === 'direct_select') {
				defaultCursor = "url('images/icons/cursor-direct-select.svg') 1 1, default";
			} else if (config.TOOL && config.TOOL.name === 'fill') {
				defaultCursor = "url('images/icons/cursor-fill.svg') 8 22, crosshair";
			}

			if (mainWrapper && mainWrapper.style.cursor != defaultCursor) {
				mainWrapper.style.cursor = defaultCursor;
			}
			// Toggle tool class on middle_area
			if (middleArea) {
				for (let i = middleArea.classList.length - 1; i >= 0; i--) {
					const cls = middleArea.classList[i];
					if (cls.startsWith('tool-')) {
						middleArea.classList.remove(cls);
					}
				}
				if (config.TOOL && config.TOOL.name) {
					middleArea.classList.add('tool-' + config.TOOL.name);
				}
			}
			// Toggle pan tool class on body (grab/grabbing cursor)
			document.body.classList.toggle('tool-pan', config.TOOL && config.TOOL.name === 'pan');

			// Type tool: seed Size from baked span/params BEFORE mounting the options bar.
			// Prior fixes synced after show_action_attributes(); the Size widget was created
			// from a stale TOOLS default and set_value after remount was unreliable.
			const textToolEarly = (key === 'text' && app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text'])
				? app.GUI.GUI_tools.tools_modules['text'].object
				: null;
			if (textToolEarly) {
				textToolEarly.focused = false;
				if (typeof textToolEarly.sync_fill_from_foreground === 'function') {
					textToolEarly.sync_fill_from_foreground({ rebuild: false });
				}
				if (config.layer && config.layer.type === 'text' && typeof textToolEarly.sync_size_from_layer === 'function') {
					textToolEarly.sync_size_from_layer(config.layer);
				}
			}

			const vectorTools = ['rectangle', 'ellipse', 'polygon', 'star', 'custom_shape', 'pen'];
			if (vectorTools.includes(key)) {
				if (config.layer && config.layer.type === 'vector') {
					const vecId = config.layer.vector_id || (config.layer.params && config.layer.params.vector_id);
					if (vecId) {
						Vector_manager.set_active_vector(vecId);
					}
				}
				const toolObj = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules[key])
					? app.GUI.GUI_tools.tools_modules[key].object
					: null;
				if (toolObj && typeof toolObj.sync_vector_options_bar === 'function') {
					toolObj.sync_vector_options_bar();
				}
			}

			if (key === 'gradient') {
				const gradTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['gradient'])
					? app.GUI.GUI_tools.tools_modules['gradient'].object
					: null;
				if (gradTool) {
					if (typeof gradTool.sync_colors_from_fg_bg === 'function') {
						gradTool.sync_colors_from_fg_bg({ rebuild: false });
					}
					if (config.layer && config.layer.type === 'gradient'
						&& typeof gradTool.sync_options_from_layer === 'function') {
						gradTool.sync_options_from_layer(config.layer, { rebuild: false });
					}
				}
			}

			// Leave the previous tool's options bar mounted during temporary hot-swaps
			// (Alt→eyedropper, Space→pan) so attrs don't flash to pan/eyedropper.
			if (!this.hot_swap) {
				app.GUI.GUI_tools.show_action_attributes();
				app.GUI.GUI_tools.Helper.setCookie('active_tool', app.GUI.GUI_tools.active_tool);
			}

			// Show brush cursor immediately if switching to a brush tool
			if (brushTools.includes(config.TOOL.name)) {
				this.show_brush_cursor(config.TOOL.attributes.size);
			} else {
				this.hide_brush_cursor();
			}

			if (textToolEarly && config.layer && config.layer.type === 'text') {
				const editor = textToolEarly.get_editor(config.layer);
				if (editor && typeof textToolEarly.update_tool_attributes === 'function') {
					// Font/weight/etc from selection — Size re-seeded from baked layer after.
					textToolEarly.update_tool_attributes(config.layer, editor);
				}
				// update_tool_attributes remounts the bar from selection meta; re-assert Size
				// and remount so the Size widget is *created* with the baked value.
				if (typeof textToolEarly.sync_size_from_layer === 'function') {
					textToolEarly.sync_size_from_layer(config.layer);
				}
				if (!this.hot_swap) {
					app.GUI.GUI_tools.show_action_attributes();
				}
			}
		}

		//send activate event to new tool
		if (config.TOOL.on_activate != undefined) {
			var moduleKey = config.TOOL.name;
			var functionName = config.TOOL.on_activate;
			this.tool_activate_actions = app.GUI.GUI_tools.tools_modules[moduleKey].object[functionName]();
			if (this.tool_activate_actions) {
				for (let action of this.tool_activate_actions) {
					await action.do();
				}
			}
		}

		config.need_render = true;
	}

	async undo() {
		super.undo();

		// Undo activate actions
		if (this.tool_activate_actions) {
			for (let action of this.tool_activate_actions) {
				await action.undo();
				action.free();
			}
			this.tool_activate_actions = null;
		}

		//reset last
		var oldOwner = app.GUI.GUI_tools.get_button_id_for_tool(this.key);
		document.querySelector('#tools_container .' + oldOwner)
			.classList.remove("active");

		//change active
		app.GUI.GUI_tools.active_tool = this.old_key;
		var newOwner = app.GUI.GUI_tools.get_button_id_for_tool(app.GUI.GUI_tools.active_tool);
		document.querySelector('#tools_container .' + newOwner)
			.classList.add("active");
		for (let i in config.TOOLS) {
			if (config.TOOLS[i].name == app.GUI.GUI_tools.active_tool) {
				config.TOOL = config.TOOLS[i];
			}
		}
		const vectorTools = ['rectangle', 'ellipse', 'polygon', 'star', 'custom_shape', 'pen'];
		if (vectorTools.includes(this.old_key)) {
			if (config.layer && config.layer.type === 'vector') {
				const vecId = config.layer.vector_id || (config.layer.params && config.layer.params.vector_id);
				if (vecId) {
					Vector_manager.set_active_vector(vecId);
				}
			}
			const toolObj = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules[this.old_key])
				? app.GUI.GUI_tools.tools_modules[this.old_key].object
				: null;
			if (toolObj && typeof toolObj.sync_vector_options_bar === 'function') {
				toolObj.sync_vector_options_bar();
			}
		}

		app.GUI.GUI_tools.sync_group_button_for_tool(app.GUI.GUI_tools.active_tool);

		app.GUI.GUI_tools.show_action_attributes();
		app.GUI.GUI_tools.Helper.setCookie('active_tool', app.GUI.GUI_tools.active_tool);

		//set default cursor
		const mainWrapper = document.getElementById('main_wrapper');
		const middleArea = document.querySelector('.middle_area');
		const brushTools = ['brush', 'pencil', 'erase', 'clone', 'spot_heal', 'blur', 'sharpen', 'desaturate', 'bulge_pinch', 'quick_selection'];
		const crosshairTools = ['selection', 'lasso', 'gradient', 'crop'];

		let defaultCursor = 'default';
		if (config.TOOL && brushTools.includes(config.TOOL.name)) {
			defaultCursor = 'none';
		} else if (config.TOOL && config.TOOL.name === 'text') {
			defaultCursor = 'text';
		} else if (config.TOOL && config.TOOL.name === 'magic_wand') {
			defaultCursor = "url('images/icons/cursor-magic-wand.svg') 7 7, crosshair";
		} else if (config.TOOL && crosshairTools.includes(config.TOOL.name)) {
			defaultCursor = 'crosshair';
		} else if (config.TOOL && config.TOOL.name === 'pick_color') {
			defaultCursor = "url('images/icons/cursor-eyedropper.svg') 2 22, crosshair";
		} else if (config.TOOL && config.TOOL.name === 'pen') {
			defaultCursor = "url('images/icons/cursor-pen.svg') 4 4, crosshair";
		} else if (config.TOOL && config.TOOL.name === 'direct_select') {
			defaultCursor = "url('images/icons/cursor-direct-select.svg') 1 1, default";
		} else if (config.TOOL && config.TOOL.name === 'fill') {
			defaultCursor = "url('images/icons/cursor-fill.svg') 8 22, crosshair";
		}

		if (mainWrapper && mainWrapper.style.cursor != defaultCursor) {
			mainWrapper.style.cursor = defaultCursor;
		}
		// Toggle tool class on middle_area
		if (middleArea) {
			for (let i = middleArea.classList.length - 1; i >= 0; i--) {
				const cls = middleArea.classList[i];
				if (cls.startsWith('tool-')) {
					middleArea.classList.remove(cls);
				}
			}
			if (config.TOOL && config.TOOL.name) {
				middleArea.classList.add('tool-' + config.TOOL.name);
			}
		}
		// Toggle pan tool class on body (grab/grabbing cursor)
		document.body.classList.toggle('tool-pan', config.TOOL && config.TOOL.name === 'pan');

		// Show brush cursor immediately if switching to a brush tool
		if (brushTools.includes(config.TOOL.name)) {
			this.show_brush_cursor(config.TOOL.attributes.size);
		} else {
			this.hide_brush_cursor();
		}

		// Undo leave actions
		if (this.tool_leave_actions) {
			for (let action of this.tool_leave_actions) {
				await action.undo();
				action.free();
			}
			this.tool_leave_actions = null;
		}

		config.need_render = true;
	}

	free() {
		if (this.tool_activate_actions) {
			for (let action of this.tool_activate_actions) {
				action.free();
			}
			this.tool_activate_actions = null;
		}
		if (this.tool_leave_actions) {
			for (let action of this.tool_leave_actions) {
				action.free();
			}
			this.tool_leave_actions = null;
		}
	}

	show_brush_cursor(size) {
		const element = document.getElementById('mouse');
		const wrapper = document.getElementById('canvas_wrapper');
		if (!element || !wrapper || !size) return;
		const rawSize = (typeof size === 'object' && size != null) ? (size.value ?? 30) : size;
		const zoom = config.ZOOM || 1;
		const px = Math.max(rawSize * zoom, 5);
		const wRect = wrapper.getBoundingClientRect();
		element.style.width = px + 'px';
		element.style.height = px + 'px';
		element.style.left = (wRect.width / 2 - px / 2) + 'px';
		element.style.top = (wRect.height / 2 - px / 2) + 'px';
		let cursorClass = 'circle';
		if (config.TOOL && config.TOOL.name === 'pencil') {
			cursorClass = 'rect';
		} else if (config.TOOL && config.TOOL.name === 'quick_selection') {
			cursorClass = 'quick_selection_add';
		}
		element.className = cursorClass;
	}

	hide_brush_cursor() {
		const element = document.getElementById('mouse');
		if (element) {
			element.className = '';
		}
	}
}