/**
 * Visteras Vector <-> Studio clipboard bridge.
 *
 * On copy: also write selected elements as image/svg+xml (+ text/plain) to the
 * system clipboard so Studio can paste them as editable vectors.
 * On paste: if the system clipboard has SVG (and SVG-Edit's internal clipboard
 * is empty / not preferred), import via svgCanvas.importSvgString.
 *
 * Does not modify Editor.js — patches svgCanvas after init.
 *
 * OS clipboard (Illustrator-style, visteras-clipboard-payload.js): a single
 * raster image is written as image/png at natural resolution; vector / mixed
 * selections as a PNG render + SVG (text/plain, image/svg+xml when
 * ClipboardItem.supports it). The ClipboardItem is created synchronously in the
 * gesture with Promise<Blob> values; on failure the copy event's setData text
 * stays. SVG-Edit's internal clipboard is filled too, so paste back into
 * Vector stays lossless, and Cut deletes the selection as one undo step.
 */

import {
	classifySelection, buildClipboardItems, clipboardSupports, isTextCopyContext,
	referencedDefsMarkup, renderImagePng, renderSvgTextPng,
	selectionVisualBounds, normalizedSvgMarkup,
} from './visteras-clipboard-payload.js?v=clipboard-bridge-3';

const SVG_MIME = 'image/svg+xml';
const VISTERAS_MIME = 'web application/x-visteras-vector+json';
const CLIP_MIME = 'web application/x-visteras-clip+json';
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

export function serializeSelectedToSvg(svgCanvas, customSelected = null) {
	if (!svgCanvas) return null;
	const selected = (customSelected || (svgCanvas.getSelectedElements ? svgCanvas.getSelectedElements() : []))
		.filter(Boolean);
	if (!selected.length) return null;

	const serializer = new XMLSerializer();
	const parts = [];
	const copied = [];

	for (const el of selected) {
		try {
			const clone = el.cloneNode(true);
			// Drop SVG-Edit selection helpers if present
			clone.classList && clone.classList.remove('selected');
			if (clone.querySelectorAll) {
				const helpers = clone.querySelectorAll('.selected, .selectorGrip, [id^="selectorGrip_"]');
				for (const h of helpers) h.remove();
			}

			// Preserve live stroke, stroke-width, and fill attributes on clone
			try {
				const stroke = el.getAttribute('stroke') || el.style.stroke;
				const strokeWidth = el.getAttribute('stroke-width') || el.style.strokeWidth;
				const fill = el.getAttribute('fill') || el.style.fill;
				const comp = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(el) : null;

				if (stroke) {
					clone.setAttribute('stroke', stroke);
				} else if (comp && comp.stroke && comp.stroke !== 'none') {
					clone.setAttribute('stroke', comp.stroke);
				}

				if (strokeWidth) {
					clone.setAttribute('stroke-width', strokeWidth);
				} else if (comp && comp.strokeWidth && parseFloat(comp.strokeWidth) > 0) {
					clone.setAttribute('stroke-width', comp.strokeWidth);
				}

				if (fill) {
					clone.setAttribute('fill', fill);
				} else if (comp && comp.fill) {
					clone.setAttribute('fill', comp.fill);
				}
			} catch (e2) { /* ignore */ }

			parts.push(serializer.serializeToString(clone));
			copied.push(el);
		} catch (err) {
			console.warn('serializeSelectedToSvg element failed', err);
		}
	}

	if (!parts.length) return null;
	// Normalize to the selection's own visual bounds (shadows / glows included):
	// one group translated to 0,0, viewBox 0 0 w h, so the receiving app never
	// inherits the artboard position (Illustrator -> Photoshop behaviour).
	const bounds = selectionVisualBounds(copied, (el) => visualBoundsOf(svgCanvas, el));

	// Clip paths, masks and gradients the selection references travel with it.
	let defs = '';
	try { defs = referencedDefsMarkup(selected); } catch (e) { defs = ''; }
	return normalizedSvgMarkup({ parts, defs, bounds });
}

/** Effect-aware bounds of one element in #svgcontent user units. */
function visualBoundsOf(svgCanvas, el) {
	try {
		const b = window.__visterasEffects?.getVisualBounds?.(el);
		if (b && b.width >= 0) return b;
	} catch (e) { /* fall through */ }
	try { if (typeof svgCanvas.getStrokedBBox === 'function') return svgCanvas.getStrokedBBox([el]); } catch (e) { /* fall through */ }
	try { const b = el.getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; } catch (e) { return null; }
}

