import * as THREE from 'three';

// ?fx=off 는 전후 비교용: 계곡 물(옛 단색 띠)·그림자 얼룩·빛줄기·잎 투과광 강화를 모두 끈다.
export const FX_OFF=/[?&]fx=off(&|$)/.test(globalThis.location?.search??'');
// 빛 효과 공통 값(산디자인). 계곡 물·나뭇잎 그림자 얼룩·빛줄기·잎 투과광이 같은 uniform 객체를 읽는다.
// rendering.js 가 프레임마다 updateLightFx()로 해·날씨·화질을 넣는다. 값을 이 파일 한 곳에서 조정한다.
export const LIGHT_FX={
 fxTime:{value:0},              // 초(물결·그림자 흔들림)
 fxSun:{value:new THREE.Vector3(0,1,0)}, // 해 쪽을 가리키는 단위 벡터
 fxSunVis:{value:1},            // 0~1 직사광이 땅에 닿는 정도(맑은 낮 1, 흐림·밤·해가 낮으면 작게)
 fxLowSun:{value:0},            // 0~1 해가 낮을수록 1(빛줄기가 길고 진해짐)
 fxQuality:{value:2},           // 0 낮음(휴대폰) 1 균형 2 높음
 fxRain:{value:0},              // 0~1 비
 fxWind:{value:.3},             // 0~1 바람(그림자 흔들림)
};
// 빛줄기·그림자 얼룩 세기. 맑은 낮 기준 1.
export const LIGHT_FX_CONFIG={
 dapple:{strength:.5,scale:.34},              // 바닥 그림자 얼룩이 직사광을 줄이는 최대 비율, 얼룩 크기(1/m)
 shafts:{count:[16,40,64],radius:15,height:16,strength:1.15,warmLow:.55},
 // 숲 밀도 곡선과 같은 고도 기준(forest-zones.js): 430m 위로 올라가면 숲이 성기고 520m 위는 능선.
 canopy:{from:430,to:520,summitFrom:600,summitTo:625,ridgeFloor:.28,summitFloor:.1},
};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
// 고도 y(m)의 나무 덮임 비율 0~1. 계곡·중턱 1, 능선 .28, 정상부 .1.
export function canopyAt(y,cfg=LIGHT_FX_CONFIG.canopy){
 if(!Number.isFinite(y))return 1;
 const ridge=smooth(cfg.from,cfg.to,y),summit=smooth(cfg.summitFrom,cfg.summitTo,y);
 const forest=1+(cfg.ridgeFloor-1)*ridge;return forest+(cfg.summitFloor-forest)*summit;
}
// 환경(environment.current)의 해·날씨를 uniform으로 옮긴다. sunVector는 해 쪽 단위 벡터.
export function updateLightFx({time,sunVector,environment,quality=2,mobile=false,camera=null}){
 const e=environment,elevation=e.light?.elevation??e.elevation??45;
 LIGHT_FX.fxTime.value=time;
 LIGHT_FX.fxSun.value.copy(sunVector);
 // 직사광: 햇빛 세기 × (회색 하늘이면 약하게) × 해가 지평선 위로 올라온 정도.
 const direct=FX_OFF?0:clamp((e.light?.intensity??1)*(1-.9*(e.gray??0))*(1-(e.night??0)))*smooth(1,7,elevation);
 LIGHT_FX.fxSunVis.value=direct;
 LIGHT_FX.fxLowSun.value=smooth(38,6,elevation)*direct;
 LIGHT_FX.fxQuality.value=mobile?0:quality;
 LIGHT_FX.fxRain.value=clamp(e.rain??0);
 LIGHT_FX.fxWind.value=clamp((e.windSpeed??2)/9);
 return {direct,elevation};
}

