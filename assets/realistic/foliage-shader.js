import {MeshStandardMaterial,DoubleSide} from 'three';
// 나무 잎 재질 공통 보정: 11월 잎 색 입히기, 잎 사이 투과광(역광), 바람에 흔들리는 잎.
// 인스턴스 색(forestTint)은 "잎이 될 색"이다. 텍스처 명도에 입혀 단풍색을 만들고 줄기·가지는 거의 물들이지 않는다.
// 기존 onBeforeCompile(소나무 바늘잎 검은 여백 자르기 등)을 먼저 실행한 뒤 덧붙인다.
export const foliageUniforms={foliageTime:{value:0}};
export function foliageKind(name=''){
 if(/_(leaves|twig)$/.test(name))return 'leaf';
 if(/(branch|trunk|bark|dead)/.test(name))return 'bark';
 return 'card';
}
// recolor: 잎 텍스처를 인스턴스 색으로 바꾸는 정도. 소나무는 상록이라 약하게 준다.
export function patchFoliage(material,{name=material.name,pine=false}={}){
 if(!material||material.userData.foliagePatched)return material;
 const kind=foliageKind(name),previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey?.bind(material);
 const recolor=pine?.55:1,transmission=kind==='bark'?0:pine?.45:.85,sway=kind==='bark'?0:kind==='leaf'?1:.35;
 material.userData.foliagePatched={kind,pine,recolor,transmission,sway};
 material.onBeforeCompile=function(shader,renderer){
  previous?.call(this,shader,renderer);
  shader.uniforms.foliageTime=foliageUniforms.foliageTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float foliageTime;\nvarying vec3 vFoliageTint;').replace('#include <begin_vertex>',`#include <begin_vertex>
   // 인스턴스 색이 있는 나무만 잎 색을 입힌다. 입구 표본처럼 색이 없으면 원래 텍스처를 쓴다.
   #ifdef USE_INSTANCING_COLOR
   vFoliageTint=instanceColor.rgb;
   #else
   vFoliageTint=vec3(-1.);
   #endif
   #ifdef USE_INSTANCING
   {
    // 줄기 아래는 고정하고 위로 갈수록 크게, 잎 끝은 빠르게 떨린다. 나무마다 위상이 다르다.
    vec3 foliageAnchor=instanceMatrix[3].xyz;
    float foliageHeight=max(0.,position.y);
    float foliageGust=sin(foliageTime*1.1+foliageAnchor.x*.07+foliageAnchor.z*.05)*.6+sin(foliageTime*2.3+foliageAnchor.z*.11)*.4;
    float foliageFlutter=sin(foliageTime*5.7+dot(position,vec3(3.1,2.3,2.7)));
    transformed.x+=(${(.006*sway).toFixed(4)}*foliageGust*foliageHeight)+${(.012*sway).toFixed(4)}*foliageFlutter*min(foliageHeight,1.);
    transformed.z+=(${(.004*sway).toFixed(4)}*foliageGust*foliageHeight)+${(.009*sway).toFixed(4)}*foliageFlutter*min(foliageHeight,1.);
   }
   #endif`);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nfloat foliageLeafMask=0.;\nvarying vec3 vFoliageTint;')
   .replace('#include <color_fragment>',`
    // 초록 성분이 강한 텍셀을 잎으로 본다. 잎 재질은 전체를 잎으로 둔다.
    vec3 foliageTexel=diffuseColor.rgb;
    float foliageGreen=smoothstep(.004,.05,foliageTexel.g-max(foliageTexel.r,foliageTexel.b)*.8);
    foliageLeafMask=${kind==='bark'?'0.':kind==='leaf'?'max(.85,foliageGreen)':'foliageGreen'};
    #include <color_fragment>
    if(vFoliageTint.r>=0.){
     float foliageLuma=dot(foliageTexel,vec3(.2126,.7152,.0722));
     // 잎은 텍스처 명도×잎 색, 줄기는 원래 텍스처를 살짝 따뜻하게(인스턴스 색이 줄기를 주황으로 칠하지 않게).
     vec3 foliageLeaf=vFoliageTint*foliageLuma*2.6;
     vec3 foliageBark=foliageTexel*vec3(1.,.97,.93);
     diffuseColor.rgb=mix(foliageBark,mix(foliageTexel*vFoliageTint,foliageLeaf,${recolor.toFixed(2)}),foliageLeafMask);
    }`)
   .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    #if NUM_DIR_LIGHTS > 0 && ${transmission>0?1:0}
    {
     // 해를 등진 잎이 비쳐 보이는 투과광. 시선이 해 쪽을 향할수록, 잎 뒷면이 해를 받을수록 밝다.
     vec3 foliageL=directionalLights[0].direction,foliageV=normalize(vViewPosition);
     float foliageBack=pow(clamp(dot(-foliageV,foliageL),0.,1.),4.);
     float foliageThrough=clamp(-dot(normal,foliageL),0.,1.);
     vec3 foliageGlow=diffuseColor.rgb*vec3(1.,.93,.7)*directionalLights[0].color*(foliageBack*.9+foliageThrough*.28);
     reflectedLight.directDiffuse+=foliageGlow*foliageLeafMask*${transmission.toFixed(2)};
    }
    #endif`);
 };
 material.customProgramCacheKey=()=>`${previousKey?.()??''}|foliage-v1-${kind}-${pine?'pine':'broad'}`;
 material.needsUpdate=true;
 return material;
}

// 덤불층 재질: 인스턴스 색 × 잎판 층 명도, 줄기 아래를 고정한 바람 흔들림, 역광 투과광.
export function shrubMaterial(){
 const material=new MeshStandardMaterial({color:0xffffff,roughness:.92,envMapIntensity:.35,side:DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.foliageTime=foliageUniforms.foliageTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float foliageTime;\nattribute float shrubShade;\nvarying float vShrubShade;').replace('#include <begin_vertex>',`#include <begin_vertex>
   vShrubShade=shrubShade;
   #ifdef USE_INSTANCING
   vec3 shrubAnchor=instanceMatrix[3].xyz;float shrubTip=position.y*position.y;
   transformed.x+=sin(foliageTime*1.4+shrubAnchor.x*.13+shrubAnchor.z*.09)*shrubTip*.07+sin(foliageTime*6.1+dot(position,vec3(7.,5.,6.)))*.012*position.y;
   transformed.z+=sin(foliageTime*1.05+shrubAnchor.z*.11)*shrubTip*.05;
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vShrubShade;')
   .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=vShrubShade;')
   .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    #if NUM_DIR_LIGHTS > 0
    {
     vec3 shrubL=directionalLights[0].direction,shrubV=normalize(vViewPosition);
     float shrubBack=pow(clamp(dot(-shrubV,shrubL),0.,1.),4.),shrubThrough=clamp(-dot(normal,shrubL),0.,1.);
     reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.,.92,.7)*directionalLights[0].color*(shrubBack*.8+shrubThrough*.3)*.45;
    }
    #endif`);
 };
 material.customProgramCacheKey=()=> 'shrub-layer-wind-v1';
 return material;
}
