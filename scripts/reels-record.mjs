// 릴스 장면 자동 녹화(docs/릴스-콘티.md·docs/릴스-장면위치.md). 휴대폰 세로 1080×1920(360×640 ×3)으로 장면마다 새 창을 열어
// 콘티의 조작을 그대로 재생하고, 화면(CDP 스크린캐스트 프레임)과 게임 소리(AudioContext 출력 → MediaRecorder)를 함께 담는다.
//   node scripts/reels-record.mjs [장면,...] [--base http://127.0.0.1:5173] [--out artifacts/reels/raw]
// 결과: <out>/<장면>.mp4(30fps, 녹화 시작=0초), <out>/<장면>.wav(같은 0초에 맞춤), <out>/<장면>.json(조작 시각 events·편집 시작점 in)
// 함께 걷기 장면(multi)은 함께 걷기 서버(npm run multi:up 또는 npm run server, 8787)가 켜져 있어야 한다.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {waitChunks} from './lib/chunk-wait.mjs';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {sample} from '../src/route.js';

const argv=process.argv.slice(2),opt={},names=[];
for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--'))opt[a.slice(2)]=argv[++i];else names.push(...a.split(','));}
const base=opt.base??'http://127.0.0.1:5173',out=opt.out??'artifacts/reels/raw',multiServer=opt.server??'ws://127.0.0.1:8787';
export const FFMPEG=['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg'].find(existsSync)??'ffmpeg';
const SCENES=JSON.parse(readFileSync('scripts/reels-scenes.json','utf8'));
const deg=r=>((r*180/Math.PI)%360+360)%360,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const routeBearing=s=>deg(-sample(s).heading);
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 게임 소리 받기: 어느 노드든 스피커(destination)에 이어지면 같은 AudioContext의 MediaStream 출구에도 잇는다(발소리·환경음·효과음·라디오 모두 한 곳으로 모임).
function audioTap(){
 const connect=AudioNode.prototype.connect;window.__taps=[];
 AudioNode.prototype.connect=function(dest,...rest){const r=connect.call(this,dest,...rest);
  if(dest instanceof AudioDestinationNode){const ctx=dest.context;if(!ctx.__tap){ctx.__tap=ctx.createMediaStreamDestination();window.__taps.push(ctx);}connect.call(this,ctx.__tap,...rest);}return r;};
 window.__recStart=()=>new Promise(res=>{const ctx=window.__taps[0];if(!ctx)return res(null);window.__chunks=[];
  const rec=new MediaRecorder(ctx.__tap.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});window.__rec=rec;
  rec.ondataavailable=e=>e.data.size&&window.__chunks.push(e.data);rec.onstart=()=>res(Date.now());rec.start(250);});
 window.__recStop=()=>new Promise(res=>{const rec=window.__rec;if(!rec)return res(null);rec.onstop=async()=>{const b=new Blob(window.__chunks,{type:'audio/webm'});const buf=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=32768)s+=String.fromCharCode(...buf.subarray(i,i+32768));res(btoa(s));};rec.stop();});
}

