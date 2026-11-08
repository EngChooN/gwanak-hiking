// 자동걷기 심심함 보완 시안(2026-11-06 대표 아이디어 5건): 산스장·초콜릿·벤치·동물·등산화 먼지털이기.
// vite dev: /src/toon/props-concepts.html?s=장면id&hud=0. 게임과 같은 createToonStyle로 그리고, 말풍선은 HTML로 얹는다.
// 시안 확인용이라 동동이는 concept-kit.js의 부위 Group을 직접 돌려 자세를 만든다. 채택되면 link-hiker.js 뼈대 동작으로 다시 만든다.
import * as THREE from 'three';
import {createToonStyle} from './index.js';
import {composeEnvironment} from '../daytime.js';
import {v,ell,capsule,noodle,sweep,at,part,surf,decal,eye,smile,grp,dongdong} from './concept-kit.js';
import {rod,boxAt,textPlane,speedLines,heart,drop,puff,chocolate,bench,squirrel,hare,acorn,cat,magpie,soul,gym,runLate,zap} from './trail-props.js';

const q=new URLSearchParams(location.search);
const {Quaternion}=THREE;

// 형상(산스장·벤치·동물·소품)은 게임과 같은 src/toon/trail-props.js를 쓴다.
const late=[];// toonify 뒤에 붙일 것(이 파일 전용 효과선)
// ── 동동이 자세 도우미. 팔·다리 Group은 아래(-y)로 뻗어 있다. rotation.x 음수 = 앞으로.
function hiker(parent,{p=v(),yaw=0}={}){const d=dongdong();d.root.position.copy(p);d.root.rotation.y=yaw;parent.add(d.root);return d;}
const handLocal=s=>v(s*.035,-.2,0);
function hold(arm,s,obj,off=v()){obj.position.copy(handLocal(s).add(off));arm.add(obj);return obj;}

// ── 장면
const scenes={};
function scene(id,title,sub,build){scenes[id]={id,title,sub,build};}
scene('gym','① 산스장 — 전경','깔딱고개 아래 쉼터 자리 · 철봉·허리돌리기·거꾸리·시멘트 역기·타이어',g=>{gym(g);
 return {cam:{p:v(4.4,3.3,6.4),t:v(-.2,.75,-.6),fov:34},bubbles:[{p:v(1.4,.85,.75),t:'♪ 뽕짝 ♪',k:'sfx'},{p:v(-.6,1.0,.35),t:'시멘트 역기',k:'tag'},{p:v(1.75,1.85,-.85),t:'거꾸리',k:'tag'},{p:v(.35,1.5,-1.5),t:'허리돌리기',k:'tag'},{p:v(-1.4,2.15,-1.3),t:'철봉',k:'tag'}]};});
scene('gym-lift','① 산스장 — 시멘트 역기 들기','팔이 짧아서 머리로 듭니다 · 버튼 연타로 "득근" 게이지',g=>{
 const d=hiker(g,{p:v(0,0,0),yaw:0}),{body,legs,arms,head,hat,eyes}=d.parts;
 legs.forEach((l,i)=>l.rotation.z=(i?1:-1)*.28);body.scale.set(1.06,.92,1.06);arms.forEach((a,i)=>a.rotation.z=(i?1:-1)*2.35);
 hat.scale.y=.55;eyes.forEach(e=>e.scale.y=.22);
 const bb=grp(g,v(0,1.0,0));rod(bb,v(-.75,0,0),v(.75,0,0),.018,'#c9ccd0');for(const x of [-.62,.62])part(bb,new THREE.CylinderGeometry(.2,.2,.14,20).rotateZ(Math.PI/2).translate(x,0,0),'#aaa59c');
 bb.rotation.z=.06;for(const [x,y] of [[-.3,.86],[.32,.8],[.36,.6]])drop(g,v(x,y,.15),.03);
 return {cam:{p:v(1.2,1.05,3.6),t:v(0,.6,0),fov:30},bubbles:[{p:v(0,1.32,0),t:'팔이… 짧아서… 머리로 들었다',k:''},{p:v(-.62,.75,.2),t:'부들부들',k:'sfx'}],hud:{chips:['💪 득근 7/10'],btn:'연타! 들어 올리기'}};});
