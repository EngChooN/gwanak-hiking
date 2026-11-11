// 함께 걷기 방 로직(순수 모듈: 소켓·파일·타이머 없음). 서버(multi-server.mjs)가 join/message/leave/tick을 부르고,
// 보낼 글은 각 사람의 send(str)로, 신고 기록은 reports.append(rec)로 내보낸다. 시험(tests/multi-rooms.test.mjs)은 이 파일만 부른다.
// 정한 기본값(2026-11-08 기획서): 방 20명(차면 방이름-2, -3 …), 위치 메시지 초당 15회 초과 버림, 순간이동 거부(구간 이동 표시 FLAG.jump는 1초에 1번 허용),
// 10Hz 스냅샷 묶음, 인사·셀카 중계, 동물 놀람 중계, 신고(서로 다른 3명 → 24시간 이름표 숨김·다른 방으로 재배정).
// 체험 구분(11-08): 방 키는 `체험:방이름`(hiking:관악산-1, smoking:옥상-1). 같은 방 이름이라도 체험이 다르면 다른 방이고, 꽉 참·-2 규칙·신고·속도 제한은 체험별 방 안에서 그대로다.
// 채팅(11-08 공통 c): 80자·제어/방향 문자 제거·금칙어 ***(chatBanned), 2초 1번·10초 4번(넘으면 {t:'c-limit'}), 보낸 사람 포함 같은 방에 {t:'c',id,text}.
//  채팅은 어디에도 쓰지 않는다. 사람마다 최근 3줄만 메모리에 두고, 신고될 때 그 3줄만 신고 기록(chat)에 싣는다.
// 흡연장(11-08 열림): 위치 s는 등산과 같은 검사, 담배 상태 {t:'lounge:smoke',state,lit}은 허용 목록 검사 뒤 다른 사람에게 중계·새로 온 사람에게 마지막 상태.
// IP는 받지 않는다. 서버가 메모리에서만 만든 열쇠(ipKey, 프로세스마다 바뀌는 비밀로 만든 해시)만 받아 접속 수 제한·숨김 유지에 쓴다.
// 서버 목록(11-08 서버 고르기): SERVERS 표에 있는 방(관악산-1 → hiking:관악산, 옥상-1 → smoking:옥상)은 꽉 차면 -2로 넘기지 않고 'full'로 거절한다.
//  신고로 숨겨진 사람도 서버 방에서는 다른 방으로 옮기지 않고 이름만 숨긴다(넘길 서버가 없음). 다른 방 이름은 기존 규칙 그대로.
// 같이 등산하기(11-08 동행, 등산만): 쌍 상태를 메모리에만 둔다. 한 사람은 제안 하나(보냄·받음) 또는 쌍 하나만, 제안 30초 만료(=저절로 거절),
//  거절·만료 뒤 같은 사람에게 60초 재제안 금지, 제안은 10초에 1번, 숨김 상태는 제안 불가, 끊기면(소켓) 60초 유예 → resume으로 같은 ID가 돌아오면 이어 붙임,
//  나가기(b)·다른 방 이동·숨김은 바로 끝. 규격은 src/multi-protocol.js PAIR·createPairClient 위 주석.
import {sanitizeName,anonymousName,REPORT_REASONS,GESTURES,FLAG,parseExperience,messageAllowed,CHAT,sanitizeChat,createChatLimiter,sanitizeSmoke,sanitizeAct,SERVERS,EXPERIENCES,findServer,serverRoomName,PAIR} from '../src/multi-protocol.js';

