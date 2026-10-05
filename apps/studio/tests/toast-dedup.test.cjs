const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(options) {
	const timers = [], shown = [];
	const context = vm.createContext({ setTimeout: fn => timers.push(fn) });
	vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/toast-dedup.js'), 'utf8').replace(/export /g, ''), context);
	const alertify = { confirm: () => 'dialog' };
	for (const method of ['notify', 'message', 'success', 'warning', 'error']) {
		alertify[method] = (...args) => {
			const callback = args[method === 'notify' ? 3 : 2];
			const toast = { element: { isConnected: true }, delay(wait) { this.wait = wait; return this; },
				dismiss() { callback.call(this, true); return this; } };
			shown.push({ method, args, toast }); return toast;
		};
	}
	context.install_toast_dedup(alertify, options);
	return { alertify, shown, timers, install: context.install_toast_dedup };
}

test('duplicate Saved and PSD-generation messages share one toast each', () => {
	const { alertify, shown } = setup();
	assert.equal(alertify.success('Saved.'), alertify.success('Saved.'));
	assert.equal(alertify.message('Generating Photoshop Document...'), alertify.message('Generating Photoshop Document...'));
	assert.equal(shown.length, 2);
});

test('all notification methods deduplicate and preserve distinct messages and dialogs', () => {
	const { alertify, shown } = setup();
	const toast = alertify.error('Failed.');
	assert.equal(alertify.notify(' Failed. ', 'error', 5), toast);
	assert.equal(alertify.warning('Failed.'), toast);
	alertify.success('Saved.');
	assert.equal(shown.length, 2);
	assert.equal(alertify.confirm(), 'dialog');
});

test('duplicates refresh the existing toast and preserve dismissal callbacks', () => {
	const { alertify, shown } = setup();
	let a = 0, b = 0;
	const toast = alertify.success('Saved.', 2, () => a++);
	alertify.success('Saved.', 6, () => b++);
	assert.equal(toast.wait, 6);
	toast.dismiss();
	assert.equal(a, 1); assert.equal(b, 1); assert.equal(shown.length, 1);
});

test('duplicates stay suppressed through exit animation but later operations can notify again', () => {
	const { alertify, shown, timers } = setup();
	const toast = alertify.success('Saved.');
	toast.dismiss();
	assert.equal(alertify.success('Saved.'), toast);
	assert.equal(shown.length, 1);
	toast.element.isConnected = false; timers.shift()();
	alertify.success('Saved.');
	assert.equal(shown.length, 2);
});

test('session policy suppresses repeats even after dismissal and installation is idempotent', () => {
	const { alertify, shown, timers, install } = setup({ oncePerSession: true });
	const method = alertify.success;
	install(alertify);
	assert.equal(alertify.success, method);
	const toast = alertify.success('Saved.'); toast.dismiss();
	toast.element.isConnected = false; timers.shift()();
	assert.equal(alertify.success('Saved.'), toast);
	assert.equal(shown.length, 1);
});
