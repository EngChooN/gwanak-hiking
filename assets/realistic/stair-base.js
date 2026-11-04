import * as THREE from 'three';
import {isStairSurface} from '../../src/route-surfaces.js';

// 계단 몸체: 디딤판(노면 띠의 stairRibbonPart) 아래를 지면까지 채워 떠 보이지 않게 한다.
// 디딤판 높이 규칙은 stairRibbonPart와 같다(단 상단 높이 +1.5cm). 측벽·끝면 아래 끝은 지면보다 STAIR_EMBED만큼 묻는다.
// 측벽은 드러난 높이의 절반만큼 바깥으로 비스듬히 내려(최대 0.6m) 흙·돌 둔덕처럼 지면과 만나게 한다.
// ground(x,z)는 화면에 보이는 최종 지형(2m 청크, 계단 회랑 보정 후) 높이다. 걷는 높이(노면 띠)는 바꾸지 않는다.
export const STAIR_LIFT=.015,STAIR_EMBED=.12,STAIR_BATTER=.5,STAIR_BATTER_MAX=.6,STAIR_GAP_LIMIT=.05;
const SPLIT_STEPS=240;

// densifyRoute 결과에서 계단 단을 뽑는다. 연속한 같은 재질 단은 같은 band다.
export function stairSteps(points){
 const steps=[];let band=-1;
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];if(!isStairSurface(a.material))continue;
  const prev=steps.at(-1);if(!prev||prev.index!==i-1||prev.material!==a.material)band++;
  steps.push({index:i,band,material:a.material,a,b,top:Math.max(a.y,b.y)+STAIR_LIFT});
 }
 return steps;
}
const edgeOf=(p,side)=>({x:p.x+p.nx*p.width/2*side,z:p.z+p.nz*p.width/2*side});
const centreOf=p=>({x:p.x,z:p.z});
function unitNormal(p){const l=Math.hypot(p.nx,p.nz)||1;return [p.nx/l,p.nz/l];}
// 측벽 아래 끝: 디딤판 가장자리에서 바깥으로 batter만큼 나간 자리의 지면보다 STAIR_EMBED 아래.
function footAt(p,side,top,ground){
 const e=edgeOf(p,side),g0=ground(e.x,e.z),base=Number.isFinite(g0)?g0:top-STAIR_EMBED;
 const out=Math.min(STAIR_BATTER_MAX,STAIR_BATTER*Math.max(0,top-base)),[ux,uz]=unitNormal(p);
 const x=e.x+ux*side*out,z=e.z+uz*side*out,g=ground(x,z);
 return {x,z,y:Math.min(Number.isFinite(g)?g:base,base,top)-STAIR_EMBED};
}
function lowAt(p,top,ground){const c=centreOf(p),g=ground(c.x,c.z);return {...c,y:Math.min(Number.isFinite(g)?g:top,top)-STAIR_EMBED};}

// 같은 band 안 이웃 단이 만나는 점은 높은 쪽 디딤판 기준 하나의 발(foot)을 같이 쓴다. 단차 사이에는 이음 삼각형을 넣는다.
export function stairBaseLayout(steps,ground){
 const bands=[];
 for(const step of steps){(bands[step.band]??=[]).push(step);}
 return bands.filter(Boolean).map(list=>{
  const points=[list[0].a,...list.map(s=>s.b)],tops=points.map((_,i)=>Math.max(list[i-1]?.top??-Infinity,list[i]?.top??-Infinity));
  const feet=points.map((p,i)=>({left:footAt(p,-1,tops[i],ground),right:footAt(p,1,tops[i],ground)}));
  const ends=[0,points.length-1].map(i=>({point:points[i],top:list[Math.min(i,list.length-1)].top,low:lowAt(points[i],tops[i],ground),feet:feet[i]}));
  return {material:list[0].material,steps:list,points,feet,ends};
 });
}

