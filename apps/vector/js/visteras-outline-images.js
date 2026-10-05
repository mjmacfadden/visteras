/** Display-only image perimeters, outside exported SVG artwork. */
export function mountOutlineImages(editor) {
  const sc = editor.svgCanvas, area = document.getElementById('workarea');
  const ns = 'http://www.w3.org/2000/svg';
  let layer, pending = false, observed;
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(render); }
  }
  const observer = new MutationObserver(schedule);
  function render() {
    pending = false;
    const content = sc.getSvgContent();
    if (content !== observed) {
      observer.disconnect(); observed = content;
      if (content) observer.observe(content, { subtree: true, attributes: true, childList: true });
    }
    layer?.remove(); layer = null;
    if (!content || !area.classList.contains('wireframe')) return;
    const host = document.getElementById('selectorParentGroup');
    if (!host) return;
    layer = document.createElementNS(ns, 'g');
    layer.id = 'visteras-outline-images';
    layer.setAttribute('pointer-events', 'none');
    host.prepend(layer);
    const matrix = layer.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse();
    for (const image of content.querySelectorAll('image')) {
      if (image.closest('defs,pattern,mask,clipPath,symbol')) continue;
      let hidden = false;
      for (let el = image; el && el !== content; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') { hidden = true; break; }
      }
      if (hidden) continue;
      const screen = image.getScreenCTM();
      if (!screen) continue;
      const { x, y, width, height } = image.getBBox();
      const transform = inverse.multiply(screen);
      const points = [[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([x,y]) => {
        const p = new DOMPoint(x,y).matrixTransform(transform);
        return `${p.x},${p.y}`;
      }).join(' ');
      const outline = document.createElementNS(ns, 'polygon');
      for (const [key,value] of Object.entries({ points, fill:'none', stroke:'#000000', 'stroke-width':'.75', 'vector-effect':'non-scaling-stroke' })) outline.setAttribute(key,value);
      layer.append(outline);
    }
  }
  new MutationObserver(schedule).observe(area, { attributes:true, attributeFilter:['class'] });
  const update = editor.updateWireFrame;
  editor.updateWireFrame = function (...args) { const result = update.apply(this,args); schedule(); return result; };
  sc.bind?.('changed', schedule);
  window.addEventListener('resize', schedule);
  schedule();
}
