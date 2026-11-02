import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Raycaster,Vector3} from 'three';
import {createHiker} from '../assets/source/load-assets.js';
import {ribbon,densifyRoute,waterShapes} from '../assets/realistic/load-landscape.js';
import {inventory} from '../assets/realistic/inventory.mjs';
import {gridHeight,cutHeight,nearestRoute} from '../assets/realistic/geo.js';
import {MeshStandardMaterial} from 'three';
import {nearDetailPlacements,grassClumps} from '../assets/realistic/near-detail.js';
const aligned=JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url)));
import {route,sample,floorHeight,checkpoints,durationBetween,MATERIALS,speedFor,geographicToLocal,ORIGIN,SPEED_CALIBRATION,UNCALIBRATED_MINUTES,NONSTAIR_BASE_SECONDS,STAIR_SECONDS,baseSpeedFor} from '../src/route.js';
import {initialState,advance,restore} from '../src/movement.js';
test('150분 목표·경사 급변 제한·데크 계수',()=>{assert.ok(Math.abs(durationBetween(0,route.length)/60-150)<1e-8);assert.equal(SPEED_CALIBRATION,NONSTAIR_BASE_SECONDS/(9000-STAIR_SECONDS));assert.equal(MATERIALS.deck.factor,.95);assert.equal(MATERIALS.deck_stairs.factor,.75);assert.equal(baseSpeedFor(3,'soil'),baseSpeedFor(.5,'soil'));assert.ok(Math.abs(speedFor(.1,'deck')/speedFor(.1,'soil')-.95)<1e-12);});
test('GPX 수평 337점 보존·DSM 정렬 고도·첫 점 원점·1:1 거리',()=>{const rows=readFileSync(new URL('../data/GPX추출-계곡코스-상행.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1).map(l=>l.split(',').map(Number));assert.equal(rows.length,337);assert.equal(route.points.length,337);for(const [i,row]of rows.entries()){const p=route.points[i],q=geographicToLocal(row[1],row[2],row[4]);assert.ok(Math.abs(p.x-q.x)<1e-8);assert.equal(p.y,aligned[i].y);assert.equal(aligned[i].originalY,row[4]);assert.ok(Math.abs(p.z-q.z)<1e-8);}assert.equal(route.points[0].x,0);assert.ok(Math.abs(route.points[0].z)<1e-12);assert.equal(ORIGIN.latitude,37.46803);const oneDegree=geographicToLocal(ORIGIN.latitude+.001,ORIGIN.longitude+.001,0);assert.ok(Math.abs(oneDegree.x-88.45)<.1);assert.ok(Math.abs(oneDegree.z+110.99)<.1);});
test('5곳 최근접 경로점·임시 표시·통과 저장 복구 및 이전 경로 저장 분리',()=>{for(const cp of checkpoints){assert.equal(cp.temporary,true);assert.equal(cp.verified,false);assert.ok(cp.positionSource.includes('임시'));assert.ok(Math.abs(sample(cp.s).y-route.points[cp.pointIndex].y)<1e-9);if(cp.reference){const p=geographicToLocal(...cp.reference,0);const min=Math.min(...route.points.map(q=>Math.hypot(q.x-p.x,q.z-p.z)));assert.ok(Math.abs(min-cp.referenceOffsetM)<1e-9);}const state=initialState();state.s=cp.s-.01;advance(state,{forward:1},.1);assert.deepEqual(state.checkpoints,[cp.id]);const restored=restore(JSON.stringify(state));assert.equal(restored.s,state.s);assert.equal(restored.elapsed,state.elapsed);assert.deepEqual(restored.checkpoints,[cp.id]);assert.equal(restored.paused,true);}assert.equal(restore(JSON.stringify({...initialState(),routeId:'synthetic-a-4700-v1',s:10})).s,initialState().s);});
test('새 DSM 경로 전체 노면 raycast와 5동작 발바닥 접지 0.3m 이내',async()=>{
 const b=readFileSync(new URL('../assets/hiker-170-lod0.glb',import.meta.url));const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const hiker=createHiker(gltf),ray=new Raycaster();
 const mesh=ribbon(densifyRoute(aligned),new MeshStandardMaterial(),1.3);mesh.updateMatrixWorld(true);let maxError=0,maxCenterError=0,maxFootError=0,contacts=0;
 mesh.traverse(o=>{if(!o.isMesh)return;const edge=o.geometry.getAttribute('trailEdge');assert.equal(edge.count,o.geometry.getAttribute('position').count);for(let i=0;i<edge.count;i++)assert.equal(edge.getX(i),i%2?1:-1);});
 for(let s=1;s<route.length-1;s+=3){const p=sample(s);for(const lateral of [-p.width/2+.3,0,p.width/2-.3]){const x=p.x+p.nx*lateral,z=p.z+p.nz*lateral;ray.set(new Vector3(x,p.y+3,z),new Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert.ok(hit,'노면 누락 '+s);const error=Math.abs(hit.point.y-floorHeight(s));maxError=Math.max(maxError,error);if(lateral===0){maxCenterError=Math.max(maxCenterError,error);assert.ok(error<=.3,`중심 노면 오차 ${s}: ${error}`);}contacts++;}}
 const surfaceHeight=(x,z)=>{const hit=nearestRoute(aligned,x,z);ray.set(new Vector3(x,hit.y+10,z),new Vector3(0,-1,0));return ray.intersectObject(mesh)[0]?.point.y??hit.y;};
 for(const seg of route.segments){const s=(seg.start+seg.end)/2,p=sample(s);for(const clip of ['Idle','Walk','Climb','SidestepLeft','SidestepRight'])for(const phase of [0,.25,.5,.75,1,1.25,1.5,1.75]){hiker.scene.position.set(p.x,floorHeight(s),p.z);hiker.scene.rotation.y=p.heading;hiker.update({clip,distance:phase,stride:1});for(const c of hiker.ground({s,lateral:0,moving:clip!=='Idle',phase,floorHeight,sample,surfaceHeight})){maxFootError=Math.max(maxFootError,c.error);assert.ok(c.error<.001);assert.ok(Math.abs(c.bottom-c.lift-c.support)<.3);}}}
 console.log(JSON.stringify({contacts,maxCenterError,maxFootError,maxLateralRoadDifference:maxError}));
});
test('실제 격자 크기·경로 바닥·OSM relation 연결과 섬 구멍',()=>{
 const detail=nearDetailPlacements(aligned);assert.deepEqual(detail,nearDetailPlacements(aligned));assert.ok(detail.entries.length>0);assert.ok(detail.grass.length>0);
 for(const e of detail.entries){const xs=e.placements.map(p=>p.x),zs=e.placements.map(p=>p.z);assert.ok(Math.max(...xs)-Math.min(...xs)<=64);assert.ok(Math.max(...zs)-Math.min(...zs)<=64);for(const p of e.placements){const hit=nearestRoute(aligned,p.x,p.z);assert.ok(hit.distance>hit.width/2+.08);assert.ok(p.scale>0);}}
 const grass=grassClumps(detail.grass,()=>100);for(const mesh of grass.children){assert.ok(Number.isFinite(mesh.boundingSphere.radius));assert.equal(mesh.geometry.attributes.position.count,15);}
 const m=inventory(),bytes=readFileSync(new URL('../assets/realistic/generated/near.f32',import.meta.url));const grid={...m.near,values:new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};assert.equal(grid.values.length,m.near.width*m.near.height);
 for(let s=0;s<=route.length;s+=5){const p=sample(s),h=cutHeight(gridHeight(grid,p.x,p.z),nearestRoute(aligned,p.x,p.z));assert.ok(Math.abs(h-p.y)<1e-6);}
 const p=(lon,lat)=>({lat,lon});const ring=[p(126.94,37.52),p(126.96,37.52),p(126.96,37.54),p(126.94,37.54),p(126.94,37.52)];const hole=[p(126.945,37.525),p(126.955,37.525),p(126.955,37.535),p(126.945,37.535),p(126.945,37.525)];const shapes=waterShapes({type:'relation',members:[{role:'outer',geometry:ring.slice(0,3)},{role:'outer',geometry:ring.slice(2).reverse()},{role:'inner',geometry:hole}]});assert.equal(shapes.length,1);assert.equal(shapes[0].holes.length,1);
});
