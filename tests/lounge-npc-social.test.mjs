// NPC와 함께(기획서 v2 B1~B4·A5): 가짜 동동이(뼈 이름만 같은 빈 뼈대) + 진짜 smoke.js로 npc.js를 돌려 본다.
// 불 빌리기·맞불, 한 대 건네기·받기, 끼어드는 수다(대답 칩·상황별 화제), 같이 내뿜기 구름, 묘기 반응.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const bus=new EventTarget();
globalThis.window??=globalThis;
globalThis.addEventListener??=bus.addEventListener.bind(bus);globalThis.removeEventListener??=bus.removeEventListener.bind(bus);globalThis.dispatchEvent??=bus.dispatchEvent.bind(bus);
globalThis.CustomEvent??=class extends Event{constructor(t,o){super(t);this.detail=o?.detail;}};
globalThis.performance??={now:()=>Date.now()};
const events=[];
for(const t of ['lounge:chat','lounge:give','lounge:cloud','lounge:npc-emote','lounge:smoke'])addEventListener(t,e=>events.push({type:t,...e.detail}));
const {createSmoker}=await import('../src/lounge/smoke.js');
const {createNpcs,SOCIAL,isSyncExhale,topicPool}=await import('../src/lounge/npc.js');
const {TOPICS,TRICK_LINES,SYNC_LINES,OFFER_LINES}=await import('../src/lounge/lines.js');

function fakeAvatar(id){
 const model=new THREE.Group(),root=new THREE.Group();root.add(model);
 const bone=(n,parent,p)=>{const b=new THREE.Bone();b.name='mixamorig'+n;b.position.set(...p);parent.add(b);return b;};
 const spine=bone('Spine',model,[0,.45,0]);bone('Head',spine,[0,.25,0]);
 for(const [s,x] of [['Right',-1],['Left',1]]){const a=bone(s+'Arm',spine,[.12*x,.08,0]),f=bone(s+'ForeArm',a,[.11*x,0,0]);bone(s+'Hand',f,[.11*x,0,0]);}
 const a={id,root,hiker:{model},x:0,z:0,heading:0,moving:false,outfit:'shirt',extra:[],
  place(x,z,h=0){a.x=x;a.z=z;a.heading=h;a.sync();},
  sync(){root.position.set(a.x,0,a.z);root.rotation.y=a.heading;root.updateMatrixWorld(true);},
  update(dt,{moved=0}={}){a.moving=moved>0;a.sync();for(const f of a.extra)f(dt);}};
 root.updateMatrixWorld(true);return a;
}
let seq=0;
// 옥상 10×10, 재떨이 하나. 내 동동이는 (0,0).
async function setup(){
 const world=new THREE.Group(),player=fakeAvatar(`me-${++seq}`),smokers={};
 const smoker=createSmoker(player,{world,isPlayer:true,ashtrays:[]});
 const ctx={THREE,world,player,smoker,profile:{nickname:'나'},
  rooftop:{bounds:{minX:-5,maxX:5,minZ:-5,maxZ:5},spots:{spawn:{x:0,z:3,heading:0},ashtrays:[{x:4,z:4,heading:0,at:{x:4,y:.72,z:4}}],benches:[]}},
  dispatch:(type,detail)=>dispatchEvent(new CustomEvent(type,{detail})),
  createAvatar:async o=>fakeAvatar(o.id),
  createSmoker:(a,o)=>(smokers[a.id]=createSmoker(a,{world,...o,ashtrays:[]}))};
 const npcs=await createNpcs(ctx);
 const av=Object.fromEntries(npcs.avatars.map(a=>[a.id,a]));
 // 미나만 가까이, 나머지는 멀리(4m 넘게)
 av['npc-mina'].place(.9,0);av['npc-jihoon'].place(-4.5,-4.5);av['npc-bomi'].place(4.5,-4.5);av['npc-daeho'].place(-4.5,4.5);
 const run=(sec,step=1/30)=>{for(let t=0;t<sec;t+=step){player.update(step);smoker.apply(step);npcs.update(step);}};
 return {ctx,npcs,smoker,smokers,player,av,run,mark:events.length};
}
const since=(m,type)=>events.slice(m).filter(e=>e.type===type);

