// 상호작용 소품 모델(산풍경 자체 형상). 사진 텍스처 없음. 치수·색은 일반적인 한국 산 시설 비례에서 잡은 추정이다.
// 근거·출처: docs/변경기록-2026-11-04-상호작용-소품.md. 배치 자료는 interaction-sites.js에 따로 둔다.
// 좌표: 소품 원점 = 지면 중심, +Y 위, +Z 앞(사람이 다가오는 쪽). 기둥·받침은 지면 아래로 묻어 경사에서 뜨지 않게 한다.
// 단계: level 0 = 가까이(글자·세부), 1 = 단순 모델(글자 없음, 저면수), 2 = 먼 실루엣(돌탑만) 또는 없음.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const palette={
 post:0x4a3527,board:0x5b3d27,boardEdge:0x3a281c,cream:0xeee3c8,metal:0x6d7276,steel:0xb9bec0,
 stampRed:0xc2452d,stampDark:0x7e2a1d,granite:0xa39d92,graniteDark:0x7c776e,concrete:0x9a968c,
 water:0x8fb3b4,dipperRed:0xc8382c,dipperBlue:0x2f68a8,rope:0x8a7a5a,
};
export const PROP_MATERIALS=new Map(Object.entries(palette).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:k==='steel'?.35:k==='water'?.08:k.startsWith('dipper')?.45:.9,metalness:k==='steel'?.6:0})]));
{const w=PROP_MATERIALS.get('water');w.transparent=true;w.opacity=.62;w.depthWrite=false;for(const k of ['dipperRed','dipperBlue'])PROP_MATERIALS.get(k).side=THREE.DoubleSide;}
// 돌·동물은 꼭짓점 색을 쓴다(돌마다 다른 화강암 색, 다람쥐 줄무늬, 까치 흑백).
export const VERTEX_MATERIAL=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92});
const ANIMAL_MATERIAL=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78});

const hash=(n)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function builder(){
 const buckets=new Map();
 const add=(g,k,x=0,y=0,z=0,ry=0,rx=0,rz=0)=>{if(rx)g.rotateX(rx);if(rz)g.rotateZ(rz);if(ry)g.rotateY(ry);g.translate(x,y,z);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(g);return g;};
 const box=(k,x,y,z,w,h,d,ry=0,rx=0,rz=0)=>add(new THREE.BoxGeometry(w,h,d),k,x,y,z,ry,rx,rz);
 const beam=(k,a,b,r=.03,n=6)=>{const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=new THREE.CylinderGeometry(r,r,v.length(),n);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));return add(g,k,...a.map((x,i)=>(x+b[i])/2));};
 function finish(root=new THREE.Group()){
  for(const [key,parts]of buckets){
   const all=parts.map(g=>g.index?g.toNonIndexed():g);
   if(key==='vertex')for(const g of all)if(!g.attributes.color)throw new Error('꼭짓점 색 없음');
   for(const g of all){for(const name of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(name))g.deleteAttribute(name);if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));}
   if(key!=='vertex'&&key!=='animal')for(const g of all)g.deleteAttribute('color');
   const g=mergeGeometries(all,false);new Set([...parts,...all]).forEach(p=>p.dispose());g.computeBoundingSphere();
   const mesh=new THREE.Mesh(g,key==='vertex'?VERTEX_MATERIAL:key==='animal'?ANIMAL_MATERIAL:PROP_MATERIALS.get(key));
   mesh.receiveShadow=true;mesh.castShadow=false;mesh.name=key;root.add(mesh);
  }
  return root;
 }
 return {add,box,beam,finish};
}
// 둥글고 울퉁불퉁한 자연석. 같은 seed는 같은 모양. 아래는 납작하게 깎아 쌓을 수 있게 한다.
export function rockGeometry(rx,ry,rz,seed,detail=1,color=null){
 const g=new THREE.IcosahedronGeometry(1,detail),p=g.attributes.position,v=new THREE.Vector3(),c=[];
 const base=new THREE.Color(color??palette.granite).offsetHSL(0,(hash(seed+3)-.5)*.06,(hash(seed+7)-.5)*.14);
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);
  const n=1+.13*Math.sin(v.x*2.7+seed)*Math.cos(v.z*2.1-seed*.6)+.08*Math.sin(v.y*4.3+v.x*1.7+seed*1.9);
  const y=v.y<-.35?-.35-(v.y+.35)*.25:v.y;
  p.setXYZ(i,v.x*rx*n,y*ry*n,v.z*rz*n);
  // 위쪽이 조금 밝고 아래쪽은 흙때로 어둡다.
  const k=.86+.14*(v.y+1)/2+(hash(i*.37+seed)-.5)*.06;c.push(base.r*k,base.g*k,base.b*k);
 }
 g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();return g;
}
// 캔버스 글자판. 문서가 없는 환경(테스트)에서는 null.
const textureCache=new Map();
function canvasTexture(key,w,h,draw){
 if(typeof document==='undefined')return null;
 if(textureCache.has(key))return textureCache.get(key);
 const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;textureCache.set(key,map);return map;
}
const FONT='"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
function textPlane(map,w,h){if(!map)return null;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,roughness:.85,polygonOffset:true,polygonOffsetFactor:-2}));m.name='글자';return m;}

