import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Box3,Group,Vector3,Quaternion,MathUtils,Euler} from 'three';
import {armSide,armWristTarget,linkArmPose} from './hiker-arms.js';
import {followHeading,headingDelta} from './hiker-facing.js';
import {legTargets,pelvisDrop,poleRotation} from './hiker-ik.js';
import {createHikingProps,createPoseController,poleStep,stanceWeight,standingFoot,standingPoleTip,SEAT,CUP_IN_HAND,handFromCup,handBasis,TEA_HEAD_TILT,TEA_TORSO_TILT,TEA_CUP_TILT} from './hiker-interactions.js';
export {SEATED_EYE_HEIGHT,STANDING_EYE_HEIGHT,SIT_SECONDS,TEA_SECONDS,TEA_HEAD_TILT} from './hiker-interactions.js';
import {createGadgetController,createGadgetProps,poseSelfieStick,GRIPS,TOON_BINO_GRIPS,V_FINGERS,handFromProp,propFromHand,propInHand,blendGrip,lookQuaternion,phoneLensPose} from './hiker-gadgets.js';
export {GADGET_SECONDS,phoneLensPose} from './hiker-gadgets.js';
// 등산객: MPFB(MakeHuman) 몸 + 직접 만든 등산복·모자·배낭을 Blender에서 Mixamo 호환 뼈대로 묶고
// Quaternius UAL(CC0) 동작을 리타겟한 Hiker.glb. 동작(Idle·Look·Walk·Stairs·Rock)을 이동 거리에 맞춰 재생한다.
// 이동 위치는 애니메이션이 아니라 게임이 정한다. 발은 2관절 IK로 노면 높이에 붙인다.
export const ANIM_STEP=.6336; // Walk 클립에서 딛는 발의 앞뒤 이동 범위 = 한 걸음 길이(m, Blender 측정값)
export const HIKER_HEIGHT=1.7; // Hiker.glb 제작 신장(m). 모자 포함 최상단은 이보다 약 4cm 높다.
export const PELVIS_OMEGA=12; // 계단을 통통 오르는 몸의 골반 높이 따라가기(rad/s)
export const WALK_CONTACT_OFFSET=0; // 걷기 클립 0초가 왼발 접지가 아니면 보정(주기 단위)
// 셀카 자세(m·라디안): 휴대폰 가운데를 눈에서 앞 forward·위 up·오른쪽 right에 두고, 오른팔은 팔꿈치 elbow까지만 편다(두 관절 해의 최대 약 154°).
// 이 모델은 팔(어깨~손목 50cm)이 짧고 어깨가 눈보다 16cm 뒤라, 상체를 왼쪽으로 twist 비틀고 오른 쇄골을 protract·shrug만큼 내밀고 들며 lean만큼 뒤로 젖힌다.
// 그래도 닿지 않는 만큼은 앞 거리를 줄인다(실측 눈~휴대폰 약 50cm). 왼손 브이 손목은 얼굴 왼쪽 vSide·휴대폰 쪽 vFront·눈 아래 vDrop.
export const SELFIE=Object.freeze({forward:.55,up:.12,right:.10,elbow:MathUtils.degToRad(154),twist:MathUtils.degToRad(36),protract:MathUtils.degToRad(52),shrug:MathUtils.degToRad(28),lean:0,vSide:.16,vFront:-.05,vDrop:.12});
const A=new Vector3(),B=new Vector3(),C=new Vector3(),T=new Vector3(),U=new Vector3(),P=new Vector3(),NB=new Vector3(),q1=new Quaternion(),q2=new Quaternion(),q3=new Quaternion(),N=new Vector3();
function aim(bone,from,to){ // from→to 방향 변화를 월드 회전으로 적용
 q1.setFromUnitVectors(from,to);bone.getWorldQuaternion(q2);q2.premultiply(q1);bone.parent.getWorldQuaternion(q3);bone.quaternion.copy(q3.invert().multiply(q2));bone.updateMatrixWorld(true);
}
// 걸음 주기 위상 c(0~1, 반 주기마다 한 발이 0에서 착지) → 디딤 비율 clipStance인 클립의 위상. 각 반 주기에서 [0,common]을 [0,clipStance]로,
// 나머지를 [clipStance,0.5]로 늘이거나 줄인다. 두 클립을 같은 common으로 바꾸면 디딤·뜀 구간이 같은 때에 온다.
export function stanceWarp(c,common,clipStance){
 const h=c%.5,base=c-h;
 return base+(h<common?h/common*clipStance:clipStance+(h-common)/(.5-common)*(.5-clipStance));
}
export async function loadRealisticHiker(url,options){return createRealisticHiker(await new GLTFLoader().loadAsync(url),options);}
// 이미 읽은 glTF로 등산객을 만든다(노드 테스트에서 파일을 직접 파싱해 쓴다).
// 남성 가슴: 원본 MPFB 몸이 가슴 양쪽(x ±7.5cm, 높이 1.255m)을 가운데보다 1.5cm 앞으로 내밀어 여성형으로 보인다.
// 몸·상의·칼라·지퍼·어깨끈을 같은 양만큼 뒤로 눌러 겹침 간격은 그대로 두고, 노멀은 같은 기울기로 돌린다.
export const CHEST_FLATTEN={x:.075,y:1.255,rx:.075,ry:.085,depth:.013,frontFrom:.03,frontTo:.08};
export function flattenChest(model){
 const {x:cx,y:cy,rx,ry,depth,frontFrom,frontTo}=CHEST_FLATTEN;
 model.traverse(o=>{if(!o.isSkinnedMesh||!/^human(jacket|collar|zipper|straps)?$/i.test(o.name.replace(/[:._]/g,'')))return;
  const g=o.geometry;if(g.userData.chestFlattened)return;g.userData.chestFlattened=true; // 여럿이 복제해도 형상은 한 번만
  const p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const front=MathUtils.smoothstep(z,frontFrom,frontTo);if(!front)continue;
   let d=0,dx=0,dy=0;
   for(const s of [-1,1]){const u=(x-s*cx)/rx,v=(y-cy)/ry,r2=u*u+v*v;if(r2>=1)continue;const f=1-r2;d+=f*f;dx+=-4*f*u/rx;dy+=-4*f*v/ry;}
   if(!d)continue;
   const a=depth*front;p.setZ(i,z-a*d);
   if(n){const nz=n.getZ(i);N.set(n.getX(i)+a*dx*nz,n.getY(i)+a*dy*nz,nz).normalize();n.setXYZ(i,N.x,N.y,N.z);}}
  p.needsUpdate=true;if(n)n.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();});
}
// 몸마다 다른 치수. 기본값은 실사 등산객(Hiker.glb) 측정값이고, 카툰 캐릭터(src/toon/link-hiker.js)는 scene.userData.hikerProfile로 덮는다.
// animSteps: 클립의 한 걸음 길이(걷기·뛰기·계단/바위), runStride: 뛸 때 걸음 길이 배율, chest*: 가슴에 건 쌍안경 자리, eye/mouthLocal: 머리 뼈 기준 눈·입, seat: SEAT 덮어쓰기.
export const DEFAULT_HIKER_PROFILE=Object.freeze({kind:'realistic',animSteps:null,runStride:1.16,chestY:1.21,chestMesh:'jacket',chestFront:-.19,eyeLocal:[-.0025,.0995,.115],mouthLocal:[0,.015,.10],seat:null,strideScale:null,runSpeed:null,dressable:true,binoLean:0,standSlack:.02});
export function createRealisticHiker(gltf,{height=1.7}={}){
 const model=gltf.scene,root=new Group(),prof={...DEFAULT_HIKER_PROFILE,...(model.userData?.hikerProfile??{})},seat={...SEAT,...(prof.seat??{})},link=prof.kind==='link'||prof.kind==='toon';
 // 셀카·쌍안경·휴대폰 자리(몸마다 다름). 카툰 동동이는 머리가 커서 얼굴이 어깨보다 한참 앞이고 팔이 짧다.
 const SF={...SELFIE,...(prof.selfie??{})},GP={binoEye:.095,binoTorso:[.4,.25],binoStyle:'realistic',binoDepth:.036,phoneForward:.27,phoneDown:.15,shrug:0,protract:0,...(prof.gadget??{})},poleLength=prof.poleLength??1.10;
 flattenChest(model);
 root.add(model);model.rotation.y=Math.PI;model.updateMatrixWorld(true); // glTF는 +Z가 앞, 이 앱의 앞(heading 0)은 -Z
 const box=new Box3().setFromObject(model),k=height/HIKER_HEIGHT;model.scale.multiplyScalar(k);model.position.y=-box.min.y*k;model.updateMatrixWorld(true);
 const bone=n=>model.getObjectByName('mixamorig'+n);
 // 손가락 바인드 자세(애니메이션이 덮기 전). 브이처럼 손가락 모양을 직접 정할 때 기준으로 쓴다.
 const fingerBind=new Map();for(const side of ['Left','Right'])for(const f of ['Thumb','Index','Middle','Ring','Pinky'])for(const n of [1,2,3]){const b=bone(`${side}Hand${f}${n}`);if(b)fingerBind.set(b,b.quaternion.clone());}
 // 머리카락·눈썹·속눈썹은 알파 컷아웃(투명 정렬 문제 방지), 나머지는 그림자 수신·발신
 model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=!o.userData.noReceiveShadow;o.frustumCulled=!o.isSkinnedMesh;const m=o.material;
  if(m.transparent){m.transparent=false;m.alphaTest=.4;m.depthWrite=true;m.needsUpdate=true;}
  m.envMapIntensity=.7;});
 const pack=new Group(); // 배낭은 모델에 포함됨(호환용 빈 그룹)
 const mixer=new AnimationMixer(model),clips=Object.fromEntries(gltf.animations.map(c=>[c.name,c])),actions={Idle:mixer.clipAction(clips.Look),Walk:mixer.clipAction(clips.Walk),Climb:mixer.clipAction(clips.Stairs),Scramble:mixer.clipAction(clips.Rock),...(clips.Run?{Run:mixer.clipAction(clips.Run)}:{})};
 const bind=new Box3().setFromObject(model,true),legs0=['Left','Right'].map(n=>[bone(n+'Foot'),bone(n+'ToeBase')]);
 const ankle=Math.min(...legs0.map(([f])=>f.getWorldPosition(P).y-bind.min.y)),toeH=Math.min(...legs0.map(([,t])=>t.getWorldPosition(P).y-bind.min.y));
 const legs=['Left','Right'].map(side=>({side,up:bone(side+'UpLeg'),knee:bone(side+'Leg'),foot:bone(side+'Foot'),toe:bone(side+'ToeBase'),restWorldQuaternion:bone(side+'Foot').getWorldQuaternion(new Quaternion())}));
 // 신발 메시 바닥 꼭짓점(스키닝 반영). 발목 높이 추정 대신 실제 꼭짓점으로 접지한다.
 let boots;model.traverse(o=>{if(o.isSkinnedMesh&&/boots/i.test(o.name))boots=o;});
 const soleAll=[[],[]],soleSmp=[[],[]],V0=new Vector3();
 if(boots){model.updateMatrixWorld(true);boots.skeleton.update();const lp=legs.map(l=>l.foot.getWorldPosition(new Vector3())),n=boots.geometry.attributes.position.count,pts=[];let minY=Infinity;
  for(let i=0;i<n;i++){boots.getVertexPosition(i,V0).applyMatrix4(boots.matrixWorld);pts.push(V0.clone());minY=Math.min(minY,V0.y);}
  const fwd=legs.map((l,k)=>{const t=l.toe.getWorldPosition(new Vector3());return {t,d:new Vector3(t.x-lp[k].x,0,t.z-lp[k].z).normalize()};});
  pts.forEach((v,i)=>{if(v.y>minY+.035)return;const k=Math.abs(v.x-lp[0].x)+Math.abs(v.z-lp[0].z)<Math.abs(v.x-lp[1].x)+Math.abs(v.z-lp[1].z)?0:1;soleAll[k].push({i,front:(v.x-fwd[k].t.x)*fwd[k].d.x+(v.z-fwd[k].t.z)*fwd[k].d.z>-.02});});
  for(const k of [0,1]){const L=soleAll[k];if(!L.length)continue;const chosen=[L[0]];while(chosen.length<Math.min(56,L.length)){let best=null,bd=-1;for(const c of L){let md=Infinity;for(const q of chosen)md=Math.min(md,pts[c.i].distanceToSquared(pts[q.i]));if(md>bd){bd=md;best=c;}}chosen.push(best);}soleSmp[k]=chosen;}}
 const VV=new Vector3();
 const soleMin=(k,list,groundAt)=>{ // 바닥 표본점 중 가장 낮은 높이(앞/뒤 따로), 지면 대비 관통량
  let lo=Infinity,loF=Infinity,loB=Infinity,pen=-Infinity;for(const c of list){boots.getVertexPosition(c.i,VV).applyMatrix4(boots.matrixWorld);lo=Math.min(lo,VV.y);if(c.front)loF=Math.min(loF,VV.y);else loB=Math.min(loB,VV.y);if(groundAt){const g=groundAt(VV.x,VV.z)-VV.y;if(g>pen)pen=g;}}
  return {lo,loF,loB,pen};};
 let current,lastIdle,lastDistance,weights={};const modelY=model.position.y;
 // 걷기 클립 전체에서 발목이 가장 낮은 높이(딛는 중) — 이보다 올라간 만큼이 발 들기
 // 발바닥 최저점(뒤꿈치·발끝 중 낮은 쪽) 높이. 딛는 동안(발끝이 땅에 닿은 채 뒤꿈치가 들려도) 이 값은 일정하다.
 const soleOf=(l)=>{if(boots){boots.skeleton.update();return soleMin(l.side==='Left'?0:1,soleSmp[l.side==='Left'?0:1]).lo;}return Math.min(l.foot.getWorldPosition(P).y-ankle,l.toe.getWorldPosition(NB).y-toeH);};
 let plantRel=Infinity;{const lv=[];const wa=actions.Walk,d=wa.getClip().duration;root.updateMatrixWorld(true);for(let i=0;i<48;i++){wa.play();wa.time=i/48*d;mixer.update(0);model.updateMatrixWorld(true);for(const l of legs)lv.push(soleOf(l)-root.position.y);}wa.stop();lv.sort((a,b)=>a-b);plantRel=lv[Math.floor(lv.length*.22)];}
 const props=createHikingProps(),poseController=createPoseController(prof.eyeHeight);
 for(const p of props.poles)root.add(p.group);root.add(props.cup,props.flask);
 const arms=['Left','Right'].map(side=>({side,up:bone(side+'Arm'),knee:bone(side+'ForeArm'),foot:bone(side+'Hand'),fingers:['Index','Middle','Ring','Pinky'].flatMap(f=>[1,2,3].map(n=>bone(side+'Hand'+f+n))).filter(Boolean)}));
 const hips=bone('Hips'),head=bone('Head'),neck=bone('Neck'),spine=['Spine','Spine1','Spine2'].map(bone);
 const neutral=[neck,head].map(b=>b.quaternion.clone()); // 바인드 자세(정면) 목·머리 회전
 const chestLocal=new Vector3(0,0,-1).applyQuaternion(spine[2].getWorldQuaternion(new Quaternion()).invert()); // 가슴 뼈 로컬 앞쪽(불러온 자세 기준)
 // 상체·목·머리는 차 마시기에서 회전을 더한다. 믹서는 값이 그대로면 뼈를 다시 쓰지 않으므로,
 // 믹서를 돌리기 전 직전 동작 값으로 되돌려 회전이 누적되지 않게 한다.
 const torsoBones=[...spine,neck,head,bone('RightShoulder'),bone('LeftShoulder')],torsoAnim=torsoBones.map(b=>b.quaternion.clone());
 let interaction=poseController.update(0),inputs={},stance=0,stepSmooth=null,wasStairs=false,pelvisY=null,pelvisV=0,hopDrop=0,lastDt=1/60,stairShift=0,stairRaw=null,stairStep=null,treadLen=.3;const stairPrev={},gaitMix={common:0,blending:false};
 // 디딤판 맞추기: 발이 내릴 자리(몸 앞 prof.stairHop.lead)가 디딤판의 몇 % 자리인지 노면 높이의 턱(0.8cm 넘는 높이 변화)으로 찾는다. 못 찾으면 null.
 const treadFraction=(surfaceHeight,lead)=>{if(!surfaceHeight)return null;
  const fx=-Math.sin(root.rotation.y),fz=-Math.cos(root.rotation.y),px=root.position.x+fx*lead,pz=root.position.z+fz*lead,h=t=>surfaceHeight(px+fx*t,pz+fz*t),D=.015;
  let back=null,front=null,prev=h(0);for(let t=-D;t>=-.45;t-=D){const v=h(t);if(Math.abs(prev-v)>.008){back=t+D/2;break;}prev=v;}
  prev=h(0);for(let t=D;t<=.45;t+=D){const v=h(t);if(Math.abs(v-prev)>.008){front=t-D/2;break;}prev=v;}
  // 계단 첫 칸·마지막 칸처럼 한쪽 턱만 보이면 직전 디딤판 길이(처음은 0.30m)로 칸을 이어 그린다.
  if(back!==null&&front!==null&&front-back>=.12){treadLen=front-back;return -back/treadLen;}
  if(front!==null)return 1-front/treadLen;if(back!==null)return -back/treadLen;return null;};
 // 위상 차이는 걸음 빠르기의 ±45% 안에서만 옮긴다(서 있으면 옮기지 않아 발이 미끄러지지 않는다).
 // 계단 클립 발 앞뒤 배율 = 맞춘 한 걸음 동안 간 거리 / 클립 한 걸음
 const stairScale=()=>stairStep===null?1:MathUtils.clamp(stairStep/(prof.animSteps?.climb??ANIM_STEP),.6,1.15);
 const stairLock=(raw,on,surfaceHeight)=>{const d=stairRaw===null?0:raw-stairRaw;stairRaw=raw;const lim=.45*Math.abs(d);
  const fr=on?treadFraction(surfaceHeight,prof.stairHop.lead*stairScale()+prof.stairHop.boot):null,wrap=x=>x-Math.round(x);
  const target=fr!==null?stairShift+wrap(fr-.5-(raw+stairShift)):2*Math.round(stairShift/2);
  stairShift+=MathUtils.clamp((target-stairShift)*(1-Math.exp(-lastDt/.2)),-lim,lim);};const gaitBlend={run:0,move:0};
 const THREE_CLAMP=d=>Number.isFinite(d)?MathUtils.clamp(d,0,.1):0;
 const local=(x,y,z)=>root.localToWorld(new Vector3(x,y,z));
 const rootQ=()=>root.getWorldQuaternion(new Quaternion()),dir=(x,y,z)=>new Vector3(x,y,z).applyQuaternion(rootQ()).normalize();
 // 공통 두 관절 해: bend 쪽으로 가운데 관절(무릎·팔꿈치)을 굽힌다.
 const limb=(l,target,bend)=>{
  const a=l.up.getWorldPosition(new Vector3()),b=l.knee.getWorldPosition(new Vector3()),c=l.foot.getWorldPosition(new Vector3());
  const solved=legTargets(a,target,a.distanceTo(b),b.distanceTo(c),bend);
  aim(l.up,b.sub(a).normalize(),solved.knee.clone().sub(a).normalize());
  l.knee.getWorldPosition(b);l.foot.getWorldPosition(c);
  aim(l.knee,c.sub(b).normalize(),solved.foot.clone().sub(b).normalize());
 };
 // 뼈에 월드 축 기준 회전을 더한다(상체·고개 젖힘).
 const turnWorld=(b,axis,angle)=>{if(!angle)return;q1.setFromAxisAngle(axis,angle);b.getWorldQuaternion(q2);q2.premultiply(q1);b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q2));b.updateMatrixWorld(true);};
 const setWorldQuaternion=(b,q)=>{b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q));b.updateMatrixWorld(true);};
 const setWorld=(o,p)=>o.position.copy(root.worldToLocal(p.clone()));
 const cupLocal=new Vector3(...CUP_IN_HAND.position);
 // 컵은 잡은 동안 오른손 뼈의 자식으로 붙인다. 손 뼈 축척을 나눠 실제 크기를 지킨다.
 const holdCup=(hand,held)=>{
  const cup=props.cup;
  if(held){if(cup.parent!==hand){hand.add(cup);}const sc=hand.getWorldScale(new Vector3());cup.position.copy(cupLocal).divide(sc);cup.quaternion.copy(CUP_IN_HAND.quaternion);cup.scale.set(1/sc.x,1/sc.y,1/sc.z);}
  else if(cup.parent!==root){root.add(cup);cup.scale.set(1,1,1);cup.rotation.set(0,0,0);}
  cup.updateMatrixWorld(true);
 };
 // 땅 위 컵을 잡을 수 있도록 오른쪽(조금 앞)으로 기울일 각도(0~30°). 상체를 기울이고 오른 어깨(쇄골)를 그 0.7배 내린다.
 // 실제 뼈를 돌려 어깨→손 거리를 재고 되돌린다.
 const clavicle=bone('RightShoulder'),leanAxis=()=>dir(-.25,0,-1);
 const applyLean=angle=>{const axis=leanAxis();for(const b of spine)turnWorld(b,axis,angle/3);turnWorld(clavicle,axis,angle*.7);};
 const reachLean=(arm,handTarget)=>{
  const bones=[...spine,clavicle],keep=bones.map(b=>b.quaternion.clone()),reach=arm.up.getWorldPosition(new Vector3()).distanceTo(arm.knee.getWorldPosition(new Vector3()))+arm.knee.getWorldPosition(new Vector3()).distanceTo(arm.foot.getWorldPosition(new Vector3()))-.025;
  let angle=0;for(let deg=0;deg<=30;deg+=2){angle=MathUtils.degToRad(deg);applyLean(angle);const d=arm.up.getWorldPosition(new Vector3()).distanceTo(handTarget);bones.forEach((b,i)=>{b.quaternion.copy(keep[i]);});spine[0].updateMatrixWorld(true);clavicle.updateMatrixWorld(true);if(d<=reach)break;}
  return angle;
 };
 // 얼굴이 수평에서 위로 든 각도. 머리 뼈 +Z는 얼굴 앞보다 조금 아래를 향하므로 처음 불러온 자세의 값을 0으로 둔다.
 const headPitch=()=>{const f=new Vector3(0,0,1).applyQuaternion(head.getWorldQuaternion(new Quaternion())).applyQuaternion(rootQ().invert());return Math.atan2(f.y,Math.hypot(f.x,f.z));};
 const headPitch0=headPitch(),facePitch=()=>headPitch()-headPitch0;
 let teaLean=0;
 // 쌍안경·휴대폰. 쌍안경은 평소 가슴(Spine2)에 목끈으로 걸려 있고, 휴대폰은 오른쪽 허리 주머니에 있다가 손에 쥐면 보인다.
 const gadgetController=createGadgetController(),gadgetProps=createGadgetProps({style:GP.binoStyle}),BINO_GRIPS=GP.binoStyle==='toon'?TOON_BINO_GRIPS:GRIPS.binoculars,spine2=spine[2],UP=new Vector3(0,1,0);
 let gadget=gadgetController.update(0);root.add(gadgetProps.phone,...gadgetProps.straps);
 // 얼굴 정면·위 방향(머리 뼈 로컬)과 두 눈 중심(눈 메시 측정, 머리 뼈 로컬 m). 불러온 자세의 얼굴을 수평 정면으로 본다.
 const headQ0=head.getWorldQuaternion(new Quaternion()).invert(),faceLocal=new Vector3(0,0,-1).applyQuaternion(headQ0),faceUpLocal=new Vector3(0,1,0).applyQuaternion(headQ0);
 const eyeLocal=new Vector3(...prof.eyeLocal);
 // 가슴에 건 쌍안경: 재킷 앞면(가운데 ±5cm, 높이 1.21m)에 뒷면이 닿게, 접안렌즈가 위·대물렌즈가 아래.
 const binoRest={};{let front=prof.chestFront===null?Infinity:prof.chestFront*k;const jacket=[],chestRe=new RegExp(prof.chestMesh,'i');model.traverse(o=>{if(o.isSkinnedMesh&&chestRe.test(o.name))jacket.push(o);});
  for(const o of jacket){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,V0).applyMatrix4(o.matrixWorld);if(Math.abs(V0.x)<.05*k&&Math.abs(V0.y-prof.chestY*k)<.03*k)front=Math.min(front,V0.z);}}
  if(!Number.isFinite(front))front=-.19*k;
  const center=new Vector3(0,prof.chestY*k,front-GP.binoDepth);binoRest.position=spine2.worldToLocal(center.clone());
  binoRest.quaternion=spine2.getWorldQuaternion(new Quaternion()).invert().multiply(lookQuaternion(new Vector3(0,-1,0),new Vector3(0,0,-1)));}
 // 목끈이 걸리는 목 양옆(목 뼈 로컬)
 const strapNeck=[-1,1].map(s=>neck.worldToLocal(neck.getWorldPosition(new Vector3()).add(new Vector3(s*.055,-.035,.01))));
 // 소품을 뼈에 붙인다. 위치는 부모 뼈 로컬, 축척은 부모 축척을 나눠 실제 크기를 지킨다.
 const attach=(obj,parent,position,quaternion,worldUnits)=>{if(obj.parent!==parent)parent.add(obj);const sc=parent.getWorldScale(new Vector3());obj.position.copy(position);if(worldUnits)obj.position.divide(sc);obj.quaternion.copy(quaternion);obj.scale.set(1/sc.x,1/sc.y,1/sc.z);obj.updateMatrixWorld(true);};
 const faceDir=()=>faceLocal.clone().applyQuaternion(head.getWorldQuaternion(new Quaternion())),faceUp=()=>faceUpLocal.clone().applyQuaternion(head.getWorldQuaternion(new Quaternion()));
 const yawOf=v=>Math.atan2(-v.x,-v.z),pitchOf=v=>Math.atan2(v.y,Math.hypot(v.x,v.z));
 // 얼굴을 target 방향으로 돌린다. 둘러보기 동작의 고개를 정면으로 모은 뒤 목(40%)·머리(60%)에 나누고, 남은 오차는 머리로 맞춘다.
 const aimFace=(target,w)=>{if(!(w>0))return;
  for(const [k,b]of [neck,head].entries()){b.quaternion.slerp(neutral[k],w);b.updateMatrixWorld(true);}
  for(const [bones,share] of [[[neck,head],[.4,.6]],[[head],[1]]]){
   let f=faceDir();const dy=headingDelta(yawOf(f),yawOf(target))*w;bones.forEach((b,i)=>turnWorld(b,UP,dy*share[i]));
   f=faceDir();const dp=(pitchOf(target)-pitchOf(f))*w,axis=new Vector3().crossVectors(f,UP).normalize();bones.forEach((b,i)=>turnWorld(b,axis,dp*share[i]));}
 };
 // 상체(Spine 3개)를 보는 방향으로 돌리고(yaw) 숙이거나 젖힌다(pitch).
 const turnSpine=(yaw,pitch)=>{for(const b of spine)turnWorld(b,UP,yaw/3);const axis=dir(1,0,0).applyAxisAngle(UP,yaw);for(const b of spine)turnWorld(b,axis,pitch/3);};
 // 쇄골을 앞으로 모은다(어깨 내밀기). 이 모델은 어깨 관절이 목보다 10cm 뒤에 있어 앞으로 든 손이 닿도록 돕는다.
 const protract=angle=>{turnWorld(bone('LeftShoulder'),UP,-angle);turnWorld(bone('RightShoulder'),UP,angle);};
 // 쇄골을 들어 올린다(어깨 으쓱). 팔이 짧은 몸(카툰 동동이)이 얼굴 앞까지 손을 올릴 때 돕는다.
 // 축은 지금 가슴이 향한 앞쪽(상체를 돌리거나 젖혀도 어깨가 위로 들린다).
 const raiseShoulders=(angle,left=true)=>{if(!angle)return;const f=chestLocal.clone().applyQuaternion(spine[2].getWorldQuaternion(new Quaternion()));if(left)turnWorld(bone('LeftShoulder'),f,angle);turnWorld(bone('RightShoulder'),f.clone().negate(),angle);};
 // 루트 기준 yaw(왼쪽 +)·pitch(위 +) → 월드 방향
 const viewDir=(yaw,pitch)=>dir(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
 const offset=(x,y,z)=>new Vector3(x,y,z).applyQuaternion(rootQ()); // 루트 기준 거리(m) → 월드
 const blendPose=(a,b,t)=>({position:a.position.clone().lerp(b.position,t),quaternion:a.quaternion.clone().slerp(b.quaternion,t)});
 // 브이 손가락 모양(V_FINGERS는 hiker-gadgets.js). 애니메이션이 덮은 값을 쓰지 않고 바인드 자세에서 직접 계산해 손가락이 꺾이거나 늘어나지 않게 한다.
 const vAxisX=new Vector3(1,0,0),vAxisZ=new Vector3(0,0,1),vQa=new Quaternion(),vQb=new Quaternion(),vEul=new Euler();
 const poseVFingers=(arm,w)=>{
  for(const [name,cfg] of Object.entries(V_FINGERS))for(let n=0;n<3;n++){const b=bone(`${arm.side}Hand${name}${n+1}`),bind=fingerBind.get(b);if(!b||!bind)continue;
   const sp=n===0?cfg.splay*(arm.side==='Left'?1:-1):0;
   if(cfg.rot){const r=cfg.rot[n],m=arm.side==='Left'?1:-1;vQa.setFromEuler(vEul.set(r[0],r[1]*m,r[2]*m));}else vQa.setFromAxisAngle(vAxisX,cfg.flex[n]);vQb.setFromAxisAngle(vAxisZ,sp);vQb.multiply(vQa).multiply(bind);b.quaternion.slerp(vQb,w);}
 };
 const V_CURL=[-.05,-.05,-.05,-.05,-.05,-.05,-1.45,-1.45,-1.45,-1.45,-1.45,-1.45]; // 브이: 검지·중지는 펴고 약지·새끼는 접는다
 // 쌍안경·휴대폰 자세: 소품 월드 자세와 두 손 목표(위치·회전·팔꿈치 방향·가중치·손가락)를 정한다.
 const solveGadget=()=>{
  const G=gadget,deg=MathUtils.degToRad,yawIn=inputs.lookYaw??0,pitchIn=inputs.lookPitch??0;
  if(G.gadget==='binoculars'){
   // 보는 방향: 몸 기준 좌우 ±75°, 위 50°·아래 40°. 상체가 yaw 40%·pitch 25%를 맡고 나머지는 고개가 맡는다.
   const yaw=MathUtils.clamp(yawIn,-deg(75),deg(75))*G.reach,pitch=MathUtils.clamp(pitchIn,-deg(40),deg(50))*G.reach;
   // binoLean: 쌍안경을 눈에 댈 때 상체를 앞으로 숙이는 각(도). 팔을 얼굴 앞으로 들면 무게가 앞으로 오므로 사람은 가슴을 살짝 앞으로 낸다(뒤로 젖혀 보이지 않게).
   // binoTorso: 상체가 맡는 몫(실사 yaw 40%·pitch 25%). 팔이 짧은 몸은 상체가 더 돌고 젖혀 손이 얼굴 앞에 닿는다.
   turnSpine(yaw*GP.binoTorso[0],pitch*GP.binoTorso[1]-deg(prof.binoLean)*G.reach);protract(deg(15+GP.protract)*G.reach);raiseShoulders(deg(GP.shrug+(GP.binoShrugUp??0)*Math.max(0,pitch)+(GP.binoShrugSide??0)*Math.abs(yaw))*G.reach);aimFace(viewDir(yaw,pitch),G.reach);
   const eyes=head.localToWorld(eyeLocal.clone()),face=faceDir();
   const atEyes={position:eyes.addScaledVector(face,GP.binoEye).addScaledVector(faceUp(),GP.binoUp??0),quaternion:lookQuaternion(face,faceUp())};
   const rest={position:spine2.localToWorld(binoRest.position.clone()),quaternion:spine2.getWorldQuaternion(new Quaternion()).multiply(binoRest.quaternion)};
   const pose=blendPose(rest,atEyes,G.carry),B=BINO_GRIPS,gr=blendGrip(B.restRight,B.right,G.carry),gl=blendGrip(B.restLeft,B.left,G.carry);
   return {prop:gadgetProps.binoculars,pose,grip:gr,hands:[{...handFromProp(pose.position,pose.quaternion,gl),grip:gl,bend:dir(-.1,-1,.2),weight:G.reach,curl:gl.curl,onProp:true},
    {...handFromProp(pose.position,pose.quaternion,gr),bend:dir(.1,-1,.2),weight:G.reach,curl:gr.curl}],busy:[G.reach,G.reach]};
  }
  // 휴대폰: 일반 촬영은 몸이 보는 방향으로 돌고(상체 yaw 60%) 두 손으로 가로로 든다. 셀카는 오른팔을 앞 위로 뻗는다.
  const sw=G.selfie,yaw=MathUtils.lerp(MathUtils.clamp(yawIn,-deg(80),deg(80)),MathUtils.clamp(yawIn,-deg(25),deg(25)),sw)*G.reach;
  const pitch=MathUtils.clamp(pitchIn,-deg(45),deg(45))*G.reach;
  const sk=sw*G.reach;
  turnSpine(yaw*MathUtils.lerp(.6,.4,sw)+SF.twist*sk,pitch*.2*(1-sw)+SF.lean*sk);protract(deg(35+GP.protract)*G.reach);raiseShoulders(deg(GP.shrug)*G.reach);
  // 셀카: 오른 쇄골을 더 내밀고 들어 올려 뻗은 팔이 얼굴 앞까지 닿게 한다(이 모델은 어깨 관절이 눈보다 16cm 뒤).
  if(sk>0){const c=bone('RightShoulder');turnWorld(c,UP,SF.protract*sk);turnWorld(c,dir(0,0,1),SF.shrug*sk);}
  const eyes=head.localToWorld(eyeLocal.clone()),D=viewDir(yaw,pitch),Uv=UP.clone().addScaledVector(D,-UP.dot(D)).normalize();
  // 일반: 눈 앞 27cm·아래 15cm(가슴과 얼굴 사이, 팔을 앞으로 뻗어 닿는 거리), 화면은 눈을 향하고 휴대폰 +X(가로로 든 위쪽)가 위.
  const nCenter=eyes.clone().addScaledVector(D,GP.phoneForward).addScaledVector(Uv,-GP.phoneDown);
  // 화면 방향은 얼굴을 휴대폰 쪽으로 돌린 뒤의 눈 위치로 정한다(아래 orient).
  const orientNormal=e=>lookQuaternion(nCenter.clone().sub(e),Uv).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2));
  // 셀카: 눈에서 보는 방향으로 SF.forward, 위로 SF.up, 오른쪽으로 SF.right. 화면이 얼굴을 향한다. 위아래 보기는 절반만 따른다.
  // 팔꿈치가 SF.elbow보다 더 펴져야 닿는 자리면 높이·좌우는 두고 앞 거리만 줄인다(손목이 어깨에서 armReach인 자리).
  const shoulder=arms[1].up.getWorldPosition(new Vector3()),lift=MathUtils.clamp(pitchIn*.5,-deg(15),deg(15));
  const ua=shoulder.distanceTo(arms[1].knee.getWorldPosition(new Vector3())),fa=arms[1].knee.getWorldPosition(new Vector3()).distanceTo(arms[1].foot.getWorldPosition(new Vector3()));
  const armReach=Math.sqrt(ua*ua+fa*fa-2*ua*fa*Math.cos(SF.elbow));
  const Ds=viewDir(yaw,lift),Rs=new Vector3().crossVectors(Ds,UP).normalize();
  // 셀카봉을 쓰는 몸(prof.selfieStick)은 봉 끝을 쥐고, 휴대폰은 봉 길이만큼 더 멀리 둔다.
  const sg=prof.selfieStick?GRIPS.selfieStick.right:GRIPS.selfie.right;
  const selfieAt=e=>{const base=e.clone().addScaledVector(UP,SF.up).addScaledVector(Rs,SF.right),at=f=>base.clone().addScaledVector(Ds,f),c=at(SF.forward);
   const off=handFromProp(c,lookQuaternion(c.clone().sub(e),UP),sg).position.sub(c),a=base.clone().add(off).sub(shoulder),ad=a.dot(Ds),disc=ad*ad-a.lengthSq()+armReach*armReach;
   return at(Math.min(SF.forward,disc>0?-ad+Math.sqrt(disc):-ad));};
  const hips0=hips.getWorldPosition(new Vector3()).add(offset(.19,.04,-.07)),pocketHand={position:hips0,quaternion:handBasis(dir(0,-1,-.15),dir(-1,0,0),1)};
  const pocket=propFromHand(pocketHand.position,pocketHand.quaternion,GRIPS.selfie.right);
  // 고개를 돌리면 눈 위치도 옮겨 가므로 옮겨 간 눈에서 다시 한 번 셀카 자리를 정하고 겨눈다.
  let sCenter=selfieAt(eyes);
  for(let pass=0,e=eyes;pass<3;pass++,e=head.localToWorld(eyeLocal.clone())){if(sw>0)sCenter=selfieAt(e);aimFace(nCenter.clone().lerp(sCenter,sw).sub(e).normalize(),G.carry);}
  const orientSelfie=e=>lookQuaternion(sCenter.clone().sub(e),UP);
  const eyes2=head.localToWorld(eyeLocal.clone()),normal={position:nCenter,quaternion:orientNormal(eyes2)},selfie={position:sCenter,quaternion:orientSelfie(eyes2)};
  const pose=blendPose(pocket,blendPose(normal,selfie,sw),G.carry),gr=blendGrip(GRIPS.selfie.right,blendGrip(GRIPS.phone.right,sg,sw),G.carry);
  // 왼손: 일반은 휴대폰 왼쪽 끝, 셀카는 얼굴 옆에서 브이.
  // 브이 손목: 얼굴 왼쪽 옆(휴대폰에서 본 얼굴 옆) vSide, 휴대폰 쪽으로 vFront, 눈 아래 vDrop. 손가락 끝이 모자챙 아래·볼 옆에 와 얼굴·모자를 가리지 않는다.
  const toPhone=sCenter.clone().sub(eyes2).normalize(),Ls=new Vector3().crossVectors(UP,toPhone).normalize();
  const vPos=eyes2.clone().addScaledVector(Ls,SF.vSide).addScaledVector(toPhone,SF.vFront).addScaledVector(UP,-SF.vDrop);
  const V={position:vPos,quaternion:handBasis(UP.clone().addScaledVector(Ls,.25).normalize(),sCenter.clone().sub(vPos).normalize(),-1)};
  const gl=GRIPS.phone.left,onPhone=handFromProp(pose.position,pose.quaternion,gl),left=blendPose(onPhone,V,sw);
  return {prop:gadgetProps.phone,pose,grip:gr,hands:[{...left,grip:gl,selfie:sw,V,bend:dir(-.4,-.9,.1).lerp(dir(-.55,-.8,.15),sw).normalize(),weight:G.carry,curl:V_CURL.map(c=>MathUtils.lerp(gl.curl,c,sw)),onProp:sw<1},
   {...handFromProp(pose.position,pose.quaternion,gr),bend:dir(.4,-.9,.1).lerp(dir(.7,-.6,.2),sw).normalize(),weight:G.reach,curl:gr.curl}],busy:[G.carry,G.reach]};
 };
 // 오른손이 소품을 쥔 동안 손 뼈에 붙인다. 놓으면 쌍안경은 가슴으로, 휴대폰은 주머니(숨김)로 돌아간다.
 const holdGadget=(hand,gp)=>{
  const {binoculars,phone}=gadgetProps,held=gp&&gadget.held?gp.prop:null;if(gp)gp.held=!!held;
  if(held){const h=propInHand(gp.grip);attach(held,hand,h.position,h.quaternion,true);}
  // 셀카봉: 집게에서 손바닥(손목 + 5.5cm)까지
  poseSelfieStick(gadgetProps,new Vector3(0,.055,0).applyQuaternion(gp?.grip?.quaternion??new Quaternion()).add(gp?.grip?.position??new Vector3()),held===gadgetProps.phone&&prof.selfieStick?gadget.selfie:0);
  if(held!==binoculars)attach(binoculars,spine2,binoRest.position,binoRest.quaternion,false);
  if(held!==phone){if(phone.parent!==root){root.add(phone);phone.scale.set(1,1,1);}phone.visible=false;}else phone.visible=true;
 };
 let gadgetState=null;
 // 목끈을 고리~목 양옆에 맞추고 상태를 남긴다.
 const gadgetInfo=gp=>{
  if(gadgetProps.binoculars.parent!==arms[1].foot&&!gp)attach(gadgetProps.binoculars,spine2,binoRest.position,binoRest.quaternion,false);
  for(const [k,m]of gadgetProps.straps.entries()){const a=root.worldToLocal(gadgetProps.lugs[k].getWorldPosition(new Vector3())),b=root.worldToLocal(neck.localToWorld(strapNeck[k].clone()));
   m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(UP,b.clone().sub(a).normalize());m.scale.set(1,Math.max(.001,a.distanceTo(b)),1);m.updateMatrixWorld(true);}
  gadgetState={gadget:gadget.gadget,weight:gadget.weight,reach:gadget.reach,carry:gadget.carry,selfie:gadget.selfie,held:!!gp?.held,
   binoculars:gadgetProps.binoculars.parent===arms[1].foot?'hand':'chest',phoneVisible:gadgetProps.phone.visible};
 };
 const finishInteraction=(surfaceHeight,phase,moving)=>{
  const v=interaction.sit,tea=interaction.tea,groundPoint=(x,z,above=0)=>{const p=local(x,0,z);p.y=surfaceHeight(p.x,p.z)+above;return p;};
  const up=new Vector3(0,1,0),forward=dir(0,0,-1),rightAxis=dir(1,0,0);
  // 앉은 면: 엉덩이 아래 여러 점 중 가장 높은 면(계단 모서리·바위 위)에 엉덩이를 얹는다.
  let seatY=-Infinity;for(const x of [-.1,0,.1])for(const z of [-.04,.04,.12]){const p=local(x,0,z);seatY=Math.max(seatY,surfaceHeight(p.x,p.z));}
  if(v>0){
   const hp=hips.getWorldPosition(new Vector3());
   model.position.y+=(seatY+seat.hipAbove-hp.y)*v;model.updateMatrixWorld(true);
   for(const [i,l]of legs.entries()){
    const sign=i===0?-1:1,start=l.foot.getWorldPosition(new Vector3()),end=groundPoint(sign*seat.footX,seat.footZ,ankle);
    // 앉으면 무릎은 위·약간 바깥으로 세운다(서 있을 때는 전방).
    const bend=()=>forward.clone().lerp(dir(sign*.25,1,-.35),v).normalize();
    limb(l,start.lerp(end,v),bend());
    // 발목은 부모 무릎의 회전 대신 바인드의 월드 방향을 유지해 발바닥을 땅에 붙인다.
    const footWorld=rootQ().multiply(l.restWorldQuaternion);
    const orientFoot=()=>setWorldQuaternion(l.foot,footWorld);
    orientFoot();
    if(boots)for(let pass=0;pass<4;pass++){
     boots.skeleton.update();const sm=soleMin(i,soleAll[i],surfaceHeight);if(!Number.isFinite(sm.pen)||Math.abs(sm.pen)<.001)break;
     const t=l.foot.getWorldPosition(new Vector3());t.y+=sm.pen;
     limb(l,t,bend());orientFoot();
    }
    l.wasPlanted=false;l.lock=false;
   }
  }
  // 차 마시기: 컵 위치(월드)를 단계별로 정하고, 손은 그 컵을 쥔 자세로 거꾸로 맞춘다.
  const cupRest=groundPoint(...seat.cupRest),upright=rootQ();
  const rightKnee=legs[1].knee.getWorldPosition(new Vector3());
  // 무릎 위 손: 손목은 무릎 꼭대기 조금 뒤·위, 손가락은 무릎 앞으로 늘어뜨리고 손바닥은 아래로.
  const kneeHand=(i)=>{const sign=i===0?-1:1,k=legs[i].knee.getWorldPosition(new Vector3());return {position:k.add(dir(sign*.01,0,.07).multiplyScalar(.07)).add(new Vector3(0,.075,0)),quaternion:handBasis(dir(sign*.08,-.55,-.83),dir(0,-1,-.25),sign)};};
  let cupPose=null;
  if(v>0&&tea.focus){
   // 상체·고개: 컵을 집을 때 오른쪽으로 기울고, 마실 때 상체 10°·고개 27°를 젖힌다.
   if(tea.step==='reach'&&tea.k<.02||tea.step==='place'&&tea.k<.02||!teaLean)teaLean=reachLean(arms[1],handFromCup(cupRest,upright).position);
   applyLean(teaLean*tea.lean);raiseShoulders(MathUtils.degToRad(GP.shrug)*tea.focus,false);if(GP.protract)turnWorld(clavicle,UP,MathUtils.degToRad(GP.protract)*tea.focus);
   // 팔이 짧은 몸은 컵 든 오른 어깨만 들고 내민다(GP.shrug·protract, 실사는 0)
   for(const b of spine)turnWorld(b,rightAxis,TEA_TORSO_TILT*tea.torso/3);
   for(const [k,b]of [neck,head].entries()){b.quaternion.slerp(neutral[k],tea.focus*.7);b.updateMatrixWorld(true);}
   // 얼굴 방향이 상체 젖힘 + 고개 27°가 되도록 남은 각도만큼 목(35%)·머리(65%)를 돌린다.
   const correction=(TEA_TORSO_TILT*tea.torso+TEA_HEAD_TILT*tea.head-facePitch())*tea.head;
   turnWorld(neck,rightAxis,correction*.35);turnWorld(head,rightAxis,correction*.65);
   const [cx,cy,cz]=seat.cupChest??[.07,.36,-.28],chest=local(cx,0,cz);chest.y=seatY+seat.hipAbove+cy;
   const tilted=upright.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),TEA_CUP_TILT));
   // 입: 머리 뼈 로컬(+Y 위·+Z 앞) 위 1.5cm·앞 10cm(캡처로 맞춤). 컵 앞 가장자리(얼굴 쪽 +Z)가 입술에 닿게 한다.
   const mouth=head.localToWorld(new Vector3(...prof.mouthLocal)),atMouth=mouth.sub(new Vector3(0,.066,.040).applyQuaternion(tilted));
   const onKnee=rightKnee.clone().add(new Vector3(0,.07,0)).add(dir(-.02,0,-.03).multiplyScalar(.03));
   const keys={reach:[cupRest,upright,cupRest,upright],lift:[cupRest,upright,chest,upright],mouth:[chest,upright,atMouth,tilted],drink:[atMouth,tilted,atMouth,tilted],lower:[atMouth,tilted,onKnee,upright],place:[onKnee,upright,cupRest,upright],return:[cupRest,upright,cupRest,upright]}[tea.step];
   cupPose={position:keys[0].clone().lerp(keys[2],tea.k),quaternion:keys[1].clone().slerp(keys[3],tea.k)};
  }else teaLean=0;
  // 쌍안경·휴대폰(차를 마시는 동안은 쓰지 않는다)
  const gp=gadget.weight>0&&!tea.focus?solveGadget():null;
  const contacts=[],armContacts=[];
  const hipLocal=root.worldToLocal(hips.getWorldPosition(new Vector3()));
  for(const [i,arm]of arms.entries()){
   const sign=armSide(arm.side),pole=props.poles[i],step=poleStep(phase,arm.side,inputs.running,prof.poleStep),hand=arm.foot;
   const shoulder=root.worldToLocal(arm.up.getWorldPosition(new Vector3()));
   const opposite=root.worldToLocal(legs[1-i].foot.getWorldPosition(new Vector3()));
   const oppositeFootZ=inputs.armSwing?.[1-i]??(opposite.z-hipLocal.z);
   // 카툰 캐릭터: 링크식 팔 흔들기(걷기는 팔꿈치를 거의 펴고 앞으로 더, 뛰기는 팔꿈치 90°로 크게). 손 축은 아래팔 방향.
   const lp=link?linkArmPose(shoulder,arm.side,{phase,move:gaitBlend.move,run:gaitBlend.run,cfg:prof.arm}):null;
   const wrist=lp?lp.wrist:armWristTarget(shoulder,arm.side,{moving,oppositeFootZ,hipZ:0,running:inputs.running});
   // 서 있을 때 손가락 축은 아래쪽(스틱을 쥔 손).
   const handAxis=lp?root.localToWorld(lp.handAxis.clone()).sub(root.position).normalize():local(0,-1,-.12).sub(root.position).normalize();
   let grip=root.localToWorld(wrist).addScaledVector(handAxis,.085),tip=groundPoint(sign*(prof.poleStep?.side??.40),-step.forward,step.lift);
   // 서 있을 때는 스틱을 몸 가까이 발 옆 앞쪽에 모아 짚는다(걷기 위상 자리에서 서기 가중치만큼 옮김).
   if(stance>0){const st=standingPoleTip(sign,prof.stance),w=stance*stance*(3-2*stance);tip.lerp(groundPoint(st.x,st.z),w);}
   const planted=!moving||step.planted;
   if(planted){if(!moving||!pole.planted||pole.anchor.distanceTo(tip)>1.5)pole.anchor.copy(tip);tip.copy(pole.anchor);tip.y=surfaceHeight(tip.x,tip.z);}else pole.anchor.copy(tip);
   pole.planted=planted&&v<.01;
   // 손 뼈 목표(위치·회전): 서기는 스틱 그립, 앉기는 무릎 위, 차 마시기 오른손은 컵을 쥔 자세.
   const standQ=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),handAxis);
   let target=grip.clone().addScaledVector(handAxis,-.085),targetQ=standQ;
   if(v>0){
    let seated=kneeHand(i);
    if(i===1&&cupPose){const held=handFromCup(cupPose.position,cupPose.quaternion);
     seated=tea.held?held:{position:seated.position.lerp(held.position,tea.reach),quaternion:seated.quaternion.slerp(held.quaternion,tea.reach)};}
    target.lerp(seated.position,v);targetQ=standQ.clone().slerp(seated.quaternion,v);
   }
   // 팔꿈치: 서기는 뒤·아래, 앉기는 바깥·뒤, 컵을 든 오른팔은 아래·바깥으로 굽힌다.
   const seatedElbow=dir(sign*.75,-.45,.5).lerp(dir(sign*.5,-.85,-.1),i===1&&tea.held?1:0).normalize();
   const bend=(lp?root.localToWorld(lp.bend.clone()):local(sign*.12,-.35,.9)).sub(root.position).normalize().lerp(seatedElbow,v).normalize();
   // 쌍안경·휴대폰을 쥔 손: 소품 자세에서 거꾸로 구한 손 자세로 옮긴다.
   const gh=gp?.hands[i];if(gh?.weight>0){target.lerp(gh.position,gh.weight);targetQ=targetQ.clone().slerp(gh.quaternion,gh.weight);bend.lerp(gh.bend,gh.weight).normalize();}
   limb(arm,target,bend);
   setWorldQuaternion(hand,targetQ);
   const holding=i===1&&v>0&&tea.held;
   for(const b of arm.fingers)b.rotation.x=MathUtils.lerp(-1.25,holding?-1.05:-.2,v);
   if(gh?.weight>0)arm.fingers.forEach((b,j)=>{b.rotation.x=MathUtils.lerp(b.rotation.x,Array.isArray(gh.curl)?gh.curl[j]:gh.curl,gh.weight);});
   if(gh?.selfie>0&&gh.weight>0)poseVFingers(arm,gh.selfie*gh.weight);
   if(i===1){holdCup(hand,holding);holdGadget(hand,gp);}
   const palm=hand.localToWorld(new Vector3(0,.085,0));
   // 앉으면 두 스틱을 왼쪽 뒤에 세워 배낭 옆면에 기대 둔다. 그립~끝 1.10m를 그대로 지킨다.
   // 쌍안경·휴대폰을 쥔 손은 스틱을 놓는다: 선 채로도 같은 자리(왼쪽 뒤)에 세워 배낭에 기대 둔다(위끝 높이 땅+1.0m).
   const stow=Math.max(v,gp?.busy[i]??0);if(stow>v)pole.planted=false;
   const lean=seat.poles[i],leanTip=groundPoint(...lean.tip),leanTop=local(lean.lean[0],0,lean.lean[2]);leanTop.y=MathUtils.lerp(surfaceHeight(root.position.x,root.position.z)+poleLength*.91,seatY+lean.lean[1],v);
   const leanGrip=leanTip.clone().addScaledVector(leanTop.sub(leanTip).normalize(),poleLength);
   const actualGrip=palm.clone().lerp(leanGrip,stow),actualTip=tip.clone().lerp(leanTip,stow);
   setWorld(pole.group,actualGrip);pole.group.quaternion.copy(poleRotation(root.getWorldQuaternion(new Quaternion()),actualGrip,actualTip));
   // 길이 보정: 팔 도달 한계/계단에서도 팁은 노면에 정확히 닿는다.
   pole.group.scale.y=actualGrip.distanceTo(actualTip)/1.10;pole.group.updateMatrixWorld(true);
   const measuredTip=pole.tip.getWorldPosition(new Vector3()),measuredGrip=pole.grip.getWorldPosition(new Vector3());
   armContacts.push({side:arm.side,shoulder:shoulder.toArray(),elbow:root.worldToLocal(arm.knee.getWorldPosition(new Vector3())).toArray(),wrist:root.worldToLocal(hand.getWorldPosition(new Vector3())).toArray(),targetError:hand.getWorldPosition(new Vector3()).distanceTo(target)});
   contacts.push({side:arm.side,planted:pole.planted,tip:measuredTip.toArray(),error:pole.planted?Math.abs(measuredTip.y-surfaceHeight(measuredTip.x,measuredTip.z)):0,gripError:stow<.01?measuredGrip.distanceTo(palm):0});
  }
  // 왼손은 오른손에 붙은 실제 소품 자리를 다시 따라간다(오른팔이 다 닿지 못해도 두 손이 같은 소품을 쥔다).
  if(gp){const L=gp.hands[0],arm=arms[0];
   if(gp.held&&L.onProp&&L.weight>0){const pp=gp.prop.getWorldPosition(new Vector3()),pq=gp.prop.getWorldQuaternion(new Quaternion());let t=handFromProp(pp,pq,L.grip);if(L.V)t=blendPose(t,L.V,L.selfie);
    const w=L.weight,tp=arm.foot.getWorldPosition(new Vector3()).lerp(t.position,w),tq=arm.foot.getWorldQuaternion(new Quaternion()).slerp(t.quaternion,w);limb(arm,tp,L.bend);setWorldQuaternion(arm.foot,tq);}
   gadgetInfo(gp);}else gadgetInfo(null);
  props.flask.visible=props.cup.visible=v>.01;
  setWorld(props.flask,groundPoint(...seat.flask));
  if(props.cup.parent===root)setWorld(props.cup,cupRest);
  props.cup.updateMatrixWorld(true);
  // 손~컵 거리: 컵을 쥔 손 자리(손 뼈 기준 컵 원점)와 실제 컵 원점의 차이.
  const handCup=arms[1].foot.localToWorld(cupLocal.clone().divide(arms[1].foot.getWorldScale(new Vector3()))).distanceTo(props.cup.getWorldPosition(new Vector3()));
  api.interaction={...interaction,gadget:gadgetState,teaLean,poles:contacts,arms:armContacts,cup:{held:props.cup.parent===arms[1].foot,handDistance:handCup,position:props.cup.getWorldPosition(new Vector3()).toArray(),rest:cupRest.toArray()},seatY,facePitch:facePitch(),viewPitch:TEA_HEAD_TILT*tea.head*.55*v};
 };
 const api={step:.7,props,profile:prof,strideScale:prof.strideScale,
  setPose(pose){return poseController.setPose(pose);},
  get eyeHeight(){return interaction.eyeHeight;},
  // 1인칭 시야를 차 마시는 고개 각도를 따라 위로 기울이는 양(라디안).
  get viewPitch(){return api.interaction?.viewPitch??0;},
  // 휴대폰 렌즈의 월드 자세 {position,quaternion,direction,lens,visible}. 셀카는 화면 위 전면 카메라, 아니면 뒷면 카메라.
  // 셀카 카메라를 이 위치·방향에 두면 화면 속 팔과 휴대폰이 맞는다. ground() 뒤(손 자세가 정해진 뒤)에 부른다.
  phoneCamera(selfie=gadget.selfie>.5,out){return phoneLensPose(gadgetProps,selfie,out);},
  gadgetProps,
  // 얼굴 정면 방향(월드). 불러온 자세의 얼굴 정면을 기준으로 머리 뼈 회전을 따른다.
  faceDirection(){return faceDir();},
  // 몸 전체를 이동 방향으로 회전. 큰 회전 중에는 예전 방향의 접지 앵커를 풀어 다리 꼬임을 막는다.
  turnTo(heading,dt){
   const next=followHeading(root.rotation.y,heading,dt);
   if(Math.abs(headingDelta(root.rotation.y,next))>.025){
    for(const l of legs){l.wasPlanted=false;l.lock=false;l.rel?.set(0,0,0);}
    for(const p of props.poles)p.planted=false;
   }
   root.rotation.y=next;
  },
  snapTo(heading){root.rotation.y=heading;},
ankle,toeH,scene:root,animations:gltf.animations,actions,model,mixer,legs,pack,
  update({clip='Idle',distance=0,stride=.7,stepLength=.7,idleSeconds=0,slope=0,pose,teaProgress,running=false,speed=0,dt:frameDt,stepPhase,gadget:gadgetName='none',selfie=false,lookYaw=0,lookPitch=0,stairs=false,surfaceHeight=null}){
   // 걷기·뛰기 클립을 섞는 몸(카툰 동동이)은 걸음 길이도 섞는 비율과 같은 빠르기로 옮긴다. 바로 바꾸면 섞는 0.2초 동안 발이 닿지 못할 만큼 앞뒤로 늘어난다.
   // 계단에 오르내릴 때는 클립이 바로 바뀌므로 걸음 길이도 바로 바꾼다.
   {const want=stepLength*(running?prof.runStride:1);api.step=prof.gaitStance&&stepSmooth!==null&&!stairs&&!wasStairs?stepSmooth+(want-stepSmooth)*(1-Math.exp(-THREE_CLAMP(frameDt??1/60)/.12)):want;stepSmooth=api.step;wasStairs=stairs;}
   if(pose!==undefined)poseController.setPose(pose);
   lastDt=THREE_CLAMP(frameDt??1/60);interaction=poseController.update(frameDt??1/60,{teaProgress});inputs={running,speed,phase:stepPhase??distance/stride,lookYaw,lookPitch};
   gadget=gadgetController.update(frameDt??1/60,{gadget:gadgetName,selfie});
   const walkClip=clip!=='Idle';
   // 걷기↔뛰기·서기↔걷기 섞는 비율(0.2초 안팎으로 옮겨 간다). 스테미나가 바닥나 running이 꺼지면 걷기로 돌아온다.
   {const d=THREE_CLAMP(frameDt??1/60);gaitBlend.run+=((running&&walkClip?1:0)-gaitBlend.run)*(1-Math.exp(-d/.12));gaitBlend.move+=((walkClip?1:0)-gaitBlend.move)*(1-Math.exp(-d/.1));api.gait={...gaitBlend};}
   stance=stanceWeight(stance,!walkClip&&interaction.pose==='stand'&&interaction.sitLinear<.001,frameDt??1/60);api.stance=stance;
   // 경사 경계의 작은 변화로 Stairs/Rock이 매 프레임 바뀌지 않게 한다.
   // 계단 전용 걸음이 있는 몸(카툰 동동이, prof.stairHop)은 계단 위에서 기울기와 상관없이 계단 클립(한 칸에 한 발씩 통통)을 쓴다.
   const name=!walkClip?'Idle':prof.stairHop&&stairs?'Climb':clip==='Climb'?(slope>(current==='Scramble'?.41:.47)?'Scramble':'Climb'):
    ((current==='Climb'||current==='Scramble')&&slope>.12?'Climb':'Walk');
   // 계단을 통통 오르는 몸: 걸음 위상을 디딤판에 맞춰(stairShift) 발이 디딤판 가운데에 내리게 한다. 계단을 벗어나면 짝수 걸음으로 되돌린다.
   const rawPhase=stepPhase??distance/stride;if(prof.stairHop)stairLock(rawPhase,stairs&&name==='Climb'&&walkClip,surfaceHeight);
   const phase=rawPhase+stairShift;inputs.phase=phase;
   // 맞춘 위상 한 걸음 동안 몸이 실제로 간 수평 거리(디딤판 길이). 계단에서는 클립 발 움직임을 이 길이로 늘이거나 줄인다.
   if(prof.stairHop){const dp=phase-(stairPrev.phase??phase),dx=root.position.x-(stairPrev.x??root.position.x),dz=root.position.z-(stairPrev.z??root.position.z);
    if(Math.abs(dp)>1e-4){const r=MathUtils.clamp(Math.hypot(dx,dz)/Math.abs(dp),.12,.6);stairStep=stairStep===null?r:stairStep+(r-stairStep)*(1-Math.exp(-lastDt/.05));}
    Object.assign(stairPrev,{phase,x:root.position.x,z:root.position.z});api.stair={shift:stairShift,step:stairStep,scale:stairScale()};}
   const elapsed=lastIdle===undefined?0:Math.abs(idleSeconds-lastIdle);
   const travelled=lastDistance===undefined?0:Math.abs(distance-lastDistance);
   const dt=Math.min(.1,elapsed||travelled/1.2);
   lastIdle=idleSeconds;lastDistance=distance;
   if(!current){weights[name]=1;current=name;}
   const blend=1-Math.exp(-dt/ .12);
   // 섞이는 걸음 클립들의 공통 디딤 비율(가중 평균). 한 클립만 재생하면 그 클립의 디딤 비율 그대로다.
   let commonStance=0;{const gs=prof.gaitStance;if(gs){let ws=0;for(const [key,k] of [['Walk','walk'],['Run','run'],['Climb','climb']]){const goal=actions.Run&&name==='Walk'?(key==='Walk'?1-gaitBlend.run:key==='Run'?gaitBlend.run:0):key===name?1:0,w=(weights[key]??0)+(goal-(weights[key]??0))*blend;if(w>0&&gs[k]){ws+=w;commonStance+=w*gs[k];}}commonStance=ws>0?commonStance/ws:gs.walk;}}
   gaitMix.common=commonStance;gaitMix.blending=false;
   for(const [key,a] of Object.entries(actions)){
    // 뛰기 클립이 있으면 걷기 자리를 걷기·뛰기가 gaitBlend.run 비율로 나눠 갖는다.
    const goal=actions.Run&&name==='Walk'?(key==='Walk'?1-gaitBlend.run:key==='Run'?gaitBlend.run:0):key===name?1:0;
    weights[key]=(weights[key]??0)+(goal-(weights[key]??0))*blend;if(key!=='Idle'&&weights[key]>.001&&weights[key]<.999)gaitMix.blending=true;
    a.enabled=true;a.play();a.setEffectiveWeight(weights[key]);
    const d=a.getClip().duration;
    // 블렌딩 중인 모든 이동 클립을 같은 보행 위상으로 샘플링한다.
    const cycle=MathUtils.euclideanModulo(phase/2+WALK_CONTACT_OFFSET,1);
    // 걷기·뛰기의 디딤 비율이 다른 몸(카툰 동동이)은 섞는 동안 두 클립의 디딤 구간을 같은 위상에 맞춘다(디딘 발이 뜨지 않게).
    // 계단 클립(Climb)과 걷기 사이를 섞을 때도 같다: 섞는 비율만큼 디딤 비율을 평균 낸 공통 디딤 구간에 맞춘다.
    const gs=prof.gaitStance,own=gs?.[{Walk:'walk',Run:'run',Climb:'climb'}[key]];
    a.time=key==='Idle'?MathUtils.euclideanModulo(idleSeconds,d):(gs&&own?stanceWarp(cycle,commonStance,own):cycle)*d;
   }
   current=name;
   // 서 있을 때는 둘러보기(Look) 클립을 시간으로, 걸을 때는 걸음 수(위상)로 재생
   torsoBones.forEach((b,i)=>b.quaternion.copy(torsoAnim[i]));
   mixer.update(0);api.pose={clip,walkClip,name,stairs:!!(prof.stairHop&&stairs&&name==='Climb')};torsoBones.forEach((b,i)=>torsoAnim[i].copy(b.quaternion));
   model.updateMatrixWorld(true);
   // 접지 앵커의 일시적인 발 보정 대신 원본 보행의 반대 발 위상을 따른다.
   const hip=root.worldToLocal(hips.getWorldPosition(new Vector3()));
   inputs.armSwing=legs.map(l=>root.worldToLocal(l.foot.getWorldPosition(new Vector3())).z-hip.z);
  },
  ground({s,lateral,moving,phase,floorHeight,sample,surfaceHeight,measure=false}){
   const hop=!!(prof.stairHop&&api.pose?.stairs),climb=api.pose?.name==='Climb'||api.pose?.name==='Scramble',S=prof.animSteps,animStep=S?(climb?S.climb:MathUtils.lerp(S.walk,S.run,gaitBlend.run)):ANIM_STEP,f=moving?(hop?stairScale():api.step/animStep):1;
   root.updateMatrixWorld(true);const baseY=root.position.y,inv=root.matrixWorld.clone().invert(),contacts=[];
   model.position.y=modelY;model.updateMatrixWorld(true);
   if(interaction.sit>.999){finishInteraction(surfaceHeight,inputs.phase??phase??0,false);return [];}
   // 1) 애니메이션 발 위치(루트 기준). 앞뒤 거리만 실제 걸음 길이 비율(f)로 줄이면 딛는 발이 노면에 고정된다.
   const scl=p=>{const loc=p.clone().applyMatrix4(inv);return new Vector3(loc.x,0,loc.z*f).applyMatrix4(root.matrixWorld);};
   const fx=-Math.sin(root.rotation.y),fz=-Math.cos(root.rotation.y),groundAt=(x,z)=>Math.max(...(api.pose?.name==='Scramble'?[0]:[0,.1]).map(o=>surfaceHeight(x+fx*o,z+fz*o)));
   // 서 있을 때는 둘러보기 클립의 넓은 발 간격을 몸 아래로 모은다(발끝 방향은 유지).
   const hipZ=stance>0?root.worldToLocal(hips.getWorldPosition(new Vector3())).z:0;
   const gather=(l,tw,tt)=>{if(!(stance>0))return;const lw=root.worldToLocal(tw.clone()),g=standingFoot(lw.x,lw.z,l.side==='Left'?-1:1,stance,hipZ,prof.stance),d=root.localToWorld(new Vector3(g.x-lw.x,0,g.z-lw.z)).sub(root.position);tw.add(d);tt.add(d);};
   const info=legs.map((l,k)=>{const w=l.foot.getWorldPosition(new Vector3()),tW=l.toe.getWorldPosition(new Vector3()),tw=scl(w),tt=scl(tW);gather(l,tw,tt);if(boots)boots.skeleton.update();const sm=boots?soleMin(k,soleSmp[k]):null,hs=sm?sm.loB:w.y-ankle,ts=sm?sm.loF:tW.y-toeH,sY=Math.min(hs,ts);return {l,rel:sY-baseY,heel:hs-baseY,above:w.y-sY,tw,tt,off:{x:tt.x-tw.x,z:tt.z-tw.z},ground:groundAt(tw.x,tw.z)};});
   const base=moving?plantRel:Math.min(...info.map(o=>o.rel)),lift=i=>Math.max(0,i.rel-base)*(climb?1.5:1);
   // 걷기·뛰기·계단 클립을 섞는 동안(디딤 위상을 맞춘 몸): 두 클립의 다리 회전을 섞으면 디딘 발이 몇 mm 뜰 수 있어, 맞춘 디딤 구간의 발은 땅 높이로 내린다.
   const gs=prof.gaitStance;if(moving&&gs&&gaitMix.blending){
    const c=MathUtils.euclideanModulo((inputs.phase??phase??0)/2+WALK_CONTACT_OFFSET,1),common=gaitMix.common;
    info.forEach((i,k)=>{if((c+k*.5)%1<common&&i.rel>base){i.heel-=i.rel-base;i.rel=base;}});}
   // 딛는 발의 고정점: 뒤꿈치가 닿아 있으면 발목(뒤꿈치), 뒤꿈치가 들리면 발끝(앞꿈치 굴림)
   for(const i of info){i.sw=lift(i);i.planted=i.rel-base<.008;i.pivot=(i.heel-base<.012)?'ankle':'toe';const {l}=i;
    // 닿은 자리에서 발이 10cm 넘게 벗어나면(발끝 떼기 직전·급회전) 끌지 않고 발을 1.2cm 들어 올려 딛기를 끝낸다. 남은 어긋남은 몇 프레임에 걸쳐 풀린다.
    if(l.lock&&i.rel-base>=.012)l.lock=false;
    if(i.planted&&l.wasPlanted&&l.anchor&&!l.lock){const pp=i.pivot==='toe'?i.tt:i.tw,k=l.pivot!==i.pivot?(i.pivot==='toe'?1:-1):0,ex=l.anchor.x+k*i.off.x,ez=l.anchor.z+k*i.off.z;
     if(Math.hypot(pp.x-ex,pp.z-ez)>.10){l.lock=true;l.rel=(l.rel??new Vector3()).set(ex-pp.x,0,ez-pp.z);}}
    if(l.lock&&i.planted){i.planted=false;i.sw=Math.max(i.sw,.012);}
    // 계단을 통통 오르는 몸: 디딘 발을 뗄 때 디딘 자리와 애니메이션 발 자리의 차이(뒤꿈치를 들며 생긴다)를 이어받아 0.06초에 걸쳐 풀어, 발이 한 번에 옮겨 가지 않게 한다.
    if(hop&&!i.planted&&l.wasPlanted&&l.anchor&&!l.lock){const k=l.pivot==='toe'?1:0;l.rel=(l.rel??new Vector3()).set(l.anchor.x-k*i.off.x-i.tw.x,0,l.anchor.z-k*i.off.z-i.tw.z);if(l.rel.lengthSq()>.04)l.rel.set(0,0,0);}
    if(l.rel&&!i.planted){i.rx=l.rel.x;i.rz=l.rel.z;l.rel.multiplyScalar(hop?Math.exp(-lastDt/.06):.5);if(l.rel.lengthSq()<2.5e-5)l.rel.set(0,0,0);}else{i.rx=0;i.rz=0;}}
   // 2) 골반: 양 발 아래 노면 평균 높이만큼 이동
   // 계단을 통통 오르는 몸: 디딘 발의 노면 높이는 애니메이션 발 자리가 아니라 실제로 디딘 자리(앵커)에서 잰다(뒤꿈치를 떼며 발 자리가 다음 칸으로 넘어가도 골반이 튀지 않게).
   // 뜬 발은 앞 10cm 노면 높이를 짧게(0.05초) 따라간다(턱을 넘을 때 한 번에 바뀌지 않고, 내려갈 때는 미리 내린다). 뒤꿈치가 턱에 걸리면 아래 관통 보정이 올린다.
   if(prof.stairHop)for(const i of info){const {l}=i,st=l.anchor,pp=i.pivot==='toe'?i.tt:i.tw;
    if(i.planted&&l.wasPlanted&&st&&Math.hypot(st.x-pp.x,st.z-pp.z)<1){let sx=st.x,sz=st.z;if(l.pivot!==i.pivot){const k=i.pivot==='toe'?1:-1;sx+=k*i.off.x;sz+=k*i.off.z;}
     i.ground=groundAt(sx-(i.pivot==='toe'?i.off.x:0),sz-(i.pivot==='toe'?i.off.z:0));l.airGround=i.ground;}
    else if(moving&&!i.planted&&Number.isFinite(l.airGround)&&Math.abs(i.ground-l.airGround)<.5){const g=surfaceHeight(i.tw.x+(i.rx??0)+fx*.1,i.tw.z+(i.rz??0)+fz*.1);l.airGround+=(g-l.airGround)*(1-Math.exp(-lastDt/.05));i.ground=l.airGround;}
    else l.airGround=i.ground;}
   let dh=MathUtils.clamp(info.reduce((a,i)=>a+(i.ground-baseY),0)/2,-.35,.45);
   // 계단을 통통 오르는 몸: 발이 디딤판 모서리를 넘을 때 골반이 한 번에 튀지 않게 월드 높이를 임계 감쇠 용수철(ω=PELVIS_OMEGA)로 따라가게 한다.
   // 속도까지 이어져 디딤판마다 부드럽게 오르내린다. 닿지 않는 발은 아래 골반 낮추기가 맞춘다.
   if(prof.stairHop){const want=baseY+(moving?MathUtils.clamp(Math.min(...info.map(i=>i.ground-baseY)),-.35,.45):dh); // 걸을 때는 낮은 발 쪽 높이(계단을 내려갈 때 미리 낮춘다)
    if(pelvisY===null||!moving||Math.abs(want-pelvisY)>.5){pelvisY=want;pelvisV=0;}
    else{const w=PELVIS_OMEGA,x=w*lastDt,e=Math.exp(-x),c=pelvisY-want,t=(pelvisV+w*c)*lastDt;pelvisV=(pelvisV-w*t)*e;pelvisY=want+(c+t)*e;}
    dh=pelvisY-baseY;}
   model.position.y=modelY+dh;model.updateMatrixWorld(true);
   // 앵커를 반영한 발목 목표(x,z)
   const target=(i)=>{const {l}=i,st=l.anchor,pp=i.pivot==='toe'?i.tt:i.tw;
    if(i.planted&&l.wasPlanted&&st&&Math.hypot(st.x-pp.x,st.z-pp.z)<1){let sx=st.x,sz=st.z;if(l.pivot!==i.pivot){const k=i.pivot==='toe'?1:-1;sx+=k*i.off.x;sz+=k*i.off.z;}
     return {x:sx-(i.pivot==='toe'?i.off.x:0),z:sz-(i.pivot==='toe'?i.off.z:0),px:sx,pz:sz};}
    return {x:i.tw.x+i.rx,z:i.tw.z+i.rz,px:pp.x,pz:pp.z};};
   // 딛는 발 목표(앵커 포함)가 다리 길이를 넘으면 그만큼 골반을 낮춰 발이 뜨지 않게 한다. 여유(standSlack)만큼 무릎이 굽는다(서 있을 때 몸마다 다름).
   let dropped=0;
   for(const pass of [0,1]){let deficit=0;for(const i of info){const {l}=i,tg=target(i);
     A.setFromMatrixPosition(l.up.matrixWorld);B.setFromMatrixPosition(l.knee.matrixWorld);C.setFromMatrixPosition(l.foot.matrixWorld);
     // 계단을 통통 오르는 몸: 디딘 발이 디딤판 턱에 걸쳐 있으면 낮은 쪽에도 닿을 만큼 골반을 낮춘다(아래 접지 보정이 실제로 닿는 높이로 내린다).
     const gy=hop&&i.planted?Math.min(i.ground,surfaceHeight(tg.x,tg.z)):i.ground;
     deficit=Math.max(deficit,pelvisDrop(A,new Vector3(tg.x,gy+i.above+i.sw,tg.z),A.distanceTo(B)+B.distanceTo(C)-(moving?(prof.moveSlack??.02):prof.standSlack)));}
    if(deficit>0){model.position.y-=Math.min(deficit,.3);model.updateMatrixWorld(true);dropped+=Math.min(deficit,.3);}}
   // 계단을 통통 오르는 몸: 뒤에 남은 뜬 발이 턱을 넘으면 낮춘 양이 한 번에 0이 되어 골반이 튀어 오른다. 낮춘 양은 바로 따르고 줄어들 때만 0.06초에 걸쳐 푼다.
   if(prof.stairHop){hopDrop=moving?Math.max(dropped,hopDrop*Math.exp(-lastDt/.06)):dropped;if(hopDrop>dropped){model.position.y-=hopDrop-dropped;model.updateMatrixWorld(true);}}
   const solve=(l,Tt,footQ)=>{
    A.setFromMatrixPosition(l.up.matrixWorld);B.setFromMatrixPosition(l.knee.matrixWorld);C.setFromMatrixPosition(l.foot.matrixWorld);
    const l1=A.distanceTo(B),l2=B.distanceTo(C);
    const solved=legTargets(A,Tt,l1,l2,new Vector3(fx,0,fz),moving?undefined:Math.min(prof.standSlack,(l1+l2)*.025));
    NB.copy(solved.knee);
    aim(l.up,B.clone().sub(A).normalize(),NB.clone().sub(A).normalize());
    C.setFromMatrixPosition(l.foot.matrixWorld);B.setFromMatrixPosition(l.knee.matrixWorld);
    aim(l.knee,C.clone().sub(B).normalize(),solved.foot.clone().sub(B).normalize());
    l.foot.parent.getWorldQuaternion(q3);l.foot.quaternion.copy(q3.invert().multiply(footQ));l.foot.updateMatrixWorld(true);
   };
   for(const i of info){const {l}=i,swing=i.sw,planted=i.planted;
    // 딛는 동안은 닿은 자리(앵커)에 고정. 경로 꺾임·회전으로 목표가 12cm 넘게 벗어날 때만 끌려간다.
    const dbg={};const st=l.anchor??=new Vector3(),pp=i.pivot==='toe'?i.tt:i.tw;let tx=i.tw.x+i.rx,tz=i.tw.z+i.rz;const anch=planted&&l.wasPlanted&&Math.hypot(st.x-pp.x,st.z-pp.z)<1;
    if(anch){
     if(l.pivot!==i.pivot){const k=i.pivot==='toe'?1:-1;st.x+=k*i.off.x;st.z+=k*i.off.z;}
     const dx=pp.x-st.x,dz=pp.z-st.z,dist=Math.hypot(dx,dz);dbg.drift=dist;if(dist>.12){dbg.clamp=1;st.x+=dx*(1-.12/dist);st.z+=dz*(1-.12/dist);}
     tx=st.x-(i.pivot==='toe'?i.off.x:0);tz=st.z-(i.pivot==='toe'?i.off.z:0);i.ground=groundAt(tx,tz);}
    else if(planted)st.set(pp.x,0,pp.z);
    i.landed=planted&&!l.wasPlanted;l.wasPlanted=planted;l.pivot=i.pivot;
    const footQ=l.foot.getWorldQuaternion(new Quaternion());
    T.set(tx,i.ground+i.above+swing,tz);solve(l,T,footQ);
    // 실제 신발 바닥 꼭짓점 기준으로 노면 관통·뜸을 바로잡는다(2회 보정).
    let sm=null;if(boots){const k=l.side==='Left'?0:1,lst=api.pose?.name==='Scramble'?soleAll[k]:soleSmp[k];boots.skeleton.update();sm=soleMin(k,lst,surfaceHeight);
     for(let it=0;it<4&&isFinite(sm.pen);it++){const dy=swing<.03&&!(hop&&!planted)?sm.pen:Math.max(0,sm.pen);if(Math.abs(dy)<.001)break;T.y+=dy;solve(l,T,footQ);boots.skeleton.update();sm=soleMin(k,lst,surfaceHeight);}}
    const fw=l.foot.getWorldPosition(new Vector3()),tw=l.toe.getWorldPosition(new Vector3());
    dbg.miss=Math.hypot(fw.x-tx,fw.z-tz);dbg.pivChg=i.pivot!==l.pivotPrev?1:0;l.pivotPrev=i.pivot;dbg.ty=T.y-(i.ground+i.above+swing);
    const sole=sm?sm.lo:Math.min(fw.y-ankle,tw.y-toeH),support=sm&&isFinite(sm.pen)?sm.lo+sm.pen:Math.max(...[-.1,0,.12,.2].map(o=>surfaceHeight(fw.x+Math.sin(root.rotation.y)*-o,fw.z+Math.cos(root.rotation.y)*-o)));
    contacts.push({dbg,landed:!!i.landed,side:l.side==='Left'?'왼발':'오른발',support,bottom:sole,lift:swing,planted:swing<.02,error:swing<.012?Math.abs(sole-support):Math.max(0,support-sole),foot:[fw.x,fw.z],toe:[tw.x,tw.z],heelOn:i.heel-base<.012,toeOn:true,anchored:planted,truePen:measure&&boots?Math.max(0,soleMin(l.side==='Left'?0:1,soleAll[l.side==='Left'?0:1],surfaceHeight).pen):undefined,trueFloat:measure&&boots?-soleMin(l.side==='Left'?0:1,soleAll[l.side==='Left'?0:1],surfaceHeight).pen:undefined,penetration:Math.max(0,support-sole)});
   }
   finishInteraction(surfaceHeight,inputs.phase??phase??0,moving);
   return contacts;
  }};
 return api;
}
