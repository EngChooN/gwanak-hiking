import * as THREE from 'three';
import {sunPosition,resolveUtcMs,effectiveTime} from './daytime.js';

// 서울 원경 건물 외관 공용 셰이더(산풍경). 정점 속성:
//  color(외벽 기본색) · seoulType(0 아파트 1 업무 2 저층 3 공장 4 옥상 설비 5 항공장애등 6 63빌딩 금빛 유리 7 롯데 은빛 유리 8 탑 콘크리트 9 전망대 유리)
//  seoulInfo(x 건물 고유값 0~1, y 밑동 높이, z 건물 높이)
// 창 줄무늬·층 띠·저층 상가·옥상 난간·유리 반사·밤 창 불빛·거리 대기색을 한 번에 그린다.
// 창 한 칸이 화면 픽셀보다 작아지면(fwidth) 칸 평균색으로 수렴해 원경이 지글거리지 않는다.
export const CITY_TYPES=Object.freeze({apartment:0,office:1,house:2,industrial:3,equipment:4,beacon:5,goldGlass:6,silverGlass:7,concrete:8,deckGlass:9});

// 모든 도시 재질이 같은 uniform 객체를 공유한다. update 한 번으로 전체가 바뀐다.
export const CITY_LIGHT={
 cityNight:{value:0},      // 0 낮 ~ 1 밤(창 불빛 양)
 cityDusk:{value:0},       // 해질녘·새벽 노을 정도(유리 반사 색)
 cityTime:{value:0},       // 초(물결·항공등 깜빡임)
 cityDetail:{value:1},     // 1 쌍안경·높음(반사·물결 세부) 0 휴대폰·낮음
 citySun:{value:new THREE.Vector3(0,1,0)},
};
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
// 해 고도(도) → 창 불빛 양. 해가 지기 직전부터 켜지기 시작해 고도 -8°에서 다 켜진다.
export const windowLightAmount=elevation=>smooth(3,-8,elevation);
export const duskAmount=elevation=>smooth(-9,-1,elevation)*smooth(14,2,elevation);

let lastClock=-1,lastSearch=null,cached={elevation:45,azimuth:180};
// 환경 보관소(environment.js)와 같은 규칙(?time= 또는 지금 시각)으로 해 위치를 구한다. 0.5초마다만 다시 계산한다.
export function updateCityLight({camera,quality=2,now=performance.now(),search=globalThis.location?.search??''}={}){
 if(now-lastClock>500||search!==lastSearch){
  lastClock=now;lastSearch=search;
  const time=effectiveTime(new URLSearchParams(search).get('time'));
  try{const {utcMs}=resolveUtcMs({time,nowMs:Date.now()});cached=sunPosition(utcMs);}catch{}
 }
 const e=cached.elevation,az=cached.azimuth*Math.PI/180,alt=e*Math.PI/180;
 CITY_LIGHT.cityNight.value=windowLightAmount(e);CITY_LIGHT.cityDusk.value=duskAmount(e);
 CITY_LIGHT.citySun.value.set(Math.sin(az)*Math.cos(alt),Math.sin(alt),-Math.cos(az)*Math.cos(alt));
 CITY_LIGHT.cityTime.value=now/1000;
 const zoomed=(camera?.zoom??1)>1.01;
 CITY_LIGHT.cityDetail.value=zoomed||quality>=2?1:0;
 return {elevation:e,night:CITY_LIGHT.cityNight.value,dusk:CITY_LIGHT.cityDusk.value,detail:CITY_LIGHT.cityDetail.value};
}

