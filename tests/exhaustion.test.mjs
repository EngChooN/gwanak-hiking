import test from 'node:test';
import assert from 'node:assert/strict';
import {EXHAUST,createExhaustion,onRunExhausted,releaseCramp,stepExhaustion,blocksMove,crampLabel} from '../src/exhaustion.js';

const run=(ex,seconds,o={})=>{const ended=[];for(let t=0;t<seconds-1e-9;t+=.05){const e=stepExhaustion(ex,.05,o);if(e)ended.push(e);}return ended;};

test('스테미너 0: 평지면 헥헥 1.5초 동안 이동을 막고, 30까지는 터벅터벅', () => {
 const ex=createExhaustion();
 assert.equal(onRunExhausted(ex,{uphill:0,now:10,random:0}),'pant');
 assert.ok(blocksMove(ex));
 assert.deepEqual(run(ex,1.45,{runExhausted:true}),[]);assert.ok(blocksMove(ex));
 assert.deepEqual(run(ex,.1,{runExhausted:true}),['pant']);
 assert.ok(!blocksMove(ex));assert.equal(ex.trudge,true);
 stepExhaustion(ex,.05,{runExhausted:false});assert.equal(ex.trudge,false);
});

test('오르막(경사 10% 이상)에서만 25% 확률로 쥐, 3초 뒤 저절로 풀림', () => {
 assert.equal(onRunExhausted(createExhaustion(),{uphill:.09,now:200,random:0}),'pant');
 assert.equal(onRunExhausted(createExhaustion(),{uphill:.1,now:200,random:.249}),'cramp');
 assert.equal(onRunExhausted(createExhaustion(),{uphill:.3,now:200,random:.25}),'pant');
 const ex=createExhaustion();onRunExhausted(ex,{uphill:.2,now:200,random:0});
 assert.equal(crampLabel(ex),'쥐 0:03');
 assert.deepEqual(run(ex,2.95),[]);assert.ok(blocksMove(ex));
 assert.deepEqual(run(ex,.1),['cramp']);assert.ok(!blocksMove(ex));
});

test('발끝 당기기를 누르면 1초 뒤 풀리고, 한 번 나면 2분 동안 다시 나지 않음', () => {
 const ex=createExhaustion();onRunExhausted(ex,{uphill:.2,now:100,random:0});
 run(ex,.5);assert.equal(releaseCramp(ex),true);assert.equal(releaseCramp(ex),false);
 assert.deepEqual(run(ex,.95),[]);assert.deepEqual(run(ex,.1),['cramp']);
 assert.equal(onRunExhausted(ex,{uphill:.2,now:100+EXHAUST.crampCooldown-1,random:0}),'pant');
 run(ex,2);
 assert.equal(onRunExhausted(ex,{uphill:.2,now:100+EXHAUST.crampCooldown,random:0}),'cramp');
});

test('자동걷기 중에는 생기지 않고, 쥐가 나면 1인칭 시야만 천천히 0.3m 낮춤', () => {
 assert.equal(onRunExhausted(createExhaustion(),{uphill:.5,now:500,random:0,auto:true}),null);
 const ex=createExhaustion();onRunExhausted(ex,{uphill:.5,now:500,random:0});
 stepExhaustion(ex,.1);assert.ok(ex.eye>0&&ex.eye<.1,'한 번에 떨어지지 않는다');
 run(ex,1.5);assert.equal(ex.eye,EXHAUST.eyeDrop);
 run(ex,3);assert.equal(ex.phase,'none');assert.equal(ex.eye,0);
 assert.deepEqual([EXHAUST.pantSeconds,EXHAUST.crampSeconds,EXHAUST.crampReleaseSeconds,EXHAUST.crampChance,EXHAUST.crampSlope,EXHAUST.crampCooldown],[1.5,3,1,.25,.1,120]);
});
