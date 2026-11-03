import {Box3,Vector3,Matrix4} from 'three';
const footprintCache=new WeakMap();

// 수관 상자가 아니라 첫 LOD의 밑부분 형상을 사용한다. GLB 피벗 편향도 보존한다.
export function contactFootprint(meshes,kind){
 if(!meshes.length)return null;
 const first=meshes[0].geometry,key=kind+':'+meshes.map(mesh=>mesh.geometry.uuid).join(',');
 let cache=footprintCache.get(first);if(!cache){cache=new Map();footprintCache.set(first,cache);}
 if(cache.has(key))return cache.get(key);
 let minY=Infinity,maxY=-Infinity;
 for(const mesh of meshes){mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;minY=Math.min(minY,box.min.y);maxY=Math.max(maxY,box.max.y);}
 const box=new Box3(),point=new Vector3(),band=Math.max(.08,Math.min(kind==='rock'?.35:.2,(maxY-minY)*.15));
 for(const mesh of meshes){const positions=mesh.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i);if(point.y<=minY+band)box.expandByPoint(point);}
 }
 const result=box.isEmpty()?null:box;cache.set(key,result);return result;
}

export function placedContact(footprint,matrix,{kind,id,nearDetail=false}={}){
 if(!footprint)return null;
 const box=footprint.clone().applyMatrix4(matrix),center=box.getCenter(new Vector3());
 const baseRadius=Math.max(box.max.x-box.min.x,box.max.z-box.min.z)/2;
 // 작은 돌의 고정 1.2m/36% 원이 길가를 연결하지 않게 한다.
 // 밑면 지름 60cm부터 36%. 반경과 독립적으로 15~30cm 구간만 부드럽게 전환한다.
 const rockScale=Math.max(0,Math.min(1,(baseRadius-.15)/.15));
 const rockOpacity=rockScale>=1?.36:.02+.34*rockScale*rockScale*(3-2*rockScale);
 const radius=kind==='rock'?Math.max(.45,Math.min(4,baseRadius+Math.min(.5,baseRadius*.4))):Math.max(.9,Math.min(kind==='understory'?1.2:2,baseRadius+.35));
 return {x:center.x,y:box.min.y,z:center.z,baseRadius,radius,opacity:kind==='rock'?rockOpacity:.26,kind,id,nearDetail};
}

export function instanceContactMatrix(mesh,index,origin){
 const matrix=new Matrix4();mesh.getMatrixAt(index,matrix);
 matrix.elements[12]+=origin.x;matrix.elements[13]+=origin.y;matrix.elements[14]+=origin.z;
 return matrix;
}

// 모든 LOD에 같은 높이 보정을 적용한 뒤 실제 Float32 행렬에서 바닥을 다시 측정한다.
export function seatContactInstance(lod,index,footprint,ground,options){
 const first=lod.levels[0].object.children[0];
 const before=placedContact(footprint,instanceContactMatrix(first,index,lod.position),options);
 // 일반 사면 바위는 원래 묻힘을 유지한다. 회랑 하강량을 함께 내리고,
 // 원래 떠 있던 바닥도 내리되 어떤 경우에도 위로 올리지 않는다.
 const preserveBurial=options.nearDetail===false;
 const terrainDrop=Number.isFinite(options.referenceGround)?Math.min(0,ground-options.referenceGround):0;
 const delta=preserveBurial?Math.min(0,terrainDrop,ground-before.y):ground-before.y;
 for(const level of lod.levels)for(const mesh of level.object.children){
  const matrix=new Matrix4();mesh.getMatrixAt(index,matrix);matrix.elements[13]+=delta;mesh.setMatrixAt(index,matrix);mesh.instanceMatrix.needsUpdate=true;
 }
 return {...placedContact(footprint,instanceContactMatrix(first,index,lod.position),options),terrainAligned:true,heightCorrection:delta,groundingMode:preserveBurial?'not-floating':'seated',terrainDrop};
}

export function contactGroundError(point,ground){
 if(!Number.isFinite(ground))return null;
 return point.nearDetail===false?Math.max(0,point.y-ground):Math.abs(point.y-ground);
}
