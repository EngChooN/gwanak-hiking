// 함께 걷기 채팅·흡연장 두 브라우저 확인(2026-11-08, 기획서 '등산·흡연장 모두 멀티, 등산에 채팅').
// 로컬 서버(MULTI_PORT, 기본 8787)를 이 스크립트가 직접 띄우고, 서로 다른 브라우저 컨텍스트 2개씩으로 붙는다(BroadcastChannel로는 이어질 수 없음).
//  ① 등산 /hiking/?multi=시험&server=ws://127.0.0.1:8787 두 사람: 서로 보임 · 채팅 왕복(hiking:chat-send → hiking:chat) · 속도 제한(hiking:chat-limit)
//  ② 흡연장 /smoking/?multi=시험&server=… 두 사람: 서로 보임 · 채팅 · 담배 상태(lounge:smoke). 흡연장 화면 연결(산풍경)이 아직이면 '보류'로 적고 실패로 치지 않는다.
//  ③ 격리: 같은 방 이름 '시험'이라도 등산 ↔ 흡연장 메시지가 섞이지 않음(흡연장 화면이 없으면 서버에 직접 붙는 흡연장 시험 클라이언트로 확인).
// 페이지 서버: PORT(기본 5197)에 vite 개발 서버를 이 스크립트가 띄운다. 이미 떠 있는 개발 서버를 쓰려면 PAGE_URL=http://127.0.0.1:5173.
//   node scripts/verify-multi-chat.mjs        → artifacts/multi-chat-2026-11-08/ (캡처·report.json). 등산(①)·격리(③)가 실패하면 종료 코드 1.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-chat-2026-11-08',multiPort=Number(process.env.MULTI_PORT??8787),room='시험';mkdirSync(dir,{recursive:true});
let vite=null,pageUrl=process.env.PAGE_URL;
if(!pageUrl){const {createServer}=await import('vite');const port=Number(process.env.PORT??5197);vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();pageUrl=`http://127.0.0.1:${port}`;}
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data`},{quiet:true});await srv.ready;
const wsUrl=`ws://127.0.0.1:${multiPort}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={at:new Date().toISOString(),pageUrl,wsUrl,room,steps:[],errors:[],result:{}},log=(k,v)=>{out.steps.push({k,...v});console.log(k,JSON.stringify(v).slice(0,400));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const health=async()=>(await fetch(`http://127.0.0.1:${multiPort}/health`)).json();

