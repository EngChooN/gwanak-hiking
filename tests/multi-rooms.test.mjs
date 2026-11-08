// 함께 걷기 서버 단위 시험(2026-11-08): 방 로직(server/rooms.mjs)·WebSocket 프레임(server/ws.mjs)·클라이언트 전송(createWebSocketTransport)·서버 주소 읽기.
// 소켓 없이 가짜 시계와 send 수집기로 돌린다. 실제 서버를 띄우는 시험은 tests/multi-server.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRooms,sanitizeRoom,roomBase,pruneReports,ROOM_DEFAULTS} from '../server/rooms.mjs';
import {createFrameReader,encodeFrame,encodeMaskedFrame,OP,acceptKey,handshakeResponse,closePayload,parseClose} from '../server/ws.mjs';
import {createWebSocketTransport,multiServerUrl} from '../src/multi-transport.js';
import {FLAG,NET,EXPERIENCES,parseExperience,messageAllowed,EXPERIENCE_MESSAGES} from '../src/multi-protocol.js';
import {roomKey} from '../server/rooms.mjs';

function setup(opts={}){
 let t=1_000_000,n=0;const appended=[];
 const rooms=createRooms({now:()=>t,idGen:()=>`p${++n}`,tokenGen:()=>`tok${n}`,reports:{append:r=>appended.push(r)},...opts});
 const join=(name,room='산',extra={})=>{const inbox=[];const r=rooms.join({room,name,send:s=>inbox.push(JSON.parse(s)),...extra});if(r.ok)r.client.inbox=inbox;return r.ok?r.client:r;};
 return {rooms,join,appended,advance:ms=>{t+=ms;},get now(){return t;}};
}
const state=(x,y,extra={})=>({t:'s',q:1,z:0,x,y,h:0,v:1,f:0,...extra});

