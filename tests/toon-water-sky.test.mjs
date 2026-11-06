import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TOON,skyFor,waterFor,exposureFor,lightScaleFor,bearingDir,hexToRgb} from '../src/toon/palette.js';
import {createToonWater,buildRingGeometry,buildSprayGeometry,curveLedges,SPRAY_PER} from '../src/toon/water.js';
import {buildStreamGeometry,buildFallGeometry,streamWaterMaterial,fallWaterMaterial,bedRockMaterial,streamRock,ledgeRaise,streamLedge,STREAM_ROCK_CELL,FALL_ROWS,FALL_COLS} from '../src/stream-water.js';
import {buildCityDots,sampleCityDots,createCityStyle,trafficGeometry,CITY_LOOK,CITY_UNIFORMS} from '../src/toon/city.js';
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

test('물보라: 낙수 아래 끝마다 SPRAY_PER개, 막의 아래 끝(착수 자리) 바로 곁에서 나온다',()=>{
 const built=buildStreamGeometry(line,flat,0,1,ledgeRaise),fallGeo=buildFallGeometry(built.samples,flat);
 const per=FALL_ROWS*FALL_COLS.length,falls=fallGeo.attributes.position.count/per,s=buildSprayGeometry(fallGeo);
 assert.ok(Number.isInteger(falls)&&falls>0);assert.equal(s.attributes.position.count,falls*SPRAY_PER);assert.equal(s.attributes.aSeed.itemSize,4);
 const P=fallGeo.attributes.position,Q=s.attributes.position;
 for(let f=0;f<falls;f++){const last=f*per+(FALL_ROWS-1)*FALL_COLS.length;
  for(let k=0;k<SPRAY_PER;k++){const i=f*SPRAY_PER+k;let d=Infinity;for(let c=0;c<FALL_COLS.length;c++)d=Math.min(d,Math.hypot(Q.getX(i)-P.getX(last+c),Q.getZ(i)-P.getZ(last+c)));
   assert.ok(d<.9,`물보라 ${i}가 막 아래 끝에서 ${d.toFixed(2)}m`);assert.ok(Math.abs(Q.getY(i)-P.getY(last))<.15,'착수 높이');}}
});

// 낙수 곡선(2026-11-06): 각진 판 대신 턱에서 수평으로 떠나 포물선으로 떨어진다.
test('낙수 막: 여러 단 포물선(위 끝 접선 수평, 내려갈수록 가팔라짐), uv는 곡선 길이를 따라 커진다',()=>{
 const built=buildStreamGeometry(line,flat,0,1,ledgeRaise),g=buildFallGeometry(built.samples,flat),P=g.attributes.position,U=g.attributes.uv,C=FALL_COLS.length,mid=Math.floor(C/2);
 assert.ok(FALL_ROWS>=8,'단이 충분하다');
 const per=FALL_ROWS*C;
 for(let base=0;base<P.count;base+=per){
  const pt=j=>({h:Math.hypot(P.getX(base+j*C+mid)-P.getX(base+mid),P.getZ(base+j*C+mid)-P.getZ(base+mid)),y:P.getY(base+j*C+mid),v:U.getY(base+j*C+mid)});
  let prevSlope=-1,prevV=-1;
  for(let j=1;j<FALL_ROWS;j++){const a=pt(j-1),b=pt(j),slope=(a.y-b.y)/Math.max(1e-6,b.h-a.h);
   assert.ok(b.y<a.y,'아래로');assert.ok(b.h>a.h,'앞으로');assert.ok(slope>prevSlope-1e-6,'점점 가팔라진다(꺾인 판이 아니다)');prevSlope=slope;
   assert.ok(b.v>prevV);prevV=b.v;}
  const first=(pt(0).y-pt(1).y)/(pt(1).h-pt(0).h),last=(pt(FALL_ROWS-2).y-pt(FALL_ROWS-1).y)/(pt(FALL_ROWS-1).h-pt(FALL_ROWS-2).h);
  assert.ok(first<.5,`위 끝은 거의 수평 ${first.toFixed(2)}`);assert.ok(last>first*5,'아래는 가파르다');
  assert.equal(U.getY(base+mid),0);assert.ok(Math.abs(U.getY(base+(FALL_ROWS-1)*C+mid)-1)<1e-6);
 }
});

