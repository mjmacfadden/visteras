/** Projective mapping between a unit square and a convex four-corner box. */
export function quad_matrix(q) {
 const [a,b,c,d]=q;
 const dx=b.x-c.x, dy=b.y-c.y, ex=d.x-c.x, ey=d.y-c.y;
 const px=a.x-b.x+c.x-d.x, py=a.y-b.y+c.y-d.y;
 const det=dx*ey-ex*dy;
 const g=Math.abs(px)+Math.abs(py)<1e-10 ? 0 : (px*ey-ex*py)/det;
 const h=Math.abs(px)+Math.abs(py)<1e-10 ? 0 : (dx*py-px*dy)/det;
 return [b.x-a.x+g*b.x,d.x-a.x+h*d.x,a.x,b.y-a.y+g*b.y,d.y-a.y+h*d.y,a.y,g,h,1];
}
export function inverse_matrix(m) {
 const [a,b,c,d,e,f,g,h,i]=m;
 const v=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
 const det=a*v[0]+b*v[3]+c*v[6];
 return v.map(n=>n/det);
}
export function map_point(m,p) {
 const z=m[6]*p.x+m[7]*p.y+m[8];
 return {x:(m[0]*p.x+m[1]*p.y+m[2])/z,y:(m[3]*p.x+m[4]*p.y+m[5])/z};
}
export function valid_quad(q) {
 let sign=0;
 for(let n=0;n<4;n++) {
  const a=q[n],b=q[(n+1)%4],c=q[(n+2)%4];
  const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
  if(!Number.isFinite(cross)||Math.abs(cross)<1e-5) return false;
  if(sign && Math.sign(cross)!==sign) return false;
  sign=Math.sign(cross);
 }
 return true;
}
/** Inverse sample with premultiplied-alpha bilinear filtering, avoiding mesh seams. */
export function draw_quad(ctx,source,q,createCanvas) {
 const w=source.width,h=source.height;
 const pixels=source.getContext('2d').getImageData(0,0,w,h).data;
 let minX=w,minY=h,maxX=0,maxY=0;
 for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(pixels[(y*w+x)*4+3]) {minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+1);maxY=Math.max(maxY,y+1);}
 if(minX===w) return;
 const matrix=quad_matrix(q),inverse=inverse_matrix(matrix);
 const points=[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]].map(([x,y])=>map_point(matrix,{x:x/w,y:y/h}));
 const left=Math.floor(Math.min(...points.map(p=>p.x))+1e-8),top=Math.floor(Math.min(...points.map(p=>p.y))+1e-8);
 const width=Math.ceil(Math.max(...points.map(p=>p.x))-1e-8)-left,height=Math.ceil(Math.max(...points.map(p=>p.y))-1e-8)-top;
 if(!Number.isFinite(width*height)||width<=0||height<=0||width*height>64*1024*1024) return;
 const canvas=createCanvas();canvas.width=width;canvas.height=height;
 const target=canvas.getContext('2d'),out=target.createImageData(width,height);
 for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
  const p=map_point(inverse,{x:left+x+.5,y:top+y+.5}),sx=p.x*w-.5,sy=p.y*h-.5;
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  let alpha=0;const color=[0,0,0];
  for(let j=0;j<2;j++) for(let k=0;k<2;k++) {
   if(ix+k<0||iy+j<0||ix+k>=w||iy+j>=h) continue;
   const index=((iy+j)*w+ix+k)*4,weight=(k?fx:1-fx)*(j?fy:1-fy),a=pixels[index+3]*weight;
   alpha+=a;for(let channel=0;channel<3;channel++) color[channel]+=pixels[index+channel]*a;
  }
  const index=(y*width+x)*4;out.data[index+3]=alpha;
  if(alpha) for(let channel=0;channel<3;channel++) out.data[index+channel]=color[channel]/alpha;
 }
 target.putImageData(out,0,0);ctx.drawImage(canvas,left,top);
}