test('방 배정: 20명이 차면 21번째는 방이름-2, 나가면 빈자리를 다시 쓴다',()=>{
 const {rooms,join}=setup();
 const cs=Array.from({length:21},(_,i)=>join(`사람${i}`));
 assert.equal(cs.filter(c=>c.room.name==='산').length,20);
 assert.equal(cs[20].room.name,'산-2');
 assert.equal(cs[20].inbox[0].t,'welcome');assert.equal(cs[20].inbox[0].room,'산-2');assert.equal(cs[20].inbox[0].max,20);
 rooms.leave(cs[3]);
 assert.equal(join('새사람').room.name,'산','빈자리');
 // 방이름-2로 들어와도 기본 이름(산)부터 채운다
 rooms.leave(cs[5]);assert.equal(join('또','산-2').room.name,'산');
});
test('서버 전체가 차면 full, 같은 ipKey 접속 수 제한',()=>{
 const {join}=setup({maxClients:3,maxPerIp:2});
 join('a','x',{ipKey:'k1'});join('b','x',{ipKey:'k1'});
 assert.deepEqual(join('c','x',{ipKey:'k1'}),{ok:false,reason:'ip'});
 join('d','x',{ipKey:'k2'});
 assert.deepEqual(join('e','x',{ipKey:'k3'}),{ok:false,reason:'full'});
});
test('이름 재검사: sanitizeName 재사용(제어 문자·링크·12자·금칙어), 방 이름 정리',()=>{
 const {join}=setup({banned:['나쁜말']});
 assert.equal(join('  하‮늘\u0007  ').name,'하늘');
 assert.equal(join('http://spam.example/x').name,'등산객P2');
 assert.equal(join('가나다라마바사아자차카타파하').name,'가나다라마바사아자차카타');
 assert.equal(join('이건나쁜말이야').name,'등산객P4');
 const c=join('바다'),d=join('<b>x</b>');
 assert.equal(d.inbox.find(m=>m.t==='j'&&m.id===c.id).n,'바다','다른 사람에게도 정리된 이름');
 assert.equal(sanitizeRoom('../관악 산!!'),'관악산');assert.equal(sanitizeRoom(''),'gwanak-room-1');assert.equal(roomBase('산-12'),'산');assert.equal(roomBase('2026'),'2026');
});
test('속도 제한: 1초에 위치 15개까지만 받고 나머지는 버린다',()=>{
 const {rooms,join,advance}=setup();const a=join('a');
 for(let i=0;i<30;i++){rooms.message(a,state(i*.01,0));advance(10);}
 assert.equal(rooms.stats.stateAccepted,15);assert.equal(rooms.stats.rateDropped,15);
 advance(1000);rooms.message(a,state(.5,0));assert.equal(rooms.stats.stateAccepted,16,'1초 지나면 다시 받음');
 assert.equal(ROOM_DEFAULTS.stateRate,15);
});
test('순간이동 거부: 표시 없는 큰 이동은 버리고, 구간 이동 표시(FLAG.jump)는 1초에 한 번 허용, 3초 고집하면 다시 맞춤',()=>{
 const {rooms,join,advance}=setup();const a=join('a');
 rooms.message(a,state(0,0));advance(100);
 rooms.message(a,state(1,0));assert.equal(a.state.x,1,'걷기(0.1초에 1m)');advance(100);
 rooms.message(a,state(300,0));assert.equal(a.state.x,1,'표시 없는 300m');assert.equal(rooms.stats.teleportRejected,1);advance(100);
 rooms.message(a,state(300,0,{f:FLAG.jump}));assert.equal(a.state.x,300,'구간 이동 표시');advance(100);
 rooms.message(a,state(900,0,{f:FLAG.jump}));assert.equal(a.state.x,300,'1초 안에 두 번째 순간이동');advance(1000);
 rooms.message(a,state(900,0,{f:FLAG.jump}));assert.equal(a.state.x,900,'1초 뒤');
 // 빠르게 달리기(12m/s 안)는 통과
 advance(1000);rooms.message(a,state(910,0));assert.equal(a.state.x,910);
 // 표시를 빠뜨린 정상 클라이언트: 3초 넘게 같은 새 자리를 보내면 받아 준다
 for(let i=0;i<40;i++){advance(100);rooms.message(a,state(2000,0));}
 assert.equal(a.state.x,2000);assert.equal(rooms.stats.resynced,1);
 // 모양이 틀린 위치
 rooms.message(a,{t:'s',x:'1',y:0,h:0,z:0});rooms.message(a,{t:'s',x:1,y:0,h:0,z:7});assert.equal(rooms.stats.invalid,2);
});
test('10Hz 스냅샷: 바뀐 위치만 하나로 묶고 ID는 서버가 덮어쓴다(사칭 불가)',()=>{
 const {rooms,join}=setup();const a=join('a'),b=join('b');
 rooms.message(a,{...state(1,2),id:'사칭'});b.inbox.length=0;
 rooms.tick();
 const snap=b.inbox.find(m=>m.t==='snap');assert.equal(snap.p.length,1);assert.equal(snap.p[0].id,a.id);
 b.inbox.length=0;rooms.tick();assert.equal(b.inbox.filter(m=>m.t==='snap').length,0,'바뀐 것 없으면 보내지 않음');
 for(let i=0;i<ROOM_DEFAULTS.namesEvery;i++)rooms.tick();
 assert.ok(b.inbox.some(m=>m.t==='snap'&&m.n?.some(r=>r.id===a.id&&r.n==='a')),'3초마다 이름 목록');
});
test('인사·셀카 중계: 인사는 방 전체, 셀카 요청은 받는 사람에게만, 다른 방에는 가지 않음',()=>{
 const {rooms,join}=setup({maxPerRoom:2});const a=join('a'),b=join('b'),c=join('c');
 assert.equal(c.room.name,'산-2');
 for(const x of [a,b,c])x.inbox.length=0;
 rooms.message(a,{t:'g',id:a.id,k:'wave'});
 assert.deepEqual(b.inbox,[{t:'g',id:a.id,k:'wave'}]);assert.equal(c.inbox.length,0);assert.equal(a.inbox.length,0);
 rooms.message(a,{t:'sr',to:b.id});assert.deepEqual(b.inbox.at(-1),{t:'sr',id:a.id,to:b.id});
 rooms.message(b,{t:'sa',to:a.id});assert.deepEqual(a.inbox.at(-1),{t:'sa',id:b.id,to:a.id});
 rooms.message(a,{t:'sr',to:c.id});assert.equal(c.inbox.length,0,'다른 방 사람에게는 안 감');
 rooms.message(a,{t:'g',k:'dance'});assert.equal(b.inbox.length,2,'모르는 행동');
});
test('동물 놀람 중계: 같은 방에 {zone,slot,i,kind,at}, 같은 동물은 30초에 한 번',()=>{
 const {rooms,join,advance}=setup();const a=join('a'),b=join('b');b.inbox.length=0;
 const ev={t:'a',zone:'valley',slot:5880000,i:2,kind:'hare',at:123,x:1,z:2};
 rooms.message(a,ev);assert.deepEqual(b.inbox,[{t:'a',id:a.id,zone:'valley',slot:5880000,i:2,kind:'hare',at:123,x:1,z:2}]);
 rooms.message(b,ev);assert.equal(a.inbox.filter(m=>m.t==='a').length,0,'같은 동물 두 번째는 버림');
 advance(31000);rooms.message(b,ev);assert.equal(a.inbox.filter(m=>m.t==='a').length,1);
 rooms.message(a,{...ev,kind:'tiger'});rooms.message(a,{...ev,slot:1.5});assert.equal(rooms.stats.invalid,2);
});
test('신고: 서로 다른 3명이면 24시간 이름표 숨김·다른 방 재배정, 같은 사람 거듭 신고는 한 번, 기록에 IP 없음',()=>{
 const {rooms,join,appended,advance}=setup({maxPerRoom:4});
 const bad=join('나쁜이','산',{ipKey:'IPKEY-bad'}),r1=join('r1'),r2=join('r2'),r3=join('r3');
 rooms.message(r1,{t:'report',to:bad.id,reason:'부적절한 이름'});advance(10);
 rooms.message(r1,{t:'report',to:bad.id,reason:'기타'});advance(10);
 rooms.message(r2,{t:'report',to:bad.id,reason:'방해·괴롭힘'});
 assert.equal(appended.length,2);assert.equal(bad.hidden(),false);assert.equal(bad.room.name,'산');
 r1.inbox.length=0;
 rooms.message(r3,{t:'report',to:bad.id,reason:'기타'});
 assert.equal(appended.length,3);assert.equal(bad.hidden(),true);
 assert.equal(bad.room.name,'산-2','다른 방');assert.ok(bad.inbox.some(m=>m.t==='moved'&&m.room==='산-2'&&m.h===1));
 assert.ok(r1.inbox.some(m=>m.t==='b'&&m.id===bad.id),'원래 방에서는 나감');
 for(const rec of appended){assert.deepEqual(Object.keys(rec).sort(),['at','chat','reason','reporter','room','target','targetName']);assert.ok(!JSON.stringify(rec).includes('IPKEY'));}
 // 새 방 사람에게 이름 대신 익명·숨김 표시
 join('채움');const other=join('다른');assert.equal(other.room.name,'산-2');assert.ok(other.inbox.some(m=>m.t==='j'&&m.id===bad.id&&m.h===1&&m.n.startsWith('등산객')));
 // 끊었다 다시 와도(같은 ipKey) 24시간 동안은 숨김이 이어지고, 원래 방은 피한다
 rooms.leave(bad,{keep:false});const again=join('나쁜이','산',{ipKey:'IPKEY-bad'});
 assert.equal(again.hidden(),true);assert.notEqual(again.room.name,'산');
 advance(24*3600e3+1);assert.equal(again.hidden(),false,'24시간 뒤 풀림');
 rooms.message(r1,{t:'report',to:'없는사람',reason:'기타'});rooms.message(r1,{t:'report',to:r2.id,reason:'욕'});assert.equal(appended.length,3);
});
test('체험 구분: 같은 방 이름이라도 체험이 다르면 다른 방(방 키 체험:방이름), 서로 보이지 않는다',()=>{
 const {rooms,join}=setup();
 const h=join('등산','옥상',{experience:'hiking'}),k=join('흡연','옥상',{experience:'smoking'});
 assert.equal(h.room.key,'hiking:옥상');assert.equal(k.room.key,'smoking:옥상');assert.equal(roomKey('smoking','옥상-1'),'smoking:옥상-1');
 assert.equal(h.room.name,'옥상');assert.equal(k.room.name,'옥상','클라이언트에게는 방 이름만');
 assert.equal(k.inbox[0].exp,'smoking');assert.equal(k.inbox[0].room,'옥상');assert.equal(k.inbox[0].count,1,'다른 체험 사람은 세지 않음');
 assert.ok(!h.inbox.some(m=>m.t==='j'&&m.id===k.id)&&!k.inbox.some(m=>m.t==='j'&&m.id===h.id),'이름도 오가지 않음');
 rooms.message(h,state(1,1));rooms.tick();
 assert.ok(!k.inbox.some(m=>m.t==='snap'&&m.p.some(p=>p.id===h.id)),'등산 위치가 흡연장으로 새지 않음');
 assert.deepEqual(rooms.info().rooms.map(r=>r.key).sort(),['hiking:옥상','smoking:옥상']);
});
test('체험 구분: 꽉 차면 -2 규칙은 체험별로 따로 센다',()=>{
 const {join}=setup({maxPerRoom:2});
 const h=[join('a','산',{experience:'hiking'}),join('b','산',{experience:'hiking'}),join('c','산',{experience:'hiking'})];
 assert.deepEqual(h.map(c=>c.room.key),['hiking:산','hiking:산','hiking:산-2']);
 const k=[join('d','산',{experience:'smoking'}),join('e','산',{experience:'smoking'}),join('f','산',{experience:'smoking'})];
 assert.deepEqual(k.map(c=>c.room.key),['smoking:산','smoking:산','smoking:산-2'],'등산 방이 차 있어도 흡연장 산은 비어 있음');
});
test('체험 구분 하위 호환: 체험 id가 없는 옛 클라이언트는 등산, 목록 밖 id는 거절',()=>{
 const {rooms,join}=setup();
 const old=join('옛날'),now=join('지금','산',{experience:'hiking'});
 assert.equal(old.experience,'hiking');assert.equal(old.room.key,'hiking:산');assert.equal(old.room,now.room,'옛 클라이언트와 새 등산 클라이언트는 같은 방');
 assert.ok(now.inbox.some(m=>m.t==='j'&&m.id===old.id));
 for(const x of [null,''])assert.equal(join('빈값','산',{experience:x}).room.key,'hiking:산');
 for(const x of ['golf','HIKING',' hiking',3,{}])assert.deepEqual(join('이상','산',{experience:x}),{ok:false,reason:'experience'},String(x));
 assert.equal(rooms.stats.badExperience,5);
 assert.deepEqual(EXPERIENCES,['hiking','smoking']);assert.equal(parseExperience(undefined),'hiking');assert.equal(parseExperience('smoking'),'smoking');assert.equal(parseExperience('x'),null);
});
test('체험 구분: 체험마다 받는 메시지 종류가 다르다(흡연장은 위치·채팅·담배 상태, 인사·동물·셀카는 등산 전용)',()=>{
 const {rooms,join}=setup();
 const k1=join('a','옥상',{experience:'smoking'}),k2=join('b','옥상',{experience:'smoking'});k2.inbox.length=0;
 for(const m of [{t:'g',k:'hello'},{t:'sr',to:k2.id},{t:'a',zone:'z',slot:0,i:0,kind:'cat'},{t:'lounge:chat',text:'안녕'}])rooms.message(k1,m);
 rooms.tick();
 assert.equal(rooms.stats.wrongExperience,4);assert.equal(k2.inbox.length,0,'등산 전용·옛 예약 종류는 중계 안 됨');
 rooms.message(k1,{t:'report',to:k2.id,reason:'기타'});assert.ok(k1.inbox.some(m=>m.t==='report-ok'),'공통 종류(신고)는 받음');
 for(const t of ['s','g','a','sr','sa','sd','se','j','report','b','c'])assert.ok(messageAllowed('hiking',t),t);
 for(const t of ['j','report','b','c','s','lounge:smoke'])assert.ok(messageAllowed('smoking',t),t);
 assert.equal(messageAllowed('hiking','lounge:smoke'),false);assert.equal(messageAllowed('smoking','lounge:chat'),false,'lounge:chat 예약은 공통 c로 바뀜');
 assert.equal(messageAllowed('nope','j'),false);
});
test('체험 구분: 신고는 같은 체험 사람만, resume 토큰은 다른 체험으로 넘어가지 않음, 신고 기록 room은 방 키',()=>{
 const {rooms,join,appended}=setup();
 const h=join('등산','산'),k=join('흡연','산',{experience:'smoking'});
 rooms.message(k,{t:'report',to:h.id,reason:'기타'});assert.equal(appended.length,0,'다른 체험 사람은 신고 못 함');
 const h2=join('등산2','산');rooms.message(h2,{t:'report',to:h.id,reason:'기타'});assert.equal(appended.at(-1).room,'hiking:산');
 const token=k.inbox[0].resume,id=k.id;rooms.leave(k);
 const back=join('흡연','산',{experience:'hiking',resume:token});assert.notEqual(back.id,id,'흡연장 토큰으로 등산에 같은 ID로 들어가지 않음');
});
test('재접속: resume 토큰이면 60초 안에 같은 ID·같은 방',()=>{
 const {rooms,join,advance}=setup({maxPerRoom:2});const a=join('a'),b=join('b');
 const token=a.inbox[0].resume,id=a.id;rooms.leave(a);
 assert.ok(b.inbox.some(m=>m.t==='b'&&m.id===id));
 advance(5000);const a2=join('a','산',{resume:token});
 assert.equal(a2.id,id);assert.equal(a2.room.name,'산');
 rooms.leave(a2);advance(61000);const a3=join('a','산',{resume:a2.inbox[0].resume});assert.notEqual(a3.id,id,'60초 지나면 새 ID');
});
test('신고 기록 90일 정리: 오래된 줄·깨진 줄을 뺀다',()=>{
 const now=Date.UTC(2026,10,8),day=86400e3;
 const lines=[JSON.stringify({at:now-91*day,target:'old'}),'깨진 줄{',JSON.stringify({at:now-89*day,target:'keep'}),'',JSON.stringify({at:now,target:'new'})];
 assert.deepEqual(pruneReports(lines,now).map(r=>r.target),['keep','new']);
});

