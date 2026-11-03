import * as THREE from 'three';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {gridHeight,nearestRoute,indexRoute,cutHeight,project,mix} from './geo.js';
import {terrainMaterial,trailMaterial} from './terrain-material.js';
import {LOOK_PROFILE} from '../../src/look-profile.js';
import {applyAtmosphere} from './skyline-reference.js';
import {grassClumps,updateGroundCover} from './near-detail.js';
import {instanceGeometry} from './instance-geometry.js';
import {twigCutout} from './foliage-material.js';
import {surfaceIndex} from './surface-index.js';
import {stairTerrainClearance} from './terrain-clearance.js';
import {indexStaticRaycast} from '../../src/static-raycast.js';
import {chunkBounds,createChunkCuller,boxDistanceSquared} from '../../src/chunk-culling.js';
import {createCityGrid} from '../../src/city-grid.js';
import {freezeStatic,applyNatureQuality} from '../../src/static-scene.js';
import {pineImpostorParts} from '../../src/pine-impostor.js';
import {assignSurfaceRoute,isStairSurface} from '../../src/route-surfaces.js';
import {createSummitFacilities,facilityTriangleCounts} from './summit-facilities.js';
import {facilitySites,facilityGround} from './summit-config.js';
import {createContactOcclusion} from '../../src/contact-occlusion.js';
import {contactFootprint,placedContact,instanceContactMatrix,seatContactInstance,contactGroundError} from '../../src/contact-footprint.js';

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
export function ribbon(route,material,metres){
 const group=new THREE.Group();let start=0;for(let i=1;i<route.length;i++)if(route[i].s-route[start].s>=100||route[i].material!==route[start].material||i===route.length-1){const selected=material.isMaterial?material:material[route[start].material];group.add(ribbonPart(route.slice(start,i+1),selected,metres));start=i;}return group;
}
function ribbonPart(route,material,metres){
  if(isStairSurface(route[0].material))return stairRibbonPart(route,material,metres);
  const positions=[],uv=[],indices=[],edges=[];
  for(let i=0;i<route.length;i++){
    const p=route[i],a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)];
    const n=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=p.nx??-(b.z-a.z)/n,nz=p.nz??(b.x-a.x)/n;
    for(const side of [-1,1]){positions.push(p.x+nx*p.width/2*side,p.y+.015,p.z+nz*p.width/2*side);uv.push(side*p.width/2/metres,p.s/metres);edges.push(side);}
    if(i<route.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('trailEdge',new THREE.Float32BufferAttribute(edges,1));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();
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
  quad([edge(b,-1,y),edge(b,1,y),edge(b,-1,next),edge(b,1,next)],b.s,b.s);
  if(i===0)quad([edge(a,-1,a.y+.015),edge(a,1,a.y+.015),edge(a,-1,y),edge(a,1,y)],a.s,a.s);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('trailEdge',new THREE.Float32BufferAttribute(edges,1));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
 return new THREE.Mesh(geometry,material);
}
function disposeGeometry(object){object.traverse(o=>{if(o.geometry)o.geometry.dispose();});object.removeFromParent();}

/** 준비된 generated/만 읽는다. 자료가 없으면 합성 지형으로 대체하지 않고 오류를 반환한다.
 * 원경 다운로드는 streamFar()를 호출할 때 시작한다. scene/render 설정은 호출자가 소유한다.
 */
