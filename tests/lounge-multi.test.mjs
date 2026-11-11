// 흡연장 실시간 멀티(src/lounge/multi.js): 다른 사람 옷·주소 참가·담배 상태 따라 하기·채팅 중복 막기·상태 칩 문구,
// 그리고 같은 프로세스 BroadcastChannel 두 개로 위치·채팅·담배 상태가 오가는지(내 컴퓨터 모드 = 서버와 같은 메시지 모양).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {remoteOutfit,avatarId,multiParams,cleanRoom,smokePlan,chatRoute,loungeStatusView,createLoungeMulti,DEFAULT_ROOM,MULTI} from '../src/lounge/multi.js';
import {OUTFITS} from '../src/lounge/outfit.js';
import {broadcastChannelName,createBroadcastTransport} from '../src/multi-transport.js';
import {FLAG,SMOKE_STATES} from '../src/multi-protocol.js';
import {REMOTE_REACT} from '../src/lounge/npc.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('다른 사람 옷은 ID로 정해지는 회사원 옷 4종 중 하나(같은 ID는 늘 같은 옷)',()=>{
 const seen=new Set();
 for(let i=0;i<200;i++){const id=`abc${i}`,k=remoteOutfit(id);assert.ok(k in OUTFITS,k);assert.equal(remoteOutfit(id),k);seen.add(k);}
 assert.deepEqual([...seen].sort(),Object.keys(OUTFITS).sort(),'네 가지 옷이 다 나온다');
 assert.equal(avatarId('x1'),'p:x1');
});

test('주소 참가: ?multi=옥상-1&server=ws://… 이면 바로 참가, 방 기본값은 옥상-1',()=>{
 const p=multiParams('?multi=옥상-1&server=ws://127.0.0.1:8787&name=하늘');
 assert.deepEqual(p,{auto:true,room:'옥상-1',name:'하늘',server:'ws://127.0.0.1:8787/'});
 const q=multiParams('?time=day');assert.equal(q.auto,false);assert.equal(q.room,DEFAULT_ROOM);assert.equal(q.server,null);assert.equal(q.name,null);
 assert.equal(multiParams('?multi=').room,'옥상-1');
 assert.equal(multiParams('','wss://x.example').server,'wss://x.example/','빌드 변수');
 assert.equal(multiParams('?server=off','wss://x.example').server,null);
 assert.equal(cleanRoom('옥상:1 <b>'),'옥상1b','서버 방 이름 규칙(:·공백·기호 제거)');
 assert.equal(DEFAULT_ROOM,'옥상-1');
});

test('흡연장 BroadcastChannel 채널은 gwanak-multi:smoking:방(등산과 섞이지 않음)',()=>{
 assert.equal(broadcastChannelName('smoking','옥상-1'),'gwanak-multi:smoking:옥상-1');
 assert.notEqual(broadcastChannelName('smoking','옥상-1'),broadcastChannelName('hiking','옥상-1'));
});

test('받은 담배 상태 → 상대 담배에 부를 일(중간에 들어와도 꺼내기·불부터)',()=>{
 assert.deepEqual(smokePlan('idle',{state:'out',lit:false}),[['start']]);
 assert.deepEqual(smokePlan('idle',{state:'smoking',lit:true}),[['start'],['light']]);
 assert.deepEqual(smokePlan('ready',{state:'lighting',lit:false}),[['light']]);
 assert.deepEqual(smokePlan('smoking',{state:'inhale',lit:true}),[['puff']]);
 assert.deepEqual(smokePlan('exhale',{state:'exhale',lit:true}),[],'이미 내뿜는 중이면 그대로');
 assert.deepEqual(smokePlan('smoking',{state:'flick',lit:true}),[['flick']]);
 assert.deepEqual(smokePlan('exhale',{state:'trick',lit:true}),[['trick','ring']]);
 assert.deepEqual(smokePlan('smoking',{state:'dispose',lit:true}),[['dispose']]);
 assert.deepEqual(smokePlan('idle',{state:'done',lit:false}),[]);
 // 허용 목록의 어떤 상태도 오류 없이 처리
 for(const s of SMOKE_STATES)for(const cur of ['idle','out','ready','lighting','smoking','inhale','exhale','flick','finished','dispose'])assert.ok(Array.isArray(smokePlan(cur,{state:s,lit:true})));
});

test('채팅: 서버가 되돌려 준 내 글은 다시 그리지 않는다',()=>{
 assert.equal(chatRoute({t:'c',id:'me1',text:'안녕'},'me1'),'mine');
 assert.equal(chatRoute({t:'c',id:'other',text:'안녕'},'me1'),'show');
 assert.equal(chatRoute({t:'c',id:'other',text:''},'me1'),null);
 assert.equal(chatRoute({t:'s',id:'other'},'me1'),null);
});

