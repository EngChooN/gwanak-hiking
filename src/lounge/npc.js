// NPC 동동이 4명: 옥상을 돌아다니고, 재떨이에서 가상 담배를 피우고, 서로 수다 떨고, 내 채팅에 반응한다.
// 몸은 ctx.createAvatar(온라인 등산 동동이 그대로, 옷 색만 다름), 흡연은 ctx.createSmoker.
// v2 함께(기획서 v2 B1~B4·A5): 불 빌리기·맞불(borrowLight), 한 대 건네기·받기(offerCig·acceptCig), 끼어드는 수다(TOPICS + 대답 칩 choose),
// 같이 내뿜기 구름(1초·2m 안), 내 묘기에 감탄·박수. HUD는 social()을 읽어 단추를 띄운다.
// 보내는 이벤트: 'lounge:give' {from,to,kind:'light'|'cig',mode?}, 'lounge:cloud' {ids,x,z}, 'lounge:npc-emote' {id,emote:'clap'}. 받는 이벤트: 'lounge:scene' {id}.
import {NPC_PROFILES,IDLE_LINES,SMOKE_LINES,MANNER_LINES,EMOTE_LINES,REPLIES,FALLBACK_REPLIES,NPC_CHATTER,
 LIGHT_LINES,OFFER_LINES,SYNC_LINES,TRICK_LINES,COUGH_LINES,TOPICS} from './lines.js';
import {CIG_KINDS} from './smoke-feel.js';
const pick=a=>a[Math.floor(Math.random()*a.length)];
const rnd=(a,b)=>a+Math.random()*(b-a);
const WALK=1.37*.8;

// 함께 하기 거리(m)·시간(초)
export const SOCIAL=Object.freeze({
 borrow:1.5,offer:1.5,sync:2,syncWindow:1,react:4,approach:.5,lend:2.6,
 offerEvery:[45,90],offerFirst:[25,45],offerWait:9,offerNear:2.5,
 topicFirst:[12,20],topicEvery:[35,70],topicGap:[2.2,3],chipWait:12,
});
// 상황(lounge:scene id)에 어울리는 화제 목록. 상황을 모르면 전부.
export function topicPool(scene){
 const all=Object.entries(TOPICS).map(([id,t])=>({id,...t}));
 const fit=scene?all.filter(t=>t.scenes.includes(scene)):all;
 return fit.length?fit:all;
}
// 같이 내뿜기: 두 내뿜기 시각 차가 1초 안이고 2m 안이면 구름
// 같이 피우는 사람(멀티) 채팅에 NPC가 대답하는 정도: 가끔만(확률·쉬는 시간), 한 명만, 거드는 사람 없이.
export const REMOTE_REACT=Object.freeze({chance:.3,cool:12});
export const isSyncExhale=(tA,tB,dist)=>tA!=null&&tB!=null&&Math.abs(tA-tB)<=SOCIAL.syncWindow&&dist<=SOCIAL.sync;
const UNLIT=new Set(['out','ready']); // 불 안 붙인 담배를 든 상태

