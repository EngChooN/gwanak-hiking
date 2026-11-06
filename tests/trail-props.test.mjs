// 자동걷기 즐길거리(2026-11-06): 규칙(들르기 6m·4초, 동물 3마리, 초콜릿 5개·30초·+20%), 자리(길 밖·평평·길을 보고), 형상, 동동이 동작.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Vector3,Quaternion} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {assignSurfaceRoute} from '../src/route-surfaces.js';
import {routeMeasure} from '../assets/realistic/interaction-sites.js';
import {entranceFrame} from '../assets/realistic/entrance-scenery.js';
import {TRAIL_PROPS,CAT_SPOTS,TRAIL_RULES} from '../src/interaction-data.js';
import {MOBILE_LIMITS,DESKTOP_LIMITS} from '../src/device-profile.js';
import {resolveTrailSites,resolveTrailSite,TRAIL_FOOTPRINT} from '../src/trail-sites.js';
import {nearestOffer,pickAnimals,OFFER_ACT} from '../src/trail-world.js';
import {trailPropTemplate,trailPropTriangles,makeTrailProp,BENCH,GYM} from '../src/toon/trail-props.js';
import {buildToonHikerGltf} from '../src/toon/link-hiker.js';
import {createRealisticHiker} from '../src/realistic-hiker.js';
import {createHikerActs,ACT_SECONDS,HAT_RETURN_SECONDS,LIFT_REPS,DIZZY_SECONDS} from '../src/toon/hiker-acts.js';

globalThis.window??=new EventTarget();
const route=assignSurfaceRoute(JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url))));
const frames={gate:entranceFrame(route)};

test('즐길거리 규칙 값: 들르기 6m·4초, 동물 동시 3마리(휴대폰·PC), 초콜릿 5개·30초·+20%',()=>{
 assert.equal(TRAIL_RULES.dropIn,6);assert.equal(TRAIL_RULES.offer,4);
 assert.equal(MOBILE_LIMITS.trailAnimals,3);assert.equal(DESKTOP_LIMITS.trailAnimals,3);
 assert.equal(TRAIL_RULES.chocolates,5);assert.equal(TRAIL_RULES.chocoSeconds,30);assert.equal(TRAIL_RULES.chocoSpeed,1.2);
 assert.equal(HAT_RETURN_SECONDS,2,'에어건: 모자는 2초 뒤 떨어진다');assert.equal(LIFT_REPS,10,'득근 게이지 10칸');
 assert.ok(TRAIL_PROPS.every(p=>p.est),'모든 즐길거리 자리는 게임 속 배치(est)');
});

test('들르기 제안: 6m 안에서 한 번 지나갈 때 한 번만, 12m 넘게 멀어지면 다시',()=>{
 const items=[{id:'bench-a',kind:'bench',x:0,z:0}],offered=new Set();
 assert.equal(nearestOffer([6.5,0,0],items,offered),null,'6.5m는 아직');
 assert.equal(nearestOffer([5.9,0,0],items,offered)?.id,'bench-a');offered.add('bench-a');
 assert.equal(nearestOffer([3,0,0],items,offered),null,'같은 지나감에서는 다시 띄우지 않는다');
 nearestOffer([12.5,0,0],items,offered);assert.equal(offered.has('bench-a'),false,'멀어지면 지운다');
 assert.equal(nearestOffer([4,0,0],items,offered)?.id,'bench-a');
 // 둘 다 6m 안이면 가까운 쪽
 assert.equal(nearestOffer([0,0,0],[{id:'far',x:5,z:0},{id:'near',x:1,z:0}],new Set()).id,'near');
 assert.deepEqual(OFFER_ACT,{gym:'gym-lift',bench:'bench-sit',airgun:'airgun',cat:'pet-cat'});
});

