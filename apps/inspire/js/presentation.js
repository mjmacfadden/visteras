/** Spatial slides use board coordinates; playback transforms the live DOM, never a screenshot. */
export function fitSlide(slide, width, height, padding = 32) {
  const zoom = Math.max(0.001, Math.min(Math.max(1, width - padding * 2) / slide.width, Math.max(1, height - padding * 2) / slide.height));
  return { zoom, panX: width / 2 - (slide.x + slide.width / 2) * zoom, panY: height / 2 - (slide.y + slide.height / 2) * zoom };
}

export function drawSlide(a, b) {
  const width = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y) * 16 / 9);
  const height = width * 9 / 16;
  return { x: b.x < a.x ? a.x - width : a.x, y: b.y < a.y ? a.y - height : a.y, width, height };
}

export class SpatialPresentation {
  constructor(canvas) {
    this.canvas = canvas;
    this.index = 0;
    this.editing = false;
    this.playing = false;
    if (!document.querySelector('link[href*="presentation.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = new URL('../css/presentation.css', import.meta.url).href;
      document.head.append(css);
    }
    this.button = document.createElement('button');
    this.button.className = 'tool_btn';
    this.button.id = 'tool_slide';
    this.button.dataset.tool = 'slide';
    this.button.title = 'Add Slide';
    this.button.setAttribute('aria-label', 'Add Slide');
    this.button.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 8v8M8 12h8"/></svg>';
    document.getElementById('tool_connector').after(this.button);
    const present = document.createElement('button');
    present.className = 'btn_visteras_secondary'; present.textContent = 'Present';
    present.onclick = () => this.start();
    document.querySelector('.options_actions_right').prepend(present);
    // The inspector mounts this view only while the slide tool is active.
    this.panel = document.createElement('div'); this.panel.className = 'slides-inspector';
    this.overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.overlay.classList.add('slide-map'); canvas.viewport.append(this.overlay);
    canvas.viewport.addEventListener('pointerdown', e => this.down(e), true);
    canvas.viewport.addEventListener('pointermove', e => this.move(e), true);
    canvas.viewport.addEventListener('pointerup', e => this.up(e), true);
    canvas.viewport.addEventListener('pointercancel', e => this.up(e, true), true);
    for (const type of ['wheel', 'dblclick']) canvas.viewport.addEventListener(type, e => {
      if (this.playing) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, { capture: true, passive: false });
    window.addEventListener('keydown', e => {
      if (e.key === 'Shift') this.overlay?.classList.add('shift-draw');
      if (!this.playing) {
        if (e.key === 'Escape' && this.editing) { document.getElementById('tool_select').click(); e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Escape') this.exit();
      if (e.key === 'ArrowRight' || e.code === 'Space') this.go(this.index + 1);
      if (e.key === 'ArrowLeft') this.go(this.index - 1);
    }, true);
    window.addEventListener('keyup', e => {
      if (e.key === 'Shift') this.overlay?.classList.remove('shift-draw');
    }, true);
    document.addEventListener('fullscreenchange', () => {
      if (this.playing) {
        if (this.fullscreen && !document.fullscreenElement) {
          this.exit();
        } else {
          this.go(this.index);
        }
      }
    });
    window.addEventListener('resize', () => {
      if (this.playing) this.go(this.index);
    });
    new ResizeObserver(() => { if (this.playing) this.go(this.index); this.renderMap(); }).observe(canvas.viewport);
    const originalTransform = canvas.updateWorldTransform.bind(canvas);
    canvas.updateWorldTransform = () => { originalTransform(); this.renderMap(); };
    const originalRender = canvas.renderElements.bind(canvas);
    canvas.renderElements = (...args) => { originalRender(...args); clearTimeout(this.previewTimer); this.previewTimer = setTimeout(() => this.refresh(), 150); };
    this.refresh();
  }

  get slides() { return this.canvas.doc?.slides || this.canvas.board?.slides || []; }
  set slides(val) {
    if (this.canvas.doc) this.canvas.doc.slides = val;
    if (this.canvas.board) this.canvas.board.slides = val;
  }
  changed() { this.canvas.onDocChange?.(); this.refresh(); }

  deleteSlide(index) {
    if (index < 0 || index >= this.slides.length) return false;
    this.slides.splice(index, 1);
    if (this.index >= this.slides.length) {
      this.index = Math.max(0, this.slides.length - 1);
    }
    this.canvas.board?.saveHistory('Delete slide frame');
    this.changed();
    return true;
  }

  reorderSlide(fromId, targetId, dropAfter = false) {
    const from = this.slides.findIndex(s => s.id === fromId);
    const targetIndex = this.slides.findIndex(s => s.id === targetId);
    if (from < 0 || targetIndex < 0) return false;

    let targetPos = dropAfter ? targetIndex + 1 : targetIndex;
    if (from === targetPos || (dropAfter && from === targetIndex)) {
      return false;
    }

    const currentActiveId = this.slides[this.index]?.id;
    const [item] = this.slides.splice(from, 1);
    if (from < targetPos) {
      targetPos--;
    }
    this.slides.splice(targetPos, 0, item);
    if (currentActiveId) {
      const newActiveIdx = this.slides.findIndex(s => s.id === currentActiveId);
      if (newActiveIdx >= 0) {
        this.index = newActiveIdx;
      }
    }
    this.canvas.board?.saveHistory('Reorder slides');
    this.changed();
    return true;
  }

  selectSlide(index) {
    if (!this.slides.length) return;
    this.index = Math.max(0, Math.min(index, this.slides.length - 1));
    this.updateActiveCard();
    this.renderMap();
  }

  updateActiveCard() {
    this.panel?.querySelectorAll('.slide-card').forEach((card, idx) => {
      const isActive = (idx === this.index);
      card.classList.toggle('active', isActive);
      card.setAttribute('aria-selected', String(isActive));
    });
  }

  setEditing(value) {
    if (!value) {
      this.overlay?.classList.remove('shift-draw');
    }
    clearTimeout(this.transitionTimer);
    this.canvas.world.style.transition = '';
    if (!value && this.gesture) {
      if (this.gesture.slide) Object.assign(this.gesture.slide, this.gesture.original);
      this.gesture = null;
    }
    this.editing = value;
    this.button.setAttribute('aria-pressed', String(value));
    this.button.classList.toggle('active', value);
    if (value) {
      this.canvas.board.clearSelection?.();
    }
    this.onEditingChange?.(value);
    this.renderMap();
  }

  refresh() {
    this.panel.replaceChildren();
    if (!this.slides.length) {
      const hint = document.createElement('p'); hint.textContent = 'Choose Add Slide, then drag a frame on the board. Slides play from top to bottom.'; this.panel.append(hint);
    }

    this.panel.ondragover = (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };
    this.panel.ondragleave = (e) => {
      if (!this.panel.contains(e.relatedTarget)) {
        this.panel.querySelectorAll('.slide-card').forEach(c => {
          c.classList.remove('drag-over-top', 'drag-over-bottom');
        });
      }
    };
    this.panel.ondrop = (e) => {
      if (e.target === this.panel && this.dragged) {
        e.preventDefault();
        const from = this.slides.findIndex(s => s.id === this.dragged);
        if (from >= 0 && from !== this.slides.length - 1) {
          const [item] = this.slides.splice(from, 1);
          this.slides.push(item);
          this.dragged = null;
          this.canvas.board?.saveHistory('Reorder slides');
          this.changed();
        }
      }
    };

    this.slides.forEach((slide, index) => {
      const card = document.createElement('section');
      card.className = 'slide-card';
      card.draggable = true;
      card.setAttribute('data-slide-id', slide.id);
      card.setAttribute('data-slide-index', String(index));

      const row = document.createElement('div');
      row.className = 'slide-card-row';

      const grip = document.createElement('span');
      grip.className = 'slide-grip';
      grip.textContent = '⠿';
      grip.title = 'Drag to reorder';

      const number = document.createElement('span');
      number.className = 'slide-number';
      number.textContent = `Slide ${index + 1}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'slide-delete-btn';
      remove.textContent = '×';
      remove.title = 'Delete slide';
      remove.onclick = (e) => {
        e.stopPropagation();
        this.deleteSlide(index);
      };

      row.append(grip, number, remove);

      const preview = document.createElement('div');
      preview.className = 'slide-preview';
      preview.setAttribute('role', 'button');
      preview.setAttribute('tabindex', '0');
      preview.setAttribute('aria-label', `Slide ${index + 1}. Double-click to navigate to slide`);
      preview.setAttribute('title', `Slide ${index + 1} (Double-click to navigate)`);
      preview.style.aspectRatio = `${slide.width} / ${slide.height}`;

      const scene = this.canvas.artboard.cloneNode(true);
      scene.removeAttribute('id');
      scene.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      scene.querySelectorAll('input,textarea,[contenteditable]').forEach(n => {
        n.setAttribute('tabindex', '-1');
        n.removeAttribute('contenteditable');
      });
      scene.classList.add('slide-preview-scene');
      preview.append(scene);

      const sizePreview = () => {
        const scale = preview.clientWidth / slide.width;
        scene.style.transform = `scale(${scale}) translate(${-slide.x}px, ${-slide.y}px)`;
      };

      const navigateToSlide = () => {
        this.selectSlide(index);
        if (this.playing) {
          this.go(index);
        } else {
          this.canvas.world.style.transition = '';
          Object.assign(this.canvas, fitSlide(this.slides[this.index], this.canvas.viewport.clientWidth, this.canvas.viewport.clientHeight));
          this.canvas.updateWorldTransform();
        }
      };

      card.onclick = (e) => {
        if (e.target.closest('.slide-delete-btn')) return;
        this.selectSlide(index);
      };

      card.ondblclick = (e) => {
        if (e.target.closest('.slide-delete-btn')) return;
        navigateToSlide();
      };

      preview.onclick = (e) => {
        e.stopPropagation();
        this.selectSlide(index);
      };

      preview.ondblclick = (e) => {
        e.stopPropagation();
        navigateToSlide();
      };

      preview.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateToSlide();
        }
      };

      // HTML5 Drag and Drop for clicking and dragging slides in the panel
      card.ondragstart = (e) => {
        if (e.target.closest('.slide-delete-btn')) {
          e.preventDefault();
          return;
        }
        if (typeof window !== 'undefined') {
          window.getSelection()?.removeAllRanges();
        }
        this.dragged = slide.id;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', slide.id);

          // Render a clean, compact single-slide ghost badge so only the single dragged slide is visual
          if (typeof document !== 'undefined') {
            const ghost = document.createElement('div');
            ghost.className = 'slide-drag-ghost';
            const gripIcon = document.createElement('span');
            gripIcon.style.color = '#ffb347';
            gripIcon.style.fontSize = '14px';
            gripIcon.textContent = '⠿';
            const textSpan = document.createElement('span');
            textSpan.textContent = `Slide ${index + 1}`;
            ghost.append(gripIcon, textSpan);
            document.body.appendChild(ghost);
            if (typeof e.dataTransfer.setDragImage === 'function') {
              e.dataTransfer.setDragImage(ghost, 20, 16);
            }
            setTimeout(() => ghost.remove(), 0);
          }
        }
        setTimeout(() => card.classList.add('is-dragging'), 0);
      };

      card.ondragover = (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (!this.dragged || this.dragged === slide.id) {
          card.classList.remove('drag-over-top', 'drag-over-bottom');
          return;
        }
        // Ensure ONLY this single target card displays the insertion indicator; clear all others
        this.panel.querySelectorAll('.slide-card').forEach(c => {
          if (c !== card) c.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        const rect = card.getBoundingClientRect();
        const dropAfter = e.clientY > (rect.top + rect.height / 2);
        card.classList.toggle('drag-over-bottom', dropAfter);
        card.classList.toggle('drag-over-top', !dropAfter);
      };

      card.ondragleave = (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove('drag-over-top', 'drag-over-bottom');
        }
      };

      card.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.panel.querySelectorAll('.slide-card').forEach(c => {
          c.classList.remove('drag-over-top', 'drag-over-bottom', 'is-dragging');
        });
        if (!this.dragged) return;
        const rect = card.getBoundingClientRect();
        const dropAfter = e.clientY > (rect.top + rect.height / 2);
        this.reorderSlide(this.dragged, slide.id, dropAfter);
        this.dragged = null;
      };

      card.ondragend = () => {
        this.dragged = null;
        this.panel.querySelectorAll('.slide-card').forEach(c => {
          c.classList.remove('is-dragging', 'drag-over-top', 'drag-over-bottom');
        });
      };

      card.append(row, preview);
      this.panel.append(card);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(sizePreview);
      } else {
        sizePreview();
      }
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(sizePreview);
        observer.observe(preview);
        (this.nextObservers ||= []).push(observer);
      }
    });

    this.observers?.forEach(o => o.disconnect());
    this.observers = this.nextObservers || [];
    this.nextObservers = [];
    this.updateActiveCard();
    this.renderMap();
  }

  renderMap() {
    if (!this.overlay) return;
    this.overlay.style.display = this.editing && !this.playing ? 'block' : 'none';
    if (!this.editing || this.playing) return;
    const { zoom, panX, panY } = this.canvas;
    const frames = [...this.slides]; if (this.gesture?.draft) frames.push(this.gesture.draft);
    const rects = frames.map(s => ({ x: s.x * zoom + panX, y: s.y * zoom + panY, w: s.width * zoom, h: s.height * zoom }));
    this.overlay.innerHTML = `<defs><mask id="slide-cutouts"><rect width="100%" height="100%" fill="white"/>${rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="black"/>`).join('')}</mask></defs><rect width="100%" height="100%" fill="#080b12" opacity=".6" mask="url(#slide-cutouts)"/>`;

    // Render inactive slides first, then active/selected slide on top so its handles and click targets are prioritized when overlapping
    const draftIdx = this.gesture?.draft ? this.slides.length : -1;
    const order = rects.map((_, i) => i);
    order.sort((a, b) => {
      if (a === draftIdx) return 1;
      if (b === draftIdx) return -1;
      if (a === this.index) return 1;
      if (b === this.index) return -1;
      return a - b;
    });

    order.forEach(i => {
      const r = rects[i];
      const isSelected = (i === this.index);
      const showHandles = isSelected && !this.gesture?.draft;

      const g = document.createElementNS(this.overlay.namespaceURI, 'g');
      g.setAttribute('data-slide-group', String(i));
      const strokeWidth = isSelected ? 2.5 : 2;
      g.innerHTML = `<rect data-slide="${i}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="transparent" stroke="#ffb347" stroke-width="${strokeWidth}"/><rect x="${r.x}" y="${r.y}" width="28" height="24" fill="#ffb347" pointer-events="none"/><text x="${r.x + 8}" y="${r.y + 17}" fill="#111" font-size="13" font-weight="600" pointer-events="none">${i + 1}</text>`;

      if (showHandles) {
        for (const [handle, x, y] of [['nw',0,0],['n',.5,0],['ne',1,0],['e',1,.5],['se',1,1],['s',.5,1],['sw',0,1],['w',0,.5]]) {
          g.innerHTML += `<rect data-slide="${i}" data-handle="${handle}" x="${r.x + r.w*x-4}" y="${r.y+r.h*y-4}" width="8" height="8" fill="white" stroke="#ffb347" stroke-width="1.5"/>`;
        }
      }
      this.overlay.append(g);
    });
  }

  down(e) {
    if (!this.editing && !this.playing) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (this.playing || e.button !== 0) return;
    clearTimeout(this.transitionTimer); this.canvas.world.style.transition = '';
    const point = this.canvas.screenToCanvas(e.clientX, e.clientY);
    const index = e.target.getAttribute('data-slide');
    // Pressing Shift allows creating a new rectangle on top of an existing one instead of moving it
    const allowCreateOnTop = Boolean(e.shiftKey);
    const handle = !allowCreateOnTop ? e.target.getAttribute('data-handle') : null;

    if (!allowCreateOnTop && index !== null) {
      const clickedIdx = Number(index);
      if (this.index !== clickedIdx && typeof this.selectSlide === 'function') {
        this.selectSlide(clickedIdx);
      }
    }

    const slide = (!allowCreateOnTop && index !== null) ? this.slides[Number(index)] : null;
    this.gesture = { point, slide, original: slide && { ...slide }, handle, draft: slide ? null : { ...point, width: 0, height: 0 } };
    this.canvas.viewport.setPointerCapture(e.pointerId);
  }
  move(e) {
    if (this.playing) { e.stopImmediatePropagation(); return; }
    const g = this.gesture; if (!g) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const p = this.canvas.screenToCanvas(e.clientX, e.clientY), dx = p.x-g.point.x, dy = p.y-g.point.y;
    if (!g.slide) {
      g.draft = drawSlide(g.point, p);
    } else if (!g.handle) {
      Object.assign(g.slide, { x: g.original.x+dx, y: g.original.y+dy });
    } else {
      const o = g.original;
      const aspect = (o.width && o.height) ? (o.width / o.height) : (16 / 9);
      const minW = 16;
      const minH = minW / aspect;
      const h = g.handle;

      let left = o.x;
      let top = o.y;
      let newW = o.width;
      let newH = o.height;

      if (h === 'nw') {
        const wCand = o.width - dx;
        const hCand = o.height - dy;
        if (Math.abs(-dx) >= Math.abs(-dy * aspect)) {
          newW = Math.max(minW, wCand);
          newH = newW / aspect;
        } else {
          newH = Math.max(minH, hCand);
          newW = newH * aspect;
        }
        left = o.x + o.width - newW;
        top = o.y + o.height - newH;
      } else if (h === 'ne') {
        const wCand = o.width + dx;
        const hCand = o.height - dy;
        if (Math.abs(dx) >= Math.abs(-dy * aspect)) {
          newW = Math.max(minW, wCand);
          newH = newW / aspect;
        } else {
          newH = Math.max(minH, hCand);
          newW = newH * aspect;
        }
        left = o.x;
        top = o.y + o.height - newH;
      } else if (h === 'se') {
        const wCand = o.width + dx;
        const hCand = o.height + dy;
        if (Math.abs(dx) >= Math.abs(dy * aspect)) {
          newW = Math.max(minW, wCand);
          newH = newW / aspect;
        } else {
          newH = Math.max(minH, hCand);
          newW = newH * aspect;
        }
        left = o.x;
        top = o.y;
      } else if (h === 'sw') {
        const wCand = o.width - dx;
        const hCand = o.height + dy;
        if (Math.abs(-dx) >= Math.abs(dy * aspect)) {
          newW = Math.max(minW, wCand);
          newH = newW / aspect;
        } else {
          newH = Math.max(minH, hCand);
          newW = newH * aspect;
        }
        left = o.x + o.width - newW;
        top = o.y;
      } else if (h === 'e') {
        newW = Math.max(minW, o.width + dx);
        newH = newW / aspect;
        left = o.x;
        top = o.y + (o.height - newH) / 2;
      } else if (h === 'w') {
        newW = Math.max(minW, o.width - dx);
        newH = newW / aspect;
        left = o.x + o.width - newW;
        top = o.y + (o.height - newH) / 2;
      } else if (h === 's') {
        newH = Math.max(minH, o.height + dy);
        newW = newH * aspect;
        top = o.y;
        left = o.x + (o.width - newW) / 2;
      } else if (h === 'n') {
        newH = Math.max(minH, o.height - dy);
        newW = newH * aspect;
        top = o.y + o.height - newH;
        left = o.x + (o.width - newW) / 2;
      }

      Object.assign(g.slide, { x: left, y: top, width: newW, height: newH });
    }
    this.renderMap();
  }
  up(e, cancel = false) {
    if (this.playing) { e.stopImmediatePropagation(); return; }
    if (!this.gesture) return;
    e.preventDefault(); e.stopImmediatePropagation(); const g=this.gesture; this.gesture=null;
    clearTimeout(this.transitionTimer); this.canvas.world.style.transition = '';
    if (cancel && g.slide) Object.assign(g.slide,g.original);
    let historyLabel = null;
    if (!cancel && g.draft?.width*this.canvas.zoom>8) {
      this.slides.push({ ...g.draft, id: crypto.randomUUID() });
      this.index = this.slides.length - 1;
      historyLabel = 'Add slide frame';
    } else if (!cancel && g.slide && g.original) {
      const moved = (g.slide.x !== g.original.x || g.slide.y !== g.original.y);
      const resized = (g.slide.width !== g.original.width || g.slide.height !== g.original.height);
      if (resized) {
        historyLabel = 'Resize slide frame';
      } else if (moved) {
        historyLabel = 'Move slide frame';
      }
    }
    if (historyLabel) {
      this.canvas.board?.saveHistory(historyLabel);
    }
    if (this.canvas.viewport?.hasPointerCapture?.(e.pointerId)) this.canvas.viewport.releasePointerCapture(e.pointerId);
    this.changed();
  }

  go(index) {
    if (!this.slides.length) return;
    this.index = Math.max(0, Math.min(index, this.slides.length - 1));
    this.updateActiveCard();
    const viewport = this.canvas.viewport;
    const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldAnimate = this.playing && !prefersReduced;
    this.canvas.world.style.transition = shouldAnimate ? 'transform 1.2s cubic-bezier(0.25,1,0.5,1)' : '';
    if (this.canvas.doc?.mode === 'infinite' && this.canvas.viewport?.style) {
      this.canvas.viewport.style.transition = shouldAnimate ? 'background-position 1.2s cubic-bezier(0.25,1,0.5,1), background-size 1.2s cubic-bezier(0.25,1,0.5,1)' : '';
    }
    const winW = typeof window !== 'undefined' ? window.innerWidth : null;
    const winH = typeof window !== 'undefined' ? window.innerHeight : null;
    const width = this.playing ? (winW || viewport.clientWidth) : viewport.clientWidth;
    const height = this.playing ? (winH || viewport.clientHeight) : viewport.clientHeight;
    Object.assign(this.canvas, fitSlide(this.slides[this.index], width, height));
    this.canvas.updateWorldTransform();
    clearTimeout(this.transitionTimer);
    if (shouldAnimate) {
      this.transitionTimer = setTimeout(() => {
        if (this.canvas.world?.style) this.canvas.world.style.transition = '';
        if (this.canvas.viewport?.style) this.canvas.viewport.style.transition = '';
      }, 1250);
    } else {
      if (this.canvas.world?.style) this.canvas.world.style.transition = '';
      if (this.canvas.viewport?.style) this.canvas.viewport.style.transition = '';
    }
  }
  async start() {
    if (this.playing) return;
    if (!this.slides.length) { this.button.click(); return; }
    this.saved = { zoom: this.canvas.zoom, panX: this.canvas.panX, panY: this.canvas.panY };
    this.playing = true;
    this.canvas.viewport.classList.add('spatial-playing');
    try {
      await this.canvas.viewport.requestFullscreen();
      this.fullscreen = document.fullscreenElement === this.canvas.viewport;
    } catch {
      this.fullscreen = false;
    }
    if (!this.playing) return;
    if (typeof requestAnimationFrame !== 'undefined') {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    if (!this.playing) return;
    this.renderMap();
    this.go(this.index);
  }
  exit() {
    if (!this.playing) return;
    this.playing=false; clearTimeout(this.transitionTimer);
    this.overlay?.classList.remove('shift-draw');
    this.canvas.viewport?.classList?.remove('spatial-playing');
    if (this.canvas.world?.style) this.canvas.world.style.transition = '';
    if (this.canvas.viewport?.style) this.canvas.viewport.style.transition = '';
    if (typeof document !== 'undefined' && document.fullscreenElement === this.canvas.viewport) {
      document.exitFullscreen().catch(() => {});
    }
    Object.assign(this.canvas,this.saved); this.canvas.updateWorldTransform(); this.renderMap();
  }
}
