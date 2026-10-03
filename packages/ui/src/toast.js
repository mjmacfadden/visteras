/**
 * @visteras/ui — toast notifications.
 *
 * Extracted from the identical Vector (index.html showStudioToast) and Inspire
 * (InspireApp.showToast) copies, which mirror Studio's alertify notifier. The
 * markup keeps alertify's class names (#visteras_notifier.alertify-notifier >
 * .ajs-message.ajs-<type>) so every app's existing toast CSS keeps styling it
 * unchanged; colours stay in each app's stylesheet.
 *
 * Types: 'info' | 'success' | 'warning' | 'error'. Click dismisses early.
 */

export const TOAST_TYPES = Object.freeze(['info', 'success', 'warning', 'error']);
const NOTIFIER_ID = 'visteras_notifier';

function getNotifier(doc) {
  let notifier = doc.getElementById(NOTIFIER_ID);
  if (!notifier) {
    notifier = doc.createElement('div');
    notifier.id = NOTIFIER_ID;
    notifier.className = 'alertify-notifier ajs-top ajs-center';
    notifier.setAttribute('role', 'status');
    notifier.setAttribute('aria-live', 'polite');
    doc.body.appendChild(notifier);
  }
  return notifier;
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {number} [duration=3000] ms; 0 keeps it until clicked
 * @param {{ doc?: Document, raf?: Function, setTimer?: Function, clearTimer?: Function }} [env]
 * @returns {HTMLElement|null} the message element (has a `dismiss()` method)
 */
export function showToast(message, type = 'info', duration = 3000, env = {}) {
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.body) return null;
  const raf = env.raf || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0));
  const setTimer = env.setTimer || setTimeout;
  const clearTimer = env.clearTimer || clearTimeout;
  const kind = TOAST_TYPES.includes(type) ? type : 'info';

  const notifier = getNotifier(doc);
  const msgEl = doc.createElement('div');
  msgEl.className = `ajs-message ajs-${kind}`;
  msgEl.textContent = String(message ?? '');
  notifier.appendChild(msgEl);
  raf(() => msgEl.classList.add('ajs-visible'));

  let timer = null;
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (timer) clearTimer(timer);
    msgEl.classList.remove('ajs-visible');
    setTimer(() => msgEl.remove(), 250);
  };
  msgEl.dismiss = dismiss;
  msgEl.addEventListener('click', dismiss);
  if (duration > 0) timer = setTimer(dismiss, duration);
  return msgEl;
}