test('동물은 동시에 3마리까지, 가까운 순, 나와 있던 것은 떠날 거리(60m)까지 유지',()=>{
 const c=[0,5,10,15,20,50].map((x,i)=>({id:`a${i}`,x,z:0}));
 assert.deepEqual(pickAnimals([0,0,0],c,new Map()),['a0','a1','a2']);
 assert.equal(pickAnimals([0,0,0],c,new Map(),{max:5}).length,5);
 // 45m 밖 새 동물은 나오지 않지만, 이미 나와 있던 a5(50m)는 남는다
 assert.deepEqual(pickAnimals([0,0,0],[c[5]],new Map()),[]);assert.deepEqual(pickAnimals([0,0,0],[c[5]],new Map([['a5',{}]])),['a5']);
 // 도망가 숨은(gone) 동물은 고르지 않는다
 assert.deepEqual(pickAnimals([0,0,0],[{...c[0],gone:true},c[1]],new Map()),['a1']);
});

// 지형: 길 쪽으로 기울고 굴곡이 있는 면(평평한 자리를 고르는지 본다)
const height=(x,z)=>50+x*.02+z*.03+.25*Math.sin(x*.7)*Math.cos(z*.5);
const {sites,cats,clearSites}=resolveTrailSites(route,height,{frames});
const measure=routeMeasure(route);
test('즐길거리 자리: 산스장 1·벤치 5·먼지털이기 1이 모두 놓이고 길 밖에 있다',()=>{
 const count=k=>sites.filter(s=>s.kind===k).length;
 assert.equal(count('gym'),1);assert.equal(count('bench'),5);assert.equal(count('airgun'),1);assert.equal(cats.length,CAT_SPOTS.length);
 for(const s of sites.filter(x=>x.kind!=='airgun')){const near=measure.nearest(s.x,s.z),w=measure.at(near.m).width/2;
  const reach=s.kind==='gym'?GYM.radius:.35;assert.ok(near.d-reach>=w-.05,`${s.id}: 길 가운데선 ${near.d.toFixed(2)}m, 소품 끝이 노면(${w.toFixed(2)}m) 안`);}
 // 벤치는 1,540·1,710·2,156m 부근(±25m)과 깔딱고개 전후
 for(const [id,m,tol] of [['bench-1540',1540,25],['bench-1710',1710,25],['bench-2156',2156,25],['bench-kkal-before',3640,45],['bench-kkal-after',4425,110]]){const s=sites.find(x=>x.id===id);assert.ok(Math.abs(s.routeMetres-m)<=tol,`${id} ${s.routeMetres}m`);}
 // 산스장은 계곡 쉼터(팔각정 2,392m) 근처
 const gym=sites.find(s=>s.kind==='gym');assert.ok(Math.abs(gym.routeMetres-2392)<=90,`산스장 ${gym.routeMetres}m`);
 // 먼지털이기는 일주문 곁(광장 안 15m 이내)
 const a=sites.find(s=>s.kind==='airgun'),g=frames.gate;assert.ok(Math.hypot(a.x-g.x,a.z-g.z)<15);
 assert.equal(clearSites.length,sites.length,'나무·풀 비우기 자리');assert.ok(clearSites.find(c=>c.id==='gym').supportRadius>=GYM.radius);
});
test('즐길거리 자리: 벤치·산스장 앞(+Z)이 길을 보고, 둘레 높이 차가 작은 자리를 고른다',()=>{
 for(const s of sites.filter(x=>x.kind==='bench'||x.kind==='gym')){const near=measure.nearest(s.x,s.z),p=measure.at(near.m),to=new Vector3(p.x-s.x,0,p.z-s.z).normalize();
  const front=new Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw));assert.ok(front.dot(to)>.8,`${s.id} 정면이 길을 본다 ${front.dot(to).toFixed(2)}`);}
 // 같은 범위를 탐색하지 않고 자료 자리에 그대로 둔 경우보다 평평해야 한다
 const gym=sites.find(s=>s.kind==='gym'),spec=TRAIL_PROPS.find(p=>p.kind==='gym'),fixed=resolveTrailSite({...spec,search:{from:spec.m,to:spec.m,step:1,offsets:[spec.search.offsets[0]]}},{measure,height,frames});assert.ok(gym.slope<=fixed.slope+1e-9,`탐색 ${gym.slope} ≤ 자료 자리 ${fixed.slope}`);
 const ring=TRAIL_FOOTPRINT.gym.ring.map(([lx,lz])=>height(gym.x+lx*Math.cos(gym.yaw)+lz*Math.sin(gym.yaw),gym.z-lx*Math.sin(gym.yaw)+lz*Math.cos(gym.yaw)));
 assert.ok(Math.max(...ring)-Math.min(...ring)<.8,`산스장 바닥 높이 차 ${gym.slope}`);
 // 벤치는 가장 높은 다리에 맞춘다(묻히지 않음, 낮은 쪽은 받침돌)
 for(const s of sites.filter(x=>x.kind==='bench')){const legs=TRAIL_FOOTPRINT.bench.ring.map(([lx,lz])=>height(s.x+lx*Math.cos(s.yaw)+lz*Math.sin(s.yaw),s.z-lx*Math.sin(s.yaw)+lz*Math.cos(s.yaw)));assert.ok(s.y>=Math.max(...legs)-.03,`${s.id} 다리가 묻힘`);}
});

