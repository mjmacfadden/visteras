/**
 * Visteras Vector — Type ▸ Create Outlines (⇧⌘O / Shift+Ctrl+O)
 * and Path ▸ Convert to Path (Gravit Designer parity).
 *
 * Converts live SVG <text> elements (point text, area text, and textPath)
 * into precise vector <path> outlines matching Illustrator and Gravit behavior.
 * Preserves all visual styling (fill, stroke, opacity, transform, filters),
 * wraps glyphs in a grouped outline (<g class="visteras-text-outlines">) with
 * fill-rule="evenodd", and operates within a single undoable BatchCommand.
 */

const NS = 'http://www.w3.org/2000/svg';

let opentypeLib = null;
const fontCache = new Map();

/**
 * Initializes and retrieves the OpenType.js instance.
 */
export async function getOpenType() {
  if (opentypeLib) return opentypeLib;
  if (typeof globalThis !== 'undefined' && globalThis.opentype) {
    opentypeLib = globalThis.opentype;
    return opentypeLib;
  }
  try {
    const mod = await import('../lib/opentype.min.js');
    opentypeLib = mod.default || mod;
    return opentypeLib;
  } catch (_) {
    try {
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      opentypeLib = req('../lib/opentype.min.js');
      return opentypeLib;
    } catch (e) {
      console.warn('OpenType library could not be loaded:', e);
      return null;
    }
  }
}

/**
 * Normalizes CSS font-weight (names or numbers) to standard weight string (300, 400, 700, 900).
 */
export function normalizeFontWeight(weight) {
  if (!weight) return '400';
  const str = String(weight).trim().toLowerCase();
  if (str === 'bold' || str === 'bolder') return '700';
  if (str === 'normal') return '400';
  if (str === 'lighter') return '300';
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    if (num <= 350) return '300';
    if (num <= 550) return '400';
    if (num <= 750) return '700';
    return '900';
  }
  return '400';
}

/**
 * Normalizes CSS font-style to 'normal' or 'italic'.
 */
export function normalizeFontStyle(style) {
  if (!style) return 'normal';
  const str = String(style).trim().toLowerCase();
  if (str === 'italic' || str === 'oblique') return 'italic';
  return 'normal';
}

/**
 * Robustly reads font-weight from element attributes or computed style.
 */
export function getElementFontWeight(el) {
  const attr = el.getAttribute?.('font-weight');
  if (attr) return attr;
  const styleWeight = el.style?.fontWeight;
  if (styleWeight) return styleWeight;
  const styleAttr = el.getAttribute?.('style') || '';
  const match = styleAttr.match(/font-weight\s*:\s*([^;]+)/i);
  if (match) return match[1].trim();
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    try {
      const computed = window.getComputedStyle(el).fontWeight;
      if (computed) return computed;
    } catch (_) {}
  }
  return '400';
}

/**
 * Robustly reads font-style from element attributes or computed style.
 */
export function getElementFontStyle(el) {
  const attr = el.getAttribute?.('font-style');
  if (attr) return attr;
  const styleVal = el.style?.fontStyle;
  if (styleVal) return styleVal;
  const styleAttr = el.getAttribute?.('style') || '';
  const match = styleAttr.match(/font-style\s*:\s*([^;]+)/i);
  if (match) return match[1].trim();
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    try {
      const computed = window.getComputedStyle(el).fontStyle;
      if (computed) return computed;
    } catch (_) {}
  }
  return 'normal';
}

/**
 * Loads a TrueType / OpenType font binary and parses it with OpenType.js.
 */