// ── WebSocket 프레임
test('WebSocket 핸드셰이크 키(RFC 6455 예시)와 잘못된 요청',()=>{
 assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='),'s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
 assert.match(handshakeResponse({upgrade:'websocket','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ==','sec-websocket-version':'13'}),/^HTTP\/1\.1 101[\s\S]*Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=\r\n\r\n$/);
 assert.equal(handshakeResponse({upgrade:'websocket','sec-websocket-version':'13'}),null);
 assert.equal(handshakeResponse({upgrade:'h2c','sec-websocket-key':'x','sec-websocket-version':'13'}),null);
});
test('프레임: 마스킹 해제, 길이 125·126(16비트)·127(64비트), 조각나 들어와도 이어 붙임',()=>{
 for(const n of [0,5,125,126,1000,65535,70000]){
  const read=createFrameReader({maxPayload:100000}),text='가'.repeat(Math.ceil(n/3)).slice(0,Math.ceil(n/3)),frame=encodeMaskedFrame(OP.text,text,Buffer.from([9,8,7,6]));
  // 1바이트씩 넣어도 마지막에 하나가 나와야 한다(작은 것만 — 큰 것은 3조각)
  const parts=n<200?[...frame].map(b=>Buffer.from([b])):[frame.subarray(0,3),frame.subarray(3,9),frame.subarray(9)];
  const got=[];for(const p of parts){const r=read(p);assert.equal(r.error,null);got.push(...r.frames);}
  assert.equal(got.length,1,`길이 ${n}`);assert.equal(got[0].payload.toString('utf8'),text);assert.equal(got[0].opcode,OP.text);
 }
 const out=encodeFrame(OP.text,'x'.repeat(126));assert.equal(out[1],126);assert.equal(out.readUInt16BE(2),126);
 const big=encodeFrame(OP.text,'x'.repeat(70000));assert.equal(big[1],127);assert.equal(Number(big.readBigUInt64BE(2)),70000);
});
test('프레임 오류: 마스킹 없음·너무 큼·조각난 제어 프레임, close 본문',()=>{
 assert.equal(createFrameReader()(encodeFrame(OP.text,'hi')).error.code,1002);
 assert.equal(createFrameReader({maxPayload:10})(encodeMaskedFrame(OP.text,'x'.repeat(11))).error.code,1009);
 assert.equal(createFrameReader()(encodeMaskedFrame(OP.ping,'x',undefined,false)).error.code,1002);
 const two=Buffer.concat([encodeMaskedFrame(OP.ping,'a'),encodeMaskedFrame(OP.text,'b')]),r=createFrameReader()(two);
 assert.deepEqual(r.frames.map(f=>[f.opcode,f.payload.toString()]),[[OP.ping,'a'],[OP.text,'b']]);
 assert.deepEqual(parseClose(closePayload(1013,'full')),{code:1013,reason:'full'});
});

