import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {freezeStatic} from './static-scene.js';
import {boxDistanceSquared} from './chunk-culling.js';
import {applyAtmosphere} from '../assets/realistic/skyline-reference.js';
import {CITY_TYPES,cityFacadeMaterial,setFacadeAttributes,updateCityLight} from './city-facade.js';
import {landmarkGeometry} from './city-landmarks.js';
import {LIMITS} from './device-profile.js';

export const CITY_GRID_SIZE=2000;
export const CITY_BASE_BUDGET=[100000,300000,300000];
const DIRECTIONS=8,STRIPS=128,MAX_NEAR_MESHES=49;
const triangleCount=g=>(g.index?.count??g.attributes.position.count)/3;

// 평면 모양(긴 변/짧은 변)과 면적. 아파트 판상동·업무 건물 구분에 쓴다.
function footprintShape(footprint){
 let cx=0,cz=0;for(const [x,z]of footprint){cx+=x;cz+=z;}cx/=footprint.length;cz/=footprint.length;
 let xx=0,zz=0,xz=0;for(const [x,z]of footprint){xx+=(x-cx)**2;zz+=(z-cz)**2;xz+=(x-cx)*(z-cz);}
 const tr=xx+zz,det=xx*zz-xz*xz,disc=Math.sqrt(Math.max(0,tr*tr/4-det)),a=tr/2+disc,b=Math.max(1e-6,tr/2-disc);
 let area=0;for(let i=0;i<footprint.length;i++){const [x0,z0]=footprint[i],[x1,z1]=footprint[(i+1)%footprint.length];area+=x0*z1-x1*z0;}
 return {aspect:Math.sqrt(a/b),area:Math.abs(area)/2,cx,cz};
}
// OSM 용도가 'yes'(미상)라 저층 주택으로 분류된 높은 건물을 모양으로 다시 나눈다(추정).
// 길쭉한 판상(장단비 2.2 이상)·100m 이하 → 아파트, 그 외 → 업무.
export function facadeUse(building){
 const use=building.use??'house';
 if(use!=='house'||!(building.height>=24)||!building.footprint?.length)return use;
 const {aspect}=footprintShape(building.footprint);
 return aspect>=2.2&&building.height<=100?'apartment':'office';
}
const seedOf=building=>{const seed=building.facadeSeed??building.id??0;return ((seed*9301+49297)%233280)/233280;};
// 서울 실사 사진 기준 외벽 팔레트(추정): 아파트 흰·미색·옅은 회청, 업무 유리 청록·회청·석재, 저층 붉은 벽돌·베이지·회색, 학교 미색, 공장 회녹.
const PALETTES={
 apartment:[0xe6e2d6,0xd9d6cc,0xcfd4d3,0xe3dccb,0xc9cdc9,0xdcd2c0],
 office:[0x7f98a3,0x92a6ab,0x5f7a88,0xa9aaa3,0xb7b2a6,0x6e8a8f],
 house:[0xa8806a,0xb79c84,0xc6b59d,0x9b8a7d,0xb8aea2,0x8f6f5d,0xcbbfa9],
 school:[0xd8c7a0,0xc9a98a,0xd3c9b4],
 industrial:[0xa3a8a2,0xb5b3a8,0x909b9c,0x8ea0a6],
};
const ROOFS={house:[0x6c706a,0x7d8f7e,0x6a8f86,0x8c6556,0x8a8a84],apartment:[0x8b8f8c,0x7f9a8e,0x9a9a94],office:[0x6d777b,0x868b8a],industrial:[0x8c9490,0x7d8b92,0x9aa09c]};
export function buildingAppearance(building){
 const r=seedOf(building),use=facadeUse(building);
 const school=use==='house'&&/school|university|kindergarten/.test(building.buildingType??'');
 const palette=school?PALETTES.school:PALETTES[use]??PALETTES.house;
 const color=new THREE.Color(palette[Math.floor(r*palette.length)%palette.length]);
 // 같은 색이라도 건물마다 밝기·채도가 조금씩 다르다.
 const hsl={};color.getHSL(hsl);color.setHSL(hsl.h+(r*13%1-.5)*.02,Math.max(0,hsl.s*(.85+(r*7%1)*.3)),Math.min(.95,hsl.l*(.93+(r*29%1)*.14)));
 const roofs=ROOFS[use]??ROOFS.house,roof=new THREE.Color(roofs[Math.floor((r*97)%1*roofs.length)]);
 return {color,roof,use};
}
function colorBuilding(geometry,building){
 const {color,roof,use}=buildingAppearance(building);
 return setFacadeAttributes(geometry,{type:CITY_TYPES[use]??CITY_TYPES.house,seed:seedOf(building),base:building.ground,height:building.height,color,roof});
}
// 옥상 설비: 20m 이상 건물에 기계실·실외기·물탱크 상자, 60m 이상은 네 모서리 항공장애등.
// 설비 높이는 건물 높이 안에 넣는다(본체 지붕을 설비 높이만큼 낮춤) → 범위·높이 자료가 그대로다.
export const EQUIPMENT_MIN_HEIGHT=20;
function roofEquipment(building){
 const h=building.height;if(!(h>=EQUIPMENT_MIN_HEIGHT))return {roofDrop:0,parts:[]};
 const {cx,cz,area}=footprintShape(building.footprint),r=seedOf(building),parts=[];
 if(area<120)return {roofDrop:0,parts:[]};
 const drop=Math.min(4,h*.08),top=building.ground+h,roof=top-drop,size=Math.min(Math.sqrt(area)*.32,14);
 const inside=(x,z)=>{let hit=false;const f=building.footprint;for(let i=0,j=f.length-1;i<f.length;j=i++){const [xi,zi]=f[i],[xj,zj]=f[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)hit=!hit;}return hit;};
 const add=(x,z,w,d,ht,type,color)=>{if(!inside(x,z))return;const g=new THREE.BoxGeometry(w,ht,d).toNonIndexed().translate(x,roof+ht/2,z);parts.push(setFacadeAttributes(g,{type,seed:r,base:roof,height:ht,color:new THREE.Color(color)}));};
 // 계단·승강기 기계실(건물 높이까지).
 add(cx,cz,size,size*.7,drop,CITY_TYPES.equipment,0xb9b6ad);
 // 실외기·물탱크(조금 낮게).
 const off=size*.9,angle=r*Math.PI*2;
 add(cx+Math.cos(angle)*off,cz+Math.sin(angle)*off,size*.55,size*.4,drop*.55,CITY_TYPES.equipment,0x9aa0a0);
 if(h>=40)add(cx-Math.cos(angle)*off,cz-Math.sin(angle)*off,size*.4,size*.4,drop*.75,CITY_TYPES.equipment,0x7f8a8c);
 if(h>=60){
  // 지붕 네 귀퉁이 대신 평면 주축 양끝(설비가 없는 쪽)에 2개.
  for(const s of [1,-1])add(cx+Math.cos(angle+Math.PI/2)*off*s,cz+Math.sin(angle+Math.PI/2)*off*s,1.2,1.2,1.2,CITY_TYPES.beacon,0xff2a1a);
 }
 return {roofDrop:drop,parts};
}
// 원경 통합(실루엣·상자)용 정점 속성 묶음.
function pushInfo(target,count,building){const s=seedOf(building??{}),g=building?.ground??0,h=building?.height??10;for(let i=0;i<count;i++)target.push(s,g,h);}

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
export function citySilhouette(records,bounds,direction,strips=32,out=null){
 const angle=direction*Math.PI*2/DIRECTIONS,rx=Math.cos(angle),rz=-Math.sin(angle),nx=Math.sin(angle),nz=Math.cos(angle);
 const center=bounds.getCenter(new THREE.Vector3());
 // 건물마다 투영 구간 하나. 칸마다 전체를 다시 거르지 않고 건물이 걸치는 열만 갱신한다(2026-11-06 휴대폰 힙 최고치 절감, 결과는 이전과 같다).
 const n=records.length,pMin=new Float64Array(n),pMax=new Float64Array(n);let min=Infinity,max=-Infinity;
 for(let i=0;i<n;i++){const box=records[i].box,ax=(box.min.x-center.x)*rx,bx=(box.max.x-center.x)*rx,az=(box.min.z-center.z)*rz,bz=(box.max.z-center.z)*rz;
  const lo=Math.min(ax,bx)+Math.min(az,bz),hi=Math.max(ax,bx)+Math.max(az,bz);
  pMin[i]=lo;pMax[i]=hi;if(lo<min)min=lo;if(hi>max)max=hi;}
 const width=(max-min)/strips;
 // out(선택): 원경 통합 버퍼에 바로 쓴다(finalize). 없으면 이전처럼 배열을 새로 만들어 돌려준다.
 const {positions,normals,indices,colors,info,types}=out??{positions:[],normals:[],indices:[],colors:[],info:[],types:[]},count=a=>a.n??a.length,indexStart=count(indices);
 if(!(width>0))return {positions,normals,indices,colors,info,types,indexCount:0};
 const colLo=new Float64Array(strips).fill(Infinity),colHi=new Float64Array(strips).fill(-Infinity),tallest=new Int32Array(strips).fill(-1);
 for(let i=0;i<n;i++){
  const c0=Math.max(0,Math.floor((pMin[i]-min)/width)-1),c1=Math.min(strips-1,Math.ceil((pMax[i]-min)/width));
  for(let column=c0;column<=c1;column++){const left=min+column*width,right=left+width;if(!(pMax[i]>left&&pMin[i]<right))continue;
   if(pMin[i]<colLo[column])colLo[column]=pMin[i];if(pMax[i]>colHi[column])colHi[column]=pMax[i];
   const t=tallest[column];if(t<0||!(records[t].box.max.y>records[i].box.max.y))tallest[column]=i;}
 }
 for(let column=0;column<strips;column++){
  const t=tallest[column];if(t<0)continue;
  const left=min+column*width,right=left+width,lo=Math.max(left,colLo[column]),hi=Math.min(right,colHi[column]);
  // 투영된 평면은 원래 건물의 지면 위치와 다르므로 칸의 최저 높이까지 내린다.
  const building=records[t].building??{},bottom=bounds.min.y,top=records[t].box.max.y,start=count(positions)/3;
  const look=appearanceOf(building),tint=look.color,type=CITY_TYPES[look.use]??CITY_TYPES.house,seed=seedOf(building);
  for(let i=0;i<4;i++){colors.push(tint.r);colors.push(tint.g);colors.push(tint.b);info.push(seed);info.push(bottom);info.push(top-bottom);types.push(type);
   const u=i&1?hi:lo,y=i&2?top:bottom;positions.push(center.x+rx*u);positions.push(y);positions.push(center.z+rz*u);normals.push(nx);normals.push(0);normals.push(nz);}
  for(const k of QUAD)indices.push(start+k);
 }
 return {positions,normals,indices,colors,info,types,indexCount:count(indices)-indexStart};
}
// 길이를 모르는 typed array 쓰기(두 배씩 늘림). done()은 쓴 길이만큼 잘라 돌려준다.
function growable(Type){let a=new Type(1<<14),n=0;const grow=need=>{if(need>a.length){let m=a.length;while(m<need)m*=2;const b=new Type(m);b.set(a.subarray(0,n));a=b;}};
 return {get n(){return n;},push(v){if(n>=a.length)grow(n+1);a[n++]=v;},add(list){grow(n+list.length);for(let i=0;i<list.length;i++)a[n++]=list[i];},done(){return a.slice(0,n);}};}
