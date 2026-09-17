/**
 * Visteras Vector — reference raster and SVG images (place / move / scale only).
 * Embeds PNG/JPEG/WebP/GIF/SVG as SVG <image> data URLs. No pixel editing.
 */
const REF_CLASS = 'visteras-reference';
const LOCK_CLASS = 'visteras-reference-locked';
const ASPECT_ATTR = 'data-visteras-lock-aspect';
const REF_ATTR = 'data-visteras-reference';
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg';

function isRasterFile(file) {
  if (!file) return false;
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  const name = (file.name || '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

function ensureStyles() {
  if (document.getElementById('visteras-reference-styles')) return;
  const style = document.createElement('style');
  style.id = 'visteras-reference-styles';
  style.textContent = `
    svg image.${REF_CLASS} {
      /* visual cue only; opacity is an attribute */
    }
    svg image.${LOCK_CLASS} {
      outline: 1px dashed rgba(250, 124, 27, 0.45);
      outline-offset: 2px;
    }
    #prop_selection_type {
      font-size: 11px;
      font-weight: 600;
      color: #fa7c1b;
      letter-spacing: 0.02em;
      margin: 0 0 8px;
      padding: 4px 0;
    }
    .prop_check_row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: #cccccc;
      margin: 4px 0;
      cursor: pointer;
      user-select: none;
    }
    .prop_check_row input {
      margin: 0;
      accent-color: #fa7c1b;
    }
    #tools_left #tool_image {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      flex-shrink: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

function markAsReference(el, { opacity = 1, sendBack = false } = {}) {
  if (!el || el.nodeName !== 'image') return;
  el.classList.add(REF_CLASS);
  el.setAttribute(REF_ATTR, '1');
  el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  el.setAttribute(ASPECT_ATTR, '1');
  if (opacity != null) el.setAttribute('opacity', String(opacity));
  const w = parseFloat(el.getAttribute('width')) || 0;
  const h = parseFloat(el.getAttribute('height')) || 0;
  if (w > 0 && h > 0) el.setAttribute('data-visteras-aspect', String(w / h));
}

function setLocked(el, locked) {
  if (!el || el.nodeName !== 'image') return;
  if (locked) {
    el.classList.add(LOCK_CLASS);
    el.style.pointerEvents = 'none';
    el.setAttribute('data-visteras-locked', '1');
  } else {
    el.classList.remove(LOCK_CLASS);
    el.style.pointerEvents = '';
    el.removeAttribute('data-visteras-locked');
    // restore opensave default
    const style = el.getAttribute('style') || '';
    if (!/pointer-events/.test(style)) {
      el.setAttribute('style', 'pointer-events:inherit');
    }
  }
}

function isReference(el) {
  return !!(el && el.nodeName === 'image' && (el.classList.contains(REF_CLASS) || el.getAttribute(REF_ATTR) === '1'));
}

function isLocked(el) {
  return !!(el && (el.classList.contains(LOCK_CLASS) || el.getAttribute('data-visteras-locked') === '1'));
}

/**
 * Place an image File or Blob as an embedded SVG <image>.
 * @param {*} svgEditor
 * @param {File|Blob} file
 * @param {{ opacity?: number, sendBack?: boolean }} [opts]
 */
export function placeReferenceImage(svgEditor, file, opts = {}) {
  const sc = svgEditor?.svgCanvas;
  if (!sc || !file) {
    return Promise.reject(new Error('Expected an image file or blob'));
  }
  const opacity = opts.opacity ?? 1;
  const sendBack = opts.sendBack === true;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Invalid image data'));
        return;
      }
      const img = new Image();
      img.addEventListener('load', () => {
        try {
          const imageWidth = img.naturalWidth || img.width || 100;
          const imageHeight = img.naturalHeight || img.height || 100;

          // Compute canvas and viewport placement coordinates
          const contentW = sc.contentW || sc.getResolution?.()?.w || 640;
          const contentH = sc.contentH || sc.getResolution?.()?.h || 480;
          const workarea = svgEditor.workarea || document.getElementById('workarea');
          const zoom = (typeof sc.getZoom === 'function' ? sc.getZoom() : 1) || 1;

          let targetCenterX = contentW / 2;
          let targetCenterY = contentH / 2;
          let maxW = contentW * 0.85;
          let maxH = contentH * 0.85;

          if (workarea && workarea.clientWidth && workarea.clientHeight) {
            const viewW = workarea.clientWidth / zoom;
            const viewH = workarea.clientHeight / zoom;
            const canvasBg = document.getElementById('canvasBackground') || document.getElementById('svgcontent');
            if (canvasBg) {
              const rect = canvasBg.getBoundingClientRect();
              const workRect = workarea.getBoundingClientRect();
              const cx = (workRect.left + workarea.clientWidth / 2 - rect.left) / zoom;
              const cy = (workRect.top + workarea.clientHeight / 2 - rect.top) / zoom;
              if (cx >= 0 && cx <= contentW && cy >= 0 && cy <= contentH) {
                targetCenterX = cx;
                targetCenterY = cy;
              }
            }
            maxW = Math.min(contentW * 0.85, viewW * 0.85);
            maxH = Math.min(contentH * 0.85, viewH * 0.85);
          }

          let scale = 1;
          if (imageWidth > maxW || imageHeight > maxH) {
            scale = Math.min(maxW / imageWidth, maxH / imageHeight);
          }
          const w = Math.max(1, Math.round(imageWidth * scale));
          const h = Math.max(1, Math.round(imageHeight * scale));
          const x = Math.round(targetCenterX - w / 2);
          const y = Math.round(targetCenterY - h / 2);

          const newImage = sc.addSVGElementsFromJson({
            element: 'image',
            attr: {
              x,
              y,
              width: w,
              height: h,
              id: sc.getNextId(),
              style: 'pointer-events:inherit',
              preserveAspectRatio: 'xMidYMid meet',
            },
          });
          sc.setHref(newImage, result);
          markAsReference(newImage, { opacity, sendBack });

          if (typeof sc.setOpacity === 'function') {
            sc.setOpacity(opacity);
          } else {
            newImage.setAttribute('opacity', String(opacity));
          }

          if (sendBack && typeof sc.moveToBottomSelectedElement === 'function') {
            sc.moveToBottomSelectedElement();
          }

          // Record creation in undo history
          if (sc.history?.InsertElementCommand && typeof sc.addCommandToHistory === 'function') {
            try {
              sc.addCommandToHistory(new sc.history.InsertElementCommand(newImage));
            } catch (err) {
              console.warn('Could not add InsertElementCommand to history:', err);
            }
          }

          sc.selectOnly([newImage]);
          if (svgEditor.leftPanel?.clickSelect) {
            svgEditor.leftPanel.clickSelect();
          }
          svgEditor.topPanel?.updateContextPanel?.();
          resolve(newImage);
        } catch (err) {
          reject(err);
        }
      });
      img.addEventListener('error', () => reject(new Error('Could not decode image')));
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export function openFilePicker(svgEditor) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    try {
      await placeReferenceImage(svgEditor, file, { sendBack: false });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not place image');
    }
  });
  input.click();
}

/**
 * Called after opensave (or other) embeds a raster — apply reference defaults.
 */
export function afterPlaceRasterImage(svgEditor, el) {
  if (!el || el.nodeName !== 'image') return;
  markAsReference(el, { opacity: 1, sendBack: false });
  const sc = svgEditor?.svgCanvas;
  if (sc) {
    sc.selectOnly([el]);
    if (typeof sc.setOpacity === 'function') sc.setOpacity(1);
    else el.setAttribute('opacity', '1');
    svgEditor.topPanel?.updateContextPanel?.();
  }
}

function unlockAllReferences(svgEditor) {
  const root = svgEditor?.svgCanvas?.getContentElem?.() || document.getElementById('svgcontent');
  if (!root) return 0;
  let n = 0;
  root.querySelectorAll(`image.${LOCK_CLASS}, image[data-visteras-locked="1"]`).forEach((el) => {
    setLocked(el, false);
    n += 1;
  });
  svgEditor.topPanel?.updateContextPanel?.();
  return n;
}

function wireImageTool(svgEditor) {
  const btn = document.getElementById('tool_image');
  if (!btn || btn.dataset.visterasRefWired) return;
  btn.dataset.visterasRefWired = '1';
  btn.setAttribute('title', 'Place image (⌘⇧P)');
  // se-button may keep i18n label in shadow; also set aria-label
  btn.setAttribute('aria-label', 'Place image');
  try {
    if (btn.shadowRoot) {
      const tip = btn.shadowRoot.querySelector('[title], .title, div');
      if (tip && tip.setAttribute) tip.setAttribute('title', 'Place image (⌘⇧P)');
    }
  } catch (_) { /* ignore */ }

  // Prefer file-picker place over draw-then-URL prompt
  btn.addEventListener(
    'click',
    (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      openFilePicker(svgEditor);
    },
    true,
  );
}

function getActiveImage(svgEditor) {
  const sc = svgEditor?.svgCanvas;
  const sel = (sc && typeof sc.getSelectedElements === 'function')
    ? sc.getSelectedElements().filter(Boolean)
    : [];
  let el = svgEditor?.selectedElement || (sel.length === 1 ? sel[0] : null);
  if (!el && sel.length > 0) el = sel[0];
  if (!el && svgEditor?.selectedElements?.length > 0) el = svgEditor.selectedElements[0];
  if (el && (el.nodeName || el.tagName || '').toLowerCase() === 'image') return el;
  if (el?.querySelector) {
    const child = el.querySelector('image');
    if (child) return child;
  }
  return null;
}

function syncRefControls(svgEditor) {
  const sc = svgEditor.svgCanvas;
  const sel = (sc && typeof sc.getSelectedElements === 'function') ? sc.getSelectedElements().filter(Boolean) : [];
  const el = svgEditor.selectedElement || (sel.length === 1 ? sel[0] : null);
  const typeEl = document.getElementById('prop_selection_type');
  const refGroup = document.getElementById('prop_image_ref_group');
  const refCb = document.getElementById('ref_as_reference');
  const lockCb = document.getElementById('ref_lock');
  const imgEl = getActiveImage(svgEditor);
  const isImg = !!imgEl && (sel.length <= 1);

  if (typeEl) {
    if (isImg) typeEl.textContent = 'Image';
    else if (el) typeEl.textContent = el.nodeName || el.tagName || '';
    else typeEl.textContent = '';
    typeEl.style.display = el ? 'block' : 'none';
  }
  if (refGroup) refGroup.style.display = isImg ? 'block' : 'none';
  if (!isImg || !refCb || !lockCb || !imgEl) return;

  // All Visteras-placed rasters are references; also treat unmarked images as candidates
  refCb.checked = isReference(imgEl);
  lockCb.checked = isLocked(imgEl);
  const dimCb = document.getElementById('ref_dim_50_cb');
  if (dimCb) {
    const op = parseFloat(imgEl.getAttribute('opacity') || '1');
    dimCb.checked = Number.isFinite(op) && op <= 0.55;
  }
}

function wireRefControls(svgEditor) {
  const refCb = document.getElementById('ref_as_reference');
  const lockCb = document.getElementById('ref_lock');
  const dimBtn = document.getElementById('ref_dim_50');

  refCb?.addEventListener('change', () => {
    const el = getActiveImage(svgEditor);
    if (!el) return;
    const sc = svgEditor.svgCanvas;
    if (refCb.checked) {
      // Keep current opacity — Dim to 50% is optional via the button below
      const curOp = el.getAttribute('opacity');
      const opacity = curOp != null && curOp !== '' ? parseFloat(curOp) : 1;
      markAsReference(el, { opacity: Number.isFinite(opacity) ? opacity : 1, sendBack: false });
      sc.selectOnly([el]);
    } else {
      el.classList.remove(REF_CLASS);
      el.removeAttribute(REF_ATTR);
      el.removeAttribute(ASPECT_ATTR);
      // leave opacity / z-order as user set
    }
    svgEditor.topPanel?.updateContextPanel?.();
  });

  lockCb?.addEventListener('change', () => {
    const el = getActiveImage(svgEditor);
    if (!el) return;
    setLocked(el, lockCb.checked);
    svgEditor.topPanel?.updateContextPanel?.();
  });

  function applyDim50(el) {
    const sc = svgEditor.svgCanvas;
    sc.selectOnly([el]);
    if (typeof sc.setOpacity === 'function') sc.setOpacity(0.5);
    else el.setAttribute('opacity', '0.5');
    const opacityInput = document.getElementById('opacity');
    if (opacityInput) opacityInput.value = 50;
    const dimCb = document.getElementById('ref_dim_50_cb');
    if (dimCb) dimCb.checked = true;
    svgEditor.topPanel?.updateContextPanel?.();
  }

  function clearDim(el) {
    const sc = svgEditor.svgCanvas;
    sc.selectOnly([el]);
    if (typeof sc.setOpacity === 'function') sc.setOpacity(1);
    else el.setAttribute('opacity', '1');
    const opacityInput = document.getElementById('opacity');
    if (opacityInput) opacityInput.value = 100;
    svgEditor.topPanel?.updateContextPanel?.();
  }

  dimBtn?.addEventListener('click', () => {
    const el = getActiveImage(svgEditor);
    if (!el) return;
    applyDim50(el);
  });

  const dimCb = document.getElementById('ref_dim_50_cb');
  dimCb?.addEventListener('change', () => {
    const el = getActiveImage(svgEditor);
    if (!el) return;
    if (dimCb.checked) applyDim50(el);
    else clearDim(el);
  });

  document.getElementById('ref_trace_image')?.addEventListener('click', () => {
    if (typeof window.__visterasTraceSelectedImage === 'function') {
      window.__visterasTraceSelectedImage();
    } else {
      alert('Trace Image is not loaded yet.');
    }
  });

  // Aspect-lock: when width/height spin inputs change on a locked-aspect reference
  ['image_width', 'image_height'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.visterasAspectWired) return;
    input.dataset.visterasAspectWired = '1';
    input.addEventListener('change', () => {
      const el = getActiveImage(svgEditor);
      if (!el) return;
      if (el.getAttribute(ASPECT_ATTR) !== '1') return;
      const aspect = parseFloat(el.getAttribute('data-visteras-aspect'));
      if (!aspect || !isFinite(aspect)) return;
      const sc = svgEditor.svgCanvas;
      if (id === 'image_width') {
        const w = parseFloat(el.getAttribute('width')) || 0;
        if (w > 0) {
          const h = w / aspect;
          sc.changeSelectedAttribute('height', h);
          const hInput = document.getElementById('image_height');
          if (hInput) hInput.value = h;
        }
      } else {
        const h = parseFloat(el.getAttribute('height')) || 0;
        if (h > 0) {
          const w = h * aspect;
          sc.changeSelectedAttribute('width', w);
          const wInput = document.getElementById('image_width');
          if (wInput) wInput.value = w;
        }
      }
    });
  });
}

function injectPropChrome() {
  const active = document.getElementById('prop_active_container');
  if (!active || document.getElementById('prop_selection_type')) return;

  const type = document.createElement('div');
  type.id = 'prop_selection_type';
  type.className = 'prop_selection_type';
  type.style.display = 'none';
  active.insertBefore(type, active.firstChild);

  const imgGroup = document.getElementById('prop_image_group');
  const refGroup = document.createElement('div');
  refGroup.className = 'prop_group image_panel';
  refGroup.id = 'prop_image_ref_group';
  refGroup.style.display = 'none';
  refGroup.innerHTML = `
    <label class="prop_check_row" title="Lock aspect ratio (opacity stays at 100% unless you Dim)">
      <input type="checkbox" id="ref_as_reference" />
      <span>Constrain Aspect Ratio</span>
    </label>
    <label class="prop_check_row" title="Ignore pointer hits so you can draw on top">
      <input type="checkbox" id="ref_lock" />
      <span>Lock (don't steal clicks)</span>
    </label>
    <label class="prop_check_row" title="Optional: set opacity to 50% so artwork shows through (off by default — new images place at 100%)">
      <input type="checkbox" id="ref_dim_50_cb" />
      <span>Dim to 50%</span>
    </label>
    <button type="button" id="ref_trace_image" class="prop_pathfinder_btn" style="width:100%;margin-top:4px;height:26px;font-size:11px;" title="Convert flat logo/icon to vector paths (not for photos)">
      Trace to Paths…
    </button>
    <p id="ref_trace_hint" style="font-size:10px;color:#999;margin:6px 0 0;line-height:1.35;">Trace is for flat logos/icons with few colors — not photos.</p>
  `;
  if (imgGroup && imgGroup.parentNode) {
    imgGroup.parentNode.insertBefore(refGroup, imgGroup.nextSibling);
  } else {
    active.appendChild(refGroup);
  }
}

function setupClipboardPaste(svgEditor) {
  window.addEventListener(
    'paste',
    async (e) => {
      const target = e.target;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.nodeName)) return;
      if (target?.isContentEditable) return;
      if (target?.shadowRoot?.activeElement && ['INPUT', 'TEXTAREA'].includes(target.shadowRoot.activeElement.nodeName)) return;
      if (window.__visterasIsTypingDirectly) return;

      const items = e.clipboardData?.items;
      if (!items || !items.length) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const blob = item.getAsFile();
          if (blob) {
            try {
              await placeReferenceImage(svgEditor, blob, { sendBack: false });
            } catch (err) {
              console.error('Failed to paste image:', err);
            }
          }
          return;
        }
      }
    },
    { capture: true }
  );
}

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasReferenceImages({ svgEditor }) {
  if (!svgEditor) return;
  ensureStyles();
  injectPropChrome();
  wireImageTool(svgEditor);
  wireRefControls(svgEditor);
  setupClipboardPaste(svgEditor);

  // Global helper for opening the file picker from menu / shortcuts / left toolbar
  window.__visterasOpenImagePicker = () => openFilePicker(svgEditor);

  // Global hook for opensave drop / import
  window.__visterasAfterPlaceReference = (el) => afterPlaceRasterImage(svgEditor, el);

  // File menu
  document.getElementById('action_place')?.addEventListener('click', () => {
    openFilePicker(svgEditor);
  });
  document.getElementById('action_place_reference')?.addEventListener('click', () => {
    openFilePicker(svgEditor);
  });
  document.getElementById('action_unlock_references')?.addEventListener('click', () => {
    const n = unlockAllReferences(svgEditor);
    if (!n) {
      // still fine — nothing locked
    }
  });

  // Keep props in sync
  const orig = window.__updatePropertiesVisibility;
  window.__updatePropertiesVisibility = function wrapped() {
    if (typeof orig === 'function') orig();
    syncRefControls(svgEditor);
  };
  // Also hook if properties panel already wrapped updateContextPanel
  if (svgEditor.topPanel && typeof svgEditor.topPanel.updateContextPanel === 'function') {
    const prev = svgEditor.topPanel.updateContextPanel.bind(svgEditor.topPanel);
    svgEditor.topPanel.updateContextPanel = function () {
      prev();
      syncRefControls(svgEditor);
    };
  }

  // Re-wire image tool after a tick (extensions may rebuild chrome)
  setTimeout(() => wireImageTool(svgEditor), 0);
  setTimeout(() => wireImageTool(svgEditor), 300);
}

export { isRasterFile, ACCEPT as REFERENCE_ACCEPT };

