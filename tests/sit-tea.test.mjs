import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,Quaternion,MathUtils} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {teaPhase,TEA_STEPS,TEA_HEAD_TILT,TEA_TORSO_TILT,handFromCup,CUP_IN_HAND,handBasis,SEAT} from '../src/hiker-interactions.js';
import {createRealisticHiker} from '../src/realistic-hiker.js';

// 노드에서 실제 등산객 GLB를 읽는다. 텍스처는 그리지 않으므로 빈 이미지로 대신한다.
async function loadHiker(){
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
 const buf=readFileSync(new URL('../assets/realistic/models/hiker/Hiker.glb',import.meta.url)),warn=console.warn;console.warn=()=>{};
 try{return createRealisticHiker(await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),''));}finally{console.warn=warn;}
}
const flat=()=>0,stairs=(x,z)=>z>-.3?.18:0; // 계단: 엉덩이는 18cm 높은 단, 발은 낮은 단
const settle=(h,surfaceHeight,pose='sit')=>{for(let i=0;i<12;i++){h.update({clip:'Idle',pose,dt:.1,idleSeconds:0});h.ground({moving:false,surfaceHeight});}};
const teaAt=(h,t,surfaceHeight=flat)=>{h.update({clip:'Idle',pose:'tea',dt:0,idleSeconds:0,teaProgress:t});h.ground({moving:false,surfaceHeight});return h.interaction;};
const bone=(h,n)=>h.model.getObjectByName('mixamorig'+n);
const world=(h,n)=>bone(h,n).getWorldPosition(new Vector3());
const hikerPromise=loadHiker();

test('차 마시기 단계는 잡기→가슴→입→마시기→무릎→내려놓기 순서이고 컵은 잡은 뒤부터 놓을 때까지 손에 있다',()=>{
 assert.deepEqual(TEA_STEPS.map(s=>s.id),['reach','lift','mouth','drink','lower','place','return']);
 let wasHeld=false,changes=0;
 for(let i=0;i<=600;i++){const p=teaPhase(i/600);if(p.held!==wasHeld){changes++;wasHeld=p.held;}
  if(p.step==='drink')assert.equal(p.head,1);if(p.step==='reach'||p.step==='place'||p.step==='return')assert.equal(p.head,0);}
 assert.equal(changes,2,'잡기·놓기 각 한 번');
 assert.ok(MathUtils.radToDeg(TEA_HEAD_TILT)>=25&&MathUtils.radToDeg(TEA_HEAD_TILT)<=30);
 assert.ok(Math.abs(MathUtils.radToDeg(TEA_TORSO_TILT)-10)<1e-9);
 assert.equal(teaPhase(null).held,false);
});

test('컵 자세에서 거꾸로 구한 손에 컵을 붙이면 원래 컵 자세가 된다',()=>{
 const cupQ=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.7),cupP=new Vector3(.3,.6,-.2),hand=handFromCup(cupP,cupQ);
 const back=new Vector3(...CUP_IN_HAND.position).applyQuaternion(hand.quaternion).add(hand.position);
 assert.ok(back.distanceTo(cupP)<1e-9);
 // 손 기준: 오른손 손바닥(-X)이 아래를 보면 엄지(+Z)는 몸 안쪽(-X)으로 간다.
 const q=handBasis(new Vector3(0,0,-1),new Vector3(0,-1,0),1);
 assert.ok(new Vector3(0,0,1).applyQuaternion(q).x<-.99);
});

test('앉으면 엉덩이가 면에 닿고, 무릎은 서고 발바닥은 땅에, 손은 무릎 위, 스틱은 왼쪽에 기대 선다',async()=>{
 const h=await hikerPromise;
 for(const [surfaceHeight,seatY] of [[flat,0],[stairs,.18]]){
  settle(h,surfaceHeight);h.scene.updateMatrixWorld(true);const I=h.interaction;
  assert.ok(Math.abs(I.seatY-seatY)<1e-9);
  // 바지 엉덩이 바닥(몸 중심 뒤쪽 꼭짓점 최저점)이 앉은 면에서 ±2cm
  let pants;h.model.traverse(o=>{if(o.isSkinnedMesh&&/pants/i.test(o.name))pants=o;});pants.skeleton.update();
  let low=Infinity;const v=new Vector3();for(let i=0;i<pants.geometry.attributes.position.count;i++){pants.getVertexPosition(i,v).applyMatrix4(pants.matrixWorld);if(Math.abs(v.x)<.12&&v.z>-.05)low=Math.min(low,v.y);}
  assert.ok(Math.abs(low-seatY)<.02,`엉덩이 높이 ${low-seatY}`);
  // 신발 바닥 최저점이 발 아래 땅에서 1cm 이내(발바닥이 땅에 붙음)
  let boots;h.model.traverse(o=>{if(o.isSkinnedMesh&&/boots/i.test(o.name))boots=o;});boots.skeleton.update();
  const sole=[Infinity,Infinity],feet=['Left','Right'].map(n=>world(h,n+'Foot'));
  for(let i=0;i<boots.geometry.attributes.position.count;i++){boots.getVertexPosition(i,v).applyMatrix4(boots.matrixWorld);const k=v.distanceToSquared(feet[0])<v.distanceToSquared(feet[1])?0:1;sole[k]=Math.min(sole[k],v.y-surfaceHeight(v.x,v.z));}
  for(const gap of sole)assert.ok(Math.abs(gap)<.01,`신발 바닥 ${gap}`);
  const hip=world(h,'Hips');
  for(const [side,sign] of [['Left',-1],['Right',1]]){
   const knee=world(h,side+'Leg'),foot=world(h,side+'Foot'),hand=world(h,side+'Hand');
   assert.ok(knee.y>hip.y+.08,`${side} 무릎이 선다 ${knee.y-hip.y}`);
   assert.ok(foot.x*sign>.1,`${side} 발이 제 쪽에 있다(다리 꼬임 없음)`);
   assert.ok(foot.z<knee.z&&knee.z<hip.z,'발·무릎이 몸 앞');
   assert.ok(hand.distanceTo(knee)<.15,`${side} 손이 무릎 위`);
   assert.ok(hand.y>knee.y,'손이 무릎보다 위');
  }
  for(const c of h.interaction.poles)assert.ok(c.tip[0]<-.3,'스틱은 왼쪽');
  for(const p of h.props.poles){assert.ok(Math.abs(p.group.scale.y-1)<1e-6,'스틱 길이 그대로');const tip=p.tip.getWorldPosition(new Vector3());assert.ok(Math.abs(tip.y-surfaceHeight(tip.x,tip.z))<.005,'스틱 끝이 땅에');}
 }
});

