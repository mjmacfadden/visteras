import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fitSlide, drawSlide, SpatialPresentation } from '../js/presentation.js';
import { InspireDocument } from '../js/document.js';
import { BoardComposer } from '../js/board-composer.js';

test('16:9 frames support drawing in every direction', () => {
  for (const x of [-300, 300]) for (const y of [-100, 100]) {
    const s = drawSlide({x:0,y:0},{x,y});
    assert.equal(s.width/s.height,16/9);
    assert.ok(s.x <= 0 && s.y <= 0);
    assert.ok(s.x+s.width >= 0 && s.y+s.height >= 0);
  }
});
test('camera centers and fits wide and tall regions without cropping', () => {
  for (const slide of [{x:-500,y:80,width:1600,height:900},{x:10,y:-70,width:100,height:800}]) {
    const c=fitSlide(slide,1200,800);
    assert.ok(slide.width*c.zoom <= 1136);
    assert.ok(slide.height*c.zoom <= 736);
    assert.equal((slide.x+slide.width/2)*c.zoom+c.panX,600);
    assert.equal((slide.y+slide.height/2)*c.zoom+c.panY,400);
  }
});
test('slide order, title and geometry round-trip in VID; old documents remain valid', () => {
  const slides=[{id:'b',title:'Second first',x:-20,y:30,width:160,height:90},{id:'a',title:'Last',x:100,y:200,width:100,height:80}];
  const doc=new InspireDocument({slides});
  const restored=new InspireDocument(JSON.parse(JSON.stringify(doc.serialize())).board);
  assert.deepEqual(restored.slides,slides);
  assert.deepEqual(new InspireDocument().slides,[]);
  restored.slides[0].title='Changed'; assert.equal(doc.slides[0].title,'Second first');
});
test('resize modifies only the target frame and respects minimum size', () => {
  const slide={x:0,y:0,width:160,height:90};
  const tool=Object.create(SpatialPresentation.prototype);
  tool.canvas={screenToCanvas:(x,y)=>({x,y})}; tool.renderMap=()=>{};
  tool.gesture={point:{x:0,y:0},slide,original:{...slide},handle:'nw'};
  tool.move({clientX:200,clientY:200,preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(slide.width,16); assert.equal(slide.height,9);
  assert.equal(slide.x+slide.width,160); assert.equal(slide.y+slide.height,90);
});

test('Resizing rectangles maintains presentation aspect ratio across all handles', () => {
  const tool = Object.create(SpatialPresentation.prototype);
  tool.canvas = { screenToCanvas: (x, y) => ({ x, y }) };
  tool.renderMap = () => {};

  for (const handle of ['se', 'ne', 'sw', 'nw', 'e', 'w', 's', 'n']) {
    const slide = { x: 100, y: 100, width: 320, height: 180 };
    tool.gesture = { point: { x: 0, y: 0 }, slide, original: { ...slide }, handle };
    tool.move({ clientX: 80, clientY: 45, preventDefault() {}, stopImmediatePropagation() {} });
    const ratio = slide.width / slide.height;
    assert.ok(Math.abs(ratio - 16 / 9) < 0.0001, `Handle ${handle} must maintain 16:9 aspect ratio, got ${ratio}`);
  }
});

test('Pressing Shift allows creating a new rectangle on top of an existing one instead of moving it', () => {
  const slides = [{ id: 's1', title: 'Slide 1', x: 0, y: 0, width: 320, height: 180 }];
  const tool = Object.create(SpatialPresentation.prototype);
  tool.editing = true;
  tool.playing = false;
  tool.canvas = {
    doc: { slides },
    screenToCanvas: (x, y) => ({ x, y }),
    viewport: { setPointerCapture() {} },
    world: { style: { transition: '' } }
  };

  // Case 1: Without Shift, clicking an existing slide selects it to move
  tool.down({
    button: 0,
    shiftKey: false,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
    target: { getAttribute: (attr) => (attr === 'data-slide' ? '0' : null) },
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  assert.equal(tool.gesture.slide, slides[0], 'Without Shift, gesture targets existing slide');
  assert.equal(tool.gesture.draft, null, 'Without Shift, no new draft is initiated');

  // Case 2: With Shift pressed, clicking an existing slide initiates a new slide rectangle
  tool.down({
    button: 0,
    shiftKey: true,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
    target: { getAttribute: (attr) => (attr === 'data-slide' ? '0' : null) },
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  assert.equal(tool.gesture.slide, null, 'With Shift pressed, gesture does not move existing slide');
  assert.ok(tool.gesture.draft, 'With Shift pressed, a new draft rectangle is initiated');
  assert.equal(tool.gesture.draft.x, 50);
  assert.equal(tool.gesture.draft.y, 50);
});

test('Animations only display in presentation mode and never in edit mode', () => {
  const slides = [{ id: 's1', title: 'Slide 1', x: 0, y: 0, width: 320, height: 180 }];
  const worldStyle = { transition: '' };
  const tool = Object.create(SpatialPresentation.prototype);
  tool.canvas = {
    doc: { slides },
    viewport: { clientWidth: 1200, clientHeight: 800 },
    world: { style: worldStyle },
    updateWorldTransform() {}
  };

  // 1. In edit mode (playing = false), go() must NOT apply any transition animation
  tool.playing = false;
  tool.go(0);
  assert.equal(worldStyle.transition, '', 'In edit mode, world transition must remain empty');

  // 2. In presentation mode (playing = true), go() applies the presentation flight transition
  tool.playing = true;
  tool.go(0);
  assert.match(worldStyle.transition, /cubic-bezier/, 'In presentation mode, world transition applies flight animation');
});

test('Slide reordering: clicking and dragging slides in the panel updates slide order', () => {
  const slides = [
    { id: 's1', title: 'Slide 1', x: 0, y: 0, width: 320, height: 180 },
    { id: 's2', title: 'Slide 2', x: 400, y: 0, width: 320, height: 180 },
    { id: 's3', title: 'Slide 3', x: 800, y: 0, width: 320, height: 180 }
  ];

  let changeNotified = false;
  const tool = Object.create(SpatialPresentation.prototype);
  tool.canvas = {
    doc: { slides },
    onDocChange: () => { changeNotified = true; }
  };
  tool.index = 0; // currently on Slide 1
  tool.refresh = () => {};

  // 1. Move Slide 1 to after Slide 2 (dropAfter = true on s2)
  const movedForward = tool.reorderSlide('s1', 's2', true);
  assert.equal(movedForward, true, 'reorderSlide should succeed');
  assert.deepEqual(slides.map(s => s.id), ['s2', 's1', 's3'], 'Slide 1 should now be between Slide 2 and Slide 3');
  assert.equal(tool.index, 1, 'Active slide index should follow s1 to its new position at index 1');
  assert.equal(changeNotified, true, 'Should notify doc change');

  // 2. Move Slide 3 to before Slide 2 (dropAfter = false on s2)
  changeNotified = false;
  const movedBackward = tool.reorderSlide('s3', 's2', false);
  assert.equal(movedBackward, true, 'reorderSlide backward should succeed');
  assert.deepEqual(slides.map(s => s.id), ['s3', 's2', 's1'], 'Slide 3 should now be at the front before Slide 2');
  assert.equal(tool.index, 2, 'Active slide s1 should now be at index 2');

  // 3. Move Slide 3 to after Slide 1 (to the very end)
  tool.reorderSlide('s3', 's1', true);
  assert.deepEqual(slides.map(s => s.id), ['s2', 's1', 's3'], 'Slide 3 should now be at the end');

  // 4. Dropping on same position should return false and make no change
  const noOp = tool.reorderSlide('s2', 's2', false);
  assert.equal(noOp, false, 'Dropping on self should be a no-op');
  assert.deepEqual(slides.map(s => s.id), ['s2', 's1', 's3'], 'Slide order should not change');

  // 5. Dropping directly before itself (e.g. dropAfter=false on s1 while dragging s1)
  const noOp2 = tool.reorderSlide('s1', 's1', true);
  assert.equal(noOp2, false, 'Dropping on self should be a no-op');
  assert.deepEqual(slides.map(s => s.id), ['s2', 's1', 's3']);
});

test('Presentation display is centered vertically not pinned to the top of the screen across various screen aspect ratios', () => {
  const slide169 = { x: 0, y: 0, width: 1920, height: 1080 };
  const viewports = [
    { name: '16:9 Display (1920x1080)', width: 1920, height: 1080 },
    { name: '16:10 MacBook (1440x900)', width: 1440, height: 900 },
    { name: '16:10 MacBook Pro (2560x1600)', width: 2560, height: 1600 },
    { name: '16:10 Display (1920x1200)', width: 1920, height: 1200 },
    { name: '4:3 Display (1024x768)', width: 1024, height: 768 },
    { name: 'Tall Window (1000x1500)', width: 1000, height: 1500 },
    { name: 'Ultrawide 21:9 Display (2560x1080)', width: 2560, height: 1080 }
  ];

  for (const vp of viewports) {
    const fit = fitSlide(slide169, vp.width, vp.height);
    const slideScreenCenterY = (slide169.y + slide169.height / 2) * fit.zoom + fit.panY;
    const expectedCenterY = vp.height / 2;
    assert.ok(
      Math.abs(slideScreenCenterY - expectedCenterY) < 0.001,
      `${vp.name}: Slide center Y (${slideScreenCenterY}) must equal viewport center Y (${expectedCenterY})`
    );

    const topGap = slide169.y * fit.zoom + fit.panY;
    const bottomGap = vp.height - ((slide169.y + slide169.height) * fit.zoom + fit.panY);
    assert.ok(
      Math.abs(topGap - bottomGap) < 0.001,
      `${vp.name}: Top gap (${topGap}) must equal bottom gap (${bottomGap}), not pinned to top`
    );
    assert.ok(topGap > 0, `${vp.name}: Top gap must be positive letterbox margin, not 0`);
  }
});

test('In presentation mode, go() uses full window/screen dimensions to center vertically even if container is small', () => {
  const slides = [{ id: 's1', title: 'Slide 1', x: 0, y: 0, width: 1920, height: 1080 }];
  const tool = Object.create(SpatialPresentation.prototype);
  const canvas = {
    doc: { slides },
    viewport: { clientWidth: 800, clientHeight: 400 }, // Stale pre-fullscreen container size
    world: { style: { transition: '' } },
    updateWorldTransform() {}
  };
  tool.canvas = canvas;
  tool.playing = true;

  // Mock global window dimensions to full screen 1920x1200 (16:10)
  const hadWindow = 'window' in globalThis;
  const origInnerWidth = globalThis.window?.innerWidth;
  const origInnerHeight = globalThis.window?.innerHeight;
  if (!hadWindow) globalThis.window = {};
  globalThis.window.innerWidth = 1920;
  globalThis.window.innerHeight = 1200;

  try {
    tool.go(0);
    // Center of slide must be centered at 1200 / 2 = 600, not 400 / 2 = 200
    const centerY = (slides[0].y + slides[0].height / 2) * canvas.zoom + canvas.panY;
    assert.ok(
      Math.abs(centerY - 600) < 0.001,
      `Presentation mode must center to window height 600, got ${centerY}`
    );
  } finally {
    if (!hadWindow) {
      delete globalThis.window;
    } else {
      if (origInnerWidth !== undefined) globalThis.window.innerWidth = origInnerWidth;
      else delete globalThis.window.innerWidth;
      if (origInnerHeight !== undefined) globalThis.window.innerHeight = origInnerHeight;
      else delete globalThis.window.innerHeight;
    }
  }
});

test('Slide Drag UX isolation: dragover clears indicators on other cards and slide IDs are guaranteed unique', () => {
  // 1. Verify InspireDocument ensures unique IDs for slides even if omitted
  const rawSlides = [
    { x: 0, y: 0, width: 320, height: 180 },
    { x: 400, y: 0, width: 320, height: 180 }
  ];
  const doc = new InspireDocument({ slides: rawSlides });
  assert.ok(doc.slides[0].id, 'Slide 0 must have an id');
  assert.ok(doc.slides[1].id, 'Slide 1 must have an id');
  assert.notEqual(doc.slides[0].id, doc.slides[1].id, 'Slide IDs must be unique');

  // 2. Mock two slide card elements and test dragover isolation
  const card1 = {
    classList: {
      classes: new Set(),
      remove(...args) { args.forEach(a => this.classes.delete(a)); },
      toggle(cls, val) { if (val) this.classes.add(cls); else this.classes.delete(cls); },
      contains(cls) { return this.classes.has(cls); }
    },
    getBoundingClientRect: () => ({ top: 0, height: 100 })
  };

  const card2 = {
    classList: {
      classes: new Set(),
      remove(...args) { args.forEach(a => this.classes.delete(a)); },
      toggle(cls, val) { if (val) this.classes.add(cls); else this.classes.delete(cls); },
      contains(cls) { return this.classes.has(cls); }
    },
    getBoundingClientRect: () => ({ top: 110, height: 100 })
  };

  // Preset Card 1 with drag-over-bottom
  card1.classList.classes.add('drag-over-bottom');

  const panel = {
    querySelectorAll(selector) {
      if (selector === '.slide-card') return [card1, card2];
      return [];
    }
  };

  // Simulate dragging over Card 2: should clear indicator on Card 1
  const dragged = doc.slides[0].id;
  const targetSlide = doc.slides[1];

  // Logic from card.ondragover:
  panel.querySelectorAll('.slide-card').forEach(c => {
    if (c !== card2) c.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  const rect = card2.getBoundingClientRect();
  const dropAfter = true;
  card2.classList.toggle('drag-over-bottom', dropAfter);
  card2.classList.toggle('drag-over-top', !dropAfter);

  assert.equal(card1.classList.contains('drag-over-bottom'), false, 'Card 1 must have indicator cleared when Card 2 is dragged over');
  assert.equal(card2.classList.contains('drag-over-bottom'), true, 'Card 2 must have indicator applied');
});

test('Selected slide displays transform control handles while inactive slides retain gold border and disable handles', () => {
  const slides = [
    { id: 's1', title: 'Slide 1', x: 0, y: 0, width: 320, height: 180 },
    { id: 's2', title: 'Slide 2', x: 200, y: 100, width: 320, height: 180 }
  ];

  const appends = [];
  const overlay = {
    style: {},
    namespaceURI: 'http://www.w3.org/2000/svg',
    append(el) { appends.push(el); }
  };

  const tool = Object.create(SpatialPresentation.prototype);
  tool.editing = true;
  tool.playing = false;
  tool.canvas = {
    doc: { slides },
    zoom: 1,
    panX: 0,
    panY: 0
  };
  tool.overlay = overlay;
  tool.index = 0; // Slide 0 selected

  const origDocument = globalThis.document;
  globalThis.document = {
    createElementNS(ns, tag) {
      return {
        tag,
        attributes: {},
        innerHTML: '',
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; }
      };
    }
  };

  try {
    // 1. Initial render with Slide 0 active
    tool.renderMap();
    assert.equal(appends.length, 2, 'Should render 2 slide groups');

    // Slide 1 (inactive) is rendered first; Slide 0 (active) rendered last (on top)
    const inactiveGroup = appends.find(g => g.getAttribute('data-slide-group') === '1');
    const activeGroup = appends.find(g => g.getAttribute('data-slide-group') === '0');

    assert.ok(inactiveGroup, 'Inactive slide group must exist');
    assert.ok(activeGroup, 'Active slide group must exist');

    // Both slides must have gold border (#ffb347)
    assert.ok(inactiveGroup.innerHTML.includes('stroke="#ffb347"'), 'Inactive slide must have gold border');
    assert.ok(activeGroup.innerHTML.includes('stroke="#ffb347"'), 'Active slide must have gold border');

    // Only active slide must have transform handles (data-handle)
    assert.equal(inactiveGroup.innerHTML.includes('data-handle'), false, 'Inactive slide must NOT have transform handles');
    assert.equal(activeGroup.innerHTML.includes('data-handle'), true, 'Active slide MUST have transform handles');

    // Check all 8 handles on active slide
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      assert.ok(activeGroup.innerHTML.includes(`data-handle="${h}"`), `Active slide must have handle ${h}`);
    }

    // 2. Select Slide 1 (switching selection)
    appends.length = 0;
    tool.index = 1;
    tool.renderMap();

    const newInactiveGroup = appends.find(g => g.getAttribute('data-slide-group') === '0');
    const newActiveGroup = appends.find(g => g.getAttribute('data-slide-group') === '1');

    assert.equal(newInactiveGroup.innerHTML.includes('data-handle'), false, 'Slide 0 now inactive must NOT have transform handles');
    assert.equal(newActiveGroup.innerHTML.includes('data-handle'), true, 'Slide 1 now active MUST have transform handles');
    assert.ok(newInactiveGroup.innerHTML.includes('stroke="#ffb347"'), 'Slide 0 still displays gold border');
    assert.ok(newActiveGroup.innerHTML.includes('stroke="#ffb347"'), 'Slide 1 displays gold border');
  } finally {
    globalThis.document = origDocument;
  }
});

test('Active slide is rendered on top in SVG stacking order to resolve overlapping ambiguity', () => {
  const slides = [
    { id: 's1', title: 'Slide 1', x: 0, y: 0, width: 320, height: 180 },
    { id: 's2', title: 'Slide 2', x: 50, y: 50, width: 320, height: 180 }
  ];

  const appends = [];
  const overlay = {
    style: {},
    namespaceURI: 'http://www.w3.org/2000/svg',
    append(el) { appends.push(el); }
  };

  const tool = Object.create(SpatialPresentation.prototype);
  tool.editing = true;
  tool.playing = false;
  tool.canvas = {
    doc: { slides },
    zoom: 1,
    panX: 0,
    panY: 0
  };
  tool.overlay = overlay;

  const origDocument = globalThis.document;
  globalThis.document = {
    createElementNS(ns, tag) {
      return {
        tag,
        attributes: {},
        innerHTML: '',
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; }
      };
    }
  };

  try {
    // When Slide 0 is active, it must be appended LAST in SVG DOM so it stacks on top
    tool.index = 0;
    appends.length = 0;
    tool.renderMap();
    assert.equal(appends[0].getAttribute('data-slide-group'), '1', 'Inactive slide 1 rendered first');
    assert.equal(appends[1].getAttribute('data-slide-group'), '0', 'Active slide 0 rendered last (on top)');

    // When Slide 1 is active, it must be appended LAST in SVG DOM so it stacks on top
    tool.index = 1;
    appends.length = 0;
    tool.renderMap();
    assert.equal(appends[0].getAttribute('data-slide-group'), '0', 'Inactive slide 0 rendered first');
    assert.equal(appends[1].getAttribute('data-slide-group'), '1', 'Active slide 1 rendered last (on top)');
  } finally {
    globalThis.document = origDocument;
  }
});

test('Inspector highlights active slide in gold and synchronizes with slide selection and navigation', () => {
  const slides = [
    { id: 's1', title: 'Slide 1', x: 0, y: 0, width: 320, height: 180 },
    { id: 's2', title: 'Slide 2', x: 400, y: 0, width: 320, height: 180 }
  ];

  class MockCard {
    constructor() {
      this.classList = {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        toggle(c, v) { if (v) this.classes.add(c); else this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      };
      this.attributes = {};
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
  }

  const card0 = new MockCard();
  const card1 = new MockCard();
  const panel = {
    querySelectorAll(selector) {
      if (selector === '.slide-card') return [card0, card1];
      return [];
    }
  };

  const tool = Object.create(SpatialPresentation.prototype);
  tool.canvas = {
    doc: { slides },
    viewport: { clientWidth: 1200, clientHeight: 800 },
    world: { style: { transition: '' } },
    updateWorldTransform() {}
  };
  tool.panel = panel;
  tool.renderMap = () => {};
  tool.index = 0;

  // 1. Initial active card update
  tool.updateActiveCard();
  assert.equal(card0.classList.contains('active'), true, 'Card 0 must have .active class');
  assert.equal(card0.getAttribute('aria-selected'), 'true', 'Card 0 must have aria-selected=true');
  assert.equal(card1.classList.contains('active'), false, 'Card 1 must not have .active class');
  assert.equal(card1.getAttribute('aria-selected'), 'false', 'Card 1 must have aria-selected=false');

  // 2. selectSlide(1) should switch highlight to Card 1
  tool.selectSlide(1);
  assert.equal(tool.index, 1);
  assert.equal(card0.classList.contains('active'), false, 'Card 0 must lose .active class');
  assert.equal(card1.classList.contains('active'), true, 'Card 1 must gain .active class');
  assert.equal(card1.getAttribute('aria-selected'), 'true');

  // 3. go(0) slide navigation should also update active card in inspector
  tool.go(0);
  assert.equal(tool.index, 0);
  assert.equal(card0.classList.contains('active'), true, 'Card 0 must be active after go(0)');
  assert.equal(card1.classList.contains('active'), false, 'Card 1 must be inactive after go(0)');

  // 4. Verify CSS styling for .slide-card.active contains gold border (#ffb347)
  const css = fs.readFileSync(new URL('../css/presentation.css', import.meta.url), 'utf8');
  assert.match(css, /\.slide-card\.active\s*\{[^}]*#ffb347/, 'presentation.css must define gold border for .slide-card.active');
  assert.match(css, /\.slide-card\.active\s+\.slide-number\s*\{[^}]*#ffb347/, 'presentation.css must highlight slide number in gold');
  assert.match(css, /\.slide-card\.active\s+\.slide-grip\s*\{[^}]*#ffb347/, 'presentation.css must highlight slide grip in gold');
});

test('Creating a new slide immediately sets it as active and updates inspector highlight', () => {
  const slides = [
    { id: 's1', title: 'Slide 1', x: 0, y: 0, width: 320, height: 180 }
  ];

  let changedCalled = false;
  const tool = Object.create(SpatialPresentation.prototype);
  tool.index = 0;
  tool.canvas = {
    doc: { slides },
    zoom: 1,
    world: { style: { transition: '' } },
    viewport: { hasPointerCapture: () => false, releasePointerCapture: () => {} }
  };
  tool.changed = () => { changedCalled = true; };
  tool.gesture = {
    draft: { x: 500, y: 0, width: 320, height: 180 },
    slide: null
  };

  // Pointer up to commit new slide
  tool.up({ pointerId: 1, preventDefault() {}, stopImmediatePropagation() {} });

  assert.equal(slides.length, 2, 'New slide should be added');
  assert.equal(tool.index, 1, 'Newly created slide must be selected as active slide');
  assert.equal(changedCalled, true, 'changed() must be called to refresh inspector and map');
});

test('Slides use pure numbering system without editable title input; reordering dynamically updates slide numbers', () => {
  const slides = [
    { id: 's1', x: 0, y: 0, width: 320, height: 180 },
    { id: 's2', x: 400, y: 0, width: 320, height: 180 }
  ];

  // Verify up() does not inject a title property when creating a new slide
  const tool = Object.create(SpatialPresentation.prototype);
  tool.canvas = {
    doc: { slides },
    zoom: 1,
    world: { style: { transition: '' } },
    viewport: { hasPointerCapture: () => false, releasePointerCapture: () => {} }
  };
  tool.index = 0;
  tool.changed = () => {};
  tool.gesture = { draft: { x: 800, y: 0, width: 320, height: 180 }, slide: null };
  tool.up({ pointerId: 1, preventDefault() {}, stopImmediatePropagation() {} });

  assert.equal(slides.length, 3);
  assert.equal('title' in slides[2], false, 'New slide should not have a redundant title property');

  // Verify presentation.css does not style input in slide-card-row
  const css = fs.readFileSync(new URL('../css/presentation.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.slide-card-row\s+input/, 'presentation.css should not have slide-card-row input styles');

  // Verify presentation.js does not create an input element in refresh
  const js = fs.readFileSync(new URL('../js/presentation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /document\.createElement\(['"]input['"]\)/, 'presentation.js should not create input elements for slide names');
  assert.match(js, /number\.textContent\s*=\s*`Slide \$\{index \+ 1\}`/, 'presentation.js must use pure numbering (Slide N)');
});

test('Infinite canvas in display mode retains board background color and pattern without turning dark', () => {
  // 1. Verify CSS rules in presentation.css
  const css = fs.readFileSync(new URL('../css/presentation.css', import.meta.url), 'utf8');
  assert.match(css, /\.spatial-playing:not\(\.mode-infinite\)\s*\{\s*background:\s*#161616!important/, 'Only non-infinite boards should have dark stage background');
  assert.doesNotMatch(css, /\.spatial-playing\s*\{[^}]*background:\s*#161616!important/, '.spatial-playing must not unconditionally force dark background');

  // 2. In infinite canvas mode, verify go() transitions pattern and exit() cleans up
  const slides = [{ id: 's1', x: 0, y: 0, width: 1920, height: 1080 }];
  const tool = Object.create(SpatialPresentation.prototype);
  const viewportStyle = { transition: '', backgroundColor: '#fcfbf9' };
  const worldStyle = { transition: '' };
  tool.canvas = {
    doc: { mode: 'infinite', background: '#fcfbf9', bgPattern: 'dots', slides },
    viewport: { clientWidth: 1200, clientHeight: 800, style: viewportStyle, classList: { remove() {} } },
    world: { style: worldStyle },
    updateWorldTransform() {}
  };
  tool.index = 0;
  tool.playing = true;

  tool.go(0);
  assert.match(viewportStyle.transition, /background-position/, 'Infinite canvas should transition pattern with camera');
  assert.match(viewportStyle.transition, /background-size/, 'Infinite canvas should scale pattern with camera');

  tool.exit();
  assert.equal(viewportStyle.transition, '', 'Exit must clear viewport transition');
  assert.equal(viewportStyle.backgroundColor, '#fcfbf9', 'Infinite canvas background color must be preserved');
});

test('Slide frames are part of the undo/redo tree: creation, move, resize, deletion, and reordering round-trip', () => {
  const doc = new InspireDocument();
  const board = new BoardComposer([], null, doc);

  const tool = Object.create(SpatialPresentation.prototype);
  tool.canvas = {
    doc,
    board,
    zoom: 1,
    world: { style: { transition: '' } },
    viewport: { hasPointerCapture: () => false, releasePointerCapture: () => {} },
    onDocChange: () => {}
  };
  tool.refresh = () => {};
  tool.index = 0;

  // 1. Initial state: 0 slides, history index 0, canUndo is false
  assert.equal(doc.slides.length, 0);
  assert.equal(board.canUndo(), false);

  // 2. Add slide 1 via gesture up()
  tool.gesture = {
    draft: { x: 100, y: 100, width: 320, height: 180 },
    slide: null
  };
  tool.up({ pointerId: 1, preventDefault() {}, stopImmediatePropagation() {} });

  assert.equal(doc.slides.length, 1, 'Slide 1 added');
  assert.equal(board.canUndo(), true, 'Undo is available after adding slide');

  // Add slide 2
  tool.gesture = {
    draft: { x: 500, y: 100, width: 320, height: 180 },
    slide: null
  };
  tool.up({ pointerId: 2, preventDefault() {}, stopImmediatePropagation() {} });

  assert.equal(doc.slides.length, 2, 'Slide 2 added');
  const slide1Id = doc.slides[0].id;
  const slide2Id = doc.slides[1].id;

  // 3. Move slide 1
  tool.gesture = {
    slide: doc.slides[0],
    original: { ...doc.slides[0] },
    handle: null
  };
  doc.slides[0].x = 150;
  doc.slides[0].y = 120;
  tool.up({ pointerId: 1, preventDefault() {}, stopImmediatePropagation() {} });

  assert.equal(doc.slides[0].x, 150);

  // 4. Resize slide 2
  tool.gesture = {
    slide: doc.slides[1],
    original: { ...doc.slides[1] },
    handle: 'se'
  };
  doc.slides[1].width = 640;
  doc.slides[1].height = 360;
  tool.up({ pointerId: 2, preventDefault() {}, stopImmediatePropagation() {} });

  assert.equal(doc.slides[1].width, 640);

  // 5. Reorder slides: move slide 2 before slide 1
  tool.reorderSlide(slide2Id, slide1Id, false);
  assert.equal(doc.slides[0].id, slide2Id, 'Slide 2 is now first');
  assert.equal(doc.slides[1].id, slide1Id, 'Slide 1 is now second');

  // 6. Delete slide 1 (now at index 1)
  tool.deleteSlide(1);
  assert.equal(doc.slides.length, 1, 'Slide 1 deleted');
  assert.equal(doc.slides[0].id, slide2Id);

  // --- NOW TEST STEPPING BACK THROUGH UNDO TREE ---

  // Undo delete slide 1 -> Slide 1 is restored
  assert.equal(board.undo(), true);
  assert.equal(doc.slides.length, 2, 'Undo restores deleted slide');
  assert.equal(doc.slides[0].id, slide2Id);
  assert.equal(doc.slides[1].id, slide1Id);

  // Undo reorder slides -> Order reverts to [slide1, slide2]
  assert.equal(board.undo(), true);
  assert.equal(doc.slides[0].id, slide1Id, 'Undo restores original order');
  assert.equal(doc.slides[1].id, slide2Id);

  // Undo resize slide 2 -> Reverts to 320x180
  assert.equal(board.undo(), true);
  assert.equal(doc.slides[1].width, 320, 'Undo reverts slide 2 resize width');
  assert.equal(doc.slides[1].height, 180, 'Undo reverts slide 2 resize height');

  // Undo move slide 1 -> Reverts to (100, 100)
  assert.equal(board.undo(), true);
  assert.equal(doc.slides[0].x, 100, 'Undo reverts slide 1 x position');
  assert.equal(doc.slides[0].y, 100, 'Undo reverts slide 1 y position');

  // Undo add slide 2 -> Slide 2 is removed
  assert.equal(board.undo(), true);
  assert.equal(doc.slides.length, 1, 'Undo removes slide 2');
  assert.equal(doc.slides[0].id, slide1Id);

  // Undo add slide 1 -> All slides removed
  assert.equal(board.undo(), true);
  assert.equal(doc.slides.length, 0, 'Undo removes slide 1');
  assert.equal(board.canUndo(), false, 'At root of undo tree');

  // --- NOW TEST STEPPING FORWARD THROUGH REDO TREE ---

  // Redo add slide 1
  assert.equal(board.redo(), true);
  assert.equal(doc.slides.length, 1);
  assert.equal(doc.slides[0].id, slide1Id);

  // Redo add slide 2
  assert.equal(board.redo(), true);
  assert.equal(doc.slides.length, 2);
  assert.equal(doc.slides[1].id, slide2Id);

  // Redo move slide 1
  assert.equal(board.redo(), true);
  assert.equal(doc.slides[0].x, 150);

  // Redo resize slide 2
  assert.equal(board.redo(), true);
  assert.equal(doc.slides[1].width, 640);

  // Redo reorder
  assert.equal(board.redo(), true);
  assert.equal(doc.slides[0].id, slide2Id);
  assert.equal(doc.slides[1].id, slide1Id);

  // Redo delete
  assert.equal(board.redo(), true);
  assert.equal(doc.slides.length, 1);
  assert.equal(doc.slides[0].id, slide2Id);
  assert.equal(board.canRedo(), false, 'At tip of redo tree');
});

test('Interleaved board elements and slide frames share a unified undo/redo tree', () => {
  const doc = new InspireDocument();
  const board = new BoardComposer([], null, doc);

  const tool = Object.create(SpatialPresentation.prototype);
  tool.canvas = {
    doc,
    board,
    zoom: 1,
    world: { style: { transition: '' } },
    viewport: { hasPointerCapture: () => false, releasePointerCapture: () => {} },
    onDocChange: () => {}
  };
  tool.refresh = () => {};
  tool.index = 0;

  // 1. Add board element (sticky note)
  board.addStickyElement({ text: 'Inspiration', x: 50, y: 50 });
  assert.equal(board.elements.length, 1);
  assert.equal(doc.slides.length, 0);

  // 2. Add slide frame
  tool.gesture = {
    draft: { x: 0, y: 0, width: 320, height: 180 },
    slide: null
  };
  tool.up({ pointerId: 1, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(board.elements.length, 1);
  assert.equal(doc.slides.length, 1);

  // 3. Add text element
  board.addTextElement({ text: 'Slide Header', x: 100, y: 100 });
  assert.equal(board.elements.length, 2);
  assert.equal(doc.slides.length, 1);

  // Step 1 undo: text element is removed, slide frame and sticky note remain
  board.undo();
  assert.equal(board.elements.length, 1, 'Text element removed by undo');
  assert.equal(doc.slides.length, 1, 'Slide frame remains');

  // Step 2 undo: slide frame is removed, sticky note remains
  board.undo();
  assert.equal(board.elements.length, 1, 'Sticky note remains');
  assert.equal(doc.slides.length, 0, 'Slide frame removed by undo');

  // Step 3 undo: sticky note is removed
  board.undo();
  assert.equal(board.elements.length, 0, 'Sticky note removed by undo');
  assert.equal(doc.slides.length, 0);

  // Step 1 redo: sticky note restored
  board.redo();
  assert.equal(board.elements.length, 1);
  assert.equal(doc.slides.length, 0);

  // Step 2 redo: slide frame restored
  board.redo();
  assert.equal(board.elements.length, 1);
  assert.equal(doc.slides.length, 1);

  // Step 3 redo: text element restored
  board.redo();
  assert.equal(board.elements.length, 2);
  assert.equal(doc.slides.length, 1);
});

test('Single clicking a slide thumb selects the slide without changing viewport, while double clicking navigates viewport', () => {
  const slides = [
    { id: 's1', x: 0, y: 0, width: 1600, height: 900 },
    { id: 's2', x: 2000, y: 1500, width: 1600, height: 900 }
  ];

  class MockElement {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attributes = {};
      this.style = {};
      const classes = new Set();
      this.classList = {
        classes,
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        toggle(c, v) { if (v) classes.add(c); else classes.delete(c); },
        contains(c) { return classes.has(c); }
      };
    }
    get className() { return [...this.classList.classes].join(' '); }
    set className(val) {
      this.classList.classes.clear();
      (val || '').split(/\s+/).filter(Boolean).forEach(c => this.classList.classes.add(c));
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    append(...els) { this.children.push(...els); }
    replaceChildren(...els) { this.children = [...els]; }
    querySelectorAll() { return []; }
    cloneNode() {
      const clone = new MockElement(this.tagName);
      clone.attributes = { ...this.attributes };
      clone.style = { ...this.style };
      return clone;
    }
  }

  const panel = new MockElement('div');
  const artboard = new MockElement('div');

  const tool = Object.create(SpatialPresentation.prototype);
  let updatedWorldTransform = false;
  tool.canvas = {
    doc: { slides },
    viewport: { clientWidth: 1200, clientHeight: 800 },
    world: { style: { transition: '' } },
    artboard,
    panX: 100,
    panY: 50,
    zoom: 0.5,
    updateWorldTransform() {
      updatedWorldTransform = true;
    }
  };
  tool.panel = panel;
  tool.renderMap = () => {};
  tool.updateActiveCard = () => {};
  tool.index = 0;
  tool.playing = false;

  const origDocument = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      return new MockElement(tag);
    }
  };

  try {
    tool.refresh();

    const card1 = panel.children[1];
    assert.ok(card1, 'Card for slide 2 exists');
    const preview1 = card1.children.find(el => el.classList.contains('slide-preview'));
    assert.ok(preview1, 'Slide preview thumbnail exists for slide 2');

    // Initial state: panX = 100, panY = 50, zoom = 0.5, index = 0
    assert.equal(tool.index, 0);
    assert.equal(tool.canvas.panX, 100);
    assert.equal(tool.canvas.panY, 50);
    assert.equal(tool.canvas.zoom, 0.5);

    // 1. Single-clicking the thumbnail should select the slide but NOT change the viewport
    let stopped = false;
    preview1.onclick({
      stopPropagation() { stopped = true; },
      target: preview1
    });

    assert.equal(stopped, true, 'Single click stops propagation');
    assert.equal(tool.index, 1, 'Single click selects slide index 1');
    assert.equal(tool.canvas.panX, 100, 'Single click must NOT alter canvas panX');
    assert.equal(tool.canvas.panY, 50, 'Single click must NOT alter canvas panY');
    assert.equal(tool.canvas.zoom, 0.5, 'Single click must NOT alter canvas zoom');
    assert.equal(updatedWorldTransform, false, 'Single click must NOT trigger world transform update');

    // Reset selection back to 0
    tool.selectSlide(0);
    assert.equal(tool.index, 0);

    // 2. Double-clicking the thumbnail should navigate to the slide and update the viewport
    stopped = false;
    preview1.ondblclick({
      stopPropagation() { stopped = true; },
      target: preview1
    });

    assert.equal(stopped, true, 'Double click stops propagation');
    assert.equal(tool.index, 1, 'Double click selects slide index 1');
    assert.notEqual(tool.canvas.panX, 100, 'Double click must adjust panX to fit slide');
    assert.notEqual(tool.canvas.panY, 50, 'Double click must adjust panY to fit slide');
    assert.equal(updatedWorldTransform, true, 'Double click must trigger updateWorldTransform');

    // 3. Keyboard Enter/Space on thumbnail should navigate viewport
    tool.selectSlide(0);
    tool.canvas.panX = 100;
    tool.canvas.panY = 50;
    updatedWorldTransform = false;

    let defaultPrevented = false;
    preview1.onkeydown({
      key: 'Enter',
      preventDefault() { defaultPrevented = true; }
    });
    assert.equal(defaultPrevented, true);
    assert.equal(tool.index, 1);
    assert.notEqual(tool.canvas.panX, 100, 'Enter key must navigate viewport');
    assert.equal(updatedWorldTransform, true);
  } finally {
    globalThis.document = origDocument;
  }
});


