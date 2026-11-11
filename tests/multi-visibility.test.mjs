// 함께 걷기 '상대가 들어오면 먼저 있던 사람이 안 보임' 회귀 시험(2026-11-08). 재현·결과표는 docs/변경기록-2026-11-08-멀티-안보임.md,
// 두 브라우저 점검은 scripts/verify-multi-visibility.mjs. 여기서는 소켓 없이 방 로직·전송 도우미·흡연장 연결 모듈만 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRooms,defaultRoom,LEGACY_DEFAULT_ROOM} from '../server/rooms.mjs';
import {createPresence,PRESENCE,NET} from '../src/multi-protocol.js';
import {createBackgroundTimer} from '../src/multi-transport.js';
import {createLoungeMulti} from '../src/lounge/multi.js';
import {statusView} from '../src/multi-entry-ui.js';
import {loungeStatusView} from '../src/lounge/multi.js';

function setup(opts={}){
 let t=1_000_000,n=0;
 const rooms=createRooms({now:()=>t,idGen:()=>`p${++n}`,tokenGen:()=>`tok${n}`,...opts});
 const join=(name,room='산',extra={})=>{const inbox=[];const r=rooms.join({room,name,send:s=>inbox.push(JSON.parse(s)),...extra});if(r.ok)r.client.inbox=inbox;return r.ok?r.client:r;};
 return {rooms,join,advance:ms=>{t+=ms;}};
}
const st=(x,y)=>({t:'s',q:1,z:0,x,y,h:0,v:0,f:0});
const snaps=(inbox,id)=>inbox.filter(m=>m.t==='snap').flatMap(m=>m.p).filter(p=>p.id===id);

