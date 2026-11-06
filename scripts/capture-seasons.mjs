// 계절 비교 촬영: 같은 자리에서 봄·여름·가을·겨울을 찍는다(페이지는 한 번만 열고 hiking.setSeason으로 바꾼다 — 다시 로딩하지 않는지도 함께 확인).
// 개발 서버를 먼저 띄운다: npx vite --host 127.0.0.1 --port 5310
//   node scripts/capture-seasons.mjs [자리,...] [--time 11:00] [--tag day] [--out artifacts/seasons] [--size 1440x810] [--seasons spring,summer,autumn,winter]
// --mobile 1: 아이폰 흉내. 자리: scripts/cartoon-compare-presets.json의 이름(forest·tree·ridge·summit-view …). 결과: <out>/<자리>-<계절>-<tag>.png, <out>/results-<tag>.json
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {waitChunks} from './lib/chunk-wait.mjs';

const argv=process.argv.slice(2),opt={},names=[];
for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){opt[a.slice(2)]=argv[++i];}else names.push(...a.split(','));}
const presets=JSON.parse(readFileSync('scripts/cartoon-compare-presets.json','utf8'));
const base=opt.base??'http://127.0.0.1:5310',tag=opt.tag??'day',out=opt.out??'artifacts/seasons',time=opt.time??'11:00';
const [vw,vh]=(opt.size??'1440x810').split('x').map(Number),viewport={width:vw,height:vh};
const seasons=(opt.seasons??'spring,summer,autumn,winter').split(',');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const results={};
for(const name of names.length?names:['forest']){
 const job={...presets[name]};if(!presets[name])throw new Error(`프리셋 없음: ${name}`);
 // --mobile 1: 아이폰 흉내(터치·모바일 화질 상한). 크기는 --size로(예 390x844).
 const context=await browser.newContext(opt.mobile?{viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}:{viewport,deviceScaleFactor:1}),onRoute=job.s!==undefined;let save=null;
 if(onRoute){const probe=await context.newPage();await probe.goto(`${base}/?startMode=manual`,{waitUntil:'domcontentloaded'});
  save=await probe.evaluate(async ({s,lateral})=>{const {initialState}=await import('/src/movement.js');return JSON.stringify({...initialState({start:'demo'}),s,lateral:lateral??0,zone:'route'});},job);await probe.close();}
 await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await context.newPage(),errors=[];let loads=0;
 page.on('load',()=>loads++);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,300));});
 const q=new URLSearchParams({time:opt.time??job.time??'11:00',weather:opt.weather??'clear'});if(!opt.mobile)q.set('quality',opt.quality??'high');
 if(!onRoute)q.set('start',job.start??'demo');if(job.bearing!==undefined)q.set('bearing',String(job.bearing));
 await page.goto(`${base}/?${q}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.waitForTimeout(1500);await closeDialogs();
 const yaw=job.bearing!==undefined?0:(job.yaw??0),pitch=job.pitch??0,cx=vw/2,cy=vh/2;
 if(yaw||pitch)await page.evaluate(([cx,cy,dx,dy])=>{Element.prototype.setPointerCapture=()=>{};const el=document.getElementById('world'),ev=(type,x,y)=>el.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'mouse',clientX:x,clientY:y,button:0,buttons:1,bubbles:true}));
  ev('pointerdown',cx,cy);for(let i=1;i<=20;i++)ev('pointermove',cx+dx*i/20,cy+dy*i/20);},[cx,cy,-yaw*Math.PI/180/.004,(-.04-pitch*Math.PI/180)/.003]);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
 await page.addStyleTag({content:'#section-jump{display:none!important}'});
 await page.waitForTimeout(4000);await closeDialogs();
 for(const season of seasons){
  await page.evaluate(s=>window.hiking.setSeason(s,{instant:true}),season);
  await page.waitForTimeout(1200);
  const file=`${out}/${name}-${season}-${tag}.png`;await (await waitChunks(page)).screenshot({path:file});
  const info=await page.evaluate(()=>({season:window.hiking.season(),shaderErrors:window.hiking.rendering().shaderErrors?.length??0,memory:window.hiking.memory?.()}));
  results[`${name}-${season}`]={file,...info};console.log(name,season,file,`셰이더 오류 ${info.shaderErrors}`);
 }
 results[name]={errors,pageLoads:loads};console.log(name,'페이지 로드',loads,'오류',errors.length,errors.slice(0,3).join(' | '));
 await context.close();
}
writeFileSync(`${out}/results-${tag}.json`,JSON.stringify(results,null,1));
await browser.close();
