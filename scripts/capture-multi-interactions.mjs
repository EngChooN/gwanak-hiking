// 흡연장 같이 피우기: A가 상호작용하는 모습이 B 화면에 보이는 장면을 나란히 찍는다(2026-11-10).
// PC 1920×1080: A 난간에 기대 캔커피·담배, 휴대폰 세로 390×844: A 벤치에 걸터앉아 캔커피 한 모금. B 카메라는 A를 본다.
//   node scripts/capture-multi-interactions.mjs → artifacts/multi-interactions-2026-11-10/smoking-pc.png, smoking-mobile.png
// 서버(8796)·vite(5207)를 직접 띄운다. 등산 캡처는 scripts/capture-multi-act-hiking.mjs.
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-interactions-2026-11-10';mkdirSync(dir,{recursive:true});
const multiPort=8796,port=5207;
const {createServer}=await import('vite');
const vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const pageUrl=`http://127.0.0.1:${port}`,wsUrl=`ws://127.0.0.1:${multiPort}`;
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data-capture`},{quiet:true});await srv.ready;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function open(name,{w,h,touch}){
 const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,hasTouch:touch,isMobile:touch});
 await ctx.addInitScript(nick=>{localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('online-smoking',JSON.stringify({nickname:nick,seenIntro:true,muted:true,quitDate:'2026-11-01'}));},name);
 const p=await ctx.newPage();p.ctx=ctx;
 await p.goto(`${pageUrl}/smoking/?multi=${encodeURIComponent('옥상-1')}&server=${encodeURIComponent(wsUrl)}&name=${encodeURIComponent(name)}&time=day&capture=1`);
 await p.waitForFunction(()=>!!window.lounge&&window.lounge.multi.state==='online',null,{timeout:180000,polling:300});
 return p;
}
// B를 A 앞쪽 비스듬히 세우고 카메라가 A를 보게
async function look(A,B,{d=2.2,side=.9,dist=2.6,pitch=.22,turn=.5}={}){
 const a=await A.evaluate(()=>({x:window.lounge.player.x,z:window.lounge.player.z,h:window.lounge.player.heading}));
 await B.evaluate(([a,d,side,dist,pitch,turn])=>{const L=window.lounge,b=L.rooftop.bounds;
  // A가 난간을 보면(앞이 막힘) 뒤쪽에서, 아니면 앞쪽에서 본다
  let fx=-Math.sin(a.h),fz=-Math.cos(a.h);const ahead={x:a.x+fx*d,z:a.z+fz*d};
  if(ahead.x<b.minX+.4||ahead.x>b.maxX-.4||ahead.z<b.minZ+.4||ahead.z>b.maxZ-.4){fx=-fx;fz=-fz;}
  // 카메라는 B 뒤에서 A 쪽을 보되 옆으로 틀어 B 몸이 A를 가리지 않게
  const x=a.x+fx*d-fz*side,z=a.z+fz*d+fx*side,yaw=Math.atan2(x-a.x,z-a.z);
  L.teleport(x,z,yaw+Math.PI);L.setCam({yaw:yaw+turn,pitch,dist});},[a,d,side,dist,pitch,turn]);
}
async function aSelfView(A,{dist=2.4,pitch=.25,yawOff=2.5}={}){await A.evaluate(([dist,pitch,o])=>{const L=window.lounge;L.setCam({yaw:L.player.heading+o,pitch,dist});},[dist,pitch,yawOff]);}
async function sideBySide(a,b,file,{w,h,title}){
 const [ia,ib]=await Promise.all([a.screenshot(),b.screenshot()]);
 const page=await browser.newPage({viewport:{width:w*2+30,height:h+56},deviceScaleFactor:1});
 const src=buf=>`data:image/png;base64,${buf.toString('base64')}`;
 await page.setContent(`<body style="margin:0;background:#2a2622;font:700 18px sans-serif;color:#fff"><div style="display:flex;gap:10px;padding:10px">
  <figure style="margin:0"><figcaption style="height:28px">A 화면 (${title})</figcaption><img src="${src(ia)}" width="${w}" height="${h}"></figure>
  <figure style="margin:0"><figcaption style="height:28px">B 화면 — A가 보임</figcaption><img src="${src(ib)}" width="${w}" height="${h}"></figure></div></body>`);
 await page.screenshot({path:`${dir}/${file}`,fullPage:true});await page.close();
}
const wait=(p,expr)=>p.waitForFunction(expr,null,{timeout:30000,polling:200});

// ── PC: 난간에 기대 캔커피 + 담배
{
 const A=await open('대표',{w:1920,h:1080}),B=await open('손님B',{w:1920,h:1080});await sleep(2500);
 await A.evaluate(()=>window.lounge.spots.coffee());await wait(A,'window.lounge.spots.status().can.held');
 await A.evaluate(()=>{const L=window.lounge;L.teleport(-1.6,L.rooftop.bounds.minZ+.9,0);L.spots.go('rail');});await wait(A,"window.lounge.spots.pose==='lean'");
 await A.evaluate(()=>{window.lounge.smoker.start();});await sleep(1500);await A.evaluate(()=>window.lounge.smoker.light());await wait(A,'window.lounge.smoker.status().lit');
 await look(A,B,{d:2.6,side:1.2,dist:2.2,pitch:.3,turn:.55});await aSelfView(A,{yawOff:.9,dist:2.6,pitch:.3});await sleep(3500);
 const seen=await B.evaluate(id=>window.lounge.multi.status().people.find(p=>p.id===id),await A.evaluate(()=>window.lounge.multi.id));
 console.log('PC B가 본 A',JSON.stringify(seen));
 await sideBySide(A,B,'smoking-pc.png',{w:960,h:540,title:'난간에 기대 캔커피·담배'});
 await A.ctx.close();await B.ctx.close();
}
// ── 휴대폰 세로: 벤치에 걸터앉아 캔커피 한 모금
{
 const A=await open('대표',{w:390,h:844,touch:true}),B=await open('손님B',{w:390,h:844,touch:true});await sleep(2500);
 await A.evaluate(()=>window.lounge.spots.coffee());await wait(A,'window.lounge.spots.status().can.held');
 await A.evaluate(()=>window.lounge.spots.go('bench',0));await wait(A,"window.lounge.spots.pose==='sit'");await sleep(1500);
 await look(A,B,{d:3,side:.35,dist:1.8,pitch:.4,turn:.2});await aSelfView(A,{yawOff:2.6,dist:3});await sleep(3000);
 await A.evaluate(()=>window.lounge.spots.sip());await sleep(700);
 const seen=await B.evaluate(id=>window.lounge.multi.status().people.find(p=>p.id===id),await A.evaluate(()=>window.lounge.multi.id));
 console.log('휴대폰 B가 본 A',JSON.stringify(seen));
 await sideBySide(A,B,'smoking-mobile.png',{w:390,h:844,title:'벤치에 앉아 캔커피 한 모금'});
 await A.ctx.close();await B.ctx.close();
}
await browser.close();await srv.close();await vite.close();process.exit(0);
