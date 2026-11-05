import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {foliageUniforms} from '../../assets/realistic/foliage-shader.js';
import {TOON,hexToRgb} from './palette.js';
import {ROCK_CELL_GLSL,ROCK_BASE_DECL,rockShadeGLSL} from './rock-shade.js';
// 카툰 전용 자연물(3단계, 산풍경). 실사 GLB를 칠하지 않고 형태를 새로 만든다. 어떤 fetch도 하지 않는다.
//  - 활엽수: 잎 무리 윤곽(톱니)이 있는 부푼 덩어리 3~5개 + 굵고 단순한 줄기·굵은 가지 2~3개. 수관 전체가 바람에 흔들린다.
//  - 소나무: 가장자리가 갈라진 납작 원뿔 층을 쌓은 수관 + 붉은 줄기(관악산 소나무처럼 줄기가 길고 수관이 위에 몰림).
//  - 풀: 넓적하고 끝이 뾰족한 잎 다발 + 노랑·흰 점꽃(다발의 일부). 끝부분이 흔들리고 바람 물결 띠가 지나간다.
//  - 바위: 위가 둥글고 기운 암괴 1~4개를 겹친 덩어리, 둥근 암괴 명암·세로 갈라짐·그늘 면, 윗면 이끼 덩어리.
// 크기·형태 기준: docs/카툰-기준값.md §2. 색은 TOON.nature(팔레트 §1-1에서 화면 결과가 맞도록 고른 재질색).
// 원래 GLB와 같은 id·LOD 파일명으로 부르면(natureParts) 같은 자리에 같은 크기로 들어간다.

const linear=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
function rng(seed){let s=seed>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

// ── 메시 조립: position·normal·color·toonSway(바람 흔들림 폭, m) ──
class Builder{
 constructor(){this.p=[];this.n=[];this.c=[];this.s=[];this.extra=[];}
 vertex(p,n,c,sway=0,extra=0){this.p.push(p.x,p.y,p.z);this.n.push(n.x,n.y,n.z);this.c.push(c.r,c.g,c.b);this.s.push(sway);this.extra.push(extra);}
 geometry(name,{extra=null}={}){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('toonSway',new THREE.Float32BufferAttribute(this.s,1));
  if(extra)g.setAttribute(extra,new THREE.Float32BufferAttribute(this.extra,1));
  g.computeBoundingBox();g.computeBoundingSphere();g.name=name;g.userData.shared=true;g.userData.toonNature=true;
  return g;
 }
 get triangles(){return this.p.length/9;}
}

// 잎 무리 덩어리: 정이십면체를 부풀리고 방향별 굴곡(잎 무리 톱니 윤곽)을 준다.
// 법선은 덩어리 법선과 수관 중심에서 나가는 방향을 섞어(bend) 수관 전체가 한 덩어리로 음영지게 한다.
function addLump(b,{center,radius,detail,seed,crown,leaf,shade,swayOf,jag=.17,bend=.55,variation=0,tufts=0}){
 const g=new THREE.IcosahedronGeometry(1,detail),pos=g.attributes.position,r=rng(seed);
 const axes=[0,1,2,3].map(()=>new THREE.Vector3(r()*2-1,r()*2-1,r()*2-1).normalize()),phase=axes.map(()=>r()*6.283);
 const dir=new THREE.Vector3(),p=new THREE.Vector3(),n=new THREE.Vector3(),out=new THREE.Vector3(),col=new THREE.Color();
 const tone=1+variation*(r()*2-1);
 for(let i=0;i<pos.count;i++){
  dir.fromBufferAttribute(pos,i).normalize();
  // 방향만의 함수라 같은 꼭짓점을 공유하는 삼각형끼리 틈이 생기지 않는다.
  const bump=Math.sin(dir.dot(axes[0])*5.3+phase[0])*Math.sin(dir.dot(axes[1])*4.7+phase[1])*.5+Math.sin(dir.dot(axes[2])*8.1+phase[2])*.3+Math.sin(dir.dot(axes[3])*13.7+phase[3])*.2;
  const k=1+jag*bump;
  p.set(center.x+dir.x*radius.x*k,center.y+dir.y*radius.y*k,center.z+dir.z*radius.z*k);
  n.set(dir.x/radius.x,dir.y/radius.y,dir.z/radius.z).normalize();
  out.copy(p).sub(crown).normalize();n.lerp(out,bend).normalize();
  // 수관 아래·안쪽은 어둡게(잎 그늘), 위쪽 바깥은 밝게. 덩어리마다 명도를 조금씩 다르게.
  const ao=(.8+.2*smooth(-.75,.85,out.y))*(.9+.1*smooth(-.4,.6,dir.dot(out)))*tone;
  // 잎 무리 단위 명암: 굴곡이 솟은 곳은 밝게, 패인 곳은 그늘색 쪽(덩어리 표면이 큰 매끈한 면으로 보이지 않게).
  const cluster=smooth(-.35,.35,bump);
  col.copy(shade).lerp(leaf,smooth(-.55,.7,out.y)*(.7+.3*cluster)).multiplyScalar(ao*(.9+.14*cluster));
  b.vertex(p,n,col,swayOf(p.y));
 }
 g.dispose();
 // 잎 끝 조각: 덩어리 표면에서 바깥으로 돋은 작은 삼각형(앞뒤 두 장). 윤곽이 매끈한 다각형이 아니라 잎 무리처럼 톱니지게 한다.
 const t1=new THREE.Vector3(),t2=new THREE.Vector3(),q=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
 for(let i=0;i<tufts;i++){
  // 피보나치 구면 + 흔들림. 아래쪽(수관 밑면)은 덜 돋게 한다.
  const y=1-2*(i+.5)/tufts,rr=Math.sqrt(1-y*y),phi=i*2.39996+r()*.6;
  dir.set(Math.cos(phi)*rr,y,Math.sin(phi)*rr).normalize();if(dir.y<-.55&&r()<.7)continue;
  const bump=Math.sin(dir.dot(axes[0])*5.3+phase[0])*Math.sin(dir.dot(axes[1])*4.7+phase[1])*.5+Math.sin(dir.dot(axes[2])*8.1+phase[2])*.3+Math.sin(dir.dot(axes[3])*13.7+phase[3])*.2;
  const k=(1+jag*bump)*.93,size=Math.min(radius.x,radius.y)*(.34+r()*.16);
  p.set(center.x+dir.x*radius.x*k,center.y+dir.y*radius.y*k,center.z+dir.z*radius.z*k);
  t1.set(-dir.z,0,dir.x);if(t1.lengthSq()<1e-4)t1.set(1,0,0);t1.normalize().applyAxisAngle(dir,r()*6.283);t2.crossVectors(dir,t1);
  q[0].copy(p).addScaledVector(t1,size*.5);q[1].copy(p).addScaledVector(t1,-size*.5);q[2].copy(p).addScaledVector(dir,size*.8).addScaledVector(t2,size*.25).addScaledVector(t1,(r()-.5)*size*.4);
  out.copy(q[2]).sub(crown).normalize();n.copy(dir).lerp(out,bend).normalize();
  const ao=(.74+.26*smooth(-.75,.85,out.y))*tone*(.97+r()*.08);
  col.copy(shade).lerp(leaf,smooth(-.55,.7,out.y)).multiplyScalar(ao);
  for(const v of [q[0],q[1],q[2],q[1],q[0],q[2]])b.vertex(v,n,col,swayOf(v.y));
 }
}

// 줄기·가지: a→b 원뿔대(굽힘 bow), 밑동은 flare배 벌어진다.
function addLimb(b,{a,b:end,ra,rb,sides,rings=2,color,swayOf,flare=1,bow=null,seed=1,dark=.78}){
 const axis=new THREE.Vector3().subVectors(end,a),len=axis.length();axis.normalize();
 const side=Math.abs(axis.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
 const u=new THREE.Vector3().crossVectors(axis,side).normalize(),v=new THREE.Vector3().crossVectors(axis,u).normalize();
 const ring=(t)=>{
  const c=a.clone().addScaledVector(axis,len*t);if(bow)c.addScaledVector(bow,Math.sin(t*Math.PI));
  const rr=THREE.MathUtils.lerp(ra,rb,t)*(1+(flare-1)*Math.pow(1-t,6));
  return {c,rr};
 };
 const rows=[];for(let j=0;j<=rings;j++)rows.push(ring(j/rings));
 const pt=(row,i)=>{const ang=i/sides*Math.PI*2,d=u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v,Math.sin(ang));return {p:row.c.clone().addScaledVector(d,row.rr),n:d};};
 const col=new THREE.Color();
 for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){
  const q=[pt(rows[j],i),pt(rows[j],i+1),pt(rows[j+1],i+1),pt(rows[j+1],i)];
  for(const k of [0,1,2,0,2,3]){
   // 해 받는 쪽(+x·+z 약간)과 반대쪽 명암은 조명이 맡고, 아래쪽만 살짝 어둡게.
   const t=(j+(k===2||k===3?1:0))/rings;col.copy(color).multiplyScalar(THREE.MathUtils.lerp(dark,1,Math.min(1,t*1.4+.2)));
   b.vertex(q[k].p,q[k].n,col,swayOf(q[k].p.y));
  }
 }
}

