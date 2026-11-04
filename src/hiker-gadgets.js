import {Group,Mesh,BoxGeometry,CylinderGeometry,MeshStandardMaterial,Vector3,Quaternion,Matrix4,MathUtils} from 'three';
import {handBasis} from './hiker-interactions.js';
// 쌍안경·휴대폰을 든 자세. 상태(state.gadget·state.phone.selfie)는 산개발의 gadget.js가 정하고, 여기서는 손·소품만 맞춘다.
// 차 마시기처럼 소품 자세(월드)를 먼저 정하고, 손은 그 소품을 쥔 자세로 거꾸로 구한다. 오른손이 소품을 뼈에 붙여 들고, 왼손은 실제 소품 위치를 따라간다.
export const GADGET_SECONDS=.4; // 들어 올리기·내리기 시간
export const GADGET_GRAB=.35;   // 그 앞부분은 손이 소품(가슴의 쌍안경·허리 주머니의 휴대폰)으로 가는 구간
const smooth=t=>{t=MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
// 진행률(0~1) → 손 뻗기·소품 옮기기 가중치. held는 오른손 뼈에 소품이 붙은 구간.
export function gadgetPhase(w){
 w=MathUtils.clamp(Number.isFinite(w)?w:0,0,1);
 return {weight:w,reach:smooth(w/GADGET_GRAB),carry:smooth((w-GADGET_GRAB)/(1-GADGET_GRAB)),held:w>=GADGET_GRAB};
}
// 다른 기구로 바꾸면 먼저 내리고(0.4초) 새 기구를 든다. 셀카 전환도 0.4초.
export function createGadgetController(){
 let current='none',w=0,selfie=0;
 return {update(dt,{gadget='none',selfie:wantSelfie=false}={}){
  dt=Number.isFinite(dt)?MathUtils.clamp(dt,0,.1):0;const step=dt/GADGET_SECONDS;
  const target=['binoculars','phone'].includes(gadget)?gadget:'none';
  if(current==='none')current=target;
  if(target!==current){w=Math.max(0,w-step);if(w===0)current=target;}
  else w=current==='none'?0:Math.min(1,w+step);
  selfie=MathUtils.clamp(selfie+(current==='phone'&&wantSelfie?step:-step),0,1);
  return {gadget:current,selfie:smooth(selfie),selfieLinear:selfie,...gadgetPhase(current==='none'?0:w)};
 }};
}
// 손 자세(소품 로컬): 손목 위치, 손가락 방향, 손바닥이 향하는 쪽. 손 뼈 로컬 +Y=손가락, 오른손 손바닥=-X, 엄지=+Z.
const grip=(position,fingers,palm,sign,curl)=>Object.freeze({position:new Vector3(...position),quaternion:handBasis(new Vector3(...fingers),new Vector3(...palm),sign),curl});
// 쌍안경 로컬: -Z가 보는 쪽(대물렌즈), +Z가 접안렌즈, +Y 위, 경통 중심 x=±3.3cm.
// 눈에 댈 때: 손목은 경통 아래 바깥, 손바닥은 경통 옆면, 손가락은 위로 올라 경통 위를 감싼다(엄지는 접안 쪽 아래).
// 가슴에서 집을 때(rest): 손바닥을 경통 옆면에 대고 손가락을 경통을 따라 뻗는다. 들어 올리는 동안 두 쥠새 사이를 옮겨 간다.
// 휴대폰 로컬: +Z가 화면, -Z가 뒷면(렌즈), +Y가 위쪽 끝. 가로로 들면 +X가 위, +Y가 왼쪽.
export const GRIPS=Object.freeze({
 binoculars:Object.freeze({right:grip([.075,-.07,.035],[-.15,.85,-.5],[-1,.15,0],1,-1.0),left:grip([-.075,-.07,.035],[.15,.85,-.5],[1,.15,0],-1,-1.0),
  restRight:grip([.077,-.035,.05],[-.1,.45,-.89],[-1,.1,0],1,-.9),restLeft:grip([-.077,-.035,.05],[.1,.45,-.89],[1,.1,0],-1,-.9)}),
 // 가로 촬영: 두 손바닥으로 양 끝을 감싸고 손가락은 뒷면 위쪽으로, 엄지는 화면 쪽.
 phone:Object.freeze({right:grip([-.068,-.088,-.004],[1,.08,-.1],[0,1,0],1,-1.0),left:grip([-.068,.088,-.004],[1,-.08,-.1],[0,-1,0],-1,-1.0)}),
 // 셀카: 오른손이 뒷면 아래쪽을 받치고 손가락은 위로, 엄지는 오른쪽 옆면.
 selfie:Object.freeze({right:grip([.004,-.082,-.017],[-.12,1,0],[0,0,1],1,-1.15)})});
// 소품 자세 + 손 자세(소품 로컬) → 손 뼈 월드 자세
export function handFromProp(position,quaternion,g){
 return {position:g.position.clone().applyQuaternion(quaternion).add(position),quaternion:quaternion.clone().multiply(g.quaternion)};
}
// 손 뼈 월드 자세 + 손 자세 → 소품 월드 자세
export function propFromHand(position,quaternion,g){
 const q=quaternion.clone().multiply(g.quaternion.clone().invert());
 return {position:position.clone().sub(g.position.clone().applyQuaternion(q)),quaternion:q};
}
// 손 뼈 기준 소품 자세(뼈에 붙일 때 쓴다)
export function propInHand(g){const q=g.quaternion.clone().invert();return {position:g.position.clone().negate().applyQuaternion(q),quaternion:q};}
// 두 쥠새 사이: 손바닥 가운데(손목에서 5.5cm)를 곧게 옮기고 손목은 그에 맞춘다. 두 끝의 손바닥이 소품 겉면 가까이 있으면 사이에서도 벗어나지 않는다.
const PALM=new Vector3(0,.055,0);
export function blendGrip(a,b,t){
 const quaternion=a.quaternion.clone().slerp(b.quaternion,t),palm=PALM.clone().applyQuaternion(a.quaternion).add(a.position).lerp(PALM.clone().applyQuaternion(b.quaternion).add(b.position),t);
 return {position:palm.sub(PALM.clone().applyQuaternion(quaternion)),quaternion,curl:MathUtils.lerp(a.curl,b.curl,t)};
}
// -Z가 forward, +Y가 up에 가깝게 놓이는 회전
export function lookQuaternion(forward,up){
 const z=forward.clone().normalize().negate(),y=up.clone().addScaledVector(z,-up.dot(z)).normalize(),x=new Vector3().crossVectors(y,z);
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
}
// 소품 크기(m). 쌍안경 8x42 지붕 프리즘형 길이 14.5·폭 12.6cm, 휴대폰 7×15×0.8cm.
export const BINOCULARS_SIZE=Object.freeze({length:.145,width:.126,barrel:.029,eye:.033});
export const PHONE_SIZE=Object.freeze({width:.07,height:.15,depth:.008});
export function createGadgetProps(){
 const black=new MeshStandardMaterial({color:0x151617,roughness:.7}),green=new MeshStandardMaterial({color:0x26382b,roughness:.82}),
  glass=new MeshStandardMaterial({color:0x1d2b3a,roughness:.08,metalness:.5}),coat=new MeshStandardMaterial({color:0x5c6f7b,roughness:.15,metalness:.6});
 const part=(parent,geometry,mat,[x,y,z],rx=0,rz=0)=>{const m=new Mesh(geometry,mat);m.position.set(x,y,z);m.rotation.set(rx,0,rz);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 const along=Math.PI/2; // 원기둥 축(+Y)을 Z축으로
 // 쌍안경: 짙은 녹색 고무 경통 두 개, 검정 대물 테·접안 컵·가운데 다리·초점 바퀴. 끈 고리는 접안 쪽 바깥.
 const binoculars=new Group();binoculars.name='Gadget.Binoculars';
 for(const s of [-1,1]){const x=s*BINOCULARS_SIZE.eye;
  part(binoculars,new CylinderGeometry(.029,.027,.112,16),green,[x,0,-.012],along);
  part(binoculars,new CylinderGeometry(.031,.031,.02,16),black,[x,0,-.064],along);
  part(binoculars,new CylinderGeometry(.023,.023,.002,16),glass,[x,0,-.0745],along);
  part(binoculars,new CylinderGeometry(.021,.024,.03,14),black,[x,0,.06],along);
  part(binoculars,new CylinderGeometry(.015,.015,.002,12),coat,[x,0,.0752],along);
  part(binoculars,new BoxGeometry(.006,.012,.012),black,[s*.06,.004,.035]);}
 part(binoculars,new BoxGeometry(.03,.018,.075),black,[0,.006,-.005]);
 part(binoculars,new CylinderGeometry(.011,.011,.02,14),black,[0,.021,.032],0,Math.PI/2);
 const lugs=[-1,1].map(s=>{const g=new Group();g.position.set(s*.064,.004,.035);binoculars.add(g);return g;});
 // 목끈: 고리에서 목 양옆까지 곧은 띠 두 가닥. 위치는 매 프레임 맞춘다.
 const strapMat=new MeshStandardMaterial({color:0x1b1c1d,roughness:.9});
 const straps=[0,1].map(i=>{const m=new Mesh(new BoxGeometry(.012,1,.003),strapMat);m.name=`Gadget.Binoculars.Strap${i}`;m.castShadow=true;return m;});
 // 휴대폰: 그래파이트 몸체, 검은 화면, 뒷면 왼쪽 위 카메라 섬(렌즈 2개·플래시), 화면 위 전면 카메라.
 const phone=new Group();phone.name='Gadget.Phone';
 const body=new MeshStandardMaterial({color:0x3a3f45,roughness:.35,metalness:.35}),screen=new MeshStandardMaterial({color:0x0b0f14,roughness:.06,metalness:.2,emissive:0x0d1a26,emissiveIntensity:.6});
 part(phone,new BoxGeometry(PHONE_SIZE.width,PHONE_SIZE.height,PHONE_SIZE.depth),body,[0,0,0]);
 part(phone,new BoxGeometry(.066,.145,.0006),screen,[0,0,.0041]);
 part(phone,new BoxGeometry(.03,.03,.0024),new MeshStandardMaterial({color:0x2c3035,roughness:.3,metalness:.4}),[.015,.054,-.0051]);
 for(const y of [.061,.047])part(phone,new CylinderGeometry(.0058,.0058,.0018,16),black,[.015,y,-.0072],along);
 for(const y of [.061,.047])part(phone,new CylinderGeometry(.0036,.0036,.0004,14),glass,[.015,y,-.0082],along);
 part(phone,new CylinderGeometry(.0022,.0022,.0012,10),new MeshStandardMaterial({color:0xf3eedd,emissive:0x302c20}),[.024,.054,-.0068],along);
 part(phone,new CylinderGeometry(.0018,.0018,.0004,10),black,[0,.068,.0046],along);
 // 렌즈 기준점: 카메라처럼 -Z가 찍는 쪽. 뒷면 렌즈는 가로로 들었을 때(+X 위) 사진 위가 하늘이 되게 Z축으로 -90° 돌려 둔다.
 const backLens=new Group();backLens.name='Gadget.Phone.BackLens';backLens.position.set(.015,.061,-.0085);backLens.rotation.z=-Math.PI/2;
 const frontLens=new Group();frontLens.name='Gadget.Phone.FrontLens';frontLens.position.set(0,.068,.0048);frontLens.rotation.y=Math.PI;
 phone.add(backLens,frontLens);phone.visible=false;
 return {binoculars,lugs,straps,phone,backLens,frontLens};
}
// 휴대폰 카메라 렌즈의 월드 자세. selfie면 화면 위 전면 카메라, 아니면 뒷면 카메라.
// position은 렌즈 중심, quaternion은 three.js 카메라에 그대로 넣을 수 있는 회전(-Z가 찍는 쪽), direction은 찍는 방향.
export function phoneLensPose(props,selfie=false,out={}){
 const lens=selfie?props.frontLens:props.backLens;lens.updateWorldMatrix(true,false);
 out.position=lens.getWorldPosition(out.position??new Vector3());out.quaternion=lens.getWorldQuaternion(out.quaternion??new Quaternion());
 out.direction=new Vector3(0,0,-1).applyQuaternion(out.quaternion);out.lens=selfie?'front':'back';out.visible=props.phone.visible;return out;
}

// 셀카 브이 손가락 모양: 마디별 굽힘(라디안, 음수=손바닥 쪽)과 첫 마디 벌림(부모 Z축, 왼손 기준). 검지·중지는 곧게 V자로 벌리고 약지·새끼는 주먹 쥐듯 접으며 엄지가 그 위를 덮는다.
export const V_FINGERS=Object.freeze({Index:{flex:[-.04,-.02,-.02],splay:.2},Middle:{flex:[-.04,-.02,-.02],splay:-.2},Ring:{flex:[-1.45,-1.55,-1.1],splay:0},Pinky:{flex:[-1.4,-1.6,-1.1],splay:0},Thumb:{flex:[-1,-1,-.9],splay:0}});
