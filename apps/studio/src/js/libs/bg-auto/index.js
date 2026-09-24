/**
 * Lazy entry for Studio background-auto (Remove Background / Select Subject).
 * First call dynamic-imports the bg-auto webpack chunk.
 */

var runtimePromise = null;

export function load_bg_auto() {
	if (!runtimePromise) {
		runtimePromise = import(
			/* webpackChunkName: "bg-auto" */
			'./runtime.js'
		);
	}
	return runtimePromise;
}

export async function compute_matte(sourceCanvas, options) {
	var mod = await load_bg_auto();
	return mod.compute_matte(sourceCanvas, options);
}

export async function warm_model(options) {
	var mod = await load_bg_auto();
	return mod.warm_model(options);
}

export async function get_model_location_setting() {
	var mod = await load_bg_auto();
	return mod.get_model_location_setting();
}
