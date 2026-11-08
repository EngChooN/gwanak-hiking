// 옥상에서 할 일(spots.js: 난간 기대기·벤치 걸터앉기·캔커피)과 상황 고르기(scene.js) 단위 테스트.
// 가짜 동동이(뼈 이름만 같은 빈 뼈대, 키 약 1m)를 세워 놓고 자세를 실제로 덧씌워 본다. 화면(단추)은 브라우저에서만 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const events=[];
const bus=new EventTarget();
globalThis.window??=globalThis;
globalThis.addEventListener??=bus.addEventListener.bind(bus);globalThis.removeEventListener??=bus.removeEventListener.bind(bus);globalThis.dispatchEvent??=bus.dispatchEvent.bind(bus);
globalThis.CustomEvent??=class extends Event{constructor(t,o){super(t);this.detail=o?.detail;}};
globalThis.performance??={now:()=>Date.now()};
for(const t of ['lounge:spot','lounge:scene','lounge:time'])addEventListener(t,e=>events.push({type:t,...e.detail}));
const {railSpot,nearestSpot,createSpots,SEAT_PAD,SPOT_RANGE,SIP}=await import('../src/lounge/spots.js');
const {SCENES,SCENE_IDS,createScene}=await import('../src/lounge/scene.js');

// 옥상(rooftop.js와 같은 치수의 일부): 16×12m, 벤치 1개(앞 +Z), 자판기, 앞(-Z) 둘레 한 곳을 막는 상자
const BENCH={x:1.9,z:-5.5};
const rooftop={
 bounds:{minX:-8,maxX:8,minZ:-6,maxZ:6},
 colliders:[{minX:-7.7,maxX:-3.5,minZ:-5.7,maxZ:-5.56},{minX:1.15,maxX:2.65,minZ:-5.77,maxZ:-5.34}],
 rail:{inset:.22,cap:.5,ledge:.12},
 spots:{benches:[{x:BENCH.x,z:BENCH.z+.6,heading:Math.PI,seat:{x:BENCH.x,z:BENCH.z,y:.4375,heading:Math.PI}}],
  vending:{x:6.2,z:-1.39,heading:0,outlet:{x:6.18,y:.28,z:-1.8}}},
};

function fakePlayer(){
 const root=new THREE.Group(),model=new THREE.Group();root.add(model);
 const bone=(n,parent,p)=>{const b=new THREE.Bone();b.name='mixamorig'+n;b.position.set(...p);parent.add(b);return b;};
 const hips=bone('Hips',model,[0,.38,0]),s0=bone('Spine',hips,[0,.05,0]),s1=bone('Spine1',s0,[0,.05,0]),s2=bone('Spine2',s1,[0,.06,0]);
 bone('Head',s2,[0,.12,0]);
 for(const [s,x] of [['Left',1],['Right',-1]]){
  const a=bone(s+'Arm',s2,[.1*x,.04,0]),f=bone(s+'ForeArm',a,[0,-.13,0]);bone(s+'Hand',f,[0,-.12,0]);
  const u=bone(s+'UpLeg',hips,[.07*x,-.03,0]),k=bone(s+'Leg',u,[0,-.17,0]);bone(s+'Foot',k,[0,-.16,0]);
 }
 const bones=[];model.traverse(o=>{if(o.isBone)bones.push([o,o.quaternion.clone()]);});
 const p={id:'me',root,hiker:{model},x:0,z:0,heading:0,extra:[],moving:false,
  // avatar.update와 같은 순서: 자리·방향 → 원래 동작(여기서는 차렷) → extra(덧씌우기)
  step(dt){root.position.set(p.x,0,p.z);root.rotation.y=p.heading+Math.PI;for(const [b,q] of bones)b.quaternion.copy(q);root.updateMatrixWorld(true);for(const f of p.extra)f(dt,p);}};
 return p;
}
const W=(o)=>o.getWorldPosition(new THREE.Vector3());
const B=(p,n)=>p.hiker.model.getObjectByName('mixamorig'+n);
function setup(x,z,heading=0){
 const player=fakePlayer();player.x=x;player.z=z;player.heading=heading;
 let walk=null;const smoker={st:'idle',status(){return {state:this.st};}};
 const world=new THREE.Group();
 const spots=createSpots({ctx:{world,rooftop,player,smoker},goTo:s=>{walk=s;},ui:false});
 const run=(sec,dt=1/30)=>{for(let t=0;t<sec;t+=dt){player.step(dt);spots.update(dt);}};
 // 자동 이동 대신 바로 도착시킨다
 const arrive=()=>{assert.ok(walk,'자리로 걸어가는 목표가 있다');player.x=walk.x;player.z=walk.z;player.heading=walk.heading;const w=walk;walk=null;w.done();};
 return {player,spots,smoker,run,arrive,world,get walk(){return walk;}};
}
const last=(type,f=()=>true)=>events.filter(e=>e.type===type&&f(e)).at(-1);

