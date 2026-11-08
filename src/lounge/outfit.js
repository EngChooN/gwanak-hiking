// 옷 갈아입기: 동동이의 형상·비율·얼굴은 그대로 두고 옷만 바꾼다.
// 대표 지시(11-08): 캐릭터는 동동이 그대로, 옷은 등산복을 따라 하지 말고 흡연장에 어울리는 회사원 옷으로.
// 그래서 등산 장비(벙거지·배낭·쌍안경)는 숨기고, 옷 칸 색을 회사원 차림으로 바꾼다.
//  - jacket = 셔츠·재킷 몸판, mitten = 장갑(맨손으로 보이게 피부색), boot·sole = 구두.
//  - 등산복 부품(빨간 목도리 고리·앞 지퍼·가슴 배낭끈)은 회사원 옷에 어울리지 않아 몸 안으로 접어 넣고(꼭짓점을 몸통 가운데로 모음),
//    그 자리에 셔츠 깃·넥타이·라펠·단추·패딩 누빔을 옷 부품 메시('Outfit_Parts')로 새로 그려 몸통 겉면에 붙인다.
//    옷 부품은 몸통과 같은 뼈대·같은 좌표(바인드 자세)라 숙이고 걸을 때 몸과 함께 움직인다. 원본 파일은 고치지 않는다.
// 원래 색은 src/toon/link-hiker.js PALETTE(등산복)이다. 꼭짓점 색이 원래 색 중 어느 것과 같은지 보고 옷 표의 색으로 바꾼다.
import * as THREE from 'three';

// link-hiker.js PALETTE와 같은 값(옷에 해당하는 것만). 피부·머리카락·눈·입·볼은 어떤 옷에서도 바꾸지 않는다.
const ORIGINAL={jacket:'#f08a3c',zip:'#c9652a',pants:'#3b4a7a',boot:'#8d5c35',sole:'#3a2a20',pack:'#2fa39a',packDark:'#23827a',mat:'#f2c14e',hat:'#c9b07a',scarf:'#d9473e',mitten:'#e5484d',strap:'#2b3a40'};
const HAND='#f7d9b8'; // 맨손 = 동동이 피부색(link-hiker PALETTE.skin)
// parts: 몸통 겉에 붙이는 회사원 옷 부품
//  collar = 셔츠 깃 색, v = 앞섶이 V자로 열린 깊이(열린 곳에 셔츠가 보임, 0이면 닫힘), lapel = 라펠 색,
//  tie = 넥타이 색, tieTo = 넥타이 끝 높이, buttons = 단추 색, pocket = 가슴 주머니 색, quilt = 패딩 누빔 줄 색, zip = 지퍼 색, stand = 세운 깃 색
export const OUTFITS=Object.freeze({
 shirt:{label:'셔츠·넥타이',desc:'점심 먹고 잠깐 올라온 차림',colors:{jacket:'#f4f1ea',mitten:HAND,pants:'#3a3f4b',boot:'#2b2522',sole:'#151210'},
  parts:{collar:'#ffffff',tie:'#2f4a7a',tieTo:.24,pocket:'#efece5'}},
 suit:{label:'정장 재킷',desc:'야근 중 잠깐 나온 차림',colors:{jacket:'#3e4866',mitten:HAND,pants:'#2e3448',boot:'#2b2522',sole:'#151210'},
  parts:{collar:'#ffffff',shirt:'#f5f2ea',v:.29,lapel:'#323b56',tie:'#b8403a',tieTo:.3,buttons:'#20242f'}},
 cardigan:{label:'카디건',desc:'사무실 냉방 대비 차림',colors:{jacket:'#c9b28a',mitten:HAND,pants:'#4a4f5c',boot:'#6b4a32',sole:'#2a1d15'},
  parts:{collar:'#9fc3e8',shirt:'#9fc3e8',v:.3,lapel:'#b89f76',buttons:'#6b4a32'}},
 padding:{label:'롱패딩',desc:'겨울 옥상 필수템(안에는 정장)',colors:{jacket:'#2f333d',mitten:HAND,pants:'#2e3448',boot:'#2b2522',sole:'#151210'},
  parts:{stand:'#2a2e37',zip:'#8a8f99',quilt:'#1f2229'}},
});
export const DEFAULT_OUTFIT='shirt';
// 예전 저장값(등산복·후드티)은 기본 회사원 옷으로 바꿔 읽는다.
export const outfitKey=k=>OUTFITS[k]?k:DEFAULT_OUTFIT;
// 회사원 차림에 맞지 않는 등산 장비. 원본 메시·소품 이름(link-hiker.js·hiker-gadgets.js) 그대로.
const HIDE=['ToonHiker_Pack','ToonHiker_linePack','ToonHiker_Hat','ToonHiker_lineHat','Gadget.Binoculars','Gadget.Binoculars.Strap0','Gadget.Binoculars.Strap1'];
// 몸 안으로 접어 넣는 등산복 부품(꼭짓점 색 칸 이름)
const FOLD=['scarf','zip','strap'];
const lin=hex=>new THREE.Color(hex); // Color.set은 sRGB 16진수를 작업(선형) 색으로 바꾼다 — link-hiker의 c.set과 같은 변환
const KEYS=Object.keys(ORIGINAL),ORIG=KEYS.map(k=>lin(ORIGINAL[k]));
const close=(r,g,b,c)=>Math.abs(r-c.r)+Math.abs(g-c.g)+Math.abs(b-c.b)<.004;

