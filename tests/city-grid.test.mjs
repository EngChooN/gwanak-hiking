import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,MeshStandardMaterial,PerspectiveCamera,Vector3} from 'three';
import {buildingBounds,citySilhouette,createCityGrid,CITY_BASE_BUDGET} from '../src/city-grid.js';
import {boxDistanceSquared} from '../src/chunk-culling.js';
const building=(x,z,height=30)=>({ground:10,height,footprint:[[x,z],[x+10,z],[x+10,z+10],[x,z+10]]});
test('원경의 높은 지대 열도 칸의 최저 지면까지 내려 판 아래 틈을 막는다',()=>{
 const records=[building(0,0),{...building(100,0),ground:80}].map(b=>({building:b,box:buildingBounds(b)}));
 const bounds=records[0].box.clone().union(records[1].box),g=citySilhouette(records,bounds,0);
 for(let i=0;i<g.positions.length;i+=12){assert.equal(g.positions[i+1],10);assert.equal(g.positions[i+4],10);}
 assert.ok(g.indices.length/3<=64);
});
test('파일 경계를 넘어 같은 2km 칸을 병합하고 건물 범위·높이와 추가 로딩을 보존한다',async()=>{
 const root=new Group(),material=new MeshStandardMaterial(),status={},city=createCityGrid({parent:root,material,status});
 const first=building(10,10),second=building(1900,100,80);city.addBuildings([first]);city.addBuildings([second]);await city.finalize();
 assert.equal(city.cells.size,1);assert.equal(city.root.children.length,2);
 const cell=[...city.cells.values()][0];assert.equal(cell.records.length,2);assert.equal(cell.bounds.max.y,90);
 for(const geometry of cell.geometries){geometry.computeBoundingBox();assert.ok(geometry.boundingBox.min.distanceTo(cell.bounds.min)<.001);assert.ok(geometry.boundingBox.max.distanceTo(cell.bounds.max)<.001);}
 city.addBuildings([building(50,50,100)]);await city.finalize();assert.equal(city.root.children.length,2);assert.equal(cell.records.length,3);assert.equal(cell.bounds.max.y,110);
 city.dispose();assert.equal(root.children.length,0);material.dispose();
});
test('8방향 실루엣은 실제 투영 양끝과 최저/최고 높이를 보존하고 빈 공간을 단일 거대 상자로 채우지 않는다',()=>{
 const records=[building(0,0),building(1500,0,100)].map(b=>({building:b,box:buildingBounds(b)})),bounds=records[0].box.clone().union(records[1].box);
 for(let direction=0;direction<8;direction++){
  const silhouette=citySilhouette(records,bounds,direction),points=[];
  for(let i=0;i<silhouette.positions.length;i+=3)points.push(new Vector3(...silhouette.positions.slice(i,i+3)));
  assert.equal(Math.min(...points.map(p=>p.y)),bounds.min.y);assert.equal(Math.max(...points.map(p=>p.y)),bounds.max.y);
  const angle=direction*Math.PI/4,right=new Vector3(Math.cos(angle),0,-Math.sin(angle)),project=p=>p.dot(right);
  const corners=records.flatMap(({box})=>[[box.min.x,box.min.z],[box.max.x,box.min.z],[box.min.x,box.max.z],[box.max.x,box.max.z]].map(([x,z])=>new Vector3(x,0,z)));
  assert.ok(Math.abs(Math.min(...points.map(project))-Math.min(...corners.map(project)))<1e-7);
  assert.ok(Math.abs(Math.max(...points.map(project))-Math.max(...corners.map(project)))<1e-7);
  assert.ok(silhouette.indices.length/3<=64);
  if(direction===0)assert.ok(silhouette.indices.length/3<64);
 }
});
test('칸 단위 거리 우선 컬링·먼 칸 통합 제출·호출 상한과 인덱스 재사용',async()=>{
 const material=new MeshStandardMaterial(),status={},city=createCityGrid({parent:new Group(),material,status,cellSize:40});
 city.addBuildings(Array.from({length:60},(_,i)=>building(i*40,500)));city.addBuildings([building(0,200000)]);await city.finalize();
 const camera=new PerspectiveCamera(65,1,.1,10000);camera.position.set(0,30,500);
 let checks=0;const culler={inFrustum(){checks++;return true;}};
 city.update(camera,2,culler);assert.equal(checks,60);assert.equal(status.cityGrid.distanceRejected,1);
 assert.ok(status.cityGrid.silhouetteCells>0);assert.ok(status.cityGrid.baseDrawCalls<=50);assert.ok(status.cityGrid.baseTriangles<=CITY_BASE_BUDGET[2]);
 const far=city.root.children[0],version=far.geometry.index.version;
 assert.ok(far.geometry.drawRange.count>0);city.update(camera,2,culler);assert.equal(far.geometry.index.version,version);
 city.update(camera,1,culler);assert.ok(status.cityGrid.baseDrawCalls<=50);assert.ok(status.cityGrid.baseTriangles<=300000);
 assert.equal(boxDistanceSquared([...city.cells.values()][0].bounds,camera.position),0);
 city.dispose();material.dispose();
});
