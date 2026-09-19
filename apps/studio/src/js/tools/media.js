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
			html_paging += '<div class="media-paging" id="media_paging">';
			html_paging += '<button type="button" data-value="1" title="Previous">&lt;</button> ';
			for(var i = 1; i <= Math.min(10, pages); i++) {
				var selected = '';
				if(this.page == i){
					var selected = 'selected';
				}
				html_paging += '<button type="button" class="'+selected+'" data-value="'+i+'">'+i+'</button> ';
			}
			html_paging += '<button type="button" data-value="'+Math.min(this.page + 1, pages)+'" title="Next">&gt;</button> ';
			html_paging += '</div>';
		}
		else{
			this.page = 1;
		}

		var settings = {
			title: 'Search Media & Ephemera',
			className: 'wide',
			params: [
				{name: "query", title: "Keyword:", value: query},
				{name: "source", title: "Source:", value: "both", values: [
					{name: "both", title: "Mixed (Pixabay + Library of Congress)"},
					{name: "pixabay", title: "Pixabay (Stock / Vectors)"},
					{name: "loc", title: "Chronicling America (Historic LOC)"}
				]},
			],
			on_load: function (params, popup) {
				var node = document.createElement("div");
				node.classList.add('flex-container');
				node.innerHTML = html + html_paging;
				popup.el.querySelector('.dialog_content').appendChild(node);
				//events
				var targets = popup.el.querySelectorAll('.item img');
				for (var i = 0; i < targets.length; i++) {
					targets[i].addEventListener('click', function (event) {
						//we have click
						var searchTerm = (params && params.query) ? params.query.trim() : (query ? query.trim() : '');
						var data = {
							url: this.dataset.url,
							name: searchTerm || 'Stock Image',
						};
						_this.File_open.file_open_url_handler(data, true);
						_this.POP.hide();

						new app.Actions.Activate_tool_action('select', true).do();
					});
				}
				var targets = popup.el.querySelectorAll('#media_paging button');
				for (var i = 0; i < targets.length; i++) {
					targets[i].addEventListener('click', function (event) {
						//we have click
						_this.page = parseInt(this.dataset.value);
						_this.POP.save();
					});
				}
			},
			on_finish: async function (params) {
				if (params.query == '')
					return;

				var selectedSource = params.source || 'both';
				var cacheKey = `${selectedSource}|${_this.page}|${params.query}`;

				if (_this.cache[cacheKey] != undefined) {
					var data = _this.cache[cacheKey];
					var pages = Math.ceil(data.totalHits / _this.per_page);
					_this.search(params.query, data.hits, pages);
					return;
				}

				var endpoint = localStorage.getItem('visteras_pixabay_endpoint') || config.pixabay_endpoint || 'https://us-central1-visteras-5a8b0.cloudfunctions.net/pixabaySearch';
				var customKey = localStorage.getItem('visteras_pixabay_key') || '';
				var effectiveKey = customKey || key;

				var fetchPixabay = async function() {
					if (!effectiveKey && !endpoint) return { hits: [], totalHits: 0 };
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
					try {
						var res = await fetch(URL);
						if (res.ok) {
							var data = await res.json();
							return {
								hits: (data.hits || []).map(h => ({
									previewURL: h.previewURL,
									webformatURL: h.largeImageURL || h.webformatURL,
									source: 'Pixabay'
								})),
								totalHits: data.totalHits || 0
							};
						}
					} catch (_) {}
					return { hits: [], totalHits: 0 };
				};

				var fetchLoc = async function() {
					var controller = new AbortController();
					var timer = setTimeout(function() {
						controller.abort();
					}, 2500); // 2.5s max timeout so LOC never blocks UI

					var locUrl = `https://www.loc.gov/collections/chronicling-america/?fo=json&q=${encodeURIComponent(params.query)}&c=${_this.per_page}&sp=${_this.page}`;
					try {
						var res = await fetch(locUrl, {
							headers: { 'Accept': 'application/json' },
							signal: controller.signal
						});
						clearTimeout(timer);
						if (res.ok) {
							var data = await res.json();
							var mapped = [];
							for (var item of (data.results || [])) {
								if (!item.image_url || !Array.isArray(item.image_url)) continue;
								var jpgs = item.image_url.filter(u => typeof u === 'string' && u.includes('.jpg'));
								if (jpgs.length === 0) continue;
								var preview = (jpgs[Math.min(1, jpgs.length - 1)] || jpgs[0]).split('#')[0];
								var large = preview.replace(/pct:\d+(\.\d+)?/, 'pct:25');
								mapped.push({
									previewURL: preview,
									webformatURL: large,
									source: 'Library of Congress'
								});
							}
							return {
								hits: mapped,
								totalHits: data.pagination ? data.pagination.total : mapped.length
							};
						}
					} catch (_) {
						clearTimeout(timer);
					}
					return { hits: [], totalHits: 0 };
				};

				try {
					var combinedHits = [];
					var totalHits = 0;

					if (selectedSource === 'pixabay') {
						var pResult = await fetchPixabay();
						combinedHits = pResult.hits;
						totalHits = pResult.totalHits;
					} else if (selectedSource === 'loc') {
						var lResult = await fetchLoc();
						combinedHits = lResult.hits;
						totalHits = lResult.totalHits;
					} else {
						// Both / Mixed: Fast Pixabay + Fast LOC with timeout
						var [pResult, lResult] = await Promise.all([fetchPixabay(), fetchLoc()]);
						var maxLen = Math.max(pResult.hits.length, lResult.hits.length);
						for (var i = 0; i < maxLen; i++) {
							if (pResult.hits[i]) combinedHits.push(pResult.hits[i]);
							if (lResult.hits[i]) combinedHits.push(lResult.hits[i]);
						}
						totalHits = (pResult.totalHits || 0) + (lResult.totalHits || 0);
					}

					if (combinedHits.length === 0) {
						alertify.error('Your search did not match any images.');
					}

					_this.cache[cacheKey] = { hits: combinedHits, totalHits: totalHits };
					var pages = Math.ceil(totalHits / _this.per_page);
					_this.search(params.query, combinedHits, pages);
				} catch (err) {
					console.error('Media search failed:', err);
					alertify.error('Error connecting to image services.');
				}
			},
		};
		this.POP.show(settings);

		document.getElementById("pop_data_query").select();
	}
}

export default Media_class;