const openContexts=new Set();
async function openPage(browser,{query,seed=null,storage={},label}){
 const context=await browser.newContext({viewport:{width:360,height:640},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:UA});
 await context.addInitScript(({seed,key,storage})=>{if(sessionStorage.getItem('__reels'))return;sessionStorage.setItem('__reels','1');localStorage.clear();localStorage.setItem('gwanak-stick-used','1');for(const [k,v] of Object.entries(storage))localStorage.setItem(k,v);if(seed)localStorage.setItem(key,JSON.stringify(seed));},{seed,key:SAVE_KEY,storage});
 openContexts.add(context);context.on('close',()=>openContexts.delete(context));
 await context.addInitScript(audioTap);
 // 대표 결정(11-13): 홍보 영상에는 Open-Meteo 날씨를 쓰지 않는다. 날씨 API를 막고(날씨는 ?weather= 고정값),
 // 화면 아래 출처 줄과 산 고르기의 '지금 서울 … 맑음' 줄을 처음부터 숨긴다. 출처는 캡션에 적는다.
 await context.route(/open-meteo\.com/,r=>r.abort());
 await context.addInitScript(()=>{const css='#source-line,.source-line,[data-pk-now]{visibility:hidden!important}';const add=()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);};if(document.head)add();else document.addEventListener('DOMContentLoaded',add);});
 const page=await context.newPage();page.errors=[];
 page.on('pageerror',e=>page.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')page.errors.push(m.text().slice(0,200));});
 await page.goto(`${base}/hiking/?${query}`);
 console.log(`  [${label}] 열기 ${query}`);
 return {context,page};
}
const ready=page=>page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
const closeDialogs=page=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
// 시선 영역을 끈다(손가락 끌기와 같음). ms>0이면 그 시간 동안 천천히 끈다(부드럽게 가속·감속).
const drag=(page,dx,dy,ms=0)=>page.evaluate(([dx,dy,ms])=>new Promise(res=>{Element.prototype.setPointerCapture=()=>{};
 const lz=document.getElementById('look-zone'),el=lz&&getComputedStyle(lz).display!=='none'?lz:document.getElementById('world');
 const x=innerWidth*.72,y=innerHeight*.45,ev=(t,px,py)=>el.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'mouse',clientX:px,clientY:py,button:0,buttons:t==='pointerup'?0:1,bubbles:true}));
 ev('pointerdown',x,y);if(!ms){for(let i=1;i<=20;i++)ev('pointermove',x+dx*i/20,y+dy*i/20);ev('pointerup',x+dx,y+dy);return res();}
 const t0=performance.now(),step=()=>{const k=Math.min(1,(performance.now()-t0)/ms),e=k<.5?2*k*k:1-(-2*k+2)**2/2;ev('pointermove',x+dx*e,y+dy*e);if(k<1)requestAnimationFrame(step);else{ev('pointerup',x+dx,y+dy);res();}};requestAnimationFrame(step);}),[dx,dy,ms]);
const DEG_PER_PX=.004*180/Math.PI;
async function look(page,bearing,pitch){
 for(let k=0;k<3;k++){const o=await page.evaluate(()=>window.hiking.orientation());
  const dYaw=bearing==null?0:wrap(-bearing*Math.PI/180-o.cameraHeading),dPitch=pitch==null?0:pitch*Math.PI/180-o.pitch;
  if(Math.abs(dYaw)<.01&&Math.abs(dPitch)<.01)break;await drag(page,-dYaw/.004,-dPitch/.003);await sleep(400);}
}
async function setView(page,view){if(view&&await page.evaluate(()=>window.hiking.snapshot().view)!==view){await page.keyboard.press('v');await sleep(600);}}
const unlockSound=page=>page.evaluate(()=>{dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));});

// 장면 값(reels-scenes.json) → 주소·저장값·방위
function place(key,over={}){
 const sc={...SCENES[key],...over};
 const q=new URLSearchParams({time:sc.time,weather:sc.weather??'clear',season:sc.season??'autumn',quality:'high'});if(sc.start)q.set('start',sc.start);
 const seed=sc.s===undefined?null:{...initialState({start:'demo'}),zone:'route',s:sc.s,lateral:sc.lateral??0,view:sc.view??'first'};
 const bearing=sc.bearing??(sc.s!==undefined?(routeBearing(sc.s)-(sc.yawFromRoute??0)+360)%360:null);
 return {sc,query:q.toString(),seed,bearing};
}
async function settle(page,{sc,bearing}){
 await ready(page);await sleep(1500);await closeDialogs(page);await unlockSound(page);await sleep(300);await unlockSound(page);
 await setView(page,sc.view);await look(page,bearing,sc.pitch);await sleep(2500);await closeDialogs(page);await waitChunks(page);console.log('    상태',JSON.stringify(await page.evaluate(()=>{const s=window.hiking.snapshot(),a=window.hiking.ambient?.();return {zone:s.zone,s:Math.round(s.s),view:s.view,paused:s.paused,amb:a&&Object.fromEntries(Object.entries(a.layers).filter(([k,v])=>v.playing).map(([k,v])=>[k,Math.round(v.gainDb)])),focus:document.hasFocus(),vis:document.visibilityState,taps:window.__taps.map(c=>c.state+':'+c.currentTime.toFixed(1))};})));
}
const hideHud=page=>page.evaluate(()=>{dispatchEvent(new CustomEvent('hiking:hud-toggle'));const s=document.createElement('style');s.textContent='.hud-restore,.hud-hint,#joystick,#source-line,.source-line,#section-jump{display:none!important}';document.head.append(s);});