test('① 먼저 와서 가만히 있는 사람: 새로 온 사람이 이름과 마지막 자리를 바로 받는다',()=>{
 const {rooms,join}=setup();
 const a=join('하늘');rooms.message(a,st(3,4));
 const b=join('바다');
 assert.ok(b.inbox.some(m=>m.t==='j'&&m.id===a.id&&m.n==='하늘'));
 assert.deepEqual(snaps(b.inbox,a.id).map(p=>[p.x,p.y]),[[3,4]]);
});
test('이름 묻기 j에 마지막 자리·담배 상태도 다시 준다(목록에서 빠졌다 이름으로만 다시 들어온 사람 복구)',()=>{
 const {rooms,join}=setup();
 const a=join('하늘','옥상',{experience:'smoking'});rooms.message(a,st(1,2));rooms.message(a,{t:'lounge:smoke',state:'smoking',lit:true});
 const b=join('바다','옥상',{experience:'smoking'});b.inbox.length=0;
 rooms.message(b,{t:'j'});
 assert.ok(b.inbox.some(m=>m.t==='j'&&m.id===a.id));
 assert.equal(snaps(b.inbox,a.id).length,1);
 assert.ok(b.inbox.some(m=>m.t==='lounge:smoke'&&m.id===a.id&&m.lit));
});
test('③ resume: 끊긴 사람이 돌아오면 같은 ID로, 다른 사람에게 끊기 전 마지막 자리·담배 상태를 바로 알린다',()=>{
 const {rooms,join,advance}=setup();
 const a=join('하늘','옥상',{experience:'smoking'}),b=join('바다','옥상',{experience:'smoking'});
 rooms.message(a,st(5,6));rooms.message(a,{t:'lounge:smoke',state:'smoking',lit:true});
 const token=a.inbox[0].resume;rooms.leave(a);advance(3000);b.inbox.length=0;
 const a2=join('하늘','옥상',{experience:'smoking',resume:token});
 assert.equal(a2.id,a.id);
 assert.deepEqual(snaps(b.inbox,a.id).map(p=>[p.x,p.y]),[[5,6]],'숨은 탭이라 새 위치를 안 보내도 보인다');
 assert.ok(b.inbox.some(m=>m.t==='lounge:smoke'&&m.id===a.id));
 // 돌아온 첫 위치는 멀리 있어도 받는다(끊긴 동안 자동 걷기)
 rooms.message(a2,st(200,6));assert.equal(a2.state.x,200);
});
test('③ 옛 연결이 아직 살아 있는데 같은 토큰으로 다시 붙음: 같은 ID로 이어 받고 옛 연결을 닫는다(같은 사람이 둘 보이지 않음)',()=>{
 const {rooms,join}=setup();
 let kicked=0;
 const a=join('하늘','산',{kick:()=>kicked++}),b=join('바다');
 rooms.message(a,st(1,1));
 const token=a.inbox[0].resume;b.inbox.length=0;
 const a2=join('하늘','산',{resume:token});
 assert.equal(a2.id,a.id,'같은 ID');assert.equal(kicked,1,'옛 연결 닫음');
 assert.equal(rooms.clients.size,2);assert.equal([...rooms.rooms.values()][0].members.size,2,'방에 둘만');
 assert.ok(!b.inbox.some(m=>m.t==='b'),'나감을 알리지 않음');
 assert.equal(snaps(b.inbox,a.id).length,1,'마지막 자리는 다시 알림');
 // 옛 소켓이 늦게 닫혀도 새 연결을 지우지 않고, 옛 연결 메시지는 버린다
 rooms.leave(a);assert.equal(rooms.clients.get(a.id),a2);
 rooms.message(a,st(9,9));assert.equal(a2.state.x,1);
 assert.equal(rooms.stats.replaced,1);
});
test('④ 빈 방 이름·옛 기본 방(gwanak-room-1)은 그 체험의 첫 서버 방과 같은 방',()=>{
 assert.equal(defaultRoom('hiking',''),'관악산-1');
 assert.equal(defaultRoom('hiking',LEGACY_DEFAULT_ROOM),'관악산-1');
 assert.equal(defaultRoom('smoking',null),'옥상-1');
 assert.equal(defaultRoom('hiking','시험방'),'시험방');
 const {join}=setup();
 const a=join('하늘',''),b=join('바다','gwanak-room-1'),c=join('구름','관악산-1');
 assert.equal(a.room,b.room);assert.equal(b.room,c.room);assert.equal(a.room.key,'hiking:관악산');
 const s1=join('손님','',{experience:'smoking'}),s2=join('손님2','옥상-1',{experience:'smoking'});
 assert.equal(s1.room,s2.room);
});
test('목록 정리: 내 화면이 멈춰 있던 동안(로딩·숨은 탭)은 시간 초과로 지우지 않는다, 서버 모드는 더 길게',()=>{
 const p=createPresence({timeout:5});
 p.frame(100);assert.equal(p.expired(90,100),false,'첫 프레임: 로딩 중 받은 사람(10초 전)을 지우지 않음');
 for(let t=100.5;t<=104;t+=.5)p.frame(t);assert.equal(p.expired(90,104),false);
 for(let t=104.5;t<=105.5;t+=.5)p.frame(t);assert.equal(p.expired(90,105.5),true,'깨어난 뒤 5초 넘게 소식 없으면 지움');
 p.frame(140);assert.equal(p.expired(106,140),false,'숨은 탭에서 돌아온 첫 프레임은 판단 보류');
 assert.ok(PRESENCE.serverTimeout>=NET.timeout*3,'서버 모드는 이름 목록(3초)을 여러 번 놓쳐야 지움');
 assert.ok(PRESENCE.heartbeatMs<=1000&&PRESENCE.heartbeatMs*2<NET.timeout*1000,'숨은 탭 알림 간격 < 시간 초과');
});
test('숨은 탭 알림 타이머: 그리기 루프가 멈춰도 일정 간격으로 부르고 멈출 수 있다',()=>{
 const calls=[];let fn=null,stopped=false;
 const t=createBackgroundTimer(()=>calls.push(1),1000,{Worker:null,setInterval:(f,ms)=>{fn=f;assert.equal(ms,1000);return {unref(){}};},clearInterval:()=>{stopped=true;}});
 fn();fn();assert.equal(calls.length,2);t.stop();assert.ok(stopped);
});
// 흡연장 연결 모듈: 가짜 전송·가짜 시계
function lounge({server=false}={}){
 let t=0;const sent=[],handlers=new Set(),statusH=new Set(),beats=[];
 const tr={kind:server?'server':'broadcast',status:'online',send:m=>sent.push(m),onmessage:f=>{handlers.add(f);return()=>handlers.delete(f);},onstatus:f=>{statusH.add(f);return()=>statusH.delete(f);},close(){}};
 const player={id:'me',x:1,z:2,heading:0,speed:0};
 const m=createLoungeMulti({ctx:{player,profile:{nickname:'하늘'},world:{add(){},remove(){}},createAvatar:async()=>({root:{},extra:[],place(){},update(){}}),createSmoker:()=>({state:'idle',apply(){}}),mobile:false},
  search:'',win:null,makeTransport:()=>tr,now:()=>t,heartbeat:fn=>{beats.push(fn);return {stop(){}};}});
 m.join({room:'옥상-1',name:'하늘'});
 return {m,sent,recv:x=>handlers.forEach(h=>h(x)),advance:s=>{t+=s;},beat:()=>beats.forEach(f=>f()),get t(){return t;}};
}
test('흡연장 ⑤: 처음 보는 사람이 오면 내 이름·자리를 바로 알린다(숨은 탭이라도 메시지 처리는 돈다)',()=>{
 const L=lounge();L.sent.length=0;L.advance(5);
 L.recv({t:'j',id:'b1',n:'바다'});
 assert.ok(L.sent.some(m=>m.t==='j'&&m.n==='하늘'));
 assert.ok(L.sent.some(m=>m.t==='s'&&m.x===1&&m.y===2),'새로 온 사람이 내 자리를 바로 받음');
});
test('흡연장 ②: 그리기 루프가 멈춰도 알림 타이머가 1초마다 자리를 다시 보낸다',()=>{
 const L=lounge();L.m.update(.016);L.sent.length=0;
 L.advance(.5);L.beat();assert.equal(L.sent.filter(m=>m.t==='s').length,0,'방금 보냈으면 안 보냄');
 L.advance(1.2);L.beat();assert.equal(L.sent.filter(m=>m.t==='s').length,1);
 L.advance(3.1);L.beat();assert.ok(L.sent.some(m=>m.t==='j'),'이름도 3초마다');
});
test('흡연장: 로딩·숨김으로 내 루프가 멈춰 있던 동안 받은 사람을 첫 프레임에 지우지 않는다',()=>{
 const L=lounge({server:true});L.advance(1);
 L.recv({t:'j',id:'a1',n:'바다'});L.recv({t:'s',id:'a1',q:1,z:0,x:3,y:3,h:0,v:0,f:0});
 L.advance(30);L.m.update(.016);
 assert.equal(L.m.people().length,1,'30초 멈춰 있다 깨어나도 남음');
});
test('화면 표시: 서버 주소 없음·서버 목록 밖 방은 분명히 알린다',()=>{
 const local=statusView({state:'online',transport:'local',count:1,room:'관악산-1'});
 assert.match(local.text+local.sub,/이 (브라우저 )?창끼리/);assert.match(local.sub,/서버 없음/);
 const odd=statusView({state:'online',transport:'server',count:1,room:'시험방'});
 assert.equal(odd.tone,'warn');assert.match(odd.text,/다른 방/);assert.match(odd.sub,/시험방/);
 assert.equal(statusView({state:'online',transport:'server',count:2,room:'관악산'}).tone,'ok');
 const ll=loungeStatusView({state:'online',transport:'local',count:1});assert.match(ll.sub,/서버 없음/);
 const lo=loungeStatusView({state:'online',transport:'server',count:1,room:'시험방'});assert.equal(lo.tone,'warn');assert.match(lo.text,/다른 방/);
});
