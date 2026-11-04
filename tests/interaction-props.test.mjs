import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {assignSurfaceRoute} from '../src/route-surfaces.js';
import {createPropLod,lodStats,PROP_LOD,squirrelModel,magpieModel,springModel,cairnFieldModel} from '../assets/realistic/interaction-props.js';
import {INTERACTION_SITES,ANIMAL_SPAWNS,routeMeasure,resolveInteractionSites,createInteractionProps} from '../assets/realistic/interaction-sites.js';
import {scenerySites} from '../assets/realistic/section-scenery.js';
import {facilitySites} from '../assets/realistic/summit-config.js';
import {entranceFrame} from '../assets/realistic/entrance-scenery.js';
import {indexRoute,nearestRoute} from '../assets/realistic/geo.js';

const route=assignSurfaceRoute(JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url))));
const height=(x,z)=>50+x*.01+z*.02;
const summit=facilitySites(route,height),section=scenerySites(route,height);
const frame=id=>{const s=summit.find(x=>x.id===id);return {x:s.x,z:s.z,yaw:s.yaw};};
const frames={gate:entranceFrame(route),marker:frame('marker'),eungjinjeon:frame('eungjinjeon')};
const {sites,spawns}=resolveInteractionSites(route,height,{frames,avoid:[...summit,...section]});

test('자료 문서의 s와 경로 수평거리 기준이 맞다(약수터 GPX 좌표 ↔ s=260m)',()=>{
 const m=routeMeasure(route);
 assert.ok(Math.abs(m.length-4967)<40,`코스 수평 길이 ${m.length}`);
 const spring=sites.find(s=>s.id==='spring');
 assert.ok(Math.abs(spring.routeMetres-260)<15,`약수터 코스 거리 ${spring.routeMetres}`);
});

test('요청한 소품이 모두 배치된다(스탬프 6·이정표·해설판·정상판·약수터·돌탑, 동물 자리)',()=>{
 const count=k=>sites.filter(s=>s.kind===k).length;
 assert.equal(count('stampBox'),6);assert.ok(count('trailSign')>=10);assert.ok(count('infoBoard')>=3);
 assert.equal(count('summitBoard'),1);assert.equal(count('spring'),1);assert.equal(count('cairnField'),1);
 assert.deepEqual([...new Set(spawns.map(s=>s.kind))].sort(),['magpie','squirrel']);
 for(const s of [...sites,...spawns])assert.ok([s.x,s.y,s.z,s.yaw].every(Number.isFinite),s.id);
 assert.equal(new Set(sites.map(s=>s.id)).size,sites.length);
});

test('코스 소품은 노면 위에 놓이지 않고, 다른 시설 받침과 겹치지 않는다',()=>{
 const index=indexRoute(route);
 for(const s of sites.filter(s=>!s.anchor)){
  const hit=nearestRoute(route,s.x,s.z);
  assert.ok(hit.distance>=hit.width/2+.5,`${s.id}: 노면 가장자리에서 ${(hit.distance-hit.width/2).toFixed(2)}m`);
  for(const a of [...summit,...section])assert.ok(Math.hypot(s.x-a.x,s.z-a.z)>=a.supportRadius+s.supportRadius,`${s.id} ↔ ${a.id}`);
 }
 // 소품끼리도 겹치지 않는다.
 for(const a of sites)for(const b of sites)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=Math.max(a.collisionRadius+b.collisionRadius,.8),`${a.id} ↔ ${b.id}`);
 void index;
});

test('정상 소품은 정상석 둘레 받침(1.5m) 밖에 있고, 정상석에서 4m 안이다',()=>{
 const marker=summit.find(s=>s.id==='marker');
 for(const id of ['stamp-6','board-summit']){const s=sites.find(x=>x.id===id),d=Math.hypot(s.x-marker.x,s.z-marker.z);assert.ok(d>marker.supportRadius+s.collisionRadius&&d<4,`${id} ${d}`);}
});

