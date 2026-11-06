// 게임과 동일한 WGS84 국소 접평면. 단위 m, +X 동쪽, -Z 북쪽.
export const ORIGIN={lat:37.46803,lon:126.946528};
const rad=Math.PI/180, a=6378137, e2=.0066943799901413165;
const phi=ORIGIN.lat*rad, d=1-e2*Math.sin(phi)**2;
export const MX=a/Math.sqrt(d)*Math.cos(phi)*rad;
export const MZ=a*(1-e2)/d**1.5*rad;
export const project=(lat,lon)=>({x:(lon-ORIGIN.lon)*MX,z:(ORIGIN.lat-lat)*MZ});
export const unproject=(x,z)=>({lat:ORIGIN.lat-z/MZ,lon:ORIGIN.lon+x/MX});
export const mix=(a,b,t)=>a+(b-a)*t;
export function gridHeight(grid,x,z){
  const {x0,z0,spacing,width,height,values}=grid;
  const u=(x-x0)/spacing,v=(z-z0)/spacing;
  if(u<0||v<0||u>width-1||v>height-1)throw new RangeError('고도 격자 범위 밖');
  const i=Math.min(width-2,Math.floor(u)),j=Math.min(height-2,Math.floor(v));
  return mix(mix(values[j*width+i],values[j*width+i+1],u-i),mix(values[(j+1)*width+i],values[(j+1)*width+i+1],u-i),v-j);
}
export function nearestRoute(route,x,z){
  let best={distance:Infinity};
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
    const distance=Math.hypot(x-mix(a.x,b.x,t),z-mix(a.z,b.z,t));
    if(distance<best.distance)best={distance,y:mix(a.y,b.y,t),s:mix(a.s,b.s,t),width:mix(a.width,b.width,t),index:i,t};
  }
  return best;
}
// 경로 선분 AABB 트리. 최근접 선분과 보간식은 nearestRoute와 동일하다.
export function indexRoute(route){
  const build=ids=>{
    const node={minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity};
    for(const i of ids)for(const p of [route[i],route[i+1]]){node.minX=Math.min(node.minX,p.x);node.maxX=Math.max(node.maxX,p.x);node.minZ=Math.min(node.minZ,p.z);node.maxZ=Math.max(node.maxZ,p.z);}
    if(ids.length<=8)node.ids=ids;
    else{const axis=node.maxX-node.minX>node.maxZ-node.minZ?'x':'z';ids.sort((i,j)=>route[i][axis]+route[i+1][axis]-route[j][axis]-route[j+1][axis]);const mid=ids.length>>1;node.left=build(ids.slice(0,mid));node.right=build(ids.slice(mid));}
    return node;
  };
  const tree=build(route.slice(1).map((_,i)=>i));
  // 최근접 후보는 지역 변수로만 갱신하고 결과 객체는 마지막에 한 번 만든다(숲 배치가 수십만 번 부른다, 2026-11-06). 결과는 같다.
  let px=0,pz=0,bestD=Infinity,bestSq=Infinity,bestI=Infinity,bestT=0;
  const bound=n=>Math.max(n.minX-px,0,px-n.maxX)**2+Math.max(n.minZ-pz,0,pz-n.maxZ)**2;
  const visit=node=>{
    if(bound(node)>bestSq+1e-9)return;
    if(node.ids){for(const i of node.ids){
      const a=route[i],b=route[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((px-a.x)*dx+(pz-a.z)*dz)/(dx*dx+dz*dz||1)));
      const distance=Math.hypot(px-mix(a.x,b.x,t),pz-mix(a.z,b.z,t));
      if(distance<bestD||(distance===bestD&&i<bestI)){bestSq=distance**2;bestD=distance;bestI=i;bestT=t;}
    }}else{const first=bound(node.left)<=bound(node.right)?node.left:node.right;visit(first);visit(first===node.left?node.right:node.left);}
  };
  return (x,z)=>{
    px=x;pz=z;bestD=Infinity;bestSq=Infinity;bestI=Infinity;bestT=0;
    visit(tree);
    if(bestI===Infinity)return {distance:Infinity,index:Infinity};
    const a=route[bestI],b=route[bestI+1],t=bestT;
    return {distance:bestD,y:mix(a.y,b.y,t),s:mix(a.s,b.s,t),width:mix(a.width,b.width,t),index:bestI,t};
  };
}
export function cutHeight(raw,hit){
  const shoulder=Math.max(0,Math.min(1,(hit.distance-hit.width/2-2)/24));
  const smooth=shoulder*shoulder*(3-2*shoulder);
  return mix(hit.y,raw,smooth);
}
export function alignRoute(points,height,{startHeight,summitHeight}={}){
  if(!points.length)return [];
  // GPX의 수직 기준이 확인되지 않았으므로 지오이드고를 자동 가감하지 않는다.
  // 중심 DSM을 보존하고, 명시한 표고 기준의 잔차만 수평 누적거리에 따라 보간한다.
  const samples=points.map(p=>height(p.x,p.z));
  if(!samples.every(Number.isFinite))throw new Error('경로 중심 DEM 고도 오류');
  const start=startHeight??samples[0],summit=summitHeight??samples.at(-1);
  if(![start,summit].every(Number.isFinite))throw new Error('고도 기준값 오류');
  const distances=[0];
  for(let i=1;i<points.length;i++)distances[i]=distances[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);
  const total=distances.at(-1);
  if(!total&&start!==summit)throw new Error('길이가 없는 경로의 고도 기준 충돌');
  let s=0,previous;
  return points.map((p,i)=>{
    const width=i>points.length*.86?1.8:2.2;
    const elevationCorrection=mix(start-samples[0],summit-samples.at(-1),total?distances[i]/total:0);
    // 최저점 선택과 일괄 8cm 절삭을 제거한다. 횡단 수평화는 cutHeight가 맡는다.
    const y=i===0?start:i===points.length-1?summit:samples[i]+elevationCorrection;
    const q={...p,originalY:p.y,demCenterY:samples[i],elevationCorrection,y,width,s:0};
    if(previous)s+=Math.hypot(p.x-previous.x,p.z-previous.z,y-previous.y);
    q.s=s;previous=q;return q;
  });
}
export function headingDistance(lat,lon,from){
  const b=project(lat,lon),dx=b.x-from.x,dz=b.z-from.z;
  return {distance:Math.hypot(dx,dz),bearing:(Math.atan2(dx,-dz)/rad+360)%360};
}
