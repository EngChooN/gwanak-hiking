// 등산 채팅 HUD 캡처·점검(2026-11-08). 로컬 함께 걷기 서버 + 브라우저 2개(보는 사람 A, 말하는 사람 B)로
// 390×844·844×390·1920×1080 × 낮·밤에서: 💬 버튼은 참가 후에만 · 채팅 창·칩 · 말풍선 · 입력 가림 · 44px · 입력 중 단축키 막힘을 확인한다.
//   node scripts/capture-hiking-chat.mjs   → artifacts/multi-chat-2026-11-08/hiking-chat-*.png, hiking-chat-report.json. 하나라도 실패하면 종료 코드 1.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-chat-2026-11-08',multiPort=Number(process.env.MULTI_PORT??8788),room='채팅캡처';mkdirSync(dir,{recursive:true});
let vite=null,pageUrl=process.env.PAGE_URL;
if(!pageUrl){const {createServer}=await import('vite');const port=Number(process.env.PORT??5198);vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();pageUrl=`http://127.0.0.1:${port}`;}
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data-chat`},{quiet:true});await srv.ready;
const wsUrl=`ws://127.0.0.1:${multiPort}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={at:new Date().toISOString(),checks:[],errors:[]},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(name,ok,info)=>{out.checks.push({name,ok:!!ok,info});console.log(ok?'✓':'✗',name,ok?'':JSON.stringify(info));};
async function open(name,viewport,time,mobile,join=true){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:mobile,isMobile:mobile});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const p=await ctx.newPage();p.ctx=ctx;
 p.on('pageerror',e=>out.errors.push(`${name}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket connection|favicon/.test(m.text()))out.errors.push(`${name}: ${m.text()}`);});
 const q=join?`multi=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}&server=${encodeURIComponent(wsUrl)}&`:`server=${encodeURIComponent(wsUrl)}&`;
 await p.goto(`${pageUrl}/hiking/?${q}start=entrance&time=${time}&weather=clear&quality=balanced`);
 await p.waitForFunction(()=>window.hiking?.started,null,{timeout:180000});
 return p;
}
const SIZES=[['phone-portrait',{width:390,height:844},true],['phone-landscape',{width:844,height:390},true],['pc',{width:1920,height:1080},false]];
const TIMES=[['day','13:00'],['night','22:30']];
for(const [sn,vp,mobile] of SIZES)for(const [tn,time] of TIMES){
 const tag=`${sn}-${tn}`;
 // 참가 전: 💬 버튼이 없어야 한다
 const solo=await open('혼자',vp,time,mobile,false);
 await sleep(1500);
 check(`${tag} 혼자일 때 💬 숨김`,await solo.evaluate(()=>{const b=document.querySelector('.hc-btn');return !b||b.hidden||getComputedStyle(b).display==='none';}));
 await solo.ctx.close();
 const A=await open('가나',vp,time,mobile),B=await open('다라',{width:800,height:600},time,false);
 await A.waitForFunction(()=>window.hiking.multi?.()?.roster?.length>=1,null,{timeout:30000});
 await sleep(800);
 // B를 A 앞 6m 쯤으로 옮긴다(A는 그대로, 시선 방향은 알 수 없으니 A를 B 쪽으로 돌려 본다)
 const ap=await A.evaluate(()=>window.hiking.multi().roster[0]);
 check(`${tag} 참가 후 💬 버튼 보임`,await A.evaluate(()=>{const b=document.querySelector('.hc-btn');return b&&!b.hidden&&getComputedStyle(b).display!=='none';}));
 const btnBox=await A.evaluate(()=>{const r=document.querySelector('.hc-btn').getBoundingClientRect(),c=document.querySelector('.me-chip')?.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y,r:r.right,b:r.bottom,chip:c&&{x:c.x,r:c.right,y:c.y,b:c.bottom}};});
 check(`${tag} 💬 버튼 44px 이상·화면 안`,btnBox.w>=44&&btnBox.h>=44&&btnBox.x>=0&&btnBox.r<=vp.width&&btnBox.y>=0&&btnBox.b<=vp.height,btnBox);
 if(btnBox.chip)check(`${tag} 💬 버튼이 상태 칩과 겹치지 않음`,btnBox.x>=btnBox.chip.r-1||btnBox.r<=btnBox.chip.x+1||btnBox.y>=btnBox.chip.b||btnBox.b<=btnBox.chip.y,btnBox);
 // 열기
 await A.click('.hc-btn');await sleep(300);
 const geo=await A.evaluate(()=>{const q=s=>document.querySelector(s).getBoundingClientRect(),p=q('.hc-panel');
  const small=[...document.querySelectorAll('.hc-panel button,.hc-panel input,.hc-btn')].map(e=>e.getBoundingClientRect()).filter(r=>r.width&&(r.height<43.5||r.width<43.5));
  return {panel:{x:p.x,y:p.y,r:p.right,b:p.bottom},inside:p.x>=0&&p.y>=0&&p.right<=innerWidth&&p.bottom<=innerHeight,small:small.length,chips:document.querySelectorAll('.hc-chip').length,font:parseFloat(getComputedStyle(document.querySelector('.hc-form input')).fontSize)};});
 check(`${tag} 채팅 창이 화면 안`,geo.inside,geo);check(`${tag} 버튼·입력칸 44px 이상`,geo.small===0,geo);check(`${tag} 칩 4~6개`,geo.chips>=4&&geo.chips<=6,geo);check(`${tag} 입력 글자 16px 이상`,geo.font>=16,geo);
 // 입력 중 단축키 막기: 입력칸에서 r·c·f를 눌러도 window keydown에 닿지 않는다
 await A.evaluate(()=>{window.__keys=0;addEventListener('keydown',()=>window.__keys++);});
 if(!mobile){await A.focus('.hc-form input');await A.keyboard.type('rcf');const k=await A.evaluate(()=>window.__keys);check(`${tag} 입력 중 단축키가 걷기에 안 닿음`,k===0,k);await A.fill('.hc-form input','');}
 // 말하기: B가 칩 없이 직접 보냄 → A에 기록·말풍선
 await B.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'정상에서 봐요 ⛰'}})));
 await A.waitForFunction(()=>document.querySelectorAll('.hc-log p b').length>=1,null,{timeout:10000}).catch(()=>{});
 await A.click('.hc-chip >> nth=1');await sleep(500);
 const log=await A.evaluate(()=>[...document.querySelectorAll('.hc-log p')].map(p=>p.textContent));
 check(`${tag} 기록에 내 글·상대 글`,log.some(t=>t.includes('같이 가요'))&&log.some(t=>t.includes('정상에서 봐요')),log);
 const bub=await A.evaluate(()=>[...document.querySelectorAll('.hc-bub')].map(b=>({t:b.textContent,disp:b.style.display,tr:b.style.transform})));
 check(`${tag} 말풍선이 생김`,bub.length>=1,bub);
 // 너무 빨리 → 안내
 await A.click('.hc-chip >> nth=0');await A.click('.hc-chip >> nth=2');await sleep(400);
 const hint=await A.evaluate(()=>{const h=document.querySelector('.hc-hint');return h.hidden?'':h.textContent;});
 check(`${tag} 너무 빠르면 '잠깐만요' 안내`,/잠깐만요, 조금 천천히/.test(hint),hint);
 await sleep(300);await (await waitChunks(A)).screenshot({path:`${dir}/hiking-chat-${tag}.png`});
 // 4초 뒤 말풍선 사라짐
 await sleep(4600);
 check(`${tag} 말풍선 4초 뒤 사라짐`,await A.evaluate(()=>document.querySelectorAll('.hc-bub').length===0));
 // 접기 → 💬 새 글 점
 await A.click('.hc-x');await B.evaluate(()=>dispatchEvent(new CustomEvent('hiking:chat-send',{detail:{text:'쉬었다 가요'}})));await sleep(800);
 check(`${tag} 접힌 뒤 새 글 점`,await A.evaluate(()=>!document.querySelector('.hc-dot').hidden&&document.querySelector('.hc-panel').hidden));
 // 나가기 → 버튼 사라짐
 await A.evaluate(()=>dispatchEvent(new CustomEvent('hiking:multi-leave')));await sleep(500);
 check(`${tag} 나가면 💬 숨김`,await A.evaluate(()=>document.querySelector('.hc-btn').hidden));
 await A.ctx.close();await B.ctx.close();
}
check('콘솔 오류 없음',out.errors.length===0,out.errors.slice(0,5));
writeFileSync(`${dir}/hiking-chat-report.json`,JSON.stringify(out,null,1));
await browser.close();await srv.close?.();await vite?.close();
const bad=out.checks.filter(c=>!c.ok);console.log(bad.length?`실패 ${bad.length}개`:'모두 통과');process.exit(bad.length?1:0);
