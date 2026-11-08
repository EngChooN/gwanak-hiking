// ⑥ 무리해서 뛰면(헥헥·다리에 쥐) 게임 안 확인: 실제로 Shift+W로 오르막을 뛰어 스테미너를 0으로 만들고, 헥헥 → 터벅터벅 → 회복을 본다.
// 쥐는 확률(25%)이라 hiking.trail.exhaust('cramp')로 일으켜 3초 자동 풀림·🦶 발끝 당기기(1초)·이동 막힘·1인칭 시야 0.3m 낮춤을 잰다.
// 개발 서버를 먼저 띄운다: npx vite --host 127.0.0.1 --port 5310
//   node scripts/verify-exhaustion.mjs [--out artifacts/trail-props] [--size 1280x800] [--mobile 1]
// 결과: <out>/pant.png · trudge.png · cramp.png · cramp-hat.png(+ -mobile), <out>/exhaustion.json
import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';

const argv=process.argv.slice(2),opt={};for(let i=0;i<argv.length;i+=2)opt[argv[i].slice(2)]=argv[i+1];
const base=opt.base??'http://127.0.0.1:5310',out=opt.out??'artifacts/trail-props',[vw,vh]=(opt.size??'1280x800').split('x').map(Number),mobile=!!opt.mobile,sfx=mobile?'-mobile':'';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const errors=[];
const open=async(save)=>{const ctx=await browser.newContext(mobile?{viewport:{width:vw,height:vh},deviceScaleFactor:2,isMobile:true,hasTouch:true}:{viewport:{width:vw,height:vh}});
 await ctx.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});return {ctx,page};};
const ready=page=>page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
// 1) 오르막(경사 15% 이상이 30m 넘게 이어지는 곳)을 찾고, 스테미너 6에서 3인칭으로 시작한다
let {ctx,page}=await open(null);
await page.goto(`${base}/hiking/?quality=low`);await ready(page);
const save=await page.evaluate(async()=>{const {route,sample}=await import('/src/route.js');const {initialState}=await import('/src/movement.js');
 let s0=null;for(let s=300;s<route.length-200;s+=2){let ok=true;for(let k=0;k<=30;k+=2){const p=sample(s+k);if(!(p.slope>=.15)||p.material==='stairs'||/stair/.test(p.material)){ok=false;break;}}if(ok){s0=s;break;}}
 return JSON.stringify({...initialState({start:'demo'}),s:s0,lateral:0,zone:'route',view:'third',stamina:6});});
await ctx.close();({ctx,page}=await open(save));
const q=new URLSearchParams({time:'11:00',weather:'clear',season:'summer'});if(!mobile)q.set('quality','high');
await page.goto(`${base}/hiking/?${q}`);await ready(page);
const setView=v=>page.evaluate(v=>{if(window.hiking.snapshot().view!==v)window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'view'}}));},v);await setView('third');
await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.dispatchEvent(new CustomEvent('hiking:hud-toggle'));});
await page.addStyleTag({content:'#section-jump{display:none!important}'});
await page.waitForTimeout(2000);
const result={start:JSON.parse(save).s,errors};
// 몸 기준 카메라(시안 구도: 시안 공간 → 몸 앞 방향 기준, yaw = 시안에서 몸이 돈 각)
const camAt=(cam,yaw)=>page.evaluate(({cam,yaw})=>{const r=window.__hiker.scene,V=r.position.constructor,Y=r.rotation.y+Math.PI-yaw,c=Math.cos(Y),s=Math.sin(Y),o=r.position.clone();
 const f=p=>new V(o.x+p[0]*c+p[2]*s,o.y+p[1],o.z-p[0]*s+p[2]*c);window.hiking.cameraOverride={p:f(cam.p).toArray(),t:f(cam.t).toArray(),fov:cam.fov};},{cam,yaw});
