import {entranceLocal} from '../../entrance-scenery.js';
import * as THREE from 'three';
import {indexRoute} from '../../geo.js';
import {createChunkCuller} from '../../../../src/chunk-culling.js';
import {freezeStatic} from '../../../../src/static-scene.js';
import {treeDensity,shrubDensity,grassDensity,broadleafRatio} from '../../forest-zones.js';
import {shrubMaterial,foliageUniforms} from '../../foliage-shader.js';
import {groundCoverMask} from '../../ground-cover-mask.js';
import {waterClearance} from '../../water-clearance.js';
import {groundCoverDensity} from '../../near-detail.js';
import {LIMITS} from '../../../../src/device-profile.js';
// 숲 바닥 풀잎을 100%로 그리는 거리(m, 낮음·균형·높음). 그 밖은 보이는 거리(20/30/40m)까지 20%로 줄어든다.
const FOREST_GRASS_NEAR=[8,12,16];

// 표시되는 2m 지형의 삼각형과 같은 보간. 함수 표면 높이만 쓰면 풀 밑동이 묻힌다.
export function grassGround(height,x,z){
 const x0=Math.floor(x/2)*2,z0=Math.floor(z/2)*2,u=(x-x0)/2,v=(z-z0)/2;
 const a=height(x0,z0),b=height(x0+2,z0),c=height(x0,z0+2),d=height(x0+2,z0+2);
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}

