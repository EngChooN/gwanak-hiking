import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,PerspectiveCamera,Frustum,Matrix4,Box3} from 'three';
import {createSummitFacilities,facilityTriangleCounts} from '../assets/realistic/summit-facilities.js';
import {mixForestEntries,facilitySites,facilityGround,facilityAnchors} from '../assets/realistic/summit-config.js';
test('정상부 시설: 5종, GPX 기준점, LOD 예산과 원거리 축소',()=>{
 const route=[{x:0,z:0,y:99},{x:100,z:100,y:581},{x:200,z:200,y:654.5}];
 const facilities=createSummitFacilities(route,()=>600);
 assert.equal(facilities.items.length,5);
 assert.equal(facilities.items.find(i=>i.userData.id==='marker').position.x,191);
 assert.equal(facilities.items.find(i=>i.userData.id==='helipad').position.x,114);
 for(const row of facilityTriangleCounts(facilities.items)){
  assert.ok(row.levels[0].triangles<30000);
  assert.ok(row.levels[1].triangles<6000);
  assert.ok(row.levels[2].triangles<1200);
  assert.ok(row.levels[3].triangles<=300);
 }
 facilities.update({position:new Vector3(1e5,1e5,1e5)});
 for(const item of facilities.items)assert.equal(item.levels[3].object.visible,true);
});
test('정상 300도·갈림 90도 시야와 중심 고도 기초·절토·성토',()=>{
 const route=[{x:0,z:0,y:99,originalY:99},{x:100,z:100,y:560,originalY:581},{x:200,z:200,y:632,originalY:654.5}];
 assert.equal(facilityAnchors(route).junction,route[1]);
 const height=(x,z)=>632+(x-200)*.02+(z-200)*.01,sites=facilitySites(route,height);
 const facilities=createSummitFacilities(route,height,sites);
 for(const [anchor,bearing,ids]of [[route[2],300,['radar','eungjinjeon','marker']],[route[1],90,['helipad','fork']]]){
  const camera=new PerspectiveCamera(60,1440/900,.1,2000),a=bearing*Math.PI/180;
  camera.position.set(anchor.x,Math.max(anchor.y,height(anchor.x,anchor.z))+1.6,anchor.z);
  camera.lookAt(camera.position.clone().add(new Vector3(Math.sin(a),-.04,-Math.cos(a))));camera.updateMatrixWorld();
  const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const id of ids){const item=facilities.items.find(i=>i.userData.id===id);assert.ok(frustum.intersectsBox(new Box3().setFromObject(item)),`${id}: 화면 밖`);}
 }
 for(const site of sites){
  assert.equal(site.y,height(site.x,site.z)+.08);
  assert.equal(facilityGround(sites,site.x,site.z,height(site.x,site.z)),site.y);
  for(let i=0;i<16;i++){const a=i*Math.PI/8,x=site.x+Math.cos(a)*site.supportRadius,z=site.z+Math.sin(a)*site.supportRadius;
   assert.equal(facilityGround(sites,x,z,height(x,z)),site.y);
  }
 }
});
test('급경사 기초는 중심 고도를 유지하고 바깥 지형에 매끄럽게 연결',()=>{
 const route=[{x:0,z:0,y:900,originalY:581}],height=(x,z)=>600+x*2+z;
 const sites=facilitySites(route,height),site=sites.find(s=>s.id==='radar');
 for(const sign of [-1,1]){
  const x=site.x+sign*site.supportRadius;
  assert.equal(facilityGround(sites,x,site.z,height(x,site.z)),site.y);
  const outer=x+sign*3;
  assert.equal(facilityGround(sites,outer,site.z,height(outer,site.z)),height(outer,site.z));
 }
});
test('정상 시설 후보는 15~35m·고도 차 6m 이내와 시설 간격을 만족',()=>{
 const sites=facilitySites([{x:0,z:0,y:632}],(x,z)=>632-Math.hypot(x,z)*.1);
 const summit=sites.filter(s=>s.anchor==='summit'),marker=summit.find(s=>s.id==='marker');
 for(const large of summit.filter(s=>s!==marker)){
  assert.equal(large.placementVerified,true);
  const distance=Math.hypot(...large.offset);
  assert.ok(distance>=15-1e-9&&distance<=35+1e-9);
  assert.ok(large.y-.08>=626);
  assert.ok(Math.hypot(large.x-marker.x,large.z-marker.z)>11);
 }
});
test('기초 경계는 인접 시설의 전이 영역보다 우선한다',()=>{
 const sites=[{x:0,z:0,y:629.4,supportRadius:8},{x:9,z:0,y:630,supportRadius:.2}];
 for(let i=0;i<16;i++){
  const a=i*Math.PI/8;
  assert.equal(facilityGround(sites,8*Math.cos(a),8*Math.sin(a),620),629.4);
  assert.equal(facilityGround([...sites].reverse(),8*Math.cos(a),8*Math.sin(a),620),629.4);
 }
});
test('숲 혼효: 개체·좌표 유지, 6:4 배정, 스캔 파일 경로',()=>{
 const placements=Array.from({length:100},(_,x)=>({x,z:2,scale:.5}));
 const entries=mixForestEntries([{id:'pine_tree_01',kind:'tree',placements}]);
 assert.equal(entries.reduce((n,e)=>n+e.placements.length,0),100);
 assert.equal(entries.filter(e=>['tree_small_02','island_tree_01'].includes(e.id)).reduce((n,e)=>n+e.placements.length,0),60);
 assert.equal(new Set(entries.flatMap(e=>e.placements.map(p=>p.x))).size,100);
 for(const entry of entries)assert.ok(entry.levels.every(l=>l.url.startsWith(entry.id)));
});