// ── 1. 코스 이정표: 갈색 기둥 + 화살표 판. 판은 실제 이정표처럼 가는 쪽을 가리키고, 양면에 지명을 쓴다.
// boards: [{text, angle}] angle = 소품 기준 화살표 방향(0 = +Z, 시계 반대 +).
export const SIGN_BOARD={length:.92,height:.17,depth:.035,top:2.02,gap:.24};
function arrowShape(L,H){const s=new THREE.Shape(),t=H*.55;s.moveTo(0,-H/2);s.lineTo(L-t,-H/2);s.lineTo(L,0);s.lineTo(L-t,H/2);s.lineTo(0,H/2);s.closePath();return s;}
// 이정표 하나의 모든 판·양면 글자를 한 장(512×96 줄 × 판 수 × 2)에 그려 draw call 하나로 묶는다.
function signTexture(texts){
 return canvasTexture(`sign:${texts.join('|')}`,512,96*texts.length*2,(ctx,w)=>{
  texts.forEach((text,i)=>[true,false].forEach((tipLeft,f)=>{
   const y0=(i*2+f)*96;ctx.fillStyle='#5b3d27';ctx.fillRect(0,y0,w,96);ctx.fillStyle='#f2e8cf';ctx.textBaseline='middle';
   const label=tipLeft?`◀ ${text}`:`${text} ▶`;let size=54;ctx.font=`bold ${size}px ${FONT}`;
   while(ctx.measureText(label).width>w-56&&size>26){size-=2;ctx.font=`bold ${size}px ${FONT}`;}
   ctx.textAlign=tipLeft?'left':'right';ctx.fillText(label,tipLeft?24:w-24,y0+51);
  }));
 });
}
export function trailSignModel(level,boards=[]){
 const b=builder(),{length:L,height:H,depth:D,top,gap}=SIGN_BOARD,root=new THREE.Group();
 b.box('post',0,(top+.32-.45)/2,0,.12,top+.32+.45,.12); // 45cm 묻음
 b.add(new THREE.ConeGeometry(.1,.1,4),'boardEdge',0,top+.37,0,Math.PI/4);
 if(level===0)b.box('cream',0,top-boards.length*gap-.12,.062,.09,.12,.006); // 현위치 번호판 자리(글자 없음)
 boards.slice(0,4).forEach(({angle},i)=>{
  const y=top-i*gap,g=new THREE.ExtrudeGeometry(arrowShape(L,H),{depth:D,bevelEnabled:false,curveSegments:1});
  g.translate(.04,0,-D/2);g.rotateY(-Math.PI/2+angle);b.add(g,'board',0,y,0);
 });
 b.finish(root);
 const map=level===0&&boards.length?signTexture(boards.slice(0,4).map(b=>b.text)):null;
 if(map){
  // +X 면에서 보면 화살 끝(+Z)이 왼쪽(◀), -X 면에서는 오른쪽(▶). 줄 번호 = 판*2 + 면.
  const rows=Math.min(4,boards.length)*2,planes=[];
  boards.slice(0,4).forEach(({angle},i)=>[1,-1].forEach((face,f)=>{
   const g=new THREE.PlaneGeometry(L*.8,H*.86),uv=g.attributes.uv,row=i*2+f;
   for(let k=0;k<uv.count;k++)uv.setY(k,1-(row+1-uv.getY(k))/rows);
   g.rotateY(face*Math.PI/2);g.translate(face*(D/2+.002),top-i*gap,.04+L*.42);g.rotateY(angle);planes.push(g);
  }));
  const m=new THREE.Mesh(mergeGeometries(planes,false),new THREE.MeshStandardMaterial({map,roughness:.85,polygonOffset:true,polygonOffsetFactor:-2}));planes.forEach(g=>g.dispose());m.name='글자';root.add(m);
 }
 return root;
}

