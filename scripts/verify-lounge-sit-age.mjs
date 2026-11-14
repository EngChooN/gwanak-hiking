// 흡연장 11-13 점검: 입장 안내(태어난 해)·벤치 앉기 자세·일어나기 단추 자리·NPC 앉기.
// node scripts/verify-lounge-sit-age.mjs [기본주소 http://127.0.0.1:5180] → artifacts/smoking/sit-age-2026-11-13/*.png + result.json
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const BASE=process.argv[2]??process.env.BASE_URL??'http://127.0.0.1:5180';
const OUT=process.env.OUT_DIR??'artifacts/smoking/sit-age-2026-11-13';mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
const R={};const errors=[];
const PROFILE=JSON.stringify({nickname:'테스트',seenIntro:true});
async function open(w,h,{query='',init=null}={}){
 const mobile=w<900,ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 if(init)await ctx.addInitScript(init);
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(`${w}x${h} ${e.message}`));
 await page.goto(`${BASE}/smoking/?capture=1&time=day&scene=lunch&${query}`);return {ctx,page};
}
const gateBox=page=>page.evaluate(()=>{const c=document.querySelector('.lg-age-card'),w=document.querySelector('.lg-age');if(!c)return null;const r=c.getBoundingClientRect();
 const small=[...c.querySelectorAll('button,input[type=text],.lg-age-check')].map(e=>e.getBoundingClientRect()).filter(b=>b.height<44).length;
 return {cardH:Math.round(r.height),bottom:Math.round(r.bottom),vh:innerHeight,fits:r.bottom<=innerHeight+1&&r.top>=0,wrapScroll:w.scrollHeight>w.clientHeight,small,mode:w.dataset.mode};});

// 1) 화면 크기별 안내 화면(점검 브라우저는 ?age=on일 때만 뜬다)
R.sizes={};
for(const [w,h] of [[360,640],[390,844],[844,390],[1920,1080]]){
 const {ctx,page}=await open(w,h,{query:'age=on'});
 await page.waitForSelector('.lg-age-card',{timeout:20000});await page.waitForTimeout(400);
 R.sizes[`${w}x${h}`]=await gateBox(page);await page.screenshot({path:`${OUT}/gate-${w}x${h}.png`});await ctx.close();
}

// 2) 미성년 → 막힘, 새로 열면 다시 물음 / 성인 → 들어감, 새로 열면 안 물음 / 설정에서 다시 보기
{
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push('flow '+e.message));
 const url=`${BASE}/smoking/?capture=1&time=day&scene=lunch&age=on`;
 await page.goto(url);await page.waitForSelector('#lg-age-y');
 const enterOff=await page.$eval('[data-age=enter]',b=>b.disabled);
 await page.fill('#lg-age-y','2012');await page.check('#lg-age-ok');await page.click('[data-age=enter]');
 await page.waitForTimeout(300);await page.screenshot({path:`${OUT}/gate-minor-390x844.png`});
 const minor={mode:await page.$eval('.lg-age',e=>e.dataset.mode),stored:await page.evaluate(()=>localStorage.getItem('lounge.age')),gameStarted:await page.evaluate(()=>!!window.lounge)};
 await page.reload();await page.waitForSelector('.lg-age-card');const minorAgain=await page.$eval('.lg-age',e=>e.dataset.mode);
 await page.fill('#lg-age-y','12');const badErr=await page.$eval('.lg-age-err',e=>e.textContent);
 await page.fill('#lg-age-y','2000');await page.check('#lg-age-ok');await page.click('[data-age=enter]');
 await page.waitForFunction(()=>window.lounge,null,{timeout:60000});
 const adult={stored:await page.evaluate(()=>localStorage.getItem('lounge.age')),gateGone:await page.evaluate(()=>!document.querySelector('.lg-age'))};
 await page.reload();await page.waitForFunction(()=>window.lounge,null,{timeout:60000});await page.waitForTimeout(500);
 const again=await page.evaluate(()=>!!document.querySelector('.lg-age'));
 // 로비(이름 정하기)는 안내 다음에 뜬다
 const lobbyAfter=await page.evaluate(()=>!!document.querySelector('[data-a=enter]'));
 await page.evaluate(()=>{document.querySelector('#lg-nick')&&(document.querySelector('#lg-nick').value='테스트');document.querySelector('.lg-modal [data-a=enter]')?.click();});
 await page.waitForTimeout(300);await page.evaluate(()=>{document.querySelector('.sp-panel [data-sp=close]')?.click();});
 await page.click('[data-a=set]');await page.click('[data-a=age]');await page.waitForTimeout(300);
 const read={shown:await page.evaluate(()=>!!document.querySelector('.lg-modal .lg-age-card')),inputs:await page.evaluate(()=>document.querySelectorAll('.lg-modal .lg-age-card input').length)};
 await page.screenshot({path:`${OUT}/gate-read-390x844.png`});
 await page.click('.lg-modal [data-a=close]');const closed=await page.evaluate(()=>document.querySelector('.lg-modal').hidden);
 R.flow={enterOffAtStart:enterOff,minor,minorAskedAgain:minorAgain==='ask',badErr,adult,askedAgainAfterAdult:again,lobbyAfter,read,readClosed:closed};
 await ctx.close();
}

