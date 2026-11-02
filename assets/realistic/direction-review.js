import * as THREE from 'three';
import {loadLandscape} from './load-landscape.js';
import {project} from './geo.js';
import {directionRows,contrastAt} from './skyline-reference.js';
const params=new URLSearchParams(location.search),bearing=Number(params.get('bearing')??0),fov=Number(params.get('fov')??55);
const status=document.querySelector('#status');
window.__skylineResult={ready:false,error:null};
try{
  const config=await fetch('./config.json').then(r=>{if(!r.ok)throw new Error('설정 없음');return r.json();});
  if(!config.directionCaptures.bearings.includes(bearing)||!config.directionCaptures.verticalFovs.includes(fov))throw new Error('미지정 방위/화각');
  const landscape=await loadLandscape({base:new URL('./generated/',location.href).href});
  const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
  scene.add(landscape.group);landscape.applyEnvironment(scene,renderer);
  const camera=new THREE.PerspectiveCamera(fov,innerWidth/innerHeight,.1,65000),anchor=project(config.observation.lat,config.observation.lon);
  camera.position.set(anchor.x,config.observation.ground+config.observation.eyeHeight,anchor.z);
  const az=THREE.MathUtils.degToRad(bearing),pitch=THREE.MathUtils.degToRad(config.directionCaptures.pitch);
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(az)*Math.cos(pitch),Math.sin(pitch),-Math.cos(az)*Math.cos(pitch))));
  landscape.update(camera);
  const far=await landscape.streamFar();
  for(const chunk of landscape.manifest.cityChunks)await landscape.streamCity(chunk.id);
  await landscape.streamWater();
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const actual=config.landmarks.map(p=>{
    const node=far.getObjectByName(p.name);if(!node)throw new Error(`랜드마크 누락: ${p.name}`);
    const position=node.getWorldPosition(new THREE.Vector3());return {...p,x:position.x,z:position.z,ground:position.y};
  });
  const horizontalFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(fov)/2)*camera.aspect));
  const rows=directionRows(actual,config.observation,bearing,horizontalFov);
  document.querySelector('#heading').textContent=`연주대 ${bearing}° · 수직 FOV ${fov}° · 표고 629m + 눈높이 1.6m`;
  status.textContent='방위·거리: 기준점 대조 / 지형 가림·실사 룩: 사람 확인 필요';
  const table=document.createElement('table'),head=table.insertRow();
  for(const label of ['대상','기준 → 배치 방위','거리','수평 화각','판정']){const th=document.createElement('th');th.textContent=label;head.append(th);}
  for(const row of rows){
    const tr=table.insertRow();
    for(const value of [row.name,`${row.expectedBearing.toFixed(1)}° → ${row.measuredBearing.toFixed(2)}°`,`${(row.measuredDistance/1000).toFixed(2)}km`,row.inHorizontalFrame?'안':'밖',row.placementPass?'좌표 일치':'좌표 불일치']){const td=tr.insertCell();td.textContent=value;}
    if(!row.placementPass)tr.className='error';
    const p=actual.find(p=>p.id===row.id),top=new THREE.Vector3(p.x,p.ground+(p.height||0),p.z).project(camera);
    row.projected={x:top.x,y:top.y,z:top.z};
    if(Math.abs(top.x)<=1&&Math.abs(top.y)<=1&&top.z>=-1&&top.z<=1){
      const label=document.createElement('div');label.className='marker';label.style.left=`${(top.x+1)/2*innerWidth}px`;label.style.top=`${(1-top.y)/2*innerHeight}px`;
      label.textContent=`${row.name} 기준 ${row.expectedBearing}° / 배치 ${row.measuredBearing.toFixed(2)}°${row.modeled?'':' · 기준점만'} · 가림 미판정`;
      document.querySelector('#markers').append(label);
    }
  }
  document.querySelector('#rows').append(table);
  renderer.render(scene,camera);
  if(renderer.info.programs?.some(p=>p.diagnostics?.runnable===false))throw new Error('셰이더 컴파일 실패');
  window.__skylineResult={ready:true,bearing,fov,horizontalFov,observation:config.observation,camera:camera.position.toArray(),rows,
    haze:config.atmosphere.haze,contrast:[8000,10000,12000].map(distance=>({distance,retained:contrastAt(distance,config.atmosphere.contrastStops)})),
    checklist:'시각 검수 대기',visibility:'미검증',rendered:true,releaseApproved:false};
}catch(error){status.textContent=`캡처 불가: ${error.message}`;status.className='error';window.__skylineResult={ready:false,error:error.message};}
