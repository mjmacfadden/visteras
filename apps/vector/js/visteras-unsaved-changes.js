/**
 * Visteras Vector — unsaved-changes protection (Studio parity).
 *
 * Documents live only in memory and in the .vvd/.svg files the user saves;
 * nothing is autosaved to browser storage. So:
 *   - leaving/refreshing warns only when at least one tab is dirty;
 *   - closing a dirty tab asks first, with Studio's "Unsaved Changes" dialog
 *     (title, "Close <b>name</b>? Unsaved changes will be lost.", Cancel/Close,
 *     Cancel focused);
 *   - saving a .vvd clears the tab's dirty flag (visteras-document-shell
 *     clearActiveDirty), which also silences the leave warning.
 *
 * SVG-Edit's own beforeunload (undo-stack based) is turned off with
 * no_save_warning: true in index.html: it cannot see the per-tab dirty state
 * and kept warning after a successful save.
 */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function hasAnyDirty(documents) {
  return Array.isArray(documents) && documents.some((d) => !!(d && d.dirty));
}

/** beforeunload handler body: prompts only when a tab has unsaved changes. */
export function handleBeforeUnload(e, documents) {
  if (!hasAnyDirty(documents)) return undefined;
  e.preventDefault();
  e.returnValue = '';
  return '';
}

/**
 * Studio-style Unsaved Changes confirm. Resolves true for Close, false for
 * Cancel / Escape / backdrop click.
 */
export function showUnsavedChangesDialog(title, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || !doc.body) return Promise.resolve(true);
  return new Promise((resolve) => {
    const overlay = doc.createElement('div');
    overlay.className = 'vector_unsaved_overlay';
    const modal = doc.createElement('div');
    modal.className = 'vector_unsaved_dialog';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'vector_unsaved_title');
    modal.innerHTML = `
      <div class="vector_unsaved_header">
        <span class="vector_unsaved_title" id="vector_unsaved_title">Unsaved Changes</span>
        <button type="button" class="vector_unsaved_close_btn" data-action="cancel" aria-label="Cancel">×</button>
      </div>
      <div class="vector_unsaved_body">
        <p>Close <b>${escapeHtml(title || 'Untitled')}</b>? Unsaved changes will be lost.</p>
      </div>
      <div class="vector_unsaved_actions">
        <button type="button" class="vector_unsaved_btn_cancel" data-action="cancel">Cancel</button>
        <button type="button" class="vector_unsaved_btn_close" data-action="close">Close</button>
      </div>`;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      doc.removeEventListener('keydown', onKey, true);
      overlay.remove();
      modal.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); finish(false);
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        finish(doc.activeElement?.dataset?.action === 'close');
      } else {
        // Keep editor shortcuts (Delete, V, ⌘Z…) from acting behind the dialog.
        e.stopPropagation();
      }
    };
    modal.addEventListener('click', (e) => {
      const action = e.target?.closest?.('[data-action]')?.dataset?.action;
      if (action) finish(action === 'close');
    });
    overlay.addEventListener('click', () => finish(false));
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(overlay);
    doc.body.appendChild(modal);
    modal.querySelector('.vector_unsaved_btn_cancel')?.focus();
  });
}

/** True when the tab may close: clean tabs close at once, dirty ones ask first. */
export async function confirmCloseIfDirty(docModel, ask = showUnsavedChangesDialog) {
  if (!docModel || !docModel.dirty) return true;
  return !!(await ask(docModel.title || 'Untitled'));
}
