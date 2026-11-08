// 같이 등산하기(동행) 서버 규칙·클라이언트 상태기계 시험(2026-11-08). 소켓 없이 가짜 시계로 server/rooms.mjs를 돌린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRooms} from '../server/rooms.mjs';
import {PAIR,createPairClient,messageAllowed,PAIR_SEND,PAIR_TEXT} from '../src/multi-protocol.js';

function setup(opts={}){
 let t=1_000_000,n=0;
 const rooms=createRooms({now:()=>t,idGen:()=>`p${++n}`,tokenGen:()=>`tok${n}`,...opts});
 const join=(name,extra={})=>{const inbox=[];const r=rooms.join({room:'관악산-1',name,send:s=>inbox.push(JSON.parse(s)),...extra});r.client.inbox=inbox;return r.client;};
 const pairIn=c=>c.inbox.filter(m=>m.t.startsWith('pair:'));
 const last=c=>pairIn(c).at(-1);
 const msg=(c,m)=>rooms.message(c,m,t);
 return {rooms,join,pairIn,last,msg,advance:ms=>{t+=ms;rooms.tick();},get now(){return t;}};
}

test('등산만 동행 메시지를 받는다(흡연장은 버림)',()=>{
 for(const k of PAIR_SEND){assert.ok(messageAllowed('hiking',k),k);assert.ok(!messageAllowed('smoking',k),k);}
 const {rooms}=setup();const inbox=[];const s=rooms.join({experience:'smoking',room:'옥상-1',name:'손님',send:x=>inbox.push(JSON.parse(x))}).client;
 const s2=rooms.join({experience:'smoking',room:'옥상-1',name:'손님2',send:()=>{}}).client;
 rooms.message(s,{t:'pair:offer',to:s2.id});
 assert.equal(rooms.stats.wrongExperience,1);assert.equal(rooms.stats.pairOffers,0);
});

test('제안 → 수락: 둘 다 pair:on, 쌍 상태는 한 쌍',()=>{
 const {rooms,join,last,msg}=setup();const a=join('산타는곰'),b=join('바위다람쥐');
 msg(a,{t:'pair:offer',to:b.id});
 assert.deepEqual(last(b),{t:'pair:offer',id:a.id,ms:PAIR.offerMs});
 assert.deepEqual(last(a),{t:'pair:sent',id:b.id,ms:PAIR.offerMs});
 msg(b,{t:'pair:accept',to:a.id});
 assert.deepEqual(last(a),{t:'pair:on',id:b.id});assert.deepEqual(last(b),{t:'pair:on',id:a.id});
 assert.equal(rooms.pairOf(a.id),b.id);assert.equal(rooms.info().pairs,1);
 // 끝내기: 둘 다 pair:off
 msg(a,{t:'pair:end'});
 assert.deepEqual(last(a),{t:'pair:off',id:b.id,reason:'end'});assert.deepEqual(last(b),{t:'pair:off',id:a.id,reason:'end'});
 assert.equal(rooms.pairOf(a.id),null);
});

test('한 번에 한 쌍: 동행 중·제안 받는 중인 사람에게는 busy, 내가 제안 중이면 pending',()=>{
 const {join,last,msg,advance}=setup();const a=join('A'),b=join('B'),c=join('C'),d=join('D');
 msg(a,{t:'pair:offer',to:b.id});
 msg(c,{t:'pair:offer',to:b.id});assert.equal(last(c).reason,'busy','제안 받는 중');
 msg(b,{t:'pair:offer',to:d.id});assert.equal(last(b).reason,'pending','받은 제안에 먼저 답');
 msg(b,{t:'pair:accept',to:a.id});
 advance(PAIR.offerGapMs);
 msg(c,{t:'pair:offer',to:a.id});assert.equal(last(c).reason,'busy','동행 중');
 msg(a,{t:'pair:offer',to:d.id});assert.equal(last(a).reason,'self-busy');
 assert.equal(PAIR_TEXT.no.busy,'지금은 다른 분과 함께예요');
});

