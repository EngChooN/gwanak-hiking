// 온라인 흡연장 — 온라인 시리즈 2. 그래픽은 온라인 등산의 카툰 파이프라인(src/toon/**)을, 캐릭터는 동동이(src/toon/link-hiker.js)를 그대로 쓴다.
// 이 파일: 렌더러·카툰 후처리·하늘·시간대 빛, 내 아바타 이동(키보드·떠다니는 조이스틱)·3인칭 카메라, 옥상·NPC·흡연·HUD 연결.
// 다른 모듈과는 window 'lounge:*' 이벤트와 ctx 객체로만 주고받는다.
import '../server-link-pin.js';   // 맨 먼저: 주소에 ?server= 붙이기(카드로 와도 링크로 와도 같은 서버)
import * as THREE from 'three';
import {createToonStyle} from '../toon/index.js';
import {composeEnvironment,sunPosition,moonPosition} from '../daytime.js';
import {sunDirection} from '../look-profile.js';
import {createAvatar,WALK_SPEED,RUN_MUL} from './avatar.js';
import {buildRooftop} from './rooftop.js';
import {createSmoker} from './smoke.js';
import {createLoungeAudio} from './audio.js';
import {createHud} from './hud.js';
import {createMoment} from './moment.js';
import {createNpcs} from './npc.js';
import {createInput} from './input.js';
import {loadProfile,saveProfile} from './profile.js';
import {createSpots} from './spots.js';
import {createScene} from './scene.js';
import {createLoungeMulti} from './multi.js';
import {installLoungeMultiUi} from './multi-ui.js';
import {serverPickMode} from '../server-pick.js';

const q=new URLSearchParams(location.search);
const mobile=matchMedia('(pointer:coarse)').matches||/iPhone|iPad|Android/i.test(navigator.userAgent);
if(mobile)document.body.classList.add('touch');
const RIG_URL=`${import.meta.env.BASE_URL}assets/toon/models/hiker/HikerRig.glb`;
const loading=document.getElementById('loading'),setLoad=(t)=>{const el=loading?.querySelector('.ld-msg');if(el)el.textContent=t;};

// ── 렌더러(온라인 등산 rendering.js·character-preview.js와 같은 설정: Neutral 톤매핑·PCF 부드러운 그림자)
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:q.has('capture')});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.id='scene';document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#bad6ee');
scene.fog=new THREE.Fog('#bad6ee',60,900);
const camera=new THREE.PerspectiveCamera(mobile?62:55,innerWidth/innerHeight,.05,3000);
setLoad('카툰 붓 꺼내는 중…');
const toon=await createToonStyle({renderer,scene,camera,mobile});
toon.createSky();
const world=new THREE.Group();world.name='world';scene.add(world);

// ── 빛: 해(그림자)·반구광. 값은 온라인 등산 카툰 미리보기와 같은 공식(env → 세기·색)
const sun=new THREE.DirectionalLight(0xffffff,3);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:80});sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
const hemi=new THREE.HemisphereLight(0xbfdcff,0x7a8b5a,1);scene.add(sun,sun.target,hemi);

// ── 시간대: 기본은 지금 서울 시각(온라인 등산과 같은 해·달 계산). HUD에서 낮·노을·밤으로 바꿀 수 있다.
export const TIME_PRESETS=Object.freeze({
 day:{label:'낮',sun:{elevation:42,azimuth:165},moon:{elevation:-30,azimuth:300,illumination:.5}},
 dusk:{label:'노을',sun:{elevation:2.5,azimuth:248},moon:{elevation:12,azimuth:110,illumination:.7}},
 night:{label:'밤',sun:{elevation:-24,azimuth:300},moon:{elevation:40,azimuth:150,illumination:.85}},
});
const profile=loadProfile();
const timeState={mode:q.get('time')??profile.timeMode??'auto'};
function skyNow(){
 const p=TIME_PRESETS[timeState.mode];if(p)return {sun:p.sun,moon:p.moon};
 const now=Date.now();return {sun:sunPosition(now),moon:moonPosition(now)};
}
const sunVec=new THREE.Vector3(),moonVec=new THREE.Vector3();let env=composeEnvironment(skyNow());
function applyEnvironment(){
 env=composeEnvironment(skyNow());
 const k=toon.lightScale(env);
 sunVec.fromArray(sunDirection(env.elevation,env.azimuth));moonVec.fromArray(sunDirection(env.moon.elevation,env.moon.azimuth));
 const L=new THREE.Vector3().fromArray(sunDirection(env.light.elevation,env.light.azimuth));
 sun.position.copy(player?.root.position??new THREE.Vector3()).addScaledVector(L,40);sun.target.position.copy(player?.root.position??new THREE.Vector3());
 sun.color.setRGB(...env.light.color,THREE.SRGBColorSpace);sun.intensity=env.light.intensity*3.4*k;sun.castShadow=env.light.castShadow;
 hemi.intensity=(.06+env.ambient*1.1)*k;hemi.color.setRGB(...env.hemiColor,THREE.SRGBColorSpace);
 renderer.toneMappingExposure=env.exposureMul*toon.exposureFor(env);
 scene.fog.color.setRGB(...env.fogColor,THREE.SRGBColorSpace).multiplyScalar(k);
 toon.updateSky(env,sunVec,moonVec);toon.pipeline.update(env);
 const phase=env.night>.5?'night':env.elevation<10?'dusk':'day';
 if(document.documentElement.dataset.hudTime!==phase){document.documentElement.dataset.hudTime=phase;dispatch('lounge:phase',{phase});}
 return phase;
}
const dispatch=(type,detail={})=>window.dispatchEvent(new CustomEvent(type,{detail}));