test('난간 자리: 가까운 둘레 안쪽에 서서 바깥을 본다, 막힌 곳·먼 곳은 없다',()=>{
 const s=railSpot(rooftop,0,-5.2);assert.equal(s.heading,0);assert.equal(s.z,-6+.22);assert.ok(Math.abs(s.x)<1e-9);
 const e=railSpot(rooftop,7.4,0);assert.equal(e.heading,-Math.PI/2);assert.equal(e.x,8-.22);
 assert.equal(railSpot(rooftop,0,0),null,'옥상 가운데는 난간이 멀다');
 assert.equal(railSpot(rooftop,-5,-5.3),null,'부스 판에 막힌 앞 난간에는 기대지 않는다');
 assert.equal(nearestSpot(rooftop,BENCH.x,BENCH.z+.9)?.kind,'bench');
 assert.equal(nearestSpot(rooftop,6.2,-.9)?.kind,'vending');
 assert.equal(nearestSpot(rooftop,0,0),null);
 assert.ok(SPOT_RANGE.rail>=1&&SPOT_RANGE.bench>=1);
});

test('기대기: 걸어가지 않고 가장 가까운 난간 지점에 붙어 상체를 숙이고 두 팔을 턱 위로 올린다, 움직이면 풀린다',()=>{
 const T=setup(0,-5.1);T.run(.2);
 const head0=W(B(T.player,'Head')),hand0=W(B(T.player,'LeftHand'));
 assert.equal(T.spots.status().primary,'lean');
 assert.ok(T.spots.lean());assert.equal(T.walk,null,'난간은 걸어가지 않고 바로 시작');
 assert.equal(T.spots.pose,'lean');assert.deepEqual(last('lounge:spot'),{type:'lounge:spot',id:'me',spot:'rail',state:'enter'});
 T.run(.8);assert.ok(Math.abs(T.player.z-(-6+.22))<1e-6,'자세가 들어가는 동안 난간 지점으로 붙는다');assert.equal(T.spots.pose,'lean','붙는 움직임으로는 풀리지 않는다');
 const P=[T.player.x,T.player.z];T.run(1);
 const head=W(B(T.player,'Head')),hl=W(B(T.player,'LeftHand')),hr=W(B(T.player,'RightHand'));
 assert.ok(head.z-P[1]<head0.z-(-5.1)-.03,`머리가 난간(-Z) 쪽으로 숙여진다 ${head.z.toFixed(3)}`);
 assert.ok(hl.y>hand0.y+.12&&hr.y>hand0.y+.12,`두 손이 올라간다 ${hand0.y.toFixed(2)}→${hl.y.toFixed(2)}`);
 assert.ok(hl.z<P[1]-.15&&hr.z<P[1]-.15,'손은 난간 쪽 앞으로');
 T.player.x+=.3;T.run(.1);
 assert.equal(T.spots.pose,'stand');assert.equal(last('lounge:spot').state,'leave');assert.equal(last('lounge:spot').spot,'rail');
});

