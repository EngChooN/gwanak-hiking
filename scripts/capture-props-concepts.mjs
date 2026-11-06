// 산스장·초콜릿·벤치·동물·먼지털이기 시안 캡처. 개발 서버(vite)를 띄운 뒤: node scripts/capture-props-concepts.mjs [http://127.0.0.1:5191] [출력 폴더] [장면,장면]
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5191',out=process.argv[3]??'artifacts/props-concepts';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const errors=[];const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`${base}/src/toon/props-concepts.html?hud=0`,{waitUntil:'load'});
await page.waitForFunction(()=>window.props?.frames>8,null,{timeout:90000});
const only=process.argv[4]?.split(',');
for(const id of await page.evaluate(()=>window.props.ids)){
 if(only&&!only.includes(id))continue;
 await page.evaluate(i=>window.props.show(i),id);const n=await page.evaluate(()=>window.props.frames);await page.waitForFunction(k=>window.props.frames>k+6,n);
 await page.screenshot({path:`${out}/${id}.png`});
}
console.log('errors',JSON.stringify(errors));
await browser.close();
