// 서버 고르기 창 두 브라우저 확인(2026-11-08, 기획서 「서버 고르기 창」 완료 기준).
// 이 스크립트가 직접 띄운다: 함께 걷기 서버 2개(정원 20 = MULTI_PORT 기본 8790, 정원 2 = 다음 포트) + vite 개발 서버(PORT 기본 5198, PAGE_URL로 바꿈).
//  ① 등산: 브라우저 A·B가 창에서 '관악산 1서버'를 골라 같은 서버 입장 → 창 인원 0→1, HUD 👋로 다시 연 창 2/30명·지금 여기 → 서로 보임 → 채팅 왕복
//  ② 흡연장: 브라우저 C·D가 로딩 뒤 뜬 창에서 '옥상 1서버' → 인원 0→1, 👥로 다시 연 창 2/30명 → 서로 보임 → 채팅
//  ③ 정원 2 서버: 2명이 찬 뒤 창에 '꽉 참'(고를 수 없음), 3번째 접속은 full 거절, 창을 연 사이 꽉 차면 '방금 꽉 찼어요'로 다시 고르기
//  ④ 산 고르기 → 서버 고르기 순서, 옛 주소 ?multi=관악산-1은 창 없이 1서버, 서버에 연결 안 되면 혼자 걷기만
//  ⑤ 세 화면 크기(390×844·844×390·1920×1080) 캡처, 버튼 44px 이상·화면 안
//   node scripts/verify-server-pick.mjs → artifacts/server-pick-2026-11-08/ (캡처·report.json). 하나라도 실패하면 종료 코드 1.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/server-pick-2026-11-08';mkdirSync(dir,{recursive:true});
const port1=Number(process.env.MULTI_PORT??8790),port2=port1+1;
let vite=null,pageUrl=process.env.PAGE_URL;
if(!pageUrl){const {createServer}=await import('vite');const port=Number(process.env.PORT??5198);vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();pageUrl=`http://127.0.0.1:${port}`;}
const srv=startServer({PORT:String(port1),HOST:'127.0.0.1',DATA_DIR:`${dir}/data`},{quiet:true});await srv.ready;
const small=startServer({PORT:String(port2),HOST:'127.0.0.1',DATA_DIR:`${dir}/data-small`,MAX_PER_ROOM:'2'},{quiet:true});await small.ready;
const ws1=`ws://127.0.0.1:${port1}`,ws2=`ws://127.0.0.1:${port2}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={at:new Date().toISOString(),pageUrl,ws1,ws2,steps:[],errors:[],result:{}},log=(k,v)=>{out.steps.push({k,...v});console.log(k,JSON.stringify(v).slice(0,500));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=false;const check=(name,ok,detail={})=>{out.result[name]={ok:!!ok,...detail};if(!ok)fail=true;log(`${ok?'통과':'실패'} ${name}`,detail);return ok;};
const health=async ws=>(await fetch(ws.replace('ws','http')+'/health')).json();

function recorder(){
 window.__wsIn=[];window.__ev=[];
 const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.t==='snap')for(const p of m.p??[])window.__wsIn.push(p);else window.__wsIn.push(m);if(window.__wsIn.length>4000)window.__wsIn.splice(0,1000);}catch{}});}};
 for(const t of ['hiking:chat','lounge:chat','hiking:multi-status','lounge:multi-status'])addEventListener(t,e=>window.__ev.push({type:t,...e.detail}));
}
const ctxs=[];
async function open(exp,{query='',viewport={width:1280,height:760},nickname='손님',touch=false,wait='picker'}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:touch,isMobile:touch});ctxs.push(ctx);
 await ctx.addInitScript(nick=>{if(!sessionStorage.getItem('__init')){sessionStorage.setItem('__init','1');localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');
  localStorage.setItem('online-smoking',JSON.stringify({nickname:nick,seenIntro:true,muted:true}));}},nickname);
 await ctx.addInitScript(recorder);
 const p=await ctx.newPage();p.exp=exp;p.label=`${exp}:${nickname}`;
 p.on('pageerror',e=>out.errors.push(`${p.label}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket connection|favicon|Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text()))out.errors.push(`${p.label}: ${m.text()}`);});
 await p.goto(`${pageUrl}/${exp}/?${query}`);
 if(wait==='picker')await p.waitForSelector('.sp-wrap:not([hidden]) .sp-row',{timeout:180000});
 return p;
}
const HQ=ws=>`serverpick=on&server=${encodeURIComponent(ws)}&start=entrance&time=13:00&weather=clear&quality=balanced`;
const SQ=ws=>`serverpick=on&server=${encodeURIComponent(ws)}&time=day`;
// 창 읽기
const readPick=p=>p.evaluate(()=>{const w=[...document.querySelectorAll('.sp-wrap')].find(e=>!e.hidden);if(!w)return null;
 return {net:w.dataset.net,here:w.querySelector('[data-sp-here]').textContent,total:w.querySelector('[data-sp-total]').textContent,sumHidden:w.querySelector('.sp-sum').hidden,
  note:w.querySelector('.sp-note').hidden?'':w.querySelector('.sp-note').textContent,solo:w.querySelector('.sp-solo').textContent.trim(),closable:!w.querySelector('.sp-x').hidden,
  rows:[...w.querySelectorAll('.sp-row')].map(b=>({name:b.querySelector('b').textContent,n:b.querySelector('.sp-row-n').textContent,tag:b.querySelector('.sp-tag')?.textContent??'',state:b.dataset.state,disabled:b.disabled}))};});
