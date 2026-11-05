// 정상 자유 이동 검증: 지점별 캡처, 절벽·시설에서 막힘, 하산 방향 코스 복귀, 저장 복원, 기구. 사용: BASE_URL=http://127.0.0.1:5190 node scripts/capture-summit-free.mjs (개발 서버 필요)
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {route} from '../src/route.js';
const base=process.env.BASE_URL??'http://127.0.0.1:5190',out=process.env.OUT??'artifacts/summit-free';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={errors:[],steps:{}};
const url=`${base}/?quality=low&time=11:00&weather=clear`;
async function open(state,{start=''}={}){
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 if(state)await context.addInitScript(({state,key})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{state,key:SAVE_KEY});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(url+start);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
 await page.addStyleTag({content:'#pause-overlay,#resume-note{display:none!important}'});await page.waitForTimeout(1200);
 return {context,page};
}
const saved=(x,z,heading,extra={})=>({...initialState({start:'summit'}),zone:'summit',summit:{x,z,heading},plaza:null,s:route.length-10,lateral:0,paused:true,...extra});
const pos=page=>page.evaluate(()=>{const s=hiking.snapshot();return {zone:s.zone,s:+s.s.toFixed(2),lateral:+s.lateral.toFixed(2),x:s.summit?+s.summit.x.toFixed(2):null,z:s.summit?+s.summit.z.toFixed(2):null,arrived:s.summitArrived,paused:s.paused,view:s.view};});
const hold=async(page,keys,ms)=>{for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(ms);for(const k of keys)await page.keyboard.up(k);};
// 1) 걸을 수 있는 칸 지도에서 지점 고르기
const first=await open(null,{start:'&start=summit'});
const spots=await first.page.evaluate(async()=>{
 const {projectToRoute,SUMMIT_ENTER_S}=await import('/src/summit.js'),deep=(x,z)=>projectToRoute(x,z).s>=SUMMIT_ENTER_S+8;
 const m=hiking.summitMap(),G=window.__walkingGround.summit,at=(i,j)=>({x:m.x0+i*m.cell,z:m.z0+j*m.cell}),walk=(x,z)=>{const i=Math.round((x-m.x0)/m.cell),j=Math.round((z-m.z0)/m.cell);return i>=0&&j>=0&&i<m.n&&j<m.n&&m.walk[j*m.n+i]===1&&m.route[j*m.n+i]===0;};
 const site=id=>m.sites.find(s=>s.id===id),hd=(fx,fz,tx,tz)=>Math.atan2(-(tx-fx),-(tz-fz)),spots={};
 const marker=site('marker'),yaw=marker.yaw,mp={x:marker.x+Math.sin(yaw)*3,z:marker.z+Math.cos(yaw)*3};
 spots.marker={...mp,heading:hd(mp.x,mp.z,marker.x,marker.z),walk:walk(mp.x,mp.z),note:'정상석 앞 3m'};
 spots.end={x:m.end.x,z:m.end.z,heading:hd(m.end.x,m.end.z,m.center.x,m.center.z),walk:walk(m.end.x,m.end.z),note:'길 끝(계단 끝)'};
 for(const id of ['eungjinjeon','radar']){const st=site(id);let best=null,bd=1e9;
  for(let j=0;j<m.n;j++)for(let i=0;i<m.n;i++)if(m.walk[j*m.n+i]&&!m.route[j*m.n+i]){const p=at(i,j),d=Math.hypot(p.x-st.x,p.z-st.z),e=Math.abs(d-(st.supportRadius+4));if(d<st.supportRadius+14&&e<bd){bd=e;best=p;}}
  spots[id]=best?{...best,heading:hd(best.x,best.z,st.x,st.z),walk:true,note:`${id} 앞(${Math.hypot(best.x-st.x,best.z-st.z).toFixed(1)}m)`}:{x:st.x,z:st.z,heading:0,walk:false,note:`${id} 둘레에 걸을 수 있는 칸 없음`};}
 // 가장자리: 걸을 수 있는 칸 중 길 끝에서 가장 먼 칸
 let far=null,fd=-1;for(let j=0;j<m.n;j++)for(let i=0;i<m.n;i++)if(m.walk[j*m.n+i]&&!m.route[j*m.n+i]){const p=at(i,j),d=Math.hypot(p.x-m.end.x,p.z-m.end.z);if(d>fd){fd=d;far={...p};}}
 spots.far={...far,heading:hd(far.x,far.z,m.center.x,m.center.z),walk:true,note:`길 끝에서 가장 먼 자유 이동 칸(${fd.toFixed(0)}m)`};
 // 절벽: 걸을 수 있는 칸에서 8방향 중 막힌(시설 아님) 방향 가운데 3m 앞 지면이 가장 낮은 곳
 let cliff=null,drop=0;for(let j=0;j<m.n;j++)for(let i=0;i<m.n;i++)if(m.walk[j*m.n+i]&&!m.route[j*m.n+i]){const a=at(i,j);if(Math.hypot(a.x-m.center.x,a.z-m.center.z)>m.radius-6)continue;
  for(let k=0;k<8;k++){const ang=k*Math.PI/4,q={x:a.x+Math.cos(ang)*1.5,z:a.z+Math.sin(ang)*1.5};if(G.canStep(a,q,{rocks:false}))continue;if(m.sites.some(s=>Math.hypot(q.x-s.x,q.z-s.z)<s.supportRadius+4))continue;
   const q3={x:a.x+Math.cos(ang)*3,z:a.z+Math.sin(ang)*3},d=G.height(a.x,a.z)-G.height(q3.x,q3.z);if(d>drop&&deep(a.x,a.z)&&walk(a.x-Math.cos(ang)*1.5,a.z-Math.sin(ang)*1.5)&&walk(a.x-Math.cos(ang)*3,a.z-Math.sin(ang)*3)){drop=d;cliff={a,ang};}}}
 // 절벽 앞 2m 뒤에서 절벽 쪽을 보고 선다
 const back={x:cliff.a.x-Math.cos(cliff.ang)*1.5,z:cliff.a.z-Math.sin(cliff.ang)*1.5};
 spots.cliff={...back,heading:hd(back.x,back.z,cliff.a.x,cliff.a.z),walk:walk(back.x,back.z),edge:cliff.a,drop,note:`급경사 앞(3m 앞 지면이 ${drop.toFixed(1)}m 낮음)`};
 const em=site('eungjinjeon'),dx=m.center.x-em.x,dz=m.center.z-em.z,n=Math.hypot(dx,dz),ep={x:em.x+dx/n*8.5,z:em.z+dz/n*8.5};
 spots.wall={...ep,heading:hd(ep.x,ep.z,em.x,em.z),walk:walk(ep.x,ep.z),site:{x:em.x,z:em.z,r:em.supportRadius},note:'응진전 석축 앞 8.5m에서 정면으로 걷기'};
 return spots;
});
writeFileSync(`${out}/spots.json`,JSON.stringify(spots,null,2));await first.context.close();
for(const [k,v] of Object.entries(spots))console.log(k,v.walk,v.note);
// 2) 지점별 캡처
for(const key of ['marker','end','eungjinjeon','radar','far']){
 if(!spots[key].walk){report.steps[key]={...spots[key],skipped:true};continue;}
 const sp=spots[key],{context,page}=await open(saved(sp.x,sp.z,sp.heading));
 const info=await pos(page);await (await waitChunks(page)).screenshot({path:`${out}/walk-${key}.png`});report.steps[key]={...sp,state:info};console.log(key,JSON.stringify(info));await context.close();
}
// 3인칭 한 장(길 끝)
{const sp=spots.end,{context,page}=await open(saved(sp.x,sp.z,sp.heading,{view:'third'}));await (await waitChunks(page)).screenshot({path:`${out}/walk-end-third.png`});await context.close();}
// 3) 급경사에서 막힘: W를 누른 채 앞뒤 두 시점의 위치 비교
for(const key of ['cliff','wall']){
 const sp=spots[key],{context,page}=await open(saved(sp.x,sp.z,sp.heading));
 await hold(page,['w','Shift'],key==='wall'?16000:9000);const a=await pos(page);
 await page.keyboard.down('w');await page.keyboard.down('Shift');await page.waitForTimeout(4000);const b=await pos(page);
 await (await waitChunks(page)).screenshot({path:`${out}/blocked-${key}.png`});await page.keyboard.up('w');await page.keyboard.up('Shift');
 const moved=Math.hypot(b.x-a.x,b.z-a.z),fromStart=Math.hypot(b.x-sp.x,b.z-sp.z);
 report.steps[`blocked-${key}`]={start:{x:sp.x,z:sp.z},afterHold:a,afterMore:b,movedLast4s:+moved.toFixed(3),walkedFromStart:+fromStart.toFixed(2),edge:sp.edge,site:sp.site,siteDistance:sp.site?+Math.hypot(b.x-sp.site.x,b.z-sp.site.z).toFixed(2):null,blockRadius:sp.site?sp.site.r+.4+.25:null,drop:sp.drop};console.log(`blocked-${key}`,JSON.stringify({a,b,moved,fromStart}));await context.close();
}
// 4) 하산: 계단 위(끝 30m 앞)에서 길 쪽으로 걸어 코스 이동으로 이어지는지, 다시 올라오면 정상 구역인지
{
 const sp=route.length-30,{sample}=await import('../src/route.js'),p=sample(sp),q=sample(sp+1),heading=Math.atan2(-(q.x-p.x),-(q.z-p.z))+Math.PI,{context,page}=await open(saved(p.x,p.z,heading,{s:sp}));
 const log=[await pos(page)];
 for(let i=0;i<8;i++){await hold(page,['w','Shift'],5000);const r=await pos(page);log.push(r);if(r.zone==='route'&&i>=2)break;}
 const down=await pos(page);await (await waitChunks(page)).screenshot({path:`${out}/descend-route.png`});
 // 같은 방향으로 2초 더 걸어 코스 이동(s 감소)이 이어지는지
 await hold(page,['w','Shift'],6000);const more=await pos(page);
 await hold(page,['s'],12000);const back=await pos(page);
 report.steps.descend={log,down,more,back};console.log('descend',JSON.stringify({log:log.map(r=>[r.zone,r.s]),more,back}));
 // 5) 저장 복원: 지금 상태를 저장한 뒤 다시 접속
 await page.waitForTimeout(1500);const before=await pos(page),raw=await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY);await context.close();
 report.steps.saved=JSON.parse(raw);
}
{
 const sp=spots.far,{context,page}=await open(saved(sp.x,sp.z,sp.heading));
 await hold(page,['w'],4000);await page.waitForTimeout(1600);const before=await pos(page),raw=await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY);await page.close();
 const again=await context.newPage();again.on('pageerror',e=>report.errors.push(e.message));await again.goto(url);
 await again.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,null,{timeout:240000});
 const after=await pos(again);report.steps.restore={before,after,saved:JSON.parse(raw).zone};console.log('restore',JSON.stringify({before,after}));await context.close();
}
// 6) 기구·앉기·시점
{
 const sp=spots.marker,{context,page}=await open(saved(sp.x,sp.z,sp.heading)),cmd=id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id}})),id);
 const snap=()=>page.evaluate(()=>{const s=hiking.snapshot();return {zone:s.zone,gadget:s.gadget,pose:s.pose,view:s.view};});const rows={};
 await cmd('binoculars');await page.waitForTimeout(700);rows.binoculars=await snap();await (await waitChunks(page)).screenshot({path:`${out}/gadget-binoculars.png`});await cmd('gadget-off');
 await cmd('phone');await page.waitForTimeout(700);rows.phone=await snap();await cmd('gadget-off');
 await cmd('sit');await page.waitForTimeout(1200);rows.sit=await snap();await cmd('sit');await page.waitForTimeout(600);
 await cmd('view');await page.waitForTimeout(600);rows.third=await snap();await hold(page,['w'],3000);rows.thirdWalk=await pos(page);
 report.steps.gadgets=rows;console.log('gadgets',JSON.stringify(rows));await context.close();
}
await browser.close();
writeFileSync(`${out}/capture.json`,JSON.stringify(report,null,2));console.log('errors',report.errors.length,report.errors.slice(0,5));