// 형상과 밀도는 참고 사진에 따른 시각 가정. 현장 개체 위치·수종 비율이 아니다.
export function forestLayers(landscape){
 const nearest=indexRoute(landscape.route),root=new THREE.Group();root.name='숲 층위 · 바람 풀';
 const cells=new Map(),treeGroups=new Map(),rocks=new Map(),shrubs=new Map();let seed=61103;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const points=landscape.route,minX=Math.min(...points.map(p=>p.x))-30,maxX=Math.max(...points.map(p=>p.x))+30,minZ=Math.min(...points.map(p=>p.z))-30,maxZ=Math.max(...points.map(p=>p.z))+30;
 const add=(map,key,p)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(p);};
 // 풀·덤불 밑동은 2m 격자 꼭짓점 높이 4개로 정한다(grassGround). 이웃 포기가 같은 꼭짓점을 다시 계산하지 않게 이 호출 안에서만 기억한다(2026-11-06 첫 로딩 단축, 결과는 같다).
 const latticeHeights=new Map(),latticeHeight=(x,z)=>{const key=(x+65536)*131072+(z+65536);let h=latticeHeights.get(key);if(h===undefined){h=landscape.floorHeight(x,z);latticeHeights.set(key,h);}return h;};
 const cell=p=>`${Math.floor(p.gridX/12)},${Math.floor(p.gridZ/12)}`;
 // 포장·계단·데크와 입구 광장, 계곡 물줄기 띠·호수 수면 위에는 풀·덤불을 두지 않는다(ground-cover-mask.js·water-clearance.js). 포기 반경만큼 더 비운다.
 const sectionSites=[...(landscape.status.sectionScenery?.sites??[]),...(landscape.status.interactionProps?.clearSites??[])],water=waterClearance(points),mask=groundCoverMask(points,{nearest,sites:sectionSites,water}),GRASS_REACH=.35,shrubReach=scale=>.8*scale;
 const entranceGrid=[];let shrubWaterCleared=0;
 const summitView=summitViewCap(landscape,points),summitShrubView=summitView.stats;
 // 30m 등산로 띠. 굽은 길의 반대편까지 최근접 거리로 검사한다.
 for(let z=minZ;z<maxZ;z+=2)for(let x=minX;x<maxX;x+=2){
  const px=x+random()*1.9,pz=z+random()*1.9,h=nearest(px,pz);
  if(h.distance>30||h.distance<h.width/2+.65)continue;
  // 일주문 둘레 사각형은 아래 별도 난수로 채운다. 여기서 건너뛰어 나머지 구간의 배치(난수 순서)는 그대로 둔다.
  const entrance=entranceLocal(points,px,pz);if(Math.abs(entrance.x)<11.4&&entrance.z> -12.4&&entrance.z<34.4){entranceGrid.push({px,pz,x,z,h});continue;}
  if(sectionSites.some(s=>Math.hypot(px-s.x,pz-s.z)<s.supportRadius+1.4))continue;
  const y=landscape.floorHeight(px,pz),p={x:px,z:pz,y,gridX:x,gridZ:z,distance:h.distance,yaw:random()*6.283,scale:.65+random()*.8};
  // 구간별 밀도(forest-zones.js): 숲 구간은 빽빽하게, 능선·정상부는 지금처럼 성기게.
  if(random()<.98*grassDensity(y))add(cells,cell(p),p);
  // 덤불층(1~3m): 숲 구간 길가 2m 칸의 약 절반. 길 바로 옆은 작게 두어 길을 가리지 않는다.
  if(h.distance>h.width/2+1.4&&random()<.55*shrubDensity(y)){
   const key=`${Math.floor(px/24)},${Math.floor(pz/24)}`;if(!shrubs.has(key))shrubs.set(key,[]);
   const edge=Math.min(1,(h.distance-h.width/2-1.4)/4);
   const shrub={x:px+random()*.6-.3,z:pz+random()*.6-.3,yaw:random()*6.283,scale:(.8+random()*.95)*(.55+.45*edge),roll:random()};
   if(water.blocked(shrub.x,shrub.z,shrubReach(shrub.scale)))shrubWaterCleared++;
   else if(!mask.blocked(shrub.x,shrub.z,shrubReach(shrub.scale))&&summitView.fit(shrub))shrubs.get(key).push(shrub);
  }
  // 교목: 숲 구간 간격 약 4.5m(이전 .13 → .2). 늘린 몫(dense)은 화질 낮음에서 감춘다.
  const treeRoll=random(),density=treeDensity(y);
  if(h.distance>h.width/2+4.5&&h.distance<30&&treeRoll<.2*density&&y<605){
   const broad=random()<broadleafRatio(y),pick=random();
   const id=broad?(pick<.55?'tree_small_02':'island_tree_01'):(pick<.75?'pine_tree_01':'pine_sapling_medium');
   // 수종이 넷이라 청크를 96m로 키워 그리기 호출 수를 이전(2수종·48m)보다 늘리지 않는다.
   const dense=treeRoll>=.13*density,key=`${id}:${Math.floor(px/96)},${Math.floor(pz/96)}`;
   if(!treeGroups.has(key))treeGroups.set(key,{id,kind:'tree',forestTint:0xb6c895,placements:[],levels:[{url:`${id}-lod1.glb`,distance:0},{url:`${id}-lod2.glb`,distance:14}]});
   treeGroups.get(key).placements.push({x:px,z:pz,scale:.65+random()*.3,yaw:p.yaw,embed:.03,...(dense?{dense:true}:{})});
  }
  // 정상부는 교목 대신 절리 암봉과 작은 바위. 노면과 모델 반경을 분리한다.
  if(y>470&&h.distance>h.width/2+7&&random()<.018){
   const id='rock_face_02',key=`${Math.floor(px/48)},${Math.floor(pz/48)}`;
   if(!rocks.has(key))rocks.set(key,{id,kind:'rock',levels:[{url:`${id}-lod2.glb`,distance:0}],placements:[]});
   rocks.get(key).placements.push({x:px,z:pz,scale:y>590?1+random()*.6:.5+random()*.45,stretch:y>590?[1.1,2.2+random()*1.2,1.1]:undefined,yaw:p.yaw,embed:.3});
  }
 }
 // 일주문 둘레: 포장 밖(화단·생울타리 둘레, 문 안쪽 길 양옆)만 풀과 덤불을 채운다. 별도 난수라 다른 구간 배치는 바뀌지 않는다.
 {let entranceSeed=20261104;const r=()=>((entranceSeed=(Math.imul(entranceSeed,1664525)+1013904223)>>>0)/4294967296);
  for(const {px,pz,x,z,h} of entranceGrid){
   const y=landscape.floorHeight(px,pz),grass=r()<.98*grassDensity(y),yaw=r()*6.283,scale=.65+r()*.8;
   if(grass&&!mask.entrance(px,pz,-1))add(cells,`entrance:${cell({gridX:x,gridZ:z})}`,{x:px,z:pz,y,gridX:x,gridZ:z,distance:h.distance,yaw,scale});
   if(h.distance>h.width/2+1.4&&r()<.55*shrubDensity(y)){
    const edge=Math.min(1,(h.distance-h.width/2-1.4)/4),shrub={x:px+r()*.6-.3,z:pz+r()*.6-.3,yaw:r()*6.283,scale:(.8+r()*.95)*(.55+.45*edge),roll:r()};
    if(!mask.blocked(shrub.x,shrub.z,shrubReach(shrub.scale))){const key=`entrance:${Math.floor(px/24)},${Math.floor(pz/24)}`;if(!shrubs.has(key))shrubs.set(key,[]);shrubs.get(key).push(shrub);}
   }
  }
 }
 // 정상 주변의 넓은 암반 봉우리. 시설과 노면의 실제 여유를 검사한다.
 const summit=points.at(-1),sites=landscape.status.summitFacilities?.sites??[];
 for(let angle=0;angle<Math.PI*2;angle+=Math.PI/10){
  const radius=24+random()*14,x=summit.x+Math.sin(angle)*radius,z=summit.z+Math.cos(angle)*radius;
  const hit=nearest(x,z),y=landscape.floorHeight(x,z);
  if(hit.distance<hit.width/2+13||y<summit.y-32)continue;
  if(sites.some(site=>Math.hypot(x-site.x,z-site.z)<site.supportRadius+18))continue;
  const key=`summit:${Math.floor(x/48)},${Math.floor(z/48)}`;
  if(!rocks.has(key))rocks.set(key,{id:'rock_face_01',kind:'rock',levels:[{url:'rock_face_01-lod2.glb',distance:0}],placements:[]});
  rocks.get(key).placements.push({x,z,scale:1,stretch:[2.2,2+random()*.7,2.2],yaw:angle,embed:.35});
 }
 for(const [dx,dz] of [[4,-12],[14,-22],[-2,-24]]){
  const x=summit.x+dx,z=summit.z+dz,hit=nearest(x,z);
  if(hit.distance<hit.width/2+9||sites.some(site=>Math.hypot(x-site.x,z-site.z)<site.supportRadius+12))continue;
  const key=`summit-front:${Math.floor(x/48)},${Math.floor(z/48)}`;
  if(!rocks.has(key))rocks.set(key,{id:'rock_face_01',kind:'rock',levels:[{url:'rock_face_01-lod2.glb',distance:0}],placements:[]});
  rocks.get(key).placements.push({x,z,scale:1,stretch:[1.7,2.2,1.7],yaw:.3,embed:.2});
 }
 // 중·원경 사면의 닫힌 수관. 기존 CC0 사진판만 사용한다.
 for(let z=minZ-150;z<maxZ+150;z+=10)for(let x=minX-150;x<maxX+150;x+=10){
  const px=x+random()*5,pz=z+random()*5,h=nearest(px,pz);
  if(h.distance<30||h.distance>180)continue;
  let y;try{y=landscape.floorHeight(px,pz);}catch{continue;}
  if(!Number.isFinite(y)||y>590)continue;
  const id=random()<broadleafRatio(y)?'tree_small_02':'pine_tree_01',key=`far:${id}:${Math.floor(px/96)},${Math.floor(pz/96)}`;
  if(!treeGroups.has(key))treeGroups.set(key,{id,kind:'tree',forestTint:0xb6c895,levels:[{url:`${id}-lod2.glb`,distance:0}],placements:[]});
  treeGroups.get(key).placements.push({x:px,z:pz,scale:1+random()*.35,yaw:random()*6.283});
 }
 const vertices=[];
 // 뾰족한 3차원 곡선 풀잎 7장 + 조릿대·고사리 대용 잎. 투명 텍스처 없음.
  // 포기당 9장(이전 7장). 포기 수를 늘리지 않고 한 포기를 풍성하게 해 메모리·행렬 업로드를 그대로 둔다.
 const BLADES=9;
 for(let i=0;i<BLADES;i++){
  const a=i*2.399,r=.12+(i%4)*.025,dx=Math.cos(a),dz=Math.sin(a),h=.25+(i%3)*.12+(i%5)*.015,w=.029;
  const bx=dx*r,bz=dz*r,mx=bx+dx*.07,mz=bz+dz*.07;
  vertices.push(bx-dz*w,0,bz+dx*w,bx+dz*w,0,bz-dx*w,mx-dz*w*.6,h*.55,mz+dx*w*.6,
   bx+dz*w,0,bz-dx*w,mx+dz*w*.6,h*.55,mz-dx*w*.6,mx-dz*w*.6,h*.55,mz+dx*w*.6,
   mx-dz*w*.6,h*.55,mz+dx*w*.6,mx+dz*w*.6,h*.55,mz-dx*w*.6,bx+dx*.2,h,bz+dz*.2);
 }
 for(let i=0;i<3;i++){
  const a=i*2.399,dx=Math.cos(a),dz=Math.sin(a);
  for(let j=1;j<=2;j++)for(const side of [-1,1]){
   const r=j*.1,h=.12+j*.055,bx=dx*r,bz=dz*r;
   const tx=bx+dx*.07-dz*.12*side,tz=bz+dz*.07+dx*.12*side;
   vertices.push(bx,h,bz,tx,h+.025,tz,bx+dx*.1,h+.025,bz+dz*.1);
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setAttribute('forestLeaf',new THREE.Float32BufferAttribute(Array.from({length:vertices.length/3},(_,i)=>i>=BLADES*9?1:0),1));
 // 풀 높이와 잎 폭을 줄인다. 최대 .54×.42×1.45 ≒ .33m.
 geometry.scale(.55,.42,.55);geometry.computeVertexNormals();
 // 가는 잎의 면마다 흰 줄이 생기지 않도록 위쪽으로 완만하게 향한 노멀을 쓴다.
 const normals=geometry.attributes.normal,normal=new THREE.Vector3();
 for(let i=0;i<normals.count;i++){normal.fromBufferAttribute(normals,i).multiplyScalar(.25);normal.y+=.75;normal.normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);}
 const time={value:0},material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,envMapIntensity:.35,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.forestTime=time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float forestTime;\nattribute float forestLeaf;\nvarying float grassHeight;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec4 anchor=instanceMatrix*vec4(0.,0.,0.,1.);
   float tip=position.y*position.y;
   grassHeight=clamp(position.y/.227,0.,1.);
   transformed.x+=sin(forestTime*1.5+anchor.x*.08+anchor.z*.06)*tip*.85;
   transformed.z+=sin(forestTime*1.1+anchor.z*.07)*tip*.45;
   // 포기 수를 늘리지 않고 낮은 관목형 잎을 군락으로 섞는다.
   float understoryPatch=.5+.25*sin(anchor.x*.31)+.25*sin(anchor.z*.27);
   float fern=step(.78-understoryPatch*.35,fract(sin(anchor.x*12.9898+anchor.z*78.233)*43758.5453));
   transformed*=mix(1.,fern,forestLeaf);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float grassHeight;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(.62,1.12,grassHeight);');
 };
 material.customProgramCacheKey=()=> 'forest-blades-wind-v3-understory';
 const dummy=new THREE.Object3D(),tint=new THREE.Color(),items=[];let pavedCleared=0,waterCleared=0;
 for(const list of cells.values()){
  // 휴대폰(LIMITS.forestGrass<1)은 교차 배치의 앞부분만 만든다. 그리는 수는 아래 update에서 같은 비율로 맞춰 화면 밀도는 그대로다.
  const keep=total=>Math.ceil(total*LIMITS.forestGrass);
  const mesh=new THREE.InstancedMesh(geometry,material,list.reduce((n,p)=>n+keep(p.distance<=14?49:21),0));let i=0;
  // 포기 순서를 영역 전체에 교차 배치한다. 낮음에서도 한쪽 띠만 남기지 않는다.
  // 고정 접두부만 그리므로 화질 변경 때 행렬 업로드가 없다.
  for(let step=0;step<49;step++)for(const p of list){
   const rows=p.distance<=14?7:3,total=7*rows;if(step>=keep(total))continue;
   const j=step*(total===49?17:8)%total;
   const x=p.gridX+(j%7+.15+random()*.7)*2/7,z=p.gridZ+(Math.floor(j/7)+.15+random()*.7)*2/rows;
   const hit=nearest(x,z);if(hit.distance<hit.width/2+.25)continue;
   // 포장·계단·데크·광장 위 포기는 버린다. 다음 포기들의 난수 순서를 지키려고 크기·색 난수 3개는 그대로 쓴다.
   if(water.blocked(x,z,GRASS_REACH)){random();random();random();waterCleared++;continue;}
   if(mask.blocked(x,z,GRASS_REACH,hit)){random();random();random();pavedCleared++;continue;}
   dummy.position.set(x,grassGround(latticeHeight,x,z)+.012,z);dummy.rotation.y=p.yaw+j;
   dummy.scale.setScalar(p.scale*(.75+random()*.25));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   const patch=.5+.25*Math.sin(x*.11)+.25*Math.sin(z*.09);
   // HSL은 화면에서 고른 sRGB 값이다. 선형 공간으로 오인하면 풀이 희게 뜬다.
   tint.setHSL(.105+patch*.095,.22+random()*.13,.25+patch*.07+random()*.035,THREE.SRGBColorSpace);mesh.setColorAt(i,tint);i++;
  }
  if(!i){mesh.dispose();continue;}
  mesh.count=i;mesh.userData.metricKind='하층 식생';mesh.receiveShadow=true;
  mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.boundingBox.expandByScalar(.5);mesh.boundingSphere.radius+=.5;root.add(mesh);items.push({mesh,box:mesh.boundingBox.clone(),count:i});
 }
 // 덤불층: 24m 칸마다 InstancedMesh 하나. 잎 무더기는 층이 진 작은 잎판(삼각형 2개) 모음이며 투명 텍스처를 쓰지 않는다.
 const shrubGeometry=makeShrubGeometry(),shrubMat=shrubMaterial(),shrubItems=[],shrubRoot=new THREE.Group();shrubRoot.name='덤불층 · 바람';
 // 11월 덤불 색(sRGB): 팥배·당단풍 붉은·주황, 참나무 어린나무 갈색, 노랑, 남은 초록.
 const shrubPalette=[0x7c4630,0x8f5a36,0x6f5134,0x857242,0x56603a,0x6a3428];
 for(const list of shrubs.values()){
  if(!list.length)continue;
  const mesh=new THREE.InstancedMesh(shrubGeometry,shrubMat,list.length);
  list.forEach((p,i)=>{
   dummy.position.set(p.x,grassGround(latticeHeight,p.x,p.z)-.02,p.z);dummy.rotation.set(0,p.yaw,0);
   dummy.scale.set(p.scale*(.85+p.roll*.3),p.scale*(.8+((p.roll*7)%1)*.6),p.scale*(.85+((p.roll*3)%1)*.3));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   const patch=.5+.25*Math.sin(p.x*.05+p.z*.03)+.25*Math.sin(p.z*.07-p.x*.02),k=Math.min(shrubPalette.length-1,Math.floor((patch*.6+p.roll*.4)*shrubPalette.length));
   mesh.setColorAt(i,tint.set(shrubPalette[k]).multiplyScalar(.85+p.roll*.3));
  });
  mesh.userData.metricKind='하층 식생';mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.boundingBox.expandByScalar(1.5);mesh.boundingSphere.radius+=1.5;
  shrubRoot.add(mesh);shrubItems.push({mesh,box:mesh.boundingBox.clone(),count:list.length});
 }
 landscape.group.add(root,shrubRoot);freezeStatic(root);freezeStatic(shrubRoot);
 const culler=createChunkCuller(),update=landscape.update.bind(landscape);
 landscape.update=(camera,quality=2)=>{
  update(camera,quality);time.value=performance.now()/1000;
  // 지형·숲 컬링을 이전 결과로 둔 프레임(load-landscape.js CULL_REUSE)에는 풀·덤불 가시성·밀도도 그대로 둔다. 바람 시각만 갱신한다.
  if(landscape.status.culling?.reused){foliageUniforms.foliageTime.value=time.value;return;}
  culler.update(camera);
  let visible=0;
  // 숲 바닥 풀잎도 길가 풀과 같은 연속 거리 밀도(near-detail.js groundCoverDensity): 가까운 칸은 그대로, 먼 칸은 교차 배치된 앞부분만.
  for(const item of items){const {mesh,box,count}=item,far=[20,30,40][quality];mesh.visible=culler.visible(box,camera,far);
   mesh.count=Math.min(count,Math.ceil(count/LIMITS.forestGrass*[.22,.5,1][quality]*groundCoverDensity(box.distanceToPoint(camera.position),FOREST_GRASS_NEAR[quality],far)));if(mesh.visible)visible+=mesh.count;}
  landscape.status.scenery.visibleGrass=visible;
  // 덤불은 풀보다 멀리 보이고 화질 낮음에서 30%만 남긴다.
  let visibleShrubs=0;foliageUniforms.foliageTime.value=time.value;
  for(const {mesh,box,count} of shrubItems){mesh.visible=culler.visible(box,camera,[22,34,48][quality]);mesh.count=Math.ceil(count*[.3,.65,1][quality]);if(mesh.visible)visibleShrubs+=mesh.count;}
  landscape.status.scenery.visibleShrubs=visibleShrubs;
 };
 landscape.status.scenery={forestCorridor:30,grassRadius:[20,30,40],grassFullRadius:FOREST_GRASS_NEAR,grassDensityPerM2:[12.25,5.25],grassBlades:BLADES,shrubs:shrubItems.reduce((n,i)=>n+i.count,0),shrubRadius:[22,34,48],denseTrees:[...treeGroups.values()].reduce((n,e)=>n+e.placements.filter(p=>p.dense).length,0),zones:'forest-zones.js',grassChunkSize:12,pavedGrassCleared:pavedCleared,waterGrassCleared:waterCleared,waterShrubsCleared:shrubWaterCleared,summitShrubs:summitShrubView,grassInstances:items.reduce((n,i)=>n+i.count,0),trees:[...treeGroups.values()].reduce((n,e)=>n+e.placements.length,0),outcrops:[...rocks.values()].reduce((n,e)=>n+e.placements.length,0),speciesStatus:'임상도 미확보 · 구간별 활엽 비율(숲 75~80%, 능선 25%) 시각 대용',wind:true,layers:['소나무·참나무류 교목 시각 대용','덤불층(1~3m)','관목','고사리·조릿대형 하층'],ground:'낙엽층 PBR + 이끼 군락 · 등산로 별도 재질 유지'};
 return [...treeGroups.values(),...rocks.values()];
}

