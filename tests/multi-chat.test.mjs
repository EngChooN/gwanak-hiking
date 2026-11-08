// 함께 걷기 채팅·흡연장 열기 단위 시험(2026-11-08): 공통 채팅 c(정리·금칙어·속도 제한·중계·체험 간 격리·신고 3줄),
// 흡연장 위치 s·담배 상태 lounge:smoke, 체험별 익명 이름, BroadcastChannel 모드 채팅, 전송 계층이 흡연장 메시지를 그대로 주고받는지.
// 실제 서버를 띄우는 시험은 tests/multi-server.test.mjs 아래쪽.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRooms,parseWordList} from '../server/rooms.mjs';
import {CHAT,SMOKE_STATES,ANON_PREFIX,sanitizeChat,createChatLimiter,sanitizeSmoke,anonymousName,messageAllowed} from '../src/multi-protocol.js';
import {createBroadcastTransport,broadcastChannelName,createWebSocketTransport} from '../src/multi-transport.js';

function setup(opts={}){
 let t=1_000_000,n=0;const appended=[];
 const rooms=createRooms({now:()=>t,idGen:()=>`p${++n}`,tokenGen:()=>`tok${n}`,reports:{append:r=>appended.push(r)},...opts});
 const join=(name,room='산',extra={})=>{const inbox=[];const r=rooms.join({room,name,send:s=>inbox.push(JSON.parse(s)),...extra});if(r.ok)r.client.inbox=inbox;return r.ok?r.client:r;};
 return {rooms,join,appended,advance:ms=>{t+=ms;},get now(){return t;}};
}
const chats=c=>c.inbox.filter(m=>m.t==='c');