// ── 2. 코스 해설 안내판: 기둥 두 개 + 비스듬한 판(1.2×0.85m) + 작은 지붕. 판 글자는 제목만 넣고 본문은 화면 패널이 맡는다.
function boardFace(title,subtitle,summit=false){
 return canvasTexture(`info:${title}:${subtitle}:${summit}`,768,544,(ctx,w,h)=>{
  ctx.fillStyle=summit?'#33332f':'#2f4a3c';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#d8cfb5';ctx.lineWidth=8;ctx.strokeRect(14,14,w-28,h-28);
  ctx.fillStyle='#f3ead2';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`bold 66px ${FONT}`;ctx.fillText(title,w/2,92,w-80);
  ctx.font=`34px ${FONT}`;ctx.fillStyle='#d9d0b4';ctx.fillText(subtitle,w/2,160,w-80);
  // 본문 자리: 읽히지 않는 줄 모양(실제 안내판 글이 아님).
  ctx.fillStyle='rgba(243,234,210,.28)';for(let i=0;i<6;i++){const width=(w-170)*(i===5?.55:.9+.1*Math.sin(i*2.3));ctx.fillRect(85,215+i*42,width,12);}
  ctx.fillStyle='rgba(243,234,210,.55)';ctx.font=`24px ${FONT}`;ctx.fillText('E 키로 읽기 · 직접 정리한 설명(현장 안내판 글 아님)',w/2,h-52,w-80);
 });
}
export const INFO_BOARD={width:1.2,height:.85,tilt:.26,centre:1.18};
export function infoBoardModel(level,{title='안내',subtitle=''}={}){
 const b=builder(),{width:W,height:H,tilt,centre}=INFO_BOARD,root=new THREE.Group();
 for(const x of [-W/2-.04,W/2+.04])b.box('post',x,(centre+H/2+.25-.45)/2,-.06,.09,centre+H/2+.25+.45,.09);
 b.box('boardEdge',0,centre,-.02,W+.1,H+.1,.05,0,-tilt);
 if(level===0){b.box('post',0,centre+H/2+.3,-.08,W+.42,.05,.42,0,.18);b.box('post',0,centre-H/2-.25,-.06,W,.06,.06);}
 else b.box('post',0,centre+H/2+.3,-.08,W+.4,.05,.4);
 b.finish(root);
 const m=level===0?textPlane(boardFace(title,subtitle),W,H):null;
 if(m){m.position.set(0,centre,.007);m.rotation.x=-tilt;root.add(m);}
 return root;
}
// ── 3. 정상 안내판: 화강암 받침 위에 낮게 눕힌 판(1.3×0.8m). 정상석 옆 낮은 자리라 시야를 가리지 않는다.
export function summitBoardModel(level,{title='관악산 정상',subtitle='연주대 · 정상석 629m 표기'}={}){
 const b=builder(),root=new THREE.Group(),tilt=.62;
 // 받침: 다듬지 않은 화강암 덩어리(지상 약 0.6m, 아래는 묻힘) 위에 얇은 판석.
 b.add(rockGeometry(.78,.62,.4,91,level===0?2:1,palette.graniteDark),'vertex',0,0,0);
 b.box('granite',0,.6,.02,1.42,.08,.56,0,-.05);
 b.box('metal',0,.88,.02,1.34,.82,.04,0,-tilt);
 if(level===0)b.box('steel',0,.88-.012*Math.sin(tilt),.02-.012*Math.cos(tilt),1.39,.87,.03,0,-tilt); // 판 둘레 테
 b.finish(root);
 const m=level===0?textPlane(boardFace(title,subtitle,true),1.26,.76):null;
 if(m){m.position.set(0,.88+.024*Math.sin(tilt),.02+.024*Math.cos(tilt));m.rotation.x=-tilt;root.add(m);}
 return root;
}

