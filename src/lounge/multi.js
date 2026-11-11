// 흡연장 실시간 멀티(2026-11-08): 같은 방 사람의 동동이·위치·담배 상태·채팅을 서버(또는 같은 브라우저 창끼리)로 주고받는다.
// 전송·규격은 등산과 같은 파일을 그대로 쓴다(src/multi-transport.js·src/multi-protocol.js, docs/멀티-서버-운영안내.md §3-1·§3-2).
//  - 서버 주소(?server= → VITE_MULTI_SERVER_URL)가 있으면 WebSocket {experience:'smoking'}, 없으면 BroadcastChannel(gwanak-multi:smoking:방).
//  - 위치 s {q,z:0,x,y,h,v,f}: 움직이면 10Hz, 서 있으면 1초에 한 번. 순간 이동(자리 옮기기·teleport)이면 f|=FLAG.jump.
//  - 채팅: HUD가 내는 'lounge:chat' {id:'me'}(각본 대사 scripted는 빼고)를 {t:'c'}로 보낸다. 받은 c는 'lounge:chat' {id,name,text,remote:true}로 흘린다.
//    서버가 되돌려 준 내 글(id===내 ID)은 이미 그렸으니 다시 그리지 않는다.
//  - 담배: 내 smoke.js가 내는 'lounge:smoke'(isPlayer, id 'me')에서 상태가 바뀔 때만 {t:'lounge:smoke',state,lit}. 받는 쪽이 같은 smoke.js로 손·불씨·연기를 그린다.
//  - 행동 상태(11-10): spots.act() {p 자세·b 벤치·can 캔·sip 한 모금 횟수}가 바뀔 때만 {t:'act',a}. 받는 쪽은 spots.js createPoser(내 몸과 같은 코드)로
//    난간 기대기·벤치 걸터앉기·캔(자판기에서 떨어짐·손에 듦·한 모금)을 그린다. 서버가 마지막 act를 기억해 중간에 온 사람·다시 붙은 뒤에도 보인다.
//    전에는 위치(앉음 표시 FLAG.sit은 그리지도 않음)와 담배만 보내 상대 화면에서는 그냥 서 있었다.
//  - 다른 사람 몸: 동동이 그대로 + 회사원 옷(outfit.js). 상대가 고른 옷은 아직 보내지 않고 ID로 결정적으로 고른다(remoteOutfit).
//  - NPC 4명은 사람이 들어와도 그대로 둔다(기본값). NPC는 사람 채팅에도 가끔 대답한다(npc.js REMOTE_REACT).
// 화면(참가 카드·상태 칩·이름표)은 multi-ui.js. 이 파일과는 'lounge:multi-status' 이벤트와 반환 객체로 만난다.
import {createWebSocketTransport,createBroadcastTransport,multiServerUrl,createBackgroundTimer} from '../multi-transport.js';
import {anonymousName,sanitizeName,createInterpolator,decodeState,FLAG,NET,findServer,PRESENCE,createPresence,sanitizeAct} from '../multi-protocol.js';
import {OUTFITS} from './outfit.js';
import {createPoser,applyRemoteAct,newPoseState} from './spots.js';

export const DEFAULT_ROOM='옥상-1';
export const EXPERIENCE='smoking';
export const MULTI=Object.freeze({
 sendHz:NET.sendHz,      // 움직일 때 위치 전송(회/초)
 idleSend:1,             // 서 있을 때도 이 간격(초)으로 보내 살아 있음을 알린다
 announce:3,             // 이름 알림(j) 간격(초)
 timeout:6,              // 이만큼 소식이 없으면 목록에서 뺀다(초, 내 컴퓨터 모드). 서버 모드는 PRESENCE.serverTimeout(서버가 나감을 알려 줌)
 jumpDist:1.2,           // 한 번에 이만큼(+달리기 속도×시간) 넘게 옮기면 순간 이동으로 본다(m)
 cap:{desktop:6,mobile:3}, // 몸(뼈대 캐릭터)으로 그리는 다른 사람 수. 나머지는 이름표만
});
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const OUTFIT_KEYS=Object.keys(OUTFITS);
// 상대 옷: ID로 정해지는 회사원 옷 4종 중 하나(같은 사람은 어느 화면에서나 같은 옷)
export const remoteOutfit=id=>OUTFIT_KEYS[hash(id)%OUTFIT_KEYS.length];
// 다른 사람 아바타 ID(NPC id·'me'와 겹치지 않게)
export const avatarId=id=>`p:${id}`;

