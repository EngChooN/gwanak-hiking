// 귀여운 카툰 캐릭터 시안 5종 + 덤 1종(vite dev: /src/toon/mascot-concepts.html). 실제 게임과 같은 createToonStyle(툰 음영·외곽선·색보정)로 그린다.
// 시안 확인용이라 뼈대 없이 부위별 Group을 돌려 걷기·서기를 흉내 낸다. 채택안이 정해지면 link-hiker.js처럼 Mixamo 뼈대에 다시 입힌다.
// ?c=-1(전체)|0~5&view=front|three|side|back&walk=0|1&t=초(고정)&hud=0&ref=1(전체 보기에 지금 등산객 함께)
import * as THREE from 'three';
import {createToonStyle} from './index.js';
import {composeEnvironment} from '../daytime.js';
import {loadToonHiker} from './link-hiker.js';
import {v,smoothGeo,ell,box,capsule,noodle,sweep,at,mat,part,surf,decal,eye,smile,omega,grp,blink,dongdong} from './concept-kit.js';

const {Vector3,Quaternion}=THREE;
const q=new URLSearchParams(location.search);
if(q.get('hud')==='0')document.getElementById('panel').remove();

// ── 2안: 콩알 대원 「콩이」 머리=몸 젤리빈, 1.45m. PEAK·폴가이즈처럼 흐느적거리는 국수 팔다리·점눈·레인저 모자.
function kongi(){
 const C={skin:'#ffe2c2',shirt:'#ffcf4a',belt:'#8a5a3b',shorts:'#4f6d3a',scarf:'#e5484d',hat:'#4f6d3a',band:'#3a2a20',bag:'#8a5a3b',shoe:'#8a5a3b',dot:'#2a2321',blush:'#f6a28e',mouth:'#8a3f33',woggle:'#f2c14e'};
 const root=new THREE.Group(),body=grp(root,v(0,.2,0)); // body 원점 = 엉덩이 높이
 const legs=[-1,1].map(s=>{const g=grp(body,v(s*.12,.02,0));part(g,capsule(v(0,0,0),v(0,-.14,0),.033),C.skin);part(g,at(ell(v(.068,.046,.1)),v(0,-.175,.03)),C.shoe);return g;});
 const bean=grp(body);const bc=v(0,.56,0);
 part(bean,smoothGeo(at(new THREE.CapsuleGeometry(.3,.56,12,32,60),bc)),V=>V.y>.69?C.skin:V.y>.36?C.shirt:V.y>.31?C.belt:C.shorts);
 // 얼굴(원통부 위쪽)
 const fc=v(0,.82,0),fr=v(.3,.3,.3);
 const eyes=[-1,1].map(s=>eye(bean,fc,fr,s*.3,0,v(.025,.03,.012),{shine:1}));
 for(const s of [-1,1])decal(bean,fc,fr,s*.55,-.1,v(.045,.022,.01),C.blush);
 surf(bean,fc,fr,0,-.17,smile(.04,.006,Math.PI*.7),C.mouth,{lift:.002});
 // 목도리(스카우트 네커치프)와 고리
 part(bean,at(new THREE.TorusGeometry(.302,.024,8,40).rotateX(Math.PI/2),v(0,.68,0)),C.scarf,{line:.7});
 {const g=new THREE.ConeGeometry(.1,.17,3);g.rotateX(Math.PI);g.scale(1,1,.25);g.rotateY(Math.PI);part(bean,at(g,v(0,.58,.29)),C.scarf,{line:.7});part(bean,at(ell(v(.03,.03,.02)),v(0,.65,.31)),C.woggle,{line:.6});}
 // 가방끈과 옆 가방
 part(bean,noodle([v(-.21,.72,.22),v(0,.52,.31),v(.21,.32,.22)],.016),C.bag,{line:.5});
 part(bean,at(ell(v(.1,.085,.045),{shape:box(.55,.7)}),v(.27,.26,.13)),C.bag);
 // 레인저 모자
 const hat=grp(bean,v(0,1.05,0));hat.rotation.set(-.08,0,.07);
 part(hat,new THREE.CylinderGeometry(.42,.42,.02,40).translate(0,0,0),C.hat);
 {const g=new THREE.CylinderGeometry(.17,.235,.19,4*8,4),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i),a=Math.atan2(x,z),pinch=1-.12*Math.max(0,Math.cos(a*4))*THREE.MathUtils.smoothstep(y,-.02,.095);p.setXYZ(i,x*pinch,y,z*pinch);}
  g.translate(0,.1,0);part(hat,smoothGeo(g),C.hat);part(hat,new THREE.CylinderGeometry(.236,.236,.04,32,1,true).translate(0,.03,0),C.band,{line:.6});part(hat,at(ell(v(.17,.03,.17)),v(0,.19,0)),C.hat);}
 const arms=[-1,1].map(s=>{const g=grp(bean,v(s*.27,.66,0));
  part(g,at(ell(v(.06,.065,.06)),v(s*.02,-.02,0)),C.shirt);
  const pts=[v(0,0,0),v(s*.06,-.13,.01),v(s*.075,-.3,.02),v(s*.06,-.44,.02)];
  part(g,noodle(pts,.026),C.skin);part(g,at(ell(v(.05,.05,.05)),pts[3]),C.skin);return g;});
 return {root,h:1.45,w:.95,update(t,walk){
  const s=t*Math.PI*2*1.05,k=walk;
  legs.forEach((g,i)=>g.rotation.x=k*Math.sin(s+i*Math.PI)*.8);
  bean.rotation.z=k*Math.sin(s)*.14+(1-k)*Math.sin(t*1.3)*.03;bean.rotation.y=k*Math.sin(s)*.08;
  const land=k*Math.max(0,Math.cos(2*s))**3;body.scale.set(1+land*.04,1-land*.07,1+land*.04);body.position.y=.2+k*Math.abs(Math.sin(s))*.03;
  arms.forEach((g,i)=>{const sd=i?1:-1;g.rotation.x=-k*Math.sin(s+i*Math.PI-.6)*.65;g.rotation.z=sd*(k*Math.abs(Math.sin(s-.4))*.22+.05+(1-k)*Math.sin(t*1.3+i)*.04);});
  hat.rotation.z=.07+k*Math.sin(s-.9)*.06;blink(eyes,t,1.3);
 }};
}

