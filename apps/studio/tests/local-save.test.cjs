const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');

function setup() {
	const app = {};
	const context = vm.createContext({ app, config: { WIDTH: 8, HEIGHT: 8, layers: [] }, Blob, console,
		window: {}, alertify: { success() {}, error() {} }, hydrate_sources: async () => ({}),
		migrate_layer_clipping() {}, document: { createElement: () => createCanvas(1, 1) } });
	for (const file of ['core/base-documents.js', 'modules/file/open.js', 'modules/file/save.js']) {
		vm.runInContext(fs.readFileSync(require.resolve('../src/js/' + file), 'utf8')
			.replace(/^import .*;$/gm, '').replace(/^export default .*;$/gm, ''), context);
	}
	const docs = vm.runInContext('Object.create(Base_documents_class.prototype)', context);
	docs.documents = []; docs.auto_title_count = 1;
	docs.restore_state = async () => {};
	docs.save_current_state = () => {};
	docs.render_tabs = () => {};
	docs.is_active_document_empty = () => docs.documents.length === 0;
	const initial = { id: 'initial' };
	docs.get_active_document = () => docs.documents.find(doc => doc.id === docs.active_id) || initial;
	// The pristine path reuses the current tab, as in the real workspace.
	docs.documents.push(initial); docs.active_id = initial.id;
	docs.is_active_document_empty = () => !docs.get_active_document().layers;
	app.Documents = docs;
	const open = vm.runInContext('Object.create(File_open_class.prototype)', context);
	open.Base_layers = { auto_increment: 1 };
	open.read_file_async = async file => ({ result: file.content });
	const save = vm.runInContext('Object.create(File_save_class.prototype)', context);
	save.export_as_json = () => JSON.stringify({ name: docs.get_active_document().source_filename });
	save.save = () => { throw new Error('Unexpected Save As'); };
	return { context, docs, open, save };
}
function file(name) { return { name, type: 'application/json', content: JSON.stringify({ info: { width: 8, height: 8 }, layers: [] }) }; }
function handle(name) {
	const writes = [];
	return { name, writes, getFile: async () => file(name), queryPermission: async () => 'granted',
		createWritable: async () => ({ write: async blob => writes.push(await blob.text()), close: async () => {} }) };
}

test('Open retains distinct VSD/JSON handles and Save overwrites the matching document without a picker', async () => {
	const { context, docs, open, save } = setup();
	const a = handle('one.vsd'), b = handle('two.json');
	context.window.showOpenFilePicker = async () => [a, b];
	context.window.showSaveFilePicker = () => { throw new Error('Unexpected save picker'); };
	await open.open_file();
	assert.equal(docs.documents[0].fileHandle, a);
	assert.equal(docs.documents[1].fileHandle, b);
	for (const doc of docs.documents) {
		docs.active_id = doc.id; doc.is_dirty = true;
		await save.save_locally();
		assert.equal(doc.is_dirty, false);
		assert.equal(doc.fileHandle.writes.length, 1);
		assert.equal(JSON.parse(doc.fileHandle.writes[0]).name, doc.source_filename);
	}
});

test('drag-and-drop preserves the file handle and legacy input opens without one', async () => {
	const { docs, open } = setup();
	const h = handle('drop.vsd');
	await open.open_handler({ dataTransfer: { files: [file(h.name)], items: [{ kind: 'file',
		getAsFileSystemHandle: () => Promise.resolve(h), webkitGetAsEntry: () => null }] } });
	assert.equal(docs.get_active_document().fileHandle, h);
	await open.open_handler({ target: { files: [file('legacy.vsd')] } });
	assert.equal(docs.get_active_document().fileHandle, null);
});

test('PSD document creation preserves its handle in both pristine and new tabs', async () => {
	const { docs } = setup();
	for (const name of ['one.psd', 'two.psd']) {
		const h = handle(name);
		const doc = await docs.create_document_from_psd_data({ title: name, width: 8, height: 8, layers: [], fileHandle: h });
		assert.equal(doc.fileHandle, h);
		assert.equal(doc.save_format, 'PSD');
	}
});

test('canceling Open does not launch the fallback file picker', async () => {
	const { context, open, docs } = setup();
	context.window.showOpenFilePicker = async () => { throw Object.assign(new Error('Canceled'), { name: 'AbortError' }); };
	await open.open_file();
	assert.equal(docs.documents.length, 1);
});

test('save requests write permission once and aborts failed writes without committing them', async () => {
	const { save } = setup();
	let requested = 0, aborted = 0, closed = 0;
	const h = { name: 'file.vsd', queryPermission: async () => 'prompt',
		requestPermission: async () => { requested++; return 'granted'; },
		createWritable: async () => ({ write: async () => { throw new Error('disk full'); },
			close: async () => { closed++; }, abort: async () => { aborted++; } }) };
	await assert.rejects(save._write_document_to_handle(h, 'VSD'), /disk full/);
	assert.equal(requested, 1); assert.equal(aborted, 1); assert.equal(closed, 0);
});

test('serialization failure never opens a write stream', async () => {
	const { save } = setup();
	save.export_as_json = () => { throw new Error('invalid document'); };
	await assert.rejects(save._write_document_to_handle({ createWritable() { assert.fail('Must not open stream'); } }, 'VSD'), /invalid document/);
});

test('Save As retains the initiating document and its content if the active tab changes', async () => {
	const { context, docs, open, save } = setup();
	await open.open_handler({ target: { files: [file('first.vsd'), file('second.vsd')] } });
	const [first, second] = docs.documents;
	first.is_dirty = second.is_dirty = true; docs.active_id = first.id;
	const h = handle('saved.vsd');
	context.window.showSaveFilePicker = async () => { docs.active_id = second.id; return h; };
	await save.save_locally();
	assert.equal(first.fileHandle, h);
	assert.equal(first.is_dirty, false);
	assert.equal(second.fileHandle, null);
	assert.equal(second.is_dirty, true);
	assert.equal(JSON.parse(h.writes[0]).name, 'first.vsd');
});

test('a failed first save leaves the document dirty and does not attach the unsuccessful destination', async () => {
	const { context, docs, open, save } = setup();
	await open.open_handler({ target: { files: [file('first.vsd')] } });
	const doc = docs.get_active_document(); doc.is_dirty = true;
	context.window.showSaveFilePicker = async () => ({ name: 'failed.vsd', createWritable: async () => { throw new Error('Not writable'); } });
	let fallback = false; save.save = () => { fallback = true; };
	await save.save_locally();
	assert.equal(doc.fileHandle, null);
	assert.equal(doc.is_dirty, true);
	assert.equal(fallback, true);
});
