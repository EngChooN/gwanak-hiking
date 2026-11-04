import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildStreamGeometry,buildPondGeometry,streamRock,distanceToStream,STREAM_HALF_WIDTH,STREAM_ROCK_CELL} from '../src/stream-water.js';
import {canopyAt,updateLightFx,patchDapple,LIGHT_FX,LIGHT_FX_CONFIG} from '../src/light-fx.js';
import {composeEnvironment,sunPosition,moonPosition,resolveUtcMs} from '../src/daytime.js';
import {weatherLook} from '../src/weather.js';
import {ambientTargets,setStreamDistance,STREAM_NEAR} from '../src/ambient-config.js';

// 대각선으로 올라가는 상류 방향 중심선(5m 간격)과 기울어진 지면.
const line=Array.from({length:17},(_,i)=>({x:i*4,z:-i*3}));
const ground=(x,z)=>.1*x+.05*z;
test('물 띠: 1m 간격 표본, 길이 좌표가 이어지고 정점은 지면+3.5cm에 붙는다',()=>{
 const b=buildStreamGeometry(line,ground,100),pos=b.geometry.attributes.position,st=b.geometry.attributes.aStream;
 assert.ok(b.samples.length>=75&&b.samples[0].along===100&&b.alongEnd>170);
 for(let i=1;i<b.samples.length;i++)assert.ok(b.samples[i].along>b.samples[i-1].along);
 for(let i=0;i<pos.count;i++)assert.ok(Math.abs(pos.getY(i)-(ground(pos.getX(i),pos.getZ(i))+.035))<1e-5);
 assert.equal(pos.count,b.samples.length*7);assert.equal(st.count,pos.count);
 // 폭: 가장 바깥 열 사이 거리가 전체 폭이다.
 const k=10,a=k*7,c=k*7+6;assert.ok(Math.abs(Math.hypot(pos.getX(a)-pos.getX(c),pos.getZ(a)-pos.getZ(c))-2*STREAM_HALF_WIDTH)<.05);
});
test('물 띠: 흐름 방향은 상류의 반대이고 옆 방향과 직교한다',()=>{
 const b=buildStreamGeometry(line,ground,0),s=b.samples[20];
 // 중심선은 (+x,-z)로 올라가므로 하류는 (-x,+z).
 assert.ok(s.dir[0]<0&&s.dir[1]>0);assert.ok(Math.abs(s.dir[0]*s.side[0]+s.dir[1]*s.side[1])<1e-6);assert.ok(Math.abs(Math.hypot(...s.dir)-1)<1e-6);
});
test('물속 바위: 결정적이고 칸 안에 있으며 물줄기 안쪽에 놓인다',()=>{
 let n=0;for(let c=0;c<400;c++){const r=streamRock(c);assert.deepEqual(r,streamRock(c));if(!r)continue;n++;
  assert.ok(r.along>=c*STREAM_ROCK_CELL&&r.along<(c+1)*STREAM_ROCK_CELL);assert.ok(Math.abs(r.across)<=.5&&r.radius>=.2&&r.radius<=.42);}
 assert.ok(n>200&&n<340,`바위 칸 비율 ${n}/400`);
});
test('연못 띠: 가운데 정점과 반지름 열이 지면에 붙는다',()=>{
 const g=buildPondGeometry(0,0,5,ground),p=g.attributes.position;assert.equal(g.attributes.aStream.count,p.count);
 for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-(ground(p.getX(i),p.getZ(i))+.04))<1e-5);
});
test('물소리 거리: 가장 가까운 표본까지 수평 거리',()=>{
 const b=buildStreamGeometry(line,ground,0);assert.ok(distanceToStream(b.samples,2,-1.5)<2);assert.ok(distanceToStream(b.samples,200,200)>100);
});
test('물소리 거리 연동: 눈에 보이는 물이 가까우면 구간표보다 가깝게, 비우면 구간표로 돌아간다',()=>{
 setStreamDistance(null);const base=ambientTargets(1500,235);setStreamDistance(3);const near=ambientTargets(1500,235);
 assert.ok(near.distance<=base.distance&&near.distance===3);setStreamDistance(500);assert.ok(ambientTargets(1500,235).distance<=base.distance*2.5+1e-9);
 setStreamDistance(NaN);assert.equal(STREAM_NEAR.distance,null);assert.equal(ambientTargets(1500,235).distance,base.distance);
});

const envAt=(time,kind='clear')=>{const t=resolveUtcMs({time,nowMs:Date.UTC(2026,10,4,3,0)}).utcMs;return composeEnvironment({sun:sunPosition(t),moon:moonPosition(t),weather:weatherLook({kind})});};
const fx=(time,kind)=>{const e=envAt(time,kind);return updateLightFx({time:1,sunVector:new THREE.Vector3(0,1,0),environment:e,quality:2});};
test('나무 덮임: 계곡·중턱 1, 능선 아래로, 정상부는 더 성김',()=>{
 assert.equal(canopyAt(120),1);assert.equal(canopyAt(430),1);
 const c=LIGHT_FX_CONFIG.canopy;assert.ok(Math.abs(canopyAt(c.to)-c.ridgeFloor)<1e-9);assert.ok(Math.abs(canopyAt(700)-c.summitFloor)<1e-9);
 let prev=1;for(let y=430;y<=640;y+=10){const v=canopyAt(y);assert.ok(v<=prev+1e-9);prev=v;}assert.equal(canopyAt(NaN),1);
});
test('직사광: 맑은 낮 크고 흐림·밤·해 뜨기 직전엔 거의 0, 낮은 해일수록 빛줄기가 길다',()=>{
 const noon=fx('12:00','clear'),over=fx('12:00','overcast'),night=fx('21:00','clear'),low=fx('16:40','clear');
 assert.ok(noon.direct>.8,`맑은 낮 ${noon.direct}`);assert.ok(over.direct<.25,`흐림 ${over.direct}`);assert.ok(night.direct<.01);
 const noonLow=(fx('12:00','clear'),LIGHT_FX.fxLowSun.value);fx('16:40','clear');assert.ok(LIGHT_FX.fxLowSun.value>noonLow,`해질녘 낮은 해 ${LIGHT_FX.fxLowSun.value} > ${noonLow}`);
 assert.ok(low.direct>0);
});
test('화질 단계: 휴대폰은 항상 0단계',()=>{
 updateLightFx({time:0,sunVector:new THREE.Vector3(0,1,0),environment:envAt('12:00'),quality:2,mobile:true});assert.equal(LIGHT_FX.fxQuality.value,0);
 updateLightFx({time:0,sunVector:new THREE.Vector3(0,1,0),environment:envAt('12:00'),quality:2});assert.equal(LIGHT_FX.fxQuality.value,2);
});
test('그림자 얼룩 셰이더: 직사광 몫에만 곱하고 한 번만 끼운다',()=>{
 const shader={uniforms:{},fragmentShader:'#include <common>\nvoid main(){\n#include <lights_fragment_end>\n}'};
 patchDapple(shader,'landWorld');const once=shader.fragmentShader;patchDapple(shader,'landWorld');assert.equal(shader.fragmentShader,once);
 assert.match(once,/reflectedLight\.directDiffuse\*=/);assert.match(once,/dappleLight\(landWorld/);assert.ok(shader.uniforms.fxSunVis&&shader.uniforms.fxTime);
});
