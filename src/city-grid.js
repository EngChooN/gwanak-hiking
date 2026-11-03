import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {freezeStatic} from './static-scene.js';
import {boxDistanceSquared} from './chunk-culling.js';
import {applyAtmosphere} from '../assets/realistic/skyline-reference.js';

export const CITY_GRID_SIZE=2000;
export const CITY_BASE_BUDGET=[100000,300000,300000];
const DIRECTIONS=8,STRIPS=128,MAX_NEAR_MESHES=49;
const triangleCount=g=>(g.index?.count??g.attributes.position.count)/3;

export function buildingAppearance(building){
 const seed=building.facadeSeed??building.id??0,r=((seed*9301+49297)%233280)/233280;
 const palettes={apartment:[0xd7d3c5,0xc6c8c2,0xb9c3c5],office:[0x819ba7,0x9dadae,0x657f90],house:[0xb3a18d,0xc6b39a,0xa59689],industrial:[0xa3a8a2,0xb5b3a8,0x909b9c]};
 const use=building.use??'house',color=new THREE.Color(palettes[use][Math.floor(r*3)]);
 const roof=new THREE.Color(use==='house'?[0x696b66,0x8c6556,0x607e79][seed%3]:use==='office'?0x617d87:0x8c9490);
 return {color,roof,use};
}
function colorBuilding(geometry,building){
 const {color,roof,use}=buildingAppearance(building),normal=geometry.attributes.normal,colors=[],types=[];
 for(let i=0;i<normal.count;i++){const c=normal.getY(i)>.5?roof:color;colors.push(c.r,c.g,c.b);types.push({apartment:0,office:1,house:2,industrial:3}[use]);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('seoulType',new THREE.Float32BufferAttribute(types,1));return geometry;
}
function facadeMaterial(source,atmosphere,basic=false){
 const material=basic?new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}):source.clone();
 material.color.set(0xffffff);material.vertexColors=true;
 // 월드 미터 기준 창문. 미분으로 픽셀보다 작은 창문을 평균색으로 수렴시킨다.
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=shader=>{
  previous.call(material,shader);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 seoulWorld;\nvarying float seoulRoof;\nattribute float seoulType;\nvarying float seoulUse;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nseoulWorld=(modelMatrix*vec4(transformed,1.0)).xyz;seoulRoof=step(0.5,normal.y);seoulUse=seoulType;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 seoulWorld;\nvarying float seoulRoof;\nvarying float seoulUse;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    vec2 spacing=seoulUse<.5?vec2(3.6,3.0):seoulUse<1.5?vec2(2.1,3.6):vec2(4.5,3.0);
    vec2 facade=vec2(seoulWorld.x+seoulWorld.z,seoulWorld.y)/spacing;
    vec2 pixel=fwidth(facade);vec2 w=fract(facade);
    float windowMask=step(.23,w.x)*step(w.x,.74)*step(.28,w.y)*step(w.y,.78);
    windowMask*=seoulUse>2.5?.3:1.0;
    float filtered=mix(windowMask,seoulUse>2.5?.08:.25,smoothstep(.16,.65,max(pixel.x,pixel.y)));
    diffuseColor.rgb*=1.0-(1.0-seoulRoof)*filtered*.30;
   `);
 };
 material.customProgramCacheKey=()=> 'seoul-facade-v1';
 // 클론의 이전 대기 셰이더를 중복 적용하지 않는다.
 return material;
}

export function buildingBounds(building){
 const box=new THREE.Box3();
 if(!Number.isFinite(building.ground)||!Number.isFinite(building.height)||building.height<0||building.footprint.length<3)throw new Error('원경 건물 범위/높이 오류');
 for(const [x,z]of building.footprint){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('원경 건물 좌표 오류');
  box.expandByPoint(new THREE.Vector3(x,building.ground,z));
  box.expandByPoint(new THREE.Vector3(x,building.ground+building.height,z));
 }return box;
}

// 원래 건물의 방위별 투영 폭과 바닥/지붕 높이로 만든 단일 평면 실루엣.
// 한 칸 전체를 최대 높이의 직육면체로 채우지 않는다. 빈 열은 그리지 않는다.
export function citySilhouette(records,bounds,direction,strips=32){
 const angle=direction*Math.PI*2/DIRECTIONS,rx=Math.cos(angle),rz=-Math.sin(angle),nx=Math.sin(angle),nz=Math.cos(angle);
 const center=bounds.getCenter(new THREE.Vector3());
 const projected=records.map(({box,building})=>{
  const values=[[box.min.x,box.min.z],[box.max.x,box.min.z],[box.min.x,box.max.z],[box.max.x,box.max.z]].map(([x,z])=>(x-center.x)*rx+(z-center.z)*rz);
  return {min:Math.min(...values),max:Math.max(...values),bottom:box.min.y,top:box.max.y,color:buildingAppearance(building??{}).color};
 });
 const min=Math.min(...projected.map(p=>p.min)),max=Math.max(...projected.map(p=>p.max)),width=(max-min)/strips;
 const positions=[],normals=[],indices=[],colors=[];
 if(width>0)for(let column=0;column<strips;column++){
  const left=min+column*width,right=left+width;
  const covered=projected.filter(p=>p.max>left&&p.min<right);if(!covered.length)continue;
  const lo=Math.max(left,Math.min(...covered.map(p=>p.min))),hi=Math.min(right,Math.max(...covered.map(p=>p.max)));
  // 투영된 평면은 원래 건물의 지면 위치와 다르므로 칸의 최저 높이까지 내린다.
  const bottom=bounds.min.y,top=Math.max(...covered.map(p=>p.top)),start=positions.length/3;
  const tint=covered.reduce((a,b)=>a.top>b.top?a:b).color;
  for(let i=0;i<4;i++)colors.push(tint.r,tint.g,tint.b);
  for(const [u,y]of [[lo,bottom],[hi,bottom],[lo,top],[hi,top]]){positions.push(center.x+rx*u,y,center.z+rz*u);normals.push(nx,0,nz);}
  indices.push(start,start+1,start+2,start+1,start+3,start+2);
 }
 return {positions,normals,indices,colors};
}

function cellGeometry(records){
 const detailed=[],simple=[];
 for(const {building,box}of records){
  const shape=new THREE.Shape(building.footprint.map(([x,z])=>new THREE.Vector2(x,-z)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:building.height,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,building.ground,0);detailed.push(colorBuilding(geometry,building));
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const cube=new THREE.BoxGeometry(size.x,size.y,size.z).translate(center.x,center.y,center.z);simple.push(colorBuilding(cube.toNonIndexed(),building));cube.dispose();
 }
 const full=mergeGeometries(detailed,false),boxes=mergeGeometries(simple,false);
 for(const geometry of [...detailed,...simple])geometry.dispose();
 if(!full||!boxes)throw new Error('2km 도시 칸 병합 실패');
 return [full,boxes];
}

export function createCityGrid({parent,material,atmosphere,status={},cellSize=CITY_GRID_SIZE}){
 const root=new THREE.Group();root.name='SeoulCity2km';root.userData.metricKind='원경 도시';parent.add(root);
 // 양면 평면의 방향별 조명 차이를 없애고 원경 지형과 같은 안개를 적용한다.
 const nearMaterial=atmosphere?applyAtmosphere(facadeMaterial(material,atmosphere),atmosphere):facadeMaterial(material,atmosphere);
 const farMaterial=atmosphere?applyAtmosphere(facadeMaterial(material,atmosphere,true),atmosphere):facadeMaterial(material,atmosphere,true);
 const seenBuildings=new Set();
 const cells=new Map(),far=new THREE.Mesh(new THREE.BufferGeometry(),farMaterial);far.name='도시 원경 실루엣 통합';far.frustumCulled=false;far.visible=false;root.add(far);
 let dirty=false,closed=false,farKey='',templateIndices;
 function addBuildings(buildings){
  if(closed)throw new Error('해제한 도시');
  const records=buildings.filter(b=>{if(b.id===undefined)return true;if(seenBuildings.has(b.id))return false;seenBuildings.add(b.id);return true;}).map(building=>({building,box:buildingBounds(building)}));
  for(const {building,box}of records){
   const center=box.getCenter(new THREE.Vector3()),key=`${Math.floor(center.x/cellSize)},${Math.floor(center.z/cellSize)}`;
   if(!cells.has(key))cells.set(key,{key,records:[],bounds:new THREE.Box3(),dirty:true});
   const cell=cells.get(key);cell.records.push({building,box});cell.bounds.union(box);cell.dirty=true;
  }dirty=true;return records.length;
 }
 async function finalize(){
  if(closed)throw new Error('해제한 도시');if(!dirty)return;
  let slice=performance.now();
  for(const cell of cells.values())if(cell.dirty){
   const geometries=cellGeometry(cell.records);
   if(closed){geometries.forEach(g=>g.dispose());throw new Error('해제한 도시');}
   if(cell.geometries)cell.geometries.forEach(g=>g.dispose());
   cell.geometries=geometries;cell.triangles=geometries.map(triangleCount);
   if(!cell.mesh){cell.mesh=new THREE.Mesh(geometries[0],nearMaterial);cell.mesh.name=`도시 ${cell.key}`;cell.mesh.frustumCulled=false;root.add(cell.mesh);}
   cell.mesh.geometry=geometries[0];cell.mesh.visible=false;cell.center=cell.bounds.getCenter(new THREE.Vector3());cell.dirty=false;
   if(performance.now()-slice>6){await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();}
  }
  if(closed)throw new Error('해제한 도시');
  const minimumBudget=Math.min(...CITY_BASE_BUDGET);
  if(cells.size*2>minimumBudget)throw new Error('도시 칸 수가 최소 실루엣 예산을 초과함');
  const strips=Math.max(1,Math.min(STRIPS,Math.floor(minimumBudget/(2*cells.size))));
  const positions=[],normals=[],indices=[],colors=[],types=[];let farCapacity=0;
  for(const cell of cells.values()){
   cell.ranges=[];
   for(let direction=0;direction<DIRECTIONS;direction++){
    const silhouette=citySilhouette(cell.records,cell.bounds,direction,strips),offset=positions.length/3;
    cell.ranges.push({start:indices.length,count:silhouette.indices.length});
    for(let i=0;i<silhouette.positions.length/3;i++)types.push(0);for(const value of silhouette.colors)colors.push(value);for(const value of silhouette.positions)positions.push(value);for(const value of silhouette.normals)normals.push(value);
    for(const value of silhouette.indices)indices.push(value+offset);
   }
   // 원경 높음: 넓은 평면 벽 대신 공간별 대표 건물을 실제 밑동·지붕이 있는 상자로 보존한다.
   const buckets=new Map();
   for(const record of cell.records){const c=record.box.getCenter(new THREE.Vector3()),key=`${Math.floor(c.x/125)},${Math.floor(c.z/125)}`;const old=buckets.get(key);if(!old||record.building.height>old.building.height)buckets.set(key,record);}
   const limit=Math.max(1,Math.floor(CITY_BASE_BUDGET[2]/(cells.size*12)));
   const samples=[...buckets.values()].sort((a,b)=>b.building.height-a.building.height).slice(0,limit);
   const proxyStart=indices.length;
   for(const {box,building}of samples){
    const size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
    const g=colorBuilding(new THREE.BoxGeometry(size.x,size.y,size.z).toNonIndexed().translate(c.x,c.y,c.z),building),offset=positions.length/3;
    for(const v of g.attributes.seoulType.array)types.push(v);for(const v of g.attributes.position.array)positions.push(v);for(const v of g.attributes.normal.array)normals.push(v);for(const v of g.attributes.color.array)colors.push(v);
    for(let i=0;i<g.attributes.position.count;i++)indices.push(offset+i);g.dispose();
   }
   cell.proxyRange={start:proxyStart,count:indices.length-proxyStart};
   farCapacity+=Math.max(cell.proxyRange.count,...cell.ranges.map(r=>r.count));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('seoulType',new THREE.Float32BufferAttribute(types,1));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(farCapacity),1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  templateIndices=new Uint32Array(indices);far.geometry.dispose();far.geometry=geometry;far.visible=false;farKey='';
  dirty=false;freezeStatic(root);status.cityGrid={cellSize,cells:cells.size,nodes:root.children.length,silhouetteStrips:strips};
 }
 function update(camera,quality,culler){
  if(closed||dirty||!templateIndices)return;
  const visible=[];let distanceRejected=0,frustumTests=0;
  for(const cell of cells.values()){
   cell.mesh.visible=false;
   const distanceSq=boxDistanceSquared(cell.bounds,camera.position);
   if(distanceSq>camera.far*camera.far){distanceRejected++;continue;}
   frustumTests++;if(!culler.inFrustum(cell.bounds))continue;
   const angle=Math.atan2(camera.position.x-cell.center.x,camera.position.z-cell.center.z);
   const direction=((Math.round(angle/(Math.PI*2/DIRECTIONS))%DIRECTIONS)+DIRECTIONS)%DIRECTIONS;
   visible.push({cell,distanceSq,direction,range:quality===2?cell.proxyRange:cell.ranges[direction]});
  }
  visible.sort((a,b)=>a.distanceSq-b.distanceSq);
  let triangles=visible.reduce((sum,item)=>sum+item.range.count/3,0),nearMeshes=0,detailed=0,simple=0;const distant=[];
  for(const item of visible){
   const {cell,distanceSq,range}=item,near=[0,1000,2000][quality],middle=[2000,3500,5000][quality];
   let level=distanceSq<near*near?0:distanceSq<middle*middle?1:2;
   const remaining=CITY_BASE_BUDGET[quality]-triangles+range.count/3;
   while(level<2&&(cell.triangles[level]>remaining||nearMeshes>=MAX_NEAR_MESHES))level++;
   if(level<2){cell.mesh.geometry=cell.geometries[level];cell.mesh.visible=true;triangles+=cell.triangles[level]-range.count/3;nearMeshes++;if(level===0)detailed++;else simple++;}
   else distant.push(item);
  }
  const key=distant.map(item=>`${item.cell.key}:${item.direction}:${quality}`).join(';');
  if(farKey!==key){
   let count=0;const index=far.geometry.index;
   for(const {range}of distant){index.array.set(templateIndices.subarray(range.start,range.start+range.count),count);count+=range.count;}
   index.needsUpdate=true;far.geometry.setDrawRange(0,count);farKey=key;
  }
  far.visible=distant.length>0;
  status.cityGrid={...status.cityGrid,visibleCells:visible.length,detailedCells:detailed,simpleCells:simple,silhouetteCells:quality===2?0:distant.length,proxyCells:quality===2?distant.length:0,frustumTests,distanceRejected,baseTriangles:triangles,baseDrawCalls:nearMeshes+(far.visible?1:0),baseTriangleBudget:CITY_BASE_BUDGET[quality]};
 }
 function dispose(){closed=true;root.removeFromParent();for(const cell of cells.values())cell.geometries?.forEach(g=>g.dispose());far.geometry.dispose();nearMaterial.dispose();if(farMaterial!==material)farMaterial.dispose();cells.clear();}
 return {root,cells,addBuildings,finalize,update,dispose};
}

// OSM 도로 중심선을 실제 DEM 위에 드레이프한다. 교량은 수면 위의 독립 데크다.
export function seoulRoadGeometry(roads,heightAt){
 const positions=[],colors=[],roadColor=new THREE.Color(0x484b4b),bridgeColor=new THREE.Color(0x98978e);
 for(const road of roads){
  for(let i=1;i<road.points.length;i++){
   const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.1)continue;
   const w=road.width/2,nx=-dz/len*w,nz=dx/len*w,steps=Math.max(1,Math.ceil(len/60));
   for(let j=0;j<steps;j++){
    const t=j/steps,u=(j+1)/steps,x0=ax+dx*t,z0=az+dz*t,x1=ax+dx*u,z1=az+dz*u;
    const h=(x,z)=>road.bridge?Math.max(24,heightAt(ax,az),heightAt(bx,bz))+2:heightAt(x,z)+1.3;
    const vertices=[[x0+nx,h(x0+nx,z0+nz),z0+nz],[x0-nx,h(x0-nx,z0-nz),z0-nz],[x1+nx,h(x1+nx,z1+nz),z1+nz],[x1-nx,h(x1-nx,z1-nz),z1-nz]];
    const c=road.bridge?bridgeColor:roadColor;for(const k of [0,2,1,1,2,3]){positions.push(...vertices[k]);colors.push(c.r,c.g,c.b);}
   }
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}

export function createSeoulLandmark(p,atmosphere){
 const group=new THREE.Group();group.name=p.name;group.position.set(p.x,p.ground,p.z);group.userData={...p,source:'산리서치 data/reference/landmarks.csv'};
 if(p.shape==='reference')return group;
 const material=applyAtmosphere(new THREE.MeshStandardMaterial({color:p.shape==='box'?0xb59a60:0xa5bac4,roughness:.35,metalness:.45}),atmosphere);
 const add=(g,y,rotation=0)=>{const mesh=new THREE.Mesh(g,material);mesh.position.y=y;mesh.rotation.y=rotation;group.add(mesh);};
 if(p.shape==='box'){
  // 63: 세로로 긴 금빛 판상 타워, 상단의 작은 후퇴층.
  add(new THREE.BoxGeometry(p.width,p.height*.95,p.depth),p.height*.475,.25);
  add(new THREE.BoxGeometry(p.width*.82,p.height*.05,p.depth*.85),p.height*.975,.25);
 }else if(p.shape==='taper'){
  // 롯데: 볼록한 곡선으로 좁아지는 팔각 평면과 갈라진 첨두.
  const ys=[0,.18,.40,.63,.80,.94,1],rs=[1,1.02,.88,.68,.46,.22,.035];
  const points=ys.map((y,i)=>new THREE.Vector2(p.radius*rs[i],p.height*y));
  add(new THREE.LatheGeometry(points,16),0);
 }else{
  // 남산타워: 콘크리트 몸체·두꺼운 전망대·상부 철탑.
  add(new THREE.CylinderGeometry(4,7,p.height*.56,12),p.height*.28);
  add(new THREE.CylinderGeometry(17,15,p.height*.08,20),p.height*.60);
  add(new THREE.CylinderGeometry(5,8,p.height*.10,12),p.height*.69);
  add(new THREE.CylinderGeometry(.7,2,p.height*.26,8),p.height*.87);
 }
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(25,49,48,.8)';ctx.fillRect(0,0,512,80);ctx.font='500 36px sans-serif';ctx.textAlign='center';ctx.fillStyle='#f5f1dc';ctx.fillText(p.name,256,53);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));label.name='서울 이름표';label.userData.seoulLabel=true;label.visible=false;label.scale.set(1300,203,1);label.position.y=p.height+140;group.add(label);return group;
}

export function bindSeoulLabels(root,status){
 let visible=false;status.cityLabels=false;
 const key=e=>{if(e.code!=='KeyL'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)return;visible=!visible;root.traverse(o=>{if(o.userData.seoulLabel)o.visible=visible;});status.cityLabels=visible;};
 window.addEventListener('keydown',key);
 const credit=document.createElement('a');credit.href='https://www.openstreetmap.org/copyright';credit.target='_blank';credit.rel='noopener';credit.textContent='© OpenStreetMap contributors · ODbL · L: 이름표';credit.style.cssText='position:fixed;right:12px;bottom:6px;font-size:10px;color:#e2e7e6;text-shadow:0 1px 3px #111;z-index:3';document.body.append(credit);
 return ()=>{window.removeEventListener('keydown',key);credit.remove();};
}
