/**
 * Visteras Inspire — Document (.vid) & Storage Manager
 * Reads and writes 100% client-side .vid files, export, and templates.
 * Documents are saved only as .vid files (like Studio's .vsd); nothing is autosaved to browser storage.
 */

export const VID_FORMAT_IDENTIFIER = 'visteras-inspire';
export const VID_CURRENT_VERSION = '1.0.0';

export const CANVAS_PRESETS = {
  '16:9': { name: 'Moodboard 16:9 (Landscape)', width: 1920, height: 1080, printDpi: 150 },
  '4:3': { name: 'Moodboard 4:3 (Classic)', width: 1600, height: 1200, printDpi: 150 },
  'letter-land': { name: 'US Letter (Landscape Print)', width: 3300, height: 2550, printDpi: 300 },
  'letter-port': { name: 'US Letter (Portrait Print)', width: 2550, height: 3300, printDpi: 300 },
  'a4-land': { name: 'A4 (Landscape Print)', width: 3508, height: 2480, printDpi: 300 },
  'a4-port': { name: 'A4 (Portrait Print)', width: 2480, height: 3508, printDpi: 300 },
  'poster-18x24': { name: 'Poster 18×24" (Print)', width: 5400, height: 7200, printDpi: 300 },
  'square': { name: 'Square 1:1 (Social / Grid)', width: 1200, height: 1200, printDpi: 150 }
};