// ── 옥상 흡연장(공간·소품·충돌·자리)
setLoad('옥상 문 여는 중…');
const rooftop=buildRooftop({toon,scene,world,mobile});

// ── 소리(효과음은 전부 코드로 합성 — 외부 파일 없음)
const audio=createLoungeAudio({muted:profile.muted});

// ── 내 아바타
setLoad('동동이 옷 갈아입는 중…');
const player=await createAvatar({rigUrl:RIG_URL,toon,outfit:profile.outfit,name:profile.nickname||'동동이',id:'me'});
world.add(player.root);
const sp=rooftop.spots.spawn;player.place(sp.x,sp.z,sp.heading);
const smoker=createSmoker(player,{toon,world,audio,isPlayer:true,profile});
player.extra.push((dt)=>smoker.apply(dt,{moving:player.moving}));

// ── 옥상 NPC 4명(미나·지훈·보미·대호): 진짜 사람과 헷갈려 기본은 안 부른다(2026-11-08 대표 요청). ?npc=1 이면 예전처럼 떠들고 피운다.
const NO_NPCS=Object.freeze({avatars:[],setCollide(){},update(){},social(){return null;},status(){return [];},scene:null});
const ctx={THREE,scene,camera,renderer,toon,world,rooftop,audio,player,smoker,profile,mobile,dispatch,createAvatar:(o)=>createAvatar({rigUrl:RIG_URL,toon,...o}),createSmoker:(a,o={})=>createSmoker(a,{toon,world,audio,...o}),get env(){return env;}};
setLoad('옥상 사람들 부르는 중…');
const npcs=q.get('npc')==='1'?await createNpcs(ctx):NO_NPCS;ctx.npcsOn=npcs!==NO_NPCS;

// ── 충돌: 옥상 경계(상자) 안, 장애물(원·상자) 밖으로 민다. 다른 동동이와도 겹치지 않게.
const R=.2;
function collide(x,z,self=player){
 const b=rooftop.bounds;x=Math.min(Math.max(x,b.minX+R),b.maxX-R);z=Math.min(Math.max(z,b.minZ+R),b.maxZ-R);
 for(const c of rooftop.colliders){
  if(c.r!==undefined){const dx=x-c.x,dz=z-c.z,d=Math.hypot(dx,dz),m=c.r+R;if(d<m&&d>1e-6){x=c.x+dx/d*m;z=c.z+dz/d*m;}}
  else{const nx=Math.min(Math.max(x,c.minX),c.maxX),nz=Math.min(Math.max(z,c.minZ),c.maxZ),dx=x-nx,dz=z-nz,d=Math.hypot(dx,dz);
   if(d<R){if(d>1e-6){x=nx+dx/d*R;z=nz+dz/d*R;}else{const o=[[c.minX-R-x,0],[c.maxX+R-x,0],[0,c.minZ-R-z],[0,c.maxZ+R-z]].sort((a,b)=>Math.abs(a[0]+a[1])-Math.abs(b[0]+b[1]))[0];x+=o[0];z+=o[1];}}}
 }
 for(const n of npcs.avatars)if(n!==self){const dx=x-n.x,dz=z-n.z,d=Math.hypot(dx,dz),m=R*2;if(d<m&&d>1e-6){x=n.x+dx/d*m;z=n.z+dz/d*m;}}
 if(self!==player){const dx=x-player.x,dz=z-player.z,d=Math.hypot(dx,dz),m=R*2;if(d<m&&d>1e-6){x=player.x+dx/d*m;z=player.z+dz/d*m;}}
 return {x,z};
}
ctx.collide=collide;npcs.setCollide?.(collide);