// ── 4. 스탬프함: 기둥 위 우체통 모양 함(서울둘레길 스탬프함이 우체통 모양이라는 서울시 기사 근거, 색·치수 추정).
const STAMP_GLYPHS=['門','瀑','亭','塔','庵','臺'];
function stampLabel(number,glyph){
 return canvasTexture(`stamp:${number}:${glyph}`,256,320,(ctx,w,h)=>{
  ctx.fillStyle='#f4eadb';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#c2452d';ctx.lineWidth=10;ctx.strokeRect(10,10,w-20,h-20);
  ctx.fillStyle='#c2452d';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`bold 44px ${FONT}`;ctx.fillText('스탬프',w/2,58);
  ctx.beginPath();ctx.arc(w/2,170,74,0,Math.PI*2);ctx.lineWidth=8;ctx.stroke();
  ctx.font=`bold 92px "Noto Serif CJK KR","AppleMyungjo",serif`;ctx.fillText(glyph,w/2,174);
  ctx.font=`bold 34px ${FONT}`;ctx.fillText(`${number} / 6`,w/2,282);
 });
}
export const STAMP_BOX={width:.36,depth:.3,body:.34,base:1.02};
export function stampBoxModel(level,{number=1,glyph=STAMP_GLYPHS[number-1]??'山'}={}){
 const b=builder(),root=new THREE.Group(),{width:W,depth:D,body:B,base}=STAMP_BOX;
 b.box('metal',0,(base-.5)/2,0,.09,base+.5,.09); // 50cm 묻음
 b.box('metal',0,base+.012,0,W*.7,.024,D*.7);
 b.box('stampRed',0,base+.024+B/2,0,W,B,D);
 const roof=new THREE.CylinderGeometry(W/2,W/2,D,level===0?16:8,1,false,0,Math.PI);roof.rotateX(Math.PI/2);roof.rotateZ(Math.PI/2); // 반원 지붕: 축은 앞뒤(Z), 둥근 면이 위
 b.add(roof,'stampRed',0,base+.024+B,0);
 if(level===0){
  b.box('stampDark',0,base+.024+B*.62,D/2+.004,W*.86,B*.66,.008); // 앞문
  b.box('steel',W*.33,base+.024+B*.62,D/2+.012,.02,.06,.012); // 손잡이
  b.box('stampRed',0,base-.06,D/2+.09,W*.9,.025,.18); // 찍는 받침 선반
  b.box('stampDark',0,base-.12,D/2+.02,.04,.1,.04);
 }
 b.finish(root);
 const m=level===0?textPlane(stampLabel(number,glyph),W*.62,W*.78):null;
 if(m){m.position.set(0,base+.024+B*.62,D/2+.0095);root.add(m);}
 return root;
}

