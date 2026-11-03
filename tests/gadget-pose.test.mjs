import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,Quaternion,Box3,MathUtils} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createGadgetController,gadgetPhase,GADGET_SECONDS,GRIPS,handFromProp,propFromHand,propInHand,BINOCULARS_SIZE,PHONE_SIZE} from '../src/hiker-gadgets.js';
import {createRealisticHiker} from '../src/realistic-hiker.js';

// 노드에서 실제 등산객 GLB를 읽는다. 텍스처는 그리지 않으므로 빈 이미지로 대신한다.
async function loadHiker(){
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
 const buf=readFileSync(new URL('../assets/realistic/models/hiker/Hiker.glb',import.meta.url)),warn=console.warn;console.warn=()=>{};
 try{return createRealisticHiker(await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),''));}finally{console.warn=warn;}
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

test('쌍안경: 가슴에 걸려 있다가 0.4초에 두 손으로 눈에 대고, 들고 있는 동안 두 손과 쌍안경은 2cm 안이다',async()=>{
 const h=await hikerPromise;reset(h);const bino=h.gadgetProps.binoculars,box=localBox(bino);
 assert.equal(bino.parent,bone(h,'Spine2'),'평소에는 가슴(Spine2)에 걸려 있다');
 // 가슴에 건 쌍안경은 재킷 앞에 붙어 있다(뒷면~재킷 2cm 안)
 const chest=bino.getWorldPosition(new Vector3());assert.ok(chest.y>1.05&&chest.y<1.35,`가슴 높이 ${chest.y}`);
 let maxGap=0,held=0;
 for(let i=0;i<=40;i++){const I=frame(h,{gadget:'binoculars'});
  if(I.gadget.held){held++;assert.equal(bino.parent,bone(h,'RightHand'),'든 동안은 오른손 뼈에 붙는다');
   for(const side of ['Left','Right'])maxGap=Math.max(maxGap,palmToProp(h,side,bino,box));}}
 assert.ok(held>10);assert.ok(maxGap<=.02,`손-쌍안경 최대 ${maxGap}`);
 // 다 든 뒤: 접안렌즈가 두 눈 앞 1~4cm, 경통이 보는 방향
 const head=bone(h,'Head'),eyes=head.localToWorld(new Vector3(-.0025,.0995,.115)),eyepiece=bino.localToWorld(new Vector3(0,0,.075));
 assert.ok(eyes.distanceTo(eyepiece)<.04,`눈-접안 ${eyes.distanceTo(eyepiece)}`);
 // 팔꿈치는 손목보다 아래, 몸 쪽(어깨보다 바깥으로 10cm 넘게 벌어지지 않음)
 for(const [side,sign] of [['Left',-1],['Right',1]]){const e=bone(h,side+'ForeArm').getWorldPosition(new Vector3()),w=bone(h,side+'Hand').getWorldPosition(new Vector3()),s=bone(h,side+'Arm').getWorldPosition(new Vector3());
  assert.ok(e.y<w.y,`${side} 팔꿈치가 손목보다 아래`);assert.ok(e.x*sign<s.x*sign+.1,`${side} 팔꿈치를 모은다 ${e.x}`);}
 // 스틱은 손을 떠나 왼쪽 뒤 땅에 세워 둔다
 for(const p of h.props.poles){const tip=p.tip.getWorldPosition(new Vector3());assert.ok(Math.abs(tip.y)<.005&&tip.x<-.3,'스틱은 왼쪽 땅에');}
 // 보는 방향을 따라간다: 위 20°·왼쪽 30°
 for(let i=0;i<30;i++)frame(h,{gadget:'binoculars',lookPitch:deg(20),lookYaw:deg(30)});
 const axis=new Vector3(0,0,-1).applyQuaternion(bino.getWorldQuaternion(new Quaternion()));
 assert.ok(Math.abs(MathUtils.radToDeg(Math.asin(axis.y))-20)<4,`쌍안경 위 ${MathUtils.radToDeg(Math.asin(axis.y))}°`);
 assert.ok(Math.abs(MathUtils.radToDeg(Math.atan2(-axis.x,-axis.z))-30)<4,`쌍안경 왼쪽 ${MathUtils.radToDeg(Math.atan2(-axis.x,-axis.z))}°`);
 for(const side of ['Left','Right'])assert.ok(palmToProp(h,side,bino,box)<=.02,`${side} 손-쌍안경(위·옆 보기)`);
 // 끄면 내려서 가슴으로 돌아간다
 for(let i=0;i<40;i++)frame(h,{gadget:'none'});assert.equal(bino.parent,bone(h,'Spine2'));
 for(const p of h.props.poles){assert.ok(p.grip.getWorldPosition(new Vector3()).distanceTo(bone(h,p.side+'Hand').localToWorld(new Vector3(0,.085,0)))<.01,'스틱을 다시 쥔다');}
});