scene('gym-hang','① 산스장 — 거꾸리','거꾸로 매달리면 모자가 떨어지고 얼굴이 빨개집니다',g=>{
 const t=grp(g,v(0,0,0));for(const s of [-1,1]){rod(t,v(s*.36,0,-.5),v(s*.34,1.45,-.1),.035,'#2f6fb0');rod(t,v(s*.36,0,.3),v(s*.34,1.45,-.1),.035,'#2f6fb0');}
 rod(t,v(-.36,1.45,-.1),v(.36,1.45,-.1),.025,'#cfd2d6');boxAt(t,v(.44,1.45,.05),v(0,.82,-.2),'#e6dcc8',{rot:[-.1,0,0]});rod(t,v(-.16,1.5,-.12),v(.16,1.5,-.12),.03,'#d9473e');
 const d=hiker(g,{p:v(0,1.52,-.02)}),{hat,arms,head,eyes}=d.parts;d.root.rotation.z=Math.PI;
 arms.forEach((a,i)=>a.rotation.z=(i?-1:1)*.9);hat.removeFromParent();hat.position.set(.55,.0,.45);hat.rotation.set(.12,.5,0);g.add(hat);
 for(const s of [-1,1])decal(head,d.parts.hc,d.parts.hr,s*.58,-.3,v(.07,.045,.015),'#ef6f6c');
 eyes.forEach(e=>e.scale.set(1.2,1.25,1));
 return {cam:{p:v(2.0,1.05,4.3),t:v(.1,.75,0),fov:32},bubbles:[{p:v(-.2,1.75,0),t:'피가 머리로 쏠린다… 원래 머리가 몸 절반인데…',k:''},{p:v(.55,.3,.45),t:'툭 (모자)',k:'sfx'}]};});
scene('choco','② 초콜릿 — 먹으면 잠깐 빨라짐','처음 5개 · 먹으면 30초 동안 이동속도 +20% · 입가에 초콜릿',g=>{
 const d=hiker(g,{p:v(0,0,0),yaw:Math.PI/2}),{legs,arms,body,head,eyes,hc,hr}=d.parts;
 legs[0].rotation.x=.75;legs[1].rotation.x=-.75;arms[1].rotation.x=.9;body.rotation.x=.12;body.position.y=.04;
 arms[0].rotation.x=-2.25;arms[0].rotation.z=.45;{const c=hold(arms[0],-1,chocolate(),v(.03,-.06,.04));c.scale.setScalar(1.5);c.rotation.set(.3,.2,1.2);}
 decal(head,hc,hr,-.25,-.42,v(.03,.022,.01),'#5a3324');decal(head,hc,hr,.05,-.5,v(.018,.012,.008),'#5a3324');eyes.forEach(e=>e.scale.y=.3);
 speedLines(g,v(-.32,.5,-.05),-1,9,.45,.7);for(const [x,z,r] of [[-.35,.12,.07],[-.55,-.05,.09],[-.8,.08,.06]])puff(g,v(x,r*.6,z),r);
 const sq=squirrel();sq.position.set(.85,0,-.75);sq.rotation.y=-.4;g.add(sq);
 return {cam:{p:v(2.3,1.05,3.0),t:v(.05,.52,0),fov:30},bubbles:[{p:v(.15,1.18,0),t:'당 충전!! 슝—',k:''},{p:v(.85,.4,-.75),t:'…(침)',k:'tag'}],hud:{chips:['🍫 4/5','⚡ 빨라짐 0:28']}};});
scene('choco-item','② 초콜릿 — 소지품','배낭 옆주머니에 5개 · HUD 수첩의 간식 칸에서 꺼내 먹기',g=>{
 boxAt(g,v(1.1,.02,.7),v(0,.01,0),'#f2c14e',{line:.5});for(let i=0;i<5;i++){const c=chocolate();c.scale.setScalar(1.6);const a=(i-2)*.32;c.position.set(Math.sin(a)*.3,.03+i*.004,.12-Math.cos(a)*.3);c.rotation.y=Math.PI/2-a;g.add(c);
  textPlane(c,['산초코'],.05,.024,{bg:'#d9473e',fg:'#fff4e2',p:v(-.07,.0145,0),rot:[-Math.PI/2,0,-Math.PI/2],size:.7});}
 return {cam:{p:v(0,1.05,.95),t:v(0,.02,-.05),fov:34},bubbles:[],hud:{chips:['🍫 5/5'],btn:'🍫 먹기'}};});