// ── 몸통 겉면(link-hiker.js 몸통 타원체와 같은 식: 가운데 y .34, 반지름 .165·.18·.145, 아래쪽은 조금 퍼짐) ──
const TRUNK={y:.34,rx:.165,ry:.18,rz:.145};
function trunkRadii(y){const t=(y-TRUNK.y)/TRUNK.ry;return {t,rx:TRUNK.rx*(t<0?1-.08*t:1),rz:TRUNK.rz*(t<0?1-.05*t:1)};}
// 몸통 겉면 위 (각도 a, 높이 y) 점과 법선. a=0이 정면, lift만큼 겉으로 띄운다.
function surfA(a,y,lift){const {t,rx,rz}=trunkRadii(y),s=Math.sqrt(Math.max(1-t*t,0));
 const p=new THREE.Vector3(rx*s*Math.sin(a),y,rz*s*Math.cos(a));
 const n=new THREE.Vector3(p.x/(rx*rx),t/TRUNK.ry,p.z/(rz*rz)).normalize();return {p:p.addScaledVector(n,lift),n};}
// 정면 (x, y) 자리 → 각도
const angleAt=(x,y)=>{const {t,rx}=trunkRadii(y),w=rx*Math.sqrt(Math.max(1-t*t,1e-6));return Math.asin(THREE.MathUtils.clamp(x/w,-1,1));};

// 부품을 모으는 그릇(link-hiker Parts와 같은 속성: 위치·법선·색·외곽선·뼈 가중치)
class Kit{
 constructor(weights){this.weights=weights;this.pos=[];this.nor=[];this.col=[];this.line=[];this.si=[];this.sw=[];this.idx=[];}
 vert(p,n,color,line=0){const w=this.weights(p);this.pos.push(p.x,p.y,p.z);this.nor.push(n.x,n.y,n.z);this.col.push(color.r,color.g,color.b);this.line.push(line);
  for(let k=0;k<4;k++){this.si.push(w[k]?.[0]??0);this.sw.push(w[k]?.[1]??0);}return this.pos.length/3-1;}
 // 몸통 앞면에 붙는 판. y는 yTop→yBot, 각 높이에서 x는 xL(y)→xR(y). 몸통 곡면을 따라 휜다.
 patch(yTop,yBot,xL,xR,lift,hex,{nu=6,nv=10}={}){const c=lin(hex),grid=[];
  for(let j=0;j<=nv;j++){const y=THREE.MathUtils.lerp(yTop,yBot,j/nv),row=[];
   for(let i=0;i<=nu;i++){const x=THREE.MathUtils.lerp(xL(y),xR(y),i/nu),{p,n}=surfA(angleAt(x,y),y,lift);row.push(this.vert(p,n,c));}grid.push(row);}
  this.quads(grid);}
 // 몸통을 한 바퀴 두르는 띠(패딩 누빔 줄)
 band(yTop,yBot,lift,hex,seg=40){const c=lin(hex),grid=[];
  for(const y of [yTop,yBot]){const row=[];for(let i=0;i<=seg;i++){const {p,n}=surfA(-Math.PI+2*Math.PI*i/seg,y,lift);row.push(this.vert(p,n,c));}grid.push(row);}
  this.quads(grid);}
 quads(grid){for(let j=0;j+1<grid.length;j++)for(let i=0;i+1<grid[j].length;i++){const a=grid[j][i],b=grid[j][i+1],c=grid[j+1][i],d=grid[j+1][i+1];this.idx.push(a,c,b,b,c,d);}}
 // 닫힌 형상(넥타이 매듭·단추·깃 고리). line>0이면 동동이처럼 얇은 외곽선이 생긴다.
 solid(geo,hex,line=0){const c=lin(hex);geo.deleteAttribute('uv');if(!geo.attributes.normal)geo.computeVertexNormals();
  const p=geo.attributes.position,n=geo.attributes.normal,base=this.pos.length/3,P=new THREE.Vector3(),N=new THREE.Vector3();
  for(let i=0;i<p.count;i++)this.vert(P.fromBufferAttribute(p,i),N.fromBufferAttribute(n,i),c,line);
  if(geo.index)for(let i=0;i<geo.index.count;i++)this.idx.push(base+geo.index.getX(i));else for(let i=0;i<p.count;i++)this.idx.push(base+i);geo.dispose();}
 // 몸통 앞 (x, y) 자리에 붙는 작은 타원체
 bead(x,y,r,lift,hex,line=0){const {p,n}=surfA(angleAt(x,y),y,lift),g=new THREE.SphereGeometry(1,10,8);g.scale(...r);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),n));g.translate(p.x,p.y,p.z);this.solid(g,hex,line);}
 geometry(){const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setAttribute('outline',new THREE.Float32BufferAttribute(this.line,1));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(this.si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(this.sw,4));
  g.setIndex(this.idx);g.computeBoundingBox();g.computeBoundingSphere();return g;}
}