test('거절 → 제안한 사람에게 declined, 60초 동안 같은 사람에게 재제안 금지(다른 사람은 됨), 10초에 1번',()=>{
 const {join,last,msg,advance}=setup();const a=join('A'),b=join('B'),c=join('C');
 msg(a,{t:'pair:offer',to:b.id});msg(b,{t:'pair:decline',to:a.id});
 assert.deepEqual(last(a),{t:'pair:declined',id:b.id,reason:'decline'});
 msg(a,{t:'pair:offer',to:c.id});assert.equal(last(a).reason,'gap','10초 안 두 번째 제안');
 advance(PAIR.offerGapMs);
 msg(a,{t:'pair:offer',to:b.id});assert.equal(last(a).reason,'blocked');assert.ok(last(a).wait>0&&last(a).wait<=50);
 msg(a,{t:'pair:offer',to:c.id});assert.equal(last(a).t,'pair:sent','다른 사람은 됨');
 msg(a,{t:'pair:cancel',to:c.id});assert.deepEqual(last(c),{t:'pair:canceled',id:a.id,reason:'cancel'});
 advance(PAIR.declineBlockMs-PAIR.offerGapMs);
 msg(a,{t:'pair:offer',to:b.id});assert.equal(last(a).t,'pair:sent','60초 뒤에는 다시 됨');
});

test('30초 동안 답이 없으면 저절로 거절(제안한 사람 declined timeout, 받은 사람 canceled timeout), 재제안 금지도 걸림',()=>{
 const {join,last,msg,advance}=setup();const a=join('A'),b=join('B');
 msg(a,{t:'pair:offer',to:b.id});
 advance(PAIR.offerMs-100);assert.equal(last(a).t,'pair:sent','아직');
 advance(200);
 assert.deepEqual(last(a),{t:'pair:declined',id:b.id,reason:'timeout'});assert.deepEqual(last(b),{t:'pair:canceled',id:a.id,reason:'timeout'});
 msg(b,{t:'pair:accept',to:a.id});assert.equal(last(b).reason,'expired','만료 뒤 수락은 안 됨');
 msg(a,{t:'pair:offer',to:b.id});assert.equal(last(a).reason,'blocked');
});

test('숨김(신고 3명) 상태인 사람은 제안 불가, 숨겨지면 동행도 끝',()=>{
 const {rooms,join,last,msg,advance}=setup();const a=join('A'),b=join('B'),r1=join('r1'),r2=join('r2'),r3=join('r3');
 msg(a,{t:'pair:offer',to:b.id});msg(b,{t:'pair:accept',to:a.id});
 for(const r of [r1,r2,r3])msg(r,{t:'report',to:a.id,reason:'방해·괴롭힘'});
 assert.ok(a.hidden());assert.equal(rooms.pairOf(b.id),null);assert.equal(last(b).t,'pair:off');assert.equal(last(b).reason,'hidden');
 advance(PAIR.offerGapMs);
 msg(a,{t:'pair:offer',to:r1.id});assert.equal(last(a).reason,'hidden');
});

test('끊기면 60초 유예: 상대에게 pair:wait, resume으로 같은 ID가 돌아오면 둘 다 pair:on',()=>{
 const {rooms,join,last,msg,advance}=setup();const a=join('A'),b=join('B');
 msg(a,{t:'pair:offer',to:b.id});msg(b,{t:'pair:accept',to:a.id});
 rooms.leave(a);  // 소켓 끊김(keep)
 assert.deepEqual(last(b),{t:'pair:wait',id:a.id});assert.equal(rooms.pairOf(b.id),a.id,'아직 쌍');
 advance(30000);
 const a2=join('A',{resume:a.token});
 assert.equal(a2.id,a.id);assert.deepEqual(last(a2),{t:'pair:on',id:b.id});assert.deepEqual(last(b),{t:'pair:on',id:a.id});
 // 다시 끊기고 60초가 지나면 해제
 rooms.leave(a2);advance(PAIR.graceMs);
 assert.deepEqual(last(b),{t:'pair:off',id:a.id,reason:'gone'});assert.equal(rooms.pairOf(b.id),null);
});

test('나가기(b)는 바로 끝, 끊길 때 제안 중이던 것은 지움',()=>{
 const {rooms,join,last,msg,advance}=setup();const a=join('A'),b=join('B'),c=join('C');
 msg(a,{t:'pair:offer',to:b.id});msg(b,{t:'pair:accept',to:a.id});
 msg(a,{t:'b'});assert.deepEqual(last(b),{t:'pair:off',id:a.id,reason:'left'});
 advance(PAIR.offerGapMs);
 msg(c,{t:'pair:offer',to:b.id});rooms.leave(c);
 assert.deepEqual(last(b),{t:'pair:canceled',id:c.id,reason:'left'});assert.equal(rooms.info().offers,0);
});

