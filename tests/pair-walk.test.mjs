// 같이 등산하기 — 나란히 걷기 자리 계산 시험(2026-11-08): 좌우·앞뒤 자리, 밀어내기, 길 밖으로 안 밀림, 자동 걷기 속도.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PAIR} from '../src/multi-protocol.js';
import {pairMode,sideOf,sideLateral,isLeader,pushStep,pushToRoute,routeNudge,autoPace,filePace,pairGuide,projectNear} from '../src/pair-walk.js';
import {sample,route,isStairs} from '../src/route.js';
import {secondsLeft,chipModel,rowModel} from '../src/pair-ui.js';

const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
// 곧은 길(북쪽으로, x=0): s가 늘면 z가 줄어든다. 오른쪽 법선 = +x
const straight=s=>({x:0,z:-s});
const here=(width,stairs=false)=>({width,stairs,normal:{x:1,z:0},forward:{x:0,z:-1}});
const at=(s,l)=>({zone:'route',x:l,z:-s,s,lateral:l});

test('자리 방식: 길 폭 1.6m 이상·계단 아님 = 좌우, 좁거나 계단 = 앞뒤',()=>{
 assert.equal(pairMode({width:1.8,stairs:false}),'side');
 assert.equal(pairMode({width:1.6,stairs:false}),'side');
 assert.equal(pairMode({width:1.5,stairs:false}),'file');
 assert.equal(pairMode({width:3,stairs:true}),'file');
});
test('좌우: ID가 작은 사람이 왼쪽(-), 중심선 ±0.5m(간격 1.0m), 좁은 길은 가장자리 0.3m 안으로',()=>{
 assert.equal(sideOf('a1','b2'),-1);assert.equal(sideOf('b2','a1'),1);
 assert.equal(sideLateral(-1,1.8),-.5);assert.equal(sideLateral(1,1.8),.5);
 assert.ok(near(sideLateral(1,1.6),.5));
 assert.ok(near(sideLateral(1,1.2),.3),'1.2m 길은 ±0.3');
 const a=pairGuide({me:at(100,0),partner:at(100,0),myId:'a',partnerId:'b',here:here(2),dt:.016}),b=pairGuide({me:at(100,0),partner:at(100,0),myId:'b',partnerId:'a',here:here(2),dt:.016});
 assert.equal(a.mode,'side');assert.equal(a.laneTarget,-.5);assert.equal(b.laneTarget,.5);
 assert.ok(Math.abs(a.laneTarget-b.laneTarget)>=PAIR.push,'두 자리 간격이 밀어내기 거리보다 넓다');
});
test('앞뒤: 앞선 사람이 앞, 같으면 ID 작은 사람, 뒷사람은 1.5m 안에서 늦춘다',()=>{
 assert.ok(isLeader({meS:101,partnerS:100,dir:1,myId:'b',partnerId:'a'}));
 assert.ok(!isLeader({meS:101,partnerS:100,dir:-1,myId:'b',partnerId:'a'}),'내리막은 s가 작은 쪽이 앞');
 assert.ok(isLeader({meS:100,partnerS:100.01,dir:1,myId:'a',partnerId:'b'}));
 assert.equal(filePace({gap:2,leader:false}),1);assert.equal(filePace({gap:1,leader:true}),1);
 assert.ok(filePace({gap:1.15,leader:false})<.6);assert.equal(filePace({gap:.5,leader:false}),.15);
 const g=pairGuide({me:at(99,0),partner:at(100,0),myId:'a',partnerId:'b',here:here(1.2),dt:.016});
 assert.equal(g.mode,'file');assert.equal(g.laneTarget,0);assert.ok(g.pace<1);
 const s=pairGuide({me:at(100,0),partner:at(99,0),myId:'a',partnerId:'b',here:here(1.2,true),dt:.016});
 assert.equal(s.mode,'file');assert.equal(s.pace,1,'앞사람은 그대로');
});
test('8m 밖이면 나란히 모드가 아니다(자리 안내 없음)',()=>{
 const g=pairGuide({me:at(110,0),partner:at(100,0),myId:'a',partnerId:'b',here:here(2),dt:.016});
 assert.ok(!g.near);assert.equal(g.laneTarget,null);assert.equal(g.drift,0);
});
test('밀어내기: 0.8m 안에서만, 한 프레임에 8cm 넘게 움직이지 않음(서버 순간이동 검사보다 한참 작음), 딱 겹치면 ID로 갈라짐',()=>{
 assert.equal(pushStep({dx:.9,dz:0,dt:.016}),null);
 const p=pushStep({dx:.3,dz:0,dt:.1});assert.ok(p.x>0&&p.step<=.08+1e-9);
 const a=pushStep({dx:0,dz:0,dt:.1,side:-1}),b=pushStep({dx:0,dz:0,dt:.1,side:1});assert.ok(a.x<0&&b.x>0);
 // 0.1초에 2m(+여유) 안: 서버 maxSpeed 12m/s·slack 2m, 클라이언트 순간이동 표시 기준 2m
 assert.ok(.8*.1<2,'최대 0.8m/s');
});
test('겹친 두 사람을 매 프레임 밀면 0.8m 이상으로 벌어지고 그 뒤로는 움직이지 않는다',()=>{
 let A=at(100,0),B=at(100,.1);
 for(let i=0;i<120;i++){
  const ga=pairGuide({me:A,partner:B,myId:'a',partnerId:'b',here:here(2),dt:1/60}),gb=pairGuide({me:B,partner:A,myId:'b',partnerId:'a',here:here(2),dt:1/60});
  for(const [P,g] of [[A,ga],[B,gb]])if(g.push){const n=routeNudge(P,g.push,{halfWidth:()=>1});if(n){P.s=n.s;P.lateral=n.lateral;P.x=n.lateral;P.z=-n.s;}}
 }
 assert.ok(Math.hypot(A.x-B.x,A.z-B.z)>=PAIR.push,`벌어진 거리 ${Math.hypot(A.x-B.x,A.z-B.z)}`);
 assert.ok(Math.abs(A.lateral)<=.7+1e-9&&Math.abs(B.lateral)<=.7+1e-9,'길 반폭 1m − 0.3m 안');
});
test('좁은 길에서 옆으로 밀 자리가 없으면 앞뒤로 민다(앞사람은 앞, 뒷사람은 뒤)',()=>{
 const p=pushStep({dx:.3,dz:0,dt:.1});
 const r=pushToRoute(p,{normal:{x:1,z:0},forward:{x:0,z:-1},lateral:.2,width:1,alongSign:-1});
 assert.ok(near(r.dl,0),'반폭 0.5 − 0.3 = 0.2, 더 못 감');assert.ok(r.ds<0,'뒷사람은 뒤로');
});
test('길 밖·바위로는 안 밀림: 반폭−0.3m를 넘지 않고, 이미 밖이면 더 나가지 않음, 금지 원에 새로 들어가면 거부',()=>{
 const hw=()=>.9;
 assert.ok(near(routeNudge({s:10,lateral:.55},{dl:.1},{halfWidth:hw}).lateral,.6));
 assert.equal(routeNudge({s:10,lateral:.6},{dl:.1},{halfWidth:hw}),null,'더 못 감 = 바뀐 것 없음');
 assert.equal(routeNudge({s:10,lateral:1.5},{dl:.1},{halfWidth:hw}),null,'이미 길 밖이면 더 나가지 않음');
 assert.ok(near(routeNudge({s:10,lateral:1.5},{dl:-.1},{halfWidth:hw}).lateral,1.4),'안쪽으로는 됨');
 assert.equal(routeNudge({s:10,lateral:0},{dl:.1},{halfWidth:hw,blocked:(s,l)=>l>.05}),null);
 assert.equal(routeNudge({s:0,lateral:0},{ds:-.1},{halfWidth:hw,minS:0}),null,'코스 시작 밖으로 안 감');
});
test('실제 코스: 좌우 자리는 늘 노면 안, 계단·좁은 길은 앞뒤',()=>{
 let side=0,file=0;
 for(let s=0;s<route.length;s+=5){const p=sample(s),m=pairMode({width:p.width,stairs:isStairs(p.material)});
  if(m==='side'){side++;for(const k of [-1,1])assert.ok(Math.abs(sideLateral(k,p.width))<=p.width/2-.3+1e-9,`s=${s}`);}else file++;}
 assert.ok(side>0&&file>0,`좌우 ${side}곳·앞뒤 ${file}곳`);
});
test('상대 x·z → 길 좌표(내 s 근처만 찾음)',()=>{
 const q=projectNear(.4,-103,100,straight);assert.ok(near(q.s,103,1e-6)&&near(q.lateral,.4,1e-6));
 const s0=1200,p=sample(s0+3),a=sample(s0+1),b=sample(s0+5),len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
 const r=projectNear(p.x+nx*.5,p.z+nz*.5,s0,sample);assert.ok(Math.abs(r.s-(s0+3))<.2&&Math.abs(r.lateral-.5)<.1,JSON.stringify(r));
});
test('자동 걷기: 느린 쪽에 맞춤, 8m 넘게 앞서면 천천히, 15m 넘으면 기다리는 중(멈추지는 않음)',()=>{
 assert.deepEqual(autoPace({lead:5,auto:false,partnerAuto:true,myBase:1.3,partnerSpeed:1}),{pace:1,waiting:false},'직접 걷기는 그대로');
 const m=autoPace({lead:2,auto:true,partnerAuto:true,myBase:1.3,partnerSpeed:1});assert.ok(m.pace<1/1.3&&m.pace>.45,'상대보다 조금 느리게 → 따라잡힘');
 assert.equal(autoPace({lead:-3,auto:true,partnerAuto:true,myBase:1,partnerSpeed:1.4}).pace,1,'뒤에 있으면 그대로');
 assert.deepEqual(autoPace({lead:9,auto:true,partnerAuto:false,myBase:1.3,partnerSpeed:0}),{pace:.4,waiting:false});
 const w=autoPace({lead:16,auto:true,partnerAuto:false,myBase:1.3,partnerSpeed:0});assert.ok(w.waiting&&w.pace>0);
 const g=pairGuide({me:at(120,0),partner:at(100,0),myId:'a',partnerId:'b',here:here(2),dt:.016,auto:true});
 assert.ok(g.waiting&&!g.near&&g.pace===.2);
});
test('직접 걷는 동안만 옆 자리로 천천히(옆 키를 누르면 안 끔), 자동 걷기는 laneTarget으로',()=>{
 const base={me:at(100,0),partner:at(101,.2),myId:'a',partnerId:'b',here:here(2),dt:.1};
 assert.ok(near(pairGuide({...base,moving:true}).drift,-.05));
 assert.equal(pairGuide({...base,moving:true,steering:true}).drift,0);
 assert.equal(pairGuide({...base,moving:false}).drift,0);
 assert.equal(pairGuide({...base,moving:true,auto:true}).drift,0);
});
test('동행 HUD 모양: 남은 초·칩·목록 단추',()=>{
 assert.equal(secondsLeft(30000,0),30);assert.equal(secondsLeft(1000,1500),0);assert.equal(secondsLeft(10100,0),11);
 assert.equal(chipModel({phase:'idle'}),null);
 assert.equal(chipModel({phase:'outgoing',offer:{name:'곰'}}).label,'취소');
 const c=chipModel({phase:'paired',partner:{name:'곰'},walk:{mode:'side',near:true}});assert.equal(c.title,'🤝 곰님과 동행 중');assert.equal(c.sub,'나란히 걷는 중');assert.equal(c.label,'동행 끝내기');
 assert.equal(chipModel({phase:'paired',partner:{name:'곰'},walk:{waiting:true,lag:'곰님 기다리는 중'}}).sub,'곰님 기다리는 중');
 assert.equal(chipModel({phase:'paired',partner:{name:'곰'},away:true}).sub,'곰님 연결을 기다리는 중…');
 assert.deepEqual(rowModel({partner:true},{phase:'paired'}),{label:'동행 중',disabled:true});
 assert.equal(rowModel({},{phase:'idle'}).disabled,false);assert.equal(rowModel({},{phase:'outgoing'}).disabled,true);
});
test('앞뒤 줄 자동 걷기: 앞사람은 1.5m 간격에서는 늦추지 않는다(둘 다 기어가지 않게)',()=>{
 const base={myId:'a',partnerId:'b',here:here(1.2,true),dt:.016,auto:true,partnerAuto:true,myBase:.4,partnerSpeed:.4};
 const lead=pairGuide({...base,me:at(101.5,0),partner:at(100,0)});
 assert.equal(lead.mode,'file');assert.equal(lead.pace,1,'1.5m 앞 = 제자리');
 const far=pairGuide({...base,me:at(104,0),partner:at(100,0)});assert.ok(far.pace<1,'더 벌어지면 늦춤');
 const follow=pairGuide({...base,me:at(100,0),partner:at(101.5,0)});assert.equal(follow.pace,1,'뒷사람은 1.5m면 그대로');
});
