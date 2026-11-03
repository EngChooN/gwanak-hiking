// 일주문 앞 광장 바닥·경계석·시설·가까운 나무. 산풍경 자체 제작(절차 텍스처·기하), 외부 사진·텍스처 없음.
// 근거: docs/입구광장-배치조사.md §3·§4·§5·§6·§10. 위치·치수는 모두 추정(현장 실측 전)이다.
// 좌표는 일주문 기준(gx 좌우: 광장에서 문을 볼 때 오른쪽 +, gz: 문에서 광장 쪽 +, m). entrance-scenery의 LOD 좌표계와 같다.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// ── 배치(추정) ───────────────────────────────────────────────────────────────
// 문 앞 아스팔트 길 폭 11m(조사 10~12m), 문 안쪽 길 폭 7m(추정), 길 양옆 블록 보도 2m, 20m부터 으뜸공원 블록 광장.
// 자유이동 다각형(src/plaza.js: 좌우 ±6m, 문에서 -0.5~38m)은 모두 포장 위에 있고 높은 경계석(±7.7m)은 그 밖에 있다.
export const PLAZA_LAYOUT=Object.freeze({
 road:{half:5.5,from:-1.5,to:20},           // 문 앞 아스팔트
 innerRoad:{half:3.5,from:-24,to:-1.5},     // 문 안쪽 아스팔트(코스 첫 노면 앞까지)
 sidewalk:{inner:5.6,outer:7.7,from:-1.5,to:20},
 plaza:{half:7.7,from:20,to:41},            // 으뜸공원 회색 블록
 pavilionPad:{x0:7.7,x1:11.8,z0:.6,z1:8.4},
 kerb:{inner:.06,outer:.14,width:.2},
 lift:.02,                                  // 바닥판은 지형보다 2cm 위(발 접지 오차 범위)
});
// 포장·시설이 차지하는 땅. 숲·풀은 margin만큼 더 비운다.
export function plazaFootprint(gx,gz,margin=0){
 const L=PLAZA_LAYOUT,ax=Math.abs(gx);
 if(gz>=L.road.from-margin&&gz<=L.plaza.to+.3+margin&&ax<=L.plaza.half+.3+margin)return true;
 if(gz>=L.innerRoad.from-margin&&gz<=L.road.from+margin&&ax<=L.innerRoad.half+.3+margin)return true;
 const p=L.pavilionPad;return gx>=p.x0-margin&&gx<=p.x1+margin&&gz>=p.z0-margin&&gz<=p.z1+margin;
}
// 화단(생울타리·석축) 자리: 숲을 비우는 범위에 더한다.
export const HEDGES=Object.freeze([
 {id:'왼쪽 석축+낮은 상록 생울타리',side:-1,x:-8.55,from:1.5,to:40.5,height:.85,depth:.95,wall:.45},
 {id:'오른쪽 높은 관목 울타리',side:1,x:8.6,from:9.2,to:40.5,height:2.1,depth:1.1,wall:0},
]);
// 실제로 확인된 시설만(조사 §5 "넣음"). 위치는 추정.
export const PLAZA_FACILITIES=Object.freeze([
 {id:'pavilion',name:'안내도 정자(기와지붕·붉은 기둥·안내판 3면)',x:9.75,z:4.5,yaw:.35,source:'로드뷰 2025-05 눈확인'},
 {id:'bench',name:'흰 철제 벤치',x:7.05,z:2.6,yaw:Math.PI/2,source:'로드뷰 2025-05'},
 {id:'bench',name:'흰 철제 벤치',x:7.05,z:6.4,yaw:Math.PI/2,source:'로드뷰 2025-05'},
 {id:'sign',name:'소형 안내판(검은 기둥)',x:6.55,z:-.9,yaw:-.5,source:'2020 사진'},
 {id:'bollard',name:'노랑·검정 차단봉',x:-5.6,z:19.6},{id:'bollard',name:'노랑·검정 차단봉',x:5.6,z:19.6},
 {id:'bollard',name:'노랑·검정 차단봉',x:-5.6,z:1.2},{id:'bollard',name:'노랑·검정 차단봉',x:5.6,z:9.4},
 {id:'lamp',name:'가로등(위치 임의)',x:-7.25,z:12},{id:'lamp',name:'가로등(위치 임의)',x:7.25,z:16},{id:'lamp',name:'가로등(위치 임의)',x:-7.25,z:33},{id:'lamp',name:'가로등(위치 임의)',x:7.25,z:37},
]);
// 가까운 나무(조사 §6): 오른쪽 으뜸공원 쪽 키 큰 소나무 3, 왼쪽 사면 둥근 소나무·활엽 교목·붉은 잎 활엽, 문 양옆 활엽.
// 수종명은 소나무만 단정한다. 크기는 기존 CC0 모델 배율.
export const SPECIMEN_TREES=Object.freeze([
 {id:'pine_tree_01',x:11.2,z:27,scale:1.15},{id:'pine_tree_01',x:12.6,z:33.5,scale:1.3},{id:'pine_tree_01',x:10.9,z:39.5,scale:1.05},
 {id:'pine_sapling_medium',x:-10.6,z:7.5,scale:1.35},
 {id:'island_tree_01',x:-11.3,z:16.5,scale:1},{id:'island_tree_01',x:-12.2,z:27.5,scale:1.1},
 {id:'tree_small_02',x:-10.8,z:36,scale:.95,tint:0xd9a08c},
 {id:'tree_small_02',x:9.3,z:-7.5,scale:1.05},{id:'tree_small_02',x:-8.4,z:-6.5,scale:.95},
]);

