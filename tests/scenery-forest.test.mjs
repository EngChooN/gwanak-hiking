import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {forestLayers,mossGround} from '../assets/realistic/generated/nature/forest-layers.js';
import {terrainMaterial,trailMaterial,pavedMaterial} from '../assets/realistic/terrain-material.js';
function landscape(){return {route:[{x:0,z:0,y:500,s:0,width:3},{x:80,z:0,y:500,s:80,width:3}],floorHeight:()=>500,group:new THREE.Group(),status:{},update(){this.called=true;}};}
test('추가 식생·암반은 결정적이고 노면을 비운다',()=>{
 const a=landscape(),b=landscape(),entries=forestLayers(a);
 assert.deepEqual(entries,forestLayers(b));
 assert.ok(a.status.scenery.grassInstances>0);assert.ok(a.status.scenery.outcrops>0);
 for(const e of entries)for(const p of e.placements){
  const distance=Math.hypot(p.x-Math.max(0,Math.min(80,p.x)),p.z);
  assert.ok(distance>1.5+(e.kind==='rock'?7:4.5));
 }
 const m=new THREE.Matrix4();
 for(const mesh of a.group.children[0].children)for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,m);const p=new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.hypot(p.x-Math.max(0,Math.min(80,p.x)),p.z)>1.75);
 }
});
test('화질별 풀 밀도와 거리 제한, 기존 update를 함께 유지한다',()=>{
 const a=landscape();forestLayers(a);const camera=new THREE.PerspectiveCamera(90,1,.1,1000);camera.position.set(40,502,12);camera.lookAt(40,500,0);camera.updateMatrixWorld();
 a.update(camera,2);const high=a.status.scenery.visibleGrass;assert.ok(a.called);assert.ok(high>0);
 a.update(camera,0);assert.ok(a.status.scenery.visibleGrass<high);
 camera.position.set(4000,500,4000);camera.updateMatrixWorld();a.update(camera,2);assert.equal(a.status.scenery.visibleGrass,0);
});
test('이끼 패치는 기존 PBR 셰이더 연결을 보존한다',()=>{
 const a=landscape(),material=new THREE.MeshStandardMaterial();let called=false;
 material.onBeforeCompile=s=>{called=true;s.fragmentShader='vec3 forestColor=groundColor.rgb*mottling;';};
 material.customProgramCacheKey=()=> 'gwanak-slope-test';a.group.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 mossGround(a);const shader={};material.onBeforeCompile(shader);assert.ok(called);assert.match(shader.fragmentShader,/mossPatch/);assert.match(material.customProgramCacheKey(),/moss-v2/);
});
test('숲 바닥 피복은 공유 지형에 한 번 연결하고 흙길·포장길 재질을 보존한다',()=>{
 const a=landscape(),materials={},meta={};
 for(const key of ['granite','soil','grass','leaves','stone']){
  materials[key]={map:new THREE.Texture(),normalMap:new THREE.Texture(),roughnessMap:new THREE.Texture()};meta[key]={metres:1.6};
 }
 const ground=terrainMaterial(materials,meta),trail=trailMaterial(materials,meta),paved=pavedMaterial(materials,meta);
 const trailHook=trail.onBeforeCompile,pavedHook=paved.onBeforeCompile,geometry=new THREE.PlaneGeometry(3,8);
 const positions=geometry.attributes.position.array.slice();
 for(const material of [ground,ground,trail,paved])a.group.add(new THREE.Mesh(geometry,material));
 mossGround(a);
 assert.equal(trail.onBeforeCompile,trailHook);assert.equal(paved.onBeforeCompile,pavedHook);
 assert.deepEqual(geometry.attributes.position.array,positions,'노면·어깨의 형상과 폭을 변경하지 않는다');
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 ground.onBeforeCompile(shader);
 assert.equal(shader.fragmentShader.split('vec3 leafBed=').length-1,1);
 assert.match(shader.fragmentShader,/vec3 mossBed=/);
 assert.match(shader.fragmentShader,/forestFloor\*\(\.90\+\.08\*litterPatch\)/);
 assert.match(shader.fragmentShader,/float forestFloor=\(1.0-smoothstep\(490.,610.,landWorld.y\)\)\*\(1.0-rockCover\)/);
 assert.match(shader.fragmentShader,/landN\(\)/);assert.match(shader.fragmentShader,/landR\(\)/);
 geometry.dispose();for(const material of [ground,trail,paved])material.dispose();
 for(const maps of Object.values(materials))for(const texture of Object.values(maps))texture.dispose();
});
test('풀잎 바람은 인스턴스별 위상과 끝부분 변위를 사용한다',()=>{
 const a=landscape();forestLayers(a);const mesh=a.group.children[0].children[0];
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};mesh.material.onBeforeCompile(shader);
 assert.ok(mesh.instanceColor);assert.equal(mesh.material.color.getHex(),0xffffff);
 assert.ok(shader.uniforms.forestTime);assert.match(shader.vertexShader,/instanceMatrix/);assert.match(shader.vertexShader,/position.y\*position.y/);
 assert.match(shader.vertexShader,/forestLeaf/);assert.match(shader.fragmentShader,/grassHeight/);
 const color=new THREE.Color();
 mesh.getColorAt(0,color);assert.ok(color.r>color.b&&color.g>color.b);
 const hsl={};color.getHSL(hsl,THREE.SRGBColorSpace);assert.ok(hsl.s>=.21&&hsl.s<=.36,'11월 저채도 풀');assert.ok(color.g<.4,'sRGB 풀 색은 선형 인스턴스 색으로 변환한다');
 const old=shader.uniforms.forestTime.value,camera=new THREE.PerspectiveCamera();a.update(camera,2);assert.ok(shader.uniforms.forestTime.value>old);
});
test('풀 밑동은 비선형 고도 함수 대신 표시 지형 삼각형에 맞춘다',async()=>{
 const {grassGround}=await import('../assets/realistic/generated/nature/forest-layers.js');
 const height=(x,z)=>x*x+z*z;
 assert.equal(grassGround(height,.5,.5),2);assert.equal(grassGround(height,1.5,1.5),6);
 assert.equal(grassGround(height,2,2),8);
 assert.equal(grassGround(()=>500,.3,.7),500);
});
test('길가 풀은 최대 약 33cm이며 과도하게 키운 개체가 없다',()=>{
 const a=landscape();forestLayers(a);const matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
 let maximum=0;
 for(const mesh of a.group.children[0].children){
  mesh.geometry.computeBoundingBox();
  for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);scale.setFromMatrixScale(matrix);
   maximum=Math.max(maximum,mesh.geometry.boundingBox.max.y*scale.y);
  }
 }
 assert.ok(maximum>.25);assert.ok(maximum<.34);
});
test('낮아진 풀은 포기 사이를 채워 길 바깥을 연속해서 덮는다',()=>{
 const a=landscape();forestLayers(a);const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),occupied=new Set();let count=0;
 // 직선 길 한쪽 60×6m를 50cm 칸으로 나누어 빈틈을 검사한다.
 for(const mesh of a.group.children[0].children)for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
  if(position.x>=10&&position.x<70&&position.z>=4&&position.z<10){
   count++;occupied.add(`${Math.floor((position.x-10)*2)},${Math.floor((position.z-4)*2)}`);
  }
 }
 assert.ok(count/360>10);assert.ok(occupied.size/(120*12)>.9);
 // 낮음에서는 개수를 줄여도 같은 영역 전체에 포기가 남아야 한다.
 // 2026-11-06부터 먼 칸은 거리 밀도로 더 줄어드므로(근거리 100% 8m) 카메라 둘레 12m 띠에서 화질 배율만 본다.
 const camera=new THREE.PerspectiveCamera();camera.position.set(40,501.6,7);
 a.update(camera,0);count=0;occupied.clear();
 for(const mesh of a.group.children[0].children)for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
  if(position.x>=34&&position.x<46&&position.z>=4&&position.z<10){
   count++;occupied.add(`${Math.floor((position.x-34)*2)},${Math.floor((position.z-4)*2)}`);
  }
 }
 assert.ok(count/72>2);assert.ok(occupied.size/(24*12)>.35);
});
