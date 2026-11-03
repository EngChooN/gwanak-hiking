import {FOREST_ZONES,broadleafRatio} from './forest-zones.js';
// 추정(후기 근거, 현장 확인 전). X 동쪽 / Z 남쪽, 단위 m.
export const SUMMIT_CONFIG = [
 {id:'radar',anchor:'summit',offset:[-18,52],supportRadius:6,dimensions:'받침 9×7×6m, 흰 돔 지름 10m',yaw:0},
 {id:'eungjinjeon',anchor:'summit',offset:[-24,-4],supportRadius:5,dimensions:'석축 7×6×5m, 기와집 6×5×3.5m, 연등 9개',yaw:.25},
 // 정상석: 길 끝점(GPX 보정 고도 632m)은 바로 앞 마루(636m)보다 낮아 마루 뒤에 숨는다.
 // 마지막 80m 안의 가장 높은 길 위 점(crest) 북쪽 2.4m에 두고, 앞면(+Z)이 올라오는 길을 보게 한다. 실경 비교 1차 반영, 추정.
 {id:'marker',anchor:'crest',offset:[0,-2.4],supportRadius:1.5,dimensions:'받침돌 2.5×1.4×0.5m, "冠岳山" 자연석 1.6×1.0×2.0m',yaw:'approach'},
 {id:'helipad',anchor:'junction',offset:[14,4],supportRadius:8,dimensions:'원형 공터 지름 16m, H 4×4m',yaw:0},
 {id:'fork',anchor:'junction',offset:[5,-1],supportRadius:.2,dimensions:'지주 2.3m, 표지판 2×0.65m',yaw:-Math.PI/2},
];
export function facilityAnchors(route){
 const end=route.at(-1),near=route.filter((p,i)=>Number.isFinite(p.s)&&Number.isFinite(end.s)?end.s-p.s<=80:i>=route.length-5);
 const crest=near.reduce((best,p)=>p.y>best.y?p:best,near[0]??end);
 // 마루에서 약 12m 앞(내려다보며 올라오는 쪽)의 길 위 점. 정상석 정면 방향을 정한다.
 const ci=route.indexOf(crest),approach=route.slice(0,Math.max(1,ci)).reverse().find(p=>Math.hypot(p.x-crest.x,p.z-crest.z)>=12)??route[Math.max(0,ci-1)];
 return {summit:end,crest,approach,junction:route.reduce((best,p)=>Math.abs((p.originalY??p.y)-581)<Math.abs((best.originalY??best.y)-581)?p:best,route[0])};
}

