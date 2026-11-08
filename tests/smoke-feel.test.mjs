// 담배 맛 숫자(기획서 v2 A1·A2·A5·A6): 누른 시간 → 모금 맛, 담배 종류 → 연기 양, 큰 연기 크기·시간, 휴대폰 상한
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DRAW,CIG_KINDS,cigKind,drawQuality,drawLevel,smokeAmount,exhalePuffs,puffRadius,puffLife} from '../src/lounge/smoke-feel.js';
import {MOBILE_LIMITS,DESKTOP_LIMITS} from '../src/device-profile.js';
import {SMOKE_KEYS} from '../src/lounge/input.js';

test('A1 누른 시간으로 모금 맛이 나뉜다: 0~0.6 light, 0.6~2.2 sweet, 2.2~3 deep, 3 넘으면 cough',()=>{
 for(const [s,q] of [[0,'light'],[.3,'light'],[.59,'light'],[.6,'sweet'],[1.4,'sweet'],[2.19,'sweet'],[2.2,'deep'],[3,'deep'],[3.01,'cough'],[5,'cough']])
  assert.equal(drawQuality(s),q,`${s}초`);
 assert.ok(DRAW.tap<DRAW.sweet,'짧은 탭은 약한 모금 구간 안');
});
test('A1 들이마신 정도 draw는 0~1이고 3초에 가득 찬다',()=>{
 assert.equal(drawLevel(0),0);assert.equal(drawLevel(1.5),.5);assert.equal(drawLevel(3),1);assert.equal(drawLevel(9),1);assert.equal(drawLevel(-1),0);
});
test('A6 담배 종류별 연기 양 0.8 / 1.3 / 1.0 / 2.0, 꿀모금이면 그대로 amount',()=>{
 assert.deepEqual(Object.keys(CIG_KINDS),['mild','strong','menthol','cigar']);
 const want={mild:.8,strong:1.3,menthol:1,cigar:2};
 for(const [k,n] of Object.entries(want)){assert.equal(CIG_KINDS[k].smoke,n,k);assert.equal(smokeAmount('sweet',k),n,`${k} 꿀모금`);}
 assert.ok(CIG_KINDS.cigar.thick>1.5,'시가는 굵다');assert.notEqual(CIG_KINDS.cigar.paper,CIG_KINDS.mild.paper,'시가는 갈색');
 assert.equal(cigKind('없는것'),'mild');assert.equal(cigKind('cigar'),'cigar');
});
test('A1·A2 같은 담배면 꿀모금 > 약한 모금 > 기침, amount는 0~2',()=>{
 for(const k of Object.keys(CIG_KINDS)){
  const a=q=>smokeAmount(q,k);assert.ok(a('sweet')>a('light')&&a('light')>a('cough'),k);assert.ok(a('deep')>=a('sweet'),k);
  for(const q of ['light','sweet','deep','cough']){assert.ok(a(q)>=0&&a(q)<=2,`${k} ${q}`);}
 }
});
test('A2 꿀모금 뭉게는 지름 0.15~0.35m(예전 3~5배)이고 5~8초 머문다',()=>{
 const a=smokeAmount('sweet','menthol');
 assert.ok(Math.abs(puffRadius(a,0)*2-.15)<.005&&Math.abs(puffRadius(a,1)*2-.35)<.005,'지름');
 for(const k of ['mild','strong','menthol','cigar']){const s=smokeAmount('sweet',k);assert.ok(puffLife(s,0)>=5&&puffLife(s,1)<=8.01,`${k} 머무는 시간`);}
 assert.ok(puffLife(smokeAmount('cough','mild'),.5)<5,'기침 연기는 짧다');
});
test('A2 뭉게 수는 양에 비례하고 휴대폰 상한(LIMITS) 60%를 넘지 않는다',()=>{
 assert.ok(exhalePuffs(2,DESKTOP_LIMITS.trailEffects)>exhalePuffs(.8,DESKTOP_LIMITS.trailEffects));
 for(const a of [0,.5,1,2]){assert.ok(exhalePuffs(a,MOBILE_LIMITS.trailEffects)<=MOBILE_LIMITS.trailEffects*.6);}
});
test('§2 약속: lounge:smoke에 kind·quality·trick·first·amount, status()에 draw·kind',()=>{
 const src=readFileSync(new URL('../src/lounge/smoke.js',import.meta.url),'utf8');
 const say=src.match(/const say=[\s\S]*?\}\}\)\);/)[0];
 for(const k of ['kind:','quality:','trick:','first:','amount:'])assert.ok(say.includes(k),`detail ${k}`);
 const st=src.match(/status\(\)\{return \{[\s\S]*?\};\}/)[0];
 for(const k of ['draw:','kind:'])assert.ok(st.includes(k),`status ${k}`);
 for(const f of ['drawStart(','drawEnd(','trick(name)'])assert.ok(src.includes(f),f);
});
test('PC 키: Space·F 꾹, R 링·N 코·T 프렌치, 1~4 담배 고르기',()=>{
 assert.equal(SMOKE_KEYS.Space,'draw');assert.equal(SMOKE_KEYS.KeyF,'draw');
 assert.equal(SMOKE_KEYS.KeyR,'ring');assert.equal(SMOKE_KEYS.KeyN,'nose');assert.equal(SMOKE_KEYS.KeyT,'french');
 assert.equal(SMOKE_KEYS.Digit4,'kind4');
});
