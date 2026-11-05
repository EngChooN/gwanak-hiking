import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {patchFoliage as patchRealFoliage,foliageUniforms,foliageKind} from '../../assets/realistic/foliage-shader.js';
import {TOON,TRAIL_KINDS,hexToRgb} from './palette.js';
import {installToonLightCap} from './light-cap.js';

const linear=hex=>new THREE.Color().setRGB(...hexToRgb(hex),THREE.SRGBColorSpace);
// 카툰 재질이 함께 읽는 uniform(바람결 색 물결). 시간은 실사와 같은 foliageUniforms.foliageTime을 쓴다.
export const TOON_UNIFORMS={
 toonWaveA:{value:linear(TOON.foliage.waveA)},
 toonWaveB:{value:linear(TOON.foliage.waveB)},
 toonWindDir:{value:new THREE.Vector2(.8,.6)},
 toonWaveSpeed:{value:1.2},
 toonWaveStrength:{value:1},
};
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

 // ── 지형: 경사·고도·정점색 기반. 완경사 풀밭/숲은 녹색 덩어리, 급경사·능선은 회색 바위. ──
 let terrainMaterial;
 function terrain({vertexColors=false}={}){
  if(terrainMaterial&&terrainMaterial.vertexColors===vertexColors)return terrainMaterial;
  const t=TOON.terrain,m=share(toon({color:0xffffff,vertexColors,name:'toon-terrain'}));
  const c=k=>linear(t[k]),u={tMeadow:{value:c('meadow')},tForest:{value:c('forest')},tHigh:{value:c('highForest')},tRock:{value:c('rock')},tSoil:{value:c('soil')}};
  m.userData.toonUniforms=u;
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,u);bindWave(shader);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTtWorld;varying float vTtUp;')
    .replace('#include <project_vertex>','#include <project_vertex>\n'+worldVarying('Tt'));
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vTtWorld;varying float vTtUp;uniform vec3 tMeadow,tForest,tHigh,tRock,tSoil;
    ${WAVE_UNIFORMS_GLSL}\n${WAVE_GLSL}
    float ttBlob(vec2 p){return sin(p.x*.011+sin(p.y*.017)*1.7)*.55+sin(p.y*.009-p.x*.004+1.3)*.45;}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
    {
     float slope=1.-clamp(vTtUp,0.,1.),h=vTtWorld.y,blob=ttBlob(vTtWorld.xz);
     // 숲 덩어리: 낮은 주파수 얼룩을 좁은 폭으로 끊어 붓 터치처럼 덩어리지게 한다.
     float forest=smoothstep(-.12,-.04,blob)*(1.-smoothstep(${t.ridgeHeight.toFixed(1)},${(t.ridgeHeight+60).toFixed(1)},h));
     vec3 green=mix(tMeadow,tForest,forest);
     green=mix(green,tHigh,smoothstep(${t.forestHeight.toFixed(1)},${(t.forestHeight+40).toFixed(1)},h)*.6);
     green=mix(green,toonWaveColor(vTtWorld)*.9,(1.-forest)*.18*toonWaveStrength);
     // 바위 판정(실사 terrain-material.js의 경사·고도·노두 규칙을 카툰 경계로): 0.5를 넘으면 회색 화강암 단색 면.
     //  경사: rockSlope(약 44°)에서 0.5. 암반 얼룩(outcrop, 약 30~80m)이 경계를 들쭉날쭉하게 민다.
     //  고도: rockHeight 위는 얼룩이 짙은 곳부터 암반, summitHeight 위(연주대 정상부)는 거의 전부 암반.
     float landPatch=.5+.25*sin(vTtWorld.x*.23+sin(vTtWorld.z*.19)*2.)+.25*sin(vTtWorld.z*.08+vTtWorld.x*.09);
     float outcrop=smoothstep(.36,.76,landPatch);
     float slopeRock=slope*${(.5/t.rockSlope).toFixed(4)}+(outcrop-.5)*.3;
     float altitude=smoothstep(${t.rockHeight[0].toFixed(1)},${t.rockHeight[1].toFixed(1)},h);
     float altRock=altitude*(.3+.6*outcrop)+smoothstep(${t.summitHeight[0].toFixed(1)},${t.summitHeight[1].toFixed(1)},h)*.3;
     float rockT=max(slopeRock,altRock)+blob*.02,rockW=max(fwidth(rockT),.004);
     float rock=smoothstep(.5-rockW,.5+rockW,rockT);
     // 화강암 절벽의 가로 결(층리) — 두 톤으로 끊어 애니풍 바위 면을 만든다. 평평한 암반은 등고선 띠 대신 얼룩 두 톤.
     float strataT=fract(h/3.2+blob*.35+sin(vTtWorld.x*.05)*.15),strataW=min(.5,fwidth(h/3.2)*1.5);
     // 멀어져 결이 픽셀보다 촘촘해지면 평균 톤으로(모아레 방지).
     float strata=mix(smoothstep(.55-strataW,.55+strataW,strataT),.45,smoothstep(.15,.45,strataW));
     float slabT=sin(vTtWorld.x*.71+sin(vTtWorld.z*.53)*1.3)*.5+.5+(landPatch-.5)*.6,slabW=max(fwidth(slabT),.004);
     float slab=mix(smoothstep(.55-slabW,.55+slabW,slabT),.45,smoothstep(.15,.45,slabW));
     float steep=smoothstep(.2,.4,slope);
     vec3 base=mix(green,tRock*mix(mix(.92,1.04,slab),mix(.9,1.05,strata),steep),rock);
     float soilW=max(fwidth(slope),.004);
     base=mix(base,tSoil,smoothstep(.3-soilW,.3+soilW,slope)*(1.-rock)*.35);
     diffuseColor.rgb*=base;
    }`);
  };
  m.customProgramCacheKey=()=>`toon-terrain-v2-${vertexColors}`;
  return terrainMaterial=m;
 }

 const trails=new Map();
 function trail(kind='soil'){
  if(!TOON.trail[kind])kind='soil';
  if(!trails.has(kind))trails.set(kind,share(toon({name:`toon-trail-${kind}`,color:linear(TOON.trail[kind]),side:kind==='stairs'||kind==='deck_stairs'?THREE.DoubleSide:THREE.FrontSide})));
  return trails.get(kind);
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
   bindWave(shader);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${WAVE_UNIFORMS_GLSL}`)
    .replace('#include <opaque_fragment>',`float twFres=pow(1.-abs(dot(normalize(vViewPosition),normal)),3.);
     float twBand=step(.82,sin(vViewPosition.x*.9+foliageTime*1.4)*.5+.5)*.18;
     outgoingLight+=vec3(.85,.95,1.)*(twFres*.35+twBand);
     #include <opaque_fragment>`);
  };
  waterMaterial.customProgramCacheKey=()=> 'toon-water-v1';
  return waterMaterial;
 }
 // load-landscape.js의 materials 객체와 같은 키(manifest 재질 7종 + paved/stoneStairs/woodStairs).
 // 실사 쪽은 materials.stone.clone() 후 onBeforeCompile을 옮겨 쓰므로 단색 툰 재질도 그대로 동작한다.
 let materialSet;
 function materials(){
  if(materialSet)return materialSet;
  const t=TOON.terrain,tr=TOON.trail;
  materialSet={
   soil:basic(linear(tr.soil)),stone:basic(linear(tr.rock)),granite:basic(linear(t.rock)),leaves:basic(linear('#6f7f3e')),
   grass:basic(linear(t.meadow)),wood:basic(linear(tr.deck_stairs)),bark:basic(linear('#6b4e36')),
   paved:trail('paved'),stoneStairs:trail('stairs'),woodStairs:trail('deck_stairs'),
  };
  return materialSet;
 }
 // ribbon()에 넘기는 노면 재질 묶음({soil,rock,paved,stairs,deck_stairs,ridge}).
 const pathMaterials=()=>Object.fromEntries(TRAIL_KINDS.map(k=>[k,trail(k)]));
 const materialFactory={terrain,trail,basic,water,materials,pathMaterials,gradientMap};

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
