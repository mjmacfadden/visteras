import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { InspireDocument, VID_FORMAT_IDENTIFIER, VID_CURRENT_VERSION, CANVAS_PRESETS } from '../js/document.js';
import { SwipeFileManager } from '../js/swipe-file.js';
import { BoardComposer } from '../js/board-composer.js';
import { MoodboardLayouts } from '../js/moodboard-layouts.js';
import { hexToRgb, getNearestColorName } from '../js/color-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inspireRoot = path.resolve(__dirname, '..');

/* -------------------------------------------------------------------------- */
/* 1. Document (.vid) Format & Storage Tests                                  */
/* -------------------------------------------------------------------------- */

test('InspireDocument: Serializes and verifies .vid format specification', () => {
  const doc = new InspireDocument({
    title: 'Brand Moodboard 2026',
    mode: 'fixed',
    preset: '16:9',
    width: 1920,
    height: 1080,
    background: '#14161b'
  });

  const board = new BoardComposer();
  board.addTextElement({ text: 'Minimal Architecture', x: 100, y: 100 });
  board.addSwatchElement({ hex: '#f59e0b', name: 'Amber Gold', x: 200, y: 200 });

  const swipe = new SwipeFileManager();
  swipe.addItem({
    type: 'quote',
    category: 'Quotes',
    title: 'Design Quote',
    content: 'Less but better.',
    meta: { author: 'Dieter Rams' },
    source: 'manual'
  });

  const serialized = doc.serialize(board, swipe);
  const jsonStr = JSON.stringify(serialized, null, 2);
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.format, VID_FORMAT_IDENTIFIER, 'Document format identifier must match visteras-inspire');
  assert.equal(parsed.version, VID_CURRENT_VERSION, 'Document version must match current release');
  assert.equal(parsed.board.mode, 'fixed');
  assert.equal(parsed.board.width, 1920);
  assert.equal(parsed.board.height, 1080);
  assert.equal(parsed.board.elements.length, 2);
  assert.equal(parsed.swipeFile.items.length, 1);
  assert.equal(parsed.swipeFile.items[0].meta.author, 'Dieter Rams');
});

test('InspireDocument: Generates clean blank default starter with empty board, empty swipe file, and white background', () => {
  const blankDoc = new InspireDocument();
  assert.equal(blankDoc.background, '#ffffff', 'Default board background must be white');

  const starter = InspireDocument.createDefaultStarter();
  assert.equal(starter.format, VID_FORMAT_IDENTIFIER);
  assert.equal(starter.board.elements.length, 0, 'Starter board must be completely empty (0 elements)');
  assert.equal(starter.swipeFile.items.length, 0, 'Starter swipe file must be completely empty (0 items)');
  assert.equal(starter.board.background, '#ffffff', 'Starter board background must be white (#ffffff)');

  // Verify createSampleDemo still generates rich demo content when requested
  const sample = InspireDocument.createSampleDemo();
  assert.ok(sample.board.elements.length >= 4, 'Demo sample must include architectural board elements');
  assert.ok(sample.swipeFile.items.length >= 4, 'Demo sample must include swipe file items');
});

test('InspireDocument: Canvas Presets define valid print and digital dimensions', () => {
  assert.ok(CANVAS_PRESETS['16:9']);
  assert.ok(CANVAS_PRESETS['letter-land']);
  assert.equal(CANVAS_PRESETS['letter-land'].printDpi, 300);
  assert.equal(CANVAS_PRESETS['a4-port'].printDpi, 300);
});

/* -------------------------------------------------------------------------- */
/* 2. Swipe File Auto-Categorization & Taxonomy Tests                         */
/* -------------------------------------------------------------------------- */

test('SwipeFileManager: Auto-categorizes quotes with author attribution', () => {
  const manager = new SwipeFileManager();

  // Test standard dash author quote
  const res1 = manager.categorizeText('"Simplicity is the ultimate sophistication." — Leonardo da Vinci');
  assert.equal(res1.category, 'Quotes');
  assert.equal(res1.type, 'quote');
  assert.equal(res1.quote, 'Simplicity is the ultimate sophistication.');
  assert.equal(res1.author, 'Leonardo da Vinci');

  // Test double dash author quote
  const res2 = manager.categorizeText('Form follows function -- Louis Sullivan');
  assert.equal(res2.category, 'Quotes');
  assert.equal(res2.author, 'Louis Sullivan');
});

test('SwipeFileManager: Auto-categorizes hex color palettes', () => {
  const manager = new SwipeFileManager();
  const res = manager.categorizeText('#f59e0b, #2b2d42, #e2d9cc');

  assert.equal(res.category, 'Color Palettes');
  assert.equal(res.type, 'color');
  assert.deepEqual(res.colors, ['#f59e0b', '#2b2d42', '#e2d9cc']);
});

test('SwipeFileManager: Auto-categorizes written copy and headlines', () => {
  const manager = new SwipeFileManager();

  // Short single line headline
  const headline = manager.categorizeText('SPRING SUMMER 2027 CAMPAIGN');
  assert.equal(headline.category, 'Written Copy');
  assert.equal(headline.type, 'text');
  assert.equal(headline.title, 'SPRING SUMMER 2027 CAMPAIGN');

  // Multi-line body copy
  const bodyCopy = manager.categorizeText(
    'Architecture is not just about concrete and glass.\nIt is the sculpture of light and spatial experience for human life.'
  );
  assert.equal(bodyCopy.category, 'Written Copy');
  assert.equal(bodyCopy.type, 'text');
  assert.ok(bodyCopy.title.startsWith('Architecture is not just about'));
});

