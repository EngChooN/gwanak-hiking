import * as THREE from 'three';
import {contactGroundError} from './contact-footprint.js';
import './style.css';
import './gadget-ui.css';
import './section-jump.css';
import {mountRestUI} from './rest-ui.js';
import {installHudToggle} from './hud-toggle.js';
import {installGadgetUI,viewfinderCrop} from './gadget-ui.js';
import {route,sample,MATERIALS,isStairs,checkpoints,DEMO_START,durationBetween,geographicToLocal,floorHeight as routeFloorHeight} from './route.js';
import {initialState,restore,SAVE_KEY,advance,setPose,positionAt,isOffTrail,playerPosition,setPlayerPosition,courseDistance,COURSE_LENGTH,strideAt,strideScaleFor,onStairs,lateralLimit} from './movement.js';
import {summitWalkMap,ROUTE_END,projectToRoute,SUMMIT_CENTER} from './summit.js';
import {sectionJumpEnabled,jumpTargets,summitSpot,mountSectionJump} from './section-jump.js';
import {createLoadingTracker,createStabilityCounter,LOADING_EVENT,START_EVENT} from './loading.js';
import {insidePlaza,fromGate} from './plaza.js';
import {createNightLighting} from './night-lighting.js';
import {FACILITY_LAMPS} from './night-lighting-config.js';
import {movementHeading} from './hiker-facing.js';
import {createToonStyle} from './toon/index.js';
import {createSeasonController,SEASON_LABEL} from './season.js';
import {loadToonHiker,prepareToonHikerGltf} from './toon/link-hiker.js';
import {createWalkingGround} from './walking-ground.js';
import {bindInput} from './input.js';
import {viewLocked,ensureGadget,setGadget,closeGadget,walkInput,zoomBy,zoomStep,setPhoneZoom,toggleSelfie,viewZoom,selfieActive,lookScale,hazeScale,selfiePosition,photoFilename} from './gadget.js';
import {LOOK_PROFILE} from './look-profile.js';
import {createLook,turnLook,faceForward,updateLook,createHeightFollow,followHeight} from './view.js';
import {createAutoView,startAutoView,stopAutoView,absorbUserYaw,stepAutoView,pathHeading} from './auto-view.js';
import {setupRendering,retractCamera} from './rendering.js';
import {loadLandscape} from '../assets/realistic/load-landscape.js';
import {loadOptionalModels} from './realistic-models.js';
import {FootstepAudio,SOUND_SAVE_KEY} from './footstep-audio.js';
import {AmbientAudio} from './ambient-audio.js';
import {VOLUME_SAVE_KEY} from './ambient-config.js';
import {mountInteractionUI,drawPhotoFrame} from './interaction-ui.js';
import {createInteraction} from './interaction-controller.js';
import {createTrailWorld} from './trail-world.js';
import {createTrailSound} from './trail-sound.js';
import {installTrailHud} from './trail-hud.js';
import {canEatChocolate,eatChocolate,tickChocolate} from './trail-rules.js';
import {createInteractionSound} from './interaction-sound.js';
import {routeMeasure} from '../assets/realistic/interaction-sites.js';
import {STREAM_SPOTS} from './interaction-data.js';
import {createFrameMetrics} from './performance-metrics.js';
import {AdaptiveQuality} from './adaptive-quality.js';
import './hud-v2.css';
import './hud-notebook.css';
import {installNotebookHud,formatRemainKm} from './hud-notebook.js';
import {markLoad,installGlbTiming,loadTiming} from './load-timing.js';
import {LIMITS} from './device-profile.js';
import {loadFree,presetClock,FREE_START_KEY} from './free-settings.js';
import {setTimeOverride,seoulClock} from './daytime.js';
import {recordSummit} from './summit-records.js';
markLoad('main');installGlbTiming();
// 로딩 신호와 준비 완료 Promise는 가장 먼저 만든다. 'hiking:start'(또는 hiking.start()) 전에는 입력·시간·자동 걷기를 막는다.
const loading=createLoadingTracker({emit:detail=>window.dispatchEvent(new CustomEvent(LOADING_EVENT,{detail}))});
let resolveReady,rejectReady,started=false,startRequested=!!window.__hikingStartRequested,beginHike=()=>{};const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});readyPromise.catch(()=>{});
const manualStart=document.documentElement.dataset.startMode==='manual'||new URLSearchParams(location.search).get('startMode')==='manual';
const failLoading=e=>{if(started)return;const detail=loading.fail(e);rejectReady(Object.assign(new Error(detail?.error??String(e)),{detail}));};
window.addEventListener('error',e=>{if(!started&&loading.phase==='loading')failLoading(e.error??e.message);});
window.addEventListener('unhandledrejection',e=>{if(!started&&loading.phase==='loading')failLoading(e.reason);});
window.hiking={started:false,ready:()=>readyPromise,start:()=>{startRequested=true;beginHike();return started;},loading:()=>loading.snapshot()};
// 그래픽은 카툰 하나다(2026-11-06 실사 모드 제거). 공용 모듈의 style 인자는 'toon'으로 고정해 넘긴다.
const style='toon';window.hiking.style=style;
window.addEventListener(START_EVENT,()=>window.hiking.start());
const $=id=>document.getElementById(id);let saved=null,storageOK=true;try{saved=localStorage.getItem(SAVE_KEY);}catch{storageOK=false;}
// ?start=entrance|gate|demo|summit. 저장이 없는 첫 실행은 광장 출발이다.
const startParam=new URLSearchParams(location.search).get('start'),startOption={entrance:'plaza',plaza:'plaza',gate:'gate',demo:'demo',summit:'summit'}[startParam];
const state=ensureGadget(startOption?initialState({start:startOption}):saved?restore(saved):initialState({start:'plaza'}));
// 코스 중간에서 시작한 등산(?start=demo·summit, 구간 이동, 중간 지점에서 다시 출발)은 shortcut — 완등 횟수는 세지만 '가장 빠른 기록'에는 넣지 않는다.
if(startOption==='demo'||startOption==='summit')state.shortcut=true;
loading.set('terrain',0);
const multiMode=new URLSearchParams(location.search).has('multi');
function save(){if(multiMode)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(state.gadgetPrevView?{...state,view:state.gadgetPrevView}:state)); // 기구로 강제한 1인칭은 저장하지 않는다
storageOK=true;}catch{storageOK=false;$('resume-note').textContent='저장 공간을 사용할 수 없습니다. 이 세션의 진행만 유지됩니다.';}}
let soundEnabled=true;try{soundEnabled=localStorage.getItem(SOUND_SAVE_KEY)!=='false';}catch{}
const audioDebug=new URLSearchParams(location.search).has('audioDebug');
function updateAudioUI(){const a=audio.snapshot();$('sound-toggle').setAttribute('aria-pressed',String(a.enabled));$('sound-toggle').querySelector('span').textContent=a.enabled?'소리 켜짐':'소리 꺼짐';$('sound-toggle').title=a.errors.length?'일부 소리 재생 오류 · 조작 안내의 소리 출처 참고':a.context==='입력 대기'?'클릭하거나 키를 누르면 소리를 시작합니다':a.decoded<a.total?'발소리 준비 중':'발소리 켜기/끄기';if(audioDebug){$('sound-debug').hidden=false;$('sound-debug').textContent='발소리 확인 · '+a.context+' · '+a.decoded+'/'+a.total+'개\n'+a.logs.slice(-8).map(r=>`${r.step}걸음 ${r.material} #${String(r.variant).padStart(2,'0')} ${r.pan<0?'왼':'오른'}\n  ${r.eventElapsed.toFixed(3)}s · ${r.rate.toFixed(3)}배 · ${r.variationDb.toFixed(2)}dB`).join('\n');}}
const audio=new FootstepAudio({base:`${import.meta.env.BASE_URL}sounds/`,enabled:soundEnabled,onChange:updateAudioUI,style}); // 카툰은 가벼운 '톡톡' 소리를 두 걸음에 한 번
let userVolume=.7;try{const stored=localStorage.getItem(VOLUME_SAVE_KEY);if(stored!==null&&Number.isFinite(Number(stored)))userVolume=Math.max(0,Math.min(1,Number(stored)));}catch{}
audio.setVolume(userVolume);
const ambient=new AmbientAudio({base:`${import.meta.env.BASE_URL}sounds/ambient/`,enabled:soundEnabled,volume:userVolume});
const ambientCredits=document.createElement('p');ambientCredits.textContent='환경음은 실제 관악산 녹음이 아닌 CC0 임시음입니다. 구간·거리·고도·음량은 추정이며 현장·귀 검수 전입니다. 물·숲 바람·능선 바람·새: Thimras (Park Ambiences), 까마귀: fvcalderan (Crow)·zeroisnotnull (Crow Caw), 정상 웅성임: StarNinjas (Crowd Shouting/Speaking Ambience), 먼 도시: IgnasD (High Traffic Road Sounds). 목탁: 산디자인 자체 합성 임시음. 모노 32kHz 변환·크로스페이드·음량 정규화.';
const sourceLink=document.createElement('a');sourceLink.href=`${import.meta.env.BASE_URL}environment/출처-이용조건.md`;sourceLink.textContent='환경음 원본·제작자·작품 URL·CC0 이용 조건 전체 표';sourceLink.target='_blank';sourceLink.rel='noopener';document.querySelector('.sound-credits').append(ambientCredits,sourceLink);
const unlockSound=()=>{void audio.unlock();if(audio.context)ambient.attach(audio.context,audio.master);};window.addEventListener('pointerdown',unlockSound,{capture:true,passive:true});window.addEventListener('keydown',unlockSound,{capture:true});
window.addEventListener('hiking:sound',e=>{const {enabled,volume}=e.detail||{};if(typeof enabled==='boolean'){audio.setEnabled(enabled);ambient.setEnabled(enabled);if(enabled)unlockSound();try{localStorage.setItem(SOUND_SAVE_KEY,String(enabled));}catch{}}if(Number.isFinite(volume)){audio.setVolume(volume);ambient.setVolume(audio.volume);try{localStorage.setItem(VOLUME_SAVE_KEY,String(audio.volume));}catch{}}});
const QUALITY_SAVE_KEY='gwanak-quality-mode';let qualityMode=(()=>{const q=new URLSearchParams(location.search).get('quality');const m={auto:'auto',high:'2',balanced:'1',low:'0'}[q];if(m)return m;try{return localStorage.getItem(QUALITY_SAVE_KEY)||'auto';}catch{return'auto';}})();function setQualityMode(mode){qualityMode=mode;try{localStorage.setItem(QUALITY_SAVE_KEY,qualityMode);}catch{}$('quality').textContent=`화질 ${{auto:'자동','2':'높음','1':'균형','0':'낮음'}[qualityMode]}`;try{quality=qualityMode==='auto'?(mobile?0:2):Number(qualityMode);goodWindows=0;resize();updateUI();}catch{}}
$('quality').onclick=()=>{const order=['auto','2','1','0'];setQualityMode(order[(order.indexOf(qualityMode)+1)%order.length]);$('quality').blur();};
// 설정 탭의 화질 분절 단추(등산 수첩 HUD)는 모드를 바로 고른다.
window.addEventListener('hiking:quality',e=>{const m={auto:'auto',high:'2',balanced:'1',low:'0'}[e.detail?.mode];if(m)setQualityMode(m);});
$('sound-toggle').onclick=()=>{window.dispatchEvent(new CustomEvent('hiking:sound',{detail:{enabled:!audio.enabled}}));$('sound-toggle').blur();};
window.addEventListener('hiking:step',e=>ambient.onStep(audio.play(e.detail,{view:state.view,})));updateAudioUI();
const inspectionFov=Number(new URLSearchParams(location.search).get('fov'));const inspectionMode=[55,70].includes(inspectionFov);const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.08,30000);let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});}catch{$('resume-note').textContent='3D를 실행할 수 없습니다. WebGL을 지원하는 브라우저에서 열어 주세요.';failLoading(new Error('WebGL을 사용할 수 없습니다'));throw new Error('WebGL unavailable');}
// 실패를 로딩 오류 신호로 바꾸고 그대로 다시 던진다.
async function guard(promise){try{return await promise;}catch(e){failLoading(e);throw e;}}
const mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const toon=await guard(Promise.resolve().then(()=>createToonStyle({renderer,scene,camera,mobile})));
markLoad('toon');
// 계절: 서울 날짜(?season=로 바꿀 수 있음). hiking.setSeason(이름|null='날짜대로'), 'hiking:free-settings'·'hiking:set-season' 이벤트로도 바꾼다.
// 다시 로딩하지 않고 셰이더 값만 바뀐다. 바뀌면 'hiking:season' 이벤트를 보낸다.
const seasons=createSeasonController({onChange:st=>{toon?.setSeason(st.season);window.dispatchEvent(new CustomEvent('hiking:season',{detail:{...st,label:SEASON_LABEL[st.season]}}));}});
toon?.setSeason(seasons.season,{instant:true});
window.hiking.setSeason=(value,{instant=false}={})=>{if(!seasons.set(value))return false;if(instant)toon?.setSeason(seasons.season,{instant:true});return {...seasons.state};};
window.hiking.season=()=>({...seasons.state,label:SEASON_LABEL[seasons.season],weights:toon?.status.season?.weights??null});
window.addEventListener('hiking:set-season',e=>seasons.set(e.detail?.season??e.detail));
// 자유 설정(free-settings-ui.js): 바뀐 칸만 온다. 시간은 ?time= 처리(daytime.js), 날씨는 ?weather= 처리(weather.js)를 그대로 쓴다. 다시 로딩하지 않는다.
// 같은 탭에서 다시 열리면(sessionStorage) 고른 값을 처음부터 적용한다.
const freeAtLoad=(()=>{try{return loadFree(sessionStorage);}catch{return loadFree(null);}})();let weatherCtl=null,freeWeather=freeAtLoad.weather;
if(freeAtLoad.season){seasons.set(freeAtLoad.season);toon?.setSeason(seasons.season,{instant:true});}
setTimeOverride(freeAtLoad.time?presetClock(freeAtLoad.time):null);
window.addEventListener('hiking:free-settings',e=>{const d=e.detail||{};
 if('season' in d)seasons.set(d.season);
 if('time' in d)setTimeOverride(d.time?presetClock(d.time):null);
 if('weather' in d){freeWeather=d.weather;weatherCtl?.setOverride(d.weather);}
});
setInterval(()=>seasons.tick(),60000);
const landscape=await guard(loadLandscape({base:`${import.meta.env.BASE_URL}assets/realistic/generated/`,chunkBase:`${import.meta.env.BASE_URL}assets/shared/chunks/`,maxContactMapSize:renderer.capabilities.maxTextureSize,style,materialFactory:toon?.materialFactory??null,toon:toon&&{toonify:toon.toonify,patchFoliage:toon.patchFoliage,styleCity:toon.styleCity,natureParts:toon.natureParts}}));loading.set('terrain',.6);
// 카툰: 시설·입구·계단·풀 등 이미 만든 메시 재질을 MeshToon으로 바꾼다(같은 원본 재질은 캐시). 도시·원경·물은 load-landscape가 따로 칠한다.
markLoad('landscape');
const toonifyLandscape=()=>{if(toon)for(const child of landscape.group.children)if(!['SeoulCity2km','SeoulFar','HanRiverAndWater'].includes(child.name))toon.toonify(child,{kind:'prop'});};toonifyLandscape();
toon?.attachLandscape?.(landscape);
const walkingGround=createWalkingGround(landscape);
// 광장(zone 'plaza')은 경로와 무관한 x,z. 높이는 landscape.surfaceHeight(길 안 노면 규칙)를 쓴다.
const worldPosition=()=>state.zone==='plaza'?[state.plaza.x,walkingGround.height(state.plaza.x,state.plaza.z,false),state.plaza.z]:state.zone==='summit'?[state.summit.x,walkingGround.summit.height(state.summit.x,state.summit.z),state.summit.z]:positionAt(state.s,state.lateral,walkingGround);
// 광장·정상 구역은 코스와 무관한 x,z를 직접 걷는다(zone 'summit'은 정상 둘레 자유 이동).
const freeZone=()=>state.zone==='plaza'||state.zone==='summit';
const offTrailNow=()=>state.zone==='route'&&isOffTrail(state.s,state.lateral);
const baseHeading=()=>state.zone==='plaza'?state.plaza.heading:state.zone==='summit'?state.summit.heading:sample(state.s).heading;
const floorHeight=s=>s===state.s?worldPosition()[1]:positionAt(s,state.lateral,walkingGround)[1];
const lighting=setupRendering(renderer,scene,camera,mobile,landscape.sky,{style,toon});
weatherCtl=lighting.environment?.weather??null;if(freeWeather)weatherCtl?.setOverride(freeWeather);
const {TerrainStream}=await import('./terrain.js');const terrain=new TerrainStream(scene,landscape,camera);
const startingPosition=worldPosition();camera.position.set(startingPosition[0],startingPosition[1]+1.6,startingPosition[2]);await guard(Promise.resolve(terrain.update()));await guard(landscape.terrainReady(startingPosition));markLoad('first-chunk');loading.set('terrain',.8);
await guard(landscape.streamFar());loading.set('terrain',.9);await guard(landscape.streamWater());loading.done('terrain');markLoad('terrain');
let cityBusy=false;
async function streamAvailableCities(onProgress=()=>{}){if(cityBusy)return;cityBusy=true;try{const chunks=landscape.manifest.cityChunks;for(const [i,chunk] of chunks.entries()){await landscape.streamCity(chunk.id);onProgress((i+1)/(chunks.length+1));await new Promise(resolve=>setTimeout(resolve,LIMITS.cityChunkGapMs));}await landscape.finalizeCities();landscape.status.ready=true;}catch(e){landscape.status.errors.push(e.message);}finally{cityBusy=false;}}
// 서울 간선도로(seoul-surface.json)와 도심 건물(json 28개·약 20MB)은 출발점에 꼭 필요하지 않아 준비 완료 뒤 뒤에서 이어 받는다(2026-11-06 첫 로딩 단축). 청크 대기(hiking.chunks.ready)는 이것도 기다린다.
let backgroundCities=null;const startBackgroundCities=()=>backgroundCities??=landscape.streamRoads().catch(e=>{landscape.status.errors.push(`도로: ${e.message}`);}).then(()=>streamAvailableCities()).then(()=>markLoad('cities'));
setInterval(async()=>{try{if(await landscape.refreshManifest()){await landscape.streamWater();void streamAvailableCities();}}catch(e){landscape.status.errors.push(e.message);}},30000);
const natureBase=`${import.meta.env.BASE_URL}assets/toon/nature/`;
const initialNatureReady=loadOptionalModels(landscape,natureBase,f=>loading.set('nature',.95*f),{position:startingPosition,impostors:false}).then(r=>{toonifyLandscape();return r;}).catch(e=>landscape.status.errors.push(e.message));
// 날씨·시각 환경은 지형과 함께 시작하고 여기서 완료를 기다린다.
const environmentReady=guard(Promise.resolve(lighting.environmentReady)).then(()=>loading.set('environment',.3));
let firstHeading=true;const hikerUrl=`${import.meta.env.BASE_URL}assets/toon/models/hiker/HikerRig.glb`; // 뼈대만 남긴 14KB(원본 2MB, assets/source/build-toon-hiker-rig.mjs)
const hiker=await guard(loadToonHiker(hikerUrl));loading.done('hikers');markLoad('hiker');const avatar=hiker.scene;scene.add(avatar);
// 셰이더 미리 준비: 지형·하늘·등산객 재질이 생긴 지금 compileAsync를 걸어 두면, GPU가 숲 배치(CPU) 동안 병렬로 컴파일하고 뒤의 prepare()는 캐시를 쓴다(2026-11-06).
void lighting.compile().then(()=>markLoad('early-compile')).catch(()=>{});
if(toon)toon.toonify(avatar,{kind:'character'});avatar.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.outline;o.receiveShadow=!o.userData.noReceiveShadow;}});
const look=createLook(),autoView=createAutoView();let moving=false,speed=0,last=performance.now(),saveAt=last,uiAt=0,frameSum=0,frames=0,quality=qualityMode==='auto'?(mobile?0:2):Number(qualityMode),qualityWindow=performance.now(),goodWindows=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const touchQuery=matchMedia('(pointer: coarse)');const updateDevice=()=>document.body.classList.toggle('touch',touchQuery.matches||navigator.maxTouchPoints>0);touchQuery.addEventListener('change',updateDevice);updateDevice();
const adaptiveQuality=new AdaptiveQuality(quality);
// 비용 분리 검수에서만 같은 DPR·그림자 조건을 고정한다. 일반 실행에는 적용하지 않는다.
const aoDiagnosticMode=['off','normal','full'].includes(new URLSearchParams(location.search).get('aoMode'));
avatar.userData.metricKind='등산객';
// 리사이즈·자동 화질 전환은 이미 준비된 경로만 선택한다.
function resize(){const width=innerWidth,height=innerHeight;camera.aspect=width/height;camera.far=30000;camera.fov=inspectionMode?inspectionFov:height>width?78:65;camera.updateProjectionMatrix();renderer.setSize(width,height);adaptiveQuality.setViewport(`${width}x${height}@${devicePixelRatio}`);if(adaptiveQuality.cap!==quality)adaptiveQuality.setCap(quality);const settings=adaptiveQuality.settings,dpr=Math.min(devicePixelRatio,Math.max(settings.dpr,LIMITS.minDpr)); /* 휴대폰은 화질 '낮음'이 기본(2026-11-06 메모리)이라 배율 하한 1을 둔다 */renderer.setPixelRatio(dpr);lighting.resize(quality,width,height,dpr,settings);}window.addEventListener('resize',resize);resize();
function suspend(){if(!started)return;audio.stop();ambient.setPaused(true);input.clear();save();} // 자동 걷기는 끄지 않는다: 다른 창·탭으로 가도 계속 걷는다(2026-11-08 대표 피드백)
const teaReady=()=>state.pose==='sit'&&hiker.interaction?.sitLinear>=.999;
mountRestUI();installHudToggle();installGadgetUI();installNotebookHud();
const interactionUI=mountInteractionUI();
const INTERACTION_COMMANDS=['interact','choice-1','choice-2','choice-3','panel-close','page-prev','page-next','stamps-toggle','card-open','labels-toggle','stretch','emote-menu','emote-pick'];
let interaction=null,trail=null;
function command(id,value){if(!started)return;if(document.querySelector('dialog[open]')&&!['map-toggle','help-toggle'].includes(id))return;
 if(interaction){if(id==='escape'){if(interaction.anyPanel())interaction.handle('panel-close');return;}if(INTERACTION_COMMANDS.includes(id)){if(id==='stamps-toggle'||id==='card-open')closeGadget(state);interaction.handle(id,value);updateUI();return;}}
 // 기구(쌍안경·휴대폰). 앉기·차·자동 걷기를 고르면 기구를 내린다.
 if(gadgetCommand(id,value)){save();updateUI();return;}if(['sit','tea','auto'].includes(id))closeGadget(state);if(id==='sit'&&state.pose==='stand'&&trail?.benchSit(worldPosition())){save();updateUI();return;}if(id==='sit'){setPose(state,state.pose==='stand'?'sit':'stand');}if(id==='tea'&&teaReady()){setPose(state,'tea');}if(id==='chocolate'){ // 🍫 먹기: 개수·30초는 state(이어하기 저장), 몸짓·바람 줄은 trail-world(hiker-acts)
  if(canEatChocolate(state,{busy:!!trail?.busy()})&&(trail?.acts.eatChocolate(30)??true))eatChocolate(state);}
 if(id==='stop-auto')state.auto=false;if(id==='auto'){const enable=!state.auto;setPose(state,'stand');state.auto=enable;}if(id==='face-forward')faceForward(look);if(id==='hud-toggle'){window.dispatchEvent(new CustomEvent('hiking:hud-toggle'));return;}if(id==='view'&&!viewLocked(state))state.view=state.view==='first'?'third':'first';if(id==='map-toggle'||id==='help-toggle'){const dialog=$(id==='map-toggle'?'map':'help');if(dialog.open)dialog.close();else{state.auto=false;input.clear();dialog.showModal();}}save();updateUI();}