test('연결 상태 칩 6종(등산 칩과 같은 상태, 흡연장 말투)',()=>{
 const v=s=>loungeStatusView({state:s,room:'옥상-1',count:3,transport:'server'});
 assert.equal(v('connecting').tone,'wait');assert.match(v('connecting').text,/옥상 문/);
 assert.equal(v('online').tone,'ok');assert.match(v('online').text,/같이 피우는 중 · 3명/);
 assert.equal(loungeStatusView({state:'online',count:2,transport:'local'}).tone,'local');
 assert.equal(v('reconnecting').tone,'warn');assert.match(v('reconnecting').sub,/NPC/);
 assert.equal(v('offline').action,'retry');assert.equal(v('full').action,'other');
 assert.equal(v('bogus'),null);
});

test('NPC는 사람 채팅에 가끔만 대답(확률 ≤ 0.5, 쉬는 시간 ≥ 5초)',()=>{
 assert.ok(REMOTE_REACT.chance>0&&REMOTE_REACT.chance<=.5);assert.ok(REMOTE_REACT.cool>=5);
 const src=readFileSync(new URL('../src/lounge/npc.js',import.meta.url),'utf8');
 assert.match(src,/e\.detail\.remote&&!fromMe/);
});

test('HUD 말풍선이 같이 피우는 사람도 찾는다(hud.js avatarOf → ctx.multi)',()=>{
 const src=readFileSync(new URL('../src/lounge/hud.js',import.meta.url),'utf8');
 assert.match(src,/ctx\.multi\?\.avatarOf\?\.\(id\)/);assert.match(src,/hasBubble/);
});

// ── 두 사람(같은 프로세스 BroadcastChannel)
function fakeWorld(){
 const win=new EventTarget(),clock={t:0};
 const created=[];
 const fakeSmoker=()=>{const s={state:'idle',calls:[],lit:false};
  const api={get state(){return s.state;},calls:s.calls,status:()=>({state:s.state,lit:s.lit}),apply(){},remove(){},
   start(){s.calls.push('start');if(s.state==='idle')s.state='out';return true;},light(){s.calls.push('light');if(s.state==='out'||s.state==='ready'){s.state='smoking';s.lit=true;}return true;},
   puff(){s.calls.push('puff');return true;},flick(){s.calls.push('flick');return true;},trick(n){s.calls.push('trick:'+n);return true;},dispose(){s.calls.push('dispose');s.state='idle';s.lit=false;return true;}};
  return api;};
 const player={id:'me',x:0,z:0,heading:0,speed:0,running:false};
 const ctx={player,profile:{nickname:'하늘'},mobile:false,smoker:{status:()=>({state:'idle',lit:false})},world:{add(){},remove(){}},
  createAvatar:async o=>{const a={...o,x:0,z:0,heading:0,root:{visible:true},extra:[],placed:0,place(x,z,h){a.x=x;a.z=z;a.heading=h;a.placed++;},update(){} ,headTop(){}};created.push(a);return a;},
  createSmoker:()=>{const s=fakeSmoker();created.at(-1).smoker=s;return s;}};
 return {win,clock,ctx,created,player};
}
const mount=(w,search)=>createLoungeMulti({ctx:w.ctx,win:w.win,search,now:()=>w.clock.t,
 makeTransport:o=>createBroadcastTransport(o.room,undefined,{experience:'smoking'})});
const events=(win,type)=>{const out=[];win.addEventListener(type,e=>out.push(e.detail));return out;};
async function tick(ws,ms=120,steps=1){for(let i=0;i<steps;i++){for(const w of ws){w.clock.t+=ms/1000;w.multi.update(ms/1000);}await sleep(15);}}

