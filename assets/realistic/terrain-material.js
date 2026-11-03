import * as THREE from 'three';
// 노면 경계 노이즈 마스크(값 노이즈 3옥타브). 재질이 바뀌는 겹침 구간(trailEntry 0→1)에서 뒤 노면을 들쭉날쭉하게 드러낸다.
const SURFACE_NOISE=`float surfaceHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float surfaceValue(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1.,0.)),f.x),mix(surfaceHash(i+vec2(0.,1.)),surfaceHash(i+vec2(1.,1.)),f.x),f.y);}
float surfaceMask(vec2 p){return .55*surfaceValue(p*.9)+.3*surfaceValue(p*2.3+17.)+.15*surfaceValue(p*6.1+41.);}
float surfaceEntry(float entry,vec2 p){float m=surfaceMask(p);return smoothstep(m*.6,m*.6+.4,entry);}
`;
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
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trailEdge; attribute float trailEntry; varying vec3 trailWorld; varying float trailSide; varying float trailIn;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ntrailWorld=(modelMatrix*vec4(transformed,1.0)).xyz; trailSide=trailEdge; trailIn=trailEntry;');
  let declarations='varying vec3 trailWorld; varying float trailSide; varying float trailIn;\n'+SURFACE_NOISE;
  for(const [i,k] of keys.entries())for(const [s,f] of [['D','map'],['N','normalMap'],['R','roughnessMap']]){const name=`trail${i}${s}`;shader.uniforms[name]={value:materials[k][f]};declarations+=`uniform sampler2D ${name};\n`;}
  declarations+=`vec3 trailWeights(){float edge=smoothstep(.2,.82,abs(trailSide));float leafPatch=.5+.5*sin(trailWorld.x*1.7+sin(trailWorld.z*.8));float grass=edge*.25*leafPatch;float leaves=.08+edge*.55;return vec3(1.0-leaves-grass,leaves,grass);}\n`;
  for(const ch of ['D','N','R'])declarations+=`vec4 trail${ch}(){vec3 w=trailWeights();return ${keys.map((k,i)=>`texture2D(trail${i}${ch},trailWorld.xz/${Number(meta[k].metres).toFixed(3)})*w[${i}]`).join('+')};}\n`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+declarations).replace('#include <map_fragment>','diffuseColor *= trailD(); float edgeNoise=.5+.25*sin(trailWorld.x*7.1+sin(trailWorld.z*4.7))+.25*sin(trailWorld.z*17.3+trailWorld.x*11.7); float raggedSide=abs(trailSide)+edgeNoise*.20; diffuseColor.a *= 1.0-smoothstep(.55,1.0,raggedSide); diffuseColor.a *= surfaceEntry(trailIn,trailWorld.xz);').replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness*trailR().g;').replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )','trailN()'));
 };
 material.customProgramCacheKey=()=> 'gwanak-trail-soil-leaf-grass-v3-entry';return material;
}