export async function loadLandscape({base='/assets/realistic/generated/',maxContactMapSize=8192}={}){
  if(!base.endsWith('/'))base+='/';
  let manifest;
  try{manifest=await readJSON(base+'manifest.json');}catch{manifest=await readJSON(base+'inventory.json');}
  manifest.atmosphere={...manifest.atmosphere,haze:LOOK_PROFILE.haze,contrastStops:[[0,1],[2000,.95],[5000,.82],[8000,.68],[12000,.55],[15000,.46],[25000,.25],[40000,.08]]};
  const status={source:manifest.inventoryFallback?'파일 목록':'manifest',cityChunks:0,buildings:0,waterPolygons:0,errors:[],ready:false};
  if(manifest.version!==1)throw new Error('미지원 자산 버전');
  if(!manifest.observation||!manifest.atmosphere||!manifest.directionCaptures)throw new Error('서울 원경 기준 갱신 후 prepare.mjs 재실행 필요');
  const [near,routeSource,materials,sky]=await Promise.all([
    readGrid(base,manifest.near),readJSON(base+manifest.route),loadMaterials(base,manifest),new RGBELoader().setDataType(THREE.FloatType).loadAsync(base+manifest.hdri)
  ]);
  const route=assignSurfaceRoute(routeSource);
  sky.mapping=THREE.EquirectangularReflectionMapping;
  const group=new THREE.Group();group.name='GwanakRealistic';
  const terrain=new THREE.Group();terrain.name='NearTerrain';group.add(terrain);
  terrain.userData.metricKind='지형 청크';
  const blended=terrainMaterial(materials,manifest.materials);
  const contactOcclusion=createContactOcclusion(near,{route,maxMapSize:maxContactMapSize,enabled:new URLSearchParams(location.search).get('contactAO')!=='off'});
  contactOcclusion.apply(blended);status.contactOcclusion=contactOcclusion.status;
  // 폭 안쪽과 어깨를 수평화하며 24m에 걸쳐 DSM으로 복귀한다.
  const paved=new THREE.MeshStandardMaterial({color:0x858585,roughness:1});
  const stoneStairs=materials.stone.clone(),woodStairs=materials.wood.clone();stoneStairs.side=woodStairs.side=THREE.DoubleSide;
  for(const [copy,source]of [[stoneStairs,materials.stone],[woodStairs,materials.wood]]){copy.onBeforeCompile=source.onBeforeCompile;copy.customProgramCacheKey=source.customProgramCacheKey;}
  Object.assign(materials,{paved,stoneStairs,woodStairs});
  const pathMaterials={soil:trailMaterial(materials,manifest.materials),rock:materials.stone,paved,stairs:stoneStairs,deck_stairs:woodStairs,ridge:materials.granite};
  // 노면·계단 재질은 접촉 음영에서 제외한다. 아래 지형도 지도에서 경로 폭을 보호한다.
  const pathPoints=densifyRoute(route);
  const path=ribbon(pathPoints,pathMaterials,manifest.materials.soil.metres);path.name='등산로 노면';group.add(path);
  path.traverse(mesh=>{if(mesh.isMesh)indexStaticRaycast(mesh);});
  path.userData.metricKind='등산로';
  const chunks=new Map();let far,farGroup,farPromise,waterGroup,disposed=false;
  const rawHeight=(x,z)=>gridHeight(within(near,x,z)?near:far||near,x,z);
  const nearest=indexRoute(route);
  let summitSites=[];
  const floorHeight=(x,z)=>{
    const hit=nearest(x,z),a=route[hit.index],b=route[hit.index+1];
    const correction=mix(a.elevationCorrection??0,b.elevationCorrection??0,hit.t)*Math.exp(-((hit.distance/300)**2));
    return facilityGround(summitSites,x,z,cutHeight(rawHeight(x,z)+correction,hit));
  };
  const roadRay=new THREE.Raycaster();path.updateMatrixWorld(true);
  const roadHeight=surfaceIndex(path);
  const surfaceHeight=(x,z)=>{const h=floorHeight(x,z);return roadHeight(x,z,h+10,20)??h;};
  summitSites=facilitySites(route,floorHeight);
  const facilities=createSummitFacilities(route,floorHeight,summitSites);group.add(facilities.group);
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
      const mesh=gridMesh(cx,cz,64,2,floorHeight,blended,1);if(cleared)clearStairs(mesh.geometry);
      if(rockTerrainIndices.size>=8)rockTerrainIndices.delete(rockTerrainIndices.keys().next().value);
      rockTerrainIndices.set(key,surfaceIndex(mesh));mesh.geometry.dispose();
    }
    return rockTerrainIndices.get(key)(x,z);
  }
  let lastCell='',pendingChunks=[];const culler=createChunkCuller(),bounds=new WeakMap();
  const boundsOf=o=>{if(!bounds.has(o))bounds.set(o,chunkBounds(o));return bounds.get(o);};
  let natureQuality=2;
  function update(camera,quality=2){
    if(disposed)return;
    facilities.update(camera);
    baseMesh.geometry=baseGeometries[quality];
    const size=64,radius=3,cx=Math.floor(camera.position.x/size),cz=Math.floor(camera.position.z/size),wanted=new Set();
    const cell=`${cx},${cz}`;
    if(cell!==lastCell){lastCell=cell;pendingChunks=[];
    for(let j=cz-radius;j<=cz+radius;j++)for(let i=cx-radius;i<=cx+radius;i++){
      const key=`${i},${j}`,x=i*size,z=j*size;
      if(!within(near,x,z)||!within(near,x+size,z+size))continue;
      wanted.add(key);
      if(!chunks.has(key)){
        // 인접 청크 동일 2m 간격: 경계 봉합 유지. DEM 보간 간격과 구별한다.
        pendingChunks.push({key,x,z,distance:(i-cx)**2+(j-cz)**2});
      }
    }
    for(const [key,mesh] of chunks)if(!wanted.has(key)){disposeGeometry(mesh);chunks.delete(key);}
    pendingChunks.sort((a,b)=>a.distance-b.distance);
    }
    // 한 프레임에 최대 한 청크. 대기 중에는 상시 유지되는 NearDEM8m가 바닥을 덮는다.
    const next=pendingChunks.shift();
    if(next){const mesh=gridMesh(next.x,next.z,size,2,floorHeight,blended,1);clearStairs(mesh.geometry);indexStaticRaycast(mesh);chunks.set(next.key,mesh);terrain.add(mesh);freezeStatic(mesh);}
    status.pendingTerrainChunks=pendingChunks.length;
    culler.update(camera);
    let terrainVisible=0;for(const mesh of chunks.values()){mesh.visible=culler.visible(boundsOf(mesh),camera);if(mesh.visible)terrainVisible++;}
    status.terrainVisibleChunks=terrainVisible;
    if(natureQuality!==quality){natureQuality=quality;for(const lod of vegetation)applyNatureQuality(lod,quality);}
    let visible=0,budget=[60000,120000,300000][quality];const candidates=[];
    let natureFrustumTests=0,natureDistanceRejected=0;
    for(const bucket of natureBuckets.values()){
      if(boxDistanceSquared(bucket.box,camera.position)>bucket.maxDistance**2){bucket.root.visible=false;natureDistanceRejected++;continue;}
      natureFrustumTests++;const mask=culler.planeMask(bucket.box);bucket.root.visible=mask>=0;if(!bucket.root.visible)continue;
      for(const item of bucket.items){
        const {lod,box,maxDistance}=item;
        lod.visible=culler.visible(box,camera,maxDistance,mask);
        if(lod.visible){item.distanceSq=lod.position.distanceToSquared(camera.position);candidates.push(item);}
      }
    }
    status.natureBroadPhase={cells:natureBuckets.size,frustumTests:natureFrustumTests,distanceRejected:natureDistanceRejected};
    candidates.sort((a,b)=>a.distanceSq-b.distanceSq);
    for(const {lod,distanceSq} of candidates){
        lod.update(camera);let index=lod.getCurrentLevel();
        while(index<lod.levels.length-1&&lod.levels[index].object.userData.triangles>budget){
          if(lod.levels[index+1].object.userData.lodSource.representation==='impostor'&&distanceSq<400*400)break;
          index++;
        }
        const triangles=lod.levels[index].object.userData.triangles;
        for(let i=0;i<lod.levels.length;i++)lod.levels[i].object.visible=i===index;
        if(triangles>budget)lod.visible=false;else {budget-=triangles;visible++;}
    }status.natureVisibleChunks=visible;status.natureBaseTriangleBudget=[60000,120000,300000][quality];
    city.update(camera,quality,culler);
    for(const mesh of grasses.children){
      const box=boundsOf(mesh);updateGroundCover(mesh,box.distanceToPoint(camera.position),quality);
      mesh.visible=mesh.visible&&culler.visible(box,camera,[28,45,65][quality]);
    }
  }
  const vegetation=[],grasses=new THREE.Group(),natureBuckets=new Map();group.add(grasses);grasses.userData.metricKind='숲';
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
      for(const p of manifest.landmarks)holder.add(landmark(p,manifest.atmosphere));
      if(disposed){disposeGeometry(holder);throw new Error('해제한 자산');}
      farGroup=holder;group.add(holder);freezeStatic(holder);return holder;
    })().catch(e=>{farPromise=null;throw e;});
    return farPromise;
  }
  const loadedCities=new Map(),cityMaterial=applyAtmosphere(new THREE.MeshStandardMaterial({color:0x78878b,roughness:.92}),manifest.atmosphere);
  const city=createCityGrid({parent:group,material:cityMaterial,atmosphere:manifest.atmosphere,status});
  async function streamCity(id){
    if(disposed)throw new Error('해제한 자산');
    if(loadedCities.has(id))return loadedCities.get(id);
    const meta=manifest.cityChunks.find(c=>c.id===id);if(!meta)throw new Error('원경 청크 ID 없음');
    const promise=(async()=>{
      const data=await readJSON(base+meta.file);if(disposed)throw new Error('해제한 자산');
      city.addBuildings(data.buildings);status.cityChunks++;status.buildings+=data.buildings.length;return {id,buildings:data.buildings.length};
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
        if(seen.has(`${element.type}/${element.id}`))continue;seen.add(`${element.type}/${element.id}`);
        const polygons=waterShapes(element);
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
    if(waterGeometries.length){const merged=mergeGeometries(waterGeometries,false);waterGeometries.forEach(g=>g.dispose());holder.add(new THREE.Mesh(merged,new THREE.MeshStandardMaterial({color:0x567b87,roughness:.32,metalness:.12,side:THREE.DoubleSide})));}
    if(disposed){disposeGeometry(holder);throw new Error('해제한 자산');}if(waterGroup){waterGroup.traverse(o=>o.material?.dispose());disposeGeometry(waterGroup);}waterGroup=holder;group.add(holder);freezeStatic(holder);return holder;
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
  return {group,get manifest(){return manifest;},status,route,materials,sky,rawHeight,floorHeight,surfaceHeight,update,streamFar,streamCity,finalizeCities:()=>city.finalize(),streamWater,applyEnvironment,
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
    addGrass(placements){grasses.add(...grassClumps(placements,floorHeight).children.slice());freezeStatic(grasses);},
    async addInstances(options){
      const lod=await addInstances({...options,height:floorHeight,rockGround,materials,protectedSites:summitSites});lod.userData.metricKind=options.kind==='rock'?'바위':'숲';
      if(!lod.levels.length)return lod;
      for(const p of lod.userData.contactOccluders??[])contactOcclusion.stamp(p.x,p.z,p.radius,p.opacity);
      status.contactOccluderKinds??={};
      status.contactOccluderKinds[options.kind]=(status.contactOccluderKinds[options.kind]??0)+(lod.userData.contactOccluders?.length??0);
      const key=`${Math.floor(lod.position.x/256)},${Math.floor(lod.position.z/256)}`;
      if(!natureBuckets.has(key)){const root=new THREE.Group();root.name=`식생 상위 칸 ${key}`;group.add(root);freezeStatic(root);natureBuckets.set(key,{root,items:[],box:new THREE.Box3(),maxDistance:0});}
      const bucket=natureBuckets.get(key);bucket.root.add(lod);freezeStatic(lod);
      const box=boundsOf(lod),maxDistance=lod.userData.visibleDistance??950;
      bucket.box.union(box);bucket.items.push({lod,box,maxDistance,distanceSq:0});bucket.maxDistance=Math.max(bucket.maxDistance,maxDistance);
      applyNatureQuality(lod,natureQuality);vegetation.push(lod);return lod;
    },
    finalizeContactOcclusion(){contactOcclusion.commit();},
    setContactOcclusion(value){contactOcclusion.setEnabled(value);},
    contactSurfaceHit(ray){return ray.intersectObjects([terrain,baseMesh,path],true)[0];},
    contactGroundY(x,z){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,floorHeight(x,z)+100,z),new THREE.Vector3(0,-1,0),0,300);
      return ray.intersectObjects([...terrain.children.filter(mesh=>mesh.visible),baseMesh],true)[0]?.point.y;
    },
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
    dispose(){disposed=true;contactOcclusion.dispose();city.dispose();for(const geometry of baseGeometries)if(geometry!==baseMesh.geometry)geometry.dispose();disposeGeometry(group);const seen=new Set([cityMaterial]);group.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])seen.add(m);});for(const m of Object.values(materials))seen.add(m);for(const m of seen){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}sky.dispose();}
  };
}