// 녹화기: CDP 스크린캐스트(실제 그려진 프레임 + 시각) + 페이지 안 MediaRecorder. 둘 다 벽시계(ms) 기준이라 나중에 0초를 맞춘다.
async function recorder(page){
 const cdp=await page.context().newCDPSession(page),frames=[];let t0=null,events={};
 let live=true;cdp.on('Page.screencastFrame',f=>{if(live)frames.push({t:f.metadata.timestamp*1000,data:f.data});cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
 return {
  async start(){await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1080,maxHeight:1920,everyNthFrame:1});t0=Date.now();const a=await page.evaluate(()=>window.__recStart());this.audioT0=a;await sleep(200);},
  mark(name){events[name]=(Date.now()-t0)/1000;console.log(`    · ${name} ${events[name].toFixed(2)}s`);},
  async stop(id,meta={}){const audio=await page.evaluate(()=>window.__recStop());await cdp.send('Page.stopScreencast');await sleep(200);live=false;
   return save(id,{frames,t0,audioT0:this.audioT0,audio,events,meta,errors:page.errors});},
 };
}
function ff(args){const r=spawnSync(FFMPEG,['-hide_banner','-loglevel','error','-y',...args],{stdio:['ignore','inherit','inherit']});if(r.status)throw new Error(`ffmpeg 실패: ${args.join(' ')}`);}
function save(id,{frames,t0,audioT0,audio,events,meta,errors}){
 if(!frames.length)throw new Error(`${id}: 프레임 없음`);
 const dir=`${out}/${id}-frames`;rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
 // 0초 = 녹화 시작(t0). 첫 프레임 이전은 첫 프레임으로 채운다. 프레임마다 다음 프레임까지 보여 주고 30fps로 고르게 뽑는다.
 const list=[];frames.forEach((f,i)=>{const file=`${String(i).padStart(5,'0')}.jpg`;writeFileSync(`${dir}/${file}`,Buffer.from(f.data,'base64'));
  const start=i===0?t0:f.t,end=i+1<frames.length?frames[i+1].t:f.t+100;list.push(`file '${file}'`,`duration ${Math.max(.001,(end-start)/1000).toFixed(4)}`);});
 list.push(`file '${String(frames.length-1).padStart(5,'0')}.jpg'`);writeFileSync(`${dir}/list.txt`,list.join('\n'));
 const span=(frames.at(-1).t+100-t0)/1000,fps=frames.length/((frames.at(-1).t-frames[0].t)/1000||1);
 ff(['-f','concat','-safe','0','-i',`${dir}/list.txt`,'-vf','fps=30,scale=1080:1920:flags=lanczos,format=yuv420p','-c:v','libx264','-preset','medium','-crf','14','-r','30',`${out}/${id}.mp4`]);
 // 소리: 녹음 시작이 t0보다 늦으면 앞을 무음으로 채운다.
 if(audio){writeFileSync(`${out}/${id}.webm`,Buffer.from(audio,'base64'));const lag=Math.max(0,(audioT0-t0));
  ff(['-i',`${out}/${id}.webm`,'-af',`adelay=${lag}|${lag},apad`,'-t',span.toFixed(3),'-ar','48000','-ac','2',`${out}/${id}.wav`]);rmSync(`${out}/${id}.webm`);}
 else ff(['-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',span.toFixed(3),`${out}/${id}.wav`]);
 rmSync(dir,{recursive:true,force:true});
 const info={id,seconds:+span.toFixed(2),captureFps:+fps.toFixed(1),frames:frames.length,audio:!!audio,audioLagMs:audio?audioT0-t0:null,events,...meta,errors};
 writeFileSync(`${out}/${id}.json`,JSON.stringify(info,null,1));console.log(`  ✔ ${id} ${info.seconds}s · 캡처 ${info.captureFps}fps · 소리 ${info.audio?'있음':'없음'} · 오류 ${errors.length}`);return info;
}

