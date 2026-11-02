// 개발 서버(기본 5176)를 정상 위치에서 바로 연 창으로 띄운다. 창을 닫으면 종료된다.
import {chromium} from '@playwright/test';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const port=process.env.PORT||5176;// AT=start면 등산로 초입, 그 외는 정상
const s=process.env.AT==='start'?1:route.length-.02;const bearing=process.env.BEARING||'';// 방향을 고정하면 드래그로 둘러보기가 안 되므로 기본은 비움
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--enable-webgl','--ignore-gpu-blocklist','--start-maximized']});
const context=await browser.newContext({viewport:null});
await context.addInitScript(({seed,key})=>{if(!sessionStorage.getItem('summit-seeded')){localStorage.setItem(key,JSON.stringify(seed));sessionStorage.setItem('summit-seeded','1');}},{seed:{...initialState(),s,view:'first',paused:true},key:SAVE_KEY});
const page=await context.newPage();await page.goto(`http://127.0.0.1:${port}/`+(bearing?`?bearing=${bearing}`:''));
console.log('opened summit view');
await new Promise(r=>browser.on('disconnected',r));
