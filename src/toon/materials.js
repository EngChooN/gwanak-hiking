import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {patchFoliage as patchRealFoliage,foliageUniforms,foliageKind} from '../../assets/realistic/foliage-shader.js';
import {TOON,TRAIL_KINDS,hexToRgb} from './palette.js';
import {createGradientMap} from './gradient.js';
import {installToonLightCap} from './light-cap.js';
import {ROCK_CELL_GLSL,ROCK_BASE_DECL,rockShadeGLSL} from './rock-shade.js';
import {BRUSH_GLSL} from './brush.js';

const linear=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
// 셰이더 상수로 넣는 선형 색: vec3(r,g,b).
const vec3=hex=>{const c=linear(hex);return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;};
// 카툰 재질이 함께 읽는 uniform(바람결 색 물결). 시간은 실사와 같은 foliageUniforms.foliageTime을 쓴다.
export const TOON_UNIFORMS={
 toonWaveA:{value:linear(TOON.foliage.waveA)},
 toonWaveB:{value:linear(TOON.foliage.waveB)},
 toonWindDir:{value:new THREE.Vector2(.8,.6)},
 toonWaveSpeed:{value:1.2},
 toonWaveStrength:{value:1},
};
// 한강 물 하늘 반사색(시간대별, index.js update가 넣는다). 밤에 흰 반사가 블룸으로 번지지 않게 하늘색·세기를 따른다.
export const TOON_WATER_SKY={value:new THREE.Color(.85,.95,1)};
const share=m=>{m.userData.shared=true;return m;};
const luma=c=>c.r*.2126+c.g*.7152+c.b*.0722;
// 카툰 바위 GLB 단색들(#503d2a~#756644)의 선형 명도 평균. 이보다 밝은 바위는 조금 밝게, 어두운 바위는 조금 어둡게.
const ROCK_GLB_MEAN_LUMA=.1;
// 캔버스·이미지 텍스처의 평균색(선형). 8×8로 줄여 읽는다. DOM이 없거나(node) 읽을 수 없으면 null.
export function textureAverage(texture){
 const img=texture?.image;
 if(!img||typeof document==='undefined'||!(img.width>0))return null;
 try{
  const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,8,8);
  const d=x.getImageData(0,0,8,8).data;let r=0,g=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
  const n=d.length/4*255,color=new THREE.Color();
  return texture.colorSpace===THREE.SRGBColorSpace?color.setRGB(r/n,g/n,b/n,THREE.SRGBColorSpace):color.setRGB(r/n,g/n,b/n,THREE.LinearSRGBColorSpace);
 }catch{return null;}
}

// 바람 방향 사인 물결(연두↔청록). 월드 xz에서 계산해 풀밭 전체에 같은 결이 흐른다.
const WAVE_GLSL=`
vec3 toonWaveColor(vec3 world){
 float along=dot(world.xz,toonWindDir);
 float wave=sin(along*.045-foliageTime*toonWaveSpeed)*.62+sin(along*.13+world.x*.017-foliageTime*toonWaveSpeed*1.7)*.38;
 return mix(toonWaveA,toonWaveB,wave*.5+.5);
}`;
const WAVE_UNIFORMS_GLSL='uniform vec3 toonWaveA;uniform vec3 toonWaveB;uniform vec2 toonWindDir;uniform float toonWaveSpeed;uniform float toonWaveStrength;uniform float foliageTime;';
const bindWave=shader=>Object.assign(shader.uniforms,TOON_UNIFORMS,{foliageTime:foliageUniforms.foliageTime});
// 월드 위치·월드 법선 y를 프래그먼트로 넘긴다(인스턴싱 포함). project_vertex 뒤라 바람 변형이 반영된 위치다.
const worldVarying=(prefix)=>`
{
 vec4 ${prefix}W=vec4(transformed,1.);vec3 ${prefix}N=objectNormal;
 #ifdef USE_INSTANCING
 ${prefix}W=instanceMatrix*${prefix}W;${prefix}N=mat3(instanceMatrix)*${prefix}N;
 #endif
 v${prefix}World=(modelMatrix*${prefix}W).xyz;v${prefix}Up=normalize(mat3(modelMatrix)*${prefix}N).y;
}`;

