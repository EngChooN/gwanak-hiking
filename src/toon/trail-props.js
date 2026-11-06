// 자동걷기 즐길거리 형상(2026-11-06 대표 승인 시안 → 게임): 산스장·벤치·등산화 먼지털이기·다람쥐·산고양이·까치와 손에 드는 소품.
// 모양·색·크기는 시안(props-concepts.js)과 같고, 시안도 이 파일의 함수를 그대로 쓴다(형상 한 벌).
// 텍스처 없이 단색 + 툰 재질이다. 글자판(간판 3장)만 작은 캔버스 글자를 쓴다(합계 약 0.6MB).
// 게임에서는 종류마다 원형을 한 번 만들고(trailPropTemplate) clone(true)로 형상·재질을 나눠 쓴다.
import * as THREE from 'three';
import {v,ell,capsule,noodle,sweep,at,part,surf,decal,eye,smile,grp} from './concept-kit.js';

const {Quaternion}=THREE;
// toonify 뒤에 붙일 것(글자판·효과선). toonify가 MeshBasic을 툰 재질로 바꾸지 않게 따로 모았다가 finishTrailModel/runLate에서 붙인다.
const late=[];
export const runLate=()=>{const list=late.splice(0);for(const f of list)f();};

// ── 형상 도우미
export function rod(parent,a,b,r,color,o={}){const d=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,d.length(),o.radial??12);
 g.applyQuaternion(new Quaternion().setFromUnitVectors(v(0,1,0),d.normalize()));const m=a.clone().add(b).multiplyScalar(.5);g.translate(m.x,m.y,m.z);return part(parent,g,color,o);}
export const boxAt=(parent,size,p,color,o={})=>{const m=part(parent,new THREE.BoxGeometry(size.x,size.y,size.z),color,o);m.position.copy(p);if(o.rot)m.rotation.set(...o.rot);return m;};
// 글자판. px = 캔버스 높이(게임은 작게 128~192px, 시안은 512px).
export function textPlane(parent,lines,w,h,{bg='#6b4a2f',fg='#fbf0d8',p=v(),rot=[0,0,0],size=.36,border=null,px=512}={}){
 late.push(()=>{if(typeof document==='undefined')return;const c=document.createElement('canvas'),H=px;c.width=Math.round(H*w/h);c.height=H;const g=c.getContext('2d');
  g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);if(border){g.strokeStyle=border;g.lineWidth=H*.043;g.strokeRect(H*.035,H*.035,c.width-H*.07,c.height-H*.07);}
  g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';
  lines.forEach((l,i)=>{const s=(i===0?size:size*.55)*H;g.font=`900 ${s}px 'Apple SD Gothic Neo',system-ui,sans-serif`;g.fillText(l,c.width/2,H*(lines.length===1?.5:i===0?.38:.38+i*.27));});
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,toneMapped:false}));m.position.copy(p);m.rotation.set(...rot);m.userData.textPlane=true;parent.add(m);});
}
// 흰 바람 줄(앞으로 빨리 갈 때·에어건 바람). 상자 n개, 원점 기준 dir 쪽으로 뻗는다.
export function speedLines(parent,origin,dir,n,len,spread){const g=new THREE.Group();g.name='speed-lines';g.position.copy(origin);parent.add(g);
 late.push(()=>{const m=lineWhite();for(let i=0;i<n;i++){const y=((i*.618)%1-.5)*spread,z=((i*.381)%1-.5)*spread*.6,l=len*(.6+((i*.27)%1)*.8);
  const mm=new THREE.Mesh(unitBox,m);mm.scale.set(l,.012,.012);mm.position.set(dir*(l/2+((i*.53)%1)*.35),y,z);g.add(mm);}});return g;}
const unitBox=new THREE.BoxGeometry(1,1,1);let whiteMat=null;const lineWhite=()=>whiteMat??=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false,transparent:true,depthWrite:false});
export function heart(parent,p,s,color='#ff5d7a'){const sh=new THREE.Shape();sh.moveTo(0,-.5);sh.bezierCurveTo(-.15,-.3,-.6,-.1,-.5,.22);sh.bezierCurveTo(-.4,.55,-.05,.5,0,.25);sh.bezierCurveTo(.05,.5,.4,.55,.5,.22);sh.bezierCurveTo(.6,-.1,.15,-.3,0,-.5);
 const g=new THREE.ExtrudeGeometry(sh,{depth:.25,bevelEnabled:true,bevelSize:.06,bevelThickness:.06,bevelSegments:2,curveSegments:8});g.center();g.scale(s,s,s);const m=part(parent,g,color,{line:.5});m.position.copy(p);return m;}