// 옷 부품 형상. 좌표는 link-hiker 바인드 자세(앞 +Z, 키 1m)와 같다.
export function buildParts(spec,weights=()=>[[0,1]]){
 const k=new Kit(weights),P=spec;
 const NECK=.497; // 목둘레 높이(원래 목도리 고리 자리)
 // 앞섶 V: 열린 곳에 셔츠가 보이고 양옆에 라펠이 접힌다.
 if(P.v){const half=y=>.068*(y-P.v)/(NECK-P.v);
  k.patch(NECK,P.v,y=>-half(y),y=>half(y),.003,P.shirt,{nu:6,nv:12});
  for(const s of [-1,1]){const inner=y=>s*half(y),outer=y=>s*(half(y)+.012+.018*(y-P.v)/(NECK-P.v));
   k.patch(NECK-.004,P.v+.004,s<0?outer:inner,s<0?inner:outer,.005,P.lapel,{nu:3,nv:12});}}
 // 셔츠 깃: 목둘레 띠 + 앞으로 접힌 뾰족한 깃 두 장
 if(P.collar){
  k.solid(new THREE.TorusGeometry(.074,.012,8,28).rotateX(Math.PI/2).scale(1.1,1,1).translate(0,NECK,0),P.collar,.5);
  for(const s of [-1,1]){const lerpY=(a,b,y)=>THREE.MathUtils.lerp(a,b,(NECK+.004-y)/(NECK+.004-(NECK-.058)));
   const inner=y=>s*lerpY(.008,.03,y),outer=y=>s*lerpY(.066,.03,y);
   k.patch(NECK+.004,NECK-.058,s<0?outer:inner,s<0?inner:outer,.011,P.collar,{nu:4,nv:6});}}
 // 넥타이: 매듭 + 아래로 넓어지다 뾰족해지는 날
 if(P.tie){const top=NECK-.022,tip=P.tieTo,wide=tip+.022;
  k.bead(0,NECK-.012,[.016,.014,.01],.012,P.tie,.5);
  const half=y=>y>wide?THREE.MathUtils.lerp(.008,.019,(top-y)/(top-wide)):.019*(y-tip)/(wide-tip);
  k.patch(top,tip,y=>-half(y),y=>half(y),.009,P.tie,{nu:4,nv:14});}
 // 셔츠 가슴 주머니(왼쪽 가슴 = 화면에서 오른쪽, 몸 +X)
 if(P.pocket)k.patch(.405,.365,()=>.052,()=>.09,.004,P.pocket,{nu:4,nv:4});
 // 단추: 앞섶 V 아래 가운데
 if(P.buttons){const from=(P.v??.3)-.025;for(let i=0;i<3;i++){const y=from-i*.05;if(y<.15)break;k.bead(0,y,[.009,.009,.005],.006,P.buttons);}}
 // 롱패딩: 세운 깃 + 가운데 지퍼 + 가로 누빔 줄
 if(P.stand)k.solid(new THREE.CylinderGeometry(.088,.1,.05,28,1,true).translate(0,NECK-.004,0),P.stand,.5);
 if(P.zip)k.patch(NECK-.02,.17,()=>-.004,()=>.004,.004,P.zip,{nu:1,nv:16});
 if(P.quilt)for(const y of [.43,.37,.31,.25,.19])k.band(y+.003,y-.003,.003,P.quilt);
 return k.geometry();
}

