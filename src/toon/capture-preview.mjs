// 카툰 미리보기 낮·노을·밤 캡처. 개발 서버(vite)를 띄운 뒤: node src/toon/capture-preview.mjs [http://127.0.0.1:5191] [출력 폴더]
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5191',out=process.argv[3]??'artifacts/toon-2026-11-05';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text());});
await page.goto(`${base}/src/toon/preview.html`,{waitUntil:'load'});
await page.waitForFunction(()=>window.toonPreview?.frames>10,null,{timeout:60000});
for(const [name,el] of [['day',35],['sunset',2],['night',-20]]){
 await page.evaluate(v=>window.toonPreview.setElevation(v),el);
 await page.waitForFunction(n=>window.toonPreview.frames>n+20,await page.evaluate(()=>window.toonPreview.frames));
 await page.screenshot({path:`${out}/toon-preview-${name}.png`});
 console.log(name,JSON.stringify(await page.evaluate(()=>({phase:window.toonPreview.status.phase,bloom:window.toonPreview.status.pipeline.bloom,outline:window.toonPreview.status.pipeline.outline,materials:window.toonPreview.status.materials}))));
}
console.log('errors',JSON.stringify(errors));
await browser.close();
