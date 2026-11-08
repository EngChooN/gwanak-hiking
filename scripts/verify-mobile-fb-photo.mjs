// 휴대폰 카메라: 방향 전환 단추·마지막 선택 기억·저장 사진 비율(보이는 틀과 같은지) 확인 (2026-11-07).
// 사용: npx vite --port 5330 → node scripts/verify-mobile-fb-photo.mjs
import {chromium} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5330/',out='artifacts/mobile-fb-2026-11-07';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const ctx=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
await ctx.addInitScript(()=>{if(!sessionStorage.getItem('k')){localStorage.clear();sessionStorage.setItem('k','1');}localStorage.setItem('gwanak-sound-enabled','false');});
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ready=async url=>{await page.goto(url);await page.waitForFunction(()=>window.hiking?.started,null,{timeout:300000});await page.addStyleTag({content:'#resume-note{display:none!important}'});await sleep(2000);};
const cmd=id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id}})),id);
const png=b=>({w:b.readUInt32BE(16),h:b.readUInt32BE(20)});
const result={};let fail=0;const check=(n,ok,info)=>{result[n]={ok,info};if(!ok)fail++;console.log(ok?'통과':'실패',n,JSON.stringify(info));};
await ready(`${base}?start=summit&time=12:00&weather=clear`);
await cmd('view');await sleep(500);if((await page.evaluate(()=>hiking.snapshot().view))!=='first'){await cmd('view');await sleep(500);}
await cmd('phone');await sleep(1500);
const orient=()=>page.evaluate(()=>document.querySelector('#gadget-ui').dataset.orient);
const shoot=async name=>{const dl=page.waitForEvent('download',{timeout:8000});await page.tap('#gadget-ui [data-act=shutter]');const d=await dl;const f=`${out}/photo-${name}.png`;await d.saveAs(f);const s=png(readFileSync(f));return s;};
check('처음 방향은 세로 화면을 따른다',(await orient())==='portrait',await orient());
const vis=async()=>page.evaluate(()=>{const r=document.querySelector('.phone-screen').getBoundingClientRect();return {w:r.width,h:r.height};});
let v=await vis(),s=await shoot('portrait');check('세로: 저장 사진도 세로 비율',s.h>s.w&&Math.abs(s.w/s.h-v.w/v.h)<.02,{saved:s,frame:v});
await page.tap('#gadget-ui [data-act=orient]');await sleep(500);
check('단추로 가로 전환',(await orient())==='landscape',await orient());
v=await vis();s=await shoot('landscape');check('가로: 저장 사진도 가로 비율',s.w>s.h&&Math.abs(s.w/s.h-v.w/v.h)<.02,{saved:s,frame:v});
await page.screenshot({path:`${out}/after-phone-landscape-choice.png`});
await cmd('gadget-off');await sleep(300);await ready(`${base}?time=12:00&weather=clear`);
await cmd('view');await sleep(400);if((await page.evaluate(()=>hiking.snapshot().view))!=='first'){await cmd('view');await sleep(400);}
await cmd('phone');await sleep(1200);
check('다시 열어도 마지막 선택(가로) 기억',(await orient())==='landscape',await orient());
// 셀카에서도 같은 비율
await page.tap('#gadget-ui [data-act=selfie]');await sleep(800);v=await vis();s=await shoot('selfie-landscape');check('셀카 가로: 저장 사진 비율',s.w>s.h&&Math.abs(s.w/s.h-v.w/v.h)<.02,{saved:s,frame:v});
check('콘솔 오류 없음',errors.length===0,errors);
await browser.close();process.exitCode=fail?1:0;console.log(fail?`실패 ${fail}건`:'모두 통과');
