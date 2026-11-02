import test from 'node:test';import assert from 'node:assert/strict';
import {indirectColor,INDIRECT_PROFILE,neutralizeEnvironment,groundAlbedo} from '../src/indirect-light.js';
const y=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
test('간접광 색 교정은 어두운 값·HDR 값의 선형 휘도를 보존한다',()=>{for(const rgb of [[0,0,0],[.01,.02,.2],[.2,.4,3],[20,5,2],[.4,.4,.4]])for(const up of [-1,0,1]){const c=indirectColor(rgb,up);assert.ok(c.every(v=>Number.isFinite(v)&&v>=0));assert.ok(Math.abs(y(c)-y(rgb))<1e-10);}});
test('푸른 HDRI 색 편향 감소와 회갈색 지면 반사',()=>{const input=[.05,.1,1],sky=indirectColor(input,1),ground=indirectColor(input,-1);const spread=c=>(Math.max(...c)-Math.min(...c))/Math.max(...c);assert.ok(spread(sky)<spread(input)*.3);assert.ok(ground[0]>ground[2]);assert.ok(INDIRECT_PROFILE.hemisphereIntensity>0);});
test('환경맵 상하 방향과 알파 보존·정상 갱신',()=>{const data=new Float32Array([.1,.2,.8,1,.1,.2,.8,1]),texture={image:{data,width:1,height:2},needsUpdate:false};neutralizeEnvironment(texture);assert.equal(data[3],1);assert.equal(data[7],1);assert.ok(data[4]/data[6]>data[0]/data[2]);assert.equal(texture.needsUpdate,true);});

test('지면 정점색의 휘도는 보존하고 중복된 녹색 채도만 낮춤',()=>{const input=[.13,.2,.1],out=groundAlbedo(input);assert.ok(Math.abs(y(out)-y(input))<1e-12);assert.ok(Math.max(...out)-Math.min(...out)<(Math.max(...input)-Math.min(...input))*.3);});
