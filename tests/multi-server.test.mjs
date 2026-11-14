// 함께 걷기 서버 통합 시험(2026-11-08): 127.0.0.1에 실제 서버를 띄우고 Node 내장 WebSocket 클라이언트로 붙는다.
// 방 30명 제한(31명), 속도 제한, 순간이동, 신고 3명 숨김, 끊김·재접속(createWebSocketTransport), 서버 재시작, /health, 환경 변수, Origin 거부, 90일 정리.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/multi-server.mjs';
import {createWebSocketTransport} from '../src/multi-transport.js';
import {FLAG} from '../src/multi-protocol.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=3000,step=20)=>{const end=Date.now()+ms;for(;;){const v=fn();if(v)return v;if(Date.now()>end)throw new Error('시간 초과');await sleep(step);}};
const dataDir=()=>mkdtempSync(join(tmpdir(),'multi-test-'));
async function boot(env={}){const s=startServer({PORT:'0',HOST:'127.0.0.1',DATA_DIR:dataDir(),...env},{quiet:true});const port=await s.ready;return {s,port,url:`ws://127.0.0.1:${port}/`};}
// 원시 클라이언트: 받은 메시지를 모은다
// exp를 주지 않으면 hello에 exp가 없다(= 옛 클라이언트)
function client(url,{room='산',name='손님',resume=null,exp}={}){
 return new Promise((ok,fail)=>{const w=new WebSocket(url),got=[];const c={w,got,welcome:null,send:m=>w.send(JSON.stringify(m)),closed:false};
  w.onmessage=e=>{const m=JSON.parse(e.data);got.push(m);if(m.t==='welcome'){c.welcome=m;ok(c);}if(m.t==='full'){c.full=m;ok(c);}if(m.t==='reject'){c.reject=m;ok(c);}};
  w.onopen=()=>w.send(JSON.stringify({t:'hello',...(exp===undefined?{}:{exp}),room,name,resume}));w.onerror=()=>fail(new Error('연결 실패'));w.onclose=()=>{c.closed=true;};});
}
const states=(c,id)=>c.got.flatMap(m=>m.t==='snap'?m.p:[]).filter(s=>s.id===id);

test('/health: 200과 방 수·접속자 수',async()=>{
 const {s,port,url}=await boot();
 try{
  let h=await (await fetch(`http://127.0.0.1:${port}/health`)).json();assert.deepEqual([h.ok,h.rooms,h.clients],[true,0,0]);
  const a=await client(url),b=await client(url,{room:'다른방'});
  const res=await fetch(`http://127.0.0.1:${port}/health`);assert.equal(res.status,200);h=await res.json();assert.deepEqual([h.rooms,h.clients],[2,2]);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,404);
  a.w.close();b.w.close();
 }finally{await s.close();}
});

test('31명이 같은 방에 들어오면 30명 + 방이름-2, 서로 위치·인사가 보인다',async()=>{
 const {s,url}=await boot();
 try{
  const cs=[];for(let i=0;i<31;i++)cs.push(await client(url,{room:'관악',name:`사람${i}`}));
  assert.equal(cs.filter(c=>c.welcome.room==='관악').length,30);assert.equal(cs[30].welcome.room,'관악-2');
  const ids=new Set(cs.map(c=>c.welcome.id));assert.equal(ids.size,31,'임시 ID는 모두 다름');
  cs[0].send({t:'s',q:1,z:1,x:10,y:20,h:.5,v:1,f:0});cs[0].send({t:'g',k:'hello'});
  await until(()=>states(cs[29],cs[0].welcome.id).length&&cs[29].got.some(m=>m.t==='g'));
  assert.deepEqual(states(cs[29],cs[0].welcome.id)[0],{t:'s',id:cs[0].welcome.id,q:1,z:1,x:10,y:20,h:.5,v:1,f:0});
  await sleep(250);assert.equal(states(cs[30],cs[0].welcome.id).length,0,'다른 방(관악-2)에는 안 보임');
  // 한 명이 나가면 남은 사람에게 b, 빈자리에 새 사람이 들어간다
  const gone=cs[5].welcome.id;cs[5].w.close();await until(()=>cs[0].got.some(m=>m.t==='b'&&m.id===gone));
  const late=await client(url,{room:'관악',name:'늦게'});assert.equal(late.welcome.room,'관악');
  for(const c of [...cs,late])c.w.close();
 }finally{await s.close();}
});

