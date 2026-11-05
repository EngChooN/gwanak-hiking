import * as THREE from 'three';
import {TOON,hexToRgb,phaseWeights} from './palette.js';
// 서울 원경(카툰 2차): 「너의 이름은」 도심 기준(design/ref-cartoon/14_*, docs/카툰-참고-2차.md §3).
//  낮: 야숨풍 파스텔. 해 쪽 벽은 크림 쪽으로 밝게, 반대쪽은 푸른 회색 그늘(2단 툰). 유리 외벽은 하늘빛 그라데이션, 아파트는 층마다 창 띠.
//  노을: 해 쪽 벽·지붕에 살구·크림 윤곽빛, 그늘은 라벤더 청색. 유리는 분홍·살구 반사. 창 불빛이 켜지기 시작한다.
//  밤: 짙은 남회색 몸체에 창 격자 불빛(크림 55·푸른 흰 25·청록 12·노랑 8%), 고층 위쪽 일부는 분홍·자홍. 먼 도심은 라벤더 연무로 녹는다.
//  모든 시간대: 거리 대기 원근(멀수록 연무색·대비 감소). 시간대마다 연무색이 다르다(낮 하늘색을 노을·밤에 쓰지 않는다).
// 덧붙이는 것(모두 한 번 제출): 벽 불빛 점(LOD와 무관하게 전 도심), 고층 무리 분홍 빛무리, 간선도로 차량 불빛 줄기, 한강 물빛.
// city-grid.js 건물 정점 속성(color, seoulType, seoulInfo=[seed, base, height])을 그대로 읽는다. 없으면 월드 위치 해시로 대신한다.
const linear=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
// 시간대별 모양 값. 색 근거: docs/카툰-참고-2차.md §3-2(불빛 색 분포), 14_01·14_13·14_14·14_15.
export const CITY_LOOK=Object.freeze({
 // 정점색(실제 외벽색)을 얼마나 흰색 쪽으로 올릴지(파스텔), 채도를 얼마나 뺄지.
 pastelLift:.22,pastelDesat:.3,
 // 낮 연무는 주변 원경 땅 연무색 근처: 먼 건물이 흰 얼룩으로 뜨지 않고 땅과 함께 녹는다. 쌍안경에서는 배율만큼 연무가 줄어 또렷해진다(zoomClear).
 day:{lit:'#f6efe2',shade:'#8e9fbe',roof:'#e6e4de',glass:'#7fa7c6',glassTop:'#bcd6e4',haze:'#8eaac2',hazeScale:9000,hazeMax:.9},
 // 노을: 도심은 대부분 어두운 라벤더 청색 실루엣(14_13). 해 쪽 벽만 흐린 장밋빛, 지붕 끝·벽 꼭대기에 크림 윤곽빛(rim).
 sunset:{lit:'#bf929a',shade:'#4c5078',roof:'#8d7f9c',rim:'#ffd9b0',glass:'#5d5a85',glassLit:'#f3c1a4',haze:'#7a7092',hazeScale:9000,hazeMax:.88},
 // 쌍안경 노을(배율 1.5→4배에 걸쳐 섞임, 1배는 위 sunset 그대로): 14_13·14_14처럼 건물 본체는 청회색 그늘, 해를 정면으로 받는 벽만 조금 밝은 청회색.
 // 따뜻한 색은 지붕 끝 윤곽빛(rimM m 띠)과 지평선에만 남긴다. litFrom: 해 쪽 벽으로 칠 기준(해 방향과 이루는 cos).
 binoDusk:{lit:'#7d8ba3',shade:'#3f4f66',roof:'#8d8a9c',haze:'#69748e',litFrom:.3,rimM:3},
 night:{body:'#262c3c',bodyLit:'#323a4e',glass:'#1a1f2d',haze:'#454a6a',hazeScale:16000,hazeMax:.75},
 zoomClear:.55,
 // 밤 창 불빛(sRGB): 크림 #ede7c9 55%, 푸른 흰색 #e3e6f4 25%, 청록 #8fbcdc 12%, 노랑 #e5b281 8%. 고층(70m 이상) 위쪽 40%의 창 일부는 분홍·자홍.
 light:{cream:'#f0e5bc',blueWhite:'#e3e6f4',teal:'#8fbcdc',warm:'#e5b281',magenta:'#e07ad0',pink:'#f2a0c8',share:[.55,.25,.12,.08],tallHeight:70,magentaShare:.35},
 windowIntensity:1.0,litMin:TOON.city.litMin,litMax:TOON.city.litMax,
 // 벽 불빛 점: 벽 m²당 개수, 건물당·전체 상한, 화면 크기(px). 해질녘엔 일부만.
 // target: 화면 1px당 점 개수 상한(14_15 실측 100만 화소당 약 3000개 → .003, 원경이라 겹침 여유를 두어 .01). 멀어서 한 픽셀에 벽이 많이 겹치면 그만큼 솎는다.
 // density: 도심 벽 전체 약 287km²(정상 원경 기준 실측)에 total개가 고르게 퍼지는 값. lowKeep: 화질 낮음에서 남길 비율.
 dots:{density:.00062,max:4000,total:180000,px:2.2,gain:1.0,target:.01,layers:3,lowKeep:.5},
 // 고층 무리 빛무리: 높이 haloHeight 이상 건물마다 하나. 월드 반지름 = base + 높이×scale. 화면 최대 maxPx.
 halo:{height:90,base:80,scale:.7,maxPx:240,fullPx:70,gain:.07,dusk:.35,colorA:'#c46fb8',colorB:'#9a7fd0'},
 // 차량 불빛 줄기: 간선도로·다리만. 차 한 칸 길이(m), 차 있을 확률, 속도(칸/초).
 // kinds: 줄기를 깔 도로(고속·도시고속·주간선, 다리). major: 화질 낮음에서도 그릴 도로(앞쪽에 모아 drawRange로 자른다).
 traffic:{kinds:/^(motorway|trunk|primary)(_link)?$/,major:/^(motorway|trunk)$/,cell:26,fill:.6,speed:.8,head:'#fff1d6',tail:'#ff5a48',gain:1.8,clearM:1.5,maxSegment:120},
 // 한강: 낮 파스텔 청색·하늘 반사, 노을 살구·라벤더 반사, 밤 짙은 남색 + 불빛 세로 반사.
 river:{day:'#7fa9bd',daySky:'#c9dde6',sunset:'#4f4e74',sunsetSky:'#e8b8b0',night:'#141a28',nightSky:'#454a6a',streak:.12,streakGain:.42},
});
// 가로등·다리 불빛 평균색: 크림 위주 + 푸른 흰색 + 노랑 조금(가로등은 실제로 노란 등도 섞인다).
const LIGHT_MIX=linear(CITY_LOOK.light.cream).multiplyScalar(.62).add(linear(CITY_LOOK.light.blueWhite).multiplyScalar(.22)).add(linear(CITY_LOOK.light.warm).multiplyScalar(.16));
const L=CITY_LOOK;
export const CITY_UNIFORMS={
 cityNight:{value:0},cityDay:{value:1},citySunset:{value:0},cityLights:{value:0},cityTime:{value:0},
 citySun:{value:new THREE.Vector3(0,1,0)},cityHaze:{value:new THREE.Color(.7,.78,.84)},cityHazeScale:{value:L.day.hazeScale},cityHazeMax:{value:L.day.hazeMax},
 cityDayLit:{value:linear(L.day.lit)},cityDayShade:{value:linear(L.day.shade)},cityDayRoof:{value:linear(L.day.roof)},cityGlassDay:{value:linear(L.day.glass)},cityGlassTop:{value:linear(L.day.glassTop)},
 cityDuskLit:{value:linear(L.sunset.lit)},cityDuskShade:{value:linear(L.sunset.shade)},cityDuskRoof:{value:linear(L.sunset.roof)},cityDuskRim:{value:linear(L.sunset.rim)},cityGlassDusk:{value:linear(L.sunset.glass)},cityGlassDuskLit:{value:linear(L.sunset.glassLit)},
 cityBinoLit:{value:linear(L.binoDusk.lit)},cityBinoShade:{value:linear(L.binoDusk.shade)},cityBinoRoof:{value:linear(L.binoDusk.roof)},cityBinoHaze:{value:linear(L.binoDusk.haze)},
 cityNightTint:{value:linear(L.night.body)},cityNightLit:{value:linear(L.night.bodyLit)},cityGlassNight:{value:linear(L.night.glass)},
 cityCream:{value:linear(L.light.cream)},cityBlueWhite:{value:linear(L.light.blueWhite)},cityTeal:{value:linear(L.light.teal)},cityWindow:{value:linear(L.light.warm)},cityMagenta:{value:linear(L.light.magenta)},cityPink:{value:linear(L.light.pink)},
 cityWindowIntensity:{value:L.windowIntensity},cityLitMin:{value:L.litMin},cityLitMax:{value:L.litMax},
 cityDotGain:{value:L.dots.gain},cityDotPx:{value:L.dots.px},cityZoom:{value:1},cityViewH:{value:800},cityPxAngle:{value:.0014},cityDotKeep:{value:1},
 cityHaloA:{value:linear(L.halo.colorA)},cityHaloB:{value:linear(L.halo.colorB)},cityHaloGain:{value:0},
 cityHead:{value:linear(L.traffic.head)},cityTail:{value:linear(L.traffic.tail)},
 cityRiverDay:{value:linear(L.river.day)},cityRiverDaySky:{value:linear(L.river.daySky)},cityRiverSunset:{value:linear(L.river.sunset)},cityRiverSunsetSky:{value:linear(L.river.sunsetSky)},cityRiverNight:{value:linear(L.river.night)},cityRiverNightSky:{value:linear(L.river.nightSky)},
};
const f3=v=>v.toFixed(3);
// 창 불빛 색 고르기(크림·푸른 흰·청록·노랑 누적 비율)와 그 평균. 점·창 모두 같은 규칙.
const [S0,S1,S2]=[L.light.share[0],L.light.share[0]+L.light.share[1],L.light.share[0]+L.light.share[1]+L.light.share[2]];
const TONE_GLSL=`
vec3 tcTone(float t){return t<${f3(S0)}?cityCream:t<${f3(S1)}?cityBlueWhite:t<${f3(S2)}?cityTeal:cityWindow;}
vec3 tcToneAvg(){return cityCream*${f3(L.light.share[0])}+cityBlueWhite*${f3(L.light.share[1])}+cityTeal*${f3(L.light.share[2])}+cityWindow*${f3(L.light.share[3])};}`;
const COMMON_UNIFORMS=`
uniform float cityNight,cityDay,citySunset,cityLights,cityTime,cityHazeScale,cityHazeMax,cityWindowIntensity,cityLitMin,cityLitMax,cityZoom;
uniform vec3 citySun,cityHaze,cityDayLit,cityDayShade,cityDayRoof,cityGlassDay,cityGlassTop,cityDuskLit,cityDuskShade,cityDuskRoof,cityDuskRim,cityGlassDusk,cityGlassDuskLit;
uniform vec3 cityBinoLit,cityBinoShade,cityBinoRoof,cityBinoHaze;
uniform vec3 cityNightTint,cityNightLit,cityGlassNight,cityCream,cityBlueWhite,cityTeal,cityWindow,cityMagenta,cityPink;
uniform vec3 cityRiverDay,cityRiverDaySky,cityRiverSunset,cityRiverSunsetSky,cityRiverNight,cityRiverNightSky;
float tcHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
// 거리 대기 원근: 시간대 연무색으로. 상한(cityHazeMax)을 둬 먼 건물도 실루엣이 남는다.
// 쌍안경(cityZoom>1)은 배율만큼 연무를 덜 받는다(실제보다 또렷하게: 확대해도 덩어리로 뭉개지지 않게).
float tcFog(float d){return min(1.-exp(-d/(cityHazeScale*(1.+(cityZoom-1.)*${f3(L.zoomClear)}))),cityHazeMax);}
${TONE_GLSL}`;

