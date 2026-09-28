#!/usr/bin/env python3
"""Local Photoshop reference / Visteras round-trip harness. No production endpoints."""
import argparse, functools, html, json, secrets, subprocess, sys
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote
HERE=Path(__file__).resolve().parent
APPS=HERE.parents[2]
IDS=['raster','opacity','hidden','multiply','screen','overlay','mask','clipping','nested-groups','isolated-group','point-text','paragraph-text','invert-adjustment','levels-adjustment','smart-object']

def prepare(root):
    root.mkdir(parents=True,exist_ok=True)
    if (root/'manifest.json').exists(): raise SystemExit('Use a new run directory; existing runs are never overwritten by prepare.')
    for d in ['reference','roundtrip','photoshop','diff']: (root/d).mkdir()
    template=(HERE/'photoshop.jsx').read_text()
    for mode,name in [('generate','generate.jsx'),('inspect','inspect.jsx')]:
        (root/name).write_text(template.replace('__RUN_ROOT__',json.dumps(str(root))).replace('__MODE__',json.dumps(mode)))
    try: revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip()
    except Exception: revision='unknown'
    manifest={'ids':IDS,'token':secrets.token_urlsafe(32),'revision':revision,'scope':'8-bit RGB; generated fixtures; reversible visibility edit; default color setup recorded by Photoshop'}
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(f'1. Photoshop > File > Scripts > Browse: {root}/generate.jsx\n2. Run serve, open runner, click Run\n3. Photoshop: {root}/inspect.jsx\n4. Run report')

