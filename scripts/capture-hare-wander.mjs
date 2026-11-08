// 동물 배회·토끼(2026-11-07) 화면 확인. 휴대폰 세로 390×844(DPR 2)·PC 1920×1080, 오후 16:00·가을.
//  ① 토끼: 10m 앞 풀 뜯기 → 6.5m 앞 귀 쫑긋(얼어붙음) → 2m 앞 달아남 → 20초 넘게 가만히 있으면 다시 다가옴
//  ② 배회: 구역에서 저절로 나온 동물의 자리가 8초 사이에 바뀌는지, 시간 칸 출현 목록(종류별 수)
//  ③ 휴대폰 프레임: 동물이 나와 있는 채로 240프레임 간격(헤드리스 크롬이라 참고값)
// 사용: npx vite --port 5321 → node scripts/capture-hare-wander.mjs [phone|pc] · 결과 artifacts/hare-wander-2026-11-07/
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:5321/',out='artifacts/hare-wander-2026-11-07';mkdirSync(out,{recursive:true});
const {initialState}=await import('../src/movement.js');
const only=process.argv[2];
const VIEWS=[['phone',{width:390,height:844},true],['pc',{width:1920,height:1080},false]].filter(v=>!only||v[0]===only);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const report={};
for(const [name,viewport,mobile] of VIEWS){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(()=>{if(!sessionStorage.getItem('hw-keep')){localStorage.clear();sessionStorage.setItem('hw-keep','1');}localStorage.setItem('gwanak-hiking:sound:v1','false');
  const v=sessionStorage.getItem('hw-save');if(v){localStorage.setItem('gwanak-hiking:v1',v);sessionStorage.removeItem('hw-save');}});
 const page=await ctx.newPage(),errors=[],rep=report[name]={};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|404/.test(m.text()))errors.push(m.text().slice(0,300));});
 const ready=()=>page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail&&window.hiking.landscape().natureReady,null,{timeout:300000});
 const go=async s=>{if(!page.url().startsWith('http'))await page.goto(base+'?pick=off');await page.evaluate(v=>sessionStorage.setItem('hw-save',v),JSON.stringify({...initialState({start:'demo'}),s,lateral:0,view:'third'}));
  await page.goto(base+'?time=16:00&weather=clear&season=autumn');await ready();await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await page.addStyleTag({content:'#resume-note{display:none!important}'});await page.evaluate(()=>window.hiking.chunks?.ready?.());await sleep(2500);};
 const shot=async n=>{const f=`${out}/${name}-${n}.png`;await page.screenshot({path:f});console.log(f);return f;};
 const hare=()=>page.evaluate(()=>{const l=window.hiking.trail.status().animals;return l.find(a=>a.id.startsWith('summon-hare'))??null;});
 const bubble=()=>page.evaluate(()=>window.__trailLastSay?.text??null);
 // 동동이에서 대상까지 거리
 const distTo=a=>page.evaluate(a=>{const p=window.hiking.coordinates();return a?+Math.hypot(a.x-p.x,a.z-p.z).toFixed(2):null;},a);
 // ① 토끼
 await go(2690);
 await page.evaluate(()=>window.hiking.trail.summon('hare',{ahead:9,offset:.4}));await sleep(5000);
 let h=await hare();rep.graze={hare:h,dist:await distTo(h)};await shot('1-hare-graze');
 await page.evaluate(()=>window.hiking.trail.summon('hare',{ahead:6.3,offset:.3}));await sleep(450);
 h=await hare();rep.alert={hare:h,dist:await distTo(h),bubble:await bubble()};await shot('2-hare-alert');
 await page.evaluate(()=>window.hiking.trail.summon('hare',{ahead:2.2,offset:.2}));await sleep(500);
 h=await hare();rep.flee={hare:h,dist:await distTo(h),bubble:await bubble()};await shot('3-hare-flee');
 await sleep(1300);h=await hare();rep.fleeLater={hare:h,dist:await distTo(h)};await shot('4-hare-running');
 // 가만히 20초 넘게 → 다시 다가옴(달아난 뒤 6초 이상 지나야 한다)
 await sleep(23000);h=await hare();rep.return={hare:h,dist:await distTo(h),bubble:await bubble()};await shot('5-hare-return');
 await sleep(9000);h=await hare();rep.returned={hare:h,dist:await distTo(h)};await shot('6-hare-back');
 // ② 저절로 나온 동물의 배회(소환 없음)
 await go(3230);
 const spawns=await page.evaluate(()=>window.hiking.trail.spawns());rep.slot=spawns.slot;
 rep.spawnKinds=spawns.list.reduce((o,s)=>(o[s.kind]=(o[s.kind]??0)+1,o),{});rep.spawnZones=[...new Set(spawns.list.map(s=>s.zone))].length;
 const a0=(await page.evaluate(()=>window.hiking.trail.status().animals));await sleep(8000);const a1=await page.evaluate(()=>window.hiking.trail.status().animals);
 rep.wander=a0.map(a=>{const b=a1.find(x=>x.id===a.id);return {id:a.id,kind:a.kind,mode:[a.mode,b?.mode],state:[a.state,b?.state],moved:b?+Math.hypot(b.x-a.x,b.z-a.z).toFixed(2):null};});
 await shot('7-wander');
 // ③ 프레임: 동물 3마리를 앞에 두고 / 모두 치운 뒤
 const frames=()=>page.evaluate(()=>new Promise(res=>{const t=[];let last=performance.now();const f=now=>{t.push(now-last);last=now;if(t.length<240)requestAnimationFrame(f);else{t.sort((a,b)=>a-b);res({avg:+(t.reduce((s,x)=>s+x,0)/t.length).toFixed(2),p95:+t[Math.floor(t.length*.95)].toFixed(2)});}};requestAnimationFrame(f);}));
 await page.evaluate(()=>{const T=window.hiking.trail;T.summon('squirrel',{ahead:6,offset:1});});await sleep(300);
 rep.animalsOut=await page.evaluate(()=>window.hiking.trail.status().animals.map(a=>a.kind));
 rep.frames=await frames();rep.render=await page.evaluate(()=>{const m=window.__hikingMetrics;return m&&{calls:m.drawCalls,triangles:m.triangles,fps:m.fps};});
 rep.errors=errors;console.log(name,JSON.stringify(rep,null,1));
 await ctx.close();
}
await browser.close();
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,1));
