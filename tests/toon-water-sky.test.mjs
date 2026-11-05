import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TOON,skyFor,waterFor,exposureFor,lightScaleFor,bearingDir,hexToRgb} from '../src/toon/palette.js';
import {createToonWater,buildRingGeometry,buildSprayGeometry,SPRAY_PER} from '../src/toon/water.js';
import {buildStreamGeometry,buildFallGeometry,streamWaterMaterial,fallWaterMaterial,bedRockMaterial,streamRock,ledgeRaise,STREAM_ROCK_CELL} from '../src/stream-water.js';
import {buildCityDots,createCityStyle} from '../src/toon/city.js';
import {createToonSky} from '../src/toon/sky.js';

const DAY={elevation:35,night:0,gray:0},SUNSET={elevation:2,night:0,gray:0},NIGHT={elevation:-25,night:1,gray:0};
const round=c=>c.map(v=>+v.toFixed(3));
// 곧은 물줄기 200m(북쪽으로), 평지.
const line=Array.from({length:101},(_,i)=>({x:0,z:-i*2}));
const flat=()=>0;

test('물 색: 낮 청록·노을 분홍 은빛·밤 짙은 청회(기준값 §1-1~1-3)',()=>{
 assert.deepEqual(round(waterFor(DAY).deep),round(hexToRgb('#3e8878')));
 assert.deepEqual(round(waterFor(DAY).shallow),round(hexToRgb('#8bc6af')));
 assert.deepEqual(round(waterFor(SUNSET).shallow),round(hexToRgb('#dcc8c4')));
 assert.deepEqual(round(waterFor(NIGHT).shallow),round(hexToRgb('#394746')));
 assert.ok(waterFor(DAY).sparkle>waterFor(NIGHT).sparkle*3,'반짝임은 낮에 많다');
 assert.ok(waterFor({...DAY,gray:1}).sparkle<.3,'흐리면 반짝임이 준다');
});

test('카툰 물: 실사 물·낙수·암반 재질을 바꿔 끼우고 바위 고리·물보라를 붙인다',()=>{
 const built=buildStreamGeometry(line,flat,0,1,ledgeRaise);
 const water=new THREE.Mesh(built.geometry,streamWaterMaterial()),fallGeo=buildFallGeometry(built.samples,flat);
 assert.ok(fallGeo,'200m 안에 낙수 턱이 있다');
 const fall=new THREE.Mesh(fallGeo,fallWaterMaterial()),bed=new THREE.Mesh(new THREE.BufferGeometry(),bedRockMaterial());
 const basic=[];const tw=createToonWater({materials:{basic:(c,p)=>{const m=new THREE.MeshToonMaterial({color:c,...p});basic.push(m);return m;}}});
 assert.equal(tw.swap(water),true);assert.equal(water.material.name,'toon-stream');assert.ok(water.material.isShaderMaterial);
 assert.ok(water.userData.toonRings?.isMesh,'바위 고리 판');
 assert.equal(tw.swap(fall),true);assert.equal(fall.material.name,'toon-fall');assert.ok(fall.userData.toonSpray?.isPoints,'물보라 점');
 assert.equal(tw.swap(bed),true);assert.ok(bed.material.isMeshToonMaterial&&bed.material.vertexColors);
 // 두 번 불러도 고리·물보라를 또 붙이지 않는다.
 tw.swap(water);tw.swap(fall);assert.equal(water.children.length,1);assert.equal(fall.children.length,1);
 assert.equal(tw.swap(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial())),false,'다른 재질은 건드리지 않는다');
 const w=tw.update(NIGHT,{dt:.5,exposure:2});assert.ok(w.weights.night===1);
 assert.equal(water.material.uniforms.twGain.value,.5,'노출을 되돌려 팔레트 색 그대로');
 assert.ok(water.material.uniforms.twTime.value>=.5);
});

test('바위 고리는 section-scenery처럼 바위 along에 가장 가까운 표본 행에 놓인다',()=>{
 const built=buildStreamGeometry(line,flat,0,1,ledgeRaise),g=buildRingGeometry(built.geometry);
 let rocks=0;for(let c=0;c<=Math.floor(built.alongEnd/STREAM_ROCK_CELL);c++){const r=streamRock(c);if(r&&r.along<built.alongEnd&&ledgeRaise(r.along)===0)rocks++;}
 assert.ok(rocks>5);assert.equal(g.index.count/6,rocks,'바위마다 판 하나');
 // 첫 판의 중심 = 표본 위치 + 옆 r.across(곧은 북향 물줄기: side=(−1,0)이 아니라 frame에서 읽은 값).
 const R=g.attributes.aRing;for(let i=0;i<R.count;i++)assert.ok(R.getZ(i)>=.2&&R.getZ(i)<=.42,'반경');
});

test('물보라: 낙수 아래 가장자리마다 SPRAY_PER개',()=>{
 const built=buildStreamGeometry(line,flat,0,1,ledgeRaise),fallGeo=buildFallGeometry(built.samples,flat);
 const falls=fallGeo.attributes.position.count/15,s=buildSprayGeometry(fallGeo);
 assert.equal(s.attributes.position.count,falls*SPRAY_PER);assert.equal(s.attributes.aSeed.itemSize,4);
});

