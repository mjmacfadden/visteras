/** Original procedural light masks; no external pattern assets. */
export const PATTERNS=['none','blinds','window','strip','foliage','palm','branches','checker','dots','lines-h','lines-d','grid','weave','noise','crosshatch','custom'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const fract=v=>v-Math.floor(v);
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
const band=(v,period,width,edge)=>1-smooth(width-edge,width+edge,Math.abs(fract(v/period+.5)-.5)*period);
export const TEMPERATURES=[1000,2000,3200,4300,5500,6500,7500,9000,10000];
// Approximate photographic gels, white at the neutral 5500 K preset.
const gels=['#ff5e19','#ff9948','#ffc18b','#ffdeb8','#ffffff','#ddeaff','#c2dbff','#abcaff','#9fc2ff'];
export function temperature_color(k){return gels[TEMPERATURES.indexOf(Number(k))]||'#ffffff';}
export function pattern_coordinates(u,v,z,light,aspect=1){
 const a=(light.patternRotation||0)*Math.PI/180,scale=light.patternScale||1;
 // Project the virtual mask onto the inferred surface along the Sun direction.
 const px=(u-(light.patternX??.5)-z*(light.x-.5)*1.2)*aspect,py=v-(light.patternY??.5)-z*(light.y-.5)*1.2;
 return {x:(Math.cos(a)*px+Math.sin(a)*py)/scale/aspect,y:(-Math.sin(a)*px+Math.cos(a)*py)/scale};
}
export function pattern_mask(u,v,z,light,custom,aspect=1){
 if(!light.pattern||light.pattern==='none')return 1;
 const {x,y}=pattern_coordinates(u,v,z,light,aspect),edge=.001+(light.softness??.5)*.025;
 let mask=1;
 switch(light.pattern){
 case 'blinds':case 'lines-h':mask=band(y,.16,.035,edge);break;
 case 'lines-d':mask=band((x+y)/Math.SQRT2,.16,.035,edge);break;
 case 'strip':mask=band(x,10,.065,edge);break;
 case 'window':mask=(1-smooth(.4-edge,.4+edge,Math.max(Math.abs(x),Math.abs(y))))*(1-band(x,10,.017,edge))*(1-band(y,10,.017,edge));break;
 case 'grid':mask=Math.max(band(x,.18,.014,edge),band(y,.18,.014,edge));break;
 case 'checker':{const a=band(x,.24,.06,edge),b=band(y,.24,.06,edge);mask=a*b+(1-a)*(1-b);break;}
 case 'dots':{const dx=(fract(x/.18+.5)-.5)*.18,dy=(fract(y/.18+.5)-.5)*.18;mask=1-smooth(.045-edge,.045+edge,Math.hypot(dx,dy));break;}
 case 'weave':mask=Math.max(band(x+Math.sin(y*40)*.012,.16,.02,edge),band(y+Math.sin(x*40)*.012,.16,.02,edge));break;
 case 'crosshatch':mask=Math.max(band(x+y,.2,.015,edge),band(x-y,.2,.015,edge));break;
 case 'noise':{const ix=Math.floor(x*16),iy=Math.floor(y*16),tx=smooth(0,1,fract(x*16)),ty=smooth(0,1,fract(y*16));mask=(hash(ix,iy)*(1-tx)+hash(ix+1,iy)*tx)*(1-ty)+(hash(ix,iy+1)*(1-tx)+hash(ix+1,iy+1)*tx)*ty;break;}
 case 'foliage':{mask=1;const cx=Math.floor(x*7),cy=Math.floor(y*7);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=cx+dx,yy=cy+dy,px=(xx+hash(xx,yy))/7,py=(yy+hash(yy,xx+3))/7;const d=Math.hypot((x-px)*1.3,y-py);mask=Math.min(mask,smooth(.025-edge,.06+edge,d));}break;}
 case 'branches':mask=1-Math.max(band(x+Math.sin(y*9)*.09,.5,.015,edge),band(y-x*.8+Math.sin(x*12)*.025,.24,.012,edge));break;
 case 'palm':{const angle=Math.atan2(y,x),r=Math.hypot(x,y),leaf=band(angle+Math.sin(r*12)*.12,Math.PI/4,.035+Math.max(0,.45-r)*.08,edge);mask=1-leaf*(1-smooth(.32,.6,r));break;}
 case 'custom':{
  if(!custom){mask=1;break;}
  const tx=x+.5,ty=y+.5;
  if(tx<0||tx>1||ty<0||ty>1){mask=0;break;}
  const xx=tx*(custom.width-1),yy=ty*(custom.height-1),ix=Math.floor(xx),iy=Math.floor(yy),jx=Math.min(ix+1,custom.width-1),jy=Math.min(iy+1,custom.height-1),fx=xx-ix,fy=yy-iy;
  const at=(a,b)=>custom.data[b*custom.width+a]/255;
  mask=(at(ix,iy)*(1-fx)+at(jx,iy)*fx)*(1-fy)+(at(ix,jy)*(1-fx)+at(jx,jy)*fx)*fy;break;
 }
 }
 mask=clamp(mask,0,1);return light.patternInvert?1-mask:mask;
}
