// 화면 캡처: node scripts/capture.mjs <이름> [w] [h] [query] [js(평가할 코드)] [기다릴ms]
// 개발 서버(npm run dev, 5173)를 먼저 띄운다. 결과: artifacts/smoking/<이름>.png
import {chromium} from 'playwright';
const [name='shot',w='1280',h='800',query='',js='',wait='2500']=process.argv.slice(2);
import {mkdirSync} from "node:fs";mkdirSync("artifacts/smoking",{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const mobile=+w<900;
const page=await browser.newPage({viewport:{width:+w,height:+h},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
const logs=[];page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text());});page.on('pageerror',e=>logs.push('pageerror: '+e.message));
await page.goto(`${process.env.BASE_URL??"http://127.0.0.1:5173"}/smoking/?capture=1&${query}`);
await page.waitForFunction(()=>window.lounge,null,{timeout:60000}).catch(e=>logs.push('timeout '+e.message));
if(js)await page.evaluate(js).catch(e=>logs.push('eval: '+e.message));
await page.waitForTimeout(+wait);
await page.screenshot({path:`artifacts/smoking/${name}.png`});
const st=await page.evaluate(()=>window.lounge?.status?.()).catch(()=>null);
console.log(JSON.stringify(st));if(logs.length)console.log(logs.slice(0,15).join('\n'));
await browser.close();
