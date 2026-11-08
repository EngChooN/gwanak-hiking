// 동물 출현 구역·배회(2026-11-07): 결정성(같은 구역·같은 시간 칸 = 같은 결과), 배회 후 위치 변화, 0~5km 250m 칸 공백 없음,
// 시간대·계절 가중, 길 밖 출현. 자료 src/interaction-data.js ANIMAL_ZONES·ANIMAL_STYLE, 계산 src/animal-zones.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assignSurfaceRoute} from '../src/route-surfaces.js';
import {routeMeasure} from '../assets/realistic/interaction-sites.js';
import {ANIMAL_ZONES,ANIMAL_STYLE,TRAIL_PROPS,STAMPS,TRAIL_RULES} from '../src/interaction-data.js';
import {hashSeed,seededRandom,slotOf,timeBand,zoneWeights,zoneSpawns,wanderAt,emptyCells} from '../src/animal-zones.js';

const route=assignSurfaceRoute(JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url))));
const measure=routeMeasure(route),halfWidth=m=>measure.at(m).width/2;
const zone=id=>ANIMAL_ZONES.find(z=>z.id===id);
const SLOT=slotOf(Date.UTC(2026,10,7,3,0)/1000,TRAIL_RULES.animalSlot); // 2026-11-07 12:00(서울)
const env={season:'autumn',hour:12,halfWidth};
const strip=list=>list.map(({legs,rand,cursor,...s})=>s);

test('결정적 난수: 같은 씨앗이면 같은 수열, 다른 씨앗이면 다른 수열',()=>{
 assert.equal(hashSeed('z07-climb-forest|5'),hashSeed('z07-climb-forest|5'));assert.notEqual(hashSeed('a'),hashSeed('b'));
 const a=seededRandom('x'),b=seededRandom('x'),c=seededRandom('y');const A=[...Array(20)].map(a),B=[...Array(20)].map(b),C=[...Array(20)].map(c);
 assert.deepEqual(A,B);assert.notDeepEqual(A,C);assert.ok(A.every(v=>v>=0&&v<1));
 assert.equal(TRAIL_RULES.animalSlot,300,'시간 칸 5분');assert.equal(slotOf(599,300),1);assert.equal(slotOf(600,300),2);
});

test('결정성: 같은 구역·같은 시간 칸이면 두 클라이언트의 출현(자리·종류)과 배회 자리가 같다',()=>{
 for(const z of ANIMAL_ZONES){
  const a=zoneSpawns(z,SLOT,env),b=zoneSpawns(z,SLOT,env);assert.deepEqual(strip(a),strip(b),z.id);
  // 한 쪽은 처음부터 1초씩 따라가고, 다른 쪽은 늦게 들어와 바로 그 시각을 계산해도 같은 자리
  for(let i=0;i<a.length;i++){const t0=a[i].t0;for(let t=0;t<=300;t+=1)wanderAt(a[i],t0+t,z,halfWidth);
   for(const t of [287.5,12.25,150,299.9]){const p=wanderAt(a[i],t0+t,z,halfWidth),q=wanderAt(b[i],t0+t,z,halfWidth);assert.deepEqual(p,{...q,leg:p.leg},`${a[i].id} t=${t}`);}}
 }
});

test('다른 시간 칸이면 같은 구역에 다시 가도 다른 자리(또는 다른 동물)가 나온다',()=>{
 let differ=0,total=0;
 for(const z of ANIMAL_ZONES){const a=zoneSpawns(z,SLOT,env),b=zoneSpawns(z,SLOT+1,env);total++;
  if(JSON.stringify(a.map(s=>[s.kind,s.u.toFixed(1),s.v.toFixed(1)]))!==JSON.stringify(b.map(s=>[s.kind,s.u.toFixed(1),s.v.toFixed(1)])))differ++;}
 assert.equal(differ,total,'모든 구역에서 다음 칸 결과가 달라야 한다');
 assert.notEqual(zoneSpawns(zone('z07-climb-forest'),SLOT,{...env,salt:'방A'})[0]?.u,zoneSpawns(zone('z07-climb-forest'),SLOT,{...env,salt:'방B'})[0]?.u,'salt(방 이름)가 다르면 다른 결과');
});

