// 거리 두 표시(진행/남은) 합 검증: 광장·일주문·산 안(demo). 사용: BASE_URL=... node scripts/check-distance-labels.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';import {mkdirSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5195',dir='artifacts/distance-labels';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{for(const start of ['entrance','gate','demo']){
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await ctx.newPage();await page.goto(`${base}/hiking/?quality=low&start=${start}&time=12:00&weather=clear&outfit=1`);
 await page.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});
 if(start==='demo'){await page.keyboard.down('w');await page.waitForTimeout(3000);await page.keyboard.up('w');}
 await page.waitForTimeout(1500);
 const t=await page.evaluate(()=>[document.getElementById('distance').textContent,document.getElementById('remaining').textContent]);
 const n=t.map(x=>Number(x.replace(/[^0-9,\/]/g,'').split('/').pop().replace(/,/g,'')));
 const done=Number(t[0].split('·').pop().split('/')[0].replace(/[^0-9]/g,''));
 console.log(start,JSON.stringify(t),'합=',done+n[1]);
 if(start==='entrance')await (await waitChunks(page)).screenshot({path:`${dir}/plaza.png`});
 await ctx.close();}}finally{await browser.close();}