function gadgetCommand(id,value){
 if(id==='binoculars'||id==='phone'){setGadget(state,id);if(state.gadget!=='none'){input.clear();if(state.view==='first')look.reset=null;}return true;}
 if(id==='gadget-off')return closeGadget(state)||true;
 if(id==='zoom-in'||id==='zoom-out')return zoomStep(state,id==='zoom-in'?1:-1)||true;
 if(id==='phone-zoom')return setPhoneZoom(state,Number(value))||true;
 if(id==='selfie')return toggleSelfie(state)||true;
 if(id==='shutter'){if(state.gadget==='phone')photoRequested=true;return true;}
 return false;
}
let photoRequested=false,shotCallback=null;
// 촬영: 방금 그린 3D 캔버스만 PNG로 받는다(HUD·휴대폰 테두리는 DOM이라 빠진다). 렌더 직후 같은 프레임에서 읽어야 버퍼가 남아 있다.
function takePhoto(){
 let url=null;try{const src=renderer.domElement,crop=viewfinderCrop(src),framed=interaction?.frameActive();if(crop||framed){const c=document.createElement('canvas');c.width=crop?.sw??src.width;c.height=crop?.sh??src.height;const g=c.getContext('2d');g.drawImage(src,crop?.sx??0,crop?.sy??0,c.width,c.height,0,0,c.width,c.height);if(framed)interaction.bakeFrame(g,c.width,c.height,drawPhotoFrame);url=c.toDataURL('image/png');}else url=src.toDataURL('image/png');}catch(e){landscape.status.errors.push(`촬영: ${e.message}`);}
 if(url)interaction?.notePhoto(url);
 const filename=photoFilename();if(url){const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();}
 playShutter();const flash=document.createElement('div');flash.className='shutter-flash';document.body.append(flash);setTimeout(()=>flash.remove(),260);
 window.hiking.lastPhoto={filename,selfie:!!state.phone.selfie,zoom:state.phone.zoom,bytes:url?Math.round(url.length*.75):0};
 window.dispatchEvent(new CustomEvent('hiking:photo',{detail:{...window.hiking.lastPhoto}}));
}
// 셔터 소리: 짧은 잡음 두 번(기계식 셔터 느낌)을 합성한다. 소리를 끄면 내지 않는다.
function playShutter(){
 const ctx=audio.context;if(!ctx||!audio.enabled)return;
 try{const t=ctx.currentTime,len=Math.floor(ctx.sampleRate*.05),buffer=ctx.createBuffer(1,len,ctx.sampleRate),d=buffer.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(len*.18));
  for(const [at,gain] of [[0,.5],[.075,.35]]){const src=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=1800;src.buffer=buffer;g.gain.value=gain;src.connect(f).connect(g).connect(audio.master??ctx.destination);src.start(t+at);}}catch{}
}
const input=bindInput(command,(dx,dy)=>{const k=lookScale(state);turnLook(look,dx*k,dy*k);},dz=>{if(state.view==='first'&&state.gadget!=='none'){zoomBy(state,dz);updateUI();return;}if(state.view==='third')look.orbit=THREE.MathUtils.clamp(look.orbit+dz,2.2,12);},{mode:()=>started?state.gadget:'none',interact:()=>!!interaction?.active(),panel:()=>(interaction?.panelPages()??0)>1});
// 휴대폰 촬영: 화면을 끌지 않고 짧게 클릭(탭)하면 셔터.
{let down=null;$('world').addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now()};});$('world').addEventListener('pointerup',e=>{if(down&&state.gadget==='phone'&&!document.pointerLockElement&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6&&performance.now()-down.t<500)command('shutter');down=null;});}for(const id of ['auto','view','face-forward','map-toggle','help-toggle','binoculars','phone'])$(id).onclick=()=>{command(id);$(id).blur();};$('stamps').onclick=()=>{command('stamps-toggle');$('stamps').blur();};$('stretch').onclick=()=>{command('stretch');$('stretch').blur();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());for(const [id,start] of [['start-entrance','plaza'],['start-demo','demo']])$(id).onclick=()=>{Object.assign(state,initialState({start}),{shortcut:start!=='plaza'});save();location.replace(location.pathname+location.hash);};
$('lock').onclick=()=>{try{const p=$('world').requestPointerLock();p?.catch(()=>{});$('help').close();}catch{}};
window.addEventListener('hiking:command',e=>{if(['sit','tea','auto','view','binoculars','phone','gadget-off','zoom-in','zoom-out','phone-zoom','selfie','shutter','chocolate',...INTERACTION_COMMANDS].includes(e.detail?.id))command(e.detail.id,e.detail.value);});
for(const id of ['sit','tea'])$(id)?.addEventListener('click',()=>command(id));
const lifecycleSave=()=>{suspend();if(document.pointerLockElement)document.exitPointerLock();};document.addEventListener('visibilitychange',()=>{if(document.hidden)lifecycleSave();});window.addEventListener('blur',lifecycleSave);window.addEventListener('pagehide',lifecycleSave);document.addEventListener('freeze',lifecycleSave);// WebGL 컨텍스트 손실(휴대폰 메모리 압박·백그라운드 전환): 그리기를 멈추고 복구를 기다린다. three는 restored 때 버퍼·텍스처·셰이더를 다시 올린다.
// 6초 안에 복구되지 않으면 저장 지점에서 한 번 새로 연다(1분 안에 또 잃으면 새로 열지 않고 안내만 남긴다).
let contextLost=false,contextTimer=0;
$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;suspend();const note=$('resume-note');note.style.opacity='1';note.textContent='3D 화면을 다시 준비하는 중입니다…';window.dispatchEvent(new CustomEvent('hiking:context',{detail:{lost:true}}));
 clearTimeout(contextTimer);contextTimer=setTimeout(()=>{if(!contextLost)return;let recent=0;try{recent=Number(sessionStorage.getItem('gwanak-context-reload'))||0;sessionStorage.setItem('gwanak-context-reload',String(Date.now()));}catch{}if(Date.now()-recent>60000){save();location.reload();}else note.textContent='3D 연결이 끊겼습니다. 새로고침하면 저장 지점에서 이어집니다.';},6000);});