scene('bench','③ 벤치 — 앉아서 쉬기','앉으면 다리가 땅에 안 닿아 달랑달랑 · 배낭은 옆에 · 영혼이 잠깐 쉬러 나감',g=>{
 const b=bench();g.add(b);const d=hiker(g,{p:v(-.22,.26,.06)}),{legs,arms,pack}=d.parts;
 legs[0].rotation.x=-1.15;legs[1].rotation.x=-.75;arms.forEach((a,i)=>{a.rotation.x=-.5;a.rotation.z=(i?1:-1)*.25;});
 pack.removeFromParent();pack.position.set(.38,.62,-.06);pack.rotation.y=Math.PI;g.add(pack);
 soul(g,v(-.24,.66,.33),v(-.62,1.25,.3));
 const c=cat();c.position.set(.62,.44,.02);c.rotation.y=-.4;g.add(c);
 return {cam:{p:v(.9,1.05,3.3),t:v(.05,.62,0),fov:32},bubbles:[{p:v(-.62,1.42,.3),t:'후우… (영혼 휴식 중)',k:''},{p:v(.62,.85,.02),t:'(자리 맡아 둠)',k:'tag'}]};});
scene('animals','④ 동물 — 다람쥐·산고양이·까치','길가·바위·나뭇가지에 나타납니다 · 가까이 가면 반응',g=>{
 const sq=squirrel();sq.scale.setScalar(1.6);sq.position.set(-.75,0,.1);sq.rotation.y=.5;g.add(sq);const ac=acorn();ac.scale.setScalar(1.6);ac.position.set(-.7,.15,.25);g.add(ac);
 const c=cat();c.scale.setScalar(1.3);c.position.set(0,0,0);c.rotation.y=-.15;g.add(c);
 const m=magpie({fly:true});m.scale.setScalar(1.5);m.position.set(.2,1.15,-.6);m.rotation.set(.15,-1.1,0);g.add(m);
 rod(g,v(.55,0,-.3),v(.62,.55,-.3),.035,'#7a5233');rod(g,v(.62,.5,-.3),v(.95,.55,-.25),.02,'#7a5233');const p=magpie();p.scale.setScalar(1.3);p.position.set(.86,.68,-.27);p.rotation.y=-1.2;g.add(p);
 return {cam:{p:v(.1,.75,3.1),t:v(0,.42,0),fov:30},bubbles:[{p:v(-.75,.6,.1),t:'다람쥐',k:'tag'},{p:v(0,.62,0),t:'산고양이(치즈)',k:'tag'},{p:v(.2,1.42,-.6),t:'까치',k:'tag'}]};});
scene('hare','④-2 멧토끼 — 상태 5가지','idle 풀뜯기 · alert 귀 쫑긋 · hop 깡충 · flee 달아남 · return 다시 다가옴 (게임 속 배치)',g=>{
 const L=({x=0,z=0,yaw=0,s=1.5}={})=>{const o=hare();o.scale.setScalar(s);o.position.set(x,0,z);o.rotation.y=yaw;g.add(o);return o;};
 const P=o=>{const r={};o.traverse(n=>{if(n.name)r[n.name]=n;});return r;};
 const grass=(x,z)=>{for(let i=0;i<5;i++)rod(g,v(x+(i-2)*.018,0,z),v(x+(i-2)*.04,.1+.02*(i%2),z+.01),.006,'#5f8f45',{line:0});};
 const a=L({x:-1.25,yaw:.5}),pa=P(a);pa.head.rotation.x=.75;pa.head.position.set(0,.22,.19);pa.ears.rotation.x=.5;pa.body.rotation.x=.18;grass(-1.05,.3);grass(-1.15,.38);
 const b=L({x:-.65,yaw:-.35}),pb=P(b);pb.body.rotation.x=-.28;pb.body.position.y=.21;pb.head.position.y=.34;pb.head.rotation.x=-.2;pb['ear-L'].rotation.x=-.05;pb['ear-R'].rotation.x=-.05;pb.tail.position.y=.23;
 const c=L({x:.3,yaw:-.9}),pc=P(c);c.position.y=.28;pc.body.rotation.x=-.32;pc['leg-H'].rotation.x=.9;pc['leg-F'].rotation.x=-.9;pc.ears.rotation.x=.8;pc.head.rotation.x=-.1;
 puff(g,v(.62,.02,.2),.05);puff(g,v(.74,.02,.2),.05);
 const d=L({x:1.1,z:-.4,yaw:2.2}),pd=P(d);d.position.y=.12;pd.body.rotation.x=-.2;pd['leg-H'].rotation.x=1.1;pd['leg-F'].rotation.x=-1;pd.ears.rotation.x=1.0;speedLines(g,v(1.35,.35,-.7),1,7,.5,.5);
 const e=L({x:2.35,z:.2,yaw:-2.5}),pe=P(e);pe.head.rotation.x=.3;pe.ears.rotation.x=.2;pe.body.rotation.x=.08;
 return {cam:{p:v(.55,.7,5.1),t:v(.55,.28,0),fov:38},bubbles:[{p:v(-1.25,.62,0),t:'idle 풀뜯기',k:'tag'},{p:v(-.65,.9,-.1),t:'alert 쫑긋!',k:'sfx'},{p:v(.3,.8,0),t:'hop 깡충',k:'tag'},{p:v(1.1,.75,-.4),t:'flee 휙!',k:'sfx'},{p:v(2.35,.85,.2),t:'return 다시 다가옴',k:'tag'}]};});