const VERTEX_HEAD=`attribute vec3 seoulInfo;attribute float seoulType;varying vec3 vTcWorld;varying vec3 vTcNormal;varying vec3 vTcInfo;varying float vTcDist;varying float vTcType;`;
const VERTEX_BODY=`
{
 vec4 tcW=modelMatrix*vec4(transformed,1.);vTcWorld=tcW.xyz;vTcNormal=normalize(mat3(modelMatrix)*normal);vTcInfo=seoulInfo;vTcType=seoulType;
 vTcDist=length((viewMatrix*tcW).xyz);
}`;
const FRAGMENT_HEAD=`
varying vec3 vTcWorld;varying vec3 vTcNormal;varying vec3 vTcInfo;varying float vTcDist;varying float vTcType;
${COMMON_UNIFORMS}`;
// 용도(seoulType): 0 아파트 1 업무 2 저층 3 공장 4 옥상 설비 5 항공장애등 6 63빌딩 금빛 유리 7 롯데 은빛 유리 8 탑 콘크리트 9 전망대 유리.
const FRAGMENT_BODY=`
{
 bool known=vTcInfo.x>0.;
 float seed=known?vTcInfo.x:tcHash(floor(vTcWorld.xz/40.));
 float baseY=known?vTcInfo.y:0.,bh=known?max(vTcInfo.z,1.):40.;
 int use=int(vTcType+.5);
 vec3 N=normalize(vTcNormal);
 float roof=step(.5,N.y),v=vTcWorld.y-baseY,hv=clamp(v/bh,0.,1.);
 float s2=fract(seed*7.31),s3=fract(seed*13.7);
 // 파스텔: 실제 외벽색(정점색)의 색감은 남기고 채도를 빼 흰색 쪽으로 올린다.
 vec3 src=diffuseColor.rgb;float lum=dot(src,vec3(.299,.587,.114));
 vec3 pastel=mix(mix(src,vec3(lum),${f3(L.pastelDesat)}),vec3(1.),${f3(L.pastelLift)});
 // 해 쪽 벽(수평 방향)만 밝다: 2단 툰. 해가 낮을수록(노을) 경계가 또렷하다.
 vec3 sunH=normalize(vec3(citySun.x,0.,citySun.z)+vec3(1e-4,0.,0.));
 float litK=mix(smoothstep(-.12,.12,dot(N,sunH)),1.,roof);
 // 멀수록 밝은 면·그늘 차(대비)가 줄어 층층이 옅어진다.
 float fog=tcFog(vTcDist);float contrast=1.-fog*.55;litK=mix(.55,litK,contrast);
 vec3 dayC=pastel*mix(mix(cityDayShade,cityDayLit,litK),cityDayRoof,roof);
 vec3 duskC=pastel*mix(mix(cityDuskShade,cityDuskLit,litK),cityDuskRoof,roof);
 // 쌍안경 노을: 청회색 본체(해를 정면으로 받는 벽만 밝게). zb는 1배에서 0이라 1배 노을은 그대로다.
 float zb=smoothstep(1.5,4.,cityZoom);
 float litB=mix(.4,mix(smoothstep(${f3(L.binoDusk.litFrom)},${f3(L.binoDusk.litFrom+.25)},dot(N,sunH)),1.,roof),contrast);
 duskC=mix(duskC,pastel*mix(mix(cityBinoShade,cityBinoLit,litB),cityBinoRoof,roof),zb);
 vec3 nightC=mix(cityNightTint,cityNightLit,litK*.6)*mix(.82,1.12,fract(seed*3.7));
 // 노을 윤곽빛: 해 쪽 벽 맨 위 1.5m, 지붕 가장자리 쪽이 크림으로 빛난다(14_13·14_14 지붕 윤곽).
 float rim=step(bh-mix(1.6,${f3(L.binoDusk.rimM)},zb),v)*(1.-roof)*step(.5,mix(litK,litB+.3,zb));
 duskC=mix(duskC,cityDuskRim,rim*.85);dayC=mix(dayC,cityDayLit,rim*.5);
 vec3 col=dayC*cityDay+duskC*citySunset+nightC*cityNight;
 vec3 glow=vec3(0.);
 if(use==5){
  // 항공장애등: 낮엔 빨간 점, 밤엔 깜빡인다.
  col=vec3(.62,.1,.08);glow=vec3(1.5,.16,.1)*cityLights*step(.45,fract(cityTime*.75+seed*7.));
 }else if(use==8){
  // 남산타워 기둥: 창 없음. 밤에 아래 푸른빛 → 위 흰빛 조명.
  glow=mix(vec3(.3,.42,.95),vec3(.92,.9,1.),hv)*.42*cityLights;
 }else if(roof<.5&&use!=4){
  // 창 격자(월드 좌표). 용도마다 층 높이·칸 폭·유리 면적이 다르다.
  float floorH=3.2,colW=3.4,glassy=0.;vec2 lo=vec2(.22,.3),hi=vec2(.78,.8);
  if(use==0){floorH=2.8;colW=mix(2.6,3.8,s2);lo=vec2(.08,.34);hi=vec2(.92,.84);}
  else if(use==1){floorH=mix(3.7,4.3,s2);colW=mix(1.5,2.3,s3);glassy=step(.38,seed);lo=glassy>.5?vec2(.06,.18):vec2(.18,.26);hi=glassy>.5?vec2(.94,.94):vec2(.82,.8);}
  else if(use==2){floorH=3.1;colW=mix(3.,4.6,s2);lo=vec2(.25,.34);hi=vec2(.72,.78);}
  else if(use==3){floorH=6.;colW=mix(5.,8.,s2);lo=vec2(.1,.62);hi=vec2(.9,.8);}
  else if(use==6||use==7){floorH=4.;colW=1.6;glassy=1.;lo=vec2(.05,.15);hi=vec2(.95,.94);}
  else if(use==9){floorH=3.5;colW=1.2;glassy=1.;lo=vec2(.03,.1);hi=vec2(.97,.9);}
  vec2 T=normalize(vec2(-N.z,N.x)+1e-5);
  vec2 cell=vec2(dot(vTcWorld.xz,T)/colW,v/floorH),id=floor(cell),f=fract(cell);
  // 칸이 픽셀보다 작아지면 축마다 유리 면적 평균으로 바꿔 지글거림(모아레)을 막는다.
  vec2 farA=smoothstep(vec2(.3),vec2(1.),fwidth(cell));float far=max(farA.x,farA.y);
  float pane=mix(step(lo.x,f.x)*step(f.x,hi.x),hi.x-lo.x,farA.x)*mix(step(lo.y,f.y)*step(f.y,hi.y),hi.y-lo.y,farA.y);
  pane*=(1.-step(bh-1.2,v))*step(.5,id.y);
  // 낮 유리: 하늘빛(위로 갈수록 밝게). 업무 유리 외벽은 면 전체가 유리라 하늘이 비친 듯 보인다.
  vec3 gDay=mix(cityGlassDay,cityGlassTop,hv*.8+.2*litK)*mix(.9,1.04,litK);
  vec3 gDusk=mix(cityGlassDusk,cityGlassDuskLit,litK*mix(.5,1.,hv));
  vec3 gNight=cityGlassNight;
  vec3 glass=gDay*cityDay+gDusk*citySunset+gNight*cityNight;
  float gAmt=pane*mix(.5,.88,glassy);
  if(use==6)glass*=vec3(1.18,.98,.7);
  col=mix(col,glass,gAmt);
  // 밤 창 불빛: 칸마다 켜짐·색이 다르고, 건물마다 늦게까지 켜진 정도가 다르다.
  if(cityLights>.001){
   float h=tcHash(id*vec2(1.,1.37)+seed*97.);
   float share=mix(cityLitMin,cityLitMax,fract(seed*5.13))*cityLights*(use==3?.4:use>=6?1.4:1.);
   vec3 tone=tcTone(fract(h*17.3+seed*3.1));
   // 고층 위쪽: 일부 창이 분홍·자홍(14_15 고층 무리).
   float tall=step(${f3(L.light.tallHeight)},bh)*step(.6,hv);
   tone=mix(tone,mix(cityPink,cityMagenta,fract(h*5.3)),tall*step(${f3(1-L.light.magentaShare)},fract(h*7.7)));
   if(use==6)tone=mix(cityWindow,cityCream,.4);
   float lit=mix(step(h,share)*pane,share*pane*.5,far);
   tone=mix(tone,tcToneAvg(),far);
   // 먼 창 평균은 블룸 문턱 아래로(빛 덩어리 방지). 먼 도심 불빛은 벽 불빛 점이 맡는다.
   glow+=tone*lit*cityWindowIntensity*mix(.75,1.15,fract(h*29.))*mix(1.,.55,far);
   // 저층 1층 상가 진열창.
   if(use==2)glow+=cityCream*.4*cityLights*step(v,floorH*1.1)*step(.55,fract(seed*3.3+id.x*.13))*(1.-far*.6);
  }
 }
 col=mix(col,mix(cityHaze,cityBinoHaze,zb*citySunset),fog);
 diffuseColor.rgb=col+glow*(1.-fog*.5);
}`;

