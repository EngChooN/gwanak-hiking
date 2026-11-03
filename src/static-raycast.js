import {Box3,BufferGeometry,Matrix4,Mesh,Ray,Sphere,Vector3} from 'three';

// 정적 단일 재질 메시 전용. 렌더링 버퍼는 그대로 두고 충돌 후보만 8m 칸으로 나눈다.
// 칸 중심으로 삼각형을 배정하되 AABB는 세 꼭짓점을 모두 포함하므로 경계도 빠지지 않는다.
export function indexStaticRaycast(mesh,cellSize=8){
  const source=mesh.geometry,p=source.attributes.position,index=source.index;
  if(!index||Array.isArray(mesh.material)||mesh.isSkinnedMesh||Object.keys(source.morphAttributes).length)
    throw new Error('정적 색인은 indexed 단일 재질 메시만 지원합니다');
  if(!(cellSize>0&&Number.isFinite(cellSize)))throw new Error('유효하지 않은 충돌 칸 크기');
  const bins=new Map(),point=new Vector3();
  const end=Math.min(index.count,source.drawRange.start+source.drawRange.count);
  for(let i=source.drawRange.start;i<end;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    const key=`${Math.floor((p.getX(a)+p.getX(b)+p.getX(c))/3/cellSize)},${Math.floor((p.getZ(a)+p.getZ(b)+p.getZ(c))/3/cellSize)}`;
    let bin=bins.get(key);
    if(!bin){bin={indices:[],faces:[],box:new Box3()};bins.set(key,bin);}
    bin.indices.push(a,b,c);bin.faces.push(i/3);
    for(const id of [a,b,c])bin.box.expandByPoint(point.fromBufferAttribute(p,id));
  }
  const leaves=[...bins.values()].map(bin=>{
    const geometry=new BufferGeometry();
    for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
    geometry.setIndex(bin.indices);geometry.boundingBox=bin.box;
    geometry.boundingSphere=bin.box.getBoundingSphere(new Sphere());
    return {...bin,mesh:new Mesh(geometry,mesh.material)};
  });
  const inverse=new Matrix4(),localRay=new Ray();
  const original=mesh.raycast;
  mesh.raycast=function(raycaster,hits){
    // 정적 계약 밖에서 geometry를 바꾸면 기존 검사로 안전하게 되돌린다.
    if(this.geometry!==source){original.call(this,raycaster,hits);return;}
    inverse.copy(this.matrixWorld).invert();localRay.copy(raycaster.ray).applyMatrix4(inverse);
    for(const leaf of leaves){
      if(!localRay.intersectsBox(leaf.box))continue;
      leaf.mesh.material=this.material;leaf.mesh.matrixWorld.copy(this.matrixWorld);
      const start=hits.length;
      Mesh.prototype.raycast.call(leaf.mesh,raycaster,hits);
      for(let i=start;i<hits.length;i++){
        hits[i].object=this;hits[i].faceIndex=leaf.faces[hits[i].faceIndex];
      }
    }
  };
  return mesh;
}