test('이정표 판 글은 자료 문서의 지명 그대로이고, 첫 판은 오르는 쪽을 가리킨다',()=>{
 const sign=sites.find(s=>s.id==='sign-1935'),spec=INTERACTION_SITES.find(s=>s.id==='sign-1935');
 assert.deepEqual(sign.boards.map(b=>b.text),spec.boards);
 const m=routeMeasure(route),a=m.at(1935),world=sign.boards[0].angle+sign.yaw;
 assert.ok(Math.abs(Math.sin(world)*a.tx+Math.cos(world)*a.tz-1)<1e-6);
});

test('단계별 삼각형·draw call: 단순 모델이 가깝게 보는 모델보다 가볍고 먼 거리는 그리지 않는다',()=>{
 const stats={};
 for(const kind of Object.keys(PROP_LOD)){
  const spec=sites.find(s=>s.kind===kind)??spawns.find(s=>s.kind===kind)??{},levels=lodStats(createPropLod(kind,spec));stats[kind]=levels;
  assert.ok(levels[1].triangles<levels[0].triangles*.75||levels[0].triangles<200,`${kind} 단순 모델 ${levels[1].triangles}/${levels[0].triangles}`);
  assert.equal(levels.at(-1).triangles,0,kind);
  assert.ok(levels[0].drawCalls<=10&&levels[1].drawCalls<=6,`${kind} draw ${levels[0].drawCalls}/${levels[1].drawCalls}`);
  assert.ok(levels[0].triangles<12000,`${kind} 가까운 모델 ${levels[0].triangles}`);
 }
 // 돌탑 공터는 90~200m에서 실루엣만(300 삼각형 아래).
 assert.ok(stats.cairnField[2].triangles<300);
 console.log(JSON.stringify(Object.fromEntries(Object.entries(stats).map(([k,l])=>[k,l.map(x=>`${x.distance}m:${x.triangles}t/${x.drawCalls}dc`).join(' ')]))));
});

test('상호작용용 부품: 물바가지·돌탑 꼭대기·동물 고개·꼬리',()=>{
 const spring=springModel(0),dipper=spring.getObjectByName('물바가지');
 assert.ok(dipper?.userData.interactive);
 const field=cairnFieldModel(0);assert.ok(field.userData.top[1]>1&&field.userData.top[1]<1.6);
 for(const make of [squirrelModel,magpieModel]){const a=make(0);assert.ok(a.userData.parts.head&&a.userData.parts.tail);
  const box=new THREE.Box3().setFromObject(a),size=box.getSize(new THREE.Vector3());
  // 실제 몸길이(다람쥐 약 25cm, 까치 약 45cm)의 ±35% 안, 바닥은 지면(±2cm).
  assert.ok(Math.abs(Math.max(size.x,size.z)-a.userData.length)<a.userData.length*.35,`${a.name} 길이 ${size.z}`);
  assert.ok(Math.abs(box.min.y)<.02,`${a.name} 바닥 ${box.min.y}`);
 }
});

test('장면 묶음: 거리에 따라 단계가 바뀌고, 동물은 미리보기에서만 보인다',()=>{
 const props=createInteractionProps(route,height,{frames,avoid:[...summit,...section]});
 assert.equal(props.group.children.at(-1).visible,false);
 const lod=props.items.find(l=>l.userData.id==='spring'),camera=new THREE.PerspectiveCamera();
 camera.position.copy(lod.position).add(new THREE.Vector3(3,1.6,0));props.update(camera);assert.ok(lod.levels[0].object.visible);
 camera.position.copy(lod.position).add(new THREE.Vector3(50,1.6,0));props.update(camera);assert.ok(lod.levels[1].object.visible&&!lod.levels[0].object.visible);
 camera.position.copy(lod.position).add(new THREE.Vector3(500,1.6,0));props.update(camera);assert.ok(lod.levels.at(-1).object.visible);
 assert.equal(props.clearSites.length,props.sites.length+props.spawns.length);
 props.setAnimalPreview(true);assert.equal(props.group.children.at(-1).visible,true);
 assert.ok(ANIMAL_SPAWNS.length===props.animals.length);
});
