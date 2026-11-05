import {maskCoveredBaseGeometry} from '../../src/terrain-base-mask.js';
import {createEntrance,clearEntranceEntries,createEntranceGround} from './entrance-scenery.js';
import {SPECIMEN_TREES,PLAZA_FACILITIES,plazaFootprint} from './entrance-plaza.js';
import {createSectionScenery,scenerySites,clearSceneryPlacements} from './section-scenery.js';
import {createInteractionProps} from './interaction-sites.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {gridHeight,nearestRoute,indexRoute,cutHeight,project,mix} from './geo.js';
import {LOOK_PROFILE} from '../../src/look-profile.js';
import {applyAtmosphere} from './skyline-reference.js';
import {grassClumps,updateGroundCover} from './near-detail.js';
import {waterClearance} from './water-clearance.js';
import {instanceGeometry} from './instance-geometry.js';
import {twigCutout} from './foliage-material.js';
import {patchFoliage,foliageUniforms} from './foliage-shader.js';
import {createNearTrees,NEAR_TREE_IDS} from './near-trees.js';
import {surfaceIndex} from './surface-index.js';
import {stairTerrainClearance} from './terrain-clearance.js';
import {createStairBase,stairGapReport} from './stair-base.js';
import {indexStaticRaycast} from '../../src/static-raycast.js';
import {chunkBounds,createChunkCuller,boxDistanceSquared} from '../../src/chunk-culling.js';
import {createCityGrid,seoulRoadGeometry,createSeoulLandmark,bindSeoulLabels} from '../../src/city-grid.js';
import {seoulWaterMaterial,seoulBridgeStructure,seoulRoadLights} from '../../src/city-water.js';
import {freezeStatic,applyNatureQuality} from '../../src/static-scene.js';
import {pineImpostorParts} from '../../src/pine-impostor.js';
import {assignSurfaceRoute,isStairSurface} from '../../src/route-surfaces.js';
import {createSummitFacilities,facilityTriangleCounts} from './summit-facilities.js';
import {createDeckRailings} from './deck-railing.js';
import {facilitySites,facilityGround} from './summit-config.js';
import {createContactOcclusion} from '../../src/contact-occlusion.js';
import {contactFootprint,placedContact,instanceContactMatrix,seatContactInstance,contactGroundError} from '../../src/contact-footprint.js';
import {createChunkStreamer} from '../../src/chunk-stream.js';

async function readJSON(url){const r=await fetch(url);if(!r.ok)throw new Error(`자료 없음 (${r.status}): ${url}`);return r.json();}
async function readGrid(base,meta){
  const r=await fetch(base+meta.file);if(!r.ok)throw new Error(`DEM 격자 없음: ${meta.file}`);
  const b=await r.arrayBuffer();if(b.byteLength!==meta.width*meta.height*4)throw new Error('DEM 크기 불일치');
  const view=new DataView(b),values=new Float32Array(meta.width*meta.height);
  for(let i=0;i<values.length;i++)values[i]=view.getFloat32(i*4,true);
  return {...meta,values};
}
const within=(g,x,z)=>x>=g.x0&&z>=g.z0&&x<=g.x0+(g.width-1)*g.spacing&&z<=g.z0+(g.height-1)*g.spacing;
function seeded(seed){let v=seed>>>0;return()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}

