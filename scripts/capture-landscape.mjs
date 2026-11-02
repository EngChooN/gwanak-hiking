import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const index=JSON.parse(readFileSync('assets/realistic/generated/nature/index.json'));
const inputs=['assets/realistic/generated/nature/index.json','assets/realistic/terrain-material.js','assets/realistic/load-landscape.js','assets/realistic/near-detail.js','assets/realistic/instance-geometry.js','assets/realistic/foliage-material.js','src/realistic-models.js','src/look-profile.js','src/rendering.js',...index.library.flatMap(m=>m.levels.map(f=>'assets/realistic/generated/nature/'+f))];
const hashes=()=>Object.fromEntries(inputs.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const inputHashes=hashes();
const baseURL=process.env.BASE_URL??'http://127.0.0.1:5176';
import {route,sample} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const results={revision:'landscape-defect-fix-v1',environment:'이 Mac headless Chrome, 1440×900, deviceScaleFactor 1. 실기기 모바일 검증 아님.',baseURL,captures:[],errors:[],inputHashes};
try{for(const [id,label,s,bearing] of [['entrance','입구',1,null],['ridge','능선 중간',route.segments[310].start,null],['summit-north','정상 북쪽 · 서울·한강',route.length-.02,0],['summit-east','정상 동쪽 · 롯데월드타워',route.length-.02,59],['third','3인칭 보행 시점',route.segments[310].start,null]]){
 if(process.env.CAPTURE_VIEW&&id!==process.env.CAPTURE_VIEW)continue;
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});await context.addInitScript(({seed,key})=>localStorage.setItem(key,JSON.stringify(seed)),{seed:{...initialState(),s,view:id==='third'?'third':'first',paused:true},key:SAVE_KEY});
 const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));await page.goto(baseURL+'/'+(bearing===null?'':`?bearing=${bearing}`));await page.waitForFunction(()=>window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady,null,{timeout:180000});await page.waitForTimeout(20000);if(id==='third'){await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(1300);}
 const data=await page.evaluate(()=>({snapshot:hiking.snapshot(),metrics:hiking.metrics(),rendering:hiking.rendering(),coordinates:hiking.coordinates(),orientation:hiking.orientation(),ground:hiking.groundCheck()}));if(id==='third')assert.ok(data.snapshot.distance>0,'3인칭 실제 보행 확인');assert.equal(data.rendering.shaderErrors.length,0,JSON.stringify(data.rendering.shaderErrors));assert.ok(data.ground.every(g=>g.error<=.3),JSON.stringify(data.ground));assert.equal(data.metrics.landscape.errors.length,0);assert.ok(data.metrics.footContact.every(c=>c.error<=.3));assert.ok(data.metrics.fps>=30,`${id} FPS ${data.metrics.fps}`);
 await page.screenshot({path:`artifacts/landscape-${id}.png`});results.captures.push({id,label,s,bearing,...data});console.log(id,data.metrics.fps,data.metrics.landscape);await context.close();}
 assert.deepEqual(hashes(),inputHashes,'검사 중 자산 변경');assert.equal(results.errors.length,0);results.status='통과';
}catch(e){results.status='실패';results.errors.push(e.stack);process.exitCode=1;}finally{writeFileSync('artifacts/landscape-verification.json',JSON.stringify(results,null,2));await browser.close();}
