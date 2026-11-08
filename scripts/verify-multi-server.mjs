// 함께 걷기 서버 확인(2026-11-08): 서로 다른 브라우저 컨텍스트(BroadcastChannel로는 이어질 수 없음)에서 실제 WebSocket 서버로 붙는다.
// 확인: 서로 보임·이름표, 인사·손 흔들기, 같이 셀카, 동물 놀람 동기화, HUD 이벤트로 중간 참가·나가기(주소에 multi 없이),
//       서버를 끄면 '다시 연결 중'이 되고 혼자 걷기는 계속됨 → 다시 켜면 돌아옴, 휴대폰은 모델 2명.
// 준비: dev 서버(PORT, 기본 5197). 함께 걷기 서버는 이 스크립트가 직접 띄운다(MULTI_PORT, 기본 8790).
//   PORT=5197 node scripts/verify-multi-server.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium,devices} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const port=process.env.PORT??5197,multiPort=Number(process.env.MULTI_PORT??8790),dir='artifacts/multi-server';mkdirSync(dir,{recursive:true});
const serverEnv={PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data`,ALLOWED_ORIGINS:`http://127.0.0.1:${port}`};
let srv=startServer(serverEnv,{quiet:true});await srv.ready;
const wsUrl=`ws://127.0.0.1:${multiPort}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={steps:[],errors:[]},log=(k,v)=>{out.steps.push({k,...v});console.log(k,JSON.stringify(v).slice(0,500));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(name,{multi=true,ctxOpts={viewport:{width:1100,height:680},deviceScaleFactor:1},extra=''}={}){
 const ctx=await browser.newContext(ctxOpts);   // 컨텍스트마다 저장소가 따로라 BroadcastChannel로는 이어지지 않는다
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const p=await ctx.newPage();p.on('pageerror',e=>out.errors.push(`${name}: ${e.message}`));p.on('console',m=>{if(m.type()==='error'&&!/WebSocket connection/.test(m.text()))out.errors.push(`${name}: ${m.text()}`);});
 await p.addInitScript(()=>{window.__multiStatus=[];addEventListener('hiking:multi-status',e=>window.__multiStatus.push(e.detail));});
 const q=multi?`multi=verify-srv&name=${encodeURIComponent(name)}&`:'';
 await p.goto(`http://127.0.0.1:${port}/hiking/?${q}server=${encodeURIComponent(wsUrl)}&start=entrance&time=13:00&weather=clear&quality=balanced${extra}`);
 await p.waitForFunction(m=>window.hiking?.started&&(!m||window.hiking?.multi?.()),multi,{timeout:180000});
 p.ctx=ctx;return p;
}
const info=p=>p.evaluate(()=>hiking.multi());
const pos=p=>p.evaluate(()=>hiking.position());
const shot=async(p,name)=>{await (await waitChunks(p)).screenshot({path:`${dir}/${name}.png`});};
const waitFor=(p,fn,arg,ms=15000)=>p.waitForFunction(fn,arg,{timeout:ms,polling:100});