test('카툰 물 띠: 낙수 턱의 수직 벽을 포물선 단으로 바꾸고, 낙수 막과 같은 곡선 위에 놓인다',()=>{
 const built=buildStreamGeometry(line,flat,0,1,ledgeRaise),g=built.geometry,rows0=g.attributes.position.count/7;
 const falls=buildFallGeometry(built.samples,flat).attributes.position.count/(FALL_ROWS*FALL_COLS.length);
 const n=curveLedges(g,7,3);assert.equal(n,falls,'턱마다 하나');
 const P=g.attributes.position,S=g.attributes.aStream,rows=P.count/7;
 assert.ok(rows>=rows0+falls*(FALL_ROWS-3)&&rows<=rows0+falls*(FALL_ROWS-2),'턱마다 아래 행(0.3m 안쪽 1~2개)이 곡선 FALL_ROWS-1행으로 바뀐다');assert.equal(g.index.count,(rows-1)*6*6);assert.equal(g.attributes.aFrame.count,P.count);
 // 이웃 행 사이 가운데 열의 경사: 수직 벽(수평 0.02m에 수십 cm 낙차)이 없어야 한다. 포물선 끝 기울기는 2h/reach 안쪽.
 let steepest=0;for(let k=1;k<rows;k++){const a=(k-1)*7+3,b=k*7+3,dh=Math.hypot(P.getX(b)-P.getX(a),P.getZ(b)-P.getZ(a)),dy=Math.abs(P.getY(b)-P.getY(a));if(dy>.01)steepest=Math.max(steepest,dy/Math.max(dh,1e-6));
  assert.ok(S.getY(b)>=S.getY(a)-1e-9,'along은 계속 커진다');}
 assert.ok(steepest<4,`가장 가파른 단 기울기 ${steepest.toFixed(2)}`);
 // 다시 불러도 바뀌지 않는다(턱이 이미 곡선).
 assert.equal(curveLedges(g,7,3),0);
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

test('도심 불빛 점: 벽에만, 상한 안에서, 고층 위쪽 표시. LOD와 무관한 도심 전체 한 묶음',()=>{
 const g=new THREE.BoxGeometry(40,60,40);const dots=buildCityDots(g,{density:.01,max:500});
 assert.ok(dots.attributes.position.count>50&&dots.attributes.position.count<=500);
 // 지붕(y=30) 면에는 점이 없다: 벽 위 점은 x 또는 z가 ±20.
 const P=dots.attributes.position;for(let i=0;i<P.count;i++)assert.ok(Math.abs(Math.abs(P.getX(i))-20)<1e-3||Math.abs(Math.abs(P.getZ(i))-20)<1e-3);
 // seoulInfo(높이 100m)가 있으면 위쪽 40% 점만 고층 표시(분홍·자홍 후보).
 const t=new THREE.BoxGeometry(30,100,30).translate(0,50,0),n=t.attributes.position.count,info=new Float32Array(n*3);for(let i=0;i<n;i++)info.set([.4,0,100],i*3);t.setAttribute('seoulInfo',new THREE.BufferAttribute(info,3));
 const tall=new Map(),s=sampleCityDots(t,{density:.01,max:2000},tall);
 for(let i=0;i<s.aTall.length;i++)assert.equal(s.aTall[i],s.position[i*3+1]>60?1:0);
 assert.equal(tall.size,1,'90m 이상 고층은 빛무리 하나');
 const city=createCityStyle(),style=city.styleCity({}),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(30,40,30)));style.apply(root);
 const later=new THREE.Mesh(t);root.add(later);
 assert.ok(city.status.dots>0);assert.equal(later.material,style.material,'나중에 들어온 칸도 바뀐다');
 city.update({...NIGHT,fogColor:[.2,.2,.3]});
 const pts=root.getObjectByName('도심 불빛 점');assert.ok(pts?.isPoints&&pts.visible,'밤에는 전 도심 점 한 묶음이 보인다');
 assert.equal(pts.geometry.attributes.position.count,city.status.dots);assert.ok(pts.parent.parent===root,'칸 메시가 아니라 도시 루트에 붙어 LOD로 숨지 않는다');
 city.update(DAY);assert.equal(pts.visible,false,'낮에는 그리지 않는다');
});