const VERTEX_HEAD=`
attribute float seoulType;
attribute vec3 seoulInfo;
varying vec3 seoulWorld;
varying vec3 seoulN;
varying float seoulUse;
varying vec3 seoulData;
`;
const VERTEX_BODY=`
seoulWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
seoulN=normalize(mat3(modelMatrix)*normal);
seoulUse=seoulType;seoulData=seoulInfo;
`;
const FRAGMENT_HEAD=`
varying vec3 seoulWorld;
varying vec3 seoulN;
varying float seoulUse;
varying vec3 seoulData;
uniform float cityNight;
uniform float cityDusk;
uniform float cityTime;
uniform float cityDetail;
uniform vec3 citySun;
vec3 seoulEmit;
float seoulHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
// 창 칸 하나: 칸 안 위치(0~1)에서 유리 면적 마스크.
float seoulPane(vec2 f,vec2 lo,vec2 hi){return step(lo.x,f.x)*step(f.x,hi.x)*step(lo.y,f.y)*step(f.y,hi.y);}
`;
// diffuseColor는 이미 정점색(외벽색)을 곱한 상태. 여기서 벽·유리·띠를 정하고, 반사·불빛은 seoulEmit에 모았다가 마지막에 더한다.
const FRAGMENT_BODY=`
seoulEmit=vec3(0.0);
{
 vec3 N=normalize(seoulN);
 float seed=seoulData.x,baseY=seoulData.y,bh=max(seoulData.z,1.0);
 int use=int(seoulUse+0.5);
 vec3 V=normalize(cameraPosition-seoulWorld);
 float viewDist=length(cameraPosition-seoulWorld);
 #ifdef USE_FOG
 vec3 skyC=fogColor;
 #else
 vec3 skyC=vec3(.78,.84,.9);
 #endif
 vec3 wall=diffuseColor.rgb;
 float roofFace=step(.5,N.y);
 float night=cityNight;
 if(use==5){
  // 항공장애등: 낮엔 빨간 점, 밤엔 1초 주기로 깜빡인다.
  float blink=step(.45,fract(cityTime*.75+seed*7.0));
  diffuseColor.rgb=vec3(.55,.08,.06);
  seoulEmit=vec3(2.6,.18,.08)*night*blink;
 }else if(use==4){
  // 옥상 설비: 회색 철판·실외기. 세로 줄로 루버를 흉내 낸다.
  float louver=step(.5,fract((seoulWorld.x+seoulWorld.z)*1.4));
  diffuseColor.rgb=wall*mix(.86,1.0,louver*(1.0-roofFace));
 }else if(roofFace>.5){
  // 옥상: 방수 도막 면과 난간 그림자, 칸 줄눈.
  vec2 g=fract(seoulWorld.xz/6.0);float joint=(1.0-step(.04,g.x)*step(.04,g.y));
  float px=max(fwidth(seoulWorld.x),fwidth(seoulWorld.z))/6.0;
  diffuseColor.rgb=wall*(1.0-mix(joint*.12,.025,smoothstep(.3,1.0,px)));
 }else{
  vec2 T=normalize(vec2(-N.z,N.x)+1e-5);
  float u=dot(seoulWorld.xz,T),v=seoulWorld.y-baseY;
  // 용도별 층 높이·창 칸 폭. 같은 용도라도 건물마다 조금씩 다르다.
  float floorH=3.0,colW=3.4;vec2 lo=vec2(.22,.30),hi=vec2(.78,.80);float glassy=.0,warmLit=1.0,litShare=.55;
  float s2=fract(seed*7.31),s3=fract(seed*13.7);
  if(use==0){floorH=2.8;colW=mix(2.6,3.8,s2);lo=vec2(.10,.30);hi=vec2(.90,.86);litShare=mix(.3,.62,s3);}
  else if(use==1){floorH=mix(3.7,4.3,s2);colW=mix(1.4,2.2,s3);if(seed<.38){lo=vec2(.18,.26);hi=vec2(.82,.80);colW*=1.6;}else{lo=vec2(.06,.24);hi=vec2(.94,.92);glassy=1.0;}warmLit=.2;litShare=mix(.2,.6,s2);}
  else if(use==2){floorH=3.1;colW=mix(3.0,4.6,s2);lo=vec2(.25,.32);hi=vec2(.72,.78);litShare=mix(.18,.45,s3);}
  else if(use==3){floorH=6.0;colW=mix(5.0,8.0,s2);lo=vec2(.1,.62);hi=vec2(.9,.8);litShare=.18;warmLit=.0;}
  else if(use==6){floorH=4.0;colW=1.5;lo=vec2(.04,.2);hi=vec2(.96,.86);glassy=1.0;litShare=.55;warmLit=.6;}
  else if(use==7){floorH=4.2;colW=1.6;lo=vec2(.05,.12);hi=vec2(.95,.95);glassy=1.0;litShare=.5;warmLit=.2;}
  else if(use==8){floorH=6.0;colW=100.0;lo=vec2(2.0);hi=vec2(2.0);litShare=.0;}
  else if(use==9){floorH=3.5;colW=1.2;lo=vec2(.03,.1);hi=vec2(.97,.9);glassy=1.0;litShare=.95;warmLit=.8;}
  vec2 cell=vec2(u/colW,v/floorH),f=fract(cell),id=floor(cell);
  // 가로(칸)·세로(층)를 따로 거른다: 칸이 픽셀보다 작아져도 층 줄무늬는 남는다.
  vec2 pix=fwidth(cell);vec2 axisFar=smoothstep(vec2(.3),vec2(1.0),pix);float seoulFar=max(axisFar.x,axisFar.y);
  float area=(hi.x-lo.x)*(hi.y-lo.y);
  float paneX=mix(step(lo.x,f.x)*step(f.x,hi.x),hi.x-lo.x,axisFar.x),paneY=mix(step(lo.y,f.y)*step(f.y,hi.y),hi.y-lo.y,axisFar.y);
  float pane=paneX*paneY;
  // 저층 상가(1층)·옥상 난간(맨 위 1m)·아파트 계단실(몇 칸마다 창 없음)·업무 기계실층.
  float ground=step(v,floorH*1.15)*step(float(use),2.5)*step(.5,float(use));
  float parapet=step(bh-1.1,v);
  float core=use==0?step(mod(id.x+floor(seed*5.0),floor(mix(5.0,9.0,s3))),.5):0.0;
  float mech=use==1?step(mod(id.y,floor(mix(12.0,20.0,s2))),.5)*step(1.5,id.y):0.0;
  float solid=max(max(parapet,core),mech);
  float glassMask=pane*(1.0-solid);
  // 아파트 층마다 흰 슬래브 띠, 업무 건물 층간 스팬드럴.
  float band=0.0;
  if(use==0){band=mix(1.0-step(.10,f.y),.10,axisFar.y);}
  else if(use==2){band=mix(step(.92,f.y),.08,axisFar.y)*.5;}
  // 외벽: 위쪽 페인트 띠(아파트 지붕 아래), 상가층은 짙은 유리.
  vec3 w=wall;
  if(use==0)w=mix(w,w*vec3(.92,.95,1.0)+vec3(.04),band);
  if(use==0&&v>bh-floorH*2.2)w=mix(w,mix(vec3(.55,.62,.70),vec3(.62,.42,.36),step(.5,s2)),.55*step(.35,seed));
  // 유리색: 업무 유리는 짙은 청록, 그 외는 실내가 보이는 회색.
  vec3 glass=use==6?vec3(.50,.33,.08):use==7?vec3(.22,.27,.31):glassy>.5?mix(vec3(.12,.20,.24),vec3(.20,.24,.22),s3):vec3(.14,.15,.16);
  float gMask=max(glassMask,ground*.85);
  diffuseColor.rgb=mix(w,glass,gMask*(glassy>.5?1.0:.82));
  // 유리 반사: 하늘(연무색)과 해 반짝임. 쌍안경·높음에서만 세부, 그 외엔 평균 반사만.
  vec3 R=reflect(-V,N);
  float fres=.05+.95*pow(1.0-max(dot(N,V),0.0),5.0);
  vec3 skyRef=mix(skyC*.55,skyC*vec3(.82,.9,1.05),clamp(R.y*4.0+.5,0.0,1.0));
  skyRef=mix(skyRef,skyRef*vec3(1.12,.92,.8),cityDusk*.5);
  float reflAmt=(glassy>.5?mix(.22,.55,fres):fres*.6)*(1.0-night*.85);
  if(cityDetail>.5){
   // 층·칸마다 유리 기울기가 달라 반사가 얼룩진다.
   reflAmt*=mix(.75,1.25,seoulHash(id+seed*31.0)*(1.0-seoulFar)+.5*seoulFar);
   float glint=pow(max(dot(R,citySun),0.0),120.0)*step(-.02,citySun.y);
   seoulEmit+=gMask*glint*vec3(1.6,1.4,1.1)*(glassy>.5?1.0:.35)*(1.0-night);
  }
  // 금빛(63)·은빛(롯데) 유리는 반사에도 유리색이 묻는다.
  vec3 tint=use==6?vec3(1.0,.72,.32):use==7?vec3(.62,.70,.78):vec3(1.0);
  seoulEmit+=skyRef*tint*reflAmt*gMask;
  if(use==6)seoulEmit+=vec3(.16,.09,.0)*gMask*(1.0-night*.6);
  // 밤 창 불빛: 칸마다 켜짐·색이 다르고 건물마다 늦게까지 켜진 정도가 다르다.
  if(night>.001&&litShare>0.0){
   float h=seoulHash(id*vec2(1.0,1.37)+seed*97.0);
   float building=mix(.35,1.15,fract(seed*5.13));
   float share=clamp(litShare*building*night,0.0,1.0);
   float on=step(h,share);
   vec3 warm=mix(vec3(1.0,.70,.38),vec3(1.0,.82,.58),fract(h*17.0));
   vec3 cool=vec3(.82,.90,1.0);
   vec3 lamp=mix(cool,warm,step(fract(h*7.0),warmLit));
   // 칸이 보이면 칸별 켜짐, 안 보이면 켜진 비율의 평균(창틀·커튼 몫을 빼 0.55배).
   float exact=on*pane*(1.0-solid);
   float avg=share*pane*.55*(1.0-solid);
   float lit=mix(exact,avg,seoulFar);
   seoulEmit+=lamp*lit*mix(.6,1.25,fract(h*29.0))*.85*night;
   seoulEmit+=vec3(1.0,.78,.5)*ground*.55*night*step(.6,fract(seed*3.3+id.x*.13)); // 상가 간판·진열창
   if(use==9)seoulEmit+=vec3(.9,.95,1.0)*.6*night*(1.0-solid);
   if(use==8)seoulEmit+=mix(vec3(.25,.45,1.0),vec3(.95,.95,1.0),smoothstep(.0,1.0,v/bh))*.35*night;
  }
 }
 // 거리 대기 원근: 멀수록 채도가 빠지고 푸른 연무 쪽으로 기운다. 실제 감쇠(대비)는 대기 셰이더(fog 단계)가 맡는다.
 float aerial=smoothstep(1500.0,26000.0,viewDist);
 float lum=dot(diffuseColor.rgb,vec3(.299,.587,.114));
 diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(lum),skyC*lum*1.25,.5),aerial*.55);
 seoulEmit*=1.0-aerial*.35;
}
`;
const FRAGMENT_EMIT=`
gl_FragColor.rgb+=seoulEmit;
`;

