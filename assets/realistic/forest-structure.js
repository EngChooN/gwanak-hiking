import {indexRoute} from './geo.js';

// 로컬 GLB 실측: assets/pine-impostor-atlas-v1.json의 LOD0 경계.
// 목표 높이·비율은 시각 설계값이며 현장 수관고가 아니다.
const models={tree_small_02:[8.97477,4.98],island_tree_01:[9.94073,6.72],pine_tree_01:[11.93123,3.27],pine_sapling_medium:[4.92499,1.51]};
const noise=(x,z,salt)=>{const n=Math.sin(x*12.9898+z*78.233+salt)*43758.5453;return n-Math.floor(n);};
export function structureForestEntries(entries,route){
 const nearest=indexRoute(route);
 return entries.map(entry=>{
  const model=models[entry.id];
  if(entry.kind!=='tree'||!model||entry.nearDetail)return entry;
  return {...entry,placements:entry.placements.map(p=>{
   const hit=nearest(p.x,p.z),clearance=Math.max(.2,hit.distance-hit.width/2-.6);
   const r=noise(p.x,p.z,3),variation=noise(p.x,p.z,11);
   let height=r<.2?4+variation*3:r<.72?8+variation*5:16+variation*6;
   // 정상부와 좁은 길가에서는 큰 수관을 억지로 늘리지 않는다.
   if(hit.y>580)height=Math.min(height,hit.y>605?6:12);
   if(clearance<7)height=Math.min(height,10);
   const scale=height/model[0],width=Math.min(scale*(.82+variation*.16),clearance/model[1]);
   return {...p,scale,stretch:[width,scale,width],visualHeight:height};
  })};
 });
}
