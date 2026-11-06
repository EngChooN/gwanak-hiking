import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,Quaternion,MathUtils} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {teaPhase,TEA_STEPS,TEA_HEAD_TILT,TEA_TORSO_TILT,handFromCup,CUP_IN_HAND,handBasis,SEAT} from '../src/hiker-interactions.js';
import {createRealisticHiker} from '../src/realistic-hiker.js';
import {buildToonHikerGltf} from '../src/toon/link-hiker.js';

// 노드에서 카툰 등산객(동동이) GLB를 읽는다(2026-11-06 실사 모델에서 바꿈, 실사 몸 치수 전용 검사는 뺐다). 텍스처는 그리지 않으므로 빈 이미지로 대신한다.
async function loadHiker(){
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
 const buf=readFileSync(new URL('../assets/toon/models/hiker/Hiker.glb',import.meta.url)),warn=console.warn;console.warn=()=>{};
 try{return createRealisticHiker(buildToonHikerGltf(await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'')));}finally{console.warn=warn;}
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