function landmark(p,atmosphere){
  const group=new THREE.Group();group.name=p.name;group.position.set(p.x,p.ground,p.z);
  group.userData={source:'data/서울원경-기준표.md / 산기획 확정 방위·거리',...p};
  // 다리 폭·산 모양을 임의 모델로 만들지 않는다. 기준점과 실제 가시성은 구분한다.
  if(p.shape==='reference')return group;
  const material=applyAtmosphere(new THREE.MeshStandardMaterial({color:p.shape==='box'?0x8e7749:0x51616c,roughness:.48,metalness:.25}),atmosphere);
  let g;
  if(p.shape==='box')g=new THREE.BoxGeometry(p.width,p.height,p.depth);
  else if(p.shape==='taper')g=new THREE.CylinderGeometry(3,p.radius,p.height,12);
  else g=new THREE.CylinderGeometry(1.5,p.radius,p.height,12);
  const mesh=new THREE.Mesh(g,material);mesh.position.y=p.height/2;group.add(mesh);
  if(p.shape==='tower'){const deck=new THREE.Mesh(new THREE.CylinderGeometry(17,14,14,20),material);deck.position.y=p.height*.65;group.add(deck);}
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(25,49,48,.8)';ctx.fillRect(0,0,512,80);ctx.font='500 36px sans-serif';ctx.textAlign='center';ctx.fillStyle='#f5f1dc';ctx.fillText(p.name,256,53);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));label.scale.set(1300,203,1);label.position.y=p.height+140;group.add(label);
  return group;
}

