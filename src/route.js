import {gpxPoints} from './gpx-data.js';
import alignedPoints from '../assets/realistic/generated/route.json' with {type:'json'};
import {assignSurfaceRoute,isStairSurface} from './route-surfaces.js';
import {entranceConfig,polygonLineBounds,hitsGateObstacle} from './entrance-config.js';
// 실제 GPX 수평 경로 + DSM 정렬 고도. 정상 632m, 노면 분류·폭은 임시값이다.
export const MATERIALS = {deck:{label:'데크(평탄)',factor:.95,color:0x8b6143},deck_stairs:{label:'데크 계단',factor:.75,color:0x8b6143},soil:{label:'흙길',factor:1,color:0x9c8968},rock:{label:'돌길',factor:.85,color:0x96968b},stairs:{label:'계단',factor:.75,color:0x9a9386},ridge:{label:'암릉',factor:.65,color:0xa4a49b}};
export const SUMMIT_REFERENCE_ELEVATION = 632;
export const ROUTE_ID = 'dem-valley-632-v2';
export const isStairs = isStairSurface;
MATERIALS.paved={label:'회색 포장길(추정)',factor:MATERIALS.rock.factor,color:0x858585};
export const ORIGIN = {latitude:gpxPoints[0][0],longitude:gpxPoints[0][1],elevation:gpxPoints[0][2],verified:false,label:'관악산공원 입구 — GPX 첫 점'};
// WGS84 타원체의 원점 곡률 반경을 사용한 국소 접평면 근사. x=동, z=남, 1단위=1m.
const rad=Math.PI/180,lat0=ORIGIN.latitude*rad,e2=6.6943799901413165e-3,w=Math.sqrt(1-e2*Math.sin(lat0)**2);
const eastRadius=6378137/w*Math.cos(lat0),northRadius=6378137*(1-e2)/w**3;
export function geographicToLocal(latitude,longitude,elevation){return {x:(longitude-ORIGIN.longitude)*rad*eastRadius,y:elevation,z:-(latitude-ORIGIN.latitude)*rad*northRadius};}
export function toLocal({easting,northing,elevation},origin){return {x:easting-origin.easting,y:elevation,z:-(northing-origin.northing)};}
export function toProjected({x,y,z},origin){return {easting:x+origin.easting,northing:origin.northing-z,elevation:y};}
// GPX 급변값을 기하에는 보존하되 보행 속도 식의 경사 입력만 ±50%로 제한한다.
export const SPEED_SLOPE_LIMIT=.5;
export const STAIR_CADENCE=1.2, STAIR_RISE=.18, STAIR_TREAD=.30;
export const STAIR_STRIDE=Math.hypot(STAIR_RISE,STAIR_TREAD);
export const STAIR_SPEED=STAIR_STRIDE*STAIR_CADENCE;
export const WALK_SPEED_MULTIPLIER=1.2;
// 걸음 빈도(걸음/초)×보폭 모델. 걷기 동작은 걸음 수에 맞춰 재생되므로 빈도가 곧 체감 속도다.
// 계단은 기존 값(0.35m×1.44걸음/초) 그대로, 계단 아닌 길은 오르막에서 보폭을 먼저 줄이고 빈도는 계단 이상(1.45)을 유지한다.
export const STAIR_WALK_CADENCE=STAIR_CADENCE*WALK_SPEED_MULTIPLIER;
export const WALK_CADENCE={flat:1.9,uphill:1.45,downhill:1.6}, WALK_STRIDE={flat:.72,uphill:.42,downhill:.52,min:.36};
export function gaitFor(slope,material,direction=1){
 if(isStairs(material))return {stride:STAIR_STRIDE,cadence:STAIR_WALK_CADENCE};
 const grade=Math.max(-SPEED_SLOPE_LIMIT,Math.min(SPEED_SLOPE_LIMIT,(Number.isFinite(slope)?slope:0)*direction));
 const up=Math.max(0,grade)/SPEED_SLOPE_LIMIT,down=Math.min(1,Math.max(0,-grade-.1)/.4),rough=.6+.4*(MATERIALS[material]?.factor??1);
 const cadence=WALK_CADENCE.flat-(WALK_CADENCE.flat-WALK_CADENCE.uphill)*up-(WALK_CADENCE.flat-WALK_CADENCE.downhill)*down;
 const stride=Math.max(WALK_STRIDE.min,(WALK_STRIDE.flat-(WALK_STRIDE.flat-WALK_STRIDE.uphill)*up-(WALK_STRIDE.flat-WALK_STRIDE.downhill)*down)*rough);
 return {stride,cadence};
}
export function speedFor(slope,material,direction=1){const g=gaitFor(slope,material,direction);return g.stride*g.cadence;}
export const baseSpeedFor=speedFor;
export function strideFor(seg,direction=1){return gaitFor(seg.slope,seg.material,direction).stride;}
export function projectedRoute(points,origin){return buildRoute(points.map(p=>({...toLocal(p,origin),material:p.material,width:p.width??1.8})));}
export function buildRoute(points){let distance=0;const segments=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;const horizontal=Math.hypot(dx,dz),length=Math.hypot(horizontal,dy);if(!length)continue;segments.push({a,b,dx,dy,dz,length,horizontal,slope:dy/Math.max(.001,horizontal),start:distance,end:distance+length,material:a.material,width:a.width});distance+=length;}return {points,segments,length:distance};}
const localPoints=alignedPoints;
const geometry=buildRoute(localPoints);
const assignedPoints=assignSurfaceRoute(localPoints);
// 원본 337점은 보존하고 이동·ETA 선분만 노면 경계에서 나눈다.
export const route={...buildRoute(assignedPoints),points:localPoints};
// 전 구간 150분 맞춤 보정은 2026-11-04에 폐지했다(일반 구간이 느려 보임). 보고 스크립트 호환용으로 1을 남긴다.
export const SPEED_CALIBRATION=1;
export const STAIR_SECONDS=route.segments.filter(s=>isStairs(s.material)).reduce((t,s)=>t+s.length/speedFor(s.slope,s.material),0);
export const NONSTAIR_BASE_SECONDS=route.segments.filter(s=>!isStairs(s.material)).reduce((t,s)=>t+s.length/speedFor(s.slope,s.material),0);
export const UNCALIBRATED_MINUTES=(STAIR_SECONDS+NONSTAIR_BASE_SECONDS)/60;
export const DEMO_START=route.segments.find(s=>s.a.y>=545).start;
// GPX의 s=0과 337점을 유지한다. 광장 접근 구간에만 음수 거리를 쓴다.
const entranceLocal=p=>geographicToLocal(p.lat,p.lon,route.points[0].y);
export const entrancePolygon=entranceConfig.freeRoamPolygon.map(entranceLocal);
const plazaStart=entranceLocal(entranceConfig.startPoint),bearing=entranceConfig.startPoint.facingDeg*rad;
const direction={x:Math.sin(bearing),z:-Math.cos(bearing)};
const [farT,nearT]=polygonLineBounds(entrancePolygon,plazaStart,direction);
const approachPoint=t=>({...plazaStart,x:plazaStart.x+direction.x*t,z:plazaStart.z+direction.z*t});
const approachPoints=[approachPoint(farT),approachPoint(nearT),entranceLocal(entranceConfig.gate),route.points[0]].map(p=>({...p,material:'paved',width:12,referenceMetres:0}));
export const entranceApproach=buildRoute(approachPoints);
export const ENTRANCE_MIN_S=-entranceApproach.length;
export const ENTRANCE_START=ENTRANCE_MIN_S-farT;
entranceApproach.segments.forEach(s=>{s.start+=ENTRANCE_MIN_S;s.end+=ENTRANCE_MIN_S;});
export function entranceLateralBounds(s){
 const p=sample(s);
 return s<=entranceApproach.segments[0].end?polygonLineBounds(entrancePolygon,p,{x:p.nx,z:p.nz}):[-1.75,1.75];
}
// 일주문 기둥·바리케이드 충돌. 월드 xz를 일주문 기준 좌표로 돌려 entrance-config의 형상과 비교한다.
const gatePoint=entranceLocal(entranceConfig.gate),gateYaw=-entranceConfig.startPoint.facingDeg*rad;
export function blockedByGate(x,z,radius=.25){
 const dx=x-gatePoint.x,dz=z-gatePoint.z;if(dx*dx+dz*dz>100)return false;
 const c=Math.cos(gateYaw),s=Math.sin(gateYaw);return hitsGateObstacle(c*dx-s*dz,s*dx+c*dz,radius);
}
// 체크포인트표의 첫 참고 좌표를 일관되게 선택. 서로 모순되는 대안은 원본 표에 보존.
const references=[[37.459251,126.947189],null,[37.447460,126.947380],[37.446278,126.952988],null];
export const checkpoints=['제1광장','아카시아동산','제4쉼터','연주샘','제3깔딱고개'].map((name,i)=>{const ref=references[i],targetS=route.length*[.16,.32,.55,.78,.92][i],target=ref?geographicToLocal(...ref,0):null;let best=0,error=Infinity;route.points.forEach((p,j)=>{const d=ref?Math.hypot(p.x-target.x,p.z-target.z):Math.abs((geometry.segments[j]?.start??route.length)-targetS);if(d<error){best=j;error=d;}});return {id:['plaza-1','acacia','shelter-4','yeonju-spring','pass-3'][i],name,s:geometry.segments[best]?.start??route.length,pointIndex:best,verified:false,temporary:true,reference:ref,referenceOffsetM:ref?error:null,positionSource:ref?'임시: 표지판 참고 좌표 최근접 경로점(장소 자체 좌표 아님)':'임시: 경로 비율 최근접 경로점 — 좌표 없음'};});
export function sample(s){s=Math.max(ENTRANCE_MIN_S,Math.min(route.length,s));const segments=s<0?entranceApproach.segments:route.segments;let lo=0,hi=segments.length-1;while(lo<hi){const m=(lo+hi)>>1;if(segments[m].end<s)lo=m+1;else hi=m;}const seg=segments[lo],t=(s-seg.start)/seg.length;return {...seg,x:seg.a.x+seg.dx*t,y:seg.a.y+seg.dy*t,z:seg.a.z+seg.dz*t,nx:-seg.dz/seg.horizontal,nz:seg.dx/seg.horizontal,heading:Math.atan2(-seg.dx,-seg.dz)};}
export function durationBetween(start,end){return [...entranceApproach.segments,...route.segments].reduce((t,s)=>t+Math.max(0,Math.min(end,s.end)-Math.max(start,s.start))/speedFor(s.slope,s.material),0);}

export function floorHeight(s){return sample(s).y;}
