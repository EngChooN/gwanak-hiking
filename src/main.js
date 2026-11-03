import * as THREE from 'three';
import {contactGroundError} from './contact-footprint.js';
import './style.css';
import {mountRestUI} from './rest-ui.js';
import {route,sample,MATERIALS,checkpoints,DEMO_START,durationBetween,floorHeight as routeFloorHeight,strideFor} from './route.js';
import {initialState,restore,SAVE_KEY,advance,setPose,positionAt,isOffTrail,playerPosition,setPlayerPosition,courseDistance,COURSE_LENGTH} from './movement.js';
import {createLoadingTracker,createStabilityCounter,LOADING_EVENT,START_EVENT} from './loading.js';
import {insidePlaza,fromGate} from './plaza.js';
import {createNightLighting} from './night-lighting.js';
import {FACILITY_LAMPS} from './night-lighting-config.js';
import {createOutfitSystem} from './hiker-outfits.js';
import {pickerPlan,loadOutfit,saveOutfit,OUTFITS} from './outfit-config.js';
import {renderOutfitPreviews,mountOutfitPicker,mountOutfitMenu} from './outfit-picker.js';
import {movementHeading} from './hiker-facing.js';
import {loadRealisticHiker} from './realistic-hiker.js';
import {createWalkingGround} from './walking-ground.js';
import {bindInput} from './input.js';
import {createLook,turnLook,faceForward,updateLook} from './view.js';
import {setupRendering,retractCamera} from './rendering.js';
import {loadLandscape} from '../assets/realistic/load-landscape.js';
import {loadOptionalModels} from './realistic-models.js';
import {FootstepAudio,SOUND_SAVE_KEY} from './footstep-audio.js';
import {AmbientAudio} from './ambient-audio.js';
import {VOLUME_SAVE_KEY} from './ambient-config.js';
import {createFrameMetrics} from './performance-metrics.js';
import {AdaptiveQuality} from './adaptive-quality.js';
// 로딩 신호와 준비 완료 Promise는 가장 먼저 만든다. 'hiking:start'(또는 hiking.start()) 전에는 입력·시간·자동 걷기를 막는다.
const loading=createLoadingTracker({emit:detail=>window.dispatchEvent(new CustomEvent(LOADING_EVENT,{detail}))});
let resolveReady,rejectReady,started=false,startRequested=false,beginHike=()=>{};const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});readyPromise.catch(()=>{});
// 복장 선택 화면이 뜨면 카드를 고르는 순간이 '시작'이다. ?outfit=1~4나 자동화 브라우저는 건너뛴다.
const outfitPlan=pickerPlan({search:location.search,webdriver:navigator.webdriver===true,saved:(()=>{try{return loadOutfit(localStorage);}catch{return null;}})()});
const manualStart=outfitPlan.show||document.documentElement.dataset.startMode==='manual'||new URLSearchParams(location.search).get('startMode')==='manual';
const failLoading=e=>{if(started)return;const detail=loading.fail(e);rejectReady(Object.assign(new Error(detail?.error??String(e)),{detail}));};
window.addEventListener('error',e=>{if(!started&&loading.phase==='loading')failLoading(e.error??e.message);});
window.addEventListener('unhandledrejection',e=>{if(!started&&loading.phase==='loading')failLoading(e.reason);});
window.hiking={started:false,ready:()=>readyPromise,start:()=>{startRequested=true;beginHike();return started;},loading:()=>loading.snapshot()};
window.addEventListener(START_EVENT,()=>window.hiking.start());
const $=id=>document.getElementById(id);let saved=null,storageOK=true;try{saved=localStorage.getItem(SAVE_KEY);}catch{storageOK=false;}
// ?start=entrance|gate|demo. 저장이 없는 첫 실행은 광장 출발이다.
const startParam=new URLSearchParams(location.search).get('start'),startOption={entrance:'plaza',plaza:'plaza',gate:'gate',demo:'demo'}[startParam];
const state=startOption?initialState({start:startOption}):saved?restore(saved):initialState({start:'plaza'});
loading.set('terrain',0);
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));storageOK=true;}catch{storageOK=false;$('resume-note').textContent='저장 공간을 사용할 수 없습니다. 이 세션의 진행만 유지됩니다.';}}
let soundEnabled=true;try{soundEnabled=localStorage.getItem(SOUND_SAVE_KEY)!=='false';}catch{}
const audioDebug=new URLSearchParams(location.search).has('audioDebug');
function updateAudioUI(){const a=audio.snapshot();$('sound-toggle').setAttribute('aria-pressed',String(a.enabled));$('sound-toggle').querySelector('span').textContent=a.enabled?'소리 켜짐':'소리 꺼짐';$('sound-toggle').title=a.errors.length?'일부 소리 재생 오류 · 조작 안내의 소리 출처 참고':a.context==='입력 대기'?'클릭하거나 키를 누르면 소리를 시작합니다':a.decoded<a.total?'발소리 준비 중':'발소리 켜기/끄기';if(audioDebug){$('sound-debug').hidden=false;$('sound-debug').textContent='발소리 확인 · '+a.context+' · '+a.decoded+'/'+a.total+'개\n'+a.logs.slice(-8).map(r=>`${r.step}걸음 ${r.material} #${String(r.variant).padStart(2,'0')} ${r.pan<0?'왼':'오른'}\n  ${r.eventElapsed.toFixed(3)}s · ${r.rate.toFixed(3)}배 · ${r.variationDb.toFixed(2)}dB`).join('\n');}}
const audio=new FootstepAudio({base:`${import.meta.env.BASE_URL}sounds/`,enabled:soundEnabled,onChange:updateAudioUI});
let userVolume=.7;try{const stored=localStorage.getItem(VOLUME_SAVE_KEY);if(stored!==null&&Number.isFinite(Number(stored)))userVolume=Math.max(0,Math.min(1,Number(stored)));}catch{}
audio.setVolume(userVolume);
const ambient=new AmbientAudio({base:`${import.meta.env.BASE_URL}sounds/ambient/`,enabled:soundEnabled,volume:userVolume});
const ambientCredits=document.createElement('p');ambientCredits.textContent='환경음은 실제 관악산 녹음이 아닌 CC0 임시음입니다. 구간·거리·고도·음량은 추정이며 현장·귀 검수 전입니다. 물·숲 바람·능선 바람·새: Thimras (Park Ambiences), 까마귀: fvcalderan (Crow)·zeroisnotnull (Crow Caw), 정상 웅성임: StarNinjas (Crowd Shouting/Speaking Ambience), 먼 도시: IgnasD (High Traffic Road Sounds). 목탁: 산디자인 자체 합성 임시음. 모노 32kHz 변환·크로스페이드·음량 정규화.';
const sourceLink=document.createElement('a');sourceLink.href=`${import.meta.env.BASE_URL}environment/출처-이용조건.md`;sourceLink.textContent='환경음 원본·제작자·작품 URL·CC0 이용 조건 전체 표';sourceLink.target='_blank';sourceLink.rel='noopener';document.querySelector('.sound-credits').append(ambientCredits,sourceLink);
const unlockSound=()=>{void audio.unlock();if(audio.context)ambient.attach(audio.context,audio.master);};window.addEventListener('pointerdown',unlockSound,{capture:true,passive:true});window.addEventListener('keydown',unlockSound,{capture:true});
window.addEventListener('hiking:sound',e=>{const {enabled,volume}=e.detail||{};if(typeof enabled==='boolean'){audio.setEnabled(enabled);ambient.setEnabled(enabled);if(enabled)unlockSound();try{localStorage.setItem(SOUND_SAVE_KEY,String(enabled));}catch{}}if(Number.isFinite(volume)){audio.setVolume(volume);ambient.setVolume(audio.volume);try{localStorage.setItem(VOLUME_SAVE_KEY,String(audio.volume));}catch{}}});
const QUALITY_SAVE_KEY='gwanak-quality-mode';let qualityMode=(()=>{const q=new URLSearchParams(location.search).get('quality');const m={auto:'auto',high:'2',balanced:'1',low:'0'}[q];if(m)return m;try{return localStorage.getItem(QUALITY_SAVE_KEY)||'auto';}catch{return'auto';}})();$('quality').onclick=()=>{const order=['auto','2','1','0'];qualityMode=order[(order.indexOf(qualityMode)+1)%order.length];try{localStorage.setItem(QUALITY_SAVE_KEY,qualityMode);}catch{}$('quality').textContent=`화질 ${{auto:'자동','2':'높음','1':'균형','0':'낮음'}[qualityMode]}`;try{quality=qualityMode==='auto'?(mobile?1:2):Number(qualityMode);goodWindows=0;resize();updateUI();}catch{}$('quality').blur();};
$('sound-toggle').onclick=()=>{window.dispatchEvent(new CustomEvent('hiking:sound',{detail:{enabled:!audio.enabled}}));$('sound-toggle').blur();};
window.addEventListener('hiking:step',e=>ambient.onStep(audio.play(e.detail,{view:state.view,paused:state.paused})));updateAudioUI();
const inspectionFov=Number(new URLSearchParams(location.search).get('fov'));const inspectionMode=[55,70].includes(inspectionFov);const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.08,30000);let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});}catch{$('resume-note').textContent='3D를 실행할 수 없습니다. WebGL을 지원하는 브라우저에서 열어 주세요.';failLoading(new Error('WebGL을 사용할 수 없습니다'));throw new Error('WebGL unavailable');}
// 실패를 로딩 오류 신호로 바꾸고 그대로 다시 던진다.
async function guard(promise){try{return await promise;}catch(e){failLoading(e);throw e;}}
const mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const landscape=await guard(loadLandscape({base:`${import.meta.env.BASE_URL}assets/realistic/generated/`,maxContactMapSize:renderer.capabilities.maxTextureSize}));loading.set('terrain',.6);
const walkingGround=createWalkingGround(landscape);
// 광장(zone 'plaza')은 경로와 무관한 x,z. 높이는 landscape.surfaceHeight(길 안 노면 규칙)를 쓴다.
const worldPosition=()=>state.zone==='plaza'?[state.plaza.x,walkingGround.height(state.plaza.x,state.plaza.z,false),state.plaza.z]:positionAt(state.s,state.lateral,walkingGround);
const offTrailNow=()=>state.zone==='route'&&isOffTrail(state.s,state.lateral);
const baseHeading=()=>state.zone==='plaza'?state.plaza.heading:sample(state.s).heading;
const floorHeight=s=>s===state.s?worldPosition()[1]:positionAt(s,state.lateral,walkingGround)[1];
const lighting=setupRendering(renderer,scene,camera,mobile,landscape.sky);
const {TerrainStream}=await import('./terrain.js');const terrain=new TerrainStream(scene,landscape,camera);
const startingPosition=worldPosition();camera.position.set(startingPosition[0],startingPosition[1]+1.6,startingPosition[2]);await guard(Promise.resolve(terrain.update()));loading.set('terrain',.8);
await guard(landscape.streamFar());loading.set('terrain',.9);await guard(landscape.streamWater());loading.done('terrain');
let cityBusy=false;
async function streamAvailableCities(onProgress=()=>{}){if(cityBusy)return;cityBusy=true;try{const chunks=landscape.manifest.cityChunks;for(const [i,chunk] of chunks.entries()){await landscape.streamCity(chunk.id);onProgress((i+1)/(chunks.length+1));await new Promise(resolve=>setTimeout(resolve,0));}await landscape.finalizeCities();landscape.status.ready=true;}catch(e){landscape.status.errors.push(e.message);}finally{cityBusy=false;}}
const initialCitiesReady=streamAvailableCities(f=>loading.set('environment',.3+.6*f));
setInterval(async()=>{try{if(await landscape.refreshManifest()){await landscape.streamWater();void streamAvailableCities();}}catch(e){landscape.status.errors.push(e.message);}},30000);
const initialNatureReady=loadOptionalModels(landscape,`${import.meta.env.BASE_URL}assets/realistic/generated/nature/`,f=>loading.set('nature',.95*f)).catch(e=>landscape.status.errors.push(e.message));
// 날씨·시각 환경은 지형과 함께 시작하고 여기서 완료를 기다린다.
const environmentReady=guard(Promise.resolve(lighting.environmentReady)).then(()=>loading.set('environment',.3));
let firstHeading=true;const hiker=await guard(loadRealisticHiker(`${import.meta.env.BASE_URL}assets/realistic/models/hiker/Hiker.glb`));loading.done('hikers');const avatar=hiker.scene;scene.add(avatar);
let outfits=null;const setOutfit=id=>{if(!outfits)return null;const applied=outfits.apply(id);try{saveOutfit(localStorage,applied);}catch{}return applied;};
try{outfits=createOutfitSystem(avatar);outfits.apply(outfitPlan.outfit);}catch(e){landscape.status.errors.push(`복장: ${e.message}`);}avatar.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
const look=createLook();let moving=false,speed=0,last=performance.now(),saveAt=last,uiAt=0,frameSum=0,frames=0,quality=qualityMode==='auto'?(mobile?1:2):Number(qualityMode),qualityWindow=performance.now(),goodWindows=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const touchQuery=matchMedia('(pointer: coarse)');const updateDevice=()=>document.body.classList.toggle('touch',touchQuery.matches||navigator.maxTouchPoints>0);touchQuery.addEventListener('change',updateDevice);updateDevice();
const adaptiveQuality=new AdaptiveQuality(quality);
// 비용 분리 검수에서만 같은 DPR·그림자 조건을 고정한다. 일반 실행에는 적용하지 않는다.
const aoDiagnosticMode=['off','normal','full'].includes(new URLSearchParams(location.search).get('aoMode'));
avatar.userData.metricKind='등산객';
// 리사이즈·자동 화질 전환은 이미 준비된 경로만 선택한다.
function resize(){const width=innerWidth,height=innerHeight;camera.aspect=width/height;camera.far=30000;camera.fov=inspectionMode?inspectionFov:height>width?78:65;camera.updateProjectionMatrix();renderer.setSize(width,height);adaptiveQuality.setViewport(`${width}x${height}@${devicePixelRatio}`);if(adaptiveQuality.cap!==quality)adaptiveQuality.setCap(quality);const settings=adaptiveQuality.settings,dpr=Math.min(devicePixelRatio,settings.dpr);renderer.setPixelRatio(dpr);lighting.resize(quality,width,height,dpr,settings);}window.addEventListener('resize',resize);resize();
function pause(){if(!started)return;audio.stop();ambient.setPaused(true);state.paused=true;state.auto=false;input.clear();save();}
const teaReady=()=>state.pose==='sit'&&hiker.interaction?.sitLinear>=.999;
mountRestUI();
function command(id){if(!started)return;if(document.querySelector('dialog[open]')&&!['map-toggle','help-toggle'].includes(id))return;if(id==='sit'){setPose(state,state.pose==='stand'?'sit':'stand');state.paused=false;}if(id==='tea'&&teaReady()){setPose(state,'tea');state.paused=false;}if(id==='stop-auto')state.auto=false;if(id==='auto'){const enable=!state.auto;setPose(state,'stand');state.auto=enable;state.paused=false;}if(id==='pause'){if(state.paused){state.paused=false;}else pause();}if(id==='face-forward')faceForward(look);if(id==='view')state.view=state.view==='first'?'third':'first';if(id==='map-toggle'||id==='help-toggle'){const dialog=$(id==='map-toggle'?'map':'help');if(dialog.open)dialog.close();else{pause();dialog.showModal();}}save();updateUI();}
const input=bindInput(command,(dx,dy)=>turnLook(look,dx,dy),dz=>{if(state.view==='third')look.orbit=THREE.MathUtils.clamp(look.orbit+dz,2.2,12);});for(const id of ['auto','pause','view','face-forward','map-toggle','help-toggle'])$(id).onclick=()=>{command(id);$(id).blur();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());for(const [id,start] of [['start-entrance','plaza'],['start-demo','demo']])$(id).onclick=()=>{Object.assign(state,initialState({start}),{paused:false});save();location.replace(location.pathname+location.hash);};
$('lock').onclick=()=>{try{const p=$('world').requestPointerLock();p?.catch(()=>{});$('help').close();}catch{}};
window.addEventListener('hiking:command',e=>{if(['sit','tea','auto','pause','view'].includes(e.detail?.id))command(e.detail.id);});
for(const id of ['sit','tea'])$(id)?.addEventListener('click',()=>command(id));
const lifecyclePause=()=>{pause();if(document.pointerLockElement)document.exitPointerLock();};document.addEventListener('visibilitychange',()=>{if(document.hidden)lifecyclePause();});window.addEventListener('blur',lifecyclePause);window.addEventListener('pagehide',lifecyclePause);document.addEventListener('freeze',lifecyclePause);$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('resume-note').textContent='3D 연결이 끊겼습니다. 새로고침하면 저장 지점에서 이어집니다.';});
const pad=n=>String(n).padStart(2,'0');const time=s=>`${pad(Math.floor(s/3600))}:${pad(Math.floor(s/60)%60)}:${pad(Math.floor(s)%60)}`;
const minX=Math.min(...route.points.map(p=>p.x)),maxX=Math.max(...route.points.map(p=>p.x)),minZ=Math.min(...route.points.map(p=>p.z)),maxZ=Math.max(...route.points.map(p=>p.z));
const mapScale=Math.min(250/(maxX-minX),250/(maxZ-minZ)),mapX=p=>160+(p.x-(minX+maxX)/2)*mapScale,mapY=p=>150+(p.z-(minZ+maxZ)/2)*mapScale;$('map-path').setAttribute('d',route.points.map((p,i)=>`${i?'L':'M'}${mapX(p)} ${mapY(p)}`).join(' '));
function updateUI(){const p=sample(state.s),plaza=state.zone==='plaza',course=courseDistance(state);window.dispatchEvent(new CustomEvent('hiking:state',{detail:{...state,plaza:state.plaza&&{...state.plaza},speed,teaReady:teaReady(),offTrail:offTrailNow(),zone:state.zone,courseDistance:course,courseLength:COURSE_LENGTH,position:playerPosition(state,walkingGround),started}}));$('status').textContent=state.paused?'일시정지':state.pose==='tea'?'차 마시는 중':state.pose==='sit'?'앉아서 쉬는 중':state.running?'달리는 중':moving?'걷는 중':'쉬는 중';$('progress-fill').style.width=`${course/COURSE_LENGTH*100}%`;{const total=Math.round(COURSE_LENGTH),done=Math.min(total,Math.round(course)),fmt=n=>n.toLocaleString('ko-KR');$('distance').textContent=`${plaza?'출발 전 · 광장 · ':''}${fmt(done)} / ${fmt(total)} m`;$('remaining').textContent=`정상까지 ${fmt(total-done)} m`;}$('altitude').innerHTML=`${worldPosition()[1].toFixed(0)} <em>m</em>`;$('elapsed').textContent=time(state.elapsed);$('speed').innerHTML=`${(speed*3.6).toFixed(1)} <em>km/h</em>`;$('eta').textContent=`${Math.ceil(durationBetween(state.s,route.length)/60)}분`;$('surface').textContent=plaza?'광장 · 포장':offTrailNow()?'길 밖 · 흙·낙엽':MATERIALS[p.material].label;$('quality').textContent=`화질 ${['낮음','균형','높음'][quality]} · ${qualityMode==='auto'?'자동':'고정'}`;$('auto').classList.toggle('active',state.auto);$('auto').setAttribute('aria-pressed',state.auto);$('pause').setAttribute('aria-pressed',state.paused);$('pause').querySelector('span').textContent=state.paused?'계속하기':'일시정지';$('view').querySelector('span').textContent=state.view==='first'?'3인칭':'1인칭';{const [x,,z]=worldPosition();$('map-dot').setAttribute('cx',mapX({x,z}));$('map-dot').setAttribute('cy',mapY({x,z}));}$('checkpoints').innerHTML=checkpoints.map((c,i)=>`<div>${state.checkpoints.includes(c.id)?'●':'○'} ${c.name} · 임시${c.s<state.s&&!state.checkpoints.includes(c.id)?' · 시범 시작 전 구간':''}</div>`).join('');}
if(state.zone==='plaza'){$('resume-note').textContent='출발 전 · 일주문 앞 광장 · W/A/S/D로 둘러보거나 자동 걷기(R)로 출발하세요';}else if(saved&&!startOption){$('resume-note').textContent=`${[...checkpoints].reverse().find(c=>state.checkpoints.includes(c.id))?.name||'정상 접근'} · ${Math.round(state.s)}m 지점에서 이어왔습니다 · 계속하기를 눌러 주세요`;}else{$('resume-note').textContent='정상 접근 시범 구간 · 자동 걷기 또는 W로 출발하세요';}const hideResumeNote=()=>setTimeout(()=>{if(storageOK)$('resume-note').style.opacity='0';},3500);
const camGoal=new THREE.Vector3(),lookGoal=new THREE.Vector3();let cameraReady=false,summitShown=state.s>=route.length;let firstFrameMs=null;const clockStart=performance.now();
const frameMetrics=createFrameMetrics();
window.__hikingPerformance={reset:()=>frameMetrics.reset(),report:()=>frameMetrics.report()};
const inspectionBearing=new URLSearchParams(location.search).get('bearing');
const entrancePhoto=new URLSearchParams(location.search).has('entrancePhoto'),entrancePhotoDistance=Number(new URLSearchParams(location.search).get('entrancePhoto'))||8.8;
const forward=new THREE.Vector3();
const stability=createStabilityCounter({count:12,limitMs:100});let stabilizingSince=null;
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
function frame(now){
 const workStarted=performance.now();
 requestAnimationFrame(frame);
 const frameSeconds=(now-last)/1000,dt=Math.min(frameSeconds,.1);last=now;
 const before=worldPosition(),beforeY=offTrailNow()||state.zone==='plaza'?before[1]:sample(state.s).y;
 // 출발 전(로딩 중)에는 입력을 읽어 버리고 이동·시간·자동 걷기를 진행하지 않는다.
 const cmd=started?input.read():{forward:0,side:0,run:false,turn:0};if(started)updateLook(look,dt,cmd.turn);
 // 광장에서 직접 걸으면 시선 방향을 이동 기준으로 삼는다(드래그한 쪽으로 걷기). 코스·광장 전환 때는 카메라 방향을 보존한다.
 if(state.zone==='plaza'&&(cmd.forward||cmd.side)&&!look.reset&&!state.paused){state.plaza.heading=wrapAngle(state.plaza.heading+look.yaw);look.yaw=0;}
 const zoneBefore=state.zone,cameraHeadingBefore=baseHeading()+look.yaw;
 speed=started?frameMetrics.stage('movement',()=>advance(state,cmd,dt,detail=>window.dispatchEvent(new CustomEvent('hiking:step',{detail})),walkingGround)):0;moving=speed>0;
 if(state.zone!==zoneBefore){look.yaw=wrapAngle(cameraHeadingBefore-baseHeading());look.reset=null;}
 const p=sample(state.s),[x,y,z]=worldPosition(),heading=baseHeading()+look.yaw;
 const routeT=(state.s-p.start)/p.length,referenceMetres=state.zone==='plaza'?0:p.a.referenceMetres+(p.b.referenceMetres-p.a.referenceMetres)*routeT;
 frameMetrics.stage('ambient',()=>ambient.update({referenceMetres,elevation:y,view:state.view,paused:state.paused||!started,dt:frameSeconds}));
 avatar.position.set(x,y,z);
 if(firstHeading){hiker.snapTo(baseHeading());firstHeading=false;}
 // 카메라 기준과 독립. 충돌·정지 시에는 마지막 방향을 유지한다.
 if(moving)hiker.turnTo(movementHeading(before,[x,0,z],avatar.rotation.y),dt);
 const horizontal=Math.hypot(x-before[0],z-before[2]);
 const travelSlope=horizontal>1e-7?((offTrailNow()||state.zone==='plaza'?y:p.y)-beforeY)/horizontal:0;
 const offGround=offTrailNow()||state.zone==='plaza',surfaceHeight=(x,z)=>walkingGround.height(x,z,offTrailNow());
 avatar.visible=state.view==='third';const stepCycle=(state.steps+state.stepPhase)*Math.PI;
 frameMetrics.stage('hiker',()=>hiker.update({clip:!moving?'Idle':travelSlope>.15?'Climb':'Walk',distance:state.steps+state.stepPhase,stride:1,stepLength:offGround?.7:strideFor(p),idleSeconds:inspectionMode?0:now/1000,slope:travelSlope,pose:state.pose,teaProgress:state.pose==='tea'?1-state.teaRemaining/3:0,running:state.running,speed,dt:state.paused?0:dt,surfaceHeight}));
 const footContact=frameMetrics.stage('contact',()=>hiker.ground({s:state.s,lateral:state.lateral,moving,phase:state.steps+state.stepPhase,floorHeight,sample,surfaceHeight,pose:state.pose}));
 frameMetrics.stage('camera',()=>{
  const eye=y+hiker.eyeHeight+(moving&&!reduced?Math.sin(stepCycle*2)*.025:0);
  const cameraHeading=inspectionBearing!==null?-Number(inspectionBearing)*Math.PI/180:heading;
  forward.set(-Math.sin(cameraHeading),0,-Math.cos(cameraHeading));
  if(state.view==='first'){camGoal.set(x,eye,z);lookGoal.copy(camGoal).addScaledVector(forward,10);lookGoal.y+=Math.tan(look.pitch)*10;}
  else{lookGoal.set(x,y+(1.15-(1.6-hiker.eyeHeight)*2/3),z);camGoal.copy(lookGoal).addScaledVector(forward,-look.orbit*Math.cos(look.pitch));camGoal.y+=1-look.orbit*Math.sin(look.pitch);camGoal.copy(retractCamera(lookGoal,camGoal,landscape.cameraCollisionObjects(lookGoal,camGoal),camera));}
  if(state.view==='third')camera.position.copy(camGoal);else camera.position.lerp(camGoal,cameraReady?1-Math.exp(-dt*10):1);
  if(entrancePhoto){const a=landscape.status.entrance.frame,front=new THREE.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw));const lateral=new THREE.Vector3(Math.cos(a.yaw),0,-Math.sin(a.yaw)).multiplyScalar(-.8);camera.position.set(a.x,a.y+1.6,a.z).addScaledVector(front,entrancePhotoDistance).add(lateral);lookGoal.set(a.x,a.y+2.75,a.z).add(lateral);camera.fov=55;camera.updateProjectionMatrix();}
  camera.lookAt(lookGoal);cameraReady=true;
 });
 frameMetrics.stage('terrain',()=>terrain.update(state.s,quality));
 night.update(dt,{camera,avatar,view:state.view,zone:state.zone,s:state.s,hiker,hatKind:OUTFITS.find(o=>o.id===outfits?.current)?.head.hat?.kind??'none'});
 frameMetrics.stage('render',()=>lighting.render(avatar.position));
 frameMetrics.frame(frameSeconds*1000,{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,breakdown:lighting.status.breakdown});
 if(firstFrameMs===null)firstFrameMs=performance.now()-clockStart;
 if(now-uiAt>150){updateUI();uiAt=now;}
 if(started&&now-saveAt>700){save();saveAt=now;}
 if(!started&&loading.phase==='loading')checkStability(frameSeconds*1000,now);
 if(state.zone==='route'&&state.s>=route.length&&!summitShown){summitShown=true;$('summit-summary').textContent=`이번 체험 ${state.distance.toFixed(1)}m · 걸은 시간 ${time(state.elapsed)} · ${state.steps}걸음 · 상승 ${state.ascent.toFixed(1)}m · ${state.sessions}회 접속. DSM 지형 체험 기록입니다.`;$('summit').showModal();save();}
 if(!document.hidden&&frameSeconds>0){frameSum+=frameSeconds;frames++;}
 if(now-qualityWindow>4000){
  const fps=frames/frameSum;
  window.__hikingMetrics={landscape:{...landscape.status},rendering:{...lighting.status},footContact,assetsLoaded:true,fps,quality,loadedChunks:terrain.loaded.size,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,firstFrameMs,performance:frameMetrics.report()};
  frames=frameSum=0;qualityWindow=now;
 }
 if(!aoDiagnosticMode&&adaptiveQuality.sample(frameSeconds*1000,!document.hidden&&cameraReady,performance.now()-workStarted,lighting.status.ao)){resize();}
 if(window.__hikingMetrics)window.__hikingMetrics.adaptiveQuality={...adaptiveQuality.settings,dpr:renderer.getPixelRatio()};
}
updateUI();save();
await guard(Promise.all([initialCitiesReady.then(()=>environmentReady).then(()=>loading.done('environment')),initialNatureReady.then(()=>loading.done('nature'))]));
walkingGround.refreshObstacles();
landscape.status.sceneNodes=0;landscape.group.traverse(()=>landscape.status.sceneNodes++);
avatar.position.set(...startingPosition);
hiker.snapTo(baseHeading());
// 저장된 휴식은 멈춘 자세로 복원하고 차의 남은 시간을 보존한다.
if(state.pose!=='stand')for(let i=0;i<8;i++)hiker.update({clip:'Idle',pose:'sit',dt:.1});
hiker.update({clip:'Idle',pose:state.pose,dt:0,teaProgress:state.pose==='tea'?1-state.teaRemaining/3:0});
terrain.update(state.s,quality);
// 준비 조건: 출발점 반경 안 지형·노면, 가까운 LOD(숲·바위), 광장 시설, 등산객. 반경 60m를 12방향·5거리로 확인한다.
const READY_RADIUS=60,entrancePlazaStart=initialState({start:'plaza'}).plaza;
function readiness(){
 const [x0,,z0]=startingPosition,missing=[];let checked=0;
 for(let i=0;i<12;i++)for(const r of [0,8,20,40,READY_RADIUS]){if(!r&&i)continue;const a=i/12*Math.PI*2,x=x0+Math.cos(a)*r,z=z0+Math.sin(a)*r;checked++;if(!Number.isFinite(landscape.surfaceHeight(x,z))||!Number.isFinite(landscape.floorHeight(x,z)))missing.push([Math.round(x),Math.round(z)]);}
 const entrance=landscape.status.entrance;
 return {radius:READY_RADIUS,terrainSamples:checked,terrainMissing:missing,terrain:missing.length===0&&terrain.loaded.size>0,nearLod:landscape.status.natureReady===true,facilities:!!entrance?.frame&&!!entrance?.counts&&insidePlaza(entrancePlazaStart.x,entrancePlazaStart.z),hikers:!!avatar&&avatar.parent===scene,zone:state.zone};
}
const outfitMenu=outfits?mountOutfitMenu($('map'),{selected:outfits.current,onPick:setOutfit}):null;
const ready=readiness();if(!ready.terrain)failLoading(new Error(`출발점 반경 ${READY_RADIUS}m 지형 누락 ${ready.terrainMissing.length}곳`));
loading.set('facilities',ready.facilities?1:.5);if(!ready.facilities)failLoading(new Error('광장 시설을 불러오지 못했습니다'));
// 준비 실패는 위 error/unhandledrejection 수신기가 로딩 오류 신호로 바꾼다.
// 밤 조명: 가로등(공원 구간)·헤드랜턴·보안등. 실제 광원 수는 고정이라 여기서 한 번 만들고 prepare()가 함께 컴파일한다.
const sOfReference=m=>{const g=route.segments.find(seg=>seg.b.referenceMetres>=m)??route.segments.at(-1),a=g.a.referenceMetres,b=g.b.referenceMetres;return g.start+Math.max(0,Math.min(1,(m-a)/((b-a)||1)))*g.length;};
const facilityPoints=FACILITY_LAMPS.map(f=>{const s=f.metres!==undefined?sOfReference(f.metres):route.length-f.fromEnd,[cx,,cz]=positionAt(s,0,walkingGround),[x,,z]=positionAt(s,f.side,walkingGround);return {x,z,tx:cx,tz:cz,height:f.height};});
const night=createNightLighting({scene,renderer,place:(s,l)=>positionAt(s,l,walkingGround),groundHeight:(x,z)=>walkingGround.height(x,z,false),gatePoint:fromGate,facilityPoints,routeLength:route.length});
await lighting.prepare();last=performance.now();requestAnimationFrame(frame);
let readyInfo=null;
// 첫 프레임 안정: 셰이더 컴파일이 끝나고 프레임 간격 100ms 이하가 12번 이어지면 준비 완료. 15초가 지나면 느린 기기로 보고 진행한다.
function checkStability(frameMs,now){
 stabilizingSince??=now;const done=stability.sample(frameMs,!!lighting.status.compiling);
 loading.set('stabilizing',Math.min(.99,stability.fraction),{stableFrames:stability.stable});
 if(!done&&now-stabilizingSince<15000)return;
 readyInfo={...readiness(),stableFrames:stability.stable,stableTimeout:!done,firstFrameMs};
 if(!readyInfo.terrain||!readyInfo.nearLod||!readyInfo.facilities||!readyInfo.hikers){failLoading(new Error('출발점 주변 준비 조건 미충족'));return;}
 loading.ready({readiness:readyInfo});resolveReady({...loading.snapshot(),readiness:readyInfo});
 if(outfitPlan.show&&outfits){const previews=renderOutfitPreviews({renderer,avatar,apply:id=>outfits.apply(id)});outfits.apply(outfitPlan.outfit);
  mountOutfitPicker({previews,selected:outfitPlan.outfit,onPick:id=>{setOutfit(id);outfitMenu?.update(id);unlockSound();window.hiking.start();}});}
 if(!manualStart)startRequested=true;beginHike();
}
// '시작' 신호 이후에만 입력·경과 시간·자동 걷기가 진행된다. 로딩 중에 눌린 키는 버린다.
beginHike=()=>{
 if(started||!startRequested||loading.phase!=='ready')return;
 started=true;window.hiking.started=true;input.clear();look.yaw=0;look.reset=null;last=performance.now();loading.start();
 updateUI();hideResumeNote();window.dispatchEvent(new CustomEvent('hiking:started',{detail:{...loading.snapshot(),position:playerPosition(state,walkingGround)}}));
};
// 진단 전용 읽기 인터페이스. 위치 변경·시간 배속 기능은 제공하지 않는다.
window.__hiker=hiker;window.__surface=landscape.surfaceHeight;Object.assign(window.hiking,{outfit:()=>outfits&&{current:outfits.current,plan:outfitPlan,attachments:outfits.attachments(),info:outfits.info},setOutfit:id=>{const applied=setOutfit(id);outfitMenu?.update(applied);return applied;},outfitPreviews:(options={})=>{if(!outfits)return {};const keep=outfits.current,result=renderOutfitPreviews({renderer,avatar,apply:id=>outfits.apply(id),...options});outfits.apply(keep);return result;},readiness:()=>readyInfo??readiness(),position:()=>playerPosition(state,walkingGround),snapshot:()=>({...state}),audio:()=>audio.snapshot(),metrics:()=>window.__hikingMetrics,rendering:()=>JSON.parse(JSON.stringify({...lighting.status,fov:camera.fov,exposure:renderer.toneMappingExposure})),orientation:()=>({...look,camera:camera.position.toArray(),avatarHeading:avatar.rotation.y,routeHeading:sample(state.s).heading,zone:state.zone,baseHeading:baseHeading(),cameraHeading:baseHeading()+look.yaw}),groundCheck:()=>{const p=sample(state.s);return [-.5,0,.5].map(l=>landscape.groundCheck(p.x+p.nx*l,p.z+p.nz*l));},landscape:()=>({...landscape.status}),coordinates:()=>{const p=sample(state.s);const [x,y,z]=worldPosition();return {x,y,z};}});
window.hiking.night=()=>night.info();window.hiking.headlamp=on=>{if(typeof on==='boolean')night.toggleHeadlamp(),night.info().headlamp.on!==on&&night.toggleHeadlamp();else night.toggleHeadlamp();night.syncButton();return night.info().headlamp;};window.hiking.setOthers=list=>night.setOthers(list);
window.hiking.adaptive=()=>({...adaptiveQuality.snapshot(),dpr:renderer.getPixelRatio()});
window.hiking.contactOcclusion=value=>landscape.setContactOcclusion(value);
window.hiking.contactProbes=()=>landscape.contactCandidates(camera.position.x,camera.position.z,35,Infinity).map(point=>{
 const renderedGroundY=point.kind==='rock'?landscape.contactGroundY(point.x,point.z):undefined;
 const groundY=renderedGroundY??landscape.floorHeight(point.x,point.z);
 const projected=new THREE.Vector3(point.x,groundY+.03,point.z).project(camera);
 let screenBounds=null;
 if(point.worldBounds){const points=[];for(const x of [0,1])for(const y of [0,1])for(const z of [0,1]){
  const p=new THREE.Vector3(point.worldBounds[x?'max':'min'][0],point.worldBounds[y?'max':'min'][1],point.worldBounds[z?'max':'min'][2]).project(camera);points.push(p);
 }if(points.every(p=>p.z>=-1&&p.z<=1))screenBounds={minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};}
 return {...point,groundY,renderedGroundY,analyticGroundY:landscape.floorHeight(point.x,point.z),signedGroundError:Number.isFinite(renderedGroundY)?point.y-renderedGroundY:null,groundError:contactGroundError(point,renderedGroundY),screenBounds,ndc:projected.toArray(),inFrame:projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1};
});
window.hiking.stairRockGrounding=()=>{
 const probes=window.hiking.contactProbes().filter(p=>p.kind==='rock'&&p.visible&&p.inFrame),errors=probes.filter(p=>p.groundError!==null).map(p=>p.groundError);
 return {visibleRendered:{count:probes.length,missing:probes.length-errors.length,max:errors.length?Math.max(...errors):null,mean:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,rows:probes},allStairSections:landscape.stairRockGrounding()};
};
// 캡처에서만 호출한다. 화면 화소를 지형에 역투영해 피벗 투영만으로 생기는 오인을 줄인다.
window.hiking.contactPixelProbe=(x,y,width=1440,height=900)=>{
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
 const hit=landscape.contactSurfaceHit(ray);if(!hit)return null;
 const p=hit.point;
 const contributors=landscape.contactCandidates(p.x,p.z,5).map(c=>{
  const r2=((p.x-c.x)**2+(p.z-c.z)**2)/c.radius**2;
  return {...c,weight:c.opacity*Math.max(0,1-r2)};
 }).filter(c=>c.weight>0).sort((a,b)=>b.weight-a.weight);
 let edge=Infinity;
 for(const s of route.segments){const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,len2=dx*dx+dz*dz,t=len2?Math.max(0,Math.min(1,((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/len2)):0;
  edge=Math.min(edge,Math.hypot(p.x-s.a.x-t*dx,p.z-s.a.z-t*dz)-Math.max(s.a.width??2,s.b.width??2)/2);
 }
 return {pixel:[x,y],world:p.toArray(),edgeDistance:edge,contactRegion:contributors.some(c=>Math.hypot(p.x-c.x,p.z-c.z)<= (c.baseRadius??c.radius)),contributors,
  note:'지형·노면 첫 교차점 기준. 물체 가림 및 음영 지도 선형 필터는 별도 화면 대조 필요'};
};
window.hiking.contactEdgeSamples=(width=1440,height=900)=>{
 const samples=[];
 for(let y=Math.ceil(height*.25);y<height-80;y+=24)for(let x=80;x<width-80;x+=24){
  const p=window.hiking.contactPixelProbe(x,y,width,height);
  if(p&&p.edgeDistance>=0&&p.edgeDistance<=2&&!p.contactRegion)samples.push({pixel:p.pixel,world:p.world});
 }
 return {samples,note:'24px 간격 지형 역투영, 노면 바깥 0~2m, 밑면 반경 제외. 물체 가림·UI 중첩은 화면 검수 필요'};
};
const footstepSnapshot=window.hiking.audio;
function ambientSnapshot(foot=footstepSnapshot()){const result=ambient.snapshot();result.normalizedPeakMinusAmbientDb=result.footstepPeakMinusAmbientDb;result.footstepPeakMinusAmbientDb=Number.isFinite(foot.footstepPeakDb)&&Number.isFinite(result.measuredRmsDb)?foot.footstepPeakDb-result.measuredRmsDb:null;return result;}
window.hiking.ambient=()=>ambientSnapshot();window.hiking.audio=()=>{const foot=footstepSnapshot();return {...foot,ambient:ambientSnapshot(foot)};};