// ── 3안: 해태 꼬마 「해치」 가로로 넓은 2등신, 0.9m. 관악산 화기를 막으려 광화문에 세웠다는 해태. 단청 주홍 갈기·금방울.
function haechi(){
 const C={body:'#f3e3c3',belly:'#fff4e2',mane:'#e0533a',maneDark:'#b9402c',gold:'#f2b33d',teal:'#2f8f83',nose:'#6b3b2e',blush:'#f2a08a',inner:'#f2b6a6',dark:'#2a2321'};
 const root=new THREE.Group(),body=grp(root);
 const legs=[-1,1].map(s=>{const g=grp(body,v(s*.115,.13,0));part(g,at(ell(v(.08,.085,.09)),v(0,-.05,.015)),C.body);
  for(const k of [-1,0,1])part(g,at(ell(v(.016,.012,.01)),v(k*.03,-.085,.1)),C.maneDark,{line:0});return g;});
 const torso=grp(body);
 part(torso,at(ell(v(.23,.2,.2),{shape:V=>{if(V.y<0){V.x*=1+.1*-V.y;V.z*=1+.06*-V.y;}}}),v(0,.27,0)),C.body);
 const tc=v(0,.27,0),tr=v(.23,.2,.2);
 decal(torso,tc,tr,0,-.15,v(.14,.13,.03),C.belly);
 for(const s of [-1,1]){decal(torso,tc,tr,s*1.25,.05,v(.06,.022,.01),C.teal,{roll:s*.3});decal(torso,tc,tr,s*1.35,-.2,v(.045,.018,.01),C.teal,{roll:s*.2});}
 part(torso,at(new THREE.TorusGeometry(.16,.028,10,28).rotateX(Math.PI/2+.15),v(0,.43,.0)),C.teal,{line:.7});
 const bell=grp(torso,v(0,.42,.17));part(bell,at(ell(v(.045,.045,.045)),v(0,-.04,0)),C.gold);part(bell,at(ell(v(.025,.006,.006)),v(0,-.055,.042)),C.nose,{line:0});
 const tail=grp(torso,v(0,.22,-.17));
 [[0,0,0,.06],[0,.09,-.06,.075],[0,.2,-.05,.085],[0,.27,.02,.065]].forEach(([x,y,z,r])=>part(tail,at(ell(v(r,r,r)),v(x,y,z)),C.mane));
 const arms=[-1,1].map(s=>{const g=grp(torso,v(s*.205,.36,.02));g.rotation.z=s*.25;part(g,at(ell(v(.065,.1,.068)),v(0,-.07,.01)),C.body);return g;});
 const head=grp(torso,v(0,.42,0)),hc=v(0,.2,0),hr=v(.3,.235,.25);
 // 갈기: 얼굴 둘레 고리 + 뒤통수
 const mane=grp(head);
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2,bottom=Math.cos(a)<-.55;const r=bottom?.055:.088;part(mane,at(ell(v(r,r,r*.9)),v(Math.sin(a)*.29,hc.y+Math.cos(a)*.22,-.05)),i%2?C.mane:C.maneDark);}
 for(const [x,y] of [[-.12,.26],[.12,.26],[0,.3],[-.2,.12],[.2,.12]])part(mane,at(ell(v(.09,.09,.08)),v(x,hc.y+y-.18,-.17)),C.mane);
 part(head,at(ell(hr,{shape:V=>{if(V.y<0)V.x*=1-.06*V.y*V.y;}}),hc),C.body);
 for(const s of [-1,1]){const ear=part(head,at(ell(v(.06,.035,.04)),v(s*.25,.39,-.02)),C.body);ear.rotation.z=s*-.5;}
 // 뿔
 part(head,new THREE.ConeGeometry(.035,.1,12).translate(0,.05,0).rotateX(.25).translate(0,.42,.06),C.gold,{line:.8});
 const eyes=[-1,1].map(s=>eye(head,hc,hr,s*.36,-.06,v(.042,.05,.018)));
 for(const s of [-1,1]){decal(head,hc,hr,s*.36,.2,v(.032,.014,.01),C.mane,{roll:-s*.25});decal(head,hc,hr,s*.66,-.32,v(.05,.026,.01),C.blush);}
 const mz=surf(head,hc,hr,0,-.36,ell(v(.1,.06,.05)),C.belly,{lift:-.02,line:.5});
 decal(head,hc,hr,0,-.22,v(.032,.02,.016),C.nose,{lift:.012});
 surf(head,hc,hr,0,-.43,omega(.013,.004),C.nose,{lift:.03});
 return {root,h:.9,w:.75,update(t,walk){
  const s=t*Math.PI*2*1.1,k=walk;
  legs.forEach((g,i)=>g.rotation.x=k*Math.sin(s+i*Math.PI)*.6);
  torso.rotation.z=k*Math.sin(s)*.13;torso.rotation.y=k*Math.sin(s)*.08;torso.position.y=k*Math.abs(Math.sin(s))*.035;
  arms.forEach((g,i)=>g.rotation.x=-k*Math.sin(s+i*Math.PI)*.6);
  bell.rotation.x=k*Math.sin(2*s-1.2)*.35;bell.rotation.z=-torso.rotation.z*1.5;
  mane.rotation.z=k*Math.sin(s-.6)*.05;head.rotation.z=k*Math.sin(s-.4)*-.05+(1-k)*Math.sin(t*1.2)*.04;
  tail.rotation.z=Math.sin(t*(k?7:3))*.25;torso.scale.set(1,1+(1-k)*Math.sin(t*2.4)*.015,1);blink(eyes,t,.7);
 }};
}

