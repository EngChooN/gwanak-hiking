// 흡연장 릴스 장면 녹화(연개발, 2026-11-11). scripts/promo/shots.json(연공간 촬영값)을 check-shots.mjs와 같은 순서·시계로 돌리면서
// 화면(CDP 화면 중계 프레임, 1080×1920 JPEG)과 게임 소리(AudioContext 출력 → MediaRecorder)를 장면마다 함께 담는다. 게임 코드는 건드리지 않는다.
//   node scripts/promo/record-reels-smoking.mjs [장면키…]      예) node scripts/promo/record-reels-smoking.mjs 0 5a 7
// 개발 서버: BASE_URL(기본 http://127.0.0.1:5173). 꺼져 있으면 이 스크립트가 vite를 그 포트로 잠시 켰다가 끈다.
// 같이 피우기(4·7)는 로컬 멀티 서버를 shots.json multi.port(127.0.0.1)에 직접 띄운다. 공개 터널은 쓰지 않는다.
// 결과: artifacts/reels-smoking-2026-11-11/raw/<키>/NNNNN.jpg(시점 0 기준 ms는 <키>.json frames), <키>.webm(소리), <키>.json
//
// 화면 크기: 게임이 보는 화면은 shots.json viewport(405×720, 배율 2.6667, 3D는 휴대폰처럼 DPR 1.5 = 607×1080)와 같다.
//  다만 playwright recordVideo·CDP 화면 중계는 배율과 상관없이 CSS 픽셀(405×720)로 줄여 내보낸다(recordVideo는 소리도 없음).
//  그래서 창은 1080×1920·배율 1로 열고, 녹화 브라우저 안에서만 viewport 메타 값을 width=405·확대 2.6667로 바꾸고 devicePixelRatio를 2.6667로 알려 준다.
//  게임 입장에서는 innerWidth 405·innerHeight 720·DPR 2.6667 그대로이고, 화면 중계는 글자까지 선명한 1080×1920 프레임을 60fps로 준다.
//  (게임 코드·파일은 고치지 않는다. 메타 값은 이 녹화 브라우저 안에서만 바뀐다.)
// 편집(edit-reels.mjs)은 프레임 시각으로 30fps를 뽑는다.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';

const SH=JSON.parse(readFileSync(new URL('./shots.json',import.meta.url),'utf8'));
const base=process.env.BASE_URL??'http://127.0.0.1:5173',out='artifacts/reels-smoking-2026-11-11/raw';
const want=process.argv.slice(2),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const shots=SH.shots.filter(s=>!want.length||want.includes(s.key));
mkdirSync(out,{recursive:true});

// 녹화에서만 더하는 화면 연출(게임 코드 아님, 이 페이지에만 style을 넣음).
const EXTRA={
 // 장면 8: 금연 수첩이 화면 위 30~490px(인스타 위 가림 220px)에 걸려 도장 윗부분이 가려진다 → 녹화 화면에서만 수첩을 84 CSS px(=224px) 내린다.
 '8':{prep:"{const s=document.createElement('style');s.textContent='.lg-note{transform:translateY(84px)}';document.head.appendChild(s);}",
  tailMs:5000}, // 엔딩 카드 밑에 깔 옥상 바람 소리를 위해 클립 뒤로 5초 더 녹화
};
const LEAD_MS=400; // 시점 0보다 이만큼 앞 프레임부터 남긴다(첫 프레임 보장)
// 화면에 보이면 안 되는 글자(11-13 점검표: 담배 권유로 읽히는 말). 게임 HUD·말풍선·NPC 대사에도 있으므로 녹화 중 0.1초마다 화면에 실제로 보이는 글자를 살펴 기록한다.
const BAD_TEXT=['한 대','한대'];
function watchText(words){
 window.__textHits=[];
 setInterval(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),r=document.createRange();
  for(let n=w.nextNode();n;n=w.nextNode()){const word=words.find(x=>n.data.includes(x));if(!word)continue;
   const el=n.parentElement;if(!el?.checkVisibility?.({opacityProperty:true,visibilityProperty:true}))continue;
   r.selectNodeContents(n);const b=r.getBoundingClientRect();if(b.width<1||b.height<1||b.right<0||b.bottom<0||b.left>innerWidth||b.top>innerHeight)continue;
   window.__textHits.push({at:Date.now(),word,text:n.data.trim().slice(0,40)});}},100);
}