/** Web custom format payload: tells Studio the clipboard SVG came from Vector. */
function clipJson(svgText) {
	return JSON.stringify({ format: 'visteras-clip', source: 'vector', svg: svgText });
}

async function writeSvgClipboard(svgText) {
	if (!svgText) return false;
	try {
		if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
			const tryWrite = async (items) => {
				await navigator.clipboard.write([new ClipboardItem(items)]);
			};
			try {
				const items = {
					[SVG_MIME]: new Blob([svgText], { type: SVG_MIME }),
					'text/plain': new Blob([svgText], { type: 'text/plain' })
				};
				if (clipboardSupports()(CLIP_MIME)) items[CLIP_MIME] = new Blob([clipJson(svgText)], { type: CLIP_MIME });
				await tryWrite(items);
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

/**
 * Write the rich payload (PNG + SVG) to the OS clipboard. Must be called
 * synchronously inside the user gesture: the ClipboardItem is built right
 * away with Promise<Blob> values (Safari), rendering resolves afterwards.
 * Never throws; resolves to true when the rich write succeeded.
 */
// What Vector last put on the OS clipboard, so ⌘V can tell its own copy
// (→ lossless internal paste) from content copied in another app since.
let lastOwn = null;

function writeRichClipboard(selected, svgText) {
	const kind = classifySelection(selected);
	const state = { kind, types: [], ok: false, error: null, ts: Date.now() };
	window.__visterasClipboardLast = state;
	const own = { kind, svgText, w: null, h: null };
	lastOwn = own;
	if (kind === 'empty') return Promise.resolve(false);
	const canWrite = typeof ClipboardItem !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function';
	if (!canWrite) { state.error = 'async clipboard unavailable'; return writeSvgClipboard(svgText).then(() => false); }
	let write;
	try {
		const png = () => (kind === 'image' ? renderImagePng(selected[0]) : renderSvgTextPng(svgText)).then((blob) => {
			try { createImageBitmap(blob).then((bmp) => { own.w = bmp.width; own.h = bmp.height; bmp.close?.(); }).catch(() => {}); } catch (e) { /* ignore */ }
			return blob;
		});
		const supports = clipboardSupports();
		const { types, items } = buildClipboardItems({ kind, svgText, png, supports });
		// Vector-origin side channel Chromium never sanitizes (web custom format).
		if (svgText && supports(CLIP_MIME)) {
			items[CLIP_MIME] = Promise.resolve(new Blob([clipJson(svgText)], { type: CLIP_MIME }));
			types.push(CLIP_MIME);
		}
		state.types = types;
		// Keep the promises from surfacing as unhandled when the write is refused.
		for (const v of Object.values(items)) v.catch(() => {});
		write = navigator.clipboard.write([new ClipboardItem(items)]);
	} catch (err) {
		write = Promise.reject(err);
	}
	state.pending = write.then(() => { state.ok = true; return true; }).catch((err) => {
		state.error = String(err && err.message || err);
		console.warn('Vector clipboard (PNG) write failed, keeping text/SVG:', err);
		return svgText ? writeSvgClipboard(svgText).then(() => false) : false;
	});
	return state.pending;
}

// One OS write per gesture even if several paths (copy event, wrapped
// copySelectedElements) run for the same Cmd+C.
let lastRichWrite = 0;
function writeOnce(selected, svgText) {
	const now = Date.now();
	if (now - lastRichWrite < 150) return;
	lastRichWrite = now;
	writeRichClipboard(selected, svgText);
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
		// Inputs, text editing and page text selections keep the native copy.
		if (isTextCopyContext(e)) return;

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
				e.clipboardData.setData(VISTERAS_MIME, JSON.stringify({ format: 'visteras-vector', version: 1, source: 'vector', svg: svgText }));
				e.preventDefault();
			} catch (err) {
				console.warn('e.clipboardData.setData error:', err);
			}
		}

		// Rich OS payload (replaces the text above once rendered; if it fails the
		// text/SVG from setData stays).
		lastRichWrite = 0;
		writeOnce(selected, svgText);
		// Internal SVG-Edit clipboard for lossless paste back into Vector
		// (Editor's own ⌘C/⌘X shortcut is gated on svgEditor.selectedElement,
		// which Vector does not maintain). Cut = copy + delete, one undo step.
		try {
			if (e.type === 'cut' && origCutRaw) origCutRaw();
			else if (origCopy) origCopy();
		} catch (err) { console.warn('Vector internal copy failed:', err); }
	};

	document.addEventListener('copy', onCopyOrCut, true);
	document.addEventListener('cut', onCopyOrCut, true);

	// --- Copy: wrap copySelectedElements ---
	const origCopy = svgCanvas.copySelectedElements
		? svgCanvas.copySelectedElements.bind(svgCanvas)
		: null;
	const origCutRaw = typeof svgCanvas.cutSelectedElements === 'function'
		? svgCanvas.cutSelectedElements.bind(svgCanvas)
		: null;

	svgCanvas.copySelectedElements = function wrappedCopySelectedElements(...args) {
		const result = origCopy ? origCopy(...args) : undefined;
		try {
			const selected = getSelectedElementsSafe();
			const svgText = serializeSelectedToSvg(svgCanvas, selected);
			if (svgText) {
				publishChannel(svgText);
				writeOnce(selected, svgText);
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
					writeOnce(selected, svgText);
				}
			} catch (err) { /* ignore */ }
			return origCut(...args);
		};
	}

	// --- Paste ---
	// ⌘V: SVG-Edit's shortcut would paste the internal clipboard even after
	// the user copied something else in another app. Decide in the paste event
	// instead: Vector's own copy → internal (lossless) paste; anything else →
	// import the SVG / place the image. If a browser sends no paste event,
	// fall back to the internal paste shortly after the key.
	const pasteInternal = () => {
		try {
			if (svgEditor && typeof svgEditor.pasteInCenter === 'function') svgEditor.pasteInCenter();
			else svgCanvas.pasteElements();
		} catch (err) { console.warn('Vector internal paste failed:', err); }
	};
	let pendingPaste = null;
	const cancelPendingPaste = () => { if (pendingPaste) { clearTimeout(pendingPaste); pendingPaste = null; } };
	document.addEventListener('keydown', (e) => {
		const k = String(e.key || '').toLowerCase();
		if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || (k !== 'v' && e.code !== 'KeyV')) return;
		if (isTextCopyContext(e)) return;
		// Block the Editor's immediate internal paste; keep the native paste event.
		e.stopImmediatePropagation();
		cancelPendingPaste();
		pendingPaste = setTimeout(() => { pendingPaste = null; if (hasInternalClipboard(svgCanvas)) pasteInternal(); }, 200);
	}, true);

	/** True when this paste event is Vector's own copy and was handled (internal paste). */
	const takeOwnPaste = (e) => {
		if (!e) return false;
		if (e.__visterasOwnPaste !== undefined) return e.__visterasOwnPaste;
		e.__visterasOwnPaste = false;
		cancelPendingPaste();
		if (isTextCopyContext(e) || !lastOwn || !hasInternalClipboard(svgCanvas) || !e.clipboardData) return false;
		const dt = e.clipboardData;
		let text = '';
		try { text = dt.getData('text/plain') || ''; } catch (err) { text = ''; }
		if (text && lastOwn.svgText && text === lastOwn.svgText) {
			e.preventDefault(); e.stopImmediatePropagation();
			e.__visterasOwnPaste = true;
			pasteInternal();
			return true;
		}
		if (lastOwn.kind === 'image' && !text) {
			let file = null;
			try { const it = [...dt.items].find((i) => i.kind === 'file' && i.type.startsWith('image/')); file = it ? it.getAsFile() : null; } catch (err) { file = null; }
			if (!file) return false;
			// The browser re-encodes clipboard images: compare pixel size.
			e.preventDefault(); e.stopImmediatePropagation();
			e.__visterasOwnPaste = true;
			const own = lastOwn;
			const place = () => window.placeReferenceImage?.(svgEditor, file, { sendBack: false })?.catch?.((err) => console.warn('image paste failed', err));
			createImageBitmap(file).then((bmp) => {
				const mine = own.w != null && bmp.width === own.w && bmp.height === own.h;
				bmp.close?.();
				if (mine) pasteInternal(); else place();
			}).catch(place);
			return true;
		}
		return false;
	};
	// Reference-image paste (window capture) asks first.
	window.__visterasTakeOwnPaste = takeOwnPaste;

	const onPaste = async (e) => {
		if (isTextCopyContext(e)) return;
		if (takeOwnPaste(e)) return;

		const svgText = await readSvgFromEvent(e);
		if (!svgText) {
			// Nothing importable: keep the old behaviour (internal paste if any).
			if (hasInternalClipboard(svgCanvas)) pasteInternal();
			return;
		}

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