// 벽 불빛 점: 건물 벽 삼각형 넓이에 비례해 점을 뿌린다(지붕 제외). 점 크기는 화면 픽셀로 고정해 멀어도 1~3px 점으로 남는다.
// LOD(상세·상자·실루엣)와 무관하게 전 도심에 하나로 그린다. 상자·실루엣이 점을 가리지 않도록 카메라 쪽으로 조금(거리×0.4%, 최대 60m) 당겨 그린다.
// aDot: 켜지는 순서(0~1, 해질녘엔 작은 값부터), aTall: 고층 위쪽 점(분홍·자홍 후보).
const DOT_VERT=`
uniform float cityLights,cityDotPx,cityZoom,cityPxAngle,cityDotKeep;attribute float aDot;attribute float aTall;varying float vOn;varying float vTone;varying float vTall;varying float vDist;
void main(){
 vec4 mv=modelViewMatrix*vec4(position,1.);float d=length(mv.xyz);
 mv.xyz*=max(0.,d-clamp(d*.004,1.,60.))/max(d,1e-3);
 gl_Position=projectionMatrix*mv;
 vOn=step(aDot,cityLights*1.05-.05);
 // 한 픽셀에 겹치는 벽 넓이가 크면(멀리·1배) 그만큼 솎는다: 남는 비율 = 목표 밀도 / (벽 m²당 점 × 겹침 × 픽셀 넓이).
 float pxm=d*cityPxAngle;vOn*=step(fract(aDot*91.7),cityDotKeep*${f3(L.dots.target)}/(${L.dots.density.toFixed(5)}*${L.dots.layers.toFixed(1)}*pxm*pxm));vTone=fract(aDot*53.7);vTall=aTall;vDist=d;
 gl_PointSize=vOn*cityDotPx*mix(1.5,1.,smoothstep(2000.,14000.,d))*(.8+.5*fract(aDot*17.3))*mix(1.,1.25,clamp((cityZoom-1.)/7.,0.,1.));
}`;
const DOT_FRAG=`
uniform vec3 cityCream,cityBlueWhite,cityTeal,cityWindow,cityMagenta,cityPink,cityHaze;uniform float cityDotGain,cityHazeScale,cityHazeMax,cityZoom;varying float vOn;varying float vTone;varying float vTall;varying float vDist;
${TONE_GLSL}
void main(){if(vOn<.5)discard;float r=length(gl_PointCoord-.5);if(r>.5)discard;
 vec3 c=tcTone(vTone);c=mix(c,mix(cityPink,cityMagenta,fract(vTone*5.3)),vTall*step(${f3(1-L.light.magentaShare)},fract(vTone*7.7)));
 float fog=min(1.-exp(-vDist/(cityHazeScale*(1.+(cityZoom-1.)*${f3(L.zoomClear)}))),cityHazeMax);
 gl_FragColor=vec4(mix(c*cityDotGain,cityHaze,fog*.45)*(1.-.35*smoothstep(.2,.5,r)),1.);}`;
