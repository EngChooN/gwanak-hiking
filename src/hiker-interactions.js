import {Group,Mesh,CylinderGeometry,MeshStandardMaterial,Vector3,Quaternion,Matrix4,MathUtils} from 'three';
export const SIT_SECONDS=.8, TEA_SECONDS=3, STANDING_EYE_HEIGHT=1.6, SEATED_EYE_HEIGHT=.85;
const smooth=t=>{t=MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
// 서 있을 때 자세(루트 기준, 앞=-z, 왼쪽=-x). 둘러보기 클립의 발목 간격 약 40cm·앞뒤 엇갈림 41cm를
// 발목 간격 약 23cm·엇갈림 약 14cm로 모으고, 스틱은 발 바깥 앞쪽(좌우 27cm·앞 17cm)에 짚는다. 치수는 눈대중 추정.
export const STAND_STANCE=Object.freeze({footHalf:.115,stagger:.35,poleX:.27,poleForward:.17,seconds:.35});
// 서기 가중치: 멈춰 서 있고 앉지 않았을 때 1로, 걷거나 앉으면 0으로 seconds 동안 옮겨 간다.
export function stanceWeight(current,standing,dt){
 dt=Number.isFinite(dt)?MathUtils.clamp(dt,0,.1):0;
 return MathUtils.clamp((Number.isFinite(current)?current:0)+(standing?1:-1)*dt/STAND_STANCE.seconds,0,1);
}
// 애니메이션 발 위치(루트 기준 x,z)를 서기 자세로 모은다. sign은 왼쪽 -1, 오른쪽 1.
export function standingFoot(x,z,sign,weight,hipZ=0){
 const w=smooth(weight);
 return {x:MathUtils.lerp(x,sign*STAND_STANCE.footHalf,w),z:MathUtils.lerp(z,hipZ+(z-hipZ)*STAND_STANCE.stagger,w)};
}
// 서 있을 때 스틱 끝(루트 기준 x,z).
export function standingPoleTip(sign){return {x:sign*STAND_STANCE.poleX,z:-STAND_STANCE.poleForward};}
// phase는 한 걸음마다 1 증가한다. 왼손은 오른발(홀수 걸음)과 접지한다.
export function poleStep(phase,side,running=false){
 const cycle=MathUtils.euclideanModulo((phase-(side==='Left'?1:0))/2,1);
 const planted=cycle<.56, t=planted?cycle/.56:(cycle-.56)/.44;
 return {cycle,planted,forward:(planted? .28-.56*t:-.28+.56*smooth(t))*(running?1.35:1),lift:planted?0:Math.sin(Math.PI*t)*.18};
}
export function createPoseController(){
 let target='stand',sit=0,teaTime=0;
 return {
  setPose(pose){if(!['stand','sit','tea'].includes(pose))return false;if(pose==='tea'&&(target==='stand'||sit<.999))return false;if(pose!==target&&pose==='tea')teaTime=0;target=pose;return true;},
  update(dt,{teaProgress}={}){dt=Number.isFinite(dt)?MathUtils.clamp(dt,0,.1):0;sit=MathUtils.clamp(sit+(target==='stand'?-1:1)*dt/SIT_SECONDS,0,1);
   if(target==='tea'){teaTime=Number.isFinite(teaProgress)?MathUtils.clamp(teaProgress,0,1)*TEA_SECONDS:Math.min(TEA_SECONDS,teaTime+dt);if(teaTime>=TEA_SECONDS)target='sit';}
   const t=teaTime/TEA_SECONDS,tea=teaPhase(target==='tea'?t:null);
   return {pose:target,sit:smooth(sit),sitLinear:sit,drink:tea.drink,tea,teaProgress:t,eyeHeight:MathUtils.lerp(STANDING_EYE_HEIGHT,SEATED_EYE_HEIGHT,smooth(sit))};
  }
 };
}
// 앉은 자세(루트 기준, 앞=-z, 왼쪽=-x, 단위 m). 엉덩이 뼈는 앉은 면 위 11cm(바지 엉덩이 바닥이 면에 닿는 높이, 앉은 자세의 모델 꼭짓점 측정),
// 발목은 엉덩이 앞 42cm·좌우 17cm에 두어 무릎이 약 46cm 높이로 선다. 손은 무릎 위, 스틱은 왼쪽에 기대 둔다.
export const SEAT=Object.freeze({hipAbove:.11,footX:.17,footZ:-.42,
 cupRest:[.32,-.06],flask:[.40,-.20],
 // 스틱: 끝은 왼쪽 뒤 땅, 위는 배낭 왼쪽 옆면에 기댄다. 두 자루를 조금 벌려 세운다.
 poles:[{tip:[-.47,.36],lean:[-.25,.50,.24]},{tip:[-.53,.26],lean:[-.28,.50,.18]}]});
// 차 마시기 3초 순서(진행률 0~1). reach: 무릎→컵 손 이동, held: 컵을 손에 든 구간, cup: 컵 위치 구간과 그 안 진행률,
// head/torso: 고개·상체 젖힘 가중치, lean: 땅의 컵을 잡으려 몸을 기울이는 가중치.
export const TEA_STEPS=Object.freeze([
 {id:'reach',end:.15},{id:'lift',end:.32},{id:'mouth',end:.47},{id:'drink',end:.66},{id:'lower',end:.78},{id:'place',end:.90},{id:'return',end:1}]);
export const TEA_HEAD_TILT=MathUtils.degToRad(27),TEA_TORSO_TILT=MathUtils.degToRad(10),TEA_CUP_TILT=MathUtils.degToRad(40);
export function teaPhase(t){
 if(t===null||!Number.isFinite(t))return {step:null,k:0,held:false,reach:0,drink:0,head:0,torso:0,lean:0,focus:0};
 t=MathUtils.clamp(t,0,1);let start=0,i=0;while(i<TEA_STEPS.length-1&&t>=TEA_STEPS[i].end){start=TEA_STEPS[i].end;i++;}
 const step=TEA_STEPS[i].id,k=MathUtils.clamp((t-start)/(TEA_STEPS[i].end-start),0,1),e=smooth(k);
 const at={reach:[0,0],lift:[1,1],mouth:[1,1],drink:[1,1],lower:[1,1],place:[1,1],return:[1,0]}[step];
 // 고개·상체: 입으로 가져가며 젖히고, 입에서 떼며 돌아온다.
 const head=step==='mouth'?e:step==='drink'?1:step==='lower'?1-e:0;
 // 땅 높이 컵을 집거나 내려놓을 때만 몸을 오른쪽으로 기울인다.
 const lean=step==='reach'?e:step==='lift'?1-e:step==='place'?e:step==='return'?1-e:0;
 return {step,k:e,held:step!=='reach'&&step!=='return'||(step==='reach'&&k>=1),reach:step==='reach'?e:step==='return'?1-e:1,drink:head,head,torso:head,lean,focus:1};
}
// 컵을 쥔 손 기준 컵 위치(m): 손 로컬 +Y는 손가락, 오른손 손바닥은 -X, 엄지는 +Z(모델 측정).
// 컵 바닥 원점이 손바닥 안쪽 5.6cm·손목에서 손가락 쪽 7cm·손 아래 5.6cm(컵 위쪽을 쥠)에 오도록 둔다.
export const CUP_IN_HAND=Object.freeze({position:Object.freeze([-.056,.07,-.056]),quaternion:new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(0,0,1))});
// 컵 자세(월드)에서 오른손 자세를 거꾸로 구한다. 손이 이 자세에 있으면 컵은 손에 붙은 위치와 정확히 같다.
export function handFromCup(cupPosition,cupQuaternion){
 const q=cupQuaternion.clone().multiply(CUP_IN_HAND.quaternion.clone().invert());
 return {position:cupPosition.clone().sub(new Vector3(...CUP_IN_HAND.position).applyQuaternion(q)),quaternion:q};
}
// 손가락 방향(fingers)과 손바닥이 향할 쪽(palm)으로 손 뼈의 월드 회전을 만든다. sign: 왼손 -1, 오른손 1.
// 오른손 로컬 X=-손바닥, 왼손은 거울 대칭이라 X=+손바닥. Z(엄지)=X×Y.
export function handBasis(fingers,palm,sign){
 const y=fingers.clone().normalize(),n=palm.clone().addScaledVector(y,-palm.dot(y)).normalize(),x=n.multiplyScalar(-sign),z=new Vector3().crossVectors(x,y);
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
}
// 자체 제작 회전체. 텍스처·외부 모델 없음. 단위 m, 로컬 +Y가 위.
export function createHikingProps(){
 const dark=new MeshStandardMaterial({color:0x242a2b,roughness:.85}),metal=new MeshStandardMaterial({color:0x879c9e,metalness:.65,roughness:.3}),red=new MeshStandardMaterial({color:0xb34d27,roughness:.65});
 const cylinder=(parent,r1,r2,h,y,mat)=>{const m=new Mesh(new CylinderGeometry(r1,r2,h,10),mat);m.position.y=y;m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 const poles=['Left','Right'].map(side=>{const group=new Group();group.name=`HikingPole.${side}`;
  cylinder(group,.009,.006,1.02,-.51,metal);cylinder(group,.019,.017,.13,.005,dark);cylinder(group,.024,.024,.024,-.93,red);cylinder(group,.005,.003,.08,-1.06,dark);
  const grip=new Group(),tip=new Group();grip.name=`${group.name}.Grip`;tip.name=`${group.name}.Tip`;tip.position.y=-1.10;group.add(grip,tip);return {side,group,grip,tip,anchor:new Vector3(),planted:false};});
 const cup=new Group();cup.name='Tea.Cup';cylinder(cup,.044,.037,.065,.0325,metal);cylinder(cup,.035,.035,.003,.066,new MeshStandardMaterial({color:0x704a23,roughness:.25}));
 const flask=new Group();flask.name='Tea.Flask';cylinder(flask,.046,.046,.23,.125,red);cylinder(flask,.037,.037,.035,.258,metal);cylinder(flask,.039,.039,.018,.284,dark);
 return {poles,cup,flask};
}
