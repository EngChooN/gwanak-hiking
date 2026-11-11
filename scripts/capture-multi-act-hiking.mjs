// 등산 함께 걷기: A가 상호작용하는 모습이 B 화면에 보이는지 A·B 화면을 나란히 캡처(2026-11-10).
//  PC 1920×1080: A가 광장 먼지털이기(에어건)를 하는 중 → hiking-pc.png
//  휴대폰 세로 390×844: A가 B 앞에 앉아 차를 마시는 중 → hiking-mobile.png
// 서버(MULTI_PORT 기본 8795)·vite(PORT 기본 5205)를 직접 띄운다.  node scripts/capture-multi-act-hiking.mjs [pc|mobile]
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startServer} from '../server/multi-server.mjs';

const dir='artifacts/multi-interactions-2026-11-10';mkdirSync(dir,{recursive:true});
const only=process.argv.slice(2);
const multiPort=Number(process.env.MULTI_PORT??8795),port=Number(process.env.PORT??5205);
const {createServer}=await import('vite');
const vite=await createServer({server:{port,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const pageUrl=`http://127.0.0.1:${port}`,wsUrl=`ws://127.0.0.1:${multiPort}`;
const srv=startServer({PORT:String(multiPort),HOST:'127.0.0.1',DATA_DIR:`${dir}/data-capture`},{quiet:true});await srv.ready;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const info={};
async function open(name,room,{viewport,mobile}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:mobile,isMobile:mobile});
 await ctx.addInitScript(()=>localStorage.setItem('gwanak-sound-enabled','false'));
 const p=await ctx.newPage();p.ctx=ctx;
 await p.goto(`${pageUrl}/hiking/?multi=${encodeURIComponent(room)}&server=${encodeURIComponent(wsUrl)}&name=${encodeURIComponent(name)}&start=entrance&time=13:00&weather=clear&quality=balanced`);
 await p.waitForFunction(()=>window.hiking?.started,null,{timeout:240000});
 await p.waitForFunction(()=>window.hiking.multi?.()?.status==='online',null,{timeout:60000,polling:200});
 return p;
}
const cmd=(p,id,value)=>p.evaluate(([id,value])=>window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id,value}})),[id,value]);
const other=p=>p.evaluate(()=>window.hiking.multi().roster[0]);
// p를 (tx,tz)를 바라보며 거리 d만큼 떨어진 곳(방향 from 기준)에 세운다
async function stand(p,{x,z,heading}){await p.evaluate(pos=>window.hiking.multiApi.teleport({zone:'plaza',...pos}),{x,z,heading});}
// B를 A 앞 d m·옆 side m에 A를 보게 세운다(A의 몸 방향은 B 화면에서 받은 heading)
async function front(A,B,d,side){
 const a=await other(B),fx=-Math.sin(a.heading),fz=-Math.cos(a.heading),bx=a.x+fx*d-fz*side,bz=a.z+fz*d+fx*side;
 // B가 A 바로 옆(0.9m)을 보게 해서 B 몸이 카메라와 A 사이를 가리지 않게
 const tx=a.x-fz*.9*Math.sign(side||1),tz=a.z+fx*.9*Math.sign(side||1);
 await stand(B,{x:bx,z:bz,heading:Math.atan2(-(tx-bx),-(tz-bz))});
}
async function sideBySide(a,b,file,{w,h,title}){
 const [ia,ib]=await Promise.all([a.screenshot(),b.screenshot()]);
 const page=await browser.newPage({viewport:{width:w*2+30,height:h+56},deviceScaleFactor:1});
 const src=buf=>`data:image/png;base64,${buf.toString('base64')}`;
 await page.setContent(`<body style="margin:0;background:#2a2622;font:700 18px sans-serif;color:#fff"><div style="display:flex;gap:10px;padding:10px">
  <figure style="margin:0"><figcaption style="height:28px">A 화면 (${title})</figcaption><img src="${src(ia)}" width="${w}" height="${h}"></figure>
  <figure style="margin:0"><figcaption style="height:28px">B 화면 — A가 보임</figcaption><img src="${src(ib)}" width="${w}" height="${h}"></figure></div></body>`);
 await page.screenshot({path:`${dir}/${file}`,fullPage:true});await page.close();
}
async function pc(){
 const vp={viewport:{width:1920,height:1080},mobile:false};
 const A=await open('하늘','캡처PC',vp),B=await open('바다','캡처PC',vp);await sleep(2500);
 const air=await A.evaluate(()=>window.hiking.trail.status().sites.find(s=>s.kind==='airgun'));
 await cmd(A,'view');await cmd(B,'view');
 // A가 에어건 자리에 선 뒤, B를 A 앞 3.4m·옆 1.1m에 A 쪽을 보게 세운다(B 몸이 A를 가리지 않게)
 await cmd(A,'trail-play',{act:'airgun',id:air.id,manual:true});
 await A.waitForFunction(()=>window.hiking.trail.status().acts.active?.name==='airgun',null,{timeout:30000});
 await sleep(300);await front(A,B,2.8,.6);
 await sleep(1100);
 info.pc={A:await A.evaluate(()=>window.hiking.trail.status().acts.active),BseesA:await other(B)};
 await sideBySide(A,B,'hiking-pc.png',{w:960,h:540,title:'먼지털이기 에어건'});
 await A.ctx.close();await B.ctx.close();
}
async function mobile(){
 const vp={viewport:{width:390,height:844},mobile:true};
 const A=await open('하늘','캡처폰',vp),B=await open('바다','캡처폰',vp);await sleep(2500);
 await cmd(A,'view');await cmd(B,'view');
 const b=await other(A); // A 화면의 B 자리·방향 → A를 B 앞 3.2m·옆 1.0m에 B 쪽을 보게
 const d=2.6,side=-.9,fx=-Math.sin(b.heading),fz=-Math.cos(b.heading),ax=b.x+fx*d-fz*side,az=b.z+fz*d+fx*side;
 await stand(A,{x:ax,z:az,heading:Math.atan2(-(b.x-ax),-(b.z-az))});await sleep(1500);
 await cmd(A,'sit');await sleep(3500);await cmd(A,'tea');await sleep(1300);
 info.mobile={BseesA:await other(B)};
 await sideBySide(A,B,'hiking-mobile.png',{w:390,h:844,title:'앉아서 차 마시기'});
 await A.ctx.close();await B.ctx.close();
}
try{if(!only.length||only.includes('pc'))await pc();if(!only.length||only.includes('mobile'))await mobile();}
catch(e){console.log('오류',e.stack);info.error=String(e);}
writeFileSync(`${dir}/hiking-capture.json`,JSON.stringify(info,null,1));console.log(JSON.stringify(info).slice(0,800));
await browser.close();await srv.close();await vite.close();process.exit(0);