// ── 4안: 다람쥐 산꾼 「도토리」 0.65m(꼬리 포함). A Short Hike처럼 작고 날쌘 동물 등산객. 도토리 배낭·지팡이·S자 큰 꼬리.
function dotori(){
 const C={fur:'#c9773a',belly:'#f6e3c4',stripe:'#5a3a22',tip:'#e3a564',acorn:'#a8692f',cap:'#6e4a2c',bandana:'#3c8dbc',nose:'#7a3b35',stick:'#8b5a2b',leaf:'#6fa04a',inner:'#f2b6a6'};
 const root=new THREE.Group(),body=grp(root);
 const legs=[-1,1].map(s=>{const g=grp(body,v(s*.065,.08,0));part(g,at(ell(v(.045,.032,.072)),v(0,-.05,.03)),C.fur);return g;});
 const torso=grp(body);const tc=v(0,.19,0),tr=v(.12,.13,.11);
 part(torso,at(ell(tr,{shape:V=>{if(V.y<0){V.x*=1+.12*-V.y;V.z*=1+.1*-V.y;}}}),tc),C.fur);
 for(const s of [-1,1])part(torso,at(ell(v(.06,.07,.075)),v(s*.08,.11,-.015)),C.fur);
 decal(torso,tc,tr,0,-.1,v(.075,.095,.03),C.belly);
 for(const [a,c,w] of [[0,C.stripe,.017],[.3,C.belly,.012],[-.3,C.belly,.012],[.52,C.stripe,.014],[-.52,C.stripe,.014]])decal(torso,tc,tr,Math.PI+a,.15,v(w,.09,.01),c);
 part(torso,at(new THREE.TorusGeometry(.075,.02,8,24).rotateX(Math.PI/2+.2),v(0,.3,0)),C.bandana,{line:.7});
 {const g=new THREE.ConeGeometry(.05,.08,3);g.rotateX(Math.PI);g.scale(1,1,.3);g.rotateY(Math.PI);part(torso,at(g,v(0,.27,.09)),C.bandana,{line:.6});}
 // 도토리 배낭
 const pack=grp(torso,v(0,.22,-.14));part(pack,at(ell(v(.08,.085,.07),{shape:V=>{if(V.y<0)V.x*=1+.25*V.y;}}),v(0,-.01,-.02)),C.acorn);
 part(pack,at(ell(v(.09,.045,.08)),v(0,.07,-.02)),C.cap);part(pack,capsule(v(0,.1,-.02),v(.01,.135,-.03),.012),C.cap,{line:.6});
 // 꼬리: 굵기가 변하는 한 덩어리 S자. 밑동을 축으로 흔든다(끝은 밝은 털).
 const tail=grp(torso,v(0,.1,-.13)),tailTip=grp(tail);
 part(tail,sweep([v(0,0,0),v(0,.05,-.13),v(0,.19,-.2),v(0,.34,-.2),v(0,.46,-.14),v(0,.5,-.05)],u=>(.035+.075*Math.sin(Math.PI*Math.min(u*1.1,1)**.8))*(u>.9?Math.sqrt(Math.max(0,1-(u-.9)/.1)):1)),V=>V.y>.43?C.tip:C.fur);
 const arms=[-1,1].map(s=>{const g=grp(torso,v(s*.095,.27,.02));part(g,capsule(v(0,0,0),v(s*.02,-.07,.05),.022),C.fur);part(g,at(ell(v(.028,.028,.028)),v(s*.022,-.08,.06)),C.fur);return g;});
 {const st=grp(arms[0],v(-.022,-.08,.06));part(st,capsule(v(0,.12,0),v(0,-.2,.0),.01),C.stick,{line:.6});part(st,at(ell(v(.03,.014,.018)),v(.02,.13,0)),C.leaf,{line:.5});}
 const head=grp(torso,v(0,.3,0)),hc=v(0,.135,0),hr=v(.165,.145,.15);
 part(head,at(ell(hr),hc),C.fur);
 const ears=[-1,1].map(s=>{const g=grp(head,v(s*.1,.255,-.02));g.rotation.z=-s*.3;part(g,at(ell(v(.036,.052,.02),{shape:V=>{if(V.y>0)V.x*=1-.45*V.y;}}),v(0,.035,0)),C.fur);part(g,at(ell(v(.02,.032,.006)),v(0,.033,.016)),C.inner,{line:0});return g;});
 for(const s of [-1,1])surf(head,hc,hr,s*.42,-.28,ell(v(.065,.055,.05)),C.belly,{lift:-.03,line:.4});
 surf(head,hc,hr,0,-.3,ell(v(.045,.032,.03)),C.belly,{lift:-.006,line:.4});
 const eyes=[-1,1].map(s=>eye(head,hc,hr,s*.36,.05,v(.03,.04,.014)));
 for(const s of [-1,1])decal(head,hc,hr,s*.38,.36,v(.034,.008,.006),C.belly,{roll:-s*.15});
 decal(head,hc,hr,0,-.2,v(.014,.01,.01),C.nose,{lift:.014});
 surf(head,hc,hr,0,-.34,omega(.009,.003),C.nose,{lift:.028});
 return {root,h:.66,w:.55,update(t,walk){
  const s=t*Math.PI*2*1.6,k=walk,hop=k*Math.abs(Math.sin(s));
  body.position.y=hop*.07;legs.forEach(g=>g.rotation.x=k*Math.cos(2*s)*.4);torso.rotation.x=k*.12;
  arms.forEach((g,i)=>g.rotation.x=-k*Math.sin(s*2)*.25+(1-k)*.05);
  tail.rotation.x=Math.sin(t*(k?9:2.5)-.6)*(k?.14:.05);tail.rotation.z=Math.sin(t*(k?4.5:1.5))*(k?.12:.08);
  ears.forEach((g,i)=>g.rotation.x=Math.max(0,Math.sin(t*1.7+i*.4)-.9)*3);
  head.rotation.z=(1-k)*Math.sin(t*1.4)*.08;head.rotation.y=(1-k)*Math.sin(t*.7)*.15;blink(eyes,t,2.1);
 }};
}