// 기존 돌 PBR로 포장 골재를 만들고 길 양쪽에 흙·낙엽 퇴적을 섞는다.
export function pavedMaterial(materials,meta){
 const material=new THREE.MeshStandardMaterial({map:materials.stone.map,normalMap:materials.stone.normalMap,roughness:1,normalScale:new THREE.Vector2(.22,.22),alphaHash:true});
 material.onBeforeCompile=shader=>{
  shader.uniforms.pavedLeaves={value:materials.leaves.map};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trailEdge; attribute float trailEntry; varying float pavedSide; varying float pavedIn; varying vec3 pavedWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\npavedSide=trailEdge; pavedIn=trailEntry; pavedWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform sampler2D pavedLeaves; varying float pavedSide; varying float pavedIn; varying vec3 pavedWorld;
   ${SURFACE_NOISE}
   float pavementNoise(vec2 p){return fract(sin(dot(floor(p),vec2(127.1,311.7)))*43758.5453);}`)
   .replace('#include <map_fragment>',`vec3 aggregate=texture2D(map,pavedWorld.xz*2.5).rgb;
    float grain=pavementNoise(pavedWorld.xz*95.);
    float luma=dot(aggregate,vec3(.2126,.7152,.0722));
    vec3 asphalt=vec3(.16,.157,.15)*(.72+luma*.75+grain*.14);
    float edgePatch=.5+.25*sin(pavedWorld.x*5.1+sin(pavedWorld.z*3.7))+.25*sin(pavedWorld.z*11.7);
    float edge=smoothstep(.65,.98,abs(pavedSide)+edgePatch*.12);
    vec3 leaves=texture2D(pavedLeaves,pavedWorld.xz/1.6).rgb*vec3(.65,.53,.38);
    diffuseColor.rgb*=mix(asphalt,leaves,edge*.9);
    diffuseColor.a*=1.-smoothstep(.91,1.08,abs(pavedSide)+edgePatch*.12);
    diffuseColor.a*=surfaceEntry(pavedIn,pavedWorld.xz);`)
   .replace('texture2D( normalMap, vNormalMapUv )','texture2D(normalMap,pavedWorld.xz*2.5)');
 };
 material.customProgramCacheKey=()=> 'gwanak-pavement-aggregate-leaf-edge-v2-entry';return material;
}

// 돌길(stone)·암릉(granite) 노면. 세계 좌표 질감을 쓰고, 가운데는 밟혀 닳은 색, 가장자리는 주변 지형 색으로 바꾼 뒤
// 노이즈 마스크로 투명하게 녹여 지형과 직선으로 끊기지 않게 한다. 암릉 가장자리 색은 terrainMaterial의 화강암 식과 같다.
export function rockTrailMaterial(materials,meta,key){
 const source=materials[key],metres=Number(meta[key].metres).toFixed(3),granite=Number(meta.granite.metres).toFixed(3),ridge=key==='granite';
 const material=new THREE.MeshStandardMaterial({map:source.map,normalMap:source.normalMap,roughnessMap:source.roughnessMap,roughness:1,alphaHash:true,normalScale:new THREE.Vector2(.6,.6)});
 material.onBeforeCompile=shader=>{
  shader.uniforms.rockEdgeGranite={value:materials.granite.map};shader.uniforms.rockEdgeLeaves={value:materials.leaves.map};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trailEdge; attribute float trailEntry; varying vec3 rockWorld; varying float rockSide; varying float rockIn;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nrockWorld=(modelMatrix*vec4(transformed,1.0)).xyz; rockSide=trailEdge; rockIn=trailEntry;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform sampler2D rockEdgeGranite; uniform sampler2D rockEdgeLeaves; varying vec3 rockWorld; varying float rockSide; varying float rockIn;
   ${SURFACE_NOISE}
   vec4 rockTex(sampler2D tex,vec2 uv){float w=smoothstep(-.8,.8,sin(rockWorld.x*.061)+sin(rockWorld.z*.047));return mix(texture2D(tex,uv),texture2D(tex,uv*.731+vec2(.37,.61)),w);}`)
   .replace('#include <map_fragment>',`vec3 rockColor=rockTex(map,rockWorld.xz/${metres}).rgb;
    float rockLuma=dot(rockColor,vec3(.2126,.7152,.0722));
    float rockNoise=surfaceMask(rockWorld.xz*1.3)*.55+surfaceMask(rockWorld.xz*.32+7.)*.45;
    vec3 worn=mix(vec3(rockLuma),rockColor,${ridge?'.38':'.75'})*vec3(1.02,1.0,.96);
    float nearWeight=1.0-smoothstep(12.0,65.0,length(vViewPosition));vec2 graniteUv=rockWorld.xz/${granite};
    vec3 edgeStone=mix(texture2D(rockEdgeGranite,graniteUv*.3).rgb,texture2D(rockEdgeGranite,graniteUv*2.4).rgb,nearWeight*.78);
    vec3 edgeColor=${ridge?'mix(vec3(dot(edgeStone,vec3(.2126,.7152,.0722))),edgeStone,.12)*vec3(.94,.98,1.0)':'mix(mix(vec3(rockLuma),rockColor,.5)*.92,texture2D(rockEdgeLeaves,rockWorld.xz/2.14).rgb,.45)'};
    float side=abs(rockSide)+(rockNoise-.5)*.8;
    diffuseColor.rgb*=mix(worn,edgeColor,smoothstep(.18,.78,side));
    diffuseColor.a*=1.0-smoothstep(.62,1.02,side);
    diffuseColor.a*=surfaceEntry(rockIn,rockWorld.xz);`)
   .replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness*rockTex(roughnessMap,rockWorld.xz/'+metres+').g;')
   .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )','rockTex(normalMap,rockWorld.xz/'+metres+')'));
 };
 material.customProgramCacheKey=()=>`gwanak-rock-trail-${key}-v2-edge-noise`;return material;
}
