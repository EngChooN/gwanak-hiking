import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {freezeStatic} from './static-scene.js';
import {boxDistanceSquared} from './chunk-culling.js';
import {applyAtmosphere} from '../assets/realistic/skyline-reference.js';

export const CITY_GRID_SIZE=2000;
export const CITY_BASE_BUDGET=[100000,300000,300000];
const DIRECTIONS=8,STRIPS=32,MAX_NEAR_MESHES=49;
const triangleCount=g=>(g.index?.count??g.attributes.position.count)/3;

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
export function citySilhouette(records,bounds,direction,strips=STRIPS){
 const angle=direction*Math.PI*2/DIRECTIONS,rx=Math.cos(angle),rz=-Math.sin(angle),nx=Math.sin(angle),nz=Math.cos(angle);
 const center=bounds.getCenter(new THREE.Vector3());
 const projected=records.map(({box})=>{
  const values=[[box.min.x,box.min.z],[box.max.x,box.min.z],[box.min.x,box.max.z],[box.max.x,box.max.z]].map(([x,z])=>(x-center.x)*rx+(z-center.z)*rz);
  return {min:Math.min(...values),max:Math.max(...values),bottom:box.min.y,top:box.max.y};
 });
 const min=Math.min(...projected.map(p=>p.min)),max=Math.max(...projected.map(p=>p.max)),width=(max-min)/strips;
 const positions=[],normals=[],indices=[];
 if(width>0)for(let column=0;column<strips;column++){
  const left=min+column*width,right=left+width;
  const covered=projected.filter(p=>p.max>left&&p.min<right);if(!covered.length)continue;
  const lo=Math.max(left,Math.min(...covered.map(p=>p.min))),hi=Math.min(right,Math.max(...covered.map(p=>p.max)));
  // 투영된 평면은 원래 건물의 지면 위치와 다르므로 칸의 최저 높이까지 내린다.
  const bottom=bounds.min.y,top=Math.max(...covered.map(p=>p.top)),start=positions.length/3;
  for(const [u,y]of [[lo,bottom],[hi,bottom],[lo,top],[hi,top]]){positions.push(center.x+rx*u,y,center.z+rz*u);normals.push(nx,0,nz);}
  indices.push(start,start+1,start+2,start+1,start+3,start+2);
 }
 return {positions,normals,indices};
}

function cellGeometry(records){
 const detailed=[],simple=[];
 for(const {building,box}of records){
  const shape=new THREE.Shape(building.footprint.map(([x,z])=>new THREE.Vector2(x,-z)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:building.height,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,building.ground,0);detailed.push(geometry);
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const cube=new THREE.BoxGeometry(size.x,size.y,size.z).translate(center.x,center.y,center.z);simple.push(cube.toNonIndexed());cube.dispose();
 }
 const full=mergeGeometries(detailed,false),boxes=mergeGeometries(simple,false);
 for(const geometry of [...detailed,...simple])geometry.dispose();
 if(!full||!boxes)throw new Error('2km 도시 칸 병합 실패');
 return [full,boxes];
}

export function createCityGrid({parent,material,atmosphere,status={},cellSize=CITY_GRID_SIZE}){
 const root=new THREE.Group();root.name='SeoulCity2km';root.userData.metricKind='원경 도시';parent.add(root);
 // 양면 평면의 방향별 조명 차이를 없애고 원경 지형과 같은 안개를 적용한다.
 const farMaterial=atmosphere?applyAtmosphere(new THREE.MeshBasicMaterial({color:0x788278,side:THREE.DoubleSide}),atmosphere):material;
 const cells=new Map(),far=new THREE.Mesh(new THREE.BufferGeometry(),farMaterial);far.name='도시 원경 실루엣 통합';far.frustumCulled=false;far.visible=false;root.add(far);
 let dirty=false,closed=false,farKey='',templateIndices;
 function addBuildings(buildings){
  if(closed)throw new Error('해제한 도시');
  const records=buildings.map(building=>({building,box:buildingBounds(building)}));
  for(const {building,box}of records){
   const center=box.getCenter(new THREE.Vector3()),key=`${Math.floor(center.x/cellSize)},${Math.floor(center.z/cellSize)}`;
   if(!cells.has(key))cells.set(key,{key,records:[],bounds:new THREE.Box3(),dirty:true});
   const cell=cells.get(key);cell.records.push({building,box});cell.bounds.union(box);cell.dirty=true;
  }dirty=true;
 }
 async function finalize(){
  if(closed)throw new Error('해제한 도시');if(!dirty)return;
  let slice=performance.now();
  for(const cell of cells.values())if(cell.dirty){
   const geometries=cellGeometry(cell.records);
   if(closed){geometries.forEach(g=>g.dispose());throw new Error('해제한 도시');}
   if(cell.geometries)cell.geometries.forEach(g=>g.dispose());
   cell.geometries=geometries;cell.triangles=geometries.map(triangleCount);
   if(!cell.mesh){cell.mesh=new THREE.Mesh(geometries[0],material);cell.mesh.name=`도시 ${cell.key}`;cell.mesh.frustumCulled=false;root.add(cell.mesh);}
   cell.mesh.geometry=geometries[0];cell.mesh.visible=false;cell.center=cell.bounds.getCenter(new THREE.Vector3());cell.dirty=false;
   if(performance.now()-slice>6){await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();}
  }
  if(closed)throw new Error('해제한 도시');
  const minimumBudget=Math.min(...CITY_BASE_BUDGET);
  if(cells.size*2>minimumBudget)throw new Error('도시 칸 수가 최소 실루엣 예산을 초과함');
  const strips=Math.max(1,Math.min(STRIPS,Math.floor(minimumBudget/(2*cells.size))));
  const positions=[],normals=[],indices=[];let farCapacity=0;
  for(const cell of cells.values()){
   cell.ranges=[];
   for(let direction=0;direction<DIRECTIONS;direction++){
    const silhouette=citySilhouette(cell.records,cell.bounds,direction,strips),offset=positions.length/3;
    cell.ranges.push({start:indices.length,count:silhouette.indices.length});
    for(const value of silhouette.positions)positions.push(value);for(const value of silhouette.normals)normals.push(value);
    for(const value of silhouette.indices)indices.push(value+offset);
   }
   farCapacity+=Math.max(...cell.ranges.map(r=>r.count));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
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
   visible.push({cell,distanceSq,direction,range:cell.ranges[direction]});
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
  const key=distant.map(item=>`${item.cell.key}:${item.direction}`).join(';');
  if(farKey!==key){
   let count=0;const index=far.geometry.index;
   for(const {range}of distant){index.array.set(templateIndices.subarray(range.start,range.start+range.count),count);count+=range.count;}
   index.needsUpdate=true;far.geometry.setDrawRange(0,count);farKey=key;
  }
  far.visible=distant.length>0;
  status.cityGrid={...status.cityGrid,visibleCells:visible.length,detailedCells:detailed,simpleCells:simple,silhouetteCells:distant.length,frustumTests,distanceRejected,baseTriangles:triangles,baseDrawCalls:nearMeshes+(far.visible?1:0),baseTriangleBudget:CITY_BASE_BUDGET[quality]};
 }
 function dispose(){closed=true;root.removeFromParent();for(const cell of cells.values())cell.geometries?.forEach(g=>g.dispose());far.geometry.dispose();if(farMaterial!==material)farMaterial.dispose();cells.clear();}
 return {root,cells,addBuildings,finalize,update,dispose};
}