// ── 절차 텍스처 ──────────────────────────────────────────────────────────────
const hasCanvas=()=>typeof document!=='undefined';
function rng(seed){return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function valueNoise(seed){const r=rng(seed),g=new Float32Array(64*64).map(()=>r());return (x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,s=t=>t*t*(3-2*t),at=(i,j)=>g[((j&63)<<6)|(i&63)];const a=at(xi,yi),b=at(xi+1,yi),c=at(xi,yi+1),d=at(xi+1,yi+1);return a+(b-a)*s(fx)+(c-a)*s(fy)+(a-b-c+d)*s(fx)*s(fy);};}
// 높이 배열 → 접선 공간 노멀 맵(RGB).
function normalCanvas(height,size,strength){
 const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),img=ctx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const h=(i,j)=>height[((j+size)%size)*size+((i+size)%size)];
  const dx=(h(x+1,y)-h(x-1,y))*strength,dy=(h(x,y+1)-h(x,y-1))*strength,l=Math.hypot(dx,dy,1),o=(y*size+x)*4;
  img.data[o]=(-dx/l*.5+.5)*255;img.data[o+1]=(dy/l*.5+.5)*255;img.data[o+2]=(1/l*.5+.5)*255;img.data[o+3]=255;
 }
 ctx.putImageData(img,0,0);return c;
}
function texture(canvas,color=true){const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(color)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;}
// 으뜸공원형 정사각 콘크리트 블록: 한 변 25cm(조사 20~30cm), 16×16장 = 4m 반복. 회색 바탕에 흰색·진회색 블록 점무늬,
// 블록마다 색 차이, 모서리 깨짐, 줄눈의 흙·모래, 얼룩과 닳은 자국.
export const BLOCK_TILE_METRES=4;
export function blockPavingTextures(size=1024){
 if(!hasCanvas())return null;
 const n=16,cell=size/n,joint=Math.max(2,Math.round(cell*.034)),r=rng(20261103),noise=valueNoise(7),fine=valueNoise(11);
 const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');
 const img=ctx.createImageData(size,size),height=new Float32Array(size*size);
 const blocks=[];for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const roll=r(),kind=roll<.05?'white':roll<.11?'dark':'grey';
  const base=kind==='white'?[188,186,180]:kind==='dark'?[112,113,112]:[150,150,147];const v=(r()-.5)*10,warm=(r()-.5)*5;
  blocks.push({rgb:[base[0]+v+warm,base[1]+v,base[2]+v-warm],stain:r()<.22?{x:r(),y:r(),r:.25+r()*.5,a:.08+r()*.12}:null,chip:r()<.3?Math.floor(r()*4):-1,tilt:(r()-.5)*.6});
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=Math.floor(x/cell),j=Math.floor(y/cell),b=blocks[j*n+i],lx=x-i*cell,ly=y-j*cell;
  const edge=Math.min(lx,ly,cell-1-lx,cell-1-ly),o=(y*size+x)*4;
  let rgb,h;
  // 모서리 깨짐: 정해진 귀퉁이 근처를 줄눈처럼 낮춘다.
  const corner=b.chip>=0&&Math.hypot(lx-((b.chip&1)?cell:0),ly-((b.chip&2)?cell:0))<cell*.13*(.7+.6*fine(x*.3,y*.3));
  if(edge<joint||corner){const d=.5+.3*noise(x*.05,y*.05);rgb=[70*d+62,66*d+60,58*d+56];h=0;}
  else{
   const bevel=Math.min(1,(edge-joint)/(cell*.06)),grain=(fine(x*.9,y*.9)-.5)*12+(r()-.5)*9;
   const wear=(noise(x*.012+3,y*.012)-.5)*14;let shade=grain+wear+b.tilt*((lx/cell)-.5)*6;
   if(b.stain){const sx=(lx/cell-b.stain.x),sy=(ly/cell-b.stain.y),f=Math.max(0,1-Math.hypot(sx,sy)/b.stain.r);shade-=f*f*b.stain.a*255*.5;}
   const darkEdge=(1-bevel)*-7;
   rgb=b.rgb.map(v=>v+shade+darkEdge);h=.55+.45*bevel+(fine(x*.6,y*.6)-.5)*.08;
  }
  img.data[o]=Math.max(0,Math.min(255,rgb[0]));img.data[o+1]=Math.max(0,Math.min(255,rgb[1]));img.data[o+2]=Math.max(0,Math.min(255,rgb[2]));img.data[o+3]=255;height[y*size+x]=h;
 }
 ctx.putImageData(img,0,0);
 return {map:texture(c),normalMap:texture(normalCanvas(height,size,2.2),false),metres:BLOCK_TILE_METRES};
}
// 아스팔트: 어두운 회색 바탕에 밝은 골재 점, 땜질 자국과 바퀴 자국 얼룩. 2m 반복.
export const ASPHALT_TILE_METRES=2;
export function asphaltTextures(size=512){
 if(!hasCanvas())return null;
 const r=rng(4),noise=valueNoise(5),fine=valueNoise(9);
 const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),img=ctx.createImageData(size,size),height=new Float32Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const o=(y*size+x)*4,agg=r(),patch=(noise(x*.02,y*.02)-.5)*16,grain=(fine(x*.7,y*.7)-.5)*18;
  let v=84+patch+grain;if(agg>.93)v+=26+r()*30;else if(agg<.05)v-=18;
  img.data[o]=v+1;img.data[o+1]=v;img.data[o+2]=v-2;img.data[o+3]=255;height[y*size+x]=(agg>.93?.6:agg<.05?.1:.35)+grain*.004;
 }
 ctx.putImageData(img,0,0);
 return {map:texture(c),normalMap:texture(normalCanvas(height,size,1.4),false),metres:ASPHALT_TILE_METRES};
}
// 안내도 정자 가운데 판: 직접 그린 개략 안내도(실제 지도 복제 아님).
function guideMapCanvas(){
 const c=document.createElement('canvas');c.width=512;c.height=384;const x=c.getContext('2d');
 x.fillStyle='#e9ecdf';x.fillRect(0,0,512,384);x.fillStyle='#1f4d3a';x.fillRect(0,0,512,54);
 x.fillStyle='#fff';x.font='bold 30px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';x.textAlign='center';x.fillText('관악산 등산 안내도',256,38);
 const n=valueNoise(3);for(let k=0;k<9;k++){x.strokeStyle=`rgba(70,110,70,${.25+k*.05})`;x.lineWidth=2;x.beginPath();for(let a=0;a<=64;a++){const t=a/64*Math.PI*2,rad=150-k*15+n(Math.cos(t)*3+5,Math.sin(t)*3+5)*30;x.lineTo(270+Math.cos(t)*rad*1.25,215+Math.sin(t)*rad*.8);}x.closePath();x.fillStyle=`rgba(${120-k*8},${160-k*6},${110-k*8},.35)`;x.fill();x.stroke();}
 x.strokeStyle='#c23b2c';x.lineWidth=5;x.setLineDash([12,6]);x.beginPath();x.moveTo(90,350);x.bezierCurveTo(160,300,170,240,230,230);x.bezierCurveTo(300,215,300,160,285,140);x.stroke();x.setLineDash([]);
 x.fillStyle='#c23b2c';x.beginPath();x.arc(90,350,9,0,Math.PI*2);x.fill();x.fillStyle='#222';x.font='bold 18px sans-serif';x.textAlign='left';x.fillText('현위치',104,356);x.fillText('연주대 ▲',296,140);
 return c;
}
function textBoard(title){
 const c=document.createElement('canvas');c.width=256;c.height=384;const x=c.getContext('2d');x.fillStyle='#ecefe7';x.fillRect(0,0,256,384);x.fillStyle='#1f4d3a';x.fillRect(0,0,256,48);
 x.fillStyle='#fff';x.font='bold 24px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';x.textAlign='center';x.fillText(title,128,33);
 x.fillStyle='#7c857a';for(let i=0;i<13;i++){const w=150+((i*53)%60);x.fillRect(24,72+i*23,w,7);}
 return c;
}