// 게임 소리 받기: 어느 노드든 스피커(destination)에 이어지면 같은 AudioContext의 MediaStream 출구에도 잇는다(scripts/reels-record.mjs와 같은 방법).
function audioTap(){
 const connect=AudioNode.prototype.connect;window.__taps=[];
 AudioNode.prototype.connect=function(dest,...rest){const r=connect.call(this,dest,...rest);
  if(dest instanceof AudioDestinationNode){const ctx=dest.context;if(!ctx.__tap){ctx.__tap=ctx.createMediaStreamDestination();window.__taps.push(ctx);}connect.call(this,ctx.__tap,...rest);}return r;};
 window.__recStart=()=>new Promise(res=>{const ctx=window.__taps[0];if(!ctx)return res(null);window.__chunks=[];
  const rec=new MediaRecorder(ctx.__tap.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});window.__rec=rec;
  rec.ondataavailable=e=>e.data.size&&window.__chunks.push(e.data);rec.onstart=()=>res(Date.now());rec.start(250);});
 window.__recStop=()=>new Promise(res=>{const rec=window.__rec;if(!rec)return res(null);rec.onstop=async()=>{const b=new Blob(window.__chunks,{type:'audio/webm'});const buf=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=32768)s+=String.fromCharCode(...buf.subarray(i,i+32768));res(btoa(s));};rec.stop();});
}

