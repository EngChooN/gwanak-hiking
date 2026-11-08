// 실제 화면 조건으로 할 일 단추 누르기(spots.js WALK): main.js 자동 이동(직선 + collide)을 그대로 흉내 내고
// 장애물·다른 동동이·담배 피우는 중(불 붙이기·끄기)·멀리서 표시 누르기를 본다. 실패하면 알림(fail 이벤트·notice)이 뜨고 다시 누를 수 있어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const events=[];
const bus=new EventTarget();
globalThis.window??=globalThis;
globalThis.addEventListener??=bus.addEventListener.bind(bus);globalThis.removeEventListener??=bus.removeEventListener.bind(bus);globalThis.dispatchEvent??=bus.dispatchEvent.bind(bus);
globalThis.CustomEvent??=class extends Event{constructor(t,o){super(t);this.detail=o?.detail;}};
globalThis.performance??={now:()=>Date.now()};
addEventListener('lounge:spot',e=>events.push(e.detail));
const {createSpots,WALK}=await import('../src/lounge/spots.js');

const BENCH={x:1.9,z:-5.5};
const baseRoof=()=>({
 bounds:{minX:-8,maxX:8,minZ:-6,maxZ:6},
 colliders:[{minX:1.15,maxX:2.65,minZ:-5.77,maxZ:-5.34},{minX:5.7,maxX:6.7,minZ:-2.6,maxZ:-1.84}], // 벤치, 자판기
 rail:{inset:.22,cap:.5,ledge:.12},
 spots:{benches:[{x:BENCH.x,z:BENCH.z+.6,heading:Math.PI,seat:{x:BENCH.x,z:BENCH.z,y:.4375,heading:Math.PI}}],
  vending:{x:6.2,z:-1.39,heading:0,outlet:{x:6.18,y:.28,z:-1.8}},ashtrays:[{x:-2,z:2,heading:0}]},
});
function fakePlayer(){
 const root=new THREE.Group(),model=new THREE.Group();root.add(model);
 const bone=(n,parent,p)=>{const b=new THREE.Bone();b.name='mixamorig'+n;b.position.set(...p);parent.add(b);return b;};
 const hips=bone('Hips',model,[0,.38,0]),s0=bone('Spine',hips,[0,.05,0]),s1=bone('Spine1',s0,[0,.05,0]),s2=bone('Spine2',s1,[0,.06,0]);
 bone('Head',s2,[0,.12,0]);
 for(const [s,x] of [['Left',1],['Right',-1]]){
  const a=bone(s+'Arm',s2,[.1*x,.04,0]),f=bone(s+'ForeArm',a,[0,-.13,0]);bone(s+'Hand',f,[0,-.12,0]);
  const u=bone(s+'UpLeg',hips,[.07*x,-.03,0]),k=bone(s+'Leg',u,[0,-.17,0]);bone(s+'Foot',k,[0,-.16,0]);
 }
 return {id:'me',root,hiker:{model},x:0,z:0,heading:0,extra:[]};
}
// main.js와 같은 자동 이동·충돌(R=0.2, 동동이끼리 0.4)
function setup(x,z,{obstacles=[],npcs=[]}={}){
 const rooftop=baseRoof();rooftop.colliders.push(...obstacles);
 const player=fakePlayer();player.x=x;player.z=z;
 const smoker={busy:false,status(){return {state:'idle'};},blocksMove(){return this.busy;}};
 const R=.2;
 function collide(x,z){
  const b=rooftop.bounds;x=Math.min(Math.max(x,b.minX+R),b.maxX-R);z=Math.min(Math.max(z,b.minZ+R),b.maxZ-R);
  for(const c of rooftop.colliders){
   if(c.r!==undefined){const dx=x-c.x,dz=z-c.z,d=Math.hypot(dx,dz),m=c.r+R;if(d<m&&d>1e-6){x=c.x+dx/d*m;z=c.z+dz/d*m;}}
   else{const nx=Math.min(Math.max(x,c.minX),c.maxX),nz=Math.min(Math.max(z,c.minZ),c.maxZ),dx=x-nx,dz=z-nz,d=Math.hypot(dx,dz);if(d<R&&d>1e-6){x=nx+dx/d*R;z=nz+dz/d*R;}}
  }
  for(const n of npcs){const dx=x-n.x,dz=z-n.z,d=Math.hypot(dx,dz),m=R*2;if(d<m&&d>1e-6){x=n.x+dx/d*m;z=n.z+dz/d*m;}}
  return {x,z};
 }
 let walk=null;
 const spots=createSpots({ctx:{world:new THREE.Group(),rooftop,player,smoker,collide},goTo:s=>{walk=s;},ui:false});
 const run=(sec,dt=1/30)=>{for(let t=0;t<sec;t+=dt){
  if(walk){const dx=walk.x-player.x,dz=walk.z-player.z,d=Math.hypot(dx,dz);
   if(d<.12){const w=walk;walk=null;player.heading=w.heading;w.done?.();}
   else if(!smoker.blocksMove()){const g=collide(player.x+dx/d*1.2*dt,player.z+dz/d*1.2*dt);player.x=g.x;player.z=g.z;}}
  player.root.position.set(player.x,0,player.z);player.root.updateMatrixWorld(true);
  for(const f of player.extra)f(dt,player);spots.update(dt);}};
 return {player,spots,smoker,run,get walk(){return walk;}};
}
const lastSpot=()=>events.at(-1);

