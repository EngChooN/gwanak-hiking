// 카툰 비교 이미지: 우리 화면 1장 + 참고 사진 2~3장을 2×2로 붙이고, 아래에 2단계 기준색 띠를 깐다.
// 오브젝트 하나를 고칠 때마다 같은 자리에서 찍어 artifacts/cartoon-compare/에 남긴다(참고 사진이 들어가므로 커밋 금지, .gitignore).
//
// 사용(개발 서버를 먼저 띄운다: npx vite --host 127.0.0.1 --port 5310):
//   node scripts/cartoon-compare.mjs tree                     # 프리셋 하나(scripts/cartoon-compare-presets.json)
//   node scripts/cartoon-compare.mjs tree,grass --tag after   # 여러 개, 파일명 접미사
//   node scripts/cartoon-compare.mjs final                    # 최종 판정 10장 전부
//   node scripts/cartoon-compare.mjs --name my-rock --s 3600 --yaw -30 --pitch -8 --time 11:00 --refs 04_19,04_14,04_16
//   node scripts/cartoon-compare.mjs rock --image shot.png    # 이미 찍은 화면으로 비교 이미지만 만든다
// 옵션: --base URL(기본 http://127.0.0.1:5310) --style toon|realistic(기본 toon) --tag 접미사(기본 날짜 없이 'now')
//       --start demo|summit|plaza --s --lateral --yaw --pitch --bearing --time HH:MM --weather clear --third(3인칭) --refs a,b,c
//       --bino 배율(쌍안경, 예 8) --out 하위폴더(예 city → artifacts/cartoon-compare/city/)
// 결과: artifacts/cartoon-compare/<이름>-<tag>.png(비교), shots/<이름>-<style>-<tag>.png(우리 화면 원본), results.json(오류·위치)
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {waitChunks} from './lib/chunk-wait.mjs';
import {refPath,withCanvasPage,composeGrid} from './lib/ref-image.mjs';

const argv=process.argv.slice(2),opt={},names=[];
for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2),v=argv[i+1];if(v===undefined||v.startsWith('--'))opt[k]=true;else{opt[k]=v;i++;}}else names.push(...a.split(','));}
const presets=JSON.parse(readFileSync('scripts/cartoon-compare-presets.json','utf8'));
const palette=existsSync('docs/카툰-팔레트.json')?JSON.parse(readFileSync('docs/카툰-팔레트.json','utf8')):{};
const num=k=>opt[k]===undefined?undefined:Number(opt[k]);
const custom=Object.fromEntries(Object.entries({start:opt.start,s:num('s'),lateral:num('lateral'),yaw:num('yaw'),pitch:num('pitch'),bearing:num('bearing'),time:opt.time,weather:opt.weather,third:opt.third,bino:num('bino'),refs:opt.refs?.split(','),label:opt.label}).filter(([,v])=>v!==undefined));
let jobs=names.flatMap(n=>n==='final'?Object.keys(presets).filter(k=>presets[k].final):[n]).map(n=>{if(!presets[n])throw new Error(`프리셋 없음: ${n} (있는 것: ${Object.keys(presets).filter(k=>!k.startsWith('_')).join(', ')})`);return {name:n,...presets[n],...custom};});
if(!jobs.length){if(!opt.name)throw new Error('프리셋 이름이나 --name을 주세요');jobs=[{name:opt.name,label:opt.name,time:'11:00',...custom}];}
const base=opt.base??'http://127.0.0.1:5310',style=opt.style??'toon',tag=opt.tag??'now';
const outDir=`artifacts/cartoon-compare${opt.out?`/${opt.out}`:''}`;mkdirSync(`${outDir}/shots`,{recursive:true});
const viewport={width:1440,height:810};
const resultsPath=`${outDir}/results.json`,results=existsSync(resultsPath)?JSON.parse(readFileSync(resultsPath,'utf8')):{};