// ─── 장면들 (콘티 §1 순서) ───
const SHOTS={
 // 0–2 훅: 정상 노을, 1인칭, 270°→310° 좌→우로 천천히(310° 넘지 않기, 장면위치 ①)
 async hook(browser){const p=place('hook-summit-dusk',{bearing:274});const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'hook'});
  await settle(page,p);await hideHud(page);await sleep(800);const r=await recorder(page);await r.start();await sleep(400);
  r.mark('in');await drag(page,28/DEG_PER_PX,0,3200);await sleep(300);const i=await r.stop('hook',{in:'in'});await context.close();return i;},
 // 2–5 산 고르기 → ▶ 오르기(2.5초 지점)
 async pick(browser){const p=place('hook-summit-dusk');const {page,context}=await openPage(browser,{query:'pick=on&serverpick=off&time=12:30&weather=clear&season=autumn&quality=high&start=plaza',label:'pick'});
  await page.waitForSelector('[data-pk-go]',{timeout:60000});await sleep(2500);const r=await recorder(page);await r.start();await sleep(300);r.mark('in');
  await sleep(2500);r.mark('click');await page.tap('[data-pk-go]');await sleep(1200);const i=await r.stop('pick',{in:'in'});await context.close();return i;},
 // 5–9 입구 광장 출발, 1인칭, W 누른 채 일주문 쪽으로
 async entrance(browser){const p=place('gate-entrance',{view:'first'});const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'entrance'});
  await settle(page,p);const r=await recorder(page);await r.start();await sleep(300);r.mark('in');await page.keyboard.down('KeyW');await sleep(4800);await page.keyboard.up('KeyW');
  const i=await r.stop('entrance',{in:'in'});await context.close();return i;},
 // 9–13 계곡 숲길 3인칭, W+Shift 달리기, 카메라를 크게 돌린다
 async valley(browser){const p=place('valley-forest');const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'valley'});
  await settle(page,p);const r=await recorder(page);await r.start();await sleep(300);r.mark('in');await page.keyboard.down('Shift');await page.keyboard.down('KeyW');
  await sleep(300);await drag(page,95/DEG_PER_PX,0,3800);await sleep(500);await page.keyboard.up('KeyW');await page.keyboard.up('Shift');
  const i=await r.stop('valley',{in:'in'});await context.close();return i;},
 // 13–17 깔딱고개 나무계단, W 직진, 중간에 뒤돌아봤다 돌아오기
 async stairs(browser){const p=place('deck-stairs');const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'stairs'});
  await settle(page,p);const r=await recorder(page);await r.start();await sleep(300);r.mark('in');await page.keyboard.down('KeyW');await sleep(1500);
  r.mark('look-back');await drag(page,-140/DEG_PER_PX,0,1100);await sleep(500);await drag(page,140/DEG_PER_PX,0,1100);await sleep(600);await page.keyboard.up('KeyW');
  const i=await r.stop('stairs',{in:'in'});await context.close();return i;},
 // 17–23 자동 걷기 + 즐길거리: 산스장 들르기 버튼이 뜨면 누르고, 역기 자리로 가면 '들어 올리기'를 10번 연타 → 득근!! → 산스장 득근 도장.
 // 편집은 같은 녹화를 두 컷으로 쓴다(autowalk: 들르기 버튼 / gym: 역기 연타~도장).
 async autowalk(browser){const p=place('valley-forest',{s:2410,yawFromRoute:-20,pitch:-4,time:'11:00'});const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'autowalk'});
  await settle(page,p);const r=await recorder(page);await r.start();await sleep(400);r.mark('auto');await page.tap('#auto');
  const t=Date.now();let rect=null;while(Date.now()-t<40000){rect=await page.evaluate(()=>{const b=document.querySelector('#trail-chip[data-mode=offer] .tc-offer');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,label:b.innerText};});if(rect)break;await sleep(100);}
  if(!rect)throw new Error('autowalk: 즐길거리 버튼이 40초 안에 안 뜸');
  r.mark('offer');await sleep(1000);r.mark('tap');await page.locator('.tc-offer').tap({force:true,timeout:3000}).catch(()=>page.evaluate(()=>document.querySelector('.tc-offer')?.click()));
  await page.evaluate(()=>{window.__gymDone=false;addEventListener('hiking:trail',e=>{if(e.detail?.type==='gym-lift-done')window.__gymDone=true;});});
  await page.waitForSelector('#trail-bar[data-mode=lift] .tb-lift',{timeout:20000});r.mark('lift');await drag(page,80/DEG_PER_PX,0,1000);await sleep(200); // 기구 뒤에서 보면 타이어가 화면 아래를 가려, 정면 쪽으로 돈다
  for(let i=0;i<10;i++){await page.evaluate(()=>{const b=document.querySelector('#trail-bar .tb-lift');b?.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,pointerType:'touch',bubbles:true,cancelable:true}));});await sleep(260);}
  r.mark('lifted');await sleep(3200);
  const gymDone=await page.evaluate(()=>window.__gymDone);if(!gymDone)throw new Error('autowalk: 역기 10번을 눌렀는데 득근이 안 됨');
  const i=await r.stop('autowalk',{in:'offer',inOffset:-1.4,callout:rect,gymDone});await context.close();return i;},
 // 쌍안경(B): 정상에서 N서울타워(방위 약 10°)를 맞춰 확대 → 롯데월드타워(약 59°)로 돌린다. 편집은 두 컷(namsan·lotte)으로 쓴다.
 // 능선(s=4950)에서는 1인칭 눈높이 바로 앞 바위에 렌즈가 막혀 정상에서 찍는다. 렌즈 속 도심 칸이 먼저 만들어지도록 두 방향을 한 번씩 본 뒤 녹화한다.
 // 쌍안경을 들면 배율만큼 시선이 덜 돌아가서, 지금 방위를 읽으며 목표 방위까지 돌린다(aim).
 async bino(browser){const p=place('summit-city-night',{time:'15:30',bearing:2,pitch:-2});const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'bino'});
  const NAMSAN=10.3,LOTTE=58.6;
  const bearingNow=async()=>deg(-(await page.evaluate(()=>window.hiking.orientation())).cameraHeading);
  const aim=async(target,ms=0)=>{let b0=await bearingNow();await drag(page,20,0);await sleep(150);const k=wrap((await bearingNow()-b0)*Math.PI/180)*180/Math.PI/20||.05;
   b0=await bearingNow();await drag(page,wrap((target-b0)*Math.PI/180)*180/Math.PI/k,0,ms);await sleep(200);
   for(let n=0;n<3;n++){const d=wrap((target-await bearingNow())*Math.PI/180)*180/Math.PI;if(Math.abs(d)<.4)break;await drag(page,d/k,0);await sleep(200);}};
  // 롯데월드타워(555m)는 위아래로 길어 10배에서는 꼭대기가 잘린다 → 8배로 내리고 시선을 조금 올린다.
  const tilt=async(target,ms=0)=>{const pNow=async()=>(await page.evaluate(()=>window.hiking.orientation())).pitch*180/Math.PI;let p0=await pNow();await drag(page,0,-10);await sleep(150);const k=(await pNow()-p0)/-10||.05;
   for(let n=0;n<3;n++){const d=target-await pNow();if(Math.abs(d)<.15)break;await drag(page,0,d/k,n?0:ms);await sleep(200);}};
  // 영상에서는 렌즈 아래를 가리는 설명 카드(F 설명 보기)를 숨긴다. 타워 위 이름표는 그대로 보인다.
  // 렌즈 아래로 늘어지는 한강 이름표와 '이름표' 버튼도 자막(y≈1300~1450)과 겹쳐 숨긴다.
  await page.addStyleTag({content:'.ix-focus,.ix-tagbtn,.ix-lm.reels-off{display:none!important}'});
  await page.evaluate(()=>{const hide=()=>{for(const el of document.querySelectorAll('.ix-lm'))if(el.textContent.includes('한강')&&!el.classList.contains('reels-off'))el.classList.add('reels-off');};new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});}); // 이름표는 매 프레임 다시 그려져서 바뀔 때마다 바로 숨긴다
  await settle(page,p);await page.keyboard.press('b');await sleep(2500);await aim(LOTTE);await sleep(3000);await aim(NAMSAN);await sleep(2000);await page.keyboard.press('b');await sleep(1200);
  await look(page,2,-2);await sleep(800);
  const r=await recorder(page);await r.start();await sleep(300);r.mark('in');await page.keyboard.press('b');await sleep(700);
  await aim(NAMSAN,700);r.mark('namsan');await page.keyboard.press('Equal');await sleep(400);await page.keyboard.press('Equal');await sleep(1500);
  r.mark('pan');await page.keyboard.press('Minus');await sleep(150);await page.keyboard.press('Minus');await aim(LOTTE,1300);await tilt(-1.2,300);r.mark('lotte');await sleep(1800);r.mark('down');await page.keyboard.press('b');await sleep(900);
  const end=await bearingNow();
  const i=await r.stop('bino',{in:'in',endBearing:+end.toFixed(1)});await context.close();return i;},
 // 25–28 지도(M) 1.5초 → 수첩 스탬프 칸(J) 1.5초
 async mapbook(browser){const p=place('valley-forest',{s:1700,yawFromRoute:0,pitch:-4});const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'mapbook'});
  await settle(page,p);const r=await recorder(page);await r.start();await sleep(300);r.mark('in');await page.keyboard.press('m');await sleep(1700);await page.keyboard.press('m');await sleep(150);
  r.mark('stamps');await page.keyboard.press('j');await sleep(1900);const i=await r.stop('mapbook',{in:'in'});await context.close();return i;},
 // 28–32 함께 걷기 + 채팅: 같은 방 두 창. A가 찍고, B가 A 쪽으로 걸어와 인사, A가 답한다.
 async multi(browser){const p=place('gate-entrance');const q=(name)=>`${p.query}&multi=${encodeURIComponent('릴스')}&server=${encodeURIComponent(multiServer)}&name=${encodeURIComponent(name)}`;
  const A=await openPage(browser,{query:q('관악다람쥐'),label:'multi-A'}),B=await openPage(browser,{query:q('주말등산러'),label:'multi-B'});
  await Promise.all([settle(A.page,{sc:{...p.sc,view:'third'},bearing:null}),settle(B.page,{sc:{...p.sc,view:'third'},bearing:null})]);
  // A가 먼저 일주문 쪽으로 8m쯤 가서 뒤돌아본다.
  await A.page.keyboard.down('KeyW');await sleep(5000);await A.page.keyboard.up('KeyW');await drag(A.page,180/DEG_PER_PX,0);await sleep(1200);
  const r=await recorder(A.page);await r.start();await sleep(300);r.mark('in');await B.page.keyboard.down('KeyW');await sleep(2200);await B.page.keyboard.up('KeyW');
  r.mark('hi');await B.page.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'안녕! 같이 올라가요'}})));await sleep(1400);
  r.mark('reply');await A.page.tap('.hc-btn').catch(()=>{});await sleep(300);await A.page.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'좋아요 😀'}})));await sleep(1800);
  const peers=await A.page.evaluate(()=>window.hiking.multi?.status?.()??null).catch(()=>null);
  const i=await r.stop('multi',{in:'in',peers});await A.context.close();await B.context.close();return i;},
 // 32–35 계절 빠른 컷(계곡 숲길 자리) → 📻 라디오(99.1, CC0)
 async seasons(browser){const p=place('valley-forest');const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,storage:{'gwanak-radio':JSON.stringify({freq:99.1,vol:.8})},label:'seasons'});
  await settle(page,p);await page.evaluate(()=>window.hiking.setSeason('spring',{instant:true}));await sleep(1500);await waitChunks(page);
  const r=await recorder(page);await r.start();await sleep(300);r.mark('in');
  for(const s of ['summer','autumn','winter']){await sleep(550);r.mark(s);await page.evaluate(s=>window.hiking.setSeason(s,{instant:true}),s);}
  await sleep(600);r.mark('radio');await page.evaluate(()=>document.getElementById('radio-tag').click());await page.waitForSelector('.rd:not([hidden])',{timeout:3000});await sleep(150);await page.evaluate(()=>document.querySelector('.rd-power').click());await sleep(2200);r.radio=await page.evaluate(()=>document.querySelector('.rd')?.innerText.replace(/\s+/g,' ').slice(0,80));
  const i=await r.stop('seasons',{in:'in',radio:r.radio});await context.close();return i;},
 // 35–40 AI Office·엔딩 뒷배경: 정상 서울 야경 1인칭, 아주 천천히 훑기
 async night(browser){const p=place('summit-city-night',{bearing:335});const {page,context}=await openPage(browser,{query:p.query,seed:p.seed,label:'night'});
  await settle(page,p);await hideHud(page);await sleep(800);const r=await recorder(page);await r.start();await sleep(300);r.mark('in');await drag(page,20/DEG_PER_PX,0,5600);await sleep(300);
  const i=await r.stop('night',{in:'in'});await context.close();return i;},
};
export const SHOT_ORDER=Object.keys(SHOTS);

if(import.meta.url===`file://${process.argv[1]}`){
 mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
 const done={},failed={};
 try{for(const id of names.length?names:SHOT_ORDER){if(!SHOTS[id])throw new Error(`장면 없음: ${id} (있는 것: ${SHOT_ORDER.join(',')})`);
  console.log(`● ${id}`);
  for(let tryNo=1;tryNo<=2;tryNo++){try{done[id]=await SHOTS[id](browser);delete failed[id];break;}catch(e){failed[id]=e.message;console.log(`  ✖ ${id} (${tryNo}번째): ${e.message.split('\n')[0]}`);}finally{for(const c of [...openContexts])await c.close().catch(()=>{});}}
 }}finally{await browser.close();}
 console.log(JSON.stringify({done:Object.keys(done),failed},null,1));if(Object.keys(failed).length)process.exitCode=1;
}
