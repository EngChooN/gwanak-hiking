import {Group,Mesh,CylinderGeometry,MeshStandardMaterial,Vector3,MathUtils} from 'three';
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
   const t=teaTime/TEA_SECONDS,drink=target==='tea'?(t<.3?smooth(t/.3):t<.65?1:1-smooth((t-.65)/.35)):0;
   return {pose:target,sit:smooth(sit),sitLinear:sit,drink,teaProgress:t,eyeHeight:MathUtils.lerp(STANDING_EYE_HEIGHT,SEATED_EYE_HEIGHT,smooth(sit))};
  }
 };
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
