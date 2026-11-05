// 시각·날씨 장면 캡처와 fps 측정. ONLY=이름,이름  FPS=1 이면 fps(10초)도 잰다. VIEW=first|third POS=누적m
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const dir='artifacts/environment',base=process.env.BASE_URL??'http://127.0.0.1:5176';mkdirSync(dir,{recursive:true});
const scenes={
 'day-clear':'time=12:00&weather=clear','predawn':'time=05:00&weather=clear','dawn':'time=06:45&weather=clear','evening':'time=17:05&weather=clear','night':'time=21:30&weather=clear',
 'rain':'time=14:00&weather=rain&level=medium&wind=5','snow':'time=14:00&weather=snow&level=medium','fog':'time=10:00&weather=fog','cloudy':'time=13:00&weather=overcast',
 'night-rain':'time=22:00&weather=rain&level=heavy','legacy-pm':'sun=pm&weather=clear'
};
const positions={entrance:0,valley:1600,ridge:4250,summit:route.length-30};
const only=process.env.ONLY?.split(',')??Object.keys(scenes),pos=process.env.POS?.split(',')??['valley'],view=process.env.VIEW??'first',tag=process.env.TAG??'';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const name of only)for(const p of pos){
 const m=positions[p]??Number(p),seg=route.segments.find(s=>s.b.referenceMetres>=m)??route.segments.at(-1);
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s:seg.start,view,paused:true}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',c=>{if(c.type()==='error')errors.push(c.text());});
 await page.goto(`${base}/?quality=high&${scenes[name]??name}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
 await page.waitForTimeout(9000);
 const row={name,pos:p,view,environment:await page.evaluate(()=>{const r=hiking.rendering();return r.environment;}),errors};
 if(process.env.UI!=='1')await page.addStyleTag({content:'#app,.source-line{visibility:hidden}'});
 await (await waitChunks(page)).screenshot({path:`${dir}/${name}-${p}-${view}${tag}.png`});
 if(process.env.FPS==='1'){
  await page.evaluate(()=>{window.__f=[];const f=t=>{__f.push(t);requestAnimationFrame(f);};requestAnimationFrame(f);});await page.waitForTimeout(10000);
  row.fps=await page.evaluate(()=>{const a=__f,s=(a.at(-1)-a[0])/1000;return +(a.length/s).toFixed(2);});
 }
 rows.push(row);console.log(JSON.stringify({name,p,view,fps:row.fps,env:row.environment&&{t:row.environment.time,w:row.environment.weather,fog:row.environment.fogDistance,light:row.environment.lightIntensity,amb:row.environment.ambient,exp:row.environment.exposure},errors}));
 await context.close();
}}finally{await browser.close();}
writeFileSync(`${dir}/result${tag}${process.env.ONLY?'-'+process.env.ONLY.replace(/,/g,'_'):''}.json`,JSON.stringify(rows,null,2));
