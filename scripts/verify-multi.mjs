// 함께 걷기 시제품 확인: 같은 브라우저의 창 2개(BroadcastChannel). dev 서버 필요: PORT=5197 node scripts/verify-multi.mjs
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';
const port=process.env.PORT??5197,dir='artifacts/multi';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ctx=await browser.newContext({viewport:{width:1100,height:680},deviceScaleFactor:1,recordVideo:process.env.VIDEO?{dir:`${dir}/video`,size:{width:1100,height:680}}:undefined});
await ctx.addInitScript(()=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');});
const errors=[];const open=async(name)=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push(name+': '+m.text());});
 await p.goto(`http://127.0.0.1:${port}/?multi=verify&name=${encodeURIComponent(name)}&start=entrance&time=13:00&weather=clear&quality=balanced&outfit=${name==='하늘'?2:4}`);
 await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.multi,null,{timeout:180000});return p;};
const A=await open('하늘'),B=await open('바다');
const out={steps:[]},log=(k,v)=>{out.steps.push({k,...v});console.log(k,JSON.stringify(v).slice(0,400));};
const pos=p=>p.evaluate(()=>hiking.position());
await A.bringToFront();await A.waitForTimeout(1500);
// 배치: 바다는 그 자리, 하늘은 바다 앞 4m에서 바다를 마주 봄
const pb=await pos(B),fx=-Math.sin(pb.heading),fz=-Math.cos(pb.heading);
await A.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb.x+fx*4,z:pb.z+fz*4,h:pb.heading+Math.PI});
await B.evaluate(()=>hiking.snapshot());await A.waitForTimeout(2500);
const ia=await A.evaluate(()=>hiking.multi()),ib=await B.evaluate(()=>hiking.multi());
log('보임',{A_본_사람:ia.roster.map(r=>({name:r.name,model:r.model,x:r.x?.toFixed(1),z:r.z?.toFixed(1)})),B_본_사람:ib.roster.map(r=>({name:r.name,model:r.model,x:r.x?.toFixed(1),z:r.z?.toFixed(1)})),A실제:await pos(A),B실제:await pos(B)});
await B.screenshot({path:`${dir}/01-B화면-A보임-이름표.png`});await A.screenshot({path:`${dir}/01-A화면-B보임.png`});
// 걷기 동작 맞춤: 하늘이 걷는 동안 바다 화면에서 하늘의 걸음
await A.keyboard.down('w');const walk=[];
for(let i=0;i<6;i++){await B.waitForTimeout(500);const [a,b]=await Promise.all([pos(A),B.evaluate(()=>hiking.multi().roster[0])]);walk.push({실제:[a.x.toFixed(2),a.z.toFixed(2)],B에보임:[b.x.toFixed(2),b.z.toFixed(2)],오차m:Math.hypot(a.x-b.x,a.z-b.z).toFixed(2),moving:b.moving,speed:b.speed?.toFixed(2)});
 if(i===3)await B.screenshot({path:`${dir}/02-걷는-하늘-B화면.png`});}
await A.keyboard.up('w');await A.waitForTimeout(800);
log('걷기',{샘플:walk,멈춤후:(await B.evaluate(()=>hiking.multi().roster[0])).moving});
// 하늘을 다시 바다 앞에서 마주 보게
const pb2=await pos(B);await A.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb2.x-Math.sin(pb2.heading)*3.5,z:pb2.z-Math.cos(pb2.heading)*3.5,h:pb2.heading+Math.PI});await A.waitForTimeout(1500);
// 인사
await A.keyboard.press('x');await B.waitForTimeout(900);
log('인사',{B가본:(await B.evaluate(()=>hiking.multi().roster[0])).gesture});await B.screenshot({path:`${dir}/03-인사-B화면.png`});
await B.waitForTimeout(3300);
// 손 흔들기
await A.keyboard.press('g');await B.waitForTimeout(1300);
log('손흔들기',{B가본:(await B.evaluate(()=>hiking.multi().roster[0])).gesture});await B.screenshot({path:`${dir}/04-손흔들기-B화면.png`});
await B.waitForTimeout(2600);
// 같이 셀카
await A.keyboard.press('k');await B.waitForTimeout(700);
log('셀카요청',{B받음:(await B.evaluate(()=>hiking.multi().social.incoming)),A보냄:(await A.evaluate(()=>hiking.multi().social.outgoing))});
await B.screenshot({path:`${dir}/05-셀카요청-B화면.png`});
await B.keyboard.press('k');await B.waitForTimeout(1500);
const sa=await A.evaluate(()=>hiking.multi().social.session),sb=await B.evaluate(()=>hiking.multi().social.session);
log('셀카시작',{A:sa&&sa.role,B:sb&&sb.role,A위치:await pos(A),B위치:await pos(B)});
await A.screenshot({path:`${dir}/06-같이셀카-A화면.png`});await B.screenshot({path:`${dir}/06-같이셀카-B화면.png`});
await A.waitForTimeout(2600);
log('셀카끝',{A세션:await A.evaluate(()=>hiking.multi().social.session),B세션:await B.evaluate(()=>hiking.multi().social.session),A사진:await A.evaluate(()=>hiking.lastPhoto),A소셜로그:(await A.evaluate(()=>hiking.multi().social.log)).map(l=>l.type)});
// 차단
await B.evaluate(()=>hiking.multiApi.moderation.block(hiking.multiApi.info?.().roster?.[0]?.id??''));
const idA=await B.evaluate(()=>hiking.multi().roster[0].id);await B.evaluate(id=>hiking.multiApi.moderation.block(id,'하늘'),idA);await B.waitForTimeout(600);
log('차단',{B에보이는수:(await B.evaluate(()=>hiking.multi().roster.filter(r=>r.x!==undefined).length))});
log('오류',{errors});
writeFileSync(`${dir}/multi-verify.json`,JSON.stringify(out,null,2));
await ctx.close();await browser.close();
