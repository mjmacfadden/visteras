/**
 * Visteras Vector — vector PDF export (Illustrator-style).
 *
 * One page per artboard, page size = artboard size (pt ≈ px at 72 ppi).
 * Uses on-demand jsPDF + svg2pdf (apps/vector/lib/). Falls back to a
 * raster page when svg2pdf cannot paint an artboard (e.g. unsupported
 * filter primitives); callers get a warning string per fallback.
 */

const JSPDF_SRC = './lib/jspdf.umd.min.js?v=pdf-1';
const SVG2PDF_SRC = './lib/svg2pdf.umd.min.js?v=pdf-1';

/** Page size in PDF points (1 pt = 1 CSS px at 72 ppi, matching Illustrator). */
export function pdfPageSize(board) {
  const w = Math.max(1, Number(board?.width) || 0);
  const h = Math.max(1, Number(board?.height) || 0);
  return { width: Math.round(w * 1000) / 1000, height: Math.round(h * 1000) / 1000 };
}

/** Specs for a multi-page PDF: one entry per artboard, in export order. */
export function pdfPageSpecs(boards) {
  return (boards || []).map((b, i) => {
    const size = pdfPageSize(b);
    return {
      index: i,
      name: String(b?.name || `Artboard ${i + 1}`),
      width: size.width,
      height: size.height,
      orientation: size.width >= size.height ? 'landscape' : 'portrait',
    };
  });
}

/**
 * Heuristic: a PDF that contains content streams with path operators (m/l/c/re)
 * or embedded fonts, and is not only a single full-page image. Used by tests.
 */
export function looksLikeVectorPdf(bytes) {
  const text = typeof bytes === 'string' ? bytes : new TextDecoder('latin1').decode(bytes);
  if (!text.startsWith('%PDF-')) return false;
  const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  if (pages < 1) return false;
  const hasPath = /[^a-z](m|l|c|v|y|h|re)\s/.test(text) || /\/Font\b/.test(text) || /\/Subtype\s*\/Type1/.test(text);
  const imageOnly = /\/Subtype\s*\/Image/.test(text) && !hasPath;
  return hasPath && !imageOnly;
}

export function countPdfPages(bytes) {
  const text = typeof bytes === 'string' ? bytes : new TextDecoder('latin1').decode(bytes);
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

function loadScript(src) {
  return new Promise((ok, bad) => {
    const existing = document.querySelector(`script[data-visteras-pdf="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return ok();
      existing.addEventListener('load', () => ok());
      existing.addEventListener('error', () => bad(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.visterasPdf = src;
    s.onload = () => { s.dataset.loaded = '1'; ok(); };
    s.onerror = () => bad(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

let loadPromise = null;
/** Load jsPDF + svg2pdf once. Returns the jsPDF constructor. */
export async function loadJsPdf() {
  if (typeof window === 'undefined') throw new Error('PDF export needs a browser');
  if (window.jspdf?.jsPDF?.API?.svg) return window.jspdf.jsPDF;
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadScript(JSPDF_SRC);
      await loadScript(SVG2PDF_SRC);
      const Ctor = window.jspdf?.jsPDF;
      if (!Ctor || typeof Ctor.API?.svg !== 'function') {
        throw new Error('jsPDF svg plugin did not register');
      }
      return Ctor;
    })().catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}

function parseSvg(svg) {
  if (svg && typeof svg === 'object' && svg.nodeType === 1) return svg;
  const doc = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.querySelector('parsererror') || root.localName?.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG for PDF export');
  }
  return root;
}

/**
 * Build one multi-page PDF blob.
 * @param {{ pages: { svg: string|Element, width: number, height: number, name?: string }[], title?: string, rasterFallback?: (page) => Promise<Blob|null> }} opts
 * @returns {Promise<{ blob: Blob, pageCount: number, pageSizes: {width:number,height:number}[], warnings: string[], vector: boolean }>}
 */
export async function buildArtboardPdf({ pages, title = 'Untitled', rasterFallback = null } = {}) {
  if (!pages?.length) throw new Error('Nothing to export');
  const specs = pdfPageSpecs(pages);
  const JsPDF = await loadJsPdf();
  const first = specs[0];
  const pdf = new JsPDF({
    orientation: first.orientation,
    unit: 'pt',
    format: [first.width, first.height],
    compress: true,
  });
  try { pdf.setProperties({ title: String(title || 'Untitled') }); } catch { /* ignore */ }

  const warnings = [];
  let anyVector = false;
  let anyRaster = false;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const spec = specs[i];
    if (i > 0) pdf.addPage([spec.width, spec.height], spec.orientation);
    try {
      const el = parseSvg(page.svg);
      // Position at 0,0; size matches the page so 1 SVG unit = 1 pt.
      el.setAttribute('width', String(spec.width));
      el.setAttribute('height', String(spec.height));
      await pdf.svg(el, { x: 0, y: 0, width: spec.width, height: spec.height });
      anyVector = true;
    } catch (err) {
      anyRaster = true;
      warnings.push(`Artboard "${spec.name}" used a raster fallback (${err?.message || err})`);
      if (typeof rasterFallback === 'function') {
        const blob = await rasterFallback(page);
        if (blob) {
          const url = URL.createObjectURL(blob);
          try {
            const dataUrl = await new Promise((ok, bad) => {
              const fr = new FileReader();
              fr.onload = () => ok(fr.result);
              fr.onerror = bad;
              fr.readAsDataURL(blob);
            });
            pdf.addImage(dataUrl, 'PNG', 0, 0, spec.width, spec.height);
          } finally {
            URL.revokeObjectURL(url);
          }
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  const ab = pdf.output('arraybuffer');
  const bytes = new Uint8Array(ab);
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    pageCount: specs.length,
    pageSizes: specs.map((s) => ({ width: s.width, height: s.height })),
    warnings,
    vector: anyVector && !anyRaster ? true : anyVector,
    mixed: anyVector && anyRaster,
  };
}
