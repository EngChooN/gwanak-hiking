import {Vector3,MathUtils} from 'three';
// 모델을 π 돌린 앱 루트 기준: 해부학적 왼쪽은 -X, 오른쪽은 +X.
export const armSide=side=>side==='Left'?-1:1;
export function armWristTarget(shoulder,side,{moving=false,oppositeFootZ=0,hipZ=0,running=false}={}){
 const sign=armSide(side);
 const swing=moving?MathUtils.clamp(oppositeFootZ-hipZ,-.28,.28)*(running?1.1:.85):0;
 return new Vector3(shoulder.x+sign*.065,shoulder.y-(moving?.40:.47),shoulder.z-.025+swing);
}