function builder(metres){
 const positions=[],uv=[],indices=[];
 const vertex=(v,u,w)=>{positions.push(v.x,v.y,v.z);uv.push(u/metres,w/metres);return positions.length/3-1;};
 return {
  tri(a,b,c){indices.push(a,b,c);},
  quad(a,b,c,d){indices.push(a,c,b,b,c,d);},
  vertex,
  mesh(material,name){
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
   g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
   const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;mesh.userData.metricKind='계단 측벽';return mesh;
  },
  get empty(){return !indices.length;}
 };
}
// 측벽 두 장 + 단차 이음 + 양 끝면. 재질은 {stairs, deck_stairs}.
export function createStairBase(points,ground,materials,metres=2){
 const layout=stairBaseLayout(stairSteps(points),ground),group=new THREE.Group();group.name='계단 측벽';group.userData.metricKind='계단 측벽';
 let triangles=0;
 for(const band of layout){
  for(let from=0;from<band.steps.length;from+=SPLIT_STEPS){
   const to=Math.min(band.steps.length,from+SPLIT_STEPS),b=builder(metres);
   for(let i=from;i<to;i++){
    const step=band.steps[i],pa=band.points[i],pb=band.points[i+1],fa=band.feet[i],fb=band.feet[i+1];
    for(const side of [-1,1]){
     const key=side<0?'left':'right',ea=edgeOf(pa,side),eb=edgeOf(pb,side);
     const t0=b.vertex({...ea,y:step.top},pa.s,step.top),t1=b.vertex({...eb,y:step.top},pb.s,step.top);
     const f0=b.vertex(fa[key],pa.s,fa[key].y),f1=b.vertex(fb[key],pb.s,fb[key].y);
     b.quad(t0,t1,f0,f1);
     // 다음 단과 디딤판 높이가 다르면 낮은 쪽 상단·높은 쪽 상단·공통 발 사이를 메운다.
     const next=band.steps[i+1];
     if(next&&Math.abs(next.top-step.top)>1e-6){
      const y0=Math.min(step.top,next.top),y1=Math.max(step.top,next.top);
      b.tri(b.vertex({...eb,y:y0},pb.s,y0),b.vertex({...eb,y:y1},pb.s,y1),b.vertex(fb[key],pb.s,fb[key].y));
     }
    }
   }
   // 띠 양 끝: 디딤판 높이에서 지면 아래까지 막는다(왼쪽 발·가운데·오른쪽 발).
   for(const [k,end] of band.ends.entries()){
    if((k===0&&from!==0)||(k===1&&to!==band.steps.length))continue;
    const p=end.point,l=edgeOf(p,-1),r=edgeOf(p,1),w=p.width/2;
    const tl=b.vertex({...l,y:end.top},-w,end.top),tc=b.vertex({...centreOf(p),y:end.top},0,end.top),tr=b.vertex({...r,y:end.top},w,end.top);
    const fl=b.vertex(end.feet.left,-w,end.feet.left.y),fc=b.vertex(end.low,0,end.low.y),fr=b.vertex(end.feet.right,w,end.feet.right.y);
    b.quad(tl,tc,fl,fc);b.quad(tc,tr,fc,fr);
   }
   if(b.empty)continue;
   const mesh=b.mesh(materials[band.material]??materials.stairs,`계단 측벽 ${band.material} ${Math.round(band.steps[from].a.s)}m`);
   triangles+=mesh.geometry.index.count/3;group.add(mesh);
  }
 }
 group.userData.counts={bands:layout.length,steps:layout.reduce((n,b)=>n+b.steps.length,0),meshes:group.children.length,triangles};
 return {group,layout};
}

// 자동 검사: 측벽·끝면 아래 끝이 지면 위로 뜬 틈(최대), 지형이 디딤판 위로 솟은 양(최대).
// 측벽 아래 끝은 단 길이 방향 5점, 끝면 아래 끝은 폭 방향 5점, 디딤판은 3×3점을 잰다. ground는 검사용 지형(최종 청크) 높이다.
// surface(x,z)는 걷는 면(노면 띠) 높이다. 급한 꺾임 안쪽은 이웃 단 디딤판이 겹쳐 보이는 면이 더 높으므로 그 높이로 비교한다.
export function stairGapReport(layout,ground,surface=null){
 let maxGap=-Infinity,maxPoke=-Infinity,worstGap=null,worstPoke=null,samples=0,missing=0;
 const gapAt=(x,z,y,s,where)=>{const g=ground(x,z);if(!Number.isFinite(g)){missing++;return;}samples++;const gap=y-g;if(gap>maxGap){maxGap=gap;worstGap={x,z,s,where,gap};}};
 const T=[0,.25,.5,.75,1];
 for(const band of layout){
  band.steps.forEach((step,i)=>{
   const pa=band.points[i],pb=band.points[i+1];
   for(const key of ['left','right']){const a=band.feet[i][key],b=band.feet[i+1][key];for(const t of T)gapAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t,pa.s+(pb.s-pa.s)*t,`측벽 ${key}`);}
   for(const t of [.15,.5,.85])for(const side of [-.9,0,.9]){
    const x=pa.x+(pb.x-pa.x)*t+(pa.nx+(pb.nx-pa.nx)*t)*pa.width/2*side,z=pa.z+(pb.z-pa.z)*t+(pa.nz+(pb.nz-pa.nz)*t)*pa.width/2*side,g=ground(x,z);
    if(!Number.isFinite(g))continue;const top=Math.max(step.top,surface?.(x,z)??-Infinity),poke=g-top;if(poke>maxPoke){maxPoke=poke;worstPoke={x,z,s:pa.s,poke};}
   }
  });
  for(const end of band.ends){const pts=[end.feet.left,end.low,end.feet.right];
   for(let k=0;k<2;k++){const a=pts[k],b=pts[k+1];for(const t of T)gapAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t,end.point.s,'끝면');}}
 }
 return {bands:layout.length,steps:layout.reduce((n,b)=>n+b.steps.length,0),samples,missing,maxGap,maxPoke,worstGap,worstPoke,limit:STAIR_GAP_LIMIT,ok:missing===0&&maxGap<=STAIR_GAP_LIMIT};
}
