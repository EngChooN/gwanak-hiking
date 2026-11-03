import * as THREE from 'three';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {LOOK_PROFILE,sunDirection,HAZE_FRAGMENT} from './look-profile.js';
import {calibrateLook} from './look-calibration.js';
import {INDIRECT_PROFILE,neutralizeEnvironment} from './indirect-light.js';
import {installRenderBreakdown} from './render-breakdown.js';
import {warmRenderingPaths} from './rendering-preparation.js';
import {createAOProfiler} from './ao-profiler.js';

export function setupRendering(renderer,scene,camera,mobile,environmentSky){
  const parameters=new URLSearchParams(location.search),requestedMode=parameters.get('aoMode');
  const diagnosticMode=['off','normal','full'].includes(requestedMode)?requestedMode:null;
  const profiler=createAOProfiler(renderer,parameters.get('aoProfile')==='1');
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
  renderer.debug.onShaderError=(gl,program,vs,fs)=>{
    const source=gl.getShaderSource(fs)??'';
    const name=source.match(/#define SHADER_NAME\s+(\S+)/)?.[1]??'알 수 없는 재질';
    const hook=source.includes('gAtmosphereView')?'대기 감쇠':source.includes('landWorld')?'지형 혼합':'기본/override';
    status.shaderErrors.push([`${name} / ${hook}`,gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].filter(Boolean).join('\n'));
  };
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
  let composer=null,ao=null,current=-1,lastResize=null;
  function resize(quality,width,height,dpr,adaptive={}){
    lastResize=[quality,width,height,dpr,{...adaptive}];
    const enableAO=!mobile&&(diagnosticMode==='full'||diagnosticMode==='normal'||(!diagnosticMode&&quality===2&&adaptive.ao!==false));
    if(enableAO&&!composer){
      composer=new EffectComposer(renderer);const basePass=new RenderPass(scene,camera);composer.addPass(basePass);
      const baseRender=basePass.render.bind(basePass);basePass.render=(...args)=>profiler.measure('기본 장면',()=>baseRender(...args));
      ao=new SSAOPass(scene,camera,width,height,12);ao.kernelRadius=6;ao.minDistance=.0001;ao.maxDistance=.008;
      const normal=ao._renderOverride.bind(ao),fullscreen=ao._renderPass.bind(ao);
      ao._renderOverride=(...args)=>profiler.measure('법선 장면 재렌더',()=>normal(...args));
      ao._renderPass=(...args)=>profiler.measure('AO 후처리 합계',()=>fullscreen(...args));
      composer.addPass(ao);composer.addPass(new OutputPass());
    }
    status.ao=enableAO&&diagnosticMode!=='normal';status.normalPass=enableAO;status.shadows=quality>0;
    renderer.shadowMap.enabled=status.shadows;sun.castShadow=status.shadows;
    const distance=adaptive.shadowDistance??(quality===2?60:45);
    status.shadowDistance=status.shadows?distance:0;
    const half=distance/2;
    Object.assign(sun.shadow.camera,{left:-half,right:half,top:half,bottom:-half});
    sun.shadow.camera.updateProjectionMatrix();
    const shadowSize=quality===2&&!mobile?2048:1024;
    if(current!==quality){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);current=quality;}
    if(composer){
      composer.setPixelRatio(dpr);composer.setSize(width,height);
      // 합성 대상은 원래 해상도로 유지하고 법선·AO·흐림만 각 변을 절반으로 줄인다.
      ao.setSize(Math.max(1,Math.floor(width*dpr/2)),Math.max(1,Math.floor(height*dpr/2)));
      status.aoResolution={width:ao.width,height:ao.height,scale:.5,kernelSamples:12};
    }
    // 품질에 따라 물리적인 원경 대비를 바꾸지 않는다. 가까운 지형만 LOD로 줄인다.
  }
  renderer.info.autoReset=false;
  const breakdown=installRenderBreakdown(renderer);
  function render(position){
    renderer.info.reset();
    breakdown.reset();
    // 카메라 주변 30~60m 폭. 갱신 간격은 화질 비교 전까지 매 프레임 유지한다.
    sun.target.position.copy(camera.position);sun.position.copy(camera.position).add(solarOffset);sky.position.copy(camera.position);
    const solarDirection=new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize();
    status.sunElevation=THREE.MathUtils.radToDeg(Math.asin(solarDirection.y));status.sunAzimuth=(THREE.MathUtils.radToDeg(Math.atan2(solarDirection.x,-solarDirection.z))+360)%360;
    profiler.poll();
    if(ao&&diagnosticMode==='normal'){
      profiler.measure('기본 장면',()=>renderer.render(scene,camera));
      const target=renderer.getRenderTarget();
      try{ao._overrideVisibility();ao._renderOverride(renderer,ao.normalMaterial,ao.normalRenderTarget,0x7777ff,1);}
      finally{ao._restoreVisibility();renderer.setRenderTarget(target);}
    }else if(status.ao)composer.render();else profiler.measure('기본 장면',()=>renderer.render(scene,camera));
    status.aoProfile=profiler.status;status.aoDiagnosticMode=diagnosticMode;
    status.breakdown=breakdown.snapshot();
    const submitted=Object.values(status.breakdown).reduce((sum,row)=>({triangles:sum.triangles+row.triangles,drawCalls:sum.drawCalls+row.drawCalls}),{triangles:0,drawCalls:0});
    // Sprite 등 renderBufferDirect를 거치지 않는 제출도 합계에서 빠뜨리지 않는다.
    status.breakdown['기타/직접 제출 외']={kind:'기타',pass:'직접 제출 외',triangles:renderer.info.render.triangles-submitted.triangles,drawCalls:renderer.info.render.calls-submitted.drawCalls};
  }
  async function prepare(){
    status.compiling=true;status.compileError=null;
    try{
      // compileAsync 내부의 동기 순회를 보행 전에만 수행한다.
      const selected=lastResize;
      await warmRenderingPaths({mobile,
        apply:(quality,enableAO)=>resize(quality,selected[1],selected[2],selected[3],{ao:enableAO}),
        compile:()=>renderer.compileAsync(scene,camera),
        render:()=>render(camera.position),
        restore:()=>resize(...selected)
      });
      render(camera.position);
      status.compileCount=(status.compileCount??0)+1;
    }catch(error){status.compileError=error.message;throw error;}
    finally{status.compiling=false;}
  }
  return {resize,render,prepare,status,environmentReady};
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