$('world').addEventListener('webglcontextrestored',()=>{contextLost=false;clearTimeout(contextTimer);try{resize();}catch{}$('resume-note').textContent='3D 화면을 다시 이었습니다.';hideResumeNote();window.dispatchEvent(new CustomEvent('hiking:context',{detail:{lost:false}}));});
const pad=n=>String(n).padStart(2,'0');const time=s=>`${pad(Math.floor(s/3600))}:${pad(Math.floor(s/60)%60)}:${pad(Math.floor(s)%60)}`;
const minX=Math.min(...route.points.map(p=>p.x)),maxX=Math.max(...route.points.map(p=>p.x)),minZ=Math.min(...route.points.map(p=>p.z)),maxZ=Math.max(...route.points.map(p=>p.z));
const mapScale=Math.min(250/(maxX-minX),250/(maxZ-minZ)),mapX=p=>160+(p.x-(minX+maxX)/2)*mapScale,mapY=p=>150+(p.z-(minZ+maxZ)/2)*mapScale;$('map-path').setAttribute('d',route.points.map((p,i)=>`${i?'L':'M'}${mapX(p)} ${mapY(p)}`).join(' '));
// 지도: 걸은 길(빨간 실선)은 지도 창이 열려 있을 때만, 1m 넘게 움직였을 때 다시 그린다. 남은 길은 #map-path 점선.
let walkedS=-1;const drawWalked=()=>{if(!$('map').open)return;const s=state.zone==='route'||state.zone==='summit'?Math.min(state.s,route.length):0;if(Math.abs(s-walkedS)<1)return;walkedS=s;const pts=[];for(const g of route.segments){if(g.start>=s)break;pts.push(g.a);}const q=sample(s);if(pts.length)pts.push({x:q.x,z:q.z});$('map-walked').setAttribute('d',pts.map((p,i)=>`${i?'L':'M'}${mapX(p).toFixed(1)} ${mapY(p).toFixed(1)}`).join(' '));};
function updateUI(){const p=sample(state.s),plaza=state.zone==='plaza',course=courseDistance(state);window.dispatchEvent(new CustomEvent('hiking:state',{detail:{...state,plaza:state.plaza&&{...state.plaza},phone:{...state.phone},binoculars:{...state.binoculars},viewZoom:viewZoom(state),speed,teaReady:teaReady(),offTrail:offTrailNow(),interact:interaction?.view??null,zone:state.zone,courseDistance:course,courseLength:COURSE_LENGTH,position:playerPosition(state,walkingGround),started}}));$('status').textContent=state.pose==='tea'?'차 마시는 중':state.pose==='sit'?'앉아서 쉬는 중':state.running?'달리는 중':moving?'걷는 중':'서 있음';$('progress-fill').style.width=`${course/COURSE_LENGTH*100}%`;{const total=Math.round(COURSE_LENGTH),done=Math.min(total,Math.round(course)),fmt=n=>n.toLocaleString('ko-KR');$('distance').textContent=`${plaza?'출발 전 · 광장 · ':''}${fmt(done)} / ${fmt(total)} m`;$('remaining').textContent=formatRemainKm(total-done);}$('altitude').innerHTML=`${worldPosition()[1].toFixed(0)} <em>m</em>`;$('elapsed').textContent=time(state.elapsed);$('speed').innerHTML=`${(speed*3.6).toFixed(1)} <em>km/h</em>`;$('eta').textContent=`${Math.ceil(durationBetween(state.s,route.length)/60)}분`;$('surface').textContent=plaza?'광장 · 포장':offTrailNow()?'길 밖 · 흙·낙엽':MATERIALS[p.material].label;$('quality').textContent=`화질 ${['낮음','균형','높음'][quality]} · ${qualityMode==='auto'?'자동':'고정'}`;$('auto').classList.toggle('active',state.auto);for(const g of ['binoculars','phone']){$(g).classList.toggle('active',state.gadget===g);$(g).setAttribute('aria-pressed',String(state.gadget===g));}$('auto').setAttribute('aria-pressed',state.auto);$('view').querySelector('span').textContent=state.view==='first'?'3인칭 보기':'1인칭 보기';$('view').disabled=viewLocked(state);$('view').title=viewLocked(state)?'쌍안경·휴대폰을 쓰는 동안은 1인칭 고정':'';{const [x,,z]=worldPosition();$('map-dot').setAttribute('cx',mapX({x,z}));$('map-dot').setAttribute('cy',mapY({x,z}));drawWalked();}$('checkpoints').innerHTML=checkpoints.map((c,i)=>`<div>${state.checkpoints.includes(c.id)?'●':'○'} ${c.name} · 임시${c.s<state.s&&!state.checkpoints.includes(c.id)?' · 시범 시작 전 구간':''}</div>`).join('');}
if(state.zone==='plaza'){$('resume-note').textContent='출발 전 · 일주문 앞 광장 · W/A/S/D로 둘러보거나 자동 걷기(R)로 출발하세요';}else if(saved&&!startOption){$('resume-note').textContent=`${[...checkpoints].reverse().find(c=>state.checkpoints.includes(c.id))?.name||'정상 접근'} · ${Math.round(state.s)}m 지점에서 이어왔습니다 · W로 걷거나 자동 걷기(R)로 이어가세요`;}else{$('resume-note').textContent='정상 접근 시범 구간 · 자동 걷기 또는 W로 출발하세요';}const hideResumeNote=()=>setTimeout(()=>{if(storageOK)$('resume-note').style.opacity='0';},3500);
const camGoal=new THREE.Vector3(),lookGoal=new THREE.Vector3();let cameraReady=false,summitShown=state.summitArrived||state.s>=route.length;let firstFrameMs=null;const clockStart=performance.now();
const frameMetrics=createFrameMetrics();
window.__hikingPerformance={reset:()=>frameMetrics.reset(),report:()=>frameMetrics.report()};
const inspectionBearing=new URLSearchParams(location.search).get('bearing');
const entrancePhoto=new URLSearchParams(location.search).has('entrancePhoto'),entrancePhotoDistance=Number(new URLSearchParams(location.search).get('entrancePhoto'))||8.8;
const forward=new THREE.Vector3(),shadowAhead=new THREE.Vector3();
// 카메라 높이 추종(계단 들썩임 제거)과 뒷걸음 때 거꾸로 도는 보행 위상.
const cameraHeight=createHeightFollow();let walkPhase=null,lastTravelled=null,stairLandings=0;
const stability=createStabilityCounter({count:12,limitMs:100});let stabilizingSince=null;
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
function frame(now,background=false){
 const workStarted=performance.now();
 if(!background)requestAnimationFrame(frame); // 숨은 탭 보충 걸음(backgroundTick)은 rAF를 더 걸지 않는다
 const frameSeconds=(now-last)/1000,dt=Math.min(frameSeconds,.1);last=now;
 const before=worldPosition(),beforeY=offTrailNow()||freeZone()?before[1]:sample(state.s).y;
 // 출발 전(로딩 중)에는 입력을 읽어 버리고 이동·시간·자동 걷기를 진행하지 않는다.
 const cmd=walkInput(state,started?input.read():{forward:0,side:0,run:false,turn:0});if(multi?.frozen||interaction?.modal()||document.querySelector('dialog[open]'))Object.assign(cmd,{forward:0,side:0,run:false,turn:0}); // 같이 셀카 중·수첩/완등 카드가 떠 있는 동안에는 걷지 않는다
 const trailMove=!!(cmd.forward||cmd.side),tp=trail?.override()??null;if(tp||trail?.busy())Object.assign(cmd,{forward:0,side:0,run:false,turn:0}); // 즐길거리에 들른 동안은 trail-world가 몸을 옮긴다(걷기 입력은 그만두기로 받는다)
 {const resetting=!!look.reset;if(started)updateLook(look,dt,cmd.turn);
  // 자동 걷기 시점(src/auto-view.js): 켜는 순간 지금 화면에서 시작하고, 지난 프레임 뒤 마우스·키로 돌린 양은 사용자 각으로 따로 둔다.
  if(started&&state.auto){if(!autoView.active)startAutoView(autoView,baseHeading(),look.yaw);else absorbUserYaw(autoView,look,resetting||!!look.reset);}else if(autoView.active)stopAutoView(autoView);}
 // 이어하기·탭 복귀로 멈춘 상태에서도 첫 걷기 입력부터 바로 움직인다.
 // 광장에서 직접 걸으면 시선 방향을 이동 기준으로 삼는다(드래그한 쪽으로 걷기). 코스·광장 전환 때는 카메라 방향을 보존한다.
 if(freeZone()&&(cmd.forward||cmd.side)&&!look.reset){const free=state.zone==='plaza'?state.plaza:state.summit;free.heading=wrapAngle(free.heading+look.yaw);look.yaw=0;}
 if(started)tickChocolate(state,dt); // 초콜릿 효과 30초는 상호작용 중에도 흐른다(일시정지 없음)
 const zoneBefore=state.zone,cameraHeadingBefore=baseHeading()+look.yaw;
 speed=started?frameMetrics.stage('movement',()=>advance(state,{...cmd,yaw:look.yaw,strideScale:hiker.strideScale,runMultiplier:hiker.profile?.runSpeed,benchRest:trail?.acts.active?.name==='bench-sit'&&trail.acts.active.state==='hold'},dt,detail=>{if(!(hiker.profile?.stairHop&&isStairs(detail.material)))window.dispatchEvent(new CustomEvent('hiking:step',{detail}));},walkingGround)):0;moving=speed>0;
 if(state.zone!==zoneBefore){look.yaw=wrapAngle(cameraHeadingBefore-baseHeading());look.reset=null;}
 // 자동 걷기 중에는 GPX 선분 방향에 바로 붙이지 않고 몇 m 앞까지 평활한 길 방향을 스프링·최대 회전 속도로 따라 돈다.
 if(started&&state.auto&&autoView.active)look.yaw=stepAutoView(autoView,{target:state.zone==='route'?pathHeading(state.s,sample):baseHeading(),base:baseHeading(),dt});
 const p=sample(state.s),[x,y,z]=tp?.position??worldPosition(),heading=baseHeading()+look.yaw;
 const routeT=(state.s-p.start)/p.length,referenceMetres=state.zone==='plaza'?0:p.a.referenceMetres+(p.b.referenceMetres-p.a.referenceMetres)*routeT;
 frameMetrics.stage('ambient',()=>ambient.update({referenceMetres,elevation:y,view:state.view,paused:!started,dt:frameSeconds}));
 avatar.position.set(x,y,z);
 if(interaction)frameMetrics.stage('interaction',()=>interaction.update(dt,{cmd,started,speed}));
 if(firstHeading){hiker.snapTo(baseHeading());firstHeading=false;}
 // 카메라 기준과 독립. 충돌·정지 시에는 마지막 방향을 유지한다.
 // 직접 걷기(앞·뒤·옆·대각선)는 몸이 카메라가 보는 쪽을 향한 채 움직이고, 자동 걷기는 실제 이동 방향을 향한다.
 const direct=!state.auto&&!!(cmd.forward||cmd.side),backward=direct&&cmd.forward<0;
 if(tp){if(tp.snap)hiker.snapTo(tp.heading);else hiker.turnTo(tp.heading,dt);}else if(moving)hiker.turnTo(direct?heading:autoView.active?autoView.heading:movementHeading(before,[x,0,z],avatar.rotation.y),dt);else if(selfieActive(state)||(state.gadget??'none')!=='none')hiker.turnTo(heading,dt); // 쌍안경·휴대폰을 든 동안은 몸이 보는 방향을 따른다
 {const travelled=state.steps+state.stepPhase;walkPhase??=travelled;walkPhase+=(backward?-1:1)*(travelled-(lastTravelled??travelled));lastTravelled=travelled;}
 if(tp)walkPhase=tp.phase; // 즐길거리로 걸어가는 동안의 걸음 위상
 const horizontal=Math.hypot(x-before[0],z-before[2]);
 const travelSlope=horizontal>1e-7?((offTrailNow()||freeZone()?y:p.y)-beforeY)/horizontal:0;
 const offGround=offTrailNow()||freeZone(),surfaceHeight=state.zone==='summit'?walkingGround.summit.height:(x,z)=>walkingGround.height(x,z,offTrailNow()); // 정상 구역 발 디딤도 몸과 같은 걷는 면
 avatar.visible=state.view==='third'||selfieActive(state);
 const stepWhere={plaza:state.zone==='plaza',seg:p,off:offTrailNow(),backward};
 frameMetrics.stage('hiker',()=>hiker.update({clip:tp?(tp.moving?'Walk':'Idle'):!moving?'Idle':travelSlope>.15?'Climb':'Walk',distance:walkPhase,stride:1,stepLength:strideAt(stepWhere)*strideScaleFor(hiker.strideScale,state.running,onStairs(stepWhere)),stairs:onStairs(stepWhere),idleSeconds:inspectionMode?0:now/1000,slope:travelSlope,pose:state.pose,teaProgress:state.pose==='tea'?1-state.teaRemaining/3:0,running:state.running,speed,dt,surfaceHeight,gadget:state.gadget??'none',selfie:!!state.phone?.selfie,lookYaw:wrapAngle(heading-avatar.rotation.y),lookPitch:look.pitch}));
 const footContact=frameMetrics.stage('contact',()=>hiker.ground({s:state.s,lateral:state.lateral,moving:moving||!!tp?.moving,phase:walkPhase,floorHeight,sample,surfaceHeight,pose:state.pose}));
 // 카툰 동동이는 계단에서 디딤판에 맞춰 한 칸에 한 발씩 통통 뛰므로, 계단 발소리는 이동 걸음 수 대신 실제로 발이 디딘 순간에 낸다.
 if(hiker.profile?.stairHop&&moving&&onStairs(stepWhere))for(const c of footContact??[])if(c.landed){stairLandings++;window.dispatchEvent(new CustomEvent('hiking:step',{detail:{step:state.steps+stairLandings,material:p.material,slope:p.slope,s:state.s,zone:state.zone,position:[c.foot[0],c.bottom,c.foot[1]],distance:state.distance,elapsed:state.elapsed,landing:true}}));}
 if(trail)frameMetrics.stage('trail',()=>{trail.update(dt,{position:[x,y,z],moving:moving||!!tp?.moving,speed,input:trailMove,runner:{exhausted:state.runExhausted,auto:state.auto,uphill:travelSlope}});trail.afterGround(dt,{moving:moving||!!tp?.moving});});
 multi?.afterLocalGround(hiker,null,performance.now()/1000);
 frameMetrics.stage('camera',()=>{
  const smoothY=followHeight(cameraHeight,y,cameraReady?dt:0),eye=smoothY+hiker.eyeHeight-(interaction?.drop??0)-(trail?.eyeDrop??0); // 1인칭 헤드밥 없음(2026-11-06 멀미 피드백). 걸음 리듬은 발소리로만 준다
  const cameraHeading=inspectionBearing!==null?-Number(inspectionBearing)*Math.PI/180:heading;
  forward.set(-Math.sin(cameraHeading),0,-Math.cos(cameraHeading));
  if(state.view==='first'){camGoal.set(x,eye,z);lookGoal.copy(camGoal).addScaledVector(forward,10);lookGoal.y+=Math.tan(THREE.MathUtils.clamp(look.pitch+(hiker.viewPitch??0)+(interaction?.pitch??0),-1.3,1.3))*10;}
  else{const cs=hiker.profile?.cameraScale??1; // 3인칭 카메라 거리·높이 배율(카툰 동동이는 키 1.0m라 가까이·낮게)
   lookGoal.set(x,smoothY+(1.15-(1.6-hiker.eyeHeight)*2/3),z);camGoal.copy(lookGoal).addScaledVector(forward,-look.orbit*cs*Math.cos(look.pitch));camGoal.y+=cs*(1-look.orbit*Math.sin(look.pitch));camGoal.copy(retractCamera(lookGoal,camGoal,landscape.cameraCollisionObjects(lookGoal,camGoal),camera));}
  if(state.view==='third')camera.position.copy(camGoal);else camera.position.lerp(camGoal,cameraReady?1-Math.exp(-dt*10):1);
  // 휴대폰 셀카(1인칭): 머리 앞 팔 길이에서 얼굴을 본다. 드래그하면 몸과 카메라가 같이 돈다.
  if(selfieActive(state)){const lens=hiker.phoneCamera?.(true);if(lens?.visible){camera.position.copy(lens.position);lookGoal.copy(lens.position).add(lens.direction);}else{camera.position.fromArray(selfiePosition([x,eye,z],cameraHeading,look.pitch));lookGoal.set(x,eye-.04,z);}} // 셀카 카메라는 손에 든 휴대폰 전면 렌즈(산풍경 phoneCamera). 휴대폰을 꺼내는 중에는 기존 위치
  // 쌍안경·휴대폰 배율은 camera.zoom으로 준다(THREE.LOD와 장면 거리 판정이 같은 값을 읽는다). 로그 공간에서 부드럽게 따라간다.
  {const target=viewZoom(state),next=cameraReady&&!reduced?Math.exp(Math.log(camera.zoom)+(Math.log(target)-Math.log(camera.zoom))*(1-Math.exp(-dt*14))):target;const z=Math.abs(next-target)<1e-3?target:next;if(z!==camera.zoom){camera.zoom=z;camera.updateProjectionMatrix();}}
  scene.fog.far=LOOK_PROFILE.far/hazeScale(camera.zoom);
  if(camera.zoom>1.01&&state.view==='first'){camera.getWorldDirection(shadowAhead);shadowAhead.multiplyScalar((lighting.status.shadowDistance||30)/2).add(camera.position);lighting.setShadowFocus(shadowAhead);}else if(lighting.status.shadowFocus)lighting.setShadowFocus(null);
  if(entrancePhoto){const a=landscape.status.entrance.frame,front=new THREE.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw));const lateral=new THREE.Vector3(Math.cos(a.yaw),0,-Math.sin(a.yaw)).multiplyScalar(-.8);camera.position.set(a.x,a.y+1.6,a.z).addScaledVector(front,entrancePhotoDistance).add(lateral);lookGoal.set(a.x,a.y+2.75,a.z).add(lateral);camera.fov=55;camera.updateProjectionMatrix();}
  {const co=window.hiking?.cameraOverride;if(co){camera.position.fromArray(co.p);lookGoal.fromArray(co.t);if(co.fov&&camera.fov!==co.fov){camera.fov=co.fov;camera.updateProjectionMatrix();}}} // 촬영·검수용 고정 카메라(scripts/capture-trail-props.mjs)
  camera.lookAt(lookGoal);cameraReady=true;
 });
 frameMetrics.stage('terrain',()=>terrain.update(state.s,quality));
 night.update(dt,{camera,avatar,view:state.view,selfie:selfieActive(state),zone:state.zone==='summit'?'route':state.zone,s:state.s,hiker});
 if(multi)frameMetrics.stage('multi',()=>multi.update(dt,now/1000));
 trail?.afterCamera(); // 말풍선·상호작용 칩은 이번 프레임 카메라로 자리를 잡는다
 if(background)return finishBackgroundFrame(now); // 숨은 탭에서는 그리지 않고 진행·저장·완등만 처리한다
 if(!contextLost)frameMetrics.stage('render',()=>lighting.render(avatar.position));
 if(photoRequested){photoRequested=false;takePhoto();}
 if(shotCallback){const cb=shotCallback;shotCallback=null;try{const img=new Image();img.onload=()=>cb(img);img.onerror=()=>cb(null);img.src=renderer.domElement.toDataURL('image/jpeg',.9);}catch{cb(null);}}
 frameMetrics.frame(frameSeconds*1000,{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,breakdown:lighting.status.breakdown});
 if(firstFrameMs===null){firstFrameMs=performance.now()-clockStart;markLoad('first-frame');}
 if(now-uiAt>150){updateUI();uiAt=now;}
 if(started&&now-saveAt>700){save();saveAt=now;}
 if(!started&&loading.phase==='loading')checkStability(frameSeconds*1000,now);
 if((state.summitArrived||(state.zone==='route'&&state.s>=route.length))&&!summitShown){summitShown=true;state.summitArrived=true;$('summit-summary').textContent=`이번 체험 ${state.distance.toFixed(1)}m · 걸은 시간 ${time(state.elapsed)} · ${state.steps}걸음 · 상승 ${state.ascent.toFixed(1)}m · ${state.sessions}회 접속. DSM 지형 체험 기록입니다.`;// 완등 기록(산 고르기·지도 도장, 자유 설정 열림). 구간 이동으로 정상에 간 경우는 이 화면이 뜨지 않으므로 기록되지 않는다.
if(!multiMode){try{const record=recordSummit(localStorage,'gwanak',{date:seoulClock(Date.now()).date,sec:state.shortcut?null:state.elapsed});window.dispatchEvent(new CustomEvent('hiking:summit-record',{detail:{id:'gwanak',record}}));}catch{}}
$('summit').showModal();save();}
 if(!document.hidden&&frameSeconds>0){frameSum+=frameSeconds;frames++;}
 if(now-qualityWindow>4000){
  const fps=frames/frameSum;
  window.__hikingMetrics={landscape:{...landscape.status},rendering:{...lighting.status},footContact,assetsLoaded:true,fps,quality,loadedChunks:terrain.loaded.size,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,firstFrameMs,performance:frameMetrics.report()};
  frames=frameSum=0;qualityWindow=now;
 }
 if(!aoDiagnosticMode&&adaptiveQuality.sample(frameSeconds*1000,!document.hidden&&cameraReady,performance.now()-workStarted,lighting.status.ao)){resize();}
 if(window.__hikingMetrics)window.__hikingMetrics.adaptiveQuality={...adaptiveQuality.settings,dpr:renderer.getPixelRatio()};
}
function finishBackgroundFrame(now){
 if(now-uiAt>150){updateUI();uiAt=now;}
 if(started&&now-saveAt>700){save();saveAt=now;}
 if((state.summitArrived||(state.zone==='route'&&state.s>=route.length))&&!summitShown){state.auto=false;} // 완등 카드·기록은 돌아왔을 때 첫 프레임이 띄운다
}
// 탭을 숨기면 브라우저가 requestAnimationFrame을 멈춘다. 자동 걷기 중이면 숨은 동안에도 0.1초씩 몸을 옮기고(그리기 생략) 멀티 위치도 보낸다.
// 숨은 탭의 일반 타이머는 1초~1분 간격으로 늦춰지므로 워커 타이머를 먼저 쓰고, 실제로 흐른 시간만큼 나눠 따라잡는다(한 번에 최대 60초).
{const STEP=100,CATCHUP=60000;
 const tick=()=>{if(!document.hidden||!started||!state.auto||contextLost)return;const now=performance.now();let gap=now-last;if(gap<STEP)return;if(gap>CATCHUP){last=now-CATCHUP;gap=CATCHUP;}
  while(gap>=STEP&&state.auto&&document.hidden){frame(last+STEP,true);gap-=STEP;}};
 let worker=null;try{const url=URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),250)'],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);worker.onmessage=tick;worker.onerror=()=>{worker?.terminate();worker=null;setInterval(tick,250);};}catch{worker=null;}
 if(!worker)setInterval(tick,250);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;last=performance.now();}); // 숨는 순간부터 잰다(마지막 rAF와 사이 간격은 버린다)
 window.hiking.backgroundTick=tick;}
