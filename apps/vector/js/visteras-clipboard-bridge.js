/**
 * Visteras Vector <-> Studio clipboard bridge.
 *
 * On copy: also write selected elements as image/svg+xml (+ text/plain) to the
 * system clipboard so Studio can paste them as editable vectors.
 * On paste: if the system clipboard has SVG (and SVG-Edit's internal clipboard
 * is empty / not preferred), import via svgCanvas.importSvgString.
 *
 * Does not modify Editor.js — patches svgCanvas after init.
 */

const SVG_MIME = 'image/svg+xml';
const VISTERAS_MIME = 'web application/x-visteras-vector+json';
const CHANNEL = 'visteras-vector-clip';

function looksLikeSvg(text) {
	if (!text || typeof text !== 'string') return false;
	const t = text.trim();
	return t.includes('<svg') || t.includes('<SVG');
}

function extractSvgFromHtml(html) {
	if (!html) return null;
	const m = String(html).match(/<svg[\s\S]*?<\/svg>/i);
	return m ? m[0] : null;
}

function serializeSelectedToSvg(svgCanvas, customSelected = null) {
	if (!svgCanvas) return null;
	const selected = (customSelected || (svgCanvas.getSelectedElements ? svgCanvas.getSelectedElements() : []))
		.filter(Boolean);
	if (!selected.length) return null;

	const serializer = new XMLSerializer();
	const parts = [];
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

	for (const el of selected) {
		try {
			const clone = el.cloneNode(true);
			// Drop SVG-Edit selection helpers if present
			clone.classList && clone.classList.remove('selected');
			if (clone.querySelectorAll) {
				const helpers = clone.querySelectorAll('.selected, .selectorGrip, [id^="selectorGrip_"]');
				for (const h of helpers) h.remove();
			}
			parts.push(serializer.serializeToString(clone));
			if (typeof svgCanvas.getStrokedBBox === 'function') {
				const bb = svgCanvas.getStrokedBBox([el]);
				if (bb) {
					if (bb.x < minX) minX = bb.x;
					if (bb.y < minY) minY = bb.y;
					if (bb.x + bb.width > maxX) maxX = bb.x + bb.width;
					if (bb.y + bb.height > maxY) maxY = bb.y + bb.height;
				}
			} else if (el.getBBox) {
				const bb = el.getBBox();
				if (bb) {
					if (bb.x < minX) minX = bb.x;
					if (bb.y < minY) minY = bb.y;
					if (bb.x + bb.width > maxX) maxX = bb.x + bb.width;
					if (bb.y + bb.height > maxY) maxY = bb.y + bb.height;
				}
			}
		} catch (err) {
			console.warn('serializeSelectedToSvg element failed', err);
		}
	}

	if (!parts.length) return null;
	if (!Number.isFinite(minX)) {
		minX = 0; minY = 0; maxX = 100; maxY = 100;
	}
	const pad = 2;
	const vbX = minX - pad;
	const vbY = minY - pad;
	const vbW = Math.max(1, (maxX - minX) + pad * 2);
	const vbH = Math.max(1, (maxY - minY) + pad * 2);

	return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}" data-visteras-format="1" data-visteras-source="vector">\n${parts.join('\n')}\n</svg>`;
}

async function writeSvgClipboard(svgText) {
	if (!svgText) return false;
	try {
		if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
			const tryWrite = async (items) => {
				await navigator.clipboard.write([new ClipboardItem(items)]);
			};
			try {
				await tryWrite({
					[SVG_MIME]: new Blob([svgText], { type: SVG_MIME }),
					'text/plain': new Blob([svgText], { type: 'text/plain' })
				});
				return true;
			} catch (e) {
				await tryWrite({
					'text/plain': new Blob([svgText], { type: 'text/plain' })
				});
				return true;
			}
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(svgText);
			return true;
		}
	} catch (err) {
		console.warn('Vector clipboard write failed:', err);
	}
	return false;
}

function publishChannel(svgText) {
	try {
		if (typeof BroadcastChannel === 'undefined') return;
		const ch = new BroadcastChannel(CHANNEL);
		ch.postMessage({ type: 'vector-clipboard', svg: svgText, meta: { source: 'vector' }, ts: Date.now() });
		ch.close();
	} catch (e) { /* ignore */ }
}

async function readSvgFromEvent(e) {
	const asSvg = (text) => {
		if (!text) return null;
		const m = String(text).match(/<svg[\s\S]*?<\/svg>/i);
		if (m) return m[0];
		if (looksLikeSvg(text)) return text;
		return null;
	};

	if (e && e.clipboardData) {
		const items = e.clipboardData.items;
		if (items) {
			for (let i = 0; i < items.length; i++) {
				const type = items[i].type || '';
				if (type === SVG_MIME || type === 'text/plain' || type === 'text/html' || type === VISTERAS_MIME) {
					const text = await new Promise((resolve) => {
						try { items[i].getAsString((s) => resolve(s)); }
						catch (err) { resolve(null); }
					});
					const svg = asSvg(text);
					if (svg) return svg;
				}
			}
		}
		const plain = asSvg(e.clipboardData.getData('text/plain'));
		if (plain) return plain;
		const html = asSvg(e.clipboardData.getData('text/html'));
		if (html) return html;
	}

	try {
		if (navigator.clipboard && navigator.clipboard.read) {
			const clipItems = await navigator.clipboard.read();
			for (const item of clipItems) {
				for (const type of (item.types || [])) {
					if (type === SVG_MIME || type === 'text/plain' || type === 'text/html') {
						const blob = await item.getType(type);
						const text = await blob.text();
						const svg = asSvg(text);
						if (svg) return svg;
					}
				}
			}
		} else if (navigator.clipboard && navigator.clipboard.readText) {
			const text = await navigator.clipboard.readText();
			const svg = asSvg(text);
			if (svg) return svg;
		}
	} catch (err) { /* permission */ }
	return null;
}

