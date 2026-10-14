export function fit_zoom(width,height,imageWidth,imageHeight){return Math.max(.01,Math.min((width-32)/imageWidth,(height-32)/imageHeight));}
export function zoom_view(view,next,x=0,y=0){
 next=Math.max(.05,Math.min(4,next));const ratio=next/view.scale;
 return {scale:next,x:x-(x-view.x)*ratio,y:y-(y-view.y)*ratio};
}
