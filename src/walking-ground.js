import {surfaceIndex} from '../assets/realistic/surface-index.js';
import {Vector3} from 'three';
import {summitStepOk} from './summit.js';
import {instanceContactMatrix} from './contact-footprint.js';
// 걸을 수 있는 지형 경사 한도. 낭떠러지처럼 약 45°가 넘는 곳만 막는다(예전 35°는 길 옆 보통 비탈까지 막았다, 2026-11-06). 정상 구역(summit.js)도 같은 값이다.
export const MAX_WALK_SLOPE=Math.tan(45*Math.PI/180);
// 렌더링에 쓰는 clearance 적용 삼각형을 그대로 조회한다. 분석용 floorHeight와 계단 옆 실제 바닥의 차이를 보존한다.
export function createWalkingGround(landscape){
 const indices=new WeakMap();let rocks=new Map();const cell=8;
 function index(mesh){let entry=indices.get(mesh.geometry);if(!entry){entry=surfaceIndex(mesh);indices.set(mesh.geometry,entry);}return entry;}
 function height(x,z,off=true){
  if(!off)return landscape.surfaceHeight(x,z);
  const meshes=landscape.collisionObjects().slice(1); // 첫 항목은 노면
  for(const mesh of meshes){const box=mesh.geometry.boundingBox;if(box&&(x<box.min.x||x>box.max.x||z<box.min.z||z>box.max.z))continue;const h=index(mesh)(x,z);if(Number.isFinite(h))return h;}
  const base=landscape.group.getObjectByName('NearDEM8m');
  return (base?index(base)(x,z):undefined)??landscape.floorHeight(x,z);
 }
 // 바위 충돌(2026-11-06): 회전된 바위의 축 정렬 상자(+0.2m)로 막으면 실제 바위보다 수 m 넓게 막히고,
 // 땅에 묻힌 큰 바위도 상자 위 끝만 보고 막아 정상부 곳곳에 보이지 않는 벽이 생겼다.
 // 이제 바위 인스턴스마다 첫 LOD 삼각형을 0.25m 칸에 눌러 칸별 바위 윗면·밑면 높이를 만들고(처음 조회할 때 한 번),
 // 몸 반경(0.2m) 안 칸 중 바위가 발밑+0.35m(넘어 디딜 수 있는 높이)보다 높고 머리(1.7m)보다 낮게 시작하면 막는다.
 // 식생 청크가 붙고 떨어지면(스트리밍) 장애물 목록을 다시 만든다. 전에는 시작할 때 한 번만 만들었다.
 const ROCK_CELL=.25,ROCK_BODY=.2,ROCK_STEP=.35,ROCK_HEAD=1.7,shapes=new WeakMap();let obstacleKey=null,obstacleStatus=null;
 function rockShape(rock){
  let list=shapes.get(rock.lod);if(!list){list=[];shapes.set(rock.lod,list);}if(list[rock.index])return list[rock.index];
  const {min,max}=rock.worldBounds,nx=Math.ceil((max[0]-min[0])/ROCK_CELL)+1,nz=Math.ceil((max[2]-min[2])/ROCK_CELL)+1;
  const top=new Float32Array(nx*nz).fill(-Infinity),bottom=new Float32Array(nx*nz).fill(Infinity),v=[new Vector3(),new Vector3(),new Vector3()];
  const put=(i,j,y)=>{if(i<0||j<0||i>=nx||j>=nz)return;const k=j*nx+i;if(y>top[k])top[k]=y;if(y<bottom[k])bottom[k]=y;};
  for(const mesh of rock.lod.levels[0]?.object.children??[]){
   const matrix=instanceContactMatrix(mesh,rock.index,rock.lod.position),pos=mesh.geometry.getAttribute('position'),index=mesh.geometry.index,count=index?index.count:pos.count;
   for(let t=0;t+2<count;t+=3){
    for(let k=0;k<3;k++){v[k].fromBufferAttribute(pos,index?index.getX(t+k):t+k).applyMatrix4(matrix);put(Math.round((v[k].x-min[0])/ROCK_CELL),Math.round((v[k].z-min[2])/ROCK_CELL),v[k].y);}
    const [a,b,c]=v,det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(det)<1e-9)continue;
    const i0=Math.ceil((Math.min(a.x,b.x,c.x)-min[0])/ROCK_CELL),i1=Math.floor((Math.max(a.x,b.x,c.x)-min[0])/ROCK_CELL),j0=Math.ceil((Math.min(a.z,b.z,c.z)-min[2])/ROCK_CELL),j1=Math.floor((Math.max(a.z,b.z,c.z)-min[2])/ROCK_CELL);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=min[0]+i*ROCK_CELL,z=min[2]+j*ROCK_CELL,l1=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/det,l2=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/det,l3=1-l1-l2;
     if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6)put(i,j,l1*a.y+l2*b.y+l3*c.y);}
   }
  }
  return list[rock.index]={nx,nz,top,bottom};
 }
 function refreshObstacles(){
  rocks=new Map();
  landscape.group.traverse(lod=>{const occluders=lod.userData?.contactOccluders;if(!occluders||!lod.levels)return;
   for(let index=0;index<occluders.length;index++){const rock=occluders[index];
    if(rock?.kind!=='rock'||!rock.worldBounds)continue;const {min,max}=rock.worldBounds;
    if(max[1]-min[1]<ROCK_STEP)continue;const entry={worldBounds:rock.worldBounds,lod,index};
    for(let z=Math.floor((min[2]-ROCK_BODY)/cell);z<=Math.floor((max[2]+ROCK_BODY)/cell);z++)for(let x=Math.floor((min[0]-ROCK_BODY)/cell);x<=Math.floor((max[0]+ROCK_BODY)/cell);x++){
     const key=`${x},${z}`;if(!rocks.has(key))rocks.set(key,[]);rocks.get(key).push(entry);
    }
   }});
 }
 function syncObstacles(){
  const v=landscape.status?.vegetationChunks;if(!v||v===obstacleStatus)return;obstacleStatus=v;
  const key=v.ids?.join(',');if(key!==obstacleKey){obstacleKey=key;refreshObstacles();}
 }
 // 바위 덩어리 몸 높이 안에 (x,z)가 들면 막힌다.
 function rockBlocked(x,z,y){
  for(const rock of rocks.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`)??[]){const {min,max}=rock.worldBounds;
   if(x<min[0]-ROCK_BODY||x>max[0]+ROCK_BODY||z<min[2]-ROCK_BODY||z>max[2]+ROCK_BODY||max[1]<=y+ROCK_STEP||min[1]>=y+ROCK_HEAD)continue;
   const {nx,nz,top,bottom}=rockShape(rock),i0=Math.max(0,Math.round((x-ROCK_BODY-min[0])/ROCK_CELL)),i1=Math.min(nx-1,Math.round((x+ROCK_BODY-min[0])/ROCK_CELL)),j0=Math.max(0,Math.round((z-ROCK_BODY-min[2])/ROCK_CELL)),j1=Math.min(nz-1,Math.round((z+ROCK_BODY-min[2])/ROCK_CELL));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const k=j*nx+i;if(top[k]>y+ROCK_STEP&&bottom[k]<y+ROCK_HEAD)return true;}
  }return false;
 }
 function canMove(a,b){
  syncObstacles();
  const horizontal=Math.hypot(b[0]-a[0],b[2]-a[2]);if(Math.abs(b[1]-a[1])>MAX_WALK_SLOPE*horizontal+1e-5)return false;
  const n=Math.max(1,Math.ceil(horizontal/.15));
  for(let i=1;i<=n;i++){
   const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t,h=.2;
   const gx=(height(x+h,z)-height(x-h,z))/(2*h),gz=(height(x,z+h)-height(x,z-h))/(2*h);
   if(!Number.isFinite(gx+gz)||Math.hypot(gx,gz)>MAX_WALK_SLOPE)return false;
   if(rockBlocked(x,z,y))return false;
  }return true;
 }
 // 정상 자유 이동 구역(summit.js)의 걷는 면: 노면 띠(path 메시) 위면 노면, 밖이면 화면에 보이는 지형 메시(height(x,z,true)). 시설은 풍경이 정한 배치.
 // 예전에는 노면 밖도 surfaceHeight(계산식 지형 chunkHeight)를 썼다. 이 값은 2m 격자로 그린 지형과 정상 벼랑 가에서 최대 3.3m 어긋나고,
 // 가장 가까운 길 선분이 바뀌는 곳에서 5cm 사이에 0.7m씩 끊겨 보이지 않는 벽이 생겼다. 코스 길 밖(positionAt)과 높이가 달라
 // 정상 ↔ 등산로를 넘나들 때 몸이 수 m 튀기도 했다(2026-11-06). 이제 두 구역이 같은 지형 메시를 밟는다.
 let pathIndex=null;
 function walkHeight(x,z){
  const path=landscape.collisionObjects()[0];
  if(path){if(pathIndex?.path!==path)pathIndex={path,find:surfaceIndex(path)};const top=landscape.floorHeight?.(x,z),h=pathIndex.find(x,z,Number.isFinite(top)?top+10:Infinity,20);if(Number.isFinite(h))return h;}
  return height(x,z,true);
 }
 let avoidCache=null;
 const summit={
  // 정상 시설 + 정상 둘레 상호작용 소품(피할 반경은 소품 collisionRadius). 소품은 풍경이 다 올라온 뒤 한 번만 합친다.
  sites:()=>{const f=landscape.status?.summitFacilities?.sites??[],props=landscape.status?.interactionProps?.sites;if(!props)return f;
   if(avoidCache?.base!==f)avoidCache={base:f,list:[...f,...props.filter(p=>p.anchor==='marker'||p.anchor==='eungjinjeon').map(p=>({id:p.id,x:p.x,z:p.z,supportRadius:p.collisionRadius??.3}))]};
   return avoidCache.list;},
  height:walkHeight,
  canStep:(a,b,{rocks=true}={})=>{syncObstacles();return summitStepOk(walkHeight,a,b,{rockBlocked:rocks?rockBlocked:null});},
 };
 return {height,canMove,refreshObstacles,rockBlocked,summit};
}
