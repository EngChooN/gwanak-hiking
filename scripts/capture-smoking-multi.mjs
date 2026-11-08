// 흡연장 같이 피우기 캡처·점검(2026-11-08): 로컬 서버 + 브라우저 2개(하늘·바다)로 서로 보임·채팅·불 붙인 담배·이름표·참가 카드를 찍는다.
// 서버(MULTI_PORT 기본 8789)와 vite(PORT 기본 5199)를 이 스크립트가 띄우고 끝나면 닫는다. 이미 떠 있는 5173·8787은 건드리지 않는다.
//   node scripts/capture-smoking-multi.mjs → artifacts/multi-chat-2026-11-08/smoking-*.png, smoking-report.json (실패가 있으면 종료 코드 1)
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-chat-2026-11-08',multiPort=Number(process.env.MULTI_PORT??8789),room='옥상-1';mkdirSync(dir,{recursive:true});
const {createServer}=await import('vite');const port=Number(process.env.PORT??5199);
const vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const pageUrl=`http://127.0.0.1:${port}`;
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data-smoking`},{quiet:true});await srv.ready;
const wsUrl=`ws://127.0.0.1:${multiPort}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const out={at:new Date().toISOString(),checks:{},errors:[]};let fail=false;
const check=(name,ok,detail={})=>{out.checks[name]={ok,...detail};if(!ok)fail=true;console.log(ok?'통과':'실패',name,JSON.stringify(detail).slice(0,300));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function open(name,vp,{nick=name,outfit='shirt',query=''}={}){
 const mobile=vp.width<900;
 const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(([nick,outfit])=>{localStorage.clear();localStorage.setItem('online-smoking',JSON.stringify({nickname:nick,status:'quit',outfit,seenIntro:true,muted:true,quitDate:'2026-11-01'}));},[nick,outfit]);
 await ctx.addInitScript(()=>{window.__ev=[];for(const t of ['lounge:chat','lounge:multi-status'])addEventListener(t,e=>window.__ev.push({type:t,...e.detail}));});
 const p=await ctx.newPage();p.ctx=ctx;p.label=name;
 p.on('pageerror',e=>out.errors.push(`${name}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket connection|favicon/.test(m.text()))out.errors.push(`${name}: ${m.text()}`);});
 await p.goto(`${pageUrl}/smoking/?capture=1&time=day&multi=${encodeURIComponent(room)}&server=${encodeURIComponent(wsUrl)}${query}`);
 await p.waitForFunction(()=>window.lounge?.multi?.state==='online',null,{timeout:120000});
 return p;
}
async function scene(vp,tag){
 const S=await open('바다',vp,{outfit:'suit'}),M=await open('하늘',{width:1280,height:760},{outfit:'cardigan'});
 await S.waitForFunction(()=>window.lounge.multi.people().some(p=>p.avatar),null,{timeout:20000});
 // 바다 앞 2.2m에 하늘(바다 쪽을 봄). 카메라는 바다 뒤.
 const s=await S.evaluate(()=>window.lounge.status().player);
 const fx=-Math.sin(s.heading),fz=-Math.cos(s.heading);
 await M.evaluate(({x,z,h})=>window.lounge.teleport(x,z,h),{x:s.x+fx*2.2+.5,z:s.z+fz*2.2,h:s.heading+Math.PI});
 await S.evaluate(()=>window.lounge.setCam({pitch:.18,dist:3.4}));
 // 하늘: 담배 꺼내 불 붙이기 → 한 모금
 await M.evaluate(()=>{window.lounge.smoker.start('mild');setTimeout(()=>window.lounge.smoker.light(),1100);setTimeout(()=>window.lounge.smoker.puff(),4300);});
 await S.waitForFunction(()=>window.lounge.multi.status().people.some(p=>p.lit),null,{timeout:15000});
 // 채팅: 하늘이 입력칸으로, 바다도 한마디
 await M.evaluate(()=>{const f=document.querySelector('.lg-form'),i=f.querySelector('input');i.value='불 붙였어요, 같이 피워요!';f.requestSubmit();});
 await S.waitForFunction(()=>window.__ev.some(e=>e.type==='lounge:chat'&&e.remote),null,{timeout:8000});
 await sleep(2300);
 await S.evaluate(()=>{const f=document.querySelector('.lg-form'),i=f.querySelector('input');i.value='오 좋아요 🙌';f.requestSubmit();});
 await M.waitForFunction(()=>window.__ev.some(e=>e.type==='lounge:chat'&&e.remote&&e.text==='오 좋아요 🙌'),null,{timeout:8000});
 await sleep(1700);
 const st=await S.evaluate(()=>window.lounge.multi.status());
 const remote=st.people[0];
 const ui=await S.evaluate(()=>{const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,shown:getComputedStyle(e).display!=='none'&&!e.closest('[hidden]')};};
  const tag=document.querySelector('.lg-mp-tag'),btn=document.querySelector('.lg-mp-btn');
  return {btn:r(btn),btnTone:btn?.dataset.tone,tag:r(tag),tagText:tag?.textContent,bubbles:[...document.querySelectorAll('.lg-bub')].map(b=>b.textContent),log:[...document.querySelectorAll('.lg-log p')].map(p=>p.textContent),vw:innerWidth,vh:innerHeight};});
 const mineLog=await M.evaluate(()=>[...document.querySelectorAll('.lg-log p')].map(p=>p.textContent));
 check(`${tag} 서로 보임`,remote?.avatar&&remote.name==='하늘'&&st.state==='online',{remote});
 check(`${tag} 상대 담배 불`,remote?.lit===true&&['smoking','inhale','exhale'].includes(remote.smoke),{smoke:remote?.smoke,lit:remote?.lit});
 check(`${tag} 채팅 받음·내 글 한 번만`,ui.log.some(t=>t.includes('불 붙였어요'))&&mineLog.filter(t=>t.includes('불 붙였어요')).length===1&&ui.log.filter(t=>t.includes('오 좋아요')).length===1,{바다기록:ui.log,하늘기록:mineLog});
 check(`${tag} 상태 칩·44px`,ui.btnTone==='ok'&&ui.btn.w>=44&&ui.btn.h>=44&&ui.btn.x+ui.btn.w<=ui.vw,{btn:ui.btn});
 check(`${tag} 말풍선 또는 이름표`,ui.bubbles.some(b=>b.includes('하늘'))||(ui.tag?.shown&&ui.tagText==='하늘'),{bubbles:ui.bubbles,tag:ui.tag});
 await S.screenshot({path:`${dir}/smoking-${tag}-바다화면.png`});
 // 말풍선이 사라진 뒤 이름표
 await sleep(5200);
 const tag2=await S.evaluate(()=>{const t=document.querySelector('.lg-mp-tag');return t&&{text:t.textContent,shown:t.style.display!=='none'};});
 check(`${tag} 이름표`,tag2?.shown&&tag2.text==='하늘',{tag2});
 await S.screenshot({path:`${dir}/smoking-${tag}-이름표.png`});
 // 서버 고르기 창(참가 중: 나가서 혼자 피우기) — 11-08부터 참가 카드 대신 server-pick.js
 await S.click('.lg-mp-btn');await S.waitForSelector('.sp-wrap:not([hidden]) .sp-card');await sleep(300);
 const card=await S.evaluate(()=>{const c=document.querySelector('.sp-wrap:not([hidden]) .sp-card'),b=c.getBoundingClientRect(),btns=[...c.querySelectorAll('button,input')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return Math.round(Math.min(r.height,r.width));});
  return {shown:true,inView:b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight+1,minTarget:Math.min(...btns),title:c.querySelector('h2').textContent,solo:c.querySelector('.sp-solo').textContent};});
 check(`${tag} 서버 고르기 창`,card.shown&&card.inView&&card.minTarget>=44&&/나가서 혼자 피우기/.test(card.solo),card);
 await S.screenshot({path:`${dir}/smoking-${tag}-서버고르기.png`});
 await S.click('.sp-wrap:not([hidden]) .sp-x');
 await M.ctx.close();await S.ctx.close();
}
async function entryOnly(vp,tag){
 // 주소에 multi가 없을 때: '👥 같이 피우기' 단추 → 서버 고르기 창(옥상 1서버, 닉네임은 로비 이름) → 고르기(내 컴퓨터 모드)
 const mobile=vp.width<900;
 const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('online-smoking',JSON.stringify({nickname:'하늘',status:'never',outfit:'shirt',seenIntro:true,muted:true}));});
 const p=await ctx.newPage();p.on('pageerror',e=>out.errors.push(`entry: ${e.message}`));
 await p.goto(`${pageUrl}/smoking/?capture=1&time=dusk`);await p.waitForFunction(()=>window.lounge,null,{timeout:120000});await sleep(1500);
 await p.click('.lg-mp-btn');await p.waitForSelector('.sp-wrap:not([hidden]) .sp-row');await sleep(300);
 const c=await p.evaluate(()=>{const w=document.querySelector('.sp-wrap:not([hidden])');return {server:w.querySelector('.sp-row b').textContent,name:w.querySelector('input').value,rowEnabled:!w.querySelector('.sp-row').disabled};});
 check(`${tag} 서버 고르기 창 기본값`,c.server==='옥상 1서버'&&c.name==='하늘'&&c.rowEnabled,c);
 await p.screenshot({path:`${dir}/smoking-${tag}-서버고르기.png`});
 await p.click('.sp-wrap:not([hidden]) .sp-row');await p.waitForFunction(()=>window.lounge.multi.state==='online',null,{timeout:10000});
 const t=await p.evaluate(()=>({tone:document.querySelector('.lg-mp-btn').dataset.tone,transport:window.lounge.multi.status().transport}));
 check(`${tag} 내 컴퓨터 모드 참가`,t.tone==='local'&&t.transport==='local',t);
 await ctx.close();
}
try{
 await scene({width:390,height:844},'390x844');
 await scene({width:1920,height:1080},'1920x1080');
 await entryOnly({width:390,height:844},'390x844');
 await entryOnly({width:844,height:390},'844x390');
}catch(e){fail=true;out.errors.push('스크립트: '+e.message);console.log('오류',e.message);}
check('콘솔 오류 없음',!out.errors.length,{errors:out.errors});
writeFileSync(`${dir}/smoking-report.json`,JSON.stringify(out,null,2));
await browser.close();await srv.close();await vite.close();
console.log(fail?'결과: 실패':'결과: 통과');process.exit(fail?1:0);