// 3) 앉기·일어나기 단추·카메라 (휴대폰 세로·PC)
const INIT=`localStorage.setItem('online-smoking',${JSON.stringify(PROFILE)});localStorage.setItem('lounge.age',JSON.stringify({y:1990,ok:true,at:'2026-11-13'}));`;
R.sit={};
for(const [w,h,bi] of [[1920,1080,1],[390,844,0],[844,390,1]]){
 const {ctx,page}=await open(w,h,{init:INIT});
 await page.waitForFunction(()=>window.lounge,null,{timeout:60000});await page.waitForTimeout(800);
 const r=await page.evaluate(async bi=>{
  const L=window.lounge,b=L.rooftop.spots.benches[bi],V=L.ctx.THREE.Vector3,m=L.player.hiker.model,W=n=>m.getObjectByName('mixamorig'+n).getWorldPosition(new V());
  L.teleport(b.x,b.z,b.heading+Math.PI);L.setCam({yaw:b.heading+Math.PI,dist:L.cam.dist});await new Promise(r=>setTimeout(r,400)); // 벤치를 보고 걸어온 것처럼(카메라는 등 뒤)
  L.spots.sit();await new Promise(r=>setTimeout(r,2200));
  const hand=[...document.querySelectorAll('.sp-hand .lg-btn')].map(e=>({a:e.dataset.sp,label:e.getAttribute('aria-label'),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)}));
  const marks=[...document.querySelectorAll('.sp-mark')].filter(e=>e.style.visibility!=='hidden').map(e=>e.dataset.k+':'+e.getAttribute('aria-label'));
  const cp=L.ctx.camera.position,camD=Math.hypot(cp.x-L.player.x,cp.z-L.player.z),b2=L.rooftop.bounds;
  const k=W('LeftLeg'),hp=W('LeftUpLeg'),f=W('LeftFoot'),th=k.clone().sub(hp).normalize(),sh=f.clone().sub(k).normalize();
  return {seatY:b.seat.y,hipsY:+W('Hips').y.toFixed(3),knee:Math.round(Math.acos(th.dot(sh))*180/Math.PI),footY:+f.y.toFixed(3),hand,marks,camDist:+camD.toFixed(2),camInside:cp.x>b2.minX&&cp.x<b2.maxX&&cp.z>b2.minZ&&cp.z<b2.maxZ,pose:L.spots.pose};
 },bi);
 await page.screenshot({path:`${OUT}/sit-${w}x${h}.png`});
 await page.keyboard.press('KeyE');await page.waitForTimeout(500);r.afterE=await page.evaluate(()=>window.lounge.spots.pose);
 // 캔을 든 채 앉으면 일어나기·한 모금·캔 버리기 순서
 await page.evaluate(async()=>{const L=window.lounge;L.spots.act.sit?.();await new Promise(r=>setTimeout(r,1500));});
 r.withCan=await page.evaluate(async()=>{const L=window.lounge;L.spots.coffee();await new Promise(r=>setTimeout(r,9000));const b=L.rooftop.spots.benches[1]??L.rooftop.spots.benches[0];
  L.spots.go('bench',L.rooftop.spots.benches.indexOf(b));await new Promise(r=>setTimeout(r,9000));
  return {pose:L.spots.pose,held:L.spots.status().can.held,hand:[...document.querySelectorAll('.sp-hand .lg-btn')].map(e=>e.dataset.sp+':'+Math.round(e.getBoundingClientRect().width))};});
 await page.screenshot({path:`${OUT}/sit-can-${w}x${h}.png`});
 // 난간
 r.lean=await page.evaluate(async()=>{const L=window.lounge;L.spots.stand();const rb=L.rooftop.bounds;L.teleport(0,rb.minZ+.7,0);await new Promise(r=>setTimeout(r,300));L.spots.lean();await new Promise(r=>setTimeout(r,1200));
  return {pose:L.spots.pose,hand:[...document.querySelectorAll('.sp-hand .lg-btn')].map(e=>e.getAttribute('aria-label')),railMark:[...document.querySelectorAll('.sp-mark')].some(e=>e.dataset.k?.startsWith('rail'))};});
 R.sit[`${w}x${h}`]=r;await ctx.close();
}