// 같은 좌표 변환으로 albedo/normal/roughness를 섞어 반복 대비를 낮춘다.
// 회전 없이 서로 다른 스케일·위상으로 섞어 tangent normal 방향 오류를 피한다.
function deTile(material,metres){
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gWorld;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ngWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 gWorld;
      float gWeight(){return smoothstep(-.8,.8,sin(gWorld.x*.061)+sin(gWorld.z*.047));}
      vec4 gSample(sampler2D tex,vec2 uv){return mix(texture2D(tex,uv),texture2D(tex,uv*0.731+vec2(.37,.61)),gWeight());}
    `);
    for(const marker of ['map_fragment','roughnessmap_fragment','normal_fragment_maps']){
      const source=THREE.ShaderChunk[marker].replace(/texture2D\(\s*(map|normalMap|roughnessMap)\s*,\s*(vMapUv|vNormalMapUv|vRoughnessMapUv)\s*\)/g,'gSample( $1, $2 )');
      shader.fragmentShader=shader.fragmentShader.replace(`#include <${marker}>`,source);
    }
  };
  material.customProgramCacheKey=()=>`gwanak-detile-v1-${metres}`;
  return material;
}
async function loadMaterials(base,manifest){
  const loader=new THREE.TextureLoader(),materials={};
  for(const [key,m] of Object.entries(manifest.materials)){
    const [map,normalMap,roughnessMap]=await Promise.all([m.diff,m.nor_gl,m.rough].map(file=>loader.loadAsync(base+file)));
    map.colorSpace=THREE.SRGBColorSpace;
    for(const t of [map,normalMap,roughnessMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;}
    materials[key]=applyAtmosphere(deTile(new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,roughness:1,normalScale:new THREE.Vector2(.7,.7)}),m.metres),manifest.atmosphere);
  }
  return materials;
}
export function gridMesh(x0,z0,size,step,height,material,metres){
  const count=Math.max(1,Math.ceil(size/step)),positions=[],uv=[],indices=[];
  for(let j=0;j<=count;j++)for(let i=0;i<=count;i++){
    const x=x0+i*size/count,z=z0+j*size/count;
    positions.push(x,height(x,z),z);uv.push(x/metres,z/metres);
  }
  for(let j=0;j<count;j++)for(let i=0;i<count;i++){
    const a=j*(count+1)+i,b=a+1,c=a+count+1,d=c+1;indices.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;return mesh;
}
// 직사각형 2m 지형 조각(청크 스트리밍). gridMesh(64m)와 같은 꼭짓점·삼각형 배열이라 인접 조각과 경계가 맞물린다.
export function terrainTile(x0,z0,sizeX,sizeZ,height,material,step=2){
  const nx=Math.max(1,Math.round(sizeX/step)),nz=Math.max(1,Math.round(sizeZ/step)),positions=new Float32Array((nx+1)*(nz+1)*3),uv=new Float32Array((nx+1)*(nz+1)*2),indices=[];
  for(let j=0,k=0;j<=nz;j++)for(let i=0;i<=nx;i++,k++){const x=x0+i*sizeX/nx,z=z0+j*sizeZ/nz;positions.set([x,height(x,z),z],k*3);uv.set([x,z],k*2);}
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;return mesh;
}
// 계단이 아닌 두 노면이 바뀌는 곳은 뒤 노면을 앞 노면 위로 1.6m 겹쳐 깔고(4mm 위) 노이즈 마스크로 서서히 드러낸다.
export const SURFACE_OVERLAP_METRES=1.6;
const SURFACE_OVERLAP_LIFT=.004;
export function ribbon(route,material,metres){
 const group=new THREE.Group();let start=0;for(let i=1;i<route.length;i++)if(route[i].s-route[start].s>=100||route[i].material!==route[start].material||i===route.length-1){
  const kind=route[start].material,selected=material.isMaterial?material:material[kind];let from=start;
  const blend=start>0&&route[start-1].material!==kind&&!isStairSurface(kind)&&!isStairSurface(route[start-1].material);
  if(blend)while(from>0&&route[start].s-route[from-1].s<=SURFACE_OVERLAP_METRES+1e-6)from--;
  group.add(ribbonPart(route.slice(from,i+1),selected,metres,kind,blend?route[start].s:-Infinity));start=i;
 }return group;
}
function ribbonPart(route,material,metres,kind=route[0].material,entryS=-Infinity){
  if(isStairSurface(kind))return stairRibbonPart(route,material,metres);
  const positions=[],uv=[],indices=[],edges=[],entries=[];
  for(let i=0;i<route.length;i++){
    const p=route[i],a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)];
    const n=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=p.nx??-(b.z-a.z)/n,nz=p.nz??(b.x-a.x)/n;
    const entry=Math.min(1,Math.max(0,1-(entryS-p.s)/SURFACE_OVERLAP_METRES)),y=p.y+.015+(entry<1?SURFACE_OVERLAP_LIFT:0);
    for(const side of [-1,1]){positions.push(p.x+nx*p.width/2*side,y,p.z+nz*p.width/2*side);uv.push(side*p.width/2/metres,p.s/metres);edges.push(side);entries.push(entry);}
    if(i<route.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('trailEdge',new THREE.Float32BufferAttribute(edges,1));g.setAttribute('trailEntry',new THREE.Float32BufferAttribute(entries,1));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();
  return new THREE.Mesh(g,material);
}
// 추정 디딤판. 수평 폭 최대 30cm·단차 최대 18cm로 실제 경사에 맞추며 GPX는 바꾸지 않는다.
function stairRibbonPart(route,material,metres){
 const positions=[],uv=[],edges=[],indices=[];
 const edge=(p,side,y)=>[p.x+p.nx*p.width/2*side,y,p.z+p.nz*p.width/2*side];
 const quad=(vertices,s0,s1)=>{
  const n=positions.length/3;
  vertices.forEach((v,i)=>{positions.push(...v);edges.push(i%2?1:-1);uv.push((i%2?1:-1)*route[0].width/(2*metres),(i<2?s0:s1)/metres);});
  indices.push(n,n+1,n+2,n+1,n+3,n+2);
 };
 for(let i=0;i<route.length-1;i++){
  const a=route[i],b=route[i+1],y=Math.max(a.y,b.y)+.015;
  quad([edge(a,-1,y),edge(a,1,y),edge(b,-1,y),edge(b,1,y)],a.s,b.s);
  const next=i+2<route.length?Math.max(b.y,route[i+2].y)+.015:b.y+.015;
  // 챌면의 세로 UV는 단 높이만큼 진행시켜 질감이 한 줄로 늘어나지 않게 한다.
  quad([edge(b,-1,y),edge(b,1,y),edge(b,-1,next),edge(b,1,next)],b.s,b.s+Math.abs(next-y));
  if(i===0)quad([edge(a,-1,a.y+.015),edge(a,1,a.y+.015),edge(a,-1,y),edge(a,1,y)],a.s,a.s+Math.abs(y-a.y-.015));
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('trailEdge',new THREE.Float32BufferAttribute(edges,1));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
 return new THREE.Mesh(geometry,material);
}
function disposeGeometry(object){object.traverse(o=>{if(o.geometry)o.geometry.dispose();});object.removeFromParent();}

/** 준비된 generated/만 읽는다. 자료가 없으면 합성 지형으로 대체하지 않고 오류를 반환한다.
 * 원경 다운로드는 streamFar()를 호출할 때 시작한다. scene/render 설정은 호출자가 소유한다.
 */
/** style·materialFactory(기획서 §2.3): materialFactory가 있으면(카툰) PBR 텍스처·HDR을 받지 않고 그 재질을 쓴다.
 * toon={toonify,patchFoliage,styleCity}는 카툰 모듈이 주는 GLB·도시 변환 함수다. 실사는 둘 다 넘기지 않는다.
 * 지형·식생은 chunkBase(assets/shared/chunks/)의 200m 청크 목록으로 카메라 주변만 붙이고 멀어지면 해제한다.
 */
export async function loadLandscape({base='/assets/realistic/generated/',maxContactMapSize=8192,style='realistic',materialFactory=null,toon=null,chunkBase=null,terrainRadius=1,vegetationRadius=5}={}){
  if(!base.endsWith('/'))base+='/';
  chunkBase??=base.replace(/realistic\/generated\/$/,'shared/chunks/');if(!chunkBase.endsWith('/'))chunkBase+='/';
  const toonMode=!!materialFactory;
  let manifest;
  try{manifest=await readJSON(base+'manifest.json');}catch{manifest=await readJSON(base+'inventory.json');}
  manifest.atmosphere={...manifest.atmosphere,haze:LOOK_PROFILE.haze,contrastStops:[[0,1],[2000,.95],[5000,.82],[8000,.68],[12000,.55],[15000,.46],[25000,.25],[40000,.08]]};
  const status={style:toonMode?'toon':style,source:manifest.inventoryFallback?'파일 목록':'manifest',cityChunks:0,buildings:0,waterPolygons:0,errors:[],ready:false};
  if(manifest.version!==1)throw new Error('미지원 자산 버전');
  if(!manifest.observation||!manifest.atmosphere||!manifest.directionCaptures)throw new Error('서울 원경 기준 갱신 후 prepare.mjs 재실행 필요');
  // 실사 전용 셰이더(terrain-material.js)와 HDR 로더는 카툰 번들에 들어가지 않게 동적으로 불러온다.
  const [near,routeSource,materials,sky,chunkIndex,shaders]=await Promise.all([
    readGrid(base,manifest.near),readJSON(base+manifest.route),
    toonMode?{...materialFactory.materials()}:loadMaterials(base,manifest),
    toonMode?null:import('three/addons/loaders/RGBELoader.js').then(({RGBELoader})=>new RGBELoader().setDataType(THREE.FloatType).loadAsync(base+manifest.hdri)),
    readJSON(chunkBase+'index.json'),
    toonMode?null:import('./terrain-material.js')
  ]);
  if(chunkIndex.schemaVersion!==1||chunkIndex.chunkSize!==200)throw new Error('미지원 청크 목록');
  const route=assignSurfaceRoute(routeSource);
  if(sky)sky.mapping=THREE.EquirectangularReflectionMapping;
  const group=new THREE.Group();group.name='GwanakRealistic';
  const terrain=new THREE.Group();terrain.name='NearTerrain';group.add(terrain);
  terrain.userData.metricKind='지형 청크';
  const blended=toonMode?materialFactory.terrain():shaders.terrainMaterial(materials,manifest.materials);
  // 청크를 해제해도 공용 재질은 남긴다(disposeObject3D가 userData.shared를 건너뛴다).
  blended.userData.shared=true;
  const contactOcclusion=createContactOcclusion(near,{route,maxMapSize:maxContactMapSize,enabled:new URLSearchParams(location.search).get('contactAO')!=='off'});
  contactOcclusion.apply(blended);status.contactOcclusion=contactOcclusion.status;
  // 폭 안쪽과 어깨를 수평화하며 24m에 걸쳐 DSM으로 복귀한다.
  let paved,stoneStairs,woodStairs,pathMaterials;
  if(toonMode){({paved,stoneStairs,woodStairs}=materials);pathMaterials=materialFactory.pathMaterials();}
  else{
  paved=shaders.pavedMaterial(materials,manifest.materials);
  stoneStairs=materials.stone.clone();woodStairs=materials.wood.clone();stoneStairs.side=woodStairs.side=THREE.DoubleSide;
  for(const [copy,source]of [[stoneStairs,materials.stone],[woodStairs,materials.wood]]){copy.onBeforeCompile=source.onBeforeCompile;copy.customProgramCacheKey=source.customProgramCacheKey;}
  Object.assign(materials,{paved,stoneStairs,woodStairs});
  // 돌길·암릉도 가장자리를 주변 지형 색으로 맞추고 노이즈 마스크로 녹인다(직선 경계 방지).
  pathMaterials={soil:shaders.trailMaterial(materials,manifest.materials),rock:shaders.rockTrailMaterial(materials,manifest.materials,'stone'),paved,stairs:stoneStairs,deck_stairs:woodStairs,ridge:shaders.rockTrailMaterial(materials,manifest.materials,'granite')};
  }
  // 노면·계단 재질은 접촉 음영에서 제외한다. 아래 지형도 지도에서 경로 폭을 보호한다.
  const pathPoints=densifyRoute(route);
  const path=ribbon(pathPoints,pathMaterials,manifest.materials.soil.metres);path.name='등산로 노면';group.add(path);
  path.traverse(mesh=>{if(mesh.isMesh)indexStaticRaycast(mesh);});
  path.userData.metricKind='등산로';
  const deckRailings=createDeckRailings(pathPoints);group.add(deckRailings);status.deckRailings=deckRailings.userData.counts;
  const chunks=new Map();let far,farGroup,farPromise,waterGroup,disposed=false;
  const rawHeight=(x,z)=>gridHeight(within(near,x,z)?near:far||near,x,z);
  const nearest=indexRoute(route);
  let summitSites=[],sectionSites=[],groundSites=[];const entranceGround=createEntranceGround(route);
  const floorHeight=(x,z)=>{
    const hit=nearest(x,z),a=route[hit.index],b=route[hit.index+1];
    const correction=mix(a.elevationCorrection??0,b.elevationCorrection??0,hit.t)*Math.exp(-((hit.distance/300)**2));
    return facilityGround(groundSites,x,z,entranceGround(x,z,cutHeight(rawHeight(x,z)+correction,hit)));
  };
  const roadRay=new THREE.Raycaster();path.updateMatrixWorld(true);
  const roadHeight=surfaceIndex(path);
  // 2m 지형 삼각형이 노면 띠를 뚫고 올라와 노면과 직선으로 교차하는 것을 막는다(정상 암릉처럼 굽은 급경사에서 노면이 가로로 기울어 최대 8cm).
  // 노면 회랑의 지형 꼭짓점을 경로 중심 높이 대신 가장 가까운 노면 높이-여유(2~12cm)에 맞추고, 어깨(폭/2+2m)부터 6m에 걸쳐 원래 높이로 되돌린다.
  // 노면 안쪽은 노면보다 높지 않게 자른다. floorHeight(시설·보행 기준)는 그대로이며, 바위 접지(rockGround)도 이 함수를 쓴다. 계단은 clearStairs가 따로 비운다.
  const chunkHeight=(x,z)=>{
    const h=floorHeight(x,z),hit=nearest(x,z),a=route[hit.index],b=route[hit.index+1];
    if(!a||!b||hit.distance>hit.width/2+8||isStairSurface(a.material)||isStairSurface(b.material))return h;
    const cx=mix(a.x,b.x,hit.t),cz=mix(a.z,b.z,hit.t),reach=Math.min(1,(hit.width/2-.05)/Math.max(hit.distance,1e-6));
    const road=roadHeight(cx+(x-cx)*reach,cz+(z-cz)*reach,h+10,20);if(!Number.isFinite(road))return h;
    // 급경사 곡선에서는 2m 삼각형의 직선 보간 오차가 커지므로 경사에 비례해 여유를 늘린다(평지 2cm, 60% 경사 약 8cm).
    const grade=Math.abs(b.y-a.y)/(Math.hypot(b.x-a.x,b.z-a.z)||1),margin=.02+.1*Math.min(1,grade);
    const shoulder=Math.max(0,Math.min(1,(hit.distance-hit.width/2-2)/6)),fade=1-shoulder*shoulder*(3-2*shoulder);
    const follow=h+(road-margin-hit.y)*fade;
    return hit.distance<=hit.width/2?Math.min(follow,road-margin):follow;
  };
  // 노면 밖은 화면에 보이는 지형(chunkHeight)과 같은 높이를 쓴다.
  const surfaceHeight=(x,z)=>{const h=floorHeight(x,z);return roadHeight(x,z,h+10,20)??chunkHeight(x,z);};
  summitSites=facilitySites(route,floorHeight);groundSites=summitSites;
  sectionSites=scenerySites(route,floorHeight);groundSites=[...summitSites,...sectionSites];
  const facilities=createSummitFacilities(route,floorHeight,summitSites);group.add(facilities.group);
  const entrance=createEntrance(route,floorHeight),sectionScenery=createSectionScenery(route,floorHeight);group.add(entrance.group,sectionScenery.group);
  // 상호작용 소품(스탬프함·안내판·약수터·돌탑, 동물 자리). 배치는 interaction-sites.js. ?animals=preview면 동물 자리를 보인다.
  const summitFrame=id=>{const s=summitSites.find(site=>site.id===id);return s&&{x:s.x,z:s.z,yaw:s.yaw};};
  const interactionProps=createInteractionProps(route,surfaceHeight,{frames:{gate:entrance.frame,marker:summitFrame('marker'),eungjinjeon:summitFrame('eungjinjeon')},avoid:[...summitSites,...sectionSites],previewAnimals:new URLSearchParams(location.search).get('animals')==='preview'});
  group.add(interactionProps.group);const natureClearSites=[...sectionSites,...interactionProps.clearSites];
  status.interactionProps={sites:interactionProps.sites,spawns:interactionProps.spawns,clearSites:interactionProps.clearSites,stats:interactionProps.stats()};
  status.entrance={frame:entrance.frame,counts:facilityTriangleCounts(entrance.items),status:'입구 설정의 일주문 가설 위치 · 현장 실측 전 · 치수·현판 색 미확인'};
  // 200m 청크 칸(기획서 §2.4). 청크 id는 index.json의 'i_j'.
  const CHUNK=chunkIndex.chunkSize,chunkOrigin=chunkIndex.origin,chunkById=new Map(chunkIndex.chunks.map(c=>[c.id,c]));
  const chunkCell=(x,z)=>[Math.floor((x-chunkOrigin.x0)/CHUNK),Math.floor((z-chunkOrigin.z0)/CHUNK)];
  const chunkIdAt=(x,z)=>{const [i,j]=chunkCell(x,z);return `${Math.max(0,Math.min(chunkIndex.cols-1,i))}_${Math.max(0,Math.min(chunkIndex.rows-1,j))}`;};
  // 광장 준비 상태: 바닥·시설(동기 생성), 가까운 나무(숲 로드 중 addInstances), 광장 아래 200m 지형 청크(update에서 한 프레임에 하나).
  // 로딩 화면은 status.entrancePlaza.ready 또는 entranceReady()(Promise)로 기다린다. 규약: docs/이동-휴식-통합규약.md.
  const plazaChunkKeys=(()=>{const keys=new Set(),f=entrance.frame,c=Math.cos(f.yaw),sn=Math.sin(f.yaw);for(let gz=-26;gz<=44;gz+=2)for(let gx=-14;gx<=14;gx+=2){if(!plazaFootprint(gx,gz,2))continue;const x=f.x+gx*c+gz*sn,z=f.z-gx*sn+gz*c;if(within(near,x,z))keys.add(chunkIdAt(x,z));}return [...keys];})();
  const terrainAttached=new Set();
  let resolvePlaza;const plazaReady=new Promise(r=>resolvePlaza=r);
  status.entrancePlaza={ground:true,facilities:PLAZA_FACILITIES.length,textures:entrance.ground.userData.textures,nearTrees:{expected:SPECIMEN_TREES.length,loaded:0},terrainChunks:{expected:plazaChunkKeys.length,loaded:0},ready:false};
  const checkPlaza=()=>{const p=status.entrancePlaza;if(p.ready)return;p.terrainChunks.loaded=plazaChunkKeys.filter(k=>terrainAttached.has(k)).length;if(p.nearTrees.loaded>=p.nearTrees.expected&&p.terrainChunks.loaded>=p.terrainChunks.expected){p.ready=true;resolvePlaza({...p});}};
  status.sectionScenery={sites:sectionSites,counts:facilityTriangleCounts(sectionScenery.items)};
  status.summitFacilities={status:'추정 위치·치수',sites:summitSites,counts:facilityTriangleCounts(facilities.items)};
  // 근경 전체를 유지한다. 보행 주변의 2m 격자는 이 바닥 위에 정밀하게 덧댄다.
  const clearStairs=stairTerrainClearance(pathPoints);
  const baseGeometries=[8,4,2].map(stride=>clearStairs(rectangularGrid(near,(x,z)=>floorHeight(x,z)-.09,stride)));
  const baseMesh=new THREE.Mesh(baseGeometries[2],blended);baseMesh.receiveShadow=true;baseMesh.name='NearDEM8m';baseMesh.userData.metricKind='8m 상시 지형';group.add(baseMesh);
  // 배치 전에 동일한 64m/2m 삼각형과 계단 회랑 보정을 조회한다.
  // 청크가 아직 스트리밍되지 않아도 최종 근경 지형과 같은 높이를 얻는다.
  const rockTerrainIndices=new Map();
  function rockGround(x,z,radius=0,nearDetail=false,cleared=true){
    const hit=nearest(x,z);
    if(!nearDetail&&(!isStairSurface(route[hit.index].material)||hit.distance>hit.width/2+8+radius))return undefined;
    const cx=Math.floor(x/64)*64,cz=Math.floor(z/64)*64,key=`${cx},${cz},${cleared}`;
    if(!rockTerrainIndices.has(key)){
      const mesh=gridMesh(cx,cz,64,2,chunkHeight,blended,1);if(cleared)clearStairs(mesh.geometry);
      if(rockTerrainIndices.size>=8)rockTerrainIndices.delete(rockTerrainIndices.keys().next().value);
      rockTerrainIndices.set(key,surfaceIndex(mesh));mesh.geometry.dispose();
    }
    return rockTerrainIndices.get(key)(x,z);
  }
  // 계단 몸체(측벽·끝면): 디딤판 아래를 최종 2m 지형(계단 회랑 보정 후)까지 채워 떠 보이지 않게 한다. 돌계단은 돌, 나무계단은 흙 측벽.
  // 걷는 면(노면 띠)과 충돌 대상은 그대로다. 검사: stairBaseCheck() — 측벽 아래 틈 0.05m 이하, 지형이 디딤판을 뚫지 않음.
  const soilSide=materials.soil.clone();soilSide.side=THREE.DoubleSide;soilSide.onBeforeCompile=materials.soil.onBeforeCompile;soilSide.customProgramCacheKey=materials.soil.customProgramCacheKey;
  const stairGround=(x,z)=>rockGround(x,z,0,true,true);
  const stairBase=createStairBase(pathPoints,stairGround,{stairs:stoneStairs,deck_stairs:soilSide},1);group.add(stairBase.group);
  status.stairBase=stairBase.group.userData.counts;
  const culler=createChunkCuller(),bounds=new WeakMap();
  const boundsOf=o=>{if(!bounds.has(o))bounds.set(o,chunkBounds(o));return bounds.get(o);};
  let natureQuality=2;
  // ── 지형 200m 청크 스트리밍 ──
  // 청크 파일(terrain/{i}_{j}.f32)은 near 격자 표본 그대로다. 메시는 기존과 같은 높이 함수(chunkHeight: 노면 회랑·계단 보정)로 2m 간격을 만들고,
  // 보행·배치용 높이 조회는 near 격자 전역 색인을 그대로 쓴다(기획서 §3). 컬링 단위는 50m 조각(청크당 최대 16개).
  const TERRAIN_TILE=50,coveredCells=new Set(),alignedChunks=chunkOrigin.x0%CHUNK===0&&chunkOrigin.z0%CHUNK===0;
  status.terrainChunkFiles={checked:0,mismatched:0};
  const maskBase=()=>{if(alignedChunks)for(const geometry of baseGeometries)maskCoveredBaseGeometry(geometry,coveredCells,CHUNK);};
  const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
  const aborted=()=>Object.assign(new Error('청크 취소'),{name:'AbortError'});
  async function loadTerrainChunk(chunk,signal){
    const response=await fetch(chunkBase+chunk.files.terrain,{signal});if(!response.ok)throw new Error(`지형 청크 없음 (${response.status}): ${chunk.id}`);
    const bytes=await response.arrayBuffer(),w=chunk.counts.terrainWidth,h=chunk.counts.terrainHeight,spacing=chunkIndex.spacing;
    if(bytes.byteLength!==w*h*4)throw new Error(`지형 청크 크기 불일치: ${chunk.id}`);
    // 파일이 near 격자와 같은 자료인지 네 모서리로 확인한다(다르면 상태에만 남긴다: 화면 높이는 near 격자 기준).
    const view=new DataView(bytes);status.terrainChunkFiles.checked++;
    if([[0,0],[w-1,0],[0,h-1],[w-1,h-1]].some(([i,j])=>Math.abs(view.getFloat32((j*w+i)*4,true)-gridHeight(near,chunk.x0+i*spacing,chunk.z0+j*spacing))>.01))status.terrainChunkFiles.mismatched++;
    const sizeX=(w-1)*spacing,sizeZ=(h-1)*spacing,holder=new THREE.Group();holder.name=`지형 청크 ${chunk.id}`;
    for(let z=0;z<sizeZ;z+=TERRAIN_TILE)for(let x=0;x<sizeX;x+=TERRAIN_TILE){
      if(signal.aborted)throw aborted();
      const mesh=terrainTile(chunk.x0+x,chunk.z0+z,Math.min(TERRAIN_TILE,sizeX-x),Math.min(TERRAIN_TILE,sizeZ-z),chunkHeight,blended);
      clearStairs(mesh.geometry);indexStaticRaycast(mesh);mesh.name=`${chunk.id}/${holder.children.length}`;holder.add(mesh);
      await yieldFrame();
    }
    if(signal.aborted)throw aborted();
    return holder.children.length?holder:null;
  }
  const terrainStream=createChunkStreamer({chunks:chunkIndex.chunks,chunkSize:CHUNK,radius:terrainRadius,load:loadTerrainChunk,
    attach(holder,chunk){terrain.add(holder);freezeStatic(holder);for(const mesh of holder.children)chunks.set(mesh.name,mesh);terrainAttached.add(chunk.id);coveredCells.add(`${Math.floor(chunk.x0/CHUNK)},${Math.floor(chunk.z0/CHUNK)}`);maskBase();checkPlaza();},
    detach(holder,chunk){for(const mesh of holder.children)chunks.delete(mesh.name);terrainAttached.delete(chunk.id);coveredCells.delete(`${Math.floor(chunk.x0/CHUNK)},${Math.floor(chunk.z0/CHUNK)}`);maskBase();}});
  // ── 식생 200m 청크 스트리밍 ──
  // 배치 목록(숲 혼합·색·구조 보정 결과)은 registerVegetation으로 한 번 받고, 청크마다 LOD 인스턴스를 만들어 붙인다.
  // 반경 밖으로 나간 청크는 InstancedMesh·사진판 판을 해제한다(GLB 공용 geometry·재질은 userData.shared로 남는다).
  // 기본 반경 5칸(최소 1,000m)은 나무 최대 표시 거리 950m를 덮는다. 쌍안경 배율에서는 1,000m 밖 나무가 빠진다.
  const vegetationEntries=new Map();let vegetationStream=null,contactDirty=false,contactCommitted=false,contactCommitAt=0;
  async function loadVegetationChunk(chunk,signal){
    const entries=vegetationEntries.get(chunk.id);if(!entries?.length)return null;
    const holder=new THREE.Group();holder.name=`식생 청크 ${chunk.id}`;holder.userData.metricKind='숲';
    let slice=performance.now();
    try{
      for(const entry of entries){
        if(signal.aborted)throw aborted();
        const lod=await buildNature(entry);if(lod?.levels.length)holder.add(lod);
        if(performance.now()-slice>=4){await yieldFrame();slice=performance.now();}
      }
      if(signal.aborted)throw aborted();
    }catch(e){for(const lod of holder.children)nearTrees.unregister?.(lod);throw e;}
    return holder.children.length?holder:null;
  }
  function attachVegetation(holder,chunk){
    group.add(holder);freezeStatic(holder);
    const bucket={root:holder,items:[],box:new THREE.Box3(),maxDistance:0};
    for(const lod of holder.children)attachNature(lod,bucket);
    natureBuckets.set(chunk.id,bucket);
  }
  function detachVegetation(holder,chunk){
    natureBuckets.delete(chunk.id);const gone=new Set(holder.children);
    for(const lod of gone)nearTrees.unregister?.(lod);
    for(let i=vegetation.length-1;i>=0;i--)if(gone.has(vegetation[i]))vegetation.splice(i,1);
  }
  function registerVegetation(entries){
    if(vegetationStream)throw new Error('식생은 한 번만 등록합니다');
    for(const entry of entries){
      const ps=entry.placements;if(!ps?.length)continue;
      let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const p of ps){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);}
      const id=chunkIdAt((x0+x1)/2,(z0+z1)/2);if(!vegetationEntries.has(id))vegetationEntries.set(id,[]);vegetationEntries.get(id).push(entry);
    }
    vegetationStream=createChunkStreamer({chunks:chunkIndex.chunks.filter(c=>vegetationEntries.has(c.id)),chunkSize:CHUNK,radius:vegetationRadius,load:loadVegetationChunk,attach:attachVegetation,detach:detachVegetation});
    status.vegetationEntries=entries.length;status.vegetationChunkCount=vegetationEntries.size;
    return vegetationEntries.size;
  }
  // 프레임 루프 밖에서도 청크를 붙인다(스트리머는 update 한 번에 하나씩 붙인다). onProgress(붙은 수/대상 수).
  async function pump(stream,position,onProgress=()=>{}){
    if(!stream)return;
    const p={x:position.x??position[0],z:position.z??position[2]};let done=false;
    const ready=stream.ready(p).then(()=>{done=true;});
    const [ci,cj]=chunkCell(p.x,p.z),radius=stream===terrainStream?terrainRadius:vegetationRadius;
    const targets=(stream===terrainStream?chunkIndex.chunks:chunkIndex.chunks.filter(c=>vegetationEntries.has(c.id))).filter(c=>Math.max(Math.abs(c.i-ci),Math.abs(c.j-cj))<=radius).length||1;
    while(!done&&!disposed){stream.update(p);const s=stream.status();onProgress(Math.min(1,(s.loaded+s.failed)/targets));await yieldFrame();}
    await ready;onProgress(1);
  }
  function update(camera,quality=2){
    if(disposed)return;
    facilities.update(camera);entrance.update(camera);sectionScenery.update(camera);interactionProps.update(camera);
    baseMesh.geometry=baseGeometries[quality];
    // 한 프레임에 지형·식생 청크를 최대 하나씩 붙인다. 대기 중에는 상시 유지되는 NearDEM8m가 바닥을 덮는다.
    terrainStream.update(camera.position);vegetationStream?.update(camera.position);
    if(contactDirty&&contactCommitted&&performance.now()-contactCommitAt>1500){contactDirty=false;contactCommitAt=performance.now();contactOcclusion.commit();}
    checkPlaza();
    {const t=terrainStream.status();status.pendingTerrainChunks=t.pending;status.terrainChunks=t;if(vegetationStream)status.vegetationChunks=vegetationStream.status();}
    culler.update(camera);
    let terrainVisible=0;for(const mesh of chunks.values()){mesh.visible=culler.visible(boundsOf(mesh),camera);if(mesh.visible)terrainVisible++;}
    status.terrainVisibleChunks=terrainVisible;
    if(natureQuality!==quality){natureQuality=quality;for(const lod of vegetation){applyNatureQuality(lod,quality);applyDenseTrees(lod,quality);}}
    foliageUniforms.foliageTime.value=performance.now()/1000;nearTrees.update(camera,quality);status.nearTrees=nearTrees.status;
    const atEntrance=Math.hypot(camera.position.x-route[0].x,camera.position.z-route[0].z)<90;
    // 입구에서는 근경 숲이 사진판으로 뭉개지지 않게 삼각형·호출 예산을 조금 더 준다(fps 실측: 변경기록 2026-11-03 입구광장 화면결함).
    // 쌍안경(camera.zoom>1): 확대된 시야 기준으로 거리 판정을 줄이고, 시야가 좁아진 만큼 예산을 1.5배로 올린다. THREE.LOD는 camera.zoom을 스스로 나눈다.
    const zoom=Math.max(1,camera.zoom||1),zoomBoost=zoom>1.01?1.5:1;
    let visible=0,budget=([60000,120000,300000][quality]+(atEntrance?[30000,90000,120000][quality]:0))*zoomBoost,priorityTriangles=0;const candidates=[];
    // 근경 입체 나무(near-trees.js)가 가까운 나무를 맡으면서 사진판 청크가 삼각형 예산에 걸려 숨던 일이 없어졌다.
    // 먼 청크까지 모두 그리면 호출이 약 1,200회로 늘어나므로 가까운 순서로 화질별 호출 상한을 둔다(이전 실측 약 340회).
    let natureCalls=Math.round((atEntrance?[220,430,700][quality]:[200,300,380][quality])*zoomBoost);
    let natureFrustumTests=0,natureDistanceRejected=0,budgetHidden=0;const levelUse=[];
    for(const bucket of natureBuckets.values()){
      if(boxDistanceSquared(bucket.box,camera.position)>(bucket.maxDistance*zoom)**2){bucket.root.visible=false;natureDistanceRejected++;continue;}
      natureFrustumTests++;const mask=culler.planeMask(bucket.box);bucket.root.visible=mask>=0;if(!bucket.root.visible)continue;
      for(const item of bucket.items){
        const {lod,box,maxDistance}=item;
        lod.visible=culler.visible(box,camera,maxDistance*zoom,mask);
        if(lod.visible){item.distanceSq=lod.position.distanceToSquared(camera.position);candidates.push(item);}
      }
    }
    status.natureBroadPhase={cells:natureBuckets.size,frustumTests:natureFrustumTests,distanceRejected:natureDistanceRejected};
    // 입구 전용 가까운 나무(priority)는 예산과 무관하게 거리 LOD를 지키고 먼저 처리한다. 삼각형은 따로 센다.
    candidates.sort((a,b)=>(b.lod.userData.priority?1:0)-(a.lod.userData.priority?1:0)||a.distanceSq-b.distanceSq);
    for(const {lod,distanceSq} of candidates){
        lod.update(camera);let index=lod.getCurrentLevel();
        if(lod.userData.priority){for(let i=0;i<lod.levels.length;i++)lod.levels[i].object.visible=i===index;priorityTriangles+=lod.levels[index].object.userData.triangles;natureCalls-=lod.levels[index].object.children.length;visible++;continue;}
        while(index<lod.levels.length-1&&(lod.levels[index].object.userData.triangles>budget||lod.levels[index].object.children.length>natureCalls)){
          if(lod.levels[index+1].object.userData.lodSource.representation==='impostor'&&distanceSq<(400*zoom)**2)break;
          index++;
        }
        const triangles=lod.levels[index].object.userData.triangles;
        for(let i=0;i<lod.levels.length;i++)lod.levels[i].object.visible=i===index;
        const calls=lod.levels[index].object.children.length;
        if(triangles>budget||calls>natureCalls){lod.visible=false;budgetHidden++;}else {budget-=triangles;natureCalls-=calls;visible++;levelUse[index]=(levelUse[index]??0)+1;}
    }status.entranceNatureCallBudget=atEntrance?{limit:[220,430,700][quality],remaining:natureCalls,priorityTriangles}:null;status.natureCallBudget={limit:atEntrance?[220,430,700][quality]:[200,300,380][quality],remaining:natureCalls};status.natureVisibleChunks=visible;status.natureBudgetHidden=budgetHidden;status.natureLevelUse=levelUse;status.natureBaseTriangleBudget=[60000,120000,300000][quality];
    city.update(camera,quality,culler);
    for(const mesh of grasses.children){
      const box=boundsOf(mesh),grassZoom=Math.min(zoom,3);updateGroundCover(mesh,box.distanceToPoint(camera.position)/grassZoom,quality);
      mesh.visible=mesh.visible&&culler.visible(box,camera,[28,45,65][quality]*grassZoom);
    }
  }
  const vegetation=[],grasses=new THREE.Group(),natureBuckets=new Map();group.add(grasses);grasses.userData.metricKind='숲';
  // 근경 입체 나무: 길가 가까운 나무만 원본 모델로 그린다(near-trees.js). 사진판 청크는 그대로 둔다.
  const nearTrees=createNearTrees({loadParts:url=>natureModel(url,false,toon)});group.add(nearTrees.group);
  // 식생 LOD 하나를 만든다(장면에는 붙이지 않음). 입구 전용 나무는 성공·생략·실패와 상관없이 처리 끝을 광장 준비 상태에 알린다(무한 대기 방지).
  async function buildNature(options){
    if(options.entranceSpecimen)try{return await buildNature({...options,entranceSpecimen:false,keepAtEntrance:true});}finally{status.entrancePlaza.nearTrees.loaded+=options.placements.length;checkPlaza();}
    const cleared=clearEntranceEntries([options],route)[0];if(!cleared)return new THREE.LOD();
    cleared.placements=clearSceneryPlacements(cleared.placements,natureClearSites,options.kind==='tree'?3:1);if(!cleared.placements.length)return new THREE.LOD();
    const lod=await addInstances({...cleared,height:floorHeight,rockGround,materials,protectedSites:summitSites,nearTrees:options.priority||options.keepAtEntrance?null:nearTrees,toon});lod.userData.metricKind=options.kind==='rock'?'바위':'숲';lod.userData.natureKind=options.kind;
    if(options.priority)lod.userData.priority=true;
    return lod;
  }
  // 이미 부모(bucket.root)에 붙고 행렬이 고정된 LOD를 거리·예산 판정 목록에 넣는다.
  function attachNature(lod,bucket){
    for(const p of lod.userData.contactOccluders??[])contactOcclusion.stamp(p.x,p.z,p.radius,p.opacity);
    if(lod.userData.contactOccluders?.length)contactDirty=true;
    const kind=lod.userData.natureKind;status.contactOccluderKinds??={};
    status.contactOccluderKinds[kind]=(status.contactOccluderKinds[kind]??0)+(lod.userData.contactOccluders?.length??0);
    const box=boundsOf(lod),maxDistance=lod.userData.visibleDistance??950;
    bucket.box.union(box);bucket.items.push({lod,box,maxDistance,distanceSq:0});bucket.maxDistance=Math.max(bucket.maxDistance,maxDistance);
    applyNatureQuality(lod,natureQuality);applyDenseTrees(lod,natureQuality);vegetation.push(lod);
  }
  async function streamFar(){
    if(disposed)throw new Error('해제한 자산');
    if(farGroup)return farGroup;
    if(farPromise)return farPromise;
    farPromise=(async()=>{
      const grid=await readGrid(base,manifest.far);if(disposed)throw new Error('해제한 자산');far=grid;
      const holder=new THREE.Group();holder.name='SeoulFar';
      holder.userData.metricKind='원경 지형';
      // 전체 원경 바닥. 근경과 만나는 경계의 겹침은 캡처 검증이 필요하다.
      const positions=[],indices=[],uv=[];
      for(let j=0;j<grid.height;j++)for(let i=0;i<grid.width;i++){
        const x=grid.x0+i*grid.spacing,z=grid.z0+j*grid.spacing;positions.push(x,grid.values[j*grid.width+i],z);uv.push(x/60,z/60);
      }
      for(let j=0;j<grid.height-1;j++)for(let i=0;i<grid.width-1;i++){
        // 근경 전체 대신 현재 청크만 있으므로 완전한 지형은 원경을 계속 유지한다.
        const x=grid.x0+i*grid.spacing,z=grid.z0+j*grid.spacing;
        if(within(near,x,z)&&within(near,x+grid.spacing,z+grid.spacing))continue;
        const a=j*grid.width+i,b=a+1,c=a+grid.width,d=c+1;indices.push(a,c,b,b,c,d);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
      // 근경 아래 2m 오프셋. 원경 DSM을 과장하지 않는다.
      const mesh=new THREE.Mesh(g,applyAtmosphere(new THREE.MeshStandardMaterial({color:0x334b28,roughness:1,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2}),manifest.atmosphere));mesh.position.y=-2;holder.add(mesh);
      // 카툰은 토지피복 사진을 받지 않고 단색 원경 바닥을 쓴다.
      if(manifest.seoulLandcover&&!toonMode){
        const map=await new THREE.TextureLoader().loadAsync(base+manifest.seoulLandcover);map.colorSpace=THREE.SRGBColorSpace;map.flipY=false;map.anisotropy=4;
        const uv=g.attributes.uv,pos=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+30000)/60000,(pos.getZ(i)+30000)/60000);uv.needsUpdate=true;
        mesh.material.map=map;mesh.material.color.set(0xffffff);mesh.material.needsUpdate=true;
      }
      if(manifest.seoulSurface){
        const surface=await readJSON(base+manifest.seoulSurface),roads=seoulRoadGeometry(surface.roads,(x,z)=>gridHeight(grid,x,z));
        const roadMesh=new THREE.Mesh(roads,applyAtmosphere(new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}),manifest.atmosphere));roadMesh.name='서울 간선도로·교량';holder.add(roadMesh);
        // 교량 측판·교각과 밤 거리 불빛(산풍경 city-water.js). 불빛은 도시 격자가 시각·화질에 맞춰 켜고 끈다.
        const bridges=new THREE.Mesh(seoulBridgeStructure(surface.roads,(x,z)=>gridHeight(grid,x,z)),roadMesh.material);bridges.name='서울 교량 측판·교각';holder.add(bridges);
        if(toon){toon.toonify(roadMesh,{kind:'prop'});toon.toonify(bridges,{kind:'prop'});}
        const lamps=seoulRoadLights(surface.roads,(x,z)=>gridHeight(grid,x,z));cityStyle?.styleNightLight(lamps);holder.add(lamps);city.addNightLights(lamps);status.seoulLamps=lamps.userData.lampCount;status.seoulRoads=surface.roads.length;status.seoulBridges=surface.roads.filter(r=>r.bridge).length;
      }
      for(const p of manifest.landmarks)holder.add(toon?toon.toonify(createSeoulLandmark(p,manifest.atmosphere),{kind:'prop'}):createSeoulLandmark(p,manifest.atmosphere));
      if(toon)toon.toonify(mesh,{kind:'prop'});
      if(disposed){disposeGeometry(holder);throw new Error('해제한 자산');}
      farGroup=holder;group.add(holder);freezeStatic(holder);return holder;
    })().catch(e=>{farPromise=null;throw e;});
    return farPromise;
  }
  const unbindCityLabels=bindSeoulLabels(group,status);
  const loadedCities=new Map(),cityMaterial=applyAtmosphere(new THREE.MeshStandardMaterial({color:0x78878b,roughness:.92}),manifest.atmosphere);
  // 전용 모델이 있는 랜드마크 자리의 OSM 중복 건물(63빌딩 등)은 뺀다.
  const cityExclude=manifest.landmarks.filter(p=>p.shape!=='reference'&&Number.isFinite(p.height)).map(p=>({x:p.x,z:p.z,radius:45,minHeight:p.height*.5}));
  const city=createCityGrid({parent:group,material:cityMaterial,atmosphere:manifest.atmosphere,status,exclude:cityExclude});
  // 카툰: 파스텔 도심 + 밤 창문 불빛. apply는 나중에 추가되는 도시 칸도 바꾼다.
  const cityStyle=toon?.styleCity?toon.styleCity({material:cityMaterial,nightLights:[]}):null;cityStyle?.apply(city.root);
  async function streamCity(id){
    if(disposed)throw new Error('해제한 자산');
    if(loadedCities.has(id))return loadedCities.get(id);
    const meta=manifest.cityChunks.find(c=>c.id===id);if(!meta)throw new Error('원경 청크 ID 없음');
    const promise=(async()=>{
      const data=await readJSON(base+meta.file);if(disposed)throw new Error('해제한 자산');
      const added=city.addBuildings(data.buildings);status.cityChunks++;status.buildings+=added;status.cityDuplicates=(status.cityDuplicates??0)+data.buildings.length-added;return {id,buildings:data.buildings.length};
    })().catch(e=>{loadedCities.delete(id);throw e;});
    loadedCities.set(id,promise);return promise;
  }
  async function streamWater(){
    await streamFar();
    const holder=new THREE.Group();holder.name='HanRiverAndWater';const waterGeometries=[],waterMasks=[];status.waterPolygons=0;
    const seen=new Set();
    for(const file of manifest.water){
      const data=await readJSON(base+file);
      for(const element of data.elements){
        if(seen.has(`${element.type}/${element.id}`))continue;
        const polygons=waterShapes(element);if(!polygons.length)continue;seen.add(`${element.type}/${element.id}`);
        for(const shape of polygons){
          const points=shape.getPoints();waterMasks.push({points,holes:shape.holes.map(h=>h.getPoints()),box:new THREE.Box2().setFromPoints(points)});
          const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
          g.translate(0,5,0);waterGeometries.push(g);
          // 한강 수면은 고도 5m 기준. DSM 수목/교량 최고점을 수면에 쓰지 않는다.
          status.waterPolygons++;
        }
      }
    }
    // DSM의 교량·둑·보간값이 수면을 덮지 않도록 실제 물 윤곽 안의 원경 바닥만 낮춘다.
    const ground=farGroup.children.find(o=>o.isMesh)?.geometry;
    if(ground){const pos=ground.attributes.position,p=new THREE.Vector2();for(let i=0;i<pos.count;i++){p.set(pos.getX(i),-pos.getZ(i));if(waterMasks.some(m=>m.box.containsPoint(p)&&insideRing(p,m.points)&&!m.holes.some(h=>insideRing(p,h))))pos.setY(i,Math.min(pos.getY(i),4));}pos.needsUpdate=true;ground.computeVertexNormals();}
    if(waterGeometries.length){const merged=mergeGeometries(waterGeometries,false);waterGeometries.forEach(g=>g.dispose());/* 한강 물빛: 물결·하늘 반사·노을·밤 불빛 일렁임(산풍경 city-water.js) */holder.add(new THREE.Mesh(merged,toonMode?materialFactory.water():applyAtmosphere(seoulWaterMaterial(),manifest.atmosphere)));}
    if(disposed){disposeGeometry(holder);throw new Error('해제한 자산');}if(waterGroup){waterGroup.traverse(o=>{if(o.material&&!o.material.userData.shared)o.material.dispose();});disposeGeometry(waterGroup);}waterGroup=holder;group.add(holder);freezeStatic(holder);return holder;
  }
  function applyEnvironment(scene,renderer){
    const old={background:scene.background,environment:scene.environment,fog:scene.fog,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,colorSpace:renderer.outputColorSpace};
    scene.background=sky;scene.environment=sky;
    // 실사 룩 체크리스트 §2·§4. 대비는 재질의 거리 셰이더에서 조절한다.
    scene.fog=new THREE.Fog(manifest.atmosphere.haze,0,60000);
    renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    const az=THREE.MathUtils.degToRad(manifest.atmosphere.sunBearing),alt=THREE.MathUtils.degToRad(manifest.atmosphere.sunAltitude);
    const sun=new THREE.DirectionalLight(0xfff1de,2.2);sun.position.set(Math.sin(az)*Math.cos(alt)*1000,Math.sin(alt)*1000,-Math.cos(az)*Math.cos(alt)*1000);scene.add(sun);
    const ambient=new THREE.HemisphereLight(0xdcecff,0x4d4639,.35);scene.add(ambient);
    return ()=>{sun.removeFromParent();ambient.removeFromParent();if(scene.background===sky)scene.background=old.background;if(scene.environment===sky)scene.environment=old.environment;scene.fog=old.fog;renderer.toneMapping=old.toneMapping;renderer.toneMappingExposure=old.exposure;renderer.outputColorSpace=old.colorSpace;};
  }
  freezeStatic(group);
  return {group,get manifest(){return manifest;},status,route,interactionProps,entranceReady:()=>plazaReady,materials,sky,rawHeight,floorHeight,surfaceHeight,update,streamFar,streamCity,finalizeCities:()=>city.finalize(),streamWater,applyEnvironment,
    collisionObjects:()=>[path,...chunks.values()],
    cameraCollisionObjects(a,b){
      // 붐과 근평면 폭을 포함한 XZ 상자. 정적 월드 좌표 지형만 대상으로 한다.
      const minX=Math.min(a.x,b.x)-1,maxX=Math.max(a.x,b.x)+1,minZ=Math.min(a.z,b.z)-1,maxZ=Math.max(a.z,b.z)+1;
      return [...path.children,...chunks.values()].filter(mesh=>{
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        const box=mesh.geometry.boundingBox;return box.max.x>=minX&&box.min.x<=maxX&&box.max.z>=minZ&&box.min.z<=maxZ;
      });
    },
    groundCheck(x,z){const h=surfaceHeight(x,z);roadRay.set(new THREE.Vector3(x,h+10,z),new THREE.Vector3(0,-1,0));roadRay.far=20;const hit=roadRay.intersectObjects([path,terrain,baseMesh],true)[0];return {surface:h,visible:hit?.point.y,error:hit?Math.abs(hit.point.y-h):Infinity};},
    async refreshManifest(){
      if(!manifest.inventoryFallback)return false;
      let next;try{next=await readJSON(base+'manifest.json');}catch{return false;}
      if(next.version!==1)throw new Error('미지원 manifest 버전');
      if(JSON.stringify(next.near)!==JSON.stringify(manifest.near)&&['width','height','spacing','x0','z0'].some(k=>next.near[k]!==manifest.near[k]))throw new Error('높이 격자 변경: 새로고침 필요');
      next.water=[...new Set([...manifest.water,...next.water])];manifest=next;status.source='manifest';return true;
    },
    // 길가 풀·낙엽·관목 포기도 계곡 물줄기 띠·호수 수면에는 두지 않는다(water-clearance.js, 포기 반경 .35m×배율).
    addGrass(placements){const water=waterClearance(route),kept=clearSceneryPlacements(clearEntranceEntries([{kind:'grass',placements}],route)[0]?.placements??[],natureClearSites),dry=kept.filter(p=>!water.blocked(p.x,p.z,.35*(p.scale??1)));status.waterGroundCoverCleared=kept.length-dry.length;grasses.add(...grassClumps(dry,floorHeight).children.slice());freezeStatic(grasses);},
    // 청크 스트리밍 밖에서 바로 붙이는 경로(기존 호출 호환). 256m 상위 칸에 넣고 해제하지 않는다.
    async addInstances(options){
      const lod=await buildNature(options);if(!lod.levels.length)return lod;
      const key=`fixed:${Math.floor(lod.position.x/256)},${Math.floor(lod.position.z/256)}`;
      if(!natureBuckets.has(key)){const root=new THREE.Group();root.name=`식생 상위 칸 ${key}`;group.add(root);freezeStatic(root);natureBuckets.set(key,{root,items:[],box:new THREE.Box3(),maxDistance:0});}
      const bucket=natureBuckets.get(key);bucket.root.add(lod);freezeStatic(lod);attachNature(lod,bucket);return lod;
    },
    registerVegetation,
    // 출발점 주변 청크가 붙을 때까지 기다린다(프레임 루프 전에도 진행). position: {x,z} 또는 [x,y,z].
    terrainReady:(position,onProgress)=>pump(terrainStream,position,onProgress),
    vegetationReady:(position,onProgress)=>pump(vegetationStream,position,onProgress),
    chunkStatus:()=>({...terrainStream.status(),vegetation:vegetationStream?.status()??null}),
    chunkIndex,
    finalizeContactOcclusion(){contactOcclusion.commit();contactCommitted=true;contactDirty=false;},
    setContactOcclusion(value){contactOcclusion.setEnabled(value);},
    contactSurfaceHit(ray){return ray.intersectObjects([terrain,baseMesh,path],true)[0];},
    contactGroundY(x,z){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,floorHeight(x,z)+100,z),new THREE.Vector3(0,-1,0),0,300);
      return ray.intersectObjects([...[...chunks.values()].filter(mesh=>mesh.visible),baseMesh],true)[0]?.point.y;
    },
    stairBaseCheck(ground=stairGround){return stairGapReport(stairBase.layout,ground,(x,z)=>roadHeight(x,z));},
    stairBaseLayout:()=>stairBase.layout,
    stairRockGrounding(){
      const rows=vegetation.flatMap(lod=>(lod.userData.contactOccluders??[]).filter(p=>p.terrainAligned&&isStairSurface(route[nearest(p.x,p.z).index].material)).map(p=>{
        const terrainY=rockGround(p.x,p.z,p.radius,p.nearDetail);return {...p,terrainY,signedGroundError:Number.isFinite(terrainY)?p.y-terrainY:null,error:contactGroundError(p,terrainY)};
      }));
      const errors=rows.filter(r=>r.error!==null).map(r=>r.error);
      return {scope:'계단 인근 전체 배치 / 최종 2m 삼각형 기준',count:rows.length,missing:rows.length-errors.length,max:errors.length?Math.max(...errors):null,mean:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,rows};
    },
    contactCandidates(x,z,distance=35,limit=128){
      const rows=[];
      for(const lod of vegetation){
        let visible=true;for(let object=lod;object;object=object.parent)if(!object.visible){visible=false;break;}
        for(const point of lod.userData.contactOccluders??[]){const d=Math.hypot(point.x-x,point.z-z);if(d<=distance)rows.push({...point,distance:d,visible});}
      }
      return rows.sort((a,b)=>a.distance-b.distance).slice(0,limit);
    },
    dispose(){disposed=true;terrainStream.dispose();vegetationStream?.dispose();unbindCityLabels();contactOcclusion.dispose();city.dispose();for(const geometry of baseGeometries)if(geometry!==baseMesh.geometry)geometry.dispose();disposeGeometry(group);const seen=new Set([cityMaterial]);group.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])seen.add(m);});for(const m of Object.values(materials))seen.add(m);for(const m of seen){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}sky?.dispose();}
  };
}