// ── 바닥 나뭇잎 그림자 얼룩(cookie) ───────────────────────────────────────────
// 지형·노면 재질의 fragment에 끼운다. 직사광 몫(reflectedLight.directDiffuse)에만 곱하므로 그늘·밤에는 아무 영향이 없다.
// worldVar는 재질의 세계 좌표 varying 이름(vec3). 숲이 짙은 고도에서만(canopyAt와 같은 곡선) 보이고 멀어지면 평균 밝기로 수렴한다.
export const DAPPLE_PARS=`
uniform float fxTime;uniform float fxSunVis;uniform float fxQuality;uniform float fxWind;uniform vec3 fxSun;
float dapHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float dapNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(dapHash(i),dapHash(i+vec2(1,0)),f.x),mix(dapHash(i+vec2(0,1)),dapHash(i+vec2(1,1)),f.x),f.y);}
// 직사광이 잎 사이로 통과하는 비율 0~1(1이면 햇살 조각, 0이면 잎 그림자).
float dappleLight(vec3 w,float dist){
 float canopy=1.-smoothstep(${LIGHT_FX_CONFIG.canopy.from.toFixed(1)},${LIGHT_FX_CONFIG.canopy.to.toFixed(1)},w.y);
 // 해 방향으로 비스듬히 비치는 만큼 얼룩이 땅 위에서 밀린다(해가 낮으면 길게 늘어짐).
 vec2 slide=-fxSun.xz/max(.25,fxSun.y)*3.;
 vec2 p=(w.xz+slide)*${LIGHT_FX_CONFIG.dapple.scale.toFixed(3)};
 float sway=fxTime*(.35+.9*fxWind);
 vec2 flow=vec2(sin(sway*.7+p.y*1.7),cos(sway*.6+p.x*1.3))*(.18+.35*fxWind);
 float n=dapNoise(p+flow)*.58;
 float fine=1.-smoothstep(18.,60.,dist);
 n+=dapNoise(p*2.7+flow*1.6+11.)*.27*fine;
 if(fxQuality>.5)n+=dapNoise(p*6.1-flow*2.3+3.)*.15*fine;else n+=.15*.5;
 // 임계값 근처에서 빛 조각이 생긴다. 숲이 짙을수록 어두운 쪽이 넓다.
 float lit=smoothstep(.5,.62,n+(1.-canopy)*.35);
 float avg=.42+.58*(1.-canopy);
 return mix(avg,lit,fine);
}`;
export function dappleApply(worldVar){
 return `{
  float dapDist=length(vViewPosition);
  float dap=dappleLight(${worldVar},dapDist);
  float dapAmt=${LIGHT_FX_CONFIG.dapple.strength.toFixed(2)}*fxSunVis*(1.-smoothstep(${LIGHT_FX_CONFIG.canopy.from.toFixed(1)},${LIGHT_FX_CONFIG.canopy.to.toFixed(1)},${worldVar}.y)*.75);
  // 햇살 조각은 살짝 밝게, 잎 그림자는 어둡게. 평균 밝기는 거의 유지한다.
  reflectedLight.directDiffuse*=1.-dapAmt*(1.-dap)*1.2+dapAmt*dap*.25;
 }`;
}
// 재질 shader에 얼룩을 끼운다. lights_fragment_end 뒤에 직사광 몫만 줄인다. 이미 끼웠으면 건드리지 않는다.
export function patchDapple(shader,worldVar){
 if(shader.fragmentShader.includes('dappleLight('))return shader;
 Object.assign(shader.uniforms,{fxTime:LIGHT_FX.fxTime,fxSun:LIGHT_FX.fxSun,fxSunVis:LIGHT_FX.fxSunVis,fxQuality:LIGHT_FX.fxQuality,fxWind:LIGHT_FX.fxWind});
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+DAPPLE_PARS)
  .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+dappleApply(worldVar));
 return shader;
}

