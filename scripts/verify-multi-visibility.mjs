// 함께 걷기 '상대가 들어오면 먼저 있던 사람이 안 보임' 재현·회귀 점검(2026-11-08). 등산·흡연장 둘 다.
// 로컬 서버(MULTI_PORT 기본 8791)와 vite(PORT 기본 5201)를 이 스크립트가 띄운다. 이미 떠 있는 5173·8787은 건드리지 않는다.
// 경우: ① A가 먼저 들어와 가만히 → B 입장  ② A 탭 숨김 30초 뒤 B 입장(A는 계속 숨김) → A 돌아옴
//       ③ A 소켓 끊김 → resume(보이는 탭) / ③b 숨은 탭에서 끊김 → resume  ④ A ?multi=(빈 값) · B 서버 고르기(관악산-1/옥상-1)
//       ⑤ 서버 주소 없음(BroadcastChannel): 같은 브라우저 두 탭, A 가만히 → B / A 숨김 → B, ⑤b 서로 다른 기기(컨텍스트 2개)
//       ⑥ 같은 브라우저 두 탭 + 서버, 같은 이름, 한 탭은 숨김
// 탭 숨김은 페이지 안에서 흉내 낸다: requestAnimationFrame을 멈추고 document.hidden=true·visibilitychange(실제 크롬 백그라운드 탭처럼 그리기 루프가 멈춤).
//   node scripts/verify-multi-visibility.mjs [hiking|smoking] [경우…]  → artifacts/multi-visibility-2026-11-08/<라벨>.json
//   LABEL=before|after 로 결과 파일 이름을 나눈다. 실패가 있으면 종료 코드 1.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-visibility-2026-11-08';mkdirSync(dir,{recursive:true});
const args=process.argv.slice(2),exps=args.filter(a=>a==='hiking'||a==='smoking'),only=args.filter(a=>!exps.includes(a));
const EXPS=exps.length?exps:['hiking','smoking'],label=process.env.LABEL||'run',HIDE_MS=Number(process.env.HIDE_MS??30000);
const multiPort=Number(process.env.MULTI_PORT??8791),port=Number(process.env.PORT??5201);
const {createServer}=await import('vite');
const vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const pageUrl=`http://127.0.0.1:${port}`,wsUrl=`ws://127.0.0.1:${multiPort}`;
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data`},{quiet:true});await srv.ready;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out={at:new Date().toISOString(),label,hideMs:HIDE_MS,cases:[],errors:[]};let fail=false;

// 페이지마다: 탭 숨김 흉내(__bg.hide/show)와 소켓 목록(__socks, 끊기 시험용)
function harness(){
 const raf=window.requestAnimationFrame.bind(window),bg={on:false,q:[]};window.__bg=bg;
 window.requestAnimationFrame=cb=>{if(bg.on){bg.q.push(cb);return -1;}return raf(cb);};
 const D=Document.prototype,hd=Object.getOwnPropertyDescriptor(D,'hidden'),vs=Object.getOwnPropertyDescriptor(D,'visibilityState');
 Object.defineProperty(document,'hidden',{get(){return bg.on||hd.get.call(document);},configurable:true});
 Object.defineProperty(document,'visibilityState',{get(){return bg.on?'hidden':vs.get.call(document);},configurable:true});
 bg.hide=()=>{bg.on=true;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('blur'));};
 bg.show=()=>{bg.on=false;document.dispatchEvent(new Event('visibilitychange'));for(const cb of bg.q.splice(0))raf(cb);};
 window.__socks=[];const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);window.__socks.push(this);}};
 // 함께 걷기 서버 소켓만 끊는다(vite 개발 서버 HMR 소켓 ?token=…을 끊으면 페이지가 통째로 다시 읽혀 resume 시험이 안 됨)
 window.__drop=()=>{for(const s of window.__socks)if(s.readyState<2&&!/[?&]token=/.test(s.url))s.close();};
}
const ctxs=[];
async function newCtx(exp){
 const ctx=await browser.newContext({viewport:{width:1100,height:700},deviceScaleFactor:1});ctxs.push(ctx);
 await ctx.addInitScript(()=>{if(!sessionStorage.getItem('__init')){sessionStorage.setItem('__init','1');}localStorage.setItem('gwanak-sound-enabled','false');
  localStorage.setItem('online-smoking',JSON.stringify({nickname:'',status:'quit',outfit:'shirt',seenIntro:true,muted:true,quitDate:'2026-11-01'}));});
 await ctx.addInitScript(harness);
 return ctx;
}
// query: 'multi=…&server=…&name=…' 같은 꼬리(체험 공통 부분은 여기서 붙인다)
async function open(ctx,exp,name,query){
 const p=await ctx.newPage();p.label=`${exp}:${name}`;p.exp=exp;
 p.on('pageerror',e=>out.errors.push(`${p.label}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket|favicon|ERR_CONNECTION/.test(m.text()))out.errors.push(`${p.label}: ${m.text()}`);});
 if(exp==='hiking'){
  await p.goto(`${pageUrl}/hiking/?${query}&start=entrance&time=13:00&weather=clear&quality=low`);
  await p.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});
 }else{
  await p.goto(`${pageUrl}/smoking/?${query}&time=day`);
  await p.waitForFunction(()=>!!window.lounge,null,{timeout:180000});
 }
 return p;
}
const online=p=>p.waitForFunction(exp=>exp==='hiking'?['online'].includes(window.hiking.multi?.()?.status):window.lounge.multi.state==='online',p.exp,{timeout:60000,polling:200});
// 지금 화면: 내 ID·방·전송, 목록(위치 있음·그려짐), 인원 표시 글
async function look(p){
 return p.evaluate(exp=>{
  if(exp==='hiking'){const i=window.hiking.multi?.();if(!i)return null;
   return {id:i.id,room:i.room,status:i.status,transport:i.transport,roster:i.roster.map(r=>({id:r.id,name:r.name,pos:r.x!=null,drawn:!!r.model})),capsules:i.stats.capsules,
    count:document.querySelector('.multi-count')?.textContent??'',chip:[document.querySelector('.me-chip-t')?.textContent,document.querySelector('.me-chip-s')?.textContent].filter(Boolean).join(' · '),
    note:document.querySelector('.multi-note')?.textContent??'',warn:document.querySelector('.me-chip')?.dataset.tone??''};}
  const s=window.lounge.multi.status();
  return {id:s.id,room:s.room,status:s.state,transport:s.transport,roster:s.people.map(r=>({id:r.id,name:r.name,pos:r.x!=null,drawn:!!(r.avatar&&r.shown)})),
   count:'',chip:document.querySelector('.lg-mp-btn')?.getAttribute('aria-label')??'',warn:document.querySelector('.lg-mp-btn')?.dataset.tone??''};
 },p.exp);
}
// a가 b를 보는가: 목록에 있고 위치가 있고 그려짐(모델 또는 캡슐)
const sees=(a,b)=>{const r=a?.roster.find(x=>x.id===b?.id);return !!r&&r.pos&&(r.drawn||(a.capsules??0)>0);};
const countOk=(a,n)=>a.status!=='online'||a.transport==='local'&&a.chip===''||new RegExp(`${n}명`).test(a.chip+' '+a.count);
function judge(c,step,A,B,{want=true,n=2}={}){
 const ab=sees(A,B),ba=sees(B,A),ok=want?ab&&ba&&countOk(A,n)&&countOk(B,n):!ab&&!ba;
 c.samples.push({step,ok,AseesB:ab,BseesA:ba,A,B});if(!ok)c.ok=false;
 console.log(`  ${ok?'○':'✕'} ${step}: A→B ${ab?'보임':'안 보임'} · B→A ${ba?'보임':'안 보임'} · A[${A?.chip||A?.count}] B[${B?.chip||B?.count}]`);
}
const both=async(A,B)=>[await look(A),await look(B)];
const q=(exp,{room='시험방',server=true,name})=>`multi=${encodeURIComponent(room)}${server?`&server=${encodeURIComponent(wsUrl)}`:''}${name?`&name=${encodeURIComponent(name)}`:''}`;
async function closeAll(){for(const c of ctxs.splice(0))await c.close().catch(()=>{});}