export const ROOM_DEFAULTS=Object.freeze({
 maxPerRoom:20,           // 한 방 최대 인원
 maxClients:400,          // 서버 전체 동시 접속(넘으면 'full')
 maxPerIp:32,             // 같은 ipKey 동시 접속(같은 와이파이 여러 사람을 생각해 넉넉히)
 stateRate:15,            // 위치 메시지 초당 상한
 otherRate:20,            // 위치 말고 다른 메시지 초당 상한
 maxSpeed:12,             // m/s. 동동이 달리기·초콜릿보다 넉넉한 값(걷기 1.2, 달리기 약 3)
 slack:2,                 // m. 지연으로 몰려 들어온 메시지 여유
 jumpCooldownMs:1000,     // 구간 이동 표시를 붙인 순간이동 허용 간격
 resyncMs:3000,           // 표시 없는 순간이동을 이만큼 계속 고집하면(정상 클라이언트가 놓친 경우) 받아 준다
 resumeMs:60000,          // 끊긴 뒤 이 시간 안에 다시 붙으면 같은 ID·같은 방
 reportThreshold:3,       // 서로 다른 신고자 수
 reportWindowMs:24*3600e3,// 신고를 세는 기간
 hideMs:24*3600e3,        // 이름표 숨김 기간
 animalDedupMs:30000,     // 같은 동물 놀람은 방마다 한 번(먼저 온 것)
 namesEvery:30,           // 스냅샷 30번(3초)마다 이름 목록도 싣는다
 banned:[],               // 이름 금칙어(운영 결정, 환경 변수 BANNED_WORDS)
 chatBanned:[],           // 채팅 금칙어(BANNED_CHAT_WORDS + server/chat-banned-words.txt). 맞으면 ***로 가림
 pairOfferMs:PAIR.offerMs,pairBlockMs:PAIR.declineBlockMs,pairGapMs:PAIR.offerGapMs,pairGraceMs:PAIR.graceMs // 동행 제한 시간(시험에서 줄일 수 있음)
});
export const ANIMAL_KINDS=Object.freeze(['squirrel','cat','magpie','hare']);
const RELAY_TO=new Set(['sr','sa','sd','se']);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const short=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n;

// 방 이름: 영문·숫자·한글·-·_ 만, 24자. 비면 기본 방.
export function sanitizeRoom(raw,fallback='gwanak-room-1'){
 const s=[...String(raw??'').normalize('NFC').replace(/[^0-9A-Za-z가-힣_-]/g,'')].slice(0,24).join('');
 return s||fallback;
}
// 옛 기본 방 이름(?multi= 값이 비었을 때 클라이언트가 붙이던 이름). 서버 목록이 있는 체험에서는 첫 서버 방과 같은 방으로 본다.
export const LEGACY_DEFAULT_ROOM='gwanak-room-1';
export function defaultRoom(experience,raw,servers=SERVERS){
 const r=sanitizeRoom(raw,'');const first=servers[experience]?.[0]?.room;
 return first&&(!r||r===LEGACY_DEFAULT_ROOM)?first:r||LEGACY_DEFAULT_ROOM;
}
// 'base-3' → 'base' (자동으로 붙인 번호만 뗀다)
export const roomBase=room=>room.replace(/-\d{1,3}$/,'');
// 방 키: 체험 id + ':' + 방 이름. 방 이름에는 ':'가 들어갈 수 없어(sanitizeRoom) 겹치지 않는다.
export const roomKey=(experience,name)=>`${experience}:${name}`;
// 금칙어 목록 파일: 한 줄에 하나, 빈 줄·#으로 시작하는 줄은 건너뜀. 쉼표로 여러 개를 적어도 된다.
export const parseWordList=text=>String(text??'').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).flatMap(l=>l.split(',')).map(w=>w.trim()).filter(Boolean);
// 신고 기록 정리: days일보다 오래된 줄을 뺀다. lines = JSONL 문자열 배열, 깨진 줄은 버린다.
export function pruneReports(lines,now,days=90){
 const cut=now-days*86400e3,keep=[];
 for(const l of lines){if(!l.trim())continue;try{const r=JSON.parse(l);if(finite(r.at)&&r.at>=cut)keep.push(r);}catch{}}
 return keep;
}