def serve(root,port):
    manifest=json.loads((root/'manifest.json').read_text())
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kw): super().__init__(*args,directory=str(APPS),**kw)
        def end_headers(self):
            self.send_header('Cache-Control','no-store');super().end_headers()
        def translate_path(self,path):
            route=unquote(urlsplit(path).path)
            if route.startswith('/artifacts/'):
                candidate=(root/route[len('/artifacts/'):]).resolve()
                return str(candidate) if candidate.is_relative_to(root) else str(root/'not-found')
            if route=='/runner': return str(HERE/'runner.html')
            return super().translate_path(path)
        def do_GET(self):
            if urlsplit(self.path).path=='/manifest':
                data=json.dumps(manifest).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            else: super().do_GET()
        def do_POST(self):
            name=unquote(urlsplit(self.path).path).removeprefix('/result/')
            allowed={i+'.psd' for i in IDS}|{'browser.json'}
            if not self.path.startswith('/result/') or name not in allowed or self.headers.get('X-Run-Token')!=manifest['token']:
                self.send_error(403);return
            origin=self.headers.get('Origin')
            if origin and origin!=f'http://127.0.0.1:{port}': self.send_error(403);return
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<64*1024*1024: self.send_error(413);return
            data=self.rfile.read(n)
            if name.endswith('.psd') and not data.startswith(b'8BPS'): self.send_error(400);return
            (root/'roundtrip'/name).write_bytes(data);self.send_response(204);self.end_headers()
    print(f'Open http://127.0.0.1:{port}/runner',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()

def compare_structure(before,after):
    errors=[]
    for key in ['width','height','bits']:
        if before.get(key)!=after.get(key): errors.append(f'{key}: {before.get(key)} → {after.get(key)}')
    if len(before['layers'])!=len(after['layers']): errors.append(f"layer count: {len(before['layers'])} → {len(after['layers'])}")
    for a,b in zip(before['layers'],after['layers']):
        for key in ['path','name','type','kind','visible','blend','clipped','mask','vectorMask','effects','text','font','textType','editable']:
            if a.get(key)!=b.get(key): errors.append(f"{a['path']} {key}: {a.get(key)} → {b.get(key)}")
        if abs(a['opacity']-b['opacity'])>0.6: errors.append(f"{a['path']} opacity: {a['opacity']} → {b['opacity']}")
    return errors

def report(root):
    from PIL import Image, ImageChops, ImageStat
    rows=[]
    for id in IDS:
        try:
            a=json.loads((root/'reference'/f'{id}.json').read_text());b=json.loads((root/'photoshop'/f'{id}.json').read_text())
            errors=compare_structure(a,b)
            before=Image.open(root/'reference'/f'{id}.png').convert('RGBA');after=Image.open(root/'photoshop'/f'{id}.png').convert('RGBA')
            if before.size!=after.size: raise ValueError('Rendered dimensions differ')
            # Compare over black AND white so alpha losses cannot hide in RGB bytes.
            diffs=[]
            for color in ['black','white']:
                x=Image.new('RGBA',before.size,color);x.alpha_composite(before)
                y=Image.new('RGBA',after.size,color);y.alpha_composite(after)
                diffs.append(ImageChops.difference(x.convert('RGB'),y.convert('RGB')))
            diff=ImageChops.lighter(*diffs);max_error=max(v[1] for v in diff.getextrema());mean=sum(ImageStat.Stat(diff).mean)/3
            changed=sum(max(p)>3 for p in diff.getdata())/(before.width*before.height)
            diff.point(lambda v:min(255,v*5)).save(root/'diff'/f'{id}.png')
            visual=max_error<=3 # Deliberately strict initial threshold; no baseline auto-approval.
            status='PASS' if visual and not errors else 'REVIEW'
            rows.append({'id':id,'status':status,'meanError':round(mean,3),'maxError':max_error,'changedPercent':round(changed*100,3),'structure':errors,'referencePhotoshop':a['version'],'roundtripPhotoshop':b['version']})
        except Exception as e: rows.append({'id':id,'status':'BLOCKED','error':str(e)})
    (root/'report.json').write_text(json.dumps(rows,indent=2))
    body='''<!doctype html><meta charset="utf-8"><title>Photoshop compatibility report</title><style>body{font:15px system-ui;background:#161b22;color:#eee;margin:32px;max-width:1150px}section{background:#242b35;padding:20px;margin:18px 0;border-radius:10px}img{width:256px;border:1px solid #68717f;margin-right:12px}.PASS{color:#6ee7a0}.REVIEW{color:#ffd479}.BLOCKED{color:#ff8585}pre{white-space:pre-wrap}figure{display:inline-block;margin:0 10px 0 0}figcaption{margin-bottom:6px}</style><h1>Photoshop round-trip compatibility</h1><p>Generated Photoshop PSD → Visteras import / reversible edit / export → Photoshop reopen.</p><p>PASS requires both structure checks and ≤3/255 rendered error per channel over black and white. REVIEW is a detected difference, not an approved limitation. This small suite does not certify arbitrary PSD compatibility.</p>'''
    body+='<p>'+html.escape(', '.join(f"{sum(r['status']==s for r in rows)} {s}" for s in ['PASS','REVIEW','BLOCKED']))+'</p>'
    for row in rows:
        id=row['id'];body+=f'<section><h2 class="{row["status"]}">{html.escape(id)} — {row["status"]}</h2><pre>{html.escape(json.dumps(row,indent=2))}</pre>'
        for folder,label in [('reference','Photoshop original'),('photoshop','After Visteras round-trip'),('diff','Difference ×5')]:
            if (root/folder/f'{id}.png').exists(): body+=f'<figure><figcaption>{label}</figcaption><img src="{folder}/{id}.png"></figure>'
        body+='</section>'
    (root/'report.html').write_text(body)
    print(json.dumps({s:sum(r['status']==s for r in rows) for s in ['PASS','REVIEW','BLOCKED']}));print(root/'report.html')
    return 0 if all(r['status']=='PASS' for r in rows) else 1

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','serve','report']);parser.add_argument('--run',type=Path,required=True);parser.add_argument('--port',type=int,default=8771);args=parser.parse_args();root=args.run.resolve()
    if args.command=='prepare':prepare(root)
    elif args.command=='serve':serve(root,args.port)
    else:sys.exit(report(root))