// 덤불 한 포기: 가는 줄기 5개 + 높이를 셋으로 나눈 잎판 층. 높이 약 1.2m, 반경 약 .7m(배율 1).
// 아래층 잎판은 작고 어둡게(shrubShade), 위층은 크고 밝게 해 잎 무더기가 층져 보이게 한다.
// 정상 쌍안경 시야(서울·롯데월드타워 방향 아래쪽)를 덤불이 가리지 않게: 정상 주변 45m 안 덤불은 서서 보는 눈높이(1.6m)에서
// 아래로 SUMMIT_SIGHT_DEG 내려간 시선보다 낮게 배율을 줄인다(덤불층 세로 배율 .8~1.4 포함). 자리는 그대로 두고, 너무 작아지면(배율 .3 미만) 뺀다.
// 보는 자리: 코스 마지막 15m(정상 출발 자리 포함)와 정상석. 정상석·스탬프함·안내판 자리는 바꾸지 않는다.
export const SUMMIT_SIGHT_DEG=6,SHRUB_TOP=1.12;
export function summitViewCap(landscape,points,{radius=45,eye=1.6,margin=.3}={}){
 const end=points.at(-1),marker=landscape.status.summitFacilities?.sites?.find(s=>s.id==='marker');
 const viewers=[...points.filter(p=>Number.isFinite(p.s)&&Number.isFinite(end.s)&&end.s-p.s<=15),...(marker?[marker]:[])].map(p=>({x:p.x,z:p.z,eye:landscape.floorHeight(p.x,p.z)+eye}));
 const slope=Math.tan(SUMMIT_SIGHT_DEG*Math.PI/180),stats={viewers:viewers.length,lowered:0,removed:0};
 // (x,z) 덤불 꼭대기가 넘지 말아야 할 지면 위 높이(m). 보는 자리에서 radius 밖이면 Infinity.
 function maxTop(x,z){const ground=landscape.floorHeight(x,z);let top=Infinity;for(const v of viewers){const d=Math.hypot(x-v.x,z-v.z);if(d<radius)top=Math.min(top,v.eye-d*slope-margin-ground);}return top;}
 return {viewers,maxTop,stats,fit(shrub){const top=maxTop(shrub.x,shrub.z),k=SHRUB_TOP*(.8+((shrub.roll*7)%1)*.6);if(k*shrub.scale<=top)return true;const scale=top/k;if(scale<.3){stats.removed++;return false;}shrub.scale=scale;stats.lowered++;return true;}};
}

