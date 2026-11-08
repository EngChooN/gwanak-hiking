// 서버 고르기 창 디자인 점검 캡처(2026-11-08, 산디자인). 등산·흡연장 × 세로 390×844·가로 844×390·PC 1920×1080 × 상태(일반·꽉 참·연결 실패·키보드) × 낮/밤.
// 키보드는 헤드리스에서 못 띄우므로 화면 높이를 줄여(세로 390×430, 가로 844×200) 키보드가 올라온 visualViewport를 흉내 낸다.
//   node scripts/capture-server-pick.mjs → artifacts/server-pick/ (캡처·report.json). 실패가 있으면 종료 코드 1.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';
const dir='artifacts/server-pick';mkdirSync(dir,{recursive:true});
const p1=Number(process.env.MULTI_PORT??8792),p2=p1+1;
const {createServer}=await import('vite');const vp=Number(process.env.PORT??5200);
const vite=await createServer({server:{port:vp,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const base=`http://127.0.0.1:${vp}`;
const srv=startServer({PORT:String(p1),HOST:'127.0.0.1',DATA_DIR:`${dir}/data`},{quiet:true});await srv.ready;
const small=startServer({PORT:String(p2),HOST:'127.0.0.1',DATA_DIR:`${dir}/data-s`,MAX_PER_ROOM:'2'},{quiet:true});await small.ready;
const ws1=`ws://127.0.0.1:${p1}`,ws2=`ws://127.0.0.1:${p2}`;
// 인원을 채운다(가짜 접속)
const socks=[];const fill=(ws,exp,room,n)=>Promise.all(Array.from({length:n},()=>new Promise(ok=>{const w=new WebSocket(ws);socks.push(w);w.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='welcome'||m.t==='full')ok();};w.onopen=()=>w.send(JSON.stringify({t:'hello',exp,room,name:'가짜'}));})));
await fill(ws1,'hiking','관악산-1',13);await fill(ws1,'smoking','옥상-1',4);
await fill(ws2,'hiking','관악산-1',2);await fill(ws2,'smoking','옥상-1',2);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={at:new Date().toISOString(),checks:[],errors:[]};let fail=false;
const check=(n,ok,d={})=>{out.checks.push({n,ok:!!ok,...d});if(!ok)fail=true;console.log(ok?'통과':'실패',n,ok?'':JSON.stringify(d));};
const URLS={hiking:(ws,t)=>`${base}/hiking/?serverpick=on&server=${encodeURIComponent(ws)}&start=entrance&time=${t}&weather=clear&quality=balanced`,
 smoking:(ws,t)=>`${base}/smoking/?serverpick=on&server=${encodeURIComponent(ws)}&time=${t==='22:00'?'night':t==='18:00'?'dusk':'day'}`};
const SIZES={세로:[390,844,true],가로:[844,390,true],PC:[1920,1080,false],'세로-키보드':[390,430,true],'가로-키보드':[844,200,true]};
const layout=p=>p.evaluate(()=>{const w=[...document.querySelectorAll('.sp-wrap')].find(e=>!e.hidden);if(!w)return {missing:true};
 const vv=window.visualViewport,vw=innerWidth,vh=innerHeight,card=w.querySelector('.sp-card'),c=card.getBoundingClientRect();
 const els=[...w.querySelectorAll('button,input')].filter(e=>e.offsetParent&&!e.disabled||e.matches('input'));
 const small=els.filter(e=>e.offsetParent).map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.height<43.5||r.width<43.5).map(({e,r})=>`${e.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
 const outside=[...card.querySelectorAll('button,input')].filter(e=>e.offsetParent).map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.height>0&&(r.left<-.5||r.right>vw+.5)).map(({e})=>e.className);
 const sc=card.scrollHeight>card.clientHeight+1;
 return {small,outside,card:{x:Math.round(c.x),y:Math.round(c.y),w:Math.round(c.width),h:Math.round(c.height)},vh,scrolls:sc,cardInView:c.top>=-.5&&c.bottom<=vh+.5&&c.left>=-.5&&c.right<=vw+.5,
  noteVisible:!w.querySelector('.sp-note').hidden,overflowX:card.scrollWidth>card.clientWidth+1};});
async function shotCase(exp,state,sizeKey,tod){
 const [w,h,touch]=SIZES[sizeKey];
 const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,hasTouch:touch,isMobile:touch});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('online-smoking',JSON.stringify({nickname:'산이',seenIntro:true,muted:true}));});
 const p=await ctx.newPage();
 p.on('pageerror',e=>out.errors.push(`${exp}/${state}/${sizeKey}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket|favicon|Failed to load|ERR_CONNECTION/.test(m.text()))out.errors.push(`${exp}/${state}/${sizeKey}: ${m.text()}`);});
 const ws=state==='꽉참'?ws2:state==='연결실패'?'ws://127.0.0.1:9':ws1;
 await p.goto(URLS[exp](ws,tod==='밤'?'22:00':tod==='노을'?'18:00':'13:00'));
 await p.waitForSelector('.sp-wrap:not([hidden]) .sp-row',{timeout:180000});
 await p.waitForFunction(s=>{const e=document.querySelector('.sp-wrap:not([hidden])');return e&&e.dataset.net===(s==='연결실패'?'error':'ok');},state,{timeout:15000});
 if(sizeKey.includes('키보드'))await p.focus('.sp-wrap:not([hidden]) input');
 await p.waitForTimeout(800);
 const TONE={낮:'day',노을:'dusk',밤:'night'}[tod];
 await p.evaluate(t=>{const r=document.documentElement,pin=()=>{if(r.dataset.hudTime!==t)r.dataset.hudTime=t;};pin();new MutationObserver(pin).observe(r,{attributes:true,attributeFilter:['data-hud-time']});},TONE); // 서버 창 톤은 시험에서 고정(실제로는 지금 시각을 따름)
 await p.waitForTimeout(150);
 const L=await layout(p),tag=`${exp}-${state}-${sizeKey}-${tod}`;
 const kb=sizeKey.includes('키보드');
 check(`${tag}: 단추 44px 이상·가로 안`,!L.missing&&!L.small.length&&!L.outside.length&&!L.overflowX,L);
 check(`${tag}: 창이 화면 안(안 되면 안에서 스크롤)`,L.cardInView,L);
 if(state==='일반'&&!kb)check(`${tag}: 스크롤 없이 한 화면`,!L.scrolls,L);
 const hud=await p.evaluate(()=>({t:document.documentElement.dataset.hudTime,bg:getComputedStyle(document.querySelector('.sp-card')).backgroundColor}));
 if(tod!=='낮')check(`${tag}: ${tod} 종이 톤`,hud.bg!=='rgb(251, 243, 223)',hud);
 await p.screenshot({path:`${dir}/${tag}.png`});
 await ctx.close();return L;
}
try{
 const S=['일반','꽉참','연결실패'];
 for(const exp of ['hiking','smoking'])for(const sz of ['세로','가로','PC'])for(const st of S)await shotCase(exp,st,sz,'낮');
 for(const exp of ['hiking','smoking'])for(const sz of ['세로-키보드','가로-키보드'])await shotCase(exp,'일반',sz,'낮');
 for(const exp of ['hiking','smoking'])for(const sz of ['세로','가로'])for(const t of ['노을','밤'])await shotCase(exp,'일반',sz,t);
 for(const exp of ['hiking','smoking'])await shotCase(exp,'꽉참','세로','밤');
}catch(e){fail=true;check('오류',false,{message:e.message});}
check('콘솔 오류 없음',!out.errors.length,{errors:out.errors});
writeFileSync(`${dir}/report.json`,JSON.stringify(out,null,1));
for(const s of socks)s.close();await browser.close();await vite.close();await srv.close?.();await small.close?.();
process.exit(fail?1:0);
