import {Vector3,MathUtils} from 'three';
// 모델을 π 돌린 앱 루트 기준: 해부학적 왼쪽은 -X, 오른쪽은 +X.
export const armSide=side=>side==='Left'?-1:1;
export function armWristTarget(shoulder,side,{moving=false,oppositeFootZ=0,hipZ=0,running=false}={}){
 const sign=armSide(side);
 const swing=moving?MathUtils.clamp(oppositeFootZ-hipZ,-.28,.28)*(running?1.1:.85):0;
 return new Vector3(shoulder.x+sign*.065,shoulder.y-(moving?.40:.47),shoulder.z-.025+swing);
}
// 카툰(링크) 팔 흔들기. 루트 기준(앞 -Z, 왼쪽 -X) 손목 자리·손가락 축·팔꿈치 방향을 낸다.
// phase는 걸음 수(한 주기 = 2걸음, 0이면 왼발 착지 → 오른팔이 가장 앞). move: 서기 0~걷기 1, run: 걷기 0~뛰기 1.
// 참고(docs/카툰-참고-2차.md §2): 걷기 위팔 앞 20°·뒤 7°, 팔꿈치 거의 폄. 뛰기 앞 30°·뒤 45°, 팔꿈치 약 90°.
export const LINK_ARM=Object.freeze({upper:.26,fore:.235,
 stand:{mid:6,amp:0,elbow:18,elbowAmp:0,out:7,inward:0},
 walk:{mid:6.5,amp:13.5,elbow:12,elbowAmp:6,out:8,inward:0},
 run:{mid:-7.5,amp:37.5,elbow:84,elbowAmp:8,out:11,inward:16}});
// cfg: 몸마다 다른 팔 길이·자세(카툰 동동이는 src/toon/link-hiker.js의 TOON_ARM).
export function linkArmPose(shoulder,side,{phase=0,move=0,run=0,cfg=LINK_ARM,upper=cfg.upper,fore=cfg.fore}={}){
 const sign=armSide(side),c=(side==='Right'?1:-1)*Math.cos(Math.PI*phase),d=MathUtils.degToRad;
 const mix=k=>MathUtils.lerp(cfg.stand[k],MathUtils.lerp(cfg.walk[k],cfg.run[k],run),move);
 const th=d(mix('mid')+mix('amp')*c),el=d(mix('elbow')+mix('elbowAmp')*c),out=d(mix('out')),inward=d(mix('inward'));
 const u=new Vector3(sign*Math.sin(out),-Math.cos(out)*Math.cos(th),-Math.cos(out)*Math.sin(th)).normalize();
 const f=new Vector3(sign*Math.sin(out-inward),-Math.cos(th+el),-Math.sin(th+el)).normalize();
 const wrist=shoulder.clone().addScaledVector(u,upper).addScaledVector(f,fore);
 const handAxis=f.clone().add(new Vector3(0,-.25,-.05)).normalize();
 const bend=new Vector3(sign*.15,-.3,1).normalize();
 return {wrist,handAxis,bend,swing:th,elbow:el};
}