test('휴대폰 일반 촬영: 두 손으로 가슴과 얼굴 사이에 가로로 들고 화면이 눈을 향한다. 손-휴대폰 2cm 안',async()=>{
 const h=await hikerPromise;reset(h);const phone=h.gadgetProps.phone,box=localBox(phone);
 assert.equal(phone.visible,false,'평소에는 주머니에 있다');
 let maxGap=0;
 for(let i=0;i<=40;i++){const I=frame(h,{gadget:'phone'});
  if(phone.visible){assert.equal(phone.parent,bone(h,'RightHand'),'보이는 동안은 늘 오른손 뼈에 붙는다');maxGap=Math.max(maxGap,palmToProp(h,'Right',phone,box));}
  if(I.gadget.carry>.999)maxGap=Math.max(maxGap,palmToProp(h,'Left',phone,box));}
 assert.ok(maxGap<=.02,`손-휴대폰 최대 ${maxGap}`);
 const head=bone(h,'Head'),eyes=head.localToWorld(new Vector3(-.0025,.0995,.115)),c=phone.getWorldPosition(new Vector3()),q=phone.getWorldQuaternion(new Quaternion());
 const chest=bone(h,'Spine2').getWorldPosition(new Vector3());
 assert.ok(c.y<eyes.y-.05&&c.y>chest.y,`가슴~얼굴 사이 높이 ${c.y}`);
 const across=new Vector3(0,1,0).applyQuaternion(q);assert.ok(Math.abs(across.y)<.2,'가로로 든다(긴 변이 수평)');
 const screen=new Vector3(0,0,1).applyQuaternion(q),toEyes=eyes.clone().sub(c).normalize();assert.ok(screen.dot(toEyes)>.9,`화면이 눈을 향함 ${screen.dot(toEyes)}`);
 // 렌즈: 뒷면 카메라는 앞(보는 쪽)을 찍는다
 const lens=h.phoneCamera(false);assert.equal(lens.lens,'back');assert.ok(lens.position.distanceTo(c)<.09);assert.ok(lens.direction.z<-.85,`뒷면 렌즈 방향 ${lens.direction.toArray()}`);
 // 보는 방향을 따라 몸·팔이 돈다(오른쪽 40°)
 for(let i=0;i<30;i++)frame(h,{gadget:'phone',lookYaw:deg(-40)});
 const c2=phone.getWorldPosition(new Vector3()),e2=bone(h,'Head').localToWorld(new Vector3(-.0025,.0995,.115)),yaw=MathUtils.radToDeg(Math.atan2(-(c2.x-e2.x),-(c2.z-e2.z)));
 assert.ok(Math.abs(yaw+40)<8,`휴대폰 방향 ${yaw}°`);
 for(const side of ['Left','Right'])assert.ok(palmToProp(h,side,phone,box)<=.02,`${side} 손-휴대폰(돌아보기)`);
});