scene('animals-pet','④ 동물 — 상호작용','고양이: 쓰다듬으면 배를 보이다 냥펀치 · 다람쥐: 모자 위 점령 · 까치: 배낭에 착지',g=>{
 const d=hiker(g,{p:v(-.25,0,-.05),yaw:.95}),{legs,arms,body,eyes}=d.parts;
 body.position.y=-.04;legs[0].rotation.x=-.5;legs[1].rotation.x=.25;arms[0].rotation.x=-1.0;arms[1].rotation.x=-.7;body.rotation.x=.2;
 const c=cat({belly:true});c.position.set(.4,0,.22);c.rotation.y=-.95;g.add(c);
 for(const [x,y,z,s] of [[.45,.42,.1,.06],[.62,.55,.05,.045],[.32,.6,.0,.04]])heart(g,v(x,y,z),s);
 const sq=squirrel();sq.position.set(-.2,1.0,0);sq.rotation.y=.4;d.root.add(sq);sq.position.set(0,1.02,-.02);
 const ac=acorn();ac.position.set(.0,1.12,.06);d.root.add(ac);
 const m=magpie();m.scale.setScalar(1.2);m.position.set(0,.8,-.22);m.rotation.y=.62;d.root.add(m);
 return {cam:{p:v(.6,1.15,3.4),t:v(.05,.55,0),fov:32},bubbles:[{p:v(.5,.75,.15),t:'골골골… (3초 뒤 냥펀치)',k:''},{p:v(-.2,1.38,0),t:'여기 내 자리',k:'tag'},{p:v(-.75,.85,-.05),t:'…무거워',k:'tag'}]};});
