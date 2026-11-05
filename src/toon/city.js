import * as THREE from 'three';
import {TOON,hexToRgb} from './palette.js';
// 서울 원경: 먼지 낀 파스텔 매트 페인팅(MeshBasic, 조명 없음) + 강한 거리 안개.
// 낮에는 원경 안개색(dayHaze) 쪽으로 눌러 흰·하늘색 잡음 띠가 뜨지 않게 한다.
// 밤에는 월드 좌표 창문 격자로 크림 위주(creamShare) 불빛(가까운 건물), 건물마다 35~60%가 켜진다. 먼 도심은 벽에 뿌린 작은 불빛 점(buildCityDots)이 촘촘히 덮는다.
// city-grid.js 건물 정점 속성(color, seoulInfo=[seed, base, height])을 그대로 읽는다. 없으면 월드 위치 해시로 대신한다.
const linear=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
// 불빛 평균색(크림 creamShare + 주황 나머지): 먼 창 평균·도로 가로등이 같은 톤을 쓴다.
const LIGHT_MIX=linear(TOON.city.window).lerp(linear(TOON.city.creamInput),TOON.city.creamShare);
export const CITY_UNIFORMS={
 cityNight:{value:0},cityHaze:{value:new THREE.Color(.8,.85,.9)},
 cityPastelA:{value:linear(TOON.city.pastel[0])},cityPastelB:{value:linear(TOON.city.pastel[1])},
 cityNightTint:{value:linear(TOON.city.night)},cityWindow:{value:linear(TOON.city.window).multiplyScalar(TOON.city.orangeGain)},
 cityWindowIntensity:{value:TOON.city.windowIntensity},cityFogScale:{value:TOON.city.fogScale},
 cityCream:{value:linear(TOON.city.creamInput)},cityDayHaze:{value:linear(TOON.city.dayHaze)},
 cityLitMin:{value:TOON.city.litMin},cityLitMax:{value:TOON.city.litMax},
 cityDotA:{value:linear(TOON.city.dot[0]).multiplyScalar(TOON.city.orangeGain)},cityDotB:{value:linear(TOON.city.creamInput)},cityDotGain:{value:TOON.city.dotGain},cityDotPx:{value:TOON.city.dotPx},
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
uniform vec3 cityHaze,cityDayHaze,cityPastelA,cityPastelB,cityNightTint,cityWindow,cityCream;
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
  float lit=mix(on*pane,share*.05,far);
  // 창마다 크림(${TOON.city.creamShare.toFixed(2)}) 또는 주황. 먼 곳은 두 색의 평균.
  vec3 tone=mix(cityWindow,cityCream,step(tcHash(id+7.7+seed),${TOON.city.creamShare.toFixed(3)}));
  tone=mix(tone,mix(cityWindow,cityCream,${TOON.city.creamShare.toFixed(3)}),far);
  glow=tone*lit*cityWindowIntensity*mix(.75,1.15,tcHash(id+3.3));
 }
 // 강한 거리 안개: 멀수록 연무색으로 녹는다(창 불빛은 덜 녹여 밤에도 보이게).
 float fog=1.-exp(-vTcDist/cityFogScale);
 col=mix(col,cityHaze,clamp(fog*1.05,0.,.93));
 // 낮: 원경 안개(#7291aa 계열) 쪽으로 누른다. 하늘 지평선색(cityHaze)은 거의 흰색이라 먼 건물이 흰 잡음 띠로 떠서다.
 // 건물마다 명도 차(±dayVar)만 남겨 지붕·벽 잔무늬를 지운다. 먼 쪽일수록 더 녹인다.
 float dayK=(1.-cityNight)*clamp(${TOON.city.dayHazeAmount.toFixed(3)}+fog*.3,0.,.97);
 col=mix(col,cityDayHaze*(1.+${TOON.city.dayVar.toFixed(3)}*(fract(seed*7.13)*2.-1.)),dayK);
 diffuseColor.rgb=col+glow*(1.-fog*.55);
}`;

// 밤 도심 불빛 점(「너의 이름은」 도시 야경처럼 촘촘한 작은 불빛, 크림 creamShare·주황 나머지). 건물 벽 삼각형 넓이에 비례해 점을 뿌린다.
// 점 크기는 화면 픽셀로 고정(멀어도 1~2px 점으로 남아 빛 덩어리로 번지지 않는다). 켜짐 비율은 밤 가중치를 따른다.
const DOT_VERT=`
uniform float cityNight,cityDotPx;attribute float aDot;varying float vOn;varying float vTone;
void main(){
 vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
 // 해질녘엔 일부만 켜지고 밤이 깊을수록 다 켜진다.
 vOn=step(aDot,cityNight*1.05-.05);vTone=fract(aDot*53.7);
 float d=-mv.z;
 gl_PointSize=vOn*cityDotPx*mix(1.6,1.15,smoothstep(2000.,14000.,d))*(.8+.5*fract(aDot*17.3));
}`;
const DOT_FRAG=`
uniform vec3 cityDotA,cityDotB;uniform float cityDotGain;varying float vOn;varying float vTone;
void main(){if(vOn<.5)discard;float r=length(gl_PointCoord-.5);if(r>.5)discard;
 gl_FragColor=vec4(mix(cityDotA,cityDotB,step(${(1-TOON.city.creamShare).toFixed(3)},vTone))*cityDotGain*(1.-.35*smoothstep(.2,.5,r)),1.);}`;
export function buildCityDots(geometry,{density=TOON.city.dotDensity,max=TOON.city.dotMax}={}){
 const P=geometry?.attributes?.position;if(!P)return null;
 const idx=geometry.index,tri=idx?idx.count/3:P.count/3,pos=[],seed=[];
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3();
 let acc=0,k=0;
 for(let t=0;t<tri&&pos.length/3<max;t++){
  const i0=idx?idx.getX(t*3):t*3,i1=idx?idx.getX(t*3+1):t*3+1,i2=idx?idx.getX(t*3+2):t*3+2;
  a.fromBufferAttribute(P,i0);b.fromBufferAttribute(P,i1);c.fromBufferAttribute(P,i2);
  e1.subVectors(b,a);e2.subVectors(c,a);n.crossVectors(e1,e2);const area=n.length()/2;if(area<1e-3)continue;
  // 벽(수직 면)에만. 지붕·바닥은 건너뛴다.
  if(Math.abs(n.y)/(area*2)>.5)continue;
  acc+=area*density;
  while(acc>=1&&pos.length/3<max){acc-=1;k++;
   const h=q=>{const v=Math.sin(k*12.9898+q*78.233+t*.37)*43758.5453;return v-Math.floor(v);};
   let u=h(1),v=h(2);if(u+v>1){u=1-u;v=1-v;}
   pos.push(a.x+e1.x*u+e2.x*v,a.y+e1.y*u+e2.y*v,a.z+e1.z*u+e2.z*v);seed.push(h(3));
  }
 }
 if(!pos.length)return null;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aDot',new THREE.Float32BufferAttribute(seed,1));g.computeBoundingSphere();
 return g;
}

export function createCityStyle(){
 const status={materials:0,swapped:0,nightLights:0,dots:0};
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
 let dotMaterial=null;
 function addLightDots(mesh){
  if(mesh.userData.toonCityDots||status.dots>=TOON.city.dotTotal)return;
  const g=buildCityDots(mesh.geometry,{max:Math.min(TOON.city.dotMax,TOON.city.dotTotal-status.dots)});mesh.userData.toonCityDots=true;if(!g)return;
  dotMaterial??=new THREE.ShaderMaterial({name:'toon-city-dots',uniforms:CITY_UNIFORMS,vertexShader:DOT_VERT,fragmentShader:DOT_FRAG,fog:false});
  dotMaterial.userData.shared=true;
  const pts=new THREE.Points(g,dotMaterial);pts.name='도심 불빛 점';pts.userData.toonCityDots=true;mesh.add(pts);status.dots+=g.attributes.position.count;
 }
 const lightMaterials=new WeakMap();
 // 가로등·도로 불빛 점/선: 창 불빛과 같은 크림 위주 HDR 색(LIGHT_MIX)으로 바꿔 블룸을 받게 한다.
 function styleNightLight(object){
  object.traverse(o=>{
   const m=o.material;if(!m||Array.isArray(m))return;
   if(!lightMaterials.has(m)){const c=m.clone();c.color?.copy(LIGHT_MIX).multiplyScalar(TOON.city.lampGain);c.toneMapped=true;c.userData={...m.userData,shared:true,toonNightLight:true};
    // 서울 거리 불빛(city-water.js seoulRoadLights: 정점색·더하기 혼합 점). 그대로면 흰 점이 겹쳐 지평선에 흰 띠가 된다.
    // 카툰에서는 창 불빛과 같은 크림 위주 톤으로 물들이고, 점을 작게·어둡게 한다. clone()이 uniform을 복사하므로 원래 uniform 객체(cityNight 등)를 다시 잇는다.
    if(m.isShaderMaterial&&/lampSize/.test(m.vertexShader)){
     c.uniforms={...m.uniforms,cityLampTint:{value:LIGHT_MIX},cityLampGain:{value:TOON.city.roadLightGain}};
     c.vertexShader=m.vertexShader.replace('clamp(lampSize*(1.6+zoom*.28)*pixelRatio,1.0,7.0)','clamp(lampSize*(1.6+zoom*.28)*pixelRatio*.6,1.0,4.0)');
     c.fragmentShader=m.fragmentShader.replace('varying vec3 vColor;','uniform vec3 cityLampTint;uniform float cityLampGain;varying vec3 vColor;').replace('vColor*vAlpha*a*1.15','mix(vColor,cityLampTint,.75)*vAlpha*a*cityLampGain');
    }
    lightMaterials.set(m,c);}
   o.material=lightMaterials.get(m);status.nightLights++;
  });
 }
 // material: 기존 도시 재질(참고만, 면 방향을 따른다). nightLights: 가로등 Object3D 배열.
 // 반환: {material, apply(root), update(env)}. apply(root)는 지금과 앞으로 추가될(childadded) 도시 칸의 재질을 바꾼다.
 function styleCity({material,nightLights=[]}={}){
  const m=cityMaterial({side:material?.side??THREE.DoubleSide});
  for(const lights of nightLights)styleNightLight(lights);
  const swap=o=>o.traverse(x=>{if(x.isMesh&&!x.isSprite&&x.material!==m&&!x.userData.seoulLabel){x.material=m;status.swapped++;addLightDots(x);}});
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