test('노을 하늘 4단·밤 하늘(기준값 §1-2·§1-3)',()=>{
 const s=skyFor(SUNSET);
 assert.deepEqual(round(s.zenith),round(hexToRgb('#2c4d79')));assert.deepEqual(round(s.mid),round(hexToRgb('#7d66ab')));
 assert.deepEqual(round(s.pink),round(hexToRgb('#d19caf')));assert.deepEqual(round(s.horizon),round(hexToRgb('#fadfca')));
 const n=skyFor(NIGHT);assert.deepEqual(round(n.zenith),round(hexToRgb('#172432')));assert.equal(TOON.sky.night.city,'#c4bfcd','라벤더 빛무리(#b6b1ce)에 도심 불빛 크림 25%');assert.deepEqual(round(n.city),round(hexToRgb(TOON.sky.cityGlow.input)),'밤 색보정 보상값을 넣는다');
 assert.ok(n.milky>0&&n.cityGlow>0&&n.stars>0);assert.equal(skyFor(DAY).milky,0);assert.equal(skyFor(DAY).cityGlow,0);
 assert.ok(TOON.sky.bands[0]<TOON.sky.bands[1]&&TOON.sky.bands[1]<TOON.sky.bands[2]);
 // 낮은 중간 띠가 지평선과 천정 사이 값.
 const d=skyFor(DAY);for(let i=0;i<3;i++)assert.ok(d.mid[i]>=Math.min(d.horizon[i],d.zenith[i])-1e-6&&d.mid[i]<=Math.max(d.horizon[i],d.zenith[i])+1e-6);
});

test('하늘 돔: 노출을 되돌리고 은하수 축·도심 방향을 방위로 잡는다',()=>{
 const sky=createToonSky();sky.update(NIGHT,new THREE.Vector3(0,-1,0),new THREE.Vector3(0,1,0),.1,2.5);
 assert.equal(sky.uniforms.skyGain.value,.4);assert.ok(sky.uniforms.skyMilky.value>0);
 assert.ok(Math.abs(sky.uniforms.skyMilkyN.value.length()-1)<1e-6);
 assert.deepEqual(bearingDir(0).map(v=>+v.toFixed(6)+0),[0,0,-1],'북 = -z');assert.deepEqual(bearingDir(90).map(v=>+v.toFixed(6)+0),[1,0,0],'동 = +x');
 assert.match(sky.mesh.material.fragmentShader,/starLayer/);sky.dispose();
});

test('카툰 밤 노출: 노출은 1 근처, 빛만 어둡게',()=>{
 assert.equal(exposureFor(DAY),1);assert.ok(Math.abs(exposureFor(NIGHT)*2.4-1)<.05,'실사 밤 노출 2.4배를 되돌린다');
 assert.equal(lightScaleFor(DAY),1);assert.ok(lightScaleFor(SUNSET)<1&&lightScaleFor(NIGHT)<1,'노을 역광·밤은 땅을 어둡게');
});

test('도심 불빛 점: 벽에만, 상한 안에서',()=>{
 const g=new THREE.BoxGeometry(40,60,40);const dots=buildCityDots(g,{density:.01,max:500});
 assert.ok(dots.attributes.position.count>50&&dots.attributes.position.count<=500);
 const P=dots.attributes.position;for(let i=0;i<P.count;i++)assert.ok(Math.abs(P.getY(i))<30-1e-3||Math.abs(Math.abs(P.getX(i))-20)<1e-3||Math.abs(Math.abs(P.getZ(i))-20)<1e-3);
 // 지붕(y=30) 면에는 점이 없다: 벽 위 점은 x 또는 z가 ±20.
 for(let i=0;i<P.count;i++)assert.ok(Math.abs(Math.abs(P.getX(i))-20)<1e-3||Math.abs(Math.abs(P.getZ(i))-20)<1e-3);
 const city=createCityStyle(),style=city.styleCity({}),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(30,40,30)));style.apply(root);
 assert.ok(city.status.dots>0);assert.ok(root.children[0].children.some(o=>o.isPoints));
});

test('밤 도심 불빛은 크림 흰색 위주(화면 실측 주황 약 35%), 나머지만 주황. 가로등도 같은 톤',()=>{
 const c=TOON.city;assert.equal(c.cream,'#ede7c9');assert.ok(c.creamShare>=.45&&c.creamShare<=.7);
 // 색보정 보상 크림은 기준 크림과 가깝고(차 .1 이내) 더 노랗다(파랑이 낮다). 블룸에 날아가지 않게 점 밝기는 1 근처.
 const ci=hexToRgb(c.creamInput),cr=hexToRgb(c.cream);assert.ok(ci.every((v,i)=>Math.abs(v-cr[i])<.1)&&ci[2]<cr[2]);assert.ok(c.dotGain<=1.15);
 const city=createCityStyle(),lamp=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xffffff}));
 city.styleCity({nightLights:[lamp]});
 // 크림 위주: 초록·파랑이 주황 단색(#ffa64d)보다 훨씬 높다.
 const k=lamp.material.color,orange=new THREE.Color().setRGB(...hexToRgb(c.window),THREE.SRGBColorSpace);
 assert.ok(k.b/k.r>orange.b/orange.r*3,'가로등이 주황 단색이 아니다');
});
test('낮 원경 도심은 원경 안개색 쪽(흰 띠 아님)',()=>{
 const [r,g,b]=hexToRgb(TOON.city.dayHaze);assert.ok(b>r&&(r+g+b)/3<.75,'푸른 회색, 하늘 지평선(#c3dcd4)보다 어둡다');
 assert.ok(TOON.city.dayHazeAmount>=.8&&TOON.city.dayVar<=.05);
});
