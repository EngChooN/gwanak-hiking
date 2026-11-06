// 아이폰 세로(390×844)·가로(844×390)에서 책갈피 탭 5개·시점 칩·도장·도장 둘레 칩이 안전 영역 안에 보이고 눌리는지 확인한다(2026-11-06).
// 헤드리스 WebKit은 env(safe-area-inset-*)가 0이라 아이폰 13 노치·홈 막대 값을 HUD 변수(--sl·--sr·--st·--sb)로 넣어 흉내 낸다.
// 사용: npm run preview(4173) → node scripts/verify-mobile-buttons.mjs  · 결과: artifacts/mobile-buttons/
import {webkit,devices} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BASE_URL??'http://127.0.0.1:4173/',out=process.env.OUT??'artifacts/mobile-buttons';mkdirSync(out,{recursive:true});
const VIEWS=[['portrait',{width:390,height:844},{sl:0,sr:0,st:47,sb:34}],['landscape',{width:844,height:390},{sl:47,sr:47,st:0,sb:21}]];
const browser=await webkit.launch({headless:true}),report={};let failed=0;
for(const [name,viewport,safe] of VIEWS){
 const context=await browser.newContext({...devices['iPhone 13'],viewport,screen:viewport});
 await context.addInitScript(()=>localStorage.setItem('gwanak-sound-enabled','false'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?start=entrance&time=11:00&weather=clear');
 await page.waitForFunction(()=>window.hiking?.started===true,null,{timeout:300000});
 await page.addStyleTag({content:`:root{--sl:${safe.sl}px!important;--sr:${safe.sr}px!important;--st:${safe.st}px!important;--sb:${safe.sb}px!important}#resume-note{display:none!important}`});
 await page.waitForTimeout(1500);
 const check=await page.evaluate(safe=>{
  const sel=['#map-toggle','#stamps','[data-tab=backpack]','[data-tab=rest]','[data-tab=settings]','#view','#auto','#run','#binoculars','#phone'];
  const box={l:safe.sl,t:safe.st,r:innerWidth-safe.sr,b:innerHeight-safe.sb};
  const rows=sel.map(s=>{const el=document.querySelector(s);if(!el)return {sel:s,missing:true};const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
   const visible=r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden';
   const inside=r.left>=box.l-.5&&r.top>=box.t-.5&&r.right<=box.r+.5&&r.bottom<=box.b+.5;
   const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),tappable=!!hit&&(hit===el||el.contains(hit));
   return {sel:s,rect:[r.left,r.top,r.width,r.height].map(Math.round),visible,inside,tappable,size:Math.round(Math.min(r.width,r.height))};});
  // 도장·칩은 원이라 원끼리 거리로, 나머지는 사각형으로 겹침을 본다.
  const round=s=>['#auto','#run','#binoculars','#phone'].includes(s);
  const overlaps=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i].rect,b=rows[j].rect;if(!a||!b)continue;
   if(round(rows[i].sel)&&round(rows[j].sel)){const d=Math.hypot(a[0]+a[2]/2-b[0]-b[2]/2,a[1]+a[3]/2-b[1]-b[3]/2);if(d<(Math.min(a[2],a[3])+Math.min(b[2],b[3]))/2)overlaps.push([rows[i].sel,rows[j].sel]);continue;}
   if(a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1])overlaps.push([rows[i].sel,rows[j].sel]);}
  return {rows,overlaps};
 },safe);
 // 시점 칩을 실제로 눌러 1인칭↔3인칭이 바뀌는지
 const v0=await page.evaluate(()=>hiking.snapshot().view);await page.tap('#view');await page.waitForTimeout(400);const v1=await page.evaluate(()=>hiking.snapshot().view);
 const label=await page.evaluate(()=>document.querySelector('#view span').textContent);
 await page.waitForTimeout(800);
 await page.screenshot({path:`${out}/${name}.png`});
 await page.tap('#view');await page.waitForTimeout(300);
 // 구간 이동(개발용): 설정 탭 → 구간 이동 → 목록이 보이는지
 await page.tap('[data-tab=settings]');await page.waitForTimeout(300);
 const jumpBtn=await page.evaluate(()=>{const b=document.querySelector('#section-jump .sj-toggle');const r=b?.getBoundingClientRect();return !!r&&r.width>0&&r.height>0&&!document.querySelector('#section-jump').hidden;});
 if(jumpBtn){await page.tap('#section-jump .sj-toggle');await page.waitForTimeout(300);}
 const jumpList=await page.evaluate(()=>[...document.querySelectorAll('.nb-jump [data-jump]')].filter(b=>b.getBoundingClientRect().height>0).length);
 await page.screenshot({path:`${out}/${name}-jump.png`});
 const bad=check.rows.filter(r=>r.missing||!r.visible||!r.inside||!r.tappable||r.size<40);
 const viewToggled=v0!==v1;if(bad.length||check.overlaps.length||!viewToggled||errors.length||!jumpBtn||!jumpList)failed++;
 report[name]={safe,jumpBtn,jumpList,viewBefore:v0,viewAfter:v1,viewToggled,label,bad,overlaps:check.overlaps,rows:check.rows,errors};
 console.log(name,'시점',v0,'→',v1,'라벨',label,'| 문제',bad.map(b=>b.sel+(b.missing?' 없음':!b.visible?' 안보임':!b.inside?' 안전영역밖':!b.tappable?' 가려짐':' 작음')),'| 겹침',check.overlaps,'| 오류',errors,'| 구간 이동',jumpBtn,jumpList+'곳');
 await context.close();
}
await browser.close();
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,1));
process.exit(failed?1:0);