// ── 나뭇잎 사이로 새는 빛줄기(볼륨 빛 카드) ───────────────────────────────────
// 해 방향으로 늘어진 가는 판 여러 장을 카메라 둘레에 깐다. 위치는 카메라를 따라 돌며(바둑판 주기 이동) 가장자리에서 서서히 사라져 튀지 않는다.
// 덧칠(additive) 합성. 깊이 검사는 끈다(켜면 빽빽한 잎 안쪽에 묻혀 거의 안 보임). 그 대신 카메라에 너무 가깝거나 눈높이보다 많이 위면 옅어져 시야를 가리지 않는다.
const SHAFT_VERTEX=`
attribute vec4 aSeed;
uniform vec3 fxSun;uniform float fxLowSun;uniform vec3 fxCam;uniform float fxRadius;uniform float fxHeight;uniform float fxWidthMul;uniform float fxCount;
varying vec2 vUv;varying float vFade;varying float vSeed;varying float vLow;varying float vRel;varying float vBright;
void main(){
 vec2 seed=aSeed.xy;
 // 카메라 둘레 [-R,R]² 안의 한 점. 카메라가 움직이면 반대쪽 가장자리로 되감기지만 가장자리에서는 투명하다.
 vec2 off=mod(seed*fxRadius*2.-fxCam.xz+fxRadius,fxRadius*2.)-fxRadius;
 float edge=1.-smoothstep(.62,1.,length(off)/fxRadius);
 vec3 foot=vec3(fxCam.x+off.x,fxCam.y-1.8,fxCam.z+off.y);
 vec3 axis=normalize(vec3(fxSun.x,max(fxSun.y,.16),fxSun.z));
 float len=min(fxHeight/axis.y,52.);
 vec3 top=foot+axis*len;
 vec3 V=normalize(cameraPosition-foot);
 vec3 side=normalize(cross(axis,V));
 float width=(.55+1.9*aSeed.z*aSeed.z+.5*aSeed.w)*fxWidthMul;
 vec3 p=mix(foot,top,uv.y)+side*(uv.x-.5)*width;
 vUv=uv;vSeed=aSeed.w;vLow=fxLowSun;
 float dist=length(cameraPosition-foot);
 vFade=edge*smoothstep(2.5,9.,dist);
 vRel=p.y-fxCam.y;vBright=.25+1.35*aSeed.w*aSeed.w;
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const SHAFT_FRAGMENT=`
uniform float fxTime;uniform float fxStrength;uniform vec3 fxColor;uniform float fxQuality;uniform float fxCanopy;uniform float fxSunVis;
varying vec2 vUv;varying float vFade;varying float vSeed;varying float vLow;varying float vRel;varying float vBright;
float shH(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float shN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(shH(i),shH(i+vec2(1,0)),f.x),mix(shH(i+vec2(0,1)),shH(i+vec2(1,1)),f.x),f.y);}
void main(){
 float across=1.-abs(vUv.x*2.-1.);
 float soft=pow(smoothstep(0.,1.,across),1.25);
 // 위는 잎 틈에서 시작해 서서히 퍼지고 아래는 땅 가까이에서 옅어진다.
 float along=smoothstep(0.,.16,vUv.y)*(1.-smoothstep(.55,1.,vUv.y))*(.55+.45*vUv.y);
 // 잎 틈 모양(위로 갈수록 빛이 모인 줄무늬)과 떠다니는 먼지.
 float streak=.25+.75*smoothstep(.25,.75,shN(vec2(vUv.x*5.+vSeed*40.,vUv.y*1.8-fxTime*.05)));
 // 눈높이 위로 올라갈수록 옅어진다(하늘을 배경으로 한 흰 기둥처럼 보이지 않게, 줄기 사이 어두운 숲에서만 또렷하다).
 float heightFade=1.-smoothstep(2.,10.,vRel);
 float dust=1.;
 if(fxQuality>.5)dust=.7+.6*shN(vec2(vUv.x*4.+vSeed*17.,vUv.y*7.-fxTime*.22+vSeed*9.));
 float shimmer=.82+.18*sin(fxTime*.7+vSeed*40.);
 float a=soft*along*streak*dust*shimmer*vFade*heightFade*vBright*fxStrength*fxCanopy*fxSunVis;
 a*=1.+.45*vLow;
 gl_FragColor=vec4(fxColor*a,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
// 가벼운 단계(휴대폰)는 줄 수를 줄이고 먼지 무늬를 뺀다.
export function createLightShafts({mobile=false}={}){
 const cfg=LIGHT_FX_CONFIG.shafts,max=cfg.count[2];
 const base=new THREE.PlaneGeometry(1,1,1,1),geometry=new THREE.InstancedBufferGeometry();
 geometry.index=base.index;geometry.attributes.position=base.attributes.position;geometry.attributes.uv=base.attributes.uv;
 const seeds=new Float32Array(max*4);
 // 결정적 의사난수(재현 가능한 배치).
 const hash=n=>{n=(n*.1031)%1;n*=n+33.33;n*=n+n;return n-Math.floor(n);};
 for(let i=0;i<max;i++){seeds.set([hash(i*3.7+1),hash(i*5.3+2),hash(i*7.9+3),hash(i*11.1+4)],i*4);}
 geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,4));geometry.instanceCount=cfg.count[mobile?0:2];
 const uniforms={...LIGHT_FX,
  fxCam:{value:new THREE.Vector3()},fxRadius:{value:cfg.radius},fxHeight:{value:cfg.height},fxWidthMul:{value:1},fxCount:{value:max},
  fxStrength:{value:cfg.strength},fxColor:{value:new THREE.Color(1,.92,.72)},fxCanopy:{value:1}};
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:SHAFT_VERTEX,fragmentShader:SHAFT_FRAGMENT,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,toneMapped:true});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=5;mesh.name='빛줄기';
 const color=new THREE.Color();
 return {mesh,material,
  // 카메라 위치·고도(숲 덮임)·해 색·화질에 맞춰 갱신한다. 숲 밖·직사광 없음이면 그리지 않는다.
  update({camera,sunColor,quality,canopy,lowSun}){
   const u=material.uniforms;u.fxCam.value.copy(camera.position);
   // 해질녘에는 따뜻한 금빛, 낮에는 연한 백금빛.
   color.setRGB(...sunColor,THREE.SRGBColorSpace);const warm=LIGHT_FX.fxLowSun.value*cfg.warmLow;
   u.fxColor.value.set(1,.93-.18*warm,.78-.38*warm).multiply(color.clone().multiplyScalar(1/Math.max(.001,Math.max(color.r,color.g,color.b))));
   u.fxCanopy.value=canopy;
   geometry.instanceCount=cfg.count[mobile?0:Math.max(0,Math.min(2,quality))];
   mesh.visible=canopy*LIGHT_FX.fxSunVis.value>.02&&geometry.instanceCount>0;
   u.fxWidthMul.value=1+.25*lowSun;
  }};
}
