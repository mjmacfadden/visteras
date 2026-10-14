/** Sparse character overrides, indexed in UTF-16 like textarea selections. */
export const STYLE_KEYS = Object.freeze(['fontFamily','fontWeight','fontStyle','fontSize','fill','letterSpacing','baselineShift']);
const equal = (a,b) => STYLE_KEYS.every(k=>a[k]===b[k]);
const clean = style => Object.fromEntries(STYLE_KEYS.filter(k=>style?.[k] !== undefined && style[k] !== null).map(k=>[k,style[k]]));
export function normalizeRuns(runs, length) {
  length = Math.max(0, Number(length)||0);
  const out=[];
  for (const r of [...(Array.isArray(runs)?runs:[])].sort((a,b)=>a.start-b.start)) {
    const start=Math.max(out.at(-1)?.end||0, Math.min(length,Math.max(0,Math.trunc(Number(r.start)||0))));
    const end=Math.min(length,Math.max(0,Math.trunc(Number(r.end)||0)));
    if(end<=start) continue;
    const style=clean(r.style), previous=out.at(-1);
    if(previous && previous.end===start && equal(previous.style,style)) previous.end=end;
    else out.push({start,end,style});
  }
  return out;
}
export function runsToSpans(text, runs, lineBreaks) {
  const normalized=normalizeRuns(runs,text.length);
  const lines=lineBreaks || [{start:0,end:text.length}];
  return lines.flatMap((line,lineIndex)=>{
    const start=line.start, end=line.end ?? start+line.text.length;
    const cuts=[start,end,...normalized.flatMap(r=>[r.start,r.end]).filter(n=>n>start&&n<end)].sort((a,b)=>a-b);
    return [...new Set(cuts)].slice(0,-1).map((a,i,arr)=>{
      const b=cuts.find(n=>n>a) ?? end;
      return {start:a,end:b,text:text.slice(a,b),style:{...(normalized.find(r=>r.start<=a&&r.end>a)?.style||{})},line:lineIndex};
    });
  });
}
export function applyStyleToRange(runs,start,end,patch,length) {
  start=Math.max(0,Math.min(length,start));end=Math.max(start,Math.min(length,end));
  if(start===end)return normalizeRuns(runs,length);
  const text=' '.repeat(length), spans=runsToSpans(text,runs);
  const cuts=[0,length,start,end,...spans.flatMap(r=>[r.start,r.end])].sort((a,b)=>a-b);
  const points=[...new Set(cuts)];
  return normalizeRuns(points.slice(0,-1).map((a,i)=>{
    const style={...(spans.find(r=>r.start<=a&&r.end>a)?.style||{})};
    if(a>=start&&a<end)for(const k of STYLE_KEYS)if(Object.hasOwn(patch,k)){if(patch[k]==null)delete style[k];else style[k]=patch[k];}
    return {start:a,end:points[i+1],style};
  }),length);
}
export function styleAtRange(runs,start,end,base={}) {
  const length=Math.max(end,...(runs||[]).map(r=>r.end),0);
  const spans=runsToSpans(' '.repeat(length),runs,[{start,end}]);
  if(!spans.length)return {...base};
  return Object.fromEntries(STYLE_KEYS.map(k=>{
    const values=spans.map(r=>r.style[k]??base[k]);
    return [k,values.every(v=>v===values[0])?values[0]:undefined];
  }));
}
export function insertText(runs,at,count) {
  if(count<=0)return runs.map(r=>({...r,style:{...r.style}}));
  const left=runs.find(r=>r.start<at&&r.end>=at)?.style||{};
  const out=runs.flatMap(r=>r.end<=at?[r]:r.start>=at?[{...r,start:r.start+count,end:r.end+count}]:[{...r,end:at},{...r,start:at+count,end:r.end+count}]);
  out.push({start:at,end:at+count,style:left});
  return normalizeRuns(out,Math.max(at+count,...out.map(r=>r.end)));
}
export function deleteText(runs,start,end) {
  const count=Math.max(0,end-start);
  const out=runs.flatMap(r=>{
    if(r.end<=start)return [r];
    if(r.start>=end)return [{...r,start:r.start-count,end:r.end-count}];
    const parts=[];
    if(r.start<start)parts.push({...r,end:start});
    if(r.end>end)parts.push({...r,start,end:r.end-count});
    return parts;
  });
  return normalizeRuns(out,Math.max(0,...out.map(r=>r.end)));
}
export function parseRuns(value,length=Number.MAX_SAFE_INTEGER) {
  try{return normalizeRuns(JSON.parse(value||'[]'),length);}catch{return [];}
}
export function serializeRuns(runs,length=Number.MAX_SAFE_INTEGER){return JSON.stringify(normalizeRuns(runs,length));}
/** One contiguous textarea replacement, including paste and IME input. */
export function updateRunsForText(runs,before,after) {
  let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  let oldEnd=before.length,newEnd=after.length;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  return normalizeRuns(insertText(deleteText(runs,start,oldEnd),start,newEnd-start),after.length);
}
