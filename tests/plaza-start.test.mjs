import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {route,sample,speedFor,entrancePolygon,DEMO_START,ENTRANCE_START,blockedByGate} from '../src/route.js';
import {initialState,restore,advance,positionAt,playerPosition,setPlayerPosition,courseDistance,COURSE_LENGTH,ROUTE_MIN_S,setPose,RUN_MULTIPLIER} from '../src/movement.js';
import {GATE_S,PLAZA_START,plazaPolygon,plazaArea,insidePlaza,toGate,fromGate,routeFromWorld,GATE_CENTER_X} from '../src/plaza.js';
import {entranceConfig} from '../src/entrance-config.js';
const pos=s=>playerPosition(s);
const walk=(state,input,seconds,dt=.05,onStep)=>{for(let t=0;t<seconds;t+=dt)advance(state,input,dt,onStep);return state;};
const plazaAt=(gx,gz,heading=PLAZA_START.heading)=>{const q=fromGate(gx,gz),s=initialState({start:'plaza'});s.plaza={x:q.x,z:q.z,heading};return s;};

test('광장 경계는 조사 다각형(문 8~38m·폭 12m)을 포함하고 6~10명이 설 넓이다',()=>{
 for(const p of entrancePolygon)assert.ok(insidePlaza(p.x+(PLAZA_START.x-p.x)*.05,p.z+(PLAZA_START.z-p.z)*.05,0),'조사 다각형 꼭짓점 근처가 광장 안');
 assert.ok(plazaArea>=360&&plazaArea<480,`면적 ${plazaArea}`);
 assert.ok(insidePlaza(PLAZA_START.x,PLAZA_START.z));
 const g=toGate(PLAZA_START.x,PLAZA_START.z);assert.ok(Math.abs(g.gx)<.2&&Math.abs(g.gz-30)<.5,'출발점은 문 정면 축 30m');
 // 먼 쪽(약 38m 차도 앞)·옆(±6m) 밖은 광장이 아니다.
 assert.equal(insidePlaza(...Object.values(fromGate(0,39))),false);assert.equal(insidePlaza(...Object.values(fromGate(6.1,20))),false);
});

test('광장에서는 어느 방향으로 돌아 걸어도 경계 밖으로 나가지 못하고 속도는 포장길 속도 이하다',()=>{
 for(let k=0;k<16;k++){
  const state=initialState({start:'plaza'});state.plaza.heading=k/16*Math.PI*2;
  for(const input of [{forward:1},{side:1},{forward:-1,side:-1}]){
   for(let i=0;i<500;i++){const before=pos(state);advance(state,input,.1);const after=pos(state);
    if(state.zone==='route'){assert.ok(state.s>=ROUTE_MIN_S);break;}
    assert.ok(insidePlaza(after.x,after.z),`경계 이탈 heading ${k}`);assert.equal(blockedByGate(after.x,after.z),false);
    assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<=speedFor(0,'paved')*.1+1e-6);}
  }
 }
});

test('W는 시선(plaza.heading) 방향, A/D는 그 옆 방향으로 움직인다',()=>{
 for(const heading of [0,1,-2.3]){
  const state=initialState({start:'plaza'});state.plaza.heading=heading;const a=pos(state);advance(state,{forward:1},.1);const b=pos(state);
  const d=Math.atan2(-(b.x-a.x),-(b.z-a.z));assert.ok(Math.abs(Math.atan2(Math.sin(d-heading),Math.cos(d-heading)))<1e-6);
  const c=initialState({start:'plaza'});c.plaza.heading=heading;advance(c,{side:1},.1);const e=pos(c);
  assert.ok(Math.abs((e.x-a.x)*Math.cos(heading)-(e.z-a.z)*Math.sin(heading)-speedFor(0,'paved')*.1)<1e-6,'D는 오른쪽');
 }
});

test('일주문 통로를 지나면 코스(s≥GATE_S)로 이어지고 위치가 튀지 않는다',()=>{
 const state=plazaAt(GATE_CENTER_X,3,PLAZA_START.heading);let prev=pos(state),switched=null;
 for(let i=0;i<200&&!(state.zone==='route'&&state.s>GATE_S+3);i++){const z=state.zone;advance(state,{forward:1},.05);const now=pos(state);
  assert.ok(Math.hypot(now.x-prev.x,now.z-prev.z)<=speedFor(0,'paved')*.05+1e-6,'프레임 간 이동은 속도 예산 이내');
  if(z!==state.zone)switched={i,s:state.s,lateral:state.lateral,course:courseDistance(state)};prev=now;}
 assert.ok(switched,'코스로 전환');assert.equal(state.zone,'route');
 assert.ok(switched.s>=ROUTE_MIN_S&&switched.course<.1,`전환 지점 일주문 0m 부근 ${switched.course}`);
 assert.ok(Math.abs(switched.lateral)<.6);
 // 코스 좌표는 positionAt과 정확히 맞물린다.
 const back=routeFromWorld(prev.x,prev.z,(s,l)=>positionAt(s,l));assert.ok(Math.abs(back.s-state.s)<1e-6&&Math.abs(back.lateral-state.lateral)<1e-6);
});