test('앉기: 좌판 높이로 걸터앉아 허벅지는 앞으로, 일어나면 좌판 앞에 선다',()=>{
 const T=setup(BENCH.x,BENCH.z+1,Math.PI);T.run(.2);
 assert.equal(T.spots.status().near,'bench');
 assert.ok(T.spots.sit());T.arrive();
 assert.equal(T.spots.pose,'sit');assert.equal(last('lounge:spot').spot,'bench');assert.equal(last('lounge:spot').state,'enter');
 assert.equal(T.player.x,BENCH.x);assert.equal(T.player.z,BENCH.z);
 T.run(1.2);
 const hip=W(B(T.player,'Hips')),knee=W(B(T.player,'LeftLeg')),up=W(B(T.player,'LeftUpLeg')),foot=W(B(T.player,'LeftFoot'));
 assert.ok(Math.abs(hip.y-(.4375+SEAT_PAD))<.01,`골반이 좌판 위 ${hip.y.toFixed(3)}`);
 assert.ok(Math.abs(knee.y-up.y)<.06,'허벅지가 거의 수평');
 assert.ok(knee.z-up.z>.12,'무릎이 앞(+Z, 벤치 앞쪽)으로');
 assert.ok(foot.y>=.02,'발이 바닥 아래로 빠지지 않는다');
 assert.ok(T.spots.stand());assert.equal(last('lounge:spot').state,'leave');
 assert.equal(T.player.z,BENCH.z+.6,'좌판 앞으로 일어선다');
 T.run(1);assert.ok(Math.abs(T.player.root.position.y)<1e-6&&T.spots.status().w===0,'자세가 다 풀린다');
});

test('캔커피: 자판기 앞에서 누르면 캔이 떨어지고(use) 왼손에 들고 가끔 마신다, 버릴 수 있다',()=>{
 const T=setup(6.2,-.8);T.run(.2);
 assert.equal(T.spots.status().primary,'coffee');
 assert.ok(T.spots.coffee());T.arrive();
 assert.deepEqual(last('lounge:spot'),{type:'lounge:spot',id:'me',spot:'vending',state:'use',item:'can-coffee'});
 assert.equal(T.spots.status().can.dropping,true);
 T.run(1.3);const st=T.spots.status();assert.equal(st.can.held,true);assert.equal(st.can.dropping,false);
 const can=T.spots.can;assert.ok(can.visible);
 const lh=W(B(T.player,'LeftHand'));assert.ok(W(can).distanceTo(lh)<.12,'캔은 왼손에');
 can.traverse(o=>{if(o.isMesh&&!o.userData.outline)assert.ok(!o.material.map,'텍스처 없음');});
 T.run(SIP.first+.6);assert.equal(T.spots.status().can.sipping,true,'첫 모금');
 T.run(SIP.secs+.1);assert.equal(T.spots.status().can.sips,1);
 // 담배를 빨아들이는 중에는 마시지 않는다
 T.smoker.st='inhale';T.run(SIP.every[1]+1);assert.equal(T.spots.status().can.sips,1);
 T.smoker.st='lighting';T.run(.1);assert.equal(can.visible,false,'라이터 켜는 왼손에는 캔을 숨긴다');
 T.smoker.st='smoking';T.run(.1);assert.ok(can.visible);
 assert.ok(T.spots.dropCan());assert.equal(T.spots.status().can.held,false);T.run(.1);assert.equal(can.visible,false);
});

test('멀리서 E(기대기·앉기)를 누르면 걸어가지 않고 「없어요」 알림만',()=>{
 const T=setup(0,0);T.run(.2);
 assert.equal(T.spots.status().primary,null);
 assert.equal(T.spots.sit(),false);assert.equal(last('lounge:spot').state,'fail');assert.match(T.spots.status().notice,/벤치/);
 assert.equal(T.spots.lean(),false);assert.equal(last('lounge:spot').spot,'rail');assert.match(T.spots.status().notice,/난간/);
 assert.equal(T.walk,null);assert.equal(T.spots.pose,'stand');
});

