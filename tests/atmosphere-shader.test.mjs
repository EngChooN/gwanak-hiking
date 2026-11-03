import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBasicMaterial,MeshStandardMaterial,ShaderLib} from 'three';
import {applyAtmosphere} from '../assets/realistic/skyline-reference.js';

for(const [name,Material]of [['basic',MeshBasicMaterial],['standard',MeshStandardMaterial]]){
 test(`${name} 대기 감쇠는 기본 셰이더 varying에 의존하지 않는다`,()=>{
  const material=applyAtmosphere(new Material(),{contrastStops:[[0,1],[10000,.4]]});
  const shader={uniforms:{},vertexShader:ShaderLib[name].vertexShader,fragmentShader:ShaderLib[name].fragmentShader};
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/varying vec3 gAtmosphereView;/);
  assert.match(shader.vertexShader,/gAtmosphereView=mvPosition.xyz;/);
  assert.match(shader.fragmentShader,/float gDistance=length\(gAtmosphereView\)/);
  assert.doesNotMatch(shader.fragmentShader,/length\(vViewPosition\)/);
  material.dispose();
 });
}