test('속도 제한(초당 15회)과 순간이동 거부가 실제 연결에서도 동작한다',async()=>{
 const {s,url}=await boot();
 try{
  const a=await client(url),b=await client(url);const id=a.welcome.id;
  for(let i=0;i<40;i++)a.send({t:'s',q:i+1,z:0,x:i*.01,y:0,h:0,v:1,f:0});
  await sleep(400);
  const seen=new Set(states(b,id).map(m=>m.q));assert.ok(Math.max(...seen)<=15,`15번째 넘는 위치는 버림(받은 q 최대 ${Math.max(...seen)})`);
  assert.equal(s.rooms.stats.rateDropped,25);
  await sleep(1000);
  a.send({t:'s',q:100,z:0,x:500,y:0,h:0,v:1,f:0});await sleep(250);
  assert.ok(!states(b,id).some(m=>m.q===100),'표시 없는 500m 이동 거부');
  a.send({t:'s',q:101,z:0,x:500,y:0,h:0,v:1,f:FLAG.jump});await until(()=>states(b,id).some(m=>m.q===101));
  assert.equal(s.rooms.stats.teleportRejected,1);assert.equal(s.rooms.stats.jumps,1);
  a.w.close();b.w.close();
 }finally{await s.close();}
});

test('신고: 서로 다른 3명이 신고하면 이름표 숨김·다른 방, 기록 파일은 JSONL이고 IP가 없다',async()=>{
 const dir=dataDir(),{s,url}=await boot({DATA_DIR:dir});
 try{
  const bad=await client(url,{name:'나쁜이'}),rs=[await client(url),await client(url),await client(url)];
  for(const r of rs)r.send({t:'report',to:bad.welcome.id,reason:'방해·괴롭힘'});
  await until(()=>bad.got.some(m=>m.t==='moved'));
  const moved=bad.got.find(m=>m.t==='moved');assert.equal(moved.room,'산-2');assert.equal(moved.h,1);
  await until(()=>rs[0].got.some(m=>m.t==='b'&&m.id===bad.welcome.id));
  const lines=readFileSync(join(dir,'reports.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
  assert.equal(lines.length,3);assert.ok(lines.every(l=>l.target===bad.welcome.id&&l.reason==='방해·괴롭힘'));
  assert.ok(!/127\.0\.0\.1|::1|ffff/.test(readFileSync(join(dir,'reports.jsonl'),'utf8')),'IP 없음');
  for(const c of [bad,...rs])c.w.close();
 }finally{await s.close();}
});

test('끊김 뒤 재접속: 전송 계층이 다시 연결 중 → 같은 ID로 다시 붙고, 서버를 껐다 켜도 돌아온다',async()=>{
 let {s,port,url}=await boot();
 const states=[],seen=[];
 const t=createWebSocketTransport(url,{room:'재접속',name:'하늘',backoff:{base:50,max:400,jitter:0}});
 t.onstatus(st=>states.push(st));t.onmessage(m=>seen.push(m));
 const other=await client(url,{room:'재접속',name:'바다'});
 try{
  await until(()=>t.status==='online');const id=t.info.id;
  t.send({t:'s',q:1,z:0,x:0,y:0,h:0,v:0,f:0});await until(()=>other.got.some(m=>m.t==='snap'&&m.p.some(p=>p.id===id)));
  // 1) 연결만 끊김 → 같은 ID·같은 방
  t.drop();await until(()=>states.includes('reconnecting'));await until(()=>t.status==='online');
  assert.equal(t.info.id,id,'resume 토큰으로 같은 ID');assert.equal(t.info.room,'재접속');
  // 2) 서버가 꺼짐 → 다시 연결 중이 이어지다가, 같은 포트로 다시 켜면 붙는다(새 서버라 새 ID)
  await s.close();await until(()=>t.status==='reconnecting');
  await sleep(300);assert.equal(t.status,'reconnecting','서버가 없는 동안');
  ({s}=await boot({PORT:String(port)}));
  await until(()=>t.status==='online',5000);
  assert.ok(seen.filter(m=>m.t==='welcome').length>=3);
  assert.deepEqual(states.slice(0,3),['online','reconnecting','online']);
  t.close();assert.equal(t.status,'offline');
 }finally{other.w.close();t.close();await s.close();}
});

test('Origin 허용 목록(ALLOWED_ORIGINS): 목록 밖 페이지는 403, 목록 안·머리말 없음은 접속',async()=>{
 const {s,port,url}=await boot({ALLOWED_ORIGINS:'https://engchoon.github.io, http://127.0.0.1:5173'});
 const upgrade=origin=>new Promise(ok=>{const req=http.request({host:'127.0.0.1',port,path:'/',headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==',...(origin?{Origin:origin}:{})}});
  req.on('upgrade',(res,sock)=>{sock.destroy();ok(101);});req.on('response',res=>{res.resume();ok(res.statusCode);});req.on('error',()=>ok('error'));req.end();});
 try{
  assert.equal(await upgrade('https://evil.example'),403);
  assert.equal(await upgrade('https://engchoon.github.io'),101);
  assert.equal(await upgrade('http://127.0.0.1:5173'),101);
  assert.equal(await upgrade(null),101);
  const c=await client(url);assert.ok(c.welcome);c.w.close();
 }finally{await s.close();}
});

test('환경 변수로 뜬다: node server/multi-server.mjs + PORT·DATA_DIR·ALLOWED_ORIGINS, 시작할 때 90일 지난 신고 정리',async()=>{
 const dir=dataDir(),day=86400e3,now=Date.now();
 writeFileSync(join(dir,'reports.jsonl'),[{at:now-100*day,target:'old'},{at:now-10*day,target:'keep'}].map(r=>JSON.stringify(r)).join('\n')+'\n');
 const port=20000+Math.floor(Math.random()*20000);
 const child=spawn(process.execPath,['server/multi-server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ALLOWED_ORIGINS:'https://engchoon.github.io'},stdio:['ignore','pipe','pipe']});
 let out='';child.stdout.on('data',d=>{out+=d;});child.stderr.on('data',d=>{out+=d;});
 try{
  await until(()=>out.includes('"event":"start"'),8000);
  const start=JSON.parse(out.split('\n').find(l=>l.includes('"event":"start"')));
  assert.equal(start.port,port);assert.equal(start.dataDir,dir);assert.deepEqual(start.origins,['https://engchoon.github.io']);assert.equal(start.reports,1);
  const h=await (await fetch(`http://127.0.0.1:${port}/health`)).json();assert.equal(h.ok,true);
  const left=readFileSync(join(dir,'reports.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l).target);assert.deepEqual(left,['keep']);
  // 접속 하나를 붙였다 떼도 로그에는 IP가 나오지 않는다(start 줄의 HOST 값만 127.0.0.1)
  const c=await client(`ws://127.0.0.1:${port}/`);c.w.close();await sleep(100);
  assert.ok(out.split('\n').filter(l=>!l.includes('"event":"start"')).every(l=>!l.includes('127.0.0.1')),'로그에 접속 IP 없음');
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
 assert.ok(out.includes('"event":"stop"'),'SIGTERM에 정상 종료');
 assert.ok(existsSync(join(dir,'reports.jsonl')));
});

test('체험 구분: 같은 방 이름이라도 등산·흡연장은 다른 방, 옛 클라이언트는 등산 방, 모르는 체험은 거절, /health 체험별 수',async()=>{
 const {s,port,url}=await boot();
 try{
  const old=await client(url,{room:'옥상',name:'옛날'}),hike=await client(url,{room:'옥상',name:'등산',exp:'hiking'}),smoke=await client(url,{room:'옥상',name:'흡연',exp:'smoking'});
  assert.equal(old.welcome.exp,'hiking');assert.equal(hike.welcome.count,2,'옛 클라이언트와 같은 방');assert.equal(smoke.welcome.count,1,'흡연장은 따로');
  assert.deepEqual([old.welcome.room,hike.welcome.room,smoke.welcome.room],['옥상','옥상','옥상']);
  old.send({t:'s',q:1,z:0,x:1,y:1,h:0,v:0,f:0});
  await until(()=>hike.got.some(m=>m.t==='snap'&&m.p.some(p=>p.id===old.welcome.id)));
  await sleep(250);
  assert.ok(!smoke.got.some(m=>(m.t==='j'&&m.id!==smoke.welcome.id)||(m.t==='snap'&&m.p.length)),'흡연장에는 등산 이름·위치가 오지 않음');
  const bad=await client(url,{room:'옥상',exp:'golf'});assert.equal(bad.reject.reason,'experience');await until(()=>bad.closed);
  const h=await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.deepEqual([h.rooms,h.clients],[2,3]);assert.deepEqual(h.experiences,{hiking:{rooms:1,clients:2},smoking:{rooms:1,clients:1}});
  for(const c of [old,hike,smoke])c.w.close();
 }finally{await s.close();}
});

test('체험 구분: 전송 계층이 체험 id를 보내 흡연장 방에 붙는다',async()=>{
 const {s,url}=await boot();
 const t=createWebSocketTransport(url,{experience:'smoking',room:'옥상-1',name:'미나',backoff:{base:50,max:400,jitter:0}});
 try{
  await until(()=>t.status==='online');assert.equal(t.info.experience,'smoking');
  assert.deepEqual(s.rooms.info().rooms.map(r=>r.key),['smoking:옥상'],'끝 번호(-1)는 기존 규칙대로 떼고 방 키를 만든다');assert.equal(t.info.room,'옥상');
 }finally{t.close();await s.close();}
});

// ── 채팅·흡연장(11-08)
const chatsOf=c=>c.got.filter(m=>m.t==='c');
test('채팅: 등산 두 사람 왕복(보낸 사람도 되돌려 받음), 속도 제한 c-limit, 같은 방 이름의 흡연장에는 안 감',async()=>{
 const {s,url}=await boot();
 try{
  const a=await client(url,{room:'시험',name:'하늘',exp:'hiking'}),b=await client(url,{room:'시험',name:'바다',exp:'hiking'}),k=await client(url,{room:'시험',name:'흡연',exp:'smoking'});
  a.send({t:'c',text:'안녕하세요'});
  await until(()=>chatsOf(b).length&&chatsOf(a).length);
  assert.deepEqual(chatsOf(b)[0],{t:'c',id:a.welcome.id,text:'안녕하세요'});assert.deepEqual(chatsOf(a)[0],chatsOf(b)[0]);
  b.send({t:'c',text:'반가워요'});await until(()=>chatsOf(a).length===2);assert.equal(chatsOf(a)[1].id,b.welcome.id);
  a.send({t:'c',text:'너무 빨리'});await until(()=>a.got.some(m=>m.t==='c-limit'));
  await sleep(200);assert.equal(chatsOf(b).length,2,'제한된 글은 중계 안 됨');
  assert.equal(chatsOf(k).length,0,'흡연장에는 등산 채팅이 오지 않음');
  for(const c of [a,b,k])c.w.close();
 }finally{await s.close();}
});
test('흡연장: 두 사람이 위치 s·채팅 c·담배 상태 lounge:smoke를 주고받고, 등산 쪽에는 섞이지 않음',async()=>{
 const {s,url}=await boot();
 try{
  const a=await client(url,{room:'옥상-1',name:'미나',exp:'smoking'}),b=await client(url,{room:'옥상-1',name:'지훈',exp:'smoking'}),h=await client(url,{room:'옥상-1',name:'등산',exp:'hiking'});
  assert.equal(b.welcome.count,2);assert.equal(h.welcome.count,1);
  a.send({t:'s',q:1,z:0,x:2,y:3,h:1,v:0,f:0});a.send({t:'c',text:'불 있어요?'});a.send({t:'lounge:smoke',state:'smoking',lit:true});
  await until(()=>states(b,a.welcome.id).length&&chatsOf(b).length&&b.got.some(m=>m.t==='lounge:smoke'));
  assert.deepEqual(states(b,a.welcome.id)[0],{t:'s',id:a.welcome.id,q:1,z:0,x:2,y:3,h:1,v:0,f:0});
  assert.deepEqual(chatsOf(b)[0],{t:'c',id:a.welcome.id,text:'불 있어요?'});
  assert.deepEqual(b.got.find(m=>m.t==='lounge:smoke'),{t:'lounge:smoke',id:a.welcome.id,state:'smoking',lit:true});
  // 늦게 온 사람도 지금 담배 상태를 안다
  const c=await client(url,{room:'옥상-1',name:'보미',exp:'smoking'});
  await until(()=>c.got.some(m=>m.t==='lounge:smoke'&&m.id===a.welcome.id));
  await sleep(250);
  assert.ok(!h.got.some(m=>['c','lounge:smoke'].includes(m.t)||(m.t==='snap'&&m.p.length)||(m.t==='j'&&m.id!==h.welcome.id)),'등산 옥상-1에는 흡연장 것이 오지 않음');
  for(const x of [a,b,c,h])x.w.close();
 }finally{await s.close();}
});
test('채팅 금칙어: 기본 목록 파일 + BANNED_CHAT_WORDS, 파일이 없으면 빈 목록. 채팅은 디스크에 남지 않고 신고 기록에만 최근 3줄',async()=>{
 const dir=dataDir(),file=join(dir,'words.txt');writeFileSync(file,'# 시험 목록\n파일금칙\n');
 const {loadChatBanned}=await import('../server/multi-server.mjs');
 assert.deepEqual(loadChatBanned({CHAT_BANNED_FILE:join(dir,'없는파일.txt')}).words,[]);
 assert.deepEqual(loadChatBanned({CHAT_BANNED_FILE:file,BANNED_CHAT_WORDS:'환경금칙, 파일금칙'}).words,['파일금칙','환경금칙']);
 const {s,url}=await boot({DATA_DIR:dir,CHAT_BANNED_FILE:file,BANNED_CHAT_WORDS:'환경금칙'});
 try{
  const a=await client(url,{room:'금칙'}),b=await client(url,{room:'금칙'}),c=await client(url,{room:'금칙'});
  a.send({t:'c',text:'파일금칙 그리고 환경금칙'});await until(()=>chatsOf(b).length);
  assert.equal(chatsOf(b)[0].text,'*** 그리고 ***');
  await sleep(2100);a.send({t:'c',text:'비밀문장둘'});await until(()=>chatsOf(b).length===2);
  const disk=()=>readFileSync(join(dir,'reports.jsonl'),'utf8');
  assert.equal(existsSync(join(dir,'reports.jsonl')),false,'채팅만으로는 아무 파일도 생기지 않음');
  b.send({t:'report',to:a.welcome.id,reason:'방해·괴롭힘'});await until(()=>existsSync(join(dir,'reports.jsonl'))&&disk().trim());
  const rec=JSON.parse(disk().trim());assert.deepEqual(rec.chat,['*** 그리고 ***','비밀문장둘']);
  for(const x of [a,b,c])x.w.close();
 }finally{await s.close();}
});

// ── 서버 고르기(11-08) ──
test('서버 고르기: /health에 서버별 인원·정원과 total, 정원 2(MAX_PER_ROOM=2)면 3번째는 full로 거절',async()=>{
 const {s,port,url}=await boot({MAX_PER_ROOM:'2'});
 const health=async()=>(await fetch(`http://127.0.0.1:${port}/health`)).json();
 try{
  let h=await health();
  const rows=(n,c1=0)=>['1','2','3'].map(id=>({id,name:`${n} ${id}서버`,count:id==='1'?c1:0,max:2}));
  assert.deepEqual(h.servers,{hiking:rows('관악산'),smoking:rows('옥상')});assert.equal(h.total,0);
  const a=await client(url,{room:'관악산-1',name:'하나',exp:'hiking'}),b=await client(url,{room:'관악산-1',name:'둘',exp:'hiking'});
  assert.equal(a.welcome.server,'1');assert.equal(b.welcome.room,'관악산');
  const c=await client(url,{room:'관악산-1',name:'셋',exp:'hiking'});
  assert.deepEqual(c.full,{t:'full',reason:'full'});await until(()=>c.closed);
  const d=await client(url,{room:'옥상-1',name:'흡연',exp:'smoking'});assert.equal(d.welcome.server,'1');
  h=await health();
  assert.deepEqual(h.servers.hiking,rows('관악산',2));assert.equal(h.servers.smoking[0].count,1);assert.equal(h.total,3);
  assert.equal(h.rooms,2,'-2 방이 생기지 않음');
  // 전송 계층으로 붙어도 full 상태가 된다(창이 '방금 꽉 찼어요'를 띄우는 신호)
  const seen=[];const tr=createWebSocketTransport(url,{experience:'hiking',room:'관악산-1',name:'넷'});tr.onstatus(st=>seen.push(st));
  await until(()=>seen.includes('full'));tr.close();
  a.w.close();
  await sleep(150);
  h=await health();assert.equal(h.servers.hiking[0].count,1,'나가면 줄어든다');
  b.w.close();d.w.close();
 }finally{await s.close();}
});
