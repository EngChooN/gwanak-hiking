// 첫 로딩 단계별 측정(피드백 8건 §2). 빌드본 preview를 새 브라우저 문맥(캐시 없음)으로 열어
// 네트워크 다운로드 크기와 main.js의 load:* 마크(src/load-timing.js), GLB 파싱 합계를 기록한다.
// 사용: npm run build && npx vite preview --host 127.0.0.1 --port 4173 을 띄운 뒤
//   BASE_URL=http://127.0.0.1:4173 RUNS=3 node scripts/measure-first-load.mjs <출력 폴더> <이름>
// NET=50 이면 50Mbps·지연 40ms로 네트워크를 제한한 측정을 한 번 더 한다(0이면 생략). 실행마다 새 브라우저(캐시 없음).
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';

const out=process.argv[2]??'artifacts/first-load',label=process.argv[3]??'run',base=process.env.BASE_URL||'http://127.0.0.1:4173';
const runs=Number(process.env.RUNS??3),netMbps=Number(process.env.NET??50);
const url=`${base}/?style=toon&outfit=1&start=entrance&time=12:00&weather=clear`;
mkdirSync(out,{recursive:true});
const kind=p=>/\.glb$/.test(p)?'glb':/\.(js|css)$/.test(p)?'code':/\.(f32|json)$/.test(p)?'data':/\.(ogg|flac|mp3|wav)$/.test(p)?'audio':/\.(png|jpe?g|webp|ktx2|hdr)$/.test(p)?'image':'other';

async function measure(browser,throttle){
 const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page),reqs=new Map(),errors=[];
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 if(throttle)await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:throttle*1e6/8,uploadThroughput:10e6/8});
 cdp.on('Network.responseReceived',e=>{reqs.set(e.requestId,{url:e.response.url,encoding:e.response.headers['content-encoding']??e.response.headers['Content-Encoding']??'',bytes:0,decoded:0});});
 cdp.on('Network.dataReceived',e=>{const r=reqs.get(e.requestId);if(r)r.decoded+=e.dataLength;});
 cdp.on('Network.loadingFinished',e=>{const r=reqs.get(e.requestId);if(r){r.bytes=e.encodedDataLength;r.finishedAt=e.timestamp;}});
 page.on('pageerror',e=>errors.push(e.message));
 const t0=Date.now();await page.goto(url);
 await page.waitForFunction(()=>window.hiking?.started===true||window.hiking?.loading?.().phase==='error',null,{timeout:600000});
 const wall=(Date.now()-t0)/1000;
 const info=await page.evaluate(()=>({timing:window.hiking.loadTiming?.()??null,loading:window.hiking.loading(),phase:window.hiking.loading().phase}));
 // ready 이후 뒤에서 이어 받는 요청까지 마저 세려고 잠시 기다린다.
 await page.waitForTimeout(8000);
 const readyAt=info.timing?.marks?.ready??null;
 const nav=await page.evaluate(()=>performance.timeOrigin);
 const list=[...reqs.values()].filter(r=>r.url.startsWith(base)).map(r=>({...r,path:decodeURIComponent(new URL(r.url).pathname),kind:kind(new URL(r.url).pathname)}));
 const byKind={};for(const r of list){const k=byKind[r.kind]??={count:0,bytes:0,decoded:0};k.count++;k.bytes+=r.bytes;k.decoded+=r.decoded;}
 // 준비 전/후 구분: CDP timestamp(초, 단조 시계)는 페이지 시계와 기준이 달라 요청 끝난 순서로만 본다 → 대신 페이지 Resource Timing으로 나눈다.
 const resource=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>({name:decodeURIComponent(new URL(e.name).pathname),end:e.responseEnd,size:e.encodedBodySize})));
 const beforeReady=readyAt===null?null:resource.filter(e=>e.end<=readyAt).reduce((a,e)=>({count:a.count+1,bytes:a.bytes+e.size}),{count:0,bytes:0});
 const total=list.reduce((a,r)=>({count:a.count+1,bytes:a.bytes+r.bytes,decoded:a.decoded+r.decoded}),{count:0,bytes:0,decoded:0});
 const top=[...list].sort((a,b)=>b.bytes-a.bytes).slice(0,15).map(r=>({path:r.path,bytes:r.bytes,encoding:r.encoding}));
 await ctx.close();
 return {throttleMbps:throttle||null,wallSeconds:wall,phase:info.phase,marks:info.timing?.marks,glb:info.timing?.glb,total,beforeReady,byKind,top,errors,navOrigin:nav};
}
// 실행마다 브라우저를 새로 띄운다(새 임시 프로필 → HTTP·GPU 셰이더 캐시가 빈 첫 방문 상태).
const launch=()=>chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const results=[];
for(let i=0;i<runs+(netMbps?1:0);i++){
 const throttle=i<runs?0:netMbps,browser=await launch();
 try{const r=await measure(browser,throttle);results.push(r);console.log(label,throttle?`${throttle}Mbps`:'local',i,r.wallSeconds,r.marks?.ready,r.total);}
 finally{await browser.close();}
}
writeFileSync(`${out}/${label}.json`,JSON.stringify({url,results},null,1));