export function makeShrubGeometry(){
 const v=[],shade=[];let seed=7;const r=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<5;i++){const a=i*1.256+r()*.4,tx=Math.cos(a)*.35,tz=Math.sin(a)*.35,top=.75+r()*.45,w=.012;
  v.push(-w,0,0,w,0,0,tx,top,tz);shade.push(.35,.35,.5);}
 // 잎판은 층마다 타원체 껍질 쪽에 몰아 덩어리 윤곽을 만들고, 안쪽에도 일부 채워 비어 보이지 않게 한다.
 for(const [layer,count,y0,y1,radius,size] of [[0,26,.16,.48,.42,.16],[1,36,.42,.82,.5,.18],[2,26,.76,1.12,.38,.19]])for(let i=0;i<count;i++){
  const a=r()*6.283,d=radius*(i%4===0?.2+r()*.5:.7+r()*.3),cy=y0+r()*(y1-y0),cx=Math.cos(a)*d,cz=Math.sin(a)*d;
  const ya=r()*6.283,tilt=.35+r()*.5,ux=Math.cos(ya)*size,uz=Math.sin(ya)*size,lx=-Math.sin(ya)*size*.55,lz=Math.cos(ya)*size*.55,ly=tilt*size*.6;
  // 잎판: 마름모 두 삼각형.
  const p0=[cx-ux,cy-ly,cz-uz],p1=[cx+lx,cy+ly*.4,cz+lz],p2=[cx+ux,cy+ly,cz+uz],p3=[cx-lx,cy-ly*.4,cz-lz];
  v.push(...p0,...p1,...p2,...p0,...p2,...p3);const s=.45+layer*.17+r()*.15;for(let k=0;k<6;k++)shade.push(s);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
 geometry.setAttribute('shrubShade',new THREE.Float32BufferAttribute(shade,1));geometry.computeVertexNormals();
 const normals=geometry.attributes.normal,n=new THREE.Vector3();
 for(let i=0;i<normals.count;i++){n.fromBufferAttribute(normals,i).multiplyScalar(.5);n.y+=.6;n.normalize();normals.setXYZ(i,n.x,n.y,n.z);}
 return geometry;
}

