// 관악산 FM 라디오 브라우저 확인(2026-11-08, PC 크롬 헤드리스). vite(PORT, 기본 5203)를 이 스크립트가 띄운다.
//  ① 소리 파일 14개(91.9 곡 8·99.1 소리 6)가 모두 열리고 재생되는지: 길이가 manifest와 맞고, 2초 넘게 재생되며, 소리 크기(RMS)가 무음이 아님
//  ② 라디오 조작: 전원 → 91.9 수신(잡음 0) · 방송 사이 잡음 · 92.4 반쯤 · 볼륨 · 내리기 뒤 계속 재생 · 소리 꺼짐 연동 · 95.5 자막 · 끄면 연결 해제
//  ③ 99.1 이어짐: 두 층을 끝 4초 앞으로 옮겨 다음 파일로 넘어가는 동안 50ms마다 소리 크기를 재서 끊김(무음 구간)이 없는지
//  ④ 외부 주소 요청 0건(네트워크 기록)
// 캡처: 세로 390×844·가로 844×390·PC 1920×1080에서 앞면(켜짐)·잡음(수신 불량)·꺼짐·뒷면·칩·소리 출처 창, 앞면 낮·노을·밤.
//   node scripts/verify-radio.mjs → artifacts/radio-2026-11-08/ (캡처·report.json). 실패가 있으면 종료 코드 1.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';

const dir='artifacts/radio-2026-11-08';mkdirSync(dir,{recursive:true});
const manifest=JSON.parse(readFileSync('assets/radio/manifest.json','utf8'));
let vite=null,pageUrl=process.env.PAGE_URL;
if(!pageUrl){const {createServer}=await import('vite');const port=Number(process.env.PORT??5203);vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true,hmr:false},logLevel:'warn'});await vite.listen();pageUrl=`http://127.0.0.1:${port}`;}
const origin=new URL(pageUrl).origin;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const out={at:new Date().toISOString(),pageUrl,steps:[],errors:[],result:{},files:[],levels:{},external:[]};
const log=(k,v={})=>{out.steps.push({k,...v});console.log(k,JSON.stringify(v).slice(0,300));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=false;const check=(name,ok,detail={})=>{out.result[name]={ok:!!ok,...detail};log(`${ok?'통과':'실패'} ${name}`,detail);if(!ok)fail=true;return ok;};

const ctx=await browser.newContext({viewport:{width:1280,height:760},deviceScaleFactor:1});
await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','true');});
const p=await ctx.newPage();
p.on('pageerror',e=>out.errors.push(e.message));
p.on('console',m=>{if(/^파일 재생/.test(m.text()))console.log(m.text());if(m.type()==='error'&&!/favicon/.test(m.text()))out.errors.push(m.text());});
p.on('request',r=>{const u=new URL(r.url());if(!['data:','blob:'].includes(u.protocol)&&u.origin!==origin)out.external.push(r.url());});
log('페이지 열기');await p.goto(`${pageUrl}/hiking/?start=demo&time=13:00&weather=clear&quality=low`);
await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.radio,null,{timeout:180000});log('페이지 준비');
const R=(fn,arg)=>p.evaluate(fn,arg);
const level=()=>p.evaluate(()=>hiking.radio.audio?.level()??-Infinity);
async function avgLevel(ms=1200){const v=[];const t=Date.now();while(Date.now()-t<ms){v.push(await level());await sleep(60);}const f=v.filter(Number.isFinite);return f.length?20*Math.log10(Math.sqrt(f.reduce((s,x)=>s+10**(x/10),0)/f.length)):-Infinity;}
const shot=async name=>{await p.screenshot({path:`${dir}/${name}.png`});out.steps.push({k:'캡처',name});};
const VIEWS=[['세로',390,844],['가로',844,390],['PC',1920,1080]];
async function shots3(name){for(const [label,w,h] of VIEWS){await p.setViewportSize({width:w,height:h});await sleep(450);await shot(`${name}-${label}-${w}x${h}`);}await p.setViewportSize({width:1280,height:760});await sleep(200);}

