import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadHiker} from './load-assets.js';
const scene=new T.Scene();scene.background=new T.Color('#a8bcb6');scene.fog=new T.Fog('#a8bcb6',100,270);
const camera=new T.PerspectiveCamera(48,innerWidth/innerHeight,.05,600);
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
scene.add(new T.HemisphereLight('#fff4dc','#3e554d',2.4));const sun=new T.DirectionalLight('#fff1ce',3.2);sun.position.set(-8,15,6);scene.add(sun);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=2;controls.maxDistance=230;
const loader=new GLTFLoader(),errors=[];
const [kit,corridor,summit,hiker,manifest,sky]=await Promise.all([
 loader.loadAsync('/assets/scale-kit.glb'),loader.loadAsync('/assets/summit-approach-lod1.glb'),loader.loadAsync('/assets/yeonjudae-proxy-lod1.glb'),loadHiker(),fetch('/assets/manifest.json').then(r=>r.json()),loader.loadAsync('/assets/portrait-sky.glb')]);
scene.add(sky.scene);
const sets=[new T.Group(),new T.Group(),new T.Group()];sets[0].add(kit.scene);sets[1].add(corridor.scene);sets[2].add(summit.scene);sets.forEach(g=>scene.add(g));scene.add(hiker.scene);
const ground=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:'#687464',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.11;sets[0].add(ground);
const grid=new T.GridHelper(24,24,'#b8ba9c','#83907c');grid.position.y=-.1;sets[0].add(grid);
const measures=new T.Group();sets[0].add(measures);
function ruler(a,b){const g=new T.BufferGeometry().setFromPoints([new T.Vector3(...a),new T.Vector3(...b)]);measures.add(new T.Line(g,new T.LineBasicMaterial({color:'#ffe099'})));}
ruler([-.65,0,.4],[-.65,1.7,.4]);for(const y of [0,1.7])ruler([-.75,y,.4],[-.55,y,.4]);ruler([1.3,0,.05],[1.3,.18,.05]);ruler([-2.6,0,-1],[-2.6,1.8,-1]);
let current=0,labels=[];
const views=[
 {name:'01 / 계단 앞 · 서 있기',pos:[6,4.6,8],target:[.3,.9,-1.6],avatar:[0,0,1],clip:'Idle',labels:[['신장 1.700m',[-.68,1.85,.4]],['단 높이 0.180m',[1.2,.3,0]],['기둥 1.80m',[-2,1.95,-1]],['바위 약 2 × 1.4 × 1.6m',[3,1.65,-5]]]},
 {name:'02 / 계단 측면 · 한 단씩 오르기',pos:[10,5.2,7],target:[.4,1,-1.8],avatar:[0,.72,-.96],clip:'Climb',labels:[['1.7m 등산객',[0,2.65,-.96]],['18cm × 10단',[1.2,.6,-.7]],['이정표 0.85 × 0.24m',[-2,1.95,-1]],['바위 기준체',[3,1.65,-5]]]},
 {name:'03 / 모바일 세로 · 좌우 비켜 가기',pos:[8,5.5,15],target:[.4,1,-1.5],avatar:[1,0,.8],clip:'SidestepLeft',labels:[['1.7m 캐릭터',[1,1.9,.8]],['단 높이 18cm',[1.2,.4,-.3]],['이정표',[-2,1.95,-1]],['바위',[3,1.65,-5]]]},
 {name:'04 / 정상 접근 · 양쪽 30m 띠',pos:[19,12,18],target:[0,1,-10],avatar:[0,-.04,0],clip:'Walk',labels:[['양옆 각 30m · 합성 지형',[0,4,-15]]]},
 {name:'05 / 연주대 인증 구도 시범',pos:[8,5,11],target:[0,2,-5],avatar:[0,0,1],clip:'Idle',labels:[['현장 미확인 · 실경 인증 불가',[0,7,-10]]]},
];
function setView(index){current=index;const v=views[index];sets.forEach((g,i)=>g.visible=i===(index<3?0:index===3?1:2));hiker.scene.position.fromArray(v.avatar);hiker.scene.rotation.y=0;camera.position.fromArray(v.pos);controls.target.fromArray(v.target);controls.update();document.querySelector('#view-name').textContent=v.name;document.querySelector('#description').textContent=index===3?'기존 합성 경로 409.91m · LOD1. 각 등산로 가장자리에서 30m. 실제 DEM·GPX로 교체 전이며 경로 정확성은 검증하지 않았습니다.':index===4?'기록 인증 레이아웃을 위한 합성 암벽·전망·발판입니다. 연주대 실경·공통 인증 틀 원본이 없어 완성 인증 풍경으로 승인할 수 없습니다.':'설계 치수 비교용. 실제 관악산 시설과 일치한다는 근거가 없습니다. 캐릭터·계단·이정표·바위를 함께 비교합니다.';document.querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.view===index));labels=v.labels.map(([text,pos])=>{const el=document.createElement('span');el.className='tag';el.textContent=text;return {el,pos:new T.Vector3(...pos)};});document.querySelector('#labels').replaceChildren(...labels.map(l=>l.el));hiker.update({clip:v.clip,distance:.13,stride:v.clip==='Climb'?.37:.7,idleSeconds:.2});window.assetReview.current=index;}
document.querySelectorAll('button').forEach(b=>b.onclick=()=>setView(+b.dataset.view));
function resize(){camera.aspect=innerWidth/innerHeight;camera.fov=innerHeight>innerWidth?64:48;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}addEventListener('resize',resize);resize();
const neutralBounds=new T.Box3().setFromObject(hiker.scene).getSize(new T.Vector3()).toArray();
window.assetReview={ready:false,current:0,setView,errors,manifest,characterBounds:()=>neutralBounds,stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};setView(Number(new URLSearchParams(location.search).get('view')||0));
document.querySelector('#loading').classList.add('off');window.assetReview.ready=true;
function frame(){requestAnimationFrame(frame);controls.update();sky.scene.position.copy(camera.position);for(const l of labels){const p=l.pos.clone().project(camera);l.el.style.left=`${Math.max(8,Math.min(innerWidth-l.el.offsetWidth-8,(p.x*.5+.5)*innerWidth))}px`;l.el.style.top=`${(-p.y*.5+.5)*innerHeight}px`;l.el.style.display=p.z>1?'none':'';}renderer.render(scene,camera);}frame();
