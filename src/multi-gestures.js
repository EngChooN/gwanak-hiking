// 인사·손 흔들기·같이 셀카 자세. 애니메이션 클립을 새로 만들지 않고, hiker.update/ground가 끝난 뒤 뼈 몇 개를 월드 방향으로 덮어쓴다.
// 팔: 위팔·아래팔이 가리킬 월드 방향을 정하고 그쪽으로 돌린다(손목 아래 손은 따라온다). 인사: 허리·머리를 숙인다.
import {Vector3,Quaternion} from 'three';
const UP=new Vector3(0,1,0),tmpA=new Vector3(),tmpB=new Vector3(),tmpQ=new Quaternion(),tmpP=new Quaternion(),tmpN=new Quaternion();
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
// 시작·끝 0.3초에 서서히 들어갔다 나오는 가중치.
export const envelope=(t,total,edge=.3)=>smooth(Math.min(t/edge,(total-t)/edge,1));
export function boneSet(model){
 const b=n=>model.getObjectByName('mixamorig'+n);
 return {armR:b('RightArm'),foreR:b('RightForeArm'),handR:b('RightHand'),spine:b('Spine1'),head:b('Head'),
  armL:b('LeftArm'),foreL:b('LeftForeArm'),handL:b('LeftHand')};
}
// bone이 child 쪽을 dir(월드)로 향하게 weight만큼 돌린다. 호출 순서는 위팔 → 아래팔.
function aimBone(bone,child,dir,weight){
 bone.updateWorldMatrix(true,false);child.updateWorldMatrix(true,false);
 tmpA.setFromMatrixPosition(bone.matrixWorld);tmpB.setFromMatrixPosition(child.matrixWorld).sub(tmpA).normalize();
 tmpQ.setFromUnitVectors(tmpB,dir);bone.getWorldQuaternion(tmpP);tmpN.copy(tmpQ).multiply(tmpP);
 bone.parent.getWorldQuaternion(tmpP);tmpN.premultiply(tmpP.invert());
 bone.quaternion.slerp(tmpN,weight);bone.updateMatrixWorld(true);
}
function rotateWorld(bone,axis,angle){
 bone.updateWorldMatrix(true,false);bone.getWorldQuaternion(tmpP);tmpQ.setFromAxisAngle(axis,angle);tmpN.copy(tmpQ).multiply(tmpP);
 bone.parent.getWorldQuaternion(tmpP);tmpN.premultiply(tmpP.invert());bone.quaternion.copy(tmpN);bone.updateMatrixWorld(true);
}
// heading은 three 회전(앞 = -z). side=1이면 오른팔, -1이면 왼팔(같이 셀카 파트너가 반대 손을 든다).
export function applyGesture(bones,kind,t,heading,{side=1}={}){
 const arm=side>0?bones.armR:bones.armL,fore=side>0?bones.foreR:bones.foreL,hand=side>0?bones.handR:bones.handL;
 if(!arm||!fore||!hand)return false;
 const fwd=new Vector3(-Math.sin(heading),0,-Math.cos(heading)),right=new Vector3(Math.cos(heading),0,-Math.sin(heading)).multiplyScalar(side);
 if(kind==='wave'){
  const w=envelope(t,3),sway=Math.sin(t*Math.PI*2*2.2);
  aimBone(arm,fore,new Vector3().copy(UP).multiplyScalar(.55).addScaledVector(right,.8).addScaledVector(fwd,.15).normalize(),w);
  aimBone(fore,hand,new Vector3().copy(UP).addScaledVector(right,.15+.75*sway).addScaledVector(fwd,.1).normalize(),w);
  return true;
 }
 if(kind==='hello'){
  const T=2.2,w=envelope(t,T,.35),bow=Math.sin(Math.PI*Math.min(1,t/T))**1.5;
  // 가볍게 손을 들고 고개·허리를 숙였다 든다.
  aimBone(arm,fore,new Vector3().copy(UP).multiplyScalar(.35).addScaledVector(right,.75).addScaledVector(fwd,.4).normalize(),w*.9);
  aimBone(fore,hand,new Vector3().copy(UP).addScaledVector(right,.25).addScaledVector(fwd,.25).normalize(),w*.9);
  if(bones.spine)rotateWorld(bones.spine,right.clone().multiplyScalar(side),-.22*bow);
  if(bones.head)rotateWorld(bones.head,right.clone().multiplyScalar(side),-.28*bow);
  return true;
 }
 return false;
}
