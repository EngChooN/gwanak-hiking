import * as THREE from 'three';
// PBR 네 층이 같은 세계 좌표·혼합 가중치를 사용한다. 색 텍스처만 sRGB이다.
export function terrainMaterial(materials,meta){
 const keys=['granite','soil','grass','leaves'];
 const material=new THREE.MeshStandardMaterial({map:materials.soil.map,normalMap:materials.soil.normalMap,roughnessMap:materials.soil.roughnessMap,roughness:1,normalScale:new THREE.Vector2(.6,.6)});
 material.onBeforeCompile=shader=>{
  const uniforms={};for(const [i,key] of keys.entries())for(const [suffix,field] of [['D','map'],['N','normalMap'],['R','roughnessMap']])uniforms[`land${i}${suffix}`]={value:materials[key][field]};
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 landWorld; varying vec3 landNormal;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nlandWorld=(modelMatrix*vec4(transformed,1.0)).xyz; landNormal=normalize(mat3(modelMatrix)*objectNormal);');
  let declarations='varying vec3 landWorld; varying vec3 landNormal;\n';
  for(let i=0;i<4;i++)for(const suffix of ['D','N','R'])declarations+=`uniform sampler2D land${i}${suffix};\n`;
  declarations+=`vec4 landTex(sampler2D tex,vec2 uv){float w=smoothstep(-1.0,1.0,sin(landWorld.x*.021)+sin(landWorld.z*.017));return mix(texture2D(tex,uv),texture2D(tex,uv*.731+vec2(.37,.61)),w);}
vec4 graniteTex(sampler2D tex){float nearWeight=1.0-smoothstep(12.0,65.0,length(vViewPosition));vec2 uv=landWorld.xz/${Number(meta.granite.metres).toFixed(3)};return mix(landTex(tex,uv*.3),texture2D(tex,uv*2.4),nearWeight*.78);}
vec4 landWeights(){float slope=1.0-abs(normalize(landNormal).y); float landPatch=.5+.25*sin(landWorld.x*.23+sin(landWorld.z*.19)*2.0)+.25*sin(landWorld.z*.08+landWorld.x*.09); float outcrop=smoothstep(.36,.76,landPatch); float rock=smoothstep(.10,.34,slope)*(.38+.62*outcrop); rock=max(rock,smoothstep(490.0,625.0,landWorld.y)*(.18+.65*outcrop));float grass=(1.0-rock)*(.42+.32*landPatch);float soil=(1.0-rock-grass)*(.45+.35*(1.0-landPatch));return vec4(rock,soil,grass,1.0-rock-grass-soil);}\n`;
  for(const channel of ['D','N','R'])declarations+=`vec4 land${channel}(){vec4 w=landWeights();return ${keys.map((k,i)=>`${i===0?`graniteTex(land0${channel})`:`landTex(land${i}${channel},landWorld.xz/${Number(meta[k].metres).toFixed(3)})`}*w[${i}]`).join('+')};}\n`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+declarations)
   .replace('#include <map_fragment>','vec4 groundColor=landD(); float rockCover=landWeights().x; float mottling=.92+.08*sin(landWorld.x*.019+sin(landWorld.z*.015)*2.0); vec3 forestColor=groundColor.rgb*mottling; vec3 stone=graniteTex(land0D).rgb; float stoneLuma=dot(stone,vec3(.2126,.7152,.0722)); vec3 graniteColor=mix(vec3(stoneLuma),stone,.12)*vec3(.94,.98,1.0); groundColor.rgb=mix(forestColor,graniteColor,rockCover); float farBlend=smoothstep(50.0,180.0,length(vViewPosition)); vec3 farGround=mix(vec3(.19,.24,.14),vec3(.38,.39,.37),rockCover); groundColor.rgb=mix(groundColor.rgb,farGround,farBlend*.92); diffuseColor *= groundColor;')
   .replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness*landR().g;')
   // 반복 노멀의 원거리 명암 줄무늬를 줄인다. 근거리 PBR은 유지한다.
   .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )','mix(landN(),vec4(.5,.5,1.0,1.0),smoothstep(35.0,120.0,length(vViewPosition)))'));
 };
 material.customProgramCacheKey=()=> 'gwanak-slope-altitude-forest-v5-distance-detail';return material;
}

// 노면 중심은 흙, 가장자리는 낙엽·풀. 세 PBR 채널에 같은 가중치를 적용한다.
export function trailMaterial(materials,meta){
 const keys=['soil','leaves','grass'],material=new THREE.MeshStandardMaterial({map:materials.soil.map,normalMap:materials.soil.normalMap,roughnessMap:materials.soil.roughnessMap,roughness:1,alphaHash:true,normalScale:new THREE.Vector2(.45,.45)});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trailEdge; varying vec3 trailWorld; varying float trailSide;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ntrailWorld=(modelMatrix*vec4(transformed,1.0)).xyz; trailSide=trailEdge;');
  let declarations='varying vec3 trailWorld; varying float trailSide;\n';
  for(const [i,k] of keys.entries())for(const [s,f] of [['D','map'],['N','normalMap'],['R','roughnessMap']]){const name=`trail${i}${s}`;shader.uniforms[name]={value:materials[k][f]};declarations+=`uniform sampler2D ${name};\n`;}
  declarations+=`vec3 trailWeights(){float edge=smoothstep(.2,.82,abs(trailSide));float leafPatch=.5+.5*sin(trailWorld.x*1.7+sin(trailWorld.z*.8));float grass=edge*.25*leafPatch;float leaves=.08+edge*.55;return vec3(1.0-leaves-grass,leaves,grass);}\n`;
  for(const ch of ['D','N','R'])declarations+=`vec4 trail${ch}(){vec3 w=trailWeights();return ${keys.map((k,i)=>`texture2D(trail${i}${ch},trailWorld.xz/${Number(meta[k].metres).toFixed(3)})*w[${i}]`).join('+')};}\n`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+declarations).replace('#include <map_fragment>','diffuseColor *= trailD(); float edgeNoise=.5+.25*sin(trailWorld.x*7.1+sin(trailWorld.z*4.7))+.25*sin(trailWorld.z*17.3+trailWorld.x*11.7); float raggedSide=abs(trailSide)+edgeNoise*.20; diffuseColor.a *= 1.0-smoothstep(.55,1.0,raggedSide);').replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness*trailR().g;').replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )','trailN()'));
 };
 material.customProgramCacheKey=()=> 'gwanak-trail-soil-leaf-grass-v2-feather';return material;
}