updateUI();save();
await guard(Promise.all([environmentReady.then(()=>loading.done('environment')),initialNatureReady.then(()=>{markLoad('nature');loading.done('nature');})]));markLoad('environment');
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
const ready=readiness();if(!ready.terrain)failLoading(new Error(`출발점 반경 ${READY_RADIUS}m 지형 누락 ${ready.terrainMissing.length}곳`));
loading.set('facilities',ready.facilities?1:.5);if(!ready.facilities)failLoading(new Error('광장 시설을 불러오지 못했습니다'));
// 준비 실패는 위 error/unhandledrejection 수신기가 로딩 오류 신호로 바꾼다.
// 밤 조명: 가로등(공원 구간)·헤드랜턴·보안등. 실제 광원 수는 고정이라 여기서 한 번 만들고 prepare()가 함께 컴파일한다.
const sOfReference=m=>{const g=route.segments.find(seg=>seg.b.referenceMetres>=m)??route.segments.at(-1),a=g.a.referenceMetres,b=g.b.referenceMetres;return g.start+Math.max(0,Math.min(1,(m-a)/((b-a)||1)))*g.length;};
const facilityPoints=FACILITY_LAMPS.map(f=>{const anchor=f.anchor&&landscape.status.summitFacilities?.sites?.find(site=>site.id===f.anchor);if(anchor)return {x:anchor.x+f.offset[0],z:anchor.z+f.offset[1],tx:anchor.x,tz:anchor.z,height:f.height};const s=f.metres!==undefined?sOfReference(f.metres):route.length-f.fromEnd,[cx,,cz]=positionAt(s,0,walkingGround),[x,,z]=positionAt(s,f.side,walkingGround);return {x,z,tx:cx,tz:cz,height:f.height};});
const night=createNightLighting({scene,renderer,place:(s,l)=>positionAt(s,l,walkingGround),groundHeight:(x,z)=>walkingGround.height(x,z,false),gatePoint:fromGate,facilityPoints,routeLength:route.length});
if(toon)toon.styleNightLighting(night.root);
let multi=null;
// 함께 걷기(?multi 또는 HUD 참가). 켜지 않으면 코드를 불러오지도 않는다.
// 서버 주소: ?server=wss://… → 빌드 변수 VITE_MULTI_SERVER_URL → 없으면 이 브라우저 창끼리(BroadcastChannel).
// 화면 약속: hiking:multi-join {room,name}(참가) · hiking:multi-leave(나가기)를 받고, hiking:multi-status {state,room,count,transport}를 보낸다.
const {multiServerUrl}=await import('./multi-transport.js');
const {hikingServerPick}=await import('./hiking-server-pick.js');
const multiServer=multiServerUrl(location.search,import.meta.env.VITE_MULTI_SERVER_URL??'');
let multiBusy=Promise.resolve();
const multiStatus=detail=>window.dispatchEvent(new CustomEvent('hiking:multi-status',{detail}));
function multiLocal(){
 return {position:()=>playerPosition(state,walkingGround),setPosition:pos=>{state.auto=false;state.running=false;if(pos.zone==='route'){const r=Number.isFinite(pos.s)?{s:pos.s,lateral:pos.lateral??0}:projectToRoute(pos.x,pos.z,0);return setPlayerPosition(state,{zone:'route',s:r.s,lateral:r.lateral},walkingGround);}return setPlayerPosition(state,pos,walkingGround);},speed:()=>speed,sit:()=>state.pose!=='stand',run:()=>!!state.running,gadget:()=>state.gadget??'none',selfie:()=>selfieActive(state),place:(s,l)=>positionAt(s,l,walkingGround)};
}
async function joinMulti({room=null,name=null}={}){
 if(multi&&(!room||room===multi.room))return multi;
 if(multi)leaveMulti();
 multiStatus({state:'connecting',room:room||'',count:0,transport:multiServer?'server':'local'});
 const {mountMultiplayer}=await import('./multi-client.js');
 multi=await mountMultiplayer({scene,camera,night,hikerUrl,prepareGltf:prepareToonHikerGltf,groundHeight:(x,z)=>walkingGround.height(x,z,false),command,room,name,serverUrl:multiServer,local:multiLocal()});
 window.hiking.multi=()=>multi?.info()??null;window.hiking.multiApi=multi;return multi;
}
function leaveMulti(){if(!multi)return;multi.dispose();multi=null;window.hiking.multiApi=null;}
// 차례대로 처리한다(참가를 두 번 빨리 눌러도 연결이 둘 생기지 않게)
// 서버 고르기 창(src/hiking-server-pick.js)은 main.js가 듣기 전에 고를 수 있어 window.__hikingMultiJoin에도 남긴다. 받으면 지운다.
window.addEventListener('hiking:multi-join',e=>{const d=e.detail??{};window.__hikingMultiJoin=null;multiBusy=multiBusy.then(()=>joinMulti({room:d.room||null,name:d.name||null})).catch(err=>{console.warn('함께 걷기 참가 실패',err);multiStatus({state:'offline',room:d.room||'',count:0,transport:multiServer?'server':'local'});});});
window.addEventListener('hiking:multi-leave',()=>{multiBusy=multiBusy.then(()=>leaveMulti());});
window.hiking.multi=()=>null;window.hiking.multiServer=multiServer;
if(multiMode)await joinMulti();
else if(window.__hikingMultiJoin){const d=window.__hikingMultiJoin;window.dispatchEvent(new CustomEvent('hiking:multi-join',{detail:d}));}
// 함께 걷기 HUD(산디자인 src/multi-entry-ui.js: 버튼·방 이름·닉네임·상태 표시). 파일이 생기면 자동으로 불러온다(없으면 빈 목록).
for(const load of Object.values(import.meta.glob('./multi-entry-ui.js')))load().then(m=>{document.body.dataset.multiEntry='1';m.installMultiEntry?.({serverUrl:multiServer,serverPick:hikingServerPick()});multi?.statusNow();}).catch(err=>console.warn('함께 걷기 HUD를 불러오지 못했습니다',err));
// 등산 채팅 HUD(산디자인 src/hiking-chat-ui.js: 💬 버튼·채팅 창·머리 위 말풍선). 서버 연결은 multi-client.js가 hiking:chat* 이벤트로 맡는다.
// ?multi로 이미 참가했으면 상태를 한 번 더 보내 준다(HUD가 늦게 붙어 '연결됨'을 놓치면 💬가 안 보였음).
for(const load of Object.values(import.meta.glob('./hiking-chat-ui.js')))load().then(m=>{m.installHikingChat?.();multi?.statusNow();}).catch(err=>console.warn('등산 채팅 HUD를 불러오지 못했습니다',err));
// 상호작용(안내판·스탬프·산길 행동·쌍안경 이름표). 소품 자리는 풍경이 정한 landscape.interactionProps.sites를 그대로 쓴다.
let envInfo={};window.addEventListener('hiking:environment',e=>{envInfo=e.detail||{};});
{
 const measure=routeMeasure(landscape.route),streams=STREAM_SPOTS.map(sp=>({id:sp.id,...measure.at(sp.m)})),v3=new THREE.Vector3(),toPx=v=>{v.project(camera);return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight,visible:v.z>-1&&v.z<1};};
 const soundFx=createInteractionSound({context:()=>audio.context,destination:()=>audio.master,enabled:()=>audio.enabled});
 interaction=createInteraction({state,sites:landscape.interactionProps.sites,streams,ui:interactionUI,sound:soundFx,storage:multiMode?null:localStorage,courseKm:()=>courseDistance(state),
  player:()=>{const [x,y,z]=worldPosition();return {x,z,heading:baseHeading()+look.yaw,zone:state.zone,elevation:y};},
  weather:()=>({kind:envInfo.kind??'clear',label:envInfo.weatherLabel??''}),
  geo:(lat,lon)=>geographicToLocal(lat,lon,0),
  projectDir:(bearing,elev)=>{const b=bearing*Math.PI/180,e=elev*Math.PI/180;v3.set(Math.sin(b)*Math.cos(e),Math.sin(e),-Math.cos(b)*Math.cos(e)).multiplyScalar(1000).add(camera.position);return toPx(v3);},
  projectWorld:(x,y,z)=>toPx(v3.set(x,y,z)),
  cameraInfo:()=>({fov:camera.fov,aspect:camera.aspect,zoom:camera.zoom}),
  phoneRect:()=>{const r=document.querySelector('.phone-zooms')?.getBoundingClientRect();return r&&r.width?{cx:r.left+r.width/2,top:r.top}:null;},
  multi:()=>multi,requestShot:cb=>{shotCallback=cb;},canShare:typeof navigator.canShare==='function',nickname:'산길 손님'});
 // 자동걷기 즐길거리(산스장·벤치·먼지털이기·동물). 자리는 풍경이 정한 landscape.status.trailProps, 동작은 src/toon/hiker-acts.js.
 // 즐길거리 효과음: 발소리와 같은 AudioContext·마스터(음량)·켜기/끄기를 따른다. 화면이 가려지면 멈춘다.
 const trailSound=createTrailSound({context:()=>audio.context,destination:()=>audio.master,enabled:()=>audio.enabled&&!document.hidden,base:`${import.meta.env.BASE_URL}sounds/trail/`});
 trail=createTrailWorld({scene,camera,hiker,landscape,toonify:toon?.toonify,sound:trailSound,auto:{get:()=>state.auto,set:v=>{state.auto=v;}},env:()=>({season:seasons.season,hour:parseInt(lighting.environment?.info?.timeLabel??envInfo.timeLabel??'',10)})});window.hiking.trailSound=()=>trailSound.snapshot();window.hiking.trail=trail;installTrailHud();
 // 즐길거리 도장: 역기 10회 → '산스장 득근', 에어건 → '깨끗한 신발'(수첩)
 window.addEventListener('hiking:trail',e=>{const t=e.detail?.type;if(t==='gym-lift-done')interaction.award?.('gym');else if(t==='airgun-done')interaction.award?.('shoes');});
 window.hiking.interaction=()=>({view:interaction.view,action:interaction.action,progress:JSON.parse(JSON.stringify(interaction.progress)),tagsOn:interaction.tagsOn,frameOn:interaction.frameOn,bino:interaction.bino,cooldowns:interaction.cooldowns(),sites:interaction.cands.map(c=>({id:c.id,action:c.action,x:c.x,z:c.z,y:c.y}))});window.hiking.interactionApi=interaction;
}
markLoad('compile-start');await lighting.prepare();last=performance.now();requestAnimationFrame(frame);markLoad('compile-end');
let readyInfo=null;
// 첫 프레임 안정: 셰이더 컴파일이 끝나고 프레임 간격 100ms 이하가 12번 이어지면 준비 완료. 15초가 지나면 느린 기기로 보고 진행한다.
function checkStability(frameMs,now){
 stabilizingSince??=now;const done=stability.sample(frameMs,!!lighting.status.compiling);
 loading.set('stabilizing',Math.min(.99,stability.fraction),{stableFrames:stability.stable});
 if(!done&&now-stabilizingSince<15000)return;
 readyInfo={...readiness(),stableFrames:stability.stable,stableTimeout:!done,firstFrameMs};
 if(!readyInfo.terrain||!readyInfo.nearLod||!readyInfo.facilities||!readyInfo.hikers){failLoading(new Error('출발점 주변 준비 조건 미충족'));return;}
 markLoad('ready');loading.ready({readiness:readyInfo});resolveReady({...loading.snapshot(),readiness:readyInfo});startBackgroundCities();
 if(!manualStart)startRequested=true;beginHike();
}
// '시작' 신호 이후에만 입력·경과 시간·자동 걷기가 진행된다. 로딩 중에 눌린 키는 버린다.
beginHike=()=>{
 if(started||!startRequested||loading.phase!=='ready')return;
 started=true;window.hiking.started=true;input.clear();look.yaw=0;look.reset=null;last=performance.now();loading.start();
 updateUI();hideResumeNote();window.dispatchEvent(new CustomEvent('hiking:started',{detail:{...loading.snapshot(),position:playerPosition(state,walkingGround)}}));
};
// 개발용 구간 이동(section-jump.js). 걷기·정상 구역·저장 상태를 한 번에 정리하고, 한 번만 뜨는 정상 도착 화면은 띄우지 않는다.
// 자유 설정의 출발 지점도 같은 목록·같은 이동을 쓴다(진행 기록은 새로 시작, 완등 도장은 그대로).
const jumpTargetList=jumpTargets({summit:summitSpot(walkingGround.summit.sites(),ROUTE_END)});
const jump=target=>{
  if(!started)return false;
  closeGadget(state);setPose(state,'stand');interaction?.reset();
  if(!setPlayerPosition(state,target.pos,walkingGround))return false;
  Object.assign(state,{auto:false,running:false,teaRemaining:0});
  for(const c of checkpoints)if(c.s<=state.s&&!state.checkpoints.includes(c.id))state.checkpoints.push(c.id);
  if(target.summit)state.summitArrived=true;
  if(target.id!=='plaza'&&target.id!=='gate')state.shortcut=true;
  summitShown=state.summitArrived||state.s>=route.length;
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  input.clear();look.yaw=0;look.pitch=-.04;look.reset=null;cameraReady=false;
  save();updateUI();return true;
};
function restartFrom(id){
 const target=jumpTargetList.find(t=>t.id===id);if(!target||!started)return false;
 const keep={view:state.view,sessions:state.sessions,stamina:state.stamina,chocolates:state.chocolates,chocoLeft:state.chocoLeft};
 Object.assign(state,initialState({start:'plaza'}),keep);ensureGadget(state);summitShown=false;
 return jump(target);
}
window.hiking.restartFrom=restartFrom;
window.addEventListener('hiking:free-start',e=>restartFrom(e.detail?.id));
// 산 고르기 화면에서 고른 출발 지점은 출발 직후 한 번 쓴다.
{const takePending=()=>{let id=null;try{id=sessionStorage.getItem(FREE_START_KEY);sessionStorage.removeItem(FREE_START_KEY);}catch{}if(id)restartFrom(id);};
 if(started)takePending();else window.addEventListener('hiking:started',takePending,{once:true});}