// ── 입력·카메라(3인칭 뒤 따라가기. 드래그로 돌리기, 휠·핀치로 멀리·가까이)
const input=createInput({canvas:renderer.domElement,mobile});
const cam={yaw:sp.heading,pitch:.28,dist:mobile?3.6:3.2,min:1.6,max:7,target:new THREE.Vector3()};
input.onLook((dx,dy)=>{cam.yaw-=dx*.006;cam.pitch=THREE.MathUtils.clamp(cam.pitch+dy*.004,-.15,1.1);});
input.onZoom(k=>{cam.dist=THREE.MathUtils.clamp(cam.dist*k,cam.min,cam.max);});
let autoWalk=null; // HUD "재떨이로 가기" 같은 자동 이동 목표 {x,z,done}
function updatePlayer(dt){
 const mv=input.move(); // {forward,side,run}
 let dirX=0,dirZ=0;
 if(mv.forward||mv.side){autoWalk=null;
  const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
  dirX=fx*mv.forward+rx*mv.side;dirZ=fz*mv.forward+rz*mv.side;}
 else if(autoWalk){const dx=autoWalk.x-player.x,dz=autoWalk.z-player.z,d=Math.hypot(dx,dz);if(d<.12){const w=autoWalk;autoWalk=null;if(w.heading!==undefined)player.heading=w.heading;w.done?.();}else{dirX=dx/d;dirZ=dz/d;}}
 const len=Math.hypot(dirX,dirZ);let moved=0;
 const busy=smoker.blocksMove?.();
 if(len>0&&!busy){dirX/=len;dirZ/=len;const running=mv.run&&!smoker.active;const speed=WALK_SPEED*(running?RUN_MUL:1);
  const want={x:player.x+dirX*speed*dt,z:player.z+dirZ*speed*dt},got=collide(want.x,want.z);
  moved=Math.hypot(got.x-player.x,got.z-player.z);player.x=got.x;player.z=got.z;player.heading=Math.atan2(-dirX,-dirZ);
  player.update(dt,{moved,running});}
 else player.update(dt,{moved:0});
 dispatch('lounge:tick-player',{x:player.x,z:player.z,moving:player.moving});
}
function updateCamera(dt){
 // 걸을 때는 카메라가 몸 뒤쪽으로 천천히 돌아온다(입력이 없을 때만). 서 있으면 그대로 둔다.
 if(player.moving&&!input.looking()&&!autoWalk){let d=player.root.rotation.y-cam.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));cam.yaw+=d*(1-Math.exp(-dt*1.2));}
 cam.target.set(player.x,.62,player.z);
 const cp=Math.cos(cam.pitch),want=new THREE.Vector3(cam.target.x+Math.sin(cam.yaw)*cam.dist*cp,cam.target.y+Math.sin(cam.pitch)*cam.dist+.25,cam.target.z+Math.cos(cam.yaw)*cam.dist*cp);
 // 벽·부스에 카메라가 묻히지 않게 옥상 안쪽으로 당긴다(난간 밖 1m까지는 허용).
 const b=rooftop.bounds;want.x=THREE.MathUtils.clamp(want.x,b.minX-1.2,b.maxX+1.2);want.z=THREE.MathUtils.clamp(want.z,b.minZ-1.2,b.maxZ+1.2);want.y=Math.max(.35,Math.min(want.y,rooftop.ceilingAt?.(want.x,want.z)??99));
 camera.position.lerp(want,1-Math.exp(-dt*10));camera.lookAt(cam.target);
}