export async function createNpcs(ctx){
 let collide=(x,z)=>({x,z});
 const bounds=ctx.rooftop.bounds,spots=ctx.rooftop.spots;
 const randomSpot=()=>{for(let i=0;i<12;i++){const x=rnd(bounds.minX+1,bounds.maxX-1),z=rnd(bounds.minZ+1,bounds.maxZ-1),c=collide(x,z);if(Math.hypot(c.x-x,c.z-z)<.05)return {x,z};}return {x:0,z:0};};
 const taken=new Set(); // 재떨이·벤치 자리 중복 방지
 const reserve=(list)=>{const free=(list??[]).map((s,i)=>({s,i})).filter(o=>!taken.has(list[o.i]));if(!free.length)return null;const o=pick(free);taken.add(o.s);return o.s;};
 const npcs=[];
 let idx=0;
 for(const p of NPC_PROFILES){
  const a=await ctx.createAvatar({outfit:p.outfit,name:p.name,id:p.id});
  ctx.world.add(a.root);
  const sm=ctx.createSmoker(a,{isPlayer:false});
  a.extra.push(dt=>sm.apply?.(dt,{moving:a.moving}));
  const home=spots.spawn,ang=idx*1.4+.4;
  a.place(home.x+Math.cos(ang)*(1.5+idx*.5),home.z-1.5+Math.sin(ang)*1.2,rnd(-3,3));
  npcs.push({p,a,sm,state:'idle',t:rnd(.5,3),target:null,spot:null,puffs:0,sayT:rnd(6,16),steps:0,stuck:0});
  idx++;
 }
 const byId=Object.fromEntries(npcs.map(n=>[n.p.id,n]));
 // 시계: update(dt)로만 흐른다(탭이 가려지면 같이 쉰다). 늦게 할 말은 later로.
 let clock=0;const timers=[];
 const later=(sec,fn)=>timers.push({at:clock+sec,fn});
 const say=(n,text,extra={})=>{if(!text)return;ctx.dispatch('lounge:chat',{id:n.p.id,name:n.p.name,text,...extra});};
 const sayLater=(n,text,delay,extra)=>later(delay,()=>say(n,text,extra));
 const goto=(n,t,next)=>{n.target=t;n.next=next;n.state='walk';n.stuck=0;};
 const nearest=(a,list)=>(list??[]).slice().sort((u,v)=>Math.hypot(u.x-a.x,u.z-a.z)-Math.hypot(v.x-a.x,v.z-a.z))[0];
 const me=()=>ctx.smoker,P=()=>ctx.player;
 const distTo=(n,o=P())=>Math.hypot(n.a.x-o.x,n.a.z-o.z);
 const free=n=>n.state!=='help';
 const nearestNpc=(max,ok=free)=>{let best=null,bd=max;for(const n of npcs){if(!ok(n))continue;const d=distTo(n);if(d<=bd){bd=d;best=n;}}return best;};
 const face=(n,o=P())=>{n.a.heading=Math.atan2(-(o.x-n.a.x),-(o.z-n.a.z));};

 function decide(n){
  const r=Math.random();
  if(r<.4&&spots.ashtrays?.length){
   const s=reserve(spots.ashtrays);
   if(s){n.spot=s;goto(n,{x:s.x,z:s.z,heading:s.heading},'smoke');return;}
  }
  if(r<.65&&spots.benches?.length){
   const s=reserve(spots.benches);
   if(s){n.spot=s;goto(n,{x:s.x,z:s.z,heading:s.heading},'sit');return;}
  }
  goto(n,randomSpot(),'idle');
 }
 const release=n=>{if(n.spot){taken.delete(n.spot);n.spot=null;}};
 // 한 걸음(충돌 포함). 움직인 거리를 돌려준다.
 function walkStep(n,tx,tz,dt){
  const a=n.a,dx=tx-a.x,dz=tz-a.z,d=Math.hypot(dx,dz);if(d<1e-6)return 0;
  const sp=Math.min(d,WALK*dt),want={x:a.x+dx/d*sp,z:a.z+dz/d*sp},got=collide(want.x,want.z,a),moved=Math.hypot(got.x-a.x,got.z-a.z);
  n.stuck=moved<sp*.3?n.stuck+dt:0;
  a.x=got.x;a.z=got.z;a.heading=Math.atan2(-dx,-dz);a.update(dt,{moved,running:false});return moved;
 }

 function step(n,dt){
  const a=n.a;
  if(n.state==='help'){helpStep(n,dt);return;}
  if(n.state==='walk'){
   const d=Math.hypot(n.target.x-a.x,n.target.z-a.z);
   if(d<.15||n.stuck>2.5){a.update(dt,{moved:0});if(n.target.heading!==undefined)a.heading=n.target.heading;n.state=n.next??'idle';n.t=rnd(1.5,4);n.puffs=0;n.lit=false;return;}
   walkStep(n,n.target.x,n.target.z,dt);return;
  }
  a.update(dt,{moved:0});
  if(n.state==='smoke'){
   if(n.sm.blocksMove?.())return;
   n.t-=dt;if(n.t>0)return;
   if(n.stage===undefined||n.stage==='done'){n.sm.start?.();n.stage='out';n.t=rnd(.8,1.4);return;}
   if(n.stage==='out'){n.sm.light?.();n.stage='lit';n.t=rnd(1.5,2.2);say(n,Math.random()<.5?pick(SMOKE_LINES):null);return;}
   if(n.stage==='lit'){
    if(n.puffs<rnd(3,6)){n.sm.puff?.();n.puffs++;n.t=rnd(3.2,4.5);return;}
    if(Math.random()<.6)n.sm.flick?.();n.stage='end';n.t=rnd(1,1.8);return;
   }
   if(n.stage==='end'){
    // 받은 담배처럼 재떨이 밖에서 피웠으면 재떨이까지 걸어가서 버린다
    if(!n.spot&&!n.toAsh&&spots.ashtrays?.length){n.toAsh=true;const s=nearest(a,spots.ashtrays);goto(n,{x:s.x,z:s.z,heading:s.heading},'smoke');return;}
    n.toAsh=false;n.sm.dispose?.();n.stage='done';if(Math.random()<.5)say(n,pick(MANNER_LINES));release(n);n.state='idle';n.t=rnd(2,6);return;}
  }
  if(n.state==='sit'||n.state==='idle'){n.t-=dt;if(n.t<=0){release(n);decide(n);}}
 }

 // ── B1 불 빌리기: NPC가 내 앞까지 와서 라이터를 켜 주거나(lighter), 피우던 담배 끝을 대 준다(tip = 맞불)
 function borrowLight(){
  const sm=me();if(!sm||!UNLIT.has(sm.state)||npcs.some(n=>n.state==='help'))return null;
  const n=nearestNpc(SOCIAL.borrow);if(!n)return null;
  const mode=n.sm.status?.().lit?'tip':'lighter';
  n.help={mode,phase:'come',t:0,prev:n.state,prevNext:n.next,sent:false};n.state='help';n.stuck=0;
  face(n);say(n,pick(LIGHT_LINES[mode]));
  return {id:n.p.id,name:n.p.name,mode};
 }
 function helpStep(n,dt){
  const a=n.a,h=n.help,sm=me(),d=distTo(n);h.t+=dt;
  if(h.phase==='come'){
   if(d>3.5||h.t>8||!sm||!UNLIT.has(sm.state)){endHelp(n);return;} // 내가 멀어지거나 혼자 붙였으면 그만
   if(d>SOCIAL.approach+.05&&n.stuck<1.5){walkStep(n,P().x,P().z,dt);return;}
   a.update(dt,{moved:0});face(n);
   if(sm.state!=='ready')return; // 꺼내는 중이면 다 꺼낼 때까지 기다린다
   if(!sm.lightFrom?.()){endHelp(n);return;}
   n.sm.lend?.(()=>sm.tip?.(),h.mode,SOCIAL.lend);h.phase='light';h.t=0;return;
  }
  a.update(dt,{moved:0});face(n);
  if(!h.sent&&sm?.status?.().lit){h.sent=true;ctx.dispatch('lounge:give',{from:n.p.id,to:P().id??'me',kind:'light',mode:h.mode});sayLater(n,pick(LIGHT_LINES.after),.8);}
  if(h.t>=SOCIAL.lend+.2)endHelp(n);
 }
 function endHelp(n){
  const h=n.help;n.help=null;
  const wasSmoke=h&&(h.prev==='smoke'||(h.prev==='walk'&&h.prevNext==='smoke'));
  if(n.spot&&wasSmoke){goto(n,{x:n.spot.x,z:n.spot.z,heading:n.spot.heading},'smoke');return;}
  release(n);n.state=n.sm.active&&n.stage==='lit'?'smoke':'idle';n.t=rnd(2,4);
 }

 // ── B2 한 대 건네기(나 → NPC)·받기(NPC → 나)
 function offerCig(){
  const n=nearestNpc(SOCIAL.offer);if(!n)return null;
  face(n);
  if(n.sm.active){sayLater(n,pick(OFFER_LINES.busy),.5);return {id:n.p.id,name:n.p.name,accepted:false};}
  release(n);
  n.sm.start?.(me()?.kind);n.state='smoke';n.stage='out';n.t=rnd(1,1.4);n.puffs=0;n.toAsh=false;
  ctx.dispatch('lounge:give',{from:P().id??'me',to:n.p.id,kind:'cig'});
  sayLater(n,pick(OFFER_LINES.thanks),.6);
  return {id:n.p.id,name:n.p.name,accepted:true};
 }
 let offer=null,offerT=rnd(...SOCIAL.offerFirst); // NPC가 나에게 권하는 중 {n,until,kind}
 function offerFrom(id){
  const sm=me();if(offer||!sm||sm.active)return null;
  const n=id?byId[id]:nearestNpc(SOCIAL.offerNear,c=>free(c)&&c.state!=='walk');if(!n||!free(n))return null;
  offer={n,until:clock+SOCIAL.offerWait,kind:pick(Object.keys(CIG_KINDS).filter(k=>k!=='cigar'))};
  face(n);say(n,pick(OFFER_LINES.ask));
  return {id:n.p.id,name:n.p.name,kind:offer.kind};
 }
 function acceptCig(){
  const sm=me();if(!offer||!sm||sm.active){offer=null;return null;}
  const o=offer;offer=null;
  if(!sm.start?.(o.kind))return null;
  ctx.dispatch('lounge:give',{from:o.n.p.id,to:P().id??'me',kind:'cig'});
  sayLater(o.n,pick(OFFER_LINES.give),.4);
  return {id:o.n.p.id,name:o.n.p.name,kind:o.kind};
 }
 function declineCig(){if(!offer)return false;sayLater(offer.n,pick(OFFER_LINES.decline),.4);offer=null;return true;}

 // ── B3 끼어드는 수다: 나와 가까운 NPC 둘이 화제를 주고받고, 끝나면 나에게 대답 칩. 고르면 이어진다.
 let scene=null,talk=null,lastTopic=null,topicT=rnd(...SOCIAL.topicFirst);
 const SCRIPT={scripted:true}; // 각본 대사: 다른 NPC의 즉흥 맞장구(onChat)가 끼어들지 않게
 function startTopic(id){
  if(talk)return null;
  const pool=topicPool(scene),fresh=pool.filter(t=>t.id!==lastTopic);
  const topic=id&&TOPICS[id]?{id,...TOPICS[id]}:pick(fresh.length?fresh:pool);
  const sp=npcs.filter(free).sort((u,v)=>distTo(u)-distTo(v)).slice(0,2);if(sp.length<2)return null;
  talk={topic,sp,phase:'lines',queue:topic.lines.slice(),t:.3,chipsUntil:0};lastTopic=topic.id;
  return {id:topic.id,label:topic.label,with:sp.map(n=>n.p.id)};
 }
 function choose(i){
  if(talk?.phase!=='chips')return false;const c=talk.topic.chips[i];if(!c)return false;
  ctx.dispatch('lounge:chat',{id:P().id??'me',name:ctx.profile?.nickname||'동동이',text:c.text,...SCRIPT});
  talk.phase='reply';talk.queue=c.reply.slice();talk.t=rnd(1,1.5);return true;
 }
 function endTalk(){talk=null;topicT=rnd(...SOCIAL.topicEvery);}
 function updateTalk(dt){
  if(!talk){topicT-=dt;if(topicT<=0){if(!startTopic())topicT=rnd(5,10);}return;}
  if(talk.phase==='chips'){if(clock>=talk.chipsUntil)endTalk();return;}
  talk.t-=dt;if(talk.t>0)return;
  const line=talk.queue.shift();
  if(line){say(talk.sp[line[0]]??talk.sp[0],line[1],SCRIPT);talk.t=rnd(...SOCIAL.topicGap);return;}
  if(talk.phase==='lines'){talk.phase='chips';talk.chipsUntil=clock+SOCIAL.chipWait;}else endTalk();
 }
 const onScene=e=>{const id=e.detail?.id;if(!id||id===scene)return;scene=id;if(!talk)topicT=rnd(3,6);};

 // ── B4 같이 내뿜기·A5 묘기 반응: 'lounge:smoke'를 듣는다
 const lastEx=new Map();let syncCool=0,reactCool=0;
 function syncCloud(n){
  if(syncCool>0)return false;syncCool=4;
  const p=P(),x=(p.x+n.a.x)/2,z=(p.z+n.a.z)/2;
  me()?.cloud?.({x,y:.82,z},1.2);
  ctx.dispatch('lounge:cloud',{ids:[p.id??'me',n.p.id],x,z});
  sayLater(n,pick(SYNC_LINES),.6);return true;
 }
 function reactTrick(trick){
  if(reactCool>0)return false;
  const n=nearestNpc(SOCIAL.react);if(!n)return false;reactCool=5;
  sayLater(n,pick(TRICK_LINES[trick]??TRICK_LINES.ring),.5);
  const o=nearestNpc(SOCIAL.react,c=>free(c)&&c!==n);
  for(const c of [n,o].filter(Boolean))later(.3,()=>{ctx.dispatch('lounge:npc-emote',{id:c.p.id,emote:'clap'});if(c===o)say(c,'👏👏👏');});
  return true;
 }
 const onSmoke=e=>{
  const d=e.detail??{};
  const mine=d.id===(P().id??'me');
  if(!mine&&!byId[d.id])return;
  if(d.state==='exhale'){
   lastEx.set(d.id,clock);
   if(mine){
    for(const n of npcs)if(isSyncExhale(clock,lastEx.get(n.p.id),distTo(n))&&syncCloud(n))break;
    if(d.trick)reactTrick(d.trick);
    else if(d.quality==='cough'&&Math.random()<.5){const n=nearestNpc(SOCIAL.react);if(n)sayLater(n,pick(COUGH_LINES),.7);}
   }else{const n=byId[d.id];if(isSyncExhale(clock,lastEx.get(P().id??'me'),distTo(n)))syncCloud(n);}
  }
  else if(mine&&d.state==='trick')reactTrick(d.trick);
  // 내가 들이마시기 시작하면 옆에서 피우던 NPC가 가끔 따라 한 모금(같이 내뿜을 기회)
  else if(mine&&d.state==='inhale'){
   for(const n of npcs)if(n.state==='smoke'&&n.stage==='lit'&&n.sm.state==='smoking'&&distTo(n)<=SOCIAL.sync&&Math.random()<.6){n.sm.puff?.();n.t=Math.max(n.t,3.2);break;}
  }
 };

 const onChat=e=>{
  const {id,text}=e.detail??{};if(!text||e.detail.scripted)return;
  const fromMe=id==='me',depth=e.detail.depth??0;
  if(e.detail.remote&&!fromMe){ // 다른 사람 채팅: 가끔 가까운 NPC 한 명이 받아 준다
   if(remoteCool>0||Math.random()>REMOTE_REACT.chance)return;remoteCool=REMOTE_REACT.cool;
   const n=pick(npcs.filter(free));if(!n)return;const hit=REPLIES.find(r=>r.re.test(text));
   sayLater(n,hit?pick(hit.say):pick(FALLBACK_REPLIES),rnd(1.2,2.6),{depth:2});return;}
  if(!fromMe&&!byId[id])return;
  if(!fromMe&&(depth>=2||Math.random()>.35))return; // NPC끼리 대화는 길게 이어지지 않게
  const cands=npcs.filter(n=>n.p.id!==id);
  if(!cands.length)return;
  const n=fromMe?byId[nearest(ctx.player,cands.map(c=>c.a)).id]:pick(cands);
  const hit=REPLIES.find(r=>r.re.test(text)),line=hit?pick(hit.say):pick(fromMe?FALLBACK_REPLIES:NPC_CHATTER);
  const delay=rnd(.9,2.2);
  sayLater(n,line,delay,{depth:fromMe?1:depth+1});
  // 말 걸었으니 가까운 다른 동동이 한 명이 가끔 거든다
  if(fromMe&&Math.random()<.35){const o=pick(cands.filter(c=>c!==n));if(o)sayLater(o,pick(NPC_CHATTER),delay+rnd(1.5,3));}
 };
 const onEmote=e=>{
  const k=e.detail?.emote;if(!EMOTE_LINES[k])return;
  const n=nearest(ctx.player,npcs.map(c=>c.a));const nn=n&&byId[n.id];if(nn)sayLater(nn,pick(EMOTE_LINES[k]),rnd(.8,1.6));
 };
 window.addEventListener('lounge:chat',onChat);window.addEventListener('lounge:emote',onEmote);
 window.addEventListener('lounge:smoke',onSmoke);window.addEventListener('lounge:scene',onScene);

 let chatCool=0,remoteCool=0;
 return {
  avatars:npcs.map(n=>n.a),
  setCollide(fn){collide=fn;},
  update(dt){
   clock+=dt;chatCool-=dt;remoteCool-=dt;syncCool-=dt;reactCool-=dt;
   if(timers.length){const due=timers.filter(t=>t.at<=clock);if(due.length){for(const t of due)timers.splice(timers.indexOf(t),1);for(const t of due)t.fn();}}
   for(const n of npcs){
    step(n,dt);
    n.sayT-=dt;
    if(n.sayT<=0){n.sayT=rnd(14,32);if(n.state!=='walk'&&!talk&&chatCool<=0){chatCool=rnd(3,6);say(n,pick(IDLE_LINES));}}
   }
   updateTalk(dt);
   if(offer&&(clock>=offer.until||me()?.active||distTo(offer.n)>SOCIAL.offerNear+1.5))offer=null;
   offerT-=dt;if(offerT<=0){offerT=rnd(...SOCIAL.offerEvery);offerFrom();}
  },
  // HUD가 읽는 지금 할 수 있는 일
  social(){
   const sm=me(),helping=npcs.some(n=>n.state==='help');
   const nb=!helping&&sm&&UNLIT.has(sm.state)?nearestNpc(SOCIAL.borrow):null,no=nearestNpc(SOCIAL.offer);
   return {
    borrow:nb?{id:nb.p.id,name:nb.p.name,mode:nb.sm.status?.().lit?'tip':'lighter'}:null,
    helping,
    offer:no&&!offer?{id:no.p.id,name:no.p.name}:null,
    incoming:offer?{id:offer.n.p.id,name:offer.n.p.name,kind:offer.kind}:null,
    topic:talk?{id:talk.topic.id,label:talk.topic.label,phase:talk.phase}:null,
    chips:talk?.phase==='chips'?talk.topic.chips.map(c=>c.text):null,
    scene,
   };
  },
  borrowLight,offerCig,offerFrom,acceptCig,declineCig,startTopic,choose,
  get scene(){return scene;},
  status(){return npcs.map(n=>({id:n.p.id,name:n.p.name,state:n.state,stage:n.stage??null,x:+n.a.x.toFixed(2),z:+n.a.z.toFixed(2),outfit:n.a.outfit,help:n.help?.mode??null}));},
 };
}
