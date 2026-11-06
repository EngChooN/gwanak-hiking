import * as THREE from 'three';
import {hexToRgb} from './palette.js';
// 계절 모습(산풍경, 2026-11-06): 봄 벚꽃 · 여름(지금) · 가을 단풍 · 겨울 앙상한 가지와 쌓인 눈.
// 텍스처를 쓰지 않는다. 모든 계절 재질이 같은 uniform(tsW = 봄·여름·가을·겨울 가중치)을 읽고 색·모양을 셰이더에서 바꾼다.
// 값만 바뀌므로 셰이더를 다시 컴파일하거나 자산을 다시 읽지 않는다(게임 중 바꿔도 다시 로딩되지 않는다).
// 색: docs/관악산-계절-자료.md §6 팔레트(화면 sRGB 제안값)를 여름 잎과 같은 비율로 재질색으로 옮긴다.
//     비율은 대표 지시대로 실제 식생 비율이 아니라 보자마자 계절을 알 수 있는 전형(분홍 벚꽃, 붉은·주황·노란 단풍, 흰 눈).
export const SEASON_INDEX={spring:0,summer:1,autumn:2,winter:3};
export const SEASON_UNIFORMS={tsW:{value:new THREE.Vector4(0,1,0,0)}};

const lin=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
const luma=c=>c.r*.2126+c.g*.7152+c.b*.0722;
const glsl=c=>`vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;
// 화면색(자료 §6) → 재질색: 여름 잎 재질색(#7cba48·#467f2c)이 화면에서 #61973b·#3f7124로 보이는 비율을 그대로 곱한다.
const LIT_GAIN=luma(lin('#7cba48'))/luma(lin('#61973b')),SHADE_GAIN=luma(lin('#467f2c'))/luma(lin('#3f7124'));
const pair=(lit,shade)=>({lit:lin(lit).multiplyScalar(LIT_GAIN),shade:lin(shade).multiplyScalar(SHADE_GAIN)});

// 화면 기준 팔레트(sRGB). 가을 단풍은 자료 §6 색을 쓰되 붉은색을 조금 더 맑게 했다(화면에서 갈색에 묻히지 않게).
export const SEASON_PALETTE={
 cherry:['#f7cbd8','#dc9bb1'],cherryPale:['#f6dee3','#d2b0b9'],newLeaf:['#9cc95c','#719a3f'],azalea:['#f08cb4','#c4628a'],
 red:['#d24a30','#943222'],orange:['#d68f38','#9a652a'],brown:['#b07a3e','#80582c'],yellow:['#e2b434','#a68226'],
 pine:['#4f7a3a','#36562a'],bark:['#5f554c','#433b35'],twig:['#8d8079','#6a5f5b'],
 snow:['#d2dbe8','#aebdd4'],trampled:['#a8a49f','#857f78'],litter:['#9a6e42','#704f30'],petal:['#f1d6dc','#f1d6dc'],
};
// 단풍 비율(활엽수): 붉음 · 주황 · 갈색 · 노랑 · 초록(늦게 물듦). 누적 문턱으로 쓴다.
export const AUTUMN_MIX={red:.34,orange:.26,brown:.16,yellow:.21,green:.03};
// 벚나무 비율: 낮은 곳(입구 광장·계곡 아래, 고도 ~250m) → 높은 곳(능선 450m~).
export const CHERRY_SHARE={low:.36,high:.14,lowHeight:250,highHeight:450};
// 눈·밟힌 눈·꽃잎은 잎이 아니라 땅·바위 위에 칠하므로 잎 비율을 곱하지 않는다(곱하면 눈이 1을 넘어 화면이 번진다).
const RAW=new Set(['snow','trampled','litter','petal','bark']);
const P=Object.fromEntries(Object.entries(SEASON_PALETTE).map(([k,[a,b]])=>[k,RAW.has(k)?{lit:lin(a),shade:lin(b)}:pair(a,b)]));

// 지형·풀·덤불·바닥 재질 uniform 값(재질색). index.js가 가중치로 섞어 넣는다(셰이더 상수가 아닌 값이라 다시 컴파일하지 않는다).
export const SEASON_TERRAIN={
 summer:null, // 지금 값(palette.js TOON.terrain) 그대로
 spring:{meadow:'#b2dc80',meadowFar:'#b2d39c',forest:'#6a9c44',highForest:'#7cab55'},
 autumn:{meadow:'#c8b56c',meadowFar:'#bab18c',forest:'#a2672f',highForest:'#ab7c3e'},
 winter:{meadow:'#b3a58a',meadowFar:'#b9b3ab',forest:'#7d6e68',highForest:'#887b76'},
};
// 길가·숲 바닥 풀(patchFoliage 물결색 toonWaveA·B).
export const SEASON_WAVE={summer:null,spring:['#b8dc72','#78a84c'],autumn:['#e2c25c','#b48a3e'],winter:['#e2ddd2','#b9ab90']};
// 풀 다발(nature.js 풀·카메라 둘레 풀밭): 밑동·끝 색.
export const SEASON_GRASS={summer:null,spring:['#6aa452','#b8de74'],autumn:['#9a7a3a','#e0bc62'],winter:['#cbd4e0','#a8987c']};

// 공통 GLSL: uniform 선언과 계절 색 함수. 나무·풀·지형·바위·길이 함께 쓴다.
export const SEASON_GLSL=`
uniform vec4 tsW;
float tsH(float x){return fract(sin(x*91.345+3.17)*47453.5453);}
float tsLuma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
// 여름 잎의 밝은 면·그늘 사이 위치(0~1.3)로 계절 색 짝을 칠한다(덩어리 명암·잎 그늘을 그대로 옮긴다).
vec3 tsPair(float t,vec3 lit,vec3 shade){return mix(shade,lit,t);}
vec3 tsAutumn(float h,float t){
 return h<${AUTUMN_MIX.red.toFixed(3)}?tsPair(t,${glsl(P.red.lit)},${glsl(P.red.shade)}):
  h<${(AUTUMN_MIX.red+AUTUMN_MIX.orange).toFixed(3)}?tsPair(t,${glsl(P.orange.lit)},${glsl(P.orange.shade)}):
  h<${(AUTUMN_MIX.red+AUTUMN_MIX.orange+AUTUMN_MIX.brown).toFixed(3)}?tsPair(t,${glsl(P.brown.lit)},${glsl(P.brown.shade)}):
  h<${(1-AUTUMN_MIX.green).toFixed(3)}?tsPair(t,${glsl(P.yellow.lit)},${glsl(P.yellow.shade)}):vec3(-1.);
}
float tsCherry(float h,float y){return step(h,mix(${CHERRY_SHARE.low.toFixed(3)},${CHERRY_SHARE.high.toFixed(3)},smoothstep(${CHERRY_SHARE.lowHeight.toFixed(1)},${CHERRY_SHARE.highHeight.toFixed(1)},y)));}
vec3 tsSpringLeaf(float t,float h,float y){return mix(tsPair(t,${glsl(P.newLeaf.lit)},${glsl(P.newLeaf.shade)}),tsPair(t,${glsl(P.cherry.lit)},${glsl(P.cherry.shade)}),tsCherry(h,y));}
// 활엽수 잎: c = 여름 정점색, t = 밝은 면 위치, h = 나무 난수, y = 나무 밑동 높이(m).
vec3 tsLeafColor(vec3 c,float t,float h,float y){
 vec3 spring=tsSpringLeaf(t,h,y);
 vec3 a=tsAutumn(fract(h*7.13+.21),t);vec3 autumn=a.x<0.?c:a;
 return c*tsW.y+spring*tsW.x+autumn*tsW.z+c*tsW.w;
}
// 덤불·생울타리 잎: 봄은 새잎 연두에 진달래 분홍 약 20%, 가을은 단풍 섞임.
vec3 tsBushColor(vec3 c,float t,float h){
 vec3 spring=mix(tsPair(t,${glsl(P.newLeaf.lit)},${glsl(P.newLeaf.shade)}),tsPair(t,${glsl(P.azalea.lit)},${glsl(P.azalea.shade)}),step(fract(h*3.71),.2));
 vec3 a=tsAutumn(fract(h*5.31+.6),t);vec3 autumn=a.x<0.?c:a;
 return c*(tsW.y+tsW.w)+spring*tsW.x+autumn*tsW.z;
}
const vec3 TS_SNOW=${glsl(P.snow.lit)};const vec3 TS_SNOW_SHADE=${glsl(P.snow.shade)};
const vec3 TS_BARK=${glsl(P.bark.lit)};const vec3 TS_TWIG=${glsl(P.twig.lit)};const vec3 TS_TWIG_SHADE=${glsl(P.twig.shade)};
const vec3 TS_PINE=${glsl(P.pine.lit)};const vec3 TS_PINE_SHADE=${glsl(P.pine.shade)};
const vec3 TS_TRAMPLED=${glsl(P.trampled.lit)};const vec3 TS_TRAMPLED_SHADE=${glsl(P.trampled.shade)};
const vec3 TS_PETAL=${glsl(lin(SEASON_PALETTE.petal[0]))};
const vec3 TS_RED=${glsl(P.red.lit)};const vec3 TS_ORANGE=${glsl(P.orange.lit)};const vec3 TS_YELLOW=${glsl(P.yellow.lit)};const vec3 TS_BROWN=${glsl(P.brown.lit)};
// 지형 셰이더가 그리는 중경 수관 덩어리 하나의 색(summer = 여름 색). 잎 재질보다 어둡게 둔다(원경 숲 톤).
vec3 tsCrown(vec3 summer,float h,float y){
 vec3 a=tsAutumn(fract(h*7.13+.21),.45);a=a.x<0.?summer:a*.72;
 return summer*tsW.y+tsSpringLeaf(.45,h,y)*.72*tsW.x+a*tsW.z+mix(TS_TWIG_SHADE,TS_TWIG,.35)*.8*tsW.w;
}
// 바위 이끼: 가을엔 누런 올리브, 겨울엔 마른 회갈색(초록 이끼가 눈·단풍 사이에서 튀지 않게).
vec3 tsMossTint(vec3 m){return m*(tsW.x+tsW.y)+m*vec3(1.2,.74,.42)*tsW.z+mix(m,vec3(.3,.28,.25),.8)*tsW.w;}
// 값 잡음. 해시는 sin을 쓰지 않는다(좌표가 수천 m라 sin 해시는 GPU 정밀도에서 넓은 곳이 한 값으로 뭉친다).
float tsHash2(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float tsN2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(tsHash2(i),tsHash2(i+vec2(1,0)),f.x),mix(tsHash2(i+vec2(0,1)),tsHash2(i+vec2(1,1)),f.x),f.y);}
// 쌓인 눈 양(0~1): 위를 향한 면(up)일수록, 겨울 가중치만큼. 가장자리는 잡음으로 굽힌다. 가파른 면(약 45° 이상)은 맨 바위.
float tsSnowCover(vec3 wp,float up,float lo,float hi){
 float n=tsN2(wp.xz*.55+wp.y*.3)*.6+tsN2(wp.xz*2.1+7.)*.4;
 return tsW.w*smoothstep(lo,hi,up+(n-.5)*.22);
}
// 길바닥에 떨어진 꽃잎(봄)·낙엽(가을): 잎 크기 칸마다 일부만 색을 얹는다. 반환 = (색, 양).
vec4 tsLitter(vec2 xz,float dist,float y){
 float fade=1.-smoothstep(18.,45.,dist);if(fade<=0.||tsW.x+tsW.z<.01)return vec4(0.);
 vec2 q=xz*3.2,ci=floor(q),f=fract(q)-.5;float h=fract(sin(dot(ci,vec2(41.3,289.1)))*15731.743);
 // 잎 하나: 칸 안 아무 자리, 아무 방향의 길쭉한 타원(크기 0.6~1배). 일정한 물방울 무늬로 보이지 않게.
 vec2 o=vec2(fract(h*13.7),fract(h*29.1))-.5,v=f-o*.45;float an=h*40.,ca=cos(an),sa=sin(an);v=mat2(ca,-sa,sa,ca)*v;
 float d=length(v*vec2(1.,2.3))/(.6+.4*fract(h*3.3));float leaf=1.-smoothstep(.15,.19,d);
 float autumn=leaf*step(h,.3)*tsW.z,spring=leaf*step(h,.13)*tsW.x*(1.-smoothstep(${CHERRY_SHARE.lowHeight.toFixed(1)},${CHERRY_SHARE.highHeight.toFixed(1)},y));
 float k=fract(h*7.7);vec3 ac=k<.35?TS_RED:k<.65?TS_ORANGE:k<.85?TS_YELLOW:TS_BROWN;
 float a=(autumn+spring)*fade;
 return vec4((ac*autumn+TS_PETAL*spring)/max(autumn+spring,1e-3),a);
}
`;
// 재질 onBeforeCompile에서 부른다: 같은 uniform 객체를 넘겨 한 번 바꾸면 모든 재질이 함께 바뀐다.
export const bindSeason=shader=>{shader.uniforms.tsW=SEASON_UNIFORMS.tsW;};
export const seasonColors=P;
export function seasonTarget(name){const v=[0,0,0,0];v[SEASON_INDEX[name]??1]=1;return v;}

// 가중치를 목표 계절 쪽으로 부드럽게 옮긴다(약 1.2초). 겨울 잎 숨김·가지 보임은 가중치 0.5에서 바뀐다.
export function createSeasonBlend({tau=1.2}={}){
 const target=new THREE.Vector4(0,1,0,0),u=SEASON_UNIFORMS.tsW.value;let name='summer',snap=true;
 return {
  set(next){if(!(next in SEASON_INDEX))return false;name=next;target.fromArray(seasonTarget(next));return true;},
  // 처음 한 번(로딩 중)은 바로 맞춘다.
  snap(){snap=true;},
  update(dt){
   if(snap){u.copy(target);snap=false;return u;}
   const k=1-Math.exp(-Math.max(0,Math.min(dt,.5))/tau);u.lerp(target,k);
   if(Math.abs(u.x-target.x)+Math.abs(u.y-target.y)+Math.abs(u.z-target.z)+Math.abs(u.w-target.w)<1e-3)u.copy(target);
   return u;
  },
  get name(){return name;},get weights(){return u.toArray().map(v=>Math.round(v*1000)/1000);},
 };
}
// 재질 uniform 색을 계절 가중치로 섞는다. base: 여름 색(THREE.Color), table: {spring,autumn,winter} hex(없으면 여름).
export function mixSeasonColor(out,base,table,w){
 out.setRGB(0,0,0);const tmp=new THREE.Color();
 ['spring','summer','autumn','winter'].forEach((k,i)=>{const hex=table?.[k];tmp.copy(hex?lin(hex):base);out.r+=tmp.r*w[i];out.g+=tmp.g*w[i];out.b+=tmp.b*w[i];});
 return out;
}
export const seasonLinear=lin;
