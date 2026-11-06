// 입구~정상 들르기 확인(2026-11-06): 전 구간 자동걷기는 150분이라, 코스 위 즐길거리(벤치 5곳·산스장)마다 25m 앞에서 자동걷기를 켜고
// 들르기 버튼이 뜨면 실제로 눌러 → 걸어가 동작 → 길로 돌아와 자동걷기가 다시 켜지는지 본다. 입구 광장(고양이·에어건)은 verify-trail-buttons.mjs가 본다.
// 사용: 개발 서버(5310) → node scripts/verify-trail-dropin-route.mjs · 결과: artifacts/trail-hud/dropin-route.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5310/',out='artifacts/trail-hud';mkdirSync(out,{recursive:true});
const {initialState}=await import('../src/movement.js');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
await ctx.addInitScript(()=>{localStorage.setItem('gwanak-sound-enabled','false');const v=sessionStorage.getItem('vt-save');if(v){localStorage.setItem('gwanak-hiking:v1',v);sessionStorage.removeItem('vt-save');}});
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail&&window.hiking.landscape().natureReady,null,{timeout:300000});
await page.goto(base+'?start=entrance&time=11:00&weather=clear&season=summer');await ready();
// 자리의 m은 GPX 수평거리라 게임 코스 거리 s와 다르다(정상 쪽에서 90m 가까이 벌어짐). 게임 길에서 가장 가까운 s를 찾아 25m 앞에서 출발한다.
const sites=(await page.evaluate(async()=>{const {route}=await import('/src/route.js');const {positionAt}=await import('/src/movement.js');
 return window.hiking.trail.status().sites.filter(s=>s.kind!=='airgun').map(s=>{let b={d:1e9,s:0};for(let q=0;q<=route.length;q+=.5){const [x,,z]=positionAt(q,0);const d=Math.hypot(x-s.x,z-s.z);if(d<b.d)b={d,s:q};}return {...s,routeS:b.s,fromPath:+b.d.toFixed(2)};});})).sort((a,b)=>a.routeS-b.routeS);
const rows=[];
for(const site of sites){
 await page.evaluate(s=>sessionStorage.setItem('vt-save',s),JSON.stringify({...initialState({start:'demo'}),s:site.routeS-25,lateral:0,view:'third'}));
 await page.goto(base+'?time=11:00&weather=clear&season=summer');await ready();
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.tap('#auto');
 const row={id:site.id,kind:site.kind,m:site.m,s:+site.routeS.toFixed(1),fromPath:site.fromPath,offers:[]};
 const t0=Date.now();let tapped=false;
 while(Date.now()-t0<90000){
  const o=await page.evaluate(()=>{const b=document.querySelector('#trail-bar[data-mode=offer] .tb-offer');return b&&{id:b.dataset.id,act:b.dataset.act};});
  if(o&&!row.offers.some(x=>x.id===o.id))row.offers.push(o);
  if(o?.id===site.id&&!tapped){tapped=true;row.offerAt=+((Date.now()-t0)/1000).toFixed(1);await page.tap('.tb-offer');await page.waitForTimeout(400);row.played=await page.evaluate(()=>!!window.hiking.trail.status().active);}
  if(tapped){const s=await page.evaluate(()=>({a:window.hiking.trail.status().active,auto:window.hiking.snapshot().auto,s:window.hiking.snapshot().s}));if(!s.a&&s.auto){row.backToAuto=true;row.doneAt=+((Date.now()-t0)/1000).toFixed(1);await page.waitForTimeout(2500);row.movedOn=(await page.evaluate(()=>window.hiking.snapshot().s))>s.s;break;}}
  await page.waitForTimeout(250);
 }
 row.pass=!!(tapped&&row.played&&row.backToAuto&&row.movedOn);rows.push(row);console.log(JSON.stringify(row));
 if(site.kind==='gym')await page.screenshot({path:`${out}/dropin-gym.png`});
}
await browser.close();
writeFileSync(`${out}/dropin-route.json`,JSON.stringify({rows,errors},null,1));
console.log('통과',rows.filter(r=>r.pass).length,'/',rows.length,'오류',errors.slice(0,3));
process.exit(rows.every(r=>r.pass)&&!errors.length?0:1);
