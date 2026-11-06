// 풀·덤불을 두지 않는 물 자리: 계곡 물줄기 띠(암반 홈, 폭 4.8m)와 호수 수면(반경 5m).
// 물줄기 중심선과 호수 자리는 section-scenery.js가 물을 그리는 식과 같다(코스 참고 거리 800~2560m, 왼쪽 6m를 가운데로 굽이침 / 740m, 왼쪽 19m).
// 띠 바깥 물가(둑 너머 풀·바닥돌)는 그대로 둔다. 판정은 포기 밑동 + 포기 반경(reach)이 물에 걸치는지로 한다.
import {sectionPoint,streamSide,STREAM_POINT_STEP} from './section-scenery.js';
import {STREAM_BED_HALF} from '../../src/stream-water.js';

export const STREAM_COURSE=Object.freeze({from:800,to:2560,step:STREAM_POINT_STEP,halfWidth:STREAM_BED_HALF});
export const POND=Object.freeze({metres:740,side:-19,radius:5});
const CELL=16;

// 점(px,pz)에서 선분 ab까지의 수평 거리.
function segmentDistance(px,pz,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((px-a.x)*dx+(pz-a.z)*dz)/l)):0;
 return Math.hypot(px-(a.x+dx*t),pz-(a.z+dz*t));
}

export function waterClearance(route){
 const line=[];for(let m=STREAM_COURSE.from;m<=STREAM_COURSE.to;m+=STREAM_COURSE.step)line.push(sectionPoint(route,m,streamSide(m)));
 const pond=sectionPoint(route,POND.metres,POND.side);
 // 16m 칸 → 그 칸(과 이웃 칸)을 지나는 선분 번호. 큰 숲 격자에서도 점마다 전체 중심선을 훑지 않는다.
 // 칸 열쇠는 문자열 대신 정수(숲 배치가 점마다 부른다, 2026-11-06).
 const grid=new Map(),key=(i,j)=>(i+1048576)*2097152+(j+1048576);
 for(let k=1;k<line.length;k++){const a=line[k-1],b=line[k];
  for(let i=Math.floor(Math.min(a.x,b.x)/CELL)-1;i<=Math.floor(Math.max(a.x,b.x)/CELL)+1;i++)for(let j=Math.floor(Math.min(a.z,b.z)/CELL)-1;j<=Math.floor(Math.max(a.z,b.z)/CELL)+1;j++){const c=key(i,j);if(!grid.has(c))grid.set(c,[]);grid.get(c).push(k);}}
 // 물줄기 중심선까지 거리(m). 16m 밖은 Infinity.
 function streamDistance(x,z){const list=grid.get(key(Math.floor(x/CELL),Math.floor(z/CELL)));if(!list)return Infinity;let best=Infinity;for(const k of list)best=Math.min(best,segmentDistance(x,z,line[k-1],line[k]));return best;}
 const pondDistance=(x,z)=>Math.hypot(x-pond.x,z-pond.z);
 return {line,pond,streamDistance,pondDistance,
  inStream:(x,z,reach=0)=>streamDistance(x,z)<STREAM_COURSE.halfWidth+reach,
  inPond:(x,z,reach=0)=>pondDistance(x,z)<POND.radius+reach,
  blocked(x,z,reach=0){return streamDistance(x,z)<STREAM_COURSE.halfWidth+reach||pondDistance(x,z)<POND.radius+reach;}};
}
