// 장면마다 2×2(봄·여름·가을·겨울) 보드를 찍는다. 결과: shots/<장면>.png, shots/board-<장면>.png
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=p=>fileURLToPath(new URL(p,import.meta.url));mkdirSync(here('./shots'),{recursive:true});
const url=pathToFileURL(here('./사계절-시안.html')).href;
const b=await chromium.launch({channel:'chrome',headless:true});
for(const s of ['gate','entrance','summit']){
 const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`${url}?solo=1&scene=${s}`);await p.waitForSelector('body[data-ready="1"]');await p.locator('#grid').screenshot({path:here(`./shots/${s}.png`)});
 await p.goto(`${url}?scene=${s}`);await p.waitForSelector('body[data-ready="1"]');await p.screenshot({path:here(`./shots/board-${s}.png`),fullPage:true});
 console.log(s,errs.length?errs:'ok');await p.close();
}
await b.close();