test('캔커피는 멀리서도: 자판기까지 걸어가 뽑고, 뽑는 중엔 다시 안 눌린다, 한 모금은 원할 때',()=>{
 const T=setup(0,0);T.run(.2);
 assert.equal(T.spots.sip(),false,'캔이 없으면 한 모금 안 됨');
 assert.ok(T.spots.coffee(),'멀리서도 누를 수 있다');
 assert.equal(T.walk.x,6.2);assert.equal(T.walk.z,-1.39);
 assert.equal(T.spots.coffee(),false,'걸어가는 중엔 한 번만');
 T.arrive();assert.equal(last('lounge:spot').spot,'vending');assert.equal(last('lounge:spot').state,'use');
 assert.equal(T.spots.coffee(),false,'떨어지는 중엔 한 번만');
 T.run(1.3);assert.equal(T.spots.status().can.held,true);
 T.run(SIP.first+.2);assert.equal(T.spots.status().can.sipping,true,'쥐자마자 한 모금(뽑은 게 보이게)');
 T.run(SIP.secs+.1);const n=T.spots.status().can.sips;
 T.smoker.st='inhale';assert.equal(T.spots.sip(),false,'담배를 빠는 중엔 못 마신다');
 T.smoker.st='smoking';assert.ok(T.spots.sip());assert.equal(T.spots.status().can.sipping,true);
 assert.equal(T.spots.sip(),false,'마시는 중엔 겹치지 않는다');
 T.run(SIP.secs+.1);assert.equal(T.spots.status().can.sips,n+1);
});

test('캔커피 가는 길에 직접 움직이면 그만둔다',()=>{
 const T=setup(0,0);T.run(.2);
 assert.ok(T.spots.coffee());T.player.x=1;T.player.z=-.3;T.run(.1);
 assert.equal(T.spots.status().pending?.to,'vending','자판기 쪽으로 가는 중');
 T.player.x=-1;T.player.z=1;T.run(.1);
 assert.equal(T.spots.status().pending,null,'멀어지면 그만둠');
 assert.ok(T.spots.coffee(),'다시 누를 수 있다');
});

test('상황 고르기: 네 상황이 시간대와 lounge:scene을 바꾸고 저장한다',()=>{
 assert.deepEqual(SCENE_IDS,['morning','lunch','evening','afterparty']);
 assert.deepEqual(SCENE_IDS.map(k=>SCENES[k].time),['day','day','dusk','night']);
 const times=[],saved={},root={dataset:{}};
 const sc=createScene({setTime:m=>times.push(m),dispatch:(t,d)=>dispatchEvent(new CustomEvent(t,{detail:d})),save:p=>Object.assign(saved,p),root});
 for(const id of SCENE_IDS){const s=sc.set(id);assert.equal(s.id,id);assert.equal(last('lounge:scene').id,id);assert.equal(root.dataset.scene,id);}
 assert.deepEqual(times,['day','day','dusk','night']);
 assert.equal(saved.scene,'afterparty');assert.equal(saved.timeMode,'night');assert.equal(sc.current,'afterparty');
 assert.equal(sc.set('nope'),null);assert.equal(sc.current,'afterparty');
 // 설정에서 다른 시간으로 바꾸면 분위기는 내린다
 dispatchEvent(new CustomEvent('lounge:time',{detail:{mode:'day'}}));
 assert.equal(sc.current,null);assert.equal(root.dataset.scene,undefined);assert.equal(saved.scene,null);
 sc.set('evening');dispatchEvent(new CustomEvent('lounge:time',{detail:{mode:'dusk'}}));assert.equal(sc.current,'evening','같은 시간대면 그대로');
 sc.dispose();
});
