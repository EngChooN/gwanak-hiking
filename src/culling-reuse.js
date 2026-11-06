import * as THREE from 'three';
// 컬링 재계산 건너뛰기(2026-11-06 최적화 7번): 카메라가 거의 그대로면(0.25m·0.3° 미만, 화질·확대 같음) 지난 컬링 결과를 다시 쓴다.
// - 최대 frames 프레임 연속까지만 쓴다(갑자기 돌아도 가장자리 팝은 약 5프레임 안에 사라진다).
// - 청크·나무가 붙거나 떨어지면 markDirty()로 다음 프레임에 반드시 다시 잰다.
export const CULL_REUSE={distance:.25,angle:.3*Math.PI/180,frames:4};

export function createCullingReuse(options=CULL_REUSE){
 const last={position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),zoom:0,quality:-1,age:0,valid:false};
 let dirty=true;
 const status={runs:0,skipped:0,reused:false};
 // 이번 프레임에 지난 결과를 다시 써도 되면 true(나이를 센다). false면 지금 카메라를 기준으로 기억한다 — 호출한 쪽이 다시 잰다.
 function check(camera,quality){
  const zoom=camera.zoom??1;
  const reuse=!dirty&&last.valid&&last.quality===quality&&last.zoom===zoom&&last.age<options.frames
   &&last.position.distanceToSquared(camera.position)<options.distance**2&&last.quaternion.angleTo(camera.quaternion)<options.angle;
  if(reuse){last.age++;status.skipped++;}
  else {last.position.copy(camera.position);last.quaternion.copy(camera.quaternion);last.zoom=zoom;last.quality=quality;last.age=0;last.valid=true;dirty=false;status.runs++;}
  status.reused=reuse;return reuse;
 }
 return {check,markDirty(){dirty=true;},status};
}