// ── 기하 도구 ────────────────────────────────────────────────────────────────
function bucketBuilder(){
 const buckets=new Map();
 const add=(key,g,x=0,y=0,z=0,yaw=0)=>{if(yaw)g.rotateY(yaw);g.translate(x,y,z);const geom=g.index?g.toNonIndexed():g;if(geom!==g)g.dispose();if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(geom);};
 const box=(key,x,y,z,w,h,d,yaw=0)=>add(key,new THREE.BoxGeometry(w,h,d),x,y,z,yaw);
 const cyl=(key,x,y,z,r0,r1,h,n=8)=>add(key,new THREE.CylinderGeometry(r0,r1,h,n),x,y,z);
 const merged=()=>[...buckets].map(([key,parts])=>{for(const p of parts)for(const k of Object.keys(p.attributes))if(!['position','normal','uv','color'].includes(k))p.deleteAttribute(k);
  const hasColor=parts.some(p=>p.attributes.color);if(hasColor)for(const p of parts)if(!p.attributes.color){const c=new Float32Array(p.attributes.position.count*3).fill(1);p.setAttribute('color',new THREE.BufferAttribute(c,3));}
  const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();return [key,g];});
 return {add,box,cyl,merged};
}
const plazaPalette={granite:0xb4b3ac,kerbDark:0x8e8d86,white:0xf0efe9,whiteSteel:0xe8e9e6,red:0x8f3a30,roof:0x4f5354,tile:0x7d817e,woodDark:0x4b3a2c,black:0x2a2c2d,lampGrey:0x5c6163,yellow:0xe9b923,leaf:0x4e6b3a,leafDark:0x36502c,stone:0x9b968a,soil:0x4f4232,glass:0xf4efd8};
const plazaMaterials=new Map(Object.entries(plazaPalette).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:k==='whiteSteel'?.55:k==='glass'?.3:.9,metalness:k==='whiteSteel'||k==='lampGrey'?.25:0,vertexColors:['leaf','leafDark'].includes(k)})]));
plazaMaterials.get('glass').emissive=new THREE.Color(0x2a2618);
export {plazaMaterials};

