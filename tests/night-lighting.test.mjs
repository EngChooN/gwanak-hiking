import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PARK_END_S,PARK_LAMP_SPACING,REAL_LIGHT_COUNT,HEADLAMP,OTHERS,lampStations,lampAmount,headlampDark,headlampOn,nearestLamps,selectOthers,mountFor,crowdFromSearch,PLAZA_LAMPS,FACILITY_LAMPS} from '../src/night-lighting-config.js';
import {createNightLighting} from '../src/night-lighting.js';
import {sunPosition,composeEnvironment,moonPosition,resolveUtcMs} from '../src/daytime.js';

test('가로등 배치: 공원 구간(0~제1광장 갈림)에 25~30m 간격, 그 위 산길에는 없다',()=>{
 const s=lampStations();
 assert.ok(PARK_LAMP_SPACING>=25&&PARK_LAMP_SPACING<=30);
 assert.ok(s.length>=35&&s.length<=44,`등 개수 ${s.length}`);
 assert.ok(s.every((v,i)=>i===0||Math.abs(v-s[i-1]-PARK_LAMP_SPACING)<1e-9));
 assert.ok(s.at(-1)<=PARK_END_S&&s[0]>=0);
 assert.ok(PARK_END_S>1000&&PARK_END_S<1150,'0~1.1km 구간');
 assert.ok(PLAZA_LAMPS.some(l=>l.boost>1.2),'일주문 주변이 더 밝다');
 assert.ok(FACILITY_LAMPS.length>=1&&FACILITY_LAMPS.length<=2,'시설 보안등 1~2개');
});
test('자동 점등: 해가 높으면 꺼짐, 진 뒤 켜짐, 점점 밝아진다',()=>{
 assert.equal(lampAmount(30),0);assert.equal(lampAmount(10),0);
 assert.ok(lampAmount(0)>0&&lampAmount(0)<1);assert.equal(lampAmount(-10),1);
 assert.ok(lampAmount(-1)>lampAmount(1));
 const t=(h,m)=>resolveUtcMs({time:`${h}:${String(m).padStart(2,'0')}`,nowMs:Date.UTC(2026,10,3,3,0)}).utcMs;
 assert.equal(lampAmount(sunPosition(t(13,0)).elevation),0,'서울 11/3 낮 13시 꺼짐');
 assert.equal(lampAmount(sunPosition(t(22,0)).elevation),1,'밤 22시 켜짐');
});
test('헤드랜턴: 밤 산길에서 자동 점등, 공원·광장·낮에는 꺼짐, L키(override)가 우선',()=>{
 assert.equal(headlampDark(20),0);assert.equal(headlampDark(-10),1);
 assert.equal(headlampOn({dark:1,zone:'route',s:2000}),true);
 assert.equal(headlampOn({dark:1,zone:'route',s:500}),false,'공원 구간은 가로등');
 assert.equal(headlampOn({dark:1,zone:'plaza',s:0}),false);
 assert.equal(headlampOn({dark:0,zone:'route',s:2000}),false,'낮');
 assert.equal(headlampOn({dark:1,zone:'route',s:2000,override:false}),false,'수동 끄기');
 assert.equal(headlampOn({dark:0,zone:'route',s:100,override:true}),true,'수동 켜기');
 assert.ok(HEADLAMP.reach===15&&HEADLAMP.distance>=15);
 const ups=['none','bandana','cap','panama'].map(k=>mountFor(k).up);
 assert.ok(ups.every(v=>v>0)&&mountFor('x').up===mountFor('none').up);
});
test('가까운 가로등 선택과 다른 사람 선택(상한·거리 단계)',()=>{
 const lamps=Array.from({length:10},(_,i)=>({x:i*27,z:0}));
 assert.deepEqual(nearestLamps(lamps,30,0,2),[1,2]);assert.equal(nearestLamps(lamps,0,0).length,REAL_LIGHT_COUNT);
 const people=Array.from({length:100},(_,i)=>({x:i*2,z:0}));
 const pick=selectOthers(people,0,0);
 assert.equal(pick.glow.length,OTHERS.cap);assert.equal(pick.glow[0],0);
 assert.ok(pick.decal.length<=pick.glow.length&&pick.decal.every(i=>people[i].x<=OTHERS.decalRange));
 const far=selectOthers([{x:300,z:0}],0,0);assert.equal(far.glow.length,0);
 const mid=selectOthers([{x:80,z:0}],0,0);assert.deepEqual([mid.glow.length,mid.decal.length],[1,0]);
 assert.equal(crowdFromSearch('?crowd=50'),50);assert.equal(crowdFromSearch('?crowd=9999'),300);assert.equal(crowdFromSearch(''),0);
});
const build=(search='')=>{
 const scene=new THREE.Scene();
 const place=(s,l)=>[s*.8+l*.2,10,s*.6];const night=createNightLighting({scene,place,groundHeight:()=>10,gatePoint:(gx,gz)=>({x:-gz,z:gx}),facilityPoints:[{x:3000,z:3000,tx:3002,tz:3000},{x:3100,z:3000,tx:3102,tz:3000}],search:`${search}&time=22:00`,nowMs:()=>Date.UTC(2026,10,3,3,0)});
 const camera=new THREE.PerspectiveCamera(65,1.6,.08,3000);camera.position.set(500,11.6,300);
 return {scene,night,camera};
};
const lightCount=scene=>{let n=0;scene.traverse(o=>{if(o.isLight)n++;});return n;};
const materials=scene=>{const set=new Set();scene.traverse(o=>{for(const m of [].concat(o.material??[]))set.add(m);});return set.size;};
test('실제 광원은 항상 5개(가로등 풀 4 + 내 헤드랜턴 1)이고 그림자를 만들지 않는다',()=>{
 const {scene,night}=build();
 assert.equal(lightCount(scene),REAL_LIGHT_COUNT+1);
 scene.traverse(o=>{if(o.isLight)assert.equal(o.castShadow,false);});
 assert.equal(night.head.isSpotLight,true);
 assert.equal(night.info().lampStations,lampStations().length);
});
test('밤에 가로등이 켜지고 낮에는 꺼진다(광원 수는 그대로, intensity만 변경)',()=>{
 const night=build('?x=1'),day=(()=>{const scene=new THREE.Scene();const n=createNightLighting({scene,place:(s,l)=>[s,10,l],groundHeight:()=>10,search:'?time=13:00',nowMs:()=>Date.UTC(2026,10,3,3,0)});const camera=new THREE.PerspectiveCamera();camera.position.set(100,11,0);return {scene,n,camera};})();
 for(let i=0;i<120;i++){night.night.update(.1,{camera:night.camera,zone:'route',s:600});day.n.update(.1,{camera:day.camera,zone:'route',s:600});}
 const on=night.night.pool.map(l=>l.intensity),off=day.n.pool.map(l=>l.intensity);
 assert.ok(on.filter(v=>v>10).length>=2,`밤 풀 intensity ${on}`);assert.ok(off.every(v=>v===0),`낮 풀 intensity ${off}`);
 assert.equal(lightCount(night.scene),lightCount(day.scene));
 assert.equal(night.night.head.intensity,0,'공원 구간(s=600)에서는 헤드랜턴 자동 점등 안 함');
});
test('헤드랜턴: 산길 자동 점등, L키 토글, 끌 때 intensity 0, 3인칭 램프 표시',()=>{
 const {scene,night,camera}=build();const avatar=new THREE.Group();avatar.position.set(500,10,300);
 const step=(o={})=>{for(let i=0;i<60;i++)night.update(.1,{camera,avatar,zone:'route',s:2500,view:'first',...o});};
 step();assert.ok(night.head.intensity>5);assert.equal(night.head.castShadow,false);
 const target=night.head.target.position.clone().sub(night.head.position);assert.ok(Math.abs(target.length()-HEADLAMP.reach)<.01,'앞길 15m');assert.ok(target.y<0,'아래를 비춘다');
 night.toggleHeadlamp();step();assert.ok(night.head.intensity<1,'수동 끄기');
 night.toggleHeadlamp();step({view:'third'});assert.ok(night.head.intensity>5);
 const own=night.root.children.find(o=>o.isGroup&&o.visible);assert.ok(own,'3인칭 이마 램프 표시');
 step({view:'first'});assert.equal(night.root.children.filter(o=>o.isGroup&&o.visible).length,0,'1인칭에서는 숨김');
 assert.equal(lightCount(scene),REAL_LIGHT_COUNT+1);
});
test('다인원: 사람 수가 0→100→300명으로 늘어도 광원 수·재질 수(=셰이더 컴파일 수)·그리는 개수 상한이 그대로',()=>{
 const {scene,night,camera}=build();const avatar=new THREE.Group();
 const run=()=>{for(let i=0;i<10;i++)night.update(.1,{camera,avatar,zone:'route',s:2500,view:'first'});};
 run();const lights0=lightCount(scene),mats0=materials(scene);
 for(const n of [1,50,100,300]){
  night.setOthers(Array.from({length:n},(_,i)=>({x:500+(i%40)*3-40,y:10,z:300+Math.floor(i/40)*5,heading:i*.3,color:0x335577})));run();
  assert.equal(lightCount(scene),lights0,`${n}명 광원 수`);assert.equal(materials(scene),mats0,`${n}명 재질 수`);
  const d=night.info().othersDrawn;assert.ok(d.glows<=OTHERS.cap&&d.decals<=d.glows&&d.bodies<=OTHERS.bodyCap,JSON.stringify(d));
 }
 assert.equal(night.info().othersDrawn.glows,OTHERS.cap);
 const spots=[];scene.traverse(o=>{if(o.isSpotLight)spots.push(o);});assert.equal(spots.length,1,'SpotLight는 내 것 1개');
 let drawObjects=0;scene.traverse(o=>{if(o.isMesh||o.isPoints)drawObjects++;});
 night.setOthers([]);let after=0;scene.traverse(o=>{if(o.isMesh||o.isPoints)after++;});assert.equal(drawObjects,after,'다른 사람 수와 무관하게 드로우 객체 수 고정');
});
test('가짜 등산객 ?crowd=N 부하 시험 생성',()=>{
 const {night,camera}=build('?crowd=100');const avatar=new THREE.Group();
 for(let i=0;i<30;i++)night.update(.1,{camera,avatar,zone:'route',s:2500,view:'first'});
 assert.equal(night.info().crowd,100);assert.equal(night.others.length,100);
 assert.ok(night.info().realLights===REAL_LIGHT_COUNT+1);
});
test('밤 전체 밝기: 감성 분위기 조정으로 달빛·주변광을 더 올렸지만 밤 느낌은 유지',()=>{
 const t=resolveUtcMs({time:'22:00',nowMs:Date.UTC(2026,10,3,3,0)}).utcMs;
 const e=composeEnvironment({sun:sunPosition(t),moon:moonPosition(t)});
 assert.ok(e.ambient>.18&&e.ambient<.35);assert.ok(e.night===1&&e.light.intensity<.4);
});