test('같은 방 밖·없는 사람·나 자신에게는 제안 못 함',()=>{
 const {rooms,join,last,msg}=setup();const a=join('A');
 const other=rooms.join({room:'다른방',name:'X',send:()=>{}}).client;
 msg(a,{t:'pair:offer',to:other.id});assert.equal(last(a).reason,'gone');
 msg(a,{t:'pair:offer',to:a.id});assert.equal(last(a).reason,'gone');
 msg(a,{t:'pair:offer',to:'없음'});assert.equal(last(a).reason,'gone');
});

// ── 클라이언트 상태기계
function clientPair({local=false}={}){
 const sent=[];const p=createPairClient({me:()=>'me',send:m=>sent.push(m),local});return {p,sent};
}
test('클라이언트: 서버 모드 제안·수락·끝내기 흐름과 바로 막기(10초·60초·숨김·연결 끊김)',()=>{
 const {p,sent}=clientPair();
 assert.equal(p.offer('B',0,{hidden:true}).reason,'hidden');
 assert.equal(p.offer('B',0,{online:false}).reason,'offline');
 assert.ok(p.offer('B',0).ok);assert.deepEqual(sent.at(-1),{t:'pair:offer',to:'B'});assert.equal(p.state.phase,'outgoing');
 assert.equal(p.offer('C',100).reason,'pending');
 assert.deepEqual(p.handle({t:'pair:declined',id:'B',reason:'decline'},1000),[{code:'declined',id:'B',reason:'decline'}]);
 assert.equal(p.state.phase,'idle');
 assert.equal(p.offer('C',5000).reason,'gap');
 assert.equal(p.offer('B',20000).reason,'blocked');
 assert.ok(p.offer('C',20000).ok);
 assert.deepEqual(p.handle({t:'pair:on',id:'C'},21000),[{code:'on',id:'C'}]);assert.equal(p.state.partner,'C');
 assert.deepEqual(p.handle({t:'pair:wait',id:'C'},22000),[{code:'wait',id:'C'}]);
 assert.deepEqual(p.handle({t:'pair:on',id:'C'},23000),[{code:'back',id:'C'}]);
 assert.deepEqual(p.end(),[{code:'off',id:'C',reason:'self'}]);assert.deepEqual(sent.at(-1),{t:'pair:end'});
});
test('클라이언트: 받은 제안 수락은 서버 pair:on을 기다리고, 서버 소식이 끊겨도 35초 뒤 풀린다',()=>{
 const {p,sent}=clientPair();
 assert.deepEqual(p.handle({t:'pair:offer',id:'A',ms:30000},0),[{code:'offer',id:'A'}]);
 assert.deepEqual(p.accept(1000),[]);assert.deepEqual(sent.at(-1),{t:'pair:accept',to:'A'});assert.equal(p.state.phase,'incoming');
 assert.deepEqual(p.handle({t:'pair:on',id:'A'},1100),[{code:'on',id:'A'}]);
 const q=clientPair().p;q.handle({t:'pair:offer',id:'A',ms:30000},0);
 assert.deepEqual(q.tick(31000),[]);assert.equal(q.tick(35001)[0].reason,'timeout');
});
test('클라이언트 내 컴퓨터 모드: 바쁘면 pair:no busy를 돌려주고, accept 메시지로 바로 동행, 30초 시간 끝',()=>{
 const {p,sent}=clientPair({local:true});
 p.offer('B',0);assert.deepEqual(sent.at(-1),{t:'pair:offer',id:'me',to:'B'});
 p.handle({t:'pair:offer',id:'C',to:'me'},10);assert.deepEqual(sent.at(-1),{t:'pair:no',id:'me',to:'C',reason:'busy'});
 assert.deepEqual(p.handle({t:'pair:accept',id:'B',to:'me'},20),[{code:'on',id:'B'}]);
 assert.deepEqual(p.handle({t:'pair:offer',id:'X',to:'other'},30),[],'남에게 간 메시지');
 // 상대가 목록에서 사라지면 60초 기다림, 지나면 끝
 assert.equal(p.peerGone('B',1000)[0].code,'wait');assert.equal(p.tick(1000+PAIR.graceMs+1)[0].reason,'gone');
 const q=clientPair({local:true}).p;q.offer('B',0);assert.equal(q.tick(PAIR.offerMs+1)[0].reason,'timeout');
 assert.equal(q.offer('B',PAIR.offerMs+20000).reason,'blocked','시간 끝도 60초 금지');
});
