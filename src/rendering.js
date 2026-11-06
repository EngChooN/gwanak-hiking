import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {BLOOM,NIGHT} from './mood-config.js';
import {moodBlend} from './mood-grade.js';
import {LOOK_PROFILE,SUN_PRESETS,sunDirection,HAZE_FRAGMENT} from './look-profile.js';
import {createSkyDome,bakeSkyEnvironment,updateSky} from './sky-dome.js';
import {createEnvironment} from './environment.js';
import {createPrecipitation} from './precipitation.js';
import {setWeatherSound} from './ambient-config.js';
import {installEnvironmentHud} from './hud.js';
import {calibrateLook} from './look-calibration.js';
import {INDIRECT_PROFILE,neutralizeEnvironment} from './indirect-light.js';
import {installRenderBreakdown} from './render-breakdown.js';
import {warmRenderingPaths} from './rendering-preparation.js';
import {createAOProfiler} from './ao-profiler.js';
import {updateLightFx,createLightShafts,canopyAt,LIGHT_FX} from './light-fx.js';

// 색 보정 패스(톤매핑 전 선형 값): 채도, 그늘의 푸른/분홍 기운, 밝은 곳의 따뜻한 기운. 값은 mood-config.js.
const GRADE_SHADER={name:'MoodGrade',uniforms:{tDiffuse:{value:null},saturation:{value:1},shadowTint:{value:new THREE.Vector3(1,1,1)},shadowAmount:{value:0},warm:{value:new THREE.Vector3(1,1,1)},exposure:{value:1}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:'uniform sampler2D tDiffuse;uniform float saturation,shadowAmount,exposure;uniform vec3 shadowTint,warm;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));c.rgb=mix(vec3(l),c.rgb,saturation);float v=l*exposure;c.rgb*=mix(vec3(1.0),shadowTint,shadowAmount*(1.0-smoothstep(0.0,0.4,v)));c.rgb*=mix(vec3(1.0),warm,smoothstep(0.35,1.0,v));gl_FragColor=c;}'};
// 블룸 밝기 추출 단계에 밝기 상한(BLOOM.cap)과 부드러운 문턱(BLOOM.knee)을 둔다. NaN·무한대 픽셀도 0으로 지운다.
// 상한이 없으면 가로등 전구·갓 밑처럼 점광원 바로 옆 면이 보이는 순간 블룸이 화면 전체로 번쩍인다.
export function capBloomInput(bloom,{cap=BLOOM.cap,knee=BLOOM.knee}={}){
 const m=bloom.materialHighPassFilter,anchor='vec4 texel = texture2D( tDiffuse, vUv );';
 if(!m.fragmentShader.includes(anchor))return false;
 m.defines={...m.defines,BLOOM_CAP:cap.toFixed(3)};
 m.fragmentShader=m.fragmentShader.replace(anchor,`${anchor}\n\t\t\tif(any(isnan(texel))||any(isinf(texel)))texel=vec4(0.);\n\t\t\ttexel.rgb*=min(1.,BLOOM_CAP/max(luminance(texel.rgb),1e-4));`);
 bloom.highPassUniforms.smoothWidth.value=knee;m.needsUpdate=true;return true;
}
// options.style==='toon'이면 options.toon(src/toon/index.js의 createToonStyle 결과)의 하늘·후처리(외곽선·블룸·색보정)를 쓴다.
// 카툰은 Preetham 하늘·환경광 굽기·SSAO·실사 블룸/색 보정을 만들지 않는다. 시각·날씨·태양·그림자·강수·소리는 두 모드가 같다.
export function setupRendering(renderer,scene,camera,mobile,environmentSky,{style='realistic',toon=null}={}){
  const toonMode=style==='toon'&&!!toon?.pipeline;
  if(!toonMode)throw new Error('카툰 후처리(toon.pipeline)가 필요합니다 — 실사 모드는 제거됨');
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
  // 가을 11월 초 태양(산리서치 계산값). ?sun=pm이면 오후 3시, 기본은 오전 10시.
  // 이제 기본은 서울 현재 시각의 태양이다(daytime.js). ?time=HH:MM 수동 지정, ?sun=am|pm 은 예전처럼 고정 태양.
  // 환경광 굽기·노출 보정은 항상 낮 기준 태양(am)으로 한 번만 하고, 시각·날씨 변화는 강도·색으로 따라간다.
  const sunPreset=SUN_PRESETS[parameters.get('sun')]??SUN_PRESETS.am,sunDir=sunDirection(SUN_PRESETS.am.elevation,SUN_PRESETS.am.azimuth);
  const environment=createEnvironment({search:location.search}),precipitation=createPrecipitation();scene.add(precipitation.group);
  environment.weather.start();installEnvironmentHud();
  const ENV_GRAY_CUT=+(parameters.get('envcut')??.7),HEMI_GRAY_BOOST=+(parameters.get('hemiboost')??2);
  const base={environmentIntensity:.3,hemisphereIntensity:INDIRECT_PROFILE.hemisphereIntensity,exposure:1},clock={last:performance.now(),elapsed:0};
  const sunVector=new THREE.Vector3(),moonVector=new THREE.Vector3(),tmpColor=new THREE.Color();
  scene.background=new THREE.Color(LOOK_PROFILE.horizon);
  scene.fog=new THREE.Fog(LOOK_PROFILE.haze,0,LOOK_PROFILE.far);
  const sun=new THREE.DirectionalLight(LOOK_PROFILE.sunColor,4);
  const groundFill=new THREE.HemisphereLight(INDIRECT_PROFILE.skyColor,INDIRECT_PROFILE.groundColor,INDIRECT_PROFILE.hemisphereIntensity);scene.add(groundFill);
  const solarOffset=new THREE.Vector3().fromArray(sunDir).multiplyScalar(80);
  const sky=toonMode?toon.createSky():createSkyDome(LOOK_PROFILE,sunDir);if(!toonMode)scene.add(sky);
  // 나뭇잎 사이로 새는 빛줄기(볼륨 빛 카드). 바닥 그림자 얼룩·계곡 물 uniform은 light-fx.js가 함께 갱신한다.
  const shafts=createLightShafts({mobile});scene.add(shafts.mesh);globalThis.__lightFx={shafts,LIGHT_FX}; // 화면 조정·검증용
  sun.castShadow=true;sun.shadow.bias=-.001;sun.shadow.normalBias=.12;sun.shadow.radius=2;
  Object.assign(sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:140});
  scene.add(sun,sun.target);
  const status={indirectLight:{...INDIRECT_PROFILE},profile:LOOK_PROFILE.id,toneMapping:comparison?'ACES Filmic (비교용)':'Neutral',sunPreset:sunPreset.label,sunElevation:sunPreset.elevation,sunAzimuth:sunPreset.azimuth,shadowAzimuth:(sunPreset.azimuth+180)%360,shadowLengthPerHeight:1/Math.tan(sunPreset.elevation*Math.PI/180),sunColor:LOOK_PROFILE.sunColor,hazeColor:LOOK_PROFILE.haze,skyZenith:LOOK_PROFILE.zenith,far:LOOK_PROFILE.far,hdri:'로딩 중',ao:false,shadows:false,shaderErrors:[],calibration:{calibrated:false}};
  renderer.debug.onShaderError=(gl,program,vs,fs)=>{
    const source=gl.getShaderSource(fs)??'';
    const name=source.match(/#define SHADER_NAME\s+(\S+)/)?.[1]??'알 수 없는 재질';
    const hook=source.includes('gAtmosphereView')?'대기 감쇠':source.includes('landWorld')?'지형 혼합':'기본/override';
    status.shaderErrors.push([`${name} / ${hook}`,gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].filter(Boolean).join('\n'));
  };
  // 환경광은 같은 Sky 셰이더를 PMREM으로 구워 쓴다. 푸른 천공광·따뜻한 지면 반사광이 하늘색과 일치하고 외부 HDRI 의존이 없다.
  const environmentReady=toonMode?Promise.resolve().then(()=>{scene.environment=null;status.hdri='카툰: 환경광 굽기 없음(툰 음영)';status.toon=toon.status;}):Promise.resolve().then(()=>{
    const envTexture=bakeSkyEnvironment(renderer,LOOK_PROFILE,sunDir,INDIRECT_PROFILE.groundColor);
    scene.environment=envTexture;
    try{status.calibration=calibrateLook(renderer,envTexture,groundFill,sunDir);scene.environmentIntensity=status.calibration.environmentIntensity;groundFill.intensity=status.calibration.hemisphereIntensity;renderer.toneMappingExposure=status.calibration.exposure;Object.assign(base,{environmentIntensity:status.calibration.environmentIntensity,hemisphereIntensity:status.calibration.hemisphereIntensity,exposure:status.calibration.exposure});}catch(error){status.calibration={calibrated:false,error:error.message};scene.environmentIntensity=.3;}
    status.hdri='Preetham 물리 기반 Sky 셰이더(three.js, MIT) · 외부 HDRI 없음';
  }).catch(error=>{status.hdri='실패: '+error.message;console.warn('하늘 환경광 생성 실패',error);});
  let composer=null,ao=null,bloom=null,grade=null,bloomScale=.5,current=-1,lastResize=null;
  // SSAO는 실사 전용이었다(2026-11-06 실사 모드 제거로 빌드에서 뺌). 카툰 후처리는 toon.pipeline이 맡는다.
  const SSAOPass=null,ssaoReady=Promise.resolve();
  function resize(quality,width,height,dpr,adaptive={}){
    lastResize=[quality,width,height,dpr,{...adaptive}];
    if(toonMode){
      toon.pipeline.resize(quality,width,height,dpr);status.mood=true;status.ao=false;status.normalPass=false;status.shadows=true;
      renderer.shadowMap.enabled=true;sun.castShadow=true;
      const distance=adaptive.shadowDistance??[30,45,60][quality];status.shadowDistance=distance;const half=distance/2;
      Object.assign(sun.shadow.camera,{left:-half,right:half,top:half,bottom:-half});sun.shadow.camera.updateProjectionMatrix();
      if(current!==quality){sun.shadow.map?.dispose();sun.shadow.map=null;const size=quality===2&&!mobile?2048:1024;sun.shadow.mapSize.set(size,size);current=quality;}
      return;
    }
    const enableAO=!mobile&&(diagnosticMode==='full'||diagnosticMode==='normal'||(!diagnosticMode&&quality===2&&adaptive.ao!==false));
    // 블룸·색 보정은 균형 이상에서만(낮음·휴대폰은 끈다).
    const enableMood=parameters.get('mood')!=='off'&&!mobile&&!diagnosticMode&&quality>=BLOOM.minQuality&&adaptive.bloom!==false;
    if((enableAO||enableMood)&&!composer&&SSAOPass){
      composer=new EffectComposer(renderer);const basePass=new RenderPass(scene,camera);composer.addPass(basePass);
      const baseRender=basePass.render.bind(basePass);basePass.render=(...args)=>profiler.measure('기본 장면',()=>baseRender(...args));
      ao=new SSAOPass(scene,camera,width,height,12);ao.kernelRadius=6;ao.minDistance=.0001;ao.maxDistance=.008;
      const normal=ao._renderOverride.bind(ao),fullscreen=ao._renderPass.bind(ao);
      ao._renderOverride=(...args)=>profiler.measure('법선 장면 재렌더',()=>normal(...args));
      ao._renderPass=(...args)=>profiler.measure('AO 후처리 합계',()=>fullscreen(...args));
      composer.addPass(ao);
      bloom=new UnrealBloomPass(new THREE.Vector2(width,height),BLOOM.strength.day,BLOOM.radius,BLOOM.threshold);capBloomInput(bloom);composer.addPass(bloom);
      grade=new ShaderPass(GRADE_SHADER);composer.addPass(grade);
      composer.addPass(new OutputPass());
    }
    if(composer){ao.enabled=enableAO;bloom.enabled=enableMood;grade.enabled=enableMood;bloomScale=quality===2?BLOOM.scale.high:BLOOM.scale.balanced;}
    status.mood=enableMood;
    status.ao=enableAO&&diagnosticMode!=='normal';status.normalPass=enableAO;status.shadows=true;
    renderer.shadowMap.enabled=status.shadows;sun.castShadow=status.shadows;
    const distance=adaptive.shadowDistance??[30,45,60][quality];
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
      bloom.setSize(Math.max(2,Math.floor(width*dpr*bloomScale)),Math.max(2,Math.floor(height*dpr*bloomScale)));
      status.aoResolution={width:ao.width,height:ao.height,scale:.5,kernelSamples:12};
    }
    // 품질에 따라 물리적인 원경 대비를 바꾸지 않는다. 가까운 지형만 LOD로 줄인다.
  }
  renderer.info.autoReset=false;
  const breakdown=installRenderBreakdown(renderer);
  // 나무·원경 도시 등 31,000여 개 MeshBasicMaterial은 조명을 받지 않고 낮 빛이 구워져 있다.
  // 밤·흐림·비에는 색 배율로 어둡게 해 지형(조명 받는 재질)과 밝기를 맞춘다. 재질은 몇 초마다 다시 모으고, 값이 바뀔 때만 갱신한다.
  const basic={set:new Set(),scanAt:-1e9,factor:[1,1,1],applied:[1,1,1]};
  function scanBasic(){
    basic.set.clear();let nodes=0;
    scene.traverse(o=>{nodes++;if(o===sky||o.parent===precipitation.group)return;const m=o.material;if(!m)return;for(const t of Array.isArray(m)?m:[m])if(t.isMeshBasicMaterial){if(!t.userData.baseColor)t.userData.baseColor=t.color.clone();basic.set.add(t);}});
    status.basicMaterials=basic.set.size;status.sceneNodesScanned=nodes;
  }
  function basicFactor(e){
    const level=Math.max(.065+(NIGHT.basicLevelFloor-.065)*e.night,Math.min(1,.35*e.light.intensity+.65*e.ambient)),warm=Math.min(1,e.light.intensity)*(1-e.night);
    const peak=Math.max(...e.light.color),night=NIGHT.basicTint;
    return [0,1,2].map(i=>{const sun=1+(e.light.color[i]/peak-1)*warm;return level*(sun+(night[i]-sun)*e.night);});
  }
  function applyBasic(e){
    if(clock.elapsed-basic.scanAt>3){basic.scanAt=clock.elapsed;scanBasic();basic.applied=null;}
    const f=basicFactor(e);basic.factor=f;
    if(basic.applied&&f.every((v,i)=>Math.abs(v-basic.applied[i])<.004))return;
    basic.applied=f;for(const m of basic.set)m.color.copy(m.userData.baseColor).multiply(tmpColor.setRGB(f[0],f[1],f[2],THREE.LinearSRGBColorSpace));
  }
  const direction=(elevation,azimuth,target)=>target.fromArray(sunDirection(elevation,azimuth));
  // 시각·날씨 → 방향광·하늘·연무·노출·입자·소리. 낮 맑음 기준값에 배율·색만 곱하므로 맑은 낮은 예전과 같다.
  function applyEnvironment(){
    const now=performance.now(),dt=(now-clock.last)/1000;clock.last=now;clock.elapsed+=Math.min(dt,.5);
    const e=environment.update(dt),ground=Math.max(0,Math.min(1,e.light.elevation/6));
    direction(e.light.elevation,e.light.azimuth,solarOffset).multiplyScalar(80);
    sun.color.setRGB(...e.light.color,THREE.SRGBColorSpace);sun.intensity=4*e.light.intensity;
    // 구워 둔 환경광(IBL)은 맑은 낮의 푸른 하늘색이라 색을 바꿀 수 없다. 흐림·비·안개에서는 그 몫을 줄이고 중성 반구광이 대신 채운다.
    scene.environmentIntensity=base.environmentIntensity*e.ambient*(1-ENV_GRAY_CUT*e.neutral);groundFill.intensity=base.hemisphereIntensity*e.ambient*(1+HEMI_GRAY_BOOST*e.neutral);groundFill.color.setRGB(...e.hemiColor,THREE.SRGBColorSpace);
    const mood=toonMode?{exposure:toon.exposureFor?.(e)??1}:moodBlend(e.elevation,e.night,e.gray);
    renderer.toneMappingExposure=base.exposure*e.exposureMul*mood.exposure;
    if(grade){const u=grade.uniforms;u.saturation.value=mood.saturation;u.shadowTint.value.fromArray(mood.shadowTint);u.shadowAmount.value=mood.shadowAmount;u.warm.value.fromArray(mood.warm);u.exposure.value=renderer.toneMappingExposure;bloom.strength=mood.bloom;}
    scene.fog.color.setRGB(...e.fogColor,THREE.SRGBColorSpace);scene.background.setRGB(...e.horizon,THREE.SRGBColorSpace);
    // 카툰 밤: 노출은 1 근처로 두고(블룸 문턱이 하늘·도심 빛무리를 번지게 하지 않게) 빛·연무만 어둡게 해 숲·산을 실루엣으로.
    if(toonMode&&toon.lightScale){const k=toon.lightScale(e);sun.intensity*=k;groundFill.intensity*=k;scene.environmentIntensity*=k;scene.fog.color.multiplyScalar(k);}
    // 맑은 날(15km) 기준 대비 얼마나 더 뿌연가. fog.near 칸에 감쇠 계수(1/m)를 실어 셰이더가 읽는다.
    scene.fog.near=Number.isFinite(e.fogDistance)?Math.max(0,3/e.fogDistance-3/15000):0;
    direction(e.elevation,e.azimuth,sunVector);direction(e.moon.elevation,e.moon.azimuth,moonVector);
    // 카툰: 하늘·색보정·블룸은 툰 모듈이 시간대에 맞춰 바꾼다. 도시·나무의 밤 밝기도 툰 재질이 직접 맡는다(MeshBasic 일괄 감광 없음).
    if(toonMode){toon.updateSky(e,sunVector,moonVector);status.toonPhase=toon.pipeline.update(e)?.phase??null;}else{updateSky(sky,e,sunVector,moonVector);applyBasic(e);}
    {const fx=updateLightFx({time:clock.elapsed,sunVector,environment:e,quality:Math.max(0,current),mobile});shafts.update({camera,sunColor:e.light.color,quality:Math.max(0,current),canopy:canopyAt(camera.position.y),lowSun:fx.direct?Math.max(0,Math.min(1,(38-e.elevation)/32)):0});status.lightFx={direct:fx.direct,shafts:shafts.mesh.visible,count:shafts.mesh.geometry.instanceCount};}
    precipitation.update({time:clock.elapsed,camera,rain:e.rain,snow:e.snow,wind:e.windSpeed,viewHeight:renderer.domElement.height||900,fov:camera.fov});
    setWeatherSound({wind:e.windSound,rain:e.rain});
    status.environment={basicFactor:basic.factor,time:environment.info.timeLabel,legacySun:environment.info.legacySun,manualTime:environment.info.manualTime,weather:environment.info.kind,level:environment.info.level,source:environment.info.source,error:environment.weather.state.error,calls:environment.weather.state.calls,rain:e.rain,snow:e.snow,fogDistance:e.fogDistance,fogDensity:scene.fog.near,night:e.night,lightIntensity:e.light.intensity,ambient:e.ambient,exposure:renderer.toneMappingExposure,windSound:e.windSound,windSpeed:e.windSpeed,cloud:e.cloud,stars:e.stars,moon:e.moon,light:{elevation:e.light.elevation,azimuth:e.light.azimuth}};
  }
  // 쌍안경 중에는 그림자 상자를 보는 쪽 앞으로 옮긴다(뒤쪽 절반이 화면 밖이라 낭비됨). null이면 카메라 중심.
  let shadowFocus=null;const setShadowFocus=v=>{shadowFocus=v||null;status.shadowFocus=!!shadowFocus;};
  function render(position){
    applyEnvironment();
    renderer.info.reset();
    breakdown.reset();
    // 카메라 주변 30~60m 폭. 갱신 간격은 화질 비교 전까지 매 프레임 유지한다.
    if(!toonMode)sky.material.uniforms.skyGain.value=1/Math.max(.05,renderer.toneMappingExposure);const focus=shadowFocus??camera.position;sun.target.position.copy(focus);sun.position.copy(focus).add(solarOffset);sky.position.copy(camera.position);
    const solarDirection=new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize();
    status.sunElevation=THREE.MathUtils.radToDeg(Math.asin(solarDirection.y));status.sunAzimuth=(THREE.MathUtils.radToDeg(Math.atan2(solarDirection.x,-solarDirection.z))+360)%360;
    profiler.poll();
    if(toonMode){const now=performance.now();profiler.measure('기본 장면',()=>toon.pipeline.render(Math.min(.1,(now-(clock.renderAt??now))/1000)));clock.renderAt=now;}
    else if(ao&&diagnosticMode==='normal'){
      profiler.measure('기본 장면',()=>renderer.render(scene,camera));
      const target=renderer.getRenderTarget();
      try{ao._overrideVisibility();ao._renderOverride(renderer,ao.normalMaterial,ao.normalRenderTarget,0x7777ff,1);}
      finally{ao._restoreVisibility();renderer.setRenderTarget(target);}
    }else if(composer&&(status.ao||status.mood))composer.render();else profiler.measure('기본 장면',()=>renderer.render(scene,camera));
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
        compile:compileScene,
        render:()=>render(camera.position),
        restore:()=>resize(...selected)
      });
      render(camera.position);
      status.compileCount=(status.compileCount??0)+1;
    }catch(error){status.compileError=error.message;throw error;}
    finally{status.compiling=false;}
  }
  // 셰이더 미리 준비. 카툰은 RenderPass가 합성기 버퍼(렌더 타깃)에 그려 출력 색공간·톤매핑이 화면과 다른 셰이더 변형을 쓴다.
  // 그 타깃을 걸어 둔 채 compileAsync를 불러야 실제로 쓸 변형이 컴파일된다(compile 순회는 호출 안에서 동기로 끝난다). 2026-11-06.
  function compileScene(){
    const target=toonMode?toon.pipeline.composer?.readBuffer??null:null,previous=renderer.getRenderTarget();
    if(target)renderer.setRenderTarget(target);
    try{return renderer.compileAsync(scene,camera);}finally{if(target)renderer.setRenderTarget(previous);}
  }
  return {resize,render,prepare,compile:compileScene,status,environmentReady:Promise.all([environmentReady,ssaoReady]).then(()=>{}),setShadowFocus,style:toonMode?'toon':'realistic'};
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