test('셀카: 오른팔을 앞 위로 뻗어 한 손으로 쥐고 화면이 얼굴을 향한다. 얼굴은 휴대폰을 보고 왼손은 브이',async()=>{
 const h=await hikerPromise;reset(h);const phone=h.gadgetProps.phone,box=localBox(phone);let maxGap=0;
 for(let i=0;i<=40;i++){frame(h,{gadget:'phone'});if(phone.visible)maxGap=Math.max(maxGap,palmToProp(h,'Right',phone,box));}
 for(let i=0;i<=40;i++){const I=frame(h,{gadget:'phone',selfie:true});assert.equal(phone.parent,bone(h,'RightHand'));maxGap=Math.max(maxGap,palmToProp(h,'Right',phone,box));}
 assert.ok(maxGap<=.02,`손-휴대폰 최대(셀카 전환 포함) ${maxGap}`);
 const head=bone(h,'Head'),eyes=head.localToWorld(new Vector3(-.0025,.0995,.115)),c=phone.getWorldPosition(new Vector3()),q=phone.getWorldQuaternion(new Quaternion());
 const shoulder=bone(h,'RightArm').getWorldPosition(new Vector3());
 assert.ok(c.z<shoulder.z-.3&&c.y>shoulder.y+.1,`어깨보다 앞 위로 뻗음 ${c.toArray()} 어깨 ${shoulder.toArray()}`);
 // 한 팔을 거의 편다: 팔꿈치 150~165°
 const elbow=bone(h,'RightForeArm').getWorldPosition(new Vector3()),wrist=bone(h,'RightHand').getWorldPosition(new Vector3());
 const elbowDeg=MathUtils.radToDeg(shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)));assert.ok(elbowDeg>=150&&elbowDeg<=165,`팔꿈치 ${elbowDeg}°`);
 // 휴대폰: 눈 앞 약 50cm(모델 팔 길이 한계로 48cm 이상), 눈보다 10~20cm 위, 몸(엉덩이) 가운데보다 3~15cm 오른쪽
 const toPhone=c.clone().sub(eyes),hipsX=bone(h,'Hips').getWorldPosition(new Vector3()).x;
 assert.ok(toPhone.length()>=.48&&toPhone.length()<=.6,`눈-휴대폰 ${toPhone.length()}`);
 assert.ok(toPhone.y>=.1&&toPhone.y<=.2,`눈보다 위 ${toPhone.y}`);
 assert.ok(c.x-hipsX>=.03&&c.x-hipsX<=.15,`몸 가운데보다 오른쪽 ${c.x-hipsX}`);
 const screen=new Vector3(0,0,1).applyQuaternion(q),toEyes=eyes.clone().sub(c).normalize();assert.ok(screen.dot(toEyes)>.95,`화면이 얼굴을 향함 ${screen.dot(toEyes)}`);
 // 얼굴이 휴대폰을 본다(15° 안)
 const look=h.faceDirection();assert.ok(look.angleTo(c.clone().sub(eyes))<deg(15),`얼굴-휴대폰 ${MathUtils.radToDeg(look.angleTo(c.clone().sub(eyes)))}°`);
 // 전면 렌즈는 얼굴 쪽을 찍는다
 const lens=h.phoneCamera(true);assert.equal(lens.lens,'front');assert.ok(lens.direction.dot(eyes.clone().sub(lens.position).normalize())>.95);
 // 왼손 브이: 손이 어깨보다 위, 검지·중지는 펴고 약지·새끼는 접는다
 assert.ok(bone(h,'LeftHand').getWorldPosition(new Vector3()).y>bone(h,'LeftArm').getWorldPosition(new Vector3()).y,'왼손이 얼굴 옆으로 올라온다');
 assert.ok(bone(h,'LeftHandIndex1').rotation.x>-.3&&bone(h,'LeftHandRing1').rotation.x<-1.2);
 // 브이는 얼굴 옆: 전면 렌즈에서 본 손가락·손이 얼굴(눈) 방향에서 12° 넘게 떨어지고, 손가락 끝은 모자챙(눈+6cm) 아래
 const lensDir=v=>v.clone().sub(lens.position).normalize(),faceRay=lensDir(eyes);
 for(const n of ['LeftHand','LeftHandIndex3','LeftHandMiddle3']){const p=bone(h,n).getWorldPosition(new Vector3());
  assert.ok(MathUtils.radToDeg(lensDir(p).angleTo(faceRay))>12,`${n}이 얼굴을 가림 ${MathUtils.radToDeg(lensDir(p).angleTo(faceRay))}°`);
  assert.ok(p.y<eyes.y+.06,`${n}이 모자챙 높이를 넘음 ${p.y-eyes.y}`);}
 // 셀카를 끄고 휴대폰을 넣으면 숨는다
 for(let i=0;i<60;i++)frame(h,{gadget:'none'});assert.equal(phone.visible,false);
});