export async function loadFont(family = 'Roboto', weight = '400', style = 'normal') {
  const normFamily = (family || 'Roboto').replace(/['"]/g, '').split(',')[0].trim();
  const normWeight = normalizeFontWeight(weight);
  const normStyle = normalizeFontStyle(style);
  const cacheKey = `${normFamily.toLowerCase()}_${normWeight}_${normStyle}`;
  if (fontCache.has(cacheKey)) {
    return fontCache.get(cacheKey);
  }

  const ot = await getOpenType();
  if (!ot) return null;

  // 1. Try bundled clean static Roboto font files
  const isRoboto =
    normFamily.toLowerCase() === 'roboto' ||
    normFamily.toLowerCase() === 'sans-serif' ||
    normFamily.toLowerCase() === 'default';

  if (isRoboto) {
    let fileName = `roboto-${normWeight}.woff`;
    if (normStyle === 'italic') {
      fileName = (normWeight === '700' || normWeight === '900') ? 'roboto-700-italic.woff' : 'roboto-400-italic.woff';
    } else if (normWeight === '900') {
      fileName = 'roboto-900.woff';
    } else if (normWeight === '700') {
      fileName = 'roboto-700.woff';
    } else if (normWeight === '300') {
      fileName = 'roboto-300.woff';
    } else {
      fileName = 'roboto-400.woff';
    }

    try {
      let buf = null;
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        const fontUrl = new URL(`../lib/fonts/${fileName}`, import.meta.url).href;
        let res = await fetch(fontUrl).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`./lib/fonts/${fileName}`).catch(() => null);
        }
        if (res && res.ok) buf = await res.arrayBuffer();
      } else {
        // Node environment
        const fs = await import('node:fs');
        const fontUrl = new URL(`../lib/fonts/${fileName}`, import.meta.url);
        buf = fs.readFileSync(fontUrl).buffer;
      }
      if (buf) {
        const font = ot.parse(buf);
        fontCache.set(cacheKey, font);
        return font;
      }
    } catch (err) {
      console.warn(`Could not load bundled ${fileName}:`, err);
    }
  }

  // 2. Try fetching from Google Fonts (or web) if in browser
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    try {
      const isItalic = normStyle === 'italic';
      const weightNum = parseInt(normWeight, 10) || 400;
      const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(normFamily)}:ital,wght@${isItalic ? 1 : 0},${weightNum}`;
      const cssRes = await fetch(cssUrl);
      if (cssRes.ok) {
        const cssText = await cssRes.text();
        const match = cssText.match(/src:\s*url\((https:[^)]+)\)\s*format\(['"]?(?:truetype|opentype|woff2?)['"]?\)/i);
        if (match && match[1]) {
          const fontRes = await fetch(match[1]);
          if (fontRes.ok) {
            const fontBuf = await fontRes.arrayBuffer();
            const font = ot.parse(fontBuf);
            fontCache.set(cacheKey, font);
            return font;
          }
        }
      }
    } catch (_) {
      // Offline or network error
    }
  }

  // 3. Fallback to bundled Roboto with matching weight (Bold stays Bold!)
  if (normWeight === '700' || normWeight === '900') {
    return loadFont('Roboto', '700', normStyle);
  }
  return loadFont('Roboto', '400', normStyle);
}

/**
 * Checks whether an element is an SVG <text> element.
 */
export function isTextElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = (el.tagName || el.localName || '').toLowerCase();
  return tag === 'text';
}

/**
 * Checks whether any element in the given collection can be converted to outlines.
 */
export function canCreateOutlines(elements) {
  if (!elements || !elements.length) return false;
  for (const el of elements) {
    if (isTextElement(el)) return true;
    if (el.querySelector?.('text')) return true;
  }
  return false;
}

/**
 * Rotates and translates 2D path commands (used for Text on Path).
 */
function transformCommands(commands, cos, sin, tx, ty) {
  const transformPoint = (x, y) => ({
    x: x * cos - y * sin + tx,
    y: x * sin + y * cos + ty,
  });

  let d = '';
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      const p = transformPoint(cmd.x, cmd.y);
      d += `M${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    } else if (cmd.type === 'L') {
      const p = transformPoint(cmd.x, cmd.y);
      d += `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    } else if (cmd.type === 'C') {
      const p1 = transformPoint(cmd.x1, cmd.y1);
      const p2 = transformPoint(cmd.x2, cmd.y2);
      const p = transformPoint(cmd.x, cmd.y);
      d += `C${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    } else if (cmd.type === 'Q') {
      const p1 = transformPoint(cmd.x1, cmd.y1);
      const p = transformPoint(cmd.x, cmd.y);
      d += `Q${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    } else if (cmd.type === 'Z') {
      d += 'Z';
    }
  }
  return d;
}

/**
 * Merges overlapping component contours within a glyph into a single clean contour.
 * Variable fonts (or certain TTF/OTF fonts) construct glyphs with overlapping sub-paths
 * (e.g. stem and arch). When outlined, these appear as overlapping lines unless united.
 */
export function cleanGlyphPath(pathData) {
  if (!pathData || typeof pathData !== 'string') return pathData;
  const zMatches = pathData.match(/[zZ]/g);
  if (!zMatches || zMatches.length <= 1) return pathData;
  if (typeof window === 'undefined' || !window.paper) return pathData;

  try {
    const paper = window.paper;
    const scope = new paper.PaperScope();
    scope.setup(new paper.Size(2000, 2000));
    const item = scope.project.importSVG(`<path d="${pathData}" fill-rule="evenodd" />`, { expandShapes: true, insert: false });
    if (!item) return pathData;

    let united = null;
    const parts = item.children ? [...item.children] : [item];
    if (parts.length > 1) {
      united = parts.reduce((acc, p) => {
        if (!acc) return p;
        try {
          return acc.unite(p, { insert: false });
        } catch (_) {
          return acc;
        }
      }, null);
    } else if (typeof item.unite === 'function') {
      united = item.unite(item, { insert: false });
    }

    if (united && united.pathData && united.pathData.length > 0) {
      return united.pathData;
    }
  } catch (_) {
    // Fallback to original pathData on any error
  }
  return pathData;
}

/**
 * Extracts individual glyph paths for a line of text using OpenType.
 */
export function extractGlyphPaths(font, text, startX, startY, fontSize, options = {}) {
  if (!font || !text) return [];
  const { letterSpacing = 0, anchor = 'start' } = options;
  const glyphs = font.stringToGlyphs(text);
  const scale = fontSize / font.unitsPerEm;

  // Measure total advance width to handle SVG text-anchor
  let totalAdvance = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    let kerning = 0;
    if (i < glyphs.length - 1) {
      kerning = font.getKerningValue(g, glyphs[i + 1]) * scale;
    }
    totalAdvance += (g.advanceWidth * scale) + letterSpacing + kerning;
  }

  let curX = startX;
  if (anchor === 'middle' || anchor === 'center') {
    curX -= totalAdvance / 2;
  } else if (anchor === 'end' || anchor === 'right') {
    curX -= totalAdvance;
  }

  const results = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const char = text[i];
    let kerning = 0;
    if (i < glyphs.length - 1) {
      kerning = font.getKerningValue(g, glyphs[i + 1]) * scale;
    }

    // Skip whitespace glyphs with no visible paths
    if (char !== ' ' && char !== '\t' && char !== '\n') {
      const p = g.getPath(curX, startY, fontSize);
      const d = p.toPathData(2);
      if (d && d.trim().length > 0) {
        results.push({
          char,
          d,
          x: curX,
          y: startY,
          commands: p.commands,
        });
      }
    }

    curX += (g.advanceWidth * scale) + letterSpacing + kerning;
  }

  return results;
}

/**
 * Converts a single SVG <text> element to a vector <g> or <path> element.
 */
export async function convertTextToOutlines(textElem, doc = document) {
  if (!isTextElement(textElem)) return null;

  // Extract font attributes with accurate bold / weight tracking
  const rawFamily = textElem.getAttribute('font-family') || 'Roboto';
  const family = rawFamily.replace(/['"]/g, '').split(',')[0].trim();
  const weight = getElementFontWeight(textElem);
  const style = getElementFontStyle(textElem);
  const fontSize = parseFloat(textElem.getAttribute('font-size')) || 24;
  const letterSpacing = parseFloat(textElem.getAttribute('letter-spacing')) || 0;
  const defaultAnchor = textElem.getAttribute('text-anchor') || 'start';

  const font = await loadFont(family, weight, style);
  if (!font) {
    console.warn(`Font "${family}" could not be loaded for Create Outlines.`);
    return null;
  }

  const allGlyphs = [];
  const textPathElem = textElem.querySelector?.('textPath');

  if (textPathElem && typeof textElem.getStartPositionOfChar === 'function') {
    // Text on Path with browser DOM metric support
    const rawText = textPathElem.textContent || '';
    for (let i = 0; i < rawText.length; i++) {
      const ch = rawText[i];
      if (ch === ' ' || ch === '\t') continue;
      try {
        const pt = textElem.getStartPositionOfChar(i);
        const rotDeg = textElem.getRotationOfChar?.(i) || 0;
        const rotRad = (rotDeg * Math.PI) / 180;
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);

        const glyph = font.charToGlyph(ch);
        const p = glyph.getPath(0, 0, fontSize);
        const d = transformCommands(p.commands, cos, sin, pt.x, pt.y);
        if (d) {
          allGlyphs.push({ char: ch, d, x: pt.x, y: pt.y });
        }
      } catch (_) {
        // Fallback to normal layout if character metrics fail
      }
    }
  }

  if (!allGlyphs.length) {
    // Process child tspans (e.g. area text or multi-line text) or plain text
    const tspans = [...(textElem.querySelectorAll?.('tspan') || [])];
    if (tspans.length > 0) {
      for (const ts of tspans) {
        const lineText = ts.textContent || '';
        if (!lineText) continue;
        const x = parseFloat(ts.getAttribute('x') || textElem.getAttribute('x') || '0');
        const y = parseFloat(ts.getAttribute('y') || textElem.getAttribute('y') || '0');
        const lineSize = parseFloat(ts.getAttribute('font-size')) || fontSize;
        const lineAnchor = ts.getAttribute('text-anchor') || defaultAnchor;
        const lineGlyphs = extractGlyphPaths(font, lineText, x, y, lineSize, {
          letterSpacing,
          anchor: lineAnchor,
        });
        allGlyphs.push(...lineGlyphs);
      }
    } else {
      // Single line text
      const lineText = textElem.textContent || '';
      const x = parseFloat(textElem.getAttribute('x') || '0');
      const y = parseFloat(textElem.getAttribute('y') || '0');
      const lineGlyphs = extractGlyphPaths(font, lineText, x, y, fontSize, {
        letterSpacing,
        anchor: defaultAnchor,
      });
      allGlyphs.push(...lineGlyphs);
    }
  }

  if (!allGlyphs.length) return null;

  // Build the group container
  const group = doc.createElementNS(NS, 'g');
  group.setAttribute('class', 'visteras-text-outlines');
  group.setAttribute('data-visteras-converted-text', textElem.textContent?.trim() || '');

  // Transfer all visual attributes
  const inheritAttrs = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-opacity',
    'opacity',
    'transform',
    'filter',
    'clip-path',
    'mask',
  ];

  for (const attr of inheritAttrs) {
    const val = textElem.getAttribute(attr);
    if (val !== null && val !== undefined) {
      group.setAttribute(attr, val);
    }
  }

  // Default fill to black/currentColor if unspecified (SVG text defaults to black)
  if (!group.getAttribute('fill') && !textElem.getAttribute('fill')) {
    group.setAttribute('fill', textElem.style?.fill || '#000000');
  }

  // Fill-rule: evenodd is mandatory for glyph counters (holes in B, O, A, 8, etc.)
  group.setAttribute('fill-rule', textElem.getAttribute('fill-rule') || 'evenodd');

  // Preserve ID on the converted group
  const origId = textElem.getAttribute('id');
  if (origId) group.setAttribute('id', origId);

  // Check if text has a gradient fill (linearGradient or radialGradient)
  const fillAttr = textElem.getAttribute('fill') || textElem.style?.fill || group.getAttribute('fill') || '';
  const hasGradient = fillAttr.includes('url(') || textElem.hasAttribute('data-gradient') || group.hasAttribute('data-gradient');

  if (hasGradient) {
    // When text has a gradient, all glyphs must be in a single compound path
    // so gradientUnits="objectBoundingBox" spans across the ENTIRE text continuously.
    const compoundPath = doc.createElementNS(NS, 'path');
    compoundPath.setAttribute('d', allGlyphs.map((g) => cleanGlyphPath(g.d)).join(' '));
    compoundPath.setAttribute('class', 'visteras-glyph visteras-glyph-compound');
    compoundPath.setAttribute('data-char', textElem.textContent || '');
    if (origId) compoundPath.setAttribute('id', `${origId}_0`);
    group.append(compoundPath);
  } else {
    // For solid fills, append individual glyph paths for discrete selection & editing
    let glyphIdx = 0;
    for (const item of allGlyphs) {
      const cleanD = cleanGlyphPath(item.d);
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute('d', cleanD);
      path.setAttribute('class', 'visteras-glyph');
      path.setAttribute('data-char', item.char);
      if (origId) {
        path.setAttribute('id', `${origId}_${glyphIdx++}`);
      }
      group.append(path);
    }
  }

  return group;
}

/**
 * Converts all selected live <text> elements into vector outlines within a single history batch.
 *
 * @param {object} sc - SVGCanvas instance
 * @param {Element[]} [elements] - Optional target elements (defaults to current selection)
 * @returns {Promise<Element[]|null>} Array of created outline elements, or null
 */
export async function createOutlines(sc, elements = null) {
  if (!sc) return null;
  const targets = (elements || sc.getSelectedElements?.() || []).filter(Boolean);
  const textElems = [];

  for (const el of targets) {
    if (isTextElement(el)) {
      textElems.push(el);
    } else if (el.querySelectorAll) {
      const nested = [...el.querySelectorAll('text')];
      textElems.push(...nested);
    }
  }

  if (!textElems.length) return null;

  const doc = sc.doc || (typeof document !== 'undefined' ? document : null);
  const { BatchCommand, RemoveElementCommand, InsertElementCommand } = sc.history || {};
  const batch = BatchCommand ? new BatchCommand('Create Outlines') : null;

  const newGroups = [];

  for (const textElem of textElems) {
    const parent = textElem.parentNode;
    if (!parent) continue;
    const nextSibling = textElem.nextSibling;

    const group = await convertTextToOutlines(textElem, doc);
    if (!group) continue;

    // 1. Remove text element
    textElem.remove();
    if (batch && RemoveElementCommand) {
      batch.addSubCommand(new RemoveElementCommand(textElem, nextSibling, parent));
    }

    // 2. Insert new outline group in its place
    parent.insertBefore(group, nextSibling);
    if (batch && InsertElementCommand) {
      batch.addSubCommand(new InsertElementCommand(group));
    }

    newGroups.push(group);
  }

  if (!newGroups.length) return null;

  if (batch) sc.addCommandToHistory(batch);

  sc.clearSelection?.();
  sc.addToSelection?.(newGroups, true);
  sc.call?.('changed', newGroups);

  return newGroups;
}

/**
 * Universal "Convert to Path" action (Gravit Designer parity).
 * Converts basic shapes via sc.convertToPath and text via createOutlines.
 */
export async function convertSelectionToPath(sc, elements = null) {
  if (!sc) return null;
  const targets = (elements || sc.getSelectedElements?.() || []).filter(Boolean);
  if (!targets.length) return null;

  const texts = targets.filter(isTextElement);
  const shapes = targets.filter((el) => !isTextElement(el));

  const results = [];

  // Convert shapes first
  for (const s of shapes) {
    if (typeof sc.convertToPath === 'function') {
      const res = sc.convertToPath(s);
      if (res) results.push(res);
    }
  }

  // Convert text elements
  if (texts.length) {
    const outlines = await createOutlines(sc, texts);
    if (outlines) results.push(...outlines);
  }

  return results;
}

/**
 * Mounts Type ▸ Create Outlines and Convert to Path in the Vector interface.
 */
export function mountTextOutlines(editor) {
  const sc = editor?.svgCanvas;
  if (!sc) return null;

  const actionOutlines = document.getElementById?.('action_create_outlines');
  const toPathBtn = document.getElementById?.('tool_topath');

  const syncUI = () => {
    const sel = (sc.getSelectedElements?.() || []).filter(Boolean);
    const hasText = canCreateOutlines(sel);
    if (actionOutlines) {
      actionOutlines.classList.toggle('disabled', !hasText);
    }
    // Update "Convert to Path" tool visibility when text is selected
    if (toPathBtn && sel.length === 1) {
      const tag = (sel[0].tagName || sel[0].localName || '').toLowerCase();
      if (tag === 'text') {
        toPathBtn.style.display = 'inline-flex';
      }
    }
  };

  actionOutlines?.addEventListener('click', async () => {
    await createOutlines(sc);
    syncUI();
  });

  // Delegate sc.convertToPath to createOutlines when called on text elements
  const origConvertToPath = sc.convertToPath;
  if (origConvertToPath) {
    sc.convertToPath = function (elem, ...args) {
      const target = elem || sc.getSelectedElements?.()[0];
      if (target && isTextElement(target)) {
        return createOutlines(sc, [target]);
      }
      return origConvertToPath.apply(this, [elem, ...args]);
    };
  }

  // Keep menu and tool state updated with canvas selection
  const origCall = sc.call;
  sc.call = function (event, ...args) {
    const result = origCall.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') {
      syncUI();
    }
    return result;
  };

  syncUI();

  window.__visterasTextOutlines = {
    createOutlines: (sel) => createOutlines(sc, sel),
    convertSelectionToPath: (sel) => convertSelectionToPath(sc, sel),
    canCreateOutlines: () => canCreateOutlines(sc.getSelectedElements?.() || []),
    syncUI,
  };

  return window.__visterasTextOutlines;
}
