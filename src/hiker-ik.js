import {Vector3,Quaternion,MathUtils} from 'three';

// 굽힘 방향은 애니메이션의 무릎 위치 대신 몸의 전방으로 결정한다.
// 월드 전방을 목표 축에 투영해 무릎이 뒤집히는 해를 배제한다.
export function legTargets(hip,target,upper,lower,forward){
 const axis=new Vector3().subVectors(target,hip);
 const length=axis.length();
 if(length<1e-8)axis.set(0,-1,0);else axis.divideScalar(length);
 const margin=Math.min(.02,(upper+lower)*.025);
 const distance=MathUtils.clamp(length,Math.abs(upper-lower)+margin,upper+lower-margin);
 const pole=forward.clone().addScaledVector(axis,-forward.dot(axis));
 if(pole.lengthSq()<1e-8){
  // 축과 전방이 평행해도 결정적인 직교 방향을 사용한다.
  pole.set(0,1,0).addScaledVector(axis,-axis.y);
  if(pole.lengthSq()<1e-8)pole.set(1,0,0).addScaledVector(axis,-axis.x);
 }
 pole.normalize();
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
 return {
  knee:hip.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along))),
  foot:hip.clone().addScaledVector(axis,distance),
 };
}

// 수평 거리를 제외한 수직 도달 범위. 발이 골반보다 위에 있으면
// 골반을 내리는 보정은 거리를 더 벌리므로 적용하지 않는다.
export function pelvisDrop(hip,target,reach){
 const horizontal=Math.hypot(target.x-hip.x,target.z-hip.z);
 if(target.y>=hip.y||horizontal>=reach)return 0;
 return Math.max(0,hip.y-target.y-Math.sqrt(Math.max(0,reach*reach-horizontal*horizontal)));
}

// 소품 목표는 월드 좌표, 소품 회전은 루트의 로컬 좌표다.
export function poleRotation(parentQuaternion,grip,tip){
 const direction=tip.clone().sub(grip).normalize().applyQuaternion(parentQuaternion.clone().invert());
 return new Quaternion().setFromUnitVectors(new Vector3(0,-1,0),direction);
}