test('SwipeFileManager: Filters items by query, category, and tags', async () => {
  const manager = new SwipeFileManager();

  await manager.addItem({
    type: 'quote',
    category: 'Quotes',
    title: 'Bauhaus Quote',
    content: 'Art and technology: a new unity.',
    tags: ['bauhaus', 'minimal']
  });

  await manager.addItem({
    type: 'text',
    category: 'Written Copy',
    title: 'Editorial Intro',
    content: 'Welcome to the future of craft.',
    tags: ['editorial', 'modern']
  });

  const quotesOnly = manager.getFilteredItems({ category: 'Quotes' });
  assert.equal(quotesOnly.length, 1);
  assert.equal(quotesOnly[0].title, 'Bauhaus Quote');

  const taggedBauhaus = manager.getFilteredItems({ tag: 'bauhaus' });
  assert.equal(taggedBauhaus.length, 1);
  assert.equal(taggedBauhaus[0].title, 'Bauhaus Quote');

  const queryFound = manager.getFilteredItems({ query: 'craft' });
  assert.equal(queryFound.length, 1);
  assert.equal(queryFound[0].title, 'Editorial Intro');
});

/* -------------------------------------------------------------------------- */
/* 3. Moodboard Auto-Layout Generators Tests                                  */
/* -------------------------------------------------------------------------- */

test('MoodboardLayouts: Masonry arranges elements into staggered column lanes', () => {
  const elements = [
    { id: '1', width: 300, height: 200 },
    { id: '2', width: 300, height: 350 },
    { id: '3', width: 300, height: 180 },
    { id: '4', width: 300, height: 260 }
  ];

  const bounds = { x: 50, y: 50, width: 900, height: 600 };
  const updates = MoodboardLayouts.masonry(elements, { bounds, columns: 3, gap: 20 });

  assert.equal(updates.length, 4);
  assert.equal(updates[0].id, '1');
  assert.equal(updates[0].x, 50, 'First column starts at bounds.x');
  assert.equal(updates[0].y, 50, 'First item starts at bounds.y');

  // Verify all elements fit within bounds
  for (const u of updates) {
    assert.ok(u.x >= bounds.x, 'Item x inside bounds');
    assert.ok(u.y >= bounds.y, 'Item y inside bounds');
    assert.equal(u.rotation, 0, 'Masonry layout resets tilt to 0');
  }
});

test('MoodboardLayouts: Editorial establishes prominent hero focus', () => {
  const elements = [
    { id: 'hero', type: 'image', width: 400, height: 300 },
    { id: 'side1', type: 'quote', width: 300, height: 150 },
    { id: 'side2', type: 'swatch', width: 150, height: 150 }
  ];

  const bounds = { x: 100, y: 100, width: 1200, height: 800 };
  const updates = MoodboardLayouts.editorial(elements, { bounds, gap: 24 });

  assert.equal(updates.length, 3);
  const heroUpdate = updates.find(u => u.id === 'hero');
  assert.ok(heroUpdate.width > 500, 'Hero element should be scaled up significantly in editorial mode');
});

test('MoodboardLayouts: Collage Cluster applies organic paper-like rotations', () => {
  const elements = [
    { id: 'c1', width: 250, height: 250 },
    { id: 'c2', width: 250, height: 250 },
    { id: 'c3', width: 250, height: 250 }
  ];

  const bounds = { x: 50, y: 50, width: 800, height: 600 };
  const updates = MoodboardLayouts.collage(elements, { bounds, gap: 30 });

  assert.equal(updates.length, 3);
  // Rotations should be staggered / organic (non-zero)
  const hasRotation = updates.some(u => u.rotation !== 0);
  assert.ok(hasRotation, 'Collage layout should assign artistic rotations');
});

/* -------------------------------------------------------------------------- */
/* 4. Board Composer Operations & Z-Ordering Tests                            */
/* -------------------------------------------------------------------------- */

test('BoardComposer: Creates board elements and maintains undo/redo history', () => {
  const composer = new BoardComposer();
  assert.equal(composer.elements.length, 0);

  const sticky = composer.addStickyElement({ text: 'Idea 1', color: '#fef08a' });
  assert.equal(composer.elements.length, 1);
  assert.equal(sticky.type, 'sticky');
  assert.ok(composer.canUndo(), 'Should be able to undo after adding element');

  composer.undo();
  assert.equal(composer.elements.length, 0, 'Undo should remove created element');

  composer.redo();
  assert.equal(composer.elements.length, 1, 'Redo should restore created element');
});

test('BoardComposer: Manages Z-index layering (bringToFront, sendToBack, etc)', () => {
  const composer = new BoardComposer();
  const el1 = composer.addTextElement({ text: 'Bottom', x: 0, y: 0 });
  const el2 = composer.addTextElement({ text: 'Middle', x: 10, y: 10 });
  const el3 = composer.addTextElement({ text: 'Top', x: 20, y: 20 });

  assert.equal(el1.zIndex, 1);
  assert.equal(el2.zIndex, 2);
  assert.equal(el3.zIndex, 3);

  // Select el1 (bottom) and bring to front
  composer.select(el1.id);
  composer.bringToFront();

  assert.equal(el1.zIndex, 3, 'el1 should now be at front (zIndex 3)');
  assert.equal(el2.zIndex, 1, 'el2 shifted down');
  assert.equal(el3.zIndex, 2, 'el3 shifted down');

  // Send el1 to back
  composer.sendToBack();
  assert.equal(el1.zIndex, 1, 'el1 should now be back at index 1');
});