// 브라우저마다: WebSocket으로 받은 메시지(__wsIn)와 채팅·담배 window 이벤트를 모은다(페이지 코드는 건드리지 않음)
function recorder(){
 window.__wsIn=[];window.__ev=[];
 const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.t==='snap'){for(const p of m.p??[])window.__wsIn.push(p);}else window.__wsIn.push(m);if(window.__wsIn.length>4000)window.__wsIn.splice(0,1000);}catch{}});}};
 for(const t of ['hiking:chat','hiking:chat-limit','lounge:chat','lounge:smoke'])addEventListener(t,e=>window.__ev.push({type:t,...e.detail}));
}
async function open(exp,name,viewport={width:1280,height:760}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 await ctx.addInitScript(recorder);
 const p=await ctx.newPage();p.exp=exp;p.ctx=ctx;p.label=`${exp}:${name}`;
 p.on('pageerror',e=>out.errors.push(`${p.label}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket connection|favicon/.test(m.text()))out.errors.push(`${p.label}: ${m.text()}`);});
 const q=`multi=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}&server=${encodeURIComponent(wsUrl)}`;
 if(exp==='hiking'){
  await p.goto(`${pageUrl}/hiking/?${q}&start=entrance&time=13:00&weather=clear&quality=balanced`);
  await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.multi?.(),null,{timeout:180000});
 }else{
  await p.goto(`${pageUrl}/smoking/?${q}&time=day`);
  await p.waitForFunction(()=>!!window.lounge,null,{timeout:120000});
 }
 return p;
}
const waitFor=(p,fn,arg,ms=15000)=>p.waitForFunction(fn,arg,{timeout:ms,polling:100});
const shot=async(p,name)=>{await (p.exp==='hiking'?await waitChunks(p):p).screenshot({path:`${dir}/${name}.png`});};
const wsIn=p=>p.evaluate(()=>window.__wsIn);
const ev=p=>p.evaluate(()=>window.__ev);
const myId=async p=>(await wsIn(p)).find(m=>m.t==='welcome')?.id??null;
const check=(name,ok,detail={})=>{out.result[name]={ok,...detail};log(`${ok?'통과':'실패'} ${name}`,detail);return ok;};
let fail=false;

// ── ① 등산
const A=await open('hiking','하늘'),B=await open('hiking','바다');
try{
 await waitFor(A,()=>hiking.multi().status==='online'&&hiking.multi().roster.length>=1,null,30000);
 await waitFor(B,()=>hiking.multi().status==='online'&&hiking.multi().roster.length>=1,null,30000);
 // 바다 앞 4m에 하늘(마주 봄)
 const pb=await B.evaluate(()=>hiking.position()),fx=-Math.sin(pb.heading),fz=-Math.cos(pb.heading);
 await A.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb.x+fx*4,z:pb.z+fz*4,h:pb.heading+Math.PI});
 await sleep(2500);
 const ia=await A.evaluate(()=>hiking.multi()),ib=await B.evaluate(()=>hiking.multi());
 fail|=!check('등산 서로 보임',ia.roster.some(r=>r.name==='바다')&&ib.roster.some(r=>r.name==='하늘'&&r.model),{A본사람:ia.roster.map(r=>r.name),B본사람:ib.roster.map(r=>({name:r.name,model:r.model})),transport:ia.transport});
 // 채팅 왕복: HUD가 보낼 이벤트 그대로
 await A.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'안녕하세요, 같이 올라가요!'}})));
 await waitFor(B,()=>window.__ev.some(e=>e.type==='hiking:chat'&&e.text==='안녕하세요, 같이 올라가요!'));
 await waitFor(A,()=>window.__ev.some(e=>e.type==='hiking:chat'&&e.me));
 await sleep(2100);
 await B.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'좋아요 😀'}})));
 await waitFor(A,()=>window.__ev.some(e=>e.type==='hiking:chat'&&e.text==='좋아요 😀'));
 const ea=(await ev(A)).filter(e=>e.type==='hiking:chat'),eb=(await ev(B)).filter(e=>e.type==='hiking:chat');
 fail|=!check('등산 채팅 왕복',eb.some(e=>e.name==='하늘'&&!e.me&&e.remote)&&ea.some(e=>e.name==='하늘'&&e.me)&&ea.some(e=>e.name==='바다'&&!e.me),{A받음:ea,B받음:eb});
 // 속도 제한: 2초 안에 두 번
 await A.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'하나'}})));
 await A.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'둘'}})));
 await waitFor(A,()=>window.__ev.some(e=>e.type==='hiking:chat-limit'),null,5000).catch(()=>{});
 await sleep(400);
 const lim=(await ev(A)).filter(e=>e.type==='hiking:chat-limit'),bTexts=(await ev(B)).filter(e=>e.type==='hiking:chat').map(e=>e.text);
 fail|=!check('등산 채팅 속도 제한',lim.length===1&&bTexts.includes('하나')&&!bTexts.includes('둘'),{제한이벤트:lim,B받은글:bTexts});
 await shot(B,'01-등산-B화면-하늘이-보임');await shot(A,'02-등산-A화면-바다가-보임');
}catch(e){fail=true;check('등산 단계 오류',false,{message:e.message});}

// ── ② 흡연장
let smokingWired=false,S1=null,S2=null;
try{
 S1=await open('smoking','미나');S2=await open('smoking','지훈');
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){const h=await health();if((h.experiences?.smoking?.clients??0)>=2){smokingWired=true;break;}await sleep(500);}
 if(!smokingWired){
  out.result['흡연장']={ok:null,보류:'흡연장 화면이 아직 서버에 붙지 않음(산풍경 작업 전). 서버 쪽 흡연장 열림은 tests/multi-server.test.mjs가 확인',health:await health()};
  log('보류 흡연장',out.result['흡연장']);
  await shot(S1,'03-흡연장-연결전');
 }else{
  const id1=await myId(S1);
  await sleep(2500);
  const in2=await wsIn(S2);
  check('흡연장 서로 보임',in2.some(m=>m.t==='s'&&m.id===id1)&&in2.some(m=>m.t==='j'&&m.id===id1),{미나ID:id1});
  // 채팅: 실제 채팅 입력칸으로
  await S1.evaluate(()=>{const f=document.querySelector('.lg-form'),i=f.querySelector('input');document.querySelector('.lg-chat')?.classList.add('open');i.value='불 좀 빌려 주세요';f.requestSubmit();});
  await waitFor(S2,()=>window.__ev.some(e=>e.type==='lounge:chat'&&e.remote&&e.text==='불 좀 빌려 주세요'),null,8000).catch(()=>{});
  const c2=(await ev(S2)).filter(e=>e.type==='lounge:chat'&&e.remote);
  check('흡연장 채팅',c2.some(e=>e.text==='불 좀 빌려 주세요'),{지훈받음:c2});
  // 담배 상태: 미나가 담배를 꺼내 불을 붙인다
  await S1.evaluate(()=>{window.lounge.smoker?.start?.();setTimeout(()=>window.lounge.smoker?.light?.(),1200);});
  await waitFor(S2,id=>window.__wsIn.some(m=>m.t==='lounge:smoke'&&m.id===id&&m.lit),id1,12000).catch(()=>{});
  const sm=(await wsIn(S2)).filter(m=>m.t==='lounge:smoke'&&m.id===id1);
  check('흡연장 담배 상태',sm.some(m=>m.lit),{지훈이받은상태:sm.map(m=>`${m.state}:${m.lit}`)});
  await sleep(1500);await shot(S2,'03-흡연장-지훈화면-미나-불붙임');await shot(S1,'04-흡연장-미나화면');
 }
}catch(e){out.result['흡연장']={ok:smokingWired?false:null,오류:e.message};log('흡연장 오류',{message:e.message});}

// ── ③ 격리: 흡연장 화면이 없으면 서버에 직접 붙는 흡연장 시험 클라이언트 2명으로 같은 방 이름 '시험'에서 위치·채팅·담배 상태를 보낸다
async function rawSmoker(name){
 return new Promise((ok,fail)=>{const w=new WebSocket(wsUrl),got=[];const c={w,got,send:m=>w.send(JSON.stringify(m))};
  w.onmessage=e=>{const m=JSON.parse(e.data);got.push(m);if(m.t==='welcome'){c.id=m.id;ok(c);}};
  w.onopen=()=>w.send(JSON.stringify({t:'hello',exp:'smoking',room,name}));w.onerror=()=>fail(new Error('흡연장 시험 클라이언트 연결 실패'));});
}
try{
 const raws=smokingWired?[]:[await rawSmoker('흡연시험1'),await rawSmoker('흡연시험2')];
 if(raws.length){raws[0].send({t:'s',q:1,z:0,x:1,y:1,h:0,v:0,f:0});raws[0].send({t:'c',text:'흡연장 비밀글'});raws[0].send({t:'lounge:smoke',state:'smoking',lit:true});}
 else if(S1){await sleep(2100);await S1.evaluate(()=>{const f=document.querySelector('.lg-form'),i=f.querySelector('input');i.value='흡연장 비밀글';f.requestSubmit();});}
 await sleep(400);
 await A.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'등산 비밀글'}})));
 await sleep(2000);
 const smokingIds=new Set(raws.length?raws.map(r=>r.id):[await myId(S1),await myId(S2)]);
 const hikeIn=[...await wsIn(A),...await wsIn(B)];
 const leakToHiking=hikeIn.filter(m=>smokingIds.has(m.id)||m.t==='lounge:smoke'||(m.t==='c'&&m.text==='흡연장 비밀글'));
 const smokeIn=raws.length?raws.flatMap(r=>r.got.flatMap(m=>m.t==='snap'?m.p:[m])):[...await wsIn(S1),...await wsIn(S2)];
 const hikeIds=new Set([await myId(A),await myId(B)]);
 const leakToSmoking=smokeIn.filter(m=>hikeIds.has(m.id)||(m.t==='c'&&m.text==='등산 비밀글'));
 const rawGotOwn=raws.length?raws[1].got.some(m=>m.t==='c'&&m.text==='흡연장 비밀글')&&raws[1].got.some(m=>m.t==='lounge:smoke'):true;
 const h=await health();
 fail|=!check('등산↔흡연장 격리',!leakToHiking.length&&!leakToSmoking.length&&rawGotOwn,{방법:raws.length?'흡연장 시험 클라이언트(서버 직접)':'흡연장 화면',등산이받은흡연장것:leakToHiking.length,흡연장이받은등산것:leakToSmoking.length,흡연장끼리는받음:rawGotOwn,health:h,방:srv.rooms.info().rooms});
 for(const r of raws)r.w.close();
}catch(e){fail=true;check('격리 단계 오류',false,{message:e.message});}

log('서버 통계',srv.rooms.info().stats);
log('오류',{errors:out.errors});
out.passed=!fail;
writeFileSync(`${dir}/report.json`,JSON.stringify(out,null,2));
for(const p of [A,B,S1,S2])await p?.ctx.close();
await browser.close();await srv.close();await vite?.close();
console.log(fail?'결과: 실패':'결과: 등산·격리 통과'+(out.result['흡연장']?.ok===null?' (흡연장은 보류)':''));
process.exit(fail?1:0);