test('즐길거리 형상: 시안 치수(벤치 좌석 0.42m·길이 1.5m, 산스장 반지름 3.4m), 텍스처 없음, 삼각형 상한',()=>{
 const b=new Box3().setFromObject(trailPropTemplate('bench'));assert.ok(Math.abs(b.max.x-b.min.x-BENCH.length)<.08,`벤치 길이 ${b.max.x-b.min.x}`);
 let seat=0;trailPropTemplate('bench').traverse(o=>{if(o.isMesh&&!o.userData.outline&&Math.abs(o.position.y-.42)<.001)seat++;});assert.equal(seat,3,'좌석 판 3장');
 const g=new Box3().setFromObject(trailPropTemplate('gym'));assert.ok(g.max.x-g.min.x>=6.7&&g.max.x-g.min.x<7.2,`산스장 흙 원판 지름 ${g.max.x-g.min.x}`);
 for(const k of ['gym','bench','airgun','squirrel','cat','cat-belly','magpie','magpie-fly']){
  trailPropTemplate(k).traverse(o=>{if(o.isMesh&&!o.userData.textPlane)assert.equal(o.material.map??null,null,`${k}: 텍스처 없음`);});}
 const tri=Object.fromEntries(['gym','bench','airgun','squirrel','cat','magpie'].map(k=>[k,trailPropTriangles(k)]));
 assert.ok(tri.gym<60000&&tri.bench<2000&&tri.airgun<12000,JSON.stringify(tri));
 for(const k of ['squirrel','cat','magpie'])assert.ok(tri[k]<15000,`${k} ${tri[k]}`);
 // 인스턴스는 형상·재질을 원형과 나눠 쓴다(새 버퍼 없음)
 const a=makeTrailProp('squirrel'),geos=new Set();trailPropTemplate('squirrel').traverse(o=>o.isMesh&&geos.add(o.geometry));let shared=true;a.traverse(o=>{if(o.isMesh&&!geos.has(o.geometry))shared=false;});assert.ok(shared);
});

