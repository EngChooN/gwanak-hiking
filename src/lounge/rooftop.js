// 옥상 흡연장(서울 도심 빌딩 옥상, 16×12m): 바닥·난간·흡연 부스·재떨이·벤치·자판기·화분·계단실·실외기·가로등, 난간 너머 도심 원경.
// 그래픽은 온라인 등산 그대로: 소품은 concept-kit 형상 + trail-props 마감(finishTrailModel: 툰 재질·뒤집은 껍질 외곽선, 텍스처 없음),
// 벤치는 온라인 등산 산길 벤치 원형(makeTrailProp('bench')), 도심 원경은 toon.styleCity(「너의 이름은」 도심 셰이더: 낮 파스텔·노을 윤곽빛·밤 창 불빛).
// 크기는 동동이 키 1.0m 기준(벤치 좌판 0.44m는 산길 벤치와 같다). 좌표: x 오른쪽, -Z 앞(스폰에서 바라보는 쪽), 바닥 y=0.
// 자리(spots)는 "걸어가서 서는 곳"이다(NPC·자동 이동이 그 점까지 걷는다). 재떨이 몸통·벤치 좌판 위치는 at·seat에 따로 둔다.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {v,ell,capsule,at,part} from '../toon/concept-kit.js';
import {boxAt,rod,finishTrailModel,makeTrailProp,BENCH} from '../toon/trail-props.js';
import {CITY_LOOK} from '../toon/city.js';

// ── 치수(m)
export const ROOF=Object.freeze({minX:-8,maxX:8,minZ:-6,maxZ:6,parapet:.45,rail:1.1,depth:45});
export const BOOTH=Object.freeze({minX:-7.7,maxX:-3.5,minZ:-5.7,maxZ:-1.7,roof:2.35});
export const STAIR=Object.freeze({minX:4.8,maxX:8,minZ:-6,maxZ:-2.6,h:2.7});
// ── 색: 동동이·산길 소품과 같은 팔레트에서 가져오고(빨강 띠 #d9473e·벤치 철 #3e5b48·가로등 기둥 #8d9a93·잎 #6c9b4a/#4f8a3c), 옥상 재료색만 더한다.
const C={
 coat:'#8fae95',coatLine:'#e8dfa8',deck:'#b88a5a',tile:'#c9c1b3',concrete:'#c8c2b6',concreteDark:'#a9a397',
 iron:'#3e5b48',pole:'#8d9a93',steel:'#b9bec0',steelDark:'#6f777a',
 boothRoof:'#efe6d2',fascia:'#3f8f86',panel:'#cfe0e3',panelFrame:'#7d8f93',
 red:'#d9473e',redDark:'#a8352e',cream:'#f6efdc',door:'#7f8b8f',window:'#5d7488',
 pot:'#c98a5a',potDark:'#a86e45',soil:'#6b4e36',leaf:'#6c9b4a',leafDark:'#4f8a3c',flower:'#f3c14e',flowerPink:'#f29bb0',
 ac:'#e4e2da',acGrill:'#8f9496',tank:'#5f9fc4',ash:'#3d3f42',sand:'#d8c9a3',
};
const LAMP=new THREE.Color(CITY_LOOK.light.cream); // 가로등·창 불빛: 도심 창 불빛과 같은 크림색
const clamp01=x=>Math.min(1,Math.max(0,x));
const rng=seed=>{let s=seed>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);};

