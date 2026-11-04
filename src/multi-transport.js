// 전송 계층. 모두 같은 모양 {send(msg), onmessage(fn), close()}이라 나중에 WebSocket·관리형 서비스로 바꿔 끼운다.
// 1) 브라우저 창·탭 사이: BroadcastChannel(같은 브라우저, 같은 주소). 내 컴퓨터 시제품용.
// 2) 가짜 방(createLoopbackHub): 한 프로세스 안에서 N명을 흉내. 지연·유실을 넣을 수 있어 측정에 쓴다.
export function createBroadcastTransport(room='gwanak-room-1',factory=globalThis.BroadcastChannel){
 const ch=new factory(`gwanak-multi:${room}`);const handlers=new Set();
 ch.onmessage=e=>handlers.forEach(h=>h(e.data));
 return {kind:'broadcast',send:m=>ch.postMessage(m),onmessage:fn=>{handlers.add(fn);return()=>handlers.delete(fn);},close:()=>ch.close()};
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