// ── HUD(수첩 톤 카드·채팅·흡연 버튼·로비)
const hud=createHud({ctx,npcs,smoker,audio,timeState,TIME_PRESETS,profile,
 onProfile(p){Object.assign(profile,p);saveProfile(profile);if(p.outfit)player.setOutfit(p.outfit);if(p.nickname)player.name=p.nickname;if('muted' in p)audio.setMuted(p.muted);if(p.timeMode){timeState.mode=p.timeMode;}},
 goTo(spot){autoWalk=spot;},
});
ctx.hud=hud;
input.onAction((a,down)=>hud.press?.(a,down)); // 담배 키(Space·F 꾹, R·N·T 묘기, 1~4 담배 고르기)
const sceneCtl=createScene({setTime:m=>{timeState.mode=m;applyEnvironment();},dispatch,profile,save:p=>{Object.assign(profile,p);saveProfile(profile);}}); // 상황 고르기(출근 전·점심·퇴근·회식 후)
const spots=createSpots({ctx,scene:sceneCtl,query:q,goTo(spot){autoWalk=spot;}}); // 난간 기대기·벤치 앉기·캔커피 단추와 자세
const moment=createMoment({audio,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}); // 첫 모금 연출(카메라·가장자리 색·주변 소리)
// 같이 피우기(실시간 멀티): ?multi=방(기본 옥상-1)&server=ws://… 로 바로 참가, 아니면 HUD '👥 같이 피우기'.
const multi=createLoungeMulti({ctx,spots,envUrl:import.meta.env.VITE_MULTI_SERVER_URL});ctx.multi=multi;
const multiUi=installLoungeMultiUi({multi,ctx,hud});
// 처음 온 사람(로비 카드가 떠 있음)은 닉네임을 정한 뒤에 들어간다 — 서버 이름은 접속할 때 정해지므로. 주소에 &name=이 있으면 바로.
// 옛 주소 ?multi=옥상-1은 서버 고르기 창을 건너뛰고 바로 참가. 아니면 로딩(과 첫 로비 카드) 뒤 서버 고르기 창(점검 스크립트는 ?serverpick=on일 때만).
const afterIntro=fn=>{if(!profile.seenIntro){const h=setInterval(()=>{if(profile.seenIntro){clearInterval(h);fn();}},300);}else fn();};
const pickMode=serverPickMode(location.search,!!navigator.webdriver);
if(multi.params.auto){const go=()=>multi.join({room:multi.params.room,name:multi.params.name??''});
 if(multi.params.name===null)afterIntro(go);else go();}
else if(pickMode==='show'&&multiUi){if(!multi.joined)multiUi.open({closable:false});} // 로비 카드보다 먼저: 허브 → 체험 → 서버 카드 → 입장(11-08). 첫 방문 닉네임은 서버 카드 칸에서 받는다

// ── 크기·화질
function resize(){const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio,mobile?1.5:2);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setPixelRatio(dpr);renderer.setSize(w,h);toon.pipeline.resize(mobile?1:2,w,h,dpr);}
addEventListener('resize',resize);resize();

// ── 메인 루프
const clock=new THREE.Clock();let frames=0,last=performance.now(),fps=60;
applyEnvironment();updateCamera(1);
renderer.setAnimationLoop(()=>{
 const dt=Math.min(.05,clock.getDelta());
 updatePlayer(dt);
 npcs.update(dt);spots.update(dt);multi.update(dt);
 rooftop.update?.(dt,env,camera);
 const sm=smoker.status?.();audio.update?.(dt,{env,player,draw:sm?.state==='inhale'?sm.draw:0});
 updateCamera(dt);moment.update(dt);
 applyEnvironment();
 hud.update(dt);multiUi?.update(dt);
 toon.pipeline.render(dt);
 frames++;const now=performance.now();if(now-last>1000){fps=frames*1000/(now-last);frames=0;last=now;}
});
loading?.classList.add('done');setTimeout(()=>loading?.remove(),700);
dispatch('lounge:ready',{});

// 진단·자동 점검용(브라우저 콘솔 window.lounge)
window.lounge={ctx,player,npcs,smoker,hud,rooftop,timeState,cam,spots,scene:sceneCtl,multi,
 get fps(){return fps;},
 setTime(mode){timeState.mode=mode;applyEnvironment();},
 goTo(spot){autoWalk=spot;},
 teleport(x,z,heading){player.place(x,z,heading);cam.yaw=heading??cam.yaw;},
 setCam(o){Object.assign(cam,o);},
 status(){return {multi:multi.status(),fps:+fps.toFixed(1),player:{x:+player.x.toFixed(2),z:+player.z.toFixed(2),heading:+player.heading.toFixed(2),outfit:player.outfit},smoke:smoker.status?.(),npcs:npcs.status?.(),time:timeState.mode,phase:document.documentElement.dataset.hudTime,calls:renderer.info.render.calls,tris:renderer.info.render.triangles};},
};
