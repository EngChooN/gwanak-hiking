import {Box3,Frustum,Matrix4} from 'three';
export function boxDistanceSquared(box,point){
 return Math.max(box.min.x-point.x,0,point.x-box.max.x)**2+Math.max(box.min.y-point.y,0,point.y-box.max.y)**2+Math.max(box.min.z-point.z,0,point.z-box.max.z)**2;
}

// 정적 청크의 모든 LOD를 포함한다. 로딩 완료 시 한 번만 경계를 계산한다.
export function chunkBounds(object){
 object.updateWorldMatrix(true,true);
 const box=new Box3();
 object.traverse(o=>{if(!o.geometry)return;
  if(o.isInstancedMesh){o.computeBoundingBox();box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}
  else {o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}
 });
 return box;
}
export function createChunkCuller(){
 const frustum=new Frustum(),matrix=new Matrix4();
 // 부모 상자가 완전히 안쪽에 있는 평면은 자식에서 재검사하지 않는다.
 function planeMask(box,mask=63){
  if(box.isEmpty())return -1;
  let partial=0;
  for(let i=0;i<6;i++){
   const bit=1<<i;if(!(mask&bit))continue;
   const plane=frustum.planes[i],n=plane.normal;
   const nearX=n.x>0?box.min.x:box.max.x,farX=n.x>0?box.max.x:box.min.x;
   const nearY=n.y>0?box.min.y:box.max.y,farY=n.y>0?box.max.y:box.min.y;
   const nearZ=n.z>0?box.min.z:box.max.z,farZ=n.z>0?box.max.z:box.min.z;
   if(n.x*farX+n.y*farY+n.z*farZ+plane.constant<0)return -1;
   if(n.x*nearX+n.y*nearY+n.z*nearZ+plane.constant<0)partial|=bit;
  }
  return partial;
 }
 return {
  update(camera){camera.updateMatrixWorld();frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));},
  inFrustum(box){return !box.isEmpty()&&frustum.intersectsBox(box);},
  planeMask,
  visible(box,camera,maxDistance=Infinity,mask=63){return !box.isEmpty()&&boxDistanceSquared(box,camera.position)<=maxDistance*maxDistance&&(mask===63?frustum.intersectsBox(box):planeMask(box,mask)>=0);}
 };
}
