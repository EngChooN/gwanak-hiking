import {isStairSurface} from '../../src/route-surfaces.js';

// 격자 꼭짓점에서만 높이를 깎으면 그 사이를 가로지르는 경로를 삼각형이 덮는다.
// 계단 회랑과 겹치는 삼각형의 공유 꼭짓점을 낮춰 디딤판 아래에 여유를 둔다.
// 같은 꼭짓점을 함께 수정하므로 청크 내부에 갈라진 틈을 만들지 않는다.
export function stairTerrainClearance(route,cellSize=32){
  const bins=new Map();
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1];if(!isStairSurface(a.material))continue;
    const half=Math.max(a.width,b.width)/2+.25;
    const box={minX:Math.min(a.x,b.x)-half,maxX:Math.max(a.x,b.x)+half,
      minZ:Math.min(a.z,b.z)-half,maxZ:Math.max(a.z,b.z)+half,y:Math.min(a.y,b.y)-.12};
    for(let z=Math.floor(box.minZ/cellSize);z<=Math.floor(box.maxZ/cellSize);z++)
      for(let x=Math.floor(box.minX/cellSize);x<=Math.floor(box.maxX/cellSize);x++){
        const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(box);
      }
  }
  return geometry=>{
    const p=geometry.attributes.position,index=geometry.index;
    let span=0;
    for(let i=0;i<index.count;i+=3){
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      const minX=Math.min(...ids.map(j=>p.getX(j))),maxX=Math.max(...ids.map(j=>p.getX(j)));
      const minZ=Math.min(...ids.map(j=>p.getZ(j))),maxZ=Math.max(...ids.map(j=>p.getZ(j)));
      span=Math.max(span,maxX-minX,maxZ-minZ);
    }
    // 같은 격자 간격의 인접 청크는 경계 꼭짓점에도 같은 조회 범위를 쓴다.
    for(let j=0;j<p.count;j++){
      const minX=p.getX(j)-span,maxX=p.getX(j)+span,minZ=p.getZ(j)-span,maxZ=p.getZ(j)+span;
      let ceiling=Infinity;
      for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)
        for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)
          for(const box of bins.get(`${x},${z}`)??[])
            if(box.minX<=maxX&&box.maxX>=minX&&box.minZ<=maxZ&&box.maxZ>=minZ)ceiling=Math.min(ceiling,box.y);
      if(Number.isFinite(ceiling))p.setY(j,Math.min(p.getY(j),ceiling));
    }
    p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
  };
}