test('헤드랜턴: 빛 원점은 얼굴 앞(머리 반지름 밖)이고, 셀카에서도 같은 원점·뒤쪽은 비추지 않으며 광원 수는 그대로',()=>{
 const {scene,night,camera}=build();const avatar=new THREE.Group();avatar.position.set(500,10,300);
 const step=(o={})=>{for(let i=0;i<60;i++)night.update(.1,{camera,avatar,zone:'route',s:2500,view:'first',...o});};
 const count=()=>{let n=0;scene.traverse(o=>{if(o.isLight)n++;});return n;};const before=count();
 for(const o of [{view:'third'},{view:'first',selfie:true}]){
  step(o);const ahead=night.head.position.clone().sub(avatar.position).setY(0).length();
  assert.ok(ahead>=.3&&ahead<.5,`원점 앞 ${ahead}`);
  const axis=night.head.target.position.clone().sub(night.head.position).setY(0).normalize(),face=avatar.position.clone().sub(night.head.position).setY(0).normalize();
  assert.ok(axis.dot(face)<0,'얼굴은 원뿔 뒤쪽(빛 안 받음)');
 }
 step({view:'first',selfie:true});const fill=night.pool.find(l=>l.intensity>0&&l.distance<5);
 assert.ok(fill&&fill.intensity<1,'셀카 얼굴 반사광은 아주 약하다');
 step({view:'first'});assert.ok(night.pool.every(l=>l.distance>=20),'셀카가 끝나면 광원 복귀');
 assert.equal(count(),before,'실제 광원 수 그대로');
});
