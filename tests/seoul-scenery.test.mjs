import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildingProfile} from '../scripts/seoul-building-profile.mjs';
import {buildingAppearance,seoulRoadGeometry,buildingBounds,citySilhouette} from '../src/city-grid.js';
import {measureReference} from '../assets/realistic/skyline-reference.js';
test('서울 높이: 명시 높이 우선·층수 차선·피트 환산·무효 태그 제외',()=>{
 assert.equal(buildingProfile({height:'120 m','building:levels':'8'},1).height,120);
 assert.equal(buildingProfile({height:'100 ft'},1).height,30.48);
 assert.equal(buildingProfile({building:'apartments','building:levels':'20'},1).height,60);
 assert.equal(buildingProfile({building:'office','building:levels':'10'},1).height,36);
 for(const height of ['-2','unknown','12;30'])assert.match(buildingProfile({height},1).heightSource,/estimated/);
});
test('용도별 미확인 높이는 재현되며 단일 9m가 아니고 아파트·저층 분포를 구분한다',()=>{
 const houses=[],apartments=[];for(let id=10000;id<11000;id++){houses.push(buildingProfile({building:'house'},id).height);apartments.push(buildingProfile({building:'apartments'},id).height);}
 assert.ok(new Set(houses).size>1);assert.ok(Math.max(...houses)<Math.min(...apartments));
 assert.deepEqual(buildingProfile({building:'office'},123),buildingProfile({building:'office'},123));
 assert.notEqual(buildingAppearance({use:'office',id:1}).color.getHex(),buildingAppearance({use:'house',id:1}).color.getHex());
});
test('교량은 수면보다 높고 일반 도로는 지형을 따라가며 모든 정점이 유한하다',()=>{
 const road={points:[[0,0],[100,0]],width:20};const g=seoulRoadGeometry([road,{...road,bridge:true}],()=>5);
 const ys=Array.from(g.attributes.position.array).filter((_,i)=>i%3===1);assert.ok(ys.includes(6.3)||ys.some(y=>Math.abs(y-6.3)<1e-5));assert.ok(ys.includes(26));assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite));g.dispose();
});
test('원경 실루엣에도 용도별 정점색을 보존한다',()=>{
 const b={id:123,use:'office',height:30,ground:0,footprint:[[0,0],[20,0],[20,20],[0,20]]},box=buildingBounds(b),s=citySilhouette([{building:b,box}],box,0);
 assert.equal(s.colors.length,s.positions.length);assert.ok(s.colors.every(Number.isFinite));
});
test('랜드마크의 배치가 산리서치 방위·거리와 일치한다',()=>{
 const m=JSON.parse(readFileSync('assets/realistic/generated/manifest.json'));
 for(const [id,bearing,distance] of [['63-building',345.6,8560],['n-seoul-tower',10.2,11980],['lotte-world-tower',58.5,14340]]){
 const p=m.landmarks.find(p=>p.id===id),actual=measureReference(p,m.observation);assert.ok(Math.abs(actual.bearing-bearing)<.01);assert.ok(Math.abs(actual.distance-distance)<.1);
 }
});
test('파일 경계에 중복된 OSM 건물 ID를 한 번만 추가한다',async()=>{
 const {createCityGrid}=await import('../src/city-grid.js'),{Group,MeshStandardMaterial}=await import('three');
 const material=new MeshStandardMaterial(),city=createCityGrid({parent:new Group(),material});const b={id:123,height:20,ground:0,footprint:[[0,0],[20,0],[20,20],[0,20]]};
 assert.equal(city.addBuildings([b]),1);assert.equal(city.addBuildings([b]),0);await city.finalize();assert.equal([...city.cells.values()][0].records.length,1);city.dispose();material.dispose();
});
test('한강 본류는 태그뿐인 relation이 아니라 닫힌 실제 경계·섬 구멍을 갖는다',async()=>{
 const {waterShapes}=await import('../assets/realistic/load-landscape.js');
 let count=0,holes=0;for(const id of [152336,3769500]){const data=JSON.parse(readFileSync(`assets/realistic/generated/han-river-${id}-water.json`));const shapes=waterShapes(data.elements[0]);assert.ok(shapes.length>0);count+=shapes.length;holes+=shapes.reduce((n,s)=>n+s.holes.length,0);}
 assert.ok(count>=2);assert.ok(holes>0,'한강 섬을 수면 구멍으로 보존');
});