test('장애물에 정면으로 막히면: 「길이 막혔어요」 알림, 걷기 멈춤, 다시 누를 수 있다',()=>{
 const T=setup(6.2,3,{obstacles:[{x:6.2,z:1,r:.32}]});T.run(.2);
 assert.ok(T.spots.coffee());assert.ok(T.spots.status().pending);
 T.run(4);
 assert.equal(T.spots.status().pending,null,'막혀서 끝남');
 assert.equal(lastSpot().state,'fail');assert.equal(lastSpot().spot,'vending');
 assert.match(T.spots.status().notice,/막혔어요/);
 assert.equal(T.walk,null,'자동 이동도 멈춘다');
 assert.equal(T.spots.status().can.dropping,false,'캔은 안 나왔다');
 assert.ok(T.spots.coffee(),'다시 누를 수 있다');
});

test('다른 동동이가 자판기 앞을 차지하면: 바로 옆(0.8m 안)에서 막혀도 그 자리에서 뽑는다',()=>{
 const T=setup(6.2,1.5,{npcs:[{x:6.2,z:-1.25}]});T.run(.2);
 assert.ok(T.spots.coffee());T.run(5);
 const e=events.filter(e=>e.spot==='vending').at(-1);
 assert.equal(e.state,'use','캔커피를 뽑았다');assert.equal(T.spots.status().pending,null);
});

test('다른 동동이가 난간 자리에 서 있으면 난간을 따라 옆 빈자리에서 기댄다',()=>{
 const npc={x:0,z:-5.78};const T=setup(0,-5.1,{npcs:[npc]});T.run(.2);
 assert.ok(T.spots.lean());T.run(.8);
 assert.equal(T.spots.pose,'lean');
 assert.ok(Math.hypot(T.player.x-npc.x,T.player.z-npc.z)>=.4,`동동이와 겹치지 않는다 x=${T.player.x}`);
 // 둘레 전체가 막혀 있으면 알림
 const U=setup(0,-5.1,{obstacles:[{minX:-8,maxX:8,minZ:-6,maxZ:-5.5}]});U.run(.2);
 assert.equal(U.spots.lean(),false);assert.equal(lastSpot().state,'fail');assert.match(U.spots.status().notice,/난간 자리가 없어요/);
});

test('불 붙이는 중(못 걷는 동안)에 누르면 시간을 세지 않고 기다렸다가 걸어간다',()=>{
 const T=setup(6.2,2);T.run(.2);
 const n=events.length;T.smoker.busy=true;assert.ok(T.spots.coffee());
 T.run(12); // 한도(4 + 거리/0.9 ≈ 7.8초)보다 오래
 assert.ok(T.spots.status().pending,'아직 기다리는 중(실패 아님)');assert.ok(T.spots.status().pending.waited>10);
 assert.equal(events.slice(n).filter(e=>e.state==='fail').length,0,'실패 알림 없음');
 T.smoker.busy=false;T.run(4);
 assert.equal(events.filter(e=>e.spot==='vending').at(-1).state,'use','불 붙인 뒤 걸어가서 뽑았다');
});

test('멀리서 대상 위 표시를 누르면 걸어가서 한다(벤치·난간·자판기·재떨이), 알림도 뜬다',()=>{
 const T=setup(0,0);T.run(.2);
 assert.equal(T.spots.status().primary,null,'닿을 거리의 할 일은 없다');
 assert.ok(T.spots.go('bench',0));assert.match(T.spots.status().notice,/벤치로 걸어가요/);
 T.run(6);assert.equal(T.spots.pose,'sit','벤치에 걸터앉았다');
 assert.ok(T.spots.go('bench',0),'같은 벤치 표시 = 일어나기');assert.equal(T.spots.pose,'stand');
 T.player.x=0;T.player.z=2;T.run(.1);
 assert.ok(T.spots.go('rail'));assert.match(T.spots.status().notice,/난간으로 걸어가요/);
 T.run(9);assert.equal(T.spots.pose,'lean','난간에 기댔다');
 T.player.x=0;T.player.z=0;T.run(.2);
 assert.ok(T.spots.go('vending'));T.run(9);
 assert.equal(events.filter(e=>e.spot==='vending').at(-1).state,'use');
 assert.ok(T.spots.go('ashtray',0));T.run(9);
 assert.equal(lastSpot().spot,'ashtray');assert.equal(lastSpot().state,'enter');
});

test('도착 판정은 넉넉하다',()=>{assert.ok(WALK.arrive>=.3&&WALK.near>=WALK.arrive&&WALK.stall<=1.5);});
