import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {treeDensity,shrubDensity,grassDensity,broadleafRatio,zoneName,FOREST_ZONES} from '../assets/realistic/forest-zones.js';
import {decimateLeaves,createNearTrees,NEAR_TREE_POOL} from '../assets/realistic/near-trees.js';
import {patchFoliage,foliageKind,shrubMaterial,foliageUniforms} from '../assets/realistic/foliage-shader.js';
import {forestLayers,makeShrubGeometry} from '../assets/realistic/generated/nature/forest-layers.js';

test('구간별 밀도: 숲은 빽빽, 능선·정상부는 성기게, 경계는 부드럽게',()=>{
 assert.equal(zoneName(100),'valley');assert.equal(zoneName(300),'mid');assert.equal(zoneName(560),'ridge');assert.equal(zoneName(630),'summit');
 assert.equal(treeDensity(150),1);assert.ok(treeDensity(560)<.35);assert.ok(treeDensity(630)<.15);
 assert.ok(shrubDensity(560)<.3);assert.equal(grassDensity(560),1,'능선 풀은 지금 밀도 유지');assert.ok(grassDensity(600)<.2);
 // 경계 100m 안에서 한 번에 뚝 떨어지지 않는다.
 for(let y=FOREST_ZONES.ridgeStart;y<FOREST_ZONES.ridgeFull;y+=5)assert.ok(Math.abs(treeDensity(y+5)-treeDensity(y))<.1);
 assert.ok(broadleafRatio(120)>=.75&&broadleafRatio(560)<=.3);assert.equal(broadleafRatio(undefined),FOREST_ZONES.targets.mid.broadleaf);
});

test('중간 단계 나무는 잎 카드 묶음 일부만 남기고 키워 수관 크기를 유지한다',()=>{
 // 잎 카드 200장(사각형 = 삼각형 2개)을 흩어 놓은 시험 형상.
 const v=[],idx=[];
 for(let i=0;i<200;i++){const x=(i%20)*.5,y=Math.floor(i/20)*.5,b=v.length/3;v.push(x,y,0,x+.2,y,0,x+.2,y+.2,0,x,y+.2,0);idx.push(b,b+1,b+2,b,b+2,b+3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);
 const mid=decimateLeaves(g,.5);const tris=mid.attributes.position.count/3;
 assert.ok(tris%2===0,'잎 카드를 반쪽으로 자르지 않는다');assert.ok(tris>140&&tris<260,`남은 삼각형 ${tris}`);
 mid.computeBoundingBox();g.computeBoundingBox();
 assert.ok(mid.boundingBox.max.x>g.boundingBox.max.x-.5&&mid.boundingBox.min.y<g.boundingBox.min.y+.5,'수관 범위 유지');
 assert.deepEqual(decimateLeaves(g,.5).attributes.position.array,mid.attributes.position.array,'결정적');
});

function fakeChunk(n){
 const lod=new THREE.LOD(),holder=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),n);
 const m=new THREE.Matrix4();for(let i=0;i<n;i++)mesh.setMatrixAt(i,m.makeTranslation(i*2,0,0));holder.add(mesh);lod.addLevel(holder,0);return {lod,mesh};
}
test('근경 입체 나무: 가까운 나무만 입체로 바꾸고 그 나무의 사진판을 감추며 멀어지면 되돌린다',async()=>{
 const parts=[{geometry:new THREE.BoxGeometry(1,4,1),material:Object.assign(new THREE.MeshStandardMaterial(),{name:'tree_small_02_trunk'})},
  {geometry:new THREE.PlaneGeometry(2,2),material:Object.assign(new THREE.MeshStandardMaterial(),{name:'tree_small_02_leaves'})}];
 const pool=createNearTrees({loadParts:async()=>parts}),{lod,mesh}=fakeChunk(40);
 const matrices=Array.from({length:40},(_,i)=>new THREE.Matrix4().makeTranslation(i*2,0,0));
 await pool.register(lod,{id:'tree_small_02',url:'x-lod0.glb',matrices,tints:matrices.map(()=>0x996633),dense:matrices.map((_,i)=>i>=30)});
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.7,0);camera.lookAt(10,1.7,0);camera.updateMatrixWorld();
 pool.update(camera,2);
 assert.equal(pool.status.full,NEAR_TREE_POOL.full.count[2]);assert.ok(pool.status.mid>0);
 const m=new THREE.Matrix4();mesh.getMatrixAt(0,m);assert.equal(m.elements[0],0,'입체로 바뀐 나무의 사진판은 감춘다');
 mesh.getMatrixAt(39,m);assert.equal(m.elements[12],78,'먼 나무 사진판은 그대로');
 const full=pool.group.children.find(c=>c.count===NEAR_TREE_POOL.full.count[2]);assert.ok(full?.instanceColor);
 camera.position.set(5000,1.7,0);camera.updateMatrixWorld();pool.update(camera,2);
 mesh.getMatrixAt(0,m);assert.equal(m.elements[12],0);assert.equal(m.elements[0],1,'멀어지면 사진판 복원');
 assert.equal(pool.status.full+pool.status.mid,0);
 // 화질 낮음: 입체 원본 없음, 늘린 교목(dense)은 고르지 않는다.
 camera.position.set(66,1.7,0);camera.updateMatrixWorld();pool.update(camera,0);
 assert.equal(pool.status.full,0);assert.ok(pool.status.mid>0&&pool.status.mid<=NEAR_TREE_POOL.mid.count[0]);
 for(const [r] of pool.selected)assert.ok(r<30);
});