test('밤 불빛 색은 크림 위주(크림 55·푸른 흰 25·청록 12·노랑 8%), 가로등도 크림 쪽',()=>{
 const l=CITY_LOOK.light;assert.ok(Math.abs(l.share.reduce((a,b)=>a+b,0)-1)<1e-9);assert.ok(l.share[0]>=.5);
 const cr=hexToRgb(l.cream);assert.ok(cr.every((v,i)=>Math.abs(v-hexToRgb('#ede7c9')[i])<.1),'기준 크림 #ede7c9 근처');
 const city=createCityStyle(),lamp=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xffffff}));
 city.styleCity({nightLights:[lamp]});
 const k=lamp.material.color,orange=new THREE.Color().setRGB(...hexToRgb('#ffa64d'),THREE.SRGBColorSpace);
 assert.ok(k.b/k.r>orange.b/orange.r*3,'가로등이 주황 단색이 아니다');
});

test('도심 연무색은 시간대를 따른다: 노을·밤에 낮 하늘색을 칠하지 않는다(하늘색 얼룩 회귀 방지)',()=>{
 const city=createCityStyle(),U=CITY_UNIFORMS,fog=[.6,.65,.75];
 city.update({...DAY,fogColor:fog});const day=U.cityHaze.value.clone();assert.ok(U.cityDay.value>.9);
 city.update({...SUNSET,elevation:-1,fogColor:fog});const dusk=U.cityHaze.value.clone();
 assert.ok(U.citySunset.value>.8&&U.cityDay.value<.1,'해 진 직후는 노을 가중치');
 assert.ok(dusk.r>dusk.g&&dusk.b>dusk.g,'노을 연무는 라벤더(빨강·파랑 > 초록)');
 assert.ok(day.b>day.r,'낮 연무는 푸른빛');
 assert.ok(U.cityLights.value>.2,'해 진 직후에도 창 불빛이 켜지기 시작한다');
 city.update({...NIGHT,fogColor:fog});assert.ok(U.cityHaze.value.getHSL({}).l<dusk.getHSL({}).l,'밤 연무는 더 어둡다');
 // 쌍안경 배율이 전달되면 픽셀 각도가 그만큼 작아진다(불빛 점 솎기·연무 감소).
 const cam=new THREE.PerspectiveCamera(60,1,.1,1000);city.update({...NIGHT},cam);const a1=U.cityPxAngle.value;cam.zoom=8;city.update({...NIGHT},cam);
 assert.equal(U.cityZoom.value,8);assert.ok(Math.abs(U.cityPxAngle.value*8-a1)<1e-9);
});

test('차량 불빛 줄기: 간선도로·다리만 양 차선, 반대 방향',()=>{
 const roads=[{kind:'primary',width:16,points:[[0,0],[300,0]]},{kind:'tertiary',width:9,points:[[0,50],[300,50]]},{kind:'tertiary',width:9,bridge:true,points:[[0,100],[100,100]]}];
 const g=trafficGeometry(roads,()=>10);
 const P=g.attributes.position,D=g.attributes.aDir;
 assert.ok(![...Array(P.count).keys()].some(i=>Math.abs(P.getZ(i)-50)<5),'작은 도로(tertiary)는 빼고');
 assert.ok([...Array(P.count).keys()].some(i=>Math.abs(P.getZ(i)-100)<5),'다리는 넣는다');
 assert.ok(new Set([...D.array]).size===2,'양 방향');
 for(let i=0;i<P.count;i++)if(Math.abs(P.getZ(i))<10)assert.ok(Math.abs(P.getY(i)-12.5)<1e-6,'지면 2.5m 위');
 const style=createCityStyle().styleCity({}),parent=new THREE.Group();const line=style.styleRoads(roads,()=>10,parent);
 assert.ok(line.isLineSegments&&line.parent===parent);
});

test('한강 카툰 물: 월드 좌표 물결만(화면 좌표 줄무늬 없음), 랜드마크는 도심 재질',()=>{
 const style=createCityStyle().styleCity({}),m=style.riverMaterial();
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
 m.onBeforeCompile(shader);assert.doesNotMatch(shader.fragmentShader,/vViewPosition\.x/);assert.match(shader.fragmentShader,/cityRiverNight/);
 assert.equal(style.riverMaterial(),m,'한 번만 만든다');
 const g=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),label=new THREE.Sprite();label.userData.seoulLabel=true;g.add(body,label);
 style.applyLandmark(g);assert.equal(body.material,style.material);assert.ok(label.material.isSpriteMaterial,'이름표는 그대로');
});