// 소나무 층: 가장자리가 톱니처럼 갈라지고 끝이 처진 납작 원뿔(윗면) + 그늘진 아랫면.
function addTier(b,{y,height,radius,segments,seed,needle,shade,swayOf,droop=.25,offset=new THREE.Vector3(),tufts=0}){
 const r=rng(seed),apex=new THREE.Vector3(offset.x,y+height,offset.z),under=new THREE.Vector3(offset.x,y+height*.18,offset.z);
 const rim=[];
 for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI*2+r()*.12,tooth=i%2?.74+r()*.12:1+r()*.08,rr=radius*tooth;
  rim.push(new THREE.Vector3(offset.x+Math.cos(a)*rr,y-droop*height*(tooth>.9?1:.4),offset.z+Math.sin(a)*rr));
 }
 const col=new THREE.Color(),n=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3();
 for(let i=0;i<segments;i++){
  const p0=rim[i],p1=rim[(i+1)%segments];
  // 윗면: 꼭대기는 밝고 가장자리로 갈수록 살짝 어둡다. 법선은 바깥·위로 부풀린 둥근 법선.
  for(const [p,top] of [[apex,1],[p1,0],[p0,0]]){
   n.set(p.x-offset.x,0,p.z-offset.z);if(n.lengthSq()<1e-6)n.set(0,1,0);else n.normalize().multiplyScalar(.75);n.y=top?1:.55;n.normalize();
   col.copy(needle).multiplyScalar(top?1.08:.9);b.vertex(p,n,col,swayOf(p.y));
  }
  // 아랫면: 그늘색, 아래를 향한 법선.
  for(const p of [under,p0,p1]){
   e1.set(p.x-offset.x,0,p.z-offset.z);if(e1.lengthSq()>1e-6)e1.normalize().multiplyScalar(.5);n.set(e1.x,-1,e1.z).normalize();
   col.copy(shade);b.vertex(p,n,col,swayOf(p.y));
  }
  // 솔잎 무리 톱니: 가장자리마다 바깥·아래로 갈라져 나온 잎 끝(앞뒤 두 장).
  for(let k=0;k<tufts;k++){
   const t=(k+.5)/tufts,m=p0.clone().lerp(p1,t),out=new THREE.Vector3(m.x-offset.x,0,m.z-offset.z),len=out.length()||1;out.multiplyScalar(1/len);
   const side=new THREE.Vector3(-out.z,0,out.x),sz=radius*(.16+r()*.1);
   const a=m.clone().addScaledVector(side,sz*.45).addScaledVector(out,-sz*.3),c=m.clone().addScaledVector(side,-sz*.45).addScaledVector(out,-sz*.3);
   const tip=m.clone().addScaledVector(out,sz*.9).add(new THREE.Vector3(0,-sz*(.25+r()*.3),0));
   n.set(out.x*.6,.8,out.z*.6).normalize();col.copy(needle).multiplyScalar(.86+r()*.1);
   for(const v of [a,c,tip,c,a,tip])b.vertex(v,n,col,swayOf(v.y));
  }
 }
}