const CASES={
 // ① A가 먼저 들어와 가만히 있고 B가 들어옴
 async 1(exp,c){const ca=await newCtx(exp),cb=await newCtx(exp);
  const A=await open(ca,exp,'하늘',q(exp,{name:'하늘'}));await online(A);await sleep(4000);
  const B=await open(cb,exp,'바다',q(exp,{name:'바다'}));await online(B);
  await sleep(3000);judge(c,'B 입장 3초',...await both(A,B));await sleep(7000);judge(c,'B 입장 10초',...await both(A,B));},
 // ② A 탭 숨김 30초 → B 입장(A 계속 숨김) → A 돌아옴
 async 2(exp,c){const ca=await newCtx(exp),cb=await newCtx(exp);
  const A=await open(ca,exp,'하늘',q(exp,{name:'하늘'}));await online(A);await A.evaluate(()=>window.__bg.hide());await sleep(HIDE_MS);
  const B=await open(cb,exp,'바다',q(exp,{name:'바다'}));await online(B);
  await sleep(3000);const a1=await look(A),b1=await look(B);judge(c,'A 숨김 중 B 입장 3초(B 화면)',{...a1,roster:[{id:b1.id,pos:true,drawn:true}],capsules:0,chip:'2명'},b1);
  await sleep(9000);const b2=await look(B);judge(c,'A 숨김 중 B 입장 12초(B 화면)',{...a1,roster:[{id:b2.id,pos:true,drawn:true}],chip:'2명'},b2);
  await A.evaluate(()=>window.__bg.show());await sleep(3000);judge(c,'A 돌아옴 3초',...await both(A,B));await sleep(7000);judge(c,'A 돌아옴 10초',...await both(A,B));},
 // ③ 보이는 A의 소켓이 끊겼다가 resume / ③b 숨은 A가 끊겼다가 숨은 채 resume
 async 3(exp,c){const ca=await newCtx(exp),cb=await newCtx(exp);
  const A=await open(ca,exp,'하늘',q(exp,{name:'하늘'})),B=await open(cb,exp,'바다',q(exp,{name:'바다'}));await online(A);await online(B);await sleep(3000);
  const [a0,b0]=await both(A,B);judge(c,'끊기 전',a0,b0);
  await A.evaluate(()=>window.__drop());await sleep(500);await online(A);await sleep(3000);
  const [a1,b1]=await both(A,B);judge(c,'보이는 A resume 3초',a1,b1);c.sameId=a1.id===a0.id;
  await A.evaluate(()=>window.__bg.hide());await sleep(1500);await A.evaluate(()=>window.__drop());await sleep(4000);
  const b2=await look(B),a2=await look(A);judge(c,'숨은 A resume 4초(B 화면)',{...a2,roster:[{id:b2.id,pos:true,drawn:true}],chip:'2명'},b2);
  await sleep(8000);const b3=await look(B);judge(c,'숨은 A resume 12초(B 화면)',{...a2,roster:[{id:b3.id,pos:true,drawn:true}],chip:'2명'},b3);
  c.dup=b3.roster.filter(r=>r.name==='하늘').length;
  await A.evaluate(()=>window.__bg.show());await sleep(3000);judge(c,'A 돌아옴',...await both(A,B));},
 // ④ A는 ?multi=(빈 값) 옛 링크, B는 서버 고르기(서버 줄 = 관악산-1/옥상-1)
 async 4(exp,c){const ca=await newCtx(exp),cb=await newCtx(exp);
  const A=await open(ca,exp,'하늘',`multi=&server=${encodeURIComponent(wsUrl)}&name=${encodeURIComponent('하늘')}`);await online(A);
  const B=await open(cb,exp,'바다',`server=${encodeURIComponent(wsUrl)}&serverpick=off`);
  const room=exp==='hiking'?'관악산-1':'옥상-1';
  if(exp==='hiking')await B.evaluate(r=>dispatchEvent(new CustomEvent('hiking:multi-join',{detail:{room:r,name:'바다',server:'1'}})),room);
  else await B.evaluate(r=>window.lounge.multi.join({room:r,name:'바다'}),room);
  await online(B);await sleep(4000);const [a,b]=await both(A,B);c.rooms={A:a.room,B:b.room};judge(c,'같은 방',a,b);},
 // ⑤ 서버 주소 없음(BroadcastChannel): 같은 브라우저 두 탭
 async 5(exp,c){const ca=await newCtx(exp);
  const A=await open(ca,exp,'하늘',q(exp,{server:false,name:'하늘'}));await online(A);await sleep(3000);
  const B=await open(ca,exp,'바다',q(exp,{server:false,name:'바다'}));await online(B);await sleep(3000);
  judge(c,'A 가만히 → B 입장',...await both(A,B));
  await A.evaluate(()=>window.__bg.hide());await sleep(10000);
  const b1=await look(B),a1=await look(A);judge(c,'A 숨김 10초(B 화면)',{...a1,roster:[{id:b1.id,pos:true,drawn:true}],chip:'',count:'2명'},b1);
  await A.evaluate(()=>window.__bg.show());await B.close();await A.evaluate(()=>window.__bg.hide());await sleep(HIDE_MS);
  const B2=await open(ca,exp,'바다2',q(exp,{server:false,name:'바다2'}));await online(B2);await sleep(4000);
  const b2=await look(B2),a2=await look(A);judge(c,'A 숨김 30초 뒤 B 입장 4초(B 화면)',{...a2,roster:[{id:b2.id,pos:true,drawn:true}],chip:'',count:'2명'},b2);
  await sleep(8000);const b3=await look(B2);judge(c,'A 숨김 30초 뒤 B 입장 12초(B 화면)',{...a2,roster:[{id:b3.id,pos:true,drawn:true}],chip:'',count:'2명'},b3);
  c.localNote=b3.chip||b3.note;},
 // ⑤b 서로 다른 기기(브라우저 컨텍스트 2개) + 서버 주소 없음: 이어질 수 없다 → 화면에 '이 창끼리만' 표시가 있어야 한다
 async '5b'(exp,c){const ca=await newCtx(exp),cb=await newCtx(exp);
  const A=await open(ca,exp,'하늘',q(exp,{server:false,name:'하늘'})),B=await open(cb,exp,'바다',q(exp,{server:false,name:'바다'}));await online(A);await online(B);await sleep(3000);
  const [a,b]=await both(A,B);judge(c,'기기 둘(연결 안 됨이 정상)',a,b,{want:false});
  const shown=[a,b].every(x=>/창끼리|내 컴퓨터/.test(x.chip+x.note));c.localShown=shown;c.chips=[a.chip||a.note,b.chip||b.note];if(!shown){c.ok=false;console.log('  ✕ 이 창끼리만 표시 없음',c.chips);}},
 // ⑥ 같은 브라우저 두 탭 + 서버, 같은 이름, 한 탭은 숨김(실제 브라우저는 한 창에서 한 탭만 보임)
 async 6(exp,c){const ca=await newCtx(exp);
  const A=await open(ca,exp,'같은이름A',q(exp,{name:'같은이름'}));await online(A);
  const B=await open(ca,exp,'같은이름B',q(exp,{name:'같은이름'}));await online(B);await sleep(3000);
  const [a,b]=await both(A,B);judge(c,'두 탭',a,b);c.ids=[a.id,b.id];
  await A.evaluate(()=>window.__bg.hide());await sleep(12000);const b1=await look(B),a1=await look(A);
  judge(c,'A 탭 숨김 12초(B 화면)',{...a1,roster:[{id:b1.id,pos:true,drawn:true}],chip:'2명'},b1);
  await A.evaluate(()=>window.__bg.show());await sleep(3000);judge(c,'A 탭 다시 봄',...await both(A,B));}
};
const order=only.length?only:Object.keys(CASES);
for(const exp of EXPS)for(const k of order){
 const c={exp,case:k,ok:true,samples:[]};out.cases.push(c);console.log(`[${exp}] 경우 ${k}`);
 const t0=Date.now();
 try{await CASES[k](exp,c);}catch(e){c.ok=false;c.error=String(e.message).slice(0,400);console.log('  오류',c.error);}
 c.seconds=Math.round((Date.now()-t0)/1000);if(!c.ok)fail=true;
 await closeAll();writeFileSync(`${dir}/${label}.json`,JSON.stringify(out,null,1));
}
out.summary=out.cases.map(c=>`${c.exp} ${c.case}: ${c.ok?'통과':'실패'}`);
writeFileSync(`${dir}/${label}.json`,JSON.stringify(out,null,1));
console.log(out.summary.join('\n'));if(out.errors.length)console.log('페이지 오류',out.errors.slice(0,10));
await browser.close();await srv.close();await vite.close();
process.exit(fail?1:0);
