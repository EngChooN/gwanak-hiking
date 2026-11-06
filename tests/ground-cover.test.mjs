import test from 'node:test';
import assert from 'node:assert/strict';
import {nearDetailPlacements,grassClumps,updateGroundCover,groundCoverDensity,GROUND_COVER} from '../assets/realistic/near-detail.js';

test('하층 식생은 결정적이며 길 안쪽을 비운다',()=>{
 const route=[{x:0,z:0,y:150,s:0,width:3},{x:100,z:0,y:180,s:100,width:3}];
 const a=nearDetailPlacements(route),b=nearDetailPlacements(route);
 assert.deepEqual(a,b);assert.ok(a.grass.length>0);
 for(const p of a.grass)assert.ok(Math.abs(p.z)>1.65);
 assert.ok(a.grass.some(p=>p.kind==='litter'));
 assert.ok(a.grass.some(p=>p.kind==='shrub'));
});

test('공유 인스턴싱을 유지하고 거리·화질에 따라 개수를 줄인다',()=>{
 const placements=Array.from({length:20},(_,i)=>({x:i,z:4,scale:1,yaw:0,kind:'grass'}));
 const root=grassClumps(placements,()=>10),mesh=root.children[0];
 assert.equal(root.children.length,1);assert.ok(mesh.isInstancedMesh);
 updateGroundCover(mesh,0,2);assert.equal(mesh.count,20);
 // 2026-11-06 연속 곡선: near(24m)까지 100%, far(65m)에서 20%까지 곧게 줄인다(이전 near 밖 35% 계단).
 updateGroundCover(mesh,24,2);assert.equal(mesh.count,20);
 updateGroundCover(mesh,30,2);assert.equal(mesh.count,18);
 updateGroundCover(mesh,45,2);assert.equal(mesh.count,12);
 updateGroundCover(mesh,64,2);assert.equal(mesh.count,4);
 updateGroundCover(mesh,0,0);assert.equal(mesh.count,5);
 updateGroundCover(mesh,70,2);assert.equal(mesh.visible,false);
 mesh.geometry.dispose();mesh.material.dispose();
});

test('기존 길가 풀·관목도 낮게 유지하고 낙엽은 보존한다',()=>{
 const root=grassClumps(['grass','shrub','litter'].map((kind,i)=>({x:i,z:4,scale:1.35,yaw:0,kind})),()=>0);
 for(const mesh of root.children){
  mesh.geometry.computeBoundingBox();
  assert.ok(mesh.geometry.boundingBox.max.y*1.35<.39);
 }
 const litter=root.children[2].geometry.boundingBox;
 assert.ok(Math.abs(litter.max.y-.04)<1e-6);
});

test('하층 풀 거리 밀도는 연속이고 0.05 단위로 잘려 깜빡이지 않는다',()=>{
 const [near,far]=[GROUND_COVER.near[2],GROUND_COVER.far[2]];let last=1;
 for(let d=0;d<=far+5;d+=.05){
  const v=groundCoverDensity(d,near,far);
  assert.ok(v<=last+1e-9,'멀수록 줄기만 한다');assert.ok(last-v<=.05+1e-9,'한 번에 한 단계씩');
  assert.ok(Math.abs(v/GROUND_COVER.step-Math.round(v/GROUND_COVER.step))<1e-9);last=v;
 }
 assert.equal(groundCoverDensity(near,near,far),1);assert.ok(Math.abs(groundCoverDensity(far,near,far)-GROUND_COVER.floor)<1e-9);
 // 미세한 거리 흔들림(1cm)으로는 값이 바뀌지 않는다(경계 바로 위가 아니면).
 assert.equal(groundCoverDensity(40,near,far),groundCoverDensity(40.01,near,far));
});
