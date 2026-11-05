// 카툰 캐릭터 확인용(vite dev: /src/toon/character-preview.html). 실제 게임과 같은 loadToonHiker·createToonStyle만 쓴다.
// ?view=front|side|sideL|back|three|threeL|숫자(라디안)&clip=Idle|Walk|Run&phase=0~2&bg=plain|ground&hud=0&pose=stand|sit|tea&gadget=none|binoculars|phone&selfie=1
// &match=concept: 시안 보드(mascot-concepts.html)와 같은 카메라(화각 20°·거리 3.74m·높이 0.5m)로 찍어 실루엣을 나란히 대조한다.
import * as THREE from 'three';
import {createToonStyle} from './index.js';
import {composeEnvironment} from '../daytime.js';
import {sunDirection} from '../look-profile.js';
import {loadToonHiker} from './link-hiker.js';

const q=new URLSearchParams(location.search);
if(q.get('hud')==='0')document.getElementById('panel').remove();
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(q.get('bgcolor')??'#d6e8f2');
const match=q.get('match')==='concept',camera=new THREE.PerspectiveCamera(match?20:16,innerWidth/innerHeight,.1,200);
const toon=await createToonStyle({renderer,scene,camera,mobile:false});
const sun=new THREE.DirectionalLight(0xffffff,3);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.5,far:30});sun.shadow.bias=-.0005;
const hemi=new THREE.HemisphereLight(0xbfdcff,0x7a8b5a,1);scene.add(sun,sun.target,hemi);
if(q.get('bg')!=='plain'){const g=new THREE.Mesh(new THREE.CircleGeometry(6,48).rotateX(-Math.PI/2),toon.materialFactory.terrain());g.receiveShadow=true;scene.add(g);}
const hiker=await loadToonHiker(`${import.meta.env.BASE_URL}assets/toon/models/hiker/Hiker.glb`);
toon.toonify(hiker.scene,{kind:'character'});hiker.scene.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.outline&&q.get('shadow')!=='0';o.receiveShadow=!o.userData.noReceiveShadow;}});
scene.add(hiker.scene);
const env=composeEnvironment({sun:{elevation:40,azimuth:160},moon:{elevation:38,azimuth:120,illumination:.8}});
const sv=new THREE.Vector3().fromArray(sunDirection(40,160));
sun.position.copy(sv).multiplyScalar(12);sun.color.setRGB(...env.light.color,THREE.SRGBColorSpace);sun.intensity=env.light.intensity*1.15;
hemi.intensity=.06+env.ambient*1.1;hemi.color.setRGB(...env.hemiColor,THREE.SRGBColorSpace);renderer.toneMappingExposure=env.exposureMul;
toon.pipeline.update(env);
const state={view:q.get('view')??'three',clip:q.get('clip')??'Idle',phase:+(q.get('phase')??0),pose:q.get('pose')??'stand',gadget:q.get('gadget')??'none',selfie:q.get('selfie')==='1',tea:+(q.get('tea')??.5),dist:+(q.get('dist')??(match?3.74:4.6)),focus:+(q.get('focus')??(match?.5:.52))};
const flat=()=>0;
function apply(){
 const moving=state.clip!=='Idle',running=state.clip==='Run',look={lookYaw:state.lookYaw??0,lookPitch:state.lookPitch??0};
 // 걷기→뛰기 전환(runFrames): 1초 걷다가 runFrames 프레임(1/30초) 뛰기로 바꾼 순간을 본다. 몸은 실제로 앞으로 나아가고 카메라가 따라간다.
 if(state.runFrames!==undefined){const steps=hiker.profile.animSteps;hiker.scene.position.set(0,0,0);let ph=0;
  for(let i=0;i<30+state.runFrames;i++){const run=i>=30,step=run?steps.run:steps.walk,dph=(run?8.2:6.2)/30;ph+=dph;hiker.scene.position.z-=dph*step;hiker.scene.updateMatrixWorld(true);
   hiker.update({clip:'Walk',distance:ph,stride:1,stepLength:step,running:run,dt:1/30,pose:'stand',gadget:'none',idleSeconds:0,speed:1.4});hiker.ground({moving:true,phase:ph,surfaceHeight:flat,sample:()=>({}),floorHeight:0});}
  state.runBlend=hiker.gait.run;
 }else{hiker.scene.position.set(0,0,0);hiker.scene.updateMatrixWorld(true);
 // 섞는 비율이 자리 잡도록 몇 번 돌린 뒤 원하는 위상에서 멈춘다.
 for(let i=0;i<(state.pose==='stand'&&state.gadget==='none'?14:40);i++){const ph=state.phase-(13-i)*.02;const steps=hiker.profile.animSteps;hiker.update({clip:moving?'Walk':'Idle',distance:ph,stride:1,stepLength:running?steps.run:steps.walk,running,dt:.05,pose:state.pose==='tea'&&i<20?'sit':state.pose,teaProgress:state.tea,gadget:state.gadget,selfie:state.selfie,idleSeconds:0,speed:moving?1.4:0,...look});
  hiker.ground({moving,phase:ph,surfaceHeight:flat,sample:()=>({}),floorHeight:0});}}
 const yaw={front:0,side:-Math.PI/2,back:Math.PI,three:-Math.PI/5,threeL:.55,sideL:Math.PI/2}[state.view]??(+state.view||0);
 const o=hiker.scene.position,target=new THREE.Vector3(o.x,state.focus,o.z),d=state.dist;
 // 몸은 -Z를 본다. 카메라를 몸 앞(-Z)에서 yaw만큼 돌린 자리에 둔다.
 camera.position.set(o.x-Math.sin(yaw)*d,state.focus+(match?d*.07:.09),o.z-Math.cos(yaw)*d);camera.lookAt(target);
 // 해는 카메라 쪽 왼편 위(앞면이 밝게).
 sun.position.set(-Math.sin(yaw+.6)*8,9,-Math.cos(yaw+.6)*8);
}
window.charPreview={set(o){Object.assign(state,o);apply();},get frames(){return frames;},hiker,state};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>window.charPreview.set({view:b.dataset.view});
for(const b of document.querySelectorAll('[data-clip]'))b.onclick=()=>window.charPreview.set({clip:b.dataset.clip,pose:'stand',gadget:'none'});
for(const b of document.querySelectorAll('[data-pose]'))b.onclick=()=>window.charPreview.set({clip:'Idle',pose:b.dataset.pose,gadget:'none'});
for(const b of document.querySelectorAll('[data-gadget]'))b.onclick=()=>window.charPreview.set({clip:'Idle',pose:'stand',gadget:b.dataset.gadget,selfie:b.dataset.selfie==='1'});
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const dpr=Math.min(devicePixelRatio,2);renderer.setPixelRatio(dpr);toon.pipeline.resize(2,innerWidth,innerHeight,dpr);}
addEventListener('resize',resize);resize();apply();
let frames=0,anim=q.get('anim')==='1';const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{const dt=clock.getDelta();if(anim&&state.clip!=='Idle'){state.phase+=dt*(state.clip==='Run'?8.2:6.2);apply();}toon.pipeline.render(dt);frames++;});
