// 실제 게임(카툰 모드)에서 동동이 3인칭 뒤·앞, 걷기, 앉기, 1인칭을 찍는다. node scripts/capture-dongdong-game.mjs [http://127.0.0.1:5311] [출력 폴더]
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5311',out=process.argv[3]??'artifacts/dongdong/game';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,200));});
await page.goto(`${base}/?${new URLSearchParams({style:'toon',time:'11:00',weather:'clear',quality:'2'})}`);
for(let i=0;;i++){try{await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});break;}catch(e){if(i>=3||!/destroyed|navigation/.test(e.message))throw e;await page.waitForLoadState('load');}}
await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(x=>x.close()));
if(await page.evaluate(()=>window.hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
const cmd=id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id}})),id);
const shot=async name=>{await page.waitForTimeout(1500);await page.screenshot({path:`${out}/${name}.png`});console.log(name,JSON.stringify(await page.evaluate(()=>({eye:window.__hiker.eyeHeight,view:window.hiking.snapshot().view}))));};
await page.waitForTimeout(3000);
if(await page.evaluate(()=>window.hiking.snapshot().view)==='first')await cmd('view');
await shot('01-3인칭-뒤');
// 카메라를 몸 앞쪽으로 돌린다(마우스 끌기)
const drag=async dx=>{await page.mouse.move(640,400);await page.mouse.down();for(let i=1;i<=20;i++)await page.mouse.move(640+dx*i/20,400);await page.mouse.up();};
await drag(700);await page.waitForTimeout(300);
let yaw=await page.evaluate(()=>window.__hiker.scene.rotation.y);console.log('body yaw',yaw);
await shot('02-3인칭-앞');
await drag(-700);await cmd('auto');await page.waitForTimeout(2500);await shot('03-3인칭-걷기');
await cmd('stop-auto');await page.waitForTimeout(800);await cmd('sit');await shot('04-3인칭-앉기');
await cmd('sit');await page.waitForTimeout(1200);await cmd('view');await shot('05-1인칭');
await cmd('binoculars');await shot('06-1인칭-쌍안경');await cmd('gadget-off');await page.waitForTimeout(600);
await cmd('phone');await page.waitForTimeout(600);await cmd('selfie');await shot('07-셀카');
console.log('errors',JSON.stringify(errors));
await browser.close();
