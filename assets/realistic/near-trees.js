import * as THREE from 'three';

// 근경 입체 나무. 64~128m 청크 단위 LOD는 청크 중심 거리로 단계를 정하므로 길가 나무도 대부분 사진판으로 보였다.
// 카메라 가까운 나무만 골라 입체 모델(줄기·가지·잎 무더기)로 바꿔 그리고, 그 나무의 사진판은 감춘다.
// 같은 수종·단계는 InstancedMesh 하나로 묶는다(호출 수 = 수종 × 단계 × 재질). 화질별 개수·반경은 아래 표.
export const NEAR_TREE_POOL={
 // [낮음, 균형, 높음]. full=원본 LOD0, mid=잎 카드 일부만 남기고 키운 중간 단계.
 full:{count:[0,4,7],radius:[0,14,18]},
 mid:{count:[6,14,24],radius:[18,30,40]},
 midKeep:.34,
};
export const NEAR_TREE_IDS=['tree_small_02','island_tree_01','pine_tree_01','pine_sapling_medium'];

// 잎 카드 묶음(위치가 맞닿은 삼각형)을 단위로 일부만 남기고, 남긴 묶음을 제자리에서 키워 수관 부피를 유지한다.
export function decimateLeaves(geometry,keep=NEAR_TREE_POOL.midKeep,salt=1){
 const position=geometry.attributes.position,index=geometry.index;
 const triangles=index?index.count/3:position.count/3,vertexOf=(t,k)=>index?index.getX(t*3+k):t*3+k;
 const parent=new Int32Array(triangles).map((_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
 const owner=new Map(),key=v=>`${Math.round(position.getX(v)*2e3)},${Math.round(position.getY(v)*2e3)},${Math.round(position.getZ(v)*2e3)}`;
 for(let t=0;t<triangles;t++)for(let k=0;k<3;k++){
  const id=key(vertexOf(t,k)),other=owner.get(id);
  if(other===undefined)owner.set(id,t);else{const a=find(t),b=find(other);if(a!==b)parent[a]=b;}
 }
 const groups=new Map();for(let t=0;t<triangles;t++){const r=find(t);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(t);}
 // 너무 큰 묶음(가지째 이어진 경우)은 삼각형 단위로 다시 나눈다.
 const units=[];for(const list of groups.values()){if(list.length>triangles*.02)for(const t of list)units.push([t]);else units.push(list);}
 const source=geometry.toNonIndexed(),out=source.attributes.position,kept=[];
 const scale=Math.min(1.8,1/Math.sqrt(keep)),c=new THREE.Vector3(),v=new THREE.Vector3();
 for(const [u,list] of units.entries()){
  const h=Math.sin((u+1)*12.9898*salt+list.length*78.233)*43758.5453;if(h-Math.floor(h)>=keep)continue;
  c.set(0,0,0);for(const t of list)for(let k=0;k<3;k++)c.add(v.fromBufferAttribute(out,t*3+k));c.multiplyScalar(1/(list.length*3));
  for(const t of list){for(let k=0;k<3;k++){const i=t*3+k;v.fromBufferAttribute(out,i).sub(c).multiplyScalar(scale).add(c);out.setXYZ(i,v.x,v.y,v.z);}kept.push(t);}
 }
 const result=new THREE.BufferGeometry();
 for(const [name,attribute] of Object.entries(source.attributes)){
  const size=attribute.itemSize,array=new attribute.array.constructor(kept.length*3*size);
  kept.forEach((t,n)=>array.set(attribute.array.subarray(t*3*size,(t+1)*3*size),n*3*size));
  result.setAttribute(name,new THREE.BufferAttribute(array,size,attribute.normalized));
 }
 source.dispose();result.computeBoundingSphere();return result;
}

const ZERO=new Float32Array(16);
export function createNearTrees({loadParts}){
 const group=new THREE.Group();group.name='근경 입체 나무';group.userData.metricKind='숲';
 const records=[],grid=new Map(),cell=16,pools=new Map(),pending=new Map();
 const status={records:0,full:0,mid:0,swaps:0,tiers:NEAR_TREE_POOL};
 let last=null,lastQuality=-1,frame=0;
 const selected=new Map();// record index → tier
 async function pool(id,url){
  if(pools.has(id))return pools.get(id);
  if(!pending.has(id))pending.set(id,loadParts(url).then(parts=>{
   const make=(tier,capacity)=>parts.map(({geometry,material})=>{
    const leaf=/_(leaves|twig)$/.test(material.name),g=tier==='mid'&&leaf?decimateLeaves(geometry,NEAR_TREE_POOL.midKeep,id.length):geometry;
    const mesh=new THREE.InstancedMesh(g,material,Math.max(1,capacity));mesh.count=0;mesh.castShadow=false;mesh.receiveShadow=true;
    mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1,capacity)*3),3);
    mesh.userData.metricKind='숲';mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;group.add(mesh);return mesh;
   });
   const entry={full:make('full',NEAR_TREE_POOL.full.count[2]),mid:make('mid',NEAR_TREE_POOL.mid.count[2]),
    triangles:{full:parts.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)}};
   entry.triangles.mid=entry.mid.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
   pools.set(id,entry);return entry;
  }));
  return pending.get(id);
 }
 // lod: 사진판 청크 LOD, matrices: 입체 모델용 월드 행렬, tints: 잎 색.
 async function register(lod,{id,url,matrices,tints,dense=[]}){
  await pool(id,url);
  const meshes=lod.levels.flatMap(l=>l.object.children.filter(m=>m.isInstancedMesh));
  for(const mesh of meshes)mesh.userData.restoreMatrices??=mesh.instanceMatrix.array.slice();
  matrices.forEach((matrix,i)=>{
   const r=records.length,x=matrix.elements[12],z=matrix.elements[14],k=`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
   records.push({id,x,z,matrix,tint:tints[i],meshes,index:i,dense:!!dense[i]});
   if(!grid.has(k))grid.set(k,[]);grid.get(k).push(r);
  });
  status.records=records.length;last=null;
 }
 function setCard(record,hidden){
  for(const mesh of record.meshes){
   mesh.instanceMatrix.array.set(hidden?ZERO:mesh.userData.restoreMatrices.subarray(record.index*16,record.index*16+16),record.index*16);
   mesh.instanceMatrix.needsUpdate=true;
  }
 }
 const forward=new THREE.Vector3();
 function update(camera,quality=2){
  frame++;if(!records.length)return;
  camera.getWorldDirection(forward);const p=camera.position,fx=forward.x,fz=forward.z,fl=Math.hypot(fx,fz)||1;
  const moved=!last||Math.hypot(p.x-last.x,p.z-last.z)>.75||Math.abs(Math.atan2(fx,fz)-last.yaw)>.25||quality!==lastQuality||frame-last.frame>45;
  if(!moved)return;
  last={x:p.x,z:p.z,yaw:Math.atan2(fx,fz),frame};lastQuality=quality;
  const nFull=NEAR_TREE_POOL.full.count[quality],nMid=NEAR_TREE_POOL.mid.count[quality];
  const rFull=NEAR_TREE_POOL.full.radius[quality],rMid=NEAR_TREE_POOL.mid.radius[quality];
  const candidates=[],reach=Math.ceil(rMid/cell);
  const cx=Math.floor(p.x/cell),cz=Math.floor(p.z/cell);
  for(let i=cx-reach;i<=cx+reach;i++)for(let j=cz-reach;j<=cz+reach;j++)for(const r of grid.get(`${i},${j}`)??[]){
   const rec=records[r],dx=rec.x-p.x,dz=rec.z-p.z,d=Math.hypot(dx,dz);if(d>rMid||(quality===0&&rec.dense))continue;
   // 시야 앞쪽 나무를 먼저 입체로 바꾼다. 이미 바뀐 나무는 조금 우선해 경계에서 깜빡이지 않게 한다.
   const front=(dx*fx+dz*fz)/fl>-d*.35?1:1.9;
   candidates.push({r,d,score:d*front*(selected.has(r)?.88:1)});
  }
  candidates.sort((a,b)=>a.score-b.score);
  const next=new Map();let full=0,mid=0;
  for(const c of candidates){
   if(full<nFull&&c.d<=rFull){next.set(c.r,'full');full++;}
   else if(mid<nMid){next.set(c.r,'mid');mid++;}
   if(full>=nFull&&mid>=nMid)break;
  }
  for(const [r] of selected)if(!next.has(r)){setCard(records[r],false);status.swaps++;}
  for(const [r] of next)if(!selected.has(r)){setCard(records[r],true);status.swaps++;}
  selected.clear();for(const [r,t] of next)selected.set(r,t);
  const counts=new Map(),color=new THREE.Color();
  for(const entry of pools.values())for(const mesh of [...entry.full,...entry.mid])mesh.count=0;
  for(const [r,tier] of next){
   const rec=records[r],entry=pools.get(rec.id);if(!entry)continue;
   const k=`${rec.id}:${tier}`,n=counts.get(k)??0;counts.set(k,n+1);
   for(const mesh of entry[tier]){mesh.setMatrixAt(n,rec.matrix);mesh.setColorAt(n,color.set(rec.tint??0xffffff));mesh.count=n+1;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
  }
  status.full=full;status.mid=mid;
  status.triangles=[...next].reduce((n,[r,t])=>n+(pools.get(records[r].id)?.triangles[t]??0),0);
 }
 return {group,register,update,status,get selected(){return selected;}};
}