const A=await open('하늘'),B=await open('바다');
await waitFor(A,()=>hiking.multi().status==='online'&&hiking.multi().roster.length>=1);
await waitFor(B,()=>hiking.multi().status==='online'&&hiking.multi().roster.length>=1);
// 배치: 바다 앞 4m에 하늘(마주 봄)
const pb=await pos(B),fx=-Math.sin(pb.heading),fz=-Math.cos(pb.heading);
await A.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb.x+fx*4,z:pb.z+fz*4,h:pb.heading+Math.PI});
await sleep(2500);
const ia=await info(A),ib=await info(B);
log('서로 보임',{A:{transport:ia.transport,status:ia.status,room:ia.room,id:ia.id,본사람:ia.roster.map(r=>({name:r.name,model:r.model}))},B:{transport:ib.transport,status:ib.status,본사람:ib.roster.map(r=>({name:r.name,model:r.model,x:r.x?.toFixed(1),z:r.z?.toFixed(1)}))},A실제:await pos(A),서버:srv.rooms.info()});
await shot(B,'01-B화면-하늘-이름표');await shot(A,'01-A화면-바다');
// 걷기: 하늘이 걸으면 바다 화면에서 따라온다
await A.keyboard.down('w');const walk=[];
for(let i=0;i<5;i++){await sleep(500);const [a,r]=await Promise.all([pos(A),B.evaluate(()=>hiking.multi().roster[0])]);walk.push({오차m:+Math.hypot(a.x-r.x,a.z-r.z).toFixed(2),moving:r.moving});}
await A.keyboard.up('w');log('걷기',{walk});
const pb2=await pos(B);await A.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb2.x-Math.sin(pb2.heading)*3.5,z:pb2.z-Math.cos(pb2.heading)*3.5,h:pb2.heading+Math.PI});await sleep(1500);
// 인사·손 흔들기(패널 버튼과 같은 함수)
await A.evaluate(()=>hiking.multiApi.doGesture('hello'));await waitFor(B,()=>hiking.multi().roster[0]?.gesture==='hello');
log('인사',{B가본:(await B.evaluate(()=>hiking.multi().roster[0])).gesture});await shot(B,'02-인사-B화면');
await sleep(3300);
await A.evaluate(()=>hiking.multiApi.doGesture('wave'));await waitFor(B,()=>hiking.multi().roster[0]?.gesture==='wave');
log('손흔들기',{B가본:(await B.evaluate(()=>hiking.multi().roster[0])).gesture});await shot(B,'03-손흔들기-B화면');
await sleep(3000);
// 같이 셀카: 하늘 요청 → 바다 수락
await A.evaluate(()=>hiking.multiApi.selfieKey());await waitFor(B,()=>!!hiking.multi().social.incoming);
await shot(B,'04-셀카요청-B화면');
await B.evaluate(()=>hiking.multiApi.selfieKey());await waitFor(A,()=>hiking.multi().social.session?.role==='requester');
const sa=await A.evaluate(()=>hiking.multi().social.session),sb=await B.evaluate(()=>hiking.multi().social.session);
log('같이셀카',{A:sa?.role,B:sb?.role});await sleep(1200);await shot(A,'05-같이셀카-A화면');await shot(B,'05-같이셀카-B화면');
await waitFor(A,()=>!!hiking.lastPhoto,null,8000).catch(()=>{});
log('셀카끝',{A사진:!!(await A.evaluate(()=>hiking.lastPhoto)),A로그:(await A.evaluate(()=>hiking.multi().social.log)).map(l=>l.type)});
await waitFor(A,()=>!hiking.multi().social.session,null,10000);

// ── 동물 놀람 동기화: 같은 출현 동물(토끼·까치) 곁으로 둘 다 옮기고, 하늘이 다가가 놀라게 한다 → 바다 화면에서도 같은 동물이 달아남
async function animalSync(){
 const list=await A.evaluate(()=>hiking.trail.spawns().list.filter(s=>(s.kind==='hare'||s.kind==='magpie')&&s.m!=null&&!s.gone));
 const seen=(p,id)=>p.evaluate(id=>hiking.trail.status().animals.find(a=>a.id===id),id);
 const tried=[];
 for(const sp of list.slice(0,10)){
  // 바다는 동물에서 9~25m(놀라지 않을 거리), 하늘은 35m쯤 떨어진 곳에서 시작
  let bOk=false;
  for(const [dx,dz] of [[12,0],[-12,0],[0,12],[0,-12],[9,9],[-9,-9]]){
   await B.evaluate(({x,z})=>hiking.multiApi.teleport({zone:'route',x,z,heading:0}),{x:sp.x+dx,z:sp.z+dz});
   const b=await pos(B),d=Math.hypot(b.x-sp.x,b.z-sp.z);if(d>=9&&d<=25){bOk=true;break;}
  }
  if(!bOk){tried.push({id:sp.id,why:'바다 자리'});continue;}
  await A.evaluate(({x,z})=>hiking.multiApi.teleport({zone:'route',x,z,heading:0}),{x:sp.x-25,z:sp.z-25});
  await sleep(3000);
  const a=await seen(A,sp.id),b=await seen(B,sp.id);
  if(!a||!b||a.state!=='wander'||b.state!=='wander'){tried.push({id:sp.id,A:a?.state??null,B:b?.state??null});continue;}
  await A.evaluate(p=>hiking.multiApi.teleport({zone:'route',x:p.x+.4,z:p.z+.4,heading:0}),a);
  await waitFor(B,id=>hiking.trail.remoteAnimals().some(r=>r.id===id),sp.id,6000).catch(()=>{});
  await sleep(400);
  const ra=await seen(A,sp.id),rb=await seen(B,sp.id),remote=await B.evaluate(()=>hiking.trail.remoteAnimals());
  await shot(B,'06-동물놀람-B화면');
  const away=s=>['flee','fly','gone'].includes(s);
  return {spawn:sp,A상태:ra?.state,B상태:rb?.state,B받음:remote.at(-1)??null,같은반응:!!ra&&!!rb&&away(ra.state)&&away(rb.state),앞서시도:tried};
 }
 return {skip:'둘 다 볼 수 있는 토끼·까치를 찾지 못함',후보:list.length,tried};
}
log('동물놀람',await animalSync());