export function createToonMaterials({gradientMap}){
 const status={converted:0,reused:0,blobs:0,cutoutMeshes:0,skipped:0,foliage:0,localLightCap:installToonLightCap()};
 const toon=(params={})=>new THREE.MeshToonMaterial({gradientMap,...params});

 // ── 식생: 기존 바람 버텍스 셰이더 유지 + 바람결 색 물결 + 위밝음/아래어둠 ──
 // kind: grass(풀밭)·needle(솔잎 _twig)·leaf·card·bark. wind=false면 실사 바람 셰이더를 붙이지 않는다
 // (길가 풀처럼 이미 자기 바람 셰이더가 있는 재질 — 같은 uniform을 두 번 선언하면 컴파일이 깨진다).
 function patchFoliage(material,{name=material?.name??'',kind,pine=false,wind=true}={}){
  if(!material||material.userData.toonFoliage)return material;
  // 어린 소나무(pine_sapling)는 정상·길가에 수천 그루 깔려 길가 풀 덤불로 읽힌다. 솔잎·잔가지를 풀밭색으로(줄기만 갈색).
  const auto=foliageKind(name),leafKind=kind??(/grass|풀/.test(name)||/^pine_sapling.*_(twig|dead_branches)$/.test(name)?'grass':/_twig$/.test(name)?'needle':auto);
  // 실사 셰이더는 card를 줄기 아닌 잎판으로 본다. 카툰에서 card/leaf는 잎, grass는 풀밭.
  if(wind)patchRealFoliage(material,{name:leafKind==='grass'?'grass_leaves':name,pine});
  const F=TOON.foliage,flat={grass:F.grassFlat,needle:F.needleFlat}[leafKind];
  // 풀·솔잎은 원래 명도와 무관하게 물결색을 칠한다(어두운 원색이 갈색 덩어리로 뜨지 않게).
  const strength=leafKind==='bark'?0:flat?flat.strength:F.leafWave;
  const tone=flat?`vec3(${flat.brightness.toFixed(3)})`:'vec3(clamp(tfLuma*2.4,.3,1.25))';
  const shade=leafKind==='bark'?[.9,1.04]:[F.bottom,F.top];
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);bindWave(shader);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTfWorld;varying float vTfUp;')
    .replace('#include <project_vertex>','#include <project_vertex>\n'+worldVarying('Tf'));
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vTfWorld;varying float vTfUp;\n${WAVE_UNIFORMS_GLSL}\n${WAVE_GLSL}`)
    .replace('#include <alphamap_fragment>',`
     {
      // 잎은 텍스처 디테일 대신 덩어리 단색: 명도만 남기고 물결색을 섞는다.
      float tfLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      vec3 tfWave=toonWaveColor(vTfWorld)*${tone};
      diffuseColor.rgb=mix(diffuseColor.rgb,tfWave,${strength.toFixed(3)}*toonWaveStrength);
      diffuseColor.rgb*=mix(${shade[0].toFixed(3)},${shade[1].toFixed(3)},clamp(vTfUp*.5+.5,0.,1.));
     }
     #include <alphamap_fragment>`);
   // 풀잎은 외곽선 제외 표시(알파 .5, 불투명 재질만). 외곽선 패스가 이 표시를 읽는다.
   if(leafKind==='grass'&&!material.transparent)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\n gl_FragColor.a=min(gl_FragColor.a,.5);');
  };
  material.customProgramCacheKey=()=>`${previousKey()}|toon-foliage-v1-${leafKind}`;
  material.userData.toonFoliage={kind:leafKind,strength};material.needsUpdate=true;status.foliage++;
  return material;
 }

 // ── 지형(3단계): 완만한 사면은 풀밭·숲 덩어리, 급한 사면·고지 암반은 회백색 암벽(가로 층·큰 얼룩), 바위 턱 위엔 풀. ──
 // 경계는 값 잡음(fbm) 덩어리로 끊는다. 사인 띠 무늬는 멀리서 줄·소용돌이로 이어 보여 쓰지 않는다(정상 사면 수정 때 교훈).
 // 먼 곳은 무늬를 평균 톤으로 접고, 풀밭은 멀수록 밝고 푸르게(기준값 §2-7). 먼 산을 푸르게 녹이는 건 index.js의 낮 연무.
 let terrainMaterial,terrainGradient;
 function terrain({vertexColors=false}={}){
  if(terrainMaterial&&terrainMaterial.vertexColors===vertexColors)return terrainMaterial;
  // 땅은 부드러운 3단(0.6/0.82/1.0): 해를 등진 사면이 짙은 띠로 끊기지 않게(「야생의 숨결」 풀밭 사면은 명암 차가 작다).
  terrainGradient??=createGradientMap(TOON.terrainGradient);
  const t=TOON.terrain,m=share(toon({color:0xffffff,vertexColors,name:'toon-terrain',gradientMap:terrainGradient}));
  const c=k=>linear(t[k]),u={tMeadow:{value:c('meadow')},tMeadowFar:{value:c('meadowFar')},tForest:{value:c('forest')},tHigh:{value:c('highForest')},tRock:{value:c('rock')},tRockDark:{value:c('rockDark')},tSoil:{value:c('soil')},tMoss:{value:linear(TOON.nature.moss)},tMossDark:{value:linear(TOON.nature.mossDark)}};
  m.userData.toonUniforms=u;
  const f=v=>v.toFixed(4);
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,u);bindWave(shader);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTtWorld;varying float vTtUp;varying vec3 vTtN;')
    .replace('#include <project_vertex>','#include <project_vertex>\n'+worldVarying('Tt')+'\nvTtN=normalize(mat3(modelMatrix)*objectNormal);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vTtWorld;varying float vTtUp;varying vec3 vTtN;uniform vec3 tMeadow,tMeadowFar,tForest,tHigh,tRock,tRockDark,tSoil,tMoss,tMossDark;
    ${ROCK_CELL_GLSL}${ROCK_BASE_DECL}${BRUSH_GLSL}
    ${WAVE_UNIFORMS_GLSL}\n${WAVE_GLSL}
    float ttHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float ttNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(ttHash(i),ttHash(i+vec2(1,0)),f.x),mix(ttHash(i+vec2(0,1)),ttHash(i+vec2(1,1)),f.x),f.y);}
    float ttFbm(vec2 p){return ttNoise(p)*.58+ttNoise(p*2.13+vec2(5.2,1.3))*.28+ttNoise(p*4.71+vec2(1.7,9.2))*.14;}
    // 경계 폭을 화면 미분으로 잡아 계단·깜빡임 없이 두 톤으로 끊는다.
    float ttCut(float x,float at){float w=max(fwidth(x),.004);return smoothstep(at-w,at+w,x);}
    float ttRockMask=0.;vec3 ttBumpN=vec3(0.,1.,0.);`)
    .replace('#include <color_fragment>',`#include <color_fragment>
    {
     vec2 xz=vTtWorld.xz;float slope=1.-clamp(vTtUp,0.,1.),h=vTtWorld.y,dist=length(vViewPosition);
     // 먼 곳(픽셀보다 잘아지는 무늬)은 평균으로 접는다.
     float farFade=smoothstep(500.,1800.,dist);
     // ① 풀밭: 가까이 연두 → 멀리 밝고 푸른 연두. 바람결 줄무늬는 가까운 풀밭에만 약하게.
     vec3 meadow=mix(tMeadow,tMeadowFar,smoothstep(120.,1400.,dist));
     meadow=mix(meadow,toonWaveColor(vTtWorld)*1.02,.14*toonWaveStrength*(1.-smoothstep(60.,400.,dist)));
     // ② 숲 덩어리(약 ${t.forestScale}m): 능선 위로는 줄어든다. 숲 안은 덩어리 명암 두 톤.
     float blob=ttFbm(xz/${f(t.forestScale)});
     // 중경(정상에서 내려다보는 250m~ 사면)은 관악산 실제처럼 숲이 사면 대부분을 덮는다(참고 05_14: 짙은 녹색 나무 무리).
     float midWood=smoothstep(250.,900.,dist)*(1.-smoothstep(${f(t.ridgeHeight)},${f(t.ridgeHeight+60)},h));
     float forestT=mix(blob,.5,farFade*.5)+slope*.35-smoothstep(${f(t.ridgeHeight)},${f(t.ridgeHeight+80)},h)*.3+midWood*.3;
     float forest=ttCut(forestT,.5);
     // 가까운 숲 바닥(풀밭이 덮는 거리)은 짙은 숲색 대신 풀밭색 쪽으로(길가·풀 틈에 짙은 띠가 보이지 않게, 참고 01_12·01_23).
     float nearFloor=1.-smoothstep(45.,160.,dist);
     // 수관 명암: 가까이는 나무 몇 그루 크기, 중경(정상에서 내려다보는 사면)은 숲 덩어리 크기(약 45m)로 둥글게 끊는다.
     float canopy=mix(ttCut(ttFbm(xz/14.+3.1),.55),ttCut(ttFbm(xz/45.+1.7),.52),smoothstep(150.,700.,dist));
     canopy=mix(canopy,.4,smoothstep(1800.,3200.,dist));
     vec3 green=mix(meadow,tForest*mix(1.08,.8,canopy),forest*(1.-nearFloor*.7));
     // 중경 나무 무리: 둥근 수관 덩어리 하나하나가 해 쪽은 밝고 아래·틈은 짙다(참고 05_14). 가까이(~900m)는 약 24m,
     // 더 멀리는 나무 무리 약 60m. 덩어리가 픽셀보다 작아지면 숲 평균 톤으로 접는다. 낮 연무를 지나도 짙은 녹색이 남게 바탕을 낮춘다.
     float woodMask=0.;vec3 wood=vec3(0.);
     if(midWood>0.)for(int layer=0;layer<2;layer++){
      float sc=layer==0?24.:60.,lw=layer==0?1.-smoothstep(700.,1100.,dist):smoothstep(700.,1100.,dist);
      vec2 cq=xz/sc+float(layer)*13.1,ci=floor(cq),cf=fract(cq),best=vec2(0.);float d1=8.;
      for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y)),o=g+vec2(ttHash(ci+g),ttHash(ci+g+19.7))*.7+.15-cf;float d=dot(o,o);if(d<d1){d1=d;best=o;}}
      float rr=sqrt(d1),crown=1.-smoothstep(.34,.6,rr),lit=smoothstep(-.15,.3,dot(-best,normalize(vec2(-.55,-.8)))+.1);
      float fade=1.-smoothstep(.25,.6,max(fwidth(cq).x,fwidth(cq).y));
      wood+=lw*tForest*vec3(.86,1.06,.62)*mix(.42,mix(.66,.96,lit),crown);woodMask+=lw*fade;
     }
     green=mix(green,wood,midWood*forest*woodMask);
     green=mix(green,tForest*vec3(.86,1.06,.62)*.66,midWood*forest*(1.-woodMask));
     // 아주 먼 사면만 숲·풀밭 대비를 줄인다(원경은 덩어리 하나의 녹색 톤 + 안개). 중경 숲은 짙게 남긴다.
     green=mix(green,mix(meadow,tForest*.86,.78),smoothstep(1000.,2800.,dist)*.5*(1.-midWood*.8));
     green=mix(green,tHigh,smoothstep(${f(t.forestHeight)},${f(t.forestHeight+50)},h)*.45*(1.-forest*.5));
     // 붓질 그라데이션(카툰 2차, 참고 03_03·03_08·05_19): 풀밭·숲 바닥에 바람 방향 짧은 붓 자국(밝은 자국은 노란 연두,
     // 어두운 자국은 푸른 녹색) + 수십 m 크기의 칠 얼룩. 붓 자국이 픽셀보다 잘아지면 접는다.
     float bpx=dist*.0014/max(vTtUp,.3);
     float bs1=bsStroke(xz,toonWindDir,${f(t.brushNear)})*bsFade(bpx,${f(t.brushNear)});
     float bs2=bsStroke(xz*vec2(1.,1.)+vec2(31.,7.),normalize(vec2(-toonWindDir.y,toonWindDir.x)*.4+toonWindDir),${f(t.brushMid)})*bsFade(bpx,${f(t.brushMid)});
     float bwash=(ttFbm(xz/34.+vec2(2.,5.))-.5)*2.*(1.-smoothstep(900.,2400.,dist));
     float bt=bs1*.55+bs2*.45;
     green*=1.+bt*${f(t.brushAmount)}+bwash*${f(t.washAmount)};
     green=mix(green,green*vec3(1.07,1.05,.86),clamp(bt+bwash*.5,0.,1.)*.45);
     green=mix(green,green*vec3(.9,.98,1.06),clamp(-bt,0.,1.)*.35);
     // ③ 암반: 경사 rockSlope(약 44°)에서 0.5. 고지(rockHeight 위)는 덩어리 얼룩이 짙은 곳부터, 정상부는 거의 전부.
     float rn=mix(ttFbm(xz/${f(t.rockScale)}+vec2(3.7,8.1)),.5,farFade);
     float slopeRock=slope*${f(.5/t.rockSlope)}+(rn-.5)*.32;
     float altRock=smoothstep(${f(t.rockHeight[0])},${f(t.rockHeight[1])},h)*(.22+.62*smoothstep(.35,.75,rn))+smoothstep(${f(t.summitHeight[0])},${f(t.summitHeight[1])},h)*.3;
     float rock=ttCut(max(slopeRock,altRock),.5);
     // 암벽 톤: 큰 얼룩 두 톤 + 급한 면의 가로 층(단 높이 약 3.2m, 짙은 띠). 멀어지면 평균 톤.
     // 높이도 섞어 세로 절벽면에서도 얼룩이 생기게 한다(수평 좌표만 쓰면 절벽에 세로 줄만 남는다).
     // 야숨 바위 칠(재판정, 참고 04_19·04_20·04_09): 회색 바탕 + 어두운 녹회 얼룩 + 이끼(trcPaint). 가로 층 띠·붓 줄무늬는 쓰지 않는다
     // (평평한 암반 바닥에서 쓸린 줄무늬·헤링본으로 읽혔다). 먼 곳은 얼룩을 평균 톤으로 접는다.
     float steep=smoothstep(.3,.55,slope);
     // 둥근 암괴: 셀 법선 굴곡(그늘 면은 조명 단계에서). 셀은 세로로 조금 길다. 갈라짐 선·셀 경계 그늘은 쓰지 않는다(육각 그물 방지).
     // 셀 크기는 경사와 무관하게 고정한다(겹쳐 그려지는 지형 조각끼리 무늬가 달라지면 점무늬가 생긴다).
     // 뒷면(접힌 급경사 면)은 법선을 뒤집는다. 안 그러면 굴곡 법선이 화면 법선과 정반대가 되어 섞을 때 0이 된다(점무늬).
     vec3 wn=normalize(vTtN);if(!gl_FrontFacing)wn=-wn;
     // 접힌 삼각형(정점 법선과 실제 면 방향이 크게 어긋남)에서는 굴곡·그늘 면을 끈다. 그런 면은 명암이 점점이 깨진다.
     vec3 gN=normalize(cross(dFdx(vTtWorld),dFdy(vTtWorld)));float ttStable=smoothstep(.55,.8,abs(dot(gN,wn))),px=trcPixel(vTtWorld,gN);
     vec3 stone=tRock;float ttMoss=0.;
     if(rock>.001){
      float crk;ttBumpN=trcBump(vTtWorld,wn,vec3(5.,6.,5.),mix(.25,.8,steep),px,crk);trcOcc=1.;
      stone=trcPaint(vTtWorld,wn,tRock,tRockDark,tMoss,tMossDark,px,mix(-.12,-.1,steep),ttMoss);
      stone=mix(stone,tRock*.92,farFade);ttMoss*=1.-farFade;
     }
     // 바위 턱 위의 풀 띠: 완만한 암반 윗면에서, 등고선을 따라 길게(턱을 따라 띠로 덮인다).
     float ledgeN=ttFbm(vec2(h/2.2,dot(xz,vec2(.71,.71))/28.)+vec2(7.,2.))*.6+ttFbm(xz/6.+vec2(3.,9.))*.4;
     // 능선·정상의 완만한 암반은 풀밭과 반쯤 섞인다(참고 04_16·05_18: 회색 암반 사이 연두 풀밭, 05_14: 풀 덮인 정상에 바위가 흩어짐).
     // 평평한 바닥은 등고선 잡음이 한 면 전체에서 같아지므로, 수 m 크기 평면 얼룩을 섞어 암반 자리와 풀밭 자리가 번갈아 나오게 한다.
     float patchN=ttFbm(xz/6.5+vec2(4.,1.))*.6+ttFbm(xz/2.3+vec2(8.,3.))*.4;
     float ledge=(1.-smoothstep(.2,.36,slope))*ttCut(mix(ledgeN,patchN,.8),mix(.53,.47,smoothstep(${f(t.summitHeight[0])},${f(t.summitHeight[1])},h)));
     stone=mix(stone,green,ledge*.95);
     vec3 base=mix(green,stone,rock);ttRockMask=rock*(1.-ledge*.95)*(1.-ttMoss*.8)*ttStable;
     // 흙: 숲 밖의 중간 경사만 옅게.
     base=mix(base,tSoil,ttCut(slope,.3)*(1.-rock)*(1.-forest)*.25);
     diffuseColor.rgb*=base;
    }`)
    // 암벽 그늘은 녹청 회색(기준 #54665e): 그늘 면이 받는 간접광에만 녹청 기운을 준다.
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     trcBaseN=normal;if(ttRockMask>0.)normal=normalize(mix(normal,(viewMatrix*vec4(ttBumpN,0.)).xyz,ttRockMask));`)
    .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
     reflectedLight.indirectDiffuse*=mix(vec3(1.),vec3(${TOON.nature.rockShadeTint.join(',')}),ttRockMask);
     ${rockShadeGLSL('ttRockMask',TOON.nature.rockShadeDirect.toFixed(3))}`);
  };
  m.customProgramCacheKey=()=>`toon-terrain-v6-paint-${vertexColors}`;
  return terrainMaterial=m;
 }
 // 상시 바닥(NearDEM8m)용: 같은 지형 셰이더에 깊이 밀기만 더한다. 정밀 청크와 거의 겹치는 급경사에서 청크가 이기게 한다.
 const underlays=new WeakMap();
 function terrainUnderlay(source=terrain()){
  if(!underlays.has(source)){
   const u=source.clone();u.onBeforeCompile=source.onBeforeCompile;u.customProgramCacheKey=source.customProgramCacheKey;
   u.userData={...source.userData,shared:true,toonUnderlay:true};u.polygonOffset=true;u.polygonOffsetFactor=4;u.polygonOffsetUnits=8;
   underlays.set(source,u);
  }
  return underlays.get(source);
 }

 // ── 바위 면(3단계 재작업): 암릉·바위 노면, 돌판, 계곡 암반. 단색 판 대신 둥근 암괴 명암·갈라짐·녹청 그늘 면. ──
 function patchRockSurface(m,{cell=[3.2,2.6,3.2],amt=.8,crack:crackAmt=.7,edge=false,moss=-.32}={}){
  m.onBeforeCompile=shader=>{
   // edge: 노면 띠(trailEdge −1~1)의 가장자리를 굽은 잡음 경계로 잘라 낸다. 직선 모서리 판(콘크리트 단)이 아니라
   // 아래 지형 암반 속으로 녹아드는 둥근 암반 자리처럼 보이게(보행 접지는 지오메트리 그대로).
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTsWorld;varying float vTsUp;varying vec3 vTsN;'+(edge?'attribute float trailEdge;varying float vTsSide;':''))
    .replace('#include <project_vertex>','#include <project_vertex>\n'+worldVarying('Ts')+'\nvTsN=normalize(mat3(modelMatrix)*objectNormal);'+(edge?'vTsSide=trailEdge;':''));
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vTsWorld;varying float vTsUp;varying vec3 vTsN;vec3 tsBumpN=vec3(0.,1.,0.);float tsFlat=0.,tsMoss=0.;${ROCK_BASE_DECL}${edge?'varying float vTsSide;':''}
    ${ROCK_CELL_GLSL}${BRUSH_GLSL}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
     ${edge?`{
      vec3 ew=trcWarp(vTsWorld*vec3(.55,.3,.55)+1.7)+trcWarp(vTsWorld*vec3(1.6,.8,1.6)+5.3)*.45;
      float thr=max(.34,.62+ew.x*.55+ew.z*.25);if(abs(vTsSide)>thr)discard;
      // 가장자리 띠에서는 굴곡·그늘 면을 접어 아래 지형 암반과 같은 밝기로 이어지게 한다(경계에 단이 보이지 않게).
      tsFlat=smoothstep(thr-.45,thr-.02,abs(vTsSide));
     }`:''}
     {
      // 재판정(참고 04_20): 둥근 암괴 굴곡(갈라짐 선·셀 경계 그늘 없음) + 지형 암반과 같은 칠(회색 바탕·어두운 얼룩·이끼).
      vec3 wn=normalize(vTsN);if(!gl_FrontFacing)wn=-wn;float px=trcPixel(vTsWorld,wn),crk;
      tsBumpN=trcBump(vTsWorld,wn,vec3(${cell.map(v=>v.toFixed(2)).join(',')}),${amt.toFixed(2)}*.8*(1.-tsFlat),px,crk);trcOcc=1.;
      vec3 tsBase=diffuseColor.rgb;
      diffuseColor.rgb=trcPaint(vTsWorld,wn,diffuseColor.rgb,${vec3(TOON.nature.rockDark)},${vec3(TOON.nature.moss)},${vec3(TOON.nature.mossDark)},px,${moss.toFixed(2)},tsMoss);
      ${edge?'// 노면은 얼룩을 절반으로(짙은 얼룩이 발밑에서 구멍·웅덩이처럼 읽히지 않게).\n      diffuseColor.rgb=mix(diffuseColor.rgb,tsBase,.5*(1.-tsMoss));':''}
     }`)
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     ${edge?`// 노면 리본은 마디마다 기울어 툰 명암·그늘 면이 마디째 어두운 띠로 떨어진다(정상 길이 계단처럼 보였다). 바탕 법선을 위로 세운다.
     {vec3 up=(viewMatrix*vec4(0.,1.,0.,0.)).xyz;normal=normalize(mix(normal,up,.85));tsBumpN=normalize(mix(tsBumpN,vec3(0.,1.,0.),.6));}`:''}
     trcBaseN=normal;normal=normalize((viewMatrix*vec4(tsBumpN,0.)).xyz);`)
    .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
     reflectedLight.indirectDiffuse*=mix(vec3(${TOON.nature.rockShadeTint.join(',')}),vec3(1.),max(tsFlat,tsMoss*.8));
     ${rockShadeGLSL('(1.-tsFlat)*(1.-tsMoss*.8)',TOON.nature.rockShadeDirect.toFixed(3))}`);
  };
  m.customProgramCacheKey=()=>`toon-rock-surface-v4-paint-${cell.join('_')}-${amt}-${crackAmt}-${edge}-${moss}`;m.userData.toonRockSurface=true;
  return m;
 }
 const rocks=new Map();
 function rock(color=linear(TOON.nature.rock),params={},opts={}){
  const key=`${new THREE.Color(color).getHexString()}|${JSON.stringify(params)}|${JSON.stringify(opts)}`;
  if(!rocks.has(key))rocks.set(key,share(patchRockSurface(toon({name:'toon-rock-surface',color,...params}),opts)));
  return rocks.get(key);
 }
 const ROCK_TRAILS=new Set(['rock','ridge']);
 const trails=new Map();
 function trail(kind='soil'){
  if(!TOON.trail[kind])kind='soil';
  if(!trails.has(kind)){
   const m=share(toon({name:`toon-trail-${kind}`,color:linear(TOON.trail[kind]),side:kind==='stairs'||kind==='deck_stairs'?THREE.DoubleSide:THREE.FrontSide}));
   // 암릉·바위 노면은 평평한 베이지 판으로 보이지 않게 암괴 명암을 넣는다(노면은 낮은 굴곡).
   // 셀은 발밑 기준으로 잘게, 굴곡은 낮게(높으면 그늘 면이 발밑에 짙은 웅덩이 자국으로 남는다), 가장자리는 굽은 잡음 경계.
   // 노면은 지형과 거의 같은 높이라 지형 삼각형이 군데군데 뚫고 올라와 직선 교차선(판 모서리)이 생긴다 → 노면을 앞으로 당긴다.
   if(ROCK_TRAILS.has(kind)){patchRockSurface(m,{cell:[1.7,1.4,1.7],amt:.45,crack:.2,edge:true,moss:-.45});m.polygonOffset=true;m.polygonOffsetFactor=-2;m.polygonOffsetUnits=-6;if(kind==='ridge')m.visible=false;}
   else if(kind==='soil'||kind==='paved')patchTrailBrush(m,{ragged:kind==='soil'});
   trails.set(kind,m);
  }
  return trails.get(kind);
 }
 // 흙길·포장길 붓질(카툰 2차, 참고 01_11·01_16·03_17): 길을 따라 그은 붓 자국 + 가운데 밟힌 밝은 띠 + 가장자리 어두운 테.
 // ragged: 가장자리를 굽은 잡음 경계로 잘라 풀밭으로 녹인다(자로 그은 띠가 아니게). 보행 접지는 지오메트리 그대로.
 function patchTrailBrush(m,{ragged=false}={}){
  m.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trailEdge;varying float vTbSide;varying vec2 vTbUv;varying vec3 vTbWorld;')
    .replace('#include <project_vertex>','#include <project_vertex>\nvTbSide=trailEdge;vTbUv=uv;vTbWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying float vTbSide;varying vec2 vTbUv;varying vec3 vTbWorld;\n${BRUSH_GLSL}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
     {
      float side=abs(vTbSide),dist=length(vViewPosition),px=dist*.0014/max(abs(normalize(vViewPosition).y),.2);
      ${ragged?`float thr=.8+(bsNoise(vTbWorld.xz*.9)-.5)*.3+(bsNoise(vTbWorld.xz*3.1+5.)-.5)*.12;if(side>thr)discard;`:'float thr=1.;'}
      // 길 방향 좌표(uv.y = s/metres)로 붓을 길게 긋는다. 자국 폭 .35m.
      vec2 tp=vec2(vTbUv.y*4.,vTbUv.x*4.);
      float st=bsStroke(tp,vec2(1.,0.),.35)*bsFade(px,.35)*.6+bsStroke(tp*.35+9.,vec2(1.,.15),.6)*bsFade(px,1.7)*.4;
      diffuseColor.rgb*=1.+st*.2;
      diffuseColor.rgb*=mix(1.06,.86,smoothstep(.25,thr,side));
     }`)
    // 길 리본은 지형을 따라 마디마다 조금씩 기울어, 툰 3단 명암에서 한 마디가 통째로 어두운 단으로 떨어진다
    // (정상·침엽수 장면에서 길을 가로지르는 어두운 띠가 계단처럼 보였다). 법선을 위쪽으로 거의 세워 길 전체를 고른 밝기로 칠한다.
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     normal=normalize(mix(normal,(viewMatrix*vec4(0.,1.,0.,0.)).xyz,.85));`);
  };
  m.customProgramCacheKey=()=>`toon-trail-brush-v2-${ragged}`;m.userData.toonTrailBrush=true;
  return m;
 }
 const basics=new Map();
 function basic(color=0xffffff,params={}){
  const key=`${new THREE.Color(color).getHexString()}|${JSON.stringify(params)}`;
  if(!basics.has(key))basics.set(key,share(toon({name:'toon-basic',color,...params})));
  return basics.get(key);
 }
 let waterMaterial;
 function water(){
  if(waterMaterial)return waterMaterial;
  waterMaterial=share(toon({name:'toon-water',color:linear(TOON.water),transparent:true,opacity:.86}));
  // 하늘을 비추는 띠: 시선이 낮을수록 밝게(애니풍 단순 반사).
  waterMaterial.onBeforeCompile=shader=>{
   bindWave(shader);shader.uniforms.toonWaterSky=TOON_WATER_SKY;
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${WAVE_UNIFORMS_GLSL}\nuniform vec3 toonWaterSky;`)
    .replace('#include <opaque_fragment>',`float twFres=pow(1.-abs(dot(normalize(vViewPosition),normal)),3.);
     float twBand=step(.82,sin(vViewPosition.x*.9+foliageTime*1.4)*.5+.5)*.18;
     outgoingLight+=toonWaterSky*(twFres*.35+twBand);
     #include <opaque_fragment>`);
  };
  waterMaterial.customProgramCacheKey=()=> 'toon-water-v2';
  return waterMaterial;
 }
 // load-landscape.js의 materials 객체와 같은 키(manifest 재질 7종 + paved/stoneStairs/woodStairs).
 // 실사 쪽은 materials.stone.clone() 후 onBeforeCompile을 옮겨 쓰므로 단색 툰 재질도 그대로 동작한다.
 let materialSet;
 function materials(){
  if(materialSet)return materialSet;
  const t=TOON.terrain,tr=TOON.trail;
  materialSet={
   soil:basic(linear(tr.soil)),stone:rock(linear(tr.rock)),granite:rock(linear(t.rock)),leaves:basic(linear('#6f7f3e')),
   grass:basic(linear(t.meadow)),wood:basic(linear(tr.deck_stairs)),bark:basic(linear('#6b4e36')),
   paved:trail('paved'),stoneStairs:trail('stairs'),woodStairs:trail('deck_stairs'),
  };
  return materialSet;
 }
 // ribbon()에 넘기는 노면 재질 묶음({soil,rock,paved,stairs,deck_stairs,ridge}).
 const pathMaterials=()=>Object.fromEntries(TRAIL_KINDS.map(k=>[k,trail(k)]));
 const materialFactory={terrain,terrainUnderlay,trail,basic,rock,water,materials,pathMaterials,gradientMap};

 // ── toonify: Standard/Physical/Basic(·Lambert·Phong) → MeshToonMaterial ──
 // 풀잎 재질은 customProgramCacheKey로 알아본다: near-detail.js 길가 풀·관목 'roadside-{grass|shrub}-wind-*',
 // forest-layers.js 숲 바닥 풀잎 'forest-blades-wind-*'(흰 재질 + 황갈색 instanceColor). 둘 다 자기 바람 셰이더가 있다.
 const groundCover=src=>/^(roadside-(grass|shrub)|forest-blades)-/.test(src.customProgramCacheKey?.()??'');
 // 바위 GLB(assets/toon/nature의 rock_*·boulder_*·mountainside): 갈색 단색 → 화강암 회색, 원래 명도 차이만 조금 남긴다.
 const isRockModel=name=>/^(rock_|boulder_|mountainside)/.test(name??'');
 const graniteBase=linear(TOON.rock.granite);
 function graniteTone(m){
  const ratio=THREE.MathUtils.clamp(luma(m.color)/ROCK_GLB_MEAN_LUMA,1-TOON.rock.spread,1+TOON.rock.spread);
  m.color.copy(graniteBase).multiplyScalar(ratio);m.userData.toonRock=true;
 }
 // 절차 캔버스 텍스처 색을 흰 틴트로 받는 바닥(광장 블록·아스팔트, entrance-plaza.js). GLB 텍스처는 여전히 버린다.
 // 텍스처를 버리면 틴트(#ffeedd)만 남아 밝은 단색으로 뜬다.
 // 텍스처 평균색을 바탕색으로 쓰고, 텍스처 명도를 3단(어두움·보통·밝음)으로 끊은 약한 무늬를 가까이에만 얹는다.
 const isPatternFloor=src=>!!src.map?.isCanvasTexture&&!(src.alphaTest>0)&&!src.transparent&&luma(src.color)>.6;
 function patternFloor(m,src){
  const P=TOON.pattern,avg=textureAverage(src.map);
  // 흰 틴트(#ffeedd)는 warmth만큼만 남기고, 툰 3단 음영에서 텍스처 결이 빠진 만큼 명도를 올려 석재 톤으로 둔다.
  const base=avg?avg.clone().multiply(new THREE.Color(1,1,1).lerp(src.color,P.warmth)):src.color.clone().multiplyScalar(.12);
  const l=luma(base),target=THREE.MathUtils.clamp(l*P.gain,P.minLuma,P.maxLuma);base.multiplyScalar(target/Math.max(l,1e-4));
  m.color.copy(base);m.map=src.map;m.userData.toonPattern=true;
  const avgLuma=Math.max(.02,avg?luma(avg):.3);
  m.onBeforeCompile=shader=>{
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
    #ifdef USE_MAP
    {
     float tpRatio=dot(texture2D(map,vMapUv).rgb,vec3(.2126,.7152,.0722))/${avgLuma.toFixed(4)};
     float tpDark=1.-smoothstep(${(P.dark-.03).toFixed(3)},${(P.dark+.03).toFixed(3)},tpRatio),tpLight=smoothstep(${(P.light-.03).toFixed(3)},${(P.light+.03).toFixed(3)},tpRatio);
     float tpTone=mix(1.,${P.darkTone.toFixed(3)},tpDark)*mix(1.,${P.lightTone.toFixed(3)},tpLight),tpFade=1.-smoothstep(${P.fadeNear.toFixed(1)},${P.fadeFar.toFixed(1)},length(vViewPosition));
     diffuseColor.rgb*=mix(1.,tpTone,tpFade*${P.amount.toFixed(3)});
    }
    #endif`);
  };
  m.customProgramCacheKey=()=>`toon-pattern-floor-v1-${avgLuma.toFixed(4)}`;
 }
 const cache=new WeakMap();
 const convertible=m=>m&&!m.isMeshToonMaterial&&!m.isShaderMaterial&&(m.isMeshStandardMaterial||m.isMeshBasicMaterial||m.isMeshLambertMaterial||m.isMeshPhongMaterial);
 function convert(src,{kind,keepMaps=false}={}){
  if(!convertible(src)){status.skipped++;return src;}
  let byKind=cache.get(src);if(!byKind)cache.set(src,byKind=new Map());
  const key=`${kind??''}|${keepMaps}`;
  if(byKind.has(key)){status.reused++;return byKind.get(key);}
  const {foliagePatched,...userData}=src.userData??{};
  const m=toon({
   name:src.name,color:src.color?.clone()??new THREE.Color(1,1,1),vertexColors:src.vertexColors,
   alphaTest:src.alphaTest,transparent:src.transparent,opacity:src.opacity,side:src.side,
   depthWrite:src.depthWrite,depthTest:src.depthTest,fog:src.fog,visible:src.visible,
   alphaMap:src.alphaMap??null,map:keepMaps?src.map??null:null,
   emissive:src.emissive?src.emissive.clone():new THREE.Color(0),emissiveIntensity:src.emissiveIntensity??1,emissiveMap:keepMaps?src.emissiveMap??null:null,
   polygonOffset:src.polygonOffset,polygonOffsetFactor:src.polygonOffsetFactor,polygonOffsetUnits:src.polygonOffsetUnits,
  });
  // 실사 GLB를 그대로 받은 경우에도 잎판은 알파 텍스처를 남겨 잘린 모양을 지킨다(색 디테일은 버림).
  if(!keepMaps&&src.map&&src.alphaTest>0&&!src.alphaMap){m.alphaMap=src.map;m.userData.alphaFromMap=true;}
  m.userData={...m.userData,...userData,toonSource:src.uuid,toonKind:kind??null,shared:true};
  if(groundCover(src)){
   // 길가·숲 바닥 풀: 자기 바람 셰이더를 그대로 잇고 색만 카툰 풀밭(연두↔청록)으로. 외곽선은 긋지 않는다.
   m.onBeforeCompile=src.onBeforeCompile;const srcKey=src.customProgramCacheKey.bind(src);m.customProgramCacheKey=()=>srcKey();
   patchFoliage(m,{name:src.name,kind:'grass',wind:false});
  }else if(kind==='foliage'||kind==='grass'||foliagePatched)patchFoliage(m,{name:src.name,pine:foliagePatched?.pine,kind:kind==='grass'?'grass':undefined});
  else if(!keepMaps&&isRockModel(src.name))graniteTone(m);
  else if(!keepMaps&&isPatternFloor(src))patternFloor(m,src);
  byKind.set(key,m);status.converted++;
  return m;
 }

 // 잎 카드(MASK, 텍스처 없음)는 단색 사각형이 되므로 잎판 범위를 덮는 덩어리 메시로 바꾼다.
 const blobs=new WeakMap();
 const LUMPS=[[0,.05,0,1],[.42,-.18,.22,.72],[-.38,-.12,-.3,.74],[.05,-.22,.45,.66]];
 function foliageBlob(geometry){
  if(blobs.has(geometry))return blobs.get(geometry);
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  const box=geometry.boundingBox,center=box.getCenter(new THREE.Vector3()),half=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const parts=LUMPS.map(([x,y,z,r],i)=>{
   const g=new THREE.IcosahedronGeometry(1,1);g.deleteAttribute('uv');
   const p=g.attributes.position;
   for(let k=0;k<p.count;k++){
    const vx=p.getX(k),vy=p.getY(k),vz=p.getZ(k),bump=1+.08*Math.sin(vx*5.1+vy*3.7+vz*4.3+i*1.7);
    p.setXYZ(k,center.x+half.x*(x+vx*r*bump*.62),center.y+half.y*(y+vy*r*bump*.6),center.z+half.z*(z+vz*r*bump*.62));
   }
   return g;
  });
  const merged=mergeVertices(mergeGeometries(parts));parts.forEach(g=>g.dispose());
  merged.computeVertexNormals();merged.computeBoundingBox();merged.computeBoundingSphere();
  merged.name=`${geometry.name||'leaves'}-toon-blob`;merged.userData.shared=true;
  blobs.set(geometry,merged);status.blobs++;
  return merged;
 }
 const isCutout=m=>m?.userData?.toonAlphaCutout===true;

 function toonify(root,{kind,keepMaps=false}={}){
  if(!root)return root;
  root.traverse(o=>{
   if(!o.isMesh||o.isLine||o.isPoints)return;
   const list=Array.isArray(o.material)?o.material:[o.material];
   if(!o.isSkinnedMesh&&list.length===1&&isCutout(list[0])){
    // 인스턴싱·instanceColor는 같은 메시를 쓰므로 그대로 유지된다.
    o.geometry=foliageBlob(o.geometry);status.cutoutMeshes++;
    o.material=blobMaterial(convert(list[0],{kind:'foliage',keepMaps}));o.userData.toonBlob=true;return;
   }
   const next=list.map(m=>convert(m,{kind,keepMaps}));
   o.material=Array.isArray(o.material)?next:next[0];
  });
  return root;
 }
 const blobMats=new WeakMap();
 function blobMaterial(m){
  if(!blobMats.has(m)){const b=m.clone();b.alphaTest=0;b.alphaMap=null;b.transparent=false;b.side=THREE.FrontSide;b.onBeforeCompile=m.onBeforeCompile;b.customProgramCacheKey=()=>`${m.customProgramCacheKey()}|blob`;b.userData={...m.userData,shared:true};blobMats.set(m,b);}
  return blobMats.get(m);
 }
 return {materialFactory,toonify,convert,patchFoliage,status};
}