test('채팅 정리: 80자, 제어·방향 문자 제거, 공백 정리, 금칙어는 대소문자 없이 ***',()=>{
 assert.equal(CHAT.max,80);
 assert.equal([...sanitizeChat('가'.repeat(100))].length,80);
 assert.equal(sanitizeChat('  안‮녕\u0007  하\n\n세요  '),'안녕 하세요');
 assert.equal(sanitizeChat('이 BadWord 진짜 badword',['badword']),'이 *** 진짜 ***');
 assert.equal(sanitizeChat('바보야 바보',['바보']),'***야 ***');
 assert.equal(sanitizeChat('a.b*c',['.b*']),'a***c','금칙어의 특수 문자는 글자 그대로');
 assert.equal(sanitizeChat('   ​ '),'');
 assert.equal(sanitizeChat(null),'');
});
test('채팅 속도 제한: 2초에 1번, 10초에 4번',()=>{
 const l=createChatLimiter();
 assert.equal(l.allow(0),true);assert.equal(l.allow(1999),false,'2초 안');
 assert.equal(l.allow(2000),true);assert.equal(l.allow(4000),true);assert.equal(l.allow(6000),true);
 assert.equal(l.allow(8000),false,'10초에 다섯 번째');
 assert.equal(l.allow(10000),true,'첫 글이 10초 밖으로 나가면 다시');
});
test('금칙어 목록 파일 읽기: 줄마다, # 주석·빈 줄 건너뜀, 쉼표도 됨',()=>{
 assert.deepEqual(parseWordList('# 기본 목록\n바보\n\n 멍청이 \n욕1, 욕2\n#끝'),['바보','멍청이','욕1','욕2']);
 assert.deepEqual(parseWordList(''),[]);
});
test('서버 채팅: 보낸 사람 포함 같은 방에 {t,id,text}, 이름은 싣지 않음, 정리·금칙어 적용',()=>{
 const {rooms,join}=setup({chatBanned:['나쁜말']});
 const a=join('하늘'),b=join('바다'),c=join('먼방','다른산');
 rooms.message(a,{t:'c',text:'  안녕‮ 나쁜말 하세요 ',id:'가짜ID',name:'사칭'});
 assert.deepEqual(chats(a),[{t:'c',id:a.id,text:'안녕 *** 하세요'}],'보낸 사람에게도 되돌려 줌(전달 확인)');
 assert.deepEqual(chats(b),[{t:'c',id:a.id,text:'안녕 *** 하세요'}],'id는 서버가 정한 것');
 assert.equal(chats(c).length,0,'다른 방에는 안 감');
 rooms.message(b,{t:'c',text:'  '});rooms.message(b,{t:'c',text:42});
 assert.equal(chats(a).length,1,'빈 글·글자 아닌 값은 버림');
 assert.equal(rooms.stats.chats,1);
});
test('서버 채팅 속도 제한: 2초 1번·10초 4번, 넘으면 보낸 사람에게만 c-limit',()=>{
 const {rooms,join,advance}=setup();const a=join('a'),b=join('b');
 rooms.message(a,{t:'c',text:'1'});rooms.message(a,{t:'c',text:'2'});
 assert.deepEqual(a.inbox.filter(m=>m.t==='c-limit'),[{t:'c-limit'}]);assert.equal(b.inbox.some(m=>m.t==='c-limit'),false);
 for(let i=0;i<3;i++){advance(2000);rooms.message(a,{t:'c',text:`n${i}`});}
 advance(2000);rooms.message(a,{t:'c',text:'다섯째'});
 assert.deepEqual(chats(b).map(m=>m.text),['1','n0','n1','n2']);assert.equal(rooms.stats.chatLimited,2);
 rooms.message(b,{t:'c',text:'다른 사람은 따로 셈'});assert.equal(chats(a).at(-1).text,'다른 사람은 따로 셈');
});
test('채팅 체험 간 격리: 같은 방 이름이라도 등산 채팅은 흡연장에, 흡연장 채팅은 등산에 안 감',()=>{
 const {rooms,join}=setup();
 const h1=join('등산1','시험'),h2=join('등산2','시험'),k1=join('흡연1','시험',{experience:'smoking'}),k2=join('흡연2','시험',{experience:'smoking'});
 rooms.message(h1,{t:'c',text:'등산 채팅'});rooms.message(k1,{t:'c',text:'흡연 채팅'});
 assert.deepEqual(chats(h2).map(m=>m.text),['등산 채팅']);
 assert.deepEqual(chats(k2).map(m=>m.text),['흡연 채팅']);
});
test('채팅은 저장하지 않는다: 사람마다 최근 3줄만 메모리, 신고 기록에만 대상의 최근 3줄',()=>{
 const {rooms,join,advance,appended}=setup();const a=join('a'),b=join('b');
 for(const x of ['하나','둘','셋','넷']){rooms.message(b,{t:'c',text:x});advance(3000);}
 assert.deepEqual(b.recentChat,['둘','셋','넷']);
 assert.equal(appended.length,0,'채팅만으로는 아무것도 내보내지 않음');
 rooms.message(a,{t:'report',to:b.id,reason:'방해·괴롭힘'});
 assert.equal(appended.length,1);assert.deepEqual(appended[0].chat,['둘','셋','넷']);assert.equal(appended[0].room,'hiking:산');
 assert.ok(!JSON.stringify(appended[0]).includes('하나'));
});
test('흡연장 위치 s: 등산과 같은 검사(모양·속도 제한·순간이동)로 받고 같은 방 스냅샷에 실림',()=>{
 const {rooms,join,advance}=setup();
 const a=join('a','옥상-1',{experience:'smoking'}),b=join('b','옥상-1',{experience:'smoking'});
 rooms.message(a,{t:'s',q:1,z:0,x:1,y:2,h:.3,v:.5,f:0});rooms.tick();
 assert.deepEqual(b.inbox.filter(m=>m.t==='snap').flatMap(m=>m.p),[{t:'s',id:a.id,q:1,z:0,x:1,y:2,h:.3,v:.5,f:0}]);
 advance(100);rooms.message(a,{t:'s',q:2,z:0,x:60,y:2,h:0,v:0,f:0});assert.equal(rooms.stats.teleportRejected,1,'표시 없는 순간이동 거부');
 rooms.message(a,{t:'s',q:3,z:9,x:1,y:2,h:0});rooms.message(a,{t:'s',q:4,z:0,x:'1',y:2,h:0});assert.equal(rooms.stats.invalid,2);
});
test('흡연장 담배 상태: {state,lit} 허용 목록 검사 뒤 다른 사람에게 중계, 새로 온 사람은 마지막 상태를 받음',()=>{
 const {rooms,join}=setup();
 const a=join('a','옥상',{experience:'smoking'}),b=join('b','옥상',{experience:'smoking'});
 rooms.message(a,{t:'lounge:smoke',state:'smoking',lit:true,puffs:3,x:'추가 칸은 버림'});
 assert.deepEqual(b.inbox.filter(m=>m.t==='lounge:smoke'),[{t:'lounge:smoke',id:a.id,state:'smoking',lit:true}]);
 assert.equal(a.inbox.some(m=>m.t==='lounge:smoke'),false,'보낸 사람에게는 안 돌려줌');
 for(const bad of [{state:'burning',lit:true},{state:'smoking',lit:1},{state:'smoking'},{state:['smoking'],lit:true}])rooms.message(a,{t:'lounge:smoke',...bad});
 assert.equal(b.inbox.filter(m=>m.t==='lounge:smoke').length,1);assert.equal(rooms.stats.invalid,4);
 const c=join('c','옥상',{experience:'smoking'});
 assert.deepEqual(c.inbox.find(m=>m.t==='lounge:smoke'),{t:'lounge:smoke',id:a.id,state:'smoking',lit:true});
 // 등산에서는 담배 상태를 받지 않는다
 const h=join('h','옥상'),h2=join('h2','옥상');rooms.message(h,{t:'lounge:smoke',state:'smoking',lit:true});
 assert.equal(h2.inbox.some(m=>m.t==='lounge:smoke'),false);assert.equal(messageAllowed('hiking','lounge:smoke'),false);
});
test('담배 상태 허용 목록 = src/lounge/smoke.js가 내는 상태 이름(go()·trick·idle)',()=>{
 const src=readFileSync(new URL('../src/lounge/smoke.js',import.meta.url),'utf8');
 const fromSrc=new Set([...src.matchAll(/go\('([a-z]+)'\)/g)].map(m=>m[1]));
 for(const m of src.matchAll(/state:'([a-z]+)'/g))fromSrc.add(m[1]);
 fromSrc.add('idle'); // 처음 상태(S.state='idle')
 assert.deepEqual([...fromSrc].sort(),[...SMOKE_STATES].sort());
 assert.equal(sanitizeSmoke({state:'done',lit:false}).state,'done');assert.equal(sanitizeSmoke(null),null);
});
test('체험별 익명 이름: 등산 등산객XXXX, 흡연장 손님XXXX(이름을 비우거나 신고로 숨겨졌을 때)',()=>{
 assert.deepEqual(ANON_PREFIX,{hiking:'등산객',smoking:'손님'});
 assert.equal(anonymousName('ab12cd34'),'등산객CD34');assert.equal(anonymousName('ab12cd34','smoking'),'손님CD34');assert.equal(anonymousName('x9','golf'),'등산객X9');
 const {join}=setup();
 assert.equal(join('','옥상',{experience:'smoking'}).name,'손님P1');assert.equal(join('','산').name,'등산객P2');
});