export function drop(parent,p,s,color='#7cc7f2'){const m=part(parent,ell(v(s*.7,s,s*.7),{w:12,h:10,shape:V=>{if(V.y>0){V.x*=1-V.y*.75;V.z*=1-V.y*.75;}}}),color,{line:.4});m.position.copy(p);return m;}
export function puff(parent,p,r,color='#d8c29c'){const m=part(parent,ell(v(r,r*.85,r),{w:14,h:10}),color,{line:.6});m.position.copy(p);return m;}
// ⑥ 다리에 쥐: 종아리에 튀는 "찌릿" 번개(시안 cramp)
export function zap(parent,p,s,color='#ffd23f'){const sh=new THREE.Shape();[[0,.5],[.18,.1],[.05,.1],[.22,-.5],[-.12,-.02],[.02,-.02],[-.1,.5]].forEach(([x,y],i)=>i?sh.lineTo(x,y):sh.moveTo(x,y));
 const g=new THREE.ExtrudeGeometry(sh,{depth:.12,bevelEnabled:false});g.center();g.scale(s,s,s);const m=part(parent,g,color,{line:.5});m.position.copy(p);return m;}
export function sparkle(parent,p,s,color='#fff4a8'){const g=new THREE.OctahedronGeometry(s,0);g.scale(.35,1,.35);const m=part(parent,g,color,{line:0,glow:true,shadow:false});m.position.copy(p);
 const m2=part(m,new THREE.OctahedronGeometry(s,0).scale(1,.35,.35),color,{line:0,glow:true,shadow:false});m2.userData.line=0;return m;}

// ── 손에 드는 소품
export function chocolate(){const g=new THREE.Group();g.name='chocolate';
 const bar=part(g,new THREE.BoxGeometry(.14,.022,.075),'#5a3324',{line:.5});bar.position.set(.03,0,0);
 for(let i=0;i<3;i++)for(let k=0;k<2;k++){const c=part(g,new THREE.BoxGeometry(.03,.008,.026),'#6e4030',{line:0});c.position.set(.0+i*.036,.014,-.017+k*.034);}
 const foil=part(g,new THREE.BoxGeometry(.07,.026,.08),'#e2b84a',{line:.5});foil.position.set(-.06,0,0);
 const label=part(g,new THREE.BoxGeometry(.05,.028,.082),'#d9473e',{line:0});label.position.set(-.07,0,0);return g;}
// 시멘트 역기(봉 + "20" 원판 둘). 가운데가 원점, 봉은 x축.
export function barbell({label=true}={}){const g=new THREE.Group();g.name='barbell';rod(g,v(-.8,0,0),v(.8,0,0),.018,'#c9ccd0');
 for(const x of [-.7,.7])part(g,new THREE.CylinderGeometry(.2,.2,.14,20).rotateZ(Math.PI/2).translate(x,0,0),'#aaa59c');
 if(label)textPlane(g,['20'],.12,.12,{bg:'#aaa59c',fg:'#5d5850',p:v(.775,0,0),rot:[0,Math.PI/2,0],size:.6,px:96});return g;}
// 에어건(손잡이 + 노란 노즐). 원점 = 쥐는 곳, 노즐은 -y 아래 +z 앞.
export function airGun(){const g=new THREE.Group();g.name='air-gun';rod(g,v(0,0,0),v(0,-.09,.0),.018,'#262626');rod(g,v(0,-.01,0),v(0,-.03,.11),.012,'#e3b23c');return g;}

