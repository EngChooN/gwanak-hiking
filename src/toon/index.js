import * as THREE from 'three';
import {createGradientMap} from './gradient.js';
import {createToonMaterials,TOON_UNIFORMS,TOON_WATER_SKY} from './materials.js';
import {createToonSky} from './sky.js';
import {createCityStyle} from './city.js';
import {createToonPipeline} from './pipeline.js';
import {createToonNature} from './nature.js';
import {createGrassField} from './grass-field.js';
import {createToonWater} from './water.js';
import {TOON,phaseWeights,foliageWave,hexToRgb,exposureFor,lightScaleFor} from './palette.js';
export {TOON} from './palette.js';
// 카툰 모드 진입점(기획서 §2.6). main.js가 style==='toon'일 때만 동적 import 한다. 어떤 fetch도 하지 않는다.
//  materialFactory → loadLandscape({materialFactory})가 PBR 대신 쓴다.
//  toonify(root,{kind}) → GLB·시설 메시 재질을 MeshToonMaterial로(같은 원본은 캐시, userData.shared=true).
//  createSky()/updateSky(env,sun,moon) · styleCity({material,nightLights}) · patchFoliage(material)
//  pipeline.resize(quality,w,h,dpr) / update(env) / render()
export async function createToonStyle({renderer,scene,camera,mobile=false}={}){
 const gradientMap=createGradientMap();
 const materials=createToonMaterials({gradientMap});
 // 카툰 전용 나무·풀·바위(3단계). natureParts는 load-landscape natureModel이, 하층 식생 교체는 toonify가 쓴다.
 const nature=createToonNature({gradientMap,uniforms:TOON_UNIFORMS});
 // 카툰 계곡 물(4단계): 실사 물 셰이더 재질을 카툰 물·낙수·물보라·암반으로 바꿔 끼운 뒤 나머지를 toonify한다.
 const water=createToonWater({materials:materials.materialFactory});
 const toonify=(root,options)=>{root?.traverse?.(o=>{nature.swapGroundCover(o);water.swap(o);});return materials.toonify(root,options);};
 const city=createCityStyle();
 const pipeline=renderer?createToonPipeline({renderer,scene,camera,mobile}):null;
 const hazeColor=new THREE.Color(),waveBase={a:TOON_UNIFORMS.toonWaveA.value.clone(),b:TOON_UNIFORMS.toonWaveB.value.clone()};
 let grassField=null,shafts=null;
 // 지형이 준비되면 카메라 둘레 풀밭을 깐다(main.js가 loadLandscape 뒤에 부른다).
 function attachLandscape(landscape){
  if(grassField||!landscape?.floorHeight||!scene)return grassField;
  // 나무 밑 접지 그늘(contact-occlusion.js, 실사와 공용)을 카툰 땅에서는 약하게: 「야생의 숨결」 숲 바닥은 밝은 풀밭이다.
  // load-landscape가 apply()로 덧붙인 셰이더 조각을 이어받아 곱하는 세기만 줄인다(첫 컴파일 전이라 다시 컴파일하지 않는다).
  {const m=materials.materialFactory.terrain(),prev=m.onBeforeCompile,key=m.customProgramCacheKey.bind(m),k=TOON.terrainContactAO;
   m.onBeforeCompile=function(shader,renderer){prev.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('reflectedLight.directDiffuse*=contactAO;',`reflectedLight.directDiffuse*=mix(1.,contactAO,${k.direct.toFixed(2)});`)
     .replace('reflectedLight.indirectDiffuse*=contactAO;',`reflectedLight.indirectDiffuse*=mix(1.,contactAO,${k.indirect.toFixed(2)});`);};
   m.customProgramCacheKey=()=>`${key()}|toon-contact-soft`;}
  grassField=createGrassField({landscape,geometry:nature.geometries.grass.field,farGeometry:nature.geometries.grass.fieldFar,material:nature.materials.grassField,scene});status.grassField=grassField.status;
  return grassField;
 }
 let sky=null,lastTime=globalThis.performance?.now?.()??0,lastWater=lastTime;const sun=new THREE.Vector3(0,1,0);
 const status={style:'toon',gradient:[...TOON.gradient],materials:materials.status,nature:nature.status,water:water.status,city:city.status,pipeline:pipeline?.status??null,sky:{created:false},phase:null};

 function createSky(){
  if(sky)return sky.mesh;
  sky=createToonSky({radius:Math.min(20000,(camera?.far??30000)*.66)});scene?.add(sky.mesh);status.sky.created=true;
  return sky.mesh;
 }
 function updateSky(env,sunVector,moonVector){
  if(!sky)createSky();
  const now=globalThis.performance?.now?.()??0,dt=Math.min(.5,Math.max(0,(now-lastTime)/1000));lastTime=now;
  if(sunVector)sun.copy(sunVector);
  const p=sky.update(env,sunVector,moonVector,dt,renderer?.toneMappingExposure??1);status.sky.stars=p.stars;
  if(scene?.background?.isColor)scene.background.setRGB(...p.horizon,THREE.SRGBColorSpace);
  return p;
 }
 const update=env=>{
  // 바람: 풀밭 색 물결 속도·세기. 바람 방향은 해 방위와 무관하게 서풍 기본(환경에 풍향이 없다).
  const wave=foliageWave(env);TOON_UNIFORMS.toonWaveSpeed.value=wave.speed;TOON_UNIFORMS.toonWaveStrength.value=wave.strength;
  // 노을·밤: 물결색을 그대로 칠하는 길가 풀·솔잎은 빛을 덜 받으므로 직접 어둡게(노을 역광 실루엣 #333026 쪽, 산리서치 판정).
  {const k=w0=>w0.day+w0.sunset*TOON.foliage.sunsetDim+w0.night*TOON.foliage.nightDim,f=k(phaseWeights(env));
   TOON_UNIFORMS.toonWaveA.value.copy(waveBase.a).multiplyScalar(f);TOON_UNIFORMS.toonWaveB.value.copy(waveBase.b).multiplyScalar(f);}
  city.update(env,camera,pipeline?.status.quality??2);const w=status.phase=phaseWeights(env);
  {const now=globalThis.performance?.now?.()??0,dt=Math.min(.5,Math.max(0,(now-lastWater)/1000));lastWater=now;
   const h=renderer?.domElement?.height??800,fov=(camera?.fov??60)*Math.PI/180;water.update(env,{sunVector:sun,dt,pointScale:h/(2*Math.tan(fov/2)),exposure:renderer?.toneMappingExposure??1});}
  if(grassField&&camera)grassField.update(camera,pipeline?.status.quality??1);
  // 빛줄기는 rendering.js가 처음 한 번 만든다. 한 번만 찾아 세기를 낮춘다(없으면 false로 두고 다시 찾지 않는다).
  if(shafts===null&&scene){shafts=false;scene.traverse(o=>{if(!shafts&&o.name==='빛줄기'&&o.material?.uniforms?.fxStrength){shafts=o;o.material.uniforms.fxStrength.value*=TOON.lightShafts;}});}
  // 낮 원경: 먼 산을 푸른 안개색으로 녹인다(기준값 §2-7). rendering.js가 이번 프레임에 넣은 연무색·감쇠에 낮 가중치만큼 더한다.
  // fog.near에 감쇠 계수를 싣는 연무 셰이더(look-profile HAZE_FRAGMENT)일 때만. 매 프레임 rendering.js가 값을 새로 넣는다.
  if(scene?.fog&&w.day>0&&THREE.ShaderChunk.fog_fragment.includes('fogNear')){const t=TOON.terrain;hazeColor.setRGB(...hexToRgb(t.haze),THREE.SRGBColorSpace);scene.fog.color.lerp(hazeColor,w.day*(1-(env.gray??0)*.6));scene.fog.near+=t.hazeDensity*w.day;}
  // 노을 원경: 보라 회색 안개(§1-2 원경 안개 #65545e).
  if(scene?.fog&&w.sunset>0&&THREE.ShaderChunk.fog_fragment.includes('fogNear')){const h=TOON.sunsetHaze;hazeColor.setRGB(...hexToRgb(h.color),THREE.SRGBColorSpace);scene.fog.color.lerp(hazeColor,w.sunset*(1-(env.gray??0)*.6));scene.fog.near+=h.density*w.sunset;}
  return pipeline?.update(env)??status;
 };
 return {
  materialFactory:materials.materialFactory,
  toonify,
  natureParts:nature.natureParts,
  attachLandscape,
  nature,
  patchFoliage:materials.patchFoliage,
  createSky,updateSky,
  // rendering.js가 카툰 노출 배수로 쓴다(밤 숲·산을 실루엣으로).
  exposureFor,lightScale:lightScaleFor,
  styleCity:city.styleCity,
  // 공원 가로등 기둥: 실사 어두운 금속은 카툰 조명에서 검은 막대가 된다(final3 입구 숲). 단색 툰 재질로 바꾼다.
  styleNightLighting(root){const p=root?.getObjectByName?.('가로등 기둥');if(p)p.material=materials.materialFactory.basic(new THREE.Color(TOON.lampPole));return !!p;},
  pipeline:pipeline&&{resize:pipeline.resize,update,render:pipeline.render,dispose:pipeline.dispose,composer:pipeline.composer,passes:pipeline.passes,status:pipeline.status},
  status,
  dispose(){grassField?.dispose();pipeline?.dispose();sky?.dispose();gradientMap.dispose();},
 };
}
