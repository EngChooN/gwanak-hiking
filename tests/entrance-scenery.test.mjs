import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createEntrance,clearEntranceEntries,entranceLocal,entranceFrame,createEntranceGround,materials} from '../assets/realistic/entrance-scenery.js';
import {createSectionScenery,sectionPoint} from '../assets/realistic/section-scenery.js';
import {facilityTriangleCounts} from '../assets/realistic/summit-facilities.js';
import {assignSurfaceRoute} from '../src/route-surfaces.js';
import {entranceConfig} from '../src/entrance-config.js';
import {project} from '../assets/realistic/geo.js';
const route=assignSurfaceRoute([{x:0,y:100,z:0,s:0,width:2},{x:100,y:400,z:5000,s:5010,width:2}]);
test('선택한 일주문 좌표에 문을 놓고 출발 방위와 정면을 맞춘다',()=>{
 const a=entranceFrame(route),gate=project(entranceConfig.gate.lat,entranceConfig.gate.lon);
 assert.equal(a.x,gate.x);assert.equal(a.z,gate.z);assert.equal(a.yaw,-entranceConfig.startPoint.facingDeg*Math.PI/180);
 const entrance=createEntrance(route,()=>100);assert.equal(entrance.items[0].position.x,gate.x);
 const counts=facilityTriangleCounts(entrance.items)[0].levels;
 assert.ok(counts[0].triangles<30000);assert.ok(counts[1].triangles<6000);assert.equal(counts[2].triangles,0);
 entrance.update({position:new Vector3(a.x,101,a.z)});assert.equal(entrance.items[0].levels[0].object.visible,true);
 entrance.update({position:new Vector3(1000,101,1000)});assert.equal(entrance.items[0].levels[2].object.visible,true);
});
test('광장 중앙 바위·나무를 비우고 주변 숲의 개체 정보는 보존한다',()=>{
 const a=entranceFrame(route),entries=[{kind:'tree',placements:[{x:a.x,z:a.z},{x:a.x+100,z:a.z,yaw:1}]}];const out=clearEntranceEntries(entries,route);
 assert.equal(out[0].placements.length,1);assert.equal(out[0].placements[0].yaw,1);assert.equal(entries[0].placements.length,2);
});
test('특징표 시설은 GPX 기준 m로 배치하고 원경에서 숨긴다',()=>{
 const scenery=createSectionScenery(route,()=>100);assert.equal(scenery.items.length,4);
 assert.ok(Math.abs(sectionPoint(route,1070).z-1070*5000/route.at(-1).referenceMetres)<.1);
 for(const row of facilityTriangleCounts(scenery.items)){assert.ok(row.levels[0].triangles<30000);assert.ok(row.levels[1].triangles<6000);}
 scenery.update({position:new Vector3(1e5,100,1e5)});assert.ok(scenery.items.every(l=>l.levels[2].object.visible));
});

test('포장 광장은 GPX 첫 고도로 접합하고 외곽에서는 원래 지면으로 복귀한다',()=>{
 const r=[{x:0,y:50,z:0},{x:0,y:51,z:-20}],ground=createEntranceGround(r);
 const a=entranceFrame(r),h=(x,z,base)=>ground(a.x+x*Math.cos(a.yaw)+z*Math.sin(a.yaw),a.z-x*Math.sin(a.yaw)+z*Math.cos(a.yaw),base);
 assert.equal(h(0,20,48),50);assert.equal(h(10,20,54),50);
 assert.equal(h(30,20,54),54);assert.equal(h(0,60,48),48);
 assert.ok(h(18,20,54)>50&&h(18,20,54)<54);
});

test('위에서 보는 계곡 수면의 앞면은 위를 향한다',()=>{
 const scenery=createSectionScenery(route,()=>100);let count=0;
 scenery.group.traverse(o=>{if(o.isMesh&&o.material===materials.get('water')){const n=o.geometry.attributes.normal;for(let i=0;i<n.count;i++)assert.ok(n.getY(i)>.99);count++;}});
 assert.ok(count>20);
});
