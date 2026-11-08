// 모바일 피드백(2026-11-07) ①새 자리 ②상호작용 칩 전/후 캡처. 휴대폰 세로 412×915(DPR 2)·밤 20:45/낮 12:00 + PC 1440×900.
//  ① 까치를 배낭(지금)/모자(바꾼 뒤)에 태우고 3인칭 뒤·걷기·1인칭을 찍는다.
//  ② 광장 고양이·에어건 옆에서 상호작용 버튼(칩)을 찍고, 칩 자리(대상 위)·크기·탭을 잰다.
// 사용: npx vite --port 5320 → TAG=before|after node scripts/capture-mobile-fb-chip.mjs [phone|pc]
//  결과: artifacts/mobile-fb-2026-11-07/<TAG>-<보기>-<시각>-<장면>.png, <TAG>-report.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5320/',tag=process.env.TAG??'after',out='artifacts/mobile-fb-2026-11-07';mkdirSync(out,{recursive:true});
const only=process.argv[2];
const VIEWS=[['phone',{width:412,height:915},true,['night','day']],['pc',{width:1440,height:900},false,['night']]].filter(v=>!only||v[0]===only);
const TIMES={night:'20:45',day:'12:00'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const report={};
for(const [name,viewport,mobile,times] of VIEWS)for(const tod of times){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(()=>{if(!sessionStorage.getItem('vt-keep')){localStorage.clear();sessionStorage.setItem('vt-keep','1');}localStorage.setItem('gwanak-sound-enabled','false');
  const v=sessionStorage.getItem('vt-save');if(v){localStorage.setItem('gwanak-hiking:v1',v);sessionStorage.removeItem('vt-save');}});
 const page=await ctx.newPage(),errors=[],rows=[];report[`${name}-${tod}`]=rows;
 page.on('pageerror',e=>errors.push(e.message));
 const url=`${base}?start=entrance&time=${TIMES[tod]}&weather=clear&season=autumn`;
 const load=async(first=false)=>{await page.goto(first?url:url.replace('start=entrance&',''));await page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail&&window.hiking.landscape().natureReady,null,{timeout:300000});
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await page.addStyleTag({content:'#resume-note{display:none!important}'});await sleep(1500);};
 const shot=async n=>{const f=`${out}/${tag}-${name}-${tod}-${n}.png`;await page.screenshot({path:f});console.log(f);};
 // 상호작용 버튼(전: #trail-bar 줄, 후: #trail-chip)의 자리
 const chip=()=>page.evaluate(()=>{const el=document.querySelector('#trail-chip:not([hidden]) button')??document.querySelector('#trail-bar[data-mode=near]:not([hidden]) .tb-btn');if(!el)return null;
  const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {rect:[b.left,b.top,b.width,b.height].map(Math.round),text:el.textContent.trim(),tappable:!!hit&&el.contains(hit)};});
 const place=async(save)=>{await page.evaluate(s=>sessionStorage.setItem('vt-save',JSON.stringify(s)),save);await load();};
 await load(true);
 const saves=await page.evaluate(async()=>{const {sample}=await import('/src/route.js');const st=window.hiking.snapshot(),L=window.hiking.landscape();
  const tp=L.trailProps??{},cats=(tp.cats??[]),sites=window.hiking.trail.status().sites,air=sites.find(p=>p.kind==='airgun');
  const mags=(L.interactionProps?.spawns??[]).filter(s=>s.kind==='magpie').sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));
  const onRoute=(p,m)=>{let best={d:1e9,s:0};for(let q=0;q<=900;q+=.5){const r=sample(q),d=Math.hypot(r.x-p.x,r.z-p.z);if(d<best.d)best={d,s:q};}return {...st,auto:false,pose:'stand',zone:'route',plaza:null,summit:null,s:best.s,lateral:0,view:'third',_d:best.d};};
  const plazaAt=(p,dx,dz)=>({...st,auto:false,pose:'stand',zone:'plaza',plaza:{x:p.x+dx,z:p.z+dz,heading:Math.atan2(dx,dz)+.5},view:'third'}) // 대상이 동동이에 가리지 않게 살짝 비켜 본다;
  const p0=st.plaza??{x:0,z:0},cat=[...cats].sort((a,b)=>Math.hypot(a.x-p0.x,a.z-p0.z)-Math.hypot(b.x-p0.x,b.z-p0.z))[0];
  return {cat:cat&&plazaAt(cat,2.2,2.2),catFar:cat&&plazaAt(cat,4.6,4.6),air:air&&plazaAt(air,2.6,2.6),mag:mags.length?onRoute(mags[0],mags[0].m??200):null,info:{cats:cats.length,mags:mags.length}};});
 console.log(name,tod,JSON.stringify(saves.info));
 // ② 상호작용 칩: 고양이 2.2m·4.6m, 에어건
 for(const [k,s] of [['cat',saves.cat],['cat-far',saves.catFar],['airgun',saves.air]]){if(!s)continue;await place(s);await sleep(1500);rows.push({scene:k,chip:await chip()});await shot(`chip-${k}`);}
 // 카메라를 돌려 대상이 화면 밖으로 가면
 if(saves.cat){await place(saves.cat);await sleep(800);await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down();await page.mouse.move(viewport.width/2+viewport.width*.9,viewport.height/2,{steps:8});await page.mouse.up();await sleep(500);rows.push({scene:'cat-turned',chip:await chip()});await shot('chip-cat-turned');}
 // ① 까치: 광장 근처 길로 옮겨 태운다
 if(saves.mag){await place(saves.mag);
  const ok=await page.waitForFunction(()=>window.hiking.trail.magpieRide(),null,{timeout:20000,polling:500}).then(()=>true).catch(()=>false);
  await page.waitForFunction(()=>window.hiking.trail.status().animals.some(a=>a.kind==='magpie'&&a.state==='ride'),null,{timeout:8000}).catch(()=>{});await sleep(400);
  const st=await page.evaluate(()=>window.hiking.trail.status().animals.filter(a=>a.kind==='magpie'));rows.push({scene:'magpie',forced:ok,st});
  await shot('bird-third');
  await page.keyboard.down('KeyW');await sleep(900);await shot('bird-walk');await page.keyboard.up('KeyW');await sleep(300);
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');await sleep(900);await shot('bird-run');await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');await sleep(300);
  await page.keyboard.press('KeyC');await sleep(1600);await shot('bird-sit');await page.keyboard.press('KeyC');await sleep(800);
  await page.keyboard.press('KeyV');await sleep(1200);rows.push({scene:'magpie-first',st:await page.evaluate(()=>window.hiking.trail.status().animals.filter(a=>a.kind==='magpie'))});await shot('bird-first');}
 rows.push({errors});await ctx.close();
}
writeFileSync(`${out}/${tag}-report.json`,JSON.stringify(report,null,1));
await browser.close();
