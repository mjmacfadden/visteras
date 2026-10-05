import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('toggling rulers preserves zoom and the visible artwork position', () => {
  const source = readFileSync(new URL('../js/visteras-document-shell.js', import.meta.url),'utf8');
  const code = source.slice(source.indexOf('  function setRulersVisible(show)'), source.indexOf('  function updateRulers()',source.indexOf('  function setRulersVisible(show)')));
  for (const on of [true,false]) {
    const area = {scrollLeft:400,scrollTop:300};
    let origin = {e:100,f:80}, zoom = 2;
    const config = {showRulers:!on};
    const content = {getScreenCTM:()=>({...origin})};
    const context = vm.createContext({ sc:{getSvgContent:()=>content},
      svgEditor:{configObj:{curConfig:config},rulers:{display(){}},updateCanvas(center){
        assert.equal(center,false);
        origin = {e:origin.e+15,f:origin.f+20};
      }},
      document:{getElementById:()=>area,querySelector:()=>({classList:{toggle(){}}})},
      localStorage:{setItem(){}}, RULERS_KEY:'rulers', curConfig:()=>config,
      updateRulers(){},updateStatusBar(){}, fitDefaultArtboard(){assert.fail('Must not fit');} });
    vm.runInContext(code,context);
    context.setRulersVisible(on);
    assert.equal(config.showRulers,on);
    assert.equal(area.scrollLeft,415); assert.equal(area.scrollTop,320);
    assert.equal(origin.e-area.scrollLeft,-300);
    assert.equal(origin.f-area.scrollTop,-220);
    assert.equal(zoom,2);
  }
});
