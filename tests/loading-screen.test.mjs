import test from 'node:test';
import assert from 'node:assert/strict';
import {describeLoading,TIPS} from '../src/loading-screen.js';
import {iblNeutral,hemiColor,composeEnvironment,sunPosition} from '../src/daytime.js';
import {weatherLook} from '../src/weather.js';
import {plazaBannerVisible} from '../src/plaza-banner.js';
const spread=c=>Math.max(...c)-Math.min(...c);
test('진행률은 이벤트 값 그대로, 준비 전에는 100%가 되지 않는다',()=>{
 assert.equal(describeLoading({stage:'terrain',progress:.5,label:'지형 준비 중'}).percent,50);
 assert.equal(describeLoading({stage:'stabilizing',progress:.9999,label:'x'}).percent,99);
 assert.equal(describeLoading({stage:'ready',progress:1}).percent,100);
 const e=describeLoading({stage:'error',progress:.4,error:'x'});assert.equal(e.phase,'error');assert.equal(e.percent,40);
 assert.equal(describeLoading(null).percent,0);
});
test('안내 문구는 산리서치 문서 8개 + 조작 팁',()=>{assert.equal(TIPS.length,9);assert.ok(TIPS.every(t=>t.length>10&&t.length<80));});
test('광장 안내는 zone이 plaza일 때만',()=>{assert.equal(plazaBannerVisible({zone:'plaza'}),true);assert.equal(plazaBannerVisible({zone:'route'}),false);});
test('맑은 낮 반구광은 예전 푸른 값 그대로',()=>{assert.deepEqual(hemiColor(30,0,0).map(v=>+v.toFixed(4)),[.8118,.8784,.9608]);});
test('흐림·비는 반구광이 중성 회색(채도 낮음), 낮은 해는 따뜻한 쪽',()=>{
 for(const g of [.7,.85,.9])assert.ok(spread(hemiColor(30,0,g))<.06,`gray ${g}`);
 const warm=hemiColor(5,0,.7);assert.ok(warm[0]>warm[2]);
 assert.ok(spread(hemiColor(30,0,0))>spread(hemiColor(30,0,.7)));
});
test('흐림 노출·환경광이 맑음보다 낮지 않다(사진처럼 밝은 회색 낮)',()=>{
 const sun={elevation:30,azimuth:200},moon={elevation:-40,azimuth:0,illumination:0};
 const clear=composeEnvironment({sun,moon,weather:weatherLook({kind:'clear'})}),over=composeEnvironment({sun,moon,weather:weatherLook({kind:'overcast'})}),rain=composeEnvironment({sun,moon,weather:weatherLook({kind:'rain',level:'medium'})});
 assert.equal(clear.exposureMul,1);assert.ok(over.exposureMul>1.15);assert.ok(over.ambient>=clear.ambient&&rain.ambient>=.95);
 assert.ok(spread(over.fogColor)<.12&&spread(over.horizon)<.12);
});
test('IBL 중성화 비율: 맑은 낮 0, 흐림 회색도, 해가 낮으면 증가, 밤 0',()=>{
 assert.equal(iblNeutral(30,0,0),0);assert.equal(iblNeutral(30,0,.85),.85);
 assert.ok(iblNeutral(1,0,0)>.5);assert.equal(iblNeutral(-20,1,0),0);
});
