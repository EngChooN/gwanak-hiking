import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGrassField,GRASS_FIELD} from '../src/toon/grass-field.js';
import {createCullingReuse,CULL_REUSE} from '../src/culling-reuse.js';
import {createToonNature} from '../src/toon/nature.js';
import {TOON_UNIFORMS} from '../src/toon/materials.js';
import {createGradientMap} from '../src/toon/gradient.js';

// 최적화 7번 후속(2026-11-06): 풀밭 거리 LOD와 컬링 재계산 건너뛰기.
const flat=()=>({route:[{x:-200,z:0,y:200,s:0,width:2.4},{x:200,z:0,y:200,s:400,width:2.4}],floorHeight:()=>200,status:{}});
function field(){
 const n=createToonNature({gradientMap:createGradientMap(),uniforms:TOON_UNIFORMS}),scene=new THREE.Scene();
 const f=createGrassField({landscape:flat(),geometry:n.geometries.grass.field,farGeometry:n.geometries.grass.fieldFar,material:n.materials.grassField,scene});
 return {f,n,scene};
}
const tris=g=>g.attributes.position.count/3;

test('풀밭 먼 쪽 다발은 잎 수만 줄이고 키·퍼짐은 같다',()=>{
 const {n}=field(),near=n.geometries.grass.field,far=n.geometries.grass.fieldFar;
 assert.ok(tris(far)<tris(near)*.6,`${tris(far)} < ${tris(near)}×0.6`);
 near.computeBoundingBox();far.computeBoundingBox();
 assert.ok(Math.abs(far.boundingBox.max.y-near.boundingBox.max.y)<.12,'키');
 assert.ok(far.attributes.toonFlower,'꽃 표시 속성 유지(같은 셰이더)');
});

test('풀밭 거리 LOD: 가까운 다발은 17잎, 먼 다발은 8잎 메시로 나뉘고 합은 상한 안·기존 수와 같다',()=>{
 const {f,scene}=field(),camera=new THREE.PerspectiveCamera();camera.position.set(0,201.6,8);
 f.update(camera,2);
 const {mesh,meshFar,status}=f,R=GRASS_FIELD.radius[2],nearR=R*GRASS_FIELD.near;
 assert.equal(scene.children.filter(o=>o.userData.toonGroundCover==='field').length,2);
 for(const m of [mesh,meshFar]){assert.equal(m.userData.metricKind,'하층 식생');assert.equal(m.frustumCulled,false);assert.equal(m.castShadow,false);assert.equal(m.material,mesh.material);}
 assert.ok(status.clumpsNear>0&&status.clumpsFar>0);
 assert.equal(status.clumps,status.clumpsNear+status.clumpsFar);assert.ok(status.clumps<=GRASS_FIELD.capacity[2]);
 assert.ok(status.clumpsFar>status.clumpsNear,'면적상 먼 쪽이 더 많다');
 const m4=new THREE.Matrix4(),p=new THREE.Vector3(),dist=(m,i)=>{m.getMatrixAt(i,m4);p.setFromMatrixPosition(m4);return Math.hypot(p.x-camera.position.x,p.z-camera.position.z);};
 for(let i=0;i<mesh.count;i++)assert.ok(dist(mesh,i)<nearR+GRASS_FIELD.band+1e-6);
 for(let i=0;i<meshFar.count;i++)assert.ok(dist(meshFar,i)>=nearR-1e-6);
 // 경계 구간은 섞인다(한 줄로 바뀌지 않음).
 let bandNear=0,bandFar=0;
 for(let i=0;i<mesh.count;i++)if(dist(mesh,i)>nearR+.3)bandNear++;
 for(let i=0;i<meshFar.count;i++)if(dist(meshFar,i)<nearR+GRASS_FIELD.band-.3)bandFar++;
 assert.ok(bandNear>0&&bandFar>0,`경계 섞임 ${bandNear}/${bandFar}`);
 // 같은 자리 LOD 없는 풀밭(한 지오메트리)과 다발 총수가 같다.
 const n2=createToonNature({gradientMap:createGradientMap(),uniforms:TOON_UNIFORMS}),single=createGrassField({landscape:flat(),geometry:n2.geometries.grass.field,material:n2.materials.grassField,scene:new THREE.Scene()});
 single.update(camera,2);assert.equal(single.status.clumps,status.clumps);
 f.dispose();assert.equal(scene.children.length,0);
});

test('컬링 재사용: 거의 그대로면 최대 4프레임 건너뛰고, 움직임·회전·화질·청크 변화에는 바로 다시 잰다',()=>{
 const c=createCullingReuse(),cam=new THREE.PerspectiveCamera();cam.position.set(10,100,10);cam.updateMatrixWorld();
 assert.equal(c.check(cam,2),false,'첫 프레임은 잰다');
 const seq=[];for(let i=0;i<10;i++){cam.position.x+=.01;seq.push(c.check(cam,2));}
 assert.deepEqual(seq,[true,true,true,true,false,true,true,true,true,false],'5프레임마다 한 번');
 cam.position.x+=CULL_REUSE.distance+.01;assert.equal(c.check(cam,2),false,'0.25m 넘게 움직임');
 cam.rotateY(.4*Math.PI/180);assert.equal(c.check(cam,2),false,'0.3° 넘게 돎');
 cam.rotateY(.1*Math.PI/180);assert.equal(c.check(cam,2),true,'작은 회전은 건너뜀');
 assert.equal(c.check(cam,1),false,'화질 변경');
 cam.zoom=2;assert.equal(c.check(cam,1),false,'쌍안경 확대');
 assert.equal(c.check(cam,1),true);
 c.markDirty();assert.equal(c.check(cam,1),false,'청크가 붙거나 떨어짐');
 assert.ok(c.status.runs>0&&c.status.skipped>0);
});

test('load-landscape·숲 층위는 컬링 재사용 프레임에 순회만 건너뛰고 바람·근경 나무는 매 프레임 갱신한다',async()=>{
 const {readFile}=await import('node:fs/promises');
 const src=await readFile(new URL('../assets/realistic/load-landscape.js',import.meta.url),'utf8');
 assert.match(src,/const reuseCulling=cullReuse\.check\(camera,quality\);\s*if\(!reuseCulling\)\{\s*let terrainVisible/);
 assert.match(src,/attach\(holder,chunk\)\{cullReuse\.markDirty\(\);/);assert.match(src,/detach\(holder,chunk\)\{cullReuse\.markDirty\(\);/);
 assert.match(src,/function detachVegetation\(holder,chunk\)\{\s*cullReuse\.markDirty\(\);/);assert.match(src,/function attachNature\(lod,bucket\)\{\s*cullReuse\.markDirty\(\);/);
 const body=src.slice(src.indexOf('const reuseCulling'),src.indexOf('city.update(camera,quality,culler)'));
 assert.ok(body.indexOf('nearTrees.update(camera,quality)')>0&&body.indexOf('foliageUniforms.foliageTime.value')>0);
 const forest=await readFile(new URL('../assets/realistic/generated/nature/forest-layers.js',import.meta.url),'utf8');
 assert.match(forest,/if\(landscape\.status\.culling\?\.reused\)\{foliageUniforms\.foliageTime\.value=time\.value;return;\}/);
});
