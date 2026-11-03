// 등산로의 실제 Float32 삼각형을 XZ 격자로 색인한다. 높이 근사나 노면 변경 없음.
export function surfaceIndex(group, cellSize=4) {
  const bins=new Map();
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const p=mesh.geometry.attributes.position,idx=mesh.geometry.index;
    for(let i=0;i<idx.count;i+=3){
      const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
      const t=[p.getX(a),p.getZ(a),p.getY(a),p.getX(b),p.getZ(b),p.getY(b),p.getX(c),p.getZ(c),p.getY(c),mesh.material.side];
      for(let z=Math.floor(Math.min(t[1],t[4],t[7])/cellSize);z<=Math.floor(Math.max(t[1],t[4],t[7])/cellSize);z++)
        for(let x=Math.floor(Math.min(t[0],t[3],t[6])/cellSize);x<=Math.floor(Math.max(t[0],t[3],t[6])/cellSize);x++){
          const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(t);
        }
    }
  });
  return (x,z,originY=Infinity,far=Infinity)=>{
    let height=-Infinity;
    for(const t of bins.get(`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`)??[]){
      const [ax,az,ay,bx,bz,by,cx,cz,cy]=t;
      const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(d)<1e-12)continue;
      if((t[9]===0&&d>=0)||(t[9]===1&&d<=0))continue;
      const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d;
      const v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,w=1-u-v;
      if(u< -1e-9||v< -1e-9||w< -1e-9)continue;
      const y=u*ay+v*by+w*cy;
      if(y<=originY&&originY-y<=far)height=Math.max(height,y);
    }
    return height===-Infinity?undefined:height;
  };
}
