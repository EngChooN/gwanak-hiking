// 밤 가로등 깜빡임 측정. 광장에서 3인칭으로 카메라를 돌리며 연속 캡처한다.
// 사용: PORT=5190 node scripts/measure-lamp-flicker.mjs <tag> [high|balanced|low] [turn|walk]
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';
const [tag='now',quality='high',mode='turn']=process.argv.slice(2),port=process.env.PORT??5190,dir=`artifacts/lamp-flicker-2026-11-04/${tag}-${quality}-${mode}`;mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hud-hidden','1');});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/?start=entrance&outfit=4&time=20:30&weather=clear&quality=${quality}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
 const view=await page.evaluate(()=>hiking.snapshot().view);if(view!=='third')await page.keyboard.press('v');
 await page.waitForTimeout(4000);
 await page.keyboard.down(mode==='walk'?'w':'e');
 const frames=[];const t0=Date.now();
 for(let i=0;i<60;i++){const p=`${dir}/${String(i).padStart(3,'0')}.png`;await page.screenshot({path:p});frames.push({i,t:Date.now()-t0});}
 await page.keyboard.up(mode==='walk'?'w':'e');
 const info=await page.evaluate(()=>({night:hiking.night(),quality:hiking.metrics().quality,mood:hiking.rendering().mood}));
 writeFileSync(`${dir}/frames.json`,JSON.stringify({frames,info,errors},null,1));console.log(tag,quality,mode,JSON.stringify(info.night.pool),info.quality,info.mood,errors.slice(0,3));
}finally{await browser.close();}