// ── 5안: 바위 돌돌이 「바우」 1.65m. 관악산 화강암 정령. 크고 둥근 몸 하나가 얼굴, 이끼 모자에 소나무 싹·진달래. 작은 배낭이 귀엽게 안 맞는다.
function bau(){
 const C={rock:'#d9c7a8',dark:'#b3a181',light:'#efe3cc',low:'#c8b493',moss:'#6fa04a',mossDark:'#5a8a3c',pine:'#4f7a52',trunk:'#7a5232',petal:'#ef7fb0',center:'#f7d35c',eye:'#2b2b2b',blush:'#f2a08a',mouth:'#6b4a3a',pack:'#f08a3c',packDark:'#c96a2a'};
 const root=new THREE.Group(),body=grp(root);
 const legs=[-1,1].map(s=>{const g=grp(body,v(s*.25,.13,0));part(g,at(ell(v(.16,.12,.18)),v(0,-.03,.04)),C.low);return g;});
 const trunk=grp(body);const bc=v(0,.7,0),br=v(.56,.6,.5);
 part(trunk,at(ell(br,{w:40,h:30,shape:V=>{if(V.y<-.7)V.y=-.7+(V.y+.7)*.35;}}),bc),V=>V.y-bc.y<-.42?C.low:C.rock);
 for(let i=0;i<46;i++){const yaw=i*2.39996%(Math.PI*2)-Math.PI,pitch=Math.asin(((i*.618)%1)*1.5-.75);if(Math.abs(yaw)<.95&&pitch<.05&&pitch>-.7)continue;
  const r=.022+((i*7)%5)*.009;decal(trunk,bc,br,yaw,pitch,v(r,r*.8,.008),i%3?C.dark:C.light,{roll:i});}
 const eyes=[-1,1].map(s=>eye(trunk,bc,br,s*.48,-.3,v(.038,.05,.016),{color:C.eye}));
 for(const s of [-1,1])decal(trunk,bc,br,s*.68,-.39,v(.075,.034,.01),C.blush);
 surf(trunk,bc,br,0,-.4,omega(.012,.004),C.mouth,{lift:.002});
 // 이끼 모자와 소나무 싹·진달래
 const top=grp(trunk,v(0,1.2,-.02));
 part(top,ell(v(.42,.14,.38),{shape:V=>{if(V.y<0)V.y*=1+.5*Math.max(0,Math.sin(Math.atan2(V.x,V.z)*7));}}),C.moss);
 for(let i=0;i<9;i++){const a=i/9*Math.PI*2+.3;part(top,at(ell(v(.07,.05,.06)),v(Math.sin(a)*.36,-.06,Math.cos(a)*.33)),i%2?C.moss:C.mossDark,{line:.6});}
 const sprout=grp(top,v(.02,.1,-.03));
 part(sprout,capsule(v(0,0,0),v(0,.22,0),.022),C.trunk,{line:.6});
 [[.14,.14,.12],[.1,.12,.22],[.065,.1,.3]].forEach(([r,h,y])=>part(sprout,new THREE.ConeGeometry(r,h,9).translate(0,y,0),C.pine,{line:.7}));
 const flower=grp(top,v(.26,.08,.2));flower.rotation.set(.5,0,-.4);
 for(let i=0;i<5;i++){const a=i/5*Math.PI*2;part(flower,at(ell(v(.03,.012,.02)).rotateY(-a),v(Math.cos(a)*.03,0,Math.sin(a)*.03)),C.petal,{line:.4});}
 part(flower,at(ell(v(.014,.01,.014)),v(0,.006,0)),C.center,{line:0});
 // 등에 붙은 작은 배낭
 part(trunk,at(ell(v(.14,.16,.07),{shape:box(.55,.7)}),v(0,.82,-.52)),C.pack);
 part(trunk,at(ell(v(.145,.06,.075),{shape:box(.55,.7)}),v(0,.94,-.52)),C.packDark,{line:.7});
 const arms=[-1,1].map(s=>{const g=grp(trunk,v(s*.54,.68,.04));part(g,at(ell(v(.1,.14,.11)),v(s*.04,-.08,0)),C.low);return g;});
 return {root,h:1.62,w:1.3,update(t,walk){
  const s=t*Math.PI*2*.7,k=walk,land=k*Math.max(0,Math.cos(2*s))**4;
  legs.forEach((g,i)=>g.rotation.x=k*Math.sin(s+i*Math.PI)*.35);
  trunk.rotation.z=k*Math.sin(s)*.08;trunk.rotation.y=k*Math.sin(s)*.05;
  trunk.scale.set(1+land*.04,1-land*.07+(1-k)*Math.sin(t*1.6)*.01,1+land*.04);trunk.position.y=k*Math.abs(Math.sin(s))*.03;
  arms.forEach((g,i)=>g.rotation.x=-k*Math.sin(s+i*Math.PI)*.4);
  sprout.rotation.z=Math.sin(t*(k?4.4:1.6)-.8)*(k?.16:.05)-trunk.rotation.z*.8;sprout.rotation.x=Math.sin(t*2.2)*.04;blink(eyes,t,.3);
 }};
}

