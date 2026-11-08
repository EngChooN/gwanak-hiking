// 동물 출현 구역의 등산로 옆 허용 폭·금지 영역(2026-11-07 산풍경, scripts/make-animal-lanes.mjs가 실제 지형·숲에서 만든 자료).
// 자료 모양과 쓰는 함수(laneLimit·laneAllows·inForbid)를 검사한다. 동물 배회에 연결하는 일은 산개발 몫.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assignSurfaceRoute} from '../src/route-surfaces.js';
import {routeMeasure} from '../assets/realistic/interaction-sites.js';
import {ANIMAL_LANES,ANIMAL_LANE_STEP,ANIMAL_LANE_REACH,ANIMAL_FORBID,laneLimit,laneAllows,inForbid} from '../src/animal-lanes.js';
import {ANIMAL_ZONES} from '../src/interaction-data.js';
import {STREAM_COURSE} from '../assets/realistic/water-clearance.js';

const route=assignSurfaceRoute(JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url))));
const measure=routeMeasure(route);

test('허용 폭 자료: 코스 전체(5m 간격)를 덮고 값은 0~10m',()=>{
 assert.equal(ANIMAL_LANE_STEP,5);assert.equal(ANIMAL_LANE_REACH,10);
 assert.equal(ANIMAL_LANES.length,Math.floor(measure.length/ANIMAL_LANE_STEP)+1,'route.json이 바뀌면 make-animal-lanes.mjs로 다시 만든다');
 for(const [p,m] of ANIMAL_LANES){assert.ok(p>=0&&p<=10&&m>=0&&m<=10);}
 assert.ok(ANIMAL_FORBID.length>500&&ANIMAL_FORBID.every(c=>c.length===3&&c[2]>0));
});
test('계곡 물줄기 쪽(side −1)은 좁고 반대쪽은 넓다: 물줄기 구간에서 −1 쪽 허용 폭 가운데값 < 3m',()=>{
 const mid=side=>{const a=[];for(let u=STREAM_COURSE.from+50;u<STREAM_COURSE.to-50;u+=ANIMAL_LANE_STEP)a.push(laneLimit(u,side));a.sort((x,y)=>x-y);return a[a.length>>1];};
 assert.ok(mid(-1)<3,`물 쪽 ${mid(-1)}`);assert.ok(mid(1)>=8,`반대쪽 ${mid(1)}`);
});
test('laneLimit은 앞뒤 칸 중 좁은 쪽, laneAllows는 노면 반폭 + 허용 폭까지',()=>{
 const i=ANIMAL_LANES.findIndex(([p],k)=>k>0&&p<ANIMAL_LANES[k-1][0]);assert.ok(i>0);
 assert.equal(laneLimit((i-1)*ANIMAL_LANE_STEP+.1,1),Math.min(ANIMAL_LANES[i-1][0],ANIMAL_LANES[i][0]));
 const u=(i-1)*ANIMAL_LANE_STEP,lim=laneLimit(u,1);
 assert.equal(laneAllows(u,1.1+lim-.01),true);assert.equal(laneAllows(u,1.1+lim+.05),false);
 assert.equal(laneLimit(-50,1),Math.min(ANIMAL_LANES[0][0],ANIMAL_LANES[1][0]),'범위 밖은 끝 칸');
});
test('금지 원: 원 가운데는 막고 먼 곳은 막지 않으며, 구역마다 설 자리가 절반 넘게 남는다',()=>{
 const c=ANIMAL_FORBID[Math.floor(ANIMAL_FORBID.length/2)];assert.equal(inForbid(c[0],c[1]),true);
 assert.equal(inForbid(1e5,1e5),false);
 // 구역마다 동물이 설 자리가 남는다(허용 폭 띠 0.5m 표본 중 금지 원 밖 비율 > 50%)
 for(const z of ANIMAL_ZONES.filter(z=>!z.box)){let all=0,ok=0;for(let u=z.from;u<Math.min(z.to,measure.length);u+=10){const p=measure.at(u);for(const side of [1,-1])for(let e=.5;e<=laneLimit(u,side);e+=1){const v=p.width/2+e,x=p.x-p.tz*v*side,zz=p.z+p.tx*v*side;all++;if(!inForbid(x,zz))ok++;}}
  assert.ok(all>0&&ok/all>.5,`${z.id} ${ok}/${all}`);}
});
