/* @visteras/ui — generated from packages/ui/src/dialog.js by packages/ui/scripts/build-static.mjs — do not edit by hand */
/**
 * @visteras/ui — confirm dialog + Studio's "Unsaved Changes" dialog.
 *
 * Same contract as Studio's alertify.confirm in base-documents.js
 * close_document() and the Inspire/Vector copies it replaces: title
 * "Unsaved Changes", body "Close <b>name</b>? Unsaved changes will be lost.",
 * buttons Cancel / Close, Cancel focused by default. Escape, the × button and
 * a backdrop click cancel; Enter activates the focused button.
 *
 * Styling lives in ui.css and uses only CSS custom properties; the accent
 * button reads each app's --visteras-accent (never a hardcoded colour).
 */
import { escapeHtml } from './escape.js';

export { escapeHtml };

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]      plain text (escaped)
 * @param {string} [opts.messageHtml]  trusted HTML (caller escapes user text)
 * @param {string} [opts.confirmLabel='OK']
 * @param {string} [opts.cancelLabel='Cancel']
 * @param {'cancel'|'confirm'} [opts.defaultFocus='cancel']
 * @param {string} [opts.className]    extra class on the dialog (app hooks/tests)
 * @param {Document} [opts.doc]
 * @returns {Promise<boolean>} true = confirm, false = cancel
 */
export function showConfirmDialog({
  title,
  message = '',
  messageHtml = null,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  defaultFocus = 'cancel',
  className = '',
  doc = (typeof document !== 'undefined' ? document : null),
} = {}) {
  if (!doc || !doc.body) return Promise.resolve(true);
  return new Promise((resolve) => {
    const overlay = doc.createElement('div');
    overlay.className = 'vui-overlay';
    const dialog = doc.createElement('div');
    dialog.className = `vui-dialog${className ? ` ${className}` : ''}`;
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', String(title ?? ''));
    const body = messageHtml != null ? String(messageHtml) : escapeHtml(message);
    dialog.innerHTML = `
      <div class="vui-dialog-header">
        <span class="vui-dialog-title">${escapeHtml(title)}</span>
        <button type="button" class="vui-dialog-close" data-action="cancel" aria-label="${escapeHtml(cancelLabel)}">×</button>
      </div>
      <div class="vui-dialog-body"><p>${body}</p></div>
      <div class="vui-dialog-actions">
        <button type="button" class="vui-btn vui-btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="vui-btn vui-btn-accent" data-action="confirm">${escapeHtml(confirmLabel)}</button>
      </div>`;

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      doc.removeEventListener('keydown', onKey, true);
      overlay.remove();
      dialog.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); finish(false);
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        finish(doc.activeElement?.dataset?.action === 'confirm');
      } else {
        // Keep app shortcuts (Delete, tool keys, ⌘Z…) from acting behind the dialog.
        e.stopPropagation();
      }
    };
    dialog.addEventListener('click', (e) => {
      const action = e.target?.closest?.('[data-action]')?.dataset?.action;
      if (action) finish(action === 'confirm');
    });
    overlay.addEventListener('click', () => finish(false));
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(overlay);
    doc.body.appendChild(dialog);
    const focusSel = defaultFocus === 'confirm' ? '.vui-btn-accent' : '.vui-btn-secondary';
    dialog.querySelector(focusSel)?.focus();
  });
}

/** Studio's Unsaved Changes confirm. Resolves true for Close. */
export function showUnsavedChangesDialog(title, doc = (typeof document !== 'undefined' ? document : null)) {
  return showConfirmDialog({
    title: 'Unsaved Changes',
    messageHtml: `Close <b>${escapeHtml(title || 'Untitled')}</b>? Unsaved changes will be lost.`,
    confirmLabel: 'Close',
    cancelLabel: 'Cancel',
    defaultFocus: 'cancel',
    className: 'vui-unsaved-dialog',
    doc,
  });
}
