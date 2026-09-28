/* Generated fixture documents only. Run via Photoshop File > Scripts > Browse. */
#target photoshop
(function () {
 var root = new Folder(__RUN_ROOT__), mode = __MODE__;
 var oldDialogs=app.displayDialogs, oldUnits=app.preferences.rulerUnits;
 var original=app.documents.length?app.activeDocument:null;
 var ids=['raster','opacity','hidden','multiply','screen','overlay','mask','clipping','nested-groups','isolated-group','point-text','paragraph-text','invert-adjustment','levels-adjustment','smart-object'];
 function json(x){if(x===null)return 'null';if(typeof x==='string')return '"'+x.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';if(typeof x==='number'||typeof x==='boolean')return String(x);var a=[],k;if(x instanceof Array){for(k=0;k<x.length;k++)a.push(json(x[k]));return '['+a.join(',')+']';}for(k in x)if(x.hasOwnProperty(k))a.push(json(k)+':'+json(x[k]));return '{'+a.join(',')+'}';}
 function write(name,data){var f=new File(root.fsName+'/'+name);f.encoding='UTF8';f.open('w');f.write(json(data));f.close();}
 function s(v){return stringIDToTypeID(v);}function c(v){return charIDToTypeID(v);}
 function rect(d,l,color,x,y,w,h){d.activeLayer=l;var col=new SolidColor();col.rgb.hexValue=color;d.selection.select([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);d.selection.fill(col);d.selection.deselect();}
 function layer(d,name,col,x,y,w,h){var l=d.artLayers.add();l.name=name;rect(d,l,col,x,y,w,h);return l;}
 function adjustment(kind){var desc=new ActionDescriptor(),ref=new ActionReference();ref.putClass(s('adjustmentLayer'));desc.putReference(c('null'),ref);var content=new ActionDescriptor(),settings=new ActionDescriptor();if(kind==='levels')settings.putEnumerated(s('presetKind'),s('presetKindType'),s('presetKindDefault'));content.putObject(c('Type'),s(kind),settings);desc.putObject(c('Usng'),s('adjustmentLayer'),content);executeAction(c('Mk  '),desc,DialogModes.NO);}
 function make(id){var d=app.documents.add(256,192,72,id,NewDocumentMode.RGB,DocumentFill.TRANSPARENT,1,BitsPerChannelType.EIGHT,'sRGB IEC61966-2.1');var base=d.activeLayer;base.name='Base';rect(d,base,'5577AA',0,0,256,192);var l=layer(d,'Subject','EE7733',32,24,144,112);rect(d,l,'22BB88',72,64,112,88);
 if(id==='opacity')l.opacity=43;
 if(id==='hidden')l.visible=false;
 if(id==='multiply')l.blendMode=BlendMode.MULTIPLY;
 if(id==='screen')l.blendMode=BlendMode.SCREEN;
 if(id==='overlay')l.blendMode=BlendMode.OVERLAY;
 if(id==='mask'){d.selection.select([[24,20],[120,20],[120,170],[24,170]]);var a=new ActionDescriptor();a.putClass(c('Nw  '),c('Chnl'));var r=new ActionReference();r.putEnumerated(c('Chnl'),c('Chnl'),c('Msk '));a.putReference(c('At  '),r);a.putEnumerated(c('Usng'),c('UsrM'),c('RvlS'));executeAction(c('Mk  '),a,DialogModes.NO);d.selection.deselect();}
 if(id==='clipping'){var clip=layer(d,'Clipped multiply','9955DD',0,0,220,100);clip.grouped=true;clip.blendMode=BlendMode.MULTIPLY;}
 if(id==='nested-groups'||id==='isolated-group'){var g=d.layerSets.add();g.name='Outer';l.move(g,ElementPlacement.INSIDE);if(id==='nested-groups'){var g2=g.layerSets.add();g2.name='Inner';l.move(g2,ElementPlacement.INSIDE);}else{g.blendMode=BlendMode.NORMAL;g.opacity=65;l.blendMode=BlendMode.MULTIPLY;}}
 if(id==='point-text'||id==='paragraph-text'){var t=d.artLayers.add();t.kind=LayerKind.TEXT;t.name='Editable text';t.textItem.font='ArialMT';t.textItem.size=24;t.textItem.position=[20,48];t.textItem.contents='Visteras test';if(id==='paragraph-text'){t.textItem.kind=TextType.PARAGRAPHTEXT;t.textItem.width=180;t.textItem.height=100;t.textItem.contents='Visteras wraps this text across lines.';}}
 if(id==='invert-adjustment')adjustment('invert');
 if(id==='levels-adjustment'){adjustment('levels');d.activeLayer.name='Editable Levels';}
 if(id==='smart-object'){d.activeLayer=l;executeAction(s('newPlacedLayer'),undefined,DialogModes.NO);d.activeLayer.name='Editable Smart Object';}
 return d;}
 function descriptor(l){var ref=new ActionReference();ref.putIdentifier(s('layer'),l.id);return executeActionGet(ref);}
 function inventory(d){var rows=[];function walk(ls,parent){for(var i=0;i<ls.length;i++){var l=ls[i],path=parent+'/'+i,rec={path:path,name:l.name,type:l.typename};try{rec.opacity=l.opacity;rec.visible=l.visible;rec.blend=String(l.blendMode);}catch(ignore){}if(l.typename==='ArtLayer'){try{rec.kind=String(l.kind);rec.clipped=!!l.grouped;}catch(ignore){}if(l.kind===LayerKind.TEXT){try{rec.text=l.textItem.contents;rec.font=l.textItem.font;rec.textType=String(l.textItem.kind);rec.editable=true;}catch(ignore){rec.editable=false;}}if(l.kind===LayerKind.SMARTOBJECT){rec.editable=true;}}rows.push(rec);if(l.typename==='LayerSet')walk(l.layers,path);}}walk(d.layers,'');var profile='untagged';try{profile=d.colorProfileName;}catch(ignore){}return {version:app.version,width:Number(d.width),height:Number(d.height),bits:String(d.bitsPerChannel),profile:profile,layers:rows};}
 var results=[];
 try{app.displayDialogs=DialogModes.NO;app.preferences.rulerUnits=Units.PIXELS;new Folder(root.fsName+'/reference').create();new Folder(root.fsName+'/photoshop').create();
 for(var i=0;i<ids.length;i++){var id=ids[i],doc=null;try{doc=mode==='generate'?make(id):app.open(new File(root.fsName+'/roundtrip/'+id+'.psd'));var dir=mode==='generate'?'reference':'photoshop';var meta=inventory(doc);if(mode==='generate'){var opts=new PhotoshopSaveOptions();opts.layers=true;opts.embedColorProfile=true;doc.saveAs(new File(root.fsName+'/reference/'+id+'.psd'),opts,true,Extension.LOWERCASE);}doc.saveAs(new File(root.fsName+'/'+dir+'/'+id+'.png'),new PNGSaveOptions(),true,Extension.LOWERCASE);write(dir+'/'+id+'.json',meta);results.push({id:id,status:'ok'});}catch(e){results.push({id:id,status:'error',error:String(e),line:e.line});}finally{if(doc){try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}}}}
 write(mode+'-status.json',{version:app.version,results:results});
 }finally{app.displayDialogs=oldDialogs;app.preferences.rulerUnits=oldUnits;if(original){try{app.activeDocument=original;}catch(ignore){}}}
})();
