const originals = new WeakMap();
let measurement;
export function unionBounds(boxes) {
  if (!boxes.length) return {x:0,y:0,width:0,height:0};
  const x=Math.min(...boxes.map(b=>b.x)), y=Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
function localMatrix(el) {
  let m=new DOMMatrix();
  for(let i=0;i<el.transform.baseVal.numberOfItems;i++) {
    const t=el.transform.baseVal.getItem(i).matrix;
    m=m.multiply(new DOMMatrix([t.a,t.b,t.c,t.d,t.e,t.f]));
  }
  return m;
}
export function transformBounds(b,m) {
  const pts=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
  return unionBounds(pts.map(p=>({...p,width:0,height:0})));
}
export function installPathTextBounds(root) {
  const nativeBox = el => {
    if (el.hasAttribute('data-visteras-top-source')) {
      // display:none geometry has a zero bbox in Chromium. Measure a clean
      // temporary copy outside the artwork and its history/observers.
      if (!measurement?.isConnected) {
        measurement=document.createElementNS('http://www.w3.org/2000/svg','svg');
        measurement.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
        document.body.append(measurement);
      }
      const copy=el.cloneNode(true);
      for(const attr of ['id','class','style','display','transform','data-visteras-top-source'])copy.removeAttribute(attr);
      measurement.append(copy);
      try {return copy.getBBox();} finally {copy.remove();}
    }
    return (originals.get(el) || el.getBBox).call(el);
  };
  const bounds = el => {
    const tp=el.localName==='text' && el.querySelector('textPath');
    if(tp) {
      const id=(tp.getAttribute('href')||tp.getAttributeNS('http://www.w3.org/1999/xlink','href')||'').slice(1);
      const path=el.ownerDocument.getElementById(id);
      if(path) return transformBounds(nativeBox(path),localMatrix(path));
    }
    if(el.localName==='g' && el.querySelector('textPath')) {
      const boxes=[];
      for(const child of el.children) {
        if(!child.getBBox || child.localName==='defs' || child.hasAttribute('data-visteras-top-source') || getComputedStyle(child).display==='none') continue;
        boxes.push(transformBounds(bounds(child),localMatrix(child)));
      }
      return unionBounds(boxes);
    }
    return nativeBox(el);
  };
  for(const tp of root.querySelectorAll('textPath')) {
    let el=tp.closest('text');
    while(el && el!==root) {
      if(el.getBBox && !originals.has(el)) {
        originals.set(el,el.getBBox);
        el.getBBox=function(){return bounds(this);};
      }
      el=el.parentElement;
    }
  }
}