// ── 5. 약수터: 뒤에 쌓은 바위 + 쇠 대롱에서 흐르는 물 + 돌 물받이 + 바가지 걸이와 물바가지 2개.
// 물바가지 하나는 따로 떼어 이름('물바가지')을 붙인다. 산개발이 집어 올리는 동작에 쓴다.
export function dipperGeometry(level,color='dipperRed'){
 const bowl=new THREE.LatheGeometry([[0,-.055],[.05,-.05],[.075,-.02],[.08,.025],[.074,.025],[.068,-.016],[.045,-.043],[0,-.048]].map(([x,y])=>new THREE.Vector2(x,y)),level===0?14:7);
 const handle=new THREE.CylinderGeometry(.011,.014,.26,level===0?6:4);handle.rotateZ(Math.PI/2-.25);handle.translate(.19,.04,0);
 const g=mergeGeometries([bowl.toNonIndexed(),handle.toNonIndexed()].map(x=>{x.deleteAttribute('uv');return x;}),false);bowl.dispose();handle.dispose();g.userData.material=color;return g;
}
export const SPRING={spout:[0,.62,-.05],basinTop:.36,dipperHook:[.82,.98,.05]};
export function springModel(level){
 const b=builder(),root=new THREE.Group(),detail=level===0?1:0;
 // 뒤 바위벽(너비 약 1.8m)
 [[-.6,.35,-.45,.55,.55,.4],[.05,.45,-.55,.6,.62,.42],[.66,.3,-.45,.48,.45,.38],[-.25,.92,-.6,.45,.35,.35],[.38,.98,-.62,.4,.3,.33]].forEach(([x,y,z,rx,ry,rz],i)=>b.add(rockGeometry(rx,ry,rz,40+i,detail,palette.graniteDark),'vertex',x,y,z));
 // 물받이: 땅에 놓인 돌 물통(0.9×0.55m, 높이 0.38m). 네 벽과 바닥, 안에 물(가장자리 4cm 아래).
 const tz=.2;for(const [x,z,w,d] of [[0,tz-.24,.9,.07],[0,tz+.24,.9,.07],[-.415,tz,.07,.41],[.415,tz,.07,.41]])b.box('concrete',x,.14,z,w,.48,d);
 b.box('concrete',0,.02,tz,.76,.2,.41);
 if(level===0)b.box('water',0,.34,tz,.76,.012,.41);
 b.beam(level===0?'steel':'metal',[0,.62,-.22],[0,.6,.06],.017,level===0?8:4);
 if(level===0){
  // 떨어지는 물줄기(가는 투명 원기둥)와 바닥 물받이 둘레 작은 돌
  b.add(new THREE.CylinderGeometry(.007,.011,.25,6),'water',0,.475,.07);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;b.add(rockGeometry(.07+.04*hash(i),.05,.07,60+i,0),'vertex',Math.cos(a)*.62,.03,.18+Math.sin(a)*.42);}
 }
 // 바가지 걸이: 쇠기둥 두 개 + 가로대
 for(const x of [.62,1.02])b.beam('metal',[x,-.4,.05],[x,1.05,.05],.016,level===0?6:4);
 b.beam('metal',[.58,1.0,.05],[1.06,1.0,.05],.012,4);
 b.finish(root);
 if(level>0)return root; // 단순 모델: 물·바가지 없이 바위·물받이·걸이만(4 draw call)
 // 걸려 있는 바가지(장식, 파랑)와 집을 수 있는 바가지(빨강)
 const hung=dipperGeometry(level,'dipperBlue');hung.rotateZ(-Math.PI/2+.25);const hungMesh=new THREE.Mesh(hung,PROP_MATERIALS.get('dipperBlue'));hungMesh.position.set(.92,.78,.05);root.add(hungMesh);
 const dipper=new THREE.Mesh(dipperGeometry(level,'dipperRed'),PROP_MATERIALS.get('dipperRed'));dipper.name='물바가지';
 dipper.rotation.z=-Math.PI/2+.25;dipper.position.set(.72,.78,.05);dipper.userData={interactive:true,rest:{position:[.72,.78,.05],rotationZ:-Math.PI/2+.25},fillAt:SPRING.spout};
 root.add(dipper);
 return root;
}

