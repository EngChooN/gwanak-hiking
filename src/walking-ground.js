import {surfaceIndex} from '../assets/realistic/surface-index.js';
export const MAX_WALK_SLOPE=Math.tan(35*Math.PI/180);
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
 function refreshObstacles(){
  rocks=new Map();for(const rock of landscape.contactCandidates(0,0,Infinity,Infinity)){
   if(rock.kind!=='rock'||!rock.worldBounds)continue;const {min,max}=rock.worldBounds;
   if(max[1]-min[1]<.35)continue;
   for(let z=Math.floor((min[2]-.2)/cell);z<=Math.floor((max[2]+.2)/cell);z++)for(let x=Math.floor((min[0]-.2)/cell);x<=Math.floor((max[0]+.2)/cell);x++){
    const key=`${x},${z}`;if(!rocks.has(key))rocks.set(key,[]);rocks.get(key).push(rock);
   }
  }
 }
 function canMove(a,b){
  const horizontal=Math.hypot(b[0]-a[0],b[2]-a[2]);if(Math.abs(b[1]-a[1])>MAX_WALK_SLOPE*horizontal+1e-5)return false;
  const n=Math.max(1,Math.ceil(horizontal/.15));
  for(let i=1;i<=n;i++){
   const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t,h=.2;
   const gx=(height(x+h,z)-height(x-h,z))/(2*h),gz=(height(x,z+h)-height(x,z-h))/(2*h);
   if(!Number.isFinite(gx+gz)||Math.hypot(gx,gz)>MAX_WALK_SLOPE)return false;
   for(const rock of rocks.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`)??[]){const {min,max}=rock.worldBounds;
    if(x>=min[0]-.2&&x<=max[0]+.2&&z>=min[2]-.2&&z<=max[2]+.2&&max[1]>y+.25&&min[1]<y+1.7)return false;
   }
  }return true;
 }
 return {height,canMove,refreshObstacles};
}