test('코스에서 뒤로 걸어 일주문을 지나면 광장으로 돌아오고, 다시 앞으로 가면 코스로 이어진다',()=>{
 const state=initialState({start:'gate'});state.lateral=GATE_CENTER_X;walk(state,{forward:1},3);assert.equal(state.zone,'route');
 let prev=pos(state),zones=[];
 for(let i=0;i<200;i++){const z=state.zone;advance(state,{forward:-1},.05);const now=pos(state);assert.ok(Math.hypot(now.x-prev.x,now.z-prev.z)<=speedFor(0,'paved')*.05+1e-6);if(z!==state.zone)zones.push(state.zone);prev=now;}
 assert.deepEqual(zones,['plaza']);assert.ok(insidePlaza(prev.x,prev.z));assert.equal(courseDistance(state),0);
 // 광장에서 돌아갈 때는 코스의 몸 방향을 그대로 이어받는다(뒤로 걷기 = 문을 바라본 채 물러서기).
 assert.ok(Math.abs(state.plaza.heading-sample(ROUTE_MIN_S+1).heading)<1e-9);
 walk(state,{forward:1},8);assert.equal(state.zone,'route');assert.ok(state.s>ROUTE_MIN_S);
});

test('자동 걷기(R)는 광장 어디서든 일주문 통로로 가서 코스를 계속 간다',()=>{
 for(const [gx,gz] of [[0,30],[-5,20],[5,12],[4,9],[-4.5,35],[1.4,2.2]]){
  const state=plazaAt(gx,gz,0);state.auto=true;let entered=false;
  for(let i=0;i<4000&&!(state.zone==='route'&&state.s>5);i++){advance(state,{},.05);const p=pos(state);assert.equal(blockedByGate(p.x,p.z),false);if(state.zone==='route')entered=true;}
  assert.ok(entered&&state.s>5,`(${gx},${gz})에서 코스 진입`);assert.equal(state.auto,true);
 }
});

test('광장에서도 달리기·앉기·차 마시기 규칙이 같다',()=>{
 const run=initialState({start:'plaza'}),walkState=initialState({start:'plaza'});
 advance(run,{forward:-1,run:true},.1);advance(walkState,{forward:-1},.1);
 assert.ok(Math.abs(run.distance/walkState.distance-RUN_MULTIPLIER)<1e-6);assert.ok(run.stamina<100);
 const sit=initialState({start:'plaza'});setPose(sit,'sit');const before=pos(sit);advance(sit,{},.1);assert.deepEqual(pos(sit),before);
 const steps=[];walk(initialState({start:'plaza'}),{forward:-1},3,.05,e=>steps.push(e));
 assert.ok(steps.length>=3&&steps.every(e=>e.zone==='plaza'&&e.material==='paved'&&e.s===null));
});

test('출발 옵션: plaza(광장)·gate(일주문 아래)·demo(545m)',()=>{
 const plaza=initialState({start:'plaza'}),gate=initialState({start:'gate'}),demo=initialState();
 assert.equal(plaza.zone,'plaza');assert.deepEqual(plaza.plaza,{...PLAZA_START});
 assert.equal(gate.zone,'route');assert.ok(Math.abs(gate.s-GATE_S)<1e-5);assert.equal(courseDistance(gate),gate.s-GATE_S);
 assert.equal(demo.zone,'route');assert.equal(demo.s,DEMO_START);assert.deepEqual(initialState({entrance:true}),plaza);
 assert.ok(Math.abs(COURSE_LENGTH-(route.length-GATE_S))<1e-9);
 const [gx,,gz]=positionAt(gate.s,0),g=toGate(gx,gz);assert.ok(Math.hypot(g.gx,g.gz)<1e-3,'gate 출발은 일주문 아래');
});