test('배회: 동물별로 시간이 지나면 자리가 바뀌고, 구역·돌아다니는 반경 안에 머문다',()=>{
 const z=zone('z06-camp');
 for(const kind of ['squirrel','hare','magpie','cat']){
  const st=ANIMAL_STYLE[kind],sp={id:`t-${kind}`,kind,zone:z.id,slot:SLOT,t0:SLOT*300,u:2700,v:halfWidth(2700)+st.offset[0]+1,seed:hashSeed(kind)};sp.home={u:sp.u,v:sp.v};
  const pts=[];const modes=new Set();
  for(let t=0;t<=300;t+=.5){const w=wanderAt(sp,sp.t0+t,z,halfWidth);pts.push(w);modes.add(w.mode);
   assert.ok(w.u>=Math.max(z.from,sp.home.u-st.roam)-1e-6&&w.u<=Math.min(z.to,sp.home.u+st.roam)+1e-6,`${kind} u=${w.u}`);
   if(!w.cross&&w.mode!=='hidden')assert.ok(Math.abs(w.v)>=halfWidth(w.u)+st.offset[0]-.05||Math.abs(w.v)<1e-9&&kind==='cat',`${kind} 길 위에 멈춤 v=${w.v.toFixed(2)} (${w.mode})`);}
  const moved=Math.max(...pts.map(p=>Math.hypot(p.u-pts[0].u,p.v-pts[0].v)));assert.ok(moved>1,`${kind}: 5분 동안 ${moved.toFixed(2)}m만 움직임`);
  const distinct=new Set(pts.map(p=>`${p.u.toFixed(1)},${p.v.toFixed(1)}`)).size;assert.ok(distinct>5,`${kind}: 자리 ${distinct}곳`);
  const want={squirrel:['run','pause'],hare:['hop','graze','look'],magpie:['walk','peck'],cat:['prowl','sit']}[kind];for(const m of want)assert.ok(modes.has(m),`${kind}에 ${m} 없음`);
 }
});

test('배회: 오래 보면 다람쥐 나무 타기·까치 짧은 비행·등산로 가로지르기가 나온다',()=>{
 const z=zone('z07-climb-forest'),seen={climb:0,fly:0,cross:{}};
 for(let i=0;i<30;i++)for(const kind of ['squirrel','hare','magpie','cat']){const sp={id:`${kind}${i}`,kind,zone:z.id,t0:0,u:3200,v:-(halfWidth(3200)+3),seed:i*7919+kind.length};sp.home={u:sp.u,v:sp.v};
  for(let t=0;t<600;t+=1){const w=wanderAt(sp,t,z,halfWidth);if(w.mode==='climb')seen.climb++;if(w.mode==='fly')seen.fly++;if(w.cross)seen.cross[kind]=(seen.cross[kind]??0)+1;}}
 assert.ok(seen.climb>0,'다람쥐 나무 타기');assert.ok(seen.fly>0,'까치 짧은 비행');
 for(const k of ['squirrel','hare','magpie','cat'])assert.ok(seen.cross[k]>0,`${k} 가로지르기 없음`);
});

test('완료 기준: 0~5km를 250m 칸으로 나누면 빈 칸이 없다(동물 구역만으로도, 즐길거리·스탬프와 합쳐도)',()=>{
 const routeZones=ANIMAL_ZONES.filter(z=>!z.box).sort((a,b)=>a.from-b.from);
 assert.equal(routeZones[0].from,0);for(let i=1;i<routeZones.length;i++)assert.ok(routeZones[i].from<=routeZones[i-1].to,`${routeZones[i-1].id}~${routeZones[i].id} 사이 빈틈`);
 assert.ok(routeZones.at(-1).to>=measure.length,'정상까지');
 for(const len of [5000,measure.length]){
  assert.deepEqual(emptyCells(len,{zones:ANIMAL_ZONES}),[],'동물 구역');
  const points=[...TRAIL_PROPS.filter(p=>p.m!=null).map(p=>p.m),...STAMPS.map(s=>s.km*1000)];
  assert.deepEqual(emptyCells(len,{zones:ANIMAL_ZONES,points}),[]);}
 // 칸마다 실제로 동물이 나올 수 있어야 한다(가중 0인 구역만 지나가는 칸이 없게): 각 칸 가운데 m를 덮는 구역의 가중 합 > 0
 for(let a=0;a<5000;a+=250){const m=Math.min(measure.length-1,a+125),z=routeZones.find(z=>m>=z.from&&m<z.to);assert.ok(z&&Object.values(z.w).some(w=>w>0),`${a}m 칸`);}
 // 빈 칸 계산이 실제로 빈 칸을 찾는지(가짜 자료)
 assert.deepEqual(emptyCells(1000,{zones:[{from:0,to:400,w:{cat:1}}],points:[900]}),[[500,750]]);
});

