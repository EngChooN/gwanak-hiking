// 산고르기-자유설정.html을 장면별로 띄워 찍고, 겹침·안전 영역·잘림·터치 크기·콘솔 오류를 검사한다.
// 사용: node capture.mjs [장면,장면...]   결과: ../shots-pick/*.png, ../shots-pick/audit.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
const OUT=here('../shots-pick/');mkdirSync(OUT,{recursive:true});
const URL0=pathToFileURL(here('../산고르기-자유설정.html')).href;
const SIZE={land:[844,390],port:[390,844],pc:[1440,900],wide:[1920,1080]};
const ALL=['pick-new','pick-done','pick-dev','pick-free','pick-locked','pick-many','game-settings','game-free','game-live','game-locked','game-dev','summit-unlock','map-done'];
const scenes=process.argv[2]?process.argv[2].split(','):ALL;
const times=process.argv[3]?process.argv[3].split(','):['day'];
const browser=await chromium.launch({channel:'chrome',headless:true});
const report=[];
for(const time of times)for(const scene of scenes)for(const dev of (process.argv[4]?process.argv[4].split(','):['land','port','pc'])){
 const [w,h]=SIZE[dev];
 const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:dev==='pc'?1:2});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${URL0}?solo=1&dev=${dev==='wide'?'pc':dev}${dev==='wide'?'&wide=1':''}&time=${time}&scene=${scene}`);
 await page.waitForTimeout(1400);   // 도장 찍힘 애니메이션이 끝날 때까지
 const audit=await page.evaluate(({dev})=>{
  const SAFE={land:{l:47,r:47,t:0,b:21},port:{l:0,r:0,t:47,b:34},pc:{l:0,r:0,t:0,b:0},wide:{l:0,r:0,t:0,b:0}}[dev];
  const root=document.querySelector('.dev').getBoundingClientRect(),W=root.width,H=root.height;
  const rel=e=>{const r=e.getBoundingClientRect();return {x:r.left-root.left,y:r.top-root.top,w:r.width,h:r.height,r:r.right-root.left,b:r.bottom-root.top};};
  const vis=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getBoundingClientRect().width>0;};
  const issues=[];
  // 1) 터치 크기 44
  for(const e of document.querySelectorAll('.dev .hit'))if(vis(e)){const r=rel(e);if(r.w<43.5||r.h<43.5)issues.push(`작은 버튼 ${Math.round(r.w)}×${Math.round(r.h)} "${e.textContent.trim().slice(0,16)}"`);}
  // 2) 안전 영역(누를 수 있는 것과 주요 덩어리) — 스크롤 목록 안의 잘린 카드는 제외하고 보이는 부분만
  const boxes=[...document.querySelectorAll('.dev .hit,.dev .pk-head,.dev .fs,.dev .sheet,.dev .dlg,.dev .devtag,.dev .toastt')].filter(vis);
  for(const e of boxes){const r=rel(e);const clip=e.parentElement?.closest('.pk-list,.fs,.sheet,.dlg');if(clip){const c=rel(clip);if(r.r>c.r+1||r.x<c.x-1||r.b>c.b+1||r.y<c.y-1)continue;}
   if(r.x<SAFE.l-.5||r.y<SAFE.t-.5||r.r>W-SAFE.r+.5||r.b>H-SAFE.b+.5)issues.push(`안전 영역 밖 "${(e.className.baseVal??e.className).slice(0,20)}" ${Math.round(r.x)},${Math.round(r.y)}–${Math.round(r.r)},${Math.round(r.b)}`);}
  // 3) 잘림: 글자 넘침(가로)과 창 내용 넘침(세로 스크롤 필요)
  for(const e of document.querySelectorAll('.dev .hit,.dev .mcard .name,.dev .mcard .course,.dev .facts b,.dev .tag,.dev .devtag,.dev .now .txt b'))if(vis(e)&&e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow!=='visible')issues.push(`글자 잘림 "${e.textContent.trim().slice(0,20)}"`);
  for(const e of document.querySelectorAll('.dev .hit'))if(vis(e)&&e.scrollWidth>e.getBoundingClientRect().width+2)issues.push(`버튼 글자 넘침 "${e.textContent.trim().slice(0,20)}"`);
  const scrolls=[];for(const e of document.querySelectorAll('.dev .fs,.dev .sheet,.dev .dlg,.dev .mcard'))if(vis(e)&&e.scrollHeight>e.clientHeight+2)scrolls.push(`${e.className.split(' ')[0]} +${e.scrollHeight-e.clientHeight}px`);
  // 4) 겹침: 산 고르기 화면의 덩어리끼리
  const listR=document.querySelector('.dev .pk-list')&&rel(document.querySelector('.dev .pk-list'));
  const blocks=[...document.querySelectorAll('.dev .pk-head,.dev .mcard,.dev .mslot,.dev>.hud>.abs:not(.fs) .devtag,.dev .pk-foot')].filter(vis).map(e=>{let r=rel(e);if(listR&&e.closest('.pk-list'))r={x:Math.max(r.x,listR.x),y:Math.max(r.y,listR.y),r:Math.min(r.r,listR.r),b:Math.min(r.b,listR.b)};return [e,r];});
  for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++){const [a,A]=blocks[i],[b,B]=blocks[j];if(a.contains(b)||b.contains(a))continue;
   const ox=Math.min(A.r,B.r)-Math.max(A.x,B.x),oy=Math.min(A.b,B.b)-Math.max(A.y,B.y);if(ox>1&&oy>1)issues.push(`겹침 ${a.className.split(' ')[0]} × ${b.className.split(' ')[0]}`);}
  // 카드 안 버튼끼리
  for(const c of document.querySelectorAll('.dev .mcard,.dev .fs,.dev .sheet,.dev .dlg')){const hs=[...c.querySelectorAll('.hit')].filter(vis).map(e=>[e,rel(e)]);
   for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++){const [a,A]=hs[i],[b,B]=hs[j];if(a.contains(b)||b.contains(a))continue;const ox=Math.min(A.r,B.r)-Math.max(A.x,B.x),oy=Math.min(A.b,B.b)-Math.max(A.y,B.y);if(ox>1&&oy>1)issues.push(`버튼 겹침 "${a.textContent.trim().slice(0,10)}" × "${b.textContent.trim().slice(0,10)}"`);}}
  return {issues,scrolls};
 },{dev});
 const file=`${dev}-${time}-${scene}.png`;
 await page.locator('.dev').screenshot({path:OUT+file});
 report.push({file,errors,...audit});
 await page.close();
}
// 도장 견본 보드
{const page=await browser.newPage({viewport:{width:1500,height:900}});await page.goto(`${URL0}?solo=1&scene=seal`);await page.waitForTimeout(500);await page.locator('#sealboard').screenshot({path:OUT+'seal-board.png'});await page.close();}
await browser.close();
writeFileSync(OUT+'audit.json',JSON.stringify(report,null,1));
const bad=report.filter(r=>r.issues.length||r.errors.length);
console.log(`찍은 장면 ${report.length} · 문제 있는 장면 ${bad.length}`);
for(const r of bad)console.log(r.file,'\n  ',[...r.errors,...r.issues].join('\n   '));
for(const r of report)if(r.scrolls.length)console.log('스크롤',r.file,r.scrolls.join(', '));
