import * as THREE from 'three';
let materialPromise;
function atlasMaterial(){
 return materialPromise??=new THREE.TextureLoader().loadAsync(new URL('../assets/pine-impostor-atlas-v1.png',import.meta.url).href).then(map=>{
  map.colorSpace=THREE.SRGBColorSpace;map.generateMipmaps=false;map.minFilter=THREE.LinearFilter;
  const material=new THREE.MeshBasicMaterial({map,alphaTest:.5,transparent:false,side:THREE.DoubleSide,toneMapped:false});
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float atlasYaw;');
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
    vec4 anchor=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
    vec3 direction=normalize(vec3(cameraPosition.x-anchor.x,0.,cameraPosition.z-anchor.z)+vec3(0.,0.,.000001));
    vec3 right=vec3(direction.z,0.,-direction.x);
    float angle=mod(atan(direction.x,direction.z)-atlasYaw+6.28318530718,6.28318530718);
    float cell=mod(floor(angle/.78539816339+.5),8.);
    vMapUv=vec2((clamp(uv.x,.001,.999)+mod(cell,4.))/4.,(clamp(uv.y,.001,.999)+1.-floor(cell/4.))/2.);
    vec3 world=anchor.xyz+right*position.x*length(instanceMatrix[0].xyz)+vec3(0.,position.y*length(instanceMatrix[1].xyz),0.);
    vec4 mvPosition=viewMatrix*vec4(world,1.);
    gl_Position=projectionMatrix*mvPosition;
   `);
  };
  material.customProgramCacheKey=()=> 'pine-eight-directions-v1';return material;
 });
}
export async function pineImpostorParts(placements){
 const side=12.726641404,geometry=new THREE.PlaneGeometry(side,side);
 geometry.translate(0,side*(496/512-.5),0);
 geometry.setAttribute('atlasYaw',new THREE.InstancedBufferAttribute(new Float32Array(placements.map(p=>p.yaw||0)),1));
 return [{geometry,material:await atlasMaterial()}];
}
