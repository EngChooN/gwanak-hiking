import {isStairSurface} from '../../src/route-surfaces.js';

// 격자 꼭짓점에서만 높이를 깎으면 그 사이를 가로지르는 경로를 삼각형이 덮는다.
// 계단 회랑과 겹치는 삼각형의 꼭짓점을, 주변 경로 구간 경사면(구간을 넘어 늘린 기울기 평면)들의 최솟값보다 STAIR_CLEARANCE 아래로 낮춘다.
// 평면들의 최솟값은 오목 함수라 삼각형 직선 보간이 그 아래에 머문다. 디딤판은 경사선 이상(단 상단)이라 V자 골에서도 지형이 디딤판을 뚫지 않는다.
// 곧은 계단에서는 모든 평면이 같아 예전처럼 2m 안 가장 낮은 단까지 파내 디딤판 아래 도랑을 만들지 않는다.
// 계단 앞뒤 NEIGHBOUR 구간도 평면 후보에 넣어 계단 끝과 이어지는 노면 사이를 맞춘다.
// 같은 꼭짓점을 함께 수정하므로 청크 내부에 갈라진 틈을 만들지 않는다.
export const STAIR_CLEARANCE=.12;
const NEIGHBOUR=12;
export function stairTerrainClearance(route,cellSize=32){
  const boxes=new Map(),lines=new Map(),near=new Set();
  const add=(bins,box,item)=>{
    for(let z=Math.floor(box.minZ/cellSize);z<=Math.floor(box.maxZ/cellSize);z++)
      for(let x=Math.floor(box.minX/cellSize);x<=Math.floor(box.maxX/cellSize);x++){
        const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(item);
      }
  };
  const boxOf=(a,b,pad)=>({minX:Math.min(a.x,b.x)-pad,maxX:Math.max(a.x,b.x)+pad,minZ:Math.min(a.z,b.z)-pad,maxZ:Math.max(a.z,b.z)+pad});
  for(let i=0;i<route.length-1;i++)if(isStairSurface(route[i].material))
    for(let k=Math.max(0,i-NEIGHBOUR);k<=Math.min(route.length-2,i+NEIGHBOUR);k++)near.add(k);
  for(const i of near){
    const a=route[i],b=route[i+1],half=Math.max(a.width,b.width)/2+.25,box=boxOf(a,b,half);
    // 경사면의 등고선은 노면 띠의 실제 가로 방향(densifyRoute의 nx,nz, 꺾임에서 직각이 아님)을 따른다: v=a+t(b-a)+l·n 에서 높이는 a.y+t(b.y-a.y).
    const dx=b.x-a.x,dz=b.z-a.z,nx=((a.nx??-dz)+(b.nx??-dz))/2,nz=((a.nz??dx)+(b.nz??dx))/2,det=dx*nz-dz*nx;
    const len=Math.hypot(dx,dz)||1,ok=Math.abs(det)>.2*len*Math.hypot(nx,nz);
    add(lines,box,{ax:a.x,az:a.z,ay:a.y,dy:b.y-a.y,kx:ok?nz/det:dx/len/len,kz:ok?-nx/det:dz/len/len,box});
    if(isStairSurface(a.material))add(boxes,box,box);
  }
  const planeAt=(x,z,l)=>l.ay+l.dy*((x-l.ax)*l.kx+(z-l.az)*l.kz);
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
      const x=p.getX(j),z=p.getZ(j),minX=x-span,maxX=x+span,minZ=z-span,maxZ=z+span;
      let hit=false,ceiling=Infinity;
      for(let cz=Math.floor(minZ/cellSize);cz<=Math.floor(maxZ/cellSize);cz++)
        for(let cx=Math.floor(minX/cellSize);cx<=Math.floor(maxX/cellSize);cx++){
          for(const box of boxes.get(`${cx},${cz}`)??[])
            if(box.minX<=maxX&&box.maxX>=minX&&box.minZ<=maxZ&&box.maxZ>=minZ)hit=true;
          for(const l of lines.get(`${cx},${cz}`)??[]){const box=l.box;
            if(box.minX<=maxX&&box.maxX>=minX&&box.minZ<=maxZ&&box.maxZ>=minZ)ceiling=Math.min(ceiling,planeAt(x,z,l));}
        }
      if(!hit)continue;
      if(Number.isFinite(ceiling))p.setY(j,Math.min(p.getY(j),ceiling-STAIR_CLEARANCE));
    }
    p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
  };
}
