// 모바일 피드백(2026-11-07) 휴대폰 카메라·쌍안경 화면 전/후 캡처 + 배치·대비 측정.
// 정상(인증샷 자리)에서 1인칭으로 휴대폰/쌍안경을 켠다. 보기: 휴대폰 세로 412×915·가로 915×412(DPR 2), PC 1440×900. 시각: night 20:45·dusk 18:30·day 12:00.
// 사용: npx vite --port 5330 → TAG=before|after [VIEW=phone|land|pc] node scripts/capture-mobile-fb-gadget.mjs
// 결과: artifacts/mobile-fb-2026-11-07/gadget-<TAG>-<보기>-<시각>-<장면>.png, gadget-<TAG>-report.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5330/',tag=process.env.TAG??'after',out='artifacts/mobile-fb-2026-11-07',only=process.env.VIEW;mkdirSync(out,{recursive:true});
const VIEWS=[['phone',{width:412,height:915},true],['land',{width:915,height:412},true],['short',{width:412,height:620},true],['pc',{width:1440,height:900},false]].filter(v=>!only||v[0]===only);
const TIMES=(process.env.TIMES??'night,dusk,day').split(',');const CLOCK={night:'20:45',dusk:'18:30',day:'12:00'};
// 장면: [이름, 켤 것, 휴대폰 방향(저장값, 'after'에서만 의미)]
const SCENES=(process.env.SCENES??'phone,phone-flip,bino').split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const luma=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);};
const ratio=(a,b)=>{const x=luma(a),y=luma(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const report={};
for(const [name,viewport,mobile] of VIEWS)for(const tod of TIMES)for(const scene of SCENES){
 const orient=scene==='phone-flip'?'flip':'';
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(()=>{if(!sessionStorage.getItem('vt-keep')){localStorage.clear();sessionStorage.setItem('vt-keep','1');}localStorage.setItem('gwanak-sound-enabled','false');const v=sessionStorage.getItem('vt-save');if(v){localStorage.setItem('gwanak-hiking:v1',v);sessionStorage.removeItem('vt-save');}});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?start=summit&time=${CLOCK[tod]}&weather=clear&season=autumn`);
 await page.waitForFunction(()=>window.hiking?.started,null,{timeout:300000});
 // 정상석 3m 앞으로 옮겨 다시 연다(인증샷 안내 버튼은 6m 안에서만 뜬다)
 await page.evaluate(()=>{const st=window.hiking.snapshot(),site=window.hiking.interaction().sites.find(x=>x.id==='stamp-6'),h=Math.atan2(site.x-st.summit.x,-(site.z-st.summit.z)),k=3;
  sessionStorage.setItem('vt-save',JSON.stringify({...st,summit:{x:site.x-Math.sin(h)*k,z:site.z+Math.cos(h)*k,heading:st.summit.heading},view:'first'}));});
 await page.goto(`${base}?time=${CLOCK[tod]}&weather=clear&season=autumn`);await page.waitForFunction(()=>window.hiking?.started,null,{timeout:300000});
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await page.addStyleTag({content:'#resume-note{display:none!important}'});await sleep(2500);
 const cmd=(id,value)=>page.evaluate(([id,value])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}})),[id,value]);
  const key=`${name}-${tod}-${scene}`,row={};report[key]=row;
 if(scene.startsWith('phone')){
  if((await page.evaluate(()=>window.hiking.snapshot().view))!=='first'){await cmd('view');await sleep(600);}await cmd('phone');await sleep(1800);row.snap=await page.evaluate(()=>({view:window.hiking.snapshot().view,zone:window.hiking.snapshot().zone,gadget:window.hiking.snapshot().gadget}));
  if(scene==='phone-flip'){ // 가로↔세로 전환 버튼(있으면)
   const b=await page.$('#gadget-ui [data-act=orient]');if(b&&await b.isVisible()){await b.click();await sleep(600);}else row.noOrientButton=true;}
 }else{await cmd('binoculars');await sleep(1800);}
 const m=await page.evaluate(()=>{
  const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {rect:[r.left,r.top,r.right,r.bottom].map(Math.round),color:cs.color,bg:cs.backgroundColor,vis:r.width>0&&cs.display!=='none'};};
  const T=s=>[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {text:e.textContent.trim().slice(0,30),rect:[r.left,r.top,r.right,r.bottom].map(Math.round),color:cs.color,bg:cs.backgroundColor};});
  return {vw:innerWidth,vh:innerHeight,mode:document.querySelector('#gadget-ui').dataset.mode,orient:document.querySelector('#gadget-ui').dataset.orient,device:R('.phone-device'),screen:R('.phone-screen'),
   pill:T('.ix-pill-wrap .ix-pill'),tape:R('.ix-tape'),zoom:R('[data-bino-zoom]'),chip:R('#gadget-ui .gadget-chip'),labels:T('.ix-lm .tag,.ix-edge,.ix-bino-note'),
   bar:R('.phone-bar'),top:R('.phone-top'),buttons:T('#gadget-ui button')};});
 // 대비: 글자색과 배경색(불투명 합성은 단순화: rgba 알파 무시, 배경이 투명이면 건너뜀)
 const parse=s=>(s.match(/[\d.]+/g)||[]).map(Number);
 const contrast=[];for(const t of [...m.pill,...m.labels]){const c=parse(t.color),b=parse(t.bg);if(b.length>=3&&(b[3]===undefined||b[3]>.5))contrast.push({text:t.text,ratio:+ratio(c,b).toFixed(2)});}
 Object.assign(row,m,{contrast});
 await page.screenshot({path:`${out}/gadget-${tag}-${key}.png`});console.log(key,JSON.stringify({device:m.device?.rect,pill:m.pill.length,contrast}));
 row.errors=errors;await ctx.close();
}
writeFileSync(`${out}/gadget-${tag}-report.json`,JSON.stringify(report,null,1));
await browser.close();