test('빈 구간 즐길거리: 소품 자리(즐길거리 m) 사이 간격이 400m를 넘지 않는 곳은 동물 구역이 메운다',()=>{
 const ms=TRAIL_PROPS.filter(p=>p.m!=null).map(p=>p.m).concat(STAMPS.map(s=>s.km*1000)).sort((a,b)=>a-b);
 for(const m of [640,850,1863,2600,2830,3224,3440,3875])assert.ok(ms.includes(m),`새 벤치 ${m}m`);
 // 소품끼리 400m 넘게 비는 곳(예: 640→1,340m)은 그 사이를 지나는 구역에 '보통' 이상 동물이 있어야 한다
 for(let i=1;i<ms.length;i++){if(ms[i]-ms[i-1]<=400)continue;const mid=(ms[i]+ms[i-1])/2,z=ANIMAL_ZONES.find(z=>!z.box&&mid>=z.from&&mid<z.to);
  assert.ok(z&&Math.max(...Object.values(z.w))>=2,`${ms[i-1]}~${ms[i]}m 사이(${z?.id})`);}
});

test('시간대·계절 가중: 토끼는 새벽·해질녘, 겨울 다람쥐는 드묾, 정상에는 토끼 없음',()=>{
 assert.equal(timeBand(6),'dawn');assert.equal(timeBand(12),'noon');assert.equal(timeBand(9),'day');assert.equal(timeBand(18),'dusk');assert.equal(timeBand(23),'night');assert.equal(timeBand(NaN),'day');
 const z=zone('z07-climb-forest');
 assert.ok(zoneWeights(z,{hour:6}).hare>zoneWeights(z,{hour:12}).hare*3);
 assert.ok(zoneWeights(z,{season:'winter',hour:12}).squirrel<zoneWeights(z,{season:'autumn',hour:12}).squirrel/10);
 const count=(o,kind)=>{let n=0;for(let s=0;s<300;s++)n+=zoneSpawns(z,s,{...env,...o}).filter(x=>x.kind===kind).length;return n;};
 assert.ok(count({hour:18},'hare')>count({hour:12},'hare')*1.5,'해질녘 토끼가 더 자주');
 assert.ok(count({season:'winter'},'squirrel')<count({season:'autumn'},'squirrel')/3,'겨울 다람쥐 드묾');
 for(let s=0;s<200;s++)assert.ok(!zoneSpawns(zone('z11-summit'),s,{...env,hour:6}).some(x=>x.kind==='hare'));
});

test('출현 자리: 길 가장자리 밖·구역 범위 안, 구역 칸마다 고르게, 일주문 구역은 상자 안',()=>{
 let n=0;
 for(let s=0;s<40;s++)for(const z of ANIMAL_ZONES){const list=zoneSpawns(z,SLOT+s,env);n+=list.length;
  for(const sp of list){if(z.box){const [x0,x1,z0,z1]=z.box;assert.ok(sp.u>=x0&&sp.u<=x1&&sp.v>=z0&&sp.v<=z1);continue;}
   assert.ok(sp.u>=z.from&&sp.u<=z.to,sp.id);const [o0,o1]=ANIMAL_STYLE[sp.kind].offset,top=Math.min(o1,z.maxOffset?.[sp.kind]??o1);
   assert.ok(Math.abs(sp.v)>=halfWidth(sp.u)+o0-1e-9&&Math.abs(sp.v)<=halfWidth(sp.u)+Math.max(o0,top)+1e-9,`${sp.id} v=${sp.v}`);}}
 assert.ok(n>40*20,`평균 출현 수가 너무 적음 ${n}`);
 // ids는 구역·칸·순번이라 겹치지 않는다
 const ids=ANIMAL_ZONES.flatMap(z=>zoneSpawns(z,SLOT,env).map(s=>s.id));assert.equal(new Set(ids).size,ids.length);
});