// ── 벤치: 나무 판 3장·등받이 2장·초록 철다리. 앞 +Z, 좌석 높이 0.42m·길이 1.5m.
export const BENCH=Object.freeze({seatY:.4375,length:1.5,seatZ:0,depth:.4});
export function bench(){const g=new THREE.Group(),wood='#b07a4a',iron='#3e5b48';g.name='bench';
 for(let i=0;i<3;i++)boxAt(g,v(1.5,.035,.12),v(0,.42,-.14+i*.135),wood);
 for(let i=0;i<2;i++)boxAt(g,v(1.5,.035,.11),v(0,.62+i*.16,-.24),wood,{rot:[.22,0,0]});
 for(const x of [-.62,.62]){boxAt(g,v(.05,.4,.05),v(x,.2,.12),iron);boxAt(g,v(.05,.86,.05),v(x,.43,-.22),iron,{rot:[.12,0,0]});boxAt(g,v(.05,.05,.42),v(x,.4,-.03),iron);}
 return g;}

// ── 동물. 앞 +Z, 발바닥 0.
export function squirrel(){const g=new THREE.Group(),fur='#b9733b',belly='#f4e1c2',dark='#4a2e1b';g.name='squirrel';
 const bc=v(0,.085,0),br=v(.058,.078,.06);part(g,at(ell(br),bc),fur);
 decal(g,bc,br,0,-.05,v(.034,.05,.01),belly);for(const a of [Math.PI,Math.PI-.42,Math.PI+.42])decal(g,bc,br,a,.15,v(.009,.06,.006),a===Math.PI?dark:'#e9d2a8');
 const head=grp(g,v(0,.19,.02));head.name='head';const hc=v(),hr=v(.058,.054,.055);part(head,at(ell(hr),hc),fur);
 for(const s of [-1,1]){eye(head,hc,hr,s*.55,.05,v(.015,.019,.006));decal(head,hc,hr,s*.55,.18,v(.02,.006,.005),belly);
  part(head,at(ell(v(.017,.026,.012)),v(s*.035,.055,-.02)),fur);decal(head,hc,hr,s*.62,-.35,v(.022,.016,.006),belly);}
 surf(head,hc,hr,0,-.12,ell(v(.009,.007,.006)),dark,{lift:.002});
 for(const s of [-1,1]){part(g,capsule(v(s*.03,.1,.04),v(s*.012,.075,.075),.012),fur);part(g,at(ell(v(.025,.022,.045)),v(s*.035,.012,.02)),fur);}
 const tail=grp(g,v(0,.04,-.05));tail.name='tail';
 part(tail,sweep([v(0,0,0),v(0,.04,-.08),v(0,.16,-.1),v(0,.25,-.04),v(0,.24,.02)],u=>.022+.03*Math.sin(Math.PI*Math.min(1,u*1.15)),{rings:24,radial:10}),'#a8642f');
 return g;}
export function acorn(){const g=new THREE.Group();g.name='acorn';part(g,at(ell(v(.016,.02,.016),{w:10,h:8}),v(0,-.008,0)),'#b5813f',{line:.4});part(g,at(ell(v(.018,.01,.018),{w:10,h:6}),v(0,.01,0)),'#6e4a2a',{line:.4});return g;}
export function cat({belly=false}={}){const g=new THREE.Group(),fur='#f0a24a',str='#cf7a2a',white='#fff4e4';g.name=belly?'cat-belly':'cat';
 if(!belly){const bc=v(0,.13,0),br=v(.105,.13,.115);part(g,at(ell(br),bc),fur);decal(g,bc,br,0,.05,v(.06,.08,.015),white);
  for(const a of [2.5,3.14,3.78])decal(g,bc,br,a,.35,v(.012,.05,.01),str);
  for(const s of [-1,1]){const paw=part(g,capsule(v(s*.045,.1,.07),v(s*.045,.02,.09),.026),fur);if(s>0)paw.name='paw';}
  const tail=grp(g,v(.08,.03,-.07));tail.name='tail';part(tail,noodle([v(0,0,0),v(.06,-.01,.09),v(.02,-.01,.19),v(-.05,-.005,.22)],.02),fur);
  const head=grp(g,v(0,.31,.04));head.name='head';catHead(head,v(),fur,white,str);}
 else{const bc=v(0,.1,0),br=v(.105,.1,.17);part(g,at(ell(br),bc),fur);decal(g,bc,br,0,1.4,v(.07,.1,.015),white,{line:0});
  for(const [s,z] of [[-1,.08],[1,.08],[-1,-.09],[1,-.09]]){const paw=part(g,capsule(v(s*.06,.16,z),v(s*.07+s*.02*Math.sign(z),.24,z+.02*Math.sign(z)),.024),fur);if(s>0&&z>0)paw.name='paw';}
  part(g,noodle([v(0,.08,-.16),v(.1,.06,-.24),v(.18,.07,-.22)],.02),fur);
  const h=grp(g,v(0,.13,.22));h.rotation.x=-1.3;h.name='head';catHead(h,v(),fur,white,str,true);}
 return g;}