// ── 수종별 모양(높이·너비는 원래 GLB 카드 크기에 맞춘다) ──
const SPECIES={
 // 높이 9.4~10.4m, 수관 너비 ≈ 0.95~1.0H(우산형), 줄기·가지 노출 ≈ 0.5H.
 tree_small_02:{kind:'broadleaf',height:9.4,width:9.0,seed:11,lean:.15},
 island_tree_01:{kind:'broadleaf',height:10.4,width:10.4,seed:23,lean:.25},
 pine_tree_01:{kind:'pine',height:12.4,width:7.4,seed:31},
 pine_sapling_medium:{kind:'sapling',height:5.0,width:4.2,seed:47},
};
// LOD별 덩어리 수·세분(가까이 3~5개, 중간 3개, 먼 나무 1~2개 — 기준값 §2-1).
const BROADLEAF_LOD=[
 {lumps:5,detail:3,trunkSides:9,branches:3,rings:4,tufts:96},
 {lumps:4,detail:1,trunkSides:6,branches:3,rings:3,tufts:34},
 {lumps:2,detail:1,trunkSides:4,branches:0,rings:1,tufts:0},
];
// 우산형(수관 너비 ≈ 높이): 줄기는 0.4H에서 굵은 가지 2~3갈래로 갈라지고, 덩어리는 가지 끝마다 하나씩 떨어져 얹힌다(사이 틈이 보이게).
function broadleaf(spec,lod,palette){
 const L=BROADLEAF_LOD[lod],b=new Builder(),r=rng(spec.seed),H=spec.height,W=spec.width;
 const swayOf=y=>.42*Math.pow(Math.max(0,y)/H,2);
 const forkY=H*.31,lean=new THREE.Vector3(spec.lean*W*.08,0,0),crownC=new THREE.Vector3(lean.x,H*.68,0);
 const fork=new THREE.Vector3(lean.x,forkY,0);
 // 줄기: 굵기 ÷ 수관 너비 ≈ 0.12, 밑동 1.5배, 살짝 굽음.
 addLimb(b,{a:new THREE.Vector3(0,0,0),b:fork.clone().add(new THREE.Vector3(0,H*.04,0)),ra:W*.06,rb:W*.045,sides:L.trunkSides,rings:L.rings,color:palette.trunk,swayOf,flare:1.5,bow:new THREE.Vector3(W*.025,0,W*.015)});
 const lumps=[{c:new THREE.Vector3(crownC.x+W*.03,H*.86,-W*.02),r:W*.21}];
 const around=L.lumps-1;
 for(let i=0;i<around;i++){
  const a=i/around*Math.PI*2+r()*.45+.4,d=W*(.3+r()*.05),y=H*(.67+r()*.07);
  lumps.push({c:new THREE.Vector3(crownC.x+Math.cos(a)*d,y,crownC.z+Math.sin(a)*d),r:W*(.2+r()*.035)});
 }
 if(L.lumps===2){lumps[0].r=W*.34;lumps[0].c.set(crownC.x,H*.74,0);lumps[1].c.set(crownC.x+W*.16,H*.62,-W*.1);lumps[1].r=W*.28;}
 // 굵은 가지: 갈래점에서 둘레 덩어리 아래쪽으로 비스듬히. 덩어리보다 먼저 그려 틈 사이로 보인다.
 for(let i=0;i<L.branches&&i<lumps.length-1;i++){
  const t=lumps[i+1].c.clone();t.y-=lumps[i+1].r*.4;
  addLimb(b,{a:fork.clone(),b:t,ra:W*.034,rb:W*.017,sides:Math.max(4,L.trunkSides-3),rings:2,color:palette.trunk,swayOf,dark:.92,bow:new THREE.Vector3(0,H*.03,0)});
 }
 if(L.branches)addLimb(b,{a:fork.clone(),b:lumps[0].c.clone().add(new THREE.Vector3(0,-lumps[0].r*.5,0)),ra:W*.03,rb:W*.015,sides:Math.max(4,L.trunkSides-3),rings:1,color:palette.trunk,swayOf,dark:.92});
 lumps.forEach((l,i)=>addLump(b,{center:l.c,radius:new THREE.Vector3(l.r,l.r*.8,l.r),detail:L.detail,seed:spec.seed*7+i,crown:crownC,leaf:palette.leaf,shade:palette.leafShade,swayOf,jag:lod===2?.12:.22,variation:.07,tufts:L.tufts}));
 return b;
}
const PINE_LOD=[{tiers:6,segments:14,trunkSides:7,rings:3,tufts:3},{tiers:5,segments:10,trunkSides:5,rings:2,tufts:2},{tiers:3,segments:7,trunkSides:3,rings:1,tufts:0}];
// 관악산 소나무: 줄기가 길고(노출 ≈ 0.45H) 붉으며 살짝 기울고, 수관은 위쪽에 층층이 몰린다.
function pine(spec,lod,palette,{sapling=false}={}){
 const L=PINE_LOD[lod],b=new Builder(),r=rng(spec.seed),H=spec.height,W=spec.width;
 const swayOf=y=>(sapling?.12:.32)*Math.pow(Math.max(0,y)/H,2);
 const bottom=sapling?H*.3:H*.42,lean=new THREE.Vector3(sapling?0:W*.08,0,sapling?0:W*.03);
 const top=new THREE.Vector3(lean.x,H*(sapling?.8:.96),lean.z);
 addLimb(b,{a:new THREE.Vector3(0,0,0),b:top,ra:sapling?W*.05:W*.06,rb:W*.02,sides:L.trunkSides,rings:L.rings,color:sapling?palette.trunk:palette.pineTrunk,swayOf,flare:1.35,bow:sapling?null:new THREE.Vector3(-W*.05,0,0)});
 if(sapling){
  // 어린 소나무: 원뿔 층(피라미드 3단)도, 납작한 뭉치를 띄엄띄엄 꽂은 모양(원반·버섯 층으로 읽힘)도 아니게,
  // 두께 있는 둥근 솔잎 뭉치를 위아래로 40% 넘게 겹쳐 쌓아 줄기를 가린다. 위로 갈수록 작고, 좌우로 조금씩 엇갈려
  // 윤곽이 울퉁불퉁한 구름형(관악산 어린 소나무)이 된다. 먼 단계도 정이십면체 1단 이상(0단은 육각 판처럼 보임).
  const pads=lod===2?3:lod===1?4:5,crown=new THREE.Vector3(0,H*.58,0);
  for(let i=0;i<pads;i++){
   const t=i/(pads-1),y=H*THREE.MathUtils.lerp(.4,.76,t)+(r()-.5)*H*.03,a=i*2.4+r()*.8,d=W*(i===pads-1?.02:.06+r()*.05)*(1-t*.5);
   const rr=W*THREE.MathUtils.lerp(.31,.17,t)*(.9+r()*.2);
   addLump(b,{center:new THREE.Vector3(Math.cos(a)*d,y,Math.sin(a)*d),radius:new THREE.Vector3(rr,rr*(lod===2?.85:.78),rr),detail:lod===0?2:1,seed:spec.seed*13+i,crown,
    leaf:palette.sapling,shade:palette.saplingShade,swayOf,jag:lod===2?.12:.2,bend:.62,variation:.05,tufts:lod===2?0:L.tufts*4,
    // 먼 단계 맨 위는 작아서 0단으로도 충분(삼각형 상한 200).
    ...(lod===2&&i===pads-1?{detail:0,jag:.08}:{})});
  }
  return b;
 }
 const tiers=L.tiers;
 for(let i=0;i<tiers;i++){
  const t=i/(tiers-1||1),y=THREE.MathUtils.lerp(sapling?bottom:H*.5,sapling?H*.62:H*.88,t);
  // 아래층이 넓고 위로 갈수록 좁다. 관악산 소나무는 맨 아래층도 너무 넓지 않게(우산형).
  const radius=W*.5*(sapling?THREE.MathUtils.lerp(1,.62,t)*(.9+r()*.2):THREE.MathUtils.lerp(.9,.5,t*t)*(.88+r()*.24));
  const off=new THREE.Vector3(lean.x*(y/H)+(r()-.5)*W*(sapling?.22:.08),0,lean.z*(y/H)+(r()-.5)*W*(sapling?.22:.08));
  addTier(b,{y,height:H*(sapling?.26:.11),radius,segments:L.segments,seed:spec.seed*13+i,needle:sapling?palette.sapling:palette.pine,shade:sapling?palette.saplingShade:palette.pineShade,swayOf,offset:off,droop:.3,tufts:L.tufts});
 }
 return b;
}

