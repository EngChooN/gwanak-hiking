// 다인원 성능 측정(가짜 등산객). dev 서버 필요: PORT=5197 node scripts/measure-multi.mjs [시나리오 id ...]
// 가짜 등산객은 실제 멀티 경로(JSON 인코딩 → 지연 60ms·지터 20ms 가짜 방 → 디코딩 → 보간 → 모델/캡슐/이름표)를 그대로 탄다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
const port=process.env.PORT??5197,dir='artifacts/multi';mkdirSync(dir,{recursive:true});
const SCENES=[
 {id:'base',label:'멀티 끔(기준)',query:'',zone:'plaza'},
 {id:'plaza-1',label:'광장, 1명(나만)',query:'&multi=m&sim=1',zone:'plaza'},
 {id:'plaza-5',label:'광장, 5명 몰림',query:'&multi=m&sim=5',zone:'plaza'},
 {id:'plaza-10',label:'광장, 10명 몰림',query:'&multi=m&sim=10',zone:'plaza'},
 {id:'plaza-20',label:'광장, 20명 몰림(모델 4명)',query:'&multi=m&sim=20',zone:'plaza',shot:true},
 {id:'plaza-20-cap8',label:'광장, 20명(모델 8명)',query:'&multi=m&sim=20&fullcap=8',zone:'plaza'},
 {id:'plaza-20-cap20',label:'광장, 20명(모델 전원 20명)',query:'&multi=m&sim=20&fullcap=20',zone:'plaza',shot:true},
 {id:'plaza-20-loss',label:'광장, 20명 + 유실 10%·지연 150ms',query:'&multi=m&sim=20&loss=.1&latency=150',zone:'plaza'},
 {id:'plaza-60',label:'광장, 60명(방 상한)',query:'&multi=m&sim=60',zone:'plaza'},
 {id:'route-20',label:'산길, 20명 흩어짐',query:'&multi=m&sim=20&simzone=route',zone:'route',jump:'제3깔딱고개'},
 {id:'route-base',label:'산길, 멀티 끔(기준)',query:'',zone:'route',jump:'제3깔딱고개'},
];
const want=process.argv.slice(2),list=want.length?SCENES.filter(s=>want.includes(s.id)):SCENES;
const file=`${dir}/multi-perf.json`,out=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{for(const sc of list){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${port}/hiking/?start=entrance&time=13:00&weather=clear&quality=balanced&outfit=2${sc.query}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&window.hiking?.landscape().natureReady,null,{timeout:180000}).catch(()=>console.log('로딩 실패',sc.id));
 if(sc.jump){await page.evaluate(id=>hiking.jumpTo(id),sc.jump);await page.waitForTimeout(1500);}
 await page.keyboard.press('Space').catch(()=>{});await page.waitForTimeout(500);
 await page.keyboard.down('w');await page.waitForTimeout(sc.zone==='plaza'?3000:6000); // 걷는 상태에서 측정(사람이 계속 시야를 지나감)
 await page.evaluate(()=>window.hiking.metrics()); // 창 시작
 const rows=[];for(let i=0;i<3;i++){await page.waitForTimeout(4500);rows.push(await page.evaluate(()=>{const m=hiking.metrics(),p=m.performance??{};return {fps:m.fps,drawCalls:m.drawCalls,triangles:m.triangles,p95:p.p95Ms,p99:p.p99Ms,max:p.maxMs,over50:p.over50ms,cpu:p.cpuMs,avgMs:p.fps?1000/p.fps:null};}));}
 const multi=await page.evaluate(()=>window.hiking.multi?.()??null);
 const heap=await page.evaluate(()=>performance.memory?.usedJSHeapSize??null);
 const night=await page.evaluate(()=>hiking.night().realLights);
 if(sc.shot)await (await waitChunks(page)).screenshot({path:`${dir}/perf-${sc.id}.png`});
 const avg=k=>rows.reduce((a,r)=>a+(r[k]??0),0)/rows.length;
 const cpu=Object.fromEntries(['hiker','contact','render','multi','camera','terrain'].map(k=>[k,+(rows.reduce((a,r)=>a+(r.cpu?.[k]??0),0)/rows.length).toFixed(2)]));
 out[sc.id]={label:sc.label,fps:+avg('fps').toFixed(1),avgFrameMs:+avg('avgMs').toFixed(2),p95:+avg('p95').toFixed(1),p99:+avg('p99').toFixed(1),max:+Math.max(...rows.map(r=>r.max??0)).toFixed(1),over50:rows.reduce((a,r)=>a+(r.over50??0),0),drawCalls:Math.round(avg('drawCalls')),triangles:Math.round(avg('triangles')),cpu,realLights:night,heapMB:heap?Math.round(heap/1048576):null,
  multi:multi&&{roster:multi.roster.length,avatars:multi.stats.avatarsDrawn,capsules:multi.stats.capsules,hidden:multi.stats.hidden,hub:multi.hub,sent:multi.stats.sent,received:multi.stats.received},errors};
 console.log(sc.id,JSON.stringify({fps:out[sc.id].fps,ms:out[sc.id].avgFrameMs,p95:out[sc.id].p95,dc:out[sc.id].drawCalls,tri:out[sc.id].triangles,cpu,av:multi?.stats.avatarsDrawn,cap:multi?.stats.capsules,roster:multi?.roster.length,err:errors.length}));
 await ctx.close();
}}finally{writeFileSync(file,JSON.stringify(out,null,2));await browser.close();}