function catHead(g,c,fur,white,str,happy=false){const r=v(.1,.085,.085);part(g,at(ell(r),c),fur);
 for(const s of [-1,1]){part(g,new THREE.ConeGeometry(.035,.06,4).rotateY(Math.PI/4).translate(c.x+s*.058,c.y+.08,c.z),fur);
  if(happy)surf(g,c,r,s*.38,.1,smile(.012,.0035,Math.PI*.9).rotateZ(Math.PI),'#2a2321',{lift:.002});else eye(g,c,r,s*.38,.1,v(.018,.022,.006),{color:'#3d4a1f'});}
 decal(g,c,r,0,-.2,v(.045,.03,.012),white);surf(g,c,r,0,-.12,ell(v(.009,.006,.005)),'#f08aa0',{lift:.002});
 for(const a of [-.25,0,.25])decal(g,c,r,a,.55,v(.008,.025,.005),str);surf(g,c,r,0,-.3,smile(.01,.003),'#2a2321',{lift:.001});}
// 까치. 원점 = 몸 가운데(앉은 모습은 발끝이 -0.085m). 날개는 'wing-L'·'wing-R' Group(rotation.z로 퍼덕임).
export const MAGPIE_FOOT=.085;
export function magpie({fly=false}={}){const g=new THREE.Group(),blk='#1d2333',wht='#f4f4f0',teal='#2f5d7a';g.name='magpie';
 const bc=v(0,0,0),br=v(.045,.048,.1);part(g,at(ell(br),bc),blk);decal(g,bc,br,0,-1.2,v(.04,.05,.01),wht);
 for(const s of [-1,1])decal(g,bc,br,s*1.4,.1,v(.045,.025,.01),wht);
 const hc=v(0,.04,.1),hr=v(.036,.034,.036);part(g,at(ell(hr),hc),blk);for(const s of [-1,1])eye(g,hc,hr,s*.7,.1,v(.008,.009,.004),{color:'#0e0f14'});
 part(g,new THREE.ConeGeometry(.012,.04,6).rotateX(Math.PI/2).translate(0,.035,.155),'#2a2a2a',{line:.4});
 part(g,at(ell(v(.025,.006,.13)),v(0,.015,-.19)),teal);
 for(const s of [-1,1]){const w=grp(g,v(s*.035,.02,.0));w.name=s<0?'wing-R':'wing-L';const wg=at(ell(v(.14,.008,.055)),v(s*.12,0,0));part(w,wg,blk);
  part(w,at(ell(v(.05,.01,.035)),v(s*.17,0,0)),wht,{line:0});w.rotation.z=fly?s*.55:s*1.45;if(!fly)w.position.y=-.01;}
 const feet=grp(g);feet.name='feet';for(const s of [-1,1])rod(feet,v(s*.015,-.04,0),v(s*.015,-.085,.01),.004,'#2a2a2a',{line:0});feet.visible=!fly;
 return g;}
// 영혼(웃는 하얀 물방울). 원점 = 입, 몸통은 위로 0.6m 남짓. 'soul-body'가 떠 있는 몸, 'soul-tail'이 입에서 이어지는 꼬리.
export function soul(parent,from=v(),to=v(-.38,.59,-.03)){const g=grp(parent);g.name='soul';const r=v(.075,.1,.06),c=to.clone();
 const body=grp(g);body.name='soul-body';
 part(body,at(ell(r,{shape:V=>{if(V.y<0){V.x*=1+V.y*.4;V.z*=1+V.y*.4;}}}),c),'#f6fbff',{line:.5});
 for(const s of [-1,1])decal(body,c,r,s*.3,.15,v(.008,.012,.004),'#2a2321');surf(body,c,r,0,-.05,smile(.01,.003),'#2a2321',{lift:.001});
 const tail=part(g,noodle([from,from.clone().lerp(to,.35).add(v(.06,0,0)),from.clone().lerp(to,.7).add(v(-.05,0,0)),to.clone().add(v(0,-.08,0))],.012),'#f6fbff',{line:.4});tail.name='soul-tail';return g;}

