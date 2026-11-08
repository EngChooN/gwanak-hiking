import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const label=process.env.LABEL??'before';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const rows=process.env.CAPTURE_VIEW&&existsSync(`artifacts/scenery-forest-${label}.json`)?JSON.parse(readFileSync(`artifacts/scenery-forest-${label}.json`)):[];
try {
for(const [id,s,view,quality] of [['entrance',1,'first','high'],['valley',route.length*.32,'first','high'],['ridge',route.segments[310].start,'first','high'],['summit',route.length-.02,'first','high'],['third',route.segments[310].start,'third','high'],['third-low',route.segments[310].start,'third','low']]) {
 if(process.env.CAPTURE_VIEW&&!process.env.CAPTURE_VIEW.split(',').includes(id))continue;
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(({state,key})=>localStorage.setItem(key,JSON.stringify(state)),{state:{...initialState(),s,view,paused:true},key:SAVE_KEY});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5176/hiking/?quality=${quality}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
 await page.waitForTimeout(14000);
 if(view==='third'){await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(2000);}
 await page.evaluate(()=>window.__hikingPerformance.reset());await page.waitForTimeout(10000);
 const result=await page.evaluate(()=>({performance:window.__hikingPerformance.report(),rendering:hiking.rendering(),metrics:hiking.metrics(),ground:hiking.groundCheck(),scenery:hiking.metrics().landscape.scenery}));
 await (await waitChunks(page)).screenshot({path:`artifacts/scenery-forest-${label}-${id}.png`});
 const row={id,s,view,quality,errors,...result},at=rows.findIndex(x=>x.id===id);if(at>=0)rows[at]=row;else rows.push(row);console.log(label,id,result.performance.fps,result.performance.maxTriangles,errors);
 writeFileSync(`artifacts/scenery-forest-${label}.json`,JSON.stringify(rows,null,2));await context.close();
}
}finally{await browser.close();}