// ── 클라이언트 전송(가짜 WebSocket)
function fakeWs(){
 const made=[];
 class W{constructor(url){this.url=url;this.readyState=0;this.sent=[];made.push(this);}
  send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.onclose?.({});}
  open(){this.readyState=1;this.onopen?.();}recv(m){this.onmessage?.({data:JSON.stringify(m)});}fail(){this.readyState=3;this.onclose?.({});}}
 return {W,made};
}
function fakeTimers(){const q=[];return {q,set:(fn,ms)=>{const t={fn,ms};q.push(t);return t;},clear:t=>{const i=q.indexOf(t);if(i>=0)q.splice(i,1);},run(){const t=q.shift();t?.fn();return t?.ms;}};}
test('전송: hello → welcome(ID·방) → snap을 한 줄씩 풀어 넘김 → 상태 이벤트',()=>{
 const {W,made}=fakeWs(),tm=fakeTimers(),got=[],states=[];
 const t=createWebSocketTransport('ws://x',{room:'산',name:'하늘',WebSocketImpl:W,setTimer:tm.set,clearTimer:tm.clear,random:()=>.5});
 t.onmessage(m=>got.push(m));t.onstatus(s=>states.push(s));
 assert.equal(t.status,'connecting');assert.equal(t.kind,'server');
 t.send({t:'s'});assert.equal(made[0].sent.length,0,'열리기 전 메시지는 버림');
 made[0].open();assert.deepEqual(made[0].sent[0],{t:'hello',exp:'hiking',room:'산',name:'하늘',resume:null},'체험 id 기본은 등산');
 made[0].recv({t:'welcome',id:'p1',room:'산-2',name:'하늘',resume:'R1',max:20,count:3});
 assert.equal(t.status,'online');assert.equal(t.info.id,'p1');assert.equal(t.info.room,'산-2');
 made[0].recv({t:'snap',p:[{t:'s',id:'p2',x:1}],n:[{t:'j',id:'p2',n:'바다'}]});
 assert.deepEqual(got.map(m=>m.t),['welcome','j','s']);
 t.send({t:'g',k:'wave'});assert.deepEqual(made[0].sent.at(-1),{t:'g',k:'wave'});
 assert.deepEqual(states,['online']);
});
test('전송: 끊기면 다시 연결 중 → 지수 백오프(0.5·1·2초…최대 15초) → resume 토큰으로 다시 붙음, full이면 30초 뒤, close면 끊김',()=>{
 const {W,made}=fakeWs(),tm=fakeTimers(),states=[];
 const t=createWebSocketTransport('ws://x',{room:'산',name:'a',WebSocketImpl:W,setTimer:tm.set,clearTimer:tm.clear,random:()=>.5});
 t.onstatus(s=>states.push(s));
 made[0].open();made[0].recv({t:'welcome',id:'p1',room:'산',name:'a',resume:'R1'});
 made[0].fail();assert.equal(t.status,'reconnecting');
 const delays=[];for(let i=0;i<7;i++){delays.push(tm.q.at(-1).ms);tm.run();made.at(-1).fail();}
 assert.deepEqual(delays,[500,1000,2000,4000,8000,15000,15000]);
 tm.run();made.at(-1).open();assert.equal(made.at(-1).sent[0].resume,'R1');
 made.at(-1).recv({t:'welcome',id:'p1',room:'산',name:'a',resume:'R2'});assert.equal(t.status,'online');
 made.at(-1).fail();assert.equal(tm.q.at(-1).ms,500,'붙었다 끊기면 다시 0.5초부터');
 tm.run();made.at(-1).open();made.at(-1).recv({t:'full',reason:'full'});assert.equal(t.status,'full');made.at(-1).fail();assert.equal(tm.q.at(-1).ms,30000);
 t.close();assert.equal(t.status,'offline');assert.equal(tm.q.length,0,'닫으면 다시 시도 안 함');
 assert.deepEqual(states,['online','reconnecting','online','reconnecting','full','offline']);
});
test('서버 주소: ?server= 먼저, 그다음 빌드 변수, https 주소는 wss로, off면 BroadcastChannel',()=>{
 assert.equal(multiServerUrl('?multi=a&server=wss://abc.trycloudflare.com',''),'wss://abc.trycloudflare.com/');
 assert.equal(multiServerUrl('?server=https://abc.trycloudflare.com','wss://env.example'),'wss://abc.trycloudflare.com/');
 assert.equal(multiServerUrl('?server=http://192.168.0.5:8787',''),'ws://192.168.0.5:8787/');
 assert.equal(multiServerUrl('?server=ws://127.0.0.1:8787',''),'ws://127.0.0.1:8787/');
 assert.equal(multiServerUrl('','wss://env.example/multi'),'wss://env.example/multi');
 assert.equal(multiServerUrl('?server=off','wss://env.example'),null);
 assert.equal(multiServerUrl('',''),null);
 assert.equal(multiServerUrl('?server=abc.trycloudflare.com',''),'wss://abc.trycloudflare.com/');
});
test('보간기는 순간이동 표시와 상관없이 25m 넘으면 바로 옮긴다(서버 FLAG.jump와 같은 쪽 규칙)',()=>{
 assert.equal(FLAG.jump,4);assert.ok(NET.snapDistance>2,'클라이언트가 jump 표시를 붙이는 2m보다 커야 함');
});
test('같이 셀카 자리 옮김: 코스 전체에서 가장 가까운 지점을 찾는다(예전에는 정상 앞 130m만 찾아 산길 파트너가 정상으로 갔다)',async()=>{
 const {projectToRoute}=await import('../src/summit.js'),{positionAt}=await import('../src/movement.js');
 for(const s of [300,1500,2600,4000]){const [x,,z]=positionAt(s,.7),r=projectToRoute(x,z,0);assert.ok(Math.abs(r.s-s)<1&&Math.abs(r.lateral-.7)<.3,`s ${s} → ${r.s.toFixed(1)}, ${r.lateral.toFixed(2)}`);}
});

