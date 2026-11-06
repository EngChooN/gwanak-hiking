// 아이폰 세로·가로에서 쌍안경·휴대폰 카메라(1인칭·3인칭)를 켠 뒤, 손가락으로 닫기 버튼을 눌러 실제로 닫히는지 확인한다(2026-11-06).
// 헤드리스 WebKit은 env(safe-area-inset-*)가 0이라 아이폰 13 노치·홈 막대 값을 --sl·--sr·--st·--sb로 흉내 내고, 그 영역 안에 있는지도 본다.
// 사용: npm run dev 또는 preview → BASE_URL=http://127.0.0.1:5173/ node scripts/verify-mobile-gadgets.mjs · 결과: artifacts/mobile-gadgets/
import {webkit,devices} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:4173/',out=process.env.OUT??'artifacts/mobile-gadgets';mkdirSync(out,{recursive:true});
const VIEWS=[['portrait',{width:390,height:844},{sl:0,sr:0,st:47,sb:34}],['landscape',{width:844,height:390},{sl:47,sr:47,st:0,sb:21}]];
// [이름, 켜는 버튼, 시점, 닫기 버튼 선택자]
// 기구를 드는 동안은 1인칭으로 고정되므로(gadget.js viewLocked) 1인칭만 본다. 3인칭에서 들어도 1인칭으로 바뀐다.
const CASES=[['bino-from-first','#binoculars','first','#gadget-ui .gadget-chip .chip-close'],['bino-from-third','#binoculars','third','#gadget-ui .gadget-chip .chip-close'],
 ['phone-from-first','#phone','first','#gadget-ui .phone-top [data-act=close]'],['phone-from-third','#phone','third','#gadget-ui .phone-top [data-act=close]']];
const browser=await webkit.launch({headless:true}),report={};let failed=0;
for(const [vname,viewport,safe] of VIEWS){
 const context=await browser.newContext({...devices['iPhone 13'],viewport,screen:viewport});
 await context.addInitScript(()=>{localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-phone-orient','portrait');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?start=entrance&time=11:00&weather=clear');
 await page.waitForFunction(()=>window.hiking?.started===true,null,{timeout:300000});
 await page.addStyleTag({content:`:root{--sl:${safe.sl}px!important;--sr:${safe.sr}px!important;--st:${safe.st}px!important;--sb:${safe.sb}px!important}#resume-note{display:none!important}`});
 await page.waitForTimeout(1200);
 for(const [cname,open,view,closeSel] of CASES){
  const key=`${vname}/${cname}`;
  const cur=await page.evaluate(()=>hiking.snapshot().view);if(cur!==view){await page.tap('#view');await page.waitForTimeout(300);}
  await page.tap(open);await page.waitForTimeout(700);
  const on=await page.evaluate(()=>hiking.snapshot().gadget);
  const info=await page.evaluate(([sel,safe])=>{const el=document.querySelector(sel);if(!el)return {missing:true};const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
   const box={l:safe.sl,t:safe.st,r:innerWidth-safe.sr,b:innerHeight-safe.sb};
   const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
   return {rect:[r.left,r.top,r.width,r.height].map(Math.round),visible:r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden',
    inside:r.left>=box.l-.5&&r.top>=box.t-.5&&r.right<=box.r+.5&&r.bottom<=box.b+.5,size:Math.round(Math.min(r.width,r.height)),
    hit:hit?(hit===el||el.contains(hit)?'self':hit.id||hit.className||hit.tagName):'none',text:el.textContent.trim()};},[closeSel,safe]);
  await page.screenshot({path:`${out}/${vname}-${cname}.png`});
  let closed=false;if(info.visible){await page.tap(closeSel,{force:true,timeout:3000}).catch(()=>{});await page.waitForTimeout(500);closed=(await page.evaluate(()=>hiking.snapshot().gadget))==='none';}
  if(!closed){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'gadget-off'}})));await page.waitForTimeout(300);}
  const ok=on!=='none'&&info.visible&&info.inside&&info.hit==='self'&&info.size>=44&&closed;if(!ok)failed++;
  report[key]={on,...info,closed,ok};console.log(ok?'통과':'실패',key,JSON.stringify(report[key]));
 }
 report[vname+'/errors']=errors;
 await context.close();
}
await browser.close();
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,1));
console.log(failed?`실패 ${failed}건`:'모두 통과');process.exitCode=failed?1:0;
