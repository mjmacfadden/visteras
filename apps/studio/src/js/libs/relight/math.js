/** Independent depth-guided relighting. No ImageFlow source or assets used. */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
export function default_light(index = 0) {
 return {id:index + 1, type:'bulb', x:.35, y:.3, distance:.3, intensity:.8, diffusion:.3, color:'#ffffff', enabled:true};
}
export function normalize_light(light = {}) {
 const d = default_light();
 return {...d, ...light, type:light.type === 'sun' ? 'sun' : 'bulb',
  x:clamp(finite(light.x,d.x),0,1), y:clamp(finite(light.y,d.y),0,1),
  distance:clamp(finite(light.distance,d.distance),.1,3), intensity:clamp(finite(light.intensity,d.intensity),0,3),
  diffusion:clamp(finite(light.diffusion,d.diffusion),0,1),
  color:/^#[0-9a-f]{6}$/i.test(light.color) ? light.color : d.color};
}
export function normalize_depth(data) {
 let lo=Infinity,hi=-Infinity;
 for(const v of data) if(Number.isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}
 const span=hi-lo, out=new Float32Array(data.length);
 for(let i=0;i<data.length;i++) out[i]=span>1e-6 && Number.isFinite(data[i]) ? (data[i]-lo)/span : .5;
 return out;
}
export function sample_grid(data,width,height,x,y,channels=1,channel=0) {
 x=clamp(x,0,width-1); y=clamp(y,0,height-1);
 const a=Math.floor(x),b=Math.floor(y),c=Math.min(a+1,width-1),d=Math.min(b+1,height-1),tx=x-a,ty=y-b;
 const at=(xx,yy)=>data[(yy*width+xx)*channels+channel];
 return (at(a,b)*(1-tx)+at(c,b)*tx)*(1-ty)+(at(a,d)*(1-tx)+at(c,d)*tx)*ty;
}
export function depth_normals(depth,width,height,strength=.3) {
 if(depth.length!==width*height || width<1 || height<1) throw new Error('Invalid depth dimensions.');
 const out=new Float32Array(width*height*3);
 for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
  const dx=(sample_grid(depth,width,height,x+1,y)-sample_grid(depth,width,height,x-1,y))*width*strength/2;
  const dy=(sample_grid(depth,width,height,x,y+1)-sample_grid(depth,width,height,x,y-1))*height*strength/2;
  const length=Math.hypot(dx,dy,1),i=(y*width+x)*3;
  out[i]=-dx/length;out[i+1]=-dy/length;out[i+2]=1/length;
 }
 return out;
}
const to_linear=v=>v<=.04045 ? v/12.92 : Math.pow((v+.055)/1.055,2.4);
const to_srgb=v=>v<=.0031308 ? v*12.92 : 1.055*Math.pow(v,1/2.4)-.055;
/** Returns fresh pixels; the original and its alpha remain untouched. */
export function render_relight(rgba,width,height,geometry,settings={}) {
 if(rgba.length!==width*height*4) throw new Error('Invalid image dimensions.');
 const {depth,normals,width:gw,height:gh}=geometry;
 if(depth.length!==gw*gh || normals.length!==gw*gh*3) throw new Error('Invalid surface geometry.');
 const original=clamp(finite(settings.original,1),0,1);
 const lights=(settings.lights||[]).map(normalize_light).filter(l=>l.enabled && l.intensity>0).map(l=>({...l,rgb:[1,3,5].map(i=>to_linear(parseInt(l.color.slice(i,i+2),16)/255))}));
 const out=new Uint8ClampedArray(rgba);
 if(original===1 && !lights.length) return out;
 const aspect=width/Math.max(width,height),aspectY=height/Math.max(width,height);
 for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
  const i=(y*width+x)*4;if(!rgba[i+3])continue;
  const u=width===1?.5:x/(width-1),v=height===1?.5:y/(height-1),gx=u*(gw-1),gy=v*(gh-1);
  const z=sample_grid(depth,gw,gh,gx,gy)*.3;
  const nx=sample_grid(normals,gw,gh,gx,gy,3,0),ny=sample_grid(normals,gw,gh,gx,gy,3,1),nz=sample_grid(normals,gw,gh,gx,gy,3,2),nl=Math.hypot(nx,ny,nz)||1;
  const lightRGB=[original+(1-original)*.12,original+(1-original)*.12,original+(1-original)*.12];
  for(const light of lights) {
   const dx=(light.x-u)*aspect,dy=(light.y-v)*aspectY,dz=light.distance+.35-z;
   const sx=light.type==='sun'?(light.x-.5)*2:dx,sy=light.type==='sun'?(light.y-.5)*2:dy;
   const len=Math.hypot(sx,sy,dz),cos=Math.max(0,(nx*sx+ny*sy+nz*dz)/(len*nl));
   const diffuse=cos*(1-light.diffusion*.6)+light.diffusion*.6;
   const attenuation=light.type==='sun'?1:light.distance*light.distance/(len*len);
   const energy=light.intensity*diffuse*attenuation*2;
   for(let c=0;c<3;c++) lightRGB[c]+=light.rgb[c]*energy;
  }
  for(let c=0;c<3;c++) out[i+c]=Math.round(clamp(to_srgb(to_linear(rgba[i+c]/255)*lightRGB[c]),0,1)*255);
 }
 return out;
}