test('B1 불 빌리기: 불 안 붙인 담배 + 1.5m 안 NPC → 와서 라이터로 붙여 주고 lounge:give light',async()=>{
 const {npcs,smoker,player,av,run,mark}=await setup();
 assert.equal(npcs.social().borrow,null,'담배가 없으면 버튼 없음');
 smoker.start('mild');run(1);assert.equal(smoker.state,'ready');
 av['npc-mina'].place(.9,0); // 1초 동안 혼자 돌아다녔을 수 있어서 다시 옆에 세운다
 const s=npcs.social();assert.equal(s.borrow?.id,'npc-mina');assert.equal(s.borrow.mode,'lighter');
 const r=npcs.borrowLight();assert.equal(r.mode,'lighter');
 assert.equal(npcs.status().find(n=>n.id==='npc-mina').help,'lighter');
 // 붙여 준 뒤에는 다시 돌아다녀서 멀어질 수 있으니, 불이 붙는 그 순간의 거리를 잰다
 let litDist=Infinity;const onGive=()=>{litDist=Math.hypot(av['npc-mina'].x,av['npc-mina'].z);};
 addEventListener('lounge:give',onGive);run(4);removeEventListener?.('lounge:give',onGive);
 assert.equal(smoker.status().lit,true,'내 담배에 불이 붙음');assert.equal(smoker.state,'smoking');
 const g=since(mark,'lounge:give');assert.equal(g.length,1);assert.deepEqual([g[0].from,g[0].to,g[0].kind,g[0].mode],['npc-mina',player.id,'light','lighter']);
 assert.ok(litDist<=SOCIAL.approach+.1,`NPC가 내 앞까지 와서 붙여 줌 (${litDist})`);
 assert.equal(npcs.status().find(n=>n.id==='npc-mina').help,null,'다 붙이면 돌아감');
});

test('B1 맞불: NPC가 피우는 중이면 mode tip, 멀면(1.5m 밖) 버튼 없음',async()=>{
 const {npcs,smoker,smokers,av,run,mark}=await setup();
 smokers['npc-mina'].start('menthol');run(1);smokers['npc-mina'].light();smoker.start();run(3);
 assert.equal(smokers['npc-mina'].status().lit,true);
 av['npc-mina'].place(2.4,0);run(.1);assert.equal(npcs.social().borrow,null,'1.5m 밖');
 av['npc-mina'].place(1,0);run(.1);
 assert.equal(npcs.social().borrow?.mode,'tip');assert.equal(npcs.borrowLight().mode,'tip');
 run(4);assert.equal(smoker.status().lit,true);assert.equal(since(mark,'lounge:give').at(-1).mode,'tip');
});

test('B2 한 대 권하기: 가까운 NPC가 받아서 피우고 고맙다고 함, 피우는 중이면 사양',async()=>{
 const {npcs,smokers,player,run,mark}=await setup();
 assert.equal(npcs.social().offer?.id,'npc-mina');
 const r=npcs.offerCig();assert.equal(r.accepted,true);
 const g=since(mark,'lounge:give');assert.deepEqual([g[0].from,g[0].to,g[0].kind],[player.id,'npc-mina','cig']);
 run(4);assert.equal(smokers['npc-mina'].status().lit,true,'받은 담배에 불 붙임');
 assert.ok(since(mark,'lounge:chat').some(c=>c.id==='npc-mina'&&OFFER_LINES.thanks.includes(c.text)),'고맙다는 말');
 assert.equal(npcs.offerCig().accepted,false,'이미 피우는 중');
});

test('B2 받기: NPC가 권하면 incoming → 받기로 내 담배가 나옴(lounge:give cig)',async()=>{
 const {npcs,smoker,player,run,mark}=await setup();
 const o=npcs.offerFrom('npc-mina');assert.ok(o);
 assert.equal(npcs.social().incoming?.id,'npc-mina');
 const r=npcs.acceptCig();assert.equal(r.id,'npc-mina');assert.equal(smoker.state,'out');assert.equal(smoker.kind,o.kind);
 const g=since(mark,'lounge:give').at(-1);assert.deepEqual([g.from,g.to,g.kind],['npc-mina',player.id,'cig']);
 assert.equal(npcs.social().incoming,null);run(1);assert.equal(smoker.state,'ready');
 // 거절하면 사라지고, 시간이 지나도 사라진다
 smoker.dispose(false);run(1.5);npcs.offerFrom('npc-mina');assert.equal(npcs.declineCig(),true);assert.equal(npcs.social().incoming,null);
 npcs.offerFrom('npc-mina');run(SOCIAL.offerWait+.5);assert.equal(npcs.social().incoming,null);
});

