import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evalNumericField } from '../js/visteras-numeric-field.js';
import { convertToPixels, convertFromPixels, UNITS } from '../js/visteras-document-presets.js';
for (const [text, expected, options] of [['50+10',60],['100*0.5',50],['3cm*50%',1.5,{unit:'cm'}],['50pt+25%',62.5,{unit:'pt'}],['+10',50,{current:40}],['/2',20,{current:40}],['50%',20,{current:40}],['*2',80,{current:40}],['12pt',16],['1pc',16],['1in',96],['-5',-5],['2+3*4',14],['1in+12pt',112]]) {
 test(`numeric ${text}`,()=>assert.equal(evalNumericField(text,options),expected));
}
test('invalid expressions return null without executable evaluation',()=>{
 for(const text of ['abc','5++','','1/0','1,5','alert(1)','10foo']) assert.equal(evalNumericField(text),null);
 const source=fs.readFileSync(new URL('../js/visteras-numeric-field.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\beval\s*\(|\b(?:new\s+)?Function\s*\(/);
});
test('pt and pc document units round trip at CSS 96 pixels per inch',()=>{
 for(const unit of ['pt','pc']) { assert.ok(UNITS.some(u=>u.id===unit)); assert.equal(convertFromPixels(convertToPixels(12,unit),unit),12); }
});
test('Transform fields use text inputs for math and preserve object px/artboard document units',()=>{
 const src=fs.readFileSync(new URL('../js/visteras-transform-panel.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/input.type='number'/); assert.match(src,/bindNumericField/); assert.match(src,/getBaseUnit\(\):'px'/);
});

import { bindNumericField } from '../js/visteras-numeric-field.js';
test('numeric field invalid edits revert without applying; Shift-arrow steps and stops propagation',()=>{
 const events={}, applied=[];
 const input={value:'40',dataset:{},setAttribute(){},addEventListener:(name,fn)=>events[name]=fn,blur(){}};
 bindNumericField(input,{apply:value=>applied.push(value)});
 input.value='hello'; events.input(); events.change(); assert.equal(input.value,'40'); assert.deepEqual(applied,[]);
 input.value='+10'; events.input(); events.change(); assert.equal(input.value,'50'); assert.deepEqual(applied,[50]);
 let stopped=false; events.keydown({key:'ArrowUp',shiftKey:true,preventDefault(){},stopPropagation(){stopped=true;}});
 assert.equal(input.value,'60'); assert.equal(stopped,true);
});
