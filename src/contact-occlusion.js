import * as THREE from 'three';

// 배치 기반 근사 접촉 음영. 광선 추적 AO나 실제 식생 조사 자료가 아니다.
export function createContactOcclusion(grid,{enabled=true,size=2048,route=[],maxMapSize=8192}={}){
 const resolutionLimit=Math.max(2,Math.floor(Math.min(8192,maxMapSize)));
 // 경로 전체를 감싸는 고정 지역 지도. 이동 중 업로드/타일 교체가 없어 재컴파일을 유발하지 않는다.
 if(route.length){
  const x0=Math.min(...route.map(p=>p.x))-24,z0=Math.min(...route.map(p=>p.z))-24;
  const x1=Math.max(...route.map(p=>p.x))+24,z1=Math.max(...route.map(p=>p.z))+24;
  // 반경 약 0.5m 돌이 한 텍셀 사이에 놓여 사라지는 현상을 줄인다.
  // 고정 지도 한 장·동일 샘플 수를 유지하고 한 변 상한만 8192로 높인다.
  const spacing=Math.max(.25,(x1-x0)/(resolutionLimit-1),(z1-z0)/(resolutionLimit-1));
  grid={x0,z0,width:Math.min(resolutionLimit,Math.ceil((x1-x0)/spacing)+1),height:Math.min(resolutionLimit,Math.ceil((z1-z0)/spacing)+1),spacing};
  size=undefined;
 }
 const spanX=(grid.width-1)*grid.spacing,spanZ=(grid.height-1)*grid.spacing;
 const width=size??grid.width,height=size??grid.height;
 const data=new Uint8Array(width*height);data.fill(255);
 const texture=new THREE.DataTexture(data,width,height,THREE.RedFormat);
 texture.unpackAlignment=1;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const strength={value:enabled?1:0};
 const status={method:'경로 지역 배치 접촉 음영',enabled,occluders:0,resolutionLimit,resolution:[width,height],metresPerTexel:[spanX/width,spanZ/height],bytes:data.byteLength,directMax:.36,forestMax:.26,protectedRoute:true,routeMargin:.15};
 function stamp(x,z,radius,opacity){
  if(![x,z,radius,opacity].every(Number.isFinite)||radius<=0)return;
  opacity=Math.max(0,Math.min(.36,opacity));
  const u=(x-grid.x0)/spanX*width-.5,v=(z-grid.z0)/spanZ*height-.5,rx=radius/spanX*width,rz=radius/spanZ*height;
  for(let j=Math.max(0,Math.floor(v-rz));j<=Math.min(height-1,Math.ceil(v+rz));j++)for(let i=Math.max(0,Math.floor(u-rx));i<=Math.min(width-1,Math.ceil(u+rx));i++){
   const r2=((i-u)/rx)**2+((j-v)/rz)**2;if(r2>=1)continue;
   // 겹치는 숲도 과도하게 검어지지 않도록 가장 강한 차폐만 사용한다.
   data[j*width+i]=Math.min(data[j*width+i],Math.round(255*(1-opacity*(1-r2))));
  }
  status.occluders++;
 }
 function apply(material){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=shader=>{
   previous.call(material,shader);
   Object.assign(shader.uniforms,{contactMap:{value:texture},contactStrength:strength,contactBounds:{value:new THREE.Vector4(grid.x0,grid.z0,spanX,spanZ)}});
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 contactXZ;')
    .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ncontactXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 contactXZ; uniform sampler2D contactMap; uniform vec4 contactBounds; uniform float contactStrength;')
    .replace('#include <aomap_fragment>',`#include <aomap_fragment>
vec2 contactUV=(contactXZ-contactBounds.xy)/contactBounds.zw;
float contactInside=step(0.0,contactUV.x)*step(0.0,contactUV.y)*step(contactUV.x,1.0)*step(contactUV.y,1.0);
float contactAO=mix(1.0,texture2D(contactMap,contactUV).r,contactStrength*contactInside);
reflectedLight.indirectDiffuse*=contactAO;
reflectedLight.indirectSpecular*=contactAO;
reflectedLight.directDiffuse*=contactAO;
`);
  };
  material.customProgramCacheKey=()=>key+'-contact-occlusion-v2';return material;
 }
 function commit(){
  // 노면 재질은 별도 제외되어 있다. 지형 보호는 노면 가장자리 + 15cm로 한정한다.
  // 텍셀 크기를 더하면 노폭 밖 18cm부터 배치된 길가 바위 음영까지 사라진다.
  const sx=spanX/width,sz=spanZ/height;
  for(let n=1;n<route.length;n++){
   const a=route[n-1],b=route[n],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
   const radius=Math.max(a.width??2,b.width??2)/2+status.routeMargin;
   const i0=Math.max(0,Math.floor((Math.min(a.x,b.x)-radius-grid.x0)/sx)),i1=Math.min(width-1,Math.ceil((Math.max(a.x,b.x)+radius-grid.x0)/sx));
   const j0=Math.max(0,Math.floor((Math.min(a.z,b.z)-radius-grid.z0)/sz)),j1=Math.min(height-1,Math.ceil((Math.max(a.z,b.z)+radius-grid.z0)/sz));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const x=grid.x0+(i+.5)*sx,z=grid.z0+(j+.5)*sz,t=len2?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/len2)):0;
    if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<=radius)data[j*width+i]=255;
   }
  }
  texture.needsUpdate=true;
 }
 return {status,texture,apply,stamp,commit,setEnabled(value){strength.value=value?1:0;status.enabled=!!value;},dispose(){texture.dispose();}};
}