export class InspireDocument {
  constructor({
    title = 'Untitled-1',
    fileName = null,
    mode = 'fixed', // 'fixed' or 'infinite'
    preset = '16:9',
    width = 1920,
    height = 1080,
    background = '#ffffff',
    bgPattern = 'blank', // 'blank' | 'dots' | 'grid'
    gridSnap = true,
    slides = []
  } = {}) {
    this.id = 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    this.title = title;
    this.fileName = fileName || (title.endsWith('.vid') ? title : `${title}.vid`);
    this.mode = mode;
    this.preset = preset;
    this.width = width;
    this.height = height;
    this.background = background;
    this.bgPattern = bgPattern;
    this.gridSnap = gridSnap;
    this.slides = (Array.isArray(slides) ? slides : []).filter(s => s && [s.x, s.y, s.width, s.height].every(Number.isFinite) && s.width > 0 && s.height > 0).map(s => ({ ...s, id: s.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'slide_' + Math.random().toString(36).substr(2, 9)) }));
    this.created = new Date().toISOString();
    this.modified = new Date().toISOString();
  }

  serialize(boardComposer, swipeFileManager) {
    this.modified = new Date().toISOString();
    return {
      format: VID_FORMAT_IDENTIFIER,
      version: VID_CURRENT_VERSION,
      meta: {
        id: this.id,
        title: this.title,
        fileName: this.fileName || (this.title.endsWith('.vid') ? this.title : `${this.title}.vid`),
        created: this.created,
        modified: this.modified
      },
      board: {
        mode: this.mode,
        preset: this.preset,
        width: this.width,
        height: this.height,
        background: this.background,
        bgPattern: this.bgPattern,
        gridSnap: this.gridSnap,
        slides: this.slides,
        elements: boardComposer ? boardComposer.elements : [],
        customLayoutSnapshot: boardComposer ? boardComposer.customLayoutSnapshot : null
      },
      swipeFile: swipeFileManager ? swipeFileManager.toJSON() : { items: [], tags: [], categories: [] }
    };
  }

  downloadVidFile(boardComposer, swipeFileManager, filename = null) {
    const data = this.serialize(boardComposer, swipeFileManager);
    InspireDocument.downloadAsFile(data, filename || this.title);
    return data;
  }

  exportVidFile(boardComposer, swipeFileManager, filename = null) {
    return this.downloadVidFile(boardComposer, swipeFileManager, filename);
  }

  static downloadAsFile(docData, filename = null) {
    const title = docData?.meta?.title || 'inspiration_board';
    const cleanName = (filename || title).replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') + '.vid';
    const jsonStr = JSON.stringify(docData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  static async parseVidFile(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('Invalid .vid file: not valid JSON.');
    }

    if (data.format !== VID_FORMAT_IDENTIFIER) {
      throw new Error(`Incompatible file format. Expected "${VID_FORMAT_IDENTIFIER}".`);
    }

    return data;
  }

  /**
   * Generates a clean empty moodboard document with nothing in the swipe file.
   * Default board color is white (#ffffff).
   */
  static createDefaultStarter() {
    return this.createBlank('Untitled-1');
  }

  static createBlank(title = 'Untitled-1', fileName = null) {
    const resolvedTitle = title || 'Untitled-1';
    const resolvedFileName = fileName || (resolvedTitle.endsWith('.vid') ? resolvedTitle : `${resolvedTitle}.vid`);
    return {
      format: VID_FORMAT_IDENTIFIER,
      version: VID_CURRENT_VERSION,
      meta: {
        id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: resolvedTitle,
        fileName: resolvedFileName,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      },
      board: {
        mode: 'fixed',
        preset: '16:9',
        width: 1920,
        height: 1080,
        background: '#ffffff',
        bgPattern: 'blank',
        gridSnap: true,
        elements: []
      },
      swipeFile: {
        items: [],
        tags: [],
        categories: [
          'All',
          'Pictures',
          'Quotes',
          'Written Copy',
          'Logos',
          'Color Palettes',
          'Photos',
          'General'
        ]
      }
    };
  }

  /**
   * Generates sample demo content for optional layout exploration
   */
  static createSampleDemo() {
    // Elegant Architectural & Minimal Editorial sample assets
    const sampleBoardElements = [
      {
        id: 'el_title_1',
        type: 'text',
        x: 80,
        y: 80,
        width: 600,
        height: 60,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        data: {
          text: 'NORDIC MINIMALISM & TEXTURES',
          fontFamily: 'Montserrat',
          fontSize: 32,
          fontWeight: '800',
          color: '#ffffff',
          letterSpacing: 3
        },
        tags: ['editorial', 'branding']
      },
      {
        id: 'el_quote_1',
        type: 'quote',
        x: 80,
        y: 170,
        width: 440,
        height: 250,
        rotation: 0,
        zIndex: 2,
        opacity: 1,
        data: {
          quote: 'Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.',
          author: 'Antoine de Saint-Exupéry',
          cite: 'Airman\'s Odyssey',
          fontFamily: 'Playfair Display',
          fontSize: 20,
          color: '#f8fafc',
          bg: '#1e2028',
          quoteStyle: 'editorial',
          radius: 12,
          shadow: 'soft'
        },
        tags: ['quote', 'minimal']
      },
      {
        id: 'el_img_1',
        type: 'image',
        x: 560,
        y: 80,
        width: 480,
        height: 380,
        rotation: -1,
        zIndex: 3,
        opacity: 1,
        data: {
          src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#2d3748"/>
                  <stop offset="50%" stop-color="#1a202c"/>
                  <stop offset="100%" stop-color="#111827"/>
                </linearGradient>
                <linearGradient id="warmSun" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8"/>
                  <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <rect width="800" height="600" fill="url(#g1)"/>
              <polygon points="120,600 360,180 500,600" fill="#374151" opacity="0.6"/>
              <polygon points="340,600 480,240 680,600" fill="#4b5563" opacity="0.7"/>
              <circle cx="640" cy="160" r="80" fill="url(#warmSun)"/>
              <rect x="0" y="550" width="800" height="50" fill="#1e293b"/>
              <line x1="80" y1="520" x2="720" y2="520" stroke="#f59e0b" stroke-width="2" opacity="0.6"/>
              <text x="400" y="320" font-family="sans-serif" font-size="28" fill="#e2e8f0" font-weight="600" text-anchor="middle" letter-spacing="4">ARCHITECTURAL HARMONY</text>
            </svg>
          `),
          title: 'Architectural Harmony',
          polaroid: false,
          radius: 12,
          shadow: 'soft',
          filter: 'none',
          fit: 'cover'
        },
        tags: ['photo', 'architecture']
      },
      {
        id: 'el_sticky_1',
        type: 'sticky',
        x: 1080,
        y: 90,
        width: 250,
        height: 250,
        rotation: 2.5,
        zIndex: 4,
        opacity: 1,
        data: {
          text: 'DESIGN CONCEPT:\n• Honest raw materials\n• Warm golden hour lighting\n• Negative space as structure\n• Uncoated paper texture',
          color: '#fef08a',
          tape: true,
          pin: false,
          font: 'handwriting'
        },
        tags: ['note', 'minimal']
      },
      {
        id: 'el_swatch_1',
        type: 'swatch',
        x: 80,
        y: 450,
        width: 140,
        height: 140,
        rotation: 0,
        zIndex: 5,
        opacity: 1,
        data: {
          hex: '#f59e0b',
          name: 'Amber Gold',
          label: 'Primary Accent'
        },
        tags: ['color']
      },
      {
        id: 'el_swatch_2',
        type: 'swatch',
        x: 230,
        y: 450,
        width: 140,
        height: 140,
        rotation: 0,
        zIndex: 6,
        opacity: 1,
        data: {
          hex: '#2b2d42',
          name: 'Midnight Slate',
          label: 'Deep Ground'
        },
        tags: ['color']
      },
      {
        id: 'el_swatch_3',
        type: 'swatch',
        x: 380,
        y: 450,
        width: 140,
        height: 140,
        rotation: 0,
        zIndex: 7,
        opacity: 1,
        data: {
          hex: '#e2d9cc',
          name: 'Soft Sand',
          label: 'Neutral Warm'
        },
        tags: ['color']
      },
      {
        id: 'el_img_2',
        type: 'image',
        x: 560,
        y: 490,
        width: 320,
        height: 280,
        rotation: 1,
        zIndex: 8,
        opacity: 1,
        data: {
          src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
              <rect width="600" height="600" fill="#e2d9cc"/>
              <circle cx="300" cy="300" r="220" fill="#d97706" opacity="0.3"/>
              <circle cx="300" cy="300" r="140" fill="#f59e0b" opacity="0.5"/>
              <path d="M 150 450 Q 300 200 450 450" stroke="#2b2d42" stroke-width="12" fill="none"/>
              <text x="300" y="520" font-family="serif" font-size="24" fill="#2b2d42" font-style="italic" text-anchor="middle">Form Following Light</text>
            </svg>
          `),
          title: 'Form & Silhouette',
          polaroid: true,
          radius: 4,
          shadow: 'soft',
          filter: 'warm',
          fit: 'cover'
        },
        tags: ['photo', 'minimal']
      },
      {
        id: 'el_sticky_2',
        type: 'sticky',
        x: 920,
        y: 490,
        width: 240,
        height: 240,
        rotation: -2,
        zIndex: 9,
        opacity: 1,
        data: {
          text: 'TYPOGRAPHY PAIRING:\nHeadlines: Montserrat 800\nQuotes: Playfair Display\nBody: Lora / Roboto',
          color: '#e9d5ff',
          tape: true,
          pin: false,
          font: 'handwriting'
        },
        tags: ['note', 'typography']
      }
    ];

    const sampleSwipeItems = [
      {
        id: 'sw_1',
        type: 'image',
        category: 'Photos',
        title: 'Architectural Geometric Façade',
        content: sampleBoardElements[2].data.src,
        tags: ['architecture', 'minimal', 'textures'],
        colors: ['#2d3748', '#f59e0b', '#1a202c'],
        addedAt: new Date().toISOString()
      },
      {
        id: 'sw_2',
        type: 'quote',
        category: 'Quotes',
        title: 'Saint-Exupéry on Simplicity',
        content: '“Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.” — Antoine de Saint-Exupéry',
        tags: ['minimal', 'quote', 'editorial'],
        colors: ['#f8fafc', '#1e2028'],
        addedAt: new Date().toISOString()
      },
      {
        id: 'sw_3',
        type: 'color',
        category: 'Color Palettes',
        title: 'Nordic Sunlight Palette',
        content: '#f59e0b, #2b2d42, #e2d9cc, #ffffff',
        tags: ['warm', 'minimal', 'gold'],
        colors: ['#f59e0b', '#2b2d42', '#e2d9cc'],
        addedAt: new Date().toISOString()
      },
      {
        id: 'sw_4',
        type: 'text',
        category: 'Written Copy',
        title: 'Manifesto for Clean Spaces',
        content: 'Space is not the absence of content. It is the breathing room that gives every idea its gravity and purpose.',
        tags: ['editorial', 'copy'],
        colors: ['#e2e8f0'],
        addedAt: new Date().toISOString()
      }
    ];

    return {
      format: VID_FORMAT_IDENTIFIER,
      version: VID_CURRENT_VERSION,
      meta: {
        id: 'starter_doc',
        title: 'Nordic Architecture & Editorial',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      },
      board: {
        mode: 'fixed',
        preset: '16:9',
        width: 1920,
        height: 1080,
        background: '#14161b',
        bgPattern: 'dots',
        gridSnap: true,
        elements: sampleBoardElements
      },
      swipeFile: {
        items: sampleSwipeItems,
        tags: ['architecture', 'minimal', 'textures', 'quote', 'editorial', 'warm', 'gold', 'typography', 'branding'],
        categories: [
          'All',
          'Photos',
          'Quotes',
          'Written Copy',
          'Logos & Graphics',
          'Color Palettes',
          'Sticky Notes'
        ]
      }
    };
  }
}
