// 이동 구역 경계(길↔길 밖·진입로↔GPX·등산로↔정상) 걷기 회귀 시험. 실제 지형 진단은 scripts/probe-boundary-walk.mjs(2026-11-06).
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,advance,positionAt,isOffTrail,lateralLimit,setPlayerPosition} from '../src/movement.js';
import {sample,route} from '../src/route.js';
import {GATE_S} from '../src/plaza.js';
import {SUMMIT_ENTER_S,SUMMIT_EXIT_MARGIN,insideSummit,summitMove,summitStepOk,projectToRoute} from '../src/summit.js';
import {MAX_WALK_SLOPE} from '../src/walking-ground.js';
const run=(state,input,seconds,ground,dt=1/60)=>{for(let t=0;t<seconds;t+=dt)advance(state,input,dt,()=>{},ground);return state;};
// 시험용 땅: s0 둘레를 길 방향 경사 그대로 이은 평면인데, 노면(GPX 중심선)보다 drop m 낮다(길이 돋워져 있음).
// canMove는 walking-ground와 같은 높이 단차 규칙(약 45°)과, 선택한 벽(wall(x,z)가 참이면 막힘)만 본다.
function terrainAround(s0,{drop=.3,wall=null}={}){
 const p=sample(s0),a=sample(s0-2),b=sample(s0+2),len=Math.hypot(b.x-a.x,b.z-a.z),tx=(b.x-a.x)/len,tz=(b.z-a.z)/len;
 const y=(x,z)=>p.y-drop+p.slope*((x-p.x)*tx+(z-p.z)*tz);
 return {height:(x,z)=>y(x,z),canMove:(A,B)=>{const h=Math.hypot(B[0]-A[0],B[2]-A[2]);return Math.abs(B[1]-A[1])<=MAX_WALK_SLOPE*h+1e-5&&!(wall&&wall(B[0],B[2]));},frame:{tx,tz,nx:-tz,nz:tx,p}};
}
const stateAt=(s,lateral)=>{const st=initialState({start:'gate'});setPlayerPosition(st,{zone:'route',s,lateral});return st;};

test('길 가장자리 높이 단차(노면 0.3m 돋움)가 있어도 길 밖으로 나가고 다시 들어온다',()=>{
 for(const s0 of [300,1200,2600]){const half=sample(s0).width/2,ground=terrainAround(s0);
  for(const side of [-1,1]){
   const st=run(stateAt(s0,0),{side},6,ground);
   assert.ok(st.lateral*side>=half+2,`s=${s0} 옆 ${side}: 길 밖으로 나감 (lateral ${st.lateral.toFixed(2)})`);
   run(st,{side:-side},6,ground);
   assert.ok(st.lateral*side<=half-.3,`s=${s0} 옆 ${side}: 길 안으로 돌아옴 (lateral ${st.lateral.toFixed(2)})`);
  }}
});

test('막히면 멈추지 않고 벽을 따라 미끄러진다',()=>{
 // 길 밖 s0+2m 앞에 가로 벽. 비스듬히(앞+옆) 걸으면 앞 성분은 막히고 옆으로 계속 간다.
 const s0=1200,G=terrainAround(s0),{p,tx,tz}=G.frame,ground=terrainAround(s0,{wall:(x,z)=>(x-p.x)*tx+(z-p.z)*tz>2});
 const st=stateAt(s0,sample(s0).width/2+1),startLateral=st.lateral;
 run(st,{forward:1,side:1},5,ground);
 const [x,,z]=positionAt(st.s,st.lateral);
 assert.ok((x-p.x)*tx+(z-p.z)*tz<=2.05,'벽을 넘지 않는다');
 assert.ok(st.lateral-startLateral>2,`옆으로 미끄러져 나아감 (${(st.lateral-startLateral).toFixed(2)}m)`);
});

test('45° 넘는 낭떠러지는 여전히 막는다',()=>{
 const s0=1200,{p,nx,nz}=terrainAround(s0).frame,base=terrainAround(s0),half=sample(s0).width/2;
 const cliff={...base,height:(x,z)=>{const l=(x-p.x)*nx+(z-p.z)*nz;return base.height(x,z)-(l>half+1?(l-half-1)*1.5:0);}};
 const st=run(stateAt(s0,0),{side:1},8,cliff);
 assert.ok(st.lateral<=half+1.05,`낭떠러지 앞에서 멈춤 (lateral ${st.lateral.toFixed(2)})`);
});

test('일주문~GPX 시작 진입로(폭 12m)는 옆으로 걸을 수 있고, s=0에서 옆 위치가 끊기지 않는다',()=>{
 assert.ok(GATE_S<-20);
 assert.equal(lateralLimit(-15),sample(-15).width/2+8);
 assert.equal(isOffTrail(-15,5),false);assert.equal(isOffTrail(-15,7),true);
 const st=run(stateAt(-15,0),{side:1},6);assert.ok(st.lateral>=3.5,`진입로 옆으로 3.5m 넘게 (lateral ${st.lateral.toFixed(2)})`);
 for(const l of [-3,-1.5,1.5,3]){const a=positionAt(-1e-7,l),b=positionAt(1e-7,l);assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])<.01,`s=0 옆 ${l}m 연속`);}
 for(const l of [-1.5,0,1.5]){const s=run(stateAt(-5,l),{forward:1},12);assert.ok(s.s>=4,`진입로 → GPX 코스 (옆 ${l}m, s=${s.s.toFixed(2)})`);}
});

test('정상 → 코스 전환은 입구보다 1m 아래에서만(입구 근처 전환 왕복 방지)',()=>{
 assert.equal(SUMMIT_EXIT_MARGIN,1);
 const G={height:()=>0,canStep:(a,b)=>summitStepOk(()=>0,a,b)},at=s=>{const p=sample(s);return {x:p.x,z:p.z};};
 const near=at(SUMMIT_ENTER_S-.5),far=at(SUMMIT_ENTER_S-1.5);
 assert.equal(summitMove(G,[],{x:near.x+.05,z:near.z},near,lateralLimit)?.toRoute,false);
 assert.equal(summitMove(G,[],{x:far.x+.05,z:far.z},far,lateralLimit)?.toRoute,true);
});

test('길 옆 한도 밖이어도 정상 원 안이면 정상 구역으로 넘어가 걷는다',()=>{
 const s0=SUMMIT_ENTER_S-5,y=sample(s0).y,flat=()=>y,ground={height:flat,canMove:()=>true,summit:{sites:()=>[],height:flat,canStep:(a,b)=>summitStepOk(flat,a,b)}};
 // 시험 자리: 한도 밖 1.5m가 정상 원 안이고, 갈지자 아래 길 다리(다른 s)에 닿지 않는 쪽. 다른 다리에 닿으면 그 길 위치로 이어지는 게 맞다.
 const side=[-1,1].find(k=>{const [x,,z]=positionAt(s0,k*(lateralLimit(s0)+1.5));return insideSummit(x,z)&&Math.abs(projectToRoute(x,z).s-s0)<3;});
 assert.ok(side,'시험 자리');
 const st=stateAt(s0,side*(lateralLimit(s0)-.05));run(st,{side},3,ground);
 assert.equal(st.zone,'summit');
 const [x,,z]=positionAt(s0,side*lateralLimit(s0));assert.ok(Math.hypot(st.summit.x-x,st.summit.z-z)>.5,'한도 선을 넘어 더 걸어감');
});