// ── 6. 돌탑: 큰 돌 위로 작아지는 돌을 쌓는다. 넘어지지 않게 각 돌의 바닥을 아래 돌 윗면에 맞춘다.
// 반환 그룹의 userData.top = 다음 돌을 올릴 자리(소품 좌표).
export function cairnStones(height,seed){
 const stones=[];let y=0,r=Math.max(.16,height*.36);
 for(let i=0;y<height&&i<24;i++){
  const ry=Math.max(.035,r*(.32+.18*hash(seed+i*1.7))),jitter=r*.12;
  const x=(hash(seed+i*3.1)-.5)*jitter,z=(hash(seed+i*5.3)-.5)*jitter;
  stones.push({x,y:y+ry*.82,z,rx:r*(.95+.15*hash(seed+i)),ry,rz:r*(.85+.2*hash(seed+i*2.9)),seed:seed+i*11,rot:hash(seed+i*7)*Math.PI});
  y+=ry*1.55;r*=.8+.06*hash(seed+i*9);
 }
 return {stones,top:y};
}
export function cairnModel(level,{height=1.3,seed=1}={}){
 const b=builder(),root=new THREE.Group(),{stones,top}=cairnStones(height,seed);
 if(level===2){const g=new THREE.ConeGeometry(height*.36,height*1.05,6);g.translate(0,height*.48,0);const c=new THREE.Color(0x8a8478);g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:g.attributes.position.count},()=>[c.r,c.g,c.b]).flat(),3));b.add(g,'vertex');}
 else{
  // 단순 모델도 돌을 빼지 않는다(빼면 위 돌이 뜬다). 대신 돌마다 면 수를 줄인다.
  const list=stones;
  // 길가 돌을 주워 쌓은 탑이라 받침 바위보다 어둡고 흙때가 낀 회갈색으로 둔다.
  for(const s of list){const g=rockGeometry(s.rx,s.ry,s.rz,s.seed,level===0?1:0,0x8a8478);g.rotateY(s.rot);b.add(g,'vertex',s.x,s.y,s.z);}
  if(level===0)for(let i=0;i<5;i++){const a=hash(seed+i*13)*Math.PI*2,d=height*.38+.12*hash(seed+i);b.add(rockGeometry(.06+.04*hash(seed+i*2),.04,.06,seed*31+i,0),'vertex',Math.cos(a)*d,.02,Math.sin(a)*d);}
 }
 b.finish(root);root.userData.top=[0,top,0];return root;
}
// 사람이 올리는 돌(지름 약 10cm). 집기·올리기 동작에 쓴다.
export function looseStone(seed=7){const m=new THREE.Mesh(rockGeometry(.055,.035,.045,seed,1),VERTEX_MATERIAL);m.name='올릴 돌';return m;}
// 돌탑 공터: 큰 탑 1기(상호작용용) + 작은 탑 여러 기. "수많은 돌탑" 기록, 개수·크기는 추정.
export const CAIRN_FIELD=[{x:0,z:0,height:1.35,seed:3,main:true},{x:-1.5,z:.6,height:.8,seed:17},{x:1.3,z:.9,height:.95,seed:29},{x:-.7,z:-1.4,height:.55,seed:41},{x:.9,z:-1.2,height:.7,seed:53},{x:2.3,z:-.2,height:.45,seed:67},{x:-2.4,z:-.5,height:.6,seed:79}];
export function cairnFieldModel(level){
 const root=new THREE.Group();
 for(const c of CAIRN_FIELD){if(level===2&&c.height<.7)continue;const m=cairnModel(level,c);m.position.set(c.x,0,c.z);if(c.main){m.name='큰 돌탑';root.userData.top=[c.x,m.userData.top[1],c.z];}root.add(m);}
 // 같은 재질은 한 덩어리로 합친다(돌탑 공터 전체 1~2 draw call).
 return flatten(root,root.userData);
}
function flatten(root,userData={}){
 root.updateMatrixWorld(true);const byMaterial=new Map();
 root.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);byMaterial.get(o.material).push(g.index?g.toNonIndexed():g);});
 const out=new THREE.Group();for(const [material,parts]of byMaterial){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;out.add(mesh);}
 root.traverse(o=>o.geometry?.dispose());out.userData=userData;return out;
}

