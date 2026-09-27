const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/smart-sources.js'), 'utf8').replace(/export /g, ''), context);
const source = () => ({ id: 'source', revision: 1, width: 100, height: 80, preview: 'data:image/png;base64,AAA', document: { info: { width: 100, height: 80 }, layers: [] }, link: { runtime: true } });
const layer = () => ({ type: 'smart', smart_source_id: 'source' });
test('serialize each referenced source once without runtime bitmap or orphan assets', () => {
 const result = context.serialize_sources([layer(), layer()], {source:source(), orphan:source()});
 assert.deepEqual(Object.keys(result), ['source']);
 assert.equal(result.source.link, undefined);
 assert.equal(result.source.width, 100);
});
test('missing references fail instead of silently saving flattened content', () => {
 assert.throws(()=>context.serialize_sources([layer()], {}), /Missing/);
 assert.throws(()=>context.validate_sources({}, [layer()]), /Invalid/);
});
test('valid nested sources survive validation', () => {
 const s=source(); s.document.layers=[layer()]; s.document.smart_sources={source:source()};
 assert.doesNotThrow(()=>context.validate_sources({source:s}, [layer()]));
});
test('cycles and excessive nesting fail safely', () => {
 const s=source(); s.document.layers=[layer()]; s.document.smart_sources={source:s};
 assert.throws(()=>context.validate_sources({source:s}, [layer()]), /Recursive/);
 const top=source(); let cur=top;
 for(let i=0;i<18;i++){const next=source();cur.document.layers=[layer()];cur.document.smart_sources={source:next};cur=next;}
 assert.throws(()=>context.validate_sources({source:top},[layer()]), /nesting/);
});
test('invalid dimensions and nonembedded previews are rejected', () => {
 for(const patch of [{width:0},{height:Infinity},{preview:'https://example.com/image.png'}])
  assert.throws(()=>context.validate_sources({source:{...source(),...patch}}, [layer()]), /Invalid/);
});
