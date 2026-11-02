import * as THREE from 'three';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {LOOK_PROFILE,sunDirection,HAZE_FRAGMENT} from './look-profile.js';
import {calibrateLook} from './look-calibration.js';
import {INDIRECT_PROFILE,neutralizeEnvironment} from './indirect-light.js';

export function setupRendering(renderer,scene,camera,mobile,environmentSky){
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const comparison=new URLSearchParams(location.search).get('tone')==='aces';
  renderer.toneMapping=comparison?THREE.ACESFilmicToneMapping:THREE.NeutralToneMapping;
  renderer.toneMappingExposure=1;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  THREE.ShaderChunk.fog_vertex=`#ifdef USE_FOG\n vFogDepth=length(mvPosition.xyz);\n#endif`;
  THREE.ShaderChunk.fog_fragment=HAZE_FRAGMENT;
  scene.background=new THREE.Color(LOOK_PROFILE.haze);
  scene.fog=new THREE.Fog(LOOK_PROFILE.haze,0,LOOK_PROFILE.far);
  const sun=new THREE.DirectionalLight(LOOK_PROFILE.sunColor,4);
  const groundFill=new THREE.HemisphereLight(INDIRECT_PROFILE.skyColor,INDIRECT_PROFILE.groundColor,INDIRECT_PROFILE.hemisphereIntensity);scene.add(groundFill);
  const solarOffset=new THREE.Vector3().fromArray(sunDirection()).multiplyScalar(80);
  const sky=new THREE.Group();scene.add(sky);if(environmentSky)scene.background=environmentSky;
  sun.castShadow=true;sun.shadow.bias=-.001;sun.shadow.normalBias=.12;sun.shadow.radius=2;
  Object.assign(sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:140});
  scene.add(sun,sun.target);
  const status={indirectLight:{...INDIRECT_PROFILE},profile:LOOK_PROFILE.id,toneMapping:comparison?'ACES Filmic (비교용)':'Neutral',sunElevation:29,sunAzimuth:142,shadowAzimuth:322,shadowLengthPerHeight:1/Math.tan(29*Math.PI/180),sunColor:LOOK_PROFILE.sunColor,hazeColor:LOOK_PROFILE.haze,skyZenith:LOOK_PROFILE.zenith,far:LOOK_PROFILE.far,hdri:'로딩 중',ao:false,shadows:false,shaderErrors:[],calibration:{calibrated:false}};
  renderer.debug.onShaderError=(gl,program,vs,fs)=>{status.shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].filter(Boolean).join('\n'));};
  // HDRI는 환경 조명 전용이다. 다른 지역 사진을 관악산 배경으로 표시하지 않는다.
  const environmentReady=(environmentSky?Promise.resolve(environmentSky.clone()):new RGBELoader().setDataType(THREE.FloatType).loadAsync(`${import.meta.env.BASE_URL}environment/kiara_4_mid-morning_1k.hdr`)).then(texture=>{
    // HDRI의 태양 고휘도 픽셀을 하늘 상위 95% 휘도로 제한해 직사광 이중 계산을 줄인다.
    texture.image={...texture.image,data:texture.image.data.slice()};
    const data=texture.image.data,levels=[];for(let i=0;i<data.length;i+=4)levels.push(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);levels.sort((a,b)=>a-b);const cap=levels[Math.floor(levels.length*.95)];
    for(let i=0;i<data.length;i+=4){const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2],factor=lum>cap?cap/lum:1;data[i]*=factor;data[i+1]*=factor;data[i+2]*=factor;}texture.needsUpdate=true;
    neutralizeEnvironment(texture);
    const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromEquirectangular(texture);
    scene.environment=env.texture;texture.dispose();pmrem.dispose();
    try{status.calibration=calibrateLook(renderer,env.texture,groundFill);scene.environmentIntensity=status.calibration.environmentIntensity;groundFill.intensity=status.calibration.hemisphereIntensity;renderer.toneMappingExposure=status.calibration.exposure;}catch(error){status.calibration={calibrated:false,error:error.message};scene.environmentIntensity=.3;}
    status.hdri='Poly Haven Kloppenheim 06 PureSky 1K · CC0';
  }).catch(error=>{status.hdri='실패: '+error.message;console.warn('HDRI 로드 실패, 하늘 기본광 사용',error);});
  let composer=null,ao=null,current=-1;
  function resize(quality,width,height,dpr){
    const enableAO=!mobile&&quality===2;
    if(enableAO&&!composer){composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));ao=new SSAOPass(scene,camera,width,height,12);ao.kernelRadius=6;ao.minDistance=.0001;ao.maxDistance=.008;composer.addPass(ao);composer.addPass(new OutputPass());}
    status.ao=enableAO;status.shadows=quality>0;
    renderer.shadowMap.enabled=status.shadows;sun.castShadow=status.shadows;
    const shadowSize=quality===2&&!mobile?2048:1024;
    if(current!==quality){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);current=quality;}
    if(composer){composer.setPixelRatio(dpr);composer.setSize(width,height);}
    // 품질에 따라 물리적인 원경 대비를 바꾸지 않는다. 가까운 지형만 LOD로 줄인다.
  }
  renderer.info.autoReset=false;
  function render(position){
    renderer.info.reset();
    // 원점과 무관하게 캐릭터 부근 56m 그림자 영역을 유지한다.
    sun.target.position.copy(position);sun.position.copy(position).add(solarOffset);sky.position.copy(camera.position);
    const solarDirection=new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize();
    status.sunElevation=THREE.MathUtils.radToDeg(Math.asin(solarDirection.y));status.sunAzimuth=(THREE.MathUtils.radToDeg(Math.atan2(solarDirection.x,-solarDirection.z))+360)%360;
    if(status.ao)composer.render();else renderer.render(scene,camera);
  }
  return {resize,render,status,environmentReady};
}

// 카메라 근평면 네 모서리와 중앙에서 충돌을 검사해 지형·계단 앞쪽으로 당긴다.
export function retractCamera(target,desired,objects,camera){
  const delta=new THREE.Vector3().subVectors(desired,target),length=delta.length();
  if(length<1e-6)return desired.clone();
  const direction=delta.normalize(),right=new THREE.Vector3().crossVectors(direction,camera.up).normalize();
  const up=new THREE.Vector3().crossVectors(right,direction).normalize();
  const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.near+.08,halfWidth=halfHeight*camera.aspect;
  const ray=new THREE.Raycaster();let distance=length;
  for(const [u,v]of [[0,0],[-1,-1],[-1,1],[1,-1],[1,1]]){
    const offset=right.clone().multiplyScalar(u*halfWidth).addScaledVector(up,v*halfHeight);
    ray.set(target.clone().add(offset),direction);ray.far=length+.25;
    const hit=ray.intersectObjects(objects,true)[0];if(hit)distance=Math.min(distance,Math.max(0,hit.distance-.25));
  }
  return target.clone().addScaledVector(direction,distance);
}