test('잎 재질: 잎 색 입히기·투과광·바람을 기존 셰이더 뒤에 덧붙이고 줄기는 물들이지 않는다',()=>{
 assert.equal(foliageKind('pine_tree_01_twig'),'leaf');assert.equal(foliageKind('tree_small_02_trunk'),'bark');assert.equal(foliageKind(undefined),'card');
 const leaf=Object.assign(new THREE.MeshStandardMaterial(),{name:'tree_small_02_leaves'});let previous=false;
 leaf.onBeforeCompile=()=>{previous=true;};leaf.customProgramCacheKey=()=> 'old';
 patchFoliage(leaf);patchFoliage(leaf);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 leaf.onBeforeCompile(shader);assert.ok(previous);assert.equal(shader.uniforms.foliageTime,foliageUniforms.foliageTime);
 assert.match(shader.fragmentShader,/foliageBack/);assert.match(shader.fragmentShader,/vFoliageTint/);assert.match(shader.vertexShader,/foliageGust/);
 assert.equal(shader.fragmentShader.split('foliageGlow=').length-1,1,'두 번 패치해도 한 번만 들어간다');
 assert.match(leaf.customProgramCacheKey(),/^old\|foliage-v2-leaf/);
 const bark=patchFoliage(Object.assign(new THREE.MeshStandardMaterial(),{name:'pine_tree_01_bark'}),{pine:true});
 const s2={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};bark.onBeforeCompile(s2);
 assert.match(s2.fragmentShader,/foliageLeafMask=0\./);
 const shrub=shrubMaterial(),s3={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};shrub.onBeforeCompile(s3);
 assert.match(s3.vertexShader,/shrubTip/);assert.match(s3.fragmentShader,/shrubBack/);
});

test('덤불층: 1~3m 높이로 숲 구간에 깔리고 능선에서는 줄며 화질 낮음에서 개수를 줄인다',()=>{
 const g=makeShrubGeometry();g.computeBoundingBox();assert.ok(g.boundingBox.max.y>1&&g.boundingBox.max.y<1.4);assert.ok(g.attributes.position.count/3<200);
 const make=y=>{const a={route:[{x:0,z:0,y,s:0,width:3},{x:80,z:0,y,s:80,width:3}],floorHeight:()=>y,group:new THREE.Group(),status:{},update(){}};forestLayers(a);return a;};
 const forest=make(150),ridge=make(560);
 assert.ok(forest.status.scenery.shrubs>ridge.status.scenery.shrubs*2.5,`숲 ${forest.status.scenery.shrubs} / 능선 ${ridge.status.scenery.shrubs}`);
 const shrubs=forest.group.children[1];assert.equal(shrubs.name,'덤불층 · 바람');
 const m=new THREE.Matrix4(),p=new THREE.Vector3();
 for(const mesh of shrubs.children)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);assert.ok(Math.hypot(p.x-Math.max(0,Math.min(80,p.x)),p.z)>1.5+1.4-.31);}
 const camera=new THREE.PerspectiveCamera(90,1,.1,1000);camera.position.set(40,152,12);camera.lookAt(40,150,0);camera.updateMatrixWorld();
 forest.update(camera,2);const high=forest.status.scenery.visibleShrubs;forest.update(camera,0);
 assert.ok(high>0&&forest.status.scenery.visibleShrubs<high*.4);
 assert.ok(forest.status.scenery.denseTrees>0,'늘린 교목은 따로 표시해 화질 낮음에서 감춘다');
});
