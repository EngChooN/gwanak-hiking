// 흡연장 아바타 = 온라인 등산의 동동이 몸 그대로(src/toon/link-hiker.js·src/realistic-hiker.js, 고치지 않고 복사해 씀).
// 바뀌는 것은 옷(outfit.js: 회사원 옷 색, 벙거지·배낭·쌍안경 숨김)뿐이다. 이동 속도·보폭·걸음 동작도 등산과 같다(평지 걷기 1.37m/s, 뛰기 ×1.55).
// 옥상 바닥은 평평한 y=0이다. 이동 위치는 게임이 정하고, 동작은 걸은 거리(걸음 위상)에 맞춰 재생한다.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildToonHikerGltf} from '../toon/link-hiker.js';
import {createRealisticHiker} from '../realistic-hiker.js';
import {applyOutfit,outfitKey} from './outfit.js';

export const WALK_SPEED=1.37,RUN_MUL=1.55,BASE_STRIDE=.72;
const flat=()=>0,noSample=()=>({});
let rigPromise=null;
// 뼈대 GLB(14KB)는 한 번만 읽고, 아바타마다 buildToonHikerGltf가 뼈를 복제해 새 몸을 만든다.
export function loadRig(url){rigPromise??=new GLTFLoader().loadAsync(url);return rigPromise;}

export async function createAvatar({rigUrl,toon,outfit='shirt',name='동동이',id='me'}){
 const base=await loadRig(rigUrl);
 const hiker=createRealisticHiker(buildToonHikerGltf(base));
 applyOutfit(hiker,outfit);
 toon.toonify(hiker.scene,{kind:'character'});
 hiker.scene.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.outline;o.receiveShadow=!o.userData.noReceiveShadow;}});
 // 등산 스틱은 흡연장에 들고 오지 않는다.
 const hidePoles=()=>{for(const p of hiker.props?.poles??[])p.group.visible=false;};hidePoles();
 const root=hiker.scene;root.name=`avatar-${id}`;
 const a={
  id,name,hiker,root,outfit:outfitKey(outfit),
  x:0,z:0,heading:0,          // 바라볼 방향(라디안, 0 = -Z). 몸은 hiker.turnTo로 부드럽게 따라 돈다.
  phase:0,moving:false,running:false,speed:0,pose:'stand',idle:0,
  lookYaw:0,lookPitch:0,
  extra:[],                   // ground() 뒤에 덮어쓰는 동작(흡연·인사 등): f(dt,a)
  setOutfit(k){k=outfitKey(k);applyOutfit(hiker,k);a.outfit=k;},
  place(x,z,heading=a.heading){a.x=x;a.z=z;a.heading=heading;root.position.set(x,0,z);hiker.snapTo(heading);},
  // 한 프레임: 이동한 거리(m)를 받아 걸음 위상을 올리고 동작·접지를 갱신한다.
  update(dt,{moved=0,running=false}={}){
   const steps=hiker.profile?.animSteps,scale=hiker.strideScale??{walk:.22/.72,run:.30/.72};
   const stepLength=BASE_STRIDE*(running?scale.run:scale.walk);
   a.moving=moved>1e-4;a.running=running&&a.moving;a.speed=dt>0?moved/dt:0;
   if(a.moving)a.phase+=moved/stepLength;a.idle=a.moving?0:a.idle+dt;
   root.position.set(a.x,0,a.z);hiker.turnTo(a.heading,dt);root.updateMatrixWorld(true);
   hiker.update({clip:a.moving?'Walk':'Idle',distance:a.phase,stride:1,stepLength,stairs:false,idleSeconds:performance.now()/1000,slope:0,pose:a.pose,running:a.running,speed:a.speed,dt,surfaceHeight:flat,gadget:'none',selfie:false,lookYaw:a.lookYaw,lookPitch:a.lookPitch});
   hiker.ground({moving:a.moving,phase:a.phase,floorHeight:0,sample:noSample,surfaceHeight:flat,pose:a.pose});
   hidePoles();
   for(const f of a.extra)f(dt,a);
   void steps;
  },
  // 말풍선 자리(머리 위, 월드)
  headTop(target=new THREE.Vector3()){const h=hiker.model?.getObjectByName('mixamorigHead');if(h){h.getWorldPosition(target);target.y+=.42;}else target.set(a.x,1.25,a.z);return target;},
 };
 return a;
}