// geometry의 벽 삼각형에서 점을 뽑는다. 반환: {position, aDot, aTall}(Float32Array) 또는 null. 고층(halo.height 이상)은 tall 목록에 중심·꼭대기를 모은다.
export function sampleCityDots(geometry,{density=L.dots.density,max=L.dots.max}={},tall=null){
 const P=geometry?.attributes?.position;if(!P)return null;
 const I=geometry.attributes.seoulInfo,idx=geometry.index,tri=idx?idx.count/3:P.count/3,pos=[],seed=[],tallFlag=[];
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3();
 let acc=0,k=0;
 for(let t=0;t<tri;t++){
  const i0=idx?idx.getX(t*3):t*3,i1=idx?idx.getX(t*3+1):t*3+1,i2=idx?idx.getX(t*3+2):t*3+2;
  a.fromBufferAttribute(P,i0);b.fromBufferAttribute(P,i1);c.fromBufferAttribute(P,i2);
  e1.subVectors(b,a);e2.subVectors(c,a);n.crossVectors(e1,e2);const area=n.length()/2;if(area<1e-3)continue;
  // 벽(수직 면)에만. 지붕·바닥은 건너뛴다.
  if(Math.abs(n.y)/(area*2)>.5)continue;
  const base=I?I.getY(i0):0,height=I?I.getZ(i0):0;
  if(tall&&I&&height>=L.halo.height){const key=I.getX(i0).toFixed(6)+':'+base.toFixed(1);const r=tall.get(key)??{x:0,z:0,n:0,base,height};r.x+=a.x;r.z+=a.z;r.n++;tall.set(key,r);}
  if(pos.length/3>=max)continue;
  acc+=area*density;
  while(acc>=1&&pos.length/3<max){acc-=1;k++;
   const h=q=>{const v=Math.sin(k*12.9898+q*78.233+t*.37)*43758.5453;return v-Math.floor(v);};
   let u=h(1),v=h(2);if(u+v>1){u=1-u;v=1-v;}
   const y=a.y+e1.y*u+e2.y*v;
   pos.push(a.x+e1.x*u+e2.x*v,y,a.z+e1.z*u+e2.z*v);seed.push(h(3));
   tallFlag.push(I&&height>=L.light.tallHeight&&(y-base)/height>.6?1:0);
  }
 }
 if(!pos.length)return null;
 return {position:new Float32Array(pos),aDot:new Float32Array(seed),aTall:new Float32Array(tallFlag)};
}
// 이전 이름(테스트·미리보기용): 점 BufferGeometry를 바로 만든다.
export function buildCityDots(geometry,options={}){
 const s=sampleCityDots(geometry,options);if(!s)return null;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(s.position,3));g.setAttribute('aDot',new THREE.BufferAttribute(s.aDot,1));g.setAttribute('aTall',new THREE.BufferAttribute(s.aTall,1));g.computeBoundingSphere();
 return g;
}

