// 즐길거리 자리 풀기(산스장·벤치·먼지털이기)와 동물 출현 구역. 자료는 interaction-data.js의 TRAIL_PROPS·ANIMAL_ZONES.
// 모두 길 밖(노면 가장자리 바깥)에 두고, 둘레 지면 높이 차가 가장 작은 자리를 고른다. 높이는 화면 지형(surfaceHeight)과 같은 값.
// 결과의 clearRadius는 나무·풀을 비우는 반경(load-landscape natureClearSites), collisionRadius는 걷기 막기 반경이다.
import {routeMeasure} from '../assets/realistic/interaction-sites.js';
import {waterClearance} from '../assets/realistic/water-clearance.js';
import {TRAIL_PROPS,ANIMAL_ZONES} from './interaction-data.js';

// 종류별 바닥: ring = 높이를 재는 둘레 점(소품 공간 x,z), clear = 노면 가장자리에서 소품 가운데까지 최소 거리, vegetation = 나무·풀 비우기 반경
export const TRAIL_FOOTPRINT=Object.freeze({
 gym:{ring:[...Array(12)].map((_,i)=>[Math.cos(i/12*Math.PI*2)*3.2,-.3+Math.sin(i/12*Math.PI*2)*3.2]).concat([[0,-.3]]),clear:3.75,vegetation:4.6,collision:0},
 bench:{ring:[[-.62,.12],[.62,.12],[-.62,-.22],[.62,-.22]],clear:.5,vegetation:1.4,collision:.55,footings:true},
 airgun:{ring:[[0,0],[1.15,.05],[1.15,.85],[-.05,.85]],clear:.6,vegetation:1.2,collision:.3},
 cat:{ring:[[0,0]],clear:1.5,vegetation:.5,collision:0},
});
// 계단(돌계단·나무계단) 옆은 측벽 아랫단(가장자리에서 최대 0.6m)·나무계단 난간(0.12m) 바깥에 둔다. 노면 가장자리에서 소품 가운데까지 최소 거리.
export const STAIR_SIDE_CLEAR=1.3;
const STAIRS=new Set(['stairs','deck_stairs']);
const ringAt=(kind,x,z,yaw,height)=>TRAIL_FOOTPRINT[kind].ring.map(([lx,lz])=>height(x+lx*Math.cos(yaw)+lz*Math.sin(yaw),z-lx*Math.sin(yaw)+lz*Math.cos(yaw))).filter(Number.isFinite);
// 일주문 기준 좌표 → 월드(interaction-sites.js localToWorld와 같은 식)
const fromFrame=(f,[lx,lz],ly=0)=>({x:f.x+lx*Math.cos(f.yaw)+lz*Math.sin(f.yaw),z:f.z-lx*Math.sin(f.yaw)+lz*Math.cos(f.yaw),yaw:f.yaw+ly});

// water = water-clearance.js의 물 자리(계곡 물줄기 띠·호수). 소품 바닥(나무·풀 비우기 반경)이 물에 걸치는 자리는 고르지 않는다.
export function resolveTrailSite(spec,{measure,height,frames={},avoid=[],water=null}){
 const foot=TRAIL_FOOTPRINT[spec.kind];
 if(spec.anchor){const f=frames[spec.anchor];if(!f)return null;const {x,z,yaw}=fromFrame(f,spec.local,spec.localYaw??0),ys=ringAt(spec.kind,x,z,yaw,height);
  return {...spec,x,z,yaw,y:Math.min(...ys),slope:Math.max(...ys)-Math.min(...ys),routeMetres:null,clearRadius:foot.vegetation,collisionRadius:foot.collision};}
 // 길 옆 후보: m 둘레(또는 search 범위)·여러 거리에서, 소품 앞(+Z)이 길을 보게 놓는다.
 const ms=spec.search?[...Array(Math.floor((spec.search.to-spec.search.from)/spec.search.step)+1)].map((_,i)=>spec.search.from+i*spec.search.step):[0,4,-4,8,-8,12,-12,16,-16].map(d=>spec.m+d);
 const clash=(x,z,r)=>avoid.some(a=>Math.hypot(x-a.x,z-a.z)<(a.clearRadius??a.supportRadius??a.radius??1)+r+.4);
 let best=null;
 for(const side of spec.sides??[spec.side??1])for(const m of ms){const p=measure.at(m);
  for(const off of spec.search?.offsets??[spec.offset??0]){
   const stairs=[m-4,m,m+4].some(q=>STAIRS.has(measure.at(q).material)),clear=stairs?Math.max(foot.clear,STAIR_SIDE_CLEAR):foot.clear;
   const d=Math.max(off,p.width/2+clear),x=p.x-p.tz*d*side,z=p.z+p.tx*d*side,yaw=Math.atan2(p.x-x,p.z-z);
   // 굽은 길에서도 다른 구간 노면과 겹치지 않게(가장 가까운 길 가운데선에서 clear 이상, 그 구간이 계단이면 계단 여유)
   const near=measure.nearest(x,z),nearClear=STAIRS.has(measure.at(near.m).material)?Math.max(foot.clear,STAIR_SIDE_CLEAR):foot.clear;if(near.d<measure.at(near.m).width/2+Math.max(clear,nearClear)-.05)continue;
   if(water?.blocked(x,z,foot.vegetation))continue;
   if(clash(x,z,foot.vegetation*.5))continue;
   const ys=ringAt(spec.kind,x,z,yaw,height);if(!ys.length)continue;const slope=Math.max(...ys)-Math.min(...ys);
   // 평평함 우선, 같은 정도면 자료 거리(m)에 가까운 자리
   const score=slope+Math.abs(m-(spec.m??m))*.004;
   if(!best||score<best.score)best={score,x,z,yaw,slope,m,ys,side};}}
 if(!best)return null;
 // 높이: 가운데·둘레 높이의 낮은 쪽 1/3(경사 위쪽 다리는 땅에 조금 묻히고, 아래쪽은 뜨지 않게)
 // 벤치·먼지털이기는 가장 높은 다리에 맞추고 낮은 쪽 다리 밑은 받침돌(footings)로 채운다(다리가 묻히지 않게).
 const sorted=[...best.ys].sort((a,b)=>a-b),y=foot.footings?sorted.at(-1)-.02:sorted[Math.floor((sorted.length-1)/3)];
 return {...spec,side:best.side,x:best.x,z:best.z,yaw:best.yaw,y,slope:best.slope,routeMetres:best.m,clearRadius:foot.vegetation,collisionRadius:foot.collision};
}
export function resolveTrailSites(route,height,{frames={},avoid=[]}={}){
 const measure=routeMeasure(route),water=waterClearance(route),sites=[];
 for(const spec of TRAIL_PROPS){const s=resolveTrailSite(spec,{measure,height,frames,avoid:[...avoid,...sites],water});if(s)sites.push(s);}
 // 동물 구역: 길 구역은 m 범위 그대로, 일주문 기준 구역은 그 기준 좌표(frame)를 붙인다. 자리·움직임은 src/animal-zones.js
 const zones=ANIMAL_ZONES.map(z=>z.anchor?(frames[z.anchor]?{...z,frame:{x:frames[z.anchor].x,z:frames[z.anchor].z,yaw:frames[z.anchor].yaw}}:null):{...z,to:Math.min(z.to,measure.length)}).filter(Boolean);
 return {sites,zones,clearSites:sites.map(s=>({id:s.id,x:s.x,z:s.z,supportRadius:s.clearRadius}))};
}
