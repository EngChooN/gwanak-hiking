import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gadgetMode,activeStop,formatZoom,clockText,PHONE_STOPS} from '../src/gadget-ui.js';
test('쌍안경은 1인칭에서만 테두리를 그리고 HUD를 접는다',()=>{
 assert.deepEqual(gadgetMode({gadget:'binoculars',view:'first'}),{mode:'binoculars-first',hideHud:true,mirror:false});
 const third=gadgetMode({gadget:'binoculars',view:'third'});assert.equal(third.mode,'binoculars-third');assert.equal(third.hideHud,false);
});
test('휴대폰: 1인칭은 테두리, 3인칭은 작은 조작줄만. 셀카 미리보기만 좌우 반전',()=>{
 assert.equal(gadgetMode({gadget:'phone',view:'first',phone:{selfie:false}}).mode,'phone-first');
 assert.equal(gadgetMode({gadget:'phone',view:'first',phone:{selfie:true}}).mirror,true);
 const t=gadgetMode({gadget:'phone',view:'third',phone:{selfie:true}});assert.equal(t.mode,'phone-third');assert.equal(t.mirror,false);assert.equal(t.hideHud,false);
 assert.equal(gadgetMode({gadget:'none',view:'first'}).mode,'none');assert.equal(gadgetMode().mode,'none');
});
test('줌 단추 0.5·1·2·5x, 현재 배율에 가까운 단추 표시',()=>{
 assert.deepEqual([...PHONE_STOPS],[.5,1,2,5]);assert.equal(activeStop(1),1);assert.equal(activeStop(2.05),2);assert.equal(activeStop(1.5),null);
 assert.equal(formatZoom(8),'8x');assert.equal(formatZoom(1.46),'1.5x');assert.equal(formatZoom(.5),'0.5x');
});
test('시계 표기',()=>{assert.equal(clockText(new Date(2026,10,4,9,5)),'09:05');});
test('HUD 크기 비율(--u)을 따르고 휴대폰 단추는 터치 크기를 지킨다',()=>{
 const css=readFileSync(new URL('../src/gadget-ui.css',import.meta.url),'utf8');
 assert.ok(css.includes('var(--u)'));assert.ok(!/--ui\b/.test(css));
 assert.ok(/\.phone-shutter\{[^}]*min-width:64px/.test(css));assert.ok(/\.phone-zooms button\{[^}]*min-height:max\(40px/.test(css));
});