const ex=()=>page.evaluate(()=>({...window.hiking.trail.status().exhaustion,acts:window.hiking.trail.status().acts,stamina:window.hiking.snapshot().stamina,runExhausted:window.hiking.snapshot().runExhausted,pos:window.hiking.position(),bubble:window.hiking.trail.status().bubble?.text??null}));
const waitFor=(fn,arg,ms=20000)=>page.waitForFunction(fn,arg,{timeout:ms,polling:'raf'});
// 2) 실제로 뛰어서 0 만들기 → 헥헥
await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
const t0=Date.now();await waitFor(()=>window.hiking.trail.status().exhaustion.phase!=='none');result.runSeconds=(Date.now()-t0)/1000;
const at0=await ex();result.firstPhase=at0.phase;result.uphillStart=at0.pos;result.slopeHere=await page.evaluate(async s=>{const {sample}=await import('/src/route.js');return +sample(s).slope.toFixed(3);},at0.pos.s);
// 헥헥 중에는 W·Shift를 계속 눌러도 움직이지 않는다
await waitFor(()=>window.hiking.trail.status().acts.active?.t>.85);
await camAt({p:[2.4,1.0,3.2],t:[.1,.5,0],fov:30},.5);await page.waitForTimeout(40);
const mid=await ex();await page.screenshot({path:`${out}/run-${mid.phase}${sfx}.png`});
result.pant={phase:mid.phase,bubble:mid.bubble,moved:Math.hypot(mid.pos.x-at0.pos.x,mid.pos.z-at0.pos.z)};
await waitFor(()=>window.hiking.trail.status().exhaustion.phase==='none');result.pant.seconds=(Date.now()-t0)/1000-result.runSeconds;
await page.keyboard.up('ShiftLeft');
// 3) 터벅터벅(뛰기 키 없이 걷기, 스테미너 30 전까지)
await page.waitForTimeout(900);
const tr=await ex();await camAt({p:[2.6,1.1,2.4],t:[0,.5,0],fov:32},0);await page.waitForTimeout(40);await page.screenshot({path:`${out}/trudge${sfx}.png`});
result.trudge={trudge:tr.trudge,acts:tr.acts.trudge,runExhausted:tr.runExhausted,stamina:tr.stamina};
await page.evaluate(()=>{window.hiking.cameraOverride=null;});
await page.keyboard.up('KeyW');
await waitFor(()=>!window.hiking.snapshot().runExhausted,null,30000);await page.waitForTimeout(700);
result.recovered=(await ex()).acts.trudge;
// 3-1) 헥헥 장면(쥐가 25% 확률이라 따로 일으켜 시안 구도로 찍는다)
await page.evaluate(()=>window.hiking.trail.exhaust('pant'));await waitFor(()=>window.hiking.trail.status().acts.active?.t>.9);
await camAt({p:[2.4,1.0,3.2],t:[.1,.5,0],fov:30},.5);await page.waitForTimeout(40);await page.screenshot({path:`${out}/pant${sfx}.png`});
await waitFor(()=>!window.hiking.trail.status().acts.active);await page.evaluate(()=>{window.hiking.cameraOverride=null;});
// 4) 쥐: 3초 동안 이동 막힘, 저절로 풀림, 모자 다시 씀
await page.evaluate(()=>window.hiking.trail.exhaust('cramp'));const c0=await ex();await page.keyboard.down('KeyW');
await waitFor(()=>window.hiking.trail.status().acts.active?.t>1.35);await camAt({p:[.2,.95,3.4],t:[0,.35,0],fov:30},Math.PI/2);await page.waitForTimeout(40);
const c1=await ex();await page.screenshot({path:`${out}/cramp${sfx}.png`});
await waitFor(()=>window.hiking.trail.status().acts.active?.t>2.62);await page.waitForTimeout(40);await page.screenshot({path:`${out}/cramp-hat${sfx}.png`});
const tc=Date.now();await waitFor(()=>window.hiking.trail.status().exhaustion.phase==='none');
await waitFor(()=>!window.hiking.trail.status().acts.active);const c2=await ex();await page.keyboard.up('KeyW');
result.cramp={label:c0.label,hatOff:c1.acts.hatDetached,hatAt:c1.acts.hatAt,bubble:c1.bubble,moved:Math.hypot(c2.pos.x-c0.pos.x,c2.pos.z-c0.pos.z),hatBackOnHead:!c2.acts.hatDetached};
// 5) 🦶 발끝 당기기: 0.5초에 누르면 그 뒤 1초에 풀림
await page.evaluate(()=>{window.hiking.cameraOverride=null;window.hiking.trail.exhaust('cramp');});await page.waitForTimeout(500);
const r0=Date.now();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'cramp-release'}})));
await waitFor(()=>window.hiking.trail.status().exhaustion.phase==='none');result.release={seconds:(Date.now()-r0)/1000};
await waitFor(()=>!window.hiking.trail.status().acts.active);
// 6) 1인칭: 쥐가 나면 시야만 0.3m 천천히 낮춤
await setView('first');await page.waitForTimeout(800);
const camY=()=>page.evaluate(()=>window.hiking.orientation().camera[1]);const y0=await camY();
await page.evaluate(()=>window.hiking.trail.exhaust('cramp'));await page.waitForTimeout(300);const y1=await camY();await page.waitForTimeout(1500);const y2=await camY();
await waitFor(()=>!window.hiking.trail.status().acts.active);await page.waitForTimeout(1200);const y3=await camY();
result.firstPerson={view:(await page.evaluate(()=>window.hiking.snapshot().view)),drop300ms:+(y0-y1).toFixed(3),drop1800ms:+(y0-y2).toFixed(3),afterRecover:+(y0-y3).toFixed(3)};
writeFileSync(`${out}/exhaustion${sfx}.json`,JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));
await browser.close();
