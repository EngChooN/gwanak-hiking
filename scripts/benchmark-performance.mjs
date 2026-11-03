import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {route} from '../src/route.js';
const label=process.env.LABEL??'after',base=process.env.BASE_URL??'http://127.0.0.1:5176';
const duration=Number(process.env.SECONDS??20)*1000;
// 노면 경계 분할로 선분 번호가 바뀌어도 after3의 원래 GPX 310번 점을 유지한다.
const startPoint=route.points[310],startSegment=route.segments.find(s=>Math.hypot(s.a.x-startPoint.x,s.a.z-startPoint.z)<1e-7);
if(!startSegment)throw new Error('기준 GPX 측정 위치를 찾을 수 없음');
const folder=`artifacts/performance-${label}`;await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist']});
const results={label,date:new Date().toISOString(),base,duration,environment:{platform:process.platform,arch:process.arch,chrome:browser.version(),viewport:'1440×900',dpr:1,headed:process.env.HEADED==='1'},runs:[],errors:[]};
try{
 for(const [quality,cpu,view,actions] of [['high',1,'third',['idle','w','s','a','d','auto']],['high',1,'first',['w']],['balanced',4,'third',['w']]]){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state:{...initialState(),s:startSegment.start,view,paused:true},key:SAVE_KEY});
  const page=await context.newPage();let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});page.on('pageerror',e=>results.errors.push(e.message));
  await page.goto(`${base}/?quality=${quality}`);
  await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:240000});
  await page.waitForTimeout(15000);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
  for(const action of actions){
   const navigationBefore=navigations;
   const id=`${quality}-${cpu}x-${view}-${action}`;
   // 준비된 장면에서 재생을 시작한다. 로딩 시간과 보행 시간을 혼합하지 않는다.
   if((await page.evaluate(()=>hiking.snapshot().paused)))await page.locator('#pause').click();
   if(action==='auto')await page.locator('#auto').click();
   else if(action!=='idle')await page.keyboard.down(action);
   await page.waitForTimeout(1500);
   const instrumentationStart=performance.now();
   await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
   await cdp.send('Profiler.start');
   await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.frame',transferMode:'ReturnAsStream'});
   const instrumentationSetupMs=performance.now()-instrumentationStart;
   // Profiler.start의 멈춤을 보행 프레임에 섞지 않는다. 준비 시간은 별도 보고한다.
   await page.waitForTimeout(1500);
   await page.waitForFunction(()=>!hiking.rendering().compiling);
   const before=await page.evaluate(()=>hiking.snapshot());
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(t=>{
    window.__hikingPerformance?.reset();
    window.__benchmarkAdaptiveStart={...hiking.adaptive(),ao:hiking.rendering().ao};
    window.__benchmarkCompileStart=hiking.rendering().compileCount;
    window.__benchmarkFrames=[];window.__benchmarkLast=t;window.__benchmarkOn=true;
    window.__benchmarkStartedAt=performance.now();performance.mark('hiking-measure-start');
    const tick=t=>{if(!window.__benchmarkOn)return;window.__benchmarkFrames.push(t-window.__benchmarkLast);window.__benchmarkLast=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
    resolve();
   })));
   await page.waitForTimeout(duration);
   // 집계를 먼저 고정해 trace 전송과 Profiler.stop의 멈춤도 측정에서 제외한다.
   const data=await page.evaluate(()=>{
    window.__benchmarkOn=false;performance.mark('hiking-measure-end');
    const frames=window.__benchmarkFrames,times=[...frames].sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0);
    const start=window.__benchmarkAdaptiveStart,end={...hiking.adaptive(),ao:hiking.rendering().ao};
    const cost=(a,b)=>{const frames=b.frames-a.frames,ms=b.ms-a.ms;return {frames,totalWorkMs:ms,meanWorkMs:frames?ms/frames:null};};
    const on=cost(start.aoWork.on,end.aoWork.on),off=cost(start.aoWork.off,end.aoWork.off);
    const aoCost={on,off,deltaWorkMs:on.frames&&off.frames?on.meanWorkMs-off.meanWorkMs:null,
     session:{on:end.aoWork.on,off:end.aoWork.off,deltaWorkMs:end.aoWork.on.frames&&end.aoWork.off.frames?end.aoWork.on.ms/end.aoWork.on.frames-end.aoWork.off.ms/end.aoWork.off.frames:null}};
    const activeFrames=end.totalFrames-start.totalFrames,aoFrames=end.aoFrames-start.aoFrames;
    const adaptive={start,end,aoCost,aoChanges:end.renderedAOChanges-start.renderedAOChanges,stepChanges:end.changes-start.changes,activeFrames,aoFrames,
     aoFrameRatio:activeFrames?aoFrames/activeFrames:null,
     transitions:end.decisions.filter(row=>row.index>start.changes)};
    const compileStart=window.__benchmarkCompileStart,compileEnd=hiking.rendering().compileCount;
    return {adaptive,compile:{start:compileStart,end:compileEnd,changes:compileEnd-compileStart},measuredWindowMs:performance.now()-window.__benchmarkStartedAt,snapshot:hiking.snapshot(),metrics:window.__hikingMetrics,performance:window.__hikingPerformance?.report(),frame:{frames:frames.length,fps:frames.length*1000/sum,p95Ms:times[Math.floor(times.length*.95)],p99Ms:times[Math.floor(times.length*.99)],maxMs:times.at(-1),over50ms:times.filter(t=>t>50).length},gpu:document.querySelector('canvas').getContext('webgl2')?.getParameter(0x1f01)};
   });
   const traceDone=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
   await cdp.send('Tracing.end');const {stream}=await traceDone;
   let trace='';for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
   const {profile}=await cdp.send('Profiler.stop');
   if(navigations!==navigationBefore)throw new Error('측정 중 페이지 재로딩 감지: 사본/빌드 preview에서 다시 측정 필요');
   if(action==='auto')await page.locator('#auto').click();else if(action!=='idle')await page.keyboard.up(action);
   const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
   for(let i=0;i<(profile.samples?.length??0);i++){const id=profile.samples[i];self.set(id,(self.get(id)??0)+(profile.timeDeltas[i]??0));}
   const hot=[...self].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([id,us])=>({function:nodes.get(id)?.callFrame.functionName,url:nodes.get(id)?.callFrame.url,line:(nodes.get(id)?.callFrame.lineNumber??-1)+1,ms:us/1000}));
   const expected=quality==='high'?55:50;
   const triangleBudget=quality==='high'?2500000:1500000;
   const perf=data.performance;
   // 독립 rAF가 돌더라도 셰이더 준비 중 실제 렌더가 멎으면 통과시키지 않는다.
   const framePass=data.frame.fps>=expected&&data.frame.over50ms/data.frame.frames<=.01;
   const renderPass=perf?.frames>0&&perf.fps>=expected&&perf.over50ms/perf.frames<=.01;
   const maxFrameBudgetMs=500;
   const maxFramePass=data.frame.maxMs<=maxFrameBudgetMs&&perf?.maxMs<=maxFrameBudgetMs;
   const budgetPass=Number.isFinite(perf?.maxTriangles)&&perf.maxTriangles<=triangleBudget;
   const city=perf?.categories&&(perf.categories['원경 도시']??{maxTriangles:0,maxDrawCalls:0}),cityTriangleBudget=quality==='high'?600000:300000;
   const cityPass=Number.isFinite(city?.maxTriangles)&&city.maxTriangles<=cityTriangleBudget&&(quality==='high'||city.maxDrawCalls<=100);
   const {compileError,shaderErrors}=await page.evaluate(()=>hiking.rendering());
   const shaderPass=Array.isArray(shaderErrors)&&shaderErrors.length===0;
   const durationPass=data.measuredWindowMs>=duration&&data.frame.frames>0;
   // 20초당 단계 변경 1회 이하. AO 켜짐 자체는 의무가 아니다.
   const stabilityChangeBudget=Math.max(1,Math.floor(duration/20000));
   const aoPass=data.adaptive.activeFrames>0&&data.adaptive.stepChanges<=stabilityChangeBudget&&data.adaptive.aoChanges<=stabilityChangeBudget;
   const compilePass=data.compile.start===1&&data.compile.changes===0;
   const pass=framePass&&renderPass&&maxFramePass&&durationPass&&budgetPass&&cityPass&&aoPass&&compilePass&&!compileError&&shaderPass;
   results.runs.push({id,quality,cpu,view,action,before,...data,instrumentationSetupMs,instrumentationWarmupMs:1500,hot,pass,framePass,renderPass,maxFramePass,maxFrameBudgetMs,durationPass,budgetPass,cityPass,aoPass,compilePass,shaderPass,shaderErrors,cityTriangleBudget,compileError,triangleBudget,expectedFps:expected});
   await writeFile(`${folder}/${id}.trace.json`,trace);await writeFile(`${folder}/${id}.cpuprofile`,JSON.stringify(profile));
   if(action==='w')await page.screenshot({path:`${folder}/${id}.png`});
   console.log(id,JSON.stringify({frame:data.frame,hot:hot.slice(0,8),pass}));
   await writeFile(`${folder}/results.json`,JSON.stringify(results,null,2));
  }
  await context.close();
 }
}catch(error){results.errors.push(error.stack);process.exitCode=1;}
finally{await browser.close();await writeFile(`${folder}/results.json`,JSON.stringify(results,null,2));}
const decomposition=['# 종류별 실제 렌더 제출량',`측정: ${results.date} / ${label}`,'평균은 측정 전체 프레임 기준이다. 종류별 최대의 합은 동시 프레임 최대와 다를 수 있다.'];
for(const run of results.runs){
 const city=run.performance?.categories?.['원경 도시'];
 decomposition.push(`\n도시 모든 패스 합산 최대: ${city?.maxTriangles}삼각형 / ${city?.maxDrawCalls}회, 판정 ${run.cityPass?'통과':'미달'}`);
 decomposition.push(`\n## ${run.id}\n`,`fps ${run.performance?.fps?.toFixed(1)} / 최대 삼각형 ${run.performance?.maxTriangles} / 판정 ${run.pass?'통과':'미달'}`,
  '\n| 종류 | 패스 | 평균 삼각형 | 최대 삼각형 | 평균 드로우콜 |','|---|---|---:|---:|---:|');
 for(const row of Object.values(run.performance?.breakdown??{}).sort((a,b)=>b.triangles-a.triangles))decomposition.push(`| ${row.kind} | ${row.pass} | ${row.triangles.toFixed(0)} | ${row.maxTriangles} | ${row.drawCalls.toFixed(1)} |`);
 const sum=Object.values(run.performance?.breakdown??{}).reduce((total,row)=>total+row.triangles,0);
 decomposition.push(`\n분해 평균 합계 ${sum.toFixed(0)} / renderer 평균 ${run.performance?.triangles?.toFixed(0)} / 차이 ${(sum-(run.performance?.triangles??0)).toFixed(3)}`);
}
await writeFile(`${folder}/breakdown.md`,decomposition.join('\n')+'\n');
if(results.errors.length)console.error(results.errors);
if(results.errors.length||results.runs.some(run=>!run.pass))process.exitCode=1;
