// Enter 채팅 확인: 함께 걷기(내 컴퓨터 모드) 참가 → Enter로 열기·입력 → 보내기 → 빈 Enter로 접기. 개발 서버 5173이 떠 있어야 함.
import {chromium} from '@playwright/test';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()!=='log')console.log('console',m.type(),m.text().slice(0,200))});
await p.goto('http://127.0.0.1:5173/hiking/?multi='+encodeURIComponent('엔터시험')+'&server=off&name=tester&start=entrance&time=day&weather=clear');
await p.waitForFunction(()=>window.hiking?.started,null,{timeout:180000});await p.waitForTimeout(5000);console.log(await p.evaluate(()=>({m:window.hiking.multi?.(),btn:!!document.querySelector('.hc-btn'),chip:document.querySelector('.me-chip')?.innerText})));
const st=async()=>p.evaluate(()=>({open:!document.querySelector('.hc-panel').hidden,focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName,log:document.querySelector('.hc-log').innerText.trim()}));
await p.locator('canvas').first().click({position:{x:640,y:300}}).catch(()=>{});
await p.keyboard.press('Enter');console.log('Enter 1:',await st());
await p.keyboard.type('hello');await p.keyboard.press('Enter');await p.waitForTimeout(500);console.log('보냄:',await st());
await p.keyboard.press('Enter');console.log('빈 Enter:',await st());
await p.waitForTimeout(2600);await p.keyboard.press('Enter');await p.keyboard.insertText('안녕하세요');await p.keyboard.press('Enter');await p.waitForTimeout(500);console.log('한글:',await st());
await p.screenshot({path:'artifacts/chat-enter-2026-11-08/pc-1280.png'});
console.log('errors',errs);await b.close();
