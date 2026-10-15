import {fakeEl, fakeCanvas} from './fake-svg.mjs';
export function tree(tag, attrs={}, children=[]) {
 const node=fakeEl(tag,attrs); node.nodeType=1; node.nodeName=tag;
 Object.defineProperties(node,{
  attributes:{get:()=>Object.entries(node.attrs).map(([name,value])=>({name,value}))},
  childNodes:{get:()=>node.children},
  nextSibling:{get:()=>node.parentNode?.children[node.parentNode.children.indexOf(node)+1] || null},
 });
 node.appendChild=child=>node.insertBefore(child,null);
 node.insertBefore=(child,next)=>{child.remove();const index=next?node.children.indexOf(next):node.children.length;if(index<0)throw Error('Missing sibling');node.children.splice(index,0,child);child.parentNode=node;return child;};
 node.remove=()=>{if(node.parentNode){node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);node.parentNode=null;}};
 node.replaceWith=other=>{const parent=node.parentNode;parent.insertBefore(other,node);node.remove();};
 node.contains=child=>child===node || node.children.some(n=>n.contains(child));
 node.querySelectorAll=selector=>node.children.flatMap(child=>[...(selector==='*'||selector==='[id]'&&child.id?[child]:[]),...child.querySelectorAll(selector)]);
 node.querySelector=selector=>node.querySelectorAll('*').find(n=>selector==='use, [data-visteras-envelope]'&&(n.localName==='use'||n.hasAttribute('data-visteras-envelope'))) || null;
 node.cloneNode=deep=>tree(tag,{...node.attrs},deep?node.children.map(n=>n.cloneNode(true)):[]);
 node.ownerDocument={createElementNS:(_,name)=>tree(name)};
 for(const child of children)node.appendChild(child);
 return node;
}
export function canvas(elements) {
 const sc=fakeCanvas(elements);let id=0;sc.getNextId=()=>`generated_${++id}`;
 sc.getStrokedBBox=()=>({x:10,y:20,width:100,height:80});
 sc.clearSelection=()=>{sc.selected=[];};sc.addToSelection=items=>{sc.selected=items;};
 sc.history.InsertElementCommand=class {
  constructor(el){this.el=el;this.parent=el.parentNode;this.next=el.nextSibling;}
  apply(){this.parent.insertBefore(this.el,this.next);}
  unapply(){this.el.remove();}
 };
 sc.history.MoveElementCommand=class {
  constructor(el,next,parent){Object.assign(this,{el,next,parent,newParent:el.parentNode,newNext:el.nextSibling});}
  apply(){this.newParent.insertBefore(this.el,this.newNext);}
  unapply(){this.parent.insertBefore(this.el,this.next);}
 };
 return sc;
}
export const serialize=node=>JSON.stringify([node.localName,node.attrs,node.children.map(serialize)]);