// ── 7. 다람쥐(한국 다람쥐, Tamias sibiricus): 몸길이 약 14cm + 꼬리 11cm. 등에 검은 줄 5개, 배는 연한 크림색.
// 부위(head, tail, legs)를 따로 둬서 산개발이 고개 돌리기·꼬리 흔들기를 붙일 수 있다. 단순 모델은 한 덩어리.
function ellipsoid(rx,ry,rz,ws,hs,colorAt){
 const g=new THREE.SphereGeometry(1,ws,hs),p=g.attributes.position,c=[],col=new THREE.Color();
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);colorAt(col,x,y,z);c.push(col.r,col.g,col.b);p.setXYZ(i,x*rx,y*ry,z*rz);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();return g;
}
const C=(hex)=>new THREE.Color(hex);
const tint=(g,col)=>{const a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=col.r;a[i+1]=col.g;a[i+2]=col.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;};
const SQ={fur:C(0xa8703c),light:C(0xd9b98a),dark:C(0x2b2018),belly:C(0xead9b8),eye:C(0x0d0b0a)};
function squirrelBodyColor(col,x,y,z){
 // 등(위쪽) 가운데부터 바깥으로 검정-갈색-검정-밝은색-검정 줄. 앞뒤 끝으로 갈수록 흐려진다.
 if(y<-.25){col.copy(SQ.belly);return;}
 const ax=Math.abs(x),fade=Math.abs(z)<.85;
 if(fade&&y>-.1){if(ax<.09||(ax>.3&&ax<.4)||(ax>.62&&ax<.7)){col.copy(SQ.dark);return;}if(ax>.4&&ax<.62){col.copy(SQ.light);return;}}
 col.copy(SQ.fur);
}
export function squirrelModel(level){
 const root=new THREE.Group();root.name='다람쥐';const ws=level===0?14:6,hs=level===0?10:4;
 const part=(name,geometries,x,y,z)=>{const g=mergeGeometries(geometries.map(q=>q.index?q.toNonIndexed():q),false);geometries.forEach(q=>q.dispose());const pivot=new THREE.Group();pivot.name=name;pivot.position.set(x,y,z);const mesh=new THREE.Mesh(g,ANIMAL_MATERIAL);mesh.name=name;pivot.add(mesh);root.add(pivot);return pivot;};
 const T=(g,x,y,z,rx=0)=>{if(rx)g.rotateX(rx);g.translate(x,y,z);return g;};
 // 몸통: 앞(+Z)이 머리 쪽, 약간 웅크려 등이 둥글다.
 part('body',[T(ellipsoid(.034,.032,.068,ws,hs,squirrelBodyColor),0,0,0,-.12)],0,.052,0);
 const head=part('head',[
  ellipsoid(.026,.024,.03,ws,hs,(c,x,y)=>c.copy(y<-.3?SQ.belly:SQ.fur)),
  T(ellipsoid(.013,.012,.014,ws,hs,(c,x,y)=>c.copy(y<0?SQ.belly:SQ.fur)),0,-.006,.026), // 주둥이
  ...[-1,1].flatMap(s=>[
   T(ellipsoid(.006,.009,.004,ws/2|0,hs/2|0,c=>c.copy(SQ.fur)),s*.016,.022,-.004), // 귀
   T(ellipsoid(.005,.005,.004,ws/2|0,hs/2|0,c=>c.copy(SQ.eye)),s*.017,.006,.016), // 눈
   ...(level===0?[T(ellipsoid(.004,.003,.016,6,4,c=>c.copy(SQ.dark)),s*.012,.004,.01)]:[]), // 눈줄
  ]),
 ],0,.078,.07);
 // 꼬리: 등 뒤에서 위로 휘어 오르는 관(길이 약 11cm). 가운데가 가장 굵고(털) 끝은 가늘다. 가장자리 털은 밝다.
 const curve=new THREE.CatmullRomCurve3([[0,0,0],[0,.03,-.035],[0,.075,-.05],[0,.11,-.035]].map(p=>new THREE.Vector3(...p)));
 const tube=new THREE.TubeGeometry(curve,level===0?16:5,1,level===0?8:4,false),tp=tube.attributes.position,tc=[];
 const ring=level===0?9:5;
 for(let k=0;k<tp.count;k++){const t=Math.floor(k/ring)/(level===0?16:5),c=curve.getPointAt(Math.min(1,t)),r=.007+.013*Math.sin(Math.min(1,t*1.15)*Math.PI*.92);
  const dx=tp.getX(k)-c.x,dy=tp.getY(k)-c.y,dz=tp.getZ(k)-c.z,len=Math.hypot(dx,dy,dz)||1;
  tp.setXYZ(k,c.x+dx/len*r*1.25,c.y+dy/len*r,c.z+dz/len*r);const col=Math.abs(dx/len)>.75?SQ.light:SQ.fur;tc.push(col.r,col.g,col.b);}
 tube.setAttribute('color',new THREE.Float32BufferAttribute(tc,3));tube.computeVertexNormals();
 const tail=part('tail',[tube],0,.05,-.06);
 part('legs',[-1,1].flatMap(s=>[T(ellipsoid(.009,.018,.012,6,4,c=>c.copy(SQ.fur)),s*.022,.018,.04),T(ellipsoid(.013,.022,.024,6,4,c=>c.copy(SQ.fur)),s*.024,.022,-.035)]),0,0,0);
 root.userData={kind:'squirrel',length:.25,parts:{head,tail},status:'형태 추정(일반 다람쥐 비례), 관악산 서식 근거: docs/상호작용-자료.md ⑤'};
 if(level>0)return flatten(root,{...root.userData,parts:null});
 return root;
}
// ── 8. 까치(Pica serica): 몸길이 약 45cm(꼬리 약 22cm). 머리·가슴·등 검정, 배·어깨깃 흰색, 날개·꼬리 청록빛 검정.
const MG={black:C(0x101214),sheen:C(0x173a46),white:C(0xf0f0ec),beak:C(0x0a0a0a),leg:C(0x1a1a1a)};
export function magpieModel(level){
 const root=new THREE.Group();root.name='까치';const ws=level===0?14:6,hs=level===0?10:4;
 const part=(name,geometries,x,y,z)=>{const g=mergeGeometries(geometries.map(q=>q.index?q.toNonIndexed():q),false);geometries.forEach(q=>q.dispose());const pivot=new THREE.Group();pivot.name=name;pivot.position.set(x,y,z);const mesh=new THREE.Mesh(g,ANIMAL_MATERIAL);mesh.name=name;pivot.add(mesh);root.add(pivot);return pivot;};
 const T=(g,x,y,z,rx=0,rz=0)=>{if(rx)g.rotateX(rx);if(rz)g.rotateZ(rz);g.translate(x,y,z);return g;};
 // 몸통: 앞쪽 가슴은 검정, 배 아래·옆구리는 흰색.
 part('body',[T(ellipsoid(.05,.055,.1,ws,hs,(c,x,y,z)=>c.copy(y<.05&&z<.55&&z>-.75?MG.white:MG.black)),0,0,0,-.35)],0,.13,0);
 const head=part('head',[
  ellipsoid(.034,.033,.038,ws,hs,c=>c.copy(MG.black)),
  T(tint(new THREE.ConeGeometry(.011,.045,level===0?8:4).rotateX(Math.PI/2),MG.beak),0,-.004,.052),
  ...[-1,1].map(s=>T(ellipsoid(.005,.005,.004,6,4,c=>c.copy(MG.beak)),s*.024,.008,.02)),
 ],0,.2,.075);
 const wing=s=>part(s<0?'wingL':'wingR',[T(ellipsoid(.018,.042,.105,ws,hs,(c,x,y,z)=>c.copy(z>.05&&y>.1?MG.white:z<-.2?MG.sheen:MG.black)),0,0,-.02,-.3)],s*.046,.14,0);
 const wingL=wing(-1),wingR=wing(1);
 const tail=part('tail',[T(ellipsoid(.03,.008,.13,ws,hs,(c,x,y,z)=>c.copy(z<-.5?MG.sheen:MG.black)),0,0,-.13)],0,.115,-.07);
 tail.rotation.x=-.32;
 part('legs',[-1,1].flatMap(s=>[T(new THREE.CylinderGeometry(.004,.004,.08,4),s*.018,.04,.005),T(new THREE.BoxGeometry(.012,.004,.04),s*.018,.002,.015)]).map(g=>tint(g,MG.leg)),0,0,0);
 root.userData={kind:'magpie',length:.45,parts:{head,tail,wingL,wingR},status:'형태 추정(까치 일반 형태), 관악산 근거 없음 → 입구·광장 쪽에만 배치'};
 if(level>0)return flatten(root,{...root.userData,parts:null});
 return root;
}