scene('airgun','⑤ 등산화 먼지털이기','하산길 끝 · 에어건으로 신발 먼지 털기 · 바람이 너무 세서 모자가 날아감',g=>{
 const s=grp(g,v(-.75,0,-.35));boxAt(s,v(1.2,.04,.8),v(.55,.02,.45),'#4a4f55');for(let i=0;i<6;i++)boxAt(s,v(1.1,.012,.03),v(.55,.045,.15+i*.12),'#6c737b',{line:0});
 boxAt(s,v(.32,1.25,.24),v(0,.625,0),'#c3c8ce');boxAt(s,v(.36,.06,.28),v(0,1.27,0),'#8d939a');
 textPlane(s,['에어건 먼지털이기','신발 먼지를 털어 주세요'],.3,.17,{bg:'#2f6fb0',fg:'#ffffff',p:v(0,1.0,.121),size:.25});
 part(s,new THREE.CylinderGeometry(.045,.045,.015,20).rotateX(Math.PI/2).translate(0,.62,.125),'#f4f4ef',{line:.4});
 const d=hiker(g,{p:v(.3,0,.25),yaw:-.55}),{arms,body,head,hat,eyes,legs}=d.parts;
 body.rotation.x=-.18;arms[0].rotation.x=-.55;arms[0].rotation.z=.2;arms[1].rotation.x=-1.2;arms[1].rotation.z=-.5;legs[1].rotation.x=-.3;eyes.forEach(e=>e.scale.y=.18);
 const gun=new THREE.Group();rod(gun,v(0,0,0),v(0,-.09,.0),.018,'#262626');rod(gun,v(0,-.01,0),v(0,-.03,.11),.012,'#e3b23c');hold(arms[0],-1,gun,v(0,.02,.02));
 hat.removeFromParent();hat.position.set(.55,1.3,-.5);hat.rotation.set(-.9,.4,.7);g.add(hat);
 g.updateMatrixWorld(true);const h=arms[0].localToWorld(handLocal(-1));
 part(g,noodle([v(-.6,.55,-.22),v(-.45,.15,.0),v(-.1,.08,.25),h.clone().add(v(-.05,-.08,0)),h],.016),'#f2c14e',{line:.5});
 for(const [x,z,r] of [[.2,.4,.09],[.4,.38,.07],[.12,.22,.06],[.48,.2,.08],[.3,.5,.05],[.05,.42,.05]])puff(g,v(x,r*.7+.02,z),r);
 speedLines(g,v(.6,1.05,-.3),1,7,.4,.45);
 return {cam:{p:v(1.2,1.3,4.0),t:v(-.1,.7,0),fov:34},bubbles:[{p:v(.15,.3,.55),t:'치이이익—!!!',k:'sfx'},{p:v(.55,1.55,-.5),t:'내 모자!!',k:''},{p:v(-.75,1.42,-.35),t:'에어건',k:'tag'}],hud:{btn:'💨 신발 털기'}};});
// ⑥ 무리해서 뛰기(2026-11-06 대표 추가 아이디어): 스테미너가 바닥나면 헥헥, 오르막에서 바닥나면 가끔 다리에 쥐
function openMouth(d,{tongue=true}={}){const {head,hc,hr}=d.parts;const m=decal(head,hc,hr,0,-.36,v(.05,.04,.012),'#6b2a2a');
 if(tongue)decal(head,hc,hr,0,-.44,v(.028,.022,.01),'#ef6f8a');return m;}
scene('pant','⑥ 무리하면 — 헥헥','스테미너 0이 되면 무릎 짚고 헥헥 · 입김이 퐁퐁 · 30까지 찰 때까지 못 뜀',g=>{
 const d=hiker(g,{p:v(0,0,0),yaw:.5}),{body,legs,arms,eyes,hat,head}=d.parts;
 body.rotation.x=.42;body.position.y=-.06;legs.forEach((l,i)=>{l.rotation.x=-.42;l.rotation.z=(i?1:-1)*.12;});
 arms.forEach((a,i)=>{a.rotation.x=-.95;a.rotation.z=(i?1:-1)*.05;});head.rotation.x=-.32;hat.rotation.x=-.3;
 eyes.forEach(e=>e.scale.set(1.1,.16,1));openMouth(d);
 for(const [x,y,z,s] of [[-.32,.98,.12,.035],[.3,1.02,.05,.03],[.36,.82,.15,.025],[-.22,1.12,0,.028]])drop(g,v(x,y,z),s);
 for(const [x,y,z,r] of [[.42,.52,.3,.035],[.56,.58,.36,.045],[.72,.66,.4,.055]])puff(g,v(x,y,z),r,'#ffffff');
 return {cam:{p:v(2.4,1.0,3.2),t:v(.1,.5,0),fov:30},bubbles:[{p:v(-.05,1.32,0),t:'헥… 헥… 다리가… 내 말을… 안 들어…',k:''},{p:v(.75,.8,.4),t:'헥헥',k:'sfx'}],hud:{chips:['🏃 0 · 회복 중']}};});