function hasInternalClipboard(svgCanvas) {
	try {
		const id = typeof svgCanvas.getClipboardID === 'function'
			? svgCanvas.getClipboardID()
			: 'svgedit_clipboard';
		const raw = sessionStorage.getItem(id);
		if (!raw) return false;
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) && parsed.length > 0;
	} catch (e) {
		return false;
	}
}

function importSvg(svgCanvas, svgText) {
	if (!svgCanvas || !svgText) return false;
	try {
		if (typeof svgCanvas.importSvgString === 'function') {
			svgCanvas.importSvgString(svgText);
			return true;
		}
	} catch (err) {
		console.warn('importSvgString failed:', err);
	}
	return false;
}

/**
 * @param {{ svgCanvas?: any, svgEditor?: any }} opts
 */
export function installVisterasClipboardBridge(opts = {}) {
	const svgEditor = opts.svgEditor || window.svgEditor;
	const svgCanvas = opts.svgCanvas || (svgEditor && svgEditor.svgCanvas);
	if (!svgCanvas) {
		console.warn('visteras-clipboard-bridge: svgCanvas not ready');
		return;
	}

	function getSelectedElementsSafe() {
		let selected = (svgCanvas.getSelectedElements ? svgCanvas.getSelectedElements() : [])
			.filter(Boolean);
		if (!selected.length && svgEditor && svgEditor.selectedElement) {
			selected = [svgEditor.selectedElement];
		}
		if (!selected.length && svgCanvas.selectedElements && Array.isArray(svgCanvas.selectedElements)) {
			selected = svgCanvas.selectedElements.filter(Boolean);
		}
		return selected;
	}

	// Synchronous native copy and cut capture on document
	const onCopyOrCut = (e) => {
		const target = e.target;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
			return;
		}

		const selected = getSelectedElementsSafe();
		if (!selected.length) return;

		const svgText = serializeSelectedToSvg(svgCanvas, selected);
		if (!svgText) return;

		publishChannel(svgText);

		if (e.clipboardData) {
			try {
				e.clipboardData.clearData();
				e.clipboardData.setData(SVG_MIME, svgText);
				e.clipboardData.setData('text/plain', svgText);
				e.clipboardData.setData('text/html', svgText);
				e.clipboardData.setData(VISTERAS_MIME, JSON.stringify({ format: 'visteras-vector', version: 1, svg: svgText }));
				e.preventDefault();
			} catch (err) {
				console.warn('e.clipboardData.setData error:', err);
			}
		}

		writeSvgClipboard(svgText);
	};

	document.addEventListener('copy', onCopyOrCut, true);
	document.addEventListener('cut', onCopyOrCut, true);

	// --- Copy: wrap copySelectedElements ---
	const origCopy = svgCanvas.copySelectedElements
		? svgCanvas.copySelectedElements.bind(svgCanvas)
		: null;

	svgCanvas.copySelectedElements = function wrappedCopySelectedElements(...args) {
		const result = origCopy ? origCopy(...args) : undefined;
		try {
			const selected = getSelectedElementsSafe();
			const svgText = serializeSelectedToSvg(svgCanvas, selected);
			if (svgText) {
				publishChannel(svgText);
				writeSvgClipboard(svgText);
			}
		} catch (err) {
			console.warn('visteras copy bridge failed:', err);
		}
		return result;
	};

	// Also wrap cut so cut writes system clipboard too
	if (typeof svgCanvas.cutSelectedElements === 'function') {
		const origCut = svgCanvas.cutSelectedElements.bind(svgCanvas);
		svgCanvas.cutSelectedElements = function (...args) {
			try {
				const selected = getSelectedElementsSafe();
				const svgText = serializeSelectedToSvg(svgCanvas, selected);
				if (svgText) {
					publishChannel(svgText);
					writeSvgClipboard(svgText);
				}
			} catch (err) { /* ignore */ }
			return origCut(...args);
		};
	}

	// --- Paste: intercept paste events ---
	const onPaste = async (e) => {
		const target = e.target;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
			return;
		}

		// Prefer SVG-Edit internal clipboard when it has content (same-app paste)
		if (hasInternalClipboard(svgCanvas)) {
			return;
		}

		const svgText = await readSvgFromEvent(e);
		if (!svgText) return;

		e.preventDefault();
		e.stopPropagation();
		importSvg(svgCanvas, svgText);
	};

	document.addEventListener('paste', onPaste, true);

	// Listen for BroadcastChannel enhancements from Studio
	try {
		if (typeof BroadcastChannel !== 'undefined') {
			const ch = new BroadcastChannel(CHANNEL);
			ch.addEventListener('message', (ev) => {
				// Cache last SVG for optional use; system clipboard remains primary
				if (ev.data && ev.data.svg) {
					window.__visterasLastVectorClip = ev.data.svg;
				}
			});
		}
	} catch (e) { /* ignore */ }

	// Expose for menu paste fallback when internal clipboard empty
	window.__visterasPasteSvgFromSystem = async () => {
		if (hasInternalClipboard(svgCanvas)) return false;
		const svgText = await readSvgFromEvent(null);
		if (!svgText && window.__visterasLastVectorClip) {
			return importSvg(svgCanvas, window.__visterasLastVectorClip);
		}
		if (!svgText) return false;
		return importSvg(svgCanvas, svgText);
	};

	console.info('Visteras Vector clipboard bridge installed');
}

export default installVisterasClipboardBridge;