test('저장: 광장 x·z·방향 저장·복원, 예전 형식·다른 가설·경계 밖 저장 처리',()=>{
 const state=plazaAt(-3,15,.7);state.elapsed=12;state.steps=5;
 const restored=restore(JSON.stringify(state));
 assert.equal(restored.zone,'plaza');assert.deepEqual(restored.plaza,state.plaza);assert.equal(restored.elapsed,12);assert.equal(restored.paused,true);
 // 경계 밖 좌표는 출발점으로
 const outside=restore(JSON.stringify({...state,plaza:{x:state.plaza.x+500,z:state.plaza.z,heading:0}}));assert.deepEqual(outside.plaza,{...PLAZA_START});
 // 다른 일주문 가설에서 저장한 광장은 새 출발
 const other=restore(JSON.stringify({...state,entranceHypothesis:'A'}));assert.equal(other.zone,'plaza');assert.equal(other.elapsed,0);
 // 예전 형식: zone 없음. s<GATE_S는 그 월드 위치의 광장, s≥GATE_S는 코스.
 const {zone,plaza,...legacy}=initialState({start:'demo'});
 const oldPlaza=restore(JSON.stringify({...legacy,s:ENTRANCE_START+5,lateral:1}));assert.equal(oldPlaza.zone,'plaza');
 const [ox,,oz]=positionAt(ENTRANCE_START+5,1);assert.ok(Math.hypot(oldPlaza.plaza.x-ox,oldPlaza.plaza.z-oz)<1e-9);
 const oldRoute=restore(JSON.stringify({...legacy,s:GATE_S+10,lateral:.3}));assert.equal(oldRoute.zone,'route');assert.ok(Math.abs(oldRoute.s-(GATE_S+10))<1e-9);
 const oldMountain=restore(JSON.stringify({...legacy,s:2000,lateral:.2}));assert.equal(oldMountain.zone,'route');assert.equal(oldMountain.s,2000);assert.equal(oldMountain.plaza,null);
 // 새 형식 코스 저장
 const routeSave=restore(JSON.stringify({...initialState(),s:1234}));assert.equal(routeSave.zone,'route');assert.equal(routeSave.s,1234);
});

test('플레이어 위치 읽기·쓰기 함수 하나: {zone,x,z,heading,s,lateral}',()=>{
 const state=initialState({start:'plaza'});const p=playerPosition(state);
 assert.deepEqual(Object.keys(p).sort(),['heading','lateral','s','x','z','zone']);assert.equal(p.zone,'plaza');assert.equal(p.s,null);
 const target=initialState();assert.equal(setPlayerPosition(target,p),true);assert.deepEqual(playerPosition(target),p);
 assert.equal(setPlayerPosition(target,{zone:'plaza',x:p.x+999,z:p.z,heading:0}),false,'경계 밖은 거부');
 assert.equal(setPlayerPosition(target,{zone:'route',s:2500,lateral:.4}),true);const r=playerPosition(target);
 assert.equal(r.zone,'route');assert.equal(r.s,2500);assert.equal(r.lateral,.4);assert.equal(r.heading,sample(2500).heading);
 const [x,,z]=positionAt(2500,.4);assert.equal(r.x,x);assert.equal(r.z,z);assert.equal(target.plaza,null);
 assert.equal(setPlayerPosition(target,{zone:'route',s:-500}),true);assert.ok(target.s>=ROUTE_MIN_S,'코스는 일주문 앞으로 넘어가지 않는다');
});

test('main.js 연결: 로딩 전 입력·시간 차단, 광장 표시·zone 신호, 출발 옵션, favicon 404 제거',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/function command\(id(,value)?\)\{if\(!started\)return;/);
 assert.match(main,/const cmd=(walkInput\(state,)?started\?input\.read\(\):\{forward:0,side:0,run:false,turn:0\}/);
 assert.match(main,/speed=started\?frameMetrics\.stage\('movement'/);
 assert.match(main,/if\(started&&now-saveAt>700\)/);
 assert.match(main,/zone:state\.zone,courseDistance:course/);assert.match(main,/출발 전 · 광장 · /);
 assert.match(main,/\{entrance:'plaza',plaza:'plaza',gate:'gate',demo:'demo',summit:'summit'\}\[startParam\]/);
 assert.match(main,/saved\?restore\(saved\):initialState\(\{start:'plaza'\}\)/);
 assert.match(main,/window\.hiking=\{started:false,ready:\(\)=>readyPromise/);
 assert.match(main,/surfaceHeight|walkingGround\.height\(state\.plaza\.x,state\.plaza\.z,false\)/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<link rel="icon" href="\/favicon\.svg"/);assert.ok(existsSync(new URL('../public/favicon.svg',import.meta.url)));
 assert.equal(entranceConfig.hypothesis,'B');
});
