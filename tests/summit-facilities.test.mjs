import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,PerspectiveCamera,Frustum,Matrix4,Box3} from 'three';
import {createSummitFacilities,facilityTriangleCounts} from '../assets/realistic/summit-facilities.js';
import {mixForestEntries,facilitySites,facilityGround,facilityAnchors} from '../assets/realistic/summit-config.js';
test('정상부 시설: 5종, GPX 기준점, LOD 예산과 원거리 축소',()=>{
 const route=[{x:0,z:0,y:99},{x:100,z:100,y:581},{x:200,z:200,y:654.5}];
 const facilities=createSummitFacilities(route,()=>600);
 assert.equal(facilities.items.length,5);
 assert.equal(facilities.items.find(i=>i.userData.id==='marker').position.x,200);
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
 for(const [anchor,bearing,ids]of [[route[2],300,['eungjinjeon','marker']],[route[1],90,['helipad','fork']]]){
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
test('응진전 후보는 15~35m, 레이돔은 서울 전망 반대편 남측에 배치',()=>{
 const sites=facilitySites([{x:0,z:0,y:632}],(x,z)=>632-Math.hypot(x,z)*.1);
 const summit=sites.filter(s=>['summit','crest'].includes(s.anchor)),marker=summit.find(s=>s.id==='marker');
 const radar=summit.find(s=>s.id==='radar');
 assert.ok(radar.z>50);assert.equal(radar.placementVerified,false);
 for(const bearing of [0,59]){
  const camera=new PerspectiveCamera(55,1440/900,.1,2000),a=bearing*Math.PI/180;camera.position.set(0,634,0);camera.lookAt(Math.sin(a)*100,630,-Math.cos(a)*100);camera.updateMatrixWorld();
  const f=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const item=createSummitFacilities([{x:0,z:0,y:632}],()=>632,sites).items.find(i=>i.userData.id==='radar');
  assert.equal(f.intersectsBox(new Box3().setFromObject(item)),false);
 }
 for(const large of summit.filter(s=>s.id==='eungjinjeon')){
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
test('숲 혼효: 개체·좌표 유지, 표고 없으면 중턱 숲 75:25 배정, 스캔 파일 경로',()=>{
 const placements=Array.from({length:100},(_,x)=>({x,z:2,scale:.5}));
 const entries=mixForestEntries([{id:'pine_tree_01',kind:'tree',placements}]);
 assert.equal(entries.reduce((n,e)=>n+e.placements.length,0),100);
 assert.equal(entries.filter(e=>['tree_small_02','island_tree_01'].includes(e.id)).reduce((n,e)=>n+e.placements.length,0),75);
 assert.equal(new Set(entries.flatMap(e=>e.placements.map(p=>p.x))).size,100);
 for(const entry of entries)assert.ok(entry.levels.every(l=>l.url.startsWith(entry.id)));
});

test('숲 혼효: 숲 구간은 활엽 우점, 능선은 소나무 우점, 길가 근경 소나무는 그대로',()=>{
 const placements=y=>Array.from({length:400},(_,i)=>({x:(i%20)*7.3,z:Math.floor(i/20)*6.1,y,scale:1}));
 const broad=y=>{const e=mixForestEntries([{id:'pine_tree_01',kind:'tree',placements:placements(y)}]);return e.filter(x=>['tree_small_02','island_tree_01'].includes(x.id)).reduce((n,x)=>n+x.placements.length,0)/400;};
 assert.ok(broad(120)>.7&&broad(120)<.9,`계곡 활엽 ${broad(120)}`);
 assert.ok(broad(560)<.35,`능선 활엽 ${broad(560)}`);
 const near={id:'pine_tree_01',kind:'tree',nearDetail:true,placements:placements(120)};
 assert.equal(mixForestEntries([near])[0],near);
 const byHeight=mixForestEntries([{id:'pine_tree_01',kind:'tree',placements:placements(undefined).map(({y,...p})=>p)}],()=>570);
 assert.ok(byHeight.filter(x=>x.id.startsWith('pine')).reduce((n,x)=>n+x.placements.length,0)>260,'표고가 없으면 height(x,z)로 구간을 정한다');
});