scene('cramp','⑥ 무리하면 — 다리에 쥐','오르막에서 바닥까지 뛰면 가끔(25%) 쥐 · 뒹굴뒹굴 3초 · 발끝 당기기 버튼으로 일찍 풀기',g=>{
 const lie=grp(g,v(0,.26,0));lie.rotation.y=Math.PI/2;const d=hiker(lie,{p:v()}),{body,legs,arms,eyes,head,hat}=d.parts;
 d.root.rotation.set(-1.42,0,0);lie.rotation.x=.25;
 legs[0].rotation.x=-1.25;legs[1].rotation.x=-.25;legs[1].rotation.z=.3;
 arms[0].rotation.x=-1.05;arms[0].rotation.z=.3;arms[1].rotation.x=-1.15;arms[1].rotation.z=-.3;head.rotation.x=.35;
 eyes.forEach(e=>e.scale.set(1.3,.14,1));openMouth(d,{tongue:false});
 hat.removeFromParent();hat.position.set(-1.05,.05,.25);hat.rotation.set(0,.4,1.5);g.add(hat);
 g.updateMatrixWorld(true);const calf=legs[0].localToWorld(v(0,-.1,0));
 zap(g,calf.clone().add(v(.12,.06,.12)),.12);zap(g,calf.clone().add(v(-.1,.1,.14)),.09);
 for(const [x,z,r] of [[-.6,.3,.06],[.55,.32,.05],[.25,.45,.045]])puff(g,v(x,r*.6,z),r);
 late.push(()=>{const m=new THREE.MeshBasicMaterial({color:'#2e2420',toneMapped:false});for(const [r,a] of [[.62,.25],[.72,Math.PI+.25]]){const t=new THREE.Mesh(new THREE.TorusGeometry(r,.009,4,32,Math.PI*.45),m);t.position.set(0,.35,.1);t.rotation.set(0,0,a);g.add(t);}});
 drop(g,v(-.35,.85,.1),.035);drop(g,v(-.6,.75,.05),.03);
 return {cam:{p:v(.2,.95,3.4),t:v(0,.35,0),fov:30},bubbles:[{p:v(-.5,1.0,0),t:'으아아 쥐났다!! 종아리!!',k:''},{p:v(.6,1.0,.1),t:'찌릿',k:'sfx'},{p:v(-1.05,.35,.25),t:'뒹굴뒹굴',k:'tag'}],hud:{chips:['🏃 0 · 쥐 0:02'],btn:'🦶 발끝 당기기'}};});

// ── 무대
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const world=new THREE.Scene();world.background=new THREE.Color('#a2c8d3');
const camera=new THREE.PerspectiveCamera(30,innerWidth/innerHeight,.05,400);
const toon=await createToonStyle({renderer,scene:world,camera,mobile:false});
const sun=new THREE.DirectionalLight(0xffffff,3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.5,far:40});sun.shadow.bias=-.0005;sun.position.set(6,12,8);
const hemi=new THREE.HemisphereLight(0xbfdcff,0x7a8b5a,1);world.add(sun,sun.target,hemi);
{const g=new THREE.Mesh(new THREE.CircleGeometry(40,64).rotateX(-Math.PI/2),toon.materialFactory.terrain());g.receiveShadow=true;world.add(g);
 const props=new THREE.Group();
 for(const [x,z,s,ry] of [[-3.8,-3.5,1.1,.3],[4.2,-4,1.5,1.2],[-6,-8,2.4,2],[7,-9,2.8,.7],[1.5,-7,.8,2.6]]){const m=new THREE.Mesh(new THREE.DodecahedronGeometry(s,1),new THREE.MeshStandardMaterial({color:0x9a958a}));m.scale.set(1.2,.7,1);m.position.set(x,s*.35,z);m.rotation.y=ry;m.castShadow=m.receiveShadow=true;props.add(m);}
 for(const [x,z,s] of [[-5.5,-5.5,1],[5.8,-6.5,1.2],[-8.5,-10,1.4],[9.5,-12,1.5],[0,-12,1.3],[-12,-14,1.6],[3,-5,.9]]){const t=new THREE.Group();t.add(new THREE.Mesh(new THREE.CylinderGeometry(.12*s,.18*s,1.6*s,8).translate(0,.8*s,0),new THREE.MeshStandardMaterial({color:0x7a5a3e})));
  [[1.3,1.4,1.5],[1.0,1.2,2.4],[.7,1.0,3.2]].forEach(([r,h,y])=>{const c=new THREE.Mesh(new THREE.ConeGeometry(r*s,h*s,10).translate(0,y*s,0),new THREE.MeshStandardMaterial({color:0x4f7058}));c.castShadow=true;t.add(c);});t.position.set(x,0,z);props.add(t);}
 props.position.z=-1.5;world.add(toon.toonify(props,{kind:'prop'}));
 for(const [x,z,r,h,c] of [[-30,-70,40,16,'#8fb0c2'],[25,-80,45,22,'#86a8bd'],[0,-110,60,30,'#9dbccb']]){const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,16,0,Math.PI*2,0,Math.PI/2),new THREE.MeshBasicMaterial({color:c,fog:false}));m.scale.set(r,h,r*.4);m.position.set(x,0,z);world.add(m);}}