test('BoardComposer: Performs multi-element alignment', () => {
  const composer = new BoardComposer();
  const el1 = composer.addTextElement({ text: 'A', x: 50, y: 20, width: 100, height: 50 });
  const el2 = composer.addTextElement({ text: 'B', x: 200, y: 80, width: 100, height: 50 });

  composer.selectAll();
  composer.alignSelected('left');

  assert.equal(composer.getElementById(el1.id).x, 50);
  assert.equal(composer.getElementById(el2.id).x, 50, 'el2 should be aligned to min x (50)');
});

/* -------------------------------------------------------------------------- */
/* 5. Color Extractor & Utilities Tests                                       */
/* -------------------------------------------------------------------------- */

test('ColorExtractor: Accurately converts hex to RGB and calculates perceptual names', () => {
  const rgb = hexToRgb('#f59e0b');
  assert.deepEqual(rgb, { r: 245, g: 158, b: 11 });

  const nameGold = getNearestColorName('#f59e0b');
  assert.ok(nameGold.toLowerCase().includes('amber') || nameGold.toLowerCase().includes('gold') || nameGold.toLowerCase().includes('yellow'),
    `Color name for #f59e0b should be descriptive, got: ${nameGold}`);

  const nameWhite = getNearestColorName('#ffffff');
  assert.equal(nameWhite, 'Pure White');

  const nameBlack = getNearestColorName('#111111');
  assert.equal(nameBlack, 'Jet Black');
});

/* -------------------------------------------------------------------------- */
/* 6. HTML & Layout UX Hierarchy Verification                                 */
/* -------------------------------------------------------------------------- */

test('HTML Structure: Strictly adheres to user requested Visteras layout hierarchy', () => {
  const html = fs.readFileSync(path.join(inspireRoot, 'index.html'), 'utf8');

  // Verify Options bar across top
  assert.match(html, /<header\s+id="tools_top"/, 'HTML must contain #tools_top header');

  // Verify File menu bar below options bar
  assert.match(html, /<nav\s+id="visteras_menu_bar"/, 'HTML must contain #visteras_menu_bar nav');

  // Verify Left toolbar
  assert.match(html, /<aside\s+id="tools_left"/, 'HTML must contain #tools_left aside');

  // Verify Workspace in middle
  assert.match(html, /<main\s+id="workarea"/, 'HTML must contain #workarea main');

  // Verify Right sidepanels
  assert.match(html, /<aside\s+id="sidepanels"/, 'HTML must contain #sidepanels aside');

  // Verify Bottom status bar
  assert.match(html, /<footer\s+id="tools_bottom"/, 'HTML must contain #tools_bottom footer');

  // Verify options bar appears before menu bar in DOM
  const toolsTopIdx = html.indexOf('id="tools_top"');
  const menuBarIdx = html.indexOf('id="visteras_menu_bar"');
  const toolsLeftIdx = html.indexOf('id="tools_left"');
  const workareaIdx = html.indexOf('id="workarea"');
  const sidepanelsIdx = html.indexOf('id="sidepanels"');
  const toolsBottomIdx = html.indexOf('id="tools_bottom"');

  assert.ok(toolsTopIdx < menuBarIdx, 'Options bar (#tools_top) must precede Menu bar (#visteras_menu_bar)');
  assert.ok(menuBarIdx < toolsLeftIdx, 'Menu bar must precede Left tools');
  assert.ok(toolsLeftIdx < workareaIdx, 'Left tools must precede Workarea');
  assert.ok(workareaIdx < sidepanelsIdx, 'Workarea must precede Sidepanels');
  assert.ok(sidepanelsIdx < toolsBottomIdx, 'Sidepanels must precede Bottom status bar');

  // Verify CSS grid template hierarchy
  const css = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-theme.css'), 'utf8');
  assert.match(
    css,
    /grid-template:\s*"options\s+options\s+options"[\s\S]*?"menu\s+menu\s+menu"[\s\S]*?"tools\s+workarea\s+panels"[\s\S]*?"status\s+status\s+status"/,
    'CSS grid must specify options bar on top, menu below it, tools-workarea-panels in middle, and status at bottom'
  );
});

