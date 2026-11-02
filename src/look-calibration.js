import * as THREE from 'three';
import {LOOK_PROFILE,sunDirection,neutralCard,exposureForCard} from './look-profile.js';
const luma=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
export function calibrateLook(renderer,environment,hemisphere=null){
  const floating=renderer.extensions.has('EXT_color_buffer_float');
  const target=new THREE.WebGLRenderTarget(1,1,{type:floating?THREE.FloatType:THREE.UnsignedByteType,depthBuffer:true});
  const oldTarget=renderer.getRenderTarget(),oldTone=renderer.toneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,LOOK_PROFILE.far);
  const card=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(.18,.18,.18),roughness:1,metalness:0}));
  card.rotation.x=-Math.PI/2;scene.add(card);camera.position.set(0,5,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const light=new THREE.DirectionalLight(LOOK_PROFILE.sunColor,4);light.position.fromArray(sunDirection()).multiplyScalar(80);scene.add(light,light.target);
  const fill=hemisphere?.clone(),fillBase=hemisphere?.intensity||0;if(fill){fill.intensity=0;scene.add(fill);}
  scene.environment=environment;scene.environmentIntensity=0;
  function read(){renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=floating?new Float32Array(4):new Uint8Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,pixels);return [...pixels].slice(0,3).map(v=>floating?v:v/255);}
  try{
    renderer.toneMapping=THREE.NoToneMapping;
    const direct=read();light.intensity=0;scene.environmentIntensity=1;if(fill)fill.intensity=fillBase;const sky=read();
    if(luma(direct)<=0||luma(sky)<=0)throw new Error('광량 프로브가 유효하지 않음');
    const environmentIntensity=luma(direct)/(LOOK_PROFILE.directSkyRatio*luma(sky));scene.environmentIntensity=environmentIntensity;if(fill)fill.intensity=fillBase*environmentIntensity;
    const calibratedSky=read();const ratio=luma(direct)/luma(calibratedSky);light.intensity=4;const total=read();
    const exposure=exposureForCard(total),grayCard=neutralCard(total,exposure);
    // 실제 fog_fragment 출력의 흑/백 차이 = 선형 대비 잔존율. 톤매핑 전 기준.
    card.rotation.set(0,0,0);card.geometry.dispose();card.geometry=new THREE.PlaneGeometry(100,100);card.material.dispose();card.material=new THREE.MeshBasicMaterial({color:0xffffff});
    camera.position.set(0,0,0);camera.up.set(0,1,0);camera.lookAt(0,0,-1);scene.fog=new THREE.Fog(LOOK_PROFILE.haze,0,LOOK_PROFILE.far);
    const fogSamples=[];for(const distance of [1000,8000,10000,12000,25000]){card.position.set(0,0,-distance);card.material.color.set(0xffffff);const white=read();card.material.color.set(0x000000);const black=read();fogSamples.push({distance,contrast:luma(white)-luma(black)});}
    return {environmentIntensity,hemisphereIntensity:fillBase*environmentIntensity,directContribution:direct,indirectContribution:calibratedSky,exposure,ratio,grayCard,grayCardLuma:luma(grayCard),fogSamples,precision:floating?'float32':'8bit',calibrated:true};
  }finally{renderer.setRenderTarget(oldTarget);renderer.toneMapping=oldTone;card.geometry.dispose();card.material.dispose();target.dispose();}
}
