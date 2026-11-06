import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,Quaternion,Box3,MathUtils} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createGadgetController,gadgetPhase,GADGET_SECONDS,GRIPS,handFromProp,propFromHand,propInHand,BINOCULARS_SIZE,PHONE_SIZE} from '../src/hiker-gadgets.js';
import {createRealisticHiker} from '../src/realistic-hiker.js';
import {buildToonHikerGltf} from '../src/toon/link-hiker.js';

// 노드에서 카툰 등산객(동동이) GLB를 읽는다(2026-11-06 실사 모델에서 바꿈, 실사 몸 치수 전용 검사는 뺐다). 텍스처는 그리지 않으므로 빈 이미지로 대신한다.
async function loadHiker(){
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
 const buf=readFileSync(new URL('../assets/toon/models/hiker/Hiker.glb',import.meta.url)),warn=console.warn;console.warn=()=>{};
 try{return createRealisticHiker(buildToonHikerGltf(await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'')));}finally{console.warn=warn;}
}
const flat=()=>0,deg=MathUtils.degToRad;
const bone=(h,n)=>h.model.getObjectByName('mixamorig'+n);
const frame=(h,o={})=>{h.update({clip:'Idle',pose:'stand',dt:1/60,idleSeconds:0,...o});h.ground({moving:false,surfaceHeight:flat});h.scene.updateMatrixWorld(true);return h.interaction;};
const reset=h=>{for(let i=0;i<40;i++)frame(h,{gadget:'none'});};
// 소품 상자(소품 로컬, 끈 제외)
const localBox=prop=>{const c=prop.clone();c.position.set(0,0,0);c.quaternion.identity();c.scale.set(1,1,1);c.visible=true;c.updateMatrixWorld(true);return new Box3().setFromObject(c);};
// 손바닥 가운데(손 뼈 축 위 손목에서 5.5cm)와 소품 겉면(상자) 사이 거리
const palmToProp=(h,side,prop,box)=>{const palm=bone(h,side+'Hand').localToWorld(new Vector3(0,.055,0));prop.updateWorldMatrix(true,false);return box.distanceToPoint(prop.worldToLocal(palm));};
const hikerPromise=loadHiker();

test('기구 전환: 0.4초에 들고, 다른 기구로 바꾸면 먼저 내린 뒤 든다',()=>{
 const c=createGadgetController();let s;
 for(let i=0;i<Math.round(GADGET_SECONDS/.02)-1;i++)s=c.update(.02,{gadget:'binoculars'});
 assert.equal(s.gadget,'binoculars');assert.ok(s.weight>.9&&s.weight<1);
 s=c.update(.02,{gadget:'binoculars'});assert.equal(s.weight,1);assert.equal(s.held,true);
 s=c.update(.1,{gadget:'phone'});assert.equal(s.gadget,'binoculars','먼저 쌍안경을 내린다');assert.ok(s.weight<1);
 for(let i=0;i<4;i++)s=c.update(.1,{gadget:'phone'});assert.equal(s.gadget,'phone');
 for(let i=0;i<5;i++)s=c.update(.1,{gadget:'phone',selfie:true});assert.equal(s.selfie,1);assert.equal(s.weight,1);
 for(let i=0;i<5;i++)s=c.update(.1,{gadget:'none'});assert.equal(s.gadget,'none');assert.equal(s.weight,0);assert.equal(s.selfie,0);
 assert.equal(gadgetPhase(.2).held,false);assert.equal(gadgetPhase(.5).held,true);
});

test('손 자세 ↔ 소품 자세 변환은 서로 거꾸로이고, 붙인 소품은 손이 정한 자리에 온다',()=>{
 const q=new Quaternion().setFromAxisAngle(new Vector3(.3,1,.2).normalize(),.8),p=new Vector3(.2,1.4,-.3);
 for(const g of [GRIPS.binoculars.right,GRIPS.phone.right,GRIPS.selfie.right]){
  const hand=handFromProp(p,q,g),back=propFromHand(hand.position,hand.quaternion,g),inHand=propInHand(g);
  assert.ok(back.position.distanceTo(p)<1e-9&&back.quaternion.angleTo(q)<1e-6);
  const viaHand=inHand.position.clone().applyQuaternion(hand.quaternion).add(hand.position);assert.ok(viaHand.distanceTo(p)<1e-9);
 }
 assert.ok(Math.abs(PHONE_SIZE.width-.07)<1e-9&&Math.abs(PHONE_SIZE.height-.15)<1e-9);
 assert.ok(BINOCULARS_SIZE.length>.13&&BINOCULARS_SIZE.length<.16);
});

test('셀카 브이: 검지·중지는 곧게 펴 V자로 벌리고 약지·새끼는 접고 엄지는 손바닥 쪽으로 접는다',async()=>{
 const {V_FINGERS}=await import('../src/hiker-gadgets.js');
 for(const f of ['Index','Middle'])for(const a of V_FINGERS[f].flex)assert.ok(a<=0&&a>-.1,`${f} 마디는 곧게(꺾이지 않게)`);
 assert.ok(V_FINGERS.Index.splay*V_FINGERS.Middle.splay<0&&Math.abs(V_FINGERS.Index.splay)<.4,'두 손가락은 반대로 살짝 벌어진다');
 for(const f of ['Ring','Pinky']){for(const a of V_FINGERS[f].flex)assert.ok(a<-1&&a>-1.8,`${f} 마디는 자연스러운 주먹 각도`);}
 for(const a of V_FINGERS.Thumb.flex)assert.ok(a<-.5&&a>-1.5);
 const src=(await import('node:fs')).readFileSync(new URL('../src/realistic-hiker.js',import.meta.url),'utf8');
 assert.ok(src.includes('poseVFingers')&&src.includes('fingerBind'),'브이는 바인드 자세에서 계산해 애니메이션 값 영향을 받지 않는다');
});