// 기존 흙·낙엽·풀·화강암 노멀맵 혼합을 유지하며 습한 이끼 패치를 더한다.
export function mossGround(landscape){
 const seen=new Set();
 landscape.group.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.material||seen.has(mesh.material))return;
  const material=mesh.material;if(!String(material.customProgramCacheKey?.()).includes('gwanak-slope'))return;
  seen.add(material);const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,...args){
   compile.call(this,shader,...args);
   shader.fragmentShader=shader.fragmentShader.replace('rock=max(rock,smoothstep(490.0,625.0,landWorld.y)*(.18+.65*outcrop));','rock=max(rock,smoothstep(490.0,625.0,landWorld.y)*(.78+.22*outcrop));');
   shader.fragmentShader=shader.fragmentShader.replace('vec3 forestColor=groundColor.rgb*mottling;',`vec3 forestColor=groundColor.rgb*mottling;
    float mossPatch=smoothstep(.30,.72,.5+.25*sin(landWorld.x*.61)+.25*sin(landWorld.z*.47));
    float moss=mossPatch*(1.0-smoothstep(460.,600.,landWorld.y))*(1.0-rockCover)*.82;
    float litterPatch=.5+.25*sin(landWorld.x*2.7+sin(landWorld.z*1.9))+.25*sin(landWorld.z*3.1);
    float forestFloor=(1.0-smoothstep(490.,610.,landWorld.y))*(1.0-rockCover);
    // 저지대의 풀 포기 사이도 낙엽층으로 연결한다. 바위·정상은 기존 혼합 유지.
    vec3 leafBed=texture2D(land3D,landWorld.xz/1.6).rgb*vec3(.38,.30,.20);
    forestColor=mix(forestColor,leafBed,forestFloor*(.90+.08*litterPatch));
    // 밝은 모래색에 녹색만 곱하지 않고 저채도 이끼의 색·명도를 사용한다.
    vec3 mossBed=vec3(.055,.073,.028)*(.72+.56*litterPatch);
    forestColor=mix(forestColor,mossBed,moss*.68);`);
  };
  material.customProgramCacheKey=()=>key+'-moss-v2-leaf-bed';material.needsUpdate=true;
 });
}
