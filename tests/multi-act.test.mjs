// 함께 걷기·같이 피우기 '내 상호작용이 상대에게 안 보임' 회귀 시험(2026-11-10). 재현·결과표는 docs/변경기록-2026-11-10-멀티-상호작용.md,
// 두 브라우저 점검은 scripts/verify-multi-interactions.mjs(흡연장)·scripts/verify-multi-act-hiking.mjs(등산). 등산 클라이언트 쪽은 tests/multi-act-hiking.test.mjs.
// 여기서는 행동 상태 act 규격·서버(기억·중계·중간 입장·j·resume)·흡연장 자세 상태(보내기·받기)를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeAct,messageAllowed,ACT_SCHEMA} from '../src/multi-protocol.js';
import {createRooms} from '../server/rooms.mjs';
import {actOf,applyRemoteAct,newPoseState} from '../src/lounge/spots.js';
import {createLoungeMulti} from '../src/lounge/multi.js';
import {createBroadcastTransport} from '../src/multi-transport.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('act 규격: 체험별 칸·값만 남기고 나머지는 버린다',()=>{
 assert.deepEqual(sanitizeAct('smoking',{p:'lean',can:2,sip:7,b:1,evil:'x'}),{p:'lean',b:1,can:2,sip:7});
 assert.deepEqual(sanitizeAct('smoking',{p:'fly',can:5,sip:-1}),null,'목록 밖 값만 있으면 null');
 assert.deepEqual(sanitizeAct('smoking',{p:'sit',b:1.5}),{p:'sit'},'벤치 번호는 정수만');
 assert.deepEqual(sanitizeAct('hiking',{p:'tea',g:'phone',sf:1,x:'gym-lift',n:3,v:2}),{p:'tea',g:'phone',sf:1,x:'gym-lift',n:3,v:2});
 assert.deepEqual(sanitizeAct('hiking',{x:'<script>'}),null);
 assert.deepEqual(sanitizeAct('hiking',{p:'lean'}),null,'난간은 흡연장만');
 assert.equal(sanitizeAct('golf',{p:'stand'}),null);assert.equal(sanitizeAct('smoking',[1]),null);assert.equal(sanitizeAct('smoking',null),null);
 for(const exp of Object.keys(ACT_SCHEMA))assert.ok(messageAllowed(exp,'act'),exp);
});

function setup(){
 let t=1_000_000,n=0,k=0;
 const rooms=createRooms({now:()=>t,idGen:()=>`p${++n}`,tokenGen:()=>`tok${++k}`});
 const join=(name,extra={})=>{const inbox=[];const r=rooms.join({room:'옥상',name,experience:'smoking',send:s=>inbox.push(JSON.parse(s)),...extra});r.client.inbox=inbox;return r.client;};
 return {rooms,join,advance:ms=>{t+=ms;}};
}
const acts=(inbox,id)=>inbox.filter(m=>m.t==='act'&&m.id===id).map(m=>m.a);

test('서버: act를 다른 사람에게 중계하고(보낸 사람 빼고) 마지막 값을 기억한다',()=>{
 const {rooms,join}=setup();const a=join('하늘'),b=join('바다');a.inbox.length=0;b.inbox.length=0;
 rooms.message(a,{t:'act',a:{p:'lean',can:2,sip:0}});
 assert.deepEqual(acts(b.inbox,a.id),[{p:'lean',can:2,sip:0}]);assert.equal(acts(a.inbox,a.id).length,0);
 rooms.message(a,{t:'act',a:{p:'nope'}});assert.equal(acts(b.inbox,a.id).length,1,'잘못된 act는 버림');
 assert.deepEqual(a.act,{p:'lean',can:2,sip:0});
});
test('서버: 중간에 들어온 사람·이름 묻기(j)·다시 접속(resume) 뒤에도 지금 act를 받는다',()=>{
 const {rooms,join,advance}=setup();const a=join('하늘');rooms.message(a,{t:'act',a:{p:'sit',b:0,can:2,sip:3}});
 const c=join('나중');assert.deepEqual(acts(c.inbox,a.id),[{p:'sit',b:0,can:2,sip:3}],'입장 때');
 c.inbox.length=0;rooms.message(c,{t:'j'});assert.equal(acts(c.inbox,a.id).length,1,'j 답에도');
 const token=a.inbox.find(m=>m.t==='welcome').resume;rooms.leave(a);advance(2000);c.inbox.length=0;
 const a2=join('하늘',{resume:token});assert.equal(a2.id,a.id);
 assert.deepEqual(acts(c.inbox,a.id),[{p:'sit',b:0,can:2,sip:3}],'다시 붙으면 다른 사람에게 바로');
 const d=join('또나중');assert.equal(acts(d.inbox,a.id).length,1,'다시 붙은 뒤 새로 온 사람도');
 // 옛 연결이 살아 있는데 같은 토큰으로(같은 ID 이어 받기, 11-08)도 act 유지
 const a3=join('하늘',{resume:a2.inbox.find(m=>m.t==='welcome').resume,kick(){}});assert.equal(a3.id,a.id);assert.deepEqual(a3.act,{p:'sit',b:0,can:2,sip:3});
});
test('등산 체험도 act를 받는다(흡연장 칸은 버림)',()=>{
 let t=0,n=0;const rooms=createRooms({now:()=>t,idGen:()=>`h${++n}`,tokenGen:()=>`k${n}`});
 const j=name=>{const inbox=[];const c=rooms.join({room:'산',name,send:s=>inbox.push(JSON.parse(s))}).client;c.inbox=inbox;return c;};
 const a=j('하늘'),b=j('바다');rooms.message(a,{t:'act',a:{p:'tea',g:'binoculars',can:2}});
 assert.deepEqual(acts(b.inbox,a.id),[{p:'tea',g:'binoculars'}]);
});

