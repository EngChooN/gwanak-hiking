// 휴대폰 메모리 측정(2026-11-06 아이폰 5~10초 뒤 다시 로딩 조사). 아이폰 13 세로 에뮬레이션으로 입구광장에서 출발해
// 자동 걷기로 SECONDS초 걸으며 2초마다 hiking.memory()(장면 버퍼·텍스처·렌더 타깃 어림)를 기록한다.
// WebKit: 사파리 엔진에서 동작·컨텍스트 손실 확인. Chromium: CDP로 JS 힙을 함께 잰다(WebKit은 힙 API가 없다).
// 사용: npm run preview (다른 터미널, 4173) → LABEL=before node scripts/measure-mobile-memory.mjs
// AT=2410 이면 코스 2,410m(산스장 앞)에서 출발해, 초콜릿을 먹고 역기·거꾸리 동작을 돌리며 잰다(즐길거리 HUD·모형·효과가 가장 많은 곳, 2026-11-06).
import {webkit,chromium,devices} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:4173/',label=process.env.LABEL??'run',seconds=Number(process.env.SECONDS??40),out=`artifacts/mobile-memory/${label}`;
mkdirSync(out,{recursive:true});
const engines=(process.env.ENGINES??'webkit,chromium').split(',');
const at=process.env.AT?Number(process.env.AT):null;
const save=at==null?null:await (async()=>{const {initialState}=await import('../src/movement.js');return JSON.stringify({...initialState({start:'demo'}),s:at,lateral:0,view:'third'});})();
const result={base,label,seconds,at,engines:{}};
for(const name of engines){
 const browser=name==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info']});
 const context=await browser.newContext({...devices['iPhone 13'],...(name==='webkit'?{}:{isMobile:true})});
 await context.addInitScript(save=>{if(save&&!sessionStorage.getItem('mm'))localStorage.setItem('gwanak-hiking:v1',save);sessionStorage.setItem('mm','1');localStorage.setItem('gwanak-sound-enabled','false');window.__ctxLost=0;document.addEventListener('webglcontextlost',()=>window.__ctxLost++,true);},save);
 const page=await context.newPage(),errors=[];let loads=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('load',()=>loads++);
 let bytes=0;page.on('response',async r=>{const l=Number(r.headers()['content-length']);if(Number.isFinite(l))bytes+=l;});
 const cdp=name==='chromium'?await context.newCDPSession(page):null;if(cdp)await cdp.send('Performance.enable');
 const heap=async()=>{if(!cdp)return null;const m=(await cdp.send('Performance.getMetrics')).metrics;const g=k=>m.find(x=>x.name===k)?.value??0;return Math.round(g('JSHeapUsedSize')/1048576*10)/10;};
 const t0=Date.now();
 await page.goto(base+(save?'?time=12:00&weather=clear':'?start=entrance&time=12:00&weather=clear'));
 await page.waitForFunction(()=>window.hiking?.started===true,null,{timeout:300000});
 const startMs=Date.now()-t0;
 await page.evaluate(()=>{const c=document.querySelector('#world');c.addEventListener('webglcontextlost',()=>window.__ctxLost++);if(!window.__mmAt)window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:'auto'}}));});
 // 산스장 앞: 🍫 먹고 역기(자동 연타)·거꾸리·허리돌리기·철봉을 차례로 돌린다(모형·손 소품·효과·말풍선을 모두 만든다)
 if(save)await page.evaluate(async()=>{const C=(id,value)=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}}));C('chocolate');
  const T=window.hiking.trail,gym=T.props.find(p=>p.kind==='gym');window.__mmActs=['gym-lift','gym-hang','gym-twist','gym-bar'];
  (async()=>{for(const act of window.__mmActs){C('trail-play',{act,id:gym.id});await new Promise(r=>setTimeout(r,500));while(T.status().active)await new Promise(r=>setTimeout(r,300));}C('auto');})();});
 const rows=[];
 for(let t=0;t<=seconds;t+=2){
  const m=await page.evaluate(()=>({...window.hiking.memory(),act:window.hiking.trail?.status().acts.active?.name??null,lost:window.__ctxLost,s:window.hiking.snapshot().s,cities:window.hiking.landscape().cityChunks,fps:window.hiking.metrics()?.fps,quality:window.hiking.metrics()?.quality,tris:window.hiking.metrics()?.triangles}));
  m.t=t;m.jsHeapMB=await heap()??m.jsHeapMB;rows.push(m);
  console.log(name,`t=${t}s`,`총 ${m.totalMB}MB (지오 ${m.geometryMB} · 인스턴스 ${m.instancedMB} · 텍스처 ${m.textureMB} · 타깃 ${m.renderTargetsMB})`,`힙 ${m.jsHeapMB}MB`,`도시 ${m.cities}`,`dpr ${m.dpr}`,`버퍼 ${m.drawingBuffer}`,`삼각형 ${m.tris}`,`동작 ${m.act}`,`lost ${m.lost}`);
  await page.waitForTimeout(2000);
 }
 const peak=k=>Math.max(...rows.map(r=>r[k]??0));
 result.engines[name]={startMs,loads,downloadedMB:Math.round(bytes/1048576),errors,peakTotalMB:peak('totalMB'),peakGeometryMB:peak('geometryMB'),peakHeapMB:peak('jsHeapMB'),rows};
 await page.screenshot({path:`${out}/${name}-end.png`});
 await browser.close();
}
writeFileSync(`${out}/memory.json`,JSON.stringify(result,null,1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.engines).map(([k,v])=>[k,{startMs:v.startMs,loads:v.loads,downloadedMB:v.downloadedMB,peakTotalMB:v.peakTotalMB,peakGeometryMB:v.peakGeometryMB,peakHeapMB:v.peakHeapMB,errors:v.errors.slice(0,5)}]))));
