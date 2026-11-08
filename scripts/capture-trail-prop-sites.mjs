// 새 즐길거리 자리 촬영(2026-11-07 산풍경). 개발 서버(vite)를 띄운 뒤:
//   node scripts/capture-trail-prop-sites.mjs [http://127.0.0.1:5341] [출력 폴더] [id,id,...] [--size 1280x800]
// 자리 조금 앞 코스에 서서(이어하기 저장), 코스 뒤쪽 높은 곳에서 소품을 내려다보는 고정 카메라로 찍는다.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const argv=process.argv.slice(2),opt={},pos=[];for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--'))opt[argv[i].slice(2)]=argv[++i];else pos.push(argv[i]);}
const [base='http://127.0.0.1:5341',out='artifacts/trail-prop-sites-2026-11-07',list='bench-880,bench-2830,bench-3875']=pos,[vw,vh]=(opt.size??'1280x800').split('x').map(Number);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
let template,sites;{const ctx=await browser.newContext({viewport:{width:640,height:400}});const page=await ctx.newPage();await page.goto(`${base}/hiking/?start=entrance&quality=low`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.trail,null,{timeout:300000});
 ({template,sites}=await page.evaluate(async()=>{const {initialState}=await import('/src/movement.js');return {template:initialState({start:'demo'}),sites:window.hiking.trail.status().sites};}));await ctx.close();}
const results={};
for(const id of list.split(',')){
 const site=sites.find(s=>s.id===id);if(!site){console.error('자리 없음',id);continue;}
 const ctx=await browser.newContext({viewport:{width:vw,height:vh},deviceScaleFactor:1});
 const save=JSON.stringify({...template,s:Math.max(0,site.m-3),lateral:0,zone:'route',view:'third'});
 await ctx.addInitScript(save=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hiking:v1',save);},save);
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/hiking/?time=11:00&weather=clear&season=summer&quality=high`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:300000});
 await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.dispatchEvent(new CustomEvent('hiking:hud-toggle'));});
 await page.addStyleTag({content:'#section-jump{display:none!important}'});
 await page.evaluate(()=>window.hiking.chunks.ready());
 await page.waitForFunction(id=>window.hiking.trail.status().sites.find(s=>s.id===id)?.loaded,id,{timeout:60000});
 // 카메라: 소품에서 길 반대쪽으로 4m·코스 뒤로 4m·땅 위 2.4m, 소품 좌석 높이를 본다
 const cam=await page.evaluate(async site=>{const {routeMeasure}=await import('/assets/realistic/interaction-sites.js');const me=routeMeasure(window.__landscape.route),H=window.__surface;
  const n=me.nearest(site.x,site.z),p=me.at(n.m),back=me.at(n.m-5),sx=site.x-p.x,sz=site.z-p.z,l=Math.hypot(sx,sz)||1;
  const cx=back.x-sx/l*2.5,cz=back.z-sz/l*2.5,cy=H(cx,cz)+2.3;
  window.hiking.cameraOverride={p:[cx,cy,cz],t:[site.x,site.y+.35,site.z],fov:50};return {p:[cx,cy,cz],m:n.m};},site);
 await page.waitForTimeout(2500);
 const file=`${out}/${id}.png`;await page.screenshot({path:file});
 results[id]={file,site,cam,errors};console.log(id,site.m,file,errors.length?errors:'');
 await ctx.close();
}
await browser.close();
writeFileSync(`${out}/captures.json`,JSON.stringify(results,null,1));
