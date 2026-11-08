// 정상에서 쌍안경으로 서울 도심(북쪽)을 볼 때 시간 경과별 캡처. node scripts/capture-bino-city.mjs [bearing] [추가쿼리]
import {chromium} from '@playwright/test';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5175',dir='artifacts/bino-city';
const [bearing='355',extra='']=process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1280,height:720}});
await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s:route.length-.02,view:'first'},key:SAVE_KEY});
const page=await context.newPage();page.on('pageerror',e=>console.log('pageerror',e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log(m.type(),m.text().slice(0,200));});
await page.goto(`${base}/hiking/?quality=balanced&time=13:00&weather=clear&bearing=${bearing}${extra}`);
await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
const cmd=(id,v)=>page.evaluate(([id,v])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value:v}})),[id,v]);
await page.waitForTimeout(4000);await page.screenshot({path:`${dir}/0-naked.png`});
await cmd('binoculars');
for(const t of [300,1500,5000,12000]){await page.waitForTimeout(t===300?300:t-[300,1500,5000,12000][[300,1500,5000,12000].indexOf(t)-1]);await page.screenshot({path:`${dir}/1-bino-${t}ms.png`});}
console.log(JSON.stringify(await page.evaluate(()=>hiking.gadgetView())));
for(let i=0;i<4;i++)await cmd('zoom-in');await page.waitForTimeout(6000);await page.screenshot({path:`${dir}/2-bino-max.png`});
console.log(JSON.stringify(await page.evaluate(()=>hiking.gadgetView())));
await browser.close();