async function parse(path){
 globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
 const buf=readFileSync(new URL(path,import.meta.url)),warn=console.warn;console.warn=()=>{};
 try{return await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');}finally{console.warn=warn;}
}
const flat=()=>0;
async function setup(){const g=buildToonHikerGltf(await parse('../assets/toon/models/hiker/Hiker.glb'));const h=createRealisticHiker(g);const world={children:[],add(...o){this.children.push(...o);},remove(o){this.children=this.children.filter(x=>x!==o);}};
 // world 대신 진짜 Group(소품 형상이 붙는다)
 const {Group}=await import('three');const W=new Group();W.add(h.scene);const acts=createHikerActs(h,{world:W});
 const step=(dt=1/30)=>{h.update({clip:'Idle',dt,surfaceHeight:flat});h.ground({moving:false,phase:0,surfaceHeight:flat});acts.apply(dt);};return {h,acts,step,W};}
const bonesFinite=h=>{let ok=true;h.model.traverse(o=>{if(o.isBone&&(!o.quaternion.toArray().every(Number.isFinite)||!o.position.toArray().every(Number.isFinite)))ok=false;});return ok;};

test('동동이: 모자·배낭이 따로 된 메시(떨어지기·내려놓기)이고 바인드 자세·얼굴 자리를 남긴다',async()=>{
 const g=buildToonHikerGltf(await parse('../assets/toon/models/hiker/Hiker.glb'));
 for(const n of ['ToonHiker_Hat','ToonHiker_Pack','ToonHiker_lineHat','ToonHiker_linePack'])assert.ok(g.scene.getObjectByName(n),n);
 assert.ok(g.scene.userData.restPose.mixamorigHips&&g.scene.userData.face.eyes.length===2);
 const hat=new Box3().setFromObject(g.scene.getObjectByName('ToonHiker_Hat'));assert.ok(hat.max.y>.98&&hat.min.y>.75,`모자 높이 ${hat.min.y}~${hat.max.y}`);
});

test('동동이 동작: 모든 동작이 끝까지 돌고(뼈 NaN 없음) 끝나면 몸·모자·배낭·스틱이 제자리로',async()=>{
 const {h,acts,step}=await setup();const M=new (await import('three')).Matrix4();
 for(const name of Object.keys(ACT_SECONDS)){
  if(name==='choco')assert.ok(acts.eatChocolate(30));else assert.ok(acts.start(name,{frame:M,auto:true,groundY:flat,local:[0,0,-.5]}));
  let t=0;while(acts.active&&t<40){step();t+=1/30;assert.ok(bonesFinite(h),`${name} ${t.toFixed(2)}s 뼈 NaN`);}
  assert.equal(acts.active,null,`${name} 끝남`);const st=acts.status();assert.equal(st.hatDetached,false);assert.equal(st.packDetached,false);
  assert.deepEqual(st.poles,[true,true],`${name} 뒤 스틱 보임(true)`);
  assert.ok(h.model.position.toArray().every(x=>Math.abs(x)<1e-6),`${name} 뒤 몸 위치 ${h.model.position.toArray()}`);}
 for(let i=0;i<Math.ceil(DIZZY_SECONDS*30)+2;i++)step();assert.equal(acts.dizzy,0,'비틀거림은 2초 뒤 끝');
});

test('동작 세부: 에어건 모자 2초 비행·툭, 거꾸리 거꾸로, 벤치 배낭 내려놓기, 역기 10회, 초콜릿 30초',async()=>{
 const {h,acts,step}=await setup();const M=new (await import('three')).Matrix4();const run=(sec)=>{for(let t=0;t<sec;t+=1/30)step();};
 acts.start('airgun',{frame:M,groundY:flat});run(.9);assert.equal(acts.status().hatDetached,false);
 run(.5);assert.equal(acts.status().hatDetached,true,'1.05초에 모자가 날아간다');run(1.5);assert.equal(acts.status().hatDetached,true,'2초 동안 떠 있다');
 run(1.1);assert.equal(acts.status().hatDetached,false,'2초 뒤 머리 위로 떨어져 다시 쓴다');acts.cancel();
 acts.start('gym-hang',{frame:M,groundY:flat,target:makeTrailProp('gym')});run(3);
 const up=new Vector3(0,1,0).applyQuaternion(h.model.getWorldQuaternion(new Quaternion()));assert.ok(up.y<-.8,`거꾸로 매달림 up.y=${up.y.toFixed(2)}`);assert.equal(acts.status().hatDetached,true,'모자가 땅에 떨어져 있다');acts.cancel();
 acts.start('bench-sit',{frame:M,groundY:flat,auto:false});run(1.6);assert.equal(acts.status().packDetached,true);assert.ok(acts.active,'들르기가 아니면(auto:false) 일어나기 전까지 앉아 있다');run(10);assert.ok(acts.active);acts.stop();run(1.2);assert.equal(acts.active,null);
 const gym=makeTrailProp('gym');acts.start('gym-lift',{frame:M,groundY:flat,target:gym});run(1);assert.equal(gym.getObjectByName('barbell').visible,false,'받침의 역기를 머리에 인다');run(6);assert.equal(acts.active,null);assert.equal(gym.getObjectByName('barbell').visible,true);
 acts.start('gym-lift',{frame:M,groundY:flat,target:gym,auto:false});run(.7);for(let i=0;i<LIFT_REPS;i++)assert.equal(acts.press(),i+1);assert.equal(acts.press(),0,'다 채우면 더 세지 않는다');acts.cancel();
 assert.ok(acts.eatChocolate(30));assert.equal(acts.boost,30);run(5);assert.ok(Math.abs(acts.boost-25)<.2,`남은 효과 ${acts.boost}`);
});
