// 풀·덤불·낙엽을 두지 않는 땅: 입구 광장 포장(광장·문 앞 아스팔트·보도·경계석·문 안쪽 길·정자 바닥)과 화단 자리,
// 포장·계단·데크 노면, 구간 시설(전망 데크 등), 물 자리(water-clearance.js: 계곡 물줄기 띠·호수 수면).
// reach는 포기 반경(m)으로, 포기 가장자리가 노면·물에 걸치지 않게 한다.
// 포장 가장자리 바깥(화단·생울타리 둘레)은 비우지 않는다.
import {plazaFootprint,HEDGES} from './entrance-plaza.js';
import {entranceFrame} from './entrance-scenery.js';
import {indexRoute} from './geo.js';

export const HARD_SURFACES=Object.freeze(['paved','stairs','deck','deck_stairs']);
const hard=p=>HARD_SURFACES.includes(p?.material);

export function groundCoverMask(route,{nearest=indexRoute(route),sites=[],water=null}={}){
 const frame=entranceFrame(route),c=Math.cos(frame.yaw),s=Math.sin(frame.yaw);
 // 일주문 좌표(entranceLocal과 같은 변환).
 const local=(x,z)=>{const dx=x-frame.x,dz=z-frame.z;return {x:c*dx-s*dz,z:s*dx+c*dz};};
 function entrance(x,z,reach=0){
  const q=local(x,z);
  return plazaFootprint(q.x,q.z,reach)||HEDGES.some(h=>Math.abs(q.x-h.x)<h.depth/2+reach&&q.z>h.from-reach&&q.z<h.to+reach);
 }
 function blocked(x,z,reach=0){
  if(entrance(x,z,reach))return true;
  const h=nearest(x,z);
  if(Number.isFinite(h.distance)&&(hard(route[h.index])||hard(route[h.index+1]))&&h.distance<h.width/2+reach)return true;
  if(water?.blocked(x,z,reach))return true;
  return sites.some(site=>Math.hypot(x-site.x,z-site.z)<site.supportRadius+reach);
 }
 return {entrance,blocked,local,water};
}
