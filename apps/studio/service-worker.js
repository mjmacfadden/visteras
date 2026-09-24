var CACHE_NAME = 'visteras-studio-shell-v81';
var CDN_ML_CACHE = 'visteras-studio-cdn-ml-v81';
var APP_SHELL = [
	'./',
	'./index.html',
	'./manifest.json',
	'./dist/bundle.js',
	'./dist/styles.css',
	'./images/favicon.png',
	'./images/visteras_logo.png',
	'./images/omarchy-logo.png',
	'./images/manifest/192x192.png'
];

// Pinned Transformers.js / ONNX Runtime Web CDN (must match config.BG_AUTO_* pins).
// Runtime-cached after first use for offline. Model weights stay in transformers-cache.
function is_ml_runtime_cdn(url) {
	return url.indexOf('https://cdn.jsdelivr.net/npm/@huggingface/transformers@') === 0
		|| url.indexOf('https://cdn.jsdelivr.net/npm/onnxruntime-web@') === 0
		|| url.indexOf('https://cdn.jsdelivr.net/npm/onnxruntime-common') === 0
		|| url.indexOf('https://cdn.jsdelivr.net/npm/onnxruntime-common@') === 0;
}

function is_model_weight_url(url) {
	return /\.onnx$/i.test(url)
		|| url.indexOf('/onnx-community/') !== -1
		|| url.indexOf('/ISNet') !== -1
		|| /\/models\//i.test(url)
		|| url.indexOf('https://huggingface.co/') === 0
		|| url.indexOf('https://cdn-lfs') === 0;
}

function is_dist_script(url) {
	// Async chunks + workers under /dist/ — must not be served cache-first across upgrades.
	return /\/dist\/[^?]+\.js(\?|$)/.test(url);
}

self.addEventListener('install', function (event) {
	event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
		return cache.addAll(APP_SHELL);
	}));
	self.skipWaiting();
});

self.addEventListener('activate', function (event) {
	event.waitUntil(caches.keys().then(function (keys) {
		return Promise.all(keys.filter(function (key) {
			// Never delete Transformers.js model weight cache.
			if (key === 'transformers-cache')
				return false;
			if (key === CACHE_NAME || key === CDN_ML_CACHE)
				return false;
			return key.indexOf('visteras-studio-shell-') === 0
				|| key.indexOf('visteras-studio-cdn-ml-') === 0
				|| key.indexOf('photochop-shell-') === 0;
		}).map(function (key) {
			return caches.delete(key);
		}));
	}).then(function () {
		return self.clients.claim();
	}));
});

self.addEventListener('fetch', function (event) {
	if (event.request.method !== 'GET')
		return;

	var reqUrl = event.request.url;

	// Cross-origin: only intercept pinned ML runtime CDN (not model weights).
	if (reqUrl.indexOf(self.location.origin) !== 0) {
		if (!is_ml_runtime_cdn(reqUrl))
			return;
		event.respondWith(caches.open(CDN_ML_CACHE).then(function (cache) {
			return cache.match(event.request).then(function (cached) {
				if (cached)
					return cached;
				return fetch(event.request).then(function (response) {
					if (response && response.ok) {
						cache.put(event.request, response.clone());
					}
					return response;
				}).catch(function () {
					return cached;
				});
			});
		}));
		return;
	}

	if (is_model_weight_url(reqUrl))
		return;

	// Network-first for /dist/*.js (bundle, hashed chunks, hashed workers).
	// Prevents an old SW entry for 987.js / bg-auto.js from masking a fixed build.
	if (is_dist_script(reqUrl)) {
		event.respondWith(fetch(event.request).then(function (response) {
			if (response && response.ok && response.type === 'basic') {
				var responseToCache = response.clone();
				caches.open(CACHE_NAME).then(function (cache) {
					cache.put(event.request, responseToCache);
				});
			}
			return response;
		}).catch(function () {
			return caches.match(event.request);
		}));
		return;
	}

	// Other same-origin GETs: cache-first with network refresh (app shell).
	event.respondWith(caches.match(event.request).then(function (cached) {
		var refresh = fetch(event.request).then(function (response) {
			if (response.ok && response.type === 'basic') {
				var responseToCache = response.clone();
				caches.open(CACHE_NAME).then(function (cache) {
					cache.put(event.request, responseToCache);
				});
			}
			return response;
		}).catch(function () {
			return cached;
		});
		return cached || refresh;
	}));
});