// ── 덤: 돔돌이 1.25m. 관악산 정상 기상레이더 돔을 머리에 쓴 작은 로봇. 매끈한 흰 몸·주황 띠·화면 얼굴·바람개비 안테나.
function domdol(){
 const C={white:'#f4f4ef',orange:'#ff7a3d',gray:'#b9bec6',visor:'#1d2a44',glow:'#8ff0ff'};
 const root=new THREE.Group(),body=grp(root);
 const legs=[-1,1].map(s=>{const g=grp(body,v(s*.12,.15,0));part(g,capsule(v(0,0,0),v(0,-.07,0),.05),C.gray);part(g,at(ell(v(.08,.05,.11),{shape:V=>{if(V.y<-.3)V.y=-.3;}}),v(0,-.115,.02)),C.orange);return g;});
 const trunk=grp(body);
 part(trunk,smoothGeo(at(new THREE.CapsuleGeometry(.26,.18,8,32),v(0,.43,0))),C.white);
 part(trunk,at(new THREE.TorusGeometry(.262,.03,10,40).rotateX(Math.PI/2),v(0,.43,0)),C.orange,{line:.7});
 decal(trunk,v(0,.43,0),v(.26,.26,.26),0,.25,v(.05,.05,.01),C.orange);
 const head=grp(trunk,v(0,.72,0));
 // 지오데식 레이더 돔: 면이 각진 이십면체(툰 음영에서 판이 갈라져 보인다)
 {const g=new THREE.IcosahedronGeometry(.31,2);g.deleteAttribute('uv');g.translate(0,.06,0);part(head,g,C.white);}
 part(head,at(new THREE.TorusGeometry(.27,.045,10,40).rotateX(Math.PI/2),v(0,-.08,0)),C.orange,{line:.8});
 const hc=v(0,.06,0),hr=v(.31,.31,.31);
 surf(head,hc,hr,0,-.02,ell(v(.21,.12,.05)),C.visor,{lift:-.025,line:.5});
 const eyes=[-1,1].map(s=>decal(head,hc,hr,s*.2,.0,v(.032,.045,.012),C.glow,{lift:.02,glow:true}));
 surf(head,hc,hr,0,-.15,smile(.024,.006,Math.PI*.7),C.glow,{lift:.018,glow:true});
 const ant=grp(head,v(0,.36,0));part(ant,capsule(v(0,0,0),v(0,.13,0),.012),C.gray,{line:.5});
 const vane=grp(ant,v(0,.14,0));for(let i=0;i<3;i++){const a=i/3*Math.PI*2;part(vane,capsule(v(0,0,0),v(Math.cos(a)*.07,0,Math.sin(a)*.07),.006),C.gray,{line:.4});part(vane,at(ell(v(.022,.022,.022)),v(Math.cos(a)*.08,0,Math.sin(a)*.08)),C.orange,{line:.5});}
 const arms=[-1,1].map(s=>{const g=grp(trunk,v(s*.27,.55,0));g.rotation.z=s*.15;part(g,capsule(v(0,0,0),v(s*.03,-.18,0),.035),C.gray);part(g,at(ell(v(.06,.06,.06)),v(s*.035,-.23,0)),C.white);return g;});
 return {root,h:1.25,w:.8,update(t,walk){
  const s=t*Math.PI*2*1.2,k=walk;
  legs.forEach((g,i)=>g.rotation.x=k*Math.sin(s+i*Math.PI)*.5);trunk.position.y=k*Math.abs(Math.sin(s))*.03;trunk.rotation.y=k*Math.sin(s)*.1;
  arms.forEach((g,i)=>g.rotation.x=-k*Math.sin(s+i*Math.PI)*.6);head.rotation.z=k*Math.sin(2*s)*.04+(1-k)*Math.sin(t*1.5)*.06;head.rotation.y=(1-k)*Math.sin(t*.6)*.2;
  vane.rotation.y=t*(k?9:4);blink(eyes,t,1.9);
 }};
}