// 주소에서 참가 설정: ?multi=방(있으면 바로 참가) &name= &server=. 서버 주소 규칙은 등산과 같다.
export function multiParams(search='',envUrl=''){
 const q=new URLSearchParams(search);
 return {auto:q.has('multi'),room:cleanRoom(q.get('multi')),name:q.has('name')?cleanName(q.get('name')):null,server:multiServerUrl(search,envUrl)};
}
// 방 이름: 서버 sanitizeRoom과 같은 규칙(한글·영문·숫자·-·_ 24자). 비면 기본 방.
export const cleanRoom=raw=>{const s=[...String(raw??'').normalize('NFC').replace(/[^0-9A-Za-z가-힣_-]/g,'')].slice(0,24).join('');return s||DEFAULT_ROOM;};
export const cleanName=raw=>[...String(raw??'').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g,'').replace(/\s+/g,' ').trim()].slice(0,NET.nameMax).join('').trim();

// 받은 담배 상태 → 상대 담배(smoke.js api)에 부를 일. cur = 지금 그 담배의 state.
// 중간에 들어와서 처음 받은 상태가 'smoking'이어도 꺼내기 → 불 붙이기부터 차례로 따라간다(smoke.js가 동작 중 단추를 하나 기억했다 한다).
export function smokePlan(cur,{state,lit}={}){
 const idle=cur==='idle'||cur==null,holding=cur==='out'||cur==='ready';
 const lightUp=()=>idle?[['start'],['light']]:holding?[['light']]:[];
 switch(state){
  case 'out':case 'ready':return idle?[['start']]:[];
  case 'lighting':return lightUp();
  case 'smoking':case 'finished':return lit?lightUp():idle?[['start']]:[];
  case 'inhale':return idle||holding?lightUp():[['puff']];
  case 'exhale':return cur==='smoking'?[['puff']]:lightUp();
  case 'flick':return idle||holding?lightUp():[['flick']];
  case 'trick':return idle||holding?lightUp():[['trick','ring']];
  case 'dispose':case 'done':case 'idle':return idle?[]:[['dispose']];
  default:return [];
 }
}
// 받은 채팅을 그릴지: 내 글이 서버에서 되돌아온 것(id===내 ID)은 이미 그렸으니 'mine', 글이 없으면 null, 아니면 'show'.
export function chatRoute(m,myId){
 if(!m||m.t!=='c'||typeof m.text!=='string'||!m.text)return null;
 return m.id===myId?'mine':'show';
}
// 상태 칩(등산 multi-entry-ui statusView의 6종을 흡연장 말투로). tone: wait·ok·local·warn·bad
// 방 이름(서버 welcome의 room: 옥상)은 서버 목록이면 서버 이름(옥상 1서버)으로 보인다.
export function loungeStatusView(d={}){
 const local=d.transport==='local',n=Math.max(0,Number(d.count)||0),where=d.room?findServer('smoking',d.room)?.name??`방 ${d.room}`:'';
 switch(d.state){
  case 'connecting':return {tone:'wait',ic:'⏳',text:'옥상 문 여는 중…',short:'…',sub:where,action:null};
  // 서버 주소가 없거나(이 창끼리만) 서버 목록 밖 방이면 분명히 알린다(11-08)
  case 'online':return local
   ?{tone:'local',ic:'💻',text:`내 컴퓨터 모드 · ${n||1}명`,short:`${n||1}`,sub:'서버 없음 · 이 브라우저 창끼리만(다른 기기 ✕)',action:null}
   :d.room&&!findServer('smoking',d.room)
   ?{tone:'warn',ic:'🟡',text:`다른 방 · ${n||1}명`,short:`${n||1}`,sub:`'${d.room}' · 서버 고르기와 따로`,action:null}
   :{tone:'ok',ic:'🟢',text:`같이 피우는 중 · ${n||1}명`,short:`${n||1}`,sub:where,action:null};
  case 'reconnecting':return {tone:'warn',ic:'🔄',text:'다시 연결 중…',short:'…',sub:'옥상 NPC랑은 계속 놀 수 있어요',action:null};
  case 'offline':return {tone:'bad',ic:'⚠',text:'연결 끊김',short:'!',sub:'눌러서 다시 연결해요',action:'retry'};
  case 'full':return {tone:'warn',ic:'🚪',text:'방금 꽉 찼어요',short:'꽉',sub:'다른 서버를 골라 주세요',action:'other'};
  default:return null;
 }
}