/** 외부 CC0/CC BY 모델을 별도 전달하는 인스턴싱 LOD. 구형 나무 대체물을 자동 생성하지 않는다.
 * levels=[{url,distance:0},{url,distance:60},{url,distance:140}]. 각 모델은 Y-up, 발/밑동 Y=0.
 * placements=[{x,z,scale:1,yaw:0}]. 종류별 소나무/참나무/화강암을 따로 호출한다.
 */
const natureCache=new Map();
let graniteRockMaterial;
function natureModel(url,rock=false){
 const key=`${url}:${rock}`;
 if(!natureCache.has(key))natureCache.set(key,new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url).then(gltf=>{
  const parts=[];gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh)throw new Error('식생 스킨 미지원');const geometry=instanceGeometry(o.geometry,o.matrixWorld);parts.push({geometry,material:twigCutout(o.material)});});
  const buckets=new Map();for(const part of parts){
   if(Array.isArray(part.material))continue;
   const signature=(rock?'granite':part.material.uuid)+':'+Object.entries(part.geometry.attributes).map(([n,a])=>`${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join(',')+':'+!!part.geometry.index;
   if(!buckets.has(signature))buckets.set(signature,[]);buckets.get(signature).push(part);
  }
  const result=parts.filter(p=>Array.isArray(p.material));
  for(const bucket of buckets.values()){
   const merged=bucket.length>1?mergeGeometries(bucket.map(p=>p.geometry),false):null;
   if(merged){result.push({geometry:merged,material:bucket[0].material});for(const p of bucket)p.geometry.dispose();}else result.push(...bucket);
  }return result;
 }));return natureCache.get(key);
}
async function addInstances({levels,placements,height,rockGround,materials,kind,id,nearDetail=false,forestTint,protectedSites=[]}){
  if(!levels?.length||!placements?.length)throw new Error('LOD 모델과 배치 정보 필요');
  if(kind==='rock'&&protectedSites.length){
    // 모든 LOD의 실제 메시 범위와 배치 회전·비균일 크기를 포함한 보수적 반경.
    let radius=0;
    for(const level of levels)for(const {geometry} of await natureModel(level.url,true)){
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
  const groundYs=placements.map(p=>height(p.x,p.z));
  for(const level of levels.filter((l,i,a)=>a.findIndex(v=>v.url===l.url)===i)){
    const parts=level.representation==='impostor'&&level.url.endsWith('pine-impostor-atlas-v1.png')?await pineImpostorParts(placements):await natureModel(level.url,kind==='rock'),holder=new THREE.Group();
    // 원본 입체 식생의 실제 최하단을 밑동으로 사용한다. 사진판의 투명 여백은 옮기지 않는다.
    const groundOffset=kind!=='rock'&&level.url.endsWith('-lod0.glb')?Math.min(...parts.map(p=>{p.geometry.computeBoundingBox();return p.geometry.boundingBox.min.y;})):0;
    for(const {geometry,material} of parts){
      if(kind==='rock'&&!graniteRockMaterial)graniteRockMaterial=new THREE.MeshStandardMaterial({map:materials.granite.map,normalMap:materials.granite.normalMap,roughnessMap:materials.granite.roughnessMap,color:0xb1b5b8,roughness:1,normalScale:new THREE.Vector2(.55,.55)});
      if(graniteRockMaterial){graniteRockMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment+'\nfloat stoneLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=stoneLuma*vec3(.94,.98,1.0);');};graniteRockMaterial.customProgramCacheKey=()=> 'granite-rock-neutral-v1';}
      const mesh=new THREE.InstancedMesh(geometry,kind==='rock'?graniteRockMaterial:material,placements.length),dummy=new THREE.Object3D();
      placements.forEach((p,i)=>{dummy.position.set(p.x-cx,groundYs[i]-(p.supportDrop||0)-lod.position.y-((p.embed||0)+groundOffset)*(p.scale||1),p.z-cz);dummy.rotation.set(level.representation==='impostor'?0:p.pitch||0,level.representation==='impostor'?0:p.yaw||0,level.representation==='impostor'?0:p.roll||0);dummy.scale.set(...(p.stretch??[p.scale||1,p.scale||1,p.scale||1]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=true;holder.add(mesh);
      if(forestTint!==undefined){const tint=new THREE.Color(forestTint);for(let i=0;i<placements.length;i++)mesh.setColorAt(i,tint);mesh.instanceColor.needsUpdate=true;}
    }
    // 바늘잎 컷아웃을 갖는 수만 삼각형 근경 모델은 가까운 곳에만 유지한다.
    // 배치 수는 유지하고 사진판 전환을 앞당겨 알파 오버드로 비용을 제한한다.
    holder.userData.lodSource={distance:level.distance,kind,nearDetail,representation:level.representation};
    holder.userData.triangles=holder.children.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3*m.count,0);
    lod.addLevel(holder,level.distance,0.10);
  }
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
