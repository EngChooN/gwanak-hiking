// 추정(후기 근거, 현장 확인 전). 기획 §2 / data/구간표-서울대-연주대.csv 수평 거리.
// 구간 안의 나열 순서도 추정이다. rtcd 코드는 사용하지 않는다.
export const SURFACE_SECTIONS=[
 {id:1,metres:1070,shares:[['paved',70],['soil',30]]},
 {id:2,metres:1525,shares:[['soil',60],['rock',40]]},
 {id:3,metres:651,shares:[['soil',40],['rock',30],['stairs',30]]},
 // 4구간 안 순서: 깔딱고개 나무계단이 능선(5구간 데크)까지 이어지도록 뒤쪽에 둔다(실경 비교 1차, 추정).
 {id:4,metres:1066,shares:[['soil',15],['rock',25],['deck_stairs',60]]},
 {id:5,metres:157,shares:[['deck_stairs',60],['rock',25],['soil',15]]},
 {id:6,metres:340,shares:[['stairs',40],['rock',30],['ridge',30]]},
 // 7구간(정상 직전): 대표 요청(2026-11-04)으로 정상석 앞 계단을 없애고 암릉·돌길 맨 지면으로 둔다.
 {id:7,metres:153,shares:[['ridge',60],['rock',40]]}
];
export const SURFACE_REFERENCE_METRES=SURFACE_SECTIONS.reduce((s,r)=>s+r.metres,0);
export const SURFACE_BANDS=[];
let cursor=0;
for(const section of SURFACE_SECTIONS)for(const [material,percent]of section.shares){
 const end=cursor+section.metres*percent/100;
 SURFACE_BANDS.push({section:section.id,material,start:cursor,end});cursor=end;
}
export function surfaceAt(referenceMetres){return SURFACE_BANDS.find(b=>referenceMetres<b.end-1e-8)??SURFACE_BANDS.at(-1);}
export const isStairSurface=material=>material==='stairs'||material==='deck_stairs';
// CSV 반올림 거리와 투영 거리의 미세한 차이는 전장 정규화한다. 원래 점·고저차는 보존한다.
export function assignSurfaceRoute(points){
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
 const horizontal=lengths.reduce((a,b)=>a+b,0),scale=SURFACE_REFERENCE_METRES/horizontal;
 const result=[];let h=0,s=0;
 for(let i=0;i<lengths.length;i++){
  const a=points[i],b=points[i+1],length=lengths[i],distance=Math.hypot(length,b.y-a.y);
  const cuts=[0,...SURFACE_BANDS.map(band=>band.end/scale-h).filter(d=>d>1e-7&&d<length-1e-7).map(d=>d/length)];
  for(const t of cuts){
   const referenceMetres=(h+length*t)*scale,band=surfaceAt(referenceMetres);
   result.push({...a,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,elevationCorrection:(a.elevationCorrection??0)+((b.elevationCorrection??0)-(a.elevationCorrection??0))*t,width:(a.width??2.2)+((b.width??2.2)-(a.width??2.2))*t,s:s+distance*t,referenceMetres,material:band.material,section:band.section});
  }
  h+=length;s+=distance;
 }
 const band=SURFACE_BANDS.at(-1);result.push({...points.at(-1),s,referenceMetres:SURFACE_REFERENCE_METRES,material:band.material,section:band.section});
 return result;
}