// ── 내 컴퓨터 모드(BroadcastChannel): 서버 없이 같은 규칙
function fakeChannels(){
 const bus=new Map();
 class BC{constructor(name){this.name=name;this.closed=false;(bus.get(name)??bus.set(name,new Set()).get(name)).add(this);}
  postMessage(m){for(const o of bus.get(this.name))if(o!==this&&!o.closed)o.onmessage?.({data:structuredClone(m)});}close(){this.closed=true;bus.get(this.name).delete(this);}}
 return {BC,bus};
}
test('BroadcastChannel 채널 이름: gwanak-multi:체험:방, 등산은 옛 채널 그대로, 방 이름의 :는 뺌',()=>{
 assert.equal(broadcastChannelName('hiking','관악산-1'),'gwanak-multi:관악산-1');
 assert.equal(broadcastChannelName('smoking','옥상-1'),'gwanak-multi:smoking:옥상-1');
 assert.equal(broadcastChannelName('hiking','smoking:옥상-1'),'gwanak-multi:smoking옥상-1','등산 방 이름으로 흡연장 채널에 들어가지 못함');
 const {BC,bus}=fakeChannels();
 const h=createBroadcastTransport('시험',BC),k=createBroadcastTransport('시험',BC,{experience:'smoking'});
 assert.deepEqual([...bus.keys()],['gwanak-multi:시험','gwanak-multi:smoking:시험']);
 const got=[];k.onmessage(m=>got.push(m));h.send({t:'s',id:'a',x:1});assert.equal(got.length,0,'등산·흡연장 채널은 섞이지 않음');
});
test('BroadcastChannel 채팅: 정리 뒤 상대와 나에게, 2초 1번(넘으면 내게 c-limit), 받은 글도 다시 정리',()=>{
 const {BC}=fakeChannels();let t=0;
 const a=createBroadcastTransport('방',BC,{now:()=>t}),b=createBroadcastTransport('방',BC,{now:()=>t});
 const ga=[],gb=[];a.onmessage(m=>ga.push(m));b.onmessage(m=>gb.push(m));
 a.send({t:'c',id:'aa',text:' 안‮녕 '});
 assert.deepEqual(ga,[{t:'c',id:'aa',text:'안녕'}]);assert.deepEqual(gb,[{t:'c',id:'aa',text:'안녕'}]);
 t=500;a.send({t:'c',id:'aa',text:'또'});assert.deepEqual(ga.at(-1),{t:'c-limit'});assert.equal(gb.length,1);
 // 옛 클라이언트·조작된 탭이 정리 안 된 글을 보내도 받는 쪽이 정리한다
 const raw=new BC('gwanak-multi:방');raw.postMessage({t:'c',id:'zz',text:'x'.repeat(200)});raw.postMessage({t:'c',id:'zz',text:'   '});raw.postMessage({t:'c',text:'id 없음'});
 assert.equal([...gb.at(-1).text].length,80);assert.equal(gb.filter(m=>m.t==='c').length,2);
 // 위치 같은 다른 메시지는 그대로
 a.send({t:'s',id:'aa',x:1});assert.deepEqual(gb.at(-1),{t:'s',id:'aa',x:1});
});

