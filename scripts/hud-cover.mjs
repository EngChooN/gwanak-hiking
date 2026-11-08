// HUD가 화면을 얼마나 덮는지 잰다: node scripts/hud-cover.mjs <이름> <w> <h> [query] [js] [기다릴ms]
// 개발 서버(npm run dev, 5173)를 먼저 띄운다. 흡연장 /smoking/ 기준. 결과: artifacts/smoking/<이름>.png + 덮는 넓이(%)·가운데 침범·44px 미만 단추·겹치는 단추 목록.
// 잴 것: 보이는 단추·카드·채팅 칸(말풍선·알림·로비 창은 잠깐 뜨는 것이라 뺀다). 4px 칸으로 합집합 넓이를 센다.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';mkdirSync('artifacts/smoking',{recursive:true});
const [name='cover',w='390',h='844',query='time=day',js='',wait='2500']=process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const mobile=+w<900;
const page=await browser.newPage({viewport:{width:+w,height:+h},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
const logs=[];page.on('pageerror',e=>logs.push('pageerror: '+e.message));
await page.goto(`${process.env.BASE_URL??'http://127.0.0.1:5173'}/smoking/?capture=1&${query}`);
await page.waitForFunction(()=>window.lounge,null,{timeout:60000}).catch(e=>logs.push('timeout '+e.message));
if(js)await page.evaluate(js).catch(e=>logs.push('eval: '+e.message));
await page.waitForTimeout(+wait);
await page.screenshot({path:`artifacts/smoking/${name}.png`});
const r=await page.evaluate(()=>{
 const W=innerWidth,H=innerHeight,C=4,cols=Math.ceil(W/C),rows=Math.ceil(H/C),grid=new Uint8Array(cols*rows);
 const skip=el=>el.closest('.lg-bubbles,.lg-toast,.lg-modal,.sp-panel');
 const els=[...document.querySelectorAll('#app .lg-btn,#app .sp-mark,#app .lg-card,#app .lg-log,#app .lg-form input')].filter(el=>!skip(el));
 const rects=els.map(el=>({el,r:el.getBoundingClientRect()})).filter(o=>o.r.width>0&&o.r.height>0&&getComputedStyle(o.el).visibility!=='hidden');
 for(const {r} of rects){for(let y=Math.max(0,Math.floor(r.top/C));y<Math.min(rows,Math.ceil(r.bottom/C));y++)for(let x=Math.max(0,Math.floor(r.left/C));x<Math.min(cols,Math.ceil(r.right/C));x++)grid[y*cols+x]=1;}
 const cover=grid.reduce((a,b)=>a+b,0)/grid.length;
 const mid={l:W*.25,r:W*.75,t:H*.3,b:H*.7};
 const label=el=>(el.getAttribute('aria-label')||el.textContent||el.className).trim().slice(0,16);
 const inMid=rects.filter(({r})=>r.right>mid.l&&r.left<mid.r&&r.bottom>mid.t&&r.top<mid.b).map(o=>label(o.el));
 const btns=rects.filter(o=>o.el.matches('.lg-btn,.sp-mark')); // 대상 위 표시(.sp-mark)도 👥·상황 단추와 겹치는지 본다
 const small=btns.filter(o=>!o.el.matches('.sp-mark.far')).filter(({r})=>r.width<43.5||r.height<43.5).map(o=>`${label(o.el)} ${Math.round(o.r.width)}×${Math.round(o.r.height)}`);
 const over=[];for(let i=0;i<btns.length;i++)for(let j=i+1;j<btns.length;j++){const a=btns[i].r,b=btns[j].r;if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)over.push(label(btns[i].el)+' ↔ '+label(btns[j].el));}
 return {size:`${W}×${H}`,cover:+(cover*100).toFixed(1),inMid,small,over,buttons:btns.length};
}).catch(e=>({error:e.message}));
console.log(JSON.stringify(r));if(logs.length)console.log(logs.slice(0,10).join('\n'));
await browser.close();
