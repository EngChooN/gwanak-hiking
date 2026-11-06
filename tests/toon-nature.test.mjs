import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createToonNature,rockGeometry,TOON_NATURE_IDS} from '../src/toon/nature.js';
import {TOON_UNIFORMS} from '../src/toon/materials.js';
import {createGradientMap} from '../src/toon/gradient.js';
import {createToonMaterials} from '../src/toon/materials.js';
import {TOON,outlineFor} from '../src/toon/palette.js';

const nature=()=>createToonNature({gradientMap:createGradientMap(),uniforms:TOON_UNIFORMS});
const tris=g=>(g.index?.count??g.attributes.position.count)/3;
const compile=m=>{const s={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};m.onBeforeCompile(s,null);return s;};

test('카툰 자연물: 원래 GLB id·LOD 파일명마다 새 모양을 돌려주고, 모르는 파일은 null', ()=>{
 const n=nature();
 for(const id of [...TOON_NATURE_IDS.species,...TOON_NATURE_IDS.rocks])for(const lod of [0,1,2]){
  const parts=n.natureParts(`/assets/toon/nature/${id}-lod${lod}.glb`);
  assert.ok(parts?.length,`${id} lod${lod}`);
  for(const {geometry,material} of parts){assert.equal(geometry.userData.shared,true);assert.equal(material.userData.shared,true);assert.ok(material.isMeshToonMaterial);}
 }
 assert.equal(n.natureParts('/x/unknown_tree-lod0.glb'),null);
 assert.equal(n.natureParts('/x/pine-impostor-atlas-v1.png'),null);
 assert.equal(n.natureParts('/a/tree_small_02-lod1.glb'),n.natureParts('/b/tree_small_02-lod1.glb'),'같은 id·LOD는 공유');
});

test('카툰 나무: 밑동이 지면(y=0), 크기는 원래 카드 크기, 단계별 삼각형 상한(성능)', ()=>{
 const n=nature();
 // 먼 단계(2)는 겨울 잔가지(덩어리 2개 × 3가닥·한 갈래 + 가지 2개, 약 90삼각형)를 더해 260.
 // LOD가 나무 묶음 단위라 휴대폰에서는 가까운 나무도 먼 단계로 보여, 잔가지가 적으면 겨울 나무가 막대처럼 보였다.
 const budget=[3200,800,260];
 for(const id of TOON_NATURE_IDS.species)for(const lod of [0,1,2]){
  const g=n.natureParts(`${id}-lod${lod}.glb`)[0].geometry;g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.min.y)<.08,`${id} lod${lod} 밑동 ${g.boundingBox.min.y}`);
  assert.ok(tris(g)<=budget[lod],`${id} lod${lod} 삼각형 ${tris(g)}`);
  for(const a of ['position','normal','color','toonSway'])assert.ok(g.attributes[a],`${id} ${a}`);
 }
 const broad=n.natureParts('tree_small_02-lod0.glb')[0].geometry.boundingBox,size=broad.getSize(new THREE.Vector3());
 // 우산형: 수관 너비 ÷ 높이 0.75~1.2(기준값 §2-1)
 assert.ok(size.x/size.y>.75&&size.x/size.y<1.25,`활엽수 너비/높이 ${size.x/size.y}`);
 assert.ok(size.y>8&&size.y<11);
 // 줄기 아래는 흔들리지 않고 꼭대기는 흔들린다.
 const g=n.natureParts('island_tree_01-lod0.glb')[0].geometry,p=g.attributes.position,s=g.attributes.toonSway;
 let low=0,high=0;for(let i=0;i<p.count;i++){if(p.getY(i)<.5)low=Math.max(low,s.getX(i));else if(p.getY(i)>8)high=Math.max(high,s.getX(i));}
 assert.ok(low<.01&&high>.2,`흔들림 밑동 ${low} 꼭대기 ${high}`);
});

test('카툰 바위: 원래 범위 안의 둥근 암괴 덩어리(삼각형 적음)', ()=>{
 for(const id of TOON_NATURE_IDS.rocks){
  const g=rockGeometry(id);g.computeBoundingBox();const b=g.boundingBox;
  assert.ok(tris(g)<=250,`${id} ${tris(g)}`);// 덩어리당 정이십면체 1단(80)
  assert.ok(b.min.y<0&&b.min.y>-b.max.y*.12,`${id} 바닥이 지면 아래로 살짝 묻힘`);
 }
 assert.equal(rockGeometry('nope'),null);
});

test('카툰 재질 셰이더: 바람 흔들림·꽃·이끼, 템플릿 잔여 없음', ()=>{
 const n=nature();
 const f=compile(n.materials.foliage);assert.match(f.vertexShader,/toonSway/);assert.match(f.vertexShader,/gust/);assert.ok(f.uniforms.foliageTime&&f.uniforms.toonWindDir);
 const gr=compile(n.materials.grass);assert.match(gr.vertexShader,/toonFlower/);assert.match(gr.fragmentShader,/normal=normalize\(vNormal\)/,'양면 풀잎 뒷면도 위 법선');
 const field=compile(n.materials.grassField);assert.match(field.vertexShader,/tgFieldRadius/);assert.doesNotMatch(gr.vertexShader,/tgFieldRadius\*\.6/);
 const rock=compile(n.materials.rock),cliff=compile(n.materials.cliff);
 assert.match(rock.fragmentShader,/moss/);assert.match(cliff.fragmentShader,/moss/);assert.doesNotMatch(cliff.fragmentShader,/layer=fract/,'절벽 가로 층 띠 없음(재판정: 큰 평면 띠로 읽혔다)');
 for(const s of [f,gr,field,rock,cliff])for(const src of [s.vertexShader,s.fragmentShader])assert.doesNotMatch(src,/\$\{/);
 assert.notEqual(n.materials.grass.customProgramCacheKey(),n.materials.grassField.customProgramCacheKey());
});

test('하층 식생 교체: 길가 풀·관목·낙엽·숲 풀잎·덤불층을 카툰 풀 다발·덤불로, 다른 메시는 그대로', ()=>{
 const n=nature(),geo=new THREE.BufferGeometry();
 const make=(key,extra={})=>{const m=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,...extra});if(key)m.customProgramCacheKey=()=>key;const mesh=new THREE.InstancedMesh(geo,m,2);mesh.userData.metricKind='하층 식생';return mesh;};
 const cases=[['roadside-grass-wind-v1','grass'],['roadside-shrub-wind-v1','tall'],['forest-blades-wind-v3-understory','forest'],['shrub-layer-wind-v2-rim','shrub'],[null,'short']];
 for(const [key,kind] of cases){const mesh=make(key);assert.equal(n.swapGroundCover(mesh),true,kind);assert.equal(mesh.userData.toonGroundCover,kind);assert.equal(n.swapGroundCover(mesh),false,'두 번 바꾸지 않는다');}
 const other=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({map:new THREE.Texture()}),1);
 assert.equal(n.swapGroundCover(other),false);
 assert.equal(n.swapGroundCover(new THREE.Mesh(geo,new THREE.MeshStandardMaterial())),false);
});

test('낮 화면: 외곽선 0(패스 꺼짐), 지형은 부드러운 3단 음영', ()=>{
 assert.equal(outlineFor({elevation:40,night:0}).strength,0);
 assert.ok(outlineFor({elevation:-20,night:1}).strength>.9,'밤 외곽선은 5단계에서 정한다(지금은 유지)');
 const t=createToonMaterials({gradientMap:createGradientMap()}).materialFactory.terrain();
 assert.deepEqual(t.gradientMap.userData.levels,TOON.terrainGradient);
});
