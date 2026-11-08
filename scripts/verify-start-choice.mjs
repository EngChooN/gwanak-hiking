// 지도 창의 출발 위치 버튼: 입구 → 545m 구간 전환과 새로고침 뒤 위치를 확인한다.
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {DEMO_START} from '../src/route.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5176';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const out={errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>out.errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,null,{timeout:300000});
 await page.goto(`${base}/hiking/?quality=low`);await ready();out.initial=await page.evaluate(()=>({s:hiking.snapshot().s,zone:hiking.snapshot().zone}));
 for(const [id,expected] of [['start-entrance','plaza'],['start-demo',DEMO_START]]){
  await page.keyboard.press('m');await page.locator(`#${id}`).click();await page.waitForLoadState('load');await ready();
  const {s,zone}=await page.evaluate(()=>hiking.snapshot());out[id]={s,zone,expected,ok:expected==='plaza'?zone==='plaza':zone==='route'&&Math.abs(s-expected)<1e-6,url:page.url()};
 }
}finally{await browser.close();}
writeFileSync('artifacts/entrance-integration/start-choice.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