export const CONCEPTS=[
 {id:'dongdong',name:'꼬마 등산객 「동동이」',make:dongdong},
 {id:'kongi',name:'콩알 대원 「콩이」',make:kongi},
 {id:'haechi',name:'해태 꼬마 「해치」',make:haechi},
 {id:'dotori',name:'다람쥐 산꾼 「도토리」',make:dotori},
 {id:'bau',name:'바위 돌돌이 「바우」',make:bau},
 {id:'domdol',name:'덤: 레이더 로봇 「돔돌이」',make:domdol},
];

// ── 화면
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#a2c8d3');
const camera=new THREE.PerspectiveCamera(20,innerWidth/innerHeight,.1,400);
const toon=await createToonStyle({renderer,scene,camera,mobile:false});
const sun=new THREE.DirectionalLight(0xffffff,3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.5,far:40});sun.shadow.bias=-.0005;
const hemi=new THREE.HemisphereLight(0xbfdcff,0x7a8b5a,1);scene.add(sun,sun.target,hemi);
// 무대: 풀밭 + 화강암 바위 + 소나무 + 먼 능선
{const g=new THREE.Mesh(new THREE.CircleGeometry(40,64).rotateX(-Math.PI/2),toon.materialFactory.terrain());g.receiveShadow=true;scene.add(g);
 const props=new THREE.Group();
 for(const [x,z,s,ry] of [[-3.8,-3.5,1.1,.3],[4.2,-4,1.5,1.2],[-6,-8,2.4,2],[7,-9,2.8,.7],[1.5,-7,.8,2.6],[-2,-2.6,.35,1],[2.8,-2.2,.45,.4]]){const m=new THREE.Mesh(new THREE.DodecahedronGeometry(s,1),new THREE.MeshStandardMaterial({color:0x9a958a,name:'rock_concept'}));m.scale.set(1.2,.7,1);m.position.set(x,s*.35,z);m.rotation.y=ry;m.castShadow=m.receiveShadow=true;props.add(m);}
 for(const [x,z,s] of [[-5.5,-5.5,1],[5.8,-6.5,1.2],[-8.5,-10,1.4],[9.5,-12,1.5],[0,-12,1.3],[-12,-14,1.6]]){const t=new THREE.Group();const tr=new THREE.Mesh(new THREE.CylinderGeometry(.12*s,.18*s,1.6*s,8).translate(0,.8*s,0),new THREE.MeshStandardMaterial({color:0x7a5a3e}));t.add(tr);
  [[1.3,1.4,1.5],[1.0,1.2,2.4],[.7,1.0,3.2]].forEach(([r,h,y])=>{const c=new THREE.Mesh(new THREE.ConeGeometry(r*s,h*s,10).translate(0,y*s,0),new THREE.MeshStandardMaterial({color:0x4f7058}));c.castShadow=true;t.add(c);});t.position.set(x,0,z);props.add(t);}
 props.position.z=-2.5;scene.add(toon.toonify(props,{kind:'prop'}));
 for(const [x,z,r,h,c] of [[-30,-70,40,16,'#8fb0c2'],[25,-80,45,22,'#86a8bd'],[0,-110,60,30,'#9dbccb']]){const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,16,0,Math.PI*2,0,Math.PI/2),new THREE.MeshBasicMaterial({color:c,fog:false}));m.scale.set(r,h,r*.4);m.position.set(x,0,z);scene.add(m);}}

