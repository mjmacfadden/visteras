(() => {
  const hero = document.querySelector('.hero');
  const track = hero.querySelector('.slides');
  const viewport = hero.querySelector('.carousel-viewport');
  const slides = [...hero.querySelectorAll('.slide')];
  const buttons = [...hero.querySelectorAll('[data-slide]')];
  const pause = hero.querySelector('.pause');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = [['#32b8ff','#0648a9'],['#ffab40','#74330b'],['#2bd4c5','#075952'],['#b48aff','#47218c'],['#f59e0b','#78350f']];
  let current = 0, paused = motion.matches, timer;
  // Boundary copies let either end wrap by one slide, then reset invisibly.
  for (const [slide, prepend] of [[slides.at(-1), true], [slides[0], false]]) {
    const copy = slide.cloneNode(true);
    copy.inert = true;
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    if (prepend) track.prepend(copy);
    else track.append(copy);
  }
  track.style.gridTemplateColumns = `repeat(${slides.length + 2}, 100%)`;
  let wrapping = false;
  function resetPosition() {
    track.style.transition = 'none';
    track.style.transform = `translateX(-${(current + 1) * 100}%)`;
    void track.offsetWidth;
    track.style.transition = '';
    wrapping = false;
  }
  track.addEventListener('transitionend', event => {
    if (event.target === track && event.propertyName === 'transform' && wrapping) resetPosition();
  });
  resetPosition();
  function alignArrows() {
    const preview = slides[current].querySelector('.visual').getBoundingClientRect();
    const frame = hero.getBoundingClientRect();
    hero.style.setProperty('--preview-center', `${preview.top - frame.top + preview.height / 2}px`);
  }
  const layoutObserver = new ResizeObserver(alignArrows);
  layoutObserver.observe(hero);
  slides.forEach(slide => layoutObserver.observe(slide.querySelector('.visual')));
  function show(index) {
    if (wrapping) resetPosition();
    const previous = current;
    index = (index + slides.length) % slides.length;
    current = index;
    let position = index + 1;
    if (previous === slides.length - 1 && index === 0) position = slides.length + 1;
    else if (previous === 0 && index === slides.length - 1) position = 0;
    wrapping = position !== index + 1;
    track.style.transform = `translateX(-${position * 100}%)`;
    if (motion.matches) resetPosition();
    slides.forEach((slide, i) => { slide.inert = i !== index; slide.setAttribute('aria-hidden', String(i !== index)); });
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    hero.style.setProperty('--accent', colors[index][0]);
    hero.style.setProperty('--glow', colors[index][1]);
    alignArrows();
  }
  function schedule() {
    clearInterval(timer);
    pause.textContent = paused ? '▶' : 'Ⅱ';
    pause.setAttribute('aria-label', paused ? 'Start automatic rotation' : 'Pause automatic rotation');
    if (!paused && !document.hidden && !hero.matches(':hover') && !hero.contains(document.activeElement)) {
      timer = setInterval(() => show((current + 1) % slides.length), 6500);
    }
  }
  buttons.forEach((button, index) => button.addEventListener('click', () => { show(index); schedule(); }));
  hero.querySelector('.previous').addEventListener('click', () => { show(current - 1); schedule(); });
  hero.querySelector('.next').addEventListener('click', () => { show(current + 1); schedule(); });
  hero.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(current + (event.key === 'ArrowRight' ? 1 : -1));
    buttons[current].focus();
    schedule();
  });
  let start = null, suppressClick = false;
  viewport.addEventListener('dragstart', event => event.preventDefault());
  viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    suppressClick = false;
    clearInterval(timer);
  });
  window.addEventListener('pointerup', event => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      suppressClick = true;
      show(current + (dx < 0 ? 1 : -1));
      setTimeout(() => { suppressClick = false; }, 0);
    }
    schedule();
  });
  window.addEventListener('pointercancel', () => { start = null; schedule(); });
  viewport.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  pause.addEventListener('click', () => { paused = !paused; schedule(); });
  hero.addEventListener('mouseenter', () => clearInterval(timer));
  hero.addEventListener('mouseleave', schedule);
  hero.addEventListener('focusin', () => clearInterval(timer));
  hero.addEventListener('focusout', () => setTimeout(schedule, 0));
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', () => { paused = motion.matches; schedule(); });
  show(0);
  schedule();
})();
