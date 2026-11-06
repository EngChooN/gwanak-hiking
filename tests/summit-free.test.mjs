import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,advance,restore,playerPosition,setPlayerPosition,positionAt,lateralLimit} from '../src/movement.js';
import {route,sample} from '../src/route.js';
import {SUMMIT_ENTER_S,SUMMIT_CENTER,SUMMIT_RADIUS,ROUTE_END,insideSummit,projectToRoute,facilityBlocks,summitStepOk,summitWalkMap,summitMove,reachedSummit} from '../src/summit.js';
// 시험용 땅: 정상 둘레는 평평(634m)하고, 길 끝 북쪽(z가 작은 쪽) 8m 너머(CLIFF_Z)는 2m 만에 12m 떨어지는 낭떠러지다.
const CLIFF_Z=ROUTE_END.z-8,flat=(x,z)=>z>CLIFF_Z?634:634-Math.min(12,(CLIFF_Z-z)*6);
const marker={id:'marker',x:SUMMIT_CENTER.x+6,z:SUMMIT_CENTER.z+4,supportRadius:1.5};
const makeGround=(sites=[marker],height=flat)=>({height:(x,z)=>height(x,z),canMove:()=>true,summit:{sites:()=>sites,height,canStep:(a,b)=>summitStepOk(height,a,b)}});
const stateAt=(x,z,heading,extra={})=>({...initialState({start:'summit'}),zone:'summit',summit:{x,z,heading},plaza:null,...extra});
const run=(state,input,seconds,ground,dt=.05)=>{for(let t=0;t<seconds;t+=dt)advance(state,input,dt,()=>{},ground);return state;};
const headingTo=(fx,fz,tx,tz)=>Math.atan2(-(tx-fx),-(tz-fz));
test('정상 구역 입구는 길 끝 40m 앞, 마루는 길 끝 80m 안 최고점',()=>{
 assert.ok(Math.abs(SUMMIT_ENTER_S-(route.length-40))<1e-9);
 assert.ok(SUMMIT_CENTER.y>=Math.max(...Array.from({length:81},(_,d)=>sample(route.length-d).y))-1e-9);
 assert.ok(insideSummit(SUMMIT_CENTER.x,SUMMIT_CENTER.z)&&!insideSummit(SUMMIT_CENTER.x+SUMMIT_RADIUS,SUMMIT_CENTER.z));
});
test('코스 좌표↔월드 좌표 투영이 positionAt과 맞는다(길 위·길 옆)',()=>{
 for(const s of [route.length-30,route.length-10])for(const lateral of [-2,0,3]){
  const [x,,z]=positionAt(s,lateral),r=projectToRoute(x,z);assert.ok(Math.abs(r.s-s)<.5&&Math.abs(r.lateral-lateral)<.5,`${s} ${lateral} → ${r.s} ${r.lateral}`);
 }
});
test('ground.summit이 있으면 정상 구역으로 넘어가고, 길 끝에 닿아도 멈추지 않는다(처음 한 번만 도착 표시)',()=>{
 const ground=makeGround([]),state=initialState({start:'summit'});
 advance(state,{forward:1},.05,()=>{},ground);
 assert.equal(state.zone,'summit');assert.equal(state.summitArrived,false);
 // 길 끝 쪽으로 걷는다. 도착해도 멈추지 않는다.
 let arrivedAt=null;for(let i=0;i<2400&&arrivedAt===null;i++){advance(state,{forward:1},.05,()=>{},ground);if(state.summitArrived)arrivedAt=i;}
 assert.notEqual(arrivedAt,null,'도착 표시');assert.equal('paused' in state,false);assert.equal(state.zone,'summit');
 // 그 뒤에도 계속 걷는다.
 const at={...state.summit};run(state,{forward:1},3,ground);
 assert.equal(state.summitArrived,true);assert.ok(Math.hypot(state.summit.x-at.x,state.summit.z-at.z)>.5,'도착 뒤에도 걷는다');
});
test('ground.summit이 없으면 예전처럼 길 끝에서 멈춘다',()=>{
 const state=initialState({start:'summit'});run(state,{forward:1},60,undefined);
 assert.equal(state.zone,'route');assert.equal(state.s,route.length);
});
test('정상 구역에서는 길 밖으로도 W/A/S/D로 걷는다(옆걸음·뒷걸음 포함)',()=>{
 const ground=makeGround([]),h=headingTo(SUMMIT_CENTER.x,SUMMIT_CENTER.z,SUMMIT_CENTER.x,SUMMIT_CENTER.z+10);
 for(const input of [{forward:1},{forward:-1},{side:1},{side:-1}]){
  const state=stateAt(SUMMIT_CENTER.x,SUMMIT_CENTER.z+8,h,{summitArrived:true}),before={...state.summit};run(state,input,2,ground);
  assert.ok(Math.hypot(state.summit.x-before.x,state.summit.z-before.z)>.4,JSON.stringify(input));assert.equal(state.zone,'summit');
 }
});
test('낭떠러지(40° 넘는 경사)에서 막힌다',()=>{
 const ground=makeGround([]),x=ROUTE_END.x,z=ROUTE_END.z-1,state=stateAt(x,z,headingTo(x,z,x,z-20),{summitArrived:true});
 run(state,{forward:1,run:true},20,ground);
 assert.ok(state.summit.z>=CLIFF_Z-.05,`낭떠러지 선 ${CLIFF_Z.toFixed(1)}을 넘음: ${state.summit.z.toFixed(2)}`);assert.ok(state.summit.z<z-3,'절벽 앞까지는 걷는다');
 assert.equal(summitStepOk(flat,{x,z:CLIFF_Z+1},{x,z:CLIFF_Z-2}),false);assert.equal(summitStepOk(flat,{x,z:CLIFF_Z+5},{x,z:CLIFF_Z+1}),true);
});
test('한 프레임 이동(수 cm)으로도 절벽 가장자리에서 한 발 더 내딛지 못한다',()=>{
 const x=ROUTE_END.x,z=CLIFF_Z+.3;let at=z;
 for(let i=0;i<200;i++){const q=at-.02;if(!summitStepOk(flat,{x,z:at},{x,z:q}))break;at=q;}
 assert.ok(at>=CLIFF_Z-.5,String(at));
});
test('계단 디딤판(한 단 0.36m까지) 오르내림은 막히지 않는다',()=>{
 const tread=(x,z)=>Math.floor(z/.3)*.18,a={x:0,z:0};
 for(let z=0;z<8;z+=.03)assert.equal(summitStepOk(tread,{x:0,z},{x:0,z:z+.03}),true,String(z));
 const cliff=(x,z)=>Math.floor(z/.3)*.5;let blocked=0;for(let z=0;z<8;z+=.03)if(!summitStepOk(cliff,{x:0,z},{x:0,z:z+.03}))blocked++;assert.ok(blocked>0);
});
test('시설(정상석) 안으로는 못 들어가고, 안쪽에서 바깥으로는 나올 수 있다',()=>{
 const ground=makeGround(),from={x:marker.x-6,z:marker.z},state=stateAt(from.x,from.z,headingTo(from.x,from.z,marker.x,marker.z),{summitArrived:true});
 run(state,{forward:1,run:true},20,ground);
 const d=Math.hypot(state.summit.x-marker.x,state.summit.z-marker.z);assert.ok(d>=marker.supportRadius+.3,`정상석 반경 안으로 들어감: ${d.toFixed(2)}`);assert.ok(d<4.5,'정상석 앞까지는 간다');
 assert.equal(facilityBlocks([marker],{x:marker.x-6,z:marker.z},{x:marker.x-1,z:marker.z}),'marker');
 assert.equal(facilityBlocks([marker],{x:marker.x-1,z:marker.z},{x:marker.x-3,z:marker.z}),null);
 assert.equal(facilityBlocks([{id:'helipad',x:0,z:0,supportRadius:8}],{x:20,z:0},{x:0,z:0}),null,'헬기장 공터는 걷는다');
});
test('구역 원(반경 45m) 밖으로는 나가지 않는다',()=>{
 const ground=makeGround([]),x=ROUTE_END.x,z=ROUTE_END.z,state=stateAt(x,z,headingTo(x,z,x-60,z),{summitArrived:true});
 run(state,{forward:1,run:true},20,ground);
 assert.ok(Math.hypot(state.summit.x-SUMMIT_CENTER.x,state.summit.z-SUMMIT_CENTER.z)<=SUMMIT_RADIUS);
});
test('계단 디딤판(한 단 0.18m 튐) 위에서도 걸음이 멈추지 않는다: 오르내림 모두',()=>{
 const sp=route.length-33,p=sample(sp),q=sample(sp+1),up=headingTo(p.x,p.z,q.x,q.z),tread=(x,z)=>Math.round(sample(Math.max(0,Math.min(route.length,projectToRoute(x,z).s))).y/.18)*.18;
 const ground={height:tread,canMove:()=>true,summit:{sites:()=>[],height:tread,canStep:(a,b)=>summitStepOk(tread,a,b)}};
 for(const heading of [up,up+Math.PI]){const state=stateAt(p.x,p.z,heading,{s:sp,summitArrived:true}),before=projectToRoute(p.x,p.z).s;run(state,{forward:1},4,ground,.016);
  assert.ok(Math.abs(projectToRoute(state.summit?.x??p.x,state.summit?.z??p.z).s-before)>.8||state.zone==='route','디딤판 모서리에서 멈춤');}
});
test('하산: 정상 구역에서 길 쪽(s 감소)으로 내려서면 코스 이동으로 이어지고, 다시 올라오면 정상 구역이다',()=>{
 const ground=makeGround([]),s0=route.length-32,p=sample(s0),q=sample(s0-1),heading=headingTo(p.x,p.z,q.x,q.z);
 const state=stateAt(p.x,p.z,heading,{s:s0,summitArrived:true});
 for(let i=0;i<1200&&state.zone==='summit';i++)advance(state,{forward:1,yaw:0},.05,()=>{},ground);
 assert.equal(state.zone,'route');assert.ok(state.s<SUMMIT_ENTER_S+1e-6);assert.equal(state.summit,null);
 const down=state.s;run(state,{forward:1,yaw:Math.PI},4,ground);assert.ok(state.s<down-.5,'코스 이동으로 계속 내려간다');
 // 되돌아 올라가면(앞으로) 다시 정상 구역
 for(let i=0;i<1200&&state.zone==='route';i++)advance(state,{forward:1,yaw:0},.05,()=>{},ground);
 assert.equal(state.zone,'summit');
});
test('정상 원 안에서는 길 둘레 한도 밖 평지도 걷고, 코스 이동으로는 한도 안에서만 넘어간다',()=>{
 const G=makeGround([]).summit,s0=route.length-50,p=sample(s0);let checked=0;
 for(const side of [-1,1])for(let off=lateralLimit(s0)+2;off<lateralLimit(s0)+14;off+=2){
  const q={x:p.x+p.nx*side*off,z:p.z+p.nz*side*off},r=projectToRoute(q.x,q.z);
  if(r.s>=SUMMIT_ENTER_S||Math.abs(r.lateral)<=lateralLimit(r.s)||!insideSummit(q.x,q.z))continue;
  const from={x:q.x-p.nx*side*.3,z:q.z-p.nz*side*.3};checked++;
  const m=summitMove(G,[],from,q,lateralLimit);assert.ok(m,'한도 밖이어도 원 안 평지는 걷는다(보이지 않는 벽 없음)');assert.equal(m.toRoute,false,'한도 밖에서는 정상 구역에 남는다');
 }
 assert.ok(checked>0);
 // 한도 안 길 위로 내려서면 코스 이동으로 넘어간다.
 const on=sample(SUMMIT_ENTER_S-3),m=summitMove(G,[],{x:on.x+.2,z:on.z},{x:on.x,z:on.z},lateralLimit);assert.ok(m&&m.toRoute);
 // 한도 밖에서 걷다가 원 밖으로는 못 나간다.
 const out=summitMove(G,[],{x:SUMMIT_CENTER.x+SUMMIT_RADIUS-.5,z:SUMMIT_CENTER.z},{x:SUMMIT_CENTER.x+SUMMIT_RADIUS+.5,z:SUMMIT_CENTER.z},lateralLimit);assert.equal(out,null);
});
test('저장·복원: 정상 구역 위치와 도착 표시가 그대로 돌아온다',()=>{
 const ground=makeGround([]),state=stateAt(SUMMIT_CENTER.x+3,SUMMIT_CENTER.z+3,1.2,{summitArrived:true,s:route.length-10});
 run(state,{side:1},1,ground);const raw=JSON.stringify(state),back=restore(raw);
 assert.equal(back.zone,'summit');assert.ok(Math.abs(back.summit.x-state.summit.x)<1e-9&&Math.abs(back.summit.z-state.summit.z)<1e-9&&back.summit.heading===state.summit.heading);
 assert.equal(back.summitArrived,true);assert.equal('paused' in back,false);assert.equal(back.plaza,null);
 // 구역 원 밖으로 저장돼 있으면 코스 위치로 되돌린다.
 const bad=JSON.parse(raw);bad.summit.x=SUMMIT_CENTER.x+500;const fallback=restore(JSON.stringify(bad));assert.equal(fallback.zone,'route');assert.equal(fallback.summit??null,null);
});
test('playerPosition·setPlayerPosition: summit 구역 왕복',()=>{
 const state=initialState({start:'summit'}),at={zone:'summit',x:SUMMIT_CENTER.x+2,z:SUMMIT_CENTER.z-3,heading:.7};
 assert.equal(setPlayerPosition(state,at),true);const back=playerPosition(state);
 assert.deepEqual([back.zone,back.x,back.z,back.heading],['summit',at.x,at.z,at.heading]);assert.ok(Number.isFinite(back.s));
 assert.equal(setPlayerPosition(state,{zone:'summit',x:SUMMIT_CENTER.x+999,z:0,heading:0}),false);
 assert.equal(setPlayerPosition(state,{zone:'route',s:100,lateral:0}),true);assert.equal(state.zone,'route');assert.equal(state.summit,null);
});
test('도착 판정: 길 끝 또는 정상석 가까이',()=>{
 assert.equal(reachedSummit(ROUTE_END.x,ROUTE_END.z,[]),true);assert.equal(reachedSummit(ROUTE_END.x+6,ROUTE_END.z,[]),false);
 assert.equal(reachedSummit(marker.x+3,marker.z,[marker]),true);assert.equal(reachedSummit(marker.x+9,marker.z,[marker]),false);
});
test('걸을 수 있는 범위 지도: 입구에서 번지며 낭떠러지·시설·원 밖은 빠진다',()=>{
 const G=makeGround().summit,m=summitWalkMap(G,lateralLimit,{cell:2}),at=(x,z)=>{const i=Math.round((x-m.x0)/m.cell),j=Math.round((z-m.z0)/m.cell);return m.walk[j*m.n+i]===1;};
 assert.ok(m.walkable>200);assert.equal(at(SUMMIT_CENTER.x,SUMMIT_CENTER.z+4),true);
 assert.equal(at(ROUTE_END.x,CLIFF_Z-6),false,'낭떠러지 아래');assert.equal(at(marker.x,marker.z),false,'정상석');assert.equal(at(SUMMIT_CENTER.x+SUMMIT_RADIUS+2,SUMMIT_CENTER.z),false,'원 밖');
});
test('바위 충돌 안에 서 있으면 빠져나올 수 있고, 밖에서는 바위로 들어가지 못한다',()=>{
 const flat0=()=>634,inRock=(x,z)=>Math.hypot(x,z)<1;
 assert.equal(summitStepOk(flat0,{x:-2,z:0},{x:-.5,z:0},{rockBlocked:inRock}),false,'밖→안 막힘');
 assert.equal(summitStepOk(flat0,{x:-.5,z:0},{x:-.55,z:0},{rockBlocked:inRock}),true,'안→밖 허용');
});