const QUAD=[0,1,2,1,3,2],appearances=new WeakMap();
function appearanceOf(building){let a=appearances.get(building);if(!a){a=buildingAppearance(building);appearances.set(building,a);}return a;}

// pause: 건물 하나마다 부르는 비동기 함수(준비 완료 뒤 뒤에서 만들 때 프레임을 넘겨 주려고, 2026-11-06). 결과는 같다.
// withDetail=false(휴대폰): 밑면 모양 상세 지오메트리 없이 상자만 만들어 두 단계에 같이 쓴다(메모리 약 1/2).
async function cellGeometry(records,pause=null,withDetail=true){
 const detailed=[],simple=[];
 for(const {building,box}of records){
  if(pause)await pause();
  if(withDetail){const {roofDrop,parts}=roofEquipment(building);
  const shape=new THREE.Shape(building.footprint.map(([x,z])=>new THREE.Vector2(x,-z)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:building.height-roofDrop,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,building.ground,0);detailed.push(colorBuilding(geometry,building),...parts);}
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const cube=new THREE.BoxGeometry(size.x,size.y,size.z).translate(center.x,center.y,center.z);simple.push(colorBuilding(cube.toNonIndexed(),building));cube.dispose();
 }
 for(const g of [...detailed,...simple])for(const name of Object.keys(g.attributes))if(!['position','normal','color','seoulType','seoulInfo'].includes(name))g.deleteAttribute(name);
 const boxes=mergeGeometries(simple,false),full=withDetail?mergeGeometries(detailed,false):boxes;
 for(const geometry of [...detailed,...simple])geometry.dispose();
 if(!full||!boxes)throw new Error('2km 도시 칸 병합 실패');
 return [full,boxes];
}

// exclude: [{x,z,radius,minHeight}] — 전용 모델이 있는 랜드마크 자리의 OSM 건물(예: 63빌딩 252m)을 빼서 겹치지 않게 한다.
export function createCityGrid({parent,material,atmosphere,status={},cellSize=CITY_GRID_SIZE,exclude=[]}){
 const root=new THREE.Group();root.name='SeoulCity2km';root.userData.metricKind='원경 도시';parent.add(root);
 // 양면 평면의 방향별 조명 차이를 없애고 원경 지형과 같은 안개를 적용한다.
 const nearMaterial=atmosphere?applyAtmosphere(cityFacadeMaterial(material),atmosphere):cityFacadeMaterial(material);
 const farMaterial=atmosphere?applyAtmosphere(cityFacadeMaterial(material,{basic:true}),atmosphere):cityFacadeMaterial(material,{basic:true});
 const nightLights=[];
 const seenBuildings=new Set();
 const cells=new Map(),far=new THREE.Mesh(new THREE.BufferGeometry(),farMaterial);far.name='도시 원경 실루엣 통합';far.frustumCulled=false;far.visible=false;root.add(far);
 let dirty=false,closed=false,farKey='',templateIndices;
 function addBuildings(buildings){
  if(closed)throw new Error('해제한 도시');
  const excluded=b=>exclude.length&&b.footprint?.length&&exclude.some(e=>{if(!(b.height>=e.minHeight))return false;const {cx,cz}=footprintShape(b.footprint);return Math.hypot(cx-e.x,cz-e.z)<e.radius;});
  const records=buildings.filter(b=>{if(b.id!==undefined){if(seenBuildings.has(b.id))return false;seenBuildings.add(b.id);}if(excluded(b)){status.cityExcluded=(status.cityExcluded??0)+1;return false;}return true;}).map(building=>({building,box:buildingBounds(building)}));
  for(const {building,box}of records){
   const center=box.getCenter(new THREE.Vector3()),key=`${Math.floor(center.x/cellSize)},${Math.floor(center.z/cellSize)}`;
   if(!cells.has(key))cells.set(key,{key,records:[],bounds:new THREE.Box3(),dirty:true});
   const cell=cells.get(key);cell.records.push({building,box});cell.bounds.union(box);cell.dirty=true;
  }dirty=true;return records.length;
 }
 async function finalize(){
  if(closed)throw new Error('해제한 도시');if(!dirty)return;
  let slice=performance.now();
  const pause=async()=>{if(performance.now()-slice>6){await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();}};
  // 칸별 상세·상자 지오메트리는 여기서 만들지 않는다(2026-11-06). 가까워져 실제로 그릴 칸만 update()가 뒤에서 만들고, 멀어지면 버린다.
  // 이전에는 15만 동 전부를 여기서 만들어 휴대폰 탭이 메모리 초과로 다시 열렸다(장면 버퍼 약 630MB).
  for(const cell of cells.values())if(cell.dirty){
   dropGeometry(cell);cell.geometries??=null;cell.version=(cell.version??0)+1;
   if(!cell.mesh){cell.mesh=new THREE.Mesh(EMPTY,nearMaterial);cell.mesh.name=`도시 ${cell.key}`;cell.mesh.frustumCulled=false;cell.mesh.visible=false;root.add(cell.mesh);}
   cell.center=cell.bounds.getCenter(new THREE.Vector3());cell.dirty=false;
  }
  if(closed)throw new Error('해제한 도시');
  const minimumBudget=Math.min(...CITY_BASE_BUDGET);
  if(cells.size*2>minimumBudget)throw new Error('도시 칸 수가 최소 실루엣 예산을 초과함');
  const strips=Math.max(1,Math.min(STRIPS,Math.floor(minimumBudget/(2*cells.size))));
  // 원경 통합 지오메트리는 늘어나는 typed array에 바로 쓴다(2026-11-06). 이전에는 JS 배열 push와 대표 건물마다 BoxGeometry를 만들어 휴대폰 힙이 한때 약 500MB 더 올랐다. 결과 값은 같다.
  const positions=growable(Float32Array),normals=growable(Float32Array),colors=growable(Float32Array),types=growable(Float32Array),infos=growable(Float32Array),indices=growable(Uint32Array);let farCapacity=0;
  const sink={positions,normals,colors,types,info:infos,indices},unit=new THREE.BoxGeometry(1,1,1).toNonIndexed(),unitPos=unit.attributes.position.array,unitNormal=unit.attributes.normal.array,unitCount=unit.attributes.position.count;unit.dispose();
  // 준비 완료 뒤 뒤에서 도는 단계라(2026-11-06) 실루엣도 칸마다 6ms를 넘기면 한 프레임 쉬어 걷는 중 멈칫하지 않게 한다.
  slice=performance.now();
  for(const cell of cells.values()){
   if(performance.now()-slice>6){await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();if(closed)throw new Error('해제한 도시');}
   cell.ranges=[];
   for(let direction=0;direction<DIRECTIONS;direction++){
    const start=indices.n,{indexCount}=citySilhouette(cell.records,cell.bounds,direction,strips,sink);
    cell.ranges.push({start,count:indexCount});
   }
   // 원경 높음: 넓은 평면 벽 대신 공간별 대표 건물을 실제 밑동·지붕이 있는 상자로 보존한다.
   const buckets=new Map(),c=new THREE.Vector3(),size=new THREE.Vector3();
   for(const record of cell.records){record.box.getCenter(c);const key=Math.floor(c.x/125)*65536+Math.floor(c.z/125);const old=buckets.get(key);if(!old||record.building.height>old.building.height)buckets.set(key,record);}
   const limit=Math.max(1,Math.floor(CITY_BASE_BUDGET[2]/(cells.size*12)));
   const samples=[...buckets.values()].sort((a,b)=>b.building.height-a.building.height).slice(0,limit);
   const proxyStart=indices.n;
   for(const {box,building}of samples){
    box.getSize(size);box.getCenter(c);const offset=positions.n/3,{color,roof,use}=appearanceOf(building),type=CITY_TYPES[use]??CITY_TYPES.house,seed=seedOf(building);
    for(let i=0;i<unitCount;i++){
     positions.push(unitPos[i*3]*size.x+c.x);positions.push(unitPos[i*3+1]*size.y+c.y);positions.push(unitPos[i*3+2]*size.z+c.z);
     normals.push(unitNormal[i*3]);normals.push(unitNormal[i*3+1]);normals.push(unitNormal[i*3+2]);
     const tint=unitNormal[i*3+1]>.5?roof:color;colors.push(tint.r);colors.push(tint.g);colors.push(tint.b);
     types.push(type);infos.push(seed);infos.push(building.ground);infos.push(building.height);indices.push(offset+i);
    }
   }
   cell.proxyRange={start:proxyStart,count:indices.n-proxyStart};
   farCapacity+=Math.max(cell.proxyRange.count,...cell.ranges.map(r=>r.count));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions.done(),3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals.done(),3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors.done(),3));geometry.setAttribute('seoulType',new THREE.BufferAttribute(types.done(),1));geometry.setAttribute('seoulInfo',new THREE.BufferAttribute(infos.done(),3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(farCapacity),1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  templateIndices=indices.done();far.geometry.dispose();far.geometry=geometry;far.visible=false;farKey='';
  dirty=false;freezeStatic(root);status.cityGrid={cellSize,cells:cells.size,nodes:root.children.length,silhouetteStrips:strips};
 }
 // 칸 지오메트리 지연 생성·해제. 동시에 들고 있는 칸은 LIMITS.cityCells개(가까운 순)로 묶는다.
 const EMPTY=new THREE.BufferGeometry(),built=new Set(),pending=new Set();let building=false;
 status.cityBuild={built:0,builds:0,evictions:0,cap:LIMITS.cityCells,detailed:LIMITS.cityDetailed};
 function dropGeometry(cell){if(!cell.geometries)return;if(cell.mesh){cell.mesh.geometry=EMPTY;cell.mesh.visible=false;}for(const g of new Set(cell.geometries))g.dispose();cell.geometries=null;cell.triangles=null;built.delete(cell);status.cityBuild.built=built.size;}
 function request(cell){if(cell.geometries||pending.has(cell))return;pending.add(cell);void pump();}
 let pumping=Promise.resolve();
 function pump(){if(!building)pumping=drain();return pumping;}
 async function drain(){
  building=true;
  try{while(pending.size&&!closed){
   let next=null;for(const c of pending)if(!next||c.distanceSq<next.distanceSq)next=c;pending.delete(next);
   if(next.geometries||!next.wanted)continue;
   let slice=performance.now();const version=next.version,pause=async()=>{if(performance.now()-slice>6){await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();}};
   const geometries=await cellGeometry(next.records,pause,LIMITS.cityDetailed);
   if(closed||next.version!==version||!next.wanted){for(const g of new Set(geometries))g.dispose();continue;}
   next.geometries=geometries;next.triangles=geometries.map(triangleCount);built.add(next);status.cityBuild.builds++;status.cityBuild.built=built.size;
   await new Promise(resolve=>setTimeout(resolve,0));
  }}finally{building=false;}
 }
 function update(camera,quality,culler){
  if(closed)return;
  // 시각(해 고도)에 따른 창 불빛·노을 반사, 쌍안경·화질에 따른 세부 단계. 거리 불빛 점도 여기서 켜고 끈다.
  status.cityLight=updateCityLight({camera,quality});for(const lights of nightLights)lights.userData.update?.(quality);
  if(dirty||!templateIndices)return;
  const visible=[];let distanceRejected=0,frustumTests=0;
  const zoom=Math.max(1,camera.zoom||1),zoomed=zoom>1.01,lodQuality=zoomed?Math.min(2,quality+1):quality,middleReach=[2000,3500,5000][lodQuality]*zoom;
  // 그릴 수 있는 거리 안의 칸 중 가까운 LIMITS.cityCells개만 지오메트리를 둔다. 시선과 무관하게 거리로 고르므로 고개를 돌려도 다시 만들지 않는다.
  const ranked=[];for(const cell of cells.values()){cell.distanceSq=boxDistanceSquared(cell.bounds,camera.position);cell.wanted=false;if(cell.distanceSq<middleReach*middleReach)ranked.push(cell);}
  ranked.sort((a,b)=>a.distanceSq-b.distanceSq);for(const cell of ranked.slice(0,LIMITS.cityCells)){cell.wanted=true;request(cell);}
  for(const cell of [...built])if(!cell.wanted&&built.size>LIMITS.cityCells||cell.distanceSq>(middleReach*1.5)**2){dropGeometry(cell);status.cityBuild.evictions++;}
  for(const cell of cells.values()){
   cell.mesh.visible=false;
   const distanceSq=cell.distanceSq;
   if(distanceSq>camera.far*camera.far){distanceRejected++;continue;}
   frustumTests++;if(!culler.inFrustum(cell.bounds))continue;
   const angle=Math.atan2(camera.position.x-cell.center.x,camera.position.z-cell.center.z);
   const direction=((Math.round(angle/(Math.PI*2/DIRECTIONS))%DIRECTIONS)+DIRECTIONS)%DIRECTIONS;
   visible.push({cell,distanceSq,direction,range:quality===2?cell.proxyRange:cell.ranges[direction]});
  }
  visible.sort((a,b)=>a.distanceSq-b.distanceSq);
  // 쌍안경(camera.zoom>1): 확대된 시야 기준 거리로 단계를 고르고, 거리 단계는 한 칸 높은 화질, 예산은 시야가 좁아진 만큼 1.5배.
  const budget=CITY_BASE_BUDGET[quality]*(zoomed?1.5:1),maxNear=Math.round(MAX_NEAR_MESHES*(zoomed?1.5:1));
  let triangles=visible.reduce((sum,item)=>sum+item.range.count/3,0),nearMeshes=0,detailed=0,simple=0;const distant=[];
  for(const item of visible){
   const {cell,distanceSq,range}=item,near=[0,1000,2000][lodQuality]*zoom,middle=[2000,3500,5000][lodQuality]*zoom;
   let level=distanceSq<near*near?0:distanceSq<middle*middle?1:2;
   const remaining=budget-triangles+range.count/3;
   if(!cell.geometries)level=2; // 아직 만들지 않은(또는 상한으로 버린) 칸은 원경 실루엣
   while(level<2&&(cell.triangles[level]>remaining||nearMeshes>=maxNear))level++;
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
  status.cityGrid={...status.cityGrid,visibleCells:visible.length,detailedCells:detailed,simpleCells:simple,silhouetteCells:quality===2?0:distant.length,proxyCells:quality===2?distant.length:0,frustumTests,distanceRejected,baseTriangles:triangles,baseDrawCalls:nearMeshes+(far.visible?1:0),baseTriangleBudget:budget,zoom};
 }
 function dispose(){closed=true;root.removeFromParent();for(const cell of cells.values())dropGeometry(cell);EMPTY.dispose();far.geometry.dispose();nearMaterial.dispose();if(farMaterial!==material)farMaterial.dispose();cells.clear();}
 // 밤 거리 불빛(Points) 등 시각·화질에 따라 매 프레임 갱신할 대상.
 const addNightLights=object=>{nightLights.push(object);};
 return {root,cells,addBuildings,finalize,update,dispose,addNightLights,settle:()=>pumping};
}

// OSM 도로 중심선을 실제 DEM 위에 드레이프한다. 교량은 수면 위의 독립 데크다.
export function seoulRoadGeometry(roads,heightAt){
 const positions=growable(Float32Array),colors=growable(Float32Array),roadColor=new THREE.Color(0x484b4b),bridgeColor=new THREE.Color(0x98978e);
 for(const road of roads){
  for(let i=1;i<road.points.length;i++){
   const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.1)continue;
   const w=road.width/2,nx=-dz/len*w,nz=dx/len*w,steps=Math.max(1,Math.ceil(len/60));
   for(let j=0;j<steps;j++){
    const t=j/steps,u=(j+1)/steps,x0=ax+dx*t,z0=az+dz*t,x1=ax+dx*u,z1=az+dz*u;
    const h=(x,z)=>road.bridge?Math.max(24,heightAt(ax,az),heightAt(bx,bz))+2:heightAt(x,z)+1.3;
    const vertices=[[x0+nx,h(x0+nx,z0+nz),z0+nz],[x0-nx,h(x0-nx,z0-nz),z0-nz],[x1+nx,h(x1+nx,z1+nz),z1+nz],[x1-nx,h(x1-nx,z1-nz),z1-nz]];
    const c=road.bridge?bridgeColor:roadColor;for(const k of [0,2,1,1,2,3]){positions.add(vertices[k]);colors.push(c.r);colors.push(c.g);colors.push(c.b);}
   }
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions.done(),3));g.setAttribute('color',new THREE.BufferAttribute(colors.done(),3));g.computeVertexNormals();return g;
}

export function createSeoulLandmark(p,atmosphere){
 const group=new THREE.Group();group.name=p.name;group.position.set(p.x,p.ground,p.z);group.userData={...p,source:'산리서치 data/reference/landmarks.csv'};
 if(p.shape==='reference')return group;
 // 전용 모델(city-landmarks.js): 도시 공용 외관 셰이더로 창 줄·밤 불빛·항공장애등까지 그린다. 제출 1회.
 const geometry=landmarkGeometry({...p,x:0,z:0,ground:0});
 if(geometry){
  // 셰이더의 밑동 높이는 월드 y 기준이므로 그룹 높이(p.ground)만큼 올려 둔다.
  const info=geometry.attributes.seoulInfo;for(let i=0;i<info.count;i++)info.setY(i,info.getY(i)+p.ground);
  const mesh=new THREE.Mesh(geometry,applyAtmosphere(cityFacadeMaterial(null),atmosphere));mesh.name=`${p.name} 모델`;group.add(mesh);
 }
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(25,49,48,.8)';ctx.fillRect(0,0,512,80);ctx.font='500 36px sans-serif';ctx.textAlign='center';ctx.fillStyle='#f5f1dc';ctx.fillText(p.name,256,53);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));label.name='서울 이름표';label.userData.seoulLabel=true;label.visible=false;label.scale.set(1300,203,1);label.position.y=p.height+140;group.add(label);return group;
}

export function bindSeoulLabels(root,status){
 let visible=false;status.cityLabels=false;
 // L 키와 배낭의 '서울 이름표' 버튼(hiking:city-labels)이 같은 전환을 쓴다. 버튼 눌림 표시도 여기서 맞춘다.
 const flip=()=>{visible=!visible;root.traverse(o=>{if(o.userData.seoulLabel)o.visible=visible;});status.cityLabels=visible;for(const b of document.querySelectorAll?.('[data-act=city-labels]')??[])b.setAttribute('aria-pressed',String(visible));};
 const key=e=>{if(e.code!=='KeyL'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)return;flip();};
 window.addEventListener('keydown',key);window.addEventListener('hiking:city-labels',flip);
 const credit=document.createElement('a');credit.href='https://www.openstreetmap.org/copyright';credit.target='_blank';credit.rel='noopener';credit.textContent='© OpenStreetMap contributors · ODbL';
 // 출처는 화면 아래 출처 한 줄(#source-line)에 붙인다(등산 수첩 HUD). 그 줄이 없으면 오른쪽 아래에 따로 둔다.
 const line=document.getElementById('source-line'),wrap=document.createElement('span');wrap.className='osm-credit';wrap.append(' · ',credit);const hint=document.createElement('span');hint.className='osm-key';hint.textContent=' · L 이름표';wrap.append(hint);
 if(line)line.append(wrap);else{wrap.style.cssText='position:fixed;right:12px;bottom:6px;font-size:10px;color:#e2e7e6;text-shadow:0 1px 3px #111;z-index:3';document.body.append(wrap);}
 return ()=>{window.removeEventListener('keydown',key);window.removeEventListener('hiking:city-labels',flip);wrap.remove();};
}