test('B3 끼어드는 수다: 화제 몇 줄 → 대답 칩 3개 → 고르면 내 말 + NPC 대답이 이어짐',async()=>{
 const {npcs,player,run,mark}=await setup();
 const t=npcs.startTopic('lunch');assert.equal(t.id,'lunch');assert.equal(t.with.length,2);
 run(12);
 const lines=since(mark,'lounge:chat').filter(c=>c.scripted&&c.id!==player.id).map(c=>c.text);
 assert.deepEqual(lines,TOPICS.lunch.lines.map(l=>l[1]));
 const s=npcs.social();assert.equal(s.chips.length,3);assert.equal(s.topic.phase,'chips');
 const m2=events.length;assert.equal(npcs.choose(1),true);
 const mine=since(m2,'lounge:chat')[0];assert.equal(mine.id,player.id);assert.equal(mine.text,TOPICS.lunch.chips[1].text);
 run(8);
 assert.deepEqual(since(m2,'lounge:chat').filter(c=>c.scripted&&c.id!==player.id).map(c=>c.text),TOPICS.lunch.chips[1].reply.map(l=>l[1]));
 assert.equal(npcs.social().topic,null,'대화 끝');assert.equal(npcs.choose(0),false);
});

test('B3 상황(lounge:scene)에 따라 화제가 바뀌고, 칩을 안 고르면 저절로 끝남',async()=>{
 for(const k of ['boss','lunch','offwork','quitfail','stocks'])assert.ok(TOPICS[k],k);
 for(const t of Object.values(TOPICS)){assert.ok(t.chips.length>=2&&t.chips.length<=3);assert.ok(t.lines.length>=2);}
 for(const id of ['morning','lunch','evening','afterparty']){const p=topicPool(id);assert.ok(p.length>=2,id);assert.ok(p.every(t=>t.scenes.includes(id)));}
 assert.equal(topicPool(null).length,Object.keys(TOPICS).length);
 const {npcs,ctx,run}=await setup();
 ctx.dispatch('lounge:scene',{id:'afterparty'});assert.equal(npcs.scene,'afterparty');
 run(7);const s=npcs.social();assert.ok(s.topic,'상황이 바뀌면 곧 수다 시작');assert.ok(TOPICS[s.topic.id].scenes.includes('afterparty'));
 run(9+SOCIAL.chipWait+1);assert.equal(npcs.social().topic,null,'안 고르면 끝');
});

test('B4 같이 내뿜기: 2m·1초 안이면 큰 구름 + 반응 대사, 멀거나 늦으면 없음',async()=>{
 assert.equal(isSyncExhale(10,10.8,1.5),true);assert.equal(isSyncExhale(10,11.2,1.5),false);assert.equal(isSyncExhale(10,10.5,2.5),false);assert.equal(isSyncExhale(10,undefined,1),false);
 const {npcs,ctx,smoker,player,av,run,mark}=await setup();
 ctx.dispatch('lounge:smoke',{id:'npc-mina',state:'exhale'});run(.5);
 const before=smoker.status().smoke;
 ctx.dispatch('lounge:smoke',{id:player.id,state:'exhale',isPlayer:true});
 const c=since(mark,'lounge:cloud');assert.equal(c.length,1);assert.deepEqual(c[0].ids,[player.id,'npc-mina']);
 assert.ok(smoker.status().smoke>=before+4,'큰 구름 뭉게');
 run(1);assert.ok(since(mark,'lounge:chat').some(e=>e.id==='npc-mina'&&SYNC_LINES.includes(e.text)));
 // 4초 뒤: 멀면(3m) 구름 없음
 run(4);av['npc-mina'].place(3,0);const m2=events.length;
 ctx.dispatch('lounge:smoke',{id:'npc-mina',state:'exhale'});run(.3);ctx.dispatch('lounge:smoke',{id:player.id,state:'exhale',isPlayer:true});
 assert.equal(since(m2,'lounge:cloud').length,0);
 void npcs;
});

test('A5 묘기 반응: 내 링이 나오면 가까운 NPC가 감탄 + 박수, 5초 안에는 한 번만',async()=>{
 const {ctx,player,av,run,mark}=await setup();
 av['npc-bomi'].place(-1.5,0);run(.05);
 ctx.dispatch('lounge:smoke',{id:player.id,state:'trick',trick:'ring',isPlayer:true});run(1);
 const said=since(mark,'lounge:chat').filter(e=>e.id==='npc-mina');assert.ok(said.some(e=>TRICK_LINES.ring.includes(e.text)),'감탄');
 assert.ok(since(mark,'lounge:npc-emote').some(e=>e.emote==='clap'),'박수 이모트');
 assert.ok(since(mark,'lounge:chat').some(e=>e.id==='npc-bomi'&&e.text==='👏👏👏'),'옆 NPC 박수');
 const m2=events.length;ctx.dispatch('lounge:smoke',{id:player.id,state:'exhale',trick:'nose',isPlayer:true});run(1);
 assert.equal(since(m2,'lounge:npc-emote').length,0,'쿨다운');
});
