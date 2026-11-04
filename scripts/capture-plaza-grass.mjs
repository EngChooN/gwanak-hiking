// 입구 광장·일주문 포장 위 풀 제거 전후 비교(headless Chrome 1440×900, 낮 11시 맑음, 높음, 3인칭).
// 사용: TAG=before BASE_URL=http://127.0.0.1:5176 node scripts/capture-plaza-grass.mjs  (ONLY=plaza-third,gate-under 로 일부만)
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const tag=process.env.TAG??'after',dir=`artifacts/plaza-grass/${tag}`;mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5176',only=process.env.ONLY?.split(',');
const env='time=11:00&weather=clear&outfit=1&quality=high';
// [id, 출발, 카메라를 옆으로 끄는 픽셀(0=정면), 휠(음수=가까이)]
const specs=[
 ['plaza-third','entrance',0,0],
 ['gate-under','gate',0,0],
 ['gate-inner','gate',600,0],
 ['plaza-edge-left','entrance',-300,0],
 ['plaza-edge-right','entrance',300,0],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [id,start,drag,wheel] of specs){if(only&&!only.includes(id))continue;
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?start=${start}&${env}`);
 await page.waitForFunction(()=>window.hiking?.started&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:300000});
 await page.keyboard.press('v');await page.waitForTimeout(2500);
 if(drag){await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(720+drag,450,{steps:16});await page.mouse.up();}
 if(wheel)await page.mouse.wheel(0,wheel);
 await page.waitForTimeout(6000);
 await page.screenshot({path:`${dir}/${id}.png`});
 const row={id,start,drag,errors,shaderErrors:await page.evaluate(()=>hiking.rendering().shaderErrors),scenery:await page.evaluate(()=>{const s=hiking.metrics().landscape?.scenery;return s&&{visibleGrass:s.visibleGrass,visibleShrubs:s.visibleShrubs,pavedGrassCleared:s.pavedGrassCleared};})};
 rows.push(row);console.log(id,JSON.stringify(row));
 writeFileSync(`${dir}/results${only?'-'+only.join('-'):''}.json`,JSON.stringify(rows,null,2));await context.close();
}}finally{await browser.close();}