if(sectionJumpEnabled(location.search)){
 const jumpUI=mountSectionJump({targets:jumpTargetList,onJump:jump});
 window.addEventListener('hiking:started',jumpUI.show);if(started)jumpUI.show();
 // 개발·검수용: 상호작용 자리(소품) 곁으로 이동해 그쪽을 바라본다. 코스 위 자리는 가장 가까운 코스 지점, 광장·정상 자리는 코스 쪽으로 back m 떨어진 곳에 선다.
 window.hiking.jumpNear=(id,{back=3,face=true,along=0}={})=>{
  const c=interaction?.cands.find(x=>x.id===id);if(!c||!started)return false;
  let best={d:Infinity,s:0};for(let q=0;q<=route.length;q+=1){const p=sample(q),d=Math.hypot(p.x-c.x,p.z-c.z);if(d<best.d)best={d,s:q};}
  const toward=(tx,tz)=>{const dx=tx-c.x,dz=tz-c.z,n=Math.hypot(dx,dz)||1;return {x:c.x+dx/n*back,z:c.z+dz/n*back};};
  const sc=SUMMIT_CENTER;
  let pos=null,ok=false;
  const tryPos=p=>{if(!ok&&p){closeGadget(state);setPose(state,'stand');interaction?.reset();ok=setPlayerPosition(state,p,walkingGround);}};
  if(c.site?.anchor==='gate'||(best.s<40&&best.d>8)){const mid=fromGate(0,14),dx=mid.x-c.x,dz=mid.z-c.z,n=Math.hypot(dx,dz)||1;for(let r=back;r<=back+9&&!ok;r+=1)tryPos({zone:'plaza',x:c.x+dx/n*r,z:c.z+dz/n*r,heading:0});}
  if(!ok&&(c.site?.anchor==='marker'||c.site?.anchor==='eungjinjeon'||c.id==='stamp-6'))tryPos({zone:'summit',...toward(sc.x,sc.z),heading:0});
  if(!ok){const P=sample(best.s),A=sample(best.s-2),B=sample(best.s+2),len=Math.hypot(B.x-A.x,B.z-A.z)||1,nx=-(B.z-A.z)/len,nz=(B.x-A.x)/len,t=toward(P.x,P.z);tryPos(along?{zone:'route',s:best.s+along,lateral:0}:{zone:'route',s:best.s,lateral:best.d>back?(t.x-P.x)*nx+(t.z-P.z)*nz:0});}
  if(!ok)return false;
  Object.assign(state,{auto:false,running:false,shortcut:true});
  const [px,,pz]=worldPosition();look.yaw=0;look.pitch=-.04;look.reset=null;const want=Math.atan2(-(c.x-px),-(c.z-pz));look.yaw=face?wrapAngle(want-baseHeading()):0;cameraReady=false;
  input.clear();save();updateUI();return true;
 };
 window.hiking.jumpTargets=()=>jumpTargetList.map(t=>t.id);window.hiking.jumpTo=id=>{const t=jumpTargetList.find(x=>x.id===id);return !!t&&jump(t);};
}
// 진단 전용 읽기 인터페이스. 위치 변경·시간 배속 기능은 제공하지 않는다.
window.__hiker=hiker;window.hiking.summitMap=()=>summitWalkMap(walkingGround.summit,lateralLimit);window.__surface=landscape.surfaceHeight;window.__walkingGround=walkingGround;window.__landscape=landscape;Object.assign(window.hiking,{readiness:()=>readyInfo??readiness(),position:()=>playerPosition(state,walkingGround),snapshot:()=>({...state}),audio:()=>audio.snapshot(),metrics:()=>window.__hikingMetrics,rendering:()=>JSON.parse(JSON.stringify({...lighting.status,fov:camera.fov,exposure:renderer.toneMappingExposure})),orientation:()=>({...look,camera:camera.position.toArray(),avatarHeading:avatar.rotation.y,routeHeading:sample(state.s).heading,zone:state.zone,baseHeading:baseHeading(),cameraHeading:baseHeading()+look.yaw}),groundCheck:()=>{const p=sample(state.s);return [-.5,0,.5].map(l=>landscape.groundCheck(p.x+p.nx*l,p.z+p.nz*l));},landscape:()=>({...landscape.status}),coordinates:()=>{const p=sample(state.s);const [x,y,z]=worldPosition();return {x,y,z};}});
window.hiking.night=()=>night.info();window.hiking.headlamp=on=>{if(typeof on==='boolean')night.toggleHeadlamp(),night.info().headlamp.on!==on&&night.toggleHeadlamp();else night.toggleHeadlamp();night.syncButton();return night.info().headlamp;};window.hiking.setOthers=list=>night.setOthers(list);
window.hiking.gadgetView=()=>({gadget:state.gadget,phone:{...state.phone},binoculars:{...state.binoculars},view:state.view,selfie:selfieActive(state),cameraZoom:camera.zoom,targetZoom:viewZoom(state),fogFar:scene.fog.far,avatarVisible:avatar.visible,camera:camera.position.toArray()});
// 청크 스트리밍(기획서 §2.5): ready(pos)는 그 위치의 지형·식생 청크가 붙을 때까지 기다린다. pos 생략 시 현재 위치.
window.hiking.loadTiming=loadTiming;
window.hiking.chunks={ready:(pos)=>{const p=pos??worldPosition();return Promise.all([landscape.terrainReady(p),landscape.vegetationReady(p),backgroundCities]).then(()=>landscape.chunkStatus());},status:()=>({...landscape.chunkStatus(),memory:{...renderer.info.memory}})};
window.hiking.adaptive=()=>({...adaptiveQuality.snapshot(),dpr:renderer.getPixelRatio()});
// 메모리 어림(2026-11-06 아이폰 탭 재시작 조사): 장면에 붙은 지오메트리 버퍼·텍스처·렌더 타깃 바이트를 MB로 센다. GPU 실측이 아니라 업로드된 원본 크기 합이다.
window.hiking.memory=()=>{const seen=new Set(),texSeen=new Set();let geometry=0,instanced=0,texture=0,meshes=0;const buf=a=>{if(!a)return 0;const arr=a.isInterleavedBufferAttribute?a.data.array:a.array;if(!arr||seen.has(arr))return 0;seen.add(arr);return arr.byteLength;};
 const tex=t=>{if(!t||texSeen.has(t))return;texSeen.add(t);const img=t.image,w=img?.width??0,h=img?.height??0;texture+=w*h*4*(t.generateMipmaps?1.33:1);};
 scene.traverse(o=>{if(!o.isMesh&&!o.isPoints&&!o.isLine)return;meshes++;const g=o.geometry;if(g){for(const a of Object.values(g.attributes))geometry+=buf(a);geometry+=buf(g.index);}if(o.isInstancedMesh){instanced+=buf(o.instanceMatrix)+buf(o.instanceColor);}for(const m of [o.material].flat())if(m)for(const v of Object.values(m))if(v?.isTexture)tex(v);});
 const db=renderer.getDrawingBufferSize(new THREE.Vector2()),px=db.x*db.y,targets=px*(4+4)+px*(8+4)+px*8*2+px/4*(8+8*.5)*1.4+(lighting.status.shadows?(sun=>sun?sun.mapSize.x*sun.mapSize.y*4:0)(scene.children.find(o=>o.isDirectionalLight&&o.castShadow)?.shadow):0); // 화면(색+깊이), 합성 HDR+깊이, 핑퐁 2장, 블룸 절반 사슬
 const MB=b=>Math.round(b/1048576*10)/10;
 return {geometryMB:MB(geometry),instancedMB:MB(instanced),textureMB:MB(texture),renderTargetsMB:MB(targets),totalMB:MB(geometry+instanced+texture+targets),meshes,drawingBuffer:[db.x,db.y],dpr:renderer.getPixelRatio(),info:{...renderer.info.memory},jsHeapMB:performance.memory?MB(performance.memory.usedJSHeapSize):null};};
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
