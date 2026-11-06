// 헤드랜턴 전후 캡처: 개발 서버를 띄운 뒤 node scripts/capture-headlamp.mjs [url] [출력 폴더] [before|after]
// 밤 산길에서 3인칭·셀카·앉기를 찍는다(키: V 3인칭, P→Y 셀카, C 앉기, L 헤드랜턴).
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const [base='http://127.0.0.1:5193',out='artifacts/hiker-run-hand-lamp-2026-11-06',suffix='after']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const p=await b.newPage({viewport:{width:1100,height:700}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(`${base}/?outfit=1&start=gate&time=23:00&weather=clear`);
await p.waitForFunction(()=>!!window.hiking?.ready,null,{timeout:180000});
await p.evaluate(()=>window.hiking.ready());
await p.waitForFunction(()=>window.hiking.started===true,null,{timeout:300000});
await p.evaluate(()=>window.hiking.chunks.ready());
await p.evaluate(()=>window.hiking.headlamp(true));
const settle=async()=>{await p.waitForTimeout(1800);};
await p.keyboard.press('KeyV');await settle();await p.screenshot({path:`${out}/lamp-third-${suffix}.png`});
await p.keyboard.press('KeyC');await p.waitForTimeout(2500);await p.screenshot({path:`${out}/lamp-sit-${suffix}.png`});
await p.keyboard.press('KeyC');await settle();
await p.keyboard.press('KeyV');await settle();
await p.keyboard.press('KeyP');await settle();await p.keyboard.press('KeyY');await p.waitForTimeout(2500);
await p.screenshot({path:`${out}/lamp-selfie-${suffix}.png`});
console.log(JSON.stringify(await p.evaluate(()=>({night:window.hiking.night().headlamp,view:window.hiking.gadgetView().selfie}))));
await b.close();
