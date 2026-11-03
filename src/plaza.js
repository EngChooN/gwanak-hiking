// 일주문 앞 광장(출발 전) 자유이동 기하. 근거: docs/입구광장-배치조사.md §1·§2(B 가설, 현장 실측 전).
// 좌표는 route.js 로컬(x=동, z=남). 일주문 기준 좌표 gx(좌우)·gz(광장 쪽 +)는 entrance-config의 충돌 형상과 같다.
import {route,sample,entrancePolygon,entranceApproach,blockedByGate,geographicToLocal} from './route.js';
import {entranceConfig,GATE_PILLAR_X,GATE_PILLAR_RADIUS,BARRICADE_X,BARRICADE_HALF} from './entrance-config.js';
const rad=Math.PI/180;
export const BODY_RADIUS=.25;
const local=p=>geographicToLocal(p.lat,p.lon,route.points[0].y);
const gate=local(entranceConfig.gate),bearing=entranceConfig.startPoint.facingDeg*rad,cb=Math.cos(bearing),sb=Math.sin(bearing);
export const GATE_POINT={x:gate.x,z:gate.z};
export function toGate(x,z){const dx=x-gate.x,dz=z-gate.z;return {gx:cb*dx+sb*dz,gz:-sb*dx+cb*dz};}
export function fromGate(gx,gz){return {x:gate.x+cb*gx-sb*gz,z:gate.z+sb*gx+cb*gz};}
// 일주문 아래(코스 s 시작). GPX 0m가 문과 같으면(A 가설) 0이 된다.
export const GATE_S=-Math.hypot(route.points[0].x-gate.x,route.points[0].z-gate.z);
// 일주문 → 산 방향 첫 선분의 좌표계. positionAt(s≥GATE_S)과 같은 법선 규칙(nx=-dz, nz=dx)을 쓴다.
const next=GATE_S<0?route.points[0]:route.points[1],gateLength=Math.hypot(next.x-gate.x,next.z-gate.z);
const gateDir={x:(next.x-gate.x)/gateLength,z:(next.z-gate.z)/gateLength},gateNormal={x:-gateDir.z,z:gateDir.x};
// 기둥 안쪽 통로 폭. 광장 경계는 조사 다각형(문에서 8~38m, 폭 12m)에 문까지의 접근부를 이어 붙인 볼록 다각형이다.
export const GATE_PASSAGE_HALF=GATE_PILLAR_X-GATE_PILLAR_RADIUS;
function convexHull(points){
 const p=[...points].sort((a,b)=>a.x-b.x||a.z-b.z),cross=(o,a,b)=>(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x),lower=[],upper=[];
 for(const q of p){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
 for(const q of p.reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
 return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
// 문 쪽 끝은 문선(gz=0)을 0.5m 넘긴다. 코스 전환(s≥GATE_S)이 경계보다 먼저 일어나 문 앞에서 걸리지 않게 한다.
export const plazaPolygon=convexHull([...entrancePolygon.map(p=>({x:p.x,z:p.z})),...[-1,1].flatMap(k=>[fromGate(k*GATE_PASSAGE_HALF,0),fromGate(k*GATE_PASSAGE_HALF,-.5)])]);
const polygonSign=Math.sign(plazaPolygon.reduce((a,p,i)=>{const q=plazaPolygon[(i+1)%plazaPolygon.length];return a+p.x*q.z-q.x*p.z;},0));
// 몸 반경만큼 안쪽으로 민 경계 안에 있는가.
export function insidePlaza(x,z,radius=BODY_RADIUS){
 for(let i=0;i<plazaPolygon.length;i++){const a=plazaPolygon[i],b=plazaPolygon[(i+1)%plazaPolygon.length],dx=b.x-a.x,dz=b.z-a.z;
  if(polygonSign*(dx*(z-a.z)-dz*(x-a.x))<radius*Math.hypot(dx,dz)-1e-9)return false;}
 return true;
}
export const plazaArea=Math.abs(plazaPolygon.reduce((a,p,i)=>{const q=plazaPolygon[(i+1)%plazaPolygon.length];return a+p.x*q.z-q.x*p.z;},0))/2;
// 출발점: 일주문을 정면으로 본다. heading은 three.js 회전(앞=(-sin h, -cos h)), 방위 b는 h=-b.
const startLocal=local(entranceConfig.startPoint);
export const PLAZA_START=Object.freeze({x:startLocal.x,z:startLocal.z,heading:-bearing});
// 통로 가운데(바리케이드 사이 빈칸의 중앙). 자동 걷기의 목표 축이다.
const gaps=[];{const edges=BARRICADE_X.map(x=>[x-BARRICADE_HALF.x,x+BARRICADE_HALF.x]).sort((a,b)=>a[0]-b[0]);for(let i=0;i<edges.length-1;i++)gaps.push([edges[i][1],edges[i+1][0]]);}
export const GATE_CENTER_X=(([a,b])=>(a+b)/2)(gaps.reduce((best,g)=>g[1]-g[0]>best[1]-best[0]?g:best,[0,0]));
// 광장 좌표 ↔ 코스(s, lateral). routeWorld는 positionAt과 같은 규칙이어야 하므로 주입받는다.
export function routeFromWorld(x,z,routeWorld){
 let s=GATE_S+(x-gate.x)*gateDir.x+(z-gate.z)*gateDir.z,lateral=(x-gate.x)*gateNormal.x+(z-gate.z)*gateNormal.z;
 if(routeWorld&&s>=GATE_S)for(let i=0;i<4;i++){const q=routeWorld(Math.max(GATE_S,s),lateral),ex=x-q[0],ez=z-q[2];s+=ex*gateDir.x+ez*gateDir.z;lateral+=ex*gateNormal.x+ez*gateNormal.z;}
 return {s,lateral};
}
export function worldFromGateFrame(s,lateral){return {x:gate.x+gateDir.x*(s-GATE_S)+gateNormal.x*lateral,z:gate.z+gateDir.z*(s-GATE_S)+gateNormal.z*lateral};}
export const gateHeading=Math.atan2(-gateDir.x,-gateDir.z);
// 이동 선분이 기둥·바리케이드와 겹치는가(4등분 표본).
export function segmentHitsGate(x0,z0,x1,z1){for(let i=1;i<=4;i++){const t=i/4;if(blockedByGate(x0+(x1-x0)*t,z0+(z1-z0)*t,BODY_RADIUS))return true;}return false;}
// 자동 걷기 목표: 바리케이드 앞 1.2m에서 통로 축에 맞춘 뒤 문을 지나 직진한다.
export function autoTarget(x,z){
 const {gx,gz}=toGate(x,z);
 return gz>1.5||Math.abs(gx-GATE_CENTER_X)>.2?fromGate(GATE_CENTER_X,1.2):fromGate(GATE_CENTER_X,-3);
}
export const plazaInfo={hypothesis:entranceConfig.hypothesis,gateS:GATE_S,area:plazaArea,passageHalf:GATE_PASSAGE_HALF,centerX:GATE_CENTER_X,source:entranceConfig.source,approach:entranceApproach.length};