// 4) NPC(?npc=1)가 벤치에 앉으면 같은 자세
{
 const {ctx,page}=await open(1280,800,{query:'npc=1',init:INIT});
 await page.waitForFunction(()=>window.lounge,null,{timeout:60000});
 const t0=Date.now();let npc=null;
 while(Date.now()-t0<90000){npc=await page.evaluate(()=>window.lounge.npcs.status().find(n=>n.pose==='sit'));if(npc)break;await page.waitForTimeout(1000);}
 if(npc){await page.waitForTimeout(1200);
  R.npc=await page.evaluate(async id=>{const L=window.lounge,n=L.npcs.avatars.find(a=>a.id===id)??L.npcs.avatars.find(a=>Math.hypot(a.x-L.npcs.status().find(s=>s.id===id).x,a.z-L.npcs.status().find(s=>s.id===id).z)<.01);
   const m=n.hiker.model,V=L.ctx.THREE.Vector3,W=k=>m.getObjectByName('mixamorig'+k).getWorldPosition(new V());
   const b=L.rooftop.spots.benches.reduce((p,c)=>Math.hypot(c.seat.x-n.x,c.seat.z-n.z)<Math.hypot(p.seat.x-n.x,p.seat.z-n.z)?c:p);
   const h=b.heading,fx=-Math.sin(h),fz=-Math.cos(h),ax=-Math.cos(h),az=Math.sin(h); // 벤치 앞·옆 방향
   L.teleport(b.seat.x+fx*.8+ax*1.1,b.seat.z+fz*.8+az*1.1,h);L.setCam({yaw:h+Math.PI-.35,dist:3.6,pitch:.3});
   await new Promise(r=>setTimeout(r,900));
   const k=W('LeftLeg'),hp=W('LeftUpLeg'),f=W('LeftFoot'),th=k.clone().sub(hp).normalize(),sh=f.clone().sub(k).normalize();
   const marks=[...document.querySelectorAll('.sp-mark')].filter(e=>e.style.visibility!=='hidden').map(e=>e.dataset.k);
   return {id,hipsY:+W('Hips').y.toFixed(3),knee:Math.round(Math.acos(th.dot(sh))*180/Math.PI),marks};},npc.id);
  await page.screenshot({path:`${OUT}/npc-sit.png`});}
 else R.npc={found:false};
 await ctx.close();
}
R.errors=errors;
writeFileSync(`${OUT}/result.json`,JSON.stringify(R,null,1));console.log(JSON.stringify(R,null,1));
await browser.close();
