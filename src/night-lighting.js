// 밤 조명: 공원 구간 가로등, 내 헤드랜턴, 다른 등산객의 가짜 헤드랜턴 빛, 시설 보안등.
// 실제 광원(three 라이트) 개수는 항상 같다: 가로등 풀 4 + 내 헤드랜턴 1. 광원 수가 바뀌면 모든 재질이 다시 컴파일되므로 켜고 끌 때는 intensity만 바꾼다.
// 다른 사람의 헤드랜턴은 광원 없이 InstancedMesh 바닥 빛 데칼 + Points 글로우로만 그린다(규칙은 docs 변경기록 '멀티플레이 대비 조명 규칙').
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {sunPosition,resolveUtcMs} from './daytime.js';
import {PARK_LAMP_LATERAL,PARK_END_S,LAMP_HEIGHT,REAL_LIGHT_COUNT,PLAZA_LAMPS,FACILITY_LAMPS,HEADLAMP,OTHERS,lampAmount,headlampDark,headlampOn,lampStations,lampWeights,selectOthers,mountFor,crowdFromSearch} from './night-lighting-config.js';

const LAMP_COLOR=0xffd9a0,LAMP_INTENSITY=95,DECAL_COLOR=[1,.78,.46],OTHER_COLOR=[1,.95,.82];
const smooth=(k,dt)=>1-Math.exp(-Math.max(0,Math.min(dt,.5))/k);
// 바닥 위에 눕는 빛 웅덩이용 가산 혼합 재질. 낮에는 uAmount=0이라 아무것도 그리지 않는다. 톤매핑·색공간 청크를 넣어 합성(AO) 경로와 직접 경로가 같게 보이게 한다.
function decalMaterial(color){
 return new THREE.ShaderMaterial({
  uniforms:{uColor:{value:new THREE.Color().setRGB(...color,THREE.LinearSRGBColorSpace)},uAmount:{value:0}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 uColor;uniform float uAmount;varying vec2 vUv;\nvoid main(){float r=length(vUv-.5)*2.;float a=pow(clamp(1.-r,0.,1.),1.7)*uAmount;gl_FragColor=vec4(uColor,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4
 });
}
// 점 모양 글로우(빌보드). 크기는 월드 m 단위(uSize)를 화면 픽셀로 바꾼다.
function glowMaterial(color,size,maxPx=90){
 return new THREE.ShaderMaterial({
  uniforms:{uColor:{value:new THREE.Color().setRGB(...color,THREE.LinearSRGBColorSpace)},uAmount:{value:0},uSize:{value:size},uScale:{value:700},uMax:{value:maxPx}},
  vertexShader:'uniform float uSize,uScale,uMax;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uSize*uScale/max(.5,-mv.z),2.,uMax);}',
  fragmentShader:'uniform vec3 uColor;uniform float uAmount;\nvoid main(){float r=length(gl_PointCoord-.5)*2.;float a=(pow(clamp(1.-r,0.,1.),2.2)*.9+step(r,.16)*.5)*uAmount;if(a<.004)discard;gl_FragColor=vec4(uColor,min(a,1.));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false
 });
}
const flatQuad=()=>{const g=new THREE.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);return g;};
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_n=new THREE.Vector3(),_up=new THREE.Vector3(0,1,0);
// 지면 법선에 맞춰 기울인 바닥 데칼 행렬. yaw는 three 회전(앞 = -z 쪽).
function decalMatrix(out,x,y,z,yaw,sx,sz,ground){
 if(ground){const e=Math.max(.5,Math.min(sx,sz)*.25),hx=ground(x+e,z)-ground(x-e,z),hz=ground(x,z+e)-ground(x,z-e);_n.set(-hx/(2*e),1,-hz/(2*e)).normalize();_q.setFromUnitVectors(_up,_n);}else _q.identity();
 const yq=new THREE.Quaternion().setFromAxisAngle(_up,yaw);_q.multiply(yq);
 return out.compose(_p.set(x,y+.07,z),_q,_s.set(sx,1,sz));
}

export function createNightLighting({scene,renderer=null,place,groundHeight,gatePoint=null,facilityPoints=[],search=globalThis.location?.search??'',routeLength=0,nowMs=Date.now}){
 const q=new URLSearchParams(search),timeParam=q.get('time'),legacySun=q.has('sun')&&!timeParam;
 const root=new THREE.Group();root.name='night-lighting';scene.add(root);
 const ground=groundHeight??(()=>0);
 // ── 가로등 위치: 공원 구간(길 한쪽) + 광장 + 시설 보안등
 const lamps=[];
 const addLamp=(x,z,tx,tz,boost=1,height=LAMP_HEIGHT,kind='park')=>{
  const y=ground(x,z),dx=tx-x,dz=tz-z,n=Math.hypot(dx,dz)||1,ux=dx/n,uz=dz/n,arm=.85*(height/LAMP_HEIGHT);
  lamps.push({x,y,z,boost,height,kind,yaw:Math.atan2(-uz,ux),lx:x+ux*arm,ly:y+height-.12,lz:z+uz*arm});
 };
 for(const s of lampStations()){const [x,,z]=place(s,PARK_LAMP_LATERAL),[cx,,cz]=place(s,0);addLamp(x,z,cx,cz,1,LAMP_HEIGHT,'park');}
 if(gatePoint)for(const l of PLAZA_LAMPS){const p=gatePoint(l.gx,l.gz),c=gatePoint(0,l.gz);addLamp(p.x,p.z,c.x,c.z,l.boost,LAMP_HEIGHT,'plaza');}
 for(const f of facilityPoints)addLamp(f.x,f.z,f.tx,f.tz,.7,f.height??3.2,'facility');
 const N=lamps.length;
 // 기둥(어두운 금속) 한 번, 전구 발광면 한 번, 바닥 데칼 한 번, 후광 글로우 한 번 = 4 드로우콜.
 const poleGeo=mergeGeometries([
  new THREE.CylinderGeometry(.05,.075,LAMP_HEIGHT,8).translate(0,LAMP_HEIGHT/2,0),
  new THREE.BoxGeometry(.9,.06,.06).translate(.42,LAMP_HEIGHT-.04,0),
  new THREE.BoxGeometry(.46,.09,.28).translate(.85,LAMP_HEIGHT-.04,0)
 ]);
 const poleMat=new THREE.MeshStandardMaterial({color:0x1c1e21,metalness:.55,roughness:.55});
 const poles=new THREE.InstancedMesh(poleGeo,poleMat,Math.max(1,N));poles.name='가로등 기둥';
 const bulbMat=new THREE.MeshStandardMaterial({color:0x8e8d86,roughness:.4,emissive:new THREE.Color(LAMP_COLOR),emissiveIntensity:0});
 const bulbs=new THREE.InstancedMesh(new THREE.BoxGeometry(.4,.03,.22).translate(.85,LAMP_HEIGHT-.1,0),bulbMat,Math.max(1,N));
 const lampDecalMat=decalMaterial(DECAL_COLOR),decals=new THREE.InstancedMesh(flatQuad(),lampDecalMat,Math.max(1,N));
 const halos=glowMaterial(DECAL_COLOR,1.9,160),haloGeo=new THREE.BufferGeometry();
 const haloPos=new Float32Array(Math.max(1,N)*3);
 lamps.forEach((l,i)=>{
  const k=l.height/LAMP_HEIGHT;
  _m.compose(_p.set(l.x,l.y,l.z),_q.setFromAxisAngle(_up,l.yaw),_s.set(k,k,k));poles.setMatrixAt(i,_m);bulbs.setMatrixAt(i,_m);
  const R=(l.kind==='facility'?4.2:l.boost>1.2?7.5:6)*(l.boost>1.2?1:1);decalMatrix(_m,l.lx,l.y,l.lz,0,R*2*Math.min(1.25,l.boost),R*2*Math.min(1.25,l.boost),ground);decals.setMatrixAt(i,_m);
  haloPos.set([l.lx,l.ly-.05,l.lz],i*3);
 });
 haloGeo.setAttribute('position',new THREE.BufferAttribute(haloPos,3));haloGeo.setDrawRange(0,N);
 const haloPoints=new THREE.Points(haloGeo,halos);
 for(const o of [poles,bulbs,decals,haloPoints]){o.frustumCulled=false;root.add(o);}
 decals.renderOrder=2;haloPoints.renderOrder=3;
 // 실제 점광원 풀(그림자 없음). 가까운 가로등에 붙어 다닌다.
 const pool=Array.from({length:REAL_LIGHT_COUNT},()=>{const l=new THREE.PointLight(LAMP_COLOR,0,20,2);l.castShadow=false;l.userData.lamp=-1;root.add(l);return l;});
 // ── 내 헤드랜턴: 실제 SpotLight 1개(그림자 없음). 꺼질 때는 intensity=0.
 const head=new THREE.SpotLight(HEADLAMP.color,0,HEADLAMP.distance,HEADLAMP.angle,HEADLAMP.penumbra,HEADLAMP.decay);head.castShadow=false;
 const headTarget=new THREE.Object3D();root.add(head,headTarget);head.target=headTarget;
 // 3인칭에서 보이는 이마 램프(하우징 + 발광 점 + 글로우)
 const ownLamp=new THREE.Group(),housing=new THREE.Mesh(new THREE.BoxGeometry(.05,.034,.03),new THREE.MeshStandardMaterial({color:0x16181b,roughness:.5}));
 const lens=new THREE.Mesh(new THREE.SphereGeometry(.014,10,8),new THREE.MeshStandardMaterial({color:0x222222,emissive:new THREE.Color(0xfff2dc),emissiveIntensity:0}));lens.position.z=-.018;
 ownLamp.add(housing,lens);root.add(ownLamp);
 const ownGlowMat=glowMaterial([1,.94,.8],.22,70),ownGlowGeo=new THREE.BufferGeometry();ownGlowGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3),3));
 const ownGlow=new THREE.Points(ownGlowGeo,ownGlowMat);ownGlow.frustumCulled=false;ownGlow.renderOrder=4;root.add(ownGlow);
 // ── 다른 등산객: 광원 없음. 몸(자리표시, 인스턴스 1회) + 앞길 빛 데칼(인스턴스 1회) + 글로우(Points 1회)
 let others=[];
 const otherDecalMat=decalMaterial(OTHER_COLOR),otherDecals=new THREE.InstancedMesh(flatQuad(),otherDecalMat,OTHERS.cap);otherDecals.count=0;otherDecals.frustumCulled=false;otherDecals.renderOrder=2;
 const otherGlowMat=glowMaterial(OTHER_COLOR,.34,48),otherGlowGeo=new THREE.BufferGeometry(),otherGlowPos=new Float32Array(OTHERS.cap*3);
 otherGlowGeo.setAttribute('position',new THREE.BufferAttribute(otherGlowPos,3));otherGlowGeo.setDrawRange(0,0);
 const otherGlow=new THREE.Points(otherGlowGeo,otherGlowMat);otherGlow.frustumCulled=false;otherGlow.renderOrder=3;
 const bodyGeo=mergeGeometries([new THREE.CapsuleGeometry(.2,.75,3,8).translate(0,1.05,0),new THREE.SphereGeometry(.12,8,6).translate(0,1.72,0)]);
 const bodies=new THREE.InstancedMesh(bodyGeo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9}),OTHERS.bodyCap);bodies.count=0;bodies.frustumCulled=false;
 root.add(otherDecals,otherGlow,bodies);
 const tint=new THREE.Color(),palette=[0x2c3d5c,0x6b2230,0x2f5a3a,0x4a4a4f,0x8a5a2c,0x20252b];
 // ── 가짜 등산객(부하 시험): ?crowd=N
 const crowdCount=crowdFromSearch(search),crowd=[],maxS=routeLength?routeLength-10:Infinity;let crowdAnchor=null,crowdFrame=0;
 const seeded=(i,k)=>{const v=Math.sin(i*127.1+k*311.7)*43758.5453;return v-Math.floor(v);};
 function initCrowd(playerS){
  crowdAnchor=playerS;crowd.length=0;
  for(let i=0;i<crowdCount;i++)crowd.push({off:-60+seeded(i,1)*200,lat:(seeded(i,2)-.5)*1.4,dir:seeded(i,3)<.5?1:-1,v:1+seeded(i,4)*.5,color:palette[i%palette.length]});
 }
 function stepCrowd(dt,playerS){
  if(!crowdCount)return;if(crowdAnchor===null||Math.abs(playerS-crowdAnchor)>120)initCrowd(playerS);
  crowdFrame++;const step=3;if(crowdFrame%step)return;
  const list=[];
  for(const c of crowd){
   c.off+=c.dir*c.v*dt*step;if(c.off>140||c.off<-80){c.dir*=-1;c.off=Math.max(-80,Math.min(140,c.off));}
   const s=Math.min(crowdAnchor+c.off,maxS),[x,y,z]=place(s,c.lat),[x2,,z2]=place(Math.min(s+c.dir*1.5,maxS+4),c.lat);
   list.push({x,y,z,heading:Math.atan2(-(x2-x),-(z2-z)),color:c.color});
  }
  others=list;
 }
 // ── 상태
 const state={lamps:0,head:0,headOverride:null,dark:0,elevation:30,sinceSun:1e9,fps:null};
 function sunElevation(dt){
  state.sinceSun+=dt;if(state.sinceSun<.5)return state.elevation;state.sinceSun=0;
  if(legacySun)return state.elevation=30;
  const {utcMs}=resolveUtcMs({time:timeParam,nowMs:nowMs()});return state.elevation=sunPosition(utcMs).elevation;
 }
 let fillLight=null;
 const fwd=new THREE.Vector3(),headPos=new THREE.Vector3(),tmp=new THREE.Vector3();
 let scaleCache=700;const sizeVec=new THREE.Vector2();
 function update(dt,{camera,avatar=null,view='first',selfie=false,zone='route',s=0,hatKind='none',hiker=null}={}){
  const elevation=sunElevation(dt);
  const lampGoal=lampAmount(elevation),darkGoal=headlampDark(elevation);
  state.lamps+=(lampGoal-state.lamps)*smooth(.9,dt);state.dark=darkGoal;
  const on=headlampOn({dark:darkGoal,zone,s,override:state.headOverride});
  state.headOn=on;state.head+=((on?1:0)-state.head)*smooth(.2,dt);
  // 가로등 밝기(모든 가로등 같은 값). 낮에는 0이라 꺼진 등으로 보인다.
  const a=state.lamps;bulbMat.emissiveIntensity=a*4.5;lampDecalMat.uniforms.uAmount.value=a*.42;halos.uniforms.uAmount.value=a*.9;
  const weighted=lampWeights(lamps,camera.position.x,camera.position.z,REAL_LIGHT_COUNT),near=weighted.map(v=>v.i),assigned=new Set(near),weight=new Map(weighted.map(v=>[v.i,v.w]));
  for(const l of pool)if(!assigned.has(l.userData.lamp))l.userData.lamp=-1;
  const taken=new Set(pool.map(l=>l.userData.lamp));
  for(const l of pool){if(l.userData.lamp>=0)continue;const pick=near.find(i=>!taken.has(i));if(pick!==undefined){l.userData.lamp=pick;taken.add(pick);}}
  for(const l of pool){const lamp=lamps[l.userData.lamp];if(!lamp){l.intensity=0;continue;}l.position.set(lamp.lx,lamp.ly,lamp.lz);l.intensity=LAMP_INTENSITY*lamp.boost*a*(weight.get(l.userData.lamp)??0);}
  // 내 헤드랜턴
  const h=state.head;head.intensity=HEADLAMP.intensity*h;
  if(h>.003){
   if((view==='third'||selfie)&&avatar){
    const rot=avatar.rotation.y,fx=-Math.sin(rot),fz=-Math.cos(rot),bone=avatar.getObjectByName?.('Head'),m=mountFor(hatKind);
    if(bone)bone.getWorldPosition(headPos);else headPos.set(avatar.position.x,avatar.position.y+(hiker?.eyeHeight??1.6),avatar.position.z);
    // 머리뼈는 목 아래쪽 기준일 수 있어 눈높이 기준으로 보정한다.
    if(hiker?.eyeHeight)headPos.y=avatar.position.y+hiker.eyeHeight;
    headPos.x+=fx*m.forward;headPos.z+=fz*m.forward;headPos.y+=m.up;
    ownLamp.position.copy(headPos);ownLamp.rotation.set(-.1,rot,0);
    // 빛 원점은 모자챙·얼굴 앞(HEADLAMP.beamAhead)에 둔다. 얼굴 안쪽에 두면 얼굴에 동그란 빛 무늬가 생긴다. 원뿔은 원점 뒤를 비추지 않으므로 얼굴·몸은 빛을 받지 않는다.
    fwd.set(fx,-.115,fz).normalize();head.position.copy(headPos).addScaledVector(tmp.set(fx,0,fz),HEADLAMP.beamAhead);
   }else{
    camera.getWorldDirection(fwd);fwd.y=Math.min(fwd.y,-.06);fwd.normalize();head.position.copy(camera.position).addScaledVector(fwd,.12);head.position.y-=.04;
   }
   head.target.position.copy(head.position).addScaledVector(fwd,HEADLAMP.reach);head.target.updateMatrixWorld();
  }
  // 셀카: 얼굴에는 앞쪽에서 오는 아주 약한 반사광만 준다(가로등 풀에서 가장 약한 광원 1개를 빌려 쓰므로 실제 광원 수는 그대로).
  if(fillLight){fillLight.distance=20;fillLight.decay=2;fillLight=null;}
  if(selfie&&h>.003&&avatar){const l=pool.reduce((m,x)=>x.intensity<m.intensity?x:m);if(l){fillLight=l;const rot=avatar.rotation.y;l.position.copy(headPos).addScaledVector(tmp.set(-Math.sin(rot),0,-Math.cos(rot)),HEADLAMP.fillAhead);l.position.y+=.02;l.color.setHex(HEADLAMP.color);l.distance=HEADLAMP.fillDistance;l.decay=2;l.intensity=HEADLAMP.fillIntensity*h;}}
  const showOwn=(view==='third'||selfie)&&h>.003&&!!avatar;
  ownLamp.visible=ownGlow.visible=showOwn;lens.material.emissiveIntensity=h*5;ownGlowMat.uniforms.uAmount.value=h;
  if(showOwn)ownGlowGeo.attributes.position.set([headPos.x,headPos.y,headPos.z],0),ownGlowGeo.attributes.position.needsUpdate=true;
  // 다른 등산객
  stepCrowd(dt,s);
  updateOthers(camera);
  // 글로우 크기 환산(화면 높이 / 2tan(fov/2))
  if(renderer?.getDrawingBufferSize){const size=renderer.getDrawingBufferSize(sizeVec);scaleCache=size.y/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));}
  for(const m of [halos,ownGlowMat,otherGlowMat])m.uniforms.uScale.value=scaleCache;
 }
 function updateOthers(camera){
  const cam=camera.position,night=darkAmount();state.darkSmooth=night;
  const pick=selectOthers(others,cam.x,cam.z);
  const a=night*.34;otherDecalMat.uniforms.uAmount.value=a;otherGlowMat.uniforms.uAmount.value=night;
  // 몸(자리표시)은 낮에도 그린다. 가까운 순 상한까지.
  const order=others.map((o,i)=>({i,d:Math.hypot(o.x-cam.x,o.z-cam.z)})).filter(r=>r.d<=OTHERS.bodyRange).sort((x,y)=>x.d-y.d).slice(0,OTHERS.bodyCap);
  bodies.count=order.length;
  order.forEach((r,k)=>{const o=others[r.i];_m.compose(_p.set(o.x,o.y,o.z),_q.setFromAxisAngle(_up,o.heading),_s.set(1,1,1));bodies.setMatrixAt(k,_m);bodies.setColorAt(k,tint.set(o.color??0x2c3d5c));});
  bodies.instanceMatrix.needsUpdate=true;if(bodies.instanceColor)bodies.instanceColor.needsUpdate=true;
  otherDecals.count=night>.02?pick.decal.length:0;
  pick.decal.forEach((idx,k)=>{const o=others[idx],fx=-Math.sin(o.heading),fz=-Math.cos(o.heading),cx=o.x+fx*4.6,cz=o.z+fz*4.6;decalMatrix(_m,cx,ground(cx,cz),cz,o.heading,2.4,7,ground);otherDecals.setMatrixAt(k,_m);});
  otherDecals.instanceMatrix.needsUpdate=true;
  const glowCount=night>.02?pick.glow.length:0;otherGlowGeo.setDrawRange(0,glowCount);
  pick.glow.slice(0,glowCount).forEach((idx,k)=>{const o=others[idx],fx=-Math.sin(o.heading),fz=-Math.cos(o.heading);otherGlowPos.set([o.x+fx*.1,o.y+1.78,o.z+fz*.1],k*3);});
  otherGlowGeo.attributes.position.needsUpdate=true;
  state.othersDrawn={bodies:order.length,decals:otherDecals.count,glows:glowCount,dropped:pick.dropped};
 }
 const darkAmount=()=>state.dark;
 function toggleHeadlamp(){state.headOverride=!state.headOn;return state.headOverride;}
 function setOthers(list){others=Array.isArray(list)?list:[];}
 const info=()=>({lamps:N,lampAmount:state.lamps,headlamp:{on:!!state.headOn,amount:state.head,override:state.headOverride},elevation:state.elevation,realLights:countLights(),pool:pool.map(l=>l.userData.lamp),others:others.length,othersDrawn:state.othersDrawn??null,crowd:crowdCount,parkEndS:PARK_END_S,lampStations:lamps.filter(l=>l.kind==='park').length});
 function countLights(){let n=0;scene.traverse(o=>{if(o.isLight)n++;});return n;}
 // L 키와 #headlamp 버튼
 const typing=e=>e.target?.closest?.('input, textarea, select, [contenteditable]');
 function onKey(e){if(e.code!=='KeyL'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||typing(e))return;if(globalThis.hiking&&!globalThis.hiking.started)return;if(document.querySelector('dialog[open]'))return;toggleHeadlamp();syncButton();}
 function syncButton(){const b=document.getElementById?.('headlamp');if(b){b.setAttribute('aria-pressed',String(!!state.headOn));b.querySelector('span').textContent=state.headOn?'헤드랜턴 켜짐':'헤드랜턴 꺼짐';}}
 if(typeof window!=='undefined'){window.addEventListener('keydown',onKey);document.getElementById?.('headlamp')?.addEventListener('click',e=>{if(globalThis.hiking?.started!==false){toggleHeadlamp();syncButton();}e.currentTarget.blur();});}
 return {update,setOthers,toggleHeadlamp,syncButton,info,lamps,pool,head,root,get others(){return others;}};
}
