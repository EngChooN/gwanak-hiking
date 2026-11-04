// HUD 기준선·결과 캡처. 사용: BASE_URL=http://127.0.0.1:5301 TAG=before node scripts/capture-hud.mjs
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const dir='artifacts/v2/hud';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5301',tag=process.env.TAG??'after';
const cases=[['desktop',{width:1440,height:900},false],['phone-portrait',{width:390,height:844},true],['phone-landscape',{width:844,height:390},true]];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
for(const [name,viewport,touch] of cases){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:touch?2:1,isMobile:touch,hasTouch:touch});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?start=plaza&time=12:00&weather=clear&quality=low`);
 await page.waitForFunction(()=>window.hiking?.started,null,{timeout:300000});await page.waitForTimeout(2500);
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.screenshot({path:`${dir}/${tag}-${name}.png`});console.log(name,errors);await ctx.close();
}
await browser.close();