// ── 허용 폭·금지 원 연결(2026-11-07, 산풍경 src/animal-lanes.js): 출현·배회 자리가 laneAllows = true, inForbid = false.
// 월드 자리 계산은 trail-world.js toWorld·trail-sites.js(일주문 frame)와 같은 식.
import {entranceFrame} from '../assets/realistic/entrance-scenery.js';
import {laneAllows,laneLimit,inForbid} from '../src/animal-lanes.js';
import {STREAM_COURSE} from '../assets/realistic/water-clearance.js';
const gate=entranceFrame(route);
const worldZones=ANIMAL_ZONES.map(z=>z.anchor?{...z,frame:{x:gate.x,z:gate.z,yaw:gate.yaw}}:{...z,to:Math.min(z.to,measure.length)});
const toWorld=(z,u,v)=>{if(z.frame){const f=z.frame,c=Math.cos(f.yaw),s=Math.sin(f.yaw);return {x:f.x+u*c+v*s,z:f.z-u*s+v*c};}const p=measure.at(u);return {x:p.x-p.tz*v,z:p.z+p.tx*v};};
const lanesEnv={...env,toWorld};
const standOk=(z,u,v)=>(z.box||laneAllows(u,v,halfWidth))&&!(()=>{const p=toWorld(z,u,v);return inForbid(p.x,p.z);})();

test('완료 기준: 모든 구역·여러 시간 칸·시간대에서 출현 자리와 5분 배회 자리(나는 중 제외)가 허용 폭 안·금지 원 밖',()=>{
 let spawns=0,samples=0;const kinds=new Set();
 for(const hour of [6,12,18])for(let s=0;s<12;s++)for(const z of worldZones){
  const list=zoneSpawns(z,SLOT+s,{...lanesEnv,hour});
  for(const sp of list){spawns++;kinds.add(sp.kind);assert.ok(standOk(z,sp.u,sp.v),`출현 ${sp.id} (${sp.u.toFixed(1)},${sp.v.toFixed(2)})`);
   for(let t=0;t<=300;t+=.25){const w=wanderAt(sp,sp.t0+t,z,halfWidth,toWorld);if(w.mode==='fly'&&w.k<1)continue;samples++;
    assert.ok(standOk(z,w.u,w.v),`배회 ${sp.id} t=${t} ${w.mode} (${w.u.toFixed(1)},${w.v.toFixed(2)}) 허용 ${laneLimit(w.u,w.v>=0?1:-1)}`);}}}
 assert.deepEqual([...kinds].sort(),['cat','hare','magpie','squirrel']);
 assert.ok(spawns>300&&samples>300000,`표본 ${spawns}마리·${samples}자리`);
});

test('계곡 물 쪽(900~2,550m, side −1): 동물이 허용 폭 너머 물줄기 쪽으로 나가지 않는다',()=>{
 let water=0,wide=0;
 for(let s=0;s<60;s++)for(const z of worldZones.filter(z=>!z.box&&z.to>STREAM_COURSE.from&&z.from<STREAM_COURSE.to)){
  for(const sp of zoneSpawns(z,SLOT+s,lanesEnv)){if(sp.v>=0)continue;water++;const e=-sp.v-halfWidth(sp.u);assert.ok(e<=laneLimit(sp.u,-1)+1e-9,sp.id);
   for(let t=0;t<=300;t+=1){const w=wanderAt(sp,sp.t0+t,z,halfWidth,toWorld);if(w.v<0&&!(w.mode==='fly'&&w.k<1))assert.ok(-w.v-halfWidth(w.u)<=laneLimit(w.u,-1)+1e-9,`${sp.id} t=${t}`);}}
  // 연결 전 상한(종류 offset·zone.maxOffset)만 쓰면 물 쪽에서 허용 폭을 넘는 자리가 생긴다 = 이 검사가 실제로 막고 있는 것
  for(let u=Math.max(z.from,STREAM_COURSE.from);u<Math.min(z.to,STREAM_COURSE.to);u+=5)if(laneLimit(u,-1)<ANIMAL_STYLE.squirrel.offset[1])wide++;}
 assert.ok(water>20,`물 쪽 출현 ${water}`);assert.ok(wide>50,'물 쪽 허용 폭이 다람쥐 상한보다 좁은 곳이 있어야 이 검사가 의미 있다');
});

test('허용 폭이 offset[0]보다 좁은 쪽에는 나오지 않고 반대쪽을 고른다, 결정성 유지',()=>{
 const z=worldZones.find(z=>z.id==='z03-lake');
 for(let s=0;s<40;s++){const a=zoneSpawns(z,SLOT+s,lanesEnv),b=zoneSpawns(z,SLOT+s,lanesEnv);assert.deepEqual(strip(a),strip(b));
  for(const sp of a){const side=sp.v>=0?1:-1,[o0]=ANIMAL_STYLE[sp.kind].offset;assert.ok(laneLimit(sp.u,side)>=o0,`${sp.id} ${sp.kind} 쪽 ${side}`);}}
});
