// 근거: docs/입구광장-배치조사.md §0-4·§1·§2. 현장 실측값이 아니다.
// A 복귀는 이 선택 상수만 바꾼다. 치수·현판 색은 여기서 확정하지 않는다.
export const ENTRANCE_HYPOTHESIS = 'B';
export const ENTRANCE_OPTIONS = {
 A: {
  startPoint:{lat:37.468244,lon:126.946319,facingDeg:142},
  gate:{lat:37.468030,lon:126.946528},
  freeRoamPolygon:[
   {lat:37.468054,lon:126.946419},{lat:37.468120,lon:126.946526},
   {lat:37.468334,lon:126.946317},{lat:37.468268,lon:126.946210},
  ],
 },
 B: {
  startPoint:{lat:37.468378,lon:126.946067,facingDeg:132},
  gate:{lat:37.468197,lon:126.946320},
  freeRoamPolygon:[
   {lat:37.468205,lon:126.946207},{lat:37.468285,lon:126.946298},
   {lat:37.468467,lon:126.946046},{lat:37.468386,lon:126.945955},
  ],
 },
};
export const entranceConfig = {
 hypothesis:ENTRANCE_HYPOTHESIS,...ENTRANCE_OPTIONS[ENTRANCE_HYPOTHESIS],
 verified:false,source:'입구광장-배치조사.md §0-4·§1·§2 — 대표 로드뷰 확인, 현장 실측 전',
};

// 일주문 기준 좌표(x 좌우, z 광장 쪽 +)의 충돌 형상. 모델(entrance-scenery.js)과 같은 상수를 쓴다.
export const GATE_PILLAR_X=3.05, GATE_PILLAR_RADIUS=.56;
export const BARRICADE_X=[-2.15,-.92,1.15,2.3], BARRICADE_Z=.3, BARRICADE_HALF={x:.4,z:.35};
export const gateObstacles=[
 ...[-GATE_PILLAR_X,GATE_PILLAR_X].map(x=>({kind:'pillar',x,z:0,radius:GATE_PILLAR_RADIUS})),
 ...BARRICADE_X.map(x=>({kind:'barricade',x,z:BARRICADE_Z,halfX:BARRICADE_HALF.x,halfZ:BARRICADE_HALF.z})),
];
// 몸 반경 radius로 점 (x,z)가 장애물과 겹치는지. 좌표는 일주문 기준.
export function hitsGateObstacle(x,z,radius=.25){
 return gateObstacles.some(o=>o.kind==='pillar'?Math.hypot(x-o.x,z-o.z)<o.radius+radius:Math.hypot(Math.max(0,Math.abs(x-o.x)-o.halfX),Math.max(0,Math.abs(z-o.z)-o.halfZ))<radius);
}

// 볼록 다각형 내부에서 origin + direction*t가 가능한 구간. 반경만큼 경계를 안으로 민다.
export function polygonLineBounds(polygon,origin,direction,radius=.25){
 const area=polygon.reduce((a,p,i)=>{const q=polygon[(i+1)%polygon.length];return a+p.x*q.z-q.x*p.z;},0),sign=Math.sign(area);
 let min=-Infinity,max=Infinity;
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z;
  const c=sign*(dx*(origin.z-a.z)-dz*(origin.x-a.x))-radius*Math.hypot(dx,dz);
  const d=sign*(dx*direction.z-dz*direction.x);
  if(Math.abs(d)<1e-10){if(c< -1e-8)return [Infinity,-Infinity];continue;}
  const t=-c/d;if(d>0)min=Math.max(min,t);else max=Math.min(max,t);
 }
 return min<=max?[min,max]:[Infinity,-Infinity];
}