const env=composeEnvironment({sun:{elevation:40,azimuth:160},moon:{elevation:38,azimuth:120,illumination:.8}});
sun.color.setRGB(...env.light.color,THREE.SRGBColorSpace);sun.intensity=env.light.intensity*1.15;
hemi.intensity=.06+env.ambient*1.1;hemi.color.setRGB(...env.hemiColor,THREE.SRGBColorSpace);renderer.toneMappingExposure=env.exposureMul;
toon.pipeline.update(env);

const lineMats=new Map();
function lineMat(w){const k=w.toFixed(5);if(!lineMats.has(k)){const m=new THREE.MeshBasicMaterial({color:'#2e2420',side:THREE.BackSide});
 m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed+=normalize(normal)*${k};`);};m.customProgramCacheKey=()=>'concept-line-'+k;lineMats.set(k,m);}return lineMats.get(k);}
const built={};
for(const s of Object.values(scenes)){const g=new THREE.Group();late.length=0;const info=s.build(g);
 toon.toonify(g,{kind:'character'});const list=[];g.traverse(o=>{if(o.isMesh&&o.userData.line>0)list.push(o);});
 for(const o of list){const l=new THREE.Mesh(o.geometry,lineMat(.0072*o.userData.line));l.userData.outline=true;o.add(l);}
 g.traverse(o=>{if(o.isMesh&&!o.userData.outline){o.castShadow=true;}});for(const f of late)f();runLate();
 g.visible=false;world.add(g);built[s.id]={...s,...info,g};}

const ids=Object.keys(scenes);let cur=null;const overlay=document.getElementById('overlay'),title=document.getElementById('title');
function show(id){cur=built[id]??built[ids[0]];for(const b of Object.values(built))b.g.visible=b===cur;
 camera.fov=cur.cam.fov;camera.position.copy(cur.cam.p);camera.lookAt(cur.cam.t);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 title.innerHTML=`${cur.title}<small>${cur.sub}</small>`;overlay.innerHTML='';
 cur.els=cur.bubbles.map(b=>{const e=document.createElement('div');e.className=`bubble ${b.k}`;e.textContent=b.t;overlay.append(e);return e;});
 if(cur.hud?.chips){const h=document.createElement('div');h.className='hud';h.innerHTML=cur.hud.chips.map((c,i)=>`<span class="chip ${i?'on':''}">${c}</span>`).join('');overlay.append(h);}
 if(cur.hud?.btn){const b=document.createElement('div');b.className='btn';b.style.left='50%';b.style.bottom='28px';b.textContent=cur.hud.btn;overlay.append(b);}
 place();}
function place(){if(!cur)return;const V=v();cur.bubbles.forEach((b,i)=>{V.copy(b.p).project(camera);const e=cur.els[i];e.style.left=`${(V.x*.5+.5)*innerWidth}px`;e.style.top=`${(-V.y*.5+.5)*innerHeight-6}px`;});}
const panel=document.getElementById('panel');if(q.get('hud')==='0')panel.remove();else panel.innerHTML=ids.map(i=>`<button data-s="${i}">${i}</button>`).join('');
for(const b of document.querySelectorAll('[data-s]'))b.onclick=()=>show(b.dataset.s);
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();camera.updateMatrixWorld();renderer.setSize(innerWidth,innerHeight);const dpr=Math.min(devicePixelRatio,2);renderer.setPixelRatio(dpr);toon.pipeline.resize(2,innerWidth,innerHeight,dpr);place();}
addEventListener('resize',resize);resize();show(q.get('s')??ids[0]);
let frames=0;const clock=new THREE.Clock();
window.props={show,ids,get frames(){return frames;}};
renderer.setAnimationLoop(()=>{toon.pipeline.render(Math.min(clock.getDelta(),.05));frames++;});
