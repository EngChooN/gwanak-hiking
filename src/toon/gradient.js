import * as THREE from 'three';
import {TOON} from './palette.js';
// 3단 toon gradientMap. 1×N DataTexture, NearestFilter·밉맵 없음이어야 단이 번지지 않는다.
// assets/toon/gradients/toon3.png와 같은 값(0.35/0.7/1.0)을 코드로 만들어 fetch가 필요 없다.
export function createGradientMap(levels=TOON.gradient){
 if(!levels.length||levels.length>3)throw new Error('gradientMap은 1~3단');
 const data=new Uint8Array(levels.length*4);
 levels.forEach((v,i)=>{const b=Math.round(Math.max(0,Math.min(1,v))*255);data.set([b,b,b,255],i*4);});
 const texture=new THREE.DataTexture(data,levels.length,1,THREE.RGBAFormat);
 texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.NoColorSpace;
 texture.name=`toon-gradient-${levels.length}`;texture.userData.shared=true;texture.userData.levels=[...levels];texture.needsUpdate=true;
 return texture;
}