test('차 마시는 3초 동안 컵은 손에서 2cm 넘게 떨어지지 않고, 놓인 동안에는 땅 위 제자리에 있다',async()=>{
 const h=await hikerPromise;
 for(const surfaceHeight of [flat,stairs]){
  settle(h,surfaceHeight);let held=0;
  for(let i=0;i<=300;i++){const t=i/300,I=teaAt(h,t,surfaceHeight);
   const hand=bone(h,'RightHand'),anchor=hand.localToWorld(new Vector3(...CUP_IN_HAND.position)),cup=h.props.cup.getWorldPosition(new Vector3());
   if(I.cup.held){held++;assert.ok(anchor.distanceTo(cup)<=.02,`t=${t} 손-컵 ${anchor.distanceTo(cup)}`);assert.equal(h.props.cup.parent,hand,'컵은 오른손 뼈에 붙는다');}
   else{assert.ok(cup.distanceTo(new Vector3(...I.cup.rest))<1e-6,'놓인 컵은 제자리');}
   // 잡는 순간·놓는 순간: 손이 이미 놓인 컵 자리에 와 있어 컵이 순간 이동하지 않는다.
   const p=teaPhase(t);if(p.step==='reach'&&p.k>.999||p.step==='return'&&p.k<.001)assert.ok(anchor.distanceTo(new Vector3(...I.cup.rest))<=.02,`t=${t} 잡기/놓기 위치 ${anchor.distanceTo(new Vector3(...I.cup.rest))}`);
  }
  assert.ok(held>150,'컵을 든 구간이 절반 이상');
  // 차를 다 마시면 컵은 손에서 떨어져 내려놓인 상태로 쉬기 자세가 된다.
  h.update({clip:'Idle',pose:'sit',dt:.1,idleSeconds:0,teaProgress:1});h.ground({moving:false,surfaceHeight});
  assert.equal(h.interaction.cup.held,false);assert.equal(h.interaction.pose,'sit');
 }
});

test('마실 때 고개는 상체보다 약 27°, 상체는 약 10° 뒤로 젖히고 컵 가장자리가 입 앞에 온다. 1인칭 시야도 위로 기운다',async()=>{
 const h=await hikerPromise;settle(h,flat);h.scene.updateMatrixWorld(true);
 const up=n=>new Vector3(0,1,0).applyQuaternion(bone(h,n).getWorldQuaternion(new Quaternion())),spine0=up('Spine2');
 const I=teaAt(h,.56);h.scene.updateMatrixWorld(true);
 const spine1=up('Spine2'),torso=MathUtils.radToDeg(Math.atan2(spine1.z,spine1.y)-Math.atan2(spine0.z,spine0.y)); // +z가 뒤
 assert.equal(I.tea.step,'drink');
 assert.ok(torso>8&&torso<12,`상체 ${torso}°`);
 const head=MathUtils.radToDeg(I.facePitch)-10;
 assert.ok(head>=25&&head<=30,`고개(상체 기준) ${head}°`);
 const mouth=bone(h,'Head').localToWorld(new Vector3(0,.015,.10)),rim=h.props.cup.localToWorld(new Vector3(0,.066,.040));
 assert.ok(rim.distanceTo(mouth)<.02,`컵 가장자리-입 ${rim.distanceTo(mouth)}`);
 assert.ok(h.viewPitch>MathUtils.degToRad(10)&&h.viewPitch<MathUtils.degToRad(20));
 settle(h,flat);assert.equal(h.viewPitch,0);
});
