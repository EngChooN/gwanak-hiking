// 계단 구간 3인칭·1인칭 카메라 높이 시계열 측정. 사용: node stair-cam.mjs <라벨> <출력폴더>
import {chromium} from '@playwright/test';
import {initialState} from '../src/movement.js';
import {writeFileSync,mkdirSync} from 'node:fs';
const [label='before',out='/tmp/ghrepro']=process.argv.slice(2);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ctx=await browser.newContext({viewport:{width:1280,height:720}});const page=await ctx.newPage();
page.on('pageerror',e=>console.log('ERR',e.message));
const results={};
for(const [name,s,view,key] of [['up-third',3720,'third','w'],['down-third',4560,'third','w'],['up-first',3720,'first','w']]){
 const seeded={...initialState(),s,view,paused:false};
 await page.goto('http://127.0.0.1:5173/hiking/?outfit=1&quality=balanced&time=12:00&weather=clear');
 await page.evaluate(v=>localStorage.setItem('gwanak-hiking:v1',v),JSON.stringify(seeded));
 await page.reload();await page.waitForFunction(()=>window.hiking?.started,null,{timeout:180000});
 if((await page.evaluate(()=>window.hiking.snapshot().paused)))await page.keyboard.press('Space');
 await page.waitForTimeout(800);
 const rec=page.evaluate(()=>new Promise(res=>{const rows=[],t0=performance.now();const tick=()=>{const o=window.hiking.orientation(),c=window.hiking.coordinates();rows.push({t:(performance.now()-t0)/1000,ground:c.y,camera:o.camera[1]});if(performance.now()-t0<6000)requestAnimationFrame(tick);else res(rows);};requestAnimationFrame(tick);}));
 await page.keyboard.down(key);await page.waitForTimeout(6100);await page.keyboard.up(key);
 const rows=await rec;
 // 카메라 높이의 2차 차분(가속) 크기로 들썩임을 수치화한다. 지면 평균 기울기를 뺀 잔차도 남긴다.
 const acc=[];for(let i=1;i<rows.length-1;i++){const a=rows[i-1],b=rows[i],c=rows[i+1],d1=(b.camera-a.camera)/Math.max(1e-3,b.t-a.t),d2=(c.camera-b.camera)/Math.max(1e-3,c.t-b.t);acc.push(Math.abs(d2-d1)/Math.max(1e-3,(c.t-a.t)/2));}
 const maxJump=Math.max(...rows.slice(1).map((r,i)=>Math.abs(r.camera-rows[i].camera)));
 acc.sort((a,b)=>a-b);
 results[name]={frames:rows.length,maxFrameJumpM:maxJump,accelP95:acc[Math.floor(acc.length*.95)],accelMax:acc.at(-1),rows};
 console.log(label,name,'frames',rows.length,'maxFrameJump',maxJump.toFixed(4),'accelP95',results[name].accelP95.toFixed(2),'accelMax',results[name].accelMax.toFixed(2));
}
writeFileSync(`${out}/stair-camera-${label}.json`,JSON.stringify(results));
await browser.close();