// 중심 지면 + 8cm에 기초를 놓고 경사는 절토·성토로 연결한다.
// GPX 원고도 581m와 DSM 정렬 고도를 구별한다. 보행 노면은 별도 유지한다.
export function facilitySites(route,height){
 const anchors=facilityAnchors(route);
 const summit=anchors.summit,candidates=[];
 // 300도 시야 안에서 실제 지면을 표본 조사한다. 지면을 정상 고도로 끌어올리지 않는다.
 for(let bearing=278;bearing<=322;bearing+=2)for(let radius=15;radius<=35;radius++){
  const a=bearing*Math.PI/180,x=summit.x+Math.sin(a)*radius,z=summit.z-Math.cos(a)*radius,y=height(x,z);
  if(Number.isFinite(y)&&y>=summit.y-6&&y<=summit.y+2)candidates.push({x,z,y,bearing,radius});
 }
 const marker=SUMMIT_CONFIG.find(s=>s.id==='marker'),markerAnchor=anchors[marker.anchor],clearMarker=p=>Math.hypot(p.x-markerAnchor.x-marker.offset[0],p.z-markerAnchor.z-marker.offset[1])>11;
 let pair=null,best=Infinity;
 for(const radar of candidates.filter(clearMarker))for(const temple of candidates.filter(clearMarker)){
  if(radar.bearing-temple.bearing<24||Math.hypot(radar.x-temple.x,radar.z-temple.z)<15)continue;
  const score=Math.abs(radar.bearing-320)+Math.abs(temple.bearing-280)+Math.abs(radar.radius-25)+Math.abs(temple.radius-25)+2*(Math.abs(radar.y-summit.y)+Math.abs(temple.y-summit.y));
  if(score<best){best=score;pair={radar,eungjinjeon:temple};}
 }
 return SUMMIT_CONFIG.map(spec=>{
  const anchor=anchors[spec.anchor],chosen=spec.id==='radar'?null:pair?.[spec.id],x=chosen?.x??anchor.x+spec.offset[0],z=chosen?.z??anchor.z+spec.offset[1];
  const yaw=spec.yaw==='approach'?(anchors.approach===anchor?0:Math.atan2(anchors.approach.x-x,anchors.approach.z-z)):spec.yaw;
  return {...spec,yaw,offset:[x-anchor.x,z-anchor.z],x,z,y:height(x,z)+.08,anchorElevation:anchor.y,summitPoint:{x:summit.x,z:summit.z},
   ...(['radar','eungjinjeon'].includes(spec.id)?{placementVerified:!!chosen,placementStatus:spec.id==='radar'?'서울 전망 보호를 위한 남측 시안·실측 전':chosen?'지면 후보 선택 완료':'조건 충족 후보 없음·임시 배치'}:{})};
 });
}
export function facilityGround(sites,x,z,base){
 // 기초 내부는 다른 시설의 전이 영역보다 우선한다. 경계의 부동소수점 오차도 흡수한다.
 const distances=sites.map(site=>({site,d:Math.hypot(x-site.x,z-site.z)}));
 const core=distances.filter(({site,d})=>d<=site.supportRadius+1e-9).sort((a,b)=>a.d-b.d)[0];
 if(core)return core.site.y;
 let strongest=0,target=base;
 for(const {site,d} of distances){const t=Math.max(0,Math.min(1,(d-site.supportRadius)/3));
  const weight=1-t*t*(3-2*t);if(weight>strongest){strongest=weight;target=site.y;}
 }
 return strongest===0?base:base+(target-base)*strongest;
}
export const FOREST_CONFIG={
 status:'구간별 추정(임상도 확보 전) · forest-zones.js',broadleafRatio:FOREST_ZONES.targets.mid.broadleaf,
 broadleafIds:['tree_small_02','island_tree_01'],pineIds:['pine_tree_01','pine_sapling_medium'],
 broadleafTint:0xb6c895,pineTint:0xc4ceae,broadleafScale:1.04,
 // 스캔 모델을 신갈나무로 확정 동정하지 않는다. 활엽 우점의 시각 대용이다.
};
const hash=(x,z)=>{const n=Math.sin(x*91.345+z*47.853)*24634.6345;return n-Math.floor(n);};

// 총 개체 수·좌표·64m 청크를 유지하며 기존 스캔 모델로 재배정.
// 활엽 비율은 표고 구간별(숲 75~80%, 능선 25%, 정상부 10%). 표고가 없으면 height(x,z)로 구한다.
// 길가 근경 소나무(nearDetail)는 능선 바위 사이 소나무이므로 재배정하지 않는다.
export function mixForestEntries(entries,height){
 let ordinal=0;
 return entries.flatMap(entry=>{
  if(![...FOREST_CONFIG.broadleafIds,...FOREST_CONFIG.pineIds].includes(entry.id)||entry.kind==='understory'||entry.nearDetail)return [entry];
  const buckets=new Map();
  for(const p of entry.placements){
   const n=ordinal++,y=Number.isFinite(p.y)?p.y:height?.(p.x,p.z),ratio=broadleafRatio(y);
   // 좌표가 없는 시험 배치는 순번으로 비율을 정확히 맞춘다.
   const broad=Number.isFinite(p.x)&&Number.isFinite(p.z)&&(Number.isFinite(y)||height)?hash(p.x,p.z)<ratio:n%20<Math.round(ratio*20);
   const ids=broad?FOREST_CONFIG.broadleafIds:FOREST_CONFIG.pineIds,id=ids[Math.floor(n/20)%ids.length];
   if(!buckets.has(id))buckets.set(id,{...entry,id,kind:'tree',crossboard:null,impostor:null,
    levels:[0,1,2].map(i=>({url:`${id}-lod${i}.glb`,distance:[0,48,120][i]})),placements:[],
    forestTint:broad?FOREST_CONFIG.broadleafTint:FOREST_CONFIG.pineTint});
   const scale=(p.scale??1)*(broad?FOREST_CONFIG.broadleafScale:1);
   buckets.get(id).placements.push({...p,scale});
  }
  return [...buckets.values()];
 });
}
