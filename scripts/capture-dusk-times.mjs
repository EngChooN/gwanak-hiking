// 일몰 전후(17:10·18:30·20:30)와 낮 15시 화면 캡처 + 배지 아이콘 기록. 사용: BASE_URL=... [WEATHER=clear] [TAG=after] node scripts/capture-dusk-times.mjs [시각...]
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';import {initialState,SAVE_KEY} from '../src/movement.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5195',tag=process.env.TAG??'after',weather=process.env.WEATHER??'clear',dir=`artifacts/dusk-times/${tag}`;mkdirSync(dir,{recursive:true});
const times=process.argv.slice(2).length?process.argv.slice(2):['15:00','17:10','18:30','20:30'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const time of times){
 const ctx=await browser.newContext({viewport:{width:1440,height:900}}),errors=[];
 await ctx.addInitScript(({seed,key})=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem(key,JSON.stringify(seed));},{seed:{...initialState(),s:route.length-120,view:'first',paused:true},key:SAVE_KEY});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?outfit=2&time=${time}&weather=${weather}&quality=balanced`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,null,{timeout:240000});
 await page.waitForTimeout(6000); // 하늘·조명이 목표값에 수렴할 시간
 const chip=await page.evaluate(()=>document.getElementById('env-chip').innerText.replace(/\s+/g,' '));
 await page.screenshot({path:`${dir}/${time.replace(':','')}-${weather}.png`});
 rows.push({time,weather,chip,errors});console.log(time,weather,chip,errors.length);await ctx.close();}
}finally{await browser.close();}
writeFileSync(`${dir}/results-${weather}.json`,JSON.stringify(rows,null,2));