// 덤불(숲 덤불층 대체): 높이 약 1.1m, 반경 .7m의 잎 덩어리 3개.
function shrub(palette){
 // 잎 덩어리 4개를 낮고 넓게 흩어 놓아 둥근 바위처럼 보이지 않게 한다(윤곽 굴곡을 크게).
 const b=new Builder(),crown=new THREE.Vector3(0,.4,0),swayOf=y=>.06*Math.pow(Math.max(0,y)/1.1,2);
 [[0,.62,0,.36],[.34,.42,.16,.3],[-.3,.38,-.18,.3],[.06,.36,-.36,.26]].forEach(([x,y,z,rr],i)=>addLump(b,{center:new THREE.Vector3(x,y,z),radius:new THREE.Vector3(rr*1.15,rr*.85,rr*1.15),detail:1,seed:500+i,crown,leaf:palette.bush,shade:palette.bushShade,swayOf,jag:.24,bend:.55,variation:.07,tufts:10}));
 return b;
}

// 풀 다발: 넓적하고 끝이 뾰족한 잎(3삼각형) 여러 장 + 점꽃(작은 별 2장, toonFlower=1).
// 잎 끝으로 갈수록 밝게(바닥 그늘 → 끝 연두), 꽃은 노랑·흰색 둘 중 하나를 셰이더가 고른다.
function grassClump({blades=9,height=.42,spread=.2,flowers=1,seed=3}={},palette){
 const b=new Builder(),r=rng(seed),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
 for(let i=0;i<blades;i++){
  const a=i*2.399+r()*.4,d=spread*(.25+r()*.75),bx=Math.cos(a)*d,bz=Math.sin(a)*d,h=height*(.6+r()*.5),w=.028+r()*.02;
  const lean=.18+r()*.22,face=a+1.2+r()*.6,fx=Math.cos(face),fz=Math.sin(face);
  const tip=new THREE.Vector3(bx+Math.cos(a)*h*lean,h,bz+Math.sin(a)*h*lean);
  const mid=new THREE.Vector3(bx+Math.cos(a)*h*lean*.4,h*.5,bz+Math.sin(a)*h*lean*.4);
  const l0=new THREE.Vector3(bx-fx*w,0,bz-fz*w),r0=new THREE.Vector3(bx+fx*w,0,bz+fz*w);
  const l1=mid.clone().add(new THREE.Vector3(-fx*w*1.15,0,-fz*w*1.15)),r1=mid.clone().add(new THREE.Vector3(fx*w*1.15,0,fz*w*1.15));
  // 위로 향한 부드러운 법선(가는 잎 면마다 흰 줄이 생기지 않게).
  const n=new THREE.Vector3(Math.cos(a)*.3,1,Math.sin(a)*.3).normalize();
  const c=t=>col.copy(palette.grassBase).lerp(palette.grassTip,t);
  const sw=y=>.14*Math.pow(y/height,2);
  for(const [p,t] of [[l0,0],[r0,0],[r1,.55],[l0,0],[r1,.55],[l1,.55],[l1,.55],[r1,.55],[tip,1]])b.vertex(p,n,c(t).clone(),sw(p.y),0);
 }
 for(let f=0;f<flowers;f++){
  const a=r()*6.283,d=spread*.5*r(),cx=Math.cos(a)*d,cz=Math.sin(a)*d,h=height*(.78+r()*.25),s=.065;
  const c=new THREE.Vector3(cx,h,cz);
  // 줄기(가는 삼각형)
  const stemCol=palette.grassBase.clone().lerp(palette.grassTip,.5);
  for(const p of [new THREE.Vector3(cx-.008,0,cz),new THREE.Vector3(cx+.008,0,cz),c])b.vertex(p,up,stemCol,.14*Math.pow(p.y/height,2),0);
  // 꽃잎: 수평 별 모양 두 장(위에서도 옆에서도 보이게 살짝 기울인다).
  for(const rot of [0,Math.PI/4]){
   const pts=[0,1,2,3].map(k=>{const t=rot+k*Math.PI/2;return new THREE.Vector3(cx+Math.cos(t)*s,h+(k%2?.03:-.03),cz+Math.sin(t)*s);});
   for(const [i,j,k] of [[0,1,2],[0,2,3]])for(const p of [pts[i],pts[j],pts[k]])b.vertex(p,up,new THREE.Color(1,1,1),.14*Math.pow(h/height,2),1);
  }
 }
 return b;
}