export function buildRooftop({toon,scene,world,mobile=false}){
 const group=new THREE.Group();group.name='옥상 흡연장';
 const props=new THREE.Group();props.name='옥상 소품';
 const colliders=[];
 const boxC=(minX,maxX,minZ,maxZ)=>colliders.push({minX,maxX,minZ,maxZ});
 const circC=(x,z,r)=>colliders.push({x,z,r});
 const f=toon.materialFactory;
 // 같은 색 상자·막대를 한 메시로 묶는다(그리기 호출 줄이기). 형상은 concept-kit 상자·원기둥 그대로.
 const merged=(parent,geos,color,o={})=>part(parent,mergeGeometries(geos.map(g=>g.index?g.toNonIndexed():g)),color,o);
 const boxG=(sx,sy,sz,x,y,z,rx=0,ry=0)=>{const g=new THREE.BoxGeometry(sx,sy,sz);if(rx)g.rotateX(rx);if(ry)g.rotateY(ry);return g.translate(x,y,z);};
 const rodG=(a,b,r,radial=10)=>{const d=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,d.length(),radial);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0,1,0),d.normalize()));const m=a.clone().add(b).multiplyScalar(.5);return g.translate(m.x,m.y,m.z);};

 // 밤에 켜지는 것들: 발광 재질(툰 재질, 이름으로 따로 만들어 세기만 바꾼다)과 점광원.
 const glowMats=[];
 const glowMat=(name,color,{day=0,night=1.6}={})=>{const m=f.basic(new THREE.Color(color),{name:`rooftop-${name}`,emissive:new THREE.Color(color)});m.emissiveIntensity=day;glowMats.push({m,day,night});return m;};
 const glowPart=(parent,geo,mat,line=0)=>{const m=new THREE.Mesh(geo,mat);m.userData.line=line;m.castShadow=false;parent.add(m);return m;};
 const lamps=[];
 const pointLight=(x,y,z,{power=7,distance=7}={})=>{const l=new THREE.PointLight(LAMP,0,distance,2);l.position.set(x,y,z);l.castShadow=false;group.add(l);lamps.push({l,power});return l;};

 // ── 바닥: 옥상 방수 페인트(초록) + 줄눈, 부스 밑 나무 데크, 계단실 문에서 나오는 보도 타일
 {
  const W=ROOF.maxX-ROOF.minX,D=ROOF.maxZ-ROOF.minZ;
  const slab=new THREE.Mesh(new THREE.BoxGeometry(W,.1,D).translate(0,-.05,0),f.basic(new THREE.Color(C.coat),{name:'rooftop-coat'}));
  slab.receiveShadow=true;slab.name='옥상 바닥';group.add(slab);
  const lines=[];for(let x=-6;x<=6;x+=3)lines.push(boxG(.05,.004,D-.4,x,.002,0));for(let z=-3;z<=3;z+=3)lines.push(boxG(W-.4,.004,.05,0,.002,z));
  const lm=new THREE.Mesh(mergeGeometries(lines),f.basic(new THREE.Color(C.coatLine),{name:'rooftop-coat-line'}));lm.receiveShadow=true;group.add(lm);
  // 데크: 부스 바닥 나무판(산길 데크 계단 나무색과 같은 계열)
  const boards=[];for(let z=BOOTH.minZ+.05;z<BOOTH.maxZ-.05;z+=.3)boards.push(boxG(BOOTH.maxX-BOOTH.minX-.1,.06,.26,(BOOTH.minX+BOOTH.maxX)/2,.03,z+.13));
  merged(props,boards,C.deck,{line:.3});
  // 보도 타일: 계단실 문(-X 면) 앞에서 가운데로
  const tiles=[];for(let i=0;i<6;i++)for(const dz of [-.31,.31])tiles.push(boxG(.58,.04,.58,STAIR.minX-.45-i*.64,.02,-4.35+dz));
  merged(props,tiles,C.tile,{line:.25});
 }

 // ── 난간: 콘크리트 턱(높이 0.45) + 철제 난간(1.1m). 옥상 밖 둘레에 두르고 경계는 bounds가 막는다.
 {
  const t=.24,h=ROOF.parapet,{minX,maxX,minZ,maxZ}=ROOF;
  const walls=[boxG(maxX-minX+2*t,h,t,0,h/2,minZ-t/2),boxG(maxX-minX+2*t,h,t,0,h/2,maxZ+t/2),boxG(t,h,maxZ-minZ,minX-t/2,h/2,0),boxG(t,h,maxZ-minZ,maxX+t/2,h/2,0)];
  merged(props,walls,C.concrete,{line:.6});
  const caps=[boxG(maxX-minX+2*t+.06,.05,t+.06,0,h+.025,minZ-t/2),boxG(maxX-minX+2*t+.06,.05,t+.06,0,h+.025,maxZ+t/2),boxG(t+.06,.05,maxZ-minZ,minX-t/2,h+.025,0),boxG(t+.06,.05,maxZ-minZ,maxX+t/2,h+.025,0)];
  merged(props,caps,C.concreteDark,{line:.5});
  const posts=[],rails=[],y0=h+.05,y1=ROOF.rail;
  const edge=(ax,az,bx,bz)=>{const len=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(len/1.2));
   for(let i=0;i<=n;i++){const x=ax+(bx-ax)*i/n,z=az+(bz-az)*i/n;posts.push(rodG(v(x,y0,z),v(x,y1,z),.025,8));}
   rails.push(rodG(v(ax,y1,az),v(bx,y1,bz),.032,10),rodG(v(ax,(y0+y1)/2,az),v(bx,(y0+y1)/2,bz),.016,8));};
  const o=t/2;edge(minX-o,minZ-o,maxX+o,minZ-o);edge(minX-o,maxZ+o,maxX+o,maxZ+o);edge(minX-o,minZ-o,minX-o,maxZ+o);edge(maxX+o,minZ-o,maxX+o,maxZ+o);
  merged(props,posts,C.pole,{line:.4});merged(props,rails,C.pole,{line:.5});
 }

 // ── 흡연 부스: 데크 위 기둥 4개 + 지붕(크림 판·청록 처마) + 뒤(-X)·앞(-Z) 반투명 느낌 판(불투명 연하늘 단색). +X·+Z는 열려 있다.
 {
  const {minX,maxX,minZ,maxZ,roof}=BOOTH,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,W=maxX-minX,D=maxZ-minZ;
  const corners=[[minX+.08,minZ+.08],[maxX-.08,minZ+.08],[minX+.08,maxZ-.08],[maxX-.08,maxZ-.08]];
  merged(props,corners.map(([x,z])=>boxG(.1,roof,.1,x,roof/2,z)),C.panelFrame,{line:.6});
  for(const [x,z] of corners)circC(x,z,.09);
  boxAt(props,v(W+.5,.12,D+.5),v(cx,roof+.06,cz),C.boothRoof,{line:.8});
  merged(props,[boxG(W+.54,.16,.04,cx,roof+.04,maxZ+.27),boxG(W+.54,.16,.04,cx,roof+.04,minZ-.27),boxG(.04,.16,D+.54,maxX+.27,roof+.04,cz),boxG(.04,.16,D+.54,minX-.27,roof+.04,cz)],C.fascia,{line:.6});
  // 판(높이 0.1~2.0): 뒤 벽(-X)과 앞(-Z) 한 면, +Z 쪽은 반만
  const pY0=.12,pY1=2.0,pH=pY1-pY0;
  merged(props,[boxG(.04,pH,D-.2,minX+.08,pY0+pH/2,cz),boxG(W-.2,pH,.04,cx,pY0+pH/2,minZ+.08)],C.panel,{line:.6});
  merged(props,[boxG(1.5,pH,.04,minX+.85,pY0+pH/2,maxZ-.08)],C.panel,{line:.6});
  merged(props,[boxG(.07,.05,D,minX+.08,pY1,cz),boxG(W,.05,.07,cx,pY1,minZ+.08),boxG(1.5,.05,.07,minX+.85,pY1,maxZ-.08),boxG(.07,.05,D,minX+.08,pY0,cz),boxG(W,.05,.07,cx,pY0,minZ+.08)],C.panelFrame,{line:.5});
  boxC(minX,minX+.14,minZ,maxZ);boxC(minX,maxX,minZ,minZ+.14);boxC(minX,minX+1.62,maxZ-.12,maxZ);
  // 「흡연구역」 표지판(글자 대신 그림): 처마 앞(+X) 초록 판 + 흰 담배·주황 불씨·연기 동그라미
  const sign=new THREE.Group();sign.position.set(maxX+.3,roof-.05,cz);sign.rotation.y=Math.PI/2;props.add(sign);
  boxAt(sign,v(1.1,.42,.05),v(0,0,0),C.fascia,{line:.6});
  boxAt(sign,v(.62,.08,.03),v(-.08,-.06,.035),C.cream,{line:.3});boxAt(sign,v(.1,.08,.03),v(.28,-.06,.035),'#f08a3c',{line:.3});
  for(const [x,y,r] of [[.36,.04,.035],[.42,.11,.045],[.37,.17,.03]])part(sign,at(ell(v(r,r,.012),{w:10,h:8}),v(x,y,.035)),C.cream,{line:.3});
  // 천장 등(밤에 켜짐)
  glowPart(props,new THREE.BoxGeometry(1.2,.04,.18).translate(cx,roof-.02,cz),glowMat('booth-light',LAMP,{day:.15,night:1.4}));
  pointLight(cx,roof-.3,cz,{power:6,distance:6});
 }

 // ── 계단실(옥상 출입구): 크림 벽 + 회색 철문(-X 면) + 작은 창 + 문 위 등, 지붕에 물탱크
 {
  const {minX,maxX,minZ,maxZ,h}=STAIR,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  boxAt(props,v(maxX-minX,h,maxZ-minZ),v(cx,h/2,cz),C.concrete,{line:.8});
  boxAt(props,v(maxX-minX+.2,.12,maxZ-minZ+.2),v(cx,h+.06,cz),C.concreteDark,{line:.7});
  boxC(minX,maxX,minZ,maxZ);
  const door=new THREE.Group();door.position.set(minX-.02,0,-4.35);props.add(door);
  boxAt(door,v(.06,2.1,1.1),v(-.01,1.05,0),C.panelFrame,{line:.6});boxAt(door,v(.06,1.95,.92),v(-.04,.99,0),C.door,{line:.5});
  boxAt(door,v(.05,.04,.16),v(-.09,.95,-.32),C.steel,{line:.3});
  part(door,at(ell(v(.012,.08,.06),{w:8,h:6}),v(-.075,1.55,0)),C.window,{line:.3});
  // 문 위 등 + 비상구 초록 표시(밤에 빛남)
  boxAt(door,v(.16,.06,.42),v(-.08,2.24,0),C.steelDark,{line:.4});
  glowPart(door,new THREE.BoxGeometry(.08,.05,.34).translate(-.12,2.2,0),glowMat('door-light',LAMP,{day:.1,night:1.6}));
  glowPart(door,new THREE.BoxGeometry(.03,.12,.3).translate(-.07,2.45,0),glowMat('exit-sign','#5fd08a',{day:.35,night:1.1}),.3);
  pointLight(minX-.6,2.1,-4.35,{power:5,distance:6});
  // 창(+Z 면 위쪽, 밤에 계단 불빛)
  const win=glowMat('stair-window','#ffe2a8',{day:0,night:1.1});
  for(const x of [5.7,7.1]){boxAt(props,v(.8,.6,.05),v(x,2.0,maxZ+.01),C.panelFrame,{line:.5});glowPart(props,new THREE.BoxGeometry(.68,.48,.03).translate(x,2.0,maxZ+.03),win);}
  win.color.set(C.window);
  // 물탱크(파란 원통) + 받침
  merged(props,[boxG(.12,.5,1.3,cx-.55,h+.37,cz),boxG(.12,.5,1.3,cx+.55,h+.37,cz)],C.steelDark,{line:.4});
  part(props,new THREE.CylinderGeometry(.62,.62,1.5,20).rotateZ(Math.PI/2).translate(cx,h+1.2,cz),C.tank,{line:.7});
  for(const s of [-1,1])part(props,new THREE.TorusGeometry(.63,.03,6,20).rotateY(Math.PI/2).translate(cx+s*.45,h+1.2,cz),'#4b86a8',{line:.3});
 }

 // ── 자판기: 계단실 +Z 면에 붙은 빨간 자판기(동동이 목도리 빨강). 음료 칸은 밝게, 밤엔 판이 빛난다.
 {
  const vm=new THREE.Group();vm.position.set(6.2,0,STAIR.maxZ+.38);props.add(vm);
  boxAt(vm,v(1.0,1.75,.72),v(0,.875,0),C.red,{line:.8});
  boxAt(vm,v(.82,.82,.04),v(-.02,1.18,.37),C.redDark,{line:.4});
  const shelf=glowMat('vending-shelf','#fff6dc',{day:.25,night:1.0});
  glowPart(vm,new THREE.BoxGeometry(.74,.74,.02).translate(-.02,1.18,.39),shelf);
  const cans=['#3d8fd1','#f08a3c','#5fb36a','#f3c14e','#e5484d','#8a6ad1'],r=rng(7);
  for(let row=0;row<3;row++)for(let i=0;i<5;i++)part(vm,new THREE.CylinderGeometry(.045,.045,.15,10).translate(-.3+i*.14,.9+row*.24,.42),cans[Math.floor(r()*cans.length)],{line:.25});
  boxAt(vm,v(.82,.03,.06),v(-.02,.86,.4),C.steel,{line:.2});
  boxAt(vm,v(.16,.36,.04),v(.38,1.18,.38),'#2b2f33',{line:.3});
  for(let i=0;i<3;i++)boxAt(vm,v(.08,.05,.03),v(.38,1.28-i*.1,.405),i===0?'#f3c14e':C.steel,{line:0});
  boxAt(vm,v(.7,.22,.06),v(-.02,.28,.38),'#2b2f33',{line:.4});
  boxAt(vm,v(1.04,.08,.76),v(0,1.79,0),C.redDark,{line:.5});
  boxC(5.7,6.7,STAIR.maxZ,STAIR.maxZ+.76);
 }

 // ── 스탠드 재떨이 3: 둥근 받침 + 기둥 + 모래 그릇(높이 0.7m — 동동이 손이 닿는 높이). 자리는 재떨이 앞 0.5m에 서서 재떨이를 본다.
 const ASHTRAYS=[{x:-5.0,z:-4.95,face:[0,1]},{x:-2.95,z:-2.55,face:[1,0]},{x:3.35,z:-5.3,face:[0,1]}];
 const ashtraySpots=[];
 for(const a of ASHTRAYS){
  const g=new THREE.Group();g.position.set(a.x,0,a.z);props.add(g);
  part(g,new THREE.CylinderGeometry(.16,.19,.05,20).translate(0,.025,0),C.steelDark,{line:.5});
  part(g,new THREE.CylinderGeometry(.04,.045,.6,12).translate(0,.33,0),C.steel,{line:.5});
  part(g,new THREE.CylinderGeometry(.15,.11,.12,20).translate(0,.66,0),C.steel,{line:.6});
  part(g,new THREE.CylinderGeometry(.13,.13,.01,20).translate(0,.715,0),C.sand,{line:0});
  part(g,new THREE.TorusGeometry(.145,.012,6,20).rotateX(Math.PI/2).translate(0,.72,0),C.steelDark,{line:.3});
  for(const [x,z,ry] of [[.04,.02,.4],[-.05,-.03,2.1]])part(g,capsule(v(0,0,0),v(.05,0,0),.007,6).rotateY(ry).translate(x,.725,z),C.cream,{line:0});
  circC(a.x,a.z,.2);
  const sx=a.x+a.face[0]*.52,sz=a.z+a.face[1]*.52;
  ashtraySpots.push({x:+sx.toFixed(3),z:+sz.toFixed(3),heading:Math.atan2(a.face[0],a.face[1]),at:{x:a.x,z:a.z,y:.72}});
 }

 // ── 화분: 네모 화분 + 둥근 덤불 덩어리(잎 두 색) + 작은 꽃
 const planter=(x,z,w,d,seed,{flowers=C.flower}={})=>{
  const g=new THREE.Group();g.position.set(x,0,z);props.add(g);const r=rng(seed);
  boxAt(g,v(w,.42,d),v(0,.21,0),C.pot,{line:.6});boxAt(g,v(w+.06,.05,d+.06),v(0,.43,0),C.potDark,{line:.5});
  boxAt(g,v(w-.1,.02,d-.1),v(0,.44,0),C.soil,{line:0});
  const n=Math.max(2,Math.round(w/.45));
  for(let i=0;i<n;i++){const px=-w/2+w*(i+.5)/n+(r()-.5)*.08,pz=(r()-.5)*d*.25,s=.2+r()*.08;
   part(g,at(ell(v(s,s*.85,s*.9),{w:16,h:12}),v(px,.5+s*.55,pz)),i%2?C.leafDark:C.leaf,{line:.6});
   if(r()<.7)part(g,at(ell(v(.035,.035,.035),{w:8,h:6}),v(px+(r()-.5)*s,.5+s*1.2,pz+s*.6)),flowers,{line:.3});}
  boxC(x-w/2,x+w/2,z-d/2,z+d/2);
 };
 planter(-5.2,5.55,1.8,.55,11);planter(-1.6,5.55,1.4,.55,23,{flowers:C.flowerPink});planter(4.2,5.55,1.6,.55,37);
 planter(-3.1,-.9,.6,.6,51,{flowers:C.flowerPink});planter(.4,-5.55,.7,.55,63);
 // 키 큰 화분 하나(부스 옆 나무)
 {
  const x=-7.3,z=-.7,g=new THREE.Group();g.position.set(x,0,z);props.add(g);
  part(g,new THREE.CylinderGeometry(.3,.24,.5,16).translate(0,.25,0),C.pot,{line:.6});
  part(g,new THREE.CylinderGeometry(.04,.05,.8,8).translate(0,.85,0),'#6b4e36',{line:.4});
  for(const [px,py,pz,s,c] of [[0,1.45,0,.38,C.leaf],[.2,1.25,.12,.26,C.leafDark],[-.18,1.3,-.1,.28,C.leafDark],[.02,1.72,-.04,.24,C.leaf]])part(g,at(ell(v(s,s*.85,s)),v(px,py,pz)),c,{line:.7});
  circC(x,z,.32);
 }

 // ── 실외기(에어컨) 2대: 동쪽(+X) 난간 쪽
 for(const [i,z] of [[0,.4],[1,1.5]]){
  const g=new THREE.Group();g.position.set(7.5,0,z);g.rotation.y=-Math.PI/2;props.add(g);
  boxAt(g,v(.9,.62,.38),v(0,.33,0),C.ac,{line:.6});boxAt(g,v(.9,.04,.42),v(0,.02,0),C.acGrill,{line:.3});
  part(g,new THREE.CylinderGeometry(.22,.22,.02,20).rotateX(Math.PI/2).translate(-.15,.34,.2),C.acGrill,{line:.4});
  part(g,new THREE.CylinderGeometry(.04,.04,.025,10).rotateX(Math.PI/2).translate(-.15,.34,.21),C.steelDark,{line:0});
  merged(g,[0,1,2,3].map(k=>boxG(.14,.012,.02,.28,.2+k*.06,.2)),C.acGrill,{line:0});
  rod(g,v(.35,.5,-.19),v(.35,.5,-.42),.02,C.steel,{line:.3});
  boxC(7.31,7.69,z-.45,z+.45);
  if(i===1)boxAt(g,v(.08,.08,.08),v(.3,.68,0),C.steel,{line:.3});
 }

 // ── 가로등 2개(정원등 모양): 산길 가로등 기둥색 + 크림 갓, 밤에 빛남
 const lampPost=(x,z)=>{
  const g=new THREE.Group();g.position.set(x,0,z);props.add(g);
  part(g,new THREE.CylinderGeometry(.12,.14,.12,14).translate(0,.06,0),C.iron,{line:.5});
  part(g,new THREE.CylinderGeometry(.035,.045,2.3,10).translate(0,1.25,0),C.pole,{line:.5});
  part(g,new THREE.CylinderGeometry(.06,.2,.12,16).translate(0,2.62,0),C.iron,{line:.5});
  glowPart(g,at(ell(v(.15,.17,.15),{w:16,h:12}),v(0,2.42,0)),glowMat('lamp-globe',LAMP,{day:.1,night:2.0}),.4);
  part(g,new THREE.CylinderGeometry(.05,.05,.06,10).translate(0,2.25,0),C.iron,{line:.3});
  circC(x,z,.15);pointLight(x,2.3,z,{power:9,distance:8});
 };
 lampPost(-1.8,1.4);lampPost(4.4,.4);

 // ── 마감: 툰 재질 + 외곽선 껍질(온라인 등산 산길 소품과 같은 두께·색)
 finishTrailModel(props,toon.toonify,{shadow:true});
 group.add(props);

 // ── 벤치 2: 온라인 등산 산길 벤치 그대로(앞 +Z, 좌판 0.44m). 자리는 좌판 앞 0.45m에 등을 벤치로 두고 선다.
 const BENCHES=[{x:-7.05,z:-3.7,ry:Math.PI/2},{x:1.9,z:-5.5,ry:0}];
 const benchSpots=[];
 for(const b of BENCHES){
  const m=makeTrailProp('bench',toon.toonify);m.position.set(b.x,0,b.z);m.rotation.y=b.ry;group.add(m);
  const fx=Math.sin(b.ry),fz=Math.cos(b.ry),hx=BENCH.length/2,z0=-.27,z1=.16;
  // 회전한 벤치 상자(앞뒤 z0~z1, 좌우 ±hx)의 바닥 사각형
  const pts=[[-hx,z0],[hx,z0],[-hx,z1],[hx,z1]].map(([lx,lz])=>[b.x+lx*fz+lz*fx,b.z-lx*fx+lz*fz]);
  boxC(Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[1])));
  const sx=b.x+fx*.6,sz=b.z+fz*.6;
  benchSpots.push({x:+sx.toFixed(3),z:+sz.toFixed(3),heading:Math.atan2(-fx,-fz),seat:{x:b.x+fx*BENCH.seatZ,z:b.z+fz*BENCH.seatZ,y:BENCH.seatY,heading:Math.atan2(-fx,-fz)}});
 }

 // ── 우리 건물 몸통 + 도심 원경: toon.styleCity(온라인 등산 서울 원경과 같은 셰이더). 정점 속성은 city-grid.js와 같다(color, seoulInfo=[seed,base,height], seoulType).
 const cityStyle=toon.styleCity({material:new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),nightLights:[]});
 const tagged=(g,{seed,base,height,type,color})=>{
  const n=g.attributes.position.count,info=new Float32Array(n*3),col=new Float32Array(n*3),typ=new Float32Array(n);const c=new THREE.Color(color);
  for(let k=0;k<n;k++){info.set([seed,base,height],k*3);col.set([c.r,c.g,c.b],k*3);typ[k]=type;}
  g.setAttribute('seoulInfo',new THREE.BufferAttribute(info,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('seoulType',new THREE.BufferAttribute(typ,1));
  g.deleteAttribute('uv');return g;
 };
 const base=-ROOF.depth;
 {
  // 우리 건물: 난간 바깥 면까지. 불빛 점은 붙이지 않는다(카메라 바로 옆이라). 창 격자만.
  const t=.24,g=tagged(new THREE.BoxGeometry(ROOF.maxX-ROOF.minX+2*t,ROOF.depth-.06,ROOF.maxZ-ROOF.minZ+2*t).translate(0,base/2-.03,0),{seed:.37,base,height:ROOF.depth,type:1,color:'#cfc8bb'});
  const body=new THREE.Mesh(g,cityStyle.material);body.name='우리 건물';group.add(body);
 }
 const city=new THREE.Group();city.name='도심 원경';group.add(city);cityStyle.apply(city);
 {
  const r=rng(2026),geos=[],palette=['#d6d0c4','#c9c4ba','#e2e0da','#d8cbb0','#b98a72','#8aa6c0','#9fb3c4','#c7b9a3'];
  let seedN=0;
  const add=(x,z,w,d,h,type,color,rot=0)=>{seedN++;const seed=((seedN*.61803398)%1)||.5;
   const g=new THREE.BoxGeometry(w,h,d);if(rot)g.rotateY(rot);g.translate(x,base+h/2,z);geos.push(tagged(g,{seed,base,height:h,type,color}));
   // 옥상 설비(창 없음) 한두 개
   if(type!==4&&w>10&&r()<.6){const ew=2+r()*4,eh=1.5+r()*2.5,eg=new THREE.BoxGeometry(ew,eh,ew*(.6+r()*.6)).translate(x+(r()-.5)*w*.4,base+h+eh/2,z+(r()-.5)*d*.4);geos.push(tagged(eg,{seed,base:base+h,height:eh,type:4,color:'#c9c4ba'}));}};
  // 가까운 블록(24m 칸, 반경 220m): 옥상 바로 앞(-Z) 60m 안쪽은 우리보다 낮게 → 난간 너머로 도심이 펼쳐진다.
  const near=24,far=60,R1=220,R2=mobile?620:860;
  for(let gx=-R1;gx<=R1;gx+=near)for(let gz=-R1;gz<=R1;gz+=near){
   const cx=gx+(r()-.5)*5,cz=gz+(r()-.5)*5,d=Math.hypot(cx,cz);if(d>R1||(Math.abs(cx)<20&&Math.abs(cz)<18))continue;
   if(r()<.12)continue; // 빈 터·길
   const w=10+r()*11,dd=10+r()*11,front=cz<0&&Math.abs(cx)<-cz*1.1;
   let h=front&&d<70?18+r()*20:d<60?25+r()*45:20+r()*60+(r()<.15?50:0);
   const type=r()<.35?0:r()<.7?1:2;if(type===2)h=Math.min(h,22+r()*10);
   add(cx,cz,w,dd,h,type,palette[Math.floor(r()*palette.length)]);
  }
  // 먼 블록(60m 칸): 더 크고 높은 업무·아파트 단지. 가끔 고층 유리 타워.
  for(let gx=-R2;gx<=R2;gx+=far)for(let gz=-R2;gz<=R2;gz+=far){
   const cx=gx+(r()-.5)*14,cz=gz+(r()-.5)*14,d=Math.hypot(cx,cz);if(d<=R1+10||d>R2)continue;
   if(r()<.1)continue;
   const w=18+r()*24,dd=16+r()*24,tower=r()<.12,h=tower?110+r()*120:35+r()*80,type=tower?1:r()<.45?0:1;
   add(cx,cz,w,dd,h,type,tower?(r()<.5?'#8aa6c0':'#9fb3c4'):palette[Math.floor(r()*palette.length)],(r()-.5)*.3);
  }
  // 임시 재질로 넣으면 apply(city)가 도시 재질로 바꾸면서 밤 불빛 점·고층 빛무리를 붙인다(이미 도시 재질이면 건너뛴다).
  const m=new THREE.Mesh(mergeGeometries(geos),new THREE.MeshStandardMaterial());m.name='도심 건물';m.frustumCulled=false;city.add(m);geos.forEach(g=>g.dispose());
 }
 // 땅(도로 바닥): 원경 아래를 막는 어두운 판. 안개에 녹는다.
 {const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400).rotateX(-Math.PI/2).translate(0,base-.1,0),f.basic(new THREE.Color('#7b8088'),{name:'rooftop-street'}));ground.name='거리 바닥';group.add(ground);}

 world.add(group);

 const bounds={minX:ROOF.minX,maxX:ROOF.maxX,minZ:ROOF.minZ,maxZ:ROOF.maxZ};
 const spots={
  // 스폰: 옥상 가운데 앞쪽. -Z(부스·난간 너머 도심)를 보고 선다.
  spawn:{x:.6,z:3.4,heading:.12},
  ashtrays:ashtraySpots,
  benches:benchSpots,
  // 자판기 앞(앞면 +Z에서 0.45m, 자판기를 본다). outlet = 캔이 떨어지는 꺼내는 곳(월드).
  vending:{x:6.2,z:-1.39,heading:0,outlet:{x:6.18,y:.28,z:-1.8}},
 };
 // 난간 기대기(spots.js railSpot): 경계에서 inset만큼 안쪽에 서고, 손은 콘크리트 턱 윗면(cap, 경계에서 바깥으로 0~0.27m)에 올린다.
 const rail={inset:.22,cap:ROOF.parapet+.05,ledge:.12,top:ROOF.rail,mid:(ROOF.parapet+.05+ROOF.rail)/2};
 // 카메라 천장: 부스 지붕(처마 포함) 아래면 지붕 아랫면보다 조금 낮게. 그 밖은 제한 없음.
 const ceilingAt=(x,z)=>x>BOOTH.minX-.3&&x<BOOTH.maxX+.3&&z>BOOTH.minZ-.3&&z<BOOTH.maxZ+.3?BOOTH.roof-.12:99;

 let lit=-1;
 function update(dt,env={}){
  // 불빛: 해 고도 3°부터 켜지기 시작해 -8°에서 다 켜진다(도심 창 불빛 city.js와 같은 규칙).
  const el=Number.isFinite(env.elevation)?env.elevation:30,t=clamp01((3-el)/11),k=Math.max(env.night??0,t*t*(3-2*t));
  if(Math.abs(k-lit)<.002)return;lit=k;
  for(const g of glowMats)g.m.emissiveIntensity=g.day+(g.night-g.day)*k;
  for(const p of lamps)p.l.intensity=p.power*k;
 }
 update(0,{});

 return {group,bounds,colliders,spots,rail,ceilingAt,update,city:cityStyle};
}
