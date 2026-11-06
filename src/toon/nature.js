import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {foliageUniforms} from '../../assets/realistic/foliage-shader.js';
import {TOON,hexToRgb} from './palette.js';
import {ROCK_CELL_GLSL,ROCK_BASE_DECL,rockShadeGLSL} from './rock-shade.js';
import {BRUSH_GLSL} from './brush.js';
import {SEASON_GLSL,SEASON_GRASS,bindSeason,seasonLinear} from './season.js';
// 카툰 전용 자연물(카툰 2차 — 「야생의 숨결」 기준, 산풍경). 실사 GLB를 칠하지 않고 형태를 새로 만든다. 어떤 fetch도 하지 않는다.
// 관악산 실제 수종·암석은 따르지 않는다(등고선·코스·서울 위치만 실제). 참고: design/ref-cartoon/01~06.
//  - 활엽수: 둥근 잎 덩어리 여러 개가 겹친 둥근 수관(01_08·01_19·01_22) + 덩어리 표면의 잎 무늬(셰이더) + 윤곽을 깨는 잎 조각.
//  - 침엽수: 아래가 넓고 위로 좁아지는 층진 원뿔(02_02·02_10·02_13). 층 끝이 처지고 솔잎 끝이 톱니진다.
//  - 덤불·어린 나무: 둥근 잎 덩어리(각진 다각형 윤곽이 보이지 않게 세분 2단). 어린 나무 자리도 원뿔이 아닌 둥근 관목.
//  - 풀: 가늘고 길게 휘는 잎 여러 장이 촘촘한 다발(03_15·03_20) + 점꽃. 끝부분이 흔들리고 바람 물결 띠가 지나간다.
//  - 바위: 넓은 면이 둥글게 이어진 암괴(04_19·04_20) + 회색 바탕의 어두운 얼룩·이끼(셰이더 trcPaint).
// 원래 GLB와 같은 id·LOD 파일명으로 부르면(natureParts) 같은 자리에 같은 크기로 들어간다.