// ── 바위: 원래 GLB 범위(가로·높이·깊이, m)에 맞춘 둥근 암괴 덩어리 ──
// 화강암 암괴(참고 04_06·04_14·05_18)처럼 위가 둥글고 옆으로 퍼진 덩어리 1~3개를 겹친다. 덩어리마다 정이십면체(1단 분할)를
// 큰 굴곡으로 흔들고 부드러운 법선을 줘서, 큰 평면·직선 모서리 없이 둥글게 음영진다. 바닥은 지면 아래로 조금 묻는다.
// lumps: [중심 x,y,z, 반지름 x,y,z(크기 비율), 기울기(라디안, z축), 기울기(x축)]
const ROCKS={
 rock_09:{size:[.08,.034,.14],seed:91,lumps:[[0,.42,0,.5,.55,.5,.15,0]]},
 boulder_01:{size:[1.28,1.0,1.83],seed:17,lumps:[[0,.45,0,.5,.55,.5,.18,-.08]]},
 rock_face_01:{size:[4.96,3.56,3.82],seed:53,cliff:true,lumps:[[-.18,.36,0,.34,.4,.46,.12,0],[.2,.42,.04,.3,.46,.42,-.18,.06],[-.02,.72,-.04,.28,.27,.36,.28,0]]},
 rock_face_02:{size:[2.72,2.47,2.12],seed:67,cliff:true,lumps:[[-.12,.4,0,.38,.42,.48,.1,0],[.18,.6,.02,.3,.38,.4,-.25,.05]]},
 // 정상부 큰 바위: 넓은 밑 덩어리 위에 기운 덩어리 둘(돌기둥처럼 반듯하게 서지 않게, 위는 둥글게).
 mountainside:{size:[10.2,10.5,5.24],seed:79,cliff:true,lumps:[[0,.26,0,.5,.34,.5,.05,0],[-.1,.58,.02,.42,.3,.46,.35,.05],[.16,.78,-.02,.34,.24,.42,-.45,0]]},
};
// 둥근 암괴 하나: 중심·반지름(m)·회전, 바닥 자름 높이(floor, 그 아래 정점은 평평하게 모은다).
export function rockLump({center,radius,rotation=new THREE.Euler(),seed=1,floor=-Infinity}){
 const r=rng(seed),g=mergeVertices(new THREE.IcosahedronGeometry(1,1).deleteAttribute('uv').deleteAttribute('normal')),p=g.attributes.position;
 // 큰 굴곡 셋(방향·위상 무작위): 덩어리가 공처럼 매끈하지 않고 혹이 진 암괴가 된다.
 const waves=[0,1,2].map(()=>({d:new THREE.Vector3(r()-.5,r()-.5,r()-.5).normalize(),f:1.6+r()*1.4,ph:r()*6.283,a:.07+r()*.05}));
 const v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);let k=1;for(const w of waves)k+=w.a*Math.sin(v.dot(w.d)*w.f*3.1416+w.ph);
  // 윗면은 조금 눌러 둥근 지붕(공보다 넓고 낮게), 아랫면은 넓게(땅에 앉은 모양).
  v.set(v.x*k,v.y*k*(v.y>0?.92:1.1),v.z*k).multiply(radius).applyEuler(rotation).add(center);
  v.y=Math.max(v.y,floor+i*1e-5);p.setXYZ(i,v.x,v.y,v.z);
 }
 g.computeVertexNormals();return g;
}
export function rockGeometry(id){
 const spec=ROCKS[id];if(!spec)return null;
 const [sx,sy,sz]=spec.size,r=rng(spec.seed),parts=[];
 spec.lumps.forEach(([cx,cy,cz,rx,ry,rz,tz,tx],i)=>parts.push(rockLump({center:new THREE.Vector3(cx*sx,cy*sy,cz*sz),radius:new THREE.Vector3(rx*sx,ry*sy,rz*sz),
  rotation:new THREE.Euler(tx,r()*.6-.3,tz),seed:spec.seed*11+i,floor:-sy*.06})));
 const g=parts.length>1?mergeGeometries(parts):parts[0];if(parts.length>1)parts.forEach(h=>h.dispose());
 g.computeBoundingBox();g.computeBoundingSphere();
 g.name=`toon-rock-${id}`;g.userData.shared=true;g.userData.toonNature=true;g.userData.cliff=!!spec.cliff;
 return g;
}

// ── 재질 ──
const NATURE_VERTEX_COMMON=`
attribute float toonSway;
uniform float foliageTime;uniform float toonWaveStrength;uniform vec2 toonWindDir;
vec3 tnAnchor(){
 vec3 a=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
 #ifdef USE_INSTANCING
 a+=mat3(modelMatrix)*instanceMatrix[3].xyz;
 #endif
 return a;
}
float tnHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
`;
// 인스턴스 색(실사 단풍색 forestTint)은 버리고, 나무마다 명도·색조만 조금 다르게 한다(낮 맑은 연두가 기준).
const NATURE_COLOR_VERTEX=`
#if defined(USE_COLOR)||defined(USE_INSTANCING_COLOR)
vColor=vec3(1.);
#endif
#ifdef USE_COLOR
vColor*=color.rgb;
#endif
#if defined(USE_COLOR)||defined(USE_INSTANCING_COLOR)
{vec2 a=tnAnchor().xz;float h=tnHash(a),g=tnHash(a+17.3);vColor*=mix(vec3(.88,.93,.84),vec3(1.08,1.06,.96),h)*mix(vec3(1.06,1.02,.9),vec3(.94,1.,1.06),g);}
#endif`;
const NATURE_SWAY=`
{
 // 수관 전체가 한 몸으로 기울었다 돌아오고(돌풍), 잎 덩어리는 조금 빠르게 떤다. 밑동(toonSway=0)은 고정.
 vec3 a=tnAnchor();
 // 개체 변이: 가지·수관(흔들림이 있는 부분)만 옆으로 0.82~1.18배, 위로 0.9~1.1배(밑동은 그대로 접지).
 {float h1=tnHash(a.xz+3.7),h2=tnHash(a.xz+9.1),k=smoothstep(0.,.03,toonSway);transformed.xz*=mix(1.,.82+.36*h1,k);transformed.y*=mix(1.,.9+.2*h2,k);}
 float gust=sin(foliageTime*1.25+a.x*.071+a.z*.053)*.65+sin(foliageTime*2.07+a.z*.113+a.x*.031)*.35;
 float flutter=sin(foliageTime*4.1+dot(position,vec3(1.7,2.3,1.9)));
 transformed.xz+=toonWindDir*(gust*.75+.3)*toonSway*toonWaveStrength+vec2(-toonWindDir.y,toonWindDir.x)*flutter*toonSway*.14;
 transformed.y-=abs(gust)*toonSway*.08;
}`;
// 해를 마주 본 역광에서 수관 가장자리를 금빛으로 밝힌다(기준값 §2-5, 약 0.3). 해를 등지면 0.
const NATURE_RIM=`
#if NUM_DIR_LIGHTS > 0
{
 vec3 tnL=directionalLights[0].direction,tnV=normalize(vViewPosition);
 float tnBack=pow(clamp(dot(-tnV,tnL),0.,1.),2.);
 float tnEdge=pow(1.-clamp(dot(normal,tnV),0.,1.),2.5);
 reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.3,1.12,.55)*directionalLights[0].color*tnBack*tnEdge*RIM;
}
#endif`;