const waitPick=(p,fn,arg,ms=12000)=>p.waitForFunction(([src,a])=>{const w=[...document.querySelectorAll('.sp-wrap')].find(e=>!e.hidden);if(!w)return false;return new Function('w','a',src)(w,a);},[fn,arg],{timeout:ms,polling:150});
const rowIs=(p,text,ms)=>waitPick(p,"return [...w.querySelectorAll('.sp-row-n')].some(e=>e.textContent===a)",text,ms);
async function choose(p,name){await p.fill('.sp-wrap:not([hidden]) input',name);await p.click('.sp-wrap:not([hidden]) .sp-row:not([disabled])');}
const shot=(p,name)=>p.screenshot({path:`${dir}/${name}.png`});
// 버튼 크기·화면 안 검사
const layout=p=>p.evaluate(()=>{const w=[...document.querySelectorAll('.sp-wrap')].find(e=>!e.hidden);if(!w)return {missing:true};
 const vw=innerWidth,vh=innerHeight,els=[...w.querySelectorAll('button,input')].filter(e=>e.offsetParent);
 const small=els.map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.height<43.5||r.width<43.5).map(({e,r})=>`${e.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
 const outside=els.map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.left<0||r.top<0||r.right>vw+.5||r.bottom>vh+.5).map(({e})=>e.className);
 const card=w.querySelector('.sp-card').getBoundingClientRect();
 return {small,outside,card:{x:Math.round(card.x),y:Math.round(card.y),w:Math.round(card.width),h:Math.round(card.height)},scroll:w.querySelector('.sp-card').scrollHeight>w.querySelector('.sp-card').clientHeight+1};});

try{
 // ── ① 등산 두 브라우저
 {
  const A=await open('hiking',{query:HQ(ws1),nickname:'하늘'});
  await rowIs(A,'0 / 30명');const a0=await readPick(A);
  check('등산 창: 처음 0/30명·합계 0',a0.rows[0].name==='관악산 1서버'&&a0.rows[0].n==='0 / 30명'&&a0.here==='0'&&a0.total==='0'&&a0.solo.includes('혼자 걷기')&&!a0.closable,a0);
  await shot(A,'01-등산-창-처음-0명');
  await choose(A,'하늘');
  await A.waitForFunction(()=>window.hiking?.started&&window.hiking.multi?.()?.status==='online',null,{timeout:180000});
  const B=await open('hiking',{query:HQ(ws1),nickname:'바다'});
  await rowIs(B,'1 / 30명');const b1=await readPick(B);
  check('등산 창: 한 명 들어오면 1/30명·지금 접속 1',b1.rows[0].n==='1 / 30명'&&b1.here==='1'&&b1.total==='1',b1);
  await shot(B,'02-등산-창-1명');
  await choose(B,'바다');
  await B.waitForFunction(()=>window.hiking?.started&&window.hiking.multi?.()?.status==='online'&&window.hiking.multi().roster.length>=1,null,{timeout:180000});
  await A.waitForFunction(()=>window.hiking.multi().roster.some(r=>r.name==='바다'),null,{timeout:20000});
  const welA=await A.evaluate(()=>window.__wsIn.find(m=>m.t==='welcome')),welB=await B.evaluate(()=>window.__wsIn.find(m=>m.t==='welcome'));
  const ia=await A.evaluate(()=>window.hiking.multi()),ib=await B.evaluate(()=>window.hiking.multi());
  check('등산 같은 서버·서로 보임',welA.server==='1'&&welB.server==='1'&&welA.room===welB.room&&ia.roster.some(r=>r.name==='바다')&&ib.roster.some(r=>r.name==='하늘'),{A:welA,B:welB,A본사람:ia.roster.map(r=>r.name),B본사람:ib.roster.map(r=>r.name)});
  // HUD 👋 버튼으로 다시 열면 2/30명·지금 여기
  await A.evaluate(()=>document.querySelector('.me-entry').click());
  await rowIs(A,'2 / 30명',9000);const a2=await readPick(A);
  check('등산 HUD 👋로 다시 연 창: 2/30명·지금 여기·나가기 단추',a2.rows[0].tag==='지금 여기'&&a2.rows[0].disabled&&a2.here==='2'&&a2.closable&&a2.solo.includes('나가서'),a2);
  await shot(A,'03-등산-HUD에서-다시연-창-2명');
  await A.click('.sp-wrap:not([hidden]) .sp-x');
  const chip=await A.evaluate(()=>{const c=document.querySelector('.me-chip');return {hidden:c.hidden,text:c.textContent};});
  check('등산 상태 칩에 서버 이름',!chip.hidden&&chip.text.includes('관악산 1서버'),chip);
  // 채팅
  await A.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'1서버에서 만나요!'}})));
  await B.waitForFunction(()=>window.__ev.some(e=>e.type==='hiking:chat'&&e.text==='1서버에서 만나요!'),null,{timeout:8000}).catch(()=>{});
  const cb=await B.evaluate(()=>window.__ev.filter(e=>e.type==='hiking:chat'));
  check('등산 채팅',cb.some(e=>e.text==='1서버에서 만나요!'&&e.name==='하늘'),{B받음:cb});
  await shot(B,'04-등산-B화면');
  // 나가기(창 → 나가서 혼자 걷기)
  await B.evaluate(()=>document.querySelector('.me-entry').click());await B.waitForSelector('.sp-wrap:not([hidden]) .sp-solo');
  await B.click('.sp-wrap:not([hidden]) .sp-solo');await sleep(1500);
  const hb=await health(ws1);
  check('등산 나가서 혼자 걷기 → 서버 인원 1',hb.servers.hiking[0].count===1&&await B.evaluate(()=>!window.hiking.multi()),{servers:hb.servers});
  out.keep={A};
 }
 // ── ② 흡연장 두 브라우저
 {
  const C=await open('smoking',{query:SQ(ws1),nickname:'미나'});
  await rowIs(C,'0 / 30명');const c0=await readPick(C);
  check('흡연장 창(로딩 뒤): 0/30명·전체에는 등산 1명',c0.rows[0].name==='옥상 1서버'&&c0.here==='0'&&c0.total==='1'&&c0.solo.includes('혼자 피우기'),c0);
  await shot(C,'05-흡연장-창-처음');
  await choose(C,'미나');await C.waitForFunction(()=>window.lounge.multi.state==='online',null,{timeout:15000});
  const D=await open('smoking',{query:SQ(ws1),nickname:'지훈'});
  await rowIs(D,'1 / 30명');const d1=await readPick(D);
  check('흡연장 창: 1/30명·전체 2',d1.here==='1'&&d1.total==='2',d1);
  await choose(D,'지훈');await D.waitForFunction(()=>window.lounge.multi.state==='online',null,{timeout:15000});
  await C.waitForFunction(()=>window.lounge.multi.people().some(p=>p.name==='지훈'),null,{timeout:15000});
  const pc=await C.evaluate(()=>window.lounge.multi.people().map(p=>p.name)),pd=await D.evaluate(()=>window.lounge.multi.people().map(p=>p.name));
  const wc=await C.evaluate(()=>window.__wsIn.find(m=>m.t==='welcome')),wd=await D.evaluate(()=>window.__wsIn.find(m=>m.t==='welcome'));
  check('흡연장 같은 서버·서로 보임',wc.server==='1'&&wd.server==='1'&&pc.includes('지훈')&&pd.includes('미나'),{C:pc,D:pd,welcome:[wc,wd]});
  await C.click('.lg-mp-btn');await rowIs(C,'2 / 30명',9000);const c2=await readPick(C);
  check('흡연장 👥로 다시 연 창: 2/30명·지금 여기',c2.rows[0].tag==='지금 여기'&&c2.here==='2'&&c2.total==='3'&&c2.solo.includes('나가서 혼자 피우기'),c2);
  await shot(C,'06-흡연장-👥에서-다시연-창-2명');
  await C.click('.sp-wrap:not([hidden]) .sp-x');
  await C.evaluate(()=>{const f=document.querySelector('.lg-form'),i=f.querySelector('input');document.querySelector('.lg-chat')?.classList.add('open');i.value='옥상 1서버 반가워요';f.requestSubmit();});
  await D.waitForFunction(()=>window.__ev.some(e=>e.type==='lounge:chat'&&e.remote&&e.text==='옥상 1서버 반가워요'),null,{timeout:8000}).catch(()=>{});
  const cd=await D.evaluate(()=>window.__ev.filter(e=>e.type==='lounge:chat'&&e.remote));
  check('흡연장 채팅',cd.some(e=>e.text==='옥상 1서버 반가워요'),{D받음:cd});
  await sleep(1200);await shot(D,'07-흡연장-D화면');
 }
 // ── ③ 정원 2 서버
 {
  const raw=[];const hello=(room,exp='hiking')=>new Promise(ok=>{const w=new WebSocket(ws2);raw.push(w);w.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='welcome'||m.t==='full')ok(m);};w.onopen=()=>w.send(JSON.stringify({t:'hello',exp,room,name:'시험'}));});
  const r1=await hello('관악산-1'),r2=await hello('관악산-1'),r3=await hello('관악산-1');
  check('정원 2: 3번째 접속은 full 거절',r1.t==='welcome'&&r2.t==='welcome'&&r3.t==='full',{r1:r1.t,r2:r2.t,r3});
  const E=await open('hiking',{query:HQ(ws2),nickname:'셋째'});
  await rowIs(E,'2 / 2명');const e2=await readPick(E);
  check('정원 2: 창에 꽉 참·고를 수 없음',e2.rows[0].tag==='꽉 참'&&e2.rows[0].disabled&&e2.rows[0].state==='full',e2);
  check('서버 셋(11-13): 1서버가 차도 2·3서버는 열려 있음',e2.rows.length===3&&e2.rows.map(r=>r.name).join()==='관악산 1서버,관악산 2서버,관악산 3서버'&&!e2.rows[1].disabled&&!e2.rows[2].disabled&&e2.rows[1].n==='0 / 2명',e2.rows);
  await shot(E,'08-정원2-꽉참');
  // 창을 연 사이 꽉 참: 한 명 나가 1/2가 보일 때 다른 사람이 먼저 들어오고, 그다음 고르면 '방금 꽉 찼어요'
  raw[0].close();await rowIs(E,'1 / 2명',9000);
  // 닉네임을 먼저 넣고, 다른 사람이 들어온 직후 5초 갱신 전에 바로 누른다(갱신이 먼저 오면 줄이 꽉 참으로 바뀌어 못 누름)
  await E.fill('.sp-wrap:not([hidden]) input','셋째');
  const r4=await hello('관악산-1');
  await E.evaluate(()=>document.querySelector('.sp-wrap:not([hidden]) .sp-row')?.click());
  await waitPick(E,"return w.querySelector('.sp-note').textContent.includes('방금 꽉 찼어요')",null,180000);
  const e3=await readPick(E);
  check('창을 연 사이 꽉 참 → 방금 꽉 찼어요·다시 고르기',r4.t==='welcome'&&e3.note.includes('방금 꽉 찼어요')&&e3.rows[0].n==='2 / 2명'&&e3.rows[0].disabled,e3);
  await shot(E,'09-방금-꽉-찼어요');
  const solo=await E.evaluate(()=>!window.hiking.multi());
  const hs=await health(ws2);check('full 뒤 다시 시도 안 함(서버 인원 그대로 2)',solo&&hs.servers.hiking[0].count===2,{multi없음:solo,servers:hs.servers});
  // 흡연장도 같은 표시
  await hello('옥상-1','smoking');await hello('옥상-1','smoking');
  const F=await open('smoking',{query:SQ(ws2),nickname:'넷째'});await rowIs(F,'2 / 2명');const f2=await readPick(F);
  check('흡연장 정원 2: 꽉 참',f2.rows[0].tag==='꽉 참'&&f2.rows[0].disabled,f2);
  const r5=await hello('관악산-2'),r6=await hello('관악산-3');
  check('2·3서버로 들어가면 각자 다른 방',r5.t==='welcome'&&r5.server==='2'&&r5.room==='관악산-2'&&r6.server==='3'&&r6.room==='관악산-3',{r5,r6});
  for(const w of raw)w.close();
 }
 // ── ④ 흐름·옛 주소·연결 실패
 {
  const G=await open('hiking',{query:`pick=on&${HQ(ws1)}`,nickname:'순서',wait:'none'});
  await G.waitForSelector('[data-pk-go]',{timeout:60000});const before=await G.evaluate(()=>!!document.querySelector('.sp-wrap:not([hidden])'));
  await G.click('[data-pk-go]');await G.waitForSelector('.sp-wrap:not([hidden]) .sp-row',{timeout:10000});
  const started=await G.evaluate(()=>!!window.hiking?.started);
  check('산 고르기 → 서버 고르기 순서(고르기 전에는 출발 안 함)',!before&&!started,{산고르기때창:before,서버창뜬뒤출발:started});
  await G.click('.sp-wrap:not([hidden]) .sp-solo');await G.waitForFunction(()=>window.hiking?.started,null,{timeout:180000});
  check('혼자 걷기 → 출발·연결 없음',await G.evaluate(()=>!window.hiking.multi()),{});
  const H=await open('hiking',{query:`multi=${encodeURIComponent('관악산-1')}&server=${encodeURIComponent(ws1)}&start=entrance&time=13:00&quality=balanced`,nickname:'옛주소',wait:'none'});
  await H.waitForFunction(()=>window.hiking?.started&&window.hiking.multi?.()?.status==='online',null,{timeout:180000});
  const hw=await H.evaluate(()=>({pick:!!document.querySelector('.sp-wrap:not([hidden])'),wel:window.__wsIn.find(m=>m.t==='welcome')}));
  check('옛 주소 ?multi=관악산-1: 창 없이 1서버',!hw.pick&&hw.wel?.server==='1',hw);
  const I=await open('smoking',{query:`multi=${encodeURIComponent('옥상-1')}&server=${encodeURIComponent(ws1)}&time=day`,nickname:'옛손님',wait:'none'});
  await I.waitForFunction(()=>window.lounge?.multi?.state==='online',null,{timeout:30000});
  const iw=await I.evaluate(()=>({pick:!!document.querySelector('.sp-wrap:not([hidden])'),wel:window.__wsIn.find(m=>m.t==='welcome')}));
  check('옛 주소 ?multi=옥상-1: 창 없이 1서버',!iw.pick&&iw.wel?.server==='1',iw);
  const J=await open('hiking',{query:`webdrivercheck=1&server=${encodeURIComponent(ws1)}&start=entrance&quality=balanced`,nickname:'점검',wait:'none'});
  await J.waitForFunction(()=>window.hiking?.started,null,{timeout:180000});
  check('점검 스크립트(webdriver)는 창을 건너뜀',await J.evaluate(()=>!document.querySelector('.sp-wrap:not([hidden])')),{});
  const K=await open('hiking',{query:HQ('ws://127.0.0.1:9'),nickname:'끊김'});
  await waitPick(K,"return w.dataset.net==='error'",null,10000);const k=await readPick(K);
  check('서버에 연결 안 되면: 서버에 연결할 수 없어요·혼자 걷기만',k.note.includes('서버에 연결할 수 없어요')&&k.rows.length===1&&k.rows[0].state==='down',k);
  await shot(K,'10-서버-연결-안됨');
  const L=await open('hiking',{query:'serverpick=on&server=off&start=entrance&quality=balanced',nickname:'로컬'});const l=await readPick(L);
  check('?server=off: 서버 주소 없음 → 연결할 수 없어요 카드·혼자만',l.note.includes('서버 주소가 없어요')&&l.rows.length===1&&l.rows[0].state==='down'&&l.sumHidden,l);
 }
 // ── ⑤ 세 화면 크기
 {
  const sizes=[['세로',{width:390,height:844},true],['가로',{width:844,height:390},true],['PC',{width:1920,height:1080},false]];
  const lay={};
  for(const exp of ['hiking','smoking'])for(const [label,vp,touch] of sizes){
   const P=await open(exp,{query:exp==='hiking'?HQ(ws1):SQ(ws1),viewport:vp,touch,nickname:'크기'});
   await waitPick(P,"return w.dataset.net==='ok'",null,10000);
   const L2=await layout(P);lay[`${exp}-${label}`]=L2;
   check(`${exp} ${label} ${vp.width}×${vp.height}: 44px 이상·화면 안`,!L2.missing&&!L2.small.length&&!L2.outside.length,L2);
   await shot(P,`11-${exp}-${label}-${vp.width}x${vp.height}`);
   await P.context().close();
  }
  // 밤 톤(등산 세로)
  const N=await open('hiking',{query:HQ(ws1).replace('time=13:00','time=22:00'),viewport:{width:390,height:844},touch:true,nickname:'밤'});
  await waitPick(N,"return w.dataset.net==='ok'",null,30000);
  const night=await N.evaluate(()=>({hud:document.documentElement.dataset.hudTime,bg:getComputedStyle(document.querySelector('.sp-card')).backgroundColor}));
  log('밤 톤',night);await shot(N,'12-hiking-밤-세로');
 }
}catch(e){fail=true;check('단계 오류',false,{message:e.message,stack:e.stack?.split('\n').slice(0,3)});}

log('오류',{errors:out.errors});
if(out.errors.length)check('페이지 오류 없음',false,{errors:out.errors});
delete out.keep;out.passed=!fail;
writeFileSync(`${dir}/report.json`,JSON.stringify(out,null,2));
for(const c of ctxs)await c.close().catch(()=>{});
await browser.close();await srv.close();await small.close();await vite?.close();
console.log(fail?'결과: 실패':'결과: 모두 통과');
process.exit(fail?1:0);
