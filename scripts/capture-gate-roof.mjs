// 일주문 지붕 시안 캡처. 개발 서버(5173)에서 입구 출발 화면을 찍는다.
//   node scripts/capture-gate-roof.mjs [접미사] [base]
import {chromium} from '@playwright/test';
const [suffix='before',base='http://127.0.0.1:5173']=process.argv.slice(2),out='artifacts/gate-roof-2026-11-06';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
for(const [name,q,walk] of [['near','time=12:00',9000],['close','time=12:00',14500],['dusk','time=17:20',12000]]){
 for(let attempt=0;attempt<5;attempt++)try{
 const page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
 await page.goto(`${base}/hiking/?outfit=1&start=entrance&weather=clear&${q}`);
 await page.waitForFunction(()=>!!window.hiking?.ready,null,{timeout:120000});
 await page.evaluate(()=>window.hiking.ready());
 await page.waitForFunction(()=>window.hiking.started===true,null,{timeout:300000});
 await page.evaluate(()=>window.hiking.chunks?.ready?.());
 await page.waitForTimeout(2000);
 if(walk){await page.mouse.click(640,300);await page.keyboard.down('w');await page.waitForTimeout(walk);await page.keyboard.up('w');await page.waitForTimeout(1500);}
 await page.screenshot({path:`${out}/${name}-${suffix}.png`});break;
 }catch(e){console.error(name,'재시도',attempt+1,e.message.split('\n')[0]);}
}
await browser.close().catch(()=>{});
