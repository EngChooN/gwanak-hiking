import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {checkpoints,route,isStairs,ROUTE_ID} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const out=new URL('../artifacts/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
let browser;
const results={verificationId:'realistic-dem-city-v2',buildHash:createHash('sha256').update(readFileSync('dist/index.html')).digest('hex'),routeId:ROUTE_ID,status:'실행 중',capturedAt:new Date().toISOString(),environment:'이 Mac의 headless Chrome. 모바일은 viewport·touch 에뮬레이션. 실기기 성능 증거가 아님.',checks:[],screens:[],errors:[]};
try{
browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ctx=await browser.newContext({viewport:{width:1366,height:768}});const page=await ctx.newPage();page.on('pageerror',e=>results.errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>window.hiking?.started);const snapshot=()=>page.evaluate(()=>window.hiking.snapshot());
// 대표 피드백 회귀: 걷는 도중 뒤를 보기, F, 3인칭 이동·아바타 방향.
await page.mouse.move(700,380);await page.mouse.down();await page.mouse.move(1485,405,{steps:12});await page.mouse.up();
let orientation=await page.evaluate(()=>window.hiking.orientation());assert.ok(Math.abs(orientation.yaw)>3);
const walkingStart=await snapshot();await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
assert.ok((await snapshot()).s>walkingStart.s);assert.equal((await page.evaluate(()=>window.hiking.orientation())).yaw,orientation.yaw);
assert.equal((await page.evaluate(()=>window.hiking.orientation())).pitch,orientation.pitch);results.checks.push('1인칭: 뒤를 보면서 W 이동, yaw·pitch 자동 복귀 없음');
await page.keyboard.press('f');await page.waitForTimeout(650);orientation=await page.evaluate(()=>window.hiking.orientation());assert.equal(orientation.yaw,0);assert.equal(orientation.pitch,-.04);results.checks.push('F: 0.4초 정면 복귀');
await page.keyboard.press('v');const thirdStart=await snapshot();await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');assert.equal((await snapshot()).view,'third');assert.ok((await snapshot()).s>thirdStart.s);
await page.keyboard.press('r');await page.waitForTimeout(300);assert.equal((await snapshot()).view,'third');await page.keyboard.press('r');
await page.mouse.move(150,400);await page.mouse.down();await page.mouse.move(1300,420,{steps:12});await page.mouse.up();orientation=await page.evaluate(()=>window.hiking.orientation());assert.ok(Math.abs(orientation.yaw)>Math.PI);assert.equal(orientation.avatarHeading,orientation.routeHeading);
await page.keyboard.press('Space');await page.reload();await page.waitForFunction(()=>window.hiking?.started);assert.equal((await snapshot()).view,'third');results.checks.push('3인칭: 직접·자동 걷기·경로 방향 아바타·저장 복구');
await page.keyboard.press('v');await page.keyboard.press('Space');
let a=await snapshot();await page.waitForTimeout(300);assert.equal((await snapshot()).elapsed,a.elapsed);results.checks.push('무입력: 걸은 시간 정지');
await page.keyboard.down('w');await page.waitForTimeout(1100);await page.keyboard.up('w');let b=await snapshot();assert.ok(b.s>a.s);assert.ok(b.elapsed>a.elapsed&&b.elapsed-a.elapsed<1.5);assert.ok((b.distance-a.distance)/(b.elapsed-a.elapsed)<1.667);results.checks.push('W 직접 걷기·실제 속도 한도');
await page.keyboard.press('r');await page.waitForTimeout(600);a=await snapshot();assert.ok(a.auto);await page.keyboard.press('s');assert.equal((await snapshot()).auto,false);results.checks.push('R 자동 걷기·후진 시 자동 해제');
await page.keyboard.press('Space');a=await snapshot();assert.equal(a.paused,true);assert.equal(a.view,'first');await page.waitForTimeout(300);assert.equal((await snapshot()).elapsed,a.elapsed);results.checks.push('Space: 일시정지·시점 유지·시간 정지');
await page.keyboard.press('m');assert.ok(await page.locator('#map').evaluate(e=>e.open));await page.getByRole('button',{name:'지도 닫기',exact:true}).click();await page.keyboard.press('v');a=await snapshot();results.checks.push('M 지도·V 시점 전환');
await page.reload();await page.waitForFunction(()=>window.hiking?.started);b=await snapshot();assert.equal(b.s,a.s);assert.equal(b.elapsed,a.elapsed);assert.deepEqual(b.checkpoints,a.checkpoints);assert.equal(b.paused,true);results.checks.push('새로고침: 위치·시간·체크포인트 복구');
await page.keyboard.press('Space');await page.keyboard.press('r');await page.waitForTimeout(300);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));a=await snapshot();assert.equal(a.paused,true);assert.equal(a.auto,false);results.checks.push('blur 이벤트: 자동 일시정지·저장');
await page.addInitScript(()=>{const seed=sessionStorage.getItem('checkpoint-seed');if(seed){localStorage.setItem('gwanak-hiking:v1',seed);sessionStorage.removeItem('checkpoint-seed');}});
for(const cp of checkpoints){
  const seeded={...initialState(),s:cp.s-.01,elapsed:80,checkpoints:[]};
  await page.evaluate(({key,value})=>sessionStorage.setItem(key,JSON.stringify(value)),{key:'checkpoint-seed',value:seeded});
  await page.reload();await page.waitForFunction(()=>window.hiking?.started);
  await page.keyboard.press('Space');await page.keyboard.down('w');await page.waitForTimeout(180);await page.keyboard.up('w');
  await page.keyboard.press('Space');const visited=await snapshot();assert.ok(visited.checkpoints.includes(cp.id),JSON.stringify({cp,state:visited}));
  await page.reload();await page.waitForFunction(()=>window.hiking?.started);const resumed=await snapshot();
  assert.deepEqual(resumed.checkpoints,visited.checkpoints);assert.equal(resumed.s,visited.s);assert.equal(resumed.elapsed,visited.elapsed);
  assert.ok((await page.locator('#resume-note').textContent()).includes(cp.name));
}
results.checks.push('확정 체크포인트 5곳: 통과·저장·새로고침 복구·지점명 안내');
const before=await snapshot();await page.setViewportSize({width:768,height:1366});const after=await snapshot();assert.equal(after.s,before.s);assert.equal(after.elapsed,before.elapsed);assert.equal(after.view,before.view);results.checks.push('화면 회전: 위치·시간·시점 유지');await ctx.close();
const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const tp=await touch.newPage();await tp.goto(base);await tp.waitForFunction(()=>window.hiking?.started);assert.ok(await tp.locator('body').evaluate(e=>e.classList.contains('touch')));const stick=await tp.locator('#joystick').boundingBox();const ts=await tp.evaluate(()=>window.hiking.snapshot());await tp.mouse.move(stick.x+stick.width/2,stick.y+stick.height/2);await tp.mouse.down();await tp.mouse.move(stick.x+stick.width/2,stick.y+10);await tp.waitForTimeout(650);await tp.mouse.up();assert.ok((await tp.evaluate(()=>window.hiking.snapshot())).s>ts.s);await tp.getByRole('button',{name:/자동 걷기/}).tap();await tp.waitForTimeout(300);assert.equal((await tp.evaluate(()=>window.hiking.snapshot())).auto,true);await tp.getByRole('button',{name:/일시정지/}).tap();assert.equal((await tp.evaluate(()=>window.hiking.snapshot())).paused,true);results.checks.push('터치 모드: 조이스틱 포인터 이동·자동 걷기·일시정지 버튼');
let angle=await tp.evaluate(()=>window.hiking.orientation());await tp.mouse.move(300,380);await tp.mouse.down();await tp.mouse.move(340,400,{steps:5});await tp.mouse.up();assert.notEqual((await tp.evaluate(()=>window.hiking.orientation())).yaw,angle.yaw);results.checks.push('오른쪽 드래그: 시점 회전');
await tp.locator('#view').tap();const cdp=await touch.newCDPSession(tp);const orbitBefore=await tp.evaluate(()=>window.hiking.orientation().orbit);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:240,y:350,id:1},{x:300,y:350,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y:350,id:1},{x:350,y:350,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await tp.evaluate(()=>window.hiking.orientation().orbit))<orbitBefore);results.checks.push('실제 다중 터치 이벤트: 두 손가락 3인칭 확대');
await tp.locator('#auto').tap();await tp.waitForTimeout(150);const rotatingBefore=await tp.evaluate(()=>window.hiking.snapshot());await tp.setViewportSize({width:844,height:390});await tp.waitForTimeout(150);const rotatingAfter=await tp.evaluate(()=>window.hiking.snapshot());assert.equal(rotatingAfter.auto,true);assert.equal(rotatingAfter.paused,false);assert.ok(rotatingAfter.s>=rotatingBefore.s&&rotatingAfter.s-rotatingBefore.s<1);results.checks.push('걷는 도중 회전: 자동 걷기·위치 유지');await touch.close();
const sizes=[['pc-1920x1080',1920,1080,false],['pc-1080x1920',1080,1920,false],['pc-1366x768',1366,768,false],['pc-768x1366',768,1366,false],['mobile-390x844',390,844,true],['mobile-844x390',844,390,true],['mobile-360x800',360,800,true],['mobile-800x360',800,360,true],['tablet-768x1024',768,1024,true],['tablet-1024x768',1024,768,true]];
for(const [name,width,height,mobile]of sizes){const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});const p=await context.newPage();p.on('pageerror',e=>results.errors.push(`${name}: ${e.message}`));const t=Date.now();await p.goto(base);await p.waitForFunction(()=>window.hiking?.started);const loadMs=Date.now()-t;await p.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().ready,{timeout:120000});await p.waitForTimeout(4500);if(name==='pc-1920x1080'){await p.keyboard.press('v');await p.waitForTimeout(900);}const assetMetrics=await p.evaluate(()=>window.hiking.metrics());assert.equal(assetMetrics.assetsLoaded,true);const look=await p.evaluate(()=>window.hiking.rendering());assert.equal(look.toneMapping,'Neutral');assert.equal(look.shaderErrors.length,0);assert.ok(look.calibration.calibrated);assert.ok(Math.abs(look.calibration.ratio-4)<.03);assert.ok(Math.abs(look.sunElevation-29)<.001);assert.ok(Math.abs(look.sunAzimuth-142)<.001);for(const [distance,target]of [[8000,.45],[10000,Math.sqrt(.45*.35)],[12000,.35]])assert.ok(Math.abs(look.calibration.fogSamples.find(s=>s.distance===distance).contrast-target)<.0002);assert.ok(assetMetrics.rendering.hdri.includes('CC0'));if(mobile)assert.equal(assetMetrics.rendering.ao,false);assert.ok(assetMetrics.footContact.every(c=>c.error<.001));
await (await waitChunks(p)).screenshot({path:out+name+'.png'});const layout=await p.evaluate(()=>{const selectors=['header','.progress-panel','.notice','.metrics','nav','.trail-label',...(document.body.classList.contains('touch')?['#joystick']:[])];const bounds=selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,x:r.x,y:r.y,width:r.width,height:r.height};});const clips=bounds.filter(r=>r.x<-.5||r.y<-.5||r.x+r.width>innerWidth+.5||r.y+r.height>innerHeight+.5);const overlaps=[];for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){const a=bounds[i],b=bounds[j];if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)overlaps.push([a.selector,b.selector]);}return {clips,overlaps,scroll:document.documentElement.scrollWidth>innerWidth};});assert.equal(layout.clips.length,0,`${name} 잘림: ${JSON.stringify(layout.clips)}`);assert.equal(layout.overlaps.length,0,`${name} 겹침: ${JSON.stringify(layout.overlaps)}`);assert.equal(layout.scroll,false);results.screens.push({name,width,height,loadMs,layout,metrics:await p.evaluate(()=>window.hiking.metrics())});await context.close();}
for(const view of ['first','third']){
 const c=await browser.newContext({viewport:{width:1366,height:768}});const p=await c.newPage();p.on('pageerror',e=>results.errors.push(e.message));
 const stairs=route.segments.find(s=>isStairs(s.material)&&s.length>10&&s.a.y>545);
 await c.addInitScript(seed=>localStorage.setItem('gwanak-hiking:v1',JSON.stringify(seed)),{...initialState(),s:stairs.start+stairs.length*.4,view});
 await p.goto(base);await p.waitForFunction(()=>window.hiking?.started);await p.keyboard.press('r');await p.waitForTimeout(4200);
 const begin=await p.evaluate(()=>window.hiking.snapshot());await p.waitForTimeout(1000);const end=await p.evaluate(()=>window.hiking.snapshot());
 const speed=(end.distance-begin.distance)/(end.elapsed-begin.elapsed);assert.ok(speed>=.35&&speed<=.5);assert.equal(end.view,view);assert.ok(Math.abs((end.steps+end.stepPhase-begin.steps-begin.stepPhase)/(end.elapsed-begin.elapsed)-1.2)<.01);
 const name='stairs-'+view;await (await waitChunks(p)).screenshot({path:out+name+'.png'});results.stairScreens??=[];results.stairScreens.push({name,view,speed,cadence:1.2,metrics:await p.evaluate(()=>window.hiking.metrics())});await c.close();
}
results.checks.push('1·3인칭 계단: 실시간 0.35~0.5m/s·1.2걸음/초 및 두 화면 캡처');
results.lookComparisons=[];
for(const fov of [55,70]){
 let reference=null;
 for(const tone of ['neutral','aces']){
  const c=await browser.newContext({viewport:{width:1366,height:768}});const p=await c.newPage();p.on('pageerror',e=>results.errors.push(e.message));
  await c.addInitScript(seed=>localStorage.setItem('gwanak-hiking:v1',JSON.stringify(seed)),{...initialState(),view:'third',paused:true});
  await p.goto(base+'/?tone='+tone+'&fov='+fov);await p.waitForFunction(()=>window.hiking?.started);await p.waitForTimeout(4500);
  const rendering=await p.evaluate(()=>window.hiking.rendering()),orientation=await p.evaluate(()=>window.hiking.orientation());
  assert.equal(rendering.shaderErrors.length,0);assert.equal(rendering.fov,fov);assert.equal(rendering.toneMapping,tone==='neutral'?'Neutral':'ACES Filmic (비교용)');
  if(reference){assert.deepEqual(orientation.camera,reference.orientation.camera);assert.equal(rendering.exposure,reference.rendering.exposure);}
  reference={orientation,rendering};const name='look-'+tone+'-fov'+fov;await (await waitChunks(p)).screenshot({path:out+name+'.png'});results.lookComparisons.push({name,tone,fov,rendering,orientation});await c.close();
 }
}
results.checks.push('실사 룩: Neutral 기본·태양 29°/142°·GPU 직사/하늘 4:1·8~12km 대비 35~45%');
results.checks.push('동일 위치·시선·노출·55°/70° FOV에서 Neutral/ACES 비교 캡처 4장');
assert.equal(results.errors.length,0);results.checks.push('DSM 지형·서울 건물·캐릭터 GLB 로딩 및 발바닥 접지 진단 통과');results.checks.push('10개 화면: 주요 UI 겹침·잘림·가로 스크롤 없음');
results.status='통과';
}catch(error){results.status='미완료';results.errors.push(error.message.slice(0,600));process.exitCode=1;}finally{writeFileSync(out+'browser-verification.json',JSON.stringify(results,null,2));await browser?.close();}console.log(JSON.stringify(results,null,2));
