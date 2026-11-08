// 전송 계층. 모두 같은 모양 {send(msg), onmessage(fn), close()}이라 나중에 WebSocket·관리형 서비스로 바꿔 끼운다.
// 1) 브라우저 창·탭 사이: BroadcastChannel(같은 브라우저, 같은 주소). 내 컴퓨터 시제품용.
// 2) 가짜 방(createLoopbackHub): 한 프로세스 안에서 N명을 흉내. 지연·유실을 넣을 수 있어 측정에 쓴다.
import {createChatLimiter,sanitizeChat} from './multi-protocol.js';
//  채널 이름 `gwanak-multi:체험:방`. 등산은 예전 채널 `gwanak-multi:방`을 그대로 쓴다(옛 탭과 이어지게). 방 이름의 ':'는 빼서 겹치지 않게 한다.
//  채팅 c는 서버가 없으니 여기서 서버와 같은 규칙을 흉내 낸다: 보낼 때 속도 제한(넘으면 내게 {t:'c-limit'})·정리 뒤 내게도 되돌려 주고, 받은 글도 다시 정리한다.
//  채팅을 보낼 때는 {t:'c',id:내ID,text}처럼 id를 붙여야 한다(서버는 id를 무시하고 자기가 정한 ID를 쓴다).
export const broadcastChannelName=(experience,room)=>{const r=String(room).replace(/:/g,'');return experience==='hiking'?`gwanak-multi:${r}`:`gwanak-multi:${experience}:${r}`;};
export function createBroadcastTransport(room='gwanak-room-1',factory=globalThis.BroadcastChannel,{experience='hiking',now=()=>Date.now()}={}){
 const ch=new factory(broadcastChannelName(experience,room));const handlers=new Set(),limiter=createChatLimiter();
 const emit=m=>handlers.forEach(h=>h(m));
 ch.onmessage=e=>{const m=e.data;
  if(m?.t==='c'){const text=sanitizeChat(m.text);if(!text||typeof m.id!=='string')return;emit({t:'c',id:m.id,text});return;}
  emit(m);};
 function send(m){
  if(m?.t!=='c'){ch.postMessage(m);return;}
  if(!limiter.allow(now())){emit({t:'c-limit'});return;}
  const text=sanitizeChat(m.text);if(!text)return;
  const out={t:'c',id:m.id,text};ch.postMessage(out);emit(out);
 }
 return {kind:'broadcast',experience,send,onmessage:fn=>{handlers.add(fn);return()=>handlers.delete(fn);},close:()=>ch.close()};
}
// 지연(ms)·유실률·지터가 있는 가짜 방. clock()은 ms. 직접 구동(pump)해서 시간을 제어한다.
export function createLoopbackHub({latency=40,jitter=15,loss=0,seed=1}={}){
 let s=seed>>>0||1;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
 const peers=new Set(),queue=[];let sent=0,delivered=0,dropped=0,bytes=0;
 const hub={
  join(){
   const handlers=new Set(),peer={handlers};peers.add(peer);
   return {kind:'loopback',send(m,now=hub.now){sent++;const size=JSON.stringify(m).length;for(const p of peers){if(p===peer)continue;bytes+=size;if(rnd()<loss){dropped++;continue;}queue.push({at:now+latency+(rnd()-.5)*2*jitter,peer:p,m});}},
    onmessage:fn=>{handlers.add(fn);return()=>handlers.delete(fn);},close:()=>peers.delete(peer)};
  },
  now:0,
  pump(now){hub.now=now;queue.sort((a,b)=>a.at-b.at);while(queue.length&&queue[0].at<=now){const {peer,m}=queue.shift();if(!peers.has(peer))continue;delivered++;peer.handlers.forEach(h=>h(m,now));}},
  get stats(){return {sent,delivered,dropped,bytes,peers:peers.size};}
 };
 return hub;
}
// 3) 서버(createWebSocketTransport): 직접 만든 함께 걷기 서버(server/multi-server.mjs)에 브라우저 WebSocket으로 붙는다.
//  - 첫 메시지 {t:'hello',exp,room,name,resume}(exp = 체험 id 'hiking'|'smoking', 서버가 방을 체험별로 나눈다) → 서버가 {t:'welcome',id,room,…}로 임시 ID와 실제 방(20명이 차면 방이름-2)을 알려 준다.
//  - 서버의 10Hz 묶음 {t:'snap',p:[…],n:[…]}은 풀어서 한 줄씩(위치 's', 이름 'j') 넘긴다 → multi-client.js는 BroadcastChannel 때와 같은 메시지를 받는다.
//  - 끊기면 0.5초부터 두 배씩(최대 15초, ±20% 흔들기) 다시 붙는다. 다시 붙을 때 resume 토큰을 보내 60초 안이면 같은 ID·같은 방이다.
//  - 상태 onstatus(fn): 'connecting'(처음) · 'online' · 'reconnecting' · 'offline'(close 뒤·서버가 체험 id를 거절 {t:'reject'}) · 'full'(서버 꽉 참, 30초 뒤 다시 시도).
//  - 연결 전·끊긴 동안 보낸 메시지는 버린다(위치는 곧 새로 보내므로 쌓지 않는다).
//  - 체험이 무엇이든 메시지는 그대로 주고받는다: 채팅 c·c-limit, 흡연장 위치 s·담배 상태 lounge:smoke도 onmessage로 한 줄씩 온다(서버가 체험별로 거름).
export function createWebSocketTransport(url,{experience='hiking',room='gwanak-room-1',name='',WebSocketImpl=globalThis.WebSocket,backoff={base:500,max:15000,jitter:.2},fullRetryMs=30000,random=Math.random,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const handlers=new Set(),statusHandlers=new Set();
 let ws=null,state='connecting',attempt=0,timer=null,closed=false,resume=null,everOnline=false;
 const info={id:null,experience,room,name,count:0,max:0,hidden:false};
 const setState=s=>{if(s===state&&s!=='online')return;state=s;statusHandlers.forEach(h=>h(s,{...info}));};
 const emit=m=>handlers.forEach(h=>h(m));
 function schedule(ms){clearTimer(timer);timer=setTimer(connect,ms);}
 function retryDelay(){const d=Math.min(backoff.max,backoff.base*2**attempt);attempt++;return Math.round(d*(1+(random()*2-1)*backoff.jitter));}
 function connect(){
  if(closed)return;
  let sock;try{sock=new WebSocketImpl(url);}catch{setState(everOnline?'reconnecting':'connecting');schedule(retryDelay());return;}
  ws=sock;let full=false;
  sock.onopen=()=>{try{sock.send(JSON.stringify({t:'hello',exp:experience,room:info.room,name:info.name,resume}));}catch{}};
  sock.onmessage=e=>{
   let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m.t==='welcome'){attempt=0;everOnline=true;resume=m.resume;Object.assign(info,{id:m.id,room:m.room,name:m.name,max:m.max,count:m.count,hidden:!!m.h});setState('online');emit({t:'welcome',id:m.id,room:m.room,name:m.name});return;}
   if(m.t==='full'){full=true;setState('full');return;}
   if(m.t==='reject'){closed=true;clearTimer(timer);emit(m);setState('offline');return;} // 고칠 수 없는 거절(체험 id): 다시 시도하지 않음
   if(m.t==='moved'){info.room=m.room;info.hidden=!!m.h;emit(m);setState('online');return;}
   if(m.t==='snap'){if(m.n)for(const r of m.n)emit(r);for(const s of m.p??[])emit(s);return;}
   emit(m);
  };
  // 끊김 처리는 한 번만. 브라우저는 error 뒤 늘 close가 오지만, 연결 자체가 거부되면 close 없이 error만 오는 구현도 있다(Node 22 내장 WebSocket).
  const lost=()=>{if(ws!==sock)return;ws=null;if(closed){setState('offline');return;}
   if(full){schedule(fullRetryMs);return;}
   setState(everOnline?'reconnecting':'connecting');schedule(retryDelay());};
  sock.onclose=lost;
  sock.onerror=()=>{lost();try{sock.close();}catch{}};
 }
 connect();
 return {kind:'server',url,
  send(m){if(ws&&ws.readyState===1)try{ws.send(JSON.stringify(m));}catch{}},
  onmessage:fn=>{handlers.add(fn);return()=>handlers.delete(fn);},
  onstatus:fn=>{statusHandlers.add(fn);return()=>statusHandlers.delete(fn);},
  get status(){return state;},get info(){return {...info};},
  // 시험용: 지금 연결을 끊어 재접속 경로를 탄다
  drop(){try{ws?.close();}catch{}},
  close(){closed=true;clearTimer(timer);const w=ws;if(w){try{w.close(1000,'bye');}catch{}}else setState('offline');ws=null;if(w)setState('offline');}
 };
}
// 서버 주소: 주소창 ?server=wss://… 이 먼저, 없으면 빌드 변수 VITE_MULTI_SERVER_URL, 그래도 없으면 null(= BroadcastChannel).
// http(s)://로 적어도 ws(s)://로 바꾼다(터널 주소를 그대로 붙여 넣어도 되게). ?server=off는 빌드 변수를 꺼 BroadcastChannel로.
export function multiServerUrl(search='',envUrl=''){
 const q=new URLSearchParams(search),raw=(q.has('server')?q.get('server'):envUrl)||'';
 if(!raw||raw==='off'||raw==='local')return null;
 let u=raw.trim();if(/^https?:\/\//i.test(u))u=u.replace(/^http/i,'ws');else if(!/^wss?:\/\//i.test(u))u=`wss://${u}`;
 try{return new URL(u).href;}catch{return null;}
}
