// 경치 보강 최종 통합 7시점 캡처 + 시점별 fps. LABEL=after|sun-pm 등, ONLY=id, EXTRA=쿼리 추가
import {chromium} from '@playwright/test';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const label=process.env.LABEL??'final',extra=process.env.EXTRA??'',file=`artifacts/scenery-final-${label}.json`;
const rows=existsSync(file)?JSON.parse(readFileSync(file)):[];
const views=[['entrance','입구',1,null,'first'],['valley','계곡 숲길',route.length*.32,null,'first'],['ridge','능선',route.segments[310].start,null,'first'],['summit','정상',route.length-.02,null,'first'],
 ['north','정상에서 북쪽',route.length-.02,0,'first'],['northeast','북동쪽',route.length-.02,59,'first'],['west','능선에서 서쪽',route.segments[310].start,285,'first'],['third','3인칭',route.segments[310].start,null,'third']];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{for(const [id,name,s,bearing,view] of views){
 if(process.env.ONLY&&!process.env.ONLY.split(',').includes(id))continue;
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s,view,paused:true},key:SAVE_KEY});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('페이지 오류',e.message);});
 const diagnostic=setInterval(async()=>{try{console.log('준비 상태',id,await page.evaluate(()=>({ready:window.hiking?.landscape().ready,natureReady:window.hiking?.landscape().natureReady,errors:window.hiking?.landscape().errors})));}catch{}},45000);
 await page.goto(`http://127.0.0.1:5176/?quality=${process.env.QUALITY??'high'}${bearing===null?'':`&bearing=${bearing}&fov=55`}${extra}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
 clearInterval(diagnostic);await page.waitForTimeout(9000);
 if(view==='third'){await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(2000);}
 await page.evaluate(()=>window.__hikingPerformance.reset());await page.waitForTimeout(10000);
 const m=await page.evaluate(()=>({performance:__hikingPerformance.report(),rendering:hiking.rendering()}));
 await page.screenshot({path:`artifacts/scenery-final-${label}-${id}.png`});
 const row={id,name,s,bearing,view,errors,fps:m.performance.fps,performance:m.performance,rendering:m.rendering},at=rows.findIndex(x=>x.id===id);if(at>=0)rows[at]=row;else rows.push(row);
 console.log(label,id,m.performance.fps,errors,m.rendering.shaderErrors);writeFileSync(file,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
