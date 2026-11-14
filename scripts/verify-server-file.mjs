// 주소에 ?server= 없이 서버 카드로 들어와 서로 보이는지(2026-11-11, 공개 파일 multi-server.json).
// 미리 `npm run multi:up`(실제 서버 + 터널)을 켜 두고 실행한다.
//   로컬:  BASE_PATH=/ai-office-world/ npm run build 뒤 dist/multi-server.json을 지금 주소로 써 두고
//          PAGE_URL=http://127.0.0.1:4173/ai-office-world node scripts/verify-server-file.mjs   (npm run preview:pages)
//   배포본: PAGE_URL=https://engchoon.github.io/ai-office-world node scripts/verify-server-file.mjs
// 확인: ① 두 브라우저(B는 옛 터널 주소를 기억하고 있음) 모두 공개 파일 주소로 붙음 ② 서버 카드에 인원 숫자 ③ 누르면 입장·서로 보임
//       ④ 주소창에 ?server=가 생기지 않음 ⑤ 옛 터널 주소가 붙은 링크로 와도 공개 파일 주소로 붙고 주소창에서 빠짐. 등산·흡연장 둘 다.
// 결과 artifacts/server-file-2026-11-11/(report.json·캡처). 하나라도 실패하면 종료 코드 1.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';

const pageUrl=(process.env.PAGE_URL??'http://127.0.0.1:4173/ai-office-world').replace(/\/$/,'');
const dir=process.env.OUT??'artifacts/server-file-2026-11-11';mkdirSync(dir,{recursive:true});
const OLD='wss://old-dead-tunnel.trycloudflare.com';
const file=await (await fetch(`${pageUrl}/multi-server.json?t=${Date.now()}`,{cache:'no-store'})).json();
console.log('공개 파일',file);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={at:new Date().toISOString(),pageUrl,file,result:{},errors:[]};let fail=false;
const check=(k,ok,d={})=>{out.result[k]={ok:!!ok,...d};if(!ok)fail=true;console.log(ok?'통과':'실패',k,JSON.stringify(d).slice(0,400));};
const wsUrls=[];
async function open(exp,{nick,remember='',query='',viewport={width:1280,height:760}}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1});
 await ctx.addInitScript(([nick,remember])=>{if(sessionStorage.getItem('__init'))return;sessionStorage.setItem('__init','1');localStorage.clear();
  localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-multi-name',nick);
  localStorage.setItem('online-smoking',JSON.stringify({nickname:nick,seenIntro:true,muted:true}));
  if(remember)localStorage.setItem('gwanak-multi-server',remember);},[nick,remember]);
 const p=await ctx.newPage();p.label=`${exp}:${nick}`;
 p.on('websocket',w=>wsUrls.push([p.label,w.url()]));
 p.on('pageerror',e=>out.errors.push(`${p.label}: ${e.message}`));
 const q=exp==='hiking'?`pick=off&serverpick=on&start=entrance&time=13:00&weather=clear${query}`:`serverpick=on&time=day${query}`;
 await p.goto(`${pageUrl}/${exp}/?${q}`);
 await p.waitForSelector('.sp-wrap:not([hidden]) .sp-row[data-state="open"]',{timeout:180000});
 return p;
}
const readPick=p=>p.evaluate(()=>{const w=[...document.querySelectorAll('.sp-wrap')].find(e=>!e.hidden);return w&&{net:w.dataset.net,here:w.querySelector('[data-sp-here]').textContent,rows:[...w.querySelectorAll('.sp-row')].map(b=>({name:b.querySelector('b').textContent,n:b.querySelector('.sp-row-n').textContent,state:b.dataset.state}))};});
const join=async p=>{await p.click('.sp-wrap:not([hidden]) .sp-row:not([disabled])');};
const want=new URL(file.url.replace(/^ws/,'http')).host;
try{
 for(const exp of ['hiking','smoking']){
  const A=await open(exp,{nick:exp==='hiking'?'하늘':'미나'});
  const B=await open(exp,{nick:exp==='hiking'?'바다':'지훈',remember:OLD,viewport:{width:390,height:844}});
  const pa=await readPick(A),pb=await readPick(B);
  check(`${exp} 서버 카드에 인원 숫자`,/^\d+ \/ 20명$/.test(pa.rows[0].n)&&/^\d+ \/ 20명$/.test(pb.rows[0].n)&&pa.net==='ok',{A:pa,B:pb});
  await A.screenshot({path:`${dir}/${exp}-서버카드-PC.png`});await B.screenshot({path:`${dir}/${exp}-서버카드-휴대폰.png`});
  await join(A);await join(B);
  if(exp==='hiking'){
   await A.waitForFunction(n=>window.hiking?.multi?.()?.roster?.some(r=>r.name===n),'바다',{timeout:180000});
   await B.waitForFunction(n=>window.hiking?.multi?.()?.roster?.some(r=>r.name===n),'하늘',{timeout:180000});
  }else{
   await A.waitForFunction(n=>window.lounge?.multi?.people?.().some(p=>p.name===n),'지훈',{timeout:60000});
   await B.waitForFunction(n=>window.lounge?.multi?.people?.().some(p=>p.name===n),'미나',{timeout:60000});
  }
  check(`${exp} 두 브라우저 서로 보임`,true);
  const urls=[A.url(),B.url()],socks=wsUrls.filter(([l])=>l===A.label||l===B.label).map(([,u])=>u);
  check(`${exp} 주소창에 ?server= 없음`,urls.every(u=>!/[?&]server=/.test(u)),{urls});
  check(`${exp} 공개 파일 주소로 붙음(옛 기억 주소 무시)`,socks.length>=2&&socks.every(u=>new URL(u).host===want),{socks});
  // 옛 터널 주소가 붙은 예전 링크
  const C=await open(exp,{nick:exp==='hiking'?'구름':'보미',query:`&server=${OLD}`});
  const cs=wsUrls.filter(([l])=>l===C.label);await join(C);
  if(exp==='hiking')await C.waitForFunction(()=>window.hiking?.multi?.()?.status==='online',null,{timeout:180000});
  else await C.waitForFunction(()=>window.lounge?.multi?.status?.().state==='online',null,{timeout:60000});
  const cSocks=wsUrls.filter(([l])=>l===C.label).map(([,u])=>u);
  check(`${exp} 옛 터널 링크도 공개 파일 주소로·주소창에서 뺌`,cSocks.length>=1&&cSocks.every(u=>new URL(u).host===want)&&!/[?&]server=/.test(C.url()),{url:C.url(),socks:cSocks,before:cs.length});
  for(const p of [A,B,C])await p.context().close();
 }
}catch(e){fail=true;out.errors.push(String(e.stack||e));console.error(e);}
out.ok=!fail;writeFileSync(`${dir}/report.json`,JSON.stringify(out,null,1));
await browser.close();
console.log(fail?'실패가 있습니다':'모두 통과',`→ ${dir}/report.json`);process.exit(fail?1:0);