const env=composeEnvironment({sun:{elevation:40,azimuth:160},moon:{elevation:38,azimuth:120,illumination:.8}});
sun.color.setRGB(...env.light.color,THREE.SRGBColorSpace);sun.intensity=env.light.intensity*1.15;
hemi.intensity=.06+env.ambient*1.1;hemi.color.setRGB(...env.hemiColor,THREE.SRGBColorSpace);renderer.toneMappingExposure=env.exposureMul;
toon.pipeline.update(env);

// 외곽선: 뒤집은 껍질(법선 방향으로 밀어낸 뒷면). 툰 변환 뒤에 붙여야 바뀌지 않는다.
const lineMats=new Map();
function lineMat(w){const k=w.toFixed(5);if(!lineMats.has(k)){const m=new THREE.MeshBasicMaterial({color:'#2e2420',side:THREE.BackSide});
 m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed+=normalize(normal)*${k};`);};m.customProgramCacheKey=()=>'concept-line-'+k;lineMats.set(k,m);}return lineMats.get(k);}
const chars=CONCEPTS.map(c=>{const ch=c.make();toon.toonify(ch.root,{kind:'character'});
 const w=.0045+.0028*ch.h,list=[];ch.root.traverse(o=>{if(o.isMesh&&o.userData.line>0)list.push(o);});
 for(const o of list){const l=new THREE.Mesh(o.geometry,lineMat(w*o.userData.line));l.userData.outline=true;o.add(l);}
 scene.add(ch.root);return {...c,...ch};});
let ref=null;
if(q.get('ref')==='1'){const hiker=await loadToonHiker(`${import.meta.env.BASE_URL}assets/toon/models/hiker/Hiker.glb`);toon.toonify(hiker.scene,{kind:'character'});
 hiker.scene.traverse(o=>{if(o.isMesh)o.castShadow=!o.userData.outline;});
 for(let i=0;i<10;i++){hiker.update({clip:'Idle',distance:0,stride:1,stepLength:.61,running:false,dt:.05,pose:'stand',gadget:'none',selfie:false,idleSeconds:0,speed:0});hiker.ground({moving:false,phase:0,surfaceHeight:()=>0,sample:()=>({}),floorHeight:0});}
 ref=new THREE.Group();ref.add(hiker.scene);ref.rotation.y=Math.PI;scene.add(ref);}

const state={c:+(q.get('c')??-1),view:q.get('view')??'three',walk:+(q.get('walk')??0),t:q.has('t')?+q.get('t'):null};
function layout(){
 const one=state.c>=0;
 if(one){chars.forEach((c,i)=>{c.root.visible=i===state.c;c.root.position.set(0,0,0);});if(ref)ref.visible=false;}
 else{const order=[...chars.keys()].filter(i=>q.get('bonus')!=='0'||i<5);const items=[...(ref?[{w:.7,obj:ref}]:[]),...order.map(i=>({w:chars[i].w,obj:chars[i].root}))];
  chars.forEach(c=>c.root.visible=false);const gap=.35,total=items.reduce((s,it)=>s+it.w,0)+gap*(items.length-1);let x=-total/2;
  for(const it of items){it.obj.visible=true;it.obj.position.set(x+it.w/2,0,0);x+=it.w+gap;}}
 const yaw={front:0,three:.55,side:Math.PI/2,back:Math.PI,sideR:-Math.PI/2}[state.view]??.55;
 const h=one?chars[state.c].h:1.7,fit=one?h*1.32:3.3,aspect=innerWidth/innerHeight,tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
 const d=one?fit/2/tan:Math.max(fit/2/tan,(chars.reduce((s,c)=>s+c.w,0)+3.5)/2/tan/aspect),ty=one?h*.5:.8;
 camera.position.set(Math.sin(yaw)*d,ty+d*.07,Math.cos(yaw)*d);camera.lookAt(0,ty,0);
 sun.position.set(Math.sin(yaw+.7)*10,12,Math.cos(yaw+.7)*10);
 const sc=one?3:6;Object.assign(sun.shadow.camera,{left:-sc,right:sc,top:sc,bottom:-sc});sun.shadow.camera.updateProjectionMatrix();
}
window.mascot={set(o){Object.assign(state,o);layout();},state,get frames(){return frames;},concepts:CONCEPTS.map(c=>c.name)};
for(const b of document.querySelectorAll('[data-c]'))b.onclick=()=>window.mascot.set({c:+b.dataset.c});
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>window.mascot.set({view:b.dataset.view});
for(const b of document.querySelectorAll('[data-walk]'))b.onclick=()=>window.mascot.set({walk:+b.dataset.walk});
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const dpr=Math.min(devicePixelRatio,2);renderer.setPixelRatio(dpr);toon.pipeline.resize(2,innerWidth,innerHeight,dpr);layout();}
addEventListener('resize',resize);resize();
let frames=0;const clock=new THREE.Clock();let time=0;
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);time+=dt;const t=state.t??time;for(const c of chars)c.update(t,state.walk);toon.pipeline.render(dt);frames++;});