const linear=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
function rng(seed){let s=seed>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

// ── 메시 조립: position·normal·color·toonSway(바람 흔들림 폭, m) ──
// toonPart(계절 셰이더가 읽는 부위): 0 줄기·굵은 가지, 1 활엽수 잎, 2 겨울에만 보이는 잔가지, 3 솔잎, 4 덤불 잎, 6 먼 활엽수 수관(겨울엔 회갈색 잔가지 안개).
export const TOON_PART={trunk:0,leaf:1,twig:2,needle:3,bush:4,farCrown:6};
class Builder{
 constructor(){this.p=[];this.n=[];this.c=[];this.s=[];this.extra=[];this.parts=[];this.part=0;}
 vertex(p,n,c,sway=0,extra=0){this.p.push(p.x,p.y,p.z);this.n.push(n.x,n.y,n.z);this.c.push(c.r,c.g,c.b);this.s.push(sway);this.extra.push(extra);this.parts.push(this.part);}
 geometry(name,{extra=null}={}){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('toonSway',new THREE.Float32BufferAttribute(this.s,1));
  if(extra)g.setAttribute(extra,new THREE.Float32BufferAttribute(this.extra,1));
  g.setAttribute('toonPart',new THREE.Float32BufferAttribute(this.parts,1));
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
 // 잎 조각: 덩어리 표면에 비스듬히 꽂힌 마름모 잎(2삼각형, 바깥 면). 매끈한 덩어리 윤곽을 잎 무리처럼 잘게 깬다(가시처럼 길지 않게).
 const t1=new THREE.Vector3(),t2=new THREE.Vector3(),q=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
 for(let i=0;i<tufts;i++){
  // 피보나치 구면 + 흔들림. 아래쪽(수관 밑면)은 덜 붙인다.
  const y=1-2*(i+.5)/tufts,rr=Math.sqrt(1-y*y),phi=i*2.39996+r()*.6;
  dir.set(Math.cos(phi)*rr,y,Math.sin(phi)*rr).normalize();if(dir.y<-.5&&r()<.75)continue;
  const bump=Math.sin(dir.dot(axes[0])*5.3+phase[0])*Math.sin(dir.dot(axes[1])*4.7+phase[1])*.5+Math.sin(dir.dot(axes[2])*8.1+phase[2])*.3+Math.sin(dir.dot(axes[3])*13.7+phase[3])*.2;
  const k=(1+jag*bump)*(.96+r()*.06),size=Math.min(radius.x,radius.y)*(.2+r()*.1);
  p.set(center.x+dir.x*radius.x*k,center.y+dir.y*radius.y*k,center.z+dir.z*radius.z*k);
  t1.set(-dir.z,0,dir.x);if(t1.lengthSq()<1e-4)t1.set(1,0,0);t1.normalize().applyAxisAngle(dir,r()*6.283);t2.crossVectors(dir,t1);
  // 잎 축: 접선(t2)에서 바깥(dir)으로 35~60° 들린다. 잎 가운데가 표면에 붙고 끝이 밖으로 나간다.
  const lift=.6+r()*.45,ax=t2.clone().multiplyScalar(Math.cos(lift)).addScaledVector(dir,Math.sin(lift));
  q[0].copy(p).addScaledVector(ax,-size*.35);q[2].copy(p).addScaledVector(ax,size*.95);
  q[1].copy(p).addScaledVector(ax,size*.25).addScaledVector(t1,size*.36);q[3].copy(p).addScaledVector(ax,size*.25).addScaledVector(t1,-size*.36);
  out.copy(q[2]).sub(crown).normalize();n.copy(dir).lerp(out,bend).normalize();
  const ao=(.78+.26*smooth(-.75,.85,out.y))*tone*(.96+r()*.12);
  col.copy(shade).lerp(leaf,smooth(-.55,.7,out.y)).multiplyScalar(ao);
  // 바깥(dir)을 향하는 면만 그린다(감기 순서: q0→q1→q2, q0→q2→q3를 dir 쪽에서 반시계).
  const face=new THREE.Vector3().subVectors(q[1],q[0]).cross(new THREE.Vector3().subVectors(q[2],q[0])).dot(dir)>0;
  const order=face?[0,1,2,0,2,3]:[0,2,1,0,3,2];
  for(const j of order)b.vertex(q[j],n,col,swayOf(q[j].y));
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

// ── 수종별 모양(높이·너비는 원래 GLB 카드 크기에 맞춘다. id는 원래 파일명 — 관악산 수종은 따르지 않는다) ──
const SPECIES={
 // 둥근 수관 활엽수: 높이 9.4~10.4m, 수관 너비 ≈ 0.9~1.0H, 줄기 노출 ≈ 0.35H(01_19·01_22).
 tree_small_02:{kind:'broadleaf',height:9.4,width:9.0,seed:11,lean:.15},
 island_tree_01:{kind:'broadleaf',height:10.4,width:10.4,seed:23,lean:.25},
 // 층진 원뿔 침엽수(02_02·02_10): 너비 ≈ 0.5H, 아래 0.15H만 줄기가 보인다.
 pine_tree_01:{kind:'pine',height:12.4,width:6.4,seed:31},
 pine_sapling_medium:{kind:'sapling',height:5.0,width:3.4,seed:47},
};
// LOD별 덩어리 수·세분. 잎 조각(tufts)은 덩어리마다.
// twigs·forks·twigSides: 겨울 잔가지(덩어리마다 잔가지 수·잔가지마다 갈래 수·단면 각 수).
// LOD는 나무 묶음(청크) 단위로 바뀌어 먼 단계(2) 나무도 카메라 가까이 올 수 있다. 그래서 먼 단계에도 잔가지를 두고,
// 겨울 수관(부위 6)은 실제로 먼 나무(약 100m~)에서만 회갈색 안개로 남긴다(셰이더).
const BROADLEAF_LOD=[
 {lumps:7,detail:2,trunkSides:9,branches:4,rings:4,tufts:40,twigs:5,forks:2,twigSides:4},
 {lumps:5,detail:1,trunkSides:6,branches:3,rings:3,tufts:10,twigs:3,forks:1,twigSides:3},
 {lumps:2,detail:1,trunkSides:4,branches:0,rings:1,tufts:0,twigs:3,forks:1,twigSides:3},
];
// 둥근 수관: 맨 위 덩어리 하나 + 둘레 덩어리(가운데 높이) + 아래 둘레 덩어리. 덩어리끼리 많이 겹쳐 하나의 둥근 수관으로 읽히고,
// 윤곽만 덩어리 수만큼 울퉁불퉁하다(01_08). 줄기는 0.3H에서 가지로 갈라져 수관 밑으로 들어간다.
function broadleaf(spec,lod,palette){
 const L=BROADLEAF_LOD[lod],b=new Builder(),r=rng(spec.seed),H=spec.height,W=spec.width;
 const swayOf=y=>.42*Math.pow(Math.max(0,y)/H,2);
 const forkY=H*.3,lean=new THREE.Vector3(spec.lean*W*.08,0,0),crownC=new THREE.Vector3(lean.x,H*.66,0);
 const fork=new THREE.Vector3(lean.x,forkY,0);
 // 줄기: 굵기 ÷ 수관 너비 ≈ 0.12, 밑동 1.6배, 살짝 굽음.
 addLimb(b,{a:new THREE.Vector3(0,0,0),b:fork.clone().add(new THREE.Vector3(0,H*.05,0)),ra:W*.06,rb:W*.045,sides:L.trunkSides,rings:L.rings,color:palette.trunk,swayOf,flare:1.6,bow:new THREE.Vector3(W*.025,0,W*.015)});
 const lumps=[{c:new THREE.Vector3(crownC.x+W*.02,H*.84,-W*.02),r:W*.25}];
 const ring1=Math.max(1,Math.ceil((L.lumps-1)*.6)),ring2=Math.max(0,L.lumps-1-ring1);
 for(let i=0;i<ring1;i++){
  const a=i/ring1*Math.PI*2+r()*.4+.3,d=W*(.24+r()*.04),y=H*(.7+r()*.05);
  lumps.push({c:new THREE.Vector3(crownC.x+Math.cos(a)*d,y,crownC.z+Math.sin(a)*d),r:W*(.22+r()*.03)});
 }
 for(let i=0;i<ring2;i++){
  const a=i/ring2*Math.PI*2+r()*.5+1.1,d=W*(.27+r()*.03),y=H*(.55+r()*.04);
  lumps.push({c:new THREE.Vector3(crownC.x+Math.cos(a)*d,y,crownC.z+Math.sin(a)*d),r:W*(.18+r()*.03)});
 }
 if(L.lumps===2){lumps.length=2;lumps[0].r=W*.36;lumps[0].c.set(crownC.x,H*.72,0);lumps[1].c.set(crownC.x+W*.15,H*.6,-W*.1);lumps[1].r=W*.3;}
 // 굵은 가지: 갈래점에서 둘레 덩어리 아래쪽으로 비스듬히. 덩어리보다 먼저 그려 틈 사이로 보인다.
 for(let i=0;i<L.branches&&i<lumps.length-1;i++){
  const t=lumps[i+1].c.clone();t.y-=lumps[i+1].r*.35;
  addLimb(b,{a:fork.clone(),b:t,ra:W*.032,rb:W*.016,sides:Math.max(4,L.trunkSides-3),rings:2,color:palette.trunk,swayOf,dark:.92,bow:new THREE.Vector3(0,H*.03,0)});
 }
 if(L.branches)addLimb(b,{a:fork.clone(),b:lumps[0].c.clone().add(new THREE.Vector3(0,-lumps[0].r*.5,0)),ra:W*.03,rb:W*.015,sides:Math.max(4,L.trunkSides-3),rings:1,color:palette.trunk,swayOf,dark:.92});
 // 겨울 잔가지(toonPart 2): 잎 덩어리 안에 숨어 있다가 겨울에 잎이 지면 보인다. 굵은 가지가 없는 덩어리에도 갈래점에서 가지를 낸다.
 if(L.twigs)addWinterTwigs(b,{lumps,fork,W,H,L,palette,swayOf,seed:spec.seed*31});
 b.part=lod===2?TOON_PART.farCrown:TOON_PART.leaf;
 lumps.forEach((l,i)=>addLump(b,{center:l.c,radius:new THREE.Vector3(l.r,l.r*.84,l.r),detail:L.detail,seed:spec.seed*7+i,crown:crownC,leaf:palette.leaf,shade:palette.leafShade,swayOf,jag:lod===2?.06:.09,bend:.6,variation:.06,tufts:L.tufts}));
 b.part=TOON_PART.trunk;
 return b;
}
// 겨울 가지(「앙상한 가지」): 덩어리마다 가운데 아래(굵은 가지 끝)에서 위·바깥으로 잔가지가 뻗고, 가까운 단계는 잔가지에서 다시 두 갈래.
// 가지 윗면에는 셰이더가 눈을 얹는다(옆을 향한 줄기에는 얹지 않는다).
function addWinterTwigs(b,{lumps,fork,W,H,L,palette,swayOf,seed}){
 const r=rng(seed),dir=new THREE.Vector3(),prev=b.part;b.part=TOON_PART.twig;
 const limb=(a,end,ra,rb,sides)=>addLimb(b,{a,b:end,ra,rb,sides,rings:1,color:palette.trunk,swayOf,dark:.95});
 lumps.forEach((l,i)=>{
  const base=l.c.clone();base.y-=l.r*(i===0?.5:.35);
  // 굵은 가지가 없는 덩어리(LOD 단계마다 가지 수가 다르다)는 갈래점에서 이어 준다.
  if(i>L.branches||!L.branches)limb(fork.clone(),base,W*.026,W*.013,4);
  for(let k=0;k<L.twigs;k++){
   const a=k/L.twigs*Math.PI*2+r()*.8,up=.35+r()*.55;
   dir.set(Math.cos(a)*(1-up*.6),up,Math.sin(a)*(1-up*.6)).normalize();
   const len=l.r*(.95+r()*.3),end=base.clone().addScaledVector(dir,len);
   limb(base,end,W*.012,W*.004,L.twigSides);
   for(let j=0;j<L.forks;j++){
    const from=base.clone().addScaledVector(dir,len*(.45+j*.2)),side=new THREE.Vector3(-dir.z,0,dir.x).normalize().multiplyScalar(j%2?-1:1);
    const d2=dir.clone().multiplyScalar(.7).addScaledVector(side,.6+r()*.3);d2.y+=.25;d2.normalize();
    limb(from,from.clone().addScaledVector(d2,len*(.38+r()*.15)),W*.006,W*.0025,3);
   }
  }
 });
 b.part=prev;
}
const PINE_LOD=[{tiers:8,segments:14,trunkSides:7,rings:3,tufts:3},{tiers:6,segments:9,trunkSides:5,rings:2,tufts:2},{tiers:4,segments:7,trunkSides:3,rings:1,tufts:1}];
// 층진 원뿔 침엽수(「야생의 숨결」 전나무형): 아래 0.15H만 줄기가 보이고, 그 위는 처진 층을 겹겹이 쌓아 꼭대기로 좁아진다.
function pine(spec,lod,palette,{sapling=false}={}){
 const L=PINE_LOD[lod],b=new Builder(),r=rng(spec.seed),H=spec.height,W=spec.width;
 const swayOf=y=>(sapling?.12:.3)*Math.pow(Math.max(0,y)/H,2);
 const top=new THREE.Vector3(0,H*.97,0);
 addLimb(b,{a:new THREE.Vector3(0,0,0),b:top,ra:W*.06,rb:W*.015,sides:L.trunkSides,rings:L.rings,color:palette.pineTrunk,swayOf,flare:1.35});
 const tiers=Math.max(3,L.tiers-(sapling?2:0)),bottom=H*(sapling?.2:.16);
 for(let i=0;i<tiers;i++){
  const t=i/(tiers-1);
  const y=THREE.MathUtils.lerp(bottom,H*.86,Math.pow(t,.9));
  // 원뿔: 아래층 반지름 0.5W → 꼭대기 0.1W. 층마다 ±8%.
  const radius=W*THREE.MathUtils.lerp(.5,.1,t)*(.92+r()*.16);
  const off=new THREE.Vector3((r()-.5)*W*.04,0,(r()-.5)*W*.04);
  b.part=TOON_PART.needle;addTier(b,{y,height:H*THREE.MathUtils.lerp(sapling?.22:.15,sapling?.16:.12,t),radius,segments:L.segments,seed:spec.seed*13+i,needle:palette.pine,shade:palette.pineShade,swayOf,offset:off,droop:.5,tufts:L.tufts});b.part=TOON_PART.trunk;
 }
 return b;
}

// 어린 나무(pine_sapling 자리, 재판정): 층진 원뿔 대신 둥근 잎 덩어리를 쌓은 관목. 가까이서 짙은 초록 피라미드로 읽혔다
// (계곡 장면, 참고 02_02·01_22 물가 덤불은 둥글다). 아래 둘레 덩어리 셋 + 가운데 위 덩어리 둘, 줄기는 밑동만 살짝.
// 겨울에는 어린 나무도 잎이 지고 잔가지만 남는다(눈 덮인 5m 둥근 덩어리로 남으면 큰 풍선처럼 보였다).
const SAPLING_LOD=[{detail:2,tufts:10,trunkSides:5,branches:0,twigs:4,forks:1,twigSides:3},{detail:1,tufts:3,trunkSides:4,branches:0,twigs:3,forks:0,twigSides:3},{detail:1,tufts:0,trunkSides:3,branches:0,twigs:3,forks:1,twigSides:3}];
function saplingBush(spec,lod,palette){
 const L=SAPLING_LOD[lod],b=new Builder(),r=rng(spec.seed),H=spec.height,W=spec.width;
 const swayOf=y=>.14*Math.pow(Math.max(0,y)/H,2),crown=new THREE.Vector3(0,H*.42,0);
 addLimb(b,{a:new THREE.Vector3(0,0,0),b:new THREE.Vector3(0,H*.3,0),ra:W*.05,rb:W*.035,sides:L.trunkSides,rings:1,color:palette.trunk,swayOf,flare:1.4});
 const lumps=[];
 for(let i=0;i<3;i++){const a=i/3*Math.PI*2+r()*.5;lumps.push([Math.cos(a)*W*.2,H*(.3+r()*.04),Math.sin(a)*W*.2,W*(.3+r()*.04)]);}
 lumps.push([W*.04,H*.52,-W*.03,W*.34],[-W*.05,H*.7,W*.02,W*.26]);
 // 먼 단계는 크게 겹친 덩어리 둘(삼각형 상한).
 if(lod===2)lumps.splice(0,lumps.length,[0,H*.36,0,W*.42],[W*.03,H*.66,-W*.02,W*.3]);
 addWinterTwigs(b,{lumps:lumps.map(([x,y,z,rr])=>({c:new THREE.Vector3(x,y,z),r:rr*.8})),fork:new THREE.Vector3(0,H*.28,0),W,H,L,palette,swayOf,seed:spec.seed*29});
 b.part=lod===2?TOON_PART.farCrown:TOON_PART.leaf;
 lumps.forEach(([x,y,z,rr],i)=>addLump(b,{center:new THREE.Vector3(x,y,z),radius:new THREE.Vector3(rr,rr*.9,rr),detail:L.detail,seed:spec.seed*5+i,crown,leaf:palette.bush,shade:palette.bushShade,swayOf,jag:.08,bend:.6,variation:.06,tufts:L.tufts}));
 b.part=TOON_PART.trunk;
 return b;
}

// 덤불(숲 덤불층 대체): 높이 약 1.1m의 둥근 잎 덩어리 셋. 세분 2단 + 작은 굴곡이라 가까이서도 각진 다각형 윤곽이 보이지 않는다.
function shrub(palette){
 const b=new Builder();b.part=TOON_PART.bush;const crown=new THREE.Vector3(0,.4,0),swayOf=y=>.06*Math.pow(Math.max(0,y)/1.1,2);
 [[0,.6,0,.4],[.36,.42,.14,.32],[-.3,.4,-.22,.33]].forEach(([x,y,z,rr],i)=>addLump(b,{center:new THREE.Vector3(x,y,z),radius:new THREE.Vector3(rr*1.12,rr*.86,rr*1.12),detail:2,seed:500+i,crown,leaf:palette.bush,shade:palette.bushShade,swayOf,jag:.08,bend:.6,variation:.06,tufts:8}));
 return b;
}

// 풀 다발: 가늘고 긴 잎(밑동 → 가운데 → 끝 3마디, 5삼각형)이 바깥으로 휘며 촘촘하다(03_15·03_20) + 점꽃(작은 별 2장, toonFlower=1).
// 잎 밑동은 그늘색, 끝으로 갈수록 밝은 노란 연두. 꽃은 노랑·흰색 둘 중 하나를 셰이더가 고른다.
function grassClump({blades=9,height=.42,spread=.2,flowers=1,seed=3}={},palette){
 const b=new Builder(),r=rng(seed),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
 for(let i=0;i<blades;i++){
  const a=i*2.399+r()*.4,d=spread*(.15+r()*.85),bx=Math.cos(a)*d,bz=Math.sin(a)*d,h=height*(.6+r()*.55),w=.016+r()*.012;
  // 휨: 바깥으로 기울고(lean) 끝이 더 꺾인다(bend). 잎 면은 휘는 방향에 수직.
  const lean=.12+r()*.18,bend=.25+r()*.3,face=a+Math.PI/2+(r()-.5)*.6,fx=Math.cos(face),fz=Math.sin(face),dx=Math.cos(a),dz=Math.sin(a);
  const at=(t)=>{const off=h*(lean*t+bend*t*t*t);return new THREE.Vector3(bx+dx*off,h*t*(1-bend*.35*t*t),bz+dz*off);};
  const p1=at(.4),p2=at(.75),tip=at(1);
  const side=(p,k)=>[p.clone().add(new THREE.Vector3(-fx*w*k,0,-fz*w*k)),p.clone().add(new THREE.Vector3(fx*w*k,0,fz*w*k))];
  const [l0,r0]=side(new THREE.Vector3(bx,0,bz),1),[l1,r1]=side(p1,1.05),[l2,r2]=side(p2,.75);
  // 위로 향한 부드러운 법선(가는 잎 면마다 흰 줄이 생기지 않게).
  const n=new THREE.Vector3(dx*.3,1,dz*.3).normalize();
  const c=t=>col.copy(palette.grassBase).lerp(palette.grassTip,t).clone();
  const sw=y=>.16*Math.pow(Math.max(0,y)/height,2);
  for(const [p,t] of [[l0,0],[r0,0],[r1,.4],[l0,0],[r1,.4],[l1,.4],[l1,.4],[r1,.4],[r2,.75],[l1,.4],[r2,.75],[l2,.75],[l2,.75],[r2,.75],[tip,1]])b.vertex(p,n,c(t),sw(p.y),0);
 }
 for(let f=0;f<flowers;f++){
  const a=r()*6.283,d=spread*.5*r(),cx=Math.cos(a)*d,cz=Math.sin(a)*d,h=height*(.62+r()*.25),s=.05;
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

// ── 바위: 원래 GLB 범위(가로·높이·깊이, m)에 맞춘 둥근 암괴 덩어리(카툰 2차 재판정, 참고 04_19·04_20·04_07) ──
// 「야생의 숨결」 바위는 넓은 면이 둥글게 이어진 덩어리다. 덩어리마다 정이십면체(1단 분할)를 무작위 평면 4~6장으로 눌러
// 넓은 면을 만들되 모서리는 둥글리고, 이웃 면과 법선을 나눈 둥근 명암을 준다. 바닥은 지면 아래로 조금 묻는다.
// lumps: [중심 x,y,z, 반지름 x,y,z(크기 비율), 기울기(라디안, z축), 기울기(x축)]
const ROCKS={
 rock_09:{size:[.08,.034,.14],seed:91,lumps:[[0,.42,0,.5,.55,.5,.15,0]]},
 boulder_01:{size:[1.28,1.0,1.83],seed:17,lumps:[[0,.45,0,.5,.55,.5,.18,-.08]]},
 rock_face_01:{size:[4.96,3.56,3.82],seed:53,cliff:true,lumps:[[-.18,.36,0,.34,.4,.46,.12,0],[.2,.42,.04,.3,.46,.42,-.18,.06],[-.02,.72,-.04,.28,.27,.36,.28,0]]},
 rock_face_02:{size:[2.72,2.47,2.12],seed:67,cliff:true,lumps:[[-.12,.4,0,.38,.42,.48,.1,0],[.18,.6,.02,.3,.38,.4,-.25,.05]]},
 // 큰 바위: 넓은 밑 덩어리 위에 기운 덩어리 둘.
 mountainside:{size:[10.2,10.5,5.24],seed:79,cliff:true,lumps:[[0,.26,0,.5,.34,.5,.05,0],[-.1,.58,.02,.42,.3,.46,.35,.05],[.16,.78,-.02,.34,.24,.42,-.45,0]]},
};
// 각진 암괴 하나: 중심·반지름(m)·회전, 바닥 자름 높이(floor, 그 아래 정점은 평평하게 모은다).
export function rockLump({center,radius,rotation=new THREE.Euler(),seed=1,floor=-Infinity,cuts=5,flatTop=true}){
 const r=rng(seed),g=mergeVertices(new THREE.IcosahedronGeometry(1,1).deleteAttribute('uv').deleteAttribute('normal')),p=g.attributes.position;
 // 큰 굴곡 둘(덩어리가 공 모양으로 대칭이지 않게) + 깎는 평면(바깥 법선 d, 중심에서 거리 at). 윗면 평면은 하나 꼭 둔다.
 const waves=[0,1].map(()=>({d:new THREE.Vector3(r()-.5,r()-.5,r()-.5).normalize(),f:1.2+r(),ph:r()*6.283,a:.06+r()*.04}));
 const top={d:new THREE.Vector3((r()-.5)*.5,1,(r()-.5)*.5).normalize(),at:.72+r()*.1},planes=flatTop?[top]:[];
 for(let i=1;i<cuts;i++){const a=i/(cuts-1)*Math.PI*2+r()*.9,y=(r()-.35)*.9;planes.push({d:new THREE.Vector3(Math.cos(a),y,Math.sin(a)).normalize(),at:.78+r()*.14});}
 const v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);let k=1;for(const w of waves)k+=w.a*Math.sin(v.dot(w.d)*w.f*3.1416+w.ph);v.multiplyScalar(k);
  // 깎는 면은 모서리를 둥글린다(넘친 만큼의 70%만 눌러 면 가장자리가 부드럽게 휜다, 참고 04_20 둥근 암괴).
  for(const pl of planes){const over=v.dot(pl.d)-pl.at;if(over>0)v.addScaledVector(pl.d,-over*.7);}
  v.set(v.x,v.y*(v.y>0?.95:1.1),v.z).multiply(radius).applyEuler(rotation).add(center);
  v.y=Math.max(v.y,floor+i*1e-5);p.setXYZ(i,v.x,v.y,v.z);
 }
 // 이웃 면과 법선을 나눠 둥근 명암(재판정: 참고 04_19·04_20의 바위는 넓은 면이 둥글게 이어진 덩어리).
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
// 계절(나무·덤불): 부위(toonPart)별로 여름 정점색을 계절 색으로 옮긴다. 밝은 면 위치 t는 여름 잎·그늘 명도 사이에서 잰다.
// 겨울에는 잎(1)을 접어 숨기고 잔가지(2)를 편다. 먼 수관(6)은 회갈색 잔가지 안개색. 가중치 0.5에서 바뀐다.
const seasonFoliageVertex=lum=>`
{
 vec3 a=tnAnchor();float th=tnHash(a.xz+41.7);int part=int(toonPart+.5);vec3 c=vColor;
 if(part==1||part==6){float t=clamp((tsLuma(c)-${lum.leafShade})/${lum.leafSpan},0.,1.3);c=tsLeafColor(c,t,th,a.y);
  if(part==6)c=mix(c,tsPair(t,TS_TWIG,TS_TWIG_SHADE)*.8,tsW.w);}
 else if(part==4){float t=clamp((tsLuma(c)-${lum.bushShade})/${lum.bushSpan},0.,1.3);c=tsBushColor(c,t,th);c=mix(c,tsPair(t,TS_TWIG*.85,TS_TWIG_SHADE*.75),tsW.w);}
 else if(part==3){float t=clamp((tsLuma(c)-${lum.pineShade})/${lum.pineSpan},0.,1.3);c=mix(c,tsPair(t,TS_PINE,TS_PINE_SHADE),tsW.z*.6+tsW.w);}
 else c=mix(c,TS_BARK*clamp(tsLuma(c)/${lum.trunk},.6,1.2),tsW.w*.85);
 vColor=c;vTsPart=float(part);
}`;
const SEASON_FOLIAGE_SHAPE=`
{
 int part=int(toonPart+.5);float winter=step(.5,tsW.w);
 // 먼 단계 수관(6)은 겨울에 가까우면 접고(잔가지만), 멀면(160~200m~) 조금 작은 회갈색 잔가지 안개로 남긴다.
 vec3 tsA=tnAnchor();float far=step(160.+40.*tnHash(tsA.xz+5.3),distance(cameraPosition.xz,tsA.xz));
 if(part==6&&winter>.5)transformed=mix(vec3(0.,transformed.y*.92,0.),transformed,.82);
 if((part==1||part==6&&far<.5)&&winter>.5||part==2&&winter<.5)transformed=vec3(0.,-60.,0.);
 vec3 tsN=objectNormal;
 #ifdef USE_INSTANCING
 tsN=mat3(instanceMatrix)*tsN;
 #endif
 vTsUp=normalize(mat3(modelMatrix)*tsN).y;
}`;
// 겨울 눈: 가지 윗면에 가는 흰 선, 솔잎 층 위에 소복이, 덤불은 위쪽이 눈 덮인 둔덕, 먼 수관은 위쪽에 점점이.
const SEASON_FOLIAGE_SNOW=`
if(tsW.w>.01){
 float p=vTsPart,snow=p<2.5?tsSnowCover(vTnLeaf*3.,vTsUp,.3,.55):p<3.5?tsSnowCover(vTnLeaf*1.7,vTsUp,.5,.78):p<4.5?tsSnowCover(vTnLeaf*1.3,vTsUp,-.45,.05):.3*tsSnowCover(vTnLeaf*.8,vTsUp,.45,.85);
 diffuseColor.rgb=mix(diffuseColor.rgb,TS_SNOW,snow);
}`;
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
// 잎 무늬 값(0~1): 세포 잡음(가까운 점까지 거리)을 잎 모양으로 눌러 쓴다. 값이 크면 잎 뭉치 한가운데, 작으면 잎 사이 틈.
const LEAF_GLSL=`
float tnH3(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float tnN3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(tnH3(i),tnH3(i+vec3(1,0,0)),f.x),mix(tnH3(i+vec3(0,1,0)),tnH3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(tnH3(i+vec3(0,0,1)),tnH3(i+vec3(1,0,1)),f.x),mix(tnH3(i+vec3(0,1,1)),tnH3(i+vec3(1,1,1)),f.x),f.y),f.z);}
// 잎 무늬 값(0~1): 큰 잎 뭉치 + 작은 잎 두 겹의 값 잡음. 크면 밝은 잎 뭉치, 작으면 잎 사이 짙은 틈.
float tnLeaf(vec3 p){return tnN3(p*vec3(1.,1.3,1.))*.6+tnN3(p*2.3+vec3(4.1,1.7,8.3))*.4;}`;
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
 // 계절 색 옮기기에 쓰는 여름 명도(선형): 잎·덤불·솔잎의 그늘 명도와 밝은 면까지의 폭, 줄기.
 const Y=c=>c.r*.2126+c.g*.7152+c.b*.0722,f4=v=>v.toFixed(4);
 const lum={leafShade:f4(Y(palette.leafShade)),leafSpan:f4(Y(palette.leaf)-Y(palette.leafShade)),bushShade:f4(Y(palette.bushShade)),bushSpan:f4(Y(palette.bush)-Y(palette.bushShade)),
  pineShade:f4(Y(palette.pineShade)),pineSpan:f4(Y(palette.pine)-Y(palette.pineShade)),trunk:f4(Y(palette.trunk))};
 const bind=shader=>{shader.uniforms.foliageTime=foliageUniforms.foliageTime;shader.uniforms.toonWaveStrength=uniforms.toonWaveStrength;shader.uniforms.toonWindDir=uniforms.toonWindDir;};

 // 나무·덤불 공용(정점색 = 재질색). 그림자는 받기만 한다.
 const foliage=new THREE.MeshToonMaterial({name:'toon-nature-foliage',gradientMap,vertexColors:true});
 foliage.onBeforeCompile=shader=>{
  bind(shader);bindSeason(shader);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+NATURE_VERTEX_COMMON+SEASON_GLSL+'attribute float toonPart;varying vec3 vTnLeaf;varying float vTsPart;varying float vTsUp;')
   .replace('#include <color_vertex>',NATURE_COLOR_VERTEX+seasonFoliageVertex(lum)).replace('#include <begin_vertex>','#include <begin_vertex>\nvTnLeaf=position+tnAnchor()*.37;\n'+NATURE_SWAY+SEASON_FOLIAGE_SHAPE);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTnLeaf;varying float vTsPart;varying float vTsUp;\n'+SEASON_GLSL+LEAF_GLSL)
   .replace('#include <color_fragment>',`#include <color_fragment>
    {
     // 잎 무늬(카툰 2차, 참고 01_08·01_19·01_22): 덩어리 표면에 밝은 잎 뭉치와 그 사이 짙은 틈. 한 덩어리가 단색 판으로 보이지 않게.
     // 잎 뭉치(${N.leafCell}m)가 픽셀보다 잘아지면 접는다.
     float px=length(vViewPosition)*.0014,fade=1.-smoothstep(.1,.4,px/${N.leafCell.toFixed(3)});
     // 잎 정점만(부위 1·3·4·6): 줄기·가지는 무늬 없이. 접힌 곳은 잡음을 계산하지 않는다(GPU 절약). 단풍색도 잎으로 본다.
     fade*=step(.5,abs(vTsPart-2.))*step(.5,vTsPart);
     if(fade>.01){float lf=tnLeaf(vTnLeaf/${N.leafCell.toFixed(3)});
     diffuseColor.rgb*=1.+fade*(${N.leafLight.toFixed(3)}*smoothstep(.58,.66,lf)-${N.leafGap.toFixed(3)}*(1.-smoothstep(.26,.34,lf)));}
    }
    ${SEASON_FOLIAGE_SNOW}`)
   .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+NATURE_RIM.replace('RIM',N.rim.toFixed(3)));
 };
 foliage.customProgramCacheKey=()=> 'toon-nature-foliage-v3-season';
 foliage.userData.shared=true;foliage.userData.toonNature='foliage';

 // 풀 다발: 꽃(toonFlower)은 다발마다 일부만 핀다. 잎은 바람 물결 띠가 지나갈 때 밝아진다.
 const v3=c=>`vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;
 const grassGlsl=Object.fromEntries(['spring','summer','autumn','winter'].map(k=>[k,SEASON_GRASS[k]?SEASON_GRASS[k].map(h=>v3(seasonLinear(h))):[v3(palette.grassBase),v3(palette.grassTip)]]));
 const makeGrass=(field=false)=>{
 const grass=new THREE.MeshToonMaterial({name:field?'toon-nature-grass-field':'toon-nature-grass',gradientMap,vertexColors:true,side:THREE.DoubleSide});
 const fieldUniforms={tgFieldRadius:{value:30}};if(field)grass.userData.fieldUniforms=fieldUniforms;
 grass.onBeforeCompile=shader=>{
  bind(shader);bindSeason(shader);if(field)Object.assign(shader.uniforms,fieldUniforms);
  Object.assign(shader.uniforms,{tgFlowerA:{value:linear(N.flowerA)},tgFlowerB:{value:linear(N.flowerB)},tgBand:{value:linear(N.grassBand)}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+NATURE_VERTEX_COMMON+SEASON_GLSL+'attribute float toonFlower;uniform vec3 tgFlowerA,tgFlowerB;uniform float tgFieldRadius;varying float vTgBand;varying float vTgTip;')
   .replace('#include <color_vertex>',NATURE_COLOR_VERTEX+`
    {
     vec3 a=tnAnchor();float h=tnHash(a.xz*1.37+3.1);
     // 짙은 다발 얼룩(그늘색 쪽)과 꽃 색(노랑·흰).
     float clump=sin(a.x*.21+sin(a.z*.17)*1.3)*sin(a.z*.19-a.x*.07);
     // 짙은 다발은 덩어리째(약 8~15m 얼룩) 모인다. 그늘색 #53794a 쪽.
     vColor*=mix(1.,${N.clumpDark.toFixed(3)},clamp(step(.8,h)*.5+smoothstep(.15,.55,clump),0.,1.))*(1.-toonFlower);
     vColor+=toonFlower*mix(tgFlowerA,tgFlowerB,step(.5,fract(h*7.3)));
    }
    {
     // 계절 풀색: 밑동→끝 색을 계절 짝으로 바꾸고, 짙은 다발 얼룩(여름 대비 명도 비)은 그대로 둔다. 봄 꽃은 분홍·흰색.
     float gt=clamp(position.y/.55,0.,1.);vec3 ref=mix(${grassGlsl.summer[0]},${grassGlsl.summer[1]},gt);
     float ratio=clamp(tsLuma(vColor)/max(tsLuma(ref),1e-3),.4,1.3);
     vec3 g=vColor*tsW.y+(mix(${grassGlsl.spring[0]},${grassGlsl.spring[1]},gt)*tsW.x+mix(${grassGlsl.autumn[0]},${grassGlsl.autumn[1]},gt)*tsW.z+mix(${grassGlsl.winter[0]},${grassGlsl.winter[1]},gt)*tsW.w)*ratio;
     float pink=step(.45,fract(tnHash(tnAnchor().xz*1.37+3.1)*5.1));
     vColor=mix(g,mix(vColor,mix(vec3(1.,.62,.78),vec3(1.,.93,.95),pink),tsW.x),toonFlower);
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
     // 봄에는 더 많이(30%), 가을·겨울에는 피지 않는다. 겨울 풀은 눈에 묻혀 키가 38%.
     if(toonFlower>.5&&tnHash(a.xz*2.11+.7)>${N.flowerShare.toFixed(3)}*tsW.y+.3*tsW.x)transformed=vec3(0.,-.05,0.);
     transformed.y*=1.-.62*tsW.w;
     // 바람 물결 띠: 바람 방향으로 흐르는 넓은 밝은 띠(색만 바뀌고 형태는 그대로).
     float along=dot(a.xz,toonWindDir);
     vTgBand=smoothstep(.55,.95,sin(along*.09-foliageTime*1.6)*.5+.5+sin(along*.023+a.x*.011-foliageTime*.7)*.25)*(1.-toonFlower);
     vTgTip=clamp(position.y/.55,0.,1.);
    }`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 tgBand;uniform float toonWaveStrength;uniform vec4 tsW;varying float vTgBand;varying float vTgTip;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    diffuseColor.rgb=mix(diffuseColor.rgb,tgBand*mix(.8,1.,vTgTip),vTgBand*${N.bandAmount.toFixed(3)}*toonWaveStrength*vTgTip*(1.-tsW.w-tsW.z*.6));`)
   // 양면 풀잎의 뒷면도 위를 향한 법선으로 칠한다(뒷면이 아래를 향해 짙게 뜨면 풀밭이 얼룩진다).
   .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal=normalize(vNormal);')
   .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+NATURE_RIM.replace('RIM',(N.rim*.6).toFixed(3)))
   // 외곽선 제외 표시(알파 .5).
   .replace('#include <opaque_fragment>','#include <opaque_fragment>\n gl_FragColor.a=min(gl_FragColor.a,.5);');
 };
 grass.customProgramCacheKey=()=>`toon-nature-grass-v3-season${field?'-field':''}`;
 grass.userData.shared=true;grass.userData.toonNature='grass';
 return grass;
 };
 const grass=makeGrass(),grassField=makeGrass(true);

 // 바위: 큰 명암 얼룩(바위 면적 10~20%), 윗면 이끼·풀(윗면의 30~60%), 절벽형은 가로 층.
 const rockMaterial=cliff=>{
  const m=new THREE.MeshToonMaterial({name:cliff?'toon-nature-cliff':'toon-nature-rock',gradientMap,color:linear(N.rock)});
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{trMoss:{value:linear(N.moss)},trMossDark:{value:linear(N.mossDark)},trDark:{value:linear(N.rockDark)}});bindSeason(shader);
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
     trcBaseN=normal;`)
    .replace('#include <common>',`#include <common>
    uniform vec3 trMoss,trMossDark,trDark;varying vec3 vTrWorld;varying vec3 vTrNormal;varying vec3 vTrLocal;
    float trRockMask=1.;${ROCK_BASE_DECL}${SEASON_GLSL}
    ${ROCK_CELL_GLSL}${BRUSH_GLSL}
    float trHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
    float trNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
     return mix(mix(mix(trHash(i),trHash(i+vec3(1,0,0)),f.x),mix(trHash(i+vec3(0,1,0)),trHash(i+vec3(1,1,0)),f.x),f.y),
                mix(mix(trHash(i+vec3(0,0,1)),trHash(i+vec3(1,0,1)),f.x),mix(trHash(i+vec3(0,1,1)),trHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
     {
      // 야숨 바위 칠(재판정, 참고 04_19·04_20·04_09): 회색 바탕 + 어두운 녹회 얼룩 + 이끼. 지형 암반과 같은 함수(trcPaint).
      vec3 wp=vTrWorld,wn=normalize(vTrNormal);if(!gl_FrontFacing)wn=-wn;float px=trcPixel(wp,wn),moss;
      diffuseColor.rgb=trcPaint(wp,wn,diffuseColor.rgb,trDark,tsMossTint(trMoss),tsMossTint(trMossDark),px,${(N.mossLevel-.84).toFixed(3)},moss);
      trRockMask=1.-moss*.8;
      // 겨울: 평평한 윗면·턱에만 눈. 가파른 면(약 45° 이상)은 맨 바위로 남긴다(회색 바위와 흰 눈의 줄무늬).
      float snow=tsSnowCover(wp,wn.y,.6,.82);diffuseColor.rgb=mix(diffuseColor.rgb,TS_SNOW,snow);trRockMask*=1.-snow;
     }`);
  };
  m.customProgramCacheKey=()=>`toon-nature-rock-v6-season-${cliff?'cliff':'rock'}`;
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
   const spec=SPECIES[id],b=spec.kind==='broadleaf'?broadleaf(spec,lod,palette):spec.kind==='sapling'?saplingBush(spec,lod,palette):pine(spec,lod,palette);
   parts=[{geometry:b.geometry(`toon-${id}-lod${lod}`),material:foliage}];
  }
  if(parts){status.parts++;status.triangles[key]=parts.reduce((n,p)=>n+p.geometry.attributes.position.count/3,0);}
  cache.set(key,parts);return parts;
 }

 // 하층 식생 InstancedMesh(길가 풀·낙엽·관목, 숲 바닥 풀잎, 덤불층)를 카툰 풀 다발·덤불로 바꾼다. 바꿨으면 true.
 // 알아보는 법: 재질 customProgramCacheKey(roadside-*, forest-blades-*, shrub-layer-*) 또는 길가 낙엽(metricKind '하층 식생' + 바람 없음).
 const grassGeometries={
  grass:grassClump({blades:12,height:.5,spread:.22,flowers:2,seed:5},palette).geometry('toon-grass-clump',{extra:'toonFlower'}),
  short:grassClump({blades:8,height:.34,spread:.26,flowers:1,seed:9},palette).geometry('toon-grass-short',{extra:'toonFlower'}),
  tall:grassClump({blades:14,height:.7,spread:.3,flowers:2,seed:13},palette).geometry('toon-grass-tall',{extra:'toonFlower'}),
  forest:grassClump({blades:7,height:.44,spread:.18,flowers:1,seed:17},palette).geometry('toon-grass-forest',{extra:'toonFlower'}),
  // 카메라 둘레 풀밭(grass-field.js): 넓게 퍼진 큰 다발.
  field:grassClump({blades:17,height:.58,spread:.42,flowers:2,seed:21},palette).geometry('toon-grass-field',{extra:'toonFlower'}),
  // 풀밭 먼 쪽(grass-field.js 거리 LOD): 잎 수만 절반. 같은 seed라 앞쪽 잎 8장 배치·키·퍼짐이 가까운 다발과 같다. 꽃은 그대로 2송이.
  fieldFar:grassClump({blades:8,height:.58,spread:.42,flowers:2,seed:21},palette).geometry('toon-grass-field-far',{extra:'toonFlower'}),
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
   // 윗면을 평평하게 깎지 않은 둥근 등(재판정: 얇고 평평한 윗면이 낮은 눈높이에서 베이지 판지로 읽혔다). 높이를 키우고 절반쯤 묻는다.
   const rx=size.x*.4,rz=size.z*.4,ry=Math.max(size.y*.9,Math.min(rx,rz)*.62);
   lumps.push(rockLump({center:new THREE.Vector3((box.min.x+box.max.x)/2,box.min.y+ry*.3,(box.min.z+box.max.z)/2),radius:new THREE.Vector3(rx,ry,rz),
    rotation:new THREE.Euler(0,seed*.37,0),seed,floor:box.min.y,flatTop:false}));
  }
  const g=mergeGeometries(lumps);lumps.forEach(l=>l.dispose());g.computeBoundingBox();g.computeBoundingSphere();g.name='toon-stream-rocks';
  mesh.geometry=g;mesh.material=rock.rock;mesh.castShadow=false;mesh.userData.toonStreamSlab=true;status.streamSlabs=(status.streamSlabs??0)+lumps.length;
  return true;
 }
 // 입구 생울타리(entrance-plaza.js hedge: 정이십면체 1단 덩어리를 면 법선으로 이어 붙인 'leaf'·'leafDark' 메시):
 // 면마다 꺾인 명암이라 가까이서 각진 다면체로 보인다. 카툰에서는 같은 자리 정점의 법선을 평균해 둥글게 칠하고,
 // 덤불과 같은 잎 무늬 재질(덤불색)로 바꾼다. 실사 쪽 기하·재질은 건드리지 않는다(복제해서 바꾼다).
 const HEDGE_COLORS=new Set(['4e6b3a','36502c']);let hedgeMaterial=null;
 function swapHedge(mesh){
  if(!mesh?.isMesh||mesh.isInstancedMesh||mesh.userData.toonHedge)return false;
  const m=mesh.material;if(!m?.isMeshStandardMaterial||!m.vertexColors||!HEDGE_COLORS.has(m.color.getHexString()))return false;
  const g=mesh.geometry.clone(),p=g.attributes.position,n=g.attributes.normal;if(!n)return false;
  const acc=new Map(),key=i=>`${Math.round(p.getX(i)*500)},${Math.round(p.getY(i)*500)},${Math.round(p.getZ(i)*500)}`;
  for(let i=0;i<p.count;i++){const k=key(i),a=acc.get(k)??[0,0,0];a[0]+=n.getX(i);a[1]+=n.getY(i);a[2]+=n.getZ(i);acc.set(k,a);}
  for(let i=0;i<p.count;i++){const a=acc.get(key(i)),l=Math.hypot(...a)||1;n.setXYZ(i,a[0]/l,a[1]/l,a[2]/l);}
  g.setAttribute('toonPart',new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(TOON_PART.bush),1));
  g.userData.shared=true;mesh.geometry=g;
  if(!hedgeMaterial){hedgeMaterial=foliage.clone();hedgeMaterial.onBeforeCompile=foliage.onBeforeCompile;hedgeMaterial.customProgramCacheKey=foliage.customProgramCacheKey;hedgeMaterial.color.copy(palette.bush).multiplyScalar(.95);hedgeMaterial.userData={...foliage.userData,shared:true};}
  mesh.material=hedgeMaterial;mesh.userData.toonHedge=true;status.hedges=(status.hedges??0)+1;
  return true;
 }
 function swapGroundCover(mesh){
  if(swapStreamSlab(mesh))return true;
  if(swapHedge(mesh))return true;
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