// ── HUD 이벤트로 중간 참가·나가기(주소에 multi 없음, 서버 주소만): 산디자인 화면이 보낼 hiking:multi-join / hiking:multi-leave
const C=await open('산들',{multi:false});
const before=await C.evaluate(()=>({multi:hiking.multi(),server:hiking.multiServer}));
await C.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:multi-join',{detail:{room:'verify-srv',name:'산들'}})));
await waitFor(C,()=>hiking.multi()?.status==='online'&&hiking.multi().roster.length>=2,null,60000);
const cJoin=await info(C);
await waitFor(A,()=>hiking.multi().roster.some(r=>r.name==='산들'));
log('중간참가',{전:before,후:{room:cJoin.room,status:cJoin.status,transport:cJoin.transport,본사람:cJoin.roster.map(r=>r.name)},상태이벤트:await C.evaluate(()=>window.__multiStatus.map(s=>s.state+':'+s.count+':'+s.transport))});
await C.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:multi-leave')));
await waitFor(A,()=>!hiking.multi().roster.some(r=>r.name==='산들'),null,8000);
log('나가기',{C:await C.evaluate(()=>({multi:hiking.multi(),panel:!!document.querySelector('.multi-panel'),last:window.__multiStatus.at(-1)})),A가본사람:(await info(A)).roster.map(r=>r.name)});
await C.ctx.close();

// ── 휴대폰(세로·가로): 모델 2명 상한, 패널·상태 줄 캡처
const phone=devices['iPhone 13'];
// 하늘·바다를 광장 처음 자리로 되돌리고(마주 봄), 휴대폰은 바다 뒤 5m에서 같은 쪽을 본다
await B.evaluate(p=>hiking.multiApi.teleport({zone:'plaza',x:p.x,z:p.z,heading:p.heading}),pb);
await A.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb.x+fx*3.5,z:pb.z+fz*3.5,h:pb.heading+Math.PI});
const P=await open('폰세로',{ctxOpts:{...phone,viewport:{width:390,height:844},deviceScaleFactor:1}});
await waitFor(P,()=>hiking.multi().status==='online'&&hiking.multi().roster.length>=2,null,60000);
await P.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb.x-fx*5,z:pb.z-fz*5,h:pb.heading});await sleep(2500);
log('휴대폰',{fullCap:(await info(P)).fullCap,pool:(await info(P)).pool});
await shot(P,'07-휴대폰-세로');
await P.setViewportSize({width:844,height:390});await sleep(1200);await shot(P,'08-휴대폰-가로');
await P.ctx.close();

// ── 서버 끔 → 다시 연결 중, 혼자 걷기 유지 → 다시 켬 → 연결됨
await srv.close();
await waitFor(A,()=>hiking.multi().status==='reconnecting');
const p0=await pos(A);await A.keyboard.down('w');await sleep(1500);await A.keyboard.up('w');const p1=await pos(A);
const note=await A.evaluate(()=>document.querySelector('.multi-note')?.textContent);
log('서버꺼짐',{A상태:(await info(A)).status,패널문구:note,걸은거리m:+Math.hypot(p1.x-p0.x,p1.z-p0.z).toFixed(2),상태이벤트:await A.evaluate(()=>window.__multiStatus.slice(-2))});
await A.setViewportSize({width:1920,height:1080});await sleep(800);await shot(A,'09-서버꺼짐-다시연결중-PC');
srv=startServer(serverEnv,{quiet:true});await srv.ready;
await waitFor(A,()=>hiking.multi().status==='online'&&hiking.multi().roster.length>=1,null,30000);
await waitFor(B,()=>hiking.multi().status==='online'&&hiking.multi().roster.length>=1,null,30000);
log('서버다시켬',{A:(await info(A)).status,A본사람:(await info(A)).roster.map(r=>r.name),B본사람:(await info(B)).roster.map(r=>r.name)});
await sleep(1000);await shot(A,'10-다시연결됨-PC');
log('서버통계',srv.rooms.info());
log('오류',{errors:out.errors});
writeFileSync(`${dir}/verify.json`,JSON.stringify(out,null,2));
await A.ctx.close();await B.ctx.close();await browser.close();await srv.close();
