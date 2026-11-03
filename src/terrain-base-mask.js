// 상시 지형의 성긴 삼각형이 이미 준비된 2m 청크를 뚫고 나오는 것을 막는다.
// 청크가 모두 준비된 경계에서만 인덱스를 바꾸며, 대기 중에는 원래 바닥을 유지한다.
const originals=new WeakMap();
export function maskCoveredBaseGeometry(geometry,chunks,size=64){
 if(!originals.has(geometry))originals.set(geometry,geometry.index.array.slice());
 const source=originals.get(geometry),p=geometry.attributes.position,covered=new Uint8Array(p.count);
 const contains=(x,z)=>chunks.has(`${Math.floor(x/size)},${Math.floor(z/size)}`);
 for(let i=0;i<p.count;i++)covered[i]=contains(p.getX(i),p.getZ(i))?1:0;
 const indices=[];
 for(let i=0;i<source.length;i+=3){const a=source[i],b=source[i+1],c=source[i+2];
  if(covered[a]&&covered[b]&&covered[c]&&contains((p.getX(a)+p.getX(b)+p.getX(c))/3,(p.getZ(a)+p.getZ(b)+p.getZ(c))/3))continue;
  indices.push(a,b,c);
 }
 geometry.setIndex(indices);return indices.length/3;
}
