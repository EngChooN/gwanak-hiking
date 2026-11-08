// 로딩 화면 상태별 캡처: 진행 중(데스크톱·모바일), 준비 완료(출발하기 버튼), 걷힌 직후, 실패(다시 시도), 30초 정체.
// 사용: BASE_URL=http://127.0.0.1:5195 node scripts/capture-loading-states.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/loading-lighting/after',base=process.env.BASE_URL??'http://127.0.0.1:5195';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const out={};
try{
 // 1) 모바일 진행 중 + 준비 완료 버튼 + 클릭 후 걷힘 (수동 시작)
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const pg=await ctx.newPage(),errors=[];pg.on('pageerror',e=>errors.push(e.message));pg.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const t0=Date.now();await pg.goto(`${base}/hiking/?start=entrance&outfit=1&quality=low&time=15:00&weather=clear&startMode=manual`);
 await pg.waitForTimeout(9000);await (await waitChunks(pg)).screenshot({path:`${dir}/loading-mobile-progress.png`});
 out.mobileProgress=await pg.evaluate(()=>({pct:document.querySelector('.ls-percent').textContent,overflowX:document.documentElement.scrollWidth>innerWidth,card:document.querySelector('.ls-card').getBoundingClientRect().toJSON()}));
 await pg.waitForFunction(()=>document.querySelector('#loading-screen')?.dataset.phase==='ready',null,{timeout:240000});
 out.readyAtMs=Date.now()-t0;await pg.waitForTimeout(600);await (await waitChunks(pg)).screenshot({path:`${dir}/loading-mobile-ready.png`});
 out.buttonVisible=await pg.evaluate(()=>{const b=document.querySelector('.ls-action');return !b.hidden&&b.textContent;});
 out.startedBeforeClick=await pg.evaluate(()=>hiking.started);out.elapsedBeforeClick=await pg.evaluate(()=>hiking.snapshot().elapsed);
 await pg.tap('.ls-action');await pg.waitForFunction(()=>hiking.started,null,{timeout:10000});await pg.waitForTimeout(250);
 out.afterClick={started:await pg.evaluate(()=>hiking.started),fading:await pg.evaluate(()=>document.querySelector('#loading-screen')?.className??'removed')};
 await pg.waitForTimeout(1500);out.removed=await pg.evaluate(()=>!document.getElementById('loading-screen'));
 await (await waitChunks(pg)).screenshot({path:`${dir}/loading-mobile-after.png`});out.errors=errors;await ctx.close();
 // 2) 실패: hiking:loading error 이벤트(실제 신호 형식) 주입 → 다시 시도 버튼
 const c2=await browser.newContext({viewport:{width:1440,height:900}});const p2=await c2.newPage();
 await p2.route('**/assets/realistic/generated/**',r=>r.abort());
 await p2.goto(`${base}/hiking/?start=entrance&outfit=1&quality=low`);
 const ok=await p2.waitForFunction(()=>document.querySelector('#loading-screen')?.dataset.phase==='error',null,{timeout:90000}).then(()=>true).catch(()=>false);
 out.failure={reached:ok,message:await p2.evaluate(()=>document.querySelector('.ls-message')?.textContent),button:await p2.evaluate(()=>{const b=document.querySelector('.ls-action');return b&&!b.hidden?b.textContent:null;})};
 await (await waitChunks(p2)).screenshot({path:`${dir}/loading-error.png`});await c2.close();
}finally{await browser.close();}
writeFileSync(`${dir}/loading-states.json`,JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,1));
