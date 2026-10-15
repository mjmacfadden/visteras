/** Envelope data is native SVG metadata; no browser globals or storage. */
export const ENV = 'data-visteras-envelope';
export const SRC = `${ENV}-src`, OUT = `${ENV}-out`;
export const STYLES = ['arc','arcLower','arcUpper','arch','bulge','shellLower','shellUpper','flag','wave','fish','rise','fisheye','inflate','squeeze','twist'];
const finite = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
export function normalizeParams(p = {}) {
  return {...p, style: STYLES.includes(p.style) ? p.style : 'arc', dir:p.dir === 'v' ? 'v':'h',
    bend:finite(p.bend ?? 50,50,-100,100), dh:finite(p.dh ?? 0,0,-100,100), dv:finite(p.dv ?? 0,0,-100,100)};
}
export function normalizeOpts(o = {}) {
  return {...o, aa:o.aa !== false, preserve:o.preserve === 'alpha' ? 'alpha':'clip', fidelity:finite(o.fidelity ?? 50,50,0,100),
    appearance:o.appearance !== false, linGrad:false, pattern:false};
}
export const isEnvelope = el => el?.getAttribute?.(ENV) === 'warp';
export function isEnvelopeSource(node) {
  for (let n = node; n; n = n.parentNode) if (n.hasAttribute?.(SRC)) return true;
  return false;
}
export const envelopePart = (el, attr) => [...(el?.children || [])].find(n => n.hasAttribute(attr));
const parse = text => {try {const value=JSON.parse(text);return value && typeof value === 'object' && !Array.isArray(value) ? value:{};} catch {return {};}};
export function readEnvelope(el) {
  if (!isEnvelope(el)) return null;
  return {params:normalizeParams(parse(el.getAttribute(`${ENV}-params`))), opts:normalizeOpts(parse(el.getAttribute(`${ENV}-opts`))),
    bbox:(el.getAttribute(`${ENV}-bbox`) || '').split(/\s+/).map(Number), src:envelopePart(el,SRC), out:envelopePart(el,OUT)};
}
export function canEnvelope(elements) {
  return elements.length > 0 && elements.every(el => {
    if (!/^(path|rect|circle|ellipse|line|polyline|polygon|g|text|image)$/.test(el.localName) || isEnvelope(el) || isEnvelopeSource(el)) return false;
    for (let n=el;n;n=n.parentNode) {
      if (n.getAttribute?.('display') === 'none' || n.style?.display === 'none' || n.getAttribute?.('visibility') === 'hidden' ||
          n.getAttribute?.('data-visteras-locked') === '1' || n.getAttribute?.('data-locked') === 'true' ||
          n.getAttribute?.('data-visteras-hidden') === '1' || n.hasAttribute?.('data-visteras-guide')) return false;
    }
    return !el.querySelector?.('use, [data-visteras-envelope]');
  });
}
/** Stable content checksum, not a security hash. Source IDs are preserved. */
export function envelopeHash(el) {
  const data = readEnvelope(el); if (!data) return '';
  const canonical = node => {
    if (node.nodeType === 3) return node.nodeValue.trim() || null;
    if (!node.localName) return null;
    // IDs are excluded: SVG-Edit assigns ids to id-less nodes on load, which must not mark output stale.
    const attrs = [...node.attributes].filter(a=>a.name!=='style' && a.name!=='id').map(a=>[a.name,a.value]);
    // SVGEdit adds transient hit-testing styles and normalizes style order on save.
    const style=(node.getAttribute('style') || '').split(';').map(x=>x.trim()).filter(x=>x && !x.startsWith('pointer-events')).sort().join(';');
    if(style) attrs.push(['style',style]);
    attrs.sort((a,b)=>a[0].localeCompare(b[0]));
    return [node.localName,attrs,[...node.childNodes].map(canonical).filter(x=>x!==null)];
  };
  const value=JSON.stringify([data.params,data.opts,data.bbox,data.src ? canonical(data.src) : null]);
  let hash=2166136261; for(let i=0;i<value.length;i++) hash=Math.imul(hash ^ value.charCodeAt(i),16777619);
  return (hash>>>0).toString(16);
}
