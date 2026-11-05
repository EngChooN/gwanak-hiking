// 귀여운 캐릭터 시안 캡처. 개발 서버(vite)를 띄운 뒤: node scripts/capture-mascot-concepts.mjs [http://127.0.0.1:5191] [출력 폴더]
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5191',out=process.argv[3]??'artifacts/mascot-concepts';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const errors=[];
async function open(url,viewport){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/src/toon/mascot-concepts.html?hud=0&${url}`,{waitUntil:'load'});
 await page.waitForFunction(()=>window.mascot?.frames>8,null,{timeout:90000});return page;
}
const settle=async page=>{const n=await page.evaluate(()=>window.mascot.frames);await page.waitForFunction(k=>window.mascot.frames>k+6,n);};
const only=process.argv[4]?.split(',');
{const page=await open('c=-1&ref=1&view=front&t=1.2',{width:1800,height:760});
 if(!only||only.includes('lineup')){await settle(page);await page.screenshot({path:`${out}/lineup.png`});
  await page.evaluate(()=>window.mascot.set({view:'three'}));await settle(page);await page.screenshot({path:`${out}/lineup-three.png`});}
 await page.close();}
const page=await open('c=0&view=three&t=1.2',{width:700,height:860});
for(let c=0;c<6;c++){
 if(only&&!only.includes(String(c)))continue;
 for(const [view,walk,t] of [['three',0,1.2],['front',0,1.2],['side',1,.13],['back',0,1.2]]){
  await page.evaluate(o=>window.mascot.set(o),{c,view,walk,t});await settle(page);
  await page.screenshot({path:`${out}/c${c}-${view}${walk?'-walk':''}.png`});
 }
}
console.log('errors',JSON.stringify(errors));
await browser.close();