// 고층 무리 빛무리: 고층 꼭대기 쪽에 부드러운 분홍·보라 원(월드 크기). 겹치면 무리 둘레가 빛무리가 된다(14_15, 분홍은 점이 아니라 빛무리).
const HALO_VERT=`
uniform float cityViewH,cityHaloGain;attribute float aSize;attribute float aTone;varying float vTone;varying float vA;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float d=max(-mv.z,1.);
 float px=aSize*projectionMatrix[1][1]*cityViewH*.5/d;
 // 화면에서 작을수록(1배·먼 곳) 약하게: 고층 무리 빛무리가 겹쳐 흰 덩어리가 되지 않게.
 vTone=aTone;vA=cityHaloGain*clamp(px/${L.halo.fullPx.toFixed(1)},.08,1.);gl_PointSize=cityHaloGain>.0005?clamp(px,2.,${L.halo.maxPx.toFixed(1)}):0.;}`;
const HALO_FRAG=`
uniform vec3 cityHaloA,cityHaloB;varying float vTone;varying float vA;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float a=exp(-r*r*3.5)*(1.-smoothstep(.75,1.,r));
 gl_FragColor=vec4(mix(cityHaloA,cityHaloB,vTone)*a*vA,1.);}`;

// 차량 불빛 줄기: 간선도로 양 차선을 선(1px)으로 깔고, 차 칸이 흐르게 한다. 한쪽은 전조등(크림 흰), 반대쪽은 미등(빨강).
// 칸이 화면에서 너무 작아지면(멀리) 평균 밝기의 이어진 줄로 바뀌어 반짝이지 않는다.
const TRAFFIC_VERT=`
attribute float aAlong;attribute float aDir;attribute float aSeed;varying float vAlong;varying float vDir;varying float vSeed;varying float vDist;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;vAlong=aAlong;vDir=aDir;vSeed=aSeed;vDist=length(mv.xyz);}`;
const TRAFFIC_FRAG=`
uniform float cityLights,cityTime,cityHazeScale,cityHazeMax,cityZoom,cityPxAngle;uniform vec3 cityHead,cityTail,cityHaze;varying float vAlong;varying float vDir;varying float vSeed;varying float vDist;
float tcHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
 float k=vAlong/${L.traffic.cell.toFixed(1)}-cityTime*${L.traffic.speed.toFixed(2)}*vDir*mix(.8,1.2,vSeed);
 float id=floor(k),f=fract(k);
 float car=step(tcHash(vec2(id,vSeed*91.)),${L.traffic.fill.toFixed(2)})*smoothstep(.0,.08,f)*(1.-smoothstep(.3,.42,f));
 float px=fwidth(k);car=mix(car,${(L.traffic.fill*.36).toFixed(3)},smoothstep(.25,1.,px));
 vec3 c=vDir>0.?cityHead:cityTail;
 float fog=min(1.-exp(-vDist/(cityHazeScale*(1.+(cityZoom-1.)*${f3(L.zoomClear)}))),cityHazeMax);
 // 한 픽셀이 clearM(m)보다 넓은 땅을 덮으면(1배·먼 곳) 그만큼 어둡게: 많은 도로 선이 한 픽셀에 겹쳐 흰 빛 덩어리가 되지 않게.
 float dense=clamp(${L.traffic.clearM.toFixed(2)}/(vDist*cityPxAngle),0.,1.);
 float a=car*cityLights*(1.-fog*.6)*dense*${L.traffic.gain.toFixed(2)};if(a<.003)discard;
 gl_FragColor=vec4(c*a,1.);}`;
