// 광장 출발 검증(headless Chrome 1440×900): 로딩 단계 신호·로딩 중 입력 차단·광장 출발 1·3인칭·자유이동 경계·
// 일주문 통과·뒤로 돌아오기·새로고침 복원·?start=gate·콘솔 오류, 그리고 4시점·3인칭 보행 fps.
// 사용: BASE_URL=http://127.0.0.1:5190 node scripts/verify-plaza-start.mjs  (ONLY=flow,fps 로 일부만)
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {GATE_S,PLAZA_START,insidePlaza} from '../src/plaza.js';
const dir='artifacts/plaza-start';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5190',quality=process.env.QUALITY??'balanced',only=process.env.ONLY?.split(',');
const viewport={width:1440,height:900};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={date:new Date().toISOString(),base,quality,viewport:'1440×900',flow:{},fps:[],console:[]};
const save=()=>writeFileSync(`${dir}/results-${only?only.join('-'):'all'}.json`,JSON.stringify(out,null,2));
async function open(context,url,{record=true}={}){
 const page=await context.newPage();
 page.on('console',m=>{if(m.type()==='error')out.console.push({url,text:m.text(),location:m.location().url});});
 page.on('pageerror',e=>out.console.push({url,text:'pageerror: '+e.message}));
 if(record)await page.addInitScript(()=>{window.__loadingEvents=[];addEventListener('hiking:loading',e=>__loadingEvents.push({t:Math.round(performance.now()),stage:e.detail.stage,progress:e.detail.progress,label:e.detail.label}));});
 await page.goto(base+url);return page;
}
const position=page=>page.evaluate(()=>({...hiking.position(),elapsed:hiking.snapshot().elapsed,steps:hiking.snapshot().steps,auto:hiking.snapshot().auto,pose:hiking.snapshot().pose,course:Number(document.getElementById('distance').textContent.match(/([\d,]+) \//)?.[1].replace(/,/g,'')),label:document.getElementById('distance').textContent}));
// 매 프레임 위치·카메라 방향 기록(전환 프레임의 튐 확인).
const startTrace=page=>page.evaluate(()=>{window.__trace=[];const tick=()=>{const p=hiking.position(),o=hiking.orientation();__trace.push({t:performance.now(),zone:p.zone,x:p.x,z:p.z,s:p.s,heading:o.cameraHeading,camera:o.camera});window.__traceId=requestAnimationFrame(tick);};tick();});
const stopTrace=async page=>{const trace=await page.evaluate(()=>{cancelAnimationFrame(__traceId);return __trace;});
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));let maxStep=0,maxTurn=0,switches=[];
 for(let i=1;i<trace.length;i++){const a=trace[i-1],b=trace[i],step=Math.hypot(b.x-a.x,b.z-a.z),turn=Math.abs(wrap(b.heading-a.heading));maxStep=Math.max(maxStep,step);maxTurn=Math.max(maxTurn,turn);
  if(a.zone!==b.zone)switches.push({from:a.zone,to:b.zone,step,turnDeg:turn*180/Math.PI,cameraStep:Math.hypot(...b.camera.map((v,j)=>v-a.camera[j])),s:b.s});}
 return {frames:trace.length,maxStepM:maxStep,maxTurnDeg:maxTurn*180/Math.PI,switches};};
try{
 if(!only||only.includes('flow')){
  // 1) 저장 없는 첫 실행 + 수동 시작(로딩 화면 UI가 '출발하기'를 쓰는 경우와 같다)
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  await context.addInitScript(()=>{try{localStorage.setItem('gwanak-sound-enabled','false');}catch{}});
  const t0=Date.now();const page=await open(context,`/?quality=${quality}&startMode=manual`);
  // 로딩 도중 입력: 진행률 30%를 넘은 뒤 W를 누른 채 R·Space·C를 누른다.
  await page.waitForFunction(()=>window.hiking?.loading?.().progress>.3,null,{timeout:240000});
  await page.mouse.click(720,450);await page.keyboard.down('w');await page.keyboard.press('r');await page.keyboard.press('c');await page.keyboard.press('Space');
  await page.evaluate(()=>window.hiking.ready());await page.keyboard.up('w');
  const readyInfo=await page.evaluate(()=>hiking.loading());
  await page.keyboard.down('w');await page.keyboard.press('r');await page.waitForTimeout(2000);await page.keyboard.up('w');
  const beforeStart=await position(page);
  await (await waitChunks(page)).screenshot({path:`${dir}/ready-before-start.png`});
  const events=await page.evaluate(()=>__loadingEvents);
  out.flow.loading={wallMs:Date.now()-t0,loadMs:readyInfo.loadMs,readiness:(await page.evaluate(()=>hiking.readiness())),stagesSeen:[...new Set(events.map(e=>e.stage))],eventCount:events.length,monotonic:events.every((e,i)=>!i||e.progress>=events[i-1].progress),firstEvents:events.slice(0,3),lastEvents:events.slice(-3)};
  out.flow.inputBlocked={position:beforeStart,ok:beforeStart.elapsed===0&&beforeStart.steps===0&&!beforeStart.auto&&beforeStart.pose==='stand'&&beforeStart.zone==='plaza'&&Math.hypot(beforeStart.x-PLAZA_START.x,beforeStart.z-PLAZA_START.z)<1e-6,started:await page.evaluate(()=>hiking.started)};
  await page.evaluate(()=>hiking.start());await page.waitForFunction(()=>hiking.started);
  const first=await position(page);out.flow.plazaStart={...first,ok:first.zone==='plaza'&&first.course===0&&first.label.includes('출발 전 · 광장')&&Math.abs(first.heading-PLAZA_START.heading)<1e-9};
  await page.waitForTimeout(1500);await (await waitChunks(page)).screenshot({path:`${dir}/plaza-first.png`});
  await page.keyboard.press('v');await page.waitForTimeout(1500);await (await waitChunks(page)).screenshot({path:`${dir}/plaza-third.png`});await page.keyboard.press('v');
  save();
  // 2) 자유이동: 오른쪽(D) 3초, 왼쪽 경계까지 A 14초(광장 폭 12m), 뒤로(S) 경계까지 25초.
  const free={};
  for(const [key,ms] of [['d',3000],['a',14000],['s',25000]]){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);const p=await position(page);free[key]={...p,inside:insidePlaza(p.x,p.z)};}
  out.flow.freeRoam={...free,ok:Object.values(free).every(p=>p.zone==='plaza'&&p.inside&&p.course===0)};
  // 드래그로 시선을 돌린 뒤 W: 드래그 방향으로 걷는다.
  const dragBefore=await position(page);await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(820,450,{steps:10});await page.mouse.up();
  await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');const dragAfter=await position(page);
  const moveHeading=Math.atan2(-(dragAfter.x-dragBefore.x),-(dragAfter.z-dragBefore.z));
  out.flow.dragWalk={headingBefore:dragBefore.heading,headingAfter:dragAfter.heading,moveHeading,turnedDeg:(dragAfter.heading-dragBefore.heading)*180/Math.PI,ok:Math.abs(Math.atan2(Math.sin(moveHeading-dragAfter.heading),Math.cos(moveHeading-dragAfter.heading)))<.05&&Math.abs(dragAfter.heading-dragBefore.heading)>.2};
  save();
  // 3) 새로고침 후 복원(광장 x·z·방향)
  await page.waitForTimeout(1200);const beforeReload=await position(page);
  await page.reload();await page.evaluate(()=>window.hiking.ready());await page.evaluate(()=>hiking.start());
  const afterReload=await position(page);
  out.flow.reload={before:beforeReload,after:afterReload,ok:afterReload.zone==='plaza'&&Math.hypot(afterReload.x-beforeReload.x,afterReload.z-beforeReload.z)<1e-6&&Math.abs(afterReload.heading-beforeReload.heading)<1e-9};
  save();
  // 4) 자동 걷기(R)로 광장 → 일주문 → 코스. 매 프레임 위치·카메라 방향을 기록한다.
  if(await page.evaluate(()=>hiking.snapshot().paused))await page.keyboard.press('Space');
  await startTrace(page);await page.keyboard.press('r');
  await page.waitForFunction(g=>window.hiking?.position?.().zone==='route'&&window.hiking.position().s>g+6,GATE_S,{timeout:120000}).catch(async e=>{out.flow.gateDebug={error:e.message,keys:await page.evaluate(()=>Object.keys(window.hiking??{})),url:page.url()};throw e;});
  const through=await stopTrace(page);const afterGate=await position(page);
  await (await waitChunks(page)).screenshot({path:`${dir}/after-gate-first.png`});
  out.flow.gatePassage={...through,after:afterGate,ok:through.switches.length===1&&through.switches[0].to==='route'&&through.switches[0].step<.1&&through.switches[0].turnDeg<1&&afterGate.course>5&&afterGate.auto};
  save();
  // 5) 뒤로(S) 걸어 일주문을 지나 광장으로
  await startTrace(page);await page.keyboard.down('s');
  await page.waitForFunction(()=>hiking.position().zone==='plaza',null,{timeout:60000});await page.waitForTimeout(1500);await page.keyboard.up('s');
  const back=await stopTrace(page);const afterBack=await position(page);
  out.flow.back={...back,after:{...afterBack,inside:insidePlaza(afterBack.x,afterBack.z)},ok:back.switches.length===1&&back.switches[0].to==='plaza'&&back.switches[0].step<.1&&back.switches[0].turnDeg<1&&afterBack.course===0};
  save();await context.close();
  // 6) ?start=gate, ?start=entrance(저장 무시)
  for(const [id,url,state] of [['gate','/?start=gate',null],['entranceOverSave','/?start=entrance',{...initialState(),s:2500,paused:true}],['savedRoute','/',{...initialState(),s:2500,paused:true}]]){
   const c=await browser.newContext({viewport,deviceScaleFactor:1});
   await c.addInitScript(({key,state})=>{try{if(state&&!sessionStorage.getItem('seeded')){localStorage.setItem(key,JSON.stringify(state));sessionStorage.setItem('seeded','1');}localStorage.setItem('gwanak-sound-enabled','false');}catch{}},{key:SAVE_KEY,state});
   const p=await open(c,`${url}${url.includes('?')?'&':'?'}quality=low`,{record:false});await p.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});
   const v=await position(p);out.flow[id]={...v,ok:id==='gate'?v.zone==='route'&&Math.abs(v.s-GATE_S)<1e-3&&v.course===0:id==='entranceOverSave'?v.zone==='plaza':v.zone==='route'&&Math.abs(v.s-2500)<1e-6};await c.close();
  }
  save();
 }
 if(!only||only.includes('fps')){
  const at=m=>(route.segments.find(s=>s.b.referenceMetres>=m)??route.segments.at(-1)).start;
  const specs=[['plaza-first',{...initialState({start:'plaza'}),view:'first'},'s'],['plaza-third',{...initialState({start:'plaza'}),view:'third'},'s'],['valley',{...initialState(),s:at(1600)},'w'],['stairs',{...initialState(),s:at(4050)},'w'],['ridge',{...initialState(),s:at(4540)},'w'],['summit',{...initialState(),s:at(4930)},'w'],['third',{...initialState(),s:at(4050),view:'third'},'w']];
  for(const [id,state,key] of specs){if(process.env.FPS_ONLY&&!process.env.FPS_ONLY.split(',').includes(id))continue;
   const c=await browser.newContext({viewport,deviceScaleFactor:1});
   await c.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...state,paused:true}});
   const p=await open(c,`/?quality=${quality}`,{record:false});await p.waitForFunction(()=>window.hiking?.started&&!hiking.rendering().compiling,null,{timeout:300000});
   const loadMs=await p.evaluate(()=>hiking.loading().loadMs);
   await p.waitForTimeout(Number(process.env.WARM??8000));await p.evaluate(()=>__hikingPerformance.reset());await p.waitForTimeout(6000);const idle=await p.evaluate(()=>__hikingPerformance.report());
   if(await p.evaluate(()=>hiking.snapshot().paused))await p.keyboard.press('Space');await p.keyboard.down(key);await p.waitForTimeout(1500);await p.evaluate(()=>__hikingPerformance.reset());await p.waitForTimeout(8000);
   const walk=await p.evaluate(()=>__hikingPerformance.report());await p.keyboard.up(key);
   const row={id,loadMs,idleFps:idle.fps,walkFps:walk.fps,walkP95Ms:walk.frameMs?.p95??null,zone:(await p.evaluate(()=>hiking.position().zone))};out.fps.push(row);console.log(JSON.stringify(row));save();await c.close();
  }
 }
}finally{save();await browser.close();}
console.log(JSON.stringify({flow:Object.fromEntries(Object.entries(out.flow).map(([k,v])=>[k,v.ok??v])),console:out.console},null,1));