/** 외부 CC0/CC BY 모델을 별도 전달하는 인스턴싱 LOD. 구형 나무 대체물을 자동 생성하지 않는다.
 * levels=[{url,distance:0},{url,distance:60},{url,distance:140}]. 각 모델은 Y-up, 발/밑동 Y=0.
 * placements=[{x,z,scale:1,yaw:0}]. 종류별 소나무/참나무/화강암을 따로 호출한다.
 */
const natureCache=new Map();
let graniteRockMaterial,graniteRockFaceMaterial;
// toon={toonify,patchFoliage}: 카툰은 단색 GLB를 MeshToon으로 바꾸고(잎 카드는 덩어리 메시) 카툰 바람결 셰이더를 쓴다.
// 반환 geometry·재질은 여러 청크가 함께 쓰므로 userData.shared로 표시한다(청크 해제 때 남는다).
function natureModel(url,rock=false,toon=null){
 const key=`${url}:${rock}`;
 if(!natureCache.has(key))natureCache.set(key,new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url).then(gltf=>{
  if(toon)toon.toonify(gltf.scene,{kind:'nature'});
  const foliage=material=>toon?toon.patchFoliage(material,{name:material.name,pine:/pine/.test(url)}):patchFoliage(twigCutout(material),{pine:/pine/.test(url)});
  const parts=[];gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh)throw new Error('식생 스킨 미지원');const geometry=instanceGeometry(o.geometry,o.matrixWorld);parts.push({geometry,material:rock?o.material:foliage(o.material)});});
  const buckets=new Map();for(const part of parts){
   if(Array.isArray(part.material))continue;
   const signature=(rock?'granite':part.material.uuid)+':'+Object.entries(part.geometry.attributes).map(([n,a])=>`${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join(',')+':'+!!part.geometry.index;
   if(!buckets.has(signature))buckets.set(signature,[]);buckets.get(signature).push(part);
  }
  const result=parts.filter(p=>Array.isArray(p.material));
  for(const bucket of buckets.values()){
   const merged=bucket.length>1?mergeGeometries(bucket.map(p=>p.geometry),false):null;
   if(merged){result.push({geometry:merged,material:bucket[0].material});for(const p of bucket)p.geometry.dispose();}else result.push(...bucket);
  }
  for(const part of result){part.geometry.userData.shared=true;for(const m of [part.material].flat())m.userData.shared=true;}
  return result;
 }));return natureCache.get(key);
}
async function addInstances({levels,placements,height,rockGround,materials,kind,id,nearDetail=false,forestTint,protectedSites=[],nearTrees=null,toon=null}){
  if(!levels?.length||!placements?.length)throw new Error('LOD 모델과 배치 정보 필요');
  if(kind==='rock'&&protectedSites.length){
    // 북·북동 전망 구역의 장식 바위만 낮춘다. 실제 DSM 암반 지형은 유지한다.
    const summit=protectedSites.find(site=>site.id==='marker');
    if(summit)placements=placements.map(p=>{
      const dx=p.x-summit.summitPoint.x,dz=p.z-summit.summitPoint.z;
      if(Math.hypot(dx,dz)>85||dz>8)return p;
      const stretch=(p.stretch??[p.scale??1,p.scale??1,p.scale??1]).map(v=>v*.18);
      return {...p,scale:1,stretch};
    });
    // 모든 LOD의 실제 메시 범위와 배치 회전·비균일 크기를 포함한 보수적 반경.
    let radius=0;
    for(const level of levels)for(const {geometry} of await natureModel(level.url,true,toon)){
      geometry.computeBoundingBox();const {min,max}=geometry.boundingBox;
      radius=Math.max(radius,Math.hypot(Math.max(Math.abs(min.x),Math.abs(max.x)),Math.max(Math.abs(min.y),Math.abs(max.y)),Math.max(Math.abs(min.z),Math.abs(max.z))));
    }
    placements=placements.filter(p=>{
      const extent=radius*Math.max(...(p.stretch??[p.scale||1]).map(Math.abs));
      return protectedSites.every(site=>Math.hypot(p.x-site.x,p.z-site.z)>site.supportRadius+extent+.25);
    });
    if(!placements.length){const empty=new THREE.LOD();empty.autoUpdate=false;return empty;}
  }
  const xs=placements.map(p=>p.x),zs=placements.map(p=>p.z);
  if(Math.max(...xs)-Math.min(...xs)>128||Math.max(...zs)-Math.min(...zs)>128)throw new Error('식생은 최대 128m 청크별로 전달');
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
  const lod=new THREE.LOD();lod.autoUpdate=false;lod.position.set(cx,height(cx,cz),cz);if(nearDetail||kind==='understory'||kind==='rock')lod.userData.visibleDistance=180;
  // 늘린 교목(dense)은 뒤쪽에 모아 화질 낮음에서 앞쪽 개수만 그린다(행렬 재업로드 없음).
  let denseFrom=placements.length;
  if(placements.some(p=>p.dense)){placements=[...placements.filter(p=>!p.dense),...placements.filter(p=>p.dense)];denseFrom=placements.findIndex(p=>p.dense);}
  const groundYs=placements.map(p=>height(p.x,p.z));
  // 근경 입체 나무로 넘기는 수종은 청크에서 원본 LOD0를 빼고 사진판만 남긴다.
  const pooled=nearTrees&&kind==='tree'&&NEAR_TREE_IDS.includes(id)&&levels.some(l=>!l.url.endsWith('-lod0.glb'));
  for(const level of levels.filter((l,i,a)=>a.findIndex(v=>v.url===l.url)===i&&!(pooled&&l.url.endsWith('-lod0.glb')))){
    const parts=level.representation==='impostor'&&level.url.endsWith('pine-impostor-atlas-v1.png')?await pineImpostorParts(placements):await natureModel(level.url,kind==='rock',toon),holder=new THREE.Group();
    for(const part of parts)part.material.userData.shared=true; // 사진판 판 geometry는 배치마다 새로 만들므로 해제 대상이다
    // 원본 입체 식생의 실제 최하단을 밑동으로 사용한다. 사진판의 투명 여백은 옮기지 않는다.
    const groundOffset=kind!=='rock'&&level.url.endsWith('-lod0.glb')?Math.min(...parts.map(p=>{p.geometry.computeBoundingBox();return p.geometry.boundingBox.min.y;})):0;
    for(const {geometry,material} of parts){
      // 카툰은 바위 GLB의 툰 재질을 그대로 쓴다(화강암 PBR 텍스처 없음).
      if(kind==='rock'&&!toon&&!graniteRockMaterial)graniteRockMaterial=new THREE.MeshStandardMaterial({map:materials.granite.map,normalMap:materials.granite.normalMap,roughnessMap:materials.granite.roughnessMap,color:0xb1b5b8,roughness:1,normalScale:new THREE.Vector2(.55,.55)});
      if(graniteRockMaterial){graniteRockMaterial.userData.shared=true;graniteRockMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment+'\nfloat stoneLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=stoneLuma*vec3(.94,.98,1.0);');};graniteRockMaterial.customProgramCacheKey=()=> 'granite-rock-neutral-v1';}
      // rock_face_*는 뒷면이 뚫린 절벽면 스캔이다. 뒤에서 보면 앞면 조각만 남아 공중 파편처럼 보이므로 양면으로 그린다.
      if(kind==='rock'&&!toon&&String(id).startsWith('rock_face')&&!graniteRockFaceMaterial){graniteRockFaceMaterial=graniteRockMaterial.clone();graniteRockFaceMaterial.side=THREE.DoubleSide;graniteRockFaceMaterial.onBeforeCompile=graniteRockMaterial.onBeforeCompile;graniteRockFaceMaterial.customProgramCacheKey=graniteRockMaterial.customProgramCacheKey;graniteRockFaceMaterial.userData.shared=true;}
      const rockMaterial=toon?material:String(id).startsWith('rock_face')?graniteRockFaceMaterial:graniteRockMaterial;
      const mesh=new THREE.InstancedMesh(geometry,kind==='rock'?rockMaterial:material,placements.length),dummy=new THREE.Object3D();
      placements.forEach((p,i)=>{dummy.position.set(p.x-cx,groundYs[i]-(p.supportDrop||0)-lod.position.y-((p.embed||0)+groundOffset)*(p.scale||1),p.z-cz);dummy.rotation.set(level.representation==='impostor'?0:p.pitch||0,level.representation==='impostor'?0:p.yaw||0,level.representation==='impostor'?0:p.roll||0);dummy.scale.set(...(p.stretch??[p.scale||1,p.scale||1,p.scale||1]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=true;holder.add(mesh);
      if(forestTint!==undefined||placements.some(p=>p.forestTint!==undefined)){const tint=new THREE.Color();for(let i=0;i<placements.length;i++)mesh.setColorAt(i,tint.set(placements[i].forestTint??forestTint??0xffffff));mesh.instanceColor.needsUpdate=true;}
    }
    // 바늘잎 컷아웃을 갖는 수만 삼각형 근경 모델은 가까운 곳에만 유지한다.
    // 배치 수는 유지하고 사진판 전환을 앞당겨 알파 오버드로 비용을 제한한다.
    holder.userData.lodSource={distance:level.distance,kind,nearDetail,representation:level.representation};
    holder.userData.triangles=holder.children.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3*m.count,0);
    lod.addLevel(holder,level.distance,0.10);
  }
  if(pooled){
    const lod0=levels[0].url.replace(/-lod\d\.glb$/,'-lod0.glb'),parts=await natureModel(lod0,false,toon);
    const groundOffset=Math.min(...parts.map(p=>{p.geometry.computeBoundingBox();return p.geometry.boundingBox.min.y;}));
    const dummy=new THREE.Object3D(),matrices=placements.map((p,i)=>{
      dummy.position.set(p.x,groundYs[i]-(p.supportDrop||0)-((p.embed||0)+groundOffset)*(p.scale||1),p.z);dummy.rotation.set(p.pitch||0,p.yaw||0,p.roll||0);
      dummy.scale.set(...(p.stretch??[p.scale||1,p.scale||1,p.scale||1]));dummy.updateMatrix();return dummy.matrix.clone();
    });
    await nearTrees.register(lod,{id,url:lod0,matrices,tints:placements.map(p=>p.forestTint??forestTint??0xffffff),dense:placements.map(p=>!!p.dense)});
  }
  if(denseFrom<placements.length)lod.userData.denseFrom=denseFrom;
  if(['rock','tree','understory'].includes(kind)){
    const meshes=lod.levels[0]?.object.children??[],footprint=contactFootprint(meshes,kind);
    // 실제 첫 LOD 행렬에는 피치·롤·비균일 배율·embed·supportDrop이 모두 들어 있다.
    lod.userData.contactOccluders=meshes.length?placements.map((p,i)=>placedContact(footprint,instanceContactMatrix(meshes[0],i,lod.position),{kind,id,nearDetail})).filter(Boolean):[];
    if(kind==='rock'&&rockGround)for(let i=0;i<lod.userData.contactOccluders.length;i++){
      const point=lod.userData.contactOccluders[i],ground=rockGround(point.x,point.z,point.radius,nearDetail);
      if(!Number.isFinite(ground))continue;
      const referenceGround=nearDetail?undefined:rockGround(point.x,point.z,point.radius,nearDetail,false);
      lod.userData.contactOccluders[i]=seatContactInstance(lod,i,footprint,ground,{kind,id,nearDetail,referenceGround});
    }
    if(kind==='rock')for(const level of lod.levels)for(const mesh of level.object.children){mesh.computeBoundingBox();mesh.computeBoundingSphere();}
    if(kind==='rock')for(let i=0;i<lod.userData.contactOccluders.length;i++){
      const box=new THREE.Box3();
      for(const mesh of meshes){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(instanceContactMatrix(mesh,i,lod.position)));}
      lod.userData.contactOccluders[i].worldBounds={min:box.min.toArray(),max:box.max.toArray()};
    }
  }
  return lod;
}
function applyDenseTrees(lod,quality){
  const from=lod.userData.denseFrom;if(from===undefined)return;
  for(const level of lod.levels)for(const mesh of level.object.children)if(mesh.isInstancedMesh)mesh.count=quality===0?from:mesh.instanceMatrix.count;
}
export function makePlacements({route,height,bounds,count=300,seed=37,minPathDistance=3}){
  const rand=seeded(seed),placements=[];
  for(let tries=0;tries<count*10&&placements.length<count;tries++){
    const x=mix(bounds.x0,bounds.x1,rand()),z=mix(bounds.z0,bounds.z1,rand());
    if(nearestRoute(route,x,z).distance<minPathDistance)continue;
    if(!Number.isFinite(height(x,z)))continue;placements.push({x,z,scale:.85+rand()*.3,yaw:rand()*Math.PI*2});
  }
  return placements;
}

// 구간별 노면을 0.5m 이하로 세분하여 접지·노면 보간 오차를 제한한다.
export function densifyRoute(route){
 const offsets=route.map((p,i)=>{const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)];const d1=Math.hypot(p.x-a.x,p.z-a.z),d2=Math.hypot(b.x-p.x,b.z-p.z);const n1=d1?[-(p.z-a.z)/d1,(p.x-a.x)/d1]:[-(b.z-p.z)/d2,(b.x-p.x)/d2];const n2=d2?[-(b.z-p.z)/d2,(b.x-p.x)/d2]:n1;const dot=1+n1[0]*n2[0]+n1[1]*n2[1];return {nx:(n1[0]+n2[0])/Math.max(.25,dot),nz:(n1[1]+n2[1])/Math.max(.25,dot)};});
 const out=[];for(let i=0;i<route.length-1;i++){const a=route[i],b=route[i+1],stairs=isStairSurface(a.material),n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/(stairs?.3:.5)),stairs?Math.ceil(Math.abs(b.y-a.y)/.18):1);for(let j=0;j<n;j++){const t=j/n;out.push({...a,x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),y:mix(a.y,b.y,t),s:mix(a.s,b.s,t),width:mix(a.width,b.width,t),nx:mix(offsets[i].nx,offsets[i+1].nx,t),nz:mix(offsets[i].nz,offsets[i+1].nz,t)});}}out.push({...route.at(-1),...offsets.at(-1)});return out;
}

function rectangularGrid(grid,height,stride=1){
 const columns=Math.ceil((grid.width-1)/stride)+1,rows=Math.ceil((grid.height-1)/stride)+1;
 const v=[],uv=[],ix=[];for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const x=grid.x0+Math.min(i*stride,grid.width-1)*grid.spacing,z=grid.z0+Math.min(j*stride,grid.height-1)*grid.spacing;v.push(x,height(x,z),z);uv.push(x,z);if(i<columns-1&&j<rows-1){const a=j*columns+i,c=a+columns;ix.push(a,c,a+1,a+1,c,c+1);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
// OSM relation의 분할 outer/inner way를 잇고 섬은 hole로 남긴다.
export function waterShapes(element){
 const closed=r=>r.length>=4&&Math.abs(r[0].lat-r.at(-1).lat)<1e-7&&Math.abs(r[0].lon-r.at(-1).lon)<1e-7;
 const join=parts=>{const rings=[];while(parts.length){let ring=[...parts.shift()];let progress=true;while(!closed(ring)&&progress){progress=false;for(let i=0;i<parts.length;i++){let p=parts[i];const eq=(a,b)=>Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lon-b.lon)<1e-7;if(eq(ring.at(-1),p.at(-1)))p=[...p].reverse();if(eq(ring.at(-1),p[0])){ring.push(...p.slice(1));parts.splice(i,1);progress=true;break;}if(eq(ring[0],p[0]))p=[...p].reverse();if(eq(ring[0],p.at(-1))){ring=[...p.slice(0,-1),...ring];parts.splice(i,1);progress=true;break;}}}if(closed(ring))rings.push(ring);}return rings;};
 const vec=r=>r.map(p=>{const q=project(p.lat,p.lon);return new THREE.Vector2(q.x,-q.z);});
 if(element.type==='way')return element.geometry&&closed(element.geometry)?[new THREE.Shape(vec(element.geometry))]:[];
 if(element.type!=='relation')return [];
 const members=element.members||[];const outers=join(members.filter(m=>m.role!=='inner'&&m.geometry).map(m=>m.geometry));const inners=join(members.filter(m=>m.role==='inner'&&m.geometry).map(m=>m.geometry));
 const shapes=outers.map(r=>new THREE.Shape(vec(r)));
 const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i].y>p.y)!==(r[j].y>p.y)&&p.x<(r[j].x-r[i].x)*(p.y-r[i].y)/(r[j].y-r[i].y)+r[i].x)yes=!yes;return yes;};
 for(const ring of inners){const points=vec(ring),shape=shapes.find(s=>inside(points[0],s.getPoints()));if(shape)shape.holes.push(new THREE.Path(points));}return shapes;
}

function insideRing(p,r){let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i].y>p.y)!==(r[j].y>p.y)&&p.x<(r[j].x-r[i].x)*(p.y-r[i].y)/(r[j].y-r[i].y)+r[i].x)yes=!yes;return yes;}
