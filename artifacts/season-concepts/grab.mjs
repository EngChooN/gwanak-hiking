// 사계절 시안 바탕 화면 찍기: 화면(HUD)을 숨기고 출발 지점별로 낮 장면을 찍는다.
import {chromium} from '@playwright/test';
import {waitChunks} from '../../scripts/lib/chunk-wait.mjs';
const base='http://127.0.0.1:5322';
const shots=(process.argv[2]??'entrance,demo,gate').split(',');
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
for(const st of shots){
 const ctx=await b.newContext({viewport:{width:1440,height:900}});
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto(`${base}/?start=${st}&time=11:00&weather=clear&quality=high&jump=off`);
 await p.waitForFunction(()=>window.hiking?.started,null,{timeout:300000});await p.waitForTimeout(2500);
 await p.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.dispatchEvent(new CustomEvent('hiking:hud-toggle'));});
 await p.mouse.move(2,2);await waitChunks(p);await p.waitForTimeout(1500);
 await p.evaluate(()=>{[...document.querySelectorAll('body *')].filter(e=>/다시 보기|화면 보이기/.test(e.textContent)&&e.children.length<4&&e.getBoundingClientRect().height<80).forEach(e=>e.style.visibility='hidden');document.querySelectorAll('#source-line,.source-line').forEach(e=>e.style.visibility='hidden');});
 await p.screenshot({path:`artifacts/season-concepts/base/${st}.png`});console.log('ok',st);
 await ctx.close();
}
await b.close();
