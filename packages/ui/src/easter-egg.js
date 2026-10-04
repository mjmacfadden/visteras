/**
 * Shared Visteras Omarchy Logo Easter Egg
 * Ctrl + Shift + 4 (or Cmd + Shift + 4) toggles the logo easter egg.
 * Does NOT toggle on logo click.
 * Applies a blue accent color filter to the active Omarchy logo.
 */

export function initLogoEasterEgg(options = {}) {
  const {
    selector = '.logo img, a.logo img, .visteras_vector_logo_wrap img, .visteras_collage_logo_wrap img, .visteras_inspire_logo_wrap img, .visteras_publish_logo_wrap img',
    containerSelector = '.logo, a.logo, .visteras_vector_logo_wrap, .visteras_collage_logo_wrap, .visteras_inspire_logo_wrap, .visteras_publish_logo_wrap',
    defaultSrc = null,
    defaultTitle = null,
    omarchySrc = 'images/omarchy-logo.png',
    appName = 'Visteras',
  } = options;

  let logoOmarchy = false;
  try {
    logoOmarchy = localStorage.getItem('photochop_logo') === 'omarchy';
  } catch (e) {
    logoOmarchy = false;
  }

  function applyState() {
    const img = document.querySelector(selector);
    const container = document.querySelector(containerSelector);

    if (!img) return;

    if (!img.dataset.defaultSrc) {
      img.dataset.defaultSrc = defaultSrc || img.getAttribute('src') || '';
    }
    if (container && !container.dataset.defaultTitle) {
      container.dataset.defaultTitle = defaultTitle || container.getAttribute('title') || appName;
    }

    if (logoOmarchy) {
      img.src = omarchySrc;
      img.alt = 'Omarchy';
      img.classList.add('logo-omarchy-active');
      if (container) {
        container.title = 'Omarchy';
        container.classList.add('logo-omarchy-active');
      }
    } else {
      if (img.dataset.defaultSrc) {
        img.src = img.dataset.defaultSrc;
      }
      img.alt = appName;
      img.classList.remove('logo-omarchy-active');
      if (container) {
        container.title = container.dataset.defaultTitle || appName;
        container.classList.remove('logo-omarchy-active');
      }
    }
    img.style.visibility = 'visible';
  }

  function toggle() {
    logoOmarchy = !logoOmarchy;
    try {
      localStorage.setItem('photochop_logo', logoOmarchy ? 'omarchy' : 'vantage');
    } catch (e) {}
    applyState();
  }

  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      return;
    }

    const isCtrlShift4 = (e.ctrlKey || e.metaKey) && e.shiftKey && (
      e.code === 'Digit4' || e.code === 'Numpad4' || e.key === '4' || e.key === '$' || e.keyCode === 52 || e.keyCode === 100
    );

    if (isCtrlShift4) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle();
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyState);
  } else {
    applyState();
  }

  return { toggle, applyState };
}
