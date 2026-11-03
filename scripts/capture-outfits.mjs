// 복장 선택 화면·저장·복원 확인과 3인칭 복장 4종 정면 비교 캡처(headless Chrome 1440×900, 15시 맑음).
// 사용: BASE_URL=http://127.0.0.1:5190 node scripts/capture-outfits.mjs
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {OUTFITS,OUTFIT_SAVE_KEY} from '../src/outfit-config.js';
const dir='artifacts/outfits';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5190',env='&time=15:00&weather=clear';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={date:new Date().toISOString(),console:[],flow:{},fps:{}};
const watch=page=>{page.on('console',m=>{if(m.type()==='error')out.console.push(m.text());});page.on('pageerror',e=>out.console.push('pageerror: '+e.message));};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>{try{localStorage.setItem('gwanak-sound-enabled','false');}catch{}});
 const page=await context.newPage();watch(page);
 // 1) 선택 화면(자동화 브라우저라 ?outfitPicker=1로 강제)
 await page.goto(`${base}/?outfitPicker=1&quality=balanced${env}`);
 await page.waitForSelector('#outfit-picker .outfit-card img',{timeout:240000});await page.waitForTimeout(600);
 out.flow.pickerBeforeStart={started:await page.evaluate(()=>hiking.started),phase:await page.evaluate(()=>hiking.loading().phase),cards:await page.locator('#outfit-picker .outfit-card').count()};
 await page.screenshot({path:`${dir}/picker.png`});
 await page.locator('#outfit-picker [data-outfit="navy-zip"]').click();await page.waitForFunction(()=>hiking.started);
 out.flow.picked={outfit:await page.evaluate(()=>hiking.outfit().current),saved:await page.evaluate(k=>localStorage.getItem(k),OUTFIT_SAVE_KEY),elapsed:await page.evaluate(()=>hiking.snapshot().elapsed)};
 // 2) 새로고침: 선택 화면을 강제해도 저장된 복장이 기본 선택
 await page.reload();await page.waitForSelector('#outfit-picker .outfit-card.selected',{timeout:240000});
 out.flow.reloadSelected=await page.locator('#outfit-picker .outfit-card.selected').getAttribute('data-outfit');
 await page.keyboard.press('4');await page.waitForFunction(()=>hiking.started);out.flow.keyPick=await page.evaluate(()=>hiking.outfit().current);
 // 3) 지도(M) 창에서 바꾸기
 await page.keyboard.press('m');await page.locator('.outfit-menu [data-outfit="red-zip"]').click();out.flow.mapPick={current:await page.evaluate(()=>hiking.outfit().current),saved:await page.evaluate(k=>localStorage.getItem(k),OUTFIT_SAVE_KEY)};
 await page.screenshot({path:`${dir}/map-menu.png`});await page.keyboard.press('m');await context.close();
 // 4) ?outfit=N 건너뛰기(자동화 아님을 흉내 낼 수 없어 값 반영만 확인)
 const c2=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const p2=await c2.newPage();watch(p2);
 await p2.goto(`${base}/?outfit=3&start=demo&quality=balanced${env}`);await p2.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});
 out.flow.urlOutfit={current:await p2.evaluate(()=>hiking.outfit().current),picker:await p2.locator('#outfit-picker').count(),zone:await p2.evaluate(()=>hiking.position().zone)};
 // 5) 3인칭 정면 비교: 광장에서 카메라를 앞으로 돌리고 가까이 당긴다.
 await p2.goto(`${base}/?outfit=1&start=entrance&quality=balanced${env}`);await p2.waitForFunction(()=>window.hiking?.started&&!hiking.rendering().compiling,null,{timeout:240000});
 await p2.keyboard.press('v');await p2.waitForTimeout(500);
 await p2.mouse.move(720,450);await p2.mouse.down();await p2.mouse.move(720+785,470,{steps:30});await p2.mouse.up();
 for(let i=0;i<8;i++){await p2.mouse.wheel(0,-120);await p2.waitForTimeout(50);}
 await p2.addStyleTag({content:'#app{visibility:hidden}'});await p2.waitForTimeout(3000);
 out.info=await p2.evaluate(()=>hiking.outfit().info);
 for(const o of OUTFITS){await p2.evaluate(id=>hiking.setOutfit(id),o.id);await p2.waitForTimeout(1200);await p2.screenshot({path:`${dir}/third-${o.index}.png`,clip:{x:420,y:60,width:600,height:780}});out.flow[`attachments-${o.index}`]=await p2.evaluate(()=>hiking.outfit().attachments);}
 // 6) 3인칭 걷기 fps(균형): 복장 4번(부착물 최다)
 await p2.evaluate(()=>hiking.setOutfit('floral-shirt'));await p2.removeStyleTag?.();
 if(await p2.evaluate(()=>hiking.snapshot().paused))await p2.keyboard.press('Space');
 await p2.keyboard.down('s');await p2.waitForTimeout(1500);await p2.evaluate(()=>__hikingPerformance.reset());await p2.waitForTimeout(8000);out.fps.plazaThirdWalkOutfit4=(await p2.evaluate(()=>__hikingPerformance.report())).fps;await p2.keyboard.up('s');
 await c2.close();
}finally{writeFileSync(`${dir}/results.json`,JSON.stringify(out,null,2));await browser.close();}
console.log(JSON.stringify(out,null,1));