// 종류별 단계 거리(m). 소품은 작아서 25m 안에서만 글자·세부를 보이고, 동물은 40m 밖에서 숨긴다.
export const PROP_LOD={
 trailSign:[0,25,90],infoBoard:[0,25,90],summitBoard:[0,30,120],stampBox:[0,20,70],spring:[0,25,80],cairnField:[0,30,90,200],squirrel:[0,12,40],magpie:[0,15,50],
};
export function propModel(kind,level,options={}){
 if(kind==='trailSign')return trailSignModel(level,options.boards);
 if(kind==='infoBoard')return infoBoardModel(level,options);
 if(kind==='summitBoard')return summitBoardModel(level,options);
 if(kind==='stampBox')return stampBoxModel(level,options);
 if(kind==='spring')return springModel(level);
 if(kind==='cairnField')return cairnFieldModel(level);
 if(kind==='squirrel')return squirrelModel(level);
 if(kind==='magpie')return magpieModel(level);
 throw new Error(`알 수 없는 소품: ${kind}`);
}
// 단계 묶음. 마지막 거리 밖은 빈 그룹(그리지 않음). cairnField는 90~200m에 실루엣 단계가 하나 더 있다.
export function createPropLod(kind,options={}){
 const lod=new THREE.LOD();lod.autoUpdate=false;lod.name=kind;const distances=PROP_LOD[kind];
 distances.forEach((distance,i)=>{const last=i===distances.length-1,object=last?new THREE.Group():propModel(kind,i,options);lod.addLevel(object,distance,.1);});
 lod.userData.top=lod.levels[0].object.userData.top;return lod;
}
export function lodStats(lod){
 return lod.levels.map(l=>{let triangles=0,meshes=0;l.object.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;meshes++;}});return {distance:l.distance,triangles,drawCalls:meshes};});
}