export function createRooms(opts={}){
 const o={...ROOM_DEFAULTS,...opts},now=opts.now??(()=>Date.now()),idGen=opts.idGen??(()=>Math.random().toString(36).slice(2,10)),tokenGen=opts.tokenGen??(()=>Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2));
 const reports=opts.reports??{append(){}},servers=opts.servers??SERVERS;
 const o_=o; // 동행 도우미 안에서 제안 객체 이름(o)과 겹치지 않게 쓰는 옵션 별칭
 const rooms=new Map();            // 방 키(체험:방이름) → {key, name, experience, members:Map(id→client), tick, animals:Map(id→at)}
 const clients=new Map();          // id → client
 const ghosts=new Map();           // resume 토큰 → {id, experience, room(방 이름), hiddenUntil, avoid, at}
 const hiddenByIp=new Map();       // ipKey → until (메모리만)
 const reportLog=[...(opts.initialReports??[])];
 const stats={replaced:0,pairOffers:0,pairDenied:0,pairs:0,pairEnds:0,joined:0,chats:0,chatLimited:0,smokes:0,acts:0,badExperience:0,wrongExperience:0,full:0,stateAccepted:0,rateDropped:0,teleportRejected:0,resynced:0,jumps:0,relayed:0,animals:0,animalDup:0,reports:0,hidden:0,invalid:0,snapshots:0};

 // 동행: pairs id→상대 id(양쪽), offers id→제안(보낸 쪽·받는 쪽 둘 다 같은 객체), declines '보낸>받은'→재제안 가능 시각, lastOffer id→마지막 제안 시각, away id→유예 끝 시각
 const pairs=new Map(),offers=new Map(),declines=new Map(),lastOffer=new Map(),away=new Map();
 const roomOf=(experience,name)=>{const key=roomKey(experience,name);let r=rooms.get(key);if(!r){r={key,name,experience,members:new Map(),tick:0,animals:new Map()};rooms.set(key,r);}return r;};
 const sizeOf=(experience,name)=>rooms.get(roomKey(experience,name))?.members.size??0;
 const send=(c,obj)=>{try{c.send(typeof obj==='string'?obj:JSON.stringify(obj));}catch{}};
 const toRoom=(room,obj,except=null)=>{const s=JSON.stringify(obj);for(const m of room.members.values())if(m!==except)send(m,s);};
 const nameRow=c=>({t:'j',id:c.id,n:c.hidden()?anonymousName(c.id,c.experience):c.name,...(c.hidden()?{h:1}:{})});
 // 빈자리 있는 방(같은 체험 안에서): base, base-2, base-3 … 중 첫 번째. avoid = 피할 방 이름(재배정 전 방)
 function pickRoom(experience,base,{prefer=null,avoid=null}={}){
  if(prefer&&prefer!==avoid&&sizeOf(experience,prefer)<o.maxPerRoom)return prefer;
  for(let i=1;i<1000;i++){const name=i===1?base:`${base}-${i}`;if(name===avoid)continue;if(sizeOf(experience,name)<o.maxPerRoom)return name;}
  return null;
 }
 function enter(c,roomName){
  const room=roomOf(c.experience,roomName);c.room=room;room.members.set(c.id,c);
  // 새로 온 사람에게 지금 있는 사람 이름과 마지막 자리, 다른 사람에게 새로 온 사람 이름
  for(const m of room.members.values())if(m!==c){send(c,nameRow(m));if(m.state)send(c,{t:'snap',p:[m.state]});if(m.smoke)send(c,{t:'lounge:smoke',id:m.id,...m.smoke});if(m.act)send(c,{t:'act',id:m.id,a:m.act});}
  toRoom(room,nameRow(c),c);
  // resume으로 돌아온 사람은 끊기 전 마지막 자리·담배 상태를 바로 알린다(숨은 탭이 다시 붙으면 새 위치를 안 보내 '이름만 있고 안 보임'이던 결함, 11-08)
  if(c.state)toRoom(room,{t:'snap',p:[c.state]},c);
  if(c.smoke)toRoom(room,{t:'lounge:smoke',id:c.id,...c.smoke},c);
  if(c.act)toRoom(room,{t:'act',id:c.id,a:c.act},c);
 }
 function exit(c){const room=c.room;if(!room)return;room.members.delete(c.id);toRoom(room,{t:'b',id:c.id});c.room=null;if(!room.members.size)rooms.delete(room.key);}
 // 같은 사람이 새 연결로 갈아탈 때: 방 사람들에게 '나감'을 알리지 않고 옛 연결만 뗀다(같은 ID로 곧 다시 들어온다)
 function detach(c){clients.delete(c.id);const room=c.room;if(room){room.members.delete(c.id);c.room=null;if(!room.members.size)rooms.delete(room.key);}}
 const countIp=k=>{let n=0;for(const c of clients.values())if(c.ipKey===k)n++;return n;};
 const bucket=(arr,t,limit)=>{while(arr.length&&t-arr[0]>=1000)arr.shift();if(arr.length>=limit)return false;arr.push(t);return true;};

 // ── 동행 도우미
 const sendId=(id,obj)=>{const c=clients.get(id);if(c)send(c,obj);};
 function dropOffer(o,{toFrom=null,toTo=null}={}){
  if(offers.get(o.from)===o)offers.delete(o.from);if(offers.get(o.to)===o)offers.delete(o.to);
  if(toFrom)sendId(o.from,{t:'pair:declined',id:o.to,...toFrom});if(toTo)sendId(o.to,{t:'pair:canceled',id:o.from,...toTo});
 }
 function unpair(id,reason){
  const p=pairs.get(id);if(p===undefined)return false;
  pairs.delete(id);pairs.delete(p);away.delete(id);away.delete(p);stats.pairEnds++;
  sendId(id,{t:'pair:off',id:p,reason});sendId(p,{t:'pair:off',id,reason});return true;
 }
 // 사람이 빠질 때(keep=소켓 끊김, resume 기다림): 제안은 바로 지우고, 쌍은 유예 또는 바로 끝.
 function pairLeave(c,keep,t){
  const o=offers.get(c.id);if(o)dropOffer(o,o.from===c.id?{toTo:{reason:'left'}}:{toFrom:{reason:'left'}});
  if(!pairs.has(c.id))return;
  if(keep){away.set(c.id,t+o_.pairGraceMs);sendId(pairs.get(c.id),{t:'pair:wait',id:c.id});}
  else unpair(c.id,'left');
 }
 // 다시 붙음: 쌍이 남아 있으면 상대가 있을 때 둘 다 pair:on, 상대도 끊겨 있으면 pair:wait.
 function pairResume(c){
  if(!pairs.has(c.id))return;
  away.delete(c.id);const p=clients.get(pairs.get(c.id));
  if(p&&p.room===c.room&&!away.has(p.id)){send(c,{t:'pair:on',id:p.id});send(p,{t:'pair:on',id:c.id});}
  else if(p&&p.room!==c.room)unpair(c.id,'moved');
  else send(c,{t:'pair:wait',id:pairs.get(c.id)});
 }
 function pairMessage(c,m,t,room){
  const to=typeof m.to==='string'?m.to:'',no=(reason,extra={})=>{stats.pairDenied++;send(c,{t:'pair:no',id:to,reason,...extra});};
  switch(m.t){
   case 'pair:offer':{
    const target=room.members.get(to);
    if(!target||target===c)return no('gone');
    if(c.hidden())return no('hidden');
    if(pairs.has(c.id))return no('self-busy');
    if(offers.has(c.id))return no('pending');
    if(pairs.has(target.id)||offers.has(target.id))return no('busy');
    const blk=declines.get(`${c.id}>${target.id}`);if(blk!==undefined&&t<blk)return no('blocked',{wait:Math.ceil((blk-t)/1000)});
    const last=lastOffer.get(c.id)??-Infinity;if(t-last<o_.pairGapMs)return no('gap',{wait:Math.ceil((last+o_.pairGapMs-t)/1000)});
    lastOffer.set(c.id,t);const o={from:c.id,to:target.id,at:t,until:t+o_.pairOfferMs};offers.set(c.id,o);offers.set(target.id,o);stats.pairOffers++;
    send(target,{t:'pair:offer',id:c.id,ms:o_.pairOfferMs});send(c,{t:'pair:sent',id:target.id,ms:o_.pairOfferMs});return;}
   case 'pair:accept':{
    const o=offers.get(c.id),from=o&&clients.get(o.from);
    if(!o||o.to!==c.id||o.from!==to||!from||from.room!==room)return no('expired');
    dropOffer(o);pairs.set(c.id,from.id);pairs.set(from.id,c.id);stats.pairs++;
    send(c,{t:'pair:on',id:from.id});send(from,{t:'pair:on',id:c.id});return;}
   case 'pair:decline':{
    const o=offers.get(c.id);if(!o||o.to!==c.id||o.from!==to)return;
    declines.set(`${o.from}>${o.to}`,t+o_.pairBlockMs);dropOffer(o,{toFrom:{reason:'decline'}});return;}
   case 'pair:cancel':{
    const o=offers.get(c.id);if(!o||o.from!==c.id||o.to!==to)return;
    dropOffer(o,{toTo:{reason:'cancel'}});return;}
   case 'pair:end':unpair(c.id,'end');return;
  }
 }
 // 시간 정리(tick에서): 30초 지난 제안은 저절로 거절(재제안 금지도 같이), 유예가 끝난 쌍은 해제. 오래된 금지 기록도 지운다.
 function pairTick(t){
  for(const o of new Set(offers.values()))if(t>=o.until){declines.set(`${o.from}>${o.to}`,t+o_.pairBlockMs);dropOffer(o,{toFrom:{reason:'timeout'},toTo:{reason:'timeout'}});}
  for(const [id,until] of away)if(t>=until)unpair(id,'gone');
  for(const [k,until] of declines)if(t>=until)declines.delete(k);
  for(const [id,at] of lastOffer)if(t-at>=o_.pairGapMs)lastOffer.delete(id);
 }
 // 접속: {experience,room,name,resume,ipKey,send} → {ok:true,client} | {ok:false,reason:'full'|'ip'|'experience'}
 // experience가 없으면(옛 클라이언트) 'hiking', 허용 목록 밖이면 'experience'로 거절.
 // 접속: {experience,room,name,resume,ipKey,send,kick?} → {ok:true,client} | {ok:false,reason:'full'|'ip'|'experience'}
 //  kick(): 같은 resume 토큰으로 새 연결이 오면 옛 연결을 닫을 때 부른다(서버가 소켓 close를 넘긴다).
 function join({experience,room,name,resume=null,ipKey='',send:out,kick=null}){
  const t=now(),exp=parseExperience(experience);
  if(!exp){stats.badExperience++;return {ok:false,reason:'experience'};}
  for(const [k,g] of ghosts)if(t-g.at>o.resumeMs)ghosts.delete(k);
  // 옛 연결이 아직 살아 있는데 같은 토큰으로 다시 붙음(휴대폰 망 전환·화면 꺼짐으로 서버가 끊김을 아직 모름):
  //  옛 연결을 떼고 같은 ID로 이어 받는다. 전에는 새 ID를 받아 같은 사람이 둘(하나는 멈춘 채 최대 40초) 보였다(11-08).
  const live=resume?[...clients.values()].find(x=>x.token===resume&&x.experience===exp):null;
  if(live){
   ghosts.set(resume,{id:live.id,experience:exp,room:live.room?.name??null,hiddenUntil:live.hiddenUntil,avoid:live.avoid,state:live.state,smoke:live.smoke,act:live.act,at:t});
   pairLeave(live,true,t);detach(live);stats.replaced++;try{live.kick?.();}catch{}
  }
  if(clients.size>=o.maxClients){stats.full++;return {ok:false,reason:'full'};}
  if(ipKey&&countIp(ipKey)>=o.maxPerIp){stats.full++;return {ok:false,reason:'ip'};}
  // 다른 체험의 resume 토큰은 쓰지 않는다(ID·방을 체험 사이로 옮기지 않음)
  const ghost=resume&&ghosts.get(resume)?.experience===exp?ghosts.get(resume):null;if(ghost)ghosts.delete(resume);
  // 방 이름이 비었거나 옛 기본 방(gwanak-room-1)이면 그 체험의 첫 서버 방으로(?multi= 빈 링크와 서버 고르기가 다른 방으로 갈리던 결함, 11-08)
  const asked=defaultRoom(exp,room,servers),base=roomBase(asked),srv=findServer(exp,asked,servers);
  // 서버 방은 정원이 차면 바로 거절(다른 방으로 넘기지 않음)
  if(srv&&sizeOf(exp,serverRoomName(srv.room))>=o.maxPerRoom){stats.full++;return {ok:false,reason:'full'};}
  let id=ghost&&!clients.has(ghost.id)?ghost.id:idGen();while(clients.has(id))id=idGen();
  const token=tokenGen(),back=ghost&&id===ghost.id;
  const c={id,token,ipKey,experience:exp,server:srv?.id??null,send:out,kick,name:'',room:null,state:back?ghost.state??null:null,last:null,lastJumpAt:-Infinity,rejectSince:null,stateTimes:[],otherTimes:[],chatLimit:createChatLimiter(),recentChat:[],smoke:back?ghost.smoke??null:null,act:back?ghost.act??null:null,
   hiddenUntil:Math.max(ghost?.hiddenUntil??0,ipKey?hiddenByIp.get(ipKey)??0:0),avoid:ghost?.avoid??null,
   hidden(){return now()<this.hiddenUntil;}};
  // c.last(순간이동 검사 기준)는 비워 둔다: 끊긴 동안 자동 걷기로 멀리 갔어도 돌아온 첫 위치를 그대로 받는다(전과 같음)
  c.name=sanitizeName(name,anonymousName(id,exp),o.banned);
  const target=srv?serverRoomName(srv.room):pickRoom(exp,base,{prefer:ghost&&roomBase(ghost.room)===base?ghost.room:null,avoid:c.hidden()?c.avoid:null});
  if(!target){stats.full++;return {ok:false,reason:'full'};}
  clients.set(id,c);stats.joined++;
  send(c,{t:'welcome',id,exp,room:target,name:c.name,resume:token,max:o.maxPerRoom,count:sizeOf(exp,target)+1,...(srv?{server:srv.id}:{}),...(c.hidden()?{h:1}:{})});
  enter(c,target);
  if(ghost&&id===ghost.id)pairResume(c);
  return {ok:true,client:c};
 }
 function leave(c,{keep=true}={}){
  if(clients.get(c.id)!==c)return; // 이미 나갔거나 새 연결이 같은 ID를 이어 받음(옛 소켓이 늦게 닫힌 것)
  clients.delete(c.id);
  if(keep&&c.room)ghosts.set(c.token,{id:c.id,experience:c.experience,room:c.room.name,hiddenUntil:c.hiddenUntil,avoid:c.avoid,state:c.state,smoke:c.smoke,act:c.act,at:now()});
  pairLeave(c,keep&&!!c.room,now());
  exit(c);
 }
 // 위치 메시지 검사: 모양·속도 제한·순간이동. 받으면 true.
 function acceptState(c,m,t){
  if(!bucket(c.stateTimes,t,o.stateRate)){stats.rateDropped++;return false;}
  if(!finite(m.x)||!finite(m.y)||!finite(m.h)||Math.abs(m.x)>1e5||Math.abs(m.y)>1e5||![0,1,2].includes(m.z)){stats.invalid++;return false;}
  const flags=(m.f|0)&0xff,s={t:'s',id:c.id,q:(m.q|0)&0xffff,z:m.z,x:m.x,y:m.y,h:m.h,v:finite(m.v)?Math.max(0,Math.min(20,m.v)):0,f:flags};
  const L=c.last;
  if(L){
   const dt=Math.max(0,(t-L.at)/1000),d=Math.hypot(s.x-L.x,s.y-L.y),limit=o.slack+o.maxSpeed*dt+(s.z!==L.z?10:0);
   if(d>limit){
    if(flags&FLAG.jump&&t-c.lastJumpAt>=o.jumpCooldownMs){c.lastJumpAt=t;stats.jumps++;}
    else{c.rejectSince??=t;
     if(t-c.rejectSince<o.resyncMs){stats.teleportRejected++;return false;}
     stats.resynced++;}
   }
  }
  c.rejectSince=null;c.last={x:s.x,y:s.y,z:s.z,at:t};c.state=s;c.dirty=true;stats.stateAccepted++;return true;
 }
 // 서로 다른 신고자 수가 기준을 넘으면 숨기고 다른 방으로 옮긴다.
 function maybeHide(target,t){
  const from=new Set(reportLog.filter(r=>r.target===target.id&&t-r.at<=o.reportWindowMs).map(r=>r.reporter));
  if(from.size<o.reportThreshold||target.hidden())return false;
  target.hiddenUntil=t+o.hideMs;if(target.ipKey)hiddenByIp.set(target.ipKey,target.hiddenUntil);stats.hidden++;
  {const of=offers.get(target.id);if(of)dropOffer(of,of.from===target.id?{toTo:{reason:'left'}}:{toFrom:{reason:'left'}});unpair(target.id,'hidden');}
  const old=target.room,next=target.server?null:pickRoom(target.experience,roomBase(old.name),{avoid:old.name});
  target.avoid=old.name;
  if(next){exit(target);send(target,{t:'moved',room:next,h:1});enter(target,next);}
  else toRoom(old,nameRow(target));
  return true;
 }
 function message(c,m,t=now()){
  if(clients.get(c.id)!==c||!m||typeof m!=='object'||typeof m.t!=='string'){stats.invalid++;return;}
  if(!messageAllowed(c.experience,m.t)){stats.wrongExperience++;return;} // 이 체험에서 열지 않은 종류(다른 체험 메시지)
  if(m.t==='s'){acceptState(c,m,t);return;}
  if(!bucket(c.otherTimes,t,o.otherRate)){stats.rateDropped++;return;}
  const room=c.room;if(!room)return;
  switch(m.t){
   // 이름 묻기(클라이언트가 3초마다·모르는 사람이 보일 때). 이름과 함께 마지막 자리·담배 상태도 다시 준다:
   //  받는 쪽이 목록에서 빠졌다가 이름으로만 다시 넣은 사람(가만히 있거나 숨은 탭이라 새 위치가 안 옴)도 그려지게(11-08)
   case 'j':{const p=[];for(const x of room.members.values())if(x!==c){send(c,nameRow(x));if(x.state)p.push(x.state);if(x.smoke)send(c,{t:'lounge:smoke',id:x.id,...x.smoke});if(x.act)send(c,{t:'act',id:x.id,a:x.act});}
    if(p.length)send(c,{t:'snap',p});return;}
   case 'c':{ // 채팅
    if(!c.chatLimit.allow(t)){stats.chatLimited++;send(c,{t:'c-limit'});return;}
    const text=sanitizeChat(typeof m.text==='string'?m.text.slice(0,CHAT.max*4):'',o.chatBanned);
    if(!text){stats.invalid++;return;}
    c.recentChat.push(text);if(c.recentChat.length>CHAT.recent)c.recentChat.shift();
    stats.chats++;toRoom(room,{t:'c',id:c.id,text});return;}
   case 'lounge:smoke':{ // 흡연장 담배 상태
    const sm=sanitizeSmoke(m);if(!sm){stats.invalid++;return;}
    c.smoke=sm;stats.smokes++;toRoom(room,{t:'lounge:smoke',id:c.id,...sm},c);return;}
   case 'act':{ // 행동 상태(11-10): 자세·소품·동작. 체험별 칸만 받아 기억하고 다른 사람에게 중계
    const a=sanitizeAct(c.experience,m.a);if(!a){stats.invalid++;return;}
    c.act=a;stats.acts++;toRoom(room,{t:'act',id:c.id,a},c);return;}
   case 'g':if(GESTURES[m.k]){stats.relayed++;toRoom(room,{t:'g',id:c.id,k:m.k},c);}return;
   case 'a':{ // 동물 놀람 {zone,slot,i,kind,at,x?,z?}
    if(!short(m.zone,40)||!Number.isInteger(m.slot)||!Number.isInteger(m.i)||m.i<0||m.i>999||!ANIMAL_KINDS.includes(m.kind)){stats.invalid++;return;}
    const aid=`${m.zone}@${m.slot}#${m.i}`;for(const [k,at] of room.animals)if(t-at>o.animalDedupMs)room.animals.delete(k);
    if(room.animals.has(aid)){stats.animalDup++;return;}
    room.animals.set(aid,t);stats.animals++;
    toRoom(room,{t:'a',id:c.id,zone:m.zone,slot:m.slot,i:m.i,kind:m.kind,at:finite(m.at)?m.at:t,...(finite(m.x)&&finite(m.z)?{x:m.x,z:m.z}:{})},c);return;}
   case 'report':{
    const target=clients.get(m.to);
    if(!target||target===c||target.experience!==c.experience||!REPORT_REASONS.includes(m.reason)){stats.invalid++;return;}
    if(reportLog.some(r=>r.reporter===c.id&&r.target===target.id&&t-r.at<=o.reportWindowMs))return; // 같은 사람이 같은 대상을 거듭 신고하면 한 번만
    const rec={at:t,room:c.room.key,reporter:c.id,target:target.id,targetName:target.name,reason:m.reason,chat:[...target.recentChat]};
    reportLog.push(rec);stats.reports++;try{reports.append(rec);}catch{}
    send(c,{t:'report-ok',to:target.id});
    maybeHide(target,t);return;}
   case 'b':leave(c,{keep:false});return;
   case 'pair:offer':case 'pair:accept':case 'pair:decline':case 'pair:cancel':case 'pair:end':pairMessage(c,m,t,room);return;
   default:
    if(RELAY_TO.has(m.t)){const to=room.members.get(m.to);if(to&&to!==c){stats.relayed++;send(to,{t:m.t,id:c.id,to:to.id});}return;}
    stats.invalid++;
  }
 }
 // 10Hz: 방마다 바뀐 위치를 하나로 묶어 모든 사람에게(JSON 한 번만 만든다). 3초마다 이름 목록도.
 function tick(){
  pairTick(now());
  for(const room of rooms.values()){
   room.tick++;const p=[];for(const m of room.members.values())if(m.dirty){p.push(m.state);m.dirty=false;}
   const names=room.tick%o.namesEvery===0?[...room.members.values()].map(nameRow):null;
   if(!p.length&&!names)continue;
   const s=JSON.stringify(names?{t:'snap',p,n:names}:{t:'snap',p});stats.snapshots++;
   for(const m of room.members.values())send(m,s);
  }
 }
 // 오래된 신고 기록을 메모리에서도 뺀다(파일 정리는 서버가 시작할 때)
 function prune(days=90){const cut=now()-days*86400e3;for(let i=reportLog.length-1;i>=0;i--)if(reportLog[i].at<cut)reportLog.splice(i,1);for(const [k,u] of hiddenByIp)if(u<now())hiddenByIp.delete(k);}
 const info=()=>({pairs:pairs.size/2,offers:new Set(offers.values()).size,clients:clients.size,rooms:[...rooms.values()].map(r=>({key:r.key,experience:r.experience,name:r.name,count:r.members.size})),ghosts:ghosts.size,stats:{...stats}});
 // 서버 고르기 창용 인원: {hiking:[{id,name,count,max}],smoking:[…]} (SERVERS 표 순서)
 const serverCounts=()=>Object.fromEntries(EXPERIENCES.map(x=>[x,(servers[x]??[]).map(s=>({id:s.id,name:s.name,count:sizeOf(x,serverRoomName(s.room)),max:o.maxPerRoom}))]));
 const pairOf=id=>pairs.get(id)??null;
 return {join,leave,message,tick,prune,info,serverCounts,pairOf,stats,rooms,clients,get reportLog(){return reportLog;},options:o};
}