try{
 // ── ① 파일 14개 재생
 const files=[...manifest.channels.calm.tracks,...manifest.channels.nature.tracks].map(t=>({file:t.file,duration:t.duration}));
 out.files=await p.evaluate(async files=>{
  const ac=new AudioContext();const T=(pr,ms,m)=>Promise.race([pr,new Promise((_,no)=>setTimeout(()=>no(new Error(m)),ms))]);await T(ac.resume(),5000,'resume 시간 초과').catch(()=>{});const res=[];
  for(const f of files){
   const el=new Audio(`/assets/radio/${f.file}`);el.preload='auto';
   const src=ac.createMediaElementSource(el),an=ac.createAnalyser();an.fftSize=2048;src.connect(an);
   const r={file:f.file,expected:f.duration};
   try{
    await new Promise((ok,no)=>{el.onloadedmetadata=ok;el.onerror=()=>no(new Error(el.error?.message||'오류'));setTimeout(()=>no(new Error('시간 초과')),15000);});
    r.duration=el.duration;el.currentTime=Math.min(30,el.duration/3);await T(el.play(),8000,'play 시간 초과');console.log('파일 재생 '+f.file);
    const t0=el.currentTime,peaks=[];const until=performance.now()+2600;
    while(performance.now()<until){await new Promise(z=>setTimeout(z,100));const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;peaks.push(Math.sqrt(s/d.length));}
    r.played=el.currentTime-t0;const rms=Math.sqrt(peaks.reduce((s,x)=>s+x*x,0)/peaks.length);r.rmsDb=rms>0?20*Math.log10(rms):-999;
   }catch(e){r.error=e.message;}
   // 끝까지: manifest 길이 3초 앞으로 옮겨 'ended'가 제때 오는지(파일이 실제로 그 길이에서 끝나는지)
   if(!r.error){try{const t1=performance.now();el.currentTime=Math.max(0,f.duration-3);await T(el.play(),8000,'끝 play 시간 초과');await new Promise((ok,no)=>{el.onended=ok;setTimeout(()=>no(new Error('끝나지 않음')),9000);});r.endedAfter=(performance.now()-t1)/1000;}catch(e){r.endError=e.message;}}
   el.pause();el.removeAttribute('src');el.load();src.disconnect();res.push(r);
  }
  await ac.close();return res;
 },files);
 // 길이: 브라우저가 읽은 값(헤더)과 manifest(실제로 풀어서 잰 값)가 다르면 알려 두고, 끝나는 시각은 manifest 기준으로 본다
const okFiles=out.files.filter(f=>!f.error&&f.played>2&&f.rmsDb>-60&&!f.endError&&f.endedAfter<6);
out.lengthMismatch=out.files.filter(f=>Math.abs(f.duration-f.expected)>=1.5).map(f=>({file:f.file,browser:f.duration,manifest:f.expected}));
 check('소리 파일 14개 모두 재생(중간 2.6초 소리·끝까지 재생)',okFiles.length===14,{통과:okFiles.length,길이다름:out.lengthMismatch,파일:out.files.map(f=>`${f.file} ${f.error??`${f.duration?.toFixed(1)}s 재생${f.played?.toFixed(1)}s ${f.rmsDb?.toFixed(1)}dB 끝${f.endError??f.endedAfter?.toFixed(1)+'s'}`}`)});

 // ── ② 조작
 await p.click('#radio-tag');await p.waitForSelector('.rd:not([hidden])');
 await shots3('01-꺼짐');
 await p.click('.rd-power');
 await p.waitForFunction(()=>hiking.radio.audio?.on&&hiking.radio.state.audio?.deckState==='playing',null,{timeout:20000});
 await sleep(1500);
 const st1=await R(()=>({stxt:document.querySelector('.rd-stxt').textContent,name:document.querySelector('.rd-name').textContent,info:document.querySelector('.rd-info small').textContent,mix:hiking.radio.state.audio.mix}));
 const lvOn=await avgLevel();out.levels.on919=lvOn;
 check('전원 → 91.9 수신(잡음 0)',st1.mix.noise===0&&st1.mix.broadcast>0&&st1.name.includes('잔잔한 음악')&&st1.stxt==='수신 좋음'&&lvOn>-50,{...st1,dB:lvOn.toFixed(1)});
 await shots3('02-켜짐-919');
 // 방송 사이: 105.0 (잡음만)
 await R(()=>hiking.radio.setFreq(105));await sleep(600);
 const lvNoise=await avgLevel();out.levels.noise=lvNoise;
 const st2=await R(()=>({stxt:document.querySelector('.rd-stxt').textContent,deck:hiking.radio.state.audio.deck,chip:document.querySelector('#radio-tag').textContent}));
 check('방송 사이는 잡음만·수신 불량',st2.stxt==='수신 불량…'&&st2.deck===null&&lvNoise>-55&&st2.chip==='📻 ~105.0',{...st2,dB:lvNoise.toFixed(1)});
 await shots3('03-수신불량');
 // 다이얼을 끌어 돌리기: 105 → 왼쪽으로 끌어 99 근처, 놓으면 99.1에 붙음
 const box=await p.locator('.rd-dial').boundingBox();
 const pxPerMHz=box.width/20.5,startX=box.x+box.width*(105-87.5)/20.5;
 await p.mouse.move(startX,box.y+box.height/2);await p.mouse.down();
 for(let i=1;i<=12;i++){await p.mouse.move(startX-pxPerMHz*5.96*i/12,box.y+box.height/2);await sleep(40);}
 await p.mouse.up();await sleep(300);
 const dragged=await R(()=>hiking.radio.state.freq);
 check('다이얼 끌어 돌리기 → 99.1에 붙음',dragged===99.1,{freq:dragged});
 // 잡음 → 방송: 93.5(잡음) → 92.4(반) → 91.9(맞춤)
 const seq=[];for(const f of [93.5,92.8,92.4,92.1,91.9]){await R(f=>hiking.radio.setFreq(f),f);await sleep(250);seq.push(await R(()=>{const m=hiking.radio.state.audio.mix;return {f:hiking.radio.state.freq,clarity:+m.clarity.toFixed(2),noise:+m.noise.toFixed(3),bc:+m.broadcast.toFixed(3)};}));}
 check('다이얼 → 잡음 줄고 방송 또렷',seq.every((x,i)=>!i||(x.noise<=seq[i-1].noise&&x.bc>=seq[i-1].bc))&&seq[0].clarity===0&&seq.at(-1).noise===0,{seq});
 await p.waitForFunction(()=>hiking.radio.state.audio?.deckState==='playing',null,{timeout:15000});await sleep(800);
 // 볼륨
 await R(()=>hiking.radio.setVol(.2));await sleep(500);const lvLow=await avgLevel(1500);
 await R(()=>hiking.radio.setVol(.9));await sleep(500);const lvHigh=await avgLevel(1500);
 check('볼륨 노브(0.2 → 0.9 커짐)',lvHigh-lvLow>6,{낮음:lvLow.toFixed(1),높음:lvHigh.toFixed(1)});
 await R(()=>hiking.radio.setVol(.6));
 // 내리기 뒤 계속
 await p.click('.rd-down');await sleep(800);
 const lvDown=await avgLevel(1200),chip=await R(()=>({text:document.querySelector('#radio-tag').textContent,hidden:document.querySelector('.rd').hidden}));
 check('내리기 뒤에도 소리 계속·칩 📻 91.9',chip.hidden&&chip.text==='📻 91.9'&&lvDown>-50,{...chip,dB:lvDown.toFixed(1)});
 await shots3('04-내린뒤-칩');
 // 소리 꺼짐 연동
 await R(()=>dispatchEvent(new CustomEvent('hiking:sound',{detail:{enabled:false}})));await sleep(700);
 const lvMute=await avgLevel(800);await p.click('#radio-tag');await sleep(200);
 const muteTxt=await R(()=>document.querySelector('.rd-stxt').textContent);
 check('전체 소리 꺼짐이면 라디오도 무음',lvMute<-80&&muteTxt==='소리 꺼짐',{dB:String(lvMute),표시:muteTxt});
 await R(()=>dispatchEvent(new CustomEvent('hiking:sound',{detail:{enabled:true}})));await sleep(500);
 // 95.5 자막
 await p.click('.rd-tune [data-go="95.5"]');
 await p.waitForFunction(()=>!document.querySelector('.rd-caption').hidden,null,{timeout:6000});
 const cap=await R(()=>document.querySelector('.rd-caption').textContent);const lv955=await avgLevel(800);
 check('95.5 자막(녹음 전)·낮은 톤',cap.length>20&&lv955>-60,{자막:cap,dB:lv955.toFixed(1)});
 await shots3('05-955-자막');
 // ③ 99.1 이어짐
 await p.click('.rd-tune [data-go="99.1"]');
 await p.waitForFunction(()=>hiking.radio.state.audio?.deck==='nature'&&hiking.radio.state.audio?.deckState==='playing',null,{timeout:20000});await sleep(1500);
 const before=await R(()=>hiking.radio.audio.debug().deck);
 await R(()=>hiking.radio.audio.deck.seekNearEnd(4));
 const trace=[];const t0=Date.now();while(Date.now()-t0<9000){trace.push(await level());await sleep(50);}
 const after=await R(()=>hiking.radio.audio.debug().deck);
 const finite=trace.filter(Number.isFinite),minDb=Math.min(...trace),medDb=finite.sort((a,b)=>a-b)[Math.floor(finite.length/2)];
 out.levels.natureTrace=trace.map(v=>Number.isFinite(v)?+v.toFixed(1):null);
 const switched=before.every((b,i)=>after[i].index!==b.index);
 check('99.1 다음 파일로 끊김 없이 이어짐',switched&&minDb>-50&&minDb>medDb-15,{전:before.map(b=>b.index),후:after.map(a=>a.index),최저dB:minDb.toFixed(1),중간dB:medDb.toFixed(1)});
 await shots3('06-991');
 // 뒷면·소리 출처
 await p.click('.rd-front .rd-flip');await sleep(400);await shots3('07-뒷면');
 const links=await R(()=>[...document.querySelectorAll('.rd-links a')].map(a=>({t:a.textContent,href:a.href,target:a.target,rel:a.rel})));
 check('뒷면 링크 3개(새 탭·noopener)',links.length===3&&links.every(l=>l.target==='_blank'&&l.rel==='noopener noreferrer'),{links});
 await p.click('.rd-credits-open');await p.waitForSelector('.rd-credits[open]');await sleep(300);
 const creditTxt=await R(()=>document.querySelector('.rd-cbody').innerText);
 check('소리 출처 화면: 91.9 문구 그대로·99.1·발소리',creditTxt.includes(manifest.channels.calm.credit.split('\n')[0])&&creditTxt.includes('Licensed under Creative Commons: By Attribution 4.0')&&creditTxt.includes('Freesound, CC0')&&creditTxt.includes('발소리'),{앞부분:creditTxt.slice(0,240)});
 await shots3('08-소리출처');
 await p.click('.rd-cx');await p.click('.rd-unflip');await sleep(300);
 // 설정 시트의 소리 출처 단추
 check('설정 시트에 소리 출처 단추',await R(()=>!!document.querySelector('#nb-sheet-settings .rd-credit-btn')));
 // 낮·노을·밤
 await p.click('.rd-tune [data-go="91.9"]');await sleep(800);
 for(const [tone,preset] of [['낮','day'],['노을','dusk'],['밤','night']]){await R(t=>dispatchEvent(new CustomEvent('hiking:free-settings',{detail:{time:t}})),preset);await sleep(1800);await shot(`09-켜짐-${tone}-PC`);await p.setViewportSize({width:390,height:844});await sleep(400);await shot(`09-켜짐-${tone}-세로`);await p.setViewportSize({width:1280,height:760});}
 // 끄면 연결 해제
 await p.click('.rd-power');await sleep(600);
 const offInfo=await R(()=>({on:hiking.radio.audio.on,nodes:hiking.radio.audio.debug().nodes,deck:hiking.radio.audio.debug().deck,chip:document.querySelector('#radio-tag').textContent,saved:localStorage.getItem('gwanak-radio')}));
 check('끄면 연결 해제·칩은 📻 라디오',!offInfo.on&&!offInfo.nodes&&offInfo.deck===null&&offInfo.chip==='📻 라디오',offInfo);
}catch(e){check('진행 오류',false,{message:e.message,stack:e.stack?.split('\n').slice(0,3).join(' | ')});}
check('외부 주소 요청 0건',out.external.length===0,{external:out.external.slice(0,5)});
check('페이지 오류 없음',out.errors.length===0,{errors:out.errors.slice(0,6)});
writeFileSync(`${dir}/report.json`,JSON.stringify(out,null,1));
console.log(fail?'\n실패가 있습니다':'\n모두 통과',Object.entries(out.result).map(([k,v])=>`${v.ok?'✔':'✘'} ${k}`).join('\n'));
await browser.close();await vite?.close();process.exit(fail?1:0);
