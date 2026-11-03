// 배치가 끝난 정적 하위 트리 전용. 재배치·재부모화 후 다시 호출한다.
// 스켈레톤·카메라·태양·등산객에는 적용하지 않는다.
const worldUpdates=new WeakMap();
function skipFrozenWorldUpdate(){}
export function freezeStatic(object){
 object.traverse(o=>{if(worldUpdates.has(o))o.updateMatrixWorld=worldUpdates.get(o);o.matrixWorldAutoUpdate=true;o.updateMatrix();o.matrixAutoUpdate=false;});
 object.updateWorldMatrix(true,false);
 object.updateMatrixWorld(true);
 object.traverse(o=>{o.matrixWorldAutoUpdate=false;o.matrixWorldNeedsUpdate=false;});
 // r180은 false 플래그도 자식을 순회한다. 정적 루트에서 진입을 차단한다.
 // 재배치 후 freezeStatic을 다시 부르면 원래 메서드로 복원해 1회 갱신한다.
 if(!worldUpdates.has(object))worldUpdates.set(object,object.updateMatrixWorld);
 object.updateMatrixWorld=skipFrozenWorldUpdate;
 return object;
}

export function natureLodDistance(distance,{kind,nearDetail,representation,index},quality){
 if(representation==='crossboard')return 120;
 if(representation==='impostor')return 400;
 if(index===0)return 0;
 const limits=kind==='rock'?[[6,16],[12,32],[24,64]][quality]:
  (nearDetail||kind==='understory'?[[3,10],[5,16],[8,32]][quality]:[[4,12],[6,20],[10,40]][quality]);
 return Math.min(distance,limits[Math.min(index-1,1)]);
}

export function applyNatureQuality(lod,quality){
 for(const [index,level] of lod.levels.entries()){
  const meta=level.object.userData.lodSource;
  level.distance=natureLodDistance(meta.distance,{...meta,index},quality);
  // 원거리·LOD2·사진판은 그림자 패스에 진입하지 않는다.
  // 현재 식생은 근경도 기존 무그림자 계약을 유지한다.
  level.object.traverse(o=>{if(o.isMesh)o.castShadow=false;});
 }
}
