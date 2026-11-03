import {entranceLocal} from '../../entrance-scenery.js';
import * as THREE from 'three';
import {indexRoute} from '../../geo.js';
import {createChunkCuller} from '../../../../src/chunk-culling.js';
import {freezeStatic} from '../../../../src/static-scene.js';

// 표시되는 2m 지형의 삼각형과 같은 보간. 함수 표면 높이만 쓰면 풀 밑동이 묻힌다.
export function grassGround(height,x,z){
 const x0=Math.floor(x/2)*2,z0=Math.floor(z/2)*2,u=(x-x0)/2,v=(z-z0)/2;
 const a=height(x0,z0),b=height(x0+2,z0),c=height(x0,z0+2),d=height(x0+2,z0+2);
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}

// 형상과 밀도는 참고 사진에 따른 시각 가정. 현장 개체 위치·수종 비율이 아니다.
export function forestLayers(landscape){
 const nearest=indexRoute(landscape.route),root=new THREE.Group();root.name='숲 층위 · 바람 풀';
 const cells=new Map(),treeGroups=new Map(),rocks=new Map();let seed=61103;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const points=landscape.route,minX=Math.min(...points.map(p=>p.x))-30,maxX=Math.max(...points.map(p=>p.x))+30,minZ=Math.min(...points.map(p=>p.z))-30,maxZ=Math.max(...points.map(p=>p.z))+30;
 const add=(map,key,p)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(p);};
 const cell=p=>`${Math.floor(p.gridX/12)},${Math.floor(p.gridZ/12)}`;
 // 30m 등산로 띠. 굽은 길의 반대편까지 최근접 거리로 검사한다.
 for(let z=minZ;z<maxZ;z+=2)for(let x=minX;x<maxX;x+=2){
  const px=x+random()*1.9,pz=z+random()*1.9,h=nearest(px,pz);
  if(h.distance>30||h.distance<h.width/2+.65)continue;
  const entrance=entranceLocal(points,px,pz);if(Math.abs(entrance.x)<11.4&&entrance.z> -12.4&&entrance.z<34.4)continue;
  if(landscape.status.sectionScenery?.sites.some(s=>Math.hypot(px-s.x,pz-s.z)<s.supportRadius+1.4))continue;
  const y=landscape.floorHeight(px,pz),p={x:px,z:pz,y,gridX:x,gridZ:z,distance:h.distance,yaw:random()*6.283,scale:.65+random()*.8};
  if(random()<(y>590?.18:.98))add(cells,cell(p),p);
  if(h.distance>h.width/2+4.5&&h.distance<30&&random()<.13&&y<605){
   const id=random()<.6?'tree_small_02':'pine_tree_01',key=`${id}:${Math.floor(px/48)},${Math.floor(pz/48)}`;
   if(!treeGroups.has(key))treeGroups.set(key,{id,kind:'tree',forestTint:0xb6c895,placements:[],levels:[{url:`${id}-lod1.glb`,distance:0},{url:`${id}-lod2.glb`,distance:14}]});
   treeGroups.get(key).placements.push({x:px,z:pz,scale:.65+random()*.3,yaw:p.yaw,embed:.03});
  }
  // 정상부는 교목 대신 절리 암봉과 작은 바위. 노면과 모델 반경을 분리한다.
  if(y>470&&h.distance>h.width/2+7&&random()<.018){
   const id='rock_face_02',key=`${Math.floor(px/48)},${Math.floor(pz/48)}`;
   if(!rocks.has(key))rocks.set(key,{id,kind:'rock',levels:[{url:`${id}-lod2.glb`,distance:0}],placements:[]});
   rocks.get(key).placements.push({x:px,z:pz,scale:y>590?1+random()*.6:.5+random()*.45,stretch:y>590?[1.1,2.2+random()*1.2,1.1]:undefined,yaw:p.yaw,embed:.3});
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
  const id=random()<.6?'tree_small_02':'pine_tree_01',key=`far:${id}:${Math.floor(px/96)},${Math.floor(pz/96)}`;
  if(!treeGroups.has(key))treeGroups.set(key,{id,kind:'tree',forestTint:0xb6c895,levels:[{url:`${id}-lod2.glb`,distance:0}],placements:[]});
  treeGroups.get(key).placements.push({x:px,z:pz,scale:1+random()*.35,yaw:random()*6.283});
 }
 const vertices=[];
 // 뾰족한 3차원 곡선 풀잎 7장 + 조릿대·고사리 대용 잎. 투명 텍스처 없음.
 for(let i=0;i<7;i++){
  const a=i*2.399,r=.15,dx=Math.cos(a),dz=Math.sin(a),h=.3+(i%3)*.12,w=.025;
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
 geometry.setAttribute('forestLeaf',new THREE.Float32BufferAttribute(Array.from({length:vertices.length/3},(_,i)=>i>=63?1:0),1));
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
 const dummy=new THREE.Object3D(),tint=new THREE.Color(),items=[];
 for(const list of cells.values()){
  const mesh=new THREE.InstancedMesh(geometry,material,list.reduce((n,p)=>n+(p.distance<=12?49:21),0));let i=0;
  // 포기 순서를 영역 전체에 교차 배치한다. 낮음에서도 한쪽 띠만 남기지 않는다.
  // 고정 접두부만 그리므로 화질 변경 때 행렬 업로드가 없다.
  for(let step=0;step<49;step++)for(const p of list){
   const rows=p.distance<=12?7:3,total=7*rows;if(step>=total)continue;
   const j=step*(total===49?17:8)%total;
   const x=p.gridX+(j%7+.15+random()*.7)*2/7,z=p.gridZ+(Math.floor(j/7)+.15+random()*.7)*2/rows;
   if(nearest(x,z).distance<nearest(x,z).width/2+.25)continue;
   dummy.position.set(x,grassGround(landscape.floorHeight,x,z)+.012,z);dummy.rotation.y=p.yaw+j;
   dummy.scale.setScalar(p.scale*(.75+random()*.25));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   const patch=.5+.25*Math.sin(x*.11)+.25*Math.sin(z*.09);
   // HSL은 화면에서 고른 sRGB 값이다. 선형 공간으로 오인하면 풀이 희게 뜬다.
   tint.setHSL(.105+patch*.095,.22+random()*.13,.25+patch*.07+random()*.035,THREE.SRGBColorSpace);mesh.setColorAt(i,tint);i++;
  }
  mesh.count=i;mesh.userData.metricKind='하층 식생';mesh.receiveShadow=true;
  mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.boundingBox.expandByScalar(.5);mesh.boundingSphere.radius+=.5;root.add(mesh);items.push({mesh,box:mesh.boundingBox.clone(),count:i});
 }
 landscape.group.add(root);freezeStatic(root);
 const culler=createChunkCuller(),update=landscape.update.bind(landscape);
 landscape.update=(camera,quality=2)=>{
  update(camera,quality);time.value=performance.now()/1000;culler.update(camera);
  let visible=0;
  for(const item of items){const {mesh,box,count}=item;mesh.visible=culler.visible(box,camera,[20,30,40][quality]);mesh.count=Math.ceil(count*[.22,.5,1][quality]);if(mesh.visible)visible+=mesh.count;}
  landscape.status.scenery.visibleGrass=visible;
 };
 landscape.status.scenery={forestCorridor:30,grassRadius:[20,30,40],grassDensityPerM2:[12.25,5.25],grassChunkSize:12,grassInstances:items.reduce((n,i)=>n+i.count,0),trees:[...treeGroups.values()].reduce((n,e)=>n+e.placements.length,0),outcrops:[...rocks.values()].reduce((n,e)=>n+e.placements.length,0),speciesStatus:'임상도 미확보 · 활엽 60%/소나무 40% 시각 대용',wind:true,layers:['소나무·참나무류 교목 시각 대용','관목','고사리·조릿대형 하층'],ground:'낙엽층 PBR + 이끼 군락 · 등산로 별도 재질 유지'};
 return [...treeGroups.values(),...rocks.values()];
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
