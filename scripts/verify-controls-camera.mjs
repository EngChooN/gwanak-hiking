import {chromium} from '@playwright/test';
import {initialState} from '../src/movement.js';
const out=process.argv[2];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});const page=await ctx.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
const snap=()=>page.evaluate(()=>{const s=window.hiking.snapshot(),o=window.hiking.orientation();return {zone:s.zone,s:+s.s.toFixed(3),lat:+s.lateral.toFixed(3),px:s.plaza?.x,pz:s.plaza?.z,paused:s.paused,auto:s.auto,cam:+o.cameraHeading.toFixed(4),avatar:+o.avatarHeading.toFixed(4),yaw:+o.yaw.toFixed(4)};});
const go=async(url,seed)=>{await page.goto(url);if(seed!==undefined){await page.evaluate(v=>v?localStorage.setItem('gwanak-hiking:v1',v):localStorage.clear(),seed);await page.reload();}await page.waitForFunction(()=>window.hiking?.started,null,{timeout:180000});await page.waitForTimeout(600);};
const hold=async(k,ms)=>{await page.keyboard.down(k);await page.waitForTimeout(ms);await page.keyboard.up(k);await page.waitForTimeout(300);};
const B='http://127.0.0.1:5173/?outfit=1&time=12:00&weather=clear';
// 1) 처음 시작(저장 없음) → 광장
await go(B,'');let a=await snap();await hold('w',700);let b=await snap();console.log('처음 시작',a.zone,a.paused,'→ 이동',Math.hypot(b.px-a.px,b.pz-a.pz).toFixed(3));
// 2) 이어하기(광장 저장) — 새로고침
await page.reload();await page.waitForFunction(()=>window.hiking?.started,null,{timeout:180000});await page.waitForTimeout(600);a=await snap();await hold('w',700);b=await snap();console.log('이어하기(광장)',a.paused,'→ 이동',Math.hypot(b.px-a.px,b.pz-a.pz).toFixed(3),'paused',b.paused);
// 3) 광장 출발 옵션
await go(B+'&start=entrance');a=await snap();await hold('d',600);b=await snap();console.log('광장 출발 D',a.paused,'→ 이동',Math.hypot(b.px-a.px,b.pz-a.pz).toFixed(3));
// 광장 뒷걸음: 3인칭, 카메라 방향 유지·몸이 카메라 방향
await page.keyboard.press('v');await page.waitForTimeout(300);a=await snap();await page.keyboard.down('s');await page.waitForTimeout(400);
await page.screenshot({path:`${out}/plaza-backward-third.png`});
await page.waitForTimeout(600);await page.keyboard.up('s');await page.waitForTimeout(300);b=await snap();
console.log('광장 S 3인칭: cam',a.cam,'→',b.cam,'avatar',b.avatar,'이동',Math.hypot(b.px-a.px,b.pz-a.pz).toFixed(3));
// 4) 이어하기(코스 2500m, 저장 paused)
await go(B,JSON.stringify({...initialState(),s:2500,view:'third'}));a=await snap();await page.keyboard.down('s');await page.waitForTimeout(400);
await page.screenshot({path:`${out}/route-backward-third.png`});await page.waitForTimeout(600);await page.keyboard.up('s');await page.waitForTimeout(300);b=await snap();
console.log('이어하기(코스) S: paused',a.paused,'→',b.paused,'s',a.s,'→',b.s,'cam',a.cam,'→',b.cam,'avatar',b.avatar);
a=await snap();await hold('w',800);b=await snap();console.log('코스 W: s',a.s,'→',b.s,'avatar',b.avatar,'cam',b.cam);
// 5) ESC 일시정지·계속하기, 표시
await page.keyboard.press('Escape');await page.waitForTimeout(250);a=await snap();const shown=await page.locator('#pause-overlay').isVisible();
await page.screenshot({path:`${out}/pause-overlay.png`});
await page.keyboard.press('Escape');await page.waitForTimeout(250);b=await snap();console.log('ESC: paused',a.paused,'표시',shown,'→ ESC 다시',b.paused,'표시',await page.locator('#pause-overlay').isVisible());
await page.keyboard.press('Space');await page.waitForTimeout(200);a=await snap();await page.click('#pause-resume');await page.waitForTimeout(200);b=await snap();console.log('Space 멈춤',a.paused,'→ 표시 버튼 클릭',b.paused);
// HUD 숨김(#app 숨김 흉내)에도 표시가 보이는가
await page.keyboard.press('Space');await page.evaluate(()=>document.getElementById('app').style.visibility='hidden');await page.waitForTimeout(250);console.log('HUD 숨김 중 표시',await page.locator('#pause-overlay').isVisible());
await page.evaluate(()=>document.getElementById('app').style.visibility='');
// 지도 창 열린 동안 ESC는 창만 닫는다
await page.keyboard.press('Space');await page.keyboard.press('m');await page.waitForTimeout(200);await page.keyboard.press('Escape');await page.waitForTimeout(200);a=await snap();console.log('지도 열고 ESC: 창 닫힘',!(await page.locator('#map').evaluate(e=>e.open)),'paused 유지',a.paused);
let hud=0;await page.evaluate(()=>window.addEventListener('hiking:hud-toggle',()=>window.__hud=(window.__hud||0)+1));await page.keyboard.press('h');hud=await page.evaluate(()=>window.__hud);console.log('H 이벤트',hud);
console.log('errors',errs);
await browser.close();