export function createToonNature({gradientMap,uniforms}){
 const N=TOON.nature,palette={
  leaf:linear(N.leaf),leafShade:linear(N.leafShade),trunk:linear(N.trunk),
  pine:linear(N.pine),pineShade:linear(N.pineShade),pineTrunk:linear(N.pineTrunk),
  sapling:linear(N.sapling),saplingShade:linear(N.saplingShade),bush:linear(N.bush),bushShade:linear(N.bushShade),
  grassBase:linear(N.grassBase),grassTip:linear(N.grassTip),
 };
 const status={parts:0,triangles:{},grassSwaps:0,shrubSwaps:0,rocks:0};
 const bind=shader=>{shader.uniforms.foliageTime=foliageUniforms.foliageTime;shader.uniforms.toonWaveStrength=uniforms.toonWaveStrength;shader.uniforms.toonWindDir=uniforms.toonWindDir;};

 // 나무·덤불 공용(정점색 = 재질색). 그림자는 받기만 한다.
 const foliage=new THREE.MeshToonMaterial({name:'toon-nature-foliage',gradientMap,vertexColors:true});
 foliage.onBeforeCompile=shader=>{
  bind(shader);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+NATURE_VERTEX_COMMON)
   .replace('#include <color_vertex>',NATURE_COLOR_VERTEX).replace('#include <begin_vertex>','#include <begin_vertex>\n'+NATURE_SWAY);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+NATURE_RIM.replace('RIM',N.rim.toFixed(3)));
 };
 foliage.customProgramCacheKey=()=> 'toon-nature-foliage-v1';
 foliage.userData.shared=true;foliage.userData.toonNature='foliage';

 // 풀 다발: 꽃(toonFlower)은 다발마다 일부만 핀다. 잎은 바람 물결 띠가 지나갈 때 밝아진다.
 const makeGrass=(field=false)=>{
 const grass=new THREE.MeshToonMaterial({name:field?'toon-nature-grass-field':'toon-nature-grass',gradientMap,vertexColors:true,side:THREE.DoubleSide});
 const fieldUniforms={tgFieldRadius:{value:30}};if(field)grass.userData.fieldUniforms=fieldUniforms;
 grass.onBeforeCompile=shader=>{
  bind(shader);if(field)Object.assign(shader.uniforms,fieldUniforms);
  Object.assign(shader.uniforms,{tgFlowerA:{value:linear(N.flowerA)},tgFlowerB:{value:linear(N.flowerB)},tgBand:{value:linear(N.grassBand)}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+NATURE_VERTEX_COMMON+'attribute float toonFlower;uniform vec3 tgFlowerA,tgFlowerB;uniform float tgFieldRadius;varying float vTgBand;varying float vTgTip;')
   .replace('#include <color_vertex>',NATURE_COLOR_VERTEX+`
    {
     vec3 a=tnAnchor();float h=tnHash(a.xz*1.37+3.1);
     // 짙은 다발 얼룩(그늘색 쪽)과 꽃 색(노랑·흰).
     float clump=sin(a.x*.21+sin(a.z*.17)*1.3)*sin(a.z*.19-a.x*.07);
     // 짙은 다발은 덩어리째(약 8~15m 얼룩) 모인다. 그늘색 #53794a 쪽.
     vColor*=mix(1.,${N.clumpDark.toFixed(3)},clamp(step(.8,h)*.5+smoothstep(.15,.55,clump),0.,1.))*(1.-toonFlower);
     vColor+=toonFlower*mix(tgFlowerA,tgFlowerB,step(.5,fract(h*7.3)));
    }`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    ${field?`{
     // 카메라 둘레 풀밭의 바깥 테두리: 다발을 줄여 사라지게 한다(경계선이 보이지 않게).
     float fd=distance(tnAnchor().xz,cameraPosition.xz);transformed*=1.-smoothstep(tgFieldRadius*.6,tgFieldRadius*.97,fd);
    }`:''}
    ${NATURE_SWAY}
    {
     // 꽃은 다발의 일부에만 핀다(나머지는 꽃 정점을 밑동으로 접는다).
     vec3 a=tnAnchor();
     if(toonFlower>.5&&tnHash(a.xz*2.11+.7)>${N.flowerShare.toFixed(3)})transformed=vec3(0.,-.05,0.);
     // 바람 물결 띠: 바람 방향으로 흐르는 넓은 밝은 띠(색만 바뀌고 형태는 그대로).
     float along=dot(a.xz,toonWindDir);
     vTgBand=smoothstep(.55,.95,sin(along*.09-foliageTime*1.6)*.5+.5+sin(along*.023+a.x*.011-foliageTime*.7)*.25)*(1.-toonFlower);
     vTgTip=clamp(position.y/.45,0.,1.);
    }`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 tgBand;uniform float toonWaveStrength;varying float vTgBand;varying float vTgTip;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    diffuseColor.rgb=mix(diffuseColor.rgb,tgBand*mix(.8,1.,vTgTip),vTgBand*${N.bandAmount.toFixed(3)}*toonWaveStrength*vTgTip);`)
   // 양면 풀잎의 뒷면도 위를 향한 법선으로 칠한다(뒷면이 아래를 향해 짙게 뜨면 풀밭이 얼룩진다).
   .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal=normalize(vNormal);')
   .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+NATURE_RIM.replace('RIM',(N.rim*.6).toFixed(3)))
   // 외곽선 제외 표시(알파 .5).
   .replace('#include <opaque_fragment>','#include <opaque_fragment>\n gl_FragColor.a=min(gl_FragColor.a,.5);');
 };
 grass.customProgramCacheKey=()=>`toon-nature-grass-v1${field?'-field':''}`;
 grass.userData.shared=true;grass.userData.toonNature='grass';
 return grass;
 };
 const grass=makeGrass(),grassField=makeGrass(true);

 // 바위: 큰 명암 얼룩(바위 면적 10~20%), 윗면 이끼·풀(윗면의 30~60%), 절벽형은 가로 층.
 const rockMaterial=cliff=>{
  const m=new THREE.MeshToonMaterial({name:cliff?'toon-nature-cliff':'toon-nature-rock',gradientMap,color:linear(N.rock)});
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{trMoss:{value:linear(N.moss)},trMossDark:{value:linear(N.mossDark)},trDark:{value:linear(N.rockDark)}});
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTrWorld;varying vec3 vTrNormal;varying vec3 vTrLocal;')
    .replace('#include <project_vertex>',`#include <project_vertex>
     {
      vec4 w=vec4(transformed,1.);vec3 nn=objectNormal;
      #ifdef USE_INSTANCING
      w=instanceMatrix*w;nn=mat3(instanceMatrix)*nn;
      #endif
      vTrWorld=(modelMatrix*w).xyz;vTrNormal=normalize(mat3(modelMatrix)*nn);vTrLocal=transformed;
     }`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>\n reflectedLight.indirectDiffuse*=vec3(${N.rockShadeTint.join(',')});\n${rockShadeGLSL('trRockMask',N.rockShadeDirect.toFixed(3))}`)
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     trcBaseN=normal;normal=normalize(mix(normal,(viewMatrix*vec4(trBumpN,0.)).xyz,trRockMask));`)
    .replace('#include <common>',`#include <common>
    uniform vec3 trMoss,trMossDark,trDark;varying vec3 vTrWorld;varying vec3 vTrNormal;varying vec3 vTrLocal;
    vec3 trBumpN=vec3(0.,1.,0.);float trRockMask=1.;${ROCK_BASE_DECL}
    ${ROCK_CELL_GLSL}
    float trHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
    float trNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
     return mix(mix(mix(trHash(i),trHash(i+vec3(1,0,0)),f.x),mix(trHash(i+vec3(0,1,0)),trHash(i+vec3(1,1,0)),f.x),f.y),
                mix(mix(trHash(i+vec3(0,0,1)),trHash(i+vec3(1,0,1)),f.x),mix(trHash(i+vec3(0,1,1)),trHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
     {
      vec3 wp=vTrWorld,wn=normalize(vTrNormal);if(!gl_FrontFacing)wn=-wn;float up=wn.y,dist=length(vViewPosition);
      // 큰 명암 얼룩: 두 톤으로 끊는다(잔무늬 없음).
      float blot=trNoise(wp*.32)*.7+trNoise(wp*.9)*.3;
      diffuseColor.rgb*=mix(1.04,${N.rockBlot.toFixed(3)},smoothstep(.56,.6,blot));
      // 둥근 암괴 굴곡(그늘 면은 조명 단계) + 덩어리 사이 갈라짐. 절벽은 세로로 긴 셀(세로 갈라짐).
      float crack=0.;
      trBumpN=trcBump(wp,wn,${cliff?'vec3(2.4,3.6,2.4)':'vec3(1.6,1.3,1.6)'},${cliff?'1.':'.7'},trcPixel(wp,wn),crack);
      diffuseColor.rgb=mix(diffuseColor.rgb,trDark,crack*${cliff?'.16':'.3'});// 절벽 면은 셀이 커서 갈라짐이 육각 그물로 읽힌다 → 더 옅게
      ${cliff?`
      // 가로 층: 단 높이 약 2.6m마다 옅은 띠(세로 갈라짐이 주, 가로 층은 보조).
      float layer=fract(wp.y/2.6+trNoise(wp*.15)*.35);
      diffuseColor.rgb=mix(diffuseColor.rgb,trDark,smoothstep(.86,.9,layer)*.25*(1.-smoothstep(.6,.8,up)));`:''}
      // 윗면 이끼·풀: 위를 향한 면(굴곡 법선 기준)일수록, 덩어리째 덮는다(얇은 테가 아니라 큰 이끼 덩어리).
      float mossN=trNoise(wp*.35+7.)*.65+trNoise(wp*1.1)*.35;
      float moss=smoothstep(.5,.53,trBumpN.y*.9+(mossN-.5)*.7-${N.mossLevel.toFixed(3)}+.5);
      diffuseColor.rgb=mix(diffuseColor.rgb,mix(trMossDark,trMoss,smoothstep(.35,.65,mossN)),moss);
      trRockMask=1.-moss*.8;
     }`);
  };
  m.customProgramCacheKey=()=>`toon-nature-rock-v3-${cliff?'cliff':'rock'}`;
  m.userData.shared=true;m.userData.toonNature='rock';m.userData.toonRock=true;
  return m;
 };
 const rock={rock:rockMaterial(false),cliff:rockMaterial(true)};

 // 원래 파일명(id-lodN.glb) → 카툰 부품 [{geometry,material}]. 모르는 id면 null(원래 GLB를 쓴다).
 const cache=new Map();
 function natureParts(url){
  const m=/([a-z0-9_]+)-lod(\d)\.glb$/.exec(String(url));if(!m)return null;
  const [,id,lodText]=m,lod=Math.min(2,+lodText),key=`${id}:${lod}`;
  if(cache.has(key))return cache.get(key);
  let parts=null;
  if(ROCKS[id]){const g=rockGeometry(id);parts=[{geometry:g,material:g.userData.cliff?rock.cliff:rock.rock}];status.rocks++;}
  else if(SPECIES[id]){
   const spec=SPECIES[id],b=spec.kind==='broadleaf'?broadleaf(spec,lod,palette):pine(spec,lod,palette,{sapling:spec.kind==='sapling'});
   parts=[{geometry:b.geometry(`toon-${id}-lod${lod}`),material:foliage}];
  }
  if(parts){status.parts++;status.triangles[key]=parts.reduce((n,p)=>n+p.geometry.attributes.position.count/3,0);}
  cache.set(key,parts);return parts;
 }

 // 하층 식생 InstancedMesh(길가 풀·낙엽·관목, 숲 바닥 풀잎, 덤불층)를 카툰 풀 다발·덤불로 바꾼다. 바꿨으면 true.
 // 알아보는 법: 재질 customProgramCacheKey(roadside-*, forest-blades-*, shrub-layer-*) 또는 길가 낙엽(metricKind '하층 식생' + 바람 없음).
 const grassGeometries={
  grass:grassClump({blades:11,height:.44,spread:.22,flowers:2,seed:5},palette).geometry('toon-grass-clump',{extra:'toonFlower'}),
  short:grassClump({blades:9,height:.3,spread:.26,flowers:1,seed:9},palette).geometry('toon-grass-short',{extra:'toonFlower'}),
  tall:grassClump({blades:13,height:.62,spread:.3,flowers:2,seed:13},palette).geometry('toon-grass-tall',{extra:'toonFlower'}),
  forest:grassClump({blades:7,height:.38,spread:.18,flowers:1,seed:17},palette).geometry('toon-grass-forest',{extra:'toonFlower'}),
  // 카메라 둘레 풀밭(grass-field.js): 넓게 퍼진 큰 다발.
  field:grassClump({blades:18,height:.52,spread:.42,flowers:2,seed:21},palette).geometry('toon-grass-field',{extra:'toonFlower'}),
 };
 const shrubGeometry=shrub(palette).geometry('toon-shrub');
 // 계곡 물가 판돌(section-scenery.js slabGeometry: 모난 회갈색 판, 물가·물속): 둥근 회색 암괴로 바꾼다(참고 04_14·06_07).
 // 판돌은 상자 하나 = 연속 정점 36개(builder가 펼쳐 합침). 판마다 범위를 재서, 같은 자리에 판보다 조금 높고 둥근 덩어리를 놓는다.
 const SLAB_COLORS=new Set(['66655f','55544f']);
 function swapStreamSlab(mesh){
  if(!mesh?.isMesh||mesh.isInstancedMesh||mesh.userData.toonStreamSlab||!mesh.parent?.userData?.stream)return false;
  const m=mesh.material;if(!m?.isMeshStandardMaterial||!m.flatShading||!SLAB_COLORS.has(m.color.getHexString()))return false;
  const p=mesh.geometry.attributes.position;if(!p||p.count%36)return false;
  const lumps=[],box=new THREE.Box3(),v=new THREE.Vector3(),size=new THREE.Vector3();
  for(let s=0;s<p.count;s+=36){
   box.makeEmpty();for(let i=s;i<s+36;i++)box.expandByPoint(v.fromBufferAttribute(p,i));
   box.getSize(size);const seed=Math.floor(Math.abs(box.min.x*7.31+box.min.z*3.17)*100)%100000+1;
   // 회전된 판의 범위는 실제보다 넓으므로 가로는 줄이고, 높이는 판 두께보다 키워 둥근 등을 만든다.
   const rx=size.x*.4,rz=size.z*.4,ry=Math.max(size.y*.9,Math.min(rx,rz)*.42);
   lumps.push(rockLump({center:new THREE.Vector3((box.min.x+box.max.x)/2,box.min.y+ry*.5,(box.min.z+box.max.z)/2),radius:new THREE.Vector3(rx,ry,rz),
    rotation:new THREE.Euler(0,seed*.37,0),seed,floor:box.min.y}));
  }
  const g=mergeGeometries(lumps);lumps.forEach(l=>l.dispose());g.computeBoundingBox();g.computeBoundingSphere();g.name='toon-stream-rocks';
  mesh.geometry=g;mesh.material=rock.rock;mesh.castShadow=false;mesh.userData.toonStreamSlab=true;status.streamSlabs=(status.streamSlabs??0)+lumps.length;
  return true;
 }
 function swapGroundCover(mesh){
  if(swapStreamSlab(mesh))return true;
  if(!mesh?.isInstancedMesh||mesh.userData.toonGroundCover)return false;
  const src=Array.isArray(mesh.material)?null:mesh.material;if(!src)return false;
  const key=src.customProgramCacheKey?.()??'';
  let kind=null;
  if(/^roadside-grass/.test(key))kind='grass';
  else if(/^roadside-shrub/.test(key))kind='tall';
  else if(/^forest-blades/.test(key))kind='forest';
  else if(/^shrub-layer/.test(key))kind='shrub';
  else if(mesh.userData.metricKind==='하층 식생'&&src.isMeshStandardMaterial&&!src.map&&src.side===THREE.DoubleSide)kind='short';// 길가 낙엽
  if(!kind)return false;
  mesh.geometry=kind==='shrub'?shrubGeometry:grassGeometries[kind];
  mesh.material=kind==='shrub'?foliage:grass;
  mesh.userData.toonGroundCover=kind;
  // 경계 상자는 인스턴스 위치 기준으로 다시 잰다(다발이 원래 잎보다 조금 크다).
  if(mesh.boundingBox)mesh.boundingBox.expandByScalar(.3);if(mesh.boundingSphere)mesh.boundingSphere.radius+=.3;
  if(kind==='shrub')status.shrubSwaps++;else status.grassSwaps++;
  return true;
 }
 return {natureParts,swapGroundCover,materials:{foliage,grass,grassField,rock:rock.rock,cliff:rock.cliff},palette,status,geometries:{grass:grassGeometries,shrub:shrubGeometry}};
}
export const TOON_NATURE_IDS={species:Object.keys(SPECIES),rocks:Object.keys(ROCKS)};
