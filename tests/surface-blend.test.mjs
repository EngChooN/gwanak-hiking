import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ribbon,densifyRoute,SURFACE_OVERLAP_METRES} from '../assets/realistic/load-landscape.js';
import {rockTrailMaterial,trailMaterial,pavedMaterial,terrainMaterial} from '../assets/realistic/terrain-material.js';

const textures=()=>{const materials={},meta={};for(const key of ['granite','soil','grass','leaves','stone']){materials[key]={map:new THREE.Texture(),normalMap:new THREE.Texture(),roughnessMap:new THREE.Texture()};meta[key]={metres:2};}return {materials,meta};};
const compile=material=>{const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);return shader;};

test('암릉·돌길 노면은 가장자리를 지형 화강암 색으로 바꾸고 노이즈 마스크로 녹인다',()=>{
 const {materials,meta}=textures();
 for(const key of ['granite','stone']){
  const material=rockTrailMaterial(materials,meta,key),shader=compile(material);
  assert.ok(material.alphaHash,'가장자리 투명 처리');
  assert.match(shader.vertexShader,/attribute float trailEdge; attribute float trailEntry;/);
  assert.match(shader.fragmentShader,/float side=abs\(rockSide\)\+\(rockNoise-\.5\)\*\.8;/);
  assert.match(shader.fragmentShader,/diffuseColor\.a\*=1\.0-smoothstep\(\.62,1\.02,side\);/);
  assert.match(shader.fragmentShader,/surfaceEntry\(rockIn,rockWorld\.xz\)/);
  assert.doesNotMatch(shader.fragmentShader,/#include <map_fragment>/);
  assert.match(material.customProgramCacheKey(),new RegExp(`rock-trail-${key}`));
 }
 assert.match(compile(rockTrailMaterial(materials,meta,'granite')).fragmentShader,/vec3\(\.94,\.98,1\.0\)/,'terrainMaterial 화강암 색 식과 같다');
});

test('흙길·포장길도 재질 전환 겹침 구간에서 노이즈로 드러난다',()=>{
 const {materials,meta}=textures();
 for(const material of [trailMaterial(materials,meta),pavedMaterial(materials,meta)]){
  const shader=compile(material);assert.match(shader.vertexShader,/attribute float trailEntry;/);assert.match(shader.fragmentShader,/surfaceEntry\(/);
 }
});

test('계단이 아닌 노면 전환은 뒤 노면을 1.6m 겹쳐 깔고 계단 전환은 겹치지 않는다',()=>{
 const line=(materials)=>densifyRoute(materials.map((material,i)=>({x:0,z:i*10,y:100,s:i*10,width:2,material})));
 const group=ribbon(line(['soil','soil','ridge','ridge']),new THREE.MeshStandardMaterial(),1);
 const [soil,ridge]=group.children;
 const entries=ridge.geometry.getAttribute('trailEntry'),position=ridge.geometry.getAttribute('position');
 const zs=Array.from({length:position.count},(_,i)=>position.getZ(i));
 const first=Math.min(...zs);assert.ok(first>=20-SURFACE_OVERLAP_METRES-1e-6&&first<=20-SURFACE_OVERLAP_METRES+.5,'전환점 1.6m 안쪽 마지막 점부터 깐다(점 간격 0.5m)');
 for(let i=0;i<position.count;i++){
  const z=position.getZ(i),e=entries.getX(i);
  if(z>=20-1e-6){assert.equal(e,1);assert.ok(Math.abs(position.getY(i)-100.015)<1e-4);}
  else {assert.ok(e<1&&e>=0);assert.ok(Math.abs(position.getY(i)-100.019)<1e-4,'겹침 구간은 4mm 위');}
 }
 assert.ok(Array.from(soil.geometry.getAttribute('trailEntry').array).every(e=>e===1));
 const stairs=ribbon(line(['soil','soil','stairs','stairs','rock','rock']),new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),1);
 const rock=stairs.children.at(-1),rockZ=Array.from({length:rock.geometry.getAttribute('position').count},(_,i)=>rock.geometry.getAttribute('position').getZ(i));
 assert.ok(Math.min(...rockZ)>=40-1e-6,'계단 뒤 노면은 계단 위로 겹치지 않는다');
 group.traverse(o=>o.geometry?.dispose());stairs.traverse(o=>o.geometry?.dispose());
});

test('정상·능선에서 내려다본 사면은 숲 지붕과 화강암 노두로 칠하고 형상·먼 연무는 바꾸지 않는다',()=>{
 const {materials,meta}=textures(),shader=compile(terrainMaterial(materials,meta)),f=shader.fragmentShader;
 assert.match(f,/float overlook=smoothstep\(\.03,\.12,\(cameraPosition\.y-landWorld\.y\)/,'지면을 내려다볼 때만');
 assert.match(f,/smoothstep\(450\.0,520\.0,cameraPosition\.y\)/,'카메라가 능선·정상 높이일 때만(계곡·중턱 원경 색 유지)');
 assert.match(f,/float outcrop=/);assert.match(f,/vec3 canopy=/);
 assert.equal(f.includes('float blotch'),false,'사인 띠 얼룩은 먼 사면에서 흰 소용돌이로 보여 쓰지 않는다');
 assert.match(f,/float farFade=1\.0-\.65\*smoothstep\(500\.0,2000\.0,slopeDist\)/,'먼 노두는 옅게 해 숲에 묻힌다');
 assert.match(f,/canopyMatte\*\.55\*\(1\.0-smoothstep\(2500\.0,6000\.0,slopeDist\)\)/,'연무는 6km 안쪽 사면에서만 덜어 낸다(도심 연무 그대로)');
 assert.equal(shader.vertexShader.includes('canopy'),false,'정점(형상)은 그대로라 서울 쪽 시야를 가리지 않는다');
});
