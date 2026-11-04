import test from 'node:test';import assert from 'node:assert/strict';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as THREE from 'three';
import {capBloomInput} from '../src/rendering.js';
import {BLOOM} from '../src/mood-config.js';
import {lampWeights} from '../src/night-lighting-config.js';

test('블룸 밝기 추출에 상한·NaN 제거·부드러운 문턱이 들어간다(가로등 번쩍임 방지)',()=>{
 const bloom=new UnrealBloomPass(new THREE.Vector2(64,64),.5,.55,BLOOM.threshold);
 assert.equal(capBloomInput(bloom),true);
 const m=bloom.materialHighPassFilter;
 assert.equal(Number(m.defines.BLOOM_CAP),BLOOM.cap);
 assert.match(m.fragmentShader,/BLOOM_CAP\/max\(luminance/);assert.match(m.fragmentShader,/isnan/);
 assert.equal(bloom.highPassUniforms.smoothWidth.value,BLOOM.knee);
});

test('가까운 등 4개가 바뀌는 순간 빠지는 등과 들어오는 등의 세기가 0이라 광원이 튀지 않는다',()=>{
 const lamps=Array.from({length:12},(_,i)=>({x:i*27,z:0}));
 const at=x=>{const m=new Map(lampWeights(lamps,x,5).map(v=>[v.i,v.w]));return i=>m.get(i)??0;};
 let maxJump=0;
 for(let x=0;x<=270;x+=.25){const a=at(x),b=at(x+.25);for(let i=0;i<lamps.length;i++)maxJump=Math.max(maxJump,Math.abs(a(i)-b(i)));}
 assert.ok(maxJump<=.25/8*2+1e-9,`한 걸음(25cm) 사이 세기 변화 ${maxJump}`);
 assert.equal(at(27*5)(5),1);
});
