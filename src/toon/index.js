import * as THREE from 'three';
import {createGradientMap} from './gradient.js';
import {createToonMaterials,TOON_UNIFORMS} from './materials.js';
import {createToonSky} from './sky.js';
import {createCityStyle} from './city.js';
import {createToonPipeline} from './pipeline.js';
import {TOON,phaseWeights,foliageWave} from './palette.js';
export {TOON} from './palette.js';
// 카툰 모드 진입점(기획서 §2.6). main.js가 style==='toon'일 때만 동적 import 한다. 어떤 fetch도 하지 않는다.
//  materialFactory → loadLandscape({materialFactory})가 PBR 대신 쓴다.
//  toonify(root,{kind}) → GLB·시설 메시 재질을 MeshToonMaterial로(같은 원본은 캐시, userData.shared=true).
//  createSky()/updateSky(env,sun,moon) · styleCity({material,nightLights}) · patchFoliage(material)
//  pipeline.resize(quality,w,h,dpr) / update(env) / render()
export async function createToonStyle({renderer,scene,camera,mobile=false}={}){
 const gradientMap=createGradientMap();
 const materials=createToonMaterials({gradientMap});
 const city=createCityStyle();
 const pipeline=renderer?createToonPipeline({renderer,scene,camera,mobile}):null;
 let sky=null,lastTime=globalThis.performance?.now?.()??0;
 const status={style:'toon',gradient:[...TOON.gradient],materials:materials.status,city:city.status,pipeline:pipeline?.status??null,sky:{created:false},phase:null};

 function createSky(){
  if(sky)return sky.mesh;
  sky=createToonSky({radius:Math.min(20000,(camera?.far??30000)*.66)});scene?.add(sky.mesh);status.sky.created=true;
  return sky.mesh;
 }
 function updateSky(env,sunVector,moonVector){
  if(!sky)createSky();
  const now=globalThis.performance?.now?.()??0,dt=Math.min(.5,Math.max(0,(now-lastTime)/1000));lastTime=now;
  const p=sky.update(env,sunVector,moonVector,dt);status.sky.stars=p.stars;
  if(scene?.background?.isColor)scene.background.setRGB(...p.horizon,THREE.SRGBColorSpace);
  return p;
 }
 const update=env=>{
  // 바람: 풀밭 색 물결 속도·세기. 바람 방향은 해 방위와 무관하게 서풍 기본(환경에 풍향이 없다).
  const wave=foliageWave(env);TOON_UNIFORMS.toonWaveSpeed.value=wave.speed;TOON_UNIFORMS.toonWaveStrength.value=wave.strength;
  city.update(env);status.phase=phaseWeights(env);
  return pipeline?.update(env)??status;
 };
 return {
  materialFactory:materials.materialFactory,
  toonify:materials.toonify,
  patchFoliage:materials.patchFoliage,
  createSky,updateSky,
  styleCity:city.styleCity,
  pipeline:pipeline&&{resize:pipeline.resize,update,render:pipeline.render,dispose:pipeline.dispose,composer:pipeline.composer,passes:pipeline.passes,status:pipeline.status},
  status,
  dispose(){pipeline?.dispose();sky?.dispose();gradientMap.dispose();},
 };
}