// ctx: main.js ctx(THREE·world·player·smoker·createAvatar·createSmoker·dispatch·mobile·profile). spots: 자세(앉음) 읽기.
// makeTransport는 시험에서 바꿔 끼운다.
export function createLoungeMulti({ctx,spots=null,search=globalThis.location?.search??'',envUrl='',win=globalThis.window,
 makeTransport=(o)=>o.server?createWebSocketTransport(o.server,{experience:EXPERIENCE,room:o.room,name:o.name}):createBroadcastTransport(o.room,undefined,{experience:EXPERIENCE}),
 now=()=>performance.now()/1000,
 // 숨은 탭 알림 타이머(그리기 루프가 멈춰도 1초마다). 시험에서 바꿔 끼운다.
 heartbeat=fn=>createBackgroundTimer(fn,PRESENCE.heartbeatMs)}={}){
 const params=multiParams(search,envUrl);
 const cap=ctx.mobile?MULTI.cap.mobile:MULTI.cap.desktop;
 const roster=new Map(); // 서버 id → {id,name,tagHidden,interp,lastSeen,flags,avatar,smoker,pending,loading,smoke,shown}
 let transport=null,viaServer=false,joined=false,netState='offline',room=params.room,myId=null,myName='',nameFollowsProfile=false,askedName='';
 let presence=createPresence({timeout:MULTI.timeout}),beat=null,lastAnnounceAt=-Infinity,lastGreet=-Infinity;
 let lastAct='',seq=0,sendT=0,lastSent=null,lastSentAt=-Infinity,announceT=0,assignT=0,jumpNext=false,lastSmoke=null,statusSig='',offMsg=null,offStatus=null;
 const stats={sent:0,received:0,chatsSent:0,chatsReceived:0,chatsEchoSkipped:0,smokesSent:0,smokesReceived:0,actsSent:0,actsReceived:0,jumps:0};
 const dispatch=(type,detail)=>win?.dispatchEvent?.(new CustomEvent(type,{detail}));
 const send=m=>{if(!transport)return;stats.sent++;transport.send(m);};
 const online=()=>joined&&(!viaServer||netState==='online');

 function emitStatus(force=false){
  const detail={state:joined?netState:'off',room,count:online()?[...roster.values()].filter(r=>r.lastSeen>0).length+1:0,transport:viaServer?'server':'local',joined};
  const sig=JSON.stringify(detail);if(!force&&sig===statusSig)return;statusSig=sig;dispatch('lounge:multi-status',detail);
 }
 const nameOf=r=>r&&!r.tagHidden&&r.name?r.name:anonymousName(r?.id??'',EXPERIENCE);

 // ── 참가·나가기
 function join({room:roomArg,name}={}){
  if(joined)leave(true);
  room=cleanRoom(roomArg??room);
  const explicit=cleanName(name??'');nameFollowsProfile=!explicit;
  const want=explicit||cleanName(ctx.profile?.nickname);askedName=want;
  myId=Math.random().toString(36).slice(2,10);
  myName=sanitizeName(want,anonymousName(myId,EXPERIENCE));
  transport=makeTransport({server:params.server,room,name:want});
  viaServer=transport.kind==='server';netState=viaServer?transport.status??'connecting':'online';joined=true;
  presence=createPresence({timeout:viaServer?PRESENCE.serverTimeout:MULTI.timeout});
  // 숨은 탭에서도 1초마다 자리, 3초마다 이름(상대 화면에서 시간 초과로 지워지지 않게, 11-08)
  beat=heartbeat(()=>{if(!online())return;const t=now();if(t-lastSentAt>=PRESENCE.heartbeatMs/1000)sendPos(true);if(t-lastAnnounceAt>=MULTI.announce)announce();});
  offStatus=viaServer&&transport.onstatus?transport.onstatus(st=>{netState=st;if(st!=='online')for(const id of [...roster.keys()])drop(id);if(st==='online')greet();emitStatus();}):null;
  offMsg=transport.onmessage(onMessage);
  if(!viaServer)greet();
  emitStatus(true);return true;
 }
 function leave(silent=false){
  if(!joined)return false;
  try{transport?.send({t:'b',id:myId});}catch{}
  beat?.stop();beat=null;offMsg?.();offStatus?.();try{transport?.close();}catch{}
  transport=null;joined=false;netState='offline';
  for(const id of [...roster.keys()])drop(id);
  if(!silent)emitStatus(true);return true;
 }
 // 들어오자마자: 이름·지금 위치(순간 이동)·지금 담배 상태를 알린다(나중에 온 사람도 서버가 마지막 담배 상태를 넘겨준다)
 function greetNew(){const t=now();if(t-lastGreet<.3)return;lastGreet=t;announce();sendPos(true);if(!viaServer){const st=ctx.smoker?.status?.();if(st)sendSmoke(st.state,!!st.lit,true);sendAct(true);}}
 function greet(){announce();jumpNext=true;sendPos(true);const st=ctx.smoker?.status?.();if(st)sendSmoke(st.state,!!st.lit,true);sendAct(true);}
 function announce(){announceT=0;lastAnnounceAt=now();send({t:'j',id:myId,n:myName});}

 // ── 받기
 function entry(id){
  let r=roster.get(id);if(r)return r;
  if(roster.size>=NET.maxRoster)return null;
  r={id,name:'',tagHidden:false,interp:createInterpolator(),lastSeen:0,flags:0,avatar:null,smoker:null,loading:false,smoke:null,sample:null,shown:false,prev:null,act:null,S:null,poser:null};
  roster.set(id,r);
  // 처음 보는 사람에게 내 이름·지금 자리·담배 상태를 바로 알린다(내 컴퓨터 모드는 묻는 서버가 없음).
  // 메시지 처리는 숨은 탭에서도 돌아서, 숨은 채 가만히 있는 사람도 새로 온 사람에게 보인다(11-08).
  greetNew();
  return r;
 }
 function drop(id){
  const r=roster.get(id);if(!r)return;roster.delete(id);
  if(r.smoker)r.smoker.remove?.();r.poser?.dispose();if(r.avatar)ctx.world.remove(r.avatar.root);r.dead=true;
  emitStatus();
 }
 function onMessage(m){
  stats.received++;if(!m||!joined)return;
  switch(m.t){
   case 'welcome':myId=m.id;room=m.room??room;myName=m.name||myName;emitStatus();return;
   case 'moved':room=m.room??room;for(const id of [...roster.keys()])drop(id);dispatch('lounge:multi-note',{text:`다른 옥상(${room})으로 옮겼어요`});emitStatus();return;
   case 'reject':dispatch('lounge:multi-note',{text:'서버가 흡연장 연결을 받지 않았어요'});return;
   case 'c-limit':dispatch('lounge:multi-note',{text:'잠깐만요, 조금 천천히 말해요',kind:'limit'});return;
   case 'c':{const route=chatRoute(m,myId);if(route==='mine'){stats.chatsEchoSkipped++;return;}if(route!=='show')return;
    const r=roster.get(m.id);stats.chatsReceived++;
    dispatch('lounge:chat',{id:m.id,name:nameOf(r??{id:m.id}),text:m.text,remote:true});return;}
  }
  if(m.id===myId||typeof m.id!=='string')return;
  const t=now();
  if(m.t==='b'){drop(m.id);return;}
  if(m.t==='j'){const r=entry(m.id);if(!r)return;r.name=sanitizeName(m.n,anonymousName(m.id,EXPERIENCE));r.tagHidden=!!m.h;r.lastSeen=t;if(r.avatar)r.avatar.name=nameOf(r);emitStatus();return;}
  if(m.t==='s'){const d=decodeState(m);if(!d)return;const r=entry(d.id);if(!r)return;
   const isNew=!r.lastSeen;r.lastSeen=t;r.flags=d.flags;
   if(d.flags&FLAG.jump){r.interp=createInterpolator();r.snap=true;}
   r.interp.push(t,d);if(isNew)emitStatus();return;}
  if(m.t==='act'){const a=sanitizeAct(EXPERIENCE,m.a);if(!a)return;const r=entry(m.id);if(!r)return;stats.actsReceived++;r.act=a;if(!r.lastSeen)r.lastSeen=t;if(r.S)applyRemoteAct(r.S,a,ctx.rooftop);return;}
  if(m.t==='lounge:smoke'){const r=entry(m.id);if(!r)return;stats.smokesReceived++;r.smoke={state:m.state,lit:!!m.lit};if(!r.lastSeen)r.lastSeen=t;applySmoke(r);return;}
 }
 function applySmoke(r){
  const sm=r.smoker;if(!sm||!r.smoke)return;
  for(const [fn,arg] of smokePlan(sm.state,r.smoke))sm[fn]?.(arg);
  r.smoke=null;
 }

 // ── 보내기
 // 내 채팅: HUD 입력·이모트가 낸 id:'me' 채팅(NPC 대화 칩의 각본 대사는 그 화면 NPC 맥락이라 보내지 않는다)
 const onChat=e=>{
  const d=e.detail??{};if(d.id!==ctx.player.id||d.scripted||d.remote||!joined)return;
  const text=String(d.text??'').trim();if(!text)return;
  if(!online()){dispatch('lounge:multi-note',{text:'아직 연결 전이라 옥상 NPC만 들었어요'});return;}
  stats.chatsSent++;send({t:'c',id:myId,text});
 };
 // 내 담배: 상태가 바뀔 때만
 function sendSmoke(state,lit,force=false){
  const sig=`${state}:${lit}`;if(!force&&sig===lastSmoke)return;lastSmoke=sig;
  if(!online())return;stats.smokesSent++;send({t:'lounge:smoke',id:myId,state,lit});
 }
 // 내 행동 상태(자세·캔): 바뀔 때만. 연결 전이면 기억하지 않아 연결되면 보낸다.
 function sendAct(force=false){
  const a=spots?.act?.();if(!a||!online())return;const sig=JSON.stringify(a);if(!force&&sig===lastAct)return;
  lastAct=sig;stats.actsSent++;send({t:'act',id:myId,a});
 }
 const onSmoke=e=>{const d=e.detail??{};if(d.id!==ctx.player.id||!d.isPlayer)return;sendSmoke(String(d.state),!!d.lit);};
 // 자리(난간·벤치)에 들어가고 나올 때는 몸을 옮기므로 순간 이동으로 보낸다
 const onSpot=e=>{const d=e.detail??{};if(d.id===ctx.player.id&&(d.state==='enter'||d.state==='leave'))jumpNext=true;};
 win?.addEventListener?.('lounge:chat',onChat);win?.addEventListener?.('lounge:smoke',onSmoke);win?.addEventListener?.('lounge:spot',onSpot);

 function sendPos(force=false){
  if(!online())return;
  const p=ctx.player,t=now();
  const moved=lastSent?Math.hypot(p.x-lastSent.x,p.z-lastSent.z):Infinity,turned=lastSent?Math.abs(Math.atan2(Math.sin(p.heading-lastSent.h),Math.cos(p.heading-lastSent.h))):Infinity;
  if(!force&&moved<.01&&turned<.02&&t-lastSentAt<MULTI.idleSend)return;
  const elapsed=Math.max(.05,t-lastSentAt),jump=jumpNext||(lastSent&&moved>MULTI.jumpDist+2.2*elapsed);
  let f=0;if(p.running)f|=FLAG.run;if(spots?.pose==='sit')f|=FLAG.sit;if(jump){f|=FLAG.jump;stats.jumps++;}
  jumpNext=false;seq=(seq+1)&0xffff;
  const r2=v=>Math.round(v*100)/100;
  send({t:'s',id:myId,q:seq,z:0,x:r2(p.x),y:r2(p.z),h:r2(p.heading),v:r2(p.speed??0),f});
  lastSent={x:p.x,z:p.z,h:p.heading};lastSentAt=t;
 }

 // ── 다른 사람 몸 만들기(뼈대는 한 번만 읽고 복제 — avatar.js loadRig)
 async function spawn(r){
  r.loading=true;
  const a=await ctx.createAvatar({outfit:remoteOutfit(r.id),name:nameOf(r),id:avatarId(r.id)});
  if(r.dead||!roster.has(r.id)){r.loading=false;return;}
  const sm=ctx.createSmoker(a,{isPlayer:false});
  // 자세·캔(내 몸과 같은 spots.js 코드, 흡연 팔보다 먼저)
  r.S=newPoseState();r.poser=a.hiker?.model?createPoser({S:r.S,avatar:a,rooftop:ctx.rooftop,world:ctx.world,toon:ctx.toon,smokeState:()=>sm.status?.()?.state??'idle',auto:false}):null;
  if(r.poser)a.extra.push(r.poser.pose);
  a.extra.push(dt=>sm.apply?.(dt,{moving:a.moving}));
  a.root.visible=false;ctx.world.add(a.root);
  r.avatar=a;r.smoker=sm;r.loading=false;r.snap=true;
  applySmoke(r);
  // 행동 상태를 아직 못 받았는데 앉음 표시(FLAG.sit, 옛 클라이언트)가 있으면 가까운 벤치에 앉힌다
  applyRemoteAct(r.S,r.act??legacyAct(r),ctx.rooftop);
 }
 // 가까운 cap명만 몸으로 그린다(나머지는 이름표만)
 function assign(){
  const p=ctx.player,list=[...roster.values()].filter(r=>r.sample).sort((a,b)=>Math.hypot(a.sample.x-p.x,a.sample.z-p.z)-Math.hypot(b.sample.x-p.x,b.sample.z-p.z));
  list.forEach((r,i)=>{r.shown=i<cap;if(r.shown&&!r.avatar&&!r.loading)spawn(r);});
 }
 function legacyAct(r){
  if(!(r.flags&FLAG.sit)||!r.sample)return {p:'stand'};
  const bs=ctx.rooftop?.spots?.benches??[];let b=0,d=Infinity;bs.forEach((x,i)=>{const e=Math.hypot(x.seat.x-r.sample.x,x.seat.z-r.sample.z);if(e<d){d=e;b=i;}});
  return {p:'sit',b};
 }
 function drive(r,dt){
  const a=r.avatar,s=r.sample;if(!a)return;
  a.root.visible=r.shown;if(!r.shown)return;
  if(r.snap){a.place(s.x,s.z,s.heading);r.snap=false;a.update(0,{moved:0});return;}
  const moved=Math.hypot(s.x-a.x,s.z-a.z);
  a.x=s.x;a.z=s.z;if(moved>1e-3||!s.moving)a.heading=s.heading;
  a.update(dt,{moved,running:!!(r.flags&FLAG.run)});
 }

 return {
  get joined(){return joined;},get state(){return joined?netState:'off';},get room(){return room;},get id(){return myId;},get name(){return myName;},
  get server(){return params.server;},get params(){return params;},
  join,leave,
  // 화면(HUD 말풍선·이름표)용: 서버 id → 아바타
  // 그 자리에 다른 사람이 있는지(spots.js가 난간 지점·벤치 좌판을 고를 때)
  occupied(x,z,r=.36){if(!joined)return false;for(const p of roster.values()){const s=p.sample;if(p.lastSeen>0&&s&&Math.hypot(s.x-x,s.z-z)<r)return true;}return false;},
  avatarOf(id){const r=roster.get(id);return r?.avatar&&r.shown?r.avatar:null;},
  people(){return [...roster.values()].filter(r=>r.lastSeen>0).map(r=>({id:r.id,name:nameOf(r),avatar:r.shown?r.avatar:null,sample:r.sample,tagHidden:r.tagHidden}));},
  update(dt){
   if(!joined)return;
   const t=now();
   // 닉네임을 로비·내 정보에서 정했으면(주소로 이름을 안 줬을 때) 이름 알림을 바꾼다.
   // 서버는 이름을 접속 때만 받으므로, 서버 모드에서는 같은 방에 다시 들어가 새 이름으로 알린다(같은 닉네임으로는 한 번만).
   if(nameFollowsProfile){const want=cleanName(ctx.profile?.nickname);
    if(!viaServer){const n=sanitizeName(want,anonymousName(myId,EXPERIENCE));if(n!==myName){myName=n;announce();}}
    else if(want&&want!==askedName){join({room});return;}}
   sendT+=dt;if(sendT>=1/MULTI.sendHz){sendT=0;sendPos();}
   sendAct();
   announceT+=dt;if(announceT>=MULTI.announce&&online())announce();
   assignT-=dt;if(assignT<=0){assignT=.5;assign();}
   presence.frame(t); // 로딩·숨은 탭으로 내 루프가 멈췄다 돌아온 첫 프레임은 시간 초과를 판단하지 않음
   for(const r of [...roster.values()]){
    if(r.lastSeen&&presence.expired(r.lastSeen,t)){drop(r.id);continue;}
    r.sample=r.interp.sample(t)??r.sample;
    if(!r.act&&r.S&&r.sample)applyRemoteAct(r.S,legacyAct(r),ctx.rooftop);
    if(r.sample)drive(r,dt);
   }
   emitStatus();
  },
  status(){return {joined,state:joined?netState:'off',transport:viaServer?'server':'local',room,id:myId,name:myName,server:params.server,
   people:[...roster.values()].map(r=>({id:r.id,name:nameOf(r),shown:r.shown,avatar:!!r.avatar,smoke:r.smoker?.state??null,lit:r.smoker?.status?.().lit??null,act:r.act,pose:r.S?.pose??null,can:r.S?r.S.can.drop?'drop':r.S.can.held?'held':'none':null,x:r.sample?+r.sample.x.toFixed(2):null,z:r.sample?+r.sample.z.toFixed(2):null})),stats:{...stats}};},
  dispose(){leave(true);win?.removeEventListener?.('lounge:chat',onChat);win?.removeEventListener?.('lounge:smoke',onSmoke);win?.removeEventListener?.('lounge:spot',onSpot);},
 };
}