// ── 산스장 기구(바닥 흙 원판 반지름 3.4m, 가운데 원점). 움직이는 부분 이름: hula·waist-plate·inversion·inversion-board·barbell·radio.
export const GYM=Object.freeze({radius:3.4,center:[0,-.3],bar:{x:[-1.95,-.85],z:-1.3,y:1.85},waist:{x:.35,z:-1.5,top:.195},inversion:{x:1.75,z:-.85,yaw:-.5,pivot:1.05,tilt:.55},lift:{x:-.6,z:.35,y:.6},radio:{x:1.4,z:.75}});
export function gym(g){
 part(g,new THREE.CircleGeometry(3.4,40).rotateX(-Math.PI/2).translate(0,.006,-.3),'#c2a57a',{line:0});
 // 간판
 {const k=grp(g,v(-2.55,0,.2));k.rotation.y=.75;for(const x of [-.65,.65])rod(k,v(x,0,0),v(x,1.6,0),.05,'#7a5233');
  boxAt(k,v(1.55,.55,.06),v(0,1.3,0),'#7a5233');textPlane(k,['관악 산스장','다 쓰면 제자리 · 오늘도 득근'],1.45,.47,{p:v(0,1.3,.035),size:.38,px:160});}
 // 철봉 + 훌라후프
 for(const x of [-1.95,-.85])rod(g,v(x,0,-1.3),v(x,1.95,-1.3),.045,'#3f8f5a');rod(g,v(-1.95,1.85,-1.3),v(-.85,1.85,-1.3),.022,'#d6d8dc');
 {const h=part(g,new THREE.TorusGeometry(.4,.016,8,40),'#ec5b86',{line:.5});h.position.set(-1.15,1.44,-1.3);h.name='hula';}
 // 허리돌리기(돌림판)
 {const t=grp(g,v(.35,0,-1.5));rod(t,v(0,0,0),v(0,1.15,0),.04,'#e3b23c');
  const wheel=grp(t,v(0,1.15,0));wheel.name='waist-wheel';part(wheel,new THREE.TorusGeometry(.28,.025,8,32).rotateX(Math.PI/2),'#e3b23c');
  for(const a of [0,Math.PI/2])rod(wheel,v(Math.cos(a)*.28,0,Math.sin(a)*.28),v(-Math.cos(a)*.28,0,-Math.sin(a)*.28),.015,'#e3b23c');
  const plate=grp(t);plate.name='waist-plate';part(plate,new THREE.CylinderGeometry(.32,.34,.07,32).translate(0,.16,0),'#e3b23c');part(t,new THREE.CylinderGeometry(.36,.4,.1,32).translate(0,.05,0),'#8c8f93');
  for(const [x,z,r] of [[.12,.08,.05],[-.15,.12,.035],[.05,-.18,.045]])part(plate,new THREE.CylinderGeometry(r,r,.075,12).translate(x,.162,z),'#b86a33',{line:0});}
 // 거꾸리
 {const t=grp(g,v(1.75,0,-.85));t.rotation.y=-.5;t.name='inversion';for(const s of [-1,1]){rod(t,v(s*.32,0,-.45),v(s*.3,1.05,0),.035,'#2f6fb0');rod(t,v(s*.32,0,.45),v(s*.3,1.05,0),.035,'#2f6fb0');}
  rod(t,v(-.32,1.05,0),v(.32,1.05,0),.025,'#cfd2d6');const b=grp(t,v(0,1.05,0));b.rotation.x=.55;b.name='inversion-board';boxAt(b,v(.42,1.5,.05),v(0,.05,-.06),'#e6dcc8');rod(b,v(-.15,-.66,.03),v(.15,-.66,.03),.03,'#d9473e');}
 // 시멘트 역기(받침 + 봉)
 {const t=grp(g,v(-.6,0,.35));t.name='lift-rack';for(const x of [-.5,.5]){rod(t,v(x,0,0),v(x,.55,0),.035,'#3f8f5a');part(t,new THREE.TorusGeometry(.05,.012,6,12,Math.PI).rotateZ(Math.PI).translate(x,.6,0),'#3f8f5a',{line:.5});}
  const b=barbell();b.position.set(0,.6,0);t.add(b);}
 // 타이어 둘 + 라디오
 for(const [x,y] of [[1.35,.09],[1.4,.27]])part(g,new THREE.TorusGeometry(.3,.085,10,24).rotateX(Math.PI/2).translate(x,y,.75),'#45464d');
 {const r=grp(g,v(1.4,.36,.75));r.rotation.y=-.6;r.name='radio';boxAt(r,v(.26,.15,.09),v(0,.075,0),'#c8452f');part(r,new THREE.CylinderGeometry(.045,.045,.01,16).rotateX(Math.PI/2).translate(-.06,.075,.046),'#2b2b2b',{line:0});
  boxAt(r,v(.08,.05,.01),v(.06,.1,.046),'#f1e6c8',{line:0});rod(r,v(.1,.15,0),v(.2,.42,-.02),.004,'#cfd2d6',{line:0});}
 return g;
}
// ── 등산화 먼지털이기(철기둥 1.25m·파란 안내판·노란 꼬불 호스·발판 철망). 원점 = 기둥 밑, 앞 +Z(안내판 쪽).
// 'hose-anchor' = 호스가 기둥에서 나오는 점, 'nozzle-rest' = 에어건 걸이.
export const AIRGUN=Object.freeze({column:[0,0],mat:{x:.55,z:.45,w:1.2,d:.8},stand:[.95,.62],hoseFrom:[-.0,.55,.13]});
export function airgunStation(){const s=new THREE.Group();s.name='airgun-station';
 boxAt(s,v(1.2,.04,.8),v(.55,.02,.45),'#4a4f55');for(let i=0;i<6;i++)boxAt(s,v(1.1,.012,.03),v(.55,.045,.15+i*.12),'#6c737b',{line:0});
 boxAt(s,v(.32,1.25,.24),v(0,.625,0),'#c3c8ce');boxAt(s,v(.36,.06,.28),v(0,1.27,0),'#8d939a');
 textPlane(s,['에어건 먼지털이기','신발 먼지를 털어 주세요'],.3,.17,{bg:'#2f6fb0',fg:'#ffffff',p:v(0,1.0,.121),size:.25,px:128});
 part(s,new THREE.CylinderGeometry(.045,.045,.015,20).rotateX(Math.PI/2).translate(0,.62,.125),'#f4f4ef',{line:.4});
 const a=grp(s,v(...AIRGUN.hoseFrom));a.name='hose-anchor';
 const rest=grp(s,v(.17,.82,.1));rest.name='nozzle-rest';const gun=airGun();gun.rotation.set(0,0,.2);rest.add(gun);
 // 걸어 둔 호스(기둥 옆으로 꼬불꼬불 늘어진 모양)
 const hose=part(s,noodle([v(0,.55,.13),v(.12,.35,.16),v(.2,.5,.15),v(.24,.68,.12),v(.18,.8,.1)],.016),'#f2c14e',{line:.5});hose.name='hose-rest';
 return s;}
