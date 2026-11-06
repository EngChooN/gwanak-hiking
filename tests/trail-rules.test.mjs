// 즐길거리 HUD 규칙(src/trail-rules.js): 초콜릿 5개·30초 +20%·겹침 없음·저장, 벤치 1.5배, 들르기 버튼(자동걷기 6m·4초·한 번), 동물 상한.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CHOCO_MAX,chocoCount,canEatChocolate,eatChocolate,tickChocolate,chocoSpeed,formatBoost,restoreChocolates,benchRecoverRate,SIT_RECOVER,offerVisible,trailBarView,TRAIL_BUTTONS} from '../src/trail-rules.js';
import {initialState,restore,advance} from '../src/movement.js';
import {nearestOffer,pickAnimals,OFFER_REACH} from '../src/trail-world.js';
import {MOBILE_LIMITS,DESKTOP_LIMITS} from '../src/device-profile.js';
import {TRAIL_RULES} from '../src/interaction-data.js';

test('초콜릿: 처음 5개, 먹으면 하나 줄고 30초 동안 +20%', ()=>{
 const s=initialState({start:'demo'});
 assert.equal(CHOCO_MAX,5);assert.equal(s.chocolates,5);assert.equal(chocoCount(s),5);
 assert.equal(chocoSpeed(s),1);
 assert.ok(eatChocolate(s));assert.equal(s.chocolates,4);assert.equal(s.chocoLeft,30);
 assert.equal(chocoSpeed(s),1.2);assert.equal(chocoSpeed(s,{stairs:true}),1,'계단 리듬은 그대로');
 tickChocolate(s,29.5);assert.equal(chocoSpeed(s),1.2);
 tickChocolate(s,1);assert.equal(s.chocoLeft,0);assert.equal(chocoSpeed(s),1);
});
test('초콜릿: 효과가 남은 동안·다른 동작 중·0개면 못 먹는다(겹침 없음)', ()=>{
 const s=initialState({start:'demo'});
 eatChocolate(s);assert.equal(canEatChocolate(s),false);assert.equal(eatChocolate(s),false);assert.equal(s.chocolates,4,'겹쳐 먹어도 줄지 않음');
 tickChocolate(s,30);assert.equal(canEatChocolate(s,{busy:true}),false);assert.equal(canEatChocolate(s),true);
 for(let i=0;i<10;i++){eatChocolate(s);tickChocolate(s,31);}
 assert.equal(s.chocolates,0);assert.equal(canEatChocolate(s),false);
});
test('초콜릿: 개수는 이어하기 저장에 남고, 효과 시간은 남기지 않는다', ()=>{
 const s=initialState({start:'demo'});eatChocolate(s);eatChocolate(s);tickChocolate(s,31);eatChocolate(s);
 const r=restore(JSON.stringify(s));assert.equal(r.chocolates,3);assert.equal(r.chocoLeft,0);
 assert.equal(restore(JSON.stringify({...s,chocolates:undefined})).chocolates,5,'예전 저장은 5개');
 assert.equal(restoreChocolates(99),5);assert.equal(restoreChocolates(-2),0);assert.equal(restoreChocolates(2.7),2);
 assert.equal(formatBoost(28.2),'0:29');assert.equal(formatBoost(30),'0:30');assert.equal(formatBoost(0),'0:00');
});
test('초콜릿: 실제 이동 거리가 1.2배(흙길 1,500m, 자동 걷기), 계단은 그대로', ()=>{
 const run=(eat,at=1500)=>{const s=initialState({start:'demo'});s.s=at;s.auto=true;if(eat)eatChocolate(s);let d=0;for(let i=0;i<20;i++)d+=advance(s,{forward:0,side:0},.05)*.05;return {d,s};};
 const a=run(false),b=run(true);assert.ok(a.d>0);
 assert.ok(Math.abs(b.d/a.d-1.2)<.02,`비율 ${b.d/a.d}`);
 const sa=run(false,4381.3),sb=run(true,4381.3);assert.ok(Math.abs(sb.d/sa.d-1)<1e-9,'깔딱고개 나무계단(deck_stairs)은 리듬 그대로');
});
test('벤치: 앉아 쉬면 땅에 앉을 때보다 1.5배 빨리 찬다', ()=>{
 assert.equal(benchRecoverRate(),SIT_RECOVER*1.5);
 const ground=initialState({start:'demo'}),bench=initialState({start:'demo'});
 ground.stamina=bench.stamina=20;ground.pose='sit';
 advance(ground,{},1/10);advance(bench,{benchRest:true},1/10);
 assert.ok(Math.abs((bench.stamina-20)/(ground.stamina-20)-1.5)<1e-9);
 const idle=initialState({start:'demo'});idle.stamina=20;advance(idle,{},1/10);assert.ok(idle.stamina<bench.stamina,'그냥 서 있을 때보다 빠르다');
});
test('들르기 버튼: 자동걷기 중 6m 안에서만, 4초 뒤 사라지고, 한 번 지날 때 한 번', ()=>{
 assert.equal(TRAIL_RULES.dropIn,6);assert.equal(TRAIL_RULES.offer,4);
 const items=[{id:'bench-1',kind:'bench',x:0,z:0}],offered=new Set();
 assert.equal(nearestOffer([7,0,0],items,offered),null,'6m 밖');
 const o=nearestOffer([5.5,0,0],items,offered);assert.equal(o?.id,'bench-1');offered.add(o.id);
 assert.equal(nearestOffer([3,0,0],items,offered),null,'같은 오브젝트는 다시 안 띄움');
 nearestOffer([13,0,0],items,offered);assert.equal(nearestOffer([5,0,0],items,offered)?.id,'bench-1','12m 넘게 멀어졌다 오면 다시');
 const offer={until:4};
 assert.ok(offerVisible(offer,{now:3.9,auto:true}));
 assert.ok(!offerVisible(offer,{now:4,auto:true}),'4초 뒤');
 assert.ok(!offerVisible(offer,{now:1,auto:false}),'자동걷기를 끄면');
 assert.ok(!offerVisible(offer,{now:1,auto:true,busy:true}),'들른 동안');
});
test('즐길거리 줄: 들르기·기구 버튼·역기 연타·일어나기 우선순위', ()=>{
 const offer={id:'gym-1',act:'gym-lift',label:'💪 산스장 들르기',until:4};
 assert.equal(trailBarView({offer,auto:true,now:1}).mode,'offer');
 assert.equal(trailBarView({offer,auto:true,now:5}).mode,'none');
 const near=trailBarView({near:{id:'gym-1',kind:'gym'},auto:false});
 assert.equal(near.mode,'near');assert.deepEqual(near.buttons.map(b=>b.act),['gym-lift','gym-hang','gym-twist','gym-bar']);
 assert.equal(trailBarView({near:{id:'gym-1',kind:'gym'},auto:true}).mode,'none','자동걷기 중에는 들르기 버튼만');
 for(const k of ['bench','airgun','cat'])assert.equal(TRAIL_BUTTONS[k].length,1);
 assert.deepEqual(trailBarView({act:{name:'gym-lift',state:'hold',reps:3,of:10},busy:true}),{mode:'lift',reps:3,of:10});
 assert.equal(trailBarView({act:{name:'gym-lift',state:'hold',reps:10,done:true},busy:true}).mode,'none');
 assert.equal(trailBarView({act:{name:'bench-sit',state:'hold'},busy:true}).mode,'stand-up');
 assert.equal(trailBarView({act:{name:'gym-hang',state:'hold'},busy:true,offer,auto:true,now:1}).mode,'none','동작 중에는 들르기 안 띄움');
});
test('동물 상한: 휴대폰·PC 모두 3마리, 효과 수와 말풍선도 device-profile에', ()=>{
 assert.equal(MOBILE_LIMITS.trailAnimals,3);assert.equal(DESKTOP_LIMITS.trailAnimals,3);
 assert.equal(MOBILE_LIMITS.trailBubbles,1);assert.ok(MOBILE_LIMITS.trailEffects<=DESKTOP_LIMITS.trailEffects);
 const c=Array.from({length:8},(_,i)=>({id:'a'+i,x:i*3,z:0}));
 assert.equal(pickAnimals([0,0,0],c,new Map(),{max:MOBILE_LIMITS.trailAnimals}).length,3);
 assert.deepEqual(pickAnimals([0,0,0],c,new Map(),{max:3}),['a0','a1','a2'],'가까운 순');
});
test('⑥ 쥐: 발끝 당기기 버튼이 가장 먼저, 헥헥 중에는 다른 버튼 없음', ()=>{
 assert.equal(trailBarView({exhaust:{phase:'cramp',release:true},near:{id:'b',kind:'bench'}}).mode,'cramp');
 assert.equal(trailBarView({exhaust:{phase:'cramp',release:false},near:{id:'b',kind:'bench'}}).mode,'none','누른 뒤 1초는 버튼 없음');
 assert.equal(trailBarView({exhaust:{phase:'pant',release:false},near:{id:'b',kind:'bench'}}).mode,'none');
 assert.equal(trailBarView({exhaust:{phase:'none'},near:{id:'b',kind:'bench'}}).mode,'near');
});
test('들르기 거리는 소품 가장자리부터: 길에서 가운데가 6.2m인 산스장도 자동걷기로 뜬다', ()=>{
 const gym=[{id:'gym',kind:'gym',x:6.2,z:0,r:OFFER_REACH.gym}];
 assert.equal(nearestOffer([0,0,0],gym,new Set())?.id,'gym');
 assert.equal(nearestOffer([0,0,0],[{...gym[0],r:0}],new Set()),null,'가운데로 재면 안 뜸(예전 동작)');
 assert.equal(nearestOffer([-4,0,0],gym,new Set()),null,'가장자리에서 6m 넘으면 안 뜸');
});