test('Document Tabs: Workspace provides tabbed document bar and styling for multiple open documents', () => {
  const html = fs.readFileSync(path.join(inspireRoot, 'index.html'), 'utf8');

  // Verify document_tabs container inside workarea
  assert.match(html, /<div\s+id="document_tabs"\s+class="document_tabs"/, 'index.html must have #document_tabs element');
  assert.match(html, /<div\s+id="inspire_canvas_container"/, 'index.html must have canvas mount container');

  // Verify File menu close tab item
  assert.match(html, /id="action_menu_close_tab"/, 'File menu must have Close Tab action');

  // Verify CSS styles document tabs, active state with amber accent, close button, and new tab button
  const css = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-theme.css'), 'utf8');
  assert.match(css, /\.document_tabs\s*\{/, 'Theme CSS must style .document_tabs');
  assert.match(css, /\.document_tab\.active\s*\{[^}]*var\(--inspire-amber\)/, 'Active document tab must have amber accent border');
  assert.match(css, /\.document_tabs\s+\.new_tab_btn\s*\{/, 'Theme CSS must style .new_tab_btn');
  assert.match(css, /\.document_tab\s+\.tab_close\s*\{/, 'Theme CSS must style .tab_close button');
  assert.match(css, /\.tab_rename_input\s*\{/, 'Theme CSS must style inline rename input');

  // Verify print CSS hides document_tabs
  const printCss = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-print.css'), 'utf8');
  assert.match(printCss, /\.document_tabs/, 'Print CSS must hide .document_tabs');
});

test('Quote Input UX: Panel displays input for adding and editing quotes instead of JS prompt dialogs', () => {
  // 1. Assert zero window.prompt usage in inspire codebase
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  const inspectorJs = fs.readFileSync(path.join(inspireRoot, 'js/inspector.js'), 'utf8');
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');

  assert.ok(!/\bprompt\s*\(/.test(appJs), 'app.js must not contain any window.prompt() calls');
  assert.ok(!/\bprompt\s*\(/.test(inspectorJs), 'inspector.js must not contain any window.prompt() calls');
  assert.ok(!/\bprompt\s*\(/.test(canvasJs), 'canvas.js must not contain any window.prompt() calls');

  // 2. Verify InspectorPanel has dedicated add quote form methods & elements
  assert.match(inspectorJs, /showAddQuoteForm\s*\(/, 'InspectorPanel must provide showAddQuoteForm');
  assert.match(inspectorJs, /renderAddQuoteForm\s*\(/, 'InspectorPanel must provide renderAddQuoteForm');
  assert.match(inspectorJs, /id="inp_add_quote_text"/, 'Add Quote form must contain quote textarea');
  assert.match(inspectorJs, /id="inp_add_quote_author"/, 'Add Quote form must contain author input');
  assert.match(inspectorJs, /id="inp_add_quote_cite"/, 'Add Quote form must contain citation input');
  assert.match(inspectorJs, /id="btn_confirm_add_quote"/, 'Add Quote form must contain confirm button');
  assert.match(inspectorJs, /id="btn_save_quote_library"/, 'Add Quote form must contain save to library button');

  // 3. Verify single quote element inspector provides 2-way textarea & color editing
  assert.match(inspectorJs, /id="inp_quote_text"/, 'Quote inspector properties must include quote text textarea');
  assert.match(inspectorJs, /id="inp_quote_bg"/, 'Quote inspector properties must include card background color picker');
  assert.match(inspectorJs, /id="inp_quote_color"/, 'Quote inspector properties must include text color picker');

  // 4. Verify BoardComposer creates customizable quote elements
  const board = new BoardComposer();
  const quoteEl = board.addQuoteElement({
    quote: 'Simplicity is about subtracting the obvious and adding the meaningful.',
    author: 'John Maeda',
    cite: 'The Laws of Simplicity',
    fontSize: 26,
    color: '#e2e8f0',
    bg: '#0f172a',
    quoteStyle: 'editorial'
  });

  assert.equal(quoteEl.type, 'quote');
  assert.equal(quoteEl.data.quote, 'Simplicity is about subtracting the obvious and adding the meaningful.');
  assert.equal(quoteEl.data.author, 'John Maeda');
  assert.equal(quoteEl.data.fontSize, 26);
  assert.equal(quoteEl.data.color, '#e2e8f0');
  assert.equal(quoteEl.data.bg, '#0f172a');
  assert.equal(quoteEl.data.quoteStyle, 'editorial');

  // 5. Verify CSS styling for panel textarea and add quote card
  const css = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-theme.css'), 'utf8');
  assert.match(css, /\.inspector-textarea\s*\{/, 'Theme CSS must style .inspector-textarea');
  assert.match(css, /\.add-quote-panel-card\s*\{/, 'Theme CSS must style .add-quote-panel-card');
});

test('Sticky Note Text Editing & Blank White Board UX: Direct in-note and inspector editing, clean white boards', () => {
  // 1. Verify sticky note is rendered with .sticky-note-textarea for direct in-place editing
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');
  assert.match(canvasJs, /class="sticky-note-textarea/, 'canvas.js must render .sticky-note-textarea inside sticky notes');
  assert.match(canvasJs, /stickyTa\.addEventListener\('input'/, 'canvas.js must attach live input listener to sticky note textarea');

  // 2. Verify Inspector provides #inp_sticky_text for editing sticky notes in the sidepanel
  const inspectorJs = fs.readFileSync(path.join(inspireRoot, 'js/inspector.js'), 'utf8');
  assert.match(inspectorJs, /id="inp_sticky_text"/, 'inspector.js must provide #inp_sticky_text textarea for sticky notes');
  assert.match(inspectorJs, /#inp_sticky_text.*addEventListener\('input'/, 'inspector.js must synchronize #inp_sticky_text input with board');

  // 3. Verify CSS styles for sticky note textarea
  const css = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-theme.css'), 'utf8');
  assert.match(css, /\.sticky-note-textarea\s*\{/, 'Theme CSS must style .sticky-note-textarea');
  assert.match(css, /\.sticky-note-textarea\.font-handwriting\s*\{/, 'Theme CSS must support handwriting font');

  // 4. Verify new Inspire files and starter defaults are blank with white board
  const blankStarter = InspireDocument.createBlank();
  assert.equal(blankStarter.board.elements.length, 0, 'New boards must have 0 elements');
  assert.equal(blankStarter.swipeFile.items.length, 0, 'New files must have 0 swipe file items');
  assert.equal(blankStarter.board.background, '#ffffff', 'Default board background must be white (#ffffff)');

  // 5. Verify app.js uses createBlank for default starter & new files
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  assert.match(appJs, /InspireDocument\.createBlank\(/, 'app.js must use InspireDocument.createBlank');
});

test('Color Swatch UX: Clicking on a color swatch copies hex code to clipboard', () => {
  // 1. Verify canvas.js provides copyHexToClipboard method
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');
  assert.match(canvasJs, /copyHexToClipboard\s*\(/, 'canvas.js must define copyHexToClipboard method');

  // 2. Verify whole swatch card on board has click listener for copying hex code
  assert.match(canvasJs, /el\.type === 'swatch'[\s\S]*?copyHexToClipboard/, 'Clicking swatch card must copy hex code to clipboard');

  // 3. Verify library swatches and color dots also have click-to-copy listeners
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  assert.match(appJs, /\.palette-swatch-bar, \.color-dot/, 'app.js must attach click-to-copy listeners to library swatches');
  assert.match(appJs, /navigator\.clipboard\?\.writeText/, 'app.js must write hex to clipboard');
});

test('Default View UX: Canvas view defaults to fit to workspace rather than 100%', () => {
  // 1. Verify app.js defaults document viewportState to null rather than hardcoded 100% zoom
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  assert.match(appJs, /viewportState:\s*data\.viewportState\s*\|\|\s*null/, 'New documents must have viewportState default to null to trigger fitToScreen');

  // 2. Verify status bar button defaults to "Fit"
  const indexHtml = fs.readFileSync(path.join(inspireRoot, 'index.html'), 'utf8');
  assert.match(indexHtml, /id="status-zoom-btn"[^>]*>Fit<\/button>/, 'Status bar zoom badge must default to Fit rather than 100%');

  // 3. Verify canvas.js fitToScreen logic computes proportional scale and centers artboard
  const pad = 80;
  const availW = 1200 - pad * 2; // 1040
  const availH = 800 - pad * 2;  // 640
  const scaleW = availW / 1920;  // 0.5416
  const scaleH = availH / 1080;  // 0.5925
  const expectedZoom = Math.min(scaleW, scaleH, 1.2); // ~0.5416
  assert(expectedZoom < 1.0, 'Fit scale for 1920x1080 in 1200x800 must scale down to fit workspace, not remain at 100%');

  // 4. Verify canvas.js has ResizeObserver to auto-fit when viewport renders
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');
  assert.match(canvasJs, /new ResizeObserver/, 'canvas.js must use ResizeObserver to fit canvas when dimensions are established');
  assert.match(canvasJs, /requestAnimationFrame\(\(\)\s*=>\s*this\.fitToScreen\(\)\)/, 'canvas.js must defer fitToScreen via requestAnimationFrame if layout is not ready');

  // 5. Verify switchDocument defaults to fitToScreen when viewportState is null
  assert.match(canvasJs, /if\s*\(viewportState && typeof viewportState\.zoom === 'number'\)[\s\S]*?else\s*\{\s*this\.fitToScreen\(\);\s*\}/, 'switchDocument must call fitToScreen when no saved viewportState is present');
});

test('Input & Keyboard Shortcut Isolation UX: Typing in polaroid captions and inspector inputs does not trigger shortcuts', () => {
  // 1. Verify app.js checks both target and document.activeElement before firing shortcuts
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  assert.match(appJs, /isTextInput\(target\)\s*\|\|\s*isTextInput\(activeEl\)/, 'initKeyboardShortcuts must check both target and activeElement');

  // 2. Verify inspector.js does not re-render on board update when an inspector input has focus
  const inspectorJs = fs.readFileSync(path.join(inspireRoot, 'js/inspector.js'), 'utf8');
  assert.match(inspectorJs, /if\s*\(document\.activeElement && this\.container\.contains\(document\.activeElement\)\)\s*\{\s*return;\s*\}/, 'inspector.js must prevent re-render while user is typing in an inspector input');

  // 3. Verify inspector stops keydown propagation
  assert.match(inspectorJs, /this\.container\.addEventListener\('keydown',\s*\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);/, 'inspector.js must stop keydown propagation so keystrokes do not leak to global shortcuts');

  // 4. Verify canvas.js allows double-click inline editing on polaroid images
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');
  assert.match(canvasJs, /el\.type === 'image' && el\.data\?\.polaroid/, 'canvas.js dblclick must support polaroid caption editing');
  assert.match(canvasJs, /#inp_img_caption/, 'canvas.js inline polaroid editor must live-sync with inspector caption');

  // 5. Verify inspector guards history events against tearing down focused inputs
  assert.match(inspectorJs, /else if\s*\(evt\.type === 'update' \|\| evt\.type === 'history'\)/, 'inspector.js must prevent re-rendering on both update and history when input has focus');

  // 6. Verify image caption input updates board live without committing history on each keystroke
  assert.match(inspectorJs, /#inp_img_caption[\s\S]*?updateElement\(el\.id,\s*\{\s*data:\s*\{\s*caption:\s*e\.target\.value\s*\}\s*\},\s*false\)/, 'inspector.js must update caption on input without pushing history on every character');
  assert.match(inspectorJs, /#inp_img_caption[\s\S]*?saveHistory\('Edit image caption'\)/, 'inspector.js must commit history only on change');
});

test('Option + Scroll Zoom UX: Alt/Option + wheel zooms in and out like Studio and Vector', () => {
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');

  // 1. Verify wheel listener supports e.altKey for Option+Scroll zooming
  assert.match(canvasJs, /e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey/, 'canvas.js wheel listener must zoom on e.altKey (Option key)');

  // 2. Verify Shift + scroll pans horizontally
  assert.match(canvasJs, /e\.shiftKey && deltaX === 0 && deltaY !== 0/, 'canvas.js wheel listener must scroll horizontally on Shift+wheel');

  // 3. Verify trackpad pinch gesture event listeners are attached
  assert.match(canvasJs, /addEventListener\('gesturestart'/, 'canvas.js must attach gesturestart listener for trackpad pinch');
  assert.match(canvasJs, /addEventListener\('gesturechange'/, 'canvas.js must attach gesturechange listener for trackpad pinch');
  assert.match(canvasJs, /addEventListener\('gestureend'/, 'canvas.js must attach gestureend listener for trackpad pinch');
});

test('Save & Export (.vid) UX: InspireDocument defines downloadVidFile and exportVidFile for seamless saving', () => {
  // 1. Verify InspireDocument instance has downloadVidFile method
  const doc = new InspireDocument({ title: 'My Moodboard' });
  assert.equal(typeof doc.downloadVidFile, 'function', 'InspireDocument instance must have downloadVidFile method');
  assert.equal(typeof doc.exportVidFile, 'function', 'InspireDocument instance must have exportVidFile method');

  // 2. Verify downloadVidFile serializes board and swipe file
  const board = new BoardComposer();
  board.addStickyElement({ text: 'Inspiration Idea', x: 50, y: 50 });
  const swipe = new SwipeFileManager();

  // Mock downloadAsFile so it does not touch DOM in test environment
  let downloadedData = null;
  let downloadedFilename = null;
  const originalDownload = InspireDocument.downloadAsFile;
  InspireDocument.downloadAsFile = (data, filename) => {
    downloadedData = data;
    downloadedFilename = filename;
  };

  try {
    const serialized = doc.downloadVidFile(board, swipe, 'custom_moodboard.vid');
    assert.equal(serialized.format, VID_FORMAT_IDENTIFIER);
    assert.equal(serialized.board.elements.length, 1);
    assert.equal(downloadedData.format, VID_FORMAT_IDENTIFIER);
    assert.equal(downloadedFilename, 'custom_moodboard.vid');
  } finally {
    InspireDocument.downloadAsFile = originalDownload;
  }

  // 3. Verify app.js exportVidFile uses downloadVidFile with fallback
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  assert.match(appJs, /active\.doc\.downloadVidFile\(/, 'app.js must call active.doc.downloadVidFile');
  assert.match(appJs, /InspireDocument\.downloadAsFile\(/, 'app.js must have fallback to InspireDocument.downloadAsFile');
});

test('Direct File Reading & Clean Startup: App starts with fresh blank document, prunes stale storage, and reads/writes files directly', () => {
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');

  // 1. Verify app.js always starts fresh with a blank document and does not load old storage boards
  assert.match(appJs, /InspireDocument\.createBlank\('Untitled Inspiration Board'\)/, 'app.js must create a fresh blank document on init');

  // 2. Verify stale persistent storage keys are removed on startup so nothing is resurrected
  assert.match(appJs, /localStorage\.removeItem\(LOCAL_STORAGE_DOCS_KEY\)/, 'app.js must remove stale LOCAL_STORAGE_DOCS_KEY on init');
  assert.match(appJs, /localStorage\.removeItem\(LOCAL_STORAGE_KEY\)/, 'app.js must remove stale LOCAL_STORAGE_KEY on init');
  assert.match(appJs, /sessionStorage\.removeItem\('visteras_inspire_session_state'\)/, 'app.js must remove stale session state on init');

  // 3. Verify auto-save to browser storage is removed in favor of reading and writing .vid files directly
  assert.doesNotMatch(appJs, /saveAllToLocalStorage\(\)/, 'app.js must not auto-save documents to localStorage/sessionStorage');
  assert.doesNotMatch(appJs, /scheduleAutoSave\(\)/, 'app.js must not schedule autosaves');

  // 4. Verify opening document reads the .vid file structure directly
  assert.match(appJs, /openDocumentData\(docData\)/, 'app.js must support opening .vid document data directly');
});

test('Bounding Box & Corner Rotation Zone UX: Blue lines with square handles and corner rotation zones matching Studio and Vector', () => {
  const themeCss = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-theme.css'), 'utf8');
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');

  // 1. Verify bounding box lines are blue (#3f8ff7)
  assert.match(themeCss, /\.inspire-transform-box\s*\{[^}]*border:\s*1px solid #3f8ff7/s, 'Transform box border must be 1px solid #3f8ff7');

  // 2. Verify transform handles are square with white fill and blue border
  assert.match(themeCss, /\.transform-handle\s*\{[^}]*border:\s*1px solid #3f8ff7/s, 'Handles border must be 1px solid #3f8ff7');
  assert.match(themeCss, /\.transform-handle\s*\{[^}]*background:\s*#ffffff/s, 'Handles background must be #ffffff');
  assert.match(themeCss, /\.transform-handle\s*\{[^}]*border-radius:\s*0/s, 'Handles must be square (border-radius: 0)');

  // 3. Verify dedicated stem rotation handle is removed from canvas handles list and CSS
  assert.doesNotMatch(canvasJs, /['"]rot['"]/, 'rot must not be in handles list');
  assert.doesNotMatch(themeCss, /\.handle-rot\b/, '.handle-rot CSS must be removed');

  // 4. Verify corner rotation zones are added for all four corners with rotation cursor
  assert.match(canvasJs, /const rotateCorners = \['nw', 'ne', 'se', 'sw'\]/, 'canvas.js must create corner rotation zones for nw, ne, se, sw');
  assert.match(canvasJs, /transform-rotate-zone rot-zone-\$\{rc\}/, 'canvas.js must render transform-rotate-zone elements');
  assert.match(themeCss, /\.transform-rotate-zone\s*\{[^}]*cursor:[^}]*rotate\.svg/s, 'Corner rotation zones must display rotate.svg cursor');

  // 5. Verify pointer down detects corner rotation zone
  assert.match(canvasJs, /closest\('\.transform-rotate-zone'\)/, 'canvas.js must detect clicks in corner rotation zones');

  // 6. Verify 15-degree shift-snapping parity
  assert.match(canvasJs, /Math\.round\(baseRot \/ 15\) \* 15/, 'canvas.js must snap rotation to 15 degrees when Shift is held');
});

test('Layouts UX: Custom element positioning can be reverted to after applying auto-layouts', () => {
  const indexHtml = fs.readFileSync(path.join(inspireRoot, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');

  // 1. Verify BoardComposer programmatic revert functionality
  const composer = new BoardComposer();
  const el1 = composer.addImageElement({ src: 'test1.jpg', x: 120, y: 240, width: 300, height: 200 });
  const el2 = composer.addQuoteElement({ quote: 'Hello', x: 500, y: 600, width: 350, height: 180 });
  el1.rotation = 12.5;
  el2.rotation = -4;

  // Snapshot custom layout
  composer.snapshotCustomLayout();
  assert.equal(composer.hasCustomLayout(), true, 'BoardComposer has saved custom layout snapshot');

  // Apply auto-layout updates
  const bounds = { x: 80, y: 80, width: 1200, height: 800 };
  const masonryUpdates = MoodboardLayouts.masonry(composer.elements, { bounds });
  composer.applyLayoutUpdates(masonryUpdates, 'Apply Masonry');

  // Coordinates should be different now
  assert.notEqual(el1.x, 120, 'Masonry moved el1 x');
  assert.equal(el1.rotation, 0, 'Masonry reset el1 rotation to 0');

  // Revert to custom layout
  const reverted = composer.revertToCustomLayout();
  assert.equal(reverted, true, 'revertToCustomLayout succeeded');
  assert.equal(el1.x, 120, 'el1 x restored to custom');
  assert.equal(el1.y, 240, 'el1 y restored to custom');
  assert.equal(el1.rotation, 12.5, 'el1 rotation restored to custom');
  assert.equal(el2.x, 500, 'el2 x restored to custom');
  assert.equal(el2.y, 600, 'el2 y restored to custom');
  assert.equal(el2.rotation, -4, 'el2 rotation restored to custom');

  // 2. Verify UI options include Custom Layout across options bar, sidepanel, and menus
  assert.match(indexHtml, /<option value="custom"[^>]*>📌 Custom Layout<\/option>/, 'Options select must include Custom Layout');
  assert.match(indexHtml, /id="action_menu_layout_custom"/, 'Board menu must include Revert to Custom Layout');
  assert.match(appJs, /data-layout="custom"/, 'Templates and layouts sidepanel must have Custom Positioning card');
  assert.match(appJs, /revertToCustomLayout\(\)/, 'app.js must call revertToCustomLayout when custom layout is selected');
});

test('Infinite Canvas UX: Occupies full workspace, centers objects in display, and Cmd/Ctrl+0 fits all objects', () => {
  const themeCss = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-theme.css'), 'utf8');
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');

  // 1. Verify CSS styles for infinite canvas occupying full workspace
  assert.match(themeCss, /\.inspire-artboard-frame\.infinite-mode\s+\.inspire-artboard-header\s*\{[^}]*display:\s*none/s, 'Artboard header must be hidden in infinite mode');
  assert.match(themeCss, /\.inspire-viewport\.mode-infinite\s*\{[^}]*background-color:/s, 'Viewport must apply background color to fill full workspace in infinite mode');
  assert.match(themeCss, /\.inspire-artboard\.mode-infinite\s*\{[^}]*box-shadow:\s*none/s, 'Artboard box shadow must be removed in infinite mode');

  // 2. Verify canvas.js setMode triggers fitToScreen immediately
  assert.match(canvasJs, /setMode\(mode\)[\s\S]*?this\.fitToScreen\(\)/, 'canvas.js setMode must call fitToScreen when switching modes');

  // 3. Verify canvas.js fitToScreen in infinite mode calculates bounding box of all objects on the board
  assert.match(canvasJs, /if\s*\(this\.doc\.mode === 'infinite'\)[\s\S]*?const elements = this\.board\?\.elements;/, 'fitToScreen must check for elements in infinite mode');
  assert.match(canvasJs, /contentW\s*=\s*Math\.max\(1,\s*maxX\s*-\s*minX\)/, 'fitToScreen must compute content width across all objects');
  assert.match(canvasJs, /contentH\s*=\s*Math\.max\(1,\s*maxY\s*-\s*minY\)/, 'fitToScreen must compute content height across all objects');

  // 4. Verify center calculation centers the objects in the middle of the viewport
  assert.match(canvasJs, /centerX\s*=\s*minX\s*\+\s*contentW\s*\/\s*2/, 'fitToScreen must find center X of objects');
  assert.match(canvasJs, /centerY\s*=\s*minY\s*\+\s*contentH\s*\/\s*2/, 'fitToScreen must find center Y of objects');
  assert.match(canvasJs, /this\.panX\s*=\s*\(rect\.width\s*\/\s*2\)\s*-\s*centerX\s*\*\s*this\.zoom/, 'fitToScreen must center objects horizontally in viewport');
  assert.match(canvasJs, /this\.panY\s*=\s*\(rect\.height\s*\/\s*2\)\s*-\s*centerY\s*\*\s*this\.zoom/, 'fitToScreen must center objects vertically in viewport');

  // 5. Verify Cmd/Ctrl+0 invokes fitToScreen, which fits all objects in infinite mode
  assert.match(appJs, /if\s*\(isCmdOrCtrl\s*&&\s*e\.key === '0'\)[\s\S]*?this\.canvas\.fitToScreen\(\)/, 'Cmd/Ctrl+0 must invoke fitToScreen');
});

test('Document Tab File Name Display UX: Tabs display document file name (.vid) and support file-name renaming and file loading', () => {
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  const canvasJs = fs.readFileSync(path.join(inspireRoot, 'js/canvas.js'), 'utf8');

  // 1. Verify renderDocumentTabs renders the .vid file name in .tab_title
  assert.match(appJs, /const tabFileName\s*=\s*d\.fileName/, 'renderDocumentTabs must resolve d.fileName');
  assert.match(appJs, /<span class="tab_title">\$\{this\.escapeHtml\(tabFileName\)\}\$\{dirtyBullet\}<\/span>/, 'renderDocumentTabs must render tabFileName in .tab_title');

  // 2. Verify initial starter document creates Untitled-1.vid
  assert.match(appJs, /fileName:\s*'Untitled-1\.vid'/, 'Initial document model must default fileName to Untitled-1.vid');

  // 3. Verify openVidFile passes the file name to openDocumentData
  assert.match(appJs, /this\.openDocumentData\(docData,\s*file\.name\)/, 'openVidFile must pass file.name to openDocumentData');

  // 4. Verify canvas drop passes file name to window.__visterasLoadDocument
  assert.match(canvasJs, /window\.__visterasLoadDocument\?\.\(docData,\s*f\.name\)/, 'canvas.js drop listener must forward f.name');

  // 5. Verify inline rename on double-click edits and persists the .vid extension
  assert.match(appJs, /input\.value\s*=\s*currentFileName/, 'Inline rename must initialize input with current file name');
  assert.match(appJs, /docModel\.fileName\s*=\s*val/, 'Inline rename must persist updated fileName');
});

test('Swipe View Tagging UX: Items support adding, removing, and filtering by tags', async () => {
  const swipeJs = fs.readFileSync(path.join(inspireRoot, 'js/swipe-file.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(inspireRoot, 'js/app.js'), 'utf8');
  const themeCss = fs.readFileSync(path.join(inspireRoot, 'css/visteras-inspire-theme.css'), 'utf8');

  // 1. Verify SwipeFileManager has addTagToItem and removeTagFromItem methods
  const manager = new SwipeFileManager();
  const quoteItem = await manager.addItem({
    type: 'quote',
    category: 'Quotes',
    title: 'Dijkstra Quote',
    content: 'Simplicity is prerequisite for reliability.',
    tags: []
  });
  assert.ok(quoteItem, 'quote item created');

  let notified = false;
  manager.subscribe(() => { notified = true; });

  // Add tag
  const updatedItem = manager.addTagToItem(quoteItem.id, '#clean-code');
  assert.ok(updatedItem, 'addTagToItem returns updated item');
  assert.ok(quoteItem.tags.includes('clean-code'), 'Item has clean-code tag');
  assert.ok(manager.tags.has('clean-code'), 'Manager tags index includes clean-code');
  assert.equal(notified, true, 'Subscriber notified on addTagToItem');

  // Remove tag
  notified = false;
  const removedItem = manager.removeTagFromItem(quoteItem.id, 'clean-code');
  assert.ok(removedItem, 'removeTagFromItem returns updated item');
  assert.ok(!quoteItem.tags.includes('clean-code'), 'Item no longer has clean-code tag');
  assert.equal(notified, true, 'Subscriber notified on removeTagFromItem');

  // 2. Verify swipe-file.js implementation handles comma separation and sanitization
  assert.match(swipeJs, /addTagToItem\s*\(/, 'swipe-file.js must define addTagToItem');
  assert.match(swipeJs, /removeTagFromItem\s*\(/, 'swipe-file.js must define removeTagFromItem');

  // 3. Verify app.js card template renders tags with remove button, + Tag trigger, and inline form
  assert.match(appJs, /card-tags-row/, 'app.js createCardHtml must render card-tags-row');
  assert.match(appJs, /btn-add-tag-trigger/, 'app.js createCardHtml must render + Tag button');
  assert.match(appJs, /inline-tag-form/, 'app.js createCardHtml must render inline tag form');
  assert.match(appJs, /btn-remove-tag/, 'app.js createCardHtml must render remove tag button');

  // 4. Verify tag input is excluded from triggering global keyboard shortcuts
  assert.match(appJs, /\.card-tag-input/, 'app.js must isolate .card-tag-input from global keyboard shortcuts');

  // 5. Verify CSS styling for tag row, tags, and inline form
  assert.match(themeCss, /\.card-tags-row\s*\{/, 'theme.css must style .card-tags-row');
  assert.match(themeCss, /\.btn-add-tag-trigger\s*\{/, 'theme.css must style .btn-add-tag-trigger');
  assert.match(themeCss, /\.card-tag-input\s*\{/, 'theme.css must style .card-tag-input');
});