// ── 흡연장이 쓸 전송 계층(가짜 WebSocket)
test('createWebSocketTransport({experience:"smoking"}): hello에 exp, c·lounge:smoke·s를 보내는 그대로 보내고 받은 그대로 넘김',()=>{
 const made=[];
 class W{constructor(url){this.url=url;this.readyState=0;this.sent=[];made.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.onclose?.({});}}
 const t=createWebSocketTransport('ws://x',{experience:'smoking',room:'옥상-1',name:'미나',WebSocketImpl:W,setTimer:()=>0,clearTimer:()=>{}});
 const got=[];t.onmessage(m=>got.push(m));
 const w=made[0];w.readyState=1;w.onopen();
 assert.deepEqual(w.sent[0],{t:'hello',exp:'smoking',room:'옥상-1',name:'미나',resume:null});
 w.onmessage({data:JSON.stringify({t:'welcome',id:'p1',exp:'smoking',room:'옥상',name:'미나',resume:'R'})});
 for(const m of [{t:'c',text:'안녕'},{t:'lounge:smoke',state:'smoking',lit:true},{t:'s',q:1,z:0,x:1,y:2,h:0,v:0,f:0}])t.send(m);
 assert.deepEqual(w.sent.slice(1).map(m=>m.t),['c','lounge:smoke','s']);
 for(const m of [{t:'c',id:'p2',text:'반가워요'},{t:'c-limit'},{t:'lounge:smoke',id:'p2',state:'exhale',lit:true},{t:'snap',p:[{t:'s',id:'p2',x:3}]}])w.onmessage({data:JSON.stringify(m)});
 assert.deepEqual(got.map(m=>m.t),['welcome','c','c-limit','lounge:smoke','s']);
 assert.equal(t.info.experience,'smoking');
});
