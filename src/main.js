import * as THREE from 'three';
import {contactGroundError} from './contact-footprint.js';
import './style.css';
import {route,sample,MATERIALS,checkpoints,DEMO_START,durationBetween,floorHeight as routeFloorHeight,strideFor} from './route.js';
import {initialState,restore,SAVE_KEY,advance} from './movement.js';
import {loadRealisticHiker} from './realistic-hiker.js';
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
const $=id=>document.getElementById(id);let saved=null,storageOK=true;try{saved=localStorage.getItem(SAVE_KEY);}catch{storageOK=false;}const state=saved?restore(saved):initialState();
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
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});}catch{$('resume-note').textContent='3D를 실행할 수 없습니다. WebGL을 지원하는 브라우저에서 열어 주세요.';throw new Error('WebGL unavailable');}
const mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const landscape=await loadLandscape({base:`${import.meta.env.BASE_URL}assets/realistic/generated/`,maxContactMapSize:renderer.capabilities.maxTextureSize});
const floorHeight=s=>{const p=sample(s);return landscape.surfaceHeight(p.x,p.z);};
const lighting=setupRendering(renderer,scene,camera,mobile,landscape.sky);
await lighting.environmentReady;
const {TerrainStream}=await import('./terrain.js');const terrain=new TerrainStream(scene,landscape,camera);
const startingPoint=sample(state.s);camera.position.set(startingPoint.x,startingPoint.y+1.6,startingPoint.z);await terrain.update();
await landscape.streamFar();await landscape.streamWater();
let cityBusy=false;
async function streamAvailableCities(){if(cityBusy)return;cityBusy=true;try{for(const chunk of landscape.manifest.cityChunks){await landscape.streamCity(chunk.id);await new Promise(resolve=>setTimeout(resolve,0));}await landscape.finalizeCities();landscape.status.ready=true;}catch(e){landscape.status.errors.push(e.message);}finally{cityBusy=false;}}
const initialCitiesReady=streamAvailableCities();
setInterval(async()=>{try{if(await landscape.refreshManifest()){await landscape.streamWater();void streamAvailableCities();}}catch(e){landscape.status.errors.push(e.message);}},30000);
const initialNatureReady=loadOptionalModels(landscape,`${import.meta.env.BASE_URL}assets/realistic/generated/nature/`).catch(e=>landscape.status.errors.push(e.message));
let firstHeading=true;const hiker=await loadRealisticHiker(`${import.meta.env.BASE_URL}assets/realistic/models/hiker/Hiker.glb`);const avatar=hiker.scene;scene.add(avatar);avatar.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
const look=createLook();let moving=false,speed=0,last=performance.now(),saveAt=last,uiAt=0,frameSum=0,frames=0,quality=qualityMode==='auto'?(mobile?1:2):Number(qualityMode),qualityWindow=performance.now(),goodWindows=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const touchQuery=matchMedia('(pointer: coarse)');const updateDevice=()=>document.body.classList.toggle('touch',touchQuery.matches||navigator.maxTouchPoints>0);touchQuery.addEventListener('change',updateDevice);updateDevice();
const adaptiveQuality=new AdaptiveQuality(quality);
// 비용 분리 검수에서만 같은 DPR·그림자 조건을 고정한다. 일반 실행에는 적용하지 않는다.
const aoDiagnosticMode=['off','normal','full'].includes(new URLSearchParams(location.search).get('aoMode'));
avatar.userData.metricKind='등산객';
// 리사이즈·자동 화질 전환은 이미 준비된 경로만 선택한다.
function resize(){const width=innerWidth,height=innerHeight;camera.aspect=width/height;camera.far=30000;camera.fov=inspectionMode?inspectionFov:height>width?78:65;camera.updateProjectionMatrix();renderer.setSize(width,height);adaptiveQuality.setViewport(`${width}x${height}@${devicePixelRatio}`);if(adaptiveQuality.cap!==quality)adaptiveQuality.setCap(quality);const settings=adaptiveQuality.settings,dpr=Math.min(devicePixelRatio,settings.dpr);renderer.setPixelRatio(dpr);lighting.resize(quality,width,height,dpr,settings);}window.addEventListener('resize',resize);resize();
function pause(){audio.stop();ambient.setPaused(true);state.paused=true;state.auto=false;input.clear();save();}
function command(id){if(document.querySelector('dialog[open]')&&!['map-toggle','help-toggle'].includes(id))return;if(id==='stop-auto')state.auto=false;if(id==='auto'){state.auto=!state.auto;state.paused=false;}if(id==='pause'){if(state.paused){state.paused=false;}else pause();}if(id==='face-forward')faceForward(look);if(id==='view')state.view=state.view==='first'?'third':'first';if(id==='map-toggle'||id==='help-toggle'){const dialog=$(id==='map-toggle'?'map':'help');if(dialog.open)dialog.close();else{pause();dialog.showModal();}}save();updateUI();}
const input=bindInput(command,(dx,dy)=>turnLook(look,dx,dy),dz=>{if(state.view==='third')look.orbit=THREE.MathUtils.clamp(look.orbit+dz,2.2,12);});for(const id of ['auto','pause','view','face-forward','map-toggle','help-toggle'])$(id).onclick=()=>{command(id);$(id).blur();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());$('lock').onclick=()=>{try{const p=$('world').requestPointerLock();p?.catch(()=>{});$('help').close();}catch{}};
const lifecyclePause=()=>{pause();if(document.pointerLockElement)document.exitPointerLock();};document.addEventListener('visibilitychange',()=>{if(document.hidden)lifecyclePause();});window.addEventListener('blur',lifecyclePause);window.addEventListener('pagehide',lifecyclePause);document.addEventListener('freeze',lifecyclePause);$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('resume-note').textContent='3D 연결이 끊겼습니다. 새로고침하면 저장 지점에서 이어집니다.';});
const pad=n=>String(n).padStart(2,'0');const time=s=>`${pad(Math.floor(s/3600))}:${pad(Math.floor(s/60)%60)}:${pad(Math.floor(s)%60)}`;
const minX=Math.min(...route.points.map(p=>p.x)),maxX=Math.max(...route.points.map(p=>p.x)),minZ=Math.min(...route.points.map(p=>p.z)),maxZ=Math.max(...route.points.map(p=>p.z));
const mapScale=Math.min(250/(maxX-minX),250/(maxZ-minZ)),mapX=p=>160+(p.x-(minX+maxX)/2)*mapScale,mapY=p=>150+(p.z-(minZ+maxZ)/2)*mapScale;$('map-path').setAttribute('d',route.points.map((p,i)=>`${i?'L':'M'}${mapX(p)} ${mapY(p)}`).join(' '));
function updateUI(){const p=sample(state.s);$('status').textContent=state.paused?'일시정지':moving?'걷는 중':'쉬는 중';$('progress-fill').style.width=`${state.s/route.length*100}%`;$('distance').textContent=`${Math.round(state.s).toLocaleString()} / ${Math.round(route.length).toLocaleString()} m`;$('remaining').textContent=`정상까지 ${Math.ceil(route.length-state.s)} m`;$('altitude').innerHTML=`${p.y.toFixed(0)} <em>m</em>`;$('elapsed').textContent=time(state.elapsed);$('speed').innerHTML=`${(speed*3.6).toFixed(1)} <em>km/h</em>`;$('eta').textContent=`${Math.ceil(durationBetween(state.s,route.length)/60)}분`;$('surface').textContent=MATERIALS[p.material].label;$('quality').textContent=`화질 ${['낮음','균형','높음'][quality]} · ${qualityMode==='auto'?'자동':'고정'}`;$('auto').classList.toggle('active',state.auto);$('auto').setAttribute('aria-pressed',state.auto);$('pause').setAttribute('aria-pressed',state.paused);$('pause').querySelector('span').textContent=state.paused?'계속하기':'일시정지';$('view').querySelector('span').textContent=state.view==='first'?'3인칭':'1인칭';$('map-dot').setAttribute('cx',mapX(p));$('map-dot').setAttribute('cy',mapY(p));$('checkpoints').innerHTML=checkpoints.map((c,i)=>`<div>${state.checkpoints.includes(c.id)?'●':'○'} ${c.name} · 임시${c.s<state.s&&!state.checkpoints.includes(c.id)?' · 시범 시작 전 구간':''}</div>`).join('');}
if(saved){$('resume-note').textContent=`${[...checkpoints].reverse().find(c=>state.checkpoints.includes(c.id))?.name||'정상 접근'} · ${Math.round(state.s)}m 지점에서 이어왔습니다 · 계속하기를 눌러 주세요`;}else{$('resume-note').textContent='정상 접근 시범 구간 · 자동 걷기 또는 W로 출발하세요';}setTimeout(()=>{if(storageOK)$('resume-note').style.opacity='0';},3500);
const camGoal=new THREE.Vector3(),lookGoal=new THREE.Vector3();let cameraReady=false,summitShown=state.s>=route.length;let firstFrameMs=null;const clockStart=performance.now();
const frameMetrics=createFrameMetrics();
window.__hikingPerformance={reset:()=>frameMetrics.reset(),report:()=>frameMetrics.report()};
const inspectionBearing=new URLSearchParams(location.search).get('bearing');
const forward=new THREE.Vector3();
function frame(now){
 const workStarted=performance.now();
 requestAnimationFrame(frame);
 const frameSeconds=(now-last)/1000,dt=Math.min(frameSeconds,.1);last=now;
 const cmd=input.read();updateLook(look,dt,cmd.turn);
 speed=frameMetrics.stage('movement',()=>advance(state,cmd,dt,detail=>window.dispatchEvent(new CustomEvent('hiking:step',{detail}))));moving=speed>0;
 const p=sample(state.s),x=p.x+p.nx*state.lateral,z=p.z+p.nz*state.lateral,heading=p.heading+look.yaw;
 const routeT=(state.s-p.start)/p.length,referenceMetres=p.a.referenceMetres+(p.b.referenceMetres-p.a.referenceMetres)*routeT;
 frameMetrics.stage('ambient',()=>ambient.update({referenceMetres,elevation:p.y,view:state.view,paused:state.paused,dt:frameSeconds}));
 avatar.position.set(x,landscape.surfaceHeight(x,z),z);
 if(firstHeading){hiker.snapTo(p.heading);firstHeading=false;}else hiker.turnTo(p.heading,dt);
 avatar.visible=state.view==='third';const stepCycle=(state.steps+state.stepPhase)*Math.PI;
 frameMetrics.stage('hiker',()=>hiker.update({clip:!moving?'Idle':cmd.side&&!cmd.forward?(cmd.side<0?'SidestepLeft':'SidestepRight'):p.slope>.15?'Climb':'Walk',distance:state.steps+state.stepPhase,stride:1,stepLength:strideFor(p),idleSeconds:inspectionMode?0:now/1000,slope:p.slope}));
 const footContact=frameMetrics.stage('contact',()=>hiker.ground({s:state.s,lateral:state.lateral,moving,phase:state.steps+state.stepPhase,floorHeight,sample,surfaceHeight:landscape.surfaceHeight}));
 frameMetrics.stage('camera',()=>{
  const eye=floorHeight(state.s)+1.6+(moving&&!reduced?Math.sin(stepCycle*2)*.025:0);
  const cameraHeading=inspectionBearing!==null?-Number(inspectionBearing)*Math.PI/180:heading;
  forward.set(-Math.sin(cameraHeading),0,-Math.cos(cameraHeading));
  if(state.view==='first'){camGoal.set(x,eye,z);lookGoal.copy(camGoal).addScaledVector(forward,10);lookGoal.y+=Math.tan(look.pitch)*10;}
  else{lookGoal.set(x,floorHeight(state.s)+1.15,z);camGoal.copy(lookGoal).addScaledVector(forward,-look.orbit*Math.cos(look.pitch));camGoal.y+=1-look.orbit*Math.sin(look.pitch);camGoal.copy(retractCamera(lookGoal,camGoal,landscape.cameraCollisionObjects(lookGoal,camGoal),camera));}
  if(state.view==='third')camera.position.copy(camGoal);else camera.position.lerp(camGoal,cameraReady?1-Math.exp(-dt*10):1);
  camera.lookAt(lookGoal);cameraReady=true;
 });
 frameMetrics.stage('terrain',()=>terrain.update(state.s,quality));
 frameMetrics.stage('render',()=>lighting.render(avatar.position));
 frameMetrics.frame(frameSeconds*1000,{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,breakdown:lighting.status.breakdown});
 if(firstFrameMs===null)firstFrameMs=performance.now()-clockStart;
 if(now-uiAt>150){updateUI();uiAt=now;}
 if(now-saveAt>700){save();saveAt=now;}
 if(state.s>=route.length&&!summitShown){summitShown=true;$('summit-summary').textContent=`이번 체험 ${state.distance.toFixed(1)}m · 걸은 시간 ${time(state.elapsed)} · ${state.steps}걸음 · 상승 ${state.ascent.toFixed(1)}m · ${state.sessions}회 접속. DSM 지형 체험 기록입니다.`;$('summit').showModal();save();}
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
await Promise.all([initialCitiesReady,initialNatureReady]);
landscape.status.sceneNodes=0;landscape.group.traverse(()=>landscape.status.sceneNodes++);
avatar.position.set(startingPoint.x,landscape.surfaceHeight(startingPoint.x,startingPoint.z),startingPoint.z);
hiker.snapTo(startingPoint.heading);hiker.update({clip:'Idle'});
terrain.update(state.s,quality);
await lighting.prepare();last=performance.now();requestAnimationFrame(frame);
// 진단 전용 읽기 인터페이스. 위치 변경·시간 배속 기능은 제공하지 않는다.
window.__hiker=hiker;window.__surface=landscape.surfaceHeight;window.hiking={snapshot:()=>({...state}),audio:()=>audio.snapshot(),metrics:()=>window.__hikingMetrics,rendering:()=>JSON.parse(JSON.stringify({...lighting.status,fov:camera.fov,exposure:renderer.toneMappingExposure})),orientation:()=>({...look,camera:camera.position.toArray(),avatarHeading:avatar.rotation.y,routeHeading:sample(state.s).heading}),groundCheck:()=>{const p=sample(state.s);return [-.5,0,.5].map(l=>landscape.groundCheck(p.x+p.nx*l,p.z+p.nz*l));},landscape:()=>({...landscape.status}),coordinates:()=>{const p=sample(state.s);return {x:p.x+p.nx*state.lateral,y:p.y,z:p.z+p.nz*state.lateral};}};
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
