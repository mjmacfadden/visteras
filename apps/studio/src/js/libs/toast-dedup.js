const installations = new WeakMap();

/** Install once on the shared notifier so every Studio module deduplicates.
 * Keep the vendor notification objects and dialog APIs intact.
 */
export function install_toast_dedup(alertify, { oncePerSession = false } = {}) {
	if (installations.has(alertify)) return installations.get(alertify);
	const messages = new Map();
	const policy = { oncePerSession };
	installations.set(alertify, policy);
	for (const method of ['notify', 'message', 'success', 'warning', 'error']) {
		const original = alertify[method];
		if (typeof original !== 'function') continue;
		alertify[method] = function (...args) {
			// DOM notifications may be mutable; deduplicate plain message strings.
			if (typeof args[0] !== 'string') return original.apply(this, args);
			const key = args[0].trim().replace(/\s+/g, ' ');
			const waitIndex = method === 'notify' ? 2 : 1;
			const callbackIndex = waitIndex + 1;
			let entry = messages.get(key);
			if (entry && (policy.oncePerSession || entry.active || entry.toast.element?.isConnected)) {
				if (entry.active) {
					if (typeof args[callbackIndex] === 'function') entry.callbacks.add(args[callbackIndex]);
					entry.toast.delay(args[waitIndex]);
				}
				return entry.toast;
			}
			entry = { active: true, callbacks: new Set(), toast: null };
			if (typeof args[callbackIndex] === 'function') entry.callbacks.add(args[callbackIndex]);
			args[callbackIndex] = function (...callbackArgs) {
				entry.active = false;
				// Alertify leaves dismissed elements mounted during their exit animation.
				setTimeout(() => {
					if (!policy.oncePerSession && messages.get(key) === entry) messages.delete(key);
				}, 1100);
				for (const callback of entry.callbacks) callback.apply(this, callbackArgs);
				entry.callbacks.clear();
			};
			entry.toast = original.apply(this, args);
			messages.set(key, entry);
			return entry.toast;
		};
	}
	return policy;
}
