import test from 'node:test';
import assert from 'node:assert/strict';
import {structureForestEntries} from '../assets/realistic/forest-structure.js';
const route=[{x:0,z:0,y:500,s:0,width:3},{x:200,z:0,y:500,s:200,width:3}];
test('작은 나무·중간 교목·큰 교목이 함께 있고 좌표와 LOD는 유지한다',()=>{
 const placements=Array.from({length:1000},(_,i)=>({x:(i%100)*2,z:12+Math.floor(i/100)*2,scale:1,yaw:.2}));
 const entry={id:'tree_small_02',kind:'tree',levels:[{url:'tree-lod0.glb',distance:0},{url:'tree-lod2.glb',distance:120}],placements};
 const result=structureForestEntries([entry],route)[0];
 assert.deepEqual(result,structureForestEntries([entry],route)[0]);
 assert.equal(result.levels,entry.levels);assert.equal(result.placements.length,placements.length);
 assert.ok(result.placements.some(p=>p.visualHeight<7));assert.ok(result.placements.some(p=>p.visualHeight>=8&&p.visualHeight<=13));
 assert.ok(result.placements.filter(p=>p.visualHeight>=16).length>200);
 assert.ok(result.placements.some(p=>p.visualHeight>21));
 result.placements.forEach((p,i)=>{
  assert.equal(p.x,placements[i].x);assert.equal(p.z,placements[i].z);assert.equal(p.yaw,placements[i].yaw);
  assert.ok(p.stretch[0]*4.98<=p.z-2.1+1e-6);assert.ok(p.visualHeight<=22);
 });
 assert.ok(placements.every(p=>!p.stretch));
});
test('정상부·좁은 길가의 큰 수관을 제한하고 어린나무·바위는 보존한다',()=>{
 const near={id:'pine_sapling_medium',kind:'tree',nearDetail:true,placements:[{x:20,z:8,scale:.4}]};
 const rock={id:'rock_09',kind:'rock',placements:[{x:20,z:8,scale:.4}]};
 assert.equal(structureForestEntries([near,rock],route)[0],near);assert.equal(structureForestEntries([near,rock],route)[1],rock);
 const tree={id:'pine_tree_01',kind:'tree',placements:Array.from({length:100},(_,x)=>({x,z:5,scale:1}))};
 assert.ok(structureForestEntries([tree],route)[0].placements.every(p=>p.visualHeight<=10));
 assert.ok(structureForestEntries([tree],route.map(p=>({...p,y:620})))[0].placements.every(p=>p.visualHeight<=6));
});
