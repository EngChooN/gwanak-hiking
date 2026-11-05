import * as THREE from 'three';
import {TOON,hexToRgb} from './palette.js';
// 서울 원경: 먼지 낀 파스텔 매트 페인팅(MeshBasic, 조명 없음) + 강한 거리 안개.
// 밤에는 월드 좌표 창문 격자로 노란 #ffd27a 불빛, 건물마다 35~60%가 켜진다.
// city-grid.js 건물 정점 속성(color, seoulInfo=[seed, base, height])을 그대로 읽는다. 없으면 월드 위치 해시로 대신한다.
const linear=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
export const CITY_UNIFORMS={
 cityNight:{value:0},cityHaze:{value:new THREE.Color(.8,.85,.9)},
 cityPastelA:{value:linear(TOON.city.pastel[0])},cityPastelB:{value:linear(TOON.city.pastel[1])},
 cityNightTint:{value:linear(TOON.city.night)},cityWindow:{value:linear(TOON.city.window)},
 cityWindowIntensity:{value:TOON.city.windowIntensity},cityFogScale:{value:TOON.city.fogScale},
 cityLitMin:{value:TOON.city.litMin},cityLitMax:{value:TOON.city.litMax},
};
const VERTEX_HEAD=`attribute vec3 seoulInfo;varying vec3 vTcWorld;varying vec3 vTcNormal;varying vec3 vTcInfo;varying float vTcDist;`;
const VERTEX_BODY=`
{
 vec4 tcW=modelMatrix*vec4(transformed,1.);vTcWorld=tcW.xyz;vTcNormal=normalize(mat3(modelMatrix)*normal);vTcInfo=seoulInfo;
 vTcDist=length((viewMatrix*tcW).xyz);
}`;
const FRAGMENT_HEAD=`
varying vec3 vTcWorld;varying vec3 vTcNormal;varying vec3 vTcInfo;varying float vTcDist;
uniform float cityNight,cityWindowIntensity,cityFogScale,cityLitMin,cityLitMax;
uniform vec3 cityHaze,cityPastelA,cityPastelB,cityNightTint,cityWindow;
float tcHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;
const FRAGMENT_BODY=`
{
 float seed=vTcInfo.x>0.?vTcInfo.x:tcHash(floor(vTcWorld.xz/40.));
 float baseY=vTcInfo.x>0.?vTcInfo.y:0.;
 // 파스텔: 정점색의 밝기만 살리고 색은 먼지 낀 라벤더↔베이지 사이로.
 float lum=dot(diffuseColor.rgb,vec3(.299,.587,.114));
 vec3 pastel=mix(cityPastelA,cityPastelB,fract(seed*7.13))*mix(.88,1.06,clamp(lum*1.6,0.,1.));
 float roof=step(.5,vTcNormal.y);
 // 매트 페인팅식 면 구분: 해 쪽 벽은 밝게, 반대는 살짝 푸르게.
 pastel*=mix(.9,1.04,clamp(vTcNormal.x*.5+.5,0.,1.))*mix(1.,1.06,roof);
 vec3 col=mix(pastel,cityNightTint*mix(.8,1.1,fract(seed*3.7)),cityNight*.92);
 vec3 glow=vec3(0.);
 if(cityNight>.001&&roof<.5){
  vec2 T=normalize(vec2(-vTcNormal.z,vTcNormal.x)+1e-5);
  vec2 cell=vec2(dot(vTcWorld.xz,T)/${TOON.city.column.toFixed(2)},(vTcWorld.y-baseY)/${TOON.city.floor.toFixed(2)});
  vec2 id=floor(cell),f=fract(cell),pix=fwidth(cell);
  float far=smoothstep(.35,1.,max(pix.x,pix.y));
  float pane=step(.3,f.x)*step(f.x,.7)*step(.32,f.y)*step(f.y,.74);
  float share=mix(cityLitMin,cityLitMax,fract(sin(seed*91.7+3.1)*43758.5453))*cityNight;
  float on=step(tcHash(id+seed*97.),share)*step(.5,id.y);
  // 칸이 픽셀보다 작아지면 켜진 비율 평균으로 바꿔 반짝임(모아레)을 막는다.
  // 평균값은 블룸 문턱(.55) 아래로 둬서 먼 도시가 빛의 벽으로 번지지 않게 한다. 가까운 창 한 칸만 블룸을 받는다.
  float lit=mix(on*pane,share*.16,far);
  glow=cityWindow*lit*cityWindowIntensity*mix(.75,1.15,tcHash(id+3.3));
 }
 // 강한 거리 안개: 멀수록 연무색으로 녹는다(창 불빛은 덜 녹여 밤에도 보이게).
 float fog=1.-exp(-vTcDist/cityFogScale);
 col=mix(col,cityHaze,clamp(fog*1.05,0.,.93));
 diffuseColor.rgb=col+glow*(1.-fog*.55);
}`;

export function createCityStyle(){
 const status={materials:0,swapped:0,nightLights:0};
 const materials=new Set();
 function cityMaterial({side=THREE.DoubleSide}={}){
  const m=new THREE.MeshBasicMaterial({name:'toon-city',color:0xffffff,vertexColors:true,side,fog:false});
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,CITY_UNIFORMS);
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${VERTEX_HEAD}`).replace('#include <project_vertex>',`#include <project_vertex>\n${VERTEX_BODY}`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${FRAGMENT_HEAD}`).replace('#include <color_fragment>',`#include <color_fragment>\n${FRAGMENT_BODY}`);
  };
  m.customProgramCacheKey=()=> 'toon-city-v1';m.userData.shared=true;m.userData.toonCity=true;
  materials.add(m);status.materials++;return m;
 }
 const lightMaterials=new WeakMap();
 // 가로등·도로 불빛 점/선: 따뜻한 노란빛 HDR 색으로 바꿔 블룸을 받게 한다.
 function styleNightLight(object){
  object.traverse(o=>{
   const m=o.material;if(!m||Array.isArray(m))return;
   if(!lightMaterials.has(m)){const c=m.clone();c.color?.copy(CITY_UNIFORMS.cityWindow.value).multiplyScalar(1.6);c.toneMapped=true;c.userData={...m.userData,shared:true,toonNightLight:true};lightMaterials.set(m,c);}
   o.material=lightMaterials.get(m);status.nightLights++;
  });
 }
 // material: 기존 도시 재질(참고만, 면 방향을 따른다). nightLights: 가로등 Object3D 배열.
 // 반환: {material, apply(root), update(env)}. apply(root)는 지금과 앞으로 추가될(childadded) 도시 칸의 재질을 바꾼다.
 function styleCity({material,nightLights=[]}={}){
  const m=cityMaterial({side:material?.side??THREE.DoubleSide});
  for(const lights of nightLights)styleNightLight(lights);
  const swap=o=>o.traverse(x=>{if(x.isMesh&&!x.isSprite&&x.material!==m&&!x.userData.seoulLabel){x.material=m;status.swapped++;}});
  const roots=[];
  function apply(root){
   swap(root);const listener=e=>swap(e.child);root.addEventListener('childadded',listener);roots.push([root,listener]);return root;
  }
  return {material:m,apply,update,styleNightLight,dispose(){for(const [r,l]of roots)r.removeEventListener('childadded',l);m.dispose();materials.delete(m);}};
 }
 function update(env={}){
  const night=Math.max(env.night??0,env.city??0);
  CITY_UNIFORMS.cityNight.value=night;
  // 연무색: 환경 fogColor(sRGB 배열, rendering.js와 같은 해석)를 쓰되 낮에는 파스텔 쪽으로 밝힌다.
  const fog=env.fogColor??env.haze;if(fog)CITY_UNIFORMS.cityHaze.value.setRGB(fog[0],fog[1],fog[2],THREE.SRGBColorSpace).lerp(new THREE.Color(.82,.8,.86),.25*(1-night));
 }
 return {styleCity,update,status};
}