// ── 바닥 ────────────────────────────────────────────────────────────────────
// frame: {x,z,yaw}(entranceFrame). height(x,z): 지형 높이. 일주문 좌표 사각형을 0.5m 격자로 지형 위에 덮는다.
function toWorld(frame,gx,gz){const c=Math.cos(frame.yaw),s=Math.sin(frame.yaw);return {x:frame.x+gx*c+gz*s,z:frame.z-gx*s+gz*c};}
function groundRect(frame,height,x0,x1,z0,z1,tile,macro,lift=PLAZA_LAYOUT.lift,step=.5){
 const nx=Math.max(1,Math.ceil((x1-x0)/step)),nz=Math.max(1,Math.ceil((z1-z0)/step)),pos=[],uv=[],col=[],idx=[];
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const gx=x0+(x1-x0)*i/nx,gz=z0+(z1-z0)*j/nz,w=toWorld(frame,gx,gz);pos.push(w.x,height(w.x,w.z)+lift,w.z);uv.push(gx/tile,gz/tile);
  // 반복 무늬를 깨는 큰 얼룩(±7%)과 사람이 많이 다니는 가운데 축의 닳은 밝기.
  const m=1+(macro(gx*.11,gz*.11)-.5)*.14+Math.max(0,1-Math.abs(gx)/3.5)*.035;col.push(m,m,m);
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;idx.push(a,c,b,b,c,d);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
 return g.toNonIndexed();
}
// 지형을 따라 1m 단위로 끊은 경계석. 폭 w, 노면 위 높이 h.
function kerbRun(b,frame,height,key,gx0,gz0,gx1,gz1,w,h){
 const len=Math.hypot(gx1-gx0,gz1-gz0),n=Math.max(1,Math.round(len/1)),yaw=Math.atan2(gx1-gx0,gz1-gz0)+frame.yaw;
 for(let i=0;i<n;i++){const t=(i+.5)/n,gx=gx0+(gx1-gx0)*t,gz=gz0+(gz1-gz0)*t,p=toWorld(frame,gx,gz),y=height(p.x,p.z)+PLAZA_LAYOUT.lift;
  // 블록 사이 3mm 틈과 조금씩 다른 색이 보이도록 키와 길이를 번갈아 바꾼다.
  b.box(i%3===1?'kerbDark':key,p.x,y+h/2-.03,p.z,w,h+.06,len/n-.006,yaw);}
}
export function createPlazaGround(frame,height){
 const root=new THREE.Group();root.name='광장 바닥 · 블록·아스팔트·경계석(자체 절차 텍스처)';
 const L=PLAZA_LAYOUT,macro=valueNoise(17),block=blockPavingTextures(),asphalt=asphaltTextures();
 // 흐린 날 하늘빛(푸른 반구광)을 받는 위쪽 면이라 바탕을 조금 따뜻하게 둔다(갈색 흙 지형과 같은 중성 회색으로 보이게).
 const blockMaterial=new THREE.MeshStandardMaterial({color:block?0xffeedd:0x9c9890,map:block?.map??null,normalMap:block?.normalMap??null,normalScale:new THREE.Vector2(.9,.9),roughness:.9,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const asphaltMaterial=new THREE.MeshStandardMaterial({color:asphalt?0xffeedd:0x56534f,map:asphalt?.map??null,normalMap:asphalt?.normalMap??null,normalScale:new THREE.Vector2(.6,.6),roughness:.95,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const lineMaterial=new THREE.MeshStandardMaterial({color:0xe9e7df,roughness:.8,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
 const blocks=[groundRect(frame,height,-L.plaza.half,L.plaza.half,L.plaza.from,L.plaza.to,BLOCK_TILE_METRES,macro),
  ...[-1,1].map(s=>groundRect(frame,height,s<0?-L.sidewalk.outer:L.sidewalk.inner,s<0?-L.sidewalk.inner:L.sidewalk.outer,L.sidewalk.from,L.sidewalk.to,BLOCK_TILE_METRES,macro)),
  groundRect(frame,height,L.pavilionPad.x0,L.pavilionPad.x1,L.pavilionPad.z0,L.pavilionPad.z1,BLOCK_TILE_METRES,macro)];
 const roads=[groundRect(frame,height,-L.road.half,L.road.half,L.road.from,L.road.to,ASPHALT_TILE_METRES,macro),groundRect(frame,height,-L.innerRoad.half,L.innerRoad.half,L.innerRoad.from,L.innerRoad.to,ASPHALT_TILE_METRES,macro)];
 const lines=[...[-1,1].map(s=>groundRect(frame,height,s*5.2-.075,s*5.2+.075,L.road.from+.4,L.road.to-.4,1,()=>.5,L.lift+.004,1)),...[-1,1].map(s=>groundRect(frame,height,s*3.2-.075,s*3.2+.075,L.innerRoad.from+.4,L.road.from-.6,1,()=>.5,L.lift+.004,1))];
 for(const [name,geoms,material] of [['블록 포장',blocks,blockMaterial],['아스팔트',roads,asphaltMaterial],['흰 차선',lines,lineMaterial]]){const g=mergeGeometries(geoms,false);geoms.forEach(x=>x.dispose());g.computeBoundingBox();g.computeBoundingSphere();const m=new THREE.Mesh(g,material);m.name=name;m.receiveShadow=true;root.add(m);}
 // 경계석: 길·보도 사이 낮은 돌(6cm), 포장 바깥 높은 돌(14cm), 길·광장 사이 평평한 띠.
 const b=bucketBuilder(),K=L.kerb;
 for(const s of [-1,1]){
  kerbRun(b,frame,height,'granite',s*L.sidewalk.inner,L.sidewalk.from,s*L.sidewalk.inner,L.sidewalk.to,K.width,K.inner);
  const outerFrom=s>0?L.pavilionPad.z1:L.sidewalk.from;kerbRun(b,frame,height,'granite',s*L.plaza.half,outerFrom,s*L.plaza.half,L.plaza.to,K.width,K.outer);
  kerbRun(b,frame,height,'granite',s*L.innerRoad.half+s*.1,L.innerRoad.from,s*L.innerRoad.half+s*.1,L.road.from,K.width,K.outer);
 }
 const pad=L.pavilionPad;kerbRun(b,frame,height,'granite',pad.x0,pad.z0,pad.x1,pad.z0,K.width,K.outer);kerbRun(b,frame,height,'granite',pad.x1,pad.z0,pad.x1,pad.z1,K.width,K.outer);kerbRun(b,frame,height,'granite',pad.x1,pad.z1,pad.x0,pad.z1,K.width,K.outer);
 kerbRun(b,frame,height,'granite',L.plaza.half,L.sidewalk.from,L.plaza.half,pad.z0,K.width,K.outer);
 kerbRun(b,frame,height,'granite',-L.plaza.half,L.plaza.to,L.plaza.half,L.plaza.to,K.width,K.outer);
 kerbRun(b,frame,height,'granite',-L.road.half,L.road.to,L.road.half,L.road.to,.3,.004);
 for(const [key,g] of b.merged()){const m=new THREE.Mesh(g,plazaMaterials.get(key));m.name='경계석';m.receiveShadow=true;root.add(m);}
 root.userData.textures={block:!!block,asphalt:!!asphalt,source:'산풍경 자체 절차 텍스처(외부 이미지 없음)'};
 return root;
}

// ── 시설(일주문 좌표, y=0이 광장 노면) ─────────────────────────────────────────
function hedge(b,h,simple){
 const r=rng(Math.round(h.x*100)),len=h.to-h.from;
 if(h.wall){ // 화강 막돌 석축: 30~50cm 돌을 두 줄로 쌓는다.
  for(let row=0;row<2;row++){let z=h.from;while(z<h.to){const w=.32+r()*.22;if(!simple||row===0)b.box('stone',h.x-h.side*.5+h.side*row*.04,row*.22+.11,z+w/2,.36,simple?h.wall:.21,w-.025);z+=w;}}
 }
 const step=simple?1.6:.55,base=h.wall?h.wall-.05:0,top=h.height;
 for(let z=h.from+step/2;z<h.to;z+=step)for(let layer=0;layer<(simple?1:top>1.2?3:2);layer++){
  const radius=(simple?.75:.48)*(top>1.2?1.15:1)*(.85+r()*.3),g=new THREE.IcosahedronGeometry(radius,simple?0:1),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const k=.82+r()*.32;p.setXYZ(i,p.getX(i)*k*(h.depth/1.9/radius+.25),p.getY(i)*k*(top>1.2?1.25:.85),p.getZ(i)*k);}
  const col=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){const v=.78+r()*.4,yv=.85+.25*(p.getY(i)/radius);col.set([v*yv*.95,v*yv,v*yv*.85],i*3);}g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();
  const y=simple?base+top/2:base+radius*.7+layer*(top-base-radius*.9)/Math.max(1,(top>1.2?2:1));
  b.add(layer%2?'leafDark':'leaf',g,h.x+(r()-.5)*.15,Math.min(y,base+top-radius*.45),z+(r()-.5)*.2);
 }
}
function pavilion(b,f,simple,boards){
 // 약 3.4m × 1.7m 정자. 기둥 4개, 낮은 팔작지붕 대신 우진각 형태의 기와 지붕, 안내판 3면(가운데 지도).
 const c=Math.cos(f.yaw),s=Math.sin(f.yaw),at=(lx,lz)=>[f.x+lx*c+lz*s,f.z-lx*s+lz*c];
 for(const lx of [-.75,.75])for(const lz of [-1.6,1.6]){const [x,z]=at(lx,lz);b.cyl('red',x,1.25,z,.11,.12,2.5,simple?6:10);b.cyl('granite',x,.08,z,.2,.22,.16,8);}
 for(const lz of [-1.6,1.6]){const [x,z]=at(0,lz);b.box('red',x,2.45,z,1.7,.16,.18,f.yaw);}
 for(const lx of [-.75,.75]){const [x,z]=at(lx,0);b.box('red',x,2.45,z,.18,.16,3.4,f.yaw);}
 // 지붕: 처마가 기둥 밖으로 60cm 나간 사면 지붕과 용마루.
 const roof=new THREE.ConeGeometry(1,1,4,1,true);roof.rotateY(Math.PI/4);roof.scale(1.25*1.42,.95,2.45*1.42);const [rx,rz]=at(0,0);b.add('roof',roof,rx,3.0,rz,f.yaw);
 const ridge=new THREE.BoxGeometry(.14,.12,1.3);b.add('tile',ridge,rx,3.44,rz,f.yaw);
 if(!simple){const eave=new THREE.BoxGeometry(2.5,.1,4.9);b.add('woodDark',eave,rx,2.56,rz,f.yaw);}
 // 안내판 틀(앞면은 길 쪽 -lx). 판 그림은 boards에 따로 붙인다.
 const [bx,bz]=at(.62,0);b.box('woodDark',bx,1.45,bz,.08,1.35,3.1,f.yaw);
 if(boards)for(const [i,lz] of [-1.05,0,1.05].entries()){const [x,z]=at(.57,lz);const m=new THREE.Mesh(new THREE.PlaneGeometry(i===1?1.25:.92,i===1?.95:1.15),boards[i]);m.position.set(x,1.5,z);m.rotation.y=f.yaw-Math.PI/2;boards.meshes.push(m);}
}
function bench(b,f,simple){
 const c=Math.cos(f.yaw),s=Math.sin(f.yaw),at=(lx,lz)=>[f.x+lx*c+lz*s,f.z-lx*s+lz*c];
 for(const lx of [-.7,.7]){const [x,z]=at(lx,0);b.box('whiteSteel',x,.22,z,.05,.44,.42,f.yaw);b.box('whiteSteel',x,.62,z+0,.05,.4,.05,f.yaw);}
 for(let k=0;k<(simple?1:4);k++){const [x,z]=at(0,-.15+k*.1);b.box('whiteSteel',x,.44,z,1.6,.035,simple?.42:.07,f.yaw);}
 if(!simple)for(let k=0;k<3;k++){const [x,z]=at(0,.22);b.box('whiteSteel',x,.58+k*.12,z,1.6,.06,.03,f.yaw);}
}
function lamp(b,f,simple){
 const out=f.x<0?1:-1;b.cyl('lampGrey',f.x,2.25,f.z,.06,.09,4.5,simple?5:8);b.cyl('lampGrey',f.x,.15,f.z,.13,.15,.3,8);
 if(!simple){b.box('lampGrey',f.x+out*.35,4.45,f.z,.75,.06,.08);b.box('lampGrey',f.x+out*.75,4.36,f.z,.42,.12,.26);b.box('glass',f.x+out*.75,4.28,f.z,.36,.04,.2);}
}
function bollard(b,f,simple){for(let k=0;k<(simple?1:4);k++)b.cyl(k%2?'black':'yellow',f.x,simple?.4:.1+k*.2,f.z,.07,.07,simple?.8:.2,8);b.cyl('black',f.x,.83,f.z,.05,.075,.06,8);}
function signPost(b,f,simple){b.cyl('black',f.x,.9,f.z,.05,.05,1.8,6);b.box('black',f.x,1.55,f.z,.62,.42,.06,f.yaw);if(!simple)b.box('white',f.x,1.55,f.z,.56,.36,.065,f.yaw);}
export function plazaFacilities(simple=false){
 const b=bucketBuilder(),boards=hasCanvas()&&!simple?Object.assign([texture(textBoard('관악산 안내')),texture(guideMapCanvas()),texture(textBoard('산행 안전'))].map(map=>new THREE.MeshStandardMaterial({map,roughness:.6})),{meshes:[]}):null;
 for(const h of HEDGES)hedge(b,h,simple);
 for(const f of PLAZA_FACILITIES)({pavilion:()=>pavilion(b,f,simple,boards),bench:()=>bench(b,f,simple),lamp:()=>lamp(b,f,simple),bollard:()=>bollard(b,f,simple),sign:()=>signPost(b,f,simple)})[f.id]();
 const root=new THREE.Group();root.name='광장 시설 · 정자·벤치·가로등·차단봉·화단(추정 위치)';
 for(const [key,g] of b.merged()){const m=new THREE.Mesh(g,plazaMaterials.get(key));m.receiveShadow=true;m.castShadow=!simple&&['red','roof','whiteSteel','lampGrey','leaf','leafDark'].includes(key);root.add(m);}
 for(const m of boards?.meshes??[])root.add(m);
 return root;
}

// 가까운 나무를 숲 항목 형식으로(월드 좌표). priority: 입구 예산과 무관하게 거리 LOD를 지킨다.
export function entranceSpecimenEntries(frame){
 const byId=new Map();
 for(const [i,t] of SPECIMEN_TREES.entries()){const p=toWorld(frame,t.x,t.z);if(!byId.has(t.id))byId.set(t.id,[]);byId.get(t.id).push({x:p.x,z:p.z,scale:t.scale,yaw:(i*2.399)%(Math.PI*2),embed:.03,...(t.tint?{forestTint:t.tint}:{})});}
 return [...byId].map(([id,placements])=>({id,kind:'tree',priority:true,entranceSpecimen:true,placements,levels:[0,1,2].map(i=>({url:`${id}-lod${i}.glb`,distance:[0,55,130][i]}))}));
}
