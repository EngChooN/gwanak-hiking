import * as THREE from 'three';
import {TOON} from './palette.js';
// 근거리 광원(헤드랜턴 SpotLight·가로등 PointLight) 과노출 방지. 카툰 gradientMap은 밝은 단이 1.0이라 세기 큰 근거리 광원을 받으면
// 면 전체가 albedo의 몇 배로 하얗게 뜨고(밤 노출 2.4배) 밤 블룸까지 겹친다. 그래서 점광원·스폿 합 d를 k=albedo×localCap에
// 점근하게 누른다: d·k/(d+k). 딱 자르면 빛 받은 면이 평평한 한 덩어리가 되므로, 부드럽게 눌러 음영 단 차이를 남긴다.
// three의 lights_fragment_begin은 점 → 스폿 → 방향광 순서로 더하므로, 방향광(해·달) 직전에 자르면 낮 햇빛 음영은 그대로다.
// MeshToonMaterial 공용 셰이더(ShaderLib.toon)만 바꾼다. 실사 모드는 이 모듈을 불러오지 않고 MeshToon도 쓰지 않는다.
const MARK='toon-local-light-cap';
const DIR_BLOCK='#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
export function installToonLightCap(cap=TOON.localLightCap){
 const lib=THREE.ShaderLib.toon;
 if(lib.fragmentShader.includes(MARK))return true;
 const chunk=THREE.ShaderChunk.lights_fragment_begin;
 if(!chunk.includes(DIR_BLOCK)||!lib.fragmentShader.includes('#include <lights_fragment_begin>'))return false;
 const capped=chunk.replace(DIR_BLOCK,`// ${MARK}\n {vec3 tlK=material.diffuseColor*${cap.toFixed(3)}+1e-4;reflectedLight.directDiffuse=reflectedLight.directDiffuse*tlK/(reflectedLight.directDiffuse+tlK);}\n${DIR_BLOCK}`);
 lib.fragmentShader=lib.fragmentShader.replace('#include <lights_fragment_begin>',capped);
 return true;
}