async function capture(browser,job){
 const context=await browser.newContext({viewport,deviceScaleFactor:1});
 const onRoute=job.s!==undefined;
 // 코스 위 자리는 저장 상태를 심어 바로 그 지점에서 시작한다(initialState는 첫 페이지에서 받아 온다).
 let save=null;
 if(onRoute){const probe=await context.newPage();await probe.goto(`${base}/?style=${style}&startMode=manual`,{waitUntil:'domcontentloaded'});
  save=await probe.evaluate(async ({s,lateral})=>{const {initialState}=await import('/src/movement.js');return JSON.stringify({...initialState({start:'demo'}),s,lateral:lateral??0,zone:'route'});},job);await probe.close();}
 await context.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');if(save)localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE\.WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,300));});
 const q=new URLSearchParams({style,outfit:'1',time:job.time??'11:00',weather:job.weather??'clear',quality:'high'});
 if(!onRoute)q.set('start',job.start??'demo');if(job.bearing!==undefined)q.set('bearing',String(job.bearing));
 await page.goto(`${base}/?${q}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.waitForTimeout(1500);await closeDialogs();
 if(await page.evaluate(()=>window.hiking.snapshot().paused))await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'pause'}})));
 if(job.third)await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'view'}})));
 // 시선: 손을 뗀 채 놓으면 앞으로 되돌아가므로 누른 채로 끌기만 한다. 1px = yaw 0.004rad, pitch 0.003rad. bearing이 있으면 yaw는 무시(방위 고정).
 const yaw=job.bearing!==undefined?0:(job.yaw??0),pitch=job.pitch??0,cx=viewport.width/2,cy=viewport.height/2;
 if(yaw||pitch)await page.evaluate(([cx,cy,dx,dy])=>{Element.prototype.setPointerCapture=()=>{};const el=document.getElementById('world'),ev=(type,x,y)=>el.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'mouse',clientX:x,clientY:y,button:0,buttons:1,bubbles:true}));
  ev('pointerdown',cx,cy);for(let i=1;i<=20;i++)ev('pointermove',cx+dx*i/20,cy+dy*i/20);},[cx,cy,-yaw*Math.PI/180/.004,(-.04-pitch*Math.PI/180)/.003]);
 // 쌍안경: 켠 뒤 배율을 맞춘다(기본 8배). 확대는 zoom-in/out 한 단계씩.
 if(job.bino){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'binoculars'}})));await page.waitForTimeout(300);
  for(let i=0;i<20;i++){const z=await page.evaluate(()=>window.hiking.gadgetView().binoculars.zoom);if(Math.abs(z-job.bino)<.5)break;await page.evaluate(id=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id}})),z<job.bino?'zoom-in':'zoom-out');}}
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
 await page.addStyleTag({content:'#section-jump{display:none!important}'});
 await page.waitForTimeout(5000);await closeDialogs();
 const file=`${outDir}/shots/${job.name}-${style}-${tag}.png`;
 await (await waitChunks(page)).screenshot({path:file});
 const info=await page.evaluate(()=>({position:window.hiking.position(),shaderErrors:window.hiking.rendering().shaderErrors?.length??0,elevation:window.hiking.rendering().environment?.light?.elevation}));
 await context.close();
 return {file,errors,...info};
}

const browser=jobs.some(j=>!opt.image)?await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']}):null;
try{
 await withCanvasPage(async page=>{
  for(const job of jobs){
   const shot=opt.image?{file:opt.image,errors:[]}:await capture(browser,job);
   const refs=(job.refs??[]).slice(0,3);
   const tiles=[{path:shot.file,label:`우리 화면 · ${style==='toon'?'카툰':'실사'} · ${job.label??job.name} · ${job.time??''}`},...refs.map(r=>({path:refPath(r),label:`참고 ${r}`}))];
   const swatches=(job.palette??[]).map(k=>{const [ph,key]=k.split('.'),v=palette[ph]?.[key];return v?.hex?{label:`${k} 기준`,hex:v.hex}:null;}).filter(Boolean);
   const out=`${outDir}/${job.name}-${tag}.png`;
   writeFileSync(out,await composeGrid(page,tiles,{cols:2,cellW:960,title:`${job.label??job.name} — 우리 화면 vs 참고 (${tag})`,swatches}));
   results[`${job.name}-${tag}`]={compare:out,shot:shot.file,refs,errors:shot.errors,shaderErrors:shot.shaderErrors,position:shot.position,elevation:shot.elevation};
   writeFileSync(resultsPath,JSON.stringify(results,null,1));
   console.log(job.name,out,`오류 ${shot.errors.length} 셰이더 ${shot.shaderErrors??'-'}`);
  }
 },browser??undefined);
}finally{await browser?.close();}