test('두 사람: 서로 보이고(위치·이름) 채팅이 한 번씩만, 담배 상태가 상대 화면 담배로',async t=>{
 const A=fakeWorld(),B=fakeWorld();B.ctx.profile.nickname='바다';
 A.multi=mount(A,'?multi=시험방');B.multi=mount(B,'?multi=시험방');t.after(()=>{A.multi.dispose();B.multi.dispose();spy?.close();});let spy=null;
 const statusA=events(A.win,'lounge:multi-status');
 A.multi.join({room:'시험방',name:''});B.multi.join({room:'시험방',name:''});
 assert.equal(A.multi.status().transport,'local');assert.equal(A.multi.name,'하늘','닉네임은 로비 닉네임');
 A.player.x=1.5;A.player.z=-2;A.player.heading=1;
 await tick([A,B],120,8);
 const pb=B.multi.people();
 assert.equal(pb.length,1);assert.equal(pb[0].name,'하늘');
 assert.ok(Math.abs(pb[0].sample.x-1.5)<.01&&Math.abs(pb[0].sample.z+2)<.01,'위치 보간');
 assert.equal(B.created.length,1,'몸 하나');assert.ok(B.created[0].outfit in OUTFITS);assert.match(B.created[0].id,/^p:/);
 assert.equal(B.created[0].name,'하늘');
 assert.ok(statusA.some(s=>s.state==='online'&&s.count===2),'상태 칩 2명');
 // 채팅: A가 HUD로 보냄 → B는 remote:true로 한 번, A는 되돌림을 다시 그리지 않음
 const chatA=events(A.win,'lounge:chat'),chatB=events(B.win,'lounge:chat');
 A.win.dispatchEvent(new CustomEvent('lounge:chat',{detail:{id:'me',name:'하늘',text:'불 있어요?'}}));
 A.win.dispatchEvent(new CustomEvent('lounge:chat',{detail:{id:'me',name:'하늘',text:'각본 대사',scripted:true}}));
 await sleep(40);
 assert.deepEqual(chatB.map(c=>[c.name,c.text,c.remote]),[['하늘','불 있어요?',true]]);
 assert.equal(chatA.length,2,'A 화면에는 내가 낸 두 줄뿐(되돌림 중복 없음)');
 assert.equal(A.multi.status().stats.chatsEchoSkipped,1);
 // 속도 제한: 바로 또 보내면 알림
 const notes=events(A.win,'lounge:multi-note');
 A.win.dispatchEvent(new CustomEvent('lounge:chat',{detail:{id:'me',name:'하늘',text:'또'}}));await sleep(20);
 assert.ok(notes.some(n=>/천천히/.test(n.text)));
 // 담배: A가 불 붙임 → B 화면 A 몸의 담배가 꺼내고 불 붙임
 A.win.dispatchEvent(new CustomEvent('lounge:smoke',{detail:{id:'me',isPlayer:true,state:'out',lit:false}}));
 A.win.dispatchEvent(new CustomEvent('lounge:smoke',{detail:{id:'me',isPlayer:true,state:'smoking',lit:true}}));
 A.win.dispatchEvent(new CustomEvent('lounge:smoke',{detail:{id:'me',isPlayer:true,state:'smoking',lit:true}})); // 같은 상태는 다시 안 보냄
 A.win.dispatchEvent(new CustomEvent('lounge:smoke',{detail:{id:'p:zz',isPlayer:false,state:'inhale',lit:true}})); // 남의 담배는 안 보냄
 await sleep(40);
 const sm=B.created[0].smoker;
 assert.deepEqual(sm.calls,['start','light']);assert.equal(sm.state,'smoking');
 assert.equal(A.multi.status().stats.smokesSent,4,'들어올 때 1번(idle) + 처음 본 B에게 1번(11-08) + 바뀐 상태 2번');
 // 자리 옮기기(순간 이동)는 FLAG.jump
 const raw=[];spy=new BroadcastChannel(broadcastChannelName('smoking','시험방'));spy.onmessage=e=>raw.push(e.data);
 A.player.x=6;A.player.z=4;await tick([A,B],120,3);
 assert.ok(raw.some(m=>m.t==='s'&&m.x===6&&(m.f&FLAG.jump)),'멀리 옮기면 순간 이동 표시');
 assert.ok(B.created[0].placed>=2,'받는 쪽은 미끄러지지 않고 바로 옮김');
 assert.ok(raw.every(m=>m.t!=='s'||m.z===0),'옥상은 z=0');
 spy.close();
 // 나가기: 상대 화면에서 빠짐
 A.multi.leave();await tick([B],120,2);
 assert.equal(B.multi.people().length,0);
 B.multi.dispose();A.multi.dispose();
});

test('늦게 들어온 사람도 지금 담배 상태를 받고, 소식 없는 사람은 빠진다',async t=>{
 const A=fakeWorld(),B=fakeWorld();
 A.ctx.smoker={status:()=>({state:'smoking',lit:true})};
 A.multi=mount(A,'');B.multi=mount(B,'');t.after(()=>{A.multi.dispose();B.multi.dispose();});
 B.multi.join({room:'늦게',name:'바다'});await sleep(10);
 A.multi.join({room:'늦게',name:'하늘'}); // 들어오자마자 지금 담배 상태를 알린다
 await tick([A,B],120,6);
 assert.deepEqual(B.created[0]?.smoker.calls,['start','light']);
 // A가 조용히 사라지면(창 닫힘) 시간 초과로 빠진다
 A.multi.dispose();
 for(let i=0;i<(MULTI.timeout+1)*10;i++){B.clock.t+=.1;B.multi.update(.1);} // 루프가 도는 동안 소식이 끊김(한 번에 건너뛰면 '내가 멈췄다 깨어남'으로 보고 보류)
 assert.equal(B.multi.people().length,0);
 B.multi.dispose();
});

test('서버 모드에서 연결 전에 친 채팅은 보내지 않고 알린다',()=>{
 const W=fakeWorld(),sent=[];
 const fake={kind:'server',status:'connecting',send:m=>sent.push(m),onmessage:()=>()=>{},onstatus:()=>()=>{},close(){}};
 const m=createLoungeMulti({ctx:W.ctx,win:W.win,search:'?server=ws://127.0.0.1:1',now:()=>0,makeTransport:()=>fake});
 const notes=events(W.win,'lounge:multi-note');
 m.join({room:'옥상-1'});
 W.win.dispatchEvent(new CustomEvent('lounge:chat',{detail:{id:'me',name:'하늘',text:'안녕'}}));
 assert.ok(!sent.some(x=>x.t==='c'));assert.ok(notes.some(n=>/연결 전/.test(n.text)));
 m.dispose();
});
