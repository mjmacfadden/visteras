const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(fetch) {
	let settings;
	const button = { disabled: false, dataset: {}, textContent: '', innerHTML: '',
		classList: { add(name) { button.className = name; } }, setAttribute(name, value) { button[name] = value; } };
	const listeners = {};
	const popup = { el: { querySelector: () => button, addEventListener: (name, cb) => { listeners[name] = cb; } },
		show(value) { settings = value; value.on_load({}, this); }, save() { return settings.on_finish(params); } };
	const context = vm.createContext({ Base_tools_class: class {}, document: { createElement: () => ({}), head: { appendChild() {} }, getElementById: () => null },
		config: {}, localStorage: { getItem: () => null }, alertify: { error() {} }, fetch, console: { error() {} } });
	const src = fs.readFileSync(require.resolve('../src/js/tools/media.js'), 'utf8').replace(/^import .*;$/gm, '').replace('export default Media_class;', 'this.Media_class = Media_class;');
	vm.runInContext(src, context);
	const media = Object.create(context.Media_class.prototype);
	Object.assign(media, { POP: popup, Tools_settings: { get_setting() {} }, cache: [], page: 1, per_page: 48, _updateResultsInPlace() {} });
	const params = { query: 'forest', image_type: 'all', orientation: 'all', category: 'all', safe_search: true };
	media.search();
	return { media, popup, button, listeners, params, submit: () => settings.on_finish(params) };
}

test('Pixabay displays loading until the request resolves, and prevents duplicate submissions', async () => {
	let resolve, requests = 0;
	const h = harness(() => { requests++; return new Promise(r => { resolve = r; }); });
	const pending = h.submit();
	assert.equal(h.button.disabled, true);
	assert.equal(h.button['aria-busy'], 'true');
	assert.match(h.button.innerHTML, /media-search-spinner/);
	assert.equal(h.button.className, 'media-search-submit');
	await h.submit(); assert.equal(requests, 1);
	resolve({ ok: true, json: async () => ({ hits: [], totalHits: 0 }) });
	await pending;
	assert.equal(h.button.disabled, false); assert.equal(h.button.textContent, 'Search');
	assert.equal(h.button['aria-busy'], 'false');
	await h.submit(); assert.equal(requests, 1, 'cached search resets without another request');
	assert.equal(h.button.disabled, false);
});

test('Empty and failed searches restore Search; Enter does not resubmit while busy', async () => {
	const h = harness(async () => { throw new Error('offline'); });
	h.params.query = ''; await h.submit(); assert.equal(h.button.disabled, false);
	h.params.query = 'forest'; await h.submit(); assert.equal(h.button.disabled, false);
	let submits = 0; h.popup.save = () => { submits++; };
	const enter = { key: 'Enter', type: 'keydown', target: { tagName: 'INPUT', hasAttribute: () => false }, preventDefault() {}, stopImmediatePropagation() {} };
	h.button.disabled = true; h.listeners.keydown(enter); assert.equal(submits, 0);
	h.button.disabled = false; h.listeners.keydown(enter); assert.equal(submits, 1);
});

test('Search progress stays visible despite the global disabled-button rule', () => {
	const css = fs.readFileSync(require.resolve('../src/css/popup.css'), 'utf8');
	assert.match(css, /#popups \.popup \.media-search-submit:disabled\s*\{\s*visibility:\s*visible;/);
});