// roads: seoul-surface.json roads([{kind,width,bridge,points:[[x,z]...]}]). heightAt(x,z): 원경 지면 높이(도로 정점과 같은 규칙).
export function trafficGeometry(roads,heightAt,{kinds=L.traffic.kinds,major=L.traffic.major,maxSegment=L.traffic.maxSegment}={}){
 const pos=[],along=[],dir=[],seeds=[];let seed=7,majorCount=0;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
 // 큰 도로(major)를 앞에 둔다: 화질 낮음은 drawRange로 앞부분만 그린다.
 const list=(roads??[]).filter(r=>r.bridge||kinds.test(r.kind??'')),isMajor=r=>major.test(r.kind??'');
 for(const road of [...list.filter(isMajor),...list.filter(r=>!isMajor(r))]){
  if(!isMajor(road)&&!majorCount)majorCount=pos.length/3;
  const lane=Math.max(1.5,(road.width??10)*.25),rs=rand();let s=0;
  for(let i=1;i<road.points.length;i++){
   const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.1)continue;
   const nx=-dz/len,nz=dx/len,steps=Math.max(1,Math.ceil(len/maxSegment));
   const deck=road.bridge?Math.max(24,heightAt(ax,az),heightAt(bx,bz))+3:null;
   for(let j=0;j<steps;j++){
    const t0=j/steps,t1=(j+1)/steps,x0=ax+dx*t0,z0=az+dz*t0,x1=ax+dx*t1,z1=az+dz*t1;
    for(const side of [1,-1]){
     const ox=nx*lane*side,oz=nz*lane*side,y0=deck??heightAt(x0+ox,z0+oz)+2.5,y1=deck??heightAt(x1+ox,z1+oz)+2.5;
     pos.push(x0+ox,y0,z0+oz,x1+ox,y1,z1+oz);along.push(s+len*t0,s+len*t1);dir.push(side,side);seeds.push(rs,rs);
    }
   }
   s+=len;
  }
 }
 if(!pos.length)return null;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aAlong',new THREE.Float32BufferAttribute(along,1));
 g.setAttribute('aDir',new THREE.Float32BufferAttribute(dir,1));g.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));g.computeBoundingSphere();
 g.userData.majorCount=majorCount||pos.length/3;
 return g;
}

// 한강 물빛(카툰): 낮 파스텔 청색에 하늘 반사, 노을 라벤더→살구 반사와 해 쪽 빛길, 밤 짙은 남색에 강변 불빛 세로 반사.
// 물결 무늬는 월드 좌표로만 그린다(화면 좌표 줄무늬 금지). 칸이 픽셀보다 작으면 평균으로 바꾼다.
const RIVER_FRAGMENT=`
{
 vec3 V=normalize(cameraPosition-vTcWorld);float d=vTcDist;
 float fres=pow(1.-clamp(V.y,0.,1.),4.);
 // 시선 방향(수평)과 그 옆 방향: 반사는 시선 쪽으로 길게 늘어진다.
 vec2 fw=normalize(-V.xz+1e-5),side=vec2(-fw.y,fw.x);
 float along=dot(vTcWorld.xz,fw),across=dot(vTcWorld.xz,side);
 // 잔물결 띠(가로 줄): 시선 방향으로 18m 간격, 시간에 따라 조금씩 흐른다.
 float wq=along/18.+cityTime*.08,wid=floor(wq),wf=fract(wq);
 float ripple=step(.72,tcHash(vec2(wid,floor(across/60.))))*smoothstep(.0,.2,wf)*(1.-smoothstep(.45,.65,wf));
 ripple=mix(ripple,.08,smoothstep(.3,1.,fwidth(wq)));
 vec3 dayW=mix(cityRiverDay,cityRiverDaySky,fres*.75+ripple*.25);
 // 노을: 해 쪽으로 빛길(살구), 나머지는 라벤더.
 vec3 sunH=normalize(vec3(citySun.x,0.,citySun.z)+vec3(1e-4,0.,0.));
 float path=pow(max(dot(-V,sunH),0.),6.)*(.6+ripple);
 vec3 duskW=mix(cityRiverSunset,cityRiverSunsetSky,clamp(fres*.6+path*.8,0.,1.));
 // 밤: 강변 불빛이 물결에 세로로 늘어진 반사(옆 방향 9m 칸마다 켜짐·색).
 vec3 nightW=mix(cityRiverNight,cityRiverNightSky,fres*.55);
 float cq=across/9.,cid=floor(cq);
 float col=step(1.-${f3(L.river.streak)},tcHash(vec2(cid,7.)));
 float flick=step(.35,tcHash(vec2(cid,floor(along/14.+cityTime*.6))));
 float streak=col*flick*(1.-smoothstep(.08,.2,abs(fract(cq)-.5)));
 streak=mix(streak,${f3(L.river.streak*.12)},smoothstep(.3,1.,fwidth(cq)));
 vec3 lightC=mix(cityCream,cityPink,step(.75,tcHash(vec2(cid,3.))));
 vec3 c=dayW*cityDay+duskW*citySunset+nightW*cityNight;
 float fog=tcFog(d);c=mix(c,cityHaze,fog);
 c+=lightC*streak*cityLights*${f3(L.river.streakGain)}*(1.-fog*.5);
 diffuseColor.rgb=c;
}`;

