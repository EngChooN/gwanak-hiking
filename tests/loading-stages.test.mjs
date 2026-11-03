import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLoadingTracker,createStabilityCounter,LOADING_STAGES,LOADING_EVENT,START_EVENT} from '../src/loading.js';
const clock=()=>{let t=0;return {now:()=>t,tick:ms=>t+=ms};};

test('로딩 단계 6개 순서와 이벤트 이름',()=>{
 assert.deepEqual(LOADING_STAGES.map(s=>s.id),['terrain','nature','facilities','hikers','environment','stabilizing']);
 assert.deepEqual(LOADING_STAGES.map(s=>s.label),['지형','숲·바위','시설','등산객','날씨·환경','첫 프레임 안정']);
 assert.ok(Math.abs(LOADING_STAGES.reduce((a,s)=>a+s.weight,0)-1)<1e-9);
 assert.equal(LOADING_EVENT,'hiking:loading');assert.equal(START_EVENT,'hiking:start');
});

test('진행률은 실제 단계 비율만큼만 오르고, 줄지 않으며, 준비 완료 전에는 1이 되지 않는다',()=>{
 const c=clock(),events=[],t=createLoadingTracker({emit:e=>events.push(e),now:c.now});
 t.set('terrain',0);assert.equal(events.at(-1).progress,0);assert.equal(events.at(-1).stage,'terrain');
 c.tick(1000);t.set('terrain',.5);assert.ok(Math.abs(events.at(-1).progress-.15)<1e-9);
 t.set('terrain',.2);assert.ok(Math.abs(t.snapshot().progress-.15)<1e-9,'줄어든 값 무시');
 // 시간이 흘러도 신호가 없으면 진행률은 그대로다.
 c.tick(20000);assert.ok(Math.abs(t.snapshot().progress-.15)<1e-9);
 t.done('terrain');assert.equal(events.at(-1).stage,'nature');assert.equal(events.at(-1).label,'숲·바위 준비 중');
 for(const id of ['nature','facilities','hikers','environment'])t.done(id);t.set('stabilizing',1);
 assert.ok(t.snapshot().progress<1);assert.equal(t.phase,'loading');
 const ready=t.ready({readiness:{terrain:true}});assert.equal(ready.stage,'ready');assert.equal(ready.progress,1);assert.equal(ready.loadMs,21000);
 assert.ok(events.every((e,i)=>!i||e.progress>=events[i-1].progress),'단조 증가');
 const start=t.start();assert.equal(start.stage,'started');assert.equal(t.phase,'started');assert.equal(t.start(),null);
});

test('같은 단계의 0.5%p 미만 변화는 묶어 보낸다',()=>{
 const events=[],t=createLoadingTracker({emit:e=>events.push(e),now:()=>0});
 t.done('terrain');for(let i=0;i<=1000;i++)t.set('nature',i/1000);
 assert.ok(events.length<=70,`이벤트 ${events.length}개`);assert.equal(events.at(-1).stage,'facilities');
});

test('실패 신호: 단계·오류 문구와 마지막 진행률, 시작 거부',()=>{
 const events=[],t=createLoadingTracker({emit:e=>events.push(e),now:()=>0});
 t.done('terrain');t.set('nature',.5);const fail=t.fail(new Error('index.json 404'));
 assert.equal(fail.stage,'error');assert.equal(fail.failedStage,'nature');assert.equal(fail.error,'index.json 404');assert.ok(fail.progress>.3&&fail.progress<.5);
 assert.equal(t.ready(),fail);assert.equal(t.start(),null);assert.equal(t.snapshot().phase,'error');
});

test('첫 프레임 안정: 컴파일 중이거나 100ms를 넘는 프레임은 연속 횟수를 0으로 되돌린다',()=>{
 const s=createStabilityCounter({count:3,limitMs:100});
 assert.equal(s.sample(16,false),false);assert.equal(s.sample(16,false),false);assert.equal(s.sample(250,false),false);assert.equal(s.stable,0);
 s.sample(16,true);assert.equal(s.stable,0);
 s.sample(16,false);s.sample(20,false);assert.equal(s.sample(30,false),true);assert.equal(s.fraction,1);
});

test('main.js는 실제 await 지점마다 단계를 알리고 준비 조건을 확인한 뒤 시작한다',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 for(const pattern of [/loading\.set\('terrain',\.6\)/,/loading\.done\('terrain'\)/,/loading\.set\('nature',\.95\*f\)/,/loading\.done\('nature'\)/,/loading\.set\('facilities'/,/loading\.done\('hikers'\)/,/loading\.set\('environment',\.3\+\.6\*f\)/,/loading\.done\('environment'\)/,/loading\.set\('stabilizing'/])assert.match(main,pattern);
 assert.match(main,/nearLod:landscape\.status\.natureReady===true/);assert.match(main,/terrainMissing/);
 assert.match(main,/loading\.ready\(\{readiness:readyInfo\}\);resolveReady/);
 assert.match(main,/if\(!manualStart\)startRequested=true;beginHike\(\)/);
 assert.match(main,/started=true;window\.hiking\.started=true;input\.clear\(\)/);
 assert.match(main,/window\.addEventListener\(START_EVENT,/);assert.match(main,/addEventListener\('unhandledrejection'/);
 assert.doesNotMatch(main,/setInterval\([^)]*loading/,'시간 기반 가짜 진행 없음');
});
