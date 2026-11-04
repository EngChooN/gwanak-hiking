// 하위 경로 preview에서 휴대폰(세로·가로, 터치) 확인: 로딩, 조이스틱 걷기, 시점 돌리기, 구간 이동 전 지점, 콘솔 오류.
// 사용: npm run preview:pages (다른 터미널) → BASE_URL=http://127.0.0.1:4173/gwanak-hiking/ node scripts/verify-mobile-pages.mjs
import {chromium,devices} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:4173/gwanak-hiking/',out=process.env.OUT??'artifacts/mobile-pages';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={errors:[],failed:[],views:{}};
for(const [name,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
 const context=await browser.newContext({...devices['iPhone 13'],viewport,screen:viewport,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>localStorage.setItem('gwanak-sound-enabled','false'));
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(`${name}: ${e.message}`));page.on('console',m=>{if(m.type()==='error')report.errors.push(`${name}: ${m.text()}`);});
 page.on('response',r=>{if(r.status()>=400)report.failed.push(`${name}: ${r.status()} ${r.url()}`);});
 await page.goto(base+'?quality=low&time=11:00&weather=clear');
 await page.waitForFunction(()=>window.hiking?.started||document.querySelector('#loading-screen .ls-action:not([hidden])'),null,{timeout:240000});
 if(!await page.evaluate(()=>window.hiking.started)){await page.screenshot({path:`${out}/${name}-loading-ready.png`});await page.tap('#loading-screen .ls-action');}
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
 await page.addStyleTag({content:'#resume-note{display:none!important}'});await page.waitForTimeout(1000);
 const r={};const snap=()=>page.evaluate(()=>{const s=hiking.snapshot(),o=hiking.orientation();return {zone:s.zone,s:+s.s.toFixed(2),paused:s.paused,arrived:s.summitArrived,yaw:+o.cameraHeading.toFixed(3),pos:hiking.position()};});
 // 구간 이동 버튼 위치: 조이스틱·시점 영역과 겹치지 않는가
 r.layout=await page.evaluate(()=>{const R=s=>document.querySelector(s).getBoundingClientRect(),j={left:0,right:0,top:0,bottom:0},l=R('#look-zone'),b=R('#section-jump .sj-toggle');document.querySelector('#section-jump .sj-toggle').click();const p=R('#section-jump .sj-list');document.querySelector('#section-jump .sj-toggle').click();
  const hit=(a,c)=>a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top;return {button:[b.left,b.top,b.width,b.height].map(Math.round),list:[p.left,p.top,p.width,p.height].map(Math.round),buttonOverJoystick:hit(b,j),listOverJoystick:hit(p,j),buttonOverLook:hit(b,l),listOverLook:hit(p,l),listInViewport:p.bottom<=innerHeight&&p.top>=0};});
 // 조이스틱 걷기(터치 드래그)
 const before=await snap();const vp=page.viewportSize(),cx=vp.width*.25,cy=vp.height*.65; // 조이스틱은 왼쪽 절반을 누른 자리에 생긴다
 const cdp=await context.newCDPSession(page);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 await page.evaluate(()=>{if(hiking.snapshot().paused)window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));});
 await touch('touchStart',cx,cy);await touch('touchMove',cx,cy-40);await page.waitForTimeout(2500);const mid=await snap();await touch('touchEnd');
 r.joystickWalk={before,after:mid,moved:Math.hypot((mid.pos.x-before.pos.x),(mid.pos.z-before.pos.z))>.5};
 // 시점 돌리기(오른쪽 드래그)
 const lb=await page.locator('#look-zone').boundingBox(),lx=lb.x+lb.width*.6,ly=lb.y+lb.height/2;const y0=(await snap()).yaw;
 await touch('touchStart',lx,ly);for(let i=1;i<=10;i++)await touch('touchMove',lx+i*12,ly);await touch('touchEnd');await page.waitForTimeout(400);const y1=(await snap()).yaw;
 r.lookTurn={before:y0,after:y1,turned:Math.abs(y1-y0)>.05};
 // 구간 이동: 목록 버튼을 터치로 눌러 전 지점 확인
 const ids=await page.evaluate(()=>hiking.jumpTargets());r.jumps={};
 for(const id of ids){
  await page.tap('#section-jump .sj-toggle');await page.tap(`#section-jump [data-jump="${id}"]`);await page.waitForTimeout(700);
  const a=await snap();r.jumps[id]={...a,dialog:await page.evaluate(()=>!!document.querySelector('dialog[open]')),listClosed:await page.evaluate(()=>document.querySelector('#section-jump .sj-list').hidden)};
  // 이동한 자리에서 걷기가 되는지(W 키 대신 터치 조이스틱)
  await touch('touchStart',cx,cy);await touch('touchMove',cx,cy-40);await page.waitForTimeout(900);await touch('touchEnd');const b2=await snap();
  r.jumps[id].walked=Math.hypot(b2.pos.x-a.pos.x,b2.pos.z-a.pos.z)>.2;r.jumps[id].zoneAfter=b2.zone;
  if(id==='summit'||id==='yeonju-spring')await page.screenshot({path:`${out}/${name}-${id}.png`});
 }
 // 저장 상태: 정상 구역에서 새로고침 → 정상 구역 복원, 도착 화면 안 뜸
 await page.tap('#section-jump .sj-toggle');await page.tap('#section-jump [data-jump="summit"]');await page.waitForTimeout(1500);
 await page.reload();await page.waitForFunction(()=>window.hiking?.started||document.querySelector('#loading-screen .ls-action:not([hidden])'),null,{timeout:240000});
 if(!await page.evaluate(()=>window.hiking.started))await page.tap('#loading-screen .ls-action');
 await page.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});await page.waitForTimeout(1500);
 r.reload={...await snap(),dialog:await page.evaluate(()=>!!document.querySelector('dialog[open]'))};
 await page.screenshot({path:`${out}/${name}-after-reload.png`});
 // 되돌려 광장
 await page.tap('#section-jump .sj-toggle');await page.screenshot({path:`${out}/${name}-menu.png`});
 report.views[name]=r;await context.close();
}
await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,1));
console.log(JSON.stringify({errors:report.errors,failed:report.failed,views:Object.fromEntries(Object.entries(report.views).map(([k,v])=>[k,{layout:v.layout,joystick:v.joystickWalk.moved,look:v.lookTurn.turned,jumps:Object.fromEntries(Object.entries(v.jumps).map(([id,j])=>[id,`${j.zone}→${j.zoneAfter} s=${j.s} walked=${j.walked} dlg=${j.dialog}`])),reload:v.reload}]))},null,1));
