import test from 'node:test';
import assert from 'node:assert/strict';
import {treeTint,colorForestEntries} from '../assets/realistic/forest-color.js';

test('나무 색은 개체별로 다르며 같은 좌표·수종은 재현된다',()=>{
 const colors=Array.from({length:100},(_,i)=>treeTint('tree_small_02',i*3,20));
 assert.ok(new Set(colors).size>50);
 assert.deepEqual(colors,Array.from({length:100},(_,i)=>treeTint('tree_small_02',i*3,20)));
 assert.notEqual(treeTint('pine_tree_01',30,20),treeTint('tree_small_02',30,20));
});
test('원본 배치·LOD를 보존하며 교목에만 개체별 색을 전달한다',()=>{
 const levels=[{url:'tree-lod0.glb',distance:0},{url:'tree-lod2.glb',distance:120}];
 const placements=[{x:4,z:8,scale:1,yaw:.2},{x:12,z:8,scale:.7}];
 const tree={id:'tree_small_02',kind:'tree',levels,placements};
 const rock={id:'rock_09',kind:'rock',placements};
 const result=colorForestEntries([tree,rock]);
 assert.equal(result[1],rock);assert.equal(result[0].levels,levels);
 assert.deepEqual(result[0].placements.map(({forestTint,...p})=>p),placements);
 assert.ok(result[0].placements.every(p=>Number.isInteger(p.forestTint)));
 assert.ok(placements.every(p=>p.forestTint===undefined));
});
