// 쌍안경 윤곽·셀카 브이·3인칭 휴대폰 직후·셀카 광각 고정 전후 캡처. 사용: BASE_URL=... OUT=artifacts/gadget-fix/after node scripts/capture-gadget-fix.mjs
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {OUTFIT_SAVE_KEY} from '../src/outfit-config.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5192',out=process.env.OUT??'artifacts/gadget-fix/after',s=route.length*.12,outfits=(process.env.OUTFITS??'lime-polo,navy-zip,red-zip,floral-shirt').split(',');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),rows=[];
const open=async(view,outfit)=>{
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[];
 await context.addInitScript(({state,key,ok,outfit})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem(ok,outfit);},{state:{...initialState(),s,view},key:SAVE_KEY,ok:OUTFIT_SAVE_KEY,outfit});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/?quality=balanced&time=11:00&weather=clear`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
 await page.addStyleTag({content:'#pause-overlay{display:none!important}'});await page.waitForTimeout(1500);
 const cmd=(id,value)=>page.evaluate(([id,value])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}})),[id,value]);
 return {context,page,errors,cmd};
};
const only=process.env.ONLY?.split(',');
const run=async(name,view,outfit,cmds,wait,after)=>{
 if(only&&!only.includes(name.split('-')[0]))return;
 const {context,page,errors,cmd}=await open(view,outfit);
 for(const c of cmds)await cmd(...[].concat(c));
 await page.waitForTimeout(wait);await (await waitChunks(page)).screenshot({path:`${out}/${name}.png`});
 const info=await page.evaluate(()=>({...hiking.gadgetView()}));rows.push({name,info,errors:[...errors]});console.log(name,info.view,info.gadget,info.phone?.zoom,errors.length);
 await context.close();
};
try{
 await run('bino',  'first','navy-zip',['binoculars'],2500);
 await run('third','third','navy-zip',['phone'],450);
 for(const o of outfits)await run(`selfie-${o}`,'first',o,['phone','selfie'],3000);
}finally{await browser.close();}
writeFileSync(`${out}/capture.json`,JSON.stringify(rows,null,2));