// 몸통 메시의 뼈대로 옷 부품 메시를 만든다(처음 한 번). 재질은 원본 몸통과 같은 설정(나중에 toonify가 몸통과 똑같이 바꾼다).
function partsMesh(hiker){
 const body=hiker.scene.getObjectByName('ToonHiker_Body');if(!body)return null;
 if(body.userData.outfitParts)return body.userData.outfitParts;
 const sk=body.skeleton,bi=n=>sk.bones.findIndex(b=>b.name==='mixamorig'+n);
 const bindY=n=>new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[bi(n)].clone().invert()).y;
 const chain=['Hips','Spine','Spine1','Spine2'].map(n=>[bi(n),bindY(n)]),neck=bi('Neck'),NECK_Y=.47;
 // link-hiker trunk()와 같은 방식: 높이에 따라 골반~가슴 뼈 사이를 나눈다. 목둘레는 가슴·목 뼈에 나눠 붙인다(원래 목도리와 같음).
 const weights=p=>{
  if(p.y>=NECK_Y)return [[chain[3][0],.6],[neck,.4]];
  if(p.y>=chain[3][1])return [[chain[3][0],1]];
  for(let i=0;i<3;i++){const [a,ya]=chain[i],[b,yb]=chain[i+1];if(p.y<yb){const t=THREE.MathUtils.clamp((p.y-ya)/(yb-ya),0,1);return [[a,1-t],[b,t]];}}
  return [[chain[0][0],1]];};
 const mat=new THREE.MeshStandardMaterial({name:'outfit_parts',vertexColors:true,roughness:.85,metalness:0});
 const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),mat);mesh.name='Outfit_Parts';mesh.frustumCulled=false;
 const lineSrc=hiker.scene.getObjectByName('ToonHiker_lineA');
 const line=new THREE.SkinnedMesh(mesh.geometry,lineSrc.material);line.name='Outfit_lineParts';line.userData.outline=true;line.userData.outlineOf=mesh.name;line.frustumCulled=false;
 for(const m of [mesh,line]){body.parent.add(m);m.bind(sk,body.bindMatrix);}
 return body.userData.outfitParts={mesh,line,weights};
}

export function applyOutfit(hiker,key=DEFAULT_OUTFIT){
 const o=OUTFITS[outfitKey(key)],target=Object.fromEntries(KEYS.map(k=>[k,lin(o.colors[k]??ORIGINAL[k])]));
 for(const n of HIDE){const m=hiker.scene.getObjectByName(n);if(m)m.visible=false;}
 // 쌍안경은 몸이 처음 움직일 때(realistic-hiker update) 가슴 뼈에 붙는다. 그때도 숨도록 붙는 순간을 잡는다.
 if(!hiker.scene.userData.outfitHideHook){hiker.scene.userData.outfitHideHook=true;
  const hide=e=>{if(HIDE.includes(e.child?.name))e.child.visible=false;};
  hiker.scene.traverse(o=>o.addEventListener('childadded',hide));}
 hiker.scene.traverse(m=>{
  if(!m.isSkinnedMesh||m.userData.outline||!m.visible||m.name==='Outfit_Parts')return;
  const g=m.geometry,c=g.attributes.color;if(!c)return;
  // 처음 한 번 원래 색이 어떤 옷 칸인지 기록한다(-1 = 피부·얼굴 등 바꾸지 않음).
  if(!g.userData.outfitSlot){const slot=new Int8Array(c.count).fill(-1);
   for(let i=0;i<c.count;i++){const r=c.getX(i),gg=c.getY(i),b=c.getZ(i);const k=ORIG.findIndex(x=>close(r,gg,b,x));slot[i]=k;}
   g.userData.outfitSlot=slot;
   // 등산복 부품(목도리·지퍼·배낭끈)은 몸통 가운데로 접어 넣어 보이지 않게 한다(외곽선도 같은 형상이라 함께 사라진다).
   const fold=FOLD.map(n=>KEYS.indexOf(n)),p=g.attributes.position;let folded=false;
   for(let i=0;i<c.count;i++)if(fold.includes(slot[i])){p.setXYZ(i,0,TRUNK.y,0);folded=true;}
   if(folded){p.needsUpdate=true;g.computeBoundingSphere();}}
  const slot=g.userData.outfitSlot;
  for(let i=0;i<c.count;i++){const k=slot[i];if(k<0)continue;const t=target[KEYS[k]];c.setXYZ(i,t.r,t.g,t.b);}
  c.needsUpdate=true;
 });
 // 회사원 옷 부품(깃·넥타이·라펠·단추·누빔)을 이 옷에 맞게 다시 만든다. 메시·재질은 그대로 두고 형상만 바꾼다.
 const parts=partsMesh(hiker);
 if(parts){const old=parts.mesh.geometry,geo=buildParts(o.parts,parts.weights);parts.mesh.geometry=geo;parts.line.geometry=geo;old.dispose();}
 return o;
}