export function createCityStyle(){
 const status={materials:0,swapped:0,nightLights:0,dots:0,halos:0,traffic:0,river:0,landmarks:0};
 const materials=new Set();
 const patch=(m,body,key)=>{
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,CITY_UNIFORMS);
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${VERTEX_HEAD}`).replace('#include <project_vertex>',`#include <project_vertex>\n${VERTEX_BODY}`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${FRAGMENT_HEAD}`).replace('#include <color_fragment>',`#include <color_fragment>\n${body}`);
  };
  m.customProgramCacheKey=()=>key;m.userData.shared=true;return m;
 };
 function cityMaterial({side=THREE.DoubleSide}={}){
  const m=patch(new THREE.MeshBasicMaterial({name:'toon-city',color:0xffffff,vertexColors:true,side,fog:false}),FRAGMENT_BODY,'toon-city-v2');
  m.userData.toonCity=true;materials.add(m);status.materials++;return m;
 }
 // 한강: 정점색 없음(seoulInfo·seoulType도 없음 → 0). 같은 정점 앞부분을 쓴다.
 let river=null;
 function riverMaterial(){
  if(river)return river;
  river=patch(new THREE.MeshBasicMaterial({name:'toon-han-river',color:0xffffff,side:THREE.DoubleSide,fog:false}),RIVER_FRAGMENT,'toon-city-river-v1');
  status.river++;return river;
 }
 // 전 도심 공용 덧그림(불빛 점·빛무리·차량 줄기). 첫 apply(root)에 붙인다.
 const extras=new THREE.Group();extras.name='도심 밤 덧그림';extras.userData.toonCityExtras=true;
 const dotMaterial=new THREE.ShaderMaterial({name:'toon-city-dots',uniforms:CITY_UNIFORMS,vertexShader:DOT_VERT,fragmentShader:DOT_FRAG,fog:false});dotMaterial.userData.shared=true;
 const haloMaterial=new THREE.ShaderMaterial({name:'toon-city-halo',uniforms:CITY_UNIFORMS,vertexShader:HALO_VERT,fragmentShader:HALO_FRAG,fog:false,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});haloMaterial.userData.shared=true;
 const trafficMaterial=new THREE.ShaderMaterial({name:'toon-city-traffic',uniforms:CITY_UNIFORMS,vertexShader:TRAFFIC_VERT,fragmentShader:TRAFFIC_FRAG,fog:false,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});trafficMaterial.userData.shared=true;
 const dotParts=[],tall=new Map();let dotsDirty=false,dotsBuiltAt=-1e9;
 const dots=new THREE.Points(new THREE.BufferGeometry(),dotMaterial);dots.name='도심 불빛 점';dots.frustumCulled=false;dots.userData.toonCityDots=true;dots.visible=false;
 const halos=new THREE.Points(new THREE.BufferGeometry(),haloMaterial);halos.name='도심 고층 빛무리';halos.frustumCulled=false;halos.visible=false;halos.renderOrder=2;
 const viewSize=new THREE.Vector2();
 dots.onBeforeRender=halos.onBeforeRender=renderer=>{renderer.getDrawingBufferSize(viewSize);CITY_UNIFORMS.cityViewH.value=viewSize.y;};
 extras.add(dots,halos);
 function rebuildDots(){
  dotsDirty=false;dotsBuiltAt=globalThis.performance?.now?.()??0;
  const n=dotParts.reduce((s,p)=>s+p.aDot.length,0),position=new Float32Array(n*3),aDot=new Float32Array(n),aTall=new Float32Array(n);let o=0;
  for(const p of dotParts){position.set(p.position,o*3);aDot.set(p.aDot,o);aTall.set(p.aTall,o);o+=p.aDot.length;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(position,3));g.setAttribute('aDot',new THREE.BufferAttribute(aDot,1));g.setAttribute('aTall',new THREE.BufferAttribute(aTall,1));
  dots.geometry.dispose();dots.geometry=g;
  const hp=[],hs=[],ht=[];let i=0;
  for(const r of tall.values()){hp.push(r.x/r.n,r.base+r.height*.78,r.z/r.n);hs.push(L.halo.base+r.height*L.halo.scale);ht.push((Math.sin(++i*12.9898)*43758.5453%1+1)%1);}
  const h=new THREE.BufferGeometry();h.setAttribute('position',new THREE.Float32BufferAttribute(hp,3));h.setAttribute('aSize',new THREE.Float32BufferAttribute(hs,1));h.setAttribute('aTone',new THREE.Float32BufferAttribute(ht,1));
  halos.geometry.dispose();halos.geometry=h;status.halos=tall.size;
 }
 function addLightDots(mesh){
  if(mesh.userData.toonCityDots)return;mesh.userData.toonCityDots=true;
  const left=L.dots.total-status.dots;
  const s=sampleCityDots(mesh.geometry,{max:Math.max(0,Math.min(L.dots.max,left))},tall);if(!s){dotsDirty=true;return;}
  dotParts.push(s);status.dots+=s.aDot.length;dotsDirty=true;
 }
 const lightMaterials=new WeakMap();
 // 가로등·다리 불빛 점: 창 불빛과 같은 크림 위주 HDR 색(LIGHT_MIX)으로 바꿔 블룸을 받게 한다.
 function styleNightLight(object){
  object.traverse(o=>{
   const m=o.material;if(!m||Array.isArray(m))return;
   if(!lightMaterials.has(m)){const c=m.clone();c.color?.copy(LIGHT_MIX).multiplyScalar(TOON.city.lampGain);c.toneMapped=true;c.userData={...m.userData,shared:true,toonNightLight:true};
    // 서울 거리 불빛(city-water.js seoulRoadLights: 정점색·더하기 혼합 점). 그대로면 흰 점이 겹쳐 지평선에 흰 띠가 된다.
    // 카툰에서는 크림 위주 톤으로 물들이고, 점을 작게·어둡게 한다. clone()이 uniform을 복사하므로 원래 uniform 객체(cityNight 등)를 다시 잇는다.
    if(m.isShaderMaterial&&/lampSize/.test(m.vertexShader)){
     c.uniforms={...m.uniforms,cityLampTint:{value:LIGHT_MIX},cityLampGain:{value:TOON.city.roadLightGain}};
     c.vertexShader=m.vertexShader.replace('clamp(lampSize*(1.6+zoom*.28)*pixelRatio,1.0,7.0)','clamp(lampSize*(1.6+zoom*.28)*pixelRatio*.6,1.0,4.0)');
     c.fragmentShader=m.fragmentShader.replace('varying vec3 vColor;','uniform vec3 cityLampTint;uniform float cityLampGain;varying vec3 vColor;').replace('vColor*vAlpha*a*1.15','mix(vColor,cityLampTint,.8)*vAlpha*a*cityLampGain');
    }
    lightMaterials.set(m,c);}
   o.material=lightMaterials.get(m);status.nightLights++;
  });
 }
 let traffic=null;
 // 차량 불빛 줄기(load-landscape가 서울 도로를 읽은 뒤 부른다). parent에 선 하나를 붙인다.
 function styleRoads(roads,heightAt,parent=extras){
  if(traffic)return traffic;
  const g=trafficGeometry(roads,heightAt);if(!g)return null;
  traffic=new THREE.LineSegments(g,trafficMaterial);traffic.name='도심 차량 불빛 줄기';traffic.frustumCulled=false;traffic.visible=false;traffic.renderOrder=1;
  parent.add(traffic);status.traffic=g.attributes.position.count/2;return traffic;
 }
 // material: 기존 도시 재질(참고만, 면 방향을 따른다). nightLights: 가로등 Object3D 배열.
 // 반환: {material, apply(root), update(env), styleRoads, riverMaterial}. apply(root)는 지금과 앞으로 추가될(childadded) 도시 칸·랜드마크의 재질을 바꾼다.
 function styleCity({material,nightLights=[]}={}){
  const m=cityMaterial({side:material?.side??THREE.DoubleSide});
  for(const lights of nightLights)styleNightLight(lights);
  const swap=o=>o.traverse(x=>{if(x.isMesh&&!x.isSprite&&x.material!==m&&!x.userData.seoulLabel&&!x.userData.toonCityExtras&&!x.parent?.userData.toonCityExtras){x.material=m;status.swapped++;addLightDots(x);}});
  const roots=[];
  function apply(root){
   if(!extras.parent)root.add(extras);
   swap(root);const listener=e=>{if(e.child!==extras)swap(e.child);};root.addEventListener('childadded',listener);roots.push([root,listener]);return root;
  }
  // 랜드마크(63빌딩·롯데월드타워·남산타워): 도시와 같은 재질(창 격자·밤 불빛)로. 이름표는 그대로.
  function applyLandmark(group){swap(group);status.landmarks++;return group;}
  return {material:m,apply,applyLandmark,update,styleNightLight,styleRoads,riverMaterial,dispose(){for(const [r,l]of roots)r.removeEventListener('childadded',l);m.dispose();materials.delete(m);}};
 }
 const haze=new THREE.Color(),tmp=new THREE.Color(),fogC=new THREE.Color();
 const LOOK_HAZE={day:linear(L.day.haze),sunset:linear(L.sunset.haze),night:linear(L.night.haze)};
 // env: environment.update 결과(elevation·night·city·fogColor·sunVector 등). camera(선택): 쌍안경 배율. quality: 0 낮음 1 균형 2 높음.
 function update(env={},camera=null,quality=2){
  const w=phaseWeights(env),U=CITY_UNIFORMS;
  U.cityDay.value=w.day;U.citySunset.value=w.sunset;U.cityNight.value=w.night;
  // 창 불빛: 해 고도 3°부터 켜지기 시작해 -8°에서 다 켜진다(city-facade.js windowLightAmount와 같은 규칙). 노을에도 일부 켜진다.
  const el=Number.isFinite(env.elevation)?env.elevation:30,t=Math.min(1,Math.max(0,(3-el)/11)),lights=Math.max(env.night??0,env.city??0,t*t*(3-2*t));U.cityLights.value=lights;
  const now=globalThis.performance?.now?.()??0;U.cityTime.value=now/1000;
  if(env.sunVector)U.citySun.value.fromArray(env.sunVector.toArray?env.sunVector.toArray():env.sunVector);
  else if(Number.isFinite(env.azimuth)&&Number.isFinite(env.elevation)){const az=env.azimuth*Math.PI/180,al=env.elevation*Math.PI/180;U.citySun.value.set(Math.sin(az)*Math.cos(al),Math.sin(al),-Math.cos(az)*Math.cos(al));}
  // 연무색: 시간대 연무색(낮 하늘빛·노을 라벤더·밤 남보라)에 환경 연무색을 조금 섞어 주변 땅과 어울리게. 흐린 날은 회색 쪽으로.
  haze.setRGB(0,0,0);for(const k of ['day','sunset','night'])haze.add(tmp.copy(LOOK_HAZE[k]).multiplyScalar(w[k]));
  const fog=env.fogColor??env.haze;if(fog){fogC.setRGB(fog[0],fog[1],fog[2],THREE.SRGBColorSpace);haze.lerp(fogC,.25);}
  const gray=env.gray??0;if(gray>0){const l=haze.r*.2126+haze.g*.7152+haze.b*.0722;haze.lerp(tmp.setRGB(l,l,l),gray*.5);}
  U.cityHaze.value.copy(haze);
  U.cityHazeScale.value=L.day.hazeScale*w.day+L.sunset.hazeScale*w.sunset+L.night.hazeScale*w.night;
  U.cityHazeMax.value=L.day.hazeMax*w.day+L.sunset.hazeMax*w.sunset+L.night.hazeMax*w.night;
  U.cityHaloGain.value=L.halo.gain*Math.max(lights,0)*(1-w.sunset*(1-L.halo.dusk))*(1-gray*.5);
  if(camera){const zoom=Math.max(1,camera.zoom||1);U.cityZoom.value=zoom;U.cityPxAngle.value=2*Math.tan((camera.fov??60)*Math.PI/360)/Math.max(1,U.cityViewH.value)/zoom;}
  // 불빛 점·빛무리는 새 도시 칸이 들어오면 0.5초에 한 번만 다시 묶는다.
  if(dotsDirty&&now-dotsBuiltAt>500)rebuildDots();
  dots.visible=lights>.02&&status.dots>0;halos.visible=U.cityHaloGain.value>.0005&&status.halos>0;
  if(traffic){traffic.visible=lights>.02;const g=traffic.geometry;g.setDrawRange(0,quality===0?g.userData.majorCount:Infinity);}
  U.cityDotKeep.value=quality===0?L.dots.lowKeep:1;
 }
 return {styleCity,update,status,riverMaterial,styleRoads,extras};
}
