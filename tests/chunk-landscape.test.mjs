import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {gridMesh,terrainTile} from '../assets/realistic/load-landscape.js';
import {createNearTrees} from '../assets/realistic/near-trees.js';

const h=(x,z)=>Math.sin(x*.07)*3+Math.cos(z*.05)*2;

test('terrainTile: 2m 조각은 같은 높이 함수의 gridMesh와 꼭짓점·삼각형이 같다(경계 봉합 유지)',()=>{
 const a=gridMesh(64,128,50,2,h,null,1),b=terrainTile(64,128,50,50,h,null);
 assert.equal(b.geometry.attributes.position.count,a.geometry.attributes.position.count);
 assert.deepEqual([...b.geometry.attributes.position.array].map(v=>+v.toFixed(4)),[...a.geometry.attributes.position.array].map(v=>+v.toFixed(4)));
 assert.deepEqual([...b.geometry.index.array],[...a.geometry.index.array]);
 assert.equal(b.receiveShadow,true);
});

test('terrainTile: 직사각형(경계 청크) 조각도 2m 간격, 이웃 조각과 공유 모서리 높이가 같다',()=>{
 const left=terrainTile(0,0,50,24,h,null),right=terrainTile(50,0,50,24,h,null),p=left.geometry.attributes.position,q=right.geometry.attributes.position;
 assert.equal(p.count,26*13);
 for(let j=0;j<13;j++){const a=j*26+25,b=j*26;assert.equal(p.getX(a),q.getX(b));assert.equal(p.getY(a),q.getY(b));assert.equal(p.getZ(a),q.getZ(b));}
});

test('near-trees unregister: 해제한 LOD의 나무는 후보에서 빠지고 다시 등록하면 한 번만 잡힌다',async()=>{
 const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial({name:'pine_leaves'});
 const trees=createNearTrees({loadParts:async()=>[{geometry,material}]});
 const lod=()=>{const l=new THREE.LOD();const g=new THREE.Group();g.add(new THREE.InstancedMesh(geometry,material,2));l.addLevel(g,0);return l;};
 const matrices=[new THREE.Matrix4().makeTranslation(1,0,1),new THREE.Matrix4().makeTranslation(3,0,2)];
 const first=lod();await trees.register(first,{id:'pine_tree_01',url:'x',matrices,tints:[0xffffff,0xffffff]});
 assert.equal(trees.status.records,2);
 assert.equal(trees.unregister(first),2);assert.equal(trees.status.records,0);
 const cam=new THREE.PerspectiveCamera();cam.position.set(0,1.6,0);cam.lookAt(1,1.6,1);cam.updateMatrixWorld();
 trees.update(cam,2);assert.equal(trees.selected.size,0);
 const second=lod();await trees.register(second,{id:'pine_tree_01',url:'x',matrices,tints:[0xffffff,0xffffff]});
 trees.update(cam,2);assert.equal(trees.selected.size,2);
});

test('load-landscape: 청크 스트리머로 지형·식생을 붙이고, 공용 재질·GLB는 shared로 보호한다',()=>{
 const src=readFileSync(new URL('../assets/realistic/load-landscape.js',import.meta.url),'utf8');
 assert.match(src,/createChunkStreamer\(\{chunks:chunkIndex\.chunks,chunkSize:CHUNK,radius:terrainRadius/);
 assert.match(src,/radius:vegetationRadius,load:loadVegetationChunk,attach:attachVegetation,detach:detachVegetation/);
 assert.match(src,/blended\.userData\.shared=true/);
 assert.match(src,/part\.geometry\.userData\.shared=true/);
 // 카툰(materialFactory)에서는 PBR 텍스처 로더·HDR을 부르지 않는다.
 assert.match(src,/toonMode\?\{\.\.\.materialFactory\.materials\(\)\}:loadMaterials\(base,manifest\)/);
 assert.match(src,/toonMode\?null:import\('three\/addons\/loaders\/RGBELoader\.js'\)/);
 // 기존 충돌·접지 API는 청크 메시를 대상으로 한다.
 assert.match(src,/collisionObjects:\(\)=>\[path,\.\.\.chunks\.values\(\)\]/);
});
