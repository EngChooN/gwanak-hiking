import test from 'node:test';
import assert from 'node:assert/strict';
import {nearDetailPlacements,grassClumps,updateGroundCover} from '../assets/realistic/near-detail.js';

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
 updateGroundCover(mesh,30,2);assert.equal(mesh.count,7);
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
