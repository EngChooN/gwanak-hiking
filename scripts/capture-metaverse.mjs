// 메타버스 통합(2026-11-08) 확인 캡처: 허브(PC·휴대폰 세로·가로), 옛 주소 넘기기, 등산 PC, 흡연장 PC(담배·채팅·NPC).
// 개발 서버(npm run dev, 5173)를 먼저 띄운다. 결과: artifacts/metaverse-2026-11-08/
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const BASE=process.env.BASE_URL??'http://127.0.0.1:5173',OUT='artifacts/metaverse-2026-11-08';
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const report={};
async function open(w,h,mobile=false){
 const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));return {page,errors};
}
// 허브 세 화면
for(const [name,w,h,m] of [['hub-pc',1280,800,false],['hub-portrait',390,844,true],['hub-landscape',844,390,true]]){
 const {page,errors}=await open(w,h,m);await page.goto(`${BASE}/`);await page.waitForSelector('html.hub-ready');
 await page.screenshot({path:`${OUT}/${name}.png`});report[name]={errors};await page.close();
}
// 옛 주소 → /hiking/ (쿼리 그대로)
{const {page}=await open(1280,800);await page.goto(`${BASE}/?multi=room1&server=ws%3A%2F%2F127.0.0.1%3A8787&start=summit`);
 await page.waitForURL(/\/hiking\//,{timeout:30000}).catch(()=>{});report.legacy={url:page.url()};await page.close();}
// 허브 카드 → 등산
{const {page,errors}=await open(1280,800);await page.goto(`${BASE}/`);await page.click('#hub-hiking');await page.waitForURL(/\/hiking\//);
 await page.goto(`${BASE}/hiking/?start=entrance&time=12:00&weather=clear&quality=high`);
 await page.waitForFunction(()=>window.hiking?.started===true||window.hiking?.loading?.().phase==='error',null,{timeout:300000});
 await page.waitForTimeout(3000);await page.screenshot({path:`${OUT}/hiking-pc.png`});
 report.hiking={started:await page.evaluate(()=>window.hiking.started),errors};await page.close();}
// 허브 카드 → 흡연장: 입장 → 담배 꺼내기·불·한 모금 → 채팅 → NPC
{const {page,errors}=await open(1280,800);await page.goto(`${BASE}/`);await page.click('#hub-smoking');await page.waitForURL(/\/smoking\//);
 await page.waitForFunction(()=>window.lounge,null,{timeout:60000});await page.waitForTimeout(1500);
 const enter=page.locator('[data-a="enter"]');if(await enter.count())await enter.first().click();
 await page.waitForTimeout(800);
 const keep=page.getByText('지금 시간 그대로 둘게요');if(await keep.isVisible().catch(()=>false))await keep.click();
 await page.evaluate(()=>{const s=window.lounge.smoker;s.start?.();});await page.waitForTimeout(600);
 await page.evaluate(()=>window.lounge.smoker.light?.());await page.waitForTimeout(2500);
 await page.evaluate(()=>window.lounge.smoker.puff?.());await page.waitForTimeout(1200);
 const chat=page.locator('[data-a="chat"]');if(await chat.first().isVisible().catch(()=>false))await chat.first().click();
 const input=page.locator('form input').first();if(await input.count()){await input.fill('통합 뒤에도 잘 되네요');await input.press('Enter');}
 await page.waitForTimeout(4000);await page.screenshot({path:`${OUT}/smoking-pc.png`});
 report.smoking={status:await page.evaluate(()=>window.lounge.status()),chatLog:await page.evaluate(()=>document.body.innerText.includes('통합 뒤에도 잘 되네요')),errors};await page.close();}
writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,1));console.log(JSON.stringify(report,null,1));
await browser.close();
