import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import File_open_class from './../modules/file/open.js';
import Tools_settings_class from './../modules/tools/settings.js';
import Dialog_class from './../libs/popup.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Media_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.File_open = new File_open_class();
		this.Tools_settings = new Tools_settings_class();
		this.POP = new Dialog_class();
		this.name = 'media';
		this.cache = [];
		this.page = 1;
		this.per_page = 50;
	}

	load() {
		//nothing
	}

	render(ctx, layer) {
		//nothing
	}

	on_activate() {
		this.search();
	}

	/**
	 * Image search api
	 *
	 * @param {string} query
	 * @param {array} data
	 * @param pages
	 */
	search(query = '', data = [], pages = null) {
		var _this = this;
		var html = '';
		var html_paging = '';

		var key = config.pixabay_key || '';
		// If key was reversed/obfuscated in legacy configs, un-reverse it; otherwise use as-is
		if (key && !/^\d+-/.test(key)) {
			key = key.split("").reverse().join("");
		}

		var safe_search = this.Tools_settings.get_setting('safe_search');

		if (data.length > 0) {
			html = this._buildResultsHtml(data, pages);
		}
		else{
			this.page = 1;
		}

		var settings = {
			title: 'Search Media & Ephemera',
			className: 'wide',
			params: [
				{name: "query", title: "Keyword:", value: query},
			],
			on_load: function (params, popup) {
				// Handle Enter before the generic dialog's input/document
				// handlers, which otherwise submit on both keydown and keyup.
				const submitOnEnter = (event) => {
					if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
					if (event.target.tagName === 'TEXTAREA' || event.target.isContentEditable ||
						event.target.hasAttribute('data-prevent-submission')) return;
					event.preventDefault();
					event.stopImmediatePropagation();
					if (event.type === 'keydown' && !event.repeat) {
						popup.el.querySelector('[data-id="popup_ok"]').click();
					}
				};
				popup.el.addEventListener('keydown', submitOnEnter, true);
				popup.el.addEventListener('keyup', submitOnEnter, true);
				if (html) {
					_this._appendResults(popup.el, html, params);
				}
			},
			on_finish: async function (params) {
				if (params.query == '')
					return false;

				var cacheKey = _this.page + '|' + params.query;

				if (_this.cache[cacheKey] != undefined) {
					var data = _this.cache[cacheKey];
					var pages = Math.ceil(data.totalHits / _this.per_page);
					_this._updateResultsInPlace(data.hits, pages, params.query);
					return false;
				}

				var endpoint = localStorage.getItem('visteras_pixabay_endpoint') || config.pixabay_endpoint || 'https://us-central1-visteras-5a8b0.cloudfunctions.net/pixabaySearch';
				var customKey = localStorage.getItem('visteras_pixabay_key') || '';
				var effectiveKey = customKey || key;

				try {
					var combinedHits = [];
					var totalHits = 0;

					if (!effectiveKey && !endpoint) {
						alertify.error('No Pixabay API key configured.');
						return false;
					}
					var URL = '';
					if (endpoint) {
						URL = endpoint + (endpoint.includes('?') ? '&' : '?')
							+ "page=" + _this.page
							+ "&per_page=" + _this.per_page
							+ "&safesearch=" + safe_search
							+ "&q=" + encodeURIComponent(params.query);
					} else {
						URL = "https://pixabay.com/api/?key=" + encodeURIComponent(effectiveKey)
							+ "&page=" + _this.page
							+ "&per_page=" + _this.per_page
							+ "&safesearch=" + safe_search
							+ "&q="	+ encodeURIComponent(params.query);
					}
					var res = await fetch(URL);
					if (res.ok) {
						var data = await res.json();
						combinedHits = (data.hits || []).map(h => ({
							previewURL: h.previewURL,
							webformatURL: h.largeImageURL || h.webformatURL,
							source: 'Pixabay'
						}));
						totalHits = data.totalHits || 0;
					}

					if (combinedHits.length === 0) {
						alertify.error('Your search did not match any images.');
					}

					_this.cache[cacheKey] = { hits: combinedHits, totalHits: totalHits };
					var pages = Math.ceil(totalHits / _this.per_page);
					_this._updateResultsInPlace(combinedHits, pages, params.query);
				} catch (err) {
					console.error('Media search failed:', err);
					alertify.error('Error connecting to Pixabay.');
				}
				return false;
			},
		};
		this.POP.show(settings);

		var queryInput = document.getElementById("pop_data_query");
		if (queryInput) queryInput.select();
	}

	_buildResultsHtml(data, pages) {
		var html = '';
		for (var i in data) {
			html += '<div class="item">';
			html += '	<img class="displayBlock pointer" alt="" src="' + data[i].previewURL + '" data-url="' + data[i].webformatURL + '" />';
			html += '</div>';
		}
		//fix for last line
		html += '<div class="item"></div>';
		html += '<div class="item"></div>';
		html += '<div class="item"></div>';
		html += '<div class="item"></div>';

		//paging
		html += '<div class="media-paging" id="media_paging">';
		html += '<button type="button" data-value="1" title="Previous">&lt;</button> ';
		for(var i = 1; i <= Math.min(10, pages); i++) {
			var selected = '';
			if(this.page == i){
				selected = 'selected';
			}
			html += '<button type="button" class="'+selected+'" data-value="'+i+'">'+i+'</button> ';
		}
		html += '<button type="button" data-value="'+Math.min(this.page + 1, pages)+'" title="Next">&gt;</button> ';
		html += '</div>';
		return html;
	}

	_appendResults(popupEl, html, params) {
		var _this = this;
		var node = document.createElement("div");
		node.classList.add('flex-container');
		node.innerHTML = html;
		popupEl.querySelector('.dialog_content').appendChild(node);
		this._bindResultEvents(popupEl, params);
	}

	_updateResultsInPlace(data, pages, query) {
		if (!this.POP.el) return;
		var dialogContent = this.POP.el.querySelector('.dialog_content');
		if (!dialogContent) return;

		// Remove old results container if present
		var old = dialogContent.querySelector('.flex-container');
		if (old) old.remove();

		var html = this._buildResultsHtml(data, pages);
		var node = document.createElement("div");
		node.classList.add('flex-container');
		node.innerHTML = html;
		dialogContent.appendChild(node);

		this._bindResultEvents(this.POP.el, { query: query });
	}

	_bindResultEvents(popupEl, params) {
		var _this = this;
		var targets = popupEl.querySelectorAll('.item img');
		for (var i = 0; i < targets.length; i++) {
			targets[i].addEventListener('click', function (event) {
				var searchTerm = (params && params.query) ? params.query.trim() : '';
				var data = {
					url: this.dataset.url,
					name: searchTerm || 'Stock Image',
				};
				_this.File_open.file_open_url_handler(data, true);
				_this.POP.hide();

				new app.Actions.Activate_tool_action('select', true).do();
			});
		}
		var targets = popupEl.querySelectorAll('#media_paging button');
		for (var i = 0; i < targets.length; i++) {
			targets[i].addEventListener('click', function (event) {
				_this.page = parseInt(this.dataset.value);
				_this.POP.save();
			});
		}
	}
}

export default Media_class;