const rooftop={spots:{benches:[{x:0,z:0,heading:0,seat:{x:0,z:-.2,y:.44,heading:0}},{x:3,z:0,heading:0,seat:{x:3,z:-.2,y:.44,heading:0}}]}};
test('흡연장 자세 상태: 보낼 act와 받은 act 적용(자세·벤치·캔·한 모금)',()=>{
 const me=newPoseState();assert.deepEqual(actOf(me),{p:'stand',can:0,sip:0});
 me.pose='sit';me.spot={index:1};me.can.held=true;me.can.sipN=4;assert.deepEqual(actOf(me),{p:'sit',can:2,sip:4,b:1});
 me.can.drop={t:0};assert.equal(actOf(me).can,1,'뽑는 중');
 const R=newPoseState();
 applyRemoteAct(R,{p:'lean',can:0,sip:0},rooftop);assert.equal(R.pose,'lean');assert.equal(R.last,'lean');
 applyRemoteAct(R,{p:'sit',b:1,can:1,sip:0},rooftop);assert.equal(R.spot.index,1);assert.equal(R.spot.seat.y,.44);assert.ok(R.can.drop,'뽑는 장면부터');
 applyRemoteAct(R,{p:'sit',b:1,can:2,sip:0},rooftop);assert.ok(R.can.drop,'떨어지는 중이면 끝까지');
 R.can.drop=null;R.can.held=true;
 applyRemoteAct(R,{p:'sit',b:1,can:2,sip:1},rooftop);assert.equal(R.can.sip,0,'한 모금 횟수가 늘면 마신다');
 R.can.sip=-1;applyRemoteAct(R,{p:'stand',can:0,sip:1},rooftop);assert.equal(R.pose,'stand');assert.equal(R.last,'sit','빠질 때 섞을 자세');assert.equal(R.can.held,false);
 // 중간 입장: 처음 받은 값이 들고 있음이면 바로 손에, 처음 받은 한 모금 횟수는 기준만
 const L=newPoseState();applyRemoteAct(L,{p:'stand',can:2,sip:9},rooftop);assert.equal(L.can.held,true);assert.equal(L.can.drop,null);assert.equal(L.can.sip,-1);
});

// 같은 프로세스 BroadcastChannel 두 개(내 컴퓨터 모드)로 흡연장 연결 모듈이 act를 주고받는지
function world(nick){
 const win=new EventTarget(),clock={t:0},created=[];
 const smoker=()=>({state:'idle',status:()=>({state:'idle',lit:false}),apply(){},remove(){}});
 const ctx={player:{id:'me',x:0,z:0,heading:0,speed:0},profile:{nickname:nick},mobile:false,smoker:{status:()=>({state:'idle',lit:false})},world:{add(){},remove(){}},rooftop,
  createAvatar:async o=>{const a={...o,x:0,z:0,heading:0,root:{visible:true},extra:[],place(x,z,h){a.x=x;a.z=z;a.heading=h;},update(){},headTop(){}};created.push(a);return a;},
  createSmoker:()=>smoker()};
 const S=newPoseState(),spots={get pose(){return S.pose;},act:()=>actOf(S)};
 return {win,clock,ctx,created,S,spots};
}
const mount=w=>createLoungeMulti({ctx:w.ctx,spots:w.spots,win:w.win,search:'',now:()=>w.clock.t,heartbeat:()=>({stop(){}}),
 makeTransport:o=>createBroadcastTransport(o.room,undefined,{experience:'smoking'})});
async function tick(ws,steps=1){for(let i=0;i<steps;i++){for(const w of ws){w.clock.t+=.12;w.multi.update(.12);}await sleep(15);}}

test('흡연장 연결: 내 자세·캔이 바뀔 때만 act를 보내고, 상대 몸 자세 상태가 따라오며, 나중에 온 사람도 받는다',async t=>{
 const A=world('하늘'),B=world('바다');A.multi=mount(A);B.multi=mount(B);t.after(()=>{A.multi.dispose();B.multi.dispose();C?.multi.dispose();});let C=null;
 A.multi.join({room:'act시험'});B.multi.join({room:'act시험'});await tick([A,B],6);
 const sent0=A.multi.status().stats.actsSent;
 await tick([A,B],4);assert.equal(A.multi.status().stats.actsSent,sent0,'안 바뀌면 다시 안 보냄');
 A.S.pose='lean';A.S.last='lean';await tick([A,B],4);
 const seen=()=>B.multi.status().people.find(p=>p.id===A.multi.id);
 assert.equal(seen().pose,'lean');assert.equal(A.multi.status().stats.actsSent,sent0+1);
 A.S.pose='sit';A.S.spot={index:1};A.S.can.held=true;await tick([A,B],4);
 assert.equal(seen().pose,'sit');assert.equal(seen().can,'held');assert.deepEqual(seen().act,{p:'sit',b:1,can:2,sip:0});
 // 나중에 온 C: 내 컴퓨터 모드는 처음 보는 사람에게 바로 인사하며 act도 다시 보낸다
 C=world('구름');C.multi=mount(C);C.multi.join({room:'act시험'});await tick([A,B,C],8);
 const cs=C.multi.status().people.find(p=>p.id===A.multi.id);assert.equal(cs?.pose,'sit');assert.equal(cs?.can,'held');
 // 다른 사람이 앉은 자리는 차지된 것
 const s=B.multi.status().people.find(p=>p.id===A.multi.id);assert.ok(s);
 A.ctx.player.x=3;A.ctx.player.z=-.2;await tick([A,B],6);
 assert.equal(B.multi.occupied(3,-.2),true);assert.equal(B.multi.occupied(3.5,-.2),false);
});
