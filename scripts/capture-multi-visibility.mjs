// '먼저 있던 사람이 안 보임' 수정(11-08)의 화면 표시 캡처: 서버 주소 없음(이 창끼리만)·서버 목록 밖 방(다른 방) 상태 칩, 등산·흡연장, 휴대폰 세로·가로·PC.
//   node scripts/capture-multi-visibility.mjs → artifacts/multi-visibility-2026-11-08/shot-*.png (vite 5202·서버 8792를 직접 띄움)
import {chromium} from '@playwright/test';
import {startServer} from '../server/multi-server.mjs';
const dir='artifacts/multi-visibility-2026-11-08';
const {createServer}=await import('vite');const vite=await createServer({server:{port:5202,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const srv=startServer({PORT:'8792',HOST:'127.0.0.1',DATA_DIR:`${dir}/data-shot`},{quiet:true});await srv.ready;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const sizes={'phone':{width:390,height:844},'land':{width:844,height:390},'pc':{width:1920,height:1080}};
const shots=[['hiking','local','multi=관악산-1&server=off&name=하늘'],['hiking','odd','multi=친구방&server=ws://127.0.0.1:8792&name=하늘'],['smoking','local','multi=옥상-1&server=off&name=하늘'],['smoking','odd','multi=친구방&server=ws://127.0.0.1:8792&name=하늘']];
for(const [exp,kind,q] of shots)for(const [sz,vp] of Object.entries(sizes)){
 if(exp==='smoking'&&sz==='land'&&kind==='odd')continue;
 if(process.env.ONLY&&!`${exp}-${kind}-${sz}`.includes(process.env.ONLY))continue;
 const m=vp.width<900||vp.height<500;
 const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:m?2:1,isMobile:m,hasTouch:m});
 await ctx.addInitScript(()=>{localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('online-smoking',JSON.stringify({nickname:'하늘',status:'quit',outfit:'shirt',seenIntro:true,muted:true}));});
 const p=await ctx.newPage();
 if(exp==='hiking'){await p.goto(`http://127.0.0.1:5202/hiking/?${q}&start=entrance&time=13:00&weather=clear&quality=low`);await p.waitForFunction(()=>window.hiking?.started&&window.hiking.multi?.()?.status==='online'&&document.querySelector('.me-chip:not([hidden])'),null,{timeout:240000});}
 else{await p.goto(`http://127.0.0.1:5202/smoking/?${q}&time=day`);await p.waitForFunction(()=>window.lounge?.multi?.state==='online',null,{timeout:180000});
  await p.evaluate(()=>document.querySelector('.lg-mp-btn')?.click());}
 await p.waitForTimeout(2500);await p.screenshot({path:`${dir}/shot-${exp}-${kind}-${sz}.png`});console.log('찍음',exp,kind,sz);await ctx.close();
}
await browser.close();await srv.close();await vite.close();process.exit(0);
