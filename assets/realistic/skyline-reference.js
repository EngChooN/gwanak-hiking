import {project,mix} from './geo.js';
const rad=Math.PI/180;
export const wrapDegrees=value=>(value%360+360)%360;
export const angularDifference=(a,b)=>((a-b+540)%360)-180;
// 이번 확정 지시의 반올림된 방위·거리를 배치 기준으로 사용한다.
// 원본 위경도는 참조 메타데이터이며 두 체계를 혼합하지 않는다.
export function placeReference(p,observation){
  if(!Number.isFinite(p.bearing)||!Number.isFinite(p.distance)||p.distance<=0)throw new Error('원경 기준 방위·거리 필요');
  const anchor=project(observation.lat,observation.lon),angle=p.bearing*rad;
  return {...p,x:anchor.x+Math.sin(angle)*p.distance,z:anchor.z-Math.cos(angle)*p.distance,
    fromSummit:{bearing:wrapDegrees(p.bearing),distance:p.distance},placementBasis:'승인된 방위·거리 / 연주대 기준'};
}
export function measureReference(p,observation){
  const anchor=project(observation.lat,observation.lon),dx=p.x-anchor.x,dz=p.z-anchor.z;
  return {bearing:wrapDegrees(Math.atan2(dx,-dz)/rad),distance:Math.hypot(dx,dz)};
}
export function contrastAt(distance,stops){
  if(!Number.isFinite(distance)||distance<0)throw new Error('거리 오류');
  if(distance<=stops[0][0])return stops[0][1];
  for(let i=1;i<stops.length;i++)if(distance<=stops[i][0])return mix(stops[i-1][1],stops[i][1],(distance-stops[i-1][0])/(stops[i][0]-stops[i-1][0]));
  return stops.at(-1)[1];
}
export function directionRows(landmarks,observation,bearing,horizontalFov){
  return landmarks.map(p=>{
    const measured=measureReference(p,observation),offset=angularDifference(measured.bearing,bearing);
    const error=angularDifference(measured.bearing,p.bearing);
    return {id:p.id,name:p.name,expectedBearing:p.bearing,measuredBearing:measured.bearing,bearingError:error,
      expectedDistance:p.distance,measuredDistance:measured.distance,distanceError:measured.distance-p.distance,
      offset,inHorizontalFrame:Math.abs(offset)<=horizontalFov/2,
      placementPass:Math.abs(error)<.01&&Math.abs(measured.distance-p.distance)<.1,
      modeled:p.shape!=='reference',visibility:'지형·건물 가림 미판정'};
  });
}
// Three.js MeshStandardMaterial에 적용. 실제 카메라-프래그먼트 거리 사용.
// fog의 축 방향 깊이를 쓰면 넓은 화각의 화면 가장자리에서 감쇠가 달라진다.
export function applyAtmosphere(material,atmosphere){
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey.bind(material);
  const key=previousKey();
  const stops=atmosphere.contrastStops;
  let body=`float gContrast=1.0;\nfloat gDistance=length(gAtmosphereView);\n`;
  for(let i=1;i<stops.length;i++){
    const [a,ca]=stops[i-1],[b,cb]=stops[i];
    body+=`${i===1?'if':'else if'}(gDistance<=${Number(b).toFixed(1)}) gContrast=mix(${Number(ca).toFixed(6)},${Number(cb).toFixed(6)},clamp((gDistance-${Number(a).toFixed(1)})/${Number(b-a).toFixed(1)},0.0,1.0));\n`;
  }
  body+=`else gContrast=${Number(stops.at(-1)[1]).toFixed(6)};\ngContrast*=exp(-gDistance*fogNear);\ngl_FragColor.rgb=mix(fogColor,gl_FragColor.rgb,gContrast);`;
  material.onBeforeCompile=shader=>{
    previous.call(material,shader);
    // 원경 도시의 MeshBasicMaterial에는 vViewPosition이 없다. 깊이/법선 override와도 독립한다.
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gAtmosphereView;')
      .replace('#include <project_vertex>','#include <project_vertex>\ngAtmosphereView=mvPosition.xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 gAtmosphereView;')
      .replace('#include <fog_fragment>',`#ifdef USE_FOG\n${body}\n#endif`);
  };
  material.customProgramCacheKey=()=>`${key}-skyline-v3-${JSON.stringify(stops)}`;
  return material;
}