// ── 서버 고르기(11-08): SERVERS 표의 방은 꽉 차면 -2로 넘기지 않고 full ──
test('서버 방(관악산-1 → hiking:관악산): 20명이 차면 21번째는 full, 다른 방 이름은 기존 -2 규칙',()=>{
 const {rooms,join}=setup();
 const cs=Array.from({length:20},(_,i)=>join(`사람${i}`,'관악산-1'));
 assert.ok(cs.every(c=>c.room.key==='hiking:관악산'),'서버 쪽 방 키는 기존 규칙대로 끝 -1을 뗀다');
 assert.equal(cs[0].inbox[0].server,'1');assert.equal(cs[0].inbox[0].room,'관악산');
 const r=join('스물한번째','관악산-1');assert.deepEqual(r,{ok:false,reason:'full'});
 assert.equal(rooms.info().rooms.some(x=>x.name==='관악산-2'),false,'-2 방이 생기지 않음');
 // 옛 주소의 다른 번호(관악산-3)·끝 번호 없는 이름도 같은 서버로 보고 거절
 assert.equal(join('옛주소','관악산-3').reason,'full');assert.equal(join('번호없음','관악산').reason,'full');
 // 서버 목록 밖 방은 그대로 넘긴다
 for(let i=0;i<20;i++)join(`b${i}`,'우리끼리');assert.equal(join('b20','우리끼리').room.name,'우리끼리-2');
 // 한 명 나가면 다시 들어갈 수 있다
 rooms.leave(cs[0]);assert.equal(join('빈자리','관악산-1').room.key,'hiking:관악산');
 assert.equal(rooms.stats.full,3);
});
test('흡연장 서버(옥상-1 → smoking:옥상)도 같은 규칙, 체험마다 따로 센다',()=>{
 const {rooms,join}=setup({maxPerRoom:2});
 join('a','옥상-1',{experience:'smoking'});join('b','옥상-1',{experience:'smoking'});
 assert.equal(join('c','옥상-1',{experience:'smoking'}).reason,'full');
 assert.equal(join('등산','옥상-1').room.key,'hiking:옥상','등산의 옥상 방은 서버 목록 밖 → 따로');
 assert.deepEqual(rooms.serverCounts(),{hiking:[{id:'1',name:'관악산 1서버',count:0,max:2}],smoking:[{id:'1',name:'옥상 1서버',count:2,max:2}]});
});
test('서버 방에서 신고로 숨겨지면 다른 방으로 옮기지 않고 이름만 숨긴다(넘길 서버가 없음)',()=>{
 const {rooms,join}=setup();
 const target=join('말썽','관악산-1'),rs=[1,2,3].map(i=>join(`신고${i}`,'관악산-1'));
 for(const r of rs)rooms.message(r,{t:'report',to:target.id,reason:'기타'});
 assert.ok(target.hidden());assert.equal(target.room.key,'hiking:관악산');assert.ok(!target.inbox.some(m=>m.t==='moved'));
 assert.ok(rs[0].inbox.some(m=>m.t==='j'&&m.id===target.id&&m.h===1));
});
test('서버 목록을 바꿔 끼우면(2서버) 줄 하나로 방이 늘어난다',()=>{
 const servers={hiking:[{id:'1',name:'관악산 1서버',room:'관악산-1'},{id:'2',name:'관악산 2서버',room:'관악산-2'}],smoking:[]};
 const {rooms,join}=setup({maxPerRoom:1,servers});
 assert.equal(join('a','관악산-1').room.key,'hiking:관악산');
 const b=join('b','관악산-2');assert.equal(b.room.key,'hiking:관악산-2');assert.equal(b.inbox[0].server,'2');
 assert.equal(join('c','관악산-2').reason,'full');
 assert.deepEqual(rooms.serverCounts().hiking.map(s=>s.count),[1,1]);
});