// 걸어 다니는 호스(에어건을 든 동안 기둥~손을 잇는다). 매 프레임 setHose(mesh,from,to)로 형상을 다시 만든다(꼭짓점 약 300개).
export function setHose(mesh,a,b){const mid=a.clone().lerp(b,.5),sag=Math.max(.05,.35-a.distanceTo(b)*.2);
 const pts=[a,a.clone().lerp(b,.25).add(v(0,-sag*.9,0)),mid.clone().add(v(.05,-sag,0)),a.clone().lerp(b,.75).add(v(-.03,-sag*.6,0)),b];
 const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),14,.016,6,false);mesh.geometry.dispose();mesh.geometry=g;
 if(mesh.userData.outlineMesh){mesh.userData.outlineMesh.geometry=g;}}

// ── 외곽선: 카툰 낮 외곽선은 꺼져 있어(캐릭터와 같게) 뒤집은 껍질로 얇은 선을 긋는다. 시안과 같은 두께·색.
const lineMats=new Map();
export function lineMat(w){const k=w.toFixed(5);if(!lineMats.has(k)){const m=new THREE.MeshBasicMaterial({color:'#2e2420',side:THREE.BackSide});
 m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed+=normalize(normal)*${k};`);};m.customProgramCacheKey=()=>'concept-line-'+k;m.userData.shared=true;lineMats.set(k,m);}return lineMats.get(k);}
// 툰 재질로 바꾸고 외곽선 껍질·글자판을 붙인다. toonify = createToonStyle의 toonify.
export function finishTrailModel(g,toonify,{shadow=true,lineScale=1}={}){
 toonify?.(g,{kind:'character'});const list=[];g.traverse(o=>{if(o.isMesh&&o.userData.line>0)list.push(o);});
 for(const o of list){const l=new THREE.Mesh(o.geometry,lineMat(.0072*o.userData.line*lineScale));l.userData.outline=true;l.castShadow=false;l.name='outline';o.add(l);o.userData.outlineMesh=l;}
 g.traverse(o=>{if(o.isMesh&&!o.userData.outline){o.castShadow=shadow&&o.userData.line>0;o.receiveShadow=true;}});runLate();return g;}

// ── 게임 원형(종류마다 한 번 만들고 clone(true)로 나눠 쓴다). 형상·재질은 공유되므로 인스턴스를 지울 때 dispose하지 않는다.
export const TRAIL_PROP_KINDS=Object.freeze(['gym','bench','airgun','squirrel','cat','cat-belly','magpie','magpie-fly','acorn','chocolate','barbell','air-gun','soul','heart','puff','breath','drop','sparkle','zap','footing']);
const templates=new Map();
export function trailPropTemplate(kind,toonify){
 if(templates.has(kind))return templates.get(kind);
 let g=new THREE.Group();
 if(kind==='gym')gym(g);else if(kind==='bench')g=bench();else if(kind==='airgun')g=airgunStation();
 else if(kind==='squirrel')g=squirrel();else if(kind==='cat')g=cat();else if(kind==='cat-belly')g=cat({belly:true});
 else if(kind==='magpie')g=magpie();else if(kind==='magpie-fly')g=magpie({fly:true});else if(kind==='acorn')g=acorn();
 else if(kind==='chocolate')g=chocolate();else if(kind==='barbell')g=barbell();else if(kind==='air-gun')g=airGun();
 else if(kind==='footing')boxAt(g,v(.1,1,.1),v(0,-.5,0),'#8f8b82',{line:.4}); // 경사에 놓인 벤치 다리 밑 받침돌(높이는 scale.y)
 else if(kind==='soul')soul(g);else if(kind==='heart')heart(g,v(),1);else if(kind==='puff')puff(g,v(),1);else if(kind==='breath')puff(g,v(),1,'#ffffff');else if(kind==='zap')zap(g,v(),1);else if(kind==='drop')drop(g,v(),1);else if(kind==='sparkle')sparkle(g,v(),1);
 else throw new Error(`즐길거리 형상 없음: ${kind}`);
 g.name=g.name||kind;finishTrailModel(g,toonify,{shadow:!['heart','puff','breath','drop','sparkle','zap','soul'].includes(kind)});g.userData.trailKind=kind;templates.set(kind,g);return g;}
export const makeTrailProp=(kind,toonify)=>{const c=trailPropTemplate(kind,toonify).clone(true);c.traverse(o=>{if(o.isMesh&&o.children.length){const l=o.children.find(x=>x.userData.outline);if(l)o.userData.outlineMesh=l;}});return c;};
// 형상 통계(테스트·메모리 확인용): 원형별 삼각형 수
export function trailPropTriangles(kind,toonify){let n=0;trailPropTemplate(kind,toonify).traverse(o=>{if(o.isMesh&&!o.userData.outline){const g=o.geometry;n+=(g.index?g.index.count:g.attributes.position.count)/3;}});return n;}