// 원경 도시·랜드마크 재질. basic=true면 조명 없는 MeshBasicMaterial(원경 통합 실루엣).
export function cityFacadeMaterial(source,{basic=false}={}){
 const material=basic?new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}):(source?source.clone():new THREE.MeshStandardMaterial({roughness:.85}));
 material.color.set(0xffffff);material.vertexColors=true;
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey.bind(material),key=previousKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  Object.assign(shader.uniforms,CITY_LIGHT);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${VERTEX_HEAD}`)
   .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>\n${VERTEX_BODY}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${FRAGMENT_HEAD}`)
   .replace('#include <color_fragment>',`#include <color_fragment>\n${FRAGMENT_BODY}`)
   .replace('#include <opaque_fragment>',`#include <opaque_fragment>\n${FRAGMENT_EMIT}`);
 };
 material.customProgramCacheKey=()=>`${key}-seoul-facade-v2-${basic?'basic':'lit'}`;
 return material;
}

// 건물 하나의 정점 속성(seoulType·seoulInfo)을 채운다. 옥상 면(법선 위쪽)은 셰이더가 따로 칠한다.
export function setFacadeAttributes(geometry,{type,seed,base,height,color,roof=color}){
 const normal=geometry.attributes.normal,n=normal.count,colors=new Float32Array(n*3),types=new Float32Array(n),info=new Float32Array(n*3);
 for(let i=0;i<n;i++){
  const c=normal.getY(i)>.5?roof:color;colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;
  types[i]=type;info[i*3]=seed;info[i*3+1]=base;info[i*3+2]=height;
 }
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('seoulType',new THREE.BufferAttribute(types,1));geometry.setAttribute('seoulInfo',new THREE.BufferAttribute(info,3));
 return geometry;
}