// 개발 서버
let vite=null;
const up=async url=>{try{return (await fetch(url,{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}};
if(!await up(`${base}${SH.path}`)){
 const port=new URL(base).port||'5173';console.log(`개발 서버 켜기(${port})`);
 vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',port,'--strictPort'],{stdio:'ignore'});
 const t=Date.now();while(!await up(`${base}${SH.path}`)){if(Date.now()-t>60000)throw new Error('개발 서버가 켜지지 않음');await sleep(500);}
}
// 로컬 멀티 서버(같이 피우기)
let srv=null;
if(shots.some(s=>s.multi)){const {startServer}=await import('../../server/multi-server.mjs');
 srv=startServer({PORT:String(SH.multi.port),HOST:'127.0.0.1',DATA_DIR:`${out}/multi-data`,ALLOWED_ORIGINS:new URL(base).origin},{quiet:!process.env.DEBUG});await srv.ready;}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const summary={};

async function openPage(ctx,shot,query,errors){
 const p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`${base}${SH.path}?${query}`.replace('{WS}',encodeURIComponent(`ws://127.0.0.1:${SH.multi.port}`)));
 await p.waitForFunction(()=>window.lounge,null,{timeout:90000});
 await p.evaluate(SH.prelude);
 return p;
}
// 시점표(actions)를 노드 쪽 시계로 실행한다(check-shots.mjs와 같음). who: 'main'(찍는 화면)·'friend'(같이 피우기 상대)
async function run(pages,actions,until,t0){
 const todo=[...actions].sort((a,b)=>a.at-b.at);
 while(true){const t=Date.now()-t0;
  while(todo.length&&todo[0].at<=t){const a=todo.shift();await pages[a.who??'main'].evaluate(a.js).catch(e=>console.log('  동작 실패',a.at,e.message));}
  if(t>=until)break;await sleep(10);}
}

async function record(shot){
 const errors=[],extra=EXTRA[shot.key]??{},vp=SH.viewport;
 const newCtx=async()=>{const W=Math.round(vp.width*vp.deviceScaleFactor),H=Math.round(vp.height*vp.deviceScaleFactor);
  const c=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:1,isMobile:vp.isMobile,hasTouch:vp.hasTouch});
  // viewport 메타는 페이지 안에서 들어오는 즉시 값만 바꾼다(응답 HTML을 route로 바꾸면 크롬이 그 페이지를 '공개 주소'로 보고
  //  127.0.0.1 멀티 서버 접속을 Local Network Access 검사로 막는다 → 같이 피우기 장면이 '연결 중'에서 멈춤).
  await c.addInitScript(C=>{new MutationObserver((l,o)=>{const m=document.querySelector('meta[name=viewport]');if(m){m.setAttribute('content',C);o.disconnect();}}).observe(document,{childList:true,subtree:true});},
   `width=${vp.width},initial-scale=${vp.deviceScaleFactor},minimum-scale=${vp.deviceScaleFactor},maximum-scale=${vp.deviceScaleFactor},user-scalable=no,viewport-fit=cover`);
  await c.addInitScript(d=>Object.defineProperty(window,'devicePixelRatio',{get:()=>d,configurable:true}),vp.deviceScaleFactor);
  await c.addInitScript(([k,v])=>{if(sessionStorage.getItem('promo-init'))return;sessionStorage.setItem('promo-init','1');localStorage.clear();localStorage.setItem(k,JSON.stringify(v));},[SH.storageKey,{...SH.profile,...(shot.profile??{})}]);
  await c.addInitScript(audioTap);await c.addInitScript(watchText,BAD_TEXT);return c;};
 const ctx=await newCtx(),pages={main:await openPage(ctx,shot,shot.query,errors)};
 // 소리 켜기: 흡연장은 첫 입력(pointerdown) 때 AudioContext를 만든다. 일찍 켜야 옥상 바람(천천히 들어옴)이 시점 0에 제 크기가 된다.
 await pages.main.evaluate(()=>dispatchEvent(new PointerEvent('pointerdown')));
 let ctx2=null;if(shot.multi){ctx2=await newCtx();pages.friend=await openPage(ctx2,shot,shot.multi.friendQuery,errors);}
 if(shot.multi)await pages.main.waitForFunction(()=>window.lounge.multi.people().some(p=>p.avatar),null,{timeout:30000}).catch(async e=>{
  for(const [who,p] of Object.entries(pages))console.log(`  ${who} 연결 상태`,JSON.stringify(await p.evaluate(()=>({status:window.lounge.multi.status?.(),people:window.lounge.multi.people().map(p=>({id:p.id,name:p.name,avatar:!!p.avatar}))})).catch(x=>x.message)));
  console.log('  페이지 오류',errors.slice(0,5).join(' / '));throw e;});
 await sleep(shot.settleMs??0);
 for(const [who,js] of Object.entries(shot.prep??{}))await pages[who].evaluate(js);
 if(extra.prep)await pages.main.evaluate(extra.prep);

 // 녹화 시작(준비 대기 중에 켜 두고, 저장할 때 시점 0 − LEAD_MS 앞은 버린다)
 const cdp=await ctx.newCDPSession(pages.main),frames=[];let live=true;
 cdp.on('Page.screencastFrame',f=>{if(live)frames.push({t:f.metadata.timestamp*1000,data:f.data});cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:88,maxWidth:1080,maxHeight:1920,everyNthFrame:1});
 const audioStart=await pages.main.evaluate(()=>window.__recStart());
 await sleep(shot.prepWaitMs??0);
 const t0=Date.now(),until=Math.max(...shot.clip.map(([a,l])=>a+l))+300+(extra.tailMs??0);
 await run(pages,shot.actions,until,t0);
 const audio=await pages.main.evaluate(()=>window.__recStop());
 // 쓰는 구간(clip) 안에 보인 금지 글자
 const hits=(await pages.main.evaluate(()=>window.__textHits).catch(()=>[])).map(h=>({...h,at:h.at-t0}));
 const textHits=hits.filter(h=>shot.clip.some(([a,l])=>h.at>=a-100&&h.at<=a+l+100));
 await cdp.send('Page.stopScreencast');await sleep(150);live=false;
 const status=await pages.main.evaluate(()=>({...window.lounge.status(),screen:[innerWidth,innerHeight,devicePixelRatio],canvas:[document.querySelector('canvas')?.width,document.querySelector('canvas')?.height],audio:window.__taps[0]?.state??null})).catch(()=>null);
 await ctx.close();await ctx2?.close();

 // 저장: 시점 0 기준 ms. 30fps 편집에 넉넉하도록 20ms보다 촘촘한 프레임은 건너뛴다.
 const dir=`${out}/${shot.key}`;rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
 const kept=[];let last=-1e9;
 for(const f of frames){const t=f.t-t0;if(t<-LEAD_MS||t-last<20)continue;last=t;
  const file=`${String(kept.length).padStart(5,'0')}.jpg`;writeFileSync(`${dir}/${file}`,Buffer.from(f.data,'base64'));kept.push(Math.round(t));}
 if(!kept.length)throw new Error(`${shot.key}: 프레임 없음`);
 if(audio)writeFileSync(`${out}/${shot.key}.webm`,Buffer.from(audio,'base64'));
 const span=(kept.at(-1)-kept[0])/1000,info={key:shot.key,scene:shot.scene,name:shot.name,clip:shot.clip,sec:shot.sec,recordedMs:until,
  frames:kept,fps:+(kept.length/(span||1)).toFixed(1),audio:audio?`${shot.key}.webm`:null,audioOffsetMs:audioStart?audioStart-t0:null,
  maxGapMs:Math.max(0,...kept.slice(1).map((t,i)=>t-kept[i])),status,errors,textHits,textHitsOutsideClip:hits.length-textHits.length};
 writeFileSync(`${out}/${shot.key}.json`,JSON.stringify(info,null,1));
 console.log(`✔ ${shot.key} ${shot.name} · 프레임 ${kept.length}개(${info.fps}fps, 가장 긴 틈 ${info.maxGapMs}ms) · 소리 ${audio?`있음(시작 ${info.audioOffsetMs}ms)`:'없음'} · 화면 ${status?.screen?.join('×')} · 3D ${status?.canvas?.join('×')} · 소리 ${status?.audio??'?'}${errors.length?' · 오류 '+errors.slice(0,3).join(' / '):''}`);
 console.log(textHits.length?`  ⚠ 쓰는 구간에 금지 글자 ${textHits.length}번: ${[...new Set(textHits.map(h=>h.text))].join(' / ')}`:`  금지 글자(${BAD_TEXT.join('·')}) 쓰는 구간에 없음${hits.length?` (구간 밖 ${hits.length}번)`:''}`);
 return info;
}

let failed=0;
try{
 for(const shot of shots){
  for(let tryNo=1;tryNo<=2;tryNo++){
   try{summary[shot.key]=await record(shot);break;}
   catch(e){console.log(`✖ ${shot.key} (${tryNo}번째): ${e.message.split('\n')[0]}`);if(tryNo===2)failed++;}
  }
 }
}finally{await browser.close();srv?.close?.();vite?.kill('SIGINT');}
const prev=(()=>{try{return JSON.parse(readFileSync(`${out}/record-summary.json`,'utf8'));}catch{return {};}})();
writeFileSync(`${out}/record-summary.json`,JSON.stringify(Object.fromEntries(Object.entries({...prev,...summary}).map(([k,v])=>[k,v.frames?.length===undefined?v:{fps:v.fps,maxGapMs:v.maxGapMs,frames:v.frames.length,audio:!!v.audio,errors:v.errors.length,textHits:v.textHits?.length??null}])),null,1));
process.exit(failed?1:0);
